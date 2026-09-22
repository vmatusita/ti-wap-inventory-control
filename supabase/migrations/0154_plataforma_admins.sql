-- =============================================================================
-- 0154_plataforma_admins.sql — F62 (22/09/2026): quem opera a PLATAFORMA, declarado
-- =============================================================================
-- classe: ADITIVA (tabela nova + a cópia das memberships dev; nenhuma linha existente muda)
--
-- O cargo `dev` já é, na prática, "operador da plataforma": alcança todas as filiais,
-- apaga conta, troca e-mail, abre a Zona destrutiva. Com uma empresa isso não precisava de
-- nome; com várias, precisa — a conta que opera o sistema não é cargo de NENHUMA empresa.
-- Esta migration só DECLARA isso: a tabela, a cópia das contas dev de hoje e a função que
-- responde "o chamador é da plataforma?". **Ninguém a consome nesta fase** (decisão ii do
-- Johnny, 22/09/2026): as contas dev continuam em `membros` com papel `'dev'`, a trava do
-- último administrador continua contando o dev (`cargo_dev.sql` 5d), e tirar a conta de
-- plataforma de `membros` — com `e_dev()` passando a `e_plataforma()` ou dev-da-empresa —
-- é decisão da F67, em ata.
--
-- 1. `public.plataforma_admins (profile_id)` — RLS ligada, SEM `force`, ZERO policy
--    (`k_sem_select`: só `e_plataforma()`, definer, lê); privilégios padrão revogados de
--    `anon` e `authenticated`. INFRA no catálogo.
--    ⚠ DECLARADO: é a FOTOGRAFIA das contas dev neste apply. Conceder ou revogar dev depois
--    NÃO a mexe — mantê-la em sincronia seria dupla escrita do mesmo fato (regra 2 da §4).
--    Enquanto `e_plataforma()` não tiver consumidor, a deriva é inerte; a F67 decide a fonte.
-- 2. A cópia: toda membership `'dev'` da empresa legada (as duas contas dev de produção;
--    nenhuma no ensaio, que não tem dev — fato 3).
-- 3. `public.e_plataforma()` — SEM parâmetro (responde só sobre o PRÓPRIO chamador: não há
--    o que vazar), `sql stable security definer set search_path = ''`. Devolve `true` só se
--    o chamador tem linha aqui, o perfil não está arquivado e a membership na empresa
--    legada está ATIVA — ou seja, FALSO NOS MESMOS QUATRO CASOS em que `papel_atual()` é
--    NULL (sem sessão, sem perfil, desativado, arquivado). Nunca NULL (`exists`).
--    `revoke … public, anon, service_role` + `grant authenticated` (a F52: nasça fechada).
--
-- ROLLBACK, em prosa (docs/PLAN-F62.md §5.1, passo 6; rodável em
-- supabase/rollback/F62-2-desfaz.sql, bloco 0154): derrubar a função `e_plataforma()` e a
-- tabela `plataforma_admins`. Nada lê nenhuma das duas.
-- =============================================================================

create table public.plataforma_admins (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.plataforma_admins is
  'F62 (0154): as contas que operam a PLATAFORMA (hoje: as contas dev, copiadas no apply). Fotografia — conceder/revogar dev depois NÃO a mexe; sem consumidor até a F67. RLS ligada, sem force, sem policy: só e_plataforma() (definer) lê. INFRA no catálogo.';

insert into public.plataforma_admins (profile_id)
select m.profile_id
  from public.membros m
 where m.empresa_id = public.empresa_legada()
   and m.papel = 'dev';

alter table public.plataforma_admins enable row level security;
revoke all on table public.plataforma_admins from anon, authenticated;

create function public.e_plataforma()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.plataforma_admins pa
      join public.profiles p on p.id = pa.profile_id
      join public.membros m
        on m.profile_id = pa.profile_id
       and m.empresa_id = public.empresa_legada()
     where pa.profile_id = (select auth.uid())
       and p.excluido_em is null
       and m.ativo
  )
$$;

comment on function public.e_plataforma() is
  'F62 (0154): o chamador opera a PLATAFORMA? Sem parâmetro — responde só sobre o próprio chamador. true só com linha em plataforma_admins, perfil não arquivado e membership ativa na empresa legada; false nos mesmos quatro casos em que papel_atual() é NULL (sem sessão, sem perfil, desativado, arquivado). SEM CONSUMIDOR nesta fase (decisão ii): a F67 decide se e_dev() passa a ela.';

revoke all on function public.e_plataforma() from public, anon, service_role;
grant execute on function public.e_plataforma() to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só contagens) ----------
--   select (select count(*) from public.plataforma_admins) as plataforma,
--          (select count(*) from public.membros where papel = 'dev') as devs;
--   esperado: plataforma = devs (2 em produção, 0 no ensaio).
--   select p.prosecdef, p.proconfig, p.pronargs,
--          has_function_privilege('anon', p.oid, 'execute') as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth,
--          has_function_privilege('service_role', p.oid, 'execute') as svc
--     from pg_proc p where p.oid = 'public.e_plataforma()'::regprocedure;
--   esperado: t · {search_path=""} · 0 · f · t · f.
