-- Migration 0024 — fixa search_path em criar_compra_lote e valida_lancamento_item
-- (achado da revisão de código, 14/07/2026 — advisor "function_search_path_mutable").
--
-- As demais funções do schema já usam `set search_path = public`; três não usavam
-- (criar_compra_lote, valida_lancamento_item, status_apos_movimentacao). Recria as
-- funções com o corpo idêntico ao vigente (0004 / 0008 / 0019), só acrescentando o
-- `set search_path` (evita que objetos plantados num schema anterior no search_path
-- sequestrem a resolução de nome). status_apos_movimentacao é IMMUTABLE e pura (só
-- um CASE, sem acesso a objeto) — risco praticamente nulo, fixado por completude do
-- advisor. Aditiva. Aplicar em DESENVOLVIMENTO.

-- ---------- status_apos_movimentacao (corpo da 0004) ----------
create or replace function public.status_apos_movimentacao(
  p_status public.status_ativo,
  p_tipo   public.tipo_movimentacao
) returns public.status_ativo
language plpgsql immutable set search_path = public as $$
begin
  return case
    when p_tipo = 'compra'             and p_status in ('em_estoque')                 then 'em_estoque'
    when p_tipo = 'saida'              and p_status in ('em_estoque','reservado','em_triagem') then 'em_uso'
    when p_tipo = 'emprestimo'         and p_status in ('em_estoque','reservado')     then 'emprestado'
    when p_tipo = 'reserva'            and p_status in ('em_estoque')                 then 'reservado'
    when p_tipo = 'devolucao'          and p_status in ('em_uso','emprestado')        then 'em_triagem'
    when p_tipo = 'triagem_ok'         and p_status in ('em_triagem')                 then 'em_estoque'
    when p_tipo = 'envio_manutencao'   and p_status in ('em_estoque','em_triagem','em_uso','defasado') then 'em_manutencao'
    when p_tipo = 'retorno_manutencao' and p_status in ('em_manutencao')              then 'em_estoque'
    when p_tipo = 'marcar_defasado'    and p_status in ('em_estoque','em_triagem','em_manutencao') then 'defasado'
    when p_tipo = 'descarte'           and p_status in ('em_estoque','em_triagem','em_manutencao','defasado') then 'descartado'
    when p_tipo = 'transferencia'      and p_status not in ('descartado')             then p_status
    when p_tipo in ('ajuste','estorno')                                               then null
    else null
  end;
end $$;

-- ---------- criar_compra_lote (corpo da 0008) ----------
create or replace function public.criar_compra_lote(
  p_itens      jsonb,
  p_criado_por uuid
)
returns table (ativo_id uuid, patrimonio text)
language plpgsql
set search_path = public
as $$
declare
  item     jsonb;
  v_id     uuid;
  v_filial smallint;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Lote de compra vazio';
  end if;

  for item in select * from jsonb_array_elements(p_itens)
  loop
    v_filial := (item->>'filial_id')::smallint;

    insert into public.ativos (
      patrimonio, patrimonio_original, service_tag, categoria, marca, modelo,
      memoria, armazenamento, processador, fornecedor, filial_id, origem, observacoes
    ) values (
      item->>'patrimonio',
      nullif(item->>'patrimonio_original', ''),
      nullif(item->>'service_tag', ''),
      (item->>'categoria')::public.categoria_ativo,
      nullif(item->>'marca', ''),
      nullif(item->>'modelo', ''),
      nullif(item->>'memoria', ''),
      nullif(item->>'armazenamento', ''),
      nullif(item->>'processador', ''),
      nullif(item->>'fornecedor', ''),
      v_filial,
      'cadastro',
      nullif(item->>'observacoes', '')
    )
    returning id into v_id;

    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
    values (
      v_id, 'compra',
      coalesce((item->>'data')::date, current_date),
      v_filial,
      nullif(item->>'observacao', ''),
      p_criado_por
    );

    ativo_id   := v_id;
    patrimonio := item->>'patrimonio';
    return next;
  end loop;
end $$;

revoke all on function public.criar_compra_lote(jsonb, uuid) from public;
grant execute on function public.criar_compra_lote(jsonb, uuid) to authenticated;

-- ---------- valida_lancamento_item (corpo da 0019) ----------
create or replace function public.valida_lancamento_item()
returns trigger
language plpgsql
set search_path = public
as $$
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

-- O trigger trg_valida_lancamento_item (0015) segue apontando para esta função.
