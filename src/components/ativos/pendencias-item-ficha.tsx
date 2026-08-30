import { PackageCheck, PackageX, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ReabrirPendenciaItemDialog,
  ResolverPendenciaItemDialog,
} from '@/components/pendencias/resolver-pendencia-item-dialog'
import { rotuloDesfechoPendenciaItem } from '@/lib/dominio'
import { rotuloTipoItem, type MapaRotulosTipo } from '@/lib/itens/rotulo-tipo'
import { formatDate } from '@/lib/format'
import type { PendenciaItemFicha as Pendencia } from '@/lib/queries/pendencias-item'

// Bloco de pendências de item faltante na ficha do ativo (F18 §B3). Abertas em
// destaque, com Resolver visível SEM clique; resolvidas como auditoria
// (desfecho/quem/quando) — a resolvida NÃO some da ficha, só da fila. Server
// Component (embute os diálogos client); não renderiza nada se não houver nenhuma.
//
// F21 — `podeResolver` vem da ficha (cargo × filial do ativo). Sem ele, o bloco
// continua VISÍVEL (a pendência é informação, e todo cargo lê tudo): só o botão
// "Resolver" sai, porque resolver é escrita.
//
// F28/PND-05 — `podeReabrir` (default `false`) é NÍVEL ADMINISTRADOR, não
// vínculo de filial: quem resolveu a pendência pode não ser quem tem direito de
// desfazer o desfecho de outra pessoa. Sem ele o bloco resolvido continua igual
// a antes — só o botão "Reabrir pendência" some. A guarda real mora na action
// (`exigirAdmin`); esconder o botão aqui é só a mensagem, nunca a segurança.
export function PendenciasItemFicha({
  patrimonio,
  pendencias,
  rotulosTipo,
  podeResolver,
  podeReabrir = false,
}: {
  patrimonio: string | null
  pendencias: Pendencia[]
  // F39 — o rótulo do tipo vem do catálogo `tipos_item`, por PROP. TODOS os
  // tipos (inclusive desativados): `pendencias_item.item` guarda slug histórico.
  rotulosTipo: MapaRotulosTipo
  podeResolver: boolean
  podeReabrir?: boolean
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
          // F40 — a moldura à mão virou `Card`. `ring-0 border` mantém o traço
          // âmbar exato de hoje (8,77:1 no claro); A TINTA NÃO MUDA. Migrar este
          // callout para o token `--warning` é decisão própria — item AB de
          // `docs/DIVIDA-TECNICA.md`.
          <Card
            key={p.id}
            className="flex flex-row flex-wrap items-center justify-between gap-2 border border-amber-300 bg-amber-50 p-3 py-0 text-sm text-amber-900 ring-0 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <div className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <div>
                <span className="font-medium">{rotuloTipoItem(p.item, rotulosTipo)}</span>
                <span className="block text-xs text-amber-800/80 dark:text-amber-200/70">
                  {p.colaborador ? `${p.colaborador} · ` : ''}
                  devolução de {p.desde ? formatDate(p.desde) : '—'}
                </span>
              </div>
            </div>
            {podeResolver && (
              <ResolverPendenciaItemDialog
                ids={[p.id]}
                resumo={`${rotuloTipoItem(p.item, rotulosTipo)}${patrimonio ? ' · ' + patrimonio : ''}`}
                trigger={
                  <Button variant="outline" size="sm" className="h-10 gap-1.5 sm:h-8">
                    <PackageCheck className="size-3.5" />
                    Resolver
                  </Button>
                }
              />
            )}
          </Card>
        ))}
        {resolvidas.map((p) => (
          <Card
            key={p.id}
            className="flex flex-row flex-wrap items-start justify-between gap-2 border bg-muted/30 p-3 py-0 text-sm text-muted-foreground ring-0"
          >
            <div className="flex items-start gap-2">
              <PackageX className="mt-0.5 size-4 shrink-0" />
              <div>
                <span className="font-medium text-foreground/70 line-through decoration-muted-foreground/50">
                  {rotuloTipoItem(p.item, rotulosTipo)}
                </span>{' '}
                <span>— {rotuloDesfechoPendenciaItem(p.desfecho)}</span>
                <span className="block text-xs">
                  {p.resolvidaEm ? formatDate(p.resolvidaEm) : ''}
                  {p.resolvidaPorNome ? ` · ${p.resolvidaPorNome}` : ''}
                  {p.observacao ? ` · ${p.observacao}` : ''}
                </span>
              </div>
            </div>
            {podeReabrir && (
              <ReabrirPendenciaItemDialog
                id={p.id}
                resumo={`${rotuloTipoItem(p.item, rotulosTipo)}${patrimonio ? ' · ' + patrimonio : ''}`}
              />
            )}
          </Card>
        ))}
      </CardContent>
    </Card>
  )
}
