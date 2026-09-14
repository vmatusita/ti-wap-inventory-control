// F57 — A MATRIZ DE CASOS-LIMITE do filtro de filial: cargo × vínculos × parâmetro.
//
// POR QUE ESTE ARQUIVO EXISTE, e por que ele nasceu ANTES do refactor. A F57 troca a
// convenção `[] = sem recorte` por um tipo que não sabe representar "lista vazia querendo
// dizer tudo". É uma refatoração larga, e a ficha nomeia os três lugares em que ela pode
// mudar comportamento EM SILÊNCIO: o consolidado com `filial_id is null` de
// `/relatorios/gerados`, o slug de filial DESATIVADA que continua recortando, e o operador
// sem vínculo que cai em "todas". A mitigação que a ficha exige é esta: escrever a tabela
// de casos ANTES, vê-la passar no código de hoje, e só então mexer.
//
// COMO ELA PROVA "ANTES × DEPOIS" SEM SER UM GABARITO CONGELADO À MÃO. A matriz é
// CALCULADA pelo `ADAPTADOR` abaixo — a única parte deste arquivo que muda entre o antes e
// o depois (hoje ele chama `resolverFiliais*`; depois do refactor, as funções novas). A
// saída do antes foi gravada em `docs/f57-evidencias/casos-limite-antes.json` rodando o
// código de 14/09/2026. Daí em diante toda execução recalcula a matriz e a compara, célula
// a célula, com essa gravação: uma célula que mudar sem estar em `MUDANCAS_DECLARADAS` é
// regressão, e uma mudança declarada que NÃO acontecer é declaração falsa. As duas reprovam.
//
// Para regravar (só no commit que cria a evidência):
//   F57_CASOS=antes  npx vitest run src/lib/filtros/casos-limite.test.ts
//   F57_CASOS=depois npx vitest run src/lib/filtros/casos-limite.test.ts
//
// SEM BANCO. As duas superfícies que leem o banco (`listarRelatoriosGerados` e
// `resolverFilialPorSlug`) rodam contra um client FALSO que só grava a cadeia de chamadas e
// resolve `filiais` por um catálogo fictício — a pergunta aqui é "que filtro a query MONTA",
// não "o que o Postgres devolve". Filiais 100% fictícias.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DbClient } from '@/lib/queries/relatorios/comum'
import { resolverFilialPorSlug } from '@/lib/queries/relatorios/comum'
import { listarRelatoriosGerados } from '@/lib/queries/gerados'
import {
  abaRelatorioPadrao,
  escopoDeEscrita,
  podeEscrever,
  type PapelUsuario,
} from '@/lib/auth/papeis'
import { filiaisParaEscrita, podeEscreverNoEscopo } from '@/components/layout/permissoes'
import {
  resolverFiliaisSlugsSemPadrao,
  selecaoDeUnidades,
  selecaoDeUnidadesPorSlug,
} from '@/lib/filtros/filial'
import {
  efetivar,
  lerUnidades,
  recorteDe,
  type VistaDasUnidades,
} from '@/lib/auth/recorte-leitura'
import { idNumerico } from '@/lib/url-params'

// ---------------------------------------------------------------------------
// O universo fictício
// ---------------------------------------------------------------------------

type FilialFicticia = { id: number; slug: string; nome: string; ativo: boolean }

// `extinta` é a filial DESATIVADA: existe em `filiais`, não sai em `listarFiliais()`.
const CATALOGO: readonly FilialFicticia[] = [
  { id: 1, slug: 'alfa', nome: 'Alfa', ativo: true },
  { id: 2, slug: 'bravo', nome: 'Bravo', ativo: true },
  { id: 3, slug: 'charlie', nome: 'Charlie', ativo: true },
  { id: 4, slug: 'delta', nome: 'Delta', ativo: true },
  { id: 5, slug: 'extinta', nome: 'Extinta', ativo: false },
]

// O que `listarFiliais()` entrega às telas: só as ATIVAS, ordenadas por nome.
const ATIVAS = CATALOGO.filter((f) => f.ativo)

const CARGOS: readonly PapelUsuario[] = ['dev', 'admin', 'operador', 'consulta']

const VINCULOS: Readonly<Record<string, readonly number[]>> = {
  nenhum: [],
  um: [2],
  dois: [2, 4],
  'so-desativada': [5],
}

const PARAMS_ID: Readonly<Record<string, string | undefined>> = {
  ausente: undefined,
  todas: 'todas',
  valido: '2',
  dois: '1,4',
  inexistente: '77',
  misto: '2,77',
  desativada: '5',
  lixo: 'abc',
  'fora-da-faixa': '99999',
}

