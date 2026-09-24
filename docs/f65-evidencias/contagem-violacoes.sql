-- =============================================================================
-- contagem-violacoes.sql — F65 (23/09/2026): o PORTÃO DE DADO antes de qualquer apply (Frente A)
-- =============================================================================
-- A F65 troca 23 FKs simples por compostas `(empresa_id, x) → (empresa_id, id)`, troca a PK de `motivos` e as três do
-- vocabulário do import para `(empresa_id, …)`, faz as unicidades de negócio valerem POR EMPRESA, e põe um gatilho de
-- coerência de empresa em `termos_gerados`. Toda constraint nova é VALIDADA no apply (`add constraint` varre a tabela);
-- se um dado de hoje já estiver incoerente, o apply falha — ou pior, alguém "conserta" a migration para passar. Por isso
-- a contagem vem ANTES, nos dois bancos, e TEM DE DAR 0 em tudo. Se der mais que 0 num banco: nada é aplicado nele, o
-- número vai para o topo do RELATORIO-F65.md com esta consulta, e o dado incoerente é decisão do Johnny.
--
-- O que conta, e como:
--   · fks.<nome>       — para CADA uma das 23 FKs entre tabelas de `k_negocio` (fato 4 da ordem), os filhos cuja
--                        coluna x NÃO é nula (MATCH SIMPLE: com x nulo a FK não confere, antes e depois) e cujo par
--                        `(filho.empresa_id, filho.x)` NÃO existe em `(pai.empresa_id, pai.id)` — exatamente o que a
--                        composta recusaria. `motivos`: o par `(empresa_id, motivo)` contra `(empresa_id, codigo)`;
--   · fks_do_catalogo  — a lista das FKs entre duas tabelas de negócio LIDA DO CATÁLOGO, menos as 23 contadas aqui: tem
--                        de ser VAZIA (uma FK nova que a lista esquecesse apareceria aqui pelo nome);
--   · uniques.<nome>   — para cada unicidade que passa a valer por empresa (os catorze do fato 7, mais o snapshot, mais
--                        os sete pais `(empresa_id, id)`), os GRUPOS duplicados da chave nova (com um unique global de
--                        pé, é 0 por construção — contar é o que PROVA);
--   · termos_gerados   — os termos que citam, em `movimentacao_ids` ou em `ativo_ids`, um id cuja linha é de OUTRA
--                        empresa, e os que citam id que não existe mais (a regra do gatilho da decisão 8 é "todo id é da
--                        empresa do termo": um id inexistente não é, e o gatilho só confere na ENTRADA — conta-se aqui
--                        para declarar o estado de hoje, não para barrar o apply).
--
-- SÓ LEITURA E SÓ CONTAGEM: nenhum id, código, slug, termo, rótulo, nome ou texto de linha sai da consulta (regra 2 do
-- CLAUDE.md) — só nomes de constraint, índice e tabela, que são código. Uma consulta só (o execute_sql do MCP devolve o
-- último comando). O MESMO texto roda antes do primeiro apply e é refeito logo antes do apply de cada banco.
-- =============================================================================
select set_config('transaction_read_only', 'on', true);

