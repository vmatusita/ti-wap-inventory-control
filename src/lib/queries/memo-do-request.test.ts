import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  RECORTE_UNIVERSAL,
  chaveDasUnidades,
  efetivar,
  recorteDe,
  type UnidadesEfetivas,
} from '@/lib/auth/recorte-leitura'
import type { PapelUsuario } from '@/lib/auth/papeis'
import { selecaoDeUnidadesPorSlug, type SelecaoDeUnidadesPorSlug } from '@/lib/filtros/filial'
import { memoizarPorUnidades } from '@/lib/queries/memo-do-request'

// F60 · fato 12 — UMA leitura de conflitos por request, provada sem banco (PLAN §10, decisão 6).
//
// Três afirmações, na ordem em que uma dependeria da outra:
//  (i)  as unidades que o LAYOUT do grupo `(app)` monta e as que a PÁGINA do dashboard monta são
//       objetos DIFERENTES (a premissa do fato 12) com a MESMA chave (`Object.is`), para os quatro
//       cargos — e a chave não colapsa vistas que pedem leituras diferentes;
//  (ii) com uma memória por request que segue a regra do React, layout + página disparam UMA
//       leitura; outro request, outra leitura;
//  (iii) SABOTAGEM I, documentada: memoizar pelo OBJETO cru (o `cache(contarConflitosAbertos)`
//       ingênuo) dá DUAS leituras. A execução em que a chave de `chaveDasUnidades` foi trocada pelo
//       objeto e (i)/(ii) ficaram vermelhos está gravada na evidência da fase.
//
// O `cache()` do React não memoiza no Vitest — o build padrão do pacote `react` o implementa como
// repasse, e só o build `react-server`, dentro de um render, guarda alguma coisa. Por isso a regra
// é SIMULADA aqui, e só no que interessa: memória por request, própria de cada `cache()`,
// argumentos comparados por `Object.is` (doc oficial, `reference/react/cache.md`), e nenhuma
// memória fora de um request. Filiais 100% fictícias.

// ---------------------------------------------------------------------------
// A regra do React, simulada
// ---------------------------------------------------------------------------

type Entrada = { readonly args: readonly unknown[]; readonly valor: unknown }
let requestAtual: Map<object, Entrada[]> | null = null

function cacheComoOReact<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  // Cada `cache()` tem memória PRÓPRIA — a identidade da chamada é a chave do mapa do request.
  const identidade = {}
  return (...args: A): R => {
    if (requestAtual === null) return fn(...args) // fora de request: repasse, como o React
    let entradas = requestAtual.get(identidade)
    if (entradas === undefined) requestAtual.set(identidade, (entradas = []))
    const achada = entradas.find(
      (e) => e.args.length === args.length && e.args.every((a, i) => Object.is(a, args[i])),
    )
    if (achada !== undefined) return achada.valor as R
    const valor = fn(...args)
    entradas.push({ args, valor })
    return valor
  }
}

async function emUmRequest<T>(corpo: () => Promise<T>): Promise<T> {
  requestAtual = new Map()
  try {
    return await corpo()
  } finally {
    requestAtual = null
  }
}

// ---------------------------------------------------------------------------
// As duas montagens de hoje — layout e página
// ---------------------------------------------------------------------------

// Ordenadas por NOME, como `listarFiliais` as entrega.
const FILIAIS = [
  { id: 11, slug: 'alfa', nome: 'Alfa', cidade: '' },
  { id: 12, slug: 'bravo', nome: 'Bravo', cidade: '' },
  { id: 13, slug: 'charlie', nome: 'Charlie', cidade: '' },
] as const

type Operador = { readonly papel: PapelUsuario; readonly escopoEscrita: readonly number[] }

const CARGOS: [string, Operador][] = [
  ['dev', { papel: 'dev', escopoEscrita: [11, 12, 13] }],
  ['admin', { papel: 'admin', escopoEscrita: [11, 12, 13] }],
  // Vínculo em DUAS filiais, fora da ordem do nome — o caminho que monta uma LISTA.
  ['operador com vínculo', { papel: 'operador', escopoEscrita: [13, 11] }],
  ['consulta', { papel: 'consulta', escopoEscrita: [] }],
]

const TODAS_POR_SLUG: SelecaoDeUnidadesPorSlug = { familia: 'slug', modo: 'todas' }

/** `(app)/layout.tsx` — o selo: a lista lida, ou `todas` quando ela veio vazia. */
function unidadesComoOLayout(
  operador: Operador,
  filiais: readonly (typeof FILIAIS)[number][],
): UnidadesEfetivas<'slug'> {
  return efetivar(
    recorteDe(operador),
    filiais.length > 0 ? selecaoDeUnidadesPorSlug(undefined, operador, filiais) : TODAS_POR_SLUG,
  )
}

