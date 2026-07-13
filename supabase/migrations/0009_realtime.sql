-- Migration 0009 — habilita Supabase Realtime para `movimentacoes` (OS-F3 3.4).
-- A página de relatório AO VIVO (operador logado) assina os INSERTs em
-- `movimentacoes` e dispara `router.refresh()` — os números atualizam sem F5.
-- Só INSERT é assinado; a replica identity default (chave primária) basta para
-- o payload de INSERT. Sessões por senha NÃO usam Realtime (não têm credencial
-- de banco) — para elas a revalidação é periódica (tarefa 3.9.5).
--
-- Idempotente: cria a publication se faltar e só adiciona a tabela se ainda não
-- estiver publicada. Aplicar no projeto de DESENVOLVIMENTO.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'movimentacoes'
  ) then
    alter publication supabase_realtime add table public.movimentacoes;
  end if;
end $$;
