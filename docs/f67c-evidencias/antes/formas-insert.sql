-- F67C — o instrumento da janela (decisao 12): as formas de INSERT de TOPO nas 20 tabelas de k_negocio em
-- pg_stat_statements, por (tabela, papel), COM e SEM empresa_id na lista de colunas. So numero: o texto da forma nao sai do
-- banco (a classificacao e feita aqui dentro, por regex). Rodado pelo MCP execute_sql (so leitura) no "antes", no T0 e no T1.
-- O PostgREST monta a lista de colunas do INSERT a partir das chaves do payload (doc: docs/f67c-evidencias/antes/docs.md),
-- entao um escritor do app que passa a mandar empresa_id gera uma forma NOVA, COM a coluna; a forma velha, SEM, para de
-- receber chamada. A condicao da contracao: Δ c_sem = 0 nos papeis do app (authenticated, service_role) entre o fim do
-- deploy e o T1.
with cfg as (
  select current_setting('pg_stat_statements.track') track, current_setting('pg_stat_statements.max') mx,
         current_setting('pg_stat_statements.save') sv, (select stats_reset from pg_stat_statements_info) reset, now() agora
),
s as (
  select r.rolname, s.calls, s.query
  from pg_stat_statements s join pg_roles r on r.oid = s.userid
  where s.dbid = (select oid from pg_database where datname = current_database())
    and s.query ~* 'insert\s+into'
),
t as (
  select unnest(array['anotacoes','ativos','colaboradores','itens','lancamentos_item','movimentacoes','pendencias_item',
    'termos_gerados','eventos_admin','import_logs','import_prefixos_patrimonio','import_termos_categoria',
    'import_termos_estado','kits_modelos','motivos','relatorios_gerados','senhas_acesso','tipos_item','unidades_apelidos',
    'filiais']) tab
),
m as (
  select t.tab, s.rolname, s.calls,
         regexp_match(s.query, 'insert\s+into\s+(?:"?public"?\.)?"?' || t.tab || '\M"?(?:\s+as\s+\w+)?\s*(\(([^)]*)\))?', 'i') mm
  from s cross join t
),
k as (
  select tab, rolname, calls,
         case when mm[2] is null then 'sem_lista' when mm[2] ~ 'empresa_id' then 'com' else 'sem' end tipo
  from m where mm is not null
)
select (select row_to_json(cfg) from cfg) cfg,
  (select json_agg(x order by x.tab, x.rolname) from (
     select tab, rolname,
       count(*) filter (where tipo = 'com') f_com, coalesce(sum(calls) filter (where tipo = 'com'), 0) c_com,
       count(*) filter (where tipo = 'sem') f_sem, coalesce(sum(calls) filter (where tipo = 'sem'), 0) c_sem,
       count(*) filter (where tipo = 'sem_lista') f_sl, coalesce(sum(calls) filter (where tipo = 'sem_lista'), 0) c_sl
     from k group by tab, rolname) x) formas;