/** `(app)/page.tsx` — o card de Pendências: a seleção sobre a lista lida (o `catch` dá `todas`). */
function unidadesComoAPagina(
  operador: Operador,
  filiais: readonly (typeof FILIAIS)[number][] | 'falhou',
): UnidadesEfetivas<'slug'> {
  return filiais === 'falhou'
    ? efetivar(recorteDe(operador), TODAS_POR_SLUG)
    : efetivar(recorteDe(operador), selecaoDeUnidadesPorSlug(undefined, operador, filiais))
}

const semEspaco = (s: string) => s.replace(/\s+/g, '')

describe('(i) a chave das unidades — primitiva, igual no layout e na página', () => {
  it('a réplica das duas montagens é a do código de hoje (guarda do próprio teste)', () => {
    // Se o layout ou a página mudarem a montagem, esta réplica deixa de provar o request real.
    const layout = semEspaco(readFileSync(join(process.cwd(), 'src/app/(app)/layout.tsx'), 'utf8'))
    const pagina = semEspaco(readFileSync(join(process.cwd(), 'src/app/(app)/page.tsx'), 'utf8'))
    expect(layout).toContain('efetivar(recorteDe(operador),filiaisDoShell.length>0?selecaoDeUnidadesPorSlug(undefined,operador,filiaisDoShell)')
    expect(layout).toContain('contarConflitosAbertos(unidadesDoSelo)')
    expect(pagina).toContain('efetivar(recorteDe(operador),selecaoDeUnidadesPorSlug(undefined,operador,fs))')
    expect(pagina).toContain(".catch(()=>efetivar(recorteDe(operador),{familia:'slug',modo:'todas'}))")
    expect(pagina).toContain('contarConflitosAbertos(unidadesDoOperador)')
  })

  it.each(CARGOS)('%s: objetos diferentes, chaves Object.is-iguais', (_cargo, operador) => {
    const doLayout = unidadesComoOLayout(operador, FILIAIS)
    const daPagina = unidadesComoAPagina(operador, FILIAIS)
    // A premissa do fato 12: `efetivar` embrulha um objeto novo a cada chamada.
    expect(Object.is(doLayout, daPagina)).toBe(false)
    const chave = chaveDasUnidades(doLayout)
    expect(typeof chave).toBe('string')
    expect(Object.is(chave, chaveDasUnidades(daPagina))).toBe(true)
  })

  it.each(CARGOS)('%s: com a leitura de filiais falhando nos dois, as chaves também batem', (_cargo, operador) => {
    const doLayout = unidadesComoOLayout(operador, []) // o `catch` do layout devolve lista vazia
    const daPagina = unidadesComoAPagina(operador, 'falhou')
    expect(Object.is(chaveDasUnidades(doLayout), chaveDasUnidades(daPagina))).toBe(true)
  })

  it('a ordem dos valores não muda a chave (a lista é conjunto)', () => {
    const porSlugs = (slugs: string[]) =>
      efetivar(RECORTE_UNIVERSAL, { familia: 'slug', modo: 'lista', slugs, incluiSemUnidade: false })
    expect(chaveDasUnidades(porSlugs(['charlie', 'alfa']))).toBe(chaveDasUnidades(porSlugs(['alfa', 'charlie'])))
    const porIds = (ids: number[]) => efetivar(RECORTE_UNIVERSAL, { familia: 'id', modo: 'lista', ids })
    // Número por VALOR, não por texto: `[10, 9]` e `[9, 10]` são a mesma lista.
    expect(chaveDasUnidades(porIds([10, 9]))).toBe(chaveDasUnidades(porIds([9, 10])))
  })

  it('vistas que pedem leituras diferentes têm chaves diferentes (a chave não colapsa)', () => {
    // Sem esta asserção, uma chave CONSTANTE deixaria (i) e (ii) verdes — e serviria o selo de
    // uma filial para a outra.
    const slug = (slugs: string[], incluiSemUnidade = false) =>
      efetivar(RECORTE_UNIVERSAL, { familia: 'slug', modo: 'lista', slugs, incluiSemUnidade })
    const vistas = [
      efetivar(RECORTE_UNIVERSAL, TODAS_POR_SLUG),
      efetivar(RECORTE_UNIVERSAL, { familia: 'id', modo: 'todas' }),
      slug([]), // `nenhuma`
      slug([], true), // `somente-sem-unidade`
      slug(['alfa']),
      slug(['alfa'], true),
      slug(['alfa', 'bravo']),
      slug(['a,b']),
      slug(['a', 'b']),
      slug(['1']),
      efetivar(RECORTE_UNIVERSAL, { familia: 'id', modo: 'lista', ids: [1] }),
    ]
    const chaves = vistas.map((u) => chaveDasUnidades(u))
    expect(new Set(chaves).size).toBe(chaves.length)
  })
})

