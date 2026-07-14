-- Migration 0022 — corrige rel_estoque_asof: só reconstrói ativos que JÁ EXISTIAM
-- na data de corte (achado da revisão de código, 14/07/2026).
--
-- BUG: a 0016 fazia `left join ult u` (todos os ativos) e materializava quem não
-- tinha movimentação efetiva até p_data como `coalesce(u.status_resultante,
-- 'em_estoque')` na filial ATUAL. Como todo ativo nasce por uma movimentação
-- `compra`, um ativo comprado DEPOIS de p_data entrava no snapshot histórico —
-- inflando o estoque de qualquer relatório de período passado (ex.: relatório de
-- janeiro gerado em julho contava tudo que foi comprado de fev a jul). O caminho
-- "rápido" (período terminando hoje, estado atual) nunca usa esta RPC, então o
-- relatório semanal do dia a dia não era afetado — só a reconstrução as-of.
--
-- FIX: um ativo só existe as-of p_data se teve ao menos uma movimentação EFETIVA
-- (não estornada) com data <= p_data. Mantém o left join para preservar a
-- derivação de estado idêntica à 0016; apenas filtra pela existência. Aditiva,
-- não altera assinatura (tipos gerados inalterados). Aplicar em DESENVOLVIMENTO.

create or replace function public.rel_estoque_asof(
  p_filial smallint,
  p_data   date
) returns table (
  ativo_id    uuid,
  categoria   public.categoria_ativo,
  marca       text,
  modelo      text,
  filial_id   smallint,
  status      public.status_ativo,
  colaborador text,
  setor       text
) language sql stable security invoker set search_path = public as $$
  with efetivas as (
    select m.*
    from public.movimentacoes m
    where m.data <= p_data
      and m.tipo <> 'estorno'
      and not exists (
        select 1 from public.movimentacoes e
        where e.estorno_de = m.id and e.data <= p_data
      )
  ),
  ult as (
    select distinct on (e.ativo_id) e.*
    from efetivas e
    order by e.ativo_id, e.data desc, e.created_at desc, e.id desc
  ),
  estado as (
    select
      a.id  as ativo_id,
      a.categoria,
      a.marca,
      a.modelo,
      -- Só existe as-of quem teve movimentação efetiva <= p_data (nasce na compra).
      (u.ativo_id is not null) as existe,
      coalesce(
        case
          when u.tipo = 'transferencia' then u.filial_destino_id
          when u.tipo = 'compra'        then u.filial_id
          when u.snapshot_anterior ? 'filial_id'
            then nullif(u.snapshot_anterior ->> 'filial_id', '')::smallint
          else a.filial_id
        end,
        a.filial_id
      ) as filial_id,
      coalesce(u.status_resultante, 'em_estoque') as status,
      case
        when u.tipo in ('saida', 'emprestimo', 'reserva') then u.colaborador
        when u.tipo in ('devolucao', 'triagem_ok', 'descarte', 'envio_manutencao') then null
        when u.tipo is null then null
        else u.snapshot_anterior ->> 'colaborador'
      end as colaborador,
      case
        when u.tipo in ('saida', 'emprestimo', 'reserva') then u.setor
        when u.tipo in ('devolucao', 'triagem_ok', 'descarte', 'envio_manutencao') then null
        when u.tipo is null then null
        else u.snapshot_anterior ->> 'setor'
      end as setor
    from public.ativos a
    left join ult u on u.ativo_id = a.id
  )
  select ativo_id, categoria, marca, modelo, filial_id, status, colaborador, setor
  from estado
  where existe                       -- << ativo não existente as-of não entra
    and status <> 'descartado'
    and (p_filial is null or filial_id = p_filial);
$$;

revoke all on function public.rel_estoque_asof(smallint, date)    from public;
grant execute on function public.rel_estoque_asof(smallint, date) to authenticated, service_role;
