-- =============================================================
-- Roteiro de teste da MAQUINA DE ESTADOS (rodar no SQL editor do projeto DEV).
--
-- Cobre os 6 cenarios da OS-F1 3.2 (+ 4b: regressao do guard de estorno). E
-- auto-verificavel: cada passo emite
--   NOTICE  '✓ ...'  quando o resultado bate com o esperado
--   WARNING '✗ ...'  quando NAO bate (procure por ✗ na aba de mensagens)
-- Os cenarios negativos (2, 4 e 4b) DEVEM falhar — o roteiro captura a excecao e
-- marca ✓ quando ela acontece.
--
-- Tudo roda dentro de uma transacao que termina em ROLLBACK: NADA e gravado no
-- banco. Pre-requisito: existir >= 1 profile (operador) no projeto — o roteiro
-- usa o primeiro como `criado_por`.
--
-- Como ler o resultado: abra a aba "Messages"/"Notices" do SQL editor. Sucesso
-- total = todos os cenarios com ✓ e nenhum ✗.
-- =============================================================

begin;

do $$
declare
  v_prof     uuid;
  v_matriz   smallint;
  v_linhares smallint;
  a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; g uuid;   -- ids dos ativos de teste
  v_transf   uuid;                                   -- id da transferencia (cenario 6)
  v_status   public.status_ativo;
  v_colab    text;
  v_setor    text;
  v_filial   smallint;
  v_pend     text;
  v_cnt      int;
