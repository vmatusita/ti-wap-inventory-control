import { z } from 'zod'
import { Constants } from '@/lib/types/database'
import { DOMINIOS_TEXTO, emailDeOperador } from '@/lib/auth/dominios-email'
import { eAdmin, eDev, validarVinculosDoPapel } from '@/lib/auth/papeis'
import type { PapelUsuario } from '@/lib/auth/papeis'

// Schemas de administração (convites, filiais, motivos) — antes definidos inline
// em actions/admin.ts. Espelham as regras de negócio da spec §3/§6.

// ---- Convite de operador (domínios da spec §3 — validação client E server) ----
export const conviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('E-mail inválido')
    .refine(
      (e) => emailDeOperador(e),
      `O e-mail precisa terminar com ${DOMINIOS_TEXTO}`,
    ),
})

// ---- F21: cargo + filiais de escrita (convite e edição de usuário) ----
// A REGRA (mínimo 1 filial para Operador; nenhuma para Admin/Consulta) não é
// redigitada aqui: vem de `validarVinculosDoPapel` em auth/papeis.ts, a fonte única que
// o formulário do cliente também usa. Assim o client e o server nunca divergem de texto
// nem de critério — o que divergiu no passado sempre foi a regra duplicada, não a chamada.
export const papelSchema = z.enum(Constants.public.Enums.papel_usuario)

// Ordena e desduplica: o payload vem de checkboxes, e um id repetido estouraria a PK de
// `operador_filiais` no insert. O teto existe só para não aceitar array absurdo de um
// cliente forjado (são 5 filiais na vida real).
const filiaisEscritaSchema = z
  .array(z.number().int().positive())
  .max(100, 'Filiais demais.')
  .transform((ids) => [...new Set(ids)].sort((a, b) => a - b))

function checarVinculos(
  v: { papel: PapelUsuario; filiais: number[] },
  ctx: z.RefinementCtx,
): void {
  const erro = validarVinculosDoPapel(v.papel, v.filiais)
  if (erro) ctx.addIssue({ code: 'custom', path: ['filiais'], message: erro })
}

export const convidarUsuarioSchema = conviteSchema
  .extend({ papel: papelSchema, filiais: filiaisEscritaSchema })
  .superRefine(checarVinculos)

export const editarUsuarioSchema = z
  .object({
    usuarioId: z.string().uuid('Usuário inválido'),
    papel: papelSchema,
    filiais: filiaisEscritaSchema,
  })
  .superRefine(checarVinculos)

export const definirStatusUsuarioSchema = z.object({
  usuarioId: z.string().uuid('Usuário inválido'),
  ativo: z.boolean(),
})

// F29/ADM-02a — "aguardando primeiro acesso": convidado que nunca terminou de entrar.
//
// Duas evidências, e as duas importam. `ultimoAcesso === null` é a direta (o Auth
// nunca registrou um login). O nome vazio é a indireta: o perfil nasce sem nome e só
// ganha um quando a pessoa define a senha — cobre a conta cujo `last_sign_in_at` não
// pôde ser lido nesta requisição, e é o que a tela mostrava sozinho antes ("Sem nome").
//
// `authIndisponivel` evita a acusação falsa: com o Auth fora do ar, `ultimoAcesso` vem
// null para TODO MUNDO, e sem esta guarda a tela diria que a equipe inteira nunca
// entrou. Nesse caso só o nome vazio ainda vale como indício.
export function aguardandoPrimeiroAcesso(
  u: { ultimoAcesso: string | null; nome: string | null },
  authIndisponivel = false,
): boolean {
  const semNome = !u.nome || u.nome.trim() === ''
  if (authIndisponivel) return semNome
  return u.ultimoAcesso === null || semNome
}

