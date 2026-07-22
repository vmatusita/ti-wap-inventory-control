-- ============================================================================
-- SQL DE PRODUÇÃO — item B do plano de dívida técnica (Faixa 0, 21/07/2026)
-- Rodar no SQL Editor do projeto de PRODUÇÃO (pbtjcalbmepmrqzprusb).
-- Conteúdo idêntico à migration 0039_drop_backups_orfaos.sql.
--
-- O QUE FAZ: remove as 2 tabelas de backup órfãs (dado real, sem policies, criadas
-- ad-hoc no go-live) cujas operações já concluíram e foram verificadas:
--   · _f8_backup_matriz_compras (809 linhas) — F8 já re-marcou as compras (1.213
--     compras `import startup%` em produção). Backup redundante.
--   · _f7k_backup_modelo (75 linhas) — F7K já limpou os modelos. Backup redundante.
--
-- DESTRUTIVO E IRREVERSÍVEL. Confira as contagens ANTES (bloco de conferência abaixo)
-- e só então rode os DROPs. NÃO inclui `_bkp_relatorios_gerados_f6a` — essa depende
-- da sua decisão sobre os 2 snapshots de go-live (deixe para depois).
-- ============================================================================

-- (1) CONFERÊNCIA — rode isto primeiro e confira os números:
select
  (select count(*) from public._f8_backup_matriz_compras)  as f8_backup,          -- esperado: 809
  (select count(*) from public._f7k_backup_modelo)         as f7k_backup,         -- esperado: 75
  (select count(*) from public.movimentacoes m
     join public.ativos a  on a.id = m.ativo_id
     join public.filiais f on f.id = a.filial_id
    where f.nome = 'Matriz' and m.tipo = 'compra'
      and m.observacao like 'import startup%')             as compras_matriz_marcadas; -- esperado: >= 809 (1.213)

-- (2) DROP — só depois de conferir o bloco (1):
drop table if exists public._f8_backup_matriz_compras;
drop table if exists public._f7k_backup_modelo;

-- (3) opcional: recarregue o schema cache do PostgREST
notify pgrst, 'reload schema';