begin
  select id into v_prof from public.profiles limit 1;
  if v_prof is null then
    raise exception 'PRE-REQUISITO: crie ao menos 1 operador (profile) no DEV antes de rodar este roteiro';
  end if;
  select id into v_matriz   from public.filiais where slug = 'matriz';
  select id into v_linhares from public.filiais where slug = 'linhares';
  if v_matriz is null or v_linhares is null then
    raise exception 'PRE-REQUISITO: aplique a migration 0007 (filiais matriz e linhares)';
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 1 — caminho feliz: compra -> saida -> devolucao -> triagem_ok
  -- Esperado: em_estoque -> em_uso -> em_triagem -> em_estoque
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTE0000001', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'TESTE0000001';

  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'compra', v_matriz, v_prof);
  select status into v_status from public.ativos where id = a;
  if v_status = 'em_estoque' then raise notice '✓ 1a compra -> em_estoque';
  else raise warning '✗ 1a compra: esperado em_estoque, obtido %', v_status; end if;

  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'saida', 'Colaborador Teste', 'TI', v_matriz, v_prof);
  select status, colaborador_atual into v_status, v_colab from public.ativos where id = a;
  if v_status = 'em_uso' and v_colab = 'Colaborador Teste' then raise notice '✓ 1b saida -> em_uso (colaborador setado)';
  else raise warning '✗ 1b saida: esperado em_uso/Colaborador Teste, obtido %/%', v_status, v_colab; end if;

  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'devolucao', v_matriz, v_prof);
  select status, colaborador_atual into v_status, v_colab from public.ativos where id = a;
  if v_status = 'em_triagem' and v_colab is null then raise notice '✓ 1c devolucao -> em_triagem (colaborador limpo)';
  else raise warning '✗ 1c devolucao: esperado em_triagem/null, obtido %/%', v_status, v_colab; end if;

  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'triagem_ok', v_matriz, v_prof);
  select status into v_status from public.ativos where id = a;
  if v_status = 'em_estoque' then raise notice '✓ 1d triagem_ok -> em_estoque';
  else raise warning '✗ 1d triagem_ok: esperado em_estoque, obtido %', v_status; end if;

  -- ---------------------------------------------------------------
  -- CENARIO 2 — transicao invalida: saida de ativo em_uso DEVE falhar
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTE0000002', 'notebook', v_matriz);
  select id into b from public.ativos where patrimonio = 'TESTE0000002';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (b, 'saida', 'Colaborador Teste', v_matriz, v_prof);  -- em_uso
  begin
    insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
      values (b, 'saida', 'Outro Teste', v_matriz, v_prof);       -- invalido
    raise warning '✗ 2 saida de em_uso: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then
      raise notice '✓ 2 saida de em_uso rejeitada: %', sqlerrm;
    else
      raise warning '✗ 2 falhou por motivo INESPERADO (nao a maquina de estados): %', sqlerrm;
    end if;
  end;

  -- ---------------------------------------------------------------
  -- CENARIO 3 — estorno da ULTIMA movimentacao restaura estado completo
  --   (status, colaborador, setor, filial). Estornamos uma transferencia.
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTE0000003', 'celular', v_matriz);
  select id into c from public.ativos where patrimonio = 'TESTE0000003';
  -- created_at explicito e crescente: dentro de UMA transacao now() e constante,
  -- entao o guard de estorno (que ordena por created_at) precisa de ordem real.
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por, created_at)
    values (c, 'saida', 'Ciclano Teste', 'RH', v_matriz, v_prof, timestamptz '2026-06-01 10:00:00+00');  -- em_uso @ matriz
  insert into public.movimentacoes (ativo_id, tipo, filial_id, filial_destino_id, criado_por, created_at)
    values (c, 'transferencia', v_matriz, v_linhares, v_prof, timestamptz '2026-06-01 10:01:00+00');       -- em_uso @ linhares
  select id into v_transf from public.movimentacoes
    where ativo_id = c and tipo = 'transferencia' order by created_at desc limit 1;
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, estorno_de)
    values (c, 'estorno', v_linhares, v_prof, v_transf);                -- desfaz a transferencia
  select status, colaborador_atual, setor_atual, filial_id
    into v_status, v_colab, v_setor, v_filial from public.ativos where id = c;
  if v_status = 'em_uso' and v_colab = 'Ciclano Teste' and v_setor = 'RH' and v_filial = v_matriz then
    raise notice '✓ 3 estorno da transferencia restaurou status/colaborador/setor/filial';
  else
    raise warning '✗ 3 estorno: esperado em_uso/Ciclano Teste/RH/matriz, obtido %/%/%/%',
      v_status, v_colab, v_setor, v_filial;
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 4 — estorno de movimentacao ANTIGA (nao-ultima) DEVE falhar
  --   ativo: saida -> devolucao; tenta estornar a SAIDA (a ultima e a devolucao)
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTE0000004', 'monitor', v_matriz);
  select id into d from public.ativos where patrimonio = 'TESTE0000004';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por, created_at)
    values (d, 'saida', 'Beltrano Teste', v_matriz, v_prof, timestamptz '2026-06-01 10:00:00+00');  -- em_uso
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, created_at)
    values (d, 'devolucao', v_matriz, v_prof, timestamptz '2026-06-01 10:01:00+00');                 -- em_triagem
  declare v_saida uuid;
  begin
    select id into v_saida from public.movimentacoes
      where ativo_id = d and tipo = 'saida' order by created_at asc limit 1;
    begin
      insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, estorno_de)
        values (d, 'estorno', v_matriz, v_prof, v_saida);               -- nao-ultima
      raise warning '✗ 4 estorno de mov. antiga: NAO falhou (deveria)';
    exception when others then
      if sqlerrm like '%ultima movimentacao%' then
        raise notice '✓ 4 estorno de mov. antiga rejeitado: %', sqlerrm;
      else
        raise warning '✗ 4 falhou por motivo INESPERADO (nao a regra de estorno): %', sqlerrm;
      end if;
    end;
  end;

  -- ---------------------------------------------------------------
  -- CENARIO 4b — regressao do furo corrigido: saida -> transferencia (ambas
  -- terminam em em_uso). Estorno da SAIDA (nao-ultima) DEVE falhar, mesmo com o
  -- status coincidindo (o proxy antigo por status_resultante deixava passar).
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTE0000007', 'notebook', v_matriz);
  select id into g from public.ativos where patrimonio = 'TESTE0000007';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por, created_at)
    values (g, 'saida', 'Sicrano Teste', v_matriz, v_prof, timestamptz '2026-06-01 10:00:00+00'); -- em_uso
  insert into public.movimentacoes (ativo_id, tipo, filial_id, filial_destino_id, criado_por, created_at)
    values (g, 'transferencia', v_matriz, v_linhares, v_prof, timestamptz '2026-06-01 10:01:00+00'); -- em_uso @ linhares
  declare v_saida_g uuid;
  begin
    select id into v_saida_g from public.movimentacoes where ativo_id = g and tipo = 'saida' limit 1;
    begin
      insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, estorno_de)
        values (g, 'estorno', v_linhares, v_prof, v_saida_g);           -- nao-ultima (mesmo status!)
      raise warning '✗ 4b estorno de saida nao-ultima (mesmo status): NAO falhou (deveria)';
    exception when others then
      if sqlerrm like '%ultima movimentacao%' then
        raise notice '✓ 4b estorno de saida nao-ultima (saida->transferencia) rejeitado: %', sqlerrm;
      else
        raise warning '✗ 4b falhou por motivo INESPERADO: %', sqlerrm;
      end if;
    end;
  end;

  -- ---------------------------------------------------------------
  -- CENARIO 5 — F18 (24/07/2026): a devolucao com itens_faltantes NAO grava mais em
  -- ativos.pendencia (o texto virou linha em pendencias_item — roteiro proprio
  -- pendencias_item.sql) e triagem_ok NAO zera mais o campo. ANTES da F18: 5a exigia
  -- pendencia = 'itens faltantes: carregador, mochila' e 5b exigia null apos
  -- triagem_ok; a OS-F18 inverteu os dois (§A5). O 5c prova o bug §0.1b corrigido:
  -- triagem_ok preserva um trecho alheio (nao apaga o campo inteiro).
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTE0000005', 'notebook', v_matriz);
  select id into e from public.ativos where patrimonio = 'TESTE0000005';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (e, 'saida', 'Fulano Teste', v_matriz, v_prof);              -- em_uso
  insert into public.movimentacoes (ativo_id, tipo, filial_id, itens_faltantes, criado_por)
    values (e, 'devolucao', v_matriz, array['carregador','mochila'], v_prof);
  select pendencia into v_pend from public.ativos where id = e;
  if v_pend is null then
    raise notice '✓ 5a devolucao com itens_faltantes NAO toca ativos.pendencia (F18)';
  else raise warning '✗ 5a pendencia: esperado null (F18), obtido %', v_pend; end if;
  select count(*) into v_cnt from public.pendencias_item where ativo_id = e and status = 'aberta';
  if v_cnt = 2 then raise notice '✓ 5b devolucao criou 2 pendencias_item abertas (F18)';
  else raise warning '✗ 5b esperado 2 pendencias_item abertas, obtido %', v_cnt; end if;
  update public.ativos set pendencia = 'sem patrimônio físico' where id = e;  -- trecho alheio
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (e, 'triagem_ok', v_matriz, v_prof);
  select pendencia into v_pend from public.ativos where id = e;
  if v_pend = 'sem patrimônio físico' then
    raise notice '✓ 5c triagem_ok preserva o trecho alheio de pendencia (F18, bug §0.1b)';
  else raise warning '✗ 5c pendencia: esperado "sem patrimônio físico" (F18), obtido %', coalesce(v_pend,'(null)'); end if;

  -- ---------------------------------------------------------------
  -- CENARIO 6 — transferencia muda filial_id e conta nas DUAS filiais
  --   (mesma logica de union da view v_movimentacoes_mes)
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('TESTE0000006', 'desktop', v_matriz);
  select id into f from public.ativos where patrimonio = 'TESTE0000006';
  -- Data em dezembro/2026: FORA da janela do seed (jan-jul), para isolar esta
  -- transferencia na view v_movimentacoes_mes (nenhuma outra linha nesse mes).
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, filial_destino_id, criado_por)
    values (f, 'transferencia', date '2026-12-15', v_matriz, v_linhares, v_prof);
  select filial_id into v_filial from public.ativos where id = f;
  if v_filial = v_linhares then raise notice '✓ 6a transferencia mudou filial_id p/ linhares';
  else raise warning '✗ 6a filial: esperado linhares, obtido %', v_filial; end if;
  -- Consulta a VIEW real (o artefato entregue): a transferencia deve aparecer
  -- nas DUAS filiais (origem matriz + destino linhares) no mes isolado.
  select count(distinct filial) into v_cnt from public.v_movimentacoes_mes
    where mes = date '2026-12-01' and tipo = 'transferencia' and filial in ('matriz', 'linhares');
  if v_cnt = 2 then raise notice '✓ 6b transferencia aparece nas 2 filiais em v_movimentacoes_mes';
  else raise warning '✗ 6b esperado 2 filiais na view, obtido %', v_cnt; end if;

  raise notice '=== fim do roteiro (procure por ✗ acima; nenhum = tudo passou) ===';
end $$;

-- Nada acima e persistido:
rollback;
