'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exigirAdmin } from '@/lib/auth/acesso'
import type { DbClient } from '@/lib/auth/acesso'
import { PAPEL_ROTULO, eDev } from '@/lib/auth/papeis'
import type { PapelUsuario } from '@/lib/auth/papeis'
import { registrarEventoAdmin } from '@/lib/auditoria-registro'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import { DOMINIOS_OPERADOR, DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import { getSaldosItens } from '@/lib/queries/itens'
import { getEstadoUsuario, idsDeAdminsAtivos, perfilPorEmail } from '@/lib/queries/admin'
import type { EstadoUsuario } from '@/lib/queries/admin'
import {
  convidarUsuarioSchema,
  definirStatusUsuarioSchema,
  editarUsuarioSchema,
  filialSchema,
  atualizarFilialSchema,
  motivoSchema,
  atualizarMotivoSchema,
  validarStatusDeUsuario,
  validarTrocaDePapel,
  MSG_SO_DEV_GERE_DEV,
} from '@/lib/validators/admin'

// F21 — TODA action deste arquivo exige ADMIN. Antes havia uma guarda local
// `exigirOperador()` que só perguntava "existe sessão?": qualquer logado convidava usuário,
// criava filial e editava o vocabulário de motivos. A guarda agora é `exigirAdmin`
// (src/lib/auth/acesso.ts), que lê o cargo pela MESMA função do banco que a RLS usa
// (`papel_atual()`), então a mensagem amigável e a recusa do Postgres nunca divergem.
//
// ⚠ A trava de verdade são as policies `e_admin()` da migration 0063 (filiais, motivos) e o
// service role (usuários). Se esta guarda for removida por engano, o banco continua
// recusando — mas com SQLSTATE cru em vez de frase em pt-BR.

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

// ---- Convite de operador (domínios da spec §3 — validação client E server) ----
// Gera um LINK em vez de mandar e-mail pelo Supabase. O e-mail embutido do
// Supabase é limitado a ~2/hora e "só para testes"; subir esse teto exigiria
// SMTP próprio (⇒ domínio verificado, que não temos). `generateLink` cria o
// usuário e devolve o token SEM disparar e-mail — o admin copia o link e envia
// por WhatsApp/Teams/e-mail. Sem limite, sem domínio, sem serviço novo (custo R$ 0).
//
// `type` NÃO exportado de propósito: arquivo 'use server' só pode EXPORTAR funções
// async (regra do Next). O dialog infere o retorno via ReturnType — não importa o tipo.
//
// `aviso` (F21): o convite deu certo mas algo secundário não — a conta existe e o link vale,
// só o cargo/os vínculos não foram gravados. Devolver `ok: false` aqui seria mentir (a conta
// FOI criada e o admin precisa do link); esconder seria pior (usuário sem escrita nenhuma).
type ConviteResult =
  | { ok: true; link: string; reenvio: boolean; aviso?: string }
  | { ok: false; erro: string }

export async function convidarUsuario(input: {
  email: string
  papel: PapelUsuario
  filiais: number[]
}): Promise<ConviteResult> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  // Mesmo schema do formulário (mínimo 1 filial para Operador vem de
  // `validarVinculosDoPapel`): a validação do cliente é conveniência, esta é a que vale.
  const parsed = convidarUsuarioSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { email, papel, filiais } = parsed.data

  // F22 — o convite é o OUTRO caminho de concessão de cargo, e sem esta linha ele seria o
  // furo: `editarUsuario` recusa promover a dev, mas convidar alguém JÁ como dev entraria
  // por aqui. A RPC `definir_papel_usuario` também recusa (a guarda `exigir_gestao_de` da
  // 0074 exige `e_dev()` quando o cargo pedido é dev) — mas aí a conta já teria sido criada
  // no Auth e o admin receberia um link válido com um aviso confuso. Recusar ANTES é o certo.
  if (eDev(papel) && !eDev(aut.papel)) {
    return { ok: false, erro: MSG_SO_DEV_GERE_DEV }
  }

  // ⚠ O OUTRO LADO DO MESMO FURO, e o mais perigoso — achado da revisão adversarial (30/07).
  // Quando o e-mail JÁ TEM CONTA, esta action gera um link de RECUPERAÇÃO (ramo 2, abaixo), e
  // quem abre esse link DEFINE A SENHA daquela conta. Um administrador que digitasse o e-mail
  // de um desenvolvedor — endereço que ele lê na própria coluna "E-mail" da lista — receberia
  // um link válido e assumiria a conta: cargo dev, área /dev, apagar usuários, tudo. A
  // proteção inteira da fase seria contornada SEM NUNCA TOCAR EM `profiles`, que é onde o
  // trigger e as RPCs vigiam.
  //
  // Por isso a checagem vem AQUI, antes de qualquer `generateLink`: gerar o link primeiro e
  // recusar depois já teria emitido um token de recuperação válido para a conta alheia.
  //
  // Falha FECHADA: se não der para saber de quem é o e-mail, recusa. Supor que é de um
  // desconhecido é exatamente o caso que se quer impedir.
  if (!eDev(aut.papel)) {
    let alvo
    try {
      alvo = await perfilPorEmail(email)
    } catch (err) {
      console.error('[admin/usuarios] falha ao conferir de quem é o e-mail do convite', err)
      return {
        ok: false,
        erro: 'Não foi possível conferir esse e-mail agora. Tente de novo em instantes.',
      }
    }
    if (alvo && eDev(alvo.papel)) {
      return { ok: false, erro: MSG_SO_DEV_GERE_DEV }
    }
  }

  const origem = origemDaRequisicao(await headers())
  if (!origem) {
    return { ok: false, erro: 'Não foi possível montar o link (endereço do site ausente).' }
  }

  const admin = createAdminClient()

  // 1) Novo operador → convite. Cria a conta em auth.users; o trigger
  //    handle_new_user (migrations 0001 → 0041) barra e-mail fora dos domínios
  //    permitidos no banco.
  const convite = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${origem}/auth/confirm` },
  })

  if (!convite.error && convite.data.properties) {
    // O cargo é gravado AQUI, pelo service role, e NUNCA vem de `raw_user_meta_data`: o
    // próprio usuário edita o metadata dele por `auth.updateUser`, então metadata não é
    // canal confiável para autorização (ADR-002 §5).
    //
    // O perfil já existe neste ponto — o trigger `handle_new_user` roda na mesma transação
    // do insert em auth.users. Se ainda assim a gravação falhar, a conta nasce
    // `operador` + zero vínculo (default da 0061), que NÃO escreve em lugar nenhum: falha
    // segura, e o aviso manda o admin ajustar em Editar.
    const r = await aplicarCargoEVinculos(supabase, convite.data.user.id, papel, filiais)
    await registrarEventoAdmin({
      acao: 'convite_gerado',
      autor: aut.uid,
      alvo: email,
      // A trilha guarda o que foi PEDIDO e se a gravação pegou — assim um usuário que
      // aparecer depois com cargo diferente do convite tem explicação na própria trilha.
      detalhe: {
        papel,
        filiais,
        cargo_gravado: r.papelGravado,
        vinculos_gravados: r.vinculosGravados,
      },
    })
    revalidatePath('/admin/usuarios')
    return {
      ok: true,
      reenvio: false,
      link: linkConfirmacao(origem, convite.data.properties.hashed_token, 'invite'),
      ...(r.erro
        ? {
            aviso: `A conta foi criada e o link abaixo vale, mas o cargo/as filiais não foram gravados: ${r.erro} Ajuste em "Editar", na lista de usuários — até lá esta pessoa não escreve em nenhuma filial.`,
          }
        : {}),
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
      // REENVIO NÃO MEXE EM CARGO. Deliberado: aqui a ação é "gerar outro link de acesso
      // para uma conta que já existe", e sobrescrever o cargo de alguém por esse caminho
      // burlaria as travas de autoproteção (bastaria "reconvidar" o último admin como
      // consulta para trancar o sistema). Trocar cargo é a action `editarUsuario`, que
      // confere as travas. O diálogo avisa o admin.
      //
      // Conta DESATIVADA é a armadilha deste caminho: o link é gerado e a pessoa até define
      // a senha, mas o login continua barrado (ban do Auth) e ela não escreve nada
      // (`ativo = false`). Sem este aviso, o admin entregaria o link achando que devolveu o
      // acesso — e o suporte viraria "meu login não funciona".
      const estado = await getEstadoUsuario(recovery.data.user.id).catch(() => null)
      const desativado = estado ? !estado.ativo : false
      await registrarEventoAdmin({
        acao: 'convite_reenviado',
        autor: aut.uid,
        alvo: email,
        detalhe: desativado ? { conta_desativada: true } : null,
      })
      revalidatePath('/admin/usuarios')
      return {
        ok: true,
        reenvio: true,
        link: linkConfirmacao(origem, recovery.data.properties.hashed_token, 'recovery'),
        ...(desativado
          ? {
              aviso:
                'Atenção: o acesso desta pessoa está DESATIVADO. O link abaixo deixa ela definir uma senha, mas ela só volta a entrar depois que você clicar em "Reativar" na lista de usuários.',
            }
          : {}),
      }
    }
  }

  // 3) Erro real. O trigger do banco barra e-mail fora do domínio (defesa final).
  const msg = (convite.error?.message ?? '').toLowerCase()
  const citaDominio = DOMINIOS_OPERADOR.some((d) => msg.includes(d.slice(1)))
  if (citaDominio || msg.includes('restrito')) {
    return { ok: false, erro: `Só e-mails ${DOMINIOS_TEXTO} podem ser convidados.` }
  }
  return { ok: false, erro: 'Não foi possível gerar o link de convite. Tente de novo.' }
}

// ---- Cargo e vínculos: a gravação (RPC, com o client de SESSÃO) ----
//
// ⚠ F22 — MUDANÇA DE FUNDO. Até a F21 estas duas gravações eram feitas com o SERVICE ROLE
// (`createAdminClient`), que passa por fora de toda policy: a única coisa entre um admin e a
// escrita era o `if` desta action. Isso é aceitável enquanto ninguém precisa ser protegido de
// um admin — e deixou de ser quando nasceu o cargo `dev`, que por definição não pode ser
// alterado por quem está abaixo dele.
//
// Agora quem grava são as RPCs `security definer` da migration 0074, chamadas com o client de
// SESSÃO: a decisão "quem pode?" roda no Postgres, com `auth.uid()` real, e vale para
// qualquer chamador — esta action, um script, ou um curl com o token de um admin. A rede
// `profiles_guarda_dev` (0073) recusa qualquer caminho que não passe por elas, service role
// incluído.
//
// As guardas puras (`validarTrocaDePapel`/`validarStatusDeUsuario`) continuam existindo e
// rodando ANTES — elas dão a frase em pt-BR. As duas camadas concordam por construção porque
// decidem pelos mesmos predicados; `supabase/tests/cargo_dev.sql` é a rede que denuncia
// divergência.
type GravacaoCargo = {
  erro: string | null
  papelGravado: boolean
  vinculosGravados: boolean
}

// A RPC levanta P0002 com "Usuário não encontrado" quando o perfil ainda não existe. A
// tradução genérica não diria o que o admin precisa ouvir nesse caso específico.
function traduzErroDeGestao(mensagem: string, codigo?: string): string {
  if (/n[ãa]o encontrad/i.test(mensagem)) {
    return 'Este usuário ainda não tem perfil no sistema (ele aparece depois do primeiro acesso).'
  }
  return traduzErroBanco(mensagem, codigo)
}

async function aplicarCargoEVinculos(
  supabase: DbClient,
  usuarioId: string,
  papel: PapelUsuario,
  filiais: readonly number[],
): Promise<GravacaoCargo> {
  const { error: erroPapel } = await supabase.rpc('definir_papel_usuario', {
    p_alvo: usuarioId,
    p_papel: papel,
  })
  if (erroPapel) {
    return {
      erro: traduzErroDeGestao(erroPapel.message, erroPapel.code),
      papelGravado: false,
      vinculosGravados: false,
    }
  }

  // Apaga e regrava em vez de calcular diferença (a RPC faz isso por dentro): a tabela é
  // minúscula e o estado final é o que a tela mostra, sem meio-caminho possível.
  //
  // Para dev, admin e consulta `filiais` é sempre vazio (o schema recusa o contrário), então
  // a RPC LIMPA os vínculos de quem foi promovido/rebaixado. Deixá-los seria inofensivo no
  // banco (`pode_escrever_filial` ignora vínculo de nível admin e fecha para consulta), mas a
  // coluna "Filiais de escrita" passaria a exibir vínculo que não vale nada — e um dia
  // alguém acreditaria nela.
  const { error: erroVinculos } = await supabase.rpc('definir_vinculos_usuario', {
    p_alvo: usuarioId,
    p_filiais: [...filiais],
  })
  if (erroVinculos) {
    return {
      erro: traduzErroDeGestao(erroVinculos.message, erroVinculos.code),
      papelGravado: true,
      vinculosGravados: false,
    }
  }

  return { erro: null, papelGravado: true, vinculosGravados: true }
}

// Estado ATUAL do alvo + a lista de admins ativos: os dois insumos das travas de
// autoproteção (validators/admin.ts). Lidos juntos e sempre na hora — a decisão "isto
// deixaria o sistema sem administrador?" não pode sair de cache nem do cliente.
async function carregarAlvo(
  usuarioId: string,
): Promise<{ estado: EstadoUsuario; adminsAtivosIds: string[] } | { erro: string }> {
  try {
    const [estado, adminsAtivosIds] = await Promise.all([
      getEstadoUsuario(usuarioId),
      idsDeAdminsAtivos(),
    ])
    if (!estado) return { erro: 'Usuário não encontrado. Atualize a página e tente de novo.' }
    return { estado, adminsAtivosIds }
  } catch (err) {
    // FALHA FECHADA: sem conseguir contar os admins ativos, recusa a gravação. O contrário
    // (seguir e supor que sobra alguém) é justamente como se perde o último administrador.
    console.error('[admin/usuarios] falha ao carregar o estado do usuário', err)
    return {
      erro: 'Não foi possível conferir a situação atual deste usuário. Tente de novo em instantes.',
    }
  }
}

// Nome do alvo para a trilha de auditoria: e-mail quando o Auth responde, senão o nome do
// perfil, senão o id. `alvo` é texto LEGÍVEL (comment da coluna, migration 0065) — quem for
// ler a trilha seis meses depois precisa reconhecer a pessoa.
async function alvoLegivel(estado: EstadoUsuario): Promise<string> {
  const admin = createAdminClient()
  const r = await admin.auth.admin.getUserById(estado.id).catch(() => null)
  const email = r && !r.error ? (r.data.user?.email ?? null) : null
  return email ?? estado.nome?.trim() ?? estado.id
}

function mesmasFiliais(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

// ---- Editar cargo e filiais de escrita de quem já existe ----
// `aviso` = gravou o essencial mas não tudo (ver ConviteResult). O diálogo mostra em toast
// de alerta, e não de sucesso.
type UsuarioResult = { ok: true; aviso?: string } | { ok: false; erro: string }

export async function editarUsuario(input: {
  usuarioId: string
  papel: PapelUsuario
  filiais: number[]
}): Promise<UsuarioResult> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = editarUsuarioSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { usuarioId, papel, filiais } = parsed.data

  const ctx = await carregarAlvo(usuarioId)
  if ('erro' in ctx) return { ok: false, erro: ctx.erro }
  const { estado, adminsAtivosIds } = ctx

  const recusa = validarTrocaDePapel({
    autorId: aut.uid,
    autorPapel: aut.papel,
    alvo: { id: estado.id, papel: estado.papel, ativo: estado.ativo },
    novoPapel: papel,
    adminsAtivosIds,
  })
  if (recusa) return { ok: false, erro: recusa }

  const trocouPapel = papel !== estado.papel
  const trocouVinculos = !mesmasFiliais(filiais, estado.vinculos)
  if (!trocouPapel && !trocouVinculos) return { ok: true }

  const r = await aplicarCargoEVinculos(supabase, usuarioId, papel, filiais)

  // A trilha registra o que REALMENTE foi gravado — não o que foi pedido.
  const alvo = await alvoLegivel(estado)
  if (trocouPapel && r.papelGravado) {
    await registrarEventoAdmin({
      acao: 'papel_alterado',
      autor: aut.uid,
      alvo,
      detalhe: { de: estado.papel, para: papel },
    })
  }
  if (r.vinculosGravados && trocouVinculos) {
    await registrarEventoAdmin({
      acao: 'vinculos_alterados',
      autor: aut.uid,
      alvo,
      detalhe: { filiais, de: estado.vinculos },
    })
  }

  revalidatePath('/admin/usuarios')
  if (r.erro) {
    return r.papelGravado
      ? {
          ok: true,
          aviso: `O cargo foi alterado para ${PAPEL_ROTULO[papel]}, mas as filiais de escrita não: ${r.erro}`,
        }
      : { ok: false, erro: r.erro }
  }
  return { ok: true }
}

// ---- Desativar / reativar acesso ----
// Ban "para sempre" — o formato aceita só ns/us/ms/s/m/h, então 876000h = 100 anos é o
// idioma da própria documentação do Supabase ("Ban a user for 100 years"). `'none'` levanta.
const BAN_INDEFINIDO = '876000h'

export async function definirStatusUsuario(input: {
  usuarioId: string
  ativo: boolean
}): Promise<UsuarioResult> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = definirStatusUsuarioSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { usuarioId, ativo } = parsed.data

  const ctx = await carregarAlvo(usuarioId)
  if ('erro' in ctx) return { ok: false, erro: ctx.erro }
  const { estado, adminsAtivosIds } = ctx

  const recusa = validarStatusDeUsuario({
    autorId: aut.uid,
    autorPapel: aut.papel,
    alvo: { id: estado.id, papel: estado.papel, ativo: estado.ativo },
    novoAtivo: ativo,
    adminsAtivosIds,
  })
  if (recusa) return { ok: false, erro: recusa }
  if (ativo === estado.ativo) return { ok: true }

  const admin = createAdminClient()

  // `profiles.ativo` PRIMEIRO, nos dois sentidos: é o lado que tem efeito no REQUEST
  // SEGUINTE (papel_atual() devolve NULL e toda policy fecha, leitura inclusa desde a 0070).
  // O ban do Auth impede login NOVO, o que só importa depois que a sessão atual expira.
  //
  // F22: pela RPC (client de SESSÃO), não mais pelo service role — ver o comentário longo em
  // `aplicarCargoEVinculos`. É o que faz a proteção do dev valer também aqui, no banco.
  const { error: erroStatus } = await supabase.rpc('definir_status_usuario', {
    p_alvo: usuarioId,
    p_ativo: ativo,
  })
  if (erroStatus) {
    return { ok: false, erro: traduzErroDeGestao(erroStatus.message, erroStatus.code) }
  }

  const ban = await admin.auth.admin.updateUserById(usuarioId, {
    ban_duration: ativo ? 'none' : BAN_INDEFINIDO,
  })
  const loginBloqueado = !ban.error

  await registrarEventoAdmin({
    acao: ativo ? 'usuario_reativado' : 'usuario_desativado',
    autor: aut.uid,
    alvo: await alvoLegivel(estado),
    detalhe: { papel: estado.papel, login_no_auth: loginBloqueado ? 'ok' : 'falhou' },
  })

  revalidatePath('/admin/usuarios')

  if (!loginBloqueado) {
    console.error('[admin/usuarios] falha ao (des)banir no Auth', ban.error)
    // A metade que importa já valeu; devolver `ok: false` faria o admin repetir a ação
    // achando que nada aconteceu. O texto diz exatamente o que ficou pendente.
    return {
      ok: true,
      aviso: ativo
        ? 'O acesso foi reativado no sistema, mas o bloqueio de login no Supabase Auth pode não ter sido removido — se a pessoa não conseguir entrar, tente reativar de novo.'
        : 'O acesso foi desativado no sistema (efeito imediato: esta pessoa não escreve mais nada), mas não foi possível bloquear o login no Supabase Auth. Tente desativar de novo.',
    }
  }
  return { ok: true }
}

// ---- Filiais ----
export async function criarFilial(input: {
  nome: string
  slug: string
}): Promise<ActionResult> {
  const client = await createClient()
  const aut = await exigirAdmin(client)
  if (!aut.ok) return { ok: false, erro: aut.erro }
  const parsed = filialSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

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
  const client = await createClient()
  const aut = await exigirAdmin(client)
  if (!aut.ok) return { ok: false, erro: aut.erro }
  const parsed = atualizarFilialSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { id, nome, slug, ativo } = parsed.data

  // Bloquear desativar filial com ativos (OS-F3 3.7.2) OU com saldo de itens por
  // quantidade (F12-W4-07). As DUAS checagens são independentes, e não uma só,
  // para a mensagem dizer qual delas barrou.
  //
  // Por que a segunda: `listarFiliais()` filtra `ativo = true`, então desativar
  // uma filial tira a coluna dela de /itens?visao=filiais e a opção do select do
  // lançamento — mas a RPC `rel_saldo_itens` NÃO junta com `filiais` e continua
  // somando aquele estoque no Total. Resultado: N mouses que ninguém consegue
  // movimentar, com uma linha cinza "inclui N de filial desativada" como única
  // pista. O guarda só contava `ativos`, então isso passava.
  //
  // A conta é sobre o SALDO (a mesma RPC da tela), não sobre a contagem de
  // lançamentos: uma filial com entrada 5 + saída 5 tem histórico e estoque
  // zero, e não há por que travar a desativação dela — lançamento não se apaga.
  if (!ativo) {
    const [{ count, error: eContagem }, saldos] = await Promise.all([
      client.from('ativos').select('*', { count: 'exact', head: true }).eq('filial_id', id),
      getSaldosItens(id),
    ])
    // Sem isto o guarda falha ABERTO: em erro o PostgREST devolve `count: null`,
    // `(null ?? 0) > 0` é falso e a desativação passa como se a filial estivesse
    // vazia. A outra metade do mesmo Promise.all (`getSaldosItens`) já falha
    // fechado, por `throw` — aqui o canal de erro estava sendo descartado.
    if (eContagem) {
      return {
        ok: false,
        erro: traduzErroBanco(eContagem.message, eContagem.code),
      }
    }
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        erro: `Não é possível desativar: há ${count} ativo(s) nesta filial. Transfira-os antes.`,
      }
    }
    const comSaldo = saldos.filter((s) => s.estoque > 0)
    if (comSaldo.length > 0) {
      const unidades = comSaldo.reduce((acc, s) => acc + s.estoque, 0)
      return {
        ok: false,
        erro: `Não é possível desativar: há ${comSaldo.length} item(ns) com saldo nesta filial (${unidades} unidade(s) em estoque). Zere o estoque antes, em Itens por quantidade.`,
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
  // A lista de filiais é coluna em /itens?visao=filiais, opção do select de
  // lançamento e filtro das listas — sem isto a tela fica com a filial velha.
  revalidatePath('/itens')
  return { ok: true }
}

// ---- Motivos ----
export async function criarMotivo(input: {
  codigo: string
  rotulo: string
  aplica_a: string[]
}): Promise<ActionResult> {
  const client = await createClient()
  const aut = await exigirAdmin(client)
  if (!aut.ok) return { ok: false, erro: aut.erro }
  const parsed = motivoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

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
  const client = await createClient()
  const aut = await exigirAdmin(client)
  if (!aut.ok) return { ok: false, erro: aut.erro }
  const parsed = atualizarMotivoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { codigo, rotulo, aplica_a, ativo } = parsed.data

  const { error } = await client
    .from('motivos')
    .update({ rotulo, aplica_a, ativo })
    .eq('codigo', codigo)
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  revalidatePath('/admin/motivos')
  return { ok: true }
}
