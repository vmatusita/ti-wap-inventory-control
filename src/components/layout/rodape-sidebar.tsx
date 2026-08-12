'use client'

import Link from 'next/link'
import { Tag } from 'lucide-react'

import { CreditoAutor } from '@/components/layout/credito-autor'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// Rodape do menu lateral (F35): a versao no ar, clicavel, mais o credito de
// autoria. UM componente para os DOIS lugares em que a sidebar existe — o
// <aside> do desktop (`sidebar-lateral.tsx`) e o Sheet do hambúrguer
// (`app-header.tsx`). E o mesmo ponto do produto em duas larguras de tela, e
// nao um quarto ponto de credito: ver a ata em `docs/DECISOES.md`.
//
// ZERO CSS NOVO, de proposito. O modo recolhido da F30 vive num atributo do
// <html> lido por regras que um teste obriga a estarem ancoradas em
// `[data-sidebar-lateral]`; escrever regra nova aqui seria arriscar vazar o
// recolhido para o menu de TOQUE (o bug que `globals.css` documenta duas vezes).
// Entao este rodape so REUSA os ganchos que ja existem:
//   • `data-sidebar-item` — centraliza e tira o padding quando recolhido;
//   • `data-sidebar-rotulo` — some quando recolhido.
// `data-sidebar-selo` NAO e reusado: ele carrega o CSS de empilhamento pensado
// para a contagem de pendencias.
//
// A versao chega por PROP, do Server Component `(app)/layout.tsx`. Importar o
// registry aqui jogaria as dezenas de entradas do historico no bundle do
// cliente, em toda tela do app, para mostrar sete caracteres.
export function RodapeSidebar({
  versao,
  colapsada = false,
}: {
  versao: string
  colapsada?: boolean
}) {
  // WCAG 2.5.3 (Label in Name): o nome acessivel COMECA pelo texto visivel
  // (`v1.40.0`), senao quem comanda por voz dizendo "clicar v1.40.0" nao acerta
  // o alvo. Pego na bancada: com "Versão 1.40.0 do sistema…" a string visivel
  // nao era substring do nome acessivel.
  const link = (
    <Link
      href="/versoes"
      data-sidebar-item=""
      aria-label={`v${versao} — versões do sistema, ver o que mudou`}
      className="flex h-9 shrink-0 items-center gap-3 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Tag className="size-3.5 shrink-0" aria-hidden />
      <span data-sidebar-rotulo="" className="tabular-nums">
        v{versao}
      </span>
    </Link>
  )

  return (
    <div className="flex flex-col">
      {colapsada ? (
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          {/* Recolhida, o numero some junto com os rotulos do menu — a dica e o
              unico lugar onde ele continua alcancavel, pelo mouse E pelo foco. */}
          <TooltipContent side="right">Versões do sistema · v{versao}</TooltipContent>
        </Tooltip>
      ) : (
        link
      )}
      <div data-sidebar-rotulo="" className="px-3 pb-1">
        <CreditoAutor variante="curta" />
      </div>
    </div>
  )
}
