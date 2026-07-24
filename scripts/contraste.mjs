#!/usr/bin/env node
// Medidor de contraste WCAG 2.1 dos pares de cor do app (F19).
//
// Ferramenta de DEV — não toca banco, não lê .env, não tem guarda especial.
// Node puro, ZERO dependência (regra 3 do CLAUDE.md: nada novo no package.json).
//
// Por que existe: a revisão de UX de 24/07/2026 reprovou pares de cor "no olho"
// (Δ dos KPIs a 3,22:1, rótulo branco no gráfico a 2,54:1). Corrigir sem MEDIR
// seria trocar um palpite por outro. Este script mede contra as MESMAS fontes que
// o navegador usa:
//   · a paleta do Tailwind v4  → node_modules/tailwindcss/theme.css (oklch)
//   · os tokens do app         → src/app/globals.css (:root e .dark, oklch)
// Nada de valor hard-coded: mudou o token, muda a medição.
//
// Uso:
//   node scripts/contraste.mjs                → tabela markdown de todos os pares
//   node scripts/contraste.mjs --so-reprovado → só o que reprova
//   node scripts/contraste.mjs --json         → saída JSON
//   node scripts/contraste.mjs --par "green-700 sobre card" --tema claro
//
// Sai com código 1 se algum par marcado `exigir: true` reprovar — dá para usar
// como trava em CI se um dia quisermos.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------------------
// 1. Conversão de cor: oklch → sRGB linear → luminância relativa (WCAG)
// ---------------------------------------------------------------------------

// OKLCH → OKLab → LMS → sRGB linear. Matrizes de Björn Ottosson (oklab spec),
// as mesmas que o Chrome usa para resolver `oklch()`.
function oklchParaLinearRgb(L, C, H) {
  const hRad = (H * Math.PI) / 180
  const a = C * Math.cos(hRad)
  const b = C * Math.sin(hRad)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

// sRGB linear → sRGB gamma (0..1), com clamp de gamut.
function gammaEncode(c) {
  const v = Math.min(1, Math.max(0, c))
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

// sRGB gamma (0..1) → linear, definição da WCAG 2.x.
function gammaDecode(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

// Luminância relativa WCAG 2.1 a partir de sRGB gamma 0..1.
function luminancia([r, g, b]) {
  const [rl, gl, bl] = [gammaDecode(r), gammaDecode(g), gammaDecode(b)]
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}

// Razão de contraste WCAG: (L1 + 0.05) / (L2 + 0.05).
function razao(corA, corB) {
  const la = luminancia(corA)
  const lb = luminancia(corB)
  const [claro, escuro] = la >= lb ? [la, lb] : [lb, la]
  return (claro + 0.05) / (escuro + 0.05)
}

// Composição alpha de `frente` sobre `fundo` (ambos sRGB gamma 0..1).
// Feita no espaço GAMMA de propósito: é assim que o navegador compõe camadas
// opacas de CSS (`bg-destructive/10` sobre o card), então é o pixel real.
function compor(frente, fundo, alpha) {
  return frente.map((c, i) => c * alpha + fundo[i] * (1 - alpha))
}

// ---------------------------------------------------------------------------
// 2. Leitura das fontes de cor do projeto
// ---------------------------------------------------------------------------

// `oklch(62.7% 0.194 149.214)` | `oklch(1 0 0)` | `oklch(1 0 0 / 10%)`
const RE_OKLCH = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?)\s*)?\)/i

function parseOklch(texto) {
  const m = RE_OKLCH.exec(texto)
  if (!m) return null
  const L = m[2] === '%' ? Number(m[1]) / 100 : Number(m[1])
  const C = Number(m[3])
  const H = Number(m[4])
  const alpha = m[5] === undefined ? 1 : m[6] === '%' ? Number(m[5]) / 100 : Number(m[5])
  const rgb = oklchParaLinearRgb(L, C, H).map(gammaEncode)
  return { rgb, alpha }
}

function parseHex(texto) {
  const m = /^#([0-9a-f]{6})$/i.exec(texto.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255), alpha: 1 }
}

