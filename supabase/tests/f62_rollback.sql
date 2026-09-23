-- =============================================================
-- Roteiro de teste: O ROLLBACK DA F62, ENSAIADO (22/09/2026) — a sabotagem G
-- =============================================================
-- A F62 congelou `profiles.papel`/`profiles.ativo` e passou o cargo para `membros`. O
-- rollback dela tem UMA ordem que não se negocia (decisão iii do Johnny): PRIMEIRO copiar
-- `membros` → `profiles` (`supabase/rollback/F62-1-copia-de-volta.sql`), SÓ DEPOIS religar
-- os leitores antigos e derrubar a raiz (`supabase/rollback/F62-2-desfaz.sql`). Sem a
-- cópia, quem foi desativado ou rebaixado DEPOIS da F62 volta ao cargo congelado no apply —
-- a revogação se desfaz em silêncio.
--
-- Este roteiro RODA os dois arquivos de verdade (`\ir`), dentro da transação dele, duas
-- vezes — com e sem a cópia — sobre um estado em que o cargo MUDOU depois da F62:
--   · k_promovido — nasceu depois da F62 (a coluna congelada ficou no default, operador) e
--                   foi PROMOVIDO a admin (só a membership mudou, como a RPC faz);
--   · k_desligado — operador, DESATIVADO depois da F62 (só a membership);
--   · k_dev       — recebeu o cargo dev depois da F62 (só a membership).
-- E prova:
--   rb0 — o estado "depois da F62" é o que se pensa (a fixture, contada antes);
--   rb1 — COM a cópia, papel_atual() (o corpo ANTIGO, religado) devolve o estado MAIS NOVO
--         para TODO perfil do banco — o md5 da impressão de acesso é o mesmo de antes do
--         rollback —, e o desativado continua sem acesso;
--   rb2 — SEM a cópia, o estado VOLTA ao velho: o desativado recupera o cargo congelado. É a
--         prova de que a cópia é o passo que impede isso (o "vermelho" da sabotagem G);
--   rb3 — o esquema voltou ao de antes da F62 (sem `membros`, `empresas`,
--         `plataforma_admins`, `filiais.empresa_id`; `operador_filiais` com a PK de antes;
--         `papel_atual()` lendo `profiles`).
--
-- DESDE A F63 (23/09/2026): os dois caminhos rodam ANTES `supabase/rollback/F63-desfaz.sql` —
-- a fase de depois sai primeiro (ordem inversa do apply entre fases). Sem isso o `drop table
-- public.empresas` da F62 recusaria pelas FKs da F63. DESDE A F64 (23/09/2026): e, antes dele,
-- `supabase/rollback/F64-desfaz.sql` — a F64 pendura em `empresas` e em `empresa_legada()` mais
-- onze FKs e onze defaults (o lote 2).
--
-- Os resultados atravessam o `rollback to savepoint` como variáveis do psql (`\gset`) — é
-- o único estado que o desfazer não leva junto. DADOS 100% FICTÍCIOS. Tudo dentro de
-- `begin; … rollback;`: nada do rollback ensaiado sobra no banco.
-- =============================================================

\set k_promovido '00000000-f62d-4000-8000-0000000000a1'
\set k_desligado '00000000-f62d-4000-8000-0000000000b2'
\set k_dev       '00000000-f62d-4000-8000-0000000000c3'

begin;

-- A impressão de acesso de TODO perfil (o md5 de id=papel_atual|pode_escrever, por id) e o
-- cargo de uma pessoa, com as funções chamadas pelo NOME — valem antes e depois do rollback.
create function pg_temp.f62_impressao() returns text
language plpgsql as $f$
declare
  v_id    uuid;
  v_saida text := '';
begin
  for v_id in select p.id from public.profiles p order by p.id loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
    v_saida := v_saida || v_id::text || '=' || coalesce(public.papel_atual()::text, '∅')
               || '|' || public.pode_escrever()::text || ';';
  end loop;
  perform set_config('request.jwt.claims', '', true);
  return md5(v_saida);
end
$f$;

create function pg_temp.f62_papel_de(p uuid) returns text
language plpgsql as $f$
declare
  v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  v := coalesce(public.papel_atual()::text, '∅');
  perform set_config('request.jwt.claims', '', true);
  return v;
end
$f$;

-- O estado "depois da F62": as três pessoas nascem agora (o handle_new_user dá a membership
-- operador ativa; a coluna congelada fica no default) e o cargo muda SÓ na membership.
do $fixture$
begin
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('00000000-f62d-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f62.rb.promovido@wap.ind.br', '', now(), now(), now()),
    ('00000000-f62d-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f62.rb.desligado@wap.ind.br', '', now(), now(), now()),
    ('00000000-f62d-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f62.rb.dev@wap.ind.br',       '', now(), now(), now());
  perform pg_temp.plantar_cargo('00000000-f62d-4000-8000-0000000000a1', 'admin');
  perform pg_temp.plantar_status('00000000-f62d-4000-8000-0000000000b2', false);
  perform pg_temp.plantar_cargo('00000000-f62d-4000-8000-0000000000c3', 'dev');
end
$fixture$;

select pg_temp.f62_impressao()               as antes_hash,
       pg_temp.f62_papel_de(:'k_promovido') as antes_promovido,
       pg_temp.f62_papel_de(:'k_desligado') as antes_desligado,
       pg_temp.f62_papel_de(:'k_dev')       as antes_dev
\gset

