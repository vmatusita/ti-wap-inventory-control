'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { casaBusca, normalizarBusca } from '@/lib/ajuda/busca'

// Busca da documentacao (sem lib, sem indice no bundle): o SERVIDOR ja gravou o
// texto pesquisavel — normalizado — no atributo `data-ajuda-texto` de cada
// resultado. Aqui so filtramos o DOM pela classe .ajuda-oculto. O conteudo
// continua server-rendered (badges reais) e nenhum byte do manual entra no
// bundle do cliente: e o que respeita o TRAP do registry (so-servidor).
//
// A REGRA de casamento nao mora aqui: e `casaBusca` (busca.ts), a MESMA que
// `filtrarIndice` usa do lado do servidor. Antes esta linha reimplementava o
// `includes` a mao e os testes cobriam a outra copia — a que ninguem executa
// (achado da revisao dos 8 commits da F20).
//
// Tres niveis de visibilidade, para a tela nunca ficar com um titulo de
// categoria orfao em cima do nada:
//   [data-ajuda-item]  -> um resultado (card de pagina no indice)
//   [data-ajuda-grupo] -> some quando nenhum item seu sobreviveu
//   [data-ajuda-chip]  -> o chip do sumario que aponta para aquele grupo
export function AjudaBusca({ children }: { children: React.ReactNode }) {
  const [consulta, setConsulta] = useState('')
  const [achados, setAchados] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    // Normaliza UMA vez: `casaBusca` normaliza de novo, e a normalizacao e
    // idempotente — o `alvo` serve para distinguir "consulta vazia" do resto.
    const alvo = normalizarBusca(consulta)
    let visiveis = 0

    root.querySelectorAll<HTMLElement>('[data-ajuda-item]').forEach((item) => {
      const texto = item.getAttribute('data-ajuda-texto') ?? ''
      const bate = casaBusca(texto, alvo)
      item.classList.toggle('ajuda-oculto', !bate)
      if (bate) visiveis += 1
    })

    root.querySelectorAll<HTMLElement>('[data-ajuda-grupo]').forEach((grupo) => {
      const algum = grupo.querySelector('[data-ajuda-item]:not(.ajuda-oculto)') !== null
      grupo.classList.toggle('ajuda-oculto', !algum)
      const chave = grupo.getAttribute('data-ajuda-grupo')
      const chip = chave
        ? root.ownerDocument.querySelector<HTMLElement>(`[data-ajuda-chip="${CSS.escape(chave)}"]`)
        : null
      chip?.classList.toggle('ajuda-oculto', !algum)
    })

    const vazio = root.querySelector<HTMLElement>('[data-ajuda-vazio]')
    if (vazio) vazio.hidden = !(alvo !== '' && visiveis === 0)
    setAchados(alvo === '' ? null : visiveis)
  }, [consulta])

  return (
    <div className="space-y-6">
      <style>{`.ajuda-oculto{display:none !important}`}</style>
      <div className="max-w-md space-y-1 print:hidden">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Buscar na documentação (ex.: manutenção, termo, atrelar)…"
            aria-label="Buscar na documentação"
            className="h-9 w-full rounded-md border bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
          {achados === null
            ? ''
            : achados === 1
              ? '1 resultado'
              : `${achados} resultados`}
        </p>
      </div>
      <div ref={containerRef}>{children}</div>
    </div>
  )
}
