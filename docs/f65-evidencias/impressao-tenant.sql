-- =============================================================================
-- impressao-tenant.sql — F65 (23/09/2026): a IMPRESSÃO DAS LINHAS das 20 tabelas de negócio, o MESMO texto ANTES e DEPOIS
-- =============================================================================
-- O portão do apply de produção e do merge (PLAN-F65.md, decisão 14): NENHUMA TUPLA DAS 20 É REESCRITA. Derivado de
-- docs/f64-evidencias/impressao-vocabulario.sql (F64), estendido às 20 tabelas de `k_negocio` e escrito como UMA
-- consulta por tabela montada de UM molde (`query_to_xml` executa o texto montado por `format(%I)` DENTRO da mesma
-- transação só-leitura — nenhuma função é criada, e as 20 não divergem por cópia; os apelidos internos são `hash_*`
-- porque o mapeamento SQL→XML escapa `_x` em nome de coluna, e `md5_chave_xmin` voltaria nulo). Duas diferenças de método:
--
--   1) A CHAVE ESTÁVEL. A F65 TROCA a PK de quatro tabelas — `motivos (codigo)` e as três do vocabulário do import
--      (`prefixo`, `termo`, `termo`) — para `(empresa_id, …)`. Uma chave que fosse "a PK do catálogo" mudaria de forma
--      entre o antes e o depois, e o md5 mudaria sem nenhuma tupla ter mudado. A chave de cada linha é, então, a PK LIDA
--      DO CATÁLOGO (pg_constraint.conkey) MENOS a coluna `empresa_id`, como jsonb na ordem de conkey: antes, `(codigo)`;
--      depois, `(empresa_id, codigo)` menos `empresa_id` = `(codigo)` — a MESMA. Ela continua única porque há UMA empresa
--      só nos dois bancos (a contagem de violações do "antes", contagem-violacoes.sql, prova: nenhuma duplicata). Nas
--      outras 16 a PK é `(id)`, que a fase não toca. A saída imprime as duas: `pk` (a do catálogo — MUDA nas quatro, e é a
--      prova de que a troca aconteceu) e `chave` (a usada no md5 — NÃO muda).
--   2) O CONTEÚDO INTEIRO: md5 de to_jsonb(linha), com `empresa_id` (a F65 não põe nem tira coluna).
--
-- Para cada uma das 20:
--   · pk / chave      — as colunas da PK do catálogo, e as da chave do md5 (a PK sem empresa_id); nome de coluna é código;
--   · linhas          — count(*);
--   · relfilenode     — pg_relation_filenode(): muda se a TABELA for reescrita (alter column type, vacuum full, default
--                       volátil). `add constraint` (FK, unique, PK) só VARRE; o índice novo é OUTRO arquivo. Um UPDATE NÃO
--                       o muda;
--   · md5_chave_xmin  — md5 de (chave, xmin) na ordem da chave: muda se QUALQUER linha for atualizada (versão nova, xmin
--                       novo, no MESMO arquivo). O xmin sobrevive ao freeze (doc do PG 17, 24.1.5);
--   · md5_conteudo    — md5 de to_jsonb(linha) na ordem da chave: muda se o CONTEÚDO mudar;
--   · janela          — as linhas com xmin a partir do CORTE (o parâmetro): a atividade normal do app entre o "antes" e o
--                       "depois". Uma reescrita daria janela = linhas.
-- Todo md5 passa por coalesce(…, 'vazia'): md5 de tabela vazia é NULL (kits_modelos está VAZIA nos dois bancos).
--
-- O PARÂMETRO DECLARADO (a ÚNICA linha que muda entre as rodadas): o `corte` na linha marcada `⟵ PARÂMETRO`. No
-- próprio "antes" ele fica vazio (''), e a saída traz `corte_para_o_depois` — o xmin do snapshot daquele instante
-- (pg_snapshot_xmin(pg_current_snapshot()) NÃO consome xid e roda em transação só-leitura; a ordem falava em
-- pg_current_xact_id(), que ATRIBUI um xid — uma escrita — e por isso o método é o das F63/F64). Para o "depois", cole
-- esse número no lugar de ''.
--
-- SÓ LEITURA E SÓ CONTAGEM/HASH: nenhum id, código, slug, termo, rótulo, nome ou texto de linha sai da consulta (regra 2
-- do CLAUDE.md) — só nomes de TABELA e de COLUNA, que são código. Uma consulta só: o execute_sql do MCP devolve o último
-- comando. A impressão do CATÁLOGO (FKs, uniques, gatilhos, prosrc) é o outro arquivo, impressao-catalogo.sql.
-- =============================================================================
select set_config('transaction_read_only', 'on', true);

