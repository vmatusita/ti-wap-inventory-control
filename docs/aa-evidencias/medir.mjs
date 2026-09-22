#!/usr/bin/env node
// medir.mjs — Passo 5 / Decisão 4 (item AA), RODADA 2 — corrige a falha que o
// VERIFICADOR achou na rodada 1 (a primeira rodada, fora do repositório): o otimizador só protegia
// vizinhos na ORDEM DA PILHA (STATUS_ORDEM); o conjunto real de pares que
// convivem na tela é maior (glossário em grade 2 colunas, KPI tiles em 3
// grades responsivas, E a pilha empilhada com filtro de zero — ver §1 do
// relatório). Este script mede contra o conjunto de pares levantado nesta
// sessão: TODOS os 21 pares entre os 7 status vivos.
//
// Script AVULSO de auditoria (reauditoria, passo 5): guardado como evidência em docs/aa-evidencias/, não faz parte do app nem do CI. `node docs/aa-evidencias/medir.mjs` regrava o resultado.json ao lado.
// Node puro, zero dependência — mesmo espírito de scripts/contraste.mjs.
//
// MÉTODO (declarado, para reprodutibilidade — o mesmo da rodada 1 e da
// docs/ANALISE-RELATORIOS-2026-08-10.md §4):
//   · Conversão oklch <-> sRGB linear: matrizes de Björn Ottosson (OKLab spec).
//   · Contraste: WCAG 2.1 relative luminance, razão (L1+.05)/(L2+.05).
//   · CVD: Machado, Oliveira & Fernandes (2009), severidade 1.0, sRGB linear.
//     Tritanopia é EXTENSÃO (não está na análise de 10/08, que só tem proto/deutan).
//   · ΔE: distância euclidiana em OKLab ×100 (a fórmula da análise de 10/08 §4).
//   · Pisos: ΔE CVD alvo 8 / mínimo 6. ΔE visão normal piso duro 15. Contraste
//     de elemento gráfico (WCAG 1.4.11) piso 3:1. Rótulo de texto 4,5:1.
//
// Uso: node medir.mjs            → relatório no console
//      node medir.mjs --json     → tudo em JSON (para o previa.html consumir)

import { writeFileSync } from 'node:fs'

// ===========================================================================
// 1. oklch <-> sRGB (linear e gamma), hex <-> sRGB (copiado/espelhado de
//    scripts/contraste.mjs — mesmas matrizes de Ottosson).
// ===========================================================================

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

function linearRgbParaOklab([r, g, b]) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ]
}

function gammaEncode(c) {
  const v = Math.min(1, Math.max(0, c))
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}
function gammaDecode(c) {
  const v = Math.min(1, Math.max(0, c))
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function luminanciaWcag([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contraste(corA, corB) {
  const la = luminanciaWcag(corA.linear)
  const lb = luminanciaWcag(corB.linear)
  const [claro, escuro] = la >= lb ? [la, lb] : [lb, la]
  return (claro + 0.05) / (escuro + 0.05)
}

function hexParaLinear(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`hex invalido: ${hex}`)
  const n = parseInt(m[1], 16)
  const gamma = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255)
  return gamma.map(gammaDecode)
}
function linearParaHex(linear) {
  const gamma = linear.map(gammaEncode)
  const n = gamma.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255))
  return '#' + n.map((v) => v.toString(16).padStart(2, '0')).join('')
}
function oklchParaHex(L, C, H) {
  return linearParaHex(oklchParaLinearRgb(L, C, H))
}
function corDeHex(hex) {
  return { hex, linear: hexParaLinear(hex) }
}

// ===========================================================================
// 2. Simulação de daltonismo — Machado, Oliveira & Fernandes (2009), sev. 1.0.
// ===========================================================================

const MATRIZES_CVD = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}
function simularCvd(linear, tipo) {
  const M = MATRIZES_CVD[tipo]
  return [
    M[0][0] * linear[0] + M[0][1] * linear[1] + M[0][2] * linear[2],
    M[1][0] * linear[0] + M[1][1] * linear[1] + M[1][2] * linear[2],
    M[2][0] * linear[0] + M[2][1] * linear[1] + M[2][2] * linear[2],
  ].map((v) => Math.min(1, Math.max(0, v)))
}
function deltaE(linearA, linearB) {
  const a = linearRgbParaOklab(linearA)
  const b = linearRgbParaOklab(linearB)
  const d = Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
  return d * 100
}

// ===========================================================================
// 3. Vocabulário + paleta ATUAL (medida em src/app/globals.css:306-314 e
//    src/lib/dominio.ts:136-146 nesta sessão).
// ===========================================================================

const STATUS_ORDEM = [
  'em_estoque', 'reservado', 'em_uso', 'emprestado', 'em_triagem',
  'em_manutencao', 'defasado', 'descartado', 'devolvido_fornecedor',
]
const VIVOS = STATUS_ORDEM.filter((s) => s !== 'descartado' && s !== 'devolvido_fornecedor')

const ROTULOS = {
  em_estoque: 'Em estoque', reservado: 'Reservado', em_uso: 'Em uso',
  emprestado: 'Emprestado', em_triagem: 'Em triagem', em_manutencao: 'Em manutenção',
  defasado: 'Defasado', descartado: 'Descartado', devolvido_fornecedor: 'Devolvido ao fornecedor',
}

