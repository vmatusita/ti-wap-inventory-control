import { redirect } from 'next/navigation'
import { differenceInCalendarDays } from 'date-fns'
import { getOperador } from '@/lib/auth/acesso'
import { podeEscrever } from '@/lib/auth/papeis'
import { createClient } from '@/lib/supabase/server'
import { getPendencias } from '@/lib/queries/relatorios'
import { listarFiliais } from '@/lib/queries/filiais'
import { listarPendencias, type TipoPendencia } from '@/lib/queries/pendencias-detalhe'
import { ehFiltroDeFilial, paginaNumerica } from '@/lib/url-params'
import { resolverFiliaisSlugs } from '@/lib/filtros/filial'
import { formatDate } from '@/lib/format'
import { ClipboardCheck, Filter } from 'lucide-react'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import { ExportarCsvButton } from '@/components/layout/exportar-csv-button'
import { exportarPendenciasCSV } from '@/lib/actions/exportar'
import { PendenciasChips } from '@/components/relatorios/pendencias-chips'
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { PendenciasFiltros } from '@/components/pendencias/pendencias-filtros'
import {
  FilaPendenciasTabela,
  type LinhaFila,
} from '@/components/pendencias/fila-pendencias-tabela'
import {
  MesaConflitos,
  type GrupoConflitoFmt,
} from '@/components/pendencias/mesa-conflitos'
import { contarGruposConflito, listarConflitos } from '@/lib/queries/conflitos'
import { eAdmin } from '@/lib/auth/papeis'

// FLX-03 — título curto da aba (WCAG 2.4.2).
export const metadata = {
  title: 'Pendências',
}

type SearchParams = { [key: string]: string | string[] | undefined }

