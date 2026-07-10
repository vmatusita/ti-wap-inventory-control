-- Migration 0006 — views de relatorio.
-- `security_invoker = true`: a view roda com os privilegios de quem consulta
-- (respeita a RLS do chamador) — requer Postgres >= 15. Origem: supabase/schema.sql.
-- (v_kpis_filial fica para a F3, junto dos cards do relatorio.) Aplicar no DEV.

-- Estoque atual agregado por filial/categoria/status.
create or replace view public.v_estoque_atual
with (security_invoker = true) as
select f.slug as filial, a.categoria, a.status, count(*) as total
from public.ativos a
join public.filiais f on f.id = a.filial_id
group by f.slug, a.categoria, a.status;

-- Movimentacoes por mes. Transferencia conta no relatorio das DUAS filiais
-- (origem e destino) — regra 5.
create or replace view public.v_movimentacoes_mes
with (security_invoker = true) as
select f.slug as filial,
       date_trunc('month', m.data)::date as mes,
       m.tipo,
       count(*) as total
from (
  select data, tipo, filial_id from public.movimentacoes
  union all
  select data, tipo, filial_destino_id
  from public.movimentacoes
  where tipo = 'transferencia' and filial_destino_id is not null
) m
join public.filiais f on f.id = m.filial_id
group by 1, 2, 3;

-- Pendencias: triagem parada (>7 dias), termo nao assinado em ativo em uso,
-- e o campo livre ativos.pendencia (spec secao 5).
create or replace view public.v_pendencias
with (security_invoker = true) as
select a.id, a.patrimonio, a.categoria, f.slug as filial, a.status,
       case
         when a.status = 'em_triagem'
              and a.updated_at < now() - interval '7 days' then 'triagem parada'
         -- termo nunca informado (null) tambem e pendencia — spec secao 5
         when (a.termo_assinado in ('nao','enviado') or a.termo_assinado is null)
              and a.status in ('em_uso','emprestado')       then 'termo pendente'
         when a.pendencia is not null                        then a.pendencia
       end as pendencia
from public.ativos a
join public.filiais f on f.id = a.filial_id
where (a.status = 'em_triagem' and a.updated_at < now() - interval '7 days')
   or ((a.termo_assinado in ('nao','enviado') or a.termo_assinado is null)
       and a.status in ('em_uso','emprestado'))
   or a.pendencia is not null;
