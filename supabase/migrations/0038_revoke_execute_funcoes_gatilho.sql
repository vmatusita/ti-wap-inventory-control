-- Migration 0038 — endurecimento: revoga EXECUTE das funções-GATILHO (revisão de
-- código, 21/07/2026).
--
-- O advisor do Supabase aponta `handle_new_user` (0001) e `aplicar_movimentacao`
-- (0004→0023) como SECURITY DEFINER executáveis por `anon`/`authenticated` via
-- /rest/v1/rpc/* (lints 0028/0029_*_security_definer_function_executable). As duas
-- são funções `returns trigger`: disparam SÓ por trigger (cadastro de usuário e
-- inserção em `movimentacoes`), contexto em que o Postgres NÃO verifica o EXECUTE
-- do chamador. O app nunca as chama como RPC (confirmado por grep). Revogar é
-- higiene pura — não quebra o cadastro nem a máquina de estados; fecha a
-- superfície de RPC exposta pela anon key.
--
-- Mesmo idioma da 0025: revogar de public E de anon/authenticated (o default
-- privilege do Supabase concede EXECUTE a esses papéis direto, então
-- `revoke from public` não basta). Aditiva e reversível. Aplicar em prod e ensaio.

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.aplicar_movimentacao() from public, anon, authenticated;
