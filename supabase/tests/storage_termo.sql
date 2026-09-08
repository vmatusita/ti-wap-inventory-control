-- =============================================================
-- storage_termo.sql — a leitura do bucket `termos` continua sendo de quem era (F50)
-- =============================================================
-- A migration 0129 tirou a regra de leitura de dentro do predicado da policy e a pôs
-- numa função nomeada, `public.pode_ler_arquivo_termo(name)`. A promessa da fase é
-- **zero mudança de comportamento**: quem lia continua lendo, quem não lia continua
-- sem ler. Este roteiro é o que transforma essa promessa em asserção.
--
-- ⚠ O QUE ELE PROVA, E O QUE NÃO PROVA
-- Ele prova a leitura por CARGO, contra o Postgres do CI, com dado 100% sintético.
-- Ele NÃO prova nada sobre os objetos reais de produção (não há objeto real aqui) e
-- não diz nada sobre depois da virada multiempresa — a função hoje nem consulta o
-- `p_nome` que recebe; ela existe para que a F67 possa fechar pelo JOIN com
-- `termos_gerados` sem mover objeto nenhum.
--
-- POR QUE A PROVA É POR CARGO, E NÃO "o mesmo conjunto antes e depois"
-- Um roteiro roda contra UM banco, num instante. "Antes e depois" exigiria rodar
-- contra o banco pré-0129, que no CI não existe (o banco é construído a partir das
-- migrations, todas elas). O que dá para afirmar, e é o que importa, é o INVARIANTE
-- que o "antes e depois" existiria para verificar: a regra vigente desde a 0070 §B —
-- todo logado ATIVO lê, ninguém mais lê — continua valendo, agora pela função.
--
-- Roda como os irmãos: `begin; do $$ … $$; rollback;`, com `_asserts.sql` carregado
-- antes na mesma sessão (o runner faz isso).

begin;

-- ⚠ GRANT DE TABELA, antes do bloco — e ele é obrigatório, não higiene.
--
-- RLS decide QUAIS LINHAS um papel vê; o GRANT decide se ele pode olhar a tabela.
-- São duas camadas, e a de baixo tem de existir para a de cima significar alguma
-- coisa. No banco do CI, construído pelas migrations mais o bootstrap declarado em
-- `supabase/ci/`, `bootstrap-storage.sql` concede apenas `usage on schema storage` —
-- o grant de TABELA em `storage.objects` não vem de lugar nenhum. Sem esta linha o
-- roteiro morre com "permission denied for table objects" na primeira leitura como
-- `authenticated`, e o runner reprova por ausência da linha FIM.
--
-- `papeis_rls.sql:132` faz exatamente isto, pelo mesmo motivo e para as mesmas
-- asserções de storage. Está dentro do `begin; … rollback;`, então some junto com o
-- resto do cenário.
grant select, insert, update, delete on storage.objects to authenticated;

-- ⚠ E `select` para `anon` TAMBÉM — senão a asserção 2b passa pelo motivo errado.
--
-- Ela existe para provar que a POLICY barra quem não tem sessão. Sem o grant, quem
-- barra é a camada de baixo: o Postgres recusa com "permission denied for table
-- objects" antes de olhar policy nenhuma, o roteiro ABORTA, e a linha `FIM` não sai.
-- Pior seria se ele não abortasse: a asserção diria "anon não leu nada" e estaria
-- medindo a ausência do grant, não a presença da regra.
--
-- Em PRODUÇÃO `anon` TEM esse grant (o Supabase o concede) e é a policy que o barra —
-- que é exatamente o cenário que este roteiro precisa reproduzir. Conceder aqui não
-- afrouxa nada: o grant abre a porta da tabela, e é a policy, sob teste, que decide
-- se alguma linha atravessa. É a mesma disciplina do grant de `authenticated` acima.
grant select on storage.objects to anon;

do $$
declare
  -- identidades fictícias (uuid fixo, hex válido — o prefixo f50a marca a fase)
  k_admin     uuid := '00000000-f50a-4000-8000-0000000000a1';
  k_operador  uuid := '00000000-f50a-4000-8000-0000000000b2';
  k_consulta  uuid := '00000000-f50a-4000-8000-0000000000c3';
  k_inativo   uuid := '00000000-f50a-4000-8000-0000000000d4';
  v_f1        smallint;
  v_bucket    text := 'termos';
  v_obj_a     text := 'f50/termo-fixture-a.docx';
  v_obj_b     text := 'f50/termo-fixture-b.docx';
  v_n         bigint;
  v_univ      bigint;
  v_ok        int := 0;
  v_falhas    int := 0;
  v_existe    boolean;
