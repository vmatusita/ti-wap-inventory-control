import type { GranularidadeSerie } from '@/lib/relatorios/tipos'

// Leitura de CALENDÁRIO sobre a chave do balde da série (F32/RV-05) — separado
// de serie.ts porque ali a matemática é "quantos baldes, com que rótulo"; aqui é
// "este balde específico merece um aviso visual" (fim de semana, balde de hoje
// ainda em aberto). Nada de `Date.now()`/`hojeISO()` dentro: a data "hoje" entra
// por parâmetro — a mesma convenção de `formatTempoRelativo` (format.ts) — porque
// o snapshot congelado reusa este módulo e não pode "descobrir" a data sozinho.

// Só o balde de HOJE, em granularidade DIA, é parcial de fato. Balde de semana/mês
// também pode estar "em curso" (a semana corrente quase sempre está), mas marcar
// TODO balde em curso como parcial viraria ruído permanente no relatório — no
// preset padrão da WAP a semana É o período inteiro, então o balde semanal
// "em curso" seria a régua inteira piscando. Por isso o aviso fica reservado ao
// caso em que o leitor realmente compara um dia fechado com um dia pela metade.
export function ehBaldeDeHoje(
  chave: string,
  granularidade: GranularidadeSerie,
  hoje: string,
): boolean {
  return granularidade === 'dia' && chave === hoje
}

// Opacidade das duas barras do balde de hoje — baixa o suficiente para ler como
// "ainda enchendo" ao lado das barras cheias, alta o suficiente para o valor
// continuar legível (e sobreviver a impressão P&B, que já perde o par de cores).
export const OPACIDADE_BALDE_PARCIAL = 0.55

// Chave de balde DIÁRIO no formato 'yyyy-MM-dd' (ver serie.ts) — mês ('yyyy-MM')
// ou qualquer coisa fora do formato não passa daqui.
const CHAVE_DIA_RE = /^\d{4}-\d{2}-\d{2}$/

// `chaveISO` é um balde de DIA ('yyyy-MM-dd'); baldes de SEMANA usam o mesmo
// formato (a segunda-feira do balde) mas fim de semana não se aplica a eles — a
// granularidade "semana" já absorveu sábado/domingo dentro do balde, marcar o
// balde inteiro de cinza destruiria a única barra da semana. Por isso a função
// não recebe `granularidade`: quem chama já filtra (só o eixo diário atenua
// ticks/barras) — aqui é só "este dd é sáb/dom", puro.
export function ehFimDeSemana(chaveISO: string): boolean {
  if (!CHAVE_DIA_RE.test(chaveISO)) return false
  const [ano, mes, dia] = chaveISO.split('-').map(Number)
  // ARMADILHA DE FUSO: `new Date('2026-08-08').getDay()` primeiro interpreta a
  // string como MEIA-NOITE UTC e só então o `getDay()` LOCAL reprojeta esse
  // instante para o fuso do processo. Em fuso negativo (America/Sao_Paulo,
  // UTC-3 — onde a Vercel roda em UTC mas o navegador do Johnny roda em SP) esse
  // instante vira "2026-08-07 21:00 SP", um dia civil ANTES — sábado passaria a
  // reportar sexta. `Date.UTC(...)` + `getUTCDay()` lê o dia da semana do MESMO
  // instante UTC que a string representa, sem essa segunda reprojeção — o
  // resultado não depende de em que fuso o código roda.
  const diaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()
  return diaSemana === 0 || diaSemana === 6
}
