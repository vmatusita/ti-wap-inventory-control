import { createClient } from '@/lib/supabase/server'
import { eAcaoAdmin } from '@/lib/auditoria'
import type { Json } from '@/lib/types/database'

// Leitura da TRILHA de auditoria (F21 — tabela `eventos_admin`, migration 0065). Serve a
// aba "Auditoria" de /admin/usuarios.
//
// Lê pelo client DE SESSÃO, e isto é deliberado: `eventos_admin` tem uma única policy,
// `select ... using (e_admin())`. Quem não é admin recebe ZERO linhas do próprio Postgres —
// a tela é a segunda linha de defesa, não a única. Usar o service role aqui trocaria essa
// garantia por um "confie no gate da rota", que é exatamente o que a F21 veio desfazer.
//
// A escrita não mora aqui: é `registrarEventoAdmin` (src/lib/auditoria-registro.ts), pelo
// service role, porque a tabela não tem policy de insert. Trilha que o auditado escreve não
// é trilha.

export type EventoAdminLinha = {
  id: string
  quando: string
  acao: string
  alvo: string | null
  detalhe: Json | null
  /** Nome do autor resolvido por join em `profiles`. null = perfil removido depois. */
  autorNome: string | null
}

export type ListarEventosAdminParams = {
  page?: number
  pageSize?: number
  /** Filtro por verbo. Valor fora do vocabulário de `src/lib/auditoria.ts` é ignorado. */
  acao?: string | null
}

export type ListarEventosAdminResult = {
  linhas: EventoAdminLinha[]
  page: number
  pageSize: number
  total: number
}

export const EVENTOS_PAGE_SIZE = 25

// Faixa pedida além do fim do resultado: o PostgREST responde 416 com este código em vez de
// uma lista vazia. Mesmo tratamento de `listarMovimentacoes` (queries/movimentacoes.ts).
const RANGE_INVALIDO = 'PGRST103'

type RawLinha = {
  id: string
  quando: string
  acao: string
  alvo: string | null
  detalhe: Json | null
  autor: { nome: string | null } | null
}

// Da mais recente para a mais antiga. `id` desempata para a paginação ser determinística
// quando dois eventos caem no mesmo microssegundo (convite + auditoria em lote).
function query(
  supabase: Awaited<ReturnType<typeof createClient>>,
  acao: string | null,
  head = false,
) {
  let q = supabase
    .from('eventos_admin')
    .select('id, quando, acao, alvo, detalhe, autor:profiles!eventos_admin_autor_fkey(nome)', {
      count: 'exact',
      head,
    })
  if (acao) q = q.eq('acao', acao)
  return q.order('quando', { ascending: false }).order('id', { ascending: false })
}

export async function listarEventosAdmin(
  params: ListarEventosAdminParams = {},
): Promise<ListarEventosAdminResult> {
  const supabase = await createClient()
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? EVENTOS_PAGE_SIZE))
  // Verbo desconhecido na URL não filtra nada (em vez de devolver lista vazia sem explicação
  // — o vocabulário é fechado em src/lib/auditoria.ts).
  const acao = params.acao && eAcaoAdmin(params.acao) ? params.acao : null

  const faixa = (p: number) =>
    query(supabase, acao).range((p - 1) * pageSize, (p - 1) * pageSize + pageSize - 1)

  let page = Math.max(1, params.page ?? 1)
  let { data, error, count } = await faixa(page)

  // `?page=900` (link velho, filtro que encolheu o resultado) não pode derrubar o Server
  // Component: descobre o total e mostra a ÚLTIMA página que existe. Uma tentativa, sem laço.
  if (error?.code === RANGE_INVALIDO) {
    const { count: total, error: erroTotal } = await query(supabase, acao, true)
    if (erroTotal) throw new Error(`Falha ao listar a auditoria: ${erroTotal.message}`)
    page = Math.max(1, Math.ceil((total ?? 0) / pageSize))
    ;({ data, error, count } = await faixa(page))
  }

  if (error) throw new Error(`Falha ao listar a auditoria: ${error.message}`)

  const linhas = ((data ?? []) as unknown as RawLinha[]).map((l) => ({
    id: l.id,
    quando: l.quando,
    acao: l.acao,
    alvo: l.alvo,
    detalhe: l.detalhe,
    autorNome: l.autor?.nome ?? null,
  }))

  return { linhas, page, pageSize, total: count ?? 0 }
}
