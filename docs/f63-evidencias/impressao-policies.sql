-- =============================================================================
-- impressao-policies.sql — F63 · Frente A — "as 62 policies vivas estão byte a byte como antes"
-- =============================================================================
-- O instrumento da F62 (`docs/f62-evidencias/impressao-policies.sql`), com uma troca: a
-- F62 separava as policies NOVAS dela (`k_novas`); a F63 não cria nem toca policy nenhuma
-- (decisão do Johnny + ficha: "qualquer policy" é da F66), então TODAS as vivas entram na
-- comparação — hoje 62 (54 em `public` + 8 em `storage`, fato 2).
--
-- Rodada pelo MCP (execute_sql), só leitura, nos DOIS bancos, antes do primeiro apply e
-- depois do último — com ESTE MESMO TEXTO. Devolve, por schema, a contagem e o md5 da lista
-- ordenada (tabela, policy, comando, papéis, permissiva, qual, with_check) — sem
-- normalizar espaço: é "byte a byte" de propósito. E, das oito tabelas do acervo, quantas
-- policies existem (23, fato 5) e quantas citam `empresa_id` (0 — ninguém lê até a F66).
-- SÓ CATÁLOGO: nenhum dado de linha.
-- =============================================================================
select set_config('transaction_read_only', 'on', true);

with pol as (
  select p.schemaname, p.tablename, p.policyname, p.cmd, p.roles::text as roles,
         p.permissive, coalesce(p.qual, '-') as qual, coalesce(p.with_check, '-') as wc
    from pg_policies p
   where p.schemaname in ('public', 'storage')
),
acervo(tabela) as (
  values ('ativos'), ('movimentacoes'), ('lancamentos_item'), ('pendencias_item'),
         ('anotacoes'), ('termos_gerados'), ('colaboradores'), ('itens')
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
  'do_acervo', (
    select jsonb_build_object(
      'policies', count(*),
      'citam_empresa_id', count(*) filter (where qual ~ '\mempresa_id\M' or wc ~ '\mempresa_id\M'))
      from pol where schemaname = 'public' and tablename in (select tabela from acervo))
)) as impressao;
