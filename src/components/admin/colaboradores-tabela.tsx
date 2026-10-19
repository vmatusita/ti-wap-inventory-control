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
import { QuadroDeTabela } from '@/components/layout/quadro-de-tabela'
import { ColaboradorDialog } from '@/components/admin/colaborador-dialog'
import { ComEstaPessoaLinha } from '@/components/admin/com-esta-pessoa-linha'
import {
  casaFiltroDeUso,
  ehFiltroDeUso,
  FILTROS_DE_USO,
  porqueSemUso,
  type FiltroDeUso,
} from '@/lib/colaboradores/uso'
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
  const [uso, setUso] = useState<FiltroDeUso>('todos')
  // v1.71.2 — sem o uso calculado para NINGUÉM, a leitura do uso falhou (o servidor degradou para `null`): o filtro
  // fica desligado e a tela diz por quê, em vez de mostrar "0 sem uso" como se fosse verdade.
  const usoIndisponivel = colaboradores.length > 0 && colaboradores.every((c) => c.uso === null)

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
        if (!casaFiltroDeUso(c.uso, uso)) return false
        return casaBusca(texto, busca)
      }),
    [colaboradores, busca, filial, uso, nomeDaFilial],
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
        {/* v1.71.2 — "Uso": quem tem registro que continua valendo (ou equipamento com a pessoa) × o selo "Sem uso".
            Estado local, como os dois filtros acima; o número de cada linha vem pronto do banco. */}
        <Select
          value={uso}
          onValueChange={(v) => setUso(ehFiltroDeUso(v) ? v : 'todos')}
          disabled={usoIndisponivel}
        >
          <SelectTrigger size="sm" className="w-[9rem]" aria-label="Filtrar por uso">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTROS_DE_USO.map((f) => (
              <SelectItem key={f.valor} value={f.valor}>
                {f.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p role="status" className="text-sm text-muted-foreground tabular-nums">
          {busca.trim() || filial !== TODAS || uso !== 'todos'
            ? `${visiveis.length} de ${colaboradores.length}`
            : `${colaboradores.length} no total`}
        </p>
      </div>
      {usoIndisponivel && (
        <p className="text-sm text-muted-foreground">
          Não foi possível calcular agora quem está sem uso. A lista está completa; o selo &quot;Sem uso&quot; e o
          filtro &quot;Uso&quot; voltam quando a página for recarregada.
        </p>
      )}

      {visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {colaboradores.length === 0
            ? 'Nenhum colaborador cadastrado ainda. Use a fila abaixo para transformar em cadastro os nomes que já foram digitados, ou crie um com "Novo colaborador".'
            : 'Nenhum colaborador casa com esse filtro.'}
        </div>
      ) : (
        <QuadroDeTabela>
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
                      <div className="flex flex-wrap items-center gap-1.5">
                        {c.ativo ? (
                          <Badge variant="sucesso">Ativo</Badge>
                        ) : (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                        {/* v1.71.2 — o selo só na linha ATIVA sem uso efetivo, com o porquê. Ele não muda nada
                            sozinho: desativar continua sendo decisão de quem administra, pelo "Editar". */}
                        {c.ativo && c.uso?.semUso && (
                          <>
                            <Badge variant="outline">Sem uso</Badge>
                            <span className="text-xs text-muted-foreground">
                              {porqueSemUso(c.uso.registrosEstornados)}
                            </span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {/* F38 · §C.2 — "Com esta pessoa" expande a LINHA, sem rota nova. */}
                      <ComEstaPessoaLinha colaboradorId={c.id} nome={c.nome} />
                      <ColaboradorDialog colaborador={c} filiais={filiais} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </QuadroDeTabela>
      )}
    </div>
  )
}
