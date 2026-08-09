-- Migration 0104 — transferir item por quantidade entre filiais, numa transação só
-- (F31 · ITN-01 da análise de UX de 07/08/2026).
--
-- ✅ APLICADA em 09/08/2026 — ensaio (sgmvldiizsrjbxzzpmhh) e produção (pbtjcalbmepmrqzprusb),
--   pelo caminho A do docs/RUNBOOK-BANCO.md. Ata do rollout em docs/DECISOES.md (F31).
--   Medido nos dois, antes = depois: ensaio 4 lançamentos · 1.602 ativos · 3.237 movimentações;
--   produção 0 lançamentos · 0 itens de catálogo · 1.654 ativos · 3.280 movimentações.
--   Roteiro `supabase/tests/transferencia_item.sql`: **18 asserções OK · 0 falhas nos DOIS**,
--   sem resíduo (0 item `TESTE F31%`, 0 conta `f31.*` depois do rollback).
--   `get_advisors(security)` de produção: **nenhum achado novo** — e não poderia haver, porque
--   a função é INVOKER e a classe `authenticated_security_definer_function_executable` (que a
--   0062/0069/0079-88 alimentaram) só enxerga `security definer`.
--
-- ---------------------------------------------------------------------------
-- O PROBLEMA
-- ---------------------------------------------------------------------------
-- Mover 10 mouses da Matriz para a Serra hoje são DOIS lançamentos desconexos, em
-- duas aberturas do diálogo — e o caminho que o operador escolhe naturalmente
-- (Liberação na origem + Entrada no destino) **corrompe o Total para sempre**.
--
-- A conta é do próprio trigger `valida_lancamento_item` (0015 → 0027):
--
--     total_raw = Σ(entrada) + Σ(ajuste)
--     lib_raw   = Σ(saida)   − Σ(retorno)
--     atrelados = Σ por chamado de max(0, Σ(reserva) − Σ(liberacao))
--     estoque   = total_raw − atrelados − max(0, lib_raw)
--
-- `saida` (que na tela se chama "Liberação") NÃO entra em `total_raw`: ela baixa
-- o estoque e deixa o total onde estava — é o desenho correto para "o item ficou
-- com a pessoa". Usá-la para transferir soma +N ao Total consolidado a cada
-- transferência, e nada nunca corrige isso sozinho.
--
-- O único par que mexe no estoque dos DOIS lados e devolve Total consolidado
-- INALTERADO é o par de AJUSTES: `−N` na origem, `+N` no destino (−N + N = 0 em
-- `total_raw`).
--
-- ---------------------------------------------------------------------------
-- O QUE ESTA MIGRATION FAZ
-- ---------------------------------------------------------------------------
-- Uma função nova, `transferir_item`, que grava esse par **tudo-ou-nada**. É
-- ADITIVA: nenhuma tabela, policy, constraint, trigger ou função existente é
-- tocada, e o enum `tipo_lancamento` NÃO ganha valor novo (decisão da análise —
-- a transferência é `ajuste`, e o "tipo" é derivação de apresentação na tela).
-- → caminho A do docs/RUNBOOK-BANCO.md (ensaio primeiro, produção depois).
--
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER — e por que isso É a autorização, não um descuido
-- ---------------------------------------------------------------------------
-- Espelha `criar_compra_lote` (0008 → 0064) e `devolver_ao_fornecedor` (0045):
-- as RPCs de escrita de acervo desta casa são INVOKER de propósito. Rodando com
-- a sessão de quem chamou, os DOIS inserts passam pela policy de INSERT de
-- `lancamentos_item`:
--
--     "operador lanca"  with check (pode_escrever_filial(filial_id)
--                                   AND estorno_item_coerente(estorna_id, filial_id, item_id))
--
-- avaliada LINHA A LINHA. Ou seja: a exigência de "escrever nas DUAS filiais
-- envolvidas" sai de graça e no lugar certo (o Postgres), sem que esta função
-- precise ser confiada para nada. Um operador vinculado só à Matriz é barrado na
-- perna do destino mesmo que a tela tenha deixado passar.
--
-- As guardas `pode_escrever_filial` no corpo são **cinto-e-suspensórios pela
-- MENSAGEM**, exatamente como o cabeçalho da 0064 explica para a compra: sem
-- elas o operador receberia o 42501 cru ("new row violates row-level security
-- policy"), que a UI traduz como "faça login novamente" — conselho errado para
-- quem só não tem a filial vinculada. Com elas, a action devolve o motivo
-- verdadeiro. O texto ("Sem permissao de escrita na filial %") é o MESMO que
-- `traduzErroBanco` já reconhece desde a F21.
--
-- ---------------------------------------------------------------------------
-- ⚠ O DEADLOCK QUE ESTA FUNÇÃO PRECISA EVITAR — e que o desenho ingênuo cria
-- ---------------------------------------------------------------------------
-- A PRIMEIRA linha do corpo de `valida_lancamento_item` é:
--
--     perform pg_advisory_xact_lock(new.item_id::int, new.filial_id::int);
--
-- Trava de TRANSAÇÃO, por par (item, filial). Numa função que grava as duas
-- pernas na MESMA transação, isso são DUAS travas por item, adquiridas na ordem
-- em que os INSERTs acontecem. Duas transferências simultâneas em sentidos
-- opostos — Matriz→Serra e Serra→Matriz do mesmo item — pediriam
-- (item, matriz) e (item, serra) em ordens INVERTIDAS: deadlock clássico. Com
-- carrinho de vários itens, a mesma inversão acontece entre itens quando os dois
-- carrinhos os listam em ordens diferentes.
--
-- É a mesma classe de bug que a 0100 (F24) teve de consertar depois de já estar
-- em produção, na RPC de conflitos entre filiais. Aqui ela é fechada ANTES:
-- o passo 5 adquire TODAS as travas, ele mesmo, antes do primeiro INSERT, em
-- ordem total determinística `(item_id, filial_id)` crescente. Advisory locks
-- são reentrantes na mesma sessão, então as travas que o trigger pedir depois já
-- estarão nas mãos e nenhuma aquisição sairá fora de ordem.
--
-- ⚠ Quem mexer neste corpo NÃO PODE remover o passo 5 nem trocar a ordenação por
-- "a ordem em que o operador digitou". O roteiro `supabase/tests/transferencia_item.sql`
-- trava isso.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTA FUNÇÃO **NÃO** FAZ, de propósito
-- ---------------------------------------------------------------------------
-- · Não valida saldo por conta própria. Quem valida é o trigger, linha a linha,
--   sob a trava — e ele é a fonte da verdade. Uma segunda conta de "estoque"
--   aqui seria uma segunda definição da mesma regra, que é o defeito que o
--   CLAUDE.md proíbe. Saldo insuficiente na origem faz o INSERT da perna de
--   origem estourar e a transação inteira volta: nada parcial sobra.
-- · Não redige texto. As duas observações cruzadas chegam PRONTAS, compostas em
--   `src/lib/itens/transferencia.ts`. Se a frase morasse aqui, o selo do
--   histórico teria de repeti-la em TypeScript — duas cópias da mesma string,
--   em linguagens diferentes, que divergem no primeiro `create or replace`.
-- · Não transfere ATIVO com patrimônio: aquilo é movimentação, e já existe.

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
      (item_id, filial_id, tipo, quantidade, chamado, colaborador, data, observacao, criado_por)
    values
      (v_item::smallint, p_origem, 'ajuste', -v_qtd, v_chamado, null, v_data, p_obs_origem, v_autor);

    -- Perna que ENTRA: ajuste POSITIVO no destino.
    insert into public.lancamentos_item
      (item_id, filial_id, tipo, quantidade, chamado, colaborador, data, observacao, criado_por)
    values
      (v_item::smallint, p_destino, 'ajuste', v_qtd, v_chamado, null, v_data, p_obs_destino, v_autor);
  end loop;

  v_n := jsonb_array_length(p_itens);
  return v_n;
end $$;

comment on function public.transferir_item(smallint, smallint, jsonb, date, text, text, text, uuid) is
  'F31 (0104 · ITN-01): transfere itens por quantidade entre duas filiais numa transação só, como PAR DE AJUSTES (−N na origem, +N no destino) — o único caminho que mexe no estoque dos dois lados e deixa o Total consolidado inalterado. SECURITY INVOKER: a permissão nas DUAS filiais é imposta pela policy "operador lanca", linha a linha. Adquire todas as travas advisory em ordem (item_id, filial_id) ANTES do primeiro insert, para não deadlockar com uma transferência de sentido contrário.';

-- Grants: idênticos aos das RPCs vizinhas (0064:125-126, 0045:381).
revoke all on function public.transferir_item(smallint, smallint, jsonb, date, text, text, text, uuid)
  from public, anon, service_role;
grant execute on function public.transferir_item(smallint, smallint, jsonb, date, text, text, text, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO PÓS-APPLY (obrigatória — runbook §5)
-- ---------------------------------------------------------------------------
-- 1) Exatamente UMA assinatura, sem overload:
--      select p.oid::regprocedure::text
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname = 'transferir_item';
--      -- esperado: 1 linha, 8 args (smallint, smallint, jsonb, date, text, text, text, uuid)
--
-- 2) INVOKER e volátil (não `definer`, não `stable`):
--      select prosecdef, provolatile
--        from pg_proc where oid = 'public.transferir_item(smallint,smallint,jsonb,date,text,text,text,uuid)'::regprocedure;
--      -- esperado: prosecdef = false, provolatile = 'v'
--
-- 3) Grants:
--      select r.rolname, has_function_privilege(r.rolname,
--        'public.transferir_item(smallint,smallint,jsonb,date,text,text,text,uuid)', 'execute')
--        from (values ('anon'),('authenticated'),('service_role')) r(rolname);
--      -- esperado: authenticated = true, anon = false, service_role = false
--
-- 4) Acervo INALTERADO pelo apply (a migration não tem DML nenhum):
--      select (select count(*) from public.lancamentos_item) as lancamentos,
--             (select count(*) from public.ativos)           as ativos;
--      -- esperado: idêntico ao medido antes
--
-- 5) `notify pgrst, 'reload schema';` — sem isso o PostgREST não enxerga a RPC nova.
--
-- 6) Roteiro `supabase/tests/transferencia_item.sql` (7 casos), verde nos DOIS bancos.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
--   drop function public.transferir_item(smallint, smallint, jsonb, date, text, text, text, uuid);
--
-- Aditiva: o `drop` não perde nenhum dado do acervo. As transferências já
-- gravadas continuam existindo como o que sempre foram — pares de ajustes.
