import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { chamarRpc } from '@/lib/supabase/rpc'
import { registrarFalha } from '@/lib/observabilidade'
import { lerSessaoView, VIEW_COOKIE_NAME } from '@/lib/auth/senha-sessao'
import { PAPEL_ROTULO, eAdmin, escopoDeEscrita, papelAtende } from '@/lib/auth/papeis'
import type { PapelUsuario } from '@/lib/auth/papeis'
import type { Database } from '@/lib/types/database'
import { linhaOuFalha, valorOuFalha } from '@/lib/supabase/linhas'
import { LEITURA_PAPEL_ATUAL, LEITURA_PERFIL_OPERADOR } from '@/lib/queries/formas/auth'

export type DbClient = SupabaseClient<Database>

// F21: o operador deixou de ser só "quem está logado". `papel` é o cargo vigente e
// `escopoEscrita` são as filiais em que ele pode ESCREVER (admin → todas as ativas).
// Leitura continua ampla para todos os cargos — ADR-001 segue valendo nesse ponto.
export type Operador = {
  id: string
  nome: string
  papel: PapelUsuario
  // `readonly` porque, com `getOperador` memoizada por request, este array é COMPARTILHADO
  // por referência entre o layout do grupo, o admin/layout e a página do mesmo render: um
  // `.sort()`/`.push()` em qualquer um deles reescreveria em silêncio a lista de permissão de
  // ESCRITA que os outros leem. Alinha com `Permissoes.escopoEscrita`
  // (components/layout/permissoes.ts), que já era readonly.
  escopoEscrita: readonly number[]
  /**
   * F29/UXG-12 — e-mail da conta logada (de `auth.users`, já lido aqui). Numa máquina
   * compartilhada da TI, "com qual conta eu estou?" é a primeira pergunta, e o app não
   * respondia em tela nenhuma. `null` quando a conta não tem e-mail (não acontece hoje:
   * o login é por e-mail corporativo).
   */
  email: string | null
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
// F22 — a negativa do 4º cargo. Texto SEPARADO de MSG_SO_ADMIN de propósito: quem esbarra
// aqui é um administrador (que já se sabe administrador), e "restrita a administradores"
// o faria abrir chamado dizendo que o cargo dele parou de funcionar.
export const MSG_SO_DEV =
  'Esta ação é restrita ao cargo Desenvolvedor.'
// "O banco não respondeu" NÃO é "você foi desligado". Antes desta mensagem, qualquer erro
// transitório na leitura do cargo ou do vínculo (blip de rede, `statement_timeout`) caía em
// MSG_USUARIO_DESATIVADO ou em "sem permissão nesta filial" — a fase investiu em distinguir
// "sessão expirada" de "desativado" e então dizia a um admin ativo que o acesso dele tinha sido
// cortado. Além de mandar a pessoa abrir chamado errado, isso MASCARA indisponibilidade: uma
// queda do banco apareceria como revogação em massa.
export const MSG_FALHA_AO_CONFERIR =
  'Não foi possível conferir seu acesso agora. Tente de novo em instantes.'

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
// ⚠ NÃO memoizar esta nem `podeEscreverFilial` com `cache()`. Quem é memoizado por request é a
// resolução de CARGO (`cargoDoRequest`, abaixo), e só ela: memoizar o VÍNCULO mataria a
// revogação no request seguinte, que é a razão de ser da doutrina (ADR-002 §4). Memoizar
// `papelAtual` isolada seria pior: ela devolve null em qualquer erro transitório, e o cache
// fixaria esse null pelo request inteiro.
export async function papelAtual(supabase: DbClient): Promise<PapelUsuario | null> {
  const r = await lerPapel(supabase)
  return r.ok ? r.papel : null
}

// A leitura CRUA, que distingue "não tem papel" de "não deu para saber". `papelAtual` acima
// mantém a assinatura antiga (null nos dois casos) para os chamadores que só querem o cargo;
// quem monta MENSAGEM usa esta, porque a diferença muda o texto (ver MSG_FALHA_AO_CONFERIR).
type LeituraPapel = { ok: true; papel: PapelUsuario | null } | { ok: false }

async function lerPapel(supabase: DbClient): Promise<LeituraPapel> {
  const { data, error } = await chamarRpc(supabase, 'papel_atual')
  if (error) {
    // Logado ALTO: é assim que se descobre que o banco caiu, em vez de ler o sintoma como
    // "todo mundo foi desativado".
    registrarFalha({ escopo: 'acesso.papel-atual', erro: error })
    return { ok: false }
  }
  // A forma errada é "não deu para saber" — o MESMO caminho do erro de banco acima (o
  // registrarFalha já aconteceu dentro da porta). `null` continua sendo "sem cargo".
  const lido = valorOuFalha(data, LEITURA_PAPEL_ATUAL.forma, LEITURA_PAPEL_ATUAL.rotulo)
  if (!lido.ok) return { ok: false }
  return { ok: true, papel: lido.valor }
}

// Espelho de `pode_escrever_filial(fid)` do banco (migration 0062). Mesma razão de cima:
// uma fonte só para o predicado do vínculo.
export async function podeEscreverFilial(
  supabase: DbClient,
  filialId: number,
): Promise<boolean> {
  const r = await lerVinculo(supabase, filialId)
  return r.ok ? r.pode : false
}

// Mesma divisão de `lerPapel`: falha de leitura ≠ ausência de vínculo. As guardas usam esta
// para não dizer "você não tem permissão nesta filial" quando a verdade é "o banco não
// respondeu" — a recusa continua acontecendo (falha fechada), só o TEXTO muda.
type LeituraVinculo = { ok: true; pode: boolean } | { ok: false }

async function lerVinculo(
  supabase: DbClient,
  filialId: number,
): Promise<LeituraVinculo> {
  const { data, error } = await chamarRpc(supabase, 'pode_escrever_filial', { fid: filialId })
  if (error) {
    registrarFalha({ escopo: 'acesso.pode-escrever-filial', erro: error, ctx: { filialId } })
    return { ok: false }
  }
  return { ok: true, pode: data === true }
}

// Operador logado (Supabase Auth) COM cargo e filiais de escrita. null quando não há
// sessão OU o perfil está desativado — nesse segundo caso o efeito é o mesmo de estar
// deslogado, e é intencional: o layout redireciona para o login.
//
// MEMOIZADA POR REQUISIÇÃO (`cache()` do React). A F21 acrescentou esta chamada a ~8 páginas
// que JÁ rodam sob `(app)/layout.tsx`, que também a chama; em /admin/usuarios são TRÊS no mesmo
// render (layout do grupo + admin/layout + a page) para responder à MESMA pergunta, cada uma
// custando 1 `auth.getUser()` + 3 selects. De quebra fecha uma janela de INCONSISTÊNCIA: as
// três leituras podiam discordar entre si, e agora o render decide com UM estado só.
//
// ⚠ O cache é POR REQUISIÇÃO, NÃO GLOBAL — e a diferença aqui é entre uma otimização e o pior
// bug possível, porque o que esta função devolve é a IDENTIDADE e o CARGO de quem pede. A doc
// do React é explícita: "React will invalidate the cache for all memoized functions for each
// server request". Nada é compartilhado entre requisições nem entre usuários.
// ⚠ NUNCA trocar por `"use cache"` / `unstable_cache` / `cacheComponents`: essas são cache
// PERSISTENTE entre requisições e vazariam o cargo de um usuário para outro.
// ⚠ `cache()` em escopo de MÓDULO porque tem de ser: chamá-lo dentro de componente cria um
// cache novo por render e não memoiza nada. Daí `export const` em vez de `export async
// function` — assinatura, retorno e corpo são os mesmos, e nenhum ponto de chamada muda.
export const getOperador = cache(async (): Promise<Operador | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: perfilBruto, error: erroPerfil } = await supabase
    .from('profiles')
    .select(LEITURA_PERFIL_OPERADOR.select)
    .eq('id', user.id)
    .maybeSingle()

  // O `error` era DESCARTADO aqui, e falha de leitura virava indistinguível de "desativado":
  // o layout mandava a pessoa para `/login?erro=acesso-desativado` e uma queda do banco
  // apareceria como revogação em massa, sem rastro. Continua fechando (é o lado seguro), mas
  // agora deixa rastro. O texto que o usuário vê neste caminho não dá para consertar sem mudar
  // a assinatura desta função (~17 chamadores): quem monta mensagem são as GUARDAS, que já
  // distinguem por MSG_FALHA_AO_CONFERIR.
  if (erroPerfil) {
    registrarFalha({ escopo: 'acesso.perfil-operador', erro: erroPerfil })
    return null
  }

  // A forma errada fecha pelo MESMO caminho do erro de banco acima (registrarFalha já
  // aconteceu dentro da porta) — nenhum `catch` novo, e o mesmo "return null" de sempre.
  const lidoPerfil = linhaOuFalha(perfilBruto, LEITURA_PERFIL_OPERADOR.forma, LEITURA_PERFIL_OPERADOR.rotulo)
  if (!lidoPerfil.ok) return null
  const perfil = lidoPerfil.linha

  // Sem perfil (não deveria acontecer — o trigger cria), DESATIVADO ou APAGADO: fecha.
  // F22: `apagar_usuario` (0074) grava `excluido_em` E `ativo = false`, então o segundo
  // teste já bastaria hoje. O terceiro é cinto e suspensório para o estado híbrido —
  // arquivado mas ainda `ativo` — que um UPDATE manual no painel produziria: `papel_atual()`
  // no banco já o fecha (0073), e aqui a leitura é direta em `profiles`, sem passar por ela.
  if (!perfil || !perfil.ativo || perfil.excluido_em) return null

  const papel = perfil.papel

  // Filiais de escrita: admin recebe todas as ATIVAS; operador, as vinculadas; consulta,
  // nenhuma. As duas leituras são baratas (tabelas de dezenas de linhas) e valem por
  // request, não por action.
  const [{ data: ativas }, { data: vinculos }] = await Promise.all([
    supabase.from('filiais').select('id').eq('ativo', true),
    supabase.from('operador_filiais').select('filial_id').eq('usuario_id', user.id),
  ])

  const escopoEscrita = escopoDeEscrita(
    papel,
    (vinculos ?? []).map((v) => v.filial_id),
    (ativas ?? []).map((f) => f.id),
  )

  return {
    id: user.id,
    nome: perfil.nome?.trim() || user.email || 'Operador',
    papel,
    escopoEscrita,
    email: user.email ?? null,
  }
})

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

