// O PORTÃO de ΔE da paleta de gráfico de status — Passo 5 da reauditoria de
// dívida técnica, item AA (22/09/2026, decisão do Johnny: MANTER as cores,
// registrar os alívios, criar o portão. Nenhum hex muda; nenhum pixel muda).
//
// Até aqui a distinguibilidade de `STATUS_CHART_COLOR` (dominio.ts) só era
// medida à MÃO, num script avulso (docs/aa-evidencias/medir.mjs)
// — nenhum teste automatizado a protegia. Trocar um hex de gráfico não quebrava
// nada: só degradava a leitura para quem enxerga cores diferente, em silêncio.
// Este módulo é o portão: toda proposta de mexer num hex de `STATUS_CHART_COLOR`
// passa a ser medida por `paleta-graficos.test.ts`, que reprova o `npm run test`
// se (a) um par cair abaixo do piso sem alívio registrado, (b) um alívio já
// registrado piorar além da tolerância, ou (c) um alívio deixar de ser
// necessário — a lista de ALIVIOS não pode apodrecer.
//
// MÉTODO — o mesmo de docs/ANALISE-RELATORIOS-2026-08-10.md §4 e da medição do
// Passo 5 (docs/aa-evidencias/medir.mjs — conferida por uma reimplementação independente
// na revisão, mesma paleta e mesmos 21 pares, bateram na 2ª casa decimal):
//   · sRGB → OKLab: as matrizes de Björn Ottosson (OKLab spec) — as mesmas que
//     `scripts/contraste.mjs` usa no sentido inverso (oklch → sRGB) para medir
//     luminância; aqui o caminho é sRGB → OKLab, para medir DISTÂNCIA.
//   · Simulação de daltonismo: Machado, G. M.; Oliveira, M. M.; Fernandes, L. A. F.
//     "A Physiologically-based Model for Simulation of Color Vision Deficiency."
//     IEEE Transactions on Visualization and Computer Graphics, 15(6), 2009 —
//     as três matrizes de severidade 1.0 (protanopia, deuteranopia, tritanopia),
//     aplicadas em sRGB LINEAR.
//   · ΔE: distância euclidiana em OKLab ×100. Não é CIEDE2000 — é a métrica que
//     a casa já usa nesta régua desde a análise de 10/08.
//   · Pisos: visão normal ΔE ≥ 15 (portão duro); as três simulações de
//     daltonismo ΔE ≥ 6 (mínimo, portão duro) / ≥ 8 (alvo — informativo, não
//     reprova sozinho).
//
// A régua mede TODOS os C(7,2) = 21 pares entre os 7 status VIVOS — não só os
// vizinhos adjacentes de `STATUS_ORDEM`. Motivo (levantado no Passo 5): a pilha
// empilhada FILTRA status zerado (`agregarAcervoPorSituacao`, acervo.ts), então
// qualquer um dos 7 pode acabar do lado de qualquer outro dependendo do que
// estiver zerado numa filial; o glossário (grade 2 colunas, legendas.tsx) e os
// KPI tiles (3 grades responsivas, kpi-tiles.tsx) também colocam pares
// não-adjacentes lado a lado. 16 dos 21 pares são vizinhos pela posição nas
// grades reais; os outros 5 encostam quando a pilha esconde um status zerado —
// por isso a régua usa o conjunto inteiro, não um recorte.

import { STATUS_ORDEM, type StatusAtivo } from '@/lib/dominio'
import { FORA_DO_ACERVO } from '@/lib/relatorios/acervo'

// ---------------------------------------------------------------------------
// 1. sRGB (hex) -> sRGB linear -> OKLab
// ---------------------------------------------------------------------------

export type Rgb = readonly [number, number, number]

// sRGB gamma (0..1) -> linear — definição WCAG 2.1, a mesma de scripts/contraste.mjs.
function gammaParaLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

