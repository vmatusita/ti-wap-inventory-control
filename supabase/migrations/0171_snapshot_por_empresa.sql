-- =============================================================================
-- 0171_snapshot_por_empresa.sql — F65 (23/09/2026): a versão do snapshot semanal passa a ser POR EMPRESA
-- =============================================================================
-- classe: ADITIVA (um índice único trocado pela forma por empresa, com o MESMO nome; nenhuma tupla reescrita)
--
-- O DEFEITO (fato 8): `relatorios_gerados_periodo_filial_versao_uidx` (0013) é `unique (periodo_de, periodo_ate,
-- coalesce(filial_id, -1), versao)` — o que cobre o Consolidado (`filial_id is null`, onde NULL não colidiria com NULL).
-- Sem a empresa na chave, a partir da segunda empresa só a PRIMEIRA a gerar o Consolidado da semana consegue: todas as
-- outras levam "outra pessoa gerou este mesmo período" quando ninguém da empresa delas gerou nada, para sempre. O índice
-- passa a `(empresa_id, periodo_de, periodo_ate, coalesce(filial_id, -1), versao)`: duas empresas geram o Consolidado do
-- mesmo período e da mesma versão; na mesma empresa, o segundo continua recusado (23505).
--
-- ██  O NOME É CONTRATO DUAS VEZES: `CONSTRAINTS_TRADUZIDAS` o traduz, e `ehViolacaoDeVersao`                        ██
-- ██  (src/lib/relatorios/versao-snapshot.ts) CASA A VIOLAÇÃO PELO NOME — é a segunda pista da renumeração da F29      ██
-- ██  (nem todo caminho do PostgREST preserva o `code`). Nome provisório (`<nome>_f65`, que CONTÉM o contratual) →    ██
-- ██  `drop index` do antigo → `alter index … rename`, na mesma migration.                                            ██
--
-- O LAÇO DA F57, FECHADO NO MESMO COMMIT: `chaveVersao` (o espelho TS desta chave, que alimenta a badge "superada" de
-- /relatorios/gerados) ganha a empresa, e `src/lib/queries/gerados.ts` passa a ler `empresa_id` das versões — a primeira
-- leitura TS da coluna antes da F66, uma exceção NOMINAL da trava "ninguém lê": identidade da chave, não recorte.
-- `src/lib/relatorios/chave-versao-sql.test.ts` passa a ler ESTA migration como a fonte do índice.
--
-- O OUTRO UNIQUE FICA: `relatorios_gerados_periodo_de_periodo_ate_filial_id_versao_key` (0010, `unique (periodo_de,
-- periodo_ate, filial_id, versao)`) é por tenant de forma IMPLÍCITA — `filial_id` não nulo determina a empresa (a FK
-- composta `relatorios_gerados_filial_id_fkey`, 0167, a amarra), e o nulo (o Consolidado) não colide com nulo. Ele está
-- na lista nominal de `supabase/tests/unicidade_por_empresa.sql`, com o motivo.
--
-- O `-1` fica (não é o defeito). Com uma empresa só, a chave de antes continua única — a contagem do "antes" deu 0
-- duplicata, nos dois bancos. O LOCK: `relatorios_gerados` tem 13 linhas em produção; CREATE UNIQUE INDEX toma SHARE e
-- DROP INDEX, ACCESS EXCLUSIVE — milissegundos, até o commit. `lock_timeout` de 2 s por `set`/`reset`, sem
-- `begin`/`commit`; se o lock não vier: registrar e repetir, no máximo três vezes em 30 min.
-- =============================================================================

set lock_timeout = '2s';

create unique index relatorios_gerados_periodo_filial_versao_uidx_f65
  on public.relatorios_gerados (empresa_id, periodo_de, periodo_ate, coalesce(filial_id, -1), versao);
drop index public.relatorios_gerados_periodo_filial_versao_uidx;
alter index public.relatorios_gerados_periodo_filial_versao_uidx_f65
  rename to relatorios_gerados_periodo_filial_versao_uidx;

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   docs/f65-evidencias/impressao-catalogo.sql: `relatorios_gerados_periodo_filial_versao_uidx` =
--   (empresa_id, periodo_de, periodo_ate, COALESCE((filial_id)::integer, '-1'::integer), versao); nenhum `*_f65`;
--   impressao-tenant.sql: relfilenode e md5 de (chave, xmin) de `relatorios_gerados` IGUAIS aos do "antes".
--
-- ROLLBACK (supabase/rollback/F65-desfaz.sql, passo 4 — só se o índice estiver na forma nova):
--   create unique index relatorios_gerados_periodo_filial_versao_uidx_f65
--     on public.relatorios_gerados (periodo_de, periodo_ate, coalesce(filial_id, -1), versao);
--   drop index public.relatorios_gerados_periodo_filial_versao_uidx;
--   alter index public.relatorios_gerados_periodo_filial_versao_uidx_f65 rename to relatorios_gerados_periodo_filial_versao_uidx;
--   (e o TS: `git revert` do commit desta migration — a chave e a leitura andam com o índice)
