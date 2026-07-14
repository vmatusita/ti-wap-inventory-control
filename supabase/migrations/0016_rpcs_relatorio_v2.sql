-- Migration 0016 — RPCs de agregação do relatório v2 (F3B / plano §6.4 e §7).
-- Padrão da 0011: SECURITY INVOKER (operador respeita RLS; a sessão por senha
-- executa via client administrativo/service_role) + grant authenticated,
-- service_role. Todas aceitam `p_filial null` = consolidado (geral) e uma data
-- de corte para reconstrução AS-OF (o estoque "no último dia do período" continua
-- fiel meses depois). Aditiva. Aplicar no projeto de DESENVOLVIMENTO.

-- ---------- Itens: saldo / atrelados / falta AS-OF (Σ até p_ate) ----------
-- saldo     = Σ entrada − Σ saida ± ajuste (sinal)
-- atrelados = Σ_chamado max(0, Σreserva − Σliberacao − Σsaida)   (por item×filial)
-- falta     = max(0, atrelados − saldo)   — o "faltam N" do e-mail, automático.
-- Devolve TODOS os itens do catálogo (ativos, + inativos que tenham histórico),
-- ordenados por grupo/ordem/nome — o relatório mostra "0" quando o saldo zerou.
create or replace function public.rel_saldo_itens(
  p_filial smallint,
  p_ate    date
) returns table (
  item_id   smallint,
  item      text,
  grupo     public.grupo_item,
  ordem     int,
  saldo     bigint,
  atrelados bigint,
  falta     bigint
) language sql stable security invoker set search_path = public as $$
  with base as (
    select l.item_id, l.filial_id, l.chamado,
           sum(case l.tipo
                 when 'entrada' then l.quantidade
                 when 'saida'   then -l.quantidade
                 when 'ajuste'  then l.quantidade
                 else 0 end) as saldo_contrib,
           sum(case l.tipo
                 when 'reserva'   then l.quantidade
                 when 'liberacao' then -l.quantidade
                 when 'saida'     then -l.quantidade
                 else 0 end) as atrel_bucket
    from public.lancamentos_item l
    where l.data <= p_ate
      and (p_filial is null or l.filial_id = p_filial)
    group by l.item_id, l.filial_id, l.chamado
  ),
  por_item as (
    select item_id,
           sum(saldo_contrib)              as saldo,
           sum(greatest(0, atrel_bucket))  as atrelados
    from base
    group by item_id
  )
  select i.id, i.nome, i.grupo, i.ordem,
         coalesce(pi.saldo, 0)::bigint,
         coalesce(pi.atrelados, 0)::bigint,
         greatest(0, coalesce(pi.atrelados, 0) - coalesce(pi.saldo, 0))::bigint
  from public.itens i
  left join por_item pi on pi.item_id = i.id
  where i.ativo = true or pi.item_id is not null
  order by i.grupo, i.ordem, i.nome;
$$;

-- ---------- Itens: entradas × saídas por item NO PERÍODO ----------
-- Insumo da coluna "Δ período" (entradas − saidas) e do gráfico de barras
-- divergentes (entradas à direita, saídas à esquerda) dos grupos 2–3.
create or replace function public.rel_mov_itens(
  p_filial smallint,
  p_de     date,
  p_ate    date
) returns table (
  item_id  smallint,
  item     text,
  grupo    public.grupo_item,
  ordem    int,
  entradas bigint,
  saidas   bigint
) language sql stable security invoker set search_path = public as $$
  select i.id, i.nome, i.grupo, i.ordem,
         coalesce(sum(case when l.tipo = 'entrada' then l.quantidade else 0 end), 0)::bigint,
         coalesce(sum(case when l.tipo = 'saida'   then l.quantidade else 0 end), 0)::bigint
  from public.itens i
  left join public.lancamentos_item l
    on l.item_id = i.id
   and l.data between p_de and p_ate
   and (p_filial is null or l.filial_id = p_filial)
  group by i.id, i.nome, i.grupo, i.ordem
  order by i.grupo, i.ordem, i.nome;
$$;

-- ---------- Itens: carimbo de frescor por grupo (última data ≤ p_ate) ----------
-- "último lançamento em dd/MM" no rodapé de cada grupo — o dado confessa a
-- própria idade em vez de mentir quando ninguém lança.
create or replace function public.rel_frescor_itens(
  p_filial smallint,
  p_ate    date
) returns table (grupo public.grupo_item, ultima date)
language sql stable security invoker set search_path = public as $$
  select i.grupo, max(l.data) as ultima
  from public.lancamentos_item l
  join public.itens i on i.id = l.item_id
  where l.data <= p_ate
    and (p_filial is null or l.filial_id = p_filial)
  group by i.grupo;
$$;

-- ---------- Ativos: estado AS-OF (última movimentação efetiva ≤ p_data) ----------
-- Reconstrói o estado de cada ativo na data: descarta os estornos E as
-- movimentações que eles anulam (par mov+estorno se cancela — mesma semântica do
-- trigger 0004). Aplica a mesma derivação do trigger para status/colaborador/
-- setor/filial. `descartado` (baixa) não entra, como no estado atual (live).
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
  where status <> 'descartado'
    and (p_filial is null or filial_id = p_filial);
$$;

revoke all on function public.rel_saldo_itens(smallint, date)         from public;
revoke all on function public.rel_mov_itens(smallint, date, date)     from public;
revoke all on function public.rel_frescor_itens(smallint, date)       from public;
revoke all on function public.rel_estoque_asof(smallint, date)        from public;
grant execute on function public.rel_saldo_itens(smallint, date)      to authenticated, service_role;
grant execute on function public.rel_mov_itens(smallint, date, date)  to authenticated, service_role;
grant execute on function public.rel_frescor_itens(smallint, date)    to authenticated, service_role;
grant execute on function public.rel_estoque_asof(smallint, date)     to authenticated, service_role;
