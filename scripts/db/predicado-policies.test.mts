import { describe, expect, it } from 'vitest'
import {
  analisarPredicado,
  lerExcecoesDoCatalogo,
  lerUniversoDoCatalogo,
  lexar,
  replayPolicies,
} from './predicado-policies.mjs'

// O MÓDULO DA DOUTRINA DO PREDICADO — F59.
//
// Estes são os testes de UNIDADE do analisador: léxico, replay e as três regras, cada
// um com SQL sintético EM MEMÓRIA (nunca arquivo em `supabase/migrations/`). A trava
// que julga as migrations de verdade é `src/lib/validators/policies-initplan.test.ts`;
// ela confia neste módulo, e é por isso que ele prova aqui, caso a caso, que sabe
// REPROVAR — um casador quebrado deixaria a trava verde por vazio.

const mig = (sql: string, arquivo = '9999_sintetica.sql') => ({ arquivo, sql })

const r1 = (t: string) => analisarPredicado(t).linha.map((o) => `${o.funcao}(${o.argumento})${o.dentroDeSelect ? '*' : ''}`)
const r2 = (t: string) => analisarPredicado(t).semLinha.map((o) => o.funcao)
const r3 = (t: string) => analisarPredicado(t).subselects

describe('1. léxico — comentário não é código, literal não é comando', () => {
  it('comentário de linha e de bloco (aninhado) somem dos tokens', () => {
    const { tokens, comentarios } = lexar("select 1 -- create policy x\n/* a /* b */ c */ select 2")
    expect(tokens.map((t) => t.v)).toEqual(['select', '1', 'select', '2'])
    expect(comentarios).toHaveLength(2)
  })

  it('literal com aspa dobrada, E-string com escape, identificador com aspas e $tag$', () => {
    const { tokens } = lexar(`'a''b' E'c\\'d' "Nome ""X""" $f$ corpo; $f$`)
    expect(tokens.map((t) => [t.tipo, t.v])).toEqual([
      ['str', "a'b"],
      ['str', "c'd"],
      ['qident', 'Nome "X"'],
      ['dollar', ' corpo; '],
    ])
  })

  it('literal que não fecha LANÇA (não vira texto solto)', () => {
    expect(() => lexar("select 'aberto")).toThrow(/não fecha/)
  })
})

