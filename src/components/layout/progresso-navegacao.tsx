'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { cn } from '@/lib/utils'

// Barra fina de progresso de navegação (F6B/B1). Recurso 100% nativo do App
// Router + React — SEM dependência externa (nada de nprogress/toploader).
//
// Papéis:
//  - `loading.tsx` de cada rota mostra o SKELETON quando a navegação troca de
//    segmento (é o feedback principal, custo zero de JS).
//  - Esta barra cobre o intervalo das navegações por searchParam na MESMA rota
//    (filtros, paginação, tabs, período), que rodam em `startTransition` e por
//    isso NÃO disparam o `loading.tsx`. Quem navega reporta o `isPending`
//    (useTransition) ou o `pending` (useLinkStatus) via `useReportarNavegacao`.
//
// A barra acende enquanto o contador de navegações pendentes for > 0 e apaga
// (com um "flush" curto até 100%) quando zera. O contador é auto-balanceado:
// cada reporter incrementa ao ficar pendente e decrementa ao concluir OU
// desmontar.

type Acoes = { inc: () => void; dec: () => void }

const AcoesContext = createContext<Acoes | null>(null)
const AtivosContext = createContext(0)

// Keyframes injetados uma vez (mantidos aqui, e não em globals.css, para o
// componente ser autossuficiente e não gerar conflito de merge entre frentes).
const ESTILOS_BARRA = `
@keyframes wap-barra-progresso {
  0%   { transform: scaleX(0.03); }
  35%  { transform: scaleX(0.5); }
  70%  { transform: scaleX(0.78); }
  100% { transform: scaleX(0.9); }
}
@keyframes wap-barra-final {
  from { transform: scaleX(0.9); opacity: 1; }
  to   { transform: scaleX(1); opacity: 0; }
}
`

export function ProgressoNavegacaoProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [ativos, setAtivos] = useState(0)
  const acoes = useMemo<Acoes>(
    () => ({
      inc: () => setAtivos((n) => n + 1),
      dec: () => setAtivos((n) => Math.max(0, n - 1)),
    }),
    [],
  )

  return (
    <AcoesContext.Provider value={acoes}>
      <AtivosContext.Provider value={ativos}>
        <style>{ESTILOS_BARRA}</style>
        {children}
      </AtivosContext.Provider>
    </AcoesContext.Provider>
  )
}

// Reporta o estado `pendente` de uma navegação ao provider. Incrementa o
// contador quando fica pendente e decrementa ao concluir ou desmontar.
export function useReportarNavegacao(pendente: boolean): void {
  const acoes = useContext(AcoesContext)
  useEffect(() => {
    if (!acoes || !pendente) return
    acoes.inc()
    return acoes.dec
  }, [acoes, pendente])
}

type Fase = 'oculto' | 'carregando' | 'concluindo'

export function BarraProgressoNavegacao() {
  const ativos = useContext(AtivosContext)
  const [fase, setFase] = useState<Fase>('oculto')
  const [ativosAnterior, setAtivosAnterior] = useState(ativos)

  // Ajuste de estado no render (padrão React "You Might Not Need an Effect",
  // já usado neste repo em ativos-filtros/periodo-filtro): reage à mudança do
  // contador sem setState síncrono dentro de effect. Ao zerar, só "conclui" se
  // estava carregando — evita animar do nada ao montar.
  if (ativos !== ativosAnterior) {
    setAtivosAnterior(ativos)
    if (ativos > 0) setFase('carregando')
    else setFase((f) => (f === 'carregando' ? 'concluindo' : f))
  }

  // Encerra a fase de conclusão após a animação de flush. O setState roda no
  // callback do timeout (não é setState síncrono no corpo do effect).
  useEffect(() => {
    if (fase !== 'concluindo') return
    const t = setTimeout(() => setFase('oculto'), 300)
    return () => clearTimeout(t)
  }, [fase])

  if (fase === 'oculto') return null

  // F19 — `motion-reduce:hidden` no wrapper: a barra anima sem parar, e quem pediu
  // `prefers-reduced-motion` não deve vê-la. O feedback de navegação continua pelo
  // `loading.tsx` e pelos estados `aria-busy`/opacidade de quem navega.
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden motion-reduce:hidden print:hidden"
    >
      <div
        className={cn(
          'h-full w-full origin-left rounded-r-full bg-brand-amarelo',
          'shadow-[0_0_8px_var(--brand-amarelo)]',
        )}
        style={{
          animation:
            fase === 'carregando'
              ? 'wap-barra-progresso 2.4s cubic-bezier(0.22, 1, 0.36, 1) forwards'
              : 'wap-barra-final 0.3s ease-out forwards',
        }}
      />
    </div>
  )
}
