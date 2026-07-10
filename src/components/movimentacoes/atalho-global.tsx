'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Atalho global `N` (OS-F2 3.7.2): abre "nova movimentação" de qualquer tela
// autenticada, desde que o foco NAO esteja num campo de texto. Nivel unico —
// todo operador logado pode usar.
function editando(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  // combobox/command aberto (cmdk) também conta como "digitando"
  if (el.getAttribute('role') === 'combobox') return true
  return false
}

export function AtalhoGlobalNovaMovimentacao() {
  const router = useRouter()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key !== 'n' && e.key !== 'N') return
      if (editando(e.target)) return
      e.preventDefault()
      router.push('/movimentacoes/nova')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])

  return null
}
