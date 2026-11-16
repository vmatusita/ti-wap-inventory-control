-- =============================================================
-- storage_por_empresa.sql — cada objeto dos dois buckets tem DONO (F67B, 16/11/2026)
-- =============================================================
-- A F67B troca o dono de cada objeto do Storage (docs/PLAN-F67B.md §2):
--   · `termos`: o `.docx` é decidido pela LINHA de `termos_gerados` que o referencia — ler exige ser membro ativo da
--     empresa da linha (`pode_ler_arquivo_termo` pelo join); escrever exige poder escrever o termo daquela linha
--     (`pode_escrever_arquivo_termo` com `coalesce(…, false)`); objeto SEM linha não é lido nem escrito por ninguém da
--     sessão; e o termo DEGENERADO (`ativo_ids = '{}'`) continua apagável pelo admin DA EMPRESA DELE (a
--     "não-imortalidade" da 0069, agora por empresa);
--   · `backups-import`: o backup é decidido pela EMPRESA DO CAMINHO (`import|reset|conflito|ativo/empresa-<uuid>/…`,
--     a lista fechada de `empresa_do_caminho_backup`) — o admin daquela empresa lê e escreve; os backups nas formas
--     ANTIGAS (a lista fechada de `caminho_backup_legado`) são só LIDOS, e só pelo admin da WAP (decisão 16/11-1 do
--     Johnny); um caminho fora de toda forma não é alcançado por ninguém da sessão;
--   · a 12ª checagem (`backup_orfao`) reconhece as cópias e os backups nas DUAS formas, e a raiz da ferramenta de órfão;
--   · a ferramenta de órfão (`registrar_limpeza_termos_sem_linha`) é só da plataforma, com confirmação digitada;
--   · e a TRAVA DA LEGADA NO STORAGE (bloco L, decisão 14): nenhuma policy de `storage.objects` nem função que decide
--     sobre objeto cita `empresa_legada()`, fora da cláusula legada NOMINAL (a leitura de `backups-import`).
--
-- COMO SE PROVA. Duas empresas fictícias (a A é a legada; a B, nova), cada uma com o acervo mínimo de
-- `pg_temp.f65_plantar` (filial, ativo, movimentação, um termo COM linha); admin, operador e consulta em cada uma; uma
-- conta de plataforma. As policies são as REAIS do banco: cada tentativa roda COMO a pessoa (papel `authenticated`,
-- as claims dela) — leitura, UPDATE, DELETE e INSERT de verdade em `storage.objects` — e é DESFEITA na hora (a
-- subtransação aborta de propósito), para nenhuma tentativa contaminar a seguinte. O resultado de cada objeto, por
-- pessoa, é uma ASSINATURA de quatro letras: L (lê), U (atualiza), D (apaga), I (insere com o mesmo nome) — `-` onde é
-- recusado. Ex.: o operador da A diante do `.docx` do termo da A é `LUDI`; o consulta, `L---`; qualquer um da A diante
-- do da B, `----`. Toda recusa é provada pelo par simétrico que ACEITA o legítimo (a regra 2 de isolamento_tenant.sql).
--
-- ⚠ HOJE (antes das migrations 0194–0199) ESTE ROTEIRO REPROVA, de propósito (a regra 4 do plano: trava antes da
-- correção): o objeto sem linha é lido e escrito, o termo da B é lido por quem é da A (a leitura é pela legada, não
-- pela linha), o admin da WAP alcança o backup da B e o fora de forma, a 12ª conta como órfã a cópia na forma nova, a
-- ferramenta de órfão não existe, e a legada está em 7 policies e 2 funções.
--
-- ⚠ O QUE ELE NÃO PROVA: nada sobre os objetos reais de produção (aqui é tudo sintético); nem a API do Storage (o CI
-- não a tem): ele prova a RLS que ela aplica. O conta a conta (`scripts/perf/conta-a-conta.mjs`, fases f67b-*) é a
-- prova sobre o dado vivo.
--
-- Roda como os irmãos: `begin; do $$ … $$; rollback;`, com `_asserts.sql` carregado antes na mesma sessão.

begin;

-- Os grants de TABELA (o bootstrap do CI não os dá; produção os tem — a POLICY é quem decide, sob teste):
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.objects to anon;
grant select, insert, update, delete on public.termos_gerados to authenticated;

-- Tenta UM comando COMO a pessoa e DESFAZ: devolve 'ok:<linhas>' ou 'recusa:<sqlstate>'. A subtransação aborta de
-- propósito (P0F67) depois do comando, então nada do que ele fez sobrevive.
create or replace function pg_temp.f67b_como(p_uid uuid, p_sql text) returns text
language plpgsql as $fn$
declare
  v_n bigint;
  v_r text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql;
    get diagnostics v_n = row_count;
    raise exception using errcode = 'P0F67', message = 'desfaz a tentativa';
  exception
    when sqlstate 'P0F67' then v_r := 'ok:' || v_n;
    when others then v_r := 'recusa:' || sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v_r;
end;
$fn$;

-- Lê UM número COMO a pessoa.
create or replace function pg_temp.f67b_le(p_uid uuid, p_sql text) returns bigint
language plpgsql as $fn$
declare
  v_n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute p_sql into v_n;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v_n;
end;
$fn$;

