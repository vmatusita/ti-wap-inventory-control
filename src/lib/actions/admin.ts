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

// Origin da requisição para montar o link de convite. Em produção (Vercel) o
// header `origin` costuma vir vazio na Server Action same-origin — caímos no
// `host`. localhost/127.* usam http (dev); o resto, https.
function origemDaRequisicao(h: Headers): string | null {
  const origin = h.get('origin')
  if (origin) return origin
  const host = h.get('host')
  if (!host) return null
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  return `${proto}://${host}`
}

// Monta o link que o admin envia manualmente. Aponta para a página /auth/confirm
// (intersticial: só faz verifyOtp no CLIQUE do usuário, nunca no GET — protege o
// token de uso único contra prefetch de link do WhatsApp/Teams/Outlook). NÃO usa o
// action_link do Supabase, então independe da allowlist de Redirect URLs. `type`
// invite/recovery cai em /auth/definir-senha (ver src/app/auth/confirm/page.tsx).
function linkConfirmacao(
  origem: string,
  hashedToken: string,
  tipo: 'invite' | 'recovery',
): string {
  const url = new URL('/auth/confirm', origem)
  url.searchParams.set('token_hash', hashedToken)
  url.searchParams.set('type', tipo)
  return url.toString()
}

// ---- Convite de operador (só @wap.ind.br — validação client E server) ----
// Gera um LINK em vez de mandar e-mail pelo Supabase. O e-mail embutido do
// Supabase é limitado a ~2/hora e "só para testes"; subir esse teto exigiria
// SMTP próprio (⇒ domínio verificado, que não temos). `generateLink` cria o
// usuário e devolve o token SEM disparar e-mail — o admin copia o link e envia
// por WhatsApp/Teams/e-mail. Sem limite, sem domínio, sem serviço novo (custo R$ 0).
//
// `type` NÃO exportado de propósito: arquivo 'use server' só pode EXPORTAR funções
// async (regra do Next). O dialog infere o retorno via ReturnType — não importa o tipo.
type ConviteResult =
  | { ok: true; link: string; reenvio: boolean }
  | { ok: false; erro: string }

export async function convidarUsuario(input: {
  email: string
}): Promise<ConviteResult> {
  const bloqueio = await exigirOperador()
  if (bloqueio) return { ok: false, erro: bloqueio.erro ?? MSG_SESSAO_EXPIRADA }

  const parsed = conviteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'E-mail inválido.' }
  }
  const email = parsed.data.email

  const origem = origemDaRequisicao(await headers())
  if (!origem) {
    return { ok: false, erro: 'Não foi possível montar o link (endereço do site ausente).' }
  }

  const admin = createAdminClient()

  // 1) Novo operador → convite. Cria a conta em auth.users; o trigger
  //    handle_new_user (migration 0001) barra e-mail fora de @wap.ind.br no banco.
  const convite = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${origem}/auth/confirm` },
  })

  if (!convite.error && convite.data.properties) {
    revalidatePath('/admin/usuarios')
    return {
      ok: true,
      reenvio: false,
      link: linkConfirmacao(origem, convite.data.properties.hashed_token, 'invite'),
    }
  }

  // 2) Já existe conta → link de RECUPERAÇÃO (mesma tela de definir senha).
  //    Cobre "já convidei mas a pessoa não terminou" e "quero reenviar o acesso".
  const jaExiste =
    !!convite.error && /already|registered|exists|been registered/i.test(convite.error.message)

  if (jaExiste) {
    const recovery = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${origem}/auth/confirm` },
    })
    if (!recovery.error && recovery.data.properties) {
      revalidatePath('/admin/usuarios')
      return {
        ok: true,
        reenvio: true,
        link: linkConfirmacao(origem, recovery.data.properties.hashed_token, 'recovery'),
      }
    }
  }

  // 3) Erro real. O trigger do banco barra e-mail fora do domínio (defesa final).
  const msg = (convite.error?.message ?? '').toLowerCase()
  if (msg.includes('wap.ind.br') || msg.includes('restrito')) {
    return { ok: false, erro: 'Só e-mails @wap.ind.br podem ser convidados.' }
  }
  return { ok: false, erro: 'Não foi possível gerar o link de convite. Tente de novo.' }
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
    return { ok: false, erro: traduzErroBanco(error.message, error.code) }
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
    return { ok: false, erro: traduzErroBanco(error.message, error.code) }
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
    return { ok: false, erro: traduzErroBanco(error.message, error.code) }
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
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  revalidatePath('/admin/motivos')
  return { ok: true }
}
