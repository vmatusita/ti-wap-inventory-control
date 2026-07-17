import { z } from 'zod'
import { parseData } from '@/lib/import'
import type { CampoEditavel, CorrecaoImport } from '@/lib/import'

// Schema das CORREÇÕES do import de startup (OS-F7B / W3). Único lugar do schema:
// `validarImport`, `aplicarImport` e `baixarCsvCorrigido` importam daqui; a UI
// importa só o TIPO (`CorrecaoImport`, do motor).
//
// DIVISÃO DA VALIDAÇÃO (contrato §1.5 do ultracode — decisão registrada):
//   - AQUI (estrutural, sem conhecer o CSV): shape da union discriminada,
//     whitelist de campos, `substituir` proibida para patrimônio/service tag,
//     cap de 300 ops, `para` não vazio (aparado) e datas via `parseData`
//     (dd/MM/aaaa válida e não futura).
//   - NO MOTOR (W1, depende de CSV/layout/filial): site já conhecido em
//     `substituir`, estado que resolve para `descartado`, campo fora do layout.
//     Op que viole vira bloqueante `correcao_invalida` na reanálise — nunca
//     silenciosa, nunca aplicada. NÃO duplique essas regras aqui.
//
// ATENÇÃO: este módulo é SERVER-ONLY em runtime — importa `parseData` do barrel
// `@/lib/import`, que re-exporta `plano.ts` (node:crypto). Client Component que
// precise da mesma régua importa dos módulos-folha (`@/lib/import/deparas`).

/** Teto de operações por import. F7D (17/07/2026) removeu o limite prático de 300
 *  (o Johnny corrige em lote/global — um CSV bem sujo passa fácil de 300 ops): este
 *  teto é só uma rede contra payload absurdo forjado FORA da tela. Invisível no uso
 *  real — a maior filial tem 1.217 ativos, e cada ativo gera no máximo ~1 op. */
export const MAX_CORRECOES = 20_000

// Tetos de tamanho: uma correção escreve UMA célula de planilha. `de`/`statusDe`/
// `situacaoDe` são valores CRUS do CSV (podem ser vazios — Site em branco é um
// caso real de `site_desconhecido`); `para` é digitado por quem corrige.
const MAX_PARA = 200
const MAX_CRU = 500

/** Whitelist de campos corrigíveis — espelha `CampoEditavel` (motor W1). */
const CAMPOS_EDITAVEIS = [
  'site',
  'tipo',
  'patrimonio',
  'serviceTag',
  'situacao',
  'colaborador',
  'dataInclusao',
  'dataEntrega',
] as const satisfies readonly CampoEditavel[]

/** Campos que aceitam troca EM MASSA — só aqueles em que TODA célula que casa com
 *  o valor cru é, por si, errada. Ficam de fora de propósito:
 *  · patrimônio e service tag (OS-F7B §3.2) — o mesmo valor em N linhas criaria pares duplicados;
 *  · datas (revisão adversarial da F7B, 17/07/2026) — `sem_data_entrada` só é aviso quando
 *    Inclusão E Entrega falham, então uma linha com Inclusão vazia e Entrega válida NÃO está no
 *    grupo e mesmo assim casaria com `de: ''`: a troca mudaria a `dataEntrada` dela em silêncio.
 *    Data se corrige por `editar` (a UI emite uma op por linha do grupo). */
const CAMPOS_SUBSTITUIVEIS = ['site', 'tipo'] as const satisfies readonly CampoEditavel[]

const CAMPOS_DATA: ReadonlySet<CampoEditavel> = new Set(['dataInclusao', 'dataEntrega'])

/** Hoje (data local) no formato de `parseData` — espelha o `hojeIso` do motor. */
function hojeIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const valorCru = z.string().max(MAX_CRU, 'Valor do CSV longo demais para uma correção.').trim()

