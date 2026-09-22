import { STATUS_ORDEM, type StatusAtivo } from '@/lib/dominio'
import type { EstoqueCatStatus } from '@/lib/relatorios/tipos'

// F32/RV-07 — "Acervo por situação": o sumário executivo de uma linha.
//
// As barras empilhadas por categoria respondem "como cada categoria se divide";
// ninguém soma cinco barras de cabeça para saber a composição do acervo INTEIRO.
// O dado já está na página — esta função só agrega o que `estoqueCatStatus` já
// traz. Nenhuma leitura nova, nenhuma contagem nova: é o MESMO número dos KPIs,
// visto por outro ângulo. Por isso vale igual no ao vivo e no snapshot v2 (é
// render de dado existente, não campo novo no JSON congelado).

export type SegmentoAcervo = { status: StatusAtivo; total: number }
export type AcervoPorSituacao = { segmentos: SegmentoAcervo[]; total: number }

// Os dois status de BAIXA não entram: `descartado` e `devolvido_fornecedor` são
// saídas definitivas do acervo e a foto as-of do estoque já não os traz. A régua
// é a mesma de `barras-empilhadas.tsx` — se um dia a foto passar a trazê-los, os
// dois gráficos precisam continuar contando a mesma coisa.
//
// Passo 5 · item AA (22/09/2026) — exportada: `paleta-graficos.ts` reusa esta
// MESMA lista para definir os "7 status vivos" do portão de ΔE, em vez de
// duplicar os dois nomes por conta própria.
export const FORA_DO_ACERVO: readonly StatusAtivo[] = ['descartado', 'devolvido_fornecedor']

export function agregarAcervoPorSituacao(
  dados: readonly EstoqueCatStatus[],
): AcervoPorSituacao {
  const soma = new Map<StatusAtivo, number>()
  for (const categoria of dados) {
    for (const seg of categoria.segmentos) {
      if (FORA_DO_ACERVO.includes(seg.status)) continue
      soma.set(seg.status, (soma.get(seg.status) ?? 0) + seg.total)
    }
  }

  // Ordem canônica (STATUS_ORDEM) — a MESMA em que os segmentos se tocam nas
  // empilhadas, que é a ordem sobre a qual as distâncias de cor foram medidas.
  // Status zerado sai: segmento invisível só polui a legenda.
  const segmentos = STATUS_ORDEM.filter((s) => (soma.get(s) ?? 0) > 0).map((s) => ({
    status: s,
    total: soma.get(s) ?? 0,
  }))

  return { segmentos, total: segmentos.reduce((t, s) => t + s.total, 0) }
}
