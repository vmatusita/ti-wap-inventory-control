import { z } from 'zod'
import { Constants } from '@/lib/types/database'
import { DATA_RE } from '@/lib/validators/data'
import { canonicalizarPatrimonio } from '@/lib/patrimonio'

// Edicao de dados CADASTRAIS do ativo (OS-F2 3.2.4). SO campos NAO derivados:
// specs, hostname, observacoes e termo. Status/colaborador/filial NAO entram
// aqui — mudam apenas por movimentacao (a fonte da verdade).
const opcional = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().trim().optional(),
)

export const editarAtivoSchema = z.object({
  id: z.string().uuid(),
  memoria: opcional,
  armazenamento: opcional,
  processador: opcional,
  hostname: opcional,
  observacoes: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().trim().max(2000, 'Observações: no máximo 2000 caracteres').optional(),
  ),
  // termo: '' (vazio) = "não informado" -> null no banco.
  termo_assinado: z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    z.enum(Constants.public.Enums.termo_status).nullable(),
  ),
  termo_data: z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    z
      .string()
      .regex(DATA_RE, 'Data inválida')
      .nullable(),
  ),
})

export type EditarAtivoInput = z.infer<typeof editarAtivoSchema>

// Anotação na linha do tempo (F3B): nota avulsa, imutável, com autor + data.
export const anotacaoSchema = z.object({
  ativo_id: z.string().uuid('Ativo inválido'),
  texto: z
    .string()
    .trim()
    .min(1, 'Escreva a anotação')
    .max(2000, 'Anotação: no máximo 2000 caracteres'),
})

// ---------------------------------------------------------------------------
// B6 (F6B) — confirmar / desfazer assinatura do termo. Só `sim` encerra a
// pendência (spec §; enum termo_status). O autor+quando do ato ficam na
// `anotacoes` (imutável) — `ativos` não tem coluna de autor.
// ---------------------------------------------------------------------------
export const confirmarAssinaturaSchema = z.object({
  ativo_id: z.string().uuid('Ativo inválido'),
  // Data da assinatura (pura, não-futura). Ausente = hoje (resolvido no servidor).
  data: z
    .string()
    .regex(DATA_RE, 'Data inválida')
    .optional(),
})

export const desfazerAssinaturaSchema = z.object({
  ativo_id: z.string().uuid('Ativo inválido'),
})

// ---------------------------------------------------------------------------
// B7 (F6B) — corrigir patrimônio. Service tag é IMUTÁVEL (identidade do
// equipamento) e não entra em nenhum schema de edição; só o patrimônio é
// corrigível, sempre canonicalizado (spec §5, WAP0004491).
// ---------------------------------------------------------------------------
export const corrigirPatrimonioSchema = z.object({
  ativo_id: z.string().uuid('Ativo inválido'),
  patrimonio_novo: z.string().trim().min(1, 'Informe o novo patrimônio'),
})

export type CorrecaoPatrimonio =
  | { ok: true; patrimonio: string; noop: boolean }
  | { ok: false; erro: string }

// Valida e canonicaliza o patrimônio novo contra o atual (correção — B7). PURA:
// serve tanto ao preview do dialog (cliente) quanto à Server Action. `noop` =
// o novo, canonicalizado, é igual ao atual (nada a corrigir). `atual` pode ser
// null (F7E — ativo importado SEM patrimônio; o "de" é vazio e nunca é no-op).
export function validarCorrecaoPatrimonio(
  atual: string | null,
  patrimonioNovoRaw: string,
): CorrecaoPatrimonio {
  const canon = canonicalizarPatrimonio(patrimonioNovoRaw)
  if (!canon) {
    return {
      ok: false,
      erro: 'Patrimônio fora do formato (ex.: WAP0001234).',
    }
  }
  return { ok: true, patrimonio: canon, noop: canon === atual }
}
