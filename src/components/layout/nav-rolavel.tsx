'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// F29/UXG-04 — as três fileiras roláveis do app (`filial-tabs`, `admin-nav`,
// `chips-ancora`) escondem a barra de rolagem (`[scrollbar-width:none]` +
// `[&::-webkit-scrollbar]:hidden`) e não sinalizavam nada. Em 360px, "Itens" e
// "Importar" simplesmente NÃO EXISTIAM para quem não adivinhasse que a fileira rola.
//
// O sinal é um degradê em cada borda que ainda tem conteúdo — e é OVERLAY, não
// `mask-image` no próprio elemento: a máscara apagaria também o fundo (a barra de
// chips do relatório é `bg-background/95 backdrop-blur`) e o anel de foco nas pontas.
// Os overlays são `pointer-events-none` e `aria-hidden`: não entram na ordem de
// tabulação nem interceptam clique.
//
// ⚠ `chips-ancora` é `sticky top-14`. Envolver um elemento sticky num <div> em fluxo
// normal MATA o sticky (ele passa a grudar dentro de uma caixa da altura dele mesmo).
// Por isso quem recebe `className` — e portanto o `sticky`/`z`/`print:hidden` — é o
// WRAPPER, e o <nav> rolável fica com `navClassName`.
export function NavRolavel({
  className,
  navClassName,
  rotulo,
  children,
}: {
  /** Classes do WRAPPER (posicionamento: sticky, z-index, print:hidden…). */
  className?: string
  /** Classes do <nav> que ROLA (overflow-x-auto, borda, fundo, gap…). */
  navClassName?: string
  /** `aria-label` do <nav>. */
  rotulo?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  const [bordas, setBordas] = useState({ inicio: false, fim: false })

  const medir = useCallback(() => {
    const el = ref.current
    if (!el) return
    // A folga de 1px absorve o arredondamento subpixel do zoom do navegador, que
    // deixaria o degradê da direita aceso para sempre numa fileira que já acabou.
    const inicio = el.scrollLeft > 1
    const fim = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setBordas((antes) =>
      antes.inicio === inicio && antes.fim === fim ? antes : { inicio, fim },
    )
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    medir()
    el.addEventListener('scroll', medir, { passive: true })
    // O conteúdo muda sem rolagem nenhuma: filial nova na lista, chip condicional que
    // aparece, o próprio giro do celular. Sem observar, o degradê congelaria no
    // estado da primeira medição.
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    for (const filho of Array.from(el.children)) ro.observe(filho)
    return () => {
      el.removeEventListener('scroll', medir)
      ro.disconnect()
    }
  }, [medir])

  return (
    <div className={cn('relative', className)}>
      <nav ref={ref} aria-label={rotulo} className={navClassName}>
        {children}
      </nav>
      {bordas.inicio && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent"
        />
      )}
      {bordas.fim && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent"
        />
      )}
    </div>
  )
}
