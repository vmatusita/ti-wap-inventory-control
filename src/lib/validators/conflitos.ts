import { z } from 'zod'

// Validadores da MESA DE CONFLITOS entre filiais (F24) — a exclusão restrita ao conflito.
//
// ⚠ ESTA É A SEGUNDA LINHA, NUNCA A ÚNICA. Toda regra aqui está DUPLICADA dentro da RPC
// `apagar_ativos_conflito_filiais` (migration 0093): cargo de nível administrador,
// justificativa mínima, confirmação digitada, teto do lote e — o que mais importa — a
// revalidação de que cada ativo está MESMO num grupo de conflito. O que este arquivo
// entrega é a MENSAGEM em pt-BR antes da ida ao banco, e a possibilidade de testar as
// regras como funções puras, sem sessão. Se as duas camadas discordarem, é bug, e
// `supabase/tests/conflito_filiais.sql` denuncia.
//
// O desenho é o mesmo de `validators/dev-destrutivo.ts` (F23), de propósito: quem já leu
// aquele arquivo lê este sem surpresa. O que muda é o CARGO (lá dev, aqui nível
// administrador) e o alvo (lá qualquer ativo, aqui só ativo em conflito).

/** Mínimo da justificativa. Espelha a guarda dentro da RPC (migration 0093). */
export const MIN_JUSTIFICATIVA_CONFLITO = 10

/**
 * Acima de quantos ativos o backup deixa de caber no evento e passa a exigir arquivo.
 *
 * ⚠ Espelha `c_cap_inline` da migration 0093 — travado por teste. O número saiu de MEDIÇÃO
 * em produção (30/07/2026): o jsonb de um ativo com todo o rastro tem média de 2.294 bytes,
 * p95 de 2.408 e máximo de 5.864 sobre os 1.232 ativos reais. 25 × o pior caso ≈ 147 KB,
 * confortável para um campo `detalhe`; e o caso real que motivou a fase (6 ativos, Serra ×
 * Linhares/Matriz) cabe com folga.
 */
export const CAP_BACKUP_INLINE = 25

/** Teto de sanidade do lote. Espelha `c_max_lote` da migration 0093. */
export const MAX_ATIVOS_POR_OPERACAO = 200

/** O prefixo do backup em arquivo. Espelha `prefixo_backup_conflito()` (0093). */
export const PREFIXO_BACKUP_CONFLITO = 'conflito/'

export const justificativaConflitoSchema = z
  .string()
  .trim()
  .min(
    MIN_JUSTIFICATIVA_CONFLITO,
    `Escreva uma justificativa de pelo menos ${MIN_JUSTIFICATIVA_CONFLITO} caracteres — ela é o que vai sobrar depois que o cadastro deixar de existir.`,
  )
  .max(500, 'Justificativa longa demais (máximo de 500 caracteres).')

export const apagarConflitoSchema = z.object({
  ativoIds: z
    .array(z.string().uuid('Ativo inválido'))
    .min(1, 'Selecione ao menos um cadastro para apagar.')
    .max(
      MAX_ATIVOS_POR_OPERACAO,
      `Seleção grande demais (máximo de ${MAX_ATIVOS_POR_OPERACAO} cadastros por operação).`,
    ),
  confirmacao: z.string().trim(),
  justificativa: justificativaConflitoSchema,
})

// ---------------------------------------------------------------------------
// Funções puras — as regras que a tela, a action e o roteiro SQL compartilham
// ---------------------------------------------------------------------------

/**
 * O texto que confirma a exclusão de N cadastros.
 *
 * ⚠ Espelha `v_esperado := 'APAGAR ' || v_n` da migration 0093, e existe pelo mesmo motivo
 * pelo qual `rotuloAlcanceReset` existe (F23): tela e banco precisam calcular a confirmação
 * da MESMA forma. Uma confirmação que a tela monta de um jeito e o banco de outro é uma
 * confirmação que nunca confere, e quem clicou não teria como saber por quê.
 *
 * O número entra no texto de propósito (ordem §4.3): a confirmação tem de FORÇAR a leitura
 * do tamanho. Quem quer apagar 2 não consegue confirmar sem digitar 2 — e quem selecionou
 * 12 sem perceber esbarra no número antes de destruir.
 */
export function textoConfirmacaoConflito(quantos: number): string {
  return `APAGAR ${quantos}`
}

/**
 * A confirmação digitada bate? Igualdade após `trim` + `toLowerCase` — a mesma régua de
 * `confirmacaoConfere` (F23) e de `validarExclusaoDeUsuario` (F22). Não é "parecido", não é
 * prefixo: o objetivo do campo é obrigar a pessoa a LER o que vai destruir e reproduzir.
 */
export function confirmacaoConflitoConfere(digitado: string, quantos: number): boolean {
  const a = digitado.trim().toLocaleLowerCase('pt-BR')
  const b = textoConfirmacaoConflito(quantos).trim().toLocaleLowerCase('pt-BR')
  return a !== '' && a === b
}

/** A seleção exige backup em ARQUIVO (acima do cap) ou cabe no evento? */
export function exigeBackupEmArquivo(quantos: number): boolean {
  return quantos > CAP_BACKUP_INLINE
}

/**
 * Recusa em pt-BR para a exclusão, ou `null` quando pode seguir.
 *
 * Concentra o que a action e a tela precisam dizer, para não redigitarem — redigitar é como
 * as camadas divergem (a lição da 0074). A revalidação do CONFLITO em si não está aqui de
 * propósito: ela depende do estado vivo do banco e só pode ser feita sob lock, dentro da
 * RPC. Esta função cobre o que é decidível sem sessão.
 */
export function validarExclusaoDeConflito(args: {
  ativoIds: string[]
  confirmacao: string
  justificativa: string
}): string | null {
  const { ativoIds, confirmacao, justificativa } = args
  const unicos = [...new Set(ativoIds)]

  if (unicos.length === 0) {
    return 'Selecione ao menos um cadastro para apagar.'
  }
  if (unicos.length > MAX_ATIVOS_POR_OPERACAO) {
    return `Seleção grande demais (${unicos.length} cadastros; o máximo é ${MAX_ATIVOS_POR_OPERACAO} por operação).`
  }
  if (justificativa.trim().length < MIN_JUSTIFICATIVA_CONFLITO) {
    return `Escreva uma justificativa de pelo menos ${MIN_JUSTIFICATIVA_CONFLITO} caracteres — ela é o que vai explicar esta exclusão depois que o cadastro deixar de existir.`
  }
  if (!confirmacaoConflitoConfere(confirmacao, unicos.length)) {
    return `A confirmação não confere. Para apagar, digite exatamente: ${textoConfirmacaoConflito(unicos.length)}`
  }
  return null
}