// Paleta do Tailwind v4 — a MESMA que o build consome.
function lerPaletaTailwind() {
  const css = readFileSync(join(RAIZ, 'node_modules/tailwindcss/theme.css'), 'utf8')
  const paleta = new Map()
  for (const linha of css.split('\n')) {
    const m = /^\s*--color-([a-z]+-\d+|black|white):\s*(.+?);/.exec(linha)
    if (!m) continue
    const valor = m[2].trim()
    const cor = parseOklch(valor) ?? parseHex(valor) ?? corLiteral(valor)
    if (cor) paleta.set(m[1], cor)
  }
  // `white`/`black` no theme.css do v4 são `#fff`/`#000` (3 dígitos).
  paleta.set('white', { rgb: [1, 1, 1], alpha: 1 })
  paleta.set('black', { rgb: [0, 0, 0], alpha: 1 })
  return paleta
}

function corLiteral(valor) {
  const v = valor.trim().toLowerCase()
  if (v === '#fff' || v === '#ffffff' || v === 'white') return { rgb: [1, 1, 1], alpha: 1 }
  if (v === '#000' || v === '#000000' || v === 'black') return { rgb: [0, 0, 0], alpha: 1 }
  return null
}

// Tokens do app: :root (claro) e .dark (escuro) de globals.css.
function lerTokensApp() {
  const css = readFileSync(join(RAIZ, 'src/app/globals.css'), 'utf8')
  const claro = new Map()
  const escuro = new Map()

  // Recorta os blocos `:root { … }` e `.dark { … }` pelo primeiro `}` da coluna 0
  // (o arquivo é formatado pelo Prettier, então isso é estável).
  function bloco(seletor) {
    const i = css.indexOf(seletor + ' {')
    if (i < 0) return ''
    const fim = css.indexOf('\n}', i)
    return css.slice(i, fim < 0 ? undefined : fim)
  }

  for (const [seletor, alvo] of [
    [':root', claro],
    ['.dark', escuro],
  ]) {
    for (const linha of bloco(seletor).split('\n')) {
      const m = /^\s*--([a-z0-9-]+):\s*(.+?);/.exec(linha)
      if (!m) continue
      const cor = parseOklch(m[2]) ?? parseHex(m[2]) ?? corLiteral(m[2])
      if (cor) alvo.set(m[1], cor)
    }
  }
  // O .dark herda do :root o que não redefine (é assim que a cascata funciona).
  for (const [k, v] of claro) if (!escuro.has(k)) escuro.set(k, v)
  return { claro, escuro }
}

const PALETA = lerPaletaTailwind()
const TOKENS = lerTokensApp()

// Resolve um nome de cor para { rgb, alpha }:
//   'green-700'  → paleta do Tailwind
//   'card'       → token do app no tema pedido (--card)
//   '#eda100'    → hex literal
//   'green-700/50' → com alpha explícito
function resolver(nome, tema) {
  const [base, alphaTxt] = String(nome).split('/')
  const alphaExtra = alphaTxt === undefined ? 1 : Number(alphaTxt) / 100

  let cor = parseHex(base) ?? corLiteral(base)
  if (!cor && PALETA.has(base)) cor = PALETA.get(base)
  if (!cor) {
    const tokens = tema === 'escuro' ? TOKENS.escuro : TOKENS.claro
    if (tokens.has(base)) cor = tokens.get(base)
  }
  if (!cor) throw new Error(`cor desconhecida: "${nome}" (tema ${tema})`)
  return { rgb: cor.rgb, alpha: cor.alpha * alphaExtra }
}

// Achata uma cor (possivelmente translúcida) sobre uma pilha de fundos.
// `fundos` vai do mais próximo ao mais distante; o último precisa ser opaco.
function achatar(nome, fundos, tema) {
  const { rgb, alpha } = resolver(nome, tema)
  if (alpha >= 1) return rgb
  const atras = achatar(fundos[0], fundos.slice(1), tema)
  return compor(rgb, atras, alpha)
}

