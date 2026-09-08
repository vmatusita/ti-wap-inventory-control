#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Harness de medição do CUSTO DA GUARDA (OS-F49 · frente 6)
// ---------------------------------------------------------------------------
// Mede quanto tempo `exigirPapel(supabase, 'consulta')` acrescenta a UMA chamada
// de Server Action — que é exatamente o que a F49 passa a cobrar em nove leituras,
// sete delas em campo com debounce POR TECLA.
//
//   node scripts/perf/medir-guarda.mjs
//   node scripts/perf/medir-guarda.mjs --rotulo depois --saida docs/perf/f49-depois.json
//   PERF_REPETICOES=21 node scripts/perf/medir-guarda.mjs
//
// POR QUE UM SCRIPT NOVO, e não `scripts/perf/medir.mjs`
// -----------------------------------------------------
// O `medir.mjs` é **só GET** por regra escrita no cabeçalho dele (linha 16), e
// mede TTFB de ROTA. Server Action não é rota GET: o cliente a alcança por POST
// com o header `Next-Action: <id>`, e esse id é gerado pelo compilador e muda a
// cada build. Medir a action de fora exigiria extrair o id do bundle a cada
// deploy — frágil, e mediria a soma (rede + framework + guarda + query), em que
// a parcela da guarda ficaria dentro da margem de erro.
//
// Este script mede a guarda pelo que ela É: duas idas ao Supabase, na ordem em
// que `cargoDoRequest` as faz (src/lib/auth/acesso.ts:260).
//
//   1. `auth.getUser()`   — o que `idOperador()` faz. Valida o JWT no servidor
//      de Auth (não é decode local: é uma chamada de rede a /auth/v1/user).
//   2. `rpc('papel_atual')` — o que `lerPapel()` faz. Uma chamada a /rest/v1/rpc.
//   3. O PAR, em sequência — o custo total que a guarda acrescenta na PRIMEIRA
//      chamada de um request. É este o número da fase.
//
// O par é medido de verdade (as duas chamadas em sequência, cronometradas
// juntas), e não somando as medianas isoladas: a soma de medianas não é a
// mediana da soma, e o reuso de conexão TCP/TLS entre a 1ª e a 2ª é justamente
// parte do que queremos capturar.
//
// REGRAS QUE ESTE ARQUIVO NÃO QUEBRA (CLAUDE.md · herdadas de medir.mjs)
//  - **Só leitura.** `getUser` e `papel_atual()` são ambos SELECT/só-leitura.
//    Nenhum INSERT, UPDATE, DELETE ou RPC de escrita, em nenhum ambiente.
//  - Nenhum segredo aqui dentro: tudo vem do ambiente (mesma cascata do
//    `medir.mjs` e do smoke). Senha, e-mail e chaves são mascarados como `***`
//    em QUALQUER saída, inclusive stack trace.
//  - Nenhum dado real sai daqui: o JSON versionado guarda tempo, status e
//    contagem. O CARGO lido é gravado apenas como `papel_presente: true`, e o
//    uid da sessão NUNCA é escrito — nem mascarado, nem em hash.
//  - Zero dependência nova: `fetch` do Node e `@supabase/supabase-js`, que já é
//    dependência do projeto.
//
// MÉTODO (o mesmo no "antes" e no "depois", ou a comparação não vale nada — é a
// mesma doutrina do `medir.mjs`):
//  1. uma passada de AQUECIMENTO sobre as três medidas (descartada) — tira do
//     número o handshake TLS e o primeiro plano do Postgres;
//  2. N rodadas em ROUND-ROBIN: cada rodada mede as três medidas uma vez, na
//     mesma ordem. Round-robin (e não N vezes seguidas a mesma medida) porque
//     repetir a mesma chamada em sequência premia demais o cache do PostgREST;
//  3. mediana e p95 por medida. p95 por interpolação linear entre postos.
//
// O QUE ESTE NÚMERO **NÃO** PROVA
//  - Não é o tempo da tela. É o custo do par de chamadas contra o Supabase, a
//    partir da máquina que roda o script. A lambda da Vercel fala com o Supabase
//    por um caminho de rede diferente (mesma região, desde a F33) e mede MENOS.
//    Este número é, portanto, um TETO pessimista visto da mesa.
//  - Não mede o efeito do `cache()` de `cargoDoRequest`: aqui cada rodada é um
//    "request novo". Dentro de um request real, a 2ª guarda custa ZERO.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')

