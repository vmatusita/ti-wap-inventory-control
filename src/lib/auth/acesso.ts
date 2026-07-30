import 'server-only'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerSessaoView, VIEW_COOKIE_NAME } from '@/lib/auth/senha-sessao'
import { PAPEL_ROTULO, filiaisDeEscrita, papelAtende } from '@/lib/auth/papeis'
import type { PapelUsuario } from '@/lib/auth/papeis'
import type { Database } from '@/lib/types/database'

export type DbClient = SupabaseClient<Database>

// F21: o operador deixou de ser só "quem está logado". `papel` é o cargo vigente e
// `filiaisEscrita` são as filiais em que ele pode ESCREVER (admin → todas as ativas).
// Leitura continua ampla para todos os cargos — ADR-001 segue valendo nesse ponto.
export type Operador = {
  id: string
  nome: string
  papel: PapelUsuario
  filiaisEscrita: number[]
}

// Mensagem única de "sessão expirada" — antes escrita em 4 variações espalhadas
// pelas actions.
export const MSG_SESSAO_EXPIRADA = 'Sua sessão expirou. Faça login novamente.'

// F21 — as negativas por CARGO/VÍNCULO. Ficam aqui, junto da de sessão, para que nenhuma
// action reescreva o texto à mão (foi o que originou a MSG_SESSAO_EXPIRADA).
export const MSG_USUARIO_DESATIVADO =
  'Seu acesso foi desativado. Fale com um administrador.'
export const MSG_SOMENTE_LEITURA =
  'Seu cargo é de consulta (somente leitura): você pode consultar tudo, mas não registrar alterações.'
export const MSG_SO_ADMIN =
  'Esta ação é restrita a administradores.'

export function msgSemEscritaNaFilial(filial?: string | null): string {
  return filial
    ? `Você não tem permissão de escrita na filial ${filial}. Fale com um administrador.`
    : 'Você não tem permissão de escrita nesta filial. Fale com um administrador.'
}

// Id do operador logado a partir de um client de sessão JÁ criado — sem o SELECT
// extra em `profiles` que `getOperador` faz (a maioria das actions só quer o id
// do autor para `criado_por`/`gerado_por`). Retorna null quando não há sessão.
//
// ⚠ F21: `idOperador` responde "existe sessão?", NÃO "pode fazer isso?". Ele NÃO enxerga
// cargo nem filial e NÃO vê a desativação. Use-o só para obter o autor; a autorização é
// das guardas `exigirPapel`/`exigirAdmin`/`exigirEscrita*` abaixo.
export async function idOperador(supabase: DbClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

// ---------------------------------------------------------------------------
// Cargo e vínculos
// ---------------------------------------------------------------------------

// Cargo vigente de quem está pedindo, lido do BANCO pela mesma função que a RLS usa
// (`papel_atual()`, migration 0062). Devolve null sem sessão, sem perfil OU com o perfil
// DESATIVADO — é o que faz a desativação valer no request seguinte.
//
// Por que via RPC e não por um `select papel from profiles`: assim a action e a policy
// consultam a MESMA fonte. Se um dia a regra do papel mudar no banco, as duas mudam juntas
// e não há como divergirem (o §4 da ordem F21 exige que concordem).
export async function papelAtual(supabase: DbClient): Promise<PapelUsuario | null> {
  const { data, error } = await supabase.rpc('papel_atual')
  if (error) return null
  return (data as PapelUsuario | null) ?? null
}

// Espelho de `pode_escrever_filial(fid)` do banco (migration 0062). Mesma razão de cima:
// uma fonte só para o predicado do vínculo.
export async function podeEscreverFilial(
  supabase: DbClient,
  filialId: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('pode_escrever_filial', { fid: filialId })
  if (error) return false
  return data === true
}

// Operador logado (Supabase Auth) COM cargo e filiais de escrita. null quando não há
// sessão OU o perfil está desativado — nesse segundo caso o efeito é o mesmo de estar
// deslogado, e é intencional: o layout redireciona para o login.
export async function getOperador(): Promise<Operador | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: perfil } = await supabase
    .from('profiles')
    .select('nome, papel, ativo')
    .eq('id', user.id)
    .maybeSingle()

  // Sem perfil (não deveria acontecer — o trigger cria) ou DESATIVADO: fecha.
  // Fecha também quando o perfil não pôde ser lido, em vez de assumir um cargo.
  if (!perfil || !perfil.ativo) return null

  const papel = perfil.papel as PapelUsuario

  // Filiais de escrita: admin recebe todas as ATIVAS; operador, as vinculadas; consulta,
  // nenhuma. As duas leituras são baratas (tabelas de dezenas de linhas) e valem por
  // request, não por action.
  const [{ data: ativas }, { data: vinculos }] = await Promise.all([
    supabase.from('filiais').select('id').eq('ativo', true),
    supabase.from('operador_filiais').select('filial_id').eq('usuario_id', user.id),
  ])

  const filiaisEscrita = filiaisDeEscrita(
    papel,
    (vinculos ?? []).map((v) => v.filial_id),
    (ativas ?? []).map((f) => f.id),
  )

  return {
    id: user.id,
    nome: perfil.nome?.trim() || user.email || 'Operador',
    papel,
    filiaisEscrita,
  }
}

