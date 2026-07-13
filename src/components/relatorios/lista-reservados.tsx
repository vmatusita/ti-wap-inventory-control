import { ouTraco } from '@/lib/format'
import type { ItemReservado } from '@/lib/relatorios/tipos'

// "Reservados" — patrimônio · modelo · nº do chamado (OS-F3 3.2.3), como no
// e-mail ("30 reservadas: #8461 #9176 …"). O chamado já é campo da movimentação.
export function ListaReservados({ itens }: { itens: ItemReservado[] }) {
  return (
    <ul className="divide-y">
      {itens.map((i) => (
        <li
          key={i.patrimonio + i.modelo}
          className="flex items-baseline gap-3 py-1.5 text-[13px]"
        >
          <span className="w-24 shrink-0 font-semibold tabular-nums">
            {i.patrimonio}
          </span>
          <span className="min-w-0 flex-1 truncate text-foreground/70">
            {i.modelo}
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {i.chamado ? `#${ouTraco(i.chamado)}` : '—'}
          </span>
        </li>
      ))}
    </ul>
  )
}
