-- =============================================================================
-- bootstrap-roles.sql — as três roles do Supabase, num Postgres cru (F46, 06/09/2026)
-- =============================================================================
-- Este arquivo é a PRIMEIRA metade da resposta à pergunta "o que o `supabase start` dava de
-- graça?". O job `banco-sem-docker` sobe um `postgres:17` oficial, que não conhece Supabase
-- nenhum, e precisa das roles ANTES de qualquer `grant … to authenticated` das migrations.
--
-- ⚠ O ALVO É REPRODUZIR O QUE O `supabase start` ENTREGA — NEM MAIS, NEM MENOS.
-- "Nem menos" é óbvio: falta de privilégio quebra o job. "Nem mais" é a armadilha que engana,
-- e ela tem nome no `docs/RUNBOOK-BANCO.md` e no próprio `supabase/tests/papeis_rls.sql`:
-- um privilégio a mais faz roteiro passar POR MOTIVO ERRADO e mascara REVOKE futuro. A prova de
-- que o recorte está certo não é este arquivo parecer razoável — é o job novo chegar ao MESMO
-- veredito do job antigo, no MESMO commit (critério 5 da ordem da F46).
--
-- ⚠ E POR ISSO NÃO HÁ NENHUM `grant` EM `public` AQUI. A tentação é grande e está errada.
-- Quem já respondeu isso por escrito foi o próprio roteiro, em `supabase/tests/papeis_rls.sql`:
--
--     "…que o job `banco` do CI sobe com `supabase start` **não** reproduz esses defaults,
--      então lá `authenticated` não tem nem SELECT em `public.ativos`."
--
-- Ou seja: o job ANTIGO também não tem os *default privileges* de um Supabase hospedado, e os
-- roteiros já se blindam plantando os próprios `grant` explícitos — tabela por tabela, verbo por
-- verbo, com o comentário dizendo qual asserção usa cada um. O mesmo roteiro PROÍBE por escrito o
-- atalho `grant … on all tables`, porque ele devolveria dentro da transação um privilégio que uma
-- fase futura tenha revogado, e as asserções seguiriam verdes.
--
-- Conceder aqui seria, portanto, DIVERGIR do job antigo na direção mais perigosa: verde por um
-- ambiente mais permissivo que produção.
--
-- FONTE DAS DEFINIÇÕES (regra 6 do CLAUDE.md — conferir a documentação vigente, não a memória):
-- `supabase/postgres`, migrations/db/init-scripts/00000000000000-initial-schema.sql, que cria as
-- três roles exatamente como abaixo — `nologin noinherit`, e `bypassrls` só na service_role.
-- =============================================================================

-- `nologin`: ninguém conecta COMO elas. O PostgREST conecta como `authenticator` e faz
-- `set role`; os roteiros fazem `set local role authenticated` a partir da sessão `postgres`.
-- `noinherit`: um membro não ganha os privilégios delas sem `set role` explícito.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  -- `bypassrls` não é detalhe: 12 comentários das migrations (0040, 0081…) e o desenho do
  -- visualizador por senha dependem de a service_role IGNORAR RLS. Sem esta flag, um roteiro que
  -- faça `set local role service_role` (dev_destrutivo.sql, 3 pontos) mediria outra coisa.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- A sessão que aplica as migrations é `postgres`. Para poder fazer `set local role authenticated`
-- (o que os roteiros fazem) ela precisa ser MEMBRO das três. Num Supabase hospedado isso já é
-- assim; num postgres:17 cru, não.
grant anon, authenticated, service_role to postgres;

-- ⚠ NADA de `grant … on schema public` aqui, e nada de `alter default privileges`.
--
-- Desde o Postgres 15, `public` concede USAGE a PUBLIC e NÃO concede mais CREATE — que é
-- exatamente o que se quer: `anon`/`authenticated` conseguem RESOLVER nomes em `public` (senão
-- nem a policy compilaria), mas não criam nada, e não ganham privilégio nenhum de tabela.
-- Privilégio de TABELA em `public` é assunto das migrations (que dão os poucos explícitos) e dos
-- roteiros (que plantam os seus). Ver o cabeçalho.
