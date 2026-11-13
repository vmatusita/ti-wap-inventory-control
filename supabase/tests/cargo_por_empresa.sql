-- =============================================================
-- Roteiro de teste: O CARGO POR EMPRESA, O PISO PAREADO E AS DESTRUTIVAS COM A EMPRESA (F67, 13/11/2026)
-- =============================================================
-- POR QUE ELE EXISTE
--
-- A F67 faz o cargo valer POR EMPRESA em tudo que atravessa a RLS (docs/PLAN-F67.md). Este roteiro é a trava de três
-- fatos que nenhum outro prova:
--
--   P — AS PRIMITIVAS POR EMPRESA (0185): `papel_na_empresa`, `e_admin_na`, `e_dev_na`, `pode_escrever_na` e
--       `pode_escrever_unidade` — a grade pessoa × empresa (× filial), com o argumento nulo fechando, a empresa testada
--       ANTES do cargo (o admin da A NÃO passa na filial da B), o dev = dev membro OU a plataforma, o admin alcançando a
--       filial desativada; `pode_escrever_filial` respondendo pela empresa DA FILIAL; e o PISO (`papel_atual()`) como "o
--       cargo mais forte entre as memberships ativas" (0188).
--   Q — A TRAVA DO PISO (decisões 2 e 3): (a) nenhum corpo de função de `public` chama o cargo SEM empresa
--       (`papel_atual()`, `e_admin()`, `e_dev()`, `pode_escrever()`) fora da própria família, por nome; (b) toda policy de
--       QUALQUER esquema que o cita o tem na CONJUNÇÃO DE CIMA, junto com o recorte do MESMO cargo, também na conjunção
--       de cima (`papel_atual` ↔ `empresas_do_membro`, `e_admin` ↔ `empresas_de_admin`, `pode_escrever` ↔
--       `empresas_de_escrita`/`unidades_de_escrita`) — lida da expressão DESPARSEADA pelo Postgres (`pg_get_expr`),
--       partida no AND do topo com a profundidade de parênteses; um piso dentro de OR, ou sem o par, ou com o par de
--       cargo mais fraco, reprova; (c) a sabotagem B prova os quatro jeitos de errar.
--   D — A TRAVA DAS DESTRUTIVAS (decisão 5), no catálogo: toda função da lista nominal tem `p_empresa uuid` como 1º
--       argumento e SEM default; `rotulo_alcance_reset` conta (`count(`); nenhum comando de uma destrutiva tem
--       `p_filial is null` sem `empresa_id = p_empresa` NO MESMO COMANDO (o código partido por `;`); e a sentinela do
--       "tudo" carrega a empresa (`hashtext(p_empresa::text)`, nunca `-1`). A sabotagem D prova os quatro jeitos.
--
-- ANTES DA F67 ESTE ROTEIRO É VERMELHO (regra 4 da §4 do plano): as primitivas não existem (P0) e o piso tem consumidor
-- sem par (Q). Roda inteiro dentro de `begin; … rollback;` — as fixtures e as sabotagens nascem e morrem aqui.
-- Dados 100% fictícios (regra 2 do CLAUDE.md).
-- =============================================================

begin;

-- -------------------------------------------------------------------------------------------------
-- Os ajudantes deste roteiro (pg_temp: morrem com a sessão).
-- -------------------------------------------------------------------------------------------------
-- A conjunção de CIMA de uma expressão DESPARSEADA pelo Postgres (pg_get_expr): tira o par de parênteses que embrulha a
-- expressão inteira e parte no AND de profundidade zero, achatando ANDs aninhados. O texto entre aspas some antes (um
-- AND dentro de um literal não parte nada).
create or replace function pg_temp.f67_conjuncao(p_expr text)
returns text[]
language plpgsql
as $fn$
declare
  v        text := btrim(regexp_replace(p_expr, '''([^'']|'''')*''', '''''', 'g'));
  v_prof   int;
  v_i      int;
  v_ini    int;
  v_partes text[] := '{}';
  v_saida  text[] := '{}';
  v_x      text;
  v_volta  boolean;
begin
  -- tira os parênteses que embrulham TUDO (quantas camadas houver)
  loop
    v_volta := false;
    if left(v, 1) = '(' and right(v, 1) = ')' then
      v_prof := 0;
      v_volta := true;
      for v_i in 1..length(v) loop
        if substr(v, v_i, 1) = '(' then v_prof := v_prof + 1;
        elsif substr(v, v_i, 1) = ')' then v_prof := v_prof - 1;
        end if;
        if v_prof = 0 and v_i < length(v) then v_volta := false; exit; end if;
      end loop;
    end if;
    exit when not v_volta;
    v := btrim(substr(v, 2, length(v) - 2));
  end loop;
  -- parte no AND de profundidade zero
  v_prof := 0; v_ini := 1; v_i := 1;
  while v_i <= length(v) loop
    if substr(v, v_i, 1) = '(' then v_prof := v_prof + 1;
    elsif substr(v, v_i, 1) = ')' then v_prof := v_prof - 1;
    elsif v_prof = 0 and upper(substr(v, v_i, 5)) = ' AND ' then
      v_partes := v_partes || btrim(substr(v, v_ini, v_i - v_ini));
      v_ini := v_i + 5; v_i := v_i + 4;
    end if;
    v_i := v_i + 1;
  end loop;
  v_partes := v_partes || btrim(substr(v, v_ini));
  if cardinality(v_partes) = 1 then
    return v_partes;
  end if;
  foreach v_x in array v_partes loop
    v_saida := v_saida || pg_temp.f67_conjuncao(v_x);
  end loop;
  return v_saida;
