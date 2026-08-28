-- Migration 0120 — o índice de saldo por pessoa, e ELE ENTRA COM O NÚMERO NA MÃO
-- (F38 · frente 0 · decisão D6).
--
-- ---------------------------------------------------------------------------
-- POR QUE ESTA MIGRATION EXISTE SEPARADA DAS OUTRAS QUATRO
-- ---------------------------------------------------------------------------
-- A 0113 (F37) recusou este índice por escrito, e tinha razão na época: "nenhuma
-- consulta DESTA fase filtra por `colaborador_id` — o índice existiria para uma
-- pergunta que ainda não é feita, que é a definição de otimizar antes do número".
-- E deixou a regra: "Quando a fase seguinte tiver o número que justifique, o
-- índice entra lá — medido."
--
-- Esta é a fase seguinte, e o número existe. Ele está em `docs/perf/` e em
-- `docs/RELATORIO-F38.md`; o essencial, medido no ENSAIO com **500.000 lançamentos**
-- (marcador PERF-F38, populado e apagado na mesma sessão, contagem antes/depois
-- conferida — 23 lançamentos antes, 23 depois):
--
--   rel_saldo_colaborador(uuid)      SEM índice  111,56 ms   COM índice   9,22 ms   → 12,1× mais rápido
--   INSERT com colaborador_id        SEM índice    2,64 ms   COM índice   2,83 ms   → +0,19 ms (+7,2%)
--   tamanho                          5,5 MB de índice sobre 71 MB de tabela (7,7%)
--
-- E o plano explica o porquê: `rel_saldo_colaborador` é a ÚNICA consulta do sistema
-- que filtra `lancamentos_item` por `colaborador_id` **sem** o par (item, filial).
-- Nenhum índice existente a serve, nem parcialmente — `lanc_item_item_filial_idx`
-- começa por `item_id`. Sem este, é sempre varredura da tabela inteira, e o custo
-- cresce com o TAMANHO DA TABELA, não com quanto a pessoa tem: 9.833 buffers lidos
-- para devolver 250 linhas, contra 869 com o índice.
--
-- ⚠ A LEITURA É INTERATIVA, E TAMBÉM ESTÁ NO CAMINHO DE ESCRITA. Ela alimenta o
-- bloco "Com esta pessoa" (/admin/colaboradores e o diálogo de devolução) E a regra
-- §C.3: a action consulta o saldo da pessoa ANTES de gravar o `retorno`, para
-- decidir se a linha carrega o vínculo. Sem o índice, cada devolução com item
-- pagaria a varredura.
--
-- ---------------------------------------------------------------------------
-- O QUE A CURVA DECIDIU **NÃO** FAZER
-- ---------------------------------------------------------------------------
-- Nada além deste índice. A curva dos três patamares mostrou que o custo por
-- INSERT do trigger `valida_lancamento_item` no par quente é **PLANO** — 3,3 ms aos
-- 10 mil, 3,3 ms aos 100 mil, 3,5 ms aos 500 mil —, porque `lanc_item_item_filial_idx`
-- já serve a agregação por par. O driver quadrático que a F37 previu LENDO O CÓDIGO
-- não se materializa em campo. Portanto: **nenhum saldo materializado, nenhum cache,
-- nenhuma paginação nova** — exatamente o que a ordem F38 proíbe sem número, e agora
-- também o que o número desaconselha.
--
-- ROLLBACK LÓGICO: `drop index public.lanc_item_colaborador_idx;`
-- ===========================================================================

create index if not exists lanc_item_colaborador_idx
  on public.lancamentos_item (colaborador_id, item_id, filial_id);

comment on index public.lanc_item_colaborador_idx is
  'F38 (0120 · D6): serve rel_saldo_colaborador e a guarda de retorno por pessoa. ENTROU COM MEDIÇÃO: no ensaio com 500 mil lançamentos, a leitura caiu de 111,56 ms para 9,22 ms (12,1×) ao custo de +0,19 ms por INSERT e 7,7% do tamanho da tabela. A 0113 recusou este mesmo índice por falta de número; o número veio.';

-- ===== SMOKE (rodar depois de aplicar — só leitura) =====
--   select indexname, indexdef from pg_indexes
--    where schemaname='public' and tablename='lancamentos_item'
--      and indexname='lanc_item_colaborador_idx';
--   -- esperado: 1 linha, (colaborador_id, item_id, filial_id)
--
--   select pg_size_pretty(pg_relation_size('public.lanc_item_colaborador_idx'));
--   -- em produção, com 30 lançamentos: alguns KB
