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
-- O QUE ELE PROVA (critérios de aceitação 1, 2, 3, 5, 6 e 7 da ordem F21). A numeração abaixo
-- é a das SEÇÕES REAIS do arquivo — quem audita cobertura por este índice tem de encontrar
-- exatamente o que ele promete (antes ele listava "6 RPCs / 7 escalada / 8 storage" como se
-- fossem seções próprias, e prometia uma prova de `criar_compra_lote` que não existia):
--   1  consulta   — lê, mas não escreve NADA (6 tabelas); e o cargo mais fraco ATIVO continua
--                   lendo `profiles` e a view (1b-bis/1b-ter, o outro lado do gate da 0070)
--   2  operador   — escreve na filial VINCULADA e é RECUSADO na não-vinculada; inclui o caso
--                   CRUZADO (2c-bis/2c-ter, a 0067), o ponteiro de estorno de item
--                   (2e-bis/2e-ter, a 0068), a RPC `criar_compra_lote` (2g-bis/2g-ter, a guarda
--                   de vínculo da 0064), o TERMO de filial alheia — linha, vaga única e .docx
--                   (2i-bis-*, a 0069) com o fluxo legítimo em par (2i-ter-*), e a
--                   transferência LEGÍTIMA (2h, sempre por último — ela MOVE o ativo)
--   3  operador   — não mexe em catálogo de admin, não lê senhas/import_logs/auditoria, não
--                   forja a trilha do import (3f-bis), não se promove (3g — escalada de
--                   privilégio pelo grant de coluna), ainda edita o próprio nome (3h) e é
--                   recusado pela RPC de import (3i)
--   4  desativado — `ativo=false` fecha tudo, mesmo com vínculo (revogação imediata): escrita
--                   (4a..4c) E LEITURA (4d..4g, a 0070 — inclusive pela view)
--   5  admin      — faz tudo o que o operador não pode, e o que NEM ELE pode (5f/5g); mais a
--                   válvula da 0069 (5h/5i: alcança termo de qualquer filial, e a linha
--                   degenerada, para poder limpar)
--   6  storage    — as policies dos buckets também olham o cargo
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
-- ⚠⚠ E POR ISSO O BLOCO É EXPLÍCITO, TABELA POR TABELA. `grant select on all tables in schema
-- public` (que era o que estava aqui) é uma bomba de efeito retardado: no dia em que uma fase
-- endurecer alguma tabela por REVOKE de privilégio — o caminho natural para o `hash` de
-- `senhas_acesso`, ou para tirar o INSERT de `eventos_admin` de `authenticated` — o `all tables`
-- devolveria o privilégio dentro da transação, as asserções seguiriam verdes e a divergência
-- com produção só apareceria em runtime. Regra: **só entra aqui a tabela/verbo que uma asserção
-- deste arquivo realmente usa**, e o comentário diz qual. Tabela que o roteiro só LÊ para provar
-- que a policy esconde (senhas_acesso, import_logs, eventos_admin) recebe SELECT e nada mais.
--
-- Tudo dentro do `begin; … rollback;` — nada persiste. Num banco hospedado estes grants já
-- existem, então o bloco é no-op lá.

-- LEITURA — o que alguma asserção seleciona como `authenticated`.
grant select on
  public.ativos,            -- 1b (consulta lê), 2c-ter (o ativo não migrou)
  public.filiais,           -- resolução de filial nas asserções
  public.itens,             -- fixtures / lançamento
  public.lancamentos_item,  -- trigger `valida_lancamento_item` (INVOKER) lê o saldo
  public.movimentacoes,     -- trigger de estorno / conferências
  public.profiles,          -- 3h (edita o próprio nome) precisa do RETURNING/select
  public.termos_gerados,    -- 2i-bis/2i-ter (termo de filial alheia)
  public.senhas_acesso,     -- 3d / 5f: ver 0 linhas é a RLS trabalhando
  public.import_logs,       -- 3e / 5e-bis
  public.eventos_admin,     -- 3f / 5e
  public.colaboradores,     -- 1i (consulta lê o cadastro), 2j, 3c-ter
  public.tipos_item,        -- 1j (consulta lê o vocabulário), 3c-bis, 5c-bis
  -- ⚠ A VIEW precisa de grant PRÓPRIO: `grant ... on all tables` cobria views, a lista
  -- explícita não. É a única view que alguma asserção consulta (1b-ter e 4g, os dois lados do
  -- gate da 0070 — ela tem `security_invoker = true`, então herda a RLS das tabelas-base).
  public.v_estoque_atual
  to authenticated;

