-- =============================================================
-- Roteiro de teste: CARGO DEV — hierarquia, intocabilidade e arquivamento
-- (F22 — migrations 0071→0076).
--
-- Roda no job `banco` do CI (psql, ON_ERROR_STOP=1) e é auto-verificável no SQL editor / MCP.
-- Mesmo padrão dos demais roteiros da pasta:
--   NOTICE  '✓ ...'  quando a invariante bate
--   WARNING '✗ ...'  quando NÃO bate (o job `banco` falha em qualquer `WARNING: ✗`)
--
-- ARQUIVO SEPARADO de papeis_rls.sql, de propósito. Aquele roteiro tem 64 asserções cuja
-- ORDEM é semanticamente carregada (a 2h move um ativo de filial e precisa ser a última da
-- seção), e o cabeçalho dele promete um índice de seções que teria de ser reescrito. Um
-- arquivo novo entra no CI só por existir (o passo do CI é `for f in supabase/tests/*.sql`) e
-- não arrisca as premissas do vizinho.
--
-- ESCREVE (usuários, perfis, ativos, movimentações fictícias), então roda inteiro dentro de
-- `begin; ... rollback;` — nada sobra no banco. 100% AUTOSSUFICIENTE: cria tudo de que
-- precisa, para funcionar também num Postgres novo do CI.
--
-- DADOS 100% FICTÍCIOS (regra 2 do CLAUDE.md): patrimônios `WAP0009xxx`, nomes inventados,
-- e-mails `f22.*@wap.ind.br` de fantasia. Nenhum dado real da WAP — em particular, NENHUM dos
-- e-mails do §0 da ordem aparece aqui (eles vivem só na migration 0076).
--
-- O QUE ELE PROVA (critérios de aceitação 1, 2, 4, 5 e 8 da ordem F22):
--   1  dev é NÍVEL ADMIN — passa em tudo que e_admin() guarda (catálogo, auditoria,
--      import_logs, a RPC de import) E em tudo que a redefinição de função NÃO alcançaria
--      sozinha: escrita por filial, anotação, snapshot de relatório e o .docx do termo
--   2  dev é INTOCÁVEL — o admin não promove a dev, não rebaixa, não desativa, não apaga,
--      não mexe em vínculo e não encerra sessão de um dev; e a recusa vale também para
--      REQUEST FORJADO (authenticated escrevendo direto) e para o SERVICE ROLE (postgres),
--      que é o caminho que ignora RLS
--   3  dev PODE o que o admin não pode — conceder dev, rebaixar outro dev, apagar conta,
--      encerrar sessões
--   4  operador e consulta não alcançam NADA disso
--   5  autoproteção — ninguém age sobre o próprio acesso; e a trava do último administrador
--      ativo conta o dev junto (decisão registrada em docs/DECISOES.md)
--   6  o APAGAR preserva a AUTORIA — movimentação e anotação do apagado continuam lá, com o
--      nome resolvendo pelo join em profiles; e o apagado não lê mais nada
--
-- Ao final, uma linha em `_cargo_dev_resumo` com os contadores — é assim que se lê o
-- resultado pelo MCP, que engole NOTICE/WARNING.
-- =============================================================

begin;

create temp table _cargo_dev_resumo (ok int, falhas int, detalhe text);

-- ---------------------------------------------------------------------------
-- PRIVILÉGIOS DE TABELA — mesma razão do bloco de papeis_rls.sql
-- ---------------------------------------------------------------------------
-- O Supabase hospedado concede os privilégios de TABELA a `authenticated` por default
-- privilege; o Postgres novo do CI não. Sem este bloco o roteiro morre com
-- "permission denied for table ..." — que é resposta certa para a pergunta errada: aqui se
-- mede POLICY/GUARDA, não privilégio (quem mede privilégio é seguranca_catalogo.sql).
-- Regra: só entra a tabela/verbo que uma asserção deste arquivo realmente usa.
grant select on
  public.ativos,             -- 1e (dev escreve nas duas filiais), 6 (leitura do apagado)
  public.filiais,            -- resolução de filial
  public.profiles,           -- 2g (forjar), 6b (nome do autor sobrevive)
  public.movimentacoes,      -- 6a/6b (autoria preservada)
  public.anotacoes,          -- 6c
  public.eventos_admin,      -- 1b (dev lê a trilha — policy e_admin)
  public.import_logs         -- 1c (dev lê — policy e_admin)
  to authenticated;

grant insert, update, delete on
  public.ativos,             -- 1e
  public.motivos,            -- 1a (catálogo de admin — policy e_admin)
  public.anotacoes,          -- 1f (policy pode_escrever)
  public.relatorios_gerados  -- 1g (policy pode_escrever)
  to authenticated;

-- `profiles`: espelho EXATO do grant da 0063 — nunca `update` de TABELA. A asserção 2g
-- (request forjado de admin) depende disto: com UPDATE de tabela ela passaria por engano.
grant update (primeiro_nome, sobrenome) on public.profiles to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;   -- 1h

-- Trava do bloco acima (mesma de papeis_rls.sql). Falha ALTO antes de qualquer asserção.
do $trava$
begin
  if exists (
    select 1 from information_schema.table_privileges
     where table_schema = 'public' and table_name = 'profiles'
       and grantee = 'authenticated' and privilege_type = 'UPDATE'
  ) then
    raise exception 'O bloco de grants deste roteiro devolveu UPDATE de TABELA em profiles — a asserção 2g (request forjado) passaria por engano. Conceda coluna por coluna.';
  end if;
end
$trava$;

do $$
declare
  -- identidades fictícias (uuid fixo, hex válido — o prefixo f22a marca a fase)
  k_dev       uuid := '00000000-f22a-4000-8000-0000000000d1';
  k_dev2      uuid := '00000000-f22a-4000-8000-0000000000d2';
  k_admin     uuid := '00000000-f22a-4000-8000-0000000000a1';
  k_operador  uuid := '00000000-f22a-4000-8000-0000000000b2';
  k_consulta  uuid := '00000000-f22a-4000-8000-0000000000c3';
  k_vitima    uuid := '00000000-f22a-4000-8000-0000000000e5';
  -- ⚠ ALVO DEDICADO da asserção 2g-bis (o par positivo "o admin ainda promove um não-dev").
  -- Ele existe porque a primeira versão deste roteiro usava `k_consulta` ali — e promovê-lo a
  -- operador fazia a asserção 4d ("consulta não escreve nada"), lá embaixo, medir um OPERADOR
  -- e falhar. É a mesma armadilha que o cabeçalho do papeis_rls.sql documenta para a 2h: uma
  -- asserção que MUTA a fixture muda o significado de todas as que vêm depois. Regra para quem
  -- acrescentar asserção aqui: se ela GRAVA, dê a ela um alvo só seu.
  k_alvo      uuid := '00000000-f22a-4000-8000-0000000000f6';
  v_f1        smallint;
  v_f2        smallint;
  v_ativo_f1  uuid;
  v_ativo_f2  uuid;
  v_mov_vit   uuid;
  v_anot_vit  uuid;
  v_ok        int  := 0;
  v_falhas    int  := 0;
  v_msgs      text := '';
  v_n         int;
  v_papel     text;
  v_txt       text;
  v_bool      boolean;
  -- F48 — as duas metades do "o delete mirou o ALVO" do cenário 3d.
  v_sessoes_alvo  bigint;
  v_sessoes_outro bigint;
