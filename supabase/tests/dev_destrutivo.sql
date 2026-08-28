-- =============================================================
-- Roteiro de teste: FERRAMENTAS DESTRUTIVAS DO CARGO DEV
-- (F23 — migrations 0079 marca `forcado`, 0081 `guarda_acervo`, 0082 APAGAR, 0083 RESETAR,
--  0084 FORÇAR, 0085 vocabulário da trilha, 0087 correções da revisão, 0088 superfície de RPC,
--  0089 backup do recorte, 0090 furos da revisão).
--
-- Roda no job `banco` do CI (psql, ON_ERROR_STOP=1) e é auto-verificável no SQL editor / MCP.
-- Mesmo padrão dos demais roteiros da pasta:
--   NOTICE  '✓ ...'  quando a invariante bate
--   WARNING '✗ ...'  quando NÃO bate (o job `banco` falha em qualquer `WARNING: ✗`)
--
-- ARQUIVO SEPARADO de cargo_dev.sql, pela mesma razão que aquele se separou de papeis_rls.sql:
-- este roteiro ESVAZIA O BANCO no fim (§7, o reset global) e portanto tem uma ordem
-- semanticamente carregada — toda asserção que precise de acervo tem de vir ANTES dela. Um
-- arquivo novo entra no CI só por existir (`for f in supabase/tests/*.sql`) e não arrisca as
-- premissas do vizinho.
--
-- ESCREVE MUITO (usuários, ativos, movimentações, termos, itens, objetos de Storage) e APAGA
-- MUITO — inclusive um reset global. Roda inteiro dentro de `begin; ... rollback;`: nada sobra
-- no banco. 100% AUTOSSUFICIENTE — cria tudo de que precisa, porque o ensaio NÃO TEM exemplar
-- de quase nada disto (medido em 30/07/2026: 0 termos_gerados, 0 objetos de Storage, 0
-- estornos, 0 `substitui_ativo_id` preenchido, 0 kits). Cenário que não é plantado aqui não
-- existe.
--
-- DADOS 100% FICTÍCIOS (regra 2 do CLAUDE.md): patrimônios `WAP0009xxx`, service tags `F23*`,
-- e-mails `f23.*@wap.ind.br`, nomes inventados ("Fulano de Teste"). Nenhum dado real da WAP.
--
-- ⚠ TODA MOVIMENTAÇÃO DE FIXTURE TRAZ `created_at` EXPLÍCITO. A coluna tem default `now()`,
-- que dentro de uma transação é o MESMO instante para TODAS as linhas — e a ordenação de que
-- dependem `apagar_movimentacao` e o guard de estorno é `(created_at, id)`. Sem escalonar o
-- `created_at` à mão, o desempate cairia no uuid ALEATÓRIO do `id` e as asserções da §4
-- passariam ou falhariam por sorteio. É a armadilha mais cara deste arquivo; quem acrescentar
-- fixture aqui precisa repetir o padrão.
--
-- ⚠ E O EMPATE NÃO ERA SÓ ARMADILHA DE TESTE: medido em produção, 1111 dos 1232 ativos têm
-- movimentações com `created_at` IDÊNTICO (o par compra+ajuste que o import de startup grava
-- na mesma transação). A 0087 transformou esse caso em RECUSA — numa ferramenta irreversível,
-- "não sei qual é a última" não pode virar palpite. As asserções 4g/4g-bis/4h plantam o empate
-- DE PROPÓSITO e provam os dois lados: o par empatado é recusado (os DOIS membros, o que
-- descarta a hipótese de sorteio de uuid) e a movimentação posterior, com `created_at` próprio,
-- continua apagável — isto é, a recusa é ESTREITA.
--
-- O QUE ELE PROVA (§7 da ordem F23, item a item):
--   1  EXCLUSIVIDADE — admin, operador e consulta não executam NENHUMA das sete RPCs novas
--      (varredura 3 cargos × 7 RPCs); o request forjado (authenticated escrevendo direto) não
--      chega ao mesmo efeito; e o SERVICE ROLE não executa nenhuma delas. Mais a SUPERFÍCIE de
--      RPC depois da 0087/0088: as duas auxiliares fora da API, as OITO ferramentas dentro
--   2  IMUTABILIDADE fora da janela — UPDATE/DELETE em movimentacoes e lancamentos_item e
--      DELETE em ativos recusados para `authenticated` E para o DONO (o caso que só o trigger
--      pega); INSERT com `forcado = true` recusado; TRUNCATE — o flanco que trigger de linha
--      não vê — fechado por privilégio (0090); e o PAR POSITIVO obrigatório: o UPDATE legítimo
--      em ativos e o INSERT normal de movimentação continuam passando E derivando
--   3  apagar_ativo — some com o rastro (movimentações, anotação, pendência de item, termo com
--      .docx), anula o ponteiro do substituto, LIBERA o par patrimônio+service tag, devolve os
--      caminhos dos .docx para a action remover — e RECUSA termo de lote misto
--   4  apagar_movimentacao — a última / do meio / a única / com termo / o par estorno / a
--      DIVERGÊNCIA DE ORDENAÇÃO plantada de propósito (data fora de ordem vs created_at) / e o
--      EMPATE de created_at, que a 0087 virou recusa (os DOIS membros do par), com o par
--      positivo de que essa recusa é estreita
--   5  apagar_item — some com lançamentos e saldo (conferido por rel_saldo_itens)
--   6  reset por filial — não vaza para outra filial, e o que o recorte REALMENTE faz
--   7  reset global — zera acervo e itens; CADASTROS e história administrativa ficam
--   8  reset recusa sem backup existente (22023), com backup que existe mas é de OUTRO recorte
--      (22023, a 0089), com contagens divergentes (40001) e sem contagens (22023)
--   9  forçar estado — a ficha deriva, a marca nasce, o detentor zera nos terminais (e só
--      neles), e os três relatórios devolvem OS MESMOS NÚMEROS antes e depois
--  10  forçar saldo — chega ao alvo, para cima e para baixo, conferido por rel_saldo_itens
--  11  o ESTORNO COMUM continua funcionando (a regressão mais perigosa da fase)
--  12  a confirmação digitada não é contornável, e a justificativa curta é recusada
--  13  a janela FECHA mesmo quando a RPC estoura no meio
--
-- Ao final, uma linha em `_dev_destrutivo_resumo` com os contadores — é assim que se lê o
-- resultado pelo MCP, que engole NOTICE/WARNING.
--
-- EXECUÇÃO DE REFERÊNCIA (ensaio sgmvldiizsrjbxzzpmhh, 30/07/2026, com a 0087→0090 aplicadas):
-- ok = 108, falhas = 0. A prova PERMANENTE é o job `banco` do CI, que sobe um Postgres NOVO,
-- aplica 0001→0090 em ordem e roda este arquivo — não o run no ensaio.
--
-- ⚠ FRAQUEZA CONHECIDA DA §6, registrada aqui porque ela NÃO grita sozinha.
-- As asserções **6c** ("o reset da filial 1 não apagou ativo nenhum da filial 2") e **6e**
-- ("movimentação registrada na filial resetada, de ativo que migrou, sobreviveu") são
-- afirmações sobre o que NÃO mudou — e por isso passam **trivialmente** se o reset da 6a nem
-- tiver acontecido. Foi exatamente o que ocorreu na rodada em que a migration 0089 (prefixo do
-- backup) derrubou a 6a: 6c e 6e ficaram VERDES enquanto dez irmãs falhavam.
--
-- Hoje isso é tolerável porque a 6a falha ALTO e o `detalhe` do resumo nomeia a falha, então
-- ninguém lê 6c/6e verdes como aprovação do recorte. Mas quem for reforçar este roteiro deve
-- fazê-las depender do sucesso da 6a (ex.: pular com aviso, ou assertar contra um contador
-- gravado logo depois do reset) — asserção de "nada mudou" precisa provar que a operação
-- ACONTECEU antes de afirmar que ela foi cirúrgica.
-- =============================================================

begin;

create temp table _dev_destrutivo_resumo (ok int, falhas int, detalhe text);

-- ---------------------------------------------------------------------------
-- PRIVILÉGIOS DE TABELA — mesma razão do bloco de cargo_dev.sql e papeis_rls.sql
-- ---------------------------------------------------------------------------
-- O Supabase hospedado concede os privilégios de TABELA a `authenticated` por default
-- privilege; o Postgres novo do CI não. Sem este bloco o roteiro morre com
-- "permission denied for table ..." — e aqui isso seria pior do que morrer: as asserções da §2
-- medem RECUSA, e um privilégio ausente é uma recusa pelo motivo ERRADO. Ver a trava abaixo.
-- Regra: só entra a tabela/verbo que uma asserção deste arquivo realmente usa.
grant select on
  public.ativos, public.movimentacoes, public.lancamentos_item, public.itens,
  public.filiais, public.termos_gerados, public.pendencias_item
  to authenticated;

-- UPDATE/DELETE nas tabelas guardadas: é EXATAMENTE o que o Supabase hospedado já concede
-- (medido em information_schema.role_table_grants, ensaio e produção). Concedê-los aqui não
-- afrouxa nada — reproduz no CI o ambiente em que a guarda da 0081 tem de morder.
grant insert, update, delete on
  public.movimentacoes, public.lancamentos_item
  to authenticated;

grant update, delete on public.ativos to authenticated;

-- Trava do bloco acima (mesmo idioma da de cargo_dev.sql). Falha ALTO antes de qualquer
-- asserção. ⚠ Aqui ela é o INVERSO da de lá: lá o risco era conceder DEMAIS (e uma asserção de
-- recusa passar por engano); aqui o risco é conceder de MENOS — sem UPDATE/DELETE, cada
-- asserção da §2 receberia `42501 permission denied for table`, marcaria ✓ como se a guarda
-- tivesse mordido, e a guarda poderia estar ausente sem ninguém notar.
do $trava$
declare
  v_faltando text := '';
begin
  if not has_table_privilege('authenticated', 'public.movimentacoes', 'update')    then v_faltando := v_faltando || 'movimentacoes.UPDATE '; end if;
  if not has_table_privilege('authenticated', 'public.movimentacoes', 'delete')    then v_faltando := v_faltando || 'movimentacoes.DELETE '; end if;
  if not has_table_privilege('authenticated', 'public.lancamentos_item', 'update') then v_faltando := v_faltando || 'lancamentos_item.UPDATE '; end if;
  if not has_table_privilege('authenticated', 'public.lancamentos_item', 'delete') then v_faltando := v_faltando || 'lancamentos_item.DELETE '; end if;
  if not has_table_privilege('authenticated', 'public.ativos', 'delete')           then v_faltando := v_faltando || 'ativos.DELETE '; end if;
  if v_faltando <> '' then
    raise exception 'grants faltando: %', v_faltando;
  end if;
end
$trava$;

