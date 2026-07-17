// F7D — o "cérebro" dos botões de correção em lote da tela de import. PURO (sem
// JSX, sem React): o rascunho do que o operador digitou/escolheu vive no
// componente pai (`grupos-erros.tsx`), e ESTAS funções derivam, a partir dele:
//   · as ops que um card emitiria           → `opsDoGrupo`
//   · se o card está pronto para aplicar     → `grupoPronto`
//   · quantas linhas ainda faltam            → `faltamNoGrupo`
//   · o resumo legível do botão global       → `resumoOps`
// O botão por-card, o botão "corrigir a seção" e o botão global TODOS derivam
// daqui — a régua não se duplica. A validação de valor é a MESMA do motor (a UI é
// a segunda linha): patrimônio via `canonicalizarPatrimonio`, data via `parseData`
// (válida, não futura), estado/categoria só pelos vocabulários canônicos.
//
// VALOR só dos módulos-folha PUROS do motor (o barrel `@/lib/import` re-exporta
// `plano.ts`, que puxa node:crypto e é server-only); daqui só TIPO.
import { parseData, SITUACAO_CANONICA, TIPO_CANONICO } from '@/lib/import/deparas'
import { canonicalizarPatrimonio } from '@/lib/patrimonio'
import type {
  CampoEditavel,
  CategoriaAtivo,
  CorrecaoImport,
  GrupoErro,
  RegistroImport,
  StatusAtivo,
} from '@/lib/import'

/** Rascunho da tela: chave (do campo) → valor digitado/escolhido. */
export type Rascunho = Record<string, string>

type Contexto = Record<number, RegistroImport>

/** Chave do valor de MASSA de um card (categoria/estado — um valor por grupo). */
export function chaveMassa(grupo: GrupoErro): string {
  return `m|${grupo.tipo}|${grupo.chave}`
}

/** Chave do valor PONTUAL de uma célula (patrimônio/colaborador/data/service tag). */
export function chaveLinha(linha: number, campo: CampoEditavel): string {
  return `l|${linha}|${campo}`
}

function hojeIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** dd/MM/aaaa válida e não futura — espelha a régua do motor (`parseData`). */
export function dataValida(valor: string): boolean {
  const r = parseData(valor, hojeIso())
  return r.iso !== null && !r.invalida && !r.futura
}

/** Valor efetivo do card de massa: o que o operador escolheu, ou a sugestão do
 *  motor quando ele ainda não mexeu (a sugestão pré-selecionada "conta"). */
export function massaEfetiva(grupo: GrupoErro, rascunho: Rascunho): string {
  const k = chaveMassa(grupo)
  if (k in rascunho) return rascunho[k] ?? ''
  const c = grupo.correcao
  if (c.kind === 'categoria') return c.sugestao ?? ''
  if (c.kind === 'estado') return c.sugestao ?? ''
  return ''
}

/** Valor efetivo de uma célula pontual: o que foi digitado, ou o original do CSV. */
function linhaEfetiva(
  linha: number,
  campo: CampoEditavel,
  rascunho: Rascunho,
  contexto: Contexto,
): string {
  const k = chaveLinha(linha, campo)
  if (k in rascunho) return rascunho[k] ?? ''
  const reg = contexto[linha]
  if (!reg) return ''
  if (campo === 'patrimonio') return reg.patrimonio
  if (campo === 'serviceTag') return reg.serviceTag
  if (campo === 'colaborador') return reg.colaborador
  if (campo === 'dataInclusao') return reg.dataInclusao
  return ''
}

// --- prontidão por linha (a validação é a do motor) ------------------------

function patrimonioLinhaOk(linha: number, rascunho: Rascunho, contexto: Contexto): boolean {
  const v = linhaEfetiva(linha, 'patrimonio', rascunho, contexto)
  const orig = contexto[linha]?.patrimonio ?? ''
  return v.trim() !== orig.trim() && canonicalizarPatrimonio(v) !== null
}

