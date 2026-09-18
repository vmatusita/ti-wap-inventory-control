-- =============================================================
-- Roteiro de teste: `public.ledger_de_migracoes()` (reauditoria 18/09/2026,
-- item AE · passo 2 — migration 0148)
-- =============================================================
-- A RPC nova que dá à sonda de deriva (scripts/smoke/deriva-migrations.mjs, pela
-- conta `consulta` do smoke agendado) o ledger de migrations INTEIRO —
-- `supabase_migrations.schema_migrations`, da versão mais nova para a mais
-- antiga —, com a MESMA guarda de `checagens_integridade_resumo()` (0138):
-- qualquer logado ATIVO (`papel_atual() is not null`), não só o cargo dev que
-- `ultima_migracao_aplicada()` (0077) exige.
--
-- O QUE ESTE ROTEIRO PROVA:
--   1  logado ATIVO lê — qualquer cargo, aqui um `operador` fictício
--   2a authenticated SEM papel (perfil DESATIVADO) é recusado, pela GUARDA DE
--      DENTRO da função (42501, `raise exception`) — `papel_atual()` também é
--      NULL neste caso (não só para anon), e é essa recusa que o roteiro prova
--   2b anon é recusado pela FALTA DE GRANT (42501, `permission denied for
--      function` — o Postgres nem entra no corpo)
--   3  devolve na ordem certa (version DESC) — duas linhas fictícias plantadas
--      com versão maior que qualquer coisa real garantem o topo
--   4  devolve o ledger INTEIRO, nunca uma janela: o contrato de base fixa da
--      sonda (da 0146 em diante, todo arquivo tem de estar no ledger) quebra em
--      silêncio se uma linha antiga que ainda vale cair fora de um `limit`
--
-- NÃO TESTA `undefined_table` (o caminho da tabela de controle ausente, espelho
-- da 0077): forçaria um `drop table supabase_migrations.schema_migrations`
-- dentro da transação, e mesmo sob `rollback` o DDL tomaria lock numa tabela que
-- OUTRAS sessões do mesmo banco compartilhado (ensaio) podem estar lendo — custo
-- desproporcional para um ramo que só existe num Postgres cru, coisa que o job
-- `banco-sem-docker` já cobre por CONSTRUÇÃO (o bootstrap cria a tabela SEMPRE —
-- ver `supabase/ci/bootstrap-ledger.sql`).
--
-- ESCREVE (usuário fictício + duas linhas de ledger fictícias), então roda
-- inteiro dentro de `begin; … rollback;` — nada sobra no banco. Molde:
-- `supabase/tests/dominios_login.sql` (o mesmo tamanho de problema) e o padrão de
-- troca de papel de `supabase/tests/papeis_rls.sql`.
--
-- DADOS 100% FICTÍCIOS (regra 2 do CLAUDE.md): e-mail `@wap.ind.br` de fantasia,
-- `version`/`name` de ledger que não correspondem a nenhuma migration real (o
-- prefixo `99999999999999`/`99999999999998` é maior que qualquer timestamp real
-- de hoje, só para garantir o topo da ordenação na asserção 3).
--
-- Mesmo padrão de saída dos demais roteiros da pasta:
--   NOTICE  '✓ ...'  quando a invariante bate
--   WARNING '✗ ...'  quando NÃO bate (o job `banco-sem-docker` falha em qualquer `WARNING: ✗`)
-- =============================================================

begin;

do $$
declare
  k_operador uuid := '00000000-f148-4000-8000-000000000001';
  v_ok       int  := 0;
  v_falhas   int  := 0;
  v_cnt      int;
  v_total    int;
  v_topo     record;
