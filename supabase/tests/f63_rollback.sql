-- =============================================================
-- Roteiro de teste: O ROLLBACK DA F63, ENSAIADO (23/09/2026) — critério 20
-- =============================================================
-- A F63 põe `empresa_id` nas oito tabelas do acervo (0160, 0161) e cria
-- `public.backups_migration` (0159). O rollback é `supabase/rollback/F63-desfaz.sql`, na ORDEM
-- INVERSA do apply. Este roteiro RODA o arquivo de verdade (`\ir`), dentro da transação dele, e
-- prova que o esquema das tabelas tocadas VOLTA ao de antes da 0159:
--   rb0 — antes do rollback, as oito TÊM a coluna (a fixture é o próprio banco do CI, com a
--         cadeia inteira aplicada — sem isto, "sumiu" seria "nunca esteve");
--   rb1 — depois do rollback, nenhuma das oito tem `empresa_id` visível (a coluna apagada fica no
--         `pg_attribute` com `attisdropped` — é assim que o Postgres apaga, e não conta);
--   rb2 — `backups_migration` não existe mais;
--   rb3 — a IMPRESSÃO DO ESQUEMA das oito (colunas visíveis, constraints, gatilhos, índices,
--         policies, RLS/force) depois do rollback é IGUAL à do Postgres do CI ANTES da 0159 — a
--         constante abaixo, medida no push das travas vermelhas (PR da F63), que ainda não
--         tinha as migrations da fase;
--   rb4 — e é igual à impressão de ANTES do rollback menos o que a F63 declarou (as linhas que
--         citam `empresa_id`): o rollback tira exatamente o que a fase pôs, e nada mais.
-- Os resultados atravessam o `\ir` como variáveis do psql (`\gset`). DADOS: nenhum — é só
-- catálogo. Tudo dentro de `begin; … rollback;`: nada do rollback ensaiado sobra no banco.
--
-- ⚠ ESTE ENSAIO VALE ENQUANTO A F63 FOR A ÚLTIMA FASE A MEXER NESTAS OITO TABELAS. A fase que
-- mexer nelas depois (a F65, com a FK composta e os uniques por empresa) roda o rollback DELA
-- antes do `\ir` abaixo — a ordem inversa entre fases, a mesma que `f62_rollback.sql` passou a
-- seguir com o rollback da F63. Desde a F64 (23/09/2026) o rollback dela roda antes do da F63
-- aqui, pela mesma regra.
-- =============================================================

begin;

-- A impressão do esquema das oito, por catálogo. `p_sem_f63` tira as linhas que citam
-- `empresa_id` (a coluna, a FK) — o que a F63 declarou pôr.
create function pg_temp.f63_impressao_esquema(p_sem_f63 boolean) returns text
language sql as $f$
  with k_oito(tabela) as (
    select unnest(array['anotacoes', 'ativos', 'colaboradores', 'itens', 'lancamentos_item',
                        'movimentacoes', 'pendencias_item', 'termos_gerados'])
  ), rel as (
    select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c join k_oito k on k.tabela = c.relname
     where c.relnamespace = 'public'::regnamespace
  ), linhas(linha) as (
    select 'col|' || r.relname || '|' || a.attname || '|' || format_type(a.atttypid, a.atttypmod) || '|' ||
           a.attnotnull::text || '|' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-')
      from rel r
      join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
      left join pg_attrdef d on d.adrelid = r.oid and d.adnum = a.attnum
    union all
    select 'con|' || r.relname || '|' || k.conname || '|' || pg_get_constraintdef(k.oid) || '|' || k.convalidated::text
      from rel r join pg_constraint k on k.conrelid = r.oid
    union all
    select 'trg|' || r.relname || '|' || t.tgname || '|' || pg_get_triggerdef(t.oid) || '|' || t.tgenabled::text
      from rel r join pg_trigger t on t.tgrelid = r.oid and not t.tgisinternal
    union all
    select 'idx|' || r.relname || '|' || pg_get_indexdef(i.indexrelid)
      from rel r join pg_index i on i.indrelid = r.oid
    union all
    select 'pol|' || p.tablename || '|' || p.policyname || '|' || p.cmd || '|' || coalesce(p.qual, '-') || '|' || coalesce(p.with_check, '-')
      from pg_policies p join k_oito k on k.tabela = p.tablename
     where p.schemaname = 'public'
    union all
    select 'tab|' || r.relname || '|rls=' || r.relrowsecurity::text || '|force=' || r.relforcerowsecurity::text
      from rel r
  )
  select md5(coalesce(string_agg(linha, E'\n' order by linha), ''))
    from linhas
   where not (p_sem_f63 and linha ~ '\mempresa_id\M')
