import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import {
  catchesEngolidoresEmExportadas,
  chamadasDeConsole,
  ehModuloUseClient,
  ehModuloUseServer,
} from '@/lib/observabilidade-fonte'

// AS DUAS TRAVAS DE FORMA DA OBSERVABILIDADE (F55 · Frente A).
//
// (a) Nenhum `console.*` em código de SERVIDOR fora do funil.
// (b) Nenhum `} catch {` sem binding dentro de função exportada de módulo
//     `'use server'`.
//
// As duas nasceram VERMELHAS contra o repositório de 10/09/2026 — 76 chamadas de
// servidor e 6 blocos que engoliam a exceção. A saída dessa primeira execução
// está em `docs/f55-evidencias/`. Molde: `use-server-exports.test.ts` (F13).

const RAIZ_SRC = join(process.cwd(), 'src')

function varrerTs(dir: string): string[] {
  const achados: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) {
      achados.push(...varrerTs(caminho))
      // Mesmo corte de `use-server-exports.test.ts`: teste de render não é
      // módulo de produção.
    } else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
      achados.push(caminho)
    }
  }
  return achados
}

const rel = (f: string) => relative(process.cwd(), f).split(sep).join('/')

// ---------------------------------------------------------------------------
// (a) casos unitários das funções puras
// ---------------------------------------------------------------------------

describe('chamadasDeConsole', () => {
  it('acha a chamada de código', () => {
    const achados = chamadasDeConsole("const x = 1\nconsole.error('falhou', x)\n")
    expect(achados).toHaveLength(1)
    expect(achados[0]).toMatchObject({ linha: 2, metodo: 'error' })
  })

  it('ignora console dentro de comentário de linha e de bloco', () => {
    const fonte = ['// console.error("x")', '/*', 'console.warn(1)', '*/', 'const a = 1'].join('\n')
    expect(chamadasDeConsole(fonte)).toEqual([])
  })

  it('ignora console dentro de string e de template', () => {
    const fonte = ['const a = "console.log(1)"', 'const b = `console.info(2)`'].join('\n')
    expect(chamadasDeConsole(fonte)).toEqual([])
  })

  it('pega warn, log, info e debug, não só error', () => {
    const fonte = 'console.warn(1)\nconsole.log(2)\nconsole.info(3)\nconsole.debug(4)\n'
    expect(chamadasDeConsole(fonte).map((c) => c.metodo)).toEqual([
      'warn',
      'log',
      'info',
      'debug',
    ])
  })

  it('não confunde a MENÇÃO ao objeto com a chamada', () => {
    expect(chamadasDeConsole('const c = console\n')).toEqual([])
  })
})

