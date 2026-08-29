-- Migration 0122 — a ordem dos inversos, que o `case` da 0119 não desempatava
-- (achado da revisão adversarial da F38, 28/08/2026).
--
-- ---------------------------------------------------------------------------
-- O DEFEITO, EXATO
-- ---------------------------------------------------------------------------
-- `reabrir_pendencias_item_com_estornos` (0119) e `estornar_movimentacao_com_itens`
-- (0121) inserem os lançamentos inversos nesta ordem:
--
--     order by case when (e.value ->> 'quantidade')::int > 0 then 0 else 1 end
--
-- O comentário ao lado prometia "o positivo primeiro: desfazendo uma `baixa`, o
-- `ajuste +1` repõe o Total antes de a `saida` tirar da prateleira". A promessa
-- está certa; o `case` **não a cumpre**.
--
-- Desfazer uma `baixa` produz DOIS inversos, e `planejarEstorno`
-- (src/lib/itens/estorno.ts) os calcula assim:
--
--     original `retorno` (+Q)  → inverso `saida`  (+Q)   — `inverteSinal` é false
--     original `ajuste`  (−Q)  → inverso `ajuste` (+Q)   — `inverteSinal` é true
--
-- Os DOIS são positivos. Caem no mesmo ramo do `case`, e a ordem entre eles fica
-- por conta da ordem física de leitura — que ninguém fixou (a action lê os
-- lançamentos sem `order by`).
--
-- ⚠ E a ordem errada FALHA, não é só feia. Cenário real: acessório que já estava
-- com estoque 0 quando sumiu — que é o caso comum de uma baixa. Se o inverso
-- `saida (+1)` entrar antes do `ajuste (+1)`, o trigger `valida_lancamento_item`
-- calcula `estoque = total − atrelados − max(0, liberados)` com o Total ainda no
-- valor pós-baixa e o liberado já subido, chega a −1, e recusa a transação
-- INTEIRA com "Estoque insuficiente". Reabrir uma pendência de baixa passa a
-- falhar de forma intermitente, com uma mensagem que não descreve a causa.
--
-- ---------------------------------------------------------------------------
-- A CORREÇÃO: ordenar pelo EFEITO, e desempatar até o fim
-- ---------------------------------------------------------------------------
-- A regra verdadeira não é "positivo primeiro" — é **"quem repõe o Total vem antes
-- de quem consome a prateleira"**. Só `ajuste` mexe no Total (cabeçalho da 0027),
-- então:
--
--     1º  `ajuste` positivo   — repõe o Total
--     2º  os demais positivos — repõem a prateleira
--     3º  os negativos        — consomem, e só depois de tudo estar reposto
--
-- E o desempate vai **até o fim**, por `item_id` e `estorna_id`: duas linhas no
-- mesmo ramo não têm dependência entre si, mas uma ordem total elimina a última
-- fonte de intermitência — a mesma lição da pendência nº 5 da F37, que este
-- projeto já pagou uma vez.
--
-- Nenhuma outra linha das duas funções muda. `security invoker`, travas, guardas
-- e a conferência de órfãos saem byte a byte.
--
-- ROLLBACK LÓGICO: reaplicar os corpos da 0119 e da 0121.
-- ===========================================================================

