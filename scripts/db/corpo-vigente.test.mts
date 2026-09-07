import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  corpoVigente,
  definicoesDeFuncao,
  fimDoComando,
  listarMigrations,
  tipoDoArgumento,
  trocarNoCorpo,
} from './corpo-vigente.mjs'

// A TRAVA DE `corpoVigente` — F47.
//
// Ela roda SEM BANCO, de propósito: a mesa do Johnny não tem Postgres (provado no
// `docs/RELATORIO-F46.md` §2.1) e, sem esta trava, um erro no resolvedor só apareceria
// num run do CI. O catálogo de mutações se apoia inteiro neste módulo — se ele devolver
// o corpo ERRADO (uma versão antiga da função), a mutação reescreveria a função para uma
// forma que não é a vigente e o injetor mediria um banco que não existe.

const RAIZ = process.cwd()

describe('1. fimDoComando — o `;` que fecha, não o primeiro que aparece', () => {
  it('acha o `;` simples', () => {
    expect(fimDoComando('select 1; select 2;', 0)).toBe(9)
  })

  it('IGNORA o `;` de dentro de um bloco `$$`', () => {
    const sql = "create function f() returns int language plpgsql as $$ begin return 1; end; $$;"
    // O `;` que fecha é o último do texto, não o do `return 1;`.
    expect(fimDoComando(sql, 0)).toBe(sql.length)
  })

  it('IGNORA o `;` de dentro de um bloco `$fn$` (a tag usada em `_asserts.sql`)', () => {
    const sql = "create function f() as $fn$ begin raise notice 'a;b'; end; $fn$;"
    expect(fimDoComando(sql, 0)).toBe(sql.length)
  })

  it('IGNORA o `;` de dentro de literal e de comentário de linha', () => {
    expect(fimDoComando("select 'a;b';", 0)).toBe(13)
    expect(fimDoComando('select 1 -- a;b\n;', 0)).toBe(17)
  })

  it("trata `''` como escape dentro do literal", () => {
    const sql = "select 'não é o fim '';'' ainda';"
    expect(fimDoComando(sql, 0)).toBe(sql.length)
  })

  it('devolve -1 quando o comando não fecha', () => {
    expect(fimDoComando('create function f() as $$ begin', 0)).toBe(-1)
  })
})

describe('2. tipoDoArgumento — o tipo, sem o nome, sem o modo, sem o default', () => {
  it.each([
    ['fid smallint', 'smallint'],
    ['smallint', 'smallint'],
    ['in p_ativos uuid[]', 'uuid[]'],
    ["p_dados jsonb default '{}'::jsonb", 'jsonb'],
    ['p_nome text', 'text'],
    ['variadic p_x int[]', 'int[]'],
    ['p_quando timestamp with time zone', 'timestamp with time zone'],
  ])('`%s` → `%s`', (entrada, esperado) => {
    expect(tipoDoArgumento(entrada)).toBe(esperado)
  })
})

describe('3. definicoesDeFuncao — lê o SQL de verdade', () => {
  it('separa duas funções no mesmo arquivo, com o corpo inteiro de cada uma', () => {
    const sql = [
      'create or replace function public.a() returns int language sql as $$ select 1; $$;',
      '',
      'create function public.b(x smallint) returns boolean language plpgsql as $b$',
      'begin return x > 0; end;',
      '$b$;',
    ].join('\n')
    const d = definicoesDeFuncao(sql)
    expect(d.map((f) => f.nome)).toEqual(['a', 'b'])
    expect(d[0].tipos).toEqual([])
    expect(d[1].tipos).toEqual(['smallint'])
    expect(d[1].texto).toContain('return x > 0')
    expect(d[1].texto.endsWith('$b$;')).toBe(true)
    // O corpo de `a` NÃO pode ter engolido o de `b`.
    expect(d[0].texto).not.toContain('function public.b')
  })

  it('assume `public` quando o esquema não vem escrito', () => {
    expect(definicoesDeFuncao('create function f() returns int as $$ select 1 $$;')[0].esquema).toBe(
      'public',
    )
  })
})

