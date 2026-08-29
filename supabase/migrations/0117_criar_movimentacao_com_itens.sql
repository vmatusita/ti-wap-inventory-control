-- Migration 0117 — o lote inteiro numa transação só (F38, frente B · D13).
--
-- Cria `public.criar_movimentacao_com_itens`: grava o lote de movimentações **e**
-- os lançamentos de item que vão junto, TUDO OU NADA. Nenhuma função existente é
-- recriada aqui; nenhum valor de enum é acrescentado.
--
-- ---------------------------------------------------------------------------
-- O DEFEITO QUE ESTA FUNÇÃO MATA
-- ---------------------------------------------------------------------------
-- `src/lib/actions/movimentacoes.ts` grava o lote num `for` de INSERTs, e o
-- comentário do próprio arquivo diz por escrito que "as linhas anteriores ja estao
-- commitadas (cada insert e uma transacao)". Num lote de 30 ativos, uma transição
-- inválida no 18º deixava 17 gravadas e 13 fora — meio lote, que o operador tinha
-- de reconciliar à mão. É o item U da docs/DIVIDA-TECNICA.md ("Escrita em duas
-- etapas sem transação").
--
-- Decisão do Johnny, 28/08/2026: **um patrimônio ruim derruba os 29 bons**, e é
-- isso que ele quer. Meio lote é pior que lote nenhum, porque só o segundo é
-- óbvio. O painel de sucesso parcial deixa de existir para este caminho.
--
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER — DECLARADO, e por que isso É a autorização
-- ---------------------------------------------------------------------------
-- Rodando com a sessão de quem chamou, cada INSERT passa pelas policies, avaliadas
-- LINHA A LINHA:
--
--   movimentacoes."operador insere"  → pode_escrever_filial(filial_id)
--                                      and pode_escrever_filial(snapshot_anterior->>'filial_id')
--   lancamentos_item."operador lanca" → pode_escrever_filial(filial_id)
--                                      and estorno_item_coerente(estorna_id, filial_id, item_id)
--
-- Ou seja: "operador escreve só nas filiais vinculadas" sai de graça e no lugar
-- certo (o Postgres), sem que esta função precise ser confiada para nada.
--
-- ⚠ As três RPCs de escrita de acervo desta casa (`criar_compra_lote` 0064,
-- `devolver_ao_fornecedor` 0047, `transferir_item` 0104) são invoker por OMISSÃO da
-- cláusula; as de leitura (0011, 0016) escrevem `security invoker` na cara. Esta
-- DECLARA a palavra — a mesma coisa dita de propósito, não por descuido.
--
-- A guarda `pode_escrever_filial` no corpo é cinto-e-suspensórios PELA MENSAGEM,
-- não pela segurança: sem ela o operador recebe o `42501` cru da policy, que a UI
-- traduz como um conselho errado (a lição está no cabeçalho da 0104).
--
-- ---------------------------------------------------------------------------
-- ⚠ AS DUAS CLASSES DE TRAVA — e por que as DUAS são pedidas em ordem total
-- ---------------------------------------------------------------------------
-- (1) ADVISORY, por par (item, filial). A primeira linha do corpo de
--     `valida_lancamento_item` é `perform pg_advisory_xact_lock(new.item_id,
--     new.filial_id)`. Gravando N linhas de item na mesma transação, são N travas
--     adquiridas na ordem dos INSERTs — e dois lotes simultâneos com os itens em
--     ordens diferentes se travam mutuamente. É a mesma classe de bug que a 0100
--     (F24) teve de consertar depois de já estar em produção. Solução, idêntica ao
--     passo 5 da 0104: esta função adquire TODAS as advisory locks, ela mesma, em
--     ordem total crescente `(item_id, filial_id)`, ANTES do primeiro INSERT.
--     Advisory locks são reentrantes na mesma sessão: as que o trigger pedir
--     depois já estarão nas mãos, e nenhuma aquisição sairá fora de ordem.
--
-- (2) ROW LOCK em `ativos`. Esta é NOVA, e nasce da própria transacionalidade:
--     `aplicar_movimentacao` faz `select … from ativos … for update` em cada
--     INSERT. Hoje cada INSERT é a própria transação, então esses row locks nunca
--     coexistem. Numa transação só, o lote passa a segurar N deles ao mesmo tempo
--     — e dois lotes que compartilhem ativos em ordens diferentes deadlockam. Por
--     isso esta função também trava os ativos ELA MESMA, em ordem total crescente
--     de `id`, antes de tudo.
--
-- ⚠ A ORDEM ENTRE AS DUAS CLASSES É **ATIVOS PRIMEIRO, ADVISORY DEPOIS** — é o que
-- o corpo faz (passo 2, depois passo 3), e é o que `estornar_movimentacao_com_itens`
-- (0121) também faz. A primeira escrita deste comentário dizia o contrário, e o
-- risco era concreto: alguém "consertaria" o código para casar com o texto, as duas
-- funções passariam a divergir, e um lote e um estorno disputando o mesmo ativo e o
-- mesmo par (item, filial) deadlockariam — a classe de bug que a 0100 já pagou em
-- produção. Quem mexer aqui mexe nas DUAS, ou em nenhuma. A ordem é fixa e única
-- porque esta é a única função que pede as duas. Quem mexer neste corpo NÃO PODE
-- remover nenhum dos dois passos nem trocar a ordenação por "a ordem em que o
-- operador digitou". O roteiro `supabase/tests/f38_itens_com_ativo.sql` trava isso.
--
-- ---------------------------------------------------------------------------
-- A FILIAL VEM DO ATIVO, LIDO SOB A TRAVA — não do payload
-- ---------------------------------------------------------------------------
-- A action lê `ativos.filial_id` para montar a linha, e entre aquela leitura e o
-- INSERT o ativo pode ter sido transferido por outra sessão. Numa transação única
-- isso deixa de ser aceitável em silêncio: a filial é DERIVADA aqui dentro, do
-- ativo já travado. Uma fonte só, e a policy de filial passa a ser avaliada sobre
-- o valor verdadeiro. O payload não carrega `filial_id`.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTA FUNÇÃO **NÃO** FAZ, de propósito (lições da 0104)
-- ---------------------------------------------------------------------------
-- · Não recalcula saldo de item. Quem valida é o trigger `valida_lancamento_item`,
--   linha a linha, sob a trava — e ele é a fonte da verdade. Uma segunda conta de
--   estoque aqui seria uma segunda definição da mesma regra.
-- · Não decide o status do ativo. Quem decide é `aplicar_movimentacao`, intocado.
-- · Não redige texto. Observações chegam PRONTAS, compostas em `src/lib/`.
-- · Não acrescenta valor de enum. Entrega é `saida` ("Liberação"), devolução é
--   `retorno` ("Retorno") — os dois já existem (o `retorno` desde a 0027).
-- · Não faz UPDATE nem DELETE em histórico. `guarda_acervo` (0081) recusaria.
--
-- ---------------------------------------------------------------------------
-- COMO O ERRO DIZ QUAL LINHA DERRUBOU O LOTE
-- ---------------------------------------------------------------------------
-- Cada INSERT roda dentro de um bloco `exception`, que re-lança o erro ORIGINAL
-- (mesmo `sqlstate`, mesma `sqlerrm`, para `traduzErroBanco` continuar funcionando)
-- acrescentando `detail = 'f38_linha=<i>'` / `'f38_item=<i>'`. O re-raise aborta a
-- transação inteira: o bloco existe para ETIQUETAR o erro, nunca para engoli-lo.
--
-- ROLLBACK LÓGICO: `drop function public.criar_movimentacao_com_itens(jsonb, jsonb, uuid);`
-- — a action volta ao caminho antigo sem perder um registro.
-- ===========================================================================

create or replace function public.criar_movimentacao_com_itens(
  p_movimentacoes jsonb,   -- [{ativo_id, tipo, motivo, data, filial_destino_id, colaborador,
                           --   colaborador_id, setor, chamado, chamado_fornecedor, termo_assinado,
                           --   termo_data, itens_faltantes, observacao, status_resultante}, …]
  p_itens         jsonb,   -- [{indice_movimentacao, item_id, tipo, quantidade, data, colaborador,
                           --   colaborador_id, observacao, chamado}, …]
  p_criado_por    uuid
)
returns jsonb              -- {"movimentacoes": [uuid, …], "itens": <int>}
language plpgsql
security invoker           -- DECLARADO (ver cabeçalho)
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

  -- Todo item precisa apontar uma movimentação QUE EXISTE no lote, e isso é
  -- conferido ANTES de travar e de inserir: um índice fora do intervalo faria o
  -- passo 3 deixar de travar um par e o erro só apareceria depois do primeiro
  -- INSERT — tarde demais para ser uma mensagem útil.
  if exists (
    select 1 from jsonb_array_elements(p_itens) i
     where coalesce((i.value ->> 'indice_movimentacao')::int, -1) not between 0 and v_n_mov - 1
  ) then
    raise exception 'Item vinculado a uma movimentação que não existe no lote.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- 2) Travar os ATIVOS em ordem total crescente de id, ANTES de qualquer INSERT.
  --    (classe 2 do cabeçalho: sem isso, dois lotes que compartilhem ativos em
  --    ordens diferentes deadlockam nos row locks que aplicar_movimentacao pega.)
  for v_par in
    select distinct (e.value ->> 'ativo_id')::uuid as ativo_id
      from jsonb_array_elements(p_movimentacoes) e
     where nullif(e.value ->> 'ativo_id', '') is not null
     order by 1
  loop
    perform 1 from public.ativos a where a.id = v_par.ativo_id for update;
  end loop;

  -- 3) Travar os PARES (item, filial) em ordem total crescente, ANTES do primeiro
  --    INSERT (classe 1 do cabeçalho — o passo 5 da 0104, pela mesma razão).
  --    A filial de cada item é a do ativo da movimentação que ele acompanha.
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

    -- Transferência: destino tem de ser diferente da filial ATUAL (OS-F2 3.3.1),
    -- conferido aqui dentro, sob a trava, contra o valor verdadeiro.
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

  -- 5) Os lançamentos de item, cada um apontando UMA movimentação do lote (D13) --
  for v_i in 0 .. v_n_itens - 1 loop   -- lista vazia: `0 .. -1` não itera
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
  'F38 (0117): grava o lote de movimentações E os lançamentos de item que vão junto numa transação só, TUDO OU NADA — uma linha inválida derruba o lote inteiro (decisão do Johnny, 28/08/2026). SECURITY INVOKER: a permissão por filial é imposta pelas policies "operador insere" e "operador lanca", linha a linha. Adquire as travas das DUAS classes em ordem total — row lock dos ativos por id, advisory lock por (item_id, filial_id) — ANTES do primeiro INSERT, para não deadlockar com um lote de ordem contrária. A filial é derivada do ativo lido sob a trava, nunca do payload. Não recalcula saldo, não decide status, não redige texto.';

-- Grants: idênticos aos das RPCs vizinhas (0104:239-243, 0064:125-126, 0045:381).
revoke all on function public.criar_movimentacao_com_itens(jsonb, jsonb, uuid)
  from public, anon, service_role;
grant execute on function public.criar_movimentacao_com_itens(jsonb, jsonb, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO PÓS-APPLY (obrigatória — runbook §5)
-- ---------------------------------------------------------------------------
-- 1) Exatamente UMA assinatura, sem overload:
--      select p.oid::regprocedure::text, p.prosecdef
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname = 'criar_movimentacao_com_itens';
--      -- esperado: 1 linha, (jsonb, jsonb, uuid), prosecdef = false (INVOKER)
--
-- 2) Grants como o desenho previu:
--      select grantee, privilege_type from information_schema.routine_privileges
--       where routine_schema='public' and routine_name='criar_movimentacao_com_itens';
--      -- esperado: só authenticated / EXECUTE
--
-- 3) Nenhuma função vizinha foi tocada (md5 igual ao de antes do apply):
--      select p.proname, md5(pg_get_functiondef(p.oid))
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname='public' and p.proname in
--             ('aplicar_movimentacao','valida_lancamento_item','rel_saldo_itens','guarda_acervo');
