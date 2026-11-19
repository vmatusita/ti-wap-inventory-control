'use client'

import Link from 'next/link'
import { useFormStatus } from 'react-dom'
import { Eye, LogOut } from 'lucide-react'
import { sairDaPorta } from '@/lib/actions/porta'
import { Button } from '@/components/ui/button'
import { ViewerNav } from '@/components/layout/viewer-nav'
import { Marca } from '@/components/layout/marca'
import { identidadeDoSistema } from '@/lib/identidade/sistema'
import { caminhoDaPorta } from '@/lib/auth/porta-rotas'

// UXG-08b/F27 — precisa ser componente FILHO do <form> pro `useFormStatus`
// enxergar o `pending` dele (mesmo padrão de auth/confirm/botao-ativar.tsx).
function BotaoSair() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      size="sm"
      variant="ghost"
      disabled={pending}
      className="gap-1.5 text-brand-dark-texto hover:bg-brand-dark-texto/10 hover:text-brand-dark-texto"
    >
      <LogOut className="size-4" />
      {pending ? 'Saindo…' : 'Sair'}
    </Button>
  )
}

// O cabeçalho da PORTA PÚBLICA (OS-F3 3.9.4; F68): a marca, a navegação (ao vivo / gerados), o nome da empresa, o
// rótulo da senha e "Sair". Sem sidebar, sem nenhum link de operação — o gestor não sai de `/r/<slug>/relatorios/**`.
//
// F68 (19/11/2026): era o shell reduzido do grupo `(app)`; agora é o da porta da EMPRESA (`(sessao)/layout.tsx` da árvore
// `src/app/r/**`). Os destinos saem só de `caminhoDaPorta` (a mesma empresa, sempre). O "Sair" encerra a sessão NO
// BANCO (`sairDaPorta` → `relatorio_publico_dados`, pedido `encerrar`) e apaga o cookie.
export function ViewerHeader({ rotulo, slug, empresaNome }: { rotulo: string; slug: string; empresaNome: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-brand-dark px-4 text-brand-dark-texto md:px-6 print:hidden">
      {/* A marca leva ao arquivo de gerados DESTA empresa — nunca a `/`, que não é da porta. */}
      <Link
        href={caminhoDaPorta(slug, 'gerados')}
        aria-label="Ir para os relatórios gerados"
        className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-amarelo"
      >
        <Marca label={`${identidadeDoSistema().nome} · Relatórios`} labelClassName="hidden sm:inline" />
      </Link>

      <ViewerNav slug={slug} />

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden items-center gap-1.5 rounded-full border border-brand-dark-texto/15 px-3 py-1 text-xs text-brand-dark-texto/80 sm:flex">
          <Eye className="size-3.5" />
          {empresaNome} · {rotulo}
        </span>
        <form action={sairDaPorta}>
          <input type="hidden" name="empresa" value={slug} />
          <BotaoSair />
        </form>
      </div>
    </header>
  )
}
