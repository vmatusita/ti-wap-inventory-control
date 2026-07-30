import Link from 'next/link'
import { cn } from '@/lib/utils'

// Abas de segundo nível DENTRO de /admin/usuarios (F21): a lista de usuários e a trilha de
// auditoria. Server Component — a aba corrente vem do searchParam que a própria página já
// leu, então não há estado de cliente nenhum aqui.
//
// Por que searchParam e não uma rota `/admin/usuarios/auditoria`: a matriz de cobertura da
// ajuda (src/lib/ajuda/registry.test.ts) exige uma linha por rota do grupo `(app)`, e a
// auditoria é a mesma matéria de "usuários e senhas" — uma rota nova pediria uma página de
// ajuda própria só por causa de uma aba. O AdminNav também continua marcando "Usuários"
// como aba ativa sem precisar saber desta divisão.
export const ABA_AUDITORIA = 'auditoria'

export function AbasUsuarios({ aba }: { aba: 'usuarios' | 'auditoria' }) {
  const itens = [
    { chave: 'usuarios' as const, rotulo: 'Usuários', href: '/admin/usuarios' },
    {
      chave: 'auditoria' as const,
      rotulo: 'Auditoria',
      href: `/admin/usuarios?aba=${ABA_AUDITORIA}`,
    },
  ]

  return (
    <nav aria-label="Seções de usuários" className="flex gap-1 rounded-lg bg-muted/50 p-1">
      {itens.map((i) => (
        <Link
          key={i.chave}
          href={i.href}
          aria-current={aba === i.chave ? 'page' : undefined}
          className={cn(
            'flex min-h-10 items-center rounded-md px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8',
            aba === i.chave
              ? 'bg-background font-semibold text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {i.rotulo}
        </Link>
      ))}
    </nav>
  )
}
