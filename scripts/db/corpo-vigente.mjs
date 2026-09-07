// =============================================================================
// corpo-vigente.mjs — o corpo VIVO de uma função, lido das migrations (F47)
// =============================================================================
// POR QUE ELE EXISTE
//
// O catálogo de mutações (`scripts/db/mutacoes.mjs`) precisa quebrar funções que
// têm 40, 100, às vezes 400 linhas — `apagar_ativo`, `importar_ativos_substituir`,
// `apagar_ativos_conflito_filiais`. Colar essas funções inteiras dentro do
// catálogo criaria uma CÓPIA que envelhece: no dia em que uma migration nova
// mudar a função, a mutação continuaria reescrevendo a versão antiga, e o injetor
// passaria a medir um banco que não existe mais — verde por engano, que é o
// defeito que esta fase inteira existe para matar.
//
// Aqui a mutação parte do corpo VIGENTE, resolvido na hora a partir de
// `supabase/migrations/`, e troca UM trecho. Se uma migration futura mudar esse
// trecho, `trocarNoCorpo` reprova ALTO (o trecho não existe mais) em vez de
// aplicar uma mutação que não muda nada.
//
// QUAL É O CORPO "VIGENTE"
//
// As migrations são aplicadas em ordem lexicográfica (o prefixo é sequencial e
// zero-padded — a mesma premissa do `migrations.lock.json` e do job do CI). Então
// o corpo vivo de uma função é o ÚLTIMO `create [or replace] function` dela na
// cadeia: varre da migration MAIOR para a MENOR e devolve a primeira que a define.
//
// ⚠ ESTE MÓDULO NÃO FALA COM BANCO. É por isso que ele é testável na mesa, sem
// Postgres (`scripts/db/corpo-vigente.test.mts`) — e é por isso que ele é módulo
// próprio: a F51 e a F52 vão reusá-lo para escrever mutações novas sem tocar no
// injetor.
// =============================================================================

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** A pasta das migrations, relativa à raiz do repositório. */
export const PASTA_MIGRATIONS = ['supabase', 'migrations']

/**
 * Os arquivos de migration, em ordem CRESCENTE (a ordem de aplicação).
 * @param {string} [raiz] raiz do repositório (padrão: `process.cwd()`)
 * @returns {string[]} nomes de arquivo, ex. `['0001_profiles.sql', ...]`
 */
export function listarMigrations(raiz = process.cwd()) {
  return readdirSync(join(raiz, ...PASTA_MIGRATIONS))
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

/**
 * O fim do comando SQL que começa em `inicio` — o índice logo APÓS o `;` que o fecha.
 *
 * Um `indexOf(';')` ingênuo não serve: o corpo de uma função é dollar-quoted e está
 * cheio de `;`. Este scanner pula, na ordem certa, comentário de linha (`--`),
 * comentário de bloco, literal `'...'` (com `''` escapado), identificador `"..."` e
 * bloco dollar-quoted (`$$`, `$fn$`) — que é o caso que importa.
 *
 * @param {string} sql
 * @param {number} inicio
 * @returns {number} índice logo após o `;`, ou -1 se o comando não fecha
 */
export function fimDoComando(sql, inicio) {
  let i = inicio
  while (i < sql.length) {
    const c = sql[i]

    if (c === '-' && sql[i + 1] === '-') {
      const n = sql.indexOf('\n', i)
      i = n === -1 ? sql.length : n + 1
      continue
    }
    if (c === '/' && sql[i + 1] === '*') {
      const n = sql.indexOf('*/', i)
      i = n === -1 ? sql.length : n + 2
      continue
    }
    if (c === "'") {
      i++
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      continue
    }
    if (c === '"') {
      i++
      while (i < sql.length && sql[i] !== '"') i++
      i++
      continue
    }
    if (c === '$') {
      // `$$` ou `$tag$`. `$1` (parâmetro posicional) NÃO casa — falta o `$` de fecho.
      const m = /^(\$\$|\$[A-Za-z_][A-Za-z0-9_]*\$)/.exec(sql.slice(i))
      if (m) {
        const tag = m[0]
        const fim = sql.indexOf(tag, i + tag.length)
        i = fim === -1 ? sql.length : fim + tag.length
        continue
      }
    }
    if (c === ';') return i + 1
    i++
  }
  return -1
}

/**
 * O trecho entre o `(` em `abre` e o `)` que o fecha, contando parênteses aninhados.
 * @param {string} sql
 * @param {number} abre índice do `(`
 * @returns {{ args: string, fim: number }} `fim` é o índice do `)`
 */
function listaDeArgumentos(sql, abre) {
  let nivel = 0
  let i = abre
  while (i < sql.length) {
    const c = sql[i]
    if (c === "'") {
      i++
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2
            continue
          }
          break
        }
        i++
      }
    } else if (c === '(') {
      nivel++
    } else if (c === ')') {
      nivel--
      if (nivel === 0) return { args: sql.slice(abre + 1, i), fim: i }
    }
    i++
  }
  return { args: '', fim: -1 }
}

