-- =============================================================
-- Roteiro de teste: A EMPRESA DE UM REGISTRO NÃO MUDA (F65, 23/09/2026) — a sabotagem C
-- =============================================================
-- A decisão 2 do Johnny (23/09/2026): `guarda_empresa()` em TODA tabela de negócio, com a lista lida do CATÁLOGO, uma
-- trava que reprova tabela nova sem ela, 42501, e SEM EXCEÇÃO para a janela `estoque.dev_destrutivo`. Mudar a empresa
-- de um ativo não é operação legítima nem para o dev: é a definição do defeito (a transferência entre filiais de
-- empresas diferentes viraria teleporte de tenant, com o histórico junto). Este roteiro é a trava:
--   I1 — ESTRUTURAL, derivada do catálogo: toda tabela de `public` com a coluna `empresa_id` (fora das duas de infra
--        nominais, `k_empresa_id_sem_guarda`) tem o gatilho de `public.guarda_empresa()` BEFORE UPDATE OF empresa_id,
--        FOR EACH ROW, habilitado — e toda tabela de `k_negocio` está nesse conjunto (fora de `k_sem_guarda_empresa`,
--        que é VAZIA: a decisão do Johnny não tem exceção);
--   I2 — a FUNÇÃO: existe, é SECURITY INVOKER, o corpo (lido pelo léxico, sem comentário nem texto) não cita a janela
--        `dev_destrutivo` nem `current_setting`, e não toca tabela nenhuma (nenhum from/join/update/into/insert/delete —
--        a exceção nominal da trava "ninguém lê" lhe dá só `new`/`old`);
--   I3 — a RESSALVA DO `UPDATE OF` (doc do PG 17, sql-createtrigger: "changes made to the row's contents by BEFORE
--        UPDATE triggers are not considered"): nenhuma função de gatilho BEFORE de uma tabela de negócio atribui
--        `new.empresa_id` nem `new` inteiro — senão a guarda de coluna não veria a troca;
--   I4 — COMPORTAMENTAL, nas 20: `update … set empresa_id = <B>` leva 42501 FORA da janela e DENTRO dela (`set local
--        estoque.dev_destrutivo = 'on'`, numa subtransação) — e com a janela aberta a frase é a da guarda (em
--        `movimentacoes`/`lancamentos_item`, fora dela, a `guarda_acervo` dispara antes e também dá 42501);
--   I5 — a recusa provada duas vezes: de volta como `postgres`, nenhuma linha das 20 ficou na empresa B;
--   I6 — `INSERT … ON CONFLICT (id) DO UPDATE SET empresa_id = excluded.empresa_id` dispara a guarda (42501);
--   I7 — o par legítimo: `update … set empresa_id = empresa_id` (a mesma) PASSA — a guarda recusa a TROCA, não a escrita;
--   I8 — a auto-sabotagem: uma tabela SINTÉTICA de `public` com a coluna e sem o gatilho é acusada pela I1 (o gate sabe
--        reprovar a tabela nova);
--   I9 — a auto-sabotagem da I3: o predicado de atribuição acusa as três formas do PL/pgSQL (`:=`, `=` como comando,
--        `into`) — inclusive a forma real da `0156` — e deixa passar a comparação e o `insert … values (new.empresa_id)`.
-- Antes da 0173 ela reprova nas 20 (a trava que nasceu vermelha, docs/f65-evidencias/B-travas/).
--
-- DADOS: uma linha fictícia em cada uma das 20 (pg_temp.f65_plantar, _asserts.sql), na empresa legada; uma empresa B
-- fictícia vazia. Tudo em `begin; … rollback;`. `k_negocio` é a CÓPIA da fonte única (catalogo_policies.sql); o
-- describe 14 de catalogos-seguranca.test.ts amarra as duas e as listas nominais daqui.
-- =============================================================

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-f651-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'f65.imutabilidade@wap.ind.br', '', now(), now(), now());
insert into public.empresas (slug, nome) values ('f65-imut-b', 'Empresa B fictícia da imutabilidade (F65)');