function colaboradorLinhaOk(linha: number, rascunho: Rascunho, contexto: Contexto): boolean {
  const v = linhaEfetiva(linha, 'colaborador', rascunho, contexto)
  const orig = contexto[linha]?.colaborador ?? ''
  return v.trim() !== '' && v.trim() !== orig.trim()
}

function dataLinhaOk(linha: number, rascunho: Rascunho, contexto: Contexto): boolean {
  return dataValida(linhaEfetiva(linha, 'dataInclusao', rascunho, contexto))
}

function linhaOk(
  kind: 'patrimonio' | 'colaborador' | 'data',
  linha: number,
  rascunho: Rascunho,
  contexto: Contexto,
): boolean {
  if (kind === 'patrimonio') return patrimonioLinhaOk(linha, rascunho, contexto)
  if (kind === 'colaborador') return colaboradorLinhaOk(linha, rascunho, contexto)
  return dataLinhaOk(linha, rascunho, contexto)
}

// --- as ops que um card emitiria com o rascunho atual ----------------------

/** [] = nada pronto neste card. Para os pontuais, emite só as linhas prontas. */
export function opsDoGrupo(
  grupo: GrupoErro,
  rascunho: Rascunho,
  contexto: Contexto,
  filialNome: string,
): CorrecaoImport[] {
  const c = grupo.correcao
  switch (c.kind) {
    case 'categoria': {
      const cat = massaEfetiva(grupo, rascunho)
      if (!(cat in TIPO_CANONICO)) return []
      return [
        {
          op: 'substituir',
          campo: 'tipo',
          de: grupo.chave,
          para: TIPO_CANONICO[cat as Exclude<CategoriaAtivo, 'outro'>],
        },
      ]
    }
    case 'estado': {
      const est = massaEfetiva(grupo, rascunho)
      if (!(est in SITUACAO_CANONICA)) return []
      return [
        {
          op: 'substituir_estado',
          statusDe: c.statusDe,
          situacaoDe: c.situacaoDe,
          para: SITUACAO_CANONICA[est as Exclude<StatusAtivo, 'descartado'>],
        },
      ]
    }
    case 'site_desconhecido':
      return [{ op: 'substituir', campo: 'site', de: grupo.chave, para: filialNome }]
    case 'site_outra_filial':
    case 'existe_em_outra_filial':
      return grupo.linhas.map((linha) => ({ op: 'remover_linha', linha }))
    case 'patrimonio':
      return grupo.linhas
        .filter((l) => patrimonioLinhaOk(l, rascunho, contexto))
        .map((linha) => ({
          op: 'editar',
          linha,
          campo: 'patrimonio',
          para: linhaEfetiva(linha, 'patrimonio', rascunho, contexto),
        }))
    case 'colaborador':
      return grupo.linhas
        .filter((l) => colaboradorLinhaOk(l, rascunho, contexto))
        .map((linha) => ({
          op: 'editar',
          linha,
          campo: 'colaborador',
          para: linhaEfetiva(linha, 'colaborador', rascunho, contexto),
        }))
    case 'data':
      return grupo.linhas
        .filter((l) => dataLinhaOk(l, rascunho, contexto))
        .map((linha) => ({
          op: 'editar',
          linha,
          campo: 'dataInclusao',
          para: linhaEfetiva(linha, 'dataInclusao', rascunho, contexto),
        }))
    // duplicata: resolvida linha a linha no próprio card (grupos pequenos, dois
    // campos por linha); nenhuma: sem ação. Fora do lote/global.
    // patrimonio_vazio: F7E-bridge (onda 1) — o W3 emite as linhas preenchidas na
    // onda 2 (espelhando 'patrimonio'); por ora fica fora do lote/global.
    case 'patrimonio_vazio':
    case 'duplicata':
    case 'nenhuma':
      return []
  }
}

