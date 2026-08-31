import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClipboardCheck, PackageOpen, PackagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getOperador } from '@/lib/auth/acesso'
import { eAdmin, podeEscrever } from '@/lib/auth/papeis'
import {
  filiaisParaEscrita,
  podeEscreverNaFilial,
} from '@/components/layout/permissoes'
import { listarFiliais } from '@/lib/queries/filiais'
import {
  getHistoricoLancamentos,
  getSaldosItens,
  getSaldosItensDeFiliais,
  getSaldosPorFilial,
  getUltimoLancamento,
  listarItensAtivos,
  listarLancamentosParaSaldoApos,
  type SaldoItem,
} from '@/lib/queries/itens'
import { calcularSaldoApos, type LancamentoParaSaldoApos } from '@/lib/itens/saldo-apos'
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
import { Dica } from '@/components/ui/dica'
// ITN-05a — a mesma explicação de UMA linha por número (Total/Estoque/
// Atrelados/Falta) que a página de ajuda usa, sem redigitar a fórmula da
// coluna Falta aqui.
import { NUMEROS_ITEM } from '@/lib/ajuda/conteudo/itens-por-quantidade'
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
import { TransferirItemDialog } from '@/components/itens/transferir-item-dialog'
import { HistoricoLancamentos } from '@/components/itens/historico-lancamentos'
import { SaldosFiliaisTabela } from '@/components/itens/saldos-filiais'
import { BadgeRepor } from '@/components/itens/badge-repor'
import { estoquePorItem, minimoDoItem, minimosDoCatalogo } from '@/lib/itens/repor'
import {
  dataISO,
  ehFiltroDeFilial,
  ehVisaoConsolidado,
  idNumerico,
  paginaNumerica,
} from '@/lib/url-params'
import { resolverFiliaisIds } from '@/lib/filtros/filial'
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { RealtimeRefresh } from '@/components/relatorios/realtime-refresh'

