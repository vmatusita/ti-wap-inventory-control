-- =============================================================
-- Roteiro de teste — MANUTENÇÃO COM FORNECEDOR (OS-F14).
--
-- Cobre os aceites MN1 (check do chamado do fornecedor), MN2 (estado terminal
-- devolvido_fornecedor + transições) e MN3/MN4 (RPC devolver_ao_fornecedor:
-- substituto, colisão com rollback total, sem substituto, vínculo/herança,
-- estorno que restaura em_manutencao SEM apagar o substituto).
--
-- Mesmo padrão de maquina_estados.sql: auto-verificável (NOTICE '✓' / WARNING '✗'),
-- cenários negativos capturam a exceção e marcam ✓ quando ela acontece, e TUDO roda
-- numa transação que termina em ROLLBACK (nada é gravado). Pré-requisitos (garantidos
-- pelo job `banco` do CI e pelo seed em DEV): >= 1 profile (operador) e as filiais
-- matriz/linhares (migration 0007). Dados 100% fictícios (CLAUDE.md regra 2).
-- =============================================================

begin;

do $$
declare
  v_prof     uuid;
  v_matriz   smallint;
  v_linhares smallint;
  a uuid; b uuid; c uuid; d uuid;      -- ids de ativos de teste
  v_sub      uuid;                      -- id do substituto (direto)
  v_status   public.status_ativo;
  v_cf       text;
  v_forn     text;
  v_mov      uuid; v_subid uuid; v_submov uuid;
  v_dev_mov  uuid;
  v_cnt      int;
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
  select id into v_matriz   from public.filiais where slug = 'matriz';
  select id into v_linhares from public.filiais where slug = 'linhares';
  if v_matriz is null or v_linhares is null then
    raise exception 'PRE-REQUISITO: aplique a migration 0007 (filiais matriz e linhares)';
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 1 (MN1) — chamado do fornecedor no envio_manutencao
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id, fornecedor)
    values ('TESTEF14001', 'notebook', v_matriz, 'TechSupply Fic');
  select id into a from public.ativos where patrimonio = 'TESTEF14001';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'compra', v_matriz, v_prof);   -- em_estoque

  -- 1a. envio_manutencao SEM chamado_fornecedor DEVE falhar (check MN1)
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
      values (a, 'envio_manutencao', v_matriz, v_prof);
    raise warning '✗ 1a envio_manutencao sem chamado_fornecedor: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%chamado_fornecedor%' or sqlerrm like '%movimentacoes_chamado_fornecedor_envio%' then
      raise notice '✓ 1a envio_manutencao sem chamado do fornecedor rejeitado: %', sqlerrm;
    else
      raise warning '✗ 1a falhou por motivo INESPERADO (nao a check MN1): %', sqlerrm;
    end if;
  end;

  -- 1b. envio_manutencao COM chamado_fornecedor grava e leva a em_manutencao
  insert into public.movimentacoes (ativo_id, tipo, filial_id, chamado, chamado_fornecedor, criado_por)
    values (a, 'envio_manutencao', v_matriz, '77001', 'OS-FORN-4401', v_prof);
  select status into v_status from public.ativos where id = a;
  select chamado_fornecedor into v_cf from public.movimentacoes
    where ativo_id = a and tipo = 'envio_manutencao';
  if v_status = 'em_manutencao' and v_cf = 'OS-FORN-4401' then
    raise notice '✓ 1b envio_manutencao com chamado do fornecedor -> em_manutencao (campo gravado)';
  else
    raise warning '✗ 1b esperado em_manutencao/OS-FORN-4401, obtido %/%', v_status, v_cf;
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 2 (MN2) — devolucao_fornecedor: em_manutencao -> devolvido_fornecedor
  -- ---------------------------------------------------------------
  insert into public.movimentacoes (ativo_id, tipo, filial_id, chamado_fornecedor, criado_por)
    values (a, 'devolucao_fornecedor', v_matriz, 'OS-FORN-4401', v_prof);
  select status into v_status from public.ativos where id = a;
  if v_status = 'devolvido_fornecedor' then
    raise notice '✓ 2a devolucao_fornecedor -> devolvido_fornecedor';
  else
    raise warning '✗ 2a esperado devolvido_fornecedor, obtido %', v_status;
  end if;

  -- 2b. de devolvido_fornecedor: transferencia DEVE falhar
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, filial_destino_id, criado_por)
      values (a, 'transferencia', v_matriz, v_linhares, v_prof);
    raise warning '✗ 2b transferencia de devolvido_fornecedor: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then raise notice '✓ 2b transferencia de devolvido_fornecedor rejeitada';
    else raise warning '✗ 2b falhou por motivo INESPERADO: %', sqlerrm; end if;
  end;

  -- 2c. de devolvido_fornecedor: saida DEVE falhar
  begin
    insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
      values (a, 'saida', 'Fulano Fic', v_matriz, v_prof);
    raise warning '✗ 2c saida de devolvido_fornecedor: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then raise notice '✓ 2c saida de devolvido_fornecedor rejeitada';
    else raise warning '✗ 2c falhou por motivo INESPERADO: %', sqlerrm; end if;
  end;

  -- 2d. de devolvido_fornecedor: envio_manutencao DEVE falhar (mesmo COM chamado do fornecedor:
  --     é a maquina de estados que barra, nao a check MN1)
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, chamado_fornecedor, criado_por)
      values (a, 'envio_manutencao', v_matriz, 'OS-FORN-X', v_prof);
    raise warning '✗ 2d envio_manutencao de devolvido_fornecedor: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then raise notice '✓ 2d envio_manutencao de devolvido_fornecedor rejeitado';
    else raise warning '✗ 2d falhou por motivo INESPERADO: %', sqlerrm; end if;
  end;

  -- 2e. de devolvido_fornecedor: ajuste (valvula de escape) DEVE funcionar
  insert into public.movimentacoes (ativo_id, tipo, filial_id, status_resultante, observacao, criado_por)
    values (a, 'ajuste', v_matriz, 'em_manutencao', 'reabertura para reenvio (teste F14)', v_prof);
  select status into v_status from public.ativos where id = a;
  if v_status = 'em_manutencao' then raise notice '✓ 2e ajuste tira de devolvido_fornecedor (valvula de escape)';
  else raise warning '✗ 2e esperado em_manutencao apos ajuste, obtido %', v_status; end if;

  -- 2f. devolucao_fornecedor de estado que NAO e em_manutencao DEVE falhar
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTEF14002', 'celular', v_matriz);
  select id into b from public.ativos where patrimonio = 'TESTEF14002';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (b, 'compra', v_matriz, v_prof);   -- em_estoque
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, chamado_fornecedor, criado_por)
      values (b, 'devolucao_fornecedor', v_matriz, 'OS-FORN-Z', v_prof);
    raise warning '✗ 2f devolucao_fornecedor de em_estoque: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then raise notice '✓ 2f devolucao_fornecedor de em_estoque rejeitada';
    else raise warning '✗ 2f falhou por motivo INESPERADO: %', sqlerrm; end if;
  end;

  -- ---------------------------------------------------------------
  -- CENARIO 3 (MN2/regra 6) — estorno da devolucao_fornecedor restaura em_manutencao
  --   E NAO apaga o substituto ja criado (imutabilidade). created_at explicitos:
  --   dentro de UMA transacao now() e constante, entao o guard de estorno (ordena
  --   por created_at, id) precisa de ordem real.
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id, fornecedor)
    values ('TESTEF14003', 'notebook', v_matriz, 'Leasing Fic');
  select id into c from public.ativos where patrimonio = 'TESTEF14003';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, created_at)
    values (c, 'compra', v_matriz, v_prof, timestamptz '2026-06-01 10:00:00+00');
  insert into public.movimentacoes (ativo_id, tipo, filial_id, chamado_fornecedor, criado_por, created_at)
    values (c, 'envio_manutencao', v_matriz, 'OS-FORN-9', v_prof, timestamptz '2026-06-01 10:01:00+00'); -- em_manutencao
  insert into public.movimentacoes (ativo_id, tipo, filial_id, chamado_fornecedor, criado_por, created_at)
    values (c, 'devolucao_fornecedor', v_matriz, 'OS-FORN-9', v_prof, timestamptz '2026-06-01 10:02:00+00') -- devolvido
    returning id into v_dev_mov;
  -- substituto (direto) vinculado ao antigo
  insert into public.ativos (patrimonio, categoria, filial_id, fornecedor, origem, substitui_ativo_id)
    values ('TESTEF14003S', 'notebook', v_matriz, 'Leasing Fic', 'cadastro', c)
    returning id into v_sub;
  -- estorno da devolucao (ultima mov efetiva do ANTIGO)
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, estorno_de, created_at)
    values (c, 'estorno', v_matriz, v_prof, v_dev_mov, timestamptz '2026-06-01 10:03:00+00');
  select status into v_status from public.ativos where id = c;
  select count(*) into v_cnt from public.ativos where id = v_sub;
  if v_status = 'em_manutencao' then raise notice '✓ 3a estorno da devolucao_fornecedor restaurou em_manutencao';
  else raise warning '✗ 3a esperado em_manutencao apos estorno, obtido %', v_status; end if;
  if v_cnt = 1 then raise notice '✓ 3b substituto preservado apos o estorno (imutabilidade)';
  else raise warning '✗ 3b substituto sumiu apos estorno (nao deveria)'; end if;

  -- ---------------------------------------------------------------
  -- CENARIO 4 (MN3/MN4) — RPC devolver_ao_fornecedor COM substituto
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id, fornecedor)
    values ('TESTEF14004', 'celular', v_matriz, 'Proprinter Fic');
  select id into d from public.ativos where patrimonio = 'TESTEF14004';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (d, 'compra', v_matriz, v_prof);
  insert into public.movimentacoes (ativo_id, tipo, filial_id, chamado, chamado_fornecedor, criado_por)
    values (d, 'envio_manutencao', v_matriz, '77004', 'OS-FORN-4404', v_prof); -- em_manutencao

  select mov_id, substituto_id, substituto_mov_id
    into v_mov, v_subid, v_submov
    from public.devolver_ao_fornecedor(
      d,
      jsonb_build_object('chamado','77004','chamado_fornecedor','OS-FORN-4404','observacao','sem conserto (teste F14)'),
      jsonb_build_object('patrimonio','TESTEF14004N','service_tag','STF14N','categoria','celular',
                         'marca','Samsung Fic','modelo','Galaxy Fic','filial_id', v_matriz::text),
      v_prof
    );
  select status into v_status from public.ativos where id = d;
  if v_status = 'devolvido_fornecedor' then raise notice '✓ 4a antigo -> devolvido_fornecedor (via RPC)';
  else raise warning '✗ 4a antigo esperado devolvido_fornecedor, obtido %', v_status; end if;

  select status, substitui_ativo_id, fornecedor into v_status, c, v_forn
    from public.ativos where id = v_subid;
  if v_status = 'em_estoque' and c = d then
    raise notice '✓ 4b substituto nasce em_estoque com substitui_ativo_id -> antigo';
  else raise warning '✗ 4b substituto esperado em_estoque/vinculo=antigo, obtido %/%', v_status, c; end if;
  if v_forn = 'Proprinter Fic' then raise notice '✓ 4c fornecedor do substituto HERDADO do antigo (%).', v_forn;
  else raise warning '✗ 4c fornecedor esperado herdado "Proprinter Fic", obtido %', v_forn; end if;
  -- 4d: F15/0047 — o substituto nasce por `troca`, NÃO por `compra` (o equipamento chegou
  -- por substituição do fornecedor, não por compra). A movimentação existe e aparece nas
  -- Entradas do relatório, rotulada "Troca". Espelho da asserção C3.1 de troca.sql (que
  -- também exige count(`compra`)=0 para o substituto). Antes da F15 nascia `compra`; a 0047
  -- trocou o `tipo` na RPC devolver_ao_fornecedor e este roteiro (F14) ficou para trás.
  select count(*) into v_cnt from public.movimentacoes where id = v_submov and ativo_id = v_subid and tipo = 'troca';
  if v_cnt = 1 then raise notice '✓ 4d troca do substituto registrada (aparece nas Entradas como "Troca")';
  else raise warning '✗ 4d troca do substituto ausente (esperado tipo `troca` — F15/0047)'; end if;

  -- ---------------------------------------------------------------
  -- CENARIO 5 (MN3) — colisao patrimonio+service_tag do substituto: ROLLBACK TOTAL
  --   nem a devolucao entra. Pre-cria o ativo que vai colidir.
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id)
    values ('TESTEF14DUP', 'STDUP', 'monitor', v_matriz);
  insert into public.ativos (patrimonio, categoria, filial_id, fornecedor)
    values ('TESTEF14005', 'monitor', v_matriz, 'TechSupply Fic');
  select id into b from public.ativos where patrimonio = 'TESTEF14005';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (b, 'compra', v_matriz, v_prof);
  insert into public.movimentacoes (ativo_id, tipo, filial_id, chamado_fornecedor, criado_por)
    values (b, 'envio_manutencao', v_matriz, 'OS-FORN-5', v_prof); -- em_manutencao
  begin
    perform public.devolver_ao_fornecedor(
      b,
      jsonb_build_object('chamado_fornecedor','OS-FORN-5'),
      jsonb_build_object('patrimonio','TESTEF14DUP','service_tag','STDUP','categoria','monitor'),
      v_prof
    );
    raise warning '✗ 5a colisao do substituto: RPC NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%duplicate key%' or sqlerrm like '%ativos_patrimonio_service_tag%' or sqlerrm like '%unique%' then
      raise notice '✓ 5a colisao do substituto rejeitada: %', sqlerrm;
    else
      raise warning '✗ 5a falhou por motivo INESPERADO: %', sqlerrm;
    end if;
  end;
  select status into v_status from public.ativos where id = b;
  if v_status = 'em_manutencao' then raise notice '✓ 5b rollback total: a devolucao NAO entrou (antigo segue em_manutencao)';
  else raise warning '✗ 5b antigo deveria seguir em_manutencao apos rollback, obtido %', v_status; end if;

  -- ---------------------------------------------------------------
  -- CENARIO 6 (MN3) — RPC SEM substituto (p_substituto null): so a devolucao
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTEF14006', 'desktop', v_matriz);
  select id into d from public.ativos where patrimonio = 'TESTEF14006';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (d, 'compra', v_matriz, v_prof);
  insert into public.movimentacoes (ativo_id, tipo, filial_id, chamado_fornecedor, criado_por)
    values (d, 'envio_manutencao', v_matriz, 'OS-FORN-6', v_prof); -- em_manutencao
  select mov_id, substituto_id, substituto_mov_id
    into v_mov, v_subid, v_submov
    from public.devolver_ao_fornecedor(
      d,
      jsonb_build_object('chamado_fornecedor','OS-FORN-6','observacao','credito/estorno (teste F14)'),
      null,
      v_prof
    );
  select status into v_status from public.ativos where id = d;
  if v_status = 'devolvido_fornecedor' and v_mov is not null and v_subid is null and v_submov is null then
    raise notice '✓ 6 sem substituto: so a devolucao entra (substituto null)';
  else raise warning '✗ 6 esperado devolvido_fornecedor + substituto null, obtido %/sub=%', v_status, v_subid; end if;

  -- ---------------------------------------------------------------
  -- CENARIO 7 (achado da revisão adversarial) — devolucao_fornecedor ZERA o
  --   detentor (espelho de descartado).
  --
  --   ⚠ EMENDA F36 (28/08/2026) — 7a TROCOU DE LADO. Até a F36 o `ajuste` era a
  --   válvula de escape que gravava status_resultante SEM limpar colaborador/setor,
  --   e este cenário afirmava exatamente isso ("ajuste preserva o detentor"). A F36
  --   fez o zeramento perguntar ao ESTADO RESULTANTE (migration 0110,
  --   `status_tem_detentor`): `em_manutencao` é estado SEM dono, então o ajuste
  --   agora LIMPA. A asserção foi invertida em vez de removida — é ela que prova,
  --   aqui, o furo principal que a F36 fechou.
  --
  --   O que 7b prova continua idêntico (devolucao_fornecedor zera). A precondição
  --   dele — um ativo em `em_manutencao` COM detentor — passa a ser plantada à mão,
  --   porque desde a 0110 nenhum caminho de escrita produz esse estado: ele só
  --   existe como DADO LEGADO, anterior à limpeza da 0111. `update` em `ativos` é
  --   operação normal (a guarda_acervo da 0081 só barra DELETE).
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTEF14007', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'TESTEF14007';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'compra', v_matriz, v_prof);
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'saida', 'Fulano Fic', 'TI', v_matriz, v_prof);   -- em_uso (detentor setado)
  insert into public.movimentacoes (ativo_id, tipo, filial_id, status_resultante, observacao, criado_por)
    values (a, 'ajuste', v_matriz, 'em_manutencao', 'forcar manutencao (teste F14)', v_prof);
  select colaborador_atual, setor_atual into v_cf, v_forn from public.ativos where id = a;
  if v_cf is null and v_forn is null then
    raise notice '✓ 7a ajuste para em_manutencao (estado sem dono) ZERA o detentor (F36)';
  else raise warning '✗ 7a ajuste para em_manutencao deveria zerar o detentor (F36), obtido %/%', v_cf, v_forn; end if;
  -- precondição LEGADA de 7b, plantada à mão (ver a emenda acima)
  update public.ativos set colaborador_atual = 'Fulano Fic', setor_atual = 'TI' where id = a;
  insert into public.movimentacoes (ativo_id, tipo, filial_id, chamado_fornecedor, criado_por)
    values (a, 'devolucao_fornecedor', v_matriz, 'OS-FORN-7', v_prof);
  select colaborador_atual, setor_atual into v_cf, v_forn from public.ativos where id = a;
  if v_cf is null and v_forn is null then
    raise notice '✓ 7b devolucao_fornecedor zera colaborador/setor (espelho de descartado)';
  else raise warning '✗ 7b detentor nao zerado apos devolucao: %/%', v_cf, v_forn; end if;

  raise notice '=== fim do roteiro manutencao_fornecedor (procure por ✗ acima; nenhum = tudo passou) ===';
end $$;

rollback;
