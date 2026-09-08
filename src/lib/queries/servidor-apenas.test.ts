import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { limpar } from '@/lib/use-server-exports'

// A TRAVA DA FRONTEIRA RSC — F49. RODA SEM BANCO.
//
// Duas metades, e elas defendem coisas diferentes:
//
// (1) CATRACA — todo módulo de `src/lib/queries/**` declara `import 'server-only'`.
//     O pacote `server-only` não faz nada em runtime: ele existe para que o bundler
//     do Next FALHE quando um módulo marcado assim for alcançado pelo grafo do
//     cliente. Sem ele, arrastar uma query para um Client Component é um import que
//     compila — e o que vai junto para o navegador não é só a função: é o `select`,
//     os nomes de coluna e, nos sete módulos de `queries/relatorios/**`, o caminho
//     que o VISUALIZADOR POR SENHA percorre com SERVICE ROLE. É lá que a ausência
//     custava mais caro, e era lá que ela estava: os sete não declaravam nada.
//     Medido em 07/09/2026: 28 módulos, 5 com a declaração, 23 sem.
//
// (2) PROIBIÇÃO — nenhum módulo `'use client'` importa VALOR de `@/lib/queries/*`.
//
//     ⚠ ESTA METADE NASCE VERDE, e isso está escrito aqui de propósito. Medido em
//     07/09/2026: 170 módulos `'use client'` fazem 67 imports de `@/lib/queries`, e
//     os 67 são `import type` — ZERO imports de valor. Ela não conserta nada hoje;
//     o que ela faz é impedir a REGRESSÃO.
//
//     E ela NÃO é redundante com o `npm run build`, ao contrário do que seria
//     natural supor. Medido na mesma data, com a sabotagem rodada duas vezes:
//       · import de valor USADO      → o build QUEBRA (Turbopack acusa a cadeia
//         inteira até `server-only`) e a trava também acusa;
//       · import de valor NÃO USADO  → o build PASSA LIMPO (o compilador elide o
//         binding antes de o grafo do cliente alcançar `server-only`), e só a trava
//         acusa.
//     Ou seja: o import morto entra no repositório sem que nada reclame, e fica lá
//     esperando a primeira linha que o use. É exatamente assim que uma fronteira
//     volta a ser atravessada meses depois, num commit que "só usa o que já estava
//     importado". A trava fecha essa janela; o build, sozinho, não fecha.
//
//     E ela distingue `import type` de import de VALOR ESPECIFICADOR A ESPECIFICADOR,
//     porque `import { type A, b }` é import de valor por causa do `b`. Uma trava que
//     confundisse as duas formas nasceria com 67 falsos positivos e seria desligada
//     na primeira semana.
//
// O QUE ESTA SUÍTE **NÃO** PROVA
//  · `server-only` protege o BUNDLE, não a rede. Ele impede que a query vá para o
//    navegador; não impede nada de quem chama a Server Action que a usa por POST
//    direto. Essa é a outra fronteira, e quem a guarda é
//    `src/lib/actions/guardas-de-action.test.ts`.
//  · A trava lê o TEXTO do import. Um `await import('@/lib/queries/x')` dinâmico
//    dentro de um módulo cliente não é reconhecido (não existe no repositório) — mas
//    o `npm run build` continua pegando, porque o grafo do bundler é real.

const RAIZ = process.cwd()
const RAIZ_SRC = join(RAIZ, 'src')
const PASTA_QUERIES = join(RAIZ_SRC, 'lib', 'queries')

/**
 * Módulos de `lib/queries` dispensados de `server-only`.
 *
 * ⚠ VAZIA, e é para continuar assim. O único candidato que existia —
 * `queries/prefixo-busca.ts`, puro, sem uma linha de banco — foi MOVIDO para
 * `src/lib/busca/prefixo.ts` na F49 (Decisão 2) em vez de virar exceção: uma pasta
 * chamada `queries/` que significa "toca o banco" não precisa de exceção nenhuma, e
 * uma catraca que estreia com uma exceção estreia afrouxada.
 *
 * Se um dia entrar alguma coisa aqui, ela vem com motivo escrito, como as isenções
 * de `guardas-de-action.test.ts`.
 */
