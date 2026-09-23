-- =============================================================================
-- impressao-catalogo.sql — F65 (23/09/2026): a IMPRESSÃO DO CATÁLOGO das 20 tabelas de negócio, o MESMO texto ANTES e DEPOIS
-- =============================================================================
-- A outra metade do "antes" (PLAN-F65.md, decisão 14). A impressão das LINHAS (impressao-tenant.sql) prova que nenhuma
-- tupla foi reescrita; esta prova O QUE MUDOU NO CATÁLOGO — que é exatamente o que a F65 DEVE mudar (FKs, uniques,
-- gatilhos) e o que ela NÃO pode tocar (o corpo das funções que não recria, as policies). Cada seção sai com a listagem
-- (nome de objeto de esquema e definição — é código) e um md5 dela, para comparar antes × depois, ensaio × produção e
-- banco vivo × Postgres do CI:
--
--   · fks          — toda FK cujo filho OU pai é uma das 20 de `k_negocio`: nome → tabela, definição
--                    (pg_get_constraintdef: colunas, alvo, ações ON DELETE/ON UPDATE, MATCH, DEFERRABLE), validada —
--                    no md5 de TODAS; a listagem é só das FKs ENTRE duas tabelas de negócio (as que a fase troca), e a
--                    contagem delas, simples × compostas (23 + 0 → 0 + 23);
--   · uniques      — todo índice único e toda PK das 20: nome → tabela, pg_get_indexdef, a constraint (p/u) ou "índice";
--                    e quantos contêm `empresa_id`;
--   · pais         — as tabelas de negócio com unique/PK EXATAMENTE (empresa_id, id) (1 → 8: filiais + os sete);
--   · gatilhos     — todo gatilho não interno das 20: nome → pg_get_triggerdef, habilitado;
--   · funcoes      — o md5 do conjunto (assinatura:md5 do `prosrc`) de TODA função de `public`, e o md5 do conjunto SEM as três que a
--                    F65 cria ou recria (guarda_empresa, termo_da_empresa, vocabulario_unidades_guarda) — o critério 14:
--                    "as funções que a fase não podia tocar estão byte a byte";
--   · advisory     — as 12 funções que chamam pg_advisory_xact_lock, com o md5 do `prosrc` e as chamadas reais (sem
--                    comentário): 11 ficam byte a byte; a 12ª, vocabulario_unidades_guarda, muda só na diagonal.
-- As 62 policies são a impressão da F64, reusada com o MESMO texto: docs/f64-evidencias/impressao-policies.sql.
--
-- SÓ LEITURA E SÓ CATÁLOGO: nenhum dado de linha. Uma consulta só (o execute_sql do MCP devolve o último comando).
-- =============================================================================
select set_config('transaction_read_only', 'on', true);

