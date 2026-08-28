'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NavRolavel } from '@/components/layout/nav-rolavel'

const ITENS = [
  { href: '/admin/usuarios', rotulo: 'Usuários' },
  { href: '/admin/senhas', rotulo: 'Senhas de acesso' },
  { href: '/admin/filiais', rotulo: 'Filiais' },
  // F37 — Colaboradores fica ao lado de Filiais porque as duas respondem "quem/onde",
  // e não "o que se escolhe no formulário": é cadastro de mundo real, não vocabulário.
  { href: '/admin/colaboradores', rotulo: 'Colaboradores' },
  { href: '/admin/motivos', rotulo: 'Motivos' },
  // Vocabulários do fluxo ficam juntos: Motivos (o que se escolhe no passo 2),
  // Kits (o preset do passo 2 inteiro — F12/M12) e Itens (catálogo por quantidade).
  { href: '/admin/kits', rotulo: 'Kits' },
  { href: '/admin/itens', rotulo: 'Itens' },
  // Tipos de item vem logo depois de Itens: um classifica o outro.
  { href: '/admin/tipos-item', rotulo: 'Tipos de item' },
  { href: '/admin/importar', rotulo: 'Importar' },
]

export function AdminNav() {
  const pathname = usePathname()
  return (
    <NavRolavel
      className="-mx-4 -mb-px md:mx-0"
      navClassName="flex gap-1 overflow-x-auto border-b px-4 [scrollbar-width:none] md:px-0 [&::-webkit-scrollbar]:hidden"
      rotulo="Seções da administração"
    >
      {ITENS.map((i) => {
        const ativa = pathname === i.href || pathname.startsWith(`${i.href}/`)
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={ativa ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              ativa
                ? 'border-brand-amarelo font-semibold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {i.rotulo}
          </Link>
        )
      })}
    </NavRolavel>
  )
}
