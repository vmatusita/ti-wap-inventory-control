-- =============================================================================
-- 0157_funcoes_de_conjunto.sql — F62 (22/09/2026): as quatro funções de conjunto, na forma-alvo
-- =============================================================================
-- classe: ADITIVA (só cria funções; ninguém as consome nesta fase — a F66 consome)
--
-- A doutrina do predicado (emenda F59 da docs/MATRIZ-REGRAS.md, R-ACC-63 a R-ACC-72) fixou
-- a FORMA do recorte por empresa ANTES de ele existir: a policy pergunta "em que empresas o
-- chamador tem a capacidade?" a uma função SEM parâmetro que devolve CONJUNTO, consumida
-- içada — `empresa_id = any (array (select public.empresas_do_membro()))` —, avaliada UMA
-- vez por statement. Esta migration cria as quatro, copiadas da forma-alvo
-- (`MATRIZ-REGRAS.md`, "A forma-alvo, para copiar (F62 cria; F66 consome)"): R-ACC-68 — "a
-- F62 herda ESTA, não a da ficha".
--
--   `returns setof uuid` (nunca `uuid[]` — R-ACC-67: no vazio e no NULL o array ERRA),
--   `returns table (empresa_id uuid, filial_id smallint)` para os PARES,
--   `language sql stable security definer set search_path = ''`, tudo qualificado,
--   `auth.uid()` içado dentro, `revoke execute … from public, anon` + `grant execute … to
--   authenticated` (o grant par do revoke: sem ele o revoke de `public` tira o EXECUTE de
--   `authenticated` também).
--
-- POR QUE `security definer`: a policy de `membros` (0153) usa o piso de `papel_atual()`, e a
-- F66 fará as policies chamarem estas quatro, que leem `membros`. Se fossem `invoker`, a RLS
-- de `membros` valeria dentro delas e o Postgres abortaria com 42P17 (recursão). E por isso
-- NENHUMA tabela da virada usa `force row level security` (R-ACC-72, `4-bis` do catálogo).
--
-- OS NOMES DESTA FASE (a MATRIZ fixa a forma; "a F62 confirma os nomes de coluna"):
--   · o vínculo do operador é pela MEMBERSHIP (0156): `o.membro_id = m.id and
--     o.empresa_id = m.empresa_id`, e não mais `o.usuario_id = m.profile_id`;
--   · as quatro exigem também o perfil NÃO ARQUIVADO (`profiles.excluido_em is null`): a
--     conta apagada não é membro de nada — os mesmos quatro casos em que `papel_atual()` é
--     NULL (sem sessão, sem perfil, membership inativa, conta arquivada). Com a membership
--     desativada pelo `apagar_usuario` (0158), a condição é redundante no caminho oficial;
--     ela fecha o estado híbrido que um UPDATE manual produziria.
--
-- Fora de `definer_sem_tenant.sql` (sem parâmetro); em `k_secdef` (`catalogo_secdef.sql`).
-- Os cenários A↔B que as provam nas duas direções: `supabase/tests/isolamento_tenant.sql`.
--
-- ROLLBACK, em prosa (docs/PLAN-F62.md §5.1, passo 3; rodável em
-- supabase/rollback/F62-2-desfaz.sql, bloco 0157): derrubar as quatro funções. Nada as usa.
-- =============================================================================

-- recorte de LEITURA: as empresas em que o chamador é membro ativo
create function public.empresas_do_membro()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.empresa_id
    from public.membros m
    join public.profiles p on p.id = m.profile_id
   where m.profile_id = (select auth.uid())
     and m.ativo
     and p.excluido_em is null
$$;
revoke execute on function public.empresas_do_membro() from public, anon;
grant execute on function public.empresas_do_membro() to authenticated;

-- escrita no nível de EMPRESA
create function public.empresas_de_escrita()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.empresa_id
    from public.membros m
    join public.profiles p on p.id = m.profile_id
   where m.profile_id = (select auth.uid())
     and m.ativo
     and p.excluido_em is null
     and m.papel in ('dev', 'admin', 'operador')
$$;
revoke execute on function public.empresas_de_escrita() from public, anon;
grant execute on function public.empresas_de_escrita() to authenticated;

-- capacidade ADMINISTRATIVA
create function public.empresas_de_admin()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.empresa_id
    from public.membros m
    join public.profiles p on p.id = m.profile_id
   where m.profile_id = (select auth.uid())
     and m.ativo
     and p.excluido_em is null
     and m.papel in ('dev', 'admin')
$$;
revoke execute on function public.empresas_de_admin() from public, anon;
grant execute on function public.empresas_de_admin() to authenticated;

-- escrita no nível de UNIDADE: pares (empresa, filial)
create function public.unidades_de_escrita()
returns table (empresa_id uuid, filial_id smallint)
language sql stable security definer
set search_path = ''
as $$
  select f.empresa_id, f.id
    from public.membros m
    join public.profiles p on p.id = m.profile_id
    join public.filiais f on f.empresa_id = m.empresa_id
   where m.profile_id = (select auth.uid()) and m.ativo and p.excluido_em is null
     and m.papel in ('dev', 'admin')
  union
  select f.empresa_id, f.id
    from public.membros m
    join public.profiles p on p.id = m.profile_id
    join public.operador_filiais o on o.membro_id = m.id and o.empresa_id = m.empresa_id
    join public.filiais f on f.id = o.filial_id and f.empresa_id = m.empresa_id
   where m.profile_id = (select auth.uid()) and m.ativo and p.excluido_em is null
     and m.papel = 'operador'
$$;
revoke execute on function public.unidades_de_escrita() from public, anon;
grant execute on function public.unidades_de_escrita() to authenticated;

comment on function public.empresas_do_membro() is
  'F62 (0157): o recorte de LEITURA — as empresas em que o chamador é membro ATIVO (perfil não arquivado). Forma-alvo da MATRIZ (R-ACC-68): setof, sem parâmetro, definer, search_path vazio. Consumo içado: empresa_id = any (array (select public.empresas_do_membro())). Sem consumidor até a F66.';
comment on function public.empresas_de_escrita() is
  'F62 (0157): as empresas em que o chamador ESCREVE (dev, admin ou operador, ativo). Forma-alvo da MATRIZ. Sem consumidor até a F66.';
comment on function public.empresas_de_admin() is
  'F62 (0157): as empresas em que o chamador ADMINISTRA (dev ou admin, ativo). Forma-alvo da MATRIZ. Sem consumidor até a F66.';
comment on function public.unidades_de_escrita() is
  'F62 (0157): os PARES (empresa, filial) em que o chamador escreve — dev/admin em toda filial da própria empresa; operador nas vinculadas à SUA membership. Nunca par de filial de outra empresa. Consumo: (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u), em conjunção com empresas_de_escrita(). Sem consumidor até a F66.';

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   select p.proname, p.proretset, p.prosecdef, p.provolatile, p.proconfig, p.pronargs,
--          has_function_privilege('anon', p.oid, 'execute') as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('empresas_do_membro', 'empresas_de_escrita', 'empresas_de_admin', 'unidades_de_escrita')
--    order by 1;
--   esperado: 4 linhas · proretset = t · prosecdef = t · provolatile = s ·
--             proconfig = {search_path=""} · pronargs = 0 · anon = f · auth = t.
