'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exigirAdmin } from '@/lib/auth/acesso'
import { registrarEventoAdmin } from '@/lib/auditoria-registro'
import { type ActionResult } from '@/lib/actions/erros'
import { criarSenhaSchema } from '@/lib/validators/senha'
import {
  assinarSessaoView,
  hashSenha,
  verificarSenha,
  VIEW_COOKIE_NAME,
  VIEW_MAX_AGE_SEG,
} from '@/lib/auth/senha-sessao'
import { revalidatePath } from 'next/cache'

// Acesso por senha aos relatórios (spec §3 / OS-F3 3.9). Toda a validação roda
// no servidor com o client administrativo — nunca a anon key, nunca o browser.

// ---- Rate-limit por IP (OS-F3 3.9.1) ----
// O contador é PERSISTENTE no Postgres (função registrar_tentativa_senha, migration
// 0025): compartilhado entre instâncias da Vercel e atômico. O Map em memória antigo
// era por-processo e sumia no cold start — best-effort demais contra brute force.
function ipCliente(h: Headers): string {
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return h.get('x-real-ip') ?? 'desconhecido'
}

// Destino pós-login (OS-F3 melhoria): leva o gestor direto ao relatório clicado.
// Só caminhos INTERNOS de relatório entram — bloqueia URL absoluta, protocolo-
// relativo, backslash, traversal, o próprio /acesso (loop) e quebra de linha
// (CRLF em header). Qualquer coisa fora disso cai no consolidado ao vivo.
function destinoRelatorio(next: FormDataEntryValue | null): string {
  const padrao = '/relatorios/geral'
  if (typeof next !== 'string' || next.length === 0) return padrao
  if (!next.startsWith('/relatorios/')) return padrao
  if (next.startsWith('/relatorios/acesso')) return padrao
  if (next.includes('..') || next.includes('\\') || next.includes('//')) return padrao
  if (next.includes('\n') || next.includes('\r')) return padrao
  return next
}

// ---- Entrar por senha (público) ----

export type EntrarState = { erro?: string }

export async function entrarComSenha(
  _prev: EntrarState,
  formData: FormData,
): Promise<EntrarState> {
  const h = await headers()
  const admin = createAdminClient()

  // Rate-limit PERSISTENTE (§3.9.1): contador atômico no Postgres, compartilhado
  // entre instâncias. Falha ABERTO se a RPC der erro — a senha é a barreira real,
  // não travamos o acesso por um hiccup de infra.
  const { data: excedeu } = await admin.rpc('registrar_tentativa_senha', {
    p_ip: ipCliente(h),
  })
  if (excedeu) {
    return { erro: 'Muitas tentativas. Aguarde um instante e tente de novo.' }
  }

  const senha = String(formData.get('senha') ?? '')
  if (senha.length < 1) {
    return { erro: 'Senha inválida.' }
  }

  const { data: ativas } = await admin
    .from('senhas_acesso')
    .select('id, hash')
    .eq('ativa', true)

  let senhaId: string | null = null
  for (const s of ativas ?? []) {
    if (await verificarSenha(senha, s.hash)) {
      senhaId = s.id
      break
    }
  }

  // Erro SEMPRE genérico — nunca revela se a senha existe/foi revogada (3.9.1).
  if (!senhaId) {
    return { erro: 'Senha inválida.' }
  }

  await admin
    .from('senhas_acesso')
    .update({ ultimo_uso: new Date().toISOString() })
    .eq('id', senhaId)

  const { value } = assinarSessaoView(senhaId)
  const cookieStore = await cookies()
  cookieStore.set(VIEW_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/relatorios',
    maxAge: VIEW_MAX_AGE_SEG,
  })

  redirect(destinoRelatorio(formData.get('next')))
}

// ---- Sair da visualização (apaga o cookie) ----
export async function sairVisualizacao() {
  const cookieStore = await cookies()
  cookieStore.set(VIEW_COOKIE_NAME, '', { path: '/relatorios', maxAge: 0 })
  redirect('/relatorios/acesso')
}

// ---- Gestão das senhas (SÓ ADMIN — F21) ----
//
// Estas duas actions falam com `senhas_acesso` pelo client de SERVICE ROLE, e é a única
// forma possível: a tabela está em deny-all para `anon`/`authenticated` desde a migration
// 0012 (zero policies), justamente para a coluna `hash` nunca chegar a um client de
// sessão — RLS é row-level, não column-level. Ou seja, o service role passa por fora de
// qualquer policy: sem `exigirAdmin()` aqui, QUALQUER logado (inclusive o cargo consulta)
// criaria e revogaria senhas de acesso. É a camada de action que é o controle real neste
// caminho, não o banco (ADR-002 §4.1).
// F29/ADM-05a — devolve também a URL PÚBLICA de entrada. A tela pós-criação mandava
// "entregue junto do link do relatório" e não fornecia link nenhum; o admin ia caçar o
// endereço na barra do navegador. Não existe helper de URL base no repositório (nem
// NEXT_PUBLIC_APP_URL no ambiente), então vale o mesmo padrão do link de convite:
// derivar da requisição (`origin`, com `host` de reserva).
export type CriarSenhaResult = (ActionResult & { url?: string }) | { ok: false; erro: string }

