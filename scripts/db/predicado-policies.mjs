// =============================================================================
// predicado-policies.mjs — a doutrina do predicado, lida das migrations (F59)
// =============================================================================
// POR QUE ELE EXISTE
//
// A virada multiempresa vai escrever o predicado de tenant em ~60 policies. Se uma
// delas nascer `using (public.e_membro(empresa_id))`, a função `security definer`
// roda UMA VEZ POR LINHA, em toda leitura, para todo usuário — e nada no repositório
// se mexe. A doutrina (emenda F59 da `docs/MATRIZ-REGRAS.md`, R-ACC-63 em diante) diz
// a forma certa; este módulo é a metade DE MESA da trava que a torna impossível de
// violar. A outra metade confere a mesma doutrina no catálogo vivo do banco do CI
// (`supabase/tests/catalogo_policies.sql`, rótulos `10a`–`14`), e as exceções moram
// numa fonte só: o array `k_excecoes_predicado` daquele `.sql`, que este módulo LÊ.
//
// AS TRÊS REGRAS (o que é "dado da linha" e o que é "função" está na emenda)
//
//   R1 — nenhuma função recebe dado da LINHA (coluna nua, qualificada, expressão
//        sobre coluna, ou dentro de `(select …)` — o falso içamento), salvo
//        ocorrência declarada `schema.tabela / policy / função`.
//   R2 — função que NÃO recebe dado da linha (sem argumento ou só constantes) só
//        dentro de `(select …)`: solta, ela também roda por linha.
//   R3 — sub-select não lê tabela nem view, e não referencia a linha fora de
//        argumento de função (a "junta com a linha"), salvo exceção declarada
//        `schema.tabela / policy / sub-select`.
//
// FALHA FECHADA (o ponto cego provável da F66, que tende a reescrever num laço)
//
//   · DDL de policy montado dinamicamente — o texto `create|alter|drop policy`
//     dentro de literal ou de corpo `$…$` — reprova com arquivo e linha;
//   · comando de policy que o replay não consegue ler reprova, em vez de ser pulado;
//   · a auto-conferência prova que TODO `create|alter|drop policy` fora de
//     comentário, em todas as migrations, foi consumido pelo replay.
//
// ⚠ ESTE MÓDULO NÃO FALA COM BANCO — é por isso que ele roda na mesa, e é por isso
// que ele é módulo próprio, testado em `predicado-policies.test.mts`. A trava que o
// usa é `src/lib/validators/policies-initplan.test.ts`.
//
// ⚠ A LIÇÃO DA F53 (`corpo-vigente.mjs` leu pseudo-SQL de comentário como definição):
// aqui o léxico tira comentário ANTES de qualquer casamento, e a auto-conferência
// também conta só o que não é comentário.
// =============================================================================

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PASTA_MIGRATIONS, fimDoComando, listarMigrations } from './corpo-vigente.mjs'

/** O texto que a auto-conferência procura fora de comentário. */
export const PADRAO_DDL_POLICY = /\b(create|alter|drop)\s+policy\b/gi

/** Onde a doutrina está escrita — toda mensagem de falha aponta para cá. */
export const EMENDA = 'emenda F59 da docs/MATRIZ-REGRAS.md (R-ACC-63 em diante)'

// -----------------------------------------------------------------------------
// Léxico
// -----------------------------------------------------------------------------

export class ErroDeLeitura extends Error {}

const RE_ESPACO = /\s+/y
const RE_IDENT = /[A-Za-z_-￿][A-Za-z0-9_$-￿]*/y
const RE_NUM = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y
const RE_DOLLAR = /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/y
const RE_PARAM = /\$\d+/y
const CHARS_OP = new Set('+-*/<>=~!@#%^&|`?:')

function casar(re, sql, i) {
  re.lastIndex = i
  const m = re.exec(sql)
  return m ? m[0] : null
}

/**
 * Tokens de um trecho SQL. Comentário não vira token (vai para `comentarios`).
 * Cada token: `{ tipo, v, ini, fim }` — `tipo` ∈ ident | qident | str | dollar |
 * num | param | punct | op. `ident` vem em minúsculas; `qident`, `str` e `dollar`
 * trazem o conteúdo sem delimitador.
 * @param {string} sql
 * @param {number} [base] deslocamento somado a `ini`/`fim` (posição no arquivo)
 */