describe('4. corpoVigente contra as migrations REAIS do repositório', () => {
  const migrations = listarMigrations(RAIZ)

  it('há migrations para resolver (guarda do próprio teste)', () => {
    expect(migrations.length).toBeGreaterThan(100)
  })

  // As funções que o catálogo de mutações realmente reescreve. Se uma delas parar de
  // resolver, a mutação correspondente morre — e é melhor descobrir aqui.
  const ALVOS = [
    'public.papel_atual()',
    'public.e_admin()',
    'public.e_dev()',
    'public.pode_escrever()',
    'public.pode_escrever_filial(smallint)',
    'public.exigir_dev_para_destruir(text)',
    'public.guarda_acervo()',
  ]

  it.each(ALVOS)('resolve `%s`', (assinatura) => {
    const { sql, arquivo } = corpoVigente(assinatura, RAIZ)
    expect(arquivo).toMatch(/^\d{4}_.*\.sql$/)
    expect(sql.toLowerCase()).toContain('function')
    expect(sql.trimEnd().endsWith(';')).toBe(true)
  })

  it('devolve a definição MAIS NOVA, não a primeira', () => {
    // `pode_escrever_filial` nasceu na 0064 e foi reescrita pela 0072 (o cargo `dev`).
    // Resolver para a 0064 significaria reescrever a função SEM o `dev` — uma mutação
    // acidental, aplicada por engano em cima do banco.
    const { arquivo, sql } = corpoVigente('public.pode_escrever_filial(smallint)', RAIZ)
    const criadoras = migrations.filter((m) =>
      /create\s+or\s+replace\s+function\s+public\.pode_escrever_filial/i.test(
        readFileSync(join(RAIZ, 'supabase', 'migrations', m), 'utf8'),
      ),
    )
    expect(criadoras.length, 'a função deveria ter mais de uma versão na cadeia').toBeGreaterThan(1)
    expect(arquivo).toBe(criadoras[criadoras.length - 1])
    expect(sql).toContain("'dev'")
  })

  it('o corpo devolvido é UMA função só — não engoliu a seguinte', () => {
    const { sql } = corpoVigente('public.e_admin()', RAIZ)
    expect(definicoesDeFuncao(sql)).toHaveLength(1)
  })

  it('função inexistente reprova ALTO, com o nome na mensagem', () => {
    expect(() => corpoVigente('public.nao_existe_mesmo()', RAIZ)).toThrow(/nao_existe_mesmo/)
  })

  it('sobrecarga que não bate reprova, listando as que existem', () => {
    expect(() => corpoVigente('public.pode_escrever_filial(text, text, text)', RAIZ)).toThrow(
      /sobrecarga/,
    )
  })
})

describe('5. trocarNoCorpo — a guarda contra a mutação que não muda nada', () => {
  const corpo = 'begin\n  return public.pode_escrever_filial(fid);\nend'

  it('troca quando o trecho existe exatamente uma vez', () => {
    expect(trocarNoCorpo(corpo, 'pode_escrever_filial(fid)', 'pode_escrever()')).toContain(
      'return public.pode_escrever();',
    )
  })

  it('REPROVA quando o trecho sumiu (a migration mudou)', () => {
    expect(() => trocarNoCorpo(corpo, 'trecho_que_nao_existe', 'x', 'mut-x')).toThrow(
      /no-op silencioso/,
    )
  })

  it('REPROVA quando o trecho é ambíguo', () => {
    expect(() => trocarNoCorpo('a a', 'a', 'b', 'mut-y')).toThrow(/2 vezes/)
  })

  it('REPROVA quando `de` e `para` são iguais', () => {
    expect(() => trocarNoCorpo(corpo, 'end', 'end', 'mut-z')).toThrow(/não muda nada/)
  })

  it('a mensagem nomeia a mutação, para o erro ser acionável', () => {
    expect(() => trocarNoCorpo(corpo, 'zzz', 'x', 'rls-escopo')).toThrow(/rls-escopo/)
  })
})
