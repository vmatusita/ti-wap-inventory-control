-- =============================================================
-- Roteiro de teste: O ISOLAMENTO DO VISUALIZADOR POR SENHA (F68, 19/11/2026)
-- =============================================================
-- POR QUE ESTE ROTEIRO SÓ PASSOU A SER TESTÁVEL AGORA
--
-- Até a F68, quem entrava por senha de visualização recebia o client ADMINISTRATIVO (service role, `rolbypassrls`):
-- `resolverAcessoRelatorio()` devolvia `createAdminClient()`, e as queries de relatório rodavam com ele. Um roteiro SQL
-- sobre aquele caminho seria uma coleção de `✓` VAZIOS — o service role passa por cima de RLS, FK composta e guarda, e o
-- único muro era o CÓDIGO TypeScript das queries (o tripwire `fronteira-viewer.test.ts` dizia isso com todas as letras).
-- Um `✓` aqui naquela época seria falsa segurança.
--
-- Desde a F68 o visualizador fala SÓ por duas funções, como `anon`: `relatorio_publico_abrir` (a senha conferida DENTRO
-- do banco, bcrypt) e `relatorio_publico_dados` (a sessão → a empresa, por dentro; a lista branca). A porta passou a ser
-- do BANCO — e é por isso que este roteiro pode, enfim, provar o isolamento: cada asserção abaixo chama as funções como
-- `anon` (a identidade da chave pública), exatamente como o PostgREST faria.
--
-- O QUE ELE PROVA (a decisão 16 da ordem da F68):
--   V1  duas empresas com a MESMA senha em claro coexistem, e cada uma abre só a sua;
--   V2  a senha de A no slug de B é recusada;
--   V3  as cinco recusas (sem senha, senha errada, senha revogada, slug inexistente, senha de A no slug de B) devolvem
--       EXATAMENTE a mesma resposta;
--   V4  a sessão: só o sha-256 do token no banco; a resposta de abrir só leva {ok, sessao};
--   V5  a DIAGONAL: a sessão de A em dados com o slug de B é recusada (recusa "empresa");
--   V6  a senha revogada mata a sessão na chamada seguinte; a vencida e a encerrada são recusadas;
--   V7  hash scrypt (as senhas de antes da F68) nunca abre;
--   V8  nenhuma chave de pessoa em NENHUMA resposta (o jsonb percorrido), com gerados V2 e V1 que TÊM as chaves;
--   V9  o contador: por (empresa, origem), e o teto por EMPRESA com origens forjadas em laço;
--   V10 a gestão por empresa: admin de A não cria, não confere, não revoga em B; quem não é admin não faz nada; o teto, os
--       72 bytes e a repetida na mesma empresa;
--   V11 um pedido fora da lista fechada é recusado.
--
-- Tudo dentro de `begin; … rollback;`. As empresas, as pessoas e as senhas são FICTÍCIAS (regra 2). As senhas de fixture
-- são criadas pela própria função de gestão (bcrypt custo 10) — o roteiro é lento de propósito: o custo é o da porta.
-- =============================================================

begin;

-- conta de autor das fixtures (o mesmo e-mail do runner; idempotente)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'ci@wap.ind.br', '',
       now(), now(), now()
 where not exists (select 1 from auth.users where email = 'ci@wap.ind.br');

-- chamar como uma pessoa (authenticated + claims) e devolver o SQLSTATE (00000 = passou)
create function pg_temp.f68_estado_como(p_uid uuid, p_sql text) returns text
language plpgsql as $f$
declare v text;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    execute p_sql;
    v := '00000';
  exception when others then
    v := sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $f$;

-- o valor (texto) que uma chamada devolve como uma pessoa
create function pg_temp.f68_valor_como(p_uid uuid, p_sql text) returns text
language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute p_sql into v;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $f$;