export function lexar(sql, base = 0) {
  const tokens = []
  const comentarios = []
  const n = sql.length
  let i = 0
  const token = (tipo, v, ini, fim) => tokens.push({ tipo, v, ini: base + ini, fim: base + fim })

  while (i < n) {
    const c = sql[i]
    const esp = casar(RE_ESPACO, sql, i)
    if (esp) {
      i += esp.length
      continue
    }
    if (c === '-' && sql[i + 1] === '-') {
      const f = sql.indexOf('\n', i)
      const fim = f === -1 ? n : f
      comentarios.push([base + i, base + fim])
      i = fim
      continue
    }
    if (c === '/' && sql[i + 1] === '*') {
      let prof = 1
      let j = i + 2
      while (j < n && prof > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') {
          prof++
          j += 2
        } else if (sql[j] === '*' && sql[j + 1] === '/') {
          prof--
          j += 2
        } else j++
      }
      if (prof > 0) throw new ErroDeLeitura(`comentário de bloco não fecha (posição ${base + i})`)
      comentarios.push([base + i, base + j])
      i = j
      continue
    }
    if ((c === 'e' || c === 'E') && sql[i + 1] === "'") {
      const r = lerLiteral(sql, i + 1, true, base)
      token('str', r.v, i, r.fim)
      i = r.fim
      continue
    }
    if (c === "'") {
      const r = lerLiteral(sql, i, false, base)
      token('str', r.v, i, r.fim)
      i = r.fim
      continue
    }
    if (c === '"') {
      let j = i + 1
      let v = ''
      for (;;) {
        if (j >= n) throw new ErroDeLeitura(`identificador entre aspas não fecha (posição ${base + i})`)
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') {
            v += '"'
            j += 2
            continue
          }
          break
        }
        v += sql[j++]
      }
      token('qident', v, i, j + 1)
      i = j + 1
      continue
    }
    if (c === '$') {
      const tag = casar(RE_DOLLAR, sql, i)
      if (tag) {
        const f = sql.indexOf(tag, i + tag.length)
        if (f === -1) throw new ErroDeLeitura(`bloco ${tag} não fecha (posição ${base + i})`)
        token('dollar', sql.slice(i + tag.length, f), i, f + tag.length)
        i = f + tag.length
        continue
      }
      const p = casar(RE_PARAM, sql, i)
      if (p) {
        token('param', p, i, i + p.length)
        i += p.length
        continue
      }
    }
    if ((c >= '0' && c <= '9') || (c === '.' && sql[i + 1] >= '0' && sql[i + 1] <= '9')) {
      const m = casar(RE_NUM, sql, i)
      token('num', m, i, i + m.length)
      i += m.length
      continue
    }
    const id = casar(RE_IDENT, sql, i)
    if (id) {
      token('ident', id.toLowerCase(), i, i + id.length)
      i += id.length
      continue
    }
    if ('(),;[].'.includes(c)) {
      token('punct', c, i, i + 1)
      i++
      continue
    }
    if (CHARS_OP.has(c)) {
      let j = i
      while (
        j < n &&
        CHARS_OP.has(sql[j]) &&
        !(sql[j] === '-' && sql[j + 1] === '-') &&
        !(sql[j] === '/' && sql[j + 1] === '*')
      )
        j++
      if (j === i) j = i + 1
      token('op', sql.slice(i, j), i, j)
      i = j
      continue
    }
    token('op', c, i, i + 1)
    i++
  }
  return { tokens, comentarios }
}

function lerLiteral(sql, abre, escape, base) {
  let j = abre + 1
  let v = ''
  for (;;) {
    if (j >= sql.length) throw new ErroDeLeitura(`literal não fecha (posição ${base + abre})`)
    const c = sql[j]
    if (escape && c === '\\') {
      v += sql[j + 1] ?? ''
      j += 2
      continue
    }
    if (c === "'") {
      if (sql[j + 1] === "'") {
        v += "'"
        j += 2
        continue
      }
      return { v, fim: j + 1 }
    }
    v += c
    j++
  }
}

/** Número da linha (1-based) de uma posição do texto. */
export function linhaDe(texto, pos) {
  let linha = 1
  for (let i = 0; i < pos && i < texto.length; i++) if (texto.charCodeAt(i) === 10) linha++
  return linha
}

// -----------------------------------------------------------------------------
// Replay das policies, na ordem do texto (a lição da 0091, `nomesVivos`)
// -----------------------------------------------------------------------------

/**
 * As migrations, em ordem de aplicação, lidas do disco.
 * @param {string} [raiz]
 * @returns {{ arquivo: string, sql: string }[]}
 */
export function carregarMigrations(raiz = process.cwd()) {
  return listarMigrations(raiz).map((arquivo) => ({
    arquivo,
    sql: readFileSync(join(raiz, ...PASTA_MIGRATIONS, arquivo), 'utf8'),
  }))
}

const VERBOS = { all: 'ALL', select: 'SELECT', insert: 'INSERT', update: 'UPDATE', delete: 'DELETE' }

function nomeDe(t) {
  return t && (t.tipo === 'ident' || t.tipo === 'qident') ? t.v : null
}

/** Nome qualificado a partir de `tk[i]`: `{ schema, nome, prox }` (schema implícito `public`). */
function nomeQualificado(tk, i) {
  const partes = []
  let j = i
  const primeiro = nomeDe(tk[j])
  if (primeiro === null) return null
  partes.push(primeiro)
  j++
  while (tk[j]?.tipo === 'punct' && tk[j].v === '.' && nomeDe(tk[j + 1]) !== null) {
    partes.push(tk[j + 1].v)
    j += 2
  }
  if (partes.length > 2) return null
  return partes.length === 2
    ? { schema: partes[0], nome: partes[1], prox: j }
    : { schema: 'public', nome: partes[0], prox: j }
}

/** O conteúdo de `(` … `)` a partir do `(` em `tk[i]`: `{ texto, prox }`. */
function grupoBalanceado(tk, i, sqlArquivo) {
  if (!(tk[i]?.tipo === 'punct' && tk[i].v === '(')) return null
  let prof = 0
  for (let j = i; j < tk.length; j++) {
    const t = tk[j]
    if (t.tipo !== 'punct') continue
    if (t.v === '(') prof++
    else if (t.v === ')') {
      prof--
      if (prof === 0) return { texto: sqlArquivo.slice(tk[i].fim, t.ini), ini: tk[i].fim, prox: j + 1 }
    }
  }
  return null
}

