import { ChevronDown, PackageCheck, PackageX, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardTitle } from '@/components/ui/card'
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
//
// ============================================================================
// ⚠ F44 — O BLOCO DESCEU E PASSOU A RECOLHER. PENDÊNCIA ABERTA RECOLHIDA É UM
// ALARME ESCONDIDO, E O FECHADO TEM DE CARREGAR O ALARME.
// ============================================================================
// O Johnny pediu, em 01/09/2026, que os blocos de item descessem para depois da
// linha do tempo e ficassem recolhidos. Ele escolheu isso sabendo — e um bloco de
// PENDÊNCIA ABERTA fechado é, por definição, um aviso que o operador pode não ver.
// Então o estado fechado paga por si em TRÊS coisas, e as três são deliberadas:
//
//  1. **O bloco ABRE SOZINHO quando há pendência aberta** (`open={abertas > 0}`).
//     Recolhido é o estado de quem NÃO tem alarme nenhum — a ficha que só tem
//     pendências já resolvidas abre fechada, e a que tem alarme abre mostrando.
//  2. **A contagem de ABERTAS no título** ("2 em aberto"), e não a contagem total:
//     "Itens faltantes da devolução (5)" com 5 resolvidas e 0 abertas soaria pior
//     do que o silêncio.
//  3. **Um `Badge variant="warning"` com o triângulo, no PRÓPRIO `<summary>`** —
//     a mesma gramática de alarme que o selo "repor" de `/itens` já usa, e a
//     mesma tinta (`--warning`). Fechado, o bloco continua carregando um sinal
//     âmbar no meio de uma página de cartões brancos.
//
// ⚠ POR QUE UM BADGE, E NÃO PINTAR O CARTÃO INTEIRO DE ÂMBAR. A primeira escrita
// tingia o `Card` com o par `amber-300/amber-50` que os cartões de dentro usam — e
// a catraca de cor crua (`src/lib/dominio/cores.test.ts`, `TETO_PALETA_CRUA`)
// reprovou: o arquivo saltou de 14 para 18 ocorrências de paleta escrita à mão, e
// o total do `src` passou de 473 para 483. A ordem desta fase é explícita — cor
// nova entra como TOKEN, nunca `bg-amber-50` à mão. `variant="warning"` do kit
// pinta com `--warning`, cujo par já está medido (4,92:1 no claro, 7,86:1 no
// escuro), e não gasta uma ocorrência crua sequer. Os cartões de DENTRO continuam
// com o âmbar herdado: migrá-los é o item AB de `docs/DIVIDA-TECNICA.md`, e
// repintá-los aqui seria trabalho de outra fase (regra 1 do `CLAUDE.md`).
//
// A ressalva honesta: isto reduz o risco, não o zera. Um bloco abaixo da linha do
// tempo exige rolar. O `ativo.pendencia` (campo livre) continua no TOPO da ficha e
// não se moveu — a ficha não deixou de gritar, mudou o que ela grita primeiro.
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
  const temAlarme = abertas.length > 0

  return (
    <Card>
      <details className="group" open={temAlarme}>
        <summary className="flex min-h-10 cursor-pointer list-none flex-wrap items-center gap-2 px-(--card-spacing) focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <PackageX className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <CardTitle className="min-w-0">Itens faltantes da devolução</CardTitle>
          {/* ⚠ A CONTAGEM FECHADA. Com pendência aberta é um SELO DE ATENÇÃO com o
              número de abertas — a mesma gramática do selo "repor" de `/itens`
              (âmbar + triângulo + número), para o bloco recolhido continuar
              gritando. Sem aberta, é só o número de resolvidas, em cinza: não há
              alarme a dar, e um selo âmbar ali seria mentira. */}
          {temAlarme ? (
            <Badge variant="warning" className="gap-1 shrink-0">
              <TriangleAlert className="size-3" aria-hidden />
              {abertas.length.toLocaleString('pt-BR')} em aberto
            </Badge>
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground">
              {resolvidas.length.toLocaleString('pt-BR')} resolvida
              {resolvidas.length === 1 ? '' : 's'}
            </span>
          )}
          <ChevronDown
            className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <CardContent className="space-y-2 pt-4">
          {abertas.map((p) => (
            // F40 — a moldura à mão virou `Card`. `ring-0 border` mantém o traço
            // âmbar exato de hoje (8,77:1 no claro); A TINTA NÃO MUDA.
            <Card
              key={p.id}
              className="flex flex-row flex-wrap items-center justify-between gap-2 border border-callout-atencao-borda bg-callout-atencao p-3 text-sm text-callout-atencao-texto ring-0"
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
              className="flex flex-row flex-wrap items-start justify-between gap-2 border bg-muted/30 p-3 text-sm text-muted-foreground ring-0"
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
      </details>
    </Card>
  )
}