const DISPENSADOS: Record<string, string> = {}

function varrer(dir: string, filtro: (nome: string) => boolean): string[] {
  const achados: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) achados.push(...varrer(caminho, filtro))
    else if (filtro(entrada.name)) achados.push(caminho)
  }
  return achados
}

const rel = (f: string) => relative(RAIZ, f).split(sep).join('/')

// ---------------------------------------------------------------------------
// (1) A catraca do `server-only`
// ---------------------------------------------------------------------------

const MODULOS_QUERY = varrer(
  PASTA_QUERIES,
  (n) => /\.ts$/.test(n) && !/\.test\.ts$/.test(n),
).map(rel)

/**
 * O módulo declara `import 'server-only'` DE VERDADE — e não só menciona a string
 * num comentário. É por isso que a checagem roda sobre a fonte neutralizada.
 */
function declaraServerOnly(fonte: string): boolean {
  return /(^|\n)\s*import\s+['"]server-only['"]/.test(limpar(fonte, false))
}

describe('todo módulo de lib/queries declara server-only', () => {
  it('a varredura enxerga a pasta (guarda do próprio teste)', () => {
    expect(MODULOS_QUERY.length).toBeGreaterThan(20)
  })

  it.each(MODULOS_QUERY)('%s', (arquivo) => {
    if (arquivo in DISPENSADOS) return
    const fonte = readFileSync(join(RAIZ, arquivo), 'utf8')
    expect(
      declaraServerOnly(fonte),
      `${arquivo} não declara \`import 'server-only'\`.\n` +
        `Sem ele, este módulo pode ser arrastado para o bundle do CLIENTE por um import\n` +
        `descuidado, levando junto o \`select\` e os nomes de coluna — e, se for de\n` +
        `queries/relatorios/**, o caminho que o visualizador por senha percorre com\n` +
        `SERVICE ROLE. Acrescente a linha no topo do arquivo.`,
    ).toBe(true)
  })

  it('a lista de dispensados está vazia — e cada entrada exige motivo escrito', () => {
    for (const [arquivo, motivo] of Object.entries(DISPENSADOS)) {
      expect(motivo.length, `${arquivo}: motivo curto demais para ser um motivo`).toBeGreaterThan(
        60,
      )
    }
    expect(
      Object.keys(DISPENSADOS).length,
      'DISPENSADOS cresceu. Um módulo de queries/ que não precisa de server-only ' +
        'provavelmente não é uma query — considere movê-lo para fora da pasta, como a ' +
        'F49 fez com prefixo-busca.ts (Decisão 2).',
    ).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// (2) A proibição de import de VALOR em módulo cliente
// ---------------------------------------------------------------------------

/** O arquivo declara `'use client'` no prólogo (aspas simples OU duplas). */
function ehModuloCliente(fonte: string): boolean {
  for (const linha of limpar(fonte, false).split('\n')) {
    const texto = linha.trim()
    if (texto === '') continue
    const m = /^(['"])([^'"]*)\1\s*;?\s*$/.exec(texto)
    if (!m) return false // primeira linha de código: o prólogo acabou
    if (m[2].trim() === 'use client') return true
  }
  return false
}

export type ImportDeQuery = {
  linha: number
  declaracao: string
  /** `true` quando ALGUM especificador é de valor (o que quebraria o build). */
  temValor: boolean
}

/**
 * Os imports de `@/lib/queries*` do arquivo, classificados.
 *
 * As formas que existem no repositório (medidas em 07/09/2026) e como cada uma é
 * classificada:
 *   `import type { A } from '…'`        → TIPO   (o `type` vale para a chave inteira)
 *   `import type { A, B } from '…'`     → TIPO   (inclusive multilinha)
 *   `import { type A } from '…'`        → TIPO   (todo especificador é de tipo)
 *   `import { type A, b } from '…'`     → VALOR  ⚠ por causa do `b`
 *   `import { A } from '…'`             → VALOR
 *   `import A from '…'` / `import * as` → VALOR
 *   `import '…'`                        → VALOR  (efeito colateral: executa o módulo)
 */
export function importsDeQuery(fonte: string): ImportDeQuery[] {
  const limpo = limpar(fonte, false)
  const achados: ImportDeQuery[] = []
  // Multilinha (`[\s\S]`) para alcançar `import type {\n A,\n B\n} from …`, mas com
  // `from` TEMPERADO: `(?!\bfrom\b)` impede o miolo de atravessar o `from` de OUTRO
  // import. Sem essa tempera, o `*?` — lazy mas irrestrito — engolia o bloco de
  // imports inteiro até achar o primeiro que terminasse em `@/lib/queries`, e um
  // arquivo com 20 imports acusava um falso "import de valor" gigante (medido na
  // própria F49, 07/09/2026).
  const re = /^[ \t]*import\b((?:(?!\bfrom\b)[\s\S])*?)from\s*['"](@\/lib\/queries[^'"]*)['"]/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(limpo)) !== null) {
    const miolo = m[1]
    const linha = limpo.slice(0, m.index).split('\n').length
    const declaracao = m[0].replace(/\s+/g, ' ').trim()

    // `import type { … }` / `import type X` — a chave `type` vale para tudo.
    if (/^\s*type\b/.test(miolo)) {
      achados.push({ linha, declaracao, temValor: false })
      continue
    }

    const chaves = /\{([\s\S]*)\}/.exec(miolo)
    if (!chaves) {
      // `import X from` / `import * as X from` — sempre valor.
      achados.push({ linha, declaracao, temValor: true })
      continue
    }
    // Default + chaves (`import D, { … }`) já é valor pelo default.
    const temDefault = /^[^{]*[A-Za-z0-9_$]/.test(miolo.slice(0, miolo.indexOf('{')))
    const especificadores = chaves[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    // ESPECIFICADOR A ESPECIFICADOR: basta UM sem `type` para o import ser de valor.
    const algumDeValor = especificadores.some((e) => !/^type\s/.test(e))
    achados.push({ linha, declaracao, temValor: temDefault || algumDeValor })
  }

  // `import '@/lib/queries/x'` sem `from` — efeito colateral, executa o módulo.
  const reEfeito = /^[ \t]*import\s*['"](@\/lib\/queries[^'"]*)['"]/gm
  while ((m = reEfeito.exec(limpo)) !== null) {
    const linha = limpo.slice(0, m.index).split('\n').length
    achados.push({ linha, declaracao: m[0].trim(), temValor: true })
  }
  return achados
}

const MODULOS_CLIENTE = varrer(
  RAIZ_SRC,
  (n) => /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n),
).filter((f) => ehModuloCliente(readFileSync(f, 'utf8')))

describe('nenhum módulo cliente importa VALOR de lib/queries', () => {
  it('a varredura enxerga módulos cliente (guarda do próprio teste)', () => {
    expect(MODULOS_CLIENTE.length).toBeGreaterThan(100)
  })

  it('a varredura enxerga os imports de query que existem (guarda do próprio teste)', () => {
    // Se este número for a zero, a metade (2) estaria "verde" por não olhar nada.
    const total = MODULOS_CLIENTE.reduce(
      (n, f) => n + importsDeQuery(readFileSync(f, 'utf8')).length,
      0,
    )
    expect(total).toBeGreaterThan(50)
  })

  it('nenhum import de valor', () => {
    const fora: string[] = []
    for (const f of MODULOS_CLIENTE) {
      for (const imp of importsDeQuery(readFileSync(f, 'utf8'))) {
        if (imp.temValor) fora.push(`${rel(f)}:${imp.linha} — ${imp.declaracao}`)
      }
    }
    expect(
      fora,
      fora.length
        ? `Módulo 'use client' importando VALOR de @/lib/queries.\n` +
            `Isso arrasta a query (e o \`select\` dela) para o bundle do navegador.\n` +
            `⚠ Se o binding ainda não estiver SENDO USADO, o \`npm run build\` passa limpo\n` +
            `(o compilador o elide) — este teste é a única coisa que o pega agora.\n\n` +
            fora.map((l) => `  ${l}`).join('\n') +
            `\n\nO padrão do repositório é uma Server Action de proxy (F10 · CONTRATO §1.5):\n` +
            `o Client Component chama a action, a action chama a query. Se só o TIPO for\n` +
            `preciso, use \`import type\` — o TypeScript o apaga e nada vai para o bundle.`
        : undefined,
    ).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// (3) A leitura de imports sabe distinguir tipo de valor — casos unitários
// ---------------------------------------------------------------------------
//
// Sem estes casos, a metade (2) poderia estar verde por não reconhecer NENHUMA
// forma. É a diferença entre "não achei import de valor" e "não sei ler import".

describe('importsDeQuery distingue tipo de valor', () => {
  const casos: Array<[string, string, boolean]> = [
    ['import type com chaves', "import type { A } from '@/lib/queries/ativos'", false],
    ['import type sem chaves', "import type A from '@/lib/queries/ativos'", false],
    ['especificadores todos de tipo', "import { type A } from '@/lib/queries/ativos'", false],
    ['dois especificadores de tipo', "import { type A, type B } from '@/lib/queries/ativos'", false],
    ['MISTO — type + valor', "import { type A, b } from '@/lib/queries/ativos'", true],
    ['MISTO — valor + type', "import { b, type A } from '@/lib/queries/ativos'", true],
    ['valor simples', "import { a } from '@/lib/queries/ativos'", true],
    ['default', "import a from '@/lib/queries/ativos'", true],
    ['estrela', "import * as a from '@/lib/queries/ativos'", true],
    ['efeito colateral', "import '@/lib/queries/ativos'", true],
  ]

  it.each(casos)('%s', (_nome, fonte, esperado) => {
    const r = importsDeQuery(fonte)
    expect(r, `não reconheceu o import: ${fonte}`).toHaveLength(1)
    expect(r[0].temValor).toBe(esperado)
  })

  it('reconhece import type MULTILINHA (a forma de fila-consolidacao.tsx)', () => {
    const fonte = [
      'import type {',
      '  ResumoConsolidacao,',
      '  TextoDeColaborador,',
      "} from '@/lib/queries/colaboradores'",
    ].join('\n')
    const r = importsDeQuery(fonte)
    expect(r).toHaveLength(1)
    expect(r[0].temValor).toBe(false)
  })

  it('reconhece import de VALOR multilinha', () => {
    const fonte = ['import {', '  algumaCoisa,', "} from '@/lib/queries/itens'"].join('\n')
    const r = importsDeQuery(fonte)
    expect(r).toHaveLength(1)
    expect(r[0].temValor).toBe(true)
  })

  it('ignora import de query que está dentro de um COMENTÁRIO', () => {
    const fonte = "// import { a } from '@/lib/queries/ativos'\nexport const x = 1"
    expect(importsDeQuery(fonte)).toHaveLength(0)
  })

  it('ignora import de outro caminho', () => {
    expect(importsDeQuery("import { a } from '@/lib/actions/ativos'")).toHaveLength(0)
  })
})

describe('ehModuloCliente', () => {
  it('reconhece aspas simples', () => {
    expect(ehModuloCliente("'use client'\nexport function C() {}")).toBe(true)
  })

  it('reconhece aspas duplas (17 arquivos do repositório usam esta forma)', () => {
    expect(ehModuloCliente('"use client"\nexport function C() {}')).toBe(true)
  })

  it('é falso para use server', () => {
    expect(ehModuloCliente("'use server'\nexport async function a() {}")).toBe(false)
  })

  it('é falso quando a diretiva vem depois de um import', () => {
    expect(ehModuloCliente("import x from 'y'\n'use client'")).toBe(false)
  })

  it('aceita comentário antes da diretiva', () => {
    expect(ehModuloCliente("// cabeçalho\n'use client'\n")).toBe(true)
  })

  it('enxerga o arquivo com BOM', () => {
    // `src/components/relatorios/use-filtros-tabela.ts` começa com U+FEFF. Um `grep`
    // ancorado em `^'use client'` NÃO o encontra — foi assim que uma contagem de mesa
    // desta mesma fase deu 169 em vez de 170. Aqui ele é enxergado porque `trim()`
    // remove o BOM (U+FEFF é WhiteSpace na especificação), e este caso existe para
    // que ninguém "otimize" o `trim()` para fora sem que o teste reclame.
    expect(ehModuloCliente("﻿'use client'\nexport function C() {}")).toBe(true)
  })
})
