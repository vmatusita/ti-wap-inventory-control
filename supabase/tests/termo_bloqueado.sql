-- =============================================================
-- Roteiro de teste: A TRAVA DO TERMO (F67, 13/11/2026 — migration 0192)
-- =============================================================
-- POR QUE ELE EXISTE
--
-- Os 7 modelos .docx carregam a identidade da WAP como TEXTO FIXO (decisão 7 do plano). Emitir termo para outra empresa
-- é gerar documento falso. A F67 põe a recusa NO BANCO: o gatilho `termo_exige_modelo_da_empresa` (BEFORE INSERT em
-- `termos_gerados`) recusa, com 42501 e frase própria, termo de empresa fora de `empresas_com_modelo_de_termo()` — a
-- fonte única, hoje só a WAP (docs/PLAN-F67.md, decisão 11).
--
--   T1 o termo da empresa B (ids dela, coerentes) é recusado — como `postgres` (a trava mora no banco, não na RLS);
--   T2 … e como `service_role` (que ignora RLS) — 42501, a frase exata;
--   T3 o `insert … on conflict do update` sobre um termo da B que JÁ existe também é recusado (o BEFORE INSERT vem antes);
--   T4 o termo da WAP (a empresa com modelo) passa — o par simétrico;
--   T5 a fonte única tem EXATAMENTE a WAP, e o gatilho é BEFORE INSERT por linha, ordena antes de
--      `termos_gerados_ids_da_empresa` e deixa `zz_guarda_empresa` como o último BEFORE (a trava estrutural da F65);
--   T6 SABOTAGEM G: sem o gatilho, NA TRANSAÇÃO, o termo da B grava — é o gatilho, e não outra coisa, que recusa.
--
-- Antes da F67 este roteiro é VERMELHO (T0: a lista não existe; T1: o termo da B grava). Roda em begin/rollback.
-- Dados 100% fictícios.
-- =============================================================

begin;

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;
  v_emp_a  uuid := public.empresa_legada();
  v_emp_b  uuid;
  v_a      jsonb;
  v_b      jsonb;
  v_res    text;
  v_n      bigint;
  k_autor  constant uuid := '00000000-f67d-4000-8000-0000000000a1';
  k_frase  constant text := 'A emissão de termo ainda não está disponível para esta empresa.';
  v_tem    boolean := to_regprocedure('public.empresas_com_modelo_de_termo()') is not null;
