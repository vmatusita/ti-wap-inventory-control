-- =============================================================
-- Roteiro de teste: import DISPENSA "termo pendente" em v_pendencias (0049).
--
-- Prova que a regra da migration 0049 vale E é ESCOPADA a origem='importacao':
--   * importado em posse SEM termo e sem outra pendência → NÃO vira pendência;
--   * cadastro/inferido em posse sem termo → CONTINUAM "termo pendente";
--   * importado que TAMBÉM tem pendência livre → RECLASSIFICA para ela (não some,
--     e não fica como "termo pendente");
--   * importado com termo ASSINADO → nunca foi pendente (controle).
--
-- Convenção igual aos demais roteiros: cada passo emite
--   NOTICE  '✓ ...'  quando bate com o esperado
--   WARNING '✗ ...'  quando NÃO bate (o job `banco` do CI falha em qualquer
--                     `WARNING: ✗`).
--
-- Testa a LÓGICA DA VIEW: seta status/termo_assinado/origem/pendencia DIRETO na
-- tabela `ativos` (a view deriva só desses campos) — sem movimentações, sem
-- depender de profile/operador. Tudo em transação com ROLLBACK: nada é gravado.
-- Pré-requisito: migration 0007 (filial 'matriz') e 0034 (patrimônio nullable).
-- =============================================================

begin;

do $$
declare
  v_ok      int := 0;   -- F45: quantas asserções passaram
  v_falhas  int := 0;   -- F45: quantas falharam (a linha FIM soma as duas)
  v_matriz smallint;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid;
  v_pend text;
  v_in   boolean;
begin
  select id into v_matriz from public.filiais where slug = 'matriz';
  if v_matriz is null then
    raise exception 'PRE-REQUISITO: aplique a migration 0007 (filial matriz)';
  end if;

  -- ---------------------------------------------------------------
  -- P1 — importado, em posse, SEM termo, SEM outra pendência → NÃO aparece
  --      (o coração do pedido: o acervo legado do import não é cobrado).
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id, status, termo_assinado, origem, updated_at)
    values ('TESTE0049001', 'notebook', v_matriz, 'em_uso', null, 'importacao', now())
    returning id into p1;
  select exists(select 1 from public.v_pendencias where id = p1) into v_in;
  if not v_in then
    v_ok := v_ok + 1; raise notice '✓ P1 importado em_uso sem termo NÃO está em v_pendencias';
  else
    select pendencia into v_pend from public.v_pendencias where id = p1;
    v_falhas := v_falhas + 1; raise warning '✗ P1 importado em_uso apareceu em v_pendencias como "%"', v_pend;
  end if;

  -- ---------------------------------------------------------------
  -- P2 — CADASTRO manual, em posse, SEM termo → "termo pendente" (preservado).
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id, status, termo_assinado, origem, updated_at)
    values ('TESTE0049002', 'notebook', v_matriz, 'em_uso', null, 'cadastro', now())
    returning id into p2;
  select pendencia into v_pend from public.v_pendencias where id = p2;
  if v_pend = 'termo pendente' then
    v_ok := v_ok + 1; raise notice '✓ P2 cadastro em_uso sem termo = "termo pendente" (regra preservada)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ P2 cadastro em_uso: esperado "termo pendente", obtido %', coalesce(v_pend, '(fora da view)');
  end if;

  -- ---------------------------------------------------------------
  -- P3 — importado em posse sem termo, MAS com pendência livre ('sem patrimônio
  --      físico') → reclassifica para ela; NÃO some e NÃO é "termo pendente".
  --      (patrimônio null exige a 0034; service_tag null não colide no índice.)
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id, status, termo_assinado, origem, pendencia, updated_at)
    values (null, 'notebook', v_matriz, 'em_uso', null, 'importacao', 'sem patrimônio físico', now())
    returning id into p3;
  select pendencia into v_pend from public.v_pendencias where id = p3;
  if v_pend = 'sem patrimônio físico' then
    v_ok := v_ok + 1; raise notice '✓ P3 importado c/ pendência livre reclassifica p/ "%" (não "termo pendente")', v_pend;
  else
    v_falhas := v_falhas + 1; raise warning '✗ P3 importado c/ pendência livre: esperado "sem patrimônio físico", obtido %', coalesce(v_pend, '(fora da view)');
  end if;

  -- ---------------------------------------------------------------
  -- P4 — 'inferido' (NÃO é import) em posse sem termo → segue "termo pendente"
  --      (prova que o escopo da dispensa é EXATAMENTE origem='importacao').
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id, status, termo_assinado, origem, updated_at)
    values ('TESTE0049004', 'notebook', v_matriz, 'emprestado', 'nao', 'inferido', now())
    returning id into p4;
  select pendencia into v_pend from public.v_pendencias where id = p4;
  if v_pend = 'termo pendente' then
    v_ok := v_ok + 1; raise notice '✓ P4 inferido emprestado sem termo = "termo pendente" (escopo = só importacao)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ P4 inferido: esperado "termo pendente", obtido %', coalesce(v_pend, '(fora da view)');
  end if;

  -- ---------------------------------------------------------------
  -- P5 — importado em posse COM termo assinado → nunca foi pendente (controle:
  --      a dispensa não é o único motivo de sair da view; 'sim' já saía).
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id, status, termo_assinado, origem, updated_at)
    values ('TESTE0049005', 'notebook', v_matriz, 'em_uso', 'sim', 'importacao', now())
    returning id into p5;
  select exists(select 1 from public.v_pendencias where id = p5) into v_in;
  if not v_in then
    v_ok := v_ok + 1; raise notice '✓ P5 importado com termo assinado não está em v_pendencias';
  else
    v_falhas := v_falhas + 1; raise warning '✗ P5 importado com termo assinado apareceu em v_pendencias';
  end if;

  raise notice 'FIM pendencias_import_termo: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

-- Nada acima é persistido:
rollback;
