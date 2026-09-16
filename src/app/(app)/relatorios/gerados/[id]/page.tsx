import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ArrowRight, BarChart3, FileText, TriangleAlert } from 'lucide-react'
import { resolverAcessoRelatorio } from '@/lib/auth/acesso'
import { redirectAcessoRelatorios } from '@/lib/auth/otp'
import { buscarRelatorioGerado, vizinhosDoRelatorio } from '@/lib/queries/gerados'
import { formatDate, formatDateTime, ouTraco } from '@/lib/format'
import { CorpoRelatorio } from '@/components/relatorios/corpo-relatorio'
import { listarTiposItem, type TipoItem } from '@/lib/queries/tipos-item'
import { mapaRotulosTipo } from '@/lib/itens/rotulo-tipo'
import { BotaoImprimir } from '@/components/relatorios/botao-imprimir'
import { registrarFalha } from '@/lib/observabilidade'

// FLX-03 — título curto da aba (WCAG 2.4.2). Estático: o snapshot (filial +
// período) já está no banner e no `<h1>` da própria tela.
export const metadata = {
  title: 'Relatório gerado',
}

// F60 · fato 17 — teto de execução ESCRITO, não herdado (ata da F60 em docs/DECISOES.md). Sem
// ele a rota fica com os 300 s da Vercel, e 300 s só acontece quando a conexão com o Supabase
// PENDURA (24/07/2026; o raciocínio inteiro está em relatorios/[filial]/page.tsx): 60 s troca
// cinco minutos de spinner por um erro rápido.
// Esta página não hospeda Server Action própria.
export const maxDuration = 60

export default async function RelatorioGeradoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const acesso = await resolverAcessoRelatorio()
  if (!acesso) {
    // FLX-01 — mesma guarda do layout: volta para ESTE snapshot depois de
    // repor a senha, em vez de cair no consolidado ao vivo.
    const h = await headers()
    redirect(
      redirectAcessoRelatorios(
        h.get('x-wap-pathname') ?? '',
        h.get('x-wap-search') ?? '',
      ),
    )
  }
  const ehOperador = acesso.modo === 'operador'

  const detalhe = await buscarRelatorioGerado(acesso.client, id)
  if (!detalhe) notFound()

  const s = detalhe.snapshot

  // F29/REL-05c — o snapshot era um beco: só "← Relatórios gerados". Os três destinos
  // novos ficam DENTRO de /relatorios/**, então valem também para o visualizador por
  // senha (que não tem sidebar nem paleta e depende deste rodapé para navegar).
  // F39 — o vocabulário dos itens faltantes, com o CLIENT RESOLVIDO (o snapshot
  // congelado também é servido ao visualizador por senha). O snapshot guarda os
  // SLUGS; o rótulo é resolvido na hora de exibir, como sempre foi.
  //
  // ⚠ NO MESMO `Promise.all` DOS VIZINHOS (revisão de 29/08/2026): as duas leituras
  // são independentes, e esta rota é a que o visualizador abre para imprimir — foi
  // por TTFB que a F33 mexeu nela. Encadeadas, era um round-trip serial de graça.
  const [tiposItem, vizinhos] = await Promise.all([
    listarTiposItem(acesso.client).catch((err): TipoItem[] => {
      // Degrada, nunca derruba (mesma razão da rota ao vivo): sem o mapa, o item
      // faltante sai com o slug cru, e o snapshot continua abrindo.
      registrarFalha({
        escopo: 'relatorios.gerados-tipos-item',
        erro: err,
        operador: acesso.modo === 'operador' ? acesso.operador.id : null,
      })
      return []
    }),
    vizinhosDoRelatorio(acesso.client, {
      filialId: detalhe.filialId,
      periodoDe: detalhe.periodo_de,
    }),
  ])
  // O slug vem do PRÓPRIO snapshot congelado (`meta.filialSlug`, gravado na geração):
  // dispensa consultar `filiais` e continua certo para o consolidado ('geral').
  const hrefAoVivo = `/relatorios/${s.meta.filialSlug}?preset=custom&de=${detalhe.periodo_de}&ate=${detalhe.periodo_ate}`

  return (
    <div className="space-y-4">
      <Link
        href="/relatorios/gerados"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowLeft className="size-4" />
        Relatórios gerados
      </Link>

      {/* Banner fixo: relatório congelado (OS-F3 3.8.5) */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2.5 text-sm">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span>
          <strong>Relatório gerado</strong> · {s.meta.filialNome} ·{' '}
          {formatDate(detalhe.periodo_de)} a {formatDate(detalhe.periodo_ate)} ·{' '}
          versão {detalhe.versao} · por {ouTraco(detalhe.autorNome)} em{' '}
          {formatDateTime(detalhe.gerado_em)}
        </span>
        <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-medium">
          dados congelados
        </span>
      </div>

      {detalhe.versaoMaisNova && (
        <Link
          href={`/relatorios/gerados/${detalhe.versaoMaisNova.id}`}
          className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60 print:hidden"
        >
          <TriangleAlert className="size-4 shrink-0" />
          Existe a versão {detalhe.versaoMaisNova.versao} deste relatório — abrir a
          mais recente.
        </Link>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Relatório — {s.meta.filialNome}
          </h1>
          <p className="text-sm text-muted-foreground">
            Snapshot de {formatDate(detalhe.periodo_de)} a{' '}
            {formatDate(detalhe.periodo_ate)}
          </p>
        </div>
        <BotaoImprimir />
      </div>

      <CorpoRelatorio
        snapshot={s}
        ehOperador={ehOperador}
        rotulosTipo={mapaRotulosTipo(tiposItem)}
      />

      <nav
        aria-label="Navegar entre snapshots deste escopo"
        className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 print:hidden"
      >
        {vizinhos.anterior ? (
          <Link
            href={`/relatorios/gerados/${vizinhos.anterior.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Período anterior ({formatDate(vizinhos.anterior.periodo_de)} a{' '}
            {formatDate(vizinhos.anterior.periodo_ate)})
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">
            Este é o snapshot mais antigo deste escopo
          </span>
        )}

        <Link
          href={hrefAoVivo}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <BarChart3 className="size-4" />
          Ver este período no ao vivo
        </Link>

        {vizinhos.proximo ? (
          <Link
            href={`/relatorios/gerados/${vizinhos.proximo.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Próximo período ({formatDate(vizinhos.proximo.periodo_de)} a{' '}
            {formatDate(vizinhos.proximo.periodo_ate)})
            <ArrowRight className="size-4" />
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">
            Este é o snapshot mais recente deste escopo
          </span>
        )}
      </nav>
    </div>
  )
}
