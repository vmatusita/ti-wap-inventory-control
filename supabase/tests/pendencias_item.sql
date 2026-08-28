-- =============================================================
-- Roteiro de teste: PENDÊNCIA DE ITEM FALTANTE por movimentação (F18, 0050–0053).
--
-- Prova o ciclo novo no trigger aplicar_movimentacao (0051) e na tabela
-- pendencias_item (0050): a devolução com itens marcados vira UMA linha ABERTA por
-- item (atada à movimentação e ao colaborador da ÉPOCA); triagem_ok não mexe em
-- nada; a saída seguinte não cria nem limpa; o estorno remove as linhas; a
-- resolução grava desfecho/quem/quando; e o caminho de import não abre pendência.
--
-- Convenção igual aos demais roteiros: cada passo emite
--   NOTICE  '✓ ...'  quando bate com o esperado
--   WARNING '✗ ...'  quando NÃO bate (o job `banco` do CI falha em qualquer
--                     `WARNING: ✗`).
-- Tudo em transação com ROLLBACK: nada é gravado. Pré-requisito: >= 1 profile
-- (o CI cria o operador ci@wap.ind.br) e as filiais da 0007.
-- =============================================================

begin;

do $$
declare
  v_prof uuid; v_mat smallint;
  a uuid; b uuid; c uuid; d uuid;
  v_dev uuid; v_pend text; v_n int; v_colab text; v_item text;
  v_status text; v_desf text; v_por uuid; v_em timestamptz;
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
    raise exception 'PRE-REQUISITO: crie ao menos 1 operador (profile) antes de rodar';
  end if;
  select id into v_mat from public.filiais where slug = 'matriz';
  if v_mat is null then
    raise exception 'PRE-REQUISITO: aplique a migration 0007 (filial matriz)';
  end if;

  -- ---------------------------------------------------------------
  -- 1 — devolução com 2 itens cria 2 ABERTAS ligadas à movimentação,
  --     com o colaborador da ÉPOCA, e NÃO toca ativos.pendencia.
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTE0018001', 'notebook', v_mat) returning id into a;
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'compra', v_mat, v_prof);
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (a, 'saida', 'Fulano Teste', v_mat, v_prof);
  insert into public.movimentacoes (ativo_id, tipo, filial_id, itens_faltantes, criado_por)
    values (a, 'devolucao', v_mat, array['Mochila','Carregador'], v_prof) returning id into v_dev;

  select count(*), max(colaborador) into v_n, v_colab
    from public.pendencias_item where movimentacao_id = v_dev and status = 'aberta';
  if v_n = 2 then raise notice '✓ 1a devolução com 2 itens criou 2 abertas';
  else raise warning '✗ 1a esperado 2 abertas, obtido %', v_n; end if;

  if v_colab = 'Fulano Teste' then raise notice '✓ 1b colaborador da época gravado (Fulano)';
  else raise warning '✗ 1b colaborador: esperado Fulano Teste, obtido %', coalesce(v_colab,'(null)'); end if;

  select count(*) into v_n from public.pendencias_item
    where movimentacao_id = v_dev and item in ('Mochila','Carregador');
  if v_n = 2 then raise notice '✓ 1c os dois itens do array viraram linha';
  else raise warning '✗ 1c itens esperados 2, obtido %', v_n; end if;

  select pendencia into v_pend from public.ativos where id = a;
  if v_pend is null then raise notice '✓ 1d ativos.pendencia intacto na devolução (não vira "itens faltantes")';
  else raise warning '✗ 1d ativos.pendencia deveria seguir null, obtido %', v_pend; end if;

  -- ---------------------------------------------------------------
  -- 2 — devolução SEM item marcado não cria nada.
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTE0018002', 'monitor', v_mat) returning id into b;
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (b, 'saida', 'Beltrano Teste', v_mat, v_prof);
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (b, 'devolucao', v_mat, v_prof) returning id into v_dev;
  select count(*) into v_n from public.pendencias_item where movimentacao_id = v_dev;
  if v_n = 0 then raise notice '✓ 2 devolução sem item marcado não criou linha';
  else raise warning '✗ 2 esperado 0 linhas, obtido %', v_n; end if;

  -- ---------------------------------------------------------------
  -- 3 — triagem_ok NÃO mexe nas abertas NEM em ativos.pendencia (plantamos
  --     'sem patrimônio físico' antes e conferimos que SOBREVIVE — o bug latente
  --     do §0.1b, que zerava o campo inteiro, está corrigido).
  --     F34 (11/08/2026): a devolução do passo 1 agora termina em_estoque (não
  --     mais em_triagem — a triagem virou OPT-IN), então precisamos de um
  --     envio_triagem manual antes do triagem_ok para a transição continuar
  --     válida. Sem isto o triagem_ok abortaria o do-block e os Cenários 4 a 8
  --     nunca rodariam.
  -- ---------------------------------------------------------------
  update public.ativos set pendencia = 'sem patrimônio físico' where id = a;  -- ativo do passo 1 (em_estoque, F34)
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'envio_triagem', v_mat, v_prof);
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'triagem_ok', v_mat, v_prof);
  select pendencia into v_pend from public.ativos where id = a;
  if v_pend = 'sem patrimônio físico' then raise notice '✓ 3a triagem_ok preservou o trecho alheio de pendencia';
  else raise warning '✗ 3a esperado "sem patrimônio físico", obtido %', coalesce(v_pend,'(null)'); end if;
  select count(*) into v_n from public.pendencias_item where ativo_id = a and status = 'aberta';
  if v_n = 2 then raise notice '✓ 3b triagem_ok não mexeu nas 2 abertas';
  else raise warning '✗ 3b esperado 2 abertas após triagem_ok, obtido %', v_n; end if;

  -- ---------------------------------------------------------------
  -- 4 — saída SEGUINTE do mesmo ativo (agora em_estoque) para OUTRA pessoa não
  --     cria nem limpa; a pendência continua apontando a pessoa ANTIGA (Fulano).
  -- ---------------------------------------------------------------
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (a, 'saida', 'Sicrano Novo Dono', v_mat, v_prof);
  select count(*), max(colaborador) into v_n, v_colab
    from public.pendencias_item where ativo_id = a and status = 'aberta';
  if v_n = 2 and v_colab = 'Fulano Teste' then
    raise notice '✓ 4 saída p/ novo dono não mexe: 2 abertas ainda apontam Fulano (não Sicrano)';
  else raise warning '✗ 4 esperado 2 abertas/Fulano, obtido %/%', v_n, coalesce(v_colab,'(null)'); end if;

  -- ---------------------------------------------------------------
  -- 5 — estorno da devolução REMOVE as linhas dela (inverso simétrico).
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTE0018005', 'celular', v_mat) returning id into c;
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por, created_at)
    values (c, 'saida', 'Ciclano Teste', v_mat, v_prof, now() - interval '2 min');
  insert into public.movimentacoes (ativo_id, tipo, filial_id, itens_faltantes, criado_por, created_at)
    values (c, 'devolucao', v_mat, array['mochila'], v_prof, now() - interval '1 min') returning id into v_dev;
  select count(*) into v_n from public.pendencias_item where movimentacao_id = v_dev;
  if v_n = 1 then raise notice '✓ 5a devolução criou 1 linha (pré-estorno)';
  else raise warning '✗ 5a esperado 1, obtido %', v_n; end if;
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, estorno_de)
    values (c, 'estorno', v_mat, v_prof, v_dev);
  select count(*) into v_n from public.pendencias_item where movimentacao_id = v_dev;
  if v_n = 0 then raise notice '✓ 5b estorno removeu a linha da devolução';
  else raise warning '✗ 5b esperado 0 após estorno, obtido %', v_n; end if;

  -- ---------------------------------------------------------------
  -- 6 — resolução (simula a Server Action resolverPendenciaItem): UPDATE grava
  --     status/desfecho/quem/quando e a CHECK do ciclo ACEITA (não estoura).
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTE0018006', 'notebook', v_mat) returning id into d;
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (d, 'saida', 'Deltrano Teste', v_mat, v_prof);
  insert into public.movimentacoes (ativo_id, tipo, filial_id, itens_faltantes, criado_por)
    values (d, 'devolucao', v_mat, array['mouse pad'], v_prof) returning id into v_dev;
  update public.pendencias_item
    set status = 'resolvida', desfecho = 'baixa', observacao = 'não vai voltar (teste)',
        resolvida_em = now(), resolvida_por = v_prof
    where movimentacao_id = v_dev and status = 'aberta';
  select status, desfecho, resolvida_por, resolvida_em
    into v_status, v_desf, v_por, v_em
    from public.pendencias_item where movimentacao_id = v_dev;
  if v_status = 'resolvida' and v_desf = 'baixa' and v_por = v_prof and v_em is not null then
    raise notice '✓ 6 resolução gravou desfecho/quem/quando (status resolvida, baixa)';
  else raise warning '✗ 6 resolução: obtido %/%/%/%', v_status, v_desf, coalesce(v_por::text,'(null)'), coalesce(v_em::text,'(null)'); end if;

  -- ---------------------------------------------------------------
  -- 7 — caminho de IMPORT não abre pendência de item. O import
  --     (importar_ativos_substituir) cria SÓ 'compra' e 'ajuste' — NUNCA
  --     'devolucao' (medido 24/07/2026) —, então nenhum caminho de import chega
  --     ao ramo que gera linha. Provamos que compra/ajuste marcados 'import
  --     startup' não criam pendencias_item.
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id, origem)
    values ('TESTE0018007', 'notebook', v_mat, 'importacao') returning id into b;
  insert into public.movimentacoes (ativo_id, tipo, filial_id, observacao, criado_por)
    values (b, 'compra', v_mat, 'import startup 20/07/2026', v_prof);
  insert into public.movimentacoes (ativo_id, tipo, status_resultante, observacao, filial_id, criado_por)
    values (b, 'ajuste', 'em_uso', 'import startup 20/07/2026', v_mat, v_prof);
  select count(*) into v_n from public.pendencias_item where ativo_id = b;
  if v_n = 0 then raise notice '✓ 7 import (compra+ajuste marcados) não abriu pendência de item';
  else raise warning '✗ 7 import abriu % pendência(s) de item (deveria 0)', v_n; end if;

  -- ---------------------------------------------------------------
  -- 8 — estorno NÃO ressuscita o texto LEGADO 'itens faltantes' (F18 §A2). Uma
  --     movimentação cujo snapshot capturou o texto antigo, ao ser estornada,
  --     restaura os DEMAIS trechos mas NÃO o de itens (que virou pendencias_item).
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTE0018008', 'notebook', v_mat) returning id into b;
  -- created_at explícito e crescente: dentro de UMA transação now() é constante, e o
  -- guard de estorno desempata por id (gen_random_uuid é aleatório, não monotônico).
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por, created_at)
    values (b, 'saida', 'Egidio Teste', v_mat, v_prof, timestamptz '2026-06-01 09:00:00+00');  -- em_uso
  -- simula o campo livre LEGADO (pré-F18 o trigger gravava 'itens faltantes: …')
  update public.ativos set pendencia = 'itens faltantes: mochila; sem patrimônio físico' where id = b;
  -- um ajuste captura esse texto no snapshot (e não toca pendencia)
  insert into public.movimentacoes (ativo_id, tipo, status_resultante, observacao, filial_id, criado_por, created_at)
    values (b, 'ajuste', 'em_uso', 'teste', v_mat, v_prof, timestamptz '2026-06-01 09:01:00+00') returning id into v_dev;
  -- estorna o ajuste (última mov) → restaura SEM o trecho de itens
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, estorno_de, created_at)
    values (b, 'estorno', v_mat, v_prof, v_dev, timestamptz '2026-06-01 09:02:00+00');
  select pendencia into v_pend from public.ativos where id = b;
  if v_pend = 'sem patrimônio físico' then
    raise notice '✓ 8 estorno restaura sem ressuscitar "itens faltantes" (F18 §A2)';
  else raise warning '✗ 8 pendencia: esperado "sem patrimônio físico", obtido %', coalesce(v_pend,'(null)'); end if;

  raise notice '=== fim do roteiro pendencias_item (procure por ✗ acima; nenhum = tudo passou) ===';
end $$;

rollback;