-- ESCRITA — só as tabelas que alguma asserção tenta escrever.
grant insert, update, delete on
  public.ativos,             -- 1c/1d, 2f/2g, criar_compra_lote (INVOKER)
  public.movimentacoes,      -- 1e, 2b/2c/2c-bis/2h, 4c, 5d, criar_compra_lote
  public.lancamentos_item,   -- 1f, 2d/2e/2e-bis/2e-ter
  public.anotacoes,          -- 1g
  public.relatorios_gerados, -- 1h
  public.termos_gerados,     -- 2i-bis (ataque) / 2i-ter (legítimo)
  public.filiais,            -- 3b
  public.motivos,            -- 3a / 5c
  public.itens,              -- 3c
  public.import_logs,        -- 3f-bis (forjar a trilha)
  -- F37 — `colaboradores` é a ÚNICA tabela de cadastro que o OPERADOR escreve
  -- (INSERT por `pode_escrever()`, porque ele cria a pessoa inline no meio do fluxo);
  -- UPDATE continua sendo do nível administrador. As duas metades são medidas: 2j
  -- (operador CRIA) e 3c-ter (operador NÃO edita).
  public.colaboradores,      -- 1i-bis, 2j, 3c-ter
  public.tipos_item          -- 3c-bis (operador recusado), 5c-bis (admin cria)
  to authenticated;

-- `profiles`: espelho EXATO do grant da 0063 — nunca `update` de tabela (3g depende disso).
grant update (primeiro_nome, sobrenome) on public.profiles to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;   -- 6a..6f

-- Trava do bloco acima: se algum dia ele voltar a conceder UPDATE de TABELA em `profiles`, a
-- asserção 3g (escalada) passaria por engano. Isto falha ALTO antes de qualquer asserção rodar.
do $trava$
begin
  if exists (
    select 1 from information_schema.table_privileges
     where table_schema = 'public' and table_name = 'profiles'
       and grantee = 'authenticated' and privilege_type = 'UPDATE'
  ) then
    raise exception 'O bloco de grants deste roteiro devolveu UPDATE de TABELA em profiles — a asserção 3g (escalada de privilégio) passaria por engano. Conceda coluna por coluna.';
  end if;
