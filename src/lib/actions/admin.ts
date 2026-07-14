'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { idOperador, MSG_SESSAO_EXPIRADA } from '@/lib/auth/acesso'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import {
  conviteSchema,
  filialSchema,
  atualizarFilialSchema,
  motivoSchema,
  atualizarMotivoSchema,
} from '@/lib/validators/admin'

async function exigirOperador(): Promise<ActionResult | null> {
  const supabase = await createClient()
  const uid = await idOperador(supabase)
  return uid ? null : { ok: false, erro: MSG_SESSAO_EXPIRADA }
}

// ---- Convite de operador (só @wap.ind.br — validação client E server) ----
export async function convidarUsuario(input: {
  email: string
}): Promise<ActionResult> {
  const bloqueio = await exigirOperador()
  if (bloqueio) return bloqueio

  const parsed = conviteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'E-mail inválido.' }
  }

  const h = await headers()
  const host = h.get('host')
  const origin = h.get('origin') ?? (host ? `https://${host}` : undefined)

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: origin ? `${origin}/auth/confirm` : undefined,
  })
  if (error) {
    const m = error.message.toLowerCase()
    if (m.includes('already') || m.includes('registered') || m.includes('exists')) {
      return { ok: false, erro: 'Esse e-mail já foi convidado ou já tem conta.' }
    }
    return { ok: false, erro: 'Não foi possível enviar o convite.' }
  }

  revalidatePath('/admin/usuarios')
  return { ok: true }
}

// ---- Filiais ----
export async function criarFilial(input: {
  nome: string
  slug: string
}): Promise<ActionResult> {
  const bloqueio = await exigirOperador()
  if (bloqueio) return bloqueio
  const parsed = filialSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const client = await createClient()
  const { error } = await client.from('filiais').insert(parsed.data)
  if (error) {
    if (error.message.toLowerCase().includes('duplicate')) {
      return { ok: false, erro: 'Já existe uma filial com esse slug.' }
    }
    return { ok: false, erro: traduzErroBanco(error.message) }
  }
  revalidatePath('/admin/filiais')
  return { ok: true }
}

export async function atualizarFilial(input: {
  id: number
  nome: string
  slug: string
  ativo: boolean
}): Promise<ActionResult> {
  const bloqueio = await exigirOperador()
  if (bloqueio) return bloqueio
  const parsed = atualizarFilialSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { id, nome, slug, ativo } = parsed.data

  const client = await createClient()

  // Bloquear desativar filial com ativos (OS-F3 3.7.2).
  if (!ativo) {
    const { count } = await client
      .from('ativos')
      .select('*', { count: 'exact', head: true })
      .eq('filial_id', id)
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        erro: `Não é possível desativar: há ${count} ativo(s) nesta filial. Transfira-os antes.`,
      }
    }
  }

  const { error } = await client
    .from('filiais')
    .update({ nome, slug, ativo })
    .eq('id', id)
  if (error) {
    if (error.message.toLowerCase().includes('duplicate')) {
      return { ok: false, erro: 'Já existe uma filial com esse slug.' }
    }
    return { ok: false, erro: traduzErroBanco(error.message) }
  }
  revalidatePath('/admin/filiais')
  return { ok: true }
}

// ---- Motivos ----
export async function criarMotivo(input: {
  codigo: string
  rotulo: string
  aplica_a: string[]
}): Promise<ActionResult> {
  const bloqueio = await exigirOperador()
  if (bloqueio) return bloqueio
  const parsed = motivoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const client = await createClient()
  const { error } = await client.from('motivos').insert(parsed.data)
  if (error) {
    if (error.message.toLowerCase().includes('duplicate')) {
      return { ok: false, erro: 'Já existe um motivo com esse código.' }
    }
    return { ok: false, erro: traduzErroBanco(error.message) }
  }
  revalidatePath('/admin/motivos')
  return { ok: true }
}

// Motivo nunca é excluído (o histórico referencia) — só editado/desativado.
export async function atualizarMotivo(input: {
  codigo: string
  rotulo: string
  aplica_a: string[]
  ativo: boolean
}): Promise<ActionResult> {
  const bloqueio = await exigirOperador()
  if (bloqueio) return bloqueio
  const parsed = atualizarMotivoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { codigo, rotulo, aplica_a, ativo } = parsed.data

  const client = await createClient()
  const { error } = await client
    .from('motivos')
    .update({ rotulo, aplica_a, ativo })
    .eq('codigo', codigo)
  if (error) return { ok: false, erro: traduzErroBanco(error.message) }
  revalidatePath('/admin/motivos')
  return { ok: true }
}
