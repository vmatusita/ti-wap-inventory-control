import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { type CategoriaAtivo } from '@/lib/dominio'
import { BLOCO_EXPORT, CAP_EXPORT, MAX_BLOCOS_EXPORT } from '@/lib/csv'
import type { DbClient } from '@/lib/auth/acesso'
import { ROTULO_TIPO_PENDENCIA, type TipoPendencia } from '@/lib/pendencias/rotulos'
import {
  ILIKE_ITENS_FALTANTES,
  OR_PATRIMONIO,
  PREFIXO_ITENS_FALTANTES,
  TEXTOS_PATRIMONIO,
  TEXTO_TERMO_PENDENTE,
  TEXTO_TRIAGEM_PARADA,
} from '@/lib/pendencias/filtro'

// Lista detalhada de pendências para a página interna /pendencias (só operador —
// F6A/A5). Lê a v_pendencias ESTENDIDA (0028). Roda sob o client do operador
// (RLS); o viewer nunca chega aqui (o proxy bloqueia /pendencias). `desde` e a
// ordenação vêm do banco; o bucket é derivado do texto de `pendencia`.

const PAGE_SIZE = 30

// TipoPendencia, ROTULO_TIPO_PENDENCIA e as cores vivem em @/lib/pendencias/rotulos
// (client-safe — a fila virou Client Component na F18). Re-exportados para os
// consumidores server (esta camada e o export CSV) manterem o mesmo import.
export { ROTULO_TIPO_PENDENCIA }
export type { TipoPendencia }

export type PendenciaDetalhe = {
  id: string
  // Chave ÚNICA por LINHA da fila (F18): id do ativo nos não-item; id da pendência
  // de item nos de item — um mesmo ativo pode ter termo pendente E itens abertos.
  // É a React key e o desempate estável da paginação/CSV.
  ordem: string
  // Só nas linhas de item (a ação "Resolver" mira este id); null nas demais.
  pendenciaItemId: string | null
  // O item faltante (só nas linhas de item); null nas demais.
  item: string | null
  patrimonio: string | null
  categoria: CategoriaAtivo | null
  filialSlug: string | null
  filialNome: string | null
  pendencia: string | null
  colaborador: string | null
  setor: string | null
  marca: string | null
  modelo: string | null
  tipo: TipoPendencia
  desde: string | null // timestamptz
}

export type ListaPendencias = {
  rows: PendenciaDetalhe[]
  total: number
  page: number
  pageSize: number
}

/**
 * Os tipos que a FILA (`v_fila_pendencias`) sabe produzir.
 *
 * F24 — 'conflito' fica de fora, e a exclusão é no TIPO de propósito. As linhas de conflito
 * vêm das views de conflito (0092/0096), não da fila; se `queryPendencias` recebesse
 * `tipo: 'conflito'`, nenhum ramo do `if/else` casaria e a query sairia SEM FILTRO NENHUM —
 * devolvendo a fila inteira como se fosse o resultado do filtro. É exatamente a classe de
 * falha silenciosa que já mordeu esta tela em 25/07/2026. Com a exclusão no tipo, o
 * compilador obriga cada chamador a decidir o que fazer com o conflito.
 */
export type TipoFila = Exclude<TipoPendencia, 'conflito'>

// Filtros da tela (sem paginação) — compartilhados pela lista e pelo export CSV
// (OS-F10 · T5), para que o arquivo saia com EXATAMENTE as linhas visíveis.
export type FiltrosPendencias = {
  // F25 — multi-seleção por SLUG (`v_fila_pendencias.filial` expõe o slug, não o
  // id). Lista vazia/ausente = sem recorte.
  filialSlugs?: readonly string[]
  tipo?: TipoFila | null
  q?: string | null
}

// Deriva o bucket a partir do texto canônico da view (mesmos rótulos de getPendencias).
// O bucket 'patrimonio' (F7E) casa quando a pendência CONTÉM 'sem patrimônio físico'
// (importados sem plaqueta) OU 'patrimônio não canônico' (os 61 do go-live F4). A
// pendência é `;`-joinable, então usamos `includes` (não igualdade) — coerente com
// o filtro SQL de `listarPendencias` (ilike %...%). Precede o fallback 'outras'.
//
// Os textos vêm de `@/lib/pendencias/filtro` — o MESMO módulo de onde saem os
// predicados PostgREST de `queryPendencias` e de `contarPendencia` (os chips). Esta
// função é a leitura em TypeScript da mesma regra; escrever os literais aqui de novo
// era o caminho para o badge da linha e a aba discordarem.
export function classificarPendencia(pendencia: string | null): TipoPendencia {
  if (pendencia === TEXTO_TERMO_PENDENTE) return 'termo'
  if (pendencia === TEXTO_TRIAGEM_PARADA) return 'triagem'
  const p = pendencia?.toLowerCase() ?? ''
  if (p.startsWith(PREFIXO_ITENS_FALTANTES)) return 'itens'
  if (TEXTOS_PATRIMONIO.some((t) => p.includes(t.toLowerCase()))) return 'patrimonio'
  return 'outras'
}

