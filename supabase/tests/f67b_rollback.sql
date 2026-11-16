-- =============================================================
-- Roteiro de teste: O ROLLBACK DA F67B (16/11/2026) — supabase/rollback/F67B-desfaz.sql
-- =============================================================
-- O ensaio do rollback no Postgres do CI, nos DOIS estados em que produção pode estar quando ele roda (PLAN-F67B §6):
--   · o CONTRAÍDO (a cadeia inteira, 0194–0199 — o estado do CI): o rollback devolve o esquema da cadeia até a 0193;
--   · o SÓ-EXPANSÃO (0194–0197 sem a contração — produção entre o apply da expansão e a janela do drop): reconstruído
--     AQUI reaplicando as quatro migrations da expansão em cima do primeiro rollback; o rollback de novo devolve o mesmo.
-- "O esquema da cadeia até a 0193" é a IMPRESSÃO (as funções de public com o corpo, a definer, o search_path e o EXECUTE
-- de cada papel; as policies de public e de storage; as views de public; os gatilhos; e os COMENTÁRIOS que a F67B
-- reescreve — os das funções de public e o da coluna eventos_admin.acao), MEDIDA NO CI na cadeia até a 0193: o roteiro
-- imprime a impressão de depois do rollback numa linha "(medição)", e a constante k_antes é a do CI (como o L4 de
-- integridade_tenant.sql — na mesa PGlite as policies medem outro md5 para a mesma cadeia).
--   rb1–rb5  a impressão depois do rollback (o contraído) = a do CI na cadeia até a 0193, parte a parte;
--   rb6      o rollback rodado de novo, sobre o banco já desfeito, dá o mesmo esquema (idempotente);
--   rb7      o só-expansão: 0194–0197 reaplicadas e o rollback de novo = a do CI na cadeia até a 0193;
--   rb8      o ledger (supabase_migrations.schema_migrations) não é reescrito — o rollback é só catálogo;
--   rb9      nenhum objeto de Storage é tocado (a contagem e o md5 dos nomes de storage.objects ficam iguais).
-- Tudo dentro de begin … rollback (nada persiste). Dados: nenhum de negócio; um objeto fictício de cada forma do bucket
-- backups-import é plantado para o rb9 ter o que conferir.
-- =============================================================

begin;

create or replace function pg_temp.f67b_impressao()
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
  union all
  -- os comentários: os das funções de public e o da coluna eventos_admin.acao (a F67B reescreve os dois)
  select 'comentarios', md5(string_agg(x, E'\n' order by x)), count(*)
    from (select p.oid::regprocedure::text || ':' || coalesce(md5(obj_description(p.oid, 'pg_proc')), '∅') as x
            from pg_proc p where p.pronamespace = 'public'::regnamespace
          union all
          select 'eventos_admin.acao:' || coalesce(md5(col_description('public.eventos_admin'::regclass,
                   (select attnum from pg_attribute where attrelid = 'public.eventos_admin'::regclass and attname = 'acao'))), '∅')) s
$fn$;

create or replace function pg_temp.f67b_impressao_txt()
returns text
language sql
as $fn$
  select string_agg(parte || ':' || md5 || ':' || n, '|' order by parte) from pg_temp.f67b_impressao()
$fn$;

create or replace function pg_temp.f67b_ledger()
returns text
language sql
as $fn$
  select count(*)::text || ':' || coalesce(md5(string_agg(version::text, ',' order by version)), '∅')
    from supabase_migrations.schema_migrations
$fn$;

create or replace function pg_temp.f67b_objetos()
returns text
language sql
as $fn$
  select count(*)::text || ':' || coalesce(md5(string_agg(bucket_id || '/' || name, ',' order by bucket_id, name)), '∅')
    from storage.objects
$fn$;

-- um objeto fictício de cada forma (a nova e a antiga) no bucket de backups: o rollback não pode tocar nenhum
insert into storage.objects (bucket_id, name, owner) values
  ('backups-import', 'import/empresa-00000000-0000-4000-a000-000000000001/filial-1/2026-11-16T00-00-00-000Z.json', null),
  ('backups-import', 'import/filial-1/2026-11-16T00-00-00-000Z.json', null);

select pg_temp.f67b_ledger()  as ledger_antes,
       pg_temp.f67b_objetos() as objetos_antes
\gset

-- O CONTRAÍDO: a cadeia inteira (o estado do CI)
\ir ../rollback/F67B-desfaz.sql

select pg_temp.f67b_impressao_txt() as depois,
       pg_temp.f67b_ledger()        as ledger_depois,
       pg_temp.f67b_objetos()       as objetos_depois
\gset

-- rb6: de novo — o mesmo arquivo, sobre o banco já desfeito
\ir ../rollback/F67B-desfaz.sql

select pg_temp.f67b_impressao_txt() as de_novo
\gset

-- O SÓ-EXPANSÃO: as quatro migrations da expansão de volta, em cima do banco desfeito — e o rollback outra vez
\ir ../migrations/0194_caminho_backup_por_empresa.sql
\ir ../migrations/0195_backups_import_por_empresa_expansao.sql
\ir ../migrations/0196_backup_orfao_duas_formas.sql
\ir ../migrations/0197_termo_pela_empresa_da_linha.sql

