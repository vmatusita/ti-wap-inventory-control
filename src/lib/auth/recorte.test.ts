import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  efetivar,
  lerUnidades,
  RECORTE_UNIVERSAL,
  recorteDe,
  type RecorteDeLeitura,
  type UnidadesEfetivas,
} from '@/lib/auth/recorte-leitura'
import type { SelecaoDeUnidades, SelecaoDeUnidadesPorSlug } from '@/lib/filtros/filial'
import { limpar } from '@/lib/use-server-exports'

// F57 · Frente A — o recorte de leitura e o tipo que só `efetivar` produz.
//
// O molde é o de `src/lib/escopo/pertencimento.test.ts`: uma parte prova a FORMA (aqui, pelo
// compilador — os `@ts-expect-error` abaixo são verificados pelo `npx tsc --noEmit`, que
// reprova um `@ts-expect-error` que deixou de ter erro), outra prova o EFEITO (a interseção
// corta quando o recorte é restrito) e a terceira prova o NO-OP (com o recorte de hoje, nada
// muda). Filiais 100% fictícias.

const TODAS_POR_ID: SelecaoDeUnidades = { familia: 'id', modo: 'todas' }
const TODAS_POR_SLUG: SelecaoDeUnidadesPorSlug = { familia: 'slug', modo: 'todas' }

const porId = (ids: number[]): SelecaoDeUnidades => ({ familia: 'id', modo: 'lista', ids })
const porSlug = (slugs: string[], incluiSemUnidade = false): SelecaoDeUnidadesPorSlug => ({
  familia: 'slug',
  modo: 'lista',
  slugs,
  incluiSemUnidade,
})

// Um recorte que a produção NUNCA produz hoje — é ele que prova que `efetivar` compara.
const RESTRITO: RecorteDeLeitura = {
  alcance: 'restrito',
  unidades: [
    { id: 1, slug: 'alfa' },
    { id: 2, slug: 'bravo' },
  ],
  alcancaSemUnidade: false,
}
const RESTRITO_COM_CONSOLIDADO: RecorteDeLeitura = { ...RESTRITO, alcancaSemUnidade: true }

