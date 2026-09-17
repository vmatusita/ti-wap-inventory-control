-- =============================================================================
-- 0143 — as sete rel_* que recortam por filial passam a receber uma LISTA obrigatória
--        (F60 · Frente D · lote 2)
-- =============================================================================
-- A FASE NUMA FRASE: o recorte vira LISTA obrigatória (`p_filiais smallint[]`), ligada a uma
-- coluna por `= any (p_filiais)` como conjunção direta, e o nulo deixa de significar "tudo" —
-- sem mudar um número de tela. Esta migration CRIA as sete substitutas, com nome novo
-- (`<nome antigo>_filiais`); as sete velhas continuam vivas até a `0145`, que as derruba em
-- arquivo separado, depois do deploy e da prova do `pg_stat_statements` (PLAN-F60 §9).
--
-- -----------------------------------------------------------------------------
-- POR QUE (os fatos 6–9 da ordem, remedidos em produção em 16/09/2026 — PLAN-F60 §1 e §3)
-- -----------------------------------------------------------------------------
--   6. `(p_filial is null or <col> = p_filial)` NÃO corta leitura no caminho REAL. A chamada
--      como o PostgREST a faz (`json_to_record(…) as pgrst_body(…), lateral public.<fn>(…)`)
--      entra na função com `set search_path`, que não é embutida: o plano é o GENÉRICO, e nele
--      o `is null or` vira filtro de SAÍDA. Medido (forma b, plano genérico, N = 7): o as-of da
--      menor filial devolve 5 linhas lendo os MESMOS 368 buffers do consolidado de 1.624;
--      `rel_mov_por_mes` lê 201 buffers em 365 dias nos três recortes; nenhuma célula de filial
--      chega a `mov_filial_data_idx`. `EXPLAIN` com literal no lugar do argumento mente sobre
--      isso — por isso a medição nunca usou literal.
--   7. `NOT NULL` não existe em parâmetro de função. O "não-anulável" é a própria forma: `=
--      any` de NULL é NULL e de `'{}'` é falso, então as sete devolvem ZERO linhas para os dois,
--      sem erro. Nenhuma é `strict` (daria o mesmo vazio, e seria mais uma diferença de texto
--      sem ganho de plano enquanto houver `set search_path`). A segunda camada é a porta
--      (`src/lib/supabase/rpc.ts`: as sete saem de `ARGUMENTOS_ANULAVEIS`, e `null` deixa de
--      compilar); a terceira é a trava (`rpcs-recorte-sql.test.ts` na mesa e o bloco 7 de
--      `supabase/tests/catalogo_secdef.sql` no catálogo do CI).
--   8. A filial do as-of é CALCULADA na data (a da última movimentação efetiva), não a de hoje
--      — e o recorte vale sobre ela. Ver o bloco do as-of, abaixo.
--   9. O consolidado de hoje (`p_filial null`) inclui filial DESATIVADA; a lista de filiais do
--      app (`listarFiliais`) não. O consolidado passa a ser a lista EXPLÍCITA de TODAS as
--      filiais, inclusive as desativadas (`filiaisDoConsolidado`/`recorteDeFiliais`, em
--      `src/lib/queries/relatorios/recorte-filiais.ts`). Como `ativos`, `movimentacoes` e
--      `lancamentos_item` têm `filial_id` NOT NULL com FK para `filiais`, essa lista cobre
--      exatamente o conjunto que o nulo cobria: o número não muda.
--
-- -----------------------------------------------------------------------------
-- A MEDIÇÃO — antes de qualquer apply (a migration aplicada não se edita: a trava de hash)
-- -----------------------------------------------------------------------------
-- EQUIVALÊNCIA (`scripts/perf/equivalencia-rel.mjs`, corpo NOVO emulado inline, só leitura, ×
-- a função VELHA do banco; `count(*)` e md5 do conjunto ordenado das MESMAS colunas, com o
-- mesmo tipo): as 12 datas de amostra (`docs/perf/f60-datas-amostra.json`) × (consolidado = a
-- lista de todas as filiais, e cada filial com `array[id]`), janelas 7d e 365d nas funções de
-- período, e três comparações por célula no saldo de itens (o nível do total contra o
-- consolidado velho, o nível do total de UMA filial contra a velha dela, e as linhas por filial
-- da chamada com todas contra a velha de cada uma). Resultado, nos DOIS bancos: 1.004 células,
-- 1.004 iguais, zero divergência (as oito funções do lote, com `rel_contagem_status_filiais`);
-- NULL e `'{}'` → 0 linhas, sem erro, nas oito; a velha com NULL devolvia o acervo inteiro (o
-- as-of: 1.624 linhas em produção, 1.564 no ensaio).
-- CUSTO (produção, forma b do `medir-rel.mjs` sobre o corpo novo; `f60-custo-corpos-novos-
-- producao.json`): as cinco simples e o saldo ficam na casa de 1–2 ms, como estavam; o as-of é
-- o único que custa mais — ver o bloco dele.
--
-- -----------------------------------------------------------------------------
-- O QUE MUDA NO CORPO DE CADA UMA (o diff contra o corpo vivo da velha)
-- -----------------------------------------------------------------------------
-- · `rel_mov_por_mes_filiais`, `rel_por_motivo_filiais`, `rel_resumo_filiais` (corpo vivo
--   `0011`) e `rel_frescor_itens_filiais` (corpo vivo `0016`) — SÓ o recorte: a linha
--   `and (p_filial is null or <col> = p_filial)` vira `and <col> = any (p_filiais)`, e o
--   primeiro parâmetro troca de nome e de tipo. Nada mais (`diff` medido contra o corpo que
--   `corpo-vigente.mjs` resolve: a assinatura e UMA linha de `where`).
-- · `rel_mov_itens_filiais` (`0016`) — o recorte, E UM ACRÉSCIMO DECLARADO: `where exists (select
--   1 from public.filiais f where f.id = any (p_filiais))`. O corpo devolve uma linha por item do
--   CATÁLOGO mesmo sem lançamento (o `left join` com o recorte no `on`); sem a guarda, NULL e
--   `'{}'` devolveriam o catálogo inteiro zerado em vez de zero linhas — o nulo voltaria a
--   significar alguma coisa. Com uma lista não vazia de filiais que existem, a guarda é
--   verdadeira e o resultado é o de antes, linha a linha (a equivalência o prova).
-- · `rel_saldo_itens_filiais` (`0027`) — DOIS NÍVEIS NUMA CHAMADA, com `filial_id` na frente:
--   uma linha por (filial do recorte, item) e o NÍVEL DO TOTAL (`filial_id` NULL), calculado
--   com os MESMOS clamps do corpo antigo sobre o CONJUNTO do recorte, por `grouping sets
--   ((item_id, filial_id), (item_id))` em `tot` e `((item_id, filial_id, chamado), (item_id,
--   chamado))` em `atrel`. Por que o total não pode ser a soma das colunas: os clamps não são
--   aditivos quando um chamado atravessa filiais — reserva de 5 no chamado X na filial A e
--   liberação de 5 do mesmo chamado na B dão 5 + 0 = 5 atrelados somando as filiais, e 0 no
--   total, onde o `net` do chamado é zero; o mesmo vale para `greatest(0, total_raw)`,
--   `greatest(0, lib_raw)`, `estoque` e `falta`. O nível do total com a lista de TODAS é, por
--   construção, a chamada `p_filial null` de hoje; o de uma filial só é a linha dela. É isso
--   que deixa `/itens` ler colunas (as filiais ativas) e consolidado (tudo, com a desativada)
--   NUMA ida, sem o 1 + N de hoje, e mantém `estoqueForaDasColunas` > 0 exatamente quando há
--   estoque fora das colunas. NULL e `'{}'` → a CTE `alvo` vazia → `niveis` vazia → 0 linhas
--   (o `null::smallint where exists (select 1 from alvo)` impede o nível do total de nascer
--   sozinho). O retorno ganha a coluna `filial_id` — o gerador de tipos a declara não-nula, e a
--   porta a corrige (`COLUNAS_DE_RETORNO_ANULAVEIS`).
--
-- -----------------------------------------------------------------------------
-- O AS-OF — `rel_estoque_asof_filiais` (corpo vivo `0134`), reescrito por lateral
-- -----------------------------------------------------------------------------
-- · ANCORADO EM `ativos`: para cada ativo, uma `cross join lateral` acha a ÚLTIMA movimentação
--   efetiva até a data (`m.ativo_id = a.id and m.data <= p_data and m.tipo <> 'estorno'`, sem
--   estorno até a data, `order by m.data desc, m.ordem desc limit 1`). O `left join ult` + o
--   predicado `existe` da `0134` viram o próprio `cross join`: ativo sem movimentação efetiva
--   até a data não produz linha — o mesmo resultado. O desempate continua `data desc, ordem
--   desc` (a régua da F53; os rótulos 3a→7b de `asof_desempate.sql` continuam provando).
-- · A FILIAL É CALCULADA NA DATA com o MESMO case/coalesce da `0134` (transferência → destino;
--   compra/troca → a da movimentação; `snapshot_anterior ? 'filial_id'` → a anterior; senão
--   `ativos.filial_id`), e o recorte `e.filial_id = any (p_filiais)` vale sobre ELA. SEM
--   PRÉ-FILTRO por `ativos.filial_id`: ele tiraria do relatório da filial A o ativo que estava
--   em A na data e foi para B depois, e poria em B o que só chegou lá depois. Provado pelo
--   cenário "transferido depois da data" em `asof_desempate.sql`, e pela mutação que injeta o
--   pré-filtro.
-- · OS ESTORNOS SÃO CORRELACIONADOS POR ATIVO: `not exists (select 1 from public.movimentacoes x
--   where x.ativo_id = a.id and x.estorno_de = m.id and x.data <= p_data)`. O `x.ativo_id = a.id`
--   é redundante na semântica (o estorno é sempre do MESMO ativo — a trava de `aplicar_movimentacao`)
--   e decisivo no plano: sem ele o anti-join vira um merge que relê o índice de `estorno_de` a
--   cada ativo (~70 ms, 19.829 buffers, medido); com ele, ~54 ms.
-- · `status_tem_detentor` UMA VEZ POR LINHA (a lateral `d`), em vez de duas chamadas por linha
--   nos dois `case` (~54 → ~50 ms). `when not d.tem_detentor then null` é a evidência que o mapa
--   de retornos da porta confere (`rpc-mapas-sql.test.ts`).
-- · SERVIDO POR `mov_ativo_idx` e por `movimentacoes_estorno_de_idx` — `mov_ativo_idx (ativo_id,
--   data desc)` (`0003`) dá a busca da lateral por ativo já na ordem de `data`, e o `ordem desc`
--   desempata as poucas linhas da mesma data num Incremental Sort (≤ 9 movimentações por ativo
--   hoje); `movimentacoes_estorno_de_idx (estorno_de)` (`0106`) serve o `not exists`. Quem medir
--   sem o segundo conclui que a lateral não ajudou.
-- · O ÍNDICE `(ativo_id, data desc, ordem desc)` NÃO ENTROU: o Incremental Sort por ativo é
--   ~7–10% do corpo medido — não paga um índice novo em `movimentacoes` (R-REL-33: índice só
--   pela medição).
-- · O CUSTO, DECLARADO (produção, plano genérico, N = 7; `f60-custo-corpos-novos-producao.json`,
--   chave `asof_rodada_2`, e `f60-asof-variantes-producao.json`): consolidado de hoje, 1.624
--   linhas — corpo novo 65,7 ms de mediana contra 38,9 ms do corpo `0134` na MESMA sessão
--   (1,69×; réplica 54,7 × 34,7 = 1,58×); na filial pequena, 33,0 × 16,9 (1,95×); os buffers vão
--   de 368 para 18.638 (a lateral visita `mov_ativo_idx` uma vez por ativo, 1.635 laços). POR QUE
--   ESTA FORMA MESMO ASSIM: é a única família que a trava de recorte aceita — as mais rápidas
--   medidas (`not in` com subplano em hash, ~38 ms; o corpo `0134` só com o recorte trocado,
--   ~33 ms) leem `movimentacoes` sem correlação com o ativo ou numa CTE descoberta, e a regra R4
--   da mesa (`scripts/db/recorte-rel.mjs`) as recusa; e o custo dela cresce com o NÚMERO DE
--   ATIVOS, não com o histórico de cada um (o `limit 1` lê só o primeiro grupo de data), ao
--   contrário do `0134`, que cresce com todas as movimentações até a data (239 → 378 buffers
--   entre 2024 e hoje). O orçamento do corpo medido mora em `docs/perf/asof-orcamento.json`, e a
--   trava dele reprova quando este corpo mudar sem medição nova. O TTFB "depois" (critério 27)
--   é o juiz; piora fora da faixa se explica por esta causa medida.
-- · `security invoker` volta a ser TEXTO: a `0134` (herdando a `0109`) não a escrevia — o
--   comportamento era o mesmo, o texto não.
--
-- -----------------------------------------------------------------------------
-- GRANTS — o molde das rel_* (`0056`/`0118`/`0141`)
-- -----------------------------------------------------------------------------
-- Função nova em `public` nasce com EXECUTE para PUBLIC/`anon` (fato 11), e a asserção 6a de
-- `catalogo_secdef.sql` reprova invoker alcançável por ele: cada uma leva, NESTA migration, o
-- `revoke all … from public, anon` e o `grant execute … to authenticated, service_role`. O
-- `service_role` é o visualizador por senha (`resolverAcessoRelatorio`, client administrativo)
-- — sem ele o relatório impresso some; a 7e o exige.
--
-- NÃO toca dado, não recria nem derruba função existente, não mexe em enum: é inteiramente
-- aditiva. A `1.64.0` no ar nunca chama nome nenhum daqui — o apply antes do merge não muda
-- nada para quem opera.
--
-- -----------------------------------------------------------------------------
-- VERIFICAÇÃO PÓS-APPLY (cada banco, ensaio primeiro; só leitura, só números)
-- -----------------------------------------------------------------------------
--   1) uma assinatura por nome, sem overload — em `pg_proc`/`pg_namespace`, para `proname in`
--      as sete: exatamente sete linhas, cada `oid::regprocedure` com `smallint[]` na frente.
--   2) atributos (a 7d): `prosecdef = false`, `provolatile = 's'`, `proisstrict = false`,
--      `proconfig = {search_path=public}` nas sete.
--   3) grants por papel, com `has_function_privilege(<papel>, <assinatura>, 'execute')`:
--      `anon` false, `authenticated` true, `service_role` true nas sete; e a `proacl` sem a
--      entrada de PUBLIC (`=X/`).
--   4) o corpo aplicado é o do arquivo: `md5(regexp_replace(prosrc, '\s+', ' ', 'g'))` igual ao
--      md5 do corpo deste arquivo, com todo espaço colapsado em um — medidos na equivalência:
--        rel_mov_por_mes_filiais    f961349ded4db3fb17a16fe503b9201b
--        rel_por_motivo_filiais     4340acc35728a592c2de946aea822042
--        rel_resumo_filiais         ad948cbb7c544eec083d271b8cf27184
--        rel_frescor_itens_filiais  edd2fa35a094951f31b3cfeacc8f7ba8
--        rel_mov_itens_filiais      55be37e2a84b5e9449f388498585b02b
--        rel_saldo_itens_filiais    01aa17a8aee42557345de6f4f77fba02
--        rel_estoque_asof_filiais   54943d2f41e17dd1c648b32e10fd43f4
--   5) NULL e vazio não são "tudo": `count(*)` de cada uma chamada com `null` e com `'{}'` (e as
--      datas de hoje) dá 0, sem erro.
--   6) `notify pgrst, 'reload schema'`.
--   7) a equivalência com a FUNÇÃO de verdade (não mais o corpo colado) nas mesmas células,
--      antes do merge, e `get_advisors(security)` sem achado novo.
--
-- -----------------------------------------------------------------------------
-- ROLLBACK — escrito em PROSA, de propósito
-- -----------------------------------------------------------------------------
-- `scripts/db/corpo-vigente.mjs` lê definição de função também dentro de comentário, e pseudo-SQL
-- de função aqui engoliria o corpo real logo abaixo (a armadilha medida na F53). A receita se
-- descreve; não se cola.
--   · ANTES DO DROP DAS VELHAS (a `0145` não aplicada): se o app que chama estas funções já
--     estiver no ar, reverter o APP PRIMEIRO (`git revert` do merge + redeploy — o app volta a
--     chamar as sete velhas, que existem); só então derrubar as sete `rel_*_filiais` desta
--     migration (as assinaturas com `smallint[]` na frente, listadas nos `revoke` do fim) e
--     `notify pgrst, 'reload schema'`. Derrubar antes do revert quebra o app novo no ar com 404
--     do PostgREST.
--   · DEPOIS DO DROP DAS VELHAS: primeiro recriar as velhas (o rollback da `0145`), depois
--     reverter o app, e só então derrubar estas.
--   · Em banco real, sempre por migration NOVA de reversão (a aplicada não se edita), com `npm
--     run db:lock`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) as movimentações por mês (corpo vivo 0011) — só o recorte.
-- ---------------------------------------------------------------------------
create function public.rel_mov_por_mes_filiais(
  p_filiais smallint[],
  p_de      date,
  p_ate     date
) returns table (mes date, tipo public.tipo_movimentacao, total bigint)
language sql stable security invoker set search_path = public as $$
  select date_trunc('month', m.data)::date as mes, m.tipo, count(*)::bigint
  from public.movimentacoes m
  where m.tipo in ('saida', 'devolucao')
    and m.data between p_de and p_ate
    and m.filial_id = any (p_filiais)
  group by 1, 2
  order by 1, 2;
