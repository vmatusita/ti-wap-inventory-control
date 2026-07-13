import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { type Database } from '@/lib/types/database'

// Cliente Supabase ADMINISTRATIVO (service role) — server-side apenas.
// Usos permitidos (spec §3 / OS-F3): validar senha de acesso, convidar operador
// e SERVIR as queries de relatório para sessões por senha (que não têm
// credencial de banco). NUNCA importar em Client Component: `server-only` quebra
// o build se alguém tentar, e a chave só existe em SUPABASE_SERVICE_ROLE_KEY
// (nunca NEXT_PUBLIC), então jamais chega ao browser.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  )
}