function urlDeAcesso(h: Headers): string | null {
  const origin = h.get('origin')
  const host = h.get('host')
  const base =
    origin ??
    (host
      ? `${host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'}://${host}`
      : null)
  if (!base) return null
  return new URL('/relatorios/acesso', base).toString()
}

export async function criarSenhaAcesso(input: {
  rotulo: string
  senha: string
}): Promise<CriarSenhaResult> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = criarSenhaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const admin = createAdminClient()
  const hash = await hashSenha(parsed.data.senha)
  const { error } = await admin.from('senhas_acesso').insert({
    rotulo: parsed.data.rotulo,
    hash,
    criado_por: aut.uid,
  })
  if (error) return { ok: false, erro: 'Não foi possível criar a senha.' }

  // Trilha de auditoria: só o RÓTULO da senha. O hash (e obviamente a senha em claro)
  // JAMAIS entram em `detalhe` — `eventos_admin` é legível por todo admin.
  await registrarEventoAdmin({
    acao: 'senha_criada',
    autor: aut.uid,
    alvo: parsed.data.rotulo,
  })

  revalidatePath('/admin/senhas')
  // URL ausente (cabeçalho estranho) não invalida a criação: a senha FOI criada, e o
  // diálogo simplesmente mostra a senha sem o link.
  return { ok: true, url: urlDeAcesso(await headers()) ?? undefined }
}

// F29/ADM-05b — "essa senha ainda é a que eu passei?".
//
// Não havia como conferir: o hash é scrypt salgado (não dá para comparar de fora) e a
// senha em claro nunca é guardada. A única saída era revogar e recriar — cortando o
// acesso de quem já usava a senha certa.
//
// Esta action responde SÓ `confere`. O texto digitado não é exibido, não volta no
// retorno, não entra na trilha e não vai para log nenhum; a comparação é a MESMA
// `verificarSenha` (timing-safe) do login público, sobre o hash daquela senha. Nada do
// modelo afrouxa: scrypt continua, a leitura segue pelo client administrativo dentro de
// uma action com `exigirAdmin`, e nenhuma senha em claro passa a persistir.
export async function testarSenhaAcesso(input: {
  id: string
  senha: string
}): Promise<{ ok: true; confere: boolean } | { ok: false; erro: string }> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  if (!z.string().uuid().safeParse(input.id).success) {
    return { ok: false, erro: 'Senha inválida.' }
  }
  if (typeof input.senha !== 'string' || input.senha.length === 0) {
    return { ok: false, erro: 'Digite a senha que você quer conferir.' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('senhas_acesso')
    .select('rotulo, hash')
    .eq('id', input.id)
    .maybeSingle()
  if (error) return { ok: false, erro: 'Não foi possível conferir a senha agora.' }
  if (!data) {
    return { ok: false, erro: 'Senha não encontrada. Atualize a página e tente de novo.' }
  }

  // SEM trilha em `eventos_admin`, e isso é decisão registrada (F29, docs/DECISOES.md).
  // O vocabulário de ações é FECHADO em `lib/auditoria.ts` e espelhado no `comment` da
  // coluna pela migration 0075 ("mexeu aqui, mexa lá") — um verbo novo deixaria o banco
  // desatualizado, e corrigir isso é uma migration que esta ordem proíbe. Como o teste
  // é SÓ LEITURA (não muda senha, cargo nem acesso) e o admin já podia conferir a mesma
  // senha pela porta pública, ficar de fora da trilha não esconde efeito nenhum.
  // Backlog: entrar como `senha_testada` na próxima migration que tocar o vocabulário.
  const confere = await verificarSenha(input.senha, data.hash)
  return { ok: true, confere }
}

export async function definirStatusSenha(
  id: string,
  ativa: boolean,
): Promise<ActionResult> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, erro: 'Senha inválida.' }
  }

  const admin = createAdminClient()
  // `.select('rotulo')` no próprio update: dá o alvo legível da trilha sem uma segunda
  // consulta — e sem passar perto da coluna `hash`.
  const { data, error } = await admin
    .from('senhas_acesso')
    .update({ ativa })
    .eq('id', id)
    .select('rotulo')
    .maybeSingle()
  if (error) return { ok: false, erro: 'Não foi possível atualizar a senha.' }
  // Nenhuma linha casou: `error` é null (o PostgREST não trata "0 linhas" como erro), então
  // sem esta guarda a action diria "Senha revogada" sobre uma senha que não existe E gravaria
  // uma linha `senha_revogada` na trilha apontando um id inexistente. Auditoria com revogação
  // que nunca aconteceu é pior que auditoria faltando — e o admin ficaria achando que cortou
  // um acesso que segue ativo sob outro id.
  if (!data) {
    return { ok: false, erro: 'Senha não encontrada. Atualize a página e tente de novo.' }
  }

  await registrarEventoAdmin({
    acao: ativa ? 'senha_reativada' : 'senha_revogada',
    autor: aut.uid,
    alvo: data.rotulo,
  })

  revalidatePath('/admin/senhas')
  return { ok: true }
}