describe('2. replay — na ORDEM do texto, com drop, rename e as formas de alter', () => {
  it('create, alter using, alter rename e drop', () => {
    const r = replayPolicies([
      mig(`create policy "p" on public.t for select to authenticated using ((select public.papel_atual()) is not null);
           alter policy "p" on public.t using (true);
           alter policy "p" on public.t rename to "q";`),
      mig(`create policy r on t for insert with check (x = 1); drop policy if exists "nada" on public.t; drop policy r on public.t;`),
    ])
    expect(r.falhas).toEqual([])
    expect([...r.vivas.keys()]).toEqual(['public.t / q'])
    expect(r.vivas.get('public.t / q')).toMatchObject({ verbo: 'SELECT', using: 'true', withCheck: null })
    expect(r.consumidos).toBe(6)
    expect(r.noTexto).toBe(6)
  })

  it('drop table derruba as policies da tabela; rename e set schema as movem', () => {
    const r = replayPolicies([
      mig(`create policy a on public.t1 using (x = 1); create policy b on public.t2 using (x = 1);
           create policy c on public.t3 using (x = 1);
           drop table if exists public.t1, public.outra cascade;
           alter table public.t2 rename to t2novo;
           alter table if exists public.t3 set schema arquivo;`),
    ])
    expect(r.falhas).toEqual([])
    expect([...r.vivas.keys()].sort()).toEqual(['arquivo.t3 / c', 'public.t2novo / b'])
  })

  it('drop e create do MESMO nome no mesmo arquivo: vale a ordem do texto (o caso da 0091)', () => {
    const r = replayPolicies([
      mig(`create policy p on t using (a = 1);`),
      mig(`drop policy p on t; create policy p on t using (b = 2);`),
    ])
    expect(r.vivas.get('public.t / p')?.using).toBe('b = 2')
  })

  it('storage.objects com schema explícito', () => {
    const r = replayPolicies([mig(`create policy "termos leitura" on storage.objects for select using (bucket_id = 'termos');`)])
    expect([...r.vivas.keys()]).toEqual(['storage.objects / termos leitura'])
  })

  it('"comment on policy" e "grant execute" perto de create policy NÃO são DDL de policy (defeito do instrumento do censo)', () => {
    const r = replayPolicies([
      mig(`create policy p on t using (a = 1);
           comment on policy p on t is 'a policy';
           grant execute on function public.f() to authenticated;
           create trigger g after insert on t for each row execute function public.h();`),
    ])
    expect(r.falhas).toEqual([])
    expect(r.consumidos).toBe(1)
    expect(r.noTexto).toBe(1)
  })

  it('FALHA FECHADA — DDL de policy dentro de execute format(…) reprova com arquivo e linha', () => {
    const r = replayPolicies([
      mig(`create policy p on t using (a = 1);\ndo $$ begin\n  execute format('alter policy %I on %I.%I using (%s)', 'p', 'public', 't', 'true');\nend $$;`, '0200_laco.sql'),
    ])
    // A falha do DDL dinâmico, com arquivo e linha. Desde a revisão adversarial o mesmo
    // comando também reprova pela FORMA do execute (%s no formato) — mais de uma falha.
    expect(r.falhas.find((f) => /dinamicamente/.test(f.motivo))).toMatchObject({ arquivo: '0200_laco.sql', linha: 3 })
    expect(r.falhas.every((f) => f.arquivo === '0200_laco.sql')).toBe(true)
  })

  it.each([
    ['o verbo parametrizado', "do $$ declare v_verbo text := 'alter'; begin execute format('%s policy %I on %I.%I using (%s)', v_verbo, 'p', 'public', 't', 'true'); end $$;"],
    ['a palavra partida entre literais', "do $$ begin execute 'alter pol' || 'icy \"p\" on public.t using (true)'; end $$;"],
    ['o execute de uma variável', "do $$ declare v text := 'select 1'; begin execute v; end $$;"],
    ['a concatenação depois do literal', "do $$ begin execute 'alter table ' || quote_ident('t') || ' enable row level security'; end $$;"],
    ['o %s no formato', "do $$ begin execute format('create index %s on t (x)', 'i'); end $$;"],
  ])('FALHA FECHADA — execute dinâmico que a trava não lê reprova: %s (revisão adversarial da F59)', (_nome, sql) => {
    const r = replayPolicies([mig(sql, '0201_laco.sql')])
    expect(r.falhas.length).toBeGreaterThan(0)
    expect(r.falhas[0]).toMatchObject({ arquivo: '0201_laco.sql', linha: 1 })
  })

  it('execute inofensivo continua passando: format com %I/%L (o da 0124), literal puro, trigger e raise que cita "policy"', () => {
    for (const sql of [
      "do $$ begin execute format('alter database %I set timezone = %L', current_database(), 'America/Sao_Paulo'); end $$;",
      "do $$ begin execute 'select 1'; end $$;",
      'create function f() returns trigger language plpgsql as $$ begin return new; end $$; create trigger g after insert on t for each row execute function f();',
      "create function f() returns void language plpgsql as $$ begin raise exception 'recusado pela policy'; end $$;",
    ]) {
      expect(replayPolicies([mig(sql)]).falhas, sql).toEqual([])
    }
  })

  it('FALHA FECHADA — create policy dentro de corpo $$ (sem literal) também reprova', () => {
    const r = replayPolicies([mig(`do $$ begin create policy p on t using (a = 1); end $$;`)])
    expect(r.falhas.map((f) => f.motivo).join()).toMatch(/corpo \$…\$/)
    expect(r.vivas.size).toBe(0)
  })

  it('FALHA FECHADA — comando de policy ilegível reprova em vez de ser pulado', () => {
    const r = replayPolicies([mig(`create policy p on t using a = 1;`)])
    expect(r.falhas.map((f) => f.motivo).join()).toMatch(/ilegível/)
  })

  it('FALHA FECHADA — alter/drop de policy que o replay não conhece reprova', () => {
    const r = replayPolicies([mig(`alter policy fantasma on t using (a = 1); drop policy outra on t;`)])
    expect(r.falhas.map((f) => f.motivo)).toEqual([
      expect.stringMatching(/não conhece/),
      expect.stringMatching(/não conhece/),
    ])
  })

  it('comentário com "create policy" não conta (a lição da F53)', () => {
    const r = replayPolicies([mig(`-- create policy velha on t using (x);\n/* drop policy x on t; */ select 1;`)])
    expect(r.noTexto).toBe(0)
    expect(r.falhas).toEqual([])
  })
})

