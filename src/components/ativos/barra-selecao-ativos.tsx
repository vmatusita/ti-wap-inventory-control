'use client'

import { ArrowLeftRight, Copy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// ATV-03 (F30) — a barra que aparece quando há ativos selecionados na lista.
//
// STICKY no rodapé, e não fixa no topo da tabela como a da fila de pendências: a
// lista tem até 100 linhas e o operador marca a 40ª rolando a página. É o mesmo
// aprendizado do MC-01 da análise (feedback onde o clique acontece) e a mesma
// mecânica de `pendencias/mesa-conflitos.tsx` — inclusive o espaçador, que impede
// a barra de cobrir as últimas linhas.
//
// Precisa ser IRMÃ do `div.overflow-hidden` da tabela: `position: sticky` não
// funciona dentro de um ancestral com `overflow: hidden`.
//
// Componente de apresentação — quem sabe o que é "movimentar" é a tabela.
export function BarraSelecaoAtivos({
  quantidade,
  onMovimentar,
  onCopiar,
  onLimpar,
}: {
  quantidade: number
  onMovimentar: () => void
  onCopiar: () => void
  onLimpar: () => void
}) {
  if (quantidade === 0) return null
  return (
    <>
      {/* Sem isto a barra cobre as últimas linhas quando ela está grudada. */}
      <div aria-hidden className="h-16" />
      {/* F40 — a moldura vem do `Card` (uma moldura só no produto), com três
          ajustes que a barra exige e que nada mais exige:
          · `border ring-0` — o kit desenha o traço com `ring-1 ring-foreground/10`
            e esta barra desenhava com `border`, que herda `border-border`. Os dois
            cinzas são parecidos e não são iguais.
          · `bg-background` em vez do `bg-card`: a barra flutua SOBRE a lista e
            precisa ser opaca contra o fundo da página, não contra o cartão.
          · o `pb-[max(0.75rem,env(safe-area-inset-bottom))]` fica — é o "queixo"
            do celular, não um passo de espaçamento, e a regra 4 do teste de
            consistência abre exceção nominal e ESTRUTURAL para essa forma.

          ⚠ NÃO PONHA `py-0` AQUI. `p-3` sozinho já apaga o `py-(--card-spacing)`
          do kit (o `cn()` usa tailwind-merge, e `p-` conflita com `py-`);
          acrescentar `py-0` depois ZERA o respiro vertical, e a barra fica com o
          texto colado nas bordas. Foi assim em todos os nove cartões do piloto
          até a revisão adversarial pegar.

          O `overflow-hidden` que o `Card` traz não atrapalha: quem não pode ter
          ancestral com `overflow` é a PRÓPRIA barra sticky, e ela é o Card. */}
      <Card
        // `role="region"` + rótulo: para o leitor de tela a barra é um bloco
        // novo que apareceu longe do foco, não um pedaço solto da tabela.
        role="region"
        aria-label="Ações dos ativos selecionados"
        className="sticky bottom-0 z-20 flex flex-row flex-wrap items-center justify-between gap-3 border bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.12)] ring-0 print:hidden"
      >
        {/* `aria-live` porque o número muda sem que nada receba foco — quem usa
            leitor de tela precisa ouvir a contagem subir a cada caixa marcada. */}
        <p className="text-sm" aria-live="polite">
          <strong className="tabular-nums">{quantidade.toLocaleString('pt-BR')}</strong>{' '}
          {quantidade === 1 ? 'ativo selecionado' : 'ativos selecionados'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={onMovimentar}
            className="h-10 gap-2 sm:h-9"
          >
            <ArrowLeftRight className="size-4" aria-hidden />
            Movimentar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCopiar}
            className="h-10 gap-2 sm:h-9"
          >
            <Copy className="size-4" aria-hidden />
            Copiar patrimônios
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onLimpar}
            className="h-10 gap-2 sm:h-9"
          >
            <X className="size-4" aria-hidden />
            Limpar seleção
          </Button>
        </div>
      </Card>
    </>
  )
}
