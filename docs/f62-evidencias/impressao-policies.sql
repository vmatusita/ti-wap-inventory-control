-- =============================================================================
-- impressao-policies.sql — F62 · Frente A — "as 61 policies vivas estão byte a byte como antes"
-- =============================================================================
-- Rodada pelo MCP (execute_sql), só leitura, nos DOIS bancos, antes do primeiro apply
-- e depois do último — com ESTE MESMO TEXTO. Devolve, por schema, a contagem e o md5
-- da lista ordenada (tabela, policy, comando, papéis, permissiva, qual, with_check) —
-- sem normalizar espaço: é "byte a byte" de propósito. As policies NOVAS da F62 (em
-- `membros`) ficam de fora da comparação pela lista `k_novas` — as 61 de hoje têm de
-- continuar dando o MESMO md5; as novas aparecem numa linha própria.
-- =============================================================================
select set_config('transaction_read_only', 'on', true);

with k_novas(tabela) as (values ('membros'), ('empresas'), ('plataforma_admins')),
pol as (
  select p.schemaname, p.tablename, p.policyname, p.cmd, p.roles::text as roles,
         p.permissive, coalesce(p.qual, '-') as qual, coalesce(p.with_check, '-') as wc
    from pg_policies p
   where p.schemaname in ('public', 'storage')
)
select jsonb_build_object(
  'vivas_antes_da_f62', (
    select jsonb_object_agg(schemaname, jsonb_build_object('n', n, 'md5', h))
      from (select schemaname, count(*) as n,
                   md5(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || roles || '|' ||
                                  permissive || '|' || qual || '|' || wc, E'\n'
                                  order by tablename, policyname)) as h
              from pol
             where tablename not in (select tabela from k_novas)
             group by schemaname) s),
  'novas_da_f62', (
    select coalesce(jsonb_agg(tablename || ' / ' || policyname || ' / ' || cmd order by tablename, policyname), '[]'::jsonb)
      from pol where tablename in (select tabela from k_novas))
) as impressao;
