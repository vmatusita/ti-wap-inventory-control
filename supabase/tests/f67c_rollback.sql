-- =============================================================
-- Roteiro de teste: O ROLLBACK DA F67C (16/11/2026) — supabase/rollback/F67C-desfaz.sql
-- =============================================================
-- O ensaio do rollback no Postgres do CI, nos DOIS estados em que produção pode estar quando ele roda (PLAN-F67C §6,
-- decisão 16):
--   · o CONTRAÍDO (a cadeia inteira, 0200–0207 — o estado do CI): o rollback devolve o esquema da cadeia até a 0199;
--   · o SÓ-EXPANSÃO (0200–0204 sem a contração — produção entre o apply da expansão e a janela do drop): reconstruído
--     AQUI reaplicando as cinco migrations da expansão em cima do primeiro rollback; o rollback de novo devolve o mesmo.
-- "O esquema da cadeia até a 0199" é a IMPRESSÃO: as funções de public (assinatura, corpo, definer, search_path e o
-- EXECUTE de cada papel), as policies de public e de storage, as views, os gatilhos, os COMENTÁRIOS das funções E os
-- DEFAULTS das colunas de public (tabela.coluna = o texto do default) — a parte nova: sem ela o `set default` do
-- rollback ficaria sem prova (a F67C é a fase que tira o default; desfazê-la é pô-lo de volta nas 20).
--   rc1–rc6   a impressão depois do rollback (o contraído) = a da cadeia até a 0199, parte a parte (comentarios,
--             defaults, funcoes, gatilhos, policies, views);
--   rc7       o rollback rodado de novo, sobre o banco já desfeito, dá o mesmo esquema (idempotente);
--   rc8       o só-expansão: 0200–0204 reaplicadas e o rollback de novo = a da cadeia até a 0199;
--   rc9       os 20 defaults de volta: nenhum antes (o estado contraído), vinte depois — nos dois estados (pg_depend em
--             public.empresa_legada());
--   rc10      a ferramenta de órfão: a antiga (text, text, text) existe e a nova (uuid, text, text, text) não — nos dois;
--   rc11      o ledger (supabase_migrations.schema_migrations) não é reescrito — o rollback é só catálogo.
-- Tudo dentro de begin … rollback (nada persiste). Dados: nenhum.
--
-- A régua da impressão: TODO `order by` dos string_agg é `collate "C"` — o Postgres do CI tem a colação do banco en_US
-- (que ignora pontuação na ordenação) e a mesa PGlite a `C`; ordenando por C nos dois, a constante k_antes é a MESMA
-- (sem isso, o md5 do mesmo conjunto muda de um ambiente para o outro).
-- =============================================================

begin;

