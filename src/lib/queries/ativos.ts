import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type {
  CategoriaAtivo,
  StatusAtivo,
  TermoStatus,
} from '@/lib/dominio'
import {
  TAMANHO_PAGINA_PADRAO,
  ehTamanhoPagina,
  type Ordenacao,
} from '@/lib/ativos/lista'
import { patrimoniosRepetidos } from '@/lib/patrimonio'
import type { Tables } from '@/lib/types/database'

// Tamanho de página padrão da lista. Desde a F11/T7 o operador pode trocar por
// `?pp=` (25/50/100) — este continua sendo o valor de quem não mexe em nada.
export const PAGE_SIZE = TAMANHO_PAGINA_PADRAO

// Linha da LISTA de ativos (OS-F2 3.1).
export type AtivoLista = {
  id: string
  // null = ativo sem patrimônio físico (import F7E) — a UI mostra "sem patrimônio".
  patrimonio: string | null
  service_tag: string | null
  categoria: CategoriaAtivo
  marca: string | null
  modelo: string | null
  status: StatusAtivo
  colaborador_atual: string | null
  filial_nome: string
  updated_at: string
  // ATV-02 — texto livre da pendência (campo `ativos.pendencia`), NÃO tratada
  // aqui: '' e null convivem no banco, e é a UI/filtro que decide o que conta
  // como "com pendência" (ver `comPendencia` em `aplicarFiltrosAtivos`).
  pendencia: string | null
}

export type ListarAtivosParams = {
  q?: string
  // F25 — o filtro de filial virou MULTI-seleção. Lista vazia/ausente = SEM
  // recorte (todas). Quem resolve a lista efetiva (URL + padrão do cargo) é
  // `resolverFiliaisIds` em `@/lib/filtros/filial` — tela e export usam a mesma.
  filialIds?: readonly number[]
  categoria?: CategoriaAtivo
  status?: StatusAtivo[]
  // Só ativos sem patrimônio físico (pendência 'sem patrimônio físico' — F7E).
  semPatrimonio?: boolean
  // ATV-02 — só ativos com `pendencia` preenchida (texto livre não nulo e não
  // vazio). Um `''` gravado no banco não deveria acender o alerta — ver a nota
  // em `aplicarFiltrosAtivos`.
  comPendencia?: boolean
  page?: number
  // F11/T7 — 25/50/100. Valor fora da lista cai no `PAGE_SIZE` (a validação é
  // aqui de propósito: a query é a última linha antes do `range()`).
  pageSize?: number
  // F11/T7 — ordenação por coluna vinda da URL (`?ord=`). `null`/ausente
  // mantém o default histórico da tela (`updated_at desc`).
  // IGNORADA por `listarAtivosParaExport`, como já acontece com `page`.
  ordenacao?: Ordenacao | null
}

export type ListarAtivosResult = {
  rows: AtivoLista[]
  total: number
  page: number
  pageSize: number
  // patrimonios que aparecem mais de uma vez NA PAGINA — a lista mostra a
  // coluna Service Tag p/ desambiguar (OS-F2 3.1.4).
  patrimoniosDuplicados: Set<string>
}

// Remove caracteres que quebram o parser do filtro `.or()` do PostgREST.
function sanitizeTerm(term: string): string {
  return term.replace(/[,()%*\\]/g, ' ').trim()
}

// Teto de palavras por busca — cada palavra vira um grupo `.or()`, então limita o
// tamanho da query (e é mais que suficiente p/ "marca modelo patrimônio").
const MAX_PALAVRAS_BUSCA = 10

// Quebra o termo em palavras já saneadas. A busca é "campo único": CADA palavra
// precisa casar em ALGUM dos campos varridos (E entre palavras, OU entre campos),
// então "dell latitude" casa marca "Dell" + modelo "Latitude 5420" como se
// marca+modelo fossem um campo só — em qualquer ordem, e cruzando com patrimônio/
// colaborador. Cada palavra é aplicada como um `.or()` separado (o PostgREST
// combina múltiplos `.or()` com AND). Ver `listarAtivos`/`buscarAtivosParaCombobox`.
function palavrasDaBusca(term: string): string[] {
  return sanitizeTerm(term)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_PALAVRAS_BUSCA)
}

