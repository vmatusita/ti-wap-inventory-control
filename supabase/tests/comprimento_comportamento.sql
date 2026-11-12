-- =============================================================
-- Roteiro de teste: O TETO DE COMPRIMENTO RECUSA DE VERDADE (F66B, 12/11/2026) — as sabotagens C e D
-- =============================================================
-- `comprimento_por_coluna.sql` prova que o CHECK EXISTE, na forma certa, com o teto da fonte. Este prova que ele
-- RECUSA — e que quem recusa é ele (toda recusa provada duas vezes: o teto + 1 leva 23514 COM o CHECK, e passa SEM ele):
--   B1 — PARA CADA UMA das 65 colunas da fonte (o laço sobre `k_comprimento_teto`), numa cópia da tabela que só tem o
--        CHECK daquela coluna (o texto VIVO dele, `pg_get_constraintdef`): o teto passa (B1a); o teto + 1 leva 23514
--        com o nome da constraint (B1b); NULL passa (B1c — PG 17, ddl-constraints: "satisfied if the check expression
--        evaluates to true or the null value"); o UPDATE para o teto + 1 leva 23514 com o nome (B1d); e sem o CHECK o
--        teto + 1 passa (B1e). Num derivado (`*_chave`), o valor entra pela ORIGEM;
--   D0 — os derivados declarados (`k_comprimento_derivado`) são EXATAMENTE as colunas geradas de texto das 20;
--   L1–L4 — na tabela REAL, como `postgres` (o papel que atravessa RLS, como o service role — a prova de que a trava
--        mora no banco), uma coluna por lote: INSERT e UPDATE no teto passam, no teto + 1 levam 23514 com o nome, e
--        sem o CHECK (numa subtransação desfeita) o teto + 1 passa;
--   I1–I4 — a RPC do import CHAMADA POR FORA (sem Server Action, sem o Zod do plano): um campo do `jsonb` acima do teto
--        leva 23514 (I1) e a filial fica COMO ANTES, inclusive o acervo que a limpeza do import teria apagado (I2); no
--        teto exato, grava (I3); e sem o CHECK, a mesma chamada GRAVA o valor longo (I4) — o desvio que existia;
--   K1–K5 — a chave derivada no pior caso: 120 caracteres de U+FB2C dão uma chave MAIOR que a origem (K1 — o teto igual
--        ao da origem seria o bug) e que CABE no teto 3× (K2, inserindo de verdade); idem item e vocabulário (K3, K4);
--        e o U+0130 cabe (K5).
--
-- Antes das migrations da F66B ele reprova: o teto + 1 passa (B1b, B1d, L*, I1). docs/f66b-evidencias/B-travas/.
--
-- DADOS: 100% fictícios (`ZZF66B…`, "F66B Teste"); tudo dentro de `begin; … rollback;`. `k_comprimento_teto`,
-- `k_comprimento_nome_alternativo` e `k_comprimento_derivado` são amarrados à fonte TS por
-- src/lib/validators/tetos-coluna.test.ts.
-- =============================================================

begin;

-- Tenta um comando; devolve 'ok' ou '<sqlstate>:<constraint>'. Um sucesso fica (dentro da transação do roteiro).
create function pg_temp.f66b_tenta(p_sql text) returns text
language plpgsql as $f$
declare
  v_estado text;
  v_con    text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_con = constraint_name;
  return v_estado || ':' || coalesce(v_con, '');
end
$f$;

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;
  v_cnt    bigint;
  v_univ   bigint;
  v_lista  text;
  v_r      text;
  v_def    text;
  v_rel    text;
  v_col    text;
  v_alvo   text;
  v_nome   text;
  v_n      int;
  v_gerada boolean;
  v_x      text;
  v_c      text;
  v_ruim   text[] := array['', '', '', '', ''];
  v_qtd    int[] := array[0, 0, 0, 0, 0];
  v_prof   uuid;
  v_f      smallint;
  v_fi     smallint;
  v_colab  uuid;
  v_ativo  uuid;
  v_ativo0 uuid;
  v_senha  uuid;
  v_prefixo text;
  v_plano  jsonb;
  v_res    jsonb;
  v_s      text;
  v_erro   text;
  v_estado text;
  v_con    text;

  -- OS TETOS — cópia da fonte única (src/lib/validators/tetos-coluna.ts), amarrada pela trava de mesa.
  k_comprimento_teto text[] := array[
    'colaboradores.nome:120', 'colaboradores.matricula:40', 'colaboradores.setor:80', 'colaboradores.nome_chave:360',
    'itens.nome:80', 'itens.nome_chave:240',
    'termos_gerados.tipo:40', 'termos_gerados.colaborador:200', 'termos_gerados.arquivo_path:80',
    'anotacoes.texto:2000',
    'ativos.patrimonio:60', 'ativos.patrimonio_original:60', 'ativos.marca:60', 'ativos.modelo:120',
    'ativos.service_tag:100', 'ativos.hostname:60', 'ativos.memoria:80', 'ativos.armazenamento:80',
    'ativos.processador:80', 'ativos.fornecedor:80', 'ativos.colaborador_atual:120', 'ativos.setor_atual:120',
    'ativos.pendencia:200', 'ativos.origem:40', 'ativos.observacoes:2000', 'ativos.telefone:60', 'ativos.imei:60',
    'ativos.pulsus:60',
    'movimentacoes.motivo:40', 'movimentacoes.colaborador:120', 'movimentacoes.setor:120', 'movimentacoes.chamado:80',
    'movimentacoes.observacao:500', 'movimentacoes.chamado_fornecedor:200',
    'pendencias_item.item:80', 'pendencias_item.colaborador:120', 'pendencias_item.status:40',
    'pendencias_item.desfecho:40', 'pendencias_item.observacao:500',
    'lancamentos_item.chamado:20', 'lancamentos_item.colaborador:120', 'lancamentos_item.observacao:2000',
    'import_prefixos_patrimonio.prefixo:4',
    'import_termos_categoria.termo:40', 'import_termos_categoria.rotulo:40',
    'import_termos_estado.termo:40', 'import_termos_estado.rotulo:40',
    'unidades_apelidos.apelido:80', 'unidades_apelidos.apelido_chave:240',
    'tipos_item.slug:30', 'tipos_item.rotulo:60',
    'motivos.codigo:40', 'motivos.rotulo:80',
    'kits_modelos.nome:80',
    'filiais.slug:40', 'filiais.nome:80', 'filiais.cidade:120',
    'relatorios_gerados.observacao:2000',
    'import_logs.modo:40', 'import_logs.arquivo_hash:128', 'import_logs.backup_path:120',
    'eventos_admin.acao:80', 'eventos_admin.alvo:500',
    'senhas_acesso.rotulo:80', 'senhas_acesso.hash:200'
  ];
  k_comprimento_nome_alternativo text[] := array[
    'unidades_apelidos.apelido:unidades_apelidos_apelido_bruto_tamanho'
  ];
  -- Os derivados (coluna gerada) e a ORIGEM de cada um — o valor do teste entra pela origem.
  k_comprimento_derivado text[] := array[
    'colaboradores.nome_chave:nome', 'itens.nome_chave:nome', 'unidades_apelidos.apelido_chave:apelido'
  ];
  k_negocio text[] := array[
    'anotacoes', 'ativos', 'colaboradores', 'eventos_admin', 'filiais',
    'import_logs', 'import_prefixos_patrimonio', 'import_termos_categoria',
    'import_termos_estado', 'itens', 'kits_modelos', 'lancamentos_item',
    'motivos', 'movimentacoes', 'pendencias_item', 'relatorios_gerados',
    'senhas_acesso', 'termos_gerados', 'tipos_item', 'unidades_apelidos'
  ];
begin
  -- D0 — os derivados declarados são exatamente as colunas geradas de texto das 20
  select count(*), coalesce(string_agg(x, ', ' order by x), '')
    into v_cnt, v_lista
    from (
      (select c.relname || '.' || a.attname as x
         from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        where c.relnamespace = 'public'::regnamespace and c.relname = any (k_negocio)
          and a.attgenerated = 's' and a.atttypid = 'text'::regtype
       except select split_part(d, ':', 1) from unnest(k_comprimento_derivado) d)
      union all
      (select split_part(d, ':', 1) from unnest(k_comprimento_derivado) d
       except select c.relname || '.' || a.attname
         from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        where c.relnamespace = 'public'::regnamespace and c.relname = any (k_negocio)
          and a.attgenerated = 's' and a.atttypid = 'text'::regtype)
    ) s;
  if pg_temp.assert_zero_de(
       'D0 os derivados declarados são exatamente as colunas geradas de texto das 20' ||
       case when v_cnt > 0 then ' — diverge: ' || v_lista else '' end,
       v_cnt, array_length(k_comprimento_derivado, 1)::bigint) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ===============================================================
  -- B1 — o laço sobre as 65 colunas da fonte, numa cópia com SÓ o CHECK da coluna
  -- ===============================================================
  v_univ := 0;
  foreach v_x in array k_comprimento_teto loop
    v_univ := v_univ + 1;
    v_rel := split_part(split_part(v_x, ':', 1), '.', 1);
    v_col := split_part(split_part(v_x, ':', 1), '.', 2);
    v_n := split_part(v_x, ':', 2)::int;
    v_nome := coalesce((select split_part(a, ':', 2) from unnest(k_comprimento_nome_alternativo) a
                         where split_part(a, ':', 1) = v_rel || '.' || v_col),
                       v_rel || '_' || v_col || '_tamanho');
    v_alvo := coalesce((select split_part(d, ':', 2) from unnest(k_comprimento_derivado) d
                         where split_part(d, ':', 1) = v_rel || '.' || v_col), v_col);
    select pg_get_constraintdef(k.oid) into v_def
      from pg_constraint k
     where k.conrelid = ('public.' || v_rel)::regclass and k.contype = 'c' and k.conname = v_nome;

    execute format('create temp table _f66b_copia (like public.%I including defaults including generated)', v_rel);
    for v_c in select a.attname from pg_attribute a
                where a.attrelid = '_f66b_copia'::regclass and a.attnum > 0 and a.attnotnull and not a.attisdropped loop
      execute format('alter table _f66b_copia alter column %I drop not null', v_c);
    end loop;
    if v_def is not null then
      execute format('alter table _f66b_copia add constraint %I %s', v_nome, v_def);
    end if;

    -- B1a — o teto passa
    v_r := pg_temp.f66b_tenta(format('insert into _f66b_copia (%I) values (repeat(%L, %s))', v_alvo, 'a', v_n));
    if v_r <> 'ok' then v_qtd[1] := v_qtd[1] + 1; v_ruim[1] := v_ruim[1] || ' ' || v_rel || '.' || v_col || '=' || v_r; end if;
    -- B1b — o teto + 1 leva 23514 com o nome da constraint
    v_r := pg_temp.f66b_tenta(format('insert into _f66b_copia (%I) values (repeat(%L, %s))', v_alvo, 'a', v_n + 1));
    if v_r <> '23514:' || v_nome then v_qtd[2] := v_qtd[2] + 1; v_ruim[2] := v_ruim[2] || ' ' || v_rel || '.' || v_col || '=' || v_r; end if;
    -- B1c — NULL passa
    v_r := pg_temp.f66b_tenta(format('insert into _f66b_copia (%I) values (null)', v_alvo));
    if v_r <> 'ok' then v_qtd[3] := v_qtd[3] + 1; v_ruim[3] := v_ruim[3] || ' ' || v_rel || '.' || v_col || '=' || v_r; end if;
    -- B1d — o UPDATE para o teto + 1 leva 23514 com o nome
    v_r := pg_temp.f66b_tenta(format('update _f66b_copia set %I = repeat(%L, %s) where char_length(%I) = %s',
                                     v_alvo, 'a', v_n + 1, v_alvo, v_n));
    if v_r <> '23514:' || v_nome then v_qtd[4] := v_qtd[4] + 1; v_ruim[4] := v_ruim[4] || ' ' || v_rel || '.' || v_col || '=' || v_r; end if;
    -- B1e — sem o CHECK, o teto + 1 passa (quem recusou foi ele)
    if v_def is not null then
      execute format('alter table _f66b_copia drop constraint %I', v_nome);
    end if;
    v_r := pg_temp.f66b_tenta(format('insert into _f66b_copia (%I) values (repeat(%L, %s))', v_alvo, 'a', v_n + 1));
    if v_r <> 'ok' then v_qtd[5] := v_qtd[5] + 1; v_ruim[5] := v_ruim[5] || ' ' || v_rel || '.' || v_col || '=' || v_r; end if;

    drop table _f66b_copia;
  end loop;

  if pg_temp.assert_zero_de('B1a o valor NO teto passa, em cada uma das colunas da fonte' ||
       case when v_qtd[1] > 0 then ' —' || v_ruim[1] else '' end, v_qtd[1]::bigint, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('B1b o teto + 1 leva 23514 com o nome <tabela>_<coluna>_tamanho, em cada coluna' ||
       case when v_qtd[2] > 0 then ' —' || left(v_ruim[2], 1500) else '' end, v_qtd[2]::bigint, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('B1c NULL passa, em cada coluna' ||
       case when v_qtd[3] > 0 then ' —' || v_ruim[3] else '' end, v_qtd[3]::bigint, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('B1d o UPDATE para o teto + 1 leva 23514 com o nome, em cada coluna' ||
       case when v_qtd[4] > 0 then ' —' || left(v_ruim[4], 1500) else '' end, v_qtd[4]::bigint, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('B1e sem o CHECK o teto + 1 passa (quem recusou foi o CHECK)' ||
       case when v_qtd[5] > 0 then ' —' || v_ruim[5] else '' end, v_qtd[5]::bigint, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ===============================================================
  -- As fixtures (fictícias) das tabelas reais
  -- ===============================================================
  v_prof := pg_temp.perfil_ativo_mais_antigo();
  if v_prof is null then
    raise exception 'PRE-REQUISITO: crie ao menos 1 operador (profile) antes de rodar este roteiro';
  end if;
  insert into public.filiais (slug, nome) values ('zzf66b-a', 'F66B Teste A') returning id into v_f;

  -- ===============================================================
  -- L1 — lote 1, colaboradores: INSERT do nome, UPDATE do setor
  -- ===============================================================
  v_r := pg_temp.f66b_tenta(format(
    'insert into public.colaboradores (nome, filial_id, criado_por) values (repeat(%L, 120), %s, %L)', 'n', v_f, v_prof));
  v_s := pg_temp.f66b_tenta(format(
    'insert into public.colaboradores (nome, filial_id, criado_por) values (repeat(%L, 121), %s, %L)', 'o', v_f, v_prof));
  if v_r = 'ok' and v_s = '23514:colaboradores_nome_tamanho' then
    v_ok := v_ok + 1; raise notice '✓ L1a colaboradores: INSERT do nome com 120 passa, com 121 leva 23514 colaboradores_nome_tamanho';
  else
    v_falhas := v_falhas + 1; raise warning '✗ L1a colaboradores INSERT: no teto %, teto + 1 %', v_r, v_s;
  end if;
  select id into v_colab from public.colaboradores where filial_id = v_f and nome = repeat('n', 120);
  v_r := pg_temp.f66b_tenta(format('update public.colaboradores set setor = repeat(%L, 80) where id = %L', 's', v_colab));
  v_s := pg_temp.f66b_tenta(format('update public.colaboradores set setor = repeat(%L, 81) where id = %L', 's', v_colab));
  if v_r = 'ok' and v_s = '23514:colaboradores_setor_tamanho' then
    v_ok := v_ok + 1; raise notice '✓ L1b colaboradores: UPDATE do setor com 80 passa, com 81 leva 23514 colaboradores_setor_tamanho';
  else
    v_falhas := v_falhas + 1; raise warning '✗ L1b colaboradores UPDATE: no teto %, teto + 1 %', v_r, v_s;
  end if;
  v_s := null; v_erro := null;
  begin
    alter table public.colaboradores drop constraint colaboradores_nome_tamanho;
    v_s := pg_temp.f66b_tenta(format(
      'insert into public.colaboradores (nome, filial_id, criado_por) values (repeat(%L, 121), %s, %L)', 'p', v_f, v_prof));
    raise exception 'f66b-desfaz';
  exception when others then
    if sqlerrm <> 'f66b-desfaz' then v_erro := sqlerrm; end if;
  end;
  if v_s = 'ok' then
    v_ok := v_ok + 1; raise notice '✓ L1c sem colaboradores_nome_tamanho o nome com 121 passa (quem recusou foi o CHECK)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ L1c sem o CHECK: % (erro: %)', coalesce(v_s, '∅'), coalesce(v_erro, '—');
  end if;

  -- ===============================================================
  -- L2 — lote 2, ativos: INSERT da marca, UPDATE das observações
  -- ===============================================================
  v_r := pg_temp.f66b_tenta(format(
    'insert into public.ativos (patrimonio, service_tag, categoria, filial_id, marca) values (null, %L, %L, %s, repeat(%L, 60))',
    'ZZF66BST1', 'notebook', v_f, 'm'));
  v_s := pg_temp.f66b_tenta(format(
    'insert into public.ativos (patrimonio, service_tag, categoria, filial_id, marca) values (null, %L, %L, %s, repeat(%L, 61))',
    'ZZF66BST2', 'notebook', v_f, 'm'));
  if v_r = 'ok' and v_s = '23514:ativos_marca_tamanho' then
    v_ok := v_ok + 1; raise notice '✓ L2a ativos: INSERT da marca com 60 passa, com 61 leva 23514 ativos_marca_tamanho';
  else
    v_falhas := v_falhas + 1; raise warning '✗ L2a ativos INSERT: no teto %, teto + 1 %', v_r, v_s;
  end if;
  select id into v_ativo from public.ativos where filial_id = v_f and service_tag = 'ZZF66BST1';
  v_r := pg_temp.f66b_tenta(format('update public.ativos set observacoes = repeat(%L, 2000) where id = %L', 'o', v_ativo));
  v_s := pg_temp.f66b_tenta(format('update public.ativos set observacoes = repeat(%L, 2001) where id = %L', 'o', v_ativo));
  if v_r = 'ok' and v_s = '23514:ativos_observacoes_tamanho' then
    v_ok := v_ok + 1; raise notice '✓ L2b ativos: UPDATE das observações com 2000 passa, com 2001 leva 23514 ativos_observacoes_tamanho';
  else
    v_falhas := v_falhas + 1; raise warning '✗ L2b ativos UPDATE: no teto %, teto + 1 %', v_r, v_s;
  end if;
  v_s := null; v_erro := null;
  begin
    alter table public.ativos drop constraint ativos_observacoes_tamanho;
    v_s := pg_temp.f66b_tenta(format('update public.ativos set observacoes = repeat(%L, 2001) where id = %L', 'o', v_ativo));
    raise exception 'f66b-desfaz';
  exception when others then
    if sqlerrm <> 'f66b-desfaz' then v_erro := sqlerrm; end if;
  end;
  if v_s = 'ok' then
    v_ok := v_ok + 1; raise notice '✓ L2c sem ativos_observacoes_tamanho as observações com 2001 passam (quem recusou foi o CHECK)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ L2c sem o CHECK: % (erro: %)', coalesce(v_s, '∅'), coalesce(v_erro, '—');
  end if;

  -- ===============================================================
  -- L3 — lote 3, motivos: INSERT do código, UPDATE do rótulo
  -- ===============================================================
  v_r := pg_temp.f66b_tenta(format(
    'insert into public.motivos (codigo, rotulo, aplica_a) values (repeat(%L, 40), %L, array[%L]::public.tipo_movimentacao[])',
    'c', 'F66B motivo', 'saida'));
  v_s := pg_temp.f66b_tenta(format(
    'insert into public.motivos (codigo, rotulo, aplica_a) values (repeat(%L, 41), %L, array[%L]::public.tipo_movimentacao[])',
    'd', 'F66B motivo', 'saida'));
  if v_r = 'ok' and v_s = '23514:motivos_codigo_tamanho' then
    v_ok := v_ok + 1; raise notice '✓ L3a motivos: INSERT do código com 40 passa, com 41 leva 23514 motivos_codigo_tamanho';
  else
    v_falhas := v_falhas + 1; raise warning '✗ L3a motivos INSERT: no teto %, teto + 1 %', v_r, v_s;
  end if;
  v_r := pg_temp.f66b_tenta(format('update public.motivos set rotulo = repeat(%L, 80) where codigo = repeat(%L, 40)', 'r', 'c'));
  v_s := pg_temp.f66b_tenta(format('update public.motivos set rotulo = repeat(%L, 81) where codigo = repeat(%L, 40)', 'r', 'c'));
  if v_r = 'ok' and v_s = '23514:motivos_rotulo_tamanho' then
    v_ok := v_ok + 1; raise notice '✓ L3b motivos: UPDATE do rótulo com 80 passa, com 81 leva 23514 motivos_rotulo_tamanho';
  else
    v_falhas := v_falhas + 1; raise warning '✗ L3b motivos UPDATE: no teto %, teto + 1 %', v_r, v_s;
  end if;
  v_s := null; v_erro := null;
  begin
    alter table public.motivos drop constraint motivos_codigo_tamanho;
    v_s := pg_temp.f66b_tenta(format(
      'insert into public.motivos (codigo, rotulo, aplica_a) values (repeat(%L, 41), %L, array[%L]::public.tipo_movimentacao[])',
      'e', 'F66B motivo', 'saida'));
    raise exception 'f66b-desfaz';
  exception when others then
    if sqlerrm <> 'f66b-desfaz' then v_erro := sqlerrm; end if;
  end;
  if v_s = 'ok' then
    v_ok := v_ok + 1; raise notice '✓ L3c sem motivos_codigo_tamanho o código com 41 passa (quem recusou foi o CHECK)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ L3c sem o CHECK: % (erro: %)', coalesce(v_s, '∅'), coalesce(v_erro, '—');
  end if;

  -- ===============================================================
  -- L4 — lote 4, senhas_acesso: INSERT do rótulo, UPDATE do hash
  -- ===============================================================
  v_r := pg_temp.f66b_tenta(format(
    'insert into public.senhas_acesso (rotulo, hash, criado_por) values (repeat(%L, 80), %L, %L)', 'r', 'f66b-hash-ficticio', v_prof));
  v_s := pg_temp.f66b_tenta(format(
    'insert into public.senhas_acesso (rotulo, hash, criado_por) values (repeat(%L, 81), %L, %L)', 's', 'f66b-hash-ficticio', v_prof));
  if v_r = 'ok' and v_s = '23514:senhas_acesso_rotulo_tamanho' then
    v_ok := v_ok + 1; raise notice '✓ L4a senhas_acesso: INSERT do rótulo com 80 passa, com 81 leva 23514 senhas_acesso_rotulo_tamanho';
  else
    v_falhas := v_falhas + 1; raise warning '✗ L4a senhas_acesso INSERT: no teto %, teto + 1 %', v_r, v_s;
  end if;
  select id into v_senha from public.senhas_acesso where rotulo = repeat('r', 80);
  v_r := pg_temp.f66b_tenta(format('update public.senhas_acesso set hash = repeat(%L, 200) where id = %L', 'h', v_senha));
  v_s := pg_temp.f66b_tenta(format('update public.senhas_acesso set hash = repeat(%L, 201) where id = %L', 'h', v_senha));
  if v_r = 'ok' and v_s = '23514:senhas_acesso_hash_tamanho' then
    v_ok := v_ok + 1; raise notice '✓ L4b senhas_acesso: UPDATE do hash com 200 passa, com 201 leva 23514 senhas_acesso_hash_tamanho';
  else
    v_falhas := v_falhas + 1; raise warning '✗ L4b senhas_acesso UPDATE: no teto %, teto + 1 %', v_r, v_s;
  end if;
  v_s := null; v_erro := null;
  begin
    alter table public.senhas_acesso drop constraint senhas_acesso_hash_tamanho;
    v_s := pg_temp.f66b_tenta(format('update public.senhas_acesso set hash = repeat(%L, 201) where id = %L', 'h', v_senha));
    raise exception 'f66b-desfaz';
  exception when others then
    if sqlerrm <> 'f66b-desfaz' then v_erro := sqlerrm; end if;
  end;
  if v_s = 'ok' then
    v_ok := v_ok + 1; raise notice '✓ L4c sem senhas_acesso_hash_tamanho o hash com 201 passa (quem recusou foi o CHECK)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ L4c sem o CHECK: % (erro: %)', coalesce(v_s, '∅'), coalesce(v_erro, '—');
  end if;

  -- ===============================================================
  -- I — a RPC do import CHAMADA POR FORA (a sabotagem D)
  --   O caminho do app passa pelo Zod do plano (LIMITES_CAMPO_PLANO) e pela conferência; quem chama a RPC direto pela
  --   API, com um JWT de administrador e o jsonb cru, não passa por nenhum dos dois. O contexto de administrador é o de
  --   import_substituir.sql (o cargo plantado em membros, o `sub` nas claims, o backup existente no bucket).
  -- ===============================================================
  perform pg_temp.plantar_cargo(v_prof, 'admin');
  perform set_config('request.jwt.claims', json_build_object('sub', v_prof)::text, true);
  insert into public.filiais (slug, nome) values ('zzf66b-imp', 'F66B Import') returning id into v_fi;
  v_prefixo := public.prefixo_backup_import(v_fi);
  insert into storage.objects (bucket_id, name, owner) values ('backups-import', v_prefixo || 'existe.json', v_prof);
  -- o acervo que a limpeza do import apagaria: um ativo e a compra dele
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id)
  values ('ZZF66B0000', 'ZZF66BST0', 'notebook', v_fi) returning id into v_ativo0;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
  values (v_ativo0, 'compra', current_date, v_fi, 'ZZF66B acervo de antes', v_prof);

  v_plano := jsonb_build_object(
    'filialId', v_fi, 'confirmacao', 'F66B Import', 'totalLinhasDados', 1,
    'ativos', jsonb_build_array(jsonb_build_object(
      'patrimonio', 'ZZF66B0001', 'serviceTag', 'ZZF66BST01', 'categoria', 'notebook', 'estadoAlvo', 'em_estoque',
      'marca', repeat('m', 61))));

  -- I1 — acima do teto: 23514 com o nome
  v_estado := null; v_con := null;
  begin
    v_res := public.importar_ativos_substituir(v_plano, v_prefixo || 'existe.json',
               jsonb_build_object('ativos', 1, 'movimentacoes', 1, 'anotacoes', 0, 'termos', 0));
    v_estado := 'ok';
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate, v_con = constraint_name;
  end;
  if v_estado = '23514' and v_con = 'ativos_marca_tamanho' then
    v_ok := v_ok + 1; raise notice '✓ I1 a RPC do import chamada por fora com a marca de 61 leva 23514 ativos_marca_tamanho';
  else
    v_falhas := v_falhas + 1; raise warning '✗ I1 a RPC do import com a marca de 61: % (constraint %)', coalesce(v_estado, '∅'), coalesce(v_con, '∅');
  end if;

  -- I2 — nada foi gravado: a filial ficou como antes (o acervo de antes continua, a limpeza foi desfeita junto)
  select count(*) into v_cnt from public.ativos where filial_id = v_fi;
  select count(*) into v_univ from public.movimentacoes where filial_id = v_fi;
  if v_cnt = 1 and v_univ = 1
     and exists (select 1 from public.ativos where id = v_ativo0)
     and not exists (select 1 from public.import_logs where filial_id = v_fi) then
    v_ok := v_ok + 1; raise notice '✓ I2 depois da recusa a filial está como antes (1 ativo, 1 movimentação, o mesmo ativo, nenhuma trilha)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ I2 depois da recusa: ativos %, movimentações %, o de antes %', v_cnt, v_univ,
      exists (select 1 from public.ativos where id = v_ativo0);
  end if;

  -- I3 — no teto exato, a mesma chamada grava (numa subtransação desfeita)
  v_s := null; v_erro := null;
  begin
    v_res := public.importar_ativos_substituir(
      jsonb_set(v_plano, '{ativos,0,marca}', to_jsonb(repeat('m', 60))), v_prefixo || 'existe.json',
      jsonb_build_object('ativos', 1, 'movimentacoes', 1, 'anotacoes', 0, 'termos', 0));
    select (v_res->>'ativos_criados') || '/' || coalesce(max(char_length(marca))::text, '∅') into v_s
      from public.ativos where filial_id = v_fi;
    raise exception 'f66b-desfaz';
  exception when others then
    if sqlerrm <> 'f66b-desfaz' then v_erro := sqlerrm; end if;
  end;
  if v_s = '1/60' then
    v_ok := v_ok + 1; raise notice '✓ I3 a mesma chamada com a marca de 60 (o teto) grava o ativo';
  else
    v_falhas := v_falhas + 1; raise warning '✗ I3 a chamada no teto: % (erro: %)', coalesce(v_s, '∅'), coalesce(v_erro, '—');
  end if;

  -- I4 — sem o CHECK, a chamada com 61 GRAVA: o desvio que existia antes da F66B
  v_s := null; v_erro := null;
  begin
    alter table public.ativos drop constraint ativos_marca_tamanho;
    v_res := public.importar_ativos_substituir(v_plano, v_prefixo || 'existe.json',
               jsonb_build_object('ativos', 1, 'movimentacoes', 1, 'anotacoes', 0, 'termos', 0));
    select (v_res->>'ativos_criados') || '/' || coalesce(max(char_length(marca))::text, '∅') into v_s
      from public.ativos where filial_id = v_fi;
    raise exception 'f66b-desfaz';
  exception when others then
    if sqlerrm <> 'f66b-desfaz' then v_erro := sqlerrm; end if;
  end;
  if v_s = '1/61' then
    v_ok := v_ok + 1; raise notice '✓ I4 sem ativos_marca_tamanho a RPC chamada por fora grava a marca de 61 (o desvio que o CHECK fecha)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ I4 sem o CHECK: % (erro: %)', coalesce(v_s, '∅'), coalesce(v_erro, '—');
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ===============================================================
  -- K — a chave derivada no pior caso (decisão 4: 3× a origem)
  -- ===============================================================
  -- K1 — 120 × U+FB2C (exclusão de composição: o NFC o decompõe em 3) dá uma chave MAIOR que a origem e ≤ 360
  v_n := char_length(public.colaborador_chave(repeat(chr(64300), 120)));
  if v_n > 120 and v_n <= 360 then
    v_ok := v_ok + 1; raise notice '✓ K1 colaborador_chave de 120 × U+FB2C tem % caracteres: maior que a origem (120), dentro do teto da chave (360)', v_n;
  else
    v_falhas := v_falhas + 1; raise warning '✗ K1 colaborador_chave de 120 × U+FB2C tem % caracteres (esperado > 120 e ≤ 360)', v_n;
  end if;
  -- K2 — e o INSERT de verdade passa: a chave no pior caso cabe no CHECK dela
  v_r := pg_temp.f66b_tenta(format(
    'insert into public.colaboradores (nome, filial_id, criado_por) values (repeat(chr(64300), 120), %s, %L)', v_f, v_prof));
  if v_r = 'ok' then
    v_ok := v_ok + 1; raise notice '✓ K2 o colaborador de nome 120 × U+FB2C grava (nome_chave no pior caso cabe em colaboradores_nome_chave_tamanho)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ K2 o colaborador de nome 120 × U+FB2C: %', v_r;
  end if;
  -- K3 — item_chave: 80 × U+FB2C
  v_n := char_length(public.item_chave(repeat(chr(64300), 80)));
  if v_n > 80 and v_n <= 240 then
    v_ok := v_ok + 1; raise notice '✓ K3 item_chave de 80 × U+FB2C tem % caracteres: > 80 e ≤ 240', v_n;
  else
    v_falhas := v_falhas + 1; raise warning '✗ K3 item_chave de 80 × U+FB2C tem % caracteres (esperado > 80 e ≤ 240)', v_n;
  end if;
  -- K4 — vocabulario_chave: 80 sílabas Hangul LVT (U+AC01: o NFD dá 3 jamos, fora de U+0300–U+036F)
  v_n := char_length(public.vocabulario_chave(repeat(chr(44033), 80)));
  if v_n > 80 and v_n <= 240 then
    v_ok := v_ok + 1; raise notice '✓ K4 vocabulario_chave de 80 × U+AC01 tem % caracteres: > 80 e ≤ 240', v_n;
  else
    v_falhas := v_falhas + 1; raise warning '✗ K4 vocabulario_chave de 80 × U+AC01 tem % caracteres (esperado > 80 e ≤ 240)', v_n;
  end if;
  -- K5 — o U+0130 (İ), cuja minúscula pode ter 2 code points conforme a collation do banco, cabe
  v_n := char_length(public.colaborador_chave(repeat(chr(304), 120)));
  if v_n between 120 and 360 then
    v_ok := v_ok + 1; raise notice '✓ K5 colaborador_chave de 120 × U+0130 tem % caracteres (≤ 360)', v_n;
  else
    v_falhas := v_falhas + 1; raise warning '✗ K5 colaborador_chave de 120 × U+0130 tem % caracteres (esperado 120..360)', v_n;
  end if;

  raise notice 'FIM comprimento_comportamento: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
