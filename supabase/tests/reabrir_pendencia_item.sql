-- =============================================================
-- Roteiro de teste: REABRIR PENDÊNCIA DE ITEM É DO NÍVEL ADMINISTRADOR
-- (F28 · PND-05 · migration 0103)
--
-- Roda no job `banco` do CI (psql, ON_ERROR_STOP=1) e é auto-verificável no SQL
-- editor / MCP do ENSAIO. Mesmo padrão dos demais roteiros da pasta:
--   NOTICE  '✓ ...'  quando a invariante bate
--   WARNING '✗ ...'  quando NÃO bate (o job `banco` falha em qualquer `WARNING: ✗`)
--
-- ESCREVE (usuários, perfis, vínculos, ativo, movimentação e pendência fictícios),
-- então roda inteiro dentro de `begin; … rollback;` — nada sobra no banco. É
-- AUTOSSUFICIENTE: cria tudo de que precisa, para funcionar num Postgres novo do CI.
--
-- DADOS 100% FICTÍCIOS (regra 2 do CLAUDE.md): patrimônio `WAP0009103`, nomes
-- inventados, e-mails `@wap.ind.br` de fantasia. Nenhum dado real da WAP.
--
-- COMO SIMULA UM USUÁRIO: `postgres` é superusuário e IGNORA RLS — testar com ele
-- não prova nada. Cada cenário faz `set local role authenticated` +
-- `set_config('request.jwt.claims', …)`, que é o que o PostgREST monta por request.
--
-- O QUE PROVA
--   1. o OPERADOR com vínculo continua RESOLVENDO (aberta → resolvida)  — nada quebrou
--   2. o OPERADOR com vínculo NÃO reabre (resolvida → aberta)           — o buraco fechado
--   3. o NÍVEL ADMINISTRADOR reabre                                     — o item entregue
--   4. o admin não reabre pendência de filial em que não escreve? — N/A: admin escreve
--      em TODA filial ativa por definição (0072). Fica o caso do OPERADOR sem vínculo,
--      que é o recorte que existe de verdade.
--
-- ⚠ POR QUE ESTE ROTEIRO EXISTE: a F28 entregou a reabertura com gate de cargo só na
-- Server Action. A 2ª volta da revisão adversarial mostrou que a policy da 0063 deixa
-- qualquer operador vinculado reabrir por chamada direta ao PostgREST, sem justificativa
-- e sem anotação. A 0103 fecha; este roteiro é a prova de que fechou — e de que não
-- fechou demais.
-- =============================================================

begin;

do $$
declare
  k_admin    constant uuid := '00000000-0000-0000-0000-0000f2810001';
  k_operador constant uuid := '00000000-0000-0000-0000-0000f2810002';
  k_outro    constant uuid := '00000000-0000-0000-0000-0000f2810003';
  v_f1       smallint;
  v_f2       smallint;
  v_ativo    uuid;
  v_mov      uuid;
  v_pend     uuid;
  v_status   text;
  v_n        int;
  v_ok       int  := 0;
  v_falhas   int  := 0;