const PARAMS_SLUG: Readonly<Record<string, string | undefined>> = {
  ausente: undefined,
  todas: 'todas',
  valido: 'bravo',
  dois: 'alfa,delta',
  inexistente: 'fantasma',
  misto: 'bravo,fantasma',
  desativada: 'extinta',
  lixo: 'NÃO VALE',
  geral: 'geral',
}

const PARAMS_GERADOS: Readonly<Record<string, string | undefined>> = {
  ausente: undefined,
  todas: 'todas',
  geral: 'geral',
  'geral+valido': 'geral,bravo',
  valido: 'bravo',
  desativada: 'extinta',
  inexistente: 'fantasma',
  misto: 'bravo,fantasma',
  lixo: 'NÃO VALE',
}

const PARAMS_CONFERENCIA: Readonly<Record<string, string | undefined>> = {
  ausente: undefined,
  valido: '2',
  'outra-ativa': '3',
  inexistente: '77',
  desativada: '5',
  lixo: 'abc',
}

const SLUGS_AO_VIVO: Readonly<Record<string, string>> = {
  geral: 'geral',
  valido: 'bravo',
  desativada: 'extinta',
  inexistente: 'fantasma',
}

// A sessão como `getOperador()` a monta: o cargo e as filiais de escrita derivadas dos
// vínculos e das filiais ATIVAS.
type Sessao = { papel: PapelUsuario; escopoEscrita: readonly number[] }

function sessao(papel: PapelUsuario, vinculos: readonly number[]): Sessao {
  return {
    papel,
    escopoEscrita: escopoDeEscrita(
      papel,
      vinculos,
      ATIVAS.map((f) => f.id),
    ),
  }
}

// ---------------------------------------------------------------------------
// O client falso — grava a cadeia, resolve `filiais` pelo catálogo
// ---------------------------------------------------------------------------

type Chamada = { metodo: string; args: unknown[] }
type Consulta = { tabela: string; chamadas: Chamada[] }

function clienteFalso(): { client: DbClient; registro: Consulta[] } {
  const registro: Consulta[] = []

  function responder(c: Consulta): unknown {
    if (c.tabela !== 'filiais') return { data: [], error: null, count: 0 }
    let linhas: FilialFicticia[] = [...CATALOGO]
    let unica = false
    for (const { metodo, args } of c.chamadas) {
      const [coluna, valor] = args as [string, unknown]
      if (metodo === 'in' && coluna === 'slug') {
        linhas = linhas.filter((f) => (valor as string[]).includes(f.slug))
      } else if (metodo === 'in' && coluna === 'id') {
        linhas = linhas.filter((f) => (valor as number[]).includes(f.id))
      } else if (metodo === 'eq' && coluna === 'slug') {
        linhas = linhas.filter((f) => f.slug === valor)
      } else if (metodo === 'eq' && coluna === 'ativo') {
        linhas = linhas.filter((f) => f.ativo === valor)
      } else if (metodo === 'maybeSingle') {
        unica = true
      }
    }
    return unica
      ? { data: linhas[0] ?? null, error: null }
      : { data: linhas, error: null, count: linhas.length }
  }

  function from(tabela: string) {
    const consulta: Consulta = { tabela, chamadas: [] }
    registro.push(consulta)
    const builder: unknown = new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === 'then') {
            return (resolver: (v: unknown) => void) => resolver(responder(consulta))
          }
          return (...args: unknown[]) => {
            consulta.chamadas.push({ metodo: String(prop), args })
            return builder
          }
        },
      },
    )
    return builder
  }

  return { client: { from } as unknown as DbClient, registro }
}

// O filtro de filial que a listagem de `relatorios_gerados` montou.
function filtroGravado(registro: readonly Consulta[]): string {
  const lista = registro.find((c) => c.tabela === 'relatorios_gerados')
  if (!lista) return 'vazio-sem-consulta'
  const filtros = lista.chamadas
    .filter((c) => c.metodo === 'or' || c.metodo === 'is' || c.metodo === 'in')
    .map(
      (c) =>
        `${c.metodo}(${c.args
          .map((a) => (Array.isArray(a) ? `[${a.join(',')}]` : String(a)))
          .join(', ')})`,
    )
  return filtros.length > 0 ? filtros.join(' + ') : 'sem-filtro'
}

