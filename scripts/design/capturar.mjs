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
// Uso:
//   node scripts/design/capturar.mjs --saida docs/f40-evidencias/antes
//   node scripts/design/capturar.mjs --saida docs/f40-evidencias/depois --rotas /ativos,/ativos/novo
//
// ============================================================================
// A TRAVA, E ELA É ABSOLUTA
// ============================================================================
// A regra 2 do `CLAUDE.md` proíbe dado real em screenshot — nome de colaborador,
// patrimônio, linha de planilha da WAP. E o `.env.local` deste repositório
// aponta para o ref de PRODUÇÃO. Então este script RECUSA subir contra produção,
// e a recusa é do script, não do operador: quem esquece de trocar o `.env` não
// descobre pelo Word, descobre aqui.
//
// Para fotografar é preciso um ambiente apontando para um projeto de ENSAIO com
// dados fictícios (`npm run db:seed`). Sem ele, não há fotos — e isso é uma
// pendência honesta, não uma falha.
// ============================================================================

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** O ref do projeto Supabase de PRODUÇÃO. Fotografá-lo é proibido. */
const REF_PRODUCAO = 'pbtjcalbmepmrqzprusb'

/** As três larguras da conferência (plano §6, item 6). */
const LARGURAS = [
  { nome: '375', width: 375, height: 812 },
  { nome: '1280', width: 1280, height: 900 },
  { nome: '1920', width: 1920, height: 1080 },
]

/** Os dois temas. `next-themes` guarda a escolha em `localStorage.theme`. */
const TEMAS = ['light', 'dark']

/** As rotas do piloto. As frentes seguintes acrescentam as suas. */
const ROTAS_PADRAO = ['/ativos', '/ativos/novo']

function argumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : padrao
}

/**
 * Lê o `NEXT_PUBLIC_SUPABASE_URL` de um arquivo de ambiente, sem carregá-lo.
 *
 * De propósito NÃO usa `dotenv` nem `process.env`: o ponto é inspecionar o
 * arquivo que o `next dev` VAI usar, antes de qualquer coisa subir.
 */
function refDoAmbiente(arquivo) {
  const caminho = join(RAIZ, arquivo)
  if (!existsSync(caminho)) return null
  const m = /^NEXT_PUBLIC_SUPABASE_URL=\s*"?https:\/\/([a-z0-9]+)\.supabase\.co/m.exec(
    readFileSync(caminho, 'utf8'),
  )
  return m ? m[1] : null
}

function abortar(motivo) {
  console.error(`\n✋ ${motivo}\n`)
  process.exit(2)
}

async function main() {
  const saida = argumento('saida', 'docs/f40-evidencias/captura')
  const base = argumento('base', 'http://localhost:3000')
  const ambiente = argumento('env', '.env.local')
  const rotas = argumento('rotas', ROTAS_PADRAO.join(',')).split(',').filter(Boolean)

  // --- A TRAVA -------------------------------------------------------------
  const ref = refDoAmbiente(ambiente)
  if (!ref) {
    abortar(
      `Não consegui ler o NEXT_PUBLIC_SUPABASE_URL de ${ambiente}. Sem saber contra ` +
        `qual banco o servidor vai subir, não fotografo nada.`,
    )
  }
  if (ref === REF_PRODUCAO) {
    abortar(
      `${ambiente} aponta para PRODUÇÃO (${ref}). A regra 2 do CLAUDE.md proíbe dado ` +
        `real em screenshot, e este script não a contorna.\n\n` +
        `   Crie um arquivo de ambiente apontando para o projeto de ENSAIO, rode\n` +
        `   \`npm run db:seed\` contra ele, suba o \`next dev\` com esse arquivo e\n` +
        `   repita com \`--env .env.ensaio\`.`,
    )
  }
  console.log(`✔ ambiente ${ambiente} → ref ${ref} (não é produção)`)

  // --- O Playwright, só depois da trava ------------------------------------
  const { chromium } = await import('playwright')
  const dir = join(RAIZ, saida)
  mkdirSync(dir, { recursive: true })

  const navegador = await chromium.launch()
  let n = 0
  try {
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
  }
  console.log(`\n✔ ${n} imagens em ${saida}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
