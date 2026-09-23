-- =============================================================
-- Roteiro de teste: A INTEGRIDADE ESTRUTURAL DO TENANT (F65, 23/09/2026) — o roteiro da fase
-- =============================================================
-- A F65 monta a camada que SOBREVIVE À FALHA DA RLS: o banco recusa, sozinho, o dado cruzado entre empresas. As três
-- travas de catálogo (forma_multiempresa, unicidade_por_empresa, imutabilidade_tenant) provam a FORMA; este roteiro
-- prova o COMPORTAMENTO, com duas (e às vezes três) empresas fictícias montadas aqui mesmo:
--   D — a FK composta, com o PAR SIMÉTRICO (regra 3 de isolamento_tenant.sql): para CADA uma das FKs entre tabelas de
--       negócio — um laço sobre o CATÁLOGO, não uma lista à mão —, o filho da empresa A apontado para o pai da B leva
--       23503 (D1), o par legítimo (o filho da B no pai da B) passa (D2), e de volta como `postgres` o filho da A está
--       intacto (D3); e a transferência: a movimentação que manda um ativo de A para uma filial de B é recusada e o ativo
--       segue na filial de origem, enquanto a transferência dentro de A passa (D4);
--   E — `motivos` e o vocabulário do import por empresa: o mesmo código de motivo, o mesmo termo e o mesmo prefixo
--       coexistem entre empresas e são recusados dentro de uma; a movimentação de A com motivo que só existe em B é
--       recusada; o gatilho do kit (F64) continua recusando o motivo de B no kit de A; o parcial por rótulo vale por
--       empresa;
--   F — o "pronto quando" da ficha, corrigido pelo fato 19: duas empresas com filial `matriz` e o mesmo nome; o mesmo
--       tipo, colaborador, item, kit e apelido nas duas — tudo coexiste entre empresas e é recusado dentro de uma, a
--       violação citando o NOME contratual (é por ele que `CONSTRAINTS_TRADUZIDAS` traduz); e o mesmo par patrimônio +
--       service tag em duas empresas coexiste (a regra da F24, por filial, é conflito_filiais.sql, sem edição);
--   G — o snapshot: A e B geram o Consolidado do mesmo período e versão; na mesma empresa, o segundo leva 23505 com o
--       nome do índice (a segunda pista de `ehViolacaoDeVersao`);
--   H — a diagonal nome × apelido por empresa: B chama uma filial pelo apelido de A (passa); em A, o mesmo é recusado; a
--       mensagem de recusa nunca cita filial de OUTRA empresa; e o resto do corpo da função é o da 0139 byte a byte;
--   I — `termos_gerados`: o termo de A que cita movimentação ou ativo de B é recusado; o coerente passa; o UPDATE de
--       `dados`/`arquivo_path` reenviando os mesmos arrays (o reuso de `persistirTermo`) passa;
--   J — a janela do `ON CONFLICT` (fato 10): contra o esquema-alvo, `ON CONFLICT (nome_chave)` falha com 42P10 e
--       `ON CONFLICT (empresa_id, nome_chave)` infere; no estado intermediário (o global ao lado), os dois inferem;
--   L — o instrumento de "nenhuma tupla reescrita": um `update` numa subtransação deixa o `relfilenode` e muda o md5 de
--       (chave, xmin); um `alter column … type` muda o `relfilenode`; as operações da fase (unique novo, FK trocada pela
--       composta de mesmo nome, PK trocada, índice provisório → rename) não mudam nenhum dos dois; e o corpo das funções
--       que a fase não recria é o de antes da 0165 (o md5 contra a constante medida no Postgres do CI antes da 0165).
-- Toda recusa é provada duas vezes (a falha e, como `postgres`, o dado intacto); tudo por `assert_zero_de`.
--
-- DADOS: 100% fictícios (`pg_temp.f65_plantar`, _asserts.sql, planta uma linha em cada uma das 20 tabelas, com
-- `empresa_id` POR EXTENSO); empresas B e C fictícias criadas aqui. Tudo em `begin; … rollback;`.
-- =============================================================

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-f652-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'f65.integridade@wap.ind.br', '', now(), now(), now());
insert into public.empresas (slug, nome) values ('f65-int-b', 'Empresa B fictícia da integridade (F65)');
insert into public.empresas (slug, nome) values ('f65-int-c', 'Empresa C fictícia da integridade (F65)');

-- Uma tentativa isolada: roda o SQL numa subtransação (com a janela destrutiva aberta, para a guarda_acervo deixar o
-- UPDATE de `movimentacoes`/`lancamentos_item` chegar à FK), força as FKs diferidas e DESFAZ. Devolve o SQLSTATE da
-- recusa, ou 'passou'.
create function pg_temp.f65_tentar(p_sql text, p_janela boolean default true) returns text
language plpgsql as $f$
declare
  v_estado text;
begin
  begin
    if p_janela then perform set_config('estoque.dev_destrutivo', 'on', true); end if;
    execute p_sql;
    set constraints all immediate;
    v_estado := 'passou';
    raise exception 'f65-tentar-desfaz';
  exception when others then
    if v_estado is null then v_estado := sqlstate || ': ' || sqlerrm; end if;
  end;
  return v_estado;