const PALETA_ATUAL = {
  em_estoque: '#16a34a', reservado: '#6d28d9', em_uso: '#2a78d6', emprestado: '#06b6d4',
  em_triagem: '#db2777', em_manutencao: '#d97706', defasado: '#9ca3af',
  descartado: '#6b7280', devolvido_fornecedor: '#64748b',
}

const CARD_CLARO = corDeHex(oklchParaHex(1, 0, 0))
const CARD_ESCURO = corDeHex(oklchParaHex(0.205, 0, 0))

// ===========================================================================
// 4. O CONJUNTO DE PARES RESTRITOS — item 1 da ordem.
//
// A rodada 1 mediu só os 8 pares ADJACENTES em STATUS_ORDEM (a ordem da
// pilha). O verificador achou o furo: em_estoque×emprestado é vizinho REAL no
// glossário (grade 2 colunas) e a paleta "separada" derrubava esse par de
// ΔE 10,45 pra 3,38 sob tritanopia sem que o otimizador percebesse, porque
// emprestado não é vizinho de em_estoque em STATUS_ORDEM.
//
// Levantamento desta sessão (grep + leitura, arquivo:linha):
//
//  A) src/lib/relatorios/acervo.ts:36 — `agregarAcervoPorSituacao` FILTRA os
//     status com total zero antes de gerar `segmentos`
//     (`STATUS_ORDEM.filter((s) => (soma.get(s) ?? 0) > 0)`). BarraAcervo
//     (src/components/relatorios/barra-acervo.tsx:27-105) empilha só os
//     `segmentos` restantes, na ordem que sobrou — então se `reservado` está
//     zerado numa filial, `em_estoque` e `em_uso` colam DIRETO, apesar de não
//     serem vizinhos em STATUS_ORDEM. Isso vale para QUALQUER par: qualquer
//     um dos 7 pode ficar ao lado de qualquer outro, dependendo de qual dos
//     que ficam ENTRE eles está zerado naquela filial/categoria/período. Não
//     é um caso raro — é o comportamento normal do componente.
//  B) src/components/relatorios/barras-empilhadas.tsx:42-64 — mesmo padrão,
//     por CATEGORIA: `presentes` é calculado por "algum total > 0 em
//     QUALQUER categoria" (linha 42-47), mas cada LINHA (categoria) empilha
//     só os `presentes` que ela de fato tem; uma categoria com um status do
//     meio zerado solda os vizinhos dela na tela, do mesmo jeito que (A).
//  C) src/components/relatorios/legendas.tsx:74 (`sm:grid-cols-2`) + a ordem
//     fixa de src/lib/relatorios/legendas.ts:104-195 (`glossarioRelatorio`,
//     que NÃO é STATUS_ORDEM: é em_uso, em_estoque, reservado, emprestado,
//     em_triagem, em_manutencao, defasado, descartado, devolvido_fornecedor,
//     intercalada com 6 verbetes SEM status) — grade 2 colunas no desktop
//     (linha == par horizontal, coluna == par vertical a cada 2 posições) E
//     1 coluna no mobile (`dl` sem `grid-cols` na base = todo vizinho
//     sequencial vira par vertical). Os pares medidos nesta sessão (união
//     desktop+mobile, só entradas com `status`):
//       horizontal (desktop): em_estoque-reservado, emprestado-em_triagem,
//         em_manutencao-defasado, descartado-devolvido_fornecedor
//       vertical (desktop):   em_estoque-emprestado, emprestado-em_manutencao,
//         em_manutencao-descartado, em_uso-reservado, reservado-em_triagem,
//         em_triagem-defasado, defasado-devolvido_fornecedor
//       sequencial (mobile):  em_uso-em_estoque, reservado-emprestado,
//         em_triagem-em_manutencao, defasado-descartado (+ 4 já listados)
//     É AQUI que mora o em_uso×reservado que o verificador cobrou — nasce da
//     COLUNA 1 do glossário (em_uso na linha 0, reservado na linha 1), não da
//     pilha.
//  D) src/components/relatorios/kpi-tiles.tsx:126 (`grid-cols-2 gap-3
//     sm:grid-cols-3 xl:grid-cols-7`) — TRÊS grades responsivas para os
//     MESMOS 7 tiles (total + 6 status; `emprestado` fica de fora do tile
//     principal). "Total" ocupa a linha cheia em toda grade
//     (`col-span-2 sm:col-span-3 xl:col-span-1`), então nas duas primeiras
//     grades os 6 status formam sub-grades próprias abaixo dele. No xl (7
//     colunas) os 7 cabem numa linha só — só pares horizontais sequenciais.
//     Pares levantados (união dos 3 breakpoints, só os 6 tiles de status):
//       em_uso-em_estoque, em_estoque-reservado, reservado-em_triagem,
//       em_triagem-em_manutencao, em_manutencao-defasado (sequência comum às
//       3 grades) + em_uso-reservado, em_estoque-em_triagem,
//       reservado-em_manutencao, em_triagem-defasado (verticais do
//       grid-cols-2) + em_uso-em_triagem, em_estoque-em_manutencao,
//       reservado-defasado (verticais do sm:grid-cols-3).
//     GrupoKpis (kpi-tiles.tsx:215, `grid-cols-2 sm:grid-cols-4`, os 4 tiles
//     em_estoque/reservado/em_manutencao/emprestado) acrescenta
//     em_estoque-em_manutencao (vertical mobile) e reservado-emprestado
//     (vertical mobile) e a sequência em_estoque-reservado-em_manutencao-
//     emprestado no sm (4 colunas, uma linha).
//  E) src/components/relatorios/serie-estado-grafico.tsx — A série temporal é
//     UMA linha, um `dataKey` (`em_estoque`), config com UMA entrada
//     (linha 26-28). Não há segunda série nem área sobreposta: não introduz
//     par novo algum. (O item 3 da ordem perguntou por isso explicitamente —
//     resposta: não se aplica, medido nesta sessão lendo o componente.)
//
// LEVANTAMENTO = pelo menos 19 dos 21 pares possíveis já aparecem vizinhos em
// alguma dessas telas (a única maneira de um par NÃO aparecer seria os dois
// status nunca dividirem uma pilha zerada nem uma grade — o que (A)/(B)
// tornam extremamente improvável para qualquer par dos 7 vivos). Por isso
// este script segue a instrução do item 1 e usa o conjunto mais seguro:
// TODOS os C(7,2) = 21 pares entre os 7 status vivos — a régua "TODOS os
// pares", não a "só vizinhos".
// ===========================================================================

