'use client'

import { type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'

// Botao de submit do formulario intersticial (/auth/confirm). Precisa ser client
// para exibir o estado "Ativando…" via useFormStatus. O verifyOtp so roda quando
// ESTE submit dispara — e o que protege o token do prefetch (ver lib/actions/auth.ts).
export function BotaoAtivar({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="h-11 w-full" disabled={pending}>
      {pending ? 'Ativando…' : children}
    </Button>
  )
}