const chaveDe = (schema, tabela, nome) => `${schema}.${tabela} / ${nome}`

/**
 * Reproduz, em ordem, o que as migrations fazem com as policies.
 * @param {{ arquivo: string, sql: string }[]} migrations
 */
export function replayPolicies(migrations) {
  /** @type {Map<string, any>} */
  const vivas = new Map()
  const falhas = []
  let consumidos = 0
  let noTexto = 0

  for (const { arquivo, sql } of migrations) {
    const falhar = (pos, motivo) => falhas.push({ arquivo, linha: linhaDe(sql, pos), motivo })
    const inicios = new Set()
    const literais = []
    const semComentario = sql.split('')

    let i = 0
    while (i < sql.length) {
      const fim = fimDoComando(sql, i)
      const ate = fim === -1 ? sql.length : fim
      let lexado
      try {
        lexado = lexar(sql.slice(i, ate), i)
      } catch (err) {
        falhar(i, `o léxico não leu o comando: ${err.message}`)
        i = ate
        continue
      }
      for (const [a, b] of lexado.comentarios) for (let k = a; k < b; k++) semComentario[k] = ' '
      for (const t of lexado.tokens) if (t.tipo === 'str' || t.tipo === 'dollar') literais.push(t)
      const tk = lexado.tokens.filter((t) => !(t.tipo === 'punct' && t.v === ';'))
      if (tk.length > 0) {
        const r = aplicarComando(tk, sql, arquivo, vivas, (pos, motivo) => falhar(pos, motivo))
        if (r === 'policy') {
          consumidos++
          inicios.add(tk[0].ini)
        }
      }
      i = ate
    }

    // A AUTO-CONFERÊNCIA: todo `create|alter|drop policy` fora de comentário foi
    // consumido — ou mora dentro de literal/corpo `$…$` e reprova como DDL dinâmico.
    const limpo = semComentario.join('')
    for (const m of limpo.matchAll(PADRAO_DDL_POLICY)) {
      noTexto++
      if (inicios.has(m.index)) continue
      const dentro = literais.find((t) => m.index >= t.ini && m.index < t.fim)
      if (dentro) {
        falhar(
          m.index,
          `DDL de policy montado dinamicamente ("${m[0]}" dentro de ${dentro.tipo === 'dollar' ? 'corpo $…$' : 'literal'}) — o replay não sabe o que ele cria; escreva o comando por extenso na migration`,
        )
      } else {
        falhar(m.index, `"${m[0]}" fora de comentário que o replay não consumiu`)
      }
    }
  }

  return { vivas, consumidos, noTexto, falhas }
}

function aplicarComando(tk, sql, arquivo, vivas, falhar) {
  const p0 = tk[0].tipo === 'ident' ? tk[0].v : null
  const p1 = tk[1]?.tipo === 'ident' ? tk[1].v : null
  if (p1 === 'policy' && (p0 === 'create' || p0 === 'alter' || p0 === 'drop')) {
    const ok =
      p0 === 'create'
        ? criarPolicy(tk, sql, arquivo, vivas, falhar)
        : p0 === 'alter'
          ? alterarPolicy(tk, sql, arquivo, vivas, falhar)
          : droparPolicy(tk, vivas, falhar)
    if (!ok) falhar(tk[0].ini, `comando "${p0} policy" ilegível para o replay — a trava não pula o que não lê`)
    return 'policy'
  }
  if (p0 === 'drop' && p1 === 'table') droparTabelas(tk, vivas)
  if (p0 === 'alter' && p1 === 'table') renomearTabela(tk, vivas)
  return null
}

function criarPolicy(tk, sql, arquivo, vivas, falhar) {
  const nome = nomeDe(tk[2])
  if (nome === null || tk[3]?.v !== 'on') return false
  const tabela = nomeQualificado(tk, 4)
  if (!tabela) return false
  const pol = {
    schema: tabela.schema,
    tabela: tabela.nome,
    nome,
    verbo: 'ALL',
    using: null,
    withCheck: null,
    arquivo,
    linha: linhaDe(sql, tk[0].ini),
  }
  if (!lerClausulas(tk, tabela.prox, sql, pol, true)) return false
  const chave = chaveDe(pol.schema, pol.tabela, nome)
  if (vivas.has(chave)) {
    falhar(tk[0].ini, `create policy de uma policy que já existe (${chave}) — o Postgres recusaria`)
    return true
  }
  vivas.set(chave, pol)
  return true
}

