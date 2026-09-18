-- =============================================================================
-- 0146 — o estorno de uma devolução cuja pendência de item já teve desfecho
-- =============================================================================
-- O ramo de ESTORNO do gatilho `aplicar_movimentacao` apaga as linhas de `pendencias_item`
-- que a movimentação estornada abriu (a devolução com itens faltantes, gatilho da 0051). Desde
-- a F38 (0119), RESOLVER uma pendência grava lançamentos de item com `pendencia_item_id`
-- apontando para ela — e essa chave estrangeira é NO ACTION, imediata (é a que a 0140 precisa
-- desarmar no import). Resultado: estornar uma devolução cuja pendência já foi resolvida (ou
-- resolvida e reaberta, porque o inverso da reabertura também grava `pendencia_item_id`)
-- estourava 23503 no DELETE, e o operador recebia o erro genérico, sem saber o porquê.
--
-- Mesmo que a FK deixasse, o estorno seria errado: os lançamentos do desfecho (o retorno do
-- item recuperado, o ajuste da baixa) ficariam de pé, mexendo no estoque de itens por causa de
-- uma devolução que o sistema passaria a dizer que nunca aconteceu. E `lancamentos_item` é
-- imutável fora da janela destrutiva (`guarda_acervo`, 0081) — desvincular aqui exigiria abrir
-- essa janela dentro de um gatilho de uso diário, o que esta migration não faz.
--
-- A ESCOLHA: recusar, cedo e com frase própria, ANTES de qualquer UPDATE. A frase é disjunta
-- das outras recusas do estorno ("nao pode ser estornada", "ultima movimentacao efetiva"), para
-- `traduzErroBanco` poder dar ao operador o caminho certo (ajuste com justificativa).
--
-- O QUE MUDA NO CORPO: um bloco `if exists (…) then raise …; end if;`, logo depois da trava
-- "só a última movimentação efetiva". O resto é o corpo VIVO da 0134, byte a byte — inclusive
-- a trava `(created_at, ordem)`, que a mutação `f53-trava-do-estorno-volta-ao-uuid` procura.
-- Pendência ainda ABERTA (sem lançamento) continua sendo apagada pelo estorno, como sempre
-- (roteiro `pendencias_item.sql`, cenário 5).
--
-- ROLLBACK, em prosa (pseudo-SQL de função em comentário vira definição para
-- `scripts/db/corpo-vigente.mjs`): reemitir a função de gatilho de movimentação com o corpo da
-- `0134`, sem o bloco marcado "0146".
-- =============================================================================

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
  -- F24 (0099): a filial em que o ativo FICA depois desta movimentação.
  v_dest   smallint;
