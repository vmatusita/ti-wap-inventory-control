-- =============================================================================
-- 0144 — a fila de consolidação de colaboradores calcula a chave uma vez por NOME, não por
--        linha (F60 · Frente D · lote 2 · decisão 8)
-- =============================================================================
-- `create or replace view public.v_colaboradores_textos`: MESMAS colunas, na mesma ordem, com os
-- mesmos tipos; `security_invoker` mantido; nenhuma função, tabela, trigger ou policy tocada.
-- `v_colaboradores_consolidacao` (o resumo) lê esta view e herda a mudança sem ser recriada.
--
-- -----------------------------------------------------------------------------
-- A CAUSA (fato 21 · PLAN-F60 §1.2 (g), §3.5 B3 e §3.6 — medido em produção em 16/09/2026)
-- -----------------------------------------------------------------------------
-- `/admin/colaboradores` lê a view DUAS vezes por render (a fila e o resumo): 90,18 ms e
-- 83,37 ms de banco — o maior custo de banco medido na fase. O corpo vivo (`0115`) agrupa a
-- união `movimentacoes ∪ lancamentos_item` por `public.colaborador_chave(t.nome)`, e essa chave
-- é calculada UMA VEZ POR LINHA da união (1.465 + 97 linhas com colaborador em produção).
-- `colaborador_chave` é `language sql` com `set search_path` — função com `SET` não é embutida
-- pelo planejador, então cada linha paga uma chamada de função de verdade. O plano de hoje,
-- acumulado por nó: `Seq Scan movimentacoes` 47,2 ms → `Append` 49,8 → **`Result` (a chave por
-- linha) 84,9** → `Sort` 88,0 → `Aggregate` 92,4. Paginar a tela não corta isso: o agregado roda
-- inteiro antes do `limit`.
--
-- -----------------------------------------------------------------------------
-- A CORREÇÃO — materializar o recorte ANTES do agregado
-- -----------------------------------------------------------------------------
-- A união é reduzida a `(nome, filial_id, n)` (`nf`) ANTES de chamar a chave; a chave é
-- calculada uma vez por NOME DISTINTO (`nk` — 979 nomes em produção, contra 1.562 linhas); e o
-- que o `mode()` e o `count(distinct …)` faziam sobre as linhas é reproduzido sobre as contagens:
--
--   · `grafia_exemplo` = `mode() within group (order by t.nome)`: o nome MAIS FREQUENTE do
--     grupo e, no empate, o MENOR na ordem da mesma collation (é assim que `mode()` resolve
--     empate — o primeiro valor na ordem do `order by`). Reproduzido por `por_nome` (a soma de
--     `n` por chave × nome) e `(array_agg(pn.nome order by pn.n desc, pn.nome))[1]` — a mesma
--     collation da coluna, porque é o mesmo `order by` sobre o mesmo texto.
--   · `filial_id` = `mode() within group (order by t.filial_id)`: a filial mais frequente do
--     grupo e, no empate, a de MENOR id. Reproduzido por `por_filial` com `row_number() over
--     (partition by nome_chave order by sum(n) desc, filial_id)` e `pos = 1`.
--   · `ocorrencias` = `count(*)` das linhas do grupo = `sum(pn.n)`; `grafias` = `count(distinct
--     t.nome)` = o número de linhas de `por_nome` do grupo (`count(*)`, uma por nome distinto).
--   · o `where` final (a chave aparada contra os seis espaços ASCII e o NBSP, `0115`) e o `left
--     join` com `colaboradores` ficam idênticos.
--   A igualdade de chave entre `nk` e `nf` é por `nome` exato (collation determinística padrão):
--   cada linha da união cai no MESMO grupo em que cairia pela chave calculada por linha.
--
-- -----------------------------------------------------------------------------
-- A MEDIÇÃO (`docs/perf/f60-colaboradores-emulacao-producao.json`, produção, só leitura)
-- -----------------------------------------------------------------------------
-- 1 aquecimento + 5 medidas intercaladas, a view de hoje × este corpo emulado inline; resultado
-- conferido por contagem e md5 do conjunto (`string_agg(r::text order by r::text)`):
--   v0 (`0115`)             922 linhas · md5 c2320c5e… · 121,8 · 100,1 · 100,2 · 100,0 · 101,9 ms
--   v1 (este corpo)         922 linhas · md5 c2320c5e… ·  49,3 ·  50,2 ·  49,8 ·  50,1 ·  55,1 ms
-- A chave por nome distinto sozinha, na parte de movimentações: 41,05 ms por linha contra 32,97 ms
-- por nome distinto; o filtro `btrim` sozinho, 2,44 ms.
--
-- -----------------------------------------------------------------------------
-- QUANDO APLICAR — depois do deploy, na janela do drop (PLAN-F60 §8 e §9)
-- -----------------------------------------------------------------------------
-- A view muda o PLANO do que a `1.64.0` no ar lê, não o resultado; ainda assim vai a produção só
-- depois do deploy da `1.65.0`, junto da `0145`, para que "antes" e "depois" da sonda abaixo
-- sejam lidos com o app novo e o mesmo acervo. No ensaio (sem app de produção), na ordem normal.
--
-- -----------------------------------------------------------------------------
-- VERIFICAÇÃO — a sonda de igualdade de conjunto, antes E depois do apply (só leitura)
-- -----------------------------------------------------------------------------
--   IMEDIATAMENTE ANTES do apply, e de novo IMEDIATAMENTE DEPOIS, no mesmo banco:
--     select count(*) as linhas,
--            md5(string_agg(v::text, '|' order by v::text)) as conjunto
--       from public.v_colaboradores_textos v;
--   esperado: os DOIS pares iguais (mesmas linhas, mesmo md5). Diferente → rollback abaixo, sem
--   discussão: a tela não pode perder linha nem número.
--   E, como a 0115 já pedia:
--     · `reloptions` de `public.v_colaboradores_textos` em `pg_class` = `{security_invoker=true}`;
--     · `v_colaboradores_consolidacao` com `ja_cadastrado = false` soma os mesmos grupos que a
--       view lista com `not ja_cadastrado`;
--     · `notify pgrst, 'reload schema'`.
--
-- -----------------------------------------------------------------------------
-- ROLLBACK — em prosa
-- -----------------------------------------------------------------------------
-- Reemitir a view `public.v_colaboradores_textos` com o corpo da `0115` (o agregado por
-- `colaborador_chave(t.nome)` com os dois `mode()`), por `create or replace view` — as colunas
-- são as mesmas nos dois sentidos, então o rollback independe do app —, e `notify pgrst, 'reload
-- schema'`. Em banco real, por migration NOVA de reversão, com `npm run db:lock`.
-- =============================================================================