-- as duas portas COMO anon (a identidade da chave pública)
create function pg_temp.f68_abrir(p_slug text, p_senha text, p_origem text) returns jsonb
language plpgsql as $f$
declare r jsonb;
begin
  execute 'set local role anon';
  r := public.relatorio_publico_abrir(p_slug, p_senha, p_origem);
  execute 'reset role';
  return r;
end $f$;

create function pg_temp.f68_dados(p_sessao text, p_slug text, p_pedido text, p_args jsonb) returns jsonb
language plpgsql as $f$
declare r jsonb;
begin
  execute 'set local role anon';
  r := public.relatorio_publico_dados(p_sessao, p_slug, p_pedido, p_args);
  execute 'reset role';
  return r;
end $f$;

-- todas as CHAVES de um jsonb, em qualquer profundidade
create function pg_temp.f68_chaves(p jsonb) returns setof text
language sql as $f$
  with recursive n(v) as (
    select p
    union all
    select x.v from n, lateral (
      select e.value from jsonb_each(case when jsonb_typeof(n.v) = 'object' then n.v else '{}'::jsonb end) e
      union all
      select a.value from jsonb_array_elements(case when jsonb_typeof(n.v) = 'array' then n.v else '[]'::jsonb end) a
    ) x(v)
  )
  select e.key from n, jsonb_each(case when jsonb_typeof(n.v) = 'object' then n.v else '{}'::jsonb end) e
$f$;

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;
  v_cnt    bigint;
  v_univ   bigint;
  v_lista  text;
  -- as chaves que NUNCA saem pela porta (pessoa, quem gerou, ids internos)
  k_proibidas constant text[] := array['colaboradorSetor', 'colaborador', 'setor', 'autor', 'colaborador_setor',
    'autorNome', 'gerado_por', 'criado_por', 'ativoId', 'empresa_id', 'filial_id', 'senha_id', 'hash', 'token_hash'];
  k_recusa constant jsonb := '{"ok": false}'::jsonb;
  v_autor   uuid;
  v_adm_a   uuid := gen_random_uuid();
  v_adm_b   uuid := gen_random_uuid();
  v_op_a    uuid := gen_random_uuid();
  v_a       uuid := public.empresa_legada();
  v_b       uuid;
  v_slug_a  text;
  v_slug_b  text := 'f68-ficticia-b';
  v_senha_a uuid;
  v_senha_b uuid;
  v_senha_a2 uuid;
  v_scrypt  uuid;
  v_r       jsonb;
  v_t_a     text;
  v_t_b     text;
  v_t_rev   text;
  v_t       text;
  v_estado  text;
  v_rec     jsonb[] := '{}';
  v_respostas jsonb[] := '{}';
  v_g2      uuid;
  v_g1      uuid;
  v_n       int;
  i         int;
