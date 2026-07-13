'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { gerarTextoResumo } from '@/lib/relatorios/resumo'
import type { ResumoPeriodo } from '@/lib/relatorios/tipos'

// Resumo do período no formato do e-mail (OS-F3 3.3.6) + botão "Copiar texto".
export function ResumoPeriodoCard({ resumo }: { resumo: ResumoPeriodo }) {
  const texto = gerarTextoResumo(resumo)
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      toast.success('Texto copiado.')
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('Não foi possível copiar o texto.')
    }
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={copiar}
        className="absolute top-0 right-0 gap-1.5 print:hidden"
      >
        {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copiado ? 'Copiado' : 'Copiar texto'}
      </Button>
      <pre className="mt-1 max-w-full whitespace-pre-wrap break-words pt-9 pr-0 font-sans text-[13px] leading-relaxed text-foreground/90 sm:pt-0 sm:pr-32">
        {texto}
      </pre>
    </div>
  )
}