const PARES_RESTRITOS = []
for (let i = 0; i < VIVOS.length; i++) {
  for (let j = i + 1; j < VIVOS.length; j++) PARES_RESTRITOS.push([VIVOS[i], VIVOS[j]])
}
// (para registro/comparação histórica) os 6 pares adjacentes da PILHA entre
// os 7 vivos (STATUS_ORDEM) — o conjunto que a rodada 1 usava sozinho.
const PARES_PILHA_VIVOS = []
for (let i = 0; i < VIVOS.length - 1; i++) PARES_PILHA_VIVOS.push([VIVOS[i], VIVOS[i + 1]])

const VISOES = ['normal', 'protanopia', 'deuteranopia', 'tritanopia']
const CVDS = ['protanopia', 'deuteranopia', 'tritanopia']

// ===========================================================================
// 5. Medição de uma paleta (num tema): contraste + ΔE dos pares restritos.
// ===========================================================================

function linearPorVisao(hex) {
  const lin = hexParaLinear(hex)
  const o = { normal: lin }
  for (const v of CVDS) o[v] = simularCvd(lin, v)
  return o
}

function medirTema(paletaHex, card) {
  const cores = {}
  for (const s of STATUS_ORDEM) cores[s] = corDeHex(paletaHex[s])
  const contrastes = {}
  for (const s of STATUS_ORDEM) contrastes[s] = contraste(cores[s], card)

  const linPorStatus = {}
  for (const s of STATUS_ORDEM) linPorStatus[s] = linearPorVisao(paletaHex[s])

  function medirPares(pares) {
    return pares.map(([a, b]) => {
      const linha = { a, b }
      for (const visao of VISOES) linha[visao] = deltaE(linPorStatus[a][visao], linPorStatus[b][visao])
      return linha
    })
  }
  const restritos = medirPares(PARES_RESTRITOS)
  const pilha = medirPares(PARES_PILHA_VIVOS)

  function piorPorVisao(medidos) {
    const pior = {}
    for (const visao of VISOES) {
      let m = medidos[0]
      for (const l of medidos) if (l[visao] < m[visao]) m = l
      pior[visao] = { par: `${m.a}×${m.b}`, valor: m[visao] }
    }
    return pior
  }

  return {
    contrastes,
    restritos,
    pilha,
    piorRestrito: piorPorVisao(restritos),
    piorPilha: piorPorVisao(pilha),
  }
}

// Medição completa (os 2 temas) de uma paleta que pode ser {claro,escuro} (por
// tema) ou um único mapa hex (aplicado aos dois temas, o caso comum).
function medirPaleta(paletaPorTemaOuUnica) {
  const porTema = paletaPorTemaOuUnica.claro
    ? paletaPorTemaOuUnica
    : { claro: paletaPorTemaOuUnica, escuro: paletaPorTemaOuUnica }
  return {
    claro: medirTema(porTema.claro, CARD_CLARO),
    escuro: medirTema(porTema.escuro, CARD_ESCURO),
    paleta: porTema,
  }
}

function fillESeuContraste(hex) {
  const cor = corDeHex(hex)
  const branco = corDeHex('#ffffff')
  const preto = corDeHex('#000000')
  const cBranco = contraste(cor, branco)
  const cPreto = contraste(cor, preto)
  const fill = cBranco >= cPreto ? 'branco' : 'preto'
  const razao = Math.max(cBranco, cPreto)
  return { fill, razao, passaAA: razao >= 4.5 }
}

// ===========================================================================
// 6. Busca em grade local (grid search) — usada pelas 3 propostas.
// ===========================================================================

function paraOklch(hex) {
  const alvo = hexParaLinear(hex)
  let melhor = null
  for (let L = 0.15; L <= 0.95; L += 0.005) {
    for (let C = 0; C <= 0.32; C += 0.01) {
      for (let H = 0; H < 360; H += 2) {
        const linear = oklchParaLinearRgb(L, C, H)
        const d = (linear[0] - alvo[0]) ** 2 + (linear[1] - alvo[1]) ** 2 + (linear[2] - alvo[2]) ** 2
        if (!melhor || d < melhor.d) melhor = { d, L, C, H }
      }
    }
  }
  return melhor
}