$$;

revoke all on function public.rel_mov_por_mes_filiais(smallint[], date, date) from public, anon;
grant execute on function public.rel_mov_por_mes_filiais(smallint[], date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) saídas e devoluções por motivo (corpo vivo 0011) — só o recorte.
-- ---------------------------------------------------------------------------
create function public.rel_por_motivo_filiais(
  p_filiais smallint[],
  p_de      date,
  p_ate     date
) returns table (tipo public.tipo_movimentacao, motivo text, total bigint)
language sql stable security invoker set search_path = public as $$
  select m.tipo,
         coalesce(mo.rotulo, m.motivo, 'Outro') as motivo,
         count(*)::bigint
  from public.movimentacoes m
  left join public.motivos mo on mo.codigo = m.motivo
  where m.tipo in ('saida', 'devolucao')
    and m.data between p_de and p_ate
    and m.filial_id = any (p_filiais)
  group by m.tipo, coalesce(mo.rotulo, m.motivo, 'Outro')
  order by 3 desc;
$$;

revoke all on function public.rel_por_motivo_filiais(smallint[], date, date) from public, anon;
grant execute on function public.rel_por_motivo_filiais(smallint[], date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) o resumo no formato do e-mail (corpo vivo 0011) — só o recorte. `ativos`, `filiais` e
--    `motivos` entram por chave primária a partir da linha de `movimentacoes` já recortada.
-- ---------------------------------------------------------------------------
create function public.rel_resumo_filiais(
  p_filiais smallint[],
  p_de      date,
  p_ate     date
) returns table (
  tipo        public.tipo_movimentacao,
  filial_slug text,
  filial_nome text,
  motivo      text,
  categoria   public.categoria_ativo,
  total       bigint
) language sql stable security invoker set search_path = public as $$
  select m.tipo, f.slug, f.nome,
         coalesce(mo.rotulo, m.motivo, 'Outro') as motivo,
         a.categoria, count(*)::bigint
  from public.movimentacoes m
  join public.ativos a  on a.id = m.ativo_id
  join public.filiais f on f.id = m.filial_id
  left join public.motivos mo on mo.codigo = m.motivo
  where m.tipo in ('saida', 'devolucao')
    and m.data between p_de and p_ate
    and m.filial_id = any (p_filiais)
  group by m.tipo, f.slug, f.nome, coalesce(mo.rotulo, m.motivo, 'Outro'), a.categoria
  order by f.nome, motivo, a.categoria;
