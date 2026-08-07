// F29/UXG-06a — os 13 `loading.tsx` não tinham `aria`/`sr-only` nenhum: quem usa
// leitor de tela não ouvia "Carregando…" em navegação nenhuma. E não havia como
// ouvir por outro caminho — a barra de progresso do topo é `aria-hidden` DE
// PROPÓSITO (ela delega o anúncio a estes arquivos, que nunca anunciaram nada).
//
// `role="status"` é a região viva EDUCADA: anuncia sem interromper a leitura em
// curso, ao contrário de `alert`. Ela precisa existir no DOM no momento em que o
// texto aparece — e é exatamente o que acontece: o `loading.tsx` inteiro é montado
// pelo Next quando a navegação começa.
//
// ⚠ O anúncio é IRMÃO do conteúdo, não pai dele. Envolver os esqueletos num nível a
// mais quebraria o `space-y-*` de cada tela (a classe governa os FILHOS DIRETOS), e
// pôr o <span> dentro da mesma caixa daria margem ao primeiro esqueleto. Como
// `sr-only` é posicionado absoluto, o irmão invisível não ocupa espaço nenhum e o
// layout fica idêntico ao de antes desta fase.
//
// Server Component: nenhum dos 13 arquivos precisa virar cliente por causa disto.
export function Carregando({
  children,
  rotulo = 'Carregando…',
  className,
}: {
  children: React.ReactNode
  /** Sobrescreva quando a tela merecer um anúncio mais específico. */
  rotulo?: string
  className?: string
}) {
  return (
    <>
      <span role="status" aria-busy="true" className="sr-only">
        {rotulo}
      </span>
      <div className={className}>{children}</div>
    </>
  )
}
