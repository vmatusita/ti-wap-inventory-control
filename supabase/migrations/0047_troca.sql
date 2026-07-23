-- Migration 0047 — usos do valor 'troca' (OS-F15, C3). Depende da 0046 (valor de enum
-- 'troca' já COMMITADO numa transação anterior). Tudo aqui é recriação de função por
-- `create or replace` PURO (assinatura idêntica → sem overload; pg_proc segue 1 linha
-- por função). NÃO toca dado — só muda o corpo das funções (movimentações FUTURAS).
-- Caminho A do docs/RUNBOOK-BANCO.md (ensaio → produção).
--
-- 'troca' ESPELHA 'compra' na máquina de estados (nascimento em_estoque -> em_estoque)
-- e na fixação da filial. DIFERE só no rótulo/cor (lado TS) e em qualquer leitura de
-- "o que foi comprado" (nenhuma função SQL aqui conta compras). O retroativo das trocas
-- JÁ registradas (substitutos que nasceram como `compra`) NÃO está aqui — é UPDATE de
-- dado (caminho B), aplicado à parte pelo orquestrador (§1.4 da ordem).

-- ============================================================================
-- C3 — máquina de estados: status_apos_movimentacao
-- ============================================================================
-- Base: corpo VIGENTE (0045). DIFF vs 0045 = SÓ uma linha nova: o nascimento por
-- `troca` (em_estoque -> em_estoque), espelho exato da `compra` logo acima. Qualquer
-- outra diferença é BUG. Assinatura idêntica (create or replace puro).
create or replace function public.status_apos_movimentacao(
  p_status public.status_ativo,
  p_tipo   public.tipo_movimentacao
) returns public.status_ativo
language plpgsql immutable set search_path = public as $$
begin
  return case
    when p_tipo = 'compra'             and p_status in ('em_estoque')                 then 'em_estoque'
    when p_tipo = 'troca'              and p_status in ('em_estoque')                 then 'em_estoque'
    when p_tipo = 'saida'              and p_status in ('em_estoque','reservado','em_triagem') then 'em_uso'
    when p_tipo = 'emprestimo'         and p_status in ('em_estoque','reservado')     then 'emprestado'
    when p_tipo = 'reserva'            and p_status in ('em_estoque')                 then 'reservado'
    when p_tipo = 'devolucao'          and p_status in ('em_uso','emprestado')        then 'em_triagem'
    when p_tipo = 'triagem_ok'         and p_status in ('em_triagem')                 then 'em_estoque'
    when p_tipo = 'envio_manutencao'   and p_status in ('em_estoque','em_triagem','em_uso','defasado') then 'em_manutencao'
    when p_tipo = 'retorno_manutencao' and p_status in ('em_manutencao')              then 'em_estoque'
    when p_tipo = 'devolucao_fornecedor' and p_status in ('em_manutencao')            then 'devolvido_fornecedor'
    when p_tipo = 'marcar_defasado'    and p_status in ('em_estoque','em_triagem','em_manutencao') then 'defasado'
    when p_tipo = 'descarte'           and p_status in ('em_estoque','em_triagem','em_manutencao','defasado') then 'descartado'
    when p_tipo = 'transferencia'      and p_status not in ('descartado','devolvido_fornecedor') then p_status
    when p_tipo in ('ajuste','estorno')                                               then null
    else null
  end;
end $$;

-- ============================================================================
-- C3 — aplicar_movimentacao: 'troca' fixa a filial que recebeu (espelho da compra)
-- ============================================================================
-- Base: corpo VIGENTE (0045). DIFF vs 0045 = SÓ a regra da filial:
--   `when new.tipo = 'compra' then new.filial_id`  ->  `when new.tipo in ('compra','troca')`.
-- 'troca' é nascimento, como a compra: a movimentação carrega a filial que recebeu o
-- substituto e ela deve fixar a filial do ativo. NADA MAIS muda (as listas de zeramento
-- de colaborador/setor não citam compra nem troca — o nascimento cai no `else`, mantendo
-- o detentor nulo do ativo recém-inserido). Qualquer outra diferença é BUG. Assinatura
-- idêntica (create or replace puro).
create or replace function public.aplicar_movimentacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
      when new.tipo in ('devolucao','triagem_ok','descarte','envio_manutencao','devolucao_fornecedor') then null
      else colaborador_atual end,
    setor_atual       = case
      when new.tipo in ('saida','emprestimo','reserva') then new.setor
      when new.tipo in ('devolucao','triagem_ok','descarte','envio_manutencao','devolucao_fornecedor') then null
      else setor_atual end,
    filial_id         = case
      when new.tipo in ('compra','troca') then new.filial_id                    -- regra 8: fixa a filial que recebeu (troca = nascimento, espelho da compra)
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