$f$;

create function pg_temp.f63_colunas_visiveis() returns bigint
language sql as $f$
  select count(*)
    from pg_attribute a join pg_class c on c.oid = a.attrelid
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('anotacoes', 'ativos', 'colaboradores', 'itens', 'lancamentos_item',
                       'movimentacoes', 'pendencias_item', 'termos_gerados')
     and a.attname = 'empresa_id' and not a.attisdropped
$f$;

-- F65 (23/09/2026): a F65 sai primeiro, e ANTES da medição "antes" — ela pendura FKs compostas, uniques por empresa e
-- o gatilho `UPDATE OF empresa_id` nas colunas que os rollbacks da F64 e da F63 derrubam (sem ela fora, o `drop column`
-- recusa pela dependência), e TROCA objetos das oito mantendo o nome (o "antes sem a F63" tem de ser o estado que a F63
-- e a F64 deixaram). O que este roteiro prova não muda.
\ir ../rollback/F65-desfaz.sql

select pg_temp.f63_impressao_esquema(true)  as antes_sem_f63,
       pg_temp.f63_colunas_visiveis()       as colunas_antes
\gset

-- F64 (23/09/2026): a fase de DEPOIS sai primeiro — o inverso do apply ENTRE fases (regra 10 da §4
-- do PLANO-MULTIEMPRESA). A F64 não toca as oito (põe a coluna nas onze do lote 2 e o gatilho do
-- kit), então o que este roteiro prova não muda; é a ordem que o RUNBOOK manda para desfazer a F63
-- num banco que já tem a F64. (A F65 saiu antes da medição "antes", logo acima.)
\ir ../rollback/F64-desfaz.sql
\ir ../rollback/F63-desfaz.sql

select pg_temp.f63_impressao_esquema(false) as depois,
       pg_temp.f63_colunas_visiveis()       as colunas_depois,
       (to_regclass('public.backups_migration') is null)::text as sem_backups
\gset

select set_config('f63rb.antes_sem_f63', :'antes_sem_f63',  false),
       set_config('f63rb.colunas_antes', :'colunas_antes',  false),
       set_config('f63rb.depois',        :'depois',         false),
       set_config('f63rb.colunas_depois', :'colunas_depois', false),
       set_config('f63rb.sem_backups',   :'sem_backups',    false);

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;
  -- A IMPRESSÃO DO CI ANTES DA 0159: medida no push das travas vermelhas da F63 (PR #72, run
  -- 35865427382, commit 8a8b3d7 — a cadeia até a 0158, este mesmo roteiro, este mesmo
  -- `F63-desfaz.sql` rodando em vazio). Ver
  -- `docs/f63-evidencias/B-travas/catalogo-e-rollback-vermelho-ci.txt`.
  k_pre_0159   constant text := 'c533eeff15f4196c2f8a5ec4721ff570';
  v_antes_sem  text := current_setting('f63rb.antes_sem_f63');
  v_depois     text := current_setting('f63rb.depois');
  v_col_antes  bigint := current_setting('f63rb.colunas_antes')::bigint;
  v_col_depois bigint := current_setting('f63rb.colunas_depois')::bigint;
  v_sem_bkp    boolean := current_setting('f63rb.sem_backups')::boolean;
begin
  raise notice '(medição) impressão do esquema das oito DEPOIS do rollback: % · antes, sem o que a F63 declarou: %', v_depois, v_antes_sem;

  if pg_temp.assert_zero_de('rb0 antes do rollback, as oito tabelas do acervo TÊM empresa_id visível' ||
       case when v_col_antes <> 8 then ' — só ' || v_col_antes || ' de 8' else '' end,
       8 - v_col_antes, 8) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb1 depois do rollback, nenhuma das oito tem empresa_id visível' ||
       case when v_col_depois > 0 then ' — sobrou em ' || v_col_depois else '' end,
       v_col_depois, 8) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb2 depois do rollback, public.backups_migration não existe',
       case when v_sem_bkp then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb3 o esquema das oito depois do rollback é o do CI antes da 0159' ||
       case when v_depois <> k_pre_0159 then ' — impressão ' || v_depois || ', esperada ' || k_pre_0159 else '' end,
       case when v_depois = k_pre_0159 then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb4 o rollback tira exatamente o que a F63 declarou (antes sem empresa_id = depois)' ||
       case when v_depois <> v_antes_sem then ' — depois ' || v_depois || ', antes sem a F63 ' || v_antes_sem else '' end,
       case when v_depois = v_antes_sem then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM f63_rollback: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
