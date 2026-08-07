'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { exigirAdmin, exigirEscritaEm, exigirPapel } from '@/lib/auth/acesso'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import {
  reabrirPendenciaItemSchema,
  resolverPendenciaItemSchema,
} from '@/lib/validators/pendencia-item'

// Resolve (encerra) 1..N pendências de item numa tacada — o caminho para zerar a
// fila herdada com UMA justificativa (F18 §B2). Só toca as ABERTAS (`.eq('status',
// 'aberta')`): reenviar não "re-resolve" nem sobrescreve o desfecho de quem já foi
// resolvido (idempotente e à prova de corrida). Grava desfecho/quem/quando; a
// resolvida NÃO some da ficha (auditoria), só da fila. `resolvida_por = uid` é
// gravado pelo servidor a partir da sessão — o cliente não escolhe o autor.
export async function resolverPendenciaItem(input: {
  ids: string[]
  desfecho: string
  observacao?: string
}): Promise<ActionResult> {
  const parsed = resolverPendenciaItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createClient()
  const cargo = await exigirPapel(supabase, 'operador')
  if (!cargo.ok) return { ok: false, erro: cargo.erro }

  const { ids, desfecho, observacao } = parsed.data

  // O lote pode misturar filiais (`pendencias_item.filial_id` vem do trigger 0051, que
  // copia a da movimentação): lê as filiais alvo ANTES e exige escrita em todas —
  // resolver só a parte permitida deixaria a fila meio zerada, em silêncio, com UMA
  // justificativa cobrindo o que não foi resolvido.
  const { data: alvos, error: eFiliais } = await supabase
    .from('pendencias_item')
    .select('filial_id')
    .in('id', ids)
  if (eFiliais) return { ok: false, erro: traduzErroBanco(eFiliais.message, eFiliais.code) }

  // Nenhum alvo (ids inexistentes) não é erro — esta action é idempotente de propósito
  // e o update abaixo simplesmente não acha linha. Mas o cargo de escrita continua
  // exigido: a action é um endpoint alcançável pela rede por si só.
  const aut =
    alvos && alvos.length > 0
      ? await exigirEscritaEm(supabase, alvos.map((p) => p.filial_id))
      : cargo
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const { data, error } = await supabase
    .from('pendencias_item')
    .update({
      status: 'resolvida',
      desfecho,
      observacao: observacao ?? null,
      resolvida_em: new Date().toISOString(),
      resolvida_por: aut.uid,
    })
    .in('id', ids)
    .eq('status', 'aberta')
    .select('ativo_id')

  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  // A fila, o badge da sidebar e os relatórios contam as abertas; as fichas dos
  // ativos afetados mostram a pendência (agora resolvida — permanece, como rastro).
  revalidatePath('/pendencias')
  for (const ativoId of new Set((data ?? []).map((r) => r.ativo_id))) {
    revalidatePath(`/ativos/${ativoId}`)
  }
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// reabrirPendenciaItem (F28/PND-05) — a inversa de `resolverPendenciaItem`,
// acima: um desfecho errado (baixa no lugar de recuperado, ou um id a mais no
// lote) até agora não tinha correção em NENHUMA camada — "resolver é
// definitivo" era a regra. Espelha `desfazerConfirmacaoTermo`
// (actions/termos.ts, a ação inversa que já existe em produção para o termo):
// mesmo formato de action, mesma ideia de "desfazer uma decisão registrada".
//
// SEM MIGRATION (provado antes de escrever esta função — ver docs/DECISOES.md):
//   · `pendencias_item_ciclo_chk` (0050) aceita `status='aberta'` com
//     `desfecho`/`resolvida_em` nulos, nos dois sentidos — reabrir não viola o
//     CHECK, só percorre ele ao contrário.
//   · a policy de UPDATE (`pendencias_item operador resolve`, 0063) é
//     `pode_escrever_filial(filial_id)` sem restrição de coluna nem de direção.
//   · `guarda_acervo` (0081) exclui `pendencias_item` da imutabilidade do
//     acervo, DE PROPÓSITO E POR ESCRITO.
//
// Restrita ao NÍVEL ADMINISTRADOR (`exigirAdmin` = admin OU dev): reabrir apaga
// o desfecho de OUTRA PESSOA (quem resolveu), não uma decisão própria — por
// isso a régua é mais alta que a de resolver (`exigirPapel('operador')`,
// acima). `exigirEscritaEm` roda DEPOIS, sobre as filiais dos alvos lidos do
// banco (nunca confiadas ao cliente), pela mesma razão de sempre: reabrir só
// parte do lote, em silêncio, seria pior que recusar o lote inteiro.
export async function reabrirPendenciaItem(input: {
  ids: string[]
  justificativa: string
}): Promise<ActionResult> {
  const parsed = reabrirPendenciaItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createClient()
  const admin = await exigirAdmin(supabase)
  if (!admin.ok) return { ok: false, erro: admin.erro }

  const { ids, justificativa } = parsed.data

  // Só as JÁ RESOLVIDAS entram nos alvos — reabrir uma que já está aberta não
  // faz sentido (idempotente, como `resolverPendenciaItem` é para o sentido
  // contrário). `item`/`ativo_id` saem daqui porque alimentam a anotação
  // abaixo; `filial_id`, o vínculo de escrita.
  const { data: alvos, error: eAlvos } = await supabase
    .from('pendencias_item')
    .select('id, ativo_id, item, filial_id')
    .in('id', ids)
    .eq('status', 'resolvida')
  if (eAlvos) return { ok: false, erro: traduzErroBanco(eAlvos.message, eAlvos.code) }

  // Nenhum alvo resolvido (ids inexistentes, já reabertos por outra aba, ou o
  // lote inteiro já aberto) não é erro — nada a fazer, nada a anotar. O nível
  // administrador já foi exigido acima de qualquer forma.
  const alvosResolvidos = alvos ?? []
  if (alvosResolvidos.length === 0) return { ok: true }

  const aut = await exigirEscritaEm(supabase, alvosResolvidos.map((p) => p.filial_id))
  if (!aut.ok) return { ok: false, erro: aut.erro }

  // Limpa a `observacao` do desfecho anterior (decisão registrada em
  // docs/DECISOES.md): o CHECK não a exige, e preservá-la perderia sentido —
  // ela descrevia UM desfecho que, reaberta a pendência, deixou de valer. O
  // texto que explica a reabertura é a JUSTIFICATIVA, que vai para a anotação
  // (abaixo), não para esta coluna.
  const { error } = await supabase
    .from('pendencias_item')
    .update({
      status: 'aberta',
      desfecho: null,
      observacao: null,
      resolvida_em: null,
      resolvida_por: null,
    })
    .in('id', alvosResolvidos.map((p) => p.id))
    .eq('status', 'resolvida')
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  // Anotação por ATIVO (rastro imutável na linha do tempo, como o desfazer do
  // termo) — uma por pendência reaberta, com o item no texto: o mesmo ativo
  // pode ter mais de uma pendência de item na ficha, e a anotação genérica
  // "reaberta" sem dizer qual deixaria a auditoria adivinhando.
  const { error: eNota } = await supabase.from('anotacoes').insert(
    alvosResolvidos.map((p) => ({
      ativo_id: p.ativo_id,
      texto: `Pendência de item reaberta (${p.item}): ${justificativa}.`,
      criado_por: aut.uid,
    })),
  )
  if (eNota) return { ok: false, erro: traduzErroBanco(eNota.message, eNota.code) }

  revalidatePath('/pendencias')
  for (const ativoId of new Set(alvosResolvidos.map((p) => p.ativo_id))) {
    revalidatePath(`/ativos/${ativoId}`)
  }
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}
