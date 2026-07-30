'use client'

import { useState } from 'react'
import { LogOut, Mail, MoreHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AlterarEmailDialog } from '@/components/admin/usuarios/alterar-email-dialog'
import { ApagarUsuarioDialog } from '@/components/admin/usuarios/apagar-usuario-dialog'
import { EncerrarSessoesDialog } from '@/components/admin/usuarios/encerrar-sessoes-dialog'

type AcaoDev = 'email' | 'sessoes' | 'apagar'

// F22 — as três ações da GESTÃO AVANÇADA de uma conta, reunidas num menu "⋯" por linha:
// trocar o e-mail de login, encerrar as sessões abertas e apagar a conta. A lista de
// usuários só renderiza este componente quando quem está logado tem o cargo Desenvolvedor;
// as actions repetem a checagem no servidor (`exigirDev`) e as RPCs da 0074 repetem no banco.
//
// Por que um menu e não três botões: a linha já carrega "Editar" e "Desativar", e três
// gatilhos a mais empurrariam as ações do dia a dia para fora da tela no notebook. As ações
// raras ficam a um clique de distância, as comuns continuam diretas.
//
// Os diálogos são IRMÃOS do menu, nunca filhos do `DropdownMenuContent`: o Radix desmonta o
// conteúdo do menu ao fechar e levaria o diálogo junto (mesma armadilha documentada em
// `ativos/acoes-excecao-ficha.tsx`).
export function AcoesDev({
  usuarioId,
  nome,
  email,
  eVoceMesmo,
}: {
  usuarioId: string
  nome: string
  email: string | null
  /** A própria conta de quem está logado: apagar a si mesmo é recusado pelo servidor. */
  eVoceMesmo: boolean
}) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [acao, setAcao] = useState<AcaoDev | null>(null)

  // `preventDefault` impede o fechamento automático do Radix e o devolve para o nosso
  // setState: menu e diálogo mudam no MESMO commit, então o menu solta o foco antes de o
  // diálogo capturá-lo. Sem isso vem o clássico diálogo sem foco / que fecha sozinho /
  // `<body>` preso em `pointer-events: none`.
  function abrir(qual: AcaoDev) {
    return (e: Event) => {
      e.preventDefault()
      setMenuAberto(false)
      setAcao(qual)
    }
  }

  return (
    <>
      <DropdownMenu open={menuAberto} onOpenChange={setMenuAberto}>
        <DropdownMenuTrigger asChild>
          {/* Mesma altura dos irmãos da linha ("Editar"/"Desativar" são `size="sm"`, h-7),
              com o alvo de toque de 40px no celular. */}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={`Mais ações de ${nome}`}
            className="size-10 sm:size-7"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Gestão avançada</DropdownMenuLabel>
          <DropdownMenuItem onSelect={abrir('email')}>
            <Mail className="size-4" />
            Alterar e-mail de login…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={abrir('sessoes')}>
            <LogOut className="size-4" />
            Encerrar sessões abertas…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={eVoceMesmo}
            onSelect={abrir('apagar')}
          >
            <Trash2 className="size-4" />
            Apagar conta…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlterarEmailDialog
        usuarioId={usuarioId}
        nome={nome}
        emailAtual={email}
        open={acao === 'email'}
        onOpenChange={(o) => setAcao(o ? 'email' : null)}
      />
      <EncerrarSessoesDialog
        usuarioId={usuarioId}
        nome={nome}
        eVoceMesmo={eVoceMesmo}
        open={acao === 'sessoes'}
        onOpenChange={(o) => setAcao(o ? 'sessoes' : null)}
      />
      <ApagarUsuarioDialog
        usuarioId={usuarioId}
        nome={nome}
        email={email}
        open={acao === 'apagar'}
        onOpenChange={(o) => setAcao(o ? 'apagar' : null)}
      />
    </>
  )
}
