import Link from 'next/link'
import { ArrowRight, Copy, StickyNote } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ativos/status-badge'
import { EstornarDialog } from '@/components/ativos/estornar-dialog'
import { cn } from '@/lib/utils'
import { formatDate, formatDateTime, ouTraco } from '@/lib/format'
import { pillTipo, rotuloTipo } from '@/lib/dominio'
import { rotuloTipoItem, type MapaRotulosTipo } from '@/lib/itens/rotulo-tipo'
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
      {/* F40 — `text-[11px]` caiu para `text-xs` (12px). A hierarquia do produto
          tem QUATRO degraus (24 / 16 / 14 / 12) e nenhum deles é 11: os 49 tamanhos
          arbitrários do inventário eram todos assim, escolhidos um a um. */}
      {de && <StatusBadge status={de} className="text-xs" />}
      <ArrowRight className="size-3 text-muted-foreground" />
      <StatusBadge status={para} className="text-xs" />
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
  rotulosTipo,
  // F14/MN4 — reuso somente-leitura (seção "Histórico do ativo substituído" na
  // ficha do substituto): esconde as ações (Estornar/Duplicar), que agiriam sobre
  // o ativo ANTIGO. Na ficha própria do ativo segue `false` (ações visíveis).
  somenteLeitura = false,
}: {
  movimentacoes: MovimentacaoTimeline[]
  anotacoes?: AnotacaoTimeline[]
  motivos: Record<string, string>
  // F39 — o vocabulário dos itens faltantes vem do catálogo `tipos_item`, por
  // PROP: quem lê o banco é a página (Server Component). O mapa carrega TODOS os
  // tipos, inclusive os desativados — a linha do tempo exibe passado.
  rotulosTipo: MapaRotulosTipo
  somenteLeitura?: boolean
}) {
  const eventos: Evento[] = [
    ...movimentacoes.map((m) => ({ at: m.created_at, kind: 'mov' as const, mov: m })),
    ...anotacoes.map((a) => ({ at: a.created_at, kind: 'nota' as const, nota: a })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

  if (eventos.length === 0) {
    // F40 — só o `py-10` mudou (passo fora da escala) para `py-12`.
    //
    // ⚠ ESTE VAZIO **NÃO** VIROU `<EstadoVazio>`, e a ausência é a decisão: o
    // componente pinta o título em `text-foreground font-medium` e acrescenta um
    // ícone, enquanto isto aqui é `text-sm text-muted-foreground`. Adotá-lo
    // REPINTA a tela, e a ordem da F40 proíbe. A adoção é de uma linha e cabe na
    // frente que decidir a repintura — a borda tracejada é a única moldura à mão
    // legítima do produto, e a regra 6 de `consistencia.test.ts` abre exceção
    // nominal para ela justamente por isso.
    return (
      <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
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
              {/* F40 — a moldura vem do `Card`. `ring-0 border` mantém o traço
                  âmbar exato de hoje (o anel do Card é neutro); a tinta NÃO muda.
                  Só o raio vai de 8px para 12px. */}
              <Card className="block overflow-visible border border-amber-200 bg-amber-50/60 p-3 ring-0 dark:border-amber-900/60 dark:bg-amber-950/20">
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
              </Card>
            </li>
          )
        }

        const m = ev.mov
        const estornada = estornoDe.has(m.id)
        // ⚠ F23 — CORREÇÃO TÉCNICA NÃO SE ESTORNA PELA FICHA. Ela é uma movimentação de
        // `ajuste` marcada `forcado`, criada pela Zona destrutiva da /dev para acertar um
        // estado que a máquina não alcançaria. Deixar o botão "Estornar" em cima dela poria
        // um OPERADOR desfazendo a correção do desenvolvedor — e o estorno restauraria o
        // `snapshot_anterior`, isto é, exatamente o estado errado que a correção veio consertar.
        // Quem desfaz uma correção-dev é outra correção-dev, com justificativa e trilha.
        const podeEstornar = m.id === topoMovId && m.tipo !== 'estorno' && !m.forcado
        const motivoRotulo = m.motivo ? (motivos[m.motivo] ?? m.motivo) : null

        // F19 — quem chega por `#mov-<id>` (link "estornada", QR, e-mail) rolava
        // até aqui sem saber qual linha era a sua. O `id` está no <li>, mas o
        // cartão visível é o <div> filho: por isso a variante `target:` parte do
        // <li> e mira o filho.
        //
        // O anel usa o TOKEN `--warning` (o tier âmbar da F7F), não uma cor fixa:
        // `ring-amber-400` media 1,72:1 sobre o card claro — invisível justamente
        // no tema padrão do app, e abaixo até dos 3:1 de elemento gráfico. O token
        // dá 5,65:1 no claro e 9,47:1 no escuro e, por ser semântico, CLAREIA
        // sozinho no `.dark` — dispensa variante `dark:` para acompanhar o tema.
        return (
          <li
            key={m.id}
            id={`mov-${m.id}`}
            className="relative scroll-mt-20 pl-6 target:[&>div]:ring-2 target:[&>div]:ring-warning"
          >
            {trilho('bg-primary')}

            {/* F40 — idem: `Card` com `ring-0 border`, para o traço continuar o
                mesmo `border-border` de hoje em vez do anel do kit. */}
            <Card className={cn('block overflow-visible border p-3 ring-0', estornada ? 'bg-muted/30' : 'bg-card')}>
              <div className="flex flex-wrap items-center gap-2">
                {/* ATV-08 — mesma paleta por tipo já aprovada em contraste e usada
                    na lista de movimentações, no dashboard e no relatório
                    (`pillTipo`, `lib/dominio.ts`); a ficha era a única tela que
                    ainda usava o `Badge variant="secondary"` neutro. */}
                <span
                  className={cn(
                    'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold',
                    pillTipo(m.tipo),
                  )}
                >
                  {rotuloTipo(m.tipo)}
                </span>
                {/* F23 §4.1 — a marca de "forçado" VISÍVEL NA FICHA. Sem ela, uma correção
                    técnica do desenvolvedor apareceria na linha do tempo como um ajuste
                    comum, e quem lesse o histórico meses depois não teria como saber que
                    aquele estado foi posto à mão em vez de derivar de uma operação real. A
                    justificativa vem logo abaixo, no campo de observação da própria linha. */}
                {m.forcado && (
                  <Badge
                    variant="outline"
                    className="border-destructive/50 text-destructive"
                    title="Correção técnica registrada pelo Desenvolvedor: este estado foi forçado, ignorando as transições normais. O motivo está na observação."
                  >
                    forçada
                  </Badge>
                )}
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
                      <Button asChild variant="ghost" size="sm" className="h-10 gap-1.5 text-xs sm:h-7">
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
                        className="border-amber-300 bg-amber-50 text-xs font-normal text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      >
                        {rotuloTipoItem(it, rotulosTipo)}
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
            </Card>
          </li>
        )
      })}
    </ol>
  )
}
