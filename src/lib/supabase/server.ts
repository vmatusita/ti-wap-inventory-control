import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Cliente Supabase para Server Components, Server Actions e Route Handlers.
// A sessao vive nos cookies; o proxy (src/proxy.ts) mantem os tokens frescos.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Chamado a partir de um Server Component (cookies read-only).
            // Pode ser ignorado: o proxy renova a sessao a cada requisicao.
          }
        },
      },
    },
  )
}
