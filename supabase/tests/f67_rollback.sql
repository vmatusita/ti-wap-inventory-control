-- =============================================================
-- Roteiro de teste: O ROLLBACK DA F67 (13/11/2026) — supabase/rollback/F67-desfaz.sql
-- =============================================================
-- O ensaio do rollback no Postgres do CI, nos DOIS estados em que produção pode estar quando ele roda (PLAN-F67 §6,
-- decisão 17):
--   · o CONTRAÍDO (a cadeia inteira, 0185–0193 — o estado do CI): o rollback devolve o esquema da cadeia até a 0184;
--   · o SÓ-EXPANSÃO (0185–0192 sem a contração — produção entre o apply da expansão e a janela do drop): reconstruído
--     AQUI reaplicando as oito migrations da expansão em cima do primeiro rollback; o rollback de novo devolve o mesmo.
-- "O esquema da cadeia até a 0184" é a IMPRESSÃO (as funções de public com o corpo, a definer, o search_path e o EXECUTE
-- de cada papel; as policies de public e de storage; as views de public; os gatilhos), medida NO CI no push das travas
-- da F67 (commit cc089db, run 43441883622 — docs/f67-evidencias/B-travas/ci-travas-vermelhas-cc089db.txt). Na mesa PGlite
-- as policies medem outro md5 para a mesma cadeia (48cba67f…; as outras três partes batem): diferença de ambiente, e o CI
-- é a régua — como o L4 de integridade_tenant.sql.
--   rb1–rb4  a impressão depois do rollback (o contraído) = a do CI antes da 0185, parte a parte;
--   rb5      o rollback rodado de novo, sobre o banco já desfeito, dá o mesmo esquema (idempotente);
--   rb6      o só-expansão: 0185–0192 reaplicadas e o rollback de novo = a do CI antes da 0185;
--   rb7      o ledger (supabase_migrations.schema_migrations) não é reescrito — o rollback é só catálogo.
-- Tudo dentro de begin … rollback (nada persiste). Dados: nenhum (só catálogo).
-- =============================================================

begin;

