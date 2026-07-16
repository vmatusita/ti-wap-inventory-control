-- Migration 0031 — log de imports de startup + bucket de backup (OS-F7 / W2).
--
-- A F7 dá ao operador uma tela de "Substituir tudo" (import por CSV de startup,
-- por filial): a RPC importar_ativos_substituir (0032) apaga o acervo da filial e
-- recria a partir do plano validado. Duas peças de infraestrutura aqui:
--
--  (1) import_logs — trilha de auditoria: quem importou, qual filial, qual
--      arquivo (hash), quantas linhas, o que foi apagado/criado e onde ficou o
--      backup. Uma linha por execução BEM-SUCEDIDA (a RPC insere no fim, dentro
--      da mesma transação — se algo falha, rollback e não há log).
--
--  (2) bucket privado `backups-import` — a UI (W3) exporta o acervo da filial
--      ANTES de chamar a RPC e sobe o .json/.csv aqui; o caminho vai em
--      import_logs.backup_path (a RPC exige backup_path não-vazio — autoproteção,
--      CLAUDE.md "operação destrutiva → backup antes"). Espelha o padrão do bucket
--      privado `termos` (0021): só operador autenticado, nunca anon/visualizador.
--
-- Aditiva. Aplicar no projeto de DESENVOLVIMENTO.

-- ---------- TABELA import_logs ----------
-- filial_id: MESMO tipo de filiais.id (0003 → smallint generated always as identity).
-- modo: hoje só 'substituir' (único modo do import). check em vez de enum: lista
--       fechada no código, raramente muda (padrão dos termos/0021).
-- Contagens: fotografia do que a RPC apagou (movs/anotações/termos) e criou.
create table public.import_logs (
  id                 uuid primary key default gen_random_uuid(),
  filial_id          smallint not null references public.filiais (id),
  modo               text not null check (modo = 'substituir'),
  arquivo_hash       text not null,          -- hash do CSV (idempotência/rastreio)
  total_linhas       int not null,           -- linhas de dados do CSV (totalLinhasDados)
  ativos_criados     int not null,
  movs_apagadas      int not null,
  anotacoes_apagadas int not null,
  termos_apagados    int not null,
  backup_path        text not null,          -- caminho no bucket `backups-import`
  criado_por         uuid not null references public.profiles (id),
  created_at         timestamptz not null default now()
);

create index import_logs_filial_idx  on public.import_logs (filial_id, created_at desc);
create index import_logs_created_idx  on public.import_logs (created_at desc);

-- RLS: nível único (operador autenticado lê e escreve). O insert REAL acontece
-- dentro da RPC security definer (0032) — que roda como owner e ignora RLS —, mas
-- a policy de insert fica coerente para leituras/escritas diretas do operador.
-- Sem policy p/ anon: o visualizador por senha (sem credencial de banco) não vê.
alter table public.import_logs enable row level security;
create policy "leitura operador" on public.import_logs for select to authenticated using (true);
create policy "operador insere"  on public.import_logs for insert to authenticated with check (true);

-- ---------- BUCKET DE STORAGE (privado) `backups-import` ----------
-- Backups do acervo da filial exportados antes de cada "Substituir tudo".
insert into storage.buckets (id, name, public)
values ('backups-import', 'backups-import', false)
on conflict (id) do nothing;

-- Policies do Storage: só operador autenticado, só no bucket `backups-import`.
-- anon e o cookie de visualizador (não-autenticado no banco) ficam de fora —
-- mesmo desenho do bucket `termos` (0021).
create policy "backups-import leitura operador" on storage.objects for select to authenticated
  using (bucket_id = 'backups-import');
create policy "backups-import insere operador" on storage.objects for insert to authenticated
  with check (bucket_id = 'backups-import');
create policy "backups-import atualiza operador" on storage.objects for update to authenticated
  using (bucket_id = 'backups-import') with check (bucket_id = 'backups-import');
create policy "backups-import apaga operador" on storage.objects for delete to authenticated
  using (bucket_id = 'backups-import');
