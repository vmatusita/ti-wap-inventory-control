'use client'

import { useState } from 'react'
import { MoreHorizontal, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CorrigirPatrimonioDialog } from '@/components/ativos/corrigir-patrimonio-dialog'
import { DefinirServiceTagDialog } from '@/components/ativos/definir-service-tag-dialog'

type Excecao = 'patrimonio' | 'service-tag'

// F19 (P2-12b) — tira da barra da ficha as duas ações de EXCEÇÃO (corrigir/definir
// patrimônio e definir service tag), que competiam visualmente com o CTA "Nova
// movimentação". A página é Server Component: este client component segura o estado
// "qual diálogo está aberto" e recebe tudo já serializado.
//
// Os diálogos são IRMÃOS do menu, nunca filhos do DropdownMenuContent: o Radix
// desmonta o conteúdo do menu ao fechar e levaria o diálogo junto.
export function AcoesExcecaoFicha({
  ativoId,
  patrimonio,
  serviceTag,
}: {
  ativoId: string
  patrimonio: string | null
  serviceTag: string | null
}) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [excecao, setExcecao] = useState<Excecao | null>(null)

  // Mesmo rótulo dinâmico do diálogo: ativo importado sem plaqueta (F7E) não tem o
  // que "corrigir" — ele DEFINE o patrimônio.
  const rotuloPatrimonio =
    patrimonio === null ? 'Definir patrimônio' : 'Corrigir patrimônio'

  // `preventDefault` impede o fechamento automático do Radix e o devolve para o
  // nosso setState: menu e diálogo mudam no MESMO commit, então o menu solta o foco
  // antes de o diálogo capturá-lo. Sem isso vem o clássico diálogo sem foco / que
  // fecha sozinho / `<body>` preso em `pointer-events: none`.
  function abrir(qual: Excecao) {
    return (e: Event) => {
      e.preventDefault()
      setMenuAberto(false)
      setExcecao(qual)
    }
  }

  return (
    <>
      <DropdownMenu open={menuAberto} onOpenChange={setMenuAberto}>
        <DropdownMenuTrigger asChild>
          {/* Mesmo alvo de toque dos irmãos da barra: 40px no celular, 32px no
              desktop. */}
          <Button
            variant="outline"
            size="icon"
            aria-label="Mais ações"
            className="size-10 sm:size-8"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={abrir('patrimonio')}>
            <Tag className="size-4" />
            {rotuloPatrimonio}
          </DropdownMenuItem>
          {/* F15/C1 — só quando a service tag está vazia (ativo importado sem tag).
              Preenchida, a tag é imutável e a action recusa redefinir. */}
          {!serviceTag && (
            <DropdownMenuItem onSelect={abrir('service-tag')}>
              <Tag className="size-4" />
              Definir service tag
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CorrigirPatrimonioDialog
        ativoId={ativoId}
        patrimonioAtual={patrimonio}
        serviceTag={serviceTag}
        open={excecao === 'patrimonio'}
        onOpenChange={(o) => setExcecao(o ? 'patrimonio' : null)}
      />
      {!serviceTag && (
        <DefinirServiceTagDialog
          ativoId={ativoId}
          patrimonio={patrimonio}
          open={excecao === 'service-tag'}
          onOpenChange={(o) => setExcecao(o ? 'service-tag' : null)}
        />
      )}
    </>
  )
}
