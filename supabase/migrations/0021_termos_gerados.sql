-- Migration 0021 — termos gerados pelo sistema (OS-F5A / PLANO-TERMOS §7).
-- Cada termo grava o snapshot completo do merge (jsonb) NA TABELA e o .docx no
-- Storage (bucket privado `termos`). Versao UNICA por (tipo + conjunto de
-- movimentacoes): regerar SUBSTITUI (unique key + upsert do arquivo). RLS: so
-- operador autenticado; o visualizador por senha NAO acessa termos (coerente com
-- o item 5.5 da F5). Aplicar no projeto de DESENVOLVIMENTO.
-- Depende da 0020 (valor 'gerado' ja commitado) para recriar v_pendencias.

-- ---------- TABELA ----------
create table public.termos_gerados (
  id               uuid primary key default gen_random_uuid(),
  -- 7 modelos (5 responsabilidade + 2 devolucao). check em vez de enum: a lista
  -- e fechada no codigo (src/lib/termos) e raramente muda.
  tipo             text not null check (tipo in (
    'responsabilidade_notebook',
    'responsabilidade_desktop',
    'responsabilidade_celular',
    'responsabilidade_monitor_interno',
    'responsabilidade_monitor_homeoffice',
    'devolucao_equipamento',
    'devolucao_desligamento'
  )),
  movimentacao_ids uuid[] not null,          -- 1 (responsabilidade) ou 1..n (devolucao em lote)
  ativo_ids        uuid[] not null,
  colaborador      text,
  dados            jsonb not null,           -- payload completo do merge (inclui edicoes do dialog)
  arquivo_path     text not null,            -- caminho no bucket `termos` (sempre preenchido)
  gerado_por       uuid not null references public.profiles (id),
  created_at       timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  atualizado_por   uuid references public.profiles (id),
  -- Versao unica (§3.10): regerar o mesmo tipo p/ o mesmo conjunto de movimentacoes
  -- ATUALIZA a linha (a action ordena movimentacao_ids antes de gravar, tornando a
  -- igualdade de array deterministica).
  unique (tipo, movimentacao_ids)
);

create index termos_gerados_ativos_gin on public.termos_gerados using gin (ativo_ids);
create index termos_gerados_movs_gin   on public.termos_gerados using gin (movimentacao_ids);

alter table public.termos_gerados enable row level security;
-- Nivel unico: operador autenticado le e escreve tudo. Sem policy p/ anon: o
-- visualizador por senha (sem credencial de banco) nunca acessa.
create policy "leitura operador" on public.termos_gerados for select to authenticated using (true);
create policy "operador escreve" on public.termos_gerados for all to authenticated
  using (true) with check (true);

-- ---------- BUCKET DE STORAGE (privado) ----------
insert into storage.buckets (id, name, public)
values ('termos', 'termos', false)
on conflict (id) do nothing;

-- Policies do Storage: so operador autenticado, so no bucket `termos`. anon e o
-- cookie de visualizador (nao-autenticado no banco) ficam de fora.
create policy "termos leitura operador" on storage.objects for select to authenticated
  using (bucket_id = 'termos');
create policy "termos insere operador" on storage.objects for insert to authenticated
  with check (bucket_id = 'termos');
create policy "termos atualiza operador" on storage.objects for update to authenticated
  using (bucket_id = 'termos') with check (bucket_id = 'termos');
create policy "termos apaga operador" on storage.objects for delete to authenticated
  using (bucket_id = 'termos');

-- ---------- v_pendencias: 'gerado' TAMBEM conta como pendente ----------
-- A geracao do documento nao encerra a cobranca: so 'sim' (assinado) sai da lista.
create or replace view public.v_pendencias
with (security_invoker = true) as
select a.id, a.patrimonio, a.categoria, f.slug as filial, a.status,
       case
         when a.status = 'em_triagem'
              and a.updated_at < now() - interval '7 days' then 'triagem parada'
         when (a.termo_assinado in ('nao','enviado','gerado') or a.termo_assinado is null)
              and a.status in ('em_uso','emprestado')       then 'termo pendente'
         when a.pendencia is not null                        then a.pendencia
       end as pendencia
from public.ativos a
join public.filiais f on f.id = a.filial_id
where (a.status = 'em_triagem' and a.updated_at < now() - interval '7 days')
   or ((a.termo_assinado in ('nao','enviado','gerado') or a.termo_assinado is null)
       and a.status in ('em_uso','emprestado'))
   or a.pendencia is not null;
