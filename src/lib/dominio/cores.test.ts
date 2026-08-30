import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  STATUS_CHART_COLOR,
  STATUS_META,
  STATUS_ORDEM,
  pillTipo,
  pillTipoLancamento,
} from '@/lib/dominio'
import { semComentarios } from '@/lib/layout/texto-fonte'
import { TOKEN_PARA_HEX } from '@/lib/relatorios/rotulo-grafico'

// A CATRACA DA COR CRUA (F40) — e a trava TS↔CSS dos tokens de selo.
//
// O repositório irmão pôde escrever `expect(paletaCrua).toBeNull()` porque tinha
// DUAS ocorrências. O WAP tinha **555 em 60 arquivos** quando esta fase começou.
// Um teste absoluto ficaria vermelho por semanas, e teste vermelho por semanas é
// teste que se aprende a ignorar — que é o oposto do que este repositório faz.
//
// A CATRACA É A RESPOSTA HONESTA: o teste guarda um TETO DECLARADO que só pode
// descer. O que já é absoluto é o miolo — `src/lib/dominio.ts`, o vocabulário
// importado por 146 arquivos, não escreve mais paleta nem hex, e isso é
// `toBeNull()` de verdade.
//
// ⚠ ESTE ARQUIVO MORA NUM DIRETÓRIO `src/lib/dominio/` QUE CONVIVE COM O ARQUIVO
// `src/lib/dominio.ts`. A resolução do TypeScript e do Vite prefere o arquivo com
// extensão ao diretório, então os 146 imports de `@/lib/dominio` continuam
// apontando para o mesmo lugar — verificado com `lint`, `test`, `tsc --noEmit` e
// `build` na entrega da F40. Se um dia alguém criar `src/lib/dominio/index.ts`, a
// ambiguidade deixa de ser teórica: quebre o `dominio.ts` em módulos ANTES, não
// depois.

const RAIZ = process.cwd()
const DOMINIO = semComentarios(readFileSync(join(RAIZ, 'src/lib/dominio.ts'), 'utf8'))
const CSS = readFileSync(join(RAIZ, 'src/app/globals.css'), 'utf8')

/**
 * A MESMA expressão do inventário (`docs/PLANO-DESIGN-SYSTEM.md` §1.6), letra
 * por letra. Trocá-la por outra "melhor" invalidaria a comparação com a linha de
 * base de 555 — e a catraca vale exatamente por ser comparável.
 */
const PALETA_DO_TAILWIND =
  /\b(bg|text|border|ring|fill|stroke)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-(50|100|200|300|400|500|600|700|800|900|950)\b/g

/**
 * O ORÇAMENTO DE COR CRUA. Este número é uma DÍVIDA, e a única direção permitida
 * é para baixo. Baixou? Atualize aqui, NO MESMO COMMIT — é assim que o teto vira
 * catraca em vez de enfeite. Subiu? O teste reprova, e a pergunta certa é "por
 * que esta tela não usa um token de selo?".
 *
 * | quando | pelo grep do inventário | só o CÓDIGO | arquivos |
 * | --- | ---: | ---: | ---: |
 * | 30/08/2026, antes da F40 | 555 | **550** | 60 |
 * | F40 — só a fundação (tokens + `dominio.ts`) | 491 | **479** | 60 |
 *
 * A CATRACA CONTA O CÓDIGO, não o `grep`. O inventário do plano usa `grep`, que
 * não distingue código de comentário, e por isso mede 555 onde o código tem 550
 * — as 5 diferenças são os hex e as classes que `dominio.ts` cita em prosa para
 * documentar a decisão de cor da F32. Contar comentário faria a guarda punir
 * quem EXPLICA o que fez, que é o contrário do que este repositório quer. Os dois
 * números estão registrados acima para a comparação com o plano continuar
 * possível.
 *
 * A meta ao fim das cinco frentes é o teto abaixo de 120 (plano §7).
 */
const TETO_PALETA_CRUA = 479
const ARQUIVOS_COM_PALETA = 60

/**
 * Todo `.ts`/`.tsx` de `src`, SEM comentários — a mesma abrangência do grep do
 * inventário, com a correção explicada acima.
 */
function fontesDeSrc(): { arquivo: string; texto: string }[] {
  const achadas: { arquivo: string; texto: string }[] = []
  const visitar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome)
      if (statSync(caminho).isDirectory()) {
        visitar(caminho)
        continue
      }
      if (!nome.endsWith('.ts') && !nome.endsWith('.tsx')) continue
      achadas.push({
        arquivo: relative(RAIZ, caminho).split(sep).join('/'),
        texto: semComentarios(readFileSync(caminho, 'utf8')),
      })
    }
  }
  visitar(join(RAIZ, 'src'))
  return achadas
}

