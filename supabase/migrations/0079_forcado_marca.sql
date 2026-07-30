-- Migration 0079 — F23: a MARCA de "forçado", nas duas tabelas que a fase aprende a forçar.
--
-- Contexto: docs/prompts/F23-dev-destrutivo-ultracode.md §4 (família FORÇAR) e §1.5 (trilha).
-- Depende de nada além do esquema vigente. Quem USA estas colunas são as RPCs da 0084; quem
-- IMPEDE que qualquer outro caminho as escreva é a guarda da 0081.
--
-- =============================================================================
-- POR QUE UMA COLUNA, E NÃO UM MOTIVO NOVO NO CATÁLOGO
-- =============================================================================
-- A ordem §4.1 pede que a correção do dev "materialize um registro na linha do tempo" com a
-- "marca de forçado VISÍVEL NA FICHA". Havia três candidatos, e os dois primeiros foram
-- medidos e descartados:
--
--   1. TIPO novo no enum `tipo_movimentacao` ('correcao_dev'). Descartado: `status_apos_
--      movimentacao` teria de ganhar um ramo, e todo `case`/lista de tipos do app e dos
--      relatórios passaria a ter um valor a mais para tratar. Custo alto e espalhado, para
--      um caso que o tipo `ajuste` JÁ resolve (ver abaixo).
--   2. MOTIVO novo em `public.motivos` ('correcao_dev'). Descartado como marca PRIMÁRIA: a
--      tabela `motivos` é catálogo EDITÁVEL por administrador (`/admin/motivos`, policies
--      `e_admin` da 0063). Uma marca que o próprio admin renomeia ou reativa não é marca —
--      e, reativada, passaria a aparecer no seletor de motivo de um `ajuste` comum
--      (`listarMotivos` filtra `.eq('ativo', true)`, src/lib/queries/motivos.ts:17), deixando
--      um OPERADOR rotular a própria movimentação como se fosse correção técnica do dev.
--   3. COLUNA booleana — esta. Não é editável por tela nenhuma, não depende de catálogo, é
--      indexável, e a guarda da 0081 recusa INSERT com `forcado = true` fora da janela
--      oficial. É a única das três que um request forjado não consegue mentir.
--
-- ⚠ POR QUE O TIPO CONTINUA SENDO `ajuste`, E POR QUE ISSO JÁ BASTA PARA NÃO POLUIR RELATÓRIO.
-- Medido no ensaio em 30/07/2026, não suposto:
--   · `status_apos_movimentacao(status, 'ajuste')` devolve NULL, e `aplicar_movimentacao`
--     trata `ajuste` num ramo próprio que usa `new.status_resultante` DIRETO — ou seja, o
--     tipo `ajuste` JÁ IGNORA as transições válidas da máquina, desde a 0004, e já exige
--     `status_resultante` e `observacao` (justificativa). A família FORÇAR não precisa
--     inventar um mecanismo: ela precisa de TRILHA, GUARDA DE CARGO e MARCA — que é o que
--     esta fase acrescenta.
--   · `rel_resumo`, `rel_mov_por_mes` e `rel_por_motivo` filtram, os três,
--     `where m.tipo in ('saida','devolucao')`. Um `ajuste` não é contado por NENHUM deles.
--     Logo a correção-dev não entra em Entradas/Saídas, KPI ou motivo — não por uma exceção
--     nova que alguém possa esquecer de repetir, mas porque o tipo já está fora do recorte.
--     É o critério 6 da ordem, e a prova é consulta (roteiro §7), não raciocínio.
--
-- `lancamentos_item.forcado` é o espelho exato do outro lado (§4.2): o saldo continua 100%
-- derivado da soma dos lançamentos, e "forçar" grava o lançamento de `ajuste` que leva ao
-- alvo — nunca um número escrito à mão numa coluna de saldo.
--
-- ADITIVA: duas colunas com default `false`, dois índices parciais. Nenhuma linha existente
-- muda de significado (todas nascem `forcado = false`, que é o que elas sempre foram).
-- Não contém exclusão de acervo → NÃO bate no gate do modo automático → caminho **A** do
-- docs/RUNBOOK-BANCO.md: ensaio primeiro, produção depois.
--
-- REVERSÃO:
--   drop index public.movimentacoes_forcado_idx, public.lancamentos_item_forcado_idx;
--   alter table public.movimentacoes    drop column forcado;
--   alter table public.lancamentos_item drop column forcado;

-- ---------------------------------------------------------------------------
-- 1) movimentacoes.forcado
-- ---------------------------------------------------------------------------
alter table public.movimentacoes
  add column forcado boolean not null default false;

comment on column public.movimentacoes.forcado is
  'F23: esta movimentação foi criada pela ferramenta FORÇAR ESTADO da área /dev (RPC forcar_estado_ativo, 0084) — uma correção técnica do desenvolvedor, não uma operação do dia a dia. Sempre acompanha tipo = ''ajuste'' e uma justificativa em `observacao`. A ficha do ativo mostra a marca; os relatórios não a contam, porque nenhum deles conta `ajuste`. NÃO é gravável por caminho comum: a guarda da 0081 recusa INSERT com forcado = true fora da janela oficial, inclusive para o service role.';

-- Parcial: a única pergunta que se faz é "quais foram forçadas?" — e elas são, por desenho,
-- uma minoria mínima do acervo.
create index movimentacoes_forcado_idx on public.movimentacoes (ativo_id, created_at desc)
  where forcado;

-- ---------------------------------------------------------------------------
-- 2) lancamentos_item.forcado
-- ---------------------------------------------------------------------------
alter table public.lancamentos_item
  add column forcado boolean not null default false;

comment on column public.lancamentos_item.forcado is
  'F23: este lançamento foi criado pela ferramenta FORÇAR SALDO da área /dev (RPC forcar_saldo_item, 0084) para levar o saldo de um item a um valor alvo. Sempre acompanha tipo = ''ajuste'' e uma justificativa em `observacao`. O saldo continua 100% DERIVADO da soma dos lançamentos — esta fase não escreve saldo à mão em lugar nenhum. Mesma guarda da 0081: não é gravável fora da janela oficial.';

create index lancamentos_item_forcado_idx on public.lancamentos_item (item_id, filial_id, created_at desc)
  where forcado;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) as duas colunas existem, not null, default false:
--   select table_name, column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema='public' and column_name='forcado'
--    order by table_name;
--   -- esperado: 2 linhas (lancamentos_item, movimentacoes) · boolean · NO · false
--
--   -- 2) nenhuma linha existente foi marcada:
--   select (select count(*) from public.movimentacoes    where forcado) as movs_forcadas,
--          (select count(*) from public.lancamentos_item where forcado) as lanc_forcados;
--   -- esperado: 0 e 0
--
--   -- 3) os dois índices parciais:
--   select indexname from pg_indexes
--    where schemaname='public' and indexname like '%forcado%' order by indexname;
--   -- esperado: lancamentos_item_forcado_idx · movimentacoes_forcado_idx