function alterarPolicy(tk, sql, arquivo, vivas, falhar) {
  const nome = nomeDe(tk[2])
  if (nome === null || tk[3]?.v !== 'on') return false
  const tabela = nomeQualificado(tk, 4)
  if (!tabela) return false
  const chave = chaveDe(tabela.schema, tabela.nome, nome)
  const pol = vivas.get(chave)
  let j = tabela.prox
  if (tk[j]?.v === 'rename' && tk[j + 1]?.v === 'to' && nomeDe(tk[j + 2]) !== null && j + 3 === tk.length) {
    if (!pol) {
      falhar(tk[0].ini, `alter policy … rename de uma policy que o replay não conhece (${chave})`)
      return true
    }
    vivas.delete(chave)
    const novo = { ...pol, nome: tk[j + 2].v, arquivo, linha: linhaDe(sql, tk[0].ini) }
    vivas.set(chaveDe(pol.schema, pol.tabela, novo.nome), novo)
    return true
  }
  const alvo = pol ? { ...pol } : { schema: tabela.schema, tabela: tabela.nome, nome, using: null, withCheck: null }
  if (!lerClausulas(tk, j, sql, alvo, false)) return false
  if (!pol) {
    falhar(tk[0].ini, `alter policy de uma policy que o replay não conhece (${chave})`)
    return true
  }
  vivas.set(chave, { ...alvo, arquivo, linha: linhaDe(sql, tk[0].ini) })
  return true
}

function lerClausulas(tk, inicio, sql, pol, criando) {
  let j = inicio
  while (j < tk.length) {
    const t = tk[j]
    if (criando && t.v === 'as' && (tk[j + 1]?.v === 'permissive' || tk[j + 1]?.v === 'restrictive')) {
      pol.restritiva = tk[j + 1].v === 'restrictive'
      j += 2
    } else if (criando && t.v === 'for' && VERBOS[tk[j + 1]?.v]) {
      pol.verbo = VERBOS[tk[j + 1].v]
      j += 2
    } else if (t.v === 'to' && t.tipo === 'ident') {
      j++
      if (nomeDe(tk[j]) === null) return false
      j++
      while (tk[j]?.tipo === 'punct' && tk[j].v === ',') {
        if (nomeDe(tk[j + 1]) === null) return false
        j += 2
      }
    } else if (t.v === 'using' && t.tipo === 'ident') {
      const g = grupoBalanceado(tk, j + 1, sql)
      if (!g) return false
      pol.using = g.texto
      j = g.prox
    } else if (t.v === 'with' && t.tipo === 'ident' && tk[j + 1]?.v === 'check') {
      const g = grupoBalanceado(tk, j + 2, sql)
      if (!g) return false
      pol.withCheck = g.texto
      j = g.prox
    } else {
      return false
    }
  }
  return true
}

function droparPolicy(tk, vivas, falhar) {
  let j = 2
  let seExiste = false
  if (tk[j]?.v === 'if' && tk[j + 1]?.v === 'exists') {
    seExiste = true
    j += 2
  }
  const nome = nomeDe(tk[j])
  if (nome === null || tk[j + 1]?.v !== 'on') return false
  const tabela = nomeQualificado(tk, j + 2)
  if (!tabela) return false
  const resto = tk.slice(tabela.prox)
  if (resto.length > 1 || (resto.length === 1 && !['cascade', 'restrict'].includes(resto[0].v))) return false
  const chave = chaveDe(tabela.schema, tabela.nome, nome)
  if (!vivas.delete(chave) && !seExiste) {
    falhar(tk[0].ini, `drop policy de uma policy que o replay não conhece (${chave}) — o Postgres recusaria`)
  }
  return true
}

function droparTabelas(tk, vivas) {
  let j = 2
  if (tk[j]?.v === 'if' && tk[j + 1]?.v === 'exists') j += 2
  for (;;) {
    const t = nomeQualificado(tk, j)
    if (!t) return
    for (const [chave, pol] of vivas) if (pol.schema === t.schema && pol.tabela === t.nome) vivas.delete(chave)
    j = t.prox
    if (tk[j]?.tipo === 'punct' && tk[j].v === ',') j++
    else return
  }
}

function renomearTabela(tk, vivas) {
  let j = 2
  if (tk[j]?.v === 'if' && tk[j + 1]?.v === 'exists') j += 2
  if (tk[j]?.v === 'only') j++
  const t = nomeQualificado(tk, j)
  if (!t) return
  j = t.prox
  let destino = null
  if (tk[j]?.v === 'rename' && tk[j + 1]?.v === 'to' && nomeDe(tk[j + 2]) !== null && j + 3 === tk.length) {
    destino = { schema: t.schema, nome: tk[j + 2].v }
  } else if (tk[j]?.v === 'set' && tk[j + 1]?.v === 'schema' && nomeDe(tk[j + 2]) !== null && j + 3 === tk.length) {
    destino = { schema: tk[j + 2].v, nome: t.nome }
  }
  if (!destino) return
  for (const [chave, pol] of [...vivas]) {
    if (pol.schema !== t.schema || pol.tabela !== t.nome) continue
    vivas.delete(chave)
    const novo = { ...pol, schema: destino.schema, tabela: destino.nome }
    vivas.set(chaveDe(novo.schema, novo.tabela, novo.nome), novo)
  }
}

// -----------------------------------------------------------------------------
// A análise de um predicado (`using` ou `with check`)
// -----------------------------------------------------------------------------

/**
 * Palavras que nunca são coluna nem nome de função. Seguidas de `(`, abrem um GRUPO,
 * não uma chamada — é o que impede `and (select …)` de virar "a função `and`"
 * (defeito medido no instrumento do censo da F59).
 */
