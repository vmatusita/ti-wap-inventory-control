-- =====================================================================================================================
-- Roteiro de teste: O ROLLBACK DA F68 (19/11/2026) — supabase/rollback/F68-desfaz.sql
-- =====================================================================================================================
-- O QUE PROVA, no banco do CI (a cadeia inteira, COM a F68):
--   rb0 antes: os nove objetos da F68 existem (as seis funções, as duas tabelas, a unique da 0208);
--   rb1 depois do F68-desfaz.sql: o catálogo inteiro de public (funções com corpo, definer, search_path e EXECUTE;
--       tabelas, colunas, constraints, índices, gatilhos, grants de tabela, comentários) e as policies de public e storage
--       são EXATAMENTE os de antes MENOS os nove — isto é, a impressão da cadeia até a 0207 (a F68 só ACRESCENTOU);
--   rb2 nenhum dos nove sobrou;
--   rb3 rodar de novo é igual a rodar uma vez (idempotente);
--   rb4 reaplicar 0208–0212 devolve o catálogo de antes, byte a byte (a impressão completa igual à de antes);
--   rb5 as linhas de senhas_acesso não mudam em nenhum passo (md5 das linhas);
--   rb6 o ledger não é reescrito.
--
-- Por que SEM constante medida (o molde das F62–F67C usava a impressão da cadeia anterior, medida numa mesa): o md5 do
-- `prosrc` difere entre a mesa (PGlite) e o CI para a MESMA cadeia (memória da F65/F67C). Aqui a régua é o PRÓPRIO
-- banco: a impressão de antes, sem os nove objetos, comparada com a de depois — a mesma prova ("devolve a impressão de
-- antes da 0208"), sem uma constante que só valeria num dos dois ambientes.
--
-- ⚠ A ordem real em produção é outra e está no cabeçalho do F68-desfaz.sql: o revert do app e o deploy ANTES.
-- Tudo dentro de begin; … rollback;
-- =====================================================================================================================

begin;

create function pg_temp.f68_impressao(p_sem_f68 boolean) returns text
language sql as $f$
  with
  fn as (select unnest(array['relatorio_publico_abrir', 'relatorio_publico_dados', 'relatorio_publico_projetar',
                             'senha_acesso_criar', 'senha_acesso_conferir', 'senha_acesso_definir_status']) as nome),
  tb as (select unnest(array['sessoes_visualizador', 'porta_tentativas']) as nome),
  ct as (select unnest(array['senhas_acesso_empresa_id_uidx']) as nome),
  funcoes as (
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')|' || md5(p.prosrc) || '|' ||
           p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '') || '|' ||
           has_function_privilege('anon', p.oid, 'EXECUTE')::text || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text ||
           has_function_privilege('service_role', p.oid, 'EXECUTE')::text || '|' ||
           md5(coalesce(obj_description(p.oid, 'pg_proc'), '')) as x
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and not (p_sem_f68 and p.proname in (select nome from fn))),
  tabelas as (
    select c.relname || '|' || c.relkind::text || '|' || c.relrowsecurity::text || '|' ||
           has_table_privilege('anon', c.oid, 'SELECT')::text || has_table_privilege('authenticated', c.oid, 'SELECT')::text ||
           has_table_privilege('service_role', c.oid, 'SELECT')::text as x
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
       and not (p_sem_f68 and c.relname in (select nome from tb))),
  colunas as (
    select c.relname || '.' || a.attname || '|' || format_type(a.atttypid, a.atttypmod) || '|' || a.attnotnull::text ||
           '|' || md5(coalesce(pg_get_expr(d.adbin, d.adrelid), '')) as x
      from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
       and not (p_sem_f68 and c.relname in (select nome from tb))),
  restricoes as (
    select c.relname || '|' || k.conname || '|' || md5(pg_get_constraintdef(k.oid)) as x
      from pg_constraint k join pg_class c on c.oid = k.conrelid
     where c.relnamespace = 'public'::regnamespace
       and not (p_sem_f68 and (c.relname in (select nome from tb) or k.conname in (select nome from ct)))),
  indices as (
    select c.relname || '|' || i.relname as x
      from pg_index x0 join pg_class i on i.oid = x0.indexrelid join pg_class c on c.oid = x0.indrelid
     where c.relnamespace = 'public'::regnamespace
       and not (p_sem_f68 and (c.relname in (select nome from tb) or i.relname in (select nome from ct)))),
  gatilhos as (
    select c.relname || '|' || t.tgname || '|' || md5(pg_get_triggerdef(t.oid)) as x
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
       and not (p_sem_f68 and c.relname in (select nome from tb))),
  policies as (
    select pol.schemaname || '.' || pol.tablename || '|' || pol.policyname || '|' || pol.cmd || '|' ||
           array_to_string(pol.roles, ',') || '|' || md5(coalesce(pol.qual, '')) || '|' || md5(coalesce(pol.with_check, '')) as x
      from pg_policies pol
     where pol.schemaname in ('public', 'storage'))
  select string_agg(parte, ' | ' order by parte collate "C")
    from (
      select 'funcoes:' || md5(coalesce(string_agg(x, ';' order by x collate "C"), '')) || ':' || count(*) as parte from funcoes
      union all select 'tabelas:' || md5(coalesce(string_agg(x, ';' order by x collate "C"), '')) || ':' || count(*) from tabelas
      union all select 'colunas:' || md5(coalesce(string_agg(x, ';' order by x collate "C"), '')) || ':' || count(*) from colunas
      union all select 'restricoes:' || md5(coalesce(string_agg(x, ';' order by x collate "C"), '')) || ':' || count(*) from restricoes
      union all select 'indices:' || md5(coalesce(string_agg(x, ';' order by x collate "C"), '')) || ':' || count(*) from indices
      union all select 'gatilhos:' || md5(coalesce(string_agg(x, ';' order by x collate "C"), '')) || ':' || count(*) from gatilhos
      union all select 'policies:' || md5(coalesce(string_agg(x, ';' order by x collate "C"), '')) || ':' || count(*) from policies
    ) partes
