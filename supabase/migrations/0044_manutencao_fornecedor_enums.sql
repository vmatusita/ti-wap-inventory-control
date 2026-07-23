-- Migration 0044 — valores de enum novos do ciclo de manutenção com fornecedor (OS-F14).
--
-- O fornecedor abre um chamado próprio na manutenção; quando NÃO conserta, fica com o
-- equipamento e o troca. Esta ordem cria:
--   * status_ativo    += 'devolvido_fornecedor'  (estado TERMINAL de baixa, como descartado)
--   * tipo_movimentacao += 'devolucao_fornecedor' ("Devolução ao fornecedor")
--
-- SEPARADA da 0045 DE PROPÓSITO: no Postgres, um valor novo de enum NÃO pode ser
-- USADO na mesma transação que o adiciona. Cada migration roda numa transação (o job
-- `banco` do CI aplica todas em ordem); a 0045 — que USA os dois valores em funções,
-- check e RPC — só roda depois desta COMMITAR. `add value if not exists` = idempotente.
-- Sem BEFORE/AFTER: cada valor é anexado no FIM do enum (espelha STATUS_ORDEM/TIPO_META).
--
-- Aditiva, não toca dado (nenhum delete/update em ativos/movimentacoes) — não bate no
-- gate do modo automático. Caminho A do docs/RUNBOOK-BANCO.md (ensaio → produção).

alter type public.status_ativo      add value if not exists 'devolvido_fornecedor';
alter type public.tipo_movimentacao add value if not exists 'devolucao_fornecedor';
