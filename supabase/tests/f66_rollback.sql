-- =============================================================
-- Roteiro de teste: O ROLLBACK DA F66, ENSAIADO (24/09/2026) — a sabotagem K (critério 19 da ordem)
-- =============================================================
-- A F66 reescreve 51 policies de `public` (o termo de empresa em conjunção com o piso; os pares de unidade no lugar de
-- `pode_escrever_filial`) e recria as duas `rel_*` que juntam `motivos` — 0175 → 0179. O rollback é
-- `supabase/rollback/F66-desfaz.sql`, na ORDEM INVERSA do apply, idempotente em qualquer estado intermediário. Este roteiro
-- RODA o arquivo de verdade (`\ir`), dentro da transação dele, DUAS vezes, e prova:
--   rb0 — antes do rollback, o que a F66 pôs existe: as 51 citam uma função de conjunto, nenhuma chama
--         `pode_escrever_filial`, e as duas `rel_*` juntam pelo par — sem isto, "sumiu" seria "nunca esteve";
--   rb1 — depois do rollback, nada da F66 sobrou: nenhuma policy cita função de conjunto, as seis de unidade voltaram a
--         `pode_escrever_filial`, e nenhuma `rel_*` lê `mo.empresa_id`;
--   rb2 — as duas `rel_*` voltaram ao corpo da 0143: o md5 do `prosrc` é o do "antes" dos DOIS bancos vivos (medido pela
--         Frente A da F66, docs/f66-evidencias/antes/catalogo-*.json — o mesmo nos dois);
--   rb3 — a IMPRESSÃO DAS POLICIES depois do rollback é a do "antes" dos dois bancos vivos: o md5 `vivas` de
--         docs/f66-evidencias/impressao-policies.sql (tabela|policy|comando|papéis|permissiva|qual|with_check, por
--         schema), 54 em `public` e 8 em Storage — a régua é INDEPENDENTE do rollback (medida antes de qualquer apply);
--   rb4 — as 11 policies que a F66 não toca (Storage e as três sem `empresa_id`) são as mesmas antes e depois do
--         rollback, e as do "antes" vivo: o rollback não mexe no que a fase não mexeu;
--   rb5 — rodar o rollback DE NOVO não muda nada (a impressão e os corpos são os mesmos): idempotente.
-- Os resultados atravessam o `\ir` como variáveis do psql (`\gset`). DADOS: nenhum — é só catálogo.
-- Tudo dentro de `begin; … rollback;`: nada do rollback ensaiado sobra no banco.
--
-- ⚠ ESTE ENSAIO VALE ENQUANTO A F66 FOR A ÚLTIMA FASE A MEXER NESTAS POLICIES. A fase que mexer nelas depois roda o
-- rollback DELA antes do `\ir` abaixo — a ordem inversa entre fases, a que `f65_rollback.sql`, `f64_rollback.sql`,
-- `f63_rollback.sql` e `f62_rollback.sql` passaram a seguir com o rollback da F66.
-- =============================================================

begin;

-- A impressão de docs/f66-evidencias/impressao-policies.sql, por schema (o `vivas`), e a das 11 que a F66 não toca.
create function pg_temp.f66_vivas(p_schema text) returns text
language sql as $f$
  select md5(string_agg(p.tablename || '|' || p.policyname || '|' || p.cmd || '|' || p.roles::text || '|' ||
                        p.permissive || '|' || coalesce(p.qual, '-') || '|' || coalesce(p.with_check, '-'), E'\n'
                        order by p.tablename, p.policyname))
    from pg_policies p
   where p.schemaname = p_schema
$f$;

create function pg_temp.f66_as_11() returns text
language sql as $f$
  select md5(string_agg(p.schemaname || '|' || p.tablename || '|' || p.policyname || '|' || p.cmd || '|' ||
                        p.roles::text || '|' || p.permissive || '|' || coalesce(p.qual, '-') || '|' ||
                        coalesce(p.with_check, '-'), E'\n' order by p.schemaname, p.tablename, p.policyname))
    from pg_policies p
   where p.schemaname in ('public', 'storage')
     and (p.schemaname = 'storage'
          or not exists (select 1 from pg_attribute a
                          where a.attrelid = (quote_ident(p.schemaname) || '.' || quote_ident(p.tablename))::regclass
                            and a.attname = 'empresa_id' and not a.attisdropped))
$f$;

-- As contagens do rb0/rb1: quantas policies de public citam uma função de conjunto, quantas chamam
-- pode_escrever_filial, e quantas rel_* leem mo.empresa_id.
create function pg_temp.f66_contagens() returns text
language sql as $f$
  select (select count(*) from pg_policies p
           where p.schemaname = 'public'
             and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''))
                 ~ '\m(empresas_do_membro|empresas_de_escrita|empresas_de_admin|unidades_de_escrita)\M')::text || '/' ||
         (select count(*) from pg_policies p
           where p.schemaname in ('public', 'storage')
             and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~ '\mpode_escrever_filial\M')::text || '/' ||
         (select count(*) from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('rel_por_motivo_filiais', 'rel_resumo_filiais')
             and p.prosrc ~ 'mo\.empresa_id = m\.empresa_id')::text
$f$;

create function pg_temp.f66_rel() returns text
language sql as $f$
  select string_agg(p.proname || ':' || md5(p.prosrc), ',' order by p.proname)
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('rel_por_motivo_filiais', 'rel_resumo_filiais')
$f$;

select pg_temp.f66_contagens() as contagens_antes,
       pg_temp.f66_as_11()     as as_11_antes
