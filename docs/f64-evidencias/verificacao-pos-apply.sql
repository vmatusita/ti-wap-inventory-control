-- =============================================================================
-- verificacao-pos-apply.sql — F64 · Frente G — a prova do runbook depois das 0162–0164
-- =============================================================================
-- Rodada pelo MCP (execute_sql), só leitura, nos DOIS bancos, depois do apply da 0164 — com ESTE
-- MESMO TEXTO. SÓ CATÁLOGO E CONTAGEM: nenhum id, código, rótulo, hash, nome ou texto de linha.
--
--   lote2      — para cada uma das onze: a coluna (tipo, not null, atthasmissing), o default preso
--                a public.empresa_legada() pelo pg_depend (não pelo texto de pg_get_expr, que
--                qualifica o nome conforme o search_path), a FK para empresas validada, o
--                comentário dizendo F67, e count(*) = count(empresa_id) = count(*) filter
--                (empresa_id = legada) — o fato 6 e o critério 6 da ordem;
--   negocio    — quantas das 20 tabelas de negócio têm a coluna (tem de ser 20);
--   kit        — o gatilho da 0164 em kits_modelos: existe, habilitado, BEFORE, INSERT + UPDATE OF
--                (payload, empresa_id), por linha; a função é INVOKER, com search_path fixo;
--   integridade— checagens_integridade_nucleo(): quantas chaves e o TOTAL da chave nova
--                (kit_motivo_orfao) — SÓ chave e total, nunca a amostra.
-- =============================================================================
select set_config('transaction_read_only', 'on', true);

with lote2(tabela) as (
  values ('tipos_item'), ('motivos'), ('kits_modelos'), ('senhas_acesso'), ('eventos_admin'),
         ('import_logs'), ('relatorios_gerados'), ('import_prefixos_patrimonio'),
         ('import_termos_categoria'), ('import_termos_estado'), ('unidades_apelidos')
),
negocio(tabela) as (
  select tabela from lote2
  union all
  values ('ativos'), ('movimentacoes'), ('lancamentos_item'), ('pendencias_item'),
         ('anotacoes'), ('termos_gerados'), ('colaboradores'), ('itens'), ('filiais')
),
coluna as (
  select x.tabela, c.oid as rel, a.attnum, a.atttypid, a.attnotnull, a.atthasmissing,
         (select d.oid from pg_attrdef d where d.adrelid = c.oid and d.adnum = a.attnum) as def_oid
    from lote2 x
    join pg_class c on c.oid = ('public.' || x.tabela)::regclass
    left join pg_attribute a on a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped
),
gatilho as (
  select t.tgname, t.tgenabled, t.tgtype, t.tgattr, p.prosecdef, p.proconfig
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid = 'public.kits_modelos'::regclass and not t.tgisinternal
)
select jsonb_pretty(jsonb_build_object(
  'lote2', (
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
    'tipos_item',                 (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.tipos_item),
    'motivos',                    (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.motivos),
    'kits_modelos',               (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.kits_modelos),
    'senhas_acesso',              (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.senhas_acesso),
    'eventos_admin',              (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.eventos_admin),
    'import_logs',                (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.import_logs),
    'relatorios_gerados',         (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.relatorios_gerados),
    'import_prefixos_patrimonio', (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.import_prefixos_patrimonio),
    'import_termos_categoria',    (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.import_termos_categoria),
    'import_termos_estado',       (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.import_termos_estado),
    'unidades_apelidos',          (select jsonb_build_array(count(*), count(empresa_id), count(*) filter (where empresa_id = public.empresa_legada())) from public.unidades_apelidos)),
  'negocio', (
    select jsonb_build_object(
      'tabelas', count(*),
      'com_empresa_id', count(*) filter (where exists (
        select 1 from pg_attribute a
         where a.attrelid = ('public.' || n.tabela)::regclass and a.attname = 'empresa_id' and not a.attisdropped)))
      from negocio n),
  'kit', (
    select jsonb_build_object(
      'gatilhos', count(*),
      'nomes', coalesce(jsonb_agg(g.tgname order by g.tgname), '[]'::jsonb),
      'habilitados', count(*) filter (where g.tgenabled <> 'D'),
      -- tgtype: bit 0 = por linha, bit 1 = BEFORE, bit 2 = INSERT, bit 4 = UPDATE
      'before_linha_insert_update', count(*) filter (where (g.tgtype & 1) = 1 and (g.tgtype & 2) = 2 and (g.tgtype & 4) = 4 and (g.tgtype & 16) = 16),
      'update_of', coalesce(jsonb_agg((select string_agg(a.attname, ',' order by a.attname)
                                         from pg_attribute a
                                        where a.attrelid = 'public.kits_modelos'::regclass
                                          and a.attnum = any (g.tgattr::int2[]))), '[]'::jsonb),
      'funcao_definer', coalesce(bool_or(g.prosecdef), false),
      'funcao_search_path', coalesce(jsonb_agg(g.proconfig), '[]'::jsonb))
      from gatilho g),
  'integridade', (
    select jsonb_build_object(
      'chaves', count(*),
      'kit_motivo_orfao', (array_agg(n.total) filter (where n.chave = 'kit_motivo_orfao'))[1])
      from public.checagens_integridade_nucleo() n)
)) as verificacao;
