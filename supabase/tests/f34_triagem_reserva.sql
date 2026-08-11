-- =============================================================
-- Roteiro de teste — TRIAGEM OPT-IN e RE-RESERVA (OS-F34, frentes C e D).
-- Arquivo NOVO e INDEPENDENTE: não toca nem depende dos demais roteiros de
-- supabase/tests/ (mesmo precedente do transicoes_extra.sql, F15/F17). Criado
-- dedicado — em vez de crescer transicoes_extra.sql — porque os cenários da F34
-- encadeiam uns nos outros (a re-reserva em g/h reaproveita o mesmo ativo de
-- propósito, para provar a TROCA de detentor) e porque a F34 é fase fechada:
-- um arquivo próprio facilita achar/aposentar o roteiro se a triagem mudar de
-- novo. O CI usa glob supabase/tests/*.sql, então este arquivo entra sozinho.
--
-- Funções vigentes exercitadas (migration 0109, base lida do banco por
-- pg_get_functiondef em 11/08/2026 — ver cabeçalho da própria 0109):
--   * public.status_apos_movimentacao(status, tipo)
--   * trigger public.aplicar_movimentacao()
--
-- Convenção idêntica aos outros roteiros (job `banco` do CI): cada asserção emite
--   NOTICE  '✓ ...'  quando o resultado bate com o esperado
--   WARNING '✗ ...'  quando NÃO bate (o CI falha em qualquer `WARNING: ✗`)
-- Cenários NEGATIVOS (que DEVEM falhar no banco) capturam a exceção e marcam ✓
-- quando ela acontece pelo motivo certo (LIKE no texto do erro).
--
-- Tudo roda dentro de UMA transação que termina em ROLLBACK: NADA é gravado.
-- Pré-requisitos: >= 1 profile (operador) e as filiais matriz/linhares
-- (migration 0007). Dados 100% fictícios (CLAUDE.md regra 2): patrimônios com
-- prefixo único `ZZF34...`, colaboradores "Fulano"/"Ciclano"/"Beltrano"/"Sicrano".
-- =============================================================

begin;

do $$
declare
  v_prof   uuid;
  v_matriz smallint;
  v_lin    smallint;
  a uuid;                              -- ativo de teste corrente
  v_status public.status_ativo;
  v_colab  text;
  v_setor  text;
  v_filial smallint;
  v_cnt    int;
begin
  select id into v_prof from public.profiles limit 1;
  if v_prof is null then
    raise exception 'PRE-REQUISITO: crie ao menos 1 operador (profile) antes de rodar este roteiro';
  end if;
  select id into v_matriz from public.filiais where slug = 'matriz';
  select id into v_lin    from public.filiais where slug = 'linhares';
  if v_matriz is null or v_lin is null then
    raise exception 'PRE-REQUISITO: aplique a migration 0007 (filiais matriz e linhares)';
  end if;

  -- =============================================================
  -- a/b/c — DEVOLUÇÃO passa a resultar em_estoque direto (F34: a triagem virou
  -- opt-in — antes da F34 estes três cenários esperariam em_triagem).
  -- =============================================================

  -- a — devolucao de em_uso -> em_estoque, colaborador E setor limpos
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF34DEV01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF34DEV01';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'saida', 'Fulano Devolucao', 'TI', v_matriz, v_prof);              -- em_uso
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'devolucao', v_matriz, v_prof);
  select status, colaborador_atual, setor_atual into v_status, v_colab, v_setor from public.ativos where id = a;
  if v_status = 'em_estoque' and v_colab is null and v_setor is null then
    raise notice '✓ a devolucao de em_uso -> em_estoque (colaborador e setor limpos, F34)';
  else
    raise warning '✗ a devolucao de em_uso: esperado em_estoque/null/null, obtido %/%/%',
      v_status, coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)');
  end if;

  -- b — devolucao de emprestado -> em_estoque
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF34DEV02', 'celular', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF34DEV02';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (a, 'emprestimo', 'Beltrano Emprestimo', v_matriz, v_prof);            -- emprestado
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'devolucao', v_matriz, v_prof);
  select status into v_status from public.ativos where id = a;
  if v_status = 'em_estoque' then
    raise notice '✓ b devolucao de emprestado -> em_estoque (F34)';
  else
    raise warning '✗ b devolucao de emprestado: esperado em_estoque, obtido %', v_status;
  end if;

  -- c — devolucao COM itens_faltantes: o ativo vai a em_estoque E as
  -- pendencias_item nascem ABERTAS — as duas coisas na MESMA assercao (é o par
  -- que a ordem cobra: F34 muda o status resultante, F18 continua abrindo a
  -- pendencia por item).
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF34DEV03', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF34DEV03';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (a, 'saida', 'Sicrano Itens', v_matriz, v_prof);                       -- em_uso
  insert into public.movimentacoes (ativo_id, tipo, filial_id, itens_faltantes, criado_por)
    values (a, 'devolucao', v_matriz, array['carregador','mouse'], v_prof);
  select status into v_status from public.ativos where id = a;
  select count(*) into v_cnt from public.pendencias_item where ativo_id = a and status = 'aberta';
  if v_status = 'em_estoque' and v_cnt = 2 then
    raise notice '✓ c devolucao com itens_faltantes: em_estoque E 2 pendencias_item abertas (F34+F18)';
  else
    raise warning '✗ c esperado em_estoque/2 pendencias abertas, obtido %/%', v_status, v_cnt;
  end if;

  -- =============================================================
  -- d/e/f — ENVIO_TRIAGEM e TRIAGEM_OK: a triagem opt-in só nasce de
  -- em_estoque, e só ela leva a em_triagem.
  -- =============================================================

  -- d — envio_triagem de em_estoque -> em_triagem
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF34TRI01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF34TRI01';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'envio_triagem', v_matriz, v_prof);
  select status into v_status from public.ativos where id = a;
  if v_status = 'em_triagem' then
    raise notice '✓ d envio_triagem de em_estoque -> em_triagem (F34, opt-in)';
  else
    raise warning '✗ d envio_triagem: esperado em_triagem, obtido %', v_status;
  end if;

  -- e1 — envio_triagem de em_uso: RECUSADO
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF34TRI02', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF34TRI02';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (a, 'saida', 'Fulano Uso', v_matriz, v_prof);                          -- em_uso
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
      values (a, 'envio_triagem', v_matriz, v_prof);
    raise warning '✗ e1 envio_triagem de em_uso: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then raise notice '✓ e1 envio_triagem de em_uso rejeitada: %', sqlerrm;
    else raise warning '✗ e1 falhou por motivo INESPERADO: %', sqlerrm; end if;
  end;

  -- e2 — envio_triagem de emprestado: RECUSADO
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF34TRI03', 'celular', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF34TRI03';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (a, 'emprestimo', 'Ciclano Emprestimo', v_matriz, v_prof);             -- emprestado
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
      values (a, 'envio_triagem', v_matriz, v_prof);
    raise warning '✗ e2 envio_triagem de emprestado: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then raise notice '✓ e2 envio_triagem de emprestado rejeitada: %', sqlerrm;
    else raise warning '✗ e2 falhou por motivo INESPERADO: %', sqlerrm; end if;
  end;

  -- e3 — envio_triagem de reservado: RECUSADO
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF34TRI04', 'monitor', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF34TRI04';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (a, 'reserva', 'Fulano Reserva', v_matriz, v_prof);                    -- reservado
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
      values (a, 'envio_triagem', v_matriz, v_prof);
    raise warning '✗ e3 envio_triagem de reservado: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then raise notice '✓ e3 envio_triagem de reservado rejeitada: %', sqlerrm;
    else raise warning '✗ e3 falhou por motivo INESPERADO: %', sqlerrm; end if;
  end;

  -- e4 — envio_triagem de em_triagem (ja esta la): RECUSADO. O ativo fica
  -- em_triagem (a excecao desfaz só o INSERT que falhou) — reaproveitado no f1.
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF34TRI05', 'desktop', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF34TRI05';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'envio_triagem', v_matriz, v_prof);                                -- em_triagem
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
      values (a, 'envio_triagem', v_matriz, v_prof);
    raise warning '✗ e4 envio_triagem de em_triagem: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then raise notice '✓ e4 envio_triagem de em_triagem rejeitada: %', sqlerrm;
    else raise warning '✗ e4 falhou por motivo INESPERADO: %', sqlerrm; end if;
  end;

  -- f1 — triagem_ok de em_triagem -> em_estoque CONTINUA valendo (reaproveita o
  -- ativo de e4: o envio_triagem invalido nao mudou o estado, entao `a` segue
  -- em_triagem aqui).
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'triagem_ok', v_matriz, v_prof);
  select status into v_status from public.ativos where id = a;
  if v_status = 'em_estoque' then
    raise notice '✓ f1 triagem_ok de em_triagem -> em_estoque (continua valendo)';
  else
    raise warning '✗ f1 triagem_ok: esperado em_estoque, obtido %', v_status;
  end if;

  -- f2 — triagem_ok de em_estoque (mesmo ativo, agora fora da triagem): RECUSADO
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
      values (a, 'triagem_ok', v_matriz, v_prof);
    raise warning '✗ f2 triagem_ok de em_estoque: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then raise notice '✓ f2 triagem_ok de em_estoque rejeitada: %', sqlerrm;
    else raise warning '✗ f2 falhou por motivo INESPERADO: %', sqlerrm; end if;
  end;

  -- =============================================================
  -- g/h — RE-RESERVA (frente D): `reserva` passa a aceitar tambem `reservado`
  -- -> `reservado`, trocando colaborador/setor SEM estorno e SEM ajuste.
  -- =============================================================

  -- g1/g2/g3 — reserva -> re-reserva: prova por ROTEIRO (nao por leitura de
  -- codigo, como a ordem exige) que o ativo continua reservado e que
  -- colaborador_atual/setor_atual passam a ser os NOVOS, com as DUAS reservas
  -- na linha do tempo.
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF34RES01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF34RES01';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'reserva', 'Fulano da Silva Ficticio', 'TI', v_matriz, v_prof);
  select status, colaborador_atual, setor_atual into v_status, v_colab, v_setor from public.ativos where id = a;
  if v_status = 'reservado' and v_colab = 'Fulano da Silva Ficticio' and v_setor = 'TI' then
    raise notice '✓ g1 reserva de em_estoque -> reservado (Fulano da Silva Ficticio/TI)';
  else
    raise warning '✗ g1 esperado reservado/Fulano da Silva Ficticio/TI, obtido %/%/%',
      v_status, coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)');
  end if;

  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'reserva', 'Ciclano Ficticio', 'Financeiro', v_matriz, v_prof);    -- RE-RESERVA
  select status, colaborador_atual, setor_atual into v_status, v_colab, v_setor from public.ativos where id = a;
  if v_status = 'reservado' and v_colab = 'Ciclano Ficticio' and v_setor = 'Financeiro' then
    raise notice '✓ g2 re-reserva: continua reservado, colaborador/setor viram os NOVOS (Ciclano Ficticio/Financeiro)';
  else
    raise warning '✗ g2 esperado reservado/Ciclano Ficticio/Financeiro, obtido %/%/%',
      v_status, coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)');
  end if;

  select count(*) into v_cnt from public.movimentacoes where ativo_id = a and tipo = 'reserva';
  if v_cnt = 2 then
    raise notice '✓ g3 as duas reservas ficam registradas na linha do tempo (sem estorno/ajuste)';
  else
    raise warning '✗ g3 esperado 2 movimentacoes tipo reserva na linha do tempo, obtido %', v_cnt;
  end if;

  -- h — re-reserva SEM colaborador: o detentor fica NULO. Comportamento
  -- HERDADO da reserva original — aplicar_movimentacao grava
  -- colaborador_atual/setor_atual = new.colaborador/new.setor tal qual vieram
  -- no payload da 'reserva' (0109 não muda essa linha); se vierem nulos, o
  -- campo zera. A ordem manda registrar, não "consertar" (ata em DECISOES.md).
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'reserva', v_matriz, v_prof);                                     -- sem colaborador/setor
  select status, colaborador_atual, setor_atual into v_status, v_colab, v_setor from public.ativos where id = a;
  if v_status = 'reservado' and v_colab is null and v_setor is null then
    raise notice '✓ h re-reserva sem colaborador: continua reservado, detentor fica NULO (herdado da reserva)';
  else
    raise warning '✗ h esperado reservado/null/null, obtido %/%/%',
      v_status, coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)');
  end if;

  -- =============================================================
  -- i — o ativo em_triagem CONTINUA podendo sair pelas mesmas portas de sempre
  -- (F34 não fecha nenhuma saida da triagem — ninguem fica preso).
  -- =============================================================

  -- i1 — saida de em_triagem -> em_uso
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF34SAI01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF34SAI01';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'envio_triagem', v_matriz, v_prof);                                -- em_triagem
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (a, 'saida', 'Fulano SaidaTriagem', v_matriz, v_prof);
  select status into v_status from public.ativos where id = a;
  if v_status = 'em_uso' then
    raise notice '✓ i1 saida de em_triagem -> em_uso (ninguem fica preso na triagem)';
  else
    raise warning '✗ i1 saida de em_triagem: esperado em_uso, obtido %', v_status;
  end if;

  -- i2 — descarte de em_triagem -> descartado
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF34DES01', 'monitor', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF34DES01';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'envio_triagem', v_matriz, v_prof);                                -- em_triagem
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'descarte', v_matriz, v_prof);
  select status into v_status from public.ativos where id = a;
  if v_status = 'descartado' then
    raise notice '✓ i2 descarte de em_triagem -> descartado';
  else
    raise warning '✗ i2 descarte de em_triagem: esperado descartado, obtido %', v_status;
  end if;

  -- i3 — envio_manutencao de em_triagem -> em_manutencao
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF34MAN01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF34MAN01';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'envio_triagem', v_matriz, v_prof);                                -- em_triagem
  insert into public.movimentacoes (ativo_id, tipo, filial_id, chamado_fornecedor, criado_por)
    values (a, 'envio_manutencao', v_matriz, 'OS-FIC-F34', v_prof);
  select status into v_status from public.ativos where id = a;
  if v_status = 'em_manutencao' then
    raise notice '✓ i3 envio_manutencao de em_triagem -> em_manutencao';
  else
    raise warning '✗ i3 envio_manutencao de em_triagem: esperado em_manutencao, obtido %', v_status;
  end if;

  -- i4 — marcar_defasado de em_triagem -> defasado
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF34DEF01', 'celular', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF34DEF01';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'envio_triagem', v_matriz, v_prof);                                -- em_triagem
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'marcar_defasado', v_matriz, v_prof);
  select status into v_status from public.ativos where id = a;
  if v_status = 'defasado' then
    raise notice '✓ i4 marcar_defasado de em_triagem -> defasado';
  else
    raise warning '✗ i4 marcar_defasado de em_triagem: esperado defasado, obtido %', v_status;
  end if;

  -- i5 — transferencia de em_triagem: permanece em_triagem, muda de filial
  -- (o tipo transferencia É de filial, e a F34 não o toca — status_apos_movimentacao
  -- devolve o proprio p_status para qualquer estado fora do terminal de baixa).
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF34TRF01', 'desktop', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF34TRF01';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'envio_triagem', v_matriz, v_prof);                                -- em_triagem
  insert into public.movimentacoes (ativo_id, tipo, filial_id, filial_destino_id, criado_por)
    values (a, 'transferencia', v_matriz, v_lin, v_prof);
  select status, filial_id into v_status, v_filial from public.ativos where id = a;
  if v_status = 'em_triagem' and v_filial = v_lin then
    raise notice '✓ i5 transferencia de em_triagem: continua em_triagem, muda para linhares';
  else
    raise warning '✗ i5 esperado em_triagem/linhares, obtido %/%', v_status, v_filial;
  end if;

  -- =============================================================
  -- j — ZERAMENTO: por que envio_triagem entrou nas listas de zeramento do
  -- trigger (0109). O `ajuste` é a válvula de escape que grava status_resultante
  -- direto SEM limpar colaborador/setor — é o ÚNICO caminho que deixa um ativo
  -- em_estoque AINDA com detentor. Sem a linha nova na 0109, um envio_triagem
  -- levaria esse detentor para dentro de em_triagem, estado que por desenho não
  -- tem dono.
  -- =============================================================
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF34ZER01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF34ZER01';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'saida', 'Detentor Fantasma', 'Comercial', v_matriz, v_prof);       -- em_uso
  insert into public.movimentacoes (ativo_id, tipo, status_resultante, observacao, filial_id, criado_por)
    values (a, 'ajuste', 'em_estoque', 'F34 cenario j: forca em_estoque com detentor preso (teste)', v_matriz, v_prof);
  select status, colaborador_atual into v_status, v_colab from public.ativos where id = a;
  if v_status = 'em_estoque' and v_colab = 'Detentor Fantasma' then
    raise notice '✓ j1 ajuste deixa o ativo em_estoque AINDA com detentor (precondicao do cenario)';
  else
    raise warning '✗ j1 precondicao: esperado em_estoque/Detentor Fantasma, obtido %/%',
      v_status, coalesce(v_colab, '(null)');
  end if;

  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'envio_triagem', v_matriz, v_prof);
  select status, colaborador_atual, setor_atual into v_status, v_colab, v_setor from public.ativos where id = a;
  if v_status = 'em_triagem' and v_colab is null and v_setor is null then
    raise notice '✓ j2 envio_triagem zera o detentor preso pelo ajuste (0109: em_triagem nao tem dono)';
  else
    raise warning '✗ j2 esperado em_triagem/null/null, obtido %/%/%',
      v_status, coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)');
  end if;

  raise notice '=== fim do roteiro f34_triagem_reserva (procure por ✗ acima; nenhum = tudo passou) ===';
end $$;

-- Nada acima e persistido:
rollback;
