#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Gate de build — Server Actions sem binding (OS-F13, 23/07/2026)
// ---------------------------------------------------------------------------
// Rode DEPOIS de `npm run build` e ANTES de dar push (push = deploy):
//
//     npm run build && node scripts/verificar-actions-build.mjs
//
// POR QUE ISTO EXISTE
//
// Na F13 uma linha derrubou TODAS as Server Actions das rotas logadas em
// produção por ~20 horas. Era um re-export de TIPO com especificadores
// (`export type { A, B }`) dentro de um módulo `'use server'`: nessa forma o
// transform de Server Actions do Turbopack ignora o `type` e emite os
// identificadores em `ensureServerEntryExports([...])` e
// `registerServerReference(...)` — enquanto o `import type` correspondente já
// foi apagado. Sem binding nenhum, o módulo inteiro morre com `ReferenceError`
// na AVALIAÇÃO e leva junto todas as actions dele.
//
// Nada disso falha em `lint`, `test`, `build` ou `next dev`: o TypeScript aceita
// a forma, o build não avalia o chunk e o empacotamento de desenvolvimento é
// outro. O GET das rotas continua respondendo 200 — só o POST de action quebra.
//
// A guarda de FONTE é `src/lib/use-server-exports.ts` (+ teste), que recusa a
// forma antes de compilar. ESTE script é a segunda linha: mede o ARTEFATO, e
// por isso pega também um caso que a análise textual não anteciparia.
// ---------------------------------------------------------------------------
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'

const RAIZ_BUILD = '.next/server'

if (!existsSync(RAIZ_BUILD)) {
  console.error(`[gate] ${RAIZ_BUILD} não existe — rode \`npm run build\` antes.`)
  process.exit(1)
}

/** Todos os .js do build de servidor (ignora sourcemaps). */
function arquivosJs(dir) {
  const saida = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) saida.push(...arquivosJs(caminho))
    else if (entrada.name.endsWith('.js')) saida.push(caminho)
  }
  return saida
}

/**
 * O identificador tem alguma forma de binding no próprio chunk?
 * Conservador de propósito: na dúvida considera que TEM (não queremos gate
 * vermelho por falso positivo — o custo de um falso negativo já é coberto pela
 * guarda de fonte).
 */
/**
 * ⚠ O IDENTIFICADOR ENTRA ESCAPADO, e isto não é zelo: sem escapar, um export
 * minificado chamado `$` vira a ÂNCORA DE FIM DE STRING dentro da expressão
 * regular. Nenhuma das cinco formas casa, e o gate acusa como "sem binding" um
 * identificador perfeitamente ligado — falso positivo PERMANENTE para esse nome.
 *
 * Aconteceu de verdade na F55 (10/09/2026): o minificador alocou `$` para uma
 * Server Action de `src/lib/actions/termos.ts`, o chunk trazia
 * `async function $(a){…}` a 6.387 caracteres do começo, e o job `verificar`
 * ficou VERMELHO com `[root-of-the-server]__0p9moo6._.js → $`.
 *
 * Falso positivo é o pior defeito que um gate pode ter, porque o conserto que
 * ele convida é desligá-lo. Nada aqui ficou mais permissivo: um `$` que de fato
 * NÃO tenha binding continua sendo acusado — e o `IDENTIFICADOR` logo abaixo já
 * aceitava `$` como nome válido desde sempre.
 */
function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`)
}

function temBinding(fonte, idBruto) {
  const id = escaparRegex(idBruto)
  const formas = [
    new RegExp(String.raw`function\s+${id}\s*\(`),
    new RegExp(String.raw`\b${id}\s*=[^=]`),
    new RegExp(String.raw`(let|var|const)\s[^;\n]{0,400}\b${id}\b\s*[,;=]`),
    new RegExp(String.raw`\bclass\s+${id}\b`),
    new RegExp(String.raw`\bimport\s[^;\n]{0,200}\b${id}\b`),
  ]
  return formas.some((r) => r.test(fonte))
}

const IDENTIFICADOR = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const achados = []
let chunks = 0

for (const caminho of arquivosJs(RAIZ_BUILD)) {
  const fonte = readFileSync(caminho, 'utf8')
  if (!fonte.includes('ensureServerEntryExports')) continue
  chunks++
  const re = /ensureServerEntryExports\)?\(\[([^\]]*)\]/g
  let m
  while ((m = re.exec(fonte)) !== null) {
    for (const bruto of m[1].split(',')) {
      const id = bruto.trim()
      if (!IDENTIFICADOR.test(id)) continue
      if (!temBinding(fonte, id)) achados.push({ chunk: basename(caminho), id })
    }
  }
}

console.log(`[gate] chunks com Server Actions varridos: ${chunks}`)

if (achados.length === 0) {
  console.log('[gate] VERDE — nenhum identificador registrado sem binding.')
  process.exit(0)
}

console.error('[gate] VERMELHO — identificador registrado como Server Action SEM binding:')
for (const a of achados) console.error(`  · ${a.chunk} → ${a.id}`)
console.error('')
console.error('Isto quebra TODAS as Server Actions do módulo em produção (ReferenceError na')
console.error('avaliação). Procure um `export`/`export type` com especificadores, um `export *`')
console.error('ou um export de valor não-função em algum arquivo `\'use server\'`.')
process.exit(1)
