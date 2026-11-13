-- =============================================================
-- Roteiro de teste: CONFLITO ENTRE EMPRESAS É IMPOSSÍVEL POR CONSTRUÇÃO (F67, 13/11/2026 — migration 0191)
-- =============================================================
-- POR QUE ELE EXISTE
--
-- Até a F67 o `group by chave having count(distinct filial_id) > 1` das views da mesa rodava sobre `ativos` INTEIRA:
-- duas empresas com o mesmo patrimônio + service tag em filiais diferentes formavam GRUPO DE CONFLITO entre si, a mesa
-- exibia o gêmeo ALHEIO — e ele autorizava a exclusão do próprio (fato 17). A F67 particiona as views por (empresa da
-- filial, chave), faz a mesa recusar id de outra empresa e recalcular o grupo DENTRO dela (docs/PLAN-F67.md, decisão 9).
--
--   C1 as views NÃO formam grupo entre a A e a B (o par cruzado não aparece), e formam o grupo legítimo DENTRO de cada
--      empresa — com a coluna `empresa` certa;
--   C2 o import da A não conta o par da B como conflito (`import_contar_conflitos`, que lê a view);
--   C3 a mesa da A RECUSA (42501, a frase) apagar o ativo da B — nada some;
--   C4 a mesa da A RECUSA apagar o ativo DELA cujo único gêmeo é da B ("não está em conflito") — o alheio não autoriza;
--   C5 a mesa da B RECUSA o ativo da A;
--   C6 o par legítimo DENTRO da A continua apagável pela A — e a trilha grava a empresa ALVO;
--   C7 SABOTAGEM E: com a view SEM a partição (na transação), o par cruzado volta a formar grupo — a trava sabe acusar.
--
-- Antes da F67 este roteiro é VERMELHO. Roda em begin/rollback. Dados 100% fictícios.
-- =============================================================

begin;

do $$
declare
  v_ok      int := 0;
  v_falhas  int := 0;
  v_emp_a   uuid := public.empresa_legada();
  v_emp_b   uuid;
  v_fa1     smallint;
  v_fa2     smallint;
  v_fb1     smallint;
  v_fb2     smallint;
  v_xa uuid; v_xb uuid; v_ya1 uuid; v_ya2 uuid; v_zb1 uuid; v_zb2 uuid;
  v_n       bigint;
  v_n2      bigint;
  v_base    int;
  v_res     text;
  v_txt_b   text;
  v_grupos  int := 0;
  v_tem     boolean := to_regprocedure('public.apagar_ativos_conflito_filiais(uuid, uuid[], text, text, text)') is not null
                       and exists (select 1 from pg_attribute where attrelid = 'public.v_conflitos_filiais'::regclass
                                                                 and attname = 'empresa' and not attisdropped);
  k_admin_a constant uuid := '00000000-f67e-4000-8000-0000000000a1';
  k_admin_b constant uuid := '00000000-f67e-4000-8000-0000000000b1';
