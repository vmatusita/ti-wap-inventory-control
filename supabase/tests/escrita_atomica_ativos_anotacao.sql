-- =============================================================================
-- Roteiro de teste: ESCRITA ATÔMICA ativos + anotacoes (Reauditoria 18/09/2026,
-- item U, migration 0149)
--
-- Roda no job `banco-sem-docker` do CI (psql, ON_ERROR_STOP=1) e é auto-verificável no SQL
-- editor / MCP do ENSAIO. Mesmo padrão dos demais roteiros da pasta:
--   NOTICE  '✓ ...'  quando a invariante bate
--   WARNING '✗ ...'  quando NÃO bate (o job falha em qualquer `WARNING: ✗`)
--
-- ESCREVE (usuários, perfis, vínculos e ativos fictícios), então roda inteiro dentro de
-- `begin; … rollback;` — nada sobra no banco. AUTOSSUFICIENTE.
--
-- DADOS 100% FICTÍCIOS (regra 2 do CLAUDE.md): patrimônios `WAP0009201`..`WAP0009212`,
-- nomes/e-mails inventados. Nenhum dado real da WAP.
--
-- COMO SIMULA UM USUÁRIO: `postgres` é superusuário e IGNORA RLS. Cada cenário faz
-- `set local role authenticated` + `set_config('request.jwt.claims', …)`, que é o que o
-- PostgREST monta por request — e é também o que `auth.uid()` lê DENTRO das RPCs (elas não
-- recebem `criado_por` por parâmetro; a garantia é exatamente esta).
--
-- O QUE PROVA (as cinco RPCs da 0149)
--   1. corrigir_patrimonio_com_anotacao — sucesso grava as DUAS coisas na mesma chamada
--      (patrimônio, pendência limpa por sentinela '', e a anotação "de → para")
--   2. corrigir_patrimonio_com_anotacao — duplicata (par patrimônio+service tag já existe
--      na filial) RECUSA com o MESMO índice de sempre (23505,
--      ativos_patrimonio_service_tag_uidx) e NÃO deixa anotação nem toca o patrimônio
--   3. corrigir_patrimonio_com_anotacao — id inexistente RECUSA (P0002) e não anota
--   4. corrigir_patrimonio_com_anotacao — ativo de OUTRA filial (operador sem vínculo)
--      RECUSA (a RLS filtra o UPDATE; 0 linhas ⇒ raise) e não anota
--   5. corrigir_patrimonio_com_anotacao — cargo CONSULTA é recusado (mesmo mecanismo do 4:
--      pode_escrever_filial nega para consulta em qualquer filial)
--   6. definir_service_tag_com_anotacao — sucesso grava as duas coisas
--   7. confirmar_assinatura_termo_com_anotacao — sucesso grava termo_assinado+termo_data e
--      a anotação
--   8. desfazer_confirmacao_termo_com_anotacao — sucesso grava o destino e limpa termo_data
--   9. confirmar_assinatura_lote_com_anotacoes — sucesso: N ativos confirmados, N
--      anotações, uma por ativo, no mesmo comando
--  10. confirmar_assinatura_lote_com_anotacoes — IDEMPOTENTE: um id já 'sim' no meio do
--      lote é ignorado (não é erro), só os pendentes confirmam
--  11. confirmar_assinatura_lote_com_anotacoes — TUDO OU NADA: um id do lote está fora do
--      vínculo de filial de quem chama ⇒ o LOTE INTEIRO recusa, e o que ESTARIA dentro do
--      vínculo também não confirma nem ganha anotação
--  12. p_alterar_pendencia = false NÃO regrava a pendência: "definir service tag" e depois
--      "corrigir patrimônio" no mesmo ativo — a regressão que a revisão adversarial pegou na
--      primeira versão da 0149, que regravava a coluna sempre com o valor lido antes
-- =============================================================================

begin;

