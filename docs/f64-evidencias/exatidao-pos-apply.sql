-- =============================================================================
-- exatidao-pos-apply.sql — F64 · Frente G — o texto APLICADO é o do repositório, byte a byte
-- =============================================================================
-- O `apply_migration` do MCP recebe o texto da migration colado na chamada. Esta sonda prova que o
-- que chegou ao banco é o ARQUIVO, e não uma transcrição: o md5 de cada comentário das onze colunas,
-- do comentário e do `prosrc` das duas funções da 0164, contra o md5 calculado DOS ARQUIVOS
-- (`supabase/migrations/0162`–`0164`, normalizados CRLF→LF; os valores esperados estão em
-- docs/f64-evidencias/depois/exatidao-esperada.json). E as ACLs: a função do gatilho fechada a
-- `anon`/`authenticated` (o `revoke all` da 0164), e o núcleo fechado a todo papel da API (a 0138 —
-- `create or replace` preserva a ACL).
--
-- Rodada pelo MCP (execute_sql), só leitura, nos DOIS bancos, depois do apply da 0164. SÓ HASH e
-- booleano — nenhum id, código, rótulo, nome ou texto de linha (regra 2 do CLAUDE.md).
-- =============================================================================
select set_config('transaction_read_only', 'on', true);

select jsonb_pretty(jsonb_build_object(
  'colunas', (
    select jsonb_object_agg(c.relname, md5(col_description(c.oid, a.attnum)) order by c.relname)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped
     where n.nspname = 'public'
       and c.relname = any (array[
         'tipos_item', 'motivos', 'kits_modelos', 'senhas_acesso', 'eventos_admin', 'import_logs',
         'relatorios_gerados', 'import_prefixos_patrimonio', 'import_termos_categoria',
         'import_termos_estado', 'unidades_apelidos'])),
  'funcoes', (
    select jsonb_object_agg(p.proname, jsonb_build_object(
             'prosrc', md5(p.prosrc),
             'comentario', md5(obj_description(p.oid, 'pg_proc')),
             'anon_executa', has_function_privilege('anon', p.oid, 'execute'),
             'authenticated_executa', has_function_privilege('authenticated', p.oid, 'execute'),
             'service_role_executa', has_function_privilege('service_role', p.oid, 'execute')))
      from pg_proc p
     where p.oid in (to_regprocedure('public.kit_motivo_da_empresa()'),
                     to_regprocedure('public.checagens_integridade_nucleo()')))
)) as exatidao;
