import { createBrowserClient } from '@supabase/ssr'
import { type Database } from '@/lib/types/database'

// Cliente Supabase para uso no navegador (Client Components).
// Usa apenas as variaveis publicas (URL + chave anon/publicavel).
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
