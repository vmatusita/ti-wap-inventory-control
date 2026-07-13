import type { ItemModelo } from '@/lib/relatorios/tipos'

// "Disponíveis por modelo" — formato "NN× · modelo" do e-mail semanal (OS-F3 3.3.3).
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function ListaModelo({ itens }: { itens: ItemModelo[] }) {
  return (
    <ul className="divide-y">
      {itens.map((i) => (
        <li
          key={i.modelo}
          className="flex items-baseline gap-3 py-1.5 text-[13px]"
        >
          <span className="w-8 shrink-0 font-bold tabular-nums">
            {pad2(i.total)}×
          </span>
          <span className="min-w-0 truncate text-foreground/80">{i.modelo}</span>
        </li>
      ))}
    </ul>
  )
}
