#!/usr/bin/env node
// FOTOGRAFAR AS TELAS — a única classe de defeito que o teste de consistência
// não consegue provar sozinho (F40, plano §6.1).
//
// `src/lib/layout/consistencia.test.ts` pega CLASSE errada; ele não pega
// ELEMENTO QUE MUDA DE LUGAR SEM MUDAR DE CLASSE. O repositório irmão fechou
// esse buraco com Playwright — 156 imagens por passada — e foi assim que
// descobriu, num monitor de 1920px, um defeito que nenhuma das 104 imagens
// anteriores mostrava.
//
// Ferramenta de DEV. Não é feature, não roda em CI, não toca banco.
//
// Uso (o `--ref-esperado` é obrigatório — ver A TRAVA, abaixo):
//   node scripts/design/capturar.mjs --env .env.ensaio --ref-esperado <ref> \
//     --saida docs/f40-evidencias/antes
//   node scripts/design/capturar.mjs --env .env.ensaio --ref-esperado <ref> \
//     --saida docs/f40-evidencias/depois --rotas /ativos,/ativos/novo
//
// ============================================================================
// A TRAVA, E ELA É ABSOLUTA — porque agora tranca o SERVIDOR, não só o ARQUIVO
// ============================================================================
// A regra 2 do `CLAUDE.md` proíbe dado real em screenshot — nome de colaborador,
// patrimônio, linha de planilha da WAP. E o `.env.local` deste repositório
// aponta para o ref de PRODUÇÃO. Então este script RECUSA fotografar produção,
// e a recusa é do script, não do operador.
//
// ⚠ ATÉ A REVISÃO DE 31/08/2026 ELA ERA CONSELHO, NÃO TRAVA. O script lia o ref
// de um ARQUIVO (`--env`) e fotografava o que estivesse em `--base` — um
// `next dev` que já estivesse no ar, apontando para qualquer coisa. Com o
// servidor de produção de pé em localhost:3000 (o padrão deste repositório),
// `--env .env.ensaio` lia o ref de ensaio, imprimia "não é produção" e
// fotografava PRODUÇÃO. Uma trava que se chama ABSOLUTA e é conselho é pior que
// nenhuma, porque quem confia nela para de conferir. Duas mudanças fecham isso:
//
//   1. `--ref-esperado` é OBRIGATÓRIO. O operador digita para qual projeto
//      espera apontar, e o script confere arquivo === digitado === (não é
//      produção). Deixou de depender de o único ref proibido estar cravado aqui.
//   2. `--base` MORREU. O script sobe o PRÓPRIO `next dev`, com as variáveis do
//      arquivo já validado injetadas no processo filho — nunca mais fotografa um
//      servidor de terceiros cujo banco ninguém aqui conferiu.
//
// A garantia de (2) é documentada: o `@next/env` só define uma variável se ela
// ainda NÃO existe em `process.env` (a ordem é process.env → .env.*.local →
// .env.local → .env), então o que o pai injeta vence o `.env.local` do disco.
// Conferido na doc oficial do Next ("Environment Variable Load Order") em
// 31/08/2026, como manda a regra 6 do CLAUDE.md.
//
// Para fotografar é preciso um ambiente apontando para um projeto de ENSAIO com
// dados fictícios (`npm run db:seed`). Sem ele, não há fotos — e isso é uma
// pendência honesta, não uma falha.
// ============================================================================

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import { spawn, spawnSync } from 'node:child_process'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * O ref do projeto Supabase de PRODUÇÃO. Fotografá-lo é proibido.
 *
 * NÃO é segredo: é a mesma string que sai em `NEXT_PUBLIC_SUPABASE_URL` — pública
 * por definição do prefixo, o navegador de todo usuário já fala com essa URL — e
 * já está em texto puro em `docs/DECISOES.md`. Cravar aqui é atalho, não
 * vazamento. E sozinho NÃO basta: só pega o ref que alguém lembrou de escrever.
 * Quem fecha o buraco é o `--ref-esperado` obrigatório.
 */
const REF_PRODUCAO = 'pbtjcalbmepmrqzprusb'

/** As três larguras da conferência (plano §6, item 6). */
const LARGURAS = [
  { nome: '375', width: 375, height: 812 },
  { nome: '1280', width: 1280, height: 900 },
  { nome: '1920', width: 1920, height: 1080 },
]