// ---------------------------------------------------------------------------
// Guardas das Server Actions
// ---------------------------------------------------------------------------
// O RLS é o guarda-costas (recusa em SQLSTATE); a guarda aqui é a MENSAGEM amigável em
// pt-BR, avaliada ANTES de tentar a escrita. As duas têm de concordar — e concordam por
// construção, porque as duas chamam as mesmas funções do banco.
//
// Formato pensado para encaixar no padrão que as actions já usam:
//
//   const aut = await exigirEscrita(supabase, filialId)
//   if (!aut.ok) return { ok: false, erro: aut.erro }
//   // aut.uid é o autor (o que `idOperador` devolvia)

export type Autorizacao =
  | { ok: true; uid: string; papel: PapelUsuario }
  | { ok: false; erro: string }

// Resolve sessão + cargo de uma vez, distinguindo "sem sessão" de "desativado" para a
// mensagem sair certa (dizer "faça login" a quem foi desligado manda a pessoa girar em
// falso na tela de login).
async function resolverCargo(
  supabase: DbClient,
): Promise<{ uid: string; papel: PapelUsuario } | { erro: string }> {
  const uid = await idOperador(supabase)
  if (!uid) return { erro: MSG_SESSAO_EXPIRADA }
  const papel = await papelAtual(supabase)
  if (!papel) return { erro: MSG_USUARIO_DESATIVADO }
  return { uid, papel }
}

// Exige um cargo MÍNIMO na hierarquia admin ⊃ operador ⊃ consulta.
export async function exigirPapel(
  supabase: DbClient,
  minimo: PapelUsuario,
): Promise<Autorizacao> {
  const r = await resolverCargo(supabase)
  if ('erro' in r) return { ok: false, erro: r.erro }
  if (!papelAtende(r.papel, minimo)) {
    return {
      ok: false,
      erro:
        r.papel === 'consulta'
          ? MSG_SOMENTE_LEITURA
          : `Esta ação exige o cargo ${PAPEL_ROTULO[minimo]} ou superior.`,
    }
  }
  return { ok: true, uid: r.uid, papel: r.papel }
}

// Exige ADMIN. Usada por tudo que vive em /admin/** (usuários, senhas, filiais, motivos,
// catálogo de itens, kits) e pelo import de startup.
export async function exigirAdmin(supabase: DbClient): Promise<Autorizacao> {
  const r = await resolverCargo(supabase)
  if ('erro' in r) return { ok: false, erro: r.erro }
  if (r.papel !== 'admin') return { ok: false, erro: MSG_SO_ADMIN }
  return { ok: true, uid: r.uid, papel: r.papel }
}

// Exige poder ESCREVER na filial informada: admin sempre; operador só na vinculada;
// consulta nunca. `filialNome` só melhora a mensagem — é opcional.
export async function exigirEscrita(
  supabase: DbClient,
  filialId: number | null | undefined,
  filialNome?: string | null,
): Promise<Autorizacao> {
  const r = await resolverCargo(supabase)
  if ('erro' in r) return { ok: false, erro: r.erro }
  if (r.papel === 'consulta') return { ok: false, erro: MSG_SOMENTE_LEITURA }
  if (filialId == null) {
    return { ok: false, erro: 'Filial não informada para esta operação.' }
  }
  if (!(await podeEscreverFilial(supabase, filialId))) {
    return { ok: false, erro: msgSemEscritaNaFilial(filialNome) }
  }
  return { ok: true, uid: r.uid, papel: r.papel }
}