type Cargo = { uid: string; papel: PapelUsuario } | { erro: string }

// Resolve sessão + cargo de uma vez, distinguindo "sem sessão" de "desativado" (e dos dois,
// "não deu para conferir") para a mensagem sair certa — dizer "faça login" a quem foi desligado
// manda a pessoa girar em falso na tela de login.
//
// MEMOIZADA POR REQUISIÇÃO, pelo mesmo mecanismo de `getOperador` e pelo mesmo motivo: 12
// actions de escrita chamam DUAS guardas (`exigirPapel` para o cargo, `exigirEscrita*` para o
// vínculo — ver o comentário longo em actions/ativos.ts), e cada uma refazia `getUser` +
// `papel_atual`. Agora a segunda reaproveita a resolução da primeira: 2 idas ao banco a menos
// por escrita, sem tocar assinatura nem call site nenhum.
//
// A CHAVE É O CLIENT, de propósito. `cache()` memoiza por identidade dos argumentos, e as duas
// guardas de uma action recebem a MESMA instância (todas fazem um `createClient()` só). Se
// alguém passar um client diferente, o memo simplesmente ERRA e a resolução acontece de novo, ao
// vivo: degrada para o comportamento de antes — o lado SEGURO, nunca o permissivo.
//
// ⚠ O QUE ISTO NÃO MEMOIZA, e não pode: o VÍNCULO. `lerVinculo` é chamado na hora, toda vez, e é
// ele que faz a revogação valer no request seguinte (ADR-002 §4). Além disso
// `pode_escrever_filial()` reconfere `papel_atual()` POR DENTRO (migration 0062), de modo que
// sessão, cargo e `ativo` continuam validados NO BANCO a cada verificação de vínculo — é isso
// que torna o reaproveitamento do cargo inócuo em substância, e não a memoização em si.
const cargoDoRequest = cache(async (supabase: DbClient): Promise<Cargo> => {
  const uid = await idOperador(supabase)
  if (!uid) return { erro: MSG_SESSAO_EXPIRADA }
  const r = await lerPapel(supabase)
  if (!r.ok) return { erro: MSG_FALHA_AO_CONFERIR }
  if (!r.papel) return { erro: MSG_USUARIO_DESATIVADO }
  return { uid, papel: r.papel }
})

