-- Migration 0111 — o passado: limpa o detentor dos ativos que já estão em estado sem
-- dono (F36, docs/PLAN-F36-F39.md §3.4). Depende da 0110 (`status_tem_detentor`).
--
-- SEPARADA DA 0110 DE PROPÓSITO. A 0110 é `create or replace` puro e não toca dado; ESTA
-- mexe em dado e merece o próprio par de contagens. É a decisão D3 do Johnny
-- (28/08/2026): limpeza SILENCIOSA — um `update` único, com backup das linhas afetadas
-- antes, SEM gerar movimentação de ajuste. O acervo é imutável (0081) e inventar 4
-- movimentações que ninguém registrou seria sujar a linha do tempo para corrigir um
-- defeito de gravação; a correção fica registrada aqui e na ata, não no histórico do
-- equipamento.
--
-- ⚠ ISTO É OPERAÇÃO DESTRUTIVA pelo CLAUDE.md (altera dado em produção), embora NÃO
-- bata no gate do modo automático (o classificador barra `delete from public.ativos` /
-- `public.movimentacoes`; isto é `update`) e NÃO bata na `guarda_acervo` (0081), cujo
-- trigger em `ativos` é `before delete` apenas — `update` em `ativos` é operação normal.
-- Protocolo cumprido antes do apply, com os números na ata de `docs/DECISOES.md`
-- (2026-08-28):
--   1. contagem   → 4 ativos em produção, todos `em_estoque` (2 com colaborador, 3 com
--                   setor); nenhum outro estado apareceu;
--   2. backup     → as 4 linhas inteiras exportadas em JSON (`to_jsonb`) ANTES do apply,
--                   fora do repositório (contêm nome real — CLAUDE.md regra 2);
--   3. dry-run    → o mesmo `where` rodado como `select`, e o `update` ensaiado dentro de
--                   `begin; … rollback;` contra a produção real;
--   4. apply      → esta migration;
--   5. depois     → a mesma contagem tem de dar ZERO, e a décima checagem do /dev
--                   (`detentor_em_estado_sem_dono`, 0110) idem.
--
-- `updated_at` é atualizado de propósito: a linha mudou de verdade. `status` não é
-- tocado — nenhum ativo muda de estado por esta migration.
update public.ativos
   set colaborador_atual = null,
       setor_atual       = null,
       updated_at        = now()
 where not public.status_tem_detentor(status)
   and (colaborador_atual is not null or setor_atual is not null);
