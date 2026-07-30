'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exigirDev } from '@/lib/auth/acesso'
import { registrarEventoAdmin } from '@/lib/auditoria-registro'
import { traduzErroBanco } from '@/lib/actions/erros'
import { emailDoUsuario, getEstadoUsuario, idsDeAdminsAtivos } from '@/lib/queries/admin'
import { rodarChecagens, type Checagem } from '@/lib/queries/dev'
import {
  alterarEmailUsuarioSchema,
  apagarUsuarioSchema,
  encerrarSessoesSchema,
  validarExclusaoDeUsuario,
} from '@/lib/validators/admin'

// Server Actions da GESTÃO AVANÇADA de usuários e da área /dev (F22) — o que o cargo
// Administrador NÃO tem. Todas começam por `exigirDev`.
//
// ⚠ ARQUIVO 'use server': só pode EXPORTAR funções async. Nada de `export const`,
// `export type { X }` ou `export *` — o incidente F13 (um `export type {}` num módulo
// 'use server') matou TODA a escrita em produção por horas. Tipo se exporta pelo alias
// INLINE (`export type X = Y`) ou, como aqui, não se exporta: o diálogo infere por
// `ReturnType`. O guarda `src/lib/use-server-exports.test.ts` derruba `npm test` se alguém
// esquecer.
//
// ⚠ A GUARDA `exigirDev` NÃO É A SEGURANÇA — é a MENSAGEM em pt-BR. A trava está nas RPCs da
// migration 0074 (`apagar_usuario`, `encerrar_sessoes_usuario`, que exigem `e_dev()` por
// dentro) e na rede `profiles_guarda_dev` da 0073. Se esta guarda sumisse por engano, o banco
// continuaria recusando — só que com SQLSTATE cru.

type DevResult = { ok: true; aviso?: string } | { ok: false; erro: string }

// ---------------------------------------------------------------------------
// 1. Alterar o e-mail de login
// ---------------------------------------------------------------------------
// DECISÃO (registrada em docs/DECISOES.md): aplica DIRETO, com `email_confirm: true`, em vez
// de disparar um link de confirmação. Motivos: (a) o projeto não tem SMTP próprio — o e-mail
// embutido do Supabase é limitado a ~2/hora e "só para testes", e foi por isso que o convite
// virou link copiável na F6; (b) exigir confirmação deixaria a conta em LIMBO (e-mail novo
// pendente, antigo já não serve) sem ninguém para resolver; (c) quem executa é o cargo dev,
// agindo sobre uma conta corporativa, e a mudança fica na trilha com o valor de antes e o de
// depois — reverter é trocar de novo.
//
// O DOMÍNIO é validado aqui, no schema, e este é o ÚNICO lugar onde ele pode ser validado
// neste caminho: o trigger `handle_new_user` (0041) só cobre INSERT em auth.users, e trocar
// o e-mail de uma conta existente é UPDATE — ele não dispara.
export async function alterarEmailUsuario(input: {
  usuarioId: string
  email: string
}): Promise<DevResult> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = alterarEmailUsuarioSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { usuarioId, email } = parsed.data

  const antes = await emailDoUsuario(usuarioId)
  if (antes && antes.toLowerCase() === email) {
    return { ok: true }   // já é esse e-mail; não é erro nem evento
  }

  const admin = createAdminClient()
  const r = await admin.auth.admin.updateUserById(usuarioId, { email, email_confirm: true })

  if (r.error) {
    const msg = r.error.message.toLowerCase()
    // O Auth responde com variações de "already been registered" quando o endereço está em
    // uso por OUTRA conta. Sem esta tradução, o dev veria a mensagem crua em inglês.
    if (/already|registered|exists|duplicate/.test(msg)) {
      return { ok: false, erro: 'Já existe uma conta com esse e-mail.' }
    }
    console.error('[dev] falha ao alterar e-mail', r.error)
    return { ok: false, erro: 'Não foi possível alterar o e-mail. Tente de novo em instantes.' }
  }

  await registrarEventoAdmin({
    acao: 'email_alterado',
    autor: aut.uid,
    alvo: email,
    detalhe: { de: antes, para: email },
  })
  revalidatePath('/admin/usuarios')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// 2. Apagar a conta (arquiva o perfil, remove a conta de login)
