-- As 12 datas de amostra da F53, por filial (1..6) e consolidado (null).
-- Compara por HASH do CONJUNTO ORDENADO, nunca por contagem: contagem igual com
-- linhas trocadas passaria despercebida.
with datas(d) as (values
  ('2024-01-08'::date), ('2024-06-15'), ('2024-12-01'), ('2025-06-01'),
  ('2026-03-01'), ('2026-07-27'), ('2026-07-31'), ('2026-08-04'),
  ('2026-08-17'), ('2026-09-01'), ('2026-09-04'), ('2026-09-08')
),
filiais(f) as (values (null::smallint), (1::smallint), (2), (3), (4), (5), (6)),
saida as (
  select d.d, f.f,
         (select md5(coalesce(string_agg(
                  r.ativo_id::text || '|' || r.categoria::text || '|' || coalesce(r.marca,'-') || '|' ||
                  coalesce(r.modelo,'-') || '|' || coalesce(r.filial_id::text,'-') || '|' ||
                  r.status::text || '|' || coalesce(r.colaborador,'-') || '|' || coalesce(r.setor,'-'),
                  ',' order by r.ativo_id), 'VAZIO'))
            from public.rel_estoque_asof(f.f::smallint, d.d) r) as impressao,
         (select count(*) from public.rel_estoque_asof(f.f::smallint, d.d) r) as linhas
    from datas d cross join filiais f
)
select d::text as data, coalesce(f::text, 'geral') as filial, linhas, impressao
  from saida order by d, coalesce(f, 0);