const OK_EMPRESTADO = paraOklch(PALETA_ATUAL.emprestado)
const OK_RESERVADO = paraOklch(PALETA_ATUAL.reservado)
const OK_DEFASADO = paraOklch(PALETA_ATUAL.defasado)

console.error(
  `oklch atual — emprestado L${OK_EMPRESTADO.L.toFixed(3)} C${OK_EMPRESTADO.C.toFixed(3)} H${OK_EMPRESTADO.H} · ` +
    `reservado L${OK_RESERVADO.L.toFixed(3)} C${OK_RESERVADO.C.toFixed(3)} H${OK_RESERVADO.H} · ` +
    `defasado L${OK_DEFASADO.L.toFixed(3)} C${OK_DEFASADO.C.toFixed(3)} H${OK_DEFASADO.H}`,
)

// ATUAL — o "hoje" que serve de piso pra regra "não piora abaixo do que já
// passa o alvo 8". Medido no LIGHT porque ΔE não depende do fundo — um único
// mapa de referência serve para os dois temas.
const ATUAL_REF = medirTema(PALETA_ATUAL, CARD_CLARO)
const HOJE_POR_PAR = new Map()
for (const l of ATUAL_REF.restritos) HOJE_POR_PAR.set(`${l.a}×${l.b}`, l)

// Verifica se um candidato (mapa completo de hex, um só tema de cor —
// lembrando que ΔE não depende de fundo) cumpre a régua do item 3:
//   · todo par restrito >= 6 nas 3 simulações CVD e >= 15 em visão normal
//   · nenhum par restrito piora (abaixo do valor de hoje) numa visão CVD em
//     que hoje já alcança o alvo 8
// Retorna { ok, folga } — folga = a MENOR margem sobre qualquer exigência
// (negativa se violou alguma; serve para escolher o "melhor compromisso").
//
// DECISÃO DE LEITURA (registrada, não é ambiguidade escondida): "não piora
// abaixo do que é hoje" foi lida como "não deixa de alcançar o alvo 8" —
// isto é, se hoje(par,visão) >= 8, o novo valor tem de continuar >= 8. A
// leitura literal ("nunca cai nem 0,01 abaixo do valor exato de hoje") reprova
// QUALQUER movimento de QUALQUER token, porque mover uma cor muda a distância
// OKLab dela a quase todo o resto por uma fração — inclusive pares hoje a
// ΔE 30+ que não têm relação nenhuma com o problema (ex.: reservado×em_manutencao,
// que cai de 39,22 para 38,03 quando SÓ reservado clareia — folga de sobra nos
// dois casos). Essa leitura tornaria toda proposta de correção matematicamente
// impossível, inclusive a mínima de 1 token. A leitura adotada preserva o
// espírito da regra (não deixar um par SAUDÁVEL virar um par FRACO) sem barrar
// toda e qualquer mudança de tinta.
function verificarRegua(paletaHex, statusMovidos, regra = 'estrita') {
  const m = medirTema(paletaHex, CARD_CLARO) // ΔE não depende do card
  let folga = Infinity
  for (const l of m.restritos) {
    // só avalia pares que TOCAM algum status que se moveu nesta proposta —
    // os outros são idênticos ao ATUAL e já foram aprovados historicamente.
    if (statusMovidos && !statusMovidos.has(l.a) && !statusMovidos.has(l.b)) continue
    for (const cvd of CVDS) {
      folga = Math.min(folga, l[cvd] - 6)
      if (regra === 'estrita') {
        const hoje = HOJE_POR_PAR.get(`${l.a}×${l.b}`)
        if (hoje && hoje[cvd] >= 8) folga = Math.min(folga, l[cvd] - 8)
      }
    }
    folga = Math.min(folga, l.normal - 15)
  }
  return { ok: folga >= 0, folga }
}

function contrasteOk(hex, superficies) {
  return superficies.every((s) => contraste(corDeHex(hex), s) >= 3.0)
}

// Busca 1D (só L, hue/chroma fixos) — usada para `defasado` (cinza de
// de-ênfase deliberado: preserva o design documentado em dominio.ts) e como
// candidato de "menor perturbação" para emprestado/reservado antes de abrir
// a busca 3D.
function buscarSoL(base, direcao, superficieQueFalha, outraSuperficie, statusMovidos, hexBase, nomeStatus, outrosHex, regra = 'estrita') {
  const candidatos = []
  const lo = direcao === 'escurecer' ? 0.15 : base.L
  const hi = direcao === 'escurecer' ? base.L : 0.95
  const passo = 0.004
  for (let L = lo; L <= hi; L += passo) {
    const hex = oklchParaHex(L, base.C, base.H)
    if (!contrasteOk(hex, [superficieQueFalha, outraSuperficie])) continue
    const paleta = { ...outrosHex, [nomeStatus]: hex }
    const r = verificarRegua(paleta, statusMovidos, regra)
    candidatos.push({ hex, L, folga: r.folga, ok: r.ok })
  }
  return candidatos
}