/** Os dois temas. `next-themes` guarda a escolha em `localStorage.theme`. */
const TEMAS = ['light', 'dark']

/**
 * As rotas JÁ MIGRADAS para o casco. As frentes seguintes acrescentam as suas.
 *
 * ⚠ F42 — as três rotas de item entraram aqui SEM que o script tenha rodado, e a
 * decisão está em `docs/DECISOES.md` (31/08/2026): este repositório não tem
 * `.env.ensaio`, e o `.env.local` aponta para PRODUÇÃO — fotografar por ele
 * gravaria nome de colaborador e patrimônio real em PNG dentro do repo, contra a
 * regra 2 do `CLAUDE.md`. A constante fica correta para quem tiver o ambiente
 * amanhã fotografar sem precisar reabrir a decisão.
 */
const ROTAS_PADRAO = [
  '/ativos',
  '/ativos/novo',
  '/itens',
  '/itens/historico',
  '/itens/conferencia',
]

function argumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : padrao
}

/**
 * Lê o ambiente INTEIRO do arquivo, sem carregá-lo no processo atual.
 *
 * De propósito NÃO usa `dotenv` nem mexe no `process.env` deste script: o ponto é
 * inspecionar o arquivo ANTES de qualquer coisa subir — e depois injetá-lo, já
 * validado, no `next dev` filho. Parser simples de `CHAVE=valor` por linha, com
 * aspas opcionais em volta, que é o formato dos `.env*` deste repositório.
 */
