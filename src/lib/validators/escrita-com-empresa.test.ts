import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { comandosDoTexto, comandosExecutados, semComentarios as semComentariosSql } from '../../../scripts/db/classificar-migration.mjs'
import { definicoesDeFuncao, derrubadaDepois, listarMigrations } from '../../../scripts/db/corpo-vigente.mjs'
import { semComentarios } from '@/lib/layout/texto-fonte'

// =============================================================================
// TODA ESCRITA ESCREVE A EMPRESA (F67C — decisões 5 e 7 do PLAN-F67C, §4)
// =============================================================================
// A F67C tira o `default public.empresa_legada()` das 20 colunas `empresa_id` de `k_negocio`. Sem o default,
// quem insere sem a empresa leva `23502` — em produção, no meio da operação. Esta trava pega o escritor
// esquecido NA MESA, antes do CI de banco. É a metade de mesa da varredura 15m (catálogo, no banco do CI).
//
// O QUE ELA OLHA
//   1. SQL no DISCO (decisão 7): (a) o corpo VIGENTE de toda função das migrations (a última definição de cada
//      (nome, tipos), menos as que um `drop function` posterior derrubou); (b) o código EXECUTADO (topo e
//      blocos `do`) das migrations de prefixo >= 0200. As anteriores rodaram quando o default existia e são
//      HISTÓRICAS: um INSERT sem a empresa nelas foi correto no dia. Todo `insert into <uma das 20>` tem lista
//      de colunas E a lista tem `empresa_id`.
//   2. TS e scripts (decisão 5): `src/**` e `scripts/**` (fora de teste e do `database.ts`): toda cadeia
//      `.from('<uma das 20>')…insert(|upsert(` tem `empresa_id` no PRIMEIRO argumento (o `onConflict` é o 2º e
//      não conta), ou o argumento é um identificador cuja declaração no mesmo arquivo o tem.
//   3. SQL em TEXTO dentro de `scripts/**`: todo `insert into <uma das 20>` num literal tem `empresa_id` na lista.
//
// A LISTA DAS 20 sai de `k_negocio` em `supabase/tests/catalogo_policies.sql` — a fonte única. Cada universo é
// CONTADO: uma varredura que não achasse nada passaria verde sem olhar.
// =============================================================================

const RAIZ = process.cwd()
const CATALOGO = readFileSync(join(RAIZ, 'supabase', 'tests', 'catalogo_policies.sql'), 'utf8')

function listaDoCatalogo(nome: string): string[] {
  const m = new RegExp(String.raw`${nome} text\[\] := array\[([\s\S]*?)\];`).exec(CATALOGO)
  if (!m) throw new Error(`catalogo_policies.sql: não achei ${nome} — a fonte única das 20`)
  return [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1])
}
const VINTE = listaDoCatalogo('k_negocio')

/** A exceção nominal da PARTE 2 e 3: o catálogo do injetor de mutações sabota corpos de função de propósito. */
const EXCECOES_ESCRITA: readonly { arquivo: string; motivo: string }[] = [
  {
    arquivo: 'scripts/db/mutacoes.mjs',
    motivo: 'é o catálogo do injetor de mutações: sabota corpos de função de propósito, e o SQL dele inclui INSERTs sem empresa para provar que o roteiro pega',
  },
]
const EXCECOES_TS = ['src/lib/types/database.ts']

// -----------------------------------------------------------------------------
// PARTE 1 — SQL
// -----------------------------------------------------------------------------

type InsertSql = { tabela: string; problema: 'sem lista' | 'sem empresa_id' | '' }

const NAO_ALIAS = new Set(['values', 'select', 'default', 'overriding', 'with', 'on', 'returning', 'table'])

/** Onde fecha o `(` que abre em `i` (texto SQL já sem comentário e sem texto entre aspas). */
function fimDoParSql(t: string, i: number): number {
  let prof = 0
  for (let j = i; j < t.length; j++) {
    if (t[j] === '(') prof++
    else if (t[j] === ')' && --prof === 0) return j + 1
  }
  return t.length
}

