import { z } from 'zod'
import { parseData } from '@/lib/import'
import { hojeIso } from '@/lib/import/deparas'
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

const valorCru = z.string().max(MAX_CRU, 'Valor do CSV longo demais para uma correção.').trim()

const para = z
  .string()
  .trim()
  .min(1, 'Informe o valor da correção.')
  .max(MAX_PARA, `O valor da correção passa de ${MAX_PARA} caracteres.`)

// F7J (Johnny 20/07/2026): o `editar` do PATRIMÔNIO aceita VAZIO (limpar o patrimônio
// → importa como pendência "sem patrimônio físico"). Por isso o editar usa um `para` SEM
// `min(1)`; a exigência de valor para os DEMAIS campos volta no superRefine da união.
const paraEditar = z
  .string()
  .trim()
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
  para: paraEditar,
})

const removerLinhaSchema = z.object({
  op: z.literal('remover_linha'),
  linha,
})

// F7J: forçar o patrimônio cru da linha como válido fora do padrão canônico. Sem
// `para` — o valor forçado é o que estiver na célula (após edições). Só a linha.
const forcarPatrimonioSchema = z.object({
  op: z.literal('forcar_patrimonio'),
  linha,
})

export const correcaoSchema = z
  .discriminatedUnion('op', [
    substituirSchema,
    substituirEstadoSchema,
    editarSchema,
    removerLinhaSchema,
    forcarPatrimonioSchema,
  ])
  .superRefine((op, ctx) => {
    // F7J: `editar` do patrimônio pode ser VAZIO (limpar → pendência); os demais campos
    // exigem valor. `substituir`/`substituir_estado` já garantem `para` não-vazio no schema.
    if (op.op === 'editar' && op.campo !== 'patrimonio' && op.para.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['para'], message: 'Informe o valor da correção.' })
      return
    }
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

// ---------------------------------------------------------------------------
// A CONFIRMAÇÃO DIGITADA DO IMPORT — a gêmea TS da régua que a RPC aplica (F52)
// ---------------------------------------------------------------------------
// ⚠ A RÉGUA MORA EM `confirmacao-digitada.ts` — aqui só se REEXPORTA.
//
// Até a F52 havia DUAS: a Server Action comparava por IGUALDADE EXATA
// (`confirmacaoTexto !== filial.nome`) e a RPC não comparava nada — quem chamasse
// `/rest/v1/rpc/importar_ativos_substituir` direto pulava a conferência inteira. Agora a
// RPC confere, e por isso as duas pontas precisam responder a MESMA coisa: uma régua na
// tela e outra no banco é uma confirmação que ora confere e ora não, sem que ninguém
// consiga dizer por quê. É a lição que a `0100` aprendeu à força com o digest da seleção.
//
// A régua escolhida é a da CASA — `upper(btrim(coalesce(...)))`, as oito irmãs destrutivas
// de `0082`/`0083`/`0087`/`0089` — e não a igualdade exata que a action usava. O motivo é
// o critério de não-regressão: `upper(btrim())` é ESTRITAMENTE MAIS PERMISSIVA que a
// igualdade exata, então tudo o que a tela aceitava ontem continua sendo aceito hoje.
// Adotar a igualdade exata no banco faria o contrário — passaria a recusar o que a tela
// já aceitava em alguma ponta —, e guarda de escopo que recusa operação legítima é
// exatamente o que esta fase não pode fazer.
//
// O espelho SQL é conferido por `src/lib/validators/import-confirmacao-sql.test.ts`, que
// lê a migration VIGENTE e prova que a expressão lá é esta régua, não outra.
// O motivo da mudança de casa é de BUNDLE: o wizard do import é Client Component, e
// ESTE módulo importa o motor de CSV/XLSX de `@/lib/import`. Importar a régua daqui
// arrastaria esse motor para o bundle do cliente — a lição que a F39 aprendeu à força.
export { confirmacaoImportConfere } from '@/lib/validators/confirmacao-digitada'

/**
 * O prefixo obrigatório do backup de um import de startup.
 *
 * ⚠ Espelha `public.prefixo_backup_import(smallint)` (migration 0132), pelo mesmo motivo
 * pelo qual aquela função existe: a Server Action GRAVA o backup neste caminho e a RPC
 * RECUSA o que não estiver sob ele. Se as duas divergirem, todo import passa a ser
 * recusado com "o backup informado não é o backup DESTA filial" — e o caminho estaria
 * certo dos dois lados, só que diferentes.
 *
 * Por ID e não por slug: o slug colide quando deixar de ser único global, e com
 * `upsert:false` o segundo import falharia por causa do primeiro.
 */
export function prefixoBackupImport(filialId: number): string {
  return `import/filial-${filialId}/`
}
