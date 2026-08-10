import { addDays, format, getDay, parseISO } from 'date-fns'
import { ddMM } from '@/lib/relatorios/janela-card'
import type { Periodo } from '@/lib/relatorios/periodo'
import type { PontoEstado } from '@/lib/relatorios/tipos'

// F32/RV-06 — a régua da "Evolução do estoque", a forma que faltava na página.
//
// O relatório responde "quanto saiu/entrou no período" (a série de movimentações)
// e "como está no fim do período" (KPIs e empilhadas), mas não respondia "para
// onde a prateleira está indo". O Δ dos KPIs dá a tendência de UMA janela; esta
// série dá a curva.
//
// A restrição que dita todo o desenho: **sem migration e sem RPC nova**. O estado
// as-of de uma data só existe via `rel_estoque_asof`, que reconstrói a linha do
// tempo inteira e mede ~233 ms na consolidada. Um ponto por semana custa uma
// chamada. Daí o TETO DURO de leituras por render — não é número mágico: é o
// orçamento que a página aguenta com as leituras que ela já faz, disparadas em
// paralelo (ver o comentário de `maxDuration` em relatorios/[filial]/page.tsx).
//
// F32-pós (revisão de custo, ACHADO 7): o teto nasceu em 8 semanas (9 leituras
// por render) e caiu para 6 semanas depois que a rota ao vivo passou a ser
// revalidada sozinha a cada 60s pelo viewer por senha (ViewerAutoRefresh) — 9
// chamadas de `rel_estoque_asof` por request virou caro demais para um card
// decorativo. Somado ao reuso do último ponto (o fim do período já é lido pelo
// chamador para outra coisa — ver `getSerieEstado` em estoque.ts), o pior caso
// real por request caiu de 9 para 6 reconstruções as-of.
//
// ONDE os pontos caem: no fim de cada semana ENCERRADA dentro do período. A
// semana do relatório ao vivo é domingo→sábado (`intervaloDoPreset` em
// periodo.ts, decisão do Johnny de 16/07), então o marco é o SÁBADO. Um sábado
// que caia dentro de [de, ate] é uma semana que fechou dentro da janela lida.
//
// CONSEQUÊNCIA ACEITA E REGISTRADA (docs/DECISOES.md): no preset padrão "Esta
// semana" (7 dias) cabem no máximo 1 sábado + o fim do período = 2 pontos, abaixo
// do mínimo de 3 — e o card NÃO aparece. É honesto: uma janela de sete dias não
// tem tendência semanal para mostrar, e inventar pontos FORA do período faria o
// card contradizer o chip "período" que todos os outros cards passaram a exibir
// (RV-04). Quem quer a curva troca para "Últimos 30 dias" ou "Este ano".

// Últimas 6 semanas fechadas + o ponto do fim do período = 7 pontos na série,
// mas não 7 leituras as-of: o ponto do fim do período reaproveita a promise que
// `getSnapshotRelatorioV2` já tem em voo (ver `estadoNoFim` em snapshot.ts e o
// bloco DEGRADAÇÃO em `getSerieEstado`), então o pior caso real é 6 chamadas de
// `rel_estoque_asof` por render.
export const MAX_SEMANAS_SERIE_ESTADO = 6
export const MAX_PONTOS_SERIE_ESTADO = MAX_SEMANAS_SERIE_ESTADO + 1
// Dois pontos são um segmento de reta, não uma tendência — e três é o menor
// número em que uma inflexão (subiu, depois desceu) pode aparecer.
export const MIN_PONTOS_SERIE_ESTADO = 3

const SABADO = 6

// As datas a reconstruir, em ordem cronológica. Vazio (ou lista curta demais)
// significa "não renderize o card" — quem decide isso é o chamador, comparando
// com MIN_PONTOS_SERIE_ESTADO.
export function datasDaSerieEstado(periodo: Periodo): string[] {
  if (!periodo?.de || !periodo?.ate || periodo.de > periodo.ate) return []

  const fim = parseISO(periodo.ate)
  const inicio = parseISO(periodo.de)
  if (Number.isNaN(fim.getTime()) || Number.isNaN(inicio.getTime())) return []

  // Primeiro sábado em ou depois de `de`. `getDay()` sobre uma Date de `parseISO`
  // é seguro: `parseISO('2026-08-08')` constrói a data no fuso LOCAL à meia-noite
  // (diferente de `new Date('2026-08-08')`, que interpreta como UTC e pode voltar
  // um dia). É a mesma razão pela qual periodo.ts usa `parseISO` em tudo.
  let cursor = addDays(inicio, (SABADO - getDay(inicio) + 7) % 7)

  const sabados: string[] = []
  while (cursor <= fim) {
    sabados.push(format(cursor, 'yyyy-MM-dd'))
    cursor = addDays(cursor, 7)
  }

  // "Tudo" varre 25 anos de sábados; o que interessa são os últimos.
  const recentes = sabados.slice(-MAX_SEMANAS_SERIE_ESTADO)

  // O fim do período é sempre um ponto — é o número que o resto da página exibe
  // nos KPIs, e a curva tem de terminar nele. Só não se repete quando `ate` já é
  // o último sábado.
  if (recentes[recentes.length - 1] !== periodo.ate) recentes.push(periodo.ate)
  return recentes
}

// O rótulo é gravado PRONTO no snapshot: um snapshot é lido meses depois, e
// recalcular a data ali seria uma chance a mais de o rótulo divergir do ponto.
export function montarPontosEstado(
  datas: readonly string[],
  contagens: readonly number[],
): PontoEstado[] {
  return datas.map((chave, i) => ({
    chave,
    rotulo: ddMM(chave) ?? chave,
    em_estoque: contagens[i] ?? 0,
  }))
}
