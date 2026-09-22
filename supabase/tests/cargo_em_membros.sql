-- =============================================================
-- Roteiro de teste: O CARGO MORA EM `membros` (F62, 22/09/2026)
-- =============================================================
-- A TRAVA DE CATÁLOGO DA F62. Desde a F62 o cargo (`papel`) e o status (`ativo`) de
-- cada pessoa moram em `public.membros`, por empresa (decisão 6 do PLANO-MULTIEMPRESA);
-- `profiles.papel` e `profiles.ativo` ficaram CONGELADOS — ninguém mais os lê nem os
-- escreve (decisão iii do Johnny, 22/09/2026). Eles só continuam de pé como rede de
-- reversão, até a entrega PATCH que os derruba.
--
-- O QUE ESTE ARQUIVO AFIRMA, sobre o CATÁLOGO VIVO (nunca sobre lista escrita à mão):
--   1a — nenhuma FUNÇÃO de `public` lê ou escreve `profiles.papel`/`profiles.ativo`,
--        fora das exceções NOMEADAS em `k_excecoes_cargo`;
--   1b — toda exceção ainda descreve o banco (a catraca no outro sentido: exceção que
--        não é mais acusada é exceção que sobreviveu ao motivo);
--   1c — nenhuma VIEW de `public` o faz;
--   1d — nenhuma POLICY (`public` + `storage`) o faz;
--   2a–2d — AUTO-SABOTAGEM (molde 10b de `asof_desempate.sql`): funções FICTÍCIAS que
--        leem o cargo em `profiles` pelas quatro formas que a varredura conhece são
--        acusadas por ELA MESMA. Sem isto, 1a verde não distinguiria "ninguém lê" de
--        "a varredura é cega".
--
-- ⚠ FONTE ÚNICA DAS EXCEÇÕES (Decisão 2 da F48): `k_excecoes_cargo` abaixo é lido como
-- TEXTO pela trava de MESA (`src/lib/validators/cargo-em-membros.test.ts`), que faz a
-- mesma afirmação sobre o corpo vigente das migrations — nunca copiado para TypeScript.
-- Uma entrada por linha: `'<função>' -- NNNN · motivo: <frase > 40 caracteres> ·
-- destino: <fase>|PATCH`.
--
-- COMO A VARREDURA RECONHECE "LER O CARGO EM `profiles`" — sobre o texto da definição
-- SEM comentários (`--` e `/* */`), em minúsculas:
--   (a) `profiles.papel` / `profiles.ativo`, qualificados pelo nome da tabela;
--   (b) `<alias>.papel` / `<alias>.ativo`, com o alias ligado a `profiles` por
--       `from|join|update [public.]profiles [as] <alias>`;
--   (c) `update [public.]profiles … set … papel|ativo =`;
--   (d) `insert into [public.]profiles (… papel|ativo …)`;
--   (e) `from|join [public.]profiles` SEM alias, com `papel`/`ativo` NUS no mesmo comando;
--   (f) `old.`/`new.` `papel`/`ativo` numa função de GATILHO de `profiles`.
-- Falha FECHADA: um `ativo` nu no comando de outra tabela que também lê `profiles` sem
-- alias é acusado — é o preço de não deixar passar o caso real.
--
-- Não usa `pg_temp.assert_zero_de` nas asserções 1a–1d? USA: o universo aqui é o
-- CATÁLOGO (as funções/views/policies que as migrations criaram), contado antes — e ele
-- não fica vazio.
--
-- Roda inteiro dentro de `begin; … rollback;` — as funções fictícias da 2 somem.
-- =============================================================

begin;

-- O detector, UMA vez, usado pelas asserções 1 e 2 (a auto-sabotagem prova ESTA função).
-- Devolve a forma acusada ('a'…'f') ou NULL. `p_gatilho_de_profiles` liga a forma (f).
create function pg_temp.le_cargo_em_profiles(p_def text, p_gatilho_de_profiles boolean)
returns text
language plpgsql
as $det$
declare
  v_def   text;
  v_alias text;
  v_cmd   text;
  k_nao_alias constant text[] := array[
    'where', 'on', 'set', 'join', 'left', 'right', 'inner', 'full', 'cross', 'using',
    'order', 'group', 'limit', 'returning', 'for', 'union', 'natural', 'lateral',
    'window', 'having', 'offset', 'fetch', 'except', 'intersect', 'as', 'and', 'or',
    'into', 'values', 'select', 'default'];