type FilialEmbed = { slug: string; nome: string } | null

// Superfície mínima de um builder de `from('ativos')` para aplicar os filtros da
// lista. A lista paginada e o export (F10/T5) usam SELECTs diferentes — logo,
// tipos de builder diferentes —, e os filtros precisam ser os MESMOS nos dois
// (senão o CSV não bate com a tela). O cast estrutural fica contido em
// `aplicarFiltrosAtivos`; os nomes de coluna são conferidos pelo banco em
// runtime, como já acontece nos selects em string deste arquivo.
type BuilderAtivos = {
  or(filtro: string): BuilderAtivos
  eq(coluna: string, valor: string | number): BuilderAtivos
  // `readonly (string | number)[]` desde a F25: `status` passa strings e
  // `filial_id` passa números (smallint).
  in(coluna: string, valores: readonly (string | number)[]): BuilderAtivos
  is(coluna: string, valor: null): BuilderAtivos
  // ATV-02 — nega um filtro do PostgREST (`not.is.null`, `not.eq.`…), no mesmo
  // formato de `queries/pendencias-detalhe.ts` e `queries/movimentacoes.ts`.
  not(coluna: string, operador: string, valor: string | null): BuilderAtivos
}

// Filtros da lista de ativos — FONTE ÚNICA (tela + export CSV, que chama a MESMA
// função — `listarAtivosParaExport` — então herda qualquer campo novo de graça).
// Busca livre "campo único" (spec §6 tela 3 / OS-F2 3.1.2): cada palavra do termo
// precisa casar em patrimonio OU colaborador OU marca OU modelo OU service_tag OU
// hostname OU telefone OU imei. Trata marca+modelo como um texto só ("dell latitude"
// acha marca "Dell" + modelo "Latitude 5420").
// F27/B5 (ATV-01) — até aqui só os 4 primeiros campos eram varridos: colar a service
// tag (o identificador IMUTÁVEL do ativo, spec §5) ou o IMEI (coluna da F25) na busca
// da LISTA devolvia vazio, embora o combobox da movimentação (`buscarAtivosParaCombobox`,
// mais abaixo) já achasse por service_tag/hostname havia fases. `telefone`/`imei` são
// exclusivos DESTA busca — o combobox não precisa deles porque não se movimenta um
// ativo pelo número do aparelho.
function aplicarFiltrosAtivos<T>(query: T, params: ListarAtivosParams): T {
  let q = query as unknown as BuilderAtivos
  for (const palavra of params.q ? palavrasDaBusca(params.q) : []) {
    q = q.or(
      `patrimonio.ilike.%${palavra}%,colaborador_atual.ilike.%${palavra}%,marca.ilike.%${palavra}%,modelo.ilike.%${palavra}%,service_tag.ilike.%${palavra}%,hostname.ilike.%${palavra}%,telefone.ilike.%${palavra}%,imei.ilike.%${palavra}%`,
    )
  }
  if (params.filialIds && params.filialIds.length > 0) {
    q = q.in('filial_id', params.filialIds)
  }
  if (params.categoria) q = q.eq('categoria', params.categoria)
  if (params.status && params.status.length > 0) {
    q = q.in('status', params.status)
  }
  if (params.semPatrimonio) q = q.is('patrimonio', null)
  // ATV-02 — "com pendência" é não-nulo E não-vazio: o import grava `''` em
  // alguns fluxos e isso não é uma pendência de verdade (decisão registrada em
  // docs/DECISOES.md). Os dois `.not()` combinam em AND, como os demais
  // filtros deste builder.
  if (params.comPendencia) {
    q = q.not('pendencia', 'is', null).not('pendencia', 'eq', '')
  }
  return q as unknown as T
}

