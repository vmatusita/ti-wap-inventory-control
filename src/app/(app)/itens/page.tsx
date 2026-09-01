import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClipboardCheck, PackageOpen, PackagePlus, ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getOperador } from '@/lib/auth/acesso'
import { eAdmin, podeEscrever } from '@/lib/auth/papeis'
import {
  filiaisParaEscrita,
  podeEscreverNaFilial,
} from '@/components/layout/permissoes'
import { listarFiliais } from '@/lib/queries/filiais'
import { listarTiposItem } from '@/lib/queries/tipos-item'
import {
  getSaldosPorFilial,
  getUltimoLancamento,
  listarItensAtivos,
} from '@/lib/queries/itens'
import {
  filtrarSaldos,
  montarLinhasDeItem,
  ordenarSaldos,
  paginarLinhas,
  rotuloSubtituloItens,
  tiposPorItemDoCatalogo,
} from '@/lib/itens/lista'
import { GRUPO_ITEM_ORDEM, type GrupoItem } from '@/lib/dominio'
// ITN-05a — a mesma explicação de UMA linha por número que a página de ajuda usa,
// sem redigitar a fórmula da coluna Falta aqui. A F42 acrescentou "Em uso" lá, e é
// de lá que o cabeçalho da coluna nova sai.
import { NUMEROS_ITEM } from '@/lib/ajuda/conteudo/itens-por-quantidade'
// F44 — a legenda com ESCOPO. `NUMEROS_ITEM` não muda uma vírgula (é fonte
// compartilhada com a página de ajuda, que descreve o significado SEM filtro): a
// frase com o nome da filial se DERIVA dela aqui, por função pura testada, e desce
// por prop para os cartões e para a tabela.
import { cabecalhosComEscopo, escopoDosNumeros } from '@/lib/itens/escopo'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { CabecalhoDaPagina, Pagina } from '@/components/layout/pagina'
import { ExportarCsvButton } from '@/components/layout/exportar-csv-button'
import { exportarItensSaldosCSV } from '@/lib/actions/exportar'
import { ItensFiltros } from '@/components/itens/itens-filtros'
import { ItensTable } from '@/components/itens/itens-table'
// F43 — o resumo do que está FILTRADO, e os primeiros consumidores de
// `CartaoDeMetrica`/`GradeDeMetricas` (que nasceram na F40 sem ninguém).
import { ResumoDeItens } from '@/components/itens/resumo-de-itens'
import { resumoDaLista } from '@/lib/itens/distribuicao'
import { LancarItemDialog } from '@/components/itens/lancar-item-dialog'
import { TransferirItemDialog } from '@/components/itens/transferir-item-dialog'
import { minimosDoCatalogo } from '@/lib/itens/repor'
import { ehFiltroDeFilial, paginaNumerica } from '@/lib/url-params'
import { resolverFiliaisIds } from '@/lib/filtros/filial'
// A paginação é a MESMA de `/ativos`, com o mesmo salto de página e o mesmo
// seletor de tamanho — e agora ela pagina os ITENS, não o histórico. `pp` e
// `TAMANHOS_PAGINA` saem da fonte única de `@/lib/ativos/lista` (doutrina F12/W6A:
// parser de URL não se copia).
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { TAMANHOS_PAGINA, TAMANHO_PAGINA_PADRAO, parseTamanhoPagina } from '@/lib/ativos/lista'
import { RealtimeRefresh } from '@/components/relatorios/realtime-refresh'

// FLX-03 — título curto da aba (WCAG 2.4.2).
export const metadata = {
  title: 'Itens',
}

// A LISTA DE ITENS POR QUANTIDADE — reescrita no padrão de `/ativos` (F42 · J3).
//
// ANTES: 562 linhas empilhando TRÊS telas numa — saldos, um toggle `?visao=` que
// trocava as COLUNAS, e uma segunda seção de histórico com filtro de gramática
// diferente e a única paginação da página, que paginava o histórico e não os
// saldos. Era a dor D3 do `docs/PLANO-ITENS.md`, dita pelo Johnny assim: "a view
// de itens foge totalmente do padrão do sistema; eu mesmo que projetei estou me
// perdendo".
//
// AGORA: filtros + UMA tabela + paginação, dentro do casco da F40, exatamente
// como `src/app/(app)/ativos/page.tsx`. O histórico foi para `/itens/historico`
// (a SEÇÃO saiu; nenhum recurso saiu), e a comparação entre filiais virou a linha
// expansível de cada item.
//
// UMA LEITURA DE SALDO, e não duas. `getSaldosPorFilial` traz `porFilial` e
// `consolidado` de cada item numa chamada só de `Promise.all` — é ela que alimenta
// a tabela, a linha expansível e o CSV. Duas leituras da mesma verdade foi como a
// tela e o arquivo divergiram no achado F12-W4-03.

