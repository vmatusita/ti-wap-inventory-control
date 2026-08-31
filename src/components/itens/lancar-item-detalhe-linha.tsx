'use client'

import { Button } from '@/components/ui/button'
import type { LinhaCarrinho } from '@/components/itens/carrinho-linhas'
import {
  avisoQuantidadeInvalida,
  previewEstoque,
  textoPreview,
} from '@/lib/itens/efeito-lancamento'
import { avisoDeRegularizacao, partirQuantidade } from '@/lib/itens/regularizacao'
import {
  ROTULO_ACRESCENTAR,
  ROTULO_BAIXAR,
  aplicarSinal,
  sentidoDeQuantidade,
} from '@/lib/itens/sinal-ajuste'
import type { SaldosDaFilial } from '@/lib/actions/itens'
import type { TipoLancamento } from '@/lib/dominio'
import { cn } from '@/lib/utils'

// O QUE APARECE SOB CADA LINHA DO CARRINHO DE LANÇAMENTO (F42 · frente C).
//
// Três coisas, e nesta ordem:
//  1. o alternador de sinal do Ajuste (ITN-05b);
//  2. a prévia do efeito no estoque (19/08/2026) — "Estoque na filial: 14 → 12";
//  3. **a prévia da regularização** — "1 item entrou no estoque por acerto
//     automático", ANTES de gravar (F42, usando a função pura da F41).
//
// Só o lançamento tem isto; a transferência divide o carrinho e não divide este
// bloco, por isso ele é um componente e não parte de `carrinho-linhas.tsx`.

export function LancarItemDetalheLinha({
  linha,
  indice,
  tipo,
  saldos,
  exigeSinal,
  desabilitado,
  onQuantidade,
}: {
  linha: LinhaCarrinho
  indice: number
  tipo: TipoLancamento | null
  /** O par `{ estoque, emUso }` da filial escolhida, por item. */
  saldos: SaldosDaFilial
  /** `tipo === 'ajuste'` — só ali o sinal é escolhido por botão. */
  exigeSinal: boolean
  desabilitado: boolean
  onQuantidade: (valor: string) => void
}) {
  const quantidadeNum = linha.quantidade === '' ? 0 : Number(linha.quantidade)

  // Prévia do efeito (19/08/2026): item + quantidade + tipo + saldo carregado →
  // "Estoque na filial: 14 → 12". `null` = calada (nada digitado, saldo ainda
  // carregando, quantidade inválida) — a validação fala por ela nesses casos.
  const previa =
    tipo && linha.itemId != null
      ? previewEstoque(tipo, quantidadeNum, saldos.estoque[linha.itemId])
      : null

  // 19/08/2026 (revisão) — achado 14: fora do Ajuste, uma quantidade negativa fazia
  // `previewEstoque` devolver `null` e a prévia visível sumia SEM explicação; o erro
  // só aparecia no envio, pelo Zod. Este aviso cobre o buraco, e é mutuamente
  // exclusivo com `previa` por construção.
  const aviso = tipo ? avisoQuantidadeInvalida(tipo, quantidadeNum) : null

  // F42 — A PRÉVIA DA REGULARIZAÇÃO, ANTES DE GRAVAR.
  //
  // `partirQuantidade` é a MESMA função pura que a RPC `0126` espelha expressão por
  // expressão (F41). Escrever uma segunda conta aqui seria pior que não ter prévia:
  // ela prometeria uma coisa e o banco gravaria outra — e quem tem razão, diz o
  // cabeçalho de `regularizacao.ts`, é sempre a RPC.
  //
  // Só `saida` e `retorno` particionam; qualquer outro tipo devolve
  // `regularizacao: 0` e nada é desenhado. É por isso que a devolução precisa de
  // `emUso` (o que está com as pessoas) e não do estoque — os dois saem da MESMA
  // leitura de saldo, sem uma chamada a mais.
  const acerto =
    tipo && linha.itemId != null && quantidadeNum > 0
      ? partirQuantidade(tipo, quantidadeNum, {
          emEstoque: saldos.estoque[linha.itemId] ?? 0,
          emUso: saldos.emUso[linha.itemId] ?? 0,
        }).regularizacao
      : 0
  const textoAcerto = avisoDeRegularizacao(acerto, 1)

  const sentido = sentidoDeQuantidade(linha.quantidade)

  return (
    <>
      {/* ITN-05b — alternador por linha: aplica o sinal sobre o módulo já digitado,
          sem exigir a tecla de menos (o teclado numérico do iOS não a tem). Estado
          default "+ Acrescentar" (`sentidoDeQuantidade('')`). */}
      {exigeSinal && (
        <div
          role="group"
          aria-label={`Sinal do ajuste do item ${indice + 1}`}
          className="flex gap-1.5 pl-1"
        >
          <Button
            type="button"
            size="sm"
            variant={sentido === 'positivo' ? 'default' : 'outline'}
            aria-pressed={sentido === 'positivo'}
            className="min-h-10 flex-1 sm:min-h-8"
            onClick={() => onQuantidade(aplicarSinal(linha.quantidade, 'positivo'))}
            disabled={desabilitado}
          >
            {ROTULO_ACRESCENTAR}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={sentido === 'negativo' ? 'default' : 'outline'}
            aria-pressed={sentido === 'negativo'}
            className="min-h-10 flex-1 sm:min-h-8"
            onClick={() => onQuantidade(aplicarSinal(linha.quantidade, 'negativo'))}
            disabled={desabilitado}
          >
            {ROTULO_BAIXAR}
          </Button>
        </div>
      )}
      {previa && (
        <p
          className={cn(
            'pl-1 text-xs tabular-nums',
            previa.recusado ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
          )}
        >
          {textoPreview(previa)}
        </p>
      )}
      {/* achado 14 — mesmo tom e layout do `recusado` acima, no mesmo lugar onde a
          prévia sumia calada. */}
      {!previa && aviso && (
        <p className="pl-1 text-xs text-amber-700 dark:text-amber-400">{aviso}</p>
      )}
      {textoAcerto && (
        <p className="pl-1 text-xs text-amber-700 dark:text-amber-400">{textoAcerto}</p>
      )}
    </>
  )
}
