-- Migration 0123 — a ordem dos itens DENTRO do lote, que a 0122 corrigiu só de um
-- lado (achado da revisão de código de 29/08/2026).
--
-- ---------------------------------------------------------------------------
-- O DEFEITO, EXATO
-- ---------------------------------------------------------------------------
-- A 0122 descobriu que inserir lançamentos inversos na ordem errada faz o trigger
-- `valida_lancamento_item` recusar por estoque negativo, e ordenou pelo EFEITO nas
-- duas funções de estorno. Ficou de fora a função que GRAVA o lote:
-- `criar_movimentacao_com_itens` (0117), cujo passo 5 percorre `p_itens` na ordem
-- CRUA do payload.
--
-- E o payload tem uma ordem conhecida e desfavorável. `montarItensJuntoDoLote`
-- (src/components/movimentacoes/nova/itens-do-lote.ts) empilha primeiro as linhas
-- da ENTREGA (`saida`) e depois as do checklist da devolução (`retorno`) — que é
-- exatamente a montagem de uma TROCA/UPGRADE: o notebook velho volta com o fone, o
-- novo sai com outro fone, mesmo item de catálogo, mesma filial.
--
-- ⚠ E a ordem errada FALHA, não é só feia. Prateleira em 0 (o caso comum de um
-- acessório que está todo com as pessoas): a `saida (+1)` entra primeiro, o trigger
-- calcula `estoque = total − atrelados − max(0, liberados)` e chega a −1, e recusa
-- a transação INTEIRA com "Estoque insuficiente" — derrubando 30 movimentações de
-- equipamento por causa de um periférico, numa operação que é NEUTRA no saldo.
--
-- ---------------------------------------------------------------------------
-- A CORREÇÃO: a mesma regra da 0122, do lado que faltava
-- ---------------------------------------------------------------------------
--     1º  quem AUMENTA o disponível — `entrada`, `retorno`, `liberacao` e
--         `ajuste` positivo;
--     2º  quem CONSOME — `saida`, `reserva` e `ajuste` negativo.
--
-- E o desempate vai até o fim, pela ORDINALIDADE do payload: duas linhas do mesmo
-- ramo não têm dependência entre si, mas uma ordem total elimina a última fonte de
-- intermitência (a lição da pendência nº 5 da F37, que este projeto já pagou).
--
-- ⚠ O ÍNDICE DO ERRO CONTINUA SENDO O DO PAYLOAD. O `detail = 'f38_item=<i>'` que a
-- action lê para dizer "o Nº item que ia junto foi recusado" usa `v_i`, que segue
-- sendo a posição ORIGINAL na lista — não a posição de inserção. Reordenar a
-- inserção não pode reescrever o que a mensagem aponta.
--
-- ⚠ O CAST DA QUANTIDADE NO `order by` É GUARDADO por `jsonb_typeof(...) =
-- 'number'`. A 0122 casta direto porque os inversos são montados no servidor; aqui
-- a RPC é alcançável por qualquer sessão `authenticated`, e um payload forjado com
-- "quantidade": "x" estouraria no ORDER BY — ANTES da validação por linha, que tem
-- a mensagem em pt-BR. Com a guarda, o lixo cai no ramo 2 e morre na validação de
-- sempre, com o texto certo.
--
-- Nenhuma outra linha da função muda: `security invoker`, as duas classes de trava
-- em ordem total (ativos por id, depois advisory por (item, filial)), a derivação
-- da filial sob a trava, as guardas de mensagem e os blocos de etiqueta saem byte a
-- byte da 0117.
--
-- ROLLBACK LÓGICO: reaplicar o corpo da 0117.
-- ===========================================================================

