-- =============================================================
-- Roteiro de teste: A RESTAURAÇÃO DE UM BACKUP (F54, 09/09/2026)
--
-- Roda no job `banco-sem-docker` do CI (psql, ON_ERROR_STOP=1). Convenção da pasta:
--   NOTICE  '✓ ...'  quando a invariante bate
--   WARNING '✗ ...'  quando NÃO bate (o job falha em qualquer `WARNING: ✗`)
--
-- O QUE ELE DEFENDE. Até a F54 a restauração não existia — nem em código, nem em
-- desenho, e nunca se restaurou nada. Um backup que ninguém sabe restaurar é um
-- arquivo, não um backup. Este roteiro é a metade MECÂNICA da prova: ele exercita,
-- contra um Postgres descartável, cada obstáculo que o restaurador enfrenta, e
-- transforma em asserção o que de outro modo seria um parágrafo no runbook.
--
-- ⚠ O QUE ELE NÃO PROVA, e é bom que esteja escrito aqui: nada sobre STORAGE. O
-- `bootstrap-storage.sql` do CI cria o SCHEMA `storage`, não o SERVIÇO — não há API
-- de Storage aqui, então o `.docx` não pode ser exercitado. Essa metade foi provada
-- UMA VEZ, à mão, no projeto de ensaio, e a saída está em `docs/f54-evidencias/`.
--
-- AS DUAS ARMADILHAS QUE A F53 DEIXOU DE HERANÇA, e que aqui viram asserção:
--   (i)  `movimentacoes.ordem` é `generated always as identity` — sem
--        `overriding system value` o INSERT do restaurador é RECUSADO;
--   (ii) COM ele a SEQUÊNCIA não avança — e sem `setval` depois, a primeira
--        movimentação registrada DEPOIS da restauração viola
--        `movimentacoes_ordem_uidx`. O sintoma aparece na cara do operador, dias
--        depois, e não no restore.
-- A ata 1 da F53 registra as duas com todas as letras ("Custo herdado pela F54").
--
-- E A TERCEIRA, que a ficha da F54 previu e a medição confirmou: o trigger
-- `trg_aplicar_movimentacao` é BEFORE INSERT e não só recalcula `ativos`, ele
-- INSERE `pendencias_item` sozinho (numa `devolucao` com itens faltantes). Restaurar
-- com o trigger ligado não é "deixar a máquina de estados derivar": é duplicar a
-- pendência que o backup já trazia. Por isso a Decisão 7 desligou o trigger.
--
-- ESCREVE — precisa de `begin/rollback`. Nenhum dado real: patrimônio, service tag e
-- nomes são fictícios (regra 2 do CLAUDE.md).
-- =============================================================

begin;

do $$
declare
  v_ok      int := 0;
  v_falhas  int := 0;

  k_autor   constant uuid := '54000000-0000-4000-8000-000000000001';
  v_f1      smallint;
  v_ativo   uuid;
  v_mov_a   uuid;
  v_mov_s   uuid;
  -- O id da SONDA do cenario 2a: proprio, para que um INSERT que passe (a mutacao)
  -- nao colida com a restauracao literal do 2b.
  v_sonda   constant uuid := '54000000-0000-4000-8000-0000000000a2';
  v_mov_b   uuid;

  -- O "backup": o retrato que o restaurador teria em mãos.
  v_bkp_status      public.status_ativo;
  v_bkp_ordem_a     bigint;
  v_bkp_ordem_s     bigint;
  v_bkp_ordem_b     bigint;
  v_bkp_pendencias  int;

  v_n        int;
  v_universo int;
  v_st       public.status_ativo;
  v_ordem    bigint;
  v_erro     text;
  v_seq      text;

  -- F56 · Frente F (0140) — cenários 6 e 7: a versão 2 do backup, que o
  -- restaurador aprende a religar (os dois elos de lancamentos_item e o
  -- ponteiro de substituto).
  v_item6    smallint;
  v_pend6    uuid;
  v_lanc6    uuid;
  v_mid6     uuid;
  v_pid6     uuid;
  v_ativo_sub7 uuid;
  v_sub7       uuid;

  -- F63 (0160/0161) — cenário 8: o backup de ANTES da F63 (sem a chave `empresa_id`) e o de
  -- DEPOIS (com ela). Ids próprios, para não colidir com nada acima.
  v_ativo8a  constant uuid := '63000000-0000-4000-8000-0000000008a1';
  v_ativo8b  constant uuid := '63000000-0000-4000-8000-0000000008b1';
  v_anot8b   constant uuid := '63000000-0000-4000-8000-0000000008b2';
  v_emp8     uuid;
  v_e8a      uuid;
  v_e8b      uuid;
  v_e8c      uuid;
