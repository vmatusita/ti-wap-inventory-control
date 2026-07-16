'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { CalendarRange } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useReportarNavegacao } from '@/components/layout/progresso-navegacao'
import { cn } from '@/lib/utils'
import { PRESETS, type PresetPeriodo } from '@/lib/relatorios/periodo'

// Filtro de período (OS-F3 3.2.1): presets + range custom, tudo via searchParams
// server-side. Muda apenas a query da rota atual (preserva a filial no pathname).
export function PeriodoFiltro({
  preset,
  de,
  ate,
}: {
  preset: PresetPeriodo
  de: string
  ate: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, start] = useTransition()
  useReportarNavegacao(isPending)
  const [pDe, setPDe] = useState(de)
  const [pAte, setPAte] = useState(ate)
  const [aberto, setAberto] = useState(false)

  // Sincroniza os campos do range quando o período muda por fora (troca de
  // preset, voltar/avançar do navegador). Padrão "ajustar estado no render".
  const [sync, setSync] = useState({ de, ate })
  if (sync.de !== de || sync.ate !== ate) {
    setSync({ de, ate })
    setPDe(de)
    setPAte(ate)
  }

  function aplicarPreset(valor: string) {
    const novo = new URLSearchParams({ preset: valor })
    start(() => router.push(`${pathname}?${novo.toString()}`))
  }

  function aplicarCustom() {
    if (!pDe || !pAte || pDe > pAte) return
    const novo = new URLSearchParams({ preset: 'custom', de: pDe, ate: pAte })
    setAberto(false)
    start(() => router.push(`${pathname}?${novo.toString()}`))
  }

  return (
    <div
      aria-busy={isPending}
      className={cn(
        'flex flex-wrap items-center gap-2 transition-opacity',
        isPending && 'opacity-70',
      )}
    >
      {PRESETS.map((p) => (
        <Button
          key={p.valor}
          variant={preset === p.valor ? 'default' : 'outline'}
          size="sm"
          className="h-10 sm:h-7"
          onClick={() => aplicarPreset(p.valor)}
        >
          {p.rotulo}
        </Button>
      ))}
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button
            variant={preset === 'custom' ? 'default' : 'outline'}
            size="sm"
            className="h-10 gap-1.5 sm:h-7"
          >
            <CalendarRange className="size-4" />
            Personalizado
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="periodo-de">De</Label>
            <Input
              id="periodo-de"
              type="date"
              value={pDe}
              max={pAte || undefined}
              onChange={(e) => setPDe(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="periodo-ate">Até</Label>
            <Input
              id="periodo-ate"
              type="date"
              value={pAte}
              min={pDe || undefined}
              onChange={(e) => setPAte(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            size="sm"
            onClick={aplicarCustom}
            disabled={!pDe || !pAte || pDe > pAte}
          >
            Aplicar período
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  )
}
