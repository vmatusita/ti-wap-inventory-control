#!/usr/bin/env node
// Smoke da F19 — modo escuro, impressão clara e rotas públicas.
//
// FERRAMENTA DE DEV, 100% LEITURA. Não escreve nada no banco, não submete
// formulário nenhum, não usa a service role. O ambiente desta máquina aponta
// para PRODUÇÃO (ver docs/DECISOES.md), então a regra aqui é absoluta:
// **nenhuma mutação**. Este script só carrega páginas públicas e inspeciona o DOM.
//
// Playwright é usado AVULSO, via `npx` — de propósito fora do package.json, para
// não furar a stack fechada do CLAUDE.md.
//
// Pré-requisitos:
//   npx playwright@latest install chromium     (uma vez)
//   npm run build && npm run start             (servidor em http://localhost:3000)
// Uso:
//   node scripts/smoke-f19.mjs [--base http://localhost:3000]
//
// Se existir `.env.smoke` na raiz com SMOKE_EMAIL/SMOKE_SENHA, o script faz
// também o passo LOGADO (dashboard, /ativos, /movimentacoes/nova nos dois temas).
// Sem o arquivo, ele roda só a parte pública e diz isso na saída — nunca trava.

import { mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Resolve o Playwright SEM instalá-lo no projeto: ele é uma ferramenta avulsa
// (`npx playwright@latest install chromium`), não uma dependência — a stack do
// CLAUDE.md é fechada e o package.json não pode ganhar entrada nova. Tentamos o
// node_modules local (caso alguém o tenha) e, se não houver, o cache do npx.
async function carregarPlaywright() {
  try {
    return await import('playwright')
  } catch {
    /* segue para o cache do npx */
  }
  const raizes = [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'npm-cache', '_npx'),
    process.env.HOME && join(process.env.HOME, '.npm', '_npx'),
  ].filter(Boolean)
  for (const raiz of raizes) {
    if (!existsSync(raiz)) continue
    for (const dir of readdirSync(raiz)) {
      const alvo = join(raiz, dir, 'node_modules', 'playwright', 'index.mjs')
      if (existsSync(alvo)) return import(pathToFileURL(alvo).href)
    }
  }
  console.error(
    'Playwright não encontrado. Rode uma vez:\n  npx playwright@latest install chromium',
  )
  process.exit(2)
}

const { chromium } = await carregarPlaywright()

const base =
  process.argv.includes('--base')
    ? process.argv[process.argv.indexOf('--base') + 1]
    : 'http://localhost:3000'

const EVID = 'docs/f19-evidencias'
mkdirSync(EVID, { recursive: true })

let falhas = 0
const linhas = []

function ok(msg) {
  linhas.push(`  OK   ${msg}`)
  console.log(`  OK   ${msg}`)
}
function falha(msg) {
  falhas++
  linhas.push(`  FALHA ${msg}`)
  console.log(`  FALHA ${msg}`)
}
function checar(cond, msg) {
  if (cond) ok(msg)
  else falha(msg)
}

// Credenciais opcionais — NUNCA logadas. Só a presença é reportada.
function lerEnvSmoke() {
  if (!existsSync('.env.smoke')) return null
  const txt = readFileSync('.env.smoke', 'utf8')
  const pega = (k) => txt.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
  const email = pega('SMOKE_EMAIL')
  const senha = pega('SMOKE_SENHA')
  return email && senha ? { email, senha } : null
}

const cred = lerEnvSmoke()

const navegador = await chromium.launch()
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } })
const erros = []
ctx.on('weberror', (e) => erros.push(String(e.error())))

const pagina = await ctx.newPage()
pagina.on('console', (m) => {
  if (m.type() === 'error') erros.push(m.text())
})

// Lê a classe do <html> — é o contrato do next-themes com o CSS (`attribute="class"`).
const classeHtml = () => pagina.evaluate(() => document.documentElement.className)
// Cor efetiva do fundo do body, para provar que o token TROCOU de verdade.
const fundoBody = () =>
  pagina.evaluate(() => getComputedStyle(document.body).backgroundColor)

async function definirTema(valor) {
  await pagina.evaluate((v) => localStorage.setItem('theme', v), valor)
  await pagina.reload({ waitUntil: 'networkidle' })
}

console.log(`\n=== SMOKE F19 · ${base} ===\n`)

