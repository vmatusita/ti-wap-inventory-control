-- =============================================================
-- Roteiro de teste — TIPO 'troca' + pendência 'sem service tag' (OS-F15, C1/C3).
--
-- Cobre:
--   C3.1  a RPC devolver_ao_fornecedor grava o substituto como 'troca' (não 'compra');
--   C3.2  'troca' só é válida no NASCIMENTO (em_estoque -> em_estoque); de qualquer
--         outro estado a máquina de estados barra (espelho da 'compra');
--   C3.3  estorno de uma 'troca' funciona pelo mecanismo genérico de snapshot;
--   C1.1  a expressão de pendência do import (concat_ws) para as 4 combinações;
--   C1.2  o import (importar_ativos_substituir) end-to-end: ST vazia -> pendência
--         'sem service tag'; patrimônio null + ST vazia -> 'sem patrimônio físico; sem
--         service tag'; com patrimônio E ST -> sem pendência.
--
-- Mesmo padrão de manutencao_fornecedor.sql: auto-verificável (NOTICE '✓' / WARNING
-- '✗'), cenários negativos capturam a exceção e marcam ✓ quando ela acontece, e TUDO
-- roda numa transação que termina em ROLLBACK (nada é gravado). Pré-requisitos
-- (garantidos pelo job `banco` do CI e pelo seed em DEV): >= 1 profile (operador) e as
-- filiais matriz/linhares (migration 0007). Dados 100% fictícios (CLAUDE.md regra 2).
-- =============================================================

begin;

do $$
declare
  v_prof     uuid;
  v_matriz   smallint;
  a uuid; b uuid; c uuid;              -- ids de ativos de teste
  v_status   public.status_ativo;
  v_tipo     public.tipo_movimentacao;
  v_cnt      int;
  v_mov      uuid; v_subid uuid; v_submov uuid;
  v_troca    uuid;
  v_ft       smallint;                 -- filial de teste do import (id livre)
  v_pa       text; v_pb text; v_pc text;
  v_expr     text;
