import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { FileClock } from 'lucide-react'
import { resolverAcessoRelatorio } from '@/lib/auth/acesso'
import { redirectAcessoRelatorios } from '@/lib/auth/otp'
import { podeEscrever } from '@/lib/auth/papeis'
import { Button } from '@/components/ui/button'
import { listarFiliais } from '@/lib/queries/filiais'
import {
  getSnapshotRelatorioV2,
  resolverFilialPorSlug,
} from '@/lib/queries/relatorios'
import {
  periodoInicialDoDialog,
  resolverPeriodo,
  semanaUtilAnterior,
  semanaUtilCorrente,
} from '@/lib/relatorios/periodo'
import { linksKpiAtivos, recorteFilialAtivos } from '@/lib/relatorios/kpi-links'
import { LembrarRelatorioVisitado } from '@/components/relatorios/lembrar-relatorio-visitado'
import { formatDate, hojeISO } from '@/lib/format'
import { FilialTabs } from '@/components/relatorios/filial-tabs'
import { PeriodoFiltro } from '@/components/relatorios/periodo-filtro'
import { CorpoRelatorio } from '@/components/relatorios/corpo-relatorio'
import { listarTiposItem, type TipoItem } from '@/lib/queries/tipos-item'
import { mapaRotulosTipo } from '@/lib/itens/rotulo-tipo'
import { RealtimeRefresh } from '@/components/relatorios/realtime-refresh'
import { ViewerAutoRefresh } from '@/components/relatorios/viewer-auto-refresh'
import { GerarRelatorioDialog } from '@/components/relatorios/gerar-relatorio-dialog'
import { BotaoImprimir } from '@/components/relatorios/botao-imprimir'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import { registrarFalha } from '@/lib/observabilidade'

// FLX-03 — título curto da aba (WCAG 2.4.2). Estático (não por filial): o nome
// exato da filial já está no `<h1>` da própria tela.
export const metadata = {
  title: 'Relatórios',
}

// Teto de execução da rota (route segment config do Next 16 — vale para page,
// layout e route). Sem ele a rota herda o teto da Vercel, 300 s: em 24/07/2026 um
// request de /relatorios/[filial] travou e consumiu os 300 s inteiros (1 ocorrência,
// `get_runtime_errors`). O caminho foi medido e NÃO é lentidão de dados — a RPC mais
// pesada (rel_estoque_asof consolidada, 1.573 linhas) roda em 233 ms e a página
// dispara as leituras em Promise.all. Ou seja: 300 s só acontece se algo PENDURAR
// (conexão do Supabase), e aí 5 min de spinner é o pior desfecho possível — ainda mais
// para o gestor, que entra por senha e não tem como diagnosticar. 60 s dá ~30× de folga
// sobre o pior caso medido e troca o pendurado por um erro rápido.
// NÃO se aplica globalmente de propósito: o "Substituir tudo" (admin/importar) é uma
// Server Action legitimamente longa e um teto curto o quebraria.
//
// VALE TAMBÉM PARA AS SERVER ACTIONS DESTA PÁGINA — a doc do Next é literal
// (node_modules/next/dist/docs/.../route-segment-config/maxDuration.md: "set the
// maxDuration at the page level to change the default timeout of all Server Actions
// used on the page"). Aqui isso significa `gerarRelatorio`, do GerarRelatorioDialog
// abaixo. O orçamento cobre: a action roda o MESMO `getSnapshotRelatorioV2` que esta
// página monta no render, mais um insert de jsonb — não é um caminho novo, é o mesmo
// mais uma escrita. Quem for mexer no número mexe nos dois: o pior desfecho de baixar
// demais não é um spinner, é o snapshot da semana morrendo no meio.
export const maxDuration = 60

type SearchParams = { [key: string]: string | string[] | undefined }

