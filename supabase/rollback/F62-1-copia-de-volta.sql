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
-- `profiles_guarda_dev` recusa mexer no cargo de um dev fora dela, E com a marca
-- `estoque.cargo_congelado`, porque desde a 0158 ela recusa (55000) gravar a coluna congelada
-- pela janela sem essa marca (a RPC antiga em voo no apply). Sem `begin`/`commit` próprios
-- (quem roda decide a transação); um bloco `do` só, para a janela valer no update.
--
-- ⚠ `membros` fica TRAVADA contra escrita (SHARE ROW EXCLUSIVE) até o fim da transação. Por
-- isso a receita (RUNBOOK-BANCO, "O rollback da F62") roda este arquivo DUAS vezes: cedo,
-- sozinho, para o app antigo já achar a coluna certa; e de novo JUNTO do `F62-2-desfaz.sql`,
-- na mesma transação — a troca de cargo feita entre as duas vezes (as RPCs ainda gravam
-- `membros` até o desfazer) é recopiada, e a que chegar durante o desfazer espera a trava e
-- falha depois do `drop`, em vez de sumir em silêncio.
-- =============================================================================

do $copia_de_volta$
begin
  lock table public.membros in share row exclusive mode;
  perform set_config('estoque.gestao_usuarios', 'on', true);
  perform set_config('estoque.cargo_congelado', 'on', true);
  update public.profiles p
     set papel = m.papel,
         ativo = m.ativo
    from public.membros m
   where m.profile_id = p.id
     and m.empresa_id = public.empresa_legada()
     and (p.papel, p.ativo) is distinct from (m.papel, m.ativo);
  perform set_config('estoque.cargo_congelado', 'off', true);
  perform set_config('estoque.gestao_usuarios', 'off', true);
end
$copia_de_volta$;
