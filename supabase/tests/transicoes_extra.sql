-- =============================================================
-- Roteiro de teste — TRANSIÇÕES E REGRAS DA MÁQUINA DE ESTADOS sem roteiro
-- dedicado até hoje (OS-F19, §B1.1 — matriz R-ME). Arquivo NOVO e INDEPENDENTE:
-- não toca nem depende dos demais roteiros de supabase/tests/ (lição F15/F17).
--
-- Funções vigentes exercitadas:
--   * public.status_apos_movimentacao(status, tipo)  — migration 0047
--   * trigger public.aplicar_movimentacao()          — migration 0051
--
-- Convenção idêntica aos outros roteiros (job `banco` do CI): cada asserção emite
--   NOTICE  '✓ ...'  quando o resultado bate com o esperado
--   WARNING '✗ ...'  quando NÃO bate (o CI falha em qualquer `WARNING: ✗`)
-- Cenários NEGATIVOS (que DEVEM falhar no banco) capturam a exceção e marcam ✓
-- quando ela acontece pelo motivo certo (LIKE no texto do erro).
--
-- Tudo roda dentro de UMA transação que termina em ROLLBACK: NADA é gravado.
-- Pré-requisitos (garantidos pelo DB do CI e pelo seed em DEV): >= 1 profile
-- (operador) e as filiais matriz/linhares (migrations 0007). Dados 100% fictícios
-- (CLAUDE.md regra 2): patrimônios com prefixo único `ZZF19...`, colaboradores
-- "Fulano"/"Ciclano"/"Beltrano".
--
-- NOTA sobre a "segunda compra" (§B1.1): a máquina de estados define
-- `compra` de `em_estoque` -> `em_estoque` (auto-laço) — logo uma segunda `compra`
-- enquanto o ativo AINDA está `em_estoque` é ACEITA (nascimento idempotente; ver
-- cenário 2e.1, positivo). A `compra` só é INVÁLIDA a partir de um estado que não
-- seja `em_estoque`; por isso o caso negativo (2e.2) exercita `compra` sobre um
-- ativo `em_uso`, que o banco rejeita com "... invalida ...". Provado no ENSAIO
-- (sgmvldiizsrjbxzzpmhh, byte-idêntico à produção) em 24/07/2026.
-- =============================================================

begin;

do $$
declare
  v_ok      int := 0;   -- F45: quantas asserções passaram
  v_falhas  int := 0;   -- F45: quantas falharam (a linha FIM soma as duas)
  v_prof   uuid;
  v_matriz smallint;
  v_lin    smallint;
  a uuid;                              -- ativo de teste corrente
  v_status public.status_ativo;
  v_colab  text;
  v_saida  uuid;                       -- id da saida (cenario 3)
  v_est    uuid;                       -- id do estorno (cenario 3)