describe('UnidadesEfetivas é NOMINAL — não existe caminho de tipo que não passe por efetivar', () => {
  it('as provas de tipo compilam só com os erros esperados (conferido pelo tsc)', () => {
    // @ts-expect-error — objeto literal com a forma da vista não é UnidadesEfetivas
    const porLiteral: UnidadesEfetivas = { modo: 'todas' }
    // @ts-expect-error — `as` direto não converte: os dois tipos não se sobrepõem
    const porAs = { modo: 'todas' } as UnidadesEfetivas
    // @ts-expect-error — number[] não é UnidadesEfetivas
    const porLista: UnidadesEfetivas = [1, 2]
    // @ts-expect-error — nem a lista VAZIA, que é o valor que esta fase proíbe de dizer "tudo"
    const vaziaPorAs = [] as UnidadesEfetivas
    // @ts-expect-error — nem a outra família: slug não passa por id
    const trocada: UnidadesEfetivas<'slug'> = efetivar(RECORTE_UNIVERSAL, TODAS_POR_ID)
    void [porLiteral, porAs, porLista, vaziaPorAs, trocada]
    expect(true).toBe(true)
  })

  // A varredura roda UMA vez, na coleta, e não no corpo do `it`: ler e limpar `src/` + `scripts/`
  // sob a carga da suíte inteira chega perto do tempo-limite de 5 s (`chave-versao-sql.test.ts` o
  // estourou no fechamento da F57 pelo mesmo motivo).
  const culpadosDaDuplaAssercao = (() => {
    // `x as unknown as UnidadesEfetivas` e `{} as UnidadesEfetivas` compilam — o TypeScript
    // permite converter a partir de `unknown` e de `{}`. Fecha-se aqui, por fonte: nenhum
    // arquivo além do próprio módulo (e deste teste, que é a prova) escreve `as
    // UnidadesEfetivas`. Comentários e strings não contam (`limpar`).
    const raiz = process.cwd()
    const culpados: string[] = []
    const permitidos = new Set([
      'src/lib/auth/recorte-leitura.ts',
      'src/lib/auth/recorte.test.ts',
    ])
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        if (nome === 'node_modules' || nome.startsWith('.')) continue
        const caminho = join(dir, nome)
        if (statSync(caminho).isDirectory()) varrer(caminho)
        else if (/\.(ts|tsx|mts)$/.test(nome)) {
          const rel = relative(raiz, caminho).replaceAll('\\', '/')
          if (permitidos.has(rel)) continue
          const fonte = limpar(readFileSync(caminho, 'utf8'), true)
          if (/\bas\s+(?:unknown\s+as\s+)?UnidadesEfetivas\b/.test(fonte)) culpados.push(rel)
        }
      }
    }
    varrer(join(raiz, 'src'))
    varrer(join(raiz, 'scripts'))
    return culpados
  })()

  it('a dupla asserção (a única fuga que o TypeScript não fecha) não aparece fora do módulo', () => {
    expect(culpadosDaDuplaAssercao).toEqual([])
  })

  it('lista vazia NÃO significa "tudo": vira `nenhuma`, com nome', () => {
    expect(lerUnidades(efetivar(RECORTE_UNIVERSAL, porId([])))).toEqual({ modo: 'nenhuma' })
    expect(lerUnidades(efetivar(RECORTE_UNIVERSAL, porSlug([])))).toEqual({ modo: 'nenhuma' })
    // …e "todas" só existe quando foi pedido por nome.
    expect(lerUnidades(efetivar(RECORTE_UNIVERSAL, TODAS_POR_ID))).toEqual({ modo: 'todas' })
  })
})

describe('efetivar é uma INTERSEÇÃO de verdade — alimentada com um recorte restrito, ela corta', () => {
  it('lista ∩ recorte: fica só o que o recorte alcança', () => {
    expect(lerUnidades(efetivar(RESTRITO, porId([2, 3])))).toEqual({
      modo: 'lista',
      valores: [2],
      incluiSemUnidade: false,
    })
  })

  it('`todas` ∩ recorte restrito = as unidades do recorte, e não "todas"', () => {
    expect(lerUnidades(efetivar(RESTRITO, TODAS_POR_ID))).toEqual({
      modo: 'lista',
      valores: [1, 2],
      incluiSemUnidade: false,
    })
    expect(lerUnidades(efetivar(RESTRITO, TODAS_POR_SLUG))).toEqual({
      modo: 'lista',
      valores: ['alfa', 'bravo'],
      incluiSemUnidade: false,
    })
  })

  it('interseção vazia é `nenhuma` — o fail-open que a fase fecha', () => {
    expect(lerUnidades(efetivar(RESTRITO, porId([3, 4])))).toEqual({ modo: 'nenhuma' })
    expect(lerUnidades(efetivar(RESTRITO, porSlug(['charlie'])))).toEqual({ modo: 'nenhuma' })
  })

  it('a família por slug intersecta pelo SLUG', () => {
    expect(lerUnidades(efetivar(RESTRITO, porSlug(['bravo', 'charlie'])))).toEqual({
      modo: 'lista',
      valores: ['bravo'],
      incluiSemUnidade: false,
    })
  })

  it('o terceiro valor também passa pelo recorte: sem alcance, o consolidado cai', () => {
    // Pedido: consolidado + bravo. O recorte não alcança linha sem unidade → só bravo.
    expect(lerUnidades(efetivar(RESTRITO, porSlug(['bravo'], true)))).toEqual({
      modo: 'lista',
      valores: ['bravo'],
      incluiSemUnidade: false,
    })
    // Com alcance, fica.
    expect(lerUnidades(efetivar(RESTRITO_COM_CONSOLIDADO, porSlug(['bravo'], true)))).toEqual({
      modo: 'lista',
      valores: ['bravo'],
      incluiSemUnidade: true,
    })
    // Só o consolidado, com e sem alcance.
    expect(lerUnidades(efetivar(RESTRITO_COM_CONSOLIDADO, porSlug([], true)))).toEqual({
      modo: 'somente-sem-unidade',
    })
    expect(lerUnidades(efetivar(RESTRITO, porSlug([], true)))).toEqual({ modo: 'nenhuma' })
  })
})

