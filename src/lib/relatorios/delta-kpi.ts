import { formatDate } from '@/lib/format'
import { periodoAnterior, type Periodo } from '@/lib/relatorios/periodo'
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
//
// F19 — o verde claro era `text-green-600`, que mede 3,22:1 sobre o card branco:
// reprova AA (o Δ é renderizado a 11px, e texto normal exige 4,5:1). `green-700`
// sobe para 4,94:1 sem mudar o matiz. O vermelho `red-600` já passava (4,76:1) e
// fica como está — trocar por simetria escureceria o alerta sem ganho. Medido por
// `node scripts/contraste.mjs`; os dois `dark:` seguem intactos (10,09:1 e 6,19:1).
export const CLASSE_COR_DELTA: Record<CorDelta, string> = {
  verde: 'text-green-700 dark:text-green-400',
  vermelho: 'text-red-600 dark:text-red-400',
  neutro: 'text-muted-foreground',
}

// F29/REL-07 — o tile mostrava seta + variação e mais nada: "▲ +12" não diz de QUE
// número nem em relação a QUAL janela. O snapshot v2 carrega `kpisAnterior` inteiro
// desde a F3B, e a janela é derivável do período — só faltava dizer.
//
// A janela sai de `periodoAnterior`, a MESMA função que o motor usa para calcular
// `kpisAnterior` (por isso ela mudou de casa para o módulo puro): rótulo e número
// não têm como divergir. Sem período (o dashboard não tem um), devolve `null` e o
// tile fica exatamente como era.
export function textoDelta(
  valorAtual: number,
  valorAnterior: number,
  periodo: Periodo | undefined,
): string | null {
  if (!periodo) return null
  const janela = periodoAnterior(periodo)
  return (
    `Anterior: ${valorAnterior.toLocaleString('pt-BR')} ` +
    `(${formatDate(janela.de)} a ${formatDate(janela.ate)}) → ` +
    `atual: ${valorAtual.toLocaleString('pt-BR')} ` +
    `(${formatDate(periodo.de)} a ${formatDate(periodo.ate)})`
  )
}