// ---------------------------------------------------------------------------
// 3. Os pares medidos
// ---------------------------------------------------------------------------
// `texto`/`fundo` são nomes resolvíveis; `sob` é a pilha de superfícies atrás do
// fundo (para fundos translúcidos). `px` e `bold` decidem o limiar WCAG:
// texto grande = ≥24px normal ou ≥18.66px bold → 3:1; o resto → 4.5:1.
// `grafico: true` = elemento gráfico/UI (não texto) → 3:1.

const PARES = [
  // ---- P1-3 · Δ dos KPIs (delta-kpi.ts) --------------------------------------
  { item: 'P1-3', onde: 'Δ KPI verde — ANTES', texto: 'green-600', fundo: 'card', px: 11, antes: true },
  { item: 'P1-3', onde: 'Δ KPI verde — DEPOIS', texto: 'green-700', fundo: 'card', px: 11, exigir: true },
  { item: 'P1-3', onde: 'Δ KPI verde escuro (inalterado)', texto: 'green-400', fundo: 'card', px: 11, tema: 'escuro', exigir: true },
  { item: 'P1-3', onde: 'Δ KPI vermelho (referência)', texto: 'red-600', fundo: 'card', px: 11, exigir: true },
  { item: 'P1-3', onde: 'Δ KPI vermelho escuro (referência)', texto: 'red-400', fundo: 'card', px: 11, tema: 'escuro', exigir: true },

  // ---- P2-8 · fallback das pílulas de tipo (dominio.ts) ----------------------
  { item: 'P2-8', onde: 'pílula fallback — ANTES', texto: 'muted-foreground', fundo: 'muted', px: 11, antes: true },
  { item: 'P2-8', onde: 'pílula fallback — DEPOIS', texto: 'gray-600', fundo: 'gray-200', px: 11, exigir: true },
  { item: 'P2-8', onde: 'pílula fallback — DEPOIS (escuro)', texto: 'gray-400', fundo: 'gray-800', px: 11, tema: 'escuro', exigir: true },

  // ---- Varredura dark: · TIPO_PILL ganhou par escuro (dominio.ts) -----------
  // O tema CLARO não mudou (as três já eram AA); o que passou a existir é o escuro.
  { item: 'dark:', onde: 'pílula Saída (claro, inalterado)', texto: 'amber-800', fundo: 'amber-100', px: 11, exigir: true },
  { item: 'dark:', onde: 'pílula Saída (escuro, NOVO)', texto: 'amber-300', fundo: 'amber-950', px: 11, tema: 'escuro', exigir: true },
  { item: 'dark:', onde: 'pílula Devolução (claro, inalterado)', texto: 'blue-700', fundo: 'blue-100', px: 11, exigir: true },
  { item: 'dark:', onde: 'pílula Devolução (escuro, NOVO)', texto: 'blue-300', fundo: 'blue-950', px: 11, tema: 'escuro', exigir: true },
  // PRÉ-EXISTENTE, medido e NÃO alterado pela F19: `green-700` sobre `green-100`
  // dá 4,4996:1 — reprova por 0,0004. O par é do tema claro, existe desde antes
  // desta ordem em 13 pontos de 11 arquivos (STATUS_META, TIPO_PILL.compra, os 5
  // badges de admin, legendas…) e trocá-lo é varredura de outra ordem. Fica aqui
  // MEDIDO (a tabela mostra o ❌ verdadeiro) mas fora do `exigir`, para o código de
  // saída refletir só o que a F19 assumiu. Correção sugerida: text-green-800 (6,45:1).
  { item: 'dark:', onde: 'pílula Compra (claro, PRÉ-EXISTENTE)', texto: 'green-700', fundo: 'green-100', px: 11, preexistente: true },
  { item: 'dark:', onde: 'pílula Compra (escuro, NOVO)', texto: 'green-300', fundo: 'green-950', px: 11, tema: 'escuro', exigir: true },

  // ---- Varredura dark: · badge "Ativo/Ativa" das 5 telas de admin ------------
  { item: 'dark:', onde: 'badge Ativo admin (claro, PRÉ-EXISTENTE)', texto: 'green-700', fundo: 'green-100', px: 12, preexistente: true },
  { item: 'dark:', onde: 'badge Ativo admin (escuro, NOVO)', texto: 'green-300', fundo: 'green-950', px: 12, tema: 'escuro', exigir: true },

  // ---- Varredura dark: · texto de pendência no dashboard --------------------
  { item: 'dark:', onde: 'pendência dashboard (claro, inalterado)', texto: 'amber-800', fundo: 'card', px: 14, exigir: true },
  { item: 'dark:', onde: 'pendência dashboard (escuro, NOVO)', texto: 'amber-300', fundo: 'card', px: 14, tema: 'escuro', exigir: true },

  // ---- Varredura dark: · callout âmbar (chips do relatório, banner de versão) -
  // No escuro o fundo é `amber-950/40` — translúcido sobre o card. O script compõe.
  { item: 'dark:', onde: 'callout âmbar (claro, inalterado)', texto: 'amber-900', fundo: 'amber-50', px: 12, exigir: true },
  { item: 'dark:', onde: 'callout âmbar (escuro, NOVO)', texto: 'amber-200', fundo: 'amber-950/40', sob: ['card', 'background'], px: 12, tema: 'escuro', exigir: true },

  // ---- P2-7 · rótulo interno do gráfico empilhado ---------------------------
  // As cores das barras são hex FIXOS (STATUS_CHART_COLOR) — valem igual nos dois
  // temas. `antes` = o `fill-white` de 10px que a revisão reprovou.
  { item: 'P2-7', onde: 'rótulo Em estoque — ANTES (branco)', texto: 'white', fundo: '#16a34a', px: 10, antes: true },
  { item: 'P2-7', onde: 'rótulo Em estoque — DEPOIS (preto)', texto: 'black', fundo: '#16a34a', px: 11, exigir: true },
  { item: 'P2-7', onde: 'rótulo Reservado — ANTES (branco)', texto: 'white', fundo: '#7c3aed', px: 10 },
  { item: 'P2-7', onde: 'rótulo Reservado — DEPOIS (branco, mantido)', texto: 'white', fundo: '#7c3aed', px: 11, exigir: true },
  { item: 'P2-7', onde: 'rótulo Em uso — ANTES (branco)', texto: 'white', fundo: '#2a78d6', px: 10, antes: true },
  { item: 'P2-7', onde: 'rótulo Em uso — DEPOIS (preto)', texto: 'black', fundo: '#2a78d6', px: 11, exigir: true },
  { item: 'P2-7', onde: 'rótulo Emprestado — ANTES (branco)', texto: 'white', fundo: '#0891b2', px: 10, antes: true },
  { item: 'P2-7', onde: 'rótulo Emprestado — DEPOIS (preto)', texto: 'black', fundo: '#0891b2', px: 11, exigir: true },
  { item: 'P2-7', onde: 'rótulo Em triagem — ANTES (branco)', texto: 'white', fundo: '#ea580c', px: 10, antes: true },
  { item: 'P2-7', onde: 'rótulo Em triagem — DEPOIS (preto)', texto: 'black', fundo: '#ea580c', px: 11, exigir: true },
  { item: 'P2-7', onde: 'rótulo Em manutenção — ANTES (branco)', texto: 'white', fundo: '#d97706', px: 10, antes: true },
  { item: 'P2-7', onde: 'rótulo Em manutenção — DEPOIS (preto)', texto: 'black', fundo: '#d97706', px: 11, exigir: true },
  { item: 'P2-7', onde: 'rótulo Defasado — ANTES (branco)', texto: 'white', fundo: '#9ca3af', px: 10, antes: true },
  { item: 'P2-7', onde: 'rótulo Defasado — DEPOIS (preto)', texto: 'black', fundo: '#9ca3af', px: 11, exigir: true },

  // ---- P2-12c · anel do destaque `:target` na linha do tempo ----------------
  // Elemento gráfico (anel, não texto) → limiar 3:1. O `amber-400` da 1ª versão
  // sumia no tema CLARO, que é o padrão do app; o token semântico `--warning`
  // passa nos dois E clareia sozinho no `.dark` (dispensa variante `dark:`).
  { item: 'P2-12c', onde: 'anel :target — ANTES (amber-400)', texto: 'amber-400', fundo: 'card', px: 12, grafico: true, antes: true },
  { item: 'P2-12c', onde: 'anel :target — DEPOIS (token warning)', texto: 'warning', fundo: 'card', px: 12, grafico: true, exigir: true },
  { item: 'P2-12c', onde: 'anel :target — DEPOIS (escuro)', texto: 'warning', fundo: 'card', px: 12, tema: 'escuro', grafico: true, exigir: true },

  // ---- Cor de marca sobre o card ESCURO (não mudou; conferência pedida) -----
  // São séries de gráfico = elemento gráfico → limiar 3:1, não 4,5:1.
  { item: 'marca', onde: 'azul WAP sobre card escuro', texto: '#2a78d6', fundo: 'card', tema: 'escuro', px: 12, grafico: true, exigir: true },
  { item: 'marca', onde: 'amarelo WAP sobre card escuro', texto: '#eda100', fundo: 'card', tema: 'escuro', px: 12, grafico: true, exigir: true },
]

