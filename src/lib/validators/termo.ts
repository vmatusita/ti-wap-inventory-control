import { z } from 'zod'
import { isValid, parseISO } from 'date-fns'
import { TERMO_TIPOS } from '@/lib/termos/tipos'

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

// Data pura válida no calendário (o regex sozinho aceitaria '2026-02-30', que faz
// date-fns lançar RangeError ao formatar por extenso).
const dataValida = z
  .string()
  .regex(DATA_RE, 'Data inválida')
  .refine((d) => isValid(parseISO(d)), 'Data inválida')

// Todos os placeholders editáveis do dialog (§3.9: todo campo é editável). São
// apenas TEXTO do documento — não alteram o cadastro do ativo nem a movimentação.
// Chaves fechadas (nada de payload arbitrário). Datas por extenso são derivadas
// no servidor a partir de `data`, não vêm daqui.
export const camposTermoSchema = z
  .object({
    colaborador: z.string().max(200),
    marca: z.string().max(120),
    modelo: z.string().max(120),
    service_tag: z.string().max(120),
    patrimonio: z.string().max(120),
    chamado: z.string().max(60),
    telefone: z.string().max(60),
    imei: z.string().max(60),
    pulsus: z.string().max(60),
    obs: z.string().max(500),
    descricao: z.string().max(200),
    series: z.string().max(600),
    patrimonios: z.string().max(600),
    marcas_modelos: z.string().max(600),
    outros_componentes: z.string().max(400),
    observacao: z.string().max(500),
    tecnico: z.string().max(200),
  })
  .partial()

export type CamposTermo = z.infer<typeof camposTermoSchema>

export const prepararTermoSchema = z.object({
  movimentacaoIds: z.array(z.string().uuid()).min(1).max(20),
  familia: z.enum(['responsabilidade', 'devolucao']),
})

export const gerarTermoSchema = z.object({
  tipo: z.enum(TERMO_TIPOS),
  movimentacaoIds: z.array(z.string().uuid()).min(1).max(20),
  ativoIds: z.array(z.string().uuid()).min(1).max(20),
  // Data de geração/edição (yyyy-MM-dd). Alimenta as datas por extenso e termo_data.
  data: dataValida,
  campos: camposTermoSchema,
})

export type GerarTermoInput = z.infer<typeof gerarTermoSchema>
