-- =============================================================================
-- impressao-schema.sql — a impressão digital do schema, por classe (F46, 06/09/2026)
-- =============================================================================
-- ⚠ ESTE ARQUIVO NÃO É NOVO. É a **sonda de paridade** que já vive em
-- `docs/RUNBOOK-BANCO.md` § "Sonda de paridade ensaio × produção (use ESTA — a crua engana)",
-- a mesma que a F19 usou para provar paridade entre ensaio e produção. Ela vem para o
-- repositório como arquivo executável porque o job `banco-sem-docker` a roda a cada CI.
--
-- POR QUE ELA EXISTE NO JOB, E O QUE ELA SUBSTITUI.
--
-- A ficha da F46 pedia "aplicar as migrations de novo, provando idempotência". Medido antes de
-- decidir, isso é impossível neste repositório, e não por pouco: a segunda passada morre na
-- PRIMEIRA migration — `0001_profiles.sql` abre com `create table public.profiles (` sem
-- `if not exists` (42P07). As 126 foram escritas para rodar UMA vez; são 69 `create policy` sem
-- `drop … if exists`, 45 `create index` sem `if not exists`, 7 `create type`, 7 `create trigger`,
-- 4 `create view` sem `or replace`. Torná-las idempotentes é EDITAR MIGRATION APLICADA — o que a
-- trava de hash desta mesma fase passa a proibir no mesmo commit.
--
-- Então a fase trocou o critério, como a ordem autoriza (opção "c"), pela pergunta que "aplicar
-- duas vezes" tentava responder de verdade: **a cadeia produz sempre o mesmo schema?**
--
-- O job aplica as 126 do zero em DOIS bancos limpos e independentes e compara estas linhas.
-- Divergência REPROVA o passo. É determinismo, não idempotência — e a substituição está
-- registrada em `docs/DECISOES.md` e no relatório da fase, com a medição que a sustenta.
--
-- ⚠ AS DUAS CICATRIZES QUE JÁ ESTÃO EMBUTIDAS NESTA SONDA, e por isso ela e não uma nova:
--   1. `regexp_replace(…, '\s+', ' ', 'g')` em toda definição. A forma CRUA
--      (`md5(pg_get_functiondef(oid))`) deu falso-positivo em 25/07/2026: apontou
--      `criar_compra_lote` como divergente entre ensaio e produção, e a diferença era só o FIM DE
--      LINHA (CRLF vs LF — 1.664 vs 1.617 bytes, exatamente os 47 `\r`). Fim de linha depende de
--      COMO o SQL foi aplicado, não do que ele faz.
--   2. O filtro `not like '\_%'`, que exclui as tabelas de backup ad-hoc — elas existem só em
--      produção, por construção.
--
-- Saída: uma linha por classe, `classe|objetos|fp_classe`. A contagem por classe também é
-- diagnóstico útil no log do CI (comparável com a registrada no `RUNBOOK-BANCO.md`).
-- =============================================================================

with
funcs as (
  select 'func' classe, p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' obj,
         md5(regexp_replace(pg_get_functiondef(p.oid),'\s+',' ','g')||p.prosecdef::text||p.provolatile::text) fp
  from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'),
cols as (
  select 'coluna', c.table_name||'.'||c.column_name,
         md5(c.data_type||c.is_nullable||coalesce(regexp_replace(c.column_default,'\s+',' ','g'),'-')||coalesce(c.character_maximum_length::text,'-'))
  from information_schema.columns c where c.table_schema='public' and c.table_name not like '\_%'),
cons as (
  select 'constraint', conrelid::regclass::text||'.'||conname,
         md5(regexp_replace(pg_get_constraintdef(oid),'\s+',' ','g'))
  from pg_constraint where connamespace='public'::regnamespace),
idx as (
  select 'indice', indexname, md5(regexp_replace(indexdef,'\s+',' ','g'))
  from pg_indexes where schemaname='public'),
pol as (
  select 'policy', tablename||'.'||policyname,
         md5(cmd||roles::text||coalesce(regexp_replace(qual,'\s+',' ','g'),'-')||coalesce(regexp_replace(with_check,'\s+',' ','g'),'-')||permissive::text)
  from pg_policies where schemaname='public'),
vws as (
  select 'view', c.relname,
         md5(regexp_replace(pg_get_viewdef(c.oid,true),'\s+',' ','g')||coalesce(c.reloptions::text,'-'))
  from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relkind='v'),
enums as (
  select 'enum', t.typname, md5(string_agg(e.enumlabel, ',' order by e.enumsortorder))
  from pg_type t join pg_enum e on e.enumtypid=t.oid
  join pg_namespace ns on ns.oid=t.typnamespace where ns.nspname='public' group by t.typname),
trg as (
  select 'trigger', c.relname||'.'||t.tgname, md5(regexp_replace(pg_get_triggerdef(t.oid),'\s+',' ','g'))
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and not t.tgisinternal),
rls as (
  select 'rls_flag', c.relname, md5(c.relrowsecurity::text||c.relforcerowsecurity::text)
  from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
  where ns.nspname='public' and c.relkind='r' and c.relname not like '\_%'),
grants as (
  select 'grant_func', p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
         md5(has_function_privilege('anon',p.oid,'execute')::text
           ||has_function_privilege('authenticated',p.oid,'execute')::text
           ||has_function_privilege('service_role',p.oid,'execute')::text)
  from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'),
-- As policies de `storage.objects` também entram: são 8, criadas por `0021`/`0031` e reescritas
-- por `0066`/`0069`/`0070`/`0072`, e ficariam fora de um recorte que só olha `public`.
pol_storage as (
  select 'policy_storage', tablename||'.'||policyname,
         md5(cmd||roles::text||coalesce(regexp_replace(qual,'\s+',' ','g'),'-')||coalesce(regexp_replace(with_check,'\s+',' ','g'),'-')||permissive::text)
  from pg_policies where schemaname='storage'),
tudo as (
  select * from funcs union all select * from cols union all select * from cons
  union all select * from idx union all select * from pol union all select * from vws
  union all select * from enums union all select * from trg union all select * from rls
  union all select * from grants union all select * from pol_storage)
select classe, count(*) as objetos, md5(string_agg(obj||'='||fp,'|' order by obj)) as fp_classe
from tudo group by classe order by classe;
