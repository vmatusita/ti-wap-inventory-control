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

// Exportada desde a F56 (Frente G): `scripts/smoke/guarda-ensaio.mjs` precisa do
// MESMO parser de ref que as guardas de seed/reset usam — nunca uma segunda cópia
// do regex. Comportamento idêntico ao de antes (a função não mudou).
export function refFromUrl(url: string): string | null {
  // https://<ref>.supabase.co  ->  <ref>
  try {
    const host = new URL(url).hostname
    const first = host.split('.')[0]
    return first || null
  } catch {
    return null
  }
}

// A PERMISSAO — so o ensaio roda dados ficticios (CLAUDE.md regra 2 e 5; topologia
// em docs/RUNBOOK-BANCO.md). Ate a F55 esta era uma lista de NEGACAO com UM item
// (REFS_DE_PRODUCAO): um ref INVENTADO, ou um projeto de producao NOVO, passava. A
// F55 (10/09/2026) inverteu: o ref TEM de estar nesta lista. Descoberto na F11
// (22/07/2026): as guardas abaixo so comparavam SEED_PROJECT_REF com a URL — um
// teste de CONSISTENCIA, nao de IDENTIDADE. Com os dois apontando para producao (que
// era o estado do .env.local naquele dia) as tres guardas passavam e
// `npm run db:reset` zeraria o acervo real.
// Exportada desde a F56 (Frente G): a guarda do smoke do import
// (`scripts/smoke/guarda-ensaio.mjs`) reaproveita esta MESMA lista de permissão em
// vez de manter uma terceira cópia do ref do ensaio (a segunda é
// `scripts/design/capturar.mjs:70`, independente de propósito — ferramenta de
// outra classe). Só o `export` mudou; o conteúdo e o comentário acima continuam os
// mesmos.
export const REFS_DE_ENSAIO = ['sgmvldiizsrjbxzzpmhh'] as const

// Refs de PRODUCAO conhecidos, usados SO para dar a mensagem CERTA quando alguem
// aponta para la. A permissao de verdade e REFS_DE_ENSAIO, acima — um ref de
// producao NOVO que nao esteja aqui ainda cai no "ref desconhecido" (mensagem
// generica), RECUSADO do mesmo jeito.
// Exportada desde a F56 (Frente G) pelo mesmo motivo de REFS_DE_ENSAIO acima.
export const REFS_DE_PRODUCAO_CONHECIDOS = ['pbtjcalbmepmrqzprusb'] as const

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
  // Trava final: nem SEED_CONFIRM=sim nem SEED_PROJECT_REF batendo com a URL
  // liberam um ref fora da lista de ensaio. Apontar o .env.local para o projeto
  // de ensaio e a unica saida — e e a saida certa.
  for (const ref of [actualRef, expectedRef]) {
    if (!ref) continue
    if ((REFS_DE_ENSAIO as readonly string[]).includes(ref)) continue
    if ((REFS_DE_PRODUCAO_CONHECIDOS as readonly string[]).includes(ref)) {
      errs.push(
        `O ref "${ref}" e PRODUCAO (docs/RUNBOOK-BANCO.md). Dados ficticios nunca entram nela. ` +
          'Aponte NEXT_PUBLIC_SUPABASE_URL e SEED_PROJECT_REF para o projeto de ensaio antes de rodar seed/reset.',
      )
    } else {
      errs.push(
        `O ref "${ref}" nao esta na lista de ensaio permitida (REFS_DE_ENSAIO em scripts/env-guard.ts). ` +
          'Aponte NEXT_PUBLIC_SUPABASE_URL e SEED_PROJECT_REF para o projeto de ensaio antes de rodar seed/reset.',
      )
    }
    break
  }

  if (errs.length > 0) {
    console.error('\n[GUARDA] Execucao recusada:\n- ' + errs.join('\n- ') + '\n')
    process.exit(1)
  }

  return { url, serviceRoleKey, projectRef: actualRef as string }
}

// O SEGUNDO PORTAO (F55, 10/09/2026): depois que o ref passa pela guarda acima, o
// PROPRIO BANCO confirma a identidade. `public.rotulo_de_ambiente()` (migration
// 0138) e `security definer`, alcancavel SO pela service_role, e devolve
// 'desenvolvimento' no ensaio e NULL em producao — a defesa de um ref inventado que
// por acaso resolvesse para um projeto de verdade, ou de uma producao nova e vazia
// que passaria pela condicao de DADO que o `db:seed` ja tinha (banco sem ativo).
//
// ⚠ ASSINCRONA DE PROPOSITO, e por isso e uma funcao separada de
// `assertGuardsAndGetConfig`: aquela continua SINCRONA e roda PRIMEIRO — a guarda de
// ref nunca depende de rede para recusar um ref fora da lista. Esta funcao e chamada
// por scripts/reset.ts e scripts/seed.ts logo apos criar o cliente administrativo,
// ANTES de qualquer leitura ou escrita de dado.
//
// Falha na CHAMADA (rede fora, funcao ausente, sem permissao) e RECUSA — falha
// fechada: um banco que nao consegue confirmar a propria identidade nao e um banco
// de desenvolvimento confirmado.
export async function exigirBancoDeDesenvolvimento(
  db: ReturnType<typeof createAdminClient>,
): Promise<void> {
  const { data, error } = await db.rpc('rotulo_de_ambiente')
  if (error) {
    console.error(
      '\n[GUARDA] Execucao recusada:\n- ' +
        `Nao consegui confirmar o ambiente pelo banco (public.rotulo_de_ambiente() falhou: ${error.message}). ` +
        'Falha na checagem e recusa (falha fechada) — o script nao prossegue sem a confirmacao do proprio banco.\n',
    )
    process.exit(1)
  }
  if (data !== 'desenvolvimento') {
    console.error(
      '\n[GUARDA] Execucao recusada:\n- ' +
        `O banco nao se identifica como ambiente de desenvolvimento (rotulo_de_ambiente() = ${JSON.stringify(data)}). ` +
        'Dados ficticios nunca entram num banco que nao confirma ser o ensaio.\n',
    )
    process.exit(1)
  }
}

// Cliente administrativo (service role) — sem sessao. Intencionalmente SEM o
// generic Database: os tipos so sao regenerados apos `supabase db push` +
// `npm run db:types`; para um script de dados isso e desnecessario.
export function createAdminClient(cfg: GuardedConfig) {
  return createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
