'use client'

import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { TentarNovamente } from '@/components/layout/tentar-novamente'

// Painel padrão dos boundaries de erro — irmão semântico de `EstadoVazio`.
//
// Os 5 `error.tsx` repetiam byte a byte o mesmo contêiner, o mesmo ícone e o mesmo
// par de parágrafos: mudar o visual do erro exigia acertar cinco arquivos e não
// esquecer nenhum. Daqui sai só o que era idêntico entre eles.
//
// O boundary continua sendo o ARQUIVO (`error.tsx`, com `'use client'` e default
// export) — isto aqui é componente comum. Título, mensagem e CTAs extras seguem
// vindo de cada boundary, por prop, porque são o que os diferencia.
export function PainelErro({
  titulo,
  mensagem,
  aoTentar,
  reset,
  rotuloTentar,
  children,
}: {
  titulo: string
  mensagem: ReactNode
  /** O `unstable_retry` do boundary (ver `TentarNovamente`). */
  aoTentar?: () => void
  reset: () => void
  rotuloTentar?: string
  /** CTAs extras à direita do "Tentar novamente" — a saída que TROCA a URL. */
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <AlertTriangle className="size-8 text-destructive" />
      <p className="font-medium">{titulo}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{mensagem}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <TentarNovamente aoTentar={aoTentar} reset={reset} rotulo={rotuloTentar} />
        {children}
      </div>
    </div>
  )
}