begin
  v_def := lower(coalesce(p_def, ''));
  v_def := regexp_replace(v_def, '/\*.*?\*/', ' ', 'g');
  v_def := regexp_replace(v_def, '--[^\n]*', ' ', 'g');

  -- (a)
  if v_def ~ '\mprofiles\s*\.\s*(papel|ativo)\M' then return 'a'; end if;

  -- (b)
  for v_alias in
    select m[1]
      from regexp_matches(v_def,
             '(?:from|join|update)\s+(?:public\s*\.\s*)?profiles\s+(?:as\s+)?([a-z_][a-z0-9_]*)',
             'g') as m
  loop
    if v_alias <> all (k_nao_alias)
       and v_def ~ ('\m' || v_alias || '\s*\.\s*(papel|ativo)\M') then
      return 'b';
    end if;
  end loop;

  -- (c) e (d)
  if v_def ~ 'update\s+(?:public\s*\.\s*)?profiles\M[^;]*?\mset\M[^;]*?\m(papel|ativo)\s*=' then
    return 'c';
  end if;
  if v_def ~ 'insert\s+into\s+(?:public\s*\.\s*)?profiles\s*\([^)]*\m(papel|ativo)\M' then
    return 'd';
  end if;

  -- (e) — comando a comando: `profiles` lida SEM alias (a palavra seguinte ausente ou
  -- palavra-chave), e `papel`/`ativo` NUS no mesmo comando.
  foreach v_cmd in array regexp_split_to_array(v_def, ';') loop
    for v_alias in
      select coalesce(m[1], '')
        from regexp_matches(v_cmd,
               '(?:from|join)\s+(?:public\s*\.\s*)?profiles\M\s*(?:as\s+)?([a-z_][a-z0-9_]*)?',
               'g') as m
    loop
      if (v_alias = '' or v_alias = any (k_nao_alias))
         and v_cmd ~ '(?:^|[^.a-z0-9_])(papel|ativo)(?:[^a-z0-9_]|$)' then
        return 'e';
      end if;
    end loop;
  end loop;

  -- (f)
  if p_gatilho_de_profiles and v_def ~ '\m(old|new)\s*\.\s*(papel|ativo)\M' then
    return 'f';
  end if;

  return null;
end;
$det$;

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;
  v_cnt    bigint;
  v_univ   bigint;
  v_lista  text;

  -- =======================================================================
  -- AS EXCEÇÕES NOMEADAS — a fonte única (lida como texto pela trava de mesa).
  -- =======================================================================
  k_excecoes_cargo text[] := array[
    'profiles_guarda_dev' -- 0158 · motivo: é o gatilho de profiles que continua protegendo a coluna congelada e o excluido_em de um dev contra escrita por fora das RPCs (inclusive do service role); ler old/new.papel e old/new.ativo É a guarda · destino: PATCH
  ];
