-- Migration 0106 — F33/D3: índices para as 4 FKs de `movimentacoes` sem índice.
--
-- ✅ APLICADA em 10/08/2026 — ensaio (sgmvldiizsrjbxzzpmhh) e produção
--   (pbtjcalbmepmrqzprusb), pelo caminho A do docs/RUNBOOK-BANCO.md.
--
-- O advisor de performance lista 15 FKs sem índice cobridor nos dois projetos, mas
-- `movimentacoes` (3.288 linhas em produção, ~55/dia) é a ÚNICA tabela GRANDE do grupo —
-- as outras 11 (anotacoes, eventos_admin, import_logs, kits_modelos, lancamentos_item,
-- pendencias_item, relatorios_gerados ×2, senhas_acesso, termos_gerados ×2) têm de 0 a
-- 49 linhas: índice ali é ruído (custo de escrita/manutenção sem ganho de leitura
-- mensurável) — DECISÃO registrada em docs/DECISOES.md (F33/D3), não criados aqui.
--
-- As 4 FKs de movimentacoes, medidas em ensaio (EXPLAIN ANALYZE BUFFERS, ANTES sem
-- índice, cache frio):
--   · estorno_de        — `.in('estorno_de', ids)` (listarMovimentacoes,
--     listarMovimentacoesDoAtivo, possiveisDuplicatasDoDia): Seq Scan, 150 buffers,
--     cost 198.63 → Index Only Scan, 2 buffers, cost 3.88. PLANO MUDOU.
--   · criado_por         — `.eq('criado_por', uid)` (ultimaMovimentacaoDoUsuario,
--     ultimosAtivosMovimentadosDoOperador, filtro "Minhas" MOV-05): Seq Scan+Sort →
--     Index Scan+Sort, buffers caem de 150 para 5. PLANO MUDOU.
--   · filial_destino_id  — usado em OR com filial_id no relatório por período
--     (queries/relatorios/movimentacoes.ts:307): equality isolada usa o índice
--     (Index Scan, 8 linhas seletivas — só `transferencia` popula a coluna). PLANO MUDOU.
--   · motivo             — equality isolada: Seq Scan → Bitmap Heap Scan usando o
--     índice. PLANO MUDOU.
--
-- Todas as 4 mudaram de plano (Seq Scan → Index/Bitmap Scan) sob medição — regra 4 do
-- runbook desta frente satisfeita para as 4. Reversível (DROP INDEX); não muda
-- resultado de query nenhuma. CREATE INDEX comum: tabela pequena, lock de ms.

create index movimentacoes_estorno_de_idx        on public.movimentacoes (estorno_de);
create index movimentacoes_criado_por_idx        on public.movimentacoes (criado_por);
create index movimentacoes_motivo_idx            on public.movimentacoes (motivo);
create index movimentacoes_filial_destino_id_idx on public.movimentacoes (filial_destino_id);
