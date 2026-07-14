-- Migration 0017 — ANOTAÇÕES na linha do tempo do ativo (F3B / plano §6.3).
-- Nota avulsa, imutável, com autor + data. É onde vive o "texto vermelho" que
-- muda no meio de uma manutenção sem transição de estado ("aguardando NF-e",
-- "cotação efetuada em dd/mm"). Aparece intercalada na ficha do ativo e na seção
-- de manutenção do relatório. Sem máquina de estados. Aditiva. Aplicar no DEV.
create table public.anotacoes (
  id         uuid primary key default gen_random_uuid(),
  ativo_id   uuid not null references public.ativos (id),
  texto      text not null,
  criado_por uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint anotacao_texto_len check (char_length(btrim(texto)) between 1 and 2000)
);

create index anotacoes_ativo_idx on public.anotacoes (ativo_id, created_at desc);

-- RLS: operador logado lê e INSERE; ninguém edita/apaga (imutável — sem policy
-- de update/delete). anon: nada.
alter table public.anotacoes enable row level security;
create policy "leitura operador" on public.anotacoes for select to authenticated using (true);
create policy "operador anota"   on public.anotacoes for insert to authenticated with check (true);
