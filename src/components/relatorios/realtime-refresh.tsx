'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Tempo real p/ OPERADOR logado (OS-F3 3.4 / F3B 3.10.4): assina INSERTs em
// `movimentacoes`, `lancamentos_item` e `anotacoes` (Supabase Realtime) e faz
// `router.refresh()` com debounce de 2s + badge "atualizado agora". Fallback:
// refetch ao focar a aba. A página segue 100% funcional sem WebSocket. Sessões
// por senha usam ViewerAutoRefresh (não abrem canal — não têm credencial).
export function RealtimeRefresh() {
  const router = useRouter()
  const [atualizado, setAtualizado] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let debounce: ReturnType<typeof setTimeout> | null = null
    let flash: ReturnType<typeof setTimeout> | null = null

    const aoMudar = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        router.refresh()
        setAtualizado(true)
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

    const onFocus = () => router.refresh()
    window.addEventListener('focus', onFocus)

    return () => {
      if (debounce) clearTimeout(debounce)
      if (flash) clearTimeout(flash)
      window.removeEventListener('focus', onFocus)
      supabase.removeChannel(canal)
    }
  }, [router])

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-2 animate-ping rounded-full bg-green-500 opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-green-500" />
      </span>
      {atualizado ? 'atualizado agora' : 'ao vivo'}
    </span>
  )
}
