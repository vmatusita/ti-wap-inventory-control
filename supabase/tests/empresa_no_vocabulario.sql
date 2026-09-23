-- =============================================================
-- Roteiro de teste: `empresa_id` NO VOCABULÁRIO E NA INFRA — o lote 2 (F64, 23/09/2026)
-- =============================================================
-- A F64 põe `empresa_id uuid not null default public.empresa_legada() references
-- public.empresas (id)` nas ONZE tabelas de `k_lote2` (0162 o vocabulário, 0163 os registros) —
-- SEM update de backfill. A FORMA da coluna é conferida pelo catálogo no bloco 5 de
-- `catalogo_policies.sql` (15d–15j); o kit e a 13ª checagem, em `kit_motivo_da_empresa.sql`; o
-- rollback, em `f64_rollback.sql`. Este roteiro prova o COMPORTAMENTO, numa transação desfeita,
-- com dado 100% fictício:
--
--   1 — o default vale (sabotagem E): um INSERT SEM `empresa_id` em cada uma das onze recebe
--       `public.empresa_legada()`; e toda linha das onze tem a coluna preenchida com ela. (E os
--       roteiros que já inseriam nas onze — fato 8 — continuam verdes SEM uma edição.)
--   2 — a FK vale (sabotagem E): empresa INEXISTENTE leva 23503 nas onze — e, de volta como
--       `postgres`, nenhuma linha com ela ficou (a recusa provada duas vezes);
--   3 — a armadilha (fato 7): aqui NADA barra o `update … set empresa_id` ingênuo — em `motivos`
--       (PK natural) e em `eventos_admin` (a trilha) ele PASSA e reescreve cada linha: o
--       relfilenode fica igual e o md5 de (pk, xmin) muda. Provado numa subtransação e desfeito:
--       é por isso que o `xmin` é a prova de que a 0162/0163 não tiveram update;
--   4 — o instrumento na PK NATURAL (sabotagem B): numa fixture de PK `text`, o default VOLÁTIL
--       troca o relfilenode e o da fase não (atthasmissing); um update de UMA linha, numa
--       subtransação, deixa o relfilenode igual e MUDA o md5 de (pk, xmin) — a PK lida do
--       catálogo, a mesma expressão de docs/f64-evidencias/impressao-vocabulario.sql; e o
--       instrumento lê a PK do catálogo nas QUATRO tabelas sem `id` (chave nunca nula, uma por
--       linha). ⚠ A subtransação importa: ela tem xid próprio;
--   5 — nenhum escritor mudou (sabotagem I): o corpo (`prosrc`) das 9 funções que escrevem nas
--       onze e de `registrar_tentativa_senha` é o das migrations de ANTES da F64 (o md5 de cada um,
--       calculado do arquivo vigente — o texto que o CI aplica), e nenhuma delas cita `empresa_id`;
--   6 — ninguém lê `empresa_id` do lote 2 (sabotagem F, a metade SQL): as duas exceções nominais
--       (`k_leitura_integridade`, a cópia amarrada pelo describe 13) LEEM — não são fantasma —, e
--       uma policy de `tipos_item` e uma função que leem a coluna, fictícias, são ACUSADAS pelo
--       predicado das asserções 15g/15h de `catalogo_policies.sql` (o gate sabe reprovar).
--       E (revisão adversarial da F64) a exceção vale por COMANDO, não pela função: a do kit
--       recriada com um comando a mais que lê `eventos_admin.empresa_id` é ACUSADA (6c); e o léxico
--       do predicado (`pg_temp.sql_so_codigo`, em `_asserts.sql`) não deixa um `--` dentro de texto
--       esconder a leitura, nem conta a que está em comentário, texto ou dollar-quote (6d). E (2ª
--       rodada) nas exceções a ORIGEM de cada `x.empresa_id` tem de ser provada no próprio comando:
--       a variável de registro de `select * into v from public.eventos_admin …; if v.empresa_id …`,
--       o apelido de subselect e o `new`/`old` fora de gatilho do kit ACUSAM (6e).
--
-- Tudo por `pg_temp.assert_zero_de`, que recusa universo vazio; rótulo literal (o injetor lê por
-- token). ESCREVE — `begin; … rollback;`: nada sobra no banco. A tabela de fixture
-- (`public.f64_fixture_*`) nasce e morre na transação.
-- =============================================================

begin;

-- O md5 de (pk, xmin) de uma tabela, pela PK LIDA DO CATÁLOGO — a MESMA expressão do instrumento
-- docs/f64-evidencias/impressao-vocabulario.sql (aqui por SQL dinâmico, para servir a qualquer tabela).
create function pg_temp.f64_md5_pk_xmin(p_rel regclass) returns text
language plpgsql as $f$
declare
  v text;
