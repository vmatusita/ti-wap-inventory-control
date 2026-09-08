import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TipoMovimentacao } from '@/lib/dominio'
import type { PapelUsuario } from '@/lib/auth/papeis'

// Leituras das telas de administração (só ADMIN a partir da F21 — o gate está em
// admin/layout.tsx e, para cada escrita, na guarda `exigirAdmin()` da action).
//
// ⚠ ESTE É O SEGUNDO MÓDULO SEM RLS DO SISTEMA (F49, 07/09/2026)
// ---------------------------------------------------------------
// O primeiro é `queries/relatorios/**`, que o VISUALIZADOR POR SENHA alcança com
// service role — e que tem um tripwire próprio, `relatorios/fronteira-viewer.test.ts`,
// justamente porque ali o RLS não é a segunda linha. Este arquivo é o outro caso, e
// até agora ele não estava escrito em lugar nenhum.
//
// Das 9 funções exportadas aqui, CINCO usam `createAdminClient()` — service role, que
// tem `rolbypassrls` e passa por fora de toda policy: `lerContasAuth` (o helper de
// `listarUsuarios`), `idsDeAdminsAtivos`, `perfilPorEmail`, `emailDoUsuario`,
// `getEstadoUsuario` e `listarSenhasAcesso`. São 6 invocações num total de 22 no
// repositório inteiro — a maior concentração num só arquivo.
//
// E o que ele lê são PESSOAS, não inventário. Essa é a diferença que importa:
//   · `auth.admin.listUsers` (linha ~69, em `lerContasAuth`) ENUMERA O PROJETO AUTH
//     INTEIRO, página a página até o teto de `AUTH_PAGINAS_MAX` × `AUTH_POR_PAGINA`
//     = 50 × 200 = 10 mil contas. De cada uma vêm e-mail, último login e situação de
//     banimento. Não há filtro de filial, de cargo ou de qualquer outra coisa: o teto
//     existe só para o laço não ser infinito.
//   · `perfilPorEmail` faz a mesma varredura para achar o dono de um e-mail antes de
//     emitir um link de recuperação.
//   · `idsDeAdminsAtivos` e `getEstadoUsuario` precisam enxergar o conjunto REAL de
//     administradores — é isso que sustenta a trava de "não fique sem administrador",
//     que seria burlável se a RLS escondesse o alvo de quem pergunta.
//
// O que separa tudo isso de qualquer sessão logada é APENAS o código à volta: o
// `exigirAdmin`/`exigirDev` das actions que chamam estas funções, e o
// `getOperador` + `eAdmin` de `admin/layout.tsx` para as duas listagens que só as
// páginas alcançam. Nenhuma policy participa. Se uma dessas funções passar a ser
// chamada de um caminho sem guarda, não há segunda linha para segurar.
//
// O censo de TODOS os arquivos que invocam `createAdminClient()` — cada um com o
// motivo pelo qual a RLS não serve e o nome da guarda que o protege — está em
// `src/lib/supabase/superficie-admin.test.ts`, que reprova quando nasce um arquivo
// novo fora da lista. Na virada multiempresa essa lista é a agenda do recorte por
// tenant: aqui não haverá policy para fazer o recorte, e ele terá de ser escrito.

export type UsuarioAdmin = {
  id: string
  nome: string | null
  email: string | null
  created_at: string
  /** F21 — cargo vigente (`profiles.papel`). */
  papel: PapelUsuario
  /** F21 — `profiles.ativo`: false = desativado (não escreve nada, no request seguinte). */
  ativo: boolean
  /** F21 — vínculos CRUS de `operador_filiais` (ids). Só o cargo Operador usa. */
  vinculos: number[]
  /**
   * F21 — o usuário está banido no Supabase Auth (não consegue LOGAR de novo).
   * `null` = não foi possível saber (o Auth não respondeu; ver `avisoAuth`).
   * Normalmente espelha `!ativo`; divergência denuncia uma gravação que ficou pela metade.
   */
  banido: boolean | null
  /**
   * F29/ADM-02 — `auth.users.last_sign_in_at`: quando a pessoa entrou pela última
   * vez. `null` = NUNCA entrou (convite gerado e não usado) OU o Auth não respondeu
   * (`avisoAuth`). A tela distingue os dois casos pelo aviso; sem esta coluna, um
   * convidado que nunca ativou era indistinguível de um usuário ativo.
   */
  ultimoAcesso: string | null
}

