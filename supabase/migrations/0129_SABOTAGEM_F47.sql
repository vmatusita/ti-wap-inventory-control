-- ⚠⚠ MIGRATION DE SABOTAGEM DA F47 — TEMPORÁRIA, REMOVIDA NO COMMIT SEGUINTE.
--
-- Ela existe para provar o critério 7 da ordem: acrescentar uma coluna sem rodar
-- `npm run db:types` DERRUBA o CI, com mensagem que NOMEIA a coluna.
--
-- É o buraco que o gate de deriva fecha, e ele não é hipótese: a ata da F41
-- registra que "o `database.ts` commitado simplesmente estava velho, porque
-- nenhuma fase regenerava desde a F38".
--
-- Esperado no passo "Gate de deriva" do job `banco-sem-docker`:
--   colunas ausentes no database.ts (1):
--     · ativos.sabotagem_f47
--   ::error::o database.ts está velho: 1 objeto(s) do banco não estão nele.
--
-- NADA disto fica: o arquivo, a entrada no lock e a entrada na lista de cobertura
-- saem juntos no commit seguinte.

alter table public.ativos add column sabotagem_f47 text;
