import { cn } from '@/lib/utils'

// Credito de autoria (F35). Componente unico, sem estado, usado nos TRES pontos
// combinados na ordem — e em nenhum outro: rodape do login, pe da sidebar
// (`variante="curta"`) e rodape de `/versoes`. Nada em `/relatorios/**`:
// decisao do Johnny, registrada em `docs/DECISOES.md`.
//
// `rel="noopener noreferrer"` junto do `target="_blank"`: sem `noopener` a aba
// aberta recebe `window.opener` desta; sem `noreferrer` ela recebe o endereco
// interno de onde o clique partiu. Os dois usos antigos de link externo no
// repositorio usam so um dos dois — este e o padrao daqui para a frente.
//
// Cor: `text-muted-foreground` sobre `background` e sobre `card`, os dois pares
// ja medidos e exigidos em `scripts/contraste.mjs` (bloco F29) nos dois temas.
// NENHUM recurso externo — sem logo, sem imagem, sem fonte, sem script.
export const AUTOR = 'vmatusita'
export const SITE_AUTOR = 'https://www.vmatusita.com.br'

type CreditoAutorProps = {
  /** `longa` = "Desenvolvido por vmatusita"; `curta` = so o nome (pe da sidebar). */
  variante?: 'longa' | 'curta'
  className?: string
}

export function CreditoAutor({ variante = 'longa', className }: CreditoAutorProps) {
  const longa = variante === 'longa'
  return (
    <a
      href={SITE_AUTOR}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Desenvolvido por ${AUTOR} — abre o site em nova aba`}
      className={cn(
        'text-xs text-muted-foreground underline-offset-4 transition-colors',
        'hover:text-foreground hover:underline',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm',
        className,
      )}
    >
      {longa ? `Desenvolvido por ${AUTOR}` : AUTOR}
    </a>
  )
}
