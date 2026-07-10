import { z } from 'zod'
import { Constants } from '@/lib/types/database'

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
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
      .nullable(),
  ),
})

export type EditarAtivoInput = z.infer<typeof editarAtivoSchema>