export const PALAVRAS = new Set(
  (
    'and or not is null true false in any some all array select from where exists case when then else end as cast ' +
    'distinct between like ilike similar to escape isnull notnull unknown row collate at time zone interval limit ' +
    'offset order by group having join on left right inner outer cross lateral with union intersect except asc desc ' +
    'nulls first last using filter over partition within values default overlaps symmetric asymmetric only natural ' +
    'full fetch next rows ties both leading trailing for current_date current_time current_timestamp localtime ' +
    'localtimestamp'
  ).split(' '),
)

/**
 * Construções com cara de chamada que NÃO são função (lista NOMINAL, emenda F59):
 * tratadas pelo que são — o que está dentro delas segue as regras normalmente.
 * `cast`, `row`, `array`, `exists`, `any` estão em PALAVRAS.
 */
export const CONSTRUCOES = new Set(['coalesce', 'nullif', 'greatest', 'least'])

/**
 * Funções SEM parêntese e sem argumento (o Postgres 16+ as guarda como `FuncExpr`):
 * valem como chamada sem dado da linha — a R2 as alcança.
 */
export const SEM_ARGUMENTO = new Set([
  'current_user',
  'session_user',
  'current_role',
  'user',
  'current_schema',
  'current_catalog',
  'system_user',
])

const CONTINUA_TIPO = new Set(['precision', 'varying', 'with', 'without', 'time', 'zone'])
const CLAUSULAS = new Set(['from', 'where', 'group', 'having', 'order', 'limit', 'offset', 'window', 'fetch', 'for'])
const JUNCAO = new Set(['join', 'inner', 'left', 'right', 'full', 'outer', 'cross', 'natural', 'lateral', 'only'])

export class ErroDeAnalise extends Error {}

function aninhar(tokens) {
  const raiz = { tipo: 'grupo', itens: [] }
  const pilha = [raiz]
  for (const t of tokens) {
    if (t.tipo === 'punct' && t.v === '(') {
      const g = { tipo: 'grupo', abre: t, itens: [] }
      pilha.at(-1).itens.push(g)
      pilha.push(g)
    } else if (t.tipo === 'punct' && t.v === ')') {
      if (pilha.length === 1) throw new ErroDeAnalise('")" sem "(" correspondente')
      pilha.pop().fecha = t
    } else {
      pilha.at(-1).itens.push(t)
    }
  }
  if (pilha.length !== 1) throw new ErroDeAnalise('"(" sem ")" correspondente')
  return raiz.itens
}

const ehNome = (it) => it && (it.tipo === 'ident' || it.tipo === 'qident')
const ehSubselect = (g) => g?.tipo === 'grupo' && g.itens[0]?.tipo === 'ident' && ['select', 'with', 'values'].includes(g.itens[0].v)

function lerCadeia(itens, i) {
  const partes = [itens[i]]
  let j = i + 1
  while (
    itens[j]?.tipo === 'punct' &&
    itens[j].v === '.' &&
    (ehNome(itens[j + 1]) || (itens[j + 1]?.tipo === 'op' && itens[j + 1].v === '*'))
  ) {
    partes.push(itens[j + 1])
    j += 2
  }
  return { partes, prox: j }
}

function pularTipo(itens, i) {
  let j = i
  if (!ehNome(itens[j])) return j
  j = lerCadeia(itens, j).prox
  while (itens[j]?.tipo === 'ident' && CONTINUA_TIPO.has(itens[j].v)) j++
  if (itens[j]?.tipo === 'grupo' && !ehSubselect(itens[j])) j++
  while (itens[j]?.tipo === 'punct' && itens[j].v === '[') {
    j++
    if (itens[j]?.tipo === 'num') j++
    if (itens[j]?.tipo === 'punct' && itens[j].v === ']') j++
  }
  return j
}

const nomeCadeia = (partes) => partes.map((p) => p.v).join('.')
const normalizar = (s) => s.replace(/\s+/g, ' ').trim()

/**
 * Analisa um predicado (o conteúdo de `using (…)` ou `with check (…)`).
 * @param {string} texto
 * @returns {{
 *   linha: { funcao: string, argumento: string, dentroDeSelect: boolean }[],
 *   semLinha: { funcao: string, argumento: string }[],
 *   subselects: { leRelacao: string[], refLinha: string[], trecho: string }[],
 * }}
 * @throws {ErroDeAnalise|ErroDeLeitura} quando não consegue ler — a trava reprova
 */
export function analisarPredicado(texto) {
  const { tokens } = lexar(texto)
  const itens = aninhar(tokens)
  const e = { texto, chamadas: [], escopos: [], linha: [], semLinha: [], subselects: [] }
  andar(itens, e)
  return { linha: e.linha, semLinha: e.semLinha, subselects: e.subselects }
}

function andar(itens, e) {
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i]
    if (it.tipo === 'grupo') {
      if (ehSubselect(it)) tratarSubselect(it, e)
      else andar(it.itens, e)
      continue
    }
    if (it.tipo === 'op' && it.v === '::') {
      i = pularTipo(itens, i + 1) - 1
      continue
    }
    if (!ehNome(it)) continue

    const { partes, prox } = lerCadeia(itens, i)
    const seguinte = itens[prox]
    const sozinha = partes.length === 1 && it.tipo === 'ident'

    if (seguinte?.tipo === 'grupo' && !(sozinha && PALAVRAS.has(it.v))) {
      tratarChamada(partes, seguinte, e)
      i = prox
      continue
    }
    if (sozinha && it.v === 'as') {
      i = pularTipo(itens, i + 1) - 1
      continue
    }
    if (sozinha && SEM_ARGUMENTO.has(it.v)) {
      if (e.escopos.length === 0) e.semLinha.push({ funcao: it.v, argumento: '' })
      continue
    }
    if (sozinha && PALAVRAS.has(it.v)) continue
    if (seguinte?.tipo === 'str') {
      // literal tipado: `date '…'`, `interval '…'`
      i = prox
      continue
    }
    if (seguinte?.tipo === 'op' && seguinte.v === '=>') {
      // argumento nomeado: `fn(p_x => col)`
      i = prox
      continue
    }
    referencia(partes, e)
    i = prox - 1
  }
}