// Mesmo carregador do `medir.mjs`: variável já exportada no ambiente VENCE o
// arquivo, para que o CI possa sobrepor sem editar nada.
function carregarEnvArquivo(caminho) {
  if (!existsSync(caminho)) return 0
  let carregadas = 0
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const texto = linha.trim()
    if (!texto || texto.startsWith('#')) continue
    const corte = texto.indexOf('=')
    if (corte <= 0) continue
    const chave = texto.slice(0, corte).trim()
    if (process.env[chave] !== undefined) continue
    let valor = texto.slice(corte + 1).trim()
    const aspas = valor.startsWith('"') && valor.endsWith('"')
    const apostrofos = valor.startsWith("'") && valor.endsWith("'")
    if ((aspas || apostrofos) && valor.length >= 2) valor = valor.slice(1, -1)
    process.env[chave] = valor
    carregadas++
  }
  return carregadas
}

carregarEnvArquivo(join(RAIZ, '.env.local'))

const argv = process.argv.slice(2)
function opcao(nome, padrao) {
  const i = argv.indexOf(`--${nome}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : padrao
}
function numeroOuPadrao(valor, padrao) {
  const texto = typeof valor === 'string' ? valor.trim() : valor
  if (texto === undefined || texto === null || texto === '') return padrao
  const n = Number(texto)
  return Number.isFinite(n) && n >= 0 ? n : padrao
}

// A MESMA cascata de credencial do `medir.mjs` (linhas 114-127) — reusada, não
// reinventada: quem já roda o smoke ou o perf não precisa configurar nada novo.
const urlSupabase =
  process.env.PERF_SUPABASE_URL ||
  process.env.SMOKE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ''
const chaveAnon =
  process.env.PERF_SUPABASE_ANON_KEY ||
  process.env.SMOKE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''
const email = process.env.PERF_EMAIL || process.env.SMOKE_EMAIL || ''
const senha = process.env.PERF_SENHA || process.env.SMOKE_SENHA || ''

const REPETICOES = numeroOuPadrao(opcao('repeticoes', process.env.PERF_REPETICOES), 15)
const AQUECIMENTO = numeroOuPadrao(opcao('aquecimento', process.env.PERF_AQUECIMENTO), 2)
const ROTULO = opcao('rotulo', process.env.PERF_ROTULO || 'antes')
const SAIDA = opcao('saida', process.env.PERF_SAIDA || '')

// Mascaramento antes de qualquer log — vale para stack trace também.
const SEGREDOS = [senha, email, chaveAnon].filter(
  (v) => typeof v === 'string' && v.length >= 8,
)
function mascarar(valor) {
  let texto = typeof valor === 'string' ? valor : String(valor ?? '')
  for (const segredo of SEGREDOS) texto = texto.split(segredo).join('***')
  return texto
}
function textoDe(valor) {
  return typeof valor === 'string' ? valor : inspect(valor, { depth: 4 })
}
for (const metodo of ['log', 'error', 'warn', 'info', 'debug']) {
  const original = console[metodo].bind(console)
  console[metodo] = (...args) => original(...args.map((a) => mascarar(textoDe(a))))
}
function log(texto = '') {
  console.log(mascarar(texto))
}
function descreverErro(erro) {
  if (erro instanceof Error) {
    return mascarar(`${erro.name}: ${erro.message}${erro.stack ? `\n${erro.stack}` : ''}`)
  }
  return mascarar(textoDe(erro))
}

// Interpolação linear entre postos — MESMA função do `medir.mjs` (linha 391),
// copiada de propósito: um script de medição que importa de outro passa a poder
// quebrar por refatoração alheia, e o valor de uma medição é ser reexecutável.
function percentil(xs, p) {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  if (s.length === 1) return s[0]
  const pos = ((s.length - 1) * p) / 100
  const baixo = Math.floor(pos)
  const alto = Math.ceil(pos)
  if (baixo === alto) return s[baixo]
  return s[baixo] + (s[alto] - s[baixo]) * (pos - baixo)
}
function mediana(xs) {
  return percentil(xs, 50)
}
const r1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10)

async function cronometrar(fn) {
  const t0 = performance.now()
  const r = await fn()
  const ms = performance.now() - t0
  return { ms, ...r }
}

async function main() {
  if (!urlSupabase || !chaveAnon) {
    log('SEM CREDENCIAL: falta a URL do Supabase ou a chave anon.')
    log('Configure PERF_SUPABASE_URL/PERF_SUPABASE_ANON_KEY (ou as SMOKE_*/NEXT_PUBLIC_*).')
    log('Nada foi medido — e NENHUM número inventado. Ver o relatório da fase.')
    process.exitCode = 1
    return
  }
  if (!email || !senha) {
    log('SEM CREDENCIAL: falta e-mail/senha de operador (PERF_EMAIL/PERF_SENHA ou SMOKE_*).')
    log('A guarda só pode ser medida com uma sessão REAL — sem sessão, `papel_atual()`')
    log('devolve NULL e o tempo medido seria o de outra coisa.')
    log('Nada foi medido — e NENHUM número inventado. Ver o relatório da fase.')
    process.exitCode = 1
    return
  }

  const inicio = new Date().toISOString()
  const supabase = createClient(urlSupabase, chaveAnon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  log(`Entrando como operador em ${urlSupabase} …`)
  const { data: sessao, error: erroLogin } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  })
  if (erroLogin || !sessao?.session) {
    log(`FALHA no login: ${descreverErro(erroLogin ?? 'sem sessão')}`)
    process.exitCode = 1
    return
  }
  // ⚠ o uid NUNCA é impresso nem gravado. Só a confirmação de que há sessão.
  log('Sessão obtida. Iniciando medição.')

  // As três medidas, na ordem em que a guarda as executa.
  const MEDIDAS = [
    {
      nome: 'auth.getUser()',
      papel: 'o que `idOperador()` faz — valida o JWT no servidor de Auth',
      executar: () =>
        cronometrar(async () => {
          const { data, error } = await supabase.auth.getUser()
          return { ok: !error && !!data?.user, erro: error ? error.message : null }
        }),
    },
    {
      nome: "rpc('papel_atual')",
      papel: 'o que `lerPapel()` faz — lê o cargo vigente no Postgres',
      executar: () =>
        cronometrar(async () => {
          const { data, error } = await supabase.rpc('papel_atual')
          // O CARGO em si não é gravado: só se veio preenchido.
          return { ok: !error, papel_presente: data !== null && data !== undefined, erro: error ? error.message : null }
        }),
    },
    {
      nome: 'o PAR (getUser + papel_atual)',
      papel: 'o custo TOTAL que `exigirPapel` acrescenta na 1ª chamada de um request',
      executar: () =>
        cronometrar(async () => {
          const { data: u, error: eu } = await supabase.auth.getUser()
          if (eu || !u?.user) return { ok: false, erro: eu ? eu.message : 'sem usuário' }
          const { data: p, error: ep } = await supabase.rpc('papel_atual')
          return {
            ok: !ep,
            papel_presente: p !== null && p !== undefined,
            erro: ep ? ep.message : null,
          }
        }),
    },
  ]

  const amostras = MEDIDAS.map(() => [])
  const falhas = MEDIDAS.map(() => [])

  // 1. Aquecimento — descartado.
  for (let a = 0; a < AQUECIMENTO; a++) {
    for (const m of MEDIDAS) {
      try {
        await m.executar()
      } catch (err) {
        log(`  (aquecimento) ${m.nome}: ${descreverErro(err)}`)
      }
    }
  }
  log(`Aquecimento: ${AQUECIMENTO} passada(s) descartada(s).`)

  // 2. N rodadas em round-robin.
  for (let rodada = 1; rodada <= REPETICOES; rodada++) {
    for (let i = 0; i < MEDIDAS.length; i++) {
      try {
        const r = await MEDIDAS[i].executar()
        if (r.ok) amostras[i].push(r.ms)
        else falhas[i].push(r.erro || 'falhou sem mensagem')
      } catch (err) {
        falhas[i].push(descreverErro(err))
      }
    }
    if (rodada % 5 === 0) log(`  rodada ${rodada}/${REPETICOES}`)
  }

  const fim = new Date().toISOString()

  const linhas = MEDIDAS.map((m, i) => ({
    medida: m.nome,
    papel: m.papel,
    amostras: amostras[i].length,
    mediana_ms: r1(mediana(amostras[i])),
    p95_ms: r1(percentil(amostras[i], 95)),
    min_ms: r1(amostras[i].length ? Math.min(...amostras[i]) : null),
    max_ms: r1(amostras[i].length ? Math.max(...amostras[i]) : null),
    falhas: falhas[i].length,
  }))

  log('')
  log('| medida | n | mediana (ms) | p95 (ms) | min | max | falhas |')
  log('|---|---|---|---|---|---|---|')
  for (const l of linhas) {
    log(
      `| ${l.medida} | ${l.amostras} | ${l.mediana_ms} | ${l.p95_ms} | ${l.min_ms} | ${l.max_ms} | ${l.falhas} |`,
    )
  }

  const relatorio = {
    rotulo: ROTULO,
    alvo: 'supabase (projeto de produção) — medido da mesa',
    node: process.version,
    inicio,
    fim,
    metodo: {
      aquecimento: AQUECIMENTO,
      repeticoes: REPETICOES,
      ordem: 'round-robin (cada rodada mede as três medidas uma vez, na mesma ordem)',
      percentil: 'interpolação linear entre postos',
      sessao: 'operador real, login por senha (cascata PERF_*/SMOKE_*)',
      escrita: 'nenhuma — só getUser e papel_atual(), ambos de leitura',
      o_que_nao_mede:
        'o tempo da tela; a lambda da Vercel fala com o Supabase por caminho de rede mais curto e mede MENOS. Também não mede o efeito do cache() de cargoDoRequest: aqui cada rodada é um request novo.',
    },
    medidas: linhas,
  }

  // Falhar alto, como o `medir.mjs`: um JSON de perf com medição furada vira
  // evidência de fase por omissão.
  const semAmostra = linhas.filter((l) => l.amostras === 0)
  if (semAmostra.length) {
    log('')
    log(`ATENÇÃO — ${semAmostra.length} medida(s) sem NENHUMA amostra válida:`)
    for (const s of semAmostra) log(`  ${s.medida}`)
    process.exitCode = 1
  }

  const destino = SAIDA
    ? resolve(RAIZ, SAIDA)
    : join(RAIZ, 'docs', 'perf', `f49-guarda-${ROTULO}.json`)
  mkdirSync(dirname(destino), { recursive: true })
  writeFileSync(destino, JSON.stringify(relatorio, null, 2) + '\n', 'utf8')
  log('')
  log(`JSON gravado em ${destino.replace(RAIZ, '.')}`)

  await supabase.auth.signOut()
}

main().catch((erro) => {
  console.error(`ERRO FATAL: ${descreverErro(erro)}`)
  process.exitCode = 1
})
