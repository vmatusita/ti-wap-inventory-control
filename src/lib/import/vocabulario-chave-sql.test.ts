import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { corpoVigente } from '../../../scripts/db/corpo-vigente.mjs'
import { normalizarTexto } from './deparas'

// GUARDA TS↔SQL de `public.vocabulario_chave` (F56 · Frente D, Decisão 1).
//
// Molde `src/lib/colaboradores/chave-sql.test.ts` (F37), adaptado de "tabela de
// translate" para "duas faixas de regex" (medição B da F56, §6): extrai do CORPO
// VIGENTE (`corpo-vigente.mjs`, não a migration — a `0139` nunca se edita, mas o
// corpo pode ser recriado por uma migration futura) os `chr(<n>)` da faixa de
// diacríticos e da classe de espaço, e compara com o conjunto DERIVADO AO VIVO —
// nunca com um número copiado de cabeça, que é exatamente o tipo de divergência que
// a medição B encontrou (o `\s` do Postgres nativo diverge do `\s` do JavaScript em 7
// pontos, para os DOIS lados).
//
// Este teste NASCE VERMELHO antes da migration 0139 existir.

const RAIZ = process.cwd()
const ASSINATURA = 'public.vocabulario_chave(text)'

// -----------------------------------------------------------------------------
// 1) Os conjuntos DERIVADOS AO VIVO — nunca copiados de cabeça.
// -----------------------------------------------------------------------------

/** Todo code point do BMP (0..0xFFFF) que o `\s` do PRÓPRIO JavaScript trata como
 *  espaço — a mesma medição da medição B (Resultado 1), reexecutada aqui como parte
 *  do teste, não como número congelado. São 25, inclusive U+FEFF (BOM) e U+1680
 *  (Ogham Space Mark) — os dois pontos que uma leitura apressada da medição B (cuja
 *  bateria não cobriu a faixa 0x1000-0x1FFF) deixaria de fora. */
function espacosDoJsAoVivo(): Set<number> {
  const codepoints = new Set<number>()
  for (let cp = 0; cp <= 0xffff; cp++) {
    if (/\s/.test(String.fromCodePoint(cp))) codepoints.add(cp)
  }
  return codepoints
}

/** A faixa de diacríticos que `deparas.ts` usa — lida do PRÓPRIO texto-fonte (não
 *  importada: `DIACRITICOS` não é exportada, e não precisa ser só para este teste). */
