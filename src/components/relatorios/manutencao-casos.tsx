import Link from 'next/link'
import { CheckCircle2, Clock, PackageX, StickyNote } from 'lucide-react'
import { formatDate, formatDateTime, ouTraco } from '@/lib/format'
import { manutencaoEmAlerta } from '@/lib/relatorios/manutencao-alerta'
import { cn } from '@/lib/utils'
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
        <div
          key={`${c.patrimonio}-${i}`}
          className="break-inside-avoid rounded-lg border bg-card p-3"
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
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <PackageX className="size-3" />
                devolvido ao fornecedor{' '}
                {c.retornoData ? `em ${formatDate(c.retornoData)}` : ''}
              </span>
            ) : c.fechado ? (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
                <CheckCircle2 className="size-3" />
                voltou {c.retornoData ? `em ${formatDate(c.retornoData)}` : ''}
              </span>
            ) : (
              c.diasEmManutencao != null && (
                // F16/T6 — passa de âmbar (rotina) para vermelho (alerta) aos 30+
                // dias parado. Badge é público: viewer também vê. `Clock` mantido.
                <span
                  className={cn(
                    'ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
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
          <p className="mt-1 text-xs text-muted-foreground">
            {c.filial}
            {c.chamado ? ` · #${c.chamado}` : ''}
            {c.chamadoFornecedor ? ` · fornecedor ${c.chamadoFornecedor}` : ''}
            {c.dataEnvio ? ` · envio ${formatDate(c.dataEnvio)}` : ''}
          </p>

          {/* mini-linha do tempo */}
          <ul className="mt-2 space-y-1.5 border-l pl-3 text-[13px]">
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
                  <span className="text-green-600 dark:text-green-400">Retorno:</span>
                )}{' '}
                {formatDate(c.retornoData)}
                {c.retornoObs ? <span className="italic"> — “{c.retornoObs}”</span> : ''}
              </li>
            )}
            {!c.obsEnvio && c.anotacoes.length === 0 && !c.retornoData && (
              <li className="text-muted-foreground">Sem observações registradas.</li>
            )}
          </ul>
        </div>
      ))}
    </div>
  )
}