with k_negocio(tabela) as (
  values ('anotacoes'), ('ativos'), ('colaboradores'), ('eventos_admin'), ('filiais'), ('import_logs'),
         ('import_prefixos_patrimonio'), ('import_termos_categoria'), ('import_termos_estado'), ('itens'),
         ('kits_modelos'), ('lancamentos_item'), ('motivos'), ('movimentacoes'), ('pendencias_item'),
         ('relatorios_gerados'), ('senhas_acesso'), ('termos_gerados'), ('tipos_item'), ('unidades_apelidos')
),
rel as (
  select c.oid, c.relname::text as tabela
    from pg_class c join k_negocio k on k.tabela = c.relname
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
),
fk as (
  select k.conname::text as nome, f.relname::text as tabela, p.relname::text as pai,
         pg_get_constraintdef(k.oid) as def, k.convalidated as validada,
         (f.oid in (select oid from rel) and p.oid in (select oid from rel)) as de_negocio,
         cardinality(k.conkey) as colunas
    from pg_constraint k
    join pg_class f on f.oid = k.conrelid
    join pg_class p on p.oid = k.confrelid
   where k.contype = 'f' and (f.oid in (select oid from rel) or p.oid in (select oid from rel))
),
uq as (
  select ic.relname::text as nome, r.tabela, pg_get_indexdef(i.indexrelid) as def,
         coalesce((select k.contype::text from pg_constraint k where k.conindid = i.indexrelid and k.contype in ('p', 'u')), 'indice') as tipo,
         exists (select 1 from unnest(i.indkey) as a(n) join pg_attribute att on att.attrelid = i.indrelid and att.attnum = a.n
                  where att.attname = 'empresa_id') as com_empresa,
         (select array_agg(att.attname::text order by a.o)
            from unnest(i.indkey) with ordinality as a(n, o) join pg_attribute att on att.attrelid = i.indrelid and att.attnum = a.n) as cols,
         i.indexprs is null and i.indpred is null as simples
    from pg_index i
    join rel r on r.oid = i.indrelid
    join pg_class ic on ic.oid = i.indexrelid
   where i.indisunique or i.indisprimary
),
trg as (
  select t.tgname::text as nome, r.tabela, pg_get_triggerdef(t.oid) as def, t.tgenabled::text as habilitado
    from pg_trigger t join rel r on r.oid = t.tgrelid
   where not t.tgisinternal
),
fn as (
  select p.oid::regprocedure::text as assinatura, p.proname::text as nome, md5(p.prosrc) as h, p.prosrc
    from pg_proc p where p.pronamespace = 'public'::regnamespace
)
select jsonb_pretty(jsonb_build_object(
  'fks', jsonb_build_object(
    'total', (select count(*) from fk),
    'md5', (select md5(string_agg(nome || '|' || tabela || '|' || def || '|' || validada::text, E'\n' order by nome)) from fk),
    'de_negocio', (select count(*) from fk where de_negocio),
    'de_negocio_simples', (select count(*) from fk where de_negocio and colunas = 1),
    'de_negocio_compostas', (select count(*) from fk where de_negocio and colunas > 1),
    'de_negocio_nao_validadas', (select count(*) from fk where de_negocio and not validada),
    'pares_de_negocio_com_duas_relacoes', (select coalesce(jsonb_agg(par order by par), '[]'::jsonb)
                                             from (select tabela || '→' || pai as par from fk where de_negocio
                                                    group by tabela, pai having count(*) > 1) s),
    'lista_de_negocio', (select jsonb_object_agg(nome, def || case when validada then '' else ' [NOT VALID]' end) from fk where de_negocio)),
  'uniques', jsonb_build_object(
    'total', (select count(*) from uq),
    'md5', (select md5(string_agg(nome || '|' || tabela || '|' || def || '|' || tipo, E'\n' order by nome)) from uq),
    'com_empresa_id', (select count(*) from uq where com_empresa),
    'lista', (select jsonb_object_agg(nome, tipo || ' ' || regexp_replace(def, '^CREATE UNIQUE INDEX \S+ ON public\.', '')) from uq)),
  'pais', (select jsonb_build_object('tabelas_com_empresa_id_id', count(distinct tabela),
                                     'lista', coalesce(jsonb_agg(distinct tabela), '[]'::jsonb))
             from uq where simples and cols = array['empresa_id', 'id']),
  'gatilhos', jsonb_build_object(
    'total', (select count(*) from trg),
    'md5', (select md5(string_agg(nome || '|' || tabela || '|' || def || '|' || habilitado, E'\n' order by tabela, nome)) from trg),
    'lista', (select jsonb_object_agg(tabela || '.' || nome, def || ' [' || habilitado || ']') from trg)),
  'funcoes', jsonb_build_object(
    'total', (select count(*) from fn),
    'md5_todas', (select md5(string_agg(assinatura || ':' || h, E'\n' order by assinatura)) from fn),
    'md5_sem_as_da_f65', (select md5(string_agg(assinatura || ':' || h, E'\n' order by assinatura)) from fn
                           where nome not in ('guarda_empresa', 'termo_da_empresa', 'vocabulario_unidades_guarda')),
    'sem_as_da_f65', (select count(*) from fn where nome not in ('guarda_empresa', 'termo_da_empresa', 'vocabulario_unidades_guarda')),
    'as_da_f65', (select coalesce(jsonb_object_agg(assinatura, h), '{}'::jsonb) from fn
                   where nome in ('guarda_empresa', 'termo_da_empresa', 'vocabulario_unidades_guarda'))),
  'advisory', (
    select jsonb_build_object(
      'funcoes', count(*),
      'chamadas_reais', sum(regexp_count(regexp_replace(prosrc, '--[^\n]*', '', 'g'), 'pg_advisory_xact_lock\s*\(')),
      'lista', jsonb_object_agg(assinatura, jsonb_build_object(
                 'md5', h,
                 'chamadas', regexp_count(regexp_replace(prosrc, '--[^\n]*', '', 'g'), 'pg_advisory_xact_lock\s*\('))))
      from fn where prosrc ~ 'pg_advisory')
)) as catalogo;
