import Link from 'next/link'
import { ArrowRight, Copy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ativos/status-badge'
import { EstornarDialog } from '@/components/ativos/estornar-dialog'
import { formatDate, formatDateTime, ouTraco } from '@/lib/format'
import { rotuloTipo, rotuloAcessorio } from '@/lib/dominio'
import type { MovimentacaoTimeline } from '@/lib/queries/movimentacoes'

function LinhaEstado({
  de,
  para,
}: {
  de: MovimentacaoTimeline['status_anterior']
  para: MovimentacaoTimeline['status_resultante']
}) {
  if (!para) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      {de && <StatusBadge status={de} className="text-[11px]" />}
      <ArrowRight className="size-3 text-muted-foreground" />
      <StatusBadge status={para} className="text-[11px]" />
    </span>
  )
}

export function LinhaDoTempo({
  movimentacoes,
  motivos,
}: {
  movimentacoes: MovimentacaoTimeline[]
  motivos: Record<string, string>
}) {
  if (movimentacoes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        Nenhuma movimentação registrada para este ativo.
      </p>
    )
  }

  // Mapa movimentacao original -> id do estorno que a desfez.
  const estornoDe = new Map<string, string>()
  for (const m of movimentacoes) {
    if (m.tipo === 'estorno' && m.estorno_de) estornoDe.set(m.estorno_de, m.id)
  }

  return (
    <ol className="space-y-4">
      {movimentacoes.map((m, i) => {
        const estornada = estornoDe.has(m.id)
        const ehTopo = i === 0
        const podeEstornar = ehTopo && m.tipo !== 'estorno'
        const motivoRotulo = m.motivo ? (motivos[m.motivo] ?? m.motivo) : null

        return (
          <li
            key={m.id}
            id={`mov-${m.id}`}
            className="relative scroll-mt-20 pl-6"
          >
            {/* trilho vertical */}
            <span
              aria-hidden
              className="absolute top-1.5 left-1.5 size-2.5 -translate-x-1/2 rounded-full border-2 border-background bg-primary"
            />
            {i < movimentacoes.length - 1 && (
              <span
                aria-hidden
                className="absolute top-4 bottom-[-1rem] left-1.5 -translate-x-1/2 border-l"
              />
            )}

            <div
              className={
                'rounded-lg border p-3 ' +
                (estornada ? 'bg-muted/30' : 'bg-card')
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-medium">
                  {rotuloTipo(m.tipo)}
                </Badge>
                <span
                  className={
                    'text-sm tabular-nums ' +
                    (estornada ? 'text-muted-foreground' : '')
                  }
                >
                  {formatDate(m.data)}
                </span>
                {estornada && (
                  <a
                    href={`#mov-${estornoDe.get(m.id)}`}
                    className="text-xs font-medium text-destructive underline-offset-2 hover:underline"
                  >
                    estornada
                  </a>
                )}
                <div className="ml-auto flex items-center gap-1">
                  {podeEstornar && (
                    <EstornarDialog
                      movimentacaoId={m.id}
                      restauraStatus={m.status_anterior}
                      restauraColaborador={m.snapshot_anterior?.colaborador ?? null}
                      restauraSetor={m.snapshot_anterior?.setor ?? null}
                      filialAnteriorNome={
                        m.tipo === 'transferencia' ? m.filial_origem_nome : null
                      }
                    />
                  )}
                  {m.tipo !== 'estorno' && (
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                    >
                      <Link href={`/movimentacoes/nova?duplicar=${m.id}`}>
                        <Copy className="size-3.5" />
                        Duplicar
                      </Link>
                    </Button>
                  )}
                </div>
              </div>

              <div
                className={
                  'mt-2 space-y-1 text-sm ' +
                  (estornada ? 'text-muted-foreground line-through' : '')
                }
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <LinhaEstado de={m.status_anterior} para={m.status_resultante} />
                </div>

                {(motivoRotulo ||
                  m.colaborador ||
                  m.setor ||
                  m.chamado) && (
                  <p className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {motivoRotulo && (
                      <span>
                        <span className="text-muted-foreground">Motivo:</span>{' '}
                        {motivoRotulo}
                      </span>
                    )}
                    {(m.colaborador || m.setor) && (
                      <span>
                        <span className="text-muted-foreground">Destino:</span>{' '}
                        {[m.colaborador, m.setor].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    {m.chamado && (
                      <span className="tabular-nums">
                        <span className="text-muted-foreground">Chamado:</span> #
                        {m.chamado}
                      </span>
                    )}
                  </p>
                )}

                {m.tipo === 'transferencia' &&
                  (m.filial_origem_nome || m.filial_destino_nome) && (
                    <p className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Filial:</span>
                      {ouTraco(m.filial_origem_nome)}
                      <ArrowRight className="size-3 text-muted-foreground" />
                      {ouTraco(m.filial_destino_nome)}
                    </p>
                  )}

                {m.itens_faltantes && m.itens_faltantes.length > 0 && (
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="text-muted-foreground">Itens faltantes:</span>
                    {m.itens_faltantes.map((it) => (
                      <Badge
                        key={it}
                        variant="outline"
                        className="border-amber-300 bg-amber-50 text-xs font-normal text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      >
                        {rotuloAcessorio(it)}
                      </Badge>
                    ))}
                  </p>
                )}

                {m.observacao && (
                  <p className="text-muted-foreground italic">“{m.observacao}”</p>
                )}
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                {ouTraco(m.autor_nome)} · {formatDateTime(m.created_at)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
