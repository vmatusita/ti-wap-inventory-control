'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  CATEGORIA_ORDEM,
  rotuloCategoria,
  rotuloTipo,
  type CategoriaAtivo,
  type TipoLancamento,
  type TipoMovimentacao,
} from '@/lib/dominio'
import { normalizarBusca } from '@/lib/ajuda/busca'
import { canonicalizarPatrimonio } from '@/lib/patrimonio'

// Núcleo compartilhado dos filtros das tabelas de relatório (OS tech-debt 3.2).
// Antes cada tabela (entradas/saídas/movimentações) reescrevia `const TODOS`, os
// `useMemo` de opções/filtragem/resumo e a barra de `Select`. Aqui mora a lógica
// PURA (derivação de opções, filtragem, agregação do resumo, (de)serialização na
// URL) + o hook que a costura com o React. A barra visual é `<FiltrosTabela>`.
//
// F11/T10 — o estado dos filtros MORA NA URL (antes era `useState`, sumia no F5
// e não dava para compartilhar por link). Mesmo padrão do resto do app, onde o
// período do relatório (`preset`/`de`/`ate`) já vive nos searchParams.
//
// Duas disciplinas vieram da revisão adversarial da F11 e não se pode perder de
// vista: o descarte de valor inválido é PEGAJOSO (`decidirFiltros`) e a
// gravação na URL é ADIADA enquanto houver navegação em voo (`navegacaoEmVoo`).

// Sentinela do "todos" no Radix Select (valor vazio não é permitido pelo componente).
export const TODOS = '__todos'

// Top-N dos chips de resumo (idêntico ao antigo `.slice(0, 12)`).
const RESUMO_LIMITE = 12

export type CampoFiltro = 'filial' | 'categoria' | 'motivo' | 'tipo'

// Prefixo de param por tabela — curto, estável e sem colisão entre as tabelas
// (duas filtradas ao mesmo tempo não se atropelam) nem com os params da página
// (`preset`/`de`/`ate`). Param final: `<prefixo>.<campo>`, valor = `Opcao.valor`;
// param ausente = "todas". Ex.: `?preset=mes&sd.motivo=Troca&en.categoria=celular`.
// A busca livre (F16/T3) usa o mesmo prefixo com o sufixo `.q`: `?sd.q=wap0001234`.
//   sd = Saídas · en = Entradas · mv = Últimas movimentações (grade v1)
//   tr = Transferências · mi = Movimentações de itens (F16/T3 — busca livre)
// NÃO renomeie: link antigo colado por aí deixaria de reproduzir o filtro.
export const PREFIXO_FILTROS = {
  saidas: 'sd',
  entradas: 'en',
  movimentacoes: 'mv',
  transferencias: 'tr',
  movItens: 'mi',
} as const

export type PrefixoFiltros = (typeof PREFIXO_FILTROS)[keyof typeof PREFIXO_FILTROS]

// Todos os campos existentes — usado para varrer a query (ler/limpar) sem
// depender de quais campos a tabela mostra agora.
const TODOS_CAMPOS: readonly CampoFiltro[] = ['filial', 'categoria', 'motivo', 'tipo']

