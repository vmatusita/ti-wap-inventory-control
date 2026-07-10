-- Migration 0005 — RLS (nivel unico).
-- Modelo (decisao 09/07/2026): logado (@wap.ind.br) = OPERADOR, nivel unico —
-- le e escreve tudo. `anon`: nada. O visualizador de relatorio nao tem
-- credencial de banco: entra por senha (camada da aplicacao — cookie assinado,
-- queries no servidor — F3). Movimentacao: imutavel (insert-only).
-- `profiles` NAO entra aqui (RLS e policies ja na 0001). NAO existe is_admin/roles.
-- Aplicar no projeto de DESENVOLVIMENTO.

alter table public.filiais       enable row level security;
alter table public.motivos       enable row level security;
alter table public.ativos        enable row level security;
alter table public.movimentacoes enable row level security;
alter table public.senhas_acesso enable row level security;

-- Leitura: qualquer operador logado
create policy "leitura operador" on public.filiais       for select to authenticated using (true);
create policy "leitura operador" on public.motivos       for select to authenticated using (true);
create policy "leitura operador" on public.ativos        for select to authenticated using (true);
create policy "leitura operador" on public.movimentacoes for select to authenticated using (true);
create policy "leitura operador" on public.senhas_acesso for select to authenticated using (true);

-- Escrita: qualquer operador logado (nivel unico)
create policy "operador escreve" on public.filiais for all to authenticated
  using (true) with check (true);
create policy "operador escreve" on public.motivos for all to authenticated
  using (true) with check (true);
create policy "operador escreve" on public.ativos for all to authenticated
  using (true) with check (true);
create policy "operador gerencia senhas" on public.senhas_acesso for all to authenticated
  using (true) with check (true);

-- Movimentacoes: operador INSERE; ninguem edita/apaga (imutaveis — sem policy de update/delete)
create policy "operador insere" on public.movimentacoes for insert to authenticated
  with check (true);