/** Divide a lista de argumentos nas vírgulas de PRIMEIRO nível. */
function partirArgumentos(args) {
  const partes = []
  let nivel = 0
  let atual = ''
  for (let i = 0; i < args.length; i++) {
    const c = args[i]
    if (c === '(' || c === '[') nivel++
    else if (c === ')' || c === ']') nivel--
    if (c === ',' && nivel === 0) {
      partes.push(atual)
      atual = ''
      continue
    }
    atual += c
  }
  if (atual.trim() !== '') partes.push(atual)
  return partes.map((p) => p.trim()).filter((p) => p !== '')
}

const MODOS = new Set(['in', 'out', 'inout', 'variadic'])
/** Segundas palavras de tipo composto — `character varying`, `timestamp with time zone`. */
const CONTINUA_TIPO = /^(varying|precision|with|without|time|zone|day|to|second|year|month)$/i

/**
 * O TIPO de um argumento declarado, sem o modo, sem o nome e sem o `default`.
 *
 * `fid smallint` → `smallint` · `in p_ativos uuid[]` → `uuid[]` ·
 * `p_dados jsonb default '{}'::jsonb` → `jsonb` · `smallint` → `smallint`.
 *
 * @param {string} decl
 * @returns {string}
 */
export function tipoDoArgumento(decl) {
  let s = decl.trim().replace(/\s+/g, ' ')
  // `default …` e `= …` não fazem parte da identidade da função.
  s = s
    .replace(/\s+default\s+[\s\S]*$/i, '')
    .replace(/\s+=\s+[\s\S]*$/, '')
    .trim()

  let tokens = s.split(' ')
  if (tokens.length > 1 && MODOS.has(tokens[0].toLowerCase())) tokens = tokens.slice(1)

  // Sobrou nome + tipo (`fid smallint`) → o primeiro token é o nome, salvo quando o
  // segundo continua um tipo composto (`character varying`).
  if (tokens.length > 1 && /^[a-z_][a-z0-9_]*$/i.test(tokens[0]) && !CONTINUA_TIPO.test(tokens[1])) {
    return tokens.slice(1).join(' ').toLowerCase()
  }
  return tokens.join(' ').toLowerCase()
}

/**
 * Uma assinatura pedida, normalizada.
 * @param {string} assinatura ex. `public.pode_escrever_filial(smallint)` ou `papel_atual`
 */
function lerAssinatura(assinatura) {
  const bruta = assinatura.trim()
  const abre = bruta.indexOf('(')
  const semArgs = (abre === -1 ? bruta : bruta.slice(0, abre)).trim()
  const partes = semArgs.split('.')
  const nome = partes[partes.length - 1].toLowerCase()
  const esquema = (partes.length > 1 ? partes[partes.length - 2] : 'public').toLowerCase()
  if (abre === -1) return { esquema, nome, tipos: null }
  const fecha = bruta.lastIndexOf(')')
  if (fecha < abre) throw new Error(`corpoVigente: assinatura sem ')': ${assinatura}`)
  const tipos = partirArgumentos(bruta.slice(abre + 1, fecha)).map(tipoDoArgumento)
  return { esquema, nome, tipos }
}