begin
  -- ---------------------------------------------------------------
  -- 1a — nenhuma FUNÇÃO de `public` lê ou escreve o cargo em `profiles`.
  -- ---------------------------------------------------------------
  select count(*),
         count(*) filter (where forma is not null and proname <> all (k_excecoes_cargo)),
         coalesce(string_agg(proname || ' (' || forma || ')', ', ' order by proname)
                    filter (where forma is not null and proname <> all (k_excecoes_cargo)), '')
    into v_univ, v_cnt, v_lista
    from (
      select p.proname,
             pg_temp.le_cargo_em_profiles(
               pg_get_functiondef(p.oid),
               exists (select 1 from pg_trigger t
                        where t.tgfoid = p.oid and t.tgrelid = 'public.profiles'::regclass)) as forma
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'
    ) x;
  if pg_temp.assert_zero_de(
       '1a nenhuma função de public lê ou escreve profiles.papel/profiles.ativo fora das exceções nomeadas' ||
       case when v_cnt > 0 then ' — acusadas: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 1b — toda exceção AINDA é acusada (senão sobreviveu ao motivo que a criou).
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_excecoes_cargo) as nome
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.proname = nome
        and pg_temp.le_cargo_em_profiles(
              pg_get_functiondef(p.oid),
              exists (select 1 from pg_trigger t
                       where t.tgfoid = p.oid and t.tgrelid = 'public.profiles'::regclass)) is not null);
  if pg_temp.assert_zero_de(
       '1b toda exceção de k_excecoes_cargo ainda lê o cargo em profiles (a catraca no outro sentido)' ||
       case when v_cnt > 0 then ' — obsoleta(s): ' || v_lista else '' end,
       v_cnt, array_length(k_excecoes_cargo, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 1c — nenhuma VIEW de `public`.
  -- ---------------------------------------------------------------
  select count(*),
         count(*) filter (where pg_temp.le_cargo_em_profiles(pg_get_viewdef(c.oid, true), false) is not null),
         coalesce(string_agg(c.relname, ', ' order by c.relname)
                    filter (where pg_temp.le_cargo_em_profiles(pg_get_viewdef(c.oid, true), false) is not null), '')
    into v_univ, v_cnt, v_lista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v';
  if pg_temp.assert_zero_de(
       '1c nenhuma view de public lê o cargo em profiles' ||
       case when v_cnt > 0 then ' — acusadas: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 1d — nenhuma POLICY (`public` e `storage`).
  -- ---------------------------------------------------------------
  select count(*),
         count(*) filter (where pg_temp.le_cargo_em_profiles(
                                  coalesce(pol.qual, '') || ' ; ' || coalesce(pol.with_check, ''), false) is not null),
         coalesce(string_agg(pol.schemaname || '.' || pol.tablename || ' / ' || pol.policyname, ', '
                             order by pol.schemaname, pol.tablename, pol.policyname)
                    filter (where pg_temp.le_cargo_em_profiles(
                                  coalesce(pol.qual, '') || ' ; ' || coalesce(pol.with_check, ''), false) is not null), '')
    into v_univ, v_cnt, v_lista
    from pg_policies pol
   where pol.schemaname in ('public', 'storage');
  if pg_temp.assert_zero_de(
       '1d nenhuma policy de public/storage lê o cargo em profiles' ||
       case when v_cnt > 0 then ' — acusadas: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 2a–2d — AUTO-SABOTAGEM. Quatro funções FICTÍCIAS, uma por forma de leitura que a
  -- varredura conhece, e a MESMA consulta da 1a tem de acusar cada uma. Nascem e
  -- morrem neste `begin; … rollback;`.
  -- ---------------------------------------------------------------
  execute
    'create function public._f62_sabotagem_alias() returns text language sql stable as ' ||
    '$s1$ select p.papel::text from public.profiles p where p.id = auth.uid() $s1$';
  execute
    'create function public._f62_sabotagem_sem_alias() returns boolean language sql stable as ' ||
    '$s2$ select ativo from public.profiles where id = auth.uid() $s2$';
  execute
    'create function public._f62_sabotagem_grava() returns void language sql as ' ||
    '$s3$ update public.profiles set papel = ''consulta'' where id = auth.uid() $s3$';
  execute
    'create function public._f62_sabotagem_qualificada() returns boolean language sql stable as ' ||
    '$s4$ select exists (select 1 from public.profiles where profiles.ativo) $s4$';

  select count(*), coalesce(string_agg(proname, ', ' order by proname), '')
    into v_cnt, v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname in ('_f62_sabotagem_alias', '_f62_sabotagem_sem_alias',
                       '_f62_sabotagem_grava', '_f62_sabotagem_qualificada')
     and pg_temp.le_cargo_em_profiles(pg_get_functiondef(p.oid), false) is not null
     and p.proname <> all (k_excecoes_cargo);

  if v_cnt = 4 then
    v_ok := v_ok + 1;
    raise notice '✓ 2 auto-sabotagem: a varredura da 1a ACUSA as quatro funções fictícias (alias, sem alias, gravação, qualificada) — o gate SABE reprovar';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2 a varredura acusou % de 4 funções fictícias (%) — o gate está cego para alguma forma de ler o cargo em profiles', v_cnt, v_lista;
  end if;

  raise notice 'FIM cargo_em_membros: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
