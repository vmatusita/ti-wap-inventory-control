// F19 — cor do rótulo dentro do segmento da barra empilhada (P2-7).
//
// O rótulo era branco fixo a 10px: branco reprova o mínimo de 4,5:1 da WCAG em
// quase todos os segmentos (o verde do "em estoque" dá 3,3:1, o cinza do
// "defasado" dá 2,5:1). Como as cores de STATUS_CHART_COLOR são hex FIXOS — não
// são tokens de tema —, dá para escolher entre branco e preto pelo maior
// contraste UMA vez e valer igual no claro e no escuro.

// Espelha `--brand-azul` de src/app/globals.css (o único valor de
// STATUS_CHART_COLOR que é token CSS, não hex: `var(--color-brand-azul)`, do
// status `em_uso`). Duplicar aqui é proposital — este módulo é puro e roda no
// Vitest, sem CSSOM para resolver a variável. `rotulo-grafico.test.ts` lê o
// globals.css e quebra se alguém mudar o token sem atualizar esta constante.
export const BRAND_AZUL = '#2a78d6'

// Tokens CSS aceitos onde se espera um hex.
//
// F40 — os NOVE `--grafico-<familia>` entraram aqui, e essa entrada é OBRIGATÓRIA,
// não conveniência: desde a F40 `STATUS_CHART_COLOR` não escreve mais hex nenhum,
// e sem estas linhas TODA cor de barra chegaria a `canaisDoHex` como texto
// desconhecido, a luminância viraria 0 e os rótulos sairiam brancos sobre fundo
// claro — em silêncio, exatamente a armadilha que `dominio.ts` documenta.
//
// Os valores DUPLICAM `src/app/globals.css` de propósito: este módulo é puro e
// roda no Vitest, sem CSSOM para resolver variável. `src/lib/dominio/cores.test.ts`
// lê o globals.css e quebra se algum dos dez divergir — é a trava TS↔CSS.
export const TOKEN_PARA_HEX: Record<string, string> = {
  'var(--color-brand-azul)': BRAND_AZUL,
  'var(--brand-azul)': BRAND_AZUL,
  'var(--grafico-em-estoque)': '#16a34a',
  'var(--grafico-reservado)': '#6d28d9',
  'var(--grafico-em-uso)': BRAND_AZUL,
  'var(--grafico-emprestado)': '#06b6d4',
  'var(--grafico-em-triagem)': '#db2777',
  'var(--grafico-em-manutencao)': '#d97706',
  'var(--grafico-defasado)': '#9ca3af',
  'var(--grafico-descartado)': '#6b7280',
  'var(--grafico-devolvido-fornecedor)': '#64748b',
}

// #rgb ou #rrggbb (com ou sem alfa, que é ignorado — o rótulo é comparado com o
// fundo opaco da barra).
function canaisDoHex(hex: string): [number, number, number] | null {
  const bruto = TOKEN_PARA_HEX[hex.trim()] ?? hex.trim()
  const m = /^#([0-9a-f]{3,8})$/i.exec(bruto)
  if (!m) return null
  const d = m[1]
  if (d.length === 3 || d.length === 4) {
    return [
      parseInt(d[0] + d[0], 16),
      parseInt(d[1] + d[1], 16),
      parseInt(d[2] + d[2], 16),
    ]
  }
  if (d.length === 6 || d.length === 8) {
    return [
      parseInt(d.slice(0, 2), 16),
      parseInt(d.slice(2, 4), 16),
      parseInt(d.slice(4, 6), 16),
    ]
  }
  return null
}

// Linearização de canal da WCAG 2.1 (sRGB → luz).
function linearizar(canal8bits: number): number {
  const c = canal8bits / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

// Luminância relativa (WCAG 2.1, pesos 0.2126/0.7152/0.0722). Entrada que não
// seja hex nem token conhecido vale PRETO (0) — assim `fillRotuloSegmento` cai
// em `fill-white`, que era o comportamento anterior à F19: cor nova e ilegível
// é um bug visível, cor nova e invisível não.
export function luminanciaRelativa(hex: string): number {
  const canais = canaisDoHex(hex)
  if (!canais) return 0
  const [r, g, b] = canais
  return 0.2126 * linearizar(r) + 0.7152 * linearizar(g) + 0.0722 * linearizar(b)
}

// Razão de contraste WCAG entre duas cores: (Lclara + 0,05) / (Lescura + 0,05).
// Vai de 1 (iguais) a 21 (preto × branco). O mínimo para texto é 4,5:1.
export function contrasteWcag(hexA: string, hexB: string): number {
  const a = luminanciaRelativa(hexA)
  const b = luminanciaRelativa(hexB)
  const clara = Math.max(a, b)
  const escura = Math.min(a, b)
  return (clara + 0.05) / (escura + 0.05)
}

// Classe Tailwind do rótulo desenhado DENTRO do segmento: branco ou preto, o de
// maior contraste sobre a cor da barra. Com as 7 cores de status em uso hoje o
// vencedor sempre passa de 4,5:1.
export function fillRotuloSegmento(corBarra: string): string {
  return contrasteWcag(corBarra, '#ffffff') >= contrasteWcag(corBarra, '#000000')
    ? 'fill-white'
    : 'fill-black'
}

// F29/REL-06a — QUANDO desenhar o número dentro do segmento empilhado.
//
// O corte era `>= 2`: um segmento de valor 1 ficava sem rótulo E sem tooltip, ou
// seja, ilegível em canal NENHUM — e era justamente onde o par âmbar × laranja de
// então se confundia para daltônicos (a F32 desfez o par: a triagem virou rosa, e
// o rótulo continua sendo o canal que não depende de cor nenhuma). Com o tooltip
// entrando junto (o desempate por hover),
// o corte pode descer para 1 — mas só quando a barra COMPORTA: um "1" ao lado de
// uma barra de 400 sai por cima do vizinho e piora a leitura.
//
// A largura do segmento é proporcional ao total da linha mais larga, então
// `valor / maxTotal` é a fração da área de plotagem que ele ocupa. 4% é o menor
// pedaço que ainda cabe dois dígitos a 11px nas larguras que o card usa (~320px no
// celular): abaixo disso o número seria desenhado por cima do segmento vizinho.
export const FRACAO_MINIMA_ROTULO = 0.04

export function deveRotularSegmento(valor: number, maxTotal: number): boolean {
  if (!Number.isFinite(valor) || valor < 1) return false
  if (!Number.isFinite(maxTotal) || maxTotal <= 0) return false
  return valor / maxTotal >= FRACAO_MINIMA_ROTULO
}

// F29/REL-06b — QUANDO desenhar o rótulo de valor em cima de cada barra da série
// temporal. Em período longo (preset "Este ano" com balde diário) os números
// colidem e viram uma tarja ilegível; acima do teto eles somem e entra um eixo Y
// enxuto, com o valor exato ficando no tooltip (que a série sempre teve).
export const MAX_PONTOS_COM_ROTULO = 20

export function mostrarRotulosDaSerie(qtdPontos: number): boolean {
  return qtdPontos <= MAX_PONTOS_COM_ROTULO
}