// ---- F22: gestão avançada (privativa do cargo dev) ----
// O e-mail novo passa pela MESMA lista de `dominios-email.ts` que o convite. O trigger
// `handle_new_user` (0041) só cobre INSERT em auth.users — uma TROCA de e-mail não passa
// por ele, então aqui é a única barreira de domínio desse caminho.
export const alterarEmailUsuarioSchema = z.object({
  usuarioId: z.string().uuid('Usuário inválido'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('E-mail inválido')
    .refine((e) => emailDeOperador(e), `O e-mail precisa terminar com ${DOMINIOS_TEXTO}`),
})

export const apagarUsuarioSchema = z.object({
  usuarioId: z.string().uuid('Usuário inválido'),
  // Confirmação digitada. Apagar é a única ação irreversível da tela de usuários, e o
  // diálogo pede o e-mail de volta — o mesmo idioma do "Substituir tudo" do import.
  confirmacao: z.string().trim(),
})

export const encerrarSessoesSchema = z.object({
  usuarioId: z.string().uuid('Usuário inválido'),
})

// ---- F21: AUTOPROTEÇÃO da gestão de usuários ----
// As duas travas que o critério de aceitação 4 da ordem F21 exige, escritas como funções
// PURAS para terem teste próprio: dentro da action elas dependeriam de sessão e de banco, e
// ninguém escreveria os nove casos de borda que `admin.test.ts` cobre.
//
// Por que elas existem: sem a primeira, um admin distraído se rebaixa e perde o acesso à
// própria tela que usaria para se promover de volta; sem a segunda, rebaixar/desativar o
// ÚLTIMO admin ativo tranca /admin/** para todo mundo e a única saída passa a ser SQL no
// painel do Supabase. Nenhuma das duas é conveniência de UI: são as que evitam um estado
// do qual o app não sai por si.
//
// ⚠ Ambas são checagens de TEMPO DE VERIFICAÇÃO: valem sobre a contagem lida do banco
// imediatamente antes da gravação. Numa corrida (dois admins se rebaixando no mesmo
// instante) o banco não impede — é aceito e registrado; a janela é de milissegundos numa
// equipe de dezenas de pessoas, e o remédio (promover alguém por SQL) existe.
//
// ⚠⚠ QUEM DE FATO PROTEGE A INVARIANTE "sempre sobra 1 admin ativo" É A PRIMEIRA TRAVA, NÃO A
// SEGUNDA. Pelos chamadores de hoje (`editarUsuario`/`definirStatusUsuario`, que passam por
// `exigirAdmin` antes de ler `idsDeAdminsAtivos()`), o AUTOR está sempre na lista de admins
// ativos — e o ramo do último admin só é avaliado quando o alvo NÃO é o autor. Logo
// `existeOutroAdminAtivo` encontra sempre pelo menos o autor, e MSG_ULTIMO_ADMIN é
// **inalcançável por esse caminho**: rebaixar outra pessoa nunca pode zerar os admins, porque
// quem rebaixa é um deles.
//
// A trava fica de propósito, como defesa em profundidade para um chamador FUTURO que não
// esteja atrás de `exigirAdmin` (script de manutenção, action nova, tarefa agendada) — a
// leitura é uma linha indexada e barata. O que NÃO se deve fazer é ler o teste dela como prova
// de que a invariante está protegida hoje: ele monta um estado (`autorId` fora de
// `adminsAtivosIds`) que a action não consegue produzir. Ver o teste
// "o caso REAL da action" em admin.test.ts.

export type AlvoUsuario = {
  id: string
  papel: PapelUsuario
  ativo: boolean
}

export const MSG_AUTO_REBAIXAMENTO =
  'Você não pode alterar o seu próprio cargo. Peça a outro administrador.'
export const MSG_AUTO_DESATIVACAO =
  'Você não pode desativar o seu próprio acesso. Peça a outro administrador.'
export const MSG_ULTIMO_ADMIN =
  'Este é o último administrador ativo do sistema. Promova outra pessoa a Administrador antes de rebaixar ou desativar este acesso.'

// F22 — a negativa da proteção do 4º cargo, do lado do app. A trava de verdade é a guarda
// `exigir_gestao_de()` das RPCs (0074) mais a rede `profiles_guarda_dev` (0073); esta função
// existe para que a pessoa leia uma frase em pt-BR em vez de um SQLSTATE.
export const MSG_SO_DEV_GERE_DEV =
  'Só um Desenvolvedor pode conceder o cargo Desenvolvedor ou alterar quem já o tem.'
export const MSG_SO_DEV_APAGA =
  'Só um Desenvolvedor pode apagar uma conta de usuário.'

// O par (cargo, status) que conta como "administrador ativo" — o mesmo predicado que
// `existe_outro_admin_ativo()` usa no banco (0074).
//
// ⚠ F22: era `papel === 'admin' && ativo`. Agora é NÍVEL administrador, porque o dev alcança
// tudo que o admin alcança — com a igualdade, um sistema cujo único acesso administrativo
// fosse um dev acharia que tem ZERO administradores e a trava do último admin barraria
// operações legítimas; e, no sentido inverso, promover alguém a dev não satisfaria a
// invariante. Decisão registrada em docs/DECISOES.md.
function eAdminAtivo(papel: PapelUsuario, ativo: boolean): boolean {
  return eAdmin(papel) && ativo
}

// Quem MEXE num dev (ou concede o cargo) precisa ser dev. Espelha a guarda
// `exigir_gestao_de()` (0074): alvo dev OU cargo pedido dev → exige e_dev().
function tocaDev(alvoPapel: PapelUsuario, novoPapel: PapelUsuario | null): boolean {
  return eDev(alvoPapel) || (novoPapel !== null && eDev(novoPapel))
}

// Sobra algum OUTRO admin ativo além do alvo? A lista vem do banco (ids de perfis com
// `papel = 'admin' and ativo`), lida na hora — nunca de cache nem do cliente.
function existeOutroAdminAtivo(alvoId: string, adminsAtivosIds: readonly string[]): boolean {
  return adminsAtivosIds.some((id) => id !== alvoId)
}

/** Troca de cargo: devolve a mensagem que RECUSA, ou null se pode gravar. */
export function validarTrocaDePapel(args: {
  autorId: string
  /** F22 — cargo de QUEM está pedindo. Sem ele não há como recusar um admin que mexe em dev. */
  autorPapel: PapelUsuario
  alvo: AlvoUsuario
  novoPapel: PapelUsuario
  adminsAtivosIds: readonly string[]
}): string | null {
  const { autorId, autorPapel, alvo, novoPapel, adminsAtivosIds } = args
  // F22 — a proteção do cargo dev vem ANTES de tudo: nem "cargo igual" escapa dela, porque
  // um admin não deve sequer receber a confirmação silenciosa de uma gravação sobre um dev.
  if (tocaDev(alvo.papel, novoPapel) && !eDev(autorPapel)) return MSG_SO_DEV_GERE_DEV
  // Cargo igual não é mudança: quem edita só as FILIAIS não deve tropeçar na trava de cargo.
  // (Para o alvo = o próprio autor isto vale apenas no papel: a lista de usuários desabilita o
  // botão "Editar" da própria linha, então o único efeito alcançável seria limpar os vínculos
  // mortos do backfill — e nem esse a UI oferece hoje.)
  if (novoPapel === alvo.papel) return null
  if (alvo.id === autorId) return MSG_AUTO_REBAIXAMENTO
  if (
    eAdminAtivo(alvo.papel, alvo.ativo) &&
    !eAdminAtivo(novoPapel, alvo.ativo) &&
    !existeOutroAdminAtivo(alvo.id, adminsAtivosIds)
  ) {
    return MSG_ULTIMO_ADMIN
  }
  return null
}

/** Desativar/reativar: devolve a mensagem que RECUSA, ou null se pode gravar. */
export function validarStatusDeUsuario(args: {
  autorId: string
  /** F22 — cargo de QUEM está pedindo (ver validarTrocaDePapel). */
  autorPapel: PapelUsuario
  alvo: AlvoUsuario
  novoAtivo: boolean
  adminsAtivosIds: readonly string[]
}): string | null {
  const { autorId, autorPapel, alvo, novoAtivo, adminsAtivosIds } = args
  // F22 — desativar OU reativar um dev é privativo do dev. Vem antes do "nada mudou",
  // pelo mesmo motivo da troca de cargo.
  if (tocaDev(alvo.papel, null) && !eDev(autorPapel)) return MSG_SO_DEV_GERE_DEV
  if (novoAtivo === alvo.ativo) return null
  // Reativar nunca é perigoso — só o caminho que DESLIGA passa pelas travas.
  if (novoAtivo) return null
  if (alvo.id === autorId) return MSG_AUTO_DESATIVACAO
  if (
    eAdminAtivo(alvo.papel, alvo.ativo) &&
    !existeOutroAdminAtivo(alvo.id, adminsAtivosIds)
  ) {
    return MSG_ULTIMO_ADMIN
  }
  return null
}

/**
 * F22 — APAGAR uma conta: devolve a mensagem que RECUSA, ou null se pode.
 *
 * Regras, na ordem em que a pessoa as encontraria: só dev apaga; ninguém apaga a si mesmo;
 * não se apaga a última conta de nível administrador; e a confirmação digitada tem de bater
 * com o e-mail do alvo. Espelha `apagar_usuario()` (0074) — a diferença é que lá a
 * confirmação não existe (ela é ergonomia de UI, não autorização).
 */
export function validarExclusaoDeUsuario(args: {
  autorId: string
  autorPapel: PapelUsuario
  alvo: AlvoUsuario
  /** E-mail do alvo, para conferir contra o que a pessoa digitou. */
  alvoEmail: string | null
  confirmacao: string
  adminsAtivosIds: readonly string[]
}): string | null {
  const { autorId, autorPapel, alvo, alvoEmail, confirmacao, adminsAtivosIds } = args
  if (!eDev(autorPapel)) return MSG_SO_DEV_APAGA
  if (alvo.id === autorId) {
    return 'Você não pode apagar o seu próprio acesso. Peça a outro Desenvolvedor.'
  }
  if (eAdminAtivo(alvo.papel, alvo.ativo) && !existeOutroAdminAtivo(alvo.id, adminsAtivosIds)) {
    return MSG_ULTIMO_ADMIN
  }
  // Sem e-mail conhecido (o Auth não respondeu) não dá para confirmar coisa nenhuma —
  // recusar é melhor que apagar às cegas a conta errada.
  if (!alvoEmail) {
    return 'Não foi possível confirmar o e-mail desta conta agora. Tente de novo em instantes.'
  }
  if (confirmacao.trim().toLowerCase() !== alvoEmail.trim().toLowerCase()) {
    return `Para apagar, digite exatamente o e-mail da conta: ${alvoEmail}`
  }
  return null
}

// ---- Filiais ----
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// F25 — SLUGS RESERVADOS. Duas palavras não podem virar slug de filial porque já
// significam outra coisa nas URLs do sistema:
//   'todas' — a sentinela de "sem recorte" do filtro de filial (url-params.ts).
//             Em /pendencias o filtro é POR SLUG, então uma filial 'todas'
//             tornaria `?filial=todas` ambíguo.
//   'geral' — o Consolidado de /relatorios/[filial] e o valor especial do filtro
//             de /relatorios/gerados (`filial_id is null`). Já era reservado de
//             fato desde a F3; nunca esteve escrito.
// Nenhuma filial real usa essas palavras (conferido nos dois bancos em 04/08/2026).
const SLUGS_RESERVADOS = ['todas', 'geral'] as const

export const filialSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_RE, 'Slug: só letras minúsculas, números e hífens')
    .refine(
      (s) => !(SLUGS_RESERVADOS as readonly string[]).includes(s),
      'Este slug é reservado pelo sistema. Escolha outro.',
    ),
  // F25 — a cidade que assina o TERMO (migration 0102). Opcional: filial nova
  // nasce sem, e quem avisa é a geração do termo. Não confundir com a cláusula
  // de foro, que é fixa.
  cidade: z.string().trim().max(120).default(''),
})

