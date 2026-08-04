'use client'

import { Button } from '@/components/ui/button'
import { hojeISO, ontemISO } from '@/lib/format'

// Atalhos "Hoje/Ontem" ao lado dos campos de data (F9/M10) — a data quase sempre
// e uma dessas duas e digitar dd/mm/aaaa no celular e o gargalo. As datas saem de
// `hojeISO`/`ontemISO` (fuso America/Sao_Paulo), entao nunca estouram o
// `max={hojeISO()}` do input. `type="button"`: nao submete nem interfere no Enter
// que avanca o passo (o handler do form ignora BUTTON). O `after:` estica a area
// de toque para ~44px no mobile sem crescer o botao (alinhado a altura do input).
//
// F26 — extraido de `passo-movimentacao.tsx` para o modulo proprio: a secao da
// contrapartida (troca/upgrade) tem campo de data de termo proprio e precisa dos
// MESMOS chips. Importar de dentro do passo 2 criaria ciclo (o passo 2 e quem
// renderiza a secao).
export function ChipsData({
  campo,
  onEscolher,
}: {
  campo: string
  onEscolher: (iso: string) => void
}) {
  const opcoes = [
    { rotulo: 'Hoje', valor: hojeISO },
    { rotulo: 'Ontem', valor: ontemISO },
  ]
  return (
    <div className="flex shrink-0 gap-1">
      {opcoes.map((o) => (
        <Button
          key={o.rotulo}
          type="button"
          variant="outline"
          onClick={() => onEscolher(o.valor())}
          aria-label={`Preencher ${campo} com ${o.rotulo.toLowerCase()}`}
          className="relative px-3 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
        >
          {o.rotulo}
        </Button>
      ))}
    </div>
  )
}