function faixaDiacriticosDeDeparas(): { de: number; ate: number } {
  const fonte = readFileSync(join(RAIZ, 'src', 'lib', 'import', 'deparas.ts'), 'utf8')
  // No ARQUIVO (texto cru), o escape `̀` de dentro de uma string JS vem
  // grafado com DUAS barras invertidas (`\\u0300`) — é assim que o editor grava
  // o caractere de escape `\` dentro do literal `'...'`. Por isso a regex busca
  // `\\\\u` (quatro barras no PADRÃO = duas barras invertidas LITERAIS no texto).
  const m = fonte.match(/DIACRITICOS\s*=\s*new RegExp\('\[\\\\u([0-9a-fA-F]{4})-\\\\u([0-9a-fA-F]{4})\]'/)
  if (!m) throw new Error('não achei DIACRITICOS em deparas.ts (formato mudou?)')
  return { de: parseInt(m[1]!, 16), ate: parseInt(m[2]!, 16) }
}

// -----------------------------------------------------------------------------
// 2) O que o corpo VIGENTE de vocabulario_chave declara — extraído do texto SQL.
// -----------------------------------------------------------------------------

/** Um trecho `chr(N)` isolado, ou um trecho `chr(N) || '-' || chr(M)` (RANGE) —
 *  devolve o conjunto de code points que ele representa. */
function codepointsDoTrecho(trecho: string): Set<number> {
  const partes = trecho
    .split('||')
    .map((p) => p.trim())
    .filter((p) => p !== '')
  const codepoints = new Set<number>()
  let i = 0
  while (i < partes.length) {
    const atual = partes[i]!
    const mChr = atual.match(/^chr\((\d+)\)$/)
    if (!mChr) {
      i += 1
      continue
    }
    const n = Number(mChr[1])
    const proximo = partes[i + 1]
    const depoisDoProximo = partes[i + 2]
    if (proximo === "'-'" && depoisDoProximo && /^chr\(\d+\)$/.test(depoisDoProximo)) {
      const m = Number(depoisDoProximo.match(/^chr\((\d+)\)$/)![1])
      for (let cp = Math.min(n, m); cp <= Math.max(n, m); cp++) codepoints.add(cp)
      i += 3
      continue
    }
    codepoints.add(n)
    i += 1
  }
  return codepoints
}

/** A faixa de diacríticos do CORPO SQL: `'[' || chr(N) || '-' || chr(M) || ']'`
 *  (fecha em `']'`, sem `+` — é a que faz `regexp_replace` REMOVER, não colapsar). */
function faixaDiacriticosNoSql(corpo: string): { de: number; ate: number } {
  const m = corpo.match(
    /'\['\s*\|\|\s*chr\((\d+)\)\s*\|\|\s*'-'\s*\|\|\s*chr\((\d+)\)\s*\|\|\s*'\]'/,
  )
  if (!m) throw new Error('não achei a faixa de diacríticos ([chr(N)-chr(M)]) no corpo de vocabulario_chave')
  return { de: Number(m[1]), ate: Number(m[2]) }
}

/** A classe de espaço do CORPO SQL: o trecho entre o ÚLTIMO `'['` e o `']+'` que o
 *  fecha (fecha em `']+'`, com `+` — é a que faz `regexp_replace` COLAPSAR runs).
 *  O corpo comenta CADA code point (`-- NBSP`, `-- Ogham Space Mark`…) — os
 *  comentários são tirados ANTES de tokenizar por `||`, senão um comentário sem
 *  `||` dentro se funde com o `chr(N)` da linha seguinte e o token deixa de bater
 *  com `^chr\(\d+\)$` — silenciosamente perdendo code points, não errando alto. */
function classeDeEspacoNoSql(corpo: string): Set<number> {
  const semComentarios = corpo
    .split('\n')
    .map((linha) => linha.replace(/--.*$/, ''))
    .join('\n')
  const fimClasse = semComentarios.indexOf("']+'")
  if (fimClasse === -1) throw new Error("não achei ']+' (a classe de espaço) no corpo de vocabulario_chave")
  const inicioClasse = semComentarios.lastIndexOf("'['", fimClasse)
  if (inicioClasse === -1) throw new Error("não achei o '[' que abre a classe de espaço")
  const trecho = semComentarios.slice(inicioClasse + 3, fimClasse)
  return codepointsDoTrecho(trecho)
}

// -----------------------------------------------------------------------------
// 3) Os pares (entrada, esperado) do roteiro SQL — avaliados, não copiados do JS.
// -----------------------------------------------------------------------------

/** Separa `texto` pelo separador `sep`, respeitando aspas simples (com `''` escapado)
 *  e parênteses aninhados — só no nível 0. */
function separarNoTopo(texto: string, sep: string): string[] {
  const partes: string[] = []
  let atual = ''
  let nivel = 0
  let dentroDeAspas = false
  let i = 0
  while (i < texto.length) {
    const c = texto[i]!
    if (dentroDeAspas) {
      if (c === "'" && texto[i + 1] === "'") {
        atual += "''"
        i += 2
        continue
      }
      if (c === "'") dentroDeAspas = false
      atual += c
      i += 1
      continue
    }
    if (c === "'") {
      dentroDeAspas = true
      atual += c
      i += 1
      continue
    }
    if (c === '(') nivel += 1
    if (c === ')') nivel -= 1
    if (nivel === 0 && texto.slice(i, i + sep.length) === sep) {
      partes.push(atual)
      atual = ''
      i += sep.length
      continue
    }
    atual += c
    i += 1
  }
  partes.push(atual)
  return partes.map((p) => p.trim()).filter((p) => p !== '')
}

/** Avalia uma expressão SQL feita só de literais `'...'` (com `''` escapado) e
 *  chamadas `chr(N)`, unidos por `||` — exatamente o vocabulário que o roteiro usa
 *  para escrever code points sem caractere invisível no arquivo. */
function avaliarExpressaoSql(expr: string): string {
  return separarNoTopo(expr, '||')
    .map((token) => {
      const mLit = token.match(/^'((?:[^']|'')*)'$/)
      if (mLit) return mLit[1]!.replace(/''/g, "'")
      const mChr = token.match(/^chr\((\d+)\)$/)
      if (mChr) return String.fromCodePoint(Number(mChr[1]))
      throw new Error(`token não reconhecido em expressão SQL: "${token}"`)
    })
    .join('')
}

const ANCORA_PARES_INICIO = '-- PARES_NORMALIZACAO_INICIO'
const ANCORA_PARES_FIM = '-- PARES_NORMALIZACAO_FIM'

/** O índice (em `sql`) do INÍCIO da linha cujo texto aparado é exatamente `ancora`
 *  — não uma ocorrência qualquer da substring (o cabeçalho do roteiro MENCIONA os
 *  nomes das âncoras em prosa, e uma busca por substring cairia nessa menção em vez
 *  da âncora real). */