create or replace function public.criar_movimentacao_com_itens(
  p_movimentacoes jsonb,
  p_itens         jsonb,
  p_criado_por    uuid
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  k_teto_lote  constant int := 30;   -- espelha MAX_LOTE_MOVIMENTACAO (src/lib/validators/movimentacao.ts)
  v_autor      uuid := coalesce(auth.uid(), p_criado_por);
  v_n_mov      int;
  v_n_itens    int;
  v_i          int;
  v_elem       jsonb;
  v_ativo_id   uuid;
  v_ativo      record;
  v_filial     smallint;
  v_destino    smallint;
  v_ids        uuid[] := '{}';
  v_filiais    smallint[] := '{}';   -- filial de cada movimentação, na mesma ordem
  v_nova_id    uuid;
  v_par        record;
  v_indice     int;
  v_item_id    int;
  v_qtd        int;
begin
  -- 1) Forma do payload ------------------------------------------------------
  if p_movimentacoes is null or jsonb_typeof(p_movimentacoes) <> 'array' then
    raise exception 'O lote de movimentações precisa ser uma lista.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_n_mov := jsonb_array_length(p_movimentacoes);
  if v_n_mov = 0 then
    raise exception 'Adicione ao menos um item ao lote.'
      using errcode = 'invalid_parameter_value';
  end if;
  if v_n_mov > k_teto_lote then
    raise exception 'O lote aceita no máximo % movimentações.', k_teto_lote
      using errcode = 'invalid_parameter_value';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'A lista de itens que vão junto precisa ser uma lista (vazia, se não houver).'
      using errcode = 'invalid_parameter_value';
  end if;
  v_n_itens := jsonb_array_length(p_itens);

  if exists (
    select 1 from jsonb_array_elements(p_itens) i
     where coalesce((i.value ->> 'indice_movimentacao')::int, -1) not between 0 and v_n_mov - 1
  ) then
    raise exception 'Item vinculado a uma movimentação que não existe no lote.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- 2) Travar os ATIVOS em ordem total crescente de id, ANTES de qualquer INSERT.
  for v_par in
    select distinct (e.value ->> 'ativo_id')::uuid as ativo_id
      from jsonb_array_elements(p_movimentacoes) e
     where nullif(e.value ->> 'ativo_id', '') is not null
     order by 1
  loop
    perform 1 from public.ativos a where a.id = v_par.ativo_id for update;
  end loop;

  -- 3) Travar os PARES (item, filial) em ordem total crescente, ANTES do primeiro
  --    INSERT (classe 1 do cabeçalho da 0117 — o passo 5 da 0104).
  for v_par in
    select distinct (i.value ->> 'item_id')::int as item_id, a.filial_id as filial
      from jsonb_array_elements(p_itens) i
      join public.ativos a
        on a.id = (p_movimentacoes
                     -> ((i.value ->> 'indice_movimentacao')::int)
                     ->> 'ativo_id')::uuid
     order by 1, 2
  loop
    perform pg_advisory_xact_lock(v_par.item_id, v_par.filial);
  end loop;

  -- 4) As movimentações, na ordem do lote --------------------------------------
  for v_i in 0 .. v_n_mov - 1 loop
    v_elem := p_movimentacoes -> v_i;
    v_ativo_id := nullif(v_elem ->> 'ativo_id', '')::uuid;

    if v_ativo_id is null then
      raise exception 'Movimentação sem ativo na linha %.', v_i + 1
        using errcode = 'invalid_parameter_value', detail = 'f38_linha=' || v_i;
    end if;

    -- O ativo já está travado pelo passo 2: esta leitura enxerga o estado real.
    select a.id, a.filial_id into v_ativo
      from public.ativos a where a.id = v_ativo_id;

    if not found then
      raise exception 'Ativo não encontrado.'
        using errcode = 'no_data_found', detail = 'f38_linha=' || v_i;
    end if;

    v_filial := v_ativo.filial_id;
    v_destino := nullif(v_elem ->> 'filial_destino_id', '')::smallint;

    -- Cinto-e-suspensórios PELA MENSAGEM (a policy já barraria com 42501 cru).
    if not public.pode_escrever_filial(v_filial) then
      raise exception 'Você não tem permissão de escrita na filial deste ativo.'
        using errcode = 'insufficient_privilege', detail = 'f38_linha=' || v_i;
    end if;

    if (v_elem ->> 'tipo') = 'transferencia' and v_destino is not distinct from v_filial then
      raise exception 'A filial de destino deve ser diferente da atual.'
        using errcode = 'check_violation', detail = 'f38_linha=' || v_i;
    end if;

    begin
      insert into public.movimentacoes (
        ativo_id, tipo, motivo, data, filial_id, filial_destino_id,
        colaborador, colaborador_id, setor, chamado, chamado_fornecedor,
        termo_assinado, termo_data, itens_faltantes, observacao,
        status_resultante, criado_por
      ) values (
        v_ativo_id,
        (v_elem ->> 'tipo')::public.tipo_movimentacao,
        nullif(v_elem ->> 'motivo', ''),
        coalesce(nullif(v_elem ->> 'data', '')::date, current_date),
        v_filial,
        v_destino,
        nullif(v_elem ->> 'colaborador', ''),
        nullif(v_elem ->> 'colaborador_id', '')::uuid,
        nullif(v_elem ->> 'setor', ''),
        nullif(v_elem ->> 'chamado', ''),
        nullif(v_elem ->> 'chamado_fornecedor', ''),
        nullif(v_elem ->> 'termo_assinado', '')::public.termo_status,
        nullif(v_elem ->> 'termo_data', '')::date,
        case
          when jsonb_typeof(v_elem -> 'itens_faltantes') = 'array'
          then array(select jsonb_array_elements_text(v_elem -> 'itens_faltantes'))
          else null
        end,
        nullif(v_elem ->> 'observacao', ''),
        nullif(v_elem ->> 'status_resultante', '')::public.status_ativo,
        v_autor
      )
      returning id into v_nova_id;
    exception when others then
      -- Etiqueta a linha e RE-LANÇA o erro original (mesmo sqlstate, mesma
      -- mensagem): o bloco existe para dizer QUAL linha, nunca para engolir.
      raise exception '%', sqlerrm using errcode = sqlstate, detail = 'f38_linha=' || v_i;
    end;

    v_ids := v_ids || v_nova_id;
    v_filiais := v_filiais || v_filial;
  end loop;

  -- 5) Os lançamentos de item, EM ORDEM TOTAL PELO EFEITO (0123) ---------------
  --    Quem repõe o disponível entra antes de quem consome; o desempate é a
  --    ordinalidade do payload. `v_i` continua sendo o índice ORIGINAL — é ele
  --    que o `detail` da mensagem de erro aponta.
  for v_par in
    select (e.ordinality - 1)::int as idx
      from jsonb_array_elements(p_itens) with ordinality e(value, ordinality)
     order by case
                when (e.value ->> 'tipo') in ('entrada', 'retorno', 'liberacao') then 0
                when (e.value ->> 'tipo') = 'ajuste'
                 and jsonb_typeof(e.value -> 'quantidade') = 'number'
                 and (e.value ->> 'quantidade')::numeric > 0 then 0
                else 1
              end,
              e.ordinality
  loop
    v_i := v_par.idx;
    v_elem := p_itens -> v_i;
    v_indice := (v_elem ->> 'indice_movimentacao')::int;   -- já validado no passo 1
    v_item_id := (v_elem ->> 'item_id')::int;
    v_qtd := (v_elem ->> 'quantidade')::int;

    if v_item_id is null or v_item_id <= 0 then
      raise exception 'Item inválido na lista de itens que vão junto.'
        using errcode = 'invalid_parameter_value', detail = 'f38_item=' || v_i;
    end if;
    if v_qtd is null or v_qtd <= 0 then
      raise exception 'A quantidade de um item que vai junto precisa ser maior que zero.'
        using errcode = 'invalid_parameter_value', detail = 'f38_item=' || v_i;
    end if;

    begin
      insert into public.lancamentos_item (
        item_id, filial_id, tipo, quantidade, data,
        colaborador, colaborador_id, observacao, chamado,
        movimentacao_id, criado_por
      ) values (
        v_item_id::smallint,
        v_filiais[v_indice + 1],
        (v_elem ->> 'tipo')::public.tipo_lancamento,
        v_qtd,
        coalesce(nullif(v_elem ->> 'data', '')::date, current_date),
        nullif(v_elem ->> 'colaborador', ''),
        nullif(v_elem ->> 'colaborador_id', '')::uuid,
        nullif(v_elem ->> 'observacao', ''),
        nullif(v_elem ->> 'chamado', ''),
        v_ids[v_indice + 1],
        v_autor
      );
    exception when others then
      raise exception '%', sqlerrm using errcode = sqlstate, detail = 'f38_item=' || v_i;
    end;
  end loop;

  return jsonb_build_object('movimentacoes', to_jsonb(v_ids), 'itens', v_n_itens);
