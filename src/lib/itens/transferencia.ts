// Transferência de item por quantidade entre filiais (F31 · ITN-01).
//
// POR QUE ESTE MÓDULO EXISTE, e por que os textos moram AQUI e não no SQL.
//
// A transferência é gravada como um PAR DE AJUSTES — `−N` na origem e `+N` no
// destino — pela RPC `transferir_item` (migration 0104). O par é a única forma
// que mexe no estoque dos dois lados e deixa o **Total consolidado inalterado**:
// no trigger `valida_lancamento_item` (0015→0027) o total é
// `Σ(entrada) + Σ(ajuste)`, então `−N + N = 0`. O caminho "intuitivo"
// (Liberação na origem + Entrada no destino) infla o Total da origem PARA
// SEMPRE, porque `saida` baixa o estoque e não toca o total (`dominio.ts`).
//
// As duas observações cruzadas são compostas AQUI, em TypeScript, e viajam
// prontas para a RPC como dois parâmetros de texto. A alternativa — redigir as
// frases dentro da função plpgsql — obrigaria a repeti-las em TypeScript para
// o selo do histórico saber reconhecê-las: duas cópias da mesma string, em
// linguagens diferentes, que divergem no primeiro `create or replace`. Com uma
// definição só, o teste puro a trava e o SQL não redige texto nenhum.
//
// Módulo PURO (sem React, sem Supabase): serve ao servidor (a action compõe) e
// ao cliente (o histórico deriva o selo).

import type { TipoLancamento } from '@/lib/dominio'

/** Prefixo da perna que SAI (o ajuste negativo, na filial de origem). */
export const PREFIXO_TRANSFERENCIA_SAIDA = 'Transferência para '
/** Prefixo da perna que ENTRA (o ajuste positivo, na filial de destino). */
export const PREFIXO_TRANSFERENCIA_ENTRADA = 'Transferência de '

/** Separador entre a frase automática e a observação do operador. */
const SEPARADOR = ' — '

export type ObservacoesTransferencia = { origem: string; destino: string }

/**
 * As duas observações cruzadas de uma transferência.
 *
 * A frase automática vem primeiro e é obrigatória — é ela que satisfaz o CHECK
 * `lanc_item_ajuste_obs` (ajuste exige observação não vazia) e que o selo do
 * histórico reconhece. A observação do operador, quando existe, entra DEPOIS,
 * separada por travessão; nunca no lugar da frase automática.
 */
export function observacoesDaTransferencia(
  filialOrigem: string,
  filialDestino: string,
  observacao?: string | null,
): ObservacoesTransferencia {
  const extra = (observacao ?? '').trim()
  const sufixo = extra ? `${SEPARADOR}${extra}` : ''
  return {
    origem: `${PREFIXO_TRANSFERENCIA_SAIDA}${filialDestino.trim()}${sufixo}`,
    destino: `${PREFIXO_TRANSFERENCIA_ENTRADA}${filialOrigem.trim()}${sufixo}`,
  }
}

export type PernaTransferencia = 'saida' | 'entrada'

/**
 * Esta linha do histórico é perna de transferência? Devolve de QUAL lado, ou
 * `null`.
 *
 * ⚠ É derivação de APRESENTAÇÃO, não dado: no banco as duas pernas são ajustes
 * comuns, e nenhuma contagem de relatório muda por causa deste selo. A leitura
 * é do prefixo canônico, que só a `transferirItens` escreve — um ajuste que o
 * operador digitasse com esse texto à mão também acenderia o selo, e tudo bem:
 * o selo diz "isto se parece com uma transferência", não "isto é um registro
 * de tipo transferência" (que não existe no enum, por decisão da análise).
 *
 * Só `tipo === 'ajuste'` é considerado: é o único tipo que a transferência
 * grava, e restringir evita acender o selo numa Entrada cuja observação alguém
 * copiou e colou.
 */
export function ehPernaDeTransferencia(
  tipo: TipoLancamento | string | null | undefined,
  observacao: string | null | undefined,
): PernaTransferencia | null {
  if (tipo !== 'ajuste') return null
  const obs = (observacao ?? '').trimStart()
  if (obs.startsWith(PREFIXO_TRANSFERENCIA_SAIDA)) return 'saida'
  if (obs.startsWith(PREFIXO_TRANSFERENCIA_ENTRADA)) return 'entrada'
  return null
}

/** Rótulo curto do selo, por lado. */
export const ROTULO_PERNA_TRANSFERENCIA: Readonly<Record<PernaTransferencia, string>> = {
  saida: 'transferência (saiu)',
  entrada: 'transferência (entrou)',
}

// O aviso do diálogo de estorno quando a linha é perna de transferência
// (decisão §1.6 do PLAN-F31: AVISAR, não bloquear).
//
// Estornar uma perna sozinha grava o inverso NA MESMA FILIAL — ou seja, devolve
// N ao Total consolidado e deixa a transferência pela metade: é exatamente a
// corrupção que o recurso existe para impedir. Bloquear só na tela seria uma
// garantia de mentira (a regra viveria fora do Postgres, e travar no banco
// exigiria mexer em constraint de tabela existente, fora do escopo da F31).
// Então a tela diz a verdade inteira e aponta o caminho certo.
export const AVISO_ESTORNO_PERNA_TRANSFERENCIA =
  'Este lançamento é uma das duas pernas de uma transferência entre filiais. Estornar desfaz só ESTE lado: o outro continua como está e o total consolidado do item muda. Para desfazer a transferência inteira, faça a transferência no sentido contrário.'

/**
 * Saldo insuficiente na origem? Devolve a mensagem da linha ou `null`.
 *
 * Segunda linha, como sempre: quem recusa de verdade é o trigger, sob a trava
 * da transação. Aqui é para o operador não montar o carrinho inteiro e só
 * descobrir no envio. `saldo` ausente (leitura falhou, ou ainda carregando) não
 * acusa nada — nunca se recusa por um número que não se tem.
 */
export function erroQuantidadeAcimaDoSaldo(
  quantidade: number,
  saldo: number | null | undefined,
): string | null {
  if (saldo == null || !Number.isFinite(saldo)) return null
  if (!Number.isFinite(quantidade) || quantidade <= 0) return null
  if (quantidade <= saldo) return null
  return `Só há ${saldo.toLocaleString('pt-BR')} na filial de origem.`
}
