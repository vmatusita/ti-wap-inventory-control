import { PackageCheck, PackageX, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ResolverPendenciaItemDialog } from '@/components/pendencias/resolver-pendencia-item-dialog'
import { rotuloAcessorio, rotuloDesfechoPendenciaItem } from '@/lib/dominio'
import { formatDate } from '@/lib/format'
import type { PendenciaItemFicha as Pendencia } from '@/lib/queries/pendencias-item'

// Bloco de pendências de item faltante na ficha do ativo (F18 §B3). Abertas em
// destaque, com Resolver visível SEM clique; resolvidas como auditoria
// (desfecho/quem/quando) — a resolvida NÃO some da ficha, só da fila. Server
// Component (embute o diálogo client); não renderiza nada se não houver nenhuma.
//
// F21 — `podeResolver` vem da ficha (cargo × filial do ativo). Sem ele, o bloco
// continua VISÍVEL (a pendência é informação, e todo cargo lê tudo): só o botão
// "Resolver" sai, porque resolver é escrita.
export function PendenciasItemFicha({
  patrimonio,
  pendencias,
  podeResolver,
}: {
  patrimonio: string | null
  pendencias: Pendencia[]
  podeResolver: boolean
}) {
  if (pendencias.length === 0) return null
  const abertas = pendencias.filter((p) => p.status === 'aberta')
  const resolvidas = pendencias.filter((p) => p.status !== 'aberta')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Itens faltantes da devolução</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {abertas.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <div className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <div>
                <span className="font-medium">{rotuloAcessorio(p.item)}</span>
                <span className="block text-xs text-amber-800/80 dark:text-amber-200/70">
                  {p.colaborador ? `${p.colaborador} · ` : ''}
                  devolução de {p.desde ? formatDate(p.desde) : '—'}
                </span>
              </div>
            </div>
            {podeResolver && (
              <ResolverPendenciaItemDialog
                ids={[p.id]}
                resumo={`${rotuloAcessorio(p.item)}${patrimonio ? ' · ' + patrimonio : ''}`}
                trigger={
                  <Button variant="outline" size="sm" className="h-8 gap-1.5">
                    <PackageCheck className="size-3.5" />
                    Resolver
                  </Button>
                }
              />
            )}
          </div>
        ))}
        {resolvidas.map((p) => (
          <div
            key={p.id}
            className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground"
          >
            <PackageX className="mt-0.5 size-4 shrink-0" />
            <div>
              <span className="font-medium text-foreground/70 line-through decoration-muted-foreground/50">
                {rotuloAcessorio(p.item)}
              </span>{' '}
              <span>— {rotuloDesfechoPendenciaItem(p.desfecho)}</span>
              <span className="block text-xs">
                {p.resolvidaEm ? formatDate(p.resolvidaEm) : ''}
                {p.resolvidaPorNome ? ` · ${p.resolvidaPorNome}` : ''}
                {p.observacao ? ` · ${p.observacao}` : ''}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