const para = z
  .string()
  .trim()
  .min(1, 'Informe o valor da correção.')
  .max(MAX_PARA, `O valor da correção passa de ${MAX_PARA} caracteres.`)

/** Linha física do arquivo, 1-based com o cabeçalho na linha 1 (OS-F7B §3.6). */
const linha = z
  .number()
  .int('Linha inválida.')
  .min(2, 'Linha inválida — a linha 1 é o cabeçalho.')

const substituirSchema = z.object({
  op: z.literal('substituir'),
  campo: z.enum(CAMPOS_SUBSTITUIVEIS, {
    error:
      'Campo inválido para correção em massa (só Site e Tipo) — patrimônio, service tag e datas se corrigem linha a linha.',
  }),
  de: valorCru,
  para,
})

const substituirEstadoSchema = z.object({
  op: z.literal('substituir_estado'),
  statusDe: valorCru,
  situacaoDe: valorCru,
  para,
})

const editarSchema = z.object({
  op: z.literal('editar'),
  linha,
  campo: z.enum(CAMPOS_EDITAVEIS, { error: 'Campo não corrigível pela tela de import.' }),
  para,
})

const removerLinhaSchema = z.object({
  op: z.literal('remover_linha'),
  linha,
})

export const correcaoSchema = z
  .discriminatedUnion('op', [
    substituirSchema,
    substituirEstadoSchema,
    editarSchema,
    removerLinhaSchema,
  ])
  .superRefine((op, ctx) => {
    // Datas (OS-F7B §3.5): o valor tem de passar na MESMA régua do CSV —
    // dd/MM/aaaa válida e não futura. Vale para `substituir` e `editar`.
    if (op.op !== 'substituir' && op.op !== 'editar') return
    if (!CAMPOS_DATA.has(op.campo)) return

    const r = parseData(op.para, hojeIso())
    if (r.iso === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['para'],
        message: `Data inválida: use o formato dd/MM/aaaa (ex.: 05/03/${new Date().getFullYear()}).`,
      })
      return
    }
    if (r.futura) {
      ctx.addIssue({
        code: 'custom',
        path: ['para'],
        message: 'A data de entrada não pode ser futura.',
      })
    }
  })

export const correcoesSchema = z
  .array(correcaoSchema)
  .max(MAX_CORRECOES, 'Correções demais neste import — algo está errado com o arquivo.')

export type ParseCorrecoesResult =
  | { ok: true; correcoes: CorrecaoImport[] }
  | { ok: false; erro: string }

/** Valida uma lista já desserializada. O retorno tipado como `CorrecaoImport[]` é
 *  o que amarra este Zod ao contrato do motor em tempo de compilação. */
export function parseCorrecoes(valor: unknown): ParseCorrecoesResult {
  const r = correcoesSchema.safeParse(valor)
  if (r.success) return { ok: true, correcoes: r.data }

  const issue = r.error.issues[0]
  const indice = typeof issue?.path?.[0] === 'number' ? issue.path[0] : null
  const onde = indice === null ? '' : ` (correção ${indice + 1})`
  return {
    ok: false,
    erro: `Correção inválida${onde}: ${issue?.message ?? 'formato não reconhecido'}`,
  }
}

/** Lê o campo `correcoes` do FormData (string JSON; ausente/vazio = `[]`). JSON
 *  malformado vira erro em pt-BR — nunca throw cru para o cliente. */
export function parseCorrecoesJson(valor: FormDataEntryValue | null): ParseCorrecoesResult {
  if (valor === null || valor === '') return { ok: true, correcoes: [] }
  if (typeof valor !== 'string') {
    return { ok: false, erro: 'Correções em formato inesperado. Recarregue a tela e tente de novo.' }
  }
  let json: unknown
  try {
    json = JSON.parse(valor)
  } catch {
    return {
      ok: false,
      erro: 'Não foi possível ler as correções enviadas. Recarregue a tela e refaça a análise.',
    }
  }
  return parseCorrecoes(json)
}
