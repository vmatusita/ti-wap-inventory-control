'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AtalhosDialog } from '@/components/layout/atalhos-dialog'
import { useSidebarColapso } from '@/components/layout/sidebar-colapso'

// Atalhos globais de teclado do shell do OPERADOR (montados so no ramo do
// operador do `(app)/layout.tsx` — o visualizador por senha nao tem atalho
// nenhum):
//   `N` -> nova movimentacao (OS-F2 3.7.2) — SÓ para quem escreve (F21)
//   `?` -> quadro de atalhos (F29/UXG-10d; antes NAVEGAVA para /ajuda, tirando o
//          operador da tela em que estava por causa de uma dúvida de uma tecla)
//   `[` -> recolhe/expande a sidebar (F30/UXG-13). Fica AQUI, e não dentro da
//          própria sidebar, para os atalhos globais continuarem todos num
//          arquivo só — e para reusar as mesmas duas guardas, em vez de uma
//          terceira nocao de "o usuario esta digitando".
// Todos so disparam com o foco FORA de um campo de texto.
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

// Segunda guarda, no ESTADO da tela em vez do elemento focado. `editando` so
// olha `e.target`, entao bastava o foco cair num botao (o "Cancelar" que o
// estorno foca de proposito), no container do dialogo ou no body para o `N`/`?`
// dispararem POR TRAS de um modal aberto — o dialogo desmontava e o texto ja
// digitado se perdia. O Radix portaliza o conteudo em `document.body` e so
// intercepta Escape, entao o keydown chega a `window` normalmente; quem precisa
// se calar e o atalho.
//
// Deteccao: o Radix marca o conteudo com `data-state="open"` e o desmonta ao
// fechar, entao o seletor nao pega dialogo fechado nem sobra durante a animacao
// de saida. Os `data-slot` sao os das duas familias de overlay MODAL do projeto
// (`ui/dialog.tsx` e `ui/sheet.tsx`); popover/dropdown ficam de fora de
// proposito — nao cobrem a tela, nao seguram trabalho em andamento e seus
// campos de texto ja caem na guarda `editando`.
export function modalAberto(): boolean {
  if (typeof document === 'undefined') return false
  return (
    document.querySelector(
      '[data-slot="dialog-content"][data-state="open"],[data-slot="sheet-content"][data-state="open"]',
    ) !== null
  )
}

// F21 — `novaMovimentacao` (cargo ≥ operador, resolvido no `(app)/layout.tsx`)
// liga/desliga o `N`. Para o cargo Consulta a tecla fica INERTE em vez de levar a
// um formulário que a action recusaria; `?` continua valendo para todos.
export function AtalhosGlobais({
  novaMovimentacao = false,
}: {
  novaMovimentacao?: boolean
}) {
  const router = useRouter()
  const [atalhosAbertos, setAtalhosAbertos] = useState(false)
  // F30/UXG-13 — fora do provider (nenhum caso hoje) o contexto devolve um
  // `alternar` que não faz nada: a tecla fica inerte, nada quebra.
  const { alternar: alternarSidebar } = useSidebarColapso()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat) return
      // Só Ctrl/Meta/Alt desqualificam. Shift NAO entra na guarda: na maioria
      // dos layouts o `?` so existe com Shift pressionado — barrar shiftKey
      // mataria o atalho. Por isso tambem se compara `e.key` (o caractere
      // produzido) e nunca `e.code` (a tecla fisica, que muda de layout).
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (editando(e.target)) return
      // Modal aberto = o operador esta no meio de outra tarefa: navegar para
      // fora por causa de uma tecla solta destroi o que ele digitou.
      if (modalAberto()) return

      if (e.key === 'n' || e.key === 'N') {
        if (!novaMovimentacao) return
        e.preventDefault()
        router.push('/movimentacoes/nova')
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        // A guarda `modalAberto()` acima já garante que este quadro não abre por
        // cima de outro dialogo — inclusive dele mesmo.
        setAtalhosAbertos(true)
        return
      }
      // F30/UXG-13 — recolher/expandir a sidebar. Vale para TODOS os cargos
      // (inclusive Consulta): é ergonomia de leitura, nao uma tecla que escreve.
      // No celular a sidebar nem existe (`hidden md:block`), entao a tecla
      // alterna uma preferencia invisivel — inofensivo, e mantem a escolha
      // pronta para quando a mesma conta abrir no desktop.
      if (e.key === '[') {
        e.preventDefault()
        alternarSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router, novaMovimentacao, alternarSidebar])

  return (
    <AtalhosDialog
      aberto={atalhosAbertos}
      onOpenChange={setAtalhosAbertos}
      mostrarNovaMovimentacao={novaMovimentacao}
    />
  )
}
