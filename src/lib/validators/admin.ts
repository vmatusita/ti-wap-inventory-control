import { z } from 'zod'
import { Constants } from '@/lib/types/database'
import { DOMINIOS_TEXTO, emailDeOperador } from '@/lib/auth/dominios-email'
import { validarVinculosDoPapel } from '@/lib/auth/papeis'
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

// O par (cargo, status) que conta como "administrador ativo" — o mesmo predicado que
// `papel_atual()` usa no banco para devolver 'admin'.
function eAdminAtivo(papel: PapelUsuario, ativo: boolean): boolean {
  return papel === 'admin' && ativo
}

// Sobra algum OUTRO admin ativo além do alvo? A lista vem do banco (ids de perfis com
// `papel = 'admin' and ativo`), lida na hora — nunca de cache nem do cliente.
function existeOutroAdminAtivo(alvoId: string, adminsAtivosIds: readonly string[]): boolean {
  return adminsAtivosIds.some((id) => id !== alvoId)
}

/** Troca de cargo: devolve a mensagem que RECUSA, ou null se pode gravar. */
export function validarTrocaDePapel(args: {
  autorId: string
  alvo: AlvoUsuario
  novoPapel: PapelUsuario
  adminsAtivosIds: readonly string[]
}): string | null {
  const { autorId, alvo, novoPapel, adminsAtivosIds } = args
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
  alvo: AlvoUsuario
  novoAtivo: boolean
  adminsAtivosIds: readonly string[]
}): string | null {
  const { autorId, alvo, novoAtivo, adminsAtivosIds } = args
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

// ---- Filiais ----
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const filialSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_RE, 'Slug: só letras minúsculas, números e hífens'),
})

export const atualizarFilialSchema = filialSchema.extend({
  id: z.number().int().positive(),
  ativo: z.boolean(),
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
