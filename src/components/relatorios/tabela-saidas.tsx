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
  CabecalhoDetalhe,
  CelulaChamado,
  CelulaData,
  CelulaObs,
  PilulaTipo,
} from '@/components/relatorios/celulas'
import { FiltrosTabela, ChipsResumo } from '@/components/relatorios/filtros-tabela'
import {
  useFiltrosTabela,
  chaveResumoMotivo,
  PREFIXO_FILTROS,
  type CampoFiltro,
} from '@/components/relatorios/use-filtros-tabela'
import { rotuloCategoria } from '@/lib/dominio'
import type { LinhaSaida } from '@/lib/relatorios/tipos'

const CAMPOS: CampoFiltro[] = ['filial', 'categoria', 'motivo']

// Saídas do período (§4.4 / §3.7.7): tipos saida + emprestimo. Contagem no
// título, resumo por (filial×)motivo, filtros internos (categoria, motivo, filial
// no consolidado). Colunas: Data · Filial · Categoria · Marca/Modelo · Patrimônio
// · Tipo · Motivo · Chamado · Colaborador/Setor · Termo · Obs. Filtros/resumo/
// células via os compartilhados (OS tech-debt 3.2). Filtros na URL sob o prefixo
// `sd.` (F11/T10) — sobrevivem ao F5 e viajam no link.
export function TabelaSaidas({
  rows,
  ehGeral,
}: {
  rows: LinhaSaida[]
  ehGeral: boolean
}) {
  const { filtradas, temFiltro, resumo, filtros, opcoes, camposAtivos, setFiltro, limpar } =
    useFiltrosTabela(rows, {
      campos: CAMPOS,
      prefixo: PREFIXO_FILTROS.saidas,
      ehGeral,
      resumoChave: chaveResumoMotivo,
    })

  return (
    <section id="saidas" className="scroll-mt-16 space-y-3 break-before-page">
      <CabecalhoDetalhe
        titulo="Saídas"
        total={rows.length}
        exibidas={temFiltro ? filtradas.length : undefined}
      />
      <ChipsResumo resumo={resumo} />
      <FiltrosTabela
        campos={camposAtivos}
        filtros={filtros}
        opcoes={opcoes}
        temFiltro={temFiltro}
        setFiltro={setFiltro}
        limpar={limpar}
      />

      {filtradas.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhuma saída no período.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                {ehGeral && <TableHead className="hidden md:table-cell">Filial</TableHead>}
                <TableHead className="hidden sm:table-cell">Categoria</TableHead>
                <TableHead className="hidden lg:table-cell">Marca/Modelo</TableHead>
                <TableHead>Patrimônio</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="hidden md:table-cell">Chamado</TableHead>
                <TableHead className="hidden lg:table-cell">Colab./Setor</TableHead>
                <TableHead className="hidden xl:table-cell">Termo</TableHead>
                <TableHead className="hidden xl:table-cell">Obs.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((r) => (
                <TableRow key={r.id}>
                  <CelulaData data={r.data} />
                  {ehGeral && (
                    <TableCell className="hidden whitespace-nowrap md:table-cell">{r.filial}</TableCell>
                  )}
                  <TableCell className="hidden sm:table-cell">{rotuloCategoria(r.categoria)}</TableCell>
                  <TableCell className="hidden whitespace-nowrap lg:table-cell">{r.modelo}</TableCell>
                  <TableCell className="whitespace-nowrap font-medium tabular-nums">{r.patrimonio}</TableCell>
                  <TableCell>
                    <PilulaTipo tipo={r.tipo} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{r.motivo ?? '—'}</TableCell>
                  <CelulaChamado chamado={r.chamado} className="hidden md:table-cell" />
                  <TableCell className="hidden whitespace-nowrap lg:table-cell">
                    {r.colaboradorSetor ?? '—'}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap xl:table-cell">{r.termo ?? '—'}</TableCell>
                  <CelulaObs texto={r.obs} className="hidden xl:table-cell" />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
