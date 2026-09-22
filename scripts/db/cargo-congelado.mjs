// =============================================================================
// cargo-congelado.mjs — "ninguém lê nem escreve o cargo em `profiles`" (F62)
// =============================================================================
// POR QUE ELE EXISTE
//
// A F62 tirou o cargo (`papel`) e o status (`ativo`) de `profiles` e os pôs em
// `membros`, por empresa. As duas colunas de `profiles` ficaram CONGELADAS — de pé só
// como rede de reversão, até a entrega PATCH que as derruba (decisão iii do Johnny,
// 22/09/2026). Congelar só vale se NINGUÉM voltar a lê-las: um leitor esquecido decide
// acesso por um valor que parou no tempo — quem foi desativado depois da F62 voltaria a
// entrar por ele.
//
// Este módulo é a metade DE MESA da trava, sem banco, em quatro universos:
//   · o CORPO VIGENTE de toda função das migrations (replay para a frente, com
//     `drop function`, sem os comentários de fora do corpo — a lição da F53: pseudo-SQL
//     em comentário vira definição para quem casa texto cru);
//   · as POLICIES vivas (o replay de `predicado-policies.mjs`);
//   · o TypeScript e os scripts (`src/**`, `scripts/**`): cadeia supabase-js a partir de
//     `.from('profiles')`, forma Zod com `origem: 'profiles'` e SQL em literal;
//   · os roteiros (`supabase/tests/*.sql`).
// O PAR DE CATÁLOGO é `supabase/tests/cargo_em_membros.sql`, que faz a mesma afirmação
// sobre o banco VIVO do CI e é a FONTE ÚNICA das exceções de função (`k_excecoes_cargo`,
// lido daqui como texto). O detector abaixo é o MESMO do `.sql` (formas a–f), traduzido.
// =============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  PASTA_MIGRATIONS,
  definicoesDeFuncao,
  fimDoComando,
  listarMigrations,
} from './corpo-vigente.mjs'
import { lexar } from './predicado-policies.mjs'

/** Onde mora a fonte única das exceções de função/policy. */
export const ARQUIVO_EXCECOES = ['supabase', 'tests', 'cargo_em_membros.sql']

/** A primeira migration da F62 — o "antes" do corpo antigo é tudo abaixo dela. */
export const PRIMEIRA_DA_F62 = '0152'

const NAO_ALIAS = new Set([
  'where', 'on', 'set', 'join', 'left', 'right', 'inner', 'full', 'cross', 'using',
  'order', 'group', 'limit', 'returning', 'for', 'union', 'natural', 'lateral',
  'window', 'having', 'offset', 'fetch', 'except', 'intersect', 'as', 'and', 'or',
  'into', 'values', 'select', 'default',
])

/**
 * A forma (a–f) em que um texto SQL lê ou escreve o cargo em `profiles`, ou null.
 * O texto é tomado SEM comentários (`--`, `/* *\/`) e em minúsculas — espelho exato de
 * `pg_temp.le_cargo_em_profiles` em `supabase/tests/cargo_em_membros.sql`.
 * @param {string} def
 * @param {boolean} [gatilhoDeProfiles] liga a forma (f): `old.`/`new.` numa função de gatilho de `profiles`
 * @returns {'a'|'b'|'c'|'d'|'e'|'f'|null}
 */