end $$;

comment on function public.criar_movimentacao_com_itens(jsonb, jsonb, uuid) is
  'F38 (0117, ordem dos itens corrigida na 0123): grava o lote de movimentações E os lançamentos de item que vão junto numa transação só, TUDO OU NADA. Os itens entram em ordem TOTAL pelo efeito — entrada/retorno/liberacao/ajuste positivo antes de saida/reserva/ajuste negativo, desempatando pela ordinalidade do payload —, porque a ordem crua punha a `saida` da entrega antes do `retorno` do checklist numa troca e o trigger recusava o lote inteiro por estoque negativo. SECURITY INVOKER: a permissão por filial é imposta pelas policies "operador insere" e "operador lanca", linha a linha. Adquire as travas das DUAS classes em ordem total — row lock dos ativos por id, advisory lock por (item_id, filial_id) — ANTES do primeiro INSERT. A filial é derivada do ativo lido sob a trava, nunca do payload. Não recalcula saldo, não decide status, não redige texto.';

-- Grants: inalterados (o `create or replace` os preserva); repetidos aqui pelo
-- mesmo motivo da 0117 — a assinatura é a mesma, e a explicitação é barata.
revoke all on function public.criar_movimentacao_com_itens(jsonb, jsonb, uuid)
  from public, anon, service_role;
grant execute on function public.criar_movimentacao_com_itens(jsonb, jsonb, uuid)
  to authenticated;

-- ===== SMOKE (rodar depois de aplicar — só leitura) =====
--   select p.oid::regprocedure::text, p.prosecdef,
--          pg_get_functiondef(p.oid) ilike '%ordinality%' as tem_ordem_nova
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'criar_movimentacao_com_itens';
--   -- esperado: 1 linha, (jsonb, jsonb, uuid), prosecdef = false, tem_ordem_nova = true
