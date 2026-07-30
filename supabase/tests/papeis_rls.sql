-- =============================================================
-- Roteiro de teste: CARGOS, VÍNCULO DE FILIAL E RLS (F21 — migrations 0061→0068).
--
-- Roda no job `banco` do CI (psql, ON_ERROR_STOP=1) e é auto-verificável no SQL
-- editor / MCP do ENSAIO. Mesmo padrão dos demais roteiros da pasta:
--   NOTICE  '✓ ...'  quando a invariante bate
--   WARNING '✗ ...'  quando NÃO bate (o job `banco` falha em qualquer `WARNING: ✗`)
--
-- ESCREVE (cria usuários, perfis, vínculos e ativos fictícios), então roda inteiro
-- dentro de `begin; ... rollback;` — nada sobra no banco. É 100% AUTOSSUFICIENTE:
-- cria tudo de que precisa, para funcionar também num Postgres novo do CI, que tem
-- as filiais da 0007/0026 mas nenhum ativo.
--
-- DADOS 100% FICTÍCIOS (regra 2 do CLAUDE.md): patrimônios `WAP0009xxx`, nomes
-- inventados, e-mails `@wap.ind.br` de fantasia. Nenhum dado real da WAP.
--
-- COMO ELE SIMULA UM USUÁRIO. `postgres` (o papel com que o psql e o MCP conectam)
-- é superusuário e **ignora RLS** — testar com ele não prova nada. Por isso cada
-- cenário faz `set local role authenticated` + `set_config('request.jwt.claims', …)`,
-- que é exatamente o que o PostgREST monta a cada request: `auth.uid()` lê o `sub`
-- dessas claims. `reset role` volta para postgres entre os cenários.
--
-- O QUE ELE PROVA (critérios de aceitação 1, 2, 3, 5, 6 e 7 da ordem F21):
--   1  consulta   — lê, mas não escreve NADA (6 tabelas)
--   2  operador   — escreve na filial VINCULADA e é RECUSADO na não-vinculada
--   3  operador   — não mexe em catálogo de admin, não lê senhas/import_logs/auditoria
--   4  admin      — faz tudo o que o operador não pode
--   5  desativado — `ativo=false` fecha tudo, mesmo com vínculo (revogação imediata)
--   6  RPCs       — criar_compra_lote e importar_ativos_substituir recusam papel insuficiente
--   7  escalada   — `update profiles set papel='admin'` como authenticated FALHA (grant de coluna)
--   8  storage    — as policies dos buckets também olham o cargo
--
-- Ao final, uma linha em `_papeis_resumo` com os contadores — é assim que se lê o
-- resultado pelo MCP, que engole NOTICE/WARNING (armadilha documentada no runbook).
-- =============================================================

begin;

create temp table _papeis_resumo (ok int, falhas int, detalhe text);

-- ---------------------------------------------------------------------------
-- PRIVILÉGIOS DE TABELA — por que este bloco existe
-- ---------------------------------------------------------------------------
-- Um projeto Supabase HOSPEDADO concede a `anon`/`authenticated` os privilégios de TABELA do
-- schema public por *default privilege*, e nenhuma migration deste repo os concede à mão
-- (conferido: `grep` por `grant ... on table` nas 68 migrations não acha nada). O Postgres NOVO
-- que o job `banco` do CI sobe com `supabase start` **não** reproduz esses defaults, então lá
-- `authenticated` não tem nem SELECT em `public.ativos`.
--
-- Isso derrubou este roteiro no primeiro push da F21, com
--   ERROR: permission denied for table ativos
--   HINT: GRANT SELECT ON public.ativos TO authenticated;
-- que é uma resposta CERTA para a pergunta ERRADA: aqui se mede **policy (RLS)**, não
-- privilégio. Quem mede privilégio é `seguranca_catalogo.sql`. Os demais roteiros nunca
-- tropeçaram nisto porque rodam como `postgres` (superusuário, ignora RLS) — este é o único
-- que faz `set local role authenticated`. `itens_extra.sql` faz a troca de papel em duas
-- asserções, mas trata "permission denied" como rejeição válida (comentário na linha 97 dele),
-- então passa nos dois mundos — e é justamente essa ambiguidade que aqui não serve.
--
-- ⚠ O `profiles` é concedido À MÃO, coluna por coluna, e NÃO por `all tables`: um
-- `grant update on all tables` devolveria o UPDATE completo que a `0063` revogou e faria a
-- asserção 3g (escalada de privilégio) passar por engano — o operador conseguiria se promover
-- a admin e o roteiro diria que está tudo bem. É o espelho exato do grant da migration.
--
-- Tudo dentro do `begin; … rollback;` — nada persiste. Num banco hospedado estes grants já
-- existem, então o bloco é no-op lá.
grant select on all tables in schema public to authenticated;
grant insert, update, delete on
  public.ativos, public.movimentacoes, public.lancamentos_item, public.anotacoes,
  public.relatorios_gerados, public.termos_gerados, public.pendencias_item,
  public.filiais, public.motivos, public.itens, public.kits_modelos,
  public.import_logs, public.eventos_admin, public.senhas_acesso, public.operador_filiais
  to authenticated;
