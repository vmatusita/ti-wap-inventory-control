-- =============================================================
-- Roteiro de teste: O ROLLBACK DA F64, ENSAIADO (23/09/2026) — a sabotagem H (critério 19)
-- =============================================================
-- A F64 põe `empresa_id` nas onze tabelas do lote 2 (0162, 0163) e cria o gatilho do kit com a
-- 13ª peça do núcleo (0164). O rollback é `supabase/rollback/F64-desfaz.sql`, na ORDEM INVERSA do
-- apply. Este roteiro RODA o arquivo de verdade (`\ir`), dentro da transação dele, e prova que o
-- esquema das tabelas tocadas VOLTA ao de antes da 0162:
--   rb0 — antes do rollback, as onze TÊM a coluna, e o gatilho e a função do kit existem (a fixture
--         é o próprio banco do CI, com a cadeia inteira aplicada — sem isto, "sumiu" seria "nunca
--         esteve");
--   rb1 — depois do rollback, nenhuma das onze tem `empresa_id` visível (a coluna apagada fica no
--         `pg_attribute` com `attisdropped` — é assim que o Postgres apaga, e não conta);
--   rb2 — o gatilho e a função do kit sumiram, e `checagens_integridade_nucleo()` voltou ao corpo da
--         0158 (o md5 do `prosrc` é o dos dois bancos antes da F64, 06359abd…);
--   rb3 — a IMPRESSÃO DO ESQUEMA das onze (colunas visíveis, constraints, gatilhos, índices,
--         policies, RLS/force) mais o md5 do núcleo e da função do kit, depois do rollback, é IGUAL
--         à do Postgres do CI ANTES da 0162 — a constante abaixo, medida no push das travas
--         vermelhas da F64, que ainda não tinha as migrations (e rodava este mesmo arquivo em vazio);
--   rb4 — e é igual à impressão de ANTES do rollback menos o que a F64 declarou (as linhas que
--         citam `empresa_id` e as das duas funções): o rollback tira exatamente o que a fase pôs.
-- Os resultados atravessam o `\ir` como variáveis do psql (`\gset`). DADOS: nenhum — é só catálogo.
-- Tudo dentro de `begin; … rollback;`: nada do rollback ensaiado sobra no banco.
--
-- ⚠ ESTE ENSAIO VALE ENQUANTO A F64 FOR A ÚLTIMA FASE A MEXER NESTAS ONZE TABELAS. A fase que
-- mexer nelas depois (a F65: as PKs por empresa de `motivos` e do vocabulário do import, os uniques
-- por empresa) roda o rollback DELA antes do `\ir` abaixo — a ordem inversa entre fases, a mesma que
-- `f63_rollback.sql` e `f62_rollback.sql` passaram a seguir com o rollback da F64.
-- =============================================================

begin;

-- A impressão do esquema das onze, por catálogo, mais o md5 do corpo das duas funções que a F64
-- cria ou recria. `p_sem_f64` tira o que a F64 declarou pôr: as linhas que citam `empresa_id` (a
-- coluna, a FK, o gatilho `update of payload, empresa_id`) e as das duas funções.
create function pg_temp.f64_impressao_esquema(p_sem_f64 boolean) returns text
language sql as $f$
  with k_onze(tabela) as (
    select unnest(array['eventos_admin', 'import_logs', 'import_prefixos_patrimonio', 'import_termos_categoria',
                        'import_termos_estado', 'kits_modelos', 'motivos', 'relatorios_gerados', 'senhas_acesso',
                        'tipos_item', 'unidades_apelidos'])
  ), rel as (
    select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c join k_onze k on k.tabela = c.relname
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
      from pg_policies p join k_onze k on k.tabela = p.tablename
     where p.schemaname = 'public'
    union all
    select 'tab|' || r.relname || '|rls=' || r.relrowsecurity::text || '|force=' || r.relforcerowsecurity::text
      from rel r
    union all
    select 'fn|' || p.proname || '|' || md5(p.prosrc)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('checagens_integridade_nucleo', 'kit_motivo_da_empresa')
  )
  select md5(coalesce(string_agg(linha, E'\n' order by linha), ''))
    from linhas
   where not (p_sem_f64 and (linha ~ '\mempresa_id\M' or linha ~ '^fn\|'))
$f$;

create function pg_temp.f64_colunas_visiveis() returns bigint
language sql as $f$
  select count(*)
    from pg_attribute a join pg_class c on c.oid = a.attrelid
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('eventos_admin', 'import_logs', 'import_prefixos_patrimonio', 'import_termos_categoria',
                       'import_termos_estado', 'kits_modelos', 'motivos', 'relatorios_gerados', 'senhas_acesso',
                       'tipos_item', 'unidades_apelidos')
     and a.attname = 'empresa_id' and not a.attisdropped
$f$;

-- O kit: o gatilho e a função existem (2 = os dois).
create function pg_temp.f64_kit_existe() returns bigint
language sql as $f$
  select (select count(*) from pg_trigger t
           where t.tgrelid = 'public.kits_modelos'::regclass and t.tgname = 'kits_modelos_motivo_da_empresa')
       + (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'kit_motivo_da_empresa')
$f$;

select pg_temp.f64_impressao_esquema(true)  as antes_sem_f64,
       pg_temp.f64_colunas_visiveis()       as colunas_antes,
       pg_temp.f64_kit_existe()             as kit_antes
\gset

\ir ../rollback/F64-desfaz.sql

select pg_temp.f64_impressao_esquema(false) as depois,
       pg_temp.f64_impressao_esquema(true)  as depois_sem_f64,
       pg_temp.f64_colunas_visiveis()       as colunas_depois,
       pg_temp.f64_kit_existe()             as kit_depois,
       (select md5(p.prosrc) from pg_proc p where p.oid = 'public.checagens_integridade_nucleo()'::regprocedure) as nucleo_depois
\gset

select set_config('f64rb.antes_sem_f64',  :'antes_sem_f64',  false),
       set_config('f64rb.colunas_antes',  :'colunas_antes',  false),
       set_config('f64rb.kit_antes',      :'kit_antes',      false),
       set_config('f64rb.depois',         :'depois',         false),
       set_config('f64rb.depois_sem_f64', :'depois_sem_f64', false),
       set_config('f64rb.colunas_depois', :'colunas_depois', false),
       set_config('f64rb.kit_depois',     :'kit_depois',     false),
       set_config('f64rb.nucleo_depois',  :'nucleo_depois',  false);

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;
  -- A IMPRESSÃO DO CI ANTES DA 0162: medida no push das travas vermelhas da F64 (PR #75, run
  -- 35894254468, commit 6f3a38c — a cadeia até a 0161, este mesmo roteiro, este mesmo
  -- `F64-desfaz.sql` rodando em vazio). Ver
  -- `docs/f64-evidencias/B-travas/catalogo-kit-rollback-vermelho-ci.txt`.
  k_pre_0162   constant text := '9ab2b820d7cdaa5d46cd6e9f17424054';
  -- O md5 do `prosrc` de checagens_integridade_nucleo() na 0158 — o dos dois bancos antes da F64.
  k_nucleo_0158 constant text := '06359abd286206bde8432609128ebccd';
  v_antes_sem  text := current_setting('f64rb.antes_sem_f64');
  v_depois     text := current_setting('f64rb.depois');
  v_depois_sem text := current_setting('f64rb.depois_sem_f64');
  v_col_antes  bigint := current_setting('f64rb.colunas_antes')::bigint;
  v_col_depois bigint := current_setting('f64rb.colunas_depois')::bigint;
  v_kit_antes  bigint := current_setting('f64rb.kit_antes')::bigint;
  v_kit_depois bigint := current_setting('f64rb.kit_depois')::bigint;
  v_nucleo     text := current_setting('f64rb.nucleo_depois');
begin
  raise notice '(medição) impressão do esquema das onze DEPOIS do rollback: % · antes, sem o que a F64 declarou: % · depois, sem: %',
    v_depois, v_antes_sem, v_depois_sem;

  if pg_temp.assert_zero_de('rb0 antes do rollback, as onze tabelas do lote 2 TÊM empresa_id visível, e o gatilho e a função do kit existem' ||
       case when v_col_antes <> 11 or v_kit_antes <> 2 then ' — colunas ' || v_col_antes || ' de 11, kit ' || v_kit_antes || ' de 2' else '' end,
       (11 - least(v_col_antes, 11)) + (2 - least(v_kit_antes, 2)), 13) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb1 depois do rollback, nenhuma das onze tem empresa_id visível' ||
       case when v_col_depois > 0 then ' — sobrou em ' || v_col_depois else '' end,
       v_col_depois, 11) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb2 depois do rollback, o gatilho e a função do kit sumiram, e o núcleo voltou ao corpo da 0158' ||
       case when v_kit_depois > 0 or v_nucleo is distinct from k_nucleo_0158
            then ' — kit ' || v_kit_depois || ', núcleo ' || coalesce(v_nucleo, '∅') else '' end,
       v_kit_depois + (case when v_nucleo = k_nucleo_0158 then 0 else 1 end), 3) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb3 o esquema das onze (e as duas funções) depois do rollback é o do CI antes da 0162' ||
       case when v_depois <> k_pre_0162 then ' — impressão ' || v_depois || ', esperada ' || k_pre_0162 else '' end,
       case when v_depois = k_pre_0162 then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb4 o rollback tira exatamente o que a F64 declarou (antes sem a F64 = depois sem a F64)' ||
       case when v_depois_sem <> v_antes_sem then ' — depois ' || v_depois_sem || ', antes ' || v_antes_sem else '' end,
       case when v_depois_sem = v_antes_sem then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM f64_rollback: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
