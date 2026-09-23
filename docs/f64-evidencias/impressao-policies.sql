-- =============================================================================
-- impressao-policies.sql — F64 · Frente A — "as 62 policies vivas estão byte a byte como antes"
-- =============================================================================
-- O instrumento da F63 (`docs/f63-evidencias/impressao-policies.sql`), com uma troca: o recorte
-- "do acervo" (as oito da F63) vira o do LOTE 2 — as onze tabelas que a F64 põe `empresa_id`
-- (22 policies, fato 3) — e ganha o de TODA tabela de negócio (as 20 de `k_negocio`). A F64 não
-- cria nem toca policy nenhuma (a ficha: "qualquer policy" é da F66), então TODAS as vivas entram
-- na comparação — hoje 62 (54 em `public` + 8 em `storage`, fato 2).
--
-- Rodada pelo MCP (execute_sql), só leitura, nos DOIS bancos, antes do primeiro apply e depois do
-- último — com ESTE MESMO TEXTO. Devolve, por schema, a contagem e o md5 da lista ordenada
-- (tabela, policy, comando, papéis, permissiva, qual, with_check) — sem normalizar espaço: é "byte
-- a byte" de propósito. E, das onze e das vinte, quantas policies existem e quantas citam
-- `empresa_id` (0 — ninguém lê até a F66). SÓ CATÁLOGO: nenhum dado de linha.
-- =============================================================================
select set_config('transaction_read_only', 'on', true);

with pol as (
  select p.schemaname, p.tablename, p.policyname, p.cmd, p.roles::text as roles,
         p.permissive, coalesce(p.qual, '-') as qual, coalesce(p.with_check, '-') as wc
    from pg_policies p
   where p.schemaname in ('public', 'storage')
),
lote2(tabela) as (
  values ('tipos_item'), ('motivos'), ('kits_modelos'), ('senhas_acesso'), ('eventos_admin'),
         ('import_logs'), ('relatorios_gerados'), ('import_prefixos_patrimonio'),
         ('import_termos_categoria'), ('import_termos_estado'), ('unidades_apelidos')
),
negocio(tabela) as (
  select tabela from lote2
  union all
  values ('ativos'), ('movimentacoes'), ('lancamentos_item'), ('pendencias_item'),
         ('anotacoes'), ('termos_gerados'), ('colaboradores'), ('itens'), ('filiais')
)
select jsonb_pretty(jsonb_build_object(
  'vivas', (
    select jsonb_object_agg(schemaname, jsonb_build_object('n', n, 'md5', h))
      from (select schemaname, count(*) as n,
                   md5(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || roles || '|' ||
                                  permissive || '|' || qual || '|' || wc, E'\n'
                                  order by tablename, policyname)) as h
              from pol
             group by schemaname) s),
  'do_lote2', (
    select jsonb_build_object(
      'tabelas', (select count(*) from lote2),
      'policies', count(*),
      'citam_empresa_id', count(*) filter (where qual ~ '\mempresa_id\M' or wc ~ '\mempresa_id\M'))
      from pol where schemaname = 'public' and tablename in (select tabela from lote2)),
  'do_negocio', (
    select jsonb_build_object(
      'tabelas', (select count(*) from negocio),
      'policies', count(*),
      'citam_empresa_id', count(*) filter (where qual ~ '\mempresa_id\M' or wc ~ '\mempresa_id\M'))
      from pol where schemaname = 'public' and tablename in (select tabela from negocio))
)) as impressao;
