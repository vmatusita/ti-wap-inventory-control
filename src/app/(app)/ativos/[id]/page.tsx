import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Plus, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ativos/status-badge'
import { EditarAtivoDialog } from '@/components/ativos/editar-ativo-dialog'
import { CorrigirPatrimonioDialog } from '@/components/ativos/corrigir-patrimonio-dialog'
import { CopiarPatrimonio } from '@/components/ativos/copiar-patrimonio'
import { AnotarDialog } from '@/components/ativos/anotar-dialog'
import { LinhaDoTempo } from '@/components/ativos/linha-do-tempo'
import { TermosDaFicha } from '@/components/ativos/termos-da-ficha'
import { buscarAtivoPorId, listarAnotacoesDoAtivo } from '@/lib/queries/ativos'
import { listarMovimentacoesDoAtivo } from '@/lib/queries/movimentacoes'
import { listarMotivos } from '@/lib/queries/motivos'
import { listarTermosDoAtivo } from '@/lib/queries/termos'
import type { TermoTipo } from '@/lib/termos/tipos'
import { rotuloCategoria, rotuloTermo } from '@/lib/dominio'
import { formatDate, ouTraco } from '@/lib/format'

function Dado({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

export default async function AtivoFichaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const ativo = await buscarAtivoPorId(id)
  if (!ativo) notFound()

  const [movimentacoes, anotacoes, motivosLista, termos] = await Promise.all([
    listarMovimentacoesDoAtivo(id),
    listarAnotacoesDoAtivo(id),
    listarMotivos(),
    listarTermosDoAtivo(id),
  ])
  const motivos = Object.fromEntries(motivosLista.map((m) => [m.codigo, m.rotulo]))

  // Movimentações elegíveis a termo (mais recentes; a linha do tempo vem desc):
  // responsabilidade (saída/empréstimo) e devolução — para geração retroativa.
  const respMov = movimentacoes.find(
    (m) => m.tipo === 'saida' || m.tipo === 'emprestimo',
  )
  const devolMov = movimentacoes.find((m) => m.tipo === 'devolucao')
  const devolTipo: TermoTipo | null = devolMov
    ? devolMov.motivo === 'desligamento'
      ? 'devolucao_desligamento'
      : 'devolucao_equipamento'
    : null

  const specs = [ativo.memoria, ativo.armazenamento, ativo.processador]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="space-y-6">
      <Link
        href="/ativos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar para ativos
      </Link>

      {/* Cabecalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight tabular-nums">
              {ativo.patrimonio ?? (
                <span className="text-muted-foreground italic">Sem patrimônio</span>
              )}
            </h1>
            {ativo.patrimonio && <CopiarPatrimonio valor={ativo.patrimonio} />}
            <StatusBadge status={ativo.status} />
          </div>
          <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
            {rotuloCategoria(ativo.categoria)}
            {ativo.service_tag && (
              <>
                <span>·</span>
                <span className="tabular-nums">
                  Service Tag {ativo.service_tag}
                </span>
                <CopiarPatrimonio
                  valor={ativo.service_tag}
                  rotulo="Service tag"
                />
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" className="h-10 gap-2 sm:h-8">
            <Link href={`/movimentacoes/nova?ativo=${ativo.id}`}>
              <Plus className="size-4" />
              Nova movimentação
            </Link>
          </Button>
          <AnotarDialog ativoId={ativo.id} />
          <CorrigirPatrimonioDialog
            ativoId={ativo.id}
            patrimonioAtual={ativo.patrimonio}
            serviceTag={ativo.service_tag}
          />
          <EditarAtivoDialog ativo={ativo} />
        </div>
      </div>

      {/* Pendencia em destaque */}
      {ativo.pendencia && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">Pendência:</span> {ativo.pendencia}
          </span>
        </div>
      )}

      {/* Grid de dados */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do ativo</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
            <Dado label="Categoria">{rotuloCategoria(ativo.categoria)}</Dado>
            <Dado label="Marca / Modelo">
              {ouTraco([ativo.marca, ativo.modelo].filter(Boolean).join(' '))}
            </Dado>
            <Dado label="Specs">{ouTraco(specs)}</Dado>
            <Dado label="Hostname">{ouTraco(ativo.hostname)}</Dado>
            <Dado label="Fornecedor">{ouTraco(ativo.fornecedor)}</Dado>
            <Dado label="Filial">{ativo.filial_nome}</Dado>
            <Dado label="Colaborador">{ouTraco(ativo.colaborador_atual)}</Dado>
            <Dado label="Setor">{ouTraco(ativo.setor_atual)}</Dado>
            <Dado label="Termo">
              {rotuloTermo(ativo.termo_assinado)}
              {ativo.termo_data && (
                <span className="text-muted-foreground">
                  {' '}
                  ({formatDate(ativo.termo_data)})
                </span>
              )}
            </Dado>
            <Dado label="Patrimônio original">
              {ouTraco(ativo.patrimonio_original)}
            </Dado>
            <Dado label="Origem">{ouTraco(ativo.origem)}</Dado>
          </dl>
          {ativo.observacoes && (
            <div className="mt-4 border-t pt-4">
              <p className="text-xs text-muted-foreground">Observações</p>
              <p className="mt-1 text-sm whitespace-pre-wrap">
                {ativo.observacoes}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Termos gerados + geração retroativa (F5A) + confirmar assinatura (B6) */}
      <TermosDaFicha
        ativoId={ativo.id}
        patrimonio={ativo.patrimonio}
        categoria={ativo.categoria}
        termoAssinado={ativo.termo_assinado}
        termoData={ativo.termo_data}
        termos={termos}
        respMovId={respMov?.id ?? null}
        devolMovId={devolMov?.id ?? null}
        devolTipo={devolTipo}
      />

      {/* Linha do tempo */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Linha do tempo</h2>
        <LinhaDoTempo
          movimentacoes={movimentacoes}
          anotacoes={anotacoes}
          motivos={motivos}
        />
      </div>
    </div>
  )
}
