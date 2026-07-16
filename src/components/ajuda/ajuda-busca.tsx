'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { normalizarBusca } from '@/lib/ajuda/busca'

// Busca client-side simples (sem lib): o servidor ja gravou o texto pesquisavel
// (normalizado) no atributo data-ajuda-texto de cada <section>. Aqui so filtramos
// o DOM — mostrando/ocultando secoes e os chips do sumario — pela classe
// .ajuda-oculto. As secoes continuam server-rendered (badges reais), este wrapper
// so acrescenta interatividade sobre os children.
export function AjudaBusca({ children }: { children: React.ReactNode }) {
  const [consulta, setConsulta] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const alvo = normalizarBusca(consulta)
    let visiveis = 0

    root.querySelectorAll<HTMLElement>('[data-ajuda-secao]').forEach((sec) => {
      const texto = sec.getAttribute('data-ajuda-texto') ?? ''
      const bate = alvo === '' || texto.includes(alvo)
      sec.classList.toggle('ajuda-oculto', !bate)
      const chip = root.querySelector<HTMLElement>(`[data-ajuda-chip="${sec.id}"]`)
      chip?.classList.toggle('ajuda-oculto', !bate)
      if (bate) visiveis += 1
    })

    const vazio = root.querySelector<HTMLElement>('[data-ajuda-vazio]')
    if (vazio) vazio.hidden = !(alvo !== '' && visiveis === 0)
  }, [consulta])

  return (
    <div className="space-y-6">
      <style>{`.ajuda-oculto{display:none !important}`}</style>
      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Buscar no manual (ex.: manutenção, termo, atrelar)…"
          aria-label="Buscar no manual"
          className="h-9 w-full rounded-md border bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div ref={containerRef}>{children}</div>
    </div>
  )
}
