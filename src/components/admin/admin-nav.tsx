'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const ITENS = [
  { href: '/admin/usuarios', rotulo: 'Usuários' },
  { href: '/admin/senhas', rotulo: 'Senhas de acesso' },
  { href: '/admin/filiais', rotulo: 'Filiais' },
  { href: '/admin/motivos', rotulo: 'Motivos' },
]

export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b">
      {ITENS.map((i) => {
        const ativa = pathname === i.href || pathname.startsWith(`${i.href}/`)
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={ativa ? 'page' : undefined}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
              ativa
                ? 'border-[#eda100] font-semibold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {i.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