begin
  -- F38: perfil ATIVO e escolha DETERMINÍSTICA. O `limit 1` sem `order by` e sem
  -- filtro podia cair num perfil DESATIVADO (`papel_atual()` devolve null para ele
  -- desde a 0070) — e aí toda guarda de cargo recusava com 42501, num roteiro que
  -- passava verde ontem. É a mesma classe de não-determinismo da pendência nº 5 da
  -- F37, só que em quem o roteiro escolhe como autor.
  -- F62: o cargo/status vive em membros; o ajudante lê de lá.
  v_prof := pg_temp.perfil_ativo_mais_antigo();
  if v_prof is null then
    raise exception 'PRE-REQUISITO: crie ao menos 1 operador (profile) antes de rodar este roteiro';
  end if;
  select id into v_matriz from public.filiais where slug = 'matriz';
  select id into v_lin    from public.filiais where slug = 'linhares';
  if v_matriz is null or v_lin is null then
    raise exception 'PRE-REQUISITO: aplique a migration 0007 (filiais matriz e linhares)';
  end if;

  -- =============================================================
  -- 1 — TRANSIÇÕES POSITIVAS (confere o estado resultante em `ativos`)
  --     Ativo recém-inserido nasce `em_estoque` (default da coluna, 0003).
  -- =============================================================

  -- 1a — emprestimo de em_estoque -> emprestado (colaborador fixado no ativo)
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF19EMP01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF19EMP01';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'emprestimo', 'Fulano', 'TI', v_matriz, v_prof);
  select status, colaborador_atual into v_status, v_colab from public.ativos where id = a;
  if v_status = 'emprestado' and v_colab = 'Fulano' then
    v_ok := v_ok + 1; raise notice '✓ 1a emprestimo de em_estoque -> emprestado (colaborador setado)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 1a emprestimo: esperado emprestado/Fulano, obtido %/%', v_status, coalesce(v_colab, '(null)');
  end if;

  -- 1b — reserva de em_estoque -> reservado
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF19RES01', 'celular', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF19RES01';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (a, 'reserva', 'Ciclano', v_matriz, v_prof);
  select status into v_status from public.ativos where id = a;
  if v_status = 'reservado' then
    v_ok := v_ok + 1; raise notice '✓ 1b reserva de em_estoque -> reservado';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 1b reserva: esperado reservado, obtido %', v_status;
  end if;

  -- 1c — retorno_manutencao de em_manutencao -> em_estoque
  --      (leva o ativo a em_manutencao antes via envio_manutencao; a check MN1/0045
  --       exige chamado_fornecedor no envio).
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF19MAN01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF19MAN01';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, chamado_fornecedor, criado_por)
    values (a, 'envio_manutencao', v_matriz, 'OS-FIC-01', v_prof);            -- em_manutencao
  select status into v_status from public.ativos where id = a;
  if v_status <> 'em_manutencao' then
    v_falhas := v_falhas + 1; raise warning '✗ 1c precondicao: envio_manutencao deveria levar a em_manutencao, obtido %', v_status;
  end if;
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'retorno_manutencao', v_matriz, v_prof);
  select status into v_status from public.ativos where id = a;
  if v_status = 'em_estoque' then
    v_ok := v_ok + 1; raise notice '✓ 1c retorno_manutencao de em_manutencao -> em_estoque';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 1c retorno_manutencao: esperado em_estoque, obtido %', v_status;
  end if;

  -- 1d — marcar_defasado de em_estoque -> defasado
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF19DEF01', 'monitor', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF19DEF01';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'marcar_defasado', v_matriz, v_prof);
  select status into v_status from public.ativos where id = a;
  if v_status = 'defasado' then
    v_ok := v_ok + 1; raise notice '✓ 1d marcar_defasado de em_estoque -> defasado';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 1d marcar_defasado: esperado defasado, obtido %', v_status;
  end if;

  -- 1e — descarte de em_estoque -> descartado (detentor nulo)
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF19DESC01', 'desktop', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF19DESC01';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'descarte', v_matriz, v_prof);
  select status, colaborador_atual into v_status, v_colab from public.ativos where id = a;
  if v_status = 'descartado' and v_colab is null then
    v_ok := v_ok + 1; raise notice '✓ 1e descarte de em_estoque -> descartado (detentor nulo)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 1e descarte: esperado descartado/null, obtido %/%', v_status, coalesce(v_colab, '(null)');
  end if;

  -- =============================================================
  -- 2 — TRANSIÇÕES INVÁLIDAS rejeitadas pelo banco (espera raise '%invalida%')
  --     status_apos_movimentacao devolve null -> o trigger levanta
  --     'Movimentacao <tipo> invalida para ativo <patr> no estado <status>'.
  -- =============================================================

  -- 2a — devolucao de em_estoque (so em_uso/emprestado devolvem)
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF19INV01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF19INV01';
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
      values (a, 'devolucao', v_matriz, v_prof);
    v_falhas := v_falhas + 1; raise warning '✗ 2a devolucao de em_estoque: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then v_ok := v_ok + 1; raise notice '✓ 2a devolucao de em_estoque rejeitada: %', sqlerrm;
    else v_falhas := v_falhas + 1; raise warning '✗ 2a falhou por motivo INESPERADO (nao a maquina de estados): %', sqlerrm; end if;
  end;

  -- 2b — triagem_ok de em_uso (so em_triagem passa)
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF19INV02', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF19INV02';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (a, 'saida', 'Beltrano', v_matriz, v_prof);                        -- em_uso
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
      values (a, 'triagem_ok', v_matriz, v_prof);
    v_falhas := v_falhas + 1; raise warning '✗ 2b triagem_ok de em_uso: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then v_ok := v_ok + 1; raise notice '✓ 2b triagem_ok de em_uso rejeitada: %', sqlerrm;
    else v_falhas := v_falhas + 1; raise warning '✗ 2b falhou por motivo INESPERADO: %', sqlerrm; end if;
  end;

  -- 2c — reserva de em_uso (so em_estoque reserva)
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF19INV03', 'celular', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF19INV03';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (a, 'saida', 'Beltrano', v_matriz, v_prof);                        -- em_uso
  begin
    insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
      values (a, 'reserva', 'Fulano', v_matriz, v_prof);
    v_falhas := v_falhas + 1; raise warning '✗ 2c reserva de em_uso: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then v_ok := v_ok + 1; raise notice '✓ 2c reserva de em_uso rejeitada: %', sqlerrm;
    else v_falhas := v_falhas + 1; raise warning '✗ 2c falhou por motivo INESPERADO: %', sqlerrm; end if;
  end;

  -- 2d — transferencia de um ativo descartado (terminal de baixa nao se transfere;
  --      status_apos_movimentacao exclui descartado/devolvido_fornecedor)
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF19INV04', 'monitor', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF19INV04';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'descarte', v_matriz, v_prof);                                 -- descartado
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, filial_destino_id, criado_por)
      values (a, 'transferencia', v_matriz, v_lin, v_prof);
    v_falhas := v_falhas + 1; raise warning '✗ 2d transferencia de descartado: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then v_ok := v_ok + 1; raise notice '✓ 2d transferencia de descartado rejeitada: %', sqlerrm;
    else v_falhas := v_falhas + 1; raise warning '✗ 2d falhou por motivo INESPERADO: %', sqlerrm; end if;
  end;

  -- 2e — "segunda compra no mesmo ativo". Ver NOTA do cabeçalho: compra de em_estoque
  --      é auto-laço ACEITO, então a segunda compra so e invalida a partir de OUTRO
  --      estado. 2e.1 prova o auto-laço (positivo); 2e.2 prova a rejeicao (compra de
  --      em_uso).
  --   2e.1 — segunda compra enquanto em_estoque: ACEITA (permanece em_estoque)
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF19INV05', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF19INV05';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'compra', v_matriz, v_prof);                                   -- 1a compra
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'compra', v_matriz, v_prof);                                   -- 2a compra (auto-laço)
  select status into v_status from public.ativos where id = a;
  if v_status = 'em_estoque' then
    v_ok := v_ok + 1; raise notice '✓ 2e.1 segunda compra de em_estoque e auto-laço ACEITO (permanece em_estoque)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 2e.1 segunda compra de em_estoque: esperado em_estoque, obtido %', v_status;
  end if;
  --   2e.2 — segunda compra sobre ativo em_uso: REJEITADA
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (a, 'saida', 'Beltrano', v_matriz, v_prof);                        -- em_uso
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
      values (a, 'compra', v_matriz, v_prof);
    v_falhas := v_falhas + 1; raise warning '✗ 2e.2 segunda compra sobre em_uso: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then v_ok := v_ok + 1; raise notice '✓ 2e.2 segunda compra sobre em_uso rejeitada: %', sqlerrm;
    else v_falhas := v_falhas + 1; raise warning '✗ 2e.2 falhou por motivo INESPERADO: %', sqlerrm; end if;
  end;

  -- =============================================================
  -- 3 — R-ME-19: estorno-de-estorno NEGADO. Faz saida, estorna a saida, tenta
  --     estornar o PRÓPRIO estorno. created_at crescente EXPLÍCITO: dentro de UMA
  --     transacao now() e constante, entao o guard (ordena por created_at, id)
  --     precisa de ordem real. O guard `v_orig.tipo = 'estorno'` barra antes do
  --     guard da "ultima efetiva".
  -- =============================================================
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF19EST01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF19EST01';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por, created_at)
    values (a, 'saida', 'Beltrano', v_matriz, v_prof, timestamptz '2026-06-01 10:00:00+00'); -- em_uso
  select id into v_saida from public.movimentacoes where ativo_id = a and tipo = 'saida' limit 1;
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, estorno_de, created_at)
    values (a, 'estorno', v_matriz, v_prof, v_saida, timestamptz '2026-06-01 10:01:00+00');   -- desfaz a saida
  select id into v_est from public.movimentacoes
    where ativo_id = a and tipo = 'estorno' order by created_at desc limit 1;
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, estorno_de, created_at)
      values (a, 'estorno', v_matriz, v_prof, v_est, timestamptz '2026-06-01 10:02:00+00');   -- estorno do estorno
    v_falhas := v_falhas + 1; raise warning '✗ 3 estorno-de-estorno: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%nao pode ser estornada%' or sqlerrm like '%estornada%' then
      v_ok := v_ok + 1; raise notice '✓ 3 estorno-de-estorno negado (R-ME-19): %', sqlerrm;
    else
      v_falhas := v_falhas + 1; raise warning '✗ 3 falhou por motivo INESPERADO (nao o guard de estorno): %', sqlerrm;
    end if;
  end;

  -- =============================================================
  -- 4 — R-ME-20: ajuste sem observacao REJEITADO pelo trigger. O trigger 0051 checa
  --     `new.status_resultante is null or new.observacao is null` e levanta
  --     'Ajuste exige status_resultante e observacao (justificativa)'.
  -- =============================================================
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF19AJ01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF19AJ01';
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, status_resultante, observacao, criado_por)
      values (a, 'ajuste', v_matriz, 'em_manutencao', null, v_prof);          -- observacao NULL
    v_falhas := v_falhas + 1; raise warning '✗ 4 ajuste sem observacao: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%observacao%' or sqlerrm like '%justificativa%' or sqlerrm like '%Ajuste exige%' then
      v_ok := v_ok + 1; raise notice '✓ 4 ajuste sem observacao rejeitado (R-ME-20): %', sqlerrm;
    else
      v_falhas := v_falhas + 1; raise warning '✗ 4 falhou por motivo INESPERADO (nao a regra do ajuste): %', sqlerrm;
    end if;
  end;

  raise notice 'FIM transicoes_extra: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

-- Nada acima e persistido:
rollback;
