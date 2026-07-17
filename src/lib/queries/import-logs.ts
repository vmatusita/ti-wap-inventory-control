import type { SupabaseClient } from '@supabase/supabase-js'
import { chavePatrimonio } from '@/lib/patrimonio'
import type { Database } from '@/lib/types/database'

// Leituras da tela admin/importar (OS-F7 / W3): custo da substituição por filial,
// histórico de imports e export do acervo para o backup pré-import. Todas recebem
// um `client` já resolvido (o operador logado) — a RPC/backup exigem a sessão
// autenticada (RLS 0005/0017/0021 dá select ao `authenticated`).

type DbClient = SupabaseClient<Database>
type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

// Contagem do que a substituição APAGA nesta filial (espelha o DELETE da RPC
// 0032: movs/anotações dos ativos da filial + termos "puros" da filial).
export type CustoSubstituir = {
  ativos: number
  movimentacoes: number
  anotacoes: number
  termos: number
}

// Termo que mistura ESTA filial com outra — o preview bloqueia o passo 4 e a RPC
// tem a mesma rede de segurança (não dá para apagar só metade de um termo).
export type TermoMultiFilial = {
  id: string
  tipo: string
  colaborador: string | null
}

// Acervo exportado para o backup (JSON) gravado ANTES da RPC destrutiva.
export type AcervoFilial = {
  ativos: Row<'ativos'>[]
  movimentacoes: Row<'movimentacoes'>[]
  anotacoes: Row<'anotacoes'>[]
  termos_gerados: Row<'termos_gerados'>[]
}

// `.in('ativo_id', [...])` monta o filtro na URL — mil UUIDs estouram o limite.
// Quebramos em lotes; a chave natural (ativo_id) particiona sem sobreposição, então
// somar contagens / concatenar linhas de lotes distintos é seguro.
const LOTE = 100

function emLotes<T>(itens: T[], n = LOTE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < itens.length; i += n) out.push(itens.slice(i, i + n))
  return out
}

async function idsDaFilial(client: DbClient, filialId: number): Promise<string[]> {
  const { data, error } = await client
    .from('ativos')
    .select('id')
    .eq('filial_id', filialId)
  if (error) throw new Error(`Falha ao listar ativos da filial: ${error.message}`)
  return (data ?? []).map((r) => r.id)
}

async function contarMovs(client: DbClient, ids: string[]): Promise<number> {
  let total = 0
  for (const lote of emLotes(ids)) {
    const { count, error } = await client
      .from('movimentacoes')
      .select('*', { count: 'exact', head: true })
      .in('ativo_id', lote)
    if (error) throw new Error(`Falha ao contar movimentações: ${error.message}`)
    total += count ?? 0
  }
  return total
}

async function contarAnotacoes(client: DbClient, ids: string[]): Promise<number> {
  let total = 0
  for (const lote of emLotes(ids)) {
    const { count, error } = await client
      .from('anotacoes')
      .select('*', { count: 'exact', head: true })
      .in('ativo_id', lote)
    if (error) throw new Error(`Falha ao contar anotações: ${error.message}`)
    total += count ?? 0
  }
  return total
}

/**
 * F7C — quais dos pares (patrimônio, service tag) do CSV já existem no banco em
 * OUTRA filial. Devolve `chavePatrimonio(patrimonio, serviceTag)` → nome da filial
 * onde o ativo está hoje.
 *
 * Por que existe: `ativos_patrimonio_service_tag_uidx` é GLOBAL — `(patrimonio,
 * coalesce(service_tag,''))` sem `filial_id`. O "Substituir tudo" só apaga o acervo
 * da filial SELECIONADA, então um ativo do CSV que esteja cadastrado em outra filial
 * sobrevive ao DELETE e faz o INSERT da RPC estourar o índice ("Já existe um ativo
 * com esse patrimônio e service tag") — depois do backup e da confirmação, sem que o
 * preview tivesse apontado a linha. O motor é puro e não fala com o banco: esta
 * query alimenta o 5º parâmetro de `validarCsvImport`.
 *
 * A comparação é EXATA (patrimônio + `service_tag ?? ''`), igual ao índice — casar
 * por tag normalizada acusaria colisão que o banco não teria.
 */
