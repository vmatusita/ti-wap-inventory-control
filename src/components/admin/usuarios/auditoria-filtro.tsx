'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ACAO_ROTULO, ACOES_ADMIN } from '@/lib/auditoria'

// Sentinela do "sem filtro": o Select do shadcn não aceita `value=""` (string vazia é
// reservada para "nada selecionado" e o placeholder assumiria).
const TODAS = 'todas'

// Filtro por ação da aba Auditoria (F21). O estado vive na URL — a página é um Server
// Component e a lista vem paginada do banco, então o filtro é navegação, não estado local.
export function AuditoriaFiltro({ acao }: { acao: string | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, start] = useTransition()

  function trocar(valor: string) {
    const novo = new URLSearchParams(params.toString())
    if (valor === TODAS) novo.delete('acao')
    else novo.set('acao', valor)
    // Trocar o filtro volta para a primeira página: a página 4 do filtro anterior
    // provavelmente não existe no novo (e cairia no clamp, o que confunde).
    novo.delete('page')
    const qs = novo.toString()
    start(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="auditoria-acao" className="text-sm text-muted-foreground">
        Ação
      </Label>
      <Select value={acao ?? TODAS} onValueChange={trocar} disabled={pending}>
        <SelectTrigger id="auditoria-acao" className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS}>Todas as ações</SelectItem>
          {ACOES_ADMIN.map((a) => (
            <SelectItem key={a} value={a}>
              {ACAO_ROTULO[a]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