// ---------------------------------------------------------------------------
// 4. Execução e saída
// ---------------------------------------------------------------------------

function exigido(par) {
  if (par.grafico) return 3
  const grande = par.px >= 24 || (par.bold && par.px >= 18.66)
  return grande ? 3 : 4.5
}

function medir(par) {
  const tema = par.tema ?? 'claro'
  const superficie = par.sob ?? (tema === 'escuro' ? ['card', 'background'] : ['card', 'background'])
  const fundoRgb = achatar(par.fundo, superficie, tema)
  const textoRgb = achatar(par.texto, [par.fundo, ...superficie], tema)
  const r = razao(textoRgb, fundoRgb)
  const alvo = exigido(par)
  return {
    ...par,
    tema,
    razao: Math.round(r * 100) / 100,
    exigido: alvo,
    passa: r >= alvo,
    nivel: r >= 7 ? 'AAA' : r >= alvo ? 'AA' : 'reprova',
  }
}

function main() {
  const args = process.argv.slice(2)
  const soReprovado = args.includes('--so-reprovado')
  const comoJson = args.includes('--json')

  // Par avulso: --par "<texto> sobre <fundo>" [--tema escuro] [--px 11]
  const iPar = args.indexOf('--par')
  let pares = PARES
  if (iPar >= 0) {
    const m = /^(\S+)\s+sobre\s+(\S+)$/.exec(args[iPar + 1] ?? '')
    if (!m) {
      console.error('uso: --par "<texto> sobre <fundo>"  (ex.: --par "green-700 sobre card")')
      process.exit(2)
    }
    const iTema = args.indexOf('--tema')
    const iPx = args.indexOf('--px')
    pares = [
      {
        item: 'avulso',
        onde: `${m[1]} sobre ${m[2]}`,
        texto: m[1],
        fundo: m[2],
        px: iPx >= 0 ? Number(args[iPx + 1]) : 11,
        tema: iTema >= 0 ? args[iTema + 1] : 'claro',
      },
    ]
  }

  let linhas = pares.map(medir)
  if (soReprovado) linhas = linhas.filter((l) => !l.passa)

  if (comoJson) {
    console.log(JSON.stringify(linhas, null, 2))
  } else {
    console.log('| Item | Par | Tema | Texto | Fundo | Razão | Exigido | Veredito |')
    console.log('|---|---|---|---|---|---:|---:|---|')
    for (const l of linhas) {
      const veredito = l.passa
        ? l.nivel === 'AAA'
          ? '✅ AAA'
          : '✅ AA'
        : l.preexistente
          ? '❌ reprova (pré-existente — backlog)'
          : '❌ reprova'
      console.log(
        `| ${l.item} | ${l.onde} | ${l.tema} | \`${l.texto}\` | \`${l.fundo}\` | ${l.razao.toFixed(2)}:1 | ${l.exigido}:1 | ${veredito} |`,
      )
    }
  }

  // Só os pares marcados `exigir` travam a saída — os `antes: true` são o
  // registro do defeito e reprovam de propósito.
  const falhas = linhas.filter((l) => l.exigir && !l.passa)
  if (falhas.length > 0) {
    console.error(`\n${falhas.length} par(es) exigido(s) REPROVAM.`)
    process.exit(1)
  }
}

main()
