'use client'

import { useTheme } from 'next-themes'
import { useFormStatus } from 'react-dom'
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
import { PAPEL_ROTULO } from '@/lib/auth/papeis'
import type { PapelUsuario } from '@/lib/auth/papeis'

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

// UXG-08b/F27 — `useFormStatus` só enxerga o `pending` do <form> ANCESTRAL
// quando é chamado de dentro de um componente FILHO dele (mesmo padrão de
// auth/confirm/botao-ativar.tsx); por isso o botão de sair vira um componente
// à parte em vez de inline no JSX de `UserMenu`. Sem isto era o único submit
// do app sem estado pending — clique duplo no menu disparava dois signOut.
function ItemSair() {
  const { pending } = useFormStatus()
  return (
    <DropdownMenuItem asChild>
      <button
        type="submit"
        // `disabled:` (pseudo-classe nativa) em vez do `data-disabled` do Radix:
        // aqui quem desabilita é o atributo HTML no <button> via asChild, não
        // a prop `disabled` do próprio DropdownMenuItem.
        className="w-full cursor-pointer disabled:pointer-events-none disabled:opacity-50"
        disabled={pending}
      >
        <LogOut className="size-4" />
        {pending ? 'Saindo…' : 'Sair'}
      </button>
    </DropdownMenuItem>
  )
}

// F21 — o CARGO aparece embaixo do nome. Não é enfeite: é a resposta à pergunta
// "por que eu não vejo o botão de registrar?" sem abrir chamado para a TI. Rótulo
// vindo de `PAPEL_ROTULO` (fonte única) — nunca redigitado aqui.
// F29/UXG-12 — o menu respondia metade da pergunta "por que eu não vejo o botão de
// registrar?": mostrava o cargo, mas para o OPERADOR a resposta completa depende do
// VÍNCULO de filiais, que o shell já resolve e não descia até aqui. E o e-mail da
// conta não aparecia em lugar nenhum do app — numa máquina compartilhada da TI, saber
// com qual conta se está logado é a primeira pergunta.
export function UserMenu({
  nome,
  papel,
  email,
  nomesDoEscopoEscrita,
}: {
  nome: string
  papel?: PapelUsuario
  email?: string | null
  /** Nomes das filiais em que este cargo ESCREVE. Só desce para operador — para
   *  quem escreve em todas (admin/dev) a linha seria ruído, e para consulta a
   *  ausência de escrita já está dita no rótulo do cargo. */
  nomesDoEscopoEscrita?: readonly string[]
}) {
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
            <AvatarFallback className="bg-brand-amarelo text-xs font-semibold text-brand-amarelo-texto">
              {iniciais(nome)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="max-w-full text-sm font-medium">
          <span className="block truncate">{nome}</span>
          {email && (
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {email}
            </span>
          )}
          {papel && (
            <span className="block text-xs font-normal text-muted-foreground">
              {PAPEL_ROTULO[papel]}
            </span>
          )}
          {nomesDoEscopoEscrita && nomesDoEscopoEscrita.length > 0 && (
            <span className="block text-xs font-normal text-muted-foreground">
              Escreve em: {nomesDoEscopoEscrita.join(', ')}
            </span>
          )}
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
          <ItemSair />
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
