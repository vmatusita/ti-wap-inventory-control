import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Boxes, ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getOperador } from '@/lib/auth/acesso'
import { podeEscrever } from '@/lib/auth/papeis'
import { listarFiliais } from '@/lib/queries/filiais'
import {
  getHistoricoLancamentos,
  getSaldosItensDeFiliais,
  listarItensAtivos,
  listarLancamentosParaSaldoApos,
} from '@/lib/queries/itens'
import { calcularSaldoApos, type LancamentoParaSaldoApos } from '@/lib/itens/saldo-apos'
import type { TipoLancamento } from '@/lib/dominio'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { CabecalhoDaPagina, Pagina } from '@/components/layout/pagina'
import { ExportarCsvButton } from '@/components/layout/exportar-csv-button'
import { exportarItensHistoricoCSV } from '@/lib/actions/exportar'
import { HistoricoFiltros } from '@/components/itens/historico-filtros'
import { HistoricoLancamentos } from '@/components/itens/historico-lancamentos'
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { dataISO, ehFiltroDeFilial, idNumerico, paginaNumerica } from '@/lib/url-params'
import { resolverFiliaisIds, selecaoDeUnidades } from '@/lib/filtros/filial'
import { efetivar, recorteDe } from '@/lib/auth/recorte-leitura'
import { recusarFilialInexistente } from '@/lib/unidades/pertinencia'
import { createClient } from '@/lib/supabase/server'
import { RealtimeRefresh } from '@/components/relatorios/realtime-refresh'

// FLX-03 — título curto da aba (WCAG 2.4.2).
export const metadata = {
  title: 'Histórico de itens',
}

// O HISTÓRICO DE LANÇAMENTOS — rota própria (F42 · frente B).
//
// POR QUE SAIU DE `/itens`. Até a v1.46.0 ele era a SEGUNDA seção de uma tela que
// já empilhava três: saldos, um toggle que trocava as colunas, e ele. Duas
// gramáticas de filtro na mesma página, dois botões de CSV lendo a MESMA
// querystring, e a única paginação da tela paginando o histórico — enquanto os
// saldos, que é o que a tela se propõe a mostrar, não paginavam nada. Foi a dor
// D3 do `docs/PLANO-ITENS.md`.
//
// ⚠ SAIU A SEÇÃO, NÃO O RECURSO. Todo filtro, toda coluna, o export e o estorno
// continuam aqui — e o filtro de FILIAL, que antes vinha emprestado do bloco de
// saldos, virou filtro próprio de `HistoricoFiltros`: sem isso ele teria sido o
// único recurso a se perder na separação. A tabela `recurso → onde ele vive
// depois` está em `docs/PLAN-F42.md` §3.
//
// ⚠ E O LINK ANTIGO NÃO MORREU: `/itens?tipo=…&de=…` redireciona para cá com o
// recorte inteiro (`destinoHistoricoLegado`, função pura em `lib/itens/lista.ts`).
//
// O EXPORT LÊ A QUERYSTRING DESTA ROTA, e só dela. `ExportarCsvButton` manda
// `useSearchParams()` — a URL commitada que renderizou o que está na tela. Com as
// duas telas separadas, o `?page=` de uma não tem como ser lido como o da outra;
// enquanto eram uma só, era o que o achado F12-W4-03 vigiava.

type SearchParams = { [key: string]: string | string[] | undefined }

