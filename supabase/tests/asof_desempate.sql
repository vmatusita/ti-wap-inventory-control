-- =============================================================
-- Roteiro de teste: rel_estoque_asof — DESEMPATE (migration 0054) e AS-OF com
-- ESTORNO (R-REL). Roda no job `banco` do CI (aplica 0001→0055 e executa cada
-- supabase/tests/*.sql). Arquivo NOVO e independente — não toca os demais.
--
-- Prova dois pontos da reconstrução as-of do estoque:
--   1. DESEMPATE (0054, achado C1): quando a `compra` de abertura e o `ajuste` de
--      reconciliação do import caem no MESMO (data, created_at) — o que só ocorre
--      dentro da transação do import de startup — a nova cláusula `(tipo='ajuste')
--      desc` do `order by` faz o AJUSTE (estado real) vencer o empate, espelhando o
--      last-insert-wins do trigger em `ativos`. SEM o fix, o tiebreak por `id desc`
--      pegaria a COMPRA (em_estoque). Montamos o empate com id ALTO na compra e id
--      BAIXO no ajuste: só a cláusula do 0054 evita o resultado errado.
--   2. AS-OF com ESTORNO (par mov+estorno se anula): uma `saida` e o `estorno` dela
--      em datas diferentes → antes do estorno (as-of D1) o ativo aparece em_uso;
--      depois (as-of hoje, o par já anulado) volta a em_estoque, batendo com o
--      estado corrente de `ativos`.
--
-- Convenção do CI: cada passo emite
--   NOTICE  '✓ ...'  quando bate com o esperado
--   WARNING '✗ ...'  quando NÃO bate (o CI falha em qualquer `WARNING: ✗`).
-- Tudo dentro de uma transação que termina em ROLLBACK: NADA é gravado.
-- Pré-requisito: >= 1 profile (operador) e a filial 'matriz' (0007).
-- Dados 100% fictícios (prefixo único ZZF19, colaborador "Fulano").
-- =============================================================

begin;

do $$
declare
  v_ok      int := 0;   -- F45: quantas asserções passaram
  v_falhas  int := 0;   -- F45: quantas falharam (a linha FIM soma as duas)
  v_prof   uuid;
  v_matriz smallint;
  a uuid;         -- ativo do cenário 1 (desempate)
  b uuid;         -- ativo do cenário 2 (as-of com estorno)
  v_saida  uuid;  -- id da saída a ser estornada (cenário 2)
  v_asof   public.status_ativo;  -- status as-of do cenário 1
  v_ativo  public.status_ativo;  -- ativos.status (verdade corrente) do cenário 1
  v_d1     public.status_ativo;  -- as-of em D1 (antes do estorno)
  v_now    public.status_ativo;  -- as-of hoje (par anulado)
  v_cur    public.status_ativo;  -- ativos.status corrente do cenário 2
begin
  -- F38: perfil ATIVO e escolha DETERMINÍSTICA. O `limit 1` sem `order by` e sem
  -- filtro podia cair num perfil DESATIVADO (`papel_atual()` devolve null para ele
  -- desde a 0070) — e aí toda guarda de cargo recusava com 42501, num roteiro que
  -- passava verde ontem. É a mesma classe de não-determinismo da pendência nº 5 da
  -- F37, só que em quem o roteiro escolhe como autor.
  select id into v_prof from public.profiles
   where ativo and excluido_em is null
   order by created_at, id limit 1;
  if v_prof is null then
    raise exception 'PRE-REQUISITO: crie ao menos 1 operador (profile) antes de rodar este roteiro';
  end if;
  select id into v_matriz from public.filiais where slug = 'matriz';
  if v_matriz is null then
    raise exception 'PRE-REQUISITO: aplique a migration 0007 (filial matriz)';
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 1 — DESEMPATE (0054, achado C1). Reproduz a transação do import:
  -- a compra de ABERTURA (baseline, em_estoque) e o AJUSTE de reconciliação (estado
  -- real = em_uso) entram com o MESMO created_at e o MESMO data. Damos à compra um id
  -- ALTO ('ffff…') e ao ajuste um id BAIXO ('0000…0001'): sem a cláusula do 0054, o
  -- `id desc` pegaria a compra (em_estoque). Com o fix, `(tipo='ajuste') desc` faz o
  -- ajuste vencer o empate. Esperado: rel_estoque_asof(hoje).status = 'em_uso' e
  -- IGUAL a ativos.status (o trigger, last-insert-wins, também é 'em_uso').
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF1900001', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF1900001';

  -- compra de abertura: id ALTO, created_at/data explícitos (na transação now() é
  -- constante, por isso created_at é fixado à mão).
  insert into public.movimentacoes (id, ativo_id, tipo, data, filial_id, criado_por, created_at)
    values ('ffffffff-ffff-4fff-8fff-ffffffffffff', a, 'compra',
            date '2026-06-01', v_matriz, v_prof, timestamptz '2026-06-01 10:00:00+00');

  -- ajuste de reconciliação p/ em_uso: id BAIXO, MESMO created_at e MESMO data.
  insert into public.movimentacoes (id, ativo_id, tipo, data, filial_id,
                                     status_resultante, observacao, criado_por, created_at)
    values ('00000000-0000-4000-8000-000000000001', a, 'ajuste',
            date '2026-06-01', v_matriz, 'em_uso',
            'reconciliacao de import (teste F19)', v_prof, timestamptz '2026-06-01 10:00:00+00');

  select status into v_asof  from public.rel_estoque_asof(null, current_date) where ativo_id = a;
  select status into v_ativo from public.ativos where id = a;
  if v_asof = 'em_uso' and v_asof = v_ativo then
    v_ok := v_ok + 1; raise notice '✓ 1 desempate (0054): ajuste vence a compra no empate (data,created_at); as-of=% = ativos=%',
      v_asof, v_ativo;
  else
    v_falhas := v_falhas + 1; raise warning '✗ 1 desempate: esperado em_uso (= ativos.status), obtido as-of=% ativos=%',
      coalesce(v_asof::text, '(fora da view)'), v_ativo;
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 2 — AS-OF com ESTORNO (R-REL). compra @2026-06-01, saída @D1=2026-06-10
  -- (em_uso), estorno da saída @D2=2026-06-20 (D2 > D1). created_at monotônico por
  -- ativo (10:00 < 10:01 < 10:02) para o guard de estorno enxergar a saída como a
  -- ÚLTIMA movimentação. Esperado:
  --   as-of(D1)   = em_uso     (o estorno ainda não vale: data > D1);
  --   as-of(hoje) = em_estoque (o par saída+estorno se anula → sobra a compra);
  --   ativos.status corrente = em_estoque (o estorno restaurou o snapshot).
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF1900002', 'notebook', v_matriz);
  select id into b from public.ativos where patrimonio = 'ZZF1900002';

  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
    values (b, 'compra', date '2026-06-01', v_matriz, v_prof, timestamptz '2026-06-01 10:00:00+00');
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, data, filial_id, criado_por, created_at)
    values (b, 'saida', 'Fulano', 'TI', date '2026-06-10', v_matriz, v_prof, timestamptz '2026-06-01 10:01:00+00');
  select id into v_saida from public.movimentacoes where ativo_id = b and tipo = 'saida' limit 1;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at, estorno_de)
    values (b, 'estorno', date '2026-06-20', v_matriz, v_prof, timestamptz '2026-06-01 10:02:00+00', v_saida);

  select status into v_d1  from public.rel_estoque_asof(null, date '2026-06-10') where ativo_id = b;
  select status into v_now from public.rel_estoque_asof(null, current_date)      where ativo_id = b;
  select status into v_cur from public.ativos where id = b;

  if v_d1 = 'em_uso' then
    v_ok := v_ok + 1; raise notice '✓ 2a as-of D1 (2026-06-10, antes do estorno) = em_uso';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 2a as-of D1: esperado em_uso, obtido %', coalesce(v_d1::text, '(fora da view)');
  end if;
  if v_now = 'em_estoque' then
    v_ok := v_ok + 1; raise notice '✓ 2b as-of hoje (par saída+estorno anulado) = em_estoque';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 2b as-of hoje: esperado em_estoque, obtido %', coalesce(v_now::text, '(fora da view)');
  end if;
  if v_cur = 'em_estoque' and v_cur = v_now then
    v_ok := v_ok + 1; raise notice '✓ 2c estorno restaurou ativos.status=em_estoque, batendo com o as-of de hoje';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 2c ativos.status: esperado em_estoque (= as-of hoje), obtido ativos=% as-of=%',
      v_cur, coalesce(v_now::text, '(fora da view)');
  end if;

  raise notice 'FIM asof_desempate: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

-- Nada acima é persistido:
rollback;