grant update (primeiro_nome, sobrenome) on public.profiles to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

do $$
declare
  -- identidades fictícias (uuid fixo, hex válido — o prefixo f21a marca a fase)
  k_admin      uuid := '00000000-f21a-4000-8000-0000000000a1';
  k_operador   uuid := '00000000-f21a-4000-8000-0000000000b2';
  k_consulta   uuid := '00000000-f21a-4000-8000-0000000000c3';
  k_inativo    uuid := '00000000-f21a-4000-8000-0000000000d4';
  v_f1         smallint;
  v_f2         smallint;
  v_ativo_f1   uuid;
  v_ativo_f2   uuid;
  v_item       smallint;
  v_lanc_f1    uuid;
  v_lanc_f2    uuid;
  v_ok         int  := 0;
  v_falhas     int  := 0;
  v_msgs       text := '';
  v_n          int;
  v_papel      text;
begin
  -- =========================================================================
  -- FIXTURES (como postgres — antes de qualquer troca de papel)
  -- =========================================================================
  select id into v_f1 from public.filiais where ativo order by id limit 1;
  select id into v_f2 from public.filiais where ativo and id <> v_f1 order by id limit 1;
  if v_f1 is null or v_f2 is null then
    raise warning '✗ 0 o banco precisa de ao menos DUAS filiais ativas para este roteiro';
    insert into _papeis_resumo values (0, 1, 'sem duas filiais ativas');
    return;
  end if;

  -- O trigger handle_new_user cria o profile (e exige domínio corporativo — 0041/0057).
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (k_admin,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f21.chefia@wap.ind.br',   '', now(), now(), now()),
    (k_operador, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f21.operador@wap.ind.br', '', now(), now(), now()),
    (k_consulta, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f21.consulta@wap.ind.br', '', now(), now(), now()),
    (k_inativo,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f21.inativo@wap.ind.br',  '', now(), now(), now());

  update public.profiles set papel = 'admin'    where id = k_admin;
  update public.profiles set papel = 'operador' where id = k_operador;
  update public.profiles set papel = 'consulta' where id = k_consulta;
  update public.profiles set papel = 'operador', ativo = false where id = k_inativo;

  -- operador vinculado SÓ à filial 1; o inativo TEM vínculo (para provar que o
  -- `ativo=false` sozinho já fecha tudo).
  insert into public.operador_filiais (usuario_id, filial_id) values
    (k_operador, v_f1),
    (k_inativo,  v_f1);

  -- Um ativo em cada filial + um item de catálogo, para os testes de escrita.
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009001', 'F21TST1', 'notebook', v_f1, 'cadastro')
  returning id into v_ativo_f1;
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009002', 'F21TST2', 'notebook', v_f2, 'cadastro')
  returning id into v_ativo_f2;

  select id into v_item from public.itens where ativo order by id limit 1;
  if v_item is null then
    insert into public.itens (nome, grupo)
    values ('Item ficticio F21', 'acessorio') returning id into v_item;
  end if;

  -- FIXTURES DAS TABELAS FECHADAS. Sem elas, as asserções "não vê nada" (3d/3e/3f/6b)
  -- passariam de graça num banco NOVO — e o CI roda exatamente num Postgres novo, onde
  -- `senhas_acesso`, `import_logs`, `eventos_admin` e o bucket de backup nascem VAZIOS.
  -- "Ver 0 linhas de uma tabela vazia" não prova policy nenhuma. Com uma linha plantada
  -- aqui (como postgres, que ignora RLS), o 0 passa a significar "a policy escondeu".
  insert into public.senhas_acesso (rotulo, hash, criado_por)
  values ('Senha ficticia F21', 'hash-ficticio-nao-e-senha-real', k_admin);

  insert into public.import_logs (
    filial_id, modo, arquivo_hash, total_linhas,
    ativos_criados, movs_apagadas, anotacoes_apagadas, termos_apagados,
    backup_path, correcoes, criado_por
  ) values (v_f1, 'substituir', 'hash-f21', 0, 0, 0, 0, 0, 'f21/backup.csv', '[]'::jsonb, k_admin);

  insert into public.eventos_admin (acao, autor, alvo, detalhe)
  values ('papel_alterado', k_admin, 'f21.operador@wap.ind.br', '{"de":"consulta","para":"operador"}'::jsonb);

  insert into storage.objects (bucket_id, name, owner)
  values ('backups-import', 'f21/fixture-backup.csv', k_admin);

  -- Um lançamento em CADA filial, criados como postgres (que ignora RLS), para os testes de
  -- `estorna_id` cruzando filial (2e-bis / 2e-ter). Entradas de 5, para haver saldo a estornar.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
  values (v_item, v_f1, 'entrada', 5, current_date, k_admin) returning id into v_lanc_f1;
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
  values (v_item, v_f2, 'entrada', 5, current_date, k_admin) returning id into v_lanc_f2;

  -- =========================================================================
  -- 1 — CONSULTA: lê tudo, não escreve nada
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_consulta, 'role', 'authenticated')::text, true);

  -- 1a. papel resolvido
  select public.papel_atual()::text into v_papel;
  if v_papel = 'consulta' then
    v_ok := v_ok + 1; raise notice '✓ 1a papel_atual() = consulta';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1a; ';
    raise warning '✗ 1a papel_atual() devolveu % (esperado consulta)', v_papel;
  end if;

  -- 1b. LÊ os ativos (a leitura tem de continuar ampla — ADR-001)
  select count(*) into v_n from public.ativos;
  if v_n >= 2 then
    v_ok := v_ok + 1; raise notice '✓ 1b consulta LÊ ativos (% linhas)', v_n;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1b; ';
    raise warning '✗ 1b consulta não conseguiu ler ativos (viu % linhas)', v_n;
  end if;

  -- 1c..1h. NÃO escreve em nada
  begin
    insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
    values ('WAP0009901', 'F21X1', 'notebook', v_f1, 'cadastro');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1c; ';
    raise warning '✗ 1c consulta INSERIU ativo (deveria ser recusado)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 1c consulta recusada ao inserir ativo (%)', sqlstate;
  end;

  begin
    update public.ativos set observacoes = 'x' where id = v_ativo_f1;
    if found then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '1d; ';
      raise warning '✗ 1d consulta ATUALIZOU ativo (deveria ser recusado)';
    else
      v_ok := v_ok + 1; raise notice '✓ 1d consulta não atualiza ativo (0 linhas afetadas)';
    end if;
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 1d consulta recusada ao atualizar ativo (%)', sqlstate;
  end;

  begin
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao,
                                      status_resultante, criado_por)
    values (v_ativo_f1, 'ajuste', current_date, v_f1, 'teste f21', 'em_estoque', k_consulta);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1e; ';
    raise warning '✗ 1e consulta INSERIU movimentação (deveria ser recusado)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 1e consulta recusada ao inserir movimentação (%)', sqlstate;
  end;

  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_item, v_f1, 'entrada', 1, current_date, k_consulta);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1f; ';
    raise warning '✗ 1f consulta LANÇOU item (deveria ser recusado)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 1f consulta recusada ao lançar item (%)', sqlstate;
  end;

  begin
    insert into public.anotacoes (ativo_id, texto, criado_por)
    values (v_ativo_f1, 'nota f21', k_consulta);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1g; ';
    raise warning '✗ 1g consulta ANOTOU (deveria ser recusado)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 1g consulta recusada ao anotar (%)', sqlstate;
  end;

  begin
    insert into public.relatorios_gerados (periodo_de, periodo_ate, filial_id, versao,
                                           dados, gerado_por)
    values (current_date, current_date, v_f1, 1, '{}'::jsonb, k_consulta);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1h; ';
    raise warning '✗ 1h consulta GEROU relatório (deveria ser recusado)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 1h consulta recusada ao gerar relatório (%)', sqlstate;
  end;

  reset role;

  -- =========================================================================
  -- 2 — OPERADOR com vínculo só na filial 1
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  -- 2a. o predicado do vínculo
  if public.pode_escrever_filial(v_f1) and not public.pode_escrever_filial(v_f2) then
    v_ok := v_ok + 1; raise notice '✓ 2a pode_escrever_filial: f%=true, f%=false', v_f1, v_f2;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2a; ';
    raise warning '✗ 2a pode_escrever_filial errado: f%=%, f%=%',
      v_f1, public.pode_escrever_filial(v_f1), v_f2, public.pode_escrever_filial(v_f2);
  end if;

  -- 2b. ESCREVE movimentação na filial VINCULADA
  begin
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao,
                                      status_resultante, criado_por)
    values (v_ativo_f1, 'ajuste', current_date, v_f1, 'ajuste f21 vinculada',
            'em_estoque', k_operador);
    v_ok := v_ok + 1; raise notice '✓ 2b operador MOVIMENTA na filial vinculada (f%)', v_f1;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2b; ';
    raise warning '✗ 2b operador foi RECUSADO na filial vinculada (f%): % %',
      v_f1, sqlstate, sqlerrm;
  end;

  -- 2c. é RECUSADO na filial NÃO vinculada
  begin
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao,
                                      status_resultante, criado_por)
    values (v_ativo_f2, 'ajuste', current_date, v_f2, 'ajuste f21 nao vinculada',
            'em_estoque', k_operador);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2c; ';
    raise warning '✗ 2c operador MOVIMENTOU na filial NÃO vinculada (f%)', v_f2;
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 2c operador recusado na filial não vinculada (f%, %)',
      v_f2, sqlstate;
  end;

  -- 2c-bis. O CASO CRUZADO — a lacuna que deixou o furo da 0063 passar.
  -- Aqui o operador MENTE o `filial_id`: declara a filial DELE (que ele pode escrever) numa
  -- movimentação de ativo que está na filial que ele NÃO pode. Até a 0067 isto era ACEITO —
  -- a policy só olhava a filial declarada — e o trigger `security definer` então movia o
  -- ativo para a filial do atacante, tornando toda escrita futura nele legítima.
  --
  -- O 2c acima NÃO cobre este caso: lá o ativo e o `filial_id` são os dois da filial não
  -- vinculada, então ele passaria mesmo sem a correção. É esta asserção que prova a 0067.
  begin
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, filial_destino_id,
                                      criado_por)
    values (v_ativo_f2, 'transferencia', current_date, v_f1, v_f1, k_operador);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2c-bis_FURO_ABERTO; ';
    raise warning '✗ 2c-bis operador MOVIMENTOU ativo da filial não vinculada declarando a própria filial (a 0067 não está no ar)';
  exception when others then
    v_ok := v_ok + 1;
    raise notice '✓ 2c-bis filial_id mentido é recusado (%) — a guarda da 0067 está no ar', sqlstate;
  end;

  -- 2c-ter. E o ativo continua onde estava (o efeito derivado do trigger não aconteceu).
  select filial_id into v_n from public.ativos where id = v_ativo_f2;
  if v_n = v_f2 then
    v_ok := v_ok + 1; raise notice '✓ 2c-ter o ativo da filial não vinculada NÃO migrou';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2c-ter_ATIVO_MIGROU; ';
    raise warning '✗ 2c-ter o ativo saiu da filial % e foi para a % — o trigger definer moveu', v_f2, v_n;
  end if;

  -- 2d. lançamento de item: vinculada OK
  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_item, v_f1, 'entrada', 2, current_date, k_operador);
    v_ok := v_ok + 1; raise notice '✓ 2d operador LANÇA item na filial vinculada';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2d; ';
    raise warning '✗ 2d operador recusado ao lançar item na vinculada: % %', sqlstate, sqlerrm;
  end;

  -- 2e. lançamento de item: NÃO vinculada recusado
  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_item, v_f2, 'entrada', 2, current_date, k_operador);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2e; ';
    raise warning '✗ 2e operador LANÇOU item na filial NÃO vinculada';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 2e operador recusado ao lançar na não vinculada (%)', sqlstate;
  end;

  -- 2e-bis. `estorna_id` NÃO pode apontar lançamento de filial não vinculada (0068).
  -- O irmão do furo da 0067, na tabela em que `filial_id` é o objeto da escrita (e portanto o
  -- predicado é auto-consistente) mas `estorna_id` é ponteiro LIVRE para outra entidade. Sem a
  -- 0068, isto era aceito e queimava a vaga única de estorno de um lançamento da outra filial:
  -- ele passava a aparecer "estornado" no histórico dela sem nada ter sido revertido, o saldo
  -- continuava contando, e o operador legítimo nunca mais conseguia estorná-lo (tabela imutável).
  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data,
                                         criado_por, estorna_id)
    values (v_item, v_f1, 'saida', 5, current_date, k_operador, v_lanc_f2);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2e-bis_ESTORNO_CRUZOU_FILIAL; ';
    raise warning '✗ 2e-bis operador estornou lançamento de filial não vinculada (a 0068 não está no ar)';
  exception when others then
    v_ok := v_ok + 1;
    raise notice '✓ 2e-bis estorno de item não cruza filial (%)', sqlstate;
  end;

  -- 2e-ter. E o estorno LEGÍTIMO (mesma filial, mesmo item) continua passando — senão a 0068
  -- teria fechado o furo quebrando a correção normal do dia a dia.
  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data,
                                         criado_por, estorna_id)
    values (v_item, v_f1, 'saida', 5, current_date, k_operador, v_lanc_f1);
    v_ok := v_ok + 1;
    raise notice '✓ 2e-ter estorno legítimo na própria filial aceito';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2e-ter(' || sqlstate || '); ';
    raise warning '✗ 2e-ter o estorno LEGÍTIMO foi recusado (%) — a 0068 quebrou o fluxo normal', sqlstate;
  end;

  -- 2f. atualiza ativo da vinculada / 2g. não atualiza o da outra
  begin
    update public.ativos set observacoes = 'ok f21' where id = v_ativo_f1;
    if found then
      v_ok := v_ok + 1; raise notice '✓ 2f operador ATUALIZA ativo da filial vinculada';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '2f; ';
      raise warning '✗ 2f operador não atualizou ativo da vinculada (0 linhas)';
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2f; ';
    raise warning '✗ 2f operador recusado ao atualizar ativo da vinculada: %', sqlstate;
  end;

  update public.ativos set observacoes = 'nao deveria' where id = v_ativo_f2;
  if found then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2g; ';
    raise warning '✗ 2g operador ATUALIZOU ativo da filial NÃO vinculada';
  else
    v_ok := v_ok + 1; raise notice '✓ 2g operador não alcança ativo da filial não vinculada';
  end if;

  -- 2h. A transferência LEGÍTIMA (da filial dele PARA outra) tem de continuar passando: o
  -- parâmetro §0 `TRANSFERENCIA_EXIGE_VINCULO_DESTINO = nao` exige vínculo só na ORIGEM. Sem
  -- esta asserção, a correção da 0067 poderia ter fechado o furo do 2c-bis quebrando o fluxo
  -- normal de enviar equipamento para outra filial — e ninguém notaria.
  --
  -- É a ÚLTIMA asserção da seção de propósito: ela MOVE `v_ativo_f1` para a filial 2, e
  -- qualquer checagem posterior sobre esse ativo passaria a medir outra coisa.
  begin
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, filial_destino_id,
                                      criado_por)
    values (v_ativo_f1, 'transferencia', current_date, v_f1, v_f2, k_operador);
    v_ok := v_ok + 1;
    raise notice '✓ 2h transferência legítima f%→f% aceita (destino segue livre)', v_f1, v_f2;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2h(' || sqlstate || '); ';
    raise warning '✗ 2h a transferência LEGÍTIMA foi recusada (%) — a 0067 quebrou o fluxo normal', sqlstate;
  end;

  -- =========================================================================
  -- 3 — OPERADOR não é admin: catálogo e leituras fechadas
  -- =========================================================================
  begin
    insert into public.motivos (codigo, rotulo, aplica_a)
    values ('f21-op', 'Motivo f21 operador', array['saida']::public.tipo_movimentacao[]);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3a; ';
    raise warning '✗ 3a operador CRIOU motivo (é matéria de admin)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 3a operador recusado ao criar motivo (%)', sqlstate;
  end;

  begin
    insert into public.filiais (slug, nome) values ('f21-teste', 'Filial F21');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3b; ';
    raise warning '✗ 3b operador CRIOU filial (é matéria de admin)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 3b operador recusado ao criar filial (%)', sqlstate;
  end;

  begin
    insert into public.itens (nome, grupo) values ('Item f21 op', 'acessorio');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3c; ';
    raise warning '✗ 3c operador CRIOU item de catálogo (é matéria de admin)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 3c operador recusado ao criar item (%)', sqlstate;
  end;

  -- 3d. senhas_acesso: ilegível para QUALQUER papel (0012 — service role apenas).
  --     Existe 1 linha plantada nas fixtures: ver 0 é a policy trabalhando, não tabela vazia.
  select count(*) into v_n from public.senhas_acesso;
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 3d operador NÃO lê senhas_acesso (existe 1 linha, viu 0)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3d; ';
    raise warning '✗ 3d operador LEU % linha(s) de senhas_acesso — o hash está exposto', v_n;
  end if;

  -- 3e. import_logs: leitura só de admin (0063). Idem — há 1 linha nas fixtures.
  select count(*) into v_n from public.import_logs;
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 3e operador NÃO lê import_logs (existe 1 linha, viu 0)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3e; ';
    raise warning '✗ 3e operador LEU % linha(s) de import_logs', v_n;
  end if;

  -- 3f. eventos_admin: leitura só de admin (0065). Idem — há 1 linha nas fixtures.
  select count(*) into v_n from public.eventos_admin;
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 3f operador NÃO lê eventos_admin (existe 1 linha, viu 0)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3f; ';
    raise warning '✗ 3f operador LEU % linha(s) de eventos_admin', v_n;
  end if;

  -- 3f-bis. E não FORJA a trilha do import (0067). Até a 0067, a policy de INSERT de
  -- `import_logs` era `with check (true)` — e `authenticated` tem privilégio de INSERT na
  -- tabela, então qualquer logado gravava linhas falsas no histórico do import destrutivo
  -- via PostgREST. Trilha de auditoria que qualquer um escreve não é trilha.
  begin
    insert into public.import_logs (
      filial_id, modo, arquivo_hash, total_linhas,
      ativos_criados, movs_apagadas, anotacoes_apagadas, termos_apagados,
      backup_path, correcoes, criado_por
    ) values (v_f1, 'substituir', 'forjado', 0, 0, 0, 0, 0, 'x', '[]'::jsonb, k_operador);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3f-bis_FORJOU_TRILHA; ';
    raise warning '✗ 3f-bis operador GRAVOU na trilha do import (a 0067 não está no ar)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 3f-bis operador não forja a trilha do import (%)', sqlstate;
  end;

  -- 3g. ESCALADA DE PRIVILÉGIO: não consegue se promover (grant de coluna, 0063)
  begin
    update public.profiles set papel = 'admin' where id = k_operador;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3g; ';
    raise warning '✗ 3g operador SE PROMOVEU a admin (grant de coluna falhou!)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 3g operador recusado ao mexer em profiles.papel (%)', sqlstate;
  end;

  -- 3h. mas continua podendo editar o PRÓPRIO nome (as duas colunas concedidas)
  begin
    update public.profiles set primeiro_nome = 'Fulano', sobrenome = 'de Teste'
     where id = k_operador;
    v_ok := v_ok + 1; raise notice '✓ 3h operador ainda edita o próprio nome/sobrenome';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3h; ';
    raise warning '✗ 3h operador NÃO consegue editar o próprio nome: % %', sqlstate, sqlerrm;
  end;

  -- 3i. RPC do import recusa não-admin (guarda interna da 0064)
  begin
    perform public.importar_ativos_substituir('{"filialId":1,"ativos":[]}'::jsonb,
                                              'backup/teste', '{}'::jsonb, '[]'::jsonb);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3i; ';
    raise warning '✗ 3i operador executou a RPC de import (deveria exigir admin)';
  exception when others then
    if sqlerrm like '%administradores%' then
      v_ok := v_ok + 1; raise notice '✓ 3i RPC de import recusa operador com a mensagem certa';
    else
      v_ok := v_ok + 1;
      raise notice '✓ 3i RPC de import recusou operador (%, %)', sqlstate, left(sqlerrm, 60);
    end if;
  end;

  reset role;

  -- =========================================================================
  -- 4 — DESATIVADO: `ativo=false` fecha tudo, mesmo COM vínculo na filial 1
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_inativo, 'role', 'authenticated')::text, true);

  if public.papel_atual() is null then
    v_ok := v_ok + 1; raise notice '✓ 4a papel_atual() é NULL para perfil desativado';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4a; ';
    raise warning '✗ 4a papel_atual() devolveu % para perfil desativado', public.papel_atual();
  end if;

  if not public.pode_escrever_filial(v_f1) then
    v_ok := v_ok + 1; raise notice '✓ 4b desativado não escreve na filial VINCULADA (f%)', v_f1;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4b; ';
    raise warning '✗ 4b desativado ainda pode escrever na filial vinculada';
  end if;

  begin
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao,
                                      status_resultante, criado_por)
    values (v_ativo_f1, 'ajuste', current_date, v_f1, 'ajuste inativo', 'em_estoque', k_inativo);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4c; ';
    raise warning '✗ 4c desativado MOVIMENTOU (deveria ser recusado)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 4c desativado recusado ao movimentar (%)', sqlstate;
  end;

  reset role;

  -- =========================================================================
  -- 5 — ADMIN: faz o que o operador não pode
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);

  if public.e_admin() then
    v_ok := v_ok + 1; raise notice '✓ 5a e_admin() = true';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5a; ';
    raise warning '✗ 5a e_admin() = false para papel admin';
  end if;

  -- 5b. admin escreve em QUALQUER filial, sem precisar de vínculo
  if public.pode_escrever_filial(v_f1) and public.pode_escrever_filial(v_f2) then
    v_ok := v_ok + 1; raise notice '✓ 5b admin escreve nas duas filiais sem vínculo';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5b; ';
    raise warning '✗ 5b admin sem permissão em alguma filial';
  end if;

  begin
    insert into public.motivos (codigo, rotulo, aplica_a)
    values ('f21-adm', 'Motivo f21 admin', array['saida']::public.tipo_movimentacao[]);
    v_ok := v_ok + 1; raise notice '✓ 5c admin cria motivo';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5c; ';
    raise warning '✗ 5c admin recusado ao criar motivo: % %', sqlstate, sqlerrm;
  end;

  begin
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao,
                                      status_resultante, criado_por)
    values (v_ativo_f2, 'ajuste', current_date, v_f2, 'ajuste admin f21',
            'em_estoque', k_admin);
    v_ok := v_ok + 1; raise notice '✓ 5d admin movimenta na filial sem vínculo (f%)', v_f2;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5d; ';
    raise warning '✗ 5d admin recusado na f%: % %', v_f2, sqlstate, sqlerrm;
  end;

  -- 5e. admin LÊ a auditoria — e tem de ver a linha das fixtures (o outro lado do 3f:
  --     sem isto, uma policy que escondesse de TODOS passaria os dois testes).
  select count(*) into v_n from public.eventos_admin;
  if v_n >= 1 then
    v_ok := v_ok + 1; raise notice '✓ 5e admin LÊ eventos_admin (% linha(s))', v_n;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5e; ';
    raise warning '✗ 5e admin não viu a auditoria (existe 1 linha, viu %) — a aba viria vazia', v_n;
  end if;

  -- 5e-bis. o mesmo par para import_logs: admin VÊ o histórico que o operador não vê.
  select count(*) into v_n from public.import_logs;
  if v_n >= 1 then
    v_ok := v_ok + 1; raise notice '✓ 5e-bis admin LÊ import_logs (% linha(s))', v_n;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5e-bis; ';
    raise warning '✗ 5e-bis admin não viu import_logs — /admin/importar perderia o histórico';
  end if;

  -- 5f. mas NEM O ADMIN lê senhas_acesso pelo client de sessão (0012 — hash protegido).
  --     Esta é a asserção que trava a decisão 2 da F21: a tentação de "abrir para admin
  --     por consistência" reabriria o brute-force offline do hash.
  select count(*) into v_n from public.senhas_acesso;
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 5f nem o admin lê senhas_acesso por sessão (existe 1 linha, viu 0)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5f; ';
    raise warning '✗ 5f admin leu % linha(s) de senhas_acesso — o hash voltou a ficar exposto', v_n;
  end if;

  -- 5g. admin também não escreve direto em profiles.papel (só service role)
  begin
    update public.profiles set papel = 'consulta' where id = k_operador;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5g; ';
    raise warning '✗ 5g admin alterou profiles.papel por sessão (deveria ser só service role)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 5g nem o admin muda papel por sessão (%), só o service role', sqlstate;
  end;

  reset role;

  -- =========================================================================
  -- 6 — STORAGE: as policies dos buckets olham o cargo (0066)
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_consulta, 'role', 'authenticated')::text, true);
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('termos', 'f21/teste-consulta.docx', k_consulta);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6a; ';
    raise warning '✗ 6a consulta SUBIU arquivo no bucket termos';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 6a consulta recusada ao subir no bucket termos (%)', sqlstate;
  end;

  -- Há 1 objeto plantado nas fixtures: ver 0 é a policy da 0066, não bucket vazio.
  select count(*) into v_n from storage.objects where bucket_id = 'backups-import';
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 6b consulta não lê o bucket backups-import (existe 1, viu 0)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6b; ';
    raise warning '✗ 6b consulta leu % objeto(s) de backups-import', v_n;
  end if;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('termos', 'f21/teste-operador.docx', k_operador);
    v_ok := v_ok + 1; raise notice '✓ 6c operador SOBE arquivo no bucket termos';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6c; ';
    raise warning '✗ 6c operador recusado ao subir no bucket termos: % %', sqlstate, sqlerrm;
  end;

  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('backups-import', 'f21/backup-operador.csv', k_operador);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6d; ';
    raise warning '✗ 6d operador SUBIU no bucket backups-import (é matéria de admin)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 6d operador recusado no bucket backups-import (%)', sqlstate;
  end;

  -- 6e. o operador também não LISTA os backups. É o furo que a 0063 sozinha deixaria: sem a
  --     0066, esconder `import_logs.backup_path` dele e deixar o bucket aberto seria fechar a
  --     porta e deixar a chave na fechadura.
  select count(*) into v_n from storage.objects where bucket_id = 'backups-import';
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 6e operador não LISTA backups-import (existe 1, viu 0)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6e; ';
    raise warning '✗ 6e operador listou % objeto(s) de backups-import', v_n;
  end if;
  reset role;

  -- 6f. e o ADMIN continua vendo — senão /admin/importar perderia o download do backup.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);
  select count(*) into v_n from storage.objects where bucket_id = 'backups-import';
  if v_n >= 1 then
    v_ok := v_ok + 1; raise notice '✓ 6f admin LÊ backups-import (% objeto(s))', v_n;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6f; ';
    raise warning '✗ 6f admin não viu o backup — o botão de download quebraria';
  end if;
  reset role;

  -- =========================================================================
  -- RESUMO (a linha que o MCP consegue ler — ele engole NOTICE/WARNING)
  -- =========================================================================
  insert into _papeis_resumo values (v_ok, v_falhas, nullif(v_msgs, ''));
  if v_falhas = 0 then
    raise notice '=== papeis_rls: % asserções OK, 0 falhas ===', v_ok;
  else
    raise warning '✗ TOTAL papeis_rls: % falha(s) — %', v_falhas, v_msgs;
  end if;
end $$;

select * from _papeis_resumo;

rollback;
