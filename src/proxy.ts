import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

// Next.js 16 renomeou "middleware" para "proxy" (mesma funcionalidade).
// Doc: node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
export async function proxy(request: NextRequest) {
  // ANDAIME DA F32 — TEMPORÁRIO, remover junto com src/app/verify/.
  if (request.nextUrl.pathname.startsWith('/verify')) return NextResponse.next()
  return updateSession(request)
}

export const config = {
  matcher: [
    // Roda em todas as rotas, exceto assets estaticos e imagens.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
