import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { type Database } from '@/lib/types/database'
import { VIEW_COOKIE_NAME } from '@/lib/auth/view-cookie'
// F42 — a regra do link antigo do histórico de itens. Função PURA e testada; o
// proxy roda no Edge, então ela não pode tocar em nada de Node — e não toca.
import { destinoHistoricoLegado } from '@/lib/itens/lista'

// Mantém a sessão do Supabase viva e faz o roteamento de acesso (spec §3):
//  - Operador logado (domínios de lib/auth/dominios-email): acessa tudo.
//  - Sem operador: só as rotas de RELATÓRIO (/relatorios/**), e apenas se
//    portar o cookie de visualização — a verificação REAL (assinatura + senha
//    ativa) roda no servidor Node (lib/auth/acesso.ts), não aqui (Edge, sem
//    node:crypto). `/relatorios/acesso` e `/login` /`/auth` são públicas.
//  - Qualquer outra rota sem operador → /login.
// Também injeta `x-wap-pathname` para o layout distinguir o shell (operador ×
// visualizador × público) sem depender de heurística.
// Sessão de operador expira 24h após o LOGIN (decisão do Johnny, 16/07/2026 —
// F6B/B8). Usa-se `last_sign_in_at`, que só muda a cada login — refresh de token
// dentro da janela NÃO desloga. Passada a janela, o próximo request encerra a
// sessão e manda para /login?erro=sessao-expirada.
const OPERADOR_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24h

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl
  const rotaAuth = pathname.startsWith('/login') || pathname.startsWith('/auth')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-wap-pathname', pathname)
  // FLX-01 — o layout e as páginas de /relatorios/** reconstroem `pathname +
  // search` a partir destes dois headers quando precisam redirecionar para a
  // entrada por senha/login SEM perder o destino atual (ex.: sessão do
  // visualizador expira NO MEIO da leitura, disparada pelo ViewerAutoRefresh de
  // 60s). Header SEPARADO de `x-wap-pathname` de propósito — concatenar
  // quebraria o `pathname === '/relatorios/acesso'` de match exato que o layout
  // já faz.
  requestHeaders.set('x-wap-search', request.nextUrl.search)

  let response = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANTE: nao inserir logica entre createServerClient e getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    // B8: sessão de operador expira 24h após o login. `last_sign_in_at` só muda
    // em novo login, então o refresh de token dentro da janela NÃO desloga.
    // Ausência/parse inválido → não desloga (fail-open, não interrompe o trabalho).
    const inicioSessaoMs = user.last_sign_in_at
      ? Date.parse(user.last_sign_in_at)
      : NaN
    const sessaoExpirada =
      Number.isFinite(inicioSessaoMs) &&
      inicioSessaoMs + OPERADOR_MAX_AGE_MS < Date.now()

    // Não redireciona em rota de auth (evita loop com o próprio /login).
    if (sessaoExpirada && !rotaAuth) {
      // Encerra só ESTA sessão (scope 'local' → sem round-trip ao Auth server no
      // Edge; apenas limpa os cookies). signOut aciona o setAll, que grava os
      // cookies de limpeza no `response`; copiamos para o redirect — sem isso a
      // sessão não morre no navegador (padrão @supabase/ssr para middleware).
      await supabase.auth.signOut({ scope: 'local' })
      const url = request.nextUrl.clone()
      // FLX-01 — guarda o destino ANTES de zerar `search`: sem isto quem estava
      // em /pendencias?filial=3 caía sempre no Dashboard depois de logar de novo.
      const destino = pathname + request.nextUrl.search
      url.pathname = '/login'
      url.search = ''
      url.searchParams.set('erro', 'sessao-expirada')
      url.searchParams.set('next', destino)
      const redirect = NextResponse.redirect(url)
      response.cookies
        .getAll()
        .forEach((cookie) => redirect.cookies.set(cookie))
      return redirect
    }

    // F42 — O LINK ANTIGO DO HISTÓRICO DE ITENS, e por que ele mora AQUI.
    //
    // Até a v1.46.0 o histórico de lançamentos era a segunda seção de `/itens`, e
    // os cinco params dele viajavam naquela querystring. A F42 lhe deu rota própria,
    // e um favorito antigo — ou um link colado num chamado — abriria os saldos
    // IGNORANDO O RECORTE em silêncio, que é pior que um 404.
    //
    // ⚠ A PRIMEIRA ESCRITA PÔS ISTO NA PÁGINA, e o `redirect()` de lá NÃO VIRA
    // STATUS. O segmento `/itens` tem `loading.tsx`, então a rota é servida em
    // STREAM: o Next manda **HTTP 200** com o esqueleto assim que a navegação
    // começa, e um `redirect()` disparado depois disso é entregue DENTRO do payload
    // RSC, para o navegador executar. O operador de fato acaba na tela certa — mas
    // só com JavaScript, e o status da resposta continua 200. Foi assim que o smoke
    // pós-deploy o pegou (`HTTP 200 sem o conteúdo esperado`), e a instrumentação
    // confirmou: `NEXT_REDIRECT` presente no corpo, status 200.
    //
    // No proxy o desvio acontece ANTES de qualquer render: 307 de verdade, sem
    // depender de JS, sem a tela errada chegar a existir. Redirecionar rota legada
    // é assunto de ROTEAMENTO, e este é o lugar do roteamento.
    //
    // A REGRA continua sendo a função pura testada (`destinoHistoricoLegado`) — o
    // proxy só a alimenta com o que a URL traz.
    if (pathname === '/itens') {
      const p = request.nextUrl.searchParams
      const destinoLegado = destinoHistoricoLegado({
        item: p.get('item') ?? undefined,
        tipo: p.get('tipo') ?? undefined,
        de: p.get('de') ?? undefined,
        ate: p.get('ate') ?? undefined,
        busca: p.get('busca') ?? undefined,
        filial: p.get('filial') ?? undefined,
        page: p.get('page') ?? undefined,
      })
      if (destinoLegado) {
        const url = request.nextUrl.clone()
        const [caminho, query = ''] = destinoLegado.split('?')
        url.pathname = caminho
        url.search = query
        const redirect = NextResponse.redirect(url)
        response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
        return redirect
      }
    }

    // Operador logado dentro da janela: libera tudo.
    return response
  }

  const acessoRelatorio = pathname === '/relatorios/acesso'
  if (rotaAuth || acessoRelatorio) {
    return response
  }

  // Rotas de relatório: aceitam sessão por senha (cookie de visualização). A
  // presença basta aqui; a validade é conferida no servidor Node.
  const rotaRelatorio = pathname.startsWith('/relatorios')
  if (rotaRelatorio) {
    if (request.cookies.get(VIEW_COOKIE_NAME)) {
      return response
    }
    // Sem sessão: manda para a entrada por senha guardando o destino em `next`,
    // para o gestor cair direto no relatório que clicou depois de entrar. Só
    // caminhos internos de relatório viram `next` (a validação final está na
    // Server Action de login).
    const url = request.nextUrl.clone()
    url.pathname = '/relatorios/acesso'
    url.search = ''
    const destino = pathname + request.nextUrl.search
    if (destino.startsWith('/relatorios/') && pathname !== '/relatorios/acesso') {
      url.searchParams.set('next', destino)
    }
    return NextResponse.redirect(url)
  }

  // Qualquer outra rota exige operador logado. Guarda o destino em `next` (mesmo
  // padrão do ramo de /relatorios acima) para o gestor voltar para onde estava
  // depois do login — não sempre para a Home (FLX-01).
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  url.searchParams.set('next', pathname + request.nextUrl.search)
  return NextResponse.redirect(url)
}
