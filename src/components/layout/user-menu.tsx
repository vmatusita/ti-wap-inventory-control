'use client'

import { useTheme } from 'next-themes'
import { LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { signOut } from '@/lib/actions/auth'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const primeira = partes[0]?.[0] ?? ''
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : ''
  return (primeira + ultima).toUpperCase()
}

// Opções do tema (F19). Os VALORES são os do next-themes ('light'/'dark'/'system')
// — não traduzir, é a chave que vai para o localStorage; só o rótulo é pt-BR.
const TEMAS = [
  { valor: 'light', rotulo: 'Claro', icone: Sun },
  { valor: 'dark', rotulo: 'Escuro', icone: Moon },
  { valor: 'system', rotulo: 'Sistema', icone: Monitor },
] as const

export function UserMenu({ nome }: { nome: string }) {
  // Sem guarda de `montado`: o conteúdo do DropdownMenu do Radix só é montado
  // quando o menu ABRE — o servidor nunca o renderiza, então não há hidratação
  // para divergir. Quando o operador clica, o next-themes já leu o localStorage e
  // `theme` está correto. O `?? 'light'` só cobre o instante anterior a isso e
  // espelha o `defaultTheme` do provider.
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Abrir menu do usuário"
          className="rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-brand-amarelo"
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-brand-amarelo text-xs font-semibold text-black">
              {iniciais(nome)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="max-w-full truncate text-sm font-medium">
          {nome}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Tema (F19). O padrão do app é CLARO; escuro é opt-in e fica gravado no
            navegador de quem escolheu. "Sistema" acompanha o Windows/macOS.
            O item marcado leva um ✓ (indicador do próprio DropdownMenuRadioItem)
            além do destaque — o estado nunca depende só de cor. */}
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Tema
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          aria-label="Tema da interface"
          value={theme ?? 'light'}
          onValueChange={setTheme}
        >
          {TEMAS.map(({ valor, rotulo, icone: Icone }) => (
            <DropdownMenuRadioItem key={valor} value={valor} className="cursor-pointer">
              <Icone className="size-4" aria-hidden />
              {rotulo}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full cursor-pointer">
              <LogOut className="size-4" />
              Sair
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