-- Privilégios de TABELA para os cenários que fazem `set local role authenticated`.
-- Mesma razão de `papeis_rls.sql` e `f38_itens_com_ativo.sql`: no projeto hospedado estes
-- grants já existem por default privilege (é com eles que o app sempre fez estas duas escritas
-- pela sessão do usuário) e o bloco é no-op; no Postgres NOVO do CI não existem, e o cenário
-- pararia em "permission denied" — resposta certa para a pergunta errada (aqui se mede a
-- POLICY e a atomicidade, não privilégio de tabela). Só a tabela/verbo que as cinco funções
-- `security invoker` usam.
grant select, update on public.ativos to authenticated;    -- o UPDATE (e o RETURNING do lote)
grant select, insert on public.anotacoes to authenticated; -- o INSERT (e o RETURNING do lote)
grant select on public.filiais to authenticated;

do $$
declare
  k_admin      constant uuid := '00000000-0000-0000-0000-0000f6090001';
  k_operador   constant uuid := '00000000-0000-0000-0000-0000f6090002';
  k_outro      constant uuid := '00000000-0000-0000-0000-0000f6090003';
  k_consulta   constant uuid := '00000000-0000-0000-0000-0000f6090004';
  v_f1         smallint;
  v_f2         smallint;
  v_ativo1     uuid;  -- corrigir patrimonio: sucesso
  v_ativo_dup  uuid;  -- corrigir patrimonio: alvo da colisão (par já existe)
  v_ativo2     uuid;  -- corrigir patrimonio: tentativa de colisão
  v_ativo4     uuid;  -- corrigir patrimonio: filial v_f2 (operador sem vínculo / consulta)
  v_ativo_st   uuid;  -- definir service tag: sucesso
  v_ativo12    uuid;  -- p_alterar_pendencia = false preserva a pendência (cenário 12)
  v_ativo_ct   uuid;  -- confirmar assinatura termo: sucesso
  v_ativo_dt   uuid;  -- desfazer confirmacao termo: sucesso
  v_lote_a     uuid;  -- lote: pendente, filial v_f1 (cenário 9)
  v_lote_b     uuid;  -- lote: pendente, filial v_f1 (cenário 9)
  v_lote_c     uuid;  -- lote: pendente, filial v_f1 (cenário 10 — mistura com v_lote_ja)
  v_lote_ja    uuid;  -- lote: já 'sim' (idempotência)
  v_lote_d     uuid;  -- lote: pendente, filial v_f1 (cenário 11 — o que ESTARIA dentro do vínculo)
  v_lote_fora  uuid;  -- lote: filial v_f2 (tudo ou nada)
  v_inexistente constant uuid := '00000000-0000-0000-0000-0000f6099999';
  v_n          int;
  v_ok         int := 0;
  v_falhas     int := 0;
  v_rec        record;
  v_msg        text;
  v_pat        text;
  v_pend       text;
  v_cnt_nota   int;
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

  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (k_admin,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f60u.chefia@wap.ind.br',   '', now(), now(), now()),
    (k_operador, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f60u.operador@wap.ind.br', '', now(), now(), now()),
    (k_outro,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f60u.outrafilial@wap.ind.br', '', now(), now(), now()),
    (k_consulta, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f60u.consulta@wap.ind.br', '', now(), now(), now());

  update public.profiles set papel = 'admin'    where id = k_admin;
  update public.profiles set papel = 'operador' where id = k_operador;
  update public.profiles set papel = 'operador' where id = k_outro;
  update public.profiles set papel = 'consulta' where id = k_consulta;

  -- `k_operador` escreve só em v_f1; `k_outro`, só em v_f2; `k_consulta` em nenhuma.
  insert into public.operador_filiais (usuario_id, filial_id) values
    (k_operador, v_f1),
    (k_outro,    v_f2);

  insert into public.ativos (patrimonio, categoria, filial_id, pendencia)
  values ('WAP0009201', 'notebook', v_f1, 'sem patrimônio físico; termo pendente')
  returning id into v_ativo1;

  -- Sem service tag (NULL em ambos): o índice compara coalesce(service_tag,''), então o par
  -- que colide é (patrimonio, '') — v_ativo_dup fica parado aqui como o "já existe".
  insert into public.ativos (patrimonio, categoria, filial_id)
  values ('WAP0009202', 'notebook', v_f1)
  returning id into v_ativo_dup;

  insert into public.ativos (patrimonio, categoria, filial_id)
  values ('WAP0009203', 'notebook', v_f1)
  returning id into v_ativo2;

  insert into public.ativos (patrimonio, categoria, filial_id)
  values ('WAP0009204', 'notebook', v_f2)
  returning id into v_ativo4;

  insert into public.ativos (patrimonio, categoria, filial_id, pendencia)
  values ('WAP0009205', 'notebook', v_f1, 'sem service tag')
  returning id into v_ativo_st;

  insert into public.ativos (patrimonio, categoria, filial_id)
  values ('WAP0009206', 'notebook', v_f1)
  returning id into v_ativo_ct;

  insert into public.ativos (patrimonio, categoria, filial_id, termo_assinado, termo_data)
  values ('WAP0009207', 'notebook', v_f1, 'sim', current_date)
  returning id into v_ativo_dt;

  insert into public.ativos (patrimonio, categoria, filial_id) values ('WAP0009208', 'notebook', v_f1) returning id into v_lote_a;
  insert into public.ativos (patrimonio, categoria, filial_id) values ('WAP0009209', 'notebook', v_f1) returning id into v_lote_b;
  insert into public.ativos (patrimonio, categoria, filial_id) values ('WAP0009210', 'notebook', v_f1) returning id into v_lote_c;
  insert into public.ativos (patrimonio, categoria, filial_id, termo_assinado) values ('WAP0009211', 'notebook', v_f1, 'sim') returning id into v_lote_ja;
  insert into public.ativos (patrimonio, categoria, filial_id) values ('WAP0009212', 'notebook', v_f1) returning id into v_lote_d;
  insert into public.ativos (patrimonio, categoria, filial_id) values ('WAP0009213', 'notebook', v_f2) returning id into v_lote_fora;

  -- =========================================================================
  -- 1 — corrigir_patrimonio_com_anotacao: SUCESSO (as duas coisas, na mesma chamada)
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  -- Como a action faz: tira "sem patrimônio físico" e sobra "termo pendente" (mudou → true).
  perform public.corrigir_patrimonio_com_anotacao(v_ativo1, 'WAP0009291', 'termo pendente', true, 'Patrimônio corrigido de WAP0009201 para WAP0009291.');

  reset role;
  select patrimonio, pendencia into v_pat, v_pend from public.ativos where id = v_ativo1;
  select count(*) into v_cnt_nota from public.anotacoes
   where ativo_id = v_ativo1 and texto = 'Patrimônio corrigido de WAP0009201 para WAP0009291.';

  if v_pat = 'WAP0009291' and v_pend = 'termo pendente' and v_cnt_nota = 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 1 corrigir_patrimonio: sucesso grava patrimônio + pendência que sobrou + anotação, na mesma chamada';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 1 corrigir_patrimonio sucesso — patrimonio=% pendencia=% notas=%', v_pat, v_pend, v_cnt_nota;
  end if;

  -- =========================================================================
  -- 2 — corrigir_patrimonio_com_anotacao: DUPLICATA (23505) NÃO deixa anotação
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  v_msg := null;
  begin
    -- v_ativo2 (sem service tag) tentando virar o MESMO par que v_ativo_dup já tem
    -- ('WAP0009202' + sem service tag, mesma filial) — o índice
    -- ativos_patrimonio_service_tag_uidx (filial_id, patrimonio, coalesce(service_tag,'')) recusa.
    perform public.corrigir_patrimonio_com_anotacao(v_ativo2, 'WAP0009202', '', true, 'não deveria gravar');
    v_msg := 'NAO_RECUSOU';
  exception when others then
    if sqlstate = '23505' and sqlerrm like '%ativos_patrimonio_service_tag_uidx%' then
      v_msg := 'RECUSOU_INDICE_CERTO';
    else
      v_msg := 'RECUSOU_OUTRO: ' || sqlstate || ' ' || sqlerrm;
    end if;
  end;

  reset role;
  select patrimonio into v_pat from public.ativos where id = v_ativo2;
  select count(*) into v_cnt_nota from public.anotacoes where ativo_id = v_ativo2;

  if v_msg = 'RECUSOU_INDICE_CERTO' and v_pat = 'WAP0009203' and v_cnt_nota = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 2 corrigir_patrimonio: duplicata recusa pelo MESMO índice (23505, ativos_patrimonio_service_tag_uidx) e não anota';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2 corrigir_patrimonio duplicata — msg=% patrimonio=% notas=%', v_msg, v_pat, v_cnt_nota;
  end if;

  -- =========================================================================
  -- 3 — corrigir_patrimonio_com_anotacao: ID INEXISTENTE recusa (P0002), não anota
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  v_msg := null;
  begin
    perform public.corrigir_patrimonio_com_anotacao(v_inexistente, 'WAP0009299', '', true, 'não deveria gravar');
    v_msg := 'NAO_RECUSOU';
  exception when others then
    v_msg := sqlstate;
  end;

  reset role;
  select count(*) into v_cnt_nota from public.anotacoes where ativo_id = v_inexistente;

  if v_msg = 'P0002' and v_cnt_nota = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 3 corrigir_patrimonio: id inexistente recusa (P0002) e não anota';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3 corrigir_patrimonio id inexistente — sqlstate=% notas=%', v_msg, v_cnt_nota;
  end if;

  -- =========================================================================
  -- 4 — corrigir_patrimonio_com_anotacao: ativo de OUTRA filial (sem vínculo) recusa
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  v_msg := null;
  begin
    -- v_ativo4 é da v_f2; k_operador só tem vínculo com v_f1 — a policy de UPDATE
    -- (pode_escrever_filial) filtra a linha, o UPDATE afeta 0, a RPC recusa.
    perform public.corrigir_patrimonio_com_anotacao(v_ativo4, 'WAP0009298', '', true, 'não deveria gravar');
    v_msg := 'NAO_RECUSOU';
  exception when others then
    v_msg := sqlstate;
  end;

  reset role;
  select patrimonio into v_pat from public.ativos where id = v_ativo4;
  select count(*) into v_cnt_nota from public.anotacoes where ativo_id = v_ativo4;

  if v_msg = 'P0002' and v_pat = 'WAP0009204' and v_cnt_nota = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 4 corrigir_patrimonio: operador sem vínculo na filial do ativo recusa (RLS filtrou o UPDATE) e não anota';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 4 corrigir_patrimonio outra filial — sqlstate=% patrimonio=% notas=%', v_msg, v_pat, v_cnt_nota;
  end if;

  -- =========================================================================
  -- 5 — corrigir_patrimonio_com_anotacao: cargo CONSULTA recusa
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_consulta, 'role', 'authenticated')::text, true);

  v_msg := null;
  begin
    perform public.corrigir_patrimonio_com_anotacao(v_ativo4, 'WAP0009297', '', true, 'não deveria gravar');
    v_msg := 'NAO_RECUSOU';
  exception when others then
    v_msg := sqlstate;
  end;

  reset role;
  select count(*) into v_cnt_nota from public.anotacoes where ativo_id = v_ativo4;

  if v_msg = 'P0002' and v_cnt_nota = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 5 corrigir_patrimonio: cargo consulta recusa (pode_escrever_filial nega) e não anota';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 5 corrigir_patrimonio cargo consulta — sqlstate=% notas=%', v_msg, v_cnt_nota;
  end if;

  -- =========================================================================
  -- 6 — definir_service_tag_com_anotacao: SUCESSO
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  perform public.definir_service_tag_com_anotacao(v_ativo_st, 'SVCF60U09', '', true, 'Service tag definida: SVCF60U09.');

  reset role;
  select count(*) into v_cnt_nota from public.anotacoes
   where ativo_id = v_ativo_st and texto = 'Service tag definida: SVCF60U09.';
  select pendencia into v_pend from public.ativos where id = v_ativo_st;

  if (select service_tag from public.ativos where id = v_ativo_st) = 'SVCF60U09'
     and v_pend is null and v_cnt_nota = 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 6 definir_service_tag: sucesso grava service tag + pendência limpa + anotação';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 6 definir_service_tag sucesso — notas=% pendencia=%', v_cnt_nota, v_pend;
  end if;

  -- =========================================================================
  -- 7 — confirmar_assinatura_termo_com_anotacao: SUCESSO
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  perform public.confirmar_assinatura_termo_com_anotacao(v_ativo_ct, '2026-09-18'::date, 'Termo confirmado como assinado (data da assinatura: 18/09/2026).');

  reset role;
  select count(*) into v_cnt_nota from public.anotacoes where ativo_id = v_ativo_ct;

  if (select termo_assinado from public.ativos where id = v_ativo_ct) = 'sim'
     and (select termo_data from public.ativos where id = v_ativo_ct) = '2026-09-18'::date
     and v_cnt_nota = 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 7 confirmar_assinatura_termo: sucesso grava termo_assinado + termo_data + anotação';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 7 confirmar_assinatura_termo sucesso — notas=%', v_cnt_nota;
  end if;

  -- =========================================================================
  -- 8 — desfazer_confirmacao_termo_com_anotacao: SUCESSO
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  perform public.desfazer_confirmacao_termo_com_anotacao(v_ativo_dt, 'nao'::public.termo_status, 'Confirmação de assinatura desfeita — o termo volta a constar como não gerado.');

  reset role;
  select count(*) into v_cnt_nota from public.anotacoes where ativo_id = v_ativo_dt;

  if (select termo_assinado from public.ativos where id = v_ativo_dt) = 'nao'
     and (select termo_data from public.ativos where id = v_ativo_dt) is null
     and v_cnt_nota = 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 8 desfazer_confirmacao_termo: sucesso grava o destino + limpa termo_data + anotação';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 8 desfazer_confirmacao_termo sucesso — notas=%', v_cnt_nota;
  end if;

  -- =========================================================================
  -- 9 — confirmar_assinatura_lote_com_anotacoes: SUCESSO (2 ativos, 2 anotações)
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  v_n := 0;
  for v_rec in
    select * from public.confirmar_assinatura_lote_com_anotacoes(
      array[v_lote_a, v_lote_b], '2026-09-18'::date,
      'Termo confirmado como assinado (data da assinatura: 18/09/2026).')
  loop
    v_n := v_n + 1;
  end loop;

  reset role;
  select count(*) into v_cnt_nota from public.anotacoes
   where ativo_id in (v_lote_a, v_lote_b)
     and texto = 'Termo confirmado como assinado (data da assinatura: 18/09/2026).';

  if v_n = 2
     and (select termo_assinado from public.ativos where id = v_lote_a) = 'sim'
     and (select termo_assinado from public.ativos where id = v_lote_b) = 'sim'
     and v_cnt_nota = 2 then
    v_ok := v_ok + 1;
    raise notice '✓ 9 confirmar_assinatura_lote: sucesso — % ativos confirmados, % anotações', v_n, v_cnt_nota;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 9 confirmar_assinatura_lote sucesso — retornou % linhas, % notas', v_n, v_cnt_nota;
  end if;

  -- =========================================================================
  -- 10 — confirmar_assinatura_lote_com_anotacoes: IDEMPOTENTE (um id já 'sim' no lote)
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  -- v_lote_c está PENDENTE; v_lote_ja já é 'sim' desde a fixture — a mistura prova que o
  -- pendente confirma e o já-confirmado é ignorado em silêncio, os dois no MESMO lote.
  v_n := 0;
  for v_rec in
    select * from public.confirmar_assinatura_lote_com_anotacoes(
      array[v_lote_c, v_lote_ja], '2026-09-18'::date,
      'Termo confirmado como assinado (data da assinatura: 18/09/2026).')
  loop
    v_n := v_n + 1;
  end loop;

  reset role;
  select count(*) into v_cnt_nota from public.anotacoes where ativo_id = v_lote_c;

  if v_n = 1
     and (select termo_assinado from public.ativos where id = v_lote_c) = 'sim'
     and v_cnt_nota = 1
     and not exists (select 1 from public.anotacoes where ativo_id = v_lote_ja) then
    v_ok := v_ok + 1;
    raise notice '✓ 10 confirmar_assinatura_lote: no MESMO lote, o pendente (v_lote_c) confirma e ganha anotação, e o já ''sim'' (v_lote_ja) é ignorado em silêncio — não é erro, não ganha 2ª anotação';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 10 confirmar_assinatura_lote idempotência — retornou % linhas, % notas em v_lote_c', v_n, v_cnt_nota;
  end if;

  -- =========================================================================
  -- 11 — confirmar_assinatura_lote_com_anotacoes: TUDO OU NADA (um id fora do vínculo)
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  v_msg := null;
  begin
    -- v_lote_d (v_f1, dentro do vínculo, ainda PENDENTE) + v_lote_fora (v_f2, fora do
    -- vínculo de k_operador).
    perform public.confirmar_assinatura_lote_com_anotacoes(
      array[v_lote_d, v_lote_fora], '2026-09-18'::date,
      'não deveria gravar');
    v_msg := 'NAO_RECUSOU';
  exception when others then
    v_msg := sqlstate;
  end;

  reset role;
  select count(*) into v_cnt_nota from public.anotacoes
   where ativo_id in (v_lote_d, v_lote_fora) and texto = 'não deveria gravar';

  if v_msg = '42501'
     and (select termo_assinado from public.ativos where id = v_lote_d) is null
     and (select termo_assinado from public.ativos where id = v_lote_fora) is null
     and v_cnt_nota = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 11 confirmar_assinatura_lote: um id fora do vínculo recusa o LOTE INTEIRO (nem o elegível confirma) e não anota nada';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 11 confirmar_assinatura_lote tudo-ou-nada — sqlstate=% notas=% lote_d_status=% lote_fora_status=%',
      v_msg, v_cnt_nota,
      (select termo_assinado from public.ativos where id = v_lote_d),
      (select termo_assinado from public.ativos where id = v_lote_fora);
  end if;

  -- =========================================================================
  raise notice '— escrita_atomica_ativos_anotacao: % ok, % falha(s)', v_ok, v_falhas;
  -- =========================================================================
  -- 12 — p_alterar_pendencia = false NÃO regrava a pendência (a regressão da revisão)
  -- =========================================================================
  -- "Definir service tag" limpa "sem service tag" da pendência; logo depois, "corrigir
  -- patrimônio" chega com a pendência que ELE leu antes (a velha) e sem mudança própria
  -- (false). A primeira versão da 0149 regravava sempre, e devolvia "sem service tag" à ficha.
  insert into public.ativos (patrimonio, categoria, filial_id, pendencia)
  values ('WAP0009214', 'notebook', v_f1, 'sem service tag; termo pendente')
  returning id into v_ativo12;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);
  perform public.definir_service_tag_com_anotacao(v_ativo12, 'SVCREAUD12', 'termo pendente', true, 'Service tag definida: SVCREAUD12.');
  perform public.corrigir_patrimonio_com_anotacao(v_ativo12, 'WAP0009294', 'sem service tag; termo pendente', false, 'Patrimônio corrigido de WAP0009214 para WAP0009294.');
  reset role;

  select patrimonio, pendencia into v_pat, v_pend from public.ativos where id = v_ativo12;
  select count(*) into v_cnt_nota from public.anotacoes where ativo_id = v_ativo12;
  if v_pat = 'WAP0009294' and v_pend = 'termo pendente' and v_cnt_nota = 2 then
    v_ok := v_ok + 1;
    raise notice '✓ 12 p_alterar_pendencia=false preserva a pendência que outra escrita acabou de gravar';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 12 patrimonio=% pendencia=% notas=% — esperava WAP0009294 / termo pendente / 2', v_pat, v_pend, v_cnt_nota;
  end if;

  raise notice 'FIM escrita_atomica_ativos_anotacao: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