begin
  -- =========================================================================
  -- FIXTURES (como postgres — antes de qualquer troca de papel)
  -- =========================================================================
  select id into v_f1 from public.filiais where ativo order by id limit 1;
  select id into v_f2 from public.filiais where ativo and id <> v_f1 order by id limit 1;
  if v_f1 is null or v_f2 is null then
    raise warning '✗ 0 o banco precisa de ao menos DUAS filiais ativas para este roteiro';
    insert into _cargo_dev_resumo values (0, 1, 'sem duas filiais ativas');
    return;
  end if;

  -- O trigger handle_new_user cria o profile (e exige domínio corporativo — 0041/0057).
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (k_dev,      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f22.dev@wap.ind.br',      '', now(), now(), now()),
    (k_dev2,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f22.dev2@wap.ind.br',     '', now(), now(), now()),
    (k_admin,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f22.chefia@wap.ind.br',   '', now(), now(), now()),
    (k_operador, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f22.operador@wap.ind.br', '', now(), now(), now()),
    (k_consulta, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f22.consulta@wap.ind.br', '', now(), now(), now()),
    (k_vitima,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f22.vitima@wap.ind.br',   '', now(), now(), now()),
    (k_alvo,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f22.alvo@wap.ind.br',     '', now(), now(), now());

  update public.profiles set primeiro_nome = 'Fulano', sobrenome = 'de Teste' where id = k_vitima;

  update public.profiles set papel = 'admin'    where id = k_admin;
  update public.profiles set papel = 'operador' where id = k_operador;
  update public.profiles set papel = 'consulta' where id = k_consulta;
  update public.profiles set papel = 'consulta' where id = k_alvo;
  update public.profiles set papel = 'operador' where id = k_vitima;
  insert into public.operador_filiais (usuario_id, filial_id) values (k_operador, v_f1);

  -- ⚠ Plantar um DEV já exige o caminho oficial: o trigger `profiles_guarda_dev` (0073)
  -- recusa a concessão do cargo mesmo para o postgres. Abrir a janela aqui é, em si, a
  -- primeira demonstração de que a rede está armada — se ela não estivesse, este bloco
  -- funcionaria sem o set_config e a asserção 2h passaria de graça.
  perform set_config('estoque.gestao_usuarios', 'on', true);
  update public.profiles set papel = 'dev' where id in (k_dev, k_dev2);
  perform set_config('estoque.gestao_usuarios', 'off', true);

  -- Ativos em cada filial.
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009101', 'F22TST1', 'notebook', v_f1, 'cadastro') returning id into v_ativo_f1;
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009102', 'F22TST2', 'notebook', v_f2, 'cadastro') returning id into v_ativo_f2;

  -- HISTÓRICO DA VÍTIMA — o que a seção 6 exige que sobreviva ao apagar.
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, criado_por)
  values (v_ativo_f1, 'saida', current_date, v_f1, 'Sicrano de Teste', k_vitima)
  returning id into v_mov_vit;
  insert into public.anotacoes (ativo_id, texto, criado_por)
  values (v_ativo_f2, 'anotacao ficticia da vitima', k_vitima)
  returning id into v_anot_vit;

  -- Fixtures das tabelas fechadas (num banco NOVO elas nascem vazias, e "ver 0 linhas de
  -- tabela vazia" não prova policy nenhuma).
  insert into public.import_logs (
    filial_id, modo, arquivo_hash, total_linhas,
    ativos_criados, movs_apagadas, anotacoes_apagadas, termos_apagados,
    backup_path, correcoes, criado_por
  ) values (v_f1, 'substituir', 'hash-f22', 0, 0, 0, 0, 0, 'f22/backup.csv', '[]'::jsonb, k_admin);
  insert into public.eventos_admin (acao, autor, alvo, detalhe)
  values ('papel_alterado', k_admin, 'f22.operador@wap.ind.br', '{"de":"consulta","para":"operador"}'::jsonb);

  -- =========================================================================
  -- 1 — DEV É NÍVEL ADMINISTRADOR (e mais do que e_admin() sozinho entrega)
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);

  -- 1z. o cargo resolve, e as três funções concordam
  select public.papel_atual()::text into v_papel;
  if v_papel = 'dev' and public.e_dev() and public.e_admin() and public.pode_escrever() then
    v_ok := v_ok + 1; raise notice '✓ 1z papel_atual()=dev e e_dev()/e_admin()/pode_escrever() = true';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1z; ';
    raise warning '✗ 1z papel=% e_dev=% e_admin=% pode_escrever=%',
      v_papel, public.e_dev(), public.e_admin(), public.pode_escrever();
  end if;

  -- 1a. catálogo de admin (policy e_admin) — o ganho da redefinição
  begin
    insert into public.motivos (codigo, rotulo, aplica_a) values ('f22_teste', 'Motivo F22', array['saida']::public.tipo_movimentacao[]);
    v_ok := v_ok + 1; raise notice '✓ 1a dev INSERE em motivos (policy e_admin)';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1a; ';
    raise warning '✗ 1a dev recusado ao inserir motivo (%) %', sqlstate, sqlerrm;
  end;

  -- 1b / 1c. as duas leituras restritas a admin
  select count(*) into v_n from public.eventos_admin;
  if v_n >= 1 then
    v_ok := v_ok + 1; raise notice '✓ 1b dev LÊ eventos_admin (% linhas)', v_n;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1b; ';
    raise warning '✗ 1b dev não leu eventos_admin (viu % linhas)', v_n;
  end if;

  select count(*) into v_n from public.import_logs;
  if v_n >= 1 then
    v_ok := v_ok + 1; raise notice '✓ 1c dev LÊ import_logs (% linhas)', v_n;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1c; ';
    raise warning '✗ 1c dev não leu import_logs (viu % linhas)', v_n;
  end if;

  -- 1d. a RPC mais destrutiva do sistema NÃO recusa o dev POR CARGO. Ela vai falhar (o plano
  -- é vazio), mas a mensagem não pode ser a da guarda de cargo — é assim que se separa
  -- "recusado por ser quem é" de "recusado porque o pedido era inválido".
  --
  -- ⚠ FORTALECIDO NA F52 (08/09/2026). A versão anterior só conferia se sqlerrm continha
  -- "administradores" — então QUALQUER outra exceção (42883 função inexistente, 42P01
  -- tabela inexistente, erro de tipo no jsonb…) caía no ramo `else` e era contada como
  -- "✓ dev passou pela guarda de cargo", quando na verdade a RPC (ou algo que ela chama)
  -- nem chegou a rodar. Agora o SQLSTATE entra na conferência ANTES da mensagem: 42883 e
  -- 42P01 são reprovados explicitamente — objeto ausente não é "passou pela guarda por
  -- outro motivo", é fixture (ou a própria migration 0131/0132) fora do lugar, e quem tem
  -- de gritar é o teste, não aplaudir. Fortalecer não é afrouxar: tudo que 1d reprovava
  -- antes (a mensagem com "administradores") continua reprovando, sem exceção.
  begin
    perform public.importar_ativos_substituir('{}'::jsonb, 'f22/x.csv', '{}'::jsonb, '[]'::jsonb);
    v_ok := v_ok + 1; raise notice '✓ 1d dev passou pela guarda de cargo da RPC de import';
  exception when others then
    if sqlstate in ('42883', '42P01') then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '1d_FUNCAO_OU_TABELA_AUSENTE; ';
      raise warning '✗ 1d a RPC de import (ou algo que ela chama) não existe (%) % — isto NÃO é "passou pela guarda", é objeto ausente', sqlstate, sqlerrm;
    elsif lower(sqlerrm) like '%administradores%' then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '1d_RECUSOU_DEV; ';
      raise warning '✗ 1d a RPC de import recusou o DEV por cargo: %', sqlerrm;
    else
      v_ok := v_ok + 1;
      raise notice '✓ 1d dev passou pela guarda de cargo da RPC de import (falhou adiante, por outro motivo: % %)', sqlstate, sqlerrm;
    end if;
  end;

  -- 1e. ESCRITA POR FILIAL — o buraco que e_admin() não tapa (pode_escrever_filial).
  --     Nas DUAS filiais, sem nenhuma linha em operador_filiais.
  begin
    insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
    values ('WAP0009111', 'F22DEV1', 'notebook', v_f1, 'cadastro');
    insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
    values ('WAP0009112', 'F22DEV2', 'notebook', v_f2, 'cadastro');
    v_ok := v_ok + 1; raise notice '✓ 1e dev INSERE ativo nas DUAS filiais, sem vínculo';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1e_SEM_ESCRITA_DE_FILIAL; ';
    raise warning '✗ 1e dev recusado ao inserir ativo (%) % — pode_escrever_filial não conhece dev', sqlstate, sqlerrm;
  end;

  -- 1f / 1g. as duas policies que gateavam por LISTA LITERAL de cargo (agora pode_escrever())
  begin
    insert into public.anotacoes (ativo_id, texto, criado_por) values (v_ativo_f1, 'nota do dev', k_dev);
    v_ok := v_ok + 1; raise notice '✓ 1f dev ANOTA (policy pode_escrever)';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1f_LISTA_LITERAL; ';
    raise warning '✗ 1f dev recusado ao anotar (%) — a policy ainda tem lista literal de cargo', sqlstate;
  end;

  begin
    insert into public.relatorios_gerados (periodo_de, periodo_ate, filial_id, versao, dados, gerado_por)
    values (current_date, current_date, v_f1, 1, '{}'::jsonb, k_dev);
    v_ok := v_ok + 1; raise notice '✓ 1g dev GERA snapshot de relatório (policy pode_escrever)';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1g_LISTA_LITERAL; ';
    raise warning '✗ 1g dev recusado ao gerar relatório (%) — a policy ainda tem lista literal de cargo', sqlstate;
  end;

  -- 1h. o .docx do termo (storage). Sem isto o termo do dev ficaria pela METADE: a linha em
  --     termos_gerados passa (deriva de e_admin), o arquivo não.
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('termos', gen_random_uuid()::text || '.docx', k_dev);
    v_ok := v_ok + 1; raise notice '✓ 1h dev GRAVA no bucket termos (policy pode_escrever)';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1h_LISTA_LITERAL_STORAGE; ';
    raise warning '✗ 1h dev recusado ao gravar .docx (%) — a policy do bucket ainda tem lista literal', sqlstate;
  end;

  reset role;

  -- =========================================================================
  -- 2 — O DEV É INTOCÁVEL POR QUEM ESTÁ ABAIXO
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);

  -- 2a. admin NÃO promove ninguém a dev
  begin
    perform public.definir_papel_usuario(k_operador, 'dev');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2a_ADMIN_PROMOVEU_DEV; ';
    raise warning '✗ 2a ADMIN CONCEDEU o cargo dev (deveria ser recusado)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 2a admin recusado ao conceder dev (%)', sqlstate;
  end;

  -- 2b. admin NÃO rebaixa um dev
  begin
    perform public.definir_papel_usuario(k_dev, 'consulta');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2b_ADMIN_REBAIXOU_DEV; ';
    raise warning '✗ 2b ADMIN REBAIXOU um dev (deveria ser recusado)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 2b admin recusado ao rebaixar dev (%)', sqlstate;
  end;

  -- 2c. admin NÃO desativa um dev
  begin
    perform public.definir_status_usuario(k_dev, false);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2c_ADMIN_DESATIVOU_DEV; ';
    raise warning '✗ 2c ADMIN DESATIVOU um dev (deveria ser recusado)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 2c admin recusado ao desativar dev (%)', sqlstate;
  end;

  -- 2d. admin NÃO apaga um dev
  begin
    perform public.apagar_usuario(k_dev);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2d_ADMIN_APAGOU_DEV; ';
    raise warning '✗ 2d ADMIN APAGOU um dev (deveria ser recusado)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 2d admin recusado ao apagar dev (%)', sqlstate;
  end;

  -- 2e. admin NÃO mexe nos vínculos de um dev
  begin
    perform public.definir_vinculos_usuario(k_dev, array[v_f1]::smallint[]);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2e_ADMIN_MEXEU_VINCULO_DEV; ';
    raise warning '✗ 2e ADMIN alterou os vínculos de um dev (deveria ser recusado)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 2e admin recusado ao mexer em vínculo de dev (%)', sqlstate;
  end;

  -- 2f. admin NÃO encerra sessões (nem de um dev, nem de ninguém — a ação é privativa do dev)
  begin
    perform public.encerrar_sessoes_usuario(k_operador);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2f_ADMIN_ENCERROU_SESSAO; ';
    raise warning '✗ 2f ADMIN encerrou sessões (deveria ser privativo do dev)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 2f admin recusado ao encerrar sessões (%)', sqlstate;
  end;

  -- 2f-bis. admin NÃO apaga NINGUÉM (apagar é privativo do dev, mesmo com alvo comum)
  begin
    perform public.apagar_usuario(k_operador);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2f-bis_ADMIN_APAGOU; ';
    raise warning '✗ 2f-bis ADMIN apagou um usuário comum (deveria ser privativo do dev)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 2f-bis admin recusado ao apagar usuário comum (%)', sqlstate;
  end;

  -- 2g. REQUEST FORJADO: o admin larga a RPC e escreve direto em profiles. O grant de coluna
  --     da 0063 é quem barra aqui (papel não está entre primeiro_nome/sobrenome).
  begin
    update public.profiles set papel = 'dev' where id = k_admin;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      v_ok := v_ok + 1; raise notice '✓ 2g request forjado do admin não afetou linha nenhuma';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '2g_FORJOU; ';
      raise warning '✗ 2g ADMIN se promoveu a dev por UPDATE direto (% linha[s])', v_n;
    end if;
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 2g request forjado do admin recusado (%)', sqlstate;
  end;

  -- 2g-bis. E o admin CONTINUA podendo o que sempre pôde (par positivo — sem ele, uma guarda
  --         que fechasse para TODOS passaria em 2a..2f sem ninguém perceber).
  begin
    perform public.definir_papel_usuario(k_alvo, 'operador');
    select p.papel::text into v_papel from public.profiles p where p.id = k_alvo;
    if v_papel = 'operador' then
      v_ok := v_ok + 1; raise notice '✓ 2g-bis admin AINDA promove um não-dev (consulta → operador)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '2g-bis_NAO_GRAVOU; ';
      raise warning '✗ 2g-bis a RPC não gravou: papel ficou %', v_papel;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2g-bis_REGRESSAO; ';
    raise warning '✗ 2g-bis REGRESSÃO: admin recusado ao promover um não-dev (%) %', sqlstate, sqlerrm;
  end;

  reset role;

  -- 2h/2i/2j. O CAMINHO QUE IGNORA RLS: postgres (o papel do service role e do SQL editor).
  -- É aqui que a rede da 0073 é a única coisa que existe — não há policy que segure este
  -- caminho, e é exatamente o caminho que as Server Actions usavam até a F21.
  begin
    update public.profiles set papel = 'dev' where id = k_admin;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2h_SERVICE_ROLE_CONCEDEU_DEV; ';
    raise warning '✗ 2h SERVICE ROLE concedeu o cargo dev por UPDATE direto';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 2h service role recusado ao conceder dev (%)', sqlstate;
  end;

  begin
    update public.profiles set papel = 'operador' where id = k_dev;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2i_SERVICE_ROLE_REBAIXOU_DEV; ';
    raise warning '✗ 2i SERVICE ROLE rebaixou um dev por UPDATE direto';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 2i service role recusado ao rebaixar dev (%)', sqlstate;
  end;

  begin
    update public.profiles set ativo = false where id = k_dev;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2i-bis_SERVICE_ROLE_DESATIVOU_DEV; ';
    raise warning '✗ 2i-bis SERVICE ROLE desativou um dev por UPDATE direto';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 2i-bis service role recusado ao desativar dev (%)', sqlstate;
  end;

  begin
    delete from public.profiles where id = k_dev;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2j_SERVICE_ROLE_APAGOU_DEV; ';
    raise warning '✗ 2j SERVICE ROLE apagou a linha de um dev';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 2j service role recusado ao apagar perfil dev (%)', sqlstate;
  end;

  -- 2j-bis. PAR POSITIVO da rede: mexer em NÃO-dev pelo caminho direto continua funcionando
  --         (senão a rede estaria simplesmente travando a tabela inteira).
  begin
    update public.profiles set primeiro_nome = 'Fulano' where id = k_vitima;
    v_ok := v_ok + 1; raise notice '✓ 2j-bis a rede NÃO atrapalha update de perfil comum';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2j-bis_REDE_TRAVOU_TUDO; ';
    raise warning '✗ 2j-bis a rede bloqueou um update legítimo de perfil comum: %', sqlerrm;
  end;

  -- 5d. A trava do ÚLTIMO administrador conta o dev junto: com dois devs e um admin no banco,
  -- `existe_outro_admin_ativo()` tem de enxergar os devs. Se ela ignorasse o cargo novo, um
  -- sistema cujo único acesso administrativo fosse um dev se acharia sem administrador nenhum.
  --
  -- ⚠ ELA RODA AQUI, COMO POSTGRES, e não junto das outras autoproteções da seção 5: a
  -- migration 0078 revogou o EXECUTE de `authenticated` nesta função (ela só é chamada de
  -- DENTRO das RPCs de gestão, que são definer e executam como o dono). Chamá-la com papel
  -- simulado daria "permission denied" — que não é o que esta asserção quer medir. O estado
  -- das fixtures neste ponto é o mesmo da seção 5.
  select public.existe_outro_admin_ativo(k_admin) into v_bool;
  if v_bool then
    v_ok := v_ok + 1; raise notice '✓ 5d existe_outro_admin_ativo() conta os devs (nível administrador)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5d_DEV_NAO_CONTA; ';
    raise warning '✗ 5d existe_outro_admin_ativo() ignorou os devs — a trava do último admin contaria errado';
  end if;

  -- 5e. E as duas auxiliares NÃO estão mais expostas na API (0078). Medir aqui é barato e
  -- impede que um `grant` distraído as devolva sem ninguém notar.
  -- F52: a assinatura passou a ser (uuid, uuid) — a de 1 argumento foi DROPADA na 0132,
  -- porque mantê-la ao lado da nova faria a chamada de 1 argumento (que as três RPCs da
  -- 0074 fazem) levantar 42725 "function is not unique". ⚠ `has_function_privilege` com
  -- assinatura inexistente LEVANTA exceção em vez de devolver false: citar a antiga aqui
  -- não deixava a asserção vermelha, ABORTAVA o roteiro inteiro.
  if not has_function_privilege('authenticated', 'public.existe_outro_admin_ativo(uuid, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.exigir_gestao_de(uuid, public.papel_usuario)', 'execute') then
    v_ok := v_ok + 1; raise notice '✓ 5e as auxiliares de gestão não são executáveis por authenticated';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5e_AUXILIAR_EXPOSTA; ';
    raise warning '✗ 5e uma auxiliar de gestão voltou a ser executável por authenticated';
  end if;

  -- =========================================================================
  -- 3 — O QUE SÓ O DEV PODE
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);

  -- 3a. dev CONCEDE o cargo dev
  begin
    perform public.definir_papel_usuario(k_operador, 'dev');
    select p.papel::text into v_papel from public.profiles p where p.id = k_operador;
    if v_papel = 'dev' then
      v_ok := v_ok + 1; raise notice '✓ 3a dev CONCEDE o cargo dev';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '3a_NAO_GRAVOU; ';
      raise warning '✗ 3a concessão não gravou: papel ficou %', v_papel;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3a; ';
    raise warning '✗ 3a dev recusado ao conceder dev (%) %', sqlstate, sqlerrm;
  end;

  -- 3b. dev REBAIXA outro dev (o que acabou de promover volta a operador)
  begin
    perform public.definir_papel_usuario(k_operador, 'operador');
    select p.papel::text into v_papel from public.profiles p where p.id = k_operador;
    if v_papel = 'operador' then
      v_ok := v_ok + 1; raise notice '✓ 3b dev REBAIXA outro dev';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '3b_NAO_GRAVOU; ';
      raise warning '✗ 3b rebaixamento não gravou: papel ficou %', v_papel;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3b; ';
    raise warning '✗ 3b dev recusado ao rebaixar outro dev (%) %', sqlstate, sqlerrm;
  end;

  -- 3c. dev DESATIVA um não-dev
  begin
    perform public.definir_status_usuario(k_consulta, false);
    select p.ativo into v_bool from public.profiles p where p.id = k_consulta;
    if v_bool = false then
      v_ok := v_ok + 1; raise notice '✓ 3c dev DESATIVA um usuário';
      perform public.definir_status_usuario(k_consulta, true);   -- devolve, para não afetar o resto
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '3c_NAO_GRAVOU; ';
      raise warning '✗ 3c desativação não gravou (ativo = %)', v_bool;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3c; ';
    raise warning '✗ 3c dev recusado ao desativar (%) %', sqlstate, sqlerrm;
  end;

  -- 3d. dev ENCERRA SESSÕES — e encerra as DO ALVO, não as de outra pessoa.
  --
  -- ⚠⚠ FORTALECIDO NA F48 (07/09/2026). A versão anterior chamava a RPC e aceitava
  -- "0 sessões removidas" como sucesso: ela só conferia que não houve exceção, nunca que
  -- o `delete` mirou o usuário certo. Num banco novo `auth.sessions` nasce VAZIA, então o
  -- cenário passava sobre conjunto vazio — trocar `p_alvo` por qualquer outra variável
  -- dentro de `encerrar_sessoes_usuario` (0074:378) continuaria devolvendo 0 e o roteiro
  -- continuaria verde. A mutação `gestao-encerrar-sessoes-mira-o-alvo-errado` foi para a
  -- quarentena da F47 por isso, nomeando esta fase.
  --
  -- Agora o cenário planta o universo e prova as DUAS metades, que é o que "mirar o alvo"
  -- quer dizer: as sessões do ALVO somem, e as de OUTRA pessoa continuam lá. Uma metade
  -- sozinha não distingue — um `delete` sem `where` derrubaria as duas e a primeira
  -- metade ficaria feliz.
  --
  -- `auth.sessions` tem só `id` e `user_id` obrigatórios, tanto no Supabase hospedado
  -- quanto no bootstrap do CI (`supabase/ci/bootstrap-auth.sql:63`), que a criou
  -- justamente para este `delete` não errar no parse.
  --
  -- ⚠ A FIXTURE E A CONTAGEM VÃO COMO `postgres`, e a CHAMADA vai como o dev. Não é
  -- estilo: `authenticated` não tem grant nenhum no schema `auth` — nem no CI nem num
  -- projeto hospedado —, então plantar ou contar de dentro da sessão do dev morreria em
  -- `permission denied` e o cenário mediria privilégio em vez de autorização. Quem apaga
  -- é a RPC, que é `security definer` e roda como o dono.
  reset role;
  insert into auth.sessions (id, user_id) values
    (gen_random_uuid(), k_operador),
    (gen_random_uuid(), k_operador),
    (gen_random_uuid(), k_admin);          -- a TESTEMUNHA: não pode cair junto
  select count(*) into v_sessoes_alvo  from auth.sessions where user_id = k_operador;
  select count(*) into v_sessoes_outro from auth.sessions where user_id = k_admin;

  if v_sessoes_alvo = 2 and v_sessoes_outro = 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 3d-fixture universo plantado e contado como postgres ANTES da chamada (2 sessões do alvo, 1 da testemunha)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3d-fixture; ';
    raise warning '✗ 3d-fixture não montou: % sessões do alvo (esp. 2) e % da testemunha (esp. 1) — 3d voltaria a ser tautologia', v_sessoes_alvo, v_sessoes_outro;
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);

  v_n := -1;   -- sentinela: distingue "a RPC nem rodou" de "a RPC devolveu 0"
  begin
    select public.encerrar_sessoes_usuario(k_operador) into v_n;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3d; ';
    raise warning '✗ 3d dev recusado ao encerrar sessões (%) %', sqlstate, sqlerrm;
  end;

  -- A conferência, DE VOLTA COMO POSTGRES: as duas metades do "mirou o alvo".
  reset role;
  select count(*) into v_sessoes_alvo  from auth.sessions where user_id = k_operador;
  select count(*) into v_sessoes_outro from auth.sessions where user_id = k_admin;

  if v_n = 2 and v_sessoes_alvo = 0 and v_sessoes_outro = 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 3d dev encerra as sessões DO ALVO: a RPC devolveu 2, sobrou 0 dele, e a 1 da testemunha continua lá';
  elsif v_n = -1 then
    null;   -- a RPC levantou exceção; o ✗ já saiu acima, não conte a falha duas vezes
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3d_ALVO_ERRADO; ';
    raise warning '✗ 3d o delete NÃO mirou o alvo: a RPC devolveu % (esp. 2), sobraram % sessões do alvo (esp. 0) e % da testemunha (esp. 1)',
      v_n, v_sessoes_alvo, v_sessoes_outro;
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);

  -- =========================================================================
  -- 5 — AUTOPROTEÇÃO (numerada 5 para casar com o índice do cabeçalho)
  -- =========================================================================
  -- 5a. dev não muda o PRÓPRIO cargo
  begin
    perform public.definir_papel_usuario(k_dev, 'admin');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5a_AUTO_REBAIXOU; ';
    raise warning '✗ 5a dev mudou o próprio cargo (deveria ser recusado)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 5a dev recusado ao mudar o próprio cargo (%)', sqlstate;
  end;

  -- 5b. dev não se desativa
  begin
    perform public.definir_status_usuario(k_dev, false);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5b_AUTO_DESATIVOU; ';
    raise warning '✗ 5b dev desativou a si mesmo (deveria ser recusado)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 5b dev recusado ao desativar a si mesmo (%)', sqlstate;
  end;

  -- 5c. dev não se apaga
  begin
    perform public.apagar_usuario(k_dev);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5c_AUTO_APAGOU; ';
    raise warning '✗ 5c dev apagou a si mesmo (deveria ser recusado)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 5c dev recusado ao apagar a si mesmo (%)', sqlstate;
  end;

  -- (a asserção 5d vive na seção 2, como postgres — ver o comentário lá)

  -- =========================================================================
  -- 6 — APAGAR PRESERVA A AUTORIA
  -- =========================================================================
  -- 6a. o dev apaga a vítima (que TEM histórico — movimentação e anotação)
  begin
    perform public.apagar_usuario(k_vitima);
    v_ok := v_ok + 1; raise notice '✓ 6a dev APAGA um usuário com histórico';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6a_NAO_APAGOU; ';
    raise warning '✗ 6a dev não conseguiu apagar a vítima (%) %', sqlstate, sqlerrm;
  end;

  reset role;

  -- 6b. o perfil foi ARQUIVADO, não removido
  select count(*) into v_n from public.profiles where id = k_vitima and excluido_em is not null and not ativo;
  if v_n = 1 then
    v_ok := v_ok + 1; raise notice '✓ 6b o perfil da vítima foi ARQUIVADO (excluido_em preenchido, ativo=false)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6b_PERFIL_SUMIU; ';
    raise warning '✗ 6b o perfil arquivado não está no estado esperado (% linha[s])', v_n;
  end if;

  -- 6c. A MOVIMENTAÇÃO CONTINUA LÁ, E COM O NOME DO AUTOR — é o critério 4 da ordem.
  select p.nome into v_txt
    from public.movimentacoes m join public.profiles p on p.id = m.criado_por
   where m.id = v_mov_vit;
  if v_txt = 'Fulano de Teste' then
    v_ok := v_ok + 1; raise notice '✓ 6c a movimentação do apagado sobrevive e o join resolve o nome (%)', v_txt;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6c_AUTORIA_PERDIDA; ';
    raise warning '✗ 6c a autoria da movimentação se perdeu (nome = %)', coalesce(v_txt, '<nulo>');
  end if;

  -- 6c-bis. o mesmo para a anotação
  select p.nome into v_txt
    from public.anotacoes a join public.profiles p on p.id = a.criado_por
   where a.id = v_anot_vit;
  if v_txt = 'Fulano de Teste' then
    v_ok := v_ok + 1; raise notice '✓ 6c-bis a anotação do apagado sobrevive com o nome do autor';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6c-bis_AUTORIA_PERDIDA; ';
    raise warning '✗ 6c-bis a autoria da anotação se perdeu (nome = %)', coalesce(v_txt, '<nulo>');
  end if;

  -- 6d. os vínculos do apagado sumiram
  select count(*) into v_n from public.operador_filiais where usuario_id = k_vitima;
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 6d os vínculos do apagado foram limpos';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6d_VINCULO_SOBROU; ';
    raise warning '✗ 6d sobraram % vínculo(s) do usuário apagado', v_n;
  end if;

  -- 6e. E O APAGADO NÃO LÊ MAIS NADA (papel_atual() devolve NULL por causa de excluido_em —
  --     é o que faz a exclusão valer no request seguinte, para leitura E escrita).
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_vitima, 'role', 'authenticated')::text, true);

  select public.papel_atual()::text into v_papel;
  select count(*) into v_n from public.ativos;
  if v_papel is null and v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 6e o apagado não tem cargo e não lê o acervo (0 ativos)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6e_APAGADO_AINDA_LE; ';
    raise warning '✗ 6e o apagado ainda tem papel=% e leu % ativo(s)', coalesce(v_papel,'<nulo>'), v_n;
  end if;

  reset role;

  -- 6f/6g/6h. A OUTRA METADE DO APAGAR — a que a Server Action faz depois da RPC: remover a
  -- conta em `auth.users`. É a metade que era IMPOSSÍVEL antes da F22, e por isso vale prova
  -- própria: `profiles.id` referenciava `auth.users` com ON DELETE CASCADE (0001), então
  -- apagar a conta tentava apagar o perfil e batia nas dez FKs de histórico (NO ACTION, oito
  -- delas NOT NULL) — `auth.admin.deleteUser()` voltava com erro de FK vindo do schema
  -- `public`, e o erro parecia bug do Auth sem ser. A 0073 derrubou aquela FK; aqui se
  -- verifica que o efeito é o pretendido, e não uma porta aberta para perder histórico.
  begin
    delete from auth.users where id = k_vitima;
    v_ok := v_ok + 1; raise notice '✓ 6f a conta do apagado sai de auth.users (a 0073 destravou)';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6f_DELETE_DA_CONTA_FALHOU; ';
    raise warning '✗ 6f não foi possível remover a conta em auth.users: %', sqlerrm;
  end;

  -- Com a conta fora, o histórico TEM de continuar de pé e nomeado. Se algum dia alguém
  -- "consertar" as FKs para CASCADE, é esta asserção que grita.
  select p.nome into v_txt
    from public.movimentacoes m join public.profiles p on p.id = m.criado_por
   where m.id = v_mov_vit;
  if v_txt = 'Fulano de Teste' then
    v_ok := v_ok + 1; raise notice '✓ 6g o histórico sobrevive à remoção da conta, com o nome do autor';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6g_HISTORICO_PERDIDO; ';
    raise warning '✗ 6g o histórico se perdeu ao remover a conta (nome = %)', coalesce(v_txt, '<nulo>');
  end if;

  -- E o e-mail volta a ficar LIVRE: é o que torna "apagar" diferente de "desativar".
  begin
    insert into auth.users (id, instance_id, aud, role, email,
                            encrypted_password, email_confirmed_at, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'f22.vitima@wap.ind.br', '', now(), now(), now());
    v_ok := v_ok + 1; raise notice '✓ 6h o e-mail do apagado pode ser convidado de novo';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6h_EMAIL_PRESO; ';
    raise warning '✗ 6h o e-mail continua preso depois de apagar: %', sqlerrm;
  end;

  -- =========================================================================
  -- 4 — OPERADOR E CONSULTA NÃO ALCANÇAM NADA DISSO
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  if not public.e_dev() and not public.e_admin() and public.pode_escrever() then
    v_ok := v_ok + 1; raise notice '✓ 4a operador: e_dev=false, e_admin=false, pode_escrever=true';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4a; ';
    raise warning '✗ 4a operador com e_dev=% e_admin=% pode_escrever=%',
      public.e_dev(), public.e_admin(), public.pode_escrever();
  end if;

  begin
    perform public.definir_papel_usuario(k_consulta, 'admin');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4b_OPERADOR_MUDOU_CARGO; ';
    raise warning '✗ 4b OPERADOR mudou o cargo de alguém (deveria ser recusado)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 4b operador recusado ao mudar cargo (%)', sqlstate;
  end;

  begin
    perform public.apagar_usuario(k_consulta);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4c_OPERADOR_APAGOU; ';
    raise warning '✗ 4c OPERADOR apagou um usuário (deveria ser recusado)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 4c operador recusado ao apagar usuário (%)', sqlstate;
  end;

  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_consulta, 'role', 'authenticated')::text, true);

  if not public.e_dev() and not public.e_admin() and not public.pode_escrever() then
    v_ok := v_ok + 1; raise notice '✓ 4d consulta: e_dev/e_admin/pode_escrever todos false';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4d; ';
    raise warning '✗ 4d consulta com e_dev=% e_admin=% pode_escrever=%',
      public.e_dev(), public.e_admin(), public.pode_escrever();
  end if;

  begin
    perform public.definir_status_usuario(k_operador, false);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4e_CONSULTA_DESATIVOU; ';
    raise warning '✗ 4e CONSULTA desativou alguém (deveria ser recusado)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 4e consulta recusada ao desativar (%)', sqlstate;
  end;

  reset role;

  -- =========================================================================
  -- 7 — F52: AS GUARDAS DE ESCOPO NO-OP (migration 0132)
  -- =========================================================================
  -- Roda por ÚLTIMO, como postgres (herdado do `reset role;` acima), e cada bloco troca de
  -- papel só quando precisa. As quatro funções novas/alteradas da 0132 nascem FECHADAS nos
  -- quatro papéis (doutrina da 0078, a mesma que a 5e já prova para exigir_gestao_de e
  -- existe_outro_admin_ativo) — então, como em 5d/5e, a única forma de CHAMAR a maioria
  -- delas fora de outra security definer é como superusuário, que ignora GRANT/REVOKE.
  --
  -- Rótulos fora de ordem numérica de propósito (7h/7i/7f ficam por último): 7j precisa de
  -- k_admin com sessão administrativa VÁLIDA, e 7h neutraliza k_admin (ativo=false) para
  -- isolar a trava do último administrador do ruído dos três admins/devs que o resto do
  -- arquivo já plantou. Trocar a ordem quebraria 7j. Nada DEPOIS desta seção depende do
  -- estado de nível administrador, então mexer nele aqui é seguro — mesma lógica do
  -- comentário de k_alvo lá em cima (linha ~100).
  declare
    k_admin_a  uuid := '00000000-f52a-4000-8000-0000000000a1';
    k_admin_b  uuid := '00000000-f52a-4000-8000-0000000000a2';
    v_corpo    text;
    v_faltando text := '';
    v_rpc      text;
    v_result_1 boolean;
    v_result_2 boolean;
    v_qtde     int;
    v_nargs    int;
    v_args     text;
    v_n2       int;
    v_outros_admins uuid[];
  begin
    -- 7c. O CORPO de exigir_gestao_de CITA mesmo_escopo_de_gestao.
    -- ⚠ ISTO É PROVA DE PRESENÇA, NÃO DE EFEITO — e é deliberado escrever por quê.
    -- mesmo_escopo_de_gestao devolve `true` para TODO alvo (F52: com uma empresa só, ela é
    -- inerte por definição). Logo nenhum cenário de entrada/saída DISTINGUE "a chamada está
    -- lá" de "a chamada nunca existiu": os dois mundos produzem exatamente o mesmo
    -- comportamento observável hoje — uma guarda que sempre aceita é indetectável por
    -- efeito, por definição. A única forma de provar que a fechadura está no CAMINHO — e não
    -- só documentada em comentário — é ler o corpo COMPILADO da função com
    -- pg_get_functiondef e procurar a CHAMADA. Quando a F65 der corpo real à guarda, aí
    -- haverá cenário de efeito (um alvo fora do escopo recusado); até lá, esta asserção é
    -- quem denuncia se a chamada sumir numa recriação futura de exigir_gestao_de.
    --
    -- ⚠ A ÂNCORA É A CHAMADA INTEIRA, NUNCA O NOME CRU — e isto foi aprendido pelo
    -- injetor, não deduzido. `pg_get_functiondef` devolve o corpo COM os comentários, e o
    -- comentário que a 0132 escreveu em volta da guarda CITA `mesmo_escopo_de_gestao` (é
    -- ele que explica por que a condição existe). Com âncora pelo nome, a mutação
    -- `f52-escopo-de-gestao-some-do-corpo` — que remove exatamente o `if` — deixava esta
    -- asserção VERDE, e o injetor a reportou como "NÃO detectada". Uma prova de presença
    -- que casa com a documentação da coisa, em vez da coisa, não prova presença nenhuma.
    begin
      select pg_get_functiondef('public.exigir_gestao_de(uuid, public.papel_usuario)'::regprocedure)
        into v_corpo;
      if v_corpo like '%not public.mesmo_escopo_de_gestao(p_alvo)%' then
        v_ok := v_ok + 1; raise notice '✓ 7c exigir_gestao_de CITA mesmo_escopo_de_gestao no corpo (prova de presença)';
      else
        v_falhas := v_falhas + 1; v_msgs := v_msgs || '7c_GUARDA_SUMIU; ';
        raise warning '✗ 7c exigir_gestao_de NÃO cita mesmo_escopo_de_gestao — a fechadura de pertencimento saiu do caminho';
      end if;
    exception when others then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '7c; ';
      raise warning '✗ 7c não foi possível ler o corpo de exigir_gestao_de (%) %', sqlstate, sqlerrm;
    end;

    -- 7d. As CINCO RPCs de gestão continuam citando exigir_gestao_de — a prova de que UMA
    -- condição protege as cinco, e de que nenhuma recriação (nesta fase ou numa futura)
    -- deixou alguma delas para trás.
    v_faltando := '';
    foreach v_rpc in array array[
      'public.definir_papel_usuario(uuid, public.papel_usuario)',
      'public.definir_status_usuario(uuid, boolean)',
      'public.definir_vinculos_usuario(uuid, smallint[])',
      'public.apagar_usuario(uuid)',
      'public.encerrar_sessoes_usuario(uuid)'
    ]
    loop
      begin
        select pg_get_functiondef(v_rpc::regprocedure) into v_corpo;
        if v_corpo is null or v_corpo not like '%exigir_gestao_de%' then
          v_faltando := v_faltando || v_rpc || '; ';
        end if;
      exception when others then
        v_faltando := v_faltando || v_rpc || '(ausente:' || sqlstate || '); ';
      end;
    end loop;
    if v_faltando = '' then
      v_ok := v_ok + 1; raise notice '✓ 7d as cinco RPCs de gestão continuam citando exigir_gestao_de';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '7d_RPC_SEM_GUARDA; ';
      raise warning '✗ 7d RPC(s) sem citar exigir_gestao_de (ou ausente[s]): %', v_faltando;
    end if;

    -- 7g. SEM OVERLOAD: existe_outro_admin_ativo tem de ser UMA função só, de 2 argumentos.
    -- A 0132 faz DROP da versão de 1 argumento antes do CREATE da de 2 — precisamente para
    -- isto: se as duas coexistissem, as TRÊS chamadas de 1 argumento que já vivem dentro de
    -- definir_papel_usuario/definir_status_usuario/apagar_usuario (0074) levantariam 42725
    -- "function ... is not unique" em tempo de EXECUÇÃO, sem erro nenhum no apply da
    -- migration. Medido por CONTAGEM e ARIDADE (pronargs), não por comparação textual do
    -- args formatados — mais robusto a como o Postgres deparse a DEFAULT.
    select count(*), max(p.pronargs)
      into v_qtde, v_nargs
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'existe_outro_admin_ativo';
    select pg_get_function_identity_arguments(p.oid)
      into v_args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'existe_outro_admin_ativo'
     limit 1;
    if v_qtde = 1 and v_nargs = 2 then
      v_ok := v_ok + 1; raise notice '✓ 7g existe_outro_admin_ativo é UMA função só, com 2 argumentos (%)', v_args;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '7g_OVERLOAD; ';
      raise warning '✗ 7g existe_outro_admin_ativo: % função(ões) no catálogo, aridade=% (args=%) — esperado 1 função com 2 argumentos (a de 1 argumento não pode ter sobrado, senão as três chamadas de 1 argumento das RPCs levantariam 42725)', v_qtde, v_nargs, v_args;
    end if;

    -- 7a. mesmo_escopo_de_gestao EXISTE e devolve TRUE para um alvo real — o par positivo
    -- (ACEITA O LEGÍTIMO) que prova que a fechadura no-op não passou a recusar ninguém.
    begin
      select public.mesmo_escopo_de_gestao(k_operador) into v_bool;
      if v_bool = true then
        v_ok := v_ok + 1; raise notice '✓ 7a mesmo_escopo_de_gestao(alvo real) = true — aceita o legítimo';
      else
        v_falhas := v_falhas + 1; v_msgs := v_msgs || '7a_DEVOLVEU_FALSE; ';
        raise warning '✗ 7a mesmo_escopo_de_gestao devolveu false para um alvo real (esperado true hoje, com uma empresa só)';
      end if;
    exception when others then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '7a; ';
      raise warning '✗ 7a mesmo_escopo_de_gestao não pôde ser chamada (%) %', sqlstate, sqlerrm;
    end;

    -- 7b. mesmo_escopo_de_gestao FECHADA nos quatro papéis — mesma forma da 5e (que já prova
    -- isto para exigir_gestao_de/existe_outro_admin_ativo), agora para a função nova da 0132.
    begin
      if not has_function_privilege('public', 'public.mesmo_escopo_de_gestao(uuid)', 'execute')
         and not has_function_privilege('anon', 'public.mesmo_escopo_de_gestao(uuid)', 'execute')
         and not has_function_privilege('authenticated', 'public.mesmo_escopo_de_gestao(uuid)', 'execute')
         and not has_function_privilege('service_role', 'public.mesmo_escopo_de_gestao(uuid)', 'execute') then
        v_ok := v_ok + 1; raise notice '✓ 7b mesmo_escopo_de_gestao fechada nos quatro papéis (public/anon/authenticated/service_role)';
      else
        v_falhas := v_falhas + 1; v_msgs := v_msgs || '7b_ABERTA; ';
        raise warning '✗ 7b mesmo_escopo_de_gestao está executável por algum papel além do dono';
      end if;
    exception when others then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '7b; ';
      raise warning '✗ 7b has_function_privilege(mesmo_escopo_de_gestao) levantou (%) %', sqlstate, sqlerrm;
    end;

    -- 7e. EQUIVALÊNCIA: existe_outro_admin_ativo(alvo) [1 argumento, usa o DEFAULT] e
    -- existe_outro_admin_ativo(alvo, null) [2 argumentos, escopo EXPLÍCITO null] têm de
    -- devolver o MESMO valor — é o que prova que as três chamadas de 1 argumento que já
    -- vivem dentro de definir_papel_usuario/definir_status_usuario/apagar_usuario (0074)
    -- continuam corretas depois do DROP+CREATE da 0132, sem precisar recriar as três RPCs.
    begin
      select public.existe_outro_admin_ativo(k_admin)       into v_result_1;
      select public.existe_outro_admin_ativo(k_admin, null) into v_result_2;
      if v_result_1 = v_result_2 then
        v_ok := v_ok + 1; raise notice '✓ 7e existe_outro_admin_ativo(alvo) = existe_outro_admin_ativo(alvo, null) = %', v_result_1;
      else
        v_falhas := v_falhas + 1; v_msgs := v_msgs || '7e_DIVERGIU; ';
        raise warning '✗ 7e existe_outro_admin_ativo diverge entre 1 e 2 argumentos: % vs %', v_result_1, v_result_2;
      end if;
    exception when others then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '7e; ';
      raise warning '✗ 7e existe_outro_admin_ativo levantou (%) %', sqlstate, sqlerrm;
    end;

    -- 7j. PAR POSITIVO PARA definir_vinculos_usuario. Hoje ela só aparece no rótulo 2e, e só
    -- no lado NEGATIVO (admin recusado ao mexer no vínculo de um DEV) — cego ao efeito real
    -- da RPC. Aqui um NÍVEL ADMINISTRADOR (k_admin) vincula um OPERADOR (k_operador, que
    -- hoje só está em v_f1 — linha 161) à filial v_f2, e prova que a linha nova aparece E a
    -- antiga some: a guarda de pertencimento da 0132 (mesmo_escopo_de_gestao, inerte hoje)
    -- não quebrou o caminho legítimo. Tem de rodar ANTES de 7h neutralizar k_admin.
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);
    begin
      perform public.definir_vinculos_usuario(k_operador, array[v_f2]::smallint[]);
      v_ok := v_ok + 1; raise notice '✓ 7j admin CHAMA definir_vinculos_usuario sobre um operador sem levantar exceção';
    exception when others then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '7j; ';
      raise warning '✗ 7j admin recusado ao vincular um operador a uma filial (%) %', sqlstate, sqlerrm;
    end;
    reset role;

    select count(*) into v_n
      from public.operador_filiais where usuario_id = k_operador and filial_id = v_f2;
    select count(*) into v_n2
      from public.operador_filiais where usuario_id = k_operador and filial_id = v_f1;
    if v_n = 1 and v_n2 = 0 then
      v_ok := v_ok + 1; raise notice '✓ 7j-bis o vínculo gravou de verdade: operador ligado a v_f2, o vínculo antigo (v_f1) foi substituído';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '7j-bis_NAO_GRAVOU; ';
      raise warning '✗ 7j-bis vínculo não gravou como esperado: % linha(s) em v_f2 (esp. 1), % em v_f1 (esp. 0)', v_n, v_n2;
    end if;

    -- 7h/7i/7f. A TRAVA DO ÚLTIMO ADMINISTRADOR, ISOLADA DO RUÍDO AMBIENTE. Neutraliza
    -- (ativo=false) TODO admin/dev ativo que já exista no banco — não só k_dev/k_dev2/k_admin,
    -- que este arquivo planta. ⚠ MEDIDO EM ENSAIO (08/09/2026): a primeira versão desta
    -- seção só neutralizava os TRÊS fixtures conhecidos, e o rótulo 7h reprovou lá — porque
    -- o projeto de ensaio (diferente do Postgres NOVO do CI que o cabeçalho promete) já tem
    -- conta(s) real(is) de nível administrador cadastradas, e a contagem enxergou essa sobra.
    -- A CAPTURA a seguir funciona nos dois mundos: num banco novo de CI, `v_outros_admins`
    -- sai vazio (k_dev/k_dev2/k_admin são os únicos, e entram aqui); num banco povoado
    -- (ensaio/produção), pega TODO mundo — a neutralização é revertida pelo `rollback;` no
    -- fim do arquivo, e nenhuma outra sessão enxerga o estado intermediário (MVCC: mudança
    -- não commitada é invisível fora desta transação). k_dev/k_dev2 são cargo dev: tocar
    -- ativo/papel/excluido_em deles fora do caminho oficial é recusado até para o
    -- superusuário (seção 2h/2i/2i-bis acima) — por isso a janela `estoque.gestao_usuarios`,
    -- a MESMA técnica que a fixture inicial usa para plantar k_dev/k_dev2 (linhas ~163-169).
    select coalesce(array_agg(p.id), '{}'::uuid[])
      into v_outros_admins
      from public.profiles p
     where p.papel in ('dev', 'admin') and p.ativo and p.excluido_em is null;

    perform set_config('estoque.gestao_usuarios', 'on', true);
    update public.profiles set ativo = false where id = any (v_outros_admins);
    perform set_config('estoque.gestao_usuarios', 'off', true);

    insert into auth.users (id, instance_id, aud, role, email,
                            encrypted_password, email_confirmed_at, created_at, updated_at)
    values
      (k_admin_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'f52.admin.a@wap.ind.br', '', now(), now(), now());
    update public.profiles set primeiro_nome = 'Beltrana', sobrenome = 'Administradora',
           papel = 'admin', ativo = true
     where id = k_admin_a;

    -- 7h. Com UM SÓ administrador ativo no banco (k_admin_a), a trava do último admin
    -- CONTINUA travando: existe_outro_admin_ativo() tem de devolver false.
    begin
      select public.existe_outro_admin_ativo(k_admin_a) into v_bool;
      if v_bool = false then
        v_ok := v_ok + 1; raise notice '✓ 7h existe_outro_admin_ativo(único admin ativo) = false — a trava do último administrador continua travando';
      else
        v_falhas := v_falhas + 1; v_msgs := v_msgs || '7h_TRAVA_QUEBROU; ';
        raise warning '✗ 7h com um único admin ativo, existe_outro_admin_ativo() devolveu true — a trava do último administrador quebrou';
      end if;
    exception when others then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '7h; ';
      raise warning '✗ 7h existe_outro_admin_ativo() levantou (%) %', sqlstate, sqlerrm;
    end;

    insert into auth.users (id, instance_id, aud, role, email,
                            encrypted_password, email_confirmed_at, created_at, updated_at)
    values
      (k_admin_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'f52.admin.b@wap.ind.br', '', now(), now(), now());
    update public.profiles set primeiro_nome = 'Ciclana', sobrenome = 'Administradora',
           papel = 'admin', ativo = true
     where id = k_admin_b;

    -- 7i. PAR POSITIVO de 7h: com um SEGUNDO admin ativo (k_admin_b), a trava ACEITA.
    begin
      select public.existe_outro_admin_ativo(k_admin_a) into v_bool;
      if v_bool = true then
        v_ok := v_ok + 1; raise notice '✓ 7i existe_outro_admin_ativo(k_admin_a) = true agora que k_admin_b existe — a trava ACEITA quando há outro';
      else
        v_falhas := v_falhas + 1; v_msgs := v_msgs || '7i_NAO_ACEITOU; ';
        raise warning '✗ 7i com DOIS admins ativos, existe_outro_admin_ativo() ainda devolveu false';
      end if;
    exception when others then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '7i; ';
      raise warning '✗ 7i existe_outro_admin_ativo() levantou (%) %', sqlstate, sqlerrm;
    end;

    -- 7f. ESCOPO NULO NÃO RECUSA TUDO: com os DOIS admins fictícios de 7h/7i no ar, o
    -- p_escopo EXPLÍCITO null tem de continuar TRUE. Se a guarda estivesse escrita como
    -- `and coluna = p_escopo` (igualdade crua, em vez da disjunção `p_escopo is null or
    -- true`), a comparação viraria NULL, o `exists` devolveria false, e ESTA asserção é
    -- quem denunciaria — silenciosamente, a trava do último administrador passaria a
    -- recusar TODO rebaixamento/desativação, mesmo havendo outro admin de sobra.
    begin
      select public.existe_outro_admin_ativo(k_admin_a, null) into v_bool;
      if v_bool = true then
        v_ok := v_ok + 1; raise notice '✓ 7f existe_outro_admin_ativo(alvo, escopo=>null) = true — escopo nulo não recusa tudo';
      else
        v_falhas := v_falhas + 1; v_msgs := v_msgs || '7f_ESCOPO_NULO_RECUSOU; ';
        raise warning '✗ 7f existe_outro_admin_ativo(alvo, null) devolveu false com outro admin existindo — o escopo nulo está recusando tudo';
      end if;
    exception when others then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '7f; ';
      raise warning '✗ 7f existe_outro_admin_ativo(alvo, null) levantou (%) %', sqlstate, sqlerrm;
    end;
  end;

  -- =========================================================================
  -- RESUMO (a linha que o MCP consegue ler — ele engole NOTICE/WARNING)
  -- =========================================================================
  insert into _cargo_dev_resumo values (v_ok, v_falhas, nullif(v_msgs, ''));
  if v_falhas = 0 then
    raise notice '=== cargo_dev: % asserções OK, 0 falhas ===', v_ok;
  else
    raise warning '✗ TOTAL cargo_dev: % falha(s) — %', v_falhas, v_msgs;
  end if;
  raise notice 'FIM cargo_dev: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

select * from _cargo_dev_resumo;

rollback;