// Busca 3D local (L, C, H) em torno do oklch original — usada para
// emprestado/reservado quando a busca 1D não fecha a régua (é exatamente o
// caso que o verificador expôs: só-L empurra reservado para perto de em_uso).
function buscarLCH(base, direcao, superficieQueFalha, outraSuperficie, statusMovidos, nomeStatus, outrosHex, regra = 'estrita') {
  const candidatos = []
  const passoL = 0.01
  const passoC = 0.015
  const passoH = 4
  const rangeL =
    direcao === 'escurecer'
      ? [Math.max(0.15, base.L - 0.35), base.L]
      : [base.L, Math.min(0.95, base.L + 0.35)]
  for (let L = rangeL[0]; L <= rangeL[1]; L += passoL) {
    for (let C = Math.max(0, base.C - 0.1); C <= Math.min(0.32, base.C + 0.1); C += passoC) {
      for (let H = base.H - 30; H <= base.H + 30; H += passoH) {
        const hex = oklchParaHex(L, C, H)
        if (!contrasteOk(hex, [superficieQueFalha, outraSuperficie])) continue
        const paleta = { ...outrosHex, [nomeStatus]: hex }
        const r = verificarRegua(paleta, statusMovidos, regra)
        // Guarda TODO candidato viável em contraste (não só os 'ok' na régua
        // de ΔE) com sua folga — permite escolher o "melhor compromisso"
        // quando NENHUM ponto da vizinhança fecha a régua inteira.
        const dE = deltaE(hexParaLinear(hex), hexParaLinear(oklchParaHex(base.L, base.C, base.H)))
        candidatos.push({ hex, L, C, H, folga: r.folga, ok: r.ok, dE })
      }
    }
  }
  return candidatos
}

function melhorCandidato(cands, preferirMenorDE) {
  if (cands.length === 0) return null
  const viaveis = cands.filter((c) => c.ok)
  const pool = viaveis.length > 0 ? viaveis : cands
  if (viaveis.length > 0 && preferirMenorDE) {
    return pool.reduce((a, b) => ((b.dE ?? 0) < (a.dE ?? Infinity) ? b : a))
  }
  return pool.reduce((a, b) => (b.folga > a.folga ? b : a))
}

// ---------------------------------------------------------------------------
// (c') MÍNIMA — só os 3 tokens que reprovam 3:1, valor único nos dois temas.
// ---------------------------------------------------------------------------

const MOVIDOS_C = new Set(['emprestado', 'reservado', 'defasado'])

// Cada token busca o MELHOR ponto para SI (só os pares que ele mesmo toca) —
// não o conjunto inteiro de movidos. Isso evita que um problema NÃO
// RELACIONADO de outro token (ex.: emprestado×em_estoque) contamine a busca
// de um terceiro (reservado) com uma "folga" que reservado não tem como
// consertar sozinho. O veredito FINAL, sobre a paleta combinada e com TODOS
// os movidos, é computado depois — é ele que decide OK/FALHOU de verdade.
function construirMinima(regra) {
  let atual = { ...PALETA_ATUAL }

  // defasado — só L (preserva o cinza de de-ênfase documentado).
  {
    const so = new Set(['defasado'])
    const cands = buscarSoL(OK_DEFASADO, 'escurecer', CARD_CLARO, CARD_ESCURO, so, PALETA_ATUAL.defasado, 'defasado', atual, regra)
    const m = melhorCandidato(cands, false)
    if (m) atual = { ...atual, defasado: m.hex }
  }

  // emprestado — tenta só-L primeiro (menor perturbação); se nenhum ponto
  // fecha a régua PRÓPRIA, abre a busca 3D.
  {
    const so = new Set(['emprestado'])
    let cands = buscarSoL(OK_EMPRESTADO, 'escurecer', CARD_CLARO, CARD_ESCURO, so, PALETA_ATUAL.emprestado, 'emprestado', atual, regra)
    let m = melhorCandidato(cands, false)
    if (!m || !m.ok) {
      const cands3d = buscarLCH(OK_EMPRESTADO, 'escurecer', CARD_CLARO, CARD_ESCURO, so, 'emprestado', atual, regra)
      const m3d = melhorCandidato(cands3d, true)
      if (m3d && (m3d.ok || !m || m3d.folga > m.folga)) m = m3d
    }
    if (m) atual = { ...atual, emprestado: m.hex }
  }

  // reservado — mesma estratégia, mas CLAREANDO (o escuro é quem falha).
  {
    const so = new Set(['reservado'])
    let cands = buscarSoL(OK_RESERVADO, 'clarear', CARD_ESCURO, CARD_CLARO, so, PALETA_ATUAL.reservado, 'reservado', atual, regra)
    let m = melhorCandidato(cands, false)
    if (!m || !m.ok) {
      const cands3d = buscarLCH(OK_RESERVADO, 'clarear', CARD_ESCURO, CARD_CLARO, so, 'reservado', atual, regra)
      const m3d = melhorCandidato(cands3d, true)
      if (m3d && (m3d.ok || !m || m3d.folga > m.folga)) m = m3d
    }
    if (m) atual = { ...atual, reservado: m.hex }
  }

  const veredito = verificarRegua(atual, MOVIDOS_C, regra)
  return { paleta: atual, ok: veredito.ok, folga: veredito.folga }
}

