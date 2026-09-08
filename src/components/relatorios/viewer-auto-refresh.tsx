'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { carimboAtualizado } from '@/lib/relatorios/carimbo-hora'
import { INTERVALO_REFRESH_MS, deveRefrescar } from './auto-refresh-decisao'

// Atualização automática p/ sessão por SENHA (OS-F3 3.9.5): sem WebSocket
// (visualizador não tem credencial de banco), a página revalida sozinha a cada
// 60s + botão manual. Substitui o realtime do operador.
//
// F50 — o ciclo passou a respeitar a VISIBILIDADE da aba e a coalescer refreshes.
// A regra mora em `./auto-refresh-decisao` (função pura, testada); aqui fica só a
// fiação com o React. Quem está com a aba aberta não percebe diferença: o que
// deixou de acontecer é a rota mais cara do sistema rodar de minuto em minuto numa
// aba esquecida.
export function ViewerAutoRefresh() {
  const router = useRouter()
  const [pending, start] = useTransition()
  // Quando o último refresh saiu. `useRef` e não `useState` de propósito: este valor
  // não pinta nada na tela, e guardá-lo em estado provocaria um render por ciclo
  // só para anotar a hora.
  const ultimoRef = useRef(0)
  // O `pending` do `useTransition` chega ao efeito pela ref, não pela lista de
  // dependências: pô-lo nas deps recriaria o intervalo a cada refresh, e um
  // intervalo recriado nunca vence — o relógio reiniciaria antes de completar.
  //
  // A sincronização vive num efeito próprio, e não no corpo do componente, porque
  // escrever `ref.current` durante o render é o que `react-hooks/refs` proíbe (e com
  // razão: o render pode ser descartado, e a escrita não seria).
  const pendingRef = useRef(false)
  useEffect(() => {
    pendingRef.current = pending
  }, [pending])
  // RV-16 — mesma armadilha de hidratação do RealtimeRefresh (ver comentário
  // lá): nasce vazio, só ganha valor dentro do efeito, que roda depois do
  // mount e só no navegador — servidor e primeiro render do cliente
  // concordam em "nada visível ainda".
  const [carimbo, setCarimbo] = useState('')

  // Um refresh, com o carimbo junto. Usado pelo ciclo, pela volta à aba e pelo botão.
  const refrescar = useCallback(() => {
    ultimoRef.current = Date.now()
    router.refresh()
    setCarimbo(carimboAtualizado(Date.now()))
  }, [router])

  useEffect(() => {
    // RV-16 — mesmo padrão da casa do RealtimeRefresh (ver comentário lá):
    // `setTimeout(…, 0)` empurra o `setState` inicial para dentro de um
    // callback, e não para o corpo síncrono do efeito
    // (`react-hooks/set-state-in-effect`). O carimbo inicial também marca o começo
    // da contagem: sem isto, `ultimo` ficaria em 0 e o primeiro `visibilitychange`
    // acharia que o intervalo venceu em 1970.
    const tCarimbo = setTimeout(() => {
      ultimoRef.current = Date.now()
      setCarimbo(carimboAtualizado(Date.now()))
    }, 0)

    const estado = () => ({
      agora: Date.now(),
      ultimo: ultimoRef.current,
      visivel: document.visibilityState === 'visible',
      emVoo: pendingRef.current,
    })

    // O ciclo continua de 60 s; o que mudou é ele PERGUNTAR antes de agir. Numa aba
    // oculta o timer segue disparando (é barato) e a decisão devolve `false` — nada
    // de rede, nada de render.
    const id = setInterval(() => {
      if (deveRefrescar(estado())) refrescar()
    }, INTERVALO_REFRESH_MS)

    // Ao voltar para a aba: refresca UMA vez, e só se o intervalo já tinha vencido
    // enquanto ela estava escondida. Sem isto, quem volta depois de uma hora olharia
    // dado velho até o próximo tique — trocaríamos custo por mentira na tela.
    const aoMudarVisibilidade = () => {
      if (deveRefrescar(estado())) refrescar()
    }
    document.addEventListener('visibilitychange', aoMudarVisibilidade)

    return () => {
      clearTimeout(tCarimbo)
      clearInterval(id)
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
    }
  }, [refrescar])

  return (
    <span className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => start(refrescar)}
        disabled={pending}
        title="Atualiza sozinho a cada 60 segundos"
      >
        {/* F19 — quem pediu menos movimento no sistema não gira o ícone; o texto
            "Atualizando…" ao lado já é o estado, então nada se perde. */}
        <RefreshCw
          className={pending ? 'size-4 animate-spin motion-reduce:animate-none' : 'size-4'}
        />
        {pending ? 'Atualizando…' : 'Atualizar'}
      </Button>
      {/* RV-16 — texto PERSISTENTE ao lado do botão, não só o `title` de hover
          (teclado/toque não alcançam `title`; o `title` fica como reforço,
          não como único canal). Sem `print:hidden` de propósito: o carimbo
          entra no papel — a regra transversal da ordem só manda `print:hidden`
          para elemento SÓ-de-navegação novo, e isto não navega nada. */}
      {carimbo && (
        <span className="text-xs text-muted-foreground">{carimbo}</span>
      )}
    </span>
  )
}
