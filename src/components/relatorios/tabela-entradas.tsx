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
  CabecalhoDetalhe,
  CelulaData,
  CelulaObs,
  CelulaPatrimonio,
  PilulaTipo,
} from '@/components/relatorios/celulas'
import { FiltrosTabela, ChipsResumo } from '@/components/relatorios/filtros-tabela'
import {
  BotaoExpandir,
  LinhaDetalhe,
  useExpandidas,
  type CampoDetalhe,
} from '@/components/relatorios/linha-expansivel'
import {
  useFiltrosTabela,
  chaveResumoMotivo,
  PREFIXO_FILTROS,
  type CampoFiltro,
} from '@/components/relatorios/use-filtros-tabela'
import { rotuloAcessorio, rotuloCategoria } from '@/lib/dominio'
import { cn } from '@/lib/utils'
import type { LinhaEntrada } from '@/lib/relatorios/tipos'

const CAMPOS: CampoFiltro[] = ['filial', 'categoria', 'motivo']

// Campos textuais da busca livre (F16/T3) — refs de MÓDULO (estáveis).
const BUSCA_TEXTO = (r: LinhaEntrada) => [
  r.filial,
  rotuloCategoria(r.categoria),
  r.modelo,
  r.patrimonio,
  r.motivo,
  r.colaborador,
  r.setor,
  ...(r.itensFaltantes ?? []).map(rotuloAcessorio),
  r.obs,
]
const BUSCA_PATRIMONIO = (r: LinhaEntrada) => r.patrimonio

// Entradas do período (§4.4): tipos devolucao + compra + troca (F15). Colunas: Data ·
// Filial · Categoria · Marca/Modelo · Patrimônio · Tipo (Devolução/Compra/Troca) ·
// Motivo · Colaborador · Setor · Itens faltantes · Obs. A pílula/rótulo do tipo vem de
// pillTipo/rotuloTipo (dominio.ts) — "Troca" em teal. Filtros/resumo/células via os
// compartilhados (OS tech-debt 3.2). Filtros e busca (F16/T3) na URL sob o prefixo
// `en.` (F11/T10) — não colidem com os `sd.` das saídas na mesma página.
export function TabelaEntradas({
  rows,
  ehGeral,
  ehOperador,
}: {
  rows: LinhaEntrada[]
  ehGeral: boolean
  ehOperador?: boolean
}) {
  const {
    filtradas,
    temFiltro,
    temRecorte,
    resumo,
    filtros,
    opcoes,
    camposAtivos,
    busca,
    setFiltro,
    setBusca,
    limpar,
  } = useFiltrosTabela(rows, {
    campos: CAMPOS,
    prefixo: PREFIXO_FILTROS.entradas,
    ehGeral,
    resumoChave: chaveResumoMotivo,
    buscaTexto: BUSCA_TEXTO,
    buscaPatrimonio: BUSCA_PATRIMONIO,
  })
  const { estaAberta, alternar } = useExpandidas()

  return (
    <section id="entradas" className="scroll-mt-28 space-y-3 break-before-page">
      <CabecalhoDetalhe
        titulo="Entradas"
        total={rows.length}
        exibidas={temRecorte ? filtradas.length : undefined}
      />
      <ChipsResumo resumo={resumo} />
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
          Nenhuma entrada no período.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 p-0 xl:hidden" aria-hidden />
                <TableHead>Data</TableHead>
                {ehGeral && <TableHead className="hidden md:table-cell">Filial</TableHead>}
                <TableHead className="hidden sm:table-cell">Categoria</TableHead>
                <TableHead className="hidden lg:table-cell">Marca/Modelo</TableHead>
                <TableHead>Patrimônio</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="hidden lg:table-cell">Colaborador</TableHead>
                <TableHead className="hidden xl:table-cell">Setor</TableHead>
                <TableHead className="hidden md:table-cell">Itens faltantes</TableHead>
                <TableHead className="hidden xl:table-cell">Obs.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((r) => {
                const faltantes =
                  r.itensFaltantes && r.itensFaltantes.length > 0
                    ? r.itensFaltantes.map(rotuloAcessorio).join(', ')
                    : '—'
                const detalhe: CampoDetalhe[] = [
                  ...(ehGeral
                    ? [{ rotulo: 'Filial', valor: r.filial, revelar: 'md:hidden' }]
                    : []),
                  { rotulo: 'Categoria', valor: rotuloCategoria(r.categoria), revelar: 'sm:hidden' },
                  { rotulo: 'Marca/Modelo', valor: r.modelo, revelar: 'lg:hidden' },
                  { rotulo: 'Colaborador', valor: r.colaborador ?? '—', revelar: 'lg:hidden' },
                  { rotulo: 'Setor', valor: r.setor ?? '—', revelar: 'xl:hidden' },
                  { rotulo: 'Itens faltantes', valor: faltantes, revelar: 'md:hidden' },
                  { rotulo: 'Obs.', valor: r.obs ?? '—', revelar: 'xl:hidden' },
                ]
                return (
                  <Fragment key={r.id}>
                    <TableRow className={cn(r.estornada && 'bg-muted/40 text-muted-foreground')}>
                      <TableCell className="w-10 p-0 pl-1 xl:hidden">
                        <BotaoExpandir
                          aberta={estaAberta(r.id)}
                          onClick={() => alternar(r.id)}
                          rotulo={`Detalhes de ${r.patrimonio}`}
                        />
                      </TableCell>
                      <CelulaData data={r.data} />
                      {ehGeral && (
                        <TableCell className="hidden whitespace-nowrap md:table-cell">{r.filial}</TableCell>
                      )}
                      <TableCell className="hidden sm:table-cell">{rotuloCategoria(r.categoria)}</TableCell>
                      <TableCell className="hidden whitespace-nowrap lg:table-cell">{r.modelo}</TableCell>
                      <CelulaPatrimonio
                        patrimonio={r.patrimonio}
                        ativoId={r.ativoId}
                        ehOperador={ehOperador}
                        estornada={r.estornada}
                        estornoData={r.estornoData}
                      />
                      <TableCell>
                        <PilulaTipo tipo={r.tipo} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{r.motivo ?? '—'}</TableCell>
                      <TableCell className="hidden whitespace-nowrap lg:table-cell">
                        {r.colaborador ?? '—'}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap xl:table-cell">{r.setor ?? '—'}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {r.itensFaltantes && r.itensFaltantes.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {r.itensFaltantes.map((it) => (
                              <span
                                key={it}
                                className="rounded border border-amber-300 bg-amber-50 px-1.5 text-[11px] text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              >
                                {rotuloAcessorio(it)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <CelulaObs texto={r.obs} className="hidden xl:table-cell" />
                    </TableRow>
                    {estaAberta(r.id) && (
                      <LinhaDetalhe colSpan={12} campos={detalhe} className="xl:hidden" />
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
