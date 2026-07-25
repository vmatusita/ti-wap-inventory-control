import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getOperador } from '@/lib/auth/acesso'
import { CATEGORIAS, PAGINAS, paginasDaCategoria } from '@/lib/ajuda/registry'
import { BlocoAjuda } from '@/components/ajuda/bloco-ajuda'

// Manual completo (F20 · M5): TODAS as paginas numa pagina so, na ordem do
// sitemap. Herda o papel que o scroll unico da F6B tinha — ler do começo ao fim,
// achar com o Ctrl+F do navegador e IMPRIMIR — sem devolver esse peso ao uso do
// dia a dia, que agora acontece por pagina.
//
// `manual` e slug RESERVADO no registry: nenhuma pagina pode reivindica-lo,
// senao esta rota estatica engoliria a rota dinamica /ajuda/[slug].
export const metadata = {
  title: 'Manual completo · Ajuda',
  description: 'Toda a documentação do operador numa página só, para leitura e impressão.',
}

export default async function ManualCompletoPage() {
  const operador = await getOperador()
  if (!operador) redirect('/login')

  return (
    <div className="max-w-3xl space-y-8">
      <div className="space-y-2">
        <Link
          href="/ajuda"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline print:hidden"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Voltar ao índice
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manual do operador</h1>
          <p className="text-sm text-muted-foreground">
            Toda a documentação numa página só — {PAGINAS.length} páginas, na ordem
            do índice. Use o Ctrl+F do navegador para achar, ou imprima.
          </p>
        </div>
      </div>

      <nav aria-label="Sumário" className="rounded-lg border bg-card p-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Sumário
        </p>
        <div className="mt-2 space-y-2">
          {CATEGORIAS.map((c) => (
            <div key={c.chave}>
              <p className="text-sm font-medium text-foreground">{c.rotulo}</p>
              <ul className="mt-0.5 space-y-0.5">
                {paginasDaCategoria(c.chave).map((p) => (
                  <li key={p.slug}>
                    <a
                      href={`#manual-${p.slug}`}
                      className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {p.titulo}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {CATEGORIAS.map((c) => (
        <section key={c.chave} className="space-y-6">
          <h2 className="border-b pb-1 text-lg font-semibold tracking-tight break-before-page">
            {c.rotulo}
          </h2>
          {paginasDaCategoria(c.chave).map((p) => (
            <article
              key={p.slug}
              id={`manual-${p.slug}`}
              className="scroll-mt-24 space-y-4 break-inside-avoid-page"
            >
              <div>
                <h3 className="text-base font-semibold tracking-tight">{p.titulo}</h3>
                <p className="text-sm text-muted-foreground">{p.resumo}</p>
              </div>
              {p.blocos.map((b, i) => (
                <BlocoAjuda key={i} bloco={b} contexto="manual" />
              ))}
            </article>
          ))}
        </section>
      ))}
    </div>
  )
}
