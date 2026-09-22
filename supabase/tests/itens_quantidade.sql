-- =============================================================
-- Roteiro de teste de ITENS POR QUANTIDADE + AS-OF.
-- Escrito na F3B (0015); REESCRITO em 21/07/2026 para a semântica Total/Estoque
-- da 0027 (F6A) — a migration renomeou `saldo` → `estoque` e mudou a doutrina:
-- atrelar (reserva) e liberar (saida) DESCONTAM o estoque; entrada/ajuste mexem no
-- Total. Os valores esperados abaixo já estão re-derivados contra `rel_saldo_itens`
-- v3 (0027) e o trigger `valida_lancamento_item` v2 (0027).
--
-- Rodar no SQL editor do projeto DEV (ou automático no job `banco` do CI).
-- Auto-verificável:
--   NOTICE  '✓ ...'  quando bate com o esperado
--   WARNING '✗ ...'  quando NÃO bate (procure ✗ na aba Messages / o CI falha em ✗)
-- Os cenários negativos DEVEM falhar — o roteiro captura a exceção e marca ✓.
--
-- Doutrina Total/Estoque (0027):
--   total     = max(0, Σentrada + Σajuste)
--   liberados = max(0, Σsaida − Σretorno)                    -- "em uso com pessoas"
--   atrelados = Σ_chamado max(0, Σreserva − Σliberacao)      -- separado por chamado
--   estoque   = max(0, total − atrelados − liberados)        -- a prateleira
--   falta     = max(0, atrelados + liberados − total)        -- anomalia (0 em dados válidos)
-- rel_saldo_itens expõe as colunas: total · estoque · atrelados · falta (não há `saldo`).
--
-- Cobre: entrada+atrelar · liberação p/ pessoa NÃO consome a reserva (ciclos
-- independentes) · devolução desatrela · retorno (tipo novo da 0027) repõe a
-- prateleira · falta permanece 0 mesmo com atrelados > estoque (correção da
-- doutrina) · estoque negativo bloqueado · ajuste sem observação rejeitado ·
-- devolução além do atrelado aberto rejeitada · retorno além do liberado rejeitado ·
-- as-of de itens · estorno (inverso da entrada = ajuste negativo) · as-of de ativos
-- com estorno no meio do período.
--
-- Tudo roda numa transação que termina em ROLLBACK: NADA é gravado. Pré-req:
-- >= 1 profile (operador) e a migration 0007 (filiais matriz/linhares).
-- =============================================================
--
-- F60 (16/09/2026) — O SALDO PELA ASSINATURA NOVA (migrations 0143/0145). As oito leituras
-- de saldo deste roteiro passaram de `rel_saldo_itens(<filial>, <data>)`, dropada na 0145,
-- para `rel_saldo_itens_filiais(array[<filial>], <data>) where filial_id is null`. A função
-- nova devolve DOIS níveis numa chamada — uma linha por (filial do recorte, item) e o nível do
-- TOTAL do recorte, com `filial_id` nulo — e o filtro de nível é o que mantém cada asserção
-- provando a MESMA coisa: o total do recorte é, por construção, o número que a chamada velha
-- devolvia para aquele recorte (para uma filial só, ele é igual à linha dela, e
-- `f60_recorte.sql` 4a/4b prova isso item a item). Sem o filtro, `select … into` passaria a
-- escolher entre linhas de níveis diferentes sem avisar, e `count(*)` contaria cada item uma
-- vez por nível. Nenhum rótulo mudou.
--
-- E as três leituras de as-of de ativos (12a-12c) passaram de `rel_estoque_asof(v_matriz, …)`
-- para `rel_estoque_asof_filiais(array[v_matriz], …)` — o recorte de uma filial como lista de um
-- elemento, sobre o corpo novo da 0143 (lateral ancorada em `ativos`, filial calculada na data).

begin;

do $$
declare
  v_ok      int := 0;   -- F45: quantas asserções passaram
  v_falhas  int := 0;   -- F45: quantas falharam (a linha FIM soma as duas)
  v_prof    uuid;
  v_matriz  smallint;
  v_item    smallint;   -- item A: acumula os lançamentos dos cenários 1–4, 6–11
  v_item2   smallint;   -- item B: cenário 5 (falta), isolado
  v_ativo   uuid;
  v_saida   uuid;
  v_entrada uuid;
  r         record;
  v_recusou      boolean;