begin
  -- =========================================================================
  -- 0 — o cenário (como `postgres`, antes de trocar de papel)
  -- =========================================================================
  -- Cenário ausente é ABORTO, não falha contada: `raise exception` derruba o bloco,
  -- a linha `FIM` não sai, e o runner reprova por ausência dela. É a mesma disciplina
  -- de `assert_zero_de` com universo vazio — e é por isso que este roteiro tem UMA só
  -- linha `FIM` (o `ci-passos.test.ts` recusa duas).
  select id into v_f1 from public.filiais where ativo order by id limit 1;
  if v_f1 is null then
    raise exception 'storage_termo: o banco precisa de ao menos UMA filial ativa — cenário não montado';
  end if;

  -- A função da 0129 tem de existir — se não existir, tudo abaixo mediria o banco
  -- errado e passaria por engano.
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'pode_ler_arquivo_termo'
  ) into v_existe;
  if pg_temp.assert_zero_de(
       '0a a função pode_ler_arquivo_termo existe (0129 aplicada)',
       case when v_existe then 0 else 1 end, 1) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- Os quatro usuários. O trigger `handle_new_user` cria o profile e exige domínio
  -- corporativo (0041/0057).
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (k_admin,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f50.chefia@wap.ind.br',   '', now(), now(), now()),
    (k_operador, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f50.operador@wap.ind.br', '', now(), now(), now()),
    (k_consulta, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f50.consulta@wap.ind.br', '', now(), now(), now()),
    (k_inativo,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f50.inativo@wap.ind.br',  '', now(), now(), now());

  update public.profiles set papel = 'admin'    where id = k_admin;
  update public.profiles set papel = 'operador' where id = k_operador;
  update public.profiles set papel = 'consulta' where id = k_consulta;
  update public.profiles set papel = 'operador', ativo = false where id = k_inativo;

  insert into public.operador_filiais (usuario_id, filial_id) values (k_operador, v_f1);

  -- DOIS objetos sintéticos no bucket. Dois, e não um: com um só, "viu 1" e "viu
  -- tudo" coincidiriam, e nenhuma asserção conseguiria distinguir "lê o bucket" de
  -- "lê aquele arquivo".
  insert into storage.buckets (id, name, public)
  values (v_bucket, v_bucket, false)
  on conflict (id) do nothing;

  insert into storage.objects (bucket_id, name, owner) values
    (v_bucket, v_obj_a, k_admin),
    (v_bucket, v_obj_b, k_admin);

  select count(*) into v_univ from storage.objects where bucket_id = v_bucket;
  if pg_temp.assert_zero_de(
       '0b a fixture montou os dois objetos do bucket `termos`',
       case when v_univ >= 2 then 0 else 1 end, 1) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ⚠ RLS LIGADA em `storage.objects` — a asserção que impede a 2b de passar por
  -- acidente. Este roteiro concede `select` a `anon` de propósito (para que quem o
  -- barre seja a POLICY, e não a falta de grant); se a RLS estivesse desligada, esse
  -- mesmo grant o faria ler TUDO e a 2b acusaria — mas acusaria a coisa certa pelo
  -- caminho errado, e sem dizer o motivo. Aqui o motivo fica dito.
  select relrowsecurity into v_existe from pg_class where oid = 'storage.objects'::regclass;
  if pg_temp.assert_zero_de(
       '0c RLS ligada em storage.objects (sem ela, nenhuma asserção abaixo significa nada)',
       case when v_existe then 0 else 1 end, 1) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- =========================================================================
  -- 1 — QUEM LIA CONTINUA LENDO: os três cargos ativos veem os DOIS objetos
  -- =========================================================================
  -- É a asserção central da fase. Se a 0129 tivesse apertado a leitura sem querer,
  -- é aqui que apareceria — e apareceria por cargo, dizendo qual.
  set local role authenticated;

  perform set_config('request.jwt.claims',
    json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);
  select count(*) into v_n from storage.objects where bucket_id = v_bucket;
  if pg_temp.assert_zero_de(
       '1a admin lê os dois objetos do bucket `termos`', v_univ - v_n, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);
  select count(*) into v_n from storage.objects where bucket_id = v_bucket;
  if pg_temp.assert_zero_de(
       '1b operador lê os dois objetos do bucket `termos`', v_univ - v_n, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- `consulta` é o caso que a 0066 protegeu por escrito ("consulta PRECISA ver o
  -- termo"): se a 0129 tivesse trocado a regra por engano, ele seria o primeiro a
  -- perder acesso, e a UI não daria erro — o link só pararia de abrir.
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_consulta, 'role', 'authenticated')::text, true);
  select count(*) into v_n from storage.objects where bucket_id = v_bucket;
  if pg_temp.assert_zero_de(
       '1c consulta lê os dois objetos do bucket `termos` (a 0066 exige)',
       v_univ - v_n, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- =========================================================================
  -- 2 — QUEM NÃO LIA CONTINUA SEM LER
  -- =========================================================================
  -- Perfil DESATIVADO: o piso da 0070 §B, agora dentro da função. O .docx traz nome
  -- do colaborador, setor e patrimônios — é o dado que este piso existe para conter.
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_inativo, 'role', 'authenticated')::text, true);
  select count(*) into v_n from storage.objects where bucket_id = v_bucket;
  if pg_temp.assert_zero_de(
       '2a perfil DESATIVADO não lê objeto nenhum do bucket `termos`', v_n, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- Sessão sem identidade (o `anon` da anon key). Nenhuma das quatro policies do
  -- bucket o inclui nos roles, e a função devolve false por `papel_atual()` nulo —
  -- duas camadas, e as duas conferidas.
  set local role anon;
  perform set_config('request.jwt.claims', NULL, true);
  select count(*) into v_n from storage.objects where bucket_id = v_bucket;
  if pg_temp.assert_zero_de(
       '2b anon não lê objeto nenhum do bucket `termos`', v_n, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  reset role;

  -- =========================================================================
  -- 3 — A FUNÇÃO responde o mesmo que a policy, e SEM o `coalesce(…, true)`
  -- =========================================================================
  -- A irmã de escrita devolve `true` para nome que nenhuma linha de `termos_gerados`
  -- referencia — é o fallback que cobre a janela upload→insert. A de leitura NÃO pode
  -- herdar isso: aqui o nome inexistente é o objeto ÓRFÃO, e órfão legível por regra
  -- é o furo de volta. As duas asserções abaixo provam que a decisão está no código,
  -- e não só no comentário.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_consulta, 'role', 'authenticated')::text, true);
  select public.pode_ler_arquivo_termo('f50/nome-que-nao-existe.docx') into v_existe;
  if pg_temp.assert_zero_de(
       '3a logado ATIVO: a função devolve true (a regra é a sessão, não o arquivo)',
       case when v_existe then 0 else 1 end, 1) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', k_inativo, 'role', 'authenticated')::text, true);
  select public.pode_ler_arquivo_termo(v_obj_a) into v_existe;
  if pg_temp.assert_zero_de(
       '3b DESATIVADO: a função devolve false MESMO para objeto existente ' ||
       '(nada de coalesce(…, true) aqui)',
       case when v_existe then 1 else 0 end, 1) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  reset role;

  -- =========================================================================
  -- 4 — A POLICY CHAMA A FUNÇÃO (a fiação, não só o efeito)
  -- =========================================================================
  -- Sem esta, alguém poderia devolver o predicado antigo à policy e as asserções 1-2
  -- continuariam TODAS verdes — porque a regra é a mesma. O que se perderia é o
  -- LUGAR onde a F67 vai encostar, que é a entrega desta fase.
  select count(*) into v_n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'termos leitura operador'
     and qual like '%pode_ler_arquivo_termo%';
  if pg_temp.assert_zero_de(
       '4a a policy de SELECT de `termos` chama pode_ler_arquivo_termo', 1 - v_n, 1) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- E continua exigindo o bucket: sem `bucket_id`, a policy passaria a valer para
  -- qualquer bucket futuro — a armadilha que a 0070 já tinha evitado por escrito.
  select count(*) into v_n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'termos leitura operador'
     and qual like '%bucket_id%';
  if pg_temp.assert_zero_de(
       '4b a policy continua exigindo bucket_id (não vale para bucket futuro)',
       1 - v_n, 1) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- =========================================================================
  -- 5 — `anon` não executa a função nova (o mesmo cuidado das cinco da 0129)
  -- =========================================================================
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'pode_ler_arquivo_termo'
     and has_function_privilege('anon', p.oid, 'execute');
  if pg_temp.assert_zero_de(
       '5a anon não executa pode_ler_arquivo_termo', v_n, 1) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  raise notice 'FIM storage_termo: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