create or replace function pg_temp.f67_impressao()
returns table (parte text, md5 text, n bigint)
language sql
as $fn$
  -- as funções de public: assinatura, corpo, definer, search_path e o EXECUTE de cada papel
  select 'funcoes', md5(string_agg(x, E'\n' order by x)), count(*)
    from (select p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || p.prosecdef::text || ':'
                 || coalesce(array_to_string(p.proconfig, ','), '') || ':'
                 || has_function_privilege('anon', p.oid, 'execute')::text || ','
                 || has_function_privilege('authenticated', p.oid, 'execute')::text || ','
                 || has_function_privilege('service_role', p.oid, 'execute')::text || ','
                 || exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                             where a.grantee = 0 and a.privilege_type = 'EXECUTE')::text as x
            from pg_proc p where p.pronamespace = 'public'::regnamespace) s
  union all
  -- as policies de public e de storage
  select 'policies', md5(string_agg(x, E'\n' order by x)), count(*)
    from (select n.nspname || '.' || c.relname || '/' || p.polname || '/' || p.polcmd::text || '/' || p.polpermissive::text || '/'
                 || p.polroles::text || '/' || coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '/'
                 || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as x
            from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname in ('public', 'storage')) s
  union all
  -- as views de public: a definição e as opções
  select 'views', md5(string_agg(x, E'\n' order by x)), count(*)
    from (select c.relname || ':' || md5(pg_get_viewdef(c.oid)) || ':' || coalesce(array_to_string(c.reloptions, ','), '') as x
            from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v') s
  union all
  -- os gatilhos não internos de public
  select 'gatilhos', md5(string_agg(x, E'\n' order by x)), count(*)
    from (select t.tgrelid::regclass::text || '/' || t.tgname || '/' || t.tgfoid::regprocedure::text || '/' || t.tgtype::text
                 || '/' || t.tgenabled::text as x
            from pg_trigger t join pg_class c on c.oid = t.tgrelid
           where c.relnamespace = 'public'::regnamespace and not t.tgisinternal) s
$fn$;

create or replace function pg_temp.f67_impressao_txt()
returns text
language sql
as $fn$
  select string_agg(parte || ':' || md5 || ':' || n, '|' order by parte) from pg_temp.f67_impressao()
$fn$;

create or replace function pg_temp.f67_ledger()
returns text
language sql
as $fn$
  select count(*)::text || ':' || coalesce(md5(string_agg(version::text, ',' order by version)), '∅')
    from supabase_migrations.schema_migrations
$fn$;

select pg_temp.f67_ledger() as ledger_antes
\gset

-- O CONTRAÍDO: a cadeia inteira (o estado do CI)
\ir ../rollback/F67-desfaz.sql

select pg_temp.f67_impressao_txt() as depois,
       pg_temp.f67_ledger()        as ledger_depois
\gset

-- rb5: de novo — o mesmo arquivo, sobre o banco já desfeito
\ir ../rollback/F67-desfaz.sql

select pg_temp.f67_impressao_txt() as de_novo
\gset

-- O SÓ-EXPANSÃO: as oito migrations da expansão de volta, em cima do banco desfeito — e o rollback outra vez
\ir ../migrations/0185_cargo_por_empresa.sql
\ir ../migrations/0186_consumidores_por_empresa.sql
\ir ../migrations/0187_policies_sem_par_por_empresa.sql
\ir ../migrations/0188_piso_cargo_mais_forte.sql
\ir ../migrations/0189_gestao_de_contas_por_empresa.sql
\ir ../migrations/0190_destrutivas_por_empresa.sql
\ir ../migrations/0191_mesa_por_empresa.sql
\ir ../migrations/0192_termo_por_empresa.sql

select (to_regprocedure('public.papel_na_empresa(uuid)') is not null
        and to_regprocedure('public.apagar_ativo(uuid, text, text)') is not null
        and to_regprocedure('public.apagar_ativo(uuid, uuid, text, text)') is not null)::text as so_expansao_montado
\gset

\ir ../rollback/F67-desfaz.sql

select pg_temp.f67_impressao_txt() as so_expansao_depois
\gset

select set_config('f67rb.depois',             :'depois',             false),
       set_config('f67rb.de_novo',            :'de_novo',            false),
       set_config('f67rb.so_expansao_montado', :'so_expansao_montado', false),
       set_config('f67rb.so_expansao_depois', :'so_expansao_depois', false),
       set_config('f67rb.ledger_antes',       :'ledger_antes',       false),
       set_config('f67rb.ledger_depois',      :'ledger_depois',      false);

do $$
declare
  -- A impressão do CI na cadeia até a 0184 (run 43441883622; ordenada por parte).
  k_antes constant text :=
    'funcoes:e5a982611889d7d2a1059069e4b701bc:106|gatilhos:faabdedeccadc5ee111e827b75da9976:52|'
    || 'policies:df2385787c2c4137c144786d21a7ca86:62|views:eb6a8509379eb9b77bfb59d4e7e5eb2f:9';
  v_depois  text := current_setting('f67rb.depois');
  v_de_novo text := current_setting('f67rb.de_novo');
  v_exp     text := current_setting('f67rb.so_expansao_depois');
  v_ok      int := 0;
  v_falhas  int := 0;
  -- a parte <p> de uma impressão
  v_parte   text;
begin
  -- rb1–rb4: parte a parte, para o rótulo dizer QUAL parte divergiu
  v_parte := 'funcoes';
  if pg_temp.assert_zero_de('rb1 as funções de public depois do rollback são as do CI antes da 0185 (corpo, definer, search_path e EXECUTE)' ||
       case when split_part(v_depois, '|', 1) <> split_part(k_antes, '|', 1)
            then ' — ' || split_part(v_depois, '|', 1) || ', esperado ' || split_part(k_antes, '|', 1) else '' end,
       case when split_part(v_depois, '|', 1) = split_part(k_antes, '|', 1) then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb2 as policies de public e de storage depois do rollback são as do CI antes da 0185' ||
       case when split_part(v_depois, '|', 3) <> split_part(k_antes, '|', 3)
            then ' — ' || split_part(v_depois, '|', 3) || ', esperado ' || split_part(k_antes, '|', 3) else '' end,
       case when split_part(v_depois, '|', 3) = split_part(k_antes, '|', 3) then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb3 as views de public depois do rollback são as do CI antes da 0185 (a mesa sem a partição nem a coluna empresa)' ||
       case when split_part(v_depois, '|', 4) <> split_part(k_antes, '|', 4)
            then ' — ' || split_part(v_depois, '|', 4) || ', esperado ' || split_part(k_antes, '|', 4) else '' end,
       case when split_part(v_depois, '|', 4) = split_part(k_antes, '|', 4) then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb4 os gatilhos de public depois do rollback são os do CI antes da 0185 (sem a trava do termo)' ||
       case when split_part(v_depois, '|', 2) <> split_part(k_antes, '|', 2)
            then ' — ' || split_part(v_depois, '|', 2) || ', esperado ' || split_part(k_antes, '|', 2) else '' end,
       case when split_part(v_depois, '|', 2) = split_part(k_antes, '|', 2) then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb5 o rollback rodado de novo, sobre o banco já desfeito, dá o mesmo esquema (idempotente)' ||
       case when v_de_novo is distinct from v_depois then ' — ' || coalesce(v_de_novo, '∅') else '' end,
       case when v_de_novo is not distinct from v_depois then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb6 o só-expansão (0185–0192 reaplicadas, sem a contração): o rollback devolve o esquema do CI antes da 0185' ||
       case when current_setting('f67rb.so_expansao_montado') <> 'true' then ' — o estado só-expansão não se montou'
            when v_exp is distinct from k_antes then ' — ' || coalesce(v_exp, '∅') else '' end,
       case when current_setting('f67rb.so_expansao_montado') = 'true' and v_exp = k_antes then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb7 o ledger de migrations não é reescrito pelo rollback (as linhas da F67 ficam)' ||
       case when current_setting('f67rb.ledger_depois') is distinct from current_setting('f67rb.ledger_antes')
            then ' — antes ' || current_setting('f67rb.ledger_antes') || ', depois ' || current_setting('f67rb.ledger_depois') else '' end,
       case when current_setting('f67rb.ledger_depois') = current_setting('f67rb.ledger_antes') then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM f67_rollback: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end
$$;

rollback;
