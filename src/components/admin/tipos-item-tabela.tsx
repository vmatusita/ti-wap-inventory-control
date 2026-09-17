'use client'

import { useId, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { casaBusca } from '@/lib/ajuda/busca'
import { QuadroDeTabela } from '@/components/layout/quadro-de-tabela'
import { TipoItemDialog } from '@/components/admin/tipo-item-dialog'
import type { TipoItemAdmin } from '@/lib/queries/tipos-item'

// Tabela do catálogo de tipos (F37 · D7) — molde exato do `itens-tabela.tsx`
// (F29/ADM-03a): recebe o array pronto do servidor e filtra em MEMÓRIA, sem
// round-trip por tecla. `<Table>` do shadcn, não TanStack: são poucas linhas.

export function TiposItemTabela({ tipos }: { tipos: readonly TipoItemAdmin[] }) {
  const buscaId = useId()
  const [busca, setBusca] = useState('')

  const visiveis = useMemo(
    () => tipos.filter((t) => casaBusca(`${t.rotulo} ${t.slug}`, busca)),
    [tipos, busca],
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={buscaId}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou código…"
            aria-label="Buscar tipo por nome ou código"
            autoComplete="off"
            className="h-10 pl-8 sm:h-8"
          />
        </div>
        <p role="status" className="text-sm text-muted-foreground tabular-nums">
          {busca.trim()
            ? `${visiveis.length} de ${tipos.length}`
            : `${tipos.length} no total`}
        </p>
      </div>

      {visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {tipos.length === 0
            ? 'Nenhum tipo cadastrado ainda — use "Novo tipo" para criar o primeiro.'
            : `Nenhum tipo casa com “${busca.trim()}”.`}
        </div>
      ) : (
        <QuadroDeTabela>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden sm:table-cell">Código</TableHead>
                <TableHead className="hidden text-right md:table-cell">Ordem</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Itens</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.rotulo}</TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                    {t.slug}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                    {t.ordem}
                  </TableCell>
                  {/* Itens = quantos do catálogo apontam para este tipo. Zero sai como
                      travessão pelo mesmo motivo do "Mínimo" em itens-tabela: é
                      ausência, não uma quantidade. */}
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                    {t.itens > 0 ? t.itens.toLocaleString('pt-BR') : '—'}
                  </TableCell>
                  <TableCell>
                    {t.ativo ? (
                      <Badge variant="sucesso">Ativo</Badge>
                    ) : (
                      <Badge variant="secondary">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <TipoItemDialog tipo={t} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </QuadroDeTabela>
      )}
    </div>
  )
}
