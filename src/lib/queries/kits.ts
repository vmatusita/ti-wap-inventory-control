import 'server-only'
import type { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { registrarFalha } from '@/lib/observabilidade'
import { kitPayloadSchema, type KitPayload } from '@/lib/validators/kit'
import { linhasDe } from '@/lib/supabase/linhas'
import { FORMA_KIT, LEITURA_KITS_ADMIN, LEITURA_KITS_ATIVOS } from '@/lib/queries/formas/kits'

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

// A linha como a forma a entrega (F58): `payload` é JSON de qualquer forma — objeto, lista,
// escalar ou `null` —, e só `kitPayloadSchema`, abaixo, decide se é um kit. O tipo à mão de antes
// dizia `Record<string, unknown>`, o que o banco não garante.
type RawKitRow = z.infer<typeof FORMA_KIT>

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
    registrarFalha({
      escopo: 'kits.payload-invalido',
      erro: parsed.error,
      ctx: { id: r.id },
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
    .select(LEITURA_KITS_ATIVOS.select)
    .eq('ativo', true)
    .order('nome', { ascending: true })
  if (error) throw new Error(`Falha ao listar kits: ${error.message}`)
  return mapearKits(linhasDe(data, LEITURA_KITS_ATIVOS.forma, LEITURA_KITS_ATIVOS.rotulo))
}

// Catálogo completo (ativos e inativos) para /admin/kits.
export async function listarKitsAdmin(): Promise<ListaKitsAdmin> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('kits_modelos')
    .select(LEITURA_KITS_ADMIN.select)
    .order('nome', { ascending: true })
  if (error) throw new Error(`Falha ao listar kits: ${error.message}`)
  const rows = linhasDe(data, LEITURA_KITS_ADMIN.forma, LEITURA_KITS_ADMIN.rotulo)
  const kits = mapearKits(rows)
  return { kits, invalidos: rows.length - kits.length }
}