-- A ASSINATURA de quatro letras de UMA pessoa diante de UM objeto (L, U, D, I; '-' onde é recusado).
create or replace function pg_temp.f67b_alcanca(p_uid uuid, p_bucket text, p_nome text) returns text
language plpgsql as $fn$
begin
  return
    case when pg_temp.f67b_le(p_uid, format(
           'select count(*) from storage.objects where bucket_id = %L and name = %L', p_bucket, p_nome)) > 0
         then 'L' else '-' end
    || case when pg_temp.f67b_como(p_uid, format(
           'update storage.objects set updated_at = now() where bucket_id = %L and name = %L', p_bucket, p_nome)) = 'ok:1'
         then 'U' else '-' end
    || case when pg_temp.f67b_como(p_uid, format(
           'delete from storage.objects where bucket_id = %L and name = %L', p_bucket, p_nome)) = 'ok:1'
         then 'D' else '-' end
    || case when pg_temp.f67b_como(p_uid, format(
           'insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)', p_bucket, p_nome, p_uid)) = 'ok:1'
         then 'I' else '-' end;
end;
$fn$;

-- Quantas letras de uma lista de assinaturas fogem do esperado (posição a posição).
create or replace function pg_temp.f67b_fora(p_obtidas text[], p_esperada text) returns bigint
language sql immutable as $fn$
  select coalesce(sum((select count(*) from generate_series(1, 4) i
                        where substr(o, i, 1) <> substr(p_esperada, i, 1))), 0)::bigint
    from unnest(p_obtidas) as o
$fn$;

do $$
declare
  k_admin_a  uuid := '00000000-f67b-4000-8000-0000000000a1';
  k_oper_a   uuid := '00000000-f67b-4000-8000-0000000000a2';
  k_cons_a   uuid := '00000000-f67b-4000-8000-0000000000a3';
  k_admin_b  uuid := '00000000-f67b-4000-8000-0000000000b1';
  k_oper_b   uuid := '00000000-f67b-4000-8000-0000000000b2';
  k_cons_b   uuid := '00000000-f67b-4000-8000-0000000000b3';
  k_plat     uuid := '00000000-f67b-4000-8000-0000000000c1';
  v_emp_a    uuid;
  v_emp_b    uuid;
  v_fx_a     jsonb;
  v_fx_b     jsonb;
  v_fa       smallint;
  v_fb       smallint;
  v_mov_a    uuid;
  v_mov_b    uuid;
  v_ativo_a  uuid;
  v_ta       text;
  v_tb       text;
  v_deg_a    uuid := gen_random_uuid();
  v_deg_b    uuid := gen_random_uuid();
  v_oda      text;
  v_odb      text;
  v_sem      text := gen_random_uuid()::text || '.docx';
  v_c        constant text := '2026-11-16T10-00-00-000Z';
  v_c2       constant text := '2026-11-16T11-00-00-000Z';
  v_c3       constant text := '2026-11-16T12-00-00-000Z';
  v_dig      text;
  v_bk_a     text;
  v_bk_b     text;
  v_bk_b_mal text;
  v_bk_fora  text := 'zzf67b/sub/fora-de-forma.json';
  v_ant      text[];
  v_novas_a  text[];
  v_outras   text[];
  v_obt      text[];
  v_r        text;
  v_n        bigint;
  v_n0       bigint;
  v_univ     bigint;
  v_lista    text;
  v_arr      text[];
  v_esp      text[];
  v_ok       int := 0;
  v_falhas   int := 0;
