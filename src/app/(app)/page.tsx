import Link from 'next/link'
import {
  ArrowLeftRight,
  BarChart3,
  ClipboardCheck,
  Package,
  PackageMinus,
  PackagePlus,
  TriangleAlert,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getOperador } from '@/lib/auth/acesso'
import { rotaRelatorioPadrao } from '@/lib/relatorios/rota-padrao'
import { listarFiliais } from '@/lib/queries/filiais'
import { selecaoDeUnidadesPorSlug } from '@/lib/filtros/filial'
import { efetivar, lerUnidades, recorteDe } from '@/lib/auth/recorte-leitura'
import { recortarPorUnidade } from '@/lib/queries/recorte-consulta'
import { podeEscrever } from '@/lib/auth/papeis'
import { getUltimasMovimentacoes } from '@/lib/queries/relatorios'
import { getKpisDoDashboard } from '@/lib/queries/dashboard'
import { getSaldosItens, listarItensAtivos } from '@/lib/queries/itens'
import { contarConflitosAbertos } from '@/lib/queries/conflitos'
import { itensParaRepor, minimosDoCatalogo } from '@/lib/itens/repor'
import { hojeISO, formatDate } from '@/lib/format'
import { rotuloCategoria, pillTipo, rotuloTipo } from '@/lib/dominio'
import type { CategoriaAtivo } from '@/lib/dominio'
import { Card, CardContent } from '@/components/ui/card'
import { KpiTiles, type LinksKpi } from '@/components/relatorios/kpi-tiles'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { cn } from '@/lib/utils'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import { registrarFalha } from '@/lib/observabilidade'
import { linhasOuFalha } from '@/lib/supabase/linhas'
import { LEITURA_FILA_PENDENCIAS_DASHBOARD } from '@/lib/queries/formas/dashboard'

// FLX-03 — título curto da aba (WCAG 2.4.2).
export const metadata = {
  title: 'Dashboard',
}

// F60 · fato 17 — teto de execução ESCRITO, não herdado (ata da F60 em docs/DECISOES.md). Sem
// ele a rota fica com os 300 s da Vercel, e 300 s só acontece quando a conexão com o Supabase
// PENDURA (24/07/2026; o raciocínio inteiro está em relatorios/[filial]/page.tsx): 60 s troca
// cinco minutos de spinner por um erro rápido.
// Esta página não hospeda Server Action própria.
export const maxDuration = 60

// `escrita: true` = o atalho leva a um formulário que GRAVA — some para o cargo
// Consulta (F21), que continua com os dois atalhos de leitura.
const ACOES = [
  {
    href: '/movimentacoes/nova',
    icone: ArrowLeftRight,
    titulo: 'Nova movimentação',
    descricao: 'Saída, devolução, transferência… inclusive em lote.',
    escrita: true,
  },
  {
    href: '/ativos/novo',
    icone: PackagePlus,
    titulo: 'Novo equipamento',
    descricao: 'Entrada por compra — um ou vários de uma vez.',
    escrita: true,
  },
  {
    href: '/relatorios/geral',
    icone: BarChart3,
    titulo: 'Relatórios',
    descricao: 'Estoque por filial, ao vivo, e o arquivo semanal.',
  },
  {
    href: '/ativos',
    icone: Package,
    titulo: 'Ativos',
    descricao: 'Consultar, filtrar e abrir a ficha de um ativo.',
  },
]

