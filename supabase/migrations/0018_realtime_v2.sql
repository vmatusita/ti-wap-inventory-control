-- Migration 0018 — Realtime v2 (F3B / plano §6.4). A publication do Supabase
-- Realtime ganha `lancamentos_item` e `anotacoes`, para o relatório AO VIVO do
-- operador reagir a lançamentos de quantidade e anotações (router.refresh, ≤5s).
-- Sessões por senha NÃO usam Realtime (auto-refresh periódico inalterado).
-- Idempotente, no padrão da 0009. Aplicar no projeto de DESENVOLVIMENTO.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lancamentos_item'
  ) then
    alter publication supabase_realtime add table public.lancamentos_item;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'anotacoes'
  ) then
    alter publication supabase_realtime add table public.anotacoes;
  end if;
end $$;
