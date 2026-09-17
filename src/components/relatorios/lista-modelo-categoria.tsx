import { rotuloCategoria } from '@/lib/dominio'
import type { ModelosPorCategoria } from '@/lib/relatorios/tipos'

// Disponíveis por modelo (§4.1), agrupado por categoria — a "lista que abre o
// e-mail" (02 Modelo A · 01 Modelo B). Barra proporcional + número grande à
// direita (muitos rótulos longos, valores pequenos: bar list em vez de pizza).
export function ListaModeloCategoria({ grupos }: { grupos: ModelosPorCategoria[] }) {
  const maxGlobal = Math.max(
    1,
    ...grupos.flatMap((g) => g.modelos.map((m) => m.total)),
  )

  return (
    <div className="space-y-4">
      {grupos.map((g) => (
        <div key={g.categoria}>
          <div className="mb-1.5 flex items-baseline justify-between">
            <h4 className="text-xs font-semibold text-foreground/80">
              {rotuloCategoria(g.categoria)}
            </h4>
            <span className="text-xs text-muted-foreground tabular-nums">
              {g.total.toLocaleString('pt-BR')} em estoque
            </span>
          </div>
          <ul className="space-y-1">
            {g.modelos.map((m) => (
              <li key={m.modelo} className="flex items-center gap-2 text-xs">
                <span className="w-40 shrink-0 truncate sm:w-52" title={m.modelo}>
                  {m.modelo}
                </span>
                <span className="relative h-4 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted">
                  <span
                    className="absolute inset-y-0 left-0 rounded-sm bg-brand-azul"
                    style={{ width: `${Math.max(3, (m.total / maxGlobal) * 100)}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right font-semibold tabular-nums">
                  {m.total.toLocaleString('pt-BR')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
