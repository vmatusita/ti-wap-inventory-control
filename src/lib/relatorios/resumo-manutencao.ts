import { manutencaoEmAlerta, MANUTENCAO_ALERTA_DIAS } from '@/lib/relatorios/manutencao-alerta'
import type { ManutencaoCaso } from '@/lib/relatorios/tipos'

// RV-19b (análise §2): o subtítulo do card "Em manutenção, caso a caso" dizia só a
// CONTAGEM ("14 caso(s) — envio, anotações e retorno") — o leitor tinha de abrir os
// cards um a um para saber se havia risco. Este resumo devolve o tamanho do
// problema de cara: quantos casos, quantos em alerta, quantos já se resolveram no
// período — o leitor decide SE abre os cards sabendo o que vai encontrar lá dentro.

type CasoParaResumo = Pick<ManutencaoCaso, 'fechado' | 'diasEmManutencao' | 'desfecho'>

function numeroPt(n: number): string {
  return n.toLocaleString('pt-BR')
}

// "Encerrado no período" = `fechado === true` — e ISSO INCLUI `devolvido_fornecedor`.
// O campo já documenta a própria semântica (`ManutencaoCaso.fechado`: "true = caso
// encerrado no período (retorno OU devolvido)"); em `corDoCaso` (legendas.ts) o
// `desfecho` só decide a COR do badge do caso já encerrado (slate p/ devolvido,
// green p/ retorno) — ele nunca reabre um caso fechado nem tira alguém do universo
// "encerrado". Testar `desfecho` aqui, além de `fechado`, duplicaria uma regra que
// já vive no tipo e divergiria da legenda se um dia surgir um 3º desfecho.
function encerradoNoPeriodo(c: CasoParaResumo): boolean {
  return c.fechado
}

/**
 * Resumo de risco do card de manutenção: total de casos, quantos estão em alerta
 * (parados há `MANUTENCAO_ALERTA_DIAS`+ dias, ver manutencao-alerta.ts) e quantos
 * foram encerrados no período — juntos por `·`, cada parte ausente quando é zero
 * (sem alerta ou sem encerrado, a parte simplesmente não aparece — não fica
 * "0 em alerta" poluindo o subtítulo). Sem nenhum caso, devolve uma frase honesta
 * no MESMO registro (minúsculo, sem ponto final) dos demais `subtitulo` de card em
 * corpo-relatorio-v2.tsx — este texto é usado ali, direto, sem reformatação.
 */
export function resumoRiscoManutencao(casos: readonly CasoParaResumo[]): string {
  const total = casos.length
  if (total === 0) return 'nenhum caso em manutenção no período'

  const emAlerta = casos.filter(manutencaoEmAlerta).length
  const encerrados = casos.filter(encerradoNoPeriodo).length

  const partes = [`${numeroPt(total)} ${total === 1 ? 'caso' : 'casos'}`]
  if (emAlerta > 0) {
    partes.push(`${numeroPt(emAlerta)} em alerta (${MANUTENCAO_ALERTA_DIAS}+ dias)`)
  }
  if (encerrados > 0) {
    partes.push(`${numeroPt(encerrados)} encerrado${encerrados === 1 ? '' : 's'} no período`)
  }
  return partes.join(' · ')
}
