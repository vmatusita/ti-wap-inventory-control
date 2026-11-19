'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { abrirPorta, pedirPorta } from '@/lib/supabase/publico'
import { registrarFalha } from '@/lib/observabilidade'
import {
  PORTA_COOKIE,
  PORTA_MAX_AGE_SEG,
  caminhoDoCookie,
  destinoNaPorta,
  entradaDaPorta,
  slugValido,
  MSG_FALHA_AO_CONFERIR_SENHA,
  MSG_MUITAS_TENTATIVAS,
  MSG_SENHA_INVALIDA,
} from '@/lib/auth/porta-rotas'

// A ENTRADA E A SAÍDA DA PORTA PÚBLICA (F68) — as duas Server Actions do visualizador por senha.
//
// Nenhuma das duas cria client administrativo nem client de sessão: elas falam SÓ por `src/lib/supabase/publico.ts`
// (a chave `anon`, sem cookie), que chama as duas funções da porta. A senha é conferida DENTRO do banco
// (`relatorio_publico_abrir`, bcrypt), contra as senhas da empresa do SLUG DA ROTA; o contador de tentativas também roda
// lá dentro, antes de qualquer senha. Aqui só se: pega a origem, chama, grava o cookie e redireciona.
//
// ⚠ O formulário NUNCA vai para log: `registrarFalha` recebe só o erro do banco. A senha passa por aqui uma vez, como
// argumento da RPC, e não é guardada nem ecoada.

/** A origem para o contador por (empresa, origem) — o IP que a Vercel põe no cabeçalho. Quem chama a função direto
 *  pelo PostgREST escolhe a origem que quiser: é para isso que existe o teto por EMPRESA, dentro do banco. */
function origemDaRequisicao(h: Headers): string {
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return h.get('x-real-ip') ?? 'desconhecida'
}

export type EntrarPortaState = { erro?: string }

export async function entrarNaPorta(_prev: EntrarPortaState, formData: FormData): Promise<EntrarPortaState> {
  const slug = formData.get('empresa')
  const senha = formData.get('senha')
  // slug fora do formato: o MESMO "Senha inválida." — nem se pergunta ao banco
  if (!slugValido(slug)) return { erro: MSG_SENHA_INVALIDA }

  const r = await abrirPorta(slug, typeof senha === 'string' ? senha : '', origemDaRequisicao(await headers()))
  // R-ACC-95: o erro do banco (o contador mora lá dentro, na mesma transação) RECUSA — nada foi conferido
  if (r.tipo === 'falha') {
    registrarFalha({ escopo: 'porta.entrar', erro: r.erro })
    return { erro: MSG_FALHA_AO_CONFERIR_SENHA }
  }
  if (r.tipo === 'tentativas') return { erro: MSG_MUITAS_TENTATIVAS }
  if (r.tipo === 'recusada') return { erro: MSG_SENHA_INVALIDA }

  const cookieStore = await cookies()
  cookieStore.set(PORTA_COOKIE, r.sessao, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: caminhoDoCookie(slug),
    maxAge: PORTA_MAX_AGE_SEG,
  })
  redirect(destinoNaPorta(slug, formData.get('next')))
}

/** O "Sair": a sessão morre NO BANCO (`encerrar`) e o cookie é apagado. Falha no banco não prende ninguém: o cookie
 *  sai do mesmo jeito, e a sessão vence sozinha em 24 h. */
export async function sairDaPorta(formData: FormData): Promise<void> {
  const slug = formData.get('empresa')
  if (!slugValido(slug)) redirect('/')
  const cookieStore = await cookies()
  const token = cookieStore.get(PORTA_COOKIE)?.value
  if (token) {
    try {
      await pedirPorta('encerrar', slug, token)
    } catch (erro) {
      registrarFalha({ escopo: 'porta.sair', erro })
    }
  }
  cookieStore.set(PORTA_COOKIE, '', { path: caminhoDoCookie(slug), maxAge: 0 })
  redirect(entradaDaPorta(slug))
}