/** Todo `insert into [only] [public.]<uma das 20> [as alias]` de UM comando, com a conferência da lista. Sem caixa. */
export function insertsNasVinte(cmd: string, tabelas: readonly string[] = VINTE): InsertSql[] {
  const saida: InsertSql[] = []
  const re = /\binsert\s+into\s+(?:only\s+)?(?:public\s*\.\s*)?("?)([a-z_][a-z0-9_]*)\1/gi
  for (const m of cmd.matchAll(re)) {
    const tabela = m[2].toLowerCase()
    if (!tabelas.includes(tabela)) continue
    let resto = cmd.slice(m.index + m[0].length)
    const alias = /^\s+(?:as\s+)?([a-z_][a-z0-9_]*)/i.exec(resto)
    if (alias && (/^\s+as\s/i.test(resto) || !NAO_ALIAS.has(alias[1].toLowerCase()))) resto = resto.slice(alias[0].length)
    const abre = /^\s*\(/.exec(resto)
    if (!abre) {
      saida.push({ tabela, problema: 'sem lista' })
      continue
    }
    const ini = abre[0].length - 1
    const lista = resto.slice(ini, fimDoParSql(resto, ini))
    saida.push({ tabela, problema: /\bempresa_id\b/i.test(lista) ? '' : 'sem empresa_id' })
  }
  return saida
}
const todosInserts = (cmd: string) => insertsNasVinte(cmd)
const violacoesDe = (r: InsertSql[]) => r.filter((x) => x.problema)

/** Os INSERTs das 20 num texto SQL (comentário e texto entre aspas não contam; corpo dollar-quoted é código). */
export function insertsDoSql(sql: string): InsertSql[] {
  return comandosDoTexto(sql).flatMap((c) => todosInserts(c))
}

const DIR = join(RAIZ, 'supabase', 'migrations')
const lerMigration = (a: string) => semComentariosSql(readFileSync(join(DIR, a), 'utf8').replace(/\r\n/g, '\n'))

describe('toda escrita escreve a empresa — SQL no disco (decisão 7)', () => {
  const cadeia = listarMigrations(RAIZ)
  const arquivos = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  // O corpo vigente: a ÚLTIMA definição de cada (nome, tipos) na ordem de aplicação — e nenhuma que um `drop function`
  // POSTERIOR derrubou.
  const vigentes = new Map<string, { arquivo: string; texto: string; nome: string; tipos: string[] }>()
  for (const arquivo of arquivos) {
    for (const d of definicoesDeFuncao(lerMigration(arquivo))) {
      const chave = `${d.esquema}.${d.nome}(${d.tipos.join(',')})`
      if (derrubadaDepois(d.nome, d.tipos, cadeia.indexOf(arquivo), RAIZ)) vigentes.delete(chave)
      else vigentes.set(chave, { arquivo, texto: d.texto, nome: d.nome, tipos: d.tipos })
    }
  }

  const porFuncao = [...vigentes.values()].map((v) => ({ v, achados: insertsDoSql(v.texto) }))
  const totalInserts = porFuncao.reduce((n, f) => n + f.achados.length, 0)

  it('a lista das 20 vem de k_negocio (catalogo_policies.sql) e tem 20', () => {
    expect(VINTE).toHaveLength(20)
    expect(VINTE).toContain('filiais')
  })

  it('o universo NÃO é vazio: os corpos vigentes têm mais de 30 INSERTs nas 20', () => {
    expect(totalInserts, 'a varredura não achou INSERTs nas 20 — ela olhou alguma coisa?').toBeGreaterThan(30)
  })

  it('todo INSERT numa das 20, no corpo vigente de função, tem lista de colunas com empresa_id', () => {
    const violadores = porFuncao.flatMap(({ v, achados }) => {
      const ruins = violacoesDe(achados)
      return ruins.map((x) => `${v.nome}(${v.tipos.join(',')}) (vigente em ${v.arquivo}): insert into ${x.tabela} ${x.problema}`)
    })
    expect(violadores).toEqual([])
  })

  // As migrations >= 0200 (F67C em diante): o código EXECUTADO — topo e `do`. As < 0200 são históricas.
  const executadas = arquivos.filter((a) => Number(/^(\d+)/.exec(a)?.[1] ?? '0') >= 200)
  it('o código executado (topo e `do`) das migrations >= 0200 — as anteriores são históricas (o default existia) — escreve a empresa', () => {
    const violadores = executadas.flatMap((a) => {
      const sql = readFileSync(join(DIR, a), 'utf8').replace(/\r\n/g, '\n')
      return comandosExecutados(sql).flatMap((c: { mascarado: string }) =>
        violacoesDe(todosInserts(c.mascarado)).map((x) => `${a}: insert into ${x.tabela} ${x.problema}`),
      )
    })
    expect(violadores).toEqual([])
  })

  // SABOTAGEM — cada um, sintético, TEM de acusar (ou passar).
  it.each([
    ['sem empresa_id na lista', "insert into public.itens (nome) values ('x')", 'sem empresa_id'],
    ['com empresa_id na lista (par legítimo)', "insert into public.itens (empresa_id, nome) values (p_e, 'x')", ''],
    ['sem lista de colunas', 'insert into public.itens values (1, 2)', 'sem lista'],
    ['em MAIÚSCULAS', "INSERT INTO PUBLIC.ITENS (NOME) VALUES ('x')", 'sem empresa_id'],
    ['sem esquema e com ONLY', 'insert into only itens (nome) values (1)', 'sem empresa_id'],
    ['dentro de CTE, com apelido', 'with a as (update public.ativos set x = 1 returning id), b as (insert into public.anotacoes as anot (ativo_id, texto) select id, 1 from a) select 1', 'sem empresa_id'],
    ['CTE com apelido e a empresa (par legítimo)', 'with b as (insert into public.anotacoes as anot (empresa_id, ativo_id) select 1, 2) select 1', ''],
    ['select no lugar de values, sem lista', 'insert into public.itens select * from x', 'sem lista'],
  ])('SABOTAGEM SQL — %s', (_n, sql, problema) => {
    const r = insertsDoSql(sql)
    expect(r).toHaveLength(1)
    expect(r[0].problema).toBe(problema)
  })

  it.each([
    ['tabela fora das 20 (empresas)', 'insert into public.empresas (id) values (1)'],
    ['comentário', '-- insert into public.itens (nome)\nselect 1'],
    ['comentário de bloco', '/* insert into public.itens (nome) */ select 1'],
    ['texto entre aspas', "select 'insert into public.itens (nome)'"],
  ])('SABOTAGEM SQL — não conta: %s', (_n, sql) => {
    expect(insertsDoSql(sql)).toEqual([])
  })

  it('SABOTAGEM SQL — dois INSERTs num comando acusam cada um', () => {
    const r = insertsDoSql('with a as (insert into public.itens (nome) select 1 returning id) insert into public.ativos (empresa_id) select 1')
    expect(r.map((x) => `${x.tabela}:${x.problema}`)).toEqual(['itens:sem empresa_id', 'ativos:'])
  })
})

// -----------------------------------------------------------------------------
// PARTE 2 — TS e scripts
// -----------------------------------------------------------------------------

const FONTE = /\.(?:[cm]?[jt]s|[jt]sx)$/
const TESTE = /\.test\.(?:[cm]?[jt]s|[jt]sx)$/

function arquivosFonte(dir: string): string[] {
  const saida: string[] = []
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules') continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) saida.push(...arquivosFonte(caminho))
    else if (FONTE.test(nome) && !TESTE.test(nome)) saida.push(caminho)
  }
  return saida
}
const arquivosDoUniverso = () =>
  [...arquivosFonte(join(RAIZ, 'src')), ...arquivosFonte(join(RAIZ, 'scripts'))]
    .map((a) => relative(RAIZ, a).replaceAll('\\', '/'))
    .filter((a) => !EXCECOES_TS.includes(a) && !EXCECOES_ESCRITA.some((e) => e.arquivo === a))

/** Onde termina o `(`/`<` que abre em `i`, atravessando texto e template. */
function fimDoPar(texto: string, i: number): number {
  const abre = texto[i]
  const fecha = abre === '(' ? ')' : '>'
  let prof = 0
  for (let j = i; j < texto.length; j++) {
    const c = texto[j]
    if (c === "'" || c === '"' || c === '`') {
      for (j++; j < texto.length && texto[j] !== c; j++) if (texto[j] === '\\') j++
      continue
    }
    if (c === abre) prof++
    else if (c === fecha && --prof === 0) return j + 1
  }
  return -1
}

type Chamada = { nome: string; abre: number }

/** As chamadas encadeadas a partir de `i` (logo depois do `)` do `.from(…)`): `.x(…)?.y<T>(…)…`. */
function chamadasDaCadeia(texto: string, i: number): Chamada[] {
  const saida: Chamada[] = []
  let fim = i
  for (;;) {
    let j = fim
    while (j < texto.length && /\s/.test(texto[j])) j++
    const ponto = texto.startsWith('?.', j) ? 2 : texto[j] === '.' ? 1 : 0
    if (!ponto) break
    j += ponto
    const nome = /^[A-Za-z_$][\w$]*/.exec(texto.slice(j))
    if (!nome) break
    j += nome[0].length
    while (j < texto.length && /\s/.test(texto[j])) j++
    if (texto[j] === '<') {
      const f = fimDoPar(texto, j)
      if (f < 0) break
      j = f
    }
    if (texto[j] === '(') {
      const f = fimDoPar(texto, j)
      if (f < 0) break
      saida.push({ nome: nome[0], abre: j })
      j = f
    }
    fim = j
  }
  return saida
}

/** O texto do PRIMEIRO argumento da chamada que abre em `abre`: balanceado, até a vírgula de topo ou o `)`. */
function primeiroArgumento(texto: string, abre: number): string {
  let prof = 0
  for (let j = abre + 1; j < texto.length; j++) {
    const c = texto[j]
    if (c === "'" || c === '"' || c === '`') {
      for (j++; j < texto.length && texto[j] !== c; j++) if (texto[j] === '\\') j++
      continue
    }
    if (c === '(' || c === '[' || c === '{') prof++
    else if (c === ')' || c === ']' || c === '}') {
      if (prof === 0) return texto.slice(abre + 1, j)
      prof--
    } else if (c === ',' && prof === 0) return texto.slice(abre + 1, j)
  }
  return texto.slice(abre + 1)
}

/**
 * O inicializador de `const|let|var <id> =` (até o fim do statement), ou `null` se não há declaração. Vale a
 * declaração MAIS PRÓXIMA antes de `antesDe` (a posição da chamada): o mesmo nome em outro escopo, mais acima no
 * arquivo, não responde por este INSERT (`carga.ts` tem duas `const linhas`). Sem declaração antes, a primeira do
 * arquivo (um `let` içado é raro; melhor olhar algo do que nada).
 */
function inicializadorDe(texto: string, id: string, antesDe = texto.length): string | null {
  const re = new RegExp(String.raw`\b(?:const|let|var)\s+${id.replace(/\$/g, '\\$')}\b[^=;]*=(?!=|>)`, 'g')
  let m: RegExpExecArray | null = null
  let primeira: RegExpExecArray | null = null
  for (const x of texto.matchAll(re)) {
    primeira ??= x
    if (x.index < antesDe) m = x
  }
  m ??= primeira
  if (!m) return null
  const ini = m.index + m[0].length
  let prof = 0
  for (let j = ini; j < texto.length; j++) {
    const c = texto[j]
    if (c === "'" || c === '"' || c === '`') {
      for (j++; j < texto.length && texto[j] !== c; j++) if (texto[j] === '\\') j++
      continue
    }
    if (c === '(' || c === '[' || c === '{') prof++
    else if (c === ')' || c === ']' || c === '}') prof--
    else if (prof <= 0 && c === ';') return texto.slice(ini, j)
    else if (prof <= 0 && c === '\n') {
      const antes = texto.slice(ini, j).trimEnd()
      const depois = /^\s*(\S)/.exec(texto.slice(j))?.[1] ?? ''
      const continua = /[=>+\-*/|&?:,]$/.test(antes) || /[.?:+\-*/|&,)\]}]/.test(depois)
      if (!continua) return texto.slice(ini, j)
    }
  }
  return texto.slice(ini)
}

