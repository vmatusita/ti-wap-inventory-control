'use client'

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  CATEGORIA_ORDEM,
  rotuloCategoria,
  rotuloTipo,
  type CategoriaAtivo,
  type TipoMovimentacao,
} from '@/lib/dominio'

// Núcleo compartilhado dos filtros das tabelas de relatório (OS tech-debt 3.2).
// Antes cada tabela (entradas/saídas/movimentações) reescrevia `const TODOS`, os
// `useMemo` de opções/filtragem/resumo e a barra de `Select`. Aqui mora a lógica
// PURA (derivação de opções, filtragem, agregação do resumo, (de)serialização na
// URL) + o hook que a costura com o React. A barra visual é `<FiltrosTabela>`.
//
// F11/T10 — o estado dos filtros MORA NA URL (antes era `useState`, sumia no F5
// e não dava para compartilhar por link). Mesmo padrão do resto do app, onde o
// período do relatório (`preset`/`de`/`ate`) já vive nos searchParams.

// Sentinela do "todos" no Radix Select (valor vazio não é permitido pelo componente).
export const TODOS = '__todos'

// Top-N dos chips de resumo (idêntico ao antigo `.slice(0, 12)`).
const RESUMO_LIMITE = 12

export type CampoFiltro = 'filial' | 'categoria' | 'motivo' | 'tipo'

// Prefixo de param por tabela — curto, estável e sem colisão entre as tabelas
// (duas filtradas ao mesmo tempo não se atropelam) nem com os params da página
// (`preset`/`de`/`ate`). Param final: `<prefixo>.<campo>`, valor = `Opcao.valor`;
// param ausente = "todas". Ex.: `?preset=mes&sd.motivo=Troca&en.categoria=celular`.
//   sd = Saídas · en = Entradas · mv = Últimas movimentações (grade v1)
// NÃO renomeie: link antigo colado por aí deixaria de reproduzir o filtro.
export const PREFIXO_FILTROS = {
  saidas: 'sd',
  entradas: 'en',
  movimentacoes: 'mv',
} as const

export type PrefixoFiltros = (typeof PREFIXO_FILTROS)[keyof typeof PREFIXO_FILTROS]

// Todos os campos existentes — usado para varrer a query (ler/limpar) sem
// depender de quais campos a tabela mostra agora.
const TODOS_CAMPOS: readonly CampoFiltro[] = ['filial', 'categoria', 'motivo', 'tipo']

// Todas as linhas filtráveis compartilham estes nomes de campo; cada tabela
// declara só os que usa. `motivo`/`tipo` são opcionais porque as movimentações
// não têm `motivo` e as entradas/saídas filtram por `motivo` (não por `tipo`).
export type LinhaFiltravel = {
  filial?: string
  categoria?: CategoriaAtivo
  motivo?: string | null
  tipo?: TipoMovimentacao
}

export type Opcao = { valor: string; rotulo: string }

export type ConfigFiltros<T extends LinhaFiltravel> = {
  // Campos filtráveis, na ordem de exibição. `filial` só aparece no consolidado.
  campos: readonly CampoFiltro[]
  // Prefixo dos params desta tabela na URL (ver `PREFIXO_FILTROS`). Obrigatório:
  // é o que impede duas tabelas na mesma página de disputarem o mesmo param.
  prefixo: PrefixoFiltros
  // Consolidado (várias filiais) → mostra o filtro de filial e prefixa o resumo.
  ehGeral?: boolean
  // Quando presente, o hook devolve `resumo` (chips por chave). A chave já
  // decide como o `ehGeral` participa (ex.: `filial · motivo` vs só `motivo`).
  resumoChave?: (row: T, ehGeral: boolean) => string
}

// Metadados de apresentação por campo (rótulos pt-BR, larguras e aria-label da
// barra). Fonte única — antes espalhados em cada `<Select>`.
export const CAMPO_FILTRO_META: Record<
  CampoFiltro,
  { placeholder: string; todos: string; largura: string; ariaLabel: string }
> = {
  filial: {
    placeholder: 'Filial',
    todos: 'Todas as filiais',
    largura: 'sm:w-[150px]',
    ariaLabel: 'Filtrar por filial',
  },
  categoria: {
    placeholder: 'Categoria',
    todos: 'Todas categorias',
    largura: 'sm:w-[150px]',
    ariaLabel: 'Filtrar por categoria',
  },
  motivo: {
    placeholder: 'Motivo',
    todos: 'Todos os motivos',
    largura: 'sm:w-[170px]',
    ariaLabel: 'Filtrar por motivo',
  },
  tipo: {
    placeholder: 'Tipo',
    todos: 'Todos os tipos',
    largura: 'sm:w-[150px]',
    ariaLabel: 'Filtrar por tipo',
  },
}

