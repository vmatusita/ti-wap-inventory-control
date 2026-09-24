-- =============================================================================
-- exatidao-pos-apply.sql — F65 · Frente G — o texto APLICADO é o do repositório, byte a byte
-- =============================================================================
-- O `apply_migration` do MCP recebe o texto da migration colado na chamada. Esta sonda prova que o que
-- chegou ao banco é o ARQUIVO, e não uma transcrição: o md5 do `prosrc` e do comentário das três funções
-- da 0173 (`guarda_empresa`, `termo_da_empresa`, `vocabulario_unidades_guarda`) e dos dois comentários de
-- índice da 0170, contra o md5 calculado DOS ARQUIVOS (normalizados CRLF→LF; os valores esperados estão em
-- docs/f65-evidencias/depois/exatidao-esperada.json). E as ACLs: as duas funções novas fechadas aos quatro
-- papéis (o `revoke all` da 0173); a diagonal com a ACL que já tinha (`create or replace` a preserva).
-- A FORMA das constraints e dos índices (que não guardam o texto do arquivo) é conferida pela impressão do
-- catálogo, contra a do CI (impressao-catalogo.sql).
--
-- Rodada pelo MCP (execute_sql), só leitura, nos DOIS bancos, depois do apply da 0173 (as funções) e da
-- 0170 (os comentários). SÓ HASH e booleano — nenhum id, código, rótulo, nome ou texto de linha.
-- =============================================================================
select set_config('transaction_read_only', 'on', true);

select jsonb_pretty(jsonb_build_object(
  'indices', (
    select jsonb_object_agg(c.relname, md5(obj_description(c.oid, 'pg_class')) order by c.relname)
      from pg_class c
     where c.oid in (to_regclass('public.filiais_nome_chave_uidx'), to_regclass('public.itens_nome_chave_uidx'))),
  'funcoes', (
    select jsonb_object_agg(p.proname, jsonb_build_object(
             'prosrc', md5(p.prosrc),
             'comentario', md5(obj_description(p.oid, 'pg_proc')),
             'invoker', not p.prosecdef,
             'search_path', array_to_string(p.proconfig, ','),
             'anon_executa', has_function_privilege('anon', p.oid, 'execute'),
             'authenticated_executa', has_function_privilege('authenticated', p.oid, 'execute'),
             'service_role_executa', has_function_privilege('service_role', p.oid, 'execute')))
      from pg_proc p
     where p.oid in (to_regprocedure('public.guarda_empresa()'),
                     to_regprocedure('public.termo_da_empresa()'),
                     to_regprocedure('public.vocabulario_unidades_guarda()')))
)) as exatidao;