// ---------------------------------------------------------------------------
// O ADAPTADOR — a ÚNICA parte que muda entre o antes e o depois
// ---------------------------------------------------------------------------
// ANTES (código de 14/09/2026, commit 89cafce): `resolverFiliais*` devolviam `[]` para "sem
// recorte", e o adaptador lia `r.length === 0 ? 'todas' : …`.
// DEPOIS da Frente B: a seleção nova passa por `efetivar(recorteDe(sessão), …)` e o adaptador
// descreve a VISTA — `todas`, `lista`, `somente-sem-unidade` ou `nenhuma`. Uma `nenhuma` que
// aparecesse aqui onde o antes dizia `todas` seria o fail-open ao contrário, e reprovaria.

function descrever<T>(v: VistaDasUnidades<T>, prefixo: 'ids' | 'slugs'): string {
  switch (v.modo) {
    case 'todas':
      return 'todas'
    case 'lista':
      return `${prefixo}:${v.valores.join(',')}${v.incluiSemUnidade ? '+sem-unidade' : ''}`
    case 'somente-sem-unidade':
      return 'somente-sem-unidade'
    case 'nenhuma':
      return 'nenhuma'
  }
}

type Adaptador = {
  porId(param: string | undefined, s: Sessao): string
  porSlug(param: string | undefined, s: Sessao): string
  gerados(param: string | undefined): Promise<string>
  abaPadrao(s: Sessao): string
  conferencia(param: string | undefined, s: Sessao): string
  pertinencia(familia: FamiliaDeRota, param: string | undefined): Promise<string>
}

type FamiliaDeRota = 'id' | 'slug-com-padrao' | 'slug-sem-padrao' | 'conferencia' | 'ao-vivo'

const ADAPTADOR: Adaptador = {
  porId(param, s) {
    const selecao = selecaoDeUnidades(
      param,
      s,
      ATIVAS.map((f) => f.id),
    )
    return descrever(lerUnidades(efetivar(recorteDe(s), selecao)), 'ids')
  },
  porSlug(param, s) {
    const selecao = selecaoDeUnidadesPorSlug(param, s, ATIVAS)
    return descrever(lerUnidades(efetivar(recorteDe(s), selecao)), 'slugs')
  },
  async gerados(param) {
    const { client, registro } = clienteFalso()
    await listarRelatoriosGerados(client, resolverFiliaisSlugsSemPadrao(param))
    return filtroGravado(registro)
  },
  abaPadrao(s) {
    return abaRelatorioPadrao(s.papel, s.escopoEscrita, ATIVAS)
  },
  // Espelha `src/app/(app)/itens/conferencia/page.tsx` linha a linha.
  conferencia(param, s) {
    const escreve = podeEscrever(s.papel)
    const escrita = filiaisParaEscrita(s, ATIVAS)
    if (!escreve || escrita.length === 0) return escreve ? 'aviso-sem-escrita' : 'cargo-sem-escrita'
    const pedida = idNumerico(param)
    const filialId = podeEscreverNoEscopo(s, pedida) ? pedida : null
    const filial = filialId != null ? ATIVAS.find((f) => f.id === filialId) : undefined
    return filial ? `filial:${filial.id}` : 'seletor'
  },
  // HOJE só `/relatorios/[filial]` recusa (`resolverFilialPorSlug` → `notFound()`); as
  // outras sete rotas abrem com qualquer parâmetro (lido no código, explorador (d)).
  async pertinencia(familia, param) {
    if (familia !== 'ao-vivo') return 'abre'
    if (param === 'geral') return 'abre'
    const { client } = clienteFalso()
    return (await resolverFilialPorSlug(client, param ?? '')) ? 'abre' : '404'
  },
}

// ---------------------------------------------------------------------------
// A matriz
// ---------------------------------------------------------------------------

type Celula = { superficie: string; linha: string; coluna: string; valor: string }

