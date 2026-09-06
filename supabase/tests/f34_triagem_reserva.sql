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
  v_ok      int := 0;   -- F45: quantas asserções passaram
  v_falhas  int := 0;   -- F45: quantas falharam (a linha FIM soma as duas)
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
    v_ok := v_ok + 1; raise notice '✓ a devolucao de em_uso -> em_estoque (colaborador e setor limpos, F34)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ a devolucao de em_uso: esperado em_estoque/null/null, obtido %/%/%',
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
    v_ok := v_ok + 1; raise notice '✓ b devolucao de emprestado -> em_estoque (F34)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ b devolucao de emprestado: esperado em_estoque, obtido %', v_status;
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
    v_ok := v_ok + 1; raise notice '✓ c devolucao com itens_faltantes: em_estoque E 2 pendencias_item abertas (F34+F18)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ c esperado em_estoque/2 pendencias abertas, obtido %/%', v_status, v_cnt;
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
    v_ok := v_ok + 1; raise notice '✓ d envio_triagem de em_estoque -> em_triagem (F34, opt-in)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ d envio_triagem: esperado em_triagem, obtido %', v_status;
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
    v_falhas := v_falhas + 1; raise warning '✗ e1 envio_triagem de em_uso: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then v_ok := v_ok + 1; raise notice '✓ e1 envio_triagem de em_uso rejeitada: %', sqlerrm;
    else v_falhas := v_falhas + 1; raise warning '✗ e1 falhou por motivo INESPERADO: %', sqlerrm; end if;
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
    v_falhas := v_falhas + 1; raise warning '✗ e2 envio_triagem de emprestado: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then v_ok := v_ok + 1; raise notice '✓ e2 envio_triagem de emprestado rejeitada: %', sqlerrm;
    else v_falhas := v_falhas + 1; raise warning '✗ e2 falhou por motivo INESPERADO: %', sqlerrm; end if;
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
    v_falhas := v_falhas + 1; raise warning '✗ e3 envio_triagem de reservado: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then v_ok := v_ok + 1; raise notice '✓ e3 envio_triagem de reservado rejeitada: %', sqlerrm;
    else v_falhas := v_falhas + 1; raise warning '✗ e3 falhou por motivo INESPERADO: %', sqlerrm; end if;
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
    v_falhas := v_falhas + 1; raise warning '✗ e4 envio_triagem de em_triagem: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then v_ok := v_ok + 1; raise notice '✓ e4 envio_triagem de em_triagem rejeitada: %', sqlerrm;
    else v_falhas := v_falhas + 1; raise warning '✗ e4 falhou por motivo INESPERADO: %', sqlerrm; end if;
  end;

  -- f1 — triagem_ok de em_triagem -> em_estoque CONTINUA valendo (reaproveita o
  -- ativo de e4: o envio_triagem invalido nao mudou o estado, entao `a` segue
  -- em_triagem aqui).
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'triagem_ok', v_matriz, v_prof);
  select status into v_status from public.ativos where id = a;
  if v_status = 'em_estoque' then
    v_ok := v_ok + 1; raise notice '✓ f1 triagem_ok de em_triagem -> em_estoque (continua valendo)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ f1 triagem_ok: esperado em_estoque, obtido %', v_status;
  end if;

  -- f2 — triagem_ok de em_estoque (mesmo ativo, agora fora da triagem): RECUSADO
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
      values (a, 'triagem_ok', v_matriz, v_prof);
    v_falhas := v_falhas + 1; raise warning '✗ f2 triagem_ok de em_estoque: NAO falhou (deveria)';
  exception when others then
    if sqlerrm like '%invalida%' then v_ok := v_ok + 1; raise notice '✓ f2 triagem_ok de em_estoque rejeitada: %', sqlerrm;
    else v_falhas := v_falhas + 1; raise warning '✗ f2 falhou por motivo INESPERADO: %', sqlerrm; end if;
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
    v_ok := v_ok + 1; raise notice '✓ g1 reserva de em_estoque -> reservado (Fulano da Silva Ficticio/TI)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ g1 esperado reservado/Fulano da Silva Ficticio/TI, obtido %/%/%',
      v_status, coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)');
  end if;

  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'reserva', 'Ciclano Ficticio', 'Financeiro', v_matriz, v_prof);    -- RE-RESERVA
  select status, colaborador_atual, setor_atual into v_status, v_colab, v_setor from public.ativos where id = a;
  if v_status = 'reservado' and v_colab = 'Ciclano Ficticio' and v_setor = 'Financeiro' then
    v_ok := v_ok + 1; raise notice '✓ g2 re-reserva: continua reservado, colaborador/setor viram os NOVOS (Ciclano Ficticio/Financeiro)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ g2 esperado reservado/Ciclano Ficticio/Financeiro, obtido %/%/%',
      v_status, coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)');
  end if;

  select count(*) into v_cnt from public.movimentacoes where ativo_id = a and tipo = 'reserva';
  if v_cnt = 2 then
    v_ok := v_ok + 1; raise notice '✓ g3 as duas reservas ficam registradas na linha do tempo (sem estorno/ajuste)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ g3 esperado 2 movimentacoes tipo reserva na linha do tempo, obtido %', v_cnt;
  end if;

  -- h — re-reserva SEM colaborador, inserida DIRETO NA TABELA (por fora do
  -- Zod, como o resto deste roteiro): o TRIGGER aceita e o detentor fica NULO
  -- — aplicar_movimentacao grava colaborador_atual/setor_atual =
  -- new.colaborador/new.setor tal qual vieram no payload da 'reserva' (0109
  -- não muda essa linha); se vierem nulos, o campo zera. Isso CONTINUA
  -- verdade e este cenário deve CONTINUAR passando: o trigger não é o lugar
  -- da regra de negócio "colaborador OU setor" (isso é validação de entrada,
  -- não máquina de estados).
  --
  -- O que mudou é o caminho do APP: na revisão do intervalo F32→F34
  -- (11/08/2026), a reserva ganhou a mesma regra cruzada de saída/empréstimo
  -- no movimentacaoSchema (superRefine, src/lib/validators/movimentacao.ts)
  -- — uma reserva sem colaborador NEM setor agora é RECUSADA antes de chegar
  -- ao banco. Este cenário existe justamente para deixar a assimetria
  -- explícita: quem inserir por fora do app (SQL direto, script, RPC futura
  -- sem essa checagem) ainda apaga o detentor em silêncio — o Zod é a única
  -- barreira, e ela mora na aplicação, não no Postgres.
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'reserva', v_matriz, v_prof);                                     -- sem colaborador/setor
  select status, colaborador_atual, setor_atual into v_status, v_colab, v_setor from public.ativos where id = a;
  if v_status = 'reservado' and v_colab is null and v_setor is null then
    v_ok := v_ok + 1; raise notice '✓ h re-reserva sem colaborador (inserida por fora do app): trigger aceita, detentor fica NULO — o app recusa, o banco não';
  else
    v_falhas := v_falhas + 1; raise warning '✗ h esperado reservado/null/null, obtido %/%/%',
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
    v_ok := v_ok + 1; raise notice '✓ i1 saida de em_triagem -> em_uso (ninguem fica preso na triagem)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ i1 saida de em_triagem: esperado em_uso, obtido %', v_status;
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
    v_ok := v_ok + 1; raise notice '✓ i2 descarte de em_triagem -> descartado';
  else
    v_falhas := v_falhas + 1; raise warning '✗ i2 descarte de em_triagem: esperado descartado, obtido %', v_status;
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
    v_ok := v_ok + 1; raise notice '✓ i3 envio_manutencao de em_triagem -> em_manutencao';
  else
    v_falhas := v_falhas + 1; raise warning '✗ i3 envio_manutencao de em_triagem: esperado em_manutencao, obtido %', v_status;
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
    v_ok := v_ok + 1; raise notice '✓ i4 marcar_defasado de em_triagem -> defasado';
  else
    v_falhas := v_falhas + 1; raise warning '✗ i4 marcar_defasado de em_triagem: esperado defasado, obtido %', v_status;
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
    v_ok := v_ok + 1; raise notice '✓ i5 transferencia de em_triagem: continua em_triagem, muda para linhares';
  else
    v_falhas := v_falhas + 1; raise warning '✗ i5 esperado em_triagem/linhares, obtido %/%', v_status, v_filial;
  end if;

  -- =============================================================
  -- j — ZERAMENTO: por que envio_triagem entrou nas listas de zeramento do
  -- trigger (0109).
  --
  -- ⚠ EMENDA F36 (28/08/2026) — j1 TROCOU DE LADO. Quando este cenário foi
  -- escrito, o `ajuste` era a válvula de escape que gravava status_resultante
  -- direto SEM limpar colaborador/setor, e j1 afirmava isso ("deixa em_estoque
  -- AINDA com detentor"). Era o furo principal da F36: a migration 0110 fez o
  -- zeramento perguntar ao ESTADO RESULTANTE (`status_tem_detentor`), então o
  -- ajuste para `em_estoque` agora LIMPA. j1 passou a afirmar o novo, em vez de
  -- ser apagado — é a prova, aqui, de que o furo fechou.
  --
  -- j2 continua provando o MESMO que provava (envio_triagem não leva detentor
  -- para dentro de em_triagem). Só a precondição mudou de forma: um ativo
  -- `em_estoque` COM detentor não nasce mais de nenhum caminho de escrita — é
  -- DADO LEGADO, anterior à limpeza da 0111 —, então passa a ser plantado à mão.
  -- `update` em `ativos` é operação normal (a guarda_acervo da 0081 só barra
  -- DELETE). Sem a linha da 0109 em `envio_triagem`, ou sem a regra da 0110,
  -- esse detentor legado vazaria para `em_triagem`.
  -- =============================================================
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF34ZER01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF34ZER01';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'saida', 'Detentor Fantasma', 'Comercial', v_matriz, v_prof);       -- em_uso
  insert into public.movimentacoes (ativo_id, tipo, status_resultante, observacao, filial_id, criado_por)
    values (a, 'ajuste', 'em_estoque', 'F34 cenario j: ajuste para estado sem dono (teste)', v_matriz, v_prof);
  select status, colaborador_atual, setor_atual into v_status, v_colab, v_setor from public.ativos where id = a;
  if v_status = 'em_estoque' and v_colab is null and v_setor is null then
    v_ok := v_ok + 1; raise notice '✓ j1 ajuste para em_estoque (estado sem dono) ZERA o detentor (F36)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ j1 esperado em_estoque/null/null, obtido %/%/%',
      v_status, coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)');
  end if;

  -- precondição LEGADA de j2, plantada à mão (ver a emenda acima)
  update public.ativos
     set colaborador_atual = 'Detentor Fantasma', setor_atual = 'Comercial'
   where id = a;

  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'envio_triagem', v_matriz, v_prof);
  select status, colaborador_atual, setor_atual into v_status, v_colab, v_setor from public.ativos where id = a;
  if v_status = 'em_triagem' and v_colab is null and v_setor is null then
    v_ok := v_ok + 1; raise notice '✓ j2 envio_triagem zera o detentor legado (0109/0110: em_triagem nao tem dono)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ j2 esperado em_triagem/null/null, obtido %/%/%',
      v_status, coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)');
  end if;

  raise notice 'FIM f34_triagem_reserva: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

-- Nada acima e persistido:
rollback;
