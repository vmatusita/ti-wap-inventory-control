-- =============================================================================
-- impressao-acesso.sql — F62 · Frente A — O INSTRUMENTO da promessa central
-- =============================================================================
-- "Nenhum perfil de produção muda de acesso." Esta consulta é rodada, pelo MCP da
-- Supabase (execute_sql), nos DOIS bancos, ANTES do primeiro apply da F62 e
-- DEPOIS do último — com ESTE MESMO TEXTO, byte a byte. Ela chama as funções de
-- autorização pelo NOME (papel_atual, e_admin, e_dev, pode_escrever,
-- pode_escrever_filial, existe_outro_admin_ativo), então vale dos dois lados da
-- troca: antes elas leem `profiles`; depois, `membros`.
--
-- Molde: as emulações da F59/F60 (`docs/f60-evidencias/bloco7-somente-leitura.sql`):
--   1) a transação é marcada SÓ LEITURA como a primeira instrução;
--   2) o resultado volta pela EXCEPTION (nunca por INSERT/NOTICE) — o rollback
--      implícito da exceção não deixa rastro.
--
-- Para cada perfil de `profiles` (ids lidos para um array como `postgres`, antes
-- de qualquer troca de papel), sob personificação — `set local role
-- authenticated` + `request.jwt.claims` com o `sub` do perfil —, registra
--   papel_atual() · e_admin() · e_dev() · pode_escrever() ·
--   pode_escrever_filial(f) para cada filial (ordem de `filiais.id`);
-- e, de volta a `postgres`, existe_outro_admin_ativo(<perfil>) (a função não tem
-- grant para `authenticated`: é chamada só por dentro das RPCs definer).
-- Mais duas linhas de controle: SEM SESSÃO (claims nulas) e SEM PERFIL (um uuid
-- fictício que não é perfil).
--
-- A SAÍDA É SÓ AGREGADA (regra 2 do CLAUDE.md): o número de perfis e de filiais,
-- a contagem por combinação de resultados, as duas linhas de controle e um md5
-- global da lista (perfil, resultados) ordenada por id. O id entra SÓ no hash —
-- nenhum id, nome ou e-mail sai da consulta.
-- =============================================================================

select set_config('transaction_read_only', 'on', true);

do $f62$
declare
  v_ids      uuid[];
  v_filiais  smallint[];
  v_id       uuid;
  v_f        smallint;
  v_linha    text;
  v_hash     text := '';
  v_combos   jsonb := '{}'::jsonb;
  v_ctrl     jsonb := '{}'::jsonb;
  v_sem      text;
  k_ficticio constant uuid := '00000000-f62a-4000-8000-00000000dead';
begin
  select coalesce(array_agg(p.id order by p.id), '{}') into v_ids from public.profiles p;
  select coalesce(array_agg(f.id order by f.id), '{}') into v_filiais from public.filiais f;

  -- os perfis
  foreach v_id in array v_ids loop
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_linha := concat_ws('|',
                 coalesce(public.papel_atual()::text, '∅'),
                 public.e_admin()::text, public.e_dev()::text, public.pode_escrever()::text);
    foreach v_f in array v_filiais loop
      v_linha := v_linha || '|' || coalesce(public.pode_escrever_filial(v_f)::text, '∅');
    end loop;
    execute 'reset role';
    v_linha := v_linha || '|outro_admin=' || coalesce(public.existe_outro_admin_ativo(v_id)::text, '∅');
    v_hash  := v_hash || v_id::text || '=' || v_linha || ';';
    v_combos := jsonb_set(v_combos, array[v_linha],
                          to_jsonb(coalesce((v_combos ->> v_linha)::int, 0) + 1));
  end loop;

  -- controle 1: sem sessão
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role authenticated';
  v_sem := concat_ws('|', coalesce(public.papel_atual()::text, '∅'),
                     public.e_admin()::text, public.e_dev()::text, public.pode_escrever()::text);
  foreach v_f in array v_filiais loop
    v_sem := v_sem || '|' || coalesce(public.pode_escrever_filial(v_f)::text, '∅');
  end loop;
  execute 'reset role';
  v_ctrl := v_ctrl || jsonb_build_object('sem_sessao', v_sem);

  -- controle 2: sem perfil (uuid fictício)
  perform set_config('request.jwt.claims',
                     json_build_object('sub', k_ficticio::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_sem := concat_ws('|', coalesce(public.papel_atual()::text, '∅'),
                     public.e_admin()::text, public.e_dev()::text, public.pode_escrever()::text);
  foreach v_f in array v_filiais loop
    v_sem := v_sem || '|' || coalesce(public.pode_escrever_filial(v_f)::text, '∅');
  end loop;
  execute 'reset role';
  v_ctrl := v_ctrl || jsonb_build_object('sem_perfil', v_sem);

  raise exception 'F62_IMPRESSAO %', jsonb_build_object(
    'n_perfis',   coalesce(array_length(v_ids, 1), 0),
    'n_filiais',  coalesce(array_length(v_filiais, 1), 0),
    'combos',     v_combos,
    'controles',  v_ctrl,
    'md5_global', md5(v_hash)
  )::text;
end
$f62$;