begin
  execute format(
    'select coalesce(md5(string_agg(c.chave::text || '':'' || t.xmin::text, '','' order by c.chave)), ''vazia'')
       from %s t
       cross join lateral (
         select jsonb_agg(to_jsonb(t) -> a.attname order by k.o) as chave
           from pg_constraint pc
           cross join unnest(pc.conkey) with ordinality as k(n, o)
           join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
          where pc.conrelid = %L::regclass and pc.contype = ''p'') c', p_rel, p_rel)
    into v;
  return v;
end
$f$;

-- As colunas da PK, lidas do catálogo (o que o instrumento imprime em `pk`).
create function pg_temp.f64_pk(p_rel regclass) returns text
language sql as $f$
  select coalesce(string_agg(a.attname, ',' order by k.o), 'SEM PK')
    from pg_constraint pc
    cross join unnest(pc.conkey) with ordinality as k(n, o)
    join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
   where pc.conrelid = p_rel and pc.contype = 'p'
$f$;

-- Quantas linhas têm chave NULA e quantas chaves DISTINTAS há, pela PK do catálogo (texto 'nulas:distintas:linhas').
create function pg_temp.f64_chaves(p_rel regclass) returns text
language plpgsql as $f$
declare
  v text;
begin
  execute format(
    'select count(*) filter (where c.chave is null or c.chave = ''[]''::jsonb) || '':'' || count(distinct c.chave) || '':'' || count(*)
       from %s t
       cross join lateral (
         select jsonb_agg(to_jsonb(t) -> a.attname order by k.o) as chave
           from pg_constraint pc
           cross join unnest(pc.conkey) with ordinality as k(n, o)
           join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
          where pc.conrelid = %L::regclass and pc.contype = ''p'') c', p_rel, p_rel)
    into v;
  return v;
end
$f$;

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;

  -- A LISTA DAS ONZE: a mesma de `k_lote2` (catalogo_policies.sql) — amarrada pelo describe 13 de
  -- catalogos-seguranca.test.ts.
  k_onze constant text[] := array['eventos_admin', 'import_logs', 'import_prefixos_patrimonio', 'import_termos_categoria',
                                  'import_termos_estado', 'kits_modelos', 'motivos', 'relatorios_gerados', 'senhas_acesso',
                                  'tipos_item', 'unidades_apelidos'];
  -- A CÓPIA das exceções nominais de leitura (a fonte única é `k_leitura_integridade` em
  -- catalogo_policies.sql; o describe 13 confere que as duas listas são a mesma).
  k_leitura_integridade constant text[] := array['checagens_integridade_nucleo', 'kit_motivo_da_empresa'];
  -- E a cópia de `k_tabelas_leitura_kit` (as tabelas que as exceções podem ler, por comando) — o
  -- describe 13 confere que é a mesma lista.
  k_tabelas_leitura_kit constant text[] := array['kits_modelos', 'motivos'];
  -- F65 (23/09/2026): as exceções de leitura da F65, cada uma com as tabelas DELA — CÓPIA de `k_leitura_tenant`
  -- (catalogo_policies.sql, a fonte única; o describe 14 amarra). A auto-sabotagem 6b conta as funções acusadas pelo
  -- despachante `pg_temp.leitura_de_empresa` — o mesmo do 15h —, que aplica a exceção da F65 por comando.
  k_leitura_tenant constant text[] := array[
    'guarda_empresa:anotacoes,ativos,colaboradores,eventos_admin,filiais,import_logs,import_prefixos_patrimonio,import_termos_categoria,import_termos_estado,itens,kits_modelos,lancamentos_item,motivos,movimentacoes,pendencias_item,relatorios_gerados,senhas_acesso,termos_gerados,tipos_item,unidades_apelidos',
    'termo_da_empresa:termos_gerados,movimentacoes,ativos',
    'vocabulario_unidades_guarda:filiais,unidades_apelidos'
  ];
  -- Os escritores das onze (fato 8) e o contador da senha: o md5 do `prosrc` VIGENTE, calculado do
  -- arquivo da migration que o define por último (todas ANTES da 0162) — o texto que o CI aplica.
  k_escritores constant text[] := array[
    'apagar_ativo:1433ac8da1e8b4aee4ed35dd0af6e2ce',
    'apagar_ativos_conflito_filiais:717a8e39790d849194cde9262914b422',
    'apagar_item:6ee27bacf8d19efe9e48c8303a53b7c6',
    'apagar_movimentacao:1ec28fd2c657a431d29130994808abfc',
    'forcar_estado_ativo:c199abcf2d4ea5e5055d4eb14b5a9eb0',
    'forcar_saldo_item:e0a6906de4b9182896bc08a7ce1bd194',
    'resetar_acervo:bdf3e76da07436f6b947beab6c6158a9',
    'resetar_itens:e024d6f11030552fecdaee4a1da062fe',
    'import_gravar_trilha:3587aa25577ed90ecb516c41e0dd11b2',
    'registrar_tentativa_senha:ee0d1c21835858c0dd04eb5a017eabe7'];
  k_autor    constant uuid := '64000000-0000-4000-8000-0000000000a1';
  -- uma empresa que NÃO existe (o v4 fictício) — o alvo da FK
  k_fantasma constant uuid := '64000000-0000-4000-8000-0000000000f0';
  k_legada   uuid := public.empresa_legada();

  v_f1     smallint;
  v_ruins  bigint;
  v_univ   bigint;
  v_n      bigint;
  v_rot    text;
  v_txt    text;
  v_estado text;
  v_r0     oid;
  v_r1     oid;
  v_r2     oid;
  v_r3     oid;
  v_m0     text;
  v_m1     text;
  v_miss   boolean;
begin
  select id into v_f1 from public.filiais where ativo order by id limit 1;
  if v_f1 is null then
    raise exception 'empresa_no_vocabulario: o banco precisa de ao menos UMA filial ativa para este roteiro';
  end if;
  -- O trigger `handle_new_user` cria o profile e a membership (domínio corporativo).
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values (k_autor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'f64.vocabulario@wap.ind.br', '', now(), now(), now());

  -- ==========================================================================
  -- 1 — O DEFAULT VALE: um INSERT SEM `empresa_id` em cada uma das onze.
  -- ==========================================================================
  insert into public.tipos_item (slug, rotulo, ordem) values ('zzf64tipo', 'Tipo fictício F64', 9964);
  insert into public.motivos (codigo, rotulo, aplica_a)
  values ('f64-motivo-default', 'Motivo fictício F64', array['saida']::public.tipo_movimentacao[]);
  insert into public.kits_modelos (nome, payload, criado_por)
  values ('F64 Kit do default', '{"tipo": "saida", "categorias": ["notebook"]}'::jsonb, k_autor);
  insert into public.senhas_acesso (rotulo, hash, criado_por) values ('F64 Senha fictícia', 'hash-ficticio-f64', k_autor);
  insert into public.eventos_admin (acao, autor, alvo, detalhe)
  values ('papel_alterado', k_autor, 'f64.alvo@wap.ind.br', '{"de": "consulta", "para": "operador"}'::jsonb);
  insert into public.import_logs (filial_id, modo, arquivo_hash, total_linhas, ativos_criados,
                                  movs_apagadas, anotacoes_apagadas, termos_apagados, backup_path, correcoes, criado_por)
  values (v_f1, 'substituir', 'hash-ficticio-f64', 0, 0, 0, 0, 0, 'f64/backup.csv', '[]'::jsonb, k_autor);
  insert into public.relatorios_gerados (periodo_de, periodo_ate, filial_id, versao, dados, gerado_por)
  values (current_date - 4064, current_date - 4064, v_f1, 1, '{}'::jsonb, k_autor);
  insert into public.import_prefixos_patrimonio (prefixo) values ('ZZF');
  insert into public.import_termos_categoria (termo, categoria, rotulo) values ('zzf64 categoria', 'notebook', null);
  insert into public.import_termos_estado (termo, estado, rotulo) values ('zzf64 estado', 'em_uso', null);
  insert into public.unidades_apelidos (filial_id, apelido) values (v_f1, 'ZZF64 Apelido Fictício');

  select count(*) filter (where e is distinct from k_legada),
         coalesce(string_agg(t, ', ') filter (where e is distinct from k_legada), '')
    into v_ruins, v_rot
    from (values
      ('tipos_item',                 (select empresa_id from public.tipos_item where slug = 'zzf64tipo')),
      ('motivos',                    (select empresa_id from public.motivos where codigo = 'f64-motivo-default')),
      ('kits_modelos',               (select empresa_id from public.kits_modelos where nome = 'F64 Kit do default')),
      ('senhas_acesso',              (select empresa_id from public.senhas_acesso where rotulo = 'F64 Senha fictícia')),
      ('eventos_admin',              (select empresa_id from public.eventos_admin where alvo = 'f64.alvo@wap.ind.br')),
      ('import_logs',                (select empresa_id from public.import_logs where arquivo_hash = 'hash-ficticio-f64')),
      ('relatorios_gerados',         (select empresa_id from public.relatorios_gerados where periodo_de = current_date - 4064)),
      ('import_prefixos_patrimonio', (select empresa_id from public.import_prefixos_patrimonio where prefixo = 'ZZF')),
      ('import_termos_categoria',    (select empresa_id from public.import_termos_categoria where termo = 'zzf64 categoria')),
      ('import_termos_estado',       (select empresa_id from public.import_termos_estado where termo = 'zzf64 estado')),
      ('unidades_apelidos',          (select empresa_id from public.unidades_apelidos where apelido = 'ZZF64 Apelido Fictício'))
    ) as x(t, e);
  if pg_temp.assert_zero_de('1a um INSERT sem empresa_id recebe public.empresa_legada() nas onze tabelas do lote 2' ||
       case when v_ruins > 0 then ' — não recebeu: ' || v_rot else '' end, v_ruins, 11) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- count(*) = count(empresa_id) = count(*) filter (where empresa_id = legada), somado nas onze
  select sum(n), sum(n - comum)
    into v_univ, v_ruins
    from (
      select count(*) as n, count(*) filter (where empresa_id = k_legada) as comum from public.tipos_item
      union all select count(*), count(*) filter (where empresa_id = k_legada) from public.motivos
      union all select count(*), count(*) filter (where empresa_id = k_legada) from public.kits_modelos
      union all select count(*), count(*) filter (where empresa_id = k_legada) from public.senhas_acesso
      union all select count(*), count(*) filter (where empresa_id = k_legada) from public.eventos_admin
      union all select count(*), count(*) filter (where empresa_id = k_legada) from public.import_logs
      union all select count(*), count(*) filter (where empresa_id = k_legada) from public.relatorios_gerados
      union all select count(*), count(*) filter (where empresa_id = k_legada) from public.import_prefixos_patrimonio
      union all select count(*), count(*) filter (where empresa_id = k_legada) from public.import_termos_categoria
      union all select count(*), count(*) filter (where empresa_id = k_legada) from public.import_termos_estado
      union all select count(*), count(*) filter (where empresa_id = k_legada) from public.unidades_apelidos
    ) s;
  if pg_temp.assert_zero_de('1b toda linha das onze tem empresa_id = public.empresa_legada() (count(*) = count(empresa_id) = da legada)',
       v_ruins, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- 2 — A FK VALE: empresa inexistente leva 23503 nas onze (e nada fica).
  -- ==========================================================================
  v_ruins := 0; v_rot := '';
  foreach v_txt in array k_onze loop
    begin
      case v_txt
        when 'tipos_item' then
          insert into public.tipos_item (slug, rotulo, ordem, empresa_id) values ('zzf64fantasma', 'Tipo fantasma F64', 9965, k_fantasma);
        when 'motivos' then
          insert into public.motivos (codigo, rotulo, aplica_a, empresa_id)
          values ('f64-motivo-fantasma', 'Motivo fantasma F64', array['saida']::public.tipo_movimentacao[], k_fantasma);
        when 'kits_modelos' then
          insert into public.kits_modelos (nome, payload, criado_por, empresa_id)
          values ('F64 Kit fantasma', '{"tipo": "saida", "categorias": ["notebook"]}'::jsonb, k_autor, k_fantasma);
        when 'senhas_acesso' then
          insert into public.senhas_acesso (rotulo, hash, criado_por, empresa_id) values ('F64 Senha fantasma', 'hash-fantasma-f64', k_autor, k_fantasma);
        when 'eventos_admin' then
          insert into public.eventos_admin (acao, autor, alvo, detalhe, empresa_id)
          values ('papel_alterado', k_autor, 'f64.fantasma@wap.ind.br', '{}'::jsonb, k_fantasma);
        when 'import_logs' then
          insert into public.import_logs (filial_id, modo, arquivo_hash, total_linhas, ativos_criados,
                                          movs_apagadas, anotacoes_apagadas, termos_apagados, backup_path, correcoes, criado_por, empresa_id)
          values (v_f1, 'substituir', 'hash-fantasma-f64', 0, 0, 0, 0, 0, 'f64/fantasma.csv', '[]'::jsonb, k_autor, k_fantasma);
        when 'relatorios_gerados' then
          insert into public.relatorios_gerados (periodo_de, periodo_ate, filial_id, versao, dados, gerado_por, empresa_id)
          values (current_date - 4065, current_date - 4065, v_f1, 1, '{}'::jsonb, k_autor, k_fantasma);
        when 'import_prefixos_patrimonio' then
          insert into public.import_prefixos_patrimonio (prefixo, empresa_id) values ('ZZG', k_fantasma);
        when 'import_termos_categoria' then
          insert into public.import_termos_categoria (termo, categoria, rotulo, empresa_id) values ('zzf64 categoria fantasma', 'notebook', null, k_fantasma);
        when 'import_termos_estado' then
          insert into public.import_termos_estado (termo, estado, rotulo, empresa_id) values ('zzf64 estado fantasma', 'em_uso', null, k_fantasma);
        when 'unidades_apelidos' then
          insert into public.unidades_apelidos (filial_id, apelido, empresa_id) values (v_f1, 'ZZF64 Apelido Fantasma', k_fantasma);
      end case;
      v_ruins := v_ruins + 1; v_rot := v_rot || ' ' || v_txt || '(passou)';
    exception
      when foreign_key_violation then
        null;
      when others then
        v_ruins := v_ruins + 1; v_rot := v_rot || ' ' || v_txt || '(' || sqlstate || ')';
    end;
  end loop;
  if pg_temp.assert_zero_de('2a empresa_id de empresa inexistente é recusado com 23503 nas onze' ||
       case when v_ruins > 0 then ' — fora da regra:' || v_rot else '' end, v_ruins, 11) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- a segunda metade da recusa: como `postgres`, nenhuma linha com a empresa fantasma
  select (select count(*) from public.tipos_item where empresa_id = k_fantasma)
       + (select count(*) from public.motivos where empresa_id = k_fantasma)
       + (select count(*) from public.kits_modelos where empresa_id = k_fantasma)
       + (select count(*) from public.senhas_acesso where empresa_id = k_fantasma)
       + (select count(*) from public.eventos_admin where empresa_id = k_fantasma)
       + (select count(*) from public.import_logs where empresa_id = k_fantasma)
       + (select count(*) from public.relatorios_gerados where empresa_id = k_fantasma)
       + (select count(*) from public.import_prefixos_patrimonio where empresa_id = k_fantasma)
       + (select count(*) from public.import_termos_categoria where empresa_id = k_fantasma)
       + (select count(*) from public.import_termos_estado where empresa_id = k_fantasma)
       + (select count(*) from public.unidades_apelidos where empresa_id = k_fantasma)
    into v_ruins;
  if pg_temp.assert_zero_de('2b de volta como postgres, nenhuma linha com a empresa inexistente ficou nas onze', v_ruins, 11) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- 3 — A ARMADILHA (fato 7): aqui NADA barra o `update` de backfill ingênuo.
  -- ==========================================================================
  -- 3a — em `motivos` (PK natural) e em `eventos_admin` (a trilha) o update PASSA e reescreve cada
  --      linha: relfilenode igual, md5 de (pk, xmin) diferente. Numa subtransação (xid próprio),
  --      medido lá dentro e desfeito.
  v_ruins := 0; v_rot := '';
  foreach v_txt in array array['motivos', 'eventos_admin'] loop
    v_r0 := pg_relation_filenode(('public.' || v_txt)::regclass);
    v_m0 := pg_temp.f64_md5_pk_xmin(('public.' || v_txt)::regclass);
    v_estado := null; v_r1 := null; v_m1 := null;
    begin
      execute format('update public.%I set empresa_id = public.empresa_legada()', v_txt);
      get diagnostics v_n = row_count;
      v_r1 := pg_relation_filenode(('public.' || v_txt)::regclass);
      v_m1 := pg_temp.f64_md5_pk_xmin(('public.' || v_txt)::regclass);
      v_estado := 'passou:' || v_n;
      raise exception 'f64-3a-desfaz';
    exception when others then
      if sqlerrm <> 'f64-3a-desfaz' then v_estado := 'erro ' || sqlstate || ': ' || sqlerrm; end if;
    end;
    raise notice '3a (medição) update ingênuo em %: % · relfilenode % → % · md5(pk, xmin) % → %', v_txt, v_estado, v_r0, v_r1, v_m0, v_m1;
    if v_estado is null or v_estado not like 'passou:%' or v_r1 is distinct from v_r0 or v_m1 is not distinct from v_m0 then
      v_ruins := v_ruins + 1; v_rot := v_rot || ' ' || v_txt;
    end if;
    -- e o desfeito: de volta ao (pk, xmin) de antes
    if pg_temp.f64_md5_pk_xmin(('public.' || v_txt)::regclass) is distinct from v_m0 then
      v_ruins := v_ruins + 1; v_rot := v_rot || ' ' || v_txt || '(não voltou)';
    end if;
  end loop;
  if pg_temp.assert_zero_de('3a o update de backfill ingênuo PASSA em motivos e eventos_admin e reescreve em silêncio (relfilenode igual, md5 de (pk, xmin) diferente) — nada o barra, e só o xmin o denuncia (fato 7)' ||
       case when v_ruins > 0 then ' — fora da regra:' || v_rot else '' end, v_ruins, 4) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- 4 — O INSTRUMENTO NA PK NATURAL (sabotagem B).
  -- ==========================================================================
  create table public.f64_fixture_pk_natural (codigo text primary key, v text);
  insert into public.f64_fixture_pk_natural (codigo, v) values ('b', 'x'), ('a', 'y'), ('c', 'z');

  v_r0 := pg_relation_filenode('public.f64_fixture_pk_natural'::regclass);
  alter table public.f64_fixture_pk_natural add column c_volatil uuid default gen_random_uuid();
  v_r1 := pg_relation_filenode('public.f64_fixture_pk_natural'::regclass);
  alter table public.f64_fixture_pk_natural add column c_empresa uuid not null default public.empresa_legada();
  v_r2 := pg_relation_filenode('public.f64_fixture_pk_natural'::regclass);
  select a.atthasmissing into v_miss
    from pg_attribute a
   where a.attrelid = 'public.f64_fixture_pk_natural'::regclass and a.attname = 'c_empresa';
  raise notice '4a (medição) relfilenode: % → (default volátil) % → (default da fase) % · atthasmissing da coluna da fase: %',
    v_r0, v_r1, v_r2, v_miss;
  if pg_temp.assert_zero_de('4a numa tabela de PK text, o default VOLÁTIL reescreve (relfilenode muda) e o da fase NÃO (relfilenode igual, atthasmissing)',
       (case when v_r1 <> v_r0 then 0 else 1 end) + (case when v_r2 = v_r1 then 0 else 1 end) + (case when v_miss then 0 else 1 end), 3) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  v_m0 := pg_temp.f64_md5_pk_xmin('public.f64_fixture_pk_natural'::regclass);
  v_estado := null; v_r3 := null; v_m1 := null;
  begin
    update public.f64_fixture_pk_natural set v = 'w' where codigo = 'a';
    v_r3 := pg_relation_filenode('public.f64_fixture_pk_natural'::regclass);
    v_m1 := pg_temp.f64_md5_pk_xmin('public.f64_fixture_pk_natural'::regclass);
    v_estado := 'passou';
    raise exception 'f64-4b-desfaz';
  exception when others then
    if sqlerrm <> 'f64-4b-desfaz' then v_estado := 'erro ' || sqlstate || ': ' || sqlerrm; end if;
  end;
  raise notice '4b (medição) update de UMA linha numa subtransação, PK text: relfilenode % → % · md5(pk, xmin) % → % · pk lida: %',
    v_r2, v_r3, v_m0, v_m1, pg_temp.f64_pk('public.f64_fixture_pk_natural'::regclass);
  if pg_temp.assert_zero_de('4b numa tabela de PK text, um update de uma linha deixa o relfilenode igual e MUDA o md5 de (pk, xmin) lido pela PK do catálogo',
       (case when v_estado = 'passou' then 0 else 1 end) + (case when v_r3 = v_r2 then 0 else 1 end)
       + (case when v_m1 is distinct from v_m0 and v_m0 <> 'vazia' then 0 else 1 end)
       + (case when pg_temp.f64_pk('public.f64_fixture_pk_natural'::regclass) = 'codigo' then 0 else 1 end), 4) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 4c — as QUATRO tabelas sem `id`: a PK lida do catálogo é a natural, e dá uma chave não nula por linha.
  --      F65 (23/09/2026): a 0168 e a 0169 trocaram a PK das quatro para `(empresa_id, <a natural>)` — é o que o
  --      catálogo devolve agora, e é o que o instrumento tem de ler (a prova é a mesma: ele lê a PK do CATÁLOGO, não uma
  --      coluna escrita à mão — por isso a PK mudou e ele acompanhou).
  v_ruins := 0; v_rot := ''; v_univ := 0;
  for v_txt, v_estado in
    select * from (values ('motivos', 'empresa_id,codigo'), ('import_prefixos_patrimonio', 'empresa_id,prefixo'),
                          ('import_termos_categoria', 'empresa_id,termo'), ('import_termos_estado', 'empresa_id,termo')) as x(t, pk)
  loop
    v_rot := v_rot || ' ' || v_txt || '[' || pg_temp.f64_pk(('public.' || v_txt)::regclass) || ' ' || pg_temp.f64_chaves(('public.' || v_txt)::regclass) || ']';
    if pg_temp.f64_pk(('public.' || v_txt)::regclass) <> v_estado then v_ruins := v_ruins + 1; end if;
    -- 'nulas:distintas:linhas' — zero nula, e uma chave distinta por linha
    if split_part(pg_temp.f64_chaves(('public.' || v_txt)::regclass), ':', 1) <> '0'
       or split_part(pg_temp.f64_chaves(('public.' || v_txt)::regclass), ':', 2) <> split_part(pg_temp.f64_chaves(('public.' || v_txt)::regclass), ':', 3) then
      v_ruins := v_ruins + 1;
    end if;
    v_univ := v_univ + split_part(pg_temp.f64_chaves(('public.' || v_txt)::regclass), ':', 3)::bigint;
  end loop;
  raise notice '4c (medição) a PK do catálogo nas quatro sem id [pk nulas:distintas:linhas]:%', v_rot;
  if pg_temp.assert_zero_de('4c o instrumento lê a PK do CATÁLOGO nas quatro tabelas sem id (codigo, prefixo, termo, termo) — nenhuma chave nula, uma por linha' ||
       case when v_ruins > 0 then ' —' || v_rot else '' end,
       v_ruins, greatest(v_univ, 8)) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- 5 — NENHUM ESCRITOR MUDOU (sabotagem I).
  -- ==========================================================================
  with esperado as (
    select split_part(e, ':', 1) as nome, split_part(e, ':', 2) as md5 from unnest(k_escritores) as e
  ), vivo as (
    select p.proname, md5(p.prosrc) as md5, count(*) over (partition by p.proname) as assinaturas, p.prosrc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in (select nome from esperado)
  )
  select count(*) filter (where v.proname is null or v.md5 <> e.md5 or v.assinaturas <> 1),
         coalesce(string_agg(e.nome, ', ') filter (where v.proname is null or v.md5 <> e.md5 or v.assinaturas <> 1), '')
    into v_ruins, v_rot
    from esperado e left join vivo v on v.proname = e.nome;
  if pg_temp.assert_zero_de('5a o corpo das 9 funções que escrevem nas onze e de registrar_tentativa_senha é o das migrations de ANTES da F64 (md5 do prosrc, uma assinatura cada)' ||
       case when v_ruins > 0 then ' — mudou: ' || v_rot else '' end, v_ruins, 10) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  select count(*) filter (where p.prosrc ~ '\mempresa_id\M'),
         coalesce(string_agg(p.proname, ', ') filter (where p.prosrc ~ '\mempresa_id\M'), '')
    into v_ruins, v_rot
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (select split_part(e, ':', 1) from unnest(k_escritores) as e);
  if pg_temp.assert_zero_de('5b nenhum dos dez cita empresa_id — quem preenche a coluna é o default (até a F67)' ||
       case when v_ruins > 0 then ' — cita: ' || v_rot else '' end, v_ruins, 10) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- 6 — NINGUÉM LÊ `empresa_id` DO LOTE 2 (a metade SQL da sabotagem F).
  -- ==========================================================================
  -- O predicado é o ÚNICO de 15h (catalogo_policies.sql): `pg_temp.leitura_de_empresa_do_lote`
  -- (`_asserts.sql`) — o CÓDIGO do corpo pelo léxico do Postgres; fora das exceções a função inteira,
  -- nas exceções o COMANDO que lê a coluna junto de uma tabela do lote fora de `k_tabelas_leitura_kit`.
  -- 6a — as duas exceções nominais LEEM (não são fantasma): cada uma tem um comando que lê
  --      `empresa_id` junto de `kits_modelos`/`motivos` — e o predicado NÃO as acusa.
  select count(*) filter (where exists (
           select 1 from regexp_split_to_table(pg_temp.sql_so_codigo(p.prosrc), ';') as s(cmd)
            where s.cmd ~ '\mempresa_id\M'
              and s.cmd ~ ('\m(' || array_to_string(k_tabelas_leitura_kit, '|') || ')\M'))),
         count(*) filter (where pg_temp.leitura_de_empresa_do_lote(p.proname, p.prosrc, k_onze, k_leitura_integridade, k_tabelas_leitura_kit) is not null)
    into v_n, v_ruins
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (k_leitura_integridade);
  if pg_temp.assert_zero_de('6a as duas exceções nominais LEEM empresa_id de kits_modelos/motivos (a lista não guarda fantasma) e o predicado não as acusa' ||
       case when v_n <> 2 or v_ruins > 0 then ' — leem ' || v_n || ' de 2, acusadas ' || v_ruins else '' end,
       (2 - least(v_n, 2)) + v_ruins, 4) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 6b — a AUTO-SABOTAGEM: uma policy de tipos_item e uma função que leem a coluna são acusadas.
  v_estado := null;
  begin
    create policy f64_sabotagem_le_empresa on public.tipos_item for select to authenticated
      using (empresa_id = (select public.empresa_legada()));
    create function public.f64_sabotagem_le_motivo() returns bigint language sql stable as $s$
      select count(*) from public.motivos m where m.empresa_id = public.empresa_legada()
    $s$;
    select (select count(*) from pg_policies p
             where p.schemaname = 'public' and p.tablename = any (k_onze)
               and (coalesce(p.qual, '') ~ '\mempresa_id\M' or coalesce(p.with_check, '') ~ '\mempresa_id\M'))::text
           || '/' ||
           (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and pg_temp.leitura_de_empresa(p.proname, p.prosrc, k_onze, k_leitura_integridade, k_tabelas_leitura_kit, k_leitura_tenant) is not null)::text
      into v_estado;
    raise exception 'f64-6b-desfaz';
  exception when others then
    if sqlerrm <> 'f64-6b-desfaz' then v_estado := 'erro ' || sqlstate || ': ' || sqlerrm; end if;
  end;
  if pg_temp.assert_zero_de('6b auto-sabotagem: a policy de tipos_item e a função que leem empresa_id do lote 2 são ACUSADAS pelo predicado de 15g/15h (o gate sabe reprovar)' ||
       case when v_estado is distinct from '1/1' then ' — acusou ' || coalesce(v_estado, '∅') || ' (esperado 1/1)' else '' end,
       case when v_estado = '1/1' then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 6c — A EXCEÇÃO VALE POR COMANDO (revisão adversarial da F64): a função do gatilho do kit,
  --      recriada na transação com um comando a mais que lê `eventos_admin.empresa_id`, é ACUSADA —
  --      o nome dela na lista de exceções não a isenta inteira.
  v_estado := null;
  begin
    create or replace function public.kit_motivo_da_empresa() returns trigger language plpgsql set search_path = public as $s$
    begin
      if not exists (select 1 from public.motivos m where m.codigo = new.payload->>'motivo' and m.empresa_id = new.empresa_id) then
        raise exception 'f64 sabotagem';
      end if;
      perform count(*) from public.eventos_admin e where e.empresa_id = new.empresa_id;
      return new;
    end
    $s$;
    select coalesce(pg_temp.leitura_de_empresa_do_lote(p.proname, p.prosrc, k_onze, k_leitura_integridade, k_tabelas_leitura_kit), 'NAO ACUSOU')
      into v_estado
      from pg_proc p where p.oid = 'public.kit_motivo_da_empresa()'::regprocedure;
    raise exception 'f64-6c-desfaz';
  exception when others then
    if sqlerrm <> 'f64-6c-desfaz' then v_estado := 'erro ' || sqlstate || ': ' || sqlerrm; end if;
  end;
  raise notice '6c (medição) a exceção com um comando a mais: %', v_estado;
  if pg_temp.assert_zero_de('6c a exceção nominal que lê empresa_id de OUTRA tabela do lote (eventos_admin) num comando é ACUSADA — a exceção vale por comando, não pela função' ||
       case when v_estado is null or v_estado not like 'kit_motivo_da_empresa (num comando que lê outra tabela do lote:%' then ' — ' || coalesce(v_estado, '∅') else '' end,
       case when v_estado like 'kit_motivo_da_empresa (num comando que lê outra tabela do lote:%eventos_admin%' then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 6d — O LÉXICO (`pg_temp.sql_so_codigo`): o `--` dentro de um texto não esconde a leitura que vem
  --      depois na mesma linha; a leitura só em comentário, em texto ou em dollar-quote não conta.
  v_ruins := 0; v_rot := '';
  if pg_temp.leitura_de_empresa_do_lote('f64_qualquer', 'if p = ''ok -- x'' then null; end if; select m.empresa_id from public.motivos m;', k_onze, k_leitura_integridade, k_tabelas_leitura_kit) is null then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (o -- dentro do texto escondeu a leitura)';
  end if;
  if pg_temp.leitura_de_empresa_do_lote('f64_qualquer', E'select 1; -- m.empresa_id de public.motivos\nselect 2;', k_onze, k_leitura_integridade, k_tabelas_leitura_kit) is not null then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (acusou a leitura em comentário de linha)';
  end if;
  if pg_temp.leitura_de_empresa_do_lote('f64_qualquer', 'select ''m.empresa_id from public.motivos''; select 2;', k_onze, k_leitura_integridade, k_tabelas_leitura_kit) is not null then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (acusou a leitura dentro de texto)';
  end if;
  if pg_temp.leitura_de_empresa_do_lote('f64_qualquer', 'perform $q$ select m.empresa_id from public.motivos m $q$; select 2;', k_onze, k_leitura_integridade, k_tabelas_leitura_kit) is not null then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (acusou a leitura dentro de dollar-quote)';
  end if;
  if pg_temp.leitura_de_empresa_do_lote('f64_qualquer', '/* a /* aninhado */ m.empresa_id de public.motivos */ select 1;', k_onze, k_leitura_integridade, k_tabelas_leitura_kit) is not null then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (acusou a leitura em comentário de bloco aninhado)';
  end if;
  if pg_temp.leitura_de_empresa_do_lote('kit_motivo_da_empresa', 'select 1 from public.motivos m where m.empresa_id = new.empresa_id; select 2 from public.kits_modelos k where k.empresa_id = new.empresa_id;', k_onze, k_leitura_integridade, k_tabelas_leitura_kit) is not null then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (acusou a exceção lendo só kits_modelos/motivos)';
  end if;
  if pg_temp.leitura_de_empresa_do_lote('checagens_integridade_nucleo', 'select 1 from public.senhas_acesso s where s.empresa_id = public.empresa_legada();', k_onze, k_leitura_integridade, k_tabelas_leitura_kit) is null then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (a exceção lendo senhas_acesso passou)';
  end if;
  if pg_temp.sql_so_codigo('select $1, "a--b", ''x;y'' from t; -- fim') is distinct from 'select $1, "a--b", '''' from t; ' then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (o léxico: ' || coalesce(pg_temp.sql_so_codigo('select $1, "a--b", ''x;y'' from t; -- fim'), '∅') || ')';
  end if;
  if pg_temp.assert_zero_de('6d o léxico do predicado: o -- dentro de texto não esconde a leitura; comentário, texto e dollar-quote não contam; a exceção vale por comando; $1 e identificador citado ficam' ||
       case when v_ruins > 0 then ' — fora da regra:' || v_rot else '' end, v_ruins, 8) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- 6e — NAS EXCEÇÕES, A ORIGEM TEM DE SER PROVADA NO COMANDO (2ª rodada da revisão adversarial da
  --      F64): o idioma `select * into v from public.eventos_admin …; if v.empresa_id …` parte a
  --      leitura em dois comandos, e nenhum dos dois casava "empresa_id E tabela de fora do kit". Agora
  --      cada `x.empresa_id` de uma exceção resolve `x` no próprio comando para uma tabela do kit ou de
  --      fora do lote; `new`/`old` só com todo gatilho da função numa tabela do kit; o resto ACUSA.
  v_ruins := 0; v_rot := '';
  if pg_temp.leitura_de_empresa_do_lote('kit_motivo_da_empresa', 'select * into v_e from public.eventos_admin where id = p_id; if v_e.empresa_id <> public.empresa_legada() then raise exception ''x''; end if;', k_onze, k_leitura_integridade, k_tabelas_leitura_kit) is null then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (a variável de registro de eventos_admin passou)';
  end if;
  if pg_temp.leitura_de_empresa_do_lote('kit_motivo_da_empresa', 'select * into v_k from public.kits_modelos where id = p_id; if v_k.empresa_id is null then return new; end if;', k_onze, k_leitura_integridade, k_tabelas_leitura_kit) is null then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (a variável de registro passou — nem do kit ela se prova)';
  end if;
  if pg_temp.leitura_de_empresa_do_lote('checagens_integridade_nucleo', 'perform 1 from public.motivos m where m.empresa_id = new.empresa_id;', k_onze, k_leitura_integridade, k_tabelas_leitura_kit) is null then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (new.empresa_id numa função sem gatilho no kit passou)';
  end if;
  if pg_temp.leitura_de_empresa_do_lote('checagens_integridade_nucleo', 'select count(*) from public.membros m join public.motivos o on o.codigo = m.papel where m.empresa_id = o.empresa_id;', k_onze, k_leitura_integridade, k_tabelas_leitura_kit) is not null then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (acusou o apelido de membros e o de motivos, provados no comando)';
  end if;
  if pg_temp.leitura_de_empresa_do_lote('checagens_integridade_nucleo', 'select x.empresa_id from (select * from public.motivos) x;', k_onze, k_leitura_integridade, k_tabelas_leitura_kit) is null then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (o apelido de subselect passou)';
  end if;
  if pg_temp.leitura_de_empresa_do_lote('kit_motivo_da_empresa', 'PERFORM 1 FROM PUBLIC.EVENTOS_ADMIN E WHERE E.EMPRESA_ID = NEW.EMPRESA_ID;', k_onze, k_leitura_integridade, k_tabelas_leitura_kit) is null then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (a leitura em MAIÚSCULAS numa exceção passou)';
  end if;
  if pg_temp.leitura_de_empresa_do_lote('f64_qualquer', 'SELECT M.EMPRESA_ID FROM PUBLIC.MOTIVOS M;', k_onze, k_leitura_integridade, k_tabelas_leitura_kit) is null then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (a leitura em MAIÚSCULAS fora das exceções passou)';
  end if;
  if pg_temp.leitura_de_empresa_do_lote('kit_motivo_da_empresa', 'select * into v_e from public.eventos_admin where id = p_id; if new.empresa_id is distinct from v_e.empresa_id then raise exception ''x''; end if;', k_onze, k_leitura_integridade, k_tabelas_leitura_kit) is null then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (o is distinct from fez da variável de registro uma tabela)';
  end if;
  if pg_temp.assert_zero_de('6e nas exceções a origem de cada x.empresa_id é PROVADA no comando: a variável de registro, o apelido de subselect e o new/old sem gatilho no kit acusam; o apelido declarado no comando passa; maiúsculas não escondem; distinct from não declara tabela' ||
       case when v_ruins > 0 then ' — fora da regra:' || v_rot else '' end, v_ruins, 8) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM empresa_no_vocabulario: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
