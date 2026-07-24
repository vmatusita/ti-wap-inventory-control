// Chips-âncora fixos no topo ao rolar (§4): o relatório fica longo com 3 grupos.
// Links de âncora (as seções têm scroll-mt); sticky via CSS, sem JS. Ocultos na
// impressão. `temTransferencias` acrescenta a âncora condicional.
//
// `min-h-10 sm:min-h-0` no chip: no celular ele é alvo de toque e tinha 26px;
// do `sm` para cima volta ao tamanho de hoje (F13/B4-R3). A pilha sticky
// (header 56px + esta nav) passa a 110px no celular — por isso as seções-alvo
// usam `scroll-mt-28` (112px) em vez de `scroll-mt-16`: com 64px o h2 da âncora
// parava ATRÁS desta barra (defeito já existente em todas as larguras, medido
// em scratchpad/f13/c4-chips-antes.txt).
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
  // F17/B4 — âncora do glossário "Como ler este relatório" (sempre presente no corpo
  // v2, único que renderiza estes chips). Fragmento na MESMA página → seguro para o
  // visualizador por senha (nenhum href para fora de /relatorios).
  chips.push({ href: '#como-ler', rotulo: 'Como ler' })
  return (
    <nav className="sticky top-14 z-20 -mx-1 flex gap-1.5 overflow-x-auto rounded-lg border bg-background/95 px-1 py-1.5 backdrop-blur [scrollbar-width:none] print:hidden [&::-webkit-scrollbar]:hidden">
      {chips.map((c) => (
        <a
          key={c.href}
          href={c.href}
          className="flex min-h-10 shrink-0 items-center rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-amarelo hover:text-foreground sm:min-h-0"
        >
          {c.rotulo}
        </a>
      ))}
    </nav>
  )
}
