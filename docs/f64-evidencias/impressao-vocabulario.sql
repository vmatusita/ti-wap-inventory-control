-- =============================================================================
-- impressao-vocabulario.sql — F64 (23/09/2026): a IMPRESSÃO das onze, o MESMO texto ANTES e DEPOIS
-- =============================================================================
-- O portão do apply de produção e do merge (PLAN-F64.md, decisão 9): NENHUMA TUPLA DAS ONZE É
-- REESCRITA. Derivado de docs/f63-evidencias/impressao-acervo.sql, com UMA diferença de método:
-- a ORDEM e a CHAVE de cada linha vêm da PK LIDA DO CATÁLOGO (pg_constraint.conkey), nunca de
-- uma coluna `id` escrita à mão — quatro das onze não têm `id` (fato 5: motivos (codigo),
-- import_prefixos_patrimonio (prefixo), import_termos_categoria (termo), import_termos_estado
-- (termo)). A chave de cada linha é um jsonb ARRAY com os valores da PK na ordem de conkey; a
-- comparação de jsonb é determinística (números numericamente, textos pela collation do banco,
-- arrays elemento a elemento — doc do PG 17, 8.14.4), então a ordem é a mesma antes e depois.
--
-- Para cada uma das onze tabelas este texto imprime
--   · pk              — os nomes das colunas da PK, lidos do catálogo (nome de coluna é código);
--   · linhas          — count(*);
--   · relfilenode     — pg_relation_filenode(): muda se a TABELA for reescrita (default
--                       volátil, alter column type, vacuum full). Um UPDATE NÃO o muda;
--   · md5_pk_xmin     — md5 de (pk, xmin) ordenado pela pk: muda se QUALQUER linha for
--                       atualizada (versão nova, xmin novo, no MESMO arquivo). O xmin sobrevive
--                       ao freeze (doc do PG 17, 24.1.5);
--   · md5_conteudo    — md5 de (to_jsonb(linha) - 'empresa_id'), na ordem da pk: muda se o
--                       CONTEÚDO mudar. No "antes" a chave não existe e o `-` não faz nada;
--   · janela          — as linhas com xmin a partir do CORTE (o parâmetro): a atividade normal
--                       do app entre o "antes" e o "depois". Backfill daria janela = linhas;
--   · empresa_id      — o estado da coluna no catálogo, ou 'ausente'.
-- E, fora das onze (critérios 10, 13 e 14 da ordem):
--   · escritores_sql  — o md5 do `prosrc` das 9 funções que escrevem nas onze (fato 8), por nome;
--   · rate_limit      — o md5 do `prosrc` de registrar_tentativa_senha;
--   · nucleo          — checagens_integridade_nucleo(): o md5 do corpo inteiro, o número de peças
--                       e o md5 de CADA peça (o trecho `return query … from d;`), pela chave
--                       literal que ela devolve — as 12 de hoje ficam byte a byte (critério 10);
--   · kit             — o gatilho da F64 em kits_modelos (existe? habilitado?).
--
-- Todo md5 passa por coalesce(…, 'vazia'): md5 de tabela vazia é NULL (kits_modelos está VAZIA
-- nos dois bancos — fato 3).
--
-- O PARÂMETRO DECLARADO (a ÚNICA linha que muda entre as rodadas): o `corte` na linha marcada
-- `⟵ PARÂMETRO`. No próprio "antes" ele fica vazio (''), e a saída traz `corte_para_o_depois` —
-- o xmin do snapshot daquele instante (pg_current_snapshot() NÃO consome xid e roda em transação
-- só-leitura). Para o "depois", cole esse número no lugar de ''.
--
-- SÓ LEITURA E SÓ CONTAGEM/HASH: nenhum id, código, rótulo, hash de senha, texto de `detalhe` ou
-- nome sai da consulta (regra 2 do CLAUDE.md) — só nomes de COLUNA e de FUNÇÃO, que são código.
-- Uma consulta só: o execute_sql do MCP devolve o último comando.
-- =============================================================================
select set_config('transaction_read_only', 'on', true);

