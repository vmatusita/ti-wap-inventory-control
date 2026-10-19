// O USO EFETIVO de um cadastro de colaborador, do jeito que a tela o mostra (v1.71.2). Módulo PURO — a tabela de
// Administração › Colaboradores ('use client') e os testes o importam; nada de servidor aqui.
//
// Os NÚMEROS não nascem aqui: vêm prontos de `colaboradores_uso_efetivo()` (migration 0180), a regra no banco
// (docs/PLAN-v1.71.1-v1.71.2.md §2.2). Este módulo só decide o TEXTO do porquê e se uma linha casa com o filtro "Uso".
// Nenhum estado muda por causa do selo: desativar continua sendo decisão de quem administra, pelo "Editar".

export type UsoDoColaborador = {
  /** Há pelo menos um registro da pessoa que continua valendo, ou um equipamento com ela hoje. */
  readonly usoEfetivo: boolean
  /** Cadastro ATIVO sem uso efetivo — o selo "Sem uso". Inativo nunca tem selo. */
  readonly semUso: boolean
  readonly registrosValidos: number
  /** Os registros da pessoa que foram todos desfeitos por estorno (inclusive o inverso que a guarda). */
  readonly registrosEstornados: number
  readonly ativosComAPessoa: number
}

export type FiltroDeUso = 'todos' | 'em-uso' | 'sem-uso'

export const FILTROS_DE_USO: readonly { valor: FiltroDeUso; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Uso: todos' },
  { valor: 'em-uso', rotulo: 'Em uso' },
  { valor: 'sem-uso', rotulo: 'Sem uso' },
]

/** O porquê do selo, em linguagem de operador: "nunca usado" ou "N registros, todos estornados". */
export function porqueSemUso(registrosEstornados: number): string {
  if (registrosEstornados <= 0) return 'nunca usado'
  if (registrosEstornados === 1) return '1 registro, estornado'
  return `${registrosEstornados.toLocaleString('pt-BR')} registros, todos estornados`
}

/**
 * "Em uso" é quem tem uso efetivo (ativo ou não); "Sem uso" é o selo (ativo sem uso efetivo). O inativo que nunca foi
 * usado não está em nenhum dos dois — ele não tem selo e não está em uso. Sem o uso calculado (`null`, a leitura
 * falhou), a linha só aparece em "todos".
 */
export function casaFiltroDeUso(uso: UsoDoColaborador | null, filtro: FiltroDeUso): boolean {
  if (filtro === 'todos') return true
  if (uso === null) return false
  return filtro === 'sem-uso' ? uso.semUso : uso.usoEfetivo
}

export function ehFiltroDeUso(v: string): v is FiltroDeUso {
  return FILTROS_DE_USO.some((f) => f.valor === v)
}