do $$
declare
  -- identidades fictícias (uuid fixo, hex válido — o prefixo f23a marca a fase)
  k_dev      uuid := '00000000-f23a-4000-8000-0000000000d1';
  k_admin    uuid := '00000000-f23a-4000-8000-0000000000a1';
  k_operador uuid := '00000000-f23a-4000-8000-0000000000b2';
  k_consulta uuid := '00000000-f23a-4000-8000-0000000000c3';
  v_f1 smallint; v_f2 smallint; v_nome_f1 text; v_nome_f2 text;
  v_at_a uuid; v_at_b uuid; v_at_c uuid; v_at_d uuid;
  v_at_e uuid; v_at_f uuid; v_at_g uuid; v_at_h uuid; v_at_i uuid; v_at_j uuid;
  v_at_k uuid; v_at_l uuid; v_at_m uuid; v_at_n uuid; v_at_x uuid; v_at_y uuid;
  v_at_z uuid; v_mov_z1 uuid; v_mov_z2 uuid; v_mov_z3 uuid;
  v_mov_a_saida uuid; v_mov_e2 uuid; v_mov_f2 uuid; v_mov_g1 uuid;
  v_mov_h2 uuid; v_mov_i2 uuid; v_mov_i3 uuid; v_mov_j1 uuid; v_mov_j2 uuid;
  v_mov_m2 uuid; v_mov_x uuid; v_mov_y uuid; v_mov_tmp uuid;
  v_lanc_tmp uuid;
  v_termo_a uuid; v_termo_cd uuid; v_termo_h uuid;
  v_path_a text;
  v_item5 smallint; v_item10 smallint; v_item13 smallint; v_item_cad smallint;
  -- ⚠ CAMINHOS DE BACKUP SOB O PREFIXO DO RECORTE (0089). A RPC não confere só que o objeto
  -- existe no bucket: exige que ele esteja sob `reset/<bloco>/<global|filial-N>/`, senão o
  -- backup de um import qualquer passaria por backup deste reset. São montados À MÃO, e não
  -- por `prefixo_backup_reset()`, de propósito: se o roteiro derivasse o caminho da MESMA
  -- função que a RPC usa para validar, os dois lados concordariam mesmo que o formato mudasse
  -- — e o contrato deixaria de estar preso a lugar nenhum.
  v_backup       text;   -- reset/acervo/filial-<f1>/  → o reset por filial da §6
  v_backup_f2    text;   -- reset/acervo/filial-<f2>/  → as recusas da §8
  v_backup_glob  text;   -- reset/acervo/global/       → o reset global da §7
  v_backup_itens text;   -- reset/itens/global/        → o reset de itens da §7
  v_cargos_uid  uuid[];
  v_cargos_nome text[] := array['admin', 'operador', 'consulta'];
  v_rpc_nome    text[] := array['apagar_ativo', 'apagar_movimentacao', 'apagar_item',
                                'resetar_acervo', 'resetar_itens',
                                'forcar_estado_ativo', 'forcar_saldo_item'];
  v_chamada     text[];
  v_ct jsonb;
  v_c1 int; v_c2 int; v_c3 int; v_c4 int; v_c5 int;
  v_r1 bigint; v_r2 bigint; v_r3 bigint;
  v_s1 bigint; v_s2 bigint; v_s3 bigint;
  v_de date := current_date - 3650;
  v_ate date := current_date + 365;
  v_ok int := 0; v_falhas int := 0; v_msgs text := '';
  v_n int; v_txt text; v_txt2 text; v_bool boolean; v_j jsonb; v_st public.status_ativo; v_uuid uuid;
  c int; i int;
