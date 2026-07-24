'use client'

import { Fragment } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  BadgeEstornada,
  CabecalhoDetalhe,
  CelulaChamado,
  CelulaData,
  CelulaObs,
} from '@/components/relatorios/celulas'
import { FiltrosTabela } from '@/components/relatorios/filtros-tabela'
import {
  BotaoExpandir,
  LinhaDetalhe,
  useExpandidas,
  type CampoDetalhe,
} from '@/components/relatorios/linha-expansivel'
import { useFiltrosTabela, PREFIXO_FILTROS } from '@/components/relatorios/use-filtros-tabela'
import {
  pillTipoLancamento,
  rotuloGrupoItem,
  rotuloTipoLancamento,
} from '@/lib/dominio'
import { cn } from '@/lib/utils'
import type { LinhaLancamentoItem } from '@/lib/relatorios/tipos'

// B5 (F6B) — movimentações de ITENS por quantidade no período (seção própria; os
// ativos não mudam). Lançamento a lançamento. Bloco condicional (só quando houver;
// some também em snapshots antigos, sem o campo). Ganhou busca livre (F16/T3) sob o
// prefixo `mi.` (client component). Coluna Filial só no consolidado. Colunas: Data ·
// [Filial] · Item · Grupo · Tipo (pílula) · Qtd. · Chamado · Colaborador · Obs. A
// quantidade segue a convenção do histórico: `+N` para positivos.
function formatQtd(q: number): string {
  return q > 0 ? `+${q}` : `${q}`
}

// Campos textuais da busca livre (F16/T3) — ref de MÓDULO (estável). Sem patrimônio
// (são itens por quantidade, não ativos).
const BUSCA_TEXTO = (r: LinhaLancamentoItem) => [
  r.filial,
  r.item,
  rotuloGrupoItem(r.grupo),
  rotuloTipoLancamento(r.tipo),
  r.chamado,
  r.colaborador,
  r.obs,
]

export function TabelaMovItens({
  rows,
  ehGeral,
}: {
  rows: LinhaLancamentoItem[] | undefined
  ehGeral: boolean
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
  } = useFiltrosTabela(rows ?? [], {
    campos: [],
    prefixo: PREFIXO_FILTROS.movItens,
    buscaTexto: BUSCA_TEXTO,
  })
  const { estaAberta, alternar } = useExpandidas()

  if (!rows || rows.length === 0) return null

  return (
    <section id="mov-itens" className="scroll-mt-28 space-y-3 break-before-page">
      <CabecalhoDetalhe
        titulo="Movimentações de itens"
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
          Nenhuma movimentação de item encontrada.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 p-0 lg:hidden" aria-hidden />
                <TableHead>Data</TableHead>
                {ehGeral && <TableHead className="hidden sm:table-cell">Filial</TableHead>}
                <TableHead>Item</TableHead>
                <TableHead className="hidden md:table-cell">Grupo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead className="hidden md:table-cell">Chamado</TableHead>
                <TableHead className="hidden lg:table-cell">Colaborador</TableHead>
                <TableHead className="hidden lg:table-cell">Obs.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((r) => {
                const detalhe: CampoDetalhe[] = [
                  ...(ehGeral
                    ? [{ rotulo: 'Filial', valor: r.filial, revelar: 'sm:hidden' }]
                    : []),
                  { rotulo: 'Grupo', valor: rotuloGrupoItem(r.grupo), revelar: 'md:hidden' },
                  { rotulo: 'Chamado', valor: r.chamado ? `#${r.chamado}` : '—', revelar: 'md:hidden' },
                  { rotulo: 'Colaborador', valor: r.colaborador ?? '—', revelar: 'lg:hidden' },
                  { rotulo: 'Obs.', valor: r.obs ?? '—', revelar: 'lg:hidden' },
                ]
                return (
                  <Fragment key={r.id}>
                    <TableRow className={cn(r.estornada && 'bg-muted/40 text-muted-foreground')}>
                      <TableCell className="w-10 p-0 pl-1 lg:hidden">
                        <BotaoExpandir
                          aberta={estaAberta(r.id)}
                          onClick={() => alternar(r.id)}
                          rotulo={`Detalhes de ${r.item}`}
                        />
                      </TableCell>
                      <CelulaData data={r.data} />
                      {ehGeral && (
                        <TableCell className="hidden whitespace-nowrap sm:table-cell">{r.filial}</TableCell>
                      )}
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {r.item}
                          {r.estornada && <BadgeEstornada data={r.estornoData} />}
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {rotuloGrupoItem(r.grupo)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span
                          className={cn(
                            'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold',
                            pillTipoLancamento(r.tipo),
                          )}
                        >
                          {rotuloTipoLancamento(r.tipo)}
                        </span>
                        {r.ehEstorno && (
                          <span className="ml-1 text-[10px] text-muted-foreground">(estorno)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatQtd(r.quantidade)}
                      </TableCell>
                      <CelulaChamado chamado={r.chamado} className="hidden md:table-cell" />
                      <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                        {r.colaborador ?? '—'}
                      </TableCell>
                      <CelulaObs texto={r.obs} className="hidden lg:table-cell" />
                    </TableRow>
                    {estaAberta(r.id) && (
                      <LinhaDetalhe colSpan={10} campos={detalhe} className="lg:hidden" />
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