select (to_regprocedure('public.empresa_do_caminho_backup(text)') is not null
        and to_regprocedure('public.pode_escrever_termo(uuid, uuid[])') is not null
        and to_regprocedure('public.pode_escrever_termo(uuid[])') is not null
        and to_regprocedure('public.prefixo_backup_import(smallint)') is not null
        and to_regprocedure('public.prefixo_backup_import(uuid, smallint)') is not null)::text as so_expansao_montado
\gset

\ir ../rollback/F67B-desfaz.sql

select pg_temp.f67b_impressao_txt() as so_expansao_depois
\gset

select set_config('f67brb.depois',              :'depois',              false),
       set_config('f67brb.de_novo',             :'de_novo',             false),
       set_config('f67brb.so_expansao_montado', :'so_expansao_montado', false),
       set_config('f67brb.so_expansao_depois',  :'so_expansao_depois',  false),
       set_config('f67brb.ledger_antes',        :'ledger_antes',        false),
       set_config('f67brb.ledger_depois',       :'ledger_depois',       false),
       set_config('f67brb.objetos_antes',       :'objetos_antes',       false),
       set_config('f67brb.objetos_depois',      :'objetos_depois',      false);

do $$
declare
  -- A impressão na cadeia até a 0193 (ordenada por parte: comentarios, funcoes, gatilhos, policies, views). Medida na mesa
  -- PGlite em 16/11/2026 (docs/f67b-evidencias/E-rollback/): a impressão da base 0193 = a de depois do rollback, parte a
  -- parte. A régua é o CI: a parte que lá medir outro md5 (as policies, como na F67) é trocada pela linha (medição).
  k_antes constant text :=
    'comentarios:c6632ecf0ae248192a4da12b3948e637:115|funcoes:0a2a3c3e7c8a71d014b7f3b01ba3bdf3:114|'
    || 'gatilhos:b702fcca51f1cbe5760df8c88aa5a930:53|policies:f3d8c68dc9e82a282b657eafa616562e:62|'
    || 'views:a38b7bf1527d5cb13f776b5e8af0b2b4:9';
  v_depois  text := current_setting('f67brb.depois');
  v_de_novo text := current_setting('f67brb.de_novo');
  v_exp     text := current_setting('f67brb.so_expansao_depois');
  v_ok      int := 0;
  v_falhas  int := 0;
  v_i       int;
  v_rotulos text[] := array[
    'rb1 os comentários (das funções de public e da coluna eventos_admin.acao) depois do rollback são os do CI na cadeia até a 0193',
    'rb2 as funções de public depois do rollback são as do CI na cadeia até a 0193 (corpo, definer, search_path e EXECUTE)',
    'rb3 os gatilhos de public depois do rollback são os do CI na cadeia até a 0193',
    'rb4 as policies de public e de storage depois do rollback são as do CI na cadeia até a 0193',
    'rb5 as views de public depois do rollback são as do CI na cadeia até a 0193'];
begin
  -- a MEDIÇÃO: a impressão de depois do rollback, para a constante k_antes (a régua é o CI)
  raise notice '(medição) f67b_rollback depois: %', v_depois;

  -- rb1–rb5: parte a parte, para o rótulo dizer QUAL parte divergiu
  for v_i in 1..5 loop
    if pg_temp.assert_zero_de(v_rotulos[v_i] ||
         case when split_part(v_depois, '|', v_i) <> split_part(k_antes, '|', v_i)
              then ' — ' || split_part(v_depois, '|', v_i) || ', esperado ' || split_part(k_antes, '|', v_i) else '' end,
         case when split_part(v_depois, '|', v_i) = split_part(k_antes, '|', v_i) then 0 else 1 end, 1) then
      v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  end loop;

  if pg_temp.assert_zero_de('rb6 o rollback rodado de novo, sobre o banco já desfeito, dá o mesmo esquema (idempotente)' ||
       case when v_de_novo is distinct from v_depois then ' — ' || coalesce(v_de_novo, '∅') else '' end,
       case when v_de_novo is not distinct from v_depois then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb7 o só-expansão (0194–0197 reaplicadas, sem a contração): o rollback devolve o esquema do CI na cadeia até a 0193' ||
       case when current_setting('f67brb.so_expansao_montado') <> 'true' then ' — o estado só-expansão não se montou'
            when v_exp is distinct from v_depois then ' — ' || coalesce(v_exp, '∅') else '' end,
       case when current_setting('f67brb.so_expansao_montado') = 'true' and v_exp = v_depois and v_depois = k_antes then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb8 o ledger de migrations não é reescrito pelo rollback (as linhas da F67B ficam)' ||
       case when current_setting('f67brb.ledger_depois') is distinct from current_setting('f67brb.ledger_antes')
            then ' — antes ' || current_setting('f67brb.ledger_antes') || ', depois ' || current_setting('f67brb.ledger_depois') else '' end,
       case when current_setting('f67brb.ledger_depois') = current_setting('f67brb.ledger_antes') then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb9 nenhum objeto de Storage é tocado pelo rollback (os backups das duas formas ficam no bucket)' ||
       case when current_setting('f67brb.objetos_depois') is distinct from current_setting('f67brb.objetos_antes')
            then ' — antes ' || current_setting('f67brb.objetos_antes') || ', depois ' || current_setting('f67brb.objetos_depois') else '' end,
       case when current_setting('f67brb.objetos_depois') = current_setting('f67brb.objetos_antes') then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM f67b_rollback: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end
$$;

rollback;
