-- =============================================================================
-- bootstrap-auth.sql — o recorte MÍNIMO do schema `auth` (F46, 06/09/2026)
-- =============================================================================
-- O que o GoTrue (o serviço de Auth do Supabase) cria e um `postgres:17` cru não tem. Só o que
-- as 126 migrations e os 25 roteiros REALMENTE tocam — cada bloco abaixo diz a linha do
-- repositório que o exige, e nada entrou aqui "por precaução".
--
-- ⚠ NÃO é uma reimplementação do GoTrue. Não há `identities`, `mfa_factors`, `audit_log_entries`,
-- `flow_state`, índices de e-mail, nem constraint de unicidade de e-mail — nada disso é lido por
-- este repositório. Reproduzir o schema inteiro seria copiar código de terceiro que ninguém aqui
-- consegue manter atualizado, e faria o bootstrap mentir sobre o que é exigência real.
--
-- ⚠ O QUE NÃO ESTÁ AQUI, DE PROPÓSITO: o trigger `trg_on_auth_user_created`. Quem o cria é a
-- migration `0001_profiles.sql:34-36`, e é ela que tem de continuar criando — o bootstrap prepara
-- o TERRENO, as migrations continuam sendo a fonte da verdade do schema (CLAUDE.md · Convenções).
-- =============================================================================

create schema if not exists auth;

-- USAGE no schema: sem isto, `authenticated` não consegue nem CHAMAR `auth.uid()`, e toda policy
-- `using (id = auth.uid())` falha em tempo de execução para quem fizer `set local role`.
grant usage on schema auth to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- auth.users
-- ---------------------------------------------------------------------------
-- Exigida por:
--  · 0001_profiles.sql:9   — `profiles.id uuid primary key references auth.users (id)`
--  · 0001_profiles.sql:35  — `create trigger … after insert on auth.users`
--  · 0001_profiles.sql:31  — o corpo do trigger lê `new.raw_user_meta_data ->> 'nome'`
--  · 0041_dominios_login.sql:25-45 — o mesmo corpo, com os 3 domínios
--  · 0057_perfil_nome_sobrenome.sql — lê também `->> 'sobrenome'`
--  · 0076/0077/0085/0095/0098/0110/0127 — `left join auth.users u on u.id = p.id` (checagens
--    de integridade: perfil órfão e conta sem perfil)
--
-- As colunas de "cadastro" (instance_id, aud, role, encrypted_password, email_confirmed_at) não
-- são lidas por nenhuma migration: elas existem porque QUEM INSERE são os roteiros e o runner —
-- `scripts/db/rodar-roteiros.sh:74-82` cria o operador `ci@wap.ind.br` com exatamente estas 9
-- colunas, e 10 roteiros fazem o mesmo (cargo_dev.sql:133, dominios_login.sql:53,
-- conflito_filiais.sql:121, dev_destrutivo.sql:196, f36_detentor.sql:77,
-- f37_colaboradores_tipos.sql:103, f38_itens_com_ativo.sql:132, f41_regularizacao.sql:117,
-- reabrir_pendencia_item.sql:64, transferencia_item.sql:94). Tirar qualquer uma quebra o insert.
create table if not exists auth.users (
  instance_id        uuid,
  id                 uuid        not null primary key,
  aud                varchar(255),
  role               varchar(255),
  email              varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb,
  created_at         timestamptz,
  updated_at         timestamptz
);

-- ---------------------------------------------------------------------------
-- auth.sessions e auth.refresh_tokens
-- ---------------------------------------------------------------------------
-- Exigidas por `0074_rpcs_gestao_usuarios.sql:378`:
--     delete from auth.sessions where user_id = p_alvo;
-- dentro de `encerrar_sessoes_usuario`, que `cargo_dev.sql:525` chama (e aceita 0 sessões como
-- resultado válido). A tabela e a coluna precisam EXISTIR ou o `delete` erra no parse.
create table if not exists auth.sessions (
  id         uuid not null primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz,
  updated_at timestamptz
);

-- ⚠ A FK COM CASCADE NÃO É DECORAÇÃO. O comentário da própria `0074` promete, por escrito, que
-- "os refresh tokens caem por cascade (auth.refresh_tokens.session_id → auth.sessions)". Sem a
-- FK aqui, a RPC continuaria rodando e devolvendo o número certo — e a promessa impressa na
-- documentação seria falsa sem nada acusar. O bootstrap existe para reproduzir o ambiente, e o
-- cascade faz parte do ambiente.
create table if not exists auth.refresh_tokens (
  id         bigint generated always as identity primary key,
  session_id uuid references auth.sessions (id) on delete cascade,
  user_id    uuid,
  token      varchar(255),
  revoked    boolean,
  created_at timestamptz,
  updated_at timestamptz
);

-- ---------------------------------------------------------------------------
-- auth.uid()
-- ---------------------------------------------------------------------------
-- 90 usos entre migrations e roteiros — é a função mais carregada do repositório: policies de
-- RLS (`0001:50`, `0059` e a doutrina `(select auth.uid())`) e a autoria de ~20 RPCs
-- (`coalesce(auth.uid(), p_criado_por)`).
--
-- ⚠ CORPO COPIADO DA FONTE OFICIAL, não escrito de memória (regra 6 do CLAUDE.md):
-- `supabase/auth`, migrations/20211202183645_update_auth_uid.up.sql. As duas metades do
-- `coalesce` importam: os roteiros montam `request.jwt.claims` como JSON
-- (`set_config('request.jwt.claims', json_build_object('sub', …)::text, true)`, em
-- papeis_rls.sql:19-22 e outros 9 arquivos), que é o SEGUNDO ramo; o primeiro
-- (`request.jwt.claim.sub`) é a forma antiga que o PostgREST ainda pode mandar.
--
-- `stable`, não `immutable`: o valor muda com a sessão. `current_setting(…, true)` com o segundo
-- argumento `true` devolve NULL em vez de erro quando o GUC nunca foi definido — é o que faz
-- `auth.uid()` valer NULL numa sessão sem JWT (o caso do `postgres` e do service role, do qual
-- dependem o `e_dev()` e o comentário de `src/lib/queries/dev.ts`).
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

-- EXECUTE em função já é concedido a PUBLIC por padrão no Postgres; o `grant` explícito existe
-- para o arquivo dizer o que quer, e para sobreviver a um `revoke … from public` futuro.
grant execute on function auth.uid() to anon, authenticated, service_role;