// ---------------------------------------------------------------------------
console.log('[1] Rotas públicas respondem 200')
for (const rota of ['/login', '/relatorios/acesso']) {
  const r = await pagina.goto(base + rota, { waitUntil: 'networkidle' })
  checar(r?.status() === 200, `${rota} → ${r?.status()}`)
}

// ---------------------------------------------------------------------------
console.log('\n[2] Tema: a classe entra e sai do <html>, e o token acompanha')
await pagina.goto(base + '/login', { waitUntil: 'networkidle' })

// Padrão de fábrica: sem nada no localStorage o app é CLARO (defaultTheme="light").
await pagina.evaluate(() => localStorage.removeItem('theme'))
await pagina.reload({ waitUntil: 'networkidle' })
const classePadrao = await classeHtml()
const fundoPadrao = await fundoBody()
checar(!classePadrao.includes('dark'), `padrão de fábrica é CLARO (class="${classePadrao.trim()}")`)
await pagina.screenshot({ path: join(EVID, 'login-claro.png'), fullPage: true })

await definirTema('dark')
const classeEscura = await classeHtml()
const fundoEscuro = await fundoBody()
checar(classeEscura.includes('dark'), `tema Escuro aplica a classe (class="${classeEscura.trim()}")`)
checar(fundoEscuro !== fundoPadrao, `o fundo do body MUDOU (${fundoPadrao} → ${fundoEscuro})`)
await pagina.screenshot({ path: join(EVID, 'login-escuro.png'), fullPage: true })

await definirTema('light')
checar(!(await classeHtml()).includes('dark'), 'tema Claro remove a classe')
checar((await fundoBody()) === fundoPadrao, 'o fundo volta ao valor do tema claro')

// "Sistema": o next-themes resolve pela media query do SO. Emulamos as duas.
await pagina.evaluate(() => localStorage.setItem('theme', 'system'))
await pagina.emulateMedia({ colorScheme: 'dark' })
await pagina.reload({ waitUntil: 'networkidle' })
checar((await classeHtml()).includes('dark'), 'Sistema + SO escuro → classe dark')
await pagina.emulateMedia({ colorScheme: 'light' })
await pagina.reload({ waitUntil: 'networkidle' })
checar(!(await classeHtml()).includes('dark'), 'Sistema + SO claro → sem classe dark')

// ---------------------------------------------------------------------------
console.log('\n[3] Sem flash de tema errado (o script do next-themes roda antes da pintura)')
// O provider injeta um <script> síncrono no <head>. Se ele existir, a classe é
// aplicada ANTES do primeiro paint — que é a definição de "sem flash".
await pagina.evaluate(() => localStorage.setItem('theme', 'dark'))
await pagina.reload({ waitUntil: 'domcontentloaded' })
const classeCedo = await classeHtml()
checar(
  classeCedo.includes('dark'),
  `a classe já está no <html> no DOMContentLoaded (class="${classeCedo.trim()}")`,
)

// ---------------------------------------------------------------------------
console.log('\n[4] Impressão sai CLARA mesmo com o tema escuro ativo')
// A régua NÃO é uma string fixa de cor: o navegador reserializa `oklch()` como
// `lab()`. Comparamos o que a MESMA página reporta — tokens do tema claro (na
// tela) contra os tokens sob mídia `print` com o tema ESCURO ativo. Se baterem,
// o papel sai claro.
const TOKENS = ['--background', '--foreground', '--card', '--card-foreground', '--border', '--muted-foreground']
const lerTokens = () =>
  pagina.evaluate((chaves) => {
    const cs = getComputedStyle(document.documentElement)
    return Object.fromEntries(chaves.map((k) => [k, cs.getPropertyValue(k).trim()]))
  }, TOKENS)

// Probe: um `dark:` REAL (a classe existe no CSS — vem de STATUS_META/dominio.ts).
// Serve para provar a outra metade do conserto: na impressão nenhuma variante
// `dark:` pode casar, senão badges e pílulas sairiam com texto claro no papel.
await pagina.evaluate(() => {
  const s = document.createElement('span')
  s.id = 'probe-dark'
  s.className = 'dark:bg-green-950'
  document.body.appendChild(s)
})
const fundoProbe = () =>
  pagina.evaluate(() => getComputedStyle(document.getElementById('probe-dark')).backgroundColor)

await definirTema('light')
const tokensClaros = await lerTokens()