begin
  -- =========================================================================
  -- FIXTURES (como postgres — antes de qualquer troca de papel)
  -- =========================================================================
  select id into v_f1 from public.filiais where ativo order by id limit 1;
  select id into v_f2 from public.filiais where ativo and id <> v_f1 order by id limit 1;
  if v_f1 is null or v_f2 is null then
    raise warning '✗ 0 o banco precisa de ao menos DUAS filiais ativas para este roteiro';
    return;
  end if;

  -- O trigger handle_new_user cria o profile (e exige domínio corporativo — 0041).
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (k_admin,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f28.chefia@wap.ind.br',   '', now(), now(), now()),
    (k_operador, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f28.operador@wap.ind.br', '', now(), now(), now()),
    (k_outro,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f28.outrafilial@wap.ind.br', '', now(), now(), now());

  update public.profiles set papel = 'admin'    where id = k_admin;
  update public.profiles set papel = 'operador' where id = k_operador;
  update public.profiles set papel = 'operador' where id = k_outro;

  -- `k_operador` escreve na filial da pendência; `k_outro`, na OUTRA.
  insert into public.operador_filiais (usuario_id, filial_id) values
    (k_operador, v_f1),
    (k_outro,    v_f2);

  insert into public.ativos (patrimonio, categoria, filial_id)
  values ('WAP0009103', 'notebook', v_f1)
  returning id into v_ativo;

  -- A pendência de item nasce pelo trigger da DEVOLUÇÃO com itens faltantes (0051).
  -- Criar a linha à mão seria possível como postgres, mas nascer pelo caminho real
  -- é o que garante que o teste mede a tabela que a aplicação usa — e a máquina de
  -- estados exige a sequência: sem a saída, a devolução seria transição inválida.
  -- (Mesma sequência de `supabase/tests/pendencias_item.sql`; `status_resultante`
  -- é derivado pelo trigger, não se informa.)
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
  values (v_ativo, 'compra', v_f1, k_operador);
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
  values (v_ativo, 'saida', 'Fulano de Teste', v_f1, k_operador);
  insert into public.movimentacoes (ativo_id, tipo, filial_id, itens_faltantes, criado_por)
  values (v_ativo, 'devolucao', v_f1, array['Carregador'], k_operador)
  returning id into v_mov;

  select id into v_pend
    from public.pendencias_item
   where movimentacao_id = v_mov and status = 'aberta'
   limit 1;

  if v_pend is null then
    raise warning '✗ 0 a devolução com itens_faltantes não abriu pendência de item (trigger 0051)';
    return;
  end if;

  -- =========================================================================
  -- 1 — OPERADOR COM VÍNCULO: continua RESOLVENDO (nada quebrou)
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  update public.pendencias_item
     set status = 'resolvida', desfecho = 'recuperado',
         resolvida_em = now(), resolvida_por = k_operador
   where id = v_pend and status = 'aberta';
  get diagnostics v_n = row_count;

  if v_n = 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 1 operador vinculado RESOLVE a pendência (aberta → resolvida)';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 1 operador vinculado NÃO conseguiu resolver (% linhas) — a 0103 fechou demais', v_n;
  end if;

  -- =========================================================================
  -- 2 — OPERADOR COM VÍNCULO: NÃO reabre (é o buraco que a 0103 fecha)
  -- =========================================================================
  update public.pendencias_item
     set status = 'aberta', desfecho = null, observacao = null,
         resolvida_em = null, resolvida_por = null
   where id = v_pend and status = 'resolvida';
  get diagnostics v_n = row_count;

  reset role;
  select status into v_status from public.pendencias_item where id = v_pend;

  if v_n = 0 and v_status = 'resolvida' then
    v_ok := v_ok + 1;
    raise notice '✓ 2 operador vinculado NÃO reabre — a linha continua resolvida';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2 operador REABRIU a pendência (% linhas, status=%) — o gate de cargo vive só na UI', v_n, v_status;
  end if;

  -- =========================================================================
  -- 3 — OPERADOR SEM VÍNCULO NAQUELA FILIAL: também não reabre
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_outro, 'role', 'authenticated')::text, true);

  update public.pendencias_item
     set status = 'aberta', desfecho = null, resolvida_em = null, resolvida_por = null
   where id = v_pend and status = 'resolvida';
  get diagnostics v_n = row_count;

  reset role;
  select status into v_status from public.pendencias_item where id = v_pend;

  if v_n = 0 and v_status = 'resolvida' then
    v_ok := v_ok + 1;
    raise notice '✓ 3 operador de OUTRA filial não reabre';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3 operador de outra filial reabriu (% linhas, status=%)', v_n, v_status;
  end if;

  -- =========================================================================
  -- 4 — NÍVEL ADMINISTRADOR: REABRE (o item que a F28 entregou)
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);

  update public.pendencias_item
     set status = 'aberta', desfecho = null, observacao = null,
         resolvida_em = null, resolvida_por = null
   where id = v_pend and status = 'resolvida';
  get diagnostics v_n = row_count;

  reset role;
  select status into v_status from public.pendencias_item where id = v_pend;

  if v_n = 1 and v_status = 'aberta' then
    v_ok := v_ok + 1;
    raise notice '✓ 4 nível administrador REABRE (resolvida → aberta)';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 4 admin NÃO conseguiu reabrir (% linhas, status=%)', v_n, v_status;
  end if;

  -- =========================================================================
  raise notice '— reabrir_pendencia_item: % ok, % falha(s)', v_ok, v_falhas;
end $$;

rollback;
