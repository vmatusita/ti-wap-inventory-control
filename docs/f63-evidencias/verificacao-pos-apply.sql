-- =============================================================================
-- verificacao-pos-apply.sql — F63 · Frente G — a prova do runbook depois das 0159–0161
-- =============================================================================
-- Rodada pelo MCP (execute_sql), só leitura, nos DOIS bancos, depois do apply da 0161 —
-- com ESTE MESMO TEXTO. SÓ CATÁLOGO E CONTAGEM: nenhum id, nome ou texto de linha.
--
--   acervo            — para cada uma das oito: a coluna (tipo, not null, atthasmissing), o
--                       default preso a public.empresa_legada() pelo pg_depend (não pelo texto
--                       de pg_get_expr, que qualifica o nome conforme o search_path), a FK para
--                       empresas validada, o comentário dizendo F67, e
--                       count(*) = count(empresa_id) = count(*) filter (empresa_id = legada)
--   backups_migration — RLS ligada, force desligado, ZERO policy, e o privilégio de cada papel
--                       da API (anon · authenticated · service_role) em select/insert/update/
--                       delete/truncate: tem de ser 0 em tudo (o molde de public.ambiente)
-- =============================================================================
select set_config('transaction_read_only', 'on', true);

with acervo(tabela) as (
  values ('ativos'), ('movimentacoes'), ('lancamentos_item'), ('pendencias_item'),
         ('anotacoes'), ('termos_gerados'), ('colaboradores'), ('itens')
),
coluna as (
  select x.tabela, c.oid as rel, a.attnum, a.atttypid, a.attnotnull, a.atthasmissing,
         (select d.oid from pg_attrdef d where d.adrelid = c.oid and d.adnum = a.attnum) as def_oid
    from acervo x
    join pg_class c on c.oid = ('public.' || x.tabela)::regclass
    left join pg_attribute a on a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped
)
select jsonb_pretty(jsonb_build_object(
  'acervo', (
    select jsonb_object_agg(k.tabela, jsonb_build_object(
      'tipo', coalesce(format_type(k.atttypid, null), 'ausente'),
      'not_null', k.attnotnull,
      'atthasmissing', k.atthasmissing,
      'default_e_empresa_legada', exists (
        select 1 from pg_depend dp
         where dp.classid = 'pg_attrdef'::regclass and dp.objid = k.def_oid
           and dp.refclassid = 'pg_proc'::regclass
           and dp.refobjid = 'public.empresa_legada()'::regprocedure),
      'fk_para_empresas_validada', exists (
        select 1 from pg_constraint f
         where f.conrelid = k.rel and f.contype = 'f' and f.convalidated
           and f.confrelid = 'public.empresas'::regclass and f.conkey = array[k.attnum]),
      'comentario_cita_f67', coalesce(col_description(k.rel, k.attnum) ~ 'F67', false)
    ) order by k.tabela)
      from coluna k),
  'contagens', jsonb_build_object(
    'ativos',           (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.ativos),
    'movimentacoes',    (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.movimentacoes),
    'lancamentos_item', (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.lancamentos_item),
    'pendencias_item',  (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.pendencias_item),
    'anotacoes',        (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.anotacoes),
    'termos_gerados',   (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.termos_gerados),
    'colaboradores',    (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.colaboradores),
    'itens',            (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.itens)),
  'backups_migration', (
    select jsonb_build_object(
      'rls', c.relrowsecurity,
      'force', c.relforcerowsecurity,
      'policies', (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'backups_migration'),
      'linhas', (select count(*) from public.backups_migration),
      'privilegios', (
        select jsonb_object_agg(r.papel, (
          select string_agg(case when has_table_privilege(r.papel, c.oid, pr.p) then '1' else '0' end, '' order by pr.o)
            from (values (1, 'select'), (2, 'insert'), (3, 'update'), (4, 'delete'), (5, 'truncate')) as pr(o, p)))
          from (values ('anon'), ('authenticated'), ('service_role')) as r(papel)))
      from pg_class c where c.oid = 'public.backups_migration'::regclass)
)) as verificacao;