-- I1 como função: a lista de tabelas de `public` com `empresa_id` sem a guarda (roda duas vezes: a real e a sabotada).
create function pg_temp.f65_sem_guarda(p_excecoes text[]) returns table (tabela text)
language sql as $f$
  select c.relname::text
    from pg_class c
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
     and not (c.relname = any (p_excecoes))
     and not exists (
       select 1 from pg_trigger t
        where t.tgrelid = c.oid and not t.tgisinternal
          and t.tgfoid = to_regprocedure('public.guarda_empresa()')
          and t.tgenabled <> 'D'
          and (t.tgtype & 1) = 1      -- FOR EACH ROW
          and (t.tgtype & 2) = 2      -- BEFORE
          and (t.tgtype & 16) = 16    -- UPDATE
          and (t.tgtype & (4 | 8 | 32)) = 0   -- só UPDATE (não INSERT, DELETE, TRUNCATE)
          and array_to_string(t.tgattr::int2[], ',') = a.attnum::text)
$f$;

-- I3 como função: o corpo (lido pelo léxico, sem comentário nem texto) ATRIBUI `new.empresa_id` ou `new` inteiro?
-- As três formas de atribuição do PL/pgSQL (revisão adversarial da F65 — a primeira versão só via a `:=`):
--   (1) `new.empresa_id := …` / `new := …`;
--   (2) `new.empresa_id = …` / `new = …` como COMANDO (o PL/pgSQL aceita `=` na atribuição) — no começo de um
--       comando, depois de `;`, `begin`, `then`, `else` ou `loop`; a comparação (`if new.empresa_id = …`, `where … =
--       new.empresa_id`) não começa comando e não conta;
--   (3) `select|execute|fetch … into new.empresa_id` / `into new` — a lista de alvos do `into`, até `from`/`using`/`;`
--       (a forma que a `0156` usa de verdade em `operador_filiais_deriva_membership`). O `insert into … values
--       (new.empresa_id)` LÊ a coluna, não atribui: sai antes.
create function pg_temp.f65_atribui_empresa(p_src text) returns boolean
language plpgsql as $f$
declare
  v_cod  text := regexp_replace(lower(pg_temp.sql_so_codigo(coalesce(p_src, ''))), '\m(insert|merge)\s+into\M', '\1_em', 'g');
  v_alvo text;
begin
  if v_cod ~ '\mnew\s*(\.\s*empresa_id\s*)?:=' then
    return true;
  end if;
  if v_cod ~ '(^|;|\mbegin\M|\mthen\M|\melse\M|\mloop\M)\s*new\s*(\.\s*empresa_id\s*)?=(?!=)' then
    return true;
  end if;
  -- ⚠ Sem quantificador preguiçoso: no ARE do Postgres a gula do PRIMEIRO quantificador vale para o RE inteiro, e um
  -- `(.*?)` depois de `\s+` vira guloso e engole os comandos seguintes. A lista de alvos é `[^;]*`, cortada no
  -- primeiro `from`/`using` à parte.
  for v_alvo in
    select regexp_replace(m[1], '\m(from|using)\M.*$', '')
      from regexp_matches(v_cod, '\minto\s+(?:strict\s+)?([^;]*)', 'g') as m
  loop
    if v_alvo ~ '\mnew\M\s*(\.\s*empresa_id\M|,|$)' then
      return true;
    end if;
  end loop;
  return false;
end
$f$;

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;
  v_cnt    bigint;
  v_univ   bigint;
  v_lista  text;
  v_rot    text;
  v_t      text;
  v_msg    text;
  v_estado text;
  v_fix    jsonb;
  v_emp_a  uuid := public.empresa_legada();
  v_emp_b  uuid := (select id from public.empresas where slug = 'f65-imut-b');
  v_codigo text;
  k_autor  constant uuid := '00000000-f651-4000-8000-000000000001';

  -- A tabela-verdade de negócio — CÓPIA de `k_negocio` de catalogo_policies.sql (o describe 14 amarra as duas).
  k_negocio text[] := array[
    'anotacoes', 'ativos', 'colaboradores', 'eventos_admin', 'filiais',
    'import_logs', 'import_prefixos_patrimonio', 'import_termos_categoria',
    'import_termos_estado', 'itens', 'kits_modelos', 'lancamentos_item',
    'motivos', 'movimentacoes', 'pendencias_item', 'relatorios_gerados',
    'senhas_acesso', 'termos_gerados', 'tipos_item', 'unidades_apelidos'
  ];
  -- AS TABELAS DE NEGÓCIO SEM A GUARDA — VAZIA (decisão 2 do Johnny: "toda tabela de negócio, sem exceção").
  k_sem_guarda_empresa text[] := array[]::text[];
  -- AS TABELAS DE INFRA COM `empresa_id` E SEM A GUARDA (fonte única; cada uma com o motivo):
  --   · membros          — o vínculo pessoa × empresa com o cargo (F62): a membership É o recorte, e a gestão de
  --                        contas (as RPCs de cargo/status, `membros_guarda_dev`) é quem a governa;
  --   · operador_filiais — o vínculo de escrita de uma membership (F62): a FK composta
  --                        `operador_filiais_membro_fk`/`_filial_da_empresa_fk` já a prende à empresa da membership.
  k_empresa_id_sem_guarda text[] := array['membros', 'operador_filiais'];
