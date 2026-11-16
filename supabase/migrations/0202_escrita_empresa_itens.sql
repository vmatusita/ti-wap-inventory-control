-- =====================================================================================================================
-- 0202_escrita_empresa_itens.sql — F67C (16/11/2026): o fim do default — EXPANSÃO, lote 1: as que gravam lançamento de item
-- =====================================================================================================================
-- classe: ADITIVA (create or replace de função com a MESMA assinatura — nenhum dado, nenhuma policy)
--
-- A F67C faz toda escrita dizer a empresa (a expansão) e só depois tira o default public.empresa_legada() das 20 colunas
-- empresa_id (a contração, 0205–0207, aplicada em produção só depois do deploy e da janela — docs/PLAN-F67C.md §6).
-- Aqui, as que gravam lançamento de item: cada INSERT ganha empresa_id na lista de colunas, com a empresa da FILIAL que a própria linha
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
--   lancar_itens_lote(jsonb, uuid) — vigente em 0126_lancamento_regulariza.sql:
--     @@
--              insert into public.lancamentos_item (
--     -          item_id, filial_id, tipo, quantidade, data,
--     +          empresa_id, item_id, filial_id, tipo, quantidade, data,
--                colaborador, colaborador_id, observacao, chamado, criado_por, regularizacao
--              ) values (
--     +          public.empresa_da_filial(v_filial),
--                v_item_id::smallint, v_filial, 'ajuste'::public.tipo_lancamento, v_reg,
--     @@
--              insert into public.lancamentos_item (
--     -          item_id, filial_id, tipo, quantidade, data,
--     +          empresa_id, item_id, filial_id, tipo, quantidade, data,
--                colaborador, colaborador_id, observacao, chamado, criado_por
--              ) values (
--     +          public.empresa_da_filial(v_filial),
--                v_item_id::smallint, v_filial, v_tipo::public.tipo_lancamento, v_normal,
--
--   reabrir_pendencias_item_com_estornos(uuid[], text, jsonb, uuid) — vigente em 0122_ordem_dos_inversos.sql:
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
--   resolver_pendencias_item_com_lancamentos(uuid[], text, text, jsonb, uuid) — vigente em 0126_lancamento_regulariza.sql:
--     @@
--            insert into public.lancamentos_item (
--     -        item_id, filial_id, tipo, quantidade, data,
--     +        empresa_id, item_id, filial_id, tipo, quantidade, data,
--              colaborador, colaborador_id, observacao, pendencia_item_id, criado_por, regularizacao
--            ) values (
--     +        public.empresa_da_filial((v_elem ->> 'filial_id')::smallint),
--              (v_elem ->> 'item_id')::smallint,
--     @@
--            insert into public.lancamentos_item (
--     -        item_id, filial_id, tipo, quantidade, data,
--     +        empresa_id, item_id, filial_id, tipo, quantidade, data,
--              colaborador, colaborador_id, observacao, pendencia_item_id, criado_por
--            ) values (
--     +        public.empresa_da_filial((v_elem ->> 'filial_id')::smallint),
--              (v_elem ->> 'item_id')::smallint,
--     @@
--            insert into public.lancamentos_item (
--     -        item_id, filial_id, tipo, quantidade, data,
--     +        empresa_id, item_id, filial_id, tipo, quantidade, data,
--              colaborador, colaborador_id, observacao, pendencia_item_id, criado_por
--            ) values (
--     +        public.empresa_da_filial((v_elem ->> 'filial_id')::smallint),
--              (v_elem ->> 'item_id')::smallint,
--
--   transferir_item(smallint, smallint, jsonb, date, text, text, text, uuid) — vigente em 0104_transferir_item.sql:
--     @@
--        v_n        int;
--     +  v_emp_origem  uuid;
--     +  v_emp_destino uuid;
--      begin
--     @@
--      
--     +  v_emp_origem  := public.empresa_da_filial(p_origem);
--     +  v_emp_destino := public.empresa_da_filial(p_destino);
--     +
--        -- 5) Validação por item + travas em ORDEM TOTAL DETERMINÍSTICA -------------
--     @@
--          insert into public.lancamentos_item
--     -      (item_id, filial_id, tipo, quantidade, chamado, colaborador, data, observacao, criado_por)
--     +      (empresa_id, item_id, filial_id, tipo, quantidade, chamado, colaborador, data, observacao, criado_por)
--          values
--     -      (v_item::smallint, p_origem, 'ajuste', -v_qtd, v_chamado, null, v_data, p_obs_origem, v_autor);
--     +      (v_emp_origem, v_item::smallint, p_origem, 'ajuste', -v_qtd, v_chamado, null, v_data, p_obs_origem, v_autor);
--      
--     @@
--          insert into public.lancamentos_item
--     -      (item_id, filial_id, tipo, quantidade, chamado, colaborador, data, observacao, criado_por)
--     +      (empresa_id, item_id, filial_id, tipo, quantidade, chamado, colaborador, data, observacao, criado_por)
--          values
--     -      (v_item::smallint, p_destino, 'ajuste', v_qtd, v_chamado, null, v_data, p_obs_destino, v_autor);
--     +      (v_emp_destino, v_item::smallint, p_destino, 'ajuste', v_qtd, v_chamado, null, v_data, p_obs_destino, v_autor);
--        end loop;
-- =====================================================================================================================

set lock_timeout = '2s';

create or replace function public.lancar_itens_lote(
  p_linhas jsonb,
  p_criado_por uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  k_teto      constant int := 10;   -- espelha MAX_LINHAS_LOTE_ITEM (src/lib/validators/item.ts)
  v_autor     uuid := coalesce(auth.uid(), p_criado_por);
  v_n         int;
  v_i         int;
  v_elem      jsonb;
  v_par       record;
  v_item_id   int;
  v_filial    smallint;
  v_tipo      text;
  v_qtd       int;
  v_aberto    int;
  v_estoque   int;
  v_reg       int;
  v_normal    int;
  v_obs_reg   text;
  v_n_reg     int := 0;
  v_qtd_reg   int := 0;
begin
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'O lançamento precisa ser uma lista de linhas.'
      using errcode = 'invalid_parameter_value';
  end if;
  v_n := jsonb_array_length(p_linhas);
  if v_n = 0 then
    raise exception 'Adicione ao menos um item ao lançamento.'
      using errcode = 'invalid_parameter_value';
  end if;
  if v_n > k_teto then
    raise exception 'O lançamento aceita no máximo % itens.', k_teto
      using errcode = 'invalid_parameter_value';
  end if;

  -- Cinto-e-suspensórios PELA MENSAGEM, por filial distinta (a policy
  -- "operador lanca" já barraria com 42501 cru).
  for v_par in
    select distinct (e.value ->> 'filial_id')::smallint as filial
      from jsonb_array_elements(p_linhas) e
     order by 1
  loop
    if not public.pode_escrever_filial(v_par.filial) then
      raise exception 'Você não tem permissão de escrita nesta filial.'
        using errcode = 'insufficient_privilege';
    end if;
  end loop;

  -- Travas advisory em ordem total crescente (item_id, filial_id), ANTES do
  -- primeiro INSERT — a classe 1 do cabeçalho da 0117.
  for v_par in
    select distinct (e.value ->> 'item_id')::int   as item_id,
                    (e.value ->> 'filial_id')::int as filial
      from jsonb_array_elements(p_linhas) e
     order by 1, 2
  loop
    perform pg_advisory_xact_lock(v_par.item_id, v_par.filial);
  end loop;

  -- EM ORDEM TOTAL PELO EFEITO — a mesma da 0123, pela mesma razão: quem repõe o
  -- disponível entra antes de quem consome, desempatando pela ordinalidade.
  for v_par in
    select (e.ordinality - 1)::int as idx
      from jsonb_array_elements(p_linhas) with ordinality e(value, ordinality)
     order by case
                when (e.value ->> 'tipo') in ('entrada', 'retorno', 'liberacao') then 0
                when (e.value ->> 'tipo') = 'ajuste'
                 and jsonb_typeof(e.value -> 'quantidade') = 'number'
                 and (e.value ->> 'quantidade')::numeric > 0 then 0
                else 1
              end,
              e.ordinality
  loop
    v_i     := v_par.idx;
    v_elem  := p_linhas -> v_i;
    v_item_id := (v_elem ->> 'item_id')::int;
    v_filial  := (v_elem ->> 'filial_id')::smallint;
    v_tipo    := v_elem ->> 'tipo';
    v_qtd     := (v_elem ->> 'quantidade')::int;

    if v_item_id is null or v_item_id <= 0 then
      raise exception 'Item inválido na linha % do lançamento.', v_i + 1
        using errcode = 'invalid_parameter_value', detail = 'f41_linha=' || v_i;
    end if;
    if v_qtd is null or (v_tipo <> 'ajuste' and v_qtd <= 0) or (v_tipo = 'ajuste' and v_qtd = 0) then
      raise exception 'Quantidade inválida na linha % do lançamento.', v_i + 1
        using errcode = 'invalid_parameter_value', detail = 'f41_linha=' || v_i;
    end if;

    -- ===== A PARTIÇÃO — idêntica à de criar_movimentacao_com_itens ===========
    v_reg    := 0;
    v_normal := v_qtd;

    if v_tipo = 'retorno' then
      select greatest(0, coalesce(sum(case l.tipo::text when 'saida'   then l.quantidade
                                                        when 'retorno' then -l.quantidade
                                                        else 0 end), 0))
        into v_aberto
        from public.lancamentos_item l
       where l.item_id = v_item_id::smallint and l.filial_id = v_filial;
      v_normal := least(v_qtd, v_aberto);
      v_reg    := v_qtd - v_normal;

    elsif v_tipo = 'saida' then
      with agg as (
        select coalesce(sum(case l.tipo::text when 'entrada' then l.quantidade
                                              when 'ajuste'  then l.quantidade
                                              else 0 end), 0) as total_raw,
               coalesce(sum(case l.tipo::text when 'saida'   then l.quantidade
                                              when 'retorno' then -l.quantidade
                                              else 0 end), 0) as lib_raw
          from public.lancamentos_item l
         where l.item_id = v_item_id::smallint and l.filial_id = v_filial
      ),
      atrel as (
        select coalesce(sum(greatest(0, net)), 0) as atrelados from (
          select coalesce(sum(case l.tipo::text when 'reserva'   then l.quantidade
                                                when 'liberacao' then -l.quantidade
                                                else 0 end), 0) as net
            from public.lancamentos_item l
           where l.item_id = v_item_id::smallint and l.filial_id = v_filial
             and l.chamado is not null
           group by l.chamado
        ) b
      )
      select agg.total_raw - atrel.atrelados - greatest(0, agg.lib_raw)
        into v_estoque
        from agg, atrel;
      v_reg    := greatest(0, v_qtd - v_estoque);
      v_normal := v_qtd;
    end if;

    if v_reg > 0 then
      v_obs_reg := nullif(btrim(coalesce(v_elem ->> 'observacao_regularizacao', '')), '');
      if v_obs_reg is null then
        raise exception 'O acerto automático deste item precisa de uma justificativa.'
          using errcode = 'invalid_parameter_value', detail = 'f41_linha=' || v_i;
      end if;
      begin
        insert into public.lancamentos_item (
          empresa_id, item_id, filial_id, tipo, quantidade, data,
          colaborador, colaborador_id, observacao, chamado, criado_por, regularizacao
        ) values (
          public.empresa_da_filial(v_filial),
          v_item_id::smallint, v_filial, 'ajuste'::public.tipo_lancamento, v_reg,
          coalesce(nullif(v_elem ->> 'data', '')::date, current_date),
          nullif(v_elem ->> 'colaborador', ''),
          null,
          v_obs_reg,
          nullif(v_elem ->> 'chamado', ''),
          v_autor, true
        );
      exception when others then
        raise exception '%', sqlerrm using errcode = sqlstate, detail = 'f41_linha=' || v_i;
      end;
      v_n_reg   := v_n_reg + 1;
      v_qtd_reg := v_qtd_reg + v_reg;
    end if;

    if v_normal <> 0 then
      begin
        insert into public.lancamentos_item (
          empresa_id, item_id, filial_id, tipo, quantidade, data,
          colaborador, colaborador_id, observacao, chamado, criado_por
        ) values (
          public.empresa_da_filial(v_filial),
          v_item_id::smallint, v_filial, v_tipo::public.tipo_lancamento, v_normal,
          coalesce(nullif(v_elem ->> 'data', '')::date, current_date),
          nullif(v_elem ->> 'colaborador', ''),
          nullif(v_elem ->> 'colaborador_id', '')::uuid,
          nullif(v_elem ->> 'observacao', ''),
          nullif(v_elem ->> 'chamado', ''),
          v_autor
        );
      exception when others then
        raise exception '%', sqlerrm using errcode = sqlstate, detail = 'f41_linha=' || v_i;
      end;
    end if;
  end loop;

  return jsonb_build_object('linhas', v_n,
                            'regularizacoes', v_n_reg, 'unidades_regularizadas', v_qtd_reg);
end $$;

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
      empresa_id, item_id, filial_id, tipo, quantidade, data,
      colaborador, colaborador_id, chamado, observacao,
      estorna_id, pendencia_item_id, criado_por
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

create or replace function public.resolver_pendencias_item_com_lancamentos(
  p_ids uuid[],
  p_desfecho text,
  p_observacao text,
  p_lancamentos jsonb,
  p_criado_por uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_autor      uuid := coalesce(auth.uid(), p_criado_por);
  v_resolvidas uuid[] := '{}';
  v_par        record;
  v_elem       jsonb;
  v_n_lanc     int := 0;
  -- F41 (0126) — a partição da quantidade:
  v_qtd        int;
  v_aberto     int;
  v_reg        int;
  v_normal     int;
  v_obs_reg    text;
  v_n_reg      int := 0;
  v_qtd_reg    int := 0;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Selecione ao menos uma pendência.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_desfecho is null or p_desfecho not in ('recuperado', 'baixa') then
    raise exception 'Desfecho inválido para a pendência de item.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_lancamentos is null or jsonb_typeof(p_lancamentos) <> 'array' then
    raise exception 'A lista de lançamentos precisa ser uma lista (vazia, se nenhum tipo resolveu item).'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Travas advisory em ordem total crescente (item_id, filial_id), ANTES do
  -- primeiro INSERT — mesma razão da 0104 passo 5 e da 0117.
  for v_par in
    select distinct (e.value ->> 'item_id')::int   as item_id,
                    (e.value ->> 'filial_id')::int as filial
      from jsonb_array_elements(p_lancamentos) e
     order by 1, 2
  loop
    perform pg_advisory_xact_lock(v_par.item_id, v_par.filial);
  end loop;

  -- Só as ABERTAS mudam, e só delas nascem lançamentos (idempotência: reenviar
  -- não re-resolve nem duplica lançamento).
  with mudadas as (
    update public.pendencias_item p
       set status       = 'resolvida',
           desfecho     = p_desfecho,
           observacao   = nullif(btrim(coalesce(p_observacao, '')), ''),
           resolvida_em = now(),
           resolvida_por = v_autor
     where p.id = any(p_ids) and p.status = 'aberta'
    returning p.id
  )
  select coalesce(array_agg(id), '{}') into v_resolvidas from mudadas;

  if cardinality(v_resolvidas) = 0 then
    return jsonb_build_object('resolvidas', 0, 'lancamentos', 0);
  end if;

  for v_elem in
    select e.value
      from jsonb_array_elements(p_lancamentos) e
     where (e.value ->> 'pendencia_id')::uuid = any(v_resolvidas)
  loop
    v_qtd := (v_elem ->> 'quantidade')::int;

    -- ===== F41 (0126) — A PARTIÇÃO, lida sob a trava e relida a cada elemento ==
    -- A = em uso em aberto do par (Σsaida − Σretorno, com piso em zero). Sem
    -- isto, "Item recuperado" numa das 14 pendências abertas em produção era
    -- recusado pelo trigger, porque nenhuma delas tem saída registrada.
    select greatest(0, coalesce(sum(case l.tipo::text when 'saida'   then l.quantidade
                                                      when 'retorno' then -l.quantidade
                                                      else 0 end), 0))
      into v_aberto
      from public.lancamentos_item l
     where l.item_id = (v_elem ->> 'item_id')::smallint
       and l.filial_id = (v_elem ->> 'filial_id')::smallint;
    v_normal := least(v_qtd, v_aberto);
    v_reg    := v_qtd - v_normal;

    -- (a0) O ACERTO AUTOMÁTICO primeiro (ordem total da 0122).
    if v_reg > 0 then
      v_obs_reg := nullif(btrim(coalesce(v_elem ->> 'observacao_regularizacao', '')), '');
      if v_obs_reg is null then
        raise exception 'O acerto automático deste item precisa de uma justificativa.'
          using errcode = 'invalid_parameter_value';
      end if;
      insert into public.lancamentos_item (
        empresa_id, item_id, filial_id, tipo, quantidade, data,
        colaborador, colaborador_id, observacao, pendencia_item_id, criado_por, regularizacao
      ) values (
        public.empresa_da_filial((v_elem ->> 'filial_id')::smallint),
        (v_elem ->> 'item_id')::smallint,
        (v_elem ->> 'filial_id')::smallint,
        'ajuste'::public.tipo_lancamento,
        v_reg,
        coalesce(nullif(v_elem ->> 'data', '')::date, current_date),
        nullif(v_elem ->> 'colaborador', ''),
        null,   -- ver a nota de colaborador_id na função acima
        v_obs_reg,
        (v_elem ->> 'pendencia_id')::uuid,
        v_autor,
        true
      );
      v_n_lanc  := v_n_lanc + 1;
      v_n_reg   := v_n_reg + 1;
      v_qtd_reg := v_qtd_reg + v_reg;
    end if;

    -- (a) O RETORNO, com a parte que o diário conhecia: repõe a prateleira e baixa
    --     a conta da pessoa. Invertido com o ajuste NEGATIVO da baixa, o trigger
    --     recusaria por estoque negativo. Quando A = 0 não há retorno a gravar.
    if v_normal > 0 then
      insert into public.lancamentos_item (
        empresa_id, item_id, filial_id, tipo, quantidade, data,
        colaborador, colaborador_id, observacao, pendencia_item_id, criado_por
      ) values (
        public.empresa_da_filial((v_elem ->> 'filial_id')::smallint),
        (v_elem ->> 'item_id')::smallint,
        (v_elem ->> 'filial_id')::smallint,
        'retorno'::public.tipo_lancamento,
        v_normal,
        coalesce(nullif(v_elem ->> 'data', '')::date, current_date),
        nullif(v_elem ->> 'colaborador', ''),
        nullif(v_elem ->> 'colaborador_id', '')::uuid,
        nullif(v_elem ->> 'observacao_retorno', ''),
        (v_elem ->> 'pendencia_id')::uuid,
        v_autor
      );
      v_n_lanc := v_n_lanc + 1;
    end if;

    -- (b) A BAIXA acrescenta o ajuste negativo: o item saiu do mundo, o Total cai.
    --     Com o acerto de (a0) na frente, o par soma zero — que é a verdade quando
    --     o diário nunca conheceu a peça que agora se dá por perdida.
    if p_desfecho = 'baixa' then
      if nullif(btrim(coalesce(v_elem ->> 'observacao_ajuste', '')), '') is null then
        -- O CHECK lanc_item_ajuste_obs exigiria isso de qualquer jeito; aqui a
        -- mensagem diz o que falta, em vez de estourar como violação genérica.
        raise exception 'A baixa precisa de uma justificativa para o acerto de contagem.'
          using errcode = 'invalid_parameter_value';
      end if;
      insert into public.lancamentos_item (
        empresa_id, item_id, filial_id, tipo, quantidade, data,
        colaborador, colaborador_id, observacao, pendencia_item_id, criado_por
      ) values (
        public.empresa_da_filial((v_elem ->> 'filial_id')::smallint),
        (v_elem ->> 'item_id')::smallint,
        (v_elem ->> 'filial_id')::smallint,
        'ajuste'::public.tipo_lancamento,
        -((v_elem ->> 'quantidade')::int),
        coalesce(nullif(v_elem ->> 'data', '')::date, current_date),
        nullif(v_elem ->> 'colaborador', ''),
        nullif(v_elem ->> 'colaborador_id', '')::uuid,
        btrim(v_elem ->> 'observacao_ajuste'),
        (v_elem ->> 'pendencia_id')::uuid,
        v_autor
      );
      v_n_lanc := v_n_lanc + 1;
    end if;
  end loop;

  return jsonb_build_object('resolvidas', cardinality(v_resolvidas), 'lancamentos', v_n_lanc,
                            'regularizacoes', v_n_reg, 'unidades_regularizadas', v_qtd_reg);
end $$;

create or replace function public.transferir_item(
  p_origem      smallint,
  p_destino     smallint,
  p_itens       jsonb,   -- [{"item_id": 3, "quantidade": 10}, …] quantidade > 0
  p_data        date,
  p_chamado     text,
  p_obs_origem  text,    -- composta pela action; nunca vazia (CHECK lanc_item_ajuste_obs)
  p_obs_destino text,
  p_criado_por  uuid
)
returns integer
language plpgsql
set search_path to 'public'
as $$
declare
  v_elem     jsonb;
  v_item     int;
  v_qtd      int;
  v_par      record;
  v_vistos   int[] := '{}';
  v_chamado  text  := nullif(btrim(coalesce(p_chamado, '')), '');
  v_data     date  := coalesce(p_data, current_date);
  v_autor    uuid  := coalesce(auth.uid(), p_criado_por);
  v_n        int;
  v_emp_origem  uuid;
  v_emp_destino uuid;
begin
  -- 1) Origem ≠ destino ------------------------------------------------------
  if p_origem is null or p_destino is null then
    raise exception 'Transferencia sem filial de origem ou de destino.'
      using errcode = '22023';
  end if;
  if p_origem = p_destino then
    raise exception 'A filial de destino nao pode ser a mesma da origem.'
      using errcode = '22023';
  end if;

  -- 2) Carrinho não-vazio ----------------------------------------------------
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Transferencia sem item.'
      using errcode = '22023';
  end if;

  -- 3) As duas observações são obrigatórias ---------------------------------
  -- O CHECK `lanc_item_ajuste_obs` pegaria depois, mas com mensagem de banco em
  -- vez de mensagem nossa — e a action não teria como distinguir de qual perna.
  if coalesce(btrim(p_obs_origem), '') = '' or coalesce(btrim(p_obs_destino), '') = '' then
    raise exception 'Transferencia sem observacao nas duas pernas.'
      using errcode = '22023';
  end if;

  -- 4) Vínculo nos DOIS lados (mensagem; a trava é a policy — ver cabeçalho) --
  if not public.pode_escrever_filial(p_origem) then
    raise exception 'Sem permissao de escrita na filial % (origem da transferencia).', p_origem
      using errcode = '42501';
  end if;
  if not public.pode_escrever_filial(p_destino) then
    raise exception 'Sem permissao de escrita na filial % (destino da transferencia).', p_destino
      using errcode = '42501';
  end if;

  v_emp_origem  := public.empresa_da_filial(p_origem);
  v_emp_destino := public.empresa_da_filial(p_destino);

  -- 5) Validação por item + travas em ORDEM TOTAL DETERMINÍSTICA -------------
  -- (o anti-deadlock do cabeçalho: TODAS as travas antes do primeiro INSERT)
  for v_elem in select * from jsonb_array_elements(p_itens)
  loop
    v_item := (v_elem->>'item_id')::int;
    v_qtd  := (v_elem->>'quantidade')::int;
    if v_item is null or v_item <= 0 then
      raise exception 'Item invalido na transferencia.' using errcode = '22023';
    end if;
    if v_qtd is null or v_qtd <= 0 then
      raise exception 'Quantidade invalida na transferencia do item % (deve ser maior que zero).', v_item
        using errcode = '22023';
    end if;
    if v_item = any (v_vistos) then
      raise exception 'O item % aparece duas vezes na transferencia — some as quantidades.', v_item
        using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_item;
  end loop;

  for v_par in
    select x.item_id, x.filial
      from (
        select (e->>'item_id')::int as item_id, p_origem::int  as filial
          from jsonb_array_elements(p_itens) e
        union all
        select (e->>'item_id')::int,            p_destino::int
          from jsonb_array_elements(p_itens) e
      ) x
     order by x.item_id, x.filial
  loop
    perform pg_advisory_xact_lock(v_par.item_id, v_par.filial);
  end loop;

  -- 6) O par de ajustes, item a item ----------------------------------------
  for v_elem in select * from jsonb_array_elements(p_itens)
  loop
    v_item := (v_elem->>'item_id')::int;
    v_qtd  := (v_elem->>'quantidade')::int;

    -- Perna que SAI: ajuste NEGATIVO na origem. O trigger recusa aqui se o
    -- estoque não comporta — e, como é a mesma transação, a perna de destino
    -- nem chega a existir.
    insert into public.lancamentos_item
      (empresa_id, item_id, filial_id, tipo, quantidade, chamado, colaborador, data, observacao, criado_por)
    values
      (v_emp_origem, v_item::smallint, p_origem, 'ajuste', -v_qtd, v_chamado, null, v_data, p_obs_origem, v_autor);

    -- Perna que ENTRA: ajuste POSITIVO no destino.
    insert into public.lancamentos_item
      (empresa_id, item_id, filial_id, tipo, quantidade, chamado, colaborador, data, observacao, criado_por)
    values
      (v_emp_destino, v_item::smallint, p_destino, 'ajuste', v_qtd, v_chamado, null, v_data, p_obs_destino, v_autor);
  end loop;

  v_n := jsonb_array_length(p_itens);
  return v_n;
end $$;

notify pgrst, 'reload schema';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   o md5 do prosrc de cada função tocada = o do CI; as outras funções e todas as policies byte a byte (o "antes");
--   15m de catalogo_policies.sql sem estas funções na lista; 0 linhas fora da legada nas 20.
--
-- ROLLBACK (supabase/rollback/F67C-desfaz.sql, na ordem inversa 0207 → 0200): reemitir cada função com o corpo vigente
-- antes desta migration (o arquivo indicado no diff acima).
