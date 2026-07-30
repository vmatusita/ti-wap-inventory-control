-- Migration 0077 — F22: as duas leituras privilegiadas da área /dev.
--
-- Depende da 0072 (`e_dev()`) e da 0073 (`profiles.excluido_em`).
-- Contexto: docs/prompts/F22-cargo-dev-ultracode.md §4 (Diagnóstico e Integridade).
--
-- POR QUE PRECISAM SER RPC. As duas leem coisas que o PostgREST não alcança: o schema
-- `supabase_migrations` (fora dos schemas expostos) e joins entre `public`, `auth.users` e
-- `storage.objects`. Nenhuma delas é expressável como query do client.
--
-- ⚠⚠ O QUE ESTA MIGRATION DELIBERADAMENTE **NÃO** CRIA: uma função que receba SQL como
-- parâmetro. A primeira versão do código da /dev chamava `dev_checagem(p_sql text)`, com a
-- consulta vindo de uma lista fechada no TypeScript. Isso é execução de SQL ARBITRÁRIO com os
-- privilégios do dono da função: "o app só manda da lista" não protege nada, porque quem tem
-- o cargo dev fala com a API direto e manda o que quiser — o cargo viraria superusuário do
-- banco, e a proibição de console de SQL do §"Fora" da ordem seria letra morta. Por isso o SQL
-- das checagens está AQUI, fixo, e a função não aceita nenhum texto de consulta.
--
-- ⚠ AMBAS SÃO SÓ-LEITURA E NÃO CORRIGEM NADA. `stable`, sem um único INSERT/UPDATE/DELETE.
-- Diagnóstico que conserta sozinho é como se perde a confiança no diagnóstico.
--
-- GUARDA INTERNA `e_dev()` nas duas: são `security definer` (leem `auth`/`storage`/
-- `supabase_migrations`), portanto passam por fora do RLS e precisam decidir a autorização
-- por dentro — mesmo padrão de `importar_ativos_substituir` (0064).
--
-- ADITIVA: só cria funções. Caminho **A** do docs/RUNBOOK-BANCO.md.
-- REVERSÃO: `drop function public.dev_checagens_integridade(), public.ultima_migracao_aplicada();`

-- ---------------------------------------------------------------------------
-- 1) ultima_migracao_aplicada() — a versão registrada no banco
-- ---------------------------------------------------------------------------
-- Serve para a /dev comparar o banco com a última migration do repositório e dizer se o
-- deploy e o schema estão em dia. `supabase_migrations.schema_migrations` é a tabela que a
-- CLI e o MCP alimentam a cada apply.
create or replace function public.ultima_migracao_aplicada()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text;
begin
  if not public.e_dev() then
    raise exception 'Esta consulta é restrita ao cargo Desenvolvedor.' using errcode = '42501';
  end if;
  select max(version) into v from supabase_migrations.schema_migrations;
  return v;
exception
  -- Banco onde a tabela de controle não existe (um Postgres cru do CI, por exemplo): a tela
  -- mostra "indisponível" em vez de quebrar.
  when undefined_table then return null;
end;
$$;

comment on function public.ultima_migracao_aplicada() is
  'F22 (/dev): a maior `version` de supabase_migrations.schema_migrations, para a tela comparar o banco com a última migration do repositório. Só leitura, restrita ao cargo dev. Devolve NULL se a tabela de controle não existir.';

