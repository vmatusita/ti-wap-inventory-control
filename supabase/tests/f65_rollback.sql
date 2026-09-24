-- =============================================================
-- Roteiro de teste: O ROLLBACK DA F65, ENSAIADO (23/09/2026) — a sabotagem K (critério 19)
-- =============================================================
-- A F65 troca 23 FKs por compostas de mesmo nome, dá `unique (empresa_id, id)` a sete pais, troca a PK de `motivos` e
-- as do import, faz seis uniques e o do snapshot valerem por empresa, põe o unique por empresa de `colaboradores` em dois
-- passos, e cria os gatilhos (`guarda_empresa` nas 20, a coerência do termo, a diagonal por empresa) — 0165 → 0174. O
-- rollback é `supabase/rollback/F65-desfaz.sql`, na ORDEM INVERSA do apply, idempotente em qualquer estado
-- intermediário. Este roteiro RODA o arquivo de verdade (`\ir`), dentro da transação dele, e prova que o esquema das
-- tabelas tocadas VOLTA ao de antes da 0165:
--   rb0 — antes do rollback, o que a F65 pôs existe (as 23 FKs compostas, os sete pais, os 41 gatilhos da fase e as duas
--         funções novas) — sem isto, "sumiu" seria "nunca esteve";
--   rb1 — depois do rollback, nada da F65 sobrou: nenhuma FK de negócio composta, nenhum `*_empresa_id_uidx` dos sete,
--         nenhum gatilho `*_guarda_empresa` nem o do termo, nenhum `*_f65` provisório;
--   rb2 — as duas funções novas sumiram, e `vocabulario_unidades_guarda()` voltou ao corpo da 0139 (o md5 do `prosrc` é o
--         dos dois bancos antes da F65, 91e80d53…);
--   rb3 — a IMPRESSÃO DO ESQUEMA das 20 tabelas (colunas visíveis, constraints, gatilhos, índices e o comentário deles,
--         policies, RLS/force) mais o md5 das três funções da fase, depois do rollback, é IGUAL à do Postgres do CI ANTES
--         da 0165 — a constante abaixo, medida no push das travas vermelhas da F65, que ainda não tinha as migrations (e
--         rodava este mesmo arquivo em vazio);
--   rb4 — e é igual à impressão de ANTES do rollback menos o que a F65 declarou mudar (as linhas que citam `empresa_id`,
--         os provisórios `*_f65`, o comentário dos dois índices recriados e as linhas das três funções): o rollback tira
--         exatamente o que a fase pôs.
-- Os resultados atravessam o `\ir` como variáveis do psql (`\gset`). DADOS: nenhum — é só catálogo.
-- Tudo dentro de `begin; … rollback;`: nada do rollback ensaiado sobra no banco.
--
-- ⚠ ESTE ENSAIO VALE ENQUANTO A F65 FOR A ÚLTIMA FASE A MEXER NESTAS TABELAS. A fase que mexer nelas depois roda o
-- rollback DELA antes do `\ir` abaixo — a ordem inversa entre fases, a que `f64_rollback.sql`, `f63_rollback.sql` e
-- `f62_rollback.sql` passaram a seguir com o rollback da F65.
-- =============================================================

begin;