// Tenta a régua ESTRITA (preserva alvo 8 onde hoje já o cumpre) primeiro; se
// não fechar, tenta a régua MÍNIMA (só os pisos 6 CVD / 15 normal — os
// mesmos pisos da análise de 10/08 §4) como segundo compromisso, e reporta
// os DOIS (item 3 da ordem: "se for impossível, diga e mostre o melhor
// compromisso medido").
const MINIMA_ESTRITA = construirMinima('estrita')
const MINIMA_RELAXADA = construirMinima('minima')
const MINIMA = MINIMA_ESTRITA.ok ? MINIMA_ESTRITA : MINIMA_ESTRITA

// ---------------------------------------------------------------------------
// (c'') MESMA COISA, POR TEMA — só o tema que reprova muda.
// ---------------------------------------------------------------------------

function construirPorTema() {
  // claro: emprestado e defasado mudam; escuro: fica igual ao ATUAL.
  let claro = { ...PALETA_ATUAL }
  let escuro = { ...PALETA_ATUAL }

  function movidosNesteTema(paletaTema, cardFalha, cardOutra, direcao, nomeStatus, base) {
    // Isolado (só os pares do PRÓPRIO token) — mesmo raciocínio de
    // construirMinima: não deixar um problema de OUTRO token contaminar esta
    // busca. O veredito conjunto por tema é conferido depois, fora daqui.
    const so = new Set([nomeStatus])
    let cands = buscarSoL(base, direcao, cardFalha, cardOutra, so, PALETA_ATUAL[nomeStatus], nomeStatus, paletaTema)
    let m = melhorCandidato(cands, false)
    if ((!m || !m.ok) && nomeStatus !== 'defasado') {
      const cands3d = buscarLCH(base, direcao, cardFalha, cardOutra, so, nomeStatus, paletaTema)
      const m3d = melhorCandidato(cands3d, true)
      if (m3d && (m3d.ok || !m || m3d.folga > m.folga)) m = m3d
    }
    return m ? m.hex : paletaTema[nomeStatus]
  }

  // Para o teste de régua por tema, cada tema só enxerga OS DOIS OUTROS
  // tokens no valor QUE ESSE TEMA vai exibir (por isso claro/escuro
  // recebem paletas parcialmente distintas antes de resolver o terceiro).
  claro.emprestado = movidosNesteTema(claro, CARD_CLARO, CARD_ESCURO, 'escurecer', 'emprestado', OK_EMPRESTADO)
  claro.defasado = movidosNesteTema(claro, CARD_CLARO, CARD_ESCURO, 'escurecer', 'defasado', OK_DEFASADO)
  // reservado no claro fica no valor ATUAL (já passa 7,10:1) — não muda.
  escuro.reservado = movidosNesteTema(escuro, CARD_ESCURO, CARD_CLARO, 'clarear', 'reservado', OK_RESERVADO)
  // emprestado/defasado no escuro ficam no valor ATUAL (já passam) — não mudam.

  const veredictoClaro = verificarRegua(claro, MOVIDOS_C)
  const veredictoEscuro = verificarRegua(escuro, MOVIDOS_C)

  return {
    paleta: { claro, escuro },
    ok: veredictoClaro.ok && veredictoEscuro.ok,
    folga: Math.min(veredictoClaro.folga, veredictoEscuro.folga),
  }
}

const POR_TEMA = construirPorTema()

// ---------------------------------------------------------------------------
// (b') SEPARAÇÃO COMPLETA — 9 tokens, âncoras: em_uso fixo, os 3 neutros só
// em luminosidade. Vizinhos = TODOS os outros 6 vivos (a correção do bug que
// o verificador achou — rodada 1 usava só STATUS_ORDEM).
// ---------------------------------------------------------------------------

const NEUTROS = new Set(['defasado', 'descartado', 'devolvido_fornecedor'])
const ANCORA = new Set(['em_uso'])

function scoreCandidato9(hex, status, paletaAtualHexes) {
  const linear = hexParaLinear(hex)
  const c1 = contraste(corDeHex(hex), CARD_CLARO)
  const c2 = contraste(corDeHex(hex), CARD_ESCURO)
  if (c1 < 3 || c2 < 3) return -Infinity
  // vizinhos = TODOS os outros status VIVOS (a régua "todos os pares").
  let pior = Infinity
  for (const outro of VIVOS) {
    if (outro === status) continue
    const linearOutro = hexParaLinear(paletaAtualHexes[outro])
    for (const visao of VISOES) {
      const a = visao === 'normal' ? linear : simularCvd(linear, visao)
      const b = visao === 'normal' ? linearOutro : simularCvd(linearOutro, visao)
      const d = deltaE(a, b)
      if (d < pior) pior = d
    }
  }
  return pior
}