await definirTema('dark')
await pagina.evaluate(() => {
  const s = document.createElement('span')
  s.id = 'probe-dark'
  s.className = 'dark:bg-green-950'
  document.body.appendChild(s)
})
const tokensEscuros = await lerTokens()
const probeNaTela = await fundoProbe()
checar(
  tokensEscuros['--background'] !== tokensClaros['--background'],
  'na TELA, com tema escuro, os tokens são os escuros (controle do teste)',
)
checar(
  probeNaTela !== 'rgba(0, 0, 0, 0)',
  `na TELA a variante dark: APLICA (probe = ${probeNaTela})`,
)

await pagina.emulateMedia({ media: 'print' })
const tokensImpressos = await lerTokens()
const probeNaImpressao = await fundoProbe()
const classeNaImpressao = await classeHtml()

checar(
  classeNaImpressao.includes('dark'),
  'a classe .dark CONTINUA no <html> (o tema da TELA não é desfeito)',
)
for (const k of TOKENS) {
  // O `!== ''` não é decoração: se a página falhar em carregar, `getComputedStyle`
  // devolve string vazia para TODO token e a igualdade passaria comparando nada com
  // nada — um verde mentiroso. Já aconteceu num ensaio deste script.
  checar(
    tokensImpressos[k] !== '' && tokensImpressos[k] === tokensClaros[k],
    `${k} imprime com o valor CLARO (${tokensImpressos[k] || 'VAZIO — página não carregou'})`,
  )
}
checar(
  probeNaImpressao === 'rgba(0, 0, 0, 0)',
  `na IMPRESSÃO nenhuma variante dark: casa (probe = ${probeNaImpressao})`,
)
await pagina.screenshot({ path: join(EVID, 'login-impressao-com-tema-escuro.png'), fullPage: true })
await pagina.emulateMedia({ media: 'screen' })

// ---------------------------------------------------------------------------
console.log('\n[5] Telas logadas')
if (!cred) {
  console.log('  PULADO — não há .env.smoke com SMOKE_EMAIL/SMOKE_SENHA nesta máquina.')
  console.log('           (as rotas protegidas redirecionam para /login sem sessão)')
  linhas.push('  PULADO telas logadas — sem .env.smoke')
  // Prova de que o proxy protege as rotas — isso dá para conferir sem credencial.
  for (const rota of ['/', '/ativos', '/movimentacoes/nova']) {
    await pagina.goto(base + rota, { waitUntil: 'networkidle' })
    const url = new URL(pagina.url())
    checar(url.pathname === '/login', `${rota} sem sessão → redireciona para ${url.pathname}`)
  }
} else {
  // LOGIN é o ÚNICO formulário que este script submete. Ele não escreve dado de
  // negócio — só cria sessão. Nenhuma outra submissão é permitida aqui.
  await pagina.goto(base + '/login', { waitUntil: 'networkidle' })
  await pagina.fill('#email', cred.email)
  await pagina.fill('#senha', cred.senha)
  await Promise.all([
    pagina.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
    pagina.click('button[type=submit]'),
  ])
  ok('login concluído')

  for (const tema of ['light', 'dark']) {
    await definirTema(tema)
    for (const [rota, nome] of [
      ['/', 'dashboard'],
      ['/ativos', 'ativos'],
      ['/movimentacoes/nova', 'movimentacao-nova'],
    ]) {
      const r = await pagina.goto(base + rota, { waitUntil: 'networkidle' })
      checar(r?.status() === 200, `${rota} (${tema}) → ${r?.status()}`)
      await pagina.screenshot({ path: join(EVID, `${nome}-${tema}.png`), fullPage: true })
    }
  }
}

// ---------------------------------------------------------------------------
console.log('\n[6] Console do navegador')
// Ruído conhecido que não é defeito do app.
const ignorar = [/favicon/i, /Download the React DevTools/i]
const relevantes = erros.filter((e) => !ignorar.some((re) => re.test(e)))
checar(relevantes.length === 0, `sem erro de console (${relevantes.length} relevante(s))`)
for (const e of relevantes.slice(0, 10)) console.log(`         ↳ ${e}`)

await navegador.close()

console.log(`\n=== RESULTADO: ${falhas === 0 ? 'TUDO OK' : falhas + ' FALHA(S)'} ===`)
console.log(`Evidências em ${EVID}/`)
process.exit(falhas === 0 ? 0 : 1)
