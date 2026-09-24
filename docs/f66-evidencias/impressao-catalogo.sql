-- =============================================================================
-- impressao-catalogo.sql — F66 · Frente A — o CATÁLOGO que a fase NÃO pode tocar, o MESMO texto ANTES e DEPOIS
-- =============================================================================
-- A outra metade do "antes" (PLAN-F66.md, decisão 14). A impressão das policies (impressao-policies.sql) mostra o que
-- a F66 DEVE mudar; esta mostra o que ela NÃO pode mudar, e o que muda só onde foi planejado:
--
--   · relfilenode  — das 20 tabelas de `k_negocio` e das duas de vínculo (`membros`, `operador_filiais`): IGUAL antes e
--                    depois é a prova de que nenhuma tupla foi reescrita (`alter policy`, `create index` e `create or
--                    replace function` não reescrevem; um `alter column … type` ou um `vacuum full` reescreveriam);
--   · indices      — todo índice dessas 22 tabelas: nome → tabela, pg_get_indexdef, e o md5 da lista (a F66 só cria ou
--                    derruba o que a medição justificou — decisão 8);
--   · funcoes      — o md5 do conjunto (assinatura:md5 do `prosrc`) de TODA função de `public`, e o md5 SEM as duas que
--                    a F66 recria (`rel_por_motivo_filiais`, `rel_resumo_filiais` — decisão 9): o critério 17, "as
--                    funções que a fase não podia tocar estão byte a byte";
--   · as_da_f66    — o md5 do `prosrc` das duas `rel_*` (muda só na linha do join).
--
-- SÓ LEITURA E SÓ CATÁLOGO: nenhum dado de linha. Uma consulta só (o execute_sql do MCP devolve o último comando).
-- ⚠ O md5 de `prosrc` do banco vivo NÃO se compara com o do CI (memória do projeto: três funções têm o corpo vivo
-- diferente do arquivo desde antes da F46) — a régua é antes × depois NO MESMO BANCO.
-- =============================================================================
select set_config('transaction_read_only', 'on', true);

with alvo(tabela) as (
  values ('anotacoes'), ('ativos'), ('colaboradores'), ('eventos_admin'), ('filiais'), ('import_logs'),
         ('import_prefixos_patrimonio'), ('import_termos_categoria'), ('import_termos_estado'), ('itens'),
         ('kits_modelos'), ('lancamentos_item'), ('motivos'), ('movimentacoes'), ('pendencias_item'),
         ('relatorios_gerados'), ('senhas_acesso'), ('termos_gerados'), ('tipos_item'), ('unidades_apelidos'),
         ('membros'), ('operador_filiais')
),
rel as (
  select c.oid, c.relname::text as tabela, c.relfilenode, a.tabela in ('membros', 'operador_filiais') as vinculo
    from pg_class c join alvo a on a.tabela = c.relname
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
),
ix as (
  select ic.relname::text as nome, r.tabela, pg_get_indexdef(i.indexrelid) as def, i.indisunique as unico
    from pg_index i
    join rel r on r.oid = i.indrelid
    join pg_class ic on ic.oid = i.indexrelid
),
fn as (
  select p.oid::regprocedure::text as assinatura, p.proname::text as nome, md5(p.prosrc) as h
    from pg_proc p where p.pronamespace = 'public'::regnamespace
)
select jsonb_pretty(jsonb_build_object(
  -- o ENCHIMENTO do canal: o MCP devolve inline a resposta pequena e grava em arquivo (tool-results) a grande; com ele
  -- a resposta sempre cai em arquivo, e a evidência é EXTRAÍDA dele por script, nunca transcrita. A extração o descarta.
  '_canal', repeat('.', 120000),
  'relfilenode', jsonb_build_object(
    'negocio', (select count(*) from rel where not vinculo),
    'vinculos', (select count(*) from rel where vinculo),
    'md5', (select md5(string_agg(tabela || ':' || relfilenode::text, E'\n' order by tabela)) from rel),
    'lista', (select jsonb_object_agg(tabela, relfilenode) from rel)),
  'indices', jsonb_build_object(
    'total', (select count(*) from ix),
    'nao_unicos', (select count(*) from ix where not unico),
    'liderados_por_empresa_id', (select count(*) from ix where def ~ '\(empresa_id[,)]'),
    'md5', (select md5(string_agg(nome || '|' || tabela || '|' || def, E'\n' order by nome)) from ix),
    'lista', (select jsonb_object_agg(nome, regexp_replace(def, '^CREATE (UNIQUE )?INDEX \S+ ON public\.', '\1')) from ix)),
  'funcoes', jsonb_build_object(
    'total', (select count(*) from fn),
    'md5_todas', (select md5(string_agg(assinatura || ':' || h, E'\n' order by assinatura)) from fn),
    'sem_as_da_f66', (select count(*) from fn where nome not in ('rel_por_motivo_filiais', 'rel_resumo_filiais')),
    'md5_sem_as_da_f66', (select md5(string_agg(assinatura || ':' || h, E'\n' order by assinatura)) from fn
                           where nome not in ('rel_por_motivo_filiais', 'rel_resumo_filiais')),
    'as_da_f66', (select coalesce(jsonb_object_agg(assinatura, h), '{}'::jsonb) from fn
                   where nome in ('rel_por_motivo_filiais', 'rel_resumo_filiais')))
)) as catalogo;
