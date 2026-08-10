-- Migration 0105 — F33/D2: índice para a ordenação da lista de /movimentacoes.
--
-- ✅ APLICADA em 10/08/2026 — ensaio (sgmvldiizsrjbxzzpmhh) e produção
--   (pbtjcalbmepmrqzprusb), pelo caminho A do docs/RUNBOOK-BANCO.md.
--
-- EVIDÊNCIA (Frente A + medição desta frente, ensaio, 3.237 linhas):
-- `listarMovimentacoes` (src/lib/queries/movimentacoes.ts) ordena SEMPRE por
-- `data desc, created_at desc, id desc` (a mesma tripla nas duas branches, com e sem
-- filtro) e pagina com `.range()` (LIMIT/OFFSET). Sem índice cobrindo a tripla, o plano
-- era Seq Scan + Sort top-N: 159 buffers, ~68,6 ms (EXPLAIN ANALYZE BUFFERS, cache frio).
--
-- DEPOIS (mesmo ensaio, CREATE INDEX + ANALYZE): Index Scan usando o índice novo,
-- sem Sort, 6 buffers, ~0,11 ms — o LIMIT é servido diretamente pela ordem do índice.
-- PLANO MUDOU (Seq Scan+Sort → Index Scan sem Sort): índice fica, por definição da
-- ordem (item D2 do PLAN-F33 §5 / regra 4 do runbook desta frente).
--
-- Reversível: DROP INDEX. Não altera resultado nenhum (mesma ordenação, mesmas linhas).
-- CREATE INDEX comum (não-CONCURRENTLY): tabela pequena (3.288 linhas em produção em
-- 10/08/2026), lock de milissegundos — dispensa o caminho fora de transação.

create index movimentacoes_ordem_lista_idx
  on public.movimentacoes (data desc, created_at desc, id desc);