begin
  -- ---------------------------------------------------------------------
  -- FIXTURES (como postgres — antes de qualquer troca de papel)
  -- ---------------------------------------------------------------------
  -- O trigger handle_new_user cria o profile (e exige domínio corporativo —
  -- 0041/0057). Cargo qualquer serve para a asserção 1: a guarda é
  -- `papel_atual() is not null`, não um cargo específico.
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values (k_operador, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'f148.operador@wap.ind.br', '', now(), now(), now());
  update public.profiles set papel = 'operador' where id = k_operador;

  -- Duas linhas de ledger FICTÍCIAS, com versão maior que qualquer coisa real
  -- hoje — garantem o TOPO da ordenação sem depender do estado real do banco
  -- (que varia entre CI/ensaio/produção e cresce a cada apply).
  insert into supabase_migrations.schema_migrations (version, name) values
    ('99999999999999', 'f148_fixture_mais_nova'),
    ('99999999999998', 'f148_fixture_mais_velha');

  -- =========================================================================
  -- 1 — LOGADO ATIVO LÊ (qualquer cargo — aqui, operador)
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  begin
    select count(*) into v_cnt from public.ledger_de_migracoes();
    if v_cnt >= 2 then
      v_ok := v_ok + 1;
      raise notice '✓ 1 logado ativo (operador) lê ledger_de_migracoes() (% linha[s], incl. as 2 fixtures)', v_cnt;
    else
      v_falhas := v_falhas + 1;
      raise warning '✗ 1 logado ativo leu % linha(s) — esperava ao menos as 2 fixtures plantadas', v_cnt;
    end if;
  exception when others then
    v_falhas := v_falhas + 1;
    raise warning '✗ 1 logado ativo foi RECUSADO (não deveria): % (%)', sqlerrm, sqlstate;
  end;

  -- =========================================================================
  -- 2a — AUTHENTICATED SEM PAPEL (perfil desativado): a GUARDA DE DENTRO recusa
  -- =========================================================================
  -- A fixture muda como postgres: no Postgres NOVO do CI `authenticated` não tem
  -- privilégio de tabela em `profiles` (os grants de default do projeto hospedado não
  -- existem lá), e mexer no perfil não é o que este cenário mede.
  reset role;
  update public.profiles set ativo = false where id = k_operador;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);
  -- `ativo=false` vale no request SEGUINTE (0070/0073) — nesta simulação, a
  -- PRÓXIMA chamada já é o "request seguinte", então o efeito já vale aqui.
  begin
    perform * from public.ledger_de_migracoes();
    v_falhas := v_falhas + 1;
    raise warning '✗ 2a perfil DESATIVADO conseguiu ler ledger_de_migracoes() (deveria ter sido recusado)';
  exception
    when insufficient_privilege then
      v_ok := v_ok + 1;
      raise notice '✓ 2a perfil DESATIVADO recusado pela guarda de dentro (42501: %)', sqlerrm;
    when others then
      v_falhas := v_falhas + 1;
      raise warning '✗ 2a recusado por SQLSTATE inesperado (não 42501): % — %', sqlstate, sqlerrm;
  end;
  reset role;
  update public.profiles set ativo = true where id = k_operador; -- devolve o estado para não vazar para outra asserção

  -- =========================================================================
  -- 2b — ANON: recusado pela FALTA DE GRANT (nem entra no corpo da função)
  -- =========================================================================
  reset role;
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    perform * from public.ledger_de_migracoes();
    v_falhas := v_falhas + 1;
    raise warning '✗ 2b anon conseguiu ler ledger_de_migracoes() (deveria ter sido recusado)';
  exception
    when insufficient_privilege then
      v_ok := v_ok + 1;
      raise notice '✓ 2b anon recusado por falta de EXECUTE (42501: %)', sqlerrm;
    when others then
      v_falhas := v_falhas + 1;
      raise warning '✗ 2b recusado por SQLSTATE inesperado (não 42501): % — %', sqlstate, sqlerrm;
  end;
  reset role;

  -- =========================================================================
  -- 3 — DEVOLVE A PONTA NA ORDEM CERTA (version DESC)
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  select versao, nome into v_topo from public.ledger_de_migracoes() limit 1;
  if v_topo.versao = '99999999999999' and v_topo.nome = 'f148_fixture_mais_nova' then
    v_ok := v_ok + 1;
    raise notice '✓ 3a a primeira linha é a de MAIOR versão (% / %)', v_topo.versao, v_topo.nome;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3a esperava (99999999999999, f148_fixture_mais_nova) no topo, veio (%, %)',
      v_topo.versao, v_topo.nome;
  end if;

  select versao, nome into v_topo from public.ledger_de_migracoes() order by versao desc offset 1 limit 1;
  if v_topo.versao = '99999999999998' and v_topo.nome = 'f148_fixture_mais_velha' then
    v_ok := v_ok + 1;
    raise notice '✓ 3b a segunda linha é a fixture mais velha das duas (% / %)', v_topo.versao, v_topo.nome;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3b esperava (99999999999998, f148_fixture_mais_velha) em segundo, veio (%, %)',
      v_topo.versao, v_topo.nome;
  end if;

  -- =========================================================================
  -- 4 — DEVOLVE O LEDGER INTEIRO (a contagem da função = a contagem da tabela)
  -- =========================================================================
  select count(*) into v_cnt from public.ledger_de_migracoes();
  reset role;
  select count(*) into v_total from supabase_migrations.schema_migrations;
  if v_cnt = v_total then
    v_ok := v_ok + 1;
    raise notice '✓ 4 a função devolve o ledger inteiro (% de % linhas)', v_cnt, v_total;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 4 a função devolveu % linha(s), mas o ledger tem % — há um corte (limit?) que cega a sonda',
      v_cnt, v_total;
  end if;

  raise notice 'FIM ledger_de_migracoes: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
