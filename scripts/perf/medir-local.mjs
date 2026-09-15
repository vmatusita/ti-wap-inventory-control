// =============================================================================
// medir-local.mjs — o `medir.mjs` contra um `next start` LOCAL que fala com o ENSAIO (F58)
// =============================================================================
// POR QUE ESTE INVÓLUCRO EXISTE
//
// `scripts/perf/medir.mjs` (F33) mira PRODUÇÃO por padrão e loga pela cascata
// `PERF_* → SMOKE_* → NEXT_PUBLIC_*`. No `.env.local` desta mesa, desde a F55, `SMOKE_*` é
// PRODUÇÃO e `NEXT_PUBLIC_*` é o ENSAIO (`docs/INVENTARIO-CREDENCIAIS.md` §2). Medir um
// `next start` local sem `PERF_*` completo, então, faz duas coisas erradas de uma vez: loga
// em PRODUÇÃO e manda o cookie de produção para um app que fala com o ensaio — as rotas
// voltam redirecionadas e a medição não vale nada (fato 17 da ordem F58).
//
// Este invólucro fecha as duas portas ANTES de chamar o harness:
//   1. exige `--porta` e monta `PERF_URL_APP=http://localhost:<porta>` — nunca a Vercel;
//   2. aponta `PERF_SUPABASE_*` para o ENSAIO (`NEXT_PUBLIC_*`) e só segue se o ref da URL
//      for o `SEED_PROJECT_REF` e DIFERENTE do ref de `SMOKE_SUPABASE_URL` — alvo ambíguo recusa;
//   3. ESVAZIA `SMOKE_*` no processo filho (string vazia, não ausência: o `medir.mjs` só
//      carrega do `.env.local` o que ainda for `undefined`), para a cascata não ter para
//      onde cair;
//   4. loga com uma persona FICTÍCIA do seed (`seed.dev@wap.ind.br`, cargo admin no ensaio),
//      cuja senha é a constante do próprio `scripts/seed.ts` — lida do arquivo, nunca impressa.
//
// Nenhum valor de credencial sai daqui: o terminal mostra NOME, REF e HOST.
//
// USO (a credencial entra por `--env-file`, direto do arquivo para o process.env):
//   node --env-file=.env.local scripts/perf/medir-local.mjs --porta=3100 --rotulo=f58-base-main-local
//   opcionais: --repeticoes=15 --aquecimento=2 --saida=docs/perf/x.json
// =============================================================================

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function opcao(nome) {
  const pref = `--${nome}=`
  const achada = process.argv.find((a) => a.startsWith(pref))
  return achada ? achada.slice(pref.length) : undefined
}

function recusar(motivo) {
  console.error(`[medir-local] RECUSADO: ${motivo}`)
  process.exit(2)
}

const refDe = (url) => {
  try {
    return new URL(url).hostname.split('.')[0] || ''
  } catch {
    return ''
  }
}

const porta = opcao('porta')
if (!porta || !/^\d{4,5}$/.test(porta)) recusar('informe --porta=<número> do `next start` local.')
const rotulo = opcao('rotulo')
if (!rotulo || !/^[a-z0-9][a-z0-9.-]*$/.test(rotulo)) recusar('informe --rotulo=<kebab-case>.')

const urlEnsaio = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const anonEnsaio = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const refEsperado = process.env.SEED_PROJECT_REF ?? ''
const refSmoke = refDe(process.env.SMOKE_SUPABASE_URL ?? '')
if (!urlEnsaio || !anonEnsaio || !refEsperado) {
  recusar('faltam NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ou SEED_PROJECT_REF (rode com --env-file=.env.local).')
}
const refAlvo = refDe(urlEnsaio)
if (refAlvo !== refEsperado) recusar(`o ref de NEXT_PUBLIC_SUPABASE_URL (${refAlvo}) não é o SEED_PROJECT_REF.`)
if (refSmoke && refSmoke === refAlvo) {
  recusar('SMOKE_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_URL apontam para o MESMO projeto — não sei qual é o ensaio.')
}

// A senha da persona fictícia: a constante do seed, lida do arquivo (nunca impressa).
const fonteSeed = readFileSync(join(RAIZ, 'scripts', 'seed.ts'), 'utf8')
const senhaPersona = /const\s+SENHA_PERFIS_SEED\s*=\s*['"]([^'"]+)['"]/.exec(fonteSeed)?.[1] ?? ''
if (!senhaPersona) recusar('não achei SENHA_PERFIS_SEED em scripts/seed.ts.')
const emailPersona = process.env.PERF_PERSONA || 'seed.dev@wap.ind.br'
if (!/^seed\.[a-z]+@wap\.ind\.br$/.test(emailPersona)) recusar('a persona precisa ser uma conta FICTÍCIA do seed (seed.<x>@wap.ind.br).')

const urlApp = `http://localhost:${porta}`

console.log(`[medir-local] app      ${urlApp}`)
console.log(`[medir-local] banco    ENSAIO · ref ${refAlvo} (SMOKE_* esvaziado no processo filho)`)
console.log(`[medir-local] persona  ${emailPersona} (senha: constante do seed, não impressa)`)

// Pré-voo 1: o servidor local responde e diz quem é.
try {
  const r = await fetch(`${urlApp}/api/saude`, { signal: AbortSignal.timeout(20000) })
  const corpo = await r.json().catch(() => ({}))
  console.log(`[medir-local] saude    HTTP ${r.status} · versao ${corpo.versao ?? '?'} · banco ${corpo.banco ?? '?'}`)
  if (!r.ok) recusar('o /api/saude do servidor local não respondeu 200.')
} catch (erro) {
  recusar(`o servidor local não respondeu em ${urlApp} (${erro?.name ?? 'erro'}).`)
}

// Pré-voo 2: a persona loga NO ENSAIO. Sem isto o harness mediria só rotas públicas calado.
{
  const db = createClient(urlEnsaio, anonEnsaio, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await db.auth.signInWithPassword({ email: emailPersona, password: senhaPersona })
  if (error || !data?.session) recusar(`login da persona recusado no ensaio (${error?.status ?? '?'} ${error?.code ?? ''}).`)
  console.log('[medir-local] login    ok (sessão de ensaio)')
  await db.auth.signOut().catch(() => {})
}

const env = {
  ...process.env,
  PERF_URL_APP: urlApp,
  PERF_SUPABASE_URL: urlEnsaio,
  PERF_SUPABASE_ANON_KEY: anonEnsaio,
  PERF_EMAIL: emailPersona,
  PERF_SENHA: senhaPersona,
  PERF_ROTULO: rotulo,
  SMOKE_SUPABASE_URL: '',
  SMOKE_SUPABASE_ANON_KEY: '',
  SMOKE_EMAIL: '',
  SMOKE_SENHA: '',
}
const repeticoes = opcao('repeticoes')
const aquecimento = opcao('aquecimento')
const saida = opcao('saida')
if (repeticoes) env.PERF_REPETICOES = repeticoes
if (aquecimento) env.PERF_AQUECIMENTO = aquecimento
if (saida) env.PERF_SAIDA = saida

const filho = spawn(process.execPath, [join(RAIZ, 'scripts', 'perf', 'medir.mjs')], { env, stdio: 'inherit', cwd: RAIZ })
filho.on('exit', (codigo) => process.exit(codigo ?? 1))
