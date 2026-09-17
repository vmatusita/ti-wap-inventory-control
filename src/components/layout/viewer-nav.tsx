'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, FileClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  assinarRelatorioVisitado,
  hrefDoRelatorioVisitado,
  lerHrefAoVivo,
} from '@/components/relatorios/relatorio-visitado'

// Navegação do shell REDUZIDO da sessão por senha (gestor). Sem sidebar, então
// os dois destinos de relatório ficam no header: "Ao vivo" (por filial) e
// "Gerados" (o arquivo semanal — snapshots congelados). É o caminho do gestor
// para conferir os relatórios gerados.
//
// F32/RV-17 — "Ao vivo" deixou de ser um href FIXO em /relatorios/geral: agora lê
// a última filial vista (memória em sessionStorage, gravada por
// `LembrarRelatorioVisitado` na própria rota ao vivo) para o gestor de UMA
// filial não ter de reselecionar a aba dele a cada volta do arquivo de gerados.
//
// LEITURA REATIVA (`useSyncExternalStore`, não `useEffect` + `setState`):
// sessionStorage é estado EXTERNO ao React, e ler um estado externo assim que
// monta é exatamente o caso que a doc do React resolve com
// `useSyncExternalStore` — `useEffect` chamando `setState` no corpo é uma
// renderização em cascata que o lint deste projeto BARRA
// (`react-hooks/set-state-in-effect`), e o mesmo problema já foi resolvido do
// mesmo jeito em `sidebar-colapso.tsx` (F30/UXG-13; ver o comentário lá). De
// brinde: como `LembrarRelatorioVisitado` roda no MESMO carregamento da rota
// ao vivo (`/relatorios/[filial]`) e este header não remonta entre navegações
// dentro do shell, a assinatura (`assinarRelatorioVisitado`) garante que o
// header já nasce com o href certo mesmo quando a escrita acontece DEPOIS do
// primeiro render deste componente — sem isso a única outra saída de
// hidratação (`getServerSnapshot`) exigiria uma navegação extra (mudança de
// `pathname`) para o valor aparecer.
//
// HIDRATAÇÃO: sessionStorage não existe no servidor — por isso o terceiro
// argumento (`hrefNoServidor`) devolve o MESMO fallback que o cliente usa até
// sincronizar, e não a leitura real. Ler o storage direto no corpo do
// componente (sem passar pelos três argumentos de `useSyncExternalStore`)
// produziria um href diferente entre servidor e cliente no primeiro paint, e o
// React 19 acusaria mismatch de hidratação.
//
// CONFINAMENTO: o item "Ao vivo" passa a apontar para uma variável, não mais
// para a string literal que `confinamento-viewer.test.ts` conseguia varrer — o
// varredor de lá só enxerga destino escrito à mão no JSX, e um destino vindo de
// variável é invisível a ele (mesmo caso dos KPI tiles, que recebem `links` por
// prop). A garantia real desta rota passou a ser `hrefDoRelatorioVisitado`
// (relatorio-visitado.ts): função PURA, testada com entradas hostis, que por
// construção nunca devolve nada fora de `/relatorios/` — é nela, e não neste
// arquivo, que mora a prova.
//
// ⚠ E não escreva aqui um EXEMPLO de destino no formato do JSX: o varredor não
// separa comentário de código (de propósito — ver a nota dele), então o exemplo
// vira um falso vazamento. Custou uma rodada vermelha nesta fase.
function hrefNoServidor(): string {
  return hrefDoRelatorioVisitado(undefined)
}

export function ViewerNav() {
  const pathname = usePathname()
  const hrefAoVivo = useSyncExternalStore(
    assinarRelatorioVisitado,
    lerHrefAoVivo,
    hrefNoServidor,
  )

  // Movido para dentro do componente (deixou de ser `const ITENS` de módulo):
  // o primeiro item agora depende do valor acima.
  const itens = [
    {
      rotulo: 'Ao vivo',
      href: hrefAoVivo,
      icone: BarChart3,
      ativo: (p: string) =>
        p.startsWith('/relatorios/') && !p.startsWith('/relatorios/gerados'),
    },
    {
      rotulo: 'Gerados',
      href: '/relatorios/gerados',
      icone: FileClock,
      ativo: (p: string) => p.startsWith('/relatorios/gerados'),
    },
  ]

  return (
    <nav className="flex items-center gap-1">
      {itens.map((item) => {
        const on = item.ativo(pathname)
        return (
          <Link
            // Chave por rótulo, não mais por href: o href de "Ao vivo" muda
            // depois do efeito (fallback → memorizado), e usar `item.href`
            // como key remontaria o Link nesse instante sem necessidade.
            key={item.rotulo}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex min-h-10 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-amarelo focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark',
              on
                ? 'bg-brand-dark-texto/15 text-brand-dark-texto'
                : 'text-brand-dark-texto/70 hover:bg-brand-dark-texto/10 hover:text-brand-dark-texto',
            )}
          >
            <item.icone className="size-4 shrink-0" aria-hidden />
            <span>{item.rotulo}</span>
          </Link>
        )
      })}
    </nav>
  )
}
