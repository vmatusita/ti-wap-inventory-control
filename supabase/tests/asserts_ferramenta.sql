-- =============================================================
-- Roteiro de teste: a FERRAMENTA de asserção (F45, 05/09/2026).
--
-- Este é o único roteiro da pasta que não prova nada sobre o produto: ele prova
-- `pg_temp.assert_zero_de`, de `supabase/tests/_asserts.sql`. Existe por dois
-- motivos, e o segundo é o mais importante:
--
--   1. A função foi criada para RECUSAR universo vazio — o repositório tem
--      dezenas de asserções da forma `if v_n = 0 then ✓`, que passam quando o
--      cenário não montou dado nenhum. Uma ferramenta que promete recusar e não
--      recusa é pior do que não existir; então a recusa é testada.
--   2. Ele prova, de graça, que o RUNNER carregou `_asserts.sql` na mesma sessão
--      de psql. Se o `-f supabase/tests/_asserts.sql` sumir do
--      `scripts/db/rodar-roteiros.sh`, `pg_temp.assert_zero_de` não existe e
--      este roteiro morre com "function does not exist" — em vez de os 24 outros
--      falharem por um motivo difícil de ler, um só falha pelo motivo certo.
--
-- SEM PRÉ-REQUISITO DE DADO. Não lê nem escreve tabela nenhuma do produto; roda
-- num banco vazio. Mesmo assim vai dentro de `begin; … rollback;`, como os
-- demais, porque usa `set_config(…, true)` (local à transação).
--
-- ⚠ O CAMINHO DE FALHA É TESTADO COM O LOG SILENCIADO. `assert_zero_de` marca
-- `✗` quando encontra linha ruim — e um `✗` de verdade na saída faria o runner
-- reprovar este roteiro, que é justamente o que ele NÃO deve fazer ao provar que
-- o ✗ funciona. `client_min_messages = error` durante essa checagem esconde o
-- WARNING do cliente sem mudar o valor devolvido, que é o que se afirma.
-- =============================================================

begin;

do $$
declare
  v_ok      int := 0;   -- F45: quantas asserções passaram
  v_falhas  int := 0;   -- F45: quantas falharam (a linha FIM soma as duas)
  v_res     boolean;
begin
  -- ---------------------------------------------------------------
  -- 1. UNIVERSO VAZIO é recusado — a razão de a função existir
  -- ---------------------------------------------------------------
  begin
    v_res := pg_temp.assert_zero_de('autoteste 1', 0, 0);
    v_falhas := v_falhas + 1;
    raise warning '✗ 1 assert_zero_de ACEITOU universo vazio (devolveu %) — a tautologia passaria', v_res;
  exception when others then
    if sqlerrm like '%universo vazio%' then
      v_ok := v_ok + 1; raise notice '✓ 1 universo vazio RECUSADO: %', sqlerrm;
    else
      v_falhas := v_falhas + 1; raise warning '✗ 1 recusou por motivo INESPERADO: %', sqlerrm;
    end if;
  end;

  -- 1b. universo NULL é o mesmo caso (um `select count(*) into` que não achou
  --     linha devolve null, e é assim que a tautologia costuma chegar).
  begin
    v_res := pg_temp.assert_zero_de('autoteste 1b', 0, null::bigint);
    v_falhas := v_falhas + 1;
    raise warning '✗ 1b assert_zero_de ACEITOU universo NULL (devolveu %)', v_res;
  exception when others then
    if sqlerrm like '%universo vazio%' then
      v_ok := v_ok + 1; raise notice '✓ 1b universo NULL RECUSADO';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 1b recusou por motivo INESPERADO: %', sqlerrm;
    end if;
  end;

  -- ---------------------------------------------------------------
  -- 2. UNIVERSO POVOADO, NADA RUIM -> devolve true e marca ✓
  -- ---------------------------------------------------------------
  v_res := pg_temp.assert_zero_de('autoteste 2 (este ✓ é esperado)', 0, 7);
  if v_res then
    v_ok := v_ok + 1; raise notice '✓ 2 zero ruins de 7 devolve true';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 2 zero ruins de 7 devolveu false';
  end if;

  -- ---------------------------------------------------------------
  -- 3. HÁ RUINS -> devolve false (e marca ✗, silenciado aqui de propósito)
  -- ---------------------------------------------------------------
  perform set_config('client_min_messages', 'error', true);
  v_res := pg_temp.assert_zero_de('autoteste 3 — o ✗ deste é esperado e está escondido', 2, 7);
  perform set_config('client_min_messages', 'notice', true);
  if v_res is false then
    v_ok := v_ok + 1; raise notice '✓ 3 duas linhas ruins de 7 devolve false';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 3 duas linhas ruins de 7 devolveu %', v_res;
  end if;

  -- ---------------------------------------------------------------
  -- 4. CONTAGENS INCOERENTES são erro de quem chamou, não resultado
  -- ---------------------------------------------------------------
  begin
    v_res := pg_temp.assert_zero_de('autoteste 4', 9, 7);
    v_falhas := v_falhas + 1;
    raise warning '✗ 4 aceitou 9 ruins num universo de 7 (devolveu %)', v_res;
  exception when others then
    if sqlerrm like '%incoerente%' then
      v_ok := v_ok + 1; raise notice '✓ 4 mais ruins que o universo RECUSADO';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 4 recusou por motivo INESPERADO: %', sqlerrm;
    end if;
  end;

  -- 4b. contagem de ruins NULA idem.
  begin
    v_res := pg_temp.assert_zero_de('autoteste 4b', null::bigint, 7);
    v_falhas := v_falhas + 1;
    raise warning '✗ 4b aceitou contagem de ruins NULA (devolveu %)', v_res;
  exception when others then
    if sqlerrm like '%NULA%' then
      v_ok := v_ok + 1; raise notice '✓ 4b contagem de ruins NULA RECUSADA';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 4b recusou por motivo INESPERADO: %', sqlerrm;
    end if;
  end;

  -- ---------------------------------------------------------------
  -- 5. A COMPARAÇÃO QUE JUSTIFICA A FERRAMENTA
  -- ---------------------------------------------------------------
  -- Sobre um conjunto vazio, `count(*) = 0` é verdade — e é exatamente o que a
  -- forma antiga afirmava. Aqui isso vira uma asserção positiva: a tautologia
  -- EXISTE, e é por isso que a forma nova recusa.
  if (select count(*) from (select 1 where false) t) = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 5 `count(*) = 0` sobre conjunto vazio é VERDADE — a forma antiga passaria aqui';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 5 conjunto vazio não contou 0';
  end if;

  raise notice 'FIM asserts_ferramenta: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