with parametro as (
  select nullif('', '')::bigint as corte   -- ⟵ PARÂMETRO: '' no "antes"; no "depois", o corte_para_o_depois do "antes"
),
corte as (
  -- o corte em 32 bits, como `xid` (o xmin da linha é 32 bits; o xid8 do snapshot, 64)
  select case when p.corte is null then null else ((p.corte % 4294967296)::text)::xid end as xid_corte
    from parametro p
),
nucleo as (
  select p.prosrc from pg_proc p
   where p.oid = to_regprocedure('public.checagens_integridade_nucleo()')
),
pecas as (
  -- cada peça é o trecho `return query … from d;` (a forma das 12 de hoje, 0138/0158)
  select m[1] as trecho, substring(m[1] from '''([a-z_]+)''::text') as chave
    from nucleo n
    cross join lateral regexp_matches(n.prosrc, '(return query.*?from d;)', 'g') as m
)
select jsonb_pretty(jsonb_build_object(
  'corte_para_o_depois', (pg_snapshot_xmin(pg_current_snapshot()))::text,
  'corte_usado', (select corte::text from parametro),
  'tabelas', jsonb_build_object(
    'tipos_item', (
      select jsonb_build_object(
        'pk', (select coalesce(string_agg(a.attname, ',' order by k.o), 'SEM PK')
                 from pg_constraint pc
                 cross join unnest(pc.conkey) with ordinality as k(n, o)
                 join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
                where pc.conrelid = 'public.tipos_item'::regclass and pc.contype = 'p'),
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.tipos_item'),
        'md5_pk_xmin', coalesce(md5(string_agg(c.chave::text || ':' || t.xmin::text, ',' order by c.chave)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by c.chave)), 'vazia'),
        'janela', count(*) filter (where x.xid_corte is not null and age(t.xmin) <= age(x.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.tipos_item'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.tipos_item t
        cross join corte x
        cross join lateral (
          -- a PK da linha, lida do CATÁLOGO (pg_constraint.conkey), como jsonb na ordem das colunas
          select jsonb_agg(to_jsonb(t) -> a.attname order by k.o) as chave
            from pg_constraint pc
            cross join unnest(pc.conkey) with ordinality as k(n, o)
            join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
           where pc.conrelid = 'public.tipos_item'::regclass and pc.contype = 'p') c),
    'motivos', (
      select jsonb_build_object(
        'pk', (select coalesce(string_agg(a.attname, ',' order by k.o), 'SEM PK')
                 from pg_constraint pc
                 cross join unnest(pc.conkey) with ordinality as k(n, o)
                 join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
                where pc.conrelid = 'public.motivos'::regclass and pc.contype = 'p'),
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.motivos'),
        'md5_pk_xmin', coalesce(md5(string_agg(c.chave::text || ':' || t.xmin::text, ',' order by c.chave)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by c.chave)), 'vazia'),
        'janela', count(*) filter (where x.xid_corte is not null and age(t.xmin) <= age(x.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.motivos'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.motivos t
        cross join corte x
        cross join lateral (
          -- a PK da linha, lida do CATÁLOGO (pg_constraint.conkey), como jsonb na ordem das colunas
          select jsonb_agg(to_jsonb(t) -> a.attname order by k.o) as chave
            from pg_constraint pc
            cross join unnest(pc.conkey) with ordinality as k(n, o)
            join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
           where pc.conrelid = 'public.motivos'::regclass and pc.contype = 'p') c),
    'import_prefixos_patrimonio', (
      select jsonb_build_object(
        'pk', (select coalesce(string_agg(a.attname, ',' order by k.o), 'SEM PK')
                 from pg_constraint pc
                 cross join unnest(pc.conkey) with ordinality as k(n, o)
                 join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
                where pc.conrelid = 'public.import_prefixos_patrimonio'::regclass and pc.contype = 'p'),
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.import_prefixos_patrimonio'),
        'md5_pk_xmin', coalesce(md5(string_agg(c.chave::text || ':' || t.xmin::text, ',' order by c.chave)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by c.chave)), 'vazia'),
        'janela', count(*) filter (where x.xid_corte is not null and age(t.xmin) <= age(x.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.import_prefixos_patrimonio'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.import_prefixos_patrimonio t
        cross join corte x
        cross join lateral (
          -- a PK da linha, lida do CATÁLOGO (pg_constraint.conkey), como jsonb na ordem das colunas
          select jsonb_agg(to_jsonb(t) -> a.attname order by k.o) as chave
            from pg_constraint pc
            cross join unnest(pc.conkey) with ordinality as k(n, o)
            join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
           where pc.conrelid = 'public.import_prefixos_patrimonio'::regclass and pc.contype = 'p') c),
    'import_termos_categoria', (
      select jsonb_build_object(
        'pk', (select coalesce(string_agg(a.attname, ',' order by k.o), 'SEM PK')
                 from pg_constraint pc
                 cross join unnest(pc.conkey) with ordinality as k(n, o)
                 join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
                where pc.conrelid = 'public.import_termos_categoria'::regclass and pc.contype = 'p'),
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.import_termos_categoria'),
        'md5_pk_xmin', coalesce(md5(string_agg(c.chave::text || ':' || t.xmin::text, ',' order by c.chave)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by c.chave)), 'vazia'),
        'janela', count(*) filter (where x.xid_corte is not null and age(t.xmin) <= age(x.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.import_termos_categoria'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.import_termos_categoria t
        cross join corte x
        cross join lateral (
          -- a PK da linha, lida do CATÁLOGO (pg_constraint.conkey), como jsonb na ordem das colunas
          select jsonb_agg(to_jsonb(t) -> a.attname order by k.o) as chave
            from pg_constraint pc
            cross join unnest(pc.conkey) with ordinality as k(n, o)
            join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
           where pc.conrelid = 'public.import_termos_categoria'::regclass and pc.contype = 'p') c),
    'import_termos_estado', (
      select jsonb_build_object(
        'pk', (select coalesce(string_agg(a.attname, ',' order by k.o), 'SEM PK')
                 from pg_constraint pc
                 cross join unnest(pc.conkey) with ordinality as k(n, o)
                 join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
                where pc.conrelid = 'public.import_termos_estado'::regclass and pc.contype = 'p'),
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.import_termos_estado'),
        'md5_pk_xmin', coalesce(md5(string_agg(c.chave::text || ':' || t.xmin::text, ',' order by c.chave)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by c.chave)), 'vazia'),
        'janela', count(*) filter (where x.xid_corte is not null and age(t.xmin) <= age(x.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.import_termos_estado'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.import_termos_estado t
        cross join corte x
        cross join lateral (
          -- a PK da linha, lida do CATÁLOGO (pg_constraint.conkey), como jsonb na ordem das colunas
          select jsonb_agg(to_jsonb(t) -> a.attname order by k.o) as chave
            from pg_constraint pc
            cross join unnest(pc.conkey) with ordinality as k(n, o)
            join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
           where pc.conrelid = 'public.import_termos_estado'::regclass and pc.contype = 'p') c),
    'unidades_apelidos', (
      select jsonb_build_object(
        'pk', (select coalesce(string_agg(a.attname, ',' order by k.o), 'SEM PK')
                 from pg_constraint pc
                 cross join unnest(pc.conkey) with ordinality as k(n, o)
                 join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
                where pc.conrelid = 'public.unidades_apelidos'::regclass and pc.contype = 'p'),
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.unidades_apelidos'),
        'md5_pk_xmin', coalesce(md5(string_agg(c.chave::text || ':' || t.xmin::text, ',' order by c.chave)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by c.chave)), 'vazia'),
        'janela', count(*) filter (where x.xid_corte is not null and age(t.xmin) <= age(x.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.unidades_apelidos'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.unidades_apelidos t
        cross join corte x
        cross join lateral (
          -- a PK da linha, lida do CATÁLOGO (pg_constraint.conkey), como jsonb na ordem das colunas
          select jsonb_agg(to_jsonb(t) -> a.attname order by k.o) as chave
            from pg_constraint pc
            cross join unnest(pc.conkey) with ordinality as k(n, o)
            join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
           where pc.conrelid = 'public.unidades_apelidos'::regclass and pc.contype = 'p') c),
    'kits_modelos', (
      select jsonb_build_object(
        'pk', (select coalesce(string_agg(a.attname, ',' order by k.o), 'SEM PK')
                 from pg_constraint pc
                 cross join unnest(pc.conkey) with ordinality as k(n, o)
                 join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
                where pc.conrelid = 'public.kits_modelos'::regclass and pc.contype = 'p'),
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.kits_modelos'),
        'md5_pk_xmin', coalesce(md5(string_agg(c.chave::text || ':' || t.xmin::text, ',' order by c.chave)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by c.chave)), 'vazia'),
        'janela', count(*) filter (where x.xid_corte is not null and age(t.xmin) <= age(x.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.kits_modelos'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.kits_modelos t
        cross join corte x
        cross join lateral (
          -- a PK da linha, lida do CATÁLOGO (pg_constraint.conkey), como jsonb na ordem das colunas
          select jsonb_agg(to_jsonb(t) -> a.attname order by k.o) as chave
            from pg_constraint pc
            cross join unnest(pc.conkey) with ordinality as k(n, o)
            join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
           where pc.conrelid = 'public.kits_modelos'::regclass and pc.contype = 'p') c),
    'senhas_acesso', (
      select jsonb_build_object(
        'pk', (select coalesce(string_agg(a.attname, ',' order by k.o), 'SEM PK')
                 from pg_constraint pc
                 cross join unnest(pc.conkey) with ordinality as k(n, o)
                 join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
                where pc.conrelid = 'public.senhas_acesso'::regclass and pc.contype = 'p'),
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.senhas_acesso'),
        'md5_pk_xmin', coalesce(md5(string_agg(c.chave::text || ':' || t.xmin::text, ',' order by c.chave)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by c.chave)), 'vazia'),
        'janela', count(*) filter (where x.xid_corte is not null and age(t.xmin) <= age(x.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.senhas_acesso'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.senhas_acesso t
        cross join corte x
        cross join lateral (
          -- a PK da linha, lida do CATÁLOGO (pg_constraint.conkey), como jsonb na ordem das colunas
          select jsonb_agg(to_jsonb(t) -> a.attname order by k.o) as chave
            from pg_constraint pc
            cross join unnest(pc.conkey) with ordinality as k(n, o)
            join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
           where pc.conrelid = 'public.senhas_acesso'::regclass and pc.contype = 'p') c),
    'eventos_admin', (
      select jsonb_build_object(
        'pk', (select coalesce(string_agg(a.attname, ',' order by k.o), 'SEM PK')
                 from pg_constraint pc
                 cross join unnest(pc.conkey) with ordinality as k(n, o)
                 join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
                where pc.conrelid = 'public.eventos_admin'::regclass and pc.contype = 'p'),
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.eventos_admin'),
        'md5_pk_xmin', coalesce(md5(string_agg(c.chave::text || ':' || t.xmin::text, ',' order by c.chave)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by c.chave)), 'vazia'),
        'janela', count(*) filter (where x.xid_corte is not null and age(t.xmin) <= age(x.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.eventos_admin'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.eventos_admin t
        cross join corte x
        cross join lateral (
          -- a PK da linha, lida do CATÁLOGO (pg_constraint.conkey), como jsonb na ordem das colunas
          select jsonb_agg(to_jsonb(t) -> a.attname order by k.o) as chave
            from pg_constraint pc
            cross join unnest(pc.conkey) with ordinality as k(n, o)
            join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
           where pc.conrelid = 'public.eventos_admin'::regclass and pc.contype = 'p') c),
    'import_logs', (
      select jsonb_build_object(
        'pk', (select coalesce(string_agg(a.attname, ',' order by k.o), 'SEM PK')
                 from pg_constraint pc
                 cross join unnest(pc.conkey) with ordinality as k(n, o)
                 join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
                where pc.conrelid = 'public.import_logs'::regclass and pc.contype = 'p'),
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.import_logs'),
        'md5_pk_xmin', coalesce(md5(string_agg(c.chave::text || ':' || t.xmin::text, ',' order by c.chave)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by c.chave)), 'vazia'),
        'janela', count(*) filter (where x.xid_corte is not null and age(t.xmin) <= age(x.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.import_logs'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.import_logs t
        cross join corte x
        cross join lateral (
          -- a PK da linha, lida do CATÁLOGO (pg_constraint.conkey), como jsonb na ordem das colunas
          select jsonb_agg(to_jsonb(t) -> a.attname order by k.o) as chave
            from pg_constraint pc
            cross join unnest(pc.conkey) with ordinality as k(n, o)
            join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
           where pc.conrelid = 'public.import_logs'::regclass and pc.contype = 'p') c),
    'relatorios_gerados', (
      select jsonb_build_object(
        'pk', (select coalesce(string_agg(a.attname, ',' order by k.o), 'SEM PK')
                 from pg_constraint pc
                 cross join unnest(pc.conkey) with ordinality as k(n, o)
                 join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
                where pc.conrelid = 'public.relatorios_gerados'::regclass and pc.contype = 'p'),
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.relatorios_gerados'),
        'md5_pk_xmin', coalesce(md5(string_agg(c.chave::text || ':' || t.xmin::text, ',' order by c.chave)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by c.chave)), 'vazia'),
        'janela', count(*) filter (where x.xid_corte is not null and age(t.xmin) <= age(x.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.relatorios_gerados'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.relatorios_gerados t
        cross join corte x
        cross join lateral (
          -- a PK da linha, lida do CATÁLOGO (pg_constraint.conkey), como jsonb na ordem das colunas
          select jsonb_agg(to_jsonb(t) -> a.attname order by k.o) as chave
            from pg_constraint pc
            cross join unnest(pc.conkey) with ordinality as k(n, o)
            join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = k.n
           where pc.conrelid = 'public.relatorios_gerados'::regclass and pc.contype = 'p') c)
  ),
  -- Critério 13: as 9 funções que escrevem nas onze (fato 8). Os NOMES são código, não dado.
  'escritores_sql', (
    select jsonb_build_object(
      'funcoes', count(*),
      'md5_prosrc', coalesce(md5(string_agg(p.proname || ':' || md5(p.prosrc), ',' order by p.proname, p.oid)), 'vazia'),
      'por_funcao', jsonb_object_agg(p.proname || '#' || p.oid::regprocedure::text, md5(p.prosrc)))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array[
         'apagar_ativo', 'apagar_ativos_conflito_filiais', 'apagar_item', 'apagar_movimentacao',
         'forcar_estado_ativo', 'forcar_saldo_item', 'resetar_acervo', 'resetar_itens',
         'import_gravar_trilha'])),
  'rate_limit', (
    select jsonb_build_object('funcoes', count(*), 'md5_prosrc', coalesce(md5(string_agg(md5(p.prosrc), ',' order by p.oid)), 'vazia'))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'registrar_tentativa_senha'),
  'nucleo', jsonb_build_object(
    'md5_prosrc', coalesce((select md5(prosrc) from nucleo), 'ausente'),
    'pecas', (select count(*) from pecas),
    'md5_por_peca', (select coalesce(jsonb_object_agg(coalesce(chave, '?'), md5(trecho)), '{}'::jsonb) from pecas)),
  'kit', jsonb_build_object(
    'gatilhos_nao_internos', (select count(*) from pg_trigger g
                               where g.tgrelid = 'public.kits_modelos'::regclass and not g.tgisinternal),
    'gatilhos_habilitados', (select count(*) from pg_trigger g
                              where g.tgrelid = 'public.kits_modelos'::regclass and not g.tgisinternal and g.tgenabled <> 'D'))
)) as impressao;
