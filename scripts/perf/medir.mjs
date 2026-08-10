#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Harness de medição de performance do Estoque TI WAP (OS-F33 · Frente A)
// ---------------------------------------------------------------------------
// Mede, de fora para dentro, quanto tempo o servidor leva para responder o HTML
// de cada rota do sistema — TTFB (cabeçalhos na mão) e tempo total (último byte
// do corpo). Roda contra a produção na Vercel OU contra um `next start` local,
// com a MESMA lista de rotas e o MESMO método, para que "antes" e "depois"
// sejam comparáveis.
//
//   node scripts/perf/medir.mjs                          (produção, padrão)
//   PERF_URL_APP=http://localhost:3000 node scripts/perf/medir.mjs
//   node scripts/perf/medir.mjs --rotulo depois --saida docs/perf/depois.json
//
// REGRAS QUE ESTE ARQUIVO NÃO QUEBRA (CLAUDE.md):
//  - **Só GET.** Nenhuma escrita, em nenhum ambiente. Nem POST, nem PATCH.
//  - Nenhum segredo aqui dentro: tudo vem do ambiente (mesma cascata do smoke,
//    scripts/smoke/README.md). Senha, e-mail e chave são mascarados como `***`
//    em QUALQUER saída, inclusive stack trace.
//  - Nenhum dado real sai daqui: o JSON versionado guarda tempo, status HTTP e
//    tamanho em bytes. Os ids de produção usados nas rotas dinâmicas são
//    DESCOBERTOS a cada execução (ordem determinística) e NUNCA escritos no
//    arquivo — a rota aparece como `/ativos/[id]`.
//  - Zero dependência nova: `fetch` do Node e `@supabase/supabase-js`, que já é
//    dependência do projeto.
//
// MÉTODO (o mesmo no "antes" e no "depois", ou a comparação não vale nada):
//  1. uma passada de AQUECIMENTO sobre todas as rotas (descartada) — tira do
//     número o cold start da lambda e o primeiro plano do Postgres;
//  2. N rodadas em ROUND-ROBIN: cada rodada mede cada rota uma vez, na mesma
//     ordem. Round-robin (e não N vezes seguidas a mesma rota) porque medir a
//     mesma rota em sequência premia demais a lambda quente e o cache do banco,
//     e nenhum usuário navega assim.
//  3. mediana e p95 por rota. p95 por interpolação linear entre postos.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')

// URL pública do projeto na Vercel — endereço que qualquer pessoa digita no
// navegador, não é segredo (mesma constante do smoke).
const URL_APP_PADRAO = 'https://ti-wap-inventory-control.vercel.app'

// ---------------------------------------------------------------------------
// 1. Ambiente (cascata idêntica à do smoke — scripts/smoke/README.md)
// ---------------------------------------------------------------------------

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
const temFlag = (nome) => argv.includes(`--${nome}`)

const urlApp = (process.env.PERF_URL_APP || URL_APP_PADRAO).replace(/\/+$/, '')
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
const segredoView = process.env.VIEW_SESSION_SECRET || ''
const chaveServico = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const REPETICOES = Number(opcao('repeticoes', process.env.PERF_REPETICOES || '11'))
const AQUECIMENTO = Number(opcao('aquecimento', process.env.PERF_AQUECIMENTO || '2'))
const ROTULO = opcao('rotulo', process.env.PERF_ROTULO || 'baseline')
const SAIDA = opcao('saida', process.env.PERF_SAIDA || '')
const TIMEOUT_MS = Number(process.env.PERF_TIMEOUT_MS || '90000')
const SEM_SESSAO = temFlag('sem-sessao')

// ---------------------------------------------------------------------------
// 2. Máscara de segredos — envolve TODO o console (padrão do smoke)
// ---------------------------------------------------------------------------

const SEGREDOS = [senha, email, chaveAnon, segredoView, chaveServico].filter(
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
  if (!erro) return 'erro desconhecido'
  if (erro instanceof Error) return mascarar(erro.message || erro.name)
  const codigo = erro.code ? `[${erro.code}] ` : ''
  return mascarar(`${codigo}${erro.message ?? JSON.stringify(erro)}`)
}

// ---------------------------------------------------------------------------
// 3. Sessões (só leitura)
// ---------------------------------------------------------------------------

// Cookie de sessão de operador no formato que o @supabase/ssr lê — MESMA forma
// usada pelo smoke (scripts/smoke/smoke-prod.mjs · cookieDaSessao).
function cookieDaSessao(sessao) {
  const ref = new URL(urlSupabase).hostname.split('.')[0]
  const valor =
    'base64-' + Buffer.from(JSON.stringify(sessao), 'utf8').toString('base64url')
  return `sb-${ref}-auth-token=${valor}`
}

