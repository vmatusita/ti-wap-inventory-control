-- Migration 0062 — F21: as três funções de autorização que as policies chamam.
--
-- Contexto: docs/ADR-002-papeis-e-permissoes.md §4 (camada 1 — "a que vale").
-- Depende da 0061 (enum `papel_usuario`, `profiles.papel`/`ativo`, `operador_filiais`).
-- Quem USA estas funções são as policies da 0063 e as guardas internas das RPCs da 0064.
--
-- PADRÃO (0024/0038/0041): `security definer` + `stable` + `set search_path = public` +
-- `revoke all from public, anon`.
--
-- POR QUE `security definer`. Uma expressão de policy RLS é avaliada com os privilégios de
-- QUEM CONSULTA. Se estas funções fossem `invoker`, a leitura de `profiles`/`operador_filiais`
-- dentro delas passaria pela RLS daquelas tabelas — hoje aberta, mas se um dia alguém a
-- fechasse, as funções passariam a devolver NULL/false em silêncio e TODA escrita do sistema
-- morreria sem mensagem. `definer` desacopla a correção da autorização das policies de
-- leitura. Não há risco de recursão: `profiles` e `operador_filiais` não têm policy que
-- chame estas funções.
--
-- POR QUE `authenticated` MANTÉM O `execute` (e o advisor vai reclamar — de propósito).
-- Como a policy roda com os privilégios do consultante, `authenticated` PRECISA de EXECUTE
-- nestas três, senão toda query nas tabelas com policy nova falha com "permission denied for
-- function". Consequência conhecida e ACEITA: o lint
-- `authenticated_security_definer_function_executable` passa a apontar as três (hoje aponta
-- só `importar_ativos_substituir`, e pelo mesmo motivo — precedente aceito). É WARN de
-- função executável, NÃO de RLS, e é inócuo em substância: as três respondem exclusivamente
-- sobre o PRÓPRIO chamador (`auth.uid()`), não aceitam identidade como parâmetro e não
-- revelam nada de terceiros. `anon` e `public` ficam sem execute — o visualizador por senha
-- (que é `anon`) não tem o que fazer com elas.
--
-- ADITIVA: só cria funções. Não bate no gate. Caminho A do runbook (ensaio → produção).
-- REVERSÃO: `drop function public.pode_escrever_filial(smallint), public.e_admin(),
--            public.papel_atual();` (nesta ordem — há dependência entre elas).

-- ---------------------------------------------------------------------------
-- papel_atual() — o cargo de quem está pedindo, ou NULL
-- ---------------------------------------------------------------------------
-- NULL em três situações, todas equivalentes a "não autorizado a escrever":
--   · sem sessão (auth.uid() é NULL);
--   · com sessão mas sem linha em `profiles` (não deveria acontecer — o trigger
--     handle_new_user cria — mas se acontecer, fecha em vez de abrir);
--   · com perfil DESATIVADO (`ativo = false`).
-- É este último ramo que faz a desativação valer no REQUEST SEGUINTE: basta
-- `profiles.ativo = false` para que toda policy de escrita feche, mesmo com a sessão
-- Supabase ainda válida no navegador do usuário.
--
-- `(select auth.uid())` em vez de `auth.uid()` solto: doutrina initplan da 0059.
create or replace function public.papel_atual()
returns public.papel_usuario
language sql
stable
security definer
set search_path = public
as $$
  select p.papel
    from public.profiles p
   where p.id = (select auth.uid())
     and p.ativo
$$;

comment on function public.papel_atual() is
  'F21: cargo do usuário logado, ou NULL se não há sessão, não há perfil ou o perfil está DESATIVADO (ativo = false). É a porta única por onde papel e desativação entram na RLS — por isso a desativação vale no request seguinte.';

revoke all on function public.papel_atual() from public, anon;
grant execute on function public.papel_atual() to authenticated;

-- ---------------------------------------------------------------------------
-- e_admin() — atalho legível para o cargo mais forte
-- ---------------------------------------------------------------------------
-- `coalesce(..., false)` para devolver FALSE (e não NULL) quando não há papel. Numa policy
-- os dois negam igual, mas false é o que as guardas das RPCs (0064) e os testes esperam ler.
create or replace function public.e_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.papel_atual() = 'admin', false)
$$;

comment on function public.e_admin() is
  'F21: true se o usuário logado é ADMIN e está ativo. Usada nas policies de /admin (filiais, motivos, itens, kits_modelos, import_logs, eventos_admin) e na guarda interna da RPC de import.';

revoke all on function public.e_admin() from public, anon;
grant execute on function public.e_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- pode_escrever_filial(fid) — o predicado do vínculo
-- ---------------------------------------------------------------------------
-- admin              → true (escreve em todas, sem precisar de linha em operador_filiais)
-- operador com vínculo → true
-- operador sem vínculo → false  (é o "zero vínculo fecha tudo" do ADR §3 — falha segura)
-- consulta / inativo / sem perfil / fid NULL → false
--
-- plpgsql (e não sql) por causa dos três desvios: fica legível e chama `papel_atual()` uma
-- única vez. `stable` mesmo assim — só lê.
create or replace function public.pode_escrever_filial(fid smallint)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_papel public.papel_usuario;
begin
  -- Sem filial não há o que autorizar. Fecha em vez de abrir.
  if fid is null then
    return false;
  end if;

  v_papel := public.papel_atual();

  if v_papel = 'admin' then
    return true;
  end if;

  if v_papel = 'operador' then
    return exists (
      select 1
        from public.operador_filiais vf     -- `of` é palavra reservada: alias `vf`
       where vf.usuario_id = (select auth.uid())
         and vf.filial_id  = fid
    );
  end if;

  -- 'consulta', perfil desativado, sem perfil, sem sessão.
  return false;
end;
$$;

comment on function public.pode_escrever_filial(smallint) is
  'F21: true se o usuário logado pode ESCREVER na filial informada. admin → sempre; operador → só com vínculo em operador_filiais; consulta/desativado/sem perfil → nunca; fid NULL → nunca. Só escrita: a LEITURA é ampla para todo logado (ADR-001).';

revoke all on function public.pode_escrever_filial(smallint) from public, anon;
grant execute on function public.pode_escrever_filial(smallint) to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- as três existem, com uma assinatura só, definer e stable?
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--          p.prosecdef as definer, p.provolatile as vol,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('papel_atual', 'e_admin', 'pode_escrever_filial')
--    order by p.proname;
--   -- esperado: 3 linhas · definer = true · vol = 's' · anon = false · auth = true
--
--   -- com o backfill da 0061, o próprio Johnny logado deve dar admin/true:
--   select public.papel_atual(), public.e_admin(), public.pode_escrever_filial(1::smallint);
--   -- (rodando como service role no SQL Editor, auth.uid() é NULL → NULL/false/false;
--   --  a prova de verdade com papel simulado está em supabase/tests/papeis_rls.sql)
