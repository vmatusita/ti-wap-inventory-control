-- Migration 0126 — a partição da quantidade: o item deixa de derrubar o lote
-- (F41, frente A · decisão J2 de docs/PLANO-ITENS.md §4.2).
--
-- RECRIA duas funções e CRIA uma terceira. NÃO toca no trigger
-- `valida_lancamento_item` — as quatro guardas dele continuam de pé, INCLUSIVE a
-- que gerou o print. NÃO grava lançamento nenhum (a conversão é a 0127).
--
-- ---------------------------------------------------------------------------
-- OS CORPOS DE PARTIDA, LIDOS DO BANCO (não de migration antiga)
-- ---------------------------------------------------------------------------
-- Lição escrita na 0047, repetida na 0109 e na 0118: o corpo de partida de toda
-- função recriada sai de `pg_get_functiondef`, nunca de um arquivo .sql antigo —
-- montar a recriação de outra fonte perde pedaço em silêncio.
--
-- Lidos em produção (pbtjcalbmepmrqzprusb) em 31/08/2026:
--
--   criar_movimentacao_com_itens(jsonb, jsonb, uuid)
--     md5 = 2d9bf5f23860635be0fbdd43a034dfeb   (8338 bytes)
--     linhagem real: 0117 → 0123  (o docs/PLANO-ITENS.md diz "0117 → 0121" e ERRA)
--
--   resolver_pendencias_item_com_lancamentos(uuid[], text, text, jsonb, uuid)
--     md5 = e5c0240a349a5380f224129e30a14481   (4422 bytes, produção)
--     md5 = 8f8fc10188d5b85fb6a03793e062cfd1   (4375 bytes, ENSAIO)
--     linhagem real: só a 0119  (o docs/PLANO-ITENS.md diz "0119/0122" e ERRA)
--
-- ⚠ ACHADO: os dois ambientes DIVERGIAM nessa segunda função — 47 bytes, e a
-- diferença é UM COMENTÁRIO ("(idempotência: reenviar não re-resolve nem duplica
-- lançamento)" em produção contra "(ver \"IDEMPOTÊNCIA\")" em ensaio). A lógica
-- era byte a byte idêntica. Esta recriação CONVERGE os dois. Ata em DECISOES.md.
--
-- ---------------------------------------------------------------------------
-- O PROBLEMA — a guarda certa no lugar errado
-- ---------------------------------------------------------------------------
-- O trigger recusa `retorno` que exceda `Σsaida − Σretorno` do par (item, filial).
-- A guarda ESTÁ CERTA — devolver mais do que saiu é erro de digitação em 99% dos
-- casos. A PREMISSA é que está errada: ela supõe um diário completo desde sempre.
-- O diário nasceu em 17/08/2026; o acervo físico é de anos. Medido em produção:
-- dos 132 pares item×filial, só 4 têm saída em aberto e só 22 têm estoque —
-- nos outros, marcar "Voltou" (ou entregar) DERRUBA O LOTE INTEIRO, e com ele a
-- devolução do notebook que o operador queria registrar.
--
-- ---------------------------------------------------------------------------
-- A REGRA, UMA SÓ (§4.2 do plano de área)
-- ---------------------------------------------------------------------------
-- O sistema nunca recusa um lançamento de item por falta de saldo dentro de uma
-- movimentação de ativo. Ele PARTE A QUANTIDADE em duas: a parte que o diário já
-- conhecia vira o lançamento normal; a parte que ele não conhecia vira um acerto
-- de contagem com justificativa automática, marcado `regularizacao` (0125).
--
--   Devolução de q → A := em uso em aberto
--                    ajuste +(q − mín(q,A))  [se > 0], depois  retorno mín(q,A)  [se > 0]
--   Entrega   de q → E := em estoque
--                    ajuste +máx(0, q − E)   [se > 0], depois  saida q
--
-- A conta fecha sozinha, e é essa a beleza do desenho — em nenhum passo o estoque
-- fica negativo, o total fica negativo ou o "em uso" passa do que saiu:
--
--   Devolveu 1 carregador que o sistema nunca viu sair (A = 0):
--     ajuste +1 → total 6 · estoque 6 · uso 0   (uma linha só; não há retorno a gravar)
--   Devolveu 2 cabos e o sistema conhecia 1 saída (A = 1):
--     ajuste +1 → total 5 · estoque 4;  retorno 1 → uso 0 · estoque 5
--   Entregou 1 mouse numa filial sem saldo (E = 0):
--     ajuste +1 → total 1 · estoque 1;  saida 1 → estoque 0 · uso 1
--
-- A aplicação passa a ESCOLHER ENTRE GRAVAÇÕES QUE O BANCO JÁ ACEITA — exatamente
-- o que `vinculo-retorno.ts` já faz com o vínculo da pessoa, e pelo mesmo motivo
-- escrito lá: "a guarda continua sendo a linha que vale; se a aplicação errar, o
-- banco recusa, e está certo".
--
-- ---------------------------------------------------------------------------
-- AS QUATRO DECISÕES DE IMPLEMENTAÇÃO, e por que cada uma é como é
-- ---------------------------------------------------------------------------
-- 1. A CONTA É FEITA AQUI, no Postgres, DEPOIS DAS TRAVAS — nunca na action.
--    Entre ler o saldo no servidor e gravar, outra sessão pode mexer no mesmo par:
--    a partição sairia errada, o trigger recusaria e o lote morreria de novo, pelo
--    mesmo motivo que estamos consertando. As travas (row lock dos ativos por id,
--    advisory lock por (item, filial)) já são adquiridas em ordem total ANTES do
--    primeiro INSERT; a leitura entra DEPOIS delas.
--
-- 2. A LEITURA É INCREMENTAL — relida FRESCA a cada linha, dentro do laço. Os
--    INSERTs já feitos na mesma transação são visíveis, e é isso que faz duas
--    linhas do mesmo par se comportarem: contra A = 1, a primeira grava `retorno 1`
--    e a segunda enxerga A = 0 e regulariza. Uma leitura única no começo planejaria
--    `retorno 1` duas vezes e o trigger recusaria a segunda.
--
-- 3. A RPC NÃO REDIGE TEXTO (regra do cabeçalho da 0117). A observação da
--    regularização chega PRONTA da aplicação, na chave `observacao_regularizacao`
--    de cada linha do payload, produzida pela função pura
--    `src/lib/itens/regularizacao.ts`. O CHECK `lanc_item_ajuste_obs` exige
--    justificativa em todo ajuste; se ela faltar, a RPC recusa com uma frase que
--    diz o que falta, em vez de estourar como violação genérica.
--
-- 4. A ASSINATURA NÃO MUDA. Em Postgres, `create or replace` com lista de
--    argumentos diferente NÃO substitui — cria uma SOBRECARGA, exatamente o que o
--    RUNBOOK-BANCO.md proíbe e o que a verificação pós-apply ("EXATAMENTE 1 linha")
--    reprova. O payload de itens já é `jsonb` e comporta a chave nova sem parâmetro
--    novo. Isso também encurta a janela entre o SQL e o deploy: entre aplicar esta
--    migration e subir o código novo, a aplicação NO AR continua chamando a mesma
--    assinatura, e uma linha sem `observacao_regularizacao` só regulariza se
--    precisar — e aí recusa com mensagem clara em vez de gravar sem justificativa.
--
-- ---------------------------------------------------------------------------
-- O QUE **NÃO** SAIU DA RECRIAÇÃO (conferido por diff contra o corpo de partida)
-- ---------------------------------------------------------------------------
--   · as duas classes de trava e a ORDEM entre elas (ativos primeiro, advisory depois)
--   · a filial derivada do ativo LIDO SOB A TRAVA (v_ativo.filial_id), nunca do payload
--   · o bloco `exception when others` que etiqueta a linha culpada e RE-LANÇA o erro
--     original (detail = 'f38_linha=' / 'f38_item=')
--   · o `security invoker` DECLARADO e o search_path. Ele é o default do Postgres,
--     e por isso `pg_get_functiondef` não o imprime — mas a 0117, a 0119 e a 0123 o
--     escrevem com todas as letras no arquivo, e recriar sem ele trocaria uma
--     garantia explícita por uma implícita. Aqui está escrito, nas três.
--   · a ORDEM TOTAL de inserção por efeito do passo 5 e o guard
--     `jsonb_typeof(e.value -> 'quantidade') = 'number'` que a 0123 introduziu
--   · o teto do lote (30), a validação de `indice_movimentacao` e a guarda
--     `pode_escrever_filial` pela mensagem
-- A ÚNICA diferença é a partição. Diferença a mais é bug.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK LÓGICO:
--   drop function public.lancar_itens_lote(jsonb, uuid);
--   -- e reaplicar o corpo da 0123 (criar_movimentacao_com_itens) e o da 0119
--   -- (resolver_pendencias_item_com_lancamentos), que estão nos arquivos daquelas
--   -- migrations. Depois: notify pgrst, 'reload schema';
--   -- ⚠ As linhas já gravadas com regularizacao = true PERMANECEM: o guarda_acervo
--   --   (0081) recusa DELETE em lancamentos_item. O rollback desfaz o COMPORTAMENTO,
--   --   nunca o acervo — que é como esta casa trata acervo.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1) criar_movimentacao_com_itens — o checklist e a entrega
-- ===========================================================================
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
          item_id, filial_id, tipo, quantidade, data,
          colaborador, colaborador_id, observacao, chamado,
          movimentacao_id, criado_por, regularizacao
        ) values (
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
          item_id, filial_id, tipo, quantidade, data,
          colaborador, colaborador_id, observacao, chamado,
          movimentacao_id, criado_por
        ) values (
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

comment on function public.criar_movimentacao_com_itens(jsonb, jsonb, uuid) is
  'F38 (0117, ordem dos itens corrigida na 0123, PARTIÇÃO DA QUANTIDADE na 0126): grava o lote de movimentações E os lançamentos de item que vão junto numa transação só, TUDO OU NADA. F41: nenhum item derruba mais o lote por falta de saldo — a RPC lê, sob a trava e RELENDO a cada linha, o em-uso-em-aberto (retorno) ou o em-estoque (saída) do par e parte a quantidade: a parte conhecida vira o lançamento normal, a desconhecida vira um `ajuste` positivo marcado `regularizacao`, inserido ANTES, com a justificativa que a aplicação manda pronta em `observacao_regularizacao` (a RPC não redige texto). O trigger valida_lancamento_item NÃO mudou: a RPC apenas escolhe entre gravações que o banco já aceita. Os itens entram em ordem TOTAL pelo efeito — entrada/retorno/liberacao/ajuste positivo antes de saida/reserva/ajuste negativo, desempatando pela ordinalidade do payload. SECURITY INVOKER: a permissão por filial é imposta pelas policies "operador insere" e "operador lanca", linha a linha. Adquire as travas das DUAS classes em ordem total — row lock dos ativos por id, advisory lock por (item_id, filial_id) — ANTES do primeiro INSERT. A filial é derivada do ativo lido sob a trava, nunca do payload. Não recalcula saldo, não decide status, não redige texto.';

-- Grants: inalterados (o `create or replace` os preserva); repetidos aqui pelo
-- mesmo motivo da 0117/0123 — a assinatura é a mesma, e a explicitação é barata.
revoke all on function public.criar_movimentacao_com_itens(jsonb, jsonb, uuid)
  from public, anon, service_role;
grant execute on function public.criar_movimentacao_com_itens(jsonb, jsonb, uuid)
  to authenticated;

-- ===========================================================================
-- 2) resolver_pendencias_item_com_lancamentos — o "Item recuperado"
-- ===========================================================================
-- Mesma partição, no mesmo lugar da ordem: o acerto ANTES do retorno. A baixa
-- (ajuste negativo) continua por último, onde sempre esteve.
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
        item_id, filial_id, tipo, quantidade, data,
        colaborador, colaborador_id, observacao, pendencia_item_id, criado_por, regularizacao
      ) values (
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
        item_id, filial_id, tipo, quantidade, data,
        colaborador, colaborador_id, observacao, pendencia_item_id, criado_por
      ) values (
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
        item_id, filial_id, tipo, quantidade, data,
        colaborador, colaborador_id, observacao, pendencia_item_id, criado_por
      ) values (
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

comment on function public.resolver_pendencias_item_com_lancamentos(uuid[], text, text, jsonb, uuid) is
  'F38 (0119, PARTIÇÃO DA QUANTIDADE na 0126): resolve as pendências de item ABERTAS e grava os lançamentos correspondentes na MESMA transação. F41: "Item recuperado" deixa de ser recusado quando o diário não conhecia a saída — a RPC lê o em-uso-em-aberto do par sob a trava e parte a quantidade, gravando o `ajuste` de regularização ANTES do `retorno` (e a baixa, quando for o caso, DEPOIS). Idempotente: reenviar não re-resolve nem duplica lançamento. SECURITY INVOKER. Adquire as travas advisory por (item_id, filial_id) em ordem total ANTES do primeiro INSERT. Não redige texto: as observações chegam prontas da aplicação.';

revoke all on function public.resolver_pendencias_item_com_lancamentos(uuid[], text, text, jsonb, uuid)
  from public, anon, service_role;
grant execute on function public.resolver_pendencias_item_com_lancamentos(uuid[], text, text, jsonb, uuid)
  to authenticated;

-- ===========================================================================
-- 3) lancar_itens_lote — o avulso, agora transacional (e com a MESMA regra)
-- ===========================================================================
-- Hoje `lancarItens` grava num `for` de INSERTs sequenciais, um por linha, sem
-- transação — item registrado na DIVIDA-TECNICA.md ("carrinho sem transação").
-- Efeito: metade do carrinho grava e a outra metade não, e o operador fica sem
-- saber o que ficou de pé. A F38 já decidiu o contrário para movimentações
-- ("meio lote é pior que lote nenhum", 28/08/2026); esta RPC leva a mesma
-- doutrina ao carrinho de itens.
--
-- E ela nasce COM A PARTIÇÃO, porque a §4.2 é explícita: "a regra é a mesma nos
-- dois caminhos, senão nascem dois comportamentos". Um operador que lance a
-- devolução pela tela de itens tem de ver o mesmo par de linhas que o checklist
-- grava — senão o sistema teria duas verdades sobre o mesmo fato.
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
          item_id, filial_id, tipo, quantidade, data,
          colaborador, colaborador_id, observacao, chamado, criado_por, regularizacao
        ) values (
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
          item_id, filial_id, tipo, quantidade, data,
          colaborador, colaborador_id, observacao, chamado, criado_por
        ) values (
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

comment on function public.lancar_itens_lote(jsonb, uuid) is
  'F41 (0126): grava o CARRINHO de lançamentos avulsos de item numa transação só, TUDO OU NADA — o que antes era um `for` de INSERTs sequenciais na action (item da DIVIDA-TECNICA.md), que deixava meio carrinho de pé quando uma linha era recusada. Nasce com a MESMA partição da quantidade de criar_movimentacao_com_itens, porque a §4.2 do PLANO-ITENS exige que a regra seja a mesma nos dois caminhos: lançar a devolução pela tela de itens grava o mesmo par (ajuste de regularização + retorno) que o checklist grava. SECURITY INVOKER: a permissão por filial é da policy "operador lanca"; a checagem por dentro existe só pela MENSAGEM. Travas advisory por (item_id, filial_id) em ordem total antes do primeiro INSERT; inserção em ordem total pelo efeito (0123). Etiqueta a linha culpada em `detail` (f41_linha=N) e re-lança o erro original. Não redige texto.';

revoke all on function public.lancar_itens_lote(jsonb, uuid)
  from public, anon, service_role;
grant execute on function public.lancar_itens_lote(jsonb, uuid) to authenticated;

-- A assinatura de uma RPC NOVA precisa chegar ao PostgREST antes do deploy.
notify pgrst, 'reload schema';

-- ===== SMOKE (rodar depois de aplicar — só leitura) =====
--   select p.oid::regprocedure::text, p.prosecdef,
--          pg_get_functiondef(p.oid) ilike '%regularizacao%' as tem_particao
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('criar_movimentacao_com_itens',
--                        'resolver_pendencias_item_com_lancamentos',
--                        'lancar_itens_lote')
--    order by 1;
--   -- esperado: EXATAMENTE 3 linhas (uma por função, sem sobrecarga),
--   --           prosecdef = false nas três, tem_particao = true nas três
--
--   select r.routine_name, g.grantee, g.privilege_type
--     from information_schema.routines r
--     join information_schema.role_routine_grants g on g.specific_name = r.specific_name
--    where r.specific_schema = 'public'
--      and r.routine_name in ('criar_movimentacao_com_itens',
--                             'resolver_pendencias_item_com_lancamentos',
--                             'lancar_itens_lote')
--    order by 1, 2;
--   -- esperado: authenticated (+ o dono), NUNCA anon nem service_role
