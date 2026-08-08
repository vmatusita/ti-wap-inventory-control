import { createClient } from '@/lib/supabase/server'
import { sanearFiltrosAuditoria } from '@/lib/auditoria'
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
  /** F22 — id do perfil AUTOR. Valor inválido é ignorado (não vira lista vazia). */
  autor?: string | null
  /** F22 — período por DIA, `yyyy-MM-dd`, inclusivo nas duas pontas. */
  de?: string | null
  ate?: string | null
  /** F22 — busca parcial, sem caixa, na coluna `alvo`. */
  alvo?: string | null
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

// F22 — os quatro recortes que a área /dev pede (ordem §4: "ação, autor, período, alvo").
// Até aqui só existia o de AÇÃO, herdado da aba de /admin/usuarios, e ele não responde as
// perguntas que se fazem a uma trilha: "o que o fulano fez?", "o que aconteceu naquela
// semana?", "quem mexeu nesta conta?". Depois que apagar usuário virou possível, a trilha é o
// ÚNICO registro de quem foi apagado — sem recorte ela é ilegível.
export type FiltrosEventos = {
  acao?: string | null
  /** id do perfil AUTOR (`eventos_admin.autor`). */
  autor?: string | null
  /** dd inicial e final, em ISO (`yyyy-MM-dd`), inclusivos nas duas pontas. */
  de?: string | null
  ate?: string | null
  /** busca parcial, sem caixa, na coluna `alvo` (texto legível: e-mail, rótulo). */
  alvo?: string | null
}

// Da mais recente para a mais antiga. `id` desempata para a paginação ser determinística
// quando dois eventos caem no mesmo microssegundo (convite + auditoria em lote).
function query(
  supabase: Awaited<ReturnType<typeof createClient>>,
  f: FiltrosEventos,
  head = false,
) {
  let q = supabase
    .from('eventos_admin')
    .select('id, quando, acao, alvo, detalhe, autor:profiles!eventos_admin_autor_fkey(nome)', {
      count: 'exact',
      head,
    })
  if (f.acao) q = q.eq('acao', f.acao)
  if (f.autor) q = q.eq('autor', f.autor)
  // `quando` é timestamptz e o filtro é por DIA: o fim precisa cobrir o dia inteiro, daí
  // `< dia seguinte` em vez de `<= dia` (que cortaria tudo depois de 00:00:00 do último dia).
  if (f.de) q = q.gte('quando', `${f.de}T00:00:00`)
  if (f.ate) q = q.lt('quando', `${diaSeguinte(f.ate)}T00:00:00`)
  // `%` e `_` são curingas do LIKE: escapados para uma busca por "a_b" não virar "a<algo>b".
  if (f.alvo) q = q.ilike('alvo', `%${f.alvo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
  return q.order('quando', { ascending: false }).order('id', { ascending: false })
}

function diaSeguinte(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Só o que for reconhecível vira filtro. A régua mora em `lib/auditoria.ts`
// (`sanearFiltrosAuditoria`) e é a MESMA que o export CSV da /dev usa — eram duas cópias, e
// a do export tinha a regex de data quebrada, o que fazia o arquivo trazer um recorte
// diferente do da tela.

// Os nomes que podem aparecer em "Quem fez", para o filtro de AUTOR da /dev.
//
// Lê `profiles` e NÃO os autores distintos de `eventos_admin`: a tabela de perfis tem dezenas
// de linhas e a de eventos cresce sem teto, então filtrar pela pequena é mais barato e não
// precisa de DISTINCT (que o PostgREST não expressa bem).
//
// ⚠ SEM o filtro `excluido_em is null`, de propósito — ao contrário de `listarUsuarios`. Quem
// foi APAGADO continua sendo autor de eventos antigos (a trilha sobrevive à exclusão, migration
// 0065), e some do filtro seria justamente perder de vista o que essa pessoa fez.
export async function listarAutoresDaAuditoria(): Promise<{ id: string; nome: string }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome')
    .order('nome', { ascending: true })
  if (error) throw new Error(`Falha ao listar os autores da auditoria: ${error.message}`)
  return (data ?? []).map((p) => ({ id: p.id, nome: p.nome?.trim() || 'sem nome' }))
}

export async function listarEventosAdmin(
  params: ListarEventosAdminParams = {},
): Promise<ListarEventosAdminResult> {
  const supabase = await createClient()
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? EVENTOS_PAGE_SIZE))
  // Verbo desconhecido na URL não filtra nada (em vez de devolver lista vazia sem explicação
  // — o vocabulário é fechado em src/lib/auditoria.ts). Mesma regra para os demais recortes.
  const filtros = sanearFiltrosAuditoria(params)

  const faixa = (p: number) =>
    query(supabase, filtros).range((p - 1) * pageSize, (p - 1) * pageSize + pageSize - 1)

  let page = Math.max(1, params.page ?? 1)
  let { data, error, count } = await faixa(page)

  // `?page=900` (link velho, filtro que encolheu o resultado) não pode derrubar o Server
  // Component: descobre o total e mostra a ÚLTIMA página que existe. Uma tentativa, sem laço.
  if (error?.code === RANGE_INVALIDO) {
    const { count: total, error: erroTotal } = await query(supabase, filtros, true)
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
