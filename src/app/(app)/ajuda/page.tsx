import Link from 'next/link'
import { Printer } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getOperador } from '@/lib/auth/acesso'
import { CATEGORIAS, PAGINAS, paginasDaCategoria } from '@/lib/ajuda/registry'
import { INDICE_PALETA } from '@/lib/ajuda/indice'
import { AjudaBusca } from '@/components/ajuda/ajuda-busca'
import { AncoraAoMontar } from '@/components/ajuda/ancora-ao-montar'
import { RedirecionaAncoraLegada } from '@/components/ajuda/redireciona-ancora-legada'

// Indice da documentacao do operador (F20). So operador: o visualizador por
// senha ja e barrado pelo proxy (so acessa /relatorios/**), e aqui reforcamos
// com getOperador() + redirect — mesma dupla trava da F6B.
export const metadata = {
  title: 'Ajuda',
  description: 'Documentação do operador do Estoque TI WAP.',
}

// F60 · fato 17 — teto de execução ESCRITO, não herdado (ata da F60 em docs/DECISOES.md). Sem
// ele a rota fica com os 300 s da Vercel, e 300 s só acontece quando a conexão com o Supabase
// PENDURA (24/07/2026; o raciocínio inteiro está em relatorios/[filial]/page.tsx): 60 s troca
// cinco minutos de spinner por um erro rápido.
// Esta página não lê `lib/queries`, mas não é estática: chama `getOperador()` (Auth +
// `profiles`) e roda debaixo de `(app)/layout.tsx`, que lê o banco a cada request (filiais
// e os dois selos). O pendurado que o teto corta é o mesmo das outras rotas.
// Esta página não hospeda Server Action própria.
export const maxDuration = 60

// A CHAVE pesquisável de cada página desce no `data-ajuda-texto` do card — é
// sobre esses atributos que `AjudaBusca` filtra, no cliente. A chave é título,
// resumo, os sinônimos curados e o vocabulário derivado do domínio (rótulos de
// status, tipo, campo, tecla e as linhas de sintoma); o CORPO da documentação
// não sai do servidor. Até 25/07/2026 descia o texto inteiro — 208.525
// caracteres por request, e uma busca que devolvia 6 das 33 páginas na
// mediana. Motivos e números em docs/DECISOES.md.
//
// `INDICE_PALETA`, e não `indicePaleta()`: a constante é computada uma vez por
// instância do servidor e é o MESMO valor que a paleta Ctrl+K recebe e que
// `indice.test.ts` filtra. E o Map também mora FORA do componente, pelo mesmo
// motivo: deriva de um valor imutável entre deploys, então remontá-lo a cada
// request seria o desperdício que a constante acabou de tirar do `(app)/layout.tsx`.
const CHAVE_POR_SLUG = new Map(INDICE_PALETA.map((e) => [e.slug, e.chave]))

export default async function AjudaPage() {
  const operador = await getOperador()
  if (!operador) redirect('/login')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ajuda</h1>
          <p className="text-sm text-muted-foreground">
            A documentação de quem opera o sistema: o que cada coisa significa e o
            passo a passo de cada tarefa. Uso interno da TI.
          </p>
        </div>
        <Link
          href="/ajuda/manual"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-amarelo hover:text-foreground print:hidden"
        >
          <Printer className="size-3.5" aria-hidden />
          Manual completo (para imprimir)
        </Link>
      </div>

      <AjudaBusca>
        <nav
          aria-label="Categorias"
          className="sticky top-14 z-20 -mx-1 flex gap-1.5 overflow-x-auto rounded-lg border bg-background/95 px-2 py-2 backdrop-blur [scrollbar-width:none] print:hidden [&::-webkit-scrollbar]:hidden"
        >
          {CATEGORIAS.map((c) => (
            <a
              key={c.chave}
              href={`#${c.chave}`}
              data-ajuda-chip={c.chave}
              className="shrink-0 whitespace-nowrap rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-amarelo hover:text-foreground"
            >
              {c.rotulo}
            </a>
          ))}
        </nav>

        <div className="mt-6 space-y-10">
          {CATEGORIAS.map((c) => (
            <section
              key={c.chave}
              id={c.chave}
              data-ajuda-grupo={c.chave}
              className="scroll-mt-28 space-y-3"
            >
              <div>
                <h2 className="text-lg font-semibold tracking-tight">{c.rotulo}</h2>
                <p className="text-sm text-muted-foreground">{c.descricao}</p>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {paginasDaCategoria(c.chave).map((p) => (
                  <li
                    key={p.slug}
                    data-ajuda-item
                    data-ajuda-texto={CHAVE_POR_SLUG.get(p.slug)}
                    className="h-full"
                  >
                    <Link
                      href={`/ajuda/${p.slug}`}
                      className="flex h-full flex-col gap-1 rounded-lg border bg-card p-3 transition-colors hover:border-brand-amarelo"
                    >
                      <span className="text-sm font-medium text-foreground">{p.titulo}</span>
                      <span className="text-xs leading-relaxed text-muted-foreground">
                        {p.resumo}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <p
            data-ajuda-vazio
            hidden
            className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
          >
            Nenhum resultado. A busca do índice olha o título, o resumo e os
            termos de cada página. Para procurar uma frase dentro do texto — a
            mensagem de erro exata, por exemplo — abra o manual completo e use a
            busca do navegador (Ctrl+F).
          </p>
        </div>

        {/* Sem "em qualquer tela": o "?" existe nas telas de operação, não em
            todas (achado da revisão da F20 — a ajuda antiga prometia demais). */}
        <p className="pt-2 text-xs text-muted-foreground print:hidden">
          {PAGINAS.length} páginas. Nas telas de operação, o ícone “?” ao lado do
          título abre a página desta documentação que fala daquela tela; a tecla{' '}
          <kbd>?</kbd> traz você para cá.
        </p>
      </AjudaBusca>

      {/* Favoritos antigos (/ajuda#status, #como-fazer…) continuam funcionando:
          o hash não chega ao servidor, então o redirecionamento é no cliente. */}
      <RedirecionaAncoraLegada />

      {/* B3 (F13), agora também aqui: a trilha de TODA página aponta para
          /ajuda#<categoria> — navegação client-side com hash para outra rota,
          exatamente o caso em que o App Router rola sob o loading.tsx, não acha
          o alvo e desiste. Sem isto, o operador que clica em "Como fazer" na
          trilha de um guia cai no topo do índice. Achado da re-revisão da F20. */}
      <AncoraAoMontar ids={CATEGORIAS.map((c) => c.chave)} />
    </div>
  )
}
