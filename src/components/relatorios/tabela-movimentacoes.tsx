'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  CelulaChamado,
  CelulaData,
  CelulaObs,
  PilulaTipo,
} from '@/components/relatorios/celulas'
import { FiltrosTabela } from '@/components/relatorios/filtros-tabela'
import {
  useFiltrosTabela,
  PREFIXO_FILTROS,
  type CampoFiltro,
} from '@/components/relatorios/use-filtros-tabela'
import type { MovimentacaoRelatorio } from '@/lib/relatorios/tipos'

const CAMPOS: CampoFiltro[] = ['filial', 'categoria', 'tipo']
const SEM_CAMPOS: CampoFiltro[] = []

// Tabela "Últimas movimentações" — usada só na grade v1 (snapshots antigos que
// continuam abrindo). Filtros internos client-side (categoria, tipo, e filial no
// consolidado) via os compartilhados (OS tech-debt 3.2), persistidos na URL sob o
// prefixo `mv.` (F11/T10). Sem `filtrosInternos`, a barra some, todas as linhas
// são mostradas e nada é escrito na URL. Sem export CSV (removido na v2 —
// decisão do plano §3.9): quem precisar de arquivo usa a impressão limpa.
export function TabelaMovimentacoes({
  rows,
  filtrosInternos = false,
  ehGeral = false,
}: {
  rows: MovimentacaoRelatorio[]
  filtrosInternos?: boolean
  ehGeral?: boolean
}) {
  const { filtradas, temFiltro, filtros, opcoes, camposAtivos, setFiltro, limpar } =
    useFiltrosTabela(rows, {
      campos: filtrosInternos ? CAMPOS : SEM_CAMPOS,
      prefixo: PREFIXO_FILTROS.movimentacoes,
      ehGeral,
    })

  return (
    <div>
      <FiltrosTabela
        className="mb-3"
        campos={camposAtivos}
        filtros={filtros}
        opcoes={opcoes}
        temFiltro={temFiltro}
        setFiltro={setFiltro}
        limpar={limpar}
      />

      {filtradas.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhuma movimentação no período.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Patrimônio</TableHead>
                <TableHead className="hidden lg:table-cell">Ativo</TableHead>
                <TableHead>Colaborador / Setor</TableHead>
                <TableHead className="hidden md:table-cell">Filial</TableHead>
                <TableHead className="hidden md:table-cell">Chamado</TableHead>
                <TableHead className="hidden lg:table-cell">Observação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((r) => (
                <TableRow key={r.id}>
                  <CelulaData data={r.data} />
                  <TableCell>
                    <PilulaTipo tipo={r.tipo} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium tabular-nums">
                    {r.patrimonio}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap lg:table-cell">{r.ativo}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.colaborador_setor ?? '—'}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap md:table-cell">{r.filial}</TableCell>
                  <CelulaChamado chamado={r.chamado} className="hidden md:table-cell" />
                  <CelulaObs texto={r.observacao} comIcone className="hidden lg:table-cell" />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
