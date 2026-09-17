import Link from 'next/link'
import { CheckCircle2, Clock, PackageX, StickyNote } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { formatDate, formatDateTime, ouTraco } from '@/lib/format'
import { manutencaoEmAlerta } from '@/lib/relatorios/manutencao-alerta'
import { cn } from '@/lib/utils'
import { CLASSE_COR_DELTA } from '@/lib/relatorios/delta-kpi'
import type { ManutencaoCaso } from '@/lib/relatorios/tipos'

// Manutenção caso a caso (§4.1): um card por ativo — patrimônio, modelo, chamado,
// badge "há N dias" (ou "voltou em dd/MM"), mini-linha do tempo: obs do envio →
// anotações (autor+data) → retorno. Inclui quem voltou de manutenção no período.
// F16/T3 — para o operador, o patrimônio vira link p/ a ficha (viewer → texto puro;
// snapshots antigos sem `ativoId` → texto puro).
export function ManutencaoCasos({
  casos,
  ehOperador,
}: {
  casos: ManutencaoCaso[]
  ehOperador?: boolean
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {casos.map((c, i) => (
        <Card
          key={`${c.patrimonio}-${i}`}
          size="sm"
          className="break-inside-avoid gap-0 p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            {ehOperador && c.ativoId ? (
              <Link
                href={`/ativos/${c.ativoId}`}
                className="font-semibold tabular-nums underline-offset-2 outline-none hover:underline focus-visible:underline"
              >
                {c.patrimonio}
              </Link>
            ) : (
              <span className="font-semibold tabular-nums">{c.patrimonio}</span>
            )}
            <span className="min-w-0 truncate text-sm text-muted-foreground">{c.modelo}</span>
            {c.desfecho === 'devolvido_fornecedor' ? (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <PackageX className="size-3" />
                devolvido ao fornecedor{' '}
                {c.retornoData ? `em ${formatDate(c.retornoData)}` : ''}
              </span>
            ) : c.fechado ? (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-sucesso px-2 py-0.5 text-xs font-medium text-sucesso-texto">
                <CheckCircle2 className="size-3" />
                voltou {c.retornoData ? `em ${formatDate(c.retornoData)}` : ''}
              </span>
            ) : (
              c.diasEmManutencao != null && (
                // F16/T6 — passa de âmbar (rotina) para vermelho (alerta) aos 30+
                // dias parado. Badge é público: viewer também vê. `Clock` mantido.
                <span
                  className={cn(
                    'ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                    manutencaoEmAlerta(c)
                      ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
                  )}
                >
                  <Clock className="size-3" />
                  há {c.diasEmManutencao.toLocaleString('pt-BR')}{' '}
                  {c.diasEmManutencao === 1 ? 'dia' : 'dias'}
                </span>
              )
            )}
          </div>
          {/* F34/Frente B — chamado interno e do fornecedor deixam de sair
              concatenados na linha miúda (onde SUMIAM quando ausentes) e ganham
              par rótulo/valor SEMPRE presente (traço quando vazio), no padrão
              formal de linha-expansivel.tsx (dl fora de tabela). Filial e data
              de envio continuam na linha miúda, sem os chamados. */}
          <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            <div className="flex items-baseline gap-1.5">
              <dt className="shrink-0 font-medium text-muted-foreground">Chamado:</dt>
              {/* Valor SEM `text-muted-foreground`: é ele que a frente B quer
                  destacar — o rótulo é que fica em cinza, como no padrão de
                  `linha-expansivel.tsx`. */}
              <dd className="min-w-0 truncate tabular-nums">
                {/* Guarda ÚNICA (achado 4, F34): a régua de "vazio" é a do
                    `ouTraco` (trim), não truthiness — um chamado só de espaços
                    existe (snapshot congelado antigo, carga de go-live via CSV
                    que roda fora do Zod) e não pode cair no ramo do '#', senão
                    renderiza "#—". O '#' fica DENTRO do valor não-vazio. */}
                {(() => {
                  const chamado = ouTraco(c.chamado)
                  return chamado === '—' ? chamado : `#${chamado}`
                })()}
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              {/* "Chamado do fornecedor" é o rótulo da casa para este campo
                  (passo 2 do envio, linha do tempo da ficha, devolução ao
                  fornecedor) — não abreviar para "Fornecedor", que num card de
                  manutenção se lê como o NOME da assistência. */}
              <dt className="shrink-0 font-medium text-muted-foreground">
                Chamado do fornecedor:
              </dt>
              {/* chamadoFornecedor é opcional (F14) — snapshot pré-F14 não tem a
                  chave; ?? null cobre undefined e ouTraco cobre string vazia. */}
              <dd className="min-w-0 truncate">{ouTraco(c.chamadoFornecedor ?? null)}</dd>
            </div>
          </dl>
          <p className="mt-1 text-xs text-muted-foreground">
            {c.filial}
            {c.dataEnvio ? ` · envio ${formatDate(c.dataEnvio)}` : ''}
          </p>

          {/* mini-linha do tempo */}
          <ul className="mt-2 space-y-1.5 border-l pl-3 text-xs">
            {c.obsEnvio && (
              <li>
                <span className="text-muted-foreground">Envio:</span>{' '}
                <span className="italic">“{c.obsEnvio}”</span>
              </li>
            )}
            {c.anotacoes.map((n, k) => (
              <li key={k} className="flex items-start gap-1.5">
                {/* F19 — âmbar com par no escuro (mesmo do ativo-combobox):
                    o 500 sumia no fundo escuro. */}
                <StickyNote className="mt-0.5 size-3 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  {n.texto}
                  <span className="ml-1 text-xs text-muted-foreground">
                    — {ouTraco(n.autor)}, {formatDateTime(n.em)}
                  </span>
                </span>
              </li>
            ))}
            {c.retornoData && (
              <li>
                {c.desfecho === 'devolvido_fornecedor' ? (
                  <span className="text-slate-600 dark:text-slate-300">
                    Devolvido ao fornecedor:
                  </span>
                ) : (
                  // REL-10 — fonte única de cor (AA): CLASSE_COR_DELTA.verde
                  // (green-700), não mais o green-600 duplicado à mão.
                  <span className={CLASSE_COR_DELTA.verde}>Retorno:</span>
                )}{' '}
                {formatDate(c.retornoData)}
                {c.retornoObs ? <span className="italic"> — “{c.retornoObs}”</span> : ''}
              </li>
            )}
            {!c.obsEnvio && c.anotacoes.length === 0 && !c.retornoData && (
              <li className="text-muted-foreground">Sem observações registradas.</li>
            )}
          </ul>
        </Card>
      ))}
    </div>
  )
}
