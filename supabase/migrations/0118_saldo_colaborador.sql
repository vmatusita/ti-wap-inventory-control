-- Migration 0118 — a conta por pessoa (F38, frente C · D4b).
--
-- Duas coisas, e só duas:
--   (1) `rel_saldo_colaborador(uuid)` — a LEITURA "o que está com esta pessoa";
--   (2) um bloco NOVO em `valida_lancamento_item` — a única função existente que
--       esta fase recria, e recriada sobre o corpo LIDO DO BANCO.
--
-- Nenhuma coluna nasce aqui: `lancamentos_item.colaborador_id` já existe desde a
-- 0113 (F37 · D5), anulável, e `lancarItens`/`registrarMovimentacoes` já a gravam
-- resolvendo a chave do nome no servidor.
--
-- ---------------------------------------------------------------------------
-- A CONTA É UMA PARTIÇÃO, NÃO UMA FÓRMULA NOVA
-- ---------------------------------------------------------------------------
-- O cabeçalho da 0027 fixou as cinco derivações do diário de itens:
--
--   total     = max(0, Σentrada + Σajuste)
--   atrelados = Σ_chamado max(0, Σreserva − Σliberacao)
--   liberados = max(0, Σsaida − Σretorno)
--   estoque   = max(0, total − atrelados − liberados)
--   falta     = max(0, atrelados + liberados − total)
--
-- Esta migration NÃO acrescenta uma sexta. `com_a_pessoa` é um RECORTE da terceira:
--
--   com_a_pessoa(item, filial, C) = Σ saida(colaborador_id = C) − Σ retorno(colaborador_id = C)
--
-- e vale a identidade, que o roteiro da fase prova por asserção:
--
--   Σ_C com_a_pessoa(C)  +  (Σsaida − Σretorno das linhas SEM vínculo)  =  Σsaida − Σretorno
--
-- ou seja, exatamente o `liberados` de hoje ANTES do `max(0, …)`. **Nada do que a
-- tela de itens mostra muda de número.**
--
-- ⚠ E é de propósito que `rel_saldo_colaborador` NÃO aplica `max(0, …)`: o `max`
-- da 0027 existe para o CONSOLIDADO do item, onde negativo é anomalia impossível
-- em dados válidos. Numa PARCELA, zerar por baixo esconderia justamente a anomalia
-- que se quer enxergar — e quebraria a identidade acima, que é a prova do
-- critério 5 da ordem. Quem soma as parcelas é quem aplica o teto, e ele já
-- aplica: `rel_saldo_itens` continua byte a byte.
--
-- ---------------------------------------------------------------------------
-- ⚠ A RECRIAÇÃO DE `valida_lancamento_item` — a base é o BANCO, não o arquivo
-- ---------------------------------------------------------------------------
-- Lição escrita na 0047 e repetida na 0109: o corpo de partida foi lido de
-- produção por `pg_get_functiondef`, não de uma migration antiga. Historicamente a
-- função passou por 0015 → 0019 → 0024 → 0027 → 0064 → 0068 → 0084 → 0104; montar
-- a recriação a partir de qualquer uma delas é como se perde um pedaço em silêncio.
--
--   md5(pg_get_functiondef(...)) do corpo de PARTIDA, lido em 28/08/2026:
--       90f5c1bb63d215f196da4e2a7e9d87f0
--   — idêntico em PRODUÇÃO (pbtjcalbmepmrqzprusb) e no ENSAIO (sgmvldiizsrjbxzzpmhh).
--
-- Sai byte a byte: a primeira linha (`pg_advisory_xact_lock`, que é a razão da
-- ordem determinística de travas da 0117 e NÃO PODE SAIR), toda a aritmética das
-- CTEs, as duas guardas de negativo, a guarda de `liberacao` contra `reserva` e a
-- guarda de `retorno` contra o liberado em aberto. **Entra um bloco só.**
--
-- ---------------------------------------------------------------------------
-- O BLOCO NOVO — espelho exato da guarda que já existe para `liberacao`
-- ---------------------------------------------------------------------------
-- Assim como um `liberacao` não pode exceder o atrelado em aberto DAQUELE chamado,
-- um `retorno` que NOMEIA UMA PESSOA não pode exceder o que aquela pessoa tem
-- daquele item naquela filial. A guarda antiga (retorno ≤ liberado em aberto, sem
-- recorte de pessoa) continua valendo para os DOIS casos; a nova só ACRESCENTA um
-- teto quando há pessoa nomeada.
--
-- ⚠ `retorno` SEM `colaborador_id` continua valendo exatamente como hoje. É o
-- caminho de TODO o histórico (em 28/08/2026, 100% dos 30 lançamentos de produção),
-- e ele não pode virar erro retroativo.
--
-- ⚠ A ARMADILHA QUE ESTA GUARDA CRIA, E A REGRA QUE A DESARMA. Equipamento
-- entregue ANTES desta fase não tem `saida` vinculada a ninguém: a pessoa tem
-- saldo ZERO, e uma devolução conferida pelo checklist (frente D) seria RECUSADA —
-- matando o D12, cujo ponto é justamente "entrega antiga funciona igual". Por isso,
-- e isto é decisão da ordem F38 (§C.3): **a linha de devolução só carrega
-- `colaborador_id` quando a pessoa tem saldo registrado suficiente daquele item
-- naquela filial; não tendo, o `retorno` é gravado SEM o vínculo** — repõe o
-- estoque igual, sem inventar dívida nem recusar a conferência. Quem decide isso é
-- a aplicação, ANTES de chamar (função pura, testada); o banco continua sendo a
-- linha que vale. A tela diz, discretamente, qual dos dois aconteceu.
--
-- ROLLBACK LÓGICO: reaplicar o corpo de partida (o md5 acima) e
-- `drop function public.rel_saldo_colaborador(uuid);`
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- (1) A LEITURA
-- ---------------------------------------------------------------------------
create or replace function public.rel_saldo_colaborador(
  p_colaborador uuid
) returns table (
  item_id      smallint,
  item         text,
  filial_id    smallint,
  filial       text,
  com_a_pessoa bigint
) language sql stable security invoker set search_path = public as $$
  select l.item_id,
         i.nome  as item,
         l.filial_id,
         f.nome  as filial,
         sum(case l.tipo::text when 'saida'   then l.quantidade
                               when 'retorno' then -l.quantidade
                               else 0 end)::bigint as com_a_pessoa
    from public.lancamentos_item l
    join public.itens   i on i.id = l.item_id
    join public.filiais f on f.id = l.filial_id
   where p_colaborador is not null
     and l.colaborador_id = p_colaborador
   group by l.item_id, i.nome, l.filial_id, f.nome
  having sum(case l.tipo::text when 'saida'   then l.quantidade
                               when 'retorno' then -l.quantidade
                               else 0 end) <> 0
   order by i.nome, f.nome;
