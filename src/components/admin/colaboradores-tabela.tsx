'use client'

import { useId, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { casaBusca } from '@/lib/ajuda/busca'
import { ColaboradorDialog } from '@/components/admin/colaborador-dialog'
import type { ColaboradorAdmin } from '@/lib/queries/colaboradores'
import type { Filial } from '@/lib/queries/filiais'

// Lista do cadastro de pessoas (F37 · D5) — molde do `itens-tabela.tsx`: recebe o
// array pronto do servidor e filtra em MEMÓRIA, sem round-trip por tecla.
//
// O filtro de FILIAL é um select, não um campo de texto, porque filial é vocabulário
// fechado; e traz "Sem filial" como opção de verdade — cadastro criado inline no meio
// de um lote misto nasce sem filial, e essa é justamente a lista que o admin quer
// achar depois para completar.

const TODAS = '__todas__'
const SEM_FILIAL = '__sem__'

export function ColaboradoresTabela({
  colaboradores,
  filiais,
}: {
  colaboradores: readonly ColaboradorAdmin[]
  filiais: readonly Filial[]
}) {
  const buscaId = useId()
  const [busca, setBusca] = useState('')
  const [filial, setFilial] = useState(TODAS)

  const nomeDaFilial = useMemo(
    () => new Map(filiais.map((f) => [f.id, f.nome])),
    [filiais],
  )

  const visiveis = useMemo(
    () =>
      colaboradores.filter((c) => {
        if (filial === SEM_FILIAL && c.filial_id != null) return false
        if (filial !== TODAS && filial !== SEM_FILIAL && String(c.filial_id) !== filial) {
          return false
        }
        const texto = `${c.nome} ${c.matricula ?? ''} ${c.setor ?? ''} ${
          c.filial_id != null ? (nomeDaFilial.get(c.filial_id) ?? '') : ''
        }`
        return casaBusca(texto, busca)
      }),
    [colaboradores, busca, filial, nomeDaFilial],
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
            placeholder="Buscar por nome, matrícula ou setor…"
            aria-label="Buscar colaborador por nome, matrícula ou setor"
            autoComplete="off"
            className="h-10 pl-8 sm:h-8"
          />
        </div>
        <Select value={filial} onValueChange={setFilial}>
          <SelectTrigger size="sm" className="w-[11rem]" aria-label="Filtrar por filial">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas as filiais</SelectItem>
            <SelectItem value={SEM_FILIAL}>Sem filial</SelectItem>
            {filiais.map((f) => (
              <SelectItem key={f.id} value={String(f.id)}>
                {f.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p role="status" className="text-sm text-muted-foreground tabular-nums">
          {busca.trim() || filial !== TODAS
            ? `${visiveis.length} de ${colaboradores.length}`
            : `${colaboradores.length} no total`}
        </p>
      </div>

      {visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {colaboradores.length === 0
            ? 'Nenhum colaborador cadastrado ainda. Use a fila abaixo para transformar em cadastro os nomes que já foram digitados, ou crie um com "Novo colaborador".'
            : 'Nenhum colaborador casa com esse filtro.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden sm:table-cell">Setor</TableHead>
                <TableHead className="hidden md:table-cell">Matrícula</TableHead>
                <TableHead className="hidden lg:table-cell">Filial</TableHead>
                {/* Registros = movimentações + lançamentos de item já VINCULADOS a
                    este cadastro. Não é "tudo que a pessoa já teve": o histórico
                    anterior à F37 continua só com o nome em texto. */}
                <TableHead className="hidden text-right sm:table-cell">
                  Registros
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((c) => {
                const registros = c.movimentacoes + c.lancamentos
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {c.setor ?? '—'}
                    </TableCell>
                    <TableCell className="hidden tabular-nums text-muted-foreground md:table-cell">
                      {c.matricula ?? '—'}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {c.filial_id != null
                        ? (nomeDaFilial.get(c.filial_id) ?? '—')
                        : '—'}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                      {registros > 0 ? registros.toLocaleString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell>
                      {c.ativo ? (
                        <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <ColaboradorDialog colaborador={c} filiais={filiais} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