function tratarChamada(partes, grupo, e) {
  const nome = partes.at(-1).v
  if (partes.length === 1 && CONSTRUCOES.has(nome)) {
    andar(grupo.itens, e)
    return
  }
  if (ehSubselect(grupo)) throw new ErroDeAnalise(`${nome}(select …) sem parênteses próprios não é lido pela trava`)
  const frame = {
    nome,
    prof: e.escopos.length,
    recebeLinha: false,
    argumento: normalizar(e.texto.slice(grupo.abre.fim, grupo.fecha.ini)),
  }
  e.chamadas.push(frame)
  andar(grupo.itens, e)
  e.chamadas.pop()
  if (frame.recebeLinha) e.linha.push({ funcao: nome, argumento: frame.argumento, dentroDeSelect: frame.prof > 0 })
  else if (frame.prof === 0) e.semLinha.push({ funcao: nome, argumento: frame.argumento })
}

function referencia(partes, e) {
  const prof = e.escopos.length
  let local = false
  let ambigua = false
  if (partes.length >= 2) {
    const q = partes.at(-2).v
    local = e.escopos.some((s) => s.aliases.has(q))
  } else if (e.escopos.some((s) => s.aliases.has(partes[0].v))) {
    local = true
  } else if (prof > 0 && e.escopos.some((s) => s.temFrom)) {
    // não qualificada dentro de sub-select com FROM: pode ser da linha — falha fechada
    ambigua = true
  }
  if (local) return
  for (const f of e.chamadas) f.recebeLinha = true
  if (prof > 0 && !e.chamadas.some((f) => f.prof === prof)) {
    e.escopos.at(-1).refLinha.push(nomeCadeia(partes) + (ambigua ? ' (não qualificada)' : ''))
  }
}

function tratarSubselect(grupo, e) {
  const itens = grupo.itens
  if (itens[0].v !== 'select') {
    throw new ErroDeAnalise(`sub-select começando por "${itens[0].v}" não é lido pela trava — escreva "select …"`)
  }
  const segs = segmentar(itens)
  const entradas = segs.from ? lerFrom(segs.from) : []
  const escopo = { aliases: new Set(), temFrom: segs.from !== null, leRelacao: [], refLinha: [] }
  for (const en of entradas) for (const a of en.aliases) escopo.aliases.add(a)
  e.escopos.push(escopo)
  andar(segs.alvo, e)
  for (const en of entradas) {
    if (en.tipo === 'relacao') escopo.leRelacao.push(en.nome)
    else if (en.tipo === 'funcao') tratarChamada(en.partes, en.grupo, e)
    else if (en.tipo === 'derivada') tratarSubselect(en.grupo, e)
    else andar(en.itens, e)
  }
  for (const r of segs.resto) andar(r, e)
  e.escopos.pop()
  if (escopo.leRelacao.length > 0 || escopo.refLinha.length > 0) {
    e.subselects.push({
      leRelacao: escopo.leRelacao,
      refLinha: escopo.refLinha,
      trecho: normalizar(e.texto.slice(grupo.abre.fim, grupo.fecha.ini)),
    })
  }
}

function segmentar(itens) {
  const segs = { alvo: [], from: null, resto: [] }
  let atual = segs.alvo
  for (let i = 1; i < itens.length; i++) {
    const it = itens[i]
    if (it.tipo === 'ident' && ['union', 'intersect', 'except'].includes(it.v)) {
      throw new ErroDeAnalise(`"${it.v}" dentro de sub-select de policy não é lido pela trava`)
    }
    if (it.tipo === 'ident' && CLAUSULAS.has(it.v)) {
      if (it.v === 'from' && segs.from === null) {
        segs.from = []
        atual = segs.from
      } else {
        atual = []
        segs.resto.push(atual)
      }
      continue
    }
    atual.push(it)
  }
  return segs
}