async function montarMatriz(a: Adaptador): Promise<Celula[]> {
  const celulas: Celula[] = []
  const push = (superficie: string, linha: string, coluna: string, valor: string) =>
    celulas.push({ superficie, linha, coluna, valor })

  for (const cargo of CARGOS) {
    for (const [nomeVinculo, vinculos] of Object.entries(VINCULOS)) {
      const s = sessao(cargo, vinculos)
      const linha = `${cargo} · ${nomeVinculo}`
      for (const [nome, p] of Object.entries(PARAMS_ID)) push('S1', linha, nome, a.porId(p, s))
      for (const [nome, p] of Object.entries(PARAMS_SLUG)) push('S2', linha, nome, a.porSlug(p, s))
      push('S4', linha, 'sem parâmetro', a.abaPadrao(s))
      for (const [nome, p] of Object.entries(PARAMS_CONFERENCIA)) {
        push('S5', linha, nome, a.conferencia(p, s))
      }
    }
  }

  for (const [nome, p] of Object.entries(PARAMS_GERADOS)) {
    push('S3', 'qualquer cargo e o visualizador', nome, await a.gerados(p))
  }

  const rotas: [string, FamiliaDeRota, Readonly<Record<string, string | undefined>>][] = [
    ['/ativos · /movimentacoes · /itens · /itens/historico', 'id', PARAMS_ID],
    ['/pendencias', 'slug-com-padrao', PARAMS_SLUG],
    ['/relatorios/gerados', 'slug-sem-padrao', PARAMS_GERADOS],
    ['/itens/conferencia', 'conferencia', PARAMS_CONFERENCIA],
    ['/relatorios/[filial]', 'ao-vivo', SLUGS_AO_VIVO],
  ]
  for (const [rota, familia, params] of rotas) {
    for (const [nome, p] of Object.entries(params)) {
      push('P', rota, nome, await a.pertinencia(familia, p))
    }
  }

  return celulas
}

// ---------------------------------------------------------------------------
// As mudanças DECLARADAS (a única exceção que a ordem admite na matriz)
// ---------------------------------------------------------------------------
// Vazio no commit do ANTES. O refactor acrescenta aqui, com o motivo, cada célula que
// muda de propósito — e nenhuma outra.

type MudancaDeclarada = {
  superficie: string
  linha: string
  coluna: string
  de: string
  para: string
  motivo: string
}

const MUDANCAS_DECLARADAS: readonly MudancaDeclarada[] = []

// ---------------------------------------------------------------------------
// A evidência
// ---------------------------------------------------------------------------

const PASTA_EVIDENCIAS = join(process.cwd(), 'docs', 'f57-evidencias')
const ARQUIVO_ANTES = join(PASTA_EVIDENCIAS, 'casos-limite-antes.json')

const TITULOS: Readonly<Record<string, string>> = {
  S1: 'S1 — por id, com padrão por cargo (`/ativos`, `/movimentacoes`, `/itens`, `/itens/historico` e o CSV)',
  S2: 'S2 — por slug, com padrão por cargo (`/pendencias`, o CSV da fila e da mesa, o selo e o card do painel)',
  S3: 'S3 — por slug, SEM padrão (`/relatorios/gerados`): o filtro que a listagem monta',
  S4: 'S4 — a aba em que `/relatorios` abre',
  S5: 'S5 — `/itens/conferencia` (o parâmetro governa ESCRITA)',
  P: 'P — pertinência na rota (a filial pedida existe?)',
}

function paraMarkdown(celulas: readonly Celula[], momento: 'antes' | 'depois'): string {
  const partes: string[] = [
    `# F57 — casos-limite do filtro de filial (${momento.toUpperCase()})`,
    '',
    `Gerado por \`F57_CASOS=${momento} npx vitest run src/lib/filtros/casos-limite.test.ts\` — calculado, não digitado.`,
    'Catálogo fictício: ativas `alfa(1) bravo(2) charlie(3) delta(4)`, desativada `extinta(5)`; inexistentes `77` e `fantasma`.',
    'Valores: `todas` = sem recorte · `ids:`/`slugs:` = o recorte efetivo · `sem-filtro`/`is(...)`/`or(...)`/`in(...)` = o filtro montado · `404` = `notFound()`.',
    '',
  ]
  for (const sup of ['S1', 'S2', 'S3', 'S4', 'S5', 'P']) {
    const daSup = celulas.filter((c) => c.superficie === sup)
    const colunas = [...new Set(daSup.map((c) => c.coluna))]
    const linhas = [...new Set(daSup.map((c) => c.linha))]
    partes.push(`## ${TITULOS[sup]}`, '')
    partes.push(`| | ${colunas.map((c) => `\`${c}\``).join(' | ')} |`)
    partes.push(`|---|${colunas.map(() => '---').join('|')}|`)
    for (const l of linhas) {
      const valores = colunas.map((c) => {
        const cel = daSup.find((x) => x.linha === l && x.coluna === c)
        return cel ? `\`${cel.valor}\`` : '—'
      })
      partes.push(`| ${l} | ${valores.join(' | ')} |`)
    }
    partes.push('')
  }
  return partes.join('\n')
}

