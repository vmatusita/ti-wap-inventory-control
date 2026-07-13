-- Migration 0012 — fecha `senhas_acesso` para a service role apenas (achado da
-- revisão da F3). As policies da 0005 concediam SELECT/ALL a `authenticated`, e
-- RLS no Postgres é row-level, não column-level: qualquer operador logado podia
-- ler a coluna `hash` via PostgREST (anon key + seu JWT), viabilizando
-- brute-force offline das senhas de visualização. O app já trata TODAS as
-- operações de `senhas_acesso` no servidor com o client administrativo
-- (validar/entrar, criar, revogar, listar sem hash) — nenhuma passa pelo client
-- do operador. Removendo as policies, com RLS habilitada, só a service role
-- (server-side) acessa a tabela; `anon`/`authenticated` não leem nem escrevem.
-- Aplicar no projeto de DESENVOLVIMENTO.

drop policy if exists "leitura operador"        on public.senhas_acesso;
drop policy if exists "operador gerencia senhas" on public.senhas_acesso;
-- RLS segue habilitada (0005). Sem policies → deny-all para anon/authenticated;
-- a service role bypassa RLS por definição.