// Cookie da sessão de VISUALIZAÇÃO por senha. Espelha `assinarSessaoView` de
// src/lib/auth/senha-sessao.ts (fonte da verdade: aquele arquivo; aqui é a
// mesma conta HMAC-SHA256 sobre {sid, exp}, porque um .mjs não importa TS
// marcado com `server-only`). Se a assinatura divergir, o app recusa o cookie e
// a medição do visualizador vira redirect — o que este script REPORTA (status
// 307), em vez de fingir que mediu.
function cookieViewer(senhaId) {
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60
  const body = Buffer.from(JSON.stringify({ sid: senhaId, exp })).toString('base64url')
  const assinatura = createHmac('sha256', segredoView).update(body).digest('base64url')
  return `wap_view=${body}.${assinatura}`
}

// Ids das rotas dinâmicas: descobertos a cada execução, em ordem
// DETERMINÍSTICA (menor id), para que "antes" e "depois" meçam a mesma página.
// Nenhum deles vai para o arquivo de saída.
async function descobrirContexto() {
  const ctx = { ativoId: null, filialSlug: null, geradoId: null, senhaId: null, sessao: null }
  if (SEM_SESSAO) return ctx

  const faltando = []
  if (!urlSupabase) faltando.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!chaveAnon) faltando.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!email) faltando.push('SMOKE_EMAIL')
  if (!senha) faltando.push('SMOKE_SENHA')
  if (faltando.length) {
    log(`  aviso: sem sessão de operador (faltam ${faltando.join(', ')}) — só rotas públicas.`)
    return ctx
  }

  const db = createClient(urlSupabase, chaveAnon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.auth.signInWithPassword({ email, password: senha })
  if (error || !data?.session) {
    log(`  aviso: login recusado (${descreverErro(error)}) — só rotas públicas.`)
    return ctx
  }
  ctx.sessao = data.session
  ctx.db = db

  const { data: ativos } = await db.from('ativos').select('id').order('id').limit(1)
  ctx.ativoId = ativos?.[0]?.id ?? null

  const { data: filiais } = await db
    .from('filiais')
    .select('slug')
    .eq('ativo', true)
    .order('id')
    .limit(1)
  ctx.filialSlug = filiais?.[0]?.slug ?? null

  const { data: gerados } = await db
    .from('relatorios_gerados')
    .select('id')
    .order('id')
    .limit(1)
  ctx.geradoId = gerados?.[0]?.id ?? null

  // Senha de acesso ATIVA para a sessão de visualizador. A tabela é
  // administrativa: tenta com a sessão do operador e, se a RLS recusar, cai
  // para a service role (script LOCAL — permitido pelo CLAUDE.md §4).
  if (segredoView) {
    let { data: senhas } = await db
      .from('senhas_acesso')
      .select('id')
      .eq('ativa', true)
      .order('id')
      .limit(1)
    if (!senhas?.length && chaveServico) {
      const admin = createClient(urlSupabase, chaveServico, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const r = await admin
        .from('senhas_acesso')
        .select('id')
        .eq('ativa', true)
        .order('id')
        .limit(1)
      senhas = r.data
    }
    ctx.senhaId = senhas?.[0]?.id ?? null
  }
  return ctx
}

// ---------------------------------------------------------------------------
// 4. Lista de rotas
// ---------------------------------------------------------------------------

function montarRotas(ctx) {
  const cookieOperador = ctx.sessao ? cookieDaSessao(ctx.sessao) : null
  const cookieVis =
    ctx.senhaId && segredoView ? cookieViewer(ctx.senhaId) : null

  const rotas = []
  const add = (rotulo, caminho, sessao, cookie, esperado = 200) => {
    if (!caminho) return
    rotas.push({ rotulo, caminho, sessao, cookie, esperado })
  }

  // Controle de rede: asset estático, FORA do matcher do proxy (src/proxy.ts).
  // É o piso físico — RTT + CDN, sem middleware, sem render, sem banco.
  add('/vercel.svg (controle estático)', '/vercel.svg', 'publico', null)

  // Públicas: passam pelo proxy mas não tocam o banco de negócio.
  add('/login', '/login', 'publico', null)
  add('/relatorios/acesso', '/relatorios/acesso', 'publico', null)

  if (cookieOperador) {
    // SONDA DO CUSTO DO PROXY — a medição mais importante da Frente B.
    // `/login` é rota de auth: o proxy roda, mas devolve a resposta sem tocar em
    // banco de negócio, e a PÁGINA é a mesma nos dois casos. Sem cookie de
    // sessão, `getUser()` não vai à rede (não há sessão para validar); COM
    // cookie, vai. A diferença entre estas duas linhas é, isolada, o preço da
    // ida de rede Vercel→Auth do Supabase que o proxy paga por navegação — o
    // número que decide se mexer no proxy vale a pena.
    add('/login (com sessão — sonda do getUser do proxy)', '/login', 'operador', cookieOperador)

    add('/ (dashboard)', '/', 'operador', cookieOperador)
    add('/ativos', '/ativos', 'operador', cookieOperador)
    if (ctx.ativoId) add('/ativos/[id]', `/ativos/${ctx.ativoId}`, 'operador', cookieOperador)
    add('/movimentacoes', '/movimentacoes', 'operador', cookieOperador)
    add('/movimentacoes/nova', '/movimentacoes/nova', 'operador', cookieOperador)
    add('/itens', '/itens', 'operador', cookieOperador)
    add('/pendencias', '/pendencias', 'operador', cookieOperador)
    add('/ajuda', '/ajuda', 'operador', cookieOperador)
    add('/relatorios/geral', '/relatorios/geral', 'operador', cookieOperador)
    if (ctx.filialSlug)
      add('/relatorios/[filial]', `/relatorios/${ctx.filialSlug}`, 'operador', cookieOperador)
    add('/relatorios/gerados', '/relatorios/gerados', 'operador', cookieOperador)
    if (ctx.geradoId)
      add(
        '/relatorios/gerados/[id]',
        `/relatorios/gerados/${ctx.geradoId}`,
        'operador',
        cookieOperador,
      )
  }

  if (cookieVis) {
    add('/relatorios/geral', '/relatorios/geral', 'visualizador', cookieVis)
    if (ctx.filialSlug)
      add('/relatorios/[filial]', `/relatorios/${ctx.filialSlug}`, 'visualizador', cookieVis)
    add('/relatorios/gerados', '/relatorios/gerados', 'visualizador', cookieVis)
    if (ctx.geradoId)
      add(
        '/relatorios/gerados/[id]',
        `/relatorios/gerados/${ctx.geradoId}`,
        'visualizador',
        cookieVis,
      )
  }

  return rotas
}

// ---------------------------------------------------------------------------
// 5. Medição
// ---------------------------------------------------------------------------

// Uma medição: TTFB = instante em que os CABEÇALHOS chegam (o `fetch` do Node
// resolve aí); total = último byte do corpo consumido. Só GET, redirect manual
// (um redirect que aparecesse depois de uma "otimização" seria falso ganho —
// por isso o status e o tamanho entram no relatório).
async function medirUma(rota) {
  const alvo = `${urlApp}${rota.caminho}`
  const t0 = performance.now()
  try {
    const resposta = await fetch(alvo, {
      redirect: 'manual',
      headers: {
        'user-agent': 'perf-estoque-ti-wap',
        'accept-language': 'pt-BR',
        ...(rota.cookie ? { cookie: rota.cookie } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const ttfb = performance.now() - t0
    const corpo = await resposta.text()
    const total = performance.now() - t0
    return {
      ok: true,
      status: resposta.status,
      bytes: Buffer.byteLength(corpo, 'utf8'),
      ttfb,
      total,
      cache: resposta.headers.get('x-vercel-cache') || null,
    }
  } catch (erro) {
    return { ok: false, status: 0, bytes: 0, ttfb: null, total: null, erro: descreverErro(erro) }
  }
}

function mediana(xs) {
  return percentil(xs, 50)
}

// Interpolação linear entre postos (mesmo método do `numpy.percentile` padrão).
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

const r1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10)

async function medirTudo(rotas) {
  const amostras = rotas.map(() => [])

  for (let a = 0; a < AQUECIMENTO; a++) {
    for (const rota of rotas) await medirUma(rota)
    log(`  aquecimento ${a + 1}/${AQUECIMENTO} concluído`)
  }

  for (let r = 0; r < REPETICOES; r++) {
    for (let i = 0; i < rotas.length; i++) {
      amostras[i].push(await medirUma(rotas[i]))
    }
    log(`  rodada ${r + 1}/${REPETICOES} concluída`)
  }

  return rotas.map((rota, i) => {
    const boas = amostras[i].filter((m) => m.ok)
    const ttfbs = boas.map((m) => m.ttfb)
    const totais = boas.map((m) => m.total)
    const status = [...new Set(amostras[i].map((m) => m.status))].sort()
    const bytes = boas.map((m) => m.bytes)
    return {
      rota: rota.rotulo,
      sessao: rota.sessao,
      amostras: boas.length,
      falhas: amostras[i].length - boas.length,
      status,
      bytes_mediana: bytes.length ? Math.round(mediana(bytes)) : null,
      bytes_min: bytes.length ? Math.min(...bytes) : null,
      bytes_max: bytes.length ? Math.max(...bytes) : null,
      ttfb_mediana: r1(mediana(ttfbs)),
      ttfb_p95: r1(percentil(ttfbs, 95)),
      ttfb_min: r1(ttfbs.length ? Math.min(...ttfbs) : null),
      total_mediana: r1(mediana(totais)),
      total_p95: r1(percentil(totais, 95)),
      erros: [...new Set(amostras[i].filter((m) => !m.ok).map((m) => m.erro))],
    }
  })
}

// ---------------------------------------------------------------------------
// 6. Saída
// ---------------------------------------------------------------------------

function tabelaMd(linhas) {
  const cab =
    '| Rota | Sessão | HTTP | TTFB mediana | TTFB p95 | Total mediana | Total p95 | HTML (bytes) | n |'
  const sep = '|---|---|---:|---:|---:|---:|---:|---:|---:|'
  const corpo = linhas.map(
    (l) =>
      `| \`${l.rota}\` | ${l.sessao} | ${l.status.join('/')} | ${l.ttfb_mediana ?? '—'} | ${l.ttfb_p95 ?? '—'} | ${l.total_mediana ?? '—'} | ${l.total_p95 ?? '—'} | ${l.bytes_mediana?.toLocaleString('pt-BR') ?? '—'} | ${l.amostras} |`,
  )
  return [cab, sep, ...corpo].join('\n')
}

async function main() {
  log('---------------------------------------------------------------')
  log(`Harness de performance · F33 · rótulo "${ROTULO}"`)
  log(`Alvo: ${urlApp}`)
  log(`Método: ${AQUECIMENTO} passada(s) de aquecimento + ${REPETICOES} rodadas round-robin`)
  log('---------------------------------------------------------------')

  const ctx = await descobrirContexto()
  const rotas = montarRotas(ctx)
  log(`Rotas medidas: ${rotas.length}`)
  log('')

  const inicio = new Date().toISOString()
  const linhas = await medirTudo(rotas)
  const fim = new Date().toISOString()

  if (ctx.db) {
    try {
      await ctx.db.auth.signOut()
      log('  sessão encerrada (signOut).')
    } catch (erro) {
      log(`  aviso: signOut falhou — ${descreverErro(erro)}`)
    }
  }

  log('')
  log(tabelaMd(linhas))
  log('')

  const relatorio = {
    rotulo: ROTULO,
    alvo: urlApp,
    node: process.version,
    inicio,
    fim,
    metodo: {
      aquecimento: AQUECIMENTO,
      repeticoes: REPETICOES,
      ordem: 'round-robin (cada rodada mede cada rota uma vez, na mesma ordem)',
      ttfb: 'instante em que os cabeçalhos da resposta chegam (fetch resolvido)',
      total: 'último byte do corpo HTML consumido',
      percentil: 'interpolação linear entre postos',
      redirect: 'manual (status 3xx é registrado, não seguido)',
    },
    rotas: linhas,
  }

  const destino = SAIDA
    ? resolve(RAIZ, SAIDA)
    : join(RAIZ, 'docs', 'perf', `${ROTULO}.json`)
  mkdirSync(dirname(destino), { recursive: true })
  writeFileSync(destino, JSON.stringify(relatorio, null, 2) + '\n', 'utf8')
  log(`JSON gravado em ${destino.replace(RAIZ, '.')}`)

  const falhas = linhas.filter((l) => l.falhas > 0 || l.amostras === 0)
  if (falhas.length) {
    log('')
    log(`ATENÇÃO — ${falhas.length} rota(s) com falha de medição:`)
    for (const f of falhas) log(`  ${f.rota} (${f.sessao}) — ${f.erros.join('; ') || 'sem amostra'}`)
  }
  const naoDuzentos = linhas.filter((l) => !l.status.every((s) => s === 200))
  if (naoDuzentos.length) {
    log('')
    log('ATENÇÃO — rota(s) que NÃO responderam 200 (sessão recusada ou redirect):')
    for (const n of naoDuzentos) log(`  ${n.rota} (${n.sessao}) — HTTP ${n.status.join('/')}`)
  }
}

main().catch((erro) => {
  console.error(`ERRO FATAL: ${descreverErro(erro)}`)
  process.exitCode = 1
})