describe('3. R1 — função não recebe dado da linha', () => {
  it('reprova coluna nua, qualificada, expressão e o falso içamento', () => {
    expect(r1('public.e_membro(empresa_id)')).toEqual(['e_membro(empresa_id)'])
    expect(r1('(select public.e_membro(empresa_id))')).toEqual(['e_membro(empresa_id)*'])
    expect(r1("public.f((t.col ->> 'x')::smallint)")).toEqual(["f((t.col ->> 'x')::smallint)"])
    expect(r1('public.pode_ler_arquivo_termo(objects.name)')).toEqual(['pode_ler_arquivo_termo(objects.name)'])
  })

  it('built-in é função: array_length dentro de coalesce', () => {
    expect(r1('coalesce(array_length(ativo_ids, 1), 0) > 0')).toEqual(['array_length(ativo_ids, 1)'])
  })

  it('função aninhada: as duas recebem a linha', () => {
    expect(r1('public.f(lower(nome))').sort()).toEqual(['f(lower(nome))', 'lower(nome)'])
  })

  it('unnest(coluna) num FROM de sub-select é R1', () => {
    // `*` = dentro de sub-select: correlacionado, por linha, do mesmo jeito
    expect(r1('id = any (array (select x from unnest(ativo_ids) x))')).toEqual(['unnest(ativo_ids)*'])
  })

  it('passa: a forma içada, auth.uid() comparado, literal, operador sobre coluna', () => {
    for (const ok of [
      'empresa_id = any (array (select public.empresas_do_membro()))',
      'id = (select auth.uid())',
      "bucket_id = 'termos'",
      "(snapshot_anterior ->> 'filial_id')::smallint = any (array (select public.f()))",
      'coalesce(status, 0) > 0',
    ]) {
      expect(r1(ok), ok).toEqual([])
    }
  })
})

describe('4. R2 — função sem dado da linha só dentro de (select …)', () => {
  it('reprova solta, = any (fn()) sem array (select …), constante solta e current_user', () => {
    expect(r2('public.e_admin()')).toEqual(['e_admin'])
    expect(r2('empresa_id = any (public.empresas_do_membro())')).toEqual(['empresas_do_membro'])
    expect(r2("public.tem_papel('admin')")).toEqual(['tem_papel'])
    expect(r2('dono = current_user')).toEqual(['current_user'])
  })

  it('"and (select …)" NÃO é a função "and" (defeito medido no censo)', () => {
    const a = analisarPredicado("bucket_id = 'termos' and (select public.e_admin())")
    expect(a.semLinha).toEqual([])
    expect(a.linha).toEqual([])
  })

  it('passa: embrulhada, piso, array (select …), cast e literal tipado', () => {
    for (const ok of [
      '(select public.e_admin())',
      '(select public.papel_atual()) is not null',
      'col = any (array (select public.fn()))',
      "created_at > (select now()) - interval '1 day'",
      'x::numeric(10, 2) > 0 and y::timestamp with time zone is not null',
      'cast(x as double precision) > 0',
    ]) {
      expect(r2(ok), ok).toEqual([])
    }
  })
})