/**
 * O corpo de um bloco do CSS, pelo nome do seletor.
 *
 * `indexOf('.dark')` NÃO serve: a primeira ocorrência de `.dark` no arquivo é a
 * do `@custom-variant`, na linha 13, antes do `:root` — fatiar por ela devolveria
 * um trecho vazio e o teste passaria a medir o nada. Foi a armadilha nº 7 do
 * repositório irmão. Aqui se ancora no seletor com a chave, e o `.dark` do WAP
 * ainda mora DENTRO de um `@media not print` (F19), então ele é indentado: daí o
 * `^\s*`.
 */
function blocoCss(seletor: string): string {
  const re = new RegExp(
    `^\\s*${seletor.replace('.', '\\.')}\\s*\\{([\\s\\S]*?)^\\s*\\}`,
    'm',
  )
  const achado = re.exec(CSS)
  if (!achado) throw new Error(`bloco ${seletor} nao encontrado em globals.css`)
  return achado[1]
}

/** As nove famílias de selo, na ordem do plano §3.5. */
const FAMILIAS = [
  'em-estoque',
  'reservado',
  'em-uso',
  'emprestado',
  'em-triagem',
  'em-manutencao',
  'descartado',
  'devolvido-fornecedor',
  'troca',
] as const

// 1 · O MIOLO ESTÁ LIMPO — e isto é absoluto, não catraca -------------------

