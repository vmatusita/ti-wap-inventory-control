import { redirect } from 'next/navigation'
import { PackageOpen, PackagePlus } from 'lucide-react'
import { getOperador } from '@/lib/auth/acesso'
import { listarFiliais } from '@/lib/queries/filiais'
import {
  getHistoricoLancamentos,
  getSaldosItens,
  getSaldosPorFilial,
  getUltimoLancamento,
  listarItensAtivos,
  type SaldoItem,
} from '@/lib/queries/itens'
import {
  GRUPO_ITEM_META,
  GRUPO_ITEM_ORDEM,
  type GrupoItem,
  type TipoLancamento,
} from '@/lib/dominio'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import { ExportarCsvButton } from '@/components/layout/exportar-csv-button'
import {
  exportarItensHistoricoCSV,
  exportarItensSaldosCSV,
} from '@/lib/actions/exportar'
import { ItensFiltros } from '@/components/itens/itens-filtros'
import { HistoricoFiltros } from '@/components/itens/historico-filtros'
import { LancarItemDialog } from '@/components/itens/lancar-item-dialog'
import { LancarItemLinha } from '@/components/itens/lancar-item-linha'
import { HistoricoLancamentos } from '@/components/itens/historico-lancamentos'
import { SaldosFiliaisTabela } from '@/components/itens/saldos-filiais'
import { BadgeRepor } from '@/components/itens/badge-repor'
import { estoquePorItem, minimoDoItem, minimosDoCatalogo } from '@/lib/itens/repor'
import { dataISO, idNumerico, paginaNumerica } from '@/lib/url-params'
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { RealtimeRefresh } from '@/components/relatorios/realtime-refresh'

type SearchParams = { [key: string]: string | string[] | undefined }

