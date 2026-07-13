'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOperador } from '@/lib/auth/acesso'
import { traduzErroBanco } from '@/lib/actions/erros'
import { Constants } from '@/lib/types/database'

export type AdminResult = { ok: boolean; erro?: string }

async function exigirOperador(): Promise<AdminResult | null> {
  const operador = await getOperador()
  if (!operador) return { ok: false, erro: 'Sessão expirada. Faça login novamente.' }
  return null
}

// ---- Convite de operador (só @wap.ind.br — validação client E server) ----

const DOMINIO = '@wap.ind.br'
const conviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('E-mail inválido')
    .refine((e) => e.endsWith(DOMINIO), `O e-mail precisa terminar com ${DOMINIO}`),
})

export async function convidarUsuario(input: {
  email: string
}): Promise<AdminResult> {
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

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const filialSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_RE, 'Slug: só letras minúsculas, números e hífens'),
})

export async function criarFilial(input: {
  nome: string
  slug: string
}): Promise<AdminResult> {
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

const atualizarFilialSchema = filialSchema.extend({
  id: z.number().int().positive(),
  ativo: z.boolean(),
})

export async function atualizarFilial(input: {
  id: number
  nome: string
  slug: string
  ativo: boolean
}): Promise<AdminResult> {
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

const tiposMov = Constants.public.Enums.tipo_movimentacao
const motivoSchema = z.object({
  codigo: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]+$/, 'Código: só letras minúsculas, números e _')
    .max(40),
  rotulo: z.string().trim().min(2, 'Informe o rótulo').max(80),
  aplica_a: z.array(z.enum(tiposMov)).min(1, 'Escolha ao menos um tipo'),
})

export async function criarMotivo(input: {
  codigo: string
  rotulo: string
  aplica_a: string[]
}): Promise<AdminResult> {
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

const atualizarMotivoSchema = z.object({
  codigo: z.string().trim().min(1),
  rotulo: z.string().trim().min(2, 'Informe o rótulo').max(80),
  aplica_a: z.array(z.enum(tiposMov)).min(1, 'Escolha ao menos um tipo'),
  ativo: z.boolean(),
})

// Motivo nunca é excluído (o histórico referencia) — só editado/desativado.
export async function atualizarMotivo(input: {
  codigo: string
  rotulo: string
  aplica_a: string[]
  ativo: boolean
}): Promise<AdminResult> {
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