$$;

revoke all on function public.rel_resumo_filiais(smallint[], date, date) from public, anon;
grant execute on function public.rel_resumo_filiais(smallint[], date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) o frescor dos itens por grupo (corpo vivo 0016) — só o recorte.
-- ---------------------------------------------------------------------------
create function public.rel_frescor_itens_filiais(
  p_filiais smallint[],
  p_ate     date
) returns table (grupo public.grupo_item, ultima date)
language sql stable security invoker set search_path = public as $$
  select i.grupo, max(l.data) as ultima
  from public.lancamentos_item l
  join public.itens i on i.id = l.item_id
  where l.data <= p_ate
    and l.filial_id = any (p_filiais)
  group by i.grupo;
$$;

revoke all on function public.rel_frescor_itens_filiais(smallint[], date) from public, anon;
grant execute on function public.rel_frescor_itens_filiais(smallint[], date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) entradas e saídas de itens no período (corpo vivo 0016) — o recorte E a guarda `exists`
--    (ver o cabeçalho: sem ela, NULL e vazio devolveriam o catálogo zerado).
-- ---------------------------------------------------------------------------
create function public.rel_mov_itens_filiais(
  p_filiais smallint[],
  p_de      date,
  p_ate     date
) returns table (
  item_id  smallint,
  item     text,
  grupo    public.grupo_item,
  ordem    int,
  entradas bigint,
  saidas   bigint
) language sql stable security invoker set search_path = public as $$
  select i.id, i.nome, i.grupo, i.ordem,
         coalesce(sum(case when l.tipo = 'entrada' then l.quantidade else 0 end), 0)::bigint,
         coalesce(sum(case when l.tipo = 'saida'   then l.quantidade else 0 end), 0)::bigint
  from public.itens i
  left join public.lancamentos_item l
    on l.item_id = i.id
   and l.data between p_de and p_ate
   and l.filial_id = any (p_filiais)
  where exists (select 1 from public.filiais f where f.id = any (p_filiais))
  group by i.id, i.nome, i.grupo, i.ordem
  order by i.grupo, i.ordem, i.nome;
