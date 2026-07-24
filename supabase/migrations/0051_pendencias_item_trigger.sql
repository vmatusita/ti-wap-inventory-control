-- Migration 0051 — F18: aplicar_movimentacao passa a manter pendencias_item.
--
-- Recriação por `create or replace function` PURO (mesma assinatura → sem overload;
-- ACL/ownership preservados, inclusive o revoke da 0038). BASE = a definição
-- VIGENTE em produção E ensaio (conferida byte-a-byte por pg_get_functiondef nos
-- dois em 24/07/2026 — idênticas; herda 0023/0045/0047). DIFF vs a vigente =
-- EXATAMENTE três pontos; qualquer outra diferença é BUG:
--
--   (1) ESTORNO: após restaurar o ativo pelo snapshot, DELETA as linhas de
--       pendencias_item criadas pela movimentação estornada (inverso exato do
--       insert do ponto 3). Só devoluções criam linhas, então o delete é no-op
--       para os demais tipos. O rastro do que faltou permanece na própria
--       movimentação estornada; a restauração de `ativos.pendencia` via snapshot
--       segue intacta (para os OUTROS trechos).
--
--   (2) UPDATE principal: REMOVIDO o `pendencia = case … end`. Antes ele:
--         - em devolucao c/ itens_faltantes SOBRESCREVIA o campo INTEIRO com
--           'itens faltantes: …' (perdendo trechos alheios);
--         - em triagem_ok zerava o campo INTEIRO (o bug latente do §0.1b — apagava
--           'sem patrimônio físico' etc. sem rastro).
--       Agora nenhum dos dois toca `ativos.pendencia`: devolucao vira linha(s) em
--       pendencias_item (ponto 3) e triagem_ok não mexe em pendência nenhuma.
--
--   (3) Depois do UPDATE principal, em devolucao com itens_faltantes: INSERE uma
--       linha ABERTA por item em pendencias_item, ligada a ESTA devolução
--       (new.id). colaborador = quem devia devolver: da própria movimentação
--       (new.colaborador) senão o colaborador que o ativo TINHA antes da devolução
--       (v_ativo.colaborador_atual, = snapshot_anterior->>'colaborador'). filial =
--       new.filial_id. A FK movimentacao_id é DEFERRABLE (0050) porque este é um
--       BEFORE INSERT: a linha de movimentacoes só entra na heap depois do trigger.
--
-- Não-destrutiva do ponto de vista do acervo (o único delete do corpo é em
-- pendencias_item, tabela nova — NÃO em ativos/movimentacoes; não bate no gate do
-- RUNBOOK). O array movimentacoes.itens_faltantes continua a fonte histórica.

create or replace function public.aplicar_movimentacao()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ativo  public.ativos%rowtype;
  v_orig   public.movimentacoes%rowtype;
  v_novo   public.status_ativo;
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
        and (m.created_at, m.id) > (v_orig.created_at, v_orig.id)
    ) then
      raise exception 'So a ultima movimentacao efetiva do ativo pode ser estornada (use ajuste, com justificativa)';
    end if;
    update public.ativos set
      status            = (v_orig.snapshot_anterior ->> 'status')::public.status_ativo,
      colaborador_atual = v_orig.snapshot_anterior ->> 'colaborador',
      setor_atual       = v_orig.snapshot_anterior ->> 'setor',
      filial_id         = (v_orig.snapshot_anterior ->> 'filial_id')::smallint,
      -- F18 (§A2 "para os OUTROS trechos"): restaura o snapshot MAS nunca ressuscita
      -- o trecho 'itens faltantes…' (ele virou linha em pendencias_item). Sem isto,
      -- estornar uma movimentação cujo snapshot capturou o texto LEGADO (antes da F18
      -- o campo carregava 'itens faltantes: …' e viajava no snapshot) reescreveria o
      -- texto no campo livre, quebrando a invariante. Mesmo strip do backfill (0053):
      -- separa por ';' (a lista de itens tem vírgulas internas), tira os trechos que
      -- começam com 'itens faltantes', rejunta na ordem; vazio → null.
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
    -- F18 (1): inverso do insert do ponto (3) — remove as linhas de pendência que
    -- ESTA movimentação (a estornada) criou. No-op para tipos que não geram itens.
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
      when new.tipo in ('compra','troca') then new.filial_id
      when new.tipo = 'transferencia' then coalesce(new.filial_destino_id, filial_id)
      else filial_id end,
    -- F18 (2): a coluna `pendencia = case … end` FOI REMOVIDA daqui. devolucao não
    -- grava mais 'itens faltantes: …' (vira linha em pendencias_item, abaixo) e
    -- triagem_ok não zera mais o campo (corrige o apagão de trechos alheios). Todos
    -- os demais tipos já caíam no `else pendencia` (no-op), então o efeito líquido
    -- para eles é idêntico.
    termo_assinado    = coalesce(new.termo_assinado, termo_assinado),
    termo_data        = coalesce(new.termo_data, termo_data),
    updated_at        = now()
  where id = new.ativo_id;

  -- F18 (3): devolucao com itens marcados → uma pendência ABERTA por item, atada a
  -- ESTA devolução e ao colaborador da época (o que devolvia). new.id existe (default
  -- gen_random_uuid aplicado antes do BEFORE trigger); a FK é DEFERRABLE (0050).
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
end $function$;
