'use client'

import { ArrowRight } from 'lucide-react'
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
  CelulaPatrimonio,
} from '@/components/relatorios/celulas'
import { FiltrosTabela } from '@/components/relatorios/filtros-tabela'
import { useFiltrosTabela, PREFIXO_FILTROS } from '@/components/relatorios/use-filtros-tabela'
import { rotuloCategoria } from '@/lib/dominio'
import { cn } from '@/lib/utils'
import type { LinhaTransferencia } from '@/lib/relatorios/tipos'

// Campos textuais da busca livre (F16/T3) — refs de MÓDULO (estáveis).
const BUSCA_TEXTO = (r: LinhaTransferencia) => [
  r.de,
  r.para,
  rotuloCategoria(r.categoria),
  r.modelo,
  r.patrimonio,
  r.chamado,
  r.obs,
]
const BUSCA_PATRIMONIO = (r: LinhaTransferencia) => r.patrimonio

// Transferências do período (§4.4) — bloco condicional (só quando houver). Colunas:
// Data · De → Para · Categoria · Marca/Modelo · Patrimônio · Chamado · Obs. Sem
// filtros de select (é a exceção), mas ganhou busca livre (F16/T3) sob o prefixo
// `tr.`. Client component (o hook da busca precisa da URL). `ehOperador` faz o
// patrimônio virar link p/ a ficha; viewer por senha vê texto puro.
export function TabelaTransferencias({
  rows,
  ehOperador,
}: {
  rows: LinhaTransferencia[]
  ehOperador?: boolean
}) {
  const {
    filtradas,
    temFiltro,
    temRecorte,
    filtros,
    opcoes,
    camposAtivos,
    busca,
    setFiltro,
    setBusca,
    limpar,
  } = useFiltrosTabela(rows, {
    campos: [],
    prefixo: PREFIXO_FILTROS.transferencias,
    buscaTexto: BUSCA_TEXTO,
    buscaPatrimonio: BUSCA_PATRIMONIO,
  })

  if (rows.length === 0) return null

  return (
    <section id="transferencias" className="scroll-mt-28 space-y-3 break-before-page">
      <CabecalhoDetalhe
        titulo="Transferências"
        total={rows.length}
        exibidas={temRecorte ? filtradas.length : undefined}
      />
      <FiltrosTabela
        campos={camposAtivos}
        filtros={filtros}
        opcoes={opcoes}
        temFiltro={temFiltro}
        setFiltro={setFiltro}
        limpar={limpar}
        busca={busca}
        setBusca={setBusca}
      />

      {filtradas.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhuma transferência encontrada.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>De → Para</TableHead>
                <TableHead className="hidden sm:table-cell">Categoria</TableHead>
                <TableHead className="hidden lg:table-cell">Marca/Modelo</TableHead>
                <TableHead>Patrimônio</TableHead>
                <TableHead className="hidden md:table-cell">Chamado</TableHead>
                <TableHead className="hidden lg:table-cell">Obs.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((r) => (
                <TableRow
                  key={r.id}
                  className={cn(r.estornada && 'bg-muted/40 text-muted-foreground')}
                >
                  <CelulaData data={r.data} />
                  <TableCell className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {r.de}
                      <ArrowRight className="size-3 text-muted-foreground" />
                      {r.para}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{rotuloCategoria(r.categoria)}</TableCell>
                  <TableCell className="hidden whitespace-nowrap lg:table-cell">{r.modelo}</TableCell>
                  <CelulaPatrimonio
                    patrimonio={r.patrimonio}
                    ativoId={r.ativoId}
                    ehOperador={ehOperador}
                    estornada={r.estornada}
                    estornoData={r.estornoData}
                  />
                  <CelulaChamado chamado={r.chamado} className="hidden md:table-cell" />
                  <CelulaObs texto={r.obs} className="hidden lg:table-cell" />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