begin
  -- =========================================================================
  -- 0 — o cenário (como `postgres`, antes de trocar de papel)
  -- =========================================================================
  v_emp_a := public.empresa_legada();
  insert into public.empresas (slug, nome) values ('f67b-b', 'Empresa B fictícia da F67B') returning id into v_emp_b;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.email, '', now(), now(), now()
    from (values (k_admin_a, 'f67b.admin.a@wap.ind.br'), (k_oper_a, 'f67b.oper.a@wap.ind.br'),
                 (k_cons_a, 'f67b.cons.a@wap.ind.br'), (k_admin_b, 'f67b.admin.b@wap.ind.br'),
                 (k_oper_b, 'f67b.oper.b@wap.ind.br'), (k_cons_b, 'f67b.cons.b@wap.ind.br'),
                 (k_plat, 'f67b.plataforma@wap.ind.br')) as x (id, email);

  perform pg_temp.plantar_cargo(k_admin_a, 'admin');
  perform pg_temp.plantar_cargo(k_oper_a, 'operador');
  perform pg_temp.plantar_cargo(k_cons_a, 'consulta');
  perform pg_temp.plantar_cargo(k_plat, 'dev');
  insert into public.plataforma_admins (profile_id) values (k_plat);
  -- os da B: só na B (tira a membership da legada que o handle_new_user plantou)
  delete from public.membros where profile_id in (k_admin_b, k_oper_b, k_cons_b) and empresa_id = v_emp_a;
  perform pg_temp.plantar_cargo(k_admin_b, 'admin', true, v_emp_b);
  perform pg_temp.plantar_cargo(k_oper_b, 'operador', true, v_emp_b);
  perform pg_temp.plantar_cargo(k_cons_b, 'consulta', true, v_emp_b);

  -- o acervo mínimo de cada empresa, com um termo COM linha (f65_plantar tira a trava do termo SÓ para o da B)
  v_fx_a := pg_temp.f65_plantar(v_emp_a, 'f67b-a', k_admin_a, 'ZZA');
  v_fx_b := pg_temp.f65_plantar(v_emp_b, 'f67b-b', k_admin_b, 'ZZB');
  v_fa := (v_fx_a->>'filiais')::smallint;
  v_fb := (v_fx_b->>'filiais')::smallint;
  v_mov_a := (v_fx_a->>'movimentacoes')::uuid;
  v_mov_b := (v_fx_b->>'movimentacoes')::uuid;
  v_ativo_a := (v_fx_a->>'ativos')::uuid;
  v_ta := (v_fx_a->>'termos_gerados') || '.docx';
  v_tb := (v_fx_b->>'termos_gerados') || '.docx';

  insert into public.operador_filiais (usuario_id, filial_id) values (k_oper_a, v_fa);
  insert into public.operador_filiais (usuario_id, filial_id, empresa_id, membro_id)
  select k_oper_b, v_fb, v_emp_b, m.id from public.membros m where m.profile_id = k_oper_b and m.empresa_id = v_emp_b;

  -- os DEGENERADOS (ativo_ids = '{}'): o estado que a 0069 provou representável — um em cada empresa
  v_oda := v_deg_a::text || '.docx';
  v_odb := v_deg_b::text || '.docx';
  insert into public.termos_gerados (id, tipo, movimentacao_ids, ativo_ids, colaborador, dados, arquivo_path, gerado_por, empresa_id)
  values (v_deg_a, 'responsabilidade_desktop', array[v_mov_a], '{}'::uuid[], 'Fulano F67B', '{}'::jsonb, v_oda, k_admin_a, v_emp_a);
  execute 'alter table public.termos_gerados disable trigger termo_exige_modelo_da_empresa';
  insert into public.termos_gerados (id, tipo, movimentacao_ids, ativo_ids, colaborador, dados, arquivo_path, gerado_por, empresa_id)
  values (v_deg_b, 'responsabilidade_desktop', array[v_mov_b], '{}'::uuid[], 'Fulano F67B', '{}'::jsonb, v_odb, k_admin_b, v_emp_b);
  execute 'alter table public.termos_gerados enable trigger termo_exige_modelo_da_empresa';

  insert into storage.buckets (id, name, public) values ('termos', 'termos', false), ('backups-import', 'backups-import', false)
  on conflict (id) do nothing;
  insert into storage.objects (bucket_id, name, owner) values
    ('termos', v_ta, k_admin_a), ('termos', v_tb, k_admin_b),
    ('termos', v_oda, k_admin_a), ('termos', v_odb, k_admin_b),
    ('termos', v_sem, k_admin_a);

  -- os backups: um na forma NOVA de cada empresa, um malformado (família + empresa, mas fora da forma), um fora de
  -- toda forma, e um de CADA forma antiga da lista fechada (decisão 16/11-1)
  v_dig := md5('f67b-selecao-ficticia');
  v_bk_a := 'import/empresa-' || v_emp_a || '/filial-' || v_fa || '/' || v_c || '.json';
  v_bk_b := 'import/empresa-' || v_emp_b || '/filial-' || v_fb || '/' || v_c || '.json';
  v_bk_b_mal := 'import/empresa-' || v_emp_b || '/' || v_c || '.json';
  v_ant := array[
    'zzf67b-slug/' || v_c || '.json',                                      -- a histórica <slug>/<carimbo>.json
    'import/filial-' || v_fa || '/' || v_c || '.json',
    'import/filial-' || v_fa || '/' || v_c || '/termos/' || v_ta,
    'reset/acervo/global/' || v_c || '.json',
    'reset/itens/filial-' || v_fa || '/' || v_c || '.json',
    'reset/acervo/filial-' || v_fa || '/' || v_c || '/termos/' || v_ta,
    'conflito/' || v_dig || '/' || v_c || '.json',
    'conflito/' || v_dig || '/termos/' || v_ta,
    'ativo/00000000-f67b-4000-8000-0000000000e1/termos/' || v_ta];             -- outro ativo: a trilha do F1 não o alcança
  insert into storage.objects (bucket_id, name, owner)
  select 'backups-import', x, k_admin_a from unnest(array[v_bk_a, v_bk_b, v_bk_b_mal, v_bk_fora] || v_ant) as x;

  select count(*) into v_univ from storage.objects where bucket_id in ('termos', 'backups-import');
  if pg_temp.assert_zero_de('0a o cenário montou os objetos dos dois buckets (5 de termos, 13 de backups)',
       case when v_univ >= 18 then 0 else 1 end, 1) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  select count(*) into v_n from pg_class where oid = 'storage.objects'::regclass and relrowsecurity;
  if pg_temp.assert_zero_de('0b RLS ligada em storage.objects (sem ela, nenhuma asserção abaixo significa nada)',
       1 - v_n, 1) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- =========================================================================
  -- T — o bucket `termos`: o dono é a LINHA de termos_gerados
  -- =========================================================================
  v_obt := array[pg_temp.f67b_alcanca(k_admin_a, 'termos', v_ta), pg_temp.f67b_alcanca(k_oper_a, 'termos', v_ta)];
  if pg_temp.assert_zero_de('T1 o admin e o operador da A leem e escrevem o .docx do termo da A (LUDI)',
       pg_temp.f67b_fora(v_obt, 'LUDI'), 8) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_obt := array[pg_temp.f67b_alcanca(k_cons_a, 'termos', v_ta)];
  if pg_temp.assert_zero_de('T2 o consulta da A lê e não escreve o .docx do termo da A (L---)',
       pg_temp.f67b_fora(v_obt, 'L---'), 4) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_obt := array[pg_temp.f67b_alcanca(k_admin_a, 'termos', v_tb), pg_temp.f67b_alcanca(k_oper_a, 'termos', v_tb),
                 pg_temp.f67b_alcanca(k_cons_a, 'termos', v_tb)];
  if pg_temp.assert_zero_de('T3 ninguém da A lê nem escreve o .docx do termo da B (----)',
       pg_temp.f67b_fora(v_obt, '----'), 12) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_obt := array[pg_temp.f67b_alcanca(k_admin_b, 'termos', v_tb), pg_temp.f67b_alcanca(k_oper_b, 'termos', v_tb)];
  if pg_temp.assert_zero_de('T4 o par simétrico: o admin e o operador da B leem e escrevem o .docx do termo da B (LUDI)',
       pg_temp.f67b_fora(v_obt, 'LUDI'), 8) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_obt := array[pg_temp.f67b_alcanca(k_cons_b, 'termos', v_tb)];
  if pg_temp.assert_zero_de('T5 o consulta da B lê e não escreve o .docx do termo da B (L---)',
       pg_temp.f67b_fora(v_obt, 'L---'), 4) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_obt := array[pg_temp.f67b_alcanca(k_admin_b, 'termos', v_ta), pg_temp.f67b_alcanca(k_oper_b, 'termos', v_ta),
                 pg_temp.f67b_alcanca(k_cons_b, 'termos', v_ta)];
  if pg_temp.assert_zero_de('T6 ninguém da B lê nem escreve o .docx do termo da A (----)',
       pg_temp.f67b_fora(v_obt, '----'), 12) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- o objeto SEM linha: fechado para todos da sessão — nem o admin da legada, nem a plataforma
  v_obt := array[pg_temp.f67b_alcanca(k_admin_a, 'termos', v_sem), pg_temp.f67b_alcanca(k_oper_a, 'termos', v_sem),
                 pg_temp.f67b_alcanca(k_cons_a, 'termos', v_sem), pg_temp.f67b_alcanca(k_admin_b, 'termos', v_sem),
                 pg_temp.f67b_alcanca(k_plat, 'termos', v_sem)];
  if pg_temp.assert_zero_de('T7 o .docx SEM linha não é lido nem escrito por ninguém da sessão (----)',
       pg_temp.f67b_fora(v_obt, '----'), 20) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- e um nome NOVO, sem linha nenhuma, não pode ser gravado (o upload antes da linha morreu)
  v_n := 0;
  for v_r in select pg_temp.f67b_como(u, format('insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
                                                'termos', gen_random_uuid()::text || '.docx', u))
               from unnest(array[k_admin_a, k_oper_a, k_admin_b, k_plat]) as u loop
    if v_r = 'ok:1' then v_n := v_n + 1; end if;
  end loop;
  if pg_temp.assert_zero_de('T8 ninguém grava um .docx novo que nenhuma linha referencia (o coalesce é false)',
       v_n, 4) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- =========================================================================
  -- D — o DEGENERADO: apagável pelo admin DA EMPRESA DELE, e só por ele (a não-imortalidade da 0069, por empresa)
  -- =========================================================================
  v_n := (case when pg_temp.f67b_como(k_admin_a, format('delete from public.termos_gerados where id = %L', v_deg_a)) = 'ok:1' then 0 else 1 end)
       + pg_temp.f67b_fora(array[pg_temp.f67b_alcanca(k_admin_a, 'termos', v_oda)], 'LUDI');
  if pg_temp.assert_zero_de('D1 o admin da A ainda apaga o termo degenerado da A (a linha e o .docx)',
       v_n, 5) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_n := (case when pg_temp.f67b_como(k_admin_b, format('delete from public.termos_gerados where id = %L', v_deg_a)) = 'ok:0' then 0 else 1 end)
       + pg_temp.f67b_fora(array[pg_temp.f67b_alcanca(k_admin_b, 'termos', v_oda)], '----');
  if pg_temp.assert_zero_de('D2 o admin da B não alcança o degenerado da A (nem a linha, nem o .docx)',
       v_n, 5) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_n := (case when pg_temp.f67b_como(k_admin_b, format('delete from public.termos_gerados where id = %L', v_deg_b)) = 'ok:1' then 0 else 1 end)
       + pg_temp.f67b_fora(array[pg_temp.f67b_alcanca(k_admin_b, 'termos', v_odb)], 'LUDI')
       + (case when pg_temp.f67b_como(k_admin_a, format('delete from public.termos_gerados where id = %L', v_deg_b)) = 'ok:0' then 0 else 1 end)
       + pg_temp.f67b_fora(array[pg_temp.f67b_alcanca(k_admin_a, 'termos', v_odb)], '----');
  if pg_temp.assert_zero_de('D3 o par simétrico: o admin da B apaga o degenerado da B, e o da A não o alcança',
       v_n, 10) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_n := (case when pg_temp.f67b_como(k_oper_a, format('delete from public.termos_gerados where id = %L', v_deg_a)) = 'ok:0' then 0 else 1 end)
       + pg_temp.f67b_fora(array[pg_temp.f67b_alcanca(k_oper_a, 'termos', v_oda)], 'L---');
  if pg_temp.assert_zero_de('D4 o operador da A lê o degenerado da A e não o apaga (o degenerado é de admin)',
       v_n, 5) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- =========================================================================
  -- B — o bucket `backups-import`: o dono é a EMPRESA DO CAMINHO
  -- =========================================================================
  v_obt := array[pg_temp.f67b_alcanca(k_admin_a, 'backups-import', v_bk_a)];
  if pg_temp.assert_zero_de('B1 o admin da A lê, atualiza, apaga e cria o backup sob a empresa A (LUDI)',
       pg_temp.f67b_fora(v_obt, 'LUDI'), 4) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_obt := array[pg_temp.f67b_alcanca(k_admin_a, 'backups-import', v_bk_b)];
  v_n := pg_temp.f67b_fora(v_obt, '----')
       + case when pg_temp.f67b_como(k_admin_a, format('insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
                  'backups-import', 'reset/empresa-' || v_emp_b || '/acervo/tudo/' || v_c2 || '.json', k_admin_a)) = 'ok:1'
              then 1 else 0 end;
  if pg_temp.assert_zero_de('B2 o admin da A é recusado sob a empresa B (o backup da B e um novo na B)',
       v_n, 5) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_obt := array[pg_temp.f67b_alcanca(k_admin_b, 'backups-import', v_bk_b)];
  if pg_temp.assert_zero_de('B3 o par simétrico: o admin da B lê, atualiza, apaga e cria o backup sob a empresa B (LUDI)',
       pg_temp.f67b_fora(v_obt, 'LUDI'), 4) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_obt := array[pg_temp.f67b_alcanca(k_admin_b, 'backups-import', v_bk_a)];
  if pg_temp.assert_zero_de('B4 o admin da B é recusado sob a empresa A (----)',
       pg_temp.f67b_fora(v_obt, '----'), 4) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_obt := array[pg_temp.f67b_alcanca(k_oper_a, 'backups-import', v_bk_a), pg_temp.f67b_alcanca(k_cons_a, 'backups-import', v_bk_a),
                 pg_temp.f67b_alcanca(k_oper_a, 'backups-import', v_ant[2]), pg_temp.f67b_alcanca(k_cons_a, 'backups-import', v_ant[2]),
                 pg_temp.f67b_alcanca(k_oper_b, 'backups-import', v_bk_b), pg_temp.f67b_alcanca(k_cons_b, 'backups-import', v_bk_b)];
  if pg_temp.assert_zero_de('B5 o operador e o consulta não alcançam backup nenhum, de forma nenhuma (----)',
       pg_temp.f67b_fora(v_obt, '----'), 24) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_obt := array[pg_temp.f67b_alcanca(k_admin_a, 'backups-import', v_bk_fora), pg_temp.f67b_alcanca(k_admin_b, 'backups-import', v_bk_fora),
                 pg_temp.f67b_alcanca(k_plat, 'backups-import', v_bk_fora), pg_temp.f67b_alcanca(k_admin_a, 'backups-import', v_bk_b_mal),
                 pg_temp.f67b_alcanca(k_admin_b, 'backups-import', v_bk_b_mal)];
  if pg_temp.assert_zero_de('B6 um caminho fora de toda forma (e o malformado com empresa) não é alcançado por ninguém (----)',
       pg_temp.f67b_fora(v_obt, '----'), 20) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- a cláusula legada (16/11-1): as formas antigas são LIDAS pelo admin da WAP — e só LIDAS
  v_obt := array(select pg_temp.f67b_alcanca(k_admin_a, 'backups-import', x) from unnest(v_ant) as x);
  if pg_temp.assert_zero_de('B7 as formas antigas são lidas pelo admin da WAP, e só lidas (L---, as nove da lista fechada)',
       pg_temp.f67b_fora(v_obt, 'L---'), 36) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_obt := array(select pg_temp.f67b_alcanca(k_admin_b, 'backups-import', x) from unnest(v_ant) as x);
  if pg_temp.assert_zero_de('B8 o admin só da B não lê nenhuma forma antiga (----)',
       pg_temp.f67b_fora(v_obt, '----'), 36) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- depois da contração, ninguém GRAVA na forma antiga — nem o admin da WAP, nem a plataforma, nem nome novo
  v_n := 0;
  for v_r in select pg_temp.f67b_como(u, format('insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
                                                'backups-import', x, u))
               from unnest(array[k_admin_a, k_plat]) as u,
                    unnest(array['import/filial-' || v_fa || '/' || v_c3 || '.json',
                                 'reset/acervo/global/' || v_c3 || '.json',
                                 'conflito/' || v_dig || '/' || v_c3 || '.json',
                                 'zzf67b-slug/' || v_c3 || '.json']) as x loop
    if v_r = 'ok:1' then v_n := v_n + 1; end if;
  end loop;
  if pg_temp.assert_zero_de('B9 ninguém grava backup NOVO na forma antiga (o admin da WAP e a plataforma, as quatro famílias)',
       v_n, 8) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- =========================================================================
  -- E — as primitivas de caminho (as listas FECHADAS das duas formas e os montadores SQL novos)
  -- =========================================================================
  v_novas_a := array[
    'import/empresa-' || v_emp_a || '/filial-' || v_fa || '/' || v_c || '.json',
    'import/empresa-' || v_emp_a || '/filial-' || v_fa || '/' || v_c || '/termos/' || v_ta,
    'reset/empresa-' || v_emp_a || '/acervo/tudo/' || v_c || '.json',
    'reset/empresa-' || v_emp_a || '/itens/filial-' || v_fa || '/' || v_c || '.json',
    'reset/empresa-' || v_emp_a || '/acervo/filial-' || v_fa || '/' || v_c || '/termos/' || v_ta,
    'conflito/empresa-' || v_emp_a || '/' || v_dig || '/' || v_c || '.json',
    'conflito/empresa-' || v_emp_a || '/' || v_dig || '/termos/' || v_ta,
    'ativo/empresa-' || v_emp_a || '/' || v_ativo_a || '/termos/' || v_ta];
  v_outras := array[
    v_bk_fora, v_bk_b_mal,
    'IMPORT/empresa-' || v_emp_a || '/filial-' || v_fa || '/' || v_c || '.json',
    'import/empresa-' || upper(v_emp_a::text) || '/filial-' || v_fa || '/' || v_c || '.json',
    'import/empresa-' || v_emp_a || '/filial-' || v_fa || '/' || v_c || '.json/extra',
    'reset/empresa-' || v_emp_a || '/acervo/global/' || v_c || '.json',
    'orfao/' || v_c || '/termos/' || v_ta,
    'orfao/empresa-' || v_emp_a || '/' || v_c || '/termos/' || v_ta,
    '', 'termos/' || v_ta, v_ta];
  if to_regprocedure('public.empresa_do_caminho_backup(text)') is null
     or to_regprocedure('public.caminho_backup_legado(text)') is null then
    if pg_temp.assert_zero_de('E1 empresa_do_caminho_backup devolve a empresa nas oito formas novas, e nula fora delas',
         1, 1) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
    if pg_temp.assert_zero_de('E2 caminho_backup_legado é verdadeira SÓ nas formas antigas da lista fechada',
         1, 1) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
    if pg_temp.assert_zero_de('E3 os montadores SQL novos produzem a forma nova (prefixo_backup_* com a empresa)',
         1, 1) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  else
    execute 'select count(*) filter (where public.empresa_do_caminho_backup(x) is distinct from $1) from unnest($2) as x'
      into v_n using v_emp_a, v_novas_a;
    execute 'select $1 + count(*) filter (where public.empresa_do_caminho_backup(x) is not null) from unnest($2 || $3) as x'
      into v_n using v_n, v_ant, v_outras;
    if pg_temp.assert_zero_de('E1 empresa_do_caminho_backup devolve a empresa nas oito formas novas, e nula fora delas',
         v_n, cardinality(v_novas_a) + cardinality(v_ant) + cardinality(v_outras)) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
    execute 'select count(*) filter (where not public.caminho_backup_legado(x)) from unnest($1) as x'
      into v_n using v_ant;
    execute 'select $1 + count(*) filter (where public.caminho_backup_legado(x)) from unnest($2 || $3) as x'
      into v_n using v_n, v_novas_a, v_outras;
    if pg_temp.assert_zero_de('E2 caminho_backup_legado é verdadeira SÓ nas formas antigas da lista fechada',
         v_n, cardinality(v_novas_a) + cardinality(v_ant) + cardinality(v_outras)) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
    if to_regprocedure('public.prefixo_backup_import(uuid,smallint)') is null
       or to_regprocedure('public.prefixo_backup_reset(uuid,text,smallint)') is null
       or to_regprocedure('public.prefixo_backup_conflito(uuid)') is null then
      v_n := 1;
    else
      execute 'select count(*) filter (where public.empresa_do_caminho_backup(x) is distinct from $1) from unnest(array[
                 public.prefixo_backup_import($1, $2) || $3 || ''.json'',
                 public.prefixo_backup_reset($1, ''acervo'', null) || $3 || ''.json'',
                 public.prefixo_backup_reset($1, ''itens'', $2) || $3 || ''.json'',
                 public.prefixo_backup_conflito($1) || $4 || ''/'' || $3 || ''.json'']) as x'
        into v_n using v_emp_a, v_fa, v_c, v_dig;
    end if;
    if pg_temp.assert_zero_de('E3 os montadores SQL novos produzem a forma nova (prefixo_backup_* com a empresa)',
         v_n, 4) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  end if;

  -- =========================================================================
  -- F — a 12ª checagem (`backup_orfao`) reconhece as DUAS formas, nas quatro famílias e na raiz da ferramenta
  -- =========================================================================
  -- A medida é o DELTA da contagem do próprio núcleo (a função que a Parte B lê), lote a lote.
  select n.total into v_n0 from public.checagens_integridade_nucleo() n where n.chave = 'backup_orfao';
  -- F1: NOVA forma, com trilha — o JSON registrado e as cópias reconhecidas, nas quatro famílias e no órfão
  insert into public.eventos_admin (acao, empresa_id, detalhe) values
    ('import_executado', v_emp_a, jsonb_build_object('backup_path', 'import/empresa-' || v_emp_a || '/filial-' || v_fa || '/' || v_c2 || '.json')),
    ('acervo_resetado', v_emp_a, jsonb_build_object('backup_path', 'reset/empresa-' || v_emp_a || '/acervo/tudo/' || v_c2 || '.json')),
    ('conflito_filiais_resolvido', v_emp_a, jsonb_build_object(
       'backup_path', 'conflito/empresa-' || v_emp_a || '/' || public.digest_selecao_conflito(array[v_ativo_a]) || '/' || v_c2 || '.json',
       'selecionados', jsonb_build_array(jsonb_build_object('ativo_id', v_ativo_a)))),
    ('ativo_apagado', v_emp_a, jsonb_build_object('ativo_id', v_ativo_a)),
    ('termos_sem_linha_limpos', v_emp_a, jsonb_build_object('raiz', 'orfao/' || v_c2));
  insert into storage.objects (bucket_id, name, owner) values
    ('backups-import', 'import/empresa-' || v_emp_a || '/filial-' || v_fa || '/' || v_c2 || '.json', k_admin_a),
    ('backups-import', 'import/empresa-' || v_emp_a || '/filial-' || v_fa || '/' || v_c2 || '/termos/' || v_ta, k_admin_a),
    ('backups-import', 'reset/empresa-' || v_emp_a || '/acervo/tudo/' || v_c2 || '.json', k_admin_a),
    ('backups-import', 'reset/empresa-' || v_emp_a || '/acervo/tudo/' || v_c2 || '/termos/' || v_ta, k_admin_a),
    ('backups-import', 'conflito/empresa-' || v_emp_a || '/' || public.digest_selecao_conflito(array[v_ativo_a]) || '/' || v_c2 || '.json', k_admin_a),
    ('backups-import', 'conflito/empresa-' || v_emp_a || '/' || public.digest_selecao_conflito(array[v_ativo_a]) || '/termos/' || v_ta, k_admin_a),
    ('backups-import', 'ativo/empresa-' || v_emp_a || '/' || v_ativo_a || '/termos/' || v_ta, k_admin_a),
    ('backups-import', 'orfao/' || v_c2 || '/termos/' || v_sem, k_admin_a);
  select n.total - v_n0 into v_n from public.checagens_integridade_nucleo() n where n.chave = 'backup_orfao';
  if pg_temp.assert_zero_de('F1 os backups e as cópias na forma NOVA, com trilha, não contam como órfãos (quatro famílias e a raiz do órfão)',
       abs(v_n), 8) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- F2: ANTIGA forma, com trilha — continua reconhecida (os antigos ficam para sempre: 16/11-1)
  select n.total into v_n0 from public.checagens_integridade_nucleo() n where n.chave = 'backup_orfao';
  insert into public.eventos_admin (acao, empresa_id, detalhe) values
    ('import_executado', v_emp_a, jsonb_build_object('backup_path', 'import/filial-' || v_fa || '/' || v_c2 || '.json')),
    ('conflito_filiais_resolvido', v_emp_a, jsonb_build_object(
       'selecionados', jsonb_build_array(jsonb_build_object('ativo_id', v_mov_a))));
  insert into storage.objects (bucket_id, name, owner) values
    ('backups-import', 'import/filial-' || v_fa || '/' || v_c2 || '.json', k_admin_a),
    ('backups-import', 'import/filial-' || v_fa || '/' || v_c2 || '/termos/' || v_ta, k_admin_a),
    ('backups-import', 'conflito/' || public.digest_selecao_conflito(array[v_mov_a]) || '/termos/' || v_ta, k_admin_a),
    ('backups-import', 'ativo/' || v_ativo_a || '/termos/' || v_tb, k_admin_a);
  select n.total - v_n0 into v_n from public.checagens_integridade_nucleo() n where n.chave = 'backup_orfao';
  if pg_temp.assert_zero_de('F2 os backups e as cópias na forma ANTIGA, com trilha, continuam não contando como órfãos',
       abs(v_n), 4) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- F3: SEM trilha — conta, nas duas formas (o órfão de verdade continua visível)
  select n.total into v_n0 from public.checagens_integridade_nucleo() n where n.chave = 'backup_orfao';
  insert into storage.objects (bucket_id, name, owner) values
    ('backups-import', 'reset/empresa-' || v_emp_a || '/itens/tudo/' || v_c3 || '.json', k_admin_a),
    ('backups-import', 'ativo/empresa-' || v_emp_a || '/' || gen_random_uuid() || '/termos/' || v_ta, k_admin_a),
    ('backups-import', 'conflito/empresa-' || v_emp_b || '/' || public.digest_selecao_conflito(array[v_ativo_a]) || '/termos/' || v_ta, k_admin_a),
    ('backups-import', 'orfao/' || v_c3 || '/termos/' || v_ta, k_admin_a),
    ('backups-import', 'reset/itens/global/' || v_c3 || '.json', k_admin_a),
    ('backups-import', 'ativo/' || gen_random_uuid() || '/termos/' || v_ta, k_admin_a);
  select n.total - v_n0 into v_n from public.checagens_integridade_nucleo() n where n.chave = 'backup_orfao';
  if pg_temp.assert_zero_de('F3 sem trilha, conta como órfão nas duas formas (inclusive a cópia de conflito com a empresa ERRADA)',
       abs(v_n - 6), 6) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- =========================================================================
  -- O — a ferramenta de órfão: só a plataforma, confirmação digitada, a trilha antes da cópia
  -- =========================================================================
  if to_regprocedure('public.registrar_limpeza_termos_sem_linha(text,text,text)') is null then
    if pg_temp.assert_zero_de('O1 a ferramenta de órfão é só da plataforma (o admin e o operador são recusados)', 1, 1)
      then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
    if pg_temp.assert_zero_de('O2 a ferramenta recusa confirmação errada, raiz fora da forma e justificativa curta', 1, 1)
      then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
    if pg_temp.assert_zero_de('O3 a plataforma recebe a lista EXATA dos .docx sem linha, e a trilha nasce com a raiz', 1, 1)
      then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  else
    v_esp := array(select o.name from storage.objects o where o.bucket_id = 'termos'
                    and not exists (select 1 from public.termos_gerados t where t.arquivo_path = o.name) order by o.name);
    v_lista := format('LIMPAR %s ARQUIVOS DE TERMO', cardinality(v_esp));
    v_n := 0;
    for v_r in select pg_temp.f67b_como(u, format('select public.registrar_limpeza_termos_sem_linha(%L, %L, %L)',
                                                  'orfao/' || v_c3, v_lista, 'justificativa fictícia da F67B'))
                 from unnest(array[k_admin_a, k_oper_a, k_admin_b]) as u loop
      if v_r <> 'recusa:42501' then v_n := v_n + 1; end if;
    end loop;
    if pg_temp.assert_zero_de('O1 a ferramenta de órfão é só da plataforma (o admin e o operador são recusados)', v_n, 3)
      then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
    v_n := (case when pg_temp.f67b_como(k_plat, format('select public.registrar_limpeza_termos_sem_linha(%L, %L, %L)',
                 'orfao/' || v_c3, 'LIMPAR 999 ARQUIVOS DE TERMO', 'justificativa fictícia da F67B')) like 'recusa:%' then 0 else 1 end)
         + (case when pg_temp.f67b_como(k_plat, format('select public.registrar_limpeza_termos_sem_linha(%L, %L, %L)',
                 'orfao/../termos', v_lista, 'justificativa fictícia da F67B')) like 'recusa:%' then 0 else 1 end)
         + (case when pg_temp.f67b_como(k_plat, format('select public.registrar_limpeza_termos_sem_linha(%L, %L, %L)',
                 'orfao/' || v_c3, v_lista, 'curta')) like 'recusa:%' then 0 else 1 end);
    if pg_temp.assert_zero_de('O2 a ferramenta recusa confirmação errada, raiz fora da forma e justificativa curta', v_n, 3)
      then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
    -- a chamada legítima, como a plataforma (as claims dela, sem trocar de papel): a lista e a trilha
    perform set_config('request.jwt.claims', json_build_object('sub', k_plat, 'role', 'authenticated')::text, true);
    execute 'select public.registrar_limpeza_termos_sem_linha($1, $2, $3)' into v_arr
      using 'orfao/' || v_c3, v_lista, 'justificativa fictícia da F67B';
    perform set_config('request.jwt.claims', '', true);
    select count(*) into v_n from public.eventos_admin e
     where e.acao = 'termos_sem_linha_limpos' and e.detalhe->>'raiz' = 'orfao/' || v_c3 and e.autor = k_plat;
    if pg_temp.assert_zero_de('O3 a plataforma recebe a lista EXATA dos .docx sem linha, e a trilha nasce com a raiz',
         (case when coalesce(v_arr, '{}') = v_esp and cardinality(v_esp) >= 1 then 0 else 1 end) + (case when v_n = 1 then 0 else 1 end), 2)
      then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  end if;

  -- =========================================================================
  -- L — a TRAVA DA LEGADA NO STORAGE (decisão 14 do PLAN-F67B), de catálogo
  -- =========================================================================
  -- A única exceção NOMINAL é a cláusula legada da leitura de backups (16/11-1): ela lê os backups antigos para o admin
  -- da WAP e só para ele. Qualquer outra citação de `empresa_legada()` numa policy de storage.objects, ou numa função que
  -- decide sobre objeto, é a WAP decidindo no lugar da empresa do objeto.
  select count(*), coalesce(string_agg(p.policyname, ', ' order by p.policyname), '')
    into v_n, v_lista
    from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~ 'empresa_legada\('
     and p.policyname <> 'backups-import leitura operador';
  select count(*) into v_univ from pg_policies where schemaname = 'storage' and tablename = 'objects';
  if pg_temp.assert_zero_de('L1 nenhuma policy de storage.objects cita empresa_legada() fora da cláusula legada da leitura de backups'
       || case when v_n > 0 then ' — citam: ' || v_lista else '' end, v_n, greatest(v_univ, 1)) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  select count(*), coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text), '')
    into v_n, v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('pode_ler_arquivo_termo', 'pode_escrever_arquivo_termo', 'pode_escrever_termo',
                       'empresa_do_caminho_backup', 'caminho_backup_legado', 'prefixo_backup_import',
                       'prefixo_backup_reset', 'prefixo_backup_conflito', 'registrar_limpeza_termos_sem_linha')
     and pg_temp.sql_so_codigo(p.prosrc) ~ '\mempresa_legada\s*\(';
  select count(*) into v_univ from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('pode_ler_arquivo_termo', 'pode_escrever_arquivo_termo', 'pode_escrever_termo',
                       'empresa_do_caminho_backup', 'caminho_backup_legado', 'prefixo_backup_import',
                       'prefixo_backup_reset', 'prefixo_backup_conflito', 'registrar_limpeza_termos_sem_linha');
  if pg_temp.assert_zero_de('L2 nenhuma função que decide sobre objeto cita empresa_legada()'
       || case when v_n > 0 then ' — citam: ' || v_lista else '' end, v_n, greatest(v_univ, 1)) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- a cláusula legada é FECHADA (cita a lista nominal das formas antigas na mesma policy) e é SÓ DE LEITURA (nenhuma
  -- policy de escrita de backups cita a legada nem a lista antiga)
  select (case when exists (select 1 from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
                              and p.policyname = 'backups-import leitura operador'
                              and coalesce(p.qual, '') ~ 'empresa_legada\('
                              and coalesce(p.qual, '') !~ 'caminho_backup_legado\(') then 1 else 0 end)
       + (select count(*) from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
             and p.policyname like 'backups-import %' and p.cmd <> 'SELECT'
             and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~ '(empresa_legada|caminho_backup_legado)\(')
    into v_n;
  if pg_temp.assert_zero_de('L3 a cláusula legada é fechada pela lista das formas antigas e é só de leitura', v_n, 4)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM storage_por_empresa: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end
$$;

rollback;