const FILTROS_VAZIOS: Record<CampoFiltro, string> = {
  filial: '',
  categoria: '',
  motivo: '',
  tipo: '',
}

// ---------- núcleo puro (testável — CLAUDE.md: Vitest só cobre função pura) ----------

// `filial` só é visível no consolidado (ehGeral). Espelha o antigo `{ehGeral && …}`
// que envolvia o `<Select>` de filial nas três tabelas com filtro.
export function camposVisiveis(
  campos: readonly CampoFiltro[],
  ehGeral: boolean | undefined,
): CampoFiltro[] {
  return campos.filter((c) => c !== 'filial' || !!ehGeral)
}

function valorCampo(row: LinhaFiltravel, campo: CampoFiltro): string {
  switch (campo) {
    case 'filial':
      return row.filial ?? ''
    case 'categoria':
      return row.categoria ?? ''
    case 'motivo':
      return row.motivo ?? ''
    case 'tipo':
      return row.tipo ?? ''
  }
}

// Opções do dropdown por campo. `categoria` = ordem canônica fixa (mostra todas,
// mesmo as ausentes nos dados); `tipo` = ordem de aparição (sem sort, como antes);
// `filial`/`motivo` = únicos dos dados, ordenados pt-BR (motivo ignora nulos).
export function derivarOpcoesCampo<T extends LinhaFiltravel>(
  rows: readonly T[],
  campo: CampoFiltro,
): Opcao[] {
  switch (campo) {
    case 'categoria':
      return CATEGORIA_ORDEM.map((c) => ({ valor: c, rotulo: rotuloCategoria(c) }))
    case 'tipo': {
      const vistos = [...new Set(rows.map((r) => r.tipo).filter(Boolean) as TipoMovimentacao[])]
      return vistos.map((t) => ({ valor: t, rotulo: rotuloTipo(t) }))
    }
    case 'filial': {
      const vals = [
        ...new Set(rows.map((r) => r.filial).filter(Boolean) as string[]),
      ].sort((a, b) => a.localeCompare(b, 'pt-BR'))
      return vals.map((v) => ({ valor: v, rotulo: v }))
    }
    case 'motivo': {
      const vals = [
        ...new Set(rows.map((r) => r.motivo).filter(Boolean) as string[]),
      ].sort((a, b) => a.localeCompare(b, 'pt-BR'))
      return vals.map((v) => ({ valor: v, rotulo: v }))
    }
  }
}

// Mantém a linha se, para cada campo ativo, o filtro está vazio OU casa exato.
export function filtrarLinhas<T extends LinhaFiltravel>(
  rows: readonly T[],
  campos: readonly CampoFiltro[],
  filtros: Record<CampoFiltro, string>,
): T[] {
  return rows.filter((r) => campos.every((c) => !filtros[c] || valorCampo(r, c) === filtros[c]))
}

// Conta por chave e devolve o top-N em ordem decrescente (chips do resumo).
export function agregarResumo<T>(
  filtradas: readonly T[],
  chave: (row: T) => string,
): [string, number][] {
  const map = new Map<string, number>()
  for (const r of filtradas) {
    const k = chave(r)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, RESUMO_LIMITE)
}

// Chave do resumo das tabelas de entradas/saídas: no consolidado agrupa por
// `filial · motivo`, senão só por `motivo` (nulo → "Outro").
export function chaveResumoMotivo(
  row: { filial: string; motivo: string | null },
  ehGeral: boolean,
): string {
  return ehGeral ? `${row.filial} · ${row.motivo ?? 'Outro'}` : row.motivo ?? 'Outro'
}

// ---------- (de)serialização na URL (também pura) ----------

// Nome do param de um campo. Fonte única do formato `<prefixo>.<campo>`.
export function nomeParamFiltro(prefixo: string, campo: CampoFiltro): string {
  return `${prefixo}.${campo}`
}

// URL → estado. Param ausente/vazio = "todas" (string vazia, como o estado antigo).
export function lerFiltrosDaQuery(query: string, prefixo: string): Record<CampoFiltro, string> {
  const params = new URLSearchParams(query)
  const filtros = { ...FILTROS_VAZIOS }
  for (const campo of TODOS_CAMPOS) {
    filtros[campo] = params.get(nomeParamFiltro(prefixo, campo)) ?? ''
  }
  return filtros
}

