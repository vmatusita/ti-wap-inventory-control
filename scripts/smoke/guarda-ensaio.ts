// A GUARDA do smoke do import no ENSAIO (F56 · Frente G) — pura e testável,
// separada do resto do roteiro (`import-ensaio.mts`) para poder ser sabotada por
// teste sem tocar rede nenhuma. Molde: `scripts/env-guard.ts` (F55) e o comentário
// de topo de `scripts/design/capturar.mjs` ("A TRAVA, E ELA É ABSOLUTA").
//
// DOIS PORTÕES, na ordem — o mesmo desenho de `env-guard.ts`:
//
//   1. `confereAmbienteDeEnsaio` — SÍNCRONA, PURA, sem IO. Recebe o objeto de
//      ambiente (nunca lê `process.env` sozinha — quem lê o arquivo/processo é
//      `import-ensaio.mts`, com `loadEnvLocal()` de `env-guard.ts`) e devolve
//      `{ url, ref }` ou LANÇA. Usa SÓ `NEXT_PUBLIC_SUPABASE_URL` para decidir o
//      ref; confere que `NEXT_PUBLIC_SUPABASE_ANON_KEY` e
//      `SUPABASE_SERVICE_ROLE_KEY` EXISTEM (nunca lê o VALOR delas para decidir
//      nada, e nunca as imprime — só o `ref`, que não é segredo: é a mesma string
//      pública que sai em `NEXT_PUBLIC_SUPABASE_URL`, o navegador de qualquer
//      usuário já fala com ela). Reaproveita `REFS_DE_ENSAIO`,
//      `REFS_DE_PRODUCAO_CONHECIDOS` e `refFromUrl` de `scripts/env-guard.ts` — três
//      exports novos ali, comportamento idêntico ao de antes (só o `export`
//      mudou). IGNORA por completo qualquer `SMOKE_*`: a função nem DECLARA essas
//      chaves no tipo de entrada, e não há um único acesso a `env.SMOKE_*` no corpo
//      — não é "ignora o valor", é "nunca olha a propriedade". É o que a bateria de
//      teste teste (`guarda-ensaio.test.mts`) prova, inclusive por `Proxy`.
//
//   2. `confereRotuloDeEnsaio` — ASSÍNCRONA: com o client de SERVIÇO que o portão 1
//      permitiu criar, pergunta ao PRÓPRIO BANCO `rotulo_de_ambiente()`
//      (migration 0138). Reaproveita `exigirBancoDeDesenvolvimento` de
//      `env-guard.ts` tal como está — falha fechada (`process.exit(1)`) quando a
//      RPC não responde 'desenvolvimento', a mesma defesa que `db:seed`/`db:reset`
//      já usam. Não é testado por Vitest de propósito (exigiria apontar de verdade
//      para um projeto — "nunca um teste que aponte o smoke de verdade para
//      produção para ver se ele recusa", regra do prompt da fase); a prova dos DOIS
//      portões amarrados é o roteiro real, contra o ensaio.
//
// `guardaEnsaio(env)` amarra os dois — é o que `import-ensaio.mts` chama, ANTES de
// qualquer login (regra do prompt: "antes de qualquer login confere o ref contra a
// lista de PERMISSÃO e o rótulo do próprio banco").

import {
  createAdminClient,
  exigirBancoDeDesenvolvimento,
  refFromUrl,
  REFS_DE_ENSAIO,
  REFS_DE_PRODUCAO_CONHECIDOS,
} from '../env-guard'

export type AmbienteDeEnsaio = { url: string; ref: string }

/**
 * Só os NOMES de variável que este smoke lê. `[chave: string]: string | undefined`
 * deixa o objeto de ambiente real (que TEM `SMOKE_*`, fato 37) passar sem erro de
 * tipo — a proteção não é o tipo recusar a chave, é o CORPO da função nunca a ler.
 */
export type EnvSmokeImport = {
  NEXT_PUBLIC_SUPABASE_URL?: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  [chave: string]: string | undefined
}

/**
 * PORTÃO 1 — síncrona, pura, sem IO. Recebe o objeto de ambiente e devolve
 * `{ url, ref }` ou LANÇA com uma mensagem que nomeia o motivo da recusa.
 */
export function confereAmbienteDeEnsaio(env: EnvSmokeImport): AmbienteDeEnsaio {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL ausente — sem ela não dá para saber contra qual projeto apontar.',
    )
  }
  if (!anon) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY ausente.')
  }
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY ausente — a persona do smoke não pode ser criada sem ela.',
    )
  }

  const ref = refFromUrl(url)
  if (!ref) {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL inválida (não parece URL do Supabase): ${url}`)
  }

  if ((REFS_DE_PRODUCAO_CONHECIDOS as readonly string[]).includes(ref)) {
    throw new Error(
      `O ref "${ref}" é PRODUÇÃO (docs/RUNBOOK-BANCO.md). O smoke do import roda SÓ no ` +
        'ENSAIO — nunca aponte NEXT_PUBLIC_SUPABASE_URL para produção para este script, e ' +
        'nenhum SMOKE_* o salva: esta guarda nem lê essas variáveis.',
    )
  }
  if (!(REFS_DE_ENSAIO as readonly string[]).includes(ref)) {
    throw new Error(
      `O ref "${ref}" não está na lista de permissão de ensaio (REFS_DE_ENSAIO em ` +
        'scripts/env-guard.ts). Aponte NEXT_PUBLIC_SUPABASE_URL para o projeto de ENSAIO.',
    )
  }

  return { url, ref }
}

/**
 * PORTÃO 2 — o próprio banco confirma a identidade (F55, `rotulo_de_ambiente()`).
 * Reaproveita `exigirBancoDeDesenvolvimento` sem reimplementar a falha fechada.
 */
export async function confereRotuloDeEnsaio(
  db: ReturnType<typeof createAdminClient>,
): Promise<void> {
  await exigirBancoDeDesenvolvimento(db)
}

/**
 * Os dois portões, amarrados — a ÚNICA função que `import-ensaio.ts` chama antes
 * de qualquer login. Devolve o ambiente conferido e o client de SERVIÇO já criado
 * (para a criação/desativação da persona, que precisa dele).
 */
export async function guardaEnsaio(
  env: EnvSmokeImport,
): Promise<AmbienteDeEnsaio & { db: ReturnType<typeof createAdminClient> }> {
  const { url, ref } = confereAmbienteDeEnsaio(env)
  const db = createAdminClient({
    url,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY as string,
    projectRef: ref,
  })
  await confereRotuloDeEnsaio(db)
  console.log(`[guarda] ref ${ref} · rotulo_de_ambiente() = 'desenvolvimento' — confirmado`)
  return { url, ref, db }
}