// FLX-03 — título curto da aba (WCAG 2.4.2).
export const metadata = {
  title: 'Itens',
}

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

  // Visão dos saldos (F11 · I4; default INVERTIDO na F25): a tela abre com as
  // filiais LADO A LADO — é a pergunta que o operador faz primeiro ("onde tem
  // mouse sobrando?"). Só a sentinela explícita `visao=consolidado` desliga;
  // ausência e lixo caem no padrão novo, e `?visao=filiais` (favorito antigo)
  // continua significando exatamente o que significava.
  const visaoFiliais = !ehVisaoConsolidado(primeiro(sp.visao))

  // Na visão por filial NÃO existe recorte de filial: a tabela mostra todas e o
  // select nem é renderizado. O param é neutralizado aqui, no PARSE — não só no
  // alternador de visão —, porque uma URL `?visao=filiais&filial=N` (clique no
  // select durante a navegação pendente, link colado) recortaria o histórico, o
  // CSV de saldos e o pré-preenchimento do lançamento sem nenhum controle
  // visível na tela para ver ou desfazer o filtro.
  //
  // ⚠ F25 — com o default invertido esta neutralização passou a valer POR PADRÃO:
  // um favorito antigo `/itens?filial=3` deixa de recortar até que o usuário vá ao
  // Consolidado. É mudança de sentido de URL antiga, registrada em DECISOES.
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
  // ITN-03b — busca por chamado/colaborador. Param `busca`, não `q` (que já é o
  // filtro de SALDOS nesta mesma página — ver o comentário em historico-filtros.tsx).
  const buscaFiltro = (primeiro(sp.busca) ?? '').trim() || null

  // Ponto de reposição (F12 · I5): o aviso "repor" compara SEMPRE com o estoque
  // CONSOLIDADO (decisão do Johnny 22/07/2026 — o mínimo é do item, não da
  // filial). Na visão consolidada sem recorte, `saldos` já É o consolidado; com
  // `?filial=N` os números da tabela são daquela filial e o consolidado precisa
  // de uma leitura própria (mesma RPC, em paralelo com as outras) — sem ela o
  // badge julgaria por um saldo parcial e apareceria em item que tem sobra nas
  // outras filiais. Na visão por filial o consolidado já vem em cada linha.
  // F25 — as filiais vêm antes do resto: o filtro tem padrão por cargo.
  const filiais = await listarFiliais()
  const filialIds = visaoFiliais
    ? []
    : resolverFiliaisIds(
        primeiro(sp.filial),
        operador,
        filiais.map((f) => f.id),
      )

  const consolidadoAparte = !visaoFiliais && filialIds.length > 0

  // ITN-03a — "Saldo após" só faz sentido com EXATAMENTE 1 item + 1 filial no
  // recorte (o saldo de um item é por filial; ver `saldo-apos.ts`). A visão
  // por filial nunca entra aqui: ela zera `filialIds` de propósito (§ acima).
  const mostrarSaldoApos = !visaoFiliais && filialIds.length === 1 && itemFiltro != null

  const [itensAtivos, saldos, ultimo, historico, saldosConsolidados, saldosFiliais, lancamentosSaldoApos] =
    await Promise.all([
      listarItensAtivos(),
      // Na visão por filial esta leitura não é usada (a de baixo traz o
      // consolidado junto) — não se gasta a chamada à toa.
      visaoFiliais ? Promise.resolve<SaldoItem[]>([]) : getSaldosItensDeFiliais(filialIds),
      getUltimoLancamento(operador.id),
      getHistoricoLancamentos({
        filialIds,
        itemId: itemFiltro,
        tipo: tipoFiltro,
        de: deFiltro,
        ate: ateFiltro,
        busca: buscaFiltro,
        // ITN-03a — quando a coluna "Saldo após" aparece, a grade passa a ser
        // ordenada pela data de NEGÓCIO, que é a ordem em que a coluna foi
        // calculada. Sem isso, um lançamento retroativo faria a coluna descer
        // fora de ordem (achado da revisão adversarial).
        ordenarPorData: mostrarSaldoApos,
        page,
        pageSize: 20,
      }),
      consolidadoAparte ? getSaldosItens(null) : Promise.resolve<SaldoItem[]>([]),
      // ⚠ F25 — esta leitura (1 + nº de filiais chamadas da mesma RPC) rodava
      // FORA do `Promise.all`, em `await` sequencial. Enquanto era o caminho raro
      // dava para conviver; virando o PADRÃO da tela, seriam 6 RPCs em série em
      // toda abertura de /itens. Ela não depende de nada aqui além de `filiais`,
      // que já está resolvida — então entra no paralelo.
      visaoFiliais ? getSaldosPorFilial(filiais) : Promise.resolve(null),
      // ITN-03a — histórico COMPLETO do item×filial (sem tipo/data/busca/
      // página), só quando a coluna vai aparecer. Entra no mesmo paralelo: não
      // depende de nenhuma das outras leituras, só de `filialIds`/`itemFiltro`,
      // já resolvidos.
      mostrarSaldoApos
        ? listarLancamentosParaSaldoApos(itemFiltro, filialIds[0])
        : Promise.resolve<LancamentoParaSaldoApos[]>([]),
    ])

  const porGrupo = agruparSaldos(saldos, q, grupoFiltro)
  const porGrupoFiliais = agruparSaldos(saldosFiliais?.itens ?? [], q, grupoFiltro)

  // F21 — três decisões de cargo nesta tela:
  //  · `escreve` (≥ operador): lançar e estornar. Consulta lê saldos e histórico.
  //  · `admin`: criar item no catálogo pelo combobox do lançamento — o atalho que
  //    contorna /admin/itens, e `criarItemInline` agora exige admin.
  //  · `filiaisEscrita`: a filial do LANÇAMENTO (escrita). Os filtros e as
  //    colunas por filial continuam com a lista inteira — leitura é ampla.
  const escreve = podeEscrever(operador.papel)
  const admin = eAdmin(operador.papel)
  const filiaisEscrita = filiaisParaEscrita(operador, filiais)
  // O `?filial=N` da tela é um filtro de LEITURA: só vale como pré-seleção do
  // lançamento se for uma filial em que este cargo escreve — senão o dialog
  // abriria com um valor fora das opções.
  //
  // F25 — com MULTI-seleção, pré-selecionar só faz sentido quando a lista efetiva
  // tem EXATAMENTE uma filial: com duas marcadas não há "a filial da tela", e
  // escolher uma delas seria adivinhar. Com 2+, o dialog abre sem preset.
  //
  // ⚠ E NÃO se estende ao padrão do cargo quando `filialIds` está vazio. A revisão
  // da F25 chegou a tentar: seria inerte no caso que motivava (na visão "por filial"
  // quem desenha o "+" é `SaldosFiliaisTabela`, que NÃO recebe preset — decisão
  // deliberada dela, "o + é da LINHA, não da célula"), e ativo justamente no caso
  // errado (`?filial=todas`, onde o operador acabou de pedir para ver tudo e
  // receberia a filial dele de volta no diálogo).
  const filialUnica = filialIds.length === 1 ? filialIds[0] : null
  const filialPreset = podeEscreverNaFilial(operador, filialUnica) ? filialUnica : null

  // Cruzamento catálogo × saldo do aviso "repor". `listarItensAtivos` só traz
  // item ATIVO e a RPC traz ativo OU com lançamento: item desativado que ainda
  // tem saldo fica de fora do mapa e vale mínimo 0 — nunca alerta (repor.ts).
  const minimos = minimosDoCatalogo(itensAtivos)
  const estoqueConsolidado = estoquePorItem(
    consolidadoAparte ? saldosConsolidados : saldos,
  )

  // ITN-03a — "Saldo após". A âncora (`saldoAtualItem`) vem da MESMA leitura
  // de saldos já usada na tabela de cima — sem chamada extra. Sem ela (item do
  // `?item=` não aparece nos saldos — id inválido, item nunca ativo) a coluna
  // simplesmente não aparece, em vez de arriscar a conta sem âncora.
  const saldoAtualItem = mostrarSaldoApos
    ? saldos.find((s) => s.item_id === itemFiltro)
    : undefined
  const resultadoSaldoApos =
    mostrarSaldoApos && saldoAtualItem
      ? calcularSaldoApos(lancamentosSaldoApos, saldoAtualItem)
      : null
  const saldoAposPorId = resultadoSaldoApos
    ? new Map(resultadoSaldoApos.linhas.map((l) => [l.id, l.saldoApos]))
    : undefined

  const blocosVazios = (visaoFiliais ? porGrupoFiliais : porGrupo).length === 0
  // ⚠ F25 — o `filial` conta como FILTRO só quando veio da URL. Usar a lista
  // RESOLVIDA aqui faria `temFiltro` ser SEMPRE true para o operador (o padrão do
  // cargo nunca é vazio): o estado vazio diria "nada com esses filtros" onde a
  // verdade é "não há nada cadastrado", e ofereceria um "Limpar filtros" que
  // recai no MESMO recorte — botão morto. É a mesma régua dos componentes de
  // filtro, que já olham `params.get('filial')`.
  // (na visão por filial o `filial` é neutralizado, então nem chega aqui)
  const temFiltroSaldos = Boolean(
    q || grupoFiltro || (!visaoFiliais && ehFiltroDeFilial(primeiro(sp.filial))),
  )
  // ⚠ ...e, como nas outras listas, o RECORTE DO CARGO não aparece na URL mas
  // recorta a leitura: sem isto o operador de Serra, no Consolidado, lia "Nenhum
  // saldo ainda" — afirmação global — com as outras filiais cheias de item.
  const temRecorteSaldos = filialIds.length > 0 && filialIds.length < filiais.length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight">Itens por quantidade</h1>
            <LinkAjuda pagina="itens-por-quantidade" rotulo="Ajuda sobre itens por quantidade" />
          </div>
          <p className="text-sm text-muted-foreground">
            Acessórios, periféricos e componentes — total, em estoque, reservado e falta por filial.
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
              só navegar até aqui (achado F12-W4-08). Fora do dialog não fica
              nada de lançamento montado: o atalho `L` mora DENTRO dele, então
              para o cargo Consulta a tecla também deixa de existir. */}
          {/* F31 · ITN-04 — a conferência é de quem grava ajustes; com nenhuma
              filial de escrita não há o que conferir. Ela leva para uma ROTA
              PRÓPRIA (o porquê está no cabeçalho de itens/conferencia/page.tsx),
              e a filial é escolhida lá: aqui a tela pode estar no Consolidado,
              com duas filiais marcadas ou com nenhuma — não há "a filial da
              tela" para presumir. Quando há UMA só no filtro, ela vai no link. */}
          {escreve && filiaisEscrita.length > 0 && (
            <Button asChild variant="outline" className="gap-2">
              <Link
                href={
                  filialPreset
                    ? `/itens/conferencia?filial=${filialPreset}`
                    : '/itens/conferencia'
                }
              >
                <ClipboardCheck className="size-4" />
                Conferir estoque
              </Link>
            </Button>
          )}
          {/* F31 · ITN-01 — transferir exige escrever nas DUAS pontas, então o
              botão só existe para quem tem ao menos DUAS filiais de escrita.
              Com uma só, não há transferência possível e um botão que sempre
              recusa é pior que botão nenhum. (A validação dura é do servidor:
              `exigirEscrita` nas duas + a policy `operador lanca`, que a RPC
              atravessa linha a linha.) */}
          {escreve && filiaisEscrita.length >= 2 && (
            <TransferirItemDialog itens={itensAtivos} filiais={filiaisEscrita} />
          )}
          {/* F41 — `podeCriarItem` era `admin`, e virou `escreve`: quem lança no
              acervo passou a CRIAR item de catálogo, porque exigir admin no meio do
              lançamento quebrava o fluxo na mão do operador (mesma razão da F37/D5
              com colaborador). A guarda de verdade continua no servidor
              (`exigirPapel(…, 'operador')`) e na policy `pode_escrever()` da 0125;
              aqui é só a tela deixar de esconder a opção. Editar e desativar item
              seguem sendo do nível administrador. */}
          {escreve && (
            <LancarItemDialog
              itens={itensAtivos}
              filiais={filiaisEscrita}
              ultimo={ultimo}
              abrirAoMontar={primeiro(sp.lancar) === '1'}
              podeCriarItem={escreve}
            />
          )}
        </div>
      </div>

      <ItensFiltros filiais={filiais} filiaisSelecionadas={filialIds.map(String)} />

      {/* Saldos por item */}
      {blocosVazios ? (
        itensAtivos.length === 0 ? (
          <EstadoVazio
            icone={PackagePlus}
            titulo="Nenhum item no catálogo"
            descricao={
              admin
                ? 'Cadastre o catálogo em Administração → Itens para começar a lançar quantidades.'
                : 'O catálogo de itens é cadastrado por um administrador (Administração → Itens).'
            }
            acao={
              admin
                ? { href: '/admin/itens', rotulo: 'Ir para Administração → Itens' }
                : undefined
            }
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
        ) : temRecorteSaldos ? (
          <EstadoVazio
            icone={PackageOpen}
            titulo="Nenhum saldo nas suas filiais"
            descricao="Este Consolidado abre recortado nas filiais em que você opera — as outras podem ter saldo."
            acao={{ href: '/itens?visao=consolidado&filial=todas', rotulo: 'Ver todas as filiais' }}
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
                  podeLancar={escreve}
                  // F31 · ITN-01 — o atalho de transferência da CÉLULA. A lista
                  // (e não um booleano) porque a decisão é por coluna: o
                  // operador de Serra vê o atalho na coluna dele e não na das
                  // outras. Vazia quando há menos de duas filiais de escrita —
                  // o mesmo critério do botão do cabeçalho.
                  filiaisTransferencia={
                    filiaisEscrita.length >= 2 ? filiaisEscrita.map((f) => f.id) : []
                  }
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
                      {/* ITN-05a — cada cabeçalho explica o número em UMA linha
                          (a visão por filial já explica pelo `title` da
                          célula; aqui não há célula por filial para carregar
                          isso). Texto vem de `NUMEROS_ITEM`, a mesma fonte da
                          página de ajuda. */}
                      {NUMEROS_ITEM.map((n) => (
                        <TableHead key={n.chave} className="text-right">
                          <Dica texto={n.explicacao}>{n.rotulo}</Dica>
                        </TableHead>
                      ))}
                      {/* Coluna de AÇÃO: some inteira para quem não lança, em vez
                          de sobrar uma coluna vazia em todas as linhas. */}
                      {escreve && (
                        <TableHead className="w-px text-right">
                          <span className="sr-only">Ações</span>
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bloco.itens.map((s) => (
                      <TableRow key={s.item_id}>
                        {/* "repor" fica junto do NOME, não na coluna Falta: os
                            dois avisos convivem na mesma linha e significam
                            coisas diferentes ("faltam N" = reservado − em estoque,
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
                              title={`Compromisso já assumido: ${s.atrelados.toLocaleString('pt-BR')} reservado(s) para chamados e só ${s.estoque.toLocaleString('pt-BR')} em estoque`}
                            >
                              faltam {s.falta.toLocaleString('pt-BR')}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {escreve && (
                          <TableCell className="py-1 text-right">
                            <LancarItemLinha
                              itemId={s.item_id}
                              item={s.item}
                              filialId={filialPreset}
                            />
                          </TableCell>
                        )}
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
        <HistoricoLancamentos
          rows={historico.rows}
          podeEstornar={escreve}
          saldoAposPorId={saldoAposPorId}
          motivoSaldoAposDegradado={resultadoSaldoApos?.motivoDegradado ?? null}
        />
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