// Todas as linhas filtráveis compartilham estes nomes de campo; cada tabela
// declara só os que usa. `motivo`/`tipo` são opcionais porque as movimentações
// não têm `motivo` e as entradas/saídas filtram por `motivo` (não por `tipo`).
// F16/T3 — `tipo` aceita também `TipoLancamento`: a tabela de movimentações de
// itens (linhas com tipo de LANÇAMENTO) usa o hook só para a busca livre (campos:
// []), então nunca ativa o filtro de `tipo`; o alargamento só a deixa satisfazer a
// restrição genérica. O filtro `tipo` (grade v1) segue recebendo TipoMovimentacao.
export type LinhaFiltravel = {
  filial?: string
  categoria?: CategoriaAtivo
  motivo?: string | null
  tipo?: TipoMovimentacao | TipoLancamento
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
  // F16/T3 — busca livre. Presente `buscaTexto` → habilita o campo de busca; a
  // função devolve os campos textuais da linha (patrimônio, modelo, motivo, obs…).
  // `buscaPatrimonio` (opcional) devolve o patrimônio canônico da linha, para casar
  // termos fora do formato ("wap 1234" → WAP0001234). DEFINA-AS EM ESCOPO DE MÓDULO
  // (ref estável) — senão o `useMemo` da filtragem re-roda a cada render.
  buscaTexto?: (row: T) => (string | null | undefined)[]
  buscaPatrimonio?: (row: T) => string | null | undefined
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
// Inclui o param de busca (F16/T3): "Limpar" zera filtros E busca.
export function limparFiltrosNaQuery(query: string, prefixo: string): string {
  return escreverBuscaNaQuery(escreverFiltrosNaQuery(query, prefixo, FILTROS_VAZIOS), prefixo, '')
}

// ---------- busca livre na URL (F16/T3 — também pura) ----------

// Nome do param de busca livre: `<prefixo>.q`. Sufixo `q` distinto dos CampoFiltro
// (filial/categoria/motivo/tipo), então não colide.
export function nomeParamBusca(prefixo: string): string {
  return `${prefixo}.q`
}

// URL → termo de busca. Param ausente/vazio = "" (sem busca).
export function lerBuscaDaQuery(query: string, prefixo: string): string {
  return new URLSearchParams(query).get(nomeParamBusca(prefixo)) ?? ''
}

// Termo → URL. Só mexe no param `<prefixo>.q` (o período, os filtros e a outra
// tabela passam intactos); termo vazio REMOVE o param — nada de `?sd.q=` pendurado.
export function escreverBuscaNaQuery(query: string, prefixo: string, termo: string): string {
  const params = new URLSearchParams(query)
  const nome = nomeParamBusca(prefixo)
  if (termo) params.set(nome, termo)
  else params.delete(nome)
  return params.toString()
}

// Sentinela entre campos: impede que um termo case atravessando dois campos (ex.:
// "wap0001234 fone" não deve casar juntando o patrimônio de um campo com o item de
// outro). U+0001 nunca ocorre em texto de dados.
const SEP_BUSCA = String.fromCharCode(1)

// Casa uma linha com o termo de busca (F16/T3). Sem sensibilidade a caixa/acento
// (via `normalizarBusca`). `campos` = todos os textos da linha (patrimônio incluso).
// `patrimonio` = o patrimônio CANÔNICO da linha: quando o termo canoniza ("wap 1234"
// → WAP0001234), casa mesmo digitado fora do formato — o caminho de substring puro
// não pegaria "wap 1234" contra "wap0001234". Termo vazio casa tudo.
export function casaBusca(
  campos: (string | null | undefined)[],
  patrimonio: string | null | undefined,
  termo: string,
): boolean {
  const q = normalizarBusca(termo)
  if (!q) return true
  const alvo = campos
    .filter((c): c is string => typeof c === 'string' && c.length > 0)
    .map((c) => normalizarBusca(c))
    .join(SEP_BUSCA)
  if (alvo.includes(q)) return true
  if (patrimonio) {
    const canon = canonicalizarPatrimonio(termo)
    if (canon && normalizarBusca(patrimonio).includes(normalizarBusca(canon))) return true
  }
  return false
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

// Decisão de quais valores da URL PODEM filtrar, tomada quando o param aparece
// (F11 — revisão adversarial).
//
// `sanitizarFiltros` sozinha só zera o ESTADO: o param descartado continua na
// URL — e isso é de propósito, porque as abas de filial preservam a query
// inteira (`filial-tabs.tsx`), então purgá-lo destruiria o filtro ao passar por
// uma filial que não tem aquele motivo. O defeito era outro: o valor descartado
// voltava a valer SOZINHO. As opções derivam de `rows`, e `rows` se renova sem
// ação do usuário (`router.refresh()` do realtime, auto-refresh de 60 s do
// visualizador); assim que uma linha com aquele motivo entrava no período, a
// mesma memo passava a considerar o valor válido e a tabela encolhia sem
// ninguém ter escolhido nada.
//
// Aqui a decisão fica presa ao param: enquanto `<prefixo>.<campo>` não mudar, o
// que foi descartado continua descartado. Param novo (link, aba de filial,
// período trocado) ou escolha no `<Select>` refazem a decisão.
export type DecisaoFiltros = {
  // Último valor VISTO na URL por campo — só serve para detectar que o param
  // mudou (não é o que filtra).
  url: Record<CampoFiltro, string>
  // O que de fato filtra: o valor que existia entre as opções quando o param
  // apareceu (ou o que o usuário escolheu depois).
  aceito: Record<CampoFiltro, string>
}

export function decidirFiltros(
  anterior: DecisaoFiltros | null,
  daUrl: Record<CampoFiltro, string>,
  opcoes: Partial<Record<CampoFiltro, Opcao[]>>,
  camposAtivos: readonly CampoFiltro[],
): DecisaoFiltros {
  // Nenhum param mudou → devolve a MESMA referência (o hook usa a identidade
  // para não reajustar estado no render e entrar em laço).
  if (anterior && TODOS_CAMPOS.every((c) => anterior.url[c] === daUrl[c])) return anterior

  const validos = sanitizarFiltros(daUrl, opcoes, camposAtivos)
  const url = { ...FILTROS_VAZIOS }
  const aceito = { ...FILTROS_VAZIOS }
  for (const campo of TODOS_CAMPOS) {
    url[campo] = daUrl[campo]
    aceito[campo] =
      anterior && anterior.url[campo] === daUrl[campo] ? anterior.aceito[campo] : validos[campo]
  }
  return { url, aceito }
}

// ---------- hook ----------

// Grava a query na URL SEM navegar: `history.replaceState` nativo é o shallow
// routing oficial do Next (App Router) — sincroniza com `useSearchParams` sem
// round-trip ao servidor, então filtrar segue instantâneo e não refaz as queries
// pesadas do relatório. `replace` e não `push`: trocar de select não vira entrada
// no histórico (Voltar sai da página, como o usuário espera) e o estado continua
// no F5 e no link colado. O hash (#saidas/#entradas) é preservado.
function gravarQueryNaUrl(query: string): void {
  const { pathname, hash, search } = window.location
  // Query idêntica → não grava. Cada `replaceState` faz o Next despachar um
  // ACTION_RESTORE (ver `navegacaoEmVoo`); não vale pagar esse risco à toa.
  if (search.replace(/^\?/, '') === query) return
  window.history.replaceState(null, '', `${pathname}${query ? `?${query}` : ''}${hash}`)
}

// Há navegação em voo? (F11 — revisão adversarial)
//
// Trocar período (`periodo-filtro.tsx`) navega com `router.push` dentro de um
// `startTransition`. Navegação só por searchParam na MESMA rota não monta o
// `loading.tsx`, então a tela antiga fica montada e interativa durante todo o
// round-trip do RSC — e o Next só escreve a history no commit, ou seja,
// `window.location` E `useSearchParams()` ainda apontam para a URL VELHA.
// Gravar a URL nesse intervalo é destrutivo: o patch do Next em
// `history.replaceState` despacha um ACTION_RESTORE, e um ACTION_RESTORE que
// chega com um ACTION_NAVIGATE pendente marca a navegação como `discarded`
// (node_modules/next/dist/client/components/app-router-instance.js) — o clique
// no período se perde em silêncio e a URL volta para o período anterior.
//
// Não existe API pública para "navegação pendente" fora de um `<Link>`, mas o
// repo tem uma convenção: quem navega marca `aria-busy` no próprio bloco
// enquanto o `isPending` do `useTransition` estiver ligado (periodo-filtro,
// ativos-filtros, lista-filtros). É esse o sinal usado aqui. Se ele falhar para
// mais ou para menos, nada se perde: a escolha do filtro já vale na hora pelo
// estado do hook — só a gravação na URL é adiada.
function navegacaoEmVoo(): boolean {
  return document.querySelector('[aria-busy="true"]') !== null
}

export function useFiltrosTabela<T extends LinhaFiltravel>(rows: T[], config: ConfigFiltros<T>) {
  const { campos, ehGeral, resumoChave, prefixo, buscaTexto, buscaPatrimonio } = config
  const buscaHabilitada = !!buscaTexto
  const searchParams = useSearchParams()
  const query = searchParams.toString()

  const camposAtivos = useMemo(() => camposVisiveis(campos, ehGeral), [campos, ehGeral])

  const opcoes = useMemo(() => {
    const acc = {} as Record<CampoFiltro, Opcao[]>
    for (const c of camposAtivos) acc[c] = derivarOpcoesCampo(rows, c)
    return acc
  }, [rows, camposAtivos])

  const daUrl = useMemo(() => lerFiltrosDaQuery(query, prefixo), [query, prefixo])

  // O estado É a URL (T10): F5, back/forward e `router.refresh()` do realtime /
  // do auto-refresh do visualizador preservam o filtro de graça. O que fica em
  // estado é só a DECISÃO sobre cada param (ver `decidirFiltros`) — ajuste de
  // estado no render, padrão "You Might Not Need an Effect" já usado no repo
  // (periodo-filtro, lista-filtros, progresso-navegacao).
  const [decisao, setDecisao] = useState<DecisaoFiltros>(() =>
    decidirFiltros(null, daUrl, opcoes, camposAtivos),
  )
  const decisaoAtual = decidirFiltros(decisao, daUrl, opcoes, camposAtivos)
  if (decisaoAtual !== decisao) setDecisao(decisaoAtual)

  // Revalida a cada render: valor que DEIXOU de existir entre as opções para de
  // filtrar na hora (senão o `<Select>` ficaria em branco filtrando escondido).
  const filtros = useMemo(
    () => sanitizarFiltros(decisaoAtual.aceito, opcoes, camposAtivos),
    [decisaoAtual, opcoes, camposAtivos],
  )

  // Busca livre (F16/T3). O termo VIVE NA URL (`<prefixo>.q`), como os filtros —
  // sobrevive a F5/link/back. Mas um `<input>` de texto precisa responder à tecla
  // ANTES do round-trip da URL: por isso um espelho local, ressincronizado quando a
  // URL muda por fora (back/forward, aba de filial, auto-refresh). Mesmo padrão de
  // "ajuste de estado no render" já usado para a `decisao`.
  const buscaUrl = useMemo(
    () => (buscaHabilitada ? lerBuscaDaQuery(query, prefixo) : ''),
    [buscaHabilitada, query, prefixo],
  )
  const [buscaState, setBuscaState] = useState(buscaUrl)
  const [buscaUrlVista, setBuscaUrlVista] = useState(buscaUrl)
  if (buscaUrl !== buscaUrlVista) {
    setBuscaUrlVista(buscaUrl)
    setBuscaState(buscaUrl)
  }
  const busca = buscaState

  const filtradas = useMemo(() => {
    const base = filtrarLinhas(rows, camposAtivos, filtros)
    const termo = busca.trim()
    if (!buscaTexto || !termo) return base
    return base.filter((r) =>
      casaBusca(buscaTexto(r), buscaPatrimonio ? buscaPatrimonio(r) : null, termo),
    )
  }, [rows, camposAtivos, filtros, busca, buscaTexto, buscaPatrimonio])

  const temFiltro = useMemo(
    () => camposAtivos.some((c) => !!filtros[c]),
    [camposAtivos, filtros],
  )
  const temBusca = buscaHabilitada && busca.trim() !== ''
  // "Recorte" = filtro OU busca ativa. Governa o "M exibida(s)" e o botão "Limpar".
  const temRecorte = temFiltro || temBusca

  const resumo = useMemo<[string, number][]>(() => {
    if (!resumoChave) return []
    return agregarResumo(filtradas, (r) => resumoChave(r, !!ehGeral))
  }, [filtradas, resumoChave, ehGeral])

  // Gravação adiada enquanto houver navegação em voo (ver `navegacaoEmVoo`).
  // Guarda a TRANSFORMAÇÃO da query, não a query pronta: as trocas feitas nesse
  // intervalo se compõem e são aplicadas depois sobre a URL nova, sem desfazer
  // a troca de período que estava a caminho.
  const adiado = useRef<((q: string) => string) | null>(null)

  const gravar = useCallback((transformar: (q: string) => string) => {
    if (navegacaoEmVoo()) {
      const anterior = adiado.current
      adiado.current = anterior ? (q) => transformar(anterior(q)) : transformar
      return
    }
    // Base = `window.location.search` (fresco), não o `query` do render:
    // `replaceState` atualiza `window.location` na hora, então duas trocas
    // seguidas — inclusive de tabelas diferentes — se compõem em vez de se
    // apagar.
    gravarQueryNaUrl(transformar(window.location.search))
  }, [])

  // `query` é a URL COMMITADA: ela só muda quando a navegação em voo termina.
  // É esse o gatilho para gravar o que ficou adiado, já sobre a URL nova.
  useEffect(() => {
    const transformar = adiado.current
    if (!transformar) return
    adiado.current = null
    gravarQueryNaUrl(transformar(window.location.search))
  }, [query])

  const setFiltro = useCallback(
    (campo: CampoFiltro, valor: string) => {
      // A escolha vale na hora, chegue quando chegar a gravação na URL — e é
      // ela que desfaz um descarte anterior do mesmo param (ver
      // `decidirFiltros`), já que escolher o mesmo valor não mudaria a query.
      // Só `aceito` muda: `url` continua sendo o que a URL COMMITADA diz, senão
      // o próximo render leria "o param mudou" e refaria a decisão em cima do
      // valor velho, apagando a escolha.
      setDecisao((prev) => ({ ...prev, aceito: { ...prev.aceito, [campo]: valor } }))
      gravar((q) => escreverFiltrosNaQuery(q, prefixo, { [campo]: valor }))
    },
    [gravar, prefixo],
  )

  const setBusca = useCallback(
    (valor: string) => {
      // Vale na hora (estado local), grave quando gravar; a base do write é sempre
      // a URL fresca (window.location) via `gravar`, então compõe com os filtros.
      setBuscaState(valor)
      gravar((q) => escreverBuscaNaQuery(q, prefixo, valor))
    },
    [gravar, prefixo],
  )

  const limpar = useCallback(() => {
    setDecisao((prev) => ({ ...prev, aceito: { ...FILTROS_VAZIOS } }))
    setBuscaState('')
    // `limparFiltrosNaQuery` já tira o param de busca também (ver a função).
    gravar((q) => limparFiltrosNaQuery(q, prefixo))
  }, [gravar, prefixo])

  return {
    filtradas,
    temFiltro,
    temBusca,
    temRecorte,
    resumo,
    filtros,
    opcoes,
    camposAtivos,
    busca,
    setFiltro,
    setBusca,
    limpar,
  }
}
