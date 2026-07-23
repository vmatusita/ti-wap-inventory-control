import Link from 'next/link'
import { ArrowRight, Copy, StickyNote } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ativos/status-badge'
import { EstornarDialog } from '@/components/ativos/estornar-dialog'
import { formatDate, formatDateTime, ouTraco } from '@/lib/format'
import { rotuloTipo, rotuloAcessorio } from '@/lib/dominio'
import type { MovimentacaoTimeline } from '@/lib/queries/movimentacoes'
import type { AnotacaoTimeline } from '@/lib/queries/ativos'

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

type Evento =
  | { at: string; kind: 'mov'; mov: MovimentacaoTimeline }
  | { at: string; kind: 'nota'; nota: AnotacaoTimeline }

// Linha do tempo da ficha (OS-F2 3.2.3 + F3B 3.5): movimentações E anotações,
// intercaladas por created_at (mais recente no topo). A anotação tem estilo
// distinto (nota, sem seta de transição de estado). "Estornar" só na
// movimentação efetiva mais recente.
export function LinhaDoTempo({
  movimentacoes,
  anotacoes = [],
  motivos,
  // F14/MN4 — reuso somente-leitura (seção "Histórico do ativo substituído" na
  // ficha do substituto): esconde as ações (Estornar/Duplicar), que agiriam sobre
  // o ativo ANTIGO. Na ficha própria do ativo segue `false` (ações visíveis).
  somenteLeitura = false,
}: {
  movimentacoes: MovimentacaoTimeline[]
  anotacoes?: AnotacaoTimeline[]
  motivos: Record<string, string>
  somenteLeitura?: boolean
}) {
  const eventos: Evento[] = [
    ...movimentacoes.map((m) => ({ at: m.created_at, kind: 'mov' as const, mov: m })),
    ...anotacoes.map((a) => ({ at: a.created_at, kind: 'nota' as const, nota: a })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

  if (eventos.length === 0) {
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
  // Só a movimentação efetiva mais recente pode ser estornada (regra 6).
  const topoMovId = movimentacoes[0]?.id

  return (
    <ol className="space-y-4">
      {eventos.map((ev, i) => {
        const ultimo = i === eventos.length - 1
        const trilho = (cor: string) => (
          <>
            <span
              aria-hidden
              className={`absolute top-1.5 left-1.5 size-2.5 -translate-x-1/2 rounded-full border-2 border-background ${cor}`}
            />
            {!ultimo && (
              <span
                aria-hidden
                className="absolute top-4 bottom-[-1rem] left-1.5 -translate-x-1/2 border-l"
              />
            )}
          </>
        )

        if (ev.kind === 'nota') {
          const n = ev.nota
          return (
            <li key={`nota-${n.id}`} className="relative pl-6">
              {trilho('bg-amber-400')}
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="gap-1 border-amber-300 bg-amber-100/60 font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  >
                    <StickyNote className="size-3" />
                    Anotação
                  </Badge>
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap">{n.texto}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {ouTraco(n.autor_nome)} · {formatDateTime(n.created_at)}
                </p>
              </div>
            </li>
          )
        }

        const m = ev.mov
        const estornada = estornoDe.has(m.id)
        const podeEstornar = m.id === topoMovId && m.tipo !== 'estorno'
        const motivoRotulo = m.motivo ? (motivos[m.motivo] ?? m.motivo) : null

        return (
          <li key={m.id} id={`mov-${m.id}`} className="relative scroll-mt-20 pl-6">
            {trilho('bg-primary')}

            <div className={'rounded-lg border p-3 ' + (estornada ? 'bg-muted/30' : 'bg-card')}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-medium">
                  {rotuloTipo(m.tipo)}
                </Badge>
                <span
                  className={'text-sm tabular-nums ' + (estornada ? 'text-muted-foreground' : '')}
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
                {!somenteLeitura && (
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
                      <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                        <Link href={`/movimentacoes/nova?duplicar=${m.id}`}>
                          <Copy className="size-3.5" />
                          Duplicar
                        </Link>
                      </Button>
                    )}
                  </div>
                )}
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
                  m.chamado ||
                  m.chamado_fornecedor) && (
                  <p className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {motivoRotulo && (
                      <span>
                        <span className="text-muted-foreground">Motivo:</span> {motivoRotulo}
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
                        <span className="text-muted-foreground">Chamado:</span> #{m.chamado}
                      </span>
                    )}
                    {/* F14/MN1 — chamado do fornecedor (só nas movs de manutenção). */}
                    {m.chamado_fornecedor && (
                      <span>
                        <span className="text-muted-foreground">Chamado do fornecedor:</span>{' '}
                        {m.chamado_fornecedor}
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
