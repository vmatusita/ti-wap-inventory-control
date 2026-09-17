import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Recusa as RecusaCusto, validarDirFora as dirForaCusto } from './medir-custo.mjs'
import { Recusa as RecusaRel, validarDirFora as dirForaRel } from './medir-rel.mjs'
import { Recusa as RecusaEquivalencia, validarDirFora as dirForaEquivalencia } from './equivalencia-rel.mjs'

// OS INSTRUMENTOS DA F60 — `medir-rel.mjs` (o motor, A1–A4), `medir-custo.mjs` (o custo, B1–B8) e, desde o lote 2,
// `equivalencia-rel.mjs` (a equivalência velho × novo e o custo dos corpos novos, que o cabeçalho da 0143 cita). Sem banco.
//
// Os dois geraram as linhas de base "antes" de PRODUÇÃO (PLAN-F60 §3.2–§3.5), e o "depois" da fase tem de
// rodar o MESMO arquivo — ou declarar a diferença. A revisão do lote 1 (revisor 3, 16/09/2026) achou as
// duas metades dessa promessa soltas:
//
//  1. a GUARDA DE `--dir` (achado 2). Os comandos e as respostas do canal moram FORA do repositório — é o
//     que impede o SQL de medição e a saída de produção de entrarem na árvore do git. A versão de
//     `medir-rel.mjs` que entrou no lote liberava a própria raiz (`--dir=.`), e as duas liberavam uma pasta
//     interna chamada `..algo` (`startsWith('..')`). Aqui a régua fica presa para os dois.
//  2. a IDENTIDADE (achado 3). O plano pedia gravar o sha256 do original (medido) E o da versão versionada;
//     só o original foi gravado. O PLAN-F60 §0 agora traz os dois, e esta suíte reprova o instrumento que
//     mudar sem a tabela mudar junto — a diferença entre o que mediu o "antes" e o que vai medir o "depois"
//     nunca fica calada. O hash é o do texto com CRLF → LF (a régua do `migrations.lock.json`), então o
//     `core.autocrlf` da máquina não muda o resultado.
//
// Lê o disco na COLETA, nunca dentro do `it`.

const RAIZ = fileURLToPath(new URL('../..', import.meta.url))
const PLANO = readFileSync(join(RAIZ, 'docs', 'PLAN-F60.md'), 'utf8')

type Instrumento = { nome: string; sha: string; bytes: number }
const INSTRUMENTOS: Instrumento[] = ['medir-rel.mjs', 'medir-custo.mjs', 'equivalencia-rel.mjs'].map((nome) => {
  const texto = readFileSync(join(RAIZ, 'scripts', 'perf', nome), 'utf8').replace(/\r\n/g, '\n')
  return { nome, sha: createHash('sha256').update(texto, 'utf8').digest('hex'), bytes: Buffer.byteLength(texto, 'utf8') }
})

/** `46055` → `46.055`, como a tabela do plano escreve. */
const milhar = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

const GUARDAS = [
  ['medir-rel.mjs', dirForaRel, RecusaRel],
  ['medir-custo.mjs', dirForaCusto, RecusaCusto],
  ['equivalencia-rel.mjs', dirForaEquivalencia, RecusaEquivalencia],
] as const

describe('1. a guarda de `--dir` — fora do repositório, exatamente', () => {
  it.each(GUARDAS)('%s recusa a raiz, a pasta interna e a pasta interna que começa com `..`', (_nome, guarda, Recusa) => {
    for (const dir of [RAIZ, join(RAIZ, 'docs', 'perf'), join(RAIZ, '..rascunho'), join(RAIZ, '..rascunho', 'comandos')]) {
      expect(() => guarda(dir), dir).toThrow(Recusa)
      expect(() => guarda(dir), dir).toThrow(/dentro do repositório/)
    }
  })

  it.each(GUARDAS)('%s recusa `--dir` ausente', (_nome, guarda) => {
    expect(() => guarda(undefined)).toThrow(/obrigatório/)
    expect(() => guarda('')).toThrow(/obrigatório/)
  })

  it.each(GUARDAS)('%s aceita o pai do repositório e o que está abaixo dele', (_nome, guarda) => {
    for (const dir of [join(RAIZ, '..'), join(RAIZ, '..', 'fora-do-repo', 'comandos-f60')]) {
      expect(() => guarda(dir), dir).not.toThrow()
    }
  })
})

describe('2. a identidade — o sha256 (LF) de cada instrumento versionado está no PLAN-F60 §0', () => {
  it.each(INSTRUMENTOS)('$nome', ({ nome, sha, bytes }) => {
    const linha = PLANO.split('\n').find((l) => l.startsWith(`| \`scripts/perf/${nome}\``))
    expect(linha, `a linha da versão versionada de ${nome} na tabela do PLAN-F60 §0`).toBeDefined()
    expect(linha, 'sha256 (LF) — mudou o instrumento? regrave a linha e declare a diferença').toContain(`\`${sha}\``)
    expect(linha).toContain(`| ${milhar(bytes)} |`)
  })

  it('os originais que mediram o "antes" continuam na tabela (a outra metade do par)', () => {
    expect(PLANO).toContain('`4ab7f71a71eb8a89b1d78f4b546516eb53688a83f42088f8f74f8144145f8eb2`')
    expect(PLANO).toContain('`3c42d047b12408c0e14564fd7d998f66624a1a016341577383086c9a5eff7ea1`')
    // lote 2 — o original da equivalência, que rodou fora do repositório
    expect(PLANO).toContain('`59e11125af7214bef3ad0d2e24f554884ddb6278385eb3374161c28e43a75c9d`')
  })
})
