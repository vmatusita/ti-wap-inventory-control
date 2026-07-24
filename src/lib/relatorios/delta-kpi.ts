import type { KpisRelatorio } from '@/lib/relatorios/tipos'

// Semântica do Δ dos KPIs (F16/T2). Puro e testado.
//
// O Δ (variação vs período anterior) deixa de ser só direcional: agora a COR
// carrega o juízo por indicador. Subir é BOM em estoque/guardados (verde); é RUIM
// em manutenção e triagem (vermelho); nos demais é NEUTRO (cinza — a variação
// existe mas não é boa nem má). A COR NUNCA é o único canal: a seta ▲▼ permanece
// (o `DeltaKpi` a mantém), então daltônicos e a impressão P&B seguem lendo o sinal.

// Polaridade de cada indicador: 'positivo' = subir é bom; 'negativo' = subir é
// ruim; 'neutro' = sem juízo. Chaveado por `KpisRelatorio` — serve KpiTiles (total,
// em_uso, em_estoque, reservado, em_triagem, em_manutencao, defasado) e GrupoKpis
// (em_estoque=Guardados, reservado, em_manutencao, emprestado).
export type SentidoKpi = 'positivo' | 'negativo' | 'neutro'

export const SENTIDO_KPI: Record<keyof KpisRelatorio, SentidoKpi> = {
  em_estoque: 'positivo', // guardados/disponíveis: mais é melhor
  em_manutencao: 'negativo', // mais equipamento parado é pior
  em_triagem: 'negativo', // fila de conferência crescendo é pior
  total: 'neutro',
  em_uso: 'neutro',
  reservado: 'neutro',
  defasado: 'neutro',
  emprestado: 'neutro',
}

export type CorDelta = 'verde' | 'vermelho' | 'neutro'

// Cor do Δ a partir da chave do KPI e do valor da variação. Δ zero é sempre neutro
// (não houve movimento a julgar). Indicador neutro é sempre cinza, mantendo seta e
// valor. Nos direcionais, a cor inverte com o sinal do Δ.
export function corDelta(chave: keyof KpisRelatorio, delta: number): CorDelta {
  if (delta === 0) return 'neutro'
  const sentido = SENTIDO_KPI[chave] ?? 'neutro'
  if (sentido === 'neutro') return 'neutro'
  const subiu = delta > 0
  if (sentido === 'positivo') return subiu ? 'verde' : 'vermelho'
  return subiu ? 'vermelho' : 'verde' // 'negativo'
}

// Classe Tailwind de cor por veredito (claro/escuro). Fonte única — o componente
// só escolhe pelo retorno de `corDelta`.
export const CLASSE_COR_DELTA: Record<CorDelta, string> = {
  verde: 'text-green-600 dark:text-green-400',
  vermelho: 'text-red-600 dark:text-red-400',
  neutro: 'text-muted-foreground',
}
