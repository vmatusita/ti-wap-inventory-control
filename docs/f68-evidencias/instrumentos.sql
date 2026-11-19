-- F68 — os instrumentos de catálogo do "antes" e do "depois" (só leitura; só nome de objeto, texto de esquema e hash).
-- Reconstituídos e conferidos contra o "antes" de produção (19/11/2026): devolvem 117 / 7b461b5b6978bb9c788e14c75c164b3f
-- e 62 / cee318f577345f75dc06b99874b8a867 — os mesmos números de antes/producao/contagens.txt.

-- (1) as funções de public: nome, args, security definer, md5(prosrc), md5(pg_get_functiondef)[:10] e EXECUTE para
--     anon/authenticated/service_role/PUBLIC (0/1). O md5 é o do TSV inteiro, sem quebra final.
with r as (select rolname, oid from pg_roles where rolname in ('anon','authenticated','service_role')),
f as (
  select p.proname as nome, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as sd, md5(p.prosrc) as m,
         left(md5(pg_get_functiondef(p.oid)), 10) as d, p.proacl, p.proowner, p.oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
),
l as (
  select concat_ws(E'\t', f.nome, f.args, f.sd, f.m, f.d,
    (exists (select 1 from aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) x where x.privilege_type = 'EXECUTE' and x.grantee = (select oid from r where rolname='anon')))::int,
    (exists (select 1 from aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) x where x.privilege_type = 'EXECUTE' and x.grantee = (select oid from r where rolname='authenticated')))::int,
    (exists (select 1 from aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) x where x.privilege_type = 'EXECUTE' and x.grantee = (select oid from r where rolname='service_role')))::int,
    (exists (select 1 from aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) x where x.privilege_type = 'EXECUTE' and x.grantee = 0))::int) as linha, f.nome, f.args
  from f
)
select count(*) as n, md5(string_agg(linha, E'\n' order by nome, args)) as md5_tsv from l;

-- (2) as policies de public e storage: schema, tabela, nome, cmd, roles, permissive, md5(qual), md5(with_check).
select count(*) as n,
  md5(string_agg(concat_ws(E'\t', schemaname, tablename, policyname, cmd, roles, permissive, md5(coalesce(qual, '')),
                           md5(coalesce(with_check, ''))), E'\n' order by schemaname, tablename, policyname)) as md5_tsv
from pg_policies where schemaname in ('public', 'storage');

-- (3) "as outras": o mesmo instrumento (1) restrito às funções que a F68 NÃO cria — tem de dar o md5 do "antes".
--     (o filtro: `where nome not in ('senha_acesso_criar','senha_acesso_conferir','senha_acesso_definir_status',
--      'relatorio_publico_abrir','relatorio_publico_dados','relatorio_publico_projetar')` antes do string_agg)