function carregarEnv(arquivo) {
  const caminho = join(RAIZ, arquivo)
  if (!existsSync(caminho)) return null
  const vars = {}
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(linha.trim())
    if (m) vars[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
  return vars
}

function refDoAmbiente(vars) {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(vars?.NEXT_PUBLIC_SUPABASE_URL ?? '')
  return m ? m[1] : null
}

/**
 * Uma porta livre de verdade — para não colidir com um `next dev` que já esteja
 * no ar (que é, aliás, exatamente o servidor que este script não quer usar).
 */
function portaLivre() {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

/**
 * Sobe o `next dev` DESTE script, contra o ambiente que a trava já aprovou.
 *
 * As variáveis do arquivo entram por CIMA do ambiente herdado, e é isso que dá a
 * garantia: o `@next/env` só define o que ainda não existe em `process.env`, de
 * modo que o `.env.local` do disco (que aponta para produção) não tem como
 * vencer o que o pai injetou. Ver o bloco da TRAVA, no topo.
 */
function subirServidor(envDoArquivo, porta) {
  const binNext = join(RAIZ, 'node_modules', 'next', 'dist', 'bin', 'next')
  return spawn(process.execPath, [binNext, 'dev', '--port', String(porta)], {
    cwd: RAIZ,
    env: { ...process.env, ...envDoArquivo },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function esperarServidor(base, processo, timeoutMs = 120_000) {
  const inicio = Date.now()
  while (Date.now() - inicio < timeoutMs) {
    if (processo.exitCode !== null) {
      throw new Error(`o next dev caiu antes de responder (código ${processo.exitCode}).`)
    }
    try {
      await fetch(`${base}/login`)
      return
    } catch {
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  throw new Error(`o next dev não respondeu em ${timeoutMs / 1000}s.`)
}

function pararServidor(processo) {
  if (processo.exitCode !== null) return
  if (process.platform === 'win32') {
    // O Turbopack sobe filhos; matar só o PID do `spawn` deixa órfão escutando a
    // porta. `/t` mata a árvore inteira.
    spawnSync('taskkill', ['/pid', String(processo.pid), '/t', '/f'])
  } else {
    processo.kill('SIGTERM')
  }
}

function abortar(motivo) {
  console.error(`\n✋ ${motivo}\n`)
  process.exit(2)
}

async function main() {
  const saida = argumento('saida', 'docs/f40-evidencias/captura')
  const ambiente = argumento('env', '.env.local')
  const refEsperado = argumento('ref-esperado', null)
  const rotas = argumento('rotas', ROTAS_PADRAO.join(',')).split(',').filter(Boolean)

  if (argumento('base', null)) {
    abortar(
      '`--base` foi removido. Apontar para "o servidor que já estiver no ar" era exatamente ' +
        'o buraco desta trava: ela conferia o arquivo e fotografava outra coisa. O script ' +
        'agora sobe o próprio `next dev` com o ambiente que ele mesmo validou — não há mais ' +
        'base para escolher.',
    )
  }

  // --- A TRAVA -------------------------------------------------------------
  if (!refEsperado) {
    abortar(
      '`--ref-esperado` é obrigatório. Não fotografo contra "o que o arquivo disser" sem ' +
        'você TER DIGITADO para qual projeto está apontando — cole o ref do projeto de ' +
        'ENSAIO (Project Settings → General).',
    )
  }
  const envDoArquivo = carregarEnv(ambiente)
  const ref = refDoAmbiente(envDoArquivo)
  if (!ref) {
    abortar(
      `Não consegui ler o NEXT_PUBLIC_SUPABASE_URL de ${ambiente}. Sem saber contra ` +
        `qual banco o servidor vai subir, não fotografo nada.`,
    )
  }
  if (ref !== refEsperado) {
    abortar(
      `${ambiente} aponta para ${ref}, e você pediu --ref-esperado ${refEsperado}. Os dois ` +
        `têm de bater — ou o arquivo está errado, ou o ref esperado está.`,
    )
  }
  if (ref === REF_PRODUCAO || refEsperado === REF_PRODUCAO) {
    abortar(
      `${ambiente} aponta para PRODUÇÃO (${REF_PRODUCAO}). A regra 2 do CLAUDE.md proíbe ` +
        `dado real em screenshot, e este script não a contorna — nem quando o ` +
        `--ref-esperado pede a mesma coisa.\n\n` +
        `   Crie um arquivo de ambiente apontando para o projeto de ENSAIO, rode\n` +
        `   \`npm run db:seed\` contra ele e repita com\n` +
        `   \`--env .env.ensaio --ref-esperado <ref-do-ensaio>\`.`,
    )
  }
  console.log(`✔ ${ambiente} → ref ${ref}, conferido com o que você digitou e não é produção`)

  // --- O SERVIDOR, subido por ESTE script ----------------------------------
  const porta = Number(argumento('porta', '0')) || (await portaLivre())
  const base = `http://localhost:${porta}`
  console.log(`… subindo o next dev em ${base} com ${ambiente}`)
  const servidor = subirServidor(envDoArquivo, porta)

  // --- O Playwright, só depois da trava E do servidor no ar -----------------
  const { chromium } = await import('playwright')
  const dir = join(RAIZ, saida)
  mkdirSync(dir, { recursive: true })

  const navegador = await chromium.launch()
  let n = 0
  try {
    await esperarServidor(base, servidor)
    for (const largura of LARGURAS) {
      for (const tema of TEMAS) {
        const contexto = await navegador.newContext({
          viewport: { width: largura.width, height: largura.height },
          colorScheme: tema === 'dark' ? 'dark' : 'light',
          locale: 'pt-BR',
          // `next-themes` lê `localStorage.theme` antes da primeira pintura.
          storageState: {
            cookies: [],
            origins: [
              {
                origin: base,
                localStorage: [{ name: 'theme', value: tema }],
              },
            ],
          },
        })
        const pagina = await contexto.newPage()
        for (const rota of rotas) {
          await pagina.goto(`${base}${rota}`, { waitUntil: 'networkidle' })
          // O esqueleto do `loading.tsx` some quando o conteúdo chega; sem esta
          // espera a foto sai do esqueleto, não da tela.
          await pagina.waitForSelector('[data-casco-da-pagina]', { timeout: 15_000 })
          const nome = `${rota.replace(/\//g, '_') || '_home'}__${largura.nome}__${tema}.png`
          await pagina.screenshot({ path: join(dir, nome), fullPage: true })
          n += 1
          console.log(`  ${nome}`)

          // O que o teste de consistência NÃO enxerga: overflow horizontal.
          const estoura = await pagina.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
          )
          if (estoura) console.warn(`  ⚠ ${rota} @ ${largura.nome}px rola na horizontal`)
        }
        await contexto.close()
      }
    }
  } finally {
    await navegador.close()
    pararServidor(servidor)
  }
  console.log(`\n✔ ${n} imagens em ${saida}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