describe('o vocabulario do sistema so fala por token', () => {
  it('dominio.ts nao usa nenhuma cor da paleta de fabrica do Tailwind', () => {
    expect(
      DOMINIO.match(PALETA_DO_TAILWIND),
      'dominio.ts voltou a escrever paleta crua — a cor de status mora em ' +
        '--selo-<familia>, e o comentario de STATUS_META explica por que',
    ).toBeNull()
  })

  it('dominio.ts nao tem nenhum hex escrito a mao', () => {
    expect(
      DOMINIO.match(/#[0-9a-fA-F]{3,8}\b/g),
      'dominio.ts voltou a escrever hex — a tinta de grafico mora em ' +
        '--grafico-<familia>, e TOKEN_PARA_HEX espelha o valor para o Vitest',
    ).toBeNull()
  })

  it('toda classe de selo e de grafico aponta para um token, nunca para paleta', () => {
    const classes = [
      ...STATUS_ORDEM.map((s) => STATUS_META[s].badge),
      ...STATUS_ORDEM.map((s) => STATUS_CHART_COLOR[s]),
      pillTipo('compra'),
      pillTipo('saida'),
      pillTipo('devolucao'),
      pillTipo('troca'),
      pillTipo('estorno'), // o neutro
      pillTipoLancamento('entrada'),
      pillTipoLancamento('saida'),
      pillTipoLancamento('reserva'),
      pillTipoLancamento('liberacao'),
      pillTipoLancamento('retorno'),
      pillTipoLancamento('ajuste'),
    ]
    for (const classe of classes) {
      expect(classe.match(PALETA_DO_TAILWIND), `paleta crua em "${classe}"`).toBeNull()
      expect(classe.match(/#[0-9a-fA-F]{3,8}\b/), `hex em "${classe}"`).toBeNull()
    }
  })
})

// 2 · A CATRACA -------------------------------------------------------------

describe('a catraca da cor crua', () => {
  const porArquivo = fontesDeSrc()
    .map((f) => ({ arquivo: f.arquivo, n: (f.texto.match(PALETA_DO_TAILWIND) ?? []).length }))
    .filter((f) => f.n > 0)
    .sort((a, b) => b.n - a.n)
  const total = porArquivo.reduce((s, f) => s + f.n, 0)

  it(`o total nao passa de ${TETO_PALETA_CRUA}`, () => {
    expect(
      total,
      `A cor crua SUBIU (${total} > ${TETO_PALETA_CRUA}). O teto so desce. Os cinco piores ` +
        `arquivos hoje:\n  ` +
        porArquivo
          .slice(0, 5)
          .map((f) => `${f.n}× ${f.arquivo}`)
          .join('\n  '),
    ).toBeLessThanOrEqual(TETO_PALETA_CRUA)
  })

  it('quando o total desce, o teto desce junto (no mesmo commit)', () => {
    // Sem esta metade a catraca vira enfeite: o número ficaria congelado no valor
    // de uma fase antiga e pararia de proteger coisa nenhuma. A folga de 5 existe
    // para uma frente não ser bloqueada por dois ou três acertos incidentais.
    expect(
      total,
      `A cor crua desceu para ${total} e o teto continua em ${TETO_PALETA_CRUA}. ` +
        `Abaixe TETO_PALETA_CRUA neste mesmo commit.`,
    ).toBeGreaterThan(TETO_PALETA_CRUA - 6)
  })

  it('o numero de arquivos com cor crua esta registrado', () => {
    expect(porArquivo.length, 'atualize ARQUIVOS_COM_PALETA').toBe(ARQUIVOS_COM_PALETA)
  })
})

// 3 · A TRAVA TS↔CSS --------------------------------------------------------

describe('os tokens de selo existem de verdade no CSS', () => {
  const claro = blocoCss(':root')
  const escuro = blocoCss('.dark')

  it.each(FAMILIAS)('a familia %s tem fundo e tinta nos DOIS temas', (familia) => {
    for (const [nome, trecho] of [
      [':root', claro],
      ['.dark', escuro],
    ] as const) {
      expect(trecho, `${nome} sem --selo-${familia}`).toContain(`--selo-${familia}:`)
      expect(trecho, `${nome} sem --selo-${familia}-texto`).toContain(
        `--selo-${familia}-texto:`,
      )
    }
  })

  it.each(FAMILIAS)('a familia %s tem apelido no @theme inline', (familia) => {
    // Sem o apelido, `bg-selo-<familia>` não gera CSS nenhum no Tailwind v4 — a
    // classe existiria no JSX e não pintaria nada, em silêncio.
    expect(CSS).toContain(`--color-selo-${familia}: var(--selo-${familia});`)
    expect(CSS).toContain(
      `--color-selo-${familia}-texto: var(--selo-${familia}-texto);`,
    )
  })

  it('toda classe de selo escrita em dominio.ts aponta para um token declarado', () => {
    const declarados = new Set(
      [...CSS.matchAll(/--color-(selo-[a-z-]+):/g)].map((m) => m[1]),
    )
    const usados = new Set<string>()
    for (const m of DOMINIO.matchAll(/\b(?:bg|text|border)-(selo-[a-z-]+)\b/g)) {
      usados.add(m[1])
    }
    expect(usados.size, 'dominio.ts parou de usar tokens de selo').toBeGreaterThanOrEqual(9)
    for (const nome of usados) {
      expect(
        declarados.has(nome),
        `dominio.ts usa "${nome}", que nao existe em globals.css`,
      ).toBe(true)
    }
  })

  it('o valor do token e literal, nunca var() — senao o medidor o ignora em silencio', () => {
    // `scripts/contraste.mjs` resolve por `parseOklch ?? parseHex ?? corLiteral`;
    // `var(--outro)` devolve null e a linha some da régua sem acusar nada. É o que
    // já acontece com --chart-1/--chart-2, e o que não pode acontecer aqui.
    for (const trecho of [claro, escuro]) {
      for (const m of trecho.matchAll(/--(selo-[a-z-]+):\s*(.+?);/g)) {
        expect(m[2].trim(), `--${m[1]} nao e literal`).toMatch(/^(oklch\(|#)/)
      }
    }
    for (const m of blocoCss(':root').matchAll(/--(grafico-[a-z-]+):\s*(.+?);/g)) {
      expect(m[2].trim(), `--${m[1]} nao e literal`).toMatch(/^(oklch\(|#)/)
    }
  })
})

// 4 · A TRAVA DA TINTA DE GRÁFICO (a armadilha de fillRotuloSegmento) -------

describe('a tinta de grafico atravessa a fronteira CSS -> Vitest', () => {
  const claro = blocoCss(':root')
  const doCss = new Map(
    [...claro.matchAll(/--(grafico-[a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]),
  )

  it('as nove familias de grafico estao declaradas no :root', () => {
    expect(doCss.size).toBe(9)
  })

  it.each([...STATUS_ORDEM])(
    'o status %s aponta para um token de grafico que TOKEN_PARA_HEX conhece',
    (status) => {
      const valor = STATUS_CHART_COLOR[status]
      expect(valor, `${status} nao usa token de grafico`).toMatch(
        /^var\(--grafico-[a-z-]+\)$/,
      )
      // A ARMADILHA: `fillRotuloSegmento` cai em luminância 0 — e o rótulo sai
      // branco sobre fundo claro, calado — para todo valor que `TOKEN_PARA_HEX`
      // não conheça.
      expect(
        TOKEN_PARA_HEX[valor],
        `${valor} nao esta em TOKEN_PARA_HEX (rotulo-grafico.ts): o rotulo do segmento ` +
          `sairia branco sobre fundo claro, em silencio`,
      ).toBeDefined()
    },
  )

  it('o hex de TOKEN_PARA_HEX e o mesmo do globals.css, familia por familia', () => {
    for (const [familia, hex] of doCss) {
      expect(
        TOKEN_PARA_HEX[`var(--${familia})`]?.toLowerCase(),
        `TOKEN_PARA_HEX divergiu do globals.css em --${familia}`,
      ).toBe(hex.toLowerCase())
    }
  })
})
