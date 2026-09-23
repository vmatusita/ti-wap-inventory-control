-- =============================================================
-- Roteiro de teste: `empresa_id` NO ACERVO E O PAR DE BACKUP (F63, 23/09/2026)
-- =============================================================
-- A F63 põe `empresa_id uuid not null default public.empresa_legada() references
-- public.empresas (id)` nas oito tabelas do acervo (0160, 0161) — SEM update de backfill — e cria
-- `public.backups_migration` (0159), a tabela do par de backup. A FORMA da coluna é conferida
-- pelo catálogo no bloco 5 de `catalogo_policies.sql` (15a/15b/15c). Este roteiro prova o
-- COMPORTAMENTO, numa transação desfeita, com dado 100% fictício:
--
--   1 — o default vale (sabotagem G): um INSERT SEM `empresa_id` em cada uma das oito recebe
--       `public.empresa_legada()`; e toda linha das oito tem a coluna preenchida com ela;
--   2 — a FK vale (sabotagem G): um INSERT com empresa INEXISTENTE leva 23503 nas oito — e,
--       de volta como `postgres`, nenhuma linha com ela ficou (a recusa provada duas vezes);
--   3 — a armadilha da ficha (sabotagem E): o `update … set empresa_id` ingênuo leva 42501 da
--       `guarda_acervo` em `movimentacoes` e `lancamentos_item` (com o dado intacto) — e em
--       `ativos` ele PASSA: o relfilenode fica igual e o md5 de (id, xmin) muda. É a reescrita
--       silenciosa do fato 5, provada numa subtransação e desfeita;
--   4 — os dois instrumentos enxergam o que dizem enxergar (sabotagem D): numa tabela de
--       fixture, o default VOLÁTIL troca o relfilenode e o da fase não troca (atthasmissing);
--       um update de uma linha, numa subtransação, deixa o relfilenode igual e muda o md5 de
--       (id, xmin). ⚠ A subtransação importa: ela tem xid próprio. Sem ela, a linha inserida na
--       MESMA transação não muda de xmin, e a prova falharia pelo motivo errado;
--   5 — o par de backup (sabotagem F): o bloco BACKFILL canônico grava o par (inclusive o
--       valor NULL), o rollback do rodapé devolve os valores, conferidos linha a linha; SEM o
--       bloco, o rollback não tem de onde devolver (o controle negativo); o CHECK do nome e o
--       unique por célula recusam;
--   6 — `backups_migration` é fechada (sabotagem F): nenhum privilégio de `anon`,
--       `authenticated` e `service_role`, RLS ligada, sem force, zero policy; e, como cada um
--       dos três papéis, ler, gravar, alterar e apagar são RECUSADOS — e, de volta como
--       `postgres`, o conteúdo está intacto;
--   7 — ninguém lê `empresa_id` do acervo (sabotagem I, a metade SQL): nenhuma policy das oito
--       cita a coluna, nenhuma função de `public` e nenhuma view a lê junto de uma das oito — e
--       uma policy e uma função fictícias, que a leem, são acusadas (o gate sabe reprovar).
--
-- Tudo por `pg_temp.assert_zero_de`, que recusa universo vazio; rótulo literal (o injetor lê
-- por token). ESCREVE — `begin; … rollback;`: nada sobra no banco. As tabelas de fixture
-- (`public.f63_fixture_*`) nascem e morrem na transação.
-- =============================================================

begin;

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;

  -- A LISTA DAS OITO: a mesma de `k_lote1` (catalogo_policies.sql) — amarrada pelo describe 12
  -- de catalogos-seguranca.test.ts.
  k_oito constant text[] := array['anotacoes', 'ativos', 'colaboradores', 'itens', 'lancamentos_item',
                                  'movimentacoes', 'pendencias_item', 'termos_gerados'];
  k_autor   constant uuid := '63000000-0000-4000-8000-000000000001';
  -- uma empresa que NÃO existe (o v4 fictício) — o alvo da FK
  k_fantasma constant uuid := '63000000-0000-4000-8000-0000000000f0';
  k_legada  uuid := public.empresa_legada();

  v_f1      smallint;
  v_ativo   uuid;
  v_ativo2  uuid;
  v_mov     uuid;
  v_item    int;
  v_lanc    uuid;
  v_pend    uuid;
  v_anot    uuid;
  v_colab   uuid;
  v_termo   uuid := gen_random_uuid();

  v_n       bigint;
  v_univ    bigint;
  v_ruins   bigint;
  v_rot     text;
  v_txt     text;
  v_estado  text;
  v_r0      oid;
  v_r1      oid;
  v_r2      oid;
  v_r3      oid;
  v_m0      text;
  v_m1      text;
  v_m2      text;
  v_miss    boolean;
  v_papel   text;
  v_op      text;
  v_re_oito text;
