-- Migration 0052 — F18: fontes de leitura das pendências de item.
--
-- `v_pendencias` NÃO muda (§A3) — após o backfill (0053) ela simplesmente deixa de
-- ter linhas 'itens faltantes' (o texto sai do campo livre). Duas views novas,
-- ambas security_invoker = true (o operador vê sob RLS; o viewer por senha é `anon`
-- e não alcança — /pendencias é bloqueada no proxy; o relatório do viewer roda sob
-- service_role, que bypassa RLS e recebe só CONTAGEM):
--
--  * v_pendencias_item — TODAS as linhas (abertas E resolvidas) com joins de
--    ativo/filial/movimentação/profile. Serve a ficha do ativo (histórico com
--    desfecho/quem/quando), a leitura da resolução e as contagens. `desde` = data
--    da devolução geradora.
--
--  * v_fila_pendencias — a FONTE ÚNICA da página /pendencias e dos chips/badge:
--    v_pendencias (não-item) UNION ALL v_pendencias_item (só ABERTAS). O item vira
--    uma linha com `pendencia` sintetizada 'itens faltantes: <item>' para reusar,
--    SEM tocar, toda a máquina da camada de queries (classificarPendencia, os
--    filtros de tipo/busca, a paginação por range com desempate estável, os blocos
--    do CSV). O colaborador da ÉPOCA entra no slot `colaborador_atual` (a UI e a
--    busca já leem dali) — NUNCA o colaborador_atual do ativo. `ordem` é o desempate
--    ESTÁVEL único por LINHA (ativo_id nos não-item; pendencia_item_id nos item —
--    um mesmo ativo pode ter termo pendente E itens abertos, então o id do ativo
--    não desempata sozinho). `id` segue sendo o id do ativo (link da ficha);
--    `pendencia_item_id` alimenta o "Resolver".
--
-- DECISÃO (docs/DECISOES.md 2026-07-24 · F18): escolhi compor as duas fontes numa
-- VIEW unificadora lida pela camada de queries — o desenho mais simples que sustenta
-- filtros + paginação estável + CSV = tela, porque a fonte grande (v_pendencias,
-- ~1,1k linhas) sofre o corte de 1.000 linhas do PostgREST: um merge em JS exigiria
-- paginar a fonte grande inteira a cada página; a view deixa o Postgres ordenar e
-- fatiar, e a camada de queries reaproveita o range/416/blocos já provados.
--
-- Aditiva (só cria views; nenhum delete/drop/UPDATE de dado) → caminho A do RUNBOOK.

create view public.v_pendencias_item
with (security_invoker = true) as
select
  pi.id,
  pi.ativo_id,
  pi.movimentacao_id,
  pi.item,
  pi.colaborador,
  pi.filial_id,
  f.slug              as filial,
  f.nome              as filial_nome,
  pi.status,
  pi.desfecho,
  pi.observacao,
  pi.resolvida_em,
  pi.resolvida_por,
  pr.nome             as resolvida_por_nome,
  pi.created_at,
  a.patrimonio,
  a.categoria,
  a.marca,
  a.modelo,
  m.data::timestamptz as desde          -- data da devolução geradora
from public.pendencias_item pi
join public.ativos a           on a.id = pi.ativo_id
join public.filiais f          on f.id = pi.filial_id
left join public.movimentacoes m on m.id = pi.movimentacao_id
left join public.profiles pr     on pr.id = pi.resolvida_por;

comment on view public.v_pendencias_item is
  'F18: leitura das pendências de item (abertas E resolvidas) com detalhe de ativo/filial/movimentação/quem-resolveu. desde = data da devolução geradora. security_invoker.';

create view public.v_fila_pendencias
with (security_invoker = true) as
-- Não-item (termo/triagem/patrimonio/outras). v_pendencias não tem itens pós-backfill.
select
  vp.id,
  vp.id             as ativo_id,
  vp.id             as ordem,
  null::uuid        as pendencia_item_id,
  null::text        as item,
  vp.patrimonio,
  vp.categoria,
  vp.filial,
  vp.filial_nome,
  vp.pendencia,
  vp.colaborador_atual,
  vp.setor_atual,
  vp.marca,
  vp.modelo,
  vp.desde
from public.v_pendencias vp
union all
-- Item (só ABERTAS). pendencia sintetizada p/ reusar a classificação/filtros da tela.
select
  vpi.ativo_id      as id,
  vpi.ativo_id,
  vpi.id            as ordem,
  vpi.id            as pendencia_item_id,
  vpi.item,
  vpi.patrimonio,
  vpi.categoria,
  vpi.filial,
  vpi.filial_nome,
  ('itens faltantes: ' || vpi.item) as pendencia,
  vpi.colaborador   as colaborador_atual,
  null::text        as setor_atual,
  vpi.marca,
  vpi.modelo,
  vpi.desde
from public.v_pendencias_item vpi
where vpi.status = 'aberta';

comment on view public.v_fila_pendencias is
  'F18: fonte única de /pendencias, chips e badge. v_pendencias (não-item) UNION ALL v_pendencias_item aberto. Item vira linha com pendencia "itens faltantes: <item>" e colaborador da época no slot colaborador_atual. ordem = desempate único por linha; id = ativo (link); pendencia_item_id = alvo do Resolver. security_invoker.';