function indiceDaLinhaExata(sql: string, ancora: string): number {
  const linhas = sql.split('\n')
  let offset = 0
  for (const linha of linhas) {
    if (linha.trim() === ancora) return offset
    offset += linha.length + 1
  }
  return -1
}

function paresDoRoteiro(): { entrada: string; esperado: string }[] {
  const caminho = join(RAIZ, 'supabase', 'tests', 'vocabulario_import.sql')
  const sql = readFileSync(caminho, 'utf8')
  const inicio = indiceDaLinhaExata(sql, ANCORA_PARES_INICIO)
  const fim = indiceDaLinhaExata(sql, ANCORA_PARES_FIM)
  if (inicio === -1 || fim === -1 || fim < inicio) {
    throw new Error(
      'não achei o bloco PARES_NORMALIZACAO_INICIO/FIM (como linha EXATA) em supabase/tests/vocabulario_import.sql',
    )
  }
  // Tira comentário `--` de linha ANTES de procurar tuplas: o bloco tem comentários
  // explicando cada caso-armadilha, e um deles ("İ (I maiúsculo turco com ponto,
  // U+0130): ...") tem parênteses dentro da PROSA — sem tirar o comentário, o
  // parser de tuplas confundiria essa prosa com uma tupla de verdade. Nenhum valor
  // de teste do bloco contém `--` dentro de si, então a tira é segura aqui.
  const semComentarios = sql
    .slice(inicio, fim)
    .split('\n')
    .map((linha) => linha.replace(/--.*$/, ''))
    .join('\n')
  const bloco = semComentarios
  const RE_TUPLA = /\(((?:[^()]|\([^()]*\))*)\)/g
  const pares: { entrada: string; esperado: string }[] = []
  for (const m of bloco.matchAll(RE_TUPLA)) {
    const partes = separarNoTopo(m[1]!, ',')
    if (partes.length !== 2) continue // pula o `as t(entrada, esperado)` e afins
    const [entradaExpr, esperadoExpr] = partes
    pares.push({
      entrada: avaliarExpressaoSql(entradaExpr!),
      esperado: avaliarExpressaoSql(esperadoExpr!),
    })
  }
  return pares
}

// -----------------------------------------------------------------------------
// Testes
// -----------------------------------------------------------------------------

describe('vocabulario_chave (SQL) espelha normalizarTexto (TS) — a faixa de diacríticos', () => {
  const { arquivo, sql } = corpoVigente(ASSINATURA)

  it(`a migration vigente (${arquivo}) define vocabulario_chave com IMMUTABLE STRICT (guarda do próprio teste)`, () => {
    expect(sql).toMatch(/immutable/i)
    expect(sql).toMatch(/strict/i)
  })

  it('a faixa de diacríticos do SQL é EXATAMENTE a que deparas.ts usa (lida do fonte, não copiada)', () => {
    const doSql = faixaDiacriticosNoSql(sql)
    const doTs = faixaDiacriticosDeDeparas()
    expect(doSql).toEqual(doTs)
  })

  it('a faixa de diacríticos é U+0300–U+036F (768–879) — os dois lados concordam com isso', () => {
    expect(faixaDiacriticosNoSql(sql)).toEqual({ de: 768, ate: 879 })
  })
})

describe('vocabulario_chave (SQL) espelha normalizarTexto (TS) — a classe de espaço', () => {
  const { sql } = corpoVigente(ASSINATURA)

  it('a classe de espaço do SQL é EXATAMENTE o \\s do JavaScript, code point a code point', () => {
    const doSql = classeDeEspacoNoSql(sql)
    const doJs = espacosDoJsAoVivo()
    expect(doSql.size).toBe(doJs.size)
    for (const cp of doJs) {
      expect(doSql.has(cp), `code point U+${cp.toString(16).padStart(4, '0')} está no \\s do JS mas não na classe do SQL`).toBe(true)
    }
    for (const cp of doSql) {
      expect(doJs.has(cp), `code point U+${cp.toString(16).padStart(4, '0')} está na classe do SQL mas não no \\s do JS`).toBe(true)
    }
  })

  it('são exatamente 25 code points, inclusive U+FEFF (BOM) e U+1680 (Ogham Space Mark)', () => {
    const doSql = classeDeEspacoNoSql(sql)
    expect(doSql.size).toBe(25)
    expect(doSql.has(0xfeff)).toBe(true)
    expect(doSql.has(0x1680)).toBe(true)
  })

  it('NÃO usa `\\s` nativo do Postgres em lugar nenhum do corpo (a medição B provou que diverge)', () => {
    expect(sql).not.toMatch(/\\s/)
  })
})