export function leCargoEmProfiles(def, gatilhoDeProfiles = false) {
  let v = String(def ?? '').toLowerCase()
  v = v.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')

  // (a) qualificado pelo nome da tabela
  if (/\bprofiles\s*\.\s*(papel|ativo)\b/.test(v)) return 'a'

  // (b) por alias ligado a profiles
  for (const m of v.matchAll(
    /(?:from|join|update)\s+(?:public\s*\.\s*)?profiles\s+(?:as\s+)?([a-z_][a-z0-9_]*)/g,
  )) {
    const alias = m[1]
    if (!NAO_ALIAS.has(alias) && new RegExp(`\\b${alias}\\s*\\.\\s*(papel|ativo)\\b`).test(v)) return 'b'
  }

  // (c) update … set papel|ativo = ; (d) insert com a coluna
  if (/update\s+(?:public\s*\.\s*)?profiles\b[^;]*?\bset\b[^;]*?\b(papel|ativo)\s*=/.test(v)) return 'c'
  if (/insert\s+into\s+(?:public\s*\.\s*)?profiles\s*\([^)]*\b(papel|ativo)\b/.test(v)) return 'd'

  // (e) profiles SEM alias, e papel/ativo NUS no mesmo comando
  for (const cmd of v.split(';')) {
    for (const m of cmd.matchAll(
      /(?:from|join)\s+(?:public\s*\.\s*)?profiles\b\s*(?:as\s+)?([a-z_][a-z0-9_]*)?/g,
    )) {
      const alias = m[1] ?? ''
      if ((alias === '' || NAO_ALIAS.has(alias)) && /(?:^|[^.a-z0-9_])(papel|ativo)(?:[^a-z0-9_]|$)/.test(cmd)) {
        return 'e'
      }
    }
  }

  // (f) old./new. numa função de gatilho de profiles
  if (gatilhoDeProfiles && /\b(old|new)\s*\.\s*(papel|ativo)\b/.test(v)) return 'f'

  return null
}

// -----------------------------------------------------------------------------
// Migrations: o corpo vigente de TODA função, com drop e sem comentário de fora
// -----------------------------------------------------------------------------

/** O SQL com os comentários FORA de literal/corpo apagados (mesmo comprimento). */
export function semComentariosDeFora(sql) {
  const saida = sql.split('')
  let i = 0
  while (i < sql.length) {
    const fim = fimDoComando(sql, i)
    const ate = fim === -1 ? sql.length : fim
    const { comentarios } = lexar(sql.slice(i, ate), i)
    for (const [a, b] of comentarios) for (let k = a; k < b; k++) if (saida[k] !== '\n') saida[k] = ' '
    i = ate
  }
  return saida.join('')
}

function aridade(args) {
  const s = String(args ?? '').trim()
  if (s === '') return 0
  let prof = 0
  let n = 1
  for (const c of s) {
    if (c === '(') prof++
    else if (c === ')') prof--
    else if (c === ',' && prof === 0) n++
  }
  return n
}

/**
 * O corpo vigente de toda função de `public`, por `nome/aridade`, replay PARA A FRENTE.
 * @param {{ arquivo: string, sql: string }[]} migrations em ordem de aplicação
 * @param {string} [ate] prefixo EXCLUSIVO (ex. '0152' = só as anteriores à F62)
 * @returns {Map<string, { nome: string, texto: string, arquivo: string }>}
 */
