-- =============================================================================
-- bootstrap-storage.sql — o recorte MÍNIMO do schema `storage` (F46, 06/09/2026)
-- =============================================================================
-- Nenhuma migration cria o schema `storage` — elas o PRESSUPÕEM. `grep -rn 'create schema'` nas
-- 126 devolve zero. Num Supabase hospedado (e no `supabase start`) quem o cria é o serviço
-- Storage; num `postgres:17` cru, ninguém. Se este arquivo não rodar antes, a migration `0021`
-- morre na linha 49 com `invalid_schema_name`, e a cadeia inteira para ali.
--
-- Como no `bootstrap-auth.sql`: é o RECORTE do que este repositório toca, não uma
-- reimplementação do Storage. Não há `storage.migrations`, `s3_multipart_uploads`, `prefixes`,
-- nem as funções `storage.foldername`/`filename`/`extension` — nada disso aparece em migration ou
-- roteiro nenhum.
-- =============================================================================

create schema if not exists storage;

-- USAGE: `papeis_rls.sql` faz `grant select, insert, update, delete on storage.objects to
-- authenticated` (linha 132) e depois insere COMO `authenticated`. Sem USAGE no schema, o grant
-- de tabela não basta e o insert erra.
grant usage on schema storage to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- storage.buckets
-- ---------------------------------------------------------------------------
-- Exigida por `0021_termos_gerados.sql:49-51` e `0031_import_logs.sql:53-55`, que inserem os
-- buckets `termos` e `backups-import` com `on conflict (id) do nothing`.
--
-- `id` é text e é a PK — o `on conflict (id)` das duas migrations depende disso. `public` é
-- boolean com default false (as duas passam `false` explicitamente).
create table if not exists storage.buckets (
  id         text not null primary key,
  name       text not null,
  public     boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- storage.objects
-- ---------------------------------------------------------------------------
-- 41 linhas de código vivo a citam. Dois usos:
--  (a) 8 policies criadas em `0021:55-62` e `0031:60-67` (`for select/insert/update/delete to
--      authenticated using (bucket_id = '…')`), com o predicado reescrito por `alter policy` em
--      `0066`/`0069`/`0070`/`0072` para fechar por filial;
--  (b) `left join storage.objects o on o.bucket_id = 'termos' and o.name = t.arquivo_path`
--      dentro das RPCs de diagnóstico e de exclusão destrutiva (`0077:116`, `0083:151/334`,
--      `0085`, `0089`, `0093`, `0095`, `0098`, `0100`, `0110`, `0127`) — elas conferem se o
--      `.docx` existe MESMO no bucket antes de agir.
--
-- Os roteiros inserem `(bucket_id, name, owner)` — `cargo_dev.sql:285`, `dev_destrutivo.sql:221`
-- e `:702`, `papeis_rls.sql:248` —, então `id` precisa de DEFAULT e `owner` precisa existir.
create table if not exists storage.objects (
  id         uuid not null primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ⚠ RLS LIGADA — E ESTE É O BLOCO MAIS FÁCIL DE ESQUECER, com a consequência mais silenciosa.
--
-- NENHUMA migration faz `enable row level security` sobre `storage.objects`: todas as tabelas de
-- `public` ligam a própria RLS explicitamente (ex. `0021:41` para `public.termos_gerados`), mas
-- esta chega de fábrica com RLS ligada num Supabase — e é por isso que ninguém nunca escreveu a
-- linha. Num `postgres:17` cru a tabela nasce com RLS DESLIGADA.
--
-- O que aconteceria sem esta linha: as 8 policies de `0021`/`0031` seriam criadas normalmente e
-- ficariam INERTES (RLS desligada = quem tem privilégio de tabela lê tudo). As asserções 6a..6f
-- de `papeis_rls.sql`, que medem justamente que um operador NÃO alcança o objeto de filial
-- alheia, passariam a medir nada — e passariam VERDE. Seria o pior desfecho possível desta fase:
-- o job novo concordando com o antigo por acidente, num ambiente que não é o de produção.
alter table storage.objects enable row level security;
