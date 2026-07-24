-- Migration 0055 — criar_compra_lote: grant authenticated-only (OS-F19, achado C7).
--
-- Achado (SELECT em produção, 24/07/2026 — has_function_privilege + proacl): a RPC de
-- ESCRITA criar_compra_lote estava executável por `anon` E `service_role`, ao contrário das
-- outras duas RPCs de escrita (devolver_ao_fornecedor, importar_ativos_substituir), que são
-- authenticated-only. Contraria a spec §9 / CLAUDE.md ("escrita = authenticated-only").
--   proacl real em prod: {postgres=X, anon=X, authenticated=X, service_role=X}  (grants
--   DIRETOS a anon/service_role, não via PUBLIC).
--
-- Causa raiz: a 0040 endureceu a função (auth.uid() vence p_criado_por) mas o revoke era só
-- `from public` — no-op, porque anon/service_role têm grant DIRETO (default do Supabase para
-- o schema public), não herdado de PUBLIC. A 0047 (devolver_ao_fornecedor) e a parte
-- importar da 0040 fizeram `revoke ... from public, anon, service_role`; é esse revoke que
-- faltou aqui.
--
-- Risco real BAIXO (é defesa-em-profundidade): criar_compra_lote é SECURITY INVOKER, então um
-- `anon` que a invocasse rodaria os INSERTs como anon e a RLS de ativos/movimentacoes (INSERT
-- só para authenticated) barraria a escrita. Ainda assim é divergência da invariante de
-- acesso e a correção é trivial e espelha o padrão já usado nas outras duas RPCs.
--
-- NÃO toca dado, NÃO muda o CORPO da função (segue o da 0040 — auth.uid()); só corrige os
-- grants. Não contém `delete from` → não bate no gate. Caminho A do docs/RUNBOOK-BANCO.md
-- (ensaio → produção via MCP). Idempotente. Verificação pós-apply: has_function_privilege
-- anon=false, service_role=false, authenticated=true.

revoke all on function public.criar_compra_lote(jsonb, uuid) from public, anon, service_role;
grant execute on function public.criar_compra_lote(jsonb, uuid) to authenticated;
