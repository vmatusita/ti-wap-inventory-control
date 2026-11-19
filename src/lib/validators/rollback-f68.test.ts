import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { definicoesDeFuncao } from '../../../scripts/db/corpo-vigente.mjs'

// O ROLLBACK DA F68 É COMPLETO E SÓ CATÁLOGO (F68 · Frente E · sabotagem K, a metade de mesa).
//
// `supabase/rollback/F68-desfaz.sql` desfaz as migrations 0208–0212 na ordem INVERSA: derruba toda função que elas
// criam, as duas tabelas e a unique da 0208. Esta trava confere no DISCO que nada ficou de fora (uma função nova numa
// 0213 da fase sem o drop correspondente reprova), que a ordem é a inversa, que o arquivo é idempotente (`if exists`) e
// que ele não toca dado (nenhum update/delete/insert/truncate/cascade). A metade de BANCO é `supabase/tests/f68_rollback.sql`
// (a impressão de antes sem a F68 = a de depois; idempotência; reaplicação byte a byte), no CI.

const RAIZ = process.cwd()
const PASTA = join(RAIZ, 'supabase', 'migrations')
const DESFAZ = readFileSync(join(RAIZ, 'supabase', 'rollback', 'F68-desfaz.sql'), 'utf8').replace(/\r\n/g, '\n')
const CODIGO = DESFAZ.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')
const DA_F68 = readdirSync(PASTA)
  .filter((f) => f.endsWith('.sql') && f >= '0208' && f < '0213')
  .sort()
  .map((arquivo) => ({ arquivo, sql: readFileSync(join(PASTA, arquivo), 'utf8').replace(/\r\n/g, '\n') }))

const semComentario = (s: string) => s.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')

