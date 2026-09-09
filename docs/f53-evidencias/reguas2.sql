with r as (
  select m.*, row_number() over (order by m.data, m.created_at, (m.tipo = 'ajuste'), m.id) as ordem
  from public.movimentacoes m
),
hoje  as (select distinct on (ativo_id) ativo_id, id, tipo from r order by ativo_id, created_at desc, id desc),
mista as (select distinct on (ativo_id) ativo_id, id, tipo from r order by ativo_id, created_at desc, ordem desc)
select
  -- nos 643 que mudam, a regua NOVA aponta para que tipo? e ela concorda com ativos.status?
  count(*) filter (where h.id <> m.id) as mudam,
  count(*) filter (where h.id <> m.id and m.tipo = 'ajuste') as nova_escolhe_ajuste,
  count(*) filter (where h.id <> m.id and h.tipo = 'ajuste') as hoje_escolhia_ajuste,
  -- a prova de que apagar_movimentacao nao precisa mudar: em quantos ativos o desempate
  -- e alcancavel, isto e, ha empate de created_at? (a recusa de 0090:173 barra TODOS eles)
  (select count(distinct ativo_id) from r a
    where exists (select 1 from r b where b.ativo_id=a.ativo_id and b.id<>a.id and b.created_at=a.created_at)) as ativos_com_empate_created_at
from hoje h join mista m using (ativo_id);