describe('F57 — a matriz de casos-limite (cargo × vínculos × parâmetro)', () => {
  it('bate com a gravação do ANTES, célula a célula, exceto as mudanças DECLARADAS', async () => {
    const atual = await montarMatriz(ADAPTADOR)

    const momento = process.env.F57_CASOS
    if (momento === 'antes' || momento === 'depois') {
      mkdirSync(PASTA_EVIDENCIAS, { recursive: true })
      writeFileSync(
        join(PASTA_EVIDENCIAS, `casos-limite-${momento}.json`),
        `${JSON.stringify(atual, null, 2)}\n`,
      )
      writeFileSync(
        join(PASTA_EVIDENCIAS, `casos-limite-${momento}.md`),
        `${paraMarkdown(atual, momento)}\n`,
      )
    }

    expect(existsSync(ARQUIVO_ANTES)).toBe(true)
    const antes = JSON.parse(readFileSync(ARQUIVO_ANTES, 'utf8')) as Celula[]
    expect(atual.length).toBe(antes.length)

    const chave = (c: { superficie: string; linha: string; coluna: string }) =>
      `${c.superficie}|${c.linha}|${c.coluna}`
    const porChave = new Map(antes.map((c) => [chave(c), c.valor]))

    const naoDeclaradas: string[] = []
    const declaradasVistas = new Set<string>()
    for (const c of atual) {
      const de = porChave.get(chave(c))
      if (de === c.valor) continue
      const declarada = MUDANCAS_DECLARADAS.find(
        (m) => chave(m) === chave(c) && m.de === de && m.para === c.valor,
      )
      if (declarada) declaradasVistas.add(chave(declarada))
      else naoDeclaradas.push(`${chave(c)}: ${de} → ${c.valor}`)
    }

    // Uma regressão silenciosa é exatamente uma célula que muda sem declaração.
    expect(naoDeclaradas).toEqual([])
    // E uma declaração que não aconteceu é uma afirmação falsa sobre o que a fase fez.
    expect(MUDANCAS_DECLARADAS.map(chave).filter((k) => !declaradasVistas.has(k))).toEqual([])
  })
})

describe('F57 — os três casos-limite que a ficha nomeia, escritos por extenso', () => {
  it('caso 1 — o consolidado (filial_id is null) aparece em /relatorios/gerados', async () => {
    // Sem parâmetro e com a sentinela: nenhum filtro — o consolidado vem junto de tudo.
    expect(await ADAPTADOR.gerados(undefined)).toBe('sem-filtro')
    expect(await ADAPTADOR.gerados('todas')).toBe('sem-filtro')
    // Só o consolidado.
    expect(await ADAPTADOR.gerados('geral')).toBe('is(filial_id, null)')
    // O consolidado E uma filial: um OR, nunca um AND na mesma coluna.
    expect(await ADAPTADOR.gerados('geral,bravo')).toBe('or(filial_id.is.null,filial_id.in.(2))')
  })

  it('caso 2 — a filial DESATIVADA continua recortando (id e slug)', async () => {
    for (const cargo of CARGOS) {
      for (const vinculos of Object.values(VINCULOS)) {
        const s = sessao(cargo, vinculos)
        expect(ADAPTADOR.porId('5', s)).toBe('ids:5')
        expect(ADAPTADOR.porSlug('extinta', s)).toBe('slugs:extinta')
      }
    }
    expect(await ADAPTADOR.gerados('extinta')).toBe('in(filial_id, [5])')
  })

  it('caso 3 — o operador sem vínculo cai em "todas" na leitura, e no aviso de escrita na conferência', () => {
    for (const vinculos of [VINCULOS.nenhum, VINCULOS['so-desativada']]) {
      const s = sessao('operador', vinculos)
      expect(ADAPTADOR.porId(undefined, s)).toBe('todas')
      expect(ADAPTADOR.porSlug(undefined, s)).toBe('todas')
      expect(ADAPTADOR.abaPadrao(s)).toBe('geral')
      // O ⚠ que existe hoje é o de ESCRITA (`AvisoSemFilialDeEscrita`). Nas telas de
      // leitura a queda em "todas" não tem aviso próprio — medido na F57, e registrado.
      expect(ADAPTADOR.conferencia(undefined, s)).toBe('aviso-sem-escrita')
    }
    // E a decisão olha o CARGO, não a lista vazia: consulta também cai em todas, por outro
    // caminho, e na conferência recebe a explicação de cargo — não o aviso de vínculo.
    const consulta = sessao('consulta', [])
    expect(ADAPTADOR.porId(undefined, consulta)).toBe('todas')
    expect(ADAPTADOR.conferencia(undefined, consulta)).toBe('cargo-sem-escrita')
  })
})