// Destino de cada KPI (OS-F9 / T2) — só no dashboard. Os valores são os do enum
// `status_ativo` (STATUS_ORDEM em dominio.ts), que é o que /ativos aceita em
// `status` (CSV). "Total de ativos" lista os 7 status que o KPI soma — `kpisDeContagens`
// (F60; a mesma regra de `kpisDeEstado`) pula as baixas `descartado` e
// `devolvido_fornecedor` (estoque.ts), e apontar para
// /ativos sem filtro faria a lista mostrar um número maior que o do tile clicado
// (achado da revisão adversarial). O estado terminal novo (F14) fica FORA por isso.
// F25 — o `&filial=todas` é obrigatório aqui: os KPIs deste painel são GLOBAIS, e
// a ausência do param passou a significar "o padrão do cargo". Sem a sentinela, o
// operador clicaria num total de todas as filiais e cairia na lista recortada nas
// dele — o mesmo defeito que o recorte por status acima já evitava, por outra via.
const LINKS_KPI: LinksKpi = {
  total:
    '/ativos?status=em_estoque,reservado,em_uso,emprestado,em_triagem,em_manutencao,defasado&filial=todas',
  em_uso: '/ativos?status=em_uso&filial=todas',
  em_estoque: '/ativos?status=em_estoque&filial=todas',
  reservado: '/ativos?status=reservado&filial=todas',
  em_triagem: '/ativos?status=em_triagem&filial=todas',
  em_manutencao: '/ativos?status=em_manutencao&filial=todas',
  defasado: '/ativos?status=defasado&filial=todas',
}

type PendenciaHome = {
  // F58 — `id`/`ordem` são não-nulos NA VIEW (colunas-de-view.ts): o tipo à mão dizia
  // `string | null` para os dois, supondo o mesmo que o cast de antes.
  id: string
  ordem: string
  patrimonio: string | null
  categoria: CategoriaAtivo | null
  filial: string | null
  pendencia: string | null
}

