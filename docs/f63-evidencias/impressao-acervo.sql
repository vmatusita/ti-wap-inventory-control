-- =============================================================================
-- impressao-acervo.sql — F63 (23/09/2026): a IMPRESSÃO do acervo, o MESMO texto ANTES e DEPOIS
-- =============================================================================
-- O portão do apply de produção e do merge (PLAN-F63.md, decisão 9): NENHUMA TUPLA DO
-- ACERVO É REESCRITA. Para cada uma das oito tabelas este texto imprime
--   · linhas          — count(*);
--   · relfilenode     — pg_relation_filenode(): muda se a TABELA for reescrita (default
--                       volátil, alter column type, vacuum full). Um UPDATE NÃO o muda;
--   · md5_id_xmin     — md5 de (id, xmin) ordenado por id: muda se QUALQUER linha for
--                       atualizada (o update grava versão nova, com xmin novo — pelo MVCC,
--                       no MESMO arquivo). O xmin sobrevive ao freeze desde o PG 9.4
--                       ("Newer versions just set a flag bit, preserving the row's original
--                       xmin", doc do PG 17, 24.1.5);
--   · md5_conteudo    — md5 de (to_jsonb(linha) - 'empresa_id'), ordenado por id: muda se
--                       o CONTEÚDO mudar. A subtração vale nos dois lados — no "antes" a
--                       chave não existe e o `-` não faz nada;
--   · janela          — as linhas com xmin a partir do CORTE (o parâmetro abaixo): a
--                       atividade normal do app entre o "antes" e o "depois". Um backfill
--                       daria janela = linhas. No "antes" é 0 (não há corte);
--   · empresa_id      — o estado da coluna no catálogo (tipo, not null, atthasmissing) ou
--                       'ausente'.
-- E, fora das oito: o md5 do `prosrc` das 18 funções que escrevem no acervo (fato 9 —
-- "nenhum escritor mudou", critério 13) e se `backups_migration` existe.
--
-- Todo md5 passa por coalesce(…, 'vazia'): md5 de tabela vazia é NULL, e NULL = NULL não
-- é verdadeiro (no ensaio, `anotacoes` e `colaboradores` estão vazias — fato 3).
--
-- O PARÂMETRO DECLARADO (a ÚNICA linha que muda entre as rodadas): o `corte` do "antes"
-- na linha marcada `⟵ PARÂMETRO`. No próprio "antes" ele fica vazio (''), e a saída
-- traz `corte_para_o_depois` — o xmin do snapshot daquele instante (a transação mais
-- antiga ainda em curso; lido por pg_current_snapshot(), que NÃO consome xid e roda em
-- transação só-leitura). Para o "depois", cole esse número no lugar de ''.
--
-- SÓ LEITURA E SÓ CONTAGEM/HASH: nenhum id, nome, patrimônio ou texto sai da consulta
-- (regra 2 do CLAUDE.md). Uma consulta só — o execute_sql do MCP devolve o último comando.
-- =============================================================================
select set_config('transaction_read_only', 'on', true);

with parametro as (
  select nullif('', '')::bigint as corte   -- ⟵ PARÂMETRO: '' no "antes"; no "depois", o corte_para_o_depois do "antes"
),
corte as (
  -- o corte em 32 bits, como `xid` (o xmin da linha é 32 bits; o xid8 do snapshot, 64)
  select case when p.corte is null then null else ((p.corte % 4294967296)::text)::xid end as xid_corte
    from parametro p
)
select jsonb_pretty(jsonb_build_object(
  'corte_para_o_depois', (pg_snapshot_xmin(pg_current_snapshot()))::text,
  'corte_usado', (select corte::text from parametro),
  'tabelas', jsonb_build_object(
    'ativos', (
      select jsonb_build_object(
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.ativos'),
        'md5_id_xmin', coalesce(md5(string_agg(t.id::text || ':' || t.xmin::text, ',' order by t.id)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by t.id)), 'vazia'),
        'janela', count(*) filter (where c.xid_corte is not null and age(t.xmin) <= age(c.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.ativos'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.ativos t cross join corte c),
    'movimentacoes', (
      select jsonb_build_object(
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.movimentacoes'),
        'md5_id_xmin', coalesce(md5(string_agg(t.id::text || ':' || t.xmin::text, ',' order by t.id)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by t.id)), 'vazia'),
        'janela', count(*) filter (where c.xid_corte is not null and age(t.xmin) <= age(c.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.movimentacoes'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.movimentacoes t cross join corte c),
    'lancamentos_item', (
      select jsonb_build_object(
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.lancamentos_item'),
        'md5_id_xmin', coalesce(md5(string_agg(t.id::text || ':' || t.xmin::text, ',' order by t.id)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by t.id)), 'vazia'),
        'janela', count(*) filter (where c.xid_corte is not null and age(t.xmin) <= age(c.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.lancamentos_item'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.lancamentos_item t cross join corte c),
    'pendencias_item', (
      select jsonb_build_object(
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.pendencias_item'),
        'md5_id_xmin', coalesce(md5(string_agg(t.id::text || ':' || t.xmin::text, ',' order by t.id)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by t.id)), 'vazia'),
        'janela', count(*) filter (where c.xid_corte is not null and age(t.xmin) <= age(c.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.pendencias_item'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.pendencias_item t cross join corte c),
    'anotacoes', (
      select jsonb_build_object(
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.anotacoes'),
        'md5_id_xmin', coalesce(md5(string_agg(t.id::text || ':' || t.xmin::text, ',' order by t.id)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by t.id)), 'vazia'),
        'janela', count(*) filter (where c.xid_corte is not null and age(t.xmin) <= age(c.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.anotacoes'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.anotacoes t cross join corte c),
    'termos_gerados', (
      select jsonb_build_object(
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.termos_gerados'),
        'md5_id_xmin', coalesce(md5(string_agg(t.id::text || ':' || t.xmin::text, ',' order by t.id)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by t.id)), 'vazia'),
        'janela', count(*) filter (where c.xid_corte is not null and age(t.xmin) <= age(c.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.termos_gerados'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.termos_gerados t cross join corte c),
    'colaboradores', (
      select jsonb_build_object(
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.colaboradores'),
        'md5_id_xmin', coalesce(md5(string_agg(t.id::text || ':' || t.xmin::text, ',' order by t.id)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by t.id)), 'vazia'),
        'janela', count(*) filter (where c.xid_corte is not null and age(t.xmin) <= age(c.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.colaboradores'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.colaboradores t cross join corte c),
    'itens', (
      select jsonb_build_object(
        'linhas', count(*),
        'relfilenode', pg_relation_filenode('public.itens'),
        'md5_id_xmin', coalesce(md5(string_agg(t.id::text || ':' || t.xmin::text, ',' order by t.id)), 'vazia'),
        'md5_conteudo', coalesce(md5(string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by t.id)), 'vazia'),
        'janela', count(*) filter (where c.xid_corte is not null and age(t.xmin) <= age(c.xid_corte)),
        'empresa_id', coalesce((select format('%s · not null=%s · atthasmissing=%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasmissing)
                                  from pg_attribute a where a.attrelid = 'public.itens'::regclass and a.attname = 'empresa_id' and not a.attisdropped), 'ausente'))
        from public.itens t cross join corte c)
  ),
  -- Critério 13: as 18 funções que escrevem no acervo (fato 9). Os NOMES são código, não dado.
  'escritores_sql', (
    select jsonb_build_object(
      'funcoes', count(*),
      'md5_prosrc', coalesce(md5(string_agg(p.proname || ':' || md5(p.prosrc), ',' order by p.proname, p.oid)), 'vazia'))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array[
         'criar_compra_lote', 'devolver_ao_fornecedor', 'import_criar_ativos',
         'criar_movimentacao_com_itens', 'estornar_movimentacao_com_itens', 'forcar_estado_ativo',
         'import_lancar_movimentacoes', 'forcar_saldo_item', 'lancar_itens_lote',
         'reabrir_pendencias_item_com_estornos', 'resolver_pendencias_item_com_lancamentos',
         'transferir_item', 'movimentacao_abrir_pendencias_item',
         'confirmar_assinatura_lote_com_anotacoes', 'confirmar_assinatura_termo_com_anotacao',
         'corrigir_patrimonio_com_anotacao', 'definir_service_tag_com_anotacao',
         'desfazer_confirmacao_termo_com_anotacao'])),
  'backups_migration', to_regclass('public.backups_migration') is not null
)) as impressao;