end
$trava$;

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
  -- 0069 — ativos/movimentações DEDICADOS ao teste de termo. Separados de `v_ativo_f1/f2` de
  -- propósito: dar uma movimentação àqueles mudaria o STATUS deles e as asserções 2b/2c/2h
  -- passariam a medir outra coisa (a transferência do 2h depende do estado corrente).
  v_ativo_t1   uuid;
  v_ativo_t2   uuid;
  v_mov_t1     uuid;
  v_mov_t2     uuid;
  v_termo_f2   uuid;   -- a VÍTIMA: termo de ativo da filial NÃO vinculada
  v_termo_novo uuid;   -- o termo que o operador gera legitimamente na filial dele
  -- F37 — o colaborador que o OPERADOR cria (2j) e que só o ADMIN edita (3c-ter/5c-ter).
  -- É a mesma linha nas três asserções de propósito: é o que prova que a diferença
  -- está no CARGO, e não em qual linha cada um alcança.
  v_colab_f37  uuid;
  v_item_f41   smallint;   -- F41: o item que o operador cria em 3c e não edita em 3c-quater
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

  -- FIXTURES DOS TERMOS (0069). Dois ativos NOVOS (um por filial) com uma saída cada, e um
  -- TERMO já gerado para o da filial 2 — a vítima do exploit. Criados como postgres, que ignora
  -- RLS, e já no formato que os invariantes da 0069 exigem (`ativo_ids` = conjunto derivado das
  -- movimentações; `arquivo_path` = id||'.docx'), para as asserções medirem AUTORIZAÇÃO e não
  -- uma fixture malformada. O objeto de Storage entra junto: sem ele, "não consegue apagar o
  -- .docx" passaria de graça.
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009003', 'F21TST3', 'notebook', v_f1, 'cadastro') returning id into v_ativo_t1;
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009004', 'F21TST4', 'notebook', v_f2, 'cadastro') returning id into v_ativo_t2;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, criado_por)
  values (v_ativo_t1, 'saida', current_date, v_f1, 'Fulano de Teste', k_admin)
  returning id into v_mov_t1;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, criado_por)
  values (v_ativo_t2, 'saida', current_date, v_f2, 'Beltrana de Teste', k_admin)
  returning id into v_mov_t2;
  v_termo_f2   := gen_random_uuid();
  v_termo_novo := gen_random_uuid();
  insert into public.termos_gerados (id, tipo, movimentacao_ids, ativo_ids, colaborador,
                                     dados, arquivo_path, gerado_por)
  values (v_termo_f2, 'responsabilidade_notebook', array[v_mov_t2], array[v_ativo_t2],
          'Beltrana de Teste', '{}'::jsonb, v_termo_f2::text || '.docx', k_admin);
  insert into storage.objects (bucket_id, name, owner)
  values ('termos', v_termo_f2::text || '.docx', k_admin);

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

  -- 1b-bis / 1b-ter. O OUTRO LADO do 4e/4g (0070): o piso de leitura passou a ser PERFIL ATIVO,
  -- e o cargo mais fraco — ATIVO — tem de continuar lendo tudo. Sem este par, uma policy que
  -- escondesse de TODOS passaria nos dois testes. `profiles` importa em especial: a policy dele
  -- passou a chamar `papel_atual()`, que LÊ `profiles` — se houvesse recursão, seria aqui
  -- (42P17), e não em produção.
  select count(*) into v_n from public.profiles;
  if v_n >= 4 then
    v_ok := v_ok + 1; raise notice '✓ 1b-bis consulta ATIVO lê profiles (% linhas, sem recursão)', v_n;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1b-bis; ';
    raise warning '✗ 1b-bis consulta viu só % perfil(is) — o gate da 0070 fechou demais', v_n;
  end if;

  select count(*) into v_n from public.v_estoque_atual;
  if v_n >= 1 then
    v_ok := v_ok + 1; raise notice '✓ 1b-ter consulta ATIVO lê a view v_estoque_atual (% linhas)', v_n;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1b-ter; ';
    raise warning '✗ 1b-ter consulta não leu v_estoque_atual — o gate da 0070 cegou a view';
  end if;

  -- 1i / 1j (F37). As tabelas NOVAS entram no mesmo piso de leitura das demais: todo
  -- logado ATIVO lê tudo. `tipos_item` tem seed (7 linhas da 0114), então aqui a
  -- asserção é "vê as 7"; `colaboradores` nasce vazia, e para ela o que se mede é que
  -- a leitura NÃO é recusada — 0 linhas com sucesso é diferente de 42501.
  select count(*) into v_n from public.tipos_item;
  if v_n >= 7 then
    v_ok := v_ok + 1; raise notice '✓ 1i consulta ATIVO lê tipos_item (% linhas)', v_n;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1i; ';
    raise warning '✗ 1i consulta viu só % tipo(s) de item — o piso de leitura fechou demais', v_n;
  end if;

  begin
    select count(*) into v_n from public.colaboradores;
    v_ok := v_ok + 1; raise notice '✓ 1j consulta ATIVO lê colaboradores (% linhas)', v_n;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1j; ';
    raise warning '✗ 1j consulta recusada ao ler colaboradores (% %)', sqlstate, sqlerrm;
  end;

  -- 1i-bis. O cargo CONSULTA não escreve NADA — nem o cadastro de pessoas, que é a
  -- única tabela de cadastro aberta ao operador. Sem esta asserção, a policy
  -- `pode_escrever()` da 0112 poderia estar escrita como `using (true)` e ninguém veria.
  begin
    insert into public.colaboradores (nome, criado_por) values ('Consulta F37', k_consulta);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1i-bis; ';
    raise warning '✗ 1i-bis consulta CRIOU colaborador (não escreve nada)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 1i-bis consulta recusada ao criar colaborador (%)', sqlstate;
  end;

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

  -- 2g-bis / 2g-ter. A GUARDA DE VÍNCULO DA RPC `criar_compra_lote` (migration 0064).
  -- Ela não tinha prova de runtime NENHUMA — o cabeçalho deste arquivo prometia, mas nenhum
  -- roteiro da pasta chamava a função (só `seguranca_catalogo.sql`, e lá se mede GRANT, não
  -- comportamento). A `0064` recriou o corpo por `create or replace` copiado à mão da `0040`:
  -- é exatamente o tipo de função em que um bloco de guarda cai fora numa recriação futura sem
  -- ninguém notar. A RPC é SECURITY INVOKER, então a policy da 0063 também barraria — as duas
  -- asserções cobrem o par (a guarda dá a MENSAGEM, a policy dá a recusa).
  begin
    perform * from public.criar_compra_lote(
      jsonb_build_array(jsonb_build_object(
        'patrimonio', 'WAP0009011', 'service_tag', 'F21RPC1',
        'categoria', 'notebook', 'filial_id', v_f2)),
      k_operador);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2g-bis_COMPRA_FILIAL_ALHEIA; ';
    raise warning '✗ 2g-bis operador cadastrou COMPRA na filial NÃO vinculada (f%) pela RPC', v_f2;
  exception when others then
    -- A guarda interna levanta 42501 com "Sem permissao de escrita na filial"; se ela cair, a
    -- policy de `ativos` recusa também (com SQLSTATE cru). Aceita as duas, mas registra qual.
    v_ok := v_ok + 1;
    raise notice '✓ 2g-bis RPC de compra recusada na filial não vinculada (%, %)',
      sqlstate, left(sqlerrm, 60);
  end;

  begin
    perform * from public.criar_compra_lote(
      jsonb_build_array(jsonb_build_object(
        'patrimonio', 'WAP0009012', 'service_tag', 'F21RPC2',
        'categoria', 'notebook', 'filial_id', v_f1)),
      k_operador);
    v_ok := v_ok + 1;
    raise notice '✓ 2g-ter RPC de compra ACEITA na filial vinculada (f%)', v_f1;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2g-ter(' || sqlstate || '); ';
    raise warning '✗ 2g-ter a compra LEGÍTIMA pela RPC foi recusada (% %) — a guarda da 0064 está barrando fluxo normal',
      sqlstate, sqlerrm;
  end;

  -- 2i-bis. O TERMO de filial não vinculada (migration 0069). É a terceira volta do padrão que
  -- a 0067 e a 0068 fecharam, e a pior: o dano é DESTRUTIVO. Até a 0069, `termos_gerados` e as
  -- policies de escrita do bucket `termos` eram gateadas SÓ pelo cargo, então um operador da
  -- filial 1 apagava a linha E o .docx assinado de um termo da filial 5 por `curl`.
  --
  -- ⚠ DELETE/UPDATE recusados por RLS NÃO levantam exceção: o USING é FILTRO DE LINHA. Por isso
  -- estas três medem `row_count`, e não `sqlstate` — foi o que o 2g já fazia para o UPDATE.
  delete from public.termos_gerados where id = v_termo_f2;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 2i-bis operador não APAGA termo de filial não vinculada';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2i-bis_TERMO_APAGADO; ';
    raise warning '✗ 2i-bis operador APAGOU o termo da filial % (a 0069 não está no ar)', v_f2;
  end if;

  update public.termos_gerados set colaborador = 'invadido' where id = v_termo_f2;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 2i-bis-2 operador não REESCREVE termo de filial não vinculada';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2i-bis-2_TERMO_REESCRITO; ';
    raise warning '✗ 2i-bis-2 operador reescreveu o termo da filial %', v_f2;
  end if;

  -- Queimar a VAGA: a chave única é (tipo, movimentacao_ids). Sem `termo_ancora_coerente`, o
  -- atacante cita as movimentações da f2 declarando ativo PRÓPRIO — passa o gate de filial e a
  -- f2 nunca mais gera aquele termo (é o dano da 0068, em documento).
  begin
    insert into public.termos_gerados (id, tipo, movimentacao_ids, ativo_ids, colaborador,
                                       dados, arquivo_path, gerado_por)
    values (gen_random_uuid(), 'responsabilidade_desktop', array[v_mov_t2], array[v_ativo_t1],
            'x', '{}'::jsonb, 'forjado.docx', k_operador);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2i-bis-3_VAGA_QUEIMADA; ';
    raise warning '✗ 2i-bis-3 operador QUEIMOU a vaga de termo da filial % (âncora não conferida)', v_f2;
  exception when others then
    v_ok := v_ok + 1;
    raise notice '✓ 2i-bis-3 `ativo_ids` mentido é recusado (%) — a âncora está no ar', sqlstate;
  end;

  -- E o .docx: sobrescrever o path da f2 (o caso do upload interrompido, em que a LINHA existe e
  -- o arquivo não) tem de ser recusado. ⚠ O DELETE de `storage.objects` NÃO é testável por SQL:
  -- o trigger `storage.protect_objects_delete` barra toda exclusão direta, então a policy de
  -- DELETE do bucket só é exercitada pela API de Storage. Aqui se prova o INSERT, que é o mesmo
  -- predicado (`pode_escrever_arquivo_termo`).
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('termos', v_termo_f2::text || '.docx', k_operador);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2i-bis-4_DOCX_SOBRESCRITO; ';
    raise warning '✗ 2i-bis-4 operador sobrescreveu o .docx do termo da filial %', v_f2;
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 2i-bis-4 operador não toca o .docx de termo alheio (%)', sqlstate;
  end;

  -- 2i-ter. E o fluxo LEGÍTIMO segue passando — sem este par, a 0069 poderia ter fechado o furo
  -- quebrando a geração de termo, que é o que o `persistirTermo` faz em toda ficha. A ordem
  -- reproduz a da action: o objeto sobe ANTES da linha existir (termos.ts), então o nome novo tem
  -- de ser livre.
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('termos', v_termo_novo::text || '.docx', k_operador);
    v_ok := v_ok + 1; raise notice '✓ 2i-ter operador SOBE o .docx do termo novo (nome sem linha)';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2i-ter(' || sqlstate || '); ';
    raise warning '✗ 2i-ter upload do termo NOVO foi recusado (%) — a 0069 quebrou a geração', sqlstate;
  end;

  begin
    insert into public.termos_gerados (id, tipo, movimentacao_ids, ativo_ids, colaborador,
                                       dados, arquivo_path, gerado_por)
    values (v_termo_novo, 'responsabilidade_notebook', array[v_mov_t1], array[v_ativo_t1],
            'Fulano de Teste', '{}'::jsonb, v_termo_novo::text || '.docx', k_operador);
    v_ok := v_ok + 1; raise notice '✓ 2i-ter-2 operador GERA termo na filial vinculada';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2i-ter-2(' || sqlstate || '); ';
    raise warning '✗ 2i-ter-2 o termo LEGÍTIMO foi recusado (% %) — a 0069 quebrou o fluxo normal',
      sqlstate, sqlerrm;
  end;

  update public.termos_gerados set colaborador = 'Fulano de Teste (v2)', atualizado_por = k_operador
   where id = v_termo_novo;
  get diagnostics v_n = row_count;
  if v_n = 1 then
    v_ok := v_ok + 1; raise notice '✓ 2i-ter-3 operador REGERA o termo dele (update do próprio)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2i-ter-3; ';
    raise warning '✗ 2i-ter-3 a REGERAÇÃO do termo próprio foi bloqueada (% linhas)', v_n;
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

  -- 2j (F37). A METADE POSITIVA do par com 3c-ter, e a asserção que a ordem F37 pede
  -- por escrito no critério 7: o OPERADOR cria colaborador. Se isso falhar, o campo de
  -- colaborador do wizard quebra na mão dele — é a razão de `colaboradores` ter INSERT
  -- por `pode_escrever()` e não por `e_admin()` como os outros cadastros.
  --
  -- Note que NÃO há recorte por filial aqui: cadastro de pessoa não é matéria de
  -- filial (`filial_id` é atributo). O operador vinculado só à filial 1 cadastra uma
  -- pessoa da filial 2 — e deve mesmo, porque é ele quem entrega o equipamento.
  begin
    insert into public.colaboradores (nome, filial_id, criado_por)
    values ('Fulano F37 Operador', v_f2, k_operador)
    returning id into v_colab_f37;
    v_ok := v_ok + 1;
    raise notice '✓ 2j operador CRIA colaborador (inline no fluxo), inclusive de filial não vinculada';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2j(' || sqlstate || '); ';
    raise warning '✗ 2j operador recusado ao criar colaborador (% %) — o campo do wizard quebra assim', sqlstate, sqlerrm;
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

  -- 3c (F41 — INVERTIDO em 31/08/2026). Este cenário afirmava, até a véspera, que o
  -- operador era RECUSADO ao criar item de catálogo. Ele virou porque a REGRA virou,
  -- não para ficar verde: a decisão J2/D4 abriu o INSERT de `itens` a
  -- `pode_escrever()` (migration 0125), pelo mesmo motivo, palavra por palavra, que
  -- abriu `colaboradores` na F37/D5 — é o operador quem cadastra o acessório inline
  -- no meio da movimentação, e exigir admin ali quebrava o fluxo na mão dele. Medido:
  -- a maioria dos itens sequer estava cadastrada (dor D4 do docs/PLANO-ITENS.md).
  -- Ata em docs/DECISOES.md.
  --
  -- É a METADE POSITIVA do par com 3c-quater, exatamente como 2j é com 3c-ter.
  begin
    insert into public.itens (nome, grupo) values ('Item f41 op', 'acessorio')
    returning id into v_item_f41;
    v_ok := v_ok + 1;
    raise notice '✓ 3c operador CRIA item de catálogo (inline no fluxo, desde a F41)';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3c(' || sqlstate || '); ';
    raise warning '✗ 3c operador recusado ao criar item (% %) — o cadastro inline quebra assim', sqlstate, sqlerrm;
  end;

  -- 3c-quater (F41). A METADE NEGATIVA: o operador CRIA item, mas NÃO edita nem
  -- desativa — isso é do nível administrador, igualzinho a colaborador. Sem esta
  -- asserção, uma policy de UPDATE escrita por engano com `pode_escrever()` daria ao
  -- operador o poder de renomear qualquer item do catálogo, e nada acusaria.
  --
  -- Molde do 3c-ter: UPDATE sob RLS não lança erro, apenas não atinge linha nenhuma.
  -- As duas formas de negação são aceitáveis; o que não pode é `v_n > 0`.
  begin
    update public.itens set nome = 'Renomeado pelo operador' where id = v_item_f41;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      v_ok := v_ok + 1; raise notice '✓ 3c-quater operador não edita item (0 linhas — a policy de UPDATE é de admin)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '3c-quater; ';
      raise warning '✗ 3c-quater operador EDITOU % item(ns) de catálogo', v_n;
    end if;
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 3c-quater operador recusado ao editar item (%)', sqlstate;
  end;

  -- 3c-quinquies (F41). A CHAVE de deduplicação vale para quem quer que insira: o
  -- mesmo nome com acento e espaço a mais é recusado pelo índice único
  -- `itens_nome_chave_uidx` (0125). Sem ele, cadastro aberto vira catálogo com
  -- "Mochila", "mochila" e "Mochila " — três itens onde há um, e três saldos que
  -- não somam.
  begin
    insert into public.itens (nome, grupo) values ('  ITEM   F41   OP  ', 'acessorio');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3c-quinquies; ';
    raise warning '✗ 3c-quinquies a chave de item NÃO deduplicou (entrou item repetido)';
  exception when unique_violation then
    v_ok := v_ok + 1; raise notice '✓ 3c-quinquies nome repetido por caixa/espaço recusado pela chave (%)', sqlstate;
  when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3c-quinquies(' || sqlstate || '); ';
    raise warning '✗ 3c-quinquies recusou pelo motivo ERRADO (% %)', sqlstate, sqlerrm;
  end;

  -- 3c-bis (F37). `tipos_item` é vocabulário do sistema, como motivos: o operador
  -- escolhe, não inventa.
  begin
    insert into public.tipos_item (slug, rotulo) values ('f37_op', 'Tipo do operador');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3c-bis; ';
    raise warning '✗ 3c-bis operador CRIOU tipo de item (é matéria de admin)';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 3c-bis operador recusado ao criar tipo de item (%)', sqlstate;
  end;

  -- 3c-ter (F37). A METADE NEGATIVA do par com 2j: o operador CRIA colaborador
  -- (porque cadastra a pessoa no meio do fluxo), mas NÃO edita nem desativa — isso é
  -- do nível administrador. Sem esta asserção, uma policy de UPDATE escrita por
  -- engano com `pode_escrever()` daria ao operador o poder de renomear qualquer
  -- pessoa do cadastro, e nada acusaria.
  begin
    update public.colaboradores set nome = 'Renomeado pelo operador' where id = v_colab_f37;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      v_ok := v_ok + 1; raise notice '✓ 3c-ter operador não edita colaborador (0 linhas — a policy de UPDATE é de admin)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '3c-ter; ';
      raise warning '✗ 3c-ter operador EDITOU % colaborador(es)', v_n;
    end if;
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 3c-ter operador recusado ao editar colaborador (%)', sqlstate;
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

  -- 4d..4f. E TAMBÉM NÃO LÊ (migration 0070). Até ela, `profiles.ativo = false` fechava só a
  -- ESCRITA: toda policy de SELECT era `using (true)`, e o `authenticated` de quem foi desligado
  -- continua sendo `authenticated` enquanto o access token não expira (~1h). Nesse intervalo o
  -- acervo inteiro — com colaborador, filial e patrimônio — saía por
  -- `GET /rest/v1/ativos?select=*` com a anon key do bundle. As 5 views vinham de graça, porque
  -- têm `security_invoker = true`.
  select count(*) into v_n from public.ativos;
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 4d desativado NÃO LÊ ativos (existem linhas, viu 0)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4d_LE_ACERVO; ';
    raise warning '✗ 4d desativado LEU % ativo(s) — a 0070 não está no ar', v_n;
  end if;

  select count(*) into v_n from public.profiles;
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 4e desativado NÃO LÊ profiles (a equipe toda)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4e_LE_EQUIPE; ';
    raise warning '✗ 4e desativado LEU % perfil(is)', v_n;
  end if;

  select count(*) into v_n from storage.objects where bucket_id = 'termos';
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 4f desativado NÃO LISTA os .docx de termo';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4f_LE_TERMOS; ';
    raise warning '✗ 4f desativado listou % objeto(s) do bucket termos', v_n;
  end if;

  -- 4g. A view (security_invoker) herda o gate — a prova de que não sobrou porta lateral.
  select count(*) into v_n from public.v_estoque_atual;
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 4g desativado NÃO LÊ nem pela view v_estoque_atual';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4g_VIEW_ABERTA; ';
    raise warning '✗ 4g desativado leu % linha(s) de v_estoque_atual', v_n;
  end if;

  -- 4h / 4i (F37). As tabelas NOVAS herdam o mesmo gate. `tipos_item` é o caso mais
  -- fácil de passar despercebido: ela tem SEED (7 linhas da 0114), então uma policy de
  -- leitura escrita como `using (true)` — o texto velho de 0014/0043 — daria 7 linhas
  -- aqui e ninguém notaria, porque nenhuma outra asserção olha para ela com este cargo.
  select count(*) into v_n from public.tipos_item;
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 4h desativado NÃO LÊ tipos_item (existem 7 linhas, viu 0)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4h_LE_TIPOS; ';
    raise warning '✗ 4h desativado leu % tipo(s) de item — a policy ficou using(true)', v_n;
  end if;

  select count(*) into v_n from public.colaboradores;
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 4i desativado NÃO LÊ colaboradores (existe 1, viu 0)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4i_LE_COLABS; ';
    raise warning '✗ 4i desativado leu % colaborador(es)', v_n;
  end if;

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

  -- 5c-bis (F37). O outro lado do 3c-bis: quem cria tipo de item é o nível administrador.
  begin
    insert into public.tipos_item (slug, rotulo) values ('f37_adm', 'Tipo do admin');
    v_ok := v_ok + 1; raise notice '✓ 5c-bis admin cria tipo de item';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5c-bis; ';
    raise warning '✗ 5c-bis admin recusado ao criar tipo de item: % %', sqlstate, sqlerrm;
  end;

  -- 5c-ter (F37). O outro lado do 3c-ter: quem EDITA/desativa colaborador é o admin.
  -- A asserção é sobre `row_count`, e não sobre exceção, porque uma policy de UPDATE
  -- que não casa não levanta erro — ela simplesmente não vê a linha. Um `update` que
  -- "não deu erro" e mexeu em 0 linhas é a falha silenciosa clássica deste roteiro.
  begin
    update public.colaboradores set setor = 'TI (editado pelo admin)' where id = v_colab_f37;
    get diagnostics v_n = row_count;
    if v_n = 1 then
      v_ok := v_ok + 1; raise notice '✓ 5c-ter admin edita colaborador (1 linha)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '5c-ter; ';
      raise warning '✗ 5c-ter admin mexeu em % colaborador(es), esperado 1', v_n;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5c-ter(' || sqlstate || '); ';
    raise warning '✗ 5c-ter admin recusado ao editar colaborador: % %', sqlstate, sqlerrm;
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

  -- 5h. A VÁLVULA da 0069: o admin alcança o termo de QUALQUER filial. Não é conveniência — é o
  -- que impede a migration de criar lixo imortal. A primeira versão de `pode_escrever_termo`
  -- punha `e_admin()` DENTRO do `and` com a exigência de array não-vazio, e para
  -- `ativo_ids = '{}'` o resultado era false para todo mundo, admin incluído: nem UPDATE nem
  -- DELETE, e o .docx indestrutível. Três lentes independentes acharam o mesmo defeito.
  if public.pode_escrever_termo('{}'::uuid[]) then
    v_ok := v_ok + 1; raise notice '✓ 5h admin alcança termo degenerado (ativo_ids vazio) para limpar';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5h_LIXO_IMORTAL; ';
    raise warning '✗ 5h admin NÃO alcança linha de ativo_ids vazio — a ordem da disjunção em pode_escrever_termo está errada';
  end if;

  delete from public.termos_gerados where id = v_termo_f2;
  get diagnostics v_n = row_count;
  if v_n = 1 then
    v_ok := v_ok + 1; raise notice '✓ 5i admin APAGA termo de filial em que não tem vínculo';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5i; ';
    raise warning '✗ 5i admin não conseguiu apagar o termo da outra filial (% linhas)', v_n;
  end if;

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
  raise notice 'FIM papeis_rls: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

select * from _papeis_resumo;

rollback;
