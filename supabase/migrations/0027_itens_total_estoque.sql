-- Migration 0027 — Itens por quantidade: semântica Total / Estoque (OS-F6A §A4).
--
-- Redesenho da doutrina (decisão Johnny 16/07/2026), SEM renomear valores de enum
-- (quebraria histórico/código) — a reconciliação de nomes é de RÓTULO (UI):
--   entrada   → "Entrada"    : Total +q · Estoque +q
--   saida     → "Liberação"  : Estoque −q · liberados +q · Total = (fica com a pessoa)
--   reserva   → "Atrelar"    : Estoque −q · atrelados +q · Total = (vai retornar)
--   liberacao → "Devolução"  : Estoque +q · atrelados −q · Total = (repõe a prateleira)
--   retorno   → "Retorno"    : Estoque +q · liberados −q · Total = (NOVO valor de enum)
--   ajuste    → "Ajuste"     : Total ±q · Estoque ±q
--
-- Derivações (retroativas — nenhum recálculo/DDL de coluna; o diário 0015 manda):
--   total     = max(0, Σentrada + Σajuste)
--   atrelados = Σ_chamado max(0, Σreserva − Σliberacao)     -- reserva/liberacao independem de saida/retorno
--   liberados = max(0, Σsaida − Σretorno)                    -- "em uso com pessoas"
--   estoque   = max(0, total − atrelados − liberados)        -- prateleira
--   falta     = max(0, atrelados − estoque)
--
-- NOTA (drift da OS §A4 l.149, decisão A4/D1): a OS escreveu
-- `atrelados = Σ_chamado max(0, Σreserva − Σliberacao − Σsaida)`, mas isso produz
-- Estoque 7 no passo "liberação 3" do aceite (l.170), que exige 6, e contradiz a
-- própria tabela de efeitos (l.141: saida → Estoque −q incondicional). Atrelar
-- (reserva/liberacao) e liberar (saida/retorno) são ciclos INDEPENDENTES; a
-- fórmula sem `− Σsaida` reproduz o aceite 10→8→9→6→7→5. O aceite é autoridade.
--
-- ATENÇÃO PG: ALTER TYPE ADD VALUE roda na transação da migration (PG 12+), mas o
-- novo valor NÃO pode ser coercido para o enum na MESMA transação. Por isso todas
-- as comparações abaixo usam `tipo::text = 'retorno'` (enum→text é seguro), nunca
-- `tipo = 'retorno'`. Assim a migration cabe num arquivo único.
-- Aplicar em DESENVOLVIMENTO (o orquestrador aplica em produção — §1.4).

-- ---------- (1) Novo valor de enum ----------
alter type public.tipo_lancamento add value if not exists 'retorno';

-- ---------- (2) rel_saldo_itens v3 (Total / Estoque / Atrelados / Falta) ----------
-- Assinatura de retorno muda → DROP + CREATE (CREATE OR REPLACE não troca colunas).
-- Sem dependentes no banco (pg_depend: 0 linhas).
drop function if exists public.rel_saldo_itens(smallint, date);

create function public.rel_saldo_itens(
  p_filial smallint,
  p_ate    date
) returns table (
  item_id   smallint,
  item      text,
  grupo     public.grupo_item,
  ordem     int,
  total     bigint,
  estoque   bigint,
  atrelados bigint,
  falta     bigint
) language sql stable security invoker set search_path = public as $$
  with rows as (
    select l.item_id, l.chamado, l.tipo::text as tipo, l.quantidade
    from public.lancamentos_item l
    where l.data <= p_ate
      and (p_filial is null or l.filial_id = p_filial)
  ),
  tot as (
    select item_id,
           sum(case tipo when 'entrada' then quantidade
                         when 'ajuste'  then quantidade else 0 end) as total_raw,
           sum(case tipo when 'saida'   then quantidade
                         when 'retorno' then -quantidade else 0 end) as lib_raw
    from rows group by item_id
  ),
  atrel as (
    select item_id, sum(greatest(0, net)) as atrelados from (
      select item_id, chamado,
             sum(case tipo when 'reserva'   then quantidade
                           when 'liberacao' then -quantidade else 0 end) as net
      from rows where chamado is not null
      group by item_id, chamado
    ) b group by item_id
  ),
  por_item as (
    select i.id, i.nome, i.grupo, i.ordem,
           greatest(0, coalesce(t.total_raw, 0)) as total,
           coalesce(a.atrelados, 0)              as atrelados,
           greatest(0, coalesce(t.lib_raw, 0))   as liberados
    from public.itens i
    left join tot   t on t.item_id = i.id
    left join atrel a on a.item_id = i.id
    where i.ativo = true or t.item_id is not null or a.item_id is not null
  )
  select p.id, p.nome, p.grupo, p.ordem,
         p.total::bigint,
         greatest(0, p.total - p.atrelados - p.liberados)::bigint                     as estoque,
         p.atrelados::bigint,
         greatest(0, p.atrelados
                     - greatest(0, p.total - p.atrelados - p.liberados))::bigint      as falta
  from por_item p
  order by p.grupo, p.ordem, p.nome;
