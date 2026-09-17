'use client'

import { Fragment, useMemo } from 'react'
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
import { rotuloCategoria } from '@/lib/dominio'
import { rotuloTipoItem, type MapaRotulosTipo } from '@/lib/itens/rotulo-tipo'
import { cn } from '@/lib/utils'
import { LegendaEstorno, LegendaTroca } from '@/components/relatorios/legendas'
import { AvisoTetoTabela } from '@/components/relatorios/aviso-teto-tabela'
import { QuadroDeTabela } from '@/components/layout/quadro-de-tabela'
import { totalDaTabela } from '@/lib/relatorios/teto-tabela'
import type { CorteDeTabela, LinhaEntrada } from '@/lib/relatorios/tipos'

const CAMPOS: CampoFiltro[] = ['filial', 'categoria', 'motivo']

// Campos textuais da busca livre (F16/T3).
//
// ⚠ F39 — deixou de ser ref de MÓDULO porque passou a depender do mapa de
// rótulos (`tipos_item`), que vem por prop. A estabilidade da ref, que é o que
// importa para o `useFiltrosTabela`, é preservada pelo `useMemo` lá embaixo:
// o mapa é uma constante de render do Server Component pai.
const buscaTextoCom =
  (rotulosTipo: MapaRotulosTipo) => (r: LinhaEntrada) => [
    r.filial,
    rotuloCategoria(r.categoria),
    r.modelo,
    r.patrimonio,
    r.motivo,
    r.colaborador,
    r.setor,
    ...(r.itensFaltantes ?? []).map((it) => rotuloTipoItem(it, rotulosTipo)),
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
  rotulosTipo,
  ehOperador,
  corte,
  aoVivo,
}: {
  rows: LinhaEntrada[]
  ehGeral: boolean
  // F39 — o vocabulário dos itens faltantes vem do catálogo `tipos_item`, por
  // PROP do Server Component. ⚠ Esta tabela também serve quem entrou por SENHA, e
  // essa sessão roda com o client ADMINISTRATIVO: quem lê `tipos_item` lá em cima
  // usa o client RESOLVIDO, senão o relatório impresso sairia com o slug cru.
  rotulosTipo: MapaRotulosTipo
  ehOperador?: boolean
  /** F60 — presente só quando a leitura cortou a tabela no teto (`snapshot.tabelasTruncadas`). */
  corte?: CorteDeTabela
  aoVivo?: boolean
}) {
  // A ref estável que `useFiltrosTabela` espera: o mapa é constante de render
  // (vem pronto do Server Component), então o memo devolve sempre a mesma função.
  const buscaTexto = useMemo(() => buscaTextoCom(rotulosTipo), [rotulosTipo])
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
    buscaTexto,
    buscaPatrimonio: BUSCA_PATRIMONIO,
  })
  const { estaAberta, alternar } = useExpandidas()

  return (
    <section id="entradas" className="scroll-mt-28 space-y-3 break-before-page">
      {/* F60 — o mesmo regime de `TabelaSaidas`: com corte, total exato no título, aviso, e
          nenhum chip de resumo somando as linhas carregadas como se fossem o período. O número
          exato por motivo de devolução está no card "Devoluções por motivo". */}
      <CabecalhoDetalhe
        titulo="Entradas"
        total={totalDaTabela(rows, corte)}
        exibidas={temRecorte ? filtradas.length : undefined}
      />
      <AvisoTetoTabela corte={corte} plural="entradas" aoVivo={aoVivo} />
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
            ? 'Nenhuma entrada encontrada com os filtros atuais.'
            : 'Nenhuma entrada no período.'}
        </p>
      ) : (
        <QuadroDeTabela>
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
                <TableHead className="hidden lg:table-cell print:table-cell">Colaborador</TableHead>
                <TableHead className="hidden xl:table-cell print:table-cell">Setor</TableHead>
                <TableHead className="hidden md:table-cell print:table-cell">Itens faltantes</TableHead>
                <TableHead className="hidden xl:table-cell print:table-cell">Obs.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((r) => {
                const faltantes =
                  r.itensFaltantes && r.itensFaltantes.length > 0
                    ? r.itensFaltantes.map((it) => rotuloTipoItem(it, rotulosTipo)).join(', ')
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
                      <TableCell className="hidden whitespace-nowrap lg:table-cell print:table-cell">
                        {r.colaborador ?? '—'}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap xl:table-cell print:table-cell">{r.setor ?? '—'}</TableCell>
                      <TableCell className="hidden md:table-cell print:table-cell">
                        {r.itensFaltantes && r.itensFaltantes.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {r.itensFaltantes.map((it) => (
                              <span
                                key={it}
                                // F19 — a borda tinha ficado sem par no escuro:
                                // amber-300 acendia sobre o fundo amber-950.
                                className="rounded-full border border-amber-300 bg-amber-50 px-1.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              >
                                {rotuloTipoItem(it, rotulosTipo)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
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
        </QuadroDeTabela>
      )}
      {filtradas.some((r) => r.estornada) && <LegendaEstorno />}
      {filtradas.some((r) => r.tipo === 'troca') && <LegendaTroca />}
    </section>
  )
}
