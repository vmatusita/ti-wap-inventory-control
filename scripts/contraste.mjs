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
  // F19-pós — o par verde era o mais fraco da família: `green-700` sobre
  // `green-100` dá 4,4996:1, reprovando AA por 0,0004. Era PRÉ-EXISTENTE (12
  // pontos em 10 arquivos) e ficou fora do escopo da F19 até o Johnny pedir. Só o
  // verde desceu para `-800`: os irmãos foram medidos e passam (ver a família logo
  // abaixo), então mexer neles seria trocar tinta sem ganho.
  { item: 'verde', onde: 'badge/pílula verde — ANTES', texto: 'green-700', fundo: 'green-100', px: 11, antes: true },
  { item: 'verde', onde: 'badge/pílula verde — DEPOIS', texto: 'green-800', fundo: 'green-100', px: 11, exigir: true },
  { item: 'verde', onde: 'badge/pílula verde — escuro (inalterado)', texto: 'green-300', fundo: 'green-950', px: 11, tema: 'escuro', exigir: true },

  // A FAMÍLIA inteira, medida para provar que só o verde precisava mudar.
  { item: 'família', onde: 'Reservado (violeta)', texto: 'violet-700', fundo: 'violet-100', px: 11, exigir: true },
  { item: 'família', onde: 'Em uso (azul)', texto: 'blue-700', fundo: 'blue-100', px: 11, exigir: true },
  { item: 'família', onde: 'Emprestado (ciano)', texto: 'cyan-700', fundo: 'cyan-100', px: 11, exigir: true },
  // O laranja da triagem saiu do badge na F32 (virou rosa, ver o bloco F32 no fim
  // do arquivo). A linha fica como registro do matiz aposentado — ela passa, e
  // apagá-la esconderia de onde o rosa veio.
  { item: 'família', onde: 'Em triagem (laranja — aposentado na F32)', texto: 'orange-700', fundo: 'orange-100', px: 11, exigir: true },
  { item: 'família', onde: 'Em manutenção (âmbar)', texto: 'amber-800', fundo: 'amber-100', px: 11, exigir: true },
  { item: 'família', onde: 'Descartado (cinza)', texto: 'gray-600', fundo: 'gray-200', px: 11, exigir: true },
  { item: 'família', onde: 'Devolvido ao fornecedor (slate)', texto: 'slate-700', fundo: 'slate-200', px: 11, exigir: true },
  { item: 'família', onde: 'Troca (teal)', texto: 'teal-700', fundo: 'teal-100', px: 11, exigir: true },
  { item: 'dark:', onde: 'pílula Compra (escuro, NOVO)', texto: 'green-300', fundo: 'green-950', px: 11, tema: 'escuro', exigir: true },

  // ---- Varredura dark: · badge "Ativo/Ativa" das 5 telas de admin ------------
  { item: 'dark:', onde: 'badge Ativo admin (escuro, NOVO)', texto: 'green-300', fundo: 'green-950', px: 12, tema: 'escuro', exigir: true },

  // ---- Varredura dark: · texto de pendência no dashboard --------------------
  { item: 'dark:', onde: 'pendência dashboard (claro, inalterado)', texto: 'amber-800', fundo: 'card', px: 14, exigir: true },
  { item: 'dark:', onde: 'pendência dashboard (escuro, NOVO)', texto: 'amber-300', fundo: 'card', px: 14, tema: 'escuro', exigir: true },

  // ---- Varredura dark: · callout âmbar (chips do relatório, banner de versão) -
  // No escuro o fundo é `amber-950/40` — translúcido sobre o card. O script compõe.
  { item: 'dark:', onde: 'callout âmbar (claro, inalterado)', texto: 'amber-900', fundo: 'amber-50', px: 12, exigir: true },
  { item: 'dark:', onde: 'callout âmbar (escuro, NOVO)', texto: 'amber-200', fundo: 'amber-950/40', sob: ['card', 'background'], px: 12, tema: 'escuro', exigir: true },

  // ---- F28/PND-06 · aviso da semântica invertida na mesa de conflitos -------
  // "Marque o cadastro ERRADO" é a frase que impede alguém de apagar o cadastro
  // certo. Nasceu em `text-destructive` sobre `bg-destructive/10` e a revisão
  // adversarial da F28 mediu 3,99:1 no claro — reprova (font-medium não é bold,
  // então o limiar é 4,5:1, não 3:1). Passou para a família do callout âmbar.
  { item: 'F28', onde: 'aviso da mesa de conflitos — ANTES', texto: 'destructive', fundo: 'destructive/10', px: 14 },
  { item: 'F28', onde: 'aviso da mesa de conflitos — DEPOIS', texto: 'red-900', fundo: 'red-50', px: 14, exigir: true },
  { item: 'F28', onde: 'aviso da mesa de conflitos — DEPOIS (escuro)', texto: 'red-200', fundo: 'red-950/40', sob: ['card', 'background'], px: 14, tema: 'escuro', exigir: true },

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

  // =========================================================================
  // F29/UXG-07 — os pares que o script NUNCA tinha medido.
  //
  // Até aqui a lista cobria só o que revisões passadas TOCARAM: nasceu como prova
  // de correção, não como varredura. Ficavam de fora justamente os pares mais
  // usados do app — o texto secundário de toda tela, todo botão primário, o header
  // inteiro — e metade da família de pílulas no tema escuro. Com o script entrando
  // no CI, medir só o que já foi corrigido seria um portão que não guarda nada.
  //
  // TODOS os pares abaixo foram medidos ANTES de receber `exigir: true` — nenhum
  // reprovou, então nenhum vira known-fail. O valor de registrá-los é o futuro:
  // mexer num token agora quebra o CI em vez de degradar a leitura em silêncio.
  // =========================================================================

  // ---- Pílulas: o tema ESCURO da família (o claro já estava medido acima) ----
  // A F19 mediu o par escuro de amber/blue/green; violet, cyan, orange, slate e teal
  // ganharam variante `dark:` no mesmo lote e nunca foram para a régua.
  { item: 'F29', onde: 'pílula Reservado (violeta, escuro)', texto: 'violet-300', fundo: 'violet-950', px: 11, tema: 'escuro', exigir: true },
  { item: 'F29', onde: 'pílula Emprestado (ciano, escuro)', texto: 'cyan-300', fundo: 'cyan-950', px: 11, tema: 'escuro', exigir: true },
  { item: 'F29', onde: 'pílula Em triagem (laranja, escuro — aposentado na F32)', texto: 'orange-300', fundo: 'orange-950', px: 11, tema: 'escuro', exigir: true },
  { item: 'F29', onde: 'pílula Devolvido ao fornecedor (slate, escuro)', texto: 'slate-300', fundo: 'slate-950', px: 11, tema: 'escuro', exigir: true },
  { item: 'F29', onde: 'pílula Troca (teal, escuro)', texto: 'teal-300', fundo: 'teal-950', px: 11, tema: 'escuro', exigir: true },

  // ---- `muted-foreground` × `background`: o texto MAIS usado do sistema --------
  // Subtítulo, legenda, célula secundária de tabela, contagem de filtro. Passa por
  // pouco no claro (4,73:1 contra o mínimo de 4,5:1), e é exatamente por isso que
  // precisa de trava: qualquer clareada no token derruba metade da interface.
  { item: 'F29', onde: 'texto secundário (claro)', texto: 'muted-foreground', fundo: 'background', sob: ['background'], px: 14, exigir: true },
  { item: 'F29', onde: 'texto secundário (escuro)', texto: 'muted-foreground', fundo: 'background', sob: ['background'], px: 14, tema: 'escuro', exigir: true },
  // O mesmo texto sobre CARD (a superfície mais comum depois do fundo da página).
  { item: 'F29', onde: 'texto secundário sobre card (claro)', texto: 'muted-foreground', fundo: 'card', px: 14, exigir: true },
  { item: 'F29', onde: 'texto secundário sobre card (escuro)', texto: 'muted-foreground', fundo: 'card', px: 14, tema: 'escuro', exigir: true },

  // ---- `primary` × `primary-foreground`: TODO botão primário do app ----------
  { item: 'F29', onde: 'botão primário (claro)', texto: 'primary-foreground', fundo: 'primary', px: 14, exigir: true },
  { item: 'F29', onde: 'botão primário (escuro)', texto: 'primary-foreground', fundo: 'primary', px: 14, tema: 'escuro', exigir: true },

  // ---- O header escuro da marca (mesmo pixel nos dois temas) -----------------
  // `--brand-dark` e `--brand-amarelo` NÃO são redefinidos no `.dark`: o chrome é
  // escuro por design. Um par só, portanto, vale para os dois temas.
  { item: 'F29', onde: 'amarelo WAP sobre o header escuro', texto: 'brand-amarelo', fundo: 'brand-dark', px: 14, exigir: true },
  { item: 'F29', onde: 'chip "WAP" — preto sobre o amarelo da marca', texto: 'black', fundo: 'brand-amarelo', px: 12, bold: true, exigir: true },
  { item: 'F29', onde: 'branco sobre o header escuro', texto: 'white', fundo: 'brand-dark', px: 14, exigir: true },
  // O texto atenuado do chrome escuro: aba inativa do visualizador, subtítulo das
  // telas de autenticação, rótulo da sessão por senha.
  { item: 'F29', onde: 'texto atenuado do chrome escuro (70%)', texto: 'white/70', fundo: 'brand-dark', px: 14, exigir: true },
  { item: 'F29', onde: 'texto atenuado do chrome escuro (80%)', texto: 'white/80', fundo: 'brand-dark', px: 12, exigir: true },
  // A tecla de atalho no header (`kbd`): branco sobre um véu de 10% que se compõe
  // com o header. Fundo TRANSLÚCIDO — daí o `sob`.
  { item: 'F29', onde: 'kbd "Ctrl K" no header', texto: 'white', fundo: 'white/10', sob: ['brand-dark'], px: 10, bold: true, exigir: true },

  // =========================================================================
  // F32/RV-02 — a paleta de status vira a LÍNGUA da página inteira.
  //
  // Três matizes trocados por medição (análise de 10/08 §4). Aqui entram os dois
  // pares de BADGE novos (o rosa da triagem) e os SEIS hex de gráfico contra o
  // card, nos dois temas — porque desde a F32 esses hex não pintam só o segmento
  // empilhado: pintam o acento de 3px do KPI tile, a barra do acervo, a linha da
  // evolução e o swatch do glossário. Um token que degrade agora degrada em
  // quatro superfícies de uma vez, e o portão precisa enxergar isso.
  //
  // `defasado` #9ca3af fica FORA da régua de propósito: é o cinza deliberado de
  // de-ênfase (croma 0,019), não uma categoria "viva" — quem carrega o sentido
  // dele é o rótulo, não a cor (análise §4).
  // =========================================================================
  // Os dois pares do chip de janela do card (RV-04), a 11px. O ramo "foto"
  // nasceu com `muted-foreground` sobre `muted` — 4,34:1, o MESMO par que o
  // P2-8 acima já registra como defeito conhecido — e a revisão adversarial da
  // fase o pegou. Entram no portão para a troca não se desfazer sozinha.
  { item: 'F32', onde: 'chip "foto de dd/MM" (claro)', texto: 'gray-600', fundo: 'gray-200', px: 11, exigir: true },
  { item: 'F32', onde: 'chip "foto de dd/MM" (escuro)', texto: 'gray-400', fundo: 'gray-800', px: 11, tema: 'escuro', exigir: true },
  { item: 'F32', onde: 'chip "dd/MM – dd/MM" (claro)', texto: 'blue-700', fundo: 'blue-100', px: 11, exigir: true },
  { item: 'F32', onde: 'chip "dd/MM – dd/MM" (escuro)', texto: 'blue-300', fundo: 'blue-950', px: 11, tema: 'escuro', exigir: true },

  // O rótulo "no limite" do micro-medidor (RV-09) — o canal de TEXTO que separa
  // 'limite' de 'folga' sem depender de cor (âmbar-600 e verde-600 viram o mesmo
  // cinza no papel P&B). 10px, então o limiar é o de texto pequeno.
  { item: 'F32', onde: 'rótulo "no limite" do medidor (claro)', texto: 'amber-700', fundo: 'card', px: 10, exigir: true },
  { item: 'F32', onde: 'rótulo "no limite" do medidor (escuro)', texto: 'amber-400', fundo: 'card', px: 10, tema: 'escuro', exigir: true },

  { item: 'F32', onde: 'badge Em triagem (rosa, claro — NOVO)', texto: 'pink-700', fundo: 'pink-100', px: 11, exigir: true },
  { item: 'F32', onde: 'badge Em triagem (rosa, escuro — NOVO)', texto: 'pink-300', fundo: 'pink-950', px: 11, tema: 'escuro', exigir: true },

  // Os hex de gráfico contra a superfície do card. Limiar de elemento gráfico (3:1).
  { item: 'F32', onde: 'segmento Em estoque (verde) sobre card', texto: '#16a34a', fundo: 'card', px: 12, grafico: true, exigir: true },
  { item: 'F32', onde: 'segmento Em estoque (verde) sobre card escuro', texto: '#16a34a', fundo: 'card', px: 12, tema: 'escuro', grafico: true, exigir: true },
  { item: 'F32', onde: 'segmento Em triagem (rosa) sobre card', texto: '#db2777', fundo: 'card', px: 12, grafico: true, exigir: true },
  { item: 'F32', onde: 'segmento Em manutenção (âmbar) sobre card', texto: '#d97706', fundo: 'card', px: 12, grafico: true, exigir: true },
  { item: 'F32', onde: 'segmento Em manutenção (âmbar) sobre card escuro', texto: '#d97706', fundo: 'card', px: 12, tema: 'escuro', grafico: true, exigir: true },

  // Os dois pares que ficam ABAIXO do piso — e por que isso é legal aqui.
  // A regra de alívio da análise §4: o segmento nunca depende da cor sozinha —
  // ele tem rótulo de valor dentro (fill preto/branco escolhido por luminância
  // medida, `fillRotuloSegmento`), total na ponta, legenda com o nome escrito e
  // tooltip. Quatro canais de texto. Registrar o número é melhor do que fingir
  // que ele passa OU do que deixar o par fora da lista.
  { item: 'F32', onde: 'segmento Emprestado (ciano) sobre card', texto: '#06b6d4', fundo: 'card', px: 12, grafico: true, alivio: true },
  { item: 'F32', onde: 'segmento Reservado (violeta) sobre card escuro', texto: '#6d28d9', fundo: 'card', px: 12, tema: 'escuro', grafico: true, alivio: true },
  // O mesmo violeta no tema CLARO passa com folga — é o escuro que aperta.
  { item: 'F32', onde: 'segmento Reservado (violeta) sobre card', texto: '#6d28d9', fundo: 'card', px: 12, grafico: true, exigir: true },
  { item: 'F32', onde: 'segmento Emprestado (ciano) sobre card escuro', texto: '#06b6d4', fundo: 'card', px: 12, tema: 'escuro', grafico: true, exigir: true },

  // =========================================================================
  // F40 — AS NOVE FAMÍLIAS DE SELO, agora medidas pelo TOKEN.
  //
  // Até aqui a régua media uma LISTA de pares de paleta crua, e a cor morava em
  // 555 classes espalhadas por 60 arquivos: `emerald` (11 ocorrências em uso) e
  // `sky` (4) não tinham par nenhum aqui, e ninguém acusava. Com `STATUS_META`,
  // `TIPO_PILL` e `PILL_NEUTRA` falando por `--selo-<familia>`, o medidor passa a
  // ler o MESMO endereço que a tela usa — e o `resolver()` de sempre dá conta,
  // sem uma linha nova de código.
  //
  // AS RAZÕES TÊM DE SAIR IDÊNTICAS ÀS DOS PARES DE PALETA LOGO ACIMA, na mesma
  // casa decimal: é ISSO que prova que a migração não mudou cor nenhuma. Os pares
  // crus ficam no arquivo, como referência, até a frente que consumir cada
  // família encerrar (plano §4.3).
  //
  // 11px porque é o tamanho em que o badge é renderizado — o mesmo dos pares de
  // paleta correspondentes.
  // =========================================================================
  { item: 'F40', onde: 'selo Em estoque (claro)', texto: 'selo-em-estoque-texto', fundo: 'selo-em-estoque', px: 11, exigir: true },
  { item: 'F40', onde: 'selo Em estoque (escuro)', texto: 'selo-em-estoque-texto', fundo: 'selo-em-estoque', px: 11, tema: 'escuro', exigir: true },
  { item: 'F40', onde: 'selo Reservado (claro)', texto: 'selo-reservado-texto', fundo: 'selo-reservado', px: 11, exigir: true },
  { item: 'F40', onde: 'selo Reservado (escuro)', texto: 'selo-reservado-texto', fundo: 'selo-reservado', px: 11, tema: 'escuro', exigir: true },
  { item: 'F40', onde: 'selo Em uso (claro)', texto: 'selo-em-uso-texto', fundo: 'selo-em-uso', px: 11, exigir: true },
  { item: 'F40', onde: 'selo Em uso (escuro)', texto: 'selo-em-uso-texto', fundo: 'selo-em-uso', px: 11, tema: 'escuro', exigir: true },
  { item: 'F40', onde: 'selo Emprestado (claro)', texto: 'selo-emprestado-texto', fundo: 'selo-emprestado', px: 11, exigir: true },
  { item: 'F40', onde: 'selo Emprestado (escuro)', texto: 'selo-emprestado-texto', fundo: 'selo-emprestado', px: 11, tema: 'escuro', exigir: true },
  { item: 'F40', onde: 'selo Em triagem (claro)', texto: 'selo-em-triagem-texto', fundo: 'selo-em-triagem', px: 11, exigir: true },
  { item: 'F40', onde: 'selo Em triagem (escuro)', texto: 'selo-em-triagem-texto', fundo: 'selo-em-triagem', px: 11, tema: 'escuro', exigir: true },
  { item: 'F40', onde: 'selo Em manutenção (claro)', texto: 'selo-em-manutencao-texto', fundo: 'selo-em-manutencao', px: 11, exigir: true },
  { item: 'F40', onde: 'selo Em manutenção (escuro)', texto: 'selo-em-manutencao-texto', fundo: 'selo-em-manutencao', px: 11, tema: 'escuro', exigir: true },
  { item: 'F40', onde: 'selo Descartado (claro)', texto: 'selo-descartado-texto', fundo: 'selo-descartado', px: 11, exigir: true },
  { item: 'F40', onde: 'selo Descartado (escuro)', texto: 'selo-descartado-texto', fundo: 'selo-descartado', px: 11, tema: 'escuro', exigir: true },
  { item: 'F40', onde: 'selo Devolvido ao fornecedor (claro)', texto: 'selo-devolvido-fornecedor-texto', fundo: 'selo-devolvido-fornecedor', px: 11, exigir: true },
  { item: 'F40', onde: 'selo Devolvido ao fornecedor (escuro)', texto: 'selo-devolvido-fornecedor-texto', fundo: 'selo-devolvido-fornecedor', px: 11, tema: 'escuro', exigir: true },
  { item: 'F40', onde: 'selo Troca (claro)', texto: 'selo-troca-texto', fundo: 'selo-troca', px: 11, exigir: true },
  { item: 'F40', onde: 'selo Troca (escuro)', texto: 'selo-troca-texto', fundo: 'selo-troca', px: 11, tema: 'escuro', exigir: true },

  // ---- F40 · as TRÊS intenções do <Aviso> (layout/aviso.tsx) ---------------
  // O bloco de alerta tinha >= 8 anatomias e nenhum componente. Agora tem três,
  // e as três estão na régua ANTES de a primeira tela usá-las.
  //
  // O par "erro — ANTES" é o rascunho do plano (§3.6), que trazia um véu
  // `bg-destructive/5` atrás do texto: ele REPROVA por 0,14, e é por isso que o
  // componente não tem fundo na intenção de erro. Fica registrado para que
  // ninguém "melhore" o Aviso pondo o véu de volta.
  { item: 'F40', onde: 'Aviso erro — o véu do rascunho (REPROVA)', texto: 'destructive', fundo: 'destructive/5', px: 14, antes: true },
  { item: 'F40', onde: 'Aviso erro (claro)', texto: 'destructive', fundo: 'card', px: 14, exigir: true },
  { item: 'F40', onde: 'Aviso erro (escuro)', texto: 'destructive', fundo: 'card', px: 14, tema: 'escuro', exigir: true },
  { item: 'F40', onde: 'Aviso atenção (claro)', texto: 'warning', fundo: 'warning/10', px: 14, exigir: true },
  { item: 'F40', onde: 'Aviso atenção (escuro)', texto: 'warning', fundo: 'warning/10', px: 14, tema: 'escuro', exigir: true },
  { item: 'F40', onde: 'Aviso informação (claro)', texto: 'muted-foreground', fundo: 'muted/50', px: 12, exigir: true },
  { item: 'F40', onde: 'Aviso informação (escuro)', texto: 'muted-foreground', fundo: 'muted/50', px: 12, tema: 'escuro', exigir: true },

  // ---- F43 · a tela de itens legível ao bater o olho ----------------------
  // A fase não inventou token nenhum: ela combinou tokens que já existiam em
  // superfícies novas (o cartão de métrica, a classificação sob o nome do item, o
  // botão "Ver as N filiais"). Combinação nova é par novo, e par novo se mede.
  //
  // ⚠ O PAR QUE A MEDIÇÃO MATOU, e por isso ele está registrado aqui: a primeira
  // escrita da faixa de filiais (a candidata recusada) punha `muted-foreground`
  // dentro de um chip `bg-muted`. São 4,34:1 no tema claro — REPROVA por 0,16, e
  // sem esta linha ninguém saberia. Cinza sobre cinza é a armadilha óbvia de
  // qualquer chip; fica escrito para ninguém "melhorar" a tela pondo-o de volta.
  { item: 'F43', onde: 'cinza sobre o chip cinza (RECUSADO na medição)', texto: 'muted-foreground', fundo: 'muted', px: 12, antes: true },

  // O número grande do cartão de métrica (`text-2xl` = 24px → piso de 3:1).
  { item: 'F43', onde: 'número do cartão de métrica (claro)', texto: 'foreground', fundo: 'card', px: 24, exigir: true },
  { item: 'F43', onde: 'número do cartão de métrica (escuro)', texto: 'foreground', fundo: 'card', px: 24, tema: 'escuro', exigir: true },
  // O rótulo e a explicação curta do cartão, a 12px.
  { item: 'F43', onde: 'rótulo e apoio do cartão de métrica (claro)', texto: 'muted-foreground', fundo: 'card', px: 12, exigir: true },
  { item: 'F43', onde: 'rótulo e apoio do cartão de métrica (escuro)', texto: 'muted-foreground', fundo: 'card', px: 12, tema: 'escuro', exigir: true },
  // "Acessório · Mouse" sob o nome do item, e a explicação curta sob o rótulo de
  // cada coluna de número — as duas a 12px sobre o fundo da página (o quadro da
  // tabela é `bg-transparent`).
  { item: 'F43', onde: 'classificação sob o nome do item (claro)', texto: 'muted-foreground', fundo: 'background', sob: ['background'], px: 12, exigir: true },
  { item: 'F43', onde: 'classificação sob o nome do item (escuro)', texto: 'muted-foreground', fundo: 'background', sob: ['background'], px: 12, tema: 'escuro', exigir: true },
  // A MESMA linha com o mouse em cima: a linha da tabela acende `bg-muted/50`.
  // Passa por 0,03 no tema claro — é o par mais apertado da tela, e é por isso
  // que ele está aqui: mexer no token `muted` ou no `muted-foreground` derruba
  // o `npm run contraste` em vez de degradar a tela em silêncio.
  { item: 'F43', onde: 'classificação com o mouse na linha (claro)', texto: 'muted-foreground', fundo: 'muted/50', sob: ['background'], px: 12, exigir: true },
  { item: 'F43', onde: 'classificação com o mouse na linha (escuro)', texto: 'muted-foreground', fundo: 'muted/50', sob: ['background'], px: 12, tema: 'escuro', exigir: true },
  // "Ver as N filiais" — o botão do celular, com o fundo do `hover`.
  { item: 'F43', onde: '"Ver as N filiais" com o mouse em cima (claro)', texto: 'foreground', fundo: 'muted', px: 12, exigir: true },
  { item: 'F43', onde: '"Ver as N filiais" com o mouse em cima (escuro)', texto: 'foreground', fundo: 'muted', px: 12, tema: 'escuro', exigir: true },

  // ---- F44 · cada número de /itens com a sua cor ---------------------------
  //
  // A tinta sai de `src/lib/itens/tinta.ts` e é a MESMA nos três lugares (cartão,
  // cabeçalho, célula). Verde e azul são os tokens `--selo-em-estoque-texto` e
  // `--selo-em-uso-texto`, que o produto já usa para "em estoque" e "em uso" na
  // tela de ativos — a F40 já os mediu SOBRE O SELO (fundo `--selo-*`), e aqui
  // eles são medidos SOBRE A PÁGINA, que é um fundo diferente e uma razão
  // diferente. Cor reusada em superfície nova é par novo.
  //
  // ⚠ AS QUATRO SUPERFÍCIES DA CÉLULA, e as quatro têm de passar: a linha branca,
  // a listra do zebrado (`muted/30`), o hover (`muted/50`) e o cartão de métrica.
  // Medir só a primeira deixaria o número ilegível em uma linha sim, outra não.
  //
  // `px`/`bold`: o número de *Em estoque* na célula é 16px semibold (NÃO é "texto
  // grande" pela WCAG, que exige 18,66px em negrito → limiar 4,5:1); o do cartão é
  // 24px semibold, que É grande → 3:1. *Em uso* na célula é 14px.

  // Em estoque — verde, a mesma família de `STATUS_META.em_estoque`
  { item: 'F44', onde: 'número "Em estoque" na célula (claro)', texto: 'selo-em-estoque-texto', fundo: 'background', sob: ['background'], px: 16, exigir: true },
  { item: 'F44', onde: 'número "Em estoque" na célula (escuro)', texto: 'selo-em-estoque-texto', fundo: 'background', sob: ['background'], px: 16, tema: 'escuro', exigir: true },
  { item: 'F44', onde: 'número "Em estoque" na linha listrada (claro)', texto: 'selo-em-estoque-texto', fundo: 'muted/50', sob: ['background'], px: 16, exigir: true },
  { item: 'F44', onde: 'número "Em estoque" na linha listrada (escuro)', texto: 'selo-em-estoque-texto', fundo: 'muted/50', sob: ['background'], px: 16, tema: 'escuro', exigir: true },
  { item: 'F44', onde: 'número "Em estoque" com o mouse na linha (claro)', texto: 'selo-em-estoque-texto', fundo: 'muted', sob: ['background'], px: 16, exigir: true },
  { item: 'F44', onde: 'número "Em estoque" com o mouse na linha (escuro)', texto: 'selo-em-estoque-texto', fundo: 'muted', sob: ['background'], px: 16, tema: 'escuro', exigir: true },
  { item: 'F44', onde: 'número "Em estoque" no cartão (claro)', texto: 'selo-em-estoque-texto', fundo: 'card', px: 24, bold: true, exigir: true },
  { item: 'F44', onde: 'número "Em estoque" no cartão (escuro)', texto: 'selo-em-estoque-texto', fundo: 'card', px: 24, bold: true, tema: 'escuro', exigir: true },

  // Em uso — azul, a mesma família de `STATUS_META.em_uso`
  { item: 'F44', onde: 'número "Em uso" na célula (claro)', texto: 'selo-em-uso-texto', fundo: 'background', sob: ['background'], px: 14, exigir: true },
  { item: 'F44', onde: 'número "Em uso" na célula (escuro)', texto: 'selo-em-uso-texto', fundo: 'background', sob: ['background'], px: 14, tema: 'escuro', exigir: true },
  { item: 'F44', onde: 'número "Em uso" na linha listrada (claro)', texto: 'selo-em-uso-texto', fundo: 'muted/50', sob: ['background'], px: 14, exigir: true },
  { item: 'F44', onde: 'número "Em uso" na linha listrada (escuro)', texto: 'selo-em-uso-texto', fundo: 'muted/50', sob: ['background'], px: 14, tema: 'escuro', exigir: true },
  { item: 'F44', onde: 'número "Em uso" com o mouse na linha (claro)', texto: 'selo-em-uso-texto', fundo: 'muted', sob: ['background'], px: 14, exigir: true },
  { item: 'F44', onde: 'número "Em uso" com o mouse na linha (escuro)', texto: 'selo-em-uso-texto', fundo: 'muted', sob: ['background'], px: 14, tema: 'escuro', exigir: true },
  { item: 'F44', onde: 'número "Em uso" no cartão (claro)', texto: 'selo-em-uso-texto', fundo: 'card', px: 24, bold: true, exigir: true },
  { item: 'F44', onde: 'número "Em uso" no cartão (escuro)', texto: 'selo-em-uso-texto', fundo: 'card', px: 24, bold: true, tema: 'escuro', exigir: true },

  // Total — o NEUTRO, e é escolha: violeta seria colisão com "Reservado", que é
  // OUTRO dos cinco números da mesma tela (ver `src/lib/itens/tinta.ts`).
  { item: 'F44', onde: 'número "Total" na linha listrada (claro)', texto: 'muted-foreground', fundo: 'muted/50', sob: ['background'], px: 14, exigir: true },
  { item: 'F44', onde: 'número "Total" na linha listrada (escuro)', texto: 'muted-foreground', fundo: 'muted/50', sob: ['background'], px: 14, tema: 'escuro', exigir: true },

  // Falta — vermelho. A CÉLULA continua sendo o selo "faltam N" (inalterado); o
  // que é novo é o número do cartão e o quadradinho da chave de cor.
  { item: 'F44', onde: 'número "Falta" no cartão (claro)', texto: 'destructive', fundo: 'card', px: 24, bold: true, exigir: true },
  { item: 'F44', onde: 'número "Falta" no cartão (escuro)', texto: 'destructive', fundo: 'card', px: 24, bold: true, tema: 'escuro', exigir: true },

  // A CHAVE DE COR — o quadradinho de 8px ao lado do rótulo. Não é texto: é
  // elemento gráfico, e o limiar da WCAG para ele é 3:1 (`grafico: true`).
  // ⚠ Ele é REFORÇO, nunca o dado: o rótulo e o número estão sempre ao lado.
  { item: 'F44', onde: 'chave de cor "Em estoque" (claro)', texto: 'selo-em-estoque-texto', fundo: 'card', grafico: true, exigir: true },
  { item: 'F44', onde: 'chave de cor "Em estoque" (escuro)', texto: 'selo-em-estoque-texto', fundo: 'card', grafico: true, tema: 'escuro', exigir: true },
  { item: 'F44', onde: 'chave de cor "Em uso" (claro)', texto: 'selo-em-uso-texto', fundo: 'card', grafico: true, exigir: true },
  { item: 'F44', onde: 'chave de cor "Em uso" (escuro)', texto: 'selo-em-uso-texto', fundo: 'card', grafico: true, tema: 'escuro', exigir: true },
  { item: 'F44', onde: 'chave de cor "Falta" (claro)', texto: 'destructive', fundo: 'card', grafico: true, exigir: true },
  { item: 'F44', onde: 'chave de cor "Falta" (escuro)', texto: 'destructive', fundo: 'card', grafico: true, tema: 'escuro', exigir: true },
  { item: 'F44', onde: 'chave de cor "Total" (claro)', texto: 'muted-foreground', fundo: 'card', grafico: true, exigir: true },
  { item: 'F44', onde: 'chave de cor "Total" (escuro)', texto: 'muted-foreground', fundo: 'card', grafico: true, tema: 'escuro', exigir: true },

  // A legenda de escopo — a `<caption>` da tabela e a linha acima dos cartões.
  // São elas que NOMEIAM de qual filial é o número, e ilegibilidade aqui devolve a
  // tela ao defeito que a fase existe para consertar.
  { item: 'F44', onde: 'legenda de escopo da tabela (claro)', texto: 'muted-foreground', fundo: 'card', px: 14, exigir: true },
  { item: 'F44', onde: 'legenda de escopo da tabela (escuro)', texto: 'muted-foreground', fundo: 'card', px: 14, tema: 'escuro', exigir: true },
  { item: 'F44', onde: 'linha de escopo acima dos cartões (claro)', texto: 'foreground', fundo: 'background', sob: ['background'], px: 14, exigir: true },
  { item: 'F44', onde: 'linha de escopo acima dos cartões (escuro)', texto: 'foreground', fundo: 'background', sob: ['background'], px: 14, tema: 'escuro', exigir: true },

  // O selo "N em aberto" do bloco RECOLHIDO de pendências na ficha do ativo — é
  // ele que faz o alarme sobreviver ao recolhimento (F44). `variant="warning"` do
  // kit: `text-warning` sobre `bg-warning/10`.
  { item: 'F44', onde: 'selo "N em aberto" da ficha recolhida (claro)', texto: 'warning', fundo: 'warning/10', px: 12, exigir: true },
  { item: 'F44', onde: 'selo "N em aberto" da ficha recolhida (escuro)', texto: 'warning', fundo: 'warning/20', px: 12, tema: 'escuro', exigir: true },
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
  // A pilha padrão é a MESMA nos dois temas (o que muda é o valor dos tokens `card`/
  // `background`, resolvidos por `resolver()` com o tema). Aqui havia um ternário com os
  // dois ramos idênticos, que sugeria uma diferença inexistente.
  const superficie = par.sob ?? ['card', 'background']
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
      // `antes: true` marca o par ANTERIOR à correção: ele reprova DE PROPÓSITO e está na
      // lista como registro do defeito. (Aqui se lia `l.preexistente`, campo que nenhum par
      // define — então o aviso nunca era impresso e um known-fail saía indistinguível de
      // uma regressão nova.)
      // `alivio: true` (F32) marca o par que fica abaixo do piso DE PROPÓSITO
      // porque o elemento não depende da cor sozinha — carrega rótulo de valor,
      // total e legenda em texto. Sem esta marca ele sairia indistinguível de uma
      // regressão, exatamente como acontecia com o `antes` antes da F29.
      const veredito = l.passa
        ? l.nivel === 'AAA'
          ? '✅ AAA'
          : '✅ AA'
        : l.antes
          ? '❌ reprova (esperado — é o "antes" registrado)'
          : l.alivio
            ? '⚠️ abaixo do piso (alívio registrado — rótulo, total e legenda em texto)'
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