end;
$f$;

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;
  v_cnt    bigint;
  v_univ   bigint;
  v_n      bigint;
  v_lista  text;
  v_rot    text;
  v_res    text;
  v_res2   text;
  v_antes  text;
  v_depois text;
  v_tipo   text;
  v_r0     oid;
  v_r1     oid;
  v_m0     text;
  v_m1     text;
  v_a      jsonb;
  v_b      jsonb;
  v_c      jsonb;
  v_fa2    smallint;
  v_fb     smallint;
  v_fbm    smallint;
  v_fcm    smallint;
  v_emp_a  uuid := public.empresa_legada();
  v_emp_b  uuid := (select id from public.empresas where slug = 'f65-int-b');
  v_emp_c  uuid := (select id from public.empresas where slug = 'f65-int-c');
  k_autor  constant uuid := '00000000-f652-4000-8000-000000000001';
  r        record;

  -- A tabela-verdade de negócio — CÓPIA de `k_negocio` de catalogo_policies.sql (o describe 14 amarra as duas).
  k_negocio text[] := array[
    'anotacoes', 'ativos', 'colaboradores', 'eventos_admin', 'filiais',
    'import_logs', 'import_prefixos_patrimonio', 'import_termos_categoria',
    'import_termos_estado', 'itens', 'kits_modelos', 'lancamentos_item',
    'motivos', 'movimentacoes', 'pendencias_item', 'relatorios_gerados',
    'senhas_acesso', 'termos_gerados', 'tipos_item', 'unidades_apelidos'
  ];
  -- O md5 do conjunto (assinatura:md5 do prosrc) das funções de `public` que a F65 NÃO cria nem recria — medido no
  -- Postgres do CI ANTES da 0165 (a cadeia até a 0164; ver docs/f65-evidencias/B-travas/). A F65 cria
  -- `guarda_empresa`/`termo_da_empresa` e recria `vocabulario_unidades_guarda`; todas as outras ficam byte a byte.
  k_funcoes_pre_0165 constant text := '9fa5e4669eb15ea8f199fd392613d30e';
  -- O md5 do `prosrc` de vocabulario_unidades_guarda() da 0139 (o dos dois bancos antes da F65).
  k_diagonal_0139 constant text := '91e80d533d72191325e614d24e15a881';