describe('(ii) a memória por request — UMA leitura de conflitos para layout + página', () => {
  const novoContador = () => {
    const leitor = vi.fn(async (unidades: UnidadesEfetivas<'slug'>) => {
      void unidades
      return 2
    })
    // O armazém nasce UMA vez, como o `cache(() => new Map())` no escopo de `queries/conflitos.ts`.
    const armazem = cacheComoOReact((): Map<string, Promise<number>> => new Map())
    return { leitor, contar: memoizarPorUnidades(armazem, leitor) }
  }

  it.each(CARGOS)('%s: no mesmo request, uma leitura — feita pelo objeto recebido', async (_cargo, operador) => {
    const { leitor, contar } = novoContador()
    const doLayout = unidadesComoOLayout(operador, FILIAIS)
    const daPagina = unidadesComoAPagina(operador, FILIAIS)
    // No mesmo `Promise.all`: a segunda chamada chega com a primeira ainda em voo.
    const [selo, card] = await emUmRequest(() => Promise.all([contar(doLayout), contar(daPagina)]))
    expect(leitor).toHaveBeenCalledTimes(1)
    // A leitura recebe o objeto que CHEGOU — nenhum `UnidadesEfetivas` reconstruído fora de `efetivar`.
    expect(leitor.mock.calls[0][0]).toBe(doLayout)
    expect([selo, card]).toEqual([2, 2])
  })

  it('outro request, outra leitura — a memória não é global', async () => {
    const { leitor, contar } = novoContador()
    const [, operador] = CARGOS[2]
    await emUmRequest(() => contar(unidadesComoOLayout(operador, FILIAIS)))
    await emUmRequest(() => contar(unidadesComoAPagina(operador, FILIAIS)))
    expect(leitor).toHaveBeenCalledTimes(2)
  })

  it('no mesmo request, vistas diferentes leem cada uma a sua', async () => {
    const { leitor, contar } = novoContador()
    const [, admin] = CARGOS[1]
    const [, operador] = CARGOS[2]
    await emUmRequest(() =>
      Promise.all([contar(unidadesComoOLayout(admin, FILIAIS)), contar(unidadesComoOLayout(operador, FILIAIS))]),
    )
    expect(leitor).toHaveBeenCalledTimes(2)
  })

  it('fora de um request não há memória (o repasse do React)', async () => {
    const { leitor, contar } = novoContador()
    const [, operador] = CARGOS[0]
    const u = unidadesComoOLayout(operador, FILIAIS)
    await contar(u)
    await contar(u)
    expect(leitor).toHaveBeenCalledTimes(2)
  })
})

describe('(iii) SABOTAGEM I, documentada — o objeto cru como chave', () => {
  it('a simulação memoiza a MESMA referência (guarda: sem isto, o vermelho abaixo não provaria nada)', async () => {
    const leitor = vi.fn(async (unidades: UnidadesEfetivas<'slug'>) => {
      void unidades
      return 2
    })
    const contarPeloObjeto = cacheComoOReact(leitor)
    const u = unidadesComoOLayout(CARGOS[0][1], FILIAIS)
    await emUmRequest(() => Promise.all([contarPeloObjeto(u), contarPeloObjeto(u)]))
    expect(leitor).toHaveBeenCalledTimes(1)
  })

  it.each(CARGOS)('%s: `cache(contarConflitosAbertos)` pelo objeto dá DUAS leituras no mesmo request', async (_cargo, operador) => {
    const leitor = vi.fn(async (unidades: UnidadesEfetivas<'slug'>) => {
      void unidades
      return 2
    })
    // O memo ingênuo: o argumento-objeto É a chave. Layout e página nunca passam a mesma referência.
    const contarPeloObjeto = cacheComoOReact(leitor)
    await emUmRequest(() =>
      Promise.all([
        contarPeloObjeto(unidadesComoOLayout(operador, FILIAIS)),
        contarPeloObjeto(unidadesComoAPagina(operador, FILIAIS)),
      ]),
    )
    expect(leitor).toHaveBeenCalledTimes(2)
  })
})
