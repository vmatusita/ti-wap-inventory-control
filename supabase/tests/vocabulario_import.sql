-- =============================================================
-- Roteiro de teste: O VOCABULÁRIO DO IMPORT VIRA DADO (F56 · Frente D, migration 0139).
--
-- Arquivo NOVO e INDEPENDENTE (mesmo precedente de f34_triagem_reserva.sql /
-- f37_colaboradores_tipos.sql): não toca nem depende dos demais roteiros de
-- supabase/tests/. O CI usa o glob supabase/tests/*.sql, então este arquivo entra
-- sozinho, dentro de UMA transação que termina em ROLLBACK — nada é gravado.
--
-- O QUE ELE PROVA (item 6 da ordem de serviço da Frente D, letra a letra):
--   1  a collation "und-x-icu" existe neste Postgres (produção/ensaio: ICU; o
--      postgres:17 do CI: também, desde a F46 — se um dia não existir, a 0139 já
--      teria falhado no APPLY, antes deste roteiro rodar; esta asserção é a
--      confirmação, não a primeira linha de defesa).
--   2  public.vocabulario_chave(text) espelha normalizarTexto (TS) sobre os pares
--      (entrada, esperado) do bloco PARES_NORMALIZACAO — os 18 termos históricos +
--      os casos-armadilha (NBSP, BOM, Ogham Space Mark, İstanbul, ß, tab/quebra de
--      linha no meio, o ':' que sobrevive a espaço à direita). Estes pares são a
--      FIXTURE do roteiro; `src/lib/import/vocabulario-chave-sql.test.ts` os lê
--      daqui e prova, em TypeScript, que `esperado === normalizarTexto(entrada)`
--      para cada um — o roteiro não pode derivar o esperado do próprio JavaScript.
--   3  as contagens e os conjuntos EXATOS do seed (13/5/17/12/7).
--   4  os CHECKs da migration recusam o que devem recusar, com o SQLSTATE certo.
--   5  RLS: consulta e operador LEEM as quatro tabelas; operador NÃO insere apelido
--      (42501); admin insere e apaga apelido; admin NÃO insere em
--      import_termos_categoria (sem policy nenhuma de escrita — 42501 também, mas
--      por AUSÊNCIA de policy, não por `using(false)`).
--   6  a ambiguidade (Decisão 2): sete caminhos, cada um com o SQLSTATE próprio.
--
-- Convenção idêntica aos outros roteiros (job `banco-sem-docker` do CI):
--   NOTICE  '✓ ...'  quando o resultado bate com o esperado
--   WARNING '✗ ...'  quando NÃO bate (o runner falha em qualquer `WARNING: ✗`)
--
-- Dados 100% fictícios (regra 2 do CLAUDE.md): as filiais de teste são
-- "Filial ZZF56 Alfa/Beta/Gama" (nunca "WAP", nunca um nome real de filial), e-mails
-- `@wap.ind.br` de fantasia com prefixo f56d.
-- =============================================================

begin;

create temp table _vocab_import_resumo (ok int, falhas int, detalhe text);

do $$
declare
  -- identidades fictícias (uuid fixo, hex válido — o prefixo f56d marca a Frente D)
  k_admin    uuid := '00000000-f56d-4000-8000-0000000000a1';
  k_operador uuid := '00000000-f56d-4000-8000-0000000000b2';
  k_consulta uuid := '00000000-f56d-4000-8000-0000000000c3';

  v_fA smallint; -- Filial ZZF56 Alfa (ativa)
  v_fB smallint; -- Filial ZZF56 Beta (ativa)
  v_fG smallint; -- Filial ZZF56 Gama (INATIVA — a f57* recusa mesmo assim)

  v_ok     int  := 0;
  v_falhas int  := 0;
  v_msgs   text := '';

  v_obtido  text;
  v_cnt     int;
  v_cnt2    int;
  r         record;
begin
  -- =========================================================================
  -- GRANTS — este Postgres novo (postgres:17 do CI) não reproduz os default
  -- privileges de um projeto Supabase hospedado (mesmo idioma de papeis_rls.sql /
  -- f37_colaboradores_tipos.sql / bootstrap-roles.sql): quem quiser `set local role
  -- authenticated` e fazer SELECT/INSERT/DELETE de verdade precisa do grant, tabela
  -- por tabela, verbo por verbo — nunca `grant ... on all tables`.
  -- =========================================================================
  grant select on
    public.filiais, public.unidades_apelidos, public.import_termos_categoria,
    public.import_termos_estado, public.import_prefixos_patrimonio
    to authenticated;
  grant insert, delete on public.unidades_apelidos to authenticated;
  grant insert, update on public.filiais to authenticated;

  -- =========================================================================
  -- FIXTURES (como postgres, que ignora RLS — antes de qualquer troca de papel)
  -- =========================================================================
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (k_admin,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f56d.chefia@wap.ind.br',   '', now(), now(), now()),
    (k_operador, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f56d.operador@wap.ind.br', '', now(), now(), now()),
    (k_consulta, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f56d.consulta@wap.ind.br', '', now(), now(), now());

  update public.profiles set papel = 'admin'    where id = k_admin;
  update public.profiles set papel = 'operador' where id = k_operador;
  update public.profiles set papel = 'consulta' where id = k_consulta;

  insert into public.filiais (slug, nome, ativo) values
    ('zzf56-alfa', 'Filial ZZF56 Alfa', true)  returning id into v_fA;
  insert into public.filiais (slug, nome, ativo) values
    ('zzf56-beta', 'Filial ZZF56 Beta', true)  returning id into v_fB;
  insert into public.filiais (slug, nome, ativo) values
    ('zzf56-gama', 'Filial ZZF56 Gama', false) returning id into v_fG;

  -- =========================================================================
  -- 1 — A COLLATION "und-x-icu" EXISTE
  -- =========================================================================
  select count(*) into v_cnt from pg_collation where collname = 'und-x-icu';
  if v_cnt >= 1 then
    v_ok := v_ok + 1; raise notice '✓ 1 a collation "und-x-icu" existe neste Postgres';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1; ';
    raise warning '✗ 1 a collation "und-x-icu" NÃO existe — a 0139 não deveria nem ter aplicado';
  end if;

  -- =========================================================================
  -- 2 — public.vocabulario_chave ESPELHA normalizarTexto SOBRE OS PARES ABAIXO
  --
  -- ⚠ Este bloco é lido por `src/lib/import/vocabulario-chave-sql.test.ts` (âncoras
  -- PARES_NORMALIZACAO_INICIO/FIM). Cada tupla é (entrada, esperado); `esperado` é
  -- escrito AQUI, computado por quem escreveu o roteiro — nunca derivado do
  -- JavaScript. Code points fora do ASCII imprimível entram como `chr(N)`
  -- concatenado (`||`), nunca como caractere invisível literal no arquivo.
  -- =========================================================================
  for r in
    select * from (values
      -- PARES_NORMALIZACAO_INICIO
      -- Os 18 termos históricos — 13 apelidos + 5 nomes próprios (deparas.ts:UNIDADES
      -- de hoje), cada um já normalizado (identidade: entrada = esperado).
      ('matriz', 'matriz'),
      ('matriz sao marcos', 'matriz sao marcos'),
      ('cd-afp', 'cd-afp'),
      ('cd afp', 'cd afp'),
      ('cd-pena', 'cd-pena'),
      ('cd pena', 'cd pena'),
      ('cd-afonso pena', 'cd-afonso pena'),
      ('cd afonso pena', 'cd afonso pena'),
      ('cd-afonsopena', 'cd-afonsopena'),
      ('afonso pena', 'afonso pena'),
      ('eusebio', 'eusebio'),
      ('filial-ce', 'filial-ce'),
      ('filial ce', 'filial ce'),
      ('serra', 'serra'),
      ('serra park', 'serra park'),
      ('linhares', 'linhares'),
      ('filial - linhares', 'filial - linhares'),
      ('filial linhares', 'filial linhares'),
      -- Casos-armadilha (medição B / medição 4 da F56).
      ('CD Afonso Pena', 'cd afonso pena'),
      ('Eusébio', 'eusebio'),
      -- O ':' só é removido quando é o ÚLTIMO caractere ANTES de colapsar espaço —
      -- com espaço à direita do ':', ele SOBREVIVE ao colapso (ordem das operações).
      ('  Filial - Linhares:  ', 'filial - linhares:'),
      ('abc::', 'abc:'),
      -- NBSP, BOM, Ogham Space Mark — os três pontos que a classe explícita cobre e
      -- que uma leitura apressada da medição B (bateria sem a faixa 0x1000-0x1FFF)
      -- deixaria de fora.
      ('a' || chr(160) || 'b', 'a b'),
      ('a' || chr(65279) || 'b', 'a b'),
      ('a' || chr(5760) || 'b', 'a b'),
      -- İ (I maiúsculo turco com ponto, U+0130): NFD decompõe em I + combining dot
      -- ANTES do lower — a ordem das operações é o que salva este caso.
      ('İstanbul', 'istanbul'),
      -- ß (sharp s): não tem forma "menor" em minúsculas simples — passa intacto.
      ('ß', 'ß'),
      -- Tab e quebra de linha NO MEIO do texto — colapsam como qualquer espaço.
      ('a' || chr(9) || 'b', 'a b'),
      ('a' || chr(10) || 'b', 'a b')
      -- PARES_NORMALIZACAO_FIM
    ) as t(entrada, esperado)
  loop
    v_obtido := public.vocabulario_chave(r.entrada);
    if v_obtido = r.esperado then
      v_ok := v_ok + 1;
      raise notice '✓ 2 vocabulario_chave(%) = %', quote_literal(r.entrada), quote_literal(v_obtido);
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '2:' || coalesce(r.entrada, '(null)') || '; ';
      raise warning '✗ 2 vocabulario_chave(%) esperado %, obtido %',
        quote_literal(r.entrada), quote_literal(r.esperado), quote_literal(v_obtido);
    end if;
  end loop;

  -- =========================================================================
  -- 3 — AS CONTAGENS E OS CONJUNTOS EXATOS DO SEED
  -- =========================================================================
  select count(*) into v_cnt from public.unidades_apelidos;
  if v_cnt = 13 then
    v_ok := v_ok + 1; raise notice '✓ 3a unidades_apelidos tem exatamente 13 linhas';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3a; ';
    raise warning '✗ 3a esperado 13 apelidos, obtido % (as 3 filiais fictícias deste roteiro NÃO entram aqui)', v_cnt;
  end if;

  select count(*) into v_cnt from public.import_termos_categoria;
  if v_cnt = 5 then
    v_ok := v_ok + 1; raise notice '✓ 3b import_termos_categoria tem exatamente 5 linhas';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3b; '; raise warning '✗ 3b esperado 5, obtido %', v_cnt;
  end if;

  select count(*) into v_cnt from public.import_termos_estado;
  if v_cnt = 17 then
    v_ok := v_ok + 1; raise notice '✓ 3c import_termos_estado tem exatamente 17 linhas';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3c; '; raise warning '✗ 3c esperado 17, obtido %', v_cnt;
  end if;

  select count(*) into v_cnt from public.import_prefixos_patrimonio;
  if v_cnt = 7 then
    v_ok := v_ok + 1; raise notice '✓ 3d import_prefixos_patrimonio tem exatamente 7 linhas';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3d; '; raise warning '✗ 3d esperado 7, obtido %', v_cnt;
  end if;

  select count(*) into v_cnt from public.import_termos_categoria where rotulo is not null;
  select count(*) into v_cnt2 from public.import_termos_estado where rotulo is not null;
  if v_cnt = 5 and v_cnt2 = 7 then
    v_ok := v_ok + 1; raise notice '✓ 3e as 12 formas de exibição batem (5 categoria + 7 estado)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3e; ';
    raise warning '✗ 3e esperado 5+7=12 rótulos, obtido %+%', v_cnt, v_cnt2;
  end if;

  select count(*) into v_cnt from public.unidades_apelidos ua
    join public.filiais f on f.id = ua.filial_id and f.slug = 'cd-afonso-pena'
   where ua.apelido = 'cd-afonso pena';
  if v_cnt = 1 then
    v_ok := v_ok + 1; raise notice '✓ 3f o apelido "cd-afonso pena" (COM hífen) está na CD — não é o nome próprio';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3f; ';
    raise warning '✗ 3f não achei "cd-afonso pena" como apelido da CD — a armadilha do hífen pode ter invertido';
  end if;

  -- =========================================================================
  -- 4 — OS CHECKS RECUSAM (como DONO, capturando o SQLSTATE)
  -- =========================================================================
  begin
    insert into public.import_termos_categoria (termo, categoria, rotulo)
      values ('zzf56', 'outro', null);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4a; '; raise warning '✗ 4a categoria "outro" foi ACEITA — deveria ser recusada';
  exception when check_violation then
    v_ok := v_ok + 1; raise notice '✓ 4a categoria "outro" recusada pelo check (sqlstate %)', sqlstate;
  when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4a; '; raise warning '✗ 4a recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  begin
    insert into public.import_termos_estado (termo, estado, rotulo)
      values ('zzf56', 'devolvido_fornecedor', null);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4b; '; raise warning '✗ 4b estado devolvido_fornecedor foi ACEITO — deveria ser recusado';
  exception when check_violation then
    v_ok := v_ok + 1; raise notice '✓ 4b estado devolvido_fornecedor recusado pelo check (sqlstate %)', sqlstate;
  when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4b; '; raise warning '✗ 4b recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  begin
    insert into public.import_termos_categoria (termo, categoria, rotulo)
      values ('zzf56', 'notebook', 'Outra Coisa');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4c; '; raise warning '✗ 4c rótulo que não volta ao termo foi ACEITO — deveria ser recusado';
  exception when check_violation then
    v_ok := v_ok + 1; raise notice '✓ 4c rótulo "Outra Coisa" (≠ termo "zzf56") recusado pelo check (sqlstate %)', sqlstate;
  when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4c; '; raise warning '✗ 4c recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  begin
    insert into public.import_termos_estado (termo, estado, rotulo)
      values ('zzf56 descarte', 'descartado', 'Zzf56 Descarte');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4d; '; raise warning '✗ 4d descartado COM rótulo foi ACEITO — deveria ser recusado';
  exception when check_violation then
    v_ok := v_ok + 1; raise notice '✓ 4d estado descartado com rótulo recusado pelo check (sqlstate %)', sqlstate;
  when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4d; '; raise warning '✗ 4d recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  begin
    -- Fixture tem de passar PRIMEIRO pelo check `..._rotulo_volta_ao_termo` (Postgres
    -- avalia CHECK em ExecConstraints(), antes de ExecInsertIndexTuples() — ordem
    -- determinística, não corrida) para só então testar o índice único parcial. Por
    -- isso o termo NÃO é livre: 'zzf56 estoque dois' é o que 'Zzf56 Estoque Dois'
    -- normaliza de volta — o check passa — e só aí o segundo rótulo para o MESMO
    -- estado (em_estoque já tem 'estoque'/'Estoque' no seed) esbarra no índice.
    insert into public.import_termos_estado (termo, estado, rotulo)
      values ('zzf56 estoque dois', 'em_estoque', 'Zzf56 Estoque Dois');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4e; '; raise warning '✗ 4e um SEGUNDO rótulo para em_estoque foi ACEITO — o índice único parcial deveria recusar';
  exception when unique_violation then
    v_ok := v_ok + 1; raise notice '✓ 4e segundo rótulo do mesmo estado (em_estoque) recusado pelo índice único parcial (sqlstate %)', sqlstate;
  when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4e; '; raise warning '✗ 4e recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  begin
    insert into public.import_prefixos_patrimonio (prefixo) values ('wap');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4f; '; raise warning '✗ 4f prefixo minúsculo foi ACEITO — deveria ser recusado pelo formato';
  exception when check_violation then
    v_ok := v_ok + 1; raise notice '✓ 4f prefixo fora do formato ("wap") recusado pelo check (sqlstate %)', sqlstate;
  when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4f; '; raise warning '✗ 4f recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  -- =========================================================================
  -- 5 — RLS
  -- =========================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_consulta, 'role', 'authenticated')::text, true);

  select count(*) into v_cnt from public.unidades_apelidos;
  select count(*) into v_cnt2 from public.import_termos_categoria;
  if v_cnt = 13 and v_cnt2 = 5 then
    v_ok := v_ok + 1; raise notice '✓ 5a consulta LÊ as quatro tabelas do vocabulário (unidades_apelidos=%, import_termos_categoria=%)', v_cnt, v_cnt2;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5a; ';
    raise warning '✗ 5a consulta viu unidades_apelidos=% import_termos_categoria=% (esperado 13/5)', v_cnt, v_cnt2;
  end if;

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  select count(*) into v_cnt from public.unidades_apelidos;
  select count(*) into v_cnt2 from public.import_termos_estado;
  if v_cnt = 13 and v_cnt2 = 17 then
    v_ok := v_ok + 1; raise notice '✓ 5b operador LÊ as quatro tabelas do vocabulário';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5b; '; raise warning '✗ 5b operador viu unidades_apelidos=% import_termos_estado=% (esperado 13/17)', v_cnt, v_cnt2;
  end if;

  begin
    insert into public.unidades_apelidos (filial_id, apelido) values (v_fA, 'ZZF56 Operador Tentou');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5c; '; raise warning '✗ 5c operador INSERIU apelido — é matéria de admin';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; raise notice '✓ 5c operador recusado ao inserir apelido (sqlstate %)', sqlstate;
  when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5c; '; raise warning '✗ 5c recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);

  declare
    v_novo_id bigint;
  begin
    insert into public.unidades_apelidos (filial_id, apelido) values (v_fA, 'ZZF56 Admin Incluiu')
      returning id into v_novo_id;
    v_ok := v_ok + 1; raise notice '✓ 5d admin INSERE apelido (id=%)', v_novo_id;

    delete from public.unidades_apelidos where id = v_novo_id;
    if not found then
      v_ok := v_ok + 1; raise notice '✓ 5e admin APAGA o apelido que acabou de incluir';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '5e; '; raise warning '✗ 5e o DELETE do admin não afetou a linha esperada';
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5d_5e; '; raise warning '✗ 5d/5e admin deveria inserir e apagar apelido sem erro (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  begin
    insert into public.import_termos_categoria (termo, categoria, rotulo) values ('zzf56admin', 'notebook', null);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5f; '; raise warning '✗ 5f admin INSERIU em import_termos_categoria — não há policy de escrita nenhuma nesta fase';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; raise notice '✓ 5f admin recusado ao inserir em import_termos_categoria — sem policy de escrita (sqlstate %)', sqlstate;
  when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5f; '; raise warning '✗ 5f recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  reset role;

  -- =========================================================================
  -- 6 — A AMBIGUIDADE (Decisão 2) — sete caminhos, cada um com o SQLSTATE certo.
  --     Rodando como DONO (postgres) — a guarda é `security invoker`, mas o gatilho
  --     dispara para QUALQUER role, inclusive o dono; o que muda com `authenticated`
  --     é só a RLS por cima, que já foi medida na seção 5.
  -- =========================================================================

  -- 6a — apelido = NOME de outra filial → P0001
  begin
    insert into public.unidades_apelidos (filial_id, apelido) values (v_fA, 'Filial ZZF56 Beta');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6a; '; raise warning '✗ 6a apelido igual ao NOME de outra filial foi ACEITO';
  exception
    when sqlstate 'P0001' then
      v_ok := v_ok + 1; raise notice '✓ 6a apelido = nome de outra filial recusado (P0001): %', sqlerrm;
    when others then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '6a; '; raise warning '✗ 6a recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  -- 6b — apelido = APELIDO de outra filial → 23505 (índice único; fora da guarda)
  insert into public.unidades_apelidos (filial_id, apelido) values (v_fA, 'ZZF56 Compartilhado');
  begin
    insert into public.unidades_apelidos (filial_id, apelido) values (v_fB, 'ZZF56 Compartilhado');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6b; '; raise warning '✗ 6b apelido igual a apelido de OUTRA filial foi ACEITO';
  exception
    when unique_violation then
      v_ok := v_ok + 1; raise notice '✓ 6b apelido = apelido de outra filial recusado pelo índice único (23505): %', sqlerrm;
    when others then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '6b; '; raise warning '✗ 6b recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  -- 6c — apelido = nome da PRÓPRIA filial → P0001 ("o nome próprio já vale")
  begin
    insert into public.unidades_apelidos (filial_id, apelido) values (v_fA, 'Filial ZZF56 Alfa');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6c; '; raise warning '✗ 6c apelido igual ao PRÓPRIO nome foi ACEITO';
  exception
    when sqlstate 'P0001' then
      v_ok := v_ok + 1; raise notice '✓ 6c apelido = nome da própria filial recusado (P0001): %', sqlerrm;
    when others then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '6c; '; raise warning '✗ 6c recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  -- 6d — CRIAR filial com nome = apelido existente → P0001
  begin
    insert into public.filiais (slug, nome, ativo) values ('zzf56-delta', 'ZZF56 Compartilhado', true);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6d; '; raise warning '✗ 6d filial criada com nome = apelido existente foi ACEITA';
  exception
    when sqlstate 'P0001' then
      v_ok := v_ok + 1; raise notice '✓ 6d criar filial com nome = apelido existente recusado (P0001): %', sqlerrm;
    when others then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '6d; '; raise warning '✗ 6d recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  -- 6e — RENOMEAR filial para o nome de OUTRA, com caixa/acento diferentes → 23505
  --      (o índice único de expressão, não a guarda — "nome × nome fica com o
  --      índice único", PLAN-F56.md Decisão 2).
  begin
    update public.filiais set nome = 'filial ZZF56 BETA' where id = v_fA;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6e; '; raise warning '✗ 6e renomear para o nome de outra filial (caixa diferente) foi ACEITO';
  exception
    when unique_violation then
      v_ok := v_ok + 1; raise notice '✓ 6e renomear para o nome de outra filial recusado pelo índice único (23505): %', sqlerrm;
    when others then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '6e; '; raise warning '✗ 6e recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  -- 6f — RENOMEAR filial para um APELIDO DELA MESMA → P0001 ("remova o apelido antes")
  begin
    update public.filiais set nome = 'ZZF56 Compartilhado' where id = v_fA;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6f; '; raise warning '✗ 6f renomear para um apelido da PRÓPRIA filial foi ACEITO';
  exception
    when sqlstate 'P0001' then
      v_ok := v_ok + 1; raise notice '✓ 6f renomear para apelido da própria filial recusado (P0001): %', sqlerrm;
    when others then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '6f; '; raise warning '✗ 6f recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  -- 6g — nome de filial INATIVA continua bloqueando apelido → P0001 (toda filial,
  --      ativa ou não, é UNIDADE CONHECIDA — Decisão 2).
  begin
    insert into public.unidades_apelidos (filial_id, apelido) values (v_fA, 'Filial ZZF56 Gama');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6g; '; raise warning '✗ 6g apelido igual ao nome de uma filial INATIVA foi ACEITO';
  exception
    when sqlstate 'P0001' then
      v_ok := v_ok + 1; raise notice '✓ 6g nome de filial inativa continua bloqueando apelido (P0001): %', sqlerrm;
    when others then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '6g; '; raise warning '✗ 6g recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  -- 6h — controle: reativar a filial inativa NÃO passa pela guarda (ela nunca saiu
  --      do conjunto) — o UPDATE de `ativo`, sem tocar `nome`, tem de passar limpo.
  begin
    update public.filiais set ativo = true where id = v_fG;
    v_ok := v_ok + 1; raise notice '✓ 6h reativar filial (sem mudar o nome) não passa pela guarda — aceito sem erro';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6h; '; raise warning '✗ 6h reativar filial deveria passar limpo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  insert into _vocab_import_resumo values (v_ok, v_falhas, nullif(v_msgs, ''));
  if v_falhas = 0 then
    raise notice '=== vocabulario_import: % asserções OK, 0 falhas ===', v_ok;
  else
    raise warning '✗ TOTAL vocabulario_import: % falha(s) — %', v_falhas, v_msgs;
  end if;
  raise notice 'FIM vocabulario_import: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

select * from _vocab_import_resumo;

rollback;