$$;

revoke all on function public.rel_mov_itens_filiais(smallint[], date, date) from public, anon;
grant execute on function public.rel_mov_itens_filiais(smallint[], date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) o saldo de itens em DOIS NÍVEIS (corpo vivo 0027) — as linhas por filial do recorte e o
--    nível do total (`filial_id` NULL), com os clamps sobre o CONJUNTO (ver o cabeçalho).
-- ---------------------------------------------------------------------------
create function public.rel_saldo_itens_filiais(
  p_filiais smallint[],
  p_ate     date
) returns table (
  filial_id smallint,
  item_id   smallint,
  item      text,
  grupo     public.grupo_item,
  ordem     int,
  total     bigint,
  estoque   bigint,
  atrelados bigint,
  falta     bigint
) language sql stable security invoker set search_path = public as $$
  with alvo as (
    select f.id as filial_id
    from public.filiais f
    where f.id = any (p_filiais)
  ),
  niveis as (
    select a.filial_id from alvo a
    union all
    select null::smallint where exists (select 1 from alvo)
  ),
  rows as (
    select l.item_id, l.filial_id, l.chamado, l.tipo::text as tipo, l.quantidade
    from public.lancamentos_item l
    where l.data <= p_ate
      and l.filial_id = any (p_filiais)
  ),
  tot as (
    select item_id, filial_id,
           sum(case tipo when 'entrada' then quantidade
                         when 'ajuste'  then quantidade else 0 end) as total_raw,
           sum(case tipo when 'saida'   then quantidade
                         when 'retorno' then -quantidade else 0 end) as lib_raw
    from rows
    group by grouping sets ((item_id, filial_id), (item_id))
  ),
  atrel as (
    select item_id, filial_id, sum(greatest(0, net)) as atrelados from (
      select item_id, filial_id, chamado,
             sum(case tipo when 'reserva'   then quantidade
                           when 'liberacao' then -quantidade else 0 end) as net
      from rows where chamado is not null
      group by grouping sets ((item_id, filial_id, chamado), (item_id, chamado))
    ) b group by item_id, filial_id
  ),
  por_item as (
    select n.filial_id, i.id, i.nome, i.grupo, i.ordem,
           greatest(0, coalesce(t.total_raw, 0)) as total,
           coalesce(a.atrelados, 0)              as atrelados,
           greatest(0, coalesce(t.lib_raw, 0))   as liberados
    from niveis n
    cross join public.itens i
    left join tot   t on t.item_id = i.id and t.filial_id is not distinct from n.filial_id
    left join atrel a on a.item_id = i.id and a.filial_id is not distinct from n.filial_id
    where i.ativo = true or t.item_id is not null or a.item_id is not null
  )
  select p.filial_id, p.id, p.nome, p.grupo, p.ordem,
         p.total::bigint,
         greatest(0, p.total - p.atrelados - p.liberados)::bigint                     as estoque,
         p.atrelados::bigint,
         greatest(0, p.atrelados + p.liberados - p.total)::bigint                      as falta
  from por_item p
  order by p.filial_id nulls first, p.grupo, p.ordem, p.nome;
