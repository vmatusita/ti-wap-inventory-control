-- Migration 0053 — F18: backfill do texto legado 'itens faltantes…' para pendencias_item.
--
-- ALTERA DADOS. Em produção: precedida de backup/export de `ativos` e `movimentacoes`
-- (§R do RUNBOOK). Não faz `delete from ativos/movimentacoes` (só INSERT em
-- pendencias_item + UPDATE em ativos.pendencia), então NÃO bate no gate do
-- classificador. Em Postgres vazio (CI) é no-op (nenhum ativo casa o predicado).
--
-- Regra (mesmo racional da 0049 — o legado da planilha não inunda a fila):
--  1. Para cada ativo com `pendencia ilike '%itens faltantes%'`, localiza a DEVOLUÇÃO
--     GERADORA: a ÚLTIMA movimentação tipo='devolucao' com itens_faltantes não vazio
--     e NÃO marcada como import (observacao not ilike 'import startup%').
--  2. GERADORA existe (origem SISTEMA — devolução real do dia a dia) → cria uma linha
--     ABERTA por item, a partir do ARRAY da movimentação (fonte mais confiável que o
--     parse do texto), com colaborador da época (mov.colaborador, senão
--     snapshot_anterior->>'colaborador') e filial da movimentação.
--  3. GERADORA ausente + origem='importacao' (ou texto escrito pelo import) → DISPENSA
--     (não cria linha). Nota medida em 24/07/2026: o import (importar_ativos_substituir)
--     NÃO escreve 'itens faltantes' nem cria devolução, então TODO texto veio de uma
--     devolução real — na prática este caso tem contagem 0 (defensivo).
--  4. GERADORA ausente + não-import (órfão) → DISPENSA, contado à parte no relatório.
--  5. Em TODOS os casos remove SÓ o trecho 'itens faltantes…' de ativos.pendencia,
--     preservando os demais trechos `;`-joinable (a lista de itens tem VÍRGULAS
--     internas; o separador de trechos é `;`, nunca `,` — mesma semântica de
--     limparTrechoPendencia em src/lib/actions/ativos.ts). updated_at NÃO é tocado
--     (preserva o `desde` das pendências que sobrevivem no mesmo ativo).
--  6. Idempotente: o INSERT roda ANTES do UPDATE; depois do UPDATE nenhum ativo casa
--     '%itens faltantes%', então rodar de novo é no-op. Guarda extra `not exists`
--     no INSERT contra duplicação.
--
-- Medição no ENSAIO (sgmvldiizsrjbxzzpmhh, 24/07/2026): 18 ativos com o texto (todos
-- SISTEMA, 0 dispensa-import, 0 órfão) → 21 linhas abertas criadas; 0 ativos com
-- '%itens faltantes%' depois; buckets termo/triagem/patrimonio/outras idênticos.
-- Produção medida no rollout (ver docs/RELATORIO-F18.md).

-- (1)+(2) SISTEMA: cria as abertas a partir do array da devolução geradora.
insert into public.pendencias_item (ativo_id, movimentacao_id, item, colaborador, filial_id, created_at)
select g.ativo_id,
       g.id,
       u.item,
       coalesce(nullif(g.colaborador, ''), nullif(g.snapshot_anterior ->> 'colaborador', '')),
       g.filial_id,
       g.created_at
from (
  select distinct on (m.ativo_id) m.*
  from public.movimentacoes m
  join public.ativos a on a.id = m.ativo_id
  where a.pendencia ilike '%itens faltantes%'
    and m.tipo = 'devolucao'
    and coalesce(cardinality(m.itens_faltantes), 0) > 0
    and (m.observacao is null or m.observacao not ilike 'import startup%')
  order by m.ativo_id, m.created_at desc, m.id desc
) g
cross join lateral unnest(g.itens_faltantes) as u(item)
where nullif(trim(u.item), '') is not null
  and not exists (select 1 from public.pendencias_item pi where pi.movimentacao_id = g.id);

-- (5) Remove SÓ o trecho 'itens faltantes…' de TODOS os ativos afetados (inclusive os
-- dispensados: fila limpa sem cobrança). Preserva os demais trechos, na ordem.
update public.ativos a set
  pendencia = nullif(
    (select string_agg(trim(x.val), '; ' order by x.ord)
     from unnest(string_to_array(a.pendencia, ';')) with ordinality as x(val, ord)
     where nullif(trim(x.val), '') is not null
       and lower(trim(x.val)) not like 'itens faltantes%'
    ), '')
where a.pendencia ilike '%itens faltantes%';

-- ===== SMOKE (orquestrador — rodar em ensaio e produção; padrão 0049) =====
-- Invariante FORTE: zero ativos com o texto depois. Buckets (não-itens) idênticos.
--   select count(*) as ainda_com_texto from public.ativos where pendencia ilike '%itens faltantes%';  -- esperado 0
--   select count(*) as abertas from public.pendencias_item where status='aberta';                     -- ensaio: 21 (>= abertas criadas)
--   -- buckets antes/depois (termo/triagem/patrimonio/outras): iguais; itens muda de fonte
--   select
--     count(*) filter (where pendencia='termo pendente')                        as termo,
--     count(*) filter (where pendencia='triagem parada')                        as triagem,
--     count(*) filter (where pendencia ilike '%sem patrimônio físico%'
--                        or pendencia ilike '%patrimônio não canônico%')        as patrimonio
--   from public.v_pendencias;