begin
  if not v_tem then
    v_falhas := v_falhas + 1;
    raise warning '✗ C0 a mesa por empresa não existe (a forma com p_empresa e a coluna empresa das views — a F67 as cria na 0191)';
  else
    v_ok := v_ok + 1;
    raise notice '✓ C0 a mesa com p_empresa e as views com a coluna empresa existem';
  end if;

  -- ---------------------------------------------------------------- as fixtures (como postgres)
  insert into public.empresas (slug, nome) values ('f67-conflito-b', 'Empresa B do conflito (F67)') returning id into v_emp_b;
  insert into public.filiais (nome, slug, empresa_id) values ('F67 Conflito A1', 'f67-conflito-a1', v_emp_a) returning id into v_fa1;
  insert into public.filiais (nome, slug, empresa_id) values ('F67 Conflito A2', 'f67-conflito-a2', v_emp_a) returning id into v_fa2;
  insert into public.filiais (nome, slug, empresa_id) values ('F67 Conflito B1', 'f67-conflito-b1', v_emp_b) returning id into v_fb1;
  insert into public.filiais (nome, slug, empresa_id) values ('F67 Conflito B2', 'f67-conflito-b2', v_emp_b) returning id into v_fb2;

  select coalesce(public.import_contar_conflitos(v_fa1), 0) into v_base;

  -- X: o MESMO par na A1 e na B1 (o par CRUZADO); Y: na A1 e na A2 (o par legítimo da A); Z: na B1 e na B2 (o da B)
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, empresa_id)
  values (null, 'F67CONFX', 'notebook', v_fa1, 'cadastro', v_emp_a) returning id into v_xa;
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, empresa_id)
  values (null, 'F67CONFX', 'notebook', v_fb1, 'cadastro', v_emp_b) returning id into v_xb;
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, empresa_id)
  values (null, 'F67CONFY', 'notebook', v_fa1, 'cadastro', v_emp_a) returning id into v_ya1;
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, empresa_id)
  values (null, 'F67CONFY', 'notebook', v_fa2, 'cadastro', v_emp_a) returning id into v_ya2;
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, empresa_id)
  values (null, 'F67CONFZ', 'notebook', v_fb1, 'cadastro', v_emp_b) returning id into v_zb1;
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, empresa_id)
  values (null, 'F67CONFZ', 'notebook', v_fb2, 'cadastro', v_emp_b) returning id into v_zb2;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (k_admin_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f67.conflito.a@wap.ind.br', '', now(), now(), now()),
         (k_admin_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f67.conflito.b@wap.ind.br', '', now(), now(), now());
  perform pg_temp.plantar_cargo(k_admin_a, 'admin');
  delete from public.membros where profile_id = k_admin_b and empresa_id = v_emp_a;
  perform pg_temp.plantar_cargo(k_admin_b, 'admin', true, v_emp_b);

  -- ---------------------------------------------------------------- C1 — as views (como postgres: tudo visível)
  select count(*) filter (where service_tag = 'F67CONFX'),
         count(*) filter (where service_tag in ('F67CONFY', 'F67CONFZ'))
    into v_n, v_n2
    from public.v_conflitos_filiais where service_tag like 'F67CONF%';
  if v_tem then
    execute 'select count(*) from public.v_conflitos_filiais_grupos g
              where (g.service_tag = ''F67CONFY'' and g.empresa = $1 and g.ativos = 2)
                 or (g.service_tag = ''F67CONFZ'' and g.empresa = $2 and g.ativos = 2)'
      into v_grupos using v_emp_a, v_emp_b;
  end if;
  if pg_temp.assert_zero_de('C1 as views não formam grupo entre empresas (o par cruzado some) e formam o grupo legítimo dentro de cada uma, com a empresa certa' ||
       case when not (v_n = 0 and v_n2 = 4 and v_grupos = 2 and v_tem) then ' — cruzado=' || v_n || ' legítimos=' || v_n2 || ' grupos por empresa=' || v_grupos else '' end,
       case when v_n = 0 and v_n2 = 4 and v_grupos = 2 and v_tem then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ---------------------------------------------------------------- C2 — o import da A não conta o par da B
  select public.import_contar_conflitos(v_fa1) into v_n;
  select count(*) into v_n2 from public.v_conflitos_filiais where filial_id = v_fa1;
  if pg_temp.assert_zero_de('C2 o import da A conta só o conflito DENTRO dela (o Y), nunca o par cruzado com a B (o X)' ||
       case when not (v_n = 1 and v_n2 = 1) then ' — contou ' || v_n || ' (linhas da A1 na view: ' || v_n2 || ')' else '' end,
       case when v_n = 1 and v_n2 = 1 then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if v_tem then
    -- ---------------------------------------------------------------- C3 — a mesa da A recusa o ativo da B
    perform set_config('request.jwt.claims', json_build_object('sub', k_admin_a, 'role', 'authenticated')::text, true);
    begin
      execute 'select public.apagar_ativos_conflito_filiais($1, array[$2]::uuid[], ''APAGAR 1'', ''justificativa ficticia da F67'', null)'
        using v_emp_a, v_xb;
      v_res := 'passou';
    exception when others then
      v_res := sqlstate || ': ' || sqlerrm;
    end;
    select count(*) into v_n from public.ativos where id = v_xb;
    if pg_temp.assert_zero_de('C3 a mesa da A recusa apagar o ativo da B (42501, registro de outra empresa) e nada some' ||
         case when not (v_res = '42501: Este registro pertence a outra empresa.' and v_n = 1) then ' — obtido: ' || v_res || ' / existe=' || v_n else '' end,
         case when v_res = '42501: Este registro pertence a outra empresa.' and v_n = 1 then 0 else 1 end, 1) then
      v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

    -- ---------------------------------------------------------------- C4 — o gêmeo alheio não autoriza
    begin
      execute 'select public.apagar_ativos_conflito_filiais($1, array[$2]::uuid[], ''APAGAR 1'', ''justificativa ficticia da F67'', null)'
        using v_emp_a, v_xa;
      v_res := 'passou';
    exception when others then
      v_res := sqlstate || ': ' || sqlerrm;
    end;
    select count(*) into v_n from public.ativos where id = v_xa;
    if pg_temp.assert_zero_de('C4 a mesa da A recusa apagar o ativo DELA cujo único gêmeo é da B (não está em conflito) — o alheio não autoriza' ||
         case when not (v_res like '42501: Esta ferramenta só apaga ativo que esteja em conflito%' and v_n = 1) then ' — obtido: ' || v_res || ' / existe=' || v_n else '' end,
         case when v_res like '42501: Esta ferramenta só apaga ativo que esteja em conflito%' and v_n = 1 then 0 else 1 end, 1) then
      v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

    -- ---------------------------------------------------------------- C5 — a mesa da B recusa o ativo da A
    perform set_config('request.jwt.claims', json_build_object('sub', k_admin_b, 'role', 'authenticated')::text, true);
    begin
      execute 'select public.apagar_ativos_conflito_filiais($1, array[$2]::uuid[], ''APAGAR 1'', ''justificativa ficticia da F67'', null)'
        using v_emp_b, v_ya2;
      v_res := 'passou';
    exception when others then
      v_res := sqlstate || ': ' || sqlerrm;
    end;
    -- e a B NÃO alcança a mesa da A informando a empresa A (não é admin lá)
    begin
      execute 'select public.apagar_ativos_conflito_filiais($1, array[$2]::uuid[], ''APAGAR 1'', ''justificativa ficticia da F67'', null)'
        using v_emp_a, v_ya2;
      v_txt_b := 'passou';
    exception when others then
      v_txt_b := sqlstate || ': ' || sqlerrm;
    end;
    select count(*) into v_n from public.ativos where id = v_ya2;
    if pg_temp.assert_zero_de('C5 a mesa da B recusa o ativo da A (registro de outra empresa), e o admin da B não usa a mesa da A' ||
         case when not (v_res = '42501: Este registro pertence a outra empresa.' and v_txt_b like '42501: Apenas administradores%' and v_n = 1)
              then ' — obtido: ' || v_res || ' / ' || v_txt_b || ' / existe=' || v_n else '' end,
         case when v_res = '42501: Este registro pertence a outra empresa.' and v_txt_b like '42501: Apenas administradores%' and v_n = 1 then 0 else 1 end, 1) then
      v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

    -- ---------------------------------------------------------------- C6 — o par legítimo dentro da A continua apagável
    perform set_config('request.jwt.claims', json_build_object('sub', k_admin_a, 'role', 'authenticated')::text, true);
    begin
      execute 'select public.apagar_ativos_conflito_filiais($1, array[$2]::uuid[], ''APAGAR 1'', ''justificativa ficticia da F67'', null)'
        using v_emp_a, v_ya2;
      v_res := 'passou';
    exception when others then
      v_res := sqlstate || ': ' || sqlerrm;
    end;
    perform set_config('request.jwt.claims', '', true);
    select count(*) into v_n from public.ativos where id = v_ya2;
    select count(*) into v_n2 from public.eventos_admin e
     where e.acao = 'conflito_filiais_resolvido' and e.empresa_id = v_emp_a and e.autor = k_admin_a;
    if pg_temp.assert_zero_de('C6 o par legítimo dentro da A continua apagável pela A, e a trilha grava a empresa alvo' ||
         case when not (v_res = 'passou' and v_n = 0 and v_n2 = 1) then ' — obtido: ' || v_res || ' / existe=' || v_n || ' / trilha=' || v_n2 else '' end,
         case when v_res = 'passou' and v_n = 0 and v_n2 = 1 then 0 else 1 end, 1) then
      v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ C3 a C6 não rodam: a mesa por empresa não existe';
  end if;

  -- ---------------------------------------------------------------- C7 — SABOTAGEM E: a view sem a partição
  if v_tem then
    begin
      execute $v$
        create or replace view public.v_conflitos_filiais with (security_invoker = true) as
        with ident as (
          select a.id, a.filial_id, public.empresa_da_filial(a.filial_id) as empresa,
                 public.chave_identidade_ativo(a.patrimonio, a.service_tag) as chave
            from public.ativos a
        ),
        grupos as (
          select i.chave from ident i where i.chave is not null group by i.chave having count(distinct i.filial_id) > 1
        )
        select i.chave, a.id as ativo_id, a.patrimonio, a.patrimonio_original, a.service_tag, a.filial_id,
               f.slug as filial, f.nome as filial_nome, a.status, a.categoria, a.marca, a.modelo, a.hostname,
               a.colaborador_atual, a.setor_atual, a.origem, a.pendencia, a.created_at, a.updated_at,
               0 as movimentacoes, 0 as movimentacoes_reais, null::date as ultima_mov_data, null::text as ultima_mov_tipo,
               0 as termos, false as tem_historico_real, null::date as entrada_em, i.empresa
          from ident i join grupos g on g.chave = i.chave
          join public.ativos a on a.id = i.id join public.filiais f on f.id = a.filial_id
      $v$;
      select count(*) into v_n from public.v_conflitos_filiais where service_tag = 'F67CONFX';
      raise exception 'f67-c7-desfaz' using errcode = 'P0001';
    exception when others then
      if sqlerrm <> 'f67-c7-desfaz' then v_n := -1; raise notice 'C7 erro: %', sqlerrm; end if;
    end;
  else
    v_n := 0;
  end if;
  if pg_temp.assert_zero_de('C7 sabotagem E: sem a partição por empresa (na subtransação desfeita) o par cruzado volta a formar grupo — a trava sabe acusar' ||
       case when v_n <> 2 then ' — linhas do par cruzado: ' || v_n else '' end,
       case when v_n = 2 then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM conflito_entre_empresas: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end
$$;

rollback;
