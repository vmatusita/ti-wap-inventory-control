-- =============================================================================
-- impressao-f66b.sql — F66B · o "antes" e o "depois" de cada banco, o MESMO texto nos dois momentos e nos dois bancos
-- =============================================================================
-- O que a fase DEVE mudar e o que ela NÃO pode mudar (docs/PLAN-F66B.md §7, decisão 12):
--   · checks       — toda CHECK de `public` (contype = 'c'): a contagem, o md5 da lista (tabela|nome|md5 do
--                    pg_get_constraintdef|convalidated) e a lista nome → md5 do pg_get_constraintdef. Antes: 36. Depois:
--                    101 — as 36 de antes byte a byte e as 65 `_tamanho` da tabela-verdade, com o MESMO md5 do CI;
--   · relfilenode  — das 20 tabelas de `k_negocio`: IGUAL antes e depois é a prova de que nenhuma tupla foi reescrita
--                    (`add constraint … check` varre e não reescreve; um `alter column … type` reescreveria);
--   · funcoes      — o md5 do conjunto (assinatura:md5 do `prosrc`) de toda função de `public`: a fase não cria nem
--                    recria função nenhuma (a RPC do import continua byte a byte);
--   · policies     — as policies de `public` e de Storage (nome, tabela, comando, md5 de qual e de with_check): byte a
--                    byte (a F66B não toca policy).
-- SÓ LEITURA E SÓ CATÁLOGO: nenhum dado de linha, nenhum valor. Uma consulta só (o execute_sql do MCP devolve o último
-- comando). ⚠ O md5 de `prosrc` do banco vivo NÃO se compara com o do CI (três corpos vivos divergem do arquivo desde
-- antes da F46 — memória "corpo vivo diverge do arquivo"): a régua é antes × depois NO MESMO BANCO. O das CHECK, sim, se
-- compara com o do CI (pg_get_constraintdef é determinístico).
-- =============================================================================
select set_config('transaction_read_only', 'on', true);

with negocio(tabela) as (
  values ('anotacoes'), ('ativos'), ('colaboradores'), ('eventos_admin'), ('filiais'), ('import_logs'),
         ('import_prefixos_patrimonio'), ('import_termos_categoria'), ('import_termos_estado'), ('itens'),
         ('kits_modelos'), ('lancamentos_item'), ('motivos'), ('movimentacoes'), ('pendencias_item'),
         ('relatorios_gerados'), ('senhas_acesso'), ('termos_gerados'), ('tipos_item'), ('unidades_apelidos')
),
rel as (
  select c.oid, c.relname::text as tabela, c.relfilenode
    from pg_class c join negocio n on n.tabela = c.relname
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
),
ck as (
  select c.relname::text as tabela, k.conname::text as nome, md5(pg_get_constraintdef(k.oid)) as h, k.convalidated as v
    from pg_constraint k join pg_class c on c.oid = k.conrelid
   where k.contype = 'c' and c.relnamespace = 'public'::regnamespace
),
fn as (
  select p.oid::regprocedure::text as assinatura, md5(p.prosrc) as h
    from pg_proc p where p.pronamespace = 'public'::regnamespace
),
pol as (
  select schemaname::text || '.' || tablename::text || '|' || policyname::text || '|' || cmd::text || '|' ||
         md5(coalesce(qual, '∅')) || '|' || md5(coalesce(with_check, '∅')) as linha, schemaname::text as esquema
    from pg_policies where schemaname in ('public', 'storage')
)
select jsonb_pretty(jsonb_build_object(
  -- o ENCHIMENTO do canal: a resposta sempre cai em arquivo, e a evidência é EXTRAÍDA dele por script, nunca transcrita.
  '_canal', repeat('.', 120000),
  'checks', jsonb_build_object(
    'total', (select count(*) from ck),
    'tamanho', (select count(*) from ck where nome like '%\_tamanho'),
    'not_valid', (select count(*) from ck where not v),
    'md5', (select md5(string_agg(tabela || '|' || nome || '|' || h || '|' || v, E'\n' order by tabela, nome)) from ck),
    'lista', (select jsonb_object_agg(nome, h) from ck)),
  'relfilenode', jsonb_build_object(
    'negocio', (select count(*) from rel),
    'md5', (select md5(string_agg(tabela || ':' || relfilenode::text, E'\n' order by tabela)) from rel),
    'lista', (select jsonb_object_agg(tabela, relfilenode) from rel)),
  'funcoes', jsonb_build_object(
    'total', (select count(*) from fn),
    'md5', (select md5(string_agg(assinatura || ':' || h, E'\n' order by assinatura)) from fn)),
  'policies', jsonb_build_object(
    'public', (select count(*) from pol where esquema = 'public'),
    'storage', (select count(*) from pol where esquema = 'storage'),
    'md5', (select md5(string_agg(linha, E'\n' order by linha)) from pol))
)) as impressao;