begin
  select id into v_f1 from public.filiais where ativo order by id limit 1;
  if v_f1 is null then
    -- ⚠ `raise exception`, e NÃO um `return` com a linha FIM. O molde da F45 exige UMA
    -- linha FIM por roteiro, e ela tem de ser a última instrução do bloco — uma segunda,
    -- num atalho de saída, quebra a regra (medido: `ci-passos.test.ts` reprovou a
    -- primeira versão deste arquivo por exatamente isso). Abortando alto, o roteiro não
    -- emite FIM nenhum e o runner o marca como "abortou antes do fim", que é o veredito
    -- correto para "o cenário não pôde ser montado".
    raise exception 'restauracao: o banco precisa de ao menos UMA filial ativa para este roteiro';
  end if;

  -- O trigger `handle_new_user` cria o profile (e exige domínio corporativo — 0041/0057).
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values (k_autor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'f54.restauracao@wap.ind.br', '', now(), now(), now());

  v_seq := pg_get_serial_sequence('public.movimentacoes', 'ordem');

  -- =========================================================================
  -- O CENÁRIO: um ativo que foi comprado, entregue e devolvido com item faltando.
  -- A `devolucao` com `itens_faltantes` é escolhida de propósito: é ela que faz o
  -- trigger INSERIR `pendencias_item`, que é o cenário 3c.
  -- =========================================================================
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0054001', 'F54REST', 'notebook', v_f1, 'cadastro')
  returning id into v_ativo;

  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
  values (v_ativo, 'compra', current_date - 30, v_f1, k_autor, now() - interval '30 days')
  returning id into v_mov_a;

  -- A SAÍDA existe porque a máquina de estados exige: `devolucao` só é válida a partir
  -- de `em_uso`/`emprestado`. Descobri isso rodando o roteiro contra o ensaio, e não
  -- lendo — o cenário original ia direto de `em_estoque` para `devolucao` e a RPC
  -- recusou, o que é a máquina fazendo o trabalho dela.
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at, colaborador)
  values (v_ativo, 'saida', current_date - 20, v_f1, k_autor, now() - interval '20 days',
          'Fulano de Teste')
  returning id into v_mov_s;

  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at,
                                    colaborador, itens_faltantes)
  values (v_ativo, 'devolucao', current_date - 2, v_f1, k_autor, now() - interval '2 days',
          'Fulano de Teste', array['carregador'])
  returning id into v_mov_b;

  -- ---- 1a. O CENÁRIO EXISTE ------------------------------------------------
  -- A forma que RECUSA universo vazio (F45). Um roteiro de restauração que rodasse
  -- sobre banco vazio passaria verde sem provar nada — e é exatamente o modo de
  -- falha desta frente.
  select count(*) into v_universo from public.movimentacoes where ativo_id = v_ativo;
  select count(*) into v_n from public.movimentacoes
   where ativo_id = v_ativo and ordem is null;
  if pg_temp.assert_zero_de('1a cenário montado, toda movimentação com `ordem`', v_n, v_universo)
  then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- O RETRATO que o backup guardaria.
  select status into v_bkp_status from public.ativos where id = v_ativo;
  select ordem into v_bkp_ordem_a from public.movimentacoes where id = v_mov_a;
  select ordem into v_bkp_ordem_s from public.movimentacoes where id = v_mov_s;
  select ordem into v_bkp_ordem_b from public.movimentacoes where id = v_mov_b;
  select count(*) into v_bkp_pendencias from public.pendencias_item where ativo_id = v_ativo;

  if v_bkp_pendencias = 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 1b o trigger criou 1 pendência de item (é ela que o cenário 3c duplica)';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 1b esperava 1 pendência criada pelo trigger, veio %', v_bkp_pendencias;
  end if;

  -- =========================================================================
  -- O RESET: apagar o recorte, como uma das RPCs destrutivas faria.
  -- Precisa da janela — `guarda_acervo` (0081) recusa DELETE, inclusive do postgres.
  -- =========================================================================
  perform set_config('estoque.dev_destrutivo', 'on', true);
  delete from public.pendencias_item where ativo_id = v_ativo;
  delete from public.movimentacoes    where ativo_id = v_ativo;
  delete from public.ativos           where id = v_ativo;
  perform set_config('estoque.dev_destrutivo', 'off', true);

  -- ⚠ A QUARTA ARMADILHA, que nenhuma ficha previu e que só apareceu ao RODAR isto
  -- contra o ensaio: `set constraints all immediate` é OBRIGATÓRIO antes de mexer nos
  -- gatilhos da tabela.
  --
  -- `pendencias_item.movimentacao_id` é uma FK `DEFERRABLE INITIALLY DEFERRED` — a
  -- única deferrável do acervo. Enquanto a transação tiver eventos de constraint
  -- pendentes sobre `movimentacoes`, o Postgres RECUSA o `alter table … disable
  -- trigger` com `55006: cannot ALTER TABLE … because it has pending trigger events`.
  -- O restaurador de verdade evita isso desligando o trigger ANTES de qualquer DML;
  -- aqui, onde o "reset" e a restauração convivem na MESMA transação, a saída é
  -- descarregar as constraints agora.
  set constraints all immediate;

  -- =========================================================================
  -- 2 — `overriding system value` e `setval`: as duas armadilhas da ata 1 da F53
  -- =========================================================================

  -- ---- 4a. A ORDEM DE INSERÇÃO (feita aqui porque tudo abaixo depende dela) --
  -- ativos → movimentacoes → pendencias_item. Invertê-la viola FK.
  begin
    insert into public.ativos (id, patrimonio, service_tag, categoria, filial_id, origem, status)
    values (v_ativo, 'WAP0054001', 'F54REST', 'notebook', v_f1, 'cadastro', 'em_estoque');
    v_ok := v_ok + 1;
    raise notice '✓ 4a `ativos` entra primeiro, sem violar FK';
  exception when others then
    v_falhas := v_falhas + 1;
    get stacked diagnostics v_erro = message_text;
    raise warning '✗ 4a a reinserção de `ativos` falhou: %', v_erro;
  end;

  -- ---- 2a. SEM `overriding system value` o INSERT é RECUSADO ---------------
  -- É a primeira parede que o restaurador ingênuo encontra, e ela é BOA: falha alto
  -- e cedo. A ruim é a de baixo (2c), que falha baixo e tarde.
  -- ⚠ A SONDA USA UM ID PRÓPRIO, E LIMPA O QUE ELA MESMA DEIXAR. O motivo foi MEDIDO
  -- pelo injetor de mutações, não previsto: com a mutação
  -- `ordem-deixa-de-ser-generated-always` a coluna vira `by default`, este INSERT
  -- PASSA (que é o defeito, e o `2a` cai como devia) — mas, usando `v_mov_a`, ele
  -- deixava a linha na tabela, e o `2b` logo abaixo colidia na chave primária. O
  -- roteiro MORRIA no meio, sem emitir a linha `FIM`, e o injetor reportava
  -- "roteiro abortou" em vez de "mutação detectada". Uma asserção que derruba o
  -- roteiro inteiro converte um diagnóstico certo no diagnóstico errado.
  begin
    insert into public.movimentacoes (id, ordem, ativo_id, tipo, data, filial_id, criado_por, created_at)
    values (v_sonda, v_bkp_ordem_a, v_ativo, 'compra', current_date - 30, v_f1, k_autor,
            now() - interval '30 days');
    v_falhas := v_falhas + 1;
    raise warning '✗ 2a o INSERT com `ordem` explícita PASSOU sem `overriding system value` — a coluna deixou de ser `generated always`, e o restaurador da F54 está escrito para um banco que não existe mais';
    -- Limpa a sonda para que o resto do roteiro rode e a linha FIM saia.
    perform set_config('estoque.dev_destrutivo', 'on', true);
    delete from public.movimentacoes where id = v_sonda;
    perform set_config('estoque.dev_destrutivo', 'off', true);
  exception when generated_always then
    v_ok := v_ok + 1;
    raise notice '✓ 2a sem `overriding system value` o INSERT é RECUSADO (generated always)';
  end;

  -- ---- 2b. COM ele, a `ordem` do backup é PRESERVADA -----------------------
  -- Desligando o trigger antes (Decisão 7): ver a seção 3.
  alter table public.movimentacoes disable trigger trg_aplicar_movimentacao;

  insert into public.movimentacoes (id, ordem, ativo_id, tipo, data, filial_id, criado_por, created_at,
                                    status_anterior, status_resultante)
  overriding system value
  values (v_mov_a, v_bkp_ordem_a, v_ativo, 'compra', current_date - 30, v_f1, k_autor,
          now() - interval '30 days', null, 'em_estoque');

  insert into public.movimentacoes (id, ordem, ativo_id, tipo, data, filial_id, criado_por, created_at,
                                    colaborador, status_anterior, status_resultante)
  overriding system value
  values (v_mov_s, v_bkp_ordem_s, v_ativo, 'saida', current_date - 20, v_f1, k_autor,
          now() - interval '20 days', 'Fulano de Teste', 'em_estoque', 'em_uso');

  insert into public.movimentacoes (id, ordem, ativo_id, tipo, data, filial_id, criado_por, created_at,
                                    colaborador, itens_faltantes, status_anterior, status_resultante)
  overriding system value
  values (v_mov_b, v_bkp_ordem_b, v_ativo, 'devolucao', current_date - 2, v_f1, k_autor,
          now() - interval '2 days', 'Fulano de Teste', array['carregador'], 'em_uso', v_bkp_status);

  select ordem into v_ordem from public.movimentacoes where id = v_mov_a;
  if v_ordem = v_bkp_ordem_a then
    v_ok := v_ok + 1;
    raise notice '✓ 2b com `overriding system value`, a `ordem` do backup (%) foi preservada', v_bkp_ordem_a;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2b a `ordem` restaurada é %, e o backup dizia % — o restaurador perdeu a ordenação do histórico', v_ordem, v_bkp_ordem_a;
  end if;

  -- ---- 3b. Com o trigger DESLIGADO, o `status` restaurado é o do backup ----
  select status into v_st from public.ativos where id = v_ativo;
  if v_st = 'em_estoque' then
    v_ok := v_ok + 1;
    raise notice '✓ 3b com o trigger desligado, `ativos.status` NÃO foi reescrito pela reinserção';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3b `ativos.status` virou % durante a reinserção, com o trigger desligado', v_st;
  end if;

  -- ---- 3c. Com o trigger LIGADO, a pendência seria DUPLICADA --------------
  -- A prova da Decisão 7. Não é preferência: é contagem.
  alter table public.movimentacoes enable trigger trg_aplicar_movimentacao;

  -- ⚠ E A DEVOLUÇÃO DO MODO DEFERIDO, que é a segunda metade da quarta armadilha —
  -- descoberta rodando, um passo depois da primeira. `set constraints all immediate`
  -- não é inócuo: ele vale para o RESTO da transação, e o caminho normal de escrita
  -- DEPENDE do modo deferido. `aplicar_movimentacao` é BEFORE INSERT e insere
  -- `pendencias_item` apontando para `new.id` — uma linha de `movimentacoes` que ainda
  -- NÃO existe. Com a FK imediata isso vira `23503` na cara de quem só registrou uma
  -- devolução. Quem descarrega as constraints para mexer no gatilho devolve o modo
  -- antes de soltar o banco de volta para o uso normal.
  set constraints all deferred;

  perform set_config('estoque.dev_destrutivo', 'on', true);
  delete from public.pendencias_item where ativo_id = v_ativo;
  perform set_config('estoque.dev_destrutivo', 'off', true);

  -- Restaura a pendência COMO O BACKUP a traz…
  insert into public.pendencias_item (ativo_id, movimentacao_id, item, filial_id, colaborador)
  values (v_ativo, v_mov_b, 'carregador', v_f1, 'Fulano de Teste');

  -- …e agora reinsere a movimentação de devolução com o trigger LIGADO, que é o que a
  -- estratégia "deixar a máquina derivar" faria. A `saida` antes dela é a máquina de
  -- estados cobrando o seu: `devolucao` só sai de `em_uso`/`emprestado`.
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at, colaborador)
  values (v_ativo, 'saida', current_date - 1, v_f1, k_autor, now() - interval '1 day', 'Fulano de Teste');

  -- ---- 3a. Com o trigger LIGADO, o `status` restaurado é SOBRESCRITO -------
  -- ⚠ MEDIDO AQUI, e não depois da devolução, e o motivo é uma correção: a primeira
  -- versão deste roteiro media o status DEPOIS da `devolucao` e exigia que ele fosse
  -- diferente de `em_estoque` — só que `devolucao` LEVA a `em_estoque`, então o valor
  -- coincidia com o restaurado e a asserção reprovava por estar errada, não por o
  -- sistema estar. O ponto onde a sobrescrita é VISÍVEL é logo após a `saida`: o
  -- restaurado era `em_estoque` e a máquina o levou a `em_uso`.
  select status into v_st from public.ativos where id = v_ativo;
  if v_st = 'em_uso' then
    v_ok := v_ok + 1;
    raise notice '✓ 3a com o trigger LIGADO, `ativos.status` foi reescrito (em_estoque → em_uso) por cima do restaurado';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3a o trigger não reescreveu `ativos.status` (ficou em %) — ele deixou de recalcular o estado, e a premissa da Decisão 7 mudou', v_st;
  end if;

  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at,
                                    colaborador, itens_faltantes)
  values (v_ativo, 'devolucao', current_date - 1, v_f1, k_autor, now() - interval '1 day',
          'Fulano de Teste', array['carregador']);

  select count(*) into v_n from public.pendencias_item where ativo_id = v_ativo;
  if v_n > 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 3c com o trigger LIGADO a pendência DUPLICA (% linhas para 1 item) — é por isso que a Decisão 7 desliga o trigger', v_n;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3c esperava duplicação de pendência com o trigger ligado, veio % linha(s). Se o trigger deixou de inserir `pendencias_item`, a Decisão 7 perdeu a premissa e o restaurador precisa ser reavaliado', v_n;
  end if;

  -- ---- 3d. E o estado FINAL volta a bater com o do backup ----------------
  -- O fecho honesto do cenário 3: depois de `saida` + `devolucao` com o trigger ligado,
  -- a máquina de estados chega ao MESMO `em_estoque` que o backup guardava. Isto é o
  -- que torna a Decisão 7 uma escolha de MECÂNICA e não de resultado: as duas
  -- estratégias convergem no `status`; o que as separa é a pendência duplicada (3c).
  select status into v_st from public.ativos where id = v_ativo;
  if v_st = v_bkp_status then
    v_ok := v_ok + 1;
    raise notice '✓ 3d o estado derivado pela máquina (%) coincide com o do backup', v_st;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3d a máquina derivou % e o backup dizia % — restaurar literalmente e deixar derivar deixaram de convergir', v_st, v_bkp_status;
  end if;

  -- =========================================================================
  -- 2c / 2d — A ARMADILHA QUE FALHA TARDE: a sequência
  -- =========================================================================
  -- ⚠ O CASO REAL É RESTAURAR NUM BANCO CUJA SEQUÊNCIA ESTÁ ATRÁS — projeto novo,
  -- restore de outro ambiente, o piloto da F73. Restaurar no MESMO banco não expõe
  -- o defeito (a sequência ficou alta), e é por isso que este cenário a empurra
  -- para trás de propósito, em vez de esperar que a sorte o produza.
  --
  -- ⚠ E O ALVO É A `ordem` QUE ESTE ROTEIRO ACABOU DE RESTAURAR, não o valor 1 — a
  -- primeira versão fazia `setval(v_seq, 1, false)` e passou no ENSAIO (onde existem
  -- 3.239 movimentações reais, e `ordem = 1` existe) mas FALHOU no `banco-sem-docker`:
  -- lá a tabela só tem as linhas deste roteiro, e como os roteiros anteriores já
  -- consumiram a sequência (o `rollback` desfaz as linhas, NÃO a sequência), a `ordem`
  -- restaurada é alta e `1` não colide com nada. A asserção passava a medir o acervo do
  -- ambiente, e não a armadilha. Apontando para uma `ordem` que ESTE roteiro pôs na
  -- tabela, o próximo valor colide sempre — em qualquer banco, com ou sem acervo.
  --
  -- ⚠ O ALVO É A `ordem` DA SAÍDA (a SEGUNDA movimentação), e não a da compra. Se este
  -- roteiro rodar SOZINHO (`npm run db:test:um restauracao`) num banco recém-criado, a
  -- compra recebe `ordem = 1` e `setval(…, 0)` estouraria com "value 0 is out of bounds".
  -- A segunda movimentação tem `ordem >= 2` por construção, então `- 1` é sempre válido.
  perform setval(v_seq, v_bkp_ordem_s - 1, true);

  begin
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por)
    values (v_ativo, 'compra', current_date, v_f1, k_autor);
    v_falhas := v_falhas + 1;
    raise warning '✗ 2c o INSERT seguinte PASSOU com a sequência atrás — o índice único de `ordem` sumiu, e a restauração deixou de ter esse risco (ou de ter esse índice)';
  exception when unique_violation then
    v_ok := v_ok + 1;
    raise notice '✓ 2c sem `setval`, a PRIMEIRA movimentação depois da restauração viola o índice único de `ordem`';
  end;

  -- ---- 2d. COM `setval`, o INSERT seguinte passa --------------------------
  perform setval(v_seq, (select max(ordem) from public.movimentacoes), true);
  begin
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por)
    values (v_ativo, 'compra', current_date, v_f1, k_autor);
    v_ok := v_ok + 1;
    raise notice '✓ 2d com `setval` para max(ordem), a movimentação seguinte entra sem colidir';
  exception when others then
    v_falhas := v_falhas + 1;
    get stacked diagnostics v_erro = message_text;
    raise warning '✗ 2d mesmo com `setval` o INSERT seguinte falhou: %', v_erro;
  end;

  -- =========================================================================
  -- 5 — `guarda_acervo`: o que ele deixa passar, e o que não
  -- =========================================================================
  -- Decide se o restaurador PRECISA da janela. Medido: INSERT comum passa; INSERT
  -- com `forcado = true` não. Como o backup PODE conter linhas forçadas (a marca é
  -- gravável dentro da janela, 0079), o restaurador abre a janela mesmo assim.
  begin
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, forcado)
    values (v_ativo, 'compra', current_date, v_f1, k_autor, true);
    v_falhas := v_falhas + 1;
    raise warning '✗ 5a `guarda_acervo` DEIXOU gravar `forcado = true` fora da janela — a marca do desenvolvedor virou gravável por qualquer caminho';
  exception when insufficient_privilege then
    v_ok := v_ok + 1;
    raise notice '✓ 5a fora da janela, `guarda_acervo` permite INSERT comum e RECUSA `forcado = true`';
  end;

  -- ---- 5b. Dentro da janela, a linha forçada entra ------------------------
  perform set_config('estoque.dev_destrutivo', 'on', true);
  begin
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, forcado)
    values (v_ativo, 'compra', current_date, v_f1, k_autor, true);
    v_ok := v_ok + 1;
    raise notice '✓ 5b dentro da janela, a linha `forcado = true` do backup pode ser restaurada';
  exception when others then
    v_falhas := v_falhas + 1;
    get stacked diagnostics v_erro = message_text;
    raise warning '✗ 5b dentro da janela o INSERT forçado falhou: %', v_erro;
  end;
  perform set_config('estoque.dev_destrutivo', 'off', true);

  -- =========================================================================
  -- 6/7 — VERSÃO 2 (F56 · Frente F, migration 0140): o restaurador aprende a
  -- religar os dois elos de `lancamentos_item` e o ponteiro de
  -- `ativos.substitui_ativo_id` que o conserto da FK do import desvincula/anula.
  -- Os dois UPDATEs testados aqui são EXATAMENTE os que
  -- `scripts/db/sqlDeReligarElos`/`sqlDeReligarPonteiros` montam (provado por
  -- inspeção no roteiro Vitest, sem banco — este arquivo prova que o Postgres
  -- de verdade aceita a forma).
  -- =========================================================================

  -- ---- 6 — religar os DOIS elos de um lançamento de item -------------------
  insert into public.itens (nome, grupo) values ('F56 Restauração Item', 'acessorio')
  returning id into v_item6;

  insert into public.pendencias_item (ativo_id, movimentacao_id, item, filial_id, colaborador)
  values (v_ativo, v_mov_a, 'F56 pendência do religar', v_f1, 'F56 Fulano')
  returning id into v_pend6;

  -- O lançamento nasce COM os dois elos (o retrato que um backup versão 2
  -- teria salvo ANTES do desvínculo) — a janela é obrigatória para o INSERT
  -- de `pendencia_item_id`/`movimentacao_id` não ser recusado por acaso e
  -- para o UPDATE seguinte, que simula o PÓS-desvínculo, ser aceito.
  perform set_config('estoque.dev_destrutivo', 'on', true);
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data,
                                       movimentacao_id, pendencia_item_id, criado_por)
  values (v_item6, v_f1, 'entrada', 1, current_date, v_mov_a, v_pend6, k_autor)
  returning id into v_lanc6;

  -- Simula o PÓS-desvínculo — exatamente o que `import_apagar_acervo_filial`
  -- (0140) deixa no banco depois do "Substituir tudo".
  update public.lancamentos_item set movimentacao_id = null, pendencia_item_id = null
   where id = v_lanc6;
  perform set_config('estoque.dev_destrutivo', 'off', true);

  -- ---- 6a. cenário montado: os dois elos estão nulos -----------------------
  select movimentacao_id, pendencia_item_id into v_mid6, v_pid6
    from public.lancamentos_item where id = v_lanc6;
  if v_mid6 is null and v_pid6 is null then
    v_ok := v_ok + 1;
    raise notice '✓ 6a cenário montado: os dois elos do lançamento estão nulos (pós-desvínculo simulado)';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 6a cenário mal montado: elos não nulos (mov=%, pend=%)', v_mid6, v_pid6;
  end if;

  -- ---- 6b. DENTRO da janela, o UPDATE religa OS DOIS elos de uma vez -------
  -- Sem trigger nenhum: trg_valida_lancamento_item é BEFORE INSERT só (fato 32
  -- da F56) e não dispara em UPDATE.
  perform set_config('estoque.dev_destrutivo', 'on', true);
  update public.lancamentos_item as li
     set movimentacao_id   = v.movimentacao_id,
         pendencia_item_id = v.pendencia_item_id
    from (values (v_lanc6, v_mov_a, v_pend6)) as v(id, movimentacao_id, pendencia_item_id)
   where li.id = v.id;
  perform set_config('estoque.dev_destrutivo', 'off', true);

  select movimentacao_id, pendencia_item_id into v_mid6, v_pid6
    from public.lancamentos_item where id = v_lanc6;
  if v_mid6 = v_mov_a and v_pid6 = v_pend6 then
    v_ok := v_ok + 1;
    raise notice '✓ 6b o UPDATE de religação restaura os dois elos de uma vez, dentro da janela';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 6b elos não religados: mov esperado %/obtido %, pend esperado %/obtido %',
      v_mov_a, v_mid6, v_pend6, v_pid6;
  end if;

  -- ---- 6c. FORA da janela, o MESMO UPDATE é RECUSADO por guarda_acervo -----
  -- Prova a premissa escrita no cabeçalho de `sqlDeReligarElos`: a janela já
  -- tem de estar aberta no ponto de `montarTransacao` onde o UPDATE entra —
  -- sem ela, `lancamentos_item_guarda_acervo` (0081) recusa qualquer UPDATE.
  begin
    update public.lancamentos_item as li
       set movimentacao_id   = v.movimentacao_id,
           pendencia_item_id = v.pendencia_item_id
      from (values (v_lanc6, v_mov_a, v_pend6)) as v(id, movimentacao_id, pendencia_item_id)
     where li.id = v.id;
    v_falhas := v_falhas + 1;
    raise warning '✗ 6c o UPDATE de religação passou FORA da janela (deveria ser recusado)';
  exception when insufficient_privilege then
    v_ok := v_ok + 1;
    raise notice '✓ 6c fora da janela, guarda_acervo recusa o UPDATE de religação';
  end;

  -- ---- 7 — religar `ativos.substitui_ativo_id` (o mesmo UPDATE do backup do
  --      RESET, fato 27) — SEM precisar de janela: ativos_guarda_acervo (0081)
  --      só recusa DELETE, nunca UPDATE ------------------------------------
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, substitui_ativo_id)
  values ('WAP0056002', 'F56REST2', 'notebook', v_f1, null) returning id into v_ativo_sub7;

  update public.ativos as a
     set substitui_ativo_id = v.substitui_ativo_id
    from (values (v_ativo_sub7, v_ativo)) as v(id, substitui_ativo_id)
   where a.id = v.id;

  select substitui_ativo_id into v_sub7 from public.ativos where id = v_ativo_sub7;
  if v_sub7 = v_ativo then
    v_ok := v_ok + 1;
    raise notice '✓ 7a o UPDATE de religação restaura substitui_ativo_id, sem precisar da janela';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 7a substitui_ativo_id não religado: esperado %, obtido %', v_ativo, v_sub7;
  end if;

  -- =========================================================================
  -- 8 — F63 (sabotagem H): `empresa_id` NO BACKUP, ou não.
  -- `scripts/db/restaurar.mjs` (`sqlDeInsercao`, :272) monta o INSERT com as colunas que as
  -- LINHAS DO BACKUP trazem. Um backup de ANTES da F63 não tem a chave `empresa_id`: o INSERT a
  -- omite e o default da coluna (`public.empresa_legada()`, até a F67) preenche — a linha volta
  -- na WAP. Um de DEPOIS traz a chave: a linha volta com a empresa que o backup disser, mesmo
  -- que não seja a WAP (uma empresa B fictícia, aqui). Os INSERTs abaixo têm a FORMA que o
  -- restaurador monta (lista de colunas = chaves do backup).
  -- =========================================================================
  insert into public.ativos (id, patrimonio, service_tag, categoria, filial_id, origem, status)
  values (v_ativo8a, 'WAP0063801', 'F63REST1', 'notebook', v_f1, 'cadastro', 'em_estoque');

  insert into public.empresas (slug, nome) values ('f63-restauracao-b', 'Empresa B da restauração (F63)')
  returning id into v_emp8;
  insert into public.ativos (id, patrimonio, service_tag, categoria, filial_id, origem, status, empresa_id)
  values (v_ativo8b, 'WAP0063802', 'F63REST2', 'notebook', v_f1, 'cadastro', 'em_estoque', v_emp8);
  insert into public.anotacoes (id, ativo_id, texto, criado_por, empresa_id)
  values (v_anot8b, v_ativo8b, 'anotação fictícia restaurada (F63)', k_autor, v_emp8);

  select empresa_id into v_e8a from public.ativos where id = v_ativo8a;
  select empresa_id into v_e8b from public.ativos where id = v_ativo8b;
  select empresa_id into v_e8c from public.anotacoes where id = v_anot8b;
  if pg_temp.assert_zero_de('8a um backup SEM a chave empresa_id (anterior à F63) restaura com a WAP (o default)',
       case when v_e8a = public.empresa_legada() then 0 else 1 end, 1) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;
  if pg_temp.assert_zero_de('8b um backup COM a chave empresa_id restaura com a empresa que ele traz (ativo e anotação)',
       (case when v_e8b = v_emp8 then 0 else 1 end) + (case when v_e8c = v_emp8 then 0 else 1 end), 2) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  raise notice 'FIM restauracao: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
