'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function AtivosPaginacao({
  page,
  pageSize,
  total,
}: {
  page: number
  pageSize: number
  total: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize))
  const primeiro = total === 0 ? 0 : (page - 1) * pageSize + 1
  const ultimo = Math.min(page * pageSize, total)

  function irPara(p: number) {
    const novo = new URLSearchParams(params.toString())
    if (p <= 1) novo.delete('page')
    else novo.set('page', String(p))
    router.push(`${pathname}?${novo.toString()}`)
  }

  return (
    <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="tabular-nums">
        {primeiro}–{ultimo} de {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-10 sm:h-7"
          onClick={() => irPara(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeft className="size-4" />
          Anterior
        </Button>
        <span className="tabular-nums">
          {page} / {totalPaginas}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-10 sm:h-7"
          onClick={() => irPara(page + 1)}
          disabled={page >= totalPaginas}
          aria-label="Próxima página"
        >
          Próxima
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
