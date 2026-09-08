// Guarda de FORMA dos módulos `'use server'` (F13 · B1+B2).
//
// POR QUE ESTE MÓDULO EXISTE
// --------------------------
// Um módulo `'use server'` passa pelo transform de Server Actions do Next/
// Turbopack, que emite, no fim do arquivo compilado, algo como
//   ensureServerEntryExports([a, b, c, …])
//   registerServerReference(a, "<id>", null)
// listando TODOS os exports que ele considera exports de VALOR.
//
// Em 22/07/2026 (F10) entrou em `src/lib/actions/movimentacoes.ts` a linha
//   export type { ParMovimentacaoDia, PossivelDuplicataDia }
// Re-export COM ESPECIFICADORES: o transform ignorou o `type` e emitiu os dois
// identificadores nas duas chamadas acima — mas o `import type` correspondente
// já tinha sido (corretamente) apagado, então não sobrou binding nenhum. O
// resultado foi `ReferenceError: ParMovimentacaoDia is not defined` NA AVALIAÇÃO
// DO MÓDULO: o arquivo inteiro morre antes de qualquer action rodar e, como o
// layout do grupo `(app)` importa uma dessas actions, TODA Server Action de TODA
// rota logada passou a devolver 500 em produção por ~20 horas.
//
// `export type X = Y` (ALIAS INLINE) é apagado corretamente pelo mesmo transform
// — inclusive quando `Y` é um tipo importado. É a forma segura.
//
// Este módulo é a guarda textual que impede a reintrodução da forma venenosa em
// QUALQUER módulo `'use server'` do repositório (ver `use-server-exports.test.ts`,
// que varre o `src/` inteiro). Não é um parser de TypeScript — não há um na stack
// fechada (CLAUDE.md) e nem é preciso: comentários e strings são neutralizados e
// só linhas que COMEÇAM com `export` são classificadas.
//
// LIMITAÇÕES ACEITAS (custo de um falso positivo = teste vermelho, não produção
// quebrada):
//  · export indentado dentro de `declare module { … }` seria classificado como se
//    fosse de topo (não existe no repositório);
//  · uma expressão regular sem `/` de fechamento na mesma linha é lida como
//    divisão (o heurístico de literal de regex é contido a uma linha, de propósito).

/** Formas de export que sobrevivem como VALOR num módulo `'use server'`. */
export type FormaInvalida =
  /** `export { A }` / `export type { A }` / `export type { A } from '…'` — o defeito da F13. */
  | 'especificadores'
  /** `export * from '…'` — mesma família. */
  | 'reexport-estrela'
  /** `export const/let/var/class/enum …` (e qualquer forma não reconhecida). */
  | 'valor-nao-funcao'
  /** `export function f()` — o Next exige exports async num módulo `'use server'`. */
  | 'funcao-sincrona'

export type ExportInvalido = {
  /** Linha do `export`, 1-indexed (a mesma que o editor mostra). */
  linha: number
  /** A linha já normalizada (espaços colapsados), para a mensagem do teste. */
  trecho: string
  forma: FormaInvalida
}

// Caractere significativo depois do qual uma `/` inicia um literal de regex (e
// não uma divisão). Heurístico clássico, suficiente aqui.
const SIMBOLOS_ANTES_DE_REGEX = new Set('(,=:[!&|?{};+-*%~^<>'.split(''))
const PALAVRAS_ANTES_DE_REGEX = new Set([
  'return',
  'typeof',
  'case',
  'in',
  'of',
  'do',
  'else',
  'yield',
  'await',
  'delete',
  'void',
  'instanceof',
  'new',
])

// Índice da `/` que fecha um literal de regex iniciado em `i`, SE ela estiver na
// mesma linha; senão -1 (e quem chamou trata a `/` como divisão). Respeita escape
// e classe de caracteres (`[…]`, onde `/` é literal).
function fimRegexNaLinha(fonte: string, i: number): number {
  let k = i + 1
  let emClasse = false
  while (k < fonte.length) {
    const c = fonte[k]
    if (c === '\n') return -1
    if (c === '\\') {
      k += 2
      continue
    }
    if (emClasse) {
      if (c === ']') emClasse = false
    } else if (c === '[') {
      emClasse = true
    } else if (c === '/') {
      return k
    }
    k++
  }
  return -1
}

type Estado = 'codigo' | 'linha' | 'bloco' | 'aspa' | 'aspas' | 'crase'

