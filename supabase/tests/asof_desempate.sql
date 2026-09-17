-- =============================================================
-- Roteiro de teste: rel_estoque_asof — DESEMPATE (migration 0054) e AS-OF com
-- ESTORNO (R-REL). Roda no job `banco` do CI (aplica 0001→0055 e executa cada
-- supabase/tests/*.sql). Arquivo NOVO e independente — não toca os demais.
--
-- Prova dois pontos da reconstrução as-of do estoque:
--   1. DESEMPATE (0054, achado C1): quando a `compra` de abertura e o `ajuste` de
--      reconciliação do import caem no MESMO (data, created_at) — o que só ocorre
--      dentro da transação do import de startup — a nova cláusula `(tipo='ajuste')
--      desc` do `order by` faz o AJUSTE (estado real) vencer o empate, espelhando o
--      last-insert-wins do trigger em `ativos`. SEM o fix, o tiebreak por `id desc`
--      pegaria a COMPRA (em_estoque). Montamos o empate com id ALTO na compra e id
--      BAIXO no ajuste: só a cláusula do 0054 evita o resultado errado.
--   2. AS-OF com ESTORNO (par mov+estorno se anula): uma `saida` e o `estorno` dela
--      em datas diferentes → antes do estorno (as-of D1) o ativo aparece em_uso;
--      depois (as-of hoje, o par já anulado) volta a em_estoque, batendo com o
--      estado corrente de `ativos`.
--
-- Convenção do CI: cada passo emite
--   NOTICE  '✓ ...'  quando bate com o esperado
--   WARNING '✗ ...'  quando NÃO bate (o CI falha em qualquer `WARNING: ✗`).
-- Tudo dentro de uma transação que termina em ROLLBACK: NADA é gravado.
-- Pré-requisito: >= 1 profile (operador) e a filial 'matriz' (0007).
-- Dados 100% fictícios (prefixo único ZZF19, colaborador "Fulano").
-- =============================================================
--
-- ================================================================
-- F53 (09/09/2026) — ordem total de `movimentacoes` (migrations 0133/0134).
-- ================================================================
-- Acrescenta 14 rótulos — 3a, 3b, 3c, 4a, 4b, 4c, 4d, 5a, 6a, 7a, 7b, 10a, 10b, 10c — aos
-- 4 que já existiam (1, 2a, 2b, 2c). Ver docs/PLAN-F53.md §4 para o que cada um prova.
-- ⚠ TRÊS deles (4c, 4d, 7b) NÃO estavam no plano: nasceram das SABOTAGENS, que rodaram
-- contra o roteiro e o encontraram cego. A Sabotagem C (devolver a trava do estorno para
-- `(created_at, id)`) deixava 4a/4b VERDES, porque eles montam `created_at` DISTINTOS e aí
-- as duas réguas concordam sempre — 4c/4d montam o empate do import, o único arranjo que
-- discrimina. A Sabotagem D (derrubar `movimentacoes_ordem_uidx`) deixava o roteiro INTEIRO
-- verde — 7b prova o índice pelo EFEITO, com `overriding system value`.
-- Dados fictícios com prefixo ZZF53 (patrimônio) e "Fulano <rótulo>" (colaborador),
-- para não colidir com os fixtures ZZF19 dos cenários antigos.
--
-- CONVENÇÃO DO ARQUIVO (Decisão 9, docs/PLAN-F53.md §1): as asserções de CENÁRIO
-- (que montam 1-3 linhas à mão e comparam o resultado contra o esperado) somam
-- v_ok/v_falhas NA MÃO, como o arquivo já fazia desde a F19/F45. A ÚNICA exceção é
-- o rótulo 3b — a EQUIVALÊNCIA TOTAL, cujo universo (todas as linhas de
-- `movimentacoes` no momento em que ela roda) poderia estar vazio e virar
-- tautologia — ela, e só ela, usa `pg_temp.assert_zero_de`
-- (supabase/tests/_asserts.sql), cujo retorno (boolean) ainda alimenta
-- v_ok/v_falhas do mesmo jeito que as demais.
--
-- ⚠ 3a e 3b RODAM ANTES do CENÁRIO 1 (não depois, como a ordem dos rótulos por si
-- só sugeriria). Motivo, medido: o CENÁRIO 1 usa um id quase-máximo FIXO
-- ('ffffffff-ffff-4fff-8fff-ffffffffffff') para a compra — deliberado, para stressar
-- o tiebreak por `id desc` do desempate ANTIGO (0054) — e o CENÁRIO 2 usa a MESMA
-- data/created_at literal (2026-06-01 10:00) para a própria compra. Os dois nunca
-- interagiram antes porque cada cenário só olhava o PRÓPRIO ativo (`where ativo_id
-- = a`); a partir do momento em que 3b faz uma pergunta GLOBAL ("row_number() sobre
-- TODA a tabela bate com `ordem`, linha a linha?"), a colisão passa a importar: o id
-- quase-máximo do cenário 1 perde, na ordenação ASC por id, do id aleatório do
-- cenário 2 — mesmo tendo sido INSERIDO primeiro (ordem menor) — e isso faz
-- `row_number()` divergir de `ordem` para as 3 linhas envolvidas (medido em
-- ensaio: 3 de 3). Isto não é um defeito da 0133/0134 nem uma lacuna da migration:
-- é um artefato de DOIS FIXTURES ANTIGOS, escritos antes de existir `ordem`, que a
-- regra 1 do CLAUDE.md proíbe alterar. Rodar 3a/3b ANTES do cenário 1 dá à
-- equivalência total um universo limpo (as próprias linhas que 3a acabou de
-- inserir), sem tocar uma linha do que já existia.
-- ================================================================
--
-- ================================================================
-- F60 (16/09/2026) — o as-of com recorte OBRIGATÓRIO (migrations 0143/0145).
-- ================================================================
-- As cinco chamadas de antes passaram para `rel_estoque_asof_filiais(smallint[], date)`, que
-- a 0143 criou e a 0145 deixou sozinha (a assinatura velha, `smallint` com nulo = tudo, foi
-- dropada). O nulo virou a lista de TODAS as filiais, inclusive as desativadas, lida na hora
-- da chamada — `(select array_agg(f.id order by f.id) from public.filiais f)` —, que é o
-- conjunto exato que o nulo cobria (toda linha de `ativos`/`movimentacoes` tem `filial_id`
-- com FK para `filiais`). Os rótulos 1 a 10c provam a MESMA coisa de antes, sobre o corpo
-- novo: o desempate continua `data desc, ordem desc`, agora dentro da lateral.
--
-- Acrescenta TRÊS rótulos — 11a, 11b, 11c — para o que a 0143 mudou de verdade: o corpo é
-- um `cross join lateral` ancorado em `ativos`, e a filial de cada linha é CALCULADA na data
-- (a da última movimentação efetiva até ela), nunca a de hoje. O recorte se aplica sobre a
-- filial calculada. O cenário 11 é o ativo TRANSFERIDO DEPOIS DA DATA — o único arranjo em
-- que "pré-filtrar `ativos` pela filial de hoje para cortar scan" muda o resultado (ver o
-- comentário do cenário). Nenhum dos três é prefixo de rótulo existente, e ele roda por
-- ÚLTIMO (depois de 3b e de 7a, que olham a tabela inteira de `movimentacoes`).
-- ================================================================

begin;

do $$
declare
  v_ok      int := 0;   -- F45: quantas asserções passaram
  v_falhas  int := 0;   -- F45: quantas falharam (a linha FIM soma as duas)
  v_prof   uuid;
  v_matriz smallint;
  a uuid;         -- ativo do cenário 1 (desempate)
  b uuid;         -- ativo do cenário 2 (as-of com estorno)
  v_saida  uuid;  -- id da saída a ser estornada (cenário 2)
  v_asof   public.status_ativo;  -- status as-of do cenário 1
  v_ativo  public.status_ativo;  -- ativos.status (verdade corrente) do cenário 1
  v_d1     public.status_ativo;  -- as-of em D1 (antes do estorno)
  v_now    public.status_ativo;  -- as-of hoje (par anulado)
  v_cur    public.status_ativo;  -- ativos.status corrente do cenário 2

  -- ---- F53: variáveis dos cenários novos ----
  h uuid;                          -- ativo do cenário 3a
  v_data_3a        date;
  v_ordem_compra   bigint;
  v_ordem_ajuste   bigint;
  v_asof3a         public.status_ativo;
  v_div3b          bigint;
  v_univ3b         bigint;
  i uuid;                          -- ativo do cenário 3c
  v_ordem3c_1      bigint;
  v_ordem3c_2      bigint;
  j uuid;                          -- ativo dos cenários 4a/4b/5a
  v_saida4a        uuid;
  v_devol4a        uuid;
  v_estorno4b      uuid;
  k uuid;                          -- ativo do cenário 6a
  v_asof6a         public.status_ativo;
  v_puro6a         public.status_ativo;
  p7a uuid;                        -- ativo do cenário 7a
  p7b uuid;                        -- ativo do cenário 7b (a prova do índice único)
  l uuid;                          -- ativo dos cenários 4c/4d (o empate de created_at)
  v_compra4c       uuid;
  v_ajuste4c       uuid;
  v_max_antes      bigint;
  v_novo_ordem     bigint;
  k_excecoes       text[] := array['apagar_ativo', 'apagar_ativos_conflito_filiais', 'apagar_movimentacao'];
  v_cnt            bigint;
  v_univ           bigint;
  v_lista          text;
  v_corpo10c       text;
  v_pos_recusa     int;
  v_pos_comparacao int;

  -- ---- F60: variáveis do cenário 11 (o transferido depois da data) ----
  t11              uuid;       -- o ativo: em A (a matriz) na data D, em B depois dela
  v_destino11      smallint;   -- B: filial fictícia que nasce no cenário
  v_hoje11         smallint;   -- ativos.filial_id depois da transferência (a filial de HOJE)
  v_em_a_antes     bigint;     -- linhas do ativo no as-of de D, recorte [A]
  v_em_b_antes     bigint;     -- idem, recorte [B]
  v_em_a_depois    bigint;     -- as-of de D+k, recorte [A]
  v_em_b_depois    bigint;     -- as-of de D+k, recorte [B]
  v_cons_antes     bigint;     -- as-of de D, consolidado
  v_cons_depois    bigint;     -- as-of de D+k, consolidado
  v_filial_antes   smallint;   -- a filial CALCULADA no consolidado em D
  v_filial_depois  smallint;   -- idem em D+k
begin
  -- F38: perfil ATIVO e escolha DETERMINÍSTICA. O `limit 1` sem `order by` e sem
  -- filtro podia cair num perfil DESATIVADO (`papel_atual()` devolve null para ele
  -- desde a 0070) — e aí toda guarda de cargo recusava com 42501, num roteiro que
  -- passava verde ontem. É a mesma classe de não-determinismo da pendência nº 5 da
  -- F37, só que em quem o roteiro escolhe como autor.
  select id into v_prof from public.profiles
   where ativo and excluido_em is null
   order by created_at, id limit 1;
  if v_prof is null then
    raise exception 'PRE-REQUISITO: crie ao menos 1 operador (profile) antes de rodar este roteiro';
  end if;
  select id into v_matriz from public.filiais where slug = 'matriz';
  if v_matriz is null then
    raise exception 'PRE-REQUISITO: aplique a migration 0007 (filial matriz)';
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 3a (F53) — duas movimentações do MESMO ativo com (data, created_at)
  -- IGUAIS (a marca do import: compra de abertura + ajuste de reconciliação na
  -- MESMA transação) recebem `ordem` DISTINTA e ORDENADA pela ordem real de
  -- INSERÇÃO — não mais pelo uuid de `id`. O ajuste, inserido DEPOIS (a prática
  -- real do import), ganha `ordem` maior e VENCE o empate em rel_estoque_asof —
  -- a mesma regra que a 0054 resolvia com a cláusula especial `(tipo='ajuste')
  -- desc`, agora reproduzida só por `ordem` (D3, migration 0134).
  --
  -- Roda ANTES do CENARIO 1 (abaixo) — ver a nota no cabeçalho do arquivo sobre
  -- a colisão com os fixtures antigos, que só importa para 3b (a seguir).
  --
  -- ⚠ `data`/`created_at` NÃO são um literal fixo como nos demais cenários: são
  -- calculados como `greatest(max(data) já na tabela, current_date)`, e
  -- `created_at` fica no DEFAULT (`now()`, igual para as duas linhas dentro da
  -- MESMA transação). Isto é o que faz 3b (a seguir) funcionar também contra um
  -- banco com dado PRÉ-EXISTENTE (ensaio/produção, não só o CI vazio): inserir
  -- com uma `data` no MEIO do histórico deslocaria o `row_number()` de toda
  -- linha posterior a ela (a numeração é densa, 1..N), sem mexer no `ordem`
  -- dessas linhas — quebrando 3b por um motivo alheio a 3a. Inserindo sempre no
  -- FIM cronológico do que já existe, 3a nunca perturba o ranking de mais
  -- ninguém (medido: contra ensaio populado, sem este ajuste 3b divergia em
  -- 2195 de 3241 linhas; com ele, 0 de 2 — só as próprias linhas de 3a).
  -- ---------------------------------------------------------------
  select greatest(coalesce((select max(data) from public.movimentacoes), current_date), current_date)
    into v_data_3a;

  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF5300301', 'notebook', v_matriz);
  select id into h from public.ativos where patrimonio = 'ZZF5300301';

  -- ⚠ ids EXPLÍCITOS, e a razão é determinismo, não estilo. Com `gen_random_uuid()`,
  -- a régua ANTIGA (`… created_at desc, id desc`) escolhe entre a compra e o ajuste
  -- por SORTEIO — que é justamente o defeito que 3a existe para acusar. O resultado:
  -- a mutação `f53-asof-volta-ao-desempate-por-id` derrubava 3a em ~metade das
  -- execuções. **Medido no CI (run 34357436376): ela caiu no ensaio e NÃO caiu no
  -- banco limpo do CI**, e o injetor reportou "NÃO detectada" — o diagnóstico errado,
  -- acusando de fraca uma asserção que está certa. id ALTO na compra e BAIXO no
  -- ajuste (o mesmo arranjo do CENÁRIO 1, escrito pela 0054 com o mesmo propósito)
  -- faz a régua antiga errar SEMPRE e a nova acertar SEMPRE.
  insert into public.movimentacoes (id, ativo_id, tipo, data, filial_id, criado_por)
    values ('ffffffff-ffff-4fff-8fff-fffffffffff3', h, 'compra', v_data_3a, v_matriz, v_prof)
    returning ordem into v_ordem_compra;

  insert into public.movimentacoes (id, ativo_id, tipo, data, filial_id, status_resultante, observacao, criado_por)
    values ('00000000-0000-4000-8000-000000000031', h, 'ajuste', v_data_3a, v_matriz, 'em_uso',
            'F53 3a: reconciliacao de import (mesmo instante da compra)', v_prof)
    returning ordem into v_ordem_ajuste;

  select status into v_asof3a from public.rel_estoque_asof_filiais((select array_agg(f.id order by f.id) from public.filiais f), current_date) where ativo_id = h;

  if v_ordem_ajuste is distinct from v_ordem_compra and v_ordem_ajuste > v_ordem_compra
     and v_asof3a = 'em_uso' then
    v_ok := v_ok + 1;
    raise notice '✓ 3a compra e ajuste com (data,created_at) IGUAIS recebem ordem distinta e ordenada (compra=%, ajuste=%), e o par resolve para o AJUSTE (em_uso) só por ordem — sem precisar de (tipo=''ajuste'') no desempate', v_ordem_compra, v_ordem_ajuste;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3a esperado ordem(ajuste) > ordem(compra) e as-of=em_uso, obtido ordem compra=% ajuste=%, as-of=%',
      v_ordem_compra, v_ordem_ajuste, coalesce(v_asof3a::text, '(fora da view)');
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 3b (F53) — a EQUIVALÊNCIA TOTAL: zero linhas onde row_number() sobre
  -- a quádrupla (data, created_at, (tipo='ajuste'), id) difira de `ordem` — a
  -- mesma conferência que a 0133 fez, uma vez, no backfill (0133:128-140), agora
  -- como asserção reexecutável. Universo = TODAS as linhas de `movimentacoes` no
  -- momento em que esta consulta roda (aqui, exatamente as 2 linhas de 3a — ver a
  -- nota do cabeçalho sobre por que isto roda antes do CENARIO 1).
  -- ---------------------------------------------------------------
  -- ⚠ A COMPARAÇÃO É DE POSIÇÃO, NÃO DE VALOR — e a diferença não é estilo.
  -- `ordem == row_number()` só vale enquanto a coluna for DENSA e começar em 1, o que é
  -- verdade no instante do backfill e deixa de ser na primeira transação desfeita: a
  -- sequência de identidade NUNCA devolve os valores consumidos por um `rollback`, então
  -- `ordem` passa a ter buracos (medido: o próprio ensaio ganhou ~211 de folga só com os
  -- ensaios desta fase). Com buracos, `row_number()` (que é sempre 1..N, denso) diverge de
  -- `ordem` em TODAS as linhas posteriores ao primeiro buraco — e a asserção ficaria
  -- vermelha por um motivo que não é defeito nenhum. Gate que nasce vermelho por motivo
  -- legítimo é gate que alguém desliga (asserção da F48).
  -- O que a fase promete, e o que o critério 3 da ordem pede, é sobre a ORDEM: "a ordem ASC
  -- por `ordem` reproduz exatamente a ordem ASC pela quádrupla". Então comparam-se os dois
  -- RANQUES, que são imunes a buraco e ao valor inicial.
  select count(*) into v_univ3b from public.movimentacoes;
  select count(*) into v_div3b
    from (select row_number() over (order by data, created_at, (tipo = 'ajuste'), id) as pela_quadrupla,
                 row_number() over (order by ordem)                                    as pela_ordem
            from public.movimentacoes) t
   where t.pela_quadrupla is distinct from t.pela_ordem;
  if pg_temp.assert_zero_de(
       '3b equivalencia total: a ordem ASC por `ordem` reproduz a ordem ASC pela quadrupla (data, created_at, tipo=ajuste, id), em TODAS as linhas de movimentacoes',
       v_div3b, v_univ3b) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 1 — DESEMPATE (0054, achado C1). Reproduz a transação do import:
  -- a compra de ABERTURA (baseline, em_estoque) e o AJUSTE de reconciliação (estado
  -- real = em_uso) entram com o MESMO created_at e o MESMO data. Damos à compra um id
  -- ALTO ('ffff…') e ao ajuste um id BAIXO ('0000…0001'): sem a cláusula do 0054, o
  -- `id desc` pegaria a compra (em_estoque). Com o fix, `(tipo='ajuste') desc` faz o
  -- ajuste vencer o empate. Esperado: rel_estoque_asof(hoje).status = 'em_uso' e
  -- IGUAL a ativos.status (o trigger, last-insert-wins, também é 'em_uso').
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF1900001', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF1900001';

  -- compra de abertura: id ALTO, created_at/data explícitos (na transação now() é
  -- constante, por isso created_at é fixado à mão).
  insert into public.movimentacoes (id, ativo_id, tipo, data, filial_id, criado_por, created_at)
    values ('ffffffff-ffff-4fff-8fff-ffffffffffff', a, 'compra',
            date '2026-06-01', v_matriz, v_prof, timestamptz '2026-06-01 10:00:00+00');

  -- ajuste de reconciliação p/ em_uso: id BAIXO, MESMO created_at e MESMO data.
  insert into public.movimentacoes (id, ativo_id, tipo, data, filial_id,
                                     status_resultante, observacao, criado_por, created_at)
    values ('00000000-0000-4000-8000-000000000001', a, 'ajuste',
            date '2026-06-01', v_matriz, 'em_uso',
            'reconciliacao de import (teste F19)', v_prof, timestamptz '2026-06-01 10:00:00+00');

  select status into v_asof  from public.rel_estoque_asof_filiais((select array_agg(f.id order by f.id) from public.filiais f), current_date) where ativo_id = a;
  select status into v_ativo from public.ativos where id = a;
  if v_asof = 'em_uso' and v_asof = v_ativo then
    v_ok := v_ok + 1; raise notice '✓ 1 desempate (0054): ajuste vence a compra no empate (data,created_at); as-of=% = ativos=%',
      v_asof, v_ativo;
  else
    v_falhas := v_falhas + 1; raise warning '✗ 1 desempate: esperado em_uso (= ativos.status), obtido as-of=% ativos=%',
      coalesce(v_asof::text, '(fora da view)'), v_ativo;
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 2 — AS-OF com ESTORNO (R-REL). compra @2026-06-01, saída @D1=2026-06-10
  -- (em_uso), estorno da saída @D2=2026-06-20 (D2 > D1). created_at monotônico por
  -- ativo (10:00 < 10:01 < 10:02) para o guard de estorno enxergar a saída como a
  -- ÚLTIMA movimentação. Esperado:
  --   as-of(D1)   = em_uso     (o estorno ainda não vale: data > D1);
  --   as-of(hoje) = em_estoque (o par saída+estorno se anula → sobra a compra);
  --   ativos.status corrente = em_estoque (o estorno restaurou o snapshot).
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF1900002', 'notebook', v_matriz);
  select id into b from public.ativos where patrimonio = 'ZZF1900002';

  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
    values (b, 'compra', date '2026-06-01', v_matriz, v_prof, timestamptz '2026-06-01 10:00:00+00');
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, data, filial_id, criado_por, created_at)
    values (b, 'saida', 'Fulano', 'TI', date '2026-06-10', v_matriz, v_prof, timestamptz '2026-06-01 10:01:00+00');
  select id into v_saida from public.movimentacoes where ativo_id = b and tipo = 'saida' limit 1;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at, estorno_de)
    values (b, 'estorno', date '2026-06-20', v_matriz, v_prof, timestamptz '2026-06-01 10:02:00+00', v_saida);

  select status into v_d1  from public.rel_estoque_asof_filiais((select array_agg(f.id order by f.id) from public.filiais f), date '2026-06-10') where ativo_id = b;
  select status into v_now from public.rel_estoque_asof_filiais((select array_agg(f.id order by f.id) from public.filiais f), current_date)      where ativo_id = b;
  select status into v_cur from public.ativos where id = b;

  if v_d1 = 'em_uso' then
    v_ok := v_ok + 1; raise notice '✓ 2a as-of D1 (2026-06-10, antes do estorno) = em_uso';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 2a as-of D1: esperado em_uso, obtido %', coalesce(v_d1::text, '(fora da view)');
  end if;
  if v_now = 'em_estoque' then
    v_ok := v_ok + 1; raise notice '✓ 2b as-of hoje (par saída+estorno anulado) = em_estoque';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 2b as-of hoje: esperado em_estoque, obtido %', coalesce(v_now::text, '(fora da view)');
  end if;
  if v_cur = 'em_estoque' and v_cur = v_now then
    v_ok := v_ok + 1; raise notice '✓ 2c estorno restaurou ativos.status=em_estoque, batendo com o as-of de hoje';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 2c ativos.status: esperado em_estoque (= as-of hoje), obtido ativos=% as-of=%',
      v_cur, coalesce(v_now::text, '(fora da view)');
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 3c (F53) — duas movimentações gravadas na MESMA transação (portanto
  -- o MESMO created_at implícito, por now() ser constante dentro dela) recebem
  -- `ordem` DISTINTA e CRESCENTE, na ordem física de inserção — é a identidade
  -- (generated always), não mais um sorteio de uuid.
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF5300303', 'notebook', v_matriz);
  select id into i from public.ativos where patrimonio = 'ZZF5300303';

  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (i, 'compra', v_matriz, v_prof)
    returning ordem into v_ordem3c_1;
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (i, 'saida', 'Fulano 3c', 'TI', v_matriz, v_prof)
    returning ordem into v_ordem3c_2;

  if v_ordem3c_2 = v_ordem3c_1 + 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 3c duas movimentacoes gravadas na MESMA transacao recebem ordem distinta e CRESCENTE (%, %)', v_ordem3c_1, v_ordem3c_2;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3c esperado ordem crescente e consecutiva, obtido % e %', v_ordem3c_1, v_ordem3c_2;
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 4a (F53) — a trava do estorno (0134: `(created_at, ordem)`) RECUSA
  -- estornar a PENÚLTIMA movimentação do ativo (a SAÍDA, quando já existe uma
  -- DEVOLUÇÃO depois dela).
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF5300304', 'notebook', v_matriz);
  select id into j from public.ativos where patrimonio = 'ZZF5300304';

  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por, created_at)
    values (j, 'saida', 'Fulano 4a', v_matriz, v_prof, timestamptz '2026-03-01 10:00:00+00')
    returning id into v_saida4a;
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, created_at)
    values (j, 'devolucao', v_matriz, v_prof, timestamptz '2026-03-01 10:01:00+00')
    returning id into v_devol4a;

  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, estorno_de)
      values (j, 'estorno', v_matriz, v_prof, v_saida4a);
    v_falhas := v_falhas + 1;
    raise warning '✗ 4a estorno da PENULTIMA (saida) NAO foi recusado (deveria)';
  exception when others then
    if sqlerrm like '%ultima movimentacao efetiva%' then
      v_ok := v_ok + 1;
      raise notice '✓ 4a a trava do estorno ((created_at, ordem)) recusa estornar a PENULTIMA movimentacao: %', sqlerrm;
    else
      v_falhas := v_falhas + 1;
      raise warning '✗ 4a falhou por motivo INESPERADO (nao a trava do estorno): %', sqlerrm;
    end if;
  end;

  -- ---------------------------------------------------------------
  -- CENARIO 4b (F53) — a MESMA trava ACEITA estornar a ÚLTIMA movimentação (a
  -- devolução acima) do mesmo ativo.
  -- ---------------------------------------------------------------
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, estorno_de)
      values (j, 'estorno', v_matriz, v_prof, v_devol4a)
      returning id into v_estorno4b;
    v_ok := v_ok + 1;
    raise notice '✓ 4b a trava do estorno ACEITA estornar a ULTIMA movimentacao (devolucao), id=%', v_estorno4b;
  exception when others then
    v_falhas := v_falhas + 1;
    raise warning '✗ 4b o estorno da ULTIMA movimentacao FALHOU (nao deveria): %', sqlerrm;
  end;

  -- ---------------------------------------------------------------
  -- CENARIO 4c (F53) — A ASSERÇÃO QUE DISCRIMINA A RÉGUA DA TRAVA.
  --
  -- POR QUE ELE EXISTE: a Sabotagem C (devolver a trava do estorno para
  -- `(created_at, id)`) rodou contra 4a/4b e as DUAS continuaram VERDES. E com
  -- razão — 4a monta a saída e a devolução com `created_at` DISTINTOS (10:00 e
  -- 10:01), e sobre `created_at` distinto as duas réguas concordam sempre. 4a prova
  -- que a trava FUNCIONA; ele não prova NADA sobre qual régua ela usa. Uma mutação
  -- que dissesse derrubar 4a estaria mentindo — e o injetor reportaria "não
  -- detectada", que é o diagnóstico errado.
  --
  -- O cenário que discrimina é o de PRODUÇÃO: compra de abertura e ajuste de
  -- reconciliação no MESMO `created_at` (a transação do import), com o uuid da
  -- compra ALTO e o do ajuste BAIXO. Aí:
  --   · régua VELHA `(created_at, id)` — não existe nada "maior" que a compra
  --     (mesmo instante, id menor no ajuste) → ela ACEITARIA estornar a COMPRA de
  --     abertura, que é o defeito medido em 643 dos 1620 ativos de produção;
  --   · régua NOVA `(created_at, ordem)` — o ajuste foi inserido depois, tem
  --     `ordem` maior → RECUSA, corretamente.
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF5300305', 'notebook', v_matriz);
  select id into l from public.ativos where patrimonio = 'ZZF5300305';

  -- id ALTO na compra, id BAIXO no ajuste: é o que faz a régua velha errar.
  insert into public.movimentacoes (id, ativo_id, tipo, filial_id, criado_por, created_at)
    values ('ffffffff-ffff-4fff-8fff-fffffffffff1', l, 'compra', v_matriz, v_prof,
            timestamptz '2026-04-01 09:00:00+00')
    returning id into v_compra4c;
  insert into public.movimentacoes (id, ativo_id, tipo, filial_id, criado_por, created_at,
                                    status_resultante, observacao)
    values ('00000000-0000-4000-8000-000000000041', l, 'ajuste', v_matriz, v_prof,
            timestamptz '2026-04-01 09:00:00+00', 'em_uso',
            'F53 4c: reconciliacao de import no MESMO instante da compra')
    returning id into v_ajuste4c;

  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, estorno_de)
      values (l, 'estorno', v_matriz, v_prof, v_compra4c);
    v_falhas := v_falhas + 1;
    raise warning '✗ 4c a trava ACEITOU estornar a COMPRA de abertura, que tem o mesmo created_at do ajuste e id MAIOR — e o ajuste veio depois. E o comportamento da regua VELHA (created_at, id): a trava nao esta desempatando por `ordem`';
  exception when others then
    if sqlerrm like '%ultima movimentacao efetiva%' then
      v_ok := v_ok + 1;
      raise notice '✓ 4c a trava recusa estornar a COMPRA empatada em created_at (o ajuste tem ordem maior) — so a regua (created_at, ordem) chega a esta resposta';
    else
      v_falhas := v_falhas + 1;
      raise warning '✗ 4c falhou por motivo INESPERADO (nao a trava do estorno): %', sqlerrm;
    end if;
  end;

  -- O par positivo de 4c: a ÚLTIMA por `ordem` (o ajuste) É estornável. Sem ele, 4c
  -- passaria verde numa trava que recusasse TUDO.
  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, estorno_de)
      values (l, 'estorno', v_matriz, v_prof, v_ajuste4c);
    v_ok := v_ok + 1;
    raise notice '✓ 4d a mesma trava ACEITA estornar o ajuste (a ultima por ordem, apesar do id menor)';
  exception when others then
    v_falhas := v_falhas + 1;
    raise warning '✗ 4d o estorno do ajuste (ultima por ordem) FALHOU (nao deveria): %', sqlerrm;
  end;

  -- ---------------------------------------------------------------
  -- CENARIO 5a (F53) — guarda_acervo (0081) continua recusando UPDATE em
  -- `movimentacoes`, com 42501, mesmo depois da 0133/0134 acrescentarem a coluna
  -- `ordem` e trocarem o corpo de duas funções. ⚠ MEDIDO: `set ordem = ordem` NÃO
  -- serve — a identidade `generated always` recusa ANTES, com 428C9 'column
  -- "ordem" can only be updated to DEFAULT', e a asserção mediria a coisa errada
  -- (a identidade, não a guarda). Por isso o UPDATE mexe numa coluna COMUM
  -- (`observacao`).
  -- ---------------------------------------------------------------
  begin
    update public.movimentacoes set observacao = 'F53 5a: tentativa de alterar historico'
     where id = v_saida4a;
    v_falhas := v_falhas + 1;
    raise warning '✗ 5a guarda_acervo NAO recusou o UPDATE em movimentacoes (deveria, com 42501)';
  exception when others then
    if sqlstate = '42501' then
      v_ok := v_ok + 1;
      raise notice '✓ 5a guarda_acervo recusa UPDATE em movimentacoes com 42501: %', sqlerrm;
    else
      v_falhas := v_falhas + 1;
      raise warning '✗ 5a falhou com SQLSTATE INESPERADO (nao 42501): % — %', sqlstate, sqlerrm;
    end if;
  end;

  -- ---------------------------------------------------------------
  -- CENARIO 6a (F53) — O CENÁRIO QUE DECIDE A DECISÃO 3 (docs/PLAN-F53.md §1):
  -- para o MESMO ativo, insere-se uma movimentação "mais recente por DATA" (M1)
  -- e, DEPOIS (portanto com `ordem` MAIOR), uma "retroativa" (M2, com `data`
  -- ANTERIOR à de M1, mas gravada DEPOIS dela). rel_estoque_asof, numa data de
  -- consulta POSTERIOR às duas (onde as DUAS estão em `efetivas`), tem de
  -- continuar respondendo o estado de M1 — a mais recente por DATA, que é a
  -- pergunta que o as-of responde — e NÃO o de M2, que só tem `ordem` maior por
  -- ter sido digitada depois.
  --
  -- A prova é por COMPARAÇÃO DIRETA: chama-se a função real (que usa `data desc,
  -- ordem desc`) e, ao lado, roda-se uma consulta manual que responde a MESMA
  -- pergunta usando só `ordem desc` (a régua REJEITADA pela D3/D4 do plano). As
  -- duas TÊM que divergir — se não divergissem, o cenário não provaria nada.
  -- Este roteiro só fica verde porque a função real usa `data desc, ordem desc`:
  -- com `ordem desc` puro ela teria dado o mesmo resultado ERRADO que a consulta
  -- manual abaixo. "Este cenário PASSA com data desc, ordem desc e FALHARIA com
  -- ordem desc puro" (docs/PLAN-F53.md §4) — é exatamente isto que as duas
  -- seleções abaixo comparam.
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF5300306', 'notebook', v_matriz);
  select id into k from public.ativos where patrimonio = 'ZZF5300306';

  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
    values (k, 'compra', date '2024-01-01', v_matriz, v_prof, timestamptz '2024-01-01 09:00:00+00');

  -- M1 — "mais recente por data" do par, inserida PRIMEIRO (ordem menor).
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, status_resultante, observacao, criado_por, created_at)
    values (k, 'ajuste', date '2026-08-01', v_matriz, 'em_uso', 'F53 6a: M1, mais recente por data', v_prof, timestamptz '2026-08-01 09:00:00+00');

  -- M2 — "retroativa" (data ANTES de M1, mas gravada DEPOIS: ordem MAIOR).
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, status_resultante, observacao, criado_por, created_at)
    values (k, 'ajuste', date '2026-01-01', v_matriz, 'em_manutencao', 'F53 6a: M2, retroativa, lancada DEPOIS de M1', v_prof, timestamptz '2026-01-01 09:00:00+00');

  -- as-of numa data POSTERIOR às duas (2026-08-15): as duas estão em `efetivas`.
  select status into v_asof6a from public.rel_estoque_asof_filiais((select array_agg(f.id order by f.id) from public.filiais f), date '2026-08-15') where ativo_id = k;

  -- a MESMA pergunta, respondida só por `ordem desc` (a régua REJEITADA):
  select m.status_resultante into v_puro6a
    from public.movimentacoes m
   where m.ativo_id = k and m.data <= date '2026-08-15' and m.tipo <> 'estorno'
   order by m.ordem desc
   limit 1;

  if v_asof6a = 'em_uso' and v_puro6a = 'em_manutencao' then
    v_ok := v_ok + 1;
    raise notice '✓ 6a rel_estoque_asof (data desc, ordem desc) responde em_uso (M1, mais recente por DATA); só por ordem desc responderia em_manutencao (M2, retroativa) — as duas DIVERGEM, e a funcao real fica do lado certo';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 6a esperado as-of real=em_uso e simulacao ordem-puro=em_manutencao (DIVERGENTES), obtido as-of=% simulacao=%',
      coalesce(v_asof6a::text, '(fora da view)'), coalesce(v_puro6a::text, '(nenhuma linha)');
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 7a (F53) — a sequência de identidade NÃO ficou atrás de
  -- `max(ordem)` (a armadilha do §4 da migration 0133): um INSERT novo recebe
  -- max+1 e não viola `movimentacoes_ordem_uidx`.
  -- ---------------------------------------------------------------
  select coalesce(max(ordem), 0) into v_max_antes from public.movimentacoes;

  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF5300307', 'notebook', v_matriz);
  select id into p7a from public.ativos where patrimonio = 'ZZF5300307';

  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
      values (p7a, 'compra', v_matriz, v_prof)
      returning ordem into v_novo_ordem;
    if v_novo_ordem = v_max_antes + 1 then
      v_ok := v_ok + 1;
      raise notice '✓ 7a a sequencia nao ficou atras do max(ordem): INSERT novo recebeu max+1 (%), sem violar o unico', v_novo_ordem;
    else
      v_falhas := v_falhas + 1;
      raise warning '✗ 7a esperado ordem=max_antes+1 (%), obtido %', v_max_antes + 1, v_novo_ordem;
    end if;
  exception when unique_violation then
    v_falhas := v_falhas + 1;
    raise warning '✗ 7a a sequencia ficou ATRAS de max(ordem) — o INSERT violou movimentacoes_ordem_uidx: %', sqlerrm;
  end;

  -- ---------------------------------------------------------------
  -- CENARIO 7b (F53) — o índice único MORDE, e isso não é inspeção de catálogo.
  --
  -- POR QUE ELE EXISTE: a Sabotagem D da ordem (derrubar `movimentacoes_ordem_uidx`
  -- e ver o que deixa de ser garantido) rodou e o roteiro ficou VERDE — nenhuma das
  -- 15 asserções o exercitava. Um índice que nenhuma asserção cobre é uma promessa,
  -- não uma garantia (a mesma lição da `import_logs.arquivo_hash` na F52: coluna
  -- criada para uma finalidade e nunca lida). Aqui se prova pelo EFEITO: duas linhas
  -- com a MESMA `ordem` têm de ser recusadas.
  --
  -- ⚠ `overriding system value` é obrigatório: a coluna é `generated ALWAYS as
  -- identity`, e sem essa cláusula o Postgres recusa antes com `428C9 column "ordem"
  -- can only be updated to DEFAULT` — a asserção mediria a identidade, não o índice.
  -- (É o mesmo cuidado do 5a, que precisa de uma coluna COMUM para medir a guarda.)
  -- ---------------------------------------------------------------
  -- ⚠ ATIVO NOVO e tipo `compra`, e não um segundo lançamento sobre o `p7a`: `ajuste`
  -- exige `status_resultante` e `observacao`, e a recusa dele é um `raise exception`
  -- P0001 do trigger — que NÃO é `unique_violation` e escaparia do handler abaixo,
  -- derrubando o roteiro inteiro em vez de falhar a asserção. Medido.
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF5300308', 'notebook', v_matriz);
  select id into p7b from public.ativos where patrimonio = 'ZZF5300308';

  begin
    insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, ordem)
      overriding system value
      values (p7b, 'compra', v_matriz, v_prof, v_novo_ordem);
    v_falhas := v_falhas + 1;
    raise warning '✗ 7b duas movimentacoes com a MESMA ordem (%) foram ACEITAS — movimentacoes_ordem_uidx nao esta no ar, e `ordem` deixou de ser uma ordem', v_novo_ordem;
  exception when unique_violation then
    v_ok := v_ok + 1;
    raise notice '✓ 7b o indice unico morde: ordem repetida (%) foi recusada por movimentacoes_ordem_uidx', v_novo_ordem;
  end;

  -- ---------------------------------------------------------------
  -- CENARIO 10a (F53) — A TRAVA (e), derivada do CATÁLOGO (docs/PLAN-F53.md
  -- D10): varre `pg_get_functiondef` de toda função de `public` que cite
  -- `movimentacoes` e `pg_get_viewdef` das views de `public`, e reprova quem
  -- DESEMPATAR POR `id` — pelos padrões REAIS medidos no corpo vigente (não a
  -- substring solta `id`): `, m.id) > (`, `m.id desc`, `e.id desc`, `, id desc`.
  -- TRÊS exceções NOMINAIS (nunca por prefixo/categoria — doutrina F48/F52):
  -- `apagar_ativo` e `apagar_ativos_conflito_filiais` (ordenam ASC dentro de
  -- `jsonb_agg` para SERIALIZAR um despejo de backup, não para escolher linha —
  -- nem batem no padrão acima, na prática) e `apagar_movimentacao` (o desempate
  -- por `id` ali é INALCANÇÁVEL — provado à parte no rótulo 10c).
  --
  -- Não usa `pg_temp.assert_zero_de` (Decisão 9): o universo aqui é o CATÁLOGO
  -- do banco (funções/views que já existem por força das migrations), não dado
  -- de fixture — não corre o risco de ficar vazio e virar tautologia.
  -- ---------------------------------------------------------------
  with objetos as (
    select 'function'::text as kind, p.proname as nome, pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and pg_get_functiondef(p.oid) ~* 'movimentacoes'
    union all
    select 'view'::text, c.relname, pg_get_viewdef(c.oid, true)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
  ),
  marcados as (
    select kind, nome,
           (def ~ ', m\.id\) > \(' or def ~* 'm\.id desc' or def ~* 'e\.id desc' or def ~* ', id desc') as desempata
      from objetos
  )
  select count(*),
         count(*) filter (where desempata and nome <> all (k_excecoes)),
         coalesce(string_agg(nome, ', ' order by nome) filter (where desempata and nome <> all (k_excecoes)), '')
    into v_univ, v_cnt, v_lista
    from marcados;

  if v_cnt = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 10a nenhuma das % funcoes/views de public que citam movimentacoes desempata por id, fora das 3 excecoes nominais (apagar_ativo, apagar_ativos_conflito_filiais, apagar_movimentacao)', v_univ;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 10a % objeto(s) desempatam por id fora das excecoes: %', v_cnt, v_lista;
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 10b (F53) — AUTO-SABOTAGEM: a asserção 10a nasce VERDE por natureza
  -- (é varredura de catálogo, e catálogo limpo não acusa nada). Cria-se AQUI
  -- uma função FICTÍCIA em `public` que cita `movimentacoes` e desempata por
  -- `m.id desc` — e prova-se que a MESMA varredura da 10a a ACUSA. Sem isto,
  -- ninguém saberia se a 10a de fato morde. Nasce e morre dentro deste
  -- `begin; … rollback;` — nada sobra no banco.
  -- ---------------------------------------------------------------
  execute
    'create function public._f53_sabotagem_ordem_por_id() returns uuid language sql stable as ' ||
    '$sabo53$ select m.id from public.movimentacoes m order by m.id desc limit 1 $sabo53$';

  select count(*)
    into v_cnt
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname = '_f53_sabotagem_ordem_por_id'
     and pg_get_functiondef(p.oid) ~* 'movimentacoes'
     and (pg_get_functiondef(p.oid) ~ ', m\.id\) > \('
          or pg_get_functiondef(p.oid) ~* 'm\.id desc'
          or pg_get_functiondef(p.oid) ~* 'e\.id desc'
          or pg_get_functiondef(p.oid) ~* ', id desc')
     and p.proname <> all (k_excecoes);

  if v_cnt = 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 10b auto-sabotagem: a varredura da 10a ACUSA _f53_sabotagem_ordem_por_id (desempata movimentacoes por m.id desc, fora das excecoes) — o gate SABE reprovar';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 10b a varredura NAO acusou a funcao ficticia (contagem=%, esperado 1) — o gate esta cego: uma funcao nova que desempata movimentacoes por id passaria em silencio', v_cnt;
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 10c (F53) — em `apagar_movimentacao` (corpo vigente 0090), prova-se
  -- por `position()` sobre `pg_get_functiondef` que a RECUSA DE EMPATE
  -- (`m.created_at = v_m.created_at`, 0090:173) vem ANTES da comparação por id
  -- (`(m.created_at, m.id) > (v_m.created_at, v_m.id)`, 0090:182). É isso que
  -- torna o desempate por `id` ali INALCANÇÁVEL (D10.3 do plano): quando a
  -- comparação de :182 roda, todo ativo com dois `created_at` iguais já foi
  -- barrado pela recusa de :173 — o `id` nunca chega a decidir nada.
  -- ---------------------------------------------------------------
  select pg_get_functiondef(p.oid)
    into v_corpo10c
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname = 'apagar_movimentacao';

  v_pos_recusa     := position('m.created_at = v_m.created_at' in v_corpo10c);
  v_pos_comparacao := position('(m.created_at, m.id) > (v_m.created_at, v_m.id)' in v_corpo10c);

  if v_pos_recusa > 0 and v_pos_comparacao > 0 and v_pos_recusa < v_pos_comparacao then
    v_ok := v_ok + 1;
    raise notice '✓ 10c em apagar_movimentacao, a recusa de empate (posicao %) vem ANTES da comparacao por id (posicao %) — o id e INALCANCAVEL ali, e por isso a 10a a trata como excecao', v_pos_recusa, v_pos_comparacao;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 10c posicoes inesperadas: recusa=% comparacao=% (releia o corpo de apagar_movimentacao antes de mexer nesta excecao)', v_pos_recusa, v_pos_comparacao;
  end if;

  -- ---------------------------------------------------------------
  -- CENARIO 11 (F60) — O TRANSFERIDO DEPOIS DA DATA.
  --
  -- POR QUE ELE EXISTE: a 0143 trocou o as-of (antes uma CTE sobre `movimentacoes` inteira,
  -- 368 buffers para 5 linhas ou para 1.624) por uma lateral ancorada em `ativos`. Com a
  -- âncora em `ativos`, o atalho óbvio para o recorte "cortar scan" é pré-filtrar
  -- `ativos.filial_id = any (p_filiais)` antes da lateral. Esse atalho está ERRADO, e só
  -- este arranjo mostra por quê: `ativos.filial_id` é a filial de HOJE, e o as-of responde
  -- "onde o ativo estava NA DATA". Um ativo que estava em A na data D e foi transferido para B
  -- depois de D:
  --   · sumiria do relatório de A em D (o pré-filtro o descarta: hoje ele é de B);
  --   · e o de B em D não o ganharia de volta, porque a filial calculada em D é A.
  -- Ele simplesmente desapareceria do passado. Nenhum dos rótulos 1 a 10c pega isso: todos
  -- os ativos deles ficam na matriz a vida inteira, e aí a filial de hoje e a da data coincidem.
  -- A mutação `f60-asof-pre-filtra-pela-filial-de-hoje` injeta o pré-filtro e cai em 11a.
  --
  -- MONTAGEM: compra na matriz (A) @2025-03-01; transferência A→B @2025-03-20. D = 2025-03-10
  -- (entre as duas), D+k = 2025-03-25 (depois da transferência). `created_at` EXPLÍCITO e
  -- crescente (a regra da pendência nº 5 da F37: duas movimentações do mesmo ativo na mesma
  -- transação). B é fictícia e nasce aqui — o arquivo só tem a matriz como pré-requisito.
  -- ---------------------------------------------------------------
  insert into public.filiais (slug, nome)
    values ('zzf60-asof-destino', 'ZZF60 AsOf Destino')
    returning id into v_destino11;

  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF6000311', 'notebook', v_matriz)
    returning id into t11;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
    values (t11, 'compra', date '2025-03-01', v_matriz, v_prof, timestamptz '2025-03-01 10:00:00+00');
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, filial_destino_id, criado_por, created_at)
    values (t11, 'transferencia', date '2025-03-20', v_matriz, v_destino11, v_prof, timestamptz '2025-03-20 10:00:00+00');

  -- A premissa do cenário: HOJE o ativo é de B. Sem isto, 11a não discriminaria nada (a
  -- filial de hoje e a da data seriam a mesma, como nos cenários acima).
  select filial_id into v_hoje11 from public.ativos where id = t11;

  select count(*) into v_em_a_antes
    from public.rel_estoque_asof_filiais(array[v_matriz], date '2025-03-10') r where r.ativo_id = t11;
  select count(*) into v_em_b_antes
    from public.rel_estoque_asof_filiais(array[v_destino11], date '2025-03-10') r where r.ativo_id = t11;
  select count(*) into v_em_a_depois
    from public.rel_estoque_asof_filiais(array[v_matriz], date '2025-03-25') r where r.ativo_id = t11;
  select count(*) into v_em_b_depois
    from public.rel_estoque_asof_filiais(array[v_destino11], date '2025-03-25') r where r.ativo_id = t11;

  if v_hoje11 = v_destino11 and v_em_a_antes = 1 and v_em_b_antes = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 11a as-of ANTES da transferencia (2025-03-10): o ativo esta no recorte da ORIGEM e nao no do destino, embora HOJE ele seja do destino — a filial e a CALCULADA na data, sem pre-filtro pela de hoje';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 11a as-of de 2025-03-10: esperado hoje=destino, 1 linha em [origem] e 0 em [destino]; obtido hoje=% (destino=%), [origem]=%, [destino]=% — um pre-filtro por ativos.filial_id tira do passado o ativo que saiu depois da data',
      v_hoje11, v_destino11, v_em_a_antes, v_em_b_antes;
  end if;

  if v_em_b_depois = 1 and v_em_a_depois = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 11b as-of DEPOIS da transferencia (2025-03-25): o ativo esta no recorte do DESTINO e nao no da origem';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 11b as-of de 2025-03-25: esperado 1 linha em [destino] e 0 em [origem], obtido [destino]=% [origem]=%',
      v_em_b_depois, v_em_a_depois;
  end if;

  -- O consolidado não depende de filial nenhuma para CONTER o ativo, mas depende da filial
  -- calculada para o que MOSTRA: exatamente uma linha em cada data, cada uma com a filial de
  -- então. Duas linhas seriam a lateral multiplicando; zero, o recorte perdendo o ativo.
  select count(*), min(r.filial_id) into v_cons_antes, v_filial_antes
    from public.rel_estoque_asof_filiais((select array_agg(f.id order by f.id) from public.filiais f), date '2025-03-10') r
   where r.ativo_id = t11;
  select count(*), min(r.filial_id) into v_cons_depois, v_filial_depois
    from public.rel_estoque_asof_filiais((select array_agg(f.id order by f.id) from public.filiais f), date '2025-03-25') r
   where r.ativo_id = t11;

  if v_cons_antes = 1 and v_cons_depois = 1
     and v_filial_antes = v_matriz and v_filial_depois = v_destino11 then
    v_ok := v_ok + 1;
    raise notice '✓ 11c consolidado: o ativo aparece UMA vez em cada data, com a filial de entao (origem em 2025-03-10, destino em 2025-03-25)';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 11c consolidado: esperado 1 linha por data com filial origem→destino, obtido %/% linhas e filial %→% (origem=%, destino=%)',
      v_cons_antes, v_cons_depois, v_filial_antes, v_filial_depois, v_matriz, v_destino11;
  end if;

  raise notice 'FIM asof_desempate: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

-- Nada acima é persistido:
rollback;
