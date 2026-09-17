-- Migration 0142 — F60 · Frente B: o índice do "último lançamento" de quem abre /itens.
--
-- Depende de nada desta fase (lê só `lancamentos_item`). ADITIVA: cria UM índice. Nenhuma linha é tocada,
-- nenhuma função recriada, nenhum grant muda. Não bate no gate → caminho A: CI, ensaio, produção.
--
-- =============================================================================
-- POR QUE ELE EXISTE — a medição, não a suposição (R-REL-33)
-- =============================================================================
-- `getUltimoLancamento` (src/lib/queries/itens.ts) roda em TODO render de `/itens` e de `/itens/historico`,
-- para o usuário da sessão:
--     where criado_por = <quem abriu> and estorna_id is null
--     order by created_at desc, id desc  limit 1
-- O único índice que serve a ordem é `lanc_item_created_idx (created_at desc)` (0015). Para quem lança muito
-- ele acha a linha no começo; para quem lançou pouco, há muito tempo, ou NUNCA (todo usuário de consulta e
-- todo administrador que só confere), o executor percorre o índice INTEIRO filtrando `criado_por` e não acha
-- nada.
--
-- Produção não prova (155 lançamentos em 16/09/2026: 0,33 ms, Incremental Sort sobre `lanc_item_created_idx`
-- — "a tabela é pequena" não é medição). Medido no ENSAIO com volume fictício, pelo harness consertado
-- (`scripts/perf/medir-itens.mjs`, canal MCP, plano GENÉRICO — prepare + force_generic_plan —, como
-- `authenticated`, 1 aquecimento + 7; evidência `docs/perf/f60-itens-ensaio.json`), ANTES do índice:
--
--   autor SEM lançamento   10.035 linhas →  2,189 ms ·   258 buffers · Rows Removed by Filter 10.035
--                          50.035 linhas → 10,406 ms · 1.286 buffers · Rows Removed by Filter 50.035
--   autor "frio"           50.035 linhas → 10,318 ms · 1.279 buffers · Rows Removed by Filter 49.785
--   autor "quente"         50.035 linhas →  0,217 ms ·     4 buffers
--   plano (os três): Limit → Incremental Sort → Index Scan using lanc_item_created_idx
--
-- ×4,99 no volume → ×4,98 nos buffers: LINEAR, e pago por quem menos usa a tela. O "depois" é medido no ensaio
-- com o MESMO harness, depois do apply desta migration, e vai para a evidência da fase (não para este
-- cabeçalho, que a trava de hash congela no commit).
--
-- A FORMA: `(criado_por, created_at desc, id desc) where estorna_id is null`. A ficha da F60 pede
-- `(criado_por, created_at desc)`; o `id desc` a mais é porque a consulta real desempata por `id desc`, e com
-- ele o índice serve a ordem INTEIRA — Index Scan + Limit, sem nó de sort nenhum. O `where estorna_id is null`
-- é o mesmo filtro da consulta: a linha de estorno nunca é "o último lançamento", e fica fora do índice.
--
-- O QUE **NÃO** ENTRA: `lanc_item_ordem_lista_idx` (a ficha — os 708 ms que o justificariam vinham do SELECT
-- sem WHERE do harness antigo, forma que o app não emite).
--
-- =============================================================================
-- VERIFICAÇÃO PÓS-APPLY (só leitura)
-- =============================================================================
-- 1) o índice existe com a definição certa: em pg_indexes, schemaname public e indexname
--    lanc_item_criado_por_idx, o indexdef traz "btree (criado_por, created_at DESC, id DESC)" e
--    "WHERE (estorna_id IS NULL)".
-- 2) no ensaio, com o harness no mesmo patamar, a forma "autor sem lançamento" vira Index Scan using
--    lanc_item_criado_por_idx sem Incremental Sort, e os buffers deixam de crescer com o volume.
--
-- =============================================================================
-- ROLLBACK — o primeiro a ser desfeito, se for o caso
-- =============================================================================
-- Dropar o índice lanc_item_criado_por_idx (drop index if exists). Não muda resultado nenhum — só o plano.

create index lanc_item_criado_por_idx
  on public.lancamentos_item (criado_por, created_at desc, id desc)
  where estorna_id is null;

comment on index public.lanc_item_criado_por_idx is
  'F60: serve getUltimoLancamento (src/lib/queries/itens.ts) — where criado_por = $1 and estorna_id is null order by created_at desc, id desc limit 1. Sem ele, quem não tem lançamento percorre lanc_item_created_idx inteiro (medido no ensaio: 10,4 ms e 1.286 buffers em 50 mil linhas, linear). Ver docs/perf/f60-itens-ensaio.json.';
