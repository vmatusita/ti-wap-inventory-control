-- Migration 0121 — o estorno passa a desfazer O CONJUNTO (F38 · §B.5).
--
-- Uma RPC nova. Nenhuma função existente é recriada — `aplicar_movimentacao`, que
-- é quem restaura o `snapshot_anterior`, sai byte a byte e continua sendo a única
-- a decidir o estado do ativo.
--
-- ---------------------------------------------------------------------------
-- O "DESFAZER" QUE NÃO DESFAZIA
-- ---------------------------------------------------------------------------
-- Desde a 0116 uma movimentação pode ter carregado periféricos: o notebook saiu
-- e, junto com ele, dois lançamentos de `saida` de item. Estornar essa movimentação
-- pelo caminho antigo devolveria o notebook ao estado anterior e deixaria os dois
-- lançamentos DE PÉ — o acessório continuaria fora da prateleira e na conta da
-- pessoa, para um evento que o sistema passou a dizer que nunca aconteceu.
--
-- Portanto: o estorno grava, NA MESMA TRANSAÇÃO, os lançamentos inversos dos itens
-- vinculados àquela movimentação. Se algum inverso não puder ser gravado, **o
-- estorno inteiro recusa** — nunca meio estorno.
--
-- ---------------------------------------------------------------------------
-- OS INVERSOS CHEGAM PRONTOS — esta função não decide o que é o inverso
-- ---------------------------------------------------------------------------
-- Quem calcula é `planejarEstorno` (src/lib/itens/estorno.ts), que já existe desde
-- a F3B, já é puro e já é testado, e que sabe as regras não triviais: `saida` NÃO
-- inverte para `entrada` (inflaria o Total) — vira `retorno`; `entrada` estornada
-- vira `ajuste` negativo; `reserva`↔`liberacao` são inversos entre si; `ajuste`
-- inverte o sinal. Repetir essa tabela aqui em plpgsql seria uma segunda definição
-- da mesma regra, em outra linguagem, para divergir no primeiro `create or replace`
-- — o defeito que o cabeçalho da 0104 nomeou.
--
-- ---------------------------------------------------------------------------
-- A GARANTIA "NUNCA MEIO ESTORNO", PROVADA PELO BANCO
-- ---------------------------------------------------------------------------
-- Depois de gravar, a função CONFERE que nenhum lançamento daquela movimentação
-- ficou sem o seu inverso, e recusa a transação inteira se ficou. Isso não confia
-- em quem chama: uma action que esquecesse de mandar um item derrubaria o estorno,
-- em vez de deixar o acervo mentindo. É o mesmo desenho da
-- `reabrir_pendencias_item_com_estornos` (0119).
--
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER — a autorização continua nas policies
-- ---------------------------------------------------------------------------
--   movimentacoes."operador insere"   → pode_escrever_filial(filial_id)
--   lancamentos_item."operador lanca" → pode_escrever_filial(filial_id)
--                                       and estorno_item_coerente(estorna_id, filial_id, item_id)
--
-- E `lanc_item_estorna_uidx` (índice único parcial, 0015) garante que cada
-- lançamento seja estornado NO MÁXIMO UMA VEZ: reenviar não duplica inverso.
--
-- ROLLBACK LÓGICO: `drop function public.estornar_movimentacao_com_itens(uuid, text, jsonb, uuid);`
-- — a action volta ao INSERT direto de `estorno` sem perder um registro.
-- ===========================================================================

create or replace function public.estornar_movimentacao_com_itens(
  p_movimentacao_id uuid,
  p_observacao      text,
  p_estornos        jsonb,  -- [{estorna_id, item_id, filial_id, tipo, quantidade,
                            --   chamado, observacao, colaborador, colaborador_id}, …]
  p_criado_por      uuid
)
returns jsonb               -- {"estorno_id": uuid, "itens": <int>}
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

  -- O ativo, travado: a filial do estorno é a CORRENTE dele (se foi transferido
  -- depois, é onde está hoje que decide quem pode mexer) — a mesma regra que a
  -- action antiga já aplicava, agora lida sob a trava.
  select a.filial_id into v_filial
    from public.ativos a where a.id = v_mov.ativo_id for update;

  -- Travas advisory em ordem total crescente, ANTES do primeiro INSERT (0104 §5).
  for v_par in
    select distinct (e.value ->> 'item_id')::int as item_id,
                    (e.value ->> 'filial_id')::int as filial
      from jsonb_array_elements(p_estornos) e
     order by 1, 2
  loop
    perform pg_advisory_xact_lock(v_par.item_id, v_par.filial);
  end loop;

  -- 1) O estorno da movimentação. `aplicar_movimentacao` (intocada) valida "só a
  --    última" e restaura o snapshot_anterior.
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, estorno_de, observacao, criado_por)
  values (v_mov.ativo_id, 'estorno'::public.tipo_movimentacao, current_date, v_filial,
          p_movimentacao_id, nullif(btrim(coalesce(p_observacao, '')), ''), v_autor)
  returning id into v_novo;

  -- 2) Os inversos dos itens que foram junto. Positivo primeiro: desfazendo uma
  --    entrega, o `retorno` repõe a prateleira antes de qualquer coisa tirar dela.
  for v_elem in
    select e.value from jsonb_array_elements(p_estornos) e
     order by case when (e.value ->> 'quantidade')::int > 0 then 0 else 1 end
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
      -- O inverso pertence ao ESTORNO, não à movimentação original: assim "o que
      -- foi junto" continua respondendo certo dos dois lados da linha do tempo.
      v_novo,
      v_autor
    );
    v_n := v_n + 1;
  end loop;

  -- 3) ⚠ NUNCA MEIO ESTORNO — provado aqui dentro, não pela boa-fé de quem chama.
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
  'F38 (0121 · §B.5): estorna uma movimentação E grava os lançamentos INVERSOS dos itens que foram junto, na MESMA transação — estornar uma entrega que levou fone e carregador devolve os dois à prateleira e à conta da pessoa. Os inversos chegam prontos de `planejarEstorno` (src/lib/itens/estorno.ts): esta função não decide o que é inverso de quê. Antes de devolver, CONFERE que nenhum lançamento da movimentação ficou sem estorno e RECUSA a transação inteira se ficou — nunca meio estorno. SECURITY INVOKER: as policies de filial continuam sendo a autorização, e lanc_item_estorna_uidx impede inverso duplicado.';

revoke all on function public.estornar_movimentacao_com_itens(uuid, text, jsonb, uuid)
  from public, anon, service_role;
grant execute on function public.estornar_movimentacao_com_itens(uuid, text, jsonb, uuid)
  to authenticated;

-- ===== SMOKE (rodar depois de aplicar — só leitura) =====
--   select p.oid::regprocedure::text, p.prosecdef from pg_proc p
--     join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='estornar_movimentacao_com_itens';
--   -- esperado: 1 linha, (uuid, text, jsonb, uuid), prosecdef = false
--
--   select md5(pg_get_functiondef(p.oid)) from pg_proc p
--     join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='aplicar_movimentacao';
--   -- esperado: d2010a896dabc442a04cfe2f72c7b068 (intocada)