type SearchParams = { [key: string]: string | string[] | undefined }

function primeiro(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

export default async function ItensPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const operador = await getOperador()
  if (!operador) redirect('/login')

  const sp = await searchParams

  // ⚠ O REDIRECIONAMENTO DO LINK ANTIGO DO HISTÓRICO **NÃO** MORA AQUI.
  //
  // Até a v1.46.0 o histórico era a segunda seção desta tela, e os cinco params
  // dele viajavam nesta querystring; a F42 lhes deu rota própria. O desvio existe,
  // e mora em `src/lib/supabase/proxy.ts` — porque um `redirect()` daqui NÃO VIRA
  // STATUS: este segmento tem `loading.tsx`, a rota é servida em STREAM, o 200 já
  // saiu quando o corpo começa a rodar, e o desvio acabaria entregue dentro do
  // payload RSC (funciona no navegador, com JS; não funciona para mais ninguém).
  // Foi o smoke pós-deploy que pegou. A regra continua sendo a mesma função pura
  // testada — `destinoHistoricoLegado`, em `lib/itens/lista.ts` —, chamada de lá.

  const grupoRaw = primeiro(sp.grupo)
  const grupo = GRUPO_ITEM_ORDEM.includes(grupoRaw as GrupoItem)
    ? (grupoRaw as GrupoItem)
    : undefined
  const q = (primeiro(sp.q) ?? '').trim()
  // Teto de página (F12-W4-05): `Math.max(1, Number(...))` deixava passar
  // `?page=99999999999999999999`, que vira 1e20 e faz o rodapé anunciar uma
  // página que não existe.
  const page = paginaNumerica(primeiro(sp.page))
  const pageSize = parseTamanhoPagina(sp.pp) ?? TAMANHO_PAGINA_PADRAO

  // F25 — as filiais vêm antes do resto: o filtro tem padrão por cargo.
  const filiais = await listarFiliais()
  // F42 — o `?filial` vale SEMPRE. Antes ele era neutralizado no parse quando a
  // visão era "por filial" (a padrão), o que fazia um `/itens?filial=3` de favorito
  // deixar de recortar sem nada na tela dizendo isso. Sem visões, não há mais o que
  // neutralizar: o filtro está sempre visível e sempre vale.
  const filialIds = resolverFiliaisIds(
    primeiro(sp.filial),
    operador,
    filiais.map((f) => f.id),
  )

  const [itensAtivos, tipos, saldosPorFilial, ultimo] = await Promise.all([
    listarItensAtivos(),
    listarTiposItem(),
    getSaldosPorFilial(filiais),
    getUltimoLancamento(operador.id),
  ])

  // As filiais que a linha expansível compara: as marcadas, quando há recorte;
  // todas, quando não há. `foraDasFiliais` denuncia o que sobra fora dessa lista.
  const filiaisVisiveis =
    filialIds.length > 0 ? filiais.filter((f) => filialIds.includes(f.id)) : filiais

  const linhas = montarLinhasDeItem({
    linhas: saldosPorFilial.itens,
    filialIds,
    filiaisVisiveis: filiaisVisiveis.map((f) => f.id),
    tiposPorItem: tiposPorItemDoCatalogo(itensAtivos, tipos),
  })

  // `q` e `grupo` sempre foram aplicados em CÓDIGO nesta tela (o catálogo é curto
  // e a RPC de saldo não pagina) — o export replica os dois pelo mesmo motivo. A
  // paginação entra no mesmo lugar: ela existe para a tela ter a MESMA gramática
  // de `/ativos`, não para poupar o banco.
  const filtradas = ordenarSaldos(filtrarSaldos(linhas, { q, grupo }))
  const pagina = paginarLinhas(filtradas, page, pageSize)

  // F21 — três decisões de cargo nesta tela:
  //  · `escreve` (≥ operador): lançar, transferir e conferir. Consulta só lê.
  //  · `admin`: o destino do estado vazio (o catálogo é cadastrado em /admin/itens).
  //  · `filiaisEscrita`: a filial do LANÇAMENTO. Os filtros e a comparação por
  //    filial continuam com a lista inteira — leitura é ampla.
  const escreve = podeEscrever(operador.papel)
  const admin = eAdmin(operador.papel)
  const filiaisEscrita = filiaisParaEscrita(operador, filiais)
  // O `?filial=N` da tela é um filtro de LEITURA: só vale como pré-seleção do
  // lançamento se for uma filial em que este cargo escreve — senão o diálogo
  // abriria com um valor fora das opções. Com 2+ marcadas não há "a filial da
  // tela", e escolher uma seria adivinhar.
  const filialUnica = filialIds.length === 1 ? filialIds[0] : null
  const filialPreset = podeEscreverNaFilial(operador, filialUnica) ? filialUnica : null

  // Cruzamento catálogo × saldo do aviso "repor". `listarItensAtivos` só traz item
  // ATIVO e a RPC traz ativo OU com lançamento: item desativado que ainda tem saldo
  // fica de fora do mapa e vale mínimo 0 — nunca alerta (repor.ts).
  const minimos = minimosDoCatalogo(itensAtivos)

  // ⚠ F44 — DE QUEM SÃO OS NÚMEROS QUE ESTA TELA MOSTRA.
  //
  // Os números já seguiam o filtro desde a F42 (`saldoDoRecorte`); o que mentia era
  // a LEGENDA — com `?filial=3`, a tela escrevia "tudo que a TI possui" embaixo de
  // um número que é de uma filial só. `escopo` é a resposta, e ela desce por prop
  // para as DUAS superfícies que passam a dizê-la: a linha acima dos cartões e a
  // `<caption>` da tabela.
  //
  // ⚠ Ele sai de `filialIds`, e não de `filiaisVisiveis`: sem recorte a tela mostra
  // o CONSOLIDADO da RPC (que enxerga filial desativada com saldo), e marcar as
  // cinco filiais à mão mostra a SOMA das cinco colunas — dois números que podem
  // divergir, e a legenda tem de dizer qual dos dois está na tela.
  const escopo = escopoDosNumeros(filiais, filialIds)
  const cabecalhos = cabecalhosComEscopo(NUMEROS_ITEM, escopo)

  // ⚠ F25 — o `filial` conta como FILTRO só quando veio da URL. Usar a lista
  // RESOLVIDA aqui faria `temFiltro` ser SEMPRE true para o operador (o padrão do
  // cargo nunca é vazio): o estado vazio diria "nada com esses filtros" onde a
  // verdade é "não há nada cadastrado", e ofereceria um "Limpar" que recai no
  // MESMO recorte — botão morto.
  const temFiltro = Boolean(q || grupo) || ehFiltroDeFilial(primeiro(sp.filial))
  // ⚠ ...e o RECORTE DO CARGO não aparece na URL mas recorta a leitura: sem isto o
  // operador de Serra lia "Nenhum saldo ainda" — afirmação global — com as outras
  // filiais cheias de item.
  const temRecorteFilial = filialIds.length > 0 && filialIds.length < filiais.length

  // A saída do estado vazio tem de MUDAR alguma coisa: com filtro na URL, "Limpar"
  // volta à URL de repouso; com só o recorte do cargo não há filtro a limpar e o
  // que ajuda é ALARGAR. `pp` viaja junto — é APRESENTAÇÃO, não filtro, e o
  // "Limpar" da barra de filtros também o preserva.
  const apresentacao = new URLSearchParams()
  const pp = primeiro(sp.pp)
  if (pp) apresentacao.set('pp', pp)
  const semFiltros = (filial?: string) => {
    const qs = new URLSearchParams(apresentacao)
    if (filial) qs.set('filial', filial)
    const s = qs.toString()
    return s ? `/itens?${s}` : '/itens'
  }

  const vazioFiltrado = temFiltro
    ? {
        descricao: 'Ajuste a busca, o grupo ou a filial para ver os saldos.',
        acao: { href: semFiltros(), rotulo: 'Limpar filtros' },
      }
    : temRecorteFilial
      ? {
          descricao:
            'Esta lista abre recortada nas filiais em que você opera — as outras podem ter saldo.',
          acao: { href: semFiltros('todas'), rotulo: 'Ver todas as filiais' },
        }
      : {
          descricao: 'Os saldos aparecem aqui assim que houver o primeiro lançamento.',
          acao: undefined,
        }

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo="Itens por quantidade"
        ajuda="itens-por-quantidade"
        ajudaRotulo="Ajuda sobre itens por quantidade"
        descricao={rotuloSubtituloItens({
          total: filtradas.length,
          temFiltro,
          temRecorteFilial,
        })}
        acoes={
          <>
            <RealtimeRefresh />
            <ExportarCsvButton
              acao={exportarItensSaldosCSV}
              rotulo="Exportar saldos"
              descricao="dos itens filtrados"
            />
            {/* F42 — o histórico ganhou ROTA PRÓPRIA. Chega-se por aqui e pela
                linha do item (⋯ → "Ver histórico deste item"), já filtrado. */}
            <Button asChild variant="outline" className="gap-2">
              <Link href="/itens/historico">
                <ScrollText className="size-4" />
                Histórico
              </Link>
            </Button>
            {/* F31 · ITN-04 — a conferência é de quem grava ajustes; com nenhuma
                filial de escrita não há o que conferir. Quando o filtro tem UMA
                filial só, ela vai no link. */}
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
                (A validação dura é do servidor: `exigirEscrita` nas duas + a policy
                `operador lanca`, que a RPC atravessa linha a linha.) */}
            {escreve && filiaisEscrita.length >= 2 && (
              <TransferirItemDialog itens={itensAtivos} filiais={filiaisEscrita} />
            )}
            {/* `?lancar=1` chega da paleta de comandos (Ctrl+K → "Lançar item").
                F41 — `podeCriarItem` é `escreve`, e não `admin`: quem lança no
                acervo passou a CRIAR item de catálogo (mesma razão da F37/D5 com
                colaborador). A guarda de verdade continua no servidor. */}
            {escreve && (
              <LancarItemDialog
                itens={itensAtivos}
                filiais={filiaisEscrita}
                ultimo={ultimo}
                abrirAoMontar={primeiro(sp.lancar) === '1'}
                podeCriarItem={escreve}
              />
            )}
          </>
        }
      />

      <ItensFiltros filiais={filiais} filiaisSelecionadas={filialIds.map(String)} />

      {pagina.rows.length === 0 ? (
        itensAtivos.length === 0 && linhas.length === 0 ? (
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
        ) : (
          <EstadoVazio
            icone={PackageOpen}
            // Três títulos, e não dois: o do recorte por CARGO existia na tela
            // antiga e a revisão adversarial da F42 apontou que ele tinha caído no
            // genérico. "Nenhum saldo ainda" é uma afirmação GLOBAL, e para o
            // operador de uma filial só ela é falsa — as outras podem ter saldo.
            titulo={
              temFiltro
                ? 'Nenhum item com esses filtros'
                : temRecorteFilial
                  ? 'Nenhum saldo nas suas filiais'
                  : 'Nenhum saldo ainda'
            }
            descricao={vazioFiltrado.descricao}
            acao={vazioFiltrado.acao}
          />
        )
      ) : (
        <>
          {/* F43 — os quatro números da lista FILTRADA, com a explicação curta
              embaixo de cada um. Soma `filtradas` (todas as linhas do recorte),
              não `pagina.rows`: um resumo que mudasse ao virar a página seria
              outra coisa, e nenhuma delas útil. */}
          <ResumoDeItens
            resumo={resumoDaLista(filtradas, minimos)}
            resumoDaPagina={resumoDaLista(pagina.rows, minimos)}
            cabecalhos={cabecalhos}
            escopo={escopo}
          />
          <ItensTable
            rows={pagina.rows}
            filiais={filiaisVisiveis}
            minimos={minimos}
            escreve={escreve}
            filialPreset={filialPreset}
            filiaisTransferencia={
              filiaisEscrita.length >= 2 ? filiaisEscrita.map((f) => f.id) : []
            }
            cabecalhos={cabecalhos}
            escopo={escopo}
          />
          <AtivosPaginacao
            page={pagina.page}
            pageSize={pagina.pageSize}
            total={pagina.total}
            saltoPagina
            tamanhos={TAMANHOS_PAGINA}
            rotuloTamanho="Itens por página"
          />
        </>
      )}
    </Pagina>
  )
}