revoke all on function public.ultima_migracao_aplicada() from public, anon;
grant execute on function public.ultima_migracao_aplicada() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) dev_checagens_integridade() — as sete checagens, fixas
-- ---------------------------------------------------------------------------
-- Devolve uma linha por checagem: { chave, total, amostra[] }. A `chave` é o que casa com a
-- lista de rótulos em src/lib/queries/dev.ts — chave nova aqui sem rótulo lá (ou o contrário)
-- aparece na tela como "não encontrada", em vez de sumir em silêncio.
--
-- ⚠ TODAS AS SETE FORAM MEDIDAS CONTRA A PRODUÇÃO EM 30/07/2026 E DEVOLVERAM ZERO. É isso que
-- dá significado a um número diferente de zero. Uma oitava candidata — "o status do ativo
-- diverge da última movimentação" — foi DESCARTADA por acusar 1009 de 1231 ativos: é artefato
-- da ordenação da compra de abertura do import (a baseline tem `created_at` posterior à
-- história que precede em `data`), não inconsistência. Ver docs/DECISOES.md (30/07/2026).
--
-- A amostra é limitada a 5 identificadores por checagem: a /dev aponta ONDE olhar, não
-- substitui a consulta. `patrimonio` e `arquivo_path` não são dado sensível de pessoa.
create or replace function public.dev_checagens_integridade()
returns table (chave text, total bigint, amostra text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.e_dev() then
    raise exception 'Esta consulta é restrita ao cargo Desenvolvedor.' using errcode = '42501';
  end if;

  -- 1. par patrimônio + service tag repetido
  return query
  with d as (
    select a.patrimonio || ' / ' || coalesce(a.service_tag, '—') as item
      from public.ativos a
     where a.patrimonio is not null
     group by a.patrimonio, a.service_tag
    having count(*) > 1
  )
  select 'patrimonio_duplicado'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 2. ativo em filial desativada
  return query
  with d as (
    select a.patrimonio as item
      from public.ativos a join public.filiais f on f.id = a.filial_id
     where not f.ativo
  )
  select 'ativo_filial_inativa'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 3. termo registrado sem o .docx no bucket
  return query
  with d as (
    select t.arquivo_path as item
      from public.termos_gerados t
      left join storage.objects o on o.bucket_id = 'termos' and o.name = t.arquivo_path
     where o.id is null
  )
  select 'termo_sem_arquivo'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 4. perfil vivo sem conta no Auth (conta removida por fora do app)
  return query
  with d as (
    select p.id::text as item
      from public.profiles p left join auth.users u on u.id = p.id
     where u.id is null and p.excluido_em is null
  )
  select 'perfil_sem_conta'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 5. conta no Auth sem perfil (o trigger handle_new_user falhou)
  return query
  with d as (
    select u.id::text as item
      from auth.users u left join public.profiles p on p.id = u.id
     where p.id is null
  )
  select 'conta_sem_perfil'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 6. pendência de item aberta cuja movimentação de origem foi estornada
  return query
  with d as (
    select pi.id::text as item
      from public.pendencias_item pi
      join public.movimentacoes m on m.id = pi.movimentacao_id
     where pi.resolvida_em is null
       and exists (select 1 from public.movimentacoes e where e.estorno_de = m.id)
  )
  select 'pendencia_de_estornada'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 7. operador ativo sem nenhuma filial de escrita (entra e não registra nada)
  return query
  with d as (
    select p.id::text as item
      from public.profiles p
     where p.papel = 'operador' and p.ativo and p.excluido_em is null
       and not exists (select 1 from public.operador_filiais v where v.usuario_id = p.id)
  )
  select 'operador_sem_filial'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;
end;
$$;

comment on function public.dev_checagens_integridade() is
  'F22 (/dev): sete checagens de integridade SÓ-LEITURA, com contagem e amostra de até 5 identificadores cada. NÃO corrige nada. Restrita ao cargo dev. O SQL é FIXO aqui de propósito: uma função que recebesse a consulta por parâmetro seria execução de SQL arbitrário com os privilégios do dono, que é o console de SQL que a ordem F22 proíbe na /dev.';

revoke all on function public.dev_checagens_integridade() from public, anon;
grant execute on function public.dev_checagens_integridade() to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- as duas existem, definer, stable, sem execute para anon:
--   select p.proname, p.prosecdef as definer, p.provolatile as vol,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('ultima_migracao_aplicada','dev_checagens_integridade');
--   -- esperado: 2 linhas · definer = true · vol = 's' · anon = false · auth = true
--
--   -- rodando como service role (auth.uid() é NULL → e_dev() false), as duas RECUSAM:
--   select public.dev_checagens_integridade();
--   -- esperado: ERRO 42501 'Esta consulta é restrita ao cargo Desenvolvedor.'
--
--   -- e NENHUMA delas escreve (nenhum verbo de escrita no corpo):
--   select p.proname,
--          pg_get_functiondef(p.oid) ~* '(insert into|update |delete from)' as escreve
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('ultima_migracao_aplicada','dev_checagens_integridade');
--   -- esperado: escreve = false nas duas