function lerFrom(itens) {
  const entradas = []
  let i = 0
  while (i < itens.length) {
    const it = itens[i]
    if (it.tipo === 'punct' && it.v === ',') {
      i++
      continue
    }
    if (it.tipo === 'ident' && JUNCAO.has(it.v)) {
      i++
      continue
    }
    if (it.tipo === 'ident' && it.v === 'on') {
      const cond = []
      i++
      while (i < itens.length && !(itens[i].tipo === 'punct' && itens[i].v === ',') && !(itens[i].tipo === 'ident' && JUNCAO.has(itens[i].v))) {
        cond.push(itens[i++])
      }
      entradas.push({ tipo: 'expr', itens: cond, aliases: [] })
      continue
    }
    if (it.tipo === 'ident' && it.v === 'using' && itens[i + 1]?.tipo === 'grupo') {
      i += 2
      continue
    }
    let entrada
    if (it.tipo === 'grupo') {
      if (!ehSubselect(it)) throw new ErroDeAnalise('junção entre parênteses no FROM de sub-select não é lida pela trava')
      entrada = { tipo: 'derivada', grupo: it, aliases: [] }
      i++
    } else if (ehNome(it)) {
      const { partes, prox } = lerCadeia(itens, i)
      if (itens[prox]?.tipo === 'grupo' && !ehSubselect(itens[prox])) {
        entrada = { tipo: 'funcao', partes, grupo: itens[prox], aliases: [partes.at(-1).v] }
        i = prox + 1
      } else {
        entrada = { tipo: 'relacao', nome: nomeCadeia(partes), aliases: [partes.at(-1).v] }
        i = prox
      }
    } else {
      throw new ErroDeAnalise(`FROM de sub-select ilegível para a trava (perto de "${it.v}")`)
    }
    if (itens[i]?.tipo === 'ident' && itens[i].v === 'as') i++
    if (ehNome(itens[i]) && !(itens[i].tipo === 'ident' && (PALAVRAS.has(itens[i].v) || JUNCAO.has(itens[i].v)))) {
      entrada.aliases.push(itens[i].v)
      i++
    }
    if (itens[i]?.tipo === 'grupo' && !ehSubselect(itens[i])) {
      for (const c of itens[i].itens) if (ehNome(c)) entrada.aliases.push(c.v)
      i++
    }
    entradas.push(entrada)
  }
  return entradas
}

// -----------------------------------------------------------------------------
// A fonte única: as listas de `supabase/tests/catalogo_policies.sql`
// -----------------------------------------------------------------------------

/** O arquivo em que as exceções e o universo congelado moram. */
export const ARQUIVO_CATALOGO = ['supabase', 'tests', 'catalogo_policies.sql']

function corpoDoArray(sqlCatalogo, nome) {
  const m = new RegExp(`\\b${nome}\\s+text\\[\\]\\s*:=\\s*array\\[([\\s\\S]*?)\\n\\s*\\](?:::text\\[\\])?\\s*;`).exec(
    sqlCatalogo,
  )
  if (!m) return null
  return { corpo: m[1], linha: linhaDe(sqlCatalogo, m.index) }
}

/** O formato de uma entrada de exceção — a linha INTEIRA, de propósito. */
export const RE_ENTRADA_EXCECAO =
  /^\s*'([^']+)'\s*,?\s*--\s*(\d{4})\s*·\s*motivo:\s*(.+?)\s*·\s*destino:\s*(F\d+[A-Z]?|permanente)\b(.*)$/

/**
 * As exceções da doutrina, lidas do `.sql` como TEXTO (Decisão 2 da F48: uma fonte
 * por fato — nunca uma cópia em TypeScript).
 * @param {string} sqlCatalogo
 * @returns {{ entradas: { chave: string, migration: string, motivo: string, destino: string, linha: number }[], problemas: string[] }}
 */
export function lerExcecoesDoCatalogo(sqlCatalogo) {
  const achado = corpoDoArray(sqlCatalogo, 'k_excecoes_predicado')
  if (!achado) return { entradas: [], problemas: ['não achei o array k_excecoes_predicado em catalogo_policies.sql'] }
  const entradas = []
  const problemas = []
  achado.corpo.split('\n').forEach((bruta, k) => {
    const l = bruta.trim()
    if (l === '' || l.startsWith('--')) return
    const linha = achado.linha + k
    const m = RE_ENTRADA_EXCECAO.exec(bruta)
    if (!m) {
      problemas.push(
        `catalogo_policies.sql:${linha} — entrada de k_excecoes_predicado fora do formato "'schema.tabela / policy / função', -- NNNN · motivo: … · destino: F<n>|permanente": ${l}`,
      )
      return
    }
    const [, chave, migration, motivo, destino] = m
    if (motivo.length < 30) problemas.push(`catalogo_policies.sql:${linha} — motivo curto demais para "${chave}"`)
    if (!/^[a-z_][a-z_0-9]*\.[a-z_][a-z_0-9]* \/ [^/]+ \/ [a-z_][a-z_0-9-]*$/.test(chave)) {
      problemas.push(`catalogo_policies.sql:${linha} — chave fora do formato "schema.tabela / policy / função": ${chave}`)
    }
    entradas.push({ chave, migration, motivo, destino, linha })
  })
  const chaves = entradas.map((x) => x.chave)
  for (const c of new Set(chaves)) {
    if (chaves.filter((x) => x === c).length > 1) problemas.push(`k_excecoes_predicado repete "${c}"`)
  }
  return { entradas, problemas }
}

/**
 * O universo congelado: `k_policies_public` (`tabela / policy`) ∪ `k_storage` (nome).
 * @param {string} sqlCatalogo
 * @returns {Set<string>} chaves `schema.tabela / policy`
 */
export function lerUniversoDoCatalogo(sqlCatalogo) {
  const universo = new Set()
  for (const [array, prefixo] of [
    ['k_policies_public', 'public.'],
    ['k_storage', 'storage.objects / '],
  ]) {
    const achado = corpoDoArray(sqlCatalogo, array)
    if (!achado) throw new Error(`catalogo_policies.sql: não achei o array ${array}`)
    const semComentario = achado.corpo.replace(/--[^\n]*/g, '')
    for (const m of semComentario.matchAll(/'([^']+)'/g)) universo.add(prefixo + m[1])
  }
  return universo
}