// Contagem de pendências abertas para o badge da sidebar (OS-F9 / T2). Usa a
// MESMA fonte da página /pendencias (a view v_fila_pendencias, sem filtro nenhum):
// o badge conta exatamente o que `listarPendencias` lista quando não há filtro —
// inclui, desde a F18, uma linha por ITEM faltante aberto (não mais o texto no
// campo livre). `head: true` não traz linha nenhuma — só o count. Roda sob o client
// do operador (RLS); por isso o layout só chama depois de confirmar o operador.
// Falha de leitura NÃO derruba o shell: devolve 0 (sem badge) e registra no log.
export async function contarPendenciasAbertas(): Promise<number> {
  const client = await createClient()
  const { count, error } = await client
    .from('v_fila_pendencias')
    .select('id', { count: 'exact', head: true })

  if (error) {
    console.error(`Falha ao contar pendências: ${error.message}`)
    return 0
  }
  return count ?? 0
}

const PENDENCIA_SELECT =
  'id, ordem, pendencia_item_id, item, patrimonio, categoria, filial, filial_nome, pendencia, colaborador_atual, setor_atual, marca, modelo, desde'

type RowPendencia = {
  id: string | null
  ordem: string | null
  pendencia_item_id: string | null
  item: string | null
  patrimonio: string | null
  categoria: CategoriaAtivo | null
  filial: string | null
  filial_nome: string | null
  pendencia: string | null
  colaborador_atual: string | null
  setor_atual: string | null
  marca: string | null
  modelo: string | null
  desde: string | null
}

function mapearPendencia(r: RowPendencia): PendenciaDetalhe {
  return {
    id: r.id as string,
    ordem: (r.ordem ?? r.id) as string,
    pendenciaItemId: r.pendencia_item_id,
    item: r.item,
    patrimonio: r.patrimonio,
    categoria: r.categoria,
    filialSlug: r.filial,
    filialNome: r.filial_nome,
    pendencia: r.pendencia,
    colaborador: r.colaborador_atual,
    setor: r.setor_atual,
    marca: r.marca,
    modelo: r.modelo,
    tipo: classificarPendencia(r.pendencia),
    desde: r.desde,
  }
}

// Query base (filtros + ordem, sem faixa). Fonte única da semântica de filtro:
// a lista paginada e o export CSV (F10 · T5) partem daqui, então o arquivo nunca
// diverge da tela. Devolve uma query NOVA a cada chamada — o builder do
// postgrest-js é mutável e não se reexecuta com segurança.
function queryPendencias(client: DbClient, opts: FiltrosPendencias, head = false) {
  let query = client
    .from('v_fila_pendencias')
    .select(PENDENCIA_SELECT, { count: 'exact', head })
    .order('desde', { ascending: true, nullsFirst: false })
    // Desempate por `ordem` (F10 · T5 → F18): `desde` empata (medido no ensaio: até
    // 2 linhas no mesmo instante) e ordenação sem critério único NÃO é estável entre
    // requests — com faixas (a paginação da tela e os blocos do export) isso duplica
    // uma linha num bloco e some com ela no outro. `ordem` é único por LINHA (id do
    // ativo nos não-item, id da pendência de item nos de item), ao contrário de `id`,
    // que repete quando um ativo tem termo pendente E itens abertos. Só afeta empates.
    .order('ordem', { ascending: true })

  if (opts.filialSlugs && opts.filialSlugs.length > 0) {
    query = query.in('filial', opts.filialSlugs)
  }

  // Predicados de `@/lib/pendencias/filtro` (fonte única — os chips do relatório usam
  // os MESMOS). 'outras' é a negação dos quatro, na mesma ordem.
  if (opts.tipo === 'termo') query = query.eq('pendencia', TEXTO_TERMO_PENDENTE)
  else if (opts.tipo === 'triagem') query = query.eq('pendencia', TEXTO_TRIAGEM_PARADA)
  else if (opts.tipo === 'itens') query = query.ilike('pendencia', ILIKE_ITENS_FALTANTES)
  else if (opts.tipo === 'patrimonio') query = query.or(OR_PATRIMONIO)
  else if (opts.tipo === 'outras') {
    query = query
      .not('pendencia', 'eq', TEXTO_TERMO_PENDENTE)
      .not('pendencia', 'eq', TEXTO_TRIAGEM_PARADA)
      .not('pendencia', 'ilike', ILIKE_ITENS_FALTANTES)
    for (const texto of TEXTOS_PATRIMONIO) {
      query = query.not('pendencia', 'ilike', `%${texto}%`)
    }
  }

  const termo = opts.q?.trim()
  if (termo) {
    // Sanitiza os metacaracteres do PostgREST/ILIKE antes de interpolar no .or().
    // O `*` entra na lista porque o PostgREST o TRADUZ para `%` no ilike: sem ele,
    // `?q=*` virava `%%%` e devolvia a fila inteira como se fosse o resultado do
    // filtro. Mesma cobertura de `sanitizeTerm` (queries/ativos.ts) e de
    // `prefixoSeguro`/`termoIlikeSeguro` (queries/movimentacoes.ts).
    const esc = termo.replace(/[%_*,()\\]/g, ' ')
    query = query.or(`patrimonio.ilike.%${esc}%,colaborador_atual.ilike.%${esc}%`)
  }

  return query
}

