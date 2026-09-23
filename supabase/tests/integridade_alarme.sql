-- =============================================================================
-- integridade_alarme.sql — F55: planta os DOZE estados impossíveis e prova que
-- cada checagem de integridade os enxerga (docs/PLAN-F55.md §5).
-- =============================================================================
--
-- ATÉ ESTA FASE, das doze checagens de `public.checagens_integridade_nucleo()`
-- (extraída VERBATIM de `dev_checagens_integridade()` pela migration 0138), só
-- UMA tinha um roteiro que planta o estado e mede (`detentor_em_estado_sem_dono`,
-- em `f36_detentor.sql`, cenário j). Este arquivo cobre as doze.
--
-- IDIOMA: exatamente o de `f36_detentor.sql:320-372` — mede o total ANTES (pelo
-- NÚCLEO, nunca pela porta guardada: rodamos como o `postgres` que aplica as
-- migrations, que é dono das quatro funções da 0138 e por isso as alcança sem
-- precisar de sessão nenhuma), planta o estado, mede DEPOIS, compara o DELTA
-- (nunca o número absoluto — o acervo do banco varia entre CI/ensaio/produção),
-- e então, por ser barato em todos os doze casos, desfaz o estado e confere que
-- o total volta ao de antes (o mesmo par de passos que `f36_detentor.sql` faz em
-- j2/j3). Cada cenário é o seu PRÓPRIO bloco `begin … exception when others …
-- end;`: um erro inesperado em qualquer um deles cai no `exception`, que em
-- PL/pgSQL é implementado por um SAVEPOINT — a exceção desfaz sozinha tudo que o
-- bloco tiver feito (inclusive um `drop index` que não chegou a ser religado) e
-- os cenários seguintes continuam rodando normalmente, até a linha FIM.
--
-- ⚠ ESTE ROTEIRO RODA SÓ NO POSTGRES DO CI (`banco-sem-docker`), NUNCA PELO MCP
-- NO ENSAIO: o cenário 1 desliga um índice único da tabela `ativos` — dentro da
-- transação, religado antes do fim do próprio cenário, mas um roteiro que
-- desliga trava rodado fora de transação (ou interrompido no meio) deixaria a
-- trava desligada de verdade num banco que outra gente usa.
--
-- -----------------------------------------------------------------------------
-- O QUE ESTE ROTEIRO PROVA
-- -----------------------------------------------------------------------------
--   (A) as DOZE chaves, uma a uma: o núcleo enxerga o estado plantado (delta
--       +1) e volta ao número de antes quando o estado é desfeito.
--   (B) o RESUMO (`checagens_integridade_resumo()`), quatro afirmações:
--       b1 sob sessão de um perfil `consulta` ATIVO ele devolve o MESMO
--          (chave, total) — os doze pares — que `dev_checagens_integridade()`
--          devolve sob sessão de um perfil `dev`;
--       b2 recusa `anon` e recusa `authenticated` SEM `sub` no JWT, as duas
--          com 42501;
--       b3 NUNCA devolve a coluna `amostra` — provado pelo CATÁLOGO
--          (`pg_get_function_result`), não por "o select não trouxe";
--       b4 um perfil DESATIVADO (`ativo = false`) também é recusado (o piso
--          da 0070/0073).
--   (C) `rotulo_de_ambiente()`: devolve o rótulo onde a linha existe em
--       `public.ambiente` e NADA (null) onde ela não existe — os dois lados,
--       dentro da mesma transação.
--   Bônus estrutural (mesma técnica de `f41_regularizacao.sql` cenário 12):
--       `checagens_integridade_nucleo()` tem exatamente DOZE blocos
--       `return query` — se alguém acrescentar/remover checagem sem atualizar
--       este roteiro, esta asserção denuncia primeiro.
--
-- -----------------------------------------------------------------------------
-- O QUE ESTE ROTEIRO **NÃO** PROVA
-- -----------------------------------------------------------------------------
--   · Que as doze peças do núcleo são byte a byte as mesmas da 0136 — isso é
--     `corpo-vigente.mjs` + diff, em `docs/f55-evidencias/` (§3 do PLAN-F55).
--   · O workflow `saude.yml`, a issue de alarme ou a linha de base versionada
--     (`scripts/smoke/linha-de-base.json`) — isso é smoke contra ENSAIO/
--     PRODUÇÃO de verdade, fora do alcance de um roteiro `begin … rollback`.
--   · Concorrência real (duas sessões plantando o mesmo estado ao mesmo
--     tempo) — mesma ressalva que `f41_regularizacao.sql` já registra para a
--     partição de itens.
--   · O CONTEÚDO da coluna `amostra` (formatação, corte em 5, ordenação) —
--     só que ela NÃO SAI do resumo (b3). O conteúdo em si já é implícito nas
--     doze consultas herdadas verbatim da 0136/0136.
--   · O comportamento em produção/ensaio — só no Postgres novo do CI.
--
-- -----------------------------------------------------------------------------
-- POR CHECAGEM: O QUE TEVE DE SER DESLIGADO, E POR QUÊ (tabela do §5 do plano)
-- -----------------------------------------------------------------------------
--    1 patrimonio_duplicado          → DESLIGA o índice único
--      `ativos_patrimonio_service_tag_uidx` (filial_id, patrimonio,
--      coalesce(service_tag,'')), da migration 0091 — é o ÚNICO dos doze
--      estados bloqueado por um objeto do banco: sem desligar, o segundo
--      INSERT do par duplicado seria recusado pelo próprio índice antes de a
--      checagem ter a chance de enxergar o estado. Religado no MESMO cenário,
--      logo depois de medir (não confiamos só no `rollback` final).
--    2 ativo_filial_inativa          → nada (UPDATE em `filiais.ativo` é
--      operação normal, sem trigger nenhum sobre essa tabela).
--    3 termo_sem_arquivo             → nada (a escrita em `termos_gerados` e
--      a escrita no bucket `termos` nunca foram atômicas — é exatamente por
--      isso que a checagem existe).
--    4 perfil_sem_conta              → nada. A FK `profiles_id_fkey` para
--      `auth.users` foi derrubada na migration 0073; inserir um perfil com
--      `id` que nunca existiu no Auth é uma escrita direta comum.
--    5 conta_sem_perfil              → nada. `profiles_guarda_dev` (0073) só
--      recusa DELETE de perfil com `papel = 'dev'`; um perfil comum apaga
--      livre — é o caminho que desliga MENOS (a alternativa seria desligar o
--      trigger `trg_on_auth_user_created` inteiro, um alcance maior sem
--      necessidade).
--    6 pendencia_de_estornada        → nada. O "estorno-strip" (a linha
--      `delete from pendencias_item where movimentacao_id = v_orig.id` dentro
--      de `aplicar_movimentacao`) é LÓGICA de negócio, não uma restrição do
--      banco — plantamos o estado inserindo a pendência DEPOIS que o estorno
--      já rodou, por fora do fluxo normal (nenhuma tela faz isso).
--    7 operador_sem_filial           → nada. É o estado NATURAL de uma conta
--      recém-convidada: `handle_new_user` cria o perfil com o default
--      `papel = 'operador'`, `ativo = true`, e ninguém grava
--      `operador_filiais` sozinho.
--    8 arquivo_termo_orfao           → nada.
--    9 conflito_entre_filiais        → nada — é o CAMINHO FELIZ do recurso
--      desde a F24 (migration 0091): o índice de identidade é POR FILIAL de
--      propósito, para que o mesmo par possa coexistir em filiais diferentes.
--   10 detentor_em_estado_sem_dono   → nada. `guarda_acervo` (0081) só recusa
--      DELETE em `ativos`; UPDATE é operação normal (é o que o próprio
--      sistema faz a cada movimentação).
--   11 reserva_aberta                → nada. Basta dar saldo suficiente
--      (`entrada` antes da `reserva`) para que `valida_lancamento_item`
--      aceite a reserva — a regra do banco não impede uma reserva aberta,
--      só impede saldo negativo.
--   12 backup_orfao                  → nada.
--   13 kit_motivo_orfao (F64, 0164)  → DESLIGA o gatilho
--      `kits_modelos_motivo_da_empresa` só para plantar o kit órfão (é o
--      gatilho que recusa a entrada na orfandade), e o RELIGA antes de medir.
--      Desde a F64 são TREZE chaves: o bônus estrutural e o b1 contam 13.
--
-- Únicas dependências de fora de `public`: `storage.objects` (cenários 3, 8,
-- 12 — leitura; e 8, 12 — escrita) e `auth.users` (cenários 4/5 e a fixação de
-- identidades). As duas existem no recorte mínimo do CI
-- (`supabase/ci/bootstrap-storage.sql`, `bootstrap-auth.sql`). Nenhum INSERT
-- aqui usa `storage.objects.metadata` — a coluna não existe no bootstrap.
--
-- -----------------------------------------------------------------------------
-- BLOCO DE GRANTS — deliberadamente VAZIO, e o porquê (leia antes de "corrigir")
-- -----------------------------------------------------------------------------
-- A armadilha documentada em `docs/RUNBOOK-BANCO.md` ("Asserção nova do
-- papeis_rls.sql sobre relação FORA do bloco de grants") é sobre roteiro que
-- faz `select`/`insert`/`update` DIRETO numa tabela ou view enquanto está sob
-- `set local role authenticated` (ou outro papel não-superusuário) — o
-- Postgres novo do CI não tem os default privileges de um Supabase hospedado,
-- e falta esse grant dá 42501 que aborta o `do $$` inteiro.
--
-- Este roteiro NUNCA toca tabela nem view enquanto o papel está trocado: toda
-- linha sob `set local role anon/authenticated/service_role` é uma chamada às
-- QUATRO funções da própria migration 0138
-- (`checagens_integridade_resumo()`, `dev_checagens_integridade()`,
-- `rotulo_de_ambiente()`) — as três são SECURITY DEFINER e rodam com o
-- privilégio do DONO por dentro, e os GRANTs de EXECUTE que a chamada precisa
-- (authenticated → resumo/dev; service_role → rótulo; nada para anon, que é
-- exatamente o que o cenário b2 confere) já vêm da própria 0138, aplicada
-- antes deste roteiro rodar. Acrescentar um grant aqui que a migration já deu
-- seria, na pior hipótese, mascarar um REVOKE futuro sem necessidade — a
-- mesma armadilha, do lado oposto.
--
-- TODA a plantação de estado (as doze, e as identidades fictícias de B) roda
-- SEM troca de papel — como `postgres`, a mesma sessão que aplica as
-- migrations e por isso é DONA das quatro funções da 0138 (o `revoke all`
-- delas lista `public, anon, authenticated, service_role`, nunca o dono) e
-- ignora RLS em toda tabela tocada. É por isso que medimos pelo NÚCLEO
-- (fechado a todo mundo, menos o dono) em vez de abrir sessão de dev a cada
-- uma das doze vezes — exatamente como o §5 do PLAN-F55 pede.
-- =============================================================================

begin;

create temp table _integridade_alarme_resumo (ok int, falhas int, detalhe text);

do $$
declare
  v_ok      int := 0;
  v_falhas  int := 0;

  -- Identidades fictícias (domínio corporativo — trigger handle_new_user exige).
  k_autor      uuid := gen_random_uuid();  -- criado_por/gerado_por genérico
  k_dev        uuid := gen_random_uuid();  -- promovido a dev (parte B)
  k_consulta   uuid := gen_random_uuid();  -- papel consulta (parte B)
  k_desativado uuid := gen_random_uuid();  -- ativo = false (parte B)
  k_operador7  uuid := gen_random_uuid();  -- cenário 7 (operador_sem_filial)
  k_conta5     uuid := gen_random_uuid();  -- cenário 5 (conta_sem_perfil)

  -- Filiais fictícias, isoladas por cenário (evita contaminar um cenário com
  -- o efeito colateral de outro dentro da mesma transação).
  v_fa smallint;  -- filial de uso geral
  v_fb smallint;  -- filial gêmea (cenário 9 — conflito entre filiais)
  v_fc smallint;  -- filial dedicada ao cenário 2 (ativo_filial_inativa)

  -- Reaproveitadas em TODOS os cenários de (A): antes / depois / depois-do-desfazer.
  v_antes   bigint;
  v_depois  bigint;
  v_depois2 bigint;
begin
  -- ===========================================================================
  -- SETUP — identidades e filiais fictícias, 100% isoladas (regra 2 do CLAUDE.md)
  -- ===========================================================================
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (k_autor,      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f55.autor@wap.ind.br', '', now(), now(), now()),
    (k_dev,        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f55.dev@wap.ind.br', '', now(), now(), now()),
    (k_consulta,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f55.consulta@wap.ind.br', '', now(), now(), now()),
    (k_desativado, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f55.desativado@wap.ind.br', '', now(), now(), now());
  -- O trigger `handle_new_user` já criou os quatro perfis (papel default 'operador').

  -- Plantar um DEV exige o caminho oficial: `profiles_guarda_dev` (0073) recusa a
  -- concessão do cargo até para o postgres. Mesmo idioma de `f36_detentor.sql`.
  perform set_config('estoque.gestao_usuarios', 'on', true);
  perform pg_temp.plantar_cargo(k_dev, 'dev');
  perform set_config('estoque.gestao_usuarios', 'off', true);

  -- `consulta` e `ativo=false` NÃO tocam `papel = 'dev'` em lado nenhum da
  -- transição — `profiles_guarda_dev` deixa passar sem GUC nenhum. F62: o cargo e o
  -- status são plantados em membros pelos ajudantes de _asserts.sql.
  perform pg_temp.plantar_cargo(k_consulta, 'consulta');
  perform pg_temp.plantar_status(k_desativado, false);

  insert into public.filiais (slug, nome) values ('zzf55a', 'ZZF55 Filial Teste A') returning id into v_fa;
  insert into public.filiais (slug, nome) values ('zzf55b', 'ZZF55 Filial Teste B') returning id into v_fb;
  insert into public.filiais (slug, nome) values ('zzf55c', 'ZZF55 Filial Teste C') returning id into v_fc;

  -- ===========================================================================
  -- (A) — AS DOZE, UMA A UMA
  -- ===========================================================================

  -- ---------------------------------------------------------------------------
  -- 1 — patrimonio_duplicado (o ÚNICO bloqueado por objeto de banco)
  -- ---------------------------------------------------------------------------
  declare
    v_a1 uuid;
    v_a2 uuid;
  begin
    select total into v_antes from public.checagens_integridade_nucleo()
     where chave = 'patrimonio_duplicado';

    -- ⚠ DESLIGA o índice único `ativos_patrimonio_service_tag_uidx`
    -- (filial_id, patrimonio, coalesce(service_tag,'')), migration 0091. Sem
    -- isto, o segundo INSERT abaixo seria recusado pelo próprio índice ANTES
    -- de a checagem ter a chance de enxergar o par duplicado. DDL é
    -- transacional — o `rollback` final desfaria sozinho — mas RELIGAMOS
    -- explicitamente mais abaixo, porque não confiamos só nisso.
    drop index public.ativos_patrimonio_service_tag_uidx;

    insert into public.ativos (patrimonio, categoria, filial_id, service_tag)
      values ('ZZF55PD01', 'notebook', v_fa, 'ZZF55PDST') returning id into v_a1;
    insert into public.ativos (patrimonio, categoria, filial_id, service_tag)
      values ('ZZF55PD01', 'notebook', v_fa, 'ZZF55PDST') returning id into v_a2;

    select total into v_depois from public.checagens_integridade_nucleo()
     where chave = 'patrimonio_duplicado';

    if pg_temp.assert_zero_de(
         '1a patrimonio_duplicado enxerga o par plantado na mesma filial (delta +1)',
         case when v_depois = v_antes + 1 then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    -- Desfaz a duplicidade — UPDATE em `ativos` é operação normal (a guarda
    -- de `0081` só veta DELETE nesta tabela) — e RELIGA o índice ANTES de
    -- qualquer coisa seguinte no roteiro precisar dele de volta.
    update public.ativos set patrimonio = 'ZZF55PD02' where id = v_a2;

    create unique index ativos_patrimonio_service_tag_uidx
      on public.ativos (filial_id, patrimonio, (coalesce(service_tag, '')));
    comment on index public.ativos_patrimonio_service_tag_uidx is
      'F24 (30/07/2026): identidade do ativo POR FILIAL — (filial_id, patrimonio, coalesce(service_tag,'''')). Religado por integridade_alarme.sql (F55) após medir o cenário 1 — texto idêntico ao da migration 0091.';

    select total into v_depois2 from public.checagens_integridade_nucleo()
     where chave = 'patrimonio_duplicado';

    if pg_temp.assert_zero_de(
         '1b desfeita a duplicidade e religado o índice, a checagem volta ao número de antes',
         case when v_depois2 = v_antes then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  exception when others then
    v_falhas := v_falhas + 2;
    raise warning '✗ 1 cenário patrimonio_duplicado falhou inesperadamente (% %) — o SAVEPOINT da exceção desfaz o bloco inteiro, inclusive o drop index',
      sqlstate, sqlerrm;
  end;

  -- ---------------------------------------------------------------------------
  -- 2 — ativo_filial_inativa
  -- ---------------------------------------------------------------------------
  begin
    select total into v_antes from public.checagens_integridade_nucleo()
     where chave = 'ativo_filial_inativa';

    insert into public.ativos (patrimonio, categoria, filial_id) values ('ZZF55FI01', 'notebook', v_fc);
    update public.filiais set ativo = false where id = v_fc;

    select total into v_depois from public.checagens_integridade_nucleo()
     where chave = 'ativo_filial_inativa';
    if pg_temp.assert_zero_de(
         '2a ativo_filial_inativa enxerga o ativo cuja filial foi desativada (delta +1)',
         case when v_depois = v_antes + 1 then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    update public.filiais set ativo = true where id = v_fc;
    select total into v_depois2 from public.checagens_integridade_nucleo()
     where chave = 'ativo_filial_inativa';
    if pg_temp.assert_zero_de(
         '2b reativada a filial, a checagem volta ao número de antes',
         case when v_depois2 = v_antes then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  exception when others then
    v_falhas := v_falhas + 2;
    raise warning '✗ 2 cenário ativo_filial_inativa falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- ---------------------------------------------------------------------------
  -- 3 — termo_sem_arquivo
  -- ---------------------------------------------------------------------------
  declare
    v_termo uuid;
  begin
    select total into v_antes from public.checagens_integridade_nucleo()
     where chave = 'termo_sem_arquivo';

    -- `movimentacao_ids`/`ativo_ids` não têm FK (são arrays) — um uuid
    -- fabricado basta para provar a checagem, sem precisar de movimentação
    -- nem ativo reais.
    insert into public.termos_gerados (tipo, movimentacao_ids, ativo_ids, dados, arquivo_path, gerado_por)
      values ('responsabilidade_notebook', array[gen_random_uuid()], array[gen_random_uuid()],
              '{}'::jsonb, 'zzf55/termo-orfao.docx', k_autor)
      returning id into v_termo;

    select total into v_depois from public.checagens_integridade_nucleo()
     where chave = 'termo_sem_arquivo';
    if pg_temp.assert_zero_de(
         '3a termo_sem_arquivo enxerga o termo sem objeto correspondente no bucket `termos` (delta +1)',
         case when v_depois = v_antes + 1 then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    -- `termos_gerados` está FORA da guarda_acervo (0081) — DELETE é operação normal.
    delete from public.termos_gerados where id = v_termo;
    select total into v_depois2 from public.checagens_integridade_nucleo()
     where chave = 'termo_sem_arquivo';
    if pg_temp.assert_zero_de(
         '3b apagado o termo órfão, a checagem volta ao número de antes',
         case when v_depois2 = v_antes then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  exception when others then
    v_falhas := v_falhas + 2;
    raise warning '✗ 3 cenário termo_sem_arquivo falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- ---------------------------------------------------------------------------
  -- 4 — perfil_sem_conta
  -- ---------------------------------------------------------------------------
  declare
    v_perfil_orfao uuid := gen_random_uuid();
  begin
    select total into v_antes from public.checagens_integridade_nucleo()
     where chave = 'perfil_sem_conta';

    -- id que NUNCA existiu em `auth.users` — a FK `profiles_id_fkey` foi
    -- derrubada na 0073, então este INSERT é uma escrita direta comum.
    insert into public.profiles (id) values (v_perfil_orfao);

    select total into v_depois from public.checagens_integridade_nucleo()
     where chave = 'perfil_sem_conta';
    if pg_temp.assert_zero_de(
         '4a perfil_sem_conta enxerga o perfil sem conta correspondente no Auth (delta +1)',
         case when v_depois = v_antes + 1 then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    -- `profiles_guarda_dev` só recusa DELETE de perfil `papel = 'dev'`; este nasceu
    -- `operador` (default da coluna) — apaga livre, nada a desligar.
    delete from public.profiles where id = v_perfil_orfao;
    select total into v_depois2 from public.checagens_integridade_nucleo()
     where chave = 'perfil_sem_conta';
    if pg_temp.assert_zero_de(
         '4b apagado o perfil órfão, a checagem volta ao número de antes',
         case when v_depois2 = v_antes then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  exception when others then
    v_falhas := v_falhas + 2;
    raise warning '✗ 4 cenário perfil_sem_conta falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- ---------------------------------------------------------------------------
  -- 5 — conta_sem_perfil
  -- ---------------------------------------------------------------------------
  begin
    select total into v_antes from public.checagens_integridade_nucleo()
     where chave = 'conta_sem_perfil';

    insert into auth.users (id, instance_id, aud, role, email,
                            encrypted_password, email_confirmed_at, created_at, updated_at)
      values (k_conta5, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'f55.contasemperfil@wap.ind.br', '', now(), now(), now());
    -- `handle_new_user` já criou o perfil (papel 'operador' default). Apagamos SÓ o
    -- perfil: `profiles_guarda_dev` (0073) só recusa DELETE de `papel = 'dev'` — este
    -- é operador, apaga livre. É o caminho que desliga MENOS (a alternativa seria
    -- desligar o trigger `trg_on_auth_user_created` inteiro, alcance maior sem necessidade).
    delete from public.profiles where id = k_conta5;

    select total into v_depois from public.checagens_integridade_nucleo()
     where chave = 'conta_sem_perfil';
    if pg_temp.assert_zero_de(
         '5a conta_sem_perfil enxerga a conta do Auth sem perfil correspondente (delta +1)',
         case when v_depois = v_antes + 1 then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    -- Desfaz apagando a conta inteira: sem perfil e sem conta, não sobra nenhum
    -- dos dois lados órfão (e não vira `perfil_sem_conta`, que exigiria o oposto).
    delete from auth.users where id = k_conta5;
    select total into v_depois2 from public.checagens_integridade_nucleo()
     where chave = 'conta_sem_perfil';
    if pg_temp.assert_zero_de(
         '5b apagada a conta órfã, a checagem volta ao número de antes',
         case when v_depois2 = v_antes then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  exception when others then
    v_falhas := v_falhas + 2;
    raise warning '✗ 5 cenário conta_sem_perfil falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- ---------------------------------------------------------------------------
  -- 6 — pendencia_de_estornada
  -- ---------------------------------------------------------------------------
  declare
    v_a6        uuid;
    v_mov_dev   uuid;
    v_pend      uuid;
  begin
    select total into v_antes from public.checagens_integridade_nucleo()
     where chave = 'pendencia_de_estornada';

    insert into public.ativos (patrimonio, categoria, filial_id)
      values ('ZZF55PE01', 'notebook', v_fa) returning id into v_a6;

    -- `created_at` EXPLÍCITO e DISTINTO nas três — regra da pendência nº 5 da F37
    -- (duas movimentações do MESMO ativo na MESMA transação): sem isto o desempate
    -- do estorno vira sorteio de uuid.
    insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por, created_at)
      values (v_a6, 'saida', 'Fulano ZZF55', 'TI', v_fa, k_autor, now() - interval '3 minutes');
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, created_at)
      values (v_a6, 'devolucao', v_fa, k_autor, now() - interval '2 minutes')
      returning id into v_mov_dev;
    insert into public.movimentacoes (ativo_id, tipo, filial_id, estorno_de, criado_por, created_at)
      values (v_a6, 'estorno', v_fa, v_mov_dev, k_autor, now() - interval '1 minute');

    -- O "estorno-strip" de `aplicar_movimentacao` (`delete from pendencias_item
    -- where movimentacao_id = v_orig.id`) já rodou dentro do INSERT acima — mas não
    -- havia pendência nenhuma para apagar (a devolução não trouxe `itens_faltantes`).
    -- O estado impossível só existe se alguém inserir a pendência DEPOIS que o
    -- estorno já correu, por fora do fluxo normal — nenhuma tela faz isto; é
    -- exatamente o que plantamos aqui, à mão.
    insert into public.pendencias_item (ativo_id, movimentacao_id, item, filial_id, status)
      values (v_a6, v_mov_dev, 'ZZF55 Item Fantasma', v_fa, 'aberta')
      returning id into v_pend;

    select total into v_depois from public.checagens_integridade_nucleo()
     where chave = 'pendencia_de_estornada';
    if pg_temp.assert_zero_de(
         '6a pendencia_de_estornada enxerga a pendência aberta apontando para movimentação já estornada (delta +1)',
         case when v_depois = v_antes + 1 then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    update public.pendencias_item
       set status = 'resolvida', desfecho = 'baixa', resolvida_em = now()
     where id = v_pend;
    select total into v_depois2 from public.checagens_integridade_nucleo()
     where chave = 'pendencia_de_estornada';
    if pg_temp.assert_zero_de(
         '6b resolvida a pendência, a checagem volta ao número de antes',
         case when v_depois2 = v_antes then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  exception when others then
    v_falhas := v_falhas + 2;
    raise warning '✗ 6 cenário pendencia_de_estornada falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- ---------------------------------------------------------------------------
  -- 7 — operador_sem_filial
  -- ---------------------------------------------------------------------------
  begin
    select total into v_antes from public.checagens_integridade_nucleo()
     where chave = 'operador_sem_filial';

    insert into auth.users (id, instance_id, aud, role, email,
                            encrypted_password, email_confirmed_at, created_at, updated_at)
      values (k_operador7, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'f55.operador@wap.ind.br', '', now(), now(), now());
    -- `handle_new_user` cria o perfil com `papel = 'operador'` (default) e
    -- `ativo = true` (default): o estado JÁ é o impossível, sem NENHUMA ação
    -- extra — é o estado natural de quem acabou de ser convidado e ainda não
    -- recebeu vínculo de filial nenhum.

    select total into v_depois from public.checagens_integridade_nucleo()
     where chave = 'operador_sem_filial';
    if pg_temp.assert_zero_de(
         '7a operador_sem_filial enxerga o operador ativo sem nenhum vínculo (delta +1)',
         case when v_depois = v_antes + 1 then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    insert into public.operador_filiais (usuario_id, filial_id) values (k_operador7, v_fa);
    select total into v_depois2 from public.checagens_integridade_nucleo()
     where chave = 'operador_sem_filial';
    if pg_temp.assert_zero_de(
         '7b vinculada a filial, a checagem volta ao número de antes',
         case when v_depois2 = v_antes then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  exception when others then
    v_falhas := v_falhas + 2;
    raise warning '✗ 7 cenário operador_sem_filial falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- ---------------------------------------------------------------------------
  -- 8 — arquivo_termo_orfao
  -- ---------------------------------------------------------------------------
  declare
    v_obj_id uuid;
  begin
    select total into v_antes from public.checagens_integridade_nucleo()
     where chave = 'arquivo_termo_orfao';

    insert into storage.objects (bucket_id, name)
      values ('termos', 'zzf55/orfao-termo.docx') returning id into v_obj_id;

    select total into v_depois from public.checagens_integridade_nucleo()
     where chave = 'arquivo_termo_orfao';
    if pg_temp.assert_zero_de(
         '8a arquivo_termo_orfao enxerga o objeto do bucket `termos` sem linha correspondente em termos_gerados (delta +1)',
         case when v_depois = v_antes + 1 then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    delete from storage.objects where id = v_obj_id;
    select total into v_depois2 from public.checagens_integridade_nucleo()
     where chave = 'arquivo_termo_orfao';
    if pg_temp.assert_zero_de(
         '8b apagado o objeto órfão, a checagem volta ao número de antes',
         case when v_depois2 = v_antes then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  exception when others then
    v_falhas := v_falhas + 2;
    raise warning '✗ 8 cenário arquivo_termo_orfao falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- ---------------------------------------------------------------------------
  -- 9 — conflito_entre_filiais
  -- ---------------------------------------------------------------------------
  declare
    v_a9a uuid;
    v_a9b uuid;
  begin
    select total into v_antes from public.checagens_integridade_nucleo()
     where chave = 'conflito_entre_filiais';

    -- Mesmo patrimônio, filiais DIFERENTES: o índice por-filial da 0091 PERMITE
    -- isto de propósito — é o caminho feliz do recurso desde a F24. Nada a desligar.
    insert into public.ativos (patrimonio, categoria, filial_id)
      values ('ZZF55CF01', 'notebook', v_fa) returning id into v_a9a;
    insert into public.ativos (patrimonio, categoria, filial_id)
      values ('ZZF55CF01', 'notebook', v_fb) returning id into v_a9b;

    select total into v_depois from public.checagens_integridade_nucleo()
     where chave = 'conflito_entre_filiais';
    if pg_temp.assert_zero_de(
         '9a conflito_entre_filiais enxerga o grupo com o mesmo par em duas filiais (delta +1 grupo)',
         case when v_depois = v_antes + 1 then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    update public.ativos set patrimonio = 'ZZF55CF02' where id = v_a9b;
    select total into v_depois2 from public.checagens_integridade_nucleo()
     where chave = 'conflito_entre_filiais';
    if pg_temp.assert_zero_de(
         '9b desfeito o par, a checagem volta ao número de antes',
         case when v_depois2 = v_antes then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  exception when others then
    v_falhas := v_falhas + 2;
    raise warning '✗ 9 cenário conflito_entre_filiais falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- ---------------------------------------------------------------------------
  -- 10 — detentor_em_estado_sem_dono (o cenário que f36_detentor.sql já cobre —
  --      aqui é o SEU próprio dado, sem depender do outro roteiro)
  -- ---------------------------------------------------------------------------
  declare
    v_a10 uuid;
  begin
    select total into v_antes from public.checagens_integridade_nucleo()
     where chave = 'detentor_em_estado_sem_dono';

    insert into public.ativos (patrimonio, categoria, filial_id)
      values ('ZZF55DE01', 'notebook', v_fa) returning id into v_a10;
    -- status default = em_estoque (sem dono). UPDATE em `ativos` é operação normal
    -- — `guarda_acervo` (0081) só recusa DELETE nesta tabela, nunca UPDATE.
    update public.ativos set colaborador_atual = 'Fulano ZZF55 Sujo' where id = v_a10;

    select total into v_depois from public.checagens_integridade_nucleo()
     where chave = 'detentor_em_estado_sem_dono';
    if pg_temp.assert_zero_de(
         '10a detentor_em_estado_sem_dono enxerga o ativo com detentor plantado à mão (delta +1)',
         case when v_depois = v_antes + 1 then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    update public.ativos set colaborador_atual = null where id = v_a10;
    select total into v_depois2 from public.checagens_integridade_nucleo()
     where chave = 'detentor_em_estado_sem_dono';
    if pg_temp.assert_zero_de(
         '10b zerado o detentor, a checagem volta ao número de antes',
         case when v_depois2 = v_antes then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  exception when others then
    v_falhas := v_falhas + 2;
    raise warning '✗ 10 cenário detentor_em_estado_sem_dono falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- ---------------------------------------------------------------------------
  -- 11 — reserva_aberta
  -- ---------------------------------------------------------------------------
  declare
    v_item55 smallint;
  begin
    select total into v_antes from public.checagens_integridade_nucleo()
     where chave = 'reserva_aberta';

    insert into public.itens (nome, grupo, ordem)
      values ('TESTE F55 Item Reserva', 'acessorio', 9990) returning id into v_item55;
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
      values (v_item55, v_fa, 'entrada', 5, current_date, k_autor);
    -- Basta ter saldo (`entrada` antes) para `valida_lancamento_item` aceitar a
    -- reserva — a regra do banco não impede reserva aberta, só saldo negativo.
    -- Nada a desligar.
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, chamado, data, criado_por)
      values (v_item55, v_fa, 'reserva', 2, 'ZZF55-CH01', current_date, k_autor);

    select total into v_depois from public.checagens_integridade_nucleo()
     where chave = 'reserva_aberta';
    if pg_temp.assert_zero_de(
         '11a reserva_aberta enxerga o chamado com saldo de reserva em aberto (delta +1)',
         case when v_depois = v_antes + 1 then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, chamado, data, criado_por)
      values (v_item55, v_fa, 'liberacao', 2, 'ZZF55-CH01', current_date, k_autor);
    select total into v_depois2 from public.checagens_integridade_nucleo()
     where chave = 'reserva_aberta';
    if pg_temp.assert_zero_de(
         '11b liberado o chamado, a checagem volta ao número de antes',
         case when v_depois2 = v_antes then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  exception when others then
    v_falhas := v_falhas + 2;
    raise warning '✗ 11 cenário reserva_aberta falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- ---------------------------------------------------------------------------
  -- 12 — backup_orfao
  -- ---------------------------------------------------------------------------
  declare
    v_obj_id2 uuid;
  begin
    select total into v_antes from public.checagens_integridade_nucleo()
     where chave = 'backup_orfao';

    -- Nome SEM `/termos/…` no fim: não bate no padrão das cópias de .docx que a
    -- checagem exclui de propósito (F54) — e não está registrado em
    -- `import_logs.backup_path` nem `eventos_admin.detalhe->>'backup_path'`.
    insert into storage.objects (bucket_id, name)
      values ('backups-import', 'zzf55/orfao-backup.json') returning id into v_obj_id2;

    select total into v_depois from public.checagens_integridade_nucleo()
     where chave = 'backup_orfao';
    if pg_temp.assert_zero_de(
         '12a backup_orfao enxerga o objeto do bucket `backups-import` sem registro correspondente (delta +1)',
         case when v_depois = v_antes + 1 then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    delete from storage.objects where id = v_obj_id2;
    select total into v_depois2 from public.checagens_integridade_nucleo()
     where chave = 'backup_orfao';
    if pg_temp.assert_zero_de(
         '12b apagado o objeto órfão, a checagem volta ao número de antes',
         case when v_depois2 = v_antes then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  exception when others then
    v_falhas := v_falhas + 2;
    raise warning '✗ 12 cenário backup_orfao falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- ---------------------------------------------------------------------------
  -- 13 — kit_motivo_orfao (F64, 0164). O gatilho `kits_modelos_motivo_da_empresa`
  -- recusa o kit órfão na entrada — por isso o estado é plantado com o gatilho
  -- DESLIGADO dentro do bloco (o SAVEPOINT da exceção o religa se algo falhar;
  -- o caminho feliz o religa antes de medir). A prova completa do kit — as
  -- recusas, a empresa B, a desativação — é `kit_motivo_da_empresa.sql`.
  -- ---------------------------------------------------------------------------
  declare
    v_kit64 uuid;
  begin
    select total into v_antes from public.checagens_integridade_nucleo()
     where chave = 'kit_motivo_orfao';

    alter table public.kits_modelos disable trigger kits_modelos_motivo_da_empresa;
    insert into public.kits_modelos (nome, payload, criado_por)
      values ('TESTE F64 Kit Órfão', '{"tipo": "saida", "motivo": "zzf64-inexistente", "categorias": ["notebook"]}', k_autor)
      returning id into v_kit64;
    alter table public.kits_modelos enable trigger kits_modelos_motivo_da_empresa;

    select total into v_depois from public.checagens_integridade_nucleo()
     where chave = 'kit_motivo_orfao';
    if pg_temp.assert_zero_de(
         '13a kit_motivo_orfao enxerga o kit com motivo que não existe na empresa dele (delta +1)',
         case when v_depois = v_antes + 1 then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    -- Desfazer pelo caminho legítimo: tirar o motivo passa pelo gatilho.
    update public.kits_modelos set payload = payload - 'motivo' where id = v_kit64;
    select total into v_depois2 from public.checagens_integridade_nucleo()
     where chave = 'kit_motivo_orfao';
    if pg_temp.assert_zero_de(
         '13b sem o motivo, a checagem volta ao número de antes',
         case when v_depois2 = v_antes then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  exception when others then
    v_falhas := v_falhas + 2;
    raise warning '✗ 13 cenário kit_motivo_orfao falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- ---------------------------------------------------------------------------
  -- Bônus estrutural — o núcleo tem TREZE blocos `return query` (mesma técnica
  -- de f41_regularizacao.sql, cenário 12, aplicada a checagens_integridade_nucleo).
  -- Eram DOZE até a F64; a 0164 acrescentou kit_motivo_orfao.
  -- ---------------------------------------------------------------------------
  declare
    v_n int;
  begin
    select (length(pg_get_functiondef('public.checagens_integridade_nucleo()'::regprocedure))
            - length(replace(pg_get_functiondef('public.checagens_integridade_nucleo()'::regprocedure),
                             'return query', '')))
           / length('return query')
      into v_n;
    if pg_temp.assert_zero_de(
         'estrutura: checagens_integridade_nucleo() tem TREZE blocos `return query`',
         case when v_n = 13 then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  exception when others then
    v_falhas := v_falhas + 1;
    raise warning '✗ estrutura falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- ===========================================================================
  -- (B) — O RESUMO: quatro afirmações
  -- ===========================================================================

  -- b1 — consulta (resumo) e dev (a RPC da /dev) leem os MESMOS doze pares.
  declare
    v_dev_pares  text[];
    v_cons_pares text[];
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);
    select coalesce(array_agg(chave || ':' || total::text order by chave), array[]::text[])
      into v_dev_pares
      from public.dev_checagens_integridade();
    reset role;

    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', k_consulta, 'role', 'authenticated')::text, true);
    select coalesce(array_agg(chave || ':' || total::text order by chave), array[]::text[])
      into v_cons_pares
      from public.checagens_integridade_resumo();
    reset role;

    raise notice 'b1 debug — dev: % | consulta: %', v_dev_pares, v_cons_pares;

    if pg_temp.assert_zero_de(
         'b1a as TREZE chaves aparecem dos dois lados (dev_checagens_integridade / checagens_integridade_resumo)',
         case when coalesce(array_length(v_dev_pares, 1), 0) = 13
                and coalesce(array_length(v_cons_pares, 1), 0) = 13 then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    if pg_temp.assert_zero_de(
         'b1b os treze pares (chave:total) de checagens_integridade_resumo() [consulta] batem, par a par, com dev_checagens_integridade() [dev]',
         case when v_dev_pares = v_cons_pares then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  exception when others then
    reset role;
    v_falhas := v_falhas + 2;
    raise warning '✗ b1 falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- b2 — o resumo RECUSA anon e authenticated SEM sub no JWT, as duas com 42501.
  declare
    v_st1 text;
    v_st2 text;
  begin
    set local role anon;
    perform set_config('request.jwt.claims', NULL, true);
    begin
      perform public.checagens_integridade_resumo();
      v_st1 := 'sem_erro';
    exception when others then
      v_st1 := sqlstate;
    end;
    reset role;

    set local role authenticated;
    perform set_config('request.jwt.claims', NULL, true);
    begin
      perform public.checagens_integridade_resumo();
      v_st2 := 'sem_erro';
    exception when others then
      v_st2 := sqlstate;
    end;
    reset role;

    if pg_temp.assert_zero_de('b2a anon é recusado com 42501 (sem grant de EXECUTE)',
         case when v_st1 = '42501' then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
      raise warning 'b2a sqlstate obtido: %', v_st1;
    end if;

    if pg_temp.assert_zero_de('b2b authenticated SEM sub no JWT é recusado com 42501 (guarda interna)',
         case when v_st2 = '42501' then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
      raise warning 'b2b sqlstate obtido: %', v_st2;
    end if;

    -- b2c — A SUPERFÍCIE, e não só o comportamento.
    --
    -- ⚠ O INJETOR ENSINOU ESTA ASSERÇÃO. A mutação
    -- `resumo-de-integridade-alcancavel-por-anon` devolve a `anon` o EXECUTE da
    -- função, e b2a continuava VERDE: com o grant de volta, `anon` ainda leva
    -- 42501 — só que da guarda interna (`papel_atual() is null`), não da falta de
    -- privilégio. Os dois caminhos dão o mesmo sqlstate, e um roteiro que só olha
    -- o comportamento não distingue "fechado" de "aberto mas vazio".
    --
    -- A diferença IMPORTA: com o grant, a função passa a ser anunciada pelo
    -- PostgREST em `/rest/v1/rpc/` para a chave pública, e vira superfície — a
    -- mesma que a asserção 4 de `catalogo_secdef.sql` vigia no schema inteiro.
    if pg_temp.assert_zero_de(
         'b2c anon NÃO tem EXECUTE sobre checagens_integridade_resumo (a superfície, não o comportamento)',
         case when has_function_privilege('anon', 'public.checagens_integridade_resumo()', 'execute')
              then 1 else 0 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    if pg_temp.assert_zero_de(
         'b2d authenticated TEM EXECUTE sobre checagens_integridade_resumo (senão o alarme não lê nada)',
         case when has_function_privilege('authenticated', 'public.checagens_integridade_resumo()', 'execute')
              then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  exception when others then
    reset role;
    v_falhas := v_falhas + 2;
    raise warning '✗ b2 falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- b3 — o resumo NUNCA devolve `amostra` — prova pelo CATÁLOGO, não pelo select.
  declare
    v_ret text;
  begin
    select pg_get_function_result('public.checagens_integridade_resumo()'::regprocedure) into v_ret;
    if pg_temp.assert_zero_de(
         'b3 checagens_integridade_resumo() não declara a coluna `amostra` no seu tipo de retorno (pg_get_function_result)',
         case when v_ret ilike '%amostra%'
                or v_ret not ilike '%chave%'
                or v_ret not ilike '%total%' then 1 else 0 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
      raise warning 'b3 retorno obtido do catálogo: %', v_ret;
    end if;
  exception when others then
    v_falhas := v_falhas + 1;
    raise warning '✗ b3 falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- b4 — perfil DESATIVADO também é recusado (o piso da 0070/0073).
  declare
    v_st3 text;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', k_desativado, 'role', 'authenticated')::text, true);
    begin
      perform public.checagens_integridade_resumo();
      v_st3 := 'sem_erro';
    exception when others then
      v_st3 := sqlstate;
    end;
    reset role;

    if pg_temp.assert_zero_de('b4 perfil DESATIVADO (ativo = false) também é recusado com 42501',
         case when v_st3 = '42501' then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
      raise warning 'b4 sqlstate obtido: %', v_st3;
    end if;
  exception when others then
    reset role;
    v_falhas := v_falhas + 1;
    raise warning '✗ b4 falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- ===========================================================================
  -- (C) — public.rotulo_de_ambiente(): a linha existe → o rótulo; não existe → NULL
  -- ===========================================================================
  declare
    v_rot           text;
    v_pre_existente boolean;
  begin
    -- Ancora defensiva: no banco do CI `public.ambiente` nasce VAZIA (a linha só
    -- existe no ensaio, posta à mão) — mas confere antes de presumir, para este
    -- roteiro continuar correto se um dia rodar num banco que já tenha a linha.
    select exists(select 1 from public.ambiente where rotulo = 'desenvolvimento')
      into v_pre_existente;

    set local role service_role;
    select public.rotulo_de_ambiente() into v_rot;
    reset role;

    if v_pre_existente then
      raise warning 'ancora C: public.ambiente já tinha a linha ''desenvolvimento'' antes deste roteiro (inesperado no CI — pulando c1 e c3)';
    else
      if pg_temp.assert_zero_de(
           'c1 ancora: rotulo_de_ambiente() é NULL quando public.ambiente não tem a linha (o estado de produção)',
           case when v_rot is null then 0 else 1 end, 1) then
        v_ok := v_ok + 1;
      else
        v_falhas := v_falhas + 1;
      end if;
    end if;

    insert into public.ambiente (rotulo) values ('desenvolvimento')
      on conflict (rotulo) do nothing;

    set local role service_role;
    select public.rotulo_de_ambiente() into v_rot;
    reset role;
    if pg_temp.assert_zero_de('c2 rotulo_de_ambiente() = ''desenvolvimento'' quando a linha existe',
         case when v_rot = 'desenvolvimento' then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    if not v_pre_existente then
      delete from public.ambiente where rotulo = 'desenvolvimento';

      set local role service_role;
      select public.rotulo_de_ambiente() into v_rot;
      reset role;
      if pg_temp.assert_zero_de('c3 apagada a linha, rotulo_de_ambiente() volta a NULL',
           case when v_rot is null then 0 else 1 end, 1) then
        v_ok := v_ok + 1;
      else
        v_falhas := v_falhas + 1;
      end if;
    end if;

    -- c4/c5 — QUEM ALCANÇA a função, e não só o que ela devolve.
    --
    -- ⚠ O INJETOR ENSINOU ESTAS DUAS. A mutação
    -- `rotulo-de-ambiente-alcancavel-por-authenticated` dá o EXECUTE a qualquer
    -- logado, e c1..c3 continuavam VERDES: elas medem o VALOR devolvido, que não
    -- muda com o grant. Só que o valor é o de MENOS: a função existe para o
    -- `scripts/env-guard.ts` confirmar a identidade da base, e alcançável por
    -- `authenticated` ela vira uma dica de infraestrutura que a API entrega a
    -- quem só deveria ler acervo. O privilégio dela é o precedente de
    -- `resetar_dados_ficticios`: service_role, e mais ninguém.
    if pg_temp.assert_zero_de(
         'c4 rotulo_de_ambiente é alcançável SÓ pela service_role (authenticated e anon não)',
         case when has_function_privilege('authenticated', 'public.rotulo_de_ambiente()', 'execute')
                or has_function_privilege('anon', 'public.rotulo_de_ambiente()', 'execute')
              then 1 else 0 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    if pg_temp.assert_zero_de(
         'c5 service_role TEM EXECUTE sobre rotulo_de_ambiente (senão o env-guard não confirma nada)',
         case when has_function_privilege('service_role', 'public.rotulo_de_ambiente()', 'execute')
              then 0 else 1 end, 1) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  exception when others then
    reset role;
    v_falhas := v_falhas + 1;
    raise warning '✗ C falhou inesperadamente (% %)', sqlstate, sqlerrm;
  end;

  -- ===========================================================================
  -- RESUMO (a linha que o MCP consegue ler — ele engole NOTICE/WARNING)
  -- ===========================================================================
  insert into _integridade_alarme_resumo values (v_ok, v_falhas, null);
  if v_falhas = 0 then
    raise notice '=== integridade_alarme: % asserções OK, 0 falhas (ROLLBACK — nada gravado) ===', v_ok;
  else
    raise warning '✗ TOTAL integridade_alarme: % falha(s)', v_falhas;
  end if;
  raise notice 'FIM integridade_alarme: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

select * from _integridade_alarme_resumo;

rollback;
