// Ferramenta de go-live/emergência — o sistema NÃO tem importação; ver spec §10.
//
// Guardas da carga (ordem F4 §3.2.2) — PRIMEIRAS linhas executadas, antes de
// qualquer leitura do banco:
//   CARGA_CONFIRM=sim            confirmação explícita
//   CARGA_PROJECT_REF            precisa bater com o ref da URL em uso
//   CARGA_ADMIN_EMAIL            precisa resolver para um profile (vira criado_por)
// A URL/chave vêm de CARGA_SUPABASE_URL/CARGA_SERVICE_ROLE_KEY (para apontar o
// projeto de ENSAIO sem tocar o .env.local) com fallback nas do app.

import { createAdminClient, loadEnvLocal, type GuardedConfig } from '../env-guard'

function refFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.split('.')[0] || null
  } catch {
    return null
  }
}

export type CargaConfig = GuardedConfig & { adminEmail: string }

export function assertCargaGuards(): CargaConfig {
  loadEnvLocal()
  const errs: string[] = []

  if (process.env.CARGA_CONFIRM !== 'sim') {
    errs.push('CARGA_CONFIRM diferente de "sim". Exporte CARGA_CONFIRM=sim para confirmar a carga neste banco.')
  }

  const url = process.env.CARGA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceRoleKey = process.env.CARGA_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const expectedRef = process.env.CARGA_PROJECT_REF ?? ''
  const adminEmail = process.env.CARGA_ADMIN_EMAIL ?? ''

  if (!url) errs.push('URL do Supabase ausente (CARGA_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL).')
  if (!serviceRoleKey) errs.push('Service role key ausente (CARGA_SERVICE_ROLE_KEY ou SUPABASE_SERVICE_ROLE_KEY).')
  if (!expectedRef) errs.push('CARGA_PROJECT_REF ausente. Defina o ref do projeto ALVO (ensaio ou produção) para confirmar o destino.')
  if (!adminEmail) errs.push('CARGA_ADMIN_EMAIL ausente. Defina o e-mail do operador que assina a carga (vira criado_por).')

  const actualRef = url ? refFromUrl(url) : null
  if (url && !actualRef) errs.push(`URL do Supabase inválida: ${url}`)
  if (expectedRef && actualRef && expectedRef !== actualRef) {
    errs.push(
      `Ref do projeto NÃO confere: a URL em uso aponta para "${actualRef}", mas CARGA_PROJECT_REF="${expectedRef}". ` +
        'Abortado por segurança (banco errado).',
    )
  }

  if (errs.length > 0) {
    console.error('\n[GUARDA] Carga recusada:\n- ' + errs.join('\n- ') + '\n')
    process.exit(1)
  }

  return { url, serviceRoleKey, projectRef: actualRef as string, adminEmail }
}

/** Resolve CARGA_ADMIN_EMAIL → profile id (criado_por). Aborta se não existir. */
export async function resolverAdmin(
  db: ReturnType<typeof createAdminClient>,
  adminEmail: string,
): Promise<string> {
  const alvo = adminEmail.trim().toLowerCase()
  let page = 1
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) {
      console.error(`[GUARDA] Falha ao listar usuários: ${error.message}`)
      process.exit(1)
    }
    const user = data.users.find((u) => (u.email ?? '').toLowerCase() === alvo)
    if (user) {
      const { data: prof, error: profErr } = await db
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()
      if (profErr) {
        console.error(`[GUARDA] Falha ao ler profiles: ${profErr.message}`)
        process.exit(1)
      }
      if (!prof) {
        console.error(`[GUARDA] Usuário ${adminEmail} existe no Auth mas não tem profile. Abortado.`)
        process.exit(1)
      }
      return user.id
    }
    if (data.users.length < 200) break
    page++
  }
  console.error(`[GUARDA] CARGA_ADMIN_EMAIL="${adminEmail}" não resolve para um operador deste projeto. Abortado.`)
  process.exit(1)
}

export { createAdminClient }
export type { GuardedConfig }
