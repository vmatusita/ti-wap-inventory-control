-- =============================================================================
-- sonda-lote.sql — F66 · Frente G — a prova ENTRE os lotes, compacta (a resposta cabe inline no canal)
-- =============================================================================
-- Os MESMOS md5 de `impressao-policies.sql` (o `vivas` por schema, as 11 que não mudam, as contagens) e de
-- `impressao-catalogo.sql` (`relfilenode`, índices, funções, as duas `rel_*`), sem as listas. Rodada no ensaio e em
-- produção antes do primeiro lote e depois de cada um; o `vivas.public` esperado depois de cada lote vem do ORÁCULO da mesa
-- (PGlite, as migrations do repositório aplicadas até aquele lote — que reproduz o "antes" dos bancos vivos byte a byte):
--   antes 886118ad… · 0175 e55c75d0… · 0176 e7d55e81… · 0177 60f90a0f… · 0178 aa0db1b3… (a 0179 não mexe em policy)
-- e o `prosrc` das `rel_*` depois da 0179: rel_por_motivo_filiais c8ecce6f… · rel_resumo_filiais ae0911e4….
-- SÓ LEITURA E SÓ CATÁLOGO: nenhum dado de linha.
-- =============================================================================
select set_config('transaction_read_only', 'on', true);

with pol as (
  select p.schemaname, p.tablename, p.policyname, p.cmd, p.roles::text as roles,
         p.permissive, coalesce(p.qual, '-') as qual, coalesce(p.with_check, '-') as wc,
         exists (select 1 from pg_attribute a
                  where a.attrelid = (quote_ident(p.schemaname) || '.' || quote_ident(p.tablename))::regclass
                    and a.attname = 'empresa_id' and not a.attisdropped) as tem_coluna
    from pg_policies p
   where p.schemaname in ('public', 'storage')
),
alvo(tabela) as (
  values ('anotacoes'), ('ativos'), ('colaboradores'), ('eventos_admin'), ('filiais'), ('import_logs'),
         ('import_prefixos_patrimonio'), ('import_termos_categoria'), ('import_termos_estado'), ('itens'),
         ('kits_modelos'), ('lancamentos_item'), ('motivos'), ('movimentacoes'), ('pendencias_item'),
         ('relatorios_gerados'), ('senhas_acesso'), ('termos_gerados'), ('tipos_item'), ('unidades_apelidos'),
         ('membros'), ('operador_filiais')
),
rel as (
  select c.oid, c.relname::text as tabela, c.relfilenode
    from pg_class c join alvo a on a.tabela = c.relname
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
),
ix as (
  select ic.relname::text as nome, r.tabela, pg_get_indexdef(i.indexrelid) as def
    from pg_index i join rel r on r.oid = i.indrelid join pg_class ic on ic.oid = i.indexrelid
),
fn as (
  select p.oid::regprocedure::text as assinatura, p.proname::text as nome, md5(p.prosrc) as h
    from pg_proc p where p.pronamespace = 'public'::regnamespace
)
select jsonb_build_object(
  'public', (select md5(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || roles || '|' || permissive || '|' ||
                                   qual || '|' || wc, E'\n' order by tablename, policyname)) from pol where schemaname = 'public'),
  'storage', (select md5(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || roles || '|' || permissive || '|' ||
                                    qual || '|' || wc, E'\n' order by tablename, policyname)) from pol where schemaname = 'storage'),
  'as_11', (select md5(string_agg(schemaname || '|' || tablename || '|' || policyname || '|' || cmd || '|' || roles || '|' ||
                                  permissive || '|' || qual || '|' || wc, E'\n' order by schemaname, tablename, policyname))
              from pol where schemaname = 'storage' or not tem_coluna),
  'citam_empresa_id', (select count(*) from pol where schemaname = 'public' and (qual ~ '\mempresa_id\M' or wc ~ '\mempresa_id\M')),
  'citam_pode_escrever_filial', (select count(*) from pol where qual ~ '\mpode_escrever_filial\M' or wc ~ '\mpode_escrever_filial\M'),
  'citam_unidades_de_escrita', (select count(*) from pol where qual ~ '\munidades_de_escrita\M' or wc ~ '\munidades_de_escrita\M'),
  'to_authenticated', (select count(*) from pol where roles = '{authenticated}'),
  'relfilenode', (select md5(string_agg(tabela || ':' || relfilenode::text, E'\n' order by tabela)) from rel),
  'indices', (select md5(string_agg(nome || '|' || tabela || '|' || def, E'\n' order by nome)) from ix),
  'funcoes_sem_as_da_f66', (select md5(string_agg(assinatura || ':' || h, E'\n' order by assinatura)) from fn
                             where nome not in ('rel_por_motivo_filiais', 'rel_resumo_filiais')),
  'rel', (select string_agg(nome || ':' || h, ',' order by nome) from fn
           where nome in ('rel_por_motivo_filiais', 'rel_resumo_filiais'))
) as sonda;
