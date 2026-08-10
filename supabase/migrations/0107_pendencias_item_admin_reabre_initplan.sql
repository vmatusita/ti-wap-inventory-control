-- Migration 0107 — F33/D4: `e_admin()` sem `(select …)` na policy "pendencias_item
-- admin reabre" (0103) — restaura o padrão documentado em 0063:46-57 (função SEM
-- argumento, que não depende da LINHA, entra em `(select …)` para virar InitPlan
-- avaliado 1× por statement, não 1× por linha; `pode_escrever_filial(filial_id)`
-- DEPENDE da linha e fica de propósito fora do wrap).
--
-- ✅ APLICADA em 10/08/2026 — ensaio (sgmvldiizsrjbxzzpmhh) e produção
--   (pbtjcalbmepmrqzprusb), pelo caminho A do docs/RUNBOOK-BANCO.md.
--
-- MEDIDO em ensaio (EXPLAIN ANALYZE BUFFERS) com o predicado COMBINADO das duas
-- policies permissivas de UPDATE (é assim que o Postgres avalia — OR entre si; ver
-- 0103, "policies permissivas são OR entre si"):
--   ANTES: Filter: (pode_escrever_filial(filial_id) AND (status='aberta' OR
--          (e_admin() AND status='resolvida')))  — e_admin() dentro do OR, sujeito a
--          reavaliação por linha. cost=164.50.
--   DEPOIS: Filter: (... OR ((InitPlan 1).col1 AND status='resolvida') ...) AND
--          pode_escrever_filial(filial_id), com `InitPlan 1` hoisted (avaliado 1×).
--          cost=89.76 (-45%).
-- PLANO MUDOU (e_admin() saiu do corpo do Filter por linha → InitPlan). Fica.
--
-- Semântica IDÊNTICA: `(select public.e_admin())` é a MESMA proposição booleana que
-- `public.e_admin()` — a função não tem argumento, não referencia a linha, e o
-- `(select …)` só força o InitPlan; não muda o valor para sessão/linha nenhuma.
-- `pode_escrever_filial(filial_id)` e o resto dos predicados ficam BYTE A BYTE iguais.
--
-- PROVADO no ensaio (roteiro supabase/tests/reabrir_pendencia_item.sql, dentro de
-- `begin; … rollback;`, sem resíduo): 4/4 cenários OK após esta migration — operador
-- vinculado resolve, operador vinculado NÃO reabre, operador de outra filial NÃO
-- reabre, nível administrador REABRE.
--
-- Reversível: `alter policy` de volta ao corpo da 0103. Nenhum dado tocado.

alter policy "pendencias_item admin reabre" on public.pendencias_item
  using      ((select public.e_admin()) and public.pode_escrever_filial(filial_id) and status = 'resolvida')
  with check ((select public.e_admin()) and public.pode_escrever_filial(filial_id) and status = 'aberta');

comment on policy "pendencias_item admin reabre" on public.pendencias_item is
  'F28 (0103 · PND-05) + F33 (0107, D4): a volta resolvida → aberta. Só nível administrador (e_admin() = admin OU dev) e só na filial em que escreve. `(select e_admin())` vira InitPlan (0063:46-57) — 1× por statement, não por linha; `pode_escrever_filial(filial_id)` fica fora do wrap de propósito (depende da linha). O rastro (justificativa + anotação) continua sendo da Server Action reabrirPendenciaItem — esta policy garante que NÃO existe caminho por fora dela para quem não é admin.';