function primeiro(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

// Params do histórico (F9 · I3) são validados em `@/lib/url-params` — fonte
// única desde a F12 (W6A), depois de a auditoria provar que as cópias em
// /itens, /movimentacoes e actions/exportar tinham divergido. Valor fora do
// formato OU DA FAIXA é IGNORADO (nunca derruba a página nem vira filtro
// inválido no banco).

// Lista explícita (não `in TIPO_LANCAMENTO_META`, que aceitaria chaves herdadas
// do prototype — `?tipo=constructor` viraria um cast inválido de enum no banco).
const TIPOS_LANCAMENTO: readonly TipoLancamento[] = [
  'entrada',
  'saida',
  'reserva',
  'liberacao',
  'retorno',
  'ajuste',
]

function tipoValido(v: string | undefined): TipoLancamento | null {
  return v && (TIPOS_LANCAMENTO as readonly string[]).includes(v)
    ? (v as TipoLancamento)
    : null
}

// Agrupa os saldos por grupo aplicando os filtros de tela (`q` e `grupo`), que
// são client-side (a lista de itens é curta). Uma função só para as DUAS visões
// — consolidada e por filial — filtrarem exatamente igual (F11 · I4).
type LinhaSaldo = { item: string; grupo: GrupoItem }

function agruparSaldos<T extends LinhaSaldo>(
  linhas: T[],
  q: string,
  grupo: GrupoItem | undefined,
): { grupo: GrupoItem; itens: T[] }[] {
  const filtradas = linhas.filter(
    (l) => (!grupo || l.grupo === grupo) && (!q || l.item.toLowerCase().includes(q)),
  )
  return GRUPO_ITEM_ORDEM.map((g) => ({
    grupo: g,
    itens: filtradas.filter((l) => l.grupo === g),
  })).filter((bloco) => bloco.itens.length > 0)
}

export default async function ItensPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const operador = await getOperador()
  if (!operador) redirect('/login')

  const sp = await searchParams

  // Visão dos saldos (F11 · I4): 'filiais' = as filiais lado a lado; QUALQUER
  // outro valor (inclusive lixo na URL) cai no consolidado, que é o default.
  const visaoFiliais = primeiro(sp.visao) === 'filiais'

  // Na visão por filial NÃO existe recorte de filial: a tabela mostra todas e o
  // select nem é renderizado. O param é neutralizado aqui, no PARSE — não só no
  // alternador de visão —, porque uma URL `?visao=filiais&filial=N` (clique no
  // select durante a navegação pendente, link colado) recortaria o histórico, o
  // CSV de saldos e o pré-preenchimento do lançamento sem nenhum controle
  // visível na tela para ver ou desfazer o filtro.
  const filialId = visaoFiliais ? null : idNumerico(primeiro(sp.filial))
  const grupoFiltro = primeiro(sp.grupo) as GrupoItem | undefined
  const q = (primeiro(sp.q) ?? '').trim().toLowerCase()
  // Teto de página (F12-W4-05): `Math.max(1, Number(...))` deixava passar
  // `?page=99999999999999999999`, que vira 1e20 e faz o postgrest-js serializar
  // `offset=2e+21` — descartado EM SILÊNCIO pelo servidor (200, sem PGRST103),
  // com o rodapé anunciando a página 1e+20 e um "Anterior" idempotente.
  const page = paginaNumerica(primeiro(sp.page))

  // Filtros só do histórico (a filial vale para os dois blocos).
  const itemFiltro = idNumerico(primeiro(sp.item))
  const tipoFiltro = tipoValido(primeiro(sp.tipo))
  const deFiltro = dataISO(primeiro(sp.de))
  const ateFiltro = dataISO(primeiro(sp.ate))

  // Ponto de reposição (F12 · I5): o aviso "repor" compara SEMPRE com o estoque
  // CONSOLIDADO (decisão do Johnny 22/07/2026 — o mínimo é do item, não da
  // filial). Na visão consolidada sem recorte, `saldos` já É o consolidado; com
  // `?filial=N` os números da tabela são daquela filial e o consolidado precisa
  // de uma leitura própria (mesma RPC, em paralelo com as outras) — sem ela o
  // badge julgaria por um saldo parcial e apareceria em item que tem sobra nas
  // outras filiais. Na visão por filial o consolidado já vem em cada linha.
  const consolidadoAparte = !visaoFiliais && filialId !== null

  const [filiais, itensAtivos, saldos, ultimo, historico, saldosConsolidados] =
    await Promise.all([
      listarFiliais(),
      listarItensAtivos(),
      // Na visão por filial esta leitura não é usada (a de baixo traz o
      // consolidado junto) — não se gasta a chamada à toa.
      visaoFiliais ? Promise.resolve<SaldoItem[]>([]) : getSaldosItens(filialId),
      getUltimoLancamento(operador.id),
      getHistoricoLancamentos({
        filialId,
        itemId: itemFiltro,
        tipo: tipoFiltro,
        de: deFiltro,
        ate: ateFiltro,
        page,
        pageSize: 20,
      }),
      consolidadoAparte ? getSaldosItens(null) : Promise.resolve<SaldoItem[]>([]),
    ])

  // Leitura extra SÓ da visão por filial: nº de filiais + 1 chamada da mesma RPC
  // dos saldos. A visão consolidada (default) continua com as leituras de antes.
  const saldosFiliais = visaoFiliais ? await getSaldosPorFilial(filiais) : null

  const porGrupo = agruparSaldos(saldos, q, grupoFiltro)
  const porGrupoFiliais = agruparSaldos(saldosFiliais?.itens ?? [], q, grupoFiltro)

  // Cruzamento catálogo × saldo do aviso "repor". `listarItensAtivos` só traz
  // item ATIVO e a RPC traz ativo OU com lançamento: item desativado que ainda
  // tem saldo fica de fora do mapa e vale mínimo 0 — nunca alerta (repor.ts).
  const minimos = minimosDoCatalogo(itensAtivos)
  const estoqueConsolidado = estoquePorItem(
    consolidadoAparte ? saldosConsolidados : saldos,
  )

  const blocosVazios = (visaoFiliais ? porGrupoFiliais : porGrupo).length === 0
  // `filialId` já é nulo na visão por filial (ver o parse acima).
  const temFiltroSaldos = Boolean(q || grupoFiltro || filialId)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight">Itens por quantidade</h1>
            <LinkAjuda ancora="itens" rotulo="Ajuda sobre itens por quantidade" />
          </div>
          <p className="text-sm text-muted-foreground">
            Acessórios, periféricos e componentes — total, estoque, atrelados e falta por filial.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RealtimeRefresh />
          <ExportarCsvButton
            acao={exportarItensSaldosCSV}
            rotulo="Exportar saldos"
            descricao="dos itens filtrados"
          />
          {/* `?lancar=1` chega da paleta de comandos (Ctrl+K → "Lançar item"):
              o item vive no grupo AÇÕES e agora dispara mesmo a ação, em vez de
              só navegar até aqui (achado F12-W4-08). */}
          <LancarItemDialog
            itens={itensAtivos}
            filiais={filiais}
            ultimo={ultimo}
            abrirAoMontar={primeiro(sp.lancar) === '1'}
          />
        </div>
      </div>

      <ItensFiltros filiais={filiais} />

      {/* Saldos por item */}
      {blocosVazios ? (
        itensAtivos.length === 0 ? (
          <EstadoVazio
            icone={PackagePlus}
            titulo="Nenhum item no catálogo"
            descricao="Cadastre o catálogo em Administração → Itens para começar a lançar quantidades."
            acao={{ href: '/admin/itens', rotulo: 'Ir para Administração → Itens' }}
          />
        ) : temFiltroSaldos ? (
          <EstadoVazio
            icone={PackageOpen}
            titulo="Nenhum item com esses filtros"
            descricao={
              visaoFiliais
                ? 'Ajuste a busca ou o grupo para ver os saldos.'
                : 'Ajuste a busca, o grupo ou a filial para ver os saldos.'
            }
          />
        ) : (
          <EstadoVazio
            icone={PackageOpen}
            titulo="Nenhum saldo ainda"
            descricao="Os saldos aparecem aqui assim que houver o primeiro lançamento."
          />
        )
      ) : visaoFiliais && saldosFiliais ? (
        <div className="space-y-4">
          {porGrupoFiliais.map((bloco) => (
            <section key={bloco.grupo} className="rounded-xl border bg-card">
              <h2 className="flex flex-wrap items-baseline justify-between gap-x-3 border-b px-4 py-2.5 text-sm font-semibold">
                {GRUPO_ITEM_META[bloco.grupo].titulo}
                <span className="text-xs font-normal text-muted-foreground">
                  estoque na prateleira de cada filial
                </span>
              </h2>
              <div className="overflow-hidden">
                <SaldosFiliaisTabela
                  filiais={saldosFiliais.filiais}
                  itens={bloco.itens}
                  minimos={minimos}
                />
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {porGrupo.map((bloco) => (
            <section key={bloco.grupo} className="rounded-xl border bg-card">
              <h2 className="border-b px-4 py-2.5 text-sm font-semibold">
                {GRUPO_ITEM_META[bloco.grupo].titulo}
              </h2>
              <div className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Estoque</TableHead>
                      <TableHead className="text-right">Atrelados</TableHead>
                      <TableHead className="text-right">Falta</TableHead>
                      <TableHead className="w-px text-right">
                        <span className="sr-only">Ações</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bloco.itens.map((s) => (
                      <TableRow key={s.item_id}>
                        {/* "repor" fica junto do NOME, não na coluna Falta: os
                            dois avisos convivem na mesma linha e significam
                            coisas diferentes ("faltam N" = atrelados − estoque,
                            compromisso já assumido; "repor" = previsão de
                            compra). Empilhados na mesma célula estreita, um
                            passaria por qualificador do outro. */}
                        <TableCell className="font-medium">
                          <span className="flex flex-wrap items-center gap-1.5">
                            {s.item}
                            <BadgeRepor
                              estoqueConsolidado={estoqueConsolidado[s.item_id] ?? null}
                              estoqueMinimo={minimoDoItem(minimos, s.item_id)}
                            />
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {s.total.toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {s.estoque.toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {s.atrelados > 0 ? s.atrelados.toLocaleString('pt-BR') : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {s.falta > 0 ? (
                            // O `title` faz par com o do badge "repor": os dois
                            // convivem na mesma linha, em cores diferentes, e
                            // significam coisas diferentes — sem a explicação,
                            // distingui-los depende de já saber a fórmula.
                            <Badge
                              className="border-transparent bg-red-100 text-red-700 tabular-nums dark:bg-red-950 dark:text-red-300"
                              title={`Compromisso já assumido: ${s.atrelados.toLocaleString('pt-BR')} atrelado(s) a equipamentos e só ${s.estoque.toLocaleString('pt-BR')} em estoque`}
                            >
                              faltam {s.falta.toLocaleString('pt-BR')}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1 text-right">
                          <LancarItemLinha
                            itemId={s.item_id}
                            item={s.item}
                            filialId={filialId}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Histórico de lançamentos */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Histórico de lançamentos</h2>
          <ExportarCsvButton
            acao={exportarItensHistoricoCSV}
            rotulo="Exportar histórico"
            descricao="dos lançamentos filtrados"
            size="sm"
          />
        </div>
        <HistoricoFiltros itens={itensAtivos} />
        <HistoricoLancamentos rows={historico.rows} />
        {historico.total > historico.pageSize && (
          <AtivosPaginacao
            page={historico.page}
            pageSize={historico.pageSize}
            total={historico.total}
          />
        )}
      </section>
    </div>
  )
}