$f$;

-- os nove objetos da F68 (as seis funções, as duas tabelas, a unique)
create function pg_temp.f68_objetos() returns int
language sql as $f$
  select (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
             and p.proname in ('relatorio_publico_abrir', 'relatorio_publico_dados', 'relatorio_publico_projetar',
                               'senha_acesso_criar', 'senha_acesso_conferir', 'senha_acesso_definir_status'))::int
       + (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace
             and c.relname in ('sessoes_visualizador', 'porta_tentativas') and c.relkind = 'r')::int
       + (select count(*) from pg_constraint k where k.conname = 'senhas_acesso_empresa_id_uidx')::int
$f$;

create function pg_temp.f68_senhas() returns text
language sql as $f$
  select md5(coalesce(string_agg(md5(t::text), '' order by t.id), '')) from public.senhas_acesso t
$f$;

-- o ANTES
select set_config('f68rb.antes_sem', pg_temp.f68_impressao(true), true),
       set_config('f68rb.antes_com', pg_temp.f68_impressao(false), true),
       set_config('f68rb.n_antes', pg_temp.f68_objetos()::text, true),
       set_config('f68rb.senhas_antes', pg_temp.f68_senhas(), true),
       set_config('f68rb.ledger_antes', (select count(*) from supabase_migrations.schema_migrations)::text, true);

-- o rollback
\ir ../rollback/F68-desfaz.sql
select set_config('f68rb.depois1', pg_temp.f68_impressao(false), true),
       set_config('f68rb.n_depois1', pg_temp.f68_objetos()::text, true),
       set_config('f68rb.senhas_depois1', pg_temp.f68_senhas(), true);

-- de novo (idempotente)
\ir ../rollback/F68-desfaz.sql
select set_config('f68rb.depois2', pg_temp.f68_impressao(false), true);

-- a reaplicação das cinco
\ir ../migrations/0208_porta_base.sql
\ir ../migrations/0209_porta_sessoes.sql
\ir ../migrations/0210_porta_tentativas.sql
\ir ../migrations/0211_porta_gestao_senhas.sql
\ir ../migrations/0212_porta_publica.sql
select set_config('f68rb.reaplicado_com', pg_temp.f68_impressao(false), true),
       set_config('f68rb.n_reaplicado', pg_temp.f68_objetos()::text, true),
       set_config('f68rb.senhas_depois2', pg_temp.f68_senhas(), true),
       set_config('f68rb.ledger_depois', (select count(*) from supabase_migrations.schema_migrations)::text, true);

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;
begin
  raise notice '(medição) a impressão da cadeia SEM os nove objetos da F68: %', current_setting('f68rb.antes_sem');
  if pg_temp.assert_zero_de('rb0 antes do rollback, os nove objetos da F68 existem (seis funções, duas tabelas, a unique)',
       (current_setting('f68rb.n_antes')::int <> 9)::int, 1) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('rb1 depois do F68-desfaz, o catálogo de public e as policies são EXATAMENTE os de antes menos os nove (a impressão da cadeia até a 0207)' ||
       case when current_setting('f68rb.depois1') <> current_setting('f68rb.antes_sem')
            then ' — depois: ' || current_setting('f68rb.depois1') || ' · esperado: ' || current_setting('f68rb.antes_sem') else '' end,
       (current_setting('f68rb.depois1') <> current_setting('f68rb.antes_sem'))::int, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('rb2 nenhum dos nove objetos da F68 sobrou depois do rollback',
       current_setting('f68rb.n_depois1')::int, 9) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('rb3 rodar o F68-desfaz de novo é igual a rodar uma vez (idempotente)',
       (current_setting('f68rb.depois2') <> current_setting('f68rb.depois1'))::int, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('rb4 reaplicar 0208–0212 devolve o catálogo de antes, byte a byte (e os nove objetos)',
       (current_setting('f68rb.reaplicado_com') <> current_setting('f68rb.antes_com'))::int
       + (current_setting('f68rb.n_reaplicado')::int <> 9)::int, 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('rb5 as linhas de senhas_acesso não mudam (o rollback e a reaplicação não tocam senha nenhuma)',
       (current_setting('f68rb.senhas_depois1') <> current_setting('f68rb.senhas_antes'))::int
       + (current_setting('f68rb.senhas_depois2') <> current_setting('f68rb.senhas_antes'))::int, 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('rb6 o ledger não é reescrito (nem pelo rollback, nem pela reaplicação)',
       (current_setting('f68rb.ledger_depois') <> current_setting('f68rb.ledger_antes'))::int, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  raise notice 'FIM f68_rollback: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