begin
  select id into v_prof from public.profiles limit 1;
  if v_prof is null then
    raise exception 'PRE-REQUISITO: crie ao menos 1 operador (profile) antes de rodar este roteiro';
  end if;

  -- F21: o cenário 5 deste roteiro chama `importar_ativos_substituir`, que passou a exigir
  -- ADMIN (guarda `e_admin()`, migration 0064). Num Postgres novo do CI o perfil de teste
  -- nasce `'operador'` (o backfill da 0061 só alcança quem já existia), então sem esta linha
  -- o roteiro morre com "Apenas administradores podem executar o import de startup."
  -- Promover o perfil é o certo — o import É operação de administrador agora. Dentro de
  -- `begin; … rollback;`, nada sobra.
  update public.profiles set papel = 'admin' where id = v_prof;

  select id into v_matriz from public.filiais where slug = 'matriz';
  if v_matriz is null then
    raise exception 'PRE-REQUISITO: aplique a migration 0007 (filial matriz)';
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 1 (C3) — RPC devolver_ao_fornecedor grava o substituto como 'troca'
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id, fornecedor)
    values ('TESTEF15001', 'celular', v_matriz, 'Proprinter Fic');
  select id into a from public.ativos where patrimonio = 'TESTEF15001';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'compra', v_matriz, v_prof);
  insert into public.movimentacoes (ativo_id, tipo, filial_id, chamado, chamado_fornecedor, criado_por)
    values (a, 'envio_manutencao', v_matriz, '77015', 'OS-FORN-15A', v_prof); -- em_manutencao

  select mov_id, substituto_id, substituto_mov_id
    into v_mov, v_subid, v_submov
    from public.devolver_ao_fornecedor(
      a,
      jsonb_build_object('chamado','77015','chamado_fornecedor','OS-FORN-15A','observacao','sem conserto (teste F15)'),
      jsonb_build_object('patrimonio','TESTEF15001N','service_tag','STF15N','categoria','celular',
                         'marca','Samsung Fic','modelo','Galaxy Fic','filial_id', v_matriz::text),
      v_prof
    );
  select tipo into v_tipo from public.movimentacoes where id = v_submov;
  if v_tipo = 'troca' then
    raise notice '✓ 1a substituto nasce por movimentação `troca` (não `compra`) — via RPC';
  else
    raise warning '✗ 1a esperado tipo `troca` na mov do substituto, obtido %', v_tipo;
  end if;
  select status into v_status from public.ativos where id = v_subid;
  if v_status = 'em_estoque' then
    raise notice '✓ 1b substituto (nascido por troca) fica em_estoque';
  else
    raise warning '✗ 1b substituto esperado em_estoque, obtido %', v_status;
  end if;
  -- nenhuma `compra` foi gravada para o substituto (só a `troca`)
  select count(*) into v_cnt from public.movimentacoes where ativo_id = v_subid and tipo = 'compra';
  if v_cnt = 0 then
    raise notice '✓ 1c o substituto NÃO tem movimentação `compra` (só a `troca`)';
  else
    raise warning '✗ 1c substituto tem % movimentação(ões) `compra` (deveria ser 0)', v_cnt;
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 2 (C3) — 'troca' só no NASCIMENTO (em_estoque -> em_estoque)
  -- ---------------------------------------------------------------
  -- 2a. troca direta num ativo recém-criado (em_estoque) grava e mantém em_estoque
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTEF15002', 'notebook', v_matriz);
  select id into b from public.ativos where patrimonio = 'TESTEF15002';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (b, 'troca', v_matriz, v_prof);
  select status into v_status from public.ativos where id = b;
  if v_status = 'em_estoque' then
    raise notice '✓ 2a troca no nascimento (em_estoque -> em_estoque)';
  else
    raise warning '✗ 2a esperado em_estoque após troca de nascimento, obtido %', v_status;
  end if;

  -- 2b. troca a partir de um estado que NÃO é em_estoque DEVE falhar (inalcançável fora do nascimento)
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTEF15003', 'notebook', v_matriz);
  select id into c from public.ativos where patrimonio = 'TESTEF15003';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (c, 'compra', v_matriz, v_prof);
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (c, 'saida', 'Fulano Fic', 'TI', v_matriz, v_prof); -- em_uso
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
      values (c, 'troca', v_matriz, v_prof);
    raise warning '✗ 2b troca de em_uso: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then raise notice '✓ 2b troca fora do nascimento (de em_uso) rejeitada';
    else raise warning '✗ 2b falhou por motivo INESPERADO: %', sqlerrm; end if;
  end;

  -- ---------------------------------------------------------------
  -- CENARIO 3 (C3) — estorno de uma 'troca' restaura o snapshot (mecanismo genérico)
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTEF15004', 'monitor', v_matriz);
  select id into a from public.ativos where patrimonio = 'TESTEF15004';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, created_at)
    values (a, 'troca', v_matriz, v_prof, timestamptz '2026-07-10 10:00:00+00')
    returning id into v_troca;                                     -- em_estoque (nascimento)
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, estorno_de, created_at)
    values (a, 'estorno', v_matriz, v_prof, v_troca, timestamptz '2026-07-10 10:01:00+00');
  select status into v_status from public.ativos where id = a;
  select count(*) into v_cnt from public.ativos where id = a;
  if v_status = 'em_estoque' and v_cnt = 1 then
    raise notice '✓ 3 estorno da troca restaura o snapshot (em_estoque) sem apagar o ativo';
  else
    raise warning '✗ 3 esperado em_estoque/ativo preservado após estorno da troca, obtido %/cnt=%', v_status, v_cnt;
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 4 (C1.1) — a expressão de pendência do import (concat_ws) nas 4 combinações
  -- ---------------------------------------------------------------
  -- helper inline: mesma expressão da RPC (patrimônio p, serviceTag s)
  -- 4a. com patrimônio e com ST -> null
  select nullif(concat_ws('; ',
      case when 'WAP1' is null then 'sem patrimônio físico' end,
      case when nullif('ST1','') is null then 'sem service tag' end), '') into v_expr;
  if v_expr is null then raise notice '✓ 4a com patrimônio e com ST -> sem pendência (null)';
  else raise warning '✗ 4a esperado null, obtido %', v_expr; end if;
  -- 4b. com patrimônio, sem ST -> 'sem service tag'
  select nullif(concat_ws('; ',
      case when 'WAP2' is null then 'sem patrimônio físico' end,
      case when nullif('','') is null then 'sem service tag' end), '') into v_expr;
  if v_expr = 'sem service tag' then raise notice '✓ 4b com patrimônio, sem ST -> ''sem service tag''';
  else raise warning '✗ 4b esperado ''sem service tag'', obtido %', v_expr; end if;
  -- 4c. sem patrimônio, sem ST -> 'sem patrimônio físico; sem service tag'
  select nullif(concat_ws('; ',
      case when nullif('','') is null then 'sem patrimônio físico' end,
      case when nullif('','') is null then 'sem service tag' end), '') into v_expr;
  if v_expr = 'sem patrimônio físico; sem service tag' then
    raise notice '✓ 4c sem patrimônio E sem ST -> ''sem patrimônio físico; sem service tag''';
  else raise warning '✗ 4c esperado ''sem patrimônio físico; sem service tag'', obtido %', v_expr; end if;
  -- 4d. sem patrimônio, com ST -> 'sem patrimônio físico'
  select nullif(concat_ws('; ',
      case when nullif('','') is null then 'sem patrimônio físico' end,
      case when nullif('ST4','') is null then 'sem service tag' end), '') into v_expr;
  if v_expr = 'sem patrimônio físico' then raise notice '✓ 4d sem patrimônio, com ST -> ''sem patrimônio físico''';
  else raise warning '✗ 4d esperado ''sem patrimônio físico'', obtido %', v_expr; end if;

  -- ---------------------------------------------------------------
  -- CENARIO 5 (C1.2) — import end-to-end: ST vazia importa e nasce com pendência
  -- ---------------------------------------------------------------
  -- filial de teste: id gerado pela identity (GENERATED ALWAYS) — evita colisão em DEV e no CI.
  insert into public.filiais (slug, nome, ativo)
    values ('teste-f15-troca', 'Filial Teste F15', true)
    returning id into v_ft;
  -- contexto de operador para a RPC (usa auth.uid() sem fallback).
  perform set_config('request.jwt.claims', json_build_object('sub', v_prof::text)::text, true);
  perform public.importar_ativos_substituir(
    jsonb_build_object(
      'filialId', v_ft::text, 'totalLinhasDados', 3, 'arquivoHash', 'hash-teste-f15',
      'ativos', jsonb_build_array(
        jsonb_build_object('patrimonio','TESTEF15IA','serviceTag','STF15IA','categoria','notebook','estadoAlvo','em_estoque'),
        jsonb_build_object('patrimonio','TESTEF15IB','serviceTag','','categoria','notebook','estadoAlvo','em_estoque'),
        jsonb_build_object('patrimonio', null,        'serviceTag','','categoria','notebook','estadoAlvo','em_estoque')
      )
    ),
    'backup-teste-f15',
    jsonb_build_object('ativos', 0, 'movimentacoes', 0, 'anotacoes', 0, 'termos', 0),
    '[]'::jsonb
  );
  perform set_config('request.jwt.claims', '', true);  -- não vaza o contexto

  select pendencia into v_pa from public.ativos where filial_id = v_ft and patrimonio = 'TESTEF15IA';
  select pendencia into v_pb from public.ativos where filial_id = v_ft and patrimonio = 'TESTEF15IB';
  select pendencia into v_pc from public.ativos where filial_id = v_ft and patrimonio is null;

  if v_pa is null then raise notice '✓ 5a import com patrimônio E service tag -> sem pendência';
  else raise warning '✗ 5a esperado sem pendência, obtido %', v_pa; end if;
  if v_pb = 'sem service tag' then raise notice '✓ 5b import com patrimônio, sem ST -> ''sem service tag''';
  else raise warning '✗ 5b esperado ''sem service tag'', obtido %', v_pb; end if;
  if v_pc = 'sem patrimônio físico; sem service tag' then
    raise notice '✓ 5c import sem patrimônio E sem ST -> ''sem patrimônio físico; sem service tag''';
  else raise warning '✗ 5c esperado ''sem patrimônio físico; sem service tag'', obtido %', v_pc; end if;

  raise notice '=== fim do roteiro troca (procure por ✗ acima; nenhum = tudo passou) ===';
end $$;

rollback;