function primeiro(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

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

export default async function HistoricoItensPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const operador = await getOperador()
  if (!operador) redirect('/login')

  const sp = await searchParams

  // Params validados em `@/lib/url-params` — fonte única desde a F12 (W6A),
  // depois de a auditoria provar que as cópias tinham divergido. Valor fora do
  // formato OU DA FAIXA é IGNORADO (nunca derruba a página nem vira filtro
  // inválido no banco).
  const itemFiltro = idNumerico(primeiro(sp.item))
  const tipoFiltro = tipoValido(primeiro(sp.tipo))
  const deFiltro = dataISO(primeiro(sp.de))
  const ateFiltro = dataISO(primeiro(sp.ate))
  // ITN-03b — busca por chamado/colaborador. O param é `busca`, e não `q`, porque
  // `q` é o filtro de SALDOS de `/itens`: mesmo agora que as telas são duas, o
  // nome fica como está — links antigos carregam `busca`, e o redirecionador de
  // `/itens` não traduz um no outro (ver `destinoHistoricoLegado`).
  const buscaFiltro = (primeiro(sp.busca) ?? '').trim() || null
  const page = paginaNumerica(primeiro(sp.page))

  // F57 — `?filial=` que pede uma filial que NÃO EXISTE responde 404, em vez de abrir uma lista
  // vazia e ambígua. Filial desativada continua valendo, e lixo continua ignorado pelo parser
  // (`unidades/pertinencia.ts`). Só consulta quando a URL traz uma lista.
  await recusarFilialInexistente(await createClient(), primeiro(sp.filial), 'id')

  // F25 — as filiais vêm antes do resto: o filtro tem padrão por cargo.
  const filiais = await listarFiliais()
  // F57 — o que as QUERIES recebem: a seleção (URL + padrão do cargo) ∩ o recorte de leitura.
  const unidades = efetivar(
    recorteDe(operador),
    selecaoDeUnidades(
      primeiro(sp.filial),
      operador,
      filiais.map((f) => f.id),
    ),
  )
  // F57 · lote 2 — TRANSITÓRIO: a lista antiga ainda decide o "Saldo após" e alimenta o estado
  // vazio e o filtro da tela, que migram no lote 4.
  const filialIds = resolverFiliaisIds(
    primeiro(sp.filial),
    operador,
    filiais.map((f) => f.id),
  )

  // ITN-03a — "Saldo após" só faz sentido com EXATAMENTE 1 item + 1 filial no
  // recorte (o saldo de um item é por filial; ver `saldo-apos.ts`).
  const mostrarSaldoApos = filialIds.length === 1 && itemFiltro != null

  const [itensAtivos, historico, saldos, lancamentosSaldoApos] = await Promise.all([
    listarItensAtivos(),
    getHistoricoLancamentos({
      unidades,
      itemId: itemFiltro,
      tipo: tipoFiltro,
      de: deFiltro,
      ate: ateFiltro,
      busca: buscaFiltro,
      // ITN-03a — quando a coluna "Saldo após" aparece, a grade passa a ser
      // ordenada pela data de NEGÓCIO, que é a ordem em que a coluna foi
      // calculada. Sem isso, um lançamento retroativo faria a coluna descer fora
      // de ordem (achado da revisão adversarial).
      ordenarPorData: mostrarSaldoApos,
      page,
      pageSize: 20,
    }),
    // A ÂNCORA do "Saldo após": o saldo ATUAL do par item×filial. Antes vinha de
    // graça da tabela de saldos que dividia a tela; com o histórico em rota
    // própria, ele passa a ser uma leitura própria — e só quando a coluna vai
    // mesmo aparecer, que é o caso raro de 1 item + 1 filial.
    mostrarSaldoApos
      ? getSaldosItensDeFiliais(unidades)
      : Promise.resolve<Awaited<ReturnType<typeof getSaldosItensDeFiliais>>>([]),
    // Histórico COMPLETO do item×filial (sem tipo/data/busca/página), só quando a
    // coluna vai aparecer.
    mostrarSaldoApos && itemFiltro != null
      ? listarLancamentosParaSaldoApos(itemFiltro, filialIds[0])
      : Promise.resolve<LancamentoParaSaldoApos[]>([]),
  ])

  const escreve = podeEscrever(operador.papel)

  // Sem âncora (item do `?item=` não aparece nos saldos — id inválido, item nunca
  // ativo) a coluna simplesmente não aparece, em vez de arriscar a conta sem ela.
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

  // ⚠ F25 — o `filial` conta como FILTRO só quando veio da URL, nunca quando a
  // marcação herdou o padrão do cargo: senão o estado vazio diria "nada com esses
  // filtros" onde a verdade é "não há lançamento nenhum".
  const temFiltro =
    Boolean(itemFiltro || tipoFiltro || deFiltro || ateFiltro || buscaFiltro) ||
    ehFiltroDeFilial(primeiro(sp.filial))
  const temRecorteFilial = filialIds.length > 0 && filialIds.length < filiais.length

  const total = historico.total.toLocaleString('pt-BR')
  const descricao = temFiltro
    ? `${total} ${historico.total === 1 ? 'lançamento' : 'lançamentos'} nestes filtros`
    : temRecorteFilial
      ? `${total} ${historico.total === 1 ? 'lançamento' : 'lançamentos'} nas suas filiais`
      : `${total} ${historico.total === 1 ? 'lançamento' : 'lançamentos'} no diário de itens`

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo="Histórico de lançamentos"
        ajuda="lancar-itens"
        ajudaRotulo="Ajuda sobre o histórico de lançamentos"
        descricao={descricao}
        acoes={
          <>
            <RealtimeRefresh />
            <ExportarCsvButton
              acao={exportarItensHistoricoCSV}
              rotulo="Exportar histórico"
              descricao="dos lançamentos filtrados"
            />
            <Button asChild variant="outline" className="gap-2">
              <Link href="/itens">
                <Boxes className="size-4" />
                Ver saldos
              </Link>
            </Button>
          </>
        }
      />

      <HistoricoFiltros
        itens={itensAtivos}
        filiais={filiais}
        filiaisSelecionadas={filialIds.map(String)}
      />

      {historico.rows.length === 0 ? (
        <EstadoVazio
          icone={ScrollText}
          titulo={temFiltro ? 'Nenhum lançamento com esses filtros' : 'Nenhum lançamento ainda'}
          descricao={
            temFiltro
              ? 'Ajuste o item, o tipo, o período ou a filial para ver o histórico.'
              : temRecorteFilial
                ? 'Este histórico abre recortado nas filiais em que você opera — as outras podem ter lançamentos.'
                : 'Os lançamentos aparecem aqui assim que houver o primeiro movimento de item.'
          }
          acao={
            temFiltro
              ? { href: '/itens/historico', rotulo: 'Limpar filtros' }
              : temRecorteFilial
                ? { href: '/itens/historico?filial=todas', rotulo: 'Ver todas as filiais' }
                : undefined
          }
        />
      ) : (
        <>
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
        </>
      )}
    </Pagina>
  )
}
