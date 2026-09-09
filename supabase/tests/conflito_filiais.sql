-- =============================================================
-- Roteiro de teste: CONFLITO ENTRE FILIAIS
-- (F24 — migrations 0091 índices por filial, 0092 fonte derivada, 0093 a RPC de exclusão,
--  0094 o contador no import, 0095 vocabulário + 9ª checagem, 0096 data de entrada,
--  0097 transferência/estorno para a filial do gêmeo).
-- F52 (0132) acrescentou o §10: a guarda de escopo `exigir_ativos_da_empresa`, chamada por
-- `apagar_ativos_conflito_filiais` depois da etapa (3) do lock — hoje NO-OP (uma empresa só).
--
-- Roda no job `banco` do CI (psql, ON_ERROR_STOP=1) e é auto-verificável no SQL editor / MCP.
-- Mesmo padrão dos demais roteiros da pasta:
--   NOTICE  '✓ ...'  quando a invariante bate
--   WARNING '✗ ...'  quando NÃO bate (o job `banco` falha em qualquer `WARNING: ✗`)
--
-- Roda inteiro dentro de `begin; ... rollback;`: nada sobra no banco.
-- DADOS 100% FICTÍCIOS (regra 2 do CLAUDE.md): patrimônios `WAP0009xxx`, service tags `F24*`,
-- e-mails `f24.*@wap.ind.br`, nomes inventados ("Fulano de Teste"). Nenhum dado real da WAP.
--
-- ⚠ POR QUE ESTE ARQUIVO NÃO ESCREVE `DELETE` DIRETO NAS TABELAS DO ACERVO.
-- A ordem F24 (§6) manda manter fora dos roteiros os literais de exclusão de acervo, para que
-- eles possam ser executados por MCP sem esbarrar no gate do modo automático. A prova
-- COMPORTAMENTAL de que `guarda_acervo` recusa UPDATE/DELETE direto — inclusive para o service
-- role — já existe e é exaustiva: `supabase/tests/dev_destrutivo.sql` §2. Este roteiro prova o
-- que lhe cabe: que a guarda continua INSTALADA nas três tabelas com a mesma definição (§6a),
-- que a RPC nova FECHA a janela mesmo estourando no meio (§6b) e que nada da F23 foi alterado.
-- Rodar os dois é o combinado — a regra do runbook ("mexeu em função/trigger/RPC, rode TODOS
-- os roteiros") vale aqui inteira, porque a 0097 reescreve `aplicar_movimentacao`.
--
-- O QUE ELE PROVA (§7 da ordem F24, item a item):
--   1  O CONFLITO PODE EXISTIR — o mesmo par em duas filiais entra, e a fonte derivada
--      (v_conflitos_filiais / _grupos) o enxerga; DENTRO da mesma filial segue impossível,
--      com e sem patrimônio
--   2  A FONTE DERIVADA some sozinha quando o grupo se desfaz, e o resumo de histórico
--      distingue carga do import de vida real
--   3  A RPC apaga UM lado, VÁRIOS e AMBOS — e o grupo some
--   4  CONTENÇÃO (o item que mais importa): id fora de conflito recusa TUDO; ativo sem
--      identidade idem; id repetido no array não infla a contagem confirmada
--   5  CARGO: operador e consulta não executam (request forjado incluso); service role sem
--      EXECUTE; confirmação e justificativa não contornáveis
--   6  A F23 INTACTA: guarda instalada nas três tabelas, janela fechando em erro,
--      `apagar_ativo` do dev ainda funcionando
--   7  TRANSFERÊNCIA para a filial do gêmeo recusa com a mensagem nova (e o estorno também);
--      transferência para filial LIVRE continua passando
--   8  TERMO DE LOTE misto recusa; termo que cobre só a seleção passa
--   9  O ESTORNO COMUM continua funcionando (a regressão mais perigosa da fase)
--  10  (F52/0132) exigir_ativos_da_empresa existe, fechada nos quatro papéis, é CITADA por
--      apagar_ativos_conflito_filiais na ORDEM certa (depois do lock, antes da revalidação,
--      fora da janela destrutiva) — e a exclusão LEGÍTIMA de um conflito continua passando
--      com a guarda nova no caminho
--  11  (F54/0100) O BACKUP EM ARQUIVO, acima do teto de 25 ativos: sem caminho a RPC
--      RECUSA; caminho fora do prefixo `conflito/`, ou sob o digest de OUTRO lote, RECUSA;
--      caminho sob `conflito/<digest desta seleção>/` com o objeto no bucket APAGA os 26.
--      É a adoção da quarentena `conflito-backup-em-arquivo-sem-prefixo-do-digest`
--      (`scripts/db/mutacoes.mjs`), que a F52 reapontou para esta fase: até aqui a maior
--      seleção do roteiro tinha 2 ativos e o ramo do backup em arquivo nunca rodava.
--
-- Ao final, uma linha em `_conflito_resumo` com os contadores — é assim que se lê o resultado
-- pelo MCP, que engole NOTICE/WARNING.
-- =============================================================

begin;

create temp table _conflito_resumo (ok int, falhas int, detalhe text);

-- ---------------------------------------------------------------------------
-- PRIVILÉGIOS DE TABELA — mesma razão do bloco de dev_destrutivo.sql
-- ---------------------------------------------------------------------------
-- O Supabase hospedado concede os privilégios de TABELA a `authenticated` por default
-- privilege; o Postgres NOVO do CI não. Sem este bloco o roteiro morreria com "permission
-- denied for table", e as asserções de RECUSA marcariam ✓ pelo motivo ERRADO.
-- Regra (a mesma de dev_destrutivo.sql): só entra a tabela/verbo que uma asserção deste
-- arquivo realmente usa. `eventos_admin` está aqui porque §3c/§3d leem a TRILHA de dentro da
-- sessão do admin (`set local role authenticated` da linha ~330 ainda vale ali) — foi o que
-- faltou na primeira rodada e derrubou o job `banco` com "permission denied for table
-- eventos_admin", abortando o roteiro inteiro na metade. O privilégio reproduz o hospedado:
-- em ensaio E produção, `authenticated` tem SELECT nessa tabela (medido em
-- information_schema.role_table_grants, 30/07/2026); quem fecha a leitura é a RLS da 0065
-- ("admin le auditoria", `e_admin()`), não a ausência de grant.
grant select on
  public.ativos, public.movimentacoes, public.filiais, public.termos_gerados,
  public.v_conflitos_filiais, public.v_conflitos_filiais_grupos, public.eventos_admin
  to authenticated;
grant insert on public.movimentacoes to authenticated;

do $$
declare
  -- identidades fictícias (uuid fixo, hex válido — o prefixo f24a marca a fase)
  k_dev      uuid := '00000000-f24a-4000-8000-0000000000d1';
  k_admin    uuid := '00000000-f24a-4000-8000-0000000000a1';
  k_operador uuid := '00000000-f24a-4000-8000-0000000000b2';
  k_consulta uuid := '00000000-f24a-4000-8000-0000000000c3';

  v_f1 smallint; v_f2 smallint; v_f3 smallint;
  v_nome_f1 text; v_nome_f2 text;

  -- o par em conflito (com patrimônio)
  v_a1 uuid;  -- filial 1
  v_a2 uuid;  -- filial 2  (gêmeo de v_a1)
  -- o par em conflito SEM patrimônio (identidade = service tag)
  v_b1 uuid; v_b2 uuid;
  -- um terceiro lado, para provar grupo de 3
  v_c3 uuid;
  -- ativo SOZINHO (nunca em conflito) — a isca da §4
  v_solo uuid;
  -- ativo sem identidade nenhuma (sem patrimônio e sem tag)
  v_sem_id uuid;
  -- par para a §7 (transferência) e §9 (estorno)
  v_t1 uuid; v_t2 uuid; v_mov_transf uuid;
  -- par para a §8 (termo de lote)
  v_x1 uuid; v_x2 uuid; v_termo uuid;

  v_ok int := 0; v_falhas int := 0;
  v_n int; v_reais int; v_bool boolean; v_jsonb jsonb;
  v_cargos uuid[]; v_nomes text[] := array['operador', 'consulta'];

  -- §10 (F52) — a guarda de escopo nova, exigir_ativos_da_empresa
  v_def         text;  -- pg_get_functiondef de apagar_ativos_conflito_filiais
  v_pos_call    int;   -- posição da chamada a exigir_ativos_da_empresa
  v_pos_etapa3  int;   -- posição da etapa (3) do lock em dois tempos
  v_pos_ident   int;   -- posição de "with ident as (" (a revalidação do grupo)
  v_pos_janela  int;   -- posição do set_config que ABRE a janela dev_destrutivo

  -- §11 (F54) — o lote ACIMA do teto de backup inline e os quatro caminhos de backup
  v_lote          uuid[];  -- os 26 ativos em conflito (13 pares × 2 lados)
  v_sub           uuid[];  -- um SUBCONJUNTO deles: o digest de "outra exclusão"
  v_path_ok       text;    -- conflito/<digest dos 26>/…  + objeto no bucket  → o único válido
  v_path_errado   text;    -- conflito/<digest do subconjunto>/… + objeto no bucket
  v_path_fora     text;    -- fora do prefixo conflito/, mas com objeto no bucket
  v_path_fantasma text;    -- digest certo, objeto NÃO plantado
begin
  -- ==========================================================================
  -- FIXTURES
  -- ==========================================================================
  select id, nome into v_f1, v_nome_f1 from public.filiais where ativo order by id limit 1;
  select id, nome into v_f2, v_nome_f2 from public.filiais where ativo and id <> v_f1 order by id limit 1;
  select id into v_f3 from public.filiais where ativo and id not in (v_f1, v_f2) order by id limit 1;
  if v_f2 is null then
    raise exception 'fixture: o banco precisa de ao menos 2 filiais ativas';
  end if;

  -- Os quatro cargos, pelo CAMINHO OFICIAL — o mesmo de dev_destrutivo.sql, e não por
  -- atalho. Três detalhes que derrubam quem tenta escrever em `profiles` direto:
  --   · `profiles` não tem coluna `email` (o e-mail vive em `auth.users`);
  --   · `nome` é coluna GERADA de primeiro_nome + sobrenome (0057) — escrever nela é 428C9;
  --   · o trigger `profiles_guarda_dev` (0073) recusa conceder o cargo `dev` a quem quer que
  --     seja, INCLUSIVE ao postgres. Plantar um dev exige abrir a janela oficial de gestão.
  -- Quem cria o profile é `handle_new_user`, disparado pelo insert em `auth.users` (o mesmo
  -- trigger que exige domínio corporativo — 0041/0057).
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (k_dev,      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f24.dev@wap.ind.br',      '', now(), now(), now()),
    (k_admin,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f24.chefia@wap.ind.br',   '', now(), now(), now()),
    (k_operador, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f24.operador@wap.ind.br', '', now(), now(), now()),
    (k_consulta, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f24.consulta@wap.ind.br', '', now(), now(), now());

  update public.profiles set papel = 'admin',    primeiro_nome = 'Chefia',  sobrenome = 'de Teste' where id = k_admin;
  update public.profiles set papel = 'operador', primeiro_nome = 'Fulano',  sobrenome = 'de Teste' where id = k_operador;
  update public.profiles set papel = 'consulta', primeiro_nome = 'Sicrano', sobrenome = 'de Teste' where id = k_consulta;

  perform set_config('estoque.gestao_usuarios', 'on', true);
  update public.profiles set papel = 'dev', primeiro_nome = 'Dev', sobrenome = 'de Teste' where id = k_dev;
  perform set_config('estoque.gestao_usuarios', 'off', true);

  insert into public.operador_filiais (usuario_id, filial_id) values (k_operador, v_f1);

  -- --- o par em conflito COM patrimônio ---
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
    values ('WAP0009101', 'F24-ST-A', 'notebook', v_f1, 'importacao') returning id into v_a1;
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
    values ('WAP0009101', 'F24-ST-A', 'notebook', v_f2, 'importacao') returning id into v_a2;

  -- v_a1 ganha vida REAL de sistema (movimentação fora da carga do import);
  -- v_a2 fica só com a carga. É o que o selo `tem_historico_real` tem de distinguir.
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por, created_at)
    values (v_a1, 'compra', current_date - 30, v_f1, 'import startup 01/07/2026', k_admin, now() - interval '30 day');
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, criado_por, created_at)
    values (v_a1, 'saida', current_date - 5, v_f1, 'Fulano de Teste', k_admin, now() - interval '5 day');
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por, created_at)
    values (v_a2, 'compra', current_date - 30, v_f2, 'import startup 01/07/2026', k_admin, now() - interval '30 day');

  -- --- o par em conflito SEM patrimônio (a tag é a identidade) ---
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
    values (null, 'F24-ST-B', 'monitor', v_f1, 'importacao') returning id into v_b1;
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
    values (null, 'F24-ST-B', 'monitor', v_f2, 'importacao') returning id into v_b2;

  -- --- ativo sozinho (a isca da contenção) e ativo sem identidade ---
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
    values ('WAP0009199', 'F24-ST-SOLO', 'celular', v_f1, 'cadastro') returning id into v_solo;
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
    values (null, null, 'celular', v_f1, 'importacao') returning id into v_sem_id;

  -- ⚠ TODA fixture é criada AQUI, como dono da transação, ANTES de qualquer `set local role`.
  -- Criá-la no meio do roteiro — depois de a sessão já estar em `authenticated` — esbarra na
  -- RLS (`termos_gerados` tem WITH CHECK próprio) e o roteiro morreria por um motivo que nada
  -- tem a ver com o que ele mede.

  -- §8: o par cujo lado entra num termo de lote
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
    values ('WAP0009301', 'F24-ST-X', 'notebook', v_f1, 'importacao') returning id into v_x1;
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
    values ('WAP0009301', 'F24-ST-X', 'notebook', v_f2, 'importacao') returning id into v_x2;
  -- ⚠ `termos_gerados` exige `movimentacao_ids`, `dados` e `gerado_por` (não `criado_por`).
  insert into public.termos_gerados
    (tipo, movimentacao_ids, ativo_ids, colaborador, dados, arquivo_path, gerado_por)
    values ('responsabilidade_notebook', '{}'::uuid[], array[v_x1, v_solo], 'Fulano de Teste',
            '{}'::jsonb, 'termos/f24-misto.docx', k_admin)
    returning id into v_termo;

  -- §7/§9: o par que vai tentar transferir para a filial do gêmeo
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, status)
    values ('WAP0009401', 'F24-ST-T', 'notebook', v_f1, 'cadastro', 'em_estoque') returning id into v_t1;
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, status)
    values ('WAP0009401', 'F24-ST-T', 'notebook', v_f2, 'cadastro', 'em_estoque') returning id into v_t2;

  -- §7/§9: o par que vai tentar transferir para a filial do gêmeo
  -- ==========================================================================
  -- §1  O CONFLITO PODE EXISTIR — e só ENTRE filiais
  -- ==========================================================================
  -- Quatro grupos plantados: WAP0009101+F24-ST-A, ∅+F24-ST-B, WAP0009301+F24-ST-X (o do
  -- termo) e WAP0009401+F24-ST-T (o da transferência). Dois lados cada = 8 ativos.
  select count(*) into v_n from public.v_conflitos_filiais_grupos;
  if v_n = 4 then
    v_ok := v_ok + 1; raise notice '✓ 1a  o par em duas filiais entrou: 4 grupos de conflito (com e sem patrimônio)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 1a  esperava 4 grupos de conflito, veio %', v_n;
  end if;

  select count(*) into v_n from public.v_conflitos_filiais;
  if v_n = 8 then
    v_ok := v_ok + 1; raise notice '✓ 1b  oito ativos em conflito (2 por grupo)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 1b  esperava 8 ativos em conflito, veio %', v_n;
  end if;

  -- o ativo SOZINHO e o SEM IDENTIDADE nunca entram
  if not exists (select 1 from public.v_conflitos_filiais where ativo_id in (v_solo, v_sem_id)) then
    v_ok := v_ok + 1; raise notice '✓ 1c  ativo sozinho e ativo sem identidade ficam FORA da fonte de conflito';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 1c  ativo sozinho ou sem identidade apareceu como conflito';
  end if;

  -- DENTRO da mesma filial a duplicata segue IMPOSSÍVEL — com patrimônio…
  begin
    insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
      values ('WAP0009101', 'F24-ST-A', 'notebook', v_f1, 'cadastro');
    v_falhas := v_falhas + 1; raise warning '✗ 1d  duplicata na MESMA filial (com patrimônio) foi ACEITA';
  exception when unique_violation then
    v_ok := v_ok + 1; raise notice '✓ 1d  duplicata na MESMA filial (com patrimônio) recusada pelo índice';
  end;

  -- …e sem patrimônio (o índice parcial)
  begin
    insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
      values (null, 'F24-ST-B', 'monitor', v_f1, 'cadastro');
    v_falhas := v_falhas + 1; raise warning '✗ 1e  duplicata na MESMA filial (sem patrimônio) foi ACEITA';
  exception when unique_violation then
    v_ok := v_ok + 1; raise notice '✓ 1e  duplicata na MESMA filial (sem patrimônio) recusada pelo índice parcial';
  end;

  -- o par é EXATO: mesmo patrimônio com OUTRA tag não é o mesmo equipamento
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
    values ('WAP0009101', 'F24-ST-OUTRA', 'notebook', v_f2, 'cadastro');
  select count(*) into v_n from public.v_conflitos_filiais_grupos;
  if v_n = 4 then
    v_ok := v_ok + 1; raise notice '✓ 1f  mesmo patrimônio com outra service tag NÃO entra no grupo (o par é exato)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 1f  a tag diferente contaminou o agrupamento: % grupos', v_n;
  end if;

  -- ==========================================================================
  -- §2  A FONTE DERIVADA — histórico por lado e desaparecimento automático
  -- ==========================================================================
  select tem_historico_real into v_bool from public.v_conflitos_filiais where ativo_id = v_a1;
  if v_bool then
    v_ok := v_ok + 1; raise notice '✓ 2a  o lado com movimentação fora da carga tem tem_historico_real = true';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 2a  o lado com vida real NÃO foi marcado';
  end if;

  select tem_historico_real into v_bool from public.v_conflitos_filiais where ativo_id = v_a2;
  if not v_bool then
    v_ok := v_ok + 1; raise notice '✓ 2b  o lado só-carga-do-import tem tem_historico_real = false';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 2b  o lado só-carga foi marcado como histórico real';
  end if;

  select movimentacoes, movimentacoes_reais into v_n, v_reais
    from public.v_conflitos_filiais where ativo_id = v_a1;
  if v_n = 2 and v_reais = 1 then
    v_ok := v_ok + 1; raise notice '✓ 2c  o resumo separa carga (2 movs, 1 fora da carga)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 2c  resumo de histórico errado: % movs / % reais', v_n, v_reais;
  end if;

  -- corrigir a identidade de um lado desfaz o grupo SOZINHO (sem ninguém avisar a mesa)
  update public.ativos set service_tag = 'F24-ST-CORRIGIDA' where id = v_b2;
  if not exists (select 1 from public.v_conflitos_filiais where ativo_id in (v_b1, v_b2)) then
    v_ok := v_ok + 1; raise notice '✓ 2d  corrigir a identidade de um lado desfaz o conflito automaticamente';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 2d  o conflito sobreviveu à correção da identidade';
  end if;
  update public.ativos set service_tag = 'F24-ST-B' where id = v_b2;  -- restaura

  -- grupo de TRÊS filiais (a ordem §1.2: não force par)
  if v_f3 is not null then
    insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
      values ('WAP0009101', 'F24-ST-A', 'notebook', v_f3, 'importacao') returning id into v_c3;
    select ativos into v_n from public.v_conflitos_filiais_grupos
     where rotulo = 'WAP0009101' limit 1;
    if v_n = 3 then
      v_ok := v_ok + 1; raise notice '✓ 2e  grupo de TRÊS filiais é representável';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 2e  esperava grupo de 3, veio %', v_n;
    end if;
  end if;

  -- ==========================================================================
  -- §5  CARGO — quem NÃO executa (vem antes da §3 porque a §3 apaga as fixtures)
  -- ==========================================================================
  v_cargos := array[k_operador, k_consulta];
  for v_n in 1..2 loop
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_cargos[v_n], 'role', 'authenticated')::text, true);
      perform public.apagar_ativos_conflito_filiais(
        array[v_a2], 'APAGAR 1', 'tentativa de cargo sem permissao');
      reset role;
      v_falhas := v_falhas + 1;
      raise warning '✗ 5a  o cargo % EXECUTOU a exclusão de conflito', v_nomes[v_n];
    exception when insufficient_privilege then
      reset role;
      v_ok := v_ok + 1;
      raise notice '✓ 5a  o cargo % foi recusado (42501)', v_nomes[v_n];
    when others then
      reset role;
      v_falhas := v_falhas + 1;
      raise warning '✗ 5a  o cargo % caiu por outro motivo: %', v_nomes[v_n], SQLERRM;
    end;
  end loop;

  -- SERVICE ROLE sem EXECUTE (a superfície de API — precedente 0088)
  if not has_function_privilege('service_role',
       'public.apagar_ativos_conflito_filiais(uuid[],text,text,text)', 'execute')
     and not has_function_privilege('anon',
       'public.apagar_ativos_conflito_filiais(uuid[],text,text,text)', 'execute')
     and has_function_privilege('authenticated',
       'public.apagar_ativos_conflito_filiais(uuid[],text,text,text)', 'execute') then
    v_ok := v_ok + 1; raise notice '✓ 5b  grants: authenticated=true, anon=false, service_role=false';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 5b  grants da RPC de conflito fora do padrão';
  end if;

  -- a auxiliar do backup NÃO está exposta (superfície de API de graça — 0088)
  if not has_function_privilege('authenticated', 'public.prefixo_backup_conflito()', 'execute')
     and not has_function_privilege('authenticated',
       'public.exigir_identidade_livre_na_filial(uuid,smallint,text)', 'execute') then
    v_ok := v_ok + 1; raise notice '✓ 5c  as funções auxiliares ficam FORA da API de RPC';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 5c  função auxiliar exposta a authenticated';
  end if;

  -- ---- daqui em diante, a sessão é a do ADMIN (o cargo que a mesa autoriza) ----
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);

  -- CONFIRMAÇÃO errada não passa
  begin
    perform public.apagar_ativos_conflito_filiais(array[v_a2], 'APAGAR', 'justificativa suficientemente longa');
    v_falhas := v_falhas + 1; raise warning '✗ 5d  confirmação incompleta foi ACEITA';
  exception when others then
    if SQLSTATE = '22023' then
      v_ok := v_ok + 1; raise notice '✓ 5d  confirmação sem o número é recusada (22023)';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 5d  recusa por outro motivo: % / %', SQLSTATE, SQLERRM;
    end if;
  end;

  -- confirmação com o número ERRADO (a régua que força a leitura do tamanho)
  begin
    perform public.apagar_ativos_conflito_filiais(array[v_a2], 'APAGAR 2', 'justificativa suficientemente longa');
    v_falhas := v_falhas + 1; raise warning '✗ 5e  confirmação com número errado foi ACEITA';
  exception when others then
    if SQLSTATE = '22023' then
      v_ok := v_ok + 1; raise notice '✓ 5e  confirmação com o número errado é recusada';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 5e  recusa por outro motivo: %', SQLSTATE;
    end if;
  end;

  -- JUSTIFICATIVA curta não passa
  begin
    perform public.apagar_ativos_conflito_filiais(array[v_a2], 'APAGAR 1', 'curta');
    v_falhas := v_falhas + 1; raise warning '✗ 5f  justificativa curta foi ACEITA';
  exception when others then
    if SQLSTATE = '22023' then
      v_ok := v_ok + 1; raise notice '✓ 5f  justificativa com menos de 10 caracteres é recusada';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 5f  recusa por outro motivo: %', SQLSTATE;
    end if;
  end;

  -- ==========================================================================
  -- §4  CONTENÇÃO — o item que mais importa
  -- ==========================================================================
  -- id FORA de conflito na lista → recusa TUDO (all-or-nothing)
  begin
    perform public.apagar_ativos_conflito_filiais(
      array[v_a2, v_solo], 'APAGAR 2', 'tentativa com um ativo fora de conflito');
    v_falhas := v_falhas + 1; raise warning '✗ 4a  a lista com um ativo FORA de conflito foi aceita';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; raise notice '✓ 4a  lista com ativo fora de conflito é recusada por inteiro (42501)';
  when others then
    v_falhas := v_falhas + 1; raise warning '✗ 4a  recusa por outro motivo: % / %', SQLSTATE, SQLERRM;
  end;

  -- e NADA foi apagado (o all-or-nothing de verdade, não só a mensagem)
  if exists (select 1 from public.ativos where id = v_a2)
     and exists (select 1 from public.ativos where id = v_solo) then
    v_ok := v_ok + 1; raise notice '✓ 4b  depois da recusa, NENHUM dos dois foi apagado';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 4b  a recusa apagou alguma coisa';
  end if;

  -- ativo SEM IDENTIDADE (nunca em conflito) também é recusado
  begin
    perform public.apagar_ativos_conflito_filiais(
      array[v_sem_id], 'APAGAR 1', 'tentativa com ativo sem identidade');
    v_falhas := v_falhas + 1; raise warning '✗ 4c  ativo sem identidade foi aceito';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; raise notice '✓ 4c  ativo sem identidade (sem patrimônio e sem tag) é recusado';
  when others then
    v_falhas := v_falhas + 1; raise warning '✗ 4c  recusa por outro motivo: %', SQLSTATE;
  end;

  -- id INEXISTENTE recusa antes de qualquer coisa
  begin
    perform public.apagar_ativos_conflito_filiais(
      array['00000000-f24a-4000-8000-00000000ffff'::uuid], 'APAGAR 1', 'tentativa com id inexistente');
    v_falhas := v_falhas + 1; raise warning '✗ 4d  id inexistente foi aceito';
  exception when others then
    if SQLSTATE = 'P0002' then
      v_ok := v_ok + 1; raise notice '✓ 4d  id inexistente é recusado (P0002)';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 4d  recusa por outro motivo: %', SQLSTATE;
    end if;
  end;

  -- id REPETIDO no array não infla a contagem que a pessoa confirmou
  begin
    perform public.apagar_ativos_conflito_filiais(
      array[v_a2, v_a2, v_a2], 'APAGAR 3', 'tentativa com id repetido inflando a contagem');
    v_falhas := v_falhas + 1; raise warning '✗ 4e  "APAGAR 3" com o mesmo id três vezes foi aceito';
  exception when others then
    if SQLSTATE = '22023' then
      v_ok := v_ok + 1; raise notice '✓ 4e  id repetido é deduplicado: "APAGAR 3" não confere para 1 ativo';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 4e  recusa por outro motivo: %', SQLSTATE;
    end if;
  end;

  -- ==========================================================================
  -- §3  A RPC APAGA — um lado, vários, ambos
  -- ==========================================================================
  -- (a) UM lado: o grupo de 3 (v_a1/v_a2/v_c3) perde o v_c3 e continua conflito
  if v_c3 is not null then
    v_jsonb := public.apagar_ativos_conflito_filiais(
      array[v_c3], 'APAGAR 1', 'resolvendo o conflito: este cadastro e o errado');
    if (v_jsonb->>'ativos')::int = 1 and not exists (select 1 from public.ativos where id = v_c3) then
      v_ok := v_ok + 1; raise notice '✓ 3a  apagou UM lado e devolveu as contagens';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 3a  a exclusão de um lado não bateu: %', v_jsonb;
    end if;

    select ativos into v_n from public.v_conflitos_filiais_grupos where rotulo = 'WAP0009101' limit 1;
    if v_n = 2 then
      v_ok := v_ok + 1; raise notice '✓ 3b  o grupo continua (2 lados) depois de apagar o terceiro';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 3b  esperava 2 lados restantes, veio %', v_n;
    end if;
  end if;

  -- (b) a TRILHA foi gravada na mesma transação, com backup e justificativa
  select detalhe into v_jsonb from public.eventos_admin
   where acao = 'conflito_filiais_resolvido' order by quando desc limit 1;
  if v_jsonb is not null
     and v_jsonb ? 'justificativa' and v_jsonb ? 'backup' and v_jsonb ? 'selecionados' then
    v_ok := v_ok + 1; raise notice '✓ 3c  a trilha traz justificativa, backup e os selecionados';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 3c  trilha ausente ou incompleta: %', v_jsonb;
  end if;

  if (v_jsonb->'backup'->0->'ativo'->>'patrimonio') = 'WAP0009101' then
    v_ok := v_ok + 1; raise notice '✓ 3d  o backup jsonb guarda a linha do ativo apagado';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 3d  o backup não tem a linha do ativo';
  end if;

  -- (c) APAGAR AMBOS — o grupo some inteiro
  v_jsonb := public.apagar_ativos_conflito_filiais(
    array[v_b1, v_b2], 'APAGAR 2', 'os dois cadastros estao errados, refazer do zero');
  if (v_jsonb->>'ativos')::int = 2
     and not exists (select 1 from public.v_conflitos_filiais where ativo_id in (v_b1, v_b2)) then
    v_ok := v_ok + 1; raise notice '✓ 3e  "apagar ambos" funciona e o grupo some da fonte';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 3e  apagar ambos falhou: %', v_jsonb;
  end if;

  -- (d) a movimentação do lado apagado foi junto (o rastro inteiro)
  if not exists (select 1 from public.movimentacoes where ativo_id in (v_b1, v_b2)) then
    v_ok := v_ok + 1; raise notice '✓ 3f  o rastro (movimentações) do cadastro apagado foi junto';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 3f  sobrou movimentação de ativo apagado';
  end if;

  -- ==========================================================================
  -- §8  TERMO DE LOTE — misto recusa; termo só da seleção passa
  -- ==========================================================================
  -- O par e o termo de lote misto já nasceram no bloco de FIXTURES, como dono — criá-los aqui,
  -- com a sessão já em `authenticated`, esbarraria no WITH CHECK da RLS de `termos_gerados`.
  begin
    perform public.apagar_ativos_conflito_filiais(
      array[v_x1], 'APAGAR 1', 'tentativa com termo de lote misto no caminho');
    v_falhas := v_falhas + 1; raise warning '✗ 8a  termo de lote misto NÃO impediu a exclusão';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; raise notice '✓ 8a  termo que cobre ativo fora da seleção recusa a exclusão';
  when others then
    v_falhas := v_falhas + 1; raise warning '✗ 8a  recusa por outro motivo: % / %', SQLSTATE, SQLERRM;
  end;

  -- o mesmo termo, agora cobrindo SÓ o que está na seleção → passa.
  -- ⚠ O UPDATE sai da sessão de `authenticated` (a RLS de `termos_gerados` recusaria), e a
  -- sessão do admin é reposta logo em seguida — a asserção seguinte precisa dela.
  reset role;
  update public.termos_gerados set ativo_ids = array[v_x1] where id = v_termo;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);
  v_jsonb := public.apagar_ativos_conflito_filiais(
    array[v_x1], 'APAGAR 1', 'agora o termo cobre so este cadastro');
  if (v_jsonb->>'termos')::int = 1
     and (v_jsonb->'arquivos_termos'->>0) = 'termos/f24-misto.docx' then
    v_ok := v_ok + 1; raise notice '✓ 8b  termo só da seleção é apagado e o .docx volta para a action limpar';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 8b  o termo/arquivo não voltou certo: %', v_jsonb;
  end if;

  -- ==========================================================================
  -- §7  TRANSFERÊNCIA para a filial do gêmeo
  -- ==========================================================================
  -- (o par v_t1/v_t2 já nasceu no bloco de FIXTURES, como dono)
  begin
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, filial_destino_id, criado_por, created_at)
      values (v_t1, 'transferencia', current_date, v_f1, v_f2, k_admin, now());
    v_falhas := v_falhas + 1; raise warning '✗ 7a  transferir para a filial do gêmeo foi ACEITO';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; raise notice '✓ 7a  transferir para a filial do gêmeo é recusado com mensagem própria';
  when unique_violation then
    v_falhas := v_falhas + 1; raise warning '✗ 7a  recusou, mas pelo 23505 cru (a guarda da 0097 não pegou)';
  when others then
    v_falhas := v_falhas + 1; raise warning '✗ 7a  recusa por outro motivo: % / %', SQLSTATE, SQLERRM;
  end;

  -- transferência para uma filial LIVRE continua passando (a recusa é ESTREITA)
  if v_f3 is not null then
    begin
      insert into public.movimentacoes (ativo_id, tipo, data, filial_id, filial_destino_id, criado_por, created_at)
        values (v_t1, 'transferencia', current_date, v_f1, v_f3, k_admin, now())
        returning id into v_mov_transf;
      select filial_id into v_n from public.ativos where id = v_t1;
      if v_n = v_f3 then
        v_ok := v_ok + 1; raise notice '✓ 7b  transferência para filial LIVRE continua funcionando';
      else
        v_falhas := v_falhas + 1; raise warning '✗ 7b  a transferência não mudou a filial';
      end if;
    exception when others then
      v_falhas := v_falhas + 1; raise warning '✗ 7b  transferência para filial livre foi recusada: %', SQLERRM;
    end;
  end if;

  -- ==========================================================================
  -- §9  O ESTORNO COMUM continua funcionando (a regressão mais perigosa)
  -- ==========================================================================
  if v_mov_transf is not null then
    begin
      insert into public.movimentacoes (ativo_id, tipo, data, filial_id, estorno_de, criado_por, created_at)
        values (v_t1, 'estorno', current_date, v_f3, v_mov_transf, k_admin, now() + interval '1 second');
      select filial_id into v_n from public.ativos where id = v_t1;
      if v_n = v_f1 then
        v_ok := v_ok + 1; raise notice '✓ 9a  o estorno da transferência devolveu o ativo à filial de origem';
      else
        v_falhas := v_falhas + 1; raise warning '✗ 9a  o estorno não devolveu a filial (ficou %)', v_n;
      end if;
    exception when others then
      v_falhas := v_falhas + 1; raise warning '✗ 9a  o estorno comum QUEBROU: % / %', SQLSTATE, SQLERRM;
    end;
  end if;

  -- ==========================================================================
  -- §6  A F23 INTACTA
  -- ==========================================================================
  -- (a) a guarda continua INSTALADA nas três tabelas (a prova comportamental do DELETE
  --     direto vive em dev_destrutivo.sql §2 — ver o cabeçalho deste arquivo)
  select count(*) into v_n
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal
     and t.tgfoid = 'public.guarda_acervo()'::regprocedure
     and c.relname in ('ativos', 'movimentacoes', 'lancamentos_item');
  if v_n = 3 then
    v_ok := v_ok + 1; raise notice '✓ 6a  guarda_acervo continua instalada nas três tabelas';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 6a  guarda_acervo instalada em % tabelas (esperava 3)', v_n;
  end if;

  -- (b) a janela FECHA quando a RPC estoura no meio
  begin
    perform public.apagar_ativos_conflito_filiais(array[v_solo], 'APAGAR 1', 'provocando erro de proposito');
  exception when others then null;
  end;
  if coalesce(current_setting('estoque.dev_destrutivo', true), '') <> 'on' then
    v_ok := v_ok + 1; raise notice '✓ 6b  a janela GUC fica FECHADA depois de a RPC estourar';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 6b  a janela GUC ficou ABERTA após erro';
  end if;

  -- (c) `apagar_ativo` do DEV continua funcionando (a F23 não foi tocada)
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);
  begin
    v_jsonb := public.apagar_ativo(v_solo, 'WAP0009199', 'conferindo que a ferramenta do dev segue de pe');
    if not exists (select 1 from public.ativos where id = v_solo) then
      v_ok := v_ok + 1; raise notice '✓ 6c  apagar_ativo (F23, cargo dev) continua funcionando';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 6c  apagar_ativo não apagou';
    end if;
  exception when others then
    v_falhas := v_falhas + 1; raise warning '✗ 6c  apagar_ativo QUEBROU: % / %', SQLSTATE, SQLERRM;
  end;

  -- (d) o ADMIN continua SEM alcance às ferramentas da Zona destrutiva
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);
  begin
    perform public.apagar_ativo(v_a2, 'WAP0009101', 'admin nao pode usar a ferramenta do dev');
    v_falhas := v_falhas + 1; raise warning '✗ 6d  o ADMIN executou apagar_ativo (exclusividade do dev quebrada)';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; raise notice '✓ 6d  o admin continua SEM apagar_ativo — a exceção da F24 é só a mesa';
  when others then
    v_falhas := v_falhas + 1; raise warning '✗ 6d  recusa por outro motivo: %', SQLSTATE;
  end;

  reset role;

  -- ==========================================================================
  -- §10  F52 (0132) — A GUARDA DE ESCOPO NOVA: exigir_ativos_da_empresa
  -- ==========================================================================
  -- A 0132 acrescenta `exigir_ativos_da_empresa`, chamada de dentro de
  -- `apagar_ativos_conflito_filiais` depois da etapa (3) do lock em dois tempos e
  -- antes da revalidação do grupo. Hoje ela NÃO LEVANTA NUNCA (uma empresa só) —
  -- então este bloco não prova recusa (não há o que recusar ainda); prova que a
  -- FECHADURA está no lugar certo e que o caminho feliz segue de pé com ela no
  -- meio. É o PAR da guarda no-op que a regra 1 da ordem F52 exige: um cenário
  -- que recusaria o alheio (aqui, hoje, inerte) e um que aceita o legítimo (10d).

  -- (a) a função existe, é SECURITY DEFINER e está FECHADA nos quatro papéis —
  --     o mesmo padrão de `import_substituir.sql:191-219` (asserção 0e), aqui
  --     para uma função só. O PUBLIC não é role: sua concessão vive em `proacl`,
  --     não em `has_function_privilege` — revogar de `anon` sem revogar de
  --     `public` é no-op silencioso (a lição da F50, registrada em MEMORY.md).
  select count(*) into v_n
    from (values ('anon'), ('authenticated'), ('service_role')) r(rolname)
   where has_function_privilege(r.rolname, 'public.exigir_ativos_da_empresa(uuid[])', 'execute');

  select v_n + count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'exigir_ativos_da_empresa'
     and array_to_string(coalesce(p.proacl, '{}'::aclitem[]), ',') like '=%X%';

  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 10a exigir_ativos_da_empresa está fechada nos quatro papéis (public, anon, authenticated, service_role)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 10a exigir_ativos_da_empresa tem % concessão(ões) de EXECUTE viva(s) — a superfície de RPC cresceu', v_n;
  end if;

  -- (b) apagar_ativos_conflito_filiais CITA a guarda, e na ORDEM certa: depois da
  --     etapa (3) do lock (o comentário que só existe ali, "trava o RESTO do
  --     grupo") e antes da revalidação ("with ident as ("). position() sobre o
  --     texto REAL do corpo no catálogo — não sobre o arquivo da migration — é
  --     o que prova que a guarda não foi parar antes dos locks NO BANCO QUE VAI
  --     RODAR, e não só na leitura humana do .sql.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'apagar_ativos_conflito_filiais';

  v_pos_call   := position('public.exigir_ativos_da_empresa(v_ids)' in v_def);
  v_pos_etapa3 := position('trava o RESTO do grupo' in v_def);
  v_pos_ident  := position('with ident as (' in v_def);

  if v_pos_call > 0 and v_pos_etapa3 > 0 and v_pos_ident > 0
     and v_pos_etapa3 < v_pos_call and v_pos_call < v_pos_ident then
    v_ok := v_ok + 1; raise notice '✓ 10b a chamada a exigir_ativos_da_empresa vem DEPOIS da etapa (3) do lock e ANTES da revalidação do grupo';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 10b ordem errada ou chamada sumiu do corpo (etapa3=%, chamada=%, with ident=%)', v_pos_etapa3, v_pos_call, v_pos_ident;
  end if;

  -- (c) a chamada fica FORA da janela `estoque.dev_destrutivo`: a posição da
  --     chamada tem de ser MENOR que a do set_config que ABRE a janela — o
  --     'on', não o 'off' (que fecha, duas vezes, mais abaixo). A busca usa
  --     aspas reais (via chr(39)) para casar só com o SET_CONFIG de verdade, e
  --     não com o comentário que apenas MENCIONA `estoque.dev_destrutivo` entre
  --     crases, mais acima no corpo (o que daria posição menor por engano).
  v_pos_janela := position(
    (chr(39) || 'estoque.dev_destrutivo' || chr(39) || ', ' || chr(39) || 'on' || chr(39))
    in v_def);

  if v_pos_janela > 0 and v_pos_call < v_pos_janela then
    v_ok := v_ok + 1; raise notice '✓ 10c a chamada acontece FORA da janela destrutiva — não há guarda a desarmar';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 10c a chamada está dentro (ou depois) da abertura da janela dev_destrutivo (chamada=%, janela=%)', v_pos_call, v_pos_janela;
  end if;

  -- (d) O PAR POSITIVO — a decisão 1 da ordem F52. v_t1/v_t2 (§7/§9) NUNCA foram
  --     apagados por este roteiro e SEGUEM em conflito: apagar um grupo
  --     LEGÍTIMO continua funcionando com exigir_ativos_da_empresa no meio do
  --     caminho. §3a/§3e/§8b já provavam isso de passagem (todas rodaram DEPOIS
  --     da 0132 aplicada); este é o rótulo EXPLÍCITO que a ordem pede.
  select count(*) into v_n from public.v_conflitos_filiais where ativo_id in (v_t1, v_t2);
  if v_n = 2 then
    v_ok := v_ok + 1; raise notice '✓ 10d-fixture o par v_t1/v_t2 segue em conflito, intacto para o par positivo';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 10d-fixture v_t1/v_t2 não está mais em conflito (% lado(s)) — a fixture não serve mais para o par positivo', v_n;
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);
  begin
    v_jsonb := public.apagar_ativos_conflito_filiais(
      array[v_t1, v_t2], 'APAGAR 2',
      'par positivo da guarda de escopo F52: exclusao legitima de conflito continua passando');
    if (v_jsonb->>'ativos')::int = 2
       and not exists (select 1 from public.ativos where id in (v_t1, v_t2)) then
      v_ok := v_ok + 1; raise notice '✓ 10d o par da guarda: exclusão LEGÍTIMA de um grupo em conflito continua funcionando com exigir_ativos_da_empresa no caminho';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 10d a exclusão legítima não bateu com a guarda nova no caminho: %', v_jsonb;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; raise warning '✗ 10d a exclusão legítima QUEBROU com a guarda nova no caminho: % / %', SQLSTATE, SQLERRM;
  end;
  reset role;

  -- ==========================================================================
  -- §11  F54 — O BACKUP EM ARQUIVO, ACIMA DO TETO DE 25 ATIVOS
  -- ==========================================================================
  -- A adoção da quarentena `conflito-backup-em-arquivo-sem-prefixo-do-digest`
  -- (`scripts/db/mutacoes.mjs`), reapontada pela F52 para esta fase. O que faltava não era
  -- asserção fraca: era CENÁRIO INEXISTENTE — a maior seleção que este roteiro montava tinha
  -- 2 ativos, e `v_inline := (v_n <= 25)` mandava tudo pelo backup jsonb. O ramo do backup em
  -- ARQUIVO, com as três guardas em cascata que a 0100 escreveu, nunca era executado.
  --
  -- As três guardas, na ordem em que a RPC as aplica (0100, migração vigente na 0132):
  --   (1) o caminho VEIO?                    → 22023 "exige backup em arquivo"
  --   (2) está sob conflito/<digest>/ ?      → 22023 "não é o backup desta operação"
  --   (3) o objeto EXISTE em storage.objects → 22023 "não existe no bucket"
  -- A (2) é a correção que a 0100 fez: conferir só o prefixo `conflito/` aceitava o backup de
  -- QUALQUER outra exclusão que estivesse no bucket — inclusive a sobra de uma tentativa
  -- recusada —, e com ele até 200 cadastros sumiam com um "backup" que não continha nenhum.
  --
  -- ⚠ POR QUE OS 26 NASCEM AQUI, E NÃO NO BLOCO DE FIXTURES. §1a e §1b contam os grupos e os
  -- ativos em conflito do banco INTEIRO (4 grupos, 8 ativos). Treze grupos a mais no começo
  -- derrubariam as duas por aritmética, e não por regressão. Este bloco é o ÚLTIMO do
  -- roteiro: nada depois dele conta conflito global.
  --
  -- ⚠ POR QUE 13 PARES, e não 26 ativos numa filial com 26 gêmeos na outra. As duas formas
  -- dão a mesma seleção de 26 ativos em conflito; a primeira custa 26 linhas e a segunda, 52.
  -- Como a seleção leva os DOIS lados de cada par, todos os 26 estão em conflito no instante
  -- da chamada, que é o que a revalidação da RPC exige. Dados 100% fictícios (regra 2):
  -- patrimônios WAP0009601..WAP0009613, service tags F24-ST-L01..L13.
  with novos as (
    insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
    select 'WAP00096' || lpad(g::text, 2, '0'),
           'F24-ST-L' || lpad(g::text, 2, '0'),
           'notebook',
           f.fid,
           'importacao'
      from generate_series(1, 13) g
      cross join (values (v_f1::smallint), (v_f2::smallint)) f(fid)
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_lote from novos;

  -- Os caminhos são montados AQUI, como dono da transação: `digest_selecao_conflito` e
  -- `prefixo_backup_conflito` são fechadas nos quatro papéis (é o que a §5c prova), então
  -- chamá-las depois do `set local role authenticated` daria 42501 e abortaria o roteiro.
  v_sub           := v_lote[1:13];
  v_path_ok       := public.prefixo_backup_conflito() || public.digest_selecao_conflito(v_lote) || '/lote-f54.json';
  v_path_errado   := public.prefixo_backup_conflito() || public.digest_selecao_conflito(v_sub)  || '/lote-f54.json';
  v_path_fora     := 'zzf54/fora-do-prefixo.json';
  v_path_fantasma := public.prefixo_backup_conflito() || public.digest_selecao_conflito(v_lote) || '/nao-existe.json';

  -- ⚠ OS OBJETOS DE 11c E 11e PRECISAM EXISTIR, e é isso que torna as duas asserções
  -- HONESTAS. A cascata tem três guardas em sequência: se o caminho também não existisse no
  -- bucket, a guarda (3) recusaria mesmo com a (2) desligada, e os dois cenários ficariam
  -- verdes sobre uma guarda removida. Fazendo o objeto existir, o DIGEST passa a ser a única
  -- razão da recusa. Mesma lição de `import_fora_da_unidade.sql` §2a (F52).
  insert into storage.objects (bucket_id, name, owner) values
    ('backups-import', v_path_ok,     k_admin),
    ('backups-import', v_path_errado, k_admin),
    ('backups-import', v_path_fora,   k_admin);

  -- (a) a fixture existe e é do TAMANHO certo — sem isto, as quatro recusas abaixo poderiam
  --     estar recusando por "ativo fora de conflito", e não pelo backup.
  select count(*) into v_n from public.v_conflitos_filiais where ativo_id = any (v_lote);
  if cardinality(v_lote) = 26 and v_n = 26 then
    v_ok := v_ok + 1; raise notice '✓ 11a os 26 cadastros fictícios entraram e TODOS estão em conflito entre filiais (acima do teto de 25 que obriga backup em arquivo)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 11a a fixture dos 26 não montou: % ids, % em conflito', cardinality(v_lote), v_n;
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);

  -- (b) GUARDA 1 — acima do teto, sem caminho de backup, a RPC EXIGE o arquivo.
  --     `p_backup_path` tem default null: a chamada de três argumentos é exatamente o que a
  --     mesa manda hoje para qualquer seleção pequena, e é o que não pode passar aqui.
  begin
    perform public.apagar_ativos_conflito_filiais(
      v_lote, 'APAGAR 26', 'acima do teto o backup em arquivo e obrigatorio');
    v_falhas := v_falhas + 1; raise warning '✗ 11b 26 ativos SEM caminho de backup: a RPC apagou (deveria exigir arquivo)';
  exception when others then
    if SQLSTATE = '22023' and SQLERRM like '%exige backup em arquivo%' then
      v_ok := v_ok + 1; raise notice '✓ 11b acima do teto, sem caminho de backup, a RPC recusa (22023): %', SQLERRM;
    else
      v_falhas := v_falhas + 1; raise warning '✗ 11b recusa por outro motivo: % / %', SQLSTATE, SQLERRM;
    end if;
  end;

  -- (c) GUARDA 2, metade do PREFIXO — o objeto existe no bucket, mas fora de `conflito/`.
  begin
    perform public.apagar_ativos_conflito_filiais(
      v_lote, 'APAGAR 26', 'backup que existe no bucket mas fora do prefixo conflito', v_path_fora);
    v_falhas := v_falhas + 1; raise warning '✗ 11c backup fora do prefixo conflito/ foi ACEITO';
  exception when others then
    if SQLSTATE = '22023' and SQLERRM like '%não é o backup desta operação%' then
      v_ok := v_ok + 1; raise notice '✓ 11c backup fora do prefixo conflito/ é recusado pela guarda do caminho (22023)';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 11c recusa por outro motivo: % / %', SQLSTATE, SQLERRM;
    end if;
  end;

  -- (d) GUARDA 3 — caminho impecável (prefixo e digest DESTE lote) e objeto que não existe.
  --     Fica ANTES de 11e de propósito: é a guarda que sobra quando a do digest cai, e ela
  --     precisa ser exercitada por um caminho que a do digest deixaria passar.
  begin
    perform public.apagar_ativos_conflito_filiais(
      v_lote, 'APAGAR 26', 'caminho certo mas o arquivo nao foi para o bucket', v_path_fantasma);
    v_falhas := v_falhas + 1; raise warning '✗ 11d backup inexistente no bucket foi ACEITO';
  exception when others then
    if SQLSTATE = '22023' and SQLERRM like '%não existe no bucket%' then
      v_ok := v_ok + 1; raise notice '✓ 11d backup sob o digest certo mas ausente do bucket é recusado (22023)';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 11d recusa por outro motivo: % / %', SQLSTATE, SQLERRM;
    end if;
  end;

  -- (e) GUARDA 2, a metade do DIGEST — O CENÁRIO QUE A QUARENTENA PEDIA. O caminho está sob
  --     `conflito/`, o objeto EXISTE no bucket e mesmo assim tem de ser recusado, porque o
  --     digest é o de OUTRA seleção (um subconjunto destes mesmos ids). Sem a conferência do
  --     digest, este é o backup que apagaria 26 cadastros sem conter 13 deles.
  begin
    perform public.apagar_ativos_conflito_filiais(
      v_lote, 'APAGAR 26', 'exclusao de 26 conflitos acima do teto do backup inline', v_path_errado);
    v_falhas := v_falhas + 1; raise warning '✗ 11e o backup de OUTRA seleção foi aceito — a amarra pelo digest (0100) não está pegando';
  exception when others then
    if SQLSTATE = '22023' and SQLERRM like '%não é o backup desta operação%' then
      v_ok := v_ok + 1; raise notice '✓ 11e backup sob conflito/ mas com o digest de outra seleção é recusado (22023)';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 11e recusa por outro motivo: % / %', SQLSTATE, SQLERRM;
    end if;
  end;

  -- (f) as quatro recusas são all-or-nothing de verdade, não só mensagem.
  select count(*) into v_n from public.ativos where id = any (v_lote);
  if v_n = 26 then
    v_ok := v_ok + 1; raise notice '✓ 11f depois das quatro recusas de backup, os 26 continuam no acervo';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 11f alguma recusa apagou: sobraram % dos 26', v_n;
  end if;

  -- (g) O PAR POSITIVO, e o isolamento da guarda: MESMA seleção, MESMA justificativa, mesmo
  --     bucket — só o CAMINHO muda, do digest alheio (11e) para o do próprio lote. Se 11e e
  --     11g não fossem o mesmo cenário com o caminho trocado, a recusa de 11e poderia estar
  --     vindo de qualquer outra coisa.
  begin
    v_jsonb := public.apagar_ativos_conflito_filiais(
      v_lote, 'APAGAR 26', 'exclusao de 26 conflitos acima do teto do backup inline', v_path_ok);
    select count(*) into v_n from public.ativos where id = any (v_lote);
    if (v_jsonb->>'ativos')::int = 26 and v_n = 0 then
      v_ok := v_ok + 1; raise notice '✓ 11g com o backup do PRÓPRIO lote no bucket, a RPC apaga os 26 acima do teto';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 11g a exclusão acima do teto não bateu: % / sobraram % ativos', v_jsonb, v_n;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; raise warning '✗ 11g a exclusão com o backup certo QUEBROU: % / %', SQLSTATE, SQLERRM;
  end;

  -- (h) e a TRILHA diz a verdade sobre o backup: acima do teto ele é ARQUIVO, o caminho fica
  --     registrado e o campo jsonb NÃO vem preenchido (é o `v_inline` que decide os dois).
  --     O filtro é pelo tamanho do lote, e não por `order by quando desc`: todos os eventos
  --     desta transação carimbam o MESMO now(), e o desempate seria sorteio.
  select detalhe into v_jsonb from public.eventos_admin
   where acao = 'conflito_filiais_resolvido' and detalhe->>'ativos' = '26' limit 1;
  if v_jsonb is not null
     and (v_jsonb->>'backup_em_arquivo')::boolean
     and v_jsonb->>'backup_path' = v_path_ok
     and v_jsonb->'backup' = 'null'::jsonb then
    v_ok := v_ok + 1; raise notice '✓ 11h a trilha marca backup_em_arquivo, guarda o caminho conferido e NÃO duplica o backup em jsonb';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 11h a trilha do lote acima do teto não bate: %', v_jsonb;
  end if;

  reset role;

  -- ==========================================================================
  insert into _conflito_resumo values (v_ok, v_falhas,
    format('F24 conflito entre filiais — %s ok, %s falhas', v_ok, v_falhas));
  raise notice 'FIM conflito_filiais: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end
$$;

select * from _conflito_resumo;

rollback;
