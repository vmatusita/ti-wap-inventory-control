-- Migration 0001 — profiles + papeis (F0).
-- Espelha public.profiles de supabase/schema.sql. A partir daqui as migrations
-- mandam (o schema.sql passa a ser historico). Aplicar no projeto Supabase de
-- DESENVOLVIMENTO via `supabase db push`. NUNCA editar depois de aplicada.

-- ---------- TIPO ----------

create type public.user_role as enum ('admin', 'viewer');

-- ---------- TABELA ----------

-- Espelho de auth.users com papel. Criado por trigger no convite/signup.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text,
  role       public.user_role not null default 'viewer',
  created_at timestamptz not null default now()
);

-- ---------- TRIGGER: cria o profile no convite/signup ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', new.email));
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- HELPER ----------

-- O usuario logado e admin? (security definer p/ ler profiles sob RLS)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------- RLS ----------
-- select: proprio perfil (ou qualquer um, se admin) · update: so admin.

alter table public.profiles enable row level security;

create policy "perfil proprio ou admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "admin gerencia perfis" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
