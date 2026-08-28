-- Migration 0119 — o ciclo da pendência de item fecha (F38, frente E ·
-- decisão do Johnny, 28/08/2026).
--
-- Uma coluna de vínculo, um índice e duas RPCs. Nenhuma função existente é
-- recriada — em particular, `aplicar_movimentacao` (que É o trigger da 0051, o que
-- ABRE a pendência) sai byte a byte, e o caminho "Faltante" não muda uma vírgula.
--
-- ---------------------------------------------------------------------------
-- O FURO QUE ESTA MIGRATION FECHA
-- ---------------------------------------------------------------------------
-- Resolver uma pendência em /pendencias mexia só na própria linha de
-- `pendencias_item`: nenhum lançamento nascia. Consequência, agora que existe conta
-- por pessoa (0118): item dado como perdido ficaria na conta daquela pessoa PARA
-- SEMPRE, e item recuperado nunca voltaria à prateleira.
--
--   Desfecho       Lançamentos gravados                     Efeito líquido
--   ------------   --------------------------------------   ------------------------------
--   recuperado     `retorno` 1 (com o vínculo, §C.3)        estoque +1 · pessoa −1 · Total =
--   baixa          `retorno` 1  +  `ajuste` −1              pessoa −1 · Total −1 · estoque =
--
-- ⚠ POR QUE A `baixa` SÃO DOIS LANÇAMENTOS, E NÃO UM `ajuste` SÓ. Conferido contra
-- o cabeçalho da 0027, fórmula por fórmula:
--
--   total     = max(0, Σentrada + Σajuste)          → `retorno` não entra; `ajuste` sim
--   liberados = max(0, Σsaida − Σretorno)           → `ajuste` NÃO entra; `retorno` sim
--   estoque   = max(0, total − atrelados − liberados)
--
-- `com_a_pessoa` (0118) conta `saida − retorno`, e `ajuste` não entra nessa conta.
-- Um `ajuste` negativo SOZINHO tiraria do Total e deixaria o item na conta da
-- pessoa para sempre — exatamente o furo que esta frente existe para fechar. Com o
-- par: o `retorno` baixa a pessoa (−1) e sobe o estoque (+1); o `ajuste −1` baixa o
-- Total (−1) e devolve o estoque ao que era. É a mesma lógica com que a 0104 provou
-- que só o PAR de ajustes preserva o Total numa transferência.
--
-- A ORDEM DOS DOIS IMPORTA: o `retorno` entra PRIMEIRO. Invertido, o `ajuste −1`
-- encontraria a prateleira ainda sem o item e `valida_lancamento_item` recusaria
-- por estoque negativo — corretamente. Por isso a ordem é fixada AQUI, dentro da
-- transação, e não deixada para quem chama.
--
-- ---------------------------------------------------------------------------
-- POR QUE NASCE `lancamentos_item.pendencia_item_id`
-- ---------------------------------------------------------------------------
-- A ordem exige (critério 8) que REABRIR uma pendência que gerou lançamento grave
-- os inversos "ou recuse — nunca deixa lançamento órfão". Sem um elo, descobrir
-- QUAL lançamento veio de QUAL pendência seria adivinhação por texto de observação
-- — frágil e indistinguível quando duas pendências nascem da mesma devolução
-- (`movimentacao_id` é o mesmo para as duas). O elo é estrutural, anulável, e
-- espelha exatamente o desenho da 0116. Com ele, a recusa do critério 8 pode ser
-- provada DENTRO da transação, pelo banco, e não pela boa-fé de quem chama.
--
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER nas duas — a autorização continua nas policies
-- ---------------------------------------------------------------------------
--   pendencias_item."operador resolve" → UPDATE using  pode_escrever_filial(filial_id) and status='aberta'
--   pendencias_item."admin reabre"     → UPDATE using  e_admin() and pode_escrever_filial(filial_id) and status='resolvida'
--   lancamentos_item."operador lanca"  → INSERT check  pode_escrever_filial(filial_id) and estorno_item_coerente(…)
--
-- Resolver continua sendo do operador; reabrir continua sendo do nível
-- administrador. Nenhuma policy é reescrita: as RPCs herdam as que já existem.
--
-- ---------------------------------------------------------------------------
-- IDEMPOTÊNCIA E CORRIDA — o `returning` é quem decide
-- ---------------------------------------------------------------------------
-- `resolverPendenciaItem` sempre foi em lote e idempotente (`eq('status','aberta')`
-- no próprio UPDATE): reenviar não re-resolve. Aqui isso passa a valer TAMBÉM para
-- o lançamento, e pelo mesmo mecanismo: só nascem lançamentos das pendências que o
-- UPDATE DE FATO mudou (`returning id`). Duas chamadas simultâneas com os mesmos
-- ids: a primeira resolve e lança; a segunda não acha linha `aberta`, não resolve e
-- **não lança**. Reenviar continua não duplicando lançamento.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTAS FUNÇÕES **NÃO** FAZEM (lições da 0104)
-- ---------------------------------------------------------------------------
-- · Não redigem texto. A justificativa do `ajuste` (obrigatória pelo CHECK
--   `lanc_item_ajuste_obs`) chega PRONTA, composta por função pura e testada em
--   `src/lib/pendencias/texto-baixa.ts`.
-- · Não resolvem a ponte tipo→item nem a pessoa. Quem resolve é a aplicação, antes
--   de chamar: pendência cujo tipo não resolve item de catálogo é resolvida do
--   mesmo jeito, sem lançamento. **Resolver pendência NUNCA falha por catálogo.**
-- · Não recalculam saldo. Quem valida é `valida_lancamento_item`, sob a trava.
-- · Não fazem UPDATE nem DELETE em `lancamentos_item`. Correção é lançamento
--   inverso apontando `estorna_id` — `guarda_acervo` (0081) recusaria o resto.
--
-- ROLLBACK LÓGICO:
--   drop function public.reabrir_pendencias_item_com_estornos(uuid[], text, jsonb, uuid);
--   drop function public.resolver_pendencias_item_com_lancamentos(uuid[], text, text, jsonb, uuid);
--   drop index if exists public.lanc_item_pendencia_idx;
--   alter table public.lancamentos_item drop column pendencia_item_id;
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- (1) O ELO
-- ---------------------------------------------------------------------------
alter table public.lancamentos_item
  add column pendencia_item_id uuid references public.pendencias_item (id);