describe('vocabulario_chave (SQL): a ORDEM das operações no texto', () => {
  const { sql } = corpoVigente(ASSINATURA)

  it('NFD → remove diacríticos → lower sob collate "und-x-icu" → tira \':\' final → colapsa espaço, nesta ordem', () => {
    // ⚠ Chamada ANINHADA: o nome da função MAIS EXTERNA aparece PRIMEIRO no texto
    // (`lower(` textualmente precede o `normalize(...)` que é ARGUMENTO dela) —
    // a ordem TEXTUAL de uma cadeia aninhada é de fora para dentro, o INVERSO da
    // ordem de EXECUÇÃO (que é de dentro para fora). O que este teste prova é a
    // ordem de ANINHAMENTO (cada operação embrulha a anterior), que por construção
    // É a ordem de execução — só a leitura do texto é que vai de fora pra dentro.
    const iBtrim = sql.indexOf('btrim(')
    const iLower = sql.indexOf('lower(')
    const iNormalize = sql.indexOf('normalize(p_texto, NFD)')
    const iDiacriticos = sql.indexOf('chr(768)')
    const iCollate = sql.indexOf('collate "und-x-icu"')
    const iDoisPontos = sql.indexOf("':$'")
    const iEspaco = sql.indexOf("']+'")

    expect(iBtrim, 'btrim( não encontrado').toBeGreaterThan(-1)
    expect(iLower, 'lower( não encontrado').toBeGreaterThan(-1)
    expect(iNormalize, 'normalize(p_texto, NFD) não encontrado').toBeGreaterThan(-1)
    expect(iDiacriticos, 'a faixa de diacríticos não encontrada').toBeGreaterThan(-1)
    expect(iCollate, 'collate "und-x-icu" não encontrado').toBeGreaterThan(-1)
    expect(iDoisPontos, "':$' não encontrado").toBeGreaterThan(-1)
    expect(iEspaco, "']+' não encontrado").toBeGreaterThan(-1)

    // Ordem textual (fora → dentro): btrim( … regexp_replace( … regexp_replace( …
    // lower( … regexp_replace(normalize(p_texto, NFD), diacríticos) collate …) ,
    // ':$', '' ) , <classe de espaço> ) ) — cada marco textualmente ANTES do
    // próximo é exatamente a camada que o embrulha.
    expect(iBtrim).toBeLessThan(iLower);
    expect(iLower).toBeLessThan(iNormalize)
    expect(iNormalize).toBeLessThan(iDiacriticos)
    expect(iDiacriticos).toBeLessThan(iCollate)
    expect(iCollate).toBeLessThan(iDoisPontos)
    expect(iDoisPontos).toBeLessThan(iEspaco)
  })

  it('collate "und-x-icu" está DENTRO do argumento de lower() — não pendurado no resultado', () => {
    // `lower(x) collate "..."` só rotula o RESULTADO; quem decide o algoritmo de
    // minúsculas usado é a collation do ARGUMENTO. `lower((x) collate "...")` é a
    // forma que realmente faz o `lower()` rodar sob ICU — a diferença entre as duas
    // é a armadilha que esta asserção existe para pegar.
    const iLower = sql.indexOf('lower(')
    const iCollate = sql.indexOf('collate "und-x-icu"')
    const iDoisPontos = sql.indexOf("':$'")
    expect(iCollate).toBeGreaterThan(iLower)
    expect(iCollate).toBeLessThan(iDoisPontos)
  })

  it('btrim( envolve a expressão inteira (é a chamada mais externa do corpo)', () => {
    const iBtrim = sql.indexOf('btrim(')
    const iRegexpReplace = sql.indexOf('regexp_replace(')
    expect(iBtrim, 'btrim( não encontrado').toBeGreaterThan(-1)
    expect(iBtrim).toBeLessThan(iRegexpReplace)
  })

  it('sem barra invertida (\\) no corpo — as faixas são montadas só com chr(), imunes a transcrição', () => {
    expect(sql).not.toContain('\\')
  })
})

describe('vocabulario_chave: o roteiro supabase/tests/vocabulario_import.sql não deriva do JS', () => {
  const pares = paresDoRoteiro()

  it('o roteiro tem pelo menos os 18 termos históricos + os casos-armadilha (guarda do próprio teste)', () => {
    expect(pares.length).toBeGreaterThanOrEqual(25)
  })

  it.each(pares.map((p) => [p.entrada, p.esperado] as const))(
    'normalizarTexto(%j) === %j, como o roteiro SQL afirma',
    (entrada, esperado) => {
      expect(normalizarTexto(entrada)).toBe(esperado)
    },
  )

  it('nenhum par do roteiro tem entrada === esperado por acidente de parsing (ao menos um caractere mudou em algum par)', () => {
    expect(pares.some((p) => p.entrada !== p.esperado)).toBe(true)
  })
})