begin
  -- F38: perfil ATIVO e escolha DETERMINÍSTICA. O `limit 1` sem `order by` e sem
  -- filtro podia cair num perfil DESATIVADO (`papel_atual()` devolve null para ele
  -- desde a 0070) — e aí toda guarda de cargo recusava com 42501, num roteiro que
  -- passava verde ontem. É a mesma classe de não-determinismo da pendência nº 5 da
  -- F37, só que em quem o roteiro escolhe como autor.
  v_prof := pg_temp.perfil_ativo_mais_antigo();
  if v_prof is null then
    raise exception 'PRE-REQUISITO: crie ao menos 1 operador (profile) no DEV';
  end if;
  select id into v_matriz from public.filiais where slug = 'matriz';
  if v_matriz is null then
    raise exception 'PRE-REQUISITO: aplique a 0007 (filial matriz)';
  end if;

  insert into public.itens (nome, grupo, ordem) values ('TESTE Item Qtd', 'acessorio', 999)
    returning id into v_item;

  -- CENARIO 1 — entrada + atrelar (reserva). Atrelar DESCONTA o estoque.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_item, v_matriz, 'entrada', 40, '2026-06-01', v_prof);
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, chamado, data, criado_por)
    values (v_item, v_matriz, 'reserva', 12, '1001', '2026-06-05', v_prof);
  select total, estoque, atrelados, falta into r
    from public.rel_saldo_itens_filiais(array[v_matriz], '2026-12-31') where filial_id is null and item_id = v_item;
  if r.total = 40 and r.estoque = 28 and r.atrelados = 12 and r.falta = 0 then
    v_ok := v_ok + 1; raise notice '✓ 1: entrada 40 + reserva 12 → total 40, estoque 28, atrelados 12, falta 0';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 1: esperava total/estoque/atrelados/falta 40/28/12/0, veio %/%/%/%',
      r.total, r.estoque, r.atrelados, r.falta;
  end if;

  -- CENARIO 2 — saída (liberação p/ pessoa) NÃO consome a reserva (ciclos
  -- independentes na 0027): baixa só o estoque; atrelados fica intacto.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, chamado, data, criado_por)
    values (v_item, v_matriz, 'saida', 5, '1001', '2026-06-10', v_prof);
  select total, estoque, atrelados into r
    from public.rel_saldo_itens_filiais(array[v_matriz], '2026-12-31') where filial_id is null and item_id = v_item;
  if r.total = 40 and r.estoque = 23 and r.atrelados = 12 then
    v_ok := v_ok + 1; raise notice '✓ 2: saída 5 → estoque 28→23, atrelados intacto 12 (saída não consome reserva), total 40';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 2: esperava total/estoque/atrelados 40/23/12, veio %/%/%',
      r.total, r.estoque, r.atrelados;
  end if;

  -- CENARIO 3 — devolução (liberacao) desatrela: atrelados cai, estoque volta.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, chamado, data, criado_por)
    values (v_item, v_matriz, 'liberacao', 3, '1001', '2026-06-12', v_prof);
  select total, estoque, atrelados into r
    from public.rel_saldo_itens_filiais(array[v_matriz], '2026-12-31') where filial_id is null and item_id = v_item;
  if r.total = 40 and r.estoque = 26 and r.atrelados = 9 then
    v_ok := v_ok + 1; raise notice '✓ 3: devolução 3 (ch 1001) → atrelados 12→9, estoque 23→26, total 40';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 3: esperava total/estoque/atrelados 40/26/9, veio %/%/%',
      r.total, r.estoque, r.atrelados;
  end if;

  -- CENARIO 4 — retorno (tipo NOVO da 0027): a pessoa devolve; repõe a prateleira.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_item, v_matriz, 'retorno', 2, '2026-06-14', v_prof);
  select total, estoque, atrelados into r
    from public.rel_saldo_itens_filiais(array[v_matriz], '2026-12-31') where filial_id is null and item_id = v_item;
  if r.total = 40 and r.estoque = 28 and r.atrelados = 9 then
    v_ok := v_ok + 1; raise notice '✓ 4: retorno 2 → liberados 5→3, estoque 26→28, total intacto 40';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 4: esperava total/estoque/atrelados 40/28/9, veio %/%/%',
      r.total, r.estoque, r.atrelados;
  end if;

  -- CENARIO 5 — falta segue 0 mesmo com atrelados > estoque (correção da doutrina
  -- 0027: atrelar desconta o estoque, então atrelados > estoque é NORMAL; a fórmula
  -- antiga max(0, atrelados − estoque) acenderia "faltam 6" falso). Item B isolado.
  insert into public.itens (nome, grupo, ordem) values ('TESTE Item Qtd 2', 'acessorio', 998)
    returning id into v_item2;
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_item2, v_matriz, 'entrada', 10, '2026-06-01', v_prof);
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, chamado, data, criado_por)
    values (v_item2, v_matriz, 'reserva', 8, '2002', '2026-06-05', v_prof);
  select total, estoque, atrelados, falta into r
    from public.rel_saldo_itens_filiais(array[v_matriz], '2026-12-31') where filial_id is null and item_id = v_item2;
  if r.total = 10 and r.estoque = 2 and r.atrelados = 8 and r.falta = 0 then
    v_ok := v_ok + 1; raise notice '✓ 5: entrada 10 + atrelar 8 → estoque 2, atrelados 8, falta 0 (atrelar não acende falta)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 5: esperava total/estoque/atrelados/falta 10/2/8/0, veio %/%/%/%',
      r.total, r.estoque, r.atrelados, r.falta;
  end if;

  -- CENARIO 6 — estoque negativo BLOQUEADO pelo trigger (item A: estoque 28).
  v_recusou := false;
  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
      values (v_item, v_matriz, 'saida', 100, '2026-06-16', v_prof);
  exception when others then v_recusou := true;
  end;
  if v_recusou then v_ok := v_ok + 1; raise notice '✓ 6: saída 100 (estoque 28) rejeitada (estoque negativo)';
  else v_falhas := v_falhas + 1; raise warning '✗ 6: saída que estoura o estoque NÃO foi bloqueada'; end if;

  -- CENARIO 7 — ajuste sem observação REJEITADO (constraint lanc_item_ajuste_obs).
  -- O ajuste -1 passa no trigger (total 39, estoque 27); a constraint é que barra.
  v_recusou := false;
  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
      values (v_item, v_matriz, 'ajuste', -1, '2026-06-16', v_prof);
  exception when others then v_recusou := true;
  end;
  if v_recusou then v_ok := v_ok + 1; raise notice '✓ 7: ajuste sem observação rejeitado';
  else v_falhas := v_falhas + 1; raise warning '✗ 7: ajuste sem observação NÃO foi bloqueado'; end if;

  -- CENARIO 8 — devolução (liberacao) além do atrelado aberto do chamado REJEITADA
  -- (ch 1001 tem só 9 atrelados: reserva 12 − devolução 3).
  v_recusou := false;
  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, chamado, data, criado_por)
      values (v_item, v_matriz, 'liberacao', 50, '1001', '2026-06-17', v_prof);
  exception when others then v_recusou := true;
  end;
  if v_recusou then v_ok := v_ok + 1; raise notice '✓ 8: devolução 50 > atrelado aberto (9) do chamado rejeitada';
  else v_falhas := v_falhas + 1; raise warning '✗ 8: devolução além do atrelado NÃO foi bloqueada'; end if;

  -- CENARIO 9 — retorno além do liberado em aberto REJEITADO (guard novo da 0027).
  -- Liberado em aberto do item A = Σsaida − Σretorno = 5 − 2 = 3.
  v_recusou := false;
  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
      values (v_item, v_matriz, 'retorno', 50, '2026-06-17', v_prof);
  exception when others then v_recusou := true;
  end;
  if v_recusou then v_ok := v_ok + 1; raise notice '✓ 9: retorno 50 > liberado em aberto (3) rejeitado';
  else v_falhas := v_falhas + 1; raise warning '✗ 9: retorno além do liberado NÃO foi bloqueado'; end if;

  -- CENARIO 10 — AS-OF de itens: em 06/06 só a entrada e a reserva contam.
  select total, estoque, atrelados into r
    from public.rel_saldo_itens_filiais(array[v_matriz], '2026-06-06') where filial_id is null and item_id = v_item;
  if r.total = 40 and r.estoque = 28 and r.atrelados = 12 then
    v_ok := v_ok + 1; raise notice '✓ 10: as-of 06/06 → total 40, estoque 28, atrelados 12 (saídas/devoluções/retornos posteriores ignorados)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 10: esperava total/estoque/atrelados 40/28/12 as-of, veio %/%/%',
      r.total, r.estoque, r.atrelados;
  end if;

  -- CENARIO 11 — ESTORNO: o inverso da entrada é um AJUSTE NEGATIVO (na 0027 a
  -- saída não baixa o Total; só o ajuste baixa) → restaura total/estoque.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_item, v_matriz, 'entrada', 10, '2026-06-18', v_prof) returning id into v_entrada;
  select total, estoque into r
    from public.rel_saldo_itens_filiais(array[v_matriz], '2026-12-31') where filial_id is null and item_id = v_item;
  if r.total <> 50 or r.estoque <> 38 then
    v_falhas := v_falhas + 1; raise warning '✗ 11a: após entrada 10 esperava total/estoque 50/38, veio %/%', r.total, r.estoque;
  end if;
  -- estorna a entrada de 10 com um ajuste −10 vinculado (inverso; exige observação).
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, observacao, data, criado_por, estorna_id)
    values (v_item, v_matriz, 'ajuste', -10, 'Estorno de entrada (baixa de 10 do total)',
            '2026-06-19', v_prof, v_entrada);
  select total, estoque into r
    from public.rel_saldo_itens_filiais(array[v_matriz], '2026-12-31') where filial_id is null and item_id = v_item;
  if r.total = 40 and r.estoque = 28 then
    v_ok := v_ok + 1; raise notice '✓ 11: entrada 10 + estorno (ajuste −10 vinculado) → total volta a 40, estoque a 28';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 11: esperava total/estoque 40/28 após estorno, veio %/%', r.total, r.estoque;
  end if;

  -- CENARIO 12 — AS-OF de ATIVOS com estorno no meio do período.
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTEASOF001', 'notebook', v_matriz) returning id into v_ativo;
  -- A compra estabelece a existência/baseline (todo ativo nasce por compra). Sem ela,
  -- as-of DEPOIS do estorno o par saída+estorno se anula e o ativo "não existe" as-of
  -- (rel_estoque_asof 0022 só reconstrói quem teve mov. efetiva <= a data → NULL).
  -- created_at explícito e crescente: numa transação now() é constante e o guard de
  -- estorno ordena por (created_at, id) — sem isso o desempate por id (uuid) é aleatório
  -- e o estorno da saída poderia ser recusado como "não-última".
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
    values (v_ativo, 'compra', '2026-06-05', v_matriz, v_prof, timestamptz '2026-06-05 10:00:00+00');
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, criado_por, created_at)
    values (v_ativo, 'saida', '2026-06-10', v_matriz, 'Fulano Teste', v_prof, timestamptz '2026-06-10 10:00:00+00')
    returning id into v_saida;
  -- as-of 12/06 (depois da saída, antes do estorno) → em_uso
  select status into r from public.rel_estoque_asof_filiais(array[v_matriz], '2026-06-12') where ativo_id = v_ativo;
  if r.status = 'em_uso' then
    v_ok := v_ok + 1; raise notice '✓ 12a: as-of 12/06 (após saída) → em_uso';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 12a: esperava em_uso, veio %', r.status;
  end if;
  -- estorno da saída em 20/06
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, estorno_de, criado_por, created_at)
    values (v_ativo, 'estorno', '2026-06-20', v_matriz, v_saida, v_prof, timestamptz '2026-06-20 10:00:00+00');
  -- as-of 30/06 (após o estorno): saída+estorno se anulam; sobra a compra → em_estoque
  select status into r from public.rel_estoque_asof_filiais(array[v_matriz], '2026-06-30') where ativo_id = v_ativo;
  if r.status = 'em_estoque' then
    v_ok := v_ok + 1; raise notice '✓ 12b: as-of 30/06 (após estorno) → o par se anula, sobra a compra → em_estoque';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 12b: esperava em_estoque, veio %', r.status;
  end if;
  -- as-of 12/06 continua em_uso (o estorno é posterior — não conta as-of)
  select status into r from public.rel_estoque_asof_filiais(array[v_matriz], '2026-06-12') where ativo_id = v_ativo;
  if r.status = 'em_uso' then
    v_ok := v_ok + 1; raise notice '✓ 12c: as-of 12/06 segue em_uso (estorno de 20/06 é futuro p/ essa data)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 12c: esperava em_uso as-of 12/06, veio %', r.status;
  end if;

  raise notice 'FIM itens_quantidade: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