/**
 * O card está pronto para aplicar TUDO de uma vez?
 * - massa (categoria/estado): tem valor escolhido/sugerido válido;
 * - ação fixa (site desconhecido, remoções): sempre;
 * - pontual (patrimônio/colaborador/data): TODAS as linhas preenchidas e válidas
 *   (decisão do Johnny — não é "aplica o que estiver preenchido");
 * - duplicata/nenhuma: nunca entra no lote.
 */
export function grupoPronto(grupo: GrupoErro, rascunho: Rascunho, contexto: Contexto): boolean {
  const c = grupo.correcao
  switch (c.kind) {
    case 'categoria':
      return massaEfetiva(grupo, rascunho) in TIPO_CANONICO
    case 'estado':
      return massaEfetiva(grupo, rascunho) in SITUACAO_CANONICA
    case 'site_desconhecido':
    case 'site_outra_filial':
    case 'existe_em_outra_filial':
      return true
    case 'patrimonio':
      return grupo.linhas.every((l) => linhaOk('patrimonio', l, rascunho, contexto))
    case 'colaborador':
      return grupo.linhas.every((l) => linhaOk('colaborador', l, rascunho, contexto))
    case 'data':
      return grupo.linhas.every((l) => linhaOk('data', l, rascunho, contexto))
    // patrimonio_vazio nunca entra no lote/global (preencher é opcional — a
    // pendência é legítima). Comportamento final, não bridge.
    case 'patrimonio_vazio':
    case 'duplicata':
    case 'nenhuma':
      return false
  }
}

/** Quantas linhas do card pontual ainda faltam preencher (para o texto do botão
 *  desabilitado). 0 para os cards de massa/ação fixa. */
export function faltamNoGrupo(grupo: GrupoErro, rascunho: Rascunho, contexto: Contexto): number {
  const kind = grupo.correcao.kind
  if (kind !== 'patrimonio' && kind !== 'colaborador' && kind !== 'data') return 0
  return grupo.linhas.filter((l) => !linhaOk(kind, l, rascunho, contexto)).length
}

// --- resumo do botão global -------------------------------------------------

const ORDEM: { rotulo: [string, string]; conta: (o: CorrecaoImport) => boolean }[] = [
  { rotulo: ['linha removida', 'linhas removidas'], conta: (o) => o.op === 'remover_linha' },
  { rotulo: ['tipo', 'tipos'], conta: (o) => o.op === 'substituir' && o.campo === 'tipo' },
  { rotulo: ['estado', 'estados'], conta: (o) => o.op === 'substituir_estado' },
  { rotulo: ['site', 'sites'], conta: (o) => o.op === 'substituir' && o.campo === 'site' },
  {
    rotulo: ['patrimônio', 'patrimônios'],
    conta: (o) => o.op === 'editar' && o.campo === 'patrimonio',
  },
  {
    rotulo: ['service tag', 'service tags'],
    conta: (o) => o.op === 'editar' && o.campo === 'serviceTag',
  },
  {
    rotulo: ['colaborador', 'colaboradores'],
    conta: (o) => o.op === 'editar' && o.campo === 'colaborador',
  },
  {
    rotulo: ['data', 'datas'],
    conta: (o) => o.op === 'editar' && (o.campo === 'dataInclusao' || o.campo === 'dataEntrega'),
  },
]

/** "18 linhas removidas · 2 tipos · 3 patrimônios" — remoção primeiro (é o que
 *  mais pesa). `''` quando não há nada a aplicar. */
export function resumoOps(ops: CorrecaoImport[]): string {
  const partes: string[] = []
  for (const { rotulo, conta } of ORDEM) {
    const n = ops.filter(conta).length
    if (n > 0) partes.push(`${n.toLocaleString('pt-BR')} ${n === 1 ? rotulo[0] : rotulo[1]}`)
  }
  return partes.join(' · ')
}