begin
  if not v_tem then
    v_falhas := v_falhas + 1;
    raise warning '✗ T0 a fonte única empresas_com_modelo_de_termo() não existe (a F67 a cria na 0192)';
  else
    v_ok := v_ok + 1;
    raise notice '✓ T0 a fonte única empresas_com_modelo_de_termo() existe';
  end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (k_autor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f67.termo@wap.ind.br', '', now(), now(), now());
  insert into public.empresas (slug, nome) values ('f67-termo-b', 'Empresa B da trava do termo (F67)') returning id into v_emp_b;
  -- uma linha em cada tabela de negócio, por empresa (a fixture da F65; o termo da B ela planta com a trava fora do
  -- caminho, SÓ naquele insert — o termo da B pré-existente é o alvo do T3)
  v_a := pg_temp.f65_plantar(v_emp_a, 'f67t-a', k_autor, 'ZZTA');
  v_b := pg_temp.f65_plantar(v_emp_b, 'f67t-b', k_autor, 'ZZTB');

  -- ---------------------------------------------------------------- T1 — como postgres
  begin
    insert into public.termos_gerados (tipo, movimentacao_ids, ativo_ids, dados, arquivo_path, gerado_por, empresa_id)
    values ('responsabilidade_desktop', array[(v_b->>'movimentacoes')::uuid], array[(v_b->>'ativos')::uuid], '{}'::jsonb,
            'f67-t1.docx', k_autor, v_emp_b);
    v_res := 'passou';
  exception when others then
    v_res := sqlstate || ': ' || sqlerrm;
  end;
  if pg_temp.assert_zero_de('T1 o termo da empresa B (sem modelo próprio) é recusado como postgres — 42501 com a frase' ||
       case when v_res <> '42501: ' || k_frase then ' — obtido: ' || v_res else '' end,
       case when v_res = '42501: ' || k_frase then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ---------------------------------------------------------------- T2 — como service_role (ignora RLS)
  -- o banco do CI não tem grant nenhum em public (supabase/CLAUDE.md): o roteiro planta o seu, desfeito no rollback.
  grant select, insert on public.termos_gerados to service_role;
  begin
    set local role service_role;
    insert into public.termos_gerados (tipo, movimentacao_ids, ativo_ids, dados, arquivo_path, gerado_por, empresa_id)
    values ('responsabilidade_monitor_interno', array[(v_b->>'movimentacoes')::uuid], array[(v_b->>'ativos')::uuid], '{}'::jsonb,
            'f67-t2.docx', k_autor, v_emp_b);
    v_res := 'passou';
  exception when others then
    v_res := sqlstate || ': ' || sqlerrm;
  end;
  reset role;
  if pg_temp.assert_zero_de('T2 o termo da empresa B é recusado também como service_role (o gatilho não se contorna por papel)' ||
       case when v_res <> '42501: ' || k_frase then ' — obtido: ' || v_res else '' end,
       case when v_res = '42501: ' || k_frase then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ---------------------------------------------------------------- T3 — on conflict do update sobre o termo da B que existe
  begin
    insert into public.termos_gerados (tipo, movimentacao_ids, ativo_ids, dados, arquivo_path, gerado_por, empresa_id)
    select t.tipo, t.movimentacao_ids, t.ativo_ids, '{"f67": true}'::jsonb, t.arquivo_path, k_autor, v_emp_b
      from public.termos_gerados t where t.id = (v_b->>'termos_gerados')::uuid
    on conflict (tipo, movimentacao_ids) do update set dados = excluded.dados;
    v_res := 'passou';
  exception when others then
    v_res := sqlstate || ': ' || sqlerrm;
  end;
  select count(*) into v_n from public.termos_gerados
   where id = (v_b->>'termos_gerados')::uuid and dados = '{}'::jsonb;
  if pg_temp.assert_zero_de('T3 o insert on conflict do update sobre um termo da B é recusado antes (BEFORE INSERT), e o termo fica como estava' ||
       case when v_res <> '42501: ' || k_frase or v_n <> 1 then ' — obtido: ' || v_res || ' / intacto=' || v_n else '' end,
       case when v_res = '42501: ' || k_frase and v_n = 1 then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ---------------------------------------------------------------- T4 — o par simétrico: o termo da WAP passa
  begin
    insert into public.termos_gerados (tipo, movimentacao_ids, ativo_ids, dados, arquivo_path, gerado_por, empresa_id)
    values ('responsabilidade_desktop', array[(v_a->>'movimentacoes')::uuid], array[(v_a->>'ativos')::uuid], '{}'::jsonb,
            'f67-t4.docx', k_autor, v_emp_a);
    v_res := 'passou';
  exception when others then
    v_res := sqlstate || ': ' || sqlerrm;
  end;
  if pg_temp.assert_zero_de('T4 o termo da WAP (a empresa com modelo próprio) passa' ||
       case when v_res <> 'passou' then ' — obtido: ' || v_res else '' end,
       case when v_res = 'passou' then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ---------------------------------------------------------------- T5 — a forma: a fonte única e a ordem dos gatilhos
  if v_tem then
    execute 'select public.empresas_com_modelo_de_termo() = array[public.empresa_legada()]' into v_res;
  else
    v_res := 'false';
  end if;
  select count(*) into v_n
    from pg_trigger t
   where t.tgrelid = 'public.termos_gerados'::regclass and not t.tgisinternal
     and t.tgname = 'termo_exige_modelo_da_empresa'
     and (t.tgtype & 1) = 1      -- por linha
     and (t.tgtype & 2) = 2      -- BEFORE
     and (t.tgtype & 4) = 4      -- INSERT
     and (t.tgtype & 8) = 0      -- não DELETE
     and t.tgenabled = 'O';
  if pg_temp.assert_zero_de('T5 a fonte única tem EXATAMENTE a WAP; o gatilho é BEFORE INSERT por linha, ordena antes de termos_gerados_ids_da_empresa, e zz_guarda_empresa continua o último BEFORE' ||
       case when not (v_res = 'true' and v_n = 1
                      and 'termo_exige_modelo_da_empresa' < 'termos_gerados_ids_da_empresa'
                      and (select max(t.tgname) from pg_trigger t
                            where t.tgrelid = 'public.termos_gerados'::regclass and not t.tgisinternal
                              and (t.tgtype & 2) = 2) = 'zz_guarda_empresa')
            then ' — lista=' || v_res || ', gatilho=' || v_n else '' end,
       case when v_res = 'true' and v_n = 1
                 and (select max(t.tgname) from pg_trigger t
                       where t.tgrelid = 'public.termos_gerados'::regclass and not t.tgisinternal
                         and (t.tgtype & 2) = 2) = 'zz_guarda_empresa' then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ---------------------------------------------------------------- T6 — SABOTAGEM G: sem o gatilho, o termo da B grava
  begin
    if v_tem then
      execute 'alter table public.termos_gerados disable trigger termo_exige_modelo_da_empresa';
    end if;
    insert into public.termos_gerados (tipo, movimentacao_ids, ativo_ids, dados, arquivo_path, gerado_por, empresa_id)
    values ('responsabilidade_desktop', array[(v_b->>'movimentacoes')::uuid], array[(v_b->>'ativos')::uuid], '{}'::jsonb,
            'f67-t6.docx', k_autor, v_emp_b);
    raise exception 'f67-t6-desfaz' using errcode = 'P0001';
  exception when others then
    v_res := case when sqlerrm = 'f67-t6-desfaz' then 'gravou' else sqlstate || ': ' || sqlerrm end;
  end;
  if pg_temp.assert_zero_de('T6 sabotagem G: sem o gatilho (desligado só nesta subtransação, desfeita) o termo da B GRAVA — é o gatilho que recusa' ||
       case when v_res <> 'gravou' then ' — obtido: ' || v_res else '' end,
       case when v_res = 'gravou' then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM termo_bloqueado: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end
$$;

rollback;