$$;

revoke all on function public.rel_saldo_itens(smallint, date) from public;
grant execute on function public.rel_saldo_itens(smallint, date) to authenticated, service_role;

-- ---------- (3) valida_lancamento_item v2 (nova semântica) ----------
-- Preserva advisory lock (0019) e search_path (0024). Guards:
--   ajuste   : não pode deixar TOTAL < 0
--   estoque  : nunca < 0  (cobre saida/liberação, reserva/atrelar e ajuste negativo)
--   liberacao: ≤ reserva aberta do chamado (Σreserva − Σliberacao) — senão o bucket
--              atrelado iria a negativo e seria silenciosamente zerado
--   retorno  : ≤ liberado em aberto (Σsaida − Σretorno) — mesma razão
-- retorno NÃO exige chamado (a liberação pode ter sido sem chamado); é opcional.
create or replace function public.valida_lancamento_item()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_total_raw   int;
  v_lib_raw     int;
  v_atrelados   int;
  v_estoque     int;
  v_reserva_net int;
  v_lib_net     int;
begin
  -- Serializa concorrência no mesmo par item×filial (TOCTOU — herdado da 0019).
  perform pg_advisory_xact_lock(new.item_id::int, new.filial_id::int);

  -- Estado resultante (linhas existentes + a nova) num ÚNICO statement — um CTE só
  -- vive dentro do statement onde é declarado, então total/liberados/atrelados são
  -- calculados juntos (agg × atrel, cada um 1 linha → cross join → 1 linha). Tipo
  -- comparado como TEXTO (o novo 'retorno' não pode ser coercido ao enum na tx que
  -- o criou).
  with all_rows as (
    select l.chamado, l.tipo::text as tipo, l.quantidade
    from public.lancamentos_item l
    where l.item_id = new.item_id and l.filial_id = new.filial_id
    union all
    select new.chamado, new.tipo::text, new.quantidade
  ),
  agg as (
    select
      coalesce(sum(case tipo when 'entrada' then quantidade
                             when 'ajuste'  then quantidade else 0 end), 0) as total_raw,
      coalesce(sum(case tipo when 'saida'   then quantidade
                             when 'retorno' then -quantidade else 0 end), 0) as lib_raw
    from all_rows
  ),
  atrel as (
    select coalesce(sum(greatest(0, net)), 0) as atrelados from (
      select coalesce(sum(case tipo when 'reserva'   then quantidade
                                    when 'liberacao' then -quantidade else 0 end), 0) as net
      from all_rows where chamado is not null
      group by chamado
    ) b
  )
  select agg.total_raw, agg.lib_raw, atrel.atrelados
  into v_total_raw, v_lib_raw, v_atrelados
  from agg, atrel;

  if v_total_raw < 0 then
    raise exception
      'Ajuste inválido: deixaria o item com total % (não pode ficar negativo).', v_total_raw
      using errcode = 'check_violation';
  end if;

  v_estoque := v_total_raw - v_atrelados - greatest(0, v_lib_raw);
  if v_estoque < 0 then
    raise exception
      'Estoque insuficiente: a operação deixaria % na prateleira (não pode ficar negativo).', v_estoque
      using errcode = 'check_violation';
  end if;

  -- Devolução (liberacao) não pode exceder o atrelado aberto do chamado.
  if new.tipo::text = 'liberacao' then
    select coalesce(sum(case l.tipo::text when 'reserva'   then l.quantidade
                                          when 'liberacao' then -l.quantidade else 0 end), 0)
    into v_reserva_net
    from public.lancamentos_item l
    where l.item_id = new.item_id and l.filial_id = new.filial_id
      and l.chamado = new.chamado;
    if v_reserva_net - new.quantidade < 0 then
      raise exception
        'Devolução maior que o atrelado aberto do chamado % (não há % para devolver).',
        new.chamado, new.quantidade
        using errcode = 'check_violation';
    end if;
  end if;

  -- Retorno não pode exceder o liberado em aberto (Σsaida − Σretorno).
  if new.tipo::text = 'retorno' then
    select coalesce(sum(case l.tipo::text when 'saida'   then l.quantidade
                                          when 'retorno' then -l.quantidade else 0 end), 0)
    into v_lib_net
    from public.lancamentos_item l
    where l.item_id = new.item_id and l.filial_id = new.filial_id;
    if v_lib_net - new.quantidade < 0 then
      raise exception
        'Retorno maior que o liberado em aberto (não há % para retornar).', new.quantidade
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

-- O trigger trg_valida_lancamento_item (0015) segue apontando para esta função.

-- ===================================================================
-- SMOKE — PRODUÇÃO (read-only; o orquestrador roda pós-migration).
--   Invariantes: deve retornar 0 linhas.
--   select item_id, item, total, estoque, atrelados, falta
--   from public.rel_saldo_itens(null, current_date)
--   where estoque < 0 or total < 0 or atrelados < 0 or falta < 0 or estoque > total;
-- Referência esperada em prod hoje: item "Fone" → total 67 / estoque 66 / atrelados 0.
-- ===================================================================
