import { z } from 'zod'
import { STATUS_ORDEM, type StatusAtivo } from '@/lib/dominio'

// Validadores da ZONA DESTRUTIVA da /dev (F23) — apagar, resetar e forçar.
//
// ⚠ ESTA É A SEGUNDA LINHA, NUNCA A ÚNICA. Toda regra aqui está DUPLICADA dentro das RPCs
// (migrations 0082/0083/0084): cargo dev, justificativa mínima e confirmação digitada são
// conferidos no Postgres também. O que este arquivo entrega é a MENSAGEM em pt-BR antes da
// ida ao banco — e a possibilidade de testar as regras como funções puras, sem sessão.
// Se as duas camadas discordarem, é bug, e `supabase/tests/dev_destrutivo.sql` denuncia.
//
// A régua da confirmação digitada é a mesma de `validarExclusaoDeUsuario` (F22): comparação
// por igualdade, ignorando maiúsculas e espaço nas pontas. Ninguém "quase" confirma.

/** Mínimo da justificativa. Espelha `exigir_dev_para_destruir` (migration 0082). */
export const MIN_JUSTIFICATIVA = 10

/** A frase do reset de alcance GLOBAL. Espelha `rotulo_alcance_reset` (migration 0083). */
export const FRASE_RESET_GLOBAL = 'RESETAR TUDO'

export const justificativaSchema = z
  .string()
  .trim()
  .min(
    MIN_JUSTIFICATIVA,
    `Escreva uma justificativa de pelo menos ${MIN_JUSTIFICATIVA} caracteres — ela é o que vai sobrar depois que o registro deixar de existir.`,
  )
  .max(500, 'Justificativa longa demais (máximo de 500 caracteres).')

export const apagarAtivoSchema = z.object({
  ativoId: z.string().uuid('Ativo inválido'),
  confirmacao: z.string().trim(),
  justificativa: justificativaSchema,
})

export const apagarMovimentacaoSchema = z.object({
  movimentacaoId: z.string().uuid('Movimentação inválida'),
  confirmacao: z.string().trim(),
  justificativa: justificativaSchema,
})

export const apagarItemSchema = z.object({
  itemId: z.number().int().positive('Item inválido'),
  confirmacao: z.string().trim(),
  justificativa: justificativaSchema,
})

/** `null` = alcance GLOBAL (o sistema inteiro). */
const filialOuGlobal = z.number().int().positive().nullable()

export const resetarSchema = z.object({
  bloco: z.enum(['acervo', 'itens']),
  filialId: filialOuGlobal,
  confirmacao: z.string().trim(),
  justificativa: justificativaSchema,
})

export const forcarEstadoSchema = z.object({
  ativoId: z.string().uuid('Ativo inválido'),
  status: z.enum(STATUS_ORDEM as [StatusAtivo, ...StatusAtivo[]], {
    message: 'Estado inválido.',
  }),
  justificativa: justificativaSchema,
})

export const forcarSaldoSchema = z.object({
  itemId: z.number().int().positive('Item inválido'),
  filialId: z.number().int().positive('Filial inválida'),
  saldoAlvo: z
    .number()
    .int('O saldo alvo precisa ser um número inteiro.')
    .min(0, 'O saldo alvo não pode ser negativo.')
    .max(1_000_000, 'Saldo alvo fora de qualquer escala plausível.'),
  justificativa: justificativaSchema,
})

// ---------------------------------------------------------------------------
// Funções puras — as regras que a tela e a action compartilham
// ---------------------------------------------------------------------------

/**
 * A confirmação digitada bate com o esperado?
 *
 * Igualdade após `trim` + `toLowerCase`. Não é "parecido", não é prefixo: o objetivo do
 * campo é obrigar a pessoa a LER o identificador do que vai destruir e reproduzi-lo.
 */
export function confirmacaoConfere(digitado: string, esperado: string): boolean {
  const a = digitado.trim().toLocaleLowerCase('pt-BR')
  const b = esperado.trim().toLocaleLowerCase('pt-BR')
  return a !== '' && a === b
}

/**
 * O texto que o dev precisa digitar para confirmar um reset.
 *
 * ⚠ Espelha `public.rotulo_alcance_reset(smallint)` (migration 0083) — e existe pelo mesmo
 * motivo pelo qual aquela função existe: a tela e a RPC precisam calcular a confirmação da
 * MESMA forma. Uma confirmação que a tela monta de um jeito e o banco de outro é uma
 * confirmação que nunca confere, e o dev não teria como saber por quê.
 */
export function rotuloAlcanceReset(nomeFilial: string | null): string {
  return nomeFilial === null ? FRASE_RESET_GLOBAL : nomeFilial
}

/**
 * O identificador que confirma um ATIVO: patrimônio, ou service tag quando não há
 * patrimônio, ou o id quando não há nenhum dos dois.
 *
 * ⚠ Espelha o `coalesce` de `apagar_ativo`/`apagar_movimentacao` (migration 0082). A ordem
 * segue a regra da casa: o par patrimônio + service tag é a chave (spec §5), e ativo sem
 * patrimônio é caso REAL — 5,6% do acervo tem patrimônio fora do canônico e o import aceita
 * linha sem patrimônio, gerando pendência.
 */
export function rotuloDoAtivo(a: {
  id: string
  patrimonio: string | null
  service_tag: string | null
}): string {
  const pat = a.patrimonio?.trim()
  if (pat) return pat
  const tag = a.service_tag?.trim()
  if (tag) return tag
  return a.id
}

/**
 * Recusa em pt-BR para uma operação destrutiva, ou `null` quando pode seguir.
 *
 * Concentra o que é comum às sete ferramentas, para a action não redigitar (redigitar é como
 * as camadas divergem — a lição da 0074).
 */
export function validarOperacaoDestrutiva(args: {
  confirmacao: string
  esperado: string
  justificativa: string
  /** Como chamar o alvo na mensagem: "este ativo", "este item", "este reset". */
  alvo: string
}): string | null {
  const { confirmacao, esperado, justificativa, alvo } = args

  if (justificativa.trim().length < MIN_JUSTIFICATIVA) {
    return `Escreva uma justificativa de pelo menos ${MIN_JUSTIFICATIVA} caracteres — ela é o que vai explicar ${alvo} depois que o registro deixar de existir.`
  }
  if (!confirmacaoConfere(confirmacao, esperado)) {
    return `A confirmação não confere. Para ${alvo === 'este reset' ? 'executar' : 'apagar'} ${alvo}, digite exatamente: ${esperado}`
  }
  return null
}
