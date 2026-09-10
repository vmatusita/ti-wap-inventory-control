import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

// Next.js 16 renomeou "middleware" para "proxy" (mesma funcionalidade).
// Doc: node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    // Roda em todas as rotas, exceto assets estaticos, imagens e a sonda de saude.
    //
    // ⚠ `api/saude` FORA DO MATCHER (F55). Sem esta exclusao a sonda sem sessao
    // recebia **307 para /login** e o route handler nunca chegava a rodar: o
    // `matcher` nao excluia `/api/**`, e `updateSession` so libera sem sessao
    // `/login`, `/auth/**` e `/relatorios/acesso`. Medido antes de escrever a
    // rota, passo a passo, contra `src/lib/supabase/proxy.ts`.
    //
    // Escolhida a exclusao no MATCHER, e nao um ramo publico dentro de
    // `updateSession`, por CUSTO: o proxy roda antes de todo o resto (a doc
    // local, `03-file-conventions/proxy.md:206-219`), e um ramo interno so
    // decide DEPOIS de `createServerClient` + `auth.getUser()` — uma ida ao
    // servico de Auth em cada batida da sonda, de 6 em 6 horas, para nada.
    // Fora do matcher a rota nao entra na cadeia.
    //
    // ⚠ E so `api/saude`, nunca `api` inteiro: rota nova de API nasce protegida
    // por padrao, que e o certo. A Parte A do smoke prova as duas metades — esta
    // responde 200, e as outras 17 continuam desviando.
    //
    // ⚠ E o `$` NAO E DECORACAO. Sem ele o `(?!…)` casa por PREFIXO, e QUALQUER
    // rota futura cujo caminho comece com a string `api/saude` — um
    // `/api/saude-financeira`, um `/api/saudeanimal` — nasceria sem sessao,
    // driblando o proxy, contrariando a frase acima. Medido: com `api/saude` as
    // duas escapam; com `api/saude$` so a rota exata escapa. Achado da revisao
    // adversarial de 10/09/2026, e a trava de `src/lib/saude-workflow.test.ts`
    // nao pegaria isso — quem pega e `src/proxy.test.ts`.
    '/((?!_next/static|_next/image|favicon.ico|api/saude$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