describe('5. R3 — sub-select não lê tabela e não olha a linha', () => {
  it('reprova exists sobre tabela (mesmo sem olhar a linha)', () => {
    const s = r3('exists (select 1 from public.membros m where m.profile_id = (select auth.uid()))')
    expect(s).toHaveLength(1)
    expect(s[0].leRelacao).toEqual(['public.membros'])
    expect(s[0].refLinha).toEqual([])
  })

  it('reprova exists correlacionado', () => {
    const s = r3('exists (select 1 from public.operador_filiais o where o.filial_id = ativos.filial_id)')
    expect(s[0].leRelacao).toEqual(['public.operador_filiais'])
    expect(s[0].refLinha).toEqual(['ativos.filial_id'])
  })

  it('reprova a junta com a linha sobre função de conjunto, e a coluna não qualificada (falha fechada)', () => {
    expect(r3('exists (select 1 from public.fn() u where u.id = tabela.col)')[0].refLinha).toEqual(['tabela.col'])
    expect(r3('exists (select 1 from public.fn() u where u.id = col)')[0].refLinha).toEqual(['col (não qualificada)'])
    expect(r3('(select tabela.col) is not null')[0].refLinha).toEqual(['tabela.col'])
  })

  it('o falso içamento é R1, não R3 (atribuição única)', () => {
    const a = analisarPredicado('(select public.pode_ler_arquivo_termo(name))')
    expect(a.subselects).toEqual([])
    expect(a.linha).toHaveLength(1)
  })

  it('passa: array (select fn()), a forma de pares, derivada sobre função', () => {
    for (const ok of [
      'empresa_id = any (array (select public.empresas_do_membro()))',
      '(empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u)',
      'filial_id in (select u.filial_id from public.unidades_de_escrita() as u)',
      'x in (select e from public.empresas_do_membro() e)',
    ]) {
      expect(r3(ok), ok).toEqual([])
      expect(r1(ok), ok).toEqual([])
      expect(r2(ok), ok).toEqual([])
    }
  })

  it('FALHA FECHADA — união e CTE dentro de sub-select LANÇAM', () => {
    expect(() => analisarPredicado('x in (select a from f() union select b from g())')).toThrow(/union/)
    expect(() => analisarPredicado('x in (with c as (select 1) select * from c)')).toThrow(/with/)
    expect(() => analisarPredicado('x in (select 1')).toThrow(/sem/)
  })
})

describe('6. a lista única — lida do .sql, com motivo e destino na linha', () => {
  const sql = `
  k_policies_public text[] := array[
    'ativos / leitura operador', -- comentário com 'aspas' não entra
    'filiais / admin apaga'
  ];
  k_storage text[] := array[
    'termos leitura operador'
  ];
  k_excecoes_predicado text[] := array[
    -- linha de comentário é ignorada
    'public.ativos / operador atualiza / pode_escrever_filial', -- 0063 · motivo: a escrita do operador é por filial da própria linha · destino: F66 (unidades_de_escrita)
    'storage.objects / termos leitura operador / pode_ler_arquivo_termo', -- 0129 · motivo: o falso içamento, que o select em volta não iça · destino: F67
    'public.x / y / z' -- 0001 · motivo: curto · destino: talvez
  ];`

  it('lê as entradas bem formadas e acusa a malformada', () => {
    const { entradas, problemas } = lerExcecoesDoCatalogo(sql)
    expect(entradas.map((x) => [x.chave, x.migration, x.destino])).toEqual([
      ['public.ativos / operador atualiza / pode_escrever_filial', '0063', 'F66'],
      ['storage.objects / termos leitura operador / pode_ler_arquivo_termo', '0129', 'F67'],
    ])
    expect(problemas).toHaveLength(1)
    expect(problemas[0]).toMatch(/fora do formato/)
  })

  it('o universo congelado soma public e storage, e ignora aspas de comentário', () => {
    expect([...lerUniversoDoCatalogo(sql)].sort()).toEqual([
      'public.ativos / leitura operador',
      'public.filiais / admin apaga',
      'storage.objects / termos leitura operador',
    ])
  })

  it('sem o array, é problema — não lista vazia silenciosa', () => {
    expect(lerExcecoesDoCatalogo('nada aqui').problemas).toHaveLength(1)
  })
})
