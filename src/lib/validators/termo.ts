import { z } from 'zod'
import { dataRealSchema } from '@/lib/validators/data'
import { TERMO_TIPOS } from '@/lib/termos/tipos'

// A régua de data pura vem de `@/lib/validators/data` (fonte única do projeto).
// `dataRealSchema` = regex + `dataReal`, que faz round-trip por `dataISO` e barra
// também a faixa insana ('0000-01-01') que o `isValid(parseISO)` daqui deixava
// passar até o Postgres (22008). SEM regra de futuro, de propósito: `termo_data`
// não tem teto por decisão registrada (ver o comentário de `dataOpcionalSchema`).

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
    // F25 — a cidade da linha da assinatura ("{cidade}, {data por extenso}"),
    // pré-preenchida pela filial do(s) ativo(s) e editável como todo campo do
    // termo. Vale nas DUAS famílias: os 7 modelos têm essa linha.
    //
    // ⚠ NÃO tem relação com a cláusula de FORO, que segue fixa na comarca da sede
    // e não é campo (decisão do Johnny, 04/08/2026).
    //
    // 120 e não 60: nome de cidade brasileira comprido cabe com folga
    // ("Santa Bárbara d'Oeste", "São Miguel do Oeste").
    cidade: z.string().max(120),
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
  data: dataRealSchema('Data inválida'),
  campos: camposTermoSchema,
})

export type GerarTermoInput = z.infer<typeof gerarTermoSchema>
