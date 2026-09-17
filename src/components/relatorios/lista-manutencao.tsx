import { ObsTooltip } from '@/components/relatorios/obs-tooltip'
import type { ItemManutencao } from '@/lib/relatorios/tipos'

// "Em manutenção, caso a caso" — patrimônio · modelo · observação (truncada com
// tooltip do texto completo), como no e-mail (OS-F3 3.3.4).
export function ListaManutencao({ itens }: { itens: ItemManutencao[] }) {
  return (
    <ul className="divide-y">
      {itens.map((i) => (
        <li
          key={i.patrimonio + i.modelo}
          className="flex items-baseline gap-3 py-1.5 text-xs"
        >
          <span className="w-24 shrink-0 font-semibold tabular-nums">
            {i.patrimonio}
          </span>
          <span className="min-w-0 w-2/5 truncate text-foreground/70">
            {i.modelo}
          </span>
          <ObsTooltip texto={i.observacao} className="min-w-0 flex-1 text-xs" />
        </li>
      ))}
    </ul>
  )
}
