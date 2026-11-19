'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { chamarRpc } from '@/lib/supabase/rpc'
import { exigirAdmin, MSG_SO_ADMIN } from '@/lib/auth/acesso'
import { registrarEventoAdmin } from '@/lib/auditoria-registro'
import { empresaDaOperacao } from '@/lib/auth/empresa-legada'
import { registrarFalha } from '@/lib/observabilidade'
import { type ActionResult } from '@/lib/actions/erros'
import { criarSenhaSchema } from '@/lib/validators/senha'
import { SLUG_EMPRESA_LEGADA, entradaDaPorta } from '@/lib/auth/porta-rotas'
import { revalidatePath } from 'next/cache'

// A GESTÃO das senhas de visualização (spec §3 / OS-F3 3.9) — SÓ ADMIN.
//
// F68 (19/11/2026): as três passam pelo BANCO, por empresa, com o client de SESSÃO de quem clicou — sem service role.
// Até a v1.75.0 elas falavam com `senhas_acesso` pelo client administrativo, e a guarda `exigirAdmin` daqui era o
// controle real (ADR-002 §4.1). Agora quem decide é o Postgres: `senha_acesso_criar` / `_conferir` / `_definir_status`
// (migration 0211, `security definer`) conferem `e_admin_na(p_empresa)` antes de qualquer efeito e só tocam a linha da
// empresa informada. `exigirAdmin` continua aqui, como em toda action de gestão: ela dá a MENSAGEM em pt-BR antes de ir
// ao banco, não a segurança.
//
// A senha vira bcrypt DENTRO do banco (decisão 19/11-3). As senhas de antes desta versão (scrypt) não abrem a porta nova:
// o Johnny as revoga pela tela, e cria as novas. A entrada dos gestores (a porta pública) NÃO mora mais aqui — é
// `actions/porta.ts`.
//
// A EMPRESA: a da OPERAÇÃO (`empresaDaOperacao()`, a legada explícita) — destino F70 (a empresa escolhida por quem cria;
// na conferência e na revogação, a da linha vinda da lista por empresa da F69). A trilha grava a empresa DA SENHA: a
// função de status só altera a linha cujo `empresa_id` é a empresa informada, então a empresa da trilha é a da linha.

export type CriarSenhaResult = (ActionResult & { url?: string }) | { ok: false; erro: string }

// As recusas do banco, pelo SQLSTATE das três funções (0211) — a frase é sempre a daqui, nunca um texto do banco.
const MENSAGEM_DO_BANCO: Record<string, string> = {
  '42501': MSG_SO_ADMIN,
  '22023': 'A senha precisa ter de 8 a 72 bytes (letra com acento conta 2), e o rótulo de 2 a 80 caracteres.',
  '23505': 'Já existe uma senha de acesso ativa igual a esta. Escolha outra.',
  '54000': 'A empresa já tem o máximo de 5 senhas de acesso ativas. Revogue uma antes.',
  P0002: 'Senha não encontrada. Atualize a página e tente de novo.',
}

function mensagemDoBanco(erro: { code?: string } | null, padrao: string): string {
  return (erro?.code && MENSAGEM_DO_BANCO[erro.code]) || padrao
}

// F29/ADM-05a — devolve também a URL PÚBLICA de entrada. Desde a F68 é a porta DA EMPRESA (`/r/<slug>/relatorios/acesso`).
// Não existe helper de URL base no repositório (nem NEXT_PUBLIC_APP_URL no ambiente), então vale o mesmo padrão do link
// de convite: derivar da requisição (`origin`, com `host` de reserva).
function urlDeAcesso(h: Headers, slug: string): string | null {
  const origin = h.get('origin')
  const host = h.get('host')
  const base =
    origin ??
    (host
      ? `${host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'}://${host}`
      : null)
  if (!base) return null
  return new URL(entradaDaPorta(slug), base).toString()
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

  // F68: a senha de visualização é da empresa da OPERAÇÃO até a F70 (a escolhida); a porta dela é a da legada.
  const empresa = empresaDaOperacao()
  const { error } = await chamarRpc(supabase, 'senha_acesso_criar', {
    p_empresa: empresa,
    p_rotulo: parsed.data.rotulo,
    p_senha: parsed.data.senha,
  })
  if (error) {
    if (!error.code || !MENSAGEM_DO_BANCO[error.code]) registrarFalha({ escopo: 'senhas.criar', erro: error })
    return { ok: false, erro: mensagemDoBanco(error, 'Não foi possível criar a senha.') }
  }

  // Trilha de auditoria: só o RÓTULO. A senha (em claro ou hash) JAMAIS entra em `detalhe` — `eventos_admin` é legível
  // por todo admin. A empresa é a DA SENHA criada.
  await registrarEventoAdmin({
    acao: 'senha_criada',
    empresa,
    autor: aut.uid,
    alvo: parsed.data.rotulo,
  })

  revalidatePath('/admin/senhas')
  // URL ausente (cabeçalho estranho) não invalida a criação: a senha FOI criada, e o diálogo mostra a senha sem o link.
  return { ok: true, url: urlDeAcesso(await headers(), SLUG_EMPRESA_LEGADA) ?? undefined }
}

// F29/ADM-05b — "essa senha ainda é a que eu passei?". Responde SÓ o veredito: o texto digitado não volta no retorno,
// não entra na trilha e não vai para log nenhum. A conferência é do banco (`senha_acesso_conferir`, bcrypt); uma senha
// scrypt (de antes da F68) responde "formato antigo" sem conferir nada — ela não abre mais a porta. SEM trilha (decisão
// registrada na F29; `senha_testada` segue no backlog).
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

  const { data: veredito, error } = await chamarRpc(supabase, 'senha_acesso_conferir', {
    p_empresa: empresaDaOperacao(),
    p_id: input.id,
    p_senha: input.senha,
  })
  if (error) return { ok: false, erro: mensagemDoBanco(error, 'Não foi possível conferir a senha agora.') }
  if (veredito === 'formato_antigo') {
    return {
      ok: false,
      erro: 'Esta senha é do formato antigo e não abre mais os relatórios. Crie uma nova e revogue esta.',
    }
  }
  const confere = veredito === 'confere'
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

  // A função só altera a linha cujo empresa_id é esta empresa (a de outra é "não encontrada", P0002) — por isso a empresa
  // da trilha, abaixo, é a DA LINHA. O rótulo volta para a trilha sem passar perto do hash.
  const empresa = empresaDaOperacao()
  const { data: rotulo, error } = await chamarRpc(supabase, 'senha_acesso_definir_status', {
    p_empresa: empresa,
    p_id: id,
    p_ativa: ativa,
  })
  if (error) return { ok: false, erro: mensagemDoBanco(error, 'Não foi possível atualizar a senha.') }

  await registrarEventoAdmin({
    acao: ativa ? 'senha_reativada' : 'senha_revogada',
    empresa,
    autor: aut.uid,
    alvo: rotulo,
  })

  revalidatePath('/admin/senhas')
  return { ok: true }
}
