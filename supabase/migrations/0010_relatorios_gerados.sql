-- Migration 0010 — snapshots do relatório da semana (spec §7.1 / OS-F3 3.8.1).
-- Cópia da seção "RELATÓRIOS GERADOS" do supabase/schema.sql. Tabela IMUTÁVEL:
-- regerar o mesmo (período, filial) cria uma versão nova; não há update/delete.
-- `dados` guarda o snapshot congelado (KPIs, séries, listas, resumo) em jsonb.
-- Aplicar no projeto de DESENVOLVIMENTO.

create table public.relatorios_gerados (
  id          uuid primary key default gen_random_uuid(),
  periodo_de  date not null,
  periodo_ate date not null,
  filial_id   smallint references public.filiais (id),  -- null = consolidado (geral)
  versao      smallint not null default 1,
  dados       jsonb not null,      -- snapshot congelado (KPIs, séries, listas, resumo)
  gerado_por  uuid not null references public.profiles (id),
  gerado_em   timestamptz not null default now(),
  unique (periodo_de, periodo_ate, filial_id, versao)
);

create index rel_gerados_periodo_idx on public.relatorios_gerados (periodo_de desc, filial_id);

alter table public.relatorios_gerados enable row level security;
create policy "leitura operador" on public.relatorios_gerados for select to authenticated using (true);
create policy "operador gera"    on public.relatorios_gerados for insert to authenticated with check (true);
-- Imutável: sem policy de update/delete — regerar o período cria versão nova.
