-- Migration 0023 — estorno restaura TAMBÉM pendencia/termo_assinado/termo_data
-- (achado da revisão de código, 14/07/2026).
--
-- BUG: o snapshot_anterior (0004) só guardava status/colaborador/setor/filial_id,
-- então o estorno não desfazia campos derivados que a movimentação original
-- mexia. Ex.: devolução com itens faltantes grava pendencia="itens faltantes:
-- carregador"; ao estornar essa devolução o ativo voltava a em_uso mas a pendência
-- FANTASMA permanecia (e reaparecia em v_pendencias). Idem termo_assinado/data.
-- A regra 6 da spec fala em "restaurar o estado completo anterior" — não era.
--
-- FIX: (1) o snapshot passa a incluir os três campos. (2) o estorno restaura cada
-- um SÓ se a chave existir no snapshot (operador `?`) — assim estornos de
-- movimentações ANTIGAS (snapshots gravados antes desta migration, sem as chaves)
-- preservam o valor corrente em vez de zerá-lo (compatível para trás). Aditiva,
-- recria a função/trigger. Aplicar em DESENVOLVIMENTO.

create or replace function public.aplicar_movimentacao()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ativo  public.ativos%rowtype;
  v_orig   public.movimentacoes%rowtype;
  v_novo   public.status_ativo;
begin
  select * into v_ativo from public.ativos where id = new.ativo_id for update;

  -- Snapshot do estado ANTES desta movimentacao (auditoria + estorno completo).
  -- Inclui pendencia/termo_* para que o estorno seja um inverso completo (0023).
  new.snapshot_anterior := jsonb_build_object(
    'status',         v_ativo.status,
    'colaborador',    v_ativo.colaborador_atual,
    'setor',          v_ativo.setor_atual,
    'filial_id',      v_ativo.filial_id,
    'pendencia',      v_ativo.pendencia,
    'termo_assinado', v_ativo.termo_assinado,
    'termo_data',     v_ativo.termo_data);

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
    -- Regra 6: so a ULTIMA movimentacao efetiva pode ser estornada. Checagem REAL
    -- (nao existe movimentacao posterior deste ativo). O proxy por status_resultante
    -- falhava quando duas movs seguidas terminavam no MESMO status (ex.: saida ->
    -- transferencia, ambas em_uso), deixando estornar uma mov nao-ultima e corromper
    -- o ativo. Ordena por (created_at, id): em producao cada mov e uma transacao
    -- separada, entao created_at e monotonico por ativo.
    if exists (
      select 1 from public.movimentacoes m
      where m.ativo_id = new.ativo_id
        and (m.created_at, m.id) > (v_orig.created_at, v_orig.id)
    ) then
      raise exception 'So a ultima movimentacao efetiva do ativo pode ser estornada (use ajuste, com justificativa)';
    end if;
    update public.ativos set
      status            = (v_orig.snapshot_anterior ->> 'status')::public.status_ativo,
      colaborador_atual = v_orig.snapshot_anterior ->> 'colaborador',
      setor_atual       = v_orig.snapshot_anterior ->> 'setor',
      filial_id         = (v_orig.snapshot_anterior ->> 'filial_id')::smallint,
      -- Campos derivados abaixo: restaura SÓ se a chave existir no snapshot
      -- (snapshots antigos nao a tem -> preserva o valor corrente, sem regressao).
      pendencia         = case when v_orig.snapshot_anterior ? 'pendencia'
                               then v_orig.snapshot_anterior ->> 'pendencia'
                               else pendencia end,
      termo_assinado    = case when v_orig.snapshot_anterior ? 'termo_assinado'
                               then (v_orig.snapshot_anterior ->> 'termo_assinado')::public.termo_status
                               else termo_assinado end,
      termo_data        = case when v_orig.snapshot_anterior ? 'termo_data'
                               then (v_orig.snapshot_anterior ->> 'termo_data')::date
                               else termo_data end,
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

-- O trigger trg_aplicar_movimentacao (0004) segue apontando para esta função
-- (create or replace preserva o binding); não é preciso recriá-lo.