const RE_FUNCAO =
  /create\s+(?:or\s+replace\s+)?function\s+(?:([a-z_][a-z0-9_]*)\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(/gi

/**
 * Todas as definições de função de um arquivo SQL, na ordem em que aparecem.
 * @param {string} sql
 * @returns {{ esquema: string, nome: string, tipos: string[], texto: string, inicio: number }[]}
 */
export function definicoesDeFuncao(sql) {
  const achados = []
  const re = new RegExp(RE_FUNCAO.source, RE_FUNCAO.flags)
  let m
  while ((m = re.exec(sql)) !== null) {
    const inicio = m.index
    const abre = m.index + m[0].length - 1 // o `(` que a regex consumiu
    const { args, fim } = listaDeArgumentos(sql, abre)
    if (fim === -1) continue
    const fimCmd = fimDoComando(sql, fim)
    if (fimCmd === -1) continue
    achados.push({
      esquema: (m[1] ?? 'public').toLowerCase(),
      nome: m[2].toLowerCase(),
      tipos: partirArgumentos(args).map(tipoDoArgumento),
      texto: sql.slice(inicio, fimCmd),
      inicio,
    })
    re.lastIndex = fimCmd
  }
  return achados
}

/**
 * O corpo VIGENTE de uma função — o último `create [or replace] function` dela na
 * cadeia de migrations.
 *
 * @param {string} assinatura `public.pode_escrever_filial(smallint)`, `pode_escrever()`
 *   ou só `papel_atual`. Com os tipos, desambigua sobrecarga; sem eles, exige que a
 *   função tenha uma assinatura só no arquivo que a define por último.
 * @param {string} [raiz] raiz do repositório
 * @returns {{ sql: string, arquivo: string }}
 * @throws se a função não existir em migration nenhuma, ou se a assinatura for ambígua
 */
export function corpoVigente(assinatura, raiz = process.cwd()) {
  const alvo = lerAssinatura(assinatura)
  const arquivos = listarMigrations(raiz)

  for (let i = arquivos.length - 1; i >= 0; i--) {
    const arquivo = arquivos[i]
    const sql = readFileSync(join(raiz, ...PASTA_MIGRATIONS, arquivo), 'utf8')
    const candidatas = definicoesDeFuncao(sql).filter(
      (d) => d.nome === alvo.nome && d.esquema === alvo.esquema,
    )
    if (candidatas.length === 0) continue

    const casadas =
      alvo.tipos === null
        ? candidatas
        : candidatas.filter(
            (d) =>
              d.tipos.length === alvo.tipos.length && d.tipos.every((t, k) => t === alvo.tipos[k]),
          )

    if (casadas.length === 0) {
      const vistas = candidatas.map((d) => `${d.nome}(${d.tipos.join(', ')})`).join(' · ')
      throw new Error(
        `corpoVigente: em ${arquivo} a função ${alvo.esquema}.${alvo.nome} existe, mas nenhuma ` +
          `sobrecarga bate com "${assinatura}". Vistas: ${vistas}`,
      )
    }

    // Assinaturas DIFERENTES no mesmo arquivo, sem tipos pedidos, é ambiguidade de
    // verdade — resolvê-la por "a última vence" escolheria a sobrecarga errada em
    // silêncio. Assinaturas IGUAIS repetidas: a última é a que fica aplicada.
    if (alvo.tipos === null) {
      const distintas = new Set(casadas.map((d) => d.tipos.join(',')))
      if (distintas.size > 1) {
        throw new Error(
          `corpoVigente: ${alvo.esquema}.${alvo.nome} tem ${distintas.size} sobrecargas em ` +
            `${arquivo} — informe os tipos, ex. "${alvo.nome}(${[...distintas][0]})".`,
        )
      }
    }

    return { sql: casadas[casadas.length - 1].texto, arquivo }
  }

  throw new Error(
    `corpoVigente: nenhuma migration define ${alvo.esquema}.${alvo.nome}` +
      (alvo.tipos ? `(${alvo.tipos.join(', ')})` : ''),
  )
}

/**
 * Troca UM trecho do corpo e reprova se ele não estiver lá — exatamente uma vez.
 *
 * ⚠ É A GUARDA MAIS IMPORTANTE DO CATÁLOGO. Uma substituição que não casa produziria
 * uma "mutação" idêntica ao original: ela APLICA sem erro, o roteiro fica verde e o
 * injetor reportaria "não detectada" — o diagnóstico errado, acusando de fraca uma
 * asserção que está certa. Falhar aqui, na mesa e sem banco, custa um segundo.
 *
 * @param {string} corpo
 * @param {string} de trecho literal a trocar
 * @param {string} para
 * @param {string} [contexto] id da mutação, para a mensagem
 * @returns {string}
 */
export function trocarNoCorpo(corpo, de, para, contexto = '') {
  const onde = contexto ? ` (mutação ${contexto})` : ''
  if (de === para) {
    throw new Error(`trocarNoCorpo${onde}: "de" e "para" são iguais — a mutação não muda nada.`)
  }
  const quantas = corpo.split(de).length - 1
  if (quantas === 0) {
    throw new Error(
      `trocarNoCorpo${onde}: o trecho não existe no corpo vigente — a migration mudou e a ` +
        `mutação viraria um no-op silencioso. Trecho procurado:\n${de}`,
    )
  }
  if (quantas > 1) {
    throw new Error(
      `trocarNoCorpo${onde}: o trecho aparece ${quantas} vezes — ambíguo. Alongue o trecho.\n${de}`,
    )
  }
  return corpo.replace(de, para)
}