begin
  -- ==========================================================================
  -- I1 — toda tabela com empresa_id (fora da infra nominal) tem a guarda; e as 20 de negócio estão no conjunto
  -- ==========================================================================
  select count(*), coalesce(string_agg(s.tabela, ', ' order by s.tabela), '')
    into v_cnt, v_lista
    from pg_temp.f65_sem_guarda(k_empresa_id_sem_guarda || k_sem_guarda_empresa) s;
  select count(*) into v_univ
    from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
     and not (c.relname = any (k_empresa_id_sem_guarda || k_sem_guarda_empresa));
  -- e nenhuma de negócio fica fora do conjunto derivado (sem a coluna, a I1 não a veria)
  select v_cnt + count(*), v_lista || coalesce(' · sem a coluna: ' || string_agg(n, ', '), '')
    into v_cnt, v_lista
    from unnest(k_negocio) as n
   where not (n = any (k_sem_guarda_empresa))
     and not exists (select 1 from pg_attribute a where a.attrelid = to_regclass('public.' || n)
                        and a.attname = 'empresa_id' and not a.attisdropped);
  if pg_temp.assert_zero_de(
       'I1 toda tabela de public com empresa_id (fora da infra nominal) tem a guarda_empresa BEFORE UPDATE OF empresa_id, por linha, habilitada' ||
       case when v_cnt > 0 then ' — sem a guarda: ' || v_lista else '' end,
       v_cnt, greatest(v_univ, array_length(k_negocio, 1))) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- I2 — a função: INVOKER, sem a janela, sem current_setting, sem tabela
  -- ==========================================================================
  select case when p.oid is null then 'a função public.guarda_empresa() não existe'
              else concat_ws('; ',
                     case when p.prosecdef then 'é SECURITY DEFINER' end,
                     case when lower(pg_temp.sql_so_codigo(p.prosrc)) ~ 'dev_destrutivo' then 'cita a janela dev_destrutivo' end,
                     case when lower(pg_temp.sql_so_codigo(p.prosrc)) ~ '\mcurrent_setting\M' then 'lê current_setting' end,
                     -- `is distinct from` não é tabela
                     case when regexp_replace(lower(pg_temp.sql_so_codigo(p.prosrc)), '\mdistinct\s+from\M', 'distinct_de', 'g')
                               ~ '\m(from|join|update|into|insert|delete)\M' then 'toca tabela' end) end
    into v_rot
    from (select 1) x left join pg_proc p on p.oid = to_regprocedure('public.guarda_empresa()');
  if pg_temp.assert_zero_de(
       'I2 guarda_empresa() é INVOKER, não cita a janela dev_destrutivo nem current_setting, e não toca tabela' ||
       case when coalesce(v_rot, '') <> '' then ' — ' || v_rot else '' end,
       case when coalesce(v_rot, '') = '' then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- I3 — nenhum gatilho BEFORE das tabelas de negócio atribui new.empresa_id nem new inteiro
  -- ==========================================================================
  select count(distinct p.oid),
         count(distinct p.oid) filter (where pg_temp.f65_atribui_empresa(p.prosrc)),
         coalesce(string_agg(distinct p.proname, ', ') filter (where pg_temp.f65_atribui_empresa(p.prosrc)), '')
    into v_univ, v_cnt, v_lista
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
   where c.relnamespace = 'public'::regnamespace and c.relname = any (k_negocio)
     and not t.tgisinternal and (t.tgtype & 2) = 2;
  if pg_temp.assert_zero_de(
       'I3 nenhuma função de gatilho BEFORE das tabelas de negócio atribui new.empresa_id nem new inteiro (a guarda de coluna não veria a troca)' ||
       case when v_cnt > 0 then ' — atribui: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- I4 — nas 20: trocar a empresa leva 42501, fora e dentro da janela
  -- ==========================================================================
  v_fix := pg_temp.f65_plantar(v_emp_a, 'imut-a', k_autor, 'ZZI');
  v_cnt := 0; v_rot := '';
  foreach v_t in array k_negocio loop
    -- fora da janela (se passar, desfaz: a tentativa de dentro da janela precisa da linha na A)
    v_estado := null;
    begin
      execute format('update public.%I set empresa_id = $1 where ctid = (select ctid from public.%I where empresa_id = $2 limit 1)', v_t, v_t)
        using v_emp_b, v_emp_a;
      v_estado := 'passou';
      raise exception 'f65-i4-desfaz';
    exception when others then
      if v_estado is null then v_estado := sqlstate; end if;
    end;
    if v_estado is distinct from '42501' then
      v_cnt := v_cnt + 1; v_rot := v_rot || ' ' || v_t || '(fora da janela: ' || coalesce(v_estado, '?') || ')';
    end if;
    -- dentro da janela: a frase tem de ser a da guarda
    v_estado := null; v_msg := null;
    begin
      perform set_config('estoque.dev_destrutivo', 'on', true);
      execute format('update public.%I set empresa_id = $1 where ctid = (select ctid from public.%I where empresa_id = $2 limit 1)', v_t, v_t)
        using v_emp_b, v_emp_a;
      v_estado := 'passou';
      raise exception 'f65-i4-desfaz';
    exception when others then
      if v_estado is null then v_estado := sqlstate; v_msg := sqlerrm; end if;
    end;
    if v_estado is distinct from '42501' or v_msg !~ 'A empresa de um registro não muda' then
      v_cnt := v_cnt + 1; v_rot := v_rot || ' ' || v_t || '(com a janela: ' || coalesce(v_estado, '?') || ')';
    end if;
  end loop;
  if pg_temp.assert_zero_de(
       'I4 nas 20 tabelas de negócio, trocar a empresa de uma linha leva 42501 — fora da janela e DENTRO dela (com a frase da guarda)' ||
       case when v_cnt > 0 then ' — fora da regra:' || v_rot else '' end,
       v_cnt, 2 * array_length(k_negocio, 1)) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- I5 — como postgres, o dado ficou intacto: nenhuma linha das 20 na empresa B, e a fixture continua na A
  v_cnt := 0; v_rot := '';
  foreach v_t in array k_negocio loop
    execute format('select (select count(*) from public.%I where empresa_id = $1) > 0 or (select count(*) from public.%I where empresa_id = $2) = 0', v_t, v_t)
      into v_estado using v_emp_b, v_emp_a;
    if v_estado::boolean then v_cnt := v_cnt + 1; v_rot := v_rot || ' ' || v_t; end if;
  end loop;
  if pg_temp.assert_zero_de(
       'I5 de volta como postgres, nenhuma linha das 20 foi para a empresa B (a recusa provada duas vezes)' ||
       case when v_cnt > 0 then ' — mudou:' || v_rot else '' end,
       v_cnt, array_length(k_negocio, 1)) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- I6 — ON CONFLICT DO UPDATE SET empresa_id também passa pela guarda
  v_estado := null;
  begin
    insert into public.ativos (id, categoria, filial_id, origem, empresa_id)
    values ((v_fix->>'ativos')::uuid, 'notebook', (v_fix->>'filiais')::smallint, 'cadastro', v_emp_b)
    on conflict (id) do update set empresa_id = excluded.empresa_id;
    v_estado := 'passou';
  exception when others then
    v_estado := sqlstate;
  end;
  if pg_temp.assert_zero_de(
       'I6 INSERT … ON CONFLICT (id) DO UPDATE SET empresa_id = excluded.empresa_id leva 42501 (os gatilhos de UPDATE disparam)' ||
       case when v_estado is distinct from '42501' then ' — ' || coalesce(v_estado, '?') else '' end,
       case when v_estado = '42501' then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- I7 — o par legítimo: a mesma empresa no SET passa (nas 20)
  v_cnt := 0; v_rot := '';
  foreach v_t in array k_negocio loop
    begin
      perform set_config('estoque.dev_destrutivo', 'on', true);   -- movimentacoes/lancamentos_item: a guarda_acervo
      execute format('update public.%I set empresa_id = empresa_id where ctid = (select ctid from public.%I where empresa_id = $1 limit 1)', v_t, v_t)
        using v_emp_a;
      raise exception 'f65-i7-desfaz';
    exception when others then
      if sqlerrm <> 'f65-i7-desfaz' then v_cnt := v_cnt + 1; v_rot := v_rot || ' ' || v_t || '(' || sqlstate || ')'; end if;
    end;
  end loop;
  if pg_temp.assert_zero_de(
       'I7 o par legítimo: update … set empresa_id = <a mesma> PASSA nas 20 (a guarda recusa a troca, não a escrita)' ||
       case when v_cnt > 0 then ' — recusou:' || v_rot else '' end,
       v_cnt, array_length(k_negocio, 1)) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- I8 — a auto-sabotagem: uma tabela sintética com a coluna e sem a guarda é acusada
  begin
    create table public.f65_negocio_sintetico (id int primary key, empresa_id uuid not null);
    select count(*), coalesce(string_agg(s.tabela, ', '), '')
      into v_cnt, v_lista
      from pg_temp.f65_sem_guarda(k_empresa_id_sem_guarda || k_sem_guarda_empresa) s
     where s.tabela = 'f65_negocio_sintetico';
    raise exception 'f65-i8-desfaz';
  exception when others then
    if sqlerrm <> 'f65-i8-desfaz' then v_cnt := -1; v_lista := sqlstate || ': ' || sqlerrm; end if;
  end;
  if pg_temp.assert_zero_de(
       'I8 auto-sabotagem: uma tabela SINTÉTICA com empresa_id e sem a guarda é acusada pela I1' ||
       case when v_cnt <> 1 then ' — acusou ' || v_cnt || ' (esperado 1) ' || v_lista else '' end,
       case when v_cnt = 1 then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- I9 — a auto-sabotagem da I3: o predicado de atribuição acusa CADA forma do PL/pgSQL e deixa passar a leitura
  -- (revisão adversarial da F65: a primeira versão só via a `:=`, e a `0156` usa `select … into new.empresa_id`).
  select count(*) filter (where pg_temp.f65_atribui_empresa(c.corpo) <> c.atribui),
         coalesce(string_agg(c.caso, ', ') filter (where pg_temp.f65_atribui_empresa(c.corpo) <> c.atribui), '')
    into v_cnt, v_lista
    from (values
      ('a :=',                          'begin new.empresa_id := v_e; return new; end',                                   true),
      ('o = como comando',              'begin if v then new.empresa_id = v_e; end if; return new; end',                  true),
      ('o = depois de ;',               'begin v := 1; new.empresa_id = v_e; return new; end',                             true),
      ('select … into new.empresa_id',  'begin select f.empresa_id into new.empresa_id from public.filiais f; return new; end', true),
      ('select … into strict',          'begin select 1, f.empresa_id into strict v, new.empresa_id from public.filiais f; return new; end', true),
      ('select * into new (a linha)',   'begin select * into new from public.ativos a limit 1; return new; end',           true),
      ('new := a linha',                'begin new := jsonb_populate_record(new, v_j); return new; end',                   true),
      ('execute … into new.empresa_id', 'begin execute ''select 1'' into new.empresa_id using v; return new; end',        true),
      ('par: a comparação no if',       'begin if new.empresa_id = old.empresa_id then return new; end if; return null; end', false),
      ('par: a comparação no where',    'begin perform 1 from public.filiais f where f.empresa_id = new.empresa_id; return new; end', false),
      ('par: o insert que LÊ a coluna', 'begin insert into public.t (empresa_id) values (new.empresa_id); return new; end', false),
      ('par: outra coluna',             'begin new.status := ''x''; select 1 into new.filial_id from public.filiais f; return new; end', false),
      ('par: into outra variável',      'begin select f.empresa_id into v_e from public.filiais f where f.id = new.filial_id; return new; end', false),
      ('a forma real da 0156',          (select p.prosrc from pg_proc p where p.oid = to_regprocedure('public.operador_filiais_deriva_membership()')), true)
    ) as c(caso, corpo, atribui);
  if pg_temp.assert_zero_de(
       'I9 auto-sabotagem da I3: o predicado acusa as três formas de atribuição do PL/pgSQL (:=, = como comando, into) e deixa passar a leitura' ||
       case when v_cnt > 0 then ' — errou: ' || v_lista else '' end,
       v_cnt, 14) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM imutabilidade_tenant: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
