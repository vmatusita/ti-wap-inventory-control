-- Migration 0019 — correções da revisão adversarial do F3B (aditiva).
--
-- (1) valida_lancamento_item: serializa inserções concorrentes no mesmo par
--     item×filial com pg_advisory_xact_lock (antes do SELECT do saldo). Sem
--     isso, sob READ COMMITTED duas saídas concorrentes leem o mesmo saldo e
--     ambas passam → saldo negativo (TOCTOU). É o equivalente ao "FOR UPDATE"
--     que a 0004 (aplicar_movimentacao) usa na linha do ativo. O lock é por
--     (item_id, filial_id) e cobre tanto o guard de saldo quanto o de liberação.
--
-- (2) rel_saldo_itens: clampa o saldo AS-OF com greatest(0, ·). Como a data do
--     lançamento é livre, uma saída retroativa fora de ordem (data anterior à
--     entrada que a supre) passa no trigger (o total corrente segue >= 0) mas
--     deixa o saldo de um p_ate intermediário negativo — e, sem clamp, inflava
--     falsamente a "falta" (falta = max(0, atrelados − saldo)). Atrelados e
--     falta já eram clampados; saldo era a única coluna sem clamp.
--
-- Aplicar no projeto de DESENVOLVIMENTO.

create or replace function public.valida_lancamento_item()
returns trigger
language plpgsql as $$
declare
  v_saldo       int;
  v_reserva_net int;
begin
  -- Serializa concorrência no mesmo saldo (par item×filial) — sem isso, duas
  -- inserções simultâneas leem o saldo antigo e ambas passam (TOCTOU).
  perform pg_advisory_xact_lock(new.item_id::int, new.filial_id::int);

  select coalesce(sum(case l.tipo
           when 'entrada' then l.quantidade
           when 'saida'   then -l.quantidade
           when 'ajuste'  then l.quantidade
           else 0 end), 0)
    into v_saldo
    from public.lancamentos_item l
    where l.item_id = new.item_id and l.filial_id = new.filial_id;

  v_saldo := v_saldo + case new.tipo
      when 'entrada' then new.quantidade
      when 'saida'   then -new.quantidade
      when 'ajuste'  then new.quantidade
      else 0 end;

  if v_saldo < 0 then
    raise exception
      'Saldo insuficiente: a operação deixaria o item com saldo % (não pode ficar negativo).',
      v_saldo
      using errcode = 'check_violation';
  end if;

  if new.tipo = 'liberacao' then
    select coalesce(sum(case l.tipo
             when 'reserva'   then l.quantidade
             when 'liberacao' then -l.quantidade
             else 0 end), 0)
      into v_reserva_net
      from public.lancamentos_item l
      where l.item_id = new.item_id
        and l.filial_id = new.filial_id
        and l.chamado = new.chamado;

    if v_reserva_net - new.quantidade < 0 then
      raise exception
        'Liberação maior que a reserva aberta do chamado % (não há % para liberar).',
        new.chamado, new.quantidade
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

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
         greatest(0, coalesce(pi.saldo, 0))::bigint,
         coalesce(pi.atrelados, 0)::bigint,
         greatest(0, coalesce(pi.atrelados, 0) - greatest(0, coalesce(pi.saldo, 0)))::bigint
  from public.itens i
  left join por_item pi on pi.item_id = i.id
  where i.ativo = true or pi.item_id is not null
  order by i.grupo, i.ordem, i.nome;
$$;