begin
  select id into v_f1 from public.filiais where ativo order by id limit 1;
  if v_f1 is null then
    raise exception 'empresa_no_acervo: o banco precisa de ao menos UMA filial ativa para este roteiro';
  end if;
  -- O trigger `handle_new_user` cria o profile e a membership (domínio corporativo).
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values (k_autor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'f63.acervo@wap.ind.br', '', now(), now(), now());

  -- ==========================================================================
  -- 1 — O DEFAULT VALE: um INSERT SEM `empresa_id` em cada uma das oito.
  -- ==========================================================================
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0063001', 'F63ACERVO1', 'notebook', v_f1, 'cadastro') returning id into v_ativo;
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
  values ('WAP0063002', 'F63ACERVO2', 'notebook', v_f1, 'cadastro') returning id into v_ativo2;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
  values (v_ativo, 'compra', current_date - 3, v_f1, k_autor, now() - interval '3 days') returning id into v_mov;
  insert into public.itens (nome, grupo) values ('F63 Item Fictício do Acervo', 'acessorio') returning id into v_item;
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
  values (v_item, v_f1, 'entrada', 3, current_date, k_autor) returning id into v_lanc;
  insert into public.pendencias_item (ativo_id, movimentacao_id, item, filial_id, colaborador)
  values (v_ativo, v_mov, 'F63 pendência fictícia', v_f1, 'Fulano ZZF63') returning id into v_pend;
  insert into public.anotacoes (ativo_id, texto, criado_por)
  values (v_ativo, 'anotação fictícia da F63', k_autor) returning id into v_anot;
  insert into public.colaboradores (nome, criado_por)
  values ('Fulano ZZF63 Default', k_autor) returning id into v_colab;
  insert into public.termos_gerados (id, tipo, movimentacao_ids, ativo_ids, colaborador, dados, arquivo_path, gerado_por)
  values (v_termo, 'responsabilidade_notebook', array[v_mov], array[v_ativo], 'Fulano ZZF63', '{}'::jsonb,
          v_termo::text || '.docx', k_autor);

  select count(*) filter (where e is distinct from k_legada),
         coalesce(string_agg(t, ', ') filter (where e is distinct from k_legada), '')
    into v_ruins, v_rot
    from (values
      ('ativos',           (select empresa_id from public.ativos           where id = v_ativo)),
      ('movimentacoes',    (select empresa_id from public.movimentacoes    where id = v_mov)),
      ('itens',            (select empresa_id from public.itens            where id = v_item)),
      ('lancamentos_item', (select empresa_id from public.lancamentos_item where id = v_lanc)),
      ('pendencias_item',  (select empresa_id from public.pendencias_item  where id = v_pend)),
      ('anotacoes',        (select empresa_id from public.anotacoes        where id = v_anot)),
      ('colaboradores',    (select empresa_id from public.colaboradores    where id = v_colab)),
      ('termos_gerados',   (select empresa_id from public.termos_gerados   where id = v_termo))
    ) as x(t, e);
  if pg_temp.assert_zero_de('1a um INSERT sem empresa_id recebe public.empresa_legada() nas oito tabelas do acervo' ||
       case when v_ruins > 0 then ' — não recebeu: ' || v_rot else '' end, v_ruins, 8) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- count(*) = count(empresa_id) = count(*) filter (where empresa_id = legada), somado nas oito
  select sum(n), sum(n - comum)
    into v_univ, v_ruins
    from (
      select count(*) as n, count(*) filter (where empresa_id = k_legada) as comum from public.ativos
      union all select count(*), count(*) filter (where empresa_id = k_legada) from public.movimentacoes
      union all select count(*), count(*) filter (where empresa_id = k_legada) from public.lancamentos_item
      union all select count(*), count(*) filter (where empresa_id = k_legada) from public.pendencias_item
      union all select count(*), count(*) filter (where empresa_id = k_legada) from public.anotacoes
      union all select count(*), count(*) filter (where empresa_id = k_legada) from public.termos_gerados
      union all select count(*), count(*) filter (where empresa_id = k_legada) from public.colaboradores
      union all select count(*), count(*) filter (where empresa_id = k_legada) from public.itens
    ) s;
  if pg_temp.assert_zero_de('1b toda linha das oito tem empresa_id = public.empresa_legada() (count(*) = count(empresa_id) = da legada)',
       v_ruins, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- 2 — A FK VALE: empresa inexistente leva 23503 nas oito (e nada fica).
  -- ==========================================================================
  v_ruins := 0; v_rot := '';
  foreach v_txt in array k_oito loop
    begin
      case v_txt
        when 'ativos' then
          insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, empresa_id)
          values ('WAP0063009', 'F63FANTASMA', 'notebook', v_f1, 'cadastro', k_fantasma);
        when 'movimentacoes' then
          insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, empresa_id)
          values (v_ativo2, 'compra', current_date, v_f1, k_autor, k_fantasma);
        when 'itens' then
          insert into public.itens (nome, grupo, empresa_id) values ('F63 Item Fantasma', 'acessorio', k_fantasma);
        when 'lancamentos_item' then
          insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por, empresa_id)
          values (v_item, v_f1, 'entrada', 1, current_date, k_autor, k_fantasma);
        when 'pendencias_item' then
          insert into public.pendencias_item (ativo_id, movimentacao_id, item, filial_id, colaborador, empresa_id)
          values (v_ativo, v_mov, 'F63 pendência fantasma', v_f1, 'Fulano ZZF63', k_fantasma);
        when 'anotacoes' then
          insert into public.anotacoes (ativo_id, texto, criado_por, empresa_id)
          values (v_ativo, 'anotação fantasma da F63', k_autor, k_fantasma);
        when 'colaboradores' then
          insert into public.colaboradores (nome, criado_por, empresa_id)
          values ('Fulano ZZF63 Fantasma', k_autor, k_fantasma);
        when 'termos_gerados' then
          -- movimentação e ativo PRÓPRIOS (os arrays não têm FK, fato 4): com os do termo do bloco 1, o
          -- unique do termo recusava antes da FK (23505 — medido no CI, run 35867455348).
          insert into public.termos_gerados (id, tipo, movimentacao_ids, ativo_ids, colaborador, dados, arquivo_path, gerado_por, empresa_id)
          values (gen_random_uuid(), 'responsabilidade_notebook', array[gen_random_uuid()], array[v_ativo2], 'Fulano ZZF63', '{}'::jsonb,
                  'f63-fantasma.docx', k_autor, k_fantasma);
      end case;
      v_ruins := v_ruins + 1; v_rot := v_rot || ' ' || v_txt || '(passou)';
    exception
      when foreign_key_violation then
        null;
      when others then
        v_ruins := v_ruins + 1; v_rot := v_rot || ' ' || v_txt || '(' || sqlstate || ')';
    end;
  end loop;
  if pg_temp.assert_zero_de('2a empresa_id de empresa inexistente é recusado com 23503 nas oito' ||
       case when v_ruins > 0 then ' — fora da regra:' || v_rot else '' end, v_ruins, 8) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- a segunda metade da recusa: como `postgres`, nenhuma linha com a empresa fantasma
  select (select count(*) from public.ativos where empresa_id = k_fantasma)
       + (select count(*) from public.movimentacoes where empresa_id = k_fantasma)
       + (select count(*) from public.itens where empresa_id = k_fantasma)
       + (select count(*) from public.lancamentos_item where empresa_id = k_fantasma)
       + (select count(*) from public.pendencias_item where empresa_id = k_fantasma)
       + (select count(*) from public.anotacoes where empresa_id = k_fantasma)
       + (select count(*) from public.colaboradores where empresa_id = k_fantasma)
       + (select count(*) from public.termos_gerados where empresa_id = k_fantasma)
    into v_ruins;
  if pg_temp.assert_zero_de('2b de volta como postgres, nenhuma linha com a empresa inexistente ficou nas oito', v_ruins, 8) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- 3 — A ARMADILHA DA FICHA: o `update` de backfill ingênuo.
  -- ==========================================================================
  select md5(string_agg(id::text || ':' || xmin::text, ',' order by id)) into v_m0
    from public.movimentacoes where id = v_mov;
  select md5(string_agg(id::text || ':' || xmin::text, ',' order by id)) into v_m2
    from public.lancamentos_item where id = v_lanc;
  v_ruins := 0; v_rot := '';
  begin
    update public.movimentacoes set empresa_id = public.empresa_legada() where id = v_mov;
    v_ruins := v_ruins + 1; v_rot := v_rot || ' movimentacoes(passou)';
  exception
    when insufficient_privilege then null;
    when others then v_ruins := v_ruins + 1; v_rot := v_rot || ' movimentacoes(' || sqlstate || ')';
  end;
  begin
    update public.lancamentos_item set empresa_id = public.empresa_legada() where id = v_lanc;
    v_ruins := v_ruins + 1; v_rot := v_rot || ' lancamentos_item(passou)';
  exception
    when insufficient_privilege then null;
    when others then v_ruins := v_ruins + 1; v_rot := v_rot || ' lancamentos_item(' || sqlstate || ')';
  end;
  -- a segunda metade: o (id, xmin) das duas linhas é o mesmo de antes
  if (select md5(string_agg(id::text || ':' || xmin::text, ',' order by id)) from public.movimentacoes where id = v_mov) is distinct from v_m0 then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' movimentacoes(xmin mudou)';
  end if;
  if (select md5(string_agg(id::text || ':' || xmin::text, ',' order by id)) from public.lancamentos_item where id = v_lanc) is distinct from v_m2 then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' lancamentos_item(xmin mudou)';
  end if;
  if pg_temp.assert_zero_de('3a o update de backfill ingênuo leva 42501 da guarda_acervo em movimentacoes e lancamentos_item, e o dado fica intacto' ||
       case when v_ruins > 0 then ' — fora da regra:' || v_rot else '' end, v_ruins, 4) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 3b — em `ativos` o mesmo update PASSA e reescreve (a guarda é só BEFORE DELETE). Numa
  --      subtransação (xid próprio), medido lá dentro e desfeito.
  v_r0 := pg_relation_filenode('public.ativos'::regclass);
  select md5(string_agg(id::text || ':' || xmin::text, ',' order by id)) into v_m0
    from public.ativos where id in (v_ativo, v_ativo2);
  v_estado := null; v_r1 := null; v_m1 := null;
  begin
    update public.ativos set empresa_id = public.empresa_legada() where id in (v_ativo, v_ativo2);
    get diagnostics v_n = row_count;
    v_r1 := pg_relation_filenode('public.ativos'::regclass);
    select md5(string_agg(id::text || ':' || xmin::text, ',' order by id)) into v_m1
      from public.ativos where id in (v_ativo, v_ativo2);
    v_estado := 'passou:' || v_n;
    raise exception 'f63-3b-desfaz';
  exception when others then
    if sqlerrm <> 'f63-3b-desfaz' then v_estado := 'erro ' || sqlstate || ': ' || sqlerrm; end if;
  end;
  raise notice '3b (medição) update em ativos: % · relfilenode % → % · md5(id, xmin) % → %', v_estado, v_r0, v_r1, v_m0, v_m1;
  v_ruins := (case when v_estado = 'passou:2' then 0 else 1 end)
           + (case when v_r1 = v_r0 then 0 else 1 end)
           + (case when v_m1 is distinct from v_m0 then 0 else 1 end);
  if pg_temp.assert_zero_de('3b em ativos o update de backfill PASSA e reescreve em silêncio: relfilenode igual, md5 de (id, xmin) diferente (fato 5)',
       v_ruins, 3) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- e o desfeito: de volta ao (id, xmin) de antes
  if pg_temp.assert_zero_de('3c o update em ativos foi desfeito com a subtransação (o md5 de (id, xmin) voltou)',
       case when (select md5(string_agg(id::text || ':' || xmin::text, ',' order by id))
                    from public.ativos where id in (v_ativo, v_ativo2)) = v_m0 then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- 4 — OS DOIS INSTRUMENTOS enxergam o que dizem enxergar (tabela de fixture).
  -- ==========================================================================
  create table public.f63_fixture_instrumento (id int primary key, v text);
  insert into public.f63_fixture_instrumento (id, v) values (1, 'a'), (2, 'b'), (3, 'c');

  v_r0 := pg_relation_filenode('public.f63_fixture_instrumento'::regclass);
  alter table public.f63_fixture_instrumento add column c_volatil uuid default gen_random_uuid();
  v_r1 := pg_relation_filenode('public.f63_fixture_instrumento'::regclass);
  alter table public.f63_fixture_instrumento add column c_empresa uuid not null default public.empresa_legada();
  v_r2 := pg_relation_filenode('public.f63_fixture_instrumento'::regclass);
  select a.atthasmissing into v_miss
    from pg_attribute a
   where a.attrelid = 'public.f63_fixture_instrumento'::regclass and a.attname = 'c_empresa';
  raise notice '4a/4b (medição) relfilenode: % → (default volátil) % → (default da fase) % · atthasmissing da coluna da fase: %',
    v_r0, v_r1, v_r2, v_miss;
  if pg_temp.assert_zero_de('4a o default VOLÁTIL (gen_random_uuid) reescreve a tabela: o relfilenode MUDA',
       case when v_r1 <> v_r0 then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('4b o default da fase (public.empresa_legada(), não-volátil) NÃO reescreve: relfilenode igual e atthasmissing',
       (case when v_r2 = v_r1 then 0 else 1 end) + (case when v_miss then 0 else 1 end), 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  select md5(string_agg(id::text || ':' || xmin::text, ',' order by id)) into v_m0 from public.f63_fixture_instrumento;
  v_estado := null; v_r3 := null; v_m1 := null;
  begin
    update public.f63_fixture_instrumento set v = 'z' where id = 2;
    v_r3 := pg_relation_filenode('public.f63_fixture_instrumento'::regclass);
    select md5(string_agg(id::text || ':' || xmin::text, ',' order by id)) into v_m1 from public.f63_fixture_instrumento;
    v_estado := 'passou';
    raise exception 'f63-4c-desfaz';
  exception when others then
    if sqlerrm <> 'f63-4c-desfaz' then v_estado := 'erro ' || sqlstate || ': ' || sqlerrm; end if;
  end;
  raise notice '4c (medição) update de UMA linha numa subtransação: relfilenode % → % · md5(id, xmin) % → %', v_r2, v_r3, v_m0, v_m1;
  if pg_temp.assert_zero_de('4c um update de uma linha deixa o relfilenode igual e MUDA o md5 de (id, xmin) — o relfilenode sozinho não o vê',
       (case when v_estado = 'passou' then 0 else 1 end) + (case when v_r3 = v_r2 then 0 else 1 end)
       + (case when v_m1 is distinct from v_m0 then 0 else 1 end), 3) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- 5 — O PAR DE BACKUP: a receita BACKFILL do RUNBOOK, ida e volta.
  -- ==========================================================================
  create table public.f63_fixture_backfill (id int primary key, status text not null, valor text);
  insert into public.f63_fixture_backfill (id, status, valor)
  values (1, 'a', 'x'), (2, 'a', null), (3, 'b', 'y'), (4, 'a', 'z');
  select md5(string_agg(id::text || '|' || status || '|' || coalesce(valor, '∅'), ',' order by id)) into v_m0
    from public.f63_fixture_backfill;

  -- O bloco canônico (o classificador exige a MESMA forma) e o comando que ele protege.
  insert into public.backups_migration (migration, tabela, coluna, chave, valor_anterior)
  select '0999_sintetica.sql', 'public.f63_fixture_backfill', 'valor', t.id::text, to_jsonb(t.valor)
    from public.f63_fixture_backfill t
   where t.status = 'a';
  update public.f63_fixture_backfill t
     set valor = 'novo'
   where t.status = 'a';

  select count(*) into v_n
    from public.backups_migration b
    join (values (1, 'x'), (2, null), (4, 'z')) as e(id, valor) on b.chave = e.id::text
   where b.migration = '0999_sintetica.sql' and b.tabela = 'public.f63_fixture_backfill' and b.coluna = 'valor'
     and b.valor_anterior is not distinct from to_jsonb(e.valor::text);
  if pg_temp.assert_zero_de('5a o bloco BACKFILL grava o par (chave, valor_anterior) de cada linha alterada — inclusive o NULL',
       3 - v_n, 3) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- O ROLLBACK DO RODAPÉ (a receita do RUNBOOK, literal).
  update public.f63_fixture_backfill t
     set valor = (jsonb_populate_record(null::public.f63_fixture_backfill,
                                        jsonb_build_object('valor', b.valor_anterior))).valor
    from public.backups_migration b
   where b.migration = '0999_sintetica.sql' and b.tabela = 'public.f63_fixture_backfill'
     and b.coluna = 'valor' and b.chave = t.id::text;
  select count(*) filter (where o.valor is distinct from f.valor) into v_ruins
    from public.f63_fixture_backfill f
    join (values (1, 'x'), (2, null), (3, 'y'), (4, 'z')) as o(id, valor) on o.id = f.id;
  if pg_temp.assert_zero_de('5b o rollback a partir de backups_migration devolve cada valor, linha a linha, inclusive o NULL',
       v_ruins, 4) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('5b-bis depois do rollback, o conteúdo da tabela é o de antes do backfill (md5)',
       case when (select md5(string_agg(id::text || '|' || status || '|' || coalesce(valor, '∅'), ',' order by id))
                    from public.f63_fixture_backfill) = v_m0 then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 5c — O CONTROLE NEGATIVO: o update SEM o bloco. O rollback não tem de onde devolver.
  update public.f63_fixture_backfill t set valor = 'sem-par' where t.status = 'b';
  update public.f63_fixture_backfill t
     set valor = (jsonb_populate_record(null::public.f63_fixture_backfill,
                                        jsonb_build_object('valor', b.valor_anterior))).valor
    from public.backups_migration b
   where b.migration = '0998_sem_par.sql' and b.tabela = 'public.f63_fixture_backfill'
     and b.coluna = 'valor' and b.chave = t.id::text;
  get diagnostics v_n = row_count;
  if pg_temp.assert_zero_de('5c sem o bloco de backup, o rollback não devolve nada — o valor alterado fica (o controle negativo)',
       v_n + (case when (select valor from public.f63_fixture_backfill where id = 3) = 'sem-par' then 0 else 1 end), 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 5d — o CHECK do nome do arquivo e da tabela; 5e — um valor anterior por célula.
  v_ruins := 0; v_rot := '';
  begin
    insert into public.backups_migration (migration, tabela, coluna, chave) values ('sem_formato.sql', 'public.x', 'c', '1');
    v_ruins := v_ruins + 1; v_rot := v_rot || ' migration-sem-numero(passou)';
  exception when check_violation then null;
  end;
  begin
    insert into public.backups_migration (migration, tabela, coluna, chave) values ('0999_sintetica.sql', 'x', 'c', '1');
    v_ruins := v_ruins + 1; v_rot := v_rot || ' tabela-sem-esquema(passou)';
  exception when check_violation then null;
  end;
  begin
    insert into public.backups_migration (migration, tabela, coluna, chave) values ('0999_sintetica.sql', 'public.f63_fixture_backfill', 'valor', '1');
    v_ruins := v_ruins + 1; v_rot := v_rot || ' celula-repetida(passou)';
  exception when unique_violation then null;
  end;
  if pg_temp.assert_zero_de('5d backups_migration recusa nome sem o formato NNNN_x.sql, tabela sem esquema e a mesma célula duas vezes' ||
       case when v_ruins > 0 then ' — passou:' || v_rot else '' end, v_ruins, 3) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 5e — OS TIPOS (revisão adversarial da F63): a receita devolve array, jsonb, enum, numeric e
  --      timestamptz — e o null de cada um —, numa tabela com identity, coluna gerada e not null
  --      (o jsonb_populate_record monta a linha INTEIRA do tipo antes de a receita tirar uma coluna).
  create table public.f63_fixture_tipos (
    id     int primary key,
    lista  text[],
    doc    jsonb,
    estado public.status_ativo,
    valor  numeric(10, 2),
    quando timestamptz,
    seq    bigint generated always as identity,
    dobro  int generated always as (id * 2) stored,
    obrig  text not null default 'x'
  );
  insert into public.f63_fixture_tipos (id, lista, doc, estado, valor, quando)
  values (1, array['a', 'b'], '{"k": [1, 2]}'::jsonb, 'em_uso', 12.34, '2026-01-02 03:04:05+00'),
         (2, null, null, null, null, null);
  select md5(string_agg(to_jsonb(t)::text, '|' order by t.id)) into v_m0 from public.f63_fixture_tipos t;

  insert into public.backups_migration (migration, tabela, coluna, chave, valor_anterior)
  select '0998_tipos.sql', 'public.f63_fixture_tipos', 'lista', t.id::text, to_jsonb(t.lista)
    from public.f63_fixture_tipos t
   where true;
  insert into public.backups_migration (migration, tabela, coluna, chave, valor_anterior)
  select '0998_tipos.sql', 'public.f63_fixture_tipos', 'doc', t.id::text, to_jsonb(t.doc)
    from public.f63_fixture_tipos t
   where true;
  insert into public.backups_migration (migration, tabela, coluna, chave, valor_anterior)
  select '0998_tipos.sql', 'public.f63_fixture_tipos', 'estado', t.id::text, to_jsonb(t.estado)
    from public.f63_fixture_tipos t
   where true;
  insert into public.backups_migration (migration, tabela, coluna, chave, valor_anterior)
  select '0998_tipos.sql', 'public.f63_fixture_tipos', 'valor', t.id::text, to_jsonb(t.valor)
    from public.f63_fixture_tipos t
   where true;
  insert into public.backups_migration (migration, tabela, coluna, chave, valor_anterior)
  select '0998_tipos.sql', 'public.f63_fixture_tipos', 'quando', t.id::text, to_jsonb(t.quando)
    from public.f63_fixture_tipos t
   where true;
  update public.f63_fixture_tipos t
     set lista = array['z'], doc = '{"novo": true}'::jsonb, estado = 'em_estoque', valor = 99.99,
         quando = '2030-01-01 00:00:00+00'
   where true;

  update public.f63_fixture_tipos t
     set lista = (jsonb_populate_record(null::public.f63_fixture_tipos, jsonb_build_object('lista', b.valor_anterior))).lista
    from public.backups_migration b
   where b.migration = '0998_tipos.sql' and b.tabela = 'public.f63_fixture_tipos' and b.coluna = 'lista' and b.chave = t.id::text;
  update public.f63_fixture_tipos t
     set doc = (jsonb_populate_record(null::public.f63_fixture_tipos, jsonb_build_object('doc', b.valor_anterior))).doc
    from public.backups_migration b
   where b.migration = '0998_tipos.sql' and b.tabela = 'public.f63_fixture_tipos' and b.coluna = 'doc' and b.chave = t.id::text;
  update public.f63_fixture_tipos t
     set estado = (jsonb_populate_record(null::public.f63_fixture_tipos, jsonb_build_object('estado', b.valor_anterior))).estado
    from public.backups_migration b
   where b.migration = '0998_tipos.sql' and b.tabela = 'public.f63_fixture_tipos' and b.coluna = 'estado' and b.chave = t.id::text;
  update public.f63_fixture_tipos t
     set valor = (jsonb_populate_record(null::public.f63_fixture_tipos, jsonb_build_object('valor', b.valor_anterior))).valor
    from public.backups_migration b
   where b.migration = '0998_tipos.sql' and b.tabela = 'public.f63_fixture_tipos' and b.coluna = 'valor' and b.chave = t.id::text;
  update public.f63_fixture_tipos t
     set quando = (jsonb_populate_record(null::public.f63_fixture_tipos, jsonb_build_object('quando', b.valor_anterior))).quando
    from public.backups_migration b
   where b.migration = '0998_tipos.sql' and b.tabela = 'public.f63_fixture_tipos' and b.coluna = 'quando' and b.chave = t.id::text;

  select md5(string_agg(to_jsonb(t)::text, '|' order by t.id)) into v_m1 from public.f63_fixture_tipos t;
  raise notice '5e (medição) a linha inteira antes do backfill % · depois do rollback %', v_m0, v_m1;
  if pg_temp.assert_zero_de('5e o rollback devolve array, jsonb, enum, numeric e timestamptz (e o null de cada um), com identity, coluna gerada e not null na tabela',
       case when v_m1 = v_m0 then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- 6 — backups_migration FECHADA (o molde de public.ambiente).
  -- ==========================================================================
  select count(*) filter (where has_table_privilege(r, 'public.backups_migration', p)),
         coalesce(string_agg(r || ':' || p, ', ') filter (where has_table_privilege(r, 'public.backups_migration', p)), '')
    into v_ruins, v_rot
    from unnest(array['anon', 'authenticated', 'service_role']) as r
   cross join unnest(array['select', 'insert', 'update', 'delete', 'truncate']) as p;
  if pg_temp.assert_zero_de('6a nenhum privilégio de anon, authenticated ou service_role em backups_migration' ||
       case when v_ruins > 0 then ' — tem: ' || v_rot else '' end, v_ruins, 15) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  select (case when c.relrowsecurity then 0 else 1 end) + (case when c.relforcerowsecurity then 1 else 0 end)
       + (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'backups_migration')
    into v_ruins
    from pg_class c where c.oid = 'public.backups_migration'::regclass;
  if pg_temp.assert_zero_de('6c backups_migration: RLS ligada, sem force, ZERO policy', v_ruins, 3) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 6b — a recusa, como cada papel; e a segunda metade, como postgres
  select md5(string_agg(migration || tabela || coluna || chave || coalesce(valor_anterior::text, '∅'), ',' order by id)), count(*)
    into v_m0, v_univ
    from public.backups_migration;
  v_ruins := 0; v_rot := '';
  foreach v_papel in array array['anon', 'authenticated', 'service_role'] loop
    foreach v_op in array array['select', 'insert', 'update', 'delete'] loop
      begin
        execute format('set local role %I', v_papel);
        case v_op
          when 'select' then perform count(*) from public.backups_migration;
          when 'insert' then insert into public.backups_migration (migration, tabela, coluna, chave)
                             values ('0997_invasora.sql', 'public.x', 'c', '1');
          when 'update' then update public.backups_migration set coluna = 'invadida';
          when 'delete' then delete from public.backups_migration;
        end case;
        reset role;
        v_ruins := v_ruins + 1; v_rot := v_rot || ' ' || v_papel || ':' || v_op;
      exception
        when insufficient_privilege then
          null;
        when others then
          v_ruins := v_ruins + 1; v_rot := v_rot || ' ' || v_papel || ':' || v_op || '(' || sqlstate || ')';
      end;
      reset role;
    end loop;
  end loop;
  if (select md5(string_agg(migration || tabela || coluna || chave || coalesce(valor_anterior::text, '∅'), ',' order by id))
        from public.backups_migration) is distinct from v_m0 then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (o conteúdo mudou)';
  end if;
  if pg_temp.assert_zero_de('6b anon, authenticated e service_role são RECUSADOS ao ler, gravar, alterar e apagar backups_migration — e o conteúdo fica intacto' ||
       case when v_ruins > 0 then ' — passou:' || v_rot else '' end, v_ruins, 13) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- 7 — NINGUÉM LÊ `empresa_id` DO ACERVO (a metade SQL da sabotagem I).
  -- ==========================================================================
  v_re_oito := '\m(' || array_to_string(k_oito, '|') || ')\M';

  select count(*), count(*) filter (where coalesce(p.qual, '') ~ '\mempresa_id\M' or coalesce(p.with_check, '') ~ '\mempresa_id\M')
    into v_univ, v_ruins
    from pg_policies p where p.schemaname = 'public' and p.tablename = any (k_oito);
  if pg_temp.assert_zero_de('7a nenhuma policy das oito tabelas do acervo cita empresa_id (o recorte é da F66)', v_ruins, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 7b — funções de public que tocam as oito E citam empresa_id. A exceção nominal
  -- `checagens_integridade_nucleo` (0158) lê `m.empresa_id` de MEMBROS, num comando que não toca
  -- o acervo; a leitura por comando e por alias é conferida no disco por
  -- src/lib/validators/empresa-acervo-sem-leitura.test.ts.
  select count(*),
         count(*) filter (where p.prosrc ~ '\mempresa_id\M' and p.proname <> 'checagens_integridade_nucleo'),
         coalesce(string_agg(p.proname, ', ') filter (where p.prosrc ~ '\mempresa_id\M' and p.proname <> 'checagens_integridade_nucleo'), '')
    into v_univ, v_ruins, v_rot
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosrc ~ v_re_oito;
  if pg_temp.assert_zero_de('7b nenhuma função de public lê empresa_id junto de uma das oito (fora da exceção nominal checagens_integridade_nucleo)' ||
       case when v_ruins > 0 then ' — lê: ' || v_rot else '' end, v_ruins, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  select count(*), count(*) filter (where v.definition ~ '\mempresa_id\M')
    into v_univ, v_ruins
    from pg_views v where v.schemaname = 'public' and v.definition ~ v_re_oito;
  if pg_temp.assert_zero_de('7c nenhuma view de public lê empresa_id junto de uma das oito', v_ruins, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 7d — a AUTO-SABOTAGEM: uma policy e uma função fictícias que leem a coluna são acusadas.
  v_estado := null;
  begin
    create policy f63_sabotagem_le_empresa on public.ativos for select to authenticated
      using (empresa_id = (select public.empresa_legada()));
    create function public.f63_sabotagem_le_empresa() returns bigint language sql stable as $s$
      select count(*) from public.movimentacoes m where m.empresa_id = public.empresa_legada()
    $s$;
    select (select count(*) from pg_policies p
             where p.schemaname = 'public' and p.tablename = any (k_oito)
               and (coalesce(p.qual, '') ~ '\mempresa_id\M' or coalesce(p.with_check, '') ~ '\mempresa_id\M'))::text
           || '/' ||
           (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.prosrc ~ v_re_oito and p.prosrc ~ '\mempresa_id\M'
               and p.proname <> 'checagens_integridade_nucleo')::text
      into v_estado;
    raise exception 'f63-7d-desfaz';
  exception when others then
    if sqlerrm <> 'f63-7d-desfaz' then v_estado := 'erro ' || sqlstate || ': ' || sqlerrm; end if;
  end;
  if pg_temp.assert_zero_de('7d auto-sabotagem: a policy e a função fictícias que leem empresa_id do acervo são ACUSADAS (o gate sabe reprovar)' ||
       case when v_estado is distinct from '1/1' then ' — acusou ' || coalesce(v_estado, '∅') || ' (esperado 1/1)' else '' end,
       case when v_estado = '1/1' then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM empresa_no_acervo: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