describe('o rollback da F68 (supabase/rollback/F68-desfaz.sql) é COMPLETO contra as migrations', () => {
  it('a fase são as cinco migrations 0208–0212', () => {
    expect(DA_F68.map((m) => m.arquivo.slice(0, 4))).toEqual(['0208', '0209', '0210', '0211', '0212'])
  })

  it('toda função que a fase cria tem o drop dela, com a assinatura exata e if exists', () => {
    const criadas = DA_F68.flatMap((m) => definicoesDeFuncao(m.sql)).map((d) => `${d.nome}(${d.tipos.join(', ')})`)
    expect(criadas.sort()).toEqual([
      'relatorio_publico_abrir(text, text, text)',
      'relatorio_publico_dados(text, text, text, jsonb)',
      'relatorio_publico_projetar(jsonb, jsonb)',
      'senha_acesso_conferir(uuid, uuid, text)',
      'senha_acesso_criar(uuid, text, text)',
      'senha_acesso_definir_status(uuid, uuid, boolean)',
    ])
    for (const f of criadas) expect(CODIGO, f).toContain(`drop function if exists public.${f};`)
  })

  it('toda tabela que a fase cria tem o drop dela, e a unique da 0208 sai', () => {
    const tabelas = DA_F68.flatMap((m) => [...semComentario(m.sql).matchAll(/create table public\.(\w+)/g)].map((x) => x[1]))
    expect(tabelas.sort()).toEqual(['porta_tentativas', 'sessoes_visualizador'])
    for (const t of tabelas) expect(CODIGO, t).toContain(`drop table if exists public.${t};`)
    expect(CODIGO).toContain('alter table public.senhas_acesso drop constraint if exists senhas_acesso_empresa_id_uidx;')
    // nenhuma outra coisa é derrubada nem alterada
    expect(CODIGO.match(/^(drop|alter) /gm)).toHaveLength(6 + 2 + 1)
  })

  it('a ordem é a INVERSA do apply (0212 → 0208): as portas, a gestão, o contador, a sessão, a unique', () => {
    const pos = (s: string) => CODIGO.indexOf(s)
    expect(pos('relatorio_publico_dados(')).toBeLessThan(pos('senha_acesso_definir_status('))
    expect(pos('senha_acesso_criar(')).toBeLessThan(pos('public.porta_tentativas;'))
    expect(pos('public.porta_tentativas;')).toBeLessThan(pos('public.sessoes_visualizador;'))
    expect(pos('public.sessoes_visualizador;')).toBeLessThan(pos('senhas_acesso_empresa_id_uidx'))
  })

  it('só catálogo do que a fase criou: nada de update/delete/insert/truncate/cascade/begin/commit; lock_timeout por set/reset', () => {
    expect(CODIGO).not.toMatch(/\b(update|delete|insert|truncate|cascade|commit|rollback)\b/i)
    expect(CODIGO).not.toMatch(/^\s*begin\s*;/im)
    expect(CODIGO.match(/^set lock_timeout = '2s';/gm)).toHaveLength(1)
    expect(CODIGO.match(/^reset lock_timeout;/gm)).toHaveLength(1)
    // cada migration da fase escreve no rodapé a sua parte da ordem de rollback
    for (const m of DA_F68) expect(m.sql, m.arquivo).toMatch(/-- ROLLBACK \(supabase\/rollback\/F68-desfaz\.sql/)
  })

  it('o cabeçalho escreve a ORDEM entre app e banco: o revert do PR de código e o deploy ANTES deste arquivo', () => {
    expect(DESFAZ).toMatch(/PRIMEIRO o revert do PR de código da F68 e o deploy/)
    expect(DESFAZ).toMatch(/DEPOIS este arquivo/)
  })
})

describe('os roteiros de rollback das fases anteriores rodam o da F68 primeiro (a cadeia inteira tem a F68 por cima)', () => {
  const inclusoes = (fase: string) => {
    const sql = readFileSync(join(RAIZ, 'supabase', 'tests', `${fase}_rollback.sql`), 'utf8').replace(/\r\n/g, '\n')
    return [...sql.matchAll(/^\\ir \.\.\/rollback\/(F\d\d[^\s]*)\.sql$/gm)].map((m) => m[1])
  }

  it.each(['f62', 'f63', 'f64', 'f65', 'f66', 'f67', 'f67b', 'f67c'])('%s_rollback.sql: todo F67C-desfaz é IMEDIATAMENTE precedido do F68-desfaz', (fase) => {
    const inclui = inclusoes(fase)
    const c = inclui.map((x, i) => (x === 'F67C-desfaz' ? i : -1)).filter((i) => i >= 0)
    expect(c.length, `${fase}: não roda o F67C-desfaz`).toBeGreaterThan(0)
    // o f67c_rollback roda o F67C três vezes; só o PRIMEIRO precisa da F68 antes (depois dele a F68 já saiu)
    expect(inclui[c[0]! - 1], `${fase}: o F68-desfaz não precede o primeiro F67C-desfaz`).toBe('F68-desfaz')
    expect(inclui.indexOf('F68-desfaz'), `${fase}: o F68-desfaz não é o primeiro rollback do roteiro`).toBe(0)
  })

  it('f62: o SEGUNDO caminho (que começa no F67B-desfaz) também tira a F68 antes', () => {
    const inclui = inclusoes('f62')
    const b = inclui.map((x, i) => (x === 'F67B-desfaz' ? i : -1)).filter((i) => i >= 0)
    expect(b).toHaveLength(2)
    expect(inclui[b[1]! - 1]).toBe('F68-desfaz')
  })

  it('f66b: a F68 sai antes da medição dos CHECK de public', () => {
    const sql = readFileSync(join(RAIZ, 'supabase', 'tests', 'f66b_rollback.sql'), 'utf8')
    expect(sql.indexOf('\\ir ../rollback/F68-desfaz.sql')).toBeGreaterThan(-1)
    expect(sql.indexOf('\\ir ../rollback/F68-desfaz.sql')).toBeLessThan(sql.indexOf('select pg_temp.f66b_impressao_checks() as checks_antes'))
  })

  it('o ensaio f68_rollback.sql roda o arquivo duas vezes, reaplica as cinco e emite UMA linha FIM com rb0–rb6', () => {
    const sql = readFileSync(join(RAIZ, 'supabase', 'tests', 'f68_rollback.sql'), 'utf8').replace(/\r\n/g, '\n')
    expect(sql.match(/^\\ir \.\.\/rollback\/F68-desfaz\.sql$/gm)).toHaveLength(2)
    for (const m of DA_F68) expect(sql).toContain(`\\ir ../migrations/${m.arquivo}\n`)
    expect(sql.split('\n').filter((l) => l.includes("'FIM f68_rollback:")).length).toBe(1)
    for (const r of ['rb0', 'rb1', 'rb2', 'rb3', 'rb4', 'rb5', 'rb6']) expect(sql).toMatch(new RegExp(String.raw`assert_zero_de\('${r} `))
    expect(sql).toMatch(/^begin;$/m)
    expect(sql).toMatch(/^rollback;$/m)
  })
})