$$;

revoke all on function public.rel_saldo_itens_filiais(smallint[], date) from public, anon;
grant execute on function public.rel_saldo_itens_filiais(smallint[], date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) o estado do acervo numa data (corpo vivo 0134) — a lateral ancorada em `ativos`, a filial
--    calculada na data, os estornos correlacionados por ativo (ver o cabeçalho).
-- ---------------------------------------------------------------------------
create function public.rel_estoque_asof_filiais(
  p_filiais smallint[],
  p_data    date
) returns table (
  ativo_id    uuid,
  categoria   public.categoria_ativo,
  marca       text,
  modelo      text,
  filial_id   smallint,
  status      public.status_ativo,
  colaborador text,
  setor       text
) language sql stable security invoker set search_path = public as $$
  select a.id, a.categoria, a.marca, a.modelo, e.filial_id, e.status, e.colaborador, e.setor
  from public.ativos a
  cross join lateral (
    select m.tipo, m.filial_id, m.filial_destino_id, m.snapshot_anterior,
           m.status_resultante, m.colaborador, m.setor
    from public.movimentacoes m
    where m.ativo_id = a.id
      and m.data <= p_data
      and m.tipo <> 'estorno'
      and not exists (
        select 1 from public.movimentacoes x
        where x.ativo_id = a.id
          and x.estorno_de = m.id
          and x.data <= p_data
      )
    order by m.data desc, m.ordem desc
    limit 1
  ) u
  cross join lateral (
    select public.status_tem_detentor(coalesce(u.status_resultante, 'em_estoque')) as tem_detentor
  ) d
  cross join lateral (
    select
      coalesce(
        case
          when u.tipo = 'transferencia' then u.filial_destino_id
          when u.tipo in ('compra','troca') then u.filial_id
          when u.snapshot_anterior ? 'filial_id'
            then nullif(u.snapshot_anterior ->> 'filial_id', '')::smallint
          else a.filial_id
        end,
        a.filial_id
      ) as filial_id,
      coalesce(u.status_resultante, 'em_estoque') as status,
      case
        when not d.tem_detentor then null
        when u.tipo in ('saida', 'emprestimo', 'reserva') then u.colaborador
        else u.snapshot_anterior ->> 'colaborador'
      end as colaborador,
      case
        when not d.tem_detentor then null
        when u.tipo in ('saida', 'emprestimo', 'reserva') then u.setor
        else u.snapshot_anterior ->> 'setor'
      end as setor
  ) e
  where e.status not in ('descartado', 'devolvido_fornecedor')
    and e.filial_id = any (p_filiais);
$$;

revoke all on function public.rel_estoque_asof_filiais(smallint[], date) from public, anon;
grant execute on function public.rel_estoque_asof_filiais(smallint[], date) to authenticated, service_role;
