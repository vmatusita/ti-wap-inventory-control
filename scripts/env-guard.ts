// Guardas anti-acidente compartilhadas por scripts/seed.ts e scripts/reset.ts.
// Regra 2 do CLAUDE.md (dados 100% ficticios, nunca producao) e regra 4 (o
// SERVICE_ROLE_KEY so vive em scripts locais). Estas guardas SAO as primeiras
// linhas executadas pelos scripts.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// Le .env.local (sem depender de lib externa) e popula process.env para as
// chaves ainda nao definidas. Nao sobrescreve o que ja veio do ambiente.
export function loadEnvLocal(): void {
  const file = resolve(process.cwd(), '.env.local')
  if (!existsSync(file)) return
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}

export type GuardedConfig = {
  url: string
  serviceRoleKey: string
  projectRef: string
}

function refFromUrl(url: string): string | null {
  // https://<ref>.supabase.co  ->  <ref>
  try {
    const host = new URL(url).hostname
    const first = host.split('.')[0]
    return first || null
  } catch {
    return null
  }
}

// Valida as guardas e devolve a config. Lanca com mensagem clara se algo falhar
// — o script NUNCA prossegue sem passar por aqui.
export function assertGuardsAndGetConfig(): GuardedConfig {
  const errs: string[] = []

  if (process.env.SEED_CONFIRM !== 'sim') {
    errs.push(
      'SEED_CONFIRM diferente de "sim". Defina SEED_CONFIRM=sim no .env.local para confirmar que voce quer mesmo mexer neste banco.',
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const expectedRef = process.env.SEED_PROJECT_REF ?? ''

  if (!url) errs.push('NEXT_PUBLIC_SUPABASE_URL ausente.')
  if (!serviceRoleKey) errs.push('SUPABASE_SERVICE_ROLE_KEY ausente.')
  if (!expectedRef) {
    errs.push(
      'SEED_PROJECT_REF ausente. Defina o ref do projeto de DEV para o script confirmar que nao e producao.',
    )
  }

  const actualRef = url ? refFromUrl(url) : null
  if (url && !actualRef) {
    errs.push(`NEXT_PUBLIC_SUPABASE_URL invalida: ${url}`)
  }
  if (expectedRef && actualRef && expectedRef !== actualRef) {
    errs.push(
      `Ref do projeto NAO confere: a URL aponta para "${actualRef}", mas SEED_PROJECT_REF="${expectedRef}". ` +
        'Abortado por seguranca (pode ser producao).',
    )
  }

  if (errs.length > 0) {
    console.error('\n[GUARDA] Execucao recusada:\n- ' + errs.join('\n- ') + '\n')
    process.exit(1)
  }

  return { url, serviceRoleKey, projectRef: actualRef as string }
}

// Cliente administrativo (service role) — sem sessao. Intencionalmente SEM o
// generic Database: os tipos so sao regenerados apos `supabase db push` +
// `npm run db:types`; para um script de dados isso e desnecessario.
export function createAdminClient(cfg: GuardedConfig) {
  return createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
