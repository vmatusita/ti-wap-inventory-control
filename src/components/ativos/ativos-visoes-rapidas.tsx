import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { StatusAtivo } from '@/lib/dominio'

// ATV-12 — chips-link de visões prontas acima da tabela (molde visual de
// `components/relatorios/pendencias-chips.tsx`; paleta neutra em vez de âmbar
// porque estas não são pendências, são atalhos de navegação). Server Component
// puro: cada chip é um `<Link>` de verdade, sem `use client` nem hook de
// navegação — a detecção de qual chip está ATIVO usa só os valores que a
// PAGE já leu e resolveu de `searchParams` (nunca lê a URL aqui de novo).
//
// Cada chip monta o href DO ZERO (mesmo padrão de `PendenciasChips` e de
// `AtivosFiltros.limpar()`): clicar numa visão TROCA de contexto, nunca
// acumula em cima do filtro que já estava na tela.
//
// DECISÃO (F28/ATV-12) — nenhum chip carrega `filial` no href, de propósito:
// o recorte de filial não é uma "visão" para alternar, é o RECORTE DE ACESSO
// do cargo (F25 · `selecaoDeUnidades`, F57). Colar a filial atual no link faria um
// operador nunca alcançar, por exemplo, "Em manutenção" olhando só a filial
// dele quando quisesse comparar — e omitir o param é exatamente o que devolve
// o padrão do cargo (mesma leitura de `semFiltros()` em `ativos/page.tsx`).
const VISOES = [
  {
    chave: 'em_manutencao',
    rotulo: 'Em manutenção',
    href: '/ativos?status=em_manutencao',
  },
  {
    chave: 'em_estoque',
    rotulo: 'Em estoque',
    href: '/ativos?status=em_estoque',
  },
  {
    chave: 'sem_patrimonio',
    rotulo: 'Sem patrimônio',
    href: '/ativos?semPatrimonio=1',
  },
  {
    chave: 'com_pendencia',
    rotulo: 'Com pendência',
    href: '/ativos?comPendencia=1',
  },
] as const

export function AtivosVisoesRapidas({
  status,
  semPatrimonio,
  comPendencia,
}: {
  status: StatusAtivo[]
  semPatrimonio: boolean
  comPendencia: boolean
}) {
  // Um chip de status só conta como ATIVO quando é o ÚNICO status marcado: a
  // marcação multi-select do popover "Status" (ex. em_estoque + em_uso juntos)
  // não é a mesma visão que o atalho de uma visão só, mesmo que um dos
  // marcados seja o mesmo valor.
  const statusUnico = status.length === 1 ? status[0] : null
  const ativoPorChave: Record<(typeof VISOES)[number]['chave'], boolean> = {
    em_manutencao: statusUnico === 'em_manutencao',
    em_estoque: statusUnico === 'em_estoque',
    sem_patrimonio: semPatrimonio,
    com_pendencia: comPendencia,
  }

  return (
    <nav
      aria-label="Visões rápidas de ativos"
      className="flex flex-wrap items-center gap-1.5"
    >
      {VISOES.map((v) => {
        const estaAtiva = ativoPorChave[v.chave]
        return (
          <Link
            key={v.chave}
            href={v.href}
            aria-current={estaAtiva ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              estaAtiva
                ? 'border-transparent bg-foreground text-background'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {v.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