end;
$fn$;

-- NULL se a expressão de uma policy não cita o piso, ou o cita SÓ na conjunção de cima e com o recorte do MESMO cargo
-- também na conjunção de cima; senão, o motivo. O piso é a CHAMADA sem argumento de papel_atual/e_admin/e_dev/
-- pode_escrever; o termo do piso, na conjunção de cima, é a chamada sozinha (com o embrulho do select e o is not null).
create or replace function pg_temp.f67_piso_sem_par(p_expr text)
returns text
language plpgsql
as $fn$
declare
  v_re_piso constant text := '\m(papel_atual|e_admin|e_dev|pode_escrever)\(\)';
  v_conj    text[];
  v_c       text;
  v_puro    text;
  v_pisos   text[] := '{}';
  v_m       text[];
  v_par     text;
begin
  if p_expr is null or p_expr !~ v_re_piso then
    return null;
  end if;
  v_conj := pg_temp.f67_conjuncao(p_expr);
  foreach v_c in array v_conj loop
    continue when v_c !~ v_re_piso;
    -- o termo do piso SOZINHO: (SELECT [public.]x() AS x) [IS NOT NULL], com os parênteses que vierem
    v_puro := regexp_replace(v_c, '[()]', '', 'g');
    v_puro := regexp_replace(v_puro, '\s+', ' ', 'g');
    v_puro := btrim(v_puro);
    if v_puro !~* '^(SELECT )?(public\.)?(papel_atual|e_admin|e_dev|pode_escrever) ?(AS [a-z_]+)?( IS NOT NULL)?$' then
      return 'piso fora da conjunção de cima ou misturado: ' || left(v_c, 90);
    end if;
    v_m := regexp_match(v_puro, '(papel_atual|e_admin|e_dev|pode_escrever)');
    v_pisos := v_pisos || v_m[1];
  end loop;
  if cardinality(v_pisos) = 0 then
    return 'piso fora da conjunção de cima';
  end if;
  foreach v_c in array v_pisos loop
    v_par := case v_c
               when 'papel_atual' then '\mempresas_do_membro\(\)'
               when 'e_admin' then '\mempresas_de_admin\(\)'
               when 'pode_escrever' then '\m(empresas_de_escrita|unidades_de_escrita)\(\)'
               else null end;
    if v_par is null then
      return v_c || '() não tem par de recorte';
    end if;
    if not exists (select 1 from unnest(v_conj) as c(x) where c.x ~ v_par and c.x !~* '\mOR\M') then
      return v_c || '() sem o recorte do mesmo cargo na conjunção de cima';
    end if;
  end loop;
  return null;
end;
$fn$;

-- NULL se o 1º argumento de entrada é p_empresa uuid e não tem default; senão, o motivo.
create or replace function pg_temp.f67_empresa_primeiro(p_oid oid)
returns text
language sql
as $fn$
  select case
           when p.pronargs = 0 then 'sem argumento'
           when (p.proargnames)[1] is distinct from 'p_empresa' then '1º argumento não é p_empresa'
           when p.proargtypes[0] <> 'uuid'::regtype::oid then 'p_empresa não é uuid'
           when p.pronargdefaults = p.pronargs then 'p_empresa com default'
           else null
         end
    from pg_proc p where p.oid = p_oid
$fn$;

-- NULL se nenhum COMANDO do corpo (o código partido por ;) tem p_filial is null sem empresa_id = p_empresa; senão, o
-- trecho do primeiro que tem.
create or replace function pg_temp.f67_tudo_sem_empresa(p_corpo text)
returns text
language plpgsql
as $fn$
declare
  v_cmd text;
begin
  for v_cmd in select s from regexp_split_to_table(lower(pg_temp.sql_so_codigo(p_corpo)), ';') as s loop
    if v_cmd ~ '\mp_filial\s+is\s+null\M' and v_cmd !~ '\mempresa_id\s*=\s*p_empresa\M' then
      return left(btrim(regexp_replace(v_cmd, '\s+', ' ', 'g')), 90);
    end if;
  end loop;
  return null;
end;
$fn$;