type EscritaTs = { onde: string; tabela: string; metodo: 'insert' | 'upsert'; ok: boolean }

/** As escritas `.from('<t>')…insert|upsert(` de um texto TS/JS; `dinamicas` = `.from(variavel)` com insert/upsert na cadeia. */
export function escritasDoTs(fonte: string, arquivo: string, tabelas: readonly string[] = VINTE): { escritas: EscritaTs[]; dinamicas: EscritaTs[] } {
  const texto = semComentarios(fonte)
  const escritas: EscritaTs[] = []
  const dinamicas: EscritaTs[] = []
  const linha = (i: number) => `${arquivo}:${texto.slice(0, i).split('\n').length}`
  for (const m of texto.matchAll(/\.from\(\s*/g)) {
    const abre = m.index + '.from'.length
    const fecha = fimDoPar(texto, abre)
    if (fecha < 0) continue
    const arg = texto.slice(abre + 1, fecha - 1).trim()
    const literal = /^(['"`])([a-z_0-9]+)\1$/.exec(arg)
    const dinamica = !literal && !/^(Array|Buffer|Object|Uint8Array)$/.test(/([A-Za-z_$][\w$]*)\s*$/.exec(texto.slice(0, m.index))?.[1] ?? '')
    if (literal ? !tabelas.includes(literal[2]) : !dinamica) continue
    for (const c of chamadasDaCadeia(texto, fecha)) {
      if (c.nome !== 'insert' && c.nome !== 'upsert') continue
      const payload = primeiroArgumento(texto, c.abre)
      let ok = /\bempresa_id\b/.test(payload)
      const id = /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(payload)?.[1]
      if (!ok && id) ok = /\bempresa_id\b/.test(inicializadorDe(texto, id, c.abre) ?? '')
      const item: EscritaTs = { onde: linha(m.index), tabela: literal ? literal[2] : arg, metodo: c.nome, ok }
      ;(literal ? escritas : dinamicas).push(item)
    }
  }
  return { escritas, dinamicas }
}
const descreve = (e: EscritaTs) => `${e.onde} (${e.tabela}, ${e.metodo})`

describe('toda escrita escreve a empresa — TS e scripts (decisão 5)', () => {
  const arquivos = arquivosDoUniverso()
  const todas = arquivos.map((a) => escritasDoTs(readFileSync(join(RAIZ, a), 'utf8'), a))
  const escritas = todas.flatMap((t) => t.escritas)
  const dinamicas = todas.flatMap((t) => t.dinamicas)

  // F68 (19/11/2026): 33 -> 32. O `insert` em `senhas_acesso` de `criarSenhaAcesso` (actions/senhas.ts) SAIU: a senha
  // nasce pela função do banco `senha_acesso_criar(p_empresa, …)` (0211), que grava a empresa informada — a escrita
  // continua dizendo a empresa, só que no SQL (a 15m de catalogo_policies.sql a confere lá).
  it('o universo NÃO é vazio: pelo menos 32 chamadas insert/upsert nas 20 (16 em src, 16 em scripts)', () => {
    expect(escritas.length, 'a varredura não achou as escritas das 20 em src/** e scripts/**').toBeGreaterThanOrEqual(32)
  })

  it('nenhuma escrita é de tabela DINÂMICA (`.from(variavel).insert(…)`): não dá para provar a tabela', () => {
    expect(dinamicas.map(descreve)).toEqual([])
  })

  it('toda chamada `.from(<das 20>)…insert|upsert(` tem empresa_id no 1º argumento (ou na declaração do identificador)', () => {
    expect(escritas.filter((e) => !e.ok).map(descreve)).toEqual([])
  })

  it('a exceção nominal existe, tem motivo escrito e é o catálogo do injetor', () => {
    for (const e of EXCECOES_ESCRITA) {
      expect(() => statSync(join(RAIZ, e.arquivo)), `${e.arquivo} sumiu — a lista guarda fantasma`).not.toThrow()
      expect(e.motivo.length, `${e.arquivo} sem motivo`).toBeGreaterThan(20)
      expect(readFileSync(join(RAIZ, e.arquivo), 'utf8').length).toBeGreaterThan(1000)
    }
    expect(EXCECOES_ESCRITA.map((e) => e.arquivo)).toEqual(['scripts/db/mutacoes.mjs'])
    // e ela é USADA como exclusão: o universo varrido não contém o arquivo, mas contém os irmãos de scripts/db
    expect(arquivos).not.toContain('scripts/db/mutacoes.mjs')
    expect(arquivos.some((a) => a.startsWith('scripts/db/'))).toBe(true)
  })

  it('o universo de arquivos é todo fonte JS/TS — `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs` também, teste fora', () => {
    for (const n of ['a.ts', 'a.tsx', 'a.mts', 'a.cts', 'a.js', 'a.jsx', 'a.mjs', 'a.cjs']) expect(FONTE.test(n) && !TESTE.test(n), n).toBe(true)
    for (const n of ['a.test.ts', 'a.dom.test.tsx', 'a.css', 'a.json']) expect(FONTE.test(n) && !TESTE.test(n), n).toBe(false)
  })

  const acusa = (fonte: string) => {
    const r = escritasDoTs(fonte, 's.ts')
    return [...r.escritas, ...r.dinamicas].filter((e) => !e.ok).length
  }
  const todasOk = (fonte: string) => {
    const r = escritasDoTs(fonte, 's.ts')
    return r.escritas.length > 0 && r.escritas.every((e) => e.ok)
  }

  it.each([
    ['insert sem a empresa', "await c.from('itens').insert({ nome })"],
    ['upsert sem a empresa', "await c.from('colaboradores').upsert({ nome })"],
    ['insert em várias linhas', "await c\n  .from('itens')\n  .insert({\n    nome,\n  })\n  .select('id')"],
    ['identificador sem a empresa no map', "const linhas = xs.map((x) => ({ a: x }))\nawait c.from('itens').insert(linhas)"],
    ['identificador sem declaração no arquivo', "await c.from('itens').insert(linhas)"],
    ['empresa_id SÓ no onConflict (2º argumento)', "await c.from('colaboradores').upsert(rows.map((r) => ({ nome: r.n })), { onConflict: 'empresa_id,nome_chave' })"],
    ['tabela em aspas duplas', 'await c.from("ativos").insert({ patrimonio })'],
    ['tabela em crase literal', 'await c.from(`ativos`).insert({ patrimonio })'],
    ['tabela dinâmica', 'await c.from(tabela).insert({ a: 1 })'],
  ])('SABOTAGEM TS — acusa: %s', (_n, fonte) => {
    expect(acusa(fonte)).toBeGreaterThan(0)
  })

  it.each([
    ['empresa_id no literal', "await c.from('itens').insert({ nome, empresa_id: e })"],
    ['spread com empresa_id', "await c.from('itens').insert({ ...dados, empresa_id: e })"],
    ['array com empresa_id', "await c.from('itens').insert([{ nome, empresa_id: e }])"],
    ['identificador com empresa_id no map', "const linhas = xs.map((x) => ({ a: x, empresa_id: e }))\nawait c.from('itens').insert(linhas)"],
    ['identificador com tipo e várias linhas', "const linhas: Linha[] = xs\n  .filter(Boolean)\n  .map((x) => ({ a: x, empresa_id: e }))\nawait c.from('itens').insert(linhas)"],
    ['upsert com empresa_id no payload e no onConflict', "await c.from('colaboradores').upsert(rows.map((r) => ({ nome: r.n, empresa_id: e })), { onConflict: 'empresa_id,nome_chave' })"],
  ])('SABOTAGEM TS — passa: %s', (_n, fonte) => {
    expect(todasOk(fonte)).toBe(true)
  })

  it.each([
    ['tabela fora das 20 (membros)', "await c.from('membros').insert({ profile_id })"],
    ['leitura (select) das 20', "await c.from('itens').select('id')"],
    ['comentário', "// c.from('itens').insert({ nome })\nconst x = 1"],
    ['Array.from', 'const a = Array.from(xs).insert(1)'],
  ])('SABOTAGEM TS — ignora: %s', (_n, fonte) => {
    expect(acusa(fonte)).toBe(0)
    const r = escritasDoTs(fonte, 's.ts')
    expect(r.escritas.length + r.dinamicas.length).toBe(0)
  })
})

// -----------------------------------------------------------------------------
// PARTE 3 — SQL em TEXTO dentro de scripts/**
// -----------------------------------------------------------------------------

/** Todo `insert into [public.]<das 20>` num fonte JS/TS (literal de string/template); o problema, se houver. */
export function insertsEmTexto(fonte: string, arquivo: string, tabelas: readonly string[] = VINTE): { onde: string; tabela: string; problema: string }[] {
  const texto = semComentarios(fonte)
  const saida: { onde: string; tabela: string; problema: string }[] = []
  for (const m of texto.matchAll(/\binsert\s+into\s+(?:only\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*(\()?/gi)) {
    const tabela = m[1].toLowerCase()
    if (!tabelas.includes(tabela)) continue
    const onde = `${arquivo}:${texto.slice(0, m.index).split('\n').length}`
    if (!m[2]) {
      saida.push({ onde, tabela, problema: 'sem lista' })
      continue
    }
    const abre = m.index + m[0].length - 1
    const lista = texto.slice(abre, abre + (fimDoParSql(texto.slice(abre), 0)))
    if (!/\bempresa_id\b/i.test(lista)) saida.push({ onde, tabela, problema: 'sem empresa_id' })
  }
  return saida
}
const contaInsertsEmTexto = (fonte: string) => [...fonte.matchAll(/\binsert\s+into\s+(?:only\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)/gi)].filter((m) => VINTE.includes(m[1].toLowerCase())).length

describe('toda escrita escreve a empresa — SQL em texto dentro de scripts/** (decisão 5)', () => {
  const arquivos = arquivosDoUniverso().filter((a) => a.startsWith('scripts/'))
  const fontes = arquivos.map((a) => ({ a, f: readFileSync(join(RAIZ, a), 'utf8') }))
  const universo = fontes.reduce((n, { f }) => n + contaInsertsEmTexto(semComentarios(f)), 0)

  it('o universo: há `insert into <das 20>` em texto de scripts/** (se um dia for 0, esta mensagem diz — a varredura não passa muda)', () => {
    expect(universo, 'NENHUM `insert into <das 20>` em texto de scripts/** — o universo secou; se foi corrigido por decisão, tire/ajuste esta guarda explicitamente').toBeGreaterThan(0)
  })

  it('todo `insert into <das 20>` em texto de script tem empresa_id na lista de colunas', () => {
    const violadores = fontes.flatMap(({ a, f }) => insertsEmTexto(f, a).map((x) => `${x.onde} (${x.tabela}, ${x.problema})`))
    expect(violadores).toEqual([])
  })

  it.each([
    ['sem empresa_id', "const q = `insert into public.itens (nome, grupo) values ('x', 1)`", 1],
    ['sem lista', "const q = 'insert into itens values (1)'", 1],
    ['lista multilinha com a empresa (legítimo)', "const q = `insert into public.itens (\n  empresa_id, nome\n) values (1, 2)`", 0],
    ['tabela fora das 20', "const q = 'insert into public.membros (profile_id) values (1)'", 0],
    ['comentário', "// insert into public.itens (nome)\nconst x = 1", 0],
  ])('SABOTAGEM texto — %s', (_n, fonte, esperado) => {
    expect(insertsEmTexto(fonte, 's.mjs')).toHaveLength(esperado)
  })
})