\gset

\ir ../rollback/F66-desfaz.sql

select pg_temp.f66_contagens()     as contagens_depois,
       pg_temp.f66_vivas('public')  as public_depois,
       pg_temp.f66_vivas('storage') as storage_depois,
       pg_temp.f66_as_11()          as as_11_depois,
       pg_temp.f66_rel()            as rel_depois
\gset

-- rb5: de novo — o mesmo arquivo, sobre o banco já desfeito
\ir ../rollback/F66-desfaz.sql

select pg_temp.f66_vivas('public') || '|' || pg_temp.f66_vivas('storage') || '|' || pg_temp.f66_rel() as de_novo
\gset

select set_config('f66rb.contagens_antes',  :'contagens_antes',  false),
       set_config('f66rb.as_11_antes',      :'as_11_antes',      false),
       set_config('f66rb.contagens_depois', :'contagens_depois', false),
       set_config('f66rb.public_depois',    :'public_depois',    false),
       set_config('f66rb.storage_depois',   :'storage_depois',   false),
       set_config('f66rb.as_11_depois',     :'as_11_depois',     false),
       set_config('f66rb.rel_depois',       :'rel_depois',       false),
       set_config('f66rb.de_novo',          :'de_novo',          false);

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;
  -- O "ANTES" DOS DOIS BANCOS VIVOS (Frente A da F66, 24/09/2026, antes de qualquer apply — docs/f66-evidencias/antes/):
  -- policies-ensaio.json e policies-producao.json dão o MESMO `vivas` e o MESMO `as_11_que_nao_mudam`;
  -- catalogo-ensaio.json e catalogo-producao.json, o MESMO md5 do `prosrc` das duas rel_*.
  k_public_antes  constant text := '886118ad686f67c857cf0d370fd6828d';
  k_storage_antes constant text := 'f116b8d0da8bda75038564a44720c2e8';
  k_as_11_antes   constant text := 'eb294504b0b6cec30936d10de6f9d001';
  k_rel_antes     constant text := 'rel_por_motivo_filiais:1bd176033fa1a387060280f2abe859c5,'
                                   'rel_resumo_filiais:74923fe5b3523dc23cb522cf45b18de9';
  v_c_antes   text := current_setting('f66rb.contagens_antes');
  v_c_depois  text := current_setting('f66rb.contagens_depois');
  v_public    text := current_setting('f66rb.public_depois');
  v_storage   text := current_setting('f66rb.storage_depois');
  v_11_antes  text := current_setting('f66rb.as_11_antes');
  v_11_depois text := current_setting('f66rb.as_11_depois');
  v_rel       text := current_setting('f66rb.rel_depois');
  v_de_novo   text := current_setting('f66rb.de_novo');
begin
  raise notice '(medição) contagens antes/depois do rollback (citam conjunto / chamam pode_escrever_filial / rel_* pelo par): % → %',
    v_c_antes, v_c_depois;
  raise notice '(medição) depois do rollback: public % · storage % · as 11 % · rel %', v_public, v_storage, v_11_depois, v_rel;

  if pg_temp.assert_zero_de('rb0 antes do rollback, o que a F66 pôs existe (51 policies citam função de conjunto, nenhuma chama pode_escrever_filial, as duas rel_* juntam pelo par)' ||
       case when v_c_antes <> '51/0/2' then ' — ' || v_c_antes || ', esperado 51/0/2' else '' end,
       case when v_c_antes = '51/0/2' then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb1 depois do rollback, nada da F66 sobrou (0 citam função de conjunto, as 6 de unidade voltaram a pode_escrever_filial, 0 rel_* pelo par)' ||
       case when v_c_depois <> '0/6/0' then ' — ' || v_c_depois || ', esperado 0/6/0' else '' end,
       case when v_c_depois = '0/6/0' then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb2 as duas rel_* voltaram ao corpo da 0143 (o md5 do prosrc do "antes" dos dois bancos vivos)' ||
       case when v_rel is distinct from k_rel_antes then ' — ' || coalesce(v_rel, '∅') || ', esperado ' || k_rel_antes else '' end,
       case when v_rel = k_rel_antes then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb3 as policies de public e de Storage depois do rollback são as do "antes" dos dois bancos vivos (o md5 vivas de impressao-policies.sql)' ||
       case when v_public is distinct from k_public_antes or v_storage is distinct from k_storage_antes
            then ' — public ' || coalesce(v_public, '∅') || ', storage ' || coalesce(v_storage, '∅') else '' end,
       (case when v_public = k_public_antes then 0 else 1 end) + (case when v_storage = k_storage_antes then 0 else 1 end), 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb4 as 11 policies que a F66 não toca são as mesmas antes e depois do rollback, e as do "antes" vivo' ||
       case when v_11_antes is distinct from k_as_11_antes or v_11_depois is distinct from k_as_11_antes
            then ' — antes ' || coalesce(v_11_antes, '∅') || ', depois ' || coalesce(v_11_depois, '∅') else '' end,
       (case when v_11_antes = k_as_11_antes then 0 else 1 end) + (case when v_11_depois = k_as_11_antes then 0 else 1 end), 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb5 o rollback rodado de novo não muda nada (idempotente)' ||
       case when v_de_novo is distinct from v_public || '|' || v_storage || '|' || v_rel then ' — mudou: ' || coalesce(v_de_novo, '∅') else '' end,
       case when v_de_novo = v_public || '|' || v_storage || '|' || v_rel then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM f66_rollback: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