$$;

comment on function public.rel_saldo_colaborador(uuid) is
  'F38 (0118): o que está COM esta pessoa, por item e filial — Σ saida − Σ retorno das linhas vinculadas a ela. É uma PARTIÇÃO de `liberados` (cabeçalho da 0027), não uma fórmula nova: somando todas as pessoas mais as linhas sem vínculo dá exatamente o liberados de hoje. Sem max(0,…) de propósito — numa parcela, zerar por baixo esconderia anomalia e quebraria essa identidade. Linhas que zeraram não aparecem.';

-- Grants: molde das rel_* (0056 — sem anon; a leitura é de sessão, nunca do
-- visualizador por senha, que não alcança dado de pessoa).
revoke all on function public.rel_saldo_colaborador(uuid) from public, anon;
grant execute on function public.rel_saldo_colaborador(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- (2) O TRIGGER — corpo de partida md5 90f5c1bb63d215f196da4e2a7e9d87f0,
--     lido do banco. Único acréscimo: o bloco final marcado "F38".
-- ---------------------------------------------------------------------------
create or replace function public.valida_lancamento_item()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_total_raw   int;
  v_lib_raw     int;
  v_atrelados   int;
  v_estoque     int;
  v_reserva_net int;
  v_lib_net     int;
  v_pessoa_net  int;   -- F38 (0118)
begin
  perform pg_advisory_xact_lock(new.item_id::int, new.filial_id::int);

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

  -- ===== F38 (0118) — a conta por PESSOA ====================================
  -- Espelho exato da guarda de `liberacao` contra `reserva` logo acima: lá o teto
  -- é o atrelado em aberto DAQUELE chamado; aqui, o registrado COM AQUELA PESSOA.
  -- Só vale quando a linha NOMEIA alguém: `retorno` sem `colaborador_id` é o
  -- caminho de todo o histórico e continua passando como sempre passou.
  if new.tipo::text = 'retorno' and new.colaborador_id is not null then
    select coalesce(sum(case l.tipo::text when 'saida'   then l.quantidade
                                          when 'retorno' then -l.quantidade else 0 end), 0)
    into v_pessoa_net
    from public.lancamentos_item l
    where l.item_id = new.item_id and l.filial_id = new.filial_id
      and l.colaborador_id = new.colaborador_id;
    if v_pessoa_net - new.quantidade < 0 then
      raise exception
        'Retorno maior que o registrado com esta pessoa (não há % para retornar).', new.quantidade
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $function$;

comment on function public.valida_lancamento_item() is
  'Trigger BEFORE INSERT de lancamentos_item. Trava o par (item, filial) por advisory lock — PRIMEIRA LINHA DO CORPO, e é ela que obriga as RPCs que gravam vários itens a adquirir todas as travas em ordem determinística antes do primeiro INSERT (0104, 0117). Aplica as derivações da 0027 (total/atrelados/estoque) e três tetos: estoque não fica negativo, `liberacao` não excede o atrelado do chamado, `retorno` não excede o liberado em aberto. F38 (0118) acrescentou o quarto: `retorno` que NOMEIA uma pessoa não excede o que aquela pessoa tem. Retorno sem colaborador_id continua valendo exatamente como antes.';

-- ===== SMOKE (rodar depois de aplicar — só leitura) =====
--   select p.oid::regprocedure::text, p.prosecdef
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname='rel_saldo_colaborador';
--   -- esperado: 1 linha, (uuid), prosecdef = false
--
--   select count(*) from public.lancamentos_item where colaborador_id is not null;
--   -- a base da conta; 0 logo após o apply é normal (nada foi backfillado)
--
--   -- A identidade do critério 5 (Σ parcelas por pessoa + sem vínculo = liberados
--   -- bruto), por item×filial — tem de voltar VAZIO:
--   with net as (
--     select item_id, filial_id, colaborador_id,
--            sum(case tipo::text when 'saida' then quantidade
--                                when 'retorno' then -quantidade else 0 end) as n
--       from public.lancamentos_item group by 1, 2, 3
--   )
--   select item_id, filial_id
--     from net group by item_id, filial_id
--   having sum(n) <> (select coalesce(sum(case l.tipo::text when 'saida' then l.quantidade
--                                                           when 'retorno' then -l.quantidade
--                                                           else 0 end), 0)
--                       from public.lancamentos_item l
--                      where l.item_id = net.item_id and l.filial_id = net.filial_id);