// Query base da lista (select + filtros + ordem, SEM faixa). Devolve uma query
// NOVA a cada chamada: o builder do postgrest-js é mutável e não se reexecuta
// com segurança (mesma nota de `queryLista` em queries/movimentacoes.ts).
function queryLista(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: ListarAtivosParams,
  head = false,
) {
  let query = supabase
    .from('ativos')
    .select(
      'id, patrimonio, service_tag, categoria, marca, modelo, status, colaborador_atual, updated_at, pendencia, filiais(slug, nome)',
      { count: 'exact', head },
    )

  query = aplicarFiltrosAtivos(query, params)
  if (params.ordenacao) {
    // `nullsFirst: false` espelha `buscarAtivosParaCombobox`: NULLS FIRST é o
    // default do PostgREST em asc, e "sem patrimônio"/"sem colaborador" no topo
    // da lista é ruído — vazio vai para o fim nas DUAS direções.
    // Desempate por `id`: `categoria`/`status` empatam aos milhares e, sem uma
    // ordem total, a página 2 repetiria/pularia linhas da página 1.
    query = query
      .order(params.ordenacao.coluna, {
        ascending: params.ordenacao.direcao === 'asc',
        nullsFirst: false,
      })
      .order('id', { ascending: true })
  } else {
    // MESMO desempate do ramo acima e de `listarAtivosParaExport`: `updated_at`
    // não é único, e aqui os empates são a REGRA, não a exceção — a RPC do import
    // grava o acervo inteiro da filial numa transação só, então o `now()` é
    // constante para todas as linhas (medido em produção em 25/07/2026: 1.209 dos
    // 1.597 ativos compartilham o mesmo `updated_at` ao microssegundo). Sem ordem
    // total, `.range()` sobre esse bloco repete e pula linhas entre as páginas.
    query = query
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true })
  }
  return query
}

// Faixa pedida além do fim do resultado. O PostgREST responde 416 com este
// código em vez de uma lista vazia (mesmo comportamento medido em
// `listarMovimentacoes`, que usa `count: 'exact'` como esta query).
const RANGE_INVALIDO = 'PGRST103'

// Lista paginada e filtrada. Sem `params.ordenacao`, ordena por "atualizado em"
// desc (default histórico da tela — OS-F2 3.1.2); com ela, ordena pela coluna
// pedida na URL (F11/T7).
export async function listarAtivos(
  params: ListarAtivosParams,
): Promise<ListarAtivosResult> {
  const supabase = await createClient()
  const pageSize = ehTamanhoPagina(params.pageSize) ? params.pageSize : PAGE_SIZE
  const faixa = (p: number) =>
    queryLista(supabase, params).range(
      (p - 1) * pageSize,
      (p - 1) * pageSize + pageSize - 1,
    )

  let page = Math.max(1, params.page ?? 1)
  let { data, error, count } = await faixa(page)

  // `?page=999` (favorito de página profunda, filtro que encolheu o resultado,
  // URL digitada) não pode derrubar o Server Component: descobrimos o total e
  // mostramos a ÚLTIMA página que existe — a `AtivosPaginacao` já desenha o
  // "X de Y" com o `page` devolvido aqui. Uma tentativa só, sem laço; mesmo
  // tratamento de `listarMovimentacoes`.
  if (error?.code === RANGE_INVALIDO) {
    const { count: total, error: erroTotal } = await queryLista(
      supabase,
      params,
      true,
    )
    if (erroTotal) throw new Error(`Falha ao listar ativos: ${erroTotal.message}`)
    page = Math.max(1, Math.ceil((total ?? 0) / pageSize))
    ;({ data, error, count } = await faixa(page))
  }

  if (error) throw new Error(`Falha ao listar ativos: ${error.message}`)

  const rows: AtivoLista[] = (data ?? []).map((r) => {
    const filial = r.filiais as FilialEmbed
    return {
      id: r.id,
      patrimonio: r.patrimonio,
      service_tag: r.service_tag,
      categoria: r.categoria,
      marca: r.marca,
      modelo: r.modelo,
      status: r.status,
      colaborador_atual: r.colaborador_atual,
      filial_nome: filial?.nome ?? '—',
      updated_at: r.updated_at,
      pendencia: r.pendencia,
    }
  })

  // Patrimônios null (ativos sem plaqueta) não entram na conta de duplicidade.
  const patrimoniosDuplicados = patrimoniosRepetidos(
    rows.map((r) => r.patrimonio).filter((p): p is string => p !== null),
  )

  return {
    rows,
    total: count ?? 0,
    page,
    // O tamanho EFETIVAMENTE usado (não o pedido): a paginação da tela precisa
    // calcular "X de Y" com o mesmo número que foi para o `range()`.
    pageSize,
    patrimoniosDuplicados,
  }
}

