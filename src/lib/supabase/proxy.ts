import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { type Database } from '@/lib/types/database'
import { VIEW_COOKIE_NAME } from '@/lib/auth/view-cookie'

// Mantém a sessão do Supabase viva e faz o roteamento de acesso (spec §3):
//  - Operador logado (@wap.ind.br): acessa tudo.
//  - Sem operador: só as rotas de RELATÓRIO (/relatorios/**), e apenas se
//    portar o cookie de visualização — a verificação REAL (assinatura + senha
//    ativa) roda no servidor Node (lib/auth/acesso.ts), não aqui (Edge, sem
//    node:crypto). `/relatorios/acesso` e `/login` /`/auth` são públicas.
//  - Qualquer outra rota sem operador → /login.
// Também injeta `x-wap-pathname` para o layout distinguir o shell (operador ×
// visualizador × público) sem depender de heurística.
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-wap-pathname', pathname)

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
    // Operador logado: libera tudo.
    return response
  }

  const rotaAuth = pathname.startsWith('/login') || pathname.startsWith('/auth')
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

  // Qualquer outra rota exige operador logado.
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}