export async function paresEmOutrasFiliais(
  client: DbClient,
  filialId: number,
  patrimonios: string[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const unicos = [...new Set(patrimonios)]
  if (unicos.length === 0) return mapa

  for (const lote of emLotes(unicos)) {
    const { data, error } = await client
      .from('ativos')
      .select('patrimonio, service_tag, filiais(nome)')
      .in('patrimonio', lote)
      .neq('filial_id', filialId)
    if (error) throw new Error(`Falha ao conferir patrimônios em outras filiais: ${error.message}`)
    for (const a of data ?? []) {
      const nome = (a.filiais as { nome: string } | null)?.nome
      if (!nome) continue
      mapa.set(chavePatrimonio(a.patrimonio, a.service_tag), nome)
    }
  }
  return mapa
}

// Custo da substituição + termos multi-filial que a bloqueiam. Usado no preview e
// (revalidando) no aplicar. Os termos_gerados não têm FK para ativos (ativo_ids é
// array de uuid), então classificamos em memória contra o conjunto de ids da filial.
export async function custoSubstituir(
  client: DbClient,
  filialId: number,
): Promise<{ custo: CustoSubstituir; termosMultiFilial: TermoMultiFilial[] }> {
  const ids = await idsDaFilial(client, filialId)
  const filialSet = new Set(ids)

  const [movimentacoes, anotacoes, termosRes] = await Promise.all([
    contarMovs(client, ids),
    contarAnotacoes(client, ids),
    client.from('termos_gerados').select('id, tipo, colaborador, ativo_ids'),
  ])
  if (termosRes.error) {
    throw new Error(`Falha ao ler termos gerados: ${termosRes.error.message}`)
  }

  let termos = 0
  const termosMultiFilial: TermoMultiFilial[] = []
  for (const t of termosRes.data ?? []) {
    const tocaEsta = t.ativo_ids.some((a) => filialSet.has(a))
    if (!tocaEsta) continue
    const tocaOutra = t.ativo_ids.some((a) => !filialSet.has(a))
    if (tocaOutra) {
      termosMultiFilial.push({ id: t.id, tipo: t.tipo, colaborador: t.colaborador })
    } else {
      termos += 1
    }
  }

  return {
    custo: { ativos: ids.length, movimentacoes, anotacoes, termos },
    termosMultiFilial,
  }
}

// Só as 4 contagens — para comparar o estado da filial entre o preview e o aplicar
// (se mudou, o aplicar aborta e pede para regerar o preview).
export async function contagensParaRevalidar(
  client: DbClient,
  filialId: number,
): Promise<CustoSubstituir> {
  return (await custoSubstituir(client, filialId)).custo
}

// Exporta o acervo da filial para o backup (JSON) gravado antes da RPC. Espelha o
// escopo do DELETE da RPC: ativos da filial, suas movs/anotações e os termos que
// tocam a filial (após a guarda multi-filial, todos são "puros" dela).
export async function exportarAcervoFilial(
  client: DbClient,
  filialId: number,
): Promise<AcervoFilial> {
  const ids = await idsDaFilial(client, filialId)
  const filialSet = new Set(ids)

  const { data: ativos, error: ativosErr } = await client
    .from('ativos')
    .select('*')
    .eq('filial_id', filialId)
  if (ativosErr) throw new Error(`Falha ao exportar ativos: ${ativosErr.message}`)

  const movimentacoes: Row<'movimentacoes'>[] = []
  for (const lote of emLotes(ids)) {
    const { data, error } = await client
      .from('movimentacoes')
      .select('*')
      .in('ativo_id', lote)
    if (error) throw new Error(`Falha ao exportar movimentações: ${error.message}`)
    if (data) movimentacoes.push(...data)
  }

  const anotacoes: Row<'anotacoes'>[] = []
  for (const lote of emLotes(ids)) {
    const { data, error } = await client
      .from('anotacoes')
      .select('*')
      .in('ativo_id', lote)
    if (error) throw new Error(`Falha ao exportar anotações: ${error.message}`)
    if (data) anotacoes.push(...data)
  }

  const { data: todosTermos, error: termosErr } = await client
    .from('termos_gerados')
    .select('*')
  if (termosErr) throw new Error(`Falha ao exportar termos: ${termosErr.message}`)
  const termos_gerados = (todosTermos ?? []).filter((t) =>
    t.ativo_ids.some((a) => filialSet.has(a)),
  )

  return { ativos: ativos ?? [], movimentacoes, anotacoes, termos_gerados }
}

// ---------------------------------------------------------------------------

export type ImportLogRow = {
  id: string
  filialNome: string
  filialSlug: string
  quem: string
  criadoEm: string
  totalLinhas: number
  ativosCriados: number
  movsApagadas: number
  anotacoesApagadas: number
  termosApagados: number
  backupPath: string
  /** F7B — quantas correções foram declaradas na tela neste import (0 nos antigos). */
  correcoes: number
}

// Histórico de imports (auditoria). Join em filiais (nome/slug) e profiles (nome
// de quem importou) pelas FKs do 0031. Ordenado do mais recente para o mais antigo.
export async function listarImportLogs(
  client: DbClient,
  limite = 50,
): Promise<ImportLogRow[]> {
  const { data, error } = await client
    .from('import_logs')
    .select(
      'id, total_linhas, ativos_criados, movs_apagadas, anotacoes_apagadas, termos_apagados, backup_path, correcoes, created_at, filiais(nome, slug), profiles(nome)',
    )
    .order('created_at', { ascending: false })
    .limit(limite)
  if (error) throw new Error(`Falha ao listar imports: ${error.message}`)

  return (data ?? []).map((l) => ({
    id: l.id,
    filialNome: l.filiais?.nome ?? '—',
    filialSlug: l.filiais?.slug ?? '',
    quem: l.profiles?.nome?.trim() || '—',
    criadoEm: l.created_at,
    totalLinhas: l.total_linhas,
    ativosCriados: l.ativos_criados,
    movsApagadas: l.movs_apagadas,
    anotacoesApagadas: l.anotacoes_apagadas,
    termosApagados: l.termos_apagados,
    backupPath: l.backup_path,
    // jsonb (default '[]'); imports da F7 e qualquer valor fora do formato → 0.
    correcoes: Array.isArray(l.correcoes) ? l.correcoes.length : 0,
  }))
}
