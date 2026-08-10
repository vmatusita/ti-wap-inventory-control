'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { carimboAtualizado } from '@/lib/relatorios/carimbo-hora'

// Tempo real p/ OPERADOR logado (OS-F3 3.4 / F3B 3.10.4): assina INSERTs em
// `movimentacoes`, `lancamentos_item` e `anotacoes` (Supabase Realtime) e faz
// `router.refresh()` com debounce de 2s + badge "atualizado agora". Fallback:
// refetch ao focar a aba. A página segue 100% funcional sem WebSocket. Sessões
// por senha usam ViewerAutoRefresh (não abrem canal — não têm credencial).
export function RealtimeRefresh() {
  const router = useRouter()
  const [atualizado, setAtualizado] = useState(false)
  // RV-16 — carimbo nasce VAZIO de propósito: o servidor não tem "agora do
  // cliente" (o HTML sai do SSR antes de chegar na tela de ninguém), então
  // calcular a hora já no primeiro render divergiria entre servidor e cliente
  // — erro de hidratação no React 19 ("texto do servidor não bate com o do
  // cliente"). O padrão da casa é nascer vazio e só preencher dentro do
  // efeito abaixo (que só roda no navegador, depois do mount): servidor e
  // primeiro render do cliente concordam em "nada visível ainda".
  const [carimbo, setCarimbo] = useState('')

  useEffect(() => {
    // RV-16 — não é enfeite: é o padrão da casa pra não chamar `setState`
    // direto no CORPO do efeito (`react-hooks/set-state-in-effect`; mesmo
    // recurso de `conferencia-estoque.tsx`/`ativo-combobox.tsx`). O timer de
    // 0ms empurra a chamada para dentro de um CALLBACK — o efeito em si só
    // agenda, quem muda o estado é o timer, e o lint para de ver render em
    // cascata síncrono.
    const tCarimbo = setTimeout(() => setCarimbo(carimboAtualizado(Date.now())), 0)

    const supabase = createClient()
    let debounce: ReturnType<typeof setTimeout> | null = null
    let flash: ReturnType<typeof setTimeout> | null = null

    const aoMudar = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        router.refresh()
        setAtualizado(true)
        setCarimbo(carimboAtualizado(Date.now()))
        if (flash) clearTimeout(flash)
        flash = setTimeout(() => setAtualizado(false), 3000)
      }, 2000)
    }

    const canal = supabase
      .channel('relatorio-tempo-real')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movimentacoes' }, aoMudar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lancamentos_item' }, aoMudar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'anotacoes' }, aoMudar)
      .subscribe()

    // RV-16 — o fallback de foco também é um refresh de verdade (o operador
    // volta pra aba e vê dado novo); o carimbo acompanha, senão "atualizado
    // às" ficaria parado com o conteúdo já trocado.
    const onFocus = () => {
      router.refresh()
      setCarimbo(carimboAtualizado(Date.now()))
    }
    window.addEventListener('focus', onFocus)

    return () => {
      clearTimeout(tCarimbo)
      if (debounce) clearTimeout(debounce)
      if (flash) clearTimeout(flash)
      window.removeEventListener('focus', onFocus)
      supabase.removeChannel(canal)
    }
  }, [router])

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {/* UXG-08c/F27 — `motion-reduce:animate-none` no ping (quem pediu menos
          movimento no SO não via o pulso parar) e par `dark:` no verde (era o
          único bg-green-500 do app sem variante escura). */}
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-2 animate-ping rounded-full bg-green-500 opacity-60 motion-reduce:animate-none dark:bg-green-400" />
        <span className="relative inline-flex size-2 rounded-full bg-green-500 dark:bg-green-400" />
      </span>
      {atualizado ? 'atualizado agora' : 'ao vivo'}
      {/* RV-16 — texto PERSISTENTE (não `title`): o carimbo de frescor precisa
          chegar a quem navega por teclado/toque, que não vê hover. Sem
          `print:hidden` de propósito — o papel também responde "de quando é
          isto?" (hoje só o período saía). Vazio no SSR e no primeiro instante
          do cliente: não renderiza nada até o efeito acima rodar. */}
      {carimbo && <span>· {carimbo}</span>}
    </span>
  )
}