function primeiro(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

export default async function RelatorioFilialPage({
  params,
  searchParams,
}: {
  params: Promise<{ filial: string }>
  searchParams: Promise<SearchParams>
}) {
  const { filial: filialSlug } = await params
  const sp = await searchParams

  const acesso = await resolverAcessoRelatorio()
  if (!acesso) {
    // FLX-01 — mesma guarda do layout: preserva filial + período (o `search`
    // desta página) para o gestor voltar aqui depois de repor a senha, e não
    // cair sempre no Consolidado ao vivo.
    const h = await headers()
    redirect(
      redirectAcessoRelatorios(
        h.get('x-wap-pathname') ?? '',
        h.get('x-wap-search') ?? '',
      ),
    )
  }

  const periodo = resolverPeriodo({
    preset: primeiro(sp.preset),
    de: primeiro(sp.de),
    ate: primeiro(sp.ate),
  })

  // F16/T4 — o id numérico da filial (o filtro de /ativos é por id, não pelo slug)
  // para os KPI tiles clicáveis do operador. `geral` → null (sem filtro de filial).
  let filialId: number | null = null
  if (filialSlug !== 'geral') {
    const f = await resolverFilialPorSlug(acesso.client, filialSlug)
    if (!f) notFound()
    filialId = f.id
  }

  const ehOperador = acesso.modo === 'operador'
  // Tiles clicáveis SÓ no ao vivo e SÓ para o operador (o viewer não sai de
  // /relatorios/**). O snapshot congelado nunca recebe `links` (aponta p/ o
  // inventário de hoje, não o do período).
  const links = ehOperador ? linksKpiAtivos(filialId) : undefined
  // F32/RV-12 — o MESMO gate, para o clique nos segmentos das empilhadas: o
  // fragmento de filial que o destino em `/ativos` precisa carregar (com a
  // sentinela `filial=todas` no consolidado, F25). Duas variáveis com a mesma
  // condição de propósito — o corpo ainda gateia por `links` antes de repassar,
  // e é essa dupla checagem que o teste de confinamento cobra.
  const recorteFilial = ehOperador ? recorteFilialAtivos(filialId) : undefined

  // F39 — `tiposItem` com o CLIENT RESOLVIDO, como `listarFiliais` logo acima e
  // pelo mesmo motivo: a sessão por SENHA roda com o client administrativo, e uma
  // leitura feita com a sessão comum devolveria vazio para ela — o relatório
  // impresso sairia com o slug cru no lugar do rótulo do item faltante.
  const [filiais, snapshot, tiposItem] = await Promise.all([
    listarFiliais(acesso.client),
    getSnapshotRelatorioV2(
      acesso.client,
      filialSlug,
      { de: periodo.de, ate: periodo.ate, rotulo: periodo.rotulo },
      ehOperador, // viewer → sem pendências no snapshot ao vivo
    ),
    listarTiposItem(acesso.client).catch((err): TipoItem[] => {
      // Degrada, nunca derruba: sem o mapa, o item faltante sai com o slug cru —
      // o fallback desenhado. Derrubar o relatório inteiro por causa de um
      // vocabulário de exibição seria trocar o essencial pelo acessório.
      registrarFalha({
        escopo: 'relatorios.ao-vivo-tipos-item',
        erro: err,
        operador: acesso.modo === 'operador' ? acesso.operador.id : null,
      })
      return []
    }),
  ])

  const semana = semanaUtilCorrente()
  const semanaAnterior = semanaUtilAnterior()
  // Teto do dialog "Gerar relatório": hoje ou o fim da semana útil (o maior) —
  // permite a sexta-padrão gerada no meio da semana, barra futuro arbitrário.
  const tetoData = hojeISO() > semana.ate ? hojeISO() : semana.ate
  // F29/REL-04b — o dialog abre com o período que está NA TELA, não com a semana
  // corrente fixa: quem analisa junho e clica em "Gerar relatório" congelava julho
  // sem nada dizer. Os atalhos abaixo devolvem a semana a um clique.
  const padraoDialog = periodoInicialDoDialog(periodo, semana, tetoData)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Relatório — {snapshot.meta.filialNome}
            </h1>
            {/* Só para o operador: o visualizador por senha não passa do
                /relatorios/** (o proxy manda o resto para /login) — um "?" que
                desloga o gestor seria pior que "?" nenhum. */}
            {ehOperador && (
              <LinkAjuda pagina="relatorio-ao-vivo" rotulo="Ajuda: como ler o relatório" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {periodo.rotulo} · {formatDate(periodo.de)} a {formatDate(periodo.ate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {acesso.modo === 'operador' ? <RealtimeRefresh /> : <ViewerAutoRefresh />}
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 sm:h-7">
            <Link href="/relatorios/gerados" aria-label="Relatórios gerados">
              <FileClock className="size-4" />
              <span className="hidden sm:inline">Relatórios gerados</span>
            </Link>
          </Button>
          {/* F21 — congelar snapshot é ESCRITA (`relatorios_gerados`): cargo
              ≥ operador, sem recorte por filial (a ordem pede
              `exigirPapel('operador')` em `gerarRelatorio`, e o escopo "geral"
              atravessa as 5 filiais de propósito). Consulta lê o relatório ao
              vivo e o arquivo, mas não gera. */}
          {acesso.modo === 'operador' && podeEscrever(acesso.operador.papel) && (
            <GerarRelatorioDialog
              filialSlug={filialSlug}
              filialNome={snapshot.meta.filialNome}
              ehGeral={snapshot.meta.ehGeral}
              padraoDe={padraoDialog.de}
              padraoAte={padraoDialog.ate}
              semanaDe={semana.de}
              semanaAte={semana.ate}
              semanaAnteriorDe={semanaAnterior.de}
              semanaAnteriorAte={semanaAnterior.ate}
              maxData={tetoData}
            />
          )}
          <BotaoImprimir />
        </div>
      </div>

      <div className="space-y-3">
        <FilialTabs filiais={filiais} atual={filialSlug} />
        <PeriodoFiltro preset={periodo.preset} de={periodo.de} ate={periodo.ate} />
      </div>

      {/* F32/RV-05 — `aoVivo` marca a ROTA, não o cargo: esta página deriva o
          relatório a cada request, então o último balde da série diária pode ser
          o dia de hoje, ainda enchendo. `links` responde outra pergunta ("quem
          olha pode navegar?") e continua sendo só do operador. */}
      {/* F32/RV-17 — só a sessão por senha tem o header com o botão "Ao vivo"
          que lê esta memória; gravar para o operador seria escrever sem leitor. */}
      {!ehOperador && <LembrarRelatorioVisitado slug={filialSlug} />}

      <CorpoRelatorio
        snapshot={snapshot}
        ehOperador={ehOperador}
        links={links}
        recorteFilial={recorteFilial}
        rotulosTipo={mapaRotulosTipo(tiposItem)}
        aoVivo
      />
    </div>
  )
}
