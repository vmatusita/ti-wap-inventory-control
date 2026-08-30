import { z } from 'zod'
import { dataRealSchema } from '@/lib/validators/data'
import { TERMO_TIPOS } from '@/lib/termos/tipos'

// A régua de data pura vem de `@/lib/validators/data` (fonte única do projeto).
// `dataRealSchema` = regex + `dataReal`, que faz round-trip por `dataISO` e barra
// também a faixa insana ('0000-01-01') que o `isValid(parseISO)` daqui deixava
// passar até o Postgres (22008). SEM regra de futuro, de propósito: `termo_data`
// não tem teto por decisão registrada (ver o comentário de `dataOpcionalSchema`).

// F39 (revisão de 29/08/2026) — OS TETOS DAS DUAS LINHAS DE PERIFÉRICOS, exportados.
//
// `montarLinhaDeAcessorios` (lib/termos/acessorios.ts) é quem GARANTE que a linha
// sugerida cabe; o `.max()` daqui é a segunda linha, para o que o operador digita à
// mão. Os dois lados precisam do MESMO número, e a action os repetia à mão: baixar o
// `max` sem baixar a constante devolveria uma sugestão que o próprio Zod recusa, com
// a mensagem "Há campos inválidos. Revise o termo." num campo que ninguém digitou —
// exatamente a falha que a função de corte existe para impedir. Uma fonte só.
export const LIMITE_ACESSORIOS = 600
export const LIMITE_OUTROS_COMPONENTES = 400

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
    outros_componentes: z.string().max(LIMITE_OUTROS_COMPONENTES),
    // F39 — a linha de periféricos do termo de RESPONSABILIDADE ("Acompanham o
    // equipamento os seguintes acessórios e periféricos: …"), pré-preenchida pelos
    // itens que foram junto na movimentação (F38) e editável como todo campo do
    // termo (§3.9 do PLANO-TERMOS).
    //
    // ⚠ Quem garante o teto é `montarLinhaDeAcessorios` (lib/termos/acessorios.ts),
    // NÃO este `max`. Deixar a linha sugerida estourar aqui faria `gerarTermo`
    // devolver "Há campos inválidos. Revise o termo." num campo que o operador nem
    // digitou. O `max` continua valendo para o que ele digita à mão — é a segunda
    // linha, não a única.
    //
    // 600 e não 400 (o de `outros_componentes`): a entrega lista tudo o que saiu
    // com o equipamento; a devolução, só o que voltou naquele ato.
    acessorios: z.string().max(LIMITE_ACESSORIOS),
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