// Versão de LOTE: exige escrita em TODAS as filiais tocadas pela operação. Existe porque
// vários fluxos são multi-filial por natureza — lote de movimentação (o conjunto sai do
// `filial_id` corrente de cada ativo), termo de lote, resolução de pendências em lote.
// Recusar o lote inteiro (em vez de gravar a parte permitida) é deliberado: uma escrita
// parcial silenciosa é pior que uma recusa clara.
export async function exigirEscritaEm(
  supabase: DbClient,
  filiaisIds: readonly (number | null | undefined)[],
): Promise<Autorizacao> {
  const r = await resolverCargo(supabase)
  if ('erro' in r) return { ok: false, erro: r.erro }
  if (r.papel === 'consulta') return { ok: false, erro: MSG_SOMENTE_LEITURA }

  const ids = [...new Set(filiaisIds.filter((f): f is number => f != null))]
  if (ids.length === 0) {
    return { ok: false, erro: 'Filial não informada para esta operação.' }
  }
  // Admin passa direto sem N chamadas ao banco.
  if (r.papel === 'admin') return { ok: true, uid: r.uid, papel: r.papel }

  for (const id of ids) {
    if (!(await podeEscreverFilial(supabase, id))) {
      return {
        ok: false,
        erro:
          ids.length > 1
            ? 'O lote inclui filial em que você não tem permissão de escrita. Fale com um administrador.'
            : msgSemEscritaNaFilial(null),
      }
    }
  }
  return { ok: true, uid: r.uid, papel: r.papel }
}

// `getOperador()` devolve null em DOIS casos que, para a UI, são coisas diferentes:
//   (a) não há sessão Supabase nenhuma;
//   (b) há sessão VÁLIDA, mas o perfil está desativado (ou não pôde ser lido).
//
// Antes da F21 só (a) existia, e o shell podia tratar "sem operador" como "provavelmente é
// um visualizador por senha". Com a desativação, (b) passou a existir e a distinção importa:
// quem foi desligado tem cookie de sessão vivo e, sem esta função, cairia na porta PÚBLICA
// da senha de relatório sem nunca descobrir que o acesso foi cortado (achado da revisão
// adversarial da F21, confirmado por três lentes independentes).
//
// Só é chamada no caminho raro em que `getOperador()` já devolveu null — não custa nada no
// fluxo normal.
export async function temSessaoSupabase(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return !!user
}

export type ViewerSession = { senhaId: string; rotulo: string }

// Sessão de VISUALIZAÇÃO por senha. Faz a verificação REAL a cada request:
// assinatura do cookie (lerSessaoView) + senha ainda ATIVA no banco (client
// administrativo). Retorna null se o cookie for inválido/expirado OU a senha
// tiver sido revogada — é o que mata o acesso no request seguinte (OS-F3 3.9.3).
//
// F21 NÃO toca neste caminho: o visualizador por senha continua idêntico (fora de escopo
// por determinação da ordem). Ele não tem sessão Supabase, logo não tem cargo — o conceito
// de papel só existe para quem entra por login.
export async function getViewerSession(): Promise<ViewerSession | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(VIEW_COOKIE_NAME)?.value
  const sess = lerSessaoView(raw)
  if (!sess) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('senhas_acesso')
    .select('id, rotulo, ativa')
    .eq('id', sess.senhaId)
    .maybeSingle()

  if (!data || !data.ativa) return null
  return { senhaId: data.id, rotulo: data.rotulo }
}

// Acesso resolvido às rotas de relatório: operador (client com RLS) ou
// visualizador por senha (client administrativo — servido pelo servidor). As
// queries de relatório recebem o `client` e o `modo` decide o chrome/atualização.
export type AcessoRelatorio =
  | { modo: 'operador'; client: DbClient; operador: Operador }
  | { modo: 'viewer'; client: DbClient; rotulo: string }

export async function resolverAcessoRelatorio(): Promise<AcessoRelatorio | null> {
  const operador = await getOperador()
  if (operador) {
    return { modo: 'operador', client: await createClient(), operador }
  }
  const viewer = await getViewerSession()
  if (viewer) {
    return { modo: 'viewer', client: createAdminClient(), rotulo: viewer.rotulo }
  }
  return null
}
