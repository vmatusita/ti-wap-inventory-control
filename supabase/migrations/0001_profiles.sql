-- Migration 0001 — profiles (F0).
-- Nivel unico: todo logado e OPERADOR (@wap.ind.br); sem papeis/roles.
-- O visualizador de relatorio NAO tem conta (entra por senha de acesso — F3).
-- Espelha public.profiles de supabase/schema.sql. Aplicar no projeto de DEV.

-- ---------- TABELA ----------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text,
  created_at timestamptz not null default now()
);

-- ---------- TRIGGER: cria o profile e barra e-mail fora de @wap.ind.br ----------
-- Defesa no banco: mesmo que alguem contorne a UI, o login e restrito a
-- contas WAP (spec §3).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or new.email not ilike '%@wap.ind.br' then
    raise exception 'Login restrito a contas @wap.ind.br';
  end if;
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', new.email));
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- RLS ----------
-- Operador logado le todos os perfis; edita so o proprio. anon: nada.
-- O profile e criado pelo trigger (security definer), sem policy de insert.

alter table public.profiles enable row level security;

create policy "leitura operador" on public.profiles
  for select to authenticated
  using (true);

create policy "atualiza proprio perfil" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
