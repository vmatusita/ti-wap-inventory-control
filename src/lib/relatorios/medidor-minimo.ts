// F32/RV-09 — a régua do micro-medidor "estoque × mínimo" na tabela de saldo.
//
// O chip vermelho "faltam N" já existia e está certo como ALERTA, mas é binário:
// ele só sabe dizer "já acabou". O item que está a uma unidade do mínimo — o que
// o comprador precisaria ver ANTES de faltar — é visualmente idêntico ao que tem
// estoque de sobra. O medidor acrescenta a graduação que faltava; o chip
// permanece, porque ele é o rótulo em texto (a cor nunca é o único canal).

export type NivelMedidor = 'falta' | 'limite' | 'folga'

// A banda de "limite" (âmbar): `max(2, 20% do mínimo)` acima do mínimo.
//
// Por que as DUAS parcelas. Só a percentual quebra no miúdo: com mínimo 5, 20% é
// 1 — o âmbar só apareceria em `estoque === 6`, um único valor, e o alerta chega
// tarde demais para quem repõe por lote. Só a absoluta quebra no graúdo: com
// mínimo 200, "faltam 2 para o mínimo" é ruído, não risco. `max` das duas dá uma
// banda que faz sentido nos dois extremos do catálogo (que vai de cabos avulsos
// a memórias contadas às dezenas).
export const FOLGA_ABSOLUTA_MINIMA = 2
export const FOLGA_PROPORCIONAL = 0.2

export function bandaDeLimite(minimo: number): number {
  return Math.max(FOLGA_ABSOLUTA_MINIMA, Math.ceil(FOLGA_PROPORCIONAL * minimo))
}

// `null` = não desenhe medidor. Item sem mínimo cadastrado (ou com mínimo zero)
// não tem régua contra a qual medir — e inventar uma seria pior do que não
// mostrar nada, porque o medidor pareceria dizer algo sobre a reposição daquele
// item. É também o caso dos snapshots gerados ANTES desta fase, cujo JSON
// congelado não tem o campo `minimo`: eles abrem exatamente como abriam.
export function nivelMedidor(
  estoque: number,
  minimo: number | null | undefined,
): NivelMedidor | null {
  if (minimo == null || !Number.isFinite(minimo) || minimo <= 0) return null
  if (!Number.isFinite(estoque)) return null
  if (estoque < minimo) return 'falta'
  if (estoque - minimo <= bandaDeLimite(minimo)) return 'limite'
  return 'folga'
}

// Quanto da barra preencher: 0…1. Passar do mínimo não estica a barra — ela
// mede "quanto do mínimo está coberto", e um item com o triplo do mínimo não
// precisa de um medidor três vezes maior para dizer "está tranquilo".
export function fracaoMedidor(estoque: number, minimo: number | null | undefined): number {
  if (minimo == null || !Number.isFinite(minimo) || minimo <= 0) return 0
  if (!Number.isFinite(estoque) || estoque <= 0) return 0
  return Math.min(estoque / minimo, 1)
}

// O texto que acompanha o medidor para quem não enxerga a cor (leitor de tela e
// impressão P&B). O medidor é decorativo — este rótulo é o canal de verdade.
export function rotuloMedidor(
  estoque: number,
  minimo: number | null | undefined,
): string | null {
  const nivel = nivelMedidor(estoque, minimo)
  if (nivel === null || minimo == null) return null
  const alvo = `mínimo ${minimo.toLocaleString('pt-BR')}`
  if (nivel === 'falta') return `abaixo do ${alvo}`
  if (nivel === 'limite') return `no limite do ${alvo}`
  return `acima do ${alvo}`
}