with parametro as (
  select nullif('', '')::bigint as corte   -- ⟵ PARÂMETRO: '' no "antes"; no "depois", o corte_para_o_depois do "antes"
),
corte as (
  -- o corte em 32 bits, como `xid` (o xmin da linha é 32 bits; o xid8 do snapshot, 64)
  select case when p.corte is null then null else ((p.corte % 4294967296)::text) end as xid_corte
    from parametro p
),
k_negocio(tabela) as (
  values ('anotacoes'), ('ativos'), ('colaboradores'), ('eventos_admin'), ('filiais'), ('import_logs'),
         ('import_prefixos_patrimonio'), ('import_termos_categoria'), ('import_termos_estado'), ('itens'),
         ('kits_modelos'), ('lancamentos_item'), ('motivos'), ('movimentacoes'), ('pendencias_item'),
         ('relatorios_gerados'), ('senhas_acesso'), ('termos_gerados'), ('tipos_item'), ('unidades_apelidos')
),
porta as (
  select k.tabela,
         (select coalesce(string_agg(a.attname, ',' order by x.o), 'SEM PK')
            from pg_constraint pc
            cross join unnest(pc.conkey) with ordinality as x(n, o)
            join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = x.n
           where pc.conrelid = ('public.' || k.tabela)::regclass and pc.contype = 'p') as pk,
         (select coalesce(string_agg(a.attname, ',' order by x.o), 'SEM CHAVE')
            from pg_constraint pc
            cross join unnest(pc.conkey) with ordinality as x(n, o)
            join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = x.n
           where pc.conrelid = ('public.' || k.tabela)::regclass and pc.contype = 'p' and a.attname <> 'empresa_id') as chave,
         pg_relation_filenode(('public.' || k.tabela)::regclass) as relfilenode,
         query_to_xml(format($q$
           select count(*) as linhas,
                  coalesce(md5(string_agg(c.chave::text || ':' || t.xmin::text, ',' order by c.chave)), 'vazia') as hash_chave,
                  coalesce(md5(string_agg(to_jsonb(t)::text, '|' order by c.chave)), 'vazia') as hash_conteudo,
                  count(*) filter (where %L::xid is not null and age(t.xmin) <= age(%L::xid)) as janela
             from public.%I t
             cross join lateral (
               -- a CHAVE da linha: a PK do CATÁLOGO sem empresa_id, como jsonb na ordem de conkey
               select jsonb_agg(to_jsonb(t) -> a.attname order by x.o) as chave
                 from pg_constraint pc
                 cross join unnest(pc.conkey) with ordinality as x(n, o)
                 join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = x.n
                where pc.conrelid = %L::regclass and pc.contype = 'p' and a.attname <> 'empresa_id') c
         $q$, cr.xid_corte, cr.xid_corte, k.tabela, 'public.' || k.tabela), false, true, '') as x
    from k_negocio k cross join corte cr
)
select jsonb_pretty(jsonb_build_object(
  'corte_para_o_depois', (pg_snapshot_xmin(pg_current_snapshot()))::text,
  'corte_usado', (select corte::text from parametro),
  'tabelas', (
    select jsonb_object_agg(p.tabela, jsonb_build_object(
             'pk', p.pk,
             'chave', p.chave,
             'linhas', ((xpath('/row/linhas/text()', p.x))[1])::text::bigint,
             'relfilenode', p.relfilenode,
             'md5_chave_xmin', ((xpath('/row/hash_chave/text()', p.x))[1])::text,
             'md5_conteudo', ((xpath('/row/hash_conteudo/text()', p.x))[1])::text,
             'janela', ((xpath('/row/janela/text()', p.x))[1])::text::bigint))
      from porta p)
)) as impressao;