export type ListaUsuarios = {
  usuarios: UsuarioAdmin[]
  /**
   * Aviso quando `auth.admin.listUsers` falhou: e-mail e situação de login ficam
   * INDETERMINADOS na tela. Antes da F21 isso era um `catch {}` vazio e a tela mostrava
   * e-mail em branco como se o usuário não tivesse e-mail — falha silenciosa que, com o
   * cargo e o banimento vindo da mesma chamada, passaria a esconder coisa pior.
   */
  avisoAuth: string | null
}

// Teto de páginas de `listUsers` (200 por página, como scripts/import/guard.ts). Existe só
// para o laço não ficar infinito se a API mudar de contrato: 50 × 200 = 10 mil contas, três
// ordens de grandeza acima da equipe.
const AUTH_PAGINAS_MAX = 50
const AUTH_POR_PAGINA = 200

type ContaAuth = {
  email: string | null
  banido: boolean
  ultimoAcesso: string | null
}

// Percorre TODAS as páginas de auth.users. O `perPage: 1000` anterior era um teto fixo sem
// paginação — silenciosamente correto hoje e silenciosamente errado no dia em que passar.
async function lerContasAuth(): Promise<{
  porId: Map<string, ContaAuth>
  aviso: string | null
}> {
  const admin = createAdminClient()
  const porId = new Map<string, ContaAuth>()
  const agora = Date.now()
  try {
    for (let pagina = 1; pagina <= AUTH_PAGINAS_MAX; pagina++) {
      const { data, error } = await admin.auth.admin.listUsers({
        page: pagina,
        perPage: AUTH_POR_PAGINA,
      })
      if (error) throw new Error(error.message)
      for (const u of data.users) {
        // `banned_until` é uma data: banimento vencido não é banimento.
        const ate = u.banned_until ? Date.parse(u.banned_until) : NaN
        porId.set(u.id, {
          email: u.email ?? null,
          banido: Number.isFinite(ate) && ate > agora,
          ultimoAcesso: u.last_sign_in_at ?? null,
        })
      }
      if (data.users.length < AUTH_POR_PAGINA) break
    }
    return { porId, aviso: null }
  } catch (err) {
    console.error('[admin/usuarios] falha ao listar contas do Auth', err)
    return {
      porId,
      aviso:
        'Não foi possível consultar o Supabase Auth agora: as colunas E-mail e o aviso de login bloqueado podem estar incompletos. Cargo, filiais e situação vêm do banco e estão corretos.',
    }
  }
}

// Perfis (cargo, situação, vínculos) + e-mail e banimento (que vivem em auth.users, lidos
// pelo client administrativo — server-side apenas).
//
// A lista de PERFIS segue sem paginação, de propósito: a tela é de gestão de uma equipe de
// dezenas de pessoas e o admin quer ver todo mundo de uma vez para comparar cargos. Se um dia
// passar do teto de linhas do PostgREST (1000 por padrão no Supabase), aqui é o lugar de
// paginar — e o sintoma seria a contagem do topo parar de crescer.
export async function listarUsuarios(): Promise<ListaUsuarios> {
  const client = await createClient()
  const [perfisRes, vinculosRes, contas] = await Promise.all([
    // F22: contas APAGADAS somem da tela. O perfil continua na tabela de propósito (é dele
    // que sai a autoria de toda movimentação antiga — ver 0073), mas ele não é mais um
    // usuário do sistema: não loga, não escreve, e listá-lo faria o admin tentar "reativar"
    // alguém cuja conta não existe mais no Auth.
    client
      .from('profiles')
      .select('id, nome, created_at, papel, ativo')
      .is('excluido_em', null)
      // F29/ADM-03b — do mais RECENTE para o mais antigo. Era `ascending: true`, e
      // quem o admin procura logo depois de convidar é justamente o recém-criado —
      // que ficava no fundo de uma lista sem busca. Ata em docs/DECISOES.md.
      .order('created_at', { ascending: false }),
    client.from('operador_filiais').select('usuario_id, filial_id'),
    lerContasAuth(),
  ])

  // Estes dois erros NÃO podem degradar em silêncio: sem perfis a tela mentiria "nenhum
  // usuário"; sem vínculos, um operador apareceria como se não escrevesse em filial nenhuma
  // e o admin "corrigiria" gravando por cima.
  if (perfisRes.error) {
    throw new Error(`Falha ao listar usuários: ${perfisRes.error.message}`)
  }
  if (vinculosRes.error) {
    throw new Error(`Falha ao listar as filiais de escrita: ${vinculosRes.error.message}`)
  }

  const vinculosPorUsuario = new Map<string, number[]>()
  for (const v of vinculosRes.data ?? []) {
    const lista = vinculosPorUsuario.get(v.usuario_id)
    if (lista) lista.push(v.filial_id)
    else vinculosPorUsuario.set(v.usuario_id, [v.filial_id])
  }

  const usuarios = (perfisRes.data ?? []).map((p) => {
    const conta = contas.porId.get(p.id)
    return {
      id: p.id,
      nome: p.nome,
      email: conta?.email ?? null,
      created_at: p.created_at,
      papel: p.papel,
      ativo: p.ativo,
      vinculos: (vinculosPorUsuario.get(p.id) ?? []).sort((a, b) => a - b),
      banido: contas.aviso ? null : (conta?.banido ?? false),
      ultimoAcesso: conta?.ultimoAcesso ?? null,
    }
  })

  return { usuarios, avisoAuth: contas.aviso }
}