function otimizarFamilia9(status, paletaAtualHexes) {
  if (ANCORA.has(status)) return paletaAtualHexes[status]
  const base = paraOklch(paletaAtualHexes[status])

  if (NEUTROS.has(status)) {
    const c1 = contraste(corDeHex(paletaAtualHexes[status]), CARD_CLARO)
    const c2 = contraste(corDeHex(paletaAtualHexes[status]), CARD_ESCURO)
    if (c1 >= 3 && c2 >= 3) return paletaAtualHexes[status]
    const direcao = c1 < 3 ? 'escurecer' : 'clarear'
    const superficie = c1 < 3 ? CARD_CLARO : CARD_ESCURO
    let lo = direcao === 'escurecer' ? 0.15 : base.L
    let hi = direcao === 'escurecer' ? base.L : 0.95
    for (let i = 0; i < 40; i++) {
      const meio = (lo + hi) / 2
      const hex = oklchParaHex(meio, base.C, base.H)
      const r = contraste(corDeHex(hex), superficie)
      if (direcao === 'escurecer') {
        if (r < 3.05) hi = meio
        else lo = meio
      } else {
        if (r < 3.05) lo = meio
        else hi = meio
      }
    }
    return oklchParaHex(direcao === 'escurecer' ? lo : hi, base.C, base.H)
  }

  let melhorHex = paletaAtualHexes[status]
  let melhorScore = scoreCandidato9(melhorHex, status, paletaAtualHexes)
  for (let dL = -0.14; dL <= 0.14; dL += 0.02) {
    for (let dC = -0.08; dC <= 0.08; dC += 0.02) {
      for (let dH = -10; dH <= 10; dH += 4) {
        const L = Math.min(0.85, Math.max(0.3, base.L + dL))
        const C = Math.min(0.32, Math.max(0.02, base.C + dC))
        const H = base.H + dH
        const hex = oklchParaHex(L, C, H)
        const s = scoreCandidato9(hex, status, paletaAtualHexes)
        if (s > melhorScore) {
          melhorScore = s
          melhorHex = hex
        }
      }
    }
  }
  return melhorHex
}

let paletaSeparada = { ...PALETA_ATUAL }
for (let passada = 0; passada < 4; passada++) {
  for (const status of STATUS_ORDEM) {
    if (NEUTROS.has(status) && status !== 'defasado') continue // descartado/devolvido_fornecedor: fora do escopo de "vivos", mantidos
    paletaSeparada[status] = otimizarFamilia9(status, paletaSeparada)
  }
}
const SEPARADA = paletaSeparada
const veredictoSeparada = verificarRegua(SEPARADA, new Set(VIVOS.filter((s) => s !== 'em_uso')))

// ===========================================================================
// 7. Medição final das 4 opções + rótulos
// ===========================================================================

const OPCOES = {
  atual: PALETA_ATUAL,
  minima: MINIMA.paleta,
  minimaRelaxada: MINIMA_RELAXADA.paleta,
  porTema: POR_TEMA.paleta, // {claro, escuro}
  separada: SEPARADA,
}

const medicoes = {}
const rotulos = {}
for (const [nome, paleta] of Object.entries(OPCOES)) {
  medicoes[nome] = medirPaleta(paleta)
  const porTema = paleta.claro ? paleta : { claro: paleta, escuro: paleta }
  rotulos[nome] = {
    claro: Object.fromEntries(STATUS_ORDEM.map((s) => [s, fillESeuContraste(porTema.claro[s])])),
    escuro: Object.fromEntries(STATUS_ORDEM.map((s) => [s, fillESeuContraste(porTema.escuro[s])])),
  }
}

// ΔE-normal entre o hex ATUAL e o hex NOVO, por token e por tema — "quantos
// matizes mudam visivelmente" (item 3 da ordem).
function mudancaVisivel(paleta) {
  const porTema = paleta.claro ? paleta : { claro: paleta, escuro: paleta }
  const out = {}
  for (const s of STATUS_ORDEM) {
    const dClaro = deltaE(hexParaLinear(PALETA_ATUAL[s]), hexParaLinear(porTema.claro[s]))
    const dEscuro = deltaE(hexParaLinear(PALETA_ATUAL[s]), hexParaLinear(porTema.escuro[s]))
    out[s] = { claro: dClaro, escuro: dEscuro }
  }
  return out
}
const mudancas = {}
for (const [nome, paleta] of Object.entries(OPCOES)) mudancas[nome] = mudancaVisivel(paleta)

// Vereditos de régua (item 3) — recomputados aqui de forma independente do
// processo de busca, sobre a paleta FINAL de cada opção (dupla checagem).
const vereditos = {
  atual: verificarRegua(PALETA_ATUAL, new Set(VIVOS)),
  minima: verificarRegua(MINIMA.paleta, MOVIDOS_C),
  minimaRelaxada: verificarRegua(MINIMA_RELAXADA.paleta, MOVIDOS_C, 'minima'),
  porTemaClaro: verificarRegua(POR_TEMA.paleta.claro, MOVIDOS_C),
  porTemaEscuro: verificarRegua(POR_TEMA.paleta.escuro, MOVIDOS_C),
  separada: verificarRegua(SEPARADA, new Set(VIVOS.filter((s) => s !== 'em_uso'))),
}

// oklch aproximado (para exibição) — só dos hex que MUDARAM em alguma opção
// (grade mais grossa que paraOklch: é só para o relatório ler "oklch(...)",
// não para decisão nenhuma do script).
function paraOklchRapido(hex) {
  const alvo = hexParaLinear(hex)
  let melhor = null
  for (let L = 0.15; L <= 0.95; L += 0.01) {
    for (let C = 0; C <= 0.32; C += 0.01) {
      for (let H = 0; H < 360; H += 3) {
        const linear = oklchParaLinearRgb(L, C, H)
        const d = (linear[0] - alvo[0]) ** 2 + (linear[1] - alvo[1]) ** 2 + (linear[2] - alvo[2]) ** 2
        if (!melhor || d < melhor.d) melhor = { d, L, C, H }
      }
    }
  }
  return `oklch(${melhor.L.toFixed(3)} ${melhor.C.toFixed(3)} ${melhor.H})`
}
const hexesParaOklch = new Set()
for (const paleta of Object.values(OPCOES)) {
  const porTema = paleta.claro ? paleta : { claro: paleta, escuro: paleta }
  for (const s of STATUS_ORDEM) {
    hexesParaOklch.add(porTema.claro[s])
    hexesParaOklch.add(porTema.escuro[s])
  }
}
const OKLCH_DE = {}
for (const hex of hexesParaOklch) OKLCH_DE[hex] = paraOklchRapido(hex)

