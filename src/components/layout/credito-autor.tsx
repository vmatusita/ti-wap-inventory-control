import { identidadeDoSistema } from '@/lib/identidade/sistema'
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
//
// F61 — O CRÉDITO SAIU DE UMA CONSTANTE PRIVADA para a fonte única da identidade
// (`src/lib/identidade/sistema.ts`), e ficou DESLIGÁVEL: com `credito: null` lá,
// este componente não renderiza NADA — e cada um dos três pontos (login, pé da
// sidebar, `/versoes`) confere o mesmo `credito` antes de desenhar a moldura, o
// separador ou a linha dele, para não sobrar órfão. O padrão continua LIGADO,
// igual a hoje: o que exibir para outros clientes é decisão do Johnny
// (PLANO-MULTIEMPRESA §10, item 3), e a F70 liga a fonte à configuração da empresa.
// Continua valendo: o crédito vive nos três pontos e sempre por este componente —
// ninguém monta o link à mão, fora do `rel` e da cor já medida.

type CreditoAutorProps = {
  /** `longa` = "Desenvolvido por <autor>"; `curta` = so o nome (pe da sidebar). */
  variante?: 'longa' | 'curta'
  className?: string
}

export function CreditoAutor({ variante = 'longa', className }: CreditoAutorProps) {
  const { credito } = identidadeDoSistema()
  if (!credito) return null
  const longa = variante === 'longa'
  return (
    <a
      href={credito.site}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Desenvolvido por ${credito.autor} — abre o site em nova aba`}
      className={cn(
        'text-xs text-muted-foreground underline-offset-4 transition-colors',
        'hover:text-foreground hover:underline',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm',
        className,
      )}
    >
      {longa ? `Desenvolvido por ${credito.autor}` : credito.autor}
    </a>
  )
}