begin
  v_a := pg_temp.f65_plantar(v_emp_a, 'int-a', k_autor, 'ZZA');
  v_b := pg_temp.f65_plantar(v_emp_b, 'int-b', k_autor, 'ZZB');
  insert into public.filiais (nome, slug, empresa_id) values ('F65 Filial int-a2', 'f65-int-a2', v_emp_a) returning id into v_fa2;
  v_fb := (v_b->>'filiais')::smallint;

  -- ==========================================================================
  -- D — a FK composta, para CADA uma das FKs entre tabelas de negócio (do catálogo), com o par simétrico
  -- ==========================================================================
  v_univ := 0; v_cnt := 0; v_rot := ''; v_n := 0; v_lista := '';
  for r in
    select k.conname::text as fk, f.relname::text as filho, p.relname::text as pai,
           (select a.attname::text from pg_attribute a where a.attrelid = k.conrelid
               and a.attnum = (select x from unnest(k.conkey) as x
                                where x <> (select b.attnum from pg_attribute b where b.attrelid = k.conrelid and b.attname = 'empresa_id')
                                limit 1)) as coluna,
           (select a.attname::text from pg_attribute a where a.attrelid = k.confrelid
               and a.attnum = (select x from unnest(k.confkey) as x
                                where x <> coalesce((select b.attnum from pg_attribute b where b.attrelid = k.confrelid and b.attname = 'empresa_id'), -1)
                                limit 1)) as coluna_pai
      from pg_constraint k
      join pg_class f on f.oid = k.conrelid
      join pg_class p on p.oid = k.confrelid
     where k.contype = 'f'
       and f.relnamespace = 'public'::regnamespace and p.relnamespace = 'public'::regnamespace
       and f.relname = any (k_negocio) and p.relname = any (k_negocio)
     order by k.conname
  loop
    v_univ := v_univ + 1;
    select format_type(a.atttypid, a.atttypmod) into v_tipo
      from pg_attribute a where a.attrelid = ('public.' || r.filho)::regclass and a.attname = r.coluna;
    -- o valor da chave do pai NA EMPRESA B (o que a fixture plantou)
    execute format('select %I::text from public.%I where empresa_id = $1 and %I::text = $2', r.coluna_pai, r.pai, r.coluna_pai)
      into v_res2 using v_emp_b, (v_b->>r.pai);
    execute format('select coalesce(%I::text, ''∅'') from public.%I where id::text = $1', r.coluna, r.filho)
      into v_antes using (v_a->>r.filho);
    -- D1: o filho da A no pai da B
    v_res := pg_temp.f65_tentar(format('update public.%I set %I = %L::%s where id::text = %L',
                                        r.filho, r.coluna, v_res2, v_tipo, v_a->>r.filho));
    if v_res not like '23503:%' then
      v_cnt := v_cnt + 1; v_rot := v_rot || ' ' || r.fk || '(' || left(v_res, 60) || ')';
    end if;
    -- D2: o par legítimo — o filho da B no pai da B
    v_res := pg_temp.f65_tentar(format('update public.%I set %I = %L::%s where id::text = %L',
                                        r.filho, r.coluna, v_res2, v_tipo, v_b->>r.filho));
    if v_res <> 'passou' then
      v_n := v_n + 1; v_lista := v_lista || ' ' || r.fk || '(' || left(v_res, 60) || ')';
    end if;
    -- D3: o filho da A intacto
    execute format('select coalesce(%I::text, ''∅'') from public.%I where id::text = $1', r.coluna, r.filho)
      into v_depois using (v_a->>r.filho);
    if v_depois is distinct from v_antes then
      v_n := v_n + 1; v_lista := v_lista || ' ' || r.fk || '(mudou)';
    end if;
  end loop;
  raise notice '(medição) D: % FKs entre tabelas de negócio no catálogo', v_univ;
  if pg_temp.assert_zero_de(
       'D1 para cada FK entre tabelas de negócio (do catálogo), o filho da empresa A apontado para o pai da B leva 23503' ||
       case when v_cnt > 0 then ' — fora da regra:' || v_rot else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de(
       'D2 o par simétrico: o filho da B no pai da B PASSA em cada uma, e de volta como postgres o filho da A está intacto' ||
       case when v_n > 0 then ' — fora da regra:' || v_lista else '' end,
       v_n, 2 * v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de(
       'D3 o laço viu as 23 FKs entre tabelas de negócio (o universo do fato 4)' ||
       case when v_univ <> 23 then ' — viu ' || v_univ else '' end,
       case when v_univ = 23 then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- D4 — a transferência: da filial da A para uma filial da B é recusada; dentro da A, passa
  v_res := pg_temp.f65_tentar(format(
    'insert into public.movimentacoes (ativo_id, tipo, data, filial_id, filial_destino_id, criado_por, empresa_id) values (%L, ''transferencia'', current_date, %L, %L, %L, %L)',
    v_a->>'ativos', v_a->>'filiais', v_fb, k_autor, v_emp_a), false);
  v_res2 := pg_temp.f65_tentar(format(
    'insert into public.movimentacoes (ativo_id, tipo, data, filial_id, filial_destino_id, criado_por, empresa_id) values (%L, ''transferencia'', current_date, %L, %L, %L, %L)',
    v_a->>'ativos', v_a->>'filiais', v_fa2, k_autor, v_emp_a), false);
  select count(*) into v_n from public.ativos where id = (v_a->>'ativos')::uuid and filial_id = (v_a->>'filiais')::smallint;
  if pg_temp.assert_zero_de(
       'D4 a transferência de um ativo da A para uma filial da B é recusada (23503) e o ativo segue na filial de origem; dentro da A, passa' ||
       case when v_res not like '23503:%' or v_res2 <> 'passou' or v_n <> 1
            then ' — para B: ' || left(v_res, 80) || ' · dentro da A: ' || left(v_res2, 80) || ' · na origem: ' || v_n else '' end,
       (case when v_res like '23503:%' then 0 else 1 end) + (case when v_res2 = 'passou' then 0 else 1 end) + (case when v_n = 1 then 0 else 1 end), 3) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- E — motivos e o vocabulário do import por empresa
  -- ==========================================================================
  v_cnt := 0; v_rot := '';
  -- E1: o mesmo código de motivo em A e em B coexiste; na mesma empresa, é recusado (23505, motivos_pkey)
  v_res := pg_temp.f65_tentar(format('insert into public.motivos (codigo, rotulo, aplica_a, empresa_id) values (%L, ''x'', array[''saida'']::public.tipo_movimentacao[], %L)', v_b->>'motivos', v_emp_a), false);
  if v_res <> 'passou' then v_cnt := v_cnt + 1; v_rot := v_rot || ' mesmo-codigo-em-A(' || left(v_res, 50) || ')'; end if;
  v_res := pg_temp.f65_tentar(format('insert into public.motivos (codigo, rotulo, aplica_a, empresa_id) values (%L, ''x'', array[''saida'']::public.tipo_movimentacao[], %L)', v_b->>'motivos', v_emp_b), false);
  if v_res not like '23505:%motivos_pkey%' then v_cnt := v_cnt + 1; v_rot := v_rot || ' repetido-na-B(' || left(v_res, 50) || ')'; end if;
  if pg_temp.assert_zero_de(
       'E1 o mesmo código de motivo coexiste em A e em B; repetido na mesma empresa, é recusado (23505, motivos_pkey)' ||
       case when v_cnt > 0 then ' — fora da regra:' || v_rot else '' end, v_cnt, 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- E2: a movimentação da A com o motivo que só existe na B → 23503 (movimentacoes_motivo_fkey), e o dado intacto
  v_res := pg_temp.f65_tentar(format('update public.movimentacoes set motivo = %L where id = %L', v_b->>'motivos', v_a->>'movimentacoes'));
  select count(*) into v_n from public.movimentacoes where id = (v_a->>'movimentacoes')::uuid and motivo is not distinct from null;
  if pg_temp.assert_zero_de(
       'E2 a movimentação da A com o motivo que só existe na B leva 23503 (movimentacoes_motivo_fkey), e o motivo dela continua o de antes' ||
       case when v_res not like '23503:%movimentacoes_motivo_fkey%' or v_n <> 1 then ' — ' || left(v_res, 90) || ' · intacta: ' || v_n else '' end,
       (case when v_res like '23503:%movimentacoes_motivo_fkey%' then 0 else 1 end) + (case when v_n = 1 then 0 else 1 end), 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- E3: o gatilho do kit (F64) continua recusando o motivo da B no kit da A
  v_res := pg_temp.f65_tentar(format('insert into public.kits_modelos (nome, payload, criado_por, empresa_id) values (''F65 kit cruzado'', jsonb_build_object(''tipo'', ''saida'', ''motivo'', %L), %L, %L)',
                                     v_b->>'motivos', k_autor, v_emp_a), false);
  if pg_temp.assert_zero_de(
       'E3 o gatilho do kit (F64) continua recusando o motivo da B num kit da A (23503, a frase do kit)' ||
       case when v_res not like '23503:%não existe na empresa do kit%' then ' — ' || left(v_res, 90) else '' end,
       case when v_res like '23503:%não existe na empresa do kit%' then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- E4: o mesmo termo e o mesmo prefixo em B e em C coexistem; repetidos na mesma empresa, recusados; o parcial por
  --     rótulo (uma categoria com rótulo por empresa) vale por empresa
  v_cnt := 0; v_rot := '';
  foreach v_res2 in array array[
      format('insert into public.import_prefixos_patrimonio (prefixo, empresa_id) values (''ZQF'', %L)', v_emp_b),
      format('insert into public.import_prefixos_patrimonio (prefixo, empresa_id) values (''ZQF'', %L)', v_emp_c),
      format('insert into public.import_termos_categoria (termo, categoria, rotulo, empresa_id) values (''f65 termo comum'', ''desktop'', ''F65 Termo Comum'', %L)', v_emp_b),
      format('insert into public.import_termos_categoria (termo, categoria, rotulo, empresa_id) values (''f65 termo comum'', ''desktop'', ''F65 Termo Comum'', %L)', v_emp_c),
      format('insert into public.import_termos_estado (termo, estado, rotulo, empresa_id) values (''f65 termo comum'', ''em_estoque'', ''F65 Termo Comum'', %L)', v_emp_b),
      format('insert into public.import_termos_estado (termo, estado, rotulo, empresa_id) values (''f65 termo comum'', ''em_estoque'', ''F65 Termo Comum'', %L)', v_emp_c)] loop
    begin
      execute v_res2;
    exception when others then
      v_cnt := v_cnt + 1; v_rot := v_rot || ' coexistir(' || left(sqlstate || ': ' || sqlerrm, 70) || ')';
    end;
  end loop;
  v_res := pg_temp.f65_tentar(format('insert into public.import_prefixos_patrimonio (prefixo, empresa_id) values (''ZQF'', %L)', v_emp_b), false);
  if v_res not like '23505:%import_prefixos_patrimonio_pkey%' then v_cnt := v_cnt + 1; v_rot := v_rot || ' prefixo-repetido(' || left(v_res, 50) || ')'; end if;
  v_res := pg_temp.f65_tentar(format('insert into public.import_termos_categoria (termo, categoria, empresa_id) values (''f65 termo comum'', ''desktop'', %L)', v_emp_b), false);
  if v_res not like '23505:%import_termos_categoria_pkey%' then v_cnt := v_cnt + 1; v_rot := v_rot || ' termo-repetido(' || left(v_res, 50) || ')'; end if;
  v_res := pg_temp.f65_tentar(format('insert into public.import_termos_categoria (termo, categoria, rotulo, empresa_id) values (''f65 outro termo'', ''desktop'', ''F65 Outro Termo'', %L)', v_emp_b), false);
  if v_res not like '23505:%import_termos_categoria_categoria_rotulo_uidx%' then v_cnt := v_cnt + 1; v_rot := v_rot || ' rotulo-da-categoria-repetido(' || left(v_res, 50) || ')'; end if;
  v_res := pg_temp.f65_tentar(format('insert into public.import_termos_estado (termo, estado, rotulo, empresa_id) values (''f65 outro termo'', ''em_estoque'', ''F65 Outro Termo'', %L)', v_emp_c), false);
  if v_res not like '23505:%import_termos_estado_estado_rotulo_uidx%' then v_cnt := v_cnt + 1; v_rot := v_rot || ' rotulo-do-estado-repetido(' || left(v_res, 50) || ')'; end if;
  if pg_temp.assert_zero_de(
       'E4 o mesmo prefixo e o mesmo termo (com rótulo) coexistem em B e em C; na mesma empresa, o prefixo, o termo e o rótulo da categoria/estado repetidos são recusados (23505, pelo nome)' ||
       case when v_cnt > 0 then ' — fora da regra:' || v_rot else '' end, v_cnt, 10) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- J — a janela do ON CONFLICT (fato 10)
  -- ==========================================================================
  v_cnt := 0; v_rot := '';
  v_res := pg_temp.f65_tentar(format('insert into public.colaboradores (nome, criado_por, empresa_id) values (''Fulano F65 int-a'', %L, %L) on conflict (nome_chave) do nothing', k_autor, v_emp_a), false);
  if v_res not like '42P10:%' then v_cnt := v_cnt + 1; v_rot := v_rot || ' on-conflict-nome_chave(' || left(v_res, 70) || ')'; end if;
  v_res := pg_temp.f65_tentar(format('insert into public.colaboradores (nome, criado_por, empresa_id) values (''Fulano F65 int-a'', %L, %L) on conflict (empresa_id, nome_chave) do nothing', k_autor, v_emp_a), false);
  if v_res <> 'passou' then v_cnt := v_cnt + 1; v_rot := v_rot || ' on-conflict-empresa-nome_chave(' || left(v_res, 70) || ')'; end if;
  select count(*) into v_n from public.colaboradores where empresa_id = v_emp_a and nome = 'Fulano F65 int-a';
  if v_n <> 1 then v_cnt := v_cnt + 1; v_rot := v_rot || ' duplicou(' || v_n || ')'; end if;
  if pg_temp.assert_zero_de(
       'J1 contra o esquema-alvo, ON CONFLICT (nome_chave) falha com 42P10 e ON CONFLICT (empresa_id, nome_chave) infere o unique por empresa (e não duplica)' ||
       case when v_cnt > 0 then ' — fora da regra:' || v_rot else '' end, v_cnt, 3) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- J2: o estado intermediário (a 0172 sem a 0174): o global ao lado — os dois alvos inferem
  v_cnt := 0; v_rot := '';
  v_res := pg_temp.f65_tentar(format('create unique index f65_j2_global_intermediario on public.colaboradores (nome_chave); insert into public.colaboradores (nome, criado_por, empresa_id) values (''Fulano F65 int-a'', %L, %L) on conflict (nome_chave) do nothing; insert into public.colaboradores (nome, criado_por, empresa_id) values (''Fulano F65 int-a'', %L, %L) on conflict (empresa_id, nome_chave) do nothing', k_autor, v_emp_a, k_autor, v_emp_a), false);
  if v_res <> 'passou' then v_cnt := v_cnt + 1; v_rot := v_rot || ' ' || left(v_res, 90); end if;
  if pg_temp.assert_zero_de(
       'J2 no estado intermediário da decisão 5 (o unique global ao lado do por empresa), ON CONFLICT (nome_chave) e ON CONFLICT (empresa_id, nome_chave) inferem os dois' ||
       case when v_cnt > 0 then ' — fora da regra:' || v_rot else '' end, v_cnt, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- F — o "pronto quando" (fato 19): coexiste entre empresas, recusado dentro de uma, pelo NOME contratual
  -- ==========================================================================
  v_cnt := 0; v_rot := '';
  begin
    insert into public.filiais (nome, slug, empresa_id) values ('F65 Matriz', 'matriz', v_emp_b) returning id into v_fbm;
  exception when others then
    v_cnt := v_cnt + 1; v_rot := v_rot || ' matriz-em-B(' || left(sqlstate || ': ' || sqlerrm, 60) || ')';
    insert into public.filiais (nome, slug, empresa_id) values ('F65 Matriz B', 'f65-matriz-b', v_emp_b) returning id into v_fbm;
  end;
  begin
    insert into public.filiais (nome, slug, empresa_id) values ('F65 Matriz', 'matriz', v_emp_c) returning id into v_fcm;
  exception when others then
    v_cnt := v_cnt + 1; v_rot := v_rot || ' matriz-em-C(' || left(sqlstate || ': ' || sqlerrm, 60) || ')';
    insert into public.filiais (nome, slug, empresa_id) values ('F65 Matriz C', 'f65-matriz-c', v_emp_c) returning id into v_fcm;
  end;
  v_res := pg_temp.f65_tentar(format('insert into public.filiais (nome, slug, empresa_id) values (''F65 Outra Matriz'', ''matriz'', %L)', v_emp_b), false);
  if v_res not like '23505:%filiais_slug_key%' then v_cnt := v_cnt + 1; v_rot := v_rot || ' slug-repetido(' || left(v_res, 60) || ')'; end if;
  v_res := pg_temp.f65_tentar(format('insert into public.filiais (nome, slug, empresa_id) values (''F65 Matriz'', ''f65-outra'', %L)', v_emp_b), false);
  if v_res not like '23505:%filiais_nome_chave_uidx%' then v_cnt := v_cnt + 1; v_rot := v_rot || ' nome-repetido(' || left(v_res, 60) || ')'; end if;
  if pg_temp.assert_zero_de(
       'F1 duas empresas têm, cada uma, a filial `matriz` com o mesmo nome; na mesma empresa, o slug e o nome repetidos são recusados (23505, pelo nome contratual)' ||
       case when v_cnt > 0 then ' — fora da regra:' || v_rot else '' end, v_cnt, 3) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- F2: tipo, colaborador, item, kit e apelido — iguais em B e C; repetidos na mesma empresa, recusados pelo nome
  v_c := pg_temp.f65_plantar(v_emp_c, 'int-c', k_autor, 'ZZC');
  v_cnt := 0; v_rot := '';
  foreach v_res2 in array array[
      format('insert into public.tipos_item (slug, rotulo, empresa_id) values (''f65_comum'', ''F65 Comum'', %L)', v_emp_b),
      format('insert into public.tipos_item (slug, rotulo, empresa_id) values (''f65_comum'', ''F65 Comum'', %L)', v_emp_c),
      format('insert into public.colaboradores (nome, criado_por, empresa_id) values (''Fulano F65 Comum'', %L, %L)', k_autor, v_emp_b),
      format('insert into public.colaboradores (nome, criado_por, empresa_id) values (''Fulano F65 Comum'', %L, %L)', k_autor, v_emp_c),
      format('insert into public.itens (nome, grupo, empresa_id) values (''F65 Item Comum'', ''acessorio'', %L)', v_emp_b),
      format('insert into public.itens (nome, grupo, empresa_id) values (''F65 Item Comum'', ''acessorio'', %L)', v_emp_c),
      format('insert into public.kits_modelos (nome, payload, criado_por, empresa_id) values (''F65 Kit Comum'', ''{"tipo": "saida"}''::jsonb, %L, %L)', k_autor, v_emp_b),
      format('insert into public.kits_modelos (nome, payload, criado_por, empresa_id) values (''F65 Kit Comum'', ''{"tipo": "saida"}''::jsonb, %L, %L)', k_autor, v_emp_c),
      format('insert into public.unidades_apelidos (filial_id, apelido, empresa_id) values (%L, ''f65 apelido comum'', %L)', v_fbm, v_emp_b),
      format('insert into public.unidades_apelidos (filial_id, apelido, empresa_id) values (%L, ''f65 apelido comum'', %L)', v_fcm, v_emp_c)] loop
    begin
      execute v_res2;
    exception when others then
      v_cnt := v_cnt + 1; v_rot := v_rot || ' coexistir(' || left(sqlstate || ': ' || sqlerrm, 70) || ')';
    end;
  end loop;
  foreach v_res2 in array array[
      format('insert into public.tipos_item (slug, rotulo, empresa_id) values (''f65_comum'', ''F65 Comum 2'', %L)', v_emp_b) || '|tipos_item_slug_key',
      format('insert into public.colaboradores (nome, criado_por, empresa_id) values (''FULANO f65 comum'', %L, %L)', k_autor, v_emp_b) || '|colaboradores_nome_chave_uidx',
      format('insert into public.itens (nome, grupo, empresa_id) values (''f65 item comum'', ''acessorio'', %L)', v_emp_b) || '|itens_nome_chave_uidx',
      format('insert into public.kits_modelos (nome, payload, criado_por, empresa_id) values (''f65 kit comum'', ''{"tipo": "saida"}''::jsonb, %L, %L)', k_autor, v_emp_b) || '|kits_modelos_nome_uidx',
      format('insert into public.unidades_apelidos (filial_id, apelido, empresa_id) values (%L, ''F65 APELIDO COMUM'', %L)', v_fbm, v_emp_b) || '|unidades_apelidos_apelido_chave_uidx'] loop
    v_res := pg_temp.f65_tentar(split_part(v_res2, '|', 1), false);
    if v_res not like '23505:%' || split_part(v_res2, '|', 2) || '%' then
      v_cnt := v_cnt + 1; v_rot := v_rot || ' ' || split_part(v_res2, '|', 2) || '(' || left(v_res, 60) || ')';
    end if;
  end loop;
  if pg_temp.assert_zero_de(
       'F2 o mesmo tipo, colaborador, item, kit e apelido coexistem em B e em C; repetidos na mesma empresa, são recusados (23505, pelo nome contratual)' ||
       case when v_cnt > 0 then ' — fora da regra:' || v_rot else '' end, v_cnt, 15) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- F3: o mesmo par patrimônio + service tag em duas empresas coexiste; na mesma filial, é recusado
  v_cnt := 0; v_rot := '';
  begin
    insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, empresa_id)
    values ('WAP0065901', 'F65PAR1', 'notebook', v_fbm, 'cadastro', v_emp_b);
    insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, empresa_id)
    values ('WAP0065901', 'F65PAR1', 'notebook', v_fcm, 'cadastro', v_emp_c);
  exception when others then
    v_cnt := v_cnt + 1; v_rot := v_rot || ' coexistir(' || left(sqlstate || ': ' || sqlerrm, 70) || ')';
  end;
  v_res := pg_temp.f65_tentar(format('insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, empresa_id) values (''WAP0065901'', ''F65PAR1'', ''notebook'', %L, ''cadastro'', %L)', v_fbm, v_emp_b), false);
  if v_res not like '23505:%ativos_patrimonio_service_tag_uidx%' then v_cnt := v_cnt + 1; v_rot := v_rot || ' mesma-filial(' || left(v_res, 60) || ')'; end if;
  if pg_temp.assert_zero_de(
       'F3 o mesmo par patrimônio + service tag coexiste em duas empresas; na mesma filial, é recusado (ativos_patrimonio_service_tag_uidx — a regra da F24, por filial, fica como estava)' ||
       case when v_cnt > 0 then ' — fora da regra:' || v_rot else '' end, v_cnt, 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- G — o snapshot: o Consolidado do mesmo período e versão, por empresa
  -- ==========================================================================
  v_cnt := 0; v_rot := '';
  begin
    insert into public.relatorios_gerados (periodo_de, periodo_ate, filial_id, versao, dados, gerado_por, empresa_id)
    values (date '2026-09-06', date '2026-09-12', null, 1, '{}'::jsonb, k_autor, v_emp_b);
    insert into public.relatorios_gerados (periodo_de, periodo_ate, filial_id, versao, dados, gerado_por, empresa_id)
    values (date '2026-09-06', date '2026-09-12', null, 1, '{}'::jsonb, k_autor, v_emp_c);
  exception when others then
    v_cnt := v_cnt + 1; v_rot := v_rot || ' as-duas-empresas(' || left(sqlstate || ': ' || sqlerrm, 80) || ')';
  end;
  if pg_temp.assert_zero_de(
       'G1 duas empresas geram o Consolidado do MESMO período e da MESMA versão, e as duas passam' ||
       case when v_cnt > 0 then ' — fora da regra:' || v_rot else '' end, v_cnt, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_res := pg_temp.f65_tentar(format('insert into public.relatorios_gerados (periodo_de, periodo_ate, filial_id, versao, dados, gerado_por, empresa_id) values (date ''2026-09-06'', date ''2026-09-12'', null, 1, ''{}''::jsonb, %L, %L)', k_autor, v_emp_b), false);
  select count(*) into v_n from public.relatorios_gerados where empresa_id = v_emp_b and filial_id is null and periodo_de = date '2026-09-06';
  if pg_temp.assert_zero_de(
       'G2 na mesma empresa, o segundo Consolidado do período e versão leva 23505 citando relatorios_gerados_periodo_filial_versao_uidx (a segunda pista de ehViolacaoDeVersao), e só um ficou' ||
       case when v_res not like '23505:%relatorios_gerados_periodo_filial_versao_uidx%' or v_n <> 1 then ' — ' || left(v_res, 90) || ' · ficaram ' || v_n else '' end,
       (case when v_res like '23505:%relatorios_gerados_periodo_filial_versao_uidx%' then 0 else 1 end) + (case when v_n = 1 then 0 else 1 end), 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- H — a diagonal nome × apelido, por empresa
  -- ==========================================================================
  -- A tem o apelido "Centro F65" numa filial dela; B tem a filial "F65 Secreta da B".
  insert into public.unidades_apelidos (filial_id, apelido, empresa_id) values ((v_a->>'filiais')::smallint, 'Centro F65', v_emp_a);
  insert into public.filiais (nome, slug, empresa_id) values ('F65 Secreta da B', 'f65-secreta-b', v_emp_b);
  v_cnt := 0; v_rot := '';
  -- H1: B chama uma filial pelo apelido da A — passa
  v_res := pg_temp.f65_tentar(format('insert into public.filiais (nome, slug, empresa_id) values (''Centro F65'', ''f65-centro-b'', %L)', v_emp_b), false);
  if v_res <> 'passou' then v_cnt := v_cnt + 1; v_rot := v_rot || ' B-nomeia-com-o-apelido-da-A(' || left(v_res, 70) || ')'; end if;
  -- e A cadastra como apelido o nome de uma filial da B — passa
  v_res := pg_temp.f65_tentar(format('insert into public.unidades_apelidos (filial_id, apelido, empresa_id) values (%L, ''F65 Secreta da B'', %L)', v_a->>'filiais', v_emp_a), false);
  if v_res <> 'passou' then v_cnt := v_cnt + 1; v_rot := v_rot || ' A-apelida-com-o-nome-da-B(' || left(v_res, 70) || ')'; end if;
  if pg_temp.assert_zero_de(
       'H1 a diagonal é por empresa: B nomeia uma filial com o apelido da A, e A usa como apelido o nome de uma filial da B — os dois passam' ||
       case when v_cnt > 0 then ' — fora da regra:' || v_rot else '' end, v_cnt, 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- H2: em A, o mesmo continua recusado (nas duas pontas), e a mensagem nunca cita filial de outra empresa
  v_cnt := 0; v_rot := '';
  v_res := pg_temp.f65_tentar(format('insert into public.filiais (nome, slug, empresa_id) values (''Centro F65'', ''f65-centro-a'', %L)', v_emp_a), false);
  if v_res not like 'P0001:%já é apelido de outra filial%' then v_cnt := v_cnt + 1; v_rot := v_rot || ' filial-com-apelido-da-A(' || left(v_res, 70) || ')'; end if;
  v_res2 := pg_temp.f65_tentar(format('insert into public.unidades_apelidos (filial_id, apelido, empresa_id) values (%L, ''F65 Filial int-a2'', %L)', v_a->>'filiais', v_emp_a), false);
  if v_res2 not like 'P0001:%já é o nome da filial%' then v_cnt := v_cnt + 1; v_rot := v_rot || ' apelido-com-nome-da-A(' || left(v_res2, 70) || ')'; end if;
  -- nenhuma recusa cita nome de filial da B
  if exists (select 1 from public.filiais f where f.empresa_id = v_emp_b and (v_res || v_res2) like '%' || f.nome || '%') then
    v_cnt := v_cnt + 1; v_rot := v_rot || ' a-mensagem-cita-filial-da-B';
  end if;
  if pg_temp.assert_zero_de(
       'H2 dentro da A a diagonal continua recusando (nome × apelido e apelido × nome), e nenhuma mensagem cita filial de outra empresa' ||
       case when v_cnt > 0 then ' — fora da regra:' || v_rot else '' end, v_cnt, 3) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- H3: o resto do corpo é o da 0139, byte a byte — o prosrc MENOS as duas linhas da F65 tem o md5 da 0139
  select md5(replace(replace(p.prosrc, E'\n       and f.empresa_id = new.empresa_id', ''),
                     E'\n       and ua.empresa_id = new.empresa_id', '')),
         (length(p.prosrc) - length(replace(p.prosrc, 'empresa_id = new.empresa_id', ''))) / length('empresa_id = new.empresa_id')
    into v_m0, v_n
    from pg_proc p where p.oid = to_regprocedure('public.vocabulario_unidades_guarda()');
  if pg_temp.assert_zero_de(
       'H3 o corpo de vocabulario_unidades_guarda() é o da 0139 byte a byte, mais as DUAS linhas da diagonal por empresa (e só elas)' ||
       case when v_m0 is distinct from k_diagonal_0139 or v_n <> 2 then ' — md5 sem as duas: ' || coalesce(v_m0, '∅') || ' · linhas da empresa: ' || coalesce(v_n::text, '∅') else '' end,
       (case when v_m0 = k_diagonal_0139 then 0 else 1 end) + (case when v_n = 2 then 0 else 1 end), 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- I — termos_gerados: a coerência de empresa
  -- ==========================================================================
  v_cnt := 0; v_rot := '';
  v_res := pg_temp.f65_tentar(format('insert into public.termos_gerados (tipo, movimentacao_ids, ativo_ids, dados, arquivo_path, gerado_por, empresa_id) values (''responsabilidade_desktop'', array[%L]::uuid[], array[%L]::uuid[], ''{}''::jsonb, ''f65/i1a.docx'', %L, %L)',
                                     v_b->>'movimentacoes', v_a->>'ativos', k_autor, v_emp_a), false);
  if v_res not like '23503:%não é da empresa do termo%' then v_cnt := v_cnt + 1; v_rot := v_rot || ' movimentacao-da-B(' || left(v_res, 70) || ')'; end if;
  v_res := pg_temp.f65_tentar(format('insert into public.termos_gerados (tipo, movimentacao_ids, ativo_ids, dados, arquivo_path, gerado_por, empresa_id) values (''responsabilidade_desktop'', array[%L]::uuid[], array[%L]::uuid[], ''{}''::jsonb, ''f65/i1b.docx'', %L, %L)',
                                     v_a->>'movimentacoes', v_b->>'ativos', k_autor, v_emp_a), false);
  if v_res not like '23503:%não é da empresa do termo%' then v_cnt := v_cnt + 1; v_rot := v_rot || ' ativo-da-B(' || left(v_res, 70) || ')'; end if;
  v_res := pg_temp.f65_tentar(format('update public.termos_gerados set ativo_ids = array[%L]::uuid[] where id = %L', v_b->>'ativos', v_a->>'termos_gerados'), false);
  if v_res not like '23503:%não é da empresa do termo%' then v_cnt := v_cnt + 1; v_rot := v_rot || ' update-para-ativo-da-B(' || left(v_res, 70) || ')'; end if;
  select count(*) into v_n from public.termos_gerados
   where id = (v_a->>'termos_gerados')::uuid and ativo_ids = array[(v_a->>'ativos')::uuid];
  if v_n <> 1 then v_cnt := v_cnt + 1; v_rot := v_rot || ' o-termo-da-A-mudou'; end if;
  if pg_temp.assert_zero_de(
       'I1 o termo da A que cita movimentação da B, ou ativo da B (no INSERT e no UPDATE dos arrays), é recusado (23503, a frase do termo), e o termo da A ficou como estava' ||
       case when v_cnt > 0 then ' — fora da regra:' || v_rot else '' end, v_cnt, 4) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_cnt := 0; v_rot := '';
  v_res := pg_temp.f65_tentar(format('insert into public.termos_gerados (tipo, movimentacao_ids, ativo_ids, dados, arquivo_path, gerado_por, empresa_id) values (''responsabilidade_desktop'', array[%L]::uuid[], array[%L]::uuid[], ''{}''::jsonb, ''f65/i2.docx'', %L, %L)',
                                     v_b->>'movimentacoes', v_b->>'ativos', k_autor, v_emp_b), false);
  if v_res <> 'passou' then v_cnt := v_cnt + 1; v_rot := v_rot || ' o-coerente(' || left(v_res, 70) || ')'; end if;
  -- o reuso de persistirTermo: UPDATE de dados/arquivo_path reenviando os MESMOS arrays
  v_res := pg_temp.f65_tentar(format('update public.termos_gerados set dados = ''{"f65": true}''::jsonb, arquivo_path = arquivo_path, movimentacao_ids = movimentacao_ids, ativo_ids = ativo_ids, atualizado_em = now(), atualizado_por = %L where id = %L',
                                     k_autor, v_a->>'termos_gerados'), false);
  if v_res <> 'passou' then v_cnt := v_cnt + 1; v_rot := v_rot || ' o-reuso-de-persistirTermo(' || left(v_res, 70) || ')'; end if;
  if pg_temp.assert_zero_de(
       'I2 o termo coerente passa, e o UPDATE de dados/arquivo_path que reenvia os mesmos arrays (o reuso de persistirTermo) passa' ||
       case when v_cnt > 0 then ' — fora da regra:' || v_rot else '' end, v_cnt, 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- L — o instrumento: relfilenode e md5 de (chave, xmin)
  -- ==========================================================================
  create table public.f65_instrumento_pai (empresa_id uuid not null, id int primary key, v text);
  create table public.f65_instrumento_filho (empresa_id uuid not null, id int primary key,
                                             pai_id int constraint f65_instrumento_filho_pai_fkey references public.f65_instrumento_pai (id),
                                             nome text);
  create unique index f65_instrumento_filho_nome_uidx on public.f65_instrumento_filho (nome);
  insert into public.f65_instrumento_pai select v_emp_a, g, 'v' || g from generate_series(1, 20) g;
  insert into public.f65_instrumento_filho select v_emp_a, g, g, 'n' || g from generate_series(1, 20) g;
  v_r0 := pg_relation_filenode('public.f65_instrumento_filho'::regclass);
  select md5(string_agg(id::text || ':' || xmin::text, ',' order by id)) into v_m0 from public.f65_instrumento_filho;
  -- L1: um update numa subtransação: relfilenode igual, md5 de (chave, xmin) diferente
  v_r1 := null; v_m1 := null;
  begin
    update public.f65_instrumento_filho set nome = nome where id = 7;
    v_r1 := pg_relation_filenode('public.f65_instrumento_filho'::regclass);
    select md5(string_agg(id::text || ':' || xmin::text, ',' order by id)) into v_m1 from public.f65_instrumento_filho;
    raise exception 'f65-l1-desfaz';
  exception when others then
    if sqlerrm <> 'f65-l1-desfaz' then v_r1 := 0; end if;
  end;
  if pg_temp.assert_zero_de(
       'L1 um update de uma linha numa subtransação deixa o relfilenode igual e MUDA o md5 de (chave, xmin)',
       (case when v_r1 = v_r0 then 0 else 1 end) + (case when v_m1 is distinct from v_m0 then 0 else 1 end), 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- L3: as operações da fase — unique novo no pai, FK trocada pela composta de MESMO nome, PK trocada, índice
  --     provisório → rename — não mudam nem o relfilenode nem o md5 de (chave, xmin)
  v_r0 := pg_relation_filenode('public.f65_instrumento_filho'::regclass);
  v_r1 := pg_relation_filenode('public.f65_instrumento_pai'::regclass);
  select md5(string_agg(id::text || ':' || xmin::text, ',' order by id)) into v_m0 from public.f65_instrumento_filho;
  select md5(string_agg(id::text || ':' || xmin::text, ',' order by id)) into v_m1 from public.f65_instrumento_pai;
  alter table public.f65_instrumento_pai add constraint f65_instrumento_pai_empresa_id_uidx unique (empresa_id, id);
  alter table public.f65_instrumento_filho
    drop constraint f65_instrumento_filho_pai_fkey,
    add constraint f65_instrumento_filho_pai_fkey foreign key (empresa_id, pai_id) references public.f65_instrumento_pai (empresa_id, id);
  alter table public.f65_instrumento_filho drop constraint f65_instrumento_filho_pkey, add constraint f65_instrumento_filho_pkey primary key (empresa_id, id);
  create unique index f65_instrumento_filho_nome_uidx_f65 on public.f65_instrumento_filho (empresa_id, nome);
  drop index public.f65_instrumento_filho_nome_uidx;
  alter index public.f65_instrumento_filho_nome_uidx_f65 rename to f65_instrumento_filho_nome_uidx;
  select (case when pg_relation_filenode('public.f65_instrumento_filho'::regclass) = v_r0 then 0 else 1 end)
       + (case when pg_relation_filenode('public.f65_instrumento_pai'::regclass) = v_r1 then 0 else 1 end)
       + (case when (select md5(string_agg(id::text || ':' || xmin::text, ',' order by id)) from public.f65_instrumento_filho) = v_m0 then 0 else 1 end)
       + (case when (select md5(string_agg(id::text || ':' || xmin::text, ',' order by id)) from public.f65_instrumento_pai) = v_m1 then 0 else 1 end)
    into v_cnt;
  if pg_temp.assert_zero_de(
       'L3 as operações da F65 (unique (empresa_id, id), FK composta de mesmo nome, PK trocada, índice provisório → rename) não mudam o relfilenode nem o md5 de (chave, xmin), no pai e no filho',
       v_cnt, 4) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- L2: um alter column … type (com reescrita) MUDA o relfilenode
  v_r0 := pg_relation_filenode('public.f65_instrumento_pai'::regclass);
  alter table public.f65_instrumento_pai alter column v type int using length(v);
  if pg_temp.assert_zero_de(
       'L2 um alter column … type com reescrita MUDA o relfilenode (o instrumento vê a reescrita)',
       case when pg_relation_filenode('public.f65_instrumento_pai'::regclass) <> v_r0 then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- L4: o corpo das funções que a F65 não cria nem recria é o de antes da 0165
  select md5(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc), E'\n' order by p.oid::regprocedure::text))
    into v_m0
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname not in ('guarda_empresa', 'termo_da_empresa', 'vocabulario_unidades_guarda');
  raise notice '(medição) L4: md5 das funções de public fora das três da F65: %', v_m0;
  if pg_temp.assert_zero_de(
       'L4 o corpo das funções de public que a F65 não cria nem recria é o de antes da 0165 (md5 contra a constante do CI)' ||
       case when v_m0 is distinct from k_funcoes_pre_0165 then ' — ' || coalesce(v_m0, '∅') || ', esperado ' || k_funcoes_pre_0165 else '' end,
       case when v_m0 = k_funcoes_pre_0165 then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM integridade_tenant: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