create function pg_temp.f65_impressao_esquema(p_sem_f65 boolean) returns text
language sql as $f$
  with k_negocio(tabela) as (
    select unnest(array['anotacoes', 'ativos', 'colaboradores', 'eventos_admin', 'filiais', 'import_logs',
                        'import_prefixos_patrimonio', 'import_termos_categoria', 'import_termos_estado', 'itens',
                        'kits_modelos', 'lancamentos_item', 'motivos', 'movimentacoes', 'pendencias_item',
                        'relatorios_gerados', 'senhas_acesso', 'termos_gerados', 'tipos_item', 'unidades_apelidos'])
  ), rel as (
    select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c join k_negocio k on k.tabela = c.relname
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
    select 'idxc|' || c.relname || '|' || coalesce(obj_description(c.oid, 'pg_class'), '-')
      from rel r join pg_index i on i.indrelid = r.oid join pg_class c on c.oid = i.indexrelid
    union all
    select 'pol|' || p.tablename || '|' || p.policyname || '|' || p.cmd || '|' || coalesce(p.qual, '-') || '|' || coalesce(p.with_check, '-')
      from pg_policies p join k_negocio k on k.tabela = p.tablename
     where p.schemaname = 'public'
    union all
    select 'tab|' || r.relname || '|rls=' || r.relrowsecurity::text || '|force=' || r.relforcerowsecurity::text
      from rel r
    union all
    select 'fn|' || p.proname || '|' || md5(p.prosrc) || '|' || coalesce(obj_description(p.oid, 'pg_proc'), '-')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('vocabulario_unidades_guarda', 'guarda_empresa', 'termo_da_empresa')
  ), declarados(nome) as (
    -- O QUE A F65 DECLARA MEXER, pelo nome (a F65 TROCA objetos mantendo o nome — o filtro por `empresa_id` da F64 não
    -- serve: o mesmo índice cita a coluna antes e não depois): as 23 FKs, os sete uniques dos pais, as chaves por empresa
    -- (a PK de motivos, as do import e os dois parciais, os seis uniques, o do snapshot, o de colaboradores).
    select unnest(array[
      'anotacoes_ativo_id_fkey', 'ativos_filial_id_fkey', 'ativos_substitui_ativo_id_fkey', 'colaboradores_filial_id_fkey',
      'import_logs_filial_id_fkey', 'itens_tipo_id_fkey', 'lancamentos_item_colaborador_id_fkey',
      'lancamentos_item_estorna_id_fkey', 'lancamentos_item_filial_id_fkey', 'lancamentos_item_item_id_fkey',
      'lancamentos_item_movimentacao_id_fkey', 'lancamentos_item_pendencia_item_id_fkey', 'movimentacoes_ativo_id_fkey',
      'movimentacoes_colaborador_id_fkey', 'movimentacoes_estorno_de_fkey', 'movimentacoes_filial_destino_id_fkey',
      'movimentacoes_filial_id_fkey', 'movimentacoes_motivo_fkey', 'pendencias_item_ativo_id_fkey',
      'pendencias_item_filial_id_fkey', 'pendencias_item_movimentacao_id_fkey', 'relatorios_gerados_filial_id_fkey',
      'unidades_apelidos_filial_id_fkey',
      'ativos_empresa_id_uidx', 'movimentacoes_empresa_id_uidx', 'pendencias_item_empresa_id_uidx',
      'lancamentos_item_empresa_id_uidx', 'colaboradores_empresa_id_uidx', 'itens_empresa_id_uidx', 'tipos_item_empresa_id_uidx',
      'motivos_pkey', 'import_prefixos_patrimonio_pkey', 'import_termos_categoria_pkey', 'import_termos_estado_pkey',
      'import_termos_categoria_categoria_rotulo_uidx', 'import_termos_estado_estado_rotulo_uidx',
      'filiais_slug_key', 'filiais_nome_chave_uidx', 'tipos_item_slug_key', 'itens_nome_chave_uidx', 'kits_modelos_nome_uidx',
      'unidades_apelidos_apelido_chave_uidx', 'relatorios_gerados_periodo_filial_versao_uidx', 'colaboradores_nome_chave_uidx',
      'termos_gerados_ids_da_empresa'])
  )
  select md5(coalesce(string_agg(linha, E'\n' order by linha), ''))
    from linhas
   where not (p_sem_f65 and (linha ~ ('\m(' || (select string_agg(nome, '|') from declarados) || ')\M')
                             or linha ~ '\m[a-z_]+_guarda_empresa\M' or linha ~ '_f65\M' or linha ~ '^fn\|'))
$f$;

-- O que a F65 pôs (as contagens do rb0/rb1).
create function pg_temp.f65_objetos() returns bigint
language sql as $f$
  select (select count(*) from pg_constraint k
            join pg_class f on f.oid = k.conrelid join pg_class p on p.oid = k.confrelid
           where k.contype = 'f' and cardinality(k.conkey) > 1
             and f.relnamespace = 'public'::regnamespace and p.relnamespace = 'public'::regnamespace
             and f.relname <> 'operador_filiais' and p.relname <> 'membros')
       + (select count(*) from pg_constraint k where k.contype = 'u' and k.connamespace = 'public'::regnamespace
             and k.conname in ('ativos_empresa_id_uidx', 'movimentacoes_empresa_id_uidx', 'pendencias_item_empresa_id_uidx',
                               'lancamentos_item_empresa_id_uidx', 'colaboradores_empresa_id_uidx', 'itens_empresa_id_uidx',
                               'tipos_item_empresa_id_uidx'))
       + (select count(*) from pg_trigger t where not t.tgisinternal
             and (t.tgname like '%\_guarda\_empresa' or t.tgname = 'termos_gerados_ids_da_empresa'))
       + (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
             and p.proname in ('guarda_empresa', 'termo_da_empresa'))
       + (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname like '%\_f65')
$f$;

-- F66 (24/09/2026): a F66 sai antes de todas — as policies dela citam `empresa_id` (que os rollbacks da F64 e da F63
-- derrubam) e as funções de conjunto (que o da F62 derruba), e a impressão de antes tem de ser o estado que as fases
-- anteriores deixaram. O que este roteiro prova não muda.
\ir ../rollback/F66-desfaz.sql