-- ============================================================================
-- C3 — rel_estoque_asof: 'troca' entra no coalesce da filial (espelho da compra)
-- ============================================================================
-- Base: corpo VIGENTE (0045). DIFF vs 0045 = SÓ a cláusula da filial no coalesce:
--   `when u.tipo = 'compra' then u.filial_id` -> `when u.tipo in ('compra','troca')`.
-- 'troca' é nascimento (fixa a filial), como a compra. As cláusulas de colaborador/setor
-- e o WHERE final NÃO mudam (compra e troca caem no `else` do colaborador, que lê o
-- snapshot — nulo no nascimento). Qualquer outra diferença é BUG. Assinatura idêntica.
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
      (u.ativo_id is not null) as existe,
      coalesce(
        case
          when u.tipo = 'transferencia' then u.filial_destino_id
          when u.tipo in ('compra','troca') then u.filial_id
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
  where existe
    and status not in ('descartado', 'devolvido_fornecedor')
    and (p_filial is null or filial_id = p_filial);
$$;

revoke all on function public.rel_estoque_asof(smallint, date)    from public;
grant execute on function public.rel_estoque_asof(smallint, date) to authenticated, service_role;

-- ============================================================================
-- C3 — devolver_ao_fornecedor: o substituto nasce por `troca`, não `compra`
-- ============================================================================
-- Base: corpo VIGENTE (0045). DIFF vs 0045 = SÓ o `tipo` da movimentação do substituto:
--   'compra' -> 'troca' (mais o comentário). Toda a lógica (herança de fornecedor,
--   vínculo de sucessão, rollback total na colisão) NÃO muda. Qualquer outra diferença
--   é BUG. Assinatura idêntica (create or replace puro).
create or replace function public.devolver_ao_fornecedor(
  p_ativo_id   uuid,    -- ativo em manutenção
  p_mov        jsonb,   -- {data, chamado, chamado_fornecedor, observacao}
  p_substituto jsonb,   -- null = sem substituto; senão {patrimonio, service_tag, categoria,
                        --  marca, modelo, memoria, armazenamento, processador, hostname,
                        --  filial_id, observacoes, data, observacao}
  p_criado_por uuid
) returns table (mov_id uuid, substituto_id uuid, substituto_mov_id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_antigo     public.ativos%rowtype;
  v_uid        uuid := coalesce(auth.uid(), p_criado_por);
  v_sub_filial smallint;
begin
  select * into v_antigo from public.ativos where id = p_ativo_id;
  if v_antigo.id is null then
    raise exception 'Ativo % não encontrado para devolução ao fornecedor.', p_ativo_id;
  end if;

  -- (1) devolução ao fornecedor no ativo ANTIGO. O trigger valida a transição
  --     (em_manutencao -> devolvido_fornecedor) e atualiza o estado; se o ativo não
  --     estiver em_manutencao, status_apos_movimentacao devolve null e o trigger levanta
  --     'Movimentacao ... invalida' -> rollback total (a UI faz a pré-checagem amigável).
  insert into public.movimentacoes (
    ativo_id, tipo, data, filial_id, chamado, chamado_fornecedor, observacao, criado_por
  ) values (
    p_ativo_id, 'devolucao_fornecedor',
    coalesce((p_mov->>'data')::date, current_date),
    v_antigo.filial_id,
    nullif(p_mov->>'chamado', ''),
    nullif(p_mov->>'chamado_fornecedor', ''),
    nullif(p_mov->>'observacao', ''),
    v_uid
  ) returning id into mov_id;

  -- (2) substituto (opcional). fornecedor é HERDADO do antigo (no servidor), NÃO do payload.
  if p_substituto is not null and jsonb_typeof(p_substituto) = 'object' then
    v_sub_filial := coalesce((p_substituto->>'filial_id')::smallint, v_antigo.filial_id);

    insert into public.ativos (
      patrimonio, service_tag, categoria, marca, modelo,
      memoria, armazenamento, processador, hostname,
      fornecedor, filial_id, origem, observacoes, substitui_ativo_id
    ) values (
      nullif(p_substituto->>'patrimonio', ''),
      nullif(p_substituto->>'service_tag', ''),
      (p_substituto->>'categoria')::public.categoria_ativo,
      nullif(p_substituto->>'marca', ''),
      nullif(p_substituto->>'modelo', ''),
      nullif(p_substituto->>'memoria', ''),
      nullif(p_substituto->>'armazenamento', ''),
      nullif(p_substituto->>'processador', ''),
      nullif(p_substituto->>'hostname', ''),
      v_antigo.fornecedor,          -- herdado do antigo (servidor)
      v_sub_filial,
      'cadastro',
      nullif(p_substituto->>'observacoes', ''),
      p_ativo_id                    -- vínculo de sucessão
    ) returning id into substituto_id;

    -- Movimentação `troca` do substituto (F15): entrada real do período (sem marcador de
    -- import → aparece nas Entradas do relatório, rotulada "Troca" — NUNCA "Compra": o
    -- equipamento chegou por substituição do fornecedor, não por compra). O trigger valida
    -- em_estoque -> em_estoque (nascimento, espelho da compra na máquina de estados).
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
    values (
      substituto_id, 'troca',
      coalesce((p_substituto->>'data')::date, current_date),
      v_sub_filial,
      nullif(p_substituto->>'observacao', ''),
      v_uid
    ) returning id into substituto_mov_id;
  end if;

  return next;
end $$;

-- EXECUTE só para `authenticated` (operador logado). anon/service_role NÃO executam
-- (é escrita; a sessão por senha do relatório nunca chega aqui).
revoke all on function public.devolver_ao_fornecedor(uuid, jsonb, jsonb, uuid) from public, anon, service_role;
grant execute on function public.devolver_ao_fornecedor(uuid, jsonb, jsonb, uuid) to authenticated;