function primeiro(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

const TIPOS_VALIDOS: TipoPendencia[] = [
  'termo',
  'itens',
  'triagem',
  'patrimonio',
  // F24 — a aba da mesa. `?tipo=conflito` só funciona porque está AQUI: tipo desconhecido
  // cai no fallback `null` e a tela mostraria a fila inteira como se fosse o filtro pedido.
  'conflito',
  'outras',
]

// F28/PND-04 — a idade em dias vira NÚMERO próprio (não só o texto "há N dias"):
// é o que `faixaIdadePendencia` (lib/pendencias/idade.ts) usa para decidir o badge
// âmbar/vermelho na tabela, sem o Client Component precisar de `new Date()` (mismatch
// de hidratação na virada do dia). Negativo (relógio adiantado) vira 0 — "hoje".
function diasAbertos(iso: string | null): number | null {
  if (!iso) return null
  const dias = differenceInCalendarDays(new Date(), new Date(iso))
  return dias < 0 ? 0 : dias
}

function haQuantosDias(dias: number | null): string {
  if (dias == null) return ''
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'há 1 dia'
  return `há ${dias} dias`
}

export default async function PendenciasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const operador = await getOperador()
  if (!operador) redirect('/login')

  const sp = await searchParams
  const tipoRaw = primeiro(sp.tipo)
  const tipo = TIPOS_VALIDOS.includes(tipoRaw as TipoPendencia)
    ? (tipoRaw as TipoPendencia)
    : null
  const q = (primeiro(sp.q) ?? '').trim() || null
  // Teto de página (F12-W4-01): sem ele `?page=99999999999999999999` vira 1e20,
  // o postgrest-js serializa `offset=3e+21`, o PostgREST descarta o offset EM
  // SILÊNCIO (200, sem PGRST103) e a paginação trava com notação científica no
  // rodapé. Página válida mas além do fim cai no fallback PGRST103 da query.
  const page = paginaNumerica(primeiro(sp.page))

  const client = await createClient()
  // F25 — as filiais vêm ANTES do resto: o filtro de filial tem padrão por cargo,
  // e aqui ele é por SLUG (a view `v_fila_pendencias` expõe o slug), então a
  // tradução id→slug precisa da lista.
  // F33 — SEM passar o client. `listarFiliais` é memoizada por requisição e a chave
  // do memo é o ARGUMENTO; o layout do grupo (app) já a chamou sem argumento nesta
  // mesma requisição, então esta chamada é um acerto de cache. Passando o `client`
  // local (que `createClient()` devolve NOVO a cada vez, nunca a mesma referência)
  // o memo errava e a tabela `filiais` era lida duas vezes por navegação. Esta rota
  // é só de operador — o client default é o mesmo client com RLS do `client` acima,
  // então a lista é idêntica.
  const filiais = await listarFiliais()
  const filialSlugs = resolverFiliaisSlugs(primeiro(sp.filial), operador, filiais)

  // ⚠ F25 — o `filial` conta como FILTRO só quando veio da URL, e `ehFiltroDeFilial`
  // ainda descarta a SENTINELA `todas` (que declara "sem recorte" — ver a nota da
  // função). Usar a lista RESOLVIDA aqui faria isto ser SEMPRE true para o operador,
  // porque o padrão do cargo nunca é vazio.
  const temFiltro = Boolean(tipo || q) || ehFiltroDeFilial(primeiro(sp.filial))
  // Na MESA o `tipo=conflito` é a ABA (a fonte da lista), não um filtro: quem
  // limpa não quer sair dela. Por isso a mesa tem a sua própria conta.
  const temFiltroMesa = Boolean(q) || ehFiltroDeFilial(primeiro(sp.filial))

  // ⚠ `temFiltro` NÃO decide se a tela pode afirmar uma verdade GLOBAL: o padrão
  // do cargo não está na URL e mesmo assim RECORTA a leitura. Sem este segundo
  // booleano o operador de Serra, com a fila dele vazia, lia "Nenhuma pendência
  // aberta 🎉" enquanto Linhares tinha 40 — exatamente a "mentira por omissão"
  // que a mesa, logo abaixo, já evitava por conta própria.
  //
  // ⚠ `< filiais.length` importa: um operador vinculado a TODAS as filiais lê
  // exatamente o que um admin lê. Sem esta perna a tela lhe negava a comemoração e
  // oferecia um "Ver todas as filiais" que não alarga nada — o caminho real é a
  // conta rebaixada de admin para operador, que a ADR-002 deixa com vínculo em
  // todas as filiais.
  const temRecorteFilial = filialSlugs.length > 0 && filialSlugs.length < filiais.length

  // O estado vazio de filtro precisa de uma saída que MUDE alguma coisa:
  //  · com filtro na URL, "Limpar" volta à URL de repouso da tela — o MESMO
  //    destino do botão "Limpar" da barra de filtros (`router.push(pathname)`),
  //    que até aqui discordava deste (um ia para o padrão do cargo, o outro para
  //    `filial=todas`, com o mesmo rótulo);
  //  · com só o recorte do CARGO não há filtro a limpar, e o que ajuda é ALARGAR
  //    — daí a sentinela e um rótulo que diz a verdade;
  //  · sem filtro NEM recorte, o que esvaziou a lista foi a PÁGINA fora de faixa
  //    (é o caso que o `lista.total` do estado vazio já distinguia): a saída é
  //    voltar ao começo, e não "limpar" um filtro que não existe;
  //  · fora disso não há ação: seria um link para a própria URL.
  function saidaDoVazio(base: string, filtroNaUrl: boolean) {
    if (filtroNaUrl) {
      return {
        descricao:
          'Nada nesta combinação de filtros — o que não quer dizer que não haja mais nada. Ajuste ou limpe os filtros para ver tudo.',
        acao: { href: base, rotulo: 'Limpar filtros' },
      }
    }
    if (temRecorteFilial) {
      return {
        descricao:
          'Esta lista abre recortada nas filiais em que você opera — as outras podem ter registros.',
        acao: {
          href: `${base}${base.includes('?') ? '&' : '?'}filial=todas`,
          rotulo: 'Ver todas as filiais',
        },
      }
    }
    // Rede de segurança: `?page=N` fora de faixa normalmente NÃO chega aqui (as
    // queries têm o clamp de PGRST103 e devolvem a última página), mas se algum dia
    // chegar, "limpar filtros" seria conselho errado — o que sobrou foi a página.
    if (page > 1) {
      return {
        descricao: 'Esta página está além do fim da lista.',
        acao: { href: base, rotulo: 'Voltar para a primeira página' },
      }
    }
    return { descricao: undefined, acao: undefined }
  }
  const vazioFila = saidaDoVazio('/pendencias', temFiltro)
  const vazioMesa = saidaDoVazio('/pendencias?tipo=conflito', temFiltroMesa)

  // F24 — a aba de conflitos troca a FONTE: em vez da fila (`v_fila_pendencias`), a mesa lê
  // as views de conflito. Por isso o `tipo` que vai para `listarPendencias` é estreitado —
  // `FiltrosPendencias.tipo` exclui 'conflito' no TIPO justamente para o compilador obrigar
  // esta decisão (sem isso, a query sairia sem filtro nenhum e devolveria a fila inteira).
  const naMesa = tipo === 'conflito'
  const tipoDaFila = naMesa ? null : (tipo as Exclude<TipoPendencia, 'conflito'> | null)

  const [chips, lista, conflitos, totalConflitos] = await Promise.all([
    getPendencias(client, filialSlugs),
    // Não vale a pena consultar a fila quando a mesa é que vai aparecer.
    naMesa
      ? Promise.resolve({ rows: [], total: 0, page: 1, pageSize: 30 })
      : listarPendencias({ filialSlugs, tipo: tipoDaFila, q, page }),
    naMesa ? listarConflitos({ filialSlugs, q, page }) : Promise.resolve(null),
    // O chip de conflito é contado SEMPRE (ele aparece em qualquer aba, como os demais).
    contarGruposConflito(client, filialSlugs),
  ])

  // "Desde" formatado no SERVIDOR (formatDate + "há N dias") — a tabela é Client
  // Component (seleção/resolução em lote) e não deve recalcular datas no cliente
  // (mismatch de hidratação na virada do dia).
  const linhas: LinhaFila[] = lista.rows.map((r) => {
    const dias = diasAbertos(r.desde)
    return {
      ...r,
      desdeFmt: formatDate(r.desde),
      desdeRel: haQuantosDias(dias),
      desdeDias: dias,
    }
  })

  // F24 — as datas da mesa também são formatadas no SERVIDOR, pelo mesmo motivo da fila:
  // a mesa é Client Component e não deve chamar `new Date()` (mismatch de hidratação).
  const gruposFmt: GrupoConflitoFmt[] = (conflitos?.grupos ?? []).map((g) => ({
    ...g,
    lados: g.lados.map((l) => ({
      ...l,
      entradaFmt: l.entradaEm ? formatDate(l.entradaEm) : '—',
      ultimaMovFmt: l.ultimaMovData
        ? `${formatDate(l.ultimaMovData)}${l.ultimaMovTipo ? ` · ${l.ultimaMovTipo}` : ''}`
        : '—',
    })),
  }))

  // Chip do conflito, ao lado dos demais. Contado à parte (a fila não o produz) e por
  // GRUPO, não por ativo: cada grupo é UMA decisão a tomar, e contar os dois lados
  // anunciaria o dobro do trabalho que existe.
  const chipsComConflito =
    totalConflitos > 0
      ? [
          ...chips,
          {
            chave: 'conflito' as const,
            rotulo: totalConflitos === 1 ? 'conflito entre filiais' : 'conflitos entre filiais',
            total: totalConflitos,
          },
        ]
      : chips

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Pendências</h1>
            <LinkAjuda pagina="resolver-pendencias" rotulo="Ajuda sobre pendências" />
          </div>
          <p className="text-sm text-muted-foreground">
            Ativos que precisam de ação — termos, devoluções com itens faltantes e
            triagem parada. Uso interno da TI.
          </p>
        </div>
        <ExportarCsvButton
          acao={exportarPendenciasCSV}
          descricao="das pendências filtradas"
        />
      </div>

      {/* KPI-chips (reuso de getPendencias — total por bucket) + o de conflito.
          F27/B5 (PND-03) — `comLink`: cada chip vira `/pendencias?tipo=…`, a
          MESMA fila que ele resume. Sempre true aqui: esta rota já exige
          `getOperador()` (redireciona pra /login sem sessão, acima), então todo
          visitante É operador — nunca o visualizador por senha. */}
      <PendenciasChips pendencias={chipsComConflito} recortado={temRecorteFilial} comLink />

      <PendenciasFiltros
        filiais={filiais}
        filiaisSelecionadas={filialSlugs}
        tipo={tipo}
        q={q}
      />

      {naMesa ? (
        gruposFmt.length === 0 ? (
          <div className="rounded-xl border bg-card">
            {/* Distingue "não há conflito nenhum" (comemorar) de "nada NESTE filtro"
                (ajustar) — mesma doutrina do estado vazio da fila. Afirmar a verdade
                global com um filtro aplicado seria mentir por omissão. */}
            {/* `totalConflitos > 0` cobre a página fora de faixa, como a fila já
                fazia com `lista.total`: sem ele a mesa comemora "nenhum conflito"
                numa `?page=9` que só ficou vazia por estar além do fim. */}
            {temRecorteFilial || q || totalConflitos > 0 ? (
              <EstadoVazio
                icone={Filter}
                titulo="Nenhum conflito neste filtro"
                descricao={vazioMesa.descricao}
                acao={vazioMesa.acao}
                className="border-0"
              />
            ) : (
              <EstadoVazio
                icone={ClipboardCheck}
                titulo="Nenhum conflito entre filiais 🎉"
                descricao="Nenhum equipamento está cadastrado em duas filiais ao mesmo tempo. Quando um import de startup trouxer uma máquina que já existe em outra unidade, os dois cadastros aparecem aqui, lado a lado."
                className="border-0"
              />
            )}
          </div>
        ) : (
          // A mesa NÃO usa a moldura da tabela: cada conflito é um bloco próprio.
          // `podeApagar` é o nível administrador (admin ou dev) — decisão do Johnny,
          // 30/07/2026. Todo logado LÊ; só o administrador vê checkbox e botões. A
          // segurança é a RPC, não esta prop.
          <MesaConflitos grupos={gruposFmt} podeApagar={eAdmin(operador.papel)} />
        )
      ) : (
      <div className="rounded-xl border bg-card">
        {lista.rows.length === 0 ? (
          // "Não há pendência nenhuma" (comemorar) x "nada neste filtro" (ajustar).
          // `lista.total` cobre também a página fora de faixa (?page=9 sem filtro).
          // ⚠ `!temRecorteFilial` é obrigatório: sem ele o operador comemora com a
          // fila de OUTRA filial cheia (a leitura já vem recortada pelo cargo).
          !temFiltro && !temRecorteFilial && lista.total === 0 ? (
            <EstadoVazio
              icone={ClipboardCheck}
              titulo="Nenhuma pendência aberta 🎉"
              descricao="Nenhum ativo com termo pendente, triagem parada, itens faltantes ou patrimônio a acertar."
              className="border-0"
            />
          ) : (
            <EstadoVazio
              icone={Filter}
              titulo="Nenhuma pendência neste filtro"
              descricao={vazioFila.descricao}
              acao={vazioFila.acao}
              className="border-0"
            />
          )
        ) : (
          // F21 — resolver pendência é escrita (cargo ≥ operador). O recorte por
          // FILIAL não é feito aqui: a fila mostra as 5 filiais para todo cargo
          // (leitura ampla) e a linha só traz o slug da filial, não o id — quem
          // recusa a filial não vinculada é a action, com a mensagem em pt-BR
          // (critério 2 da ordem F21).
          <FilaPendenciasTabela rows={linhas} podeResolver={podeEscrever(operador.papel)} />
        )}
      </div>
      )}

      {/* A paginação segue a fonte que está na tela: a mesa pagina por GRUPO. */}
      {naMesa
        ? conflitos !== null &&
          conflitos.total > conflitos.pageSize && (
            <AtivosPaginacao
              page={conflitos.page}
              pageSize={conflitos.pageSize}
              total={conflitos.total}
            />
          )
        : lista.total > lista.pageSize && (
            <AtivosPaginacao page={lista.page} pageSize={lista.pageSize} total={lista.total} />
          )}
    </div>
  )
}