do $$
declare
  v_ok      int := 0;
  v_falhas  int := 0;
  v_cnt     bigint;
  v_univ    bigint;
  v_lista   text;
  v_rot     text;
  v_res     text;
  v_txt     text;
  r         record;

  v_emp_a   uuid;
  v_emp_b   uuid;
  k_emp_c   constant uuid := '00000000-f67c-4000-8000-0000000000cc';  -- empresa que NÃO existe
  v_fa1     smallint;
  v_fa2     smallint;
  v_fa_in   smallint;
  v_fb      smallint;

  k_admin_a    constant uuid := '00000000-f67c-4000-8000-0000000000a1';
  k_oper_a     constant uuid := '00000000-f67c-4000-8000-0000000000a2';
  k_dev_a      constant uuid := '00000000-f67c-4000-8000-0000000000a3';
  k_admin_b    constant uuid := '00000000-f67c-4000-8000-0000000000b1';
  k_oper_b     constant uuid := '00000000-f67c-4000-8000-0000000000b2';
  k_consultor  constant uuid := '00000000-f67c-4000-8000-0000000000c1';
  k_plataforma constant uuid := '00000000-f67c-4000-8000-0000000000d1';
  k_inativo    constant uuid := '00000000-f67c-4000-8000-0000000000e1';
  k_arquivado  constant uuid := '00000000-f67c-4000-8000-0000000000e2';

  -- A FAMÍLIA DO PISO: as únicas funções de public cujo corpo pode chamar o cargo SEM empresa (elas derivam umas das
  -- outras). Lista nominal — uma função nova que precise do piso no corpo é decisão, não descuido.
  k_familia_piso constant text[] := array['papel_atual', 'e_admin', 'pode_escrever'];
  -- O PAR de cada piso: o recorte do MESMO cargo (a doutrina da F66, k_recorte_classe de catalogo_policies.sql).
  k_pares constant text[] := array[
    'papel_atual:empresas_do_membro', 'e_admin:empresas_de_admin',
    'pode_escrever:empresas_de_escrita', 'pode_escrever:unidades_de_escrita'
  ];
  -- AS DESTRUTIVAS, a mesa, o import e as cinco de conta, e as auxiliares delas: `p_empresa uuid` 1º, sem default.
  k_destrutivas constant text[] := array[
    'resetar_acervo', 'resetar_itens', 'previa_reset', 'apagar_ativo', 'apagar_item', 'apagar_movimentacao',
    'forcar_estado_ativo', 'forcar_saldo_item', 'apagar_ativos_conflito_filiais', 'importar_ativos_substituir',
    'apagar_usuario', 'definir_papel_usuario', 'definir_status_usuario', 'definir_vinculos_usuario',
    'encerrar_sessoes_usuario', 'exigir_dev_para_destruir', 'rotulo_alcance_reset', 'exigir_ativos_da_empresa',
    'exigir_gestao_de', 'mesmo_escopo_de_gestao'
  ];