with k_negocio(tabela) as (
  values ('anotacoes'), ('ativos'), ('colaboradores'), ('eventos_admin'), ('filiais'), ('import_logs'),
         ('import_prefixos_patrimonio'), ('import_termos_categoria'), ('import_termos_estado'), ('itens'),
         ('kits_modelos'), ('lancamentos_item'), ('motivos'), ('movimentacoes'), ('pendencias_item'),
         ('relatorios_gerados'), ('senhas_acesso'), ('termos_gerados'), ('tipos_item'), ('unidades_apelidos')
),
contadas(nome) as (
  values ('anotacoes_ativo_id_fkey'), ('ativos_filial_id_fkey'), ('ativos_substitui_ativo_id_fkey'),
         ('colaboradores_filial_id_fkey'), ('import_logs_filial_id_fkey'), ('itens_tipo_id_fkey'),
         ('lancamentos_item_colaborador_id_fkey'), ('lancamentos_item_estorna_id_fkey'), ('lancamentos_item_filial_id_fkey'),
         ('lancamentos_item_item_id_fkey'), ('lancamentos_item_movimentacao_id_fkey'),
         ('lancamentos_item_pendencia_item_id_fkey'), ('movimentacoes_ativo_id_fkey'), ('movimentacoes_colaborador_id_fkey'),
         ('movimentacoes_estorno_de_fkey'), ('movimentacoes_filial_destino_id_fkey'), ('movimentacoes_filial_id_fkey'),
         ('movimentacoes_motivo_fkey'), ('pendencias_item_ativo_id_fkey'), ('pendencias_item_filial_id_fkey'),
         ('pendencias_item_movimentacao_id_fkey'), ('relatorios_gerados_filial_id_fkey'), ('unidades_apelidos_filial_id_fkey')
),
fk_negocio as (
  select k.conname::text as nome
    from pg_constraint k
    join pg_class f on f.oid = k.conrelid
    join pg_class p on p.oid = k.confrelid
   where k.contype = 'f'
     and f.relnamespace = 'public'::regnamespace and p.relnamespace = 'public'::regnamespace
     and f.relname in (select tabela from k_negocio) and p.relname in (select tabela from k_negocio)
)
select jsonb_pretty(jsonb_build_object(
  'fks_de_negocio_no_catalogo', (select count(*) from fk_negocio),
  'fks_do_catalogo_fora_da_contagem', (select coalesce(jsonb_agg(nome order by nome), '[]'::jsonb) from fk_negocio where nome not in (select nome from contadas)),
  'fks_contadas_fora_do_catalogo', (select coalesce(jsonb_agg(nome order by nome), '[]'::jsonb) from contadas where nome not in (select nome from fk_negocio)),
  'fks', jsonb_build_object(
    'anotacoes_ativo_id_fkey', (select count(*) from public.anotacoes c where c.ativo_id is not null and not exists (select 1 from public.ativos p where p.empresa_id = c.empresa_id and p.id = c.ativo_id)),
    'ativos_filial_id_fkey', (select count(*) from public.ativos c where c.filial_id is not null and not exists (select 1 from public.filiais p where p.empresa_id = c.empresa_id and p.id = c.filial_id)),
    'ativos_substitui_ativo_id_fkey', (select count(*) from public.ativos c where c.substitui_ativo_id is not null and not exists (select 1 from public.ativos p where p.empresa_id = c.empresa_id and p.id = c.substitui_ativo_id)),
    'colaboradores_filial_id_fkey', (select count(*) from public.colaboradores c where c.filial_id is not null and not exists (select 1 from public.filiais p where p.empresa_id = c.empresa_id and p.id = c.filial_id)),
    'import_logs_filial_id_fkey', (select count(*) from public.import_logs c where c.filial_id is not null and not exists (select 1 from public.filiais p where p.empresa_id = c.empresa_id and p.id = c.filial_id)),
    'itens_tipo_id_fkey', (select count(*) from public.itens c where c.tipo_id is not null and not exists (select 1 from public.tipos_item p where p.empresa_id = c.empresa_id and p.id = c.tipo_id)),
    'lancamentos_item_colaborador_id_fkey', (select count(*) from public.lancamentos_item c where c.colaborador_id is not null and not exists (select 1 from public.colaboradores p where p.empresa_id = c.empresa_id and p.id = c.colaborador_id)),
    'lancamentos_item_estorna_id_fkey', (select count(*) from public.lancamentos_item c where c.estorna_id is not null and not exists (select 1 from public.lancamentos_item p where p.empresa_id = c.empresa_id and p.id = c.estorna_id)),
    'lancamentos_item_filial_id_fkey', (select count(*) from public.lancamentos_item c where c.filial_id is not null and not exists (select 1 from public.filiais p where p.empresa_id = c.empresa_id and p.id = c.filial_id)),
    'lancamentos_item_item_id_fkey', (select count(*) from public.lancamentos_item c where c.item_id is not null and not exists (select 1 from public.itens p where p.empresa_id = c.empresa_id and p.id = c.item_id)),
    'lancamentos_item_movimentacao_id_fkey', (select count(*) from public.lancamentos_item c where c.movimentacao_id is not null and not exists (select 1 from public.movimentacoes p where p.empresa_id = c.empresa_id and p.id = c.movimentacao_id)),
    'lancamentos_item_pendencia_item_id_fkey', (select count(*) from public.lancamentos_item c where c.pendencia_item_id is not null and not exists (select 1 from public.pendencias_item p where p.empresa_id = c.empresa_id and p.id = c.pendencia_item_id)),
    'movimentacoes_ativo_id_fkey', (select count(*) from public.movimentacoes c where c.ativo_id is not null and not exists (select 1 from public.ativos p where p.empresa_id = c.empresa_id and p.id = c.ativo_id)),
    'movimentacoes_colaborador_id_fkey', (select count(*) from public.movimentacoes c where c.colaborador_id is not null and not exists (select 1 from public.colaboradores p where p.empresa_id = c.empresa_id and p.id = c.colaborador_id)),
    'movimentacoes_estorno_de_fkey', (select count(*) from public.movimentacoes c where c.estorno_de is not null and not exists (select 1 from public.movimentacoes p where p.empresa_id = c.empresa_id and p.id = c.estorno_de)),
    'movimentacoes_filial_destino_id_fkey', (select count(*) from public.movimentacoes c where c.filial_destino_id is not null and not exists (select 1 from public.filiais p where p.empresa_id = c.empresa_id and p.id = c.filial_destino_id)),
    'movimentacoes_filial_id_fkey', (select count(*) from public.movimentacoes c where c.filial_id is not null and not exists (select 1 from public.filiais p where p.empresa_id = c.empresa_id and p.id = c.filial_id)),
    'movimentacoes_motivo_fkey', (select count(*) from public.movimentacoes c where c.motivo is not null and not exists (select 1 from public.motivos p where p.empresa_id = c.empresa_id and p.codigo = c.motivo)),
    'pendencias_item_ativo_id_fkey', (select count(*) from public.pendencias_item c where c.ativo_id is not null and not exists (select 1 from public.ativos p where p.empresa_id = c.empresa_id and p.id = c.ativo_id)),
    'pendencias_item_filial_id_fkey', (select count(*) from public.pendencias_item c where c.filial_id is not null and not exists (select 1 from public.filiais p where p.empresa_id = c.empresa_id and p.id = c.filial_id)),
    'pendencias_item_movimentacao_id_fkey', (select count(*) from public.pendencias_item c where c.movimentacao_id is not null and not exists (select 1 from public.movimentacoes p where p.empresa_id = c.empresa_id and p.id = c.movimentacao_id)),
    'relatorios_gerados_filial_id_fkey', (select count(*) from public.relatorios_gerados c where c.filial_id is not null and not exists (select 1 from public.filiais p where p.empresa_id = c.empresa_id and p.id = c.filial_id)),
    'unidades_apelidos_filial_id_fkey', (select count(*) from public.unidades_apelidos c where c.filial_id is not null and not exists (select 1 from public.filiais p where p.empresa_id = c.empresa_id and p.id = c.filial_id))),
  'uniques', jsonb_build_object(
    -- os sete pais: (empresa_id, id)
    'ativos (empresa_id, id)', (select count(*) from (select 1 from public.ativos group by empresa_id, id having count(*) > 1) d),
    'movimentacoes (empresa_id, id)', (select count(*) from (select 1 from public.movimentacoes group by empresa_id, id having count(*) > 1) d),
    'pendencias_item (empresa_id, id)', (select count(*) from (select 1 from public.pendencias_item group by empresa_id, id having count(*) > 1) d),
    'lancamentos_item (empresa_id, id)', (select count(*) from (select 1 from public.lancamentos_item group by empresa_id, id having count(*) > 1) d),
    'colaboradores (empresa_id, id)', (select count(*) from (select 1 from public.colaboradores group by empresa_id, id having count(*) > 1) d),
    'itens (empresa_id, id)', (select count(*) from (select 1 from public.itens group by empresa_id, id having count(*) > 1) d),
    'tipos_item (empresa_id, id)', (select count(*) from (select 1 from public.tipos_item group by empresa_id, id having count(*) > 1) d),
    -- as unicidades de negócio, na forma POR EMPRESA
    'filiais_slug_key', (select count(*) from (select 1 from public.filiais group by empresa_id, slug having count(*) > 1) d),
    'filiais_nome_chave_uidx', (select count(*) from (select 1 from public.filiais group by empresa_id, public.vocabulario_chave(nome) having count(*) > 1) d),
    'tipos_item_slug_key', (select count(*) from (select 1 from public.tipos_item group by empresa_id, slug having count(*) > 1) d),
    'itens_nome_chave_uidx', (select count(*) from (select 1 from public.itens where nome_chave is not null group by empresa_id, nome_chave having count(*) > 1) d),
    'colaboradores_nome_chave_uidx', (select count(*) from (select 1 from public.colaboradores where nome_chave is not null group by empresa_id, nome_chave having count(*) > 1) d),
    'kits_modelos_nome_uidx', (select count(*) from (select 1 from public.kits_modelos group by empresa_id, lower(nome) having count(*) > 1) d),
    'unidades_apelidos_apelido_chave_uidx', (select count(*) from (select 1 from public.unidades_apelidos where apelido_chave is not null group by empresa_id, apelido_chave having count(*) > 1) d),
    'motivos_pkey', (select count(*) from (select 1 from public.motivos group by empresa_id, codigo having count(*) > 1) d),
    'import_prefixos_patrimonio_pkey', (select count(*) from (select 1 from public.import_prefixos_patrimonio group by empresa_id, prefixo having count(*) > 1) d),
    'import_termos_categoria_pkey', (select count(*) from (select 1 from public.import_termos_categoria group by empresa_id, termo having count(*) > 1) d),
    'import_termos_estado_pkey', (select count(*) from (select 1 from public.import_termos_estado group by empresa_id, termo having count(*) > 1) d),
    'import_termos_categoria_categoria_rotulo_uidx', (select count(*) from (select 1 from public.import_termos_categoria where rotulo is not null group by empresa_id, categoria having count(*) > 1) d),
    'import_termos_estado_estado_rotulo_uidx', (select count(*) from (select 1 from public.import_termos_estado where rotulo is not null group by empresa_id, estado having count(*) > 1) d),
    'relatorios_gerados_periodo_filial_versao_uidx', (select count(*) from (select 1 from public.relatorios_gerados group by empresa_id, periodo_de, periodo_ate, coalesce(filial_id, -1), versao having count(*) > 1) d)),
  'termos_gerados', (
    select jsonb_build_object(
      'termos', count(*),
      'com_movimentacao_de_outra_empresa', count(*) filter (where exists (
          select 1 from public.movimentacoes m where m.id = any (t.movimentacao_ids) and m.empresa_id <> t.empresa_id)),
      'com_ativo_de_outra_empresa', count(*) filter (where exists (
          select 1 from public.ativos a where a.id = any (t.ativo_ids) and a.empresa_id <> t.empresa_id)),
      'com_movimentacao_inexistente', count(*) filter (where exists (
          select 1 from unnest(t.movimentacao_ids) as x(id) where not exists (select 1 from public.movimentacoes m where m.id = x.id))),
      'com_ativo_inexistente', count(*) filter (where exists (
          select 1 from unnest(t.ativo_ids) as x(id) where not exists (select 1 from public.ativos a where a.id = x.id))))
      from public.termos_gerados t),
  'empresas', (select count(*) from public.empresas)
)) as violacoes;