// Estado → URL. Só mexe nos params DESTE prefixo (o período e a outra tabela
// passam intactos); valor vazio REMOVE o param — nada de `?sd.motivo=` pendurado.
export function escreverFiltrosNaQuery(
  query: string,
  prefixo: string,
  mudancas: Partial<Record<CampoFiltro, string>>,
): string {
  const params = new URLSearchParams(query)
  for (const campo of TODOS_CAMPOS) {
    if (!(campo in mudancas)) continue
    const nome = nomeParamFiltro(prefixo, campo)
    const valor = mudancas[campo]
    if (valor) params.set(nome, valor)
    else params.delete(nome)
  }
  return params.toString()
}

// "Limpar": tira todos os params desta tabela, inclusive os de campos que não
// estão visíveis agora (ex.: `sd.filial` sobrando de um link do consolidado).
export function limparFiltrosNaQuery(query: string, prefixo: string): string {
  return escreverFiltrosNaQuery(query, prefixo, FILTROS_VAZIOS)
}

// Descarta valor que não existe mais entre as opções (link antigo, período
// trocado, filial sem aquele motivo): senão o `<Select>` ficaria em branco
// filtrando escondido e a tabela apareceria vazia sem explicação. Campo fora
// dos ativos também cai fora — `filtrarLinhas` já o ignoraria.
export function sanitizarFiltros(
  filtros: Record<CampoFiltro, string>,
  opcoes: Partial<Record<CampoFiltro, Opcao[]>>,
  camposAtivos: readonly CampoFiltro[],
): Record<CampoFiltro, string> {
  const limpos = { ...FILTROS_VAZIOS }
  for (const campo of camposAtivos) {
    const valor = filtros[campo]
    if (valor && (opcoes[campo] ?? []).some((o) => o.valor === valor)) limpos[campo] = valor
  }
  return limpos
}

// ---------- hook ----------

// Grava a query na URL SEM navegar: `history.replaceState` nativo é o shallow
// routing oficial do Next (App Router) — sincroniza com `useSearchParams` sem
// round-trip ao servidor, então filtrar segue instantâneo e não refaz as queries
// pesadas do relatório. `replace` e não `push`: trocar de select não vira entrada
// no histórico (Voltar sai da página, como o usuário espera) e o estado continua
// no F5 e no link colado. O hash (#saidas/#entradas) é preservado.
function gravarQueryNaUrl(query: string): void {
  const { pathname, hash } = window.location
  window.history.replaceState(null, '', `${pathname}${query ? `?${query}` : ''}${hash}`)
}

export function useFiltrosTabela<T extends LinhaFiltravel>(rows: T[], config: ConfigFiltros<T>) {
  const { campos, ehGeral, resumoChave, prefixo } = config
  const searchParams = useSearchParams()
  const query = searchParams.toString()

  const camposAtivos = useMemo(() => camposVisiveis(campos, ehGeral), [campos, ehGeral])

  const opcoes = useMemo(() => {
    const acc = {} as Record<CampoFiltro, Opcao[]>
    for (const c of camposAtivos) acc[c] = derivarOpcoesCampo(rows, c)
    return acc
  }, [rows, camposAtivos])

  // O estado É a URL (T10): F5, back/forward e `router.refresh()` do realtime /
  // do auto-refresh do visualizador preservam o filtro de graça.
  const filtros = useMemo(
    () => sanitizarFiltros(lerFiltrosDaQuery(query, prefixo), opcoes, camposAtivos),
    [query, prefixo, opcoes, camposAtivos],
  )

  const filtradas = useMemo(
    () => filtrarLinhas(rows, camposAtivos, filtros),
    [rows, camposAtivos, filtros],
  )

  const temFiltro = useMemo(
    () => camposAtivos.some((c) => !!filtros[c]),
    [camposAtivos, filtros],
  )

  const resumo = useMemo<[string, number][]>(() => {
    if (!resumoChave) return []
    return agregarResumo(filtradas, (r) => resumoChave(r, !!ehGeral))
  }, [filtradas, resumoChave, ehGeral])

  // A base da próxima URL é `window.location.search` (fresco), não o `query` do
  // render: `replaceState` atualiza `window.location` na hora, então duas trocas
  // seguidas — inclusive de tabelas diferentes — se compõem em vez de se apagar.
  const setFiltro = useCallback(
    (campo: CampoFiltro, valor: string) => {
      gravarQueryNaUrl(escreverFiltrosNaQuery(window.location.search, prefixo, { [campo]: valor }))
    },
    [prefixo],
  )

  const limpar = useCallback(() => {
    gravarQueryNaUrl(limparFiltrosNaQuery(window.location.search, prefixo))
  }, [prefixo])

  return { filtradas, temFiltro, resumo, filtros, opcoes, camposAtivos, setFiltro, limpar }
}
