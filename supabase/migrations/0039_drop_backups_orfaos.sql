-- Migration 0039 — remove as tabelas de BACKUP órfãs criadas ad-hoc em produção
-- (dívida técnica — item B, 21/07/2026).
--
-- CONTEXTO: durante as operações manuais de F7K e F8, o SQL de produção criou
-- tabelas de backup do dado afetado ANTES de re-marcá-lo/limpá-lo. Essas tabelas
-- nunca entraram no repositório (foram `create table ... as ...` no SQL Editor) e
-- ficaram no schema `public` guardando DADO REAL: a 0038 só aplicou um stopgap de
-- RLS (via execute_sql, fora das migrations), que tapa a exposição pela anon key mas
-- deixa as 884 linhas paradas indefinidamente. O advisor `rls_enabled_no_policy` as
-- aponta. Confirmado em 21/07 (read-only) que as operações aterrissaram e estão
-- verificadas — os backups são só rede de rollback já não mais necessária:
--   · _f8_backup_matriz_compras (809 linhas) — F8 re-marcou as compras de abertura da
--     Matriz; produção tem 1.213 compras `import startup%` (inclui as 809). Concluída.
--   · _f7k_backup_modelo (75 linhas) — F7K limpou a marca-prefixo do modelo. Concluída.
--
-- NÃO removida aqui (de propósito): `_bkp_relatorios_gerados_f6a` (2 snapshots de
-- go-live) — está atrelada a uma DECISÃO EM ABERTO do Johnny sobre os 2 snapshots
-- congelados da carga (chip pendente, docs/DECISOES.md · F6A). Só remover quando essa
-- decisão fechar — vira uma migration própria.
--
-- `if exists`: as tabelas só existem em PRODUÇÃO (nunca no ensaio nem num bootstrap
-- limpo), então o drop é idempotente e não quebra os outros ambientes.
--
-- DESTRUTIVA E IRREVERSÍVEL (apaga o backup — não há backup do backup). Roda pelo
-- mesmo caminho das demais DDLs de produção deste projeto: o Johnny aplica no SQL
-- Editor (scratchpad/f0-drop-backups-producao.sql) após conferir; ver item A do
-- plano de dívida técnica (docs/DIVIDA-TECNICA.md) sobre o gate/ledger.

drop table if exists public._f8_backup_matriz_compras;
drop table if exists public._f7k_backup_modelo;
