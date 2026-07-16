import { redirect } from 'next/navigation'
import { getOperador } from '@/lib/auth/acesso'
import { SECOES, textoDaSecao } from '@/lib/ajuda/conteudo'
import { BlocoAjuda } from '@/components/ajuda/bloco-ajuda'
import { AjudaBusca } from '@/components/ajuda/ajuda-busca'

// Manual do operador (/ajuda — B9). So operador: o viewer ja e barrado pelo proxy
// (so acessa /relatorios/**), e aqui reforcamos com getOperador() + redirect.
// Conteudo/estrutura moram em src/lib/ajuda/conteudo.ts — o glossario e derivado
// de dominio.ts, entao o manual nunca diverge do sistema.
export const metadata = { title: 'Ajuda' }

export default async function AjudaPage() {
  const operador = await getOperador()
  if (!operador) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ajuda</h1>
        <p className="text-sm text-muted-foreground">
          Manual do operador: o que cada status e cada tipo significam, e o passo a
          passo de cada ação. Uso interno da TI.
        </p>
      </div>

      <AjudaBusca>
        <nav
          aria-label="Sumário"
          className="sticky top-14 z-20 -mx-1 flex gap-1.5 overflow-x-auto rounded-lg border bg-background/95 px-2 py-2 backdrop-blur [scrollbar-width:none] print:hidden [&::-webkit-scrollbar]:hidden"
        >
          {SECOES.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              data-ajuda-chip={s.id}
              className="shrink-0 whitespace-nowrap rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-amarelo hover:text-foreground"
            >
              {s.titulo}
            </a>
          ))}
        </nav>

        <div className="mt-6 space-y-10">
          {SECOES.map((s) => (
            <section
              key={s.id}
              id={s.id}
              data-ajuda-secao
              data-ajuda-texto={textoDaSecao(s)}
              className="scroll-mt-28 space-y-4"
            >
              <h2 className="text-lg font-semibold tracking-tight">{s.titulo}</h2>
              {s.blocos.map((b, i) => (
                <BlocoAjuda key={i} bloco={b} />
              ))}
            </section>
          ))}

          <p
            data-ajuda-vazio
            hidden
            className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
          >
            Nenhum resultado para a busca.
          </p>
        </div>
      </AjudaBusca>
    </div>
  )
}
