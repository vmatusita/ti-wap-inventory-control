import { createClient } from '@/lib/supabase/server'
import { kitPayloadSchema, type KitPayload } from '@/lib/validators/kit'
import type { Json } from '@/lib/types/database'

// Leituras dos KITS DE MOVIMENTAÇÃO (F12 · M12 / F5 §5.9). Rotas só do operador
// (/admin/kits e /movimentacoes/nova) — client do servidor com a sessão do
// operador (RLS authenticated, migration 0043). O visualizador por senha não
// acessa nenhuma delas.

export type Kit = {
  id: string
  nome: string
  payload: KitPayload
  ativo: boolean
  created_at: string
}

type RawKitRow = {
  id: string
  nome: string
  payload: Json
  ativo: boolean
  created_at: string
}

const KIT_SELECT = 'id, nome, payload, ativo, created_at'

// O `payload` é jsonb: chega como `Json`, não como `KitPayload`. Quem grava é
// sempre uma action com Zod (actions/kits.ts), mas o BANCO não impõe forma
// nenhuma — uma escrita direta por SQL, ou um valor que saia do enum numa fase
// futura, produziria um documento fora do contrato.
//
// Decisão (F12 · W1): kit com payload inválido é DESCARTADO da lista e o id
// registrado no log do servidor. Nunca derruba a página — nem a do admin, nem o
// fluxo — e nunca chega ao formulário como um preset meio-preenchido. O log é só
// o id (uuid): nada do conteúdo, que pode carregar texto de observação. Para
// recuperar um kit assim, corrige-se o jsonb direto no banco (ou cria-se outro
// com nome novo) — situação que exige acesso administrativo para acontecer.
function parseKit(r: RawKitRow): Kit | null {
  const parsed = kitPayloadSchema.safeParse(r.payload)
  if (!parsed.success) {
    console.error('[queries/kits] payload de kit fora do contrato — kit ignorado', {
      id: r.id,
      issue: parsed.error.issues[0]?.message ?? null,
    })
    return null
  }
  return {
    id: r.id,
    nome: r.nome,
    payload: parsed.data,
    ativo: r.ativo,
    created_at: r.created_at,
  }
}

function mapearKits(rows: RawKitRow[]): Kit[] {
  return rows.map(parseKit).filter((k): k is Kit => k !== null)
}

// Catálogo do admin + QUANTOS kits foram descartados por payload fora do
// contrato. Descartar em silêncio faz o kit sumir da tela do admin sem nenhuma
// explicação — e, como o nome continua no índice único, recriá-lo com o mesmo
// nome falha com "Já existe um kit com esse nome.": o mesmo beco sem saída do
// achado F12-W4-06, uma tela adiante. Com a contagem, /admin/kits diz que há
// kit ilegível e para onde ir. (Revisão adversarial da F12.)
export type ListaKitsAdmin = { kits: Kit[]; invalidos: number }

// Kits ATIVOS, para o "Aplicar kit" do passo 2 da nova movimentação (catálogo
// pequeno e curado — sem paginação, como o de motivos/itens).
export async function listarKitsAtivos(): Promise<Kit[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('kits_modelos')
    .select(KIT_SELECT)
    .eq('ativo', true)
    .order('nome', { ascending: true })
  if (error) throw new Error(`Falha ao listar kits: ${error.message}`)
  return mapearKits((data ?? []) as RawKitRow[])
}

// Catálogo completo (ativos e inativos) para /admin/kits.
export async function listarKitsAdmin(): Promise<ListaKitsAdmin> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('kits_modelos')
    .select(KIT_SELECT)
    .order('nome', { ascending: true })
  if (error) throw new Error(`Falha ao listar kits: ${error.message}`)
  const rows = (data ?? []) as RawKitRow[]
  const kits = mapearKits(rows)
  return { kits, invalidos: rows.length - kits.length }
}