export function funcoesVigentes(migrations, ate) {
  const vivas = new Map()
  for (const { arquivo, sql } of migrations) {
    if (ate && arquivo.slice(0, 4) >= ate) break
    const limpo = semComentariosDeFora(sql)
    // os `drop function` ANTES das definições do mesmo arquivo, na ordem do texto
    const eventos = []
    for (const m of limpo.matchAll(
      /drop\s+function\s+(?:if\s+exists\s+)?(?:([a-z_][a-z0-9_]*)\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi,
    )) {
      if ((m[1] ?? 'public').toLowerCase() !== 'public') continue
      eventos.push({ pos: m.index, tipo: 'drop', chave: `${m[2].toLowerCase()}/${aridade(m[3])}` })
    }
    for (const d of definicoesDeFuncao(limpo)) {
      if (d.esquema !== 'public') continue
      eventos.push({ pos: d.inicio, tipo: 'def', chave: `${d.nome}/${d.tipos.length}`, nome: d.nome, texto: d.texto })
    }
    eventos.sort((a, b) => a.pos - b.pos)
    for (const e of eventos) {
      if (e.tipo === 'drop') vivas.delete(e.chave)
      else vivas.set(e.chave, { nome: e.nome, texto: e.texto, arquivo })
    }
  }
  return vivas
}

/** Os nomes das funções usadas por gatilho em `public.profiles`. */
export function gatilhosDeProfiles(migrations) {
  const nomes = new Set()
  for (const { sql } of migrations) {
    const limpo = semComentariosDeFora(sql)
    for (const m of limpo.matchAll(
      /create\s+trigger\s+[a-z_][a-z0-9_]*\s+[^;]*?\bon\s+(?:public\s*\.\s*)?profiles\b[^;]*?execute\s+(?:function|procedure)\s+(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)/gi,
    )) {
      nomes.add(m[1].toLowerCase())
    }
  }
  return nomes
}

/** O conteúdo do `$…$` de uma definição (o corpo que o Postgres guarda em `prosrc`). */
export function corpoDaDefinicao(texto) {
  const m = /as\s+(\$[a-z0-9_]*\$)([\s\S]*?)\1/i.exec(texto)
  return m ? m[2] : texto
}

// -----------------------------------------------------------------------------
// A fonte única das exceções de função/policy
// -----------------------------------------------------------------------------

export const RE_ENTRADA_EXCECAO_CARGO =
  /^\s*'([a-z_][a-z0-9_]*)',?\s*--\s*(\d{4})\s*·\s*motivo:\s*(.+?)\s*·\s*destino:\s*(F\d+|PATCH|permanente)\s*$/

/** Lê `k_excecoes_cargo` do `.sql` (uma entrada por linha). */
export function lerExcecoesCargo(sqlRoteiro) {
  const m = /k_excecoes_cargo\s+text\[\]\s*:=\s*array\[([\s\S]*?)\];/.exec(sqlRoteiro)
  if (!m) throw new Error('cargo-congelado: não achei `k_excecoes_cargo text[] := array[ … ];` no roteiro.')
  const entradas = []
  for (const linha of m[1].split('\n')) {
    if (linha.trim() === '') continue
    const e = RE_ENTRADA_EXCECAO_CARGO.exec(linha)
    if (!e) throw new Error(`cargo-congelado: entrada de k_excecoes_cargo fora do formato: «${linha.trim()}»`)
    entradas.push({ nome: e[1], migration: e[2], motivo: e[3], destino: e[4] })
  }
  return entradas
}

/**
 * O julgamento das migrations: as funções vigentes e as policies vivas que leem o cargo
 * em `profiles`, fora das exceções — e as exceções que já não são acusadas.
 * @param {{ migrations: {arquivo:string,sql:string}[], excecoes: string[], policiesVivas?: Map<string, any> }} p
 */
export function julgarCargo({ migrations, excecoes, policiesVivas }) {
  const vigentes = funcoesVigentes(migrations)
  const gatilhos = gatilhosDeProfiles(migrations)
  const acusadas = []
  const acusadasNomes = new Set()
  for (const f of vigentes.values()) {
    const forma = leCargoEmProfiles(f.texto, gatilhos.has(f.nome))
    if (forma === null) continue
    acusadasNomes.add(f.nome)
    if (!excecoes.includes(f.nome)) acusadas.push({ nome: f.nome, forma, arquivo: f.arquivo })
  }
  const obsoletas = excecoes.filter((n) => !acusadasNomes.has(n))
  const policies = []
  for (const [chave, pol] of policiesVivas ?? new Map()) {
    const forma = leCargoEmProfiles(`${pol.using ?? ''} ; ${pol.withCheck ?? ''}`)
    if (forma !== null) policies.push({ chave, forma, arquivo: pol.arquivo })
  }
  return { acusadas: acusadas.sort((a, b) => a.nome.localeCompare(b.nome)), obsoletas, policies, universo: vigentes.size }
}

// -----------------------------------------------------------------------------
// TypeScript e scripts
// -----------------------------------------------------------------------------

/**
 * As cadeias de chamada logo depois de um índice: `.select(…).eq(…).maybeSingle()`.
 * Pula strings e parênteses balanceados.
 */
function cadeiaDepois(texto, i) {
  let j = i
  let saida = ''
  for (;;) {
    let k = j
    while (k < texto.length && /\s/.test(texto[k])) k++
    if (texto[k] !== '.') break
    const nome = /^\.[A-Za-z_$][\w$]*/.exec(texto.slice(k))
    if (!nome) break
    k += nome[0].length
    while (k < texto.length && /\s/.test(texto[k])) k++
    if (texto[k] !== '(') {
      saida += nome[0]
      j = k
      continue
    }
    const fim = fimDeParenteses(texto, k)
    if (fim === -1) break
    saida += nome[0] + texto.slice(k, fim)
    j = fim
  }
  return saida
}

function fimDeParenteses(texto, abre) {
  let prof = 0
  let i = abre
  while (i < texto.length) {
    const c = texto[i]
    if (c === "'" || c === '"' || c === '`') {
      i = fimDeString(texto, i)
      continue
    }
    if (c === '(') prof++
    else if (c === ')') {
      prof--
      if (prof === 0) return i + 1
    }
    i++
  }
  return -1
}

function fimDeString(texto, i) {
  const q = texto[i]
  let j = i + 1
  while (j < texto.length) {
    if (texto[j] === '\\') {
      j += 2
      continue
    }
    if (texto[j] === q) return j + 1
    j++
  }
  return texto.length
}

const ANTES_DE_REGEX = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^'])

/**
 * O conteúdo de todo literal de string de um arquivo JS/TS (aspas simples, duplas e
 * template), fora de comentário e de regex literal.
 */
export function literaisDe(texto) {
  const lits = []
  let i = 0
  let ultimo = ''
  while (i < texto.length) {
    const c = texto[i]
    const d = texto[i + 1]
    if (c === '/' && d === '/') {
      const n = texto.indexOf('\n', i)
      i = n === -1 ? texto.length : n
      continue
    }
    if (c === '/' && d === '*') {
      const n = texto.indexOf('*/', i + 2)
      i = n === -1 ? texto.length : n + 2
      continue
    }
    if (c === '/' && (ultimo === '' || ANTES_DE_REGEX.has(ultimo) || /\breturn\s*$/.test(texto.slice(Math.max(0, i - 8), i)))) {
      // regex literal: até a próxima `/` não escapada e fora de classe
      let j = i + 1
      let classe = false
      while (j < texto.length && texto[j] !== '\n') {
        if (texto[j] === '\\') {
          j += 2
          continue
        }
        if (texto[j] === '[') classe = true
        else if (texto[j] === ']') classe = false
        else if (texto[j] === '/' && !classe) break
        j++
      }
      i = j + 1
      ultimo = 'regex'
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const fim = fimDeString(texto, i)
      lits.push(texto.slice(i + 1, fim - 1))
      i = fim
      ultimo = 'str'
      continue
    }
    if (!/\s/.test(c)) ultimo = c
    i++
  }
  return lits
}

/**
 * Os achados de um arquivo TS/JS: cadeia supabase-js sobre `profiles` que seleciona,
 * filtra ou grava `papel`/`ativo`; forma Zod de `profiles` com a coluna; SQL em literal.
 * @returns {{ tipo: string, trecho: string }[]}
 */
export function achadosTs(texto) {
  const achados = []
  for (const m of texto.matchAll(/\.from\(\s*(['"`])profiles\1\s*\)/g)) {
    const cadeia = cadeiaDepois(texto, m.index + m[0].length)
    for (const s of cadeia.matchAll(/\.select\(\s*(['"`])([\s\S]*?)\1/g)) {
      if (/\b(papel|ativo)\b/.test(s[2])) achados.push({ tipo: 'select', trecho: s[0].slice(0, 120) })
    }
    for (const f of cadeia.matchAll(
      /\.(eq|neq|in|is|not|filter|match|order|gt|gte|lt|lte|like|ilike|contains)\(\s*(['"`])(papel|ativo)\2/g,
    )) {
      achados.push({ tipo: 'filtro', trecho: f[0] })
    }
    for (const w of cadeia.matchAll(/\.(update|insert|upsert)\(([\s\S]*?)\)(?=\.|$)/g)) {
      if (/\b(papel|ativo)\b/.test(w[2])) achados.push({ tipo: 'grava', trecho: w[0].slice(0, 120) })
    }
  }
  for (const seg of texto.split(/leituraDeRelacao\(/).slice(1)) {
    const obj = seg.slice(0, Math.max(0, seg.indexOf('})')) || seg.length)
    if (!/origem:\s*(['"`])profiles\1/.test(obj)) continue
    const sel = /select:\s*(['"`])([\s\S]*?)\1/.exec(obj)
    if (sel && /\b(papel|ativo)\b/.test(sel[2])) achados.push({ tipo: 'forma', trecho: sel[0] })
  }
  const forma = leCargoEmProfiles(literaisDe(texto).join('\n'))
  if (forma !== null) achados.push({ tipo: `sql (${forma})`, trecho: 'SQL em literal' })
  return achados
}

/** Os arquivos do universo TS: `src/**` e `scripts/**`, sem testes e sem node_modules. */
export function arquivosTs(raiz = process.cwd()) {
  const saida = []
  const andar = (rel) => {
    for (const nome of readdirSync(join(raiz, rel))) {
      if (nome === 'node_modules' || nome.startsWith('.')) continue
      const r = `${rel}/${nome}`
      const st = statSync(join(raiz, r))
      if (st.isDirectory()) andar(r)
      else if (/\.(ts|tsx|mts|mjs|js)$/.test(nome) && !/\.test\.|\.d\.ts$/.test(nome)) saida.push(r)
    }
  }
  andar('src')
  andar('scripts')
  return saida.sort()
}

// -----------------------------------------------------------------------------
// Roteiros
// -----------------------------------------------------------------------------

/** A marca de exceção que um roteiro põe no comando: `-- F62/cargo-congelado: <rótulo>`. */
export const RE_MARCA_ROTEIRO = /F62\/cargo-congelado:\s*([^\s].*?)\s*$/

function codigoDaLinha(linha) {
  // corta o comentário `--` fora de aspas simples
  let dentro = false
  for (let i = 0; i < linha.length; i++) {
    if (linha[i] === "'") dentro = !dentro
    else if (!dentro && linha[i] === '-' && linha[i + 1] === '-') return linha.slice(0, i)
  }
  return linha
}

/**
 * Os comandos de um roteiro que leem ou escrevem o cargo em `profiles`, com a linha e a
 * marca de exceção (se houver). O comando é a janela entre dois `;` que contém a linha
 * que cita `profiles`.
 * @returns {{ linha: number, forma: string, marca: string | null }[]}
 */
export function achadosRoteiro(texto) {
  const linhas = texto.split(/\r?\n/)
  const codigo = linhas.map(codigoDaLinha)
  const vistos = new Set()
  const achados = []
  for (let i = 0; i < linhas.length; i++) {
    if (!/\bprofiles\b/i.test(codigo[i])) continue
    let ini = i
    while (ini > 0 && !codigo[ini - 1].includes(';')) ini--
    let fim = i
    while (fim < linhas.length - 1 && !codigo[fim].includes(';')) fim++
    if (vistos.has(ini)) continue
    const janela = codigo.slice(ini, fim + 1).join('\n')
    const forma = leCargoEmProfiles(janela)
    if (forma === null) continue
    vistos.add(ini)
    let marca = null
    for (let k = ini; k <= fim; k++) {
      const mm = RE_MARCA_ROTEIRO.exec(linhas[k])
      if (mm) {
        marca = mm[1]
        break
      }
    }
    achados.push({ linha: i + 1, forma, marca })
  }
  return achados
}

/** Os roteiros de `supabase/tests`. */
export function arquivosRoteiro(raiz = process.cwd()) {
  return readdirSync(join(raiz, 'supabase', 'tests'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

/** As migrations lidas do disco, em ordem. */
export function lerMigrations(raiz = process.cwd()) {
  return listarMigrations(raiz).map((arquivo) => ({
    arquivo,
    sql: readFileSync(join(raiz, ...PASTA_MIGRATIONS, arquivo), 'utf8'),
  }))
}
