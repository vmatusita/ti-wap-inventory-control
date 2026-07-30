import type { CategoriaAtivo, StatusAtivo } from '@/lib/dominio'

// Vocabulário e comparação da MESA DE CONFLITOS entre filiais (F24).
//
// CLIENT-SAFE de propósito (sem `server-only`), como `rotulos.ts` e `filtro.ts` ao lado: a
// mesa é Client Component (tem checkbox e diálogo), e o realce do diff é calculado no
// cliente a partir dos dados que o servidor serializou. Só tipos e funções PURAS aqui —
// nada de banco.
//
// A comparação campo a campo é função pura e testada porque é ela que responde a pergunta
// da mesa: "o que difere entre os dois cadastros?". Se ela errar, a tela realça o campo
// errado e alguém apaga o cadastro errado por causa disso.

/** Um lado do conflito — uma linha de `v_conflitos_filiais`. */
export type LadoConflito = {
  ativoId: string
  patrimonio: string | null
  serviceTag: string | null
  filialId: number
  filialSlug: string
  filialNome: string
  status: StatusAtivo
  categoria: CategoriaAtivo
  marca: string | null
  modelo: string | null
  hostname: string | null
  colaborador: string | null
  setor: string | null
  origem: string | null
  pendencia: string | null
  entradaEm: string | null
  atualizadoEm: string | null
  /** Total de movimentações do lado (inclui as nascidas da carga do import). */
  movimentacoes: number
  /** Movimentações que NÃO são da carga do import — o sinal de "vida de sistema". */
  movimentacoesReais: number
  ultimaMovData: string | null
  ultimaMovTipo: string | null
  termos: number
  /** movimentacoesReais > 0 OU termos > 0. Vem do banco; a UI não recalcula. */
  temHistoricoReal: boolean
}

/** Um GRUPO de conflito: a mesma identidade em 2+ filiais. */
export type GrupoConflito = {
  chave: string
  rotulo: string
  lados: LadoConflito[]
}

// ---------------------------------------------------------------------------
// O diff campo a campo (ordem §3.2)
// ---------------------------------------------------------------------------

/**
 * Os campos comparados, na ordem em que a mesa os exibe.
 *
 * `filial` NÃO está aqui — de propósito. Ela difere SEMPRE (é a definição do conflito), e
 * um realce que acende em 100% dos casos não informa nada; a filial ganha destaque próprio
 * no cabeçalho de cada lado. O mesmo raciocínio vale para os contadores de histórico, que
 * não são "campos do cadastro" e sim o resumo que ajuda a decidir.
 */
export const CAMPOS_CONFLITO = [
  { chave: 'patrimonio', rotulo: 'Patrimônio' },
  { chave: 'serviceTag', rotulo: 'Service tag' },
  { chave: 'status', rotulo: 'Estado' },
  { chave: 'categoria', rotulo: 'Categoria' },
  { chave: 'marca', rotulo: 'Marca' },
  { chave: 'modelo', rotulo: 'Modelo' },
  { chave: 'hostname', rotulo: 'Hostname' },
  { chave: 'colaborador', rotulo: 'Colaborador' },
  { chave: 'setor', rotulo: 'Setor' },
  { chave: 'entradaEm', rotulo: 'Entrada' },
] as const

export type CampoConflito = (typeof CAMPOS_CONFLITO)[number]['chave']

/**
 * Normaliza um valor para comparação: `null`, `undefined` e string só de espaço viram a
 * MESMA coisa (ausência). O resto compara como está.
 *
 * Sem esta normalização, um lado com `marca = ''` e outro com `marca = null` apareceriam
 * como divergentes — e são os dois "sem marca". Diferença de MAIÚSCULA, ao contrário, é
 * divergência de verdade e continua acendendo: "Dell" e "DELL" são cadastros digitados por
 * pessoas diferentes, e isso é exatamente o tipo de pista que a mesa existe para mostrar.
 */
export function normalizarValor(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/**
 * Quais campos DIVERGEM entre os lados do grupo.
 *
 * Um campo diverge quando os lados não têm todos o mesmo valor normalizado. Vale para 2+
 * lados (três filiais é raro, mas representável — a ordem §1.2 pede que não se force par).
 * Grupo com menos de 2 lados não tem o que comparar e devolve conjunto vazio.
 */
export function camposDivergentes(lados: LadoConflito[]): Set<CampoConflito> {
  const fora = new Set<CampoConflito>()
  if (lados.length < 2) return fora

  for (const { chave } of CAMPOS_CONFLITO) {
    const primeiro = normalizarValor(lados[0]![chave])
    if (lados.some((l) => normalizarValor(l[chave]) !== primeiro)) fora.add(chave)
  }
  return fora
}

/**
 * O lado tem vida de sistema além da carga do import?
 *
 * Lê o selo que o banco calculou (`tem_historico_real`), e não recalcula: a definição de
 * "carga do import" mora em `mov_da_carga_import` (migration 0092), medida sobre o
 * marcador real que a RPC grava. Duas cópias da regra dariam telas que discordam.
 */
export function ladosComHistoricoReal(lados: LadoConflito[]): LadoConflito[] {
  return lados.filter((l) => l.temHistoricoReal)
}

/**
 * Resumo em pt-BR do que a exclusão vai levar junto — o texto do diálogo (§4.3).
 * Puro para poder ser testado sem montar a tela.
 */
export function resumoDaExclusao(selecionados: LadoConflito[]): {
  ativos: number
  movimentacoes: number
  termos: number
  porFilial: { filial: string; ativos: number }[]
  comHistoricoReal: LadoConflito[]
} {
  const porFilial = new Map<string, number>()
  for (const l of selecionados) {
    porFilial.set(l.filialNome, (porFilial.get(l.filialNome) ?? 0) + 1)
  }
  return {
    ativos: selecionados.length,
    movimentacoes: selecionados.reduce((n, l) => n + l.movimentacoes, 0),
    termos: selecionados.reduce((n, l) => n + l.termos, 0),
    porFilial: [...porFilial.entries()]
      .map(([filial, ativos]) => ({ filial, ativos }))
      .sort((a, b) => a.filial.localeCompare(b.filial, 'pt-BR')),
    comHistoricoReal: ladosComHistoricoReal(selecionados),
  }
}