// Ficha completa do ativo (OS-F2 3.2).
export type AtivoFicha = Tables<'ativos'> & {
  filial_nome: string
  filial_slug: string
}

export async function buscarAtivoPorId(id: string): Promise<AtivoFicha | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ativos')
    .select('*, filiais(slug, nome)')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Falha ao buscar ativo: ${error.message}`)
  if (!data) return null

  const { filiais, ...ativo } = data
  const filial = filiais as FilialEmbed
  return {
    ...(ativo as Tables<'ativos'>),
    filial_nome: filial?.nome ?? '—',
    filial_slug: filial?.slug ?? '',
  }
}

// F14/MN4 — vínculo de sucessão (devolução ao fornecedor). Dados mínimos p/ o
// link cruzado na ficha (patrimônio + id), sem carregar a ficha inteira.
export type VinculoAtivo = { id: string; patrimonio: string | null }

// O ativo ANTIGO (que ESTE substitui) — resolve `ativos.substitui_ativo_id`.
export async function buscarVinculoAtivo(
  ativoId: string,
): Promise<VinculoAtivo | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ativos')
    .select('id, patrimonio')
    .eq('id', ativoId)
    .maybeSingle()
  if (error) throw new Error(`Falha ao buscar ativo vinculado: ${error.message}`)
  return (data as VinculoAtivo | null) ?? null
}

// Quem SUBSTITUIU este ativo (o novo aponta para ESTE via substitui_ativo_id).
export async function buscarSubstitutoDe(
  ativoId: string,
): Promise<VinculoAtivo | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ativos')
    .select('id, patrimonio')
    .eq('substitui_ativo_id', ativoId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Falha ao buscar substituto: ${error.message}`)
  return (data as VinculoAtivo | null) ?? null
}

// Anotação avulsa na linha do tempo (F3B). Imutável, com autor + data/hora.
export type AnotacaoTimeline = {
  id: string
  texto: string
  autor_nome: string | null
  created_at: string
}