// #rrggbb -> sRGB linear (0..1). Só a forma de 6 dígitos — é a única que
// `STATUS_CHART_COLOR`/`TOKEN_PARA_HEX` usam.
export function hexParaLinear(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`paleta-graficos: hex invalido "${hex}"`)
  const n = parseInt(m[1], 16)
  return [
    gammaParaLinear(((n >> 16) & 255) / 255),
    gammaParaLinear(((n >> 8) & 255) / 255),
    gammaParaLinear((n & 255) / 255),
  ]
}

// sRGB linear -> OKLab. Matrizes de Björn Ottosson (OKLab spec).
export function linearParaOklab([r, g, b]: Rgb): Rgb {
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

// ---------------------------------------------------------------------------
// 2. Simulação de daltonismo — Machado, Oliveira & Fernandes (2009), sev. 1.0.
// ---------------------------------------------------------------------------

export type Cvd = 'protanopia' | 'deuteranopia' | 'tritanopia'
export type Visao = 'normal' | Cvd

export const VISOES: readonly Visao[] = ['normal', 'protanopia', 'deuteranopia', 'tritanopia']

const MATRIZES_CVD: Record<Cvd, readonly [Rgb, Rgb, Rgb]> = {
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

export function simularCvd(linear: Rgb, tipo: Cvd): Rgb {
  const M = MATRIZES_CVD[tipo]
  const bruto: Rgb = [
    M[0][0] * linear[0] + M[0][1] * linear[1] + M[0][2] * linear[2],
    M[1][0] * linear[0] + M[1][1] * linear[1] + M[1][2] * linear[2],
    M[2][0] * linear[0] + M[2][1] * linear[1] + M[2][2] * linear[2],
  ]
  const limitar = (v: number) => Math.min(1, Math.max(0, v))
  return [limitar(bruto[0]), limitar(bruto[1]), limitar(bruto[2])]
}

// ΔE = distância euclidiana em OKLab ×100 (docs/ANALISE-RELATORIOS-2026-08-10.md §4).
export function deltaE(hexA: string, hexB: string, visao: Visao = 'normal'): number {
  const linA = hexParaLinear(hexA)
  const linB = hexParaLinear(hexB)
  const [a, b] = visao === 'normal' ? [linA, linB] : [simularCvd(linA, visao), simularCvd(linB, visao)]
  const oa = linearParaOklab(a)
  const ob = linearParaOklab(b)
  const d = Math.sqrt((oa[0] - ob[0]) ** 2 + (oa[1] - ob[1]) ** 2 + (oa[2] - ob[2]) ** 2)
  return d * 100
}

// ---------------------------------------------------------------------------
// 3. Os 7 status VIVOS e os 21 pares entre eles.
// ---------------------------------------------------------------------------

// FORA_DO_ACERVO é o mesmo conjunto que `acervo.ts` já exclui da foto do
// estoque (baixa definitiva, nunca empilha) — reusado em vez de duplicado.
export const STATUS_VIVOS: readonly StatusAtivo[] = STATUS_ORDEM.filter(
  (s) => !FORA_DO_ACERVO.includes(s),
)

export type ParStatus = readonly [StatusAtivo, StatusAtivo]

// TODOS os C(n,2) pares — não só os vizinhos adjacentes de `STATUS_ORDEM`. Ver
// o cabeçalho do arquivo: a pilha empilhada, o glossário e os KPI tiles colocam
// pares não-adjacentes lado a lado, então qualquer par pode encostar.
export function pares(vivos: readonly StatusAtivo[] = STATUS_VIVOS): ParStatus[] {
  const out: ParStatus[] = []
  for (let i = 0; i < vivos.length; i++) {
    for (let j = i + 1; j < vivos.length; j++) out.push([vivos[i], vivos[j]])
  }
  return out
}

export function chavePar([a, b]: ParStatus): string {
  return `${a}×${b}`
}

// ---------------------------------------------------------------------------
// 4. Pisos e a lista de ALÍVIOS.
//
// Decisão do Johnny (Passo 5 · item AA, 22/09/2026): MANTER a paleta e
// registrar os pares que já nascem abaixo do piso hoje, em vez de redesenhar a
// língua de cor do relatório inteiro. As outras três opções medidas no levantamento
// custam mais do que valem: (c') mínima (só os 3 tokens que reprovam contraste)
// NUNCA fecha esta régua, em nenhuma leitura; (c'') por tema exige que
// `TOKEN_PARA_HEX`/`fillRotuloSegmento` passem a conhecer tema (o branco/preto
// do rótulo FLIPA entre claro e escuro) e reverte a decisão documentada de
// `globals.css` ("--grafico-* são valor único nos dois temas"); (b') separação
// completa redesenha 6 dos 9 tokens. O levantamento inteiro, com os números de
// cada opção: docs/aa-evidencias/levantamento.md.
// ---------------------------------------------------------------------------

export const PISO_NORMAL = 15
export const PISO_CVD_MINIMO = 6
// Informativo — a régua não reprova sozinha por ficar entre o mínimo e o alvo.
export const PISO_CVD_ALVO = 8

export interface Alivio {
  readonly par: string // chavePar(a, b) — ver acima
  readonly visao: Visao
  readonly valor: number
  readonly piso: number
  readonly justificativa: string
  readonly data: string
}

// Medido em `docs/aa-evidencias/medir.mjs` e conferido de forma
// independente na revisão — os únicos DOIS pontos (par×visão), dos 21×4 = 84
// medidos, que caem abaixo do piso hoje. Nenhum outro par fica abaixo de 15 em
// visão normal nem abaixo de 6 em nenhuma simulação — os dois mais próximos do
// piso (em_estoque×em_manutencao 6,17 em protanopia; em_estoque×em_triagem 6,14
// em deuteranopia) já passam do mínimo, com folga de 0,14–0,17.
export const ALIVIOS: readonly Alivio[] = [
  {
    par: 'emprestado×defasado',
    visao: 'normal',
    valor: 11.33,
    piso: PISO_NORMAL,
    justificativa:
      'o segmento nunca depende só da cor: rótulo de valor dentro da barra, total na ponta, ' +
      'legenda com o nome escrito e tooltip — 4 canais de texto além da tinta (mesmo ' +
      'precedente dos alívios de contraste do item F32 em scripts/contraste.mjs). Nenhuma ' +
      'das 3 alternativas medidas na reauditoria de 22/09/2026 (mínima / por tema / ' +
      'separação completa) fecha esta régua sem trocar a identidade visual de pelo menos ' +
      '2 tokens — custa mais do que vale (ata do passo 5 em docs/DECISOES.md).',
    data: '22/09/2026',
  },
  {
    par: 'emprestado×defasado',
    visao: 'protanopia',
    valor: 5.63,
    piso: PISO_CVD_MINIMO,
    justificativa:
      'mesmo par, mesma razão da entrada de visão normal acima — 5,63 fica abaixo até do ' +
      'piso MÍNIMO (6), não só do alvo (8); os mesmos 4 canais de texto do segmento ' +
      '(rótulo, total, legenda, tooltip) continuam sendo a rede de segurança.',
    data: '22/09/2026',
  },
]

// ---------------------------------------------------------------------------
// 5. O portão — decide OK/FALHOU sobre uma paleta hex, e diz exatamente O QUÊ.
// ---------------------------------------------------------------------------

export interface Violacao {
  readonly par: string
  readonly visao: Visao
  readonly valor: number
  readonly piso: number
}

export interface ResultadoPortao {
  readonly ok: boolean
  // (a) abaixo do piso, sem alívio nenhum registrado para este par×visão.
  readonly semAlivio: readonly Violacao[]
  // (b) alívio registrado, mas o valor medido piorou além da tolerância.
  readonly aliviosPioraram: readonly Violacao[]
  // (c) alívio registrado para um par×visão que HOJE já passa do piso — a
  // lista não pode apodrecer.
  readonly aliviosVencidos: readonly Alivio[]
}

// Tolerância de ruído numérico entre o valor registrado e o medido (item 2 da
// ordem: "todo alívio cujo valor medido PIOROU além do registrado, tolerância 0,01").
const TOLERANCIA_ALIVIO = 0.01

function chaveAlivio(par: string, visao: Visao): string {
  return `${par}·${visao}`
}

// Avalia os 21 pares (ou o subconjunto de `vivos`) de uma paleta hex por status
// contra os pisos e a lista de ALIVIOS. `hexPorStatus` é a paleta REAL a medir
// — quem chama resolve o hex (normalmente STATUS_CHART_COLOR + TOKEN_PARA_HEX,
// ver `paleta-graficos.test.ts`).
export function avaliarPortao(
  hexPorStatus: Readonly<Partial<Record<StatusAtivo, string>>>,
  vivos: readonly StatusAtivo[] = STATUS_VIVOS,
): ResultadoPortao {
  const mapaAlivios = new Map(ALIVIOS.map((al) => [chaveAlivio(al.par, al.visao), al]))
  const aliviosVistos = new Set<string>()

  const semAlivio: Violacao[] = []
  const aliviosPioraram: Violacao[] = []
  const aliviosVencidos: Alivio[] = []

  for (const parStatus of pares(vivos)) {
    const [a, b] = parStatus
    const hexA = hexPorStatus[a]
    const hexB = hexPorStatus[b]
    const par = chavePar(parStatus)
    if (!hexA || !hexB) {
      throw new Error(`paleta-graficos: falta o hex de "${!hexA ? a : b}" para avaliar ${par}`)
    }
    for (const visao of VISOES) {
      const valor = deltaE(hexA, hexB, visao)
      const piso = visao === 'normal' ? PISO_NORMAL : PISO_CVD_MINIMO
      const chave = chaveAlivio(par, visao)
      const alivio = mapaAlivios.get(chave)

      if (valor < piso) {
        if (!alivio) {
          semAlivio.push({ par, visao, valor, piso })
        } else {
          aliviosVistos.add(chave)
          if (valor < alivio.valor - TOLERANCIA_ALIVIO) {
            aliviosPioraram.push({ par, visao, valor, piso })
          }
        }
      } else if (alivio) {
        aliviosVistos.add(chave)
        aliviosVencidos.push(alivio)
      }
    }
  }

  // Alívio cujo par×visão nunca apareceu na varredura acima (nome que não
  // existe mais entre os vivos, visão digitada errada) — sinal de que a lista
  // descreve algo que a régua atual nem consegue checar.
  for (const al of ALIVIOS) {
    const chave = chaveAlivio(al.par, al.visao)
    if (!aliviosVistos.has(chave)) aliviosVencidos.push(al)
  }

  return {
    ok: semAlivio.length === 0 && aliviosPioraram.length === 0 && aliviosVencidos.length === 0,
    semAlivio,
    aliviosPioraram,
    aliviosVencidos,
  }
}

// Mensagens pt-BR prontas para `expect(valor, mensagem)` — nomeiam par, visão,
// valor medido e piso.
export function descreverViolacoes(titulo: string, violacoes: readonly Violacao[]): string {
  if (violacoes.length === 0) return ''
  const linhas = violacoes.map(
    (v) => `  · ${v.par}, visão ${v.visao}: ΔE medido ${v.valor.toFixed(2)}, piso ${v.piso}`,
  )
  return `${titulo}:\n${linhas.join('\n')}`
}

export function descreverAliviosVencidos(alivios: readonly Alivio[]): string {
  if (alivios.length === 0) return ''
  const linhas = alivios.map(
    (al) =>
      `  · ${al.par}, visão ${al.visao} (registrado ΔE ${al.valor}, piso ${al.piso}, ${al.data}) — ` +
      'o par já passa do piso hoje: tire a linha de ALIVIOS',
  )
  return `alívio(s) vencido(s):\n${linhas.join('\n')}`
}