// -----------------------------------------------------------------------------
// O julgamento
// -----------------------------------------------------------------------------

/** A chave de uma ocorrência R3 (o terceiro campo não é função). */
export const MARCA_SUBSELECT = 'sub-select'

/**
 * Julga as policies vivas contra a doutrina e contra a lista única de exceções.
 * @param {{ migrations: { arquivo: string, sql: string }[], sqlCatalogo: string }} entrada
 */
export function julgarPolicies({ migrations, sqlCatalogo }) {
  const replay = replayPolicies(migrations)
  const excecoes = lerExcecoesDoCatalogo(sqlCatalogo)
  const chavesExcecao = new Set(excecoes.entradas.map((x) => x.chave))
  const universo = lerUniversoDoCatalogo(sqlCatalogo)

  /** @type {Map<string, any[]>} ocorrência → onde aparece */
  const ocorrencias = new Map()
  const violacoes = []
  const ilegiveis = []
  let chamadasSemLinha = 0

  const anotar = (chave, dado) => {
    if (!ocorrencias.has(chave)) ocorrencias.set(chave, [])
    ocorrencias.get(chave).push(dado)
  }

  for (const [chavePolicy, pol] of replay.vivas) {
    for (const [clausula, texto] of [
      ['using', pol.using],
      ['with check', pol.withCheck],
    ]) {
      if (texto === null) continue
      const base = { policy: chavePolicy, verbo: pol.verbo, clausula, arquivo: pol.arquivo, linha: pol.linha }
      let r
      try {
        r = analisarPredicado(texto)
      } catch (err) {
        ilegiveis.push({ ...base, motivo: err.message })
        continue
      }
      for (const o of r.linha) {
        const chave = `${chavePolicy} / ${o.funcao}`
        anotar(chave, { ...base, argumento: o.argumento, dentroDeSelect: o.dentroDeSelect })
        if (!chavesExcecao.has(chave)) violacoes.push({ ...base, regra: 'R1', funcao: o.funcao, argumento: o.argumento, dentroDeSelect: o.dentroDeSelect, chave })
      }
      chamadasSemLinha += r.semLinha.length
      for (const s of r.semLinha) violacoes.push({ ...base, regra: 'R2', funcao: s.funcao, argumento: s.argumento })
      for (const s of r.subselects) {
        const chave = `${chavePolicy} / ${MARCA_SUBSELECT}`
        anotar(chave, { ...base, argumento: s.trecho })
        if (!chavesExcecao.has(chave)) violacoes.push({ ...base, regra: 'R3', funcao: null, argumento: s.trecho, leRelacao: s.leRelacao, refLinha: s.refLinha, chave })
      }
    }
  }

  const excecoesSemOcorrencia = excecoes.entradas.filter((x) => !ocorrencias.has(x.chave))
  const vivasChaves = new Set(replay.vivas.keys())
  return {
    replay,
    excecoes,
    ocorrencias,
    violacoes,
    ilegiveis,
    chamadasSemLinha,
    excecoesSemOcorrencia,
    universo: {
      congelado: universo,
      soNoReplay: [...vivasChaves].filter((c) => !universo.has(c)).sort(),
      soNoCatalogo: [...universo].filter((c) => !vivasChaves.has(c)).sort(),
    },
  }
}

/** A mensagem de uma violação: policy, verbo, função, argumento, regra, emenda. */
export function mensagemDeViolacao(v) {
  const onde = `${v.policy} · ${v.verbo} · ${v.clausula} (${v.arquivo}:${v.linha})`
  if (v.regra === 'R1') {
    return (
      `${onde} — R1: a função ${v.funcao}(${v.argumento}) recebe dado da LINHA` +
      (v.dentroDeSelect ? ' — e o "(select …)" em volta NÃO a iça: é o falso içamento, correlacionado, por linha' : ', avaliada uma vez por linha') +
      `. Use "col = any (array (select public.<fn>()))" com função de conjunto, ou declare a ocorrência "${v.chave}" em k_excecoes_predicado com motivo e destino. Veja a ${EMENDA}.`
    )
  }
  if (v.regra === 'R2') {
    return (
      `${onde} — R2: a função ${v.funcao}(${v.argumento}) não recebe dado da linha e está FORA de "(select …)" — solta, ela roda por linha. ` +
      `Embrulhe: "(select public.${v.funcao}(${v.argumento}))" — e, se ela devolve conjunto, "col = any (array (select public.${v.funcao}(${v.argumento})))". Veja a ${EMENDA}.`
    )
  }
  const partes = []
  if (v.leRelacao?.length) partes.push(`lê ${v.leRelacao.join(', ')}`)
  if (v.refLinha?.length) partes.push(`referencia a linha (${v.refLinha.join(', ')})`)
  return (
    `${onde} — R3: o sub-select "(${v.argumento})" ${partes.join(' e ')}. A leitura de tabela mora DENTRO da função de conjunto; ` +
    `a junta com a linha se reescreve como "col in (select … from public.<fn>() u)". Exceção só declarada: "${v.chave}". Veja a ${EMENDA}.`
  )
}
