// Chips-âncora fixos no topo ao rolar (§4): o relatório fica longo com 3 grupos.
// Links de âncora (as seções têm scroll-mt); sticky via CSS, sem JS. Ocultos na
// impressão. `temTransferencias` acrescenta a âncora condicional.
const BASE: { href: string; rotulo: string }[] = [
  { href: '#principais', rotulo: 'Principais' },
  { href: '#acessorios', rotulo: 'Acessórios' },
  { href: '#componentes', rotulo: 'Componentes' },
  { href: '#saidas', rotulo: 'Saídas' },
  { href: '#entradas', rotulo: 'Entradas' },
]

export function ChipsAncora({
  temTransferencias,
  temMovItens,
}: {
  temTransferencias?: boolean
  temMovItens?: boolean
}) {
  const chips = [...BASE]
  if (temTransferencias) chips.push({ href: '#transferencias', rotulo: 'Transferências' })
  if (temMovItens) chips.push({ href: '#mov-itens', rotulo: 'Itens' })
  return (
    <nav className="sticky top-14 z-20 -mx-1 flex gap-1.5 overflow-x-auto rounded-lg border bg-background/95 px-1 py-1.5 backdrop-blur [scrollbar-width:none] print:hidden [&::-webkit-scrollbar]:hidden">
      {chips.map((c) => (
        <a
          key={c.href}
          href={c.href}
          className="shrink-0 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-amarelo hover:text-foreground"
        >
          {c.rotulo}
        </a>
      ))}
    </nav>
  )
}
