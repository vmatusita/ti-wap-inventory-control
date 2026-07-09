import { createBrowserClient } from '@supabase/ssr'

// Cliente Supabase para uso no navegador (Client Components).
// Usa apenas as variaveis publicas (URL + chave anon/publicavel).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
