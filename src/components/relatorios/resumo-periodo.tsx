'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { gerarTextoResumo, type ExtrasResumo } from '@/lib/relatorios/resumo'
import type { ResumoPeriodo } from '@/lib/relatorios/tipos'

// Resumo do período no formato do e-mail (OS-F3 3.3.6) + botão "Copiar texto".
// F29/REL-08 — `extras` acrescenta a linha de KPIs e o bloco "Em estoque (N)", que
// é como o e-mail real abria. Ausente = o texto de antes, sem mudança nenhuma.
export function ResumoPeriodoCard({
  resumo,
  extras,
}: {
  resumo: ResumoPeriodo
  extras?: ExtrasResumo
}) {
  const texto = gerarTextoResumo(resumo, extras)
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