describe('o NO-OP de hoje: com o recorte universal, a seleção passa inteira', () => {
  it('recorteDe devolve o universal para todo cargo e para a sessão sem perfil', () => {
    for (const papel of ['dev', 'admin', 'operador', 'consulta'] as const) {
      expect(recorteDe({ papel })).toBe(RECORTE_UNIVERSAL)
    }
    expect(recorteDe(null)).toBe(RECORTE_UNIVERSAL)
    expect(recorteDe(undefined)).toBe(RECORTE_UNIVERSAL)
  })

  it('a lista pedida passa inteira, na ordem da URL, sem repetição', () => {
    expect(lerUnidades(efetivar(recorteDe({ papel: 'operador' }), porId([4, 2, 4])))).toEqual({
      modo: 'lista',
      valores: [4, 2],
      incluiSemUnidade: false,
    })
  })

  it('o consolidado de /relatorios/gerados sobrevive: com e sem filiais, e sozinho', () => {
    const universal = recorteDe(null)
    expect(lerUnidades(efetivar(universal, TODAS_POR_SLUG))).toEqual({ modo: 'todas' })
    expect(lerUnidades(efetivar(universal, porSlug(['bravo'], true)))).toEqual({
      modo: 'lista',
      valores: ['bravo'],
      incluiSemUnidade: true,
    })
    expect(lerUnidades(efetivar(universal, porSlug([], true)))).toEqual({
      modo: 'somente-sem-unidade',
    })
  })

  it('não escreve na seleção de quem chamou, e o que devolve não se deixa alterar', () => {
    const ids = [3, 1]
    const u = efetivar(RECORTE_UNIVERSAL, porId(ids))
    expect(ids).toEqual([3, 1])
    const vista = lerUnidades(u)
    expect(Object.isFrozen(vista)).toBe(true)
    if (vista.modo === 'lista') expect(Object.isFrozen(vista.valores)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// F57 · lote 4 — a PRESENÇA: o ponto de injeção é usado de verdade
// ---------------------------------------------------------------------------
// O teste de EFEITO acima prova que `efetivar` corta quando o recorte é restrito. O que ele não
// prova é que as CHAMADAS passam o recorte da sessão: bastaria um `efetivar(RECORTE_UNIVERSAL, …)`
// numa página para a virada da F70/F72 não chegar ali — o tipo compila, a tela funciona, e o
// recorte de empresa some em silêncio naquele ponto. É a outra metade da fechadura no-op (a mesma
// divisão PRESENÇA × EFEITO de `escopo/pertencimento.test.ts`).

describe('o recorte da sessão chega a toda chamada de efetivar (PRESENÇA)', () => {
  const raiz = process.cwd()
  const modulo = 'src/lib/auth/recorte-leitura.ts'
  const posix = (p: string) => relative(raiz, p).split(/[\\/]/).join('/')

  const fontes = (dir: string, saida: string[] = []): string[] => {
    for (const nome of readdirSync(dir)) {
      if (nome === 'node_modules' || nome.startsWith('.')) continue
      const caminho = join(dir, nome)
      if (statSync(caminho).isDirectory()) fontes(caminho, saida)
      else if (/\.(ts|tsx|mts)$/.test(nome) && !/\.test\.(ts|tsx|mts)$/.test(nome)) saida.push(caminho)
    }
    return saida
  }
  const producao = [...fontes(join(raiz, 'src')), ...fontes(join(raiz, 'scripts'))].filter(
    (p) => posix(p) !== modulo,
  )
  // Cada fonte é lida e limpa UMA vez, na coleta, e não no corpo de cada `it`: quatro varreduras de
  // `src/` + `scripts/` sob a carga da suíte inteira chegam perto do tempo-limite de 5 s
  // (`chave-versao-sql.test.ts` o estourou no fechamento da F57 pelo mesmo motivo).
  const limpas = new Map(producao.map((p) => [p, limpar(readFileSync(p, 'utf8'), true)] as const))
  const fonteLimpa = (p: string) => limpas.get(p) ?? ''

  /** O primeiro argumento de cada chamada `nome(...)`, com parênteses aninhados contados. */
  function primeirosArgumentos(fonte: string, nome: string): string[] {
    const saida: string[] = []
    for (const m of fonte.matchAll(new RegExp(String.raw`\b${nome}\s*\(`, 'g'))) {
      let i = (m.index ?? 0) + m[0].length
      let profundidade = 0
      let arg = ''
      for (; i < fonte.length; i++) {
        const c = fonte[i]
        if ('([{'.includes(c)) profundidade++
        else if (')]}'.includes(c)) {
          if (profundidade === 0) break
          profundidade--
        } else if (c === ',' && profundidade === 0) break
        arg += c
      }
      saida.push(arg.trim())
    }
    return saida
  }

  // Medido em 14/09/2026, no fechamento da Frente H, por ESTE varredor (comentário e string
  // apagados): 14 chamadas — 12 em `src/` e 2 nas prévias de `scripts/design/`. Um `grep` cru
  // conta 15, porque pega a menção em comentário de `queries/ativos.ts`. Catraca contra a trava
  // vazia: se a contagem cair, alguém trocou `efetivar` por outro caminho — e é o teste que
  // avisa, não o silêncio.
  const MINIMO_DE_CHAMADAS = 14

  it('toda chamada passa `recorteDe(…)` — ou o parâmetro `recorte` que já o traz', () => {
    const chamadas = producao.flatMap((p) =>
      primeirosArgumentos(fonteLimpa(p), 'efetivar').map((arg) => ({
        arquivo: posix(p),
        arg,
      })),
    )
    const semRecorteDaSessao = chamadas.filter((c) => !/^(?:recorteDe\s*\(|recorte$)/.test(c.arg))
    expect(semRecorteDaSessao).toEqual([])
    expect(chamadas.length).toBeGreaterThanOrEqual(MINIMO_DE_CHAMADAS)
  })

  it('quem passa `recorte` por parâmetro o declara como RecorteDeLeitura', () => {
    for (const p of producao) {
      const fonte = fonteLimpa(p)
      if (!primeirosArgumentos(fonte, 'efetivar').includes('recorte')) continue
      expect(fonte, posix(p)).toMatch(/\brecorte\s*:\s*RecorteDeLeitura\b/)
    }
  })

  it('`RECORTE_UNIVERSAL` não é usado fora do módulo — o universal só chega por `recorteDe`', () => {
    const culpados = producao
      .filter((p) => /\bRECORTE_UNIVERSAL\b/.test(fonteLimpa(p)))
      .map(posix)
    expect(culpados).toEqual([])
  })

  it('`filtros/filial.ts` não devolve `[]`, e os nomes transitórios sumiram do código', () => {
    const filial = limpar(readFileSync(join(raiz, 'src', 'lib', 'filtros', 'filial.ts'), 'utf8'), true)
    expect(filial).not.toMatch(/return\s*\[\s*\]/)
    const comNomeAntigo = producao
      .filter((p) =>
        /\b(?:resolverFiliaisIds|resolverFiliaisSlugs|resolverFiliaisSlugsSemPadrao|filtroFilialPadrao)\b/.test(
          fonteLimpa(p),
        ),
      )
      .map(posix)
    expect(comNomeAntigo).toEqual([])
  })
})
