'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useReportarNavegacao } from '@/components/layout/progresso-navegacao'

const TODAS = '__todas'

// Filtro por filial do histórico de relatórios gerados (OS-F3 3.8.4).
export function GeradosFiltroFilial({
  filiais,
  atual,
}: {
  filiais: { slug: string; nome: string }[]
  atual: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, start] = useTransition()
  useReportarNavegacao(isPending)

  function mudar(valor: string) {
    const qs = valor === TODAS ? '' : `?filial=${valor}`
    start(() => router.push(`${pathname}${qs}`))
  }

  return (
    <Select value={atual || TODAS} onValueChange={mudar}>
      <SelectTrigger size="sm" className="w-[180px]" aria-label="Filtrar por filial">
        <SelectValue placeholder="Filial" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODAS}>Todas as filiais</SelectItem>
        <SelectItem value="geral">Consolidado</SelectItem>
        {filiais.map((f) => (
          <SelectItem key={f.slug} value={f.slug}>
            {f.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
