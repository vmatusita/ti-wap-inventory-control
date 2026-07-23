import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import {
  ehModuloUseServer,
  exportsInvalidosDeUseServer,
} from '@/lib/use-server-exports'

// GUARDA DE FORMA DOS MÓDULOS 'use server' (F13 · B1+B2).
//
// Em 22/07/2026 a linha `export type { ParMovimentacaoDia, PossivelDuplicataDia }`
// entrou em `src/lib/actions/movimentacoes.ts`. O transform de Server Actions
// tratou o re-export COM ESPECIFICADORES como export de valor, emitiu os dois
// identificadores sem binding e o módulo passou a morrer com `ReferenceError` na
// avaliação — derrubando TODA Server Action de TODA rota logada em produção, sem
// nenhum erro de build, lint ou teste.
//
// Bloco (a): a função pura. Bloco (b): a varredura real do `src/`, que é o que
// impede o retorno do defeito.

// ---------------------------------------------------------------------------
// (a) casos unitários da função pura
// ---------------------------------------------------------------------------

describe('ehModuloUseServer', () => {
  it('reconhece a diretiva na primeira linha', () => {
    expect(ehModuloUseServer("'use server'\n\nexport async function f() {}\n")).toBe(true)
  })

  it('aceita aspas duplas e ponto e vírgula', () => {
    expect(ehModuloUseServer('"use server";\nexport async function f() {}\n')).toBe(true)
  })

  it('aceita comentário antes da diretiva', () => {
    const fonte = [
      '// cabeçalho do arquivo',
      '/* bloco',
      '   de comentário */',
      "'use server'",
      'export async function f() {}',
    ].join('\n')
    expect(ehModuloUseServer(fonte)).toBe(true)
  })

  it('convive com outra diretiva no prólogo', () => {
    expect(ehModuloUseServer("'use strict'\n'use server'\n")).toBe(true)
  })

  it('é falso para "use client"', () => {
    expect(ehModuloUseServer("'use client'\nexport function C() { return null }\n")).toBe(false)
  })

  it('é falso quando a diretiva está DENTRO de uma função', () => {
    const fonte = ['export async function f() {', "  'use server'", '}'].join('\n')
    expect(ehModuloUseServer(fonte)).toBe(false)
  })

  it('é falso quando "use server" aparece só em comentário', () => {
    const fonte = ["// este arquivo não é 'use server'", 'export const X = 1'].join('\n')
    expect(ehModuloUseServer(fonte)).toBe(false)
  })

  it('é falso quando a diretiva vem depois dos imports', () => {
    const fonte = ["import x from 'y'", "'use server'"].join('\n')
    expect(ehModuloUseServer(fonte)).toBe(false)
  })
})

describe('exportsInvalidosDeUseServer — formas seguras', () => {
  it.each([
    ['função async', 'export async function x() {}'],
    ['default async', 'export default async function () {}'],
    ['alias de tipo', 'export type X = { a: number }'],
    // A forma da CORREÇÃO da F13: alias inline para um tipo importado.
    ['alias de tipo importado', 'export type X = Y & { a: number }'],
    ['interface', 'export interface I { a: number }'],
    ['declare', 'export declare const X: number'],
  ])('%s não acusa', (_nome, fonte) => {
    expect(exportsInvalidosDeUseServer(`'use server'\n${fonte}\n`)).toEqual([])
  })
})

