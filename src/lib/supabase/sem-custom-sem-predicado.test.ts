import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// `z.custom<T>()` SEM PREDICADO É CAST DISFARÇADO (F58 · Frente C).
//
// `z.custom<T>()` sem função de validação aceita QUALQUER valor em execução e devolve o tipo `T`
// ao compilador — é um `as T` escrito com a sintaxe do Zod. Numa forma de leitura ele desfaz as
// duas garantias da fase de uma vez: a amarração ao `select` passa (o tipo declarado cabe na
// coluna) e a conferência em execução não confere nada. `sem-cast-de-leitura.test.ts` procura
// `as`; esta trava procura a outra grafia do mesmo cast. A revisão do lote 2 achou dois
// (`termos_gerados.dados` e `eventos_admin.detalhe`), trocados por forma de verdade e `z.json()`.
//
// Reprova toda chamada `.custom()` SEM argumento em `src/**` fora de teste. `z.custom<T>(fn)`, com
// o predicado, continua permitido — ali existe uma conferência.

const RAIZ = process.cwd()

export function customSemPredicado(fonte: string, nomeArquivo = 'arquivo.ts'): number[] {
  const sf = ts.createSourceFile(
    nomeArquivo,
    fonte,
    ts.ScriptTarget.Latest,
    true,
    nomeArquivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const linhas: number[] = []
  const visitar = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'custom' &&
      n.arguments.length === 0
    ) {
      linhas.push(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1)
    }
    ts.forEachChild(n, visitar)
  }
  visitar(sf)
  return linhas
}

function varrer(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) varrer(p, acc)
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts') && !/\.test\.tsx?$/.test(e.name)) acc.push(p)
  }
  return acc
}

const ARQUIVOS = varrer(join(RAIZ, 'src'))
const ACHADOS = ARQUIVOS.flatMap((p) =>
  customSemPredicado(readFileSync(p, 'utf8'), p).map((l) => `${relative(RAIZ, p).split(sep).join('/')}:${l}`),
)

describe('o detector de z.custom sem predicado (guarda do próprio teste)', () => {
  it.each([
    ['sem argumento', 'const f = z.custom<Json>()'],
    ['encadeado', 'const f = z.custom<{ a: string }>().nullable()'],
  ])('acusa: %s', (_n, fonte) => {
    expect(customSemPredicado(fonte)).toHaveLength(1)
  })
  it.each([
    ['com predicado', "const f = z.custom<string>((v) => typeof v === 'string')"],
    ['z.json', 'const f = z.json()'],
    ['comentário', '// z.custom<Json>()'],
  ])('não acusa: %s', (_n, fonte) => {
    expect(customSemPredicado(fonte)).toEqual([])
  })
  it('a varredura enxerga o src', () => {
    expect(ARQUIVOS.length).toBeGreaterThan(200)
  })
})

describe('nenhum z.custom sem predicado em src/**', () => {
  it('zero', () => {
    expect(
      ACHADOS,
      '`z.custom<T>()` sem predicado aceita qualquer valor e só muda o tipo — é um cast. Declare a forma de verdade ' +
        '(`z.strictObject`/`z.looseObject`), use `z.json()` para jsonb de forma livre, ou passe o predicado.',
    ).toEqual([])
  })
})