describe('catchesEngolidoresEmExportadas', () => {
  it('acusa `catch {` dentro de função exportada', () => {
    const fonte = [
      "'use server'",
      'export async function f() {',
      '  try { await g() } catch {',
      '    return { ok: false }',
      '  }',
      '}',
    ].join('\n')
    const achados = catchesEngolidoresEmExportadas(fonte)
    expect(achados).toHaveLength(1)
    expect(achados[0]).toMatchObject({ linha: 3, funcao: 'f' })
  })

  it('NÃO acusa `catch (erro) {` — a forma que permite registrar', () => {
    const fonte = [
      "'use server'",
      'export async function f() {',
      '  try { await g() } catch (erro) {',
      '    registrarFalha({ escopo: "x", erro })',
      '  }',
      '}',
    ].join('\n')
    expect(catchesEngolidoresEmExportadas(fonte)).toEqual([])
  })

  it('NÃO acusa `catch {` fora de função exportada', () => {
    const fonte = [
      "'use server'",
      'function auxiliar() {',
      '  try { g() } catch {}',
      '}',
      'export async function f() { return auxiliar() }',
    ].join('\n')
    expect(catchesEngolidoresEmExportadas(fonte)).toEqual([])
  })

  // REGRESSÃO da própria trava: a primeira versão de `abreDoCorpo` tomava o `{`
  // de dentro do genérico do tipo de retorno pelo corpo da função, e o achado
  // real de `src/lib/actions/conflitos.ts:273` desaparecia.
  it('REGRESSÃO: genérico no tipo de retorno não engana a faixa da função', () => {
    const fonte = [
      "'use server'",
      'export async function f(input: {',
      '  a: string',
      '}): Promise<Resultado<{ ativos: number }>> {',
      '  try { await g() } catch {',
      '    return { ok: false }',
      '  }',
      '}',
    ].join('\n')
    const achados = catchesEngolidoresEmExportadas(fonte)
    expect(achados).toHaveLength(1)
    expect(achados[0].funcao).toBe('f')
  })

  it('ignora `catch` citado em comentário', () => {
    const fonte = [
      "'use server'",
      'export async function f() {',
      '  // um } catch { aqui seria proibido',
      '  return 1',
      '}',
    ].join('\n')
    expect(catchesEngolidoresEmExportadas(fonte)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// (b) a varredura REAL do `src/` — o que impede o retorno
// ---------------------------------------------------------------------------

// O FUNIL. É o único lugar do servidor que pode escrever no console — é a razão
// de ele existir.
const FUNIL = 'src/lib/observabilidade.ts'

/**
 * As EXCEÇÕES NOMINAIS de Client Component, com o motivo de cada uma.
 *
 * As dez logam no NAVEGADOR de quem opera: `server-only` não pode ser importado
 * de um módulo `'use client'`, e o log delas nunca chega ao servidor. O lado
 * SERVIDOR desses mesmos erros é apanhado por `src/instrumentation.ts`
 * (`onRequestError`), que é a outra metade da Frente A.
 *
 * ⚠ A lista é NOMINAL e o tamanho dela é afirmado abaixo: quem a aumentar tem
 * de dizer por escrito por que aquele arquivo é cliente. Uma exceção que cresce
 * em silêncio é a trava se desfazendo.
 */
const EXCECOES_DE_CLIENTE = [
  // Os oito `error.tsx` — a fronteira de erro do React, que o Next exige que
  // seja Client Component.
  'src/app/error.tsx',
  'src/app/(app)/error.tsx',
  'src/app/(app)/ativos/error.tsx',
  'src/app/(app)/itens/error.tsx',
  'src/app/(app)/itens/conferencia/error.tsx',
  'src/app/(app)/itens/historico/error.tsx',
  'src/app/(app)/movimentacoes/error.tsx',
  'src/app/(app)/pendencias/error.tsx',
  // O `global-error.tsx`, que substitui o layout inteiro e por isso também é
  // cliente.
  'src/app/global-error.tsx',
  // O botão de exportar CSV: o download acontece no navegador, e a falha dele
  // (Blob, âncora, permissão do browser) só existe lá.
  'src/components/layout/exportar-csv-button.tsx',
]

const arquivos = varrerTs(RAIZ_SRC)

describe('(a) nenhum `console.*` em código de servidor fora do funil', () => {
  const comConsole = arquivos
    .map((f) => ({ arquivo: rel(f), fonte: readFileSync(f, 'utf8') }))
    .map((a) => ({ ...a, chamadas: chamadasDeConsole(a.fonte) }))
    .filter((a) => a.chamadas.length > 0)

  it('a varredura encontra arquivos (guarda do próprio teste)', () => {
    expect(comConsole.length).toBeGreaterThan(0)
  })

  const doServidor = comConsole.filter(
    (a) => !ehModuloUseClient(a.fonte) && a.arquivo !== FUNIL,
  )

  it('nenhum arquivo de servidor chama console fora do funil', () => {
    const linhas = doServidor.flatMap((a) =>
      a.chamadas.map((c) => `  ${a.arquivo}:${c.linha} [console.${c.metodo}] ${c.trecho}`),
    )
    expect(
      linhas,
      linhas.length
        ? `console.* em código de SERVIDOR fora de ${FUNIL} — use ` +
            `registrarFalha({ escopo, erro, ctx }) (F55 · Frente A):\n${linhas.join('\n')}`
        : undefined,
    ).toEqual([])
  })

  it('toda exceção declarada é mesmo Client Component, e ainda existe', () => {
    for (const arquivo of EXCECOES_DE_CLIENTE) {
      const achado = comConsole.find((a) => a.arquivo === arquivo)
      expect(achado, `${arquivo} está na lista de exceções mas não chama console`).toBeDefined()
      expect(
        ehModuloUseClient(achado!.fonte),
        `${arquivo} está na lista de exceções mas NÃO é módulo 'use client'`,
      ).toBe(true)
    }
  })

  it('nenhum Client Component com console está FORA da lista nominal', () => {
    const fora = comConsole
      .filter((a) => ehModuloUseClient(a.fonte))
      .map((a) => a.arquivo)
      .filter((a) => !EXCECOES_DE_CLIENTE.includes(a))
    expect(
      fora,
      fora.length
        ? `Client Component novo com console.* — declare-o em EXCECOES_DE_CLIENTE ` +
            `com o motivo escrito, ou tire o console:\n  ${fora.join('\n  ')}`
        : undefined,
    ).toEqual([])
  })

  it('a lista nominal tem DEZ entradas (medido em 10/09/2026)', () => {
    // Se este número mudar, alguém acrescentou (ou tirou) uma exceção — e isso
    // é uma decisão, não um detalhe.
    expect(EXCECOES_DE_CLIENTE).toHaveLength(10)
  })
})

describe('(b) nenhum `} catch {` engolidor em módulo "use server"', () => {
  const modulos = arquivos
    .map((f) => ({ arquivo: rel(f), fonte: readFileSync(f, 'utf8') }))
    .filter((a) => ehModuloUseServer(a.fonte))

  it('a varredura encontra módulos "use server" (guarda do próprio teste)', () => {
    // 20 em 10/09/2026. `>= 1` porque o número é medido, não travado — quem
    // trava a FORMA dos exports é `use-server-exports.test.ts`.
    expect(modulos.length).toBeGreaterThan(0)
  })

  it('a diretiva, não a menção: os dois arquivos que só a citam ficam de fora', () => {
    // `guardas-de-action.ts` e `use-server-exports.ts` falam de 'use server' em
    // comentário nas primeiras linhas. Uma detecção por menção acharia 22
    // módulos onde há 20 — e cobraria de dois arquivos uma regra que não é
    // deles.
    for (const arquivo of [
      'src/lib/actions/guardas-de-action.ts',
      'src/lib/use-server-exports.ts',
    ]) {
      const fonte = readFileSync(join(process.cwd(), arquivo), 'utf8')
      expect(fonte, `${arquivo} deveria CITAR 'use server'`).toContain('use server')
      expect(
        ehModuloUseServer(fonte),
        `${arquivo} NÃO é módulo de Server Action — a trava está lendo a menção`,
      ).toBe(false)
    }
  })

  it.each(modulos.map((m) => m.arquivo))('%s', (arquivo) => {
    const achados = catchesEngolidoresEmExportadas(
      readFileSync(join(process.cwd(), arquivo), 'utf8'),
    )
    expect(
      achados,
      achados.length
        ? `${arquivo}: \`} catch {\` sem binding em função EXPORTADA de módulo ` +
            `'use server' — a exceção some sem rastro. Dê um nome ao erro e ` +
            `chame registrarFalha (F55 · Frente A):\n` +
            achados.map((a) => `  linha ${a.linha} em ${a.funcao}(): ${a.trecho}`).join('\n')
        : undefined,
    ).toEqual([])
  })
})
