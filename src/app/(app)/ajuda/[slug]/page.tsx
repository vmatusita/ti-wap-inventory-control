import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react'
import { getOperador } from '@/lib/auth/acesso'
import {
  CATEGORIAS,
  ancorasDaPagina,
  paginaPorSlug,
  vizinhas,
} from '@/lib/ajuda/registry'
import { BlocoAjuda } from '@/components/ajuda/bloco-ajuda'
import { AncoraAoMontar } from '@/components/ajuda/ancora-ao-montar'

// Uma pagina da documentacao (F20). Server Component, como o resto da ajuda —
// os badges do glossario sao os componentes REAIS do sistema.
//
// SEM `generateStaticParams`: a pagina chama `getOperador()` -> `cookies()`, o
// que a torna dinamica (o build confirma: `ƒ /ajuda/[slug]`). A lista de slugs
// que existia aqui nao pre-renderizava nada e ainda sugeria o contrario a quem
// fosse decidir cache (achado da revisao dos 8 commits da F20).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const pagina = paginaPorSlug(slug)
  if (!pagina) return { title: 'Ajuda' }
  return { title: `${pagina.titulo} · Ajuda`, description: pagina.resumo }
}

export default async function PaginaAjudaRoute({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const operador = await getOperador()
  if (!operador) redirect('/login')

  const { slug } = await params
  const pagina = paginaPorSlug(slug)
  if (!pagina) notFound()

  const categoria = CATEGORIAS.find((c) => c.chave === pagina.categoria)
  const ancoras = ancorasDaPagina(pagina)
  const { anterior, proxima } = vizinhas(slug)

  return (
    <div className="max-w-3xl space-y-6">
      <nav aria-label="Trilha" className="print:hidden">
        <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <li>
            <Link href="/ajuda" className="underline-offset-4 hover:text-foreground hover:underline">
              Ajuda
            </Link>
          </li>
          {categoria && (
            // O separador vai DENTRO do <li>: `<ol>` só admite `<li>` como
            // filho, e um <svg> solto ali deixava a lista com um filho que não
            // é `listitem` na árvore de acessibilidade (achado da revisão dos 8
            // commits da F20).
            <li className="flex items-center gap-1">
              <ChevronRight className="size-3" aria-hidden />
              <Link
                href={`/ajuda#${categoria.chave}`}
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                {categoria.rotulo}
              </Link>
            </li>
          )}
        </ol>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{pagina.titulo}</h1>
        <p className="text-sm text-muted-foreground">{pagina.resumo}</p>
      </div>

      {/* Sumário só quando há mais de um trecho — com um subtítulo só, ele seria
          ruído em cima de uma página curta. */}
      {ancoras.length > 1 && (
        <nav aria-label="Nesta página" className="rounded-lg border bg-card p-3 print:hidden">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Nesta página
          </p>
          <ul className="mt-1.5 space-y-1">
            {ancoras.map((a) => (
              <li key={a.id}>
                <a
                  href={`#${a.id}`}
                  className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {a.texto}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="space-y-4">
        {pagina.blocos.map((b, i) => (
          <BlocoAjuda key={i} bloco={b} />
        ))}
      </div>

      {(anterior || proxima) && (
        <nav
          aria-label="Outras páginas desta categoria"
          className="flex flex-wrap gap-2 border-t pt-4 print:hidden"
        >
          {anterior && (
            <Link
              href={`/ajuda/${anterior.slug}`}
              className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:border-brand-amarelo"
            >
              <ArrowLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">Anterior</span>
                <span className="block truncate font-medium">{anterior.titulo}</span>
              </span>
            </Link>
          )}
          {proxima && (
            <Link
              href={`/ajuda/${proxima.slug}`}
              className="inline-flex min-w-0 flex-1 items-center justify-end gap-2 rounded-lg border p-3 text-right text-sm transition-colors hover:border-brand-amarelo"
            >
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">Próxima</span>
                <span className="block truncate font-medium">{proxima.titulo}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          )}
        </nav>
      )}

      {/* B3 (F13): numa navegação client-side com hash para OUTRA rota, o App
          Router rola enquanto o loading.tsx ainda está na tela e desiste. Este
          componente monta junto dos blocos — aqui a âncora já existe. */}
      <AncoraAoMontar ids={ancoras.map((a) => a.id)} />
    </div>
  )
}
