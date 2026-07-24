-- =============================================================
-- Roteiro de teste: CATÁLOGO DE SEGURANÇA (roda no job `banco` do CI e é
-- auto-verificável no SQL editor / MCP do ENSAIO). É SÓ LEITURA de catálogo
-- (pg_class, pg_proc, ACLs) — NÃO grava nada, por isso dispensa begin/rollback.
-- Mesmo padrão dos demais roteiros:
--   NOTICE  '✓ ...'  quando a invariante de segurança bate
--   WARNING '✗ ...'  quando NÃO bate (o job `banco` do CI falha em qualquer
--                     `WARNING: ✗`).
--
-- Fecha R-ACC-07 (RLS ligada), R-ACC-10 (security_invoker nas views) e R-ACC-11
-- (as 3 RPCs de ESCRITA são authenticated-only) e TRAVA o fix da migration 0055
-- (criar_compra_lote deixou de ser executável por anon/service_role). Também
-- cobre R-ACC-12 (0038: EXECUTE das funções-gatilho SECURITY DEFINER revogado).
--
-- NOTA sobre valida_lancamento_item (R-ACC-12, asserção 4c): ao contrário de
-- aplicar_movimentacao e handle_new_user, essa função-gatilho é SECURITY INVOKER
-- — roda com o privilégio de QUEM chama, não do dono; não é vetor de
-- escalonamento e o advisor do Supabase não a aponta. Por isso a migration 0038
-- revoga o EXECUTE SÓ das DUAS funções SECURITY DEFINER e deixa esta com o grant
-- default do Supabase (authenticated/anon com EXECUTE). A asserção 4c prova
-- prosecdef=false — é exatamente o que torna esse grant inofensivo. Se um dia se
-- quiser defesa-em-profundidade também aqui, basta uma migration nova revogando
-- o EXECUTE; então este 4c pode virar a mesma checagem dos 4a/4b.
-- =============================================================

do $$
declare
  v_sig    text;
  v_auth   boolean;
  v_anon   boolean;
  v_svc    boolean;
  v_cnt    int;
  v_lista  text;
  v_secdef boolean;
begin
  -- ---------------------------------------------------------------
  -- 1 — GRANTS das 3 RPCs de ESCRITA: authenticated-only (R-ACC-11 + fix 0055).
  --     Esperado por RPC: authenticated=EXECUTE, anon=SEM, service_role=SEM.
  --     (usa to_regprocedure p/ não estourar exceção se a assinatura sumir —
  --      nesse caso emite ✗ em vez de derrubar o roteiro com erro de psql.)
  -- ---------------------------------------------------------------
  foreach v_sig in array array[
    'public.criar_compra_lote(jsonb, uuid)',
    'public.devolver_ao_fornecedor(uuid, jsonb, jsonb, uuid)',
    'public.importar_ativos_substituir(jsonb, text, jsonb, jsonb)'
  ]
  loop
    if to_regprocedure(v_sig) is null then
      raise warning '✗ 1 RPC de escrita não encontrada no catálogo: %', v_sig;
    else
      v_auth := has_function_privilege('authenticated', to_regprocedure(v_sig)::oid, 'execute');
      v_anon := has_function_privilege('anon',          to_regprocedure(v_sig)::oid, 'execute');
      v_svc  := has_function_privilege('service_role',  to_regprocedure(v_sig)::oid, 'execute');
      if v_auth and not v_anon and not v_svc then
        raise notice '✓ 1 % é authenticated-only (anon e service_role SEM EXECUTE)', v_sig;
      else
        raise warning '✗ 1 % grants errados: authenticated=% (esp. t), anon=% (esp. f), service_role=% (esp. f)',
          v_sig, v_auth, v_anon, v_svc;
      end if;
    end if;
  end loop;

  -- ---------------------------------------------------------------
  -- 2 — RLS ligada em TODA tabela do schema public que NÃO começa com '_'
  --     (R-ACC-07). relkind r=tabela, p=particionada.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(c.relname, ', ' order by c.relname), '')
    into v_cnt, v_lista
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and left(c.relname, 1) <> '_'
    and c.relrowsecurity = false;
  if v_cnt = 0 then
    raise notice '✓ 2 RLS ligada em todas as tabelas public (nenhuma sem RLS)';
  else
    raise warning '✗ 2 % tabela(s) public SEM RLS: %', v_cnt, v_lista;
  end if;

  -- ---------------------------------------------------------------
  -- 3 — security_invoker=true em TODAS as views do schema public (R-ACC-10).
  --     Sem isso a view roda com o privilégio do DONO e fura a RLS das tabelas
  --     de base.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(c.relname, ', ' order by c.relname), '')
    into v_cnt, v_lista
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and not (coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=true%');
  if v_cnt = 0 then
    raise notice '✓ 3 todas as views public têm security_invoker=true';
  else
    raise warning '✗ 3 % view(s) public SEM security_invoker=true: %', v_cnt, v_lista;
  end if;

  -- ---------------------------------------------------------------
  -- 4 — funções-GATILHO (R-ACC-12 / migration 0038).
  --   4a/4b: as SECURITY DEFINER (aplicar_movimentacao, handle_new_user) NÃO
  --          podem ser executáveis por authenticated nem anon (são acessíveis
  --          via /rest/v1/rpc/* com a anon key; disparam só por trigger).
  --   4c:    valida_lancamento_item é SECURITY INVOKER — é POR ISSO que a 0038
  --          não revoga (nem precisa) seu EXECUTE. Provamos prosecdef=false.
  -- ---------------------------------------------------------------
  foreach v_sig in array array['aplicar_movimentacao', 'handle_new_user']
  loop
    select bool_or(has_function_privilege('authenticated', p.oid, 'execute')
                or has_function_privilege('anon', p.oid, 'execute')),
           bool_and(p.prosecdef)
      into v_auth, v_secdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_sig;
    if v_auth is null then
      raise warning '✗ 4 função-gatilho ausente no catálogo: %', v_sig;
    elsif v_auth = false then
      raise notice '✓ 4 % (security_definer=%): EXECUTE revogado de authenticated e anon', v_sig, v_secdef;
    else
      raise warning '✗ 4 % executável por authenticated/anon (R-ACC-12/0038: deveria estar revogado)', v_sig;
    end if;
  end loop;

  select bool_and(not p.prosecdef)
    into v_secdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'valida_lancamento_item';
  if v_secdef is null then
    raise warning '✗ 4c função-gatilho ausente no catálogo: valida_lancamento_item';
  elsif v_secdef then
    raise notice '✓ 4c valida_lancamento_item é SECURITY INVOKER (não é vetor; 0038 revoga só as DEFINER)';
  else
    raise warning '✗ 4c valida_lancamento_item virou SECURITY DEFINER sem revoke de EXECUTE — revise R-ACC-12/0038';
  end if;

  raise notice '=== fim do roteiro seguranca_catalogo (procure por ✗ acima; nenhum = tudo passou) ===';
end $$;
