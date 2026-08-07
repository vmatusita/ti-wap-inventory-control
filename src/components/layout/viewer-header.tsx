'use client'

import Link from 'next/link'
import { useFormStatus } from 'react-dom'
import { Eye, LogOut } from 'lucide-react'
import { sairVisualizacao } from '@/lib/actions/senhas'
import { Button } from '@/components/ui/button'
import { ViewerNav } from '@/components/layout/viewer-nav'
import { Marca } from '@/components/layout/marca'
// ⚠ NÃO importar `ROTA_RELATORIO_CONSOLIDADO` de `lib/relatorios/rota-padrao`: aquele
// módulo é `server-only` (arrasta o client do Supabase) e este componente é cliente.
// A chave do Consolidado vive em `auth/papeis.ts`, que é isomórfico — é a mesma fonte
// que a rota do servidor usa, sem a dependência de servidor.
import { ABA_RELATORIO_CONSOLIDADO } from '@/lib/auth/papeis'

// UXG-08b/F27 — precisa ser componente FILHO do <form> pro `useFormStatus`
// enxergar o `pending` dele (mesmo padrão de auth/confirm/botao-ativar.tsx).
// Era, junto com o de user-menu.tsx, o único submit sem anti-duplo-clique do
// app — arquivo virou 'use client' só por causa disto (o resto é apresentação
// pura, sem estado nenhum).
function BotaoSair() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      size="sm"
      variant="ghost"
      disabled={pending}
      className="gap-1.5 text-white hover:bg-white/10 hover:text-white"
    >
      <LogOut className="size-4" />
      {pending ? 'Saindo…' : 'Sair'}
    </Button>
  )
}

// Header do shell REDUZIDO da sessão por senha (OS-F3 3.9.4): marca + navegação
// (ao vivo / gerados) + rótulo da senha + "Sair". Sem sidebar, sem links de
// operação (ativos/movimentações/admin) — a navegação de relatório fica aqui.
export function ViewerHeader({ rotulo }: { rotulo: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-brand-dark px-4 text-white md:px-6 print:hidden">
      {/* F29/UXG-10e — a marca vira link para o início DESTE shell: o relatório
          consolidado ao vivo. Nunca `/`, que o proxy devolveria para a porta da senha
          — o visualizador não sai de /relatorios/**. */}
      <Link
        href={`/relatorios/${ABA_RELATORIO_CONSOLIDADO}`}
        aria-label="Ir para o relatório consolidado"
        className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-amarelo"
      >
        <Marca label="Estoque TI · Relatórios" labelClassName="hidden sm:inline" />
      </Link>

      <ViewerNav />

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-xs text-white/80 sm:flex">
          <Eye className="size-3.5" />
          Visualização · {rotulo}
        </span>
        <form action={sairVisualizacao}>
          <BotaoSair />
        </form>
      </div>
    </header>
  )
}