export async function listarAnotacoesDoAtivo(
  ativoId: string,
): Promise<AnotacaoTimeline[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('anotacoes')
    .select('id, texto, created_at, autor:profiles!anotacoes_criado_por_fkey(nome)')
    .eq('ativo_id', ativoId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Falha ao carregar anotações: ${error.message}`)
  type Row = {
    id: string
    texto: string
    created_at: string
    autor: { nome: string | null } | null
  }
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    texto: r.texto,
    autor_nome: r.autor?.nome ?? null,
    created_at: r.created_at,
  }))
}

// Resumo p/ chip/combobox do fluxo de movimentacao.
export type AtivoResumo = {
  id: string
  // null = ativo sem patrimônio físico (import F7E) — a UI mostra "sem patrimônio".
  patrimonio: string | null
  service_tag: string | null
  categoria: CategoriaAtivo
  marca: string | null
  modelo: string | null
  status: StatusAtivo
  // Quem está com o ativo hoje (F9/M2): a busca do combobox varre este campo e o
  // dropdown mostra o nome — "qual notebook é de qual Fulano".
  colaborador_atual: string | null
  filial_id: number
  filial_nome: string
  termo_assinado: TermoStatus | null
  patrimonio_duplicado: boolean
}

// Linha crua aceita por `resumoDe` — exportada junto com o mapeador porque
// `queries/movimentacoes.ts` monta o mesmo resumo a partir de um EMBED
// (`ativos(<RESUMO_SELECT>)`) e precisa tipar a linha antes do cast (F10/M3).
export type RawAtivoResumo = {
  id: string
  patrimonio: string | null
  service_tag: string | null
  categoria: CategoriaAtivo
  marca: string | null
  modelo: string | null
  status: StatusAtivo
  colaborador_atual: string | null
  filial_id: number
  termo_assinado: TermoStatus | null
  filiais: FilialEmbed
}

// Exportado na F10: `queries/movimentacoes.ts` (recentes do operador) reusa o
// MESMO mapeamento — resumo divergente entre combobox e sugestões viraria bug.
export function resumoDe(
  r: {
    id: string
    patrimonio: string | null
    service_tag: string | null
    categoria: CategoriaAtivo
    marca: string | null
    modelo: string | null
    status: StatusAtivo
    colaborador_atual: string | null
    filial_id: number
    termo_assinado: TermoStatus | null
    filiais: FilialEmbed
  },
  duplicado: boolean,
): AtivoResumo {
  return {
    id: r.id,
    patrimonio: r.patrimonio,
    service_tag: r.service_tag,
    categoria: r.categoria,
    marca: r.marca,
    modelo: r.modelo,
    status: r.status,
    colaborador_atual: r.colaborador_atual,
    filial_id: r.filial_id,
    filial_nome: r.filiais?.nome ?? '—',
    termo_assinado: r.termo_assinado,
    patrimonio_duplicado: duplicado,
  }
}

// Exportado na F10: usado como EMBED em `queries/movimentacoes.ts`
// (`ativos(${RESUMO_SELECT})`) — uma lista de colunas só.
export const RESUMO_SELECT =
  'id, patrimonio, service_tag, categoria, marca, modelo, status, colaborador_atual, filial_id, termo_assinado, filiais(slug, nome)'

// Quais desses patrimonios existem em mais de um ativo (duplicidade legitima §5).
// Exportado na F10 pelo mesmo motivo de `resumoDe`: as queries novas também
// precisam preencher `AtivoResumo.patrimonio_duplicado`.
export async function patrimoniosDuplicados(
  supabase: Awaited<ReturnType<typeof createClient>>,
  patrimonios: string[],
): Promise<Set<string>> {
  const unicos = [...new Set(patrimonios)]
  if (unicos.length === 0) return new Set()
  const { data, error } = await supabase
    .from('ativos')
    .select('patrimonio')
    .in('patrimonio', unicos)
  // Falha de leitura NÃO pode virar "nenhum patrimônio é duplicado": esta é a
  // única fonte de `AtivoResumo.patrimonio_duplicado`, e é essa flag que faz a UI
  // mostrar a service tag — o desempate do par patrimônio+tag (spec §5). Sem ela,
  // dois ativos legítimos de mesmo patrimônio aparecem IDÊNTICOS no combobox e a
  // movimentação vai para a máquina errada. Todas as leituras irmãs deste arquivo
  // já propagam o erro; esta era a exceção.
  if (error)
    throw new Error(`Falha ao verificar patrimônios duplicados: ${error.message}`)
  return patrimoniosRepetidos(
    (data ?? []).map((r) => r.patrimonio).filter((p): p is string => p !== null),
  )
}

// Busca do combobox (OS-F2 3.5.1): "campo único" por patrimônio OU marca OU modelo
// OU service tag OU hostname (F7E — o ativo sem patrimônio precisa ser encontrável
// no fluxo de movimentação; a plaqueta pode não existir, mas a tag/hostname
// identificam) OU colaborador atual (F9/M2 — a lista `/ativos` já buscava por
// colaborador e o combobox não; quem sabe o nome do colaborador não precisa mais
// descobrir o patrimônio antes de movimentar).
// Cada palavra do termo casa em algum campo ("dell latitude" acha
// marca "Dell" + modelo "Latitude 5420"). Até 12 resultados. Ordena null-last
// (patrimônio nulo cai no fim; NULLS FIRST é o default do PostgREST em asc, então
// força nullsFirst:false).
export async function buscarAtivosParaCombobox(
  term: string,
): Promise<AtivoResumo[]> {
  const palavras = palavrasDaBusca(term)
  // Guarda de 2 chars: evita varrer a base com termo curtíssimo (era `termo.length < 2`).
  if (palavras.join('').length < 2) return []
  const supabase = await createClient()

  let query = supabase.from('ativos').select(RESUMO_SELECT)
  for (const palavra of palavras) {
    query = query.or(
      `patrimonio.ilike.%${palavra}%,colaborador_atual.ilike.%${palavra}%,marca.ilike.%${palavra}%,modelo.ilike.%${palavra}%,service_tag.ilike.%${palavra}%,hostname.ilike.%${palavra}%`,
    )
  }

  const { data, error } = await query
    .order('patrimonio', { ascending: true, nullsFirst: false })
    .limit(12)

  if (error) throw new Error(`Falha na busca de ativos: ${error.message}`)
  const rows = (data ?? []) as unknown as Parameters<typeof resumoDe>[0][]
  const dups = await patrimoniosDuplicados(
    supabase,
    rows.map((r) => r.patrimonio).filter((p): p is string => p !== null),
  )
  return rows.map((r) =>
    resumoDe(r, r.patrimonio !== null && dups.has(r.patrimonio)),
  )
}

// Linha do export CSV de ativos (F10/T5 — CONTRATO §1.5 da OS-F10).
export type LinhaExportAtivo = {
  patrimonio: string | null
  service_tag: string | null
  hostname: string | null
  categoria: CategoriaAtivo
  marca: string | null
  modelo: string | null
  // F25 — campos do celular. Saem preenchidos só nos celulares; nas demais
  // categorias a coluna fica vazia (decisão registrada: uma coluna vazia é mais
  // barata que um segundo arquivo de export).
  telefone: string | null
  imei: string | null
  pulsus: string | null
  filial_nome: string
  status: StatusAtivo
  colaborador_atual: string | null
  setor_atual: string | null
  // ATV-02 — exposta para o CSV; falta só a coluna "Pendência" em
  // `COLUNAS_ATIVOS` (src/lib/actions/exportar.ts, arquivo do orquestrador).
  pendencia: string | null
}

const EXPORT_SELECT =
  'patrimonio, service_tag, hostname, categoria, marca, modelo, telefone, imei, pulsus, status, colaborador_atual, setor_atual, pendencia, filiais(slug, nome)'

// Tamanho do bloco de leitura. O Max Rows do PostgREST (default 1.000 no
// Supabase) corta requests maiores EM SILÊNCIO — pedir 5.000 de uma vez devolve
// 1.000 sem erro nenhum. Verificado em DEV: nenhum `pgrst.db_max_rows` nos
// papéis (`pg_db_role_setting`), ou seja, vale o default do serviço.
const BLOCO_EXPORT = 1000

type RawExportRow = {
  patrimonio: string | null
  service_tag: string | null
  hostname: string | null
  categoria: CategoriaAtivo
  marca: string | null
  modelo: string | null
  telefone: string | null
  imei: string | null
  pulsus: string | null
  status: StatusAtivo
  colaborador_atual: string | null
  setor_atual: string | null
  pendencia: string | null
  filiais: FilialEmbed
}

// Leitura em blocos p/ o export CSV (F10/T5). Mesmos filtros e ordem de
// `listarAtivos` (`aplicarFiltrosAtivos` é a fonte única dos filtros), sem
// paginação de tela: acumula em blocos de `.range()` porque o Max Rows do
// PostgREST corta requests grandes EM SILÊNCIO. `total` vem de count 'exact';
// quem decide "truncado" é a camada de cima, por `linhas.length < total`.
//
// `params.page`, `params.pageSize` e `params.ordenacao` são IGNORADOS de
// propósito — o export é da consulta inteira, não da página aberta, e a ordem
// dele precisa ser estável em blocos (`updated_at desc, id asc`).
export async function listarAtivosParaExport(
  params: ListarAtivosParams,
  cap = 5000,
): Promise<{ linhas: LinhaExportAtivo[]; total: number }> {
  const supabase = await createClient()
  // Cap abaixo de 1 não faz sentido (e devolveria `total: 0`, quebrando o cálculo
  // de "truncado" de quem chamou) — clampa em 1 bloco mínimo de 1 linha.
  const teto = Math.max(1, Math.trunc(cap))
  const linhas: LinhaExportAtivo[] = []
  let total = 0
  let offset = 0

  while (offset < teto) {
    const ate = Math.min(offset + BLOCO_EXPORT, teto) - 1
    // `count: 'exact'` só no 1º bloco: o total não muda entre os blocos e a
    // contagem exata custa uma varredura a cada request.
    let query = supabase
      .from('ativos')
      .select(EXPORT_SELECT, offset === 0 ? { count: 'exact' } : undefined)
    query = aplicarFiltrosAtivos(query, params)
    // `updated_at` sozinho não é único: sem desempate estável, o bloco 2 pode
    // repetir/pular linhas do bloco 1. `id` é a chave primária — refina a ordem
    // da tela sem mudá-la.
    const { data, error, count } = await query
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, ate)

    if (error) throw new Error(`Falha ao exportar ativos: ${error.message}`)
    total = count ?? total

    const bloco = (data ?? []) as unknown as RawExportRow[]
    for (const r of bloco) {
      linhas.push({
        patrimonio: r.patrimonio,
        service_tag: r.service_tag,
        hostname: r.hostname,
        categoria: r.categoria,
        marca: r.marca,
        modelo: r.modelo,
        telefone: r.telefone,
        imei: r.imei,
        pulsus: r.pulsus,
        filial_nome: r.filiais?.nome ?? '—',
        status: r.status,
        colaborador_atual: r.colaborador_atual,
        setor_atual: r.setor_atual,
        pendencia: r.pendencia,
      })
    }

    // Avança pelo que REALMENTE chegou, nunca pelo que foi pedido: o Max Rows do
    // PostgREST corta o request maior EM SILÊNCIO, e um passo fixo (`ate + 1`)
    // fazia o laço parar no primeiro bloco truncado — o CSV saía com o teto do
    // serviço em vez do cap de 5.000. Mesma disciplina de
    // `listarHistoricoParaExport` e `listarPendenciasParaExport`.
    if (bloco.length === 0) break
    offset += bloco.length
    if (offset >= total) break
  }

  return { linhas, total }
}

// M6 (rascunho) — resumos por id PRESERVANDO a ordem pedida. Ids inexistentes
// simplesmente não voltam: quem chamou descobre pela diferença de tamanho (é
// assim que a UI avisa "1 ativo do rascunho não existe mais").
export async function buscarAtivosResumoPorIds(
  ids: string[],
): Promise<AtivoResumo[]> {
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ativos')
    .select(RESUMO_SELECT)
    .in('id', unicos)
  if (error) throw new Error(`Falha ao buscar ativos: ${error.message}`)

  const rows = (data ?? []) as unknown as RawAtivoResumo[]
  const dups = await patrimoniosDuplicados(
    supabase,
    rows.map((r) => r.patrimonio).filter((p): p is string => p !== null),
  )
  const porId = new Map(
    rows.map((r) => [
      r.id,
      resumoDe(r, r.patrimonio !== null && dups.has(r.patrimonio)),
    ]),
  )
  // Ordem = a pedida (a do rascunho), não a que o Postgres devolveu.
  return unicos
    .map((id) => porId.get(id))
    .filter((a): a is AtivoResumo => a !== undefined)
}

// M1 (colar lista) — todos os ativos cujos patrimônios estão na lista. Devolve
// TODOS os candidatos de cada patrimônio: a duplicidade legítima (§5) é
// resolvida por quem chamou (service tag da linha ou escolha do operador),
// nunca aqui.
export async function buscarAtivosPorPatrimonios(
  patrimonios: string[],
): Promise<AtivoResumo[]> {
  const unicos = [...new Set(patrimonios)]
  if (unicos.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ativos')
    .select(RESUMO_SELECT)
    .in('patrimonio', unicos)
    .order('patrimonio', { ascending: true, nullsFirst: false })
  if (error) throw new Error(`Falha ao buscar ativos: ${error.message}`)

  const rows = (data ?? []) as unknown as RawAtivoResumo[]
  // Duplicidade calculada sobre o próprio resultado: aqui vieram TODOS os
  // ativos de cada patrimônio pedido, então repetição no resultado == patrimônio
  // duplicado no acervo (sem uma 2ª ida ao banco).
  const dups = patrimoniosRepetidos(
    rows.map((r) => r.patrimonio).filter((p): p is string => p !== null),
  )
  return rows.map((r) =>
    resumoDe(r, r.patrimonio !== null && dups.has(r.patrimonio)),
  )
}

// Resumo de um ativo por id (preselecao vinda da ficha / duplicar).
export async function buscarAtivoResumo(id: string): Promise<AtivoResumo | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ativos')
    .select(RESUMO_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Falha ao buscar ativo: ${error.message}`)
  if (!data) return null
  const row = data as unknown as Parameters<typeof resumoDe>[0]
  const dups = await patrimoniosDuplicados(
    supabase,
    row.patrimonio !== null ? [row.patrimonio] : [],
  )
  return resumoDe(row, row.patrimonio !== null && dups.has(row.patrimonio))
}
