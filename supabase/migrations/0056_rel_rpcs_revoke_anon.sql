-- Migration 0056 — RPCs de RELATÓRIO: revoke de `anon` (revisão de projeto, 24/07/2026).
--
-- ✅ APLICADA EM 25/07/2026 NOS DOIS BANCOS (o Johnny liberou a permissão que o
-- classificador do harness vinha barrando desde 24/07).
--
-- Histórico do achado, que vale registrar porque quase passou batido: o aviso original
-- desta migration dizia "não aplicada nem no ensaio nem em produção". A medição de
-- 25/07 mostrou que a segunda metade era FALSA e, pior, que o desvio real estava do
-- outro lado:
--   · PRODUÇÃO (pbtjcalbmepmrqzprusb) — o efeito JÁ estava lá (aplicado por fora, sem
--     linha no ledger — é o item A da dívida). O apply de 25/07 foi idempotente e serviu
--     para o histórico passar a refletir a migration.
--   · ENSAIO (sgmvldiizsrjbxzzpmhh) — era o banco EXPOSTO: as sete RPCs seguiam com
--     EXECUTE para `anon`. Isso invertia a premissa do runbook (o caminho de validação é
--     ensaio → produção), então o ensaio era MENOS restrito que produção e um teste feito
--     nele não provava o que prova em prod.
--
-- Verificação pós-apply nos dois (25/07): anon=false · authenticated=true ·
-- service_role=true nas SETE. Ver docs/DECISOES.md, entradas de 24/07 "Revisão de código
-- do projeto inteiro" e 25/07 (diagnóstico + rollout).
--
-- Achado: a 0055 corrigiu `criar_compra_lote`, mas a MESMA causa-raiz continua nas sete
-- RPCs de leitura de relatório. Todas fazem apenas
--     revoke all on function ... from public;
-- e `revoke ... from public` é NO-OP para `anon`, que tem grant DIRETO (default do
-- Supabase para o schema `public`), não herdado de PUBLIC. Ou seja: `anon` segue com
-- EXECUTE em rel_estoque_asof (0016 → 0022 → 0045 → 0047 → 0054), rel_saldo_itens
-- (0016 → 0027), rel_mov_itens, rel_frescor_itens (0016), rel_mov_por_mes,
-- rel_por_motivo e rel_resumo (0011).
--
-- Risco real BAIXO, como na 0055: as sete são SECURITY INVOKER, então um `anon` que as
-- invocasse leria `ativos`/`movimentacoes`/`lancamentos_item` como anon e a RLS (que não
-- concede nada a anon) devolveria vazio. É divergência da invariante de acesso da
-- spec §9, não vazamento — e a correção é a mesma linha que a 0055 usou.
--
-- `service_role` PERMANECE com EXECUTE — e isto é essencial, não descuido: o
-- VISUALIZADOR POR SENHA não tem credencial de banco, então `resolverAcessoRelatorio`
-- (src/lib/auth/acesso.ts) o serve com o client administrativo (service_role) e é ele
-- quem chama estas RPCs. Revogar service_role aqui derrubaria o relatório do gestor.
-- Por isso o revoke é `from public, anon` (e NÃO `from public, anon, service_role`,
-- como nas RPCs de ESCRITA da 0032/0040/0047/0055).
--
-- NÃO toca dado, NÃO muda o corpo de nenhuma função — só corrige os grants. Não contém
-- `delete from` → não bate no gate. Idempotente. Caminho A do docs/RUNBOOK-BANCO.md.
-- Verificação pós-apply (para cada função abaixo):
--   has_function_privilege('anon',          '<assinatura>', 'execute') = false
--   has_function_privilege('authenticated', '<assinatura>', 'execute') = true
--   has_function_privilege('service_role',  '<assinatura>', 'execute') = true

-- Estado as-of do inventário (KPIs, categoria × status, disponíveis por modelo).
revoke all on function public.rel_estoque_asof(smallint, date) from public, anon;
grant execute on function public.rel_estoque_asof(smallint, date) to authenticated, service_role;

-- Itens por quantidade (grupos 2–3 do relatório + tela /itens).
revoke all on function public.rel_saldo_itens(smallint, date) from public, anon;
grant execute on function public.rel_saldo_itens(smallint, date) to authenticated, service_role;

revoke all on function public.rel_mov_itens(smallint, date, date) from public, anon;
grant execute on function public.rel_mov_itens(smallint, date, date) to authenticated, service_role;

revoke all on function public.rel_frescor_itens(smallint, date) from public, anon;
grant execute on function public.rel_frescor_itens(smallint, date) to authenticated, service_role;

-- Agregações de movimentação (série, motivos, resumo no formato do e-mail).
revoke all on function public.rel_mov_por_mes(smallint, date, date) from public, anon;
grant execute on function public.rel_mov_por_mes(smallint, date, date) to authenticated, service_role;

revoke all on function public.rel_por_motivo(smallint, date, date) from public, anon;
grant execute on function public.rel_por_motivo(smallint, date, date) to authenticated, service_role;

revoke all on function public.rel_resumo(smallint, date, date) from public, anon;
grant execute on function public.rel_resumo(smallint, date, date) to authenticated, service_role;