comment on column public.lancamentos_item.pendencia_item_id is
  'A pendência de item cuja RESOLUÇÃO gerou este lançamento (F38 · 0119), sempre anulável. Existe para que reabrir a pendência possa gravar os inversos com certeza de quais são — e para que a recusa do critério 8 ("nunca deixa lançamento órfão") seja provável dentro da transação, pelo banco. Lançamento que não nasce de pendência tem ela nula, para sempre.';

create index lanc_item_pendencia_idx on public.lancamentos_item (pendencia_item_id);

comment on index public.lanc_item_pendencia_idx is
  'Índice de FK (estrutural, precedente 0106): serve à reabertura, que procura os lançamentos de um conjunto de pendências, e ao on delete das ferramentas do /dev.';

-- ---------------------------------------------------------------------------
-- (2) RESOLVER — a resolução e os lançamentos na mesma transação
-- ---------------------------------------------------------------------------
create or replace function public.resolver_pendencias_item_com_lancamentos(
  p_ids         uuid[],
  p_desfecho    text,     -- 'recuperado' | 'baixa'
  p_observacao  text,
  p_lancamentos jsonb,    -- [{pendencia_id, item_id, filial_id, quantidade, data,
                          --   colaborador, colaborador_id, observacao_retorno,
                          --   observacao_ajuste}, …] — só as que resolvem item
  p_criado_por  uuid
)
returns jsonb             -- {"resolvidas": <int>, "lancamentos": <int>}
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_autor      uuid := coalesce(auth.uid(), p_criado_por);
  v_resolvidas uuid[] := '{}';
  v_par        record;
  v_elem       jsonb;
  v_n_lanc     int := 0;
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

  -- Só as ABERTAS mudam, e só delas nascem lançamentos (ver "IDEMPOTÊNCIA").
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
    -- (a) O RETORNO, sempre e primeiro: repõe a prateleira e baixa a conta da
    --     pessoa. Invertido com o ajuste, o trigger recusaria por estoque negativo.
    insert into public.lancamentos_item (
      item_id, filial_id, tipo, quantidade, data,
      colaborador, colaborador_id, observacao, pendencia_item_id, criado_por
    ) values (
      (v_elem ->> 'item_id')::smallint,
      (v_elem ->> 'filial_id')::smallint,
      'retorno'::public.tipo_lancamento,
      (v_elem ->> 'quantidade')::int,
      coalesce(nullif(v_elem ->> 'data', '')::date, current_date),
      nullif(v_elem ->> 'colaborador', ''),
      nullif(v_elem ->> 'colaborador_id', '')::uuid,
      nullif(v_elem ->> 'observacao_retorno', ''),
      (v_elem ->> 'pendencia_id')::uuid,
      v_autor
    );
    v_n_lanc := v_n_lanc + 1;

    -- (b) A BAIXA acrescenta o ajuste negativo: o item saiu do mundo, o Total cai.
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

  return jsonb_build_object('resolvidas', cardinality(v_resolvidas), 'lancamentos', v_n_lanc);