begin
  select id into v_autor from auth.users where email = 'ci@wap.ind.br';
  select slug into v_slug_a from public.empresas where id = v_a;

  -- ----- fixture: a empresa B fictícia, os admins de cada uma, um operador (não admin) de A -----
  insert into public.empresas (slug, nome) values (v_slug_b, 'Fictícia B (F68)') returning id into v_b;
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (v_adm_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f68.adm.a@wap.ind.br', '', now(), now(), now()),
         (v_adm_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f68.adm.b@wap.ind.br', '', now(), now(), now()),
         (v_op_a,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f68.op.a@wap.ind.br',  '', now(), now(), now());
  perform pg_temp.plantar_cargo(v_adm_a, 'admin');
  perform pg_temp.plantar_cargo(v_adm_b, 'consulta');               -- na A, só consulta
  perform pg_temp.plantar_cargo(v_adm_b, 'admin', true, v_b);       -- admin da B
  perform pg_temp.plantar_cargo(v_op_a, 'operador');

  -- ==========================================================================
  -- V10 — a GESTÃO por empresa (e as senhas das fixtures nascem por ela)
  -- ==========================================================================
  v_senha_a := pg_temp.f68_valor_como(v_adm_a,
    format('select public.senha_acesso_criar(%L, %L, %L)', v_a, 'Gestores A (F68)', 'senha-igual-nas-duas'))::uuid;
  v_senha_b := pg_temp.f68_valor_como(v_adm_b,
    format('select public.senha_acesso_criar(%L, %L, %L)', v_b, 'Gestores B (F68)', 'senha-igual-nas-duas'))::uuid;

  select count(*) filter (where e is distinct from x), count(*) into v_cnt, v_univ
    from (values
      (pg_temp.f68_estado_como(v_adm_a, format('select public.senha_acesso_criar(%L, %L, %L)', v_b, 'Intrusa', 'outra-senha-1')), '42501'),
      (pg_temp.f68_estado_como(v_adm_a, format('select public.senha_acesso_conferir(%L, %L, %L)', v_b, v_senha_b, 'senha-igual-nas-duas')), '42501'),
      (pg_temp.f68_estado_como(v_adm_a, format('select public.senha_acesso_definir_status(%L, %L, false)', v_b, v_senha_b)), '42501'),
      (pg_temp.f68_estado_como(v_adm_a, format('select public.senha_acesso_definir_status(%L, %L, false)', v_a, v_senha_b)), 'P0002'),
      (pg_temp.f68_estado_como(v_adm_a, format('select public.senha_acesso_conferir(%L, %L, %L)', v_a, v_senha_b, 'x')), 'P0002'),
      (pg_temp.f68_estado_como(v_op_a,  format('select public.senha_acesso_criar(%L, %L, %L)', v_a, 'Do operador', 'outra-senha-2')), '42501'),
      (pg_temp.f68_estado_como(v_op_a,  format('select public.senha_acesso_conferir(%L, %L, %L)', v_a, v_senha_a, 'x')), '42501'),
      (pg_temp.f68_estado_como(v_op_a,  format('select public.senha_acesso_definir_status(%L, %L, false)', v_a, v_senha_a)), '42501'),
      (pg_temp.f68_estado_como(v_adm_a, format('select public.senha_acesso_criar(%L, %L, %L)', v_a, 'Repetida', 'senha-igual-nas-duas')), '23505'),
      (pg_temp.f68_estado_como(v_adm_a, format('select public.senha_acesso_criar(%L, %L, %L)', v_a, 'Longa', repeat('é', 37))), '22023'),
      (pg_temp.f68_estado_como(v_adm_a, format('select public.senha_acesso_criar(%L, %L, %L)', v_a, 'Curta', 'curta7c')), '22023')
    ) as t(e, x);
  if pg_temp.assert_zero_de('V10a admin de A não cria, não confere, não revoga em B; não-admin não faz nada; a repetida na mesma empresa e a de mais de 72 bytes são recusadas',
       v_cnt, v_univ) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- conferir: confere / não confere / a scrypt é "formato antigo"
  insert into public.senhas_acesso (empresa_id, rotulo, hash, ativa, criado_por)
  values (v_a, 'Antiga scrypt (F68)', 'scrypt$00112233445566778899aabbccddeeff$' || repeat('ab', 64), true, v_autor)
  returning id into v_scrypt;
  select count(*) filter (where e is distinct from x), count(*) into v_cnt, v_univ
    from (values
      (pg_temp.f68_valor_como(v_adm_a, format('select public.senha_acesso_conferir(%L, %L, %L)', v_a, v_senha_a, 'senha-igual-nas-duas')), 'confere'),
      (pg_temp.f68_valor_como(v_adm_a, format('select public.senha_acesso_conferir(%L, %L, %L)', v_a, v_senha_a, 'outra')), 'nao_confere'),
      (pg_temp.f68_valor_como(v_adm_a, format('select public.senha_acesso_conferir(%L, %L, %L)', v_a, v_scrypt, 'qualquer')), 'formato_antigo')
    ) as t(e, x);
  if pg_temp.assert_zero_de('V10b conferir responde confere / nao_confere, e a senha scrypt responde formato_antigo sem conferir nada',
       v_cnt, v_univ) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- o teto: a A já tem 1 ativa bcrypt; mais 4 cabem, a 6ª não
  -- (pelo f68_estado_como: uma mutação que deixe outra senha nascer antes não pode ABORTAR o roteiro — tem de virar ✗)
  for i in 2 .. 5 loop
    perform pg_temp.f68_estado_como(v_adm_a,
      format('select public.senha_acesso_criar(%L, %L, %L)', v_a, 'Teto ' || i, 'senha-do-teto-' || i));
  end loop;
  v_estado := pg_temp.f68_estado_como(v_adm_a, format('select public.senha_acesso_criar(%L, %L, %L)', v_a, 'Sexta', 'senha-do-teto-6'));
  select count(*) into v_n from public.senhas_acesso where empresa_id = v_a and ativa and hash like '$2%';
  if pg_temp.assert_zero_de('V10c o teto: no máximo 5 senhas ativas bcrypt por empresa (a 6ª é recusada com 54000)',
       (v_estado <> '54000')::int + (v_n <> 5)::int, 2) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- abre espaço para a revogação adiante (revoga a "Teto 5" pela própria função)
  select id into v_senha_a2 from public.senhas_acesso where empresa_id = v_a and rotulo = 'Teto 5';
  perform pg_temp.f68_estado_como(v_adm_a, format('select public.senha_acesso_definir_status(%L, %L, false)', v_a, v_senha_a2));

  -- ==========================================================================
  -- V1 — a mesma senha em claro nas duas empresas: cada uma abre só a sua
  -- ==========================================================================
  v_r := pg_temp.f68_abrir(v_slug_a, 'senha-igual-nas-duas', '10.0.0.1');
  v_t_a := v_r ->> 'sessao';
  v_r := pg_temp.f68_abrir(v_slug_b, 'senha-igual-nas-duas', '10.0.0.1');
  v_t_b := v_r ->> 'sessao';
  select count(*) into v_cnt from (values
      ((select count(*) from public.sessoes_visualizador s where s.token_hash = extensions.digest(coalesce(v_t_a, ''), 'sha256')
          and s.empresa_id = v_a and s.senha_id = v_senha_a) <> 1),
      ((select count(*) from public.sessoes_visualizador s where s.token_hash = extensions.digest(coalesce(v_t_b, ''), 'sha256')
          and s.empresa_id = v_b and s.senha_id = v_senha_b) <> 1)
    ) as t(ruim) where ruim;
  if pg_temp.assert_zero_de('V1 a mesma senha em claro nas duas empresas coexiste, e cada slug abre a sessão da senha DELE',
       v_cnt, 2) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- V2 + V3 — as cinco recusas: a mesma resposta
  -- ==========================================================================
  -- a senha revogada: a "Teto 5" da A (revogada acima)
  v_rec := array[
    pg_temp.f68_abrir(v_slug_a, '', '10.0.0.2'),                         -- sem senha
    pg_temp.f68_abrir(v_slug_a, 'senha-errada-qualquer', '10.0.0.2'),    -- senha errada
    pg_temp.f68_abrir(v_slug_a, 'senha-do-teto-5', '10.0.0.2'),          -- senha revogada
    pg_temp.f68_abrir('f68-slug-que-nao-existe', 'senha-do-teto-2', '10.0.0.2'), -- slug inexistente
    pg_temp.f68_abrir(v_slug_b, 'senha-do-teto-2', '10.0.0.2')           -- senha de A no slug de B
  ];
  select count(*) into v_cnt from unnest(v_rec) r where r is distinct from k_recusa;
  if pg_temp.assert_zero_de('V3 as cinco recusas (sem senha, errada, revogada, slug inexistente, senha de A no slug de B) devolvem EXATAMENTE {"ok": false}',
       v_cnt, 5) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('V2 a senha de A no slug de B é recusada (e não abriu sessão nenhuma na B)',
       (v_rec[5] is distinct from k_recusa)::int
       + (select count(*) from public.sessoes_visualizador s where s.empresa_id = v_b and s.senha_id <> v_senha_b)::int, 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- V4 — a sessão: só o hash no banco; abrir só devolve {ok, sessao}
  -- ==========================================================================
  v_r := pg_temp.f68_abrir(v_slug_a, 'senha-do-teto-3', '10.0.0.3');
  select count(*) into v_cnt from (values
      ((select array_agg(k order by k) from jsonb_object_keys(v_r) k) is distinct from array['ok', 'sessao']),
      (coalesce(length(v_r ->> 'sessao'), 0) <> 64),
      (exists (select 1 from public.sessoes_visualizador s where to_jsonb(s)::text like '%' || (v_r ->> 'sessao') || '%')),
      (not exists (select 1 from public.sessoes_visualizador s where s.token_hash = extensions.digest(v_r ->> 'sessao', 'sha256')
                     and s.vence_em = now() + interval '24 hours'))
    ) as t(ruim) where ruim;
  if pg_temp.assert_zero_de('V4 a sessão: abrir devolve só {ok, sessao} (token de 64 hex), o banco guarda só o sha-256 (o token não aparece em linha nenhuma) e vence em 24 h',
       v_cnt, 4) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- V5 — a DIAGONAL
  -- ==========================================================================
  select count(*) into v_cnt from (values
      (pg_temp.f68_dados(v_t_a, v_slug_b, 'sessao', null) is distinct from '{"ok": false, "recusa": "empresa"}'::jsonb),
      (pg_temp.f68_dados(v_t_a, v_slug_b, 'gerados', '{}'::jsonb) is distinct from '{"ok": false, "recusa": "empresa"}'::jsonb),
      (pg_temp.f68_dados(v_t_b, v_slug_a, 'gerados', '{}'::jsonb) is distinct from '{"ok": false, "recusa": "empresa"}'::jsonb),
      (pg_temp.f68_dados(v_t_a, 'f68-slug-que-nao-existe', 'sessao', null) is distinct from '{"ok": false, "recusa": "empresa"}'::jsonb),
      ((pg_temp.f68_dados(v_t_a, v_slug_a, 'sessao', null) -> 'sessao' -> 'empresa' ->> 'slug') is distinct from v_slug_a)
    ) as t(ruim) where ruim;
  if pg_temp.assert_zero_de('V5 a diagonal: a sessão de A com o slug de B (ou de slug inexistente) é recusada como "empresa"; com o slug dela, abre',
       v_cnt, 5) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- V8 — a minimização: gerados V2 e V1 que TÊM as chaves de pessoa
  -- ==========================================================================
  insert into public.relatorios_gerados (empresa_id, filial_id, periodo_de, periodo_ate, versao, gerado_por, observacao, dados)
  values (v_a, null, '2001-01-01', '2001-01-07', 1, v_autor, 'Observação fictícia', jsonb_build_object(
    'meta', jsonb_build_object('filialSlug', 'geral', 'filialNome', 'Consolidado', 'ehGeral', true, 'de', '2001-01-01',
                               'ate', '2001-01-07', 'periodoRotulo', 'F68', 'schema', 2, 'observacao', 'texto livre'),
    'saidas', jsonb_build_array(jsonb_build_object('id', 'm1', 'data', '2001-01-02', 'patrimonio', 'WAP0001234',
       'colaboradorSetor', 'Fulano de Tal', 'ativoId', 'a1', 'obs', null, 'chamado', 'CH-1')),
    'entradas', jsonb_build_array(jsonb_build_object('id', 'm2', 'data', '2001-01-03', 'patrimonio', 'WAP0001235',
       'colaborador', 'Fulano de Tal', 'setor', 'Setor X', 'ativoId', 'a2', 'itensFaltantes', jsonb_build_array('mouse'))),
    'transferencias', jsonb_build_array(jsonb_build_object('id', 'm3', 'ativoId', 'a3', 'de', 'X', 'para', 'Y')),
    'movimentacoesItens', jsonb_build_array(jsonb_build_object('id', 'l1', 'colaborador', 'Fulano de Tal', 'item', 'Mouse')),
    'manutencao', jsonb_build_array(jsonb_build_object('patrimonio', 'WAP0001236', 'ativoId', 'a4',
       'anotacoes', jsonb_build_array(jsonb_build_object('texto', 'anotação', 'autor', 'Fulano de Tal', 'em', '2001-01-04')))),
    'grupos', jsonb_build_array(jsonb_build_object('grupo', 'perifericos', 'colaborador', 'intruso aninhado',
       'itens', jsonb_build_array(jsonb_build_object('item', 'Mouse', 'obs', 'x', 'autor', 'intruso'))))
  )) returning id into v_g2;
  insert into public.relatorios_gerados (empresa_id, filial_id, periodo_de, periodo_ate, versao, gerado_por, dados)
  values (v_a, null, '2001-01-08', '2001-01-14', 1, v_autor, jsonb_build_object(
    'meta', jsonb_build_object('filialSlug', 'geral', 'filialNome', 'Consolidado', 'ehGeral', true, 'de', '2001-01-08',
                               'ate', '2001-01-14', 'periodoRotulo', 'F68 v1'),
    'ultimasMovimentacoes', jsonb_build_array(jsonb_build_object('id', 'm9', 'patrimonio', 'WAP0001237',
       'colaborador_setor', 'Fulano de Tal', 'observacao', 'texto'))
  )) returning id into v_g1;
  -- um gerado da B: a sessão de A nunca o vê
  insert into public.relatorios_gerados (empresa_id, filial_id, periodo_de, periodo_ate, versao, gerado_por, dados)
  values (v_b, null, '2001-01-01', '2001-01-07', 1, v_autor, '{"meta": {"filialSlug": "geral"}}'::jsonb);

  v_respostas := array[
    pg_temp.f68_dados(null, v_slug_a, 'porta', null),
    pg_temp.f68_dados(v_t_a, v_slug_a, 'sessao', null),
    pg_temp.f68_dados(v_t_a, v_slug_a, 'gerados', '{"pagina": 1}'::jsonb),
    pg_temp.f68_dados(v_t_a, v_slug_a, 'gerados', '{"pagina": 1, "filiais": ["geral"]}'::jsonb),
    pg_temp.f68_dados(v_t_a, v_slug_a, 'gerado', jsonb_build_object('id', v_g2)),
    pg_temp.f68_dados(v_t_a, v_slug_a, 'gerado', jsonb_build_object('id', v_g1))
  ];
  select count(*), coalesce(string_agg(distinct k, ', '), '') into v_cnt, v_lista
    from unnest(v_respostas) r, pg_temp.f68_chaves(r) k
   where k = any (k_proibidas);
  select count(*) into v_univ from unnest(v_respostas) r, pg_temp.f68_chaves(r) k;
  if pg_temp.assert_zero_de('V8a nenhuma chave de pessoa nem id interno em NENHUMA resposta de dados (porta, sessao, gerados, gerado V2 e V1)' ||
       case when v_cnt > 0 then ' — vazou: ' || v_lista else '' end, v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- e o conteúdo que DEVE sair, sai (a projeção não esvaziou tudo)
  select count(*) into v_cnt from (values
      ((v_respostas[5] -> 'gerado' -> 'dados' -> 'saidas' -> 0 ->> 'patrimonio') is distinct from 'WAP0001234'),
      ((v_respostas[5] -> 'gerado' -> 'dados' -> 'manutencao' -> 0 -> 'anotacoes' -> 0 ->> 'texto') is distinct from 'anotação'),
      ((v_respostas[5] -> 'gerado' -> 'dados' -> 'entradas' -> 0 -> 'itensFaltantes' ->> 0) is distinct from 'mouse'),
      ((v_respostas[6] -> 'gerado' -> 'dados' -> 'ultimasMovimentacoes' -> 0 ->> 'patrimonio') is distinct from 'WAP0001237'),
      ((v_respostas[3] ->> 'total')::int is distinct from (select count(*) from public.relatorios_gerados g where g.empresa_id = v_a)::int),
      ((select bool_and((l ->> 'temObservacao')::boolean is not null) from jsonb_array_elements(v_respostas[3] -> 'linhas') l) is not true)
    ) as t(ruim) where ruim;
  if pg_temp.assert_zero_de('V8b o que a lista branca deixa sair, sai: patrimônio, texto da anotação, itens faltantes, o V1, e a lista só com os gerados da empresa da sessão',
       v_cnt, 6) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- o gerado de OUTRA empresa: recusa, como inexistente
  if pg_temp.assert_zero_de('V8c o gerado de outra empresa responde como inexistente (recusa "gerado")',
       (pg_temp.f68_dados(v_t_b, v_slug_b, 'gerado', jsonb_build_object('id', v_g2))
          is distinct from '{"ok": false, "recusa": "gerado"}'::jsonb)::int, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- V11 — a lista fechada de pedidos
  -- ==========================================================================
  select count(*) into v_cnt from (values
      (pg_temp.f68_dados(v_t_a, v_slug_a, 'senhas', null)),
      (pg_temp.f68_dados(v_t_a, v_slug_a, 'ao_vivo', null)),
      (pg_temp.f68_dados(v_t_a, v_slug_a, null, null)),
      (pg_temp.f68_dados(v_t_a, v_slug_a, 'GERADOS', null))
    ) as t(r) where r is distinct from '{"ok": false, "recusa": "sessao"}'::jsonb;
  if pg_temp.assert_zero_de('V11 pedido fora da lista fechada (porta, sessao, gerados, gerado, encerrar) é recusado',
       v_cnt, 4) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- V6 — revogada, vencida, encerrada
  -- ==========================================================================
  v_t_rev := pg_temp.f68_abrir(v_slug_a, 'senha-do-teto-4', '10.0.0.4') ->> 'sessao';
  v_estado := (pg_temp.f68_dados(v_t_rev, v_slug_a, 'sessao', null) ->> 'ok');   -- viva antes
  select id into v_senha_a2 from public.senhas_acesso where empresa_id = v_a and rotulo = 'Teto 4';
  perform pg_temp.f68_valor_como(v_adm_a, format('select public.senha_acesso_definir_status(%L, %L, false)', v_a, v_senha_a2));
  if pg_temp.assert_zero_de('V6a a senha revogada mata a sessão na chamada seguinte',
       (v_estado is distinct from 'true')::int
       + (pg_temp.f68_dados(v_t_rev, v_slug_a, 'sessao', null) is distinct from '{"ok": false, "recusa": "sessao"}'::jsonb)::int,
       2) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  v_t := pg_temp.f68_abrir(v_slug_a, 'senha-do-teto-2', '10.0.0.5') ->> 'sessao';
  update public.sessoes_visualizador
     set criada_em = now() - interval '2 days', vence_em = now() - interval '1 day'
   where token_hash = extensions.digest(v_t, 'sha256');
  v_estado := pg_temp.f68_dados(v_t, v_slug_a, 'sessao', null)::text;
  v_r := pg_temp.f68_dados(v_t_b, v_slug_b, 'encerrar', null);
  if pg_temp.assert_zero_de('V6b a sessão vencida (no banco) e a encerrada (Sair) são recusadas',
       (v_estado is distinct from '{"ok": false, "recusa": "sessao"}')::int
       + (v_r is distinct from '{"ok": true}'::jsonb)::int
       + (pg_temp.f68_dados(v_t_b, v_slug_b, 'gerados', '{}'::jsonb) is distinct from '{"ok": false, "recusa": "sessao"}'::jsonb)::int
       + (pg_temp.f68_dados('token-inventado', v_slug_a, 'sessao', null) is distinct from '{"ok": false, "recusa": "sessao"}'::jsonb)::int,
       4) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- V7 — scrypt nunca abre (a linha scrypt da fixture "casa" com a senha digitada pelo formato antigo; a porta não a lê)
  -- ==========================================================================
  if pg_temp.assert_zero_de('V7 hash scrypt (as senhas de antes da F68) nunca abre sessão',
       (pg_temp.f68_abrir(v_slug_a, 'qualquer', '10.0.0.6') is distinct from k_recusa)::int
       + (select count(*) from public.sessoes_visualizador s where s.senha_id = v_scrypt)::int, 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- V9 — o contador
  -- ==========================================================================
  -- (a) por (empresa, origem): 5 por janela; a 6ª da MESMA origem recusa "tentativas" — mesmo com a senha CERTA
  for i in 1 .. 5 loop
    v_r := pg_temp.f68_abrir(v_slug_b, 'errada-' || i, '10.9.9.9');
  end loop;
  v_r := pg_temp.f68_abrir(v_slug_b, 'senha-igual-nas-duas', '10.9.9.9');
  if pg_temp.assert_zero_de('V9a o contador por (empresa, origem): a 6ª tentativa da mesma origem na janela recusa "tentativas", mesmo com a senha certa',
       (v_r is distinct from '{"ok": false, "recusa": "tentativas"}'::jsonb)::int, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- (b) o teto por EMPRESA com origens forjadas em laço: a janela da B já tem N; completa até 20 com origens novas
  select tentativas into v_n from public.porta_tentativas where chave = 'empresa:' || v_b::text;
  update public.porta_tentativas set tentativas = 18 where chave = 'empresa:' || v_b::text;
  select count(*) into v_univ from public.porta_tentativas where chave like 'origem:' || v_b::text || ':%';
  v_rec := '{}';
  for i in 1 .. 3 loop
    v_rec := v_rec || pg_temp.f68_abrir(v_slug_b, 'senha-igual-nas-duas', 'forjada-' || i);
  end loop;
  select count(*) into v_cnt from (values
      (v_rec[1] ->> 'ok' is distinct from 'true'),
      (v_rec[2] ->> 'ok' is distinct from 'true'),
      (v_rec[3] is distinct from '{"ok": false, "recusa": "tentativas"}'::jsonb),
      ((select count(*) from public.porta_tentativas where chave like 'origem:' || v_b::text || ':%') <> v_univ + 2)
    ) as t(ruim) where ruim;
  if pg_temp.assert_zero_de('V9b o teto por EMPRESA: origens forjadas em laço esbarram na 21ª tentativa da janela (mesmo com a senha certa), e a origem estourada nem é gravada',
       v_cnt, 4) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- (c) e o teto de uma empresa não tranca a outra
  if pg_temp.assert_zero_de('V9c o teto da B não tranca a porta da A',
       ((pg_temp.f68_abrir(v_slug_a, 'senha-do-teto-3', 'forjada-a') ->> 'ok') is distinct from 'true')::int, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- (d) slug inexistente: um balde só
  select count(*) into v_cnt from public.porta_tentativas
   where chave like 'empresa:%' and chave not in ('empresa:' || v_a::text, 'empresa:' || v_b::text, 'empresa:inexistente');
  if pg_temp.assert_zero_de('V9d slug inexistente conta num balde único (empresa:inexistente) — a tabela não cresce com slugs inventados',
       v_cnt, (select count(*) from public.porta_tentativas where chave like 'empresa:%')) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM isolamento_viewer: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
