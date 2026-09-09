with r as (
  select m.*, row_number() over (order by m.data, m.created_at, (m.tipo = 'ajuste'), m.id) as ordem
  from public.movimentacoes m
),
hoje as (select distinct on (ativo_id) ativo_id, id, tipo, data, created_at from r order by ativo_id, created_at desc, id desc),
mista as (select distinct on (ativo_id) ativo_id, id, tipo, data, created_at from r order by ativo_id, created_at desc, ordem desc),
pura  as (select distinct on (ativo_id) ativo_id, id, tipo, data, created_at from r order by ativo_id, ordem desc)
select
  count(*) as ativos,
  count(*) filter (where h.id <> m.id) as hoje_x_mista,
  count(*) filter (where h.id <> p.id) as hoje_x_pura,
  count(*) filter (where m.id <> p.id) as mista_x_pura,
  count(*) filter (where h.created_at = m.created_at and h.id <> m.id) as hoje_x_mista_com_empate,
  count(*) filter (where h.created_at <> p.created_at) as hoje_x_pura_sem_empate
from hoje h join mista m using (ativo_id) join pura p using (ativo_id);