create or replace function public.reabrir_pendencias_item_com_estornos(
  p_ids          uuid[],
  p_justificativa text,
  p_estornos     jsonb,
  p_criado_por   uuid
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_autor     uuid := coalesce(auth.uid(), p_criado_por);
  v_reabertas uuid[] := '{}';
  v_par       record;
  v_elem      jsonb;
  v_n_est     int := 0;
  v_orfaos    int;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Selecione ao menos uma pendência.'
      using errcode = 'invalid_parameter_value';
  end if;
  if nullif(btrim(coalesce(p_justificativa, '')), '') is null then
    raise exception 'A reabertura precisa de justificativa.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_estornos is null or jsonb_typeof(p_estornos) <> 'array' then
    raise exception 'A lista de estornos precisa ser uma lista (vazia, se nenhum lançamento nasceu).'
      using errcode = 'invalid_parameter_value';
  end if;

  for v_par in
    select distinct (e.value ->> 'item_id')::int   as item_id,
                    (e.value ->> 'filial_id')::int as filial
      from jsonb_array_elements(p_estornos) e
     order by 1, 2
  loop
    perform pg_advisory_xact_lock(v_par.item_id, v_par.filial);
  end loop;

  with mudadas as (
    update public.pendencias_item p
       set status        = 'aberta',
           desfecho      = null,
           observacao    = null,
           resolvida_em  = null,
           resolvida_por = null
     where p.id = any(p_ids) and p.status = 'resolvida'
    returning p.id
  )
  select coalesce(array_agg(id), '{}') into v_reabertas from mudadas;

  if cardinality(v_reabertas) = 0 then
    return jsonb_build_object('reabertas', 0, 'estornos', 0);
  end if;

  -- ⚠ ORDEM TOTAL, pelo EFEITO (0122). Ver o cabeçalho: "positivo primeiro" não
  -- desempatava os dois inversos de uma baixa, que são AMBOS positivos.
  for v_elem in
    select e.value
      from jsonb_array_elements(p_estornos) e
     where (e.value ->> 'pendencia_id')::uuid = any(v_reabertas)
     order by case
                when (e.value ->> 'tipo') = 'ajuste'
                 and (e.value ->> 'quantidade')::int > 0 then 0   -- repõe o Total
                when (e.value ->> 'quantidade')::int > 0 then 1   -- repõe a prateleira
                else 2                                            -- consome
              end,
              (e.value ->> 'item_id')::int,
              (e.value ->> 'estorna_id')
  loop
    insert into public.lancamentos_item (
      item_id, filial_id, tipo, quantidade, data,
      colaborador, colaborador_id, chamado, observacao,
      estorna_id, pendencia_item_id, criado_por
    ) values (
      (v_elem ->> 'item_id')::smallint,
      (v_elem ->> 'filial_id')::smallint,
      (v_elem ->> 'tipo')::public.tipo_lancamento,
      (v_elem ->> 'quantidade')::int,
      current_date,
      nullif(v_elem ->> 'colaborador', ''),
      nullif(v_elem ->> 'colaborador_id', '')::uuid,
      nullif(v_elem ->> 'chamado', ''),
      nullif(v_elem ->> 'observacao', ''),
      (v_elem ->> 'estorna_id')::uuid,
      (v_elem ->> 'pendencia_id')::uuid,
      v_autor
    );
    v_n_est := v_n_est + 1;
  end loop;

  select count(*) into v_orfaos
    from public.lancamentos_item l
   where l.pendencia_item_id = any(v_reabertas)
     and l.estorna_id is null
     and not exists (
       select 1 from public.lancamentos_item inv where inv.estorna_id = l.id
     );

  if v_orfaos > 0 then
    raise exception
      'Não dá para reabrir: % lançamento(s) desta pendência ficariam sem o estorno correspondente.', v_orfaos
      using errcode = 'check_violation';
  end if;

  return jsonb_build_object('reabertas', cardinality(v_reabertas), 'estornos', v_n_est);
end $$;

comment on function public.reabrir_pendencias_item_com_estornos(uuid[], text, jsonb, uuid) is
  'F38 (0119, ordem corrigida na 0122): reabre 1..N pendências de item E grava os lançamentos INVERSOS na MESMA transação. A ordem de inserção é TOTAL e pelo EFEITO — ajuste positivo (repõe o Total) antes dos demais positivos (repõem a prateleira) antes dos negativos, desempatando por item_id e estorna_id. "Positivo primeiro" não bastava: desfazer uma baixa produz DOIS inversos positivos (saida e ajuste), e a ordem errada faz o trigger recusar por estoque negativo. Antes de devolver, CONFERE que nenhuma pendência reaberta ficou com lançamento de pé e RECUSA a transação inteira se ficou.';

create or replace function public.estornar_movimentacao_com_itens(
  p_movimentacao_id uuid,
  p_observacao      text,
  p_estornos        jsonb,
  p_criado_por      uuid
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_autor    uuid := coalesce(auth.uid(), p_criado_por);
  v_mov      record;
  v_filial   smallint;
  v_novo     uuid;
  v_par      record;
  v_elem     jsonb;
  v_n        int := 0;
  v_orfaos   int;
begin
  if p_movimentacao_id is null then
    raise exception 'Movimentação não informada para o estorno.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_estornos is null or jsonb_typeof(p_estornos) <> 'array' then
    raise exception 'A lista de itens a estornar precisa ser uma lista (vazia, se a movimentação não carregou item).'
      using errcode = 'invalid_parameter_value';
  end if;

  select m.id, m.ativo_id into v_mov
    from public.movimentacoes m where m.id = p_movimentacao_id;
  if not found then
    raise exception 'Movimentação não encontrada.' using errcode = 'no_data_found';
  end if;

  select a.filial_id into v_filial
    from public.ativos a where a.id = v_mov.ativo_id for update;

  for v_par in
    select distinct (e.value ->> 'item_id')::int as item_id,
                    (e.value ->> 'filial_id')::int as filial
      from jsonb_array_elements(p_estornos) e
     order by 1, 2
  loop
    perform pg_advisory_xact_lock(v_par.item_id, v_par.filial);
  end loop;

  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, estorno_de, observacao, criado_por)
  values (v_mov.ativo_id, 'estorno'::public.tipo_movimentacao, current_date, v_filial,
          p_movimentacao_id, nullif(btrim(coalesce(p_observacao, '')), ''), v_autor)
  returning id into v_novo;

  -- ⚠ Mesma ordem total da função acima (0122), pela mesma razão.
  for v_elem in
    select e.value from jsonb_array_elements(p_estornos) e
     order by case
                when (e.value ->> 'tipo') = 'ajuste'
                 and (e.value ->> 'quantidade')::int > 0 then 0
                when (e.value ->> 'quantidade')::int > 0 then 1
                else 2
              end,
              (e.value ->> 'item_id')::int,
              (e.value ->> 'estorna_id')
  loop
    insert into public.lancamentos_item (
      item_id, filial_id, tipo, quantidade, data,
      colaborador, colaborador_id, chamado, observacao,
      estorna_id, movimentacao_id, criado_por
    ) values (
      (v_elem ->> 'item_id')::smallint,
      (v_elem ->> 'filial_id')::smallint,
      (v_elem ->> 'tipo')::public.tipo_lancamento,
      (v_elem ->> 'quantidade')::int,
      current_date,
      nullif(v_elem ->> 'colaborador', ''),
      nullif(v_elem ->> 'colaborador_id', '')::uuid,
      nullif(v_elem ->> 'chamado', ''),
      nullif(v_elem ->> 'observacao', ''),
      (v_elem ->> 'estorna_id')::uuid,
      v_novo,
      v_autor
    );
    v_n := v_n + 1;
  end loop;

  select count(*) into v_orfaos
    from public.lancamentos_item l
   where l.movimentacao_id = p_movimentacao_id
     and l.estorna_id is null
     and not exists (select 1 from public.lancamentos_item inv where inv.estorna_id = l.id);

  if v_orfaos > 0 then
    raise exception
      'Não dá para estornar: % lançamento(s) de item desta movimentação ficariam sem o estorno correspondente.', v_orfaos
      using errcode = 'check_violation';
  end if;

  return jsonb_build_object('estorno_id', v_novo, 'itens', v_n);
end $$;

comment on function public.estornar_movimentacao_com_itens(uuid, text, jsonb, uuid) is
  'F38 (0121, ordem corrigida na 0122): estorna uma movimentação E grava os lançamentos INVERSOS dos itens que foram junto, na MESMA transação, em ordem TOTAL pelo efeito (ajuste positivo, demais positivos, negativos; desempate por item_id e estorna_id). Os inversos chegam prontos de `planejarEstorno`. Antes de devolver, CONFERE que nenhum lançamento da movimentação ficou sem estorno e RECUSA a transação inteira se ficou — nunca meio estorno.';

-- ===== SMOKE (rodar depois de aplicar — só leitura) =====
--   select p.proname, p.prosecdef,
--          pg_get_functiondef(p.oid) ilike '%repõe o Total%' as tem_ordem_nova
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public'
--      and p.proname in ('reabrir_pendencias_item_com_estornos','estornar_movimentacao_com_itens');
--   -- esperado: 2 linhas, prosecdef = false, tem_ordem_nova = true