// Ids das contas de NÍVEL ADMINISTRADOR ativas — insumo das travas de autoproteção
// (validators/admin.ts). Lido pelo SERVICE ROLE de propósito: a contagem que decide "isto
// deixaria o sistema sem administrador?" não pode depender de policy nenhuma. E FALHA
// FECHADA (throw): se a leitura não vier, a action recusa a gravação em vez de supor que
// sobra alguém.
//
// ⚠ F22: era `.eq('papel','admin')`. Agora inclui `dev`, para casar com `eAdminAtivo()`
// (validators) e com `existe_outro_admin_ativo()` (banco, 0074) — as três precisam contar o
// MESMO conjunto, senão a invariante fica inconsistente entre camadas. E `excluido_em is
// null` porque uma conta apagada não administra nada.
export async function idsDeAdminsAtivos(): Promise<string[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .in('papel', ['admin', 'dev'])
    .eq('ativo', true)
    .is('excluido_em', null)
  if (error) throw new Error(`Falha ao conferir os administradores ativos: ${error.message}`)
  return (data ?? []).map((p) => p.id)
}

// O caminho INVERSO: dado um e-mail, quem é ele no sistema. Devolve null quando não existe
// conta com esse endereço (ou quando o Auth não respondeu — ver o `throw` abaixo).
//
// ⚠ POR QUE ISTO EXISTE (achado da revisão adversarial, 30/07). `convidarUsuario` gera um link
// de RECUPERAÇÃO quando o e-mail já tem conta — e quem abre esse link define a senha. Sem
// saber DE QUEM é o e-mail antes de gerar, um administrador digitaria o endereço de um
// desenvolvedor, receberia um link válido e assumiria a conta dele: a proteção do cargo dev
// seria contornada inteira sem nunca tocar em `profiles`, que é onde todas as travas moram.
//
// FALHA FECHADA (throw): se o Auth não responder, o chamador recusa em vez de supor que o
// e-mail é de um desconhecido — supor seria exatamente o caso perigoso.
//
// O `listUsers` não filtra por e-mail, então pagina-se como em `lerContasAuth`. São dezenas de
// contas; o custo é irrelevante e acontece só ao convidar.
export async function perfilPorEmail(
  email: string,
): Promise<{ id: string; papel: PapelUsuario; ativo: boolean } | null> {
  const admin = createAdminClient()
  const alvo = email.trim().toLowerCase()

  let id: string | null = null
  for (let pagina = 1; pagina <= AUTH_PAGINAS_MAX; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page: pagina,
      perPage: AUTH_POR_PAGINA,
    })
    if (error) throw new Error(`Falha ao consultar as contas de acesso: ${error.message}`)
    const achado = data.users.find((u) => (u.email ?? '').toLowerCase() === alvo)
    if (achado) {
      id = achado.id
      break
    }
    if (data.users.length < AUTH_POR_PAGINA) break
  }
  if (!id) return null

  const { data: perfil, error: erroPerfil } = await admin
    .from('profiles')
    .select('id, papel, ativo')
    .eq('id', id)
    .maybeSingle()
  if (erroPerfil) throw new Error(`Falha ao ler o perfil: ${erroPerfil.message}`)
  // Conta sem perfil não deveria existir (o trigger cria). Se acontecer, devolver null diria
  // "não há conta", que é falso — o cargo é desconhecido, e o chamador tem de tratar isso.
  if (!perfil) throw new Error('Conta de acesso sem perfil no sistema.')
  return { id: perfil.id, papel: perfil.papel, ativo: perfil.ativo }
}

// E-mail de login de uma conta, ou null se o Auth não respondeu / a conta não existe mais.
// Usado pela confirmação digitada do "apagar" (validarExclusaoDeUsuario) — que compara
// contra o e-mail REAL, e por isso precisa distinguir "não sei" de "é este".
export async function emailDoUsuario(id: string): Promise<string | null> {
  const admin = createAdminClient()
  const r = await admin.auth.admin.getUserById(id).catch(() => null)
  if (!r || r.error) return null
  return r.data.user?.email ?? null
}

