'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Atalhos globais de teclado do shell do OPERADOR (montados so no ramo do
// operador do `(app)/layout.tsx` — o visualizador por senha nao tem atalho
// nenhum):
//   `N` -> nova movimentacao (OS-F2 3.7.2)
//   `?` -> /ajuda            (OS-F11 / T3 — fecha o backlog da F6B)
// Ambos so disparam com o foco FORA de um campo de texto. Nivel unico: todo
// operador logado pode usar.
//
// A guarda `editando` e exportada porque a paleta de comandos (Ctrl+K e "/")
// precisa exatamente da mesma nocao de "o usuario esta digitando" — duas
// definicoes divergentes seria bug na certa.
export function editando(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  // combobox/command aberto (cmdk) também conta como "digitando"
  if (el.getAttribute('role') === 'combobox') return true
  return false
}

export function AtalhosGlobais() {
  const router = useRouter()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat) return
      // Só Ctrl/Meta/Alt desqualificam. Shift NAO entra na guarda: na maioria
      // dos layouts o `?` so existe com Shift pressionado — barrar shiftKey
      // mataria o atalho. Por isso tambem se compara `e.key` (o caractere
      // produzido) e nunca `e.code` (a tecla fisica, que muda de layout).
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (editando(e.target)) return

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        router.push('/movimentacoes/nova')
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        router.push('/ajuda')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])

  return null
}
