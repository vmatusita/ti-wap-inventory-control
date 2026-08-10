'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { NavRolavel } from '@/components/layout/nav-rolavel'
import { cn } from '@/lib/utils'
import { montarChipsAncora, type ContagensAncora } from '@/components/relatorios/ancora-contagem'

export type { ContagensAncora }

// Chips-âncora fixos no topo ao rolar (§4): o relatório fica longo com 3 grupos.
// Links de âncora (as seções têm scroll-mt); sticky via CSS, sem JS. Ocultos na
// impressão.
//
// `min-h-10 sm:min-h-0` no chip: no celular ele é alvo de toque e tinha 26px;
// do `sm` para cima volta ao tamanho de hoje (F13/B4-R3). A pilha sticky
// (header 56px + esta nav) passa a 110px no celular — por isso as seções-alvo
// usam `scroll-mt-28` (112px) em vez de `scroll-mt-16`: com 64px o h2 da âncora
// parava ATRÁS desta barra (defeito já existente em todas as larguras, medido
// em scratchpad/f13/c4-chips-antes.txt). A MESMA folga de 112px é o `rootMargin`
// do scroll-spy abaixo — é a mesma barra que "cobre" a seção nos dois casos.
const ROOT_MARGIN = '-112px 0px -60% 0px'

// F32/RV-13 — numa página de 10+ seções a barra não dizia ONDE o leitor está.
// Este componente virou client (era puro <a href> estático) só por isto: o
// resto (chips, número, condicional) é decidido em `montarChipsAncora`, que
// continua uma função pura testável sem DOM.
export function ChipsAncora({ contagens }: { contagens: ContagensAncora }) {
  const chips = useMemo(() => montarChipsAncora(contagens), [contagens])
  const [ativo, setAtivo] = useState<string | null>(null)
  const linksRef = useRef(new Map<string, HTMLAnchorElement>())

  useEffect(() => {
    // Observer nas SEÇÕES, nunca handler de scroll (requisito explícito da
    // ordem — um listener de scroll neste relatório, que passa de 10 seções e
    // tabelas grandes, redesenharia a cada pixel).
    //
    // Nem toda seção do array existe no DOM (`#transferencias`/`#mov-itens`/
    // `#observacao` só quando a contagem manda renderizá-las) — por isso o
    // filtro por `getElementById` != null, e a ausência de um alvo não quebra
    // o observer dos demais.
    const ordem = chips.map((c) => c.href.slice(1))
    const alvos = ordem
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    if (alvos.length === 0) return

    const visiveis = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visiveis.add(entry.target.id)
          else visiveis.delete(entry.target.id)
        }
        // O ativo é o PRIMEIRO da ordem da nav que está no conjunto visível —
        // não o primeiro de `entries` (que só traz quem MUDOU nesta rodada).
        // Conjunto vazio (topo/rodapé da página, nada cruzando a faixa) mantém
        // o último ativo: sem isso o destaque apaga entre seções.
        const primeiraVisivel = ordem.find((id) => visiveis.has(id))
        if (primeiraVisivel) setAtivo(primeiraVisivel)
      },
      { rootMargin: ROOT_MARGIN, threshold: 0 },
    )
    for (const el of alvos) observer.observe(el)
    return () => observer.disconnect()
  }, [chips])

  useEffect(() => {
    if (!ativo) return
    const el = linksRef.current.get(ativo)
    if (!el) return
    // `block/inline: 'nearest'` rola só a NAV horizontal — o erro clássico
    // aqui é `block: 'center'`/padrão, que arrasta a PÁGINA inteira para
    // centralizar o chip toda vez que o scroll-spy muda de seção.
    el.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    })
  }, [ativo])

  return (
    // ⚠ O `sticky` fica no WRAPPER, não no <nav>: um sticky envolvido por um div em
    // fluxo normal gruda dentro de uma caixa da própria altura, ou seja, não gruda.
    <NavRolavel
      className="sticky top-14 z-20 -mx-1 print:hidden"
      navClassName="flex gap-1.5 overflow-x-auto rounded-lg border bg-background/95 px-1 py-1.5 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      rotulo="Seções do relatório"
    >
      {chips.map((c) => {
        const id = c.href.slice(1)
        const estaAtivo = ativo === id
        return (
          <a
            key={c.href}
            ref={(el) => {
              if (el) linksRef.current.set(id, el)
              else linksRef.current.delete(id)
            }}
            href={c.href}
            // "location": é a seção que representa onde o leitor está AGORA
            // dentro desta mesma página — o token da ARIA authoring practices
            // para destaque de sumário/TOC (diferente de "page", que é para
            // apontar em qual PÁGINA do site o usuário está).
            aria-current={estaAtivo ? 'location' : undefined}
            className={cn(
              'flex min-h-10 shrink-0 items-center rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-amarelo hover:text-foreground sm:min-h-0',
              estaAtivo && 'border-brand-amarelo/60 text-foreground',
            )}
          >
            {c.rotulo}
            {/* RV-14 — número sempre atenuado e tabular, mesmo no chip ativo
                (que já ganhou `text-foreground` acima): é contagem, não título. */}
            {c.numero !== undefined && (
              <span className="ml-1 tabular-nums text-muted-foreground">
                · {c.numero.toLocaleString('pt-BR')}
              </span>
            )}
          </a>
        )
      })}
    </NavRolavel>
  )
}
