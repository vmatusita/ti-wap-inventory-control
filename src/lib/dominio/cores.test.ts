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
import { cn } from '@/lib/utils'
import { EXCECOES_DE_TINTA, conferirTinta } from '@/lib/layout/regra-de-tinta'
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
 * | F42 — as telas de item no casco | — | **473** | **61** |
 * | F61 — a régua em admin/ e relatorios/, o verde de sucesso e o cromo por token | — | **413** | **53** |
 * | v1.66.4 — a mesma base SEM os testes (15 classes em 2 arquivos, ver abaixo) | — | **398** | **51** |
 * | v1.66.4 — a caixa de atenção âmbar por token (63 pares, item AB) | — | **272** | **45** |
 *
 * A v1.66.4 mudou o ALCANCE, e por isso a linha dupla: desde ela a catraca não
 * conta `*.test.ts` (o corte está na seção 2, com o motivo). Os 413 da F61 eram
 * 398 de tela e componente + 15 das sabotagens de `cores.test.ts` (14) e
 * `consistencia.test.ts` (1). A queda da troca é a diferença entre as duas linhas
 * de baixo: 126 classes, dois lados de cada um dos 63 pares.
 *
 * A F42 baixou o TOTAL em 6 e SUBIU a contagem de arquivos em 1, e as duas coisas
 * são a mesma mudança vista de dois ângulos:
 *  · desceram 6 porque o banner âmbar da conferência virou `<Aviso intencao="atencao">`
 *    (a tinta passou a sair do token `--warning`) e porque `saldos-filiais.tsx`,
 *    `transferir-item-celula.tsx` e `lancar-item-linha.tsx` deixaram de existir;
 *  · subiu 1 arquivo porque a tabela única e os pedaços do diálogo viraram cinco
 *    componentes onde antes havia dois arquivos grandes. O vermelho do "faltam N" e
 *    o âmbar do aviso de quantidade MUDARAM DE CASA, não nasceram: o mesmo número de
 *    ocorrências espalhado por mais arquivos.
 *
 * A contagem de arquivos é registro, não teto — o que só pode descer é o TOTAL.
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
const TETO_PALETA_CRUA = 272
const ARQUIVOS_COM_PALETA = 45

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
      // F45: teste de render (`*.test.tsx`) não é tela nem componente de produção —
      // varredura de código não o cobra. Mesmo corte que `fronteira-rsc.test.ts` já
      // fazia desde a F32; a ata está em docs/DECISOES.md (2026-09-05 · F45).
      if (nome.endsWith('.test.tsx')) continue
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
  // v1.66.4 — a catraca conta TELA e COMPONENTE, não teste. As sabotagens da regra
  // de tinta (seção 5) precisam escrever a classe crua para provar que ela reprova;
  // contá-las obrigaria a SUBIR o teto a cada sabotagem nova, e o teto só desce. É o
  // mesmo corte que a F45 já fazia para `*.test.tsx`.
  const porArquivo = fontesDeSrc()
    .filter((f) => !/\.test\.tsx?$/.test(f.arquivo))
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
    // v1.66.4 — a caixa de atenção âmbar (a seção 6 confere o VALOR; esta, a forma)
    for (const trecho of [claro, escuro]) {
      const achados = [...trecho.matchAll(/--(callout-atencao[a-z-]*):\s*(.+?);/g)]
      expect(achados, 'a familia --callout-atencao* sumiu de um dos temas').toHaveLength(3)
      for (const m of achados) {
        expect(m[2].trim(), `--${m[1]} nao e literal`).toMatch(/^oklch\(/)
      }
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

// 5 · A REGRA DE TINTA — o par que virou token não volta a ser escrito (F61) ----
//
// A catraca da seção 2 guarda o TOTAL; esta guarda o NOME. Para os pares que a F61
// transformou em token (o verde de sucesso; o texto do cromo e o texto sobre o
// amarelo da marca), a volta é proibida com lista de exceções NOMEADA — ver o
// cabeçalho de `src/lib/layout/regra-de-tinta.ts`, que explica por que a lista não é
// derivada dos comentários do CSS (proibiria 204 usos legítimos, 136 deles âmbar).

describe('a regra de tinta (F61)', () => {
  // Código de PRODUÇÃO: um teste que cita o par cru para provar que a regra o recusa
  // (como os casos abaixo) não é tela.
  const fontes = fontesDeSrc().filter((f) => !/\.test\.tsx?$/.test(f.arquivo))

  it('nenhum par proibido fora da lista de excecoes, e nenhuma excecao morta', () => {
    expect(conferirTinta(fontes)).toEqual([])
  })

  it('a lista de excecoes so encolhe (fechou a F61 vazia)', () => {
    expect(EXCECOES_DE_TINTA.length).toBeLessThanOrEqual(0)
  })

  // SABOTAGEM D, guardada como teste — código sintético em memória.
  it('o par cru do verde de sucesso num selo sintetico reprova', () => {
    const selo = {
      arquivo: 'src/components/admin/selo-sintetico.tsx',
      texto: '<Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">Ativo</Badge>',
    }
    const recusas = conferirTinta([...fontes, selo])
    expect(recusas.filter((r) => r.startsWith(selo.arquivo))).toHaveLength(4)
  })

  it('texto branco ou preto cru reprova, com qualquer variante', () => {
    const cromo = {
      arquivo: 'src/components/layout/cromo-sintetico.tsx',
      texto: '<header className="bg-brand-dark text-white hover:text-white/80"><b className="text-black">WAP</b></header>',
    }
    expect(conferirTinta([cromo], [])).toHaveLength(3)
  })

  it('uma excecao que nao casa com nada reprova', () => {
    const morta = { arquivo: 'src/components/x.tsx', trecho: 'bg-green-100', motivo: 'exceção inventada para a sabotagem' }
    expect(conferirTinta(fontes, [morta])).toContain(
      'exceção de tinta que não casa com nada: src/components/x.tsx "bg-green-100"',
    )
  })

  // v1.66.4 — até aqui um callout âmbar cru PASSAVA nesta regra (era o caso de
  // controle "legítimo"). Desde a família `--callout-atencao*`, o PAR claro+escuro
  // de mesmo valor do token reprova; a mesma cor clara com um `dark:` de outro valor
  // continua passando, porque no escuro ela é outra cor.
  it('o par cru da caixa de atencao ambar reprova, nas duas ordens e com o mesmo alfa', () => {
    const caixa = {
      arquivo: 'src/components/admin/callout-sintetico.tsx',
      texto:
        '<p className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" />\n' +
        '<p className="dark:text-amber-200/80 text-amber-900/80 dark:bg-amber-950/40 bg-amber-50" />',
    }
    const recusas = conferirTinta([caixa], [])
    expect(recusas).toHaveLength(5)
    expect(recusas.filter((r) => r.includes('use bg-callout-atencao'))).toHaveLength(2)
    expect(recusas.filter((r) => r.includes('use text-callout-atencao-texto'))).toHaveLength(2)
    expect(recusas.filter((r) => r.includes('use border-callout-atencao-borda'))).toHaveLength(1)
  })

  it('a cor clara do callout com um dark: de OUTRO valor passa, e o veu verde tambem', () => {
    const variantes = {
      arquivo: 'src/components/admin/variantes-sinteticas.tsx',
      texto:
        // o `dark:` opaco / de outro tom: é outra cor no escuro, fica com a catraca
        '<p className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" />\n' +
        // alfa diferente dos dois lados, e o `/60` que não é o do token
        '<p className="text-amber-900/80 dark:text-amber-200/70 border-amber-300 dark:border-amber-900/60" />\n' +
        // a classe clara com prefixo de estado não é o par
        '<p className="hover:bg-amber-50 dark:bg-amber-950/40" />\n' +
        '<div className="bg-green-950/30 border-green-600/40 text-green-700" />',
    }
    expect(conferirTinta([variantes], [])).toEqual([])
  })

  // Os dois achados da revisão final da v1.66.4, guardados como teste. A primeira
  // versão da regra lia a LINHA inteira e dava falso positivo nos dois primeiros; e
  // aceitava `!` só do lado claro. Hoje ela lê o TRECHO de classe, e o par é o exato.
  it('o par da caixa so reprova dentro do MESMO trecho de classe, e so na forma exata', () => {
    const naoSaoPar = {
      arquivo: 'src/components/admin/nao-sao-par.tsx',
      texto:
        // os dois ramos de um ternário: elementos diferentes na mesma linha
        '{a ? <span className="text-amber-900">X</span> : <span className="dark:text-amber-200">Y</span>}\n' +
        // a classe citada como TEXTO de tela, não como classe
        '<p className="text-amber-900">{"exemplo: dark:text-amber-200 e a classe antiga"}</p>\n' +
        // `!` e variante empilhada: outra cascata, o token mudaria a cor
        '<p className="!text-amber-900 dark:text-amber-200" />\n' +
        '<p className="text-amber-900 dark:!text-amber-200" />\n' +
        '<p className="text-amber-900 dark:hover:text-amber-200 md:dark:bg-amber-950/40 bg-amber-50" />',
    }
    expect(conferirTinta([naoSaoPar], [])).toEqual([])
    // e o par de verdade, no mesmo `cn()` mas no MESMO literal, continua reprovando
    const par = {
      arquivo: 'src/components/admin/par.tsx',
      texto: "className={cn('rounded-md p-3', ok && 'text-amber-900 dark:text-amber-200')}",
    }
    expect(conferirTinta([par], [])).toHaveLength(1)
  })
})

// 6 · A CAIXA DE ATENÇÃO ÂMBAR (v1.66.4 · item AB) ------------------------------
//
// A décima família de token. O que faz a troca não mover um pixel é o VALOR: cada
// token tem, em cada tema, exatamente o `oklch` da classe crua que ele substituiu. A
// F40 escreveu isso em comentário (`/* = green-100 */`); aqui o teste confere contra
// a própria paleta de fábrica, `node_modules/tailwindcss/theme.css` — o mesmo arquivo
// que o build consome e que `scripts/contraste.mjs` lê.

describe('a caixa de atencao ambar tem os valores exatos da classe crua que substituiu', () => {
  const PALETA = new Map(
    [
      ...readFileSync(join(RAIZ, 'node_modules/tailwindcss/theme.css'), 'utf8').matchAll(
        /--color-([a-z]+-\d+):\s*(oklch\([^)]*\));/g,
      ),
    ].map((m) => [m[1], m[2]]),
  )
  const claro = blocoCss(':root')
  const escuro = blocoCss('.dark')

  /** token → [classe crua do claro, classe crua do escuro] */
  const ORIGEM = {
    'callout-atencao': ['amber-50', 'amber-950/40'],
    'callout-atencao-texto': ['amber-900', 'amber-200'],
    'callout-atencao-borda': ['amber-300', 'amber-900'],
  } as const

  /** `oklch(27.9% 0.077 45.635)` + alfa 40 → os quatro números, para comparar sem depender de espaço. */
  function numeros(valor: string, alfaExtra?: string): number[] {
    const m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)%\s*)?\)$/.exec(valor.trim())
    if (!m) throw new Error(`valor fora do formato oklch(L% C H [/ A%]): ${valor}`)
    const alfa = m[4] ?? alfaExtra ?? '100'
    return [Number(m[1]), Number(m[2]), Number(m[3]), Number(alfa)]
  }

  function valorDoToken(bloco: string, token: string): string {
    const m = new RegExp(`--${token}:\\s*(.+?);`).exec(bloco)
    if (!m) throw new Error(`--${token} não declarado`)
    return m[1]
  }

  it.each(Object.keys(ORIGEM))('--%s = a classe crua, nos dois temas', (token) => {
    const [deClaro, deEscuro] = ORIGEM[token as keyof typeof ORIGEM]
    for (const [tema, bloco, classe] of [
      [':root', claro, deClaro],
      ['.dark', escuro, deEscuro],
    ] as const) {
      const [nome, alfa] = classe.split('/')
      const fabrica = PALETA.get(nome)
      expect(fabrica, `${nome} sumiu do theme.css do Tailwind`).toBeDefined()
      expect(
        numeros(valorDoToken(bloco, token)),
        `--${token} no ${tema} deixou de ser ${classe}: a caixa mudaria de cor`,
      ).toEqual(numeros(fabrica!, alfa))
    }
  })

  it('cada token tem apelido no @theme inline (senao a classe nao pinta nada)', () => {
    for (const token of Object.keys(ORIGEM)) {
      expect(CSS).toContain(`--color-${token}: var(--${token});`)
    }
  })

  it('o tailwind-merge le os tokens como COR, e eles substituem a cor do Card', () => {
    // Se o tailwind-merge não reconhecesse o nome como cor, `cn()` manteria
    // `bg-card` E `bg-callout-atencao` no mesmo elemento, e quem pinta passaria a
    // ser a ordem do CSS gerado — em silêncio. Os cartões da ficha usam exatamente
    // essa composição.
    expect(
      cn(
        'bg-card text-card-foreground border-border',
        'bg-callout-atencao text-callout-atencao-texto border-callout-atencao-borda',
      ),
    ).toBe('bg-callout-atencao text-callout-atencao-texto border-callout-atencao-borda')
    // e a LARGURA da borda (`border`) não é confundida com a cor
    expect(cn('border', 'border-callout-atencao-borda')).toBe('border border-callout-atencao-borda')
  })
})
