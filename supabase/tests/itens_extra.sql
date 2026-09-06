-- =============================================================
-- Roteiro de teste: LACUNAS de ITENS POR QUANTIDADE (R-ITE) — complementa
-- itens_quantidade.sql (que já cobre saldo/atrelados/falta/as-of/estorno).
-- Escrito na F19 (24/07/2026). Norma vigente: doutrina Total/Estoque da 0027
-- (trigger valida_lancamento_item v2, função rel_saldo_itens v3) + o catálogo
-- itens da 0014 (nome único case-insensitive) + a imutabilidade do diário
-- lancamentos_item da 0015 (só policies de SELECT/INSERT p/ authenticated).
--
-- Cobre o que o roteiro-template NÃO cobre:
--   R-ITE-02  ajuste NEGATIVO que levaria o Total abaixo de 0 → rejeitado pelo
--             trigger (guard total < 0), distinto do guard de estoque.
--   R-ITE-11  IMUTABILIDADE: como papel `authenticated`, UPDATE e DELETE em
--             lancamentos_item não alteram/removem a linha (RLS sem policy de
--             update/delete → 0 linhas afetadas; um erro de permissão, noutro
--             ambiente, também conta como rejeição).
--   R-ITE-22  nome de item ÚNICO case-insensitive: o índice funcional
--             itens_nome_uidx sobre lower(nome) (0014) recusa 'zzf19 mouse'
--             após 'ZZF19 Mouse' com unique_violation (23505).
--
-- Convenção (igual aos demais roteiros do job `banco`):
--   NOTICE  '✓ ...'  quando bate com o esperado
--   WARNING '✗ ...'  quando NÃO bate (o CI falha em qualquer `WARNING: ✗`).
-- Os cenários negativos DEVEM falhar no banco — o roteiro captura a exceção e
-- marca ✓ quando ela vem pelo motivo certo.
--
-- Tudo roda numa transação que termina em ROLLBACK: NADA é gravado. Dados 100%
-- fictícios (prefixo único ZZF19). Pré-req: >= 1 profile (operador) e a
-- migration 0007 (filial matriz). Arquivo NOVO e independente — não toca os
-- roteiros existentes.
-- =============================================================

begin;