// ---------------------------------------------------------------------------
// A SEQUÊNCIA IMPORTA e é de FALHA SEGURA:
//   1º  RPC `apagar_usuario` → marca `excluido_em` + `ativo = false` e limpa os vínculos.
//       A partir daqui `papel_atual()` devolve NULL e a pessoa não lê nem escreve mais nada,
//       no request seguinte (0073).
//   2º  `auth.admin.deleteUser` → remove a conta, o que impede login novo e LIBERA o e-mail
//       para um convite futuro.
// Se o 2º falhar, o estado resultante NEGA acesso e a action avisa. O inverso (apagar no Auth
// primeiro) deixaria, em caso de falha no 1º, um perfil vivo sem conta — o pior dos dois.
//
// ⚠ O perfil NÃO é apagado da tabela: dez FKs de histórico apontam para ele e é dele que sai
// o "Quem fez" de toda movimentação, anotação e termo antigos. Ver o cabeçalho da 0073.
export async function apagarUsuario(input: {
  usuarioId: string
  confirmacao: string
}): Promise<DevResult> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = apagarUsuarioSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { usuarioId, confirmacao } = parsed.data

  let estado, adminsAtivosIds, email
  try {
    ;[estado, adminsAtivosIds, email] = await Promise.all([
      getEstadoUsuario(usuarioId),
      idsDeAdminsAtivos(),
      emailDoUsuario(usuarioId),
    ])
  } catch (err) {
    // FALHA FECHADA, como em `carregarAlvo` de actions/admin.ts: sem saber quantas contas de
    // nível administrador sobram, recusa em vez de supor.
    console.error('[dev] falha ao carregar o alvo da exclusão', err)
    return {
      ok: false,
      erro: 'Não foi possível conferir a situação desta conta. Tente de novo em instantes.',
    }
  }
  if (!estado) {
    return { ok: false, erro: 'Usuário não encontrado. Atualize a página e tente de novo.' }
  }

  const recusa = validarExclusaoDeUsuario({
    autorId: aut.uid,
    autorPapel: aut.papel,
    alvo: { id: estado.id, papel: estado.papel, ativo: estado.ativo },
    alvoEmail: email,
    confirmacao,
    adminsAtivosIds,
  })
  if (recusa) return { ok: false, erro: recusa }

  // 1º — o banco. Aqui mora a trava de verdade (a RPC exige `e_dev()`).
  const { error: erroRpc } = await supabase.rpc('apagar_usuario', { p_alvo: usuarioId })
  if (erroRpc) return { ok: false, erro: traduzErroBanco(erroRpc.message, erroRpc.code) }

  // 2º — o Auth. `alvo` é o e-mail LEGÍVEL: depois desta linha ele não existe mais em lugar
  // nenhum, e a trilha é o único registro de QUEM foi apagado.
  const admin = createAdminClient()
  const del = await admin.auth.admin.deleteUser(usuarioId)
  const contaRemovida = !del.error

  await registrarEventoAdmin({
    acao: 'usuario_apagado',
    autor: aut.uid,
    alvo: email ?? estado.nome ?? estado.id,
    detalhe: {
      papel: estado.papel,
      conta_removida_no_auth: contaRemovida ? 'ok' : 'falhou',
    },
  })

  revalidatePath('/admin/usuarios')
  revalidatePath('/dev')

  if (!contaRemovida) {
    console.error('[dev] perfil arquivado, mas a conta do Auth não foi removida', del.error)

    // ⚠ ACHADO DA REVISÃO ADVERSARIAL (30/07): "tente apagar de novo" era um conselho que
    // NÃO SE PODE SEGUIR. O perfil já saiu da lista (arquivado), então não há mais linha nem
    // menu por onde repetir a ação — e a conta ficaria em auth.users VIVA e NÃO BANIDA. Como
    // o login não passa mais por `papel_atual()` para autenticar (só para autorizar), a pessoa
    // continuaria conseguindo ENTRAR, ainda que sem ler nem escrever nada.
    //
    // O remédio é banir aqui, na mesma sequência: o ban é o que impede o login, e ele não
    // depende do perfil. Assim o estado degradado ainda NEGA acesso por completo, e o que
    // sobra pendente é só a liberação do e-mail — que a checagem "perfil sem conta" da /dev
    // não pega (o caso é o inverso), então o aviso precisa dizer o que fazer à mão.
    const ban = await admin.auth.admin.updateUserById(usuarioId, { ban_duration: '876000h' })
    if (ban.error) console.error('[dev] e o ban de emergência também falhou', ban.error)

    return {
      ok: true,
      aviso: ban.error
        ? 'O acesso desta pessoa foi cortado no sistema, mas NÃO foi possível remover nem bloquear a conta de login. Bloqueie a conta pelo painel do Supabase (Authentication › Users) antes de sair desta tela.'
        : 'O acesso foi cortado e a conta de login está BLOQUEADA, mas ela não pôde ser removida — o e-mail continua preso e não pode ser convidado de novo. Remova a conta pelo painel do Supabase (Authentication › Users) para liberar o endereço.',
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// 3. Encerrar as sessões abertas
// ---------------------------------------------------------------------------
// ⚠ O LIMITE HONESTO, que a tela também diz: isto derruba a RENOVAÇÃO da sessão, não o acesso
// que já está no navegador. O token corrente continua valendo até expirar (~1h) — a mesma
// janela da desativação. Para corte imediato, o caminho é DESATIVAR o usuário, que fecha
// leitura e escrita no request seguinte.
//
// Não existe caminho pela API do Supabase para isto: `admin.signOut()` recebe um JWT (o token
// de UMA sessão), não o id de um usuário — e o servidor não tem o token de outra pessoa. Quem
// faz é a RPC `encerrar_sessoes_usuario` (0074), apagando as linhas de `auth.sessions`.
export async function encerrarSessoes(input: { usuarioId: string }): Promise<DevResult> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = encerrarSessoesSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { usuarioId } = parsed.data

  const { data, error } = await supabase.rpc('encerrar_sessoes_usuario', { p_alvo: usuarioId })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  const quantas = typeof data === 'number' ? data : 0
  await registrarEventoAdmin({
    acao: 'sessoes_encerradas',
    autor: aut.uid,
    alvo: (await emailDoUsuario(usuarioId)) ?? usuarioId,
    detalhe: { sessoes: quantas },
  })
  revalidatePath('/admin/usuarios')

  return {
    ok: true,
    aviso:
      quantas === 0
        ? 'Nenhuma sessão aberta foi encontrada — esta pessoa já não estava conectada.'
        : `${quantas} sessão(ões) encerrada(s). O acesso que já está aberto no navegador dela pode continuar funcionando por até cerca de 1 hora; para cortar na hora, desative o acesso.`,
  }
}

// ---------------------------------------------------------------------------
// 4. Manutenção
// ---------------------------------------------------------------------------

// Roda as checagens de integridade sob demanda (o botão da /dev). Só leitura — a lista e o
// SQL vivem em `dev_checagens_integridade()` (migration 0077); aqui só se exige o cargo.
export async function rodarChecagensIntegridade(): Promise<
  { ok: true; checagens: Checagem[] } | { ok: false; erro: string }
> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }
  try {
    return { ok: true, checagens: await rodarChecagens() }
  } catch (err) {
    console.error('[dev] falha ao rodar as checagens', err)
    return { ok: false, erro: 'Não foi possível rodar as checagens agora.' }
  }
}