begin
  -- =========================================================================
  -- FIXTURES BASE (como postgres — antes de qualquer troca de papel)
  -- =========================================================================
  select id, nome into v_f1, v_nome_f1 from public.filiais where ativo order by id limit 1;
  select id, nome into v_f2, v_nome_f2 from public.filiais where ativo and id <> v_f1 order by id limit 1;
  if v_f1 is null or v_f2 is null then
    raise warning '✗ 0 o banco precisa de ao menos DUAS filiais ativas para este roteiro';
    insert into _dev_destrutivo_resumo values (0, 1, 'sem duas filiais ativas');
    return;
  end if;

  -- O trigger handle_new_user cria o profile (e exige domínio corporativo — 0041/0057).
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (k_dev,      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f23.dev@wap.ind.br',      '', now(), now(), now()),
    (k_admin,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f23.chefia@wap.ind.br',   '', now(), now(), now()),
    (k_operador, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f23.operador@wap.ind.br', '', now(), now(), now()),
    (k_consulta, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f23.consulta@wap.ind.br', '', now(), now(), now());

  update public.profiles set papel = 'admin',    primeiro_nome = 'Chefia',  sobrenome = 'de Teste' where id = k_admin;
  update public.profiles set papel = 'operador', primeiro_nome = 'Fulano',  sobrenome = 'de Teste' where id = k_operador;
  update public.profiles set papel = 'consulta', primeiro_nome = 'Sicrano', sobrenome = 'de Teste' where id = k_consulta;
  insert into public.operador_filiais (usuario_id, filial_id) values (k_operador, v_f1);

  -- Plantar um DEV exige o caminho oficial: `profiles_guarda_dev` (0073) recusa a concessão do
  -- cargo mesmo para o postgres.
  perform set_config('estoque.gestao_usuarios', 'on', true);
  update public.profiles set papel = 'dev', primeiro_nome = 'Dev', sobrenome = 'de Teste' where id = k_dev;
  perform set_config('estoque.gestao_usuarios', 'off', true);

  -- Os BACKUPS que as RPCs de reset exigem: um por recorte, cada um sob o seu prefixo, todos
  -- existindo de verdade no bucket privado.
  v_backup       := 'reset/acervo/filial-' || v_f1::text || '/backup-ficticio-do-roteiro.json';
  v_backup_f2    := 'reset/acervo/filial-' || v_f2::text || '/backup-ficticio-do-roteiro.json';
  v_backup_glob  := 'reset/acervo/global/backup-ficticio-do-roteiro.json';
  v_backup_itens := 'reset/itens/global/backup-ficticio-do-roteiro.json';
  insert into storage.objects (bucket_id, name, owner)
  values ('backups-import', v_backup,       k_dev),
         ('backups-import', v_backup_f2,    k_dev),
         ('backups-import', v_backup_glob,  k_dev),
         ('backups-import', v_backup_itens, k_dev);

  -- Um ativo, uma movimentação, um item e um lançamento genéricos: alvo das varreduras da §1 e
  -- das asserções de imutabilidade da §2.
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009201', 'F23BASE', 'notebook', v_f1, 'cadastro') returning id into v_at_x;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
  values (v_at_x, 'compra', current_date - 40, v_f1, k_dev, now() - interval '40 days') returning id into v_mov_x;

  insert into public.itens (nome, grupo, ordem) values ('F23 Item Base', 'acessorio', 900) returning id into v_item_cad;
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
  values (v_item_cad, v_f1, 'entrada', 9, current_date - 5, k_dev) returning id into v_lanc_tmp;

  -- =========================================================================
  -- 1 — EXCLUSIVIDADE: as sete RPCs são do cargo dev, e de mais ninguém
  -- =========================================================================
  -- 1a. estrutural: nenhuma das sete é executável pelo service role. É o caminho que ignora
  --     RLS e que o app tem de verdade (src/lib/supabase/admin.ts).
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (v_rpc_nome)
     and has_function_privilege('service_role', p.oid, 'execute');
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 1a nenhuma das 7 RPCs destrutivas é executável por service_role';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1a_SERVICE_ROLE_EXECUTA; ';
    raise warning '✗ 1a % RPC(s) continuam executáveis por service_role', v_n;
  end if;

  -- 1b. o caminho NOMEADO do seed (`npm run db:reset`) é o espelho exato: service role SIM,
  --     authenticated NÃO. Trocar esses dois grants abriria um reset sem backup ao app.
  if has_function_privilege('service_role', 'public.resetar_dados_ficticios(text)', 'execute')
     and not has_function_privilege('authenticated', 'public.resetar_dados_ficticios(text)', 'execute') then
    v_ok := v_ok + 1; raise notice '✓ 1b resetar_dados_ficticios: service_role executa, authenticated NÃO';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1b_GRANT_INVERTIDO; ';
    raise warning '✗ 1b grants de resetar_dados_ficticios inesperados';
  end if;

  -- 1c. A SUPERFÍCIE DE RPC depois da 0088: as duas AUXILIARES saíram da API, as OITO
  --     ferramentas continuam lá. `exigir_dev_para_destruir` exposta em /rest/v1/rpc/ era um
  --     oráculo de graça ("eu sou dev?") e `rotulo_alcance_reset` a tela nem chama — as duas só
  --     são usadas de DENTRO das ferramentas, onde o usuário efetivo é o DONO e o privilégio
  --     continua valendo. Se um `grant` distraído as devolver, é esta asserção que grita; e o
  --     contrário também é medido: revogar demais fecharia uma ferramenta da tela.
  if not has_function_privilege('authenticated', 'public.exigir_dev_para_destruir(text)', 'execute')
     and not has_function_privilege('authenticated', 'public.rotulo_alcance_reset(smallint)', 'execute') then
    select count(*) into v_n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array['apagar_ativo', 'apagar_movimentacao', 'apagar_item',
                                  'resetar_acervo', 'resetar_itens', 'forcar_estado_ativo',
                                  'forcar_saldo_item', 'previa_reset'])
       and has_function_privilege('authenticated', p.oid, 'execute');
    if v_n = 8 then
      v_ok := v_ok + 1; raise notice '✓ 1c as duas auxiliares saíram da API e as OITO ferramentas continuam executáveis por authenticated';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '1c_FERRAMENTA_FECHADA; ';
      raise warning '✗ 1c só % das 8 ferramentas continuam executáveis por authenticated', v_n;
    end if;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1c_AUXILIAR_EXPOSTA; ';
    raise warning '✗ 1c uma auxiliar voltou a ser executável por authenticated (exigir_dev_para_destruir=%, rotulo_alcance_reset=%)',
      has_function_privilege('authenticated', 'public.exigir_dev_para_destruir(text)', 'execute'),
      has_function_privilege('authenticated', 'public.rotulo_alcance_reset(smallint)', 'execute');
  end if;

  -- 1c-bis. A outra metade da 0087: a função de checagens perdeu o `execute` do service_role
  --         (a 0085 repetiu o revoke da 0077 e deixou o service role dentro) sem perder o do
  --         cargo que a usa de verdade.
  if not has_function_privilege('service_role', 'public.dev_checagens_integridade()', 'execute')
     and has_function_privilege('authenticated', 'public.dev_checagens_integridade()', 'execute') then
    v_ok := v_ok + 1; raise notice '✓ 1c-bis dev_checagens_integridade: service_role NÃO executa, authenticated sim';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1c-bis_CHECAGENS_EXPOSTA; ';
    raise warning '✗ 1c-bis grants de dev_checagens_integridade inesperados (srv=%, auth=%)',
      has_function_privilege('service_role', 'public.dev_checagens_integridade()', 'execute'),
      has_function_privilege('authenticated', 'public.dev_checagens_integridade()', 'execute');
  end if;

  -- As sete chamadas, montadas uma vez. A confirmação é propositalmente inválida ('x'): a
  -- guarda de cargo é a PRIMEIRA linha de cada RPC, então quem é recusado por cargo nunca
  -- chega a olhar o resto. Se algum dia a ordem mudar, esta varredura acusa — porque a
  -- mensagem deixaria de ser a da guarda de cargo.
  v_chamada := array[
    format('select public.apagar_ativo(%L::uuid, %L, %L)', v_at_x, 'x', 'justificativa ficticia do roteiro'),
    format('select public.apagar_movimentacao(%L::uuid, %L, %L)', v_mov_x, 'x', 'justificativa ficticia do roteiro'),
    format('select public.apagar_item(%s::smallint, %L, %L)', v_item_cad, 'x', 'justificativa ficticia do roteiro'),
    format('select public.resetar_acervo(%s::smallint, %L, %L, %L, %L::jsonb)', v_f1, 'x', 'justificativa ficticia do roteiro', v_backup, '{}'),
    format('select public.resetar_itens(%s::smallint, %L, %L, %L, %L::jsonb)', v_f1, 'x', 'justificativa ficticia do roteiro', v_backup, '{}'),
    format('select public.forcar_estado_ativo(%L::uuid, %L::public.status_ativo, %L)', v_at_x, 'em_estoque', 'justificativa ficticia do roteiro'),
    format('select public.forcar_saldo_item(%s::smallint, %s::smallint, 0, %L)', v_item_cad, v_f1, 'justificativa ficticia do roteiro')
  ];
  v_cargos_uid := array[k_admin, k_operador, k_consulta];

  -- 3 cargos × 7 RPCs = 21 asserções. Recusa VÁLIDA é a da guarda de cargo; qualquer outra é
  -- falha, porque "deu erro" não é "foi barrado por não ser dev".
  for c in 1..3 loop
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_cargos_uid[c], 'role', 'authenticated')::text, true);
    for i in 1..7 loop
      begin
        execute v_chamada[i];
        v_falhas := v_falhas + 1;
        v_msgs := v_msgs || format('1-%s-%s_EXECUTOU; ', v_cargos_nome[c], v_rpc_nome[i]);
        raise warning '✗ 1 % EXECUTOU %()', v_cargos_nome[c], v_rpc_nome[i];
      exception when others then
        if sqlerrm like '%Desenvolvedor%' then
          v_ok := v_ok + 1;
          raise notice '✓ 1 % recusado em %() pela guarda de cargo', v_cargos_nome[c], v_rpc_nome[i];
        else
          v_falhas := v_falhas + 1;
          v_msgs := v_msgs || format('1-%s-%s_MOTIVO_ERRADO; ', v_cargos_nome[c], v_rpc_nome[i]);
          raise warning '✗ 1 % recusado em %() por OUTRO motivo (%): %', v_cargos_nome[c], v_rpc_nome[i], sqlstate, sqlerrm;
        end if;
      end;
    end loop;
    reset role;
  end loop;

  -- 1x. REQUEST FORJADO: o admin larga a RPC e escreve DIRETO. A RLS não lhe dá policy de
  --     DELETE em ativos — o comando não enxerga linha nenhuma e afeta ZERO.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);
  v_n := -1;
  begin
    delete from public.ativos where id = v_at_x;
    get diagnostics v_n = row_count;
  exception when others then v_n := 0;
  end;
  reset role;
  select count(*) into v_c1 from public.ativos where id = v_at_x;
  if v_n = 0 and v_c1 = 1 then
    v_ok := v_ok + 1; raise notice '✓ 1x request forjado do admin (DELETE direto em ativos) não apagou nada';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1x_FORJOU; ';
    raise warning '✗ 1x o admin apagou um ativo por escrita direta (linhas=%, restou=%)', v_n, v_c1;
  end if;

  -- 1y. O SERVICE ROLE de verdade (não só o grant): nenhuma das sete responde a ele.
  for i in 1..7 loop
    begin
      set local role service_role;
      execute v_chamada[i];
      reset role;
      v_falhas := v_falhas + 1;
      v_msgs := v_msgs || format('1y-%s_SERVICE_ROLE_EXECUTOU; ', v_rpc_nome[i]);
      raise warning '✗ 1y SERVICE ROLE executou %()', v_rpc_nome[i];
    exception when others then
      if sqlstate = '42501' then
        v_ok := v_ok + 1; raise notice '✓ 1y service role recusado em %() (42501)', v_rpc_nome[i];
      else
        v_falhas := v_falhas + 1;
        v_msgs := v_msgs || format('1y-%s_MOTIVO_ERRADO; ', v_rpc_nome[i]);
        raise warning '✗ 1y service role recusado em %() por outro motivo (%): %', v_rpc_nome[i], sqlstate, sqlerrm;
      end if;
    end;
    reset role;
  end loop;

  -- 1z / 1z-bis. O caminho nomeado do seed tem DUAS travas, e a ORDEM entre elas é o que
  --     permite medir as duas com a mesma chamada: a marca de AMBIENTE (0090) é conferida
  --     ANTES da frase de confirmação. Com a frase sempre ERRADA — de propósito, para não
  --     zerar nada — sem a marca sai 42501, com a marca sai 22023.
  --
  --     ⚠ O ROTEIRO PLANTA OS DOIS ESTADOS, e isso não é capricho: `public.ambiente` nasce
  --     VAZIA em toda base e a linha 'desenvolvimento' é inserida à mão só fora de produção.
  --     O ensaio TEM a linha; um Postgres novo do CI NÃO tem. Sem plantar, esta asserção
  --     mediria coisas diferentes em cada banco — e passaria num e falharia no outro.
  delete from public.ambiente where rotulo = 'desenvolvimento';
  begin
    set local role service_role;
    perform public.resetar_dados_ficticios('frase errada');
    reset role;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1z_SEM_TRAVA_DE_AMBIENTE; ';
    raise warning '✗ 1z resetar_dados_ficticios passou numa base SEM a marca de desenvolvimento';
  exception when others then
    if sqlstate = '42501' then
      v_ok := v_ok + 1; raise notice '✓ 1z sem a linha ''desenvolvimento'' em public.ambiente, o reset de dados fictícios é recusado ANTES da confirmação (42501) — é esta a trava que segura produção dentro do próprio banco';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '1z_MOTIVO_ERRADO; ';
      raise warning '✗ 1z falhou por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;
  reset role;

  insert into public.ambiente (rotulo, observacao)
  values ('desenvolvimento', 'marca ficticia do roteiro F23')
  on conflict (rotulo) do nothing;

  begin
    set local role service_role;
    perform public.resetar_dados_ficticios('frase errada');
    reset role;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1z-bis_SEM_CONFIRMACAO; ';
    raise warning '✗ 1z-bis resetar_dados_ficticios aceitou uma confirmação errada';
  exception when others then
    if sqlstate = '22023' then
      v_ok := v_ok + 1; raise notice '✓ 1z-bis com a base marcada, o service role ALCANÇA a função e é a confirmação que barra (22023)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '1z-bis_MOTIVO_ERRADO; ';
      raise warning '✗ 1z-bis falhou por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;
  reset role;

  -- =========================================================================
  -- 2 — IMUTABILIDADE FORA DA JANELA (guarda_acervo, 0081)
  -- =========================================================================
  -- ⚠ Duas metades com naturezas DIFERENTES, e é isso que se mede:
  --   · `authenticated` já é barrado pela RLS (não há policy de UPDATE/DELETE nessas tabelas) —
  --     o comando não vê linha e afeta ZERO. A guarda nem chega a ser consultada.
  --   · O DONO (postgres, o papel do service role e do SQL editor) IGNORA RLS. Ali a guarda da
  --     0081 é a única coisa que existe — e por isso a asserção olha a MENSAGEM dela.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);

  v_n := -1;
  begin
    update public.movimentacoes set observacao = 'adulterado' where id = v_mov_x;
    get diagnostics v_n = row_count;
  exception when others then v_n := 0;
  end;
  select count(*) into v_c1 from public.movimentacoes where id = v_mov_x and observacao is null;
  if v_n = 0 and v_c1 = 1 then
    v_ok := v_ok + 1; raise notice '✓ 2a UPDATE em movimentacoes como authenticated não alterou nada';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2a; ';
    raise warning '✗ 2a UPDATE em movimentacoes passou (linhas=%, intacta=%)', v_n, v_c1;
  end if;

  v_n := -1;
  begin
    delete from public.movimentacoes where id = v_mov_x;
    get diagnostics v_n = row_count;
  exception when others then v_n := 0;
  end;
  select count(*) into v_c1 from public.movimentacoes where id = v_mov_x;
  if v_n = 0 and v_c1 = 1 then
    v_ok := v_ok + 1; raise notice '✓ 2b DELETE em movimentacoes como authenticated não removeu nada';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2b; ';
    raise warning '✗ 2b DELETE em movimentacoes passou (linhas=%, restou=%)', v_n, v_c1;
  end if;

  v_n := -1;
  begin
    update public.lancamentos_item set quantidade = 999 where id = v_lanc_tmp;
    get diagnostics v_n = row_count;
  exception when others then v_n := 0;
  end;
  select count(*) into v_c1 from public.lancamentos_item where id = v_lanc_tmp and quantidade = 9;
  if v_n = 0 and v_c1 = 1 then
    v_ok := v_ok + 1; raise notice '✓ 2c UPDATE em lancamentos_item como authenticated não alterou nada';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2c; ';
    raise warning '✗ 2c UPDATE em lancamentos_item passou (linhas=%, intacto=%)', v_n, v_c1;
  end if;

  v_n := -1;
  begin
    delete from public.lancamentos_item where id = v_lanc_tmp;
    get diagnostics v_n = row_count;
  exception when others then v_n := 0;
  end;
  select count(*) into v_c1 from public.lancamentos_item where id = v_lanc_tmp;
  if v_n = 0 and v_c1 = 1 then
    v_ok := v_ok + 1; raise notice '✓ 2d DELETE em lancamentos_item como authenticated não removeu nada';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2d; ';
    raise warning '✗ 2d DELETE em lancamentos_item passou (linhas=%, restou=%)', v_n, v_c1;
  end if;

  v_n := -1;
  begin
    delete from public.ativos where id = v_at_x;
    get diagnostics v_n = row_count;
  exception when others then v_n := 0;
  end;
  select count(*) into v_c1 from public.ativos where id = v_at_x;
  if v_n = 0 and v_c1 = 1 then
    v_ok := v_ok + 1; raise notice '✓ 2e DELETE em ativos como authenticated (dev logado) não removeu nada';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2e; ';
    raise warning '✗ 2e DELETE em ativos passou (linhas=%, restou=%)', v_n, v_c1;
  end if;

  -- 2f. INSERT com a MARCA mentida — este ramo a RLS NÃO cobre (o dev TEM policy de INSERT).
  --     Só a guarda impede um request forjado de se rotular "correção técnica do dev".
  begin
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, forcado)
    values (v_at_x, 'saida', current_date, v_f1, k_dev, true);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2f_MARCA_MENTIDA; ';
    raise warning '✗ 2f um INSERT comum gravou forcado = true em movimentacoes';
  exception when others then
    if sqlerrm like '%forçado%' then
      v_ok := v_ok + 1; raise notice '✓ 2f INSERT com forcado = true recusado em movimentacoes (%)', sqlstate;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '2f_MOTIVO_ERRADO; ';
      raise warning '✗ 2f falhou por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  -- 2g. PAR POSITIVO — o UPDATE legítimo em `ativos`. Sem esta asserção, uma guarda que cegasse
  --     o app inteiro (um trigger de UPDATE em ativos, por exemplo) passaria verde em todas as
  --     anteriores.
  begin
    update public.ativos set observacoes = 'observacao ficticia do roteiro' where id = v_at_x;
    get diagnostics v_n = row_count;
    if v_n = 1 then
      v_ok := v_ok + 1; raise notice '✓ 2g o UPDATE LEGÍTIMO em ativos continua passando';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '2g_UPDATE_LEGITIMO_BLOQUEADO; ';
      raise warning '✗ 2g o UPDATE legítimo em ativos afetou % linha(s)', v_n;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2g_UPDATE_LEGITIMO_BLOQUEADO; ';
    raise warning '✗ 2g a guarda bloqueou o UPDATE legítimo em ativos: %', sqlerrm;
  end;

  -- 2h. PAR POSITIVO — o INSERT normal de movimentação. E ele tem de continuar DERIVANDO o
  --     estado: não basta a linha entrar, `aplicar_movimentacao` tem de rodar DEPOIS da guarda
  --     (a ordem alfabética dos dois BEFORE INSERT é o que garante isso:
  --     movimentacoes_guarda_acervo < trg_aplicar_movimentacao).
  begin
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, setor, criado_por)
    values (v_at_x, 'saida', current_date, v_f1, 'Fulano de Teste', 'TI', k_dev) returning id into v_mov_tmp;
    select status into v_st from public.ativos where id = v_at_x;
    if v_st = 'em_uso' then
      v_ok := v_ok + 1; raise notice '✓ 2h o INSERT NORMAL de movimentação continua passando E derivando o estado (em_uso)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '2h_NAO_DERIVOU; ';
      raise warning '✗ 2h a movimentação entrou mas o estado não derivou (status = %)', v_st;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2h_INSERT_NORMAL_BLOQUEADO; ';
    raise warning '✗ 2h a guarda bloqueou um INSERT normal de movimentação: %', sqlerrm;
  end;

  reset role;

  -- 2i..2n. AGORA O CASO QUE SÓ O TRIGGER PEGA: o DONO, que ignora RLS.
  begin
    update public.movimentacoes set observacao = 'adulterado' where id = v_mov_x;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2i_DONO_ALTEROU; ';
    raise warning '✗ 2i o DONO alterou uma movimentação por UPDATE direto';
  exception when others then
    if sqlerrm like '%imutável%' then
      v_ok := v_ok + 1; raise notice '✓ 2i UPDATE em movimentacoes recusado para o DONO pela guarda (%)', sqlstate;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '2i_MOTIVO_ERRADO; ';
      raise warning '✗ 2i recusado por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  begin
    delete from public.movimentacoes where id = v_mov_x;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2j_DONO_APAGOU; ';
    raise warning '✗ 2j o DONO apagou uma movimentação por DELETE direto';
  exception when others then
    if sqlerrm like '%não se remove%' then
      v_ok := v_ok + 1; raise notice '✓ 2j DELETE em movimentacoes recusado para o DONO pela guarda (%)', sqlstate;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '2j_MOTIVO_ERRADO; ';
      raise warning '✗ 2j recusado por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  begin
    update public.lancamentos_item set quantidade = 999 where id = v_lanc_tmp;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2k_DONO_ALTEROU_LANC; ';
    raise warning '✗ 2k o DONO alterou um lançamento por UPDATE direto';
  exception when others then
    if sqlerrm like '%imutável%' then
      v_ok := v_ok + 1; raise notice '✓ 2k UPDATE em lancamentos_item recusado para o DONO pela guarda (%)', sqlstate;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '2k_MOTIVO_ERRADO; ';
      raise warning '✗ 2k recusado por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  begin
    delete from public.lancamentos_item where id = v_lanc_tmp;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2l_DONO_APAGOU_LANC; ';
    raise warning '✗ 2l o DONO apagou um lançamento por DELETE direto';
  exception when others then
    if sqlerrm like '%não se remove%' then
      v_ok := v_ok + 1; raise notice '✓ 2l DELETE em lancamentos_item recusado para o DONO pela guarda (%)', sqlstate;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '2l_MOTIVO_ERRADO; ';
      raise warning '✗ 2l recusado por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  begin
    delete from public.ativos where id = v_at_x;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2m_DONO_APAGOU_ATIVO; ';
    raise warning '✗ 2m o DONO apagou um ativo por DELETE direto';
  exception when others then
    if sqlerrm like '%não se remove%' then
      v_ok := v_ok + 1; raise notice '✓ 2m DELETE em ativos recusado para o DONO pela guarda (%)', sqlstate;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '2m_MOTIVO_ERRADO; ';
      raise warning '✗ 2m recusado por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, observacao, criado_por, forcado)
    values (v_item_cad, v_f1, 'ajuste', 1, current_date, 'tentativa de marca mentida', k_dev, true);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2n_MARCA_MENTIDA_DONO; ';
    raise warning '✗ 2n o DONO gravou forcado = true em lancamentos_item';
  exception when others then
    if sqlerrm like '%forçado%' then
      v_ok := v_ok + 1; raise notice '✓ 2n INSERT com forcado = true recusado também para o DONO (%)', sqlstate;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '2n_MOTIVO_ERRADO; ';
      raise warning '✗ 2n recusado por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  -- 2o. TRUNCATE — o FLANCO QUE O TRIGGER NÃO VÊ (0090). `truncate` não dispara trigger de
  --     LINHA e não passa por RLS: a guarda da 0081 simplesmente não é consultada, e o acervo
  --     inteiro sumiria sem uma linha de trilha. Quem fecha isto é o PRIVILÉGIO — por isso a
  --     asserção olha 42501 de permissão, e não a mensagem da guarda: aqui a guarda não tem o
  --     que dizer.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);
    truncate public.movimentacoes;
    reset role;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2o_TRUNCATE_PASSOU; ';
    raise warning '✗ 2o TRUNCATE em movimentacoes passou para authenticated — o acervo sumiria sem trigger nenhum disparar';
  exception when others then
    if sqlstate = '42501' then
      v_ok := v_ok + 1; raise notice '✓ 2o TRUNCATE em movimentacoes recusado para authenticated (42501, privilégio revogado)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '2o_MOTIVO_ERRADO; ';
      raise warning '✗ 2o recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;
  reset role;

  -- 2p. E o mesmo medido no CATÁLOGO, para as SEIS tabelas do acervo × os TRÊS papéis de API —
  --     inclusive o `service_role`, que é o caminho que o app realmente tem. Estrutural de
  --     propósito: provar isto por comportamento exigiria um TRUNCATE de verdade em cada uma,
  --     e um único que passasse levaria o resto do roteiro junto.
  select count(*) into v_n
    from unnest(array['ativos', 'movimentacoes', 'lancamentos_item',
                      'pendencias_item', 'anotacoes', 'termos_gerados']) as t(tab),
         unnest(array['anon', 'authenticated', 'service_role']) as r(pap)
   where has_table_privilege(r.pap, 'public.' || t.tab, 'truncate');
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 2p nenhuma das 6 tabelas do acervo tem TRUNCATE para anon, authenticated ou service_role';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2p_TRUNCATE_CONCEDIDO; ';
    raise warning '✗ 2p % combinação(ões) tabela × papel ainda com TRUNCATE', v_n;
  end if;

  -- =========================================================================
  -- 3 — apagar_ativo: some com o rastro, libera o par, recusa termo de lote misto
  -- =========================================================================
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009301', 'F23A', 'notebook', v_f1, 'cadastro') returning id into v_at_a;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
  values (v_at_a, 'compra', current_date - 30, v_f1, k_dev, now() - interval '30 days');
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, setor, criado_por, created_at)
  values (v_at_a, 'saida', current_date - 20, v_f1, 'Fulano de Teste', 'TI', k_dev, now() - interval '20 days')
  returning id into v_mov_a_saida;
  -- devolução COM item faltante → nasce a pendência de item (F18)
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, itens_faltantes, criado_por, created_at)
  values (v_at_a, 'devolucao', current_date - 10, v_f1, 'Fulano de Teste', array['Carregador ficticio'], k_dev, now() - interval '10 days');
  insert into public.anotacoes (ativo_id, texto, criado_por) values (v_at_a, 'anotacao ficticia do roteiro F23', k_dev);
  v_termo_a := gen_random_uuid();
  v_path_a  := v_termo_a::text || '.docx';
  insert into public.termos_gerados (id, tipo, movimentacao_ids, ativo_ids, colaborador, dados, arquivo_path, gerado_por)
  values (v_termo_a, 'responsabilidade_notebook', array[v_mov_a_saida], array[v_at_a], 'Fulano de Teste', '{}'::jsonb, v_path_a, k_dev);
  insert into storage.objects (bucket_id, name, owner) values ('termos', v_path_a, k_dev);
  -- o SUBSTITUTO (F14/F15) apontando para o alvo: o ponteiro é anulado, o substituto sobrevive
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, substitui_ativo_id)
  values ('WAP0009302', 'F23B', 'notebook', v_f1, 'cadastro', v_at_a) returning id into v_at_b;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);
  begin
    select public.apagar_ativo(v_at_a, 'WAP0009301', 'justificativa ficticia do roteiro F23') into v_j;
    v_ok := v_ok + 1; raise notice '✓ 3a dev APAGA o ativo com rastro inteiro: %', v_j::text;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3a_NAO_APAGOU; ';
    raise warning '✗ 3a apagar_ativo falhou (%): %', sqlstate, sqlerrm;
  end;
  reset role;

  select (select count(*) from public.ativos where id = v_at_a)
       + (select count(*) from public.movimentacoes where ativo_id = v_at_a)
       + (select count(*) from public.anotacoes where ativo_id = v_at_a)
       + (select count(*) from public.pendencias_item where ativo_id = v_at_a)
       + (select count(*) from public.termos_gerados where v_at_a = any (ativo_ids)) into v_n;
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 3b nada do ativo apagado sobrou';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3b_RASTRO_SOBROU; ';
    raise warning '✗ 3b sobraram % linha(s) de rastro', v_n;
  end if;

  if (v_j->>'movimentacoes')::int = 3 and (v_j->>'anotacoes')::int = 1
     and (v_j->>'pendencias_item')::int = 1 and (v_j->>'termos')::int = 1
     and (v_j->>'ponteiros_anulados')::int = 1 then
    v_ok := v_ok + 1; raise notice '✓ 3c o retorno da RPC conta certo';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3c_CONTAGEM_ERRADA; ';
    raise warning '✗ 3c contagens do retorno não conferem: %', v_j::text;
  end if;

  select count(*) into v_n from public.ativos where id = v_at_b and substitui_ativo_id is null;
  if v_n = 1 then
    v_ok := v_ok + 1; raise notice '✓ 3d o substituto sobreviveu com substitui_ativo_id anulado';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3d_SUBSTITUTO; ';
    raise warning '✗ 3d o substituto não está no estado esperado (%)', v_n;
  end if;

  -- 3e. os .docx voltam PARA A ACTION remover — e continuam no bucket, porque
  --     `storage.protect_objects_delete` recusa DELETE de objeto por SQL. É metade do trabalho
  --     por desenho, e é a metade que a 8ª checagem da 0085 (arquivo_termo_orfao) passa a
  --     vigiar.
  select count(*) into v_n from storage.objects where bucket_id = 'termos' and name = v_path_a;
  if (v_j->'arquivos_termos') ? v_path_a and v_n = 1 then
    v_ok := v_ok + 1; raise notice '✓ 3e a RPC devolve o caminho do .docx para a action apagar, e o objeto segue no bucket';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3e_ARQUIVO_TERMO; ';
    raise warning '✗ 3e arquivos_termos=% / objeto=%', (v_j->'arquivos_termos')::text, v_n;
  end if;

  -- 3f. O PAR PATRIMÔNIO + SERVICE TAG FOI LIBERADO — a razão prática de existir a ferramenta
  --     (quem prova é o índice único `ativos_patrimonio_service_tag_uidx`).
  begin
    insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
    values ('WAP0009301', 'F23A', 'notebook', v_f1, 'cadastro') returning id into v_at_n;
    v_ok := v_ok + 1; raise notice '✓ 3f o par patrimônio+service tag voltou a ser usável';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3f_PAR_PRESO; ';
    raise warning '✗ 3f o par continua preso: %', sqlerrm;
  end;

  select count(*) into v_n from public.eventos_admin
   where acao = 'ativo_apagado' and alvo = 'WAP0009301' and detalhe ? 'backup'
     and detalhe->>'justificativa' = 'justificativa ficticia do roteiro F23';
  if v_n = 1 then
    v_ok := v_ok + 1; raise notice '✓ 3g a trilha ativo_apagado foi gravada com justificativa e backup';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3g_TRILHA; ';
    raise warning '✗ 3g a trilha não está como esperado (%)', v_n;
  end if;

  -- 3h. TERMO DE LOTE MISTO → RECUSA (documento assinado não morre como efeito colateral).
  --     Os dois ativos ficam na MESMA filial de propósito: assim o termo é "de lote" sem ser
  --     "de filial mista", e não bloqueia o reset por filial da §6 mais adiante.
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009303', 'F23C', 'notebook', v_f1, 'cadastro') returning id into v_at_c;
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009304', 'F23D', 'notebook', v_f1, 'cadastro') returning id into v_at_d;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, criado_por, created_at)
  values (v_at_c, 'saida', current_date - 5, v_f1, 'Fulano de Teste', k_dev, now() - interval '5 days') returning id into v_mov_tmp;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, criado_por, created_at)
  values (v_at_d, 'saida', current_date - 5, v_f1, 'Fulano de Teste', k_dev, now() - interval '5 days') returning id into v_uuid;
  v_termo_cd := gen_random_uuid();
  insert into public.termos_gerados (id, tipo, movimentacao_ids, ativo_ids, colaborador, dados, arquivo_path, gerado_por)
  values (v_termo_cd, 'responsabilidade_notebook', array[v_mov_tmp, v_uuid], array[v_at_c, v_at_d], 'Fulano de Teste', '{}'::jsonb, v_termo_cd::text || '.docx', k_dev);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);
  begin
    perform public.apagar_ativo(v_at_c, 'WAP0009303', 'justificativa ficticia do roteiro F23');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3h_TERMO_MISTO_PASSOU; ';
    raise warning '✗ 3h apagou um ativo que está em termo de lote com OUTRO ativo';
  exception when others then
    if sqlerrm like '%termo%' then
      v_ok := v_ok + 1; raise notice '✓ 3h apagar_ativo RECUSA termo de lote misto (%)', sqlstate;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '3h_MOTIVO_ERRADO; ';
      raise warning '✗ 3h recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;
  reset role;

  -- =========================================================================
  -- 4 — apagar_movimentacao: os seis cenários
  -- =========================================================================
  -- (a) A ÚLTIMA — apaga e o ativo volta EXATAMENTE ao snapshot_anterior
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009401', 'F23E', 'notebook', v_f1, 'cadastro') returning id into v_at_e;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
  values (v_at_e, 'compra', current_date - 30, v_f1, k_dev, now() - interval '30 days');
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, setor, criado_por, created_at)
  values (v_at_e, 'saida', current_date - 20, v_f1, 'Fulano de Teste', 'TI', k_dev, now() - interval '20 days') returning id into v_mov_e2;

  -- (b) DO MEIO
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009402', 'F23F', 'notebook', v_f1, 'cadastro') returning id into v_at_f;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
  values (v_at_f, 'compra', current_date - 30, v_f1, k_dev, now() - interval '30 days');
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, setor, criado_por, created_at)
  values (v_at_f, 'saida', current_date - 20, v_f1, 'Fulano de Teste', 'TI', k_dev, now() - interval '20 days') returning id into v_mov_f2;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
  values (v_at_f, 'devolucao', current_date - 10, v_f1, k_dev, now() - interval '10 days');

  -- (c) A ÚNICA
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009403', 'F23G', 'notebook', v_f1, 'cadastro') returning id into v_at_g;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
  values (v_at_g, 'compra', current_date - 30, v_f1, k_dev, now() - interval '30 days') returning id into v_mov_g1;

  -- (d) COM TERMO CITANDO A MOVIMENTAÇÃO
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009404', 'F23H', 'notebook', v_f1, 'cadastro') returning id into v_at_h;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
  values (v_at_h, 'compra', current_date - 30, v_f1, k_dev, now() - interval '30 days');
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, setor, criado_por, created_at)
  values (v_at_h, 'saida', current_date - 20, v_f1, 'Fulano de Teste', 'TI', k_dev, now() - interval '20 days') returning id into v_mov_h2;
  v_termo_h := gen_random_uuid();
  insert into public.termos_gerados (id, tipo, movimentacao_ids, ativo_ids, colaborador, dados, arquivo_path, gerado_por)
  values (v_termo_h, 'responsabilidade_notebook', array[v_mov_h2], array[v_at_h], 'Fulano de Teste', '{}'::jsonb, v_termo_h::text || '.docx', k_dev);

  -- (e) O PAR ESTORNO
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009405', 'F23I', 'notebook', v_f1, 'cadastro') returning id into v_at_i;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
  values (v_at_i, 'compra', current_date - 30, v_f1, k_dev, now() - interval '30 days');
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, setor, criado_por, created_at)
  values (v_at_i, 'saida', current_date - 20, v_f1, 'Beltrano de Teste', 'Compras', k_dev, now() - interval '20 days') returning id into v_mov_i2;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, estorno_de, criado_por, created_at)
  values (v_at_i, 'estorno', current_date - 19, v_f1, v_mov_i2, k_dev, now() - interval '19 days') returning id into v_mov_i3;

  -- (f) ⚠ A DIVERGÊNCIA DE ORDENAÇÃO que o ensaio não tem, plantada de propósito.
  --     Padrão do import de startup: a COMPRA entra primeiro (created_at antigo) com data
  --     RECENTE, e a movimentação seguinte entra depois (created_at novo) com data ANTIGA.
  --     Assim `(data, ...)` e `(created_at, id)` discordam sobre quem é "a última".
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009406', 'F23J', 'notebook', v_f1, 'cadastro') returning id into v_at_j;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
  values (v_at_j, 'compra', current_date - 1, v_f1, k_dev, now() - interval '2 hours') returning id into v_mov_j1;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, setor, criado_por, created_at)
  values (v_at_j, 'saida', current_date - 3000, v_f1, 'Fulano de Teste', 'TI', k_dev, now() - interval '1 hour') returning id into v_mov_j2;

  -- (g) ⚠ O EMPATE DE `created_at` — o caso de MASSA em produção (1111 dos 1232 ativos), que a
  --     0087 transformou em RECUSA. O import de startup grava a compra de abertura e o ajuste
  --     de reconciliação na MESMA transação, e `now()` devolve o mesmo instante para as duas:
  --     pela ordenação (created_at, id), "a última" sairia do sorteio do uuid. Aqui as duas
  --     nascem com o MESMO `created_at`, de propósito — é o único lugar deste arquivo onde o
  --     empate é desejado.
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009407', 'F23Z', 'notebook', v_f1, 'cadastro') returning id into v_at_z;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
  values (v_at_z, 'compra', current_date - 60, v_f1, k_dev, now() - interval '60 days') returning id into v_mov_z1;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, status_resultante, observacao, criado_por, created_at)
  values (v_at_z, 'ajuste', current_date - 60, v_f1, 'em_estoque', 'reconciliacao ficticia do import', k_dev, now() - interval '60 days')
  returning id into v_mov_z2;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);

  begin
    select public.apagar_movimentacao(v_mov_e2, 'WAP0009401', 'justificativa ficticia do roteiro F23') into v_j;
    select status, colaborador_atual into v_st, v_txt from public.ativos where id = v_at_e;
    select count(*) into v_n from public.movimentacoes where id = v_mov_e2;
    if v_st = 'em_estoque' and v_txt is null and v_n = 0 then
      v_ok := v_ok + 1; raise notice '✓ 4a apagar a ÚLTIMA devolve o ativo ao snapshot_anterior';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '4a_ESTADO; ';
      raise warning '✗ 4a status=% colaborador=% restantes=%', v_st, coalesce(v_txt,'<nulo>'), v_n;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4a_FALHOU; ';
    raise warning '✗ 4a falhou (%): %', sqlstate, sqlerrm;
  end;

  begin
    perform public.apagar_movimentacao(v_mov_f2, 'WAP0009402', 'justificativa ficticia do roteiro F23');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4b_MEIO_PASSOU; ';
    raise warning '✗ 4b apagou uma movimentação do MEIO';
  exception when others then
    if sqlerrm like '%última movimentação%' then
      v_ok := v_ok + 1; raise notice '✓ 4b movimentação do MEIO recusada (%)', sqlstate;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '4b_MOTIVO_ERRADO; ';
      raise warning '✗ 4b recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  begin
    perform public.apagar_movimentacao(v_mov_g1, 'WAP0009403', 'justificativa ficticia do roteiro F23');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4c_UNICA_PASSOU; ';
    raise warning '✗ 4c apagou a ÚNICA movimentação do ativo';
  exception when others then
    if sqlerrm like '%Apagar ativo%' then
      v_ok := v_ok + 1; raise notice '✓ 4c a ÚNICA movimentação é recusada apontando "Apagar ativo" (%)', sqlstate;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '4c_SEM_CAMINHO_DE_SAIDA; ';
      raise warning '✗ 4c recusada sem apontar o caminho de saída (%): %', sqlstate, sqlerrm;
    end if;
  end;

  begin
    perform public.apagar_movimentacao(v_mov_h2, 'WAP0009404', 'justificativa ficticia do roteiro F23');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4d_TERMO_PASSOU; ';
    raise warning '✗ 4d apagou uma movimentação citada por um termo';
  exception when others then
    if sqlerrm like '%termo%' then
      v_ok := v_ok + 1; raise notice '✓ 4d movimentação citada por termo é recusada (%)', sqlstate;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '4d_MOTIVO_ERRADO; ';
      raise warning '✗ 4d recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  begin
    perform public.apagar_movimentacao(v_mov_i2, 'WAP0009405', 'justificativa ficticia do roteiro F23');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4e1_ESTORNADA_PASSOU; ';
    raise warning '✗ 4e a movimentação ESTORNADA foi apagada';
  exception when others then
    if sqlerrm like '%última movimentação%' then
      v_ok := v_ok + 1; raise notice '✓ 4e a movimentação ESTORNADA é recusada — o estorno vem depois (%)', sqlstate;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '4e1_MOTIVO_ERRADO; ';
      raise warning '✗ 4e recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  -- 4e-bis — APAGAR UM ESTORNO É RECUSADO (migration 0090).
  --
  -- ⚠ ESTA ASSERÇÃO JÁ AFIRMOU O CONTRÁRIO, e a história importa: até a 0090 ela media
  -- "apagar o ESTORNO desfaz o desfazer" e passava verde, conferindo status, detentor e
  -- contagem de movimentações. A revisão adversarial da fase mostrou que ela passava
  -- **cega para o dano**: o estorno APAGA as `pendencias_item` da movimentação original (o
  -- estorno-strip da F18, dentro de `aplicar_movimentacao`), e apagar o estorno restaurava o
  -- ativo para `em_triagem` com a `devolucao` viva ainda declarando `itens_faltantes` — mas
  -- com ZERO pendências. A fila de `/pendencias` deriva o balde de itens só de
  -- `v_pendencias_item where status = 'aberta'`, então os itens sumiam da tela e ninguém os
  -- cobrava do colaborador. Movimentação viva dizendo "faltam itens" e estado derivado dizendo
  -- "não falta nada" é exatamente a incoerência que a doutrina da casa proíbe.
  --
  -- A 0090 passou a RECUSAR, em vez de recriar as pendências: o desfecho das originais
  -- (resolvida/desfecho/observação) foi apagado de vez pelo estorno-strip e não é
  -- reconstruível — mesma doutrina da recusa de empate da 0087, "quando o efeito não é
  -- reconstruível, ferramenta irreversível recusa em vez de deixar estado meio-certo".
  -- Retrato do ativo ANTES da tentativa. A 4e-ter compara com ELE, e não com um estado que o
  -- roteiro afirme de cor: assim a asserção continua correta se a fixture mudar, e não vira um
  -- número mágico que alguém "conserta" no dia em que falhar.
  select status::text || '|' || coalesce(colaborador_atual, '<nulo>') || '|' ||
         (select count(*)::text from public.movimentacoes where ativo_id = v_at_i)
    into v_txt from public.ativos where id = v_at_i;

  begin
    perform public.apagar_movimentacao(v_mov_i3, 'WAP0009405', 'justificativa ficticia do roteiro F23');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4e2_ESTORNO_APAGADO; ';
    raise warning '✗ 4e-bis o ESTORNO foi apagado — as pendências do estorno-strip ficariam perdidas';
  exception when others then
    if sqlerrm like '%ESTORNO%' then
      v_ok := v_ok + 1; raise notice '✓ 4e-bis apagar um ESTORNO é recusado (%) — o estorno-strip não é reversível', sqlstate;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '4e2_MOTIVO_ERRADO; ';
      raise warning '✗ 4e-bis recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  -- 4e-ter — o ESTADO ficou INTACTO depois da recusa (o par positivo da 4e-bis). Sem esta,
  -- uma implementação que recusasse DEPOIS de já ter mexido no ativo passaria verde.
  select status::text || '|' || coalesce(colaborador_atual, '<nulo>') || '|' ||
         (select count(*)::text from public.movimentacoes where ativo_id = v_at_i)
    into v_txt2 from public.ativos where id = v_at_i;
  if v_txt2 = v_txt then
    v_ok := v_ok + 1; raise notice '✓ 4e-ter a recusa não deixou efeito colateral (%)', v_txt2;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4e3_EFEITO_COLATERAL; ';
    raise warning '✗ 4e-ter estado mudou apesar da recusa: antes=% depois=%', v_txt, v_txt2;
  end if;

  -- A RPC decide por (created_at, id) — a MESMA ordem do guard de estorno, e a ordem em que o
  -- trigger aplicou os efeitos. Pela `data`, "a última" seria a COMPRA (de ontem); pelo
  -- (created_at, id) é a SAÍDA (de 3000 dias atrás). As duas asserções abaixo dizem qual linha
  -- a RPC considera "a última", e não só que ela recusou alguma coisa.
  begin
    perform public.apagar_movimentacao(v_mov_j1, 'WAP0009406', 'justificativa ficticia do roteiro F23');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4f_ORDEM_POR_DATA; ';
    raise warning '✗ 4f a RPC aceitou apagar a compra (a mais nova por DATA)';
  exception when others then
    if sqlerrm like '%última movimentação%' then
      v_ok := v_ok + 1;
      raise notice '✓ 4f com data fora de ordem, a RPC NÃO considera "a última" a compra de % — ela ordena por (created_at, id)', (current_date - 1)::text;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '4f_MOTIVO_ERRADO; ';
      raise warning '✗ 4f recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  begin
    perform public.apagar_movimentacao(v_mov_j2, 'WAP0009406', 'justificativa ficticia do roteiro F23');
    select count(*) into v_n from public.movimentacoes where id = v_mov_j2;
    select status into v_st from public.ativos where id = v_at_j;
    if v_n = 0 and v_st = 'em_estoque' then
      v_ok := v_ok + 1;
      raise notice '✓ 4f-bis "a última" é a SAÍDA de % (created_at mais recente, data mais antiga)', (current_date - 3000)::text;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '4f2_ESTADO; ';
      raise warning '✗ 4f-bis restantes=% status=%', v_n, v_st;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4f2_FALHOU; ';
    raise warning '✗ 4f-bis falhou (%): %', sqlstate, sqlerrm;
  end;

  -- 4g / 4g-bis. O EMPATE É RECUSADO — e os DOIS membros do par são recusados. É isso que
  --     descarta a hipótese de sorteio: se a decisão ainda dependesse do uuid, exatamente UM
  --     dos dois seria aceito. A recusa da 0087 vem ANTES da checagem de "é a última" e tem
  --     mensagem própria, e é por ela que a asserção pergunta — "deu erro" não é "recusou pelo
  --     empate".
  begin
    perform public.apagar_movimentacao(v_mov_z2, 'WAP0009407', 'justificativa ficticia do roteiro F23');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4g_EMPATE_PASSOU; ';
    raise warning '✗ 4g apagou uma movimentação de um par com created_at IDÊNTICO';
  exception when others then
    if sqlstate = '42501' and sqlerrm like '%mesmo instante%' then
      v_ok := v_ok + 1; raise notice '✓ 4g par com created_at idêntico: o AJUSTE é recusado, com mensagem própria (42501)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '4g_MOTIVO_ERRADO; ';
      raise warning '✗ 4g recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  begin
    perform public.apagar_movimentacao(v_mov_z1, 'WAP0009407', 'justificativa ficticia do roteiro F23');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4g-bis_EMPATE_PASSOU; ';
    raise warning '✗ 4g-bis a COMPRA do par empatado foi apagada — a decisão ainda depende do uuid';
  exception when others then
    if sqlstate = '42501' and sqlerrm like '%mesmo instante%' then
      v_ok := v_ok + 1; raise notice '✓ 4g-bis o OUTRO membro do par também é recusado — é recusa, não sorteio de uuid';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '4g-bis_MOTIVO_ERRADO; ';
      raise warning '✗ 4g-bis recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  -- 4h. PAR POSITIVO da 0087: a recusa é ESTREITA. Ela só olha empate COM a movimentação ALVO
  --     — então o ativo importado que recebeu uma movimentação de verdade depois (outra
  --     transação, `created_at` próprio) segue apagável na ponta. Sem esta asserção, uma
  --     implementação que recusasse o ativo INTEIRO por ter qualquer empate passaria em 4g e
  --     tiraria a ferramenta de 90% do acervo sem ninguém notar. A movimentação nova entra
  --     pelo caminho normal, já como o dev logado.
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, setor, criado_por, created_at)
  values (v_at_z, 'saida', current_date - 2, v_f1, 'Fulano de Teste', 'TI', k_dev, now() - interval '2 hours')
  returning id into v_mov_z3;

  begin
    perform public.apagar_movimentacao(v_mov_z3, 'WAP0009407', 'justificativa ficticia do roteiro F23');
    select count(*) into v_n from public.movimentacoes where ativo_id = v_at_z;
    select status into v_st from public.ativos where id = v_at_z;
    if v_n = 2 and v_st = 'em_estoque' then
      v_ok := v_ok + 1; raise notice '✓ 4h a recusa do empate é ESTREITA: a movimentação POSTERIOR, com created_at próprio, continua apagável (restou o par empatado, ativo em_estoque)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '4h_ESTADO; ';
      raise warning '✗ 4h restantes=% status=%', v_n, v_st;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4h_RECUSOU_DEMAIS; ';
    raise warning '✗ 4h a recusa do empate pegou também a movimentação posterior (%): %', sqlstate, sqlerrm;
  end;

  reset role;

  -- =========================================================================
  -- 5 — apagar_item: some com lançamentos E com o saldo (que é derivado)
  -- =========================================================================
  insert into public.itens (nome, grupo, ordem) values ('F23 Mouse Ficticio', 'acessorio', 901) returning id into v_item5;
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
  values (v_item5, v_f1, 'entrada', 7, current_date - 5, k_dev);
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
  values (v_item5, v_f1, 'entrada', 5, current_date - 4, k_dev);
  select total into v_s1 from public.rel_saldo_itens(v_f1, current_date) where item_id = v_item5;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);
  begin
    select public.apagar_item(v_item5, 'F23 Mouse Ficticio', 'justificativa ficticia do roteiro F23') into v_j;
    v_ok := v_ok + 1; raise notice '✓ 5a dev APAGA um item do catálogo COM lançamentos: %', v_j::text;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5a_FALHOU; ';
    raise warning '✗ 5a apagar_item falhou (%): %', sqlstate, sqlerrm;
  end;
  reset role;

  select count(*) into v_n from public.lancamentos_item where item_id = v_item5;
  select count(*) into v_c1 from public.itens where id = v_item5;
  select count(*) into v_c2 from public.rel_saldo_itens(v_f1, current_date) where item_id = v_item5;
  if v_s1 = 12 and v_n = 0 and v_c1 = 0 and v_c2 = 0 then
    v_ok := v_ok + 1; raise notice '✓ 5b saldo era 12; item, lançamentos e a linha do saldo sumiram juntos';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5b_SALDO; ';
    raise warning '✗ 5b saldo_antes=% lanc=% item=% linhas_saldo=%', v_s1, v_n, v_c1, v_c2;
  end if;

  -- =========================================================================
  -- 9 — FORÇAR ESTADO (roda ANTES dos resets, que levariam o acervo embora)
  -- =========================================================================
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009901', 'F23K', 'notebook', v_f1, 'cadastro') returning id into v_at_k;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
  values (v_at_k, 'compra', current_date - 30, v_f1, k_dev, now() - interval '30 days');
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, setor, criado_por, created_at)
  values (v_at_k, 'saida', current_date - 20, v_f1, 'Fulano de Teste', 'TI', k_dev, now() - interval '20 days');

  -- ANTES: os três relatórios que a ordem manda comparar (critério 6).
  select coalesce(sum(total), 0) into v_r1 from public.rel_resumo(null::smallint, v_de, v_ate);
  select coalesce(sum(total), 0) into v_r2 from public.rel_mov_por_mes(null::smallint, v_de, v_ate);
  select coalesce(sum(total), 0) into v_r3 from public.rel_por_motivo(null::smallint, v_de, v_ate);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);
  begin
    select public.forcar_estado_ativo(v_at_k, 'descartado'::public.status_ativo, 'justificativa ficticia do roteiro F23') into v_j;
    v_ok := v_ok + 1; raise notice '✓ 9a dev FORÇA o estado de um ativo: %', v_j::text;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '9a_FALHOU; ';
    raise warning '✗ 9a forcar_estado_ativo falhou (%): %', sqlstate, sqlerrm;
  end;
  reset role;

  -- 9b. a FICHA DERIVA — o status é o alvo, e veio do trigger, não de um update à mão
  select status, colaborador_atual into v_st, v_txt from public.ativos where id = v_at_k;
  if v_st = 'descartado' then
    v_ok := v_ok + 1; raise notice '✓ 9b a ficha derivou para o estado forçado (descartado)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '9b_STATUS; ';
    raise warning '✗ 9b status após forçar = %', v_st;
  end if;

  -- 9c. o DETENTOR foi ZERADO (estado terminal). ⚠ Nota F36 (28/08/2026): quando esta
  --     asserção nasceu, o `ajuste` sozinho NÃO zerava — o zeramento era da RPC. Desde a
  --     migration 0110 o trigger também zera (a pergunta virou ao ESTADO resultante), e as
  --     duas camadas concordam. A asserção continua valendo, e agora prova as duas.
  if v_txt is null and (select setor_atual from public.ativos where id = v_at_k) is null then
    v_ok := v_ok + 1; raise notice '✓ 9c num estado terminal o detentor é zerado';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '9c_DETENTOR; ';
    raise warning '✗ 9c o detentor sobreviveu (colaborador = %)', coalesce(v_txt, '<nulo>');
  end if;

  -- 9d. a MARCA nasceu, com tipo `ajuste` e a justificativa na observação
  select count(*) into v_n from public.movimentacoes
   where id = (v_j->>'movimentacao_id')::uuid and forcado and tipo = 'ajuste'
     and observacao = 'justificativa ficticia do roteiro F23' and status_resultante = 'descartado';
  if v_n = 1 then
    v_ok := v_ok + 1; raise notice '✓ 9d a movimentação nasceu forcado=true, tipo ajuste, justificativa em observacao';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '9d_MARCA; ';
    raise warning '✗ 9d a movimentação forçada não está como esperado (%)', v_n;
  end if;

  -- 9e. E NÃO CONTA COMO OPERAÇÃO NORMAL — prova por CONSULTA, nos três relatórios.
  select coalesce(sum(total), 0) into v_s1 from public.rel_resumo(null::smallint, v_de, v_ate);
  select coalesce(sum(total), 0) into v_s2 from public.rel_mov_por_mes(null::smallint, v_de, v_ate);
  select coalesce(sum(total), 0) into v_s3 from public.rel_por_motivo(null::smallint, v_de, v_ate);
  if v_s1 = v_r1 and v_s2 = v_r2 and v_s3 = v_r3 then
    v_ok := v_ok + 1; raise notice '✓ 9e os três relatórios devolvem os MESMOS números antes e depois de forçar (%/%/%)', v_r1, v_r2, v_r3;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '9e_RELATORIO_MUDOU; ';
    raise warning '✗ 9e resumo %→%, por_mes %→%, por_motivo %→%', v_r1, v_s1, v_r2, v_s2, v_r3, v_s3;
  end if;

  -- 9f. PAR POSITIVO do zeramento: num estado COM DONO o detentor é informação legítima e
  --     precisa sobreviver. Sem isto, uma implementação que zerasse SEMPRE passaria em 9c.
  --     ⚠ Vocabulário F36 (0110): "com dono" são exatamente `em_uso`, `emprestado` e
  --     `reservado` (`status_tem_detentor`) — `defasado`, que a 0084 deixava de fora da
  --     lista à mão, passou para o lado SEM dono. Este cenário usa `emprestado`, que está
  --     dos dois lados da mudança e continua preservando.
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009902', 'F23L', 'notebook', v_f1, 'cadastro') returning id into v_at_l;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
  values (v_at_l, 'compra', current_date - 30, v_f1, k_dev, now() - interval '30 days');
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, setor, criado_por, created_at)
  values (v_at_l, 'saida', current_date - 20, v_f1, 'Beltrano de Teste', 'Compras', k_dev, now() - interval '20 days');

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);
  begin
    perform public.forcar_estado_ativo(v_at_l, 'emprestado'::public.status_ativo, 'justificativa ficticia do roteiro F23');
    select status, colaborador_atual into v_st, v_txt from public.ativos where id = v_at_l;
    if v_st = 'emprestado' and v_txt = 'Beltrano de Teste' then
      v_ok := v_ok + 1; raise notice '✓ 9f em estado NÃO terminal o detentor é preservado';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '9f_DETENTOR_PERDIDO; ';
      raise warning '✗ 9f status=% colaborador=%', v_st, coalesce(v_txt, '<nulo>');
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '9f_FALHOU; ';
    raise warning '✗ 9f falhou (%): %', sqlstate, sqlerrm;
  end;

  -- =========================================================================
  -- 10 — FORÇAR SALDO
  -- =========================================================================
  reset role;
  insert into public.itens (nome, grupo, ordem) values ('F23 Cabo Ficticio', 'acessorio', 902) returning id into v_item10;
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
  values (v_item10, v_f1, 'entrada', 3, current_date - 5, k_dev);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);
  begin
    select public.forcar_saldo_item(v_item10, v_f1, 12, 'justificativa ficticia do roteiro F23') into v_j;
    select total into v_s1 from public.rel_saldo_itens(v_f1, current_date) where item_id = v_item10;
    if v_s1 = 12 and (v_j->>'delta')::int = 9 then
      v_ok := v_ok + 1; raise notice '✓ 10a forçar o saldo de 3 para 12 grava o lançamento de delta 9';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '10a_SALDO; ';
      raise warning '✗ 10a saldo depois de forçar = % (retorno %)', v_s1, v_j::text;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '10a_FALHOU; ';
    raise warning '✗ 10a falhou (%): %', sqlstate, sqlerrm;
  end;

  begin
    perform public.forcar_saldo_item(v_item10, v_f1, 5, 'justificativa ficticia do roteiro F23');
    select total into v_s1 from public.rel_saldo_itens(v_f1, current_date) where item_id = v_item10;
    select count(*) into v_n from public.lancamentos_item where item_id = v_item10 and forcado and tipo = 'ajuste';
    if v_s1 = 5 and v_n = 2 then
      v_ok := v_ok + 1; raise notice '✓ 10b forçar PARA BAIXO também chega ao alvo (5), por lançamento marcado';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '10b_SALDO; ';
      raise warning '✗ 10b saldo=% lanc_forcados=%', v_s1, v_n;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '10b_FALHOU; ';
    raise warning '✗ 10b falhou (%): %', sqlstate, sqlerrm;
  end;
  reset role;

  -- =========================================================================
  -- 11 — O ESTORNO COMUM CONTINUA FUNCIONANDO
  -- =========================================================================
  -- ⚠ A regressão mais perigosa da fase: `aplicar_movimentacao` APAGA `pendencias_item` no ramo
  -- do estorno (o "estorno-strip" da F18). Se a guarda da 0081 tivesse alcançado aquela tabela,
  -- o estorno de uma devolução com itens faltantes quebraria — e nada mais neste roteiro
  -- perceberia.
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009501', 'F23M', 'notebook', v_f1, 'cadastro') returning id into v_at_m;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
  values (v_at_m, 'compra', current_date - 30, v_f1, k_dev, now() - interval '30 days');
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, setor, criado_por, created_at)
  values (v_at_m, 'saida', current_date - 20, v_f1, 'Fulano de Teste', 'TI', k_dev, now() - interval '20 days');
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, itens_faltantes, criado_por, created_at)
  values (v_at_m, 'devolucao', current_date - 10, v_f1, 'Fulano de Teste', array['Fonte ficticia'], k_dev, now() - interval '10 days') returning id into v_mov_m2;
  select count(*) into v_c1 from public.pendencias_item where movimentacao_id = v_mov_m2;

  begin
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, estorno_de, criado_por, created_at)
    values (v_at_m, 'estorno', current_date - 9, v_f1, v_mov_m2, k_dev, now() - interval '9 days');
    select status, colaborador_atual into v_st, v_txt from public.ativos where id = v_at_m;
    select count(*) into v_c2 from public.pendencias_item where movimentacao_id = v_mov_m2;
    if v_c1 = 1 and v_c2 = 0 and v_st = 'em_uso' and v_txt = 'Fulano de Teste' then
      v_ok := v_ok + 1; raise notice '✓ 11a o ESTORNO comum continua funcionando (com estorno-strip da pendência)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '11a_ESTORNO; ';
      raise warning '✗ 11a pend_antes=% pend_depois=% status=% colab=%', v_c1, v_c2, v_st, coalesce(v_txt,'<nulo>');
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '11a_ESTORNO_QUEBROU; ';
    raise warning '✗ 11a REGRESSÃO: o estorno comum quebrou (%): %', sqlstate, sqlerrm;
  end;

  -- =========================================================================
  -- 12 — A CONFIRMAÇÃO DIGITADA NÃO É CONTORNÁVEL
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);

  begin
    perform public.apagar_ativo(v_at_b, 'WAP0000000', 'justificativa ficticia do roteiro F23');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '12a_CONFIRMACAO; ';
    raise warning '✗ 12a apagar_ativo aceitou uma confirmação errada';
  exception when others then
    if sqlstate = '22023' and sqlerrm like '%confirmação não confere%' then
      v_ok := v_ok + 1; raise notice '✓ 12a apagar_ativo recusa confirmação errada (22023)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '12a_MOTIVO_ERRADO; ';
      raise warning '✗ 12a recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  -- justificativa curta COM a confirmação certa, para isolar a guarda que se quer medir
  begin
    perform public.apagar_ativo(v_at_b, 'WAP0009302', 'curta');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '12b_JUSTIFICATIVA; ';
    raise warning '✗ 12b apagar_ativo aceitou justificativa de 5 caracteres';
  exception when others then
    if sqlstate = '22023' and sqlerrm like '%justificativa%' then
      v_ok := v_ok + 1; raise notice '✓ 12b justificativa com menos de 10 caracteres é recusada (22023)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '12b_MOTIVO_ERRADO; ';
      raise warning '✗ 12b recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  begin
    perform public.apagar_item(v_item10, 'nome que nao e o do item', 'justificativa ficticia do roteiro F23');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '12c_CONFIRMACAO_ITEM; ';
    raise warning '✗ 12c apagar_item aceitou um nome errado';
  exception when others then
    if sqlstate = '22023' then
      v_ok := v_ok + 1; raise notice '✓ 12c apagar_item recusa nome errado na confirmação (22023)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '12c_MOTIVO_ERRADO; ';
      raise warning '✗ 12c recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  begin
    perform public.resetar_acervo(v_f2, 'RESETAR TUDO', 'justificativa ficticia do roteiro F23', v_backup_f2, '{}'::jsonb);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '12d_CONFIRMACAO_RESET; ';
    raise warning '✗ 12d o reset por filial aceitou a frase do reset GLOBAL';
  exception when others then
    if sqlstate = '22023' and sqlerrm like '%confirmação não confere%' then
      v_ok := v_ok + 1; raise notice '✓ 12d o reset por filial exige o NOME da filial (22023)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '12d_MOTIVO_ERRADO; ';
      raise warning '✗ 12d recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  begin
    perform public.forcar_estado_ativo(v_at_l, 'em_estoque'::public.status_ativo, 'curta');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '12e_JUSTIFICATIVA_FORCAR; ';
    raise warning '✗ 12e forcar_estado_ativo aceitou justificativa de 5 caracteres';
  exception when others then
    if sqlstate = '22023' then
      v_ok := v_ok + 1; raise notice '✓ 12e a mesma guarda de justificativa vale para FORÇAR (22023)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '12e_MOTIVO_ERRADO; ';
      raise warning '✗ 12e recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  -- =========================================================================
  -- 13 — A JANELA FECHA MESMO QUANDO A RPC ESTOURA NO MEIO
  -- =========================================================================
  -- Cenário escolhido porque o erro acontece DEPOIS do `set_config(... 'on')`: o lançamento de
  -- ajuste já está sendo inserido quando `valida_lancamento_item` recusa (o alvo 0 é menor do
  -- que o que já está atrelado a um chamado). Nas demais RPCs as validações vêm antes de abrir.
  reset role;
  insert into public.itens (nome, grupo, ordem) values ('F23 Teclado Ficticio', 'acessorio', 903) returning id into v_item13;
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
  values (v_item13, v_f1, 'entrada', 10, current_date - 5, k_dev);
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, chamado, data, criado_por)
  values (v_item13, v_f1, 'reserva', 10, 'CH-F23-FICTICIO', current_date - 4, k_dev);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);
  begin
    perform public.forcar_saldo_item(v_item13, v_f1, 0, 'justificativa ficticia do roteiro F23');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '13a_NAO_ESTOUROU; ';
    raise warning '✗ 13a o cenário não estourou — a asserção da janela não pôde ser medida';
  exception when others then
    v_ok := v_ok + 1;
    raise notice '✓ 13a a RPC estourou DEPOIS de abrir a janela (%): %', sqlstate, sqlerrm;
  end;

  v_txt := coalesce(current_setting('estoque.dev_destrutivo', true), '<vazio>');
  if v_txt <> 'on' then
    v_ok := v_ok + 1; raise notice '✓ 13b depois do erro, estoque.dev_destrutivo = %', v_txt;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '13b_JANELA_ABERTA; ';
    raise warning '✗ 13b a janela ficou ABERTA depois do erro';
  end if;

  reset role;

  -- e a prova que interessa: com a janela fechada, o DELETE direto segue recusado
  begin
    delete from public.movimentacoes where id = v_mov_x;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '13c_JANELA_VAZOU; ';
    raise warning '✗ 13c o DELETE direto passou depois do erro — a janela vazou';
  exception when others then
    if sqlerrm like '%não se remove%' then
      v_ok := v_ok + 1; raise notice '✓ 13c com a janela fechada, o DELETE direto continua recusado';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '13c_MOTIVO_ERRADO; ';
      raise warning '✗ 13c recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  -- =========================================================================
  -- 8 — O RESET RECUSA SEM BACKUP EXISTENTE E COM CONTAGENS DIVERGENTES
  -- =========================================================================
  -- Roda na filial 2 (a que NÃO será resetada na §6), para que uma recusa mal implementada que
  -- apagasse algo fosse detectada pela contagem logo abaixo.
  select count(*)::int into v_c1 from public.ativos a where a.filial_id = v_f2;
  select count(*)::int into v_c2 from public.movimentacoes m
   where m.ativo_id in (select id from public.ativos where filial_id = v_f2);
  select count(*)::int into v_c3 from public.anotacoes an
   where an.ativo_id in (select id from public.ativos where filial_id = v_f2);
  select count(*)::int into v_c4 from public.pendencias_item pi
   where pi.ativo_id in (select id from public.ativos where filial_id = v_f2);
  select count(*)::int into v_c5 from public.termos_gerados t
   where exists (select 1 from unnest(t.ativo_ids) aid join public.ativos a on a.id = aid where a.filial_id = v_f2);
  v_ct := jsonb_build_object('ativos', v_c1, 'movimentacoes', v_c2, 'anotacoes', v_c3, 'pendencias_item', v_c4, 'termos', v_c5);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);

  begin
    perform public.resetar_acervo(v_f2, v_nome_f2, 'justificativa ficticia do roteiro F23',
                                  'reset/acervo/filial-' || v_f2::text || '/este-backup-nao-existe.json', v_ct);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '8a_SEM_BACKUP; ';
    raise warning '✗ 8a o reset aceitou um backup que não existe no bucket';
  exception when others then
    if sqlstate = '22023' and sqlerrm like '%não existe no bucket%' then
      v_ok := v_ok + 1; raise notice '✓ 8a reset RECUSADO porque o backup não existe no bucket (22023)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '8a_MOTIVO_ERRADO; ';
      raise warning '✗ 8a recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;
  select count(*) into v_n from public.ativos where filial_id = v_f2;
  if v_n = v_c1 then
    v_ok := v_ok + 1; raise notice '✓ 8a-bis nada foi apagado na recusa por backup ausente (% ativos)', v_n;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '8a-bis_APAGOU; ';
    raise warning '✗ 8a-bis a filial perdeu ativos numa chamada recusada (% → %)', v_c1, v_n;
  end if;

  -- contagens divergentes → 40001: fecha a janela TOCTOU entre a prévia/backup e o delete
  begin
    perform public.resetar_acervo(v_f2, v_nome_f2, 'justificativa ficticia do roteiro F23', v_backup_f2, jsonb_set(v_ct, '{ativos}', to_jsonb(v_c1 + 7)));
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '8b_CONTAGENS; ';
    raise warning '✗ 8b o reset aceitou contagens que não batem';
  exception when others then
    if sqlstate = '40001' then
      v_ok := v_ok + 1; raise notice '✓ 8b reset RECUSADO por contagens divergentes (40001)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '8b_MOTIVO_ERRADO; ';
      raise warning '✗ 8b recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  begin
    perform public.resetar_acervo(v_f2, v_nome_f2, 'justificativa ficticia do roteiro F23', v_backup_f2, null::jsonb);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '8c_SEM_CONTAGENS; ';
    raise warning '✗ 8c o reset aceitou p_contagens nulo';
  exception when others then
    if sqlstate = '22023' then
      v_ok := v_ok + 1; raise notice '✓ 8c reset RECUSADO sem revalidação de contagens (22023)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '8c_MOTIVO_ERRADO; ';
      raise warning '✗ 8c recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  -- 8d. (0089) O BACKUP EXISTE NO BUCKET — E É DE OUTRO RECORTE. O caminho usado aqui é o
  --     backup REAL da filial 1 (`reset/acervo/filial-<f1>/…`, plantado nas fixtures e
  --     presente em storage.objects) numa tentativa de resetar a filial 2. É exatamente o caso
  --     que a conferência só-por-existência deixava passar, e a versão mais afiada dele: não é
  --     um caminho inventado, é um backup legítimo do recorte ERRADO. Sem esta asserção, a
  --     0089 seria indistinguível da guarda que ela substituiu.
  begin
    perform public.resetar_acervo(v_f2, v_nome_f2, 'justificativa ficticia do roteiro F23', v_backup, v_ct);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '8d_BACKUP_DE_OUTRO_RECORTE; ';
    raise warning '✗ 8d o reset da filial % aceitou o backup da filial %', v_nome_f2, v_nome_f1;
  exception when others then
    if sqlstate = '22023' and sqlerrm like '%DESTE recorte%' then
      v_ok := v_ok + 1; raise notice '✓ 8d reset RECUSADO: o backup existe no bucket, mas é do recorte errado (22023)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '8d_MOTIVO_ERRADO; ';
      raise warning '✗ 8d recusa por outro motivo (%): %', sqlstate, sqlerrm;
    end if;
  end;

  reset role;

  -- =========================================================================
  -- 6 — RESET POR FILIAL: o que ele NÃO leva, e o que ele REALMENTE leva
  -- =========================================================================
  -- Dois ativos que atravessaram a fronteira, cada um num sentido:
  --   X nasceu na filial 2 e HOJE está na 1 → a movimentação dele REGISTRADA na filial 2 morre
  --     junto com ele quando a filial 1 é resetada;
  --   Y nasceu na filial 1 e HOJE está na 2 → a movimentação dele REGISTRADA na filial 1
  --     SOBREVIVE, porque o ativo não é mais desta filial.
  -- É o comportamento HERDADO do import ("Substituir tudo"), e o roteiro o documenta em vez de
  -- prometer algo mais simples do que a realidade: o recorte é "os ativos desta filial e tudo
  -- que é deles", não "tudo que aconteceu nesta filial".
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009601', 'F23X', 'notebook', v_f2, 'cadastro') returning id into v_at_x;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, filial_destino_id, criado_por, created_at)
  values (v_at_x, 'transferencia', current_date - 8, v_f2, v_f1, k_dev, now() - interval '8 days') returning id into v_mov_x;

  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0009602', 'F23Y', 'notebook', v_f1, 'cadastro') returning id into v_at_y;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, filial_destino_id, criado_por, created_at)
  values (v_at_y, 'transferencia', current_date - 8, v_f1, v_f2, k_dev, now() - interval '8 days') returning id into v_mov_y;

  select count(*)::int into v_c1 from public.ativos a where a.filial_id = v_f1;
  select count(*)::int into v_c2 from public.movimentacoes m
   where m.ativo_id in (select id from public.ativos where filial_id = v_f1);
  select count(*)::int into v_c3 from public.anotacoes an
   where an.ativo_id in (select id from public.ativos where filial_id = v_f1);
  select count(*)::int into v_c4 from public.pendencias_item pi
   where pi.ativo_id in (select id from public.ativos where filial_id = v_f1);
  select count(*)::int into v_c5 from public.termos_gerados t
   where exists (select 1 from unnest(t.ativo_ids) aid join public.ativos a on a.id = aid where a.filial_id = v_f1);
  v_ct := jsonb_build_object('ativos', v_c1, 'movimentacoes', v_c2, 'anotacoes', v_c3, 'pendencias_item', v_c4, 'termos', v_c5);
  select count(*)::int into v_n from public.ativos where filial_id = v_f2;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);
  begin
    select public.resetar_acervo(v_f1, v_nome_f1, 'justificativa ficticia do roteiro F23', v_backup, v_ct) into v_j;
    v_ok := v_ok + 1; raise notice '✓ 6a dev RESETA o acervo da filial %: %', v_nome_f1, v_j::text;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6a_FALHOU; ';
    raise warning '✗ 6a resetar_acervo por filial falhou (%): %', sqlstate, sqlerrm;
  end;
  reset role;

  select count(*) into v_c2 from public.ativos where filial_id = v_f1;
  if v_c2 = 0 then
    v_ok := v_ok + 1; raise notice '✓ 6b a filial resetada ficou sem nenhum ativo';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6b_SOBROU; ';
    raise warning '✗ 6b sobraram % ativos na filial resetada', v_c2;
  end if;

  -- ⚠ A contagem "antes" JÁ INCLUI o ativo Y, que migrou para a filial 2 no momento em que foi
  -- plantado: o recorte olha `ativos.filial_id` de HOJE, não a filial em que o ativo nasceu.
  -- Por isso o esperado é IGUAL, não "+1" (foi assim que a primeira versão desta asserção
  -- errou).
  select count(*) into v_c3 from public.ativos where filial_id = v_f2;
  if v_c3 = v_n then
    v_ok := v_ok + 1; raise notice '✓ 6c o reset da filial % não apagou ativo nenhum da filial % (% antes, % depois), inclusive o que migrou para lá', v_nome_f1, v_nome_f2, v_n, v_c3;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6c_VAZOU; ';
    raise warning '✗ 6c a filial % tinha % ativos e agora tem % (esperado %)', v_nome_f2, v_n, v_c3, v_n;
  end if;

  select count(*) into v_n from public.movimentacoes where id = v_mov_x;
  select count(*) into v_c1 from public.ativos where id = v_at_x;
  if v_n = 0 and v_c1 = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 6d uma movimentação REGISTRADA na filial %, de um ativo que HOJE está na filial %, É APAGADA junto com o ativo', v_nome_f2, v_nome_f1;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6d_MOV_DA_OUTRA_FILIAL_SOBROU; ';
    raise warning '✗ 6d a movimentação registrada na outra filial sobreviveu (mov=%, ativo=%)', v_n, v_c1;
  end if;

  -- ⚠ Consequência prática desta segunda metade, e por isso ela está assertada: depois de um
  -- reset da filial 1, um RELATÓRIO da filial 1 ainda pode listar movimentações — as dos ativos
  -- que se mudaram —, porque o relatório filtra por `movimentacoes.filial_id`.
  select count(*) into v_n from public.movimentacoes where id = v_mov_y;
  select count(*) into v_c1 from public.ativos where id = v_at_y;
  if v_n = 1 and v_c1 = 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 6e uma movimentação REGISTRADA na filial %, cujo ativo já migrou para a %, NÃO é apagada', v_nome_f1, v_nome_f2;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6e_MOV_DA_FILIAL_SUMIU; ';
    raise warning '✗ 6e a movimentação da filial resetada, de ativo migrado, sumiu (mov=%, ativo=%)', v_n, v_c1;
  end if;

  -- =========================================================================
  -- 7 — RESET GLOBAL: o acervo some, os CADASTROS e a história administrativa ficam
  -- =========================================================================
  -- ⚠ Esta seção é a ÚLTIMA por construção: depois dela não existe mais acervo para medir.
  -- Uma linha em CADA tabela que tem de sobreviver, plantada antes.
  insert into public.motivos (codigo, rotulo, aplica_a)
  values ('f23_motivo_ficticio', 'Motivo ficticio F23', array['saida']::public.tipo_movimentacao[]);
  insert into public.kits_modelos (nome, payload, criado_por)
  values ('F23 Kit Ficticio', '{"categorias":["notebook"]}'::jsonb, k_admin);
  insert into public.senhas_acesso (rotulo, hash, criado_por)
  values ('F23 Senha Ficticia', 'hash-ficticio-do-roteiro', k_admin);
  insert into public.relatorios_gerados (periodo_de, periodo_ate, filial_id, versao, dados, gerado_por)
  values (current_date, current_date, v_f2, 1, '{}'::jsonb, k_admin);
  insert into public.import_logs (filial_id, modo, arquivo_hash, total_linhas, ativos_criados,
                                  movs_apagadas, anotacoes_apagadas, termos_apagados, backup_path, correcoes, criado_por)
  values (v_f2, 'substituir', 'hash-ficticio-f23', 0, 0, 0, 0, 0, 'f23/backup.csv', '[]'::jsonb, k_admin);

  select count(*)::int into v_c1 from public.ativos;
  select count(*)::int into v_c2 from public.movimentacoes;
  select count(*)::int into v_c3 from public.anotacoes;
  select count(*)::int into v_c4 from public.pendencias_item;
  select count(*)::int into v_c5 from public.termos_gerados;
  v_ct := jsonb_build_object('ativos', v_c1, 'movimentacoes', v_c2, 'anotacoes', v_c3, 'pendencias_item', v_c4, 'termos', v_c5);
  select count(*)::int into v_n from public.lancamentos_item;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);

  begin
    select public.resetar_acervo(null::smallint, 'RESETAR TUDO', 'justificativa ficticia do roteiro F23', v_backup_glob, v_ct) into v_j;
    v_ok := v_ok + 1; raise notice '✓ 7a dev RESETA o acervo INTEIRO com a frase RESETAR TUDO: %', v_j::text;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '7a_FALHOU; ';
    raise warning '✗ 7a resetar_acervo global falhou (%): %', sqlstate, sqlerrm;
  end;

  begin
    perform public.resetar_itens(null::smallint, 'RESETAR TUDO', 'justificativa ficticia do roteiro F23', v_backup_itens, jsonb_build_object('lancamentos', v_n));
    v_ok := v_ok + 1; raise notice '✓ 7b dev RESETA os lançamentos de itens de todas as filiais';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '7b_FALHOU; ';
    raise warning '✗ 7b resetar_itens global falhou (%): %', sqlstate, sqlerrm;
  end;

  reset role;

  select (select count(*) from public.ativos) + (select count(*) from public.movimentacoes)
       + (select count(*) from public.anotacoes) + (select count(*) from public.pendencias_item)
       + (select count(*) from public.termos_gerados) + (select count(*) from public.lancamentos_item) into v_n;
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 7c o reset global zerou o acervo inteiro';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '7c_SOBROU_ACERVO; ';
    raise warning '✗ 7c sobraram % linha(s) de acervo', v_n;
  end if;

  v_txt := '';
  if (select count(*) from public.filiais) = 0            then v_txt := v_txt || 'filiais '; end if;
  if (select count(*) from public.motivos) = 0            then v_txt := v_txt || 'motivos '; end if;
  if (select count(*) from public.itens) = 0              then v_txt := v_txt || 'itens '; end if;
  if (select count(*) from public.kits_modelos) = 0       then v_txt := v_txt || 'kits_modelos '; end if;
  if (select count(*) from public.senhas_acesso) = 0      then v_txt := v_txt || 'senhas_acesso '; end if;
  if (select count(*) from public.profiles) = 0           then v_txt := v_txt || 'profiles '; end if;
  if (select count(*) from public.operador_filiais) = 0   then v_txt := v_txt || 'operador_filiais '; end if;
  if v_txt = '' then
    v_ok := v_ok + 1; raise notice '✓ 7d os CADASTROS sobreviveram ao reset global';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '7d_CADASTRO_PERDIDO; ';
    raise warning '✗ 7d o reset global levou cadastro junto: %', v_txt;
  end if;

  select count(*) into v_n from public.itens where id = v_item_cad;
  if v_n = 1 then
    v_ok := v_ok + 1; raise notice '✓ 7d-bis o item do catálogo continua lá — resetar_itens leva os LANÇAMENTOS';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '7d-bis_CATALOGO; ';
    raise warning '✗ 7d-bis o catálogo de itens perdeu a linha do roteiro';
  end if;

  v_txt := '';
  if (select count(*) from public.relatorios_gerados) = 0 then v_txt := v_txt || 'relatorios_gerados '; end if;
  if (select count(*) from public.eventos_admin) = 0      then v_txt := v_txt || 'eventos_admin '; end if;
  if (select count(*) from public.import_logs) = 0        then v_txt := v_txt || 'import_logs '; end if;
  if v_txt = '' then
    v_ok := v_ok + 1; raise notice '✓ 7e relatorios_gerados, eventos_admin e import_logs sobreviveram';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '7e_HISTORIA_PERDIDA; ';
    raise warning '✗ 7e o reset global levou história administrativa junto: %', v_txt;
  end if;

  -- Cada bloco tem de ter registrado o backup DELE (a 0089 deu caminhos distintos ao acervo e
  -- aos itens): contar as duas linhas com o mesmo caminho não provaria mais nada.
  select count(*) into v_n from public.eventos_admin
   where alvo = 'RESETAR TUDO' and detalhe->>'alcance' = 'global'
     and ((acao = 'acervo_resetado' and detalhe->>'backup_path' = v_backup_glob)
       or (acao = 'itens_resetados' and detalhe->>'backup_path' = v_backup_itens));
  if v_n = 2 then
    v_ok := v_ok + 1; raise notice '✓ 7f os dois resets globais deixaram trilha, cada um com o caminho do SEU backup';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '7f_TRILHA_RESET; ';
    raise warning '✗ 7f a trilha dos resets globais tem % linha(s) (esperado 2)', v_n;
  end if;

  -- 7g. o vocabulário completo da fase apareceu na trilha (0085 — "mexeu aqui, mexa lá")
  select count(distinct acao) into v_n from public.eventos_admin
   where acao in ('ativo_apagado', 'movimentacao_apagada', 'item_apagado', 'acervo_resetado',
                  'itens_resetados', 'estado_forcado', 'saldo_forcado');
  if v_n = 7 then
    v_ok := v_ok + 1; raise notice '✓ 7g os SETE verbos novos da F23 foram gravados em eventos_admin';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '7g_VOCABULARIO; ';
    raise warning '✗ 7g só % dos 7 verbos novos apareceram na trilha', v_n;
  end if;

  -- =========================================================================
  -- RESUMO (a linha que o MCP consegue ler — ele engole NOTICE/WARNING)
  -- =========================================================================
  insert into _dev_destrutivo_resumo values (v_ok, v_falhas, nullif(v_msgs, ''));
  if v_falhas = 0 then
    raise notice '=== dev_destrutivo: % asserções OK, 0 falhas ===', v_ok;
  else
    raise warning '✗ TOTAL dev_destrutivo: % falha(s) — %', v_falhas, v_msgs;
  end if;
end $$;

select * from _dev_destrutivo_resumo;

rollback;
