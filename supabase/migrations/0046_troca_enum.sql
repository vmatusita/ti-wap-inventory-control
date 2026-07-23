-- Migration 0046 — valor de enum novo: 'troca' (OS-F15, C3).
--
-- 'troca' = entrada do equipamento SUBSTITUTO na devolução ao fornecedor (F14).
-- Antes o substituto nascia com uma movimentação `compra` (0045), mentindo nas
-- Entradas do relatório ("Compra" para algo que não foi comprado). A partir da F15
-- ele nasce como `troca` — ESPELHO da `compra` na máquina de estados (nascimento
-- em_estoque -> em_estoque) e como "entrada" do período, mas com rótulo/cor próprios
-- e NUNCA contado como "compra".
--
-- SEPARADA da 0047 DE PROPÓSITO (espelha 0044→0045): no Postgres um valor novo de
-- enum NÃO pode ser USADO na mesma transação que o adiciona. Cada migration roda numa
-- transação (o job `banco` do CI aplica todas em ordem); a 0047 — que USA 'troca' em
-- funções e na RPC devolver_ao_fornecedor — só roda depois desta COMMITAR.
-- `add value if not exists` = idempotente; sem BEFORE/AFTER (anexado no FIM do enum).
--
-- Aditiva, não toca dado (nenhum delete/update em ativos/movimentacoes) — não bate no
-- gate do modo automático. Caminho A do docs/RUNBOOK-BANCO.md (ensaio → produção).

alter type public.tipo_movimentacao add value if not exists 'troca';
