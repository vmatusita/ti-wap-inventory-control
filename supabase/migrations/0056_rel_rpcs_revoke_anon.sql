-- Migration 0056 — RPCs de RELATÓRIO: revoke de `anon` (revisão de projeto, 24/07/2026).
--
-- ⚠ ESTADO REAL, MEDIDO EM 25/07/2026 (o aviso original desta migration dizia "não
-- aplicada nem no ensaio nem em produção" — a segunda metade é FALSA e por isso foi
-- corrigida aqui):
--
--   · PRODUÇÃO (pbtjcalbmepmrqzprusb) — JÁ APLICADA. has_function_privilege('anon', …)
--     = false nas SETE RPCs. A dívida técnica de 24/07 mediu o mesmo. O efeito está no
--     banco, mas NÃO há linha no ledger (é o item A: o histórico não reflete o repo).
--   · ENSAIO (sgmvldiizsrjbxzzpmhh) — **NÃO APLICADA**. As sete seguem com
--     EXECUTE para `anon`. É a exposição que resta, e ela inverte a premissa do
--     runbook: o caminho de validação é ensaio → produção, então hoje o ensaio é
--     MENOS restrito que produção e um teste feito nele não prova o que prova em prod.
--
-- Ou seja: quem for aplicar, aplique NO ENSAIO. Em produção o apply é idempotente
-- (revoke do que já está revogado) e serve só para fechar a diferença.
--
-- O `apply_migration` foi barrado pelo classificador de permissões do harness na revisão
-- de 24/07 e DE NOVO no diagnóstico de 25/07; o arquivo fica versionado e o apply é
-- handoff para o Johnny (caminho A do docs/RUNBOOK-BANCO.md). Ver docs/DECISOES.md,
-- entradas de 24/07/2026 "Revisão de código do projeto inteiro" e 25/07/2026.
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