export const atualizarFilialSchema = filialSchema.extend({
  id: z.number().int().positive(),
  ativo: z.boolean(),
  // ⚠ SEM o `.default('')` de `filialSchema`: aqui `undefined` precisa continuar
  // `undefined`. No CADASTRO o default é certo (a filial nasce sem cidade); na
  // EDIÇÃO ele transformava "não mandei o campo" em "apague a cidade" — a action
  // grava o objeto inteiro, então Linhares perderia "Linhares" em silêncio. Com
  // `.optional()`, quem não manda o campo não o toca.
  cidade: z.string().trim().max(120).optional(),
})

// ---- Apelidos de unidade (F56 · Frente E · Decisão 13) ----
// O teto de 80 é o MESMO de `filialSchema.nome` — os 13 apelidos históricos do
// seed da 0139 vão até 18 caracteres ("matriz sao marcos", "filial - linhares"),
// e manter o mesmo número evita um caso especial sem necessidade (é o mesmo teto
// que `motivoSchema.rotulo` e `senhaSchema.rotulo` já usam para texto curto de
// vocabulário).
export const MAX_TAMANHO_APELIDO = 80

export const apelidoFilialSchema = z.object({
  filialId: z.number().int().positive(),
  apelido: z.string().trim().min(2, 'Informe o apelido').max(MAX_TAMANHO_APELIDO),
})

export const removerApelidoUnidadeSchema = z.object({
  apelidoId: z.number().int().positive(),
})

// ---- Motivos ----
const tiposMov = Constants.public.Enums.tipo_movimentacao
export const motivoSchema = z.object({
  codigo: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]+$/, 'Código: só letras minúsculas, números e _')
    .max(40),
  rotulo: z.string().trim().min(2, 'Informe o rótulo').max(80),
  aplica_a: z.array(z.enum(tiposMov)).min(1, 'Escolha ao menos um tipo'),
})

export const atualizarMotivoSchema = z.object({
  codigo: z.string().trim().min(1),
  rotulo: z.string().trim().min(2, 'Informe o rótulo').max(80),
  aplica_a: z.array(z.enum(tiposMov)).min(1, 'Escolha ao menos um tipo'),
  ativo: z.boolean(),
})
