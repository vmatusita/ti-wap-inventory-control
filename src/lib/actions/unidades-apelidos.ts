'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { exigirAdmin } from '@/lib/auth/acesso'
import { registrarEventoAdmin } from '@/lib/auditoria-registro'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import { apelidoFilialSchema, removerApelidoUnidadeSchema } from '@/lib/validators/admin'
import { listarVocabularioDeUnidades, type ApelidoDeFilial } from '@/lib/queries/admin'
import { encontrarDonoDoTermo, mensagemColisaoApelido } from '@/lib/unidades/dono-do-termo'

// Administração › Filiais — incluir/remover apelido de unidade (F56 · Frente E ·
// Decisão 13 do PLAN-F56). A tela em `filial-dialog.tsx`/`filial-apelidos.tsx`
// chama estas duas actions; o teste do componente (grau 1) fica em
// `src/components/admin/filial-apelidos.test.tsx` — este arquivo não tem teste
// próprio de componente porque não é UI.
//
// A GARANTIA REAL é o banco (migration 0139): o índice único
// `unidades_apelidos_apelido_chave_uidx` (apelido × apelido) e o gatilho
// `vocabulario_unidades_guarda` (a diagonal nome × apelido). A pré-checagem por
// `encontrarDonoDoTermo` abaixo só evita a viagem e nomeia a filial dona ANTES de
// escrever — sem ela, o operador só saberia da colisão depois de errar.

export type ApelidoUnidadeResult = ActionResult & { apelidos?: ApelidoDeFilial[] }

async function listarApelidosDaFilial(
  client: Awaited<ReturnType<typeof createClient>>,
  filialId: number,
): Promise<ApelidoDeFilial[]> {
  const { data, error } = await client
    .from('unidades_apelidos')
    .select('id, apelido')
    .eq('filial_id', filialId)
    .order('apelido')
  if (error) throw new Error(`Falha ao ler apelidos da filial: ${error.message}`)
  return data ?? []
}

export async function incluirApelidoUnidade(input: {
  filialId: number
  apelido: string
}): Promise<ApelidoUnidadeResult> {
  const client = await createClient()
  const aut = await exigirAdmin(client)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = apelidoFilialSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { filialId, apelido } = parsed.data

  // Pré-conferência amigável (Decisão 2/13 do PLAN-F56) — nomeia a filial dona
  // sem depender de desmontar a mensagem do Postgres (regra de erros.ts).
  const vocabulario = await listarVocabularioDeUnidades()
  const dono = encontrarDonoDoTermo(apelido, vocabulario.filiais, vocabulario.apelidos)
  const colisao = mensagemColisaoApelido(apelido, filialId, dono)
  if (colisao) return { ok: false, erro: colisao }

  const filialNome = vocabulario.filiais.find((f) => f.id === filialId)?.nome ?? String(filialId)

  const { error } = await client.from('unidades_apelidos').insert({ filial_id: filialId, apelido })
  if (error) {
    // Backstop de corrida — o índice único ou o gatilho do banco recusaram mesmo
    // com a pré-checagem verde (dois admins cadastrando o mesmo termo ao mesmo
    // tempo). `traduzErroBanco` (erros.ts) traduz sem repassar texto cru.
    return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  }

  await registrarEventoAdmin({
    acao: 'apelido_incluido',
    autor: aut.uid,
    alvo: `${filialNome} → ${apelido}`,
    detalhe: { filial_id: filialId, filial_nome: filialNome, apelido },
  })

  // A tela de apelidos atualiza o próprio estado pelo RETORNO desta action (sem
  // depender de router.refresh) — o revalidatePath garante que OUTRAS rotas
  // (a lista de Filiais numa aba já aberta, o import) vejam o dado novo depois.
  revalidatePath('/admin/filiais')
  revalidatePath('/admin/importar')

  return { ok: true, apelidos: await listarApelidosDaFilial(client, filialId) }
}

export async function removerApelidoUnidade(input: {
  apelidoId: number
}): Promise<ApelidoUnidadeResult> {
  const client = await createClient()
  const aut = await exigirAdmin(client)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = removerApelidoUnidadeSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  // Precisa do apelido e da filial ANTES de apagar — a linha some depois do
  // delete, e a trilha e o retorno da tela dependem dela.
  const { data: linha, error: eLeitura } = await client
    .from('unidades_apelidos')
    .select('id, filial_id, apelido')
    .eq('id', parsed.data.apelidoId)
    .maybeSingle()
  if (eLeitura) return { ok: false, erro: traduzErroBanco(eLeitura.message, eLeitura.code) }
  if (!linha) {
    return { ok: false, erro: 'Este apelido já não existe — atualize a página.' }
  }

  const { error } = await client.from('unidades_apelidos').delete().eq('id', parsed.data.apelidoId)
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  const { data: filial } = await client
    .from('filiais')
    .select('nome')
    .eq('id', linha.filial_id)
    .maybeSingle()
  const filialNome = filial?.nome ?? String(linha.filial_id)

  await registrarEventoAdmin({
    acao: 'apelido_removido',
    autor: aut.uid,
    alvo: `${filialNome} → ${linha.apelido}`,
    detalhe: { filial_id: linha.filial_id, filial_nome: filialNome, apelido: linha.apelido },
  })

  revalidatePath('/admin/filiais')
  revalidatePath('/admin/importar')

  return { ok: true, apelidos: await listarApelidosDaFilial(client, linha.filial_id) }
}
