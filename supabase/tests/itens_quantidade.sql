-- =============================================================
-- Roteiro de teste de ITENS POR QUANTIDADE + AS-OF (F3B — OS 3.12).
-- Rodar no SQL editor do projeto DEV. Auto-verificável:
--   NOTICE  '✓ ...'  quando bate com o esperado
--   WARNING '✗ ...'  quando NÃO bate (procure ✗ na aba Messages)
-- Os cenários negativos DEVEM falhar — o roteiro captura a exceção e marca ✓.
--
-- Cobre: saldo bloqueando negativo · reserva → atrelados · saída com chamado
-- consumindo reserva · liberação · falta = max(0, atrelados − saldo) · ajuste
-- sem observação rejeitado · estorno (lançamento inverso) · as-of de itens ·
-- as-of de ativos com estorno no meio do período.
--
-- Tudo roda numa transação que termina em ROLLBACK: NADA é gravado. Pré-req:
-- >= 1 profile (operador) e a migration 0007 (filiais matriz/linhares).
-- =============================================================

begin;

do $$
declare
  v_prof   uuid;
  v_matriz smallint;
  v_item   smallint;
  v_ativo  uuid;
  v_saida  uuid;
  r        record;
  v_ok     boolean;
begin
  select id into v_prof from public.profiles limit 1;
  if v_prof is null then
    raise exception 'PRE-REQUISITO: crie ao menos 1 operador (profile) no DEV';
  end if;
  select id into v_matriz from public.filiais where slug = 'matriz';
  if v_matriz is null then
    raise exception 'PRE-REQUISITO: aplique a 0007 (filial matriz)';
  end if;

  insert into public.itens (nome, grupo, ordem) values ('TESTE Item Qtd', 'acessorio', 999)
    returning id into v_item;

  -- CENARIO 1 — entrada + reserva → saldo e atrelados.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_item, v_matriz, 'entrada', 40, '2026-06-01', v_prof);
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, chamado, data, criado_por)
    values (v_item, v_matriz, 'reserva', 12, '1001', '2026-06-05', v_prof);
  select saldo, atrelados, falta into r
    from public.rel_saldo_itens(v_matriz, '2026-12-31') where item_id = v_item;
  if r.saldo = 40 and r.atrelados = 12 and r.falta = 0 then
    raise notice '✓ 1: entrada 40 + reserva 12 → saldo 40, atrelados 12, falta 0';
  else
    raise warning '✗ 1: esperava 40/12/0, veio %/%/%', r.saldo, r.atrelados, r.falta;
  end if;

  -- CENARIO 2 — saída com o mesmo chamado consome a reserva.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, chamado, data, criado_por)
    values (v_item, v_matriz, 'saida', 5, '1001', '2026-06-10', v_prof);
  select saldo, atrelados into r
    from public.rel_saldo_itens(v_matriz, '2026-12-31') where item_id = v_item;
  if r.saldo = 35 and r.atrelados = 7 then
    raise notice '✓ 2: saída 5 (ch 1001) → saldo 35, atrelados cai p/ 7';
  else
    raise warning '✗ 2: esperava 35/7, veio %/%', r.saldo, r.atrelados;
  end if;

  -- CENARIO 3 — liberação desatrelou sem consumir saldo.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, chamado, data, criado_por)
    values (v_item, v_matriz, 'liberacao', 3, '1001', '2026-06-12', v_prof);
  select saldo, atrelados into r
    from public.rel_saldo_itens(v_matriz, '2026-12-31') where item_id = v_item;
  if r.saldo = 35 and r.atrelados = 4 then
    raise notice '✓ 3: liberação 3 → atrelados 4 (12−5−3), saldo intacto 35';
  else
    raise warning '✗ 3: esperava 35/4, veio %/%', r.saldo, r.atrelados;
  end if;

  -- CENARIO 4 — falta = max(0, atrelados − saldo). Drena o saldo abaixo do atrelado.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_item, v_matriz, 'saida', 33, '2026-06-15', v_prof);
  select saldo, atrelados, falta into r
    from public.rel_saldo_itens(v_matriz, '2026-12-31') where item_id = v_item;
  if r.saldo = 2 and r.atrelados = 4 and r.falta = 2 then
    raise notice '✓ 4: saldo 2 < atrelados 4 → falta 2 (automático)';
  else
    raise warning '✗ 4: esperava 2/4/2, veio %/%/%', r.saldo, r.atrelados, r.falta;
  end if;

  -- CENARIO 5 — saldo negativo BLOQUEADO pelo trigger.
  v_ok := false;
  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
      values (v_item, v_matriz, 'saida', 100, '2026-06-16', v_prof);
  exception when others then v_ok := true;
  end;
  if v_ok then raise notice '✓ 5: saída 100 (saldo 2) rejeitada (saldo negativo)';
  else raise warning '✗ 5: saída que estoura o saldo NÃO foi bloqueada'; end if;

  -- CENARIO 6 — ajuste sem observação REJEITADO (constraint).
  v_ok := false;
  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
      values (v_item, v_matriz, 'ajuste', -1, '2026-06-16', v_prof);
  exception when others then v_ok := true;
  end;
  if v_ok then raise notice '✓ 6: ajuste sem observação rejeitado';
  else raise warning '✗ 6: ajuste sem observação NÃO foi bloqueado'; end if;

  -- CENARIO 7 — liberação maior que a reserva aberta REJEITADA.
  v_ok := false;
  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, chamado, data, criado_por)
      values (v_item, v_matriz, 'liberacao', 50, '1001', '2026-06-17', v_prof);
  exception when others then v_ok := true;
  end;
  if v_ok then raise notice '✓ 7: liberação > reserva aberta rejeitada';
  else raise warning '✗ 7: liberação além da reserva NÃO foi bloqueada'; end if;

  -- CENARIO 8 — AS-OF de itens: em 03/06 só a entrada e a reserva contam.
  select saldo, atrelados into r
    from public.rel_saldo_itens(v_matriz, '2026-06-06') where item_id = v_item;
  if r.saldo = 40 and r.atrelados = 12 then
    raise notice '✓ 8: as-of 06/06 → saldo 40, atrelados 12 (saídas posteriores ignoradas)';
  else
    raise warning '✗ 8: esperava 40/12 as-of, veio %/%', r.saldo, r.atrelados;
  end if;

  -- CENARIO 9 — ESTORNO: lançamento inverso restaura o saldo.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_item, v_matriz, 'entrada', 10, '2026-06-18', v_prof) returning id into v_saida;
  -- estorna a entrada de 10 com uma saída de 10 vinculada (inverso).
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por, estorna_id)
    values (v_item, v_matriz, 'saida', 10, '2026-06-19', v_prof, v_saida);
  select saldo into r from public.rel_saldo_itens(v_matriz, '2026-12-31') where item_id = v_item;
  if r.saldo = 2 then
    raise notice '✓ 9: entrada 10 + estorno (saída 10 vinculada) → saldo volta a 2';
  else
    raise warning '✗ 9: esperava saldo 2 após estorno, veio %', r.saldo;
  end if;

  -- CENARIO 10 — AS-OF de ATIVOS com estorno no meio do período.
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTEASOF001', 'notebook', v_matriz) returning id into v_ativo;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, criado_por)
    values (v_ativo, 'saida', '2026-06-10', v_matriz, 'Fulano Teste', v_prof) returning id into v_saida;
  -- as-of 12/06 (depois da saída, antes do estorno) → em_uso
  select status into r from public.rel_estoque_asof(v_matriz, '2026-06-12') where ativo_id = v_ativo;
  if r.status = 'em_uso' then
    raise notice '✓ 10a: as-of 12/06 (após saída) → em_uso';
  else
    raise warning '✗ 10a: esperava em_uso, veio %', r.status;
  end if;
  -- estorno da saída em 20/06
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, estorno_de, criado_por)
    values (v_ativo, 'estorno', '2026-06-20', v_matriz, v_saida, v_prof);
  -- as-of 30/06 (após o estorno): o par saída+estorno se anula → em_estoque
  select status into r from public.rel_estoque_asof(v_matriz, '2026-06-30') where ativo_id = v_ativo;
  if r.status = 'em_estoque' then
    raise notice '✓ 10b: as-of 30/06 (após estorno) → o par se anula, volta em_estoque';
  else
    raise warning '✗ 10b: esperava em_estoque, veio %', r.status;
  end if;
  -- as-of 12/06 continua em_uso (o estorno é posterior — não conta as-of)
  select status into r from public.rel_estoque_asof(v_matriz, '2026-06-12') where ativo_id = v_ativo;
  if r.status = 'em_uso' then
    raise notice '✓ 10c: as-of 12/06 segue em_uso (estorno de 20/06 é futuro p/ essa data)';
  else
    raise warning '✗ 10c: esperava em_uso as-of 12/06, veio %', r.status;
  end if;

  raise notice '=== fim do roteiro de itens/as-of (ROLLBACK — nada gravado) ===';
end $$;

rollback;