create or replace function pg_temp.f67c_impressao()
returns table (parte text, md5 text, n bigint)
language sql
as $fn$
  -- as funções de public: assinatura, corpo, definer, search_path e o EXECUTE de cada papel
  select 'funcoes', md5(string_agg(x, E'\n' order by x collate "C")), count(*)
    from (select p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || p.prosecdef::text || ':'
                 || coalesce(array_to_string(p.proconfig, ','), '') || ':'
                 || has_function_privilege('anon', p.oid, 'execute')::text || ','
                 || has_function_privilege('authenticated', p.oid, 'execute')::text || ','
                 || has_function_privilege('service_role', p.oid, 'execute')::text || ','
                 || exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                             where a.grantee = 0 and a.privilege_type = 'EXECUTE')::text as x
            from pg_proc p where p.pronamespace = 'public'::regnamespace) s
  union all
  -- as policies de public e de storage. Os papéis pelo NOME, nunca `polroles::text`: são oids, e o oid de `anon`/
  -- `authenticated` muda de um banco para o outro (o CI e a mesa divergiam só nesta parte).
  select 'policies', md5(string_agg(x, E'\n' order by x collate "C")), count(*)
    from (select n.nspname || '.' || c.relname || '/' || p.polname || '/' || p.polcmd::text || '/' || p.polpermissive::text || '/'
                 || coalesce((select string_agg(case when r = 0 then 'public' else r::regrole::text end, ','
                                                order by case when r = 0 then 'public' else r::regrole::text end collate "C")
                                from unnest(p.polroles) r), '')
                 || '/' || coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '/'
                 || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as x
            from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname in ('public', 'storage')) s
  union all
  -- as views de public: a definição e as opções
  select 'views', md5(string_agg(x, E'\n' order by x collate "C")), count(*)
    from (select c.relname || ':' || md5(pg_get_viewdef(c.oid)) || ':' || coalesce(array_to_string(c.reloptions, ','), '') as x
            from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v') s
  union all
  -- os gatilhos não internos de public
  select 'gatilhos', md5(string_agg(x, E'\n' order by x collate "C")), count(*)
    from (select t.tgrelid::regclass::text || '/' || t.tgname || '/' || t.tgfoid::regprocedure::text || '/' || t.tgtype::text
                 || '/' || t.tgenabled::text as x
            from pg_trigger t join pg_class c on c.oid = t.tgrelid
           where c.relnamespace = 'public'::regnamespace and not t.tgisinternal) s
  union all
  -- os comentários das funções de public (a F67C recria 17 e a ferramenta de órfão)
  select 'comentarios', md5(string_agg(x, E'\n' order by x collate "C")), count(*)
    from (select p.oid::regprocedure::text || ':' || coalesce(md5(obj_description(p.oid, 'pg_proc')), '∅') as x
            from pg_proc p where p.pronamespace = 'public'::regnamespace) s
  union all
  -- os DEFAULTS das colunas das tabelas de public: tabela.coluna = o texto do default (a parte que prova o `set default`)
  select 'defaults', md5(string_agg(x, E'\n' order by x collate "C")), count(*)
    from (select c.relname || '.' || a.attname || '=' || pg_get_expr(d.adbin, d.adrelid) as x
            from pg_attrdef d
            join pg_class c on c.oid = d.adrelid
            join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
           where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')) s
$fn$;

create or replace function pg_temp.f67c_impressao_txt()
returns text
language sql
as $fn$
  select string_agg(parte || ':' || md5 || ':' || n, '|' order by parte collate "C") from pg_temp.f67c_impressao()
$fn$;

create or replace function pg_temp.f67c_ledger()
returns text
language sql
as $fn$
  select count(*)::text || ':' || coalesce(md5(string_agg(version::text, ',' order by version)), '∅')
    from supabase_migrations.schema_migrations
$fn$;

-- quantos defaults de coluna de public chamam public.empresa_legada() (a dependência que o pg_depend guarda)
create or replace function pg_temp.f67c_defaults_legada()
returns bigint
language sql
as $fn$
  select count(*)
    from pg_depend dep
    join pg_attrdef d on d.oid = dep.objid
   where dep.classid = 'pg_attrdef'::regclass
     and dep.refclassid = 'pg_proc'::regclass
     and dep.refobjid = 'public.empresa_legada()'::regprocedure
$fn$;

-- a ferramenta de órfão: 'antiga' = só a (text, text, text); 'nova' = só a (uuid, text, text, text); 'as duas' = as duas
create or replace function pg_temp.f67c_ferramenta_orfao()
returns text
language sql
as $fn$
  select case
           when to_regprocedure('public.registrar_limpeza_termos_sem_linha(text, text, text)') is not null
            and to_regprocedure('public.registrar_limpeza_termos_sem_linha(uuid, text, text, text)') is null then 'antiga'
           when to_regprocedure('public.registrar_limpeza_termos_sem_linha(text, text, text)') is null
            and to_regprocedure('public.registrar_limpeza_termos_sem_linha(uuid, text, text, text)') is not null then 'nova'
           when to_regprocedure('public.registrar_limpeza_termos_sem_linha(text, text, text)') is not null then 'as duas'
           else 'nenhuma'
         end
$fn$;

select pg_temp.f67c_ledger()           as ledger_antes,
       pg_temp.f67c_defaults_legada()  as defaults_antes,
       pg_temp.f67c_ferramenta_orfao() as orfao_antes
\gset

-- O CONTRAÍDO: a cadeia inteira (o estado do CI)
-- F68 (19/11/2026): a cadeia inteira tem a F68 por cima — ela sai ANTES da F67C (rollback-f68.test.ts).
\ir ../rollback/F68-desfaz.sql
\ir ../rollback/F67C-desfaz.sql

select pg_temp.f67c_impressao_txt()    as depois,
       pg_temp.f67c_defaults_legada()  as defaults_depois,
       pg_temp.f67c_ferramenta_orfao() as orfao_depois
\gset

-- rc7: de novo — o mesmo arquivo, sobre o banco já desfeito
\ir ../rollback/F67C-desfaz.sql

select pg_temp.f67c_impressao_txt() as de_novo
\gset

-- O SÓ-EXPANSÃO: as cinco migrations da expansão de volta, em cima do banco desfeito — e o rollback outra vez
\ir ../migrations/0200_escrita_empresa_anotacoes.sql
\ir ../migrations/0201_escrita_empresa_movimentacoes.sql
\ir ../migrations/0202_escrita_empresa_itens.sql
\ir ../migrations/0203_escrita_empresa_import.sql
\ir ../migrations/0204_escrita_empresa_registros.sql

select (pg_temp.f67c_ferramenta_orfao() = 'as duas')::text   as so_expansao_montado,
       pg_temp.f67c_defaults_legada()                         as defaults_so_expansao_antes
\gset

\ir ../rollback/F67C-desfaz.sql

select pg_temp.f67c_impressao_txt()    as so_expansao_depois,
       pg_temp.f67c_defaults_legada()  as defaults_so_expansao_depois,
       pg_temp.f67c_ferramenta_orfao() as orfao_so_expansao_depois,
       pg_temp.f67c_ledger()           as ledger_depois
\gset

select set_config('f67crb.depois',                      :'depois',                      false),
       set_config('f67crb.de_novo',                     :'de_novo',                     false),
       set_config('f67crb.so_expansao_montado',         :'so_expansao_montado',         false),
       set_config('f67crb.so_expansao_depois',          :'so_expansao_depois',          false),
       set_config('f67crb.ledger_antes',                :'ledger_antes',                false),
       set_config('f67crb.ledger_depois',               :'ledger_depois',               false),
       set_config('f67crb.defaults_antes',              :'defaults_antes',              false),
       set_config('f67crb.defaults_depois',             :'defaults_depois',             false),
       set_config('f67crb.defaults_so_expansao_antes',  :'defaults_so_expansao_antes',  false),
       set_config('f67crb.defaults_so_expansao_depois', :'defaults_so_expansao_depois', false),
       set_config('f67crb.orfao_antes',                 :'orfao_antes',                 false),
       set_config('f67crb.orfao_depois',                :'orfao_depois',                false),
       set_config('f67crb.orfao_so_expansao_depois',    :'orfao_so_expansao_depois',    false);

do $$
declare
  -- A impressão na cadeia até a 0199 (ordenada por parte: comentarios, defaults, funcoes, gatilhos, policies, views).
  -- MEDIDA NA MESA PGlite em 16/11/2026: o dump da cadeia 0001–0199 (antes da F67C) carregado, e o corpo das funções
  -- pg_temp.f67c_impressao()/f67c_impressao_txt() deste arquivo rodado sobre ele — sem rollback nenhum. Todo `order by`
  -- da impressão é `collate "C"`, para a constante ser a MESMA na mesa e no CI (a colação do banco do CI é en_US); e os
  -- papéis das policies vão pelo NOME (o primeiro CI, com `polroles::text`, divergiu só nas policies: oids).
  k_antes constant text :=
    'comentarios:7ecfbef0ec7ae99fff001b05f2b662a2:117|defaults:7c6c0cd5a255e35dcc902d44ba85ec46:92|'
    || 'funcoes:add3d1199f93731e5a54429751e752fe:117|gatilhos:b702fcca51f1cbe5760df8c88aa5a930:53|'
    || 'policies:1d7c641c3f635a207de6a769ba2f2b24:62|views:a38b7bf1527d5cb13f776b5e8af0b2b4:9';
  v_depois  text := current_setting('f67crb.depois');
  v_de_novo text := current_setting('f67crb.de_novo');
  v_exp     text := current_setting('f67crb.so_expansao_depois');
  v_ok      int := 0;
  v_falhas  int := 0;
  v_i       int;
  v_rotulos text[] := array[
    'rc1 os comentários das funções de public depois do rollback são os da cadeia até a 0199',
    'rc2 os defaults das colunas de public depois do rollback são os da cadeia até a 0199 (as 20 de empresa_id com empresa_legada())',
    'rc3 as funções de public depois do rollback são as da cadeia até a 0199 (corpo, definer, search_path e EXECUTE)',
    'rc4 os gatilhos de public depois do rollback são os da cadeia até a 0199',
    'rc5 as policies de public e de storage depois do rollback são as da cadeia até a 0199',
    'rc6 as views de public depois do rollback são as da cadeia até a 0199'];
begin
  -- a MEDIÇÃO: a impressão de depois do rollback, para conferir a constante k_antes
  raise notice '(medição) f67c_rollback depois: %', v_depois;

  -- rc1–rc6: parte a parte, para o rótulo dizer QUAL parte divergiu
  for v_i in 1..6 loop
    if pg_temp.assert_zero_de(v_rotulos[v_i] ||
         case when split_part(v_depois, '|', v_i) <> split_part(k_antes, '|', v_i)
              then ' — ' || split_part(v_depois, '|', v_i) || ', esperado ' || split_part(k_antes, '|', v_i) else '' end,
         case when split_part(v_depois, '|', v_i) = split_part(k_antes, '|', v_i) then 0 else 1 end, 1) then
      v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  end loop;

  if pg_temp.assert_zero_de('rc7 o rollback rodado de novo, sobre o banco já desfeito, dá o mesmo esquema (idempotente)' ||
       case when v_de_novo is distinct from v_depois then ' — ' || coalesce(v_de_novo, '∅') else '' end,
       case when v_de_novo is not distinct from v_depois then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rc8 o só-expansão (0200–0204 reaplicadas, sem a contração): o rollback devolve o esquema da cadeia até a 0199' ||
       case when current_setting('f67crb.so_expansao_montado') <> 'true' then ' — o estado só-expansão não se montou'
            when v_exp is distinct from v_depois then ' — ' || coalesce(v_exp, '∅') else '' end,
       case when current_setting('f67crb.so_expansao_montado') = 'true' and v_exp = v_depois and v_depois = k_antes then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rc9 os 20 defaults empresa_legada() voltam — nenhum antes do rollback (o contraído), vinte depois, e vinte depois do só-expansão' ||
       ' — antes ' || current_setting('f67crb.defaults_antes') || ', depois ' || current_setting('f67crb.defaults_depois') ||
       ', só-expansão antes ' || current_setting('f67crb.defaults_so_expansao_antes') ||
       ', só-expansão depois ' || current_setting('f67crb.defaults_so_expansao_depois'),
       case when current_setting('f67crb.defaults_antes') = '0'
             and current_setting('f67crb.defaults_depois') = '20'
             and current_setting('f67crb.defaults_so_expansao_antes') = '20'
             and current_setting('f67crb.defaults_so_expansao_depois') = '20' then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rc10 a ferramenta de órfão: a antiga (text, text, text) volta e a nova (uuid, text, text, text) sai — nos dois estados' ||
       ' — antes ' || current_setting('f67crb.orfao_antes') || ', depois ' || current_setting('f67crb.orfao_depois') ||
       ', só-expansão depois ' || current_setting('f67crb.orfao_so_expansao_depois'),
       case when current_setting('f67crb.orfao_antes') = 'nova'
             and current_setting('f67crb.orfao_depois') = 'antiga'
             and current_setting('f67crb.orfao_so_expansao_depois') = 'antiga' then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rc11 o ledger de migrations não é reescrito pelo rollback (as linhas da F67C ficam)' ||
       case when current_setting('f67crb.ledger_depois') is distinct from current_setting('f67crb.ledger_antes')
            then ' — antes ' || current_setting('f67crb.ledger_antes') || ', depois ' || current_setting('f67crb.ledger_depois') else '' end,
       case when current_setting('f67crb.ledger_depois') = current_setting('f67crb.ledger_antes') then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM f67c_rollback: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end
$$;

rollback;
