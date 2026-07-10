-- Migration 0004 — maquina de estados (regra de negocio no Postgres).
-- A UI e a segunda linha de defesa, nunca a unica (CLAUDE.md). Origem:
-- supabase/schema.sql. `handle_new_user` NAO entra aqui (ja existe na 0001).
-- Aplicar no projeto de DESENVOLVIMENTO.

-- Transicoes validas (estado_atual + tipo -> estado resultante).
-- Regra de negocio no. 2 da especificacao (spec secao 4). Retorna NULL quando
-- a transicao e invalida; 'ajuste'/'estorno' retornam NULL e sao tratados no trigger.
create or replace function public.status_apos_movimentacao(
  p_status public.status_ativo,
  p_tipo   public.tipo_movimentacao
) returns public.status_ativo
language plpgsql immutable as $$
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
    when p_tipo in ('ajuste','estorno')                                               then null -- tratados no trigger
    else null
  end;
end $$;

-- Aplica a movimentacao ao ativo (deriva o estado). SECURITY DEFINER para poder
-- atualizar `ativos` mesmo com RLS restrita a aplicacao.
create or replace function public.aplicar_movimentacao()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ativo  public.ativos%rowtype;
  v_orig   public.movimentacoes%rowtype;
  v_novo   public.status_ativo;
begin
  select * into v_ativo from public.ativos where id = new.ativo_id for update;

  -- Snapshot do estado ANTES desta movimentacao (auditoria + estorno completo)
  new.snapshot_anterior := jsonb_build_object(
    'status',      v_ativo.status,
    'colaborador', v_ativo.colaborador_atual,
    'setor',       v_ativo.setor_atual,
    'filial_id',   v_ativo.filial_id);

  -- ESTORNO: restaura o estado completo anterior a movimentacao original.
  -- Regra 6 da especificacao: so a ultima movimentacao efetiva do ativo.
  if new.tipo = 'estorno' then
    if new.estorno_de is null then
      raise exception 'Estorno exige referencia a movimentacao original (estorno_de)';
    end if;
    select * into v_orig from public.movimentacoes where id = new.estorno_de;
    if v_orig.id is null or v_orig.ativo_id <> new.ativo_id then
      raise exception 'estorno_de precisa apontar para uma movimentacao do MESMO ativo';
    end if;
    if v_orig.tipo = 'estorno' or v_orig.snapshot_anterior is null then
      raise exception 'Esta movimentacao nao pode ser estornada';
    end if;
    if v_orig.status_resultante is distinct from v_ativo.status then
      raise exception 'So a ultima movimentacao efetiva do ativo pode ser estornada (use ajuste, com justificativa)';
    end if;
    update public.ativos set
      status            = (v_orig.snapshot_anterior ->> 'status')::public.status_ativo,
      colaborador_atual = v_orig.snapshot_anterior ->> 'colaborador',
      setor_atual       = v_orig.snapshot_anterior ->> 'setor',
      filial_id         = (v_orig.snapshot_anterior ->> 'filial_id')::smallint,
      updated_at        = now()
    where id = new.ativo_id;
    new.status_anterior   := v_ativo.status;
    new.status_resultante := (v_orig.snapshot_anterior ->> 'status')::public.status_ativo;
    return new;
  end if;

  if new.tipo = 'ajuste' then
    -- Ajuste manual: status_resultante vem preenchido + observacao obrigatoria
    if new.status_resultante is null or new.observacao is null then
      raise exception 'Ajuste exige status_resultante e observacao (justificativa)';
    end if;
    v_novo := new.status_resultante;
  else
    v_novo := public.status_apos_movimentacao(v_ativo.status, new.tipo);
    if v_novo is null then
      raise exception 'Movimentacao % invalida para ativo % no estado %',
        new.tipo, v_ativo.patrimonio, v_ativo.status;
    end if;
  end if;

  new.status_anterior   := v_ativo.status;
  new.status_resultante := v_novo;

  update public.ativos set
    status            = v_novo,
    colaborador_atual = case
      when new.tipo in ('saida','emprestimo','reserva') then new.colaborador
      when new.tipo in ('devolucao','triagem_ok','descarte','envio_manutencao') then null
      else colaborador_atual end,
    setor_atual       = case
      when new.tipo in ('saida','emprestimo','reserva') then new.setor
      when new.tipo in ('devolucao','triagem_ok','descarte','envio_manutencao') then null
      else setor_atual end,
    filial_id         = case
      when new.tipo = 'compra'        then new.filial_id                        -- regra 8: fixa a filial que recebeu
      when new.tipo = 'transferencia' then coalesce(new.filial_destino_id, filial_id)
      else filial_id end,
    -- Regra 3: itens faltantes na devolucao viram pendencia; triagem_ok limpa
    pendencia         = case
      when new.tipo = 'devolucao'
           and coalesce(cardinality(new.itens_faltantes), 0) > 0
        then 'itens faltantes: ' || array_to_string(new.itens_faltantes, ', ')
      when new.tipo = 'triagem_ok' then null
      else pendencia end,
    termo_assinado    = coalesce(new.termo_assinado, termo_assinado),
    termo_data        = coalesce(new.termo_data, termo_data),
    updated_at        = now()
  where id = new.ativo_id;

  return new;
end $$;

create trigger trg_aplicar_movimentacao
  before insert on public.movimentacoes
  for each row execute function public.aplicar_movimentacao();