async function resolverCargo(supabase: DbClient): Promise<Cargo> {
  return cargoDoRequest(supabase)
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

// Exige NÍVEL ADMINISTRADOR (admin ou dev). Usada por tudo que vive em /admin/** (usuários,
// senhas, filiais, motivos, catálogo de itens, kits) e pelo import de startup.
//
// ⚠ F22: era `r.papel !== 'admin'`. Com a igualdade, o dev seria recusado AQUI, antes de
// tocar o Postgres — e o banco, que desde a 0072 tem `e_admin() = papel_atual() in
// ('admin','dev')`, o aceitaria. As duas camadas divergiriam, e a mais amigável seria a que
// nega: a pessoa veria "restrita a administradores" numa tela que o RLS lhe abriria.
export async function exigirAdmin(supabase: DbClient): Promise<Autorizacao> {
  const r = await resolverCargo(supabase)
  if ('erro' in r) return { ok: false, erro: r.erro }
  if (!papelAtende(r.papel, 'admin')) return { ok: false, erro: MSG_SO_ADMIN }
  return { ok: true, uid: r.uid, papel: r.papel }
}

// Exige EXATAMENTE o cargo dev. Espelha `e_dev()` (0072) e a guarda interna das RPCs de
// gestão avançada (0074). Usada pelas actions de src/lib/actions/dev.ts (trocar e-mail,
// apagar conta, encerrar sessões) e pelo layout de /dev.
//
// Igualdade é a intenção aqui, e não hierarquia: não há cargo acima de dev, e escrever
// `papelAtende(r.papel, 'dev')` sugeriria que pode haver.
export async function exigirDev(supabase: DbClient): Promise<Autorizacao> {
  const r = await resolverCargo(supabase)
  if ('erro' in r) return { ok: false, erro: r.erro }
  if (r.papel !== 'dev') return { ok: false, erro: MSG_SO_DEV }
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
  const v = await lerVinculo(supabase, filialId)
  if (!v.ok) return { ok: false, erro: MSG_FALHA_AO_CONFERIR }
  if (!v.pode) return { ok: false, erro: msgSemEscritaNaFilial(filialNome) }
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
  // Admin escreve em qualquer filial e não precisa das N chamadas — mas esta guarda NÃO devolve
  // `ok` sem UMA leitura viva, e o motivo é concreto. Nos outros ramos o `lerVinculo` abaixo é
  // sempre executado, e ele reconfere `papel_atual()` por dentro (0062): sessão, cargo e `ativo`
  // seguem validados no banco a cada verificação. Neste atalho não havia nada — e com o cargo
  // memoizado por request ele passaria a responder `ok` sem tocar o banco NENHUMA vez.
  // Isso importa porque o RLS não grita neste caminho: o USING de uma policy de UPDATE é FILTRO
  // DE LINHA, não erro (`ativos` "operador atualiza", `pendencias_item` "operador resolve"), então
  // um admin desligado no meio do request receberia `ok` aqui, o UPDATE afetaria 0 linhas SEM
  // SQLSTATE e `resolverPendenciaItem` devolveria SUCESSO com a fila intacta — falso sucesso.
  // Uma chamada basta: para admin ATIVO `pode_escrever_filial` é true em qualquer filial (0062)
  // e `ids[0]` é garantidamente não-nulo, logo não há recusa falsa; para admin DESATIVADO é
  // false, que é exatamente a recusa desejada.
  // F22: `eAdmin` (NÍVEL) e não `=== 'admin'` — o dev também escreve em toda filial
  // (`pode_escrever_filial` da 0072), e sem isto ele cairia no laço abaixo e receberia
  // "o lote inclui filial em que você não tem permissão" no primeiro lote multi-filial.
  if (eAdmin(r.papel)) {
    const v = await lerVinculo(supabase, ids[0])
    if (!v.ok) return { ok: false, erro: MSG_FALHA_AO_CONFERIR }
    if (!v.pode) return { ok: false, erro: MSG_USUARIO_DESATIVADO }
    return { ok: true, uid: r.uid, papel: r.papel }
  }

  for (const id of ids) {
    const v = await lerVinculo(supabase, id)
    if (!v.ok) return { ok: false, erro: MSG_FALHA_AO_CONFERIR }
    if (!v.pode) {
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