// Faixa pedida além do fim do resultado. O PostgREST responde 416 com este
// código em vez de uma lista vazia — mesma constante e mesmo tratamento de
// `listarMovimentacoes`.
const RANGE_INVALIDO = 'PGRST103'

export async function listarPendencias(
  opts: FiltrosPendencias & { page?: number },
): Promise<ListaPendencias> {
  const client = await createClient()
  const faixa = (p: number) =>
    queryPendencias(client, opts).range((p - 1) * PAGE_SIZE, (p - 1) * PAGE_SIZE + PAGE_SIZE - 1)

  let page = Math.max(1, opts.page ?? 1)
  let { data, error, count } = await faixa(page)

  // Produção tem 1.165 pendências = 39 páginas: `/pendencias?page=39` num
  // favorito, ou um filtro que encolheu o resultado, devolve 416 PGRST103 — e o
  // throw derrubava o SHELL INTEIRO (não havia error.tsx neste segmento), com um
  // "Tentar novamente" que refalha para sempre porque a URL não muda.
  // Descobrimos o total e mostramos a ÚLTIMA página que existe. Uma tentativa
  // só — sem laço.
  if (error?.code === RANGE_INVALIDO) {
    const { count: total, error: erroTotal } = await queryPendencias(client, opts, true)
    if (erroTotal) throw new Error(`Falha ao listar pendências: ${erroTotal.message}`)
    page = Math.max(1, Math.ceil((total ?? 0) / PAGE_SIZE))
    ;({ data, error, count } = await faixa(page))
  }

  if (error) throw new Error(`Falha ao listar pendências: ${error.message}`)

  const rows = (data ?? []).map(mapearPendencia)

  return { rows, total: count ?? 0, page, pageSize: PAGE_SIZE }
}

// Leitura em BLOCOS para o export CSV (F10 · T5): mesmos filtros e mesma ordem
// da tela, sem a paginação de 30. Cada volta pede uma faixa nova a partir do que
// JÁ chegou — nunca de um múltiplo fixo —, porque o Max Rows do PostgREST
// (padrão 1.000 no Supabase) corta o request maior EM SILÊNCIO e devolveria um
// bloco menor que o pedido; avançar pelo recebido mantém o export correto seja
// qual for esse teto. Quem decide "truncado" é a camada de cima, comparando
// `linhas.length < total`.
export async function listarPendenciasParaExport(
  opts: FiltrosPendencias,
  cap = CAP_EXPORT,
): Promise<{ linhas: PendenciaDetalhe[]; total: number }> {
  const client = await createClient()
  const linhas: PendenciaDetalhe[] = []
  let total = 0

  for (let volta = 0; volta < MAX_BLOCOS_EXPORT && linhas.length < cap; volta++) {
    const tamanho = Math.min(BLOCO_EXPORT, cap - linhas.length)
    const { data, error, count } = await queryPendencias(client, opts).range(
      linhas.length,
      linhas.length + tamanho - 1,
    )
    if (error) throw new Error(`Falha ao exportar pendências: ${error.message}`)
    total = count ?? total
    const recebidas = data ?? []
    for (const r of recebidas) linhas.push(mapearPendencia(r))
    if (recebidas.length === 0 || linhas.length >= total) break
  }

  return { linhas, total }
}
