'use client'

import type { RefObject } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ItemCombobox } from '@/components/itens/item-combobox'
import type { SaldosPorItem } from '@/lib/actions/itens'
import type { ItemCatalogo } from '@/lib/queries/itens'

// O CARRINHO MULTI-LINHA, extraído dos dois diálogos (F42 · frente C).
//
// O mecanismo é o mesmo desde a F10 (I1 do backlog) e estava COPIADO em
// `lancar-item-dialog.tsx` e `transferir-item-dialog.tsx`: mesma forma de linha,
// mesmo combobox, mesmo campo de quantidade, mesmo botão de remover, mesmo
// "Adicionar item" com o mesmo contador `N/máximo`. Duas cópias do mesmo widget é
// como as duas divergem em silêncio.
//
// ⚠ O QUE ESTE COMPONENTE **NÃO** DECIDE, e é de propósito:
//  · o SALDO vem de fora (`saldos`), calculado UMA vez por troca de filial no
//    diálogo pai. Buscar aqui reabriria o defeito de 19/08/2026: "dez linhas, dez
//    leituras iguais".
//  · o que fazer com uma linha que falhou é do `salvar()` de cada diálogo. O
//    lançamento mantém no carrinho só as recusadas; a transferência é tudo ou
//    nada ("meia transferência é pior que nenhuma"). Um componente de linha não
//    pode presumir nenhum dos dois.
//  · o teto de linhas chega por prop. Ele é a MESMA constante nos dois
//    (`MAX_LINHAS_TRANSFERENCIA_ITEM = MAX_LINHAS_LOTE_ITEM`), e continuará sendo
//    porque quem a define é `validators/item.ts`, não este arquivo.
//
// ⚠ A CHAVE É `uid`, NUNCA O ÍNDICE. Remover uma linha do meio com chave por
// índice remontaria todas as seguintes — e o campo em foco perderia o foco no
// meio da digitação. O comentário original que fixou isso está em
// `lancar-item-dialog.tsx`.
//
// ⚠ O `ref` da PRIMEIRA linha vem de fora (`refPrimeiraQuantidade`): o preset da
// paleta e o "+" da linha do saldo abrem o diálogo já com o item escolhido e
// mandam o foco direto para a quantidade. É acessibilidade deliberada, não enfeite.

export type LinhaCarrinho = {
  uid: number
  itemId: number | null
  quantidade: string
  erro?: string
}

export function CarrinhoLinhas({
  linhas,
  catalogo,
  saldos,
  maximo,
  desabilitado,
  podeCriarItem,
  refPrimeiraQuantidade,
  rotulo = 'Itens',
  ondeAcessivel,
  placeholderQuantidade = '10',
  valorDaQuantidade,
  onQuantidade,
  onItem,
  onRemover,
  onAdicionar,
  onItemCriado,
  abaixoDaLinha,
}: {
  linhas: LinhaCarrinho[]
  catalogo: ItemCatalogo[]
  saldos: SaldosPorItem
  maximo: number
  desabilitado: boolean
  podeCriarItem: boolean
  refPrimeiraQuantidade?: RefObject<HTMLInputElement | null>
  rotulo?: string
  /** Completa o rótulo acessível: "Item 1 do lançamento" / "…da transferência". */
  ondeAcessivel: string
  placeholderQuantidade?: string
  /**
   * O que o campo MOSTRA. Existe por causa do Ajuste (ITN-05b): lá o campo recebe
   * só o MÓDULO, porque o teclado numérico do iOS não tem tecla de menos e o
   * sinal vira um alternador. Sem esta porta, o alternador teria de morar aqui —
   * e a transferência, que nunca tem sinal negativo, carregaria a regra do Ajuste.
   */
  valorDaQuantidade?: (linha: LinhaCarrinho) => string
  onQuantidade: (uid: number, valor: string) => void
  onItem: (uid: number, itemId: number | null) => void
  onRemover: (uid: number) => void
  onAdicionar: () => void
  onItemCriado: (item: ItemCatalogo) => void
  /** O que cada diálogo desenha sob a linha: prévia, avisos, o alternador de sinal. */
  abaixoDaLinha?: (linha: LinhaCarrinho, indice: number) => React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{rotulo}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {linhas.length}/{maximo}
        </span>
      </div>
      {linhas.map((l, i) => (
        <div key={l.uid} className="space-y-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <ItemCombobox
                itens={catalogo}
                valor={l.itemId}
                onSelecionar={(id) => onItem(l.uid, id)}
                onItemCriado={onItemCriado}
                desabilitado={desabilitado}
                podeCriarItem={podeCriarItem}
                descricaoAcessivel={`Item ${i + 1} ${ondeAcessivel}`}
                saldos={saldos}
              />
            </div>
            <Input
              ref={i === 0 ? refPrimeiraQuantidade : undefined}
              type="number"
              inputMode="numeric"
              aria-label={`Quantidade do item ${i + 1}`}
              className="min-h-10 w-24 shrink-0"
              value={valorDaQuantidade ? valorDaQuantidade(l) : l.quantidade}
              onChange={(e) => onQuantidade(l.uid, e.target.value)}
              placeholder={placeholderQuantidade}
              disabled={desabilitado}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remover o item ${i + 1} ${ondeAcessivel}`}
              className="size-10 shrink-0"
              onClick={() => onRemover(l.uid)}
              disabled={desabilitado || linhas.length <= 1}
            >
              <X className="size-4" />
            </Button>
          </div>
          {abaixoDaLinha?.(l, i)}
          {l.erro && <p className="pl-1 text-xs text-red-600 dark:text-red-400">{l.erro}</p>}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-10 gap-1.5 sm:min-h-0"
          onClick={onAdicionar}
          disabled={desabilitado || linhas.length >= maximo}
        >
          <Plus className="size-3.5" />
          Adicionar item
        </Button>
      </div>
    </div>
  )
}
