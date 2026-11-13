-- =============================================================
-- Roteiro de teste: O ROLLBACK DA F67 (13/11/2026) — supabase/rollback/F67-desfaz.sql
-- =============================================================
-- ⚠ VERSÃO DE MEDIÇÃO (o commit das travas da F67): o arquivo de rollback ainda não existe. Este roteiro só IMPRIME a
-- impressão do esquema que o rollback terá de devolver — a cadeia até a 0184, medida no Postgres do CI (o md5 de prosrc
-- da mesa PGlite difere do CI para a mesma cadeia: a constante se mede aqui). O commit do rollback troca este arquivo
-- pelo ensaio de verdade, com as constantes desta medição.
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

do $$
declare
  r        record;
  v_ok     int := 0;
  v_falhas int := 1;
begin
  for r in select * from pg_temp.f67_impressao() loop
    raise notice '(medição) f67 impressão antes da 0185 — %: % (% objetos)', r.parte, r.md5, r.n;
  end loop;
  raise warning '✗ rb0 o rollback da F67 (supabase/rollback/F67-desfaz.sql) ainda não existe — este é o commit das travas';
  raise notice 'FIM f67_rollback: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end
$$;

rollback;