end $$;

comment on function public.resolver_pendencias_item_com_lancamentos(uuid[], text, text, jsonb, uuid) is
  'F38 (0119): resolve 1..N pendências de item E grava os lançamentos do desfecho na MESMA transação. `recuperado` → retorno 1 (estoque +1, pessoa −1, Total inalterado). `baixa` → retorno 1 + ajuste −1 (pessoa −1, Total −1, estoque de volta ao que era) — dois lançamentos porque `ajuste` não entra na conta por pessoa, e sozinho deixaria o item com ela para sempre. O retorno entra PRIMEIRO (invertido, o ajuste encontraria a prateleira vazia). SECURITY INVOKER: a policy "operador resolve" continua sendo a autorização. Só nascem lançamentos das pendências que o UPDATE de fato mudou — reenviar não re-resolve nem duplica. Pendência cujo tipo não resolve item de catálogo é resolvida do mesmo jeito, sem lançamento.';

revoke all on function public.resolver_pendencias_item_com_lancamentos(uuid[], text, text, jsonb, uuid)
  from public, anon, service_role;
grant execute on function public.resolver_pendencias_item_com_lancamentos(uuid[], text, text, jsonb, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- (3) REABRIR — desfaz o que a resolução fez, ou recusa
-- ---------------------------------------------------------------------------
create or replace function public.reabrir_pendencias_item_com_estornos(
  p_ids          uuid[],
  p_justificativa text,
  p_estornos     jsonb,   -- [{estorna_id, item_id, filial_id, tipo, quantidade,
                          --   chamado, observacao, colaborador, colaborador_id,
                          --   pendencia_id}, …] — inversos calculados por
                          --   `planejarEstorno` (src/lib/itens/estorno.ts)
  p_criado_por   uuid
)
returns jsonb             -- {"reabertas": <int>, "estornos": <int>}
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

  -- Os inversos, com o positivo primeiro: desfazendo uma `baixa`, o `ajuste +1`
  -- repõe o Total antes de a `saida` tirar da prateleira. Na ordem contrária, a
  -- `saida` encontraria estoque insuficiente e o trigger recusaria — corretamente,
  -- mas por um motivo que é só ordenação.
  for v_elem in
    select e.value
      from jsonb_array_elements(p_estornos) e
     where (e.value ->> 'pendencia_id')::uuid = any(v_reabertas)
     order by case when (e.value ->> 'quantidade')::int > 0 then 0 else 1 end
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

  -- ⚠ A GARANTIA DO CRITÉRIO 8, provada pelo BANCO e não pela boa-fé de quem
  -- chama: nenhuma pendência reaberta pode ficar com lançamento de pé. Se quem
  -- chamou esqueceu de mandar um inverso, a transação INTEIRA volta — nunca
  -- reabre deixando lançamento órfão.
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
  'F38 (0119): reabre 1..N pendências de item E grava os lançamentos INVERSOS (estorna_id apontando o original; lanc_item_estorna_uidx garante uma vez só) na MESMA transação. Os inversos chegam prontos de `planejarEstorno` (src/lib/itens/estorno.ts) — esta função não redige texto nem decide o inverso. Antes de devolver, CONFERE que nenhuma pendência reaberta ficou com lançamento de pé e RECUSA a transação inteira se ficou: nunca reabre deixando lançamento órfão. SECURITY INVOKER: a policy "admin reabre" continua sendo a autorização — reabrir é do nível administrador.';

revoke all on function public.reabrir_pendencias_item_com_estornos(uuid[], text, jsonb, uuid)
  from public, anon, service_role;
grant execute on function public.reabrir_pendencias_item_com_estornos(uuid[], text, jsonb, uuid)
  to authenticated;

-- ===== SMOKE (rodar depois de aplicar — só leitura) =====
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema='public' and table_name='lancamentos_item'
--      and column_name='pendencia_item_id';
--   -- esperado: 1 linha, uuid, YES
--
--   select p.oid::regprocedure::text, p.prosecdef from pg_proc p
--     join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname in
--          ('resolver_pendencias_item_com_lancamentos','reabrir_pendencias_item_com_estornos');
--   -- esperado: 2 linhas, prosecdef = false nas duas
--
--   select count(*) from public.lancamentos_item where pendencia_item_id is not null;
--   -- esperado logo após o apply: 0