-- ---------------------------------------------------------------------------
-- O ROLLBACK SEM A CÓPIA (só o passo 2 em diante) — o que NÃO se pode fazer
-- ---------------------------------------------------------------------------
savepoint s_rollback;
-- F63 (23/09/2026): a fase de DEPOIS sai primeiro — a F63 pendura em `empresas` e em
-- `empresa_legada()` oito FKs e oito defaults, e o `drop` da F62 (sem cascade) recusaria. É a
-- ordem inversa do apply ENTRE fases (regra 10 da §4). Não muda o que este roteiro prova: o
-- cargo, a cópia de volta e o esquema de antes da F62.
\ir ../rollback/F64-desfaz.sql
\ir ../rollback/F63-desfaz.sql
\ir ../rollback/F62-2-desfaz.sql
select pg_temp.f62_impressao()               as sem_copia_hash,
       pg_temp.f62_papel_de(:'k_promovido') as sem_copia_promovido,
       pg_temp.f62_papel_de(:'k_desligado') as sem_copia_desligado,
       pg_temp.f62_papel_de(:'k_dev')       as sem_copia_dev
\gset
rollback to savepoint s_rollback;

-- ---------------------------------------------------------------------------
-- O ROLLBACK NA ORDEM ESCRITA: a cópia de volta PRIMEIRO
-- ---------------------------------------------------------------------------
\ir ../rollback/F64-desfaz.sql
\ir ../rollback/F63-desfaz.sql
\ir ../rollback/F62-1-copia-de-volta.sql
\ir ../rollback/F62-2-desfaz.sql
select pg_temp.f62_impressao()               as com_copia_hash,
       pg_temp.f62_papel_de(:'k_promovido') as com_copia_promovido,
       pg_temp.f62_papel_de(:'k_desligado') as com_copia_desligado,
       pg_temp.f62_papel_de(:'k_dev')       as com_copia_dev,
       (to_regclass('public.membros') is null
        and to_regclass('public.empresas') is null
        and to_regclass('public.plataforma_admins') is null
        and not exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name in ('filiais', 'operador_filiais')
                           and column_name in ('empresa_id', 'membro_id'))
        and (select string_agg(a.attname, ',' order by k.ord)
               from pg_constraint c
               cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
               join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
              where c.conrelid = 'public.operador_filiais'::regclass and c.contype = 'p') = 'usuario_id,filial_id'
        and (select p.prosrc from pg_proc p
              where p.oid = 'public.papel_atual()'::regprocedure) like '%from public.profiles p%'
       )::text                               as esquema_de_volta
\gset

-- Os resultados, do psql para o bloco das asserções.
select set_config('f62rb.antes_hash',          :'antes_hash',          false),
       set_config('f62rb.antes',               :'antes_promovido' || '/' || :'antes_desligado' || '/' || :'antes_dev', false),
       set_config('f62rb.sem_copia_hash',      :'sem_copia_hash',      false),
       set_config('f62rb.sem_copia',           :'sem_copia_promovido' || '/' || :'sem_copia_desligado' || '/' || :'sem_copia_dev', false),
       set_config('f62rb.com_copia_hash',      :'com_copia_hash',      false),
       set_config('f62rb.com_copia',           :'com_copia_promovido' || '/' || :'com_copia_desligado' || '/' || :'com_copia_dev', false),
       set_config('f62rb.esquema_de_volta',    :'esquema_de_volta',    false);

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;
  v_antes      text := current_setting('f62rb.antes');
  v_sem        text := current_setting('f62rb.sem_copia');
  v_com        text := current_setting('f62rb.com_copia');
  v_h_antes    text := current_setting('f62rb.antes_hash');
  v_h_sem      text := current_setting('f62rb.sem_copia_hash');
  v_h_com      text := current_setting('f62rb.com_copia_hash');
  v_esquema    text := current_setting('f62rb.esquema_de_volta');
begin
  -- rb0 — a fixture: depois da F62, o promovido é admin, o desligado não tem cargo, o dev é dev
  if v_antes = 'admin/∅/dev' then
    v_ok := v_ok + 1;
    raise notice '✓ rb0 o estado depois da F62 foi montado (promovido=admin, desligado=sem cargo, dev=dev) — só na membership';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ rb0 a fixture não montou o estado esperado: %', v_antes;
  end if;

  -- rb1 — com a cópia, o corpo ANTIGO devolve o estado MAIS NOVO, para todo perfil
  if v_com = 'admin/∅/dev' and v_h_com = v_h_antes then
    v_ok := v_ok + 1;
    raise notice '✓ rb1 rollback na ordem escrita (cópia primeiro): o corpo antigo devolve o estado MAIS NOVO — promovido=admin, desligado=sem cargo, dev=dev, e a impressão de todo perfil é a mesma de antes do rollback';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ rb1 o rollback com a cópia NÃO preservou o estado mais novo: % (impressão igual: %)', v_com, (v_h_com = v_h_antes);
  end if;

  -- rb2 — sem a cópia, o estado VOLTA ao velho (o desligado recupera o cargo congelado)
  if v_sem = 'operador/operador/operador' and v_h_sem <> v_h_antes then
    v_ok := v_ok + 1;
    raise notice '✓ rb2 SEM a cópia, o rollback devolve o estado VELHO — o desligado voltaria a ter cargo (%) e a impressão muda: a cópia é o passo que impede isso', v_sem;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ rb2 sem a cópia o estado deveria voltar ao congelado (operador/operador/operador) e voltou %: o ensaio perdeu o poder de distinguir', v_sem;
  end if;

  -- rb3 — o esquema voltou ao de antes da F62
  if v_esquema = 'true' then
    v_ok := v_ok + 1;
    raise notice '✓ rb3 o esquema voltou ao de antes da F62: sem membros/empresas/plataforma_admins, sem empresa_id/membro_id, PK (usuario_id, filial_id), papel_atual() lendo profiles';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ rb3 o rollback deixou restos da F62 no esquema';
  end if;

  raise notice 'FIM f62_rollback: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
