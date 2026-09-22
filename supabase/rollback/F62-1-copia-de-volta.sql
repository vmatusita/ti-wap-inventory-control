-- =============================================================================
-- F62-1-copia-de-volta.sql — o PRIMEIRO passo do rollback da F62 (docs/PLAN-F62.md §5.1)
-- =============================================================================
-- Copia o cargo e o status VIVOS (`membros`, a membership na empresa legada) de volta para
-- as colunas congeladas de `profiles` — ANTES de religar qualquer leitor antigo (o app
-- revertido ou `F62-2-desfaz.sql`). Decisão iii do Johnny (22/09/2026): sem este passo,
-- quem foi desativado ou rebaixado depois da F62 voltaria ao cargo congelado no apply —
-- a revogação se desfaria em silêncio. O roteiro `supabase/tests/f62_rollback.sql` prova
-- isso no Postgres do CI: com a cópia, o estado MAIS NOVO; sem ela, o velho.
--
-- Seguro de rodar com o app NOVO no ar: nada do app novo lê `profiles.papel`/`ativo`.
-- Idempotente: só toca a linha que diverge. Com a janela `estoque.gestao_usuarios`, porque
-- `profiles_guarda_dev` recusa mexer no cargo de um dev fora dela. Sem `begin`/`commit`
-- próprios (quem roda decide a transação); um bloco `do` só, para a janela valer no update.
-- =============================================================================

do $copia_de_volta$
begin
  perform set_config('estoque.gestao_usuarios', 'on', true);
  update public.profiles p
     set papel = m.papel,
         ativo = m.ativo
    from public.membros m
   where m.profile_id = p.id
     and m.empresa_id = public.empresa_legada()
     and (p.papel, p.ativo) is distinct from (m.papel, m.ativo);
  perform set_config('estoque.gestao_usuarios', 'off', true);
end
$copia_de_volta$;
