-- =============================================================================
-- verificacao-pos-apply.sql — F62 · Frente G — a prova do runbook depois das 0152–0158
-- =============================================================================
-- Rodada pelo MCP (execute_sql), só leitura, nos DOIS bancos, depois do apply da 0158 —
-- com ESTE MESMO TEXTO. O resultado volta pela EXCEPTION (molde da impressão do acesso):
-- a transação é só-leitura e nada fica. SÓ CONTAGENS, md5 e atributos de catálogo —
-- nenhum id, nome ou e-mail de pessoa.
--
--   funcoes      — as 20 funções que a F62 criou ou recriou: assinaturas vivas por nome,
--                  md5(prosrc) (comparado com o trecho entre os $$ do arquivo), definer,
--                  search_path, e EXECUTE por papel (anon · authenticated · service_role)
--   tabelas      — RLS ligada / force para empresas, membros, plataforma_admins
--   privilegios  — o que anon/authenticated podem nas três tabelas novas
--   dados        — a equivalência: perfis, memberships na WAP, iguais em papel e ativo,
--                  perfis sem membership, plataforma × devs, vínculos com empresa/membro,
--                  vínculos incoerentes, filiais da WAP, empresas
--   gatilhos     — os três gatilhos da fase, habilitados
-- =============================================================================
select set_config('transaction_read_only', 'on', true);

do $f62v$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'funcoes', (
      select jsonb_object_agg(x.chave, x.info order by x.chave) from (
        select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as chave,
               jsonb_build_object(
                 'assinaturas', (select count(*) from pg_proc q where q.pronamespace = p.pronamespace and q.proname = p.proname),
                 'md5', md5(p.prosrc),
                 'definer', p.prosecdef,
                 'config', coalesce(array_to_string(p.proconfig, ','), '-'),
                 'exec', has_function_privilege('anon', p.oid, 'execute')::int::text
                         || has_function_privilege('authenticated', p.oid, 'execute')::int::text
                         || has_function_privilege('service_role', p.oid, 'execute')::int::text
               ) as info
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('empresa_legada', 'membros_guarda_dev', 'handle_new_user', 'e_plataforma',
                             'operador_filiais_deriva_membership', 'empresas_do_membro', 'empresas_de_escrita',
                             'empresas_de_admin', 'unidades_de_escrita', 'papel_atual', 'pode_escrever_filial',
                             'existe_outro_admin_ativo', 'exigir_gestao_de', 'definir_papel_usuario',
                             'definir_status_usuario', 'definir_vinculos_usuario', 'apagar_usuario',
                             'profiles_guarda_dev', 'checagens_integridade_nucleo')
      ) x),
    'tabelas', (
      select jsonb_object_agg(c.relname, c.relrowsecurity::int::text || c.relforcerowsecurity::int::text)
        from pg_class c
       where c.oid in ('public.empresas'::regclass, 'public.membros'::regclass, 'public.plataforma_admins'::regclass)),
    'privilegios', (
      select jsonb_object_agg(t.nome,
               has_table_privilege('anon', t.oid, 'select')::int::text
               || has_table_privilege('anon', t.oid, 'insert')::int::text
               || has_table_privilege('authenticated', t.oid, 'select')::int::text
               || has_table_privilege('authenticated', t.oid, 'insert')::int::text
               || has_table_privilege('authenticated', t.oid, 'update')::int::text
               || has_table_privilege('authenticated', t.oid, 'delete')::int::text)
        from (values ('empresas', 'public.empresas'::regclass), ('membros', 'public.membros'::regclass),
                     ('plataforma_admins', 'public.plataforma_admins'::regclass)) as t(nome, oid)),
    'dados', jsonb_build_object(
      'perfis', (select count(*) from public.profiles),
      'membros_wap', (select count(*) from public.membros where empresa_id = public.empresa_legada()),
      'membros_total', (select count(*) from public.membros),
      'iguais', (select count(*) from public.profiles p
                   join public.membros m on m.profile_id = p.id and m.empresa_id = public.empresa_legada()
                  where m.papel = p.papel and m.ativo = p.ativo),
      'perfis_sem_membership', (select count(*) from public.profiles p
                                 where not exists (select 1 from public.membros m
                                                    where m.profile_id = p.id and m.empresa_id = public.empresa_legada())),
      'plataforma', (select count(*) from public.plataforma_admins),
      'devs_wap', (select count(*) from public.membros where empresa_id = public.empresa_legada() and papel = 'dev'),
      'vinculos', (select count(*) from public.operador_filiais),
      'vinculos_wap', (select count(*) from public.operador_filiais where empresa_id = public.empresa_legada()),
      'vinculos_incoerentes', (select count(*) from public.operador_filiais o
                                where not exists (select 1 from public.membros m
                                                   where m.id = o.membro_id and m.profile_id = o.usuario_id
                                                     and m.empresa_id = o.empresa_id)),
      'filiais', (select count(*) from public.filiais),
      'filiais_wap', (select count(*) from public.filiais where empresa_id = public.empresa_legada()),
      'empresas', (select count(*) from public.empresas),
      'empresa_wap', (select count(*) from public.empresas where id = public.empresa_legada() and slug = 'wap')),
    'gatilhos', (
      select jsonb_object_agg(g.tgname, g.tgenabled::text)
        from pg_trigger g
       where not g.tgisinternal
         and g.tgname in ('membros_guarda_dev', 'operador_filiais_deriva_membership', 'profiles_guarda_dev'))
  ) into v;
  raise exception 'F62_VERIFICACAO %', v::text;
end
$f62v$;