// Neutraliza comentários (sempre) e o CONTEÚDO das strings (quando
// `apagarStrings`), trocando por espaços e preservando as quebras de linha — o
// número da linha do achado tem de continuar batendo com o arquivo real.
// Os delimitadores de string são preservados: `ehModuloUseServer` precisa deles
// para reconhecer a diretiva do prólogo.
// F49 — EXPORTADA (era local) para que `guardas-de-action.ts` reuse a MESMA
// neutralização em vez de escrever a segunda. A trava das guardas precisa
// exatamente disto: um `exigirPapel` citado num comentário ou dentro de uma
// string não pode contar como guarda, e é este `limpar(fonte, true)` que apaga
// os dois. Duas cópias de um neutralizador de comentário é como um dos dois
// envelhece sem ninguém notar — foi o argumento que criou `busca/prefixo.ts`.
export function limpar(fonte: string, apagarStrings: boolean): string {
  const saida: string[] = []
  const manter = (c: string) => saida.push(c)
  const branco = (c: string) => saida.push(c === '\n' ? '\n' : ' ')
  const noTexto = apagarStrings ? branco : manter

  let estado: Estado = 'codigo'
  let anterior = '' // último caractere significativo em código
  let palavra = '' // identificador que termina em `anterior`, se houver
  let i = 0

  while (i < fonte.length) {
    const c = fonte[i]
    const prox = i + 1 < fonte.length ? fonte[i + 1] : ''

    if (estado === 'codigo') {
      if (c === '/' && prox === '/') {
        estado = 'linha'
        branco(c)
        branco(prox)
        i += 2
        continue
      }
      if (c === '/' && prox === '*') {
        estado = 'bloco'
        branco(c)
        branco(prox)
        i += 2
        continue
      }
      if (
        c === '/' &&
        (anterior === '' ||
          SIMBOLOS_ANTES_DE_REGEX.has(anterior) ||
          PALAVRAS_ANTES_DE_REGEX.has(palavra))
      ) {
        const fim = fimRegexNaLinha(fonte, i)
        if (fim > i) {
          // Copia o literal inteiro sem interpretá-lo: aspas dentro de uma regex
          // (`/['"]/`) não podem abrir estado de string.
          for (let k = i; k <= fim; k++) manter(fonte[k])
          anterior = '/'
          palavra = ''
          i = fim + 1
          continue
        }
      }
      if (c === "'" || c === '"' || c === '`') {
        estado = c === "'" ? 'aspa' : c === '"' ? 'aspas' : 'crase'
        manter(c)
        i++
        continue
      }
      manter(c)
      if (!/\s/.test(c)) {
        anterior = c
        palavra = /[A-Za-z0-9_$]/.test(c) ? palavra + c : ''
      }
      i++
      continue
    }

    if (estado === 'linha') {
      if (c === '\n') {
        estado = 'codigo'
        manter(c)
      } else {
        branco(c)
      }
      i++
      continue
    }

    if (estado === 'bloco') {
      if (c === '*' && prox === '/') {
        estado = 'codigo'
        branco(c)
        branco(prox)
        i += 2
        continue
      }
      branco(c)
      i++
      continue
    }

    // dentro de string
    if (c === '\\') {
      noTexto(c)
      if (prox) noTexto(prox)
      i += 2
      continue
    }
    if (c === '\n' && estado !== 'crase') {
      // string simples não fecha em outra linha — não deixa o estado vazar
      estado = 'codigo'
      manter(c)
      i++
      continue
    }
    const fecha =
      (estado === 'aspa' && c === "'") ||
      (estado === 'aspas' && c === '"') ||
      (estado === 'crase' && c === '`')
    if (fecha) {
      estado = 'codigo'
      anterior = c
      palavra = ''
      manter(c)
      i++
      continue
    }
    noTexto(c)
    i++
  }

  return saida.join('')
}

// Uma linha de prólogo: só uma string literal, com `;` opcional.
const RE_DIRETIVA = /^\s*(['"])([^'"]*)\1\s*;?\s*$/

/**
 * O arquivo declara `'use server'` no PRÓLOGO do módulo (e não dentro de uma
 * função, nem só num comentário)? Só nesse caso o transform de Server Actions
 * roda sobre ele.
 */
export function ehModuloUseServer(fonte: string): boolean {
  for (const linha of limpar(fonte, false).split('\n')) {
    if (linha.trim() === '') continue
    const m = RE_DIRETIVA.exec(linha)
    // Primeira linha de CÓDIGO: o prólogo acabou.
    if (!m) return false
    if (m[2].trim() === 'use server') return true
  }
  return false
}

// `export` como palavra de abertura da linha. `export:` (propriedade de objeto)
// não conta.
const RE_LINHA_EXPORT = /^\s*export(\s|\*|\{)/

function classificar(linha: string): FormaInvalida | null {
  if (/^export\s+(type\s+)?\*/.test(linha)) return 'reexport-estrela'
  if (/^export\s*(type\s*)?\{/.test(linha)) return 'especificadores'
  if (/^export\s+default\b/.test(linha)) {
    if (/^export\s+default\s+async\s+function\b/.test(linha)) return null
    if (/^export\s+default\s+function\b/.test(linha)) return 'funcao-sincrona'
    return 'valor-nao-funcao'
  }
  if (/^export\s+async\s+function\b/.test(linha)) return null
  if (/^export\s+function\b/.test(linha)) return 'funcao-sincrona'
  // Formas 100% de tipo: apagadas na compilação (é o caso do alias inline
  // `export type X = Y`, a correção da F13).
  if (/^export\s+(declare|type|interface|namespace)\b/.test(linha)) return null
  // Tudo o mais emite binding em runtime — inclusive uma forma que este guarda
  // ainda não conheça. Conservador de propósito: o custo é um teste vermelho.
  return 'valor-nao-funcao'
}

/**
 * Exports de topo que o transform de Server Actions registraria como VALOR — ou
 * seja, os que NÃO podem existir num módulo `'use server'`. Lista vazia = módulo
 * são.
 */
export function exportsInvalidosDeUseServer(fonte: string): ExportInvalido[] {
  const achados: ExportInvalido[] = []
  const linhas = limpar(fonte, true).split('\n')
  for (let i = 0; i < linhas.length; i++) {
    if (!RE_LINHA_EXPORT.test(linhas[i])) continue
    const linha = linhas[i].trim().replace(/\s+/g, ' ')
    const forma = classificar(linha)
    if (forma) achados.push({ linha: i + 1, trecho: linha.slice(0, 100), forma })
  }
  return achados
}