const resultado = {
  superficies: { cardClaro: CARD_CLARO.hex, cardEscuro: CARD_ESCURO.hex },
  statusOrdem: STATUS_ORDEM,
  vivos: VIVOS,
  rotulosStatus: ROTULOS,
  paresRestritos: PARES_RESTRITOS.map(([a, b]) => `${a}×${b}`),
  paletas: OPCOES,
  medicoes,
  rotulos,
  mudancas,
  vereditos,
  hojeParesRestritos: ATUAL_REF.restritos,
  oklchDe: OKLCH_DE,
}

const comoJson = process.argv.includes('--json')
if (comoJson) {
  console.log(JSON.stringify(resultado, null, 2))
} else {
  console.log('=== SUPERFÍCIES ===')
  console.log(`card claro : ${CARD_CLARO.hex}   card escuro: ${CARD_ESCURO.hex}`)
  console.log(`Pares restritos (item 1): ${PARES_RESTRITOS.length} — TODOS os pares entre os 7 vivos.`)
  console.log()

  function imprimeOpcao(nome, titulo, paleta) {
    const porTema = paleta.claro ? paleta : { claro: paleta, escuro: paleta }
    console.log(`=== ${titulo} ===`)
    console.log('| status | hex claro | hex escuro | contraste claro | contraste escuro | fill claro | fill escuro |')
    console.log('|---|---|---|---:|---:|---|---|')
    const med = medicoes[nome]
    for (const s of STATUS_ORDEM) {
      const cc = med.claro.contrastes[s]
      const ce = med.escuro.contrastes[s]
      const rc = rotulos[nome].claro[s]
      const re = rotulos[nome].escuro[s]
      const okC = cc >= 3 ? '✅' : '⚠️'
      const okE = ce >= 3 ? '✅' : '⚠️'
      console.log(
        `| ${ROTULOS[s]} | \`${porTema.claro[s]}\` | \`${porTema.escuro[s]}\` | ${cc.toFixed(2)}:1 ${okC} | ${ce.toFixed(2)}:1 ${okE} | ${rc.fill} (${rc.razao.toFixed(2)}) | ${re.fill} (${re.razao.toFixed(2)}) |`,
      )
    }
    console.log('  Pior ΔE por visão, TODOS os 21 pares restritos (tema claro):')
    for (const [visao, v] of Object.entries(med.claro.piorRestrito)) {
      console.log(`    ${visao.padEnd(14)} ${v.par.padEnd(28)} ΔE ${v.valor.toFixed(2)}`)
    }
    if (paleta.claro) {
      console.log('  Pior ΔE por visão, TODOS os 21 pares restritos (tema ESCURO — paleta por tema difere):')
      for (const [visao, v] of Object.entries(med.escuro.piorRestrito)) {
        console.log(`    ${visao.padEnd(14)} ${v.par.padEnd(28)} ΔE ${v.valor.toFixed(2)}`)
      }
    }
    console.log()
  }

  imprimeOpcao('atual', '(a) ATUAL — manter', PALETA_ATUAL)
  console.log(`(c') MÍNIMA (régua ESTRITA) — veredito: ${MINIMA.ok ? 'OK' : 'FALHOU'} (folga ${MINIMA.folga.toFixed(2)})`)
  imprimeOpcao('minima', "(c') MÍNIMA — 3 tokens, valor único (régua estrita)", MINIMA.paleta)
  console.log(`(c') MÍNIMA (régua RELAXADA, só pisos 6/15) — veredito: ${MINIMA_RELAXADA.ok ? 'OK' : 'FALHOU'} (folga ${MINIMA_RELAXADA.folga.toFixed(2)})`)
  imprimeOpcao('minimaRelaxada', "(c') MÍNIMA — 3 tokens, valor único (régua relaxada)", MINIMA_RELAXADA.paleta)
  console.log(
    `(c'') POR TEMA — veredito: claro ${vereditos.porTemaClaro.ok ? 'OK' : 'FALHOU'} (folga ${vereditos.porTemaClaro.folga.toFixed(2)}), escuro ${vereditos.porTemaEscuro.ok ? 'OK' : 'FALHOU'} (folga ${vereditos.porTemaEscuro.folga.toFixed(2)})`,
  )
  imprimeOpcao('porTema', "(c'') POR TEMA — 3 tokens, valor por tema", POR_TEMA.paleta)
  console.log(`(b') SEPARADA — veredito da régua: ${veredictoSeparada.ok ? 'OK' : 'FALHOU'} (folga ${veredictoSeparada.folga.toFixed(2)})`)
  imprimeOpcao('separada', "(b') SEPARADA — 9 tokens reotimizados (todos os pares)", SEPARADA)

  writeFileSync(new URL('./resultado.json', import.meta.url), JSON.stringify(resultado, null, 2))
  console.log('resultado.json escrito ao lado deste script.')
}