begin
  select * into v_ativo from public.ativos where id = new.ativo_id for update;

  new.snapshot_anterior := jsonb_build_object(
    'status',         v_ativo.status,
    'colaborador',    v_ativo.colaborador_atual,
    'setor',          v_ativo.setor_atual,
    'filial_id',      v_ativo.filial_id,
    'pendencia',      v_ativo.pendencia,
    'termo_assinado', v_ativo.termo_assinado,
    'termo_data',     v_ativo.termo_data);

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
    if exists (
      select 1 from public.movimentacoes m
      where m.ativo_id = new.ativo_id
        and (m.created_at, m.ordem) > (v_orig.created_at, v_orig.ordem)
    ) then
      raise exception 'So a ultima movimentacao efetiva do ativo pode ser estornada (use ajuste, com justificativa)';
    end if;
    -- 0146: a pendência de item que esta devolução abriu já teve desfecho (resolver grava
    -- lançamento com pendencia_item_id, FK NO ACTION). Apagá-la estouraria 23503, e os
    -- lançamentos do desfecho ficariam de pé fora do estorno: recusa aqui, antes de mexer.
    if exists (
      select 1
        from public.pendencias_item p
        join public.lancamentos_item l on l.pendencia_item_id = p.id
       where p.movimentacao_id = v_orig.id
    ) then
      raise exception 'Estorno bloqueado: a pendencia de item desta devolucao ja teve desfecho registrado no estoque de itens (use ajuste, com justificativa)';
    end if;
    perform public.exigir_identidade_livre_na_filial(
      new.ativo_id, (v_orig.snapshot_anterior ->> 'filial_id')::smallint, 'desfazer esta movimentação');

    update public.ativos set
      status            = (v_orig.snapshot_anterior ->> 'status')::public.status_ativo,
      colaborador_atual = v_orig.snapshot_anterior ->> 'colaborador',
      setor_atual       = v_orig.snapshot_anterior ->> 'setor',
      filial_id         = (v_orig.snapshot_anterior ->> 'filial_id')::smallint,
      pendencia         = case when v_orig.snapshot_anterior ? 'pendencia'
                               then nullif(
                                 (select string_agg(trim(x.val), '; ' order by x.ord)
                                  from unnest(string_to_array(v_orig.snapshot_anterior ->> 'pendencia', ';'))
                                       with ordinality as x(val, ord)
                                  where nullif(trim(x.val), '') is not null
                                    and lower(trim(x.val)) not like 'itens faltantes%'), '')
                               else pendencia end,
      termo_assinado    = case when v_orig.snapshot_anterior ? 'termo_assinado'
                               then (v_orig.snapshot_anterior ->> 'termo_assinado')::public.termo_status
                               else termo_assinado end,
      termo_data        = case when v_orig.snapshot_anterior ? 'termo_data'
                               then (v_orig.snapshot_anterior ->> 'termo_data')::date
                               else termo_data end,
      updated_at        = now()
    where id = new.ativo_id;
    delete from public.pendencias_item where movimentacao_id = v_orig.id;
    new.status_anterior   := v_ativo.status;
    new.status_resultante := (v_orig.snapshot_anterior ->> 'status')::public.status_ativo;
    return new;
  end if;

  if new.tipo = 'ajuste' then
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

  -- F24 (0099) — a guarda de identidade cobre TODO caminho que muda a filial do ativo, e
  -- não só a transferência (era o buraco da 0097): o destino sai do MESMO `case` do UPDATE
  -- logo abaixo, então `compra` e `troca` — que gravam `new.filial_id` — entram junto.
  v_dest := case
    when new.tipo in ('compra','troca') then new.filial_id
    when new.tipo = 'transferencia'     then coalesce(new.filial_destino_id, v_ativo.filial_id)
    else v_ativo.filial_id end;

  if v_dest is not null and v_dest <> v_ativo.filial_id then
    perform public.exigir_identidade_livre_na_filial(
      new.ativo_id, v_dest,
      case when new.tipo = 'transferencia' then 'transferir este ativo'
           else 'registrar esta movimentação' end);
  end if;

  update public.ativos set
    status            = v_novo,
    colaborador_atual = case
      when not public.status_tem_detentor(v_novo) then null
      when new.tipo in ('saida','emprestimo','reserva') then new.colaborador
      else colaborador_atual end,
    setor_atual       = case
      when not public.status_tem_detentor(v_novo) then null
      when new.tipo in ('saida','emprestimo','reserva') then new.setor
      else setor_atual end,
    filial_id         = case
      when new.tipo in ('compra','troca') then new.filial_id
      when new.tipo = 'transferencia' then coalesce(new.filial_destino_id, filial_id)
      else filial_id end,
    termo_assinado    = coalesce(new.termo_assinado, termo_assinado),
    termo_data        = coalesce(new.termo_data, termo_data),
    updated_at        = now()
  where id = new.ativo_id;

  if new.tipo = 'devolucao' and coalesce(cardinality(new.itens_faltantes), 0) > 0 then
    insert into public.pendencias_item (ativo_id, movimentacao_id, item, colaborador, filial_id)
    select new.ativo_id,
           new.id,
           u.item,
           coalesce(nullif(new.colaborador, ''), v_ativo.colaborador_atual),
           new.filial_id
    from unnest(new.itens_faltantes) as u(item)
    where nullif(trim(u.item), '') is not null;
  end if;

  return new;
end $$;

