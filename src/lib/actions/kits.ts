'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { exigirAdmin } from '@/lib/auth/acesso'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import { atualizarKitSchema, kitCatalogoSchema } from '@/lib/validators/kit'
import type { Json } from '@/lib/types/database'

// Escritas dos KITS DE MOVIMENTAÇÃO (F12 · M12 / F5 §5.9) — padrão do CRUD de
// catálogo de itens (actions/itens.ts): re-valida com Zod no servidor (o schema do
// cliente é a primeira linha, não a única), traduz o erro do banco para pt-BR e
// revalida as rotas que leem a tabela.
//
// F21 — o kit é CATÁLOGO global (não tem filial) e mora em /admin/kits: as duas
// escritas exigem ADMIN, igual a filiais/motivos/itens. Bate com a policy da migration
// 0063 (`kits_modelos` escreve com `e_admin()`). O Operador continua APLICANDO kits no
// fluxo de movimentação — aplicar é leitura do payload, não escrita na tabela.

// Entrada CRUA do formulário: strings, como em `criarItem` (`grupo: string`).
// Quem decide o que é válido é o Zod — o tipo aqui só guia quem chama.
export type KitPayloadEntrada = {
  tipo: string
  motivo?: string
  termo?: string
  observacao?: string
  categorias: string[]
}

// O `id` volta em sucesso (padrão do `CriarItemResult`), para a tela poder já
// destacar/selecionar o kit recém-criado sem uma leitura extra.
export type CriarKitResult = ActionResult & { id?: string }

const MSG_KIT_DUPLICADO = 'Já existe um kit com esse nome.'

// Nome duplicado é a única violação de unicidade possível nesta tabela: a outra
// chave é o uuid da PK, que não colide. Detectado pelo NOME do índice (0043) —
// e por 'duplicate' como rede, igual ao `criarItem`.
function ehNomeDuplicado(mensagem: string): boolean {
  const m = mensagem.toLowerCase()
  return m.includes('duplicate') || m.includes('kits_modelos_nome_uidx')
}

function revalidarKits() {
  revalidatePath('/admin/kits')
  revalidatePath('/movimentacoes/nova')
}

export async function criarKit(input: {
  nome: string
  payload: KitPayloadEntrada
}): Promise<CriarKitResult> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = kitCatalogoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const { data, error } = await supabase
    .from('kits_modelos')
    .insert({
      nome: parsed.data.nome,
      // Grava o payload JÁ NORMALIZADO pelo Zod (campos vazios viram ausentes,
      // texto trimado) — nunca o objeto cru do formulário.
      payload: parsed.data.payload as unknown as Json,
      criado_por: aut.uid,
    })
    .select('id')
    .single()
  if (error) {
    if (ehNomeDuplicado(error.message)) return { ok: false, erro: MSG_KIT_DUPLICADO }
    return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  }
  revalidarKits()
  return { ok: true, id: data?.id }
}

export async function atualizarKit(input: {
  id: string
  nome: string
  payload: KitPayloadEntrada
  ativo: boolean
}): Promise<ActionResult> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = atualizarKitSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { id, nome, payload, ativo } = parsed.data

  // Lista de colunas EXPLÍCITA: campo novo do schema entra também aqui, senão é
  // descartado em silêncio (a mesma armadilha do `atualizarItem`). `criado_por`
  // NÃO se atualiza — é o autor original.
  const { error } = await supabase
    .from('kits_modelos')
    .update({ nome, payload: payload as unknown as Json, ativo })
    .eq('id', id)
  if (error) {
    if (ehNomeDuplicado(error.message)) return { ok: false, erro: MSG_KIT_DUPLICADO }
    return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  }
  revalidarKits()
  return { ok: true }
}

// Kit NUNCA é excluído — só desativado (padrão do catálogo de itens). Some do
// fluxo e continua no admin. Nada referencia o kit depois de aplicado (o payload
// é COPIADO para o formulário e a movimentação gravada não guarda kit_id),
// então desativar não altera nenhuma movimentação já registrada.
//
// A desativação é o checkbox "Kit ativo" do `kit-dialog` → `atualizarKit`, e não
// uma action própria. O contrato §1.5 da OS-F12 previa um `desativarKit`; ele
// nasceu SEM CHAMADOR e foi removido na revisão adversarial da F12 (W6A):
// em um arquivo `'use server'` cada export é um endpoint de escrita alcançável
// pela rede, e um segundo caminho para o mesmo `update` só cria divergência.
// Mesmo motivo para o proxy `buscarKitsAtivos`, também sem chamador: quem lê os
// kits do fluxo é o Server Component `/movimentacoes/nova/page.tsx`, que já
// chama `listarKitsAtivos()` com `.catch` e passa a lista por prop.