select pg_temp.f65_impressao_esquema(true) as antes_sem_f65,
       pg_temp.f65_objetos()               as objetos_antes
\gset

\ir ../rollback/F65-desfaz.sql

select pg_temp.f65_impressao_esquema(false) as depois,
       pg_temp.f65_impressao_esquema(true)  as depois_sem_f65,
       pg_temp.f65_objetos()                as objetos_depois,
       (select md5(p.prosrc) from pg_proc p where p.oid = 'public.vocabulario_unidades_guarda()'::regprocedure) as diagonal_depois,
       (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
          and p.proname in ('guarda_empresa', 'termo_da_empresa'))                                              as novas_depois
\gset

select set_config('f65rb.antes_sem_f65',   :'antes_sem_f65',   false),
       set_config('f65rb.objetos_antes',   :'objetos_antes',   false),
       set_config('f65rb.depois',          :'depois',          false),
       set_config('f65rb.depois_sem_f65',  :'depois_sem_f65',  false),
       set_config('f65rb.objetos_depois',  :'objetos_depois',  false),
       set_config('f65rb.diagonal_depois', :'diagonal_depois', false),
       set_config('f65rb.novas_depois',    :'novas_depois',    false);

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;
  -- A IMPRESSÃO DO CI ANTES DA 0165: medida no push das travas vermelhas da F65 (a cadeia até a 0164, este mesmo
  -- roteiro, este mesmo `F65-desfaz.sql` rodando em vazio). Ver docs/f65-evidencias/B-travas/.
  k_pre_0165      constant text := '1c72ca42784d716f9009cc68f504c8f3';
  -- O md5 do `prosrc` de vocabulario_unidades_guarda() na 0139 — o dos dois bancos antes da F65.
  k_diagonal_0139 constant text := '91e80d533d72191325e614d24e15a881';
  -- O que a F65 põe: 23 FKs compostas + 7 uniques dos pais + 41 gatilhos (40 da guarda, 1 do termo) + 2 funções (e 0
  -- provisórios).
  k_objetos_f65   constant bigint := 73;
  v_antes_sem  text := current_setting('f65rb.antes_sem_f65');
  v_depois     text := current_setting('f65rb.depois');
  v_depois_sem text := current_setting('f65rb.depois_sem_f65');
  v_obj_antes  bigint := current_setting('f65rb.objetos_antes')::bigint;
  v_obj_depois bigint := current_setting('f65rb.objetos_depois')::bigint;
  v_diagonal   text := current_setting('f65rb.diagonal_depois');
  v_novas      bigint := current_setting('f65rb.novas_depois')::bigint;
begin
  raise notice '(medição) impressão do esquema das 20 DEPOIS do rollback: % · antes, sem o que a F65 declarou: % · depois, sem: %',
    v_depois, v_antes_sem, v_depois_sem;

  if pg_temp.assert_zero_de('rb0 antes do rollback, o que a F65 pôs existe (23 FKs compostas, 7 uniques dos pais, 41 gatilhos, 2 funções)' ||
       case when v_obj_antes <> k_objetos_f65 then ' — ' || v_obj_antes || ' de ' || k_objetos_f65 else '' end,
       greatest(k_objetos_f65 - v_obj_antes, 0) + least(greatest(v_obj_antes - k_objetos_f65, 0), 1), k_objetos_f65) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb1 depois do rollback, nada da F65 sobrou (FK composta de negócio, unique dos pais, gatilho da fase, função nova, provisório *_f65)' ||
       case when v_obj_depois > 0 then ' — sobraram ' || v_obj_depois else '' end,
       least(v_obj_depois, k_objetos_f65), k_objetos_f65) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb2 depois do rollback, guarda_empresa e termo_da_empresa sumiram, e a diagonal voltou ao corpo da 0139' ||
       case when v_novas > 0 or v_diagonal is distinct from k_diagonal_0139
            then ' — funções novas ' || v_novas || ', diagonal ' || coalesce(v_diagonal, '∅') else '' end,
       least(v_novas, 2) + (case when v_diagonal = k_diagonal_0139 then 0 else 1 end), 3) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb3 o esquema das 20 (e as três funções) depois do rollback é o do CI antes da 0165' ||
       case when v_depois <> k_pre_0165 then ' — impressão ' || v_depois || ', esperada ' || k_pre_0165 else '' end,
       case when v_depois = k_pre_0165 then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb4 o rollback tira exatamente o que a F65 declarou (antes sem a F65 = depois sem a F65)' ||
       case when v_depois_sem <> v_antes_sem then ' — depois ' || v_depois_sem || ', antes ' || v_antes_sem else '' end,
       case when v_depois_sem = v_antes_sem then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM f65_rollback: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