// Cargo, situação e vínculos de UM usuário — o estado "antes" que as travas de
// autoproteção comparam com o pedido. Service role pela mesma razão de cima.
export type EstadoUsuario = {
  id: string
  papel: PapelUsuario
  ativo: boolean
  vinculos: number[]
  nome: string | null
}

export async function getEstadoUsuario(id: string): Promise<EstadoUsuario | null> {
  const admin = createAdminClient()
  const [{ data: perfil, error: erroPerfil }, { data: vinculos, error: erroVinculos }] =
    await Promise.all([
      // F22: `excluido_em is null` — uma conta apagada não é alvo de nada (as RPCs da 0074
      // também a recusam; aqui a recusa vira "Usuário não encontrado", que é a verdade
      // do ponto de vista da tela).
      admin
        .from('profiles')
        .select('id, papel, ativo, nome')
        .eq('id', id)
        .is('excluido_em', null)
        .maybeSingle(),
      admin.from('operador_filiais').select('filial_id').eq('usuario_id', id),
    ])
  if (erroPerfil) throw new Error(`Falha ao ler o usuário: ${erroPerfil.message}`)
  if (erroVinculos) throw new Error(`Falha ao ler as filiais do usuário: ${erroVinculos.message}`)
  if (!perfil) return null
  return {
    id: perfil.id,
    papel: perfil.papel,
    ativo: perfil.ativo,
    nome: perfil.nome,
    vinculos: (vinculos ?? []).map((v) => v.filial_id).sort((a, b) => a - b),
  }
}

// Filiais para a tela de usuários: TODAS (não só as ativas), porque um vínculo antigo pode
// apontar para filial desativada e a coluna "Filiais de escrita" precisa do nome para
// mostrá-lo em vez de um número cru. O formulário oferece apenas `ativo = true`.
export type FilialParaVinculo = { id: number; nome: string; ativo: boolean }

export async function listarFiliaisParaVinculo(): Promise<FilialParaVinculo[]> {
  const client = await createClient()
  const { data, error } = await client
    .from('filiais')
    .select('id, nome, ativo')
    .order('nome', { ascending: true })
  if (error) throw new Error(`Falha ao listar filiais: ${error.message}`)
  return data ?? []
}

export type FilialAdmin = {
  id: number
  slug: string
  nome: string
  ativo: boolean
  /** F25 — cidade que assina o termo. '' = ainda não cadastrada. */
  cidade: string
  totalAtivos: number
}

export async function listarFiliaisAdmin(): Promise<FilialAdmin[]> {
  const client = await createClient()
  const [{ data: filiais }, { data: estoque }] = await Promise.all([
    client.from('filiais').select('id, slug, nome, ativo, cidade').order('nome'),
    client.from('v_estoque_atual').select('filial, total'),
  ])

  const totalPorSlug = new Map<string, number>()
  for (const e of estoque ?? []) {
    if (e.filial) totalPorSlug.set(e.filial, (totalPorSlug.get(e.filial) ?? 0) + (e.total ?? 0))
  }

  return (filiais ?? []).map((f) => ({
    id: f.id,
    slug: f.slug,
    nome: f.nome,
    ativo: f.ativo,
    cidade: f.cidade,
    totalAtivos: totalPorSlug.get(f.slug) ?? 0,
  }))
}

export type MotivoAdmin = {
  codigo: string
  rotulo: string
  aplica_a: TipoMovimentacao[]
  ativo: boolean
}

export async function listarMotivosAdmin(): Promise<MotivoAdmin[]> {
  const client = await createClient()
  const { data } = await client
    .from('motivos')
    .select('codigo, rotulo, aplica_a, ativo')
    .order('rotulo')
  return (data ?? []) as MotivoAdmin[]
}

export type SenhaAdmin = {
  id: string
  rotulo: string
  ativa: boolean
  created_at: string
  ultimo_uso: string | null
}

// NUNCA seleciona a coluna `hash` — o hash não sai do servidor (OS-F3 3.10).
// Lê pelo client ADMINISTRATIVO (service role): a partir da migration 0012 a
// tabela `senhas_acesso` não é mais legível por `authenticated` (a RLS deixava
// o hash acessível ao browser do operador via PostgREST — achado da revisão).
export async function listarSenhasAcesso(): Promise<SenhaAdmin[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('senhas_acesso')
    .select('id, rotulo, ativa, created_at, ultimo_uso')
    .order('created_at', { ascending: false })
  return (data ?? []) as SenhaAdmin[]
}
