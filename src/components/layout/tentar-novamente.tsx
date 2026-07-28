'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

// O botão "Tentar novamente" dos boundaries de erro (F20B).
//
// O BUG que isto corrige: os 5 `error.tsx` chamavam `reset()` puro. No App Router
// o reset só limpa o estado de erro e re-renderiza o segmento — NÃO refaz as
// leituras de Server Component que falharam. O operador clicava e nada acontecia;
// só sair-e-voltar ou F5 recuperava (relatado pelo Johnny em 28/07/2026).
//
// A CORREÇÃO é a prop `unstable_retry`, que o Next passa ao componente de erro
// desde a 16.2.0 e que a doc oficial manda usar no lugar do reset sozinho: "In
// most cases, you should use `unstable_retry()` instead."
// (nextjs.org/docs/app/api-reference/file-conventions/error, seção `reset`).
// Por dentro ela é exatamente `startTransition(() => { refresh(); reset() })` — o
// refresh busca o payload RSC novo e o reset derruba o estado de erro depois,
// dentro da MESMA transição. Inverter essa ordem traz o bug de volta.
//
// SÓ SERVE A BOUNDARY DE SEGMENTO (`error.tsx`): o fallback abaixo usa
// `useRouter`, que exige o contexto do App Router. Num `global-error.tsx` — que
// substitui o root layout e hoje não existe neste repositório — esse contexto
// pode não estar montado.
export function TentarNovamente({
  aoTentar,
  reset,
  rotulo = 'Tentar novamente',
}: {
  // O `unstable_retry` do boundary. Opcional DE PROPÓSITO: a API ainda é
  // `unstable_` e pode ser renomeada num minor do Next. Se um dia sumir, o
  // fallback faz a mesma coisa, na mesma ordem — sem ele, o rename ressuscitaria
  // em silêncio exatamente o bug descrito acima.
  aoTentar?: () => void
  reset: () => void
  rotulo?: string
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()

  // A transição local existe só para acender o `pendente` do botão (o retry não
  // devolve estado): enquanto a leitura refaz, o botão fica desabilitado e
  // clique repetido não empilha.
  function tentar() {
    iniciar(() => {
      if (aoTentar) {
        aoTentar()
        return
      }
      router.refresh()
      reset()
    })
  }

  return (
    <>
      <Button
        onClick={tentar}
        disabled={pendente}
        aria-busy={pendente}
        variant="outline"
        className="gap-2"
      >
        {pendente ? (
          <>
            {/* Spinner parado para quem pede menos movimento (convenção F19): quem
                carrega o estado nesse caso é o texto ao lado. */}
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            Tentando…
          </>
        ) : (
          rotulo
        )}
      </Button>
      {/* FORA do botão de propósito: quando o `disabled` entra, o navegador joga o
          foco para o <body> e o leitor de tela perde o elemento — o `aria-busy`
          passa a estar num nó que ninguém está lendo. Esta região viva anuncia o
          estado independentemente do foco. `sr-only` é `position: absolute`, logo
          não vira item do flex e não mexe no layout do painel. */}
      <span className="sr-only" role="status">
        {pendente ? 'Tentando novamente…' : ''}
      </span>
    </>
  )
}
