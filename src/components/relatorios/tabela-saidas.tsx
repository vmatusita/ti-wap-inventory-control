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
  CelulaChamado,
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
import { rotuloCategoria } from '@/lib/dominio'
import { cn } from '@/lib/utils'
import { LegendaEstorno } from '@/components/relatorios/legendas'
import { AvisoTetoTabela } from '@/components/relatorios/aviso-teto-tabela'
import { totalDaTabela } from '@/lib/relatorios/teto-tabela'
import type { CorteDeTabela, LinhaSaida } from '@/lib/relatorios/tipos'

const CAMPOS: CampoFiltro[] = ['filial', 'categoria', 'motivo']

// Campos textuais da busca livre (F16/T3) — refs de MÓDULO (estáveis): o `useMemo`
// da filtragem no hook depende delas. Inclui o patrimônio (para o caminho de
// substring puro) e todos os textos da linha.
const BUSCA_TEXTO = (r: LinhaSaida) => [
  r.filial,
  rotuloCategoria(r.categoria),
  r.modelo,
  r.patrimonio,
  r.motivo,
  r.chamado,
  r.colaboradorSetor,
  r.termo,
  r.obs,
]
const BUSCA_PATRIMONIO = (r: LinhaSaida) => r.patrimonio

// Saídas do período (§4.4 / §3.7.7): tipos saida + emprestimo. Contagem no
// título, resumo por (filial×)motivo, filtros internos (categoria, motivo, filial
// no consolidado) + busca livre (F16/T3). Colunas: Data · Filial · Categoria ·
// Marca/Modelo · Patrimônio · Tipo · Motivo · Chamado · Colaborador/Setor · Termo ·
// Obs. Filtros/resumo/células via os compartilhados (OS tech-debt 3.2). Filtros e
// busca na URL sob o prefixo `sd.` (F11/T10 · F16/T3) — sobrevivem ao F5 e viajam
// no link. `ehOperador` faz o patrimônio virar link p/ a ficha (viewer → texto).
export function TabelaSaidas({
  rows,
  ehGeral,
  ehOperador,
  corte,
  aoVivo,
}: {
  rows: LinhaSaida[]
  ehGeral: boolean
  ehOperador?: boolean
  /** F60 — presente só quando a leitura cortou a tabela no teto (`snapshot.tabelasTruncadas`). */
  corte?: CorteDeTabela
  aoVivo?: boolean
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
    prefixo: PREFIXO_FILTROS.saidas,
    ehGeral,
    resumoChave: chaveResumoMotivo,
    buscaTexto: BUSCA_TEXTO,
    buscaPatrimonio: BUSCA_PATRIMONIO,
  })
  const { estaAberta, alternar } = useExpandidas()

  return (
    <section id="saidas" className="scroll-mt-28 space-y-3 break-before-page">
      {/* F60 — com corte, o título diz o total EXATO do período (não as linhas que couberam), o
          aviso diz quantas estão na tela, e os chips do resumo por motivo SAEM: eles somam as
          linhas carregadas, e "Admissão: 812" sobre uma tabela cortada é um total do período com
          cara de certo e valor de recorte. O número exato por motivo está no card "Saídas por
          motivo", que vem do banco. Sem corte, nada disto muda. */}
      <CabecalhoDetalhe
        titulo="Saídas"
        total={totalDaTabela(rows, corte)}
        exibidas={temRecorte ? filtradas.length : undefined}
      />
      <AvisoTetoTabela corte={corte} plural="saídas" aoVivo={aoVivo} />
      {!corte && <ChipsResumo resumo={resumo} />}
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
          {temRecorte
            ? 'Nenhuma saída encontrada com os filtros atuais.'
            : 'Nenhuma saída no período.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          {/* REL-01 — `rel-print-compacta` só age em @media print (globals.css):
              encolhe fonte/padding e solta o `whitespace-nowrap` para as colunas que
              a tela esconde (`print:table-cell`) caberem em A4 retrato. */}
          <Table className="rel-print-compacta">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 p-0 xl:hidden print:hidden" aria-hidden />
                <TableHead>Data</TableHead>
                {ehGeral && <TableHead className="hidden md:table-cell print:table-cell">Filial</TableHead>}
                <TableHead className="hidden sm:table-cell print:table-cell">Categoria</TableHead>
                <TableHead className="hidden lg:table-cell print:table-cell">Marca/Modelo</TableHead>
                <TableHead>Patrimônio</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="hidden md:table-cell print:table-cell">Chamado</TableHead>
                <TableHead className="hidden lg:table-cell print:table-cell">Colab./Setor</TableHead>
                <TableHead className="hidden xl:table-cell print:table-cell">Termo</TableHead>
                <TableHead className="hidden xl:table-cell print:table-cell">Obs.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((r) => {
                // F16/T5 — o que some no mobile, revelado por toque (revelar = inverso
                // do `hidden <bp>:table-cell` da coluna).
                const detalhe: CampoDetalhe[] = [
                  ...(ehGeral
                    ? [{ rotulo: 'Filial', valor: r.filial, revelar: 'md:hidden' }]
                    : []),
                  { rotulo: 'Categoria', valor: rotuloCategoria(r.categoria), revelar: 'sm:hidden' },
                  { rotulo: 'Marca/Modelo', valor: r.modelo, revelar: 'lg:hidden' },
                  { rotulo: 'Chamado', valor: r.chamado ? `#${r.chamado}` : '—', revelar: 'md:hidden' },
                  { rotulo: 'Colab./Setor', valor: r.colaboradorSetor ?? '—', revelar: 'lg:hidden' },
                  { rotulo: 'Termo', valor: r.termo ?? '—', revelar: 'xl:hidden' },
                  { rotulo: 'Obs.', valor: r.obs ?? '—', revelar: 'xl:hidden' },
                ]
                return (
                  <Fragment key={r.id}>
                    <TableRow className={cn(r.estornada && 'bg-muted/40 text-muted-foreground')}>
                      <TableCell className="w-10 p-0 pl-1 xl:hidden print:hidden">
                        <BotaoExpandir
                          aberta={estaAberta(r.id)}
                          onClick={() => alternar(r.id)}
                          rotulo={`Detalhes de ${r.patrimonio}`}
                        />
                      </TableCell>
                      <CelulaData data={r.data} />
                      {ehGeral && (
                        <TableCell className="hidden whitespace-nowrap md:table-cell print:table-cell">{r.filial}</TableCell>
                      )}
                      <TableCell className="hidden sm:table-cell print:table-cell">{rotuloCategoria(r.categoria)}</TableCell>
                      <TableCell className="hidden whitespace-nowrap lg:table-cell print:table-cell">{r.modelo}</TableCell>
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
                      <CelulaChamado chamado={r.chamado} className="hidden md:table-cell print:table-cell" />
                      <TableCell className="hidden whitespace-nowrap lg:table-cell print:table-cell">
                        {r.colaboradorSetor ?? '—'}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap xl:table-cell print:table-cell">{r.termo ?? '—'}</TableCell>
                      <CelulaObs texto={r.obs} className="hidden xl:table-cell print:table-cell" />
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
      {filtradas.some((r) => r.estornada) && <LegendaEstorno />}
    </section>
  )
}
