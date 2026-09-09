-- O CONJUNTO DOS ESTORNAVEIS, ativo a ativo, sob as tres reguas candidatas.
-- "Estornavel" = a movimentacao que a trava de aplicar_movimentacao aceitaria como
-- "a ultima" do ativo (o EXISTS de 0110:124-126 nao encontra nada depois dela).
-- Reproduz o filtro REAL da trava: sem filtro de tipo, sem filtro de estornada.
with r as (
  select m.*, row_number() over (order by m.data, m.created_at, (m.tipo = 'ajuste'), m.id) as ord
    from public.movimentacoes m
),
hoje  as (select distinct on (ativo_id) ativo_id, id, tipo, data, created_at from r order by ativo_id, created_at desc, id desc),
nova  as (select distinct on (ativo_id) ativo_id, id, tipo, data, created_at from r order by ativo_id, created_at desc, ord desc),
pura  as (select distinct on (ativo_id) ativo_id, id, tipo, data, created_at from r order by ativo_id, ord desc)
select
  count(*)                                                                as ativos,
  count(*) filter (where h.id = n.id)                                     as identicos_hoje_x_nova,
  count(*) filter (where h.id <> n.id)                                    as mudam_hoje_x_nova,
  count(*) filter (where h.id <> n.id and h.created_at = n.created_at)    as mudam_com_empate,
  count(*) filter (where h.id <> n.id and h.created_at <> n.created_at)   as mudam_sem_empate,
  count(*) filter (where h.id <> n.id and n.tipo = 'ajuste')              as nova_aponta_ajuste,
  count(*) filter (where h.id <> p.id)                                    as mudam_hoje_x_pura,
  count(*) filter (where n.id <> p.id)                                    as nova_x_pura,
  count(*) filter (where n.id <> p.id and n.created_at <> p.created_at)   as nova_x_pura_sem_empate
from hoje h join nova n using (ativo_id) join pura p using (ativo_id);
