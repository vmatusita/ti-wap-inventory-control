-- =====================================================================================================================
-- 0201_escrita_empresa_movimentacoes.sql — F67C (16/11/2026): o fim do default — EXPANSÃO, lote 1: as que gravam ativo, movimentação e pendência
-- =====================================================================================================================
-- classe: ADITIVA (create or replace de função com a MESMA assinatura — nenhum dado, nenhuma policy)
--
-- A F67C faz toda escrita dizer a empresa (a expansão) e só depois tira o default public.empresa_legada() das 20 colunas
-- empresa_id (a contração, 0205–0207, aplicada em produção só depois do deploy e da janela — docs/PLAN-F67C.md §6).
-- Aqui, as que gravam ativo, movimentação e pendência: cada INSERT ganha empresa_id na lista de colunas, com a empresa da FILIAL que a própria linha
-- grava, lida pela ponte única public.empresa_da_filial(smallint) (0185) — a anotação, a da filial do ativo; o substituto
-- da devolução, a da filial do ativo antigo. Nenhuma função passa a LER empresa_id: a coluna só aparece
-- na lista de colunas do INSERT (decisão 2 do PLAN-F67C). As FKs compostas (0166/0167) conferem a coerência com cada outro
-- pai (ativo, movimentação, item, colaborador, pendência). Com uma empresa só, a linha nasce exatamente como hoje (a WAP).
--
-- Assinatura e ACL: create or replace com a MESMA assinatura preserva dono, grants e dependências (doc PG 17); nenhuma
-- precisa de janela (pg_stat_statements.track = top: o INSERT de dentro da função não é forma de topo — fato 14).
--
-- DIFF CONTRA O CORPO VIGENTE (gerado; só a coluna, o valor e a leitura do pai):
--
--   criar_compra_lote(jsonb, uuid) — vigente em 0064_papeis_guardas_rpcs.sql:
--     @@
--        v_filial smallint;
--     +  v_empresa uuid;
--      begin
--     @@
--      
--     +    v_empresa := public.empresa_da_filial(v_filial);
--     +
--          insert into public.ativos (
--     -      patrimonio, patrimonio_original, service_tag, categoria, marca, modelo,
--     +      empresa_id, patrimonio, patrimonio_original, service_tag, categoria, marca, modelo,
--            memoria, armazenamento, processador, fornecedor, filial_id, origem, observacoes
--          ) values (
--     +      v_empresa,
--            item->>'patrimonio',
--     @@
--      
--     -    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
--     +    insert into public.movimentacoes (empresa_id, ativo_id, tipo, data, filial_id, observacao, criado_por)
--          values (
--     -      v_id, 'compra',
--     +      v_empresa, v_id, 'compra',
--            coalesce((item->>'data')::date, current_date),
--
--   devolver_ao_fornecedor(uuid, jsonb, jsonb, uuid) — vigente em 0047_troca.sql:
--     @@
--        v_sub_filial smallint;
--     +  v_empresa    uuid;
--      begin
--     @@
--        end if;
--     +  v_empresa := public.empresa_da_filial(v_antigo.filial_id);
--      
--     @@
--        insert into public.movimentacoes (
--     -    ativo_id, tipo, data, filial_id, chamado, chamado_fornecedor, observacao, criado_por
--     +    empresa_id, ativo_id, tipo, data, filial_id, chamado, chamado_fornecedor, observacao, criado_por
--        ) values (
--     -    p_ativo_id, 'devolucao_fornecedor',
--     +    v_empresa, p_ativo_id, 'devolucao_fornecedor',
--          coalesce((p_mov->>'data')::date, current_date),
--     @@
--          insert into public.ativos (
--     -      patrimonio, service_tag, categoria, marca, modelo,
--     +      empresa_id, patrimonio, service_tag, categoria, marca, modelo,
--            memoria, armazenamento, processador, hostname,
--     @@
--          ) values (
--     +      v_empresa,
--            nullif(p_substituto->>'patrimonio', ''),
--     @@
--          -- em_estoque -> em_estoque (nascimento, espelho da compra na máquina de estados).
--     -    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
--     +    insert into public.movimentacoes (empresa_id, ativo_id, tipo, data, filial_id, observacao, criado_por)
--          values (
--     -      substituto_id, 'troca',
--     +      v_empresa, substituto_id, 'troca',
--            coalesce((p_substituto->>'data')::date, current_date),
--
--   criar_movimentacao_com_itens(jsonb, jsonb, uuid) — vigente em 0126_lancamento_regulariza.sql:
--     @@
--            insert into public.movimentacoes (
--     -        ativo_id, tipo, motivo, data, filial_id, filial_destino_id,
--     +        empresa_id, ativo_id, tipo, motivo, data, filial_id, filial_destino_id,
--              colaborador, colaborador_id, setor, chamado, chamado_fornecedor,
--     @@
--            ) values (
--     +        public.empresa_da_filial(v_filial),
--              v_ativo_id,
--     @@
--              insert into public.lancamentos_item (
--     -          item_id, filial_id, tipo, quantidade, data,
--     +          empresa_id, item_id, filial_id, tipo, quantidade, data,
--                colaborador, colaborador_id, observacao, chamado,
--     @@
--              ) values (
--     +          public.empresa_da_filial(v_filial_it),
--                v_item_id::smallint,
--     @@
--              insert into public.lancamentos_item (
--     -          item_id, filial_id, tipo, quantidade, data,
--     +          empresa_id, item_id, filial_id, tipo, quantidade, data,
--                colaborador, colaborador_id, observacao, chamado,
--     @@
--              ) values (
--     +          public.empresa_da_filial(v_filial_it),
--                v_item_id::smallint,
--
--   estornar_movimentacao_com_itens(uuid, text, jsonb, uuid) — vigente em 0122_ordem_dos_inversos.sql:
--     @@
--      
--     -  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, estorno_de, observacao, criado_por)
--     -  values (v_mov.ativo_id, 'estorno'::public.tipo_movimentacao, current_date, v_filial,
--     +  insert into public.movimentacoes (empresa_id, ativo_id, tipo, data, filial_id, estorno_de, observacao, criado_por)
--     +  values (public.empresa_da_filial(v_filial), v_mov.ativo_id, 'estorno'::public.tipo_movimentacao, current_date, v_filial,
--                p_movimentacao_id, nullif(btrim(coalesce(p_observacao, '')), ''), v_autor)
--     @@
--          insert into public.lancamentos_item (
--     -      item_id, filial_id, tipo, quantidade, data,
--     +      empresa_id, item_id, filial_id, tipo, quantidade, data,
--            colaborador, colaborador_id, chamado, observacao,
--     @@
--          ) values (
--     +      public.empresa_da_filial((v_elem ->> 'filial_id')::smallint),
--            (v_elem ->> 'item_id')::smallint,
--
--   movimentacao_abrir_pendencias_item(public.movimentacoes, public.ativos) — vigente em 0150_movimentacao_decomposta.sql:
--     @@
--        if p_mov.tipo = 'devolucao' and coalesce(cardinality(p_mov.itens_faltantes), 0) > 0 then
--     -    insert into public.pendencias_item (ativo_id, movimentacao_id, item, colaborador, filial_id)
--     -    select p_mov.ativo_id,
--     +    insert into public.pendencias_item (empresa_id, ativo_id, movimentacao_id, item, colaborador, filial_id)
--     +    select public.empresa_da_filial(p_mov.filial_id),
--     +           p_mov.ativo_id,
--                 p_mov.id,
-- =====================================================================================================================

set lock_timeout = '2s';

create or replace function public.criar_compra_lote(
  p_itens      jsonb,
  p_criado_por uuid
)
returns table (ativo_id uuid, patrimonio text)
language plpgsql
set search_path = public
as $$
declare
  item     jsonb;
  v_id     uuid;
  v_filial smallint;
  v_empresa uuid;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Lote de compra vazio';
  end if;

  for item in select * from jsonb_array_elements(p_itens)
  loop
    v_filial := (item->>'filial_id')::smallint;

    -- GUARDA DE VINCULO (F21, migration 0064) — por ITEM do lote.
    -- Esta funcao e SECURITY INVOKER, entao os dois INSERTs abaixo JA passam pelas
    -- policies da 0063 e um operador sem vinculo seria barrado de todo jeito. A guarda
    -- e cinto-e-suspensorio pela MENSAGEM: sem ela o operador receberia o SQLSTATE cru
    -- de violacao de RLS (42501 "new row violates row-level security policy"), que a UI
    -- traduz como "faca login novamente" — conselho errado para quem so nao tem a
    -- filial vinculada. Com ela, a acao devolve o motivo verdadeiro.
    if not public.pode_escrever_filial(v_filial) then
      raise exception 'Sem permissao de escrita na filial % (cadastro de compra).', v_filial
        using errcode = '42501';
    end if;

    v_empresa := public.empresa_da_filial(v_filial);

    insert into public.ativos (
      empresa_id, patrimonio, patrimonio_original, service_tag, categoria, marca, modelo,
      memoria, armazenamento, processador, fornecedor, filial_id, origem, observacoes
    ) values (
      v_empresa,
      item->>'patrimonio',
      nullif(item->>'patrimonio_original', ''),
      nullif(item->>'service_tag', ''),
      (item->>'categoria')::public.categoria_ativo,
      nullif(item->>'marca', ''),
      nullif(item->>'modelo', ''),
      nullif(item->>'memoria', ''),
      nullif(item->>'armazenamento', ''),
      nullif(item->>'processador', ''),
      nullif(item->>'fornecedor', ''),
      v_filial,
      'cadastro',
      nullif(item->>'observacoes', '')
    )
    returning id into v_id;

    insert into public.movimentacoes (empresa_id, ativo_id, tipo, data, filial_id, observacao, criado_por)
    values (
      v_empresa, v_id, 'compra',
      coalesce((item->>'data')::date, current_date),
      v_filial,
      nullif(item->>'observacao', ''),
      coalesce(auth.uid(), p_criado_por)
    );

    ativo_id   := v_id;
    patrimonio := item->>'patrimonio';
    return next;
  end loop;
end $$;

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
  v_empresa    uuid;
begin
  select * into v_antigo from public.ativos where id = p_ativo_id;
  if v_antigo.id is null then
    raise exception 'Ativo % não encontrado para devolução ao fornecedor.', p_ativo_id;
  end if;
  v_empresa := public.empresa_da_filial(v_antigo.filial_id);

  -- (1) devolução ao fornecedor no ativo ANTIGO. O trigger valida a transição
  --     (em_manutencao -> devolvido_fornecedor) e atualiza o estado; se o ativo não
  --     estiver em_manutencao, status_apos_movimentacao devolve null e o trigger levanta
  --     'Movimentacao ... invalida' -> rollback total (a UI faz a pré-checagem amigável).
  insert into public.movimentacoes (
    empresa_id, ativo_id, tipo, data, filial_id, chamado, chamado_fornecedor, observacao, criado_por
  ) values (
    v_empresa, p_ativo_id, 'devolucao_fornecedor',
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
      empresa_id, patrimonio, service_tag, categoria, marca, modelo,
      memoria, armazenamento, processador, hostname,
      fornecedor, filial_id, origem, observacoes, substitui_ativo_id
    ) values (
      v_empresa,
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
    insert into public.movimentacoes (empresa_id, ativo_id, tipo, data, filial_id, observacao, criado_por)
    values (
      v_empresa, substituto_id, 'troca',
      coalesce((p_substituto->>'data')::date, current_date),
      v_sub_filial,
      nullif(p_substituto->>'observacao', ''),
      v_uid
    ) returning id into substituto_mov_id;
  end if;

  return next;
end $$;

create or replace function public.criar_movimentacao_com_itens(
  p_movimentacoes jsonb,
  p_itens jsonb,
  p_criado_por uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
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
  -- F41 (0126) — a partição da quantidade:
  v_tipo       text;
  v_filial_it  smallint;
  v_aberto     int;      -- A = em uso em aberto (teto do retorno)
  v_estoque    int;      -- E = em estoque       (teto da saída)
  v_reg        int;      -- a parte que o diário NÃO conhecia
  v_normal     int;      -- a parte que ele conhecia
  v_obs_reg    text;
  -- O que foi regularizado, para a tela DIZER (e não adivinhar):
  v_n_reg      int := 0;  -- quantas linhas ganharam acerto
  v_qtd_reg    int := 0;  -- quantas unidades entraram por acerto
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
        empresa_id, ativo_id, tipo, motivo, data, filial_id, filial_destino_id,
        colaborador, colaborador_id, setor, chamado, chamado_fornecedor,
        termo_assinado, termo_data, itens_faltantes, observacao,
        status_resultante, criado_por
      ) values (
        public.empresa_da_filial(v_filial),
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

    -- ===== F41 (0126) — A PARTIÇÃO DA QUANTIDADE ===========================
    -- Lida DEPOIS das travas do passo 3 e RELIDA a cada linha (os INSERTs desta
    -- mesma transação são visíveis): é o que faz duas linhas do mesmo par se
    -- comportarem em vez de planejarem o mesmo `retorno` duas vezes.
    v_tipo      := v_elem ->> 'tipo';
    v_filial_it := v_filiais[v_indice + 1];
    v_reg       := 0;
    v_normal    := v_qtd;

    if v_tipo = 'retorno' then
      -- A = em uso em aberto do par. Espelha a guarda de `retorno` do trigger
      -- valida_lancamento_item (Σsaida − Σretorno), com piso em zero.
      select greatest(0, coalesce(sum(case l.tipo::text when 'saida'   then l.quantidade
                                                        when 'retorno' then -l.quantidade
                                                        else 0 end), 0))
        into v_aberto
        from public.lancamentos_item l
       where l.item_id = v_item_id::smallint and l.filial_id = v_filial_it;
      v_normal := least(v_qtd, v_aberto);
      v_reg    := v_qtd - v_normal;

    elsif v_tipo = 'saida' then
      -- E = em estoque do par. Espelha, expressão por expressão, a conta de
      -- `v_estoque` do trigger: total_raw − atrelados − máx(0, lib_raw).
      with agg as (
        select coalesce(sum(case l.tipo::text when 'entrada' then l.quantidade
                                              when 'ajuste'  then l.quantidade
                                              else 0 end), 0) as total_raw,
               coalesce(sum(case l.tipo::text when 'saida'   then l.quantidade
                                              when 'retorno' then -l.quantidade
                                              else 0 end), 0) as lib_raw
          from public.lancamentos_item l
         where l.item_id = v_item_id::smallint and l.filial_id = v_filial_it
      ),
      atrel as (
        select coalesce(sum(greatest(0, net)), 0) as atrelados from (
          select coalesce(sum(case l.tipo::text when 'reserva'   then l.quantidade
                                                when 'liberacao' then -l.quantidade
                                                else 0 end), 0) as net
            from public.lancamentos_item l
           where l.item_id = v_item_id::smallint and l.filial_id = v_filial_it
             and l.chamado is not null
           group by l.chamado
        ) b
      )
      select agg.total_raw - atrel.atrelados - greatest(0, agg.lib_raw)
        into v_estoque
        from agg, atrel;
      v_reg    := greatest(0, v_qtd - v_estoque);
      v_normal := v_qtd;   -- a saída sai INTEIRA; o acerto só repõe o que faltava
    end if;

    -- (a) O ACERTO AUTOMÁTICO, SEMPRE PRIMEIRO. É a mesma ordem total que a 0122
    --     já escreveu ("ajuste positivo repõe o Total antes dos demais positivos"),
    --     pelo mesmo motivo: a ordem errada faz o trigger recusar por estoque
    --     negativo.
    if v_reg > 0 then
      v_obs_reg := nullif(btrim(coalesce(v_elem ->> 'observacao_regularizacao', '')), '');
      if v_obs_reg is null then
        -- O CHECK lanc_item_ajuste_obs exigiria isso de qualquer jeito; aqui a
        -- mensagem diz o que falta, em vez de estourar como violação genérica.
        raise exception 'O acerto automático deste item precisa de uma justificativa.'
          using errcode = 'invalid_parameter_value', detail = 'f38_item=' || v_i;
      end if;
      begin
        insert into public.lancamentos_item (
          empresa_id, item_id, filial_id, tipo, quantidade, data,
          colaborador, colaborador_id, observacao, chamado,
          movimentacao_id, criado_por, regularizacao
        ) values (
          public.empresa_da_filial(v_filial_it),
          v_item_id::smallint,
          v_filial_it,
          'ajuste'::public.tipo_lancamento,
          v_reg,
          coalesce(nullif(v_elem ->> 'data', '')::date, current_date),
          nullif(v_elem ->> 'colaborador', ''),
          -- colaborador_id NULO de propósito: o acerto é sobre a PRATELEIRA (a peça
          -- entrou no acervo), não sobre a conta de ninguém. O nome fica ao lado
          -- como contexto do histórico; o vínculo que baixa saldo é do `retorno`.
          null,
          v_obs_reg,
          nullif(v_elem ->> 'chamado', ''),
          v_ids[v_indice + 1],
          v_autor,
          true
        );
      exception when others then
        raise exception '%', sqlerrm using errcode = sqlstate, detail = 'f38_item=' || v_i;
      end;
      v_n_reg   := v_n_reg + 1;
      v_qtd_reg := v_qtd_reg + v_reg;
    end if;

    -- (b) A LINHA NORMAL, com a quantidade que o diário reconhece. Para `retorno`
    --     com A = 0 ela não existe — é uma linha só, e é o caso do print.
    if v_normal > 0 then
      begin
        insert into public.lancamentos_item (
          empresa_id, item_id, filial_id, tipo, quantidade, data,
          colaborador, colaborador_id, observacao, chamado,
          movimentacao_id, criado_por
        ) values (
          public.empresa_da_filial(v_filial_it),
          v_item_id::smallint,
          v_filial_it,
          v_tipo::public.tipo_lancamento,
          v_normal,
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
    end if;
  end loop;

  -- `regularizacoes` e `unidades_regularizadas` são F41: é com eles que o painel de
  -- sucesso diz, em UMA linha, o que entrou por acerto automático — sem eles a tela
  -- teria de adivinhar, ou consultar de novo depois de gravar. Chave NOVA no jsonb
  -- de retorno não muda a ASSINATURA e não quebra chamador antigo, que só lê as que
  -- conhece.
  return jsonb_build_object('movimentacoes', to_jsonb(v_ids), 'itens', v_n_itens,
                            'regularizacoes', v_n_reg, 'unidades_regularizadas', v_qtd_reg);
end $$;

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

  insert into public.movimentacoes (empresa_id, ativo_id, tipo, data, filial_id, estorno_de, observacao, criado_por)
  values (public.empresa_da_filial(v_filial), v_mov.ativo_id, 'estorno'::public.tipo_movimentacao, current_date, v_filial,
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
      empresa_id, item_id, filial_id, tipo, quantidade, data,
      colaborador, colaborador_id, chamado, observacao,
      estorna_id, movimentacao_id, criado_por
    ) values (
      public.empresa_da_filial((v_elem ->> 'filial_id')::smallint),
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

create or replace function public.movimentacao_abrir_pendencias_item(
  p_mov   public.movimentacoes,
  p_ativo public.ativos
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_mov.tipo = 'devolucao' and coalesce(cardinality(p_mov.itens_faltantes), 0) > 0 then
    insert into public.pendencias_item (empresa_id, ativo_id, movimentacao_id, item, colaborador, filial_id)
    select public.empresa_da_filial(p_mov.filial_id),
           p_mov.ativo_id,
           p_mov.id,
           u.item,
           coalesce(nullif(p_mov.colaborador, ''), p_ativo.colaborador_atual),
           p_mov.filial_id
    from unnest(p_mov.itens_faltantes) as u(item)
    where nullif(trim(u.item), '') is not null;
  end if;
end $$;

notify pgrst, 'reload schema';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   o md5 do prosrc de cada função tocada = o do CI; as outras funções e todas as policies byte a byte (o "antes");
--   15m de catalogo_policies.sql sem estas funções na lista; 0 linhas fora da legada nas 20.
--
-- ROLLBACK (supabase/rollback/F67C-desfaz.sql, na ordem inversa 0207 → 0200): reemitir cada função com o corpo vigente
-- antes desta migration (o arquivo indicado no diff acima).