do $$
declare
  v_ok      int := 0;   -- F45: quantas asserções passaram
  v_falhas  int := 0;   -- F45: quantas falharam (a linha FIM soma as duas)
  v_prof    uuid;
  v_matriz  smallint;
  v_item    smallint;   -- item A: R-ITE-02 e R-ITE-11
  v_item2   smallint;   -- item B: R-ITE-22
  v_lanc    uuid;
  v_q       int;
  v_rows    int;
  v_exists  boolean;
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
    raise exception 'PRE-REQUISITO: crie ao menos 1 operador (profile) no DEV';
  end if;
  select id into v_matriz from public.filiais where slug = 'matriz';
  if v_matriz is null then
    raise exception 'PRE-REQUISITO: aplique a 0007 (filial matriz)';
  end if;

  -- ---------------------------------------------------------------
  -- R-ITE-02 — ajuste NEGATIVO que levaria o Total abaixo de 0 é REJEITADO
  -- pelo trigger valida_lancamento_item (guard `total_raw < 0`, distinto do
  -- guard de estoque). entrada 5 → total 5; ajuste −10 → total resultante −5.
  -- A observação é fornecida de propósito: passa a constraint lanc_item_ajuste_obs
  -- (0015) e ISOLA a rejeição no TRIGGER, não na constraint de justificativa.
  -- ---------------------------------------------------------------
  insert into public.itens (nome, grupo, ordem)
    values ('ZZF19 Item Teste', 'acessorio', 999) returning id into v_item;
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_item, v_matriz, 'entrada', 5, '2026-06-01', v_prof);
  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, observacao, data, criado_por)
      values (v_item, v_matriz, 'ajuste', -10, 'Ajuste que levaria o total abaixo de zero',
              '2026-06-02', v_prof);
    v_falhas := v_falhas + 1; raise warning '✗ R-ITE-02: ajuste −10 (total −5) NÃO foi bloqueado (deveria)';
  exception when others then
    if sqlerrm ilike '%negativ%' or sqlerrm ilike '%total%' or sqlerrm ilike '%estoque%' then
      v_ok := v_ok + 1; raise notice '✓ R-ITE-02: entrada 5 + ajuste −10 (total −5) rejeitado pelo trigger: %', sqlerrm;
    else
      v_falhas := v_falhas + 1; raise warning '✗ R-ITE-02 falhou por motivo INESPERADO (não o guard total<0): %', sqlerrm;
    end if;
  end;

  -- ---------------------------------------------------------------
  -- R-ITE-11 — IMUTABILIDADE de lancamentos_item. As policies da 0015 só cobrem
  -- SELECT e INSERT p/ `authenticated`; sem policy de UPDATE/DELETE, o comando
  -- fica sem linhas visíveis e afeta 0 linhas — a linha NÃO muda / NÃO some.
  -- (O roteiro também aceita um erro de permissão como rejeição válida, caso o
  -- grant de tabela seja mais restrito noutro ambiente: o handler engole o erro
  -- e a verificação final — linha intacta/presente — é o que decide.)
  -- ---------------------------------------------------------------
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_item, v_matriz, 'entrada', 7, '2026-06-03', v_prof) returning id into v_lanc;

  -- 11a — UPDATE como authenticated não altera a linha.
  v_rows := -1;
  begin
    set local role authenticated;
    update public.lancamentos_item set quantidade = 999 where id = v_lanc;
    get diagnostics v_rows = row_count;
    reset role;
  exception when others then
    v_rows := -1;   -- erro (ex.: permissão) também é uma rejeição válida
  end;
  reset role;
  select quantidade into v_q from public.lancamentos_item where id = v_lanc;
  if v_q = 7 and v_rows <= 0 then
    v_ok := v_ok + 1; raise notice '✓ R-ITE-11a: UPDATE como authenticated não alterou a linha (linhas afetadas=%, quantidade segue 7)', v_rows;
  else
    v_falhas := v_falhas + 1; raise warning '✗ R-ITE-11a: UPDATE mudou a linha imutável (linhas afetadas=%, quantidade=%)', v_rows, v_q;
  end if;

  -- 11b — DELETE como authenticated não remove a linha.
  v_rows := -1;
  begin
    set local role authenticated;
    delete from public.lancamentos_item where id = v_lanc;
    get diagnostics v_rows = row_count;
    reset role;
  exception when others then
    v_rows := -1;
  end;
  reset role;
  select exists(select 1 from public.lancamentos_item where id = v_lanc) into v_exists;
  if v_exists and v_rows <= 0 then
    v_ok := v_ok + 1; raise notice '✓ R-ITE-11b: DELETE como authenticated não removeu a linha (linhas afetadas=%)', v_rows;
  else
    v_falhas := v_falhas + 1; raise warning '✗ R-ITE-11b: DELETE removeu a linha imutável (linhas afetadas=%, existe=%)', v_rows, v_exists;
  end if;

  -- ---------------------------------------------------------------
  -- R-ITE-22 — nome de item ÚNICO case-insensitive. O índice funcional
  -- itens_nome_uidx sobre (lower(nome)) da 0014 trata 'ZZF19 Mouse' e
  -- 'zzf19 mouse' como o mesmo item → unique_violation (23505) no 2º insert.
  -- ---------------------------------------------------------------
  insert into public.itens (nome, grupo, ordem)
    values ('ZZF19 Mouse', 'acessorio', 998) returning id into v_item2;
  begin
    insert into public.itens (nome, grupo, ordem) values ('zzf19 mouse', 'acessorio', 997);
    v_falhas := v_falhas + 1; raise warning '✗ R-ITE-22: ''zzf19 mouse'' após ''ZZF19 Mouse'' NÃO foi bloqueado (deveria)';
  exception
    when unique_violation then
      v_ok := v_ok + 1; raise notice '✓ R-ITE-22: nome duplicado case-insensitive rejeitado (23505): %', sqlerrm;
    when others then
      v_falhas := v_falhas + 1; raise warning '✗ R-ITE-22 falhou por motivo INESPERADO (não unique_violation): %', sqlerrm;
  end;

  raise notice 'FIM itens_extra: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

-- Nada acima é persistido:
rollback;