describe('exportsInvalidosDeUseServer — formas que sobrevivem como valor', () => {
  it('REGRESSÃO F13: re-export de tipo com especificadores', () => {
    const fonte = [
      "'use server'",
      "import { type A, type B } from './q'",
      '',
      'export type { A, B }',
      '',
      'export async function f() {}',
    ].join('\n')
    expect(exportsInvalidosDeUseServer(fonte)).toEqual([
      { linha: 4, trecho: 'export type { A, B }', forma: 'especificadores' },
    ])
  })

  it.each([
    ['re-export de tipo com origem', "export type { X } from './y'", 'especificadores'],
    ['re-export de valor', 'export { x }', 'especificadores'],
    ['estrela', "export * from './y'", 'reexport-estrela'],
    ['estrela nomeada', "export * as ns from './y'", 'reexport-estrela'],
    ['const', 'export const X = 1', 'valor-nao-funcao'],
    ['class', 'export class C {}', 'valor-nao-funcao'],
    ['enum', 'export enum E { A }', 'valor-nao-funcao'],
    ['função síncrona', 'export function x() {}', 'funcao-sincrona'],
  ])('%s acusa 1 achado', (_nome, linha, forma) => {
    const achados = exportsInvalidosDeUseServer(`'use server'\n${linha}\n`)
    expect(achados).toHaveLength(1)
    expect(achados[0].forma).toBe(forma)
    expect(achados[0].linha).toBe(2)
  })

  it('re-export multi-linha acusa na linha do export', () => {
    const fonte = ["'use server'", '', 'export type {', '  A,', '  B,', '}'].join('\n')
    const achados = exportsInvalidosDeUseServer(fonte)
    expect(achados).toHaveLength(1)
    expect(achados[0].linha).toBe(3)
    expect(achados[0].forma).toBe('especificadores')
  })

  it('acusa TODOS os achados do arquivo, não só o primeiro', () => {
    const fonte = ["'use server'", 'export const A = 1', 'export { B }'].join('\n')
    expect(exportsInvalidosDeUseServer(fonte).map((a) => a.linha)).toEqual([2, 3])
  })
})

describe('exportsInvalidosDeUseServer — comentários e strings não contam', () => {
  it('ignora "export" dentro de comentário de linha e de bloco', () => {
    const fonte = [
      "'use server'",
      '// export const X = 1',
      '/*',
      'export { A }',
      '*/',
      'export async function f() {}',
    ].join('\n')
    expect(exportsInvalidosDeUseServer(fonte)).toEqual([])
  })

  it('ignora "export" dentro de template string', () => {
    const fonte = [
      "'use server'",
      'export async function f() {',
      '  return `',
      'export const X = 1',
      '`',
      '}',
    ].join('\n')
    expect(exportsInvalidosDeUseServer(fonte)).toEqual([])
  })

  it('não se perde com aspas dentro de literal de expressão regular', () => {
    const fonte = [
      "'use server'",
      'export async function f(s) {',
      "  return s.replace(/['\"]/g, '')",
      '}',
      'export { X }',
    ].join('\n')
    const achados = exportsInvalidosDeUseServer(fonte)
    expect(achados).toHaveLength(1)
    expect(achados[0].linha).toBe(5)
  })

  it('não confunde propriedade chamada "export"', () => {
    const fonte = ["'use server'", 'const o = {', '  export: true,', '}'].join('\n')
    expect(exportsInvalidosDeUseServer(fonte)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// (b) varredura REAL do repositório — a guarda que impede o retorno
// ---------------------------------------------------------------------------

const RAIZ_SRC = join(process.cwd(), 'src')

function varrerTs(dir: string): string[] {
  const achados: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) {
      achados.push(...varrerTs(caminho))
    } else if (/\.tsx?$/.test(entrada.name)) {
      achados.push(caminho)
    }
  }
  return achados
}

describe('nenhum módulo "use server" do src/ exporta valor além de função async', () => {
  const modulos = varrerTs(RAIZ_SRC)
    .filter((f) => ehModuloUseServer(readFileSync(f, 'utf8')))
    // caminho relativo com barra normal: o nome do caso de teste tem de ser o
    // mesmo no Windows e no CI.
    .map((f) => relative(process.cwd(), f).split(sep).join('/'))

  it('a varredura encontra módulos "use server" (guarda do próprio teste)', () => {
    expect(modulos.length).toBeGreaterThan(0)
  })

  it.each(modulos)('%s', (arquivo) => {
    const achados = exportsInvalidosDeUseServer(
      readFileSync(join(process.cwd(), arquivo), 'utf8'),
    )
    expect(
      achados,
      achados.length
        ? `${arquivo}: export que sobrevive como VALOR num módulo 'use server' ` +
            `(quebra o módulo inteiro em runtime — F13/B2):\n` +
            achados
              .map((a) => `  linha ${a.linha} [${a.forma}] ${a.trecho}`)
              .join('\n')
        : undefined,
    ).toEqual([])
  })
})