export default async function DashboardPage() {
  const client = await createClient()
  const hoje = hojeISO()
  // F21 — cargo de quem abriu o painel. Só decide o que MOSTRAR: os números
  // abaixo são os mesmos para os três cargos (leitura ampla — ADR-001).
  const operador = await getOperador()
  const escreve = podeEscrever(operador?.papel)
  // F25 — o mesmo destino de "Relatórios" da sidebar (resolvido por cargo).
  const hrefRelatorios = await rotaRelatorioPadrao(operador)

  // As duas leituras do ponto de reposição (F12 · I5) entram no MESMO
  // `Promise.all` das outras — nada de cascata sequencial na home. `null` em
  // `getSaldosItens` é o consolidado de todas as filiais, que é justamente com
  // quem o mínimo compara (decisão do Johnny 22/07/2026).
  // F25 — o RECORTE do card de pendências. A régua desta tela: número do ACERVO é
  // global (os KPIs somam todas as filiais, e por isso os links deles declaram
  // ); LISTA DE TRABALHO é recortada como a pessoa a verá. O card de
  // pendências é lista de trabalho — cada linha leva à ficha para alguém agir —, e o
  // comentário logo abaixo declara o invariante: MESMA fonte do selo e de /pendencias.
  // Sem isto o operador via o selo dizer 0, o card listar 5 pendências de uma filial
  // que não é dele e "ver todas" abrir a lista vazia: três superfícies vizinhas
  // afirmando coisas diferentes.
  // F57 — sem a lista de filiais (a leitura falhou), cai no global pela seleção `todas`, com
  // nome — o mesmo desfecho de antes, sem lista vazia no meio.
  const unidadesDoOperador = await listarFiliais()
    .then((fs) => efetivar(recorteDe(operador), selecaoDeUnidadesPorSlug(undefined, operador, fs)))
    .catch(() => efetivar(recorteDe(operador), { familia: 'slug', modo: 'todas' }))
  const filaPendencias = recortarPorUnidade(
    client.from('v_fila_pendencias').select(LEITURA_FILA_PENDENCIAS_DASHBOARD.select),
    'filial',
    unidadesDoOperador,
  )

  const [kpis, pendenciasRes, ultimas, saldosItens, catalogoItens, conflitos] =
    await Promise.all([
      // F60 (fato 13) — uma contagem agregada no banco, com a lista de TODAS as filiais, no lugar
      // de ler `ativos` inteira para contar oito números (`queries/dashboard.ts`).
      getKpisDoDashboard(),
      // F18: a MESMA fonte do selo da sidebar e de /pendencias (v_fila_pendencias) —
      // inclui as pendências de item faltante (uma linha por item). Ler v_pendencias
      // aqui esconderia os itens (o backfill 0053 tirou o texto do campo livre) e a
      // prévia divergiria do selo. `ordem` é a chave única por linha (o mesmo ativo
      // pode ter mais de uma linha).
      filaPendencias
        // As 5 mais ANTIGAS abertas (as que mais pedem ação), determinístico e na
        // MESMA ordem da fila (desde asc, desempate por `ordem`) — antes o limit(5)
        // sem order devolvia 5 arbitrários/instáveis (achado da revisão).
        .order('desde', { ascending: true, nullsFirst: false })
        .order('ordem', { ascending: true })
        .limit(5),
      getUltimasMovimentacoes(client, null, { de: '2000-01-01', ate: hoje }, 5),
      getSaldosItens(null),
      listarItensAtivos(),
      // FLX-04 — MESMO recorte de filial da fila acima (unidadesDoOperador): o
      // selo da sidebar soma fila + conflitos com este recorte por cargo
      // ((app)/layout.tsx:63-73), e o card de Pendências precisa contar a
      // mesma coisa para não voltar a divergir dele. A função já engole o
      // próprio erro e devolve 0 — mesma disciplina das outras leituras desta
      // página (comentário acima do `pendenciasErro`).
      contarConflitosAbertos(unidadesDoOperador),
    ])
  // A falha de leitura NÃO pode virar lista vazia: o estado vazio deste card é o
  // comemorativo ("Nenhuma pendência aberta 🎉"), então um erro em
  // `v_fila_pendencias` (RLS, view recriada, timeout) afirmaria ao operador
  // exatamente o contrário da verdade. Registra no servidor e a UI diz que não
  // conseguiu ler — o resto do dashboard continua de pé.
  const erroBancoPendencias = pendenciasRes.error
  if (erroBancoPendencias) {
    registrarFalha({
      escopo: 'dashboard.fila-pendencias',
      erro: erroBancoPendencias,
      operador: operador?.id ?? null,
    })
  }
  // A forma errada segue o MESMO caminho do erro de banco, logo acima (registrarFalha já
  // acontece dentro da porta): as duas viram o mesmo aviso "não foi possível ler".
  const lidoPendencias = erroBancoPendencias
    ? null
    : linhasOuFalha(
        pendenciasRes.data,
        LEITURA_FILA_PENDENCIAS_DASHBOARD.forma,
        LEITURA_FILA_PENDENCIAS_DASHBOARD.rotulo,
      )
  const pendenciasErro = !!erroBancoPendencias || (lidoPendencias !== null && !lidoPendencias.ok)
  const pendencias: PendenciaHome[] =
    lidoPendencias && lidoPendencias.ok ? lidoPendencias.linhas : []

  // Item DESATIVADO que ainda tem saldo aparece na RPC e não no catálogo ativo:
  // fica sem mínimo no mapa e nunca alerta (repor.ts). O card só existe quando
  // há o que repor — ver o comentário na renderização.
  const repor = itensParaRepor(saldosItens, minimosDoCatalogo(catalogoItens))

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <LinkAjuda pagina="mapa-das-telas" rotulo="Ajuda: o mapa das telas" />
        </div>
        <p className="text-sm text-muted-foreground">
          Visão geral do estoque de TI — todas as filiais.
        </p>
      </div>

      <KpiTiles kpis={kpis} links={LINKS_KPI} />

      {/* Itens para repor (F12 · I5) — card INLINE, não tile do KpiTiles: os
          tiles contam ativos patrimoniados por status, e um nono tile contando
          outra coisa (itens por quantidade) leria como se fosse da mesma soma.
          Some por completo quando não há nada a repor: é um alerta de exceção,
          sem tela própria para onde levar, e um "0 itens para repor" permanente
          só somaria ruído a um dashboard que já tem 8 tiles, 2 cards e 4 atalhos
          — a ausência do card é a boa notícia. (Pendências, que é fixture com
          rota própria, continua mostrando o estado vazio comemorativo.) */}
      {repor.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-900">
          <CardContent className="py-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <PackageMinus className="size-4 text-amber-700 dark:text-amber-400" aria-hidden />
                Itens para repor
                <span className="rounded bg-amber-100 px-1.5 text-xs tabular-nums text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {repor.length.toLocaleString('pt-BR')}
                </span>
              </h2>
              <Link
                href="/itens"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                ver em Itens
              </Link>
            </div>
            <ul className="divide-y">
              {repor.slice(0, 5).map((r) => (
                <li key={r.item_id} className="flex items-baseline gap-3 py-2 text-sm">
                  {/* O nome leva à busca JÁ FILTRADA em /itens (o mesmo param `q`
                      da caixa de busca da tela) — o operador chega no item, não
                      numa lista para procurar de novo. */}
                  <Link
                    href={`/itens?q=${encodeURIComponent(r.item)}`}
                    className="min-w-0 flex-1 truncate font-medium underline-offset-2 hover:underline"
                  >
                    {r.item}
                  </Link>
                  <span className="hidden shrink-0 tabular-nums text-muted-foreground sm:inline">
                    estoque {r.estoque.toLocaleString('pt-BR')} · mínimo{' '}
                    {r.minimo.toLocaleString('pt-BR')}
                  </span>
                  {/* "repor N", nunca "faltam N": "faltam" já é o vocabulário do
                      déficit de atrelados em /itens (spec §7) e reusar a palavra
                      aqui misturaria dois números que não se somam. */}
                  <span className="min-w-24 shrink-0 text-right tabular-nums text-amber-800 dark:text-amber-300">
                    repor {r.abaixo.toLocaleString('pt-BR')}
                  </span>
                </li>
              ))}
            </ul>
            {repor.length > 5 && (
              <p className="pt-2 text-xs text-muted-foreground">
                e mais {(repor.length - 5).toLocaleString('pt-BR')} item(ns) abaixo do
                mínimo.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="py-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Pendências</h2>
              <Link
                // SEM sentinela, de propósito (F25): este card já mostra o MESMO
                // recorte com que /pendencias abre para este cargo, então "ver
                // todas" tem de cair exatamente nessa lista. Acrescentar
                // `?filial=todas` aqui alargaria o destino e traria de volta a
                // divergência selo × card × lista que a fase fechou.
                // (Os KPIs acima são o caso oposto: número GLOBAL, link com a
                // sentinela — ver o comentário de LINKS_KPI.)
                href="/pendencias"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                ver todas
              </Link>
            </div>
            {pendenciasErro ? (
              <EstadoVazio
                variante="inline"
                icone={TriangleAlert}
                titulo="Não foi possível ler as pendências."
                descricao="a lista pode estar desatualizada — abra Pendências para conferir"
              />
            ) : pendencias.length === 0 ? (
              // ⚠ O card lê a fila JÁ RECORTADA nas filiais do cargo, então
              // "nenhuma pendência aberta" seria uma afirmação global feita sobre
              // uma leitura parcial. Quando há recorte, o texto diz de onde.
              //
              // FLX-04 — a fila fala só de `v_fila_pendencias`; conflitos entre
              // filiais têm fonte e mesa próprias (mesmo motivo do selo da
              // sidebar somar os dois em (app)/layout.tsx) e não entram nela. O
              // título "nenhuma pendência NA FILA" continua verdadeiro sozinho —
              // o que muda é a linha de baixo: com `conflitos` já contado (MESMO
              // recorte da fila, acima), ela larga a hipótese "se houver" e passa
              // a dizer o que o selo já sabia, para o card não comemorar 🎉 ao
              // lado de um selo "2" sem explicar o porquê.
              <EstadoVazio
                variante="inline"
                icone={ClipboardCheck}
                titulo={
                  // F57 — "recortado" é a vista que NÃO é `todas` (antes: a lista não-vazia).
                  lerUnidades(unidadesDoOperador).modo !== 'todas'
                    ? 'Nenhuma pendência na fila das suas filiais. 🎉'
                    : 'Nenhuma pendência na fila. 🎉'
                }
              />
            ) : (
              <ul className="divide-y">
                {pendencias.map((p) => (
                  <li key={p.ordem ?? p.id} className="flex items-baseline gap-3 py-2 text-sm">
                    <Link
                      href={`/ativos/${p.id}`}
                      className="w-24 shrink-0 font-medium tabular-nums underline-offset-2 hover:underline"
                    >
                      {p.patrimonio ?? '—'}
                    </Link>
                    <span className="shrink-0 text-muted-foreground">
                      {p.categoria ? rotuloCategoria(p.categoria) : ''} · {p.filial}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-amber-800 dark:text-amber-300">
                      {p.pendencia}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {/* FLX-04 — FORA do ramo de fila vazia, de propósito: o selo da
                sidebar soma fila + conflitos SEMPRE, então esconder esta linha
                quando a fila tem itens recriaria a mesma divergência entre
                superfícies vizinhas, só que mais difícil de notar (card "3",
                selo "5"). Vale inclusive quando a leitura da fila falha — o
                conflito foi contado por outra fonte, que respondeu. */}
            {conflitos > 0 && (
              <p className="flex flex-wrap items-center gap-2 py-2 text-sm text-amber-800 dark:text-amber-300">
                <TriangleAlert
                  className="size-4 shrink-0 text-amber-700 dark:text-amber-400"
                  aria-hidden
                />
                <span>
                  {conflitos} {conflitos === 1 ? 'conflito' : 'conflitos'} entre filiais —{' '}
                  <Link
                    href="/pendencias?tipo=conflito"
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    resolver em Pendências
                  </Link>
                </span>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Últimas movimentações</h2>
              <Link
                // FLX-02 — antes apontava para o relatório Consolidado
                // (resquício de antes da F11, quando /movimentacoes não
                // existia). O card lista as últimas movimentações de TODAS as
                // filiais, então o destino continua amplo — só que agora na
                // LISTA (M8), com a MESMA sentinela `filial=todas` de
                // LINKS_KPI acima: sem ela a ausência do param cairia no
                // padrão do cargo e estreitaria o que o card acabou de
                // mostrar.
                href="/movimentacoes?filial=todas"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                ver todas
              </Link>
            </div>
            {ultimas.length === 0 ? (
              <EstadoVazio
                variante="inline"
                icone={ArrowLeftRight}
                titulo="Sem movimentações ainda."
                acao={
                  escreve
                    ? { href: '/movimentacoes/nova', rotulo: 'Registrar a primeira' }
                    : undefined
                }
              />
            ) : (
              <ul className="divide-y">
                {ultimas.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                      {formatDate(m.data)}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        pillTipo(m.tipo),
                      )}
                    >
                      {rotuloTipo(m.tipo)}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {m.patrimonio}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {m.colaborador_setor ?? m.ativo}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* F25 — o card de Relatórios leva ao mesmo destino da sidebar (por cargo). */}
        {ACOES.filter((a) => escreve || !a.escrita).map((a) => (
          <Link
            key={a.href}
            href={a.href === '/relatorios/geral' ? hrefRelatorios : a.href}
            className="group"
          >
            <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-accent/40">
              <CardContent className="flex items-start gap-3 py-5">
                <span className="rounded-md bg-muted p-2 text-foreground">
                  <a.icone className="size-5" />
                </span>
                <div>
                  <p className="font-medium">{a.titulo}</p>
                  <p className="text-sm text-muted-foreground">{a.descricao}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
