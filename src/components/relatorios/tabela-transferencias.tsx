'use client'

import { Fragment } from 'react'
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
import { ChipsResumo, FiltrosTabela } from '@/components/relatorios/filtros-tabela'
import {
  BotaoExpandir,
  LinhaDetalhe,
  useExpandidas,
  type CampoDetalhe,
} from '@/components/relatorios/linha-expansivel'
import { useFiltrosTabela, PREFIXO_FILTROS } from '@/components/relatorios/use-filtros-tabela'
import { rotuloCategoria } from '@/lib/dominio'
import { cn } from '@/lib/utils'
import { LegendaEstorno } from '@/components/relatorios/legendas'
import { paresDeTransferencia } from '@/lib/relatorios/transferencias-resumo'
import { AvisoTetoTabela } from '@/components/relatorios/aviso-teto-tabela'
import { QuadroDeTabela } from '@/components/layout/quadro-de-tabela'
import { totalDaTabela } from '@/lib/relatorios/teto-tabela'
import type { CorteDeTabela, LinhaTransferencia } from '@/lib/relatorios/tipos'

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
  ehGeral,
  ehOperador,
  corte,
  aoVivo,
}: {
  rows: LinhaTransferencia[]
  /** F32/RV-11 — só o CONSOLIDADO ganha a linha-resumo dos pares. No relatório de
   *  uma filial a pergunta "quem mandou para quem?" já está respondida: uma das
   *  duas pontas é sempre a filial da aba, e os chips só repetiriam o nome dela. */
  ehGeral?: boolean
  ehOperador?: boolean
  /** F60 — presente só quando a leitura cortou a tabela no teto (`snapshot.tabelasTruncadas`). */
  corte?: CorteDeTabela
  aoVivo?: boolean
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
  const { estaAberta, alternar } = useExpandidas()
  const resumoDePares: [string, number][] = paresDeTransferencia(rows).map((p) => [
    `${p.de} → ${p.para}`,
    p.total,
  ])

  if (rows.length === 0) return null

  return (
    <section id="transferencias" className="scroll-mt-28 space-y-3 break-before-page">
      {/* F60 — com corte: total exato no título e o aviso (sem os selects de filtro, que esta
          tabela não tem). */}
      <CabecalhoDetalhe
        titulo="Transferências"
        total={totalDaTabela(rows, corte)}
        exibidas={temRecorte ? filtradas.length : undefined}
      />
      <AvisoTetoTabela corte={corte} plural="transferências" temFiltros={false} aoVivo={aoVivo} />
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
      {/* F32/RV-11 — a tabela lista movimento a movimento; no consolidado a
          pergunta é "quem mandou para quem?", e respondê-la exigia varrer as
          linhas. Os chips derivam em memória (groupBy de/para, função pura
          testada) e reusam o MESMO componente que Saídas e Entradas já usam —
          nada de gráfico: sankey para meia dúzia de pares é canhão em mosca.
          Deriva de `rows` (o período inteiro), não de `filtradas`: o resumo
          descreve o recorte do relatório, e mudar de forma a cada tecla da busca
          o transformaria noutra coisa. Nenhuma contagem muda.
          `imprimir` — aqui a linha é CONTEÚDO do relatório consolidado (a ajuda
          anuncia "um resumo 'filial de origem → filial de destino' acima da
          tabela"), não navegação de tela; sem a prop ela sumiria do papel pelo
          `print:hidden` padrão do componente, que existe para o outro uso dele
          (resumo de FILTRO em Saídas/Entradas).
          F60 — e SAI quando a tabela foi cortada no teto: "o período inteiro" deixa de ser o que
          `rows` contém, e "Matriz → Filial B: 640" somado sobre as linhas que couberam seria
          total de recorte com cara de total do período — o aviso logo acima diz por quê. */}
      {ehGeral && !corte && <ChipsResumo resumo={resumoDePares} imprimir />}

      {filtradas.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhuma transferência encontrada.
        </p>
      ) : (
        <QuadroDeTabela>
          {/* REL-01 — `rel-print-compacta` só age em @media print (globals.css):
              encolhe fonte/padding e solta o `whitespace-nowrap` para as colunas que
              a tela esconde (`print:table-cell`) caberem em A4 retrato. */}
          <Table className="rel-print-compacta">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 p-0 lg:hidden print:hidden" aria-hidden />
                <TableHead>Data</TableHead>
                <TableHead>De → Para</TableHead>
                <TableHead className="hidden sm:table-cell print:table-cell">Categoria</TableHead>
                <TableHead className="hidden lg:table-cell print:table-cell">Marca/Modelo</TableHead>
                <TableHead>Patrimônio</TableHead>
                <TableHead className="hidden md:table-cell print:table-cell">Chamado</TableHead>
                <TableHead className="hidden lg:table-cell print:table-cell">Obs.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((r) => {
                const detalhe: CampoDetalhe[] = [
                  { rotulo: 'Categoria', valor: rotuloCategoria(r.categoria), revelar: 'sm:hidden' },
                  { rotulo: 'Marca/Modelo', valor: r.modelo, revelar: 'lg:hidden' },
                  { rotulo: 'Chamado', valor: r.chamado ? `#${r.chamado}` : '—', revelar: 'md:hidden' },
                  { rotulo: 'Obs.', valor: r.obs ?? '—', revelar: 'lg:hidden' },
                ]
                return (
                  <Fragment key={r.id}>
                    <TableRow className={cn(r.estornada && 'bg-muted/40 text-muted-foreground')}>
                      <TableCell className="w-10 p-0 pl-1 lg:hidden print:hidden">
                        <BotaoExpandir
                          aberta={estaAberta(r.id)}
                          onClick={() => alternar(r.id)}
                          rotulo={`Detalhes de ${r.patrimonio}`}
                        />
                      </TableCell>
                      <CelulaData data={r.data} />
                      <TableCell className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {r.de}
                          <ArrowRight className="size-3 text-muted-foreground" />
                          {r.para}
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell print:table-cell">{rotuloCategoria(r.categoria)}</TableCell>
                      <TableCell className="hidden whitespace-nowrap lg:table-cell print:table-cell">{r.modelo}</TableCell>
                      <CelulaPatrimonio
                        patrimonio={r.patrimonio}
                        ativoId={r.ativoId}
                        ehOperador={ehOperador}
                        estornada={r.estornada}
                        estornoData={r.estornoData}
                      />
                      <CelulaChamado chamado={r.chamado} className="hidden md:table-cell print:table-cell" />
                      <CelulaObs texto={r.obs} className="hidden lg:table-cell print:table-cell" />
                    </TableRow>
                    {estaAberta(r.id) && (
                      <LinhaDetalhe colSpan={8} campos={detalhe} className="lg:hidden" />
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </QuadroDeTabela>
      )}
      {filtradas.some((r) => r.estornada) && <LegendaEstorno />}
    </section>
  )
}