// Revalida o cache das rotas principais, por grupo. Existe para o caso em que uma tela fica
// exibindo dado velho depois de uma mexida direta no banco — o remédio que hoje só existe
// esperando o cache expirar ou fazendo um deploy novo.
//
// A lista é FECHADA: um `revalidatePath(qualquerCoisa)` vindo do cliente seria uma primitiva
// de invalidação arbitrária, e não há razão para oferecê-la.
//
// ⚠ `Object.create(null)` e não um objeto literal — achado da revisão adversarial (30/07).
// Num literal, `GRUPOS_REVALIDACAO['toString']` devolve a função herdada de Object.prototype,
// que é TRUTHY: o `if (!rotas)` não pegaria, e o `for…of` logo abaixo estouraria com
// "rotas is not iterable", trocando uma recusa limpa por um erro 500 sem tratamento. Vale para
// 'constructor', 'valueOf', '__proto__' e companhia. Sem protótipo, só existe o que se põe.
const GRUPOS_REVALIDACAO: Record<string, string[]> = Object.assign(Object.create(null), {
  acervo: ['/', '/ativos', '/movimentacoes', '/pendencias'],
  itens: ['/itens'],
  relatorios: ['/relatorios/geral', '/relatorios/gerados'],
  admin: ['/admin/usuarios', '/admin/filiais', '/admin/motivos', '/admin/itens', '/admin/kits'],
})

export async function revalidarGrupo(input: { grupo: string }): Promise<DevResult> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const rotas = GRUPOS_REVALIDACAO[input.grupo]
  if (!Array.isArray(rotas)) return { ok: false, erro: 'Grupo desconhecido.' }
  for (const rota of rotas) revalidatePath(rota)
  return { ok: true, aviso: `${rotas.length} rota(s) do grupo "${input.grupo}" revalidada(s).` }
}