begin
  -- ===========================================================================================
  -- P0 — as primitivas existem (antes da F67: não existem, e o roteiro para aqui, VERMELHO)
  -- ===========================================================================================
  if to_regprocedure('public.papel_na_empresa(uuid)') is null
     or to_regprocedure('public.pode_escrever_unidade(uuid, smallint)') is null then
    -- antes da F67: a grade P1–P6 não tem o que avaliar; Q e D rodam assim mesmo (o vermelho real da trava)
    v_falhas := v_falhas + 1;
    raise warning '✗ P0 as formas de cargo POR EMPRESA não existem (papel_na_empresa, pode_escrever_unidade — a F67 as cria na 0185)';
  else
  v_ok := v_ok + 1;
  raise notice '✓ P0 as cinco formas de cargo por empresa existem';

  -- ---------------------------------------------------------------- as fixtures (como postgres)
  v_emp_a := public.empresa_legada();
  insert into public.empresas (slug, nome) values ('f67-cargo-b', 'Empresa B do cargo por empresa (F67)')
  returning id into v_emp_b;
  select id into v_fa1 from public.filiais where empresa_id = v_emp_a and ativo order by id limit 1;
  insert into public.filiais (nome, slug, empresa_id) values ('F67 Cargo A2', 'f67-cargo-a2', v_emp_a) returning id into v_fa2;
  insert into public.filiais (nome, slug, empresa_id, ativo) values ('F67 Cargo A inativa', 'f67-cargo-a-inativa', v_emp_a, false)
  returning id into v_fa_in;
  insert into public.filiais (nome, slug, empresa_id) values ('F67 Cargo B', 'f67-cargo-b-matriz', v_emp_b) returning id into v_fb;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.email, '', now(), now(), now()
    from (values
      (k_admin_a, 'f67.admin.a@wap.ind.br'), (k_oper_a, 'f67.oper.a@wap.ind.br'), (k_dev_a, 'f67.dev.a@wap.ind.br'),
      (k_admin_b, 'f67.admin.b@wap.ind.br'), (k_oper_b, 'f67.oper.b@wap.ind.br'), (k_consultor, 'f67.consultor@wap.ind.br'),
      (k_plataforma, 'f67.plataforma@wap.ind.br'), (k_inativo, 'f67.inativo@wap.ind.br'), (k_arquivado, 'f67.arquivado@wap.ind.br')
    ) as x(id, email);

  perform pg_temp.plantar_cargo(k_admin_a, 'admin');
  perform pg_temp.plantar_cargo(k_oper_a, 'operador');
  insert into public.operador_filiais (usuario_id, filial_id) values (k_oper_a, v_fa1);
  perform pg_temp.plantar_cargo(k_dev_a, 'dev');
  delete from public.membros where profile_id in (k_admin_b, k_oper_b) and empresa_id = v_emp_a;
  perform pg_temp.plantar_cargo(k_admin_b, 'admin', true, v_emp_b);
  perform pg_temp.plantar_cargo(k_oper_b, 'operador', true, v_emp_b);
  insert into public.operador_filiais (usuario_id, filial_id, empresa_id, membro_id)
  select k_oper_b, v_fb, v_emp_b, m.id from public.membros m where m.profile_id = k_oper_b and m.empresa_id = v_emp_b;
  perform pg_temp.plantar_cargo(k_consultor, 'admin');
  perform pg_temp.plantar_cargo(k_consultor, 'consulta', true, v_emp_b);
  perform pg_temp.plantar_cargo(k_plataforma, 'dev');
  insert into public.plataforma_admins (profile_id) values (k_plataforma);
  perform pg_temp.plantar_cargo(k_inativo, 'operador', false);
  perform pg_temp.plantar_cargo(k_arquivado, 'admin');
  perform set_config('estoque.gestao_usuarios', 'on', true);
  update public.profiles set excluido_em = now() where id = k_arquivado;
  perform set_config('estoque.gestao_usuarios', 'off', true);

  -- ===========================================================================================
  -- P1..P6 — a grade, pessoa a pessoa (a identidade nas claims; as funções são definer e leem auth.uid())
  -- ===========================================================================================
  create temp table f67_grade on commit drop as
    select * from (values
      -- P1 — argumento nulo FECHA
      ('P1', k_admin_a,    'public.papel_na_empresa(null)',                       '∅'),
      ('P1', k_plataforma, 'public.papel_na_empresa(null)',                       '∅'),
      ('P1', k_plataforma, 'public.e_admin_na(null)',                             'false'),
      ('P1', k_plataforma, 'public.e_dev_na(null)',                               'false'),
      ('P1', k_plataforma, 'public.pode_escrever_na(null)',                       'false'),
      ('P1', k_admin_a,    format('public.pode_escrever_unidade(null, %s::smallint)', v_fa1), 'false'),
      ('P1', k_admin_a,    format('public.pode_escrever_unidade(%L::uuid, null)', v_emp_a),   'false'),
      ('P1', k_plataforma, 'public.pode_escrever_unidade(null, null)',            'false'),
      -- P2 — o cargo NA EMPRESA (a membership ATIVA dela; a plataforma = dev em toda empresa que EXISTE)
      ('P2', k_admin_a,    format('public.papel_na_empresa(%L::uuid)', v_emp_a), 'admin'),
      ('P2', k_admin_a,    format('public.papel_na_empresa(%L::uuid)', v_emp_b), '∅'),
      ('P2', k_oper_a,     format('public.papel_na_empresa(%L::uuid)', v_emp_a), 'operador'),
      ('P2', k_dev_a,      format('public.papel_na_empresa(%L::uuid)', v_emp_a), 'dev'),
      ('P2', k_dev_a,      format('public.papel_na_empresa(%L::uuid)', v_emp_b), '∅'),
      ('P2', k_admin_b,    format('public.papel_na_empresa(%L::uuid)', v_emp_a), '∅'),
      ('P2', k_admin_b,    format('public.papel_na_empresa(%L::uuid)', v_emp_b), 'admin'),
      ('P2', k_oper_b,     format('public.papel_na_empresa(%L::uuid)', v_emp_b), 'operador'),
      ('P2', k_consultor,  format('public.papel_na_empresa(%L::uuid)', v_emp_a), 'admin'),
      ('P2', k_consultor,  format('public.papel_na_empresa(%L::uuid)', v_emp_b), 'consulta'),
      ('P2', k_plataforma, format('public.papel_na_empresa(%L::uuid)', v_emp_a), 'dev'),
      ('P2', k_plataforma, format('public.papel_na_empresa(%L::uuid)', v_emp_b), 'dev'),
      ('P2', k_plataforma, format('public.papel_na_empresa(%L::uuid)', k_emp_c), '∅'),
      ('P2', k_inativo,    format('public.papel_na_empresa(%L::uuid)', v_emp_a), '∅'),
      ('P2', k_arquivado,  format('public.papel_na_empresa(%L::uuid)', v_emp_a), '∅'),
      -- P3 — as três derivadas, POR EMPRESA (a hierarquia estrita, e o dev = dev membro OU plataforma)
      ('P3', k_admin_a,    format('public.e_admin_na(%L::uuid)', v_emp_a),       'true'),
      ('P3', k_admin_a,    format('public.e_admin_na(%L::uuid)', v_emp_b),       'false'),
      ('P3', k_admin_a,    format('public.e_dev_na(%L::uuid)', v_emp_a),         'false'),
      ('P3', k_dev_a,      format('public.e_dev_na(%L::uuid)', v_emp_a),         'true'),
      ('P3', k_dev_a,      format('public.e_dev_na(%L::uuid)', v_emp_b),         'false'),
      ('P3', k_plataforma, format('public.e_dev_na(%L::uuid)', v_emp_b),         'true'),
      ('P3', k_plataforma, format('public.e_admin_na(%L::uuid)', v_emp_b),       'true'),
      ('P3', k_admin_b,    format('public.e_admin_na(%L::uuid)', v_emp_b),       'true'),
      ('P3', k_admin_b,    format('public.e_admin_na(%L::uuid)', v_emp_a),       'false'),
      ('P3', k_consultor,  format('public.pode_escrever_na(%L::uuid)', v_emp_b), 'false'),
      ('P3', k_consultor,  format('public.pode_escrever_na(%L::uuid)', v_emp_a), 'true'),
      ('P3', k_oper_b,     format('public.pode_escrever_na(%L::uuid)', v_emp_b), 'true'),
      ('P3', k_oper_b,     format('public.e_admin_na(%L::uuid)', v_emp_b),       'false'),
      ('P3', k_inativo,    format('public.pode_escrever_na(%L::uuid)', v_emp_a), 'false'),
      -- P4 — pode_escrever_unidade: a filial é DAQUELA empresa ANTES do cargo; o admin alcança a filial desativada
      ('P4', k_admin_a,    format('public.pode_escrever_unidade(%L::uuid, %s::smallint)', v_emp_a, v_fa1),   'true'),
      ('P4', k_admin_a,    format('public.pode_escrever_unidade(%L::uuid, %s::smallint)', v_emp_a, v_fa_in), 'true'),
      ('P4', k_admin_a,    format('public.pode_escrever_unidade(%L::uuid, %s::smallint)', v_emp_a, v_fb),    'false'),
      ('P4', k_admin_a,    format('public.pode_escrever_unidade(%L::uuid, %s::smallint)', v_emp_b, v_fb),    'false'),
      ('P4', k_oper_a,     format('public.pode_escrever_unidade(%L::uuid, %s::smallint)', v_emp_a, v_fa1),   'true'),
      ('P4', k_oper_a,     format('public.pode_escrever_unidade(%L::uuid, %s::smallint)', v_emp_a, v_fa2),   'false'),
      ('P4', k_admin_b,    format('public.pode_escrever_unidade(%L::uuid, %s::smallint)', v_emp_b, v_fb),    'true'),
      ('P4', k_admin_b,    format('public.pode_escrever_unidade(%L::uuid, %s::smallint)', v_emp_b, v_fa1),   'false'),
      ('P4', k_oper_b,     format('public.pode_escrever_unidade(%L::uuid, %s::smallint)', v_emp_b, v_fb),    'true'),
      ('P4', k_oper_b,     format('public.pode_escrever_unidade(%L::uuid, %s::smallint)', v_emp_a, v_fa1),   'false'),
      ('P4', k_consultor,  format('public.pode_escrever_unidade(%L::uuid, %s::smallint)', v_emp_b, v_fb),    'false'),
      ('P4', k_plataforma, format('public.pode_escrever_unidade(%L::uuid, %s::smallint)', v_emp_b, v_fb),    'true'),
      ('P4', k_plataforma, format('public.pode_escrever_unidade(%L::uuid, %s::smallint)', v_emp_a, v_fb),    'false'),
      -- P5 — pode_escrever_filial responde pela EMPRESA DA FILIAL (o defeito da ficha: dev/admin em qualquer filial)
      ('P5', k_admin_a,    format('public.pode_escrever_filial(%s::smallint)', v_fa1),   'true'),
      ('P5', k_admin_a,    format('public.pode_escrever_filial(%s::smallint)', v_fa_in), 'true'),
      ('P5', k_admin_a,    format('public.pode_escrever_filial(%s::smallint)', v_fb),    'false'),
      ('P5', k_admin_a,    'public.pode_escrever_filial(32000::smallint)',               'false'),
      ('P5', k_oper_b,     format('public.pode_escrever_filial(%s::smallint)', v_fb),    'true'),
      ('P5', k_oper_b,     format('public.pode_escrever_filial(%s::smallint)', v_fa1),   'false'),
      ('P5', k_plataforma, format('public.pode_escrever_filial(%s::smallint)', v_fb),    'true'),
      ('P5', k_consultor,  format('public.pode_escrever_filial(%s::smallint)', v_fb),    'false'),
      -- P6 — o PISO: o cargo MAIS FORTE entre as memberships ativas (só pareado em policy)
      ('P6', k_admin_a,    'public.papel_atual()',   'admin'),
      ('P6', k_oper_b,     'public.papel_atual()',   'operador'),
      ('P6', k_consultor,  'public.papel_atual()',   'admin'),
      ('P6', k_plataforma, 'public.papel_atual()',   'dev'),
      ('P6', k_inativo,    'public.papel_atual()',   '∅'),
      ('P6', k_arquivado,  'public.papel_atual()',   '∅'),
      ('P6', k_admin_b,    'public.e_admin()',       'true'),
      ('P6', k_oper_b,     'public.e_admin()',       'false'),
      ('P6', k_oper_b,     'public.pode_escrever()', 'true')
    ) as t(rot, pessoa, expr, esperado);
  -- cada caso avaliado com a identidade nas claims; o resultado vai para a própria tabela da grade
  alter table f67_grade add column obtido text;
  for r in select g.ctid as linha, g.* from f67_grade g loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.pessoa, 'role', 'authenticated')::text, true);
    execute 'select coalesce((' || r.expr || ')::text, ''∅'')' into v_res;
    perform set_config('request.jwt.claims', '', true);
    update f67_grade set obtido = v_res where ctid = r.linha;
  end loop;

  -- os seis rótulos, LITERAIS (o injetor de mutações os acha no fonte por `assert_zero_de('<rótulo>'`)
  select count(*) filter (where obtido is distinct from esperado), count(*),
         coalesce(string_agg(right(pessoa::text, 2) || ':' || expr || '=' || obtido || '(esperado ' || esperado || ')', ' ')
                    filter (where obtido is distinct from esperado), '')
    into v_cnt, v_univ, v_lista from f67_grade where rot = 'P1';
  if pg_temp.assert_zero_de('P1 argumento nulo fecha em todas as formas por empresa' ||
       case when v_cnt > 0 then ' — fora: ' || v_lista else '' end, v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  select count(*) filter (where obtido is distinct from esperado), count(*),
         coalesce(string_agg(right(pessoa::text, 2) || ':' || expr || '=' || obtido || '(esperado ' || esperado || ')', ' ')
                    filter (where obtido is distinct from esperado), '')
    into v_cnt, v_univ, v_lista from f67_grade where rot = 'P2';
  if pg_temp.assert_zero_de('P2 papel_na_empresa responde o cargo NAQUELA empresa (a plataforma = dev em toda empresa que existe)' ||
       case when v_cnt > 0 then ' — fora: ' || v_lista else '' end, v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  select count(*) filter (where obtido is distinct from esperado), count(*),
         coalesce(string_agg(right(pessoa::text, 2) || ':' || expr || '=' || obtido || '(esperado ' || esperado || ')', ' ')
                    filter (where obtido is distinct from esperado), '')
    into v_cnt, v_univ, v_lista from f67_grade where rot = 'P3';
  if pg_temp.assert_zero_de('P3 e_admin_na, e_dev_na e pode_escrever_na derivam do cargo naquela empresa (dev = membro dev OU plataforma)' ||
       case when v_cnt > 0 then ' — fora: ' || v_lista else '' end, v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  select count(*) filter (where obtido is distinct from esperado), count(*),
         coalesce(string_agg(right(pessoa::text, 2) || ':' || expr || '=' || obtido || '(esperado ' || esperado || ')', ' ')
                    filter (where obtido is distinct from esperado), '')
    into v_cnt, v_univ, v_lista from f67_grade where rot = 'P4';
  if pg_temp.assert_zero_de('P4 pode_escrever_unidade testa a empresa da filial ANTES do cargo; o admin alcança a filial desativada' ||
       case when v_cnt > 0 then ' — fora: ' || v_lista else '' end, v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  select count(*) filter (where obtido is distinct from esperado), count(*),
         coalesce(string_agg(right(pessoa::text, 2) || ':' || expr || '=' || obtido || '(esperado ' || esperado || ')', ' ')
                    filter (where obtido is distinct from esperado), '')
    into v_cnt, v_univ, v_lista from f67_grade where rot = 'P5';
  if pg_temp.assert_zero_de('P5 pode_escrever_filial responde pela empresa da filial (o admin da A não pode na filial da B)' ||
       case when v_cnt > 0 then ' — fora: ' || v_lista else '' end, v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  select count(*) filter (where obtido is distinct from esperado), count(*),
         coalesce(string_agg(right(pessoa::text, 2) || ':' || expr || '=' || obtido || '(esperado ' || esperado || ')', ' ')
                    filter (where obtido is distinct from esperado), '')
    into v_cnt, v_univ, v_lista from f67_grade where rot = 'P6';
  if pg_temp.assert_zero_de('P6 o piso papel_atual() é o cargo mais forte entre as memberships ativas' ||
       case when v_cnt > 0 then ' — fora: ' || v_lista else '' end, v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  end if;  -- P0

  -- ===========================================================================================
  -- Q — A TRAVA DO PISO
  -- ===========================================================================================
  -- Qa — nenhum CORPO de função chama o cargo sem empresa (o código, sem comentário nem texto), fora da família.
  select count(*) filter (where pg_temp.sql_so_codigo(p.prosrc) ~ '\m(papel_atual|e_admin|e_dev|pode_escrever)\s*\(\s*\)'
                            and not (p.proname = any (k_familia_piso))),
         coalesce(string_agg(p.proname, ', ' order by p.proname)
                    filter (where pg_temp.sql_so_codigo(p.prosrc) ~ '\m(papel_atual|e_admin|e_dev|pode_escrever)\s*\(\s*\)'
                              and not (p.proname = any (k_familia_piso))), ''),
         count(*)
    into v_cnt, v_lista, v_univ
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f';
  if pg_temp.assert_zero_de('Qa nenhum corpo de função de public chama o cargo SEM empresa (papel_atual(), e_admin(), e_dev(), pode_escrever()) fora da família do piso' ||
       case when v_cnt > 0 then ' — chama: ' || v_lista else '' end, v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- Qb — toda policy, de QUALQUER esquema, que cita o piso o tem na conjunção de cima COM o par do mesmo cargo.
  select count(*), count(*) filter (where pg_temp.f67_piso_sem_par(a.expr) is not null),
         coalesce(string_agg(a.chave || ' [' || pg_temp.f67_piso_sem_par(a.expr) || ']', '; ' order by a.chave)
                    filter (where pg_temp.f67_piso_sem_par(a.expr) is not null), '')
    into v_univ, v_cnt, v_lista
    from (
      select n.nspname || '.' || c.relname || ' / ' || p.polname || ' / ' || x.clausula as chave, x.expr
        from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        cross join lateral (values ('using', pg_get_expr(p.polqual, p.polrelid)),
                                   ('with check', pg_get_expr(p.polwithcheck, p.polrelid))) as x(clausula, expr)
       where x.expr is not null
    ) a;
  if pg_temp.assert_zero_de('Qb toda policy (de qualquer esquema) que cita o piso o tem na conjunção de cima, com o recorte do MESMO cargo também nela' ||
       case when v_cnt > 0 then ' — fora: ' || v_lista else '' end, v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- Qc — A SABOTAGEM B: cada um dos quatro jeitos de errar é ACUSADO, pelo nome.
  --   B1 um corpo de função que chama e_admin() sem argumento   (Qa)
  --   B2 uma policy com e_admin() pareado com empresas_do_membro() — o par de cargo MAIS FRACO   (Qb)
  --   B3 uma policy de storage.objects com o piso e SEM recorte   (Qb)
  --   B4 uma policy com o piso em OR com o recorte, não em AND   (Qb)
  execute 'create function public._f67_sabo_b1() returns boolean language sql stable as $b1$ select public.e_admin() $b1$';
  execute 'create table public._f67_sabo_b(id int, empresa_id uuid)';
  execute 'alter table public._f67_sabo_b enable row level security';
  execute 'create policy "f67 b2" on public._f67_sabo_b for select to authenticated using ((select public.e_admin()) and empresa_id = any (array (select public.empresas_do_membro())))';
  execute 'create policy "f67 b4" on public._f67_sabo_b for update to authenticated using ((select public.e_admin()) or empresa_id = any (array (select public.empresas_de_admin())))';
  execute 'create policy "f67 b3" on storage.objects for select to authenticated using (bucket_id = ''f67-sabotagem'' and (select public.e_admin()))';

  select string_agg(p.proname, ',' order by p.proname) into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and pg_temp.sql_so_codigo(p.prosrc) ~ '\m(papel_atual|e_admin|e_dev|pode_escrever)\s*\(\s*\)'
     and not (p.proname = any (k_familia_piso));
  select string_agg(p.polname, ',' order by p.polname) into v_res
    from pg_policy p
   where p.polname in ('f67 b2', 'f67 b3', 'f67 b4')
     and pg_temp.f67_piso_sem_par(coalesce(pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid))) is not null;
  if v_txt = '_f67_sabo_b1' and v_res = 'f67 b2,f67 b3,f67 b4' then
    v_ok := v_ok + 1;
    raise notice '✓ Qc sabotagem B a trava do piso ACUSA os quatro: o corpo (%), e as policies %', v_txt, v_res;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ Qc sabotagem B a trava do piso não acusou os quatro — corpos acusados: %; policies acusadas: %', v_txt, v_res;
  end if;
  execute 'drop policy "f67 b3" on storage.objects';
  execute 'drop table public._f67_sabo_b';
  execute 'drop function public._f67_sabo_b1()';

  -- ===========================================================================================
  -- D — A TRAVA DAS DESTRUTIVAS (catálogo)
  -- ===========================================================================================
  -- D1 — toda função da lista: `p_empresa uuid` 1º, SEM default (os defaults ficam nos últimos argumentos: o 1º tem
  --      default só se TODOS têm). Universo: as assinaturas vivas de cada nome (no CI, contraído: uma por nome).
  select count(*), count(*) filter (where pg_temp.f67_empresa_primeiro(p.oid) is not null),
         coalesce(string_agg(p.proname || '(' || pg_temp.f67_empresa_primeiro(p.oid) || ')', ', ' order by p.proname)
                    filter (where pg_temp.f67_empresa_primeiro(p.oid) is not null), '')
    into v_univ, v_cnt, v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (k_destrutivas);
  if v_univ < array_length(k_destrutivas, 1) then
    v_cnt := v_cnt + (array_length(k_destrutivas, 1) - v_univ);
    v_lista := v_lista || ' (faltam funções da lista no catálogo)';
  end if;
  if pg_temp.assert_zero_de('D1 toda destrutiva, a mesa, o import, as cinco de conta e as auxiliares têm p_empresa uuid como 1º argumento, sem default' ||
       case when v_cnt > 0 then ' — fora: ' || v_lista else '' end, v_cnt, greatest(v_univ, array_length(k_destrutivas, 1))) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- D2 — a confirmação do "tudo" carrega a QUANTIDADE.
  select count(*) filter (where pg_temp.sql_so_codigo(p.prosrc) !~ 'count\s*\('), count(*)
    into v_cnt, v_univ
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'rotulo_alcance_reset';
  if pg_temp.assert_zero_de('D2 rotulo_alcance_reset conta (count() — o "tudo" carrega a quantidade' ||
       case when v_cnt > 0 then ' — sem count(' else '' end, v_cnt, greatest(v_univ, 1)) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- D3 — nenhum COMANDO de uma destrutiva tem `p_filial is null` sem `empresa_id = p_empresa` no mesmo comando.
  select count(*), count(*) filter (where pg_temp.f67_tudo_sem_empresa(p.prosrc) is not null),
         coalesce(string_agg(p.proname || ' [' || pg_temp.f67_tudo_sem_empresa(p.prosrc) || ']', '; ' order by p.proname)
                    filter (where pg_temp.f67_tudo_sem_empresa(p.prosrc) is not null), '')
    into v_univ, v_cnt, v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (k_destrutivas);
  if pg_temp.assert_zero_de('D3 nenhum comando de destrutiva com p_filial is null sem empresa_id = p_empresa no mesmo comando' ||
       case when v_cnt > 0 then ' — fora: ' || v_lista else '' end, v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- D4 — a sentinela do "tudo" carrega a empresa: nas funções da família `import_substituir` que travam o "tudo", a
  --      chave é `hashtext(p_empresa::text)` e nunca `-1`; a mesa trava por empresa (int, int).
  select count(*) filter (where (p.proname in ('resetar_acervo', 'resetar_itens')
                                   and (pg_temp.sql_so_codigo(p.prosrc) ~ 'pg_advisory_xact_lock\s*\(\s*hashtext\s*\(\s*''''\s*\)\s*,\s*-\s*1\s*\)'
                                        or pg_temp.sql_so_codigo(p.prosrc) !~ 'hashtext\s*\(\s*p_empresa\s*::\s*text\s*\)'))
                              or (p.proname = 'apagar_ativos_conflito_filiais'
                                   and pg_temp.sql_so_codigo(p.prosrc) !~ 'pg_advisory_xact_lock\s*\(\s*hashtext\s*\(\s*''''\s*\)\s*,\s*hashtext\s*\(\s*p_empresa\s*::\s*text\s*\)\s*\)')),
         count(*)
    into v_cnt, v_univ
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('resetar_acervo', 'resetar_itens', 'apagar_ativos_conflito_filiais');
  if pg_temp.assert_zero_de('D4 a sentinela do "tudo" dos resets e a trava da mesa carregam a empresa (hashtext(p_empresa::text)), nunca -1',
       v_cnt, greatest(v_univ, 3)) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- D5 — A SABOTAGEM D (a trava): os quatro jeitos de errar são ACUSADOS pelo MESMO predicado.
  execute 'create function public._f67_sabo_d1(p_empresa uuid default null, p_x text default null) returns int language sql stable as $d1$ select 1 $d1$';
  execute 'create function public._f67_sabo_d2(p_filial smallint, p_empresa uuid) returns int language sql stable as $d2$ select 1 $d2$';
  execute 'create function public._f67_sabo_d3(p_empresa uuid, p_filial smallint) returns bigint language sql stable as $d3$ select count(*) from public.ativos a where p_filial is null or a.filial_id = p_filial $d3$';
  execute 'create function public._f67_sabo_d4(p_empresa uuid, p_filial smallint) returns text language sql stable as $d4$ select case when p_filial is null then ''RESETAR TUDO'' end $d4$';
  select string_agg(p.proname, ',' order by p.proname) into v_txt
    from pg_proc p
   where p.proname in ('_f67_sabo_d1', '_f67_sabo_d2') and pg_temp.f67_empresa_primeiro(p.oid) is not null;
  select string_agg(p.proname, ',' order by p.proname) into v_res
    from pg_proc p
   where (p.proname = '_f67_sabo_d3' and pg_temp.f67_tudo_sem_empresa(p.prosrc) is not null)
      or (p.proname = '_f67_sabo_d4' and pg_temp.sql_so_codigo(p.prosrc) !~ 'count\s*\(');
  if v_txt = '_f67_sabo_d1,_f67_sabo_d2' and v_res = '_f67_sabo_d3,_f67_sabo_d4' then
    v_ok := v_ok + 1;
    raise notice '✓ D5 sabotagem D a trava ACUSA p_empresa com default e fora do 1º lugar (%), o "tudo" sem a empresa e o rótulo sem a quantidade (%)', v_txt, v_res;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ D5 sabotagem D a trava não acusou os quatro — posição/default: %; tudo/rótulo: %', v_txt, v_res;
  end if;
  execute 'drop function public._f67_sabo_d1(uuid, text)';
  execute 'drop function public._f67_sabo_d2(smallint, uuid)';
  execute 'drop function public._f67_sabo_d3(uuid, smallint)';
  execute 'drop function public._f67_sabo_d4(uuid, smallint)';

  raise notice 'FIM cargo_por_empresa: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end
$$;

rollback;