create or replace view public.v_colaboradores_textos
with (security_invoker = true) as
  with t as (
    select m.colaborador as nome, m.filial_id
      from public.movimentacoes m
     where btrim(coalesce(m.colaborador, '')) <> ''
    union all
    select l.colaborador, l.filial_id
      from public.lancamentos_item l
     where btrim(coalesce(l.colaborador, '')) <> ''
  ),
  nf as (
    select nome, filial_id, count(*) as n
      from t
     group by nome, filial_id
  ),
  nk as (
    select d.nome, public.colaborador_chave(d.nome) as nome_chave
      from (select distinct nome from nf) d
  ),
  por_nome as (
    select k.nome_chave, f.nome, sum(f.n) as n
      from nf f
      join nk k on k.nome = f.nome
     group by k.nome_chave, f.nome
  ),
  por_filial as (
    select k.nome_chave, f.filial_id, sum(f.n) as n,
           row_number() over (partition by k.nome_chave order by sum(f.n) desc, f.filial_id) as pos
      from nf f
      join nk k on k.nome = f.nome
     group by k.nome_chave, f.filial_id
  ),
  g as (
    select pn.nome_chave,
           (array_agg(pn.nome order by pn.n desc, pn.nome))[1] as grafia_exemplo,
           sum(pn.n)::bigint as ocorrencias,
           count(*)::bigint as grafias
      from por_nome pn
     group by pn.nome_chave
  )
  select g.nome_chave, g.grafia_exemplo, g.ocorrencias, g.grafias, pf.filial_id,
         (c.id is not null) as ja_cadastrado,
         c.id               as colaborador_id
    from g
    join por_filial pf on pf.nome_chave = g.nome_chave and pf.pos = 1
    left join public.colaboradores c on c.nome_chave = g.nome_chave
   where btrim(
           coalesce(g.nome_chave, ''),
           ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(160)
         ) <> '';
