-- =============================================================
-- Roteiro de teste: O RECORTE OBRIGATÓRIO DOS RELATÓRIOS (F60 · migrations 0141/0143/0145).
--
-- Roda no job `banco-sem-docker` do CI (psql, ON_ERROR_STOP=1, pelo runner único
-- `scripts/db/rodar-roteiros.sh`) e é auto-verificável no SQL editor / MCP dos dois projetos.
-- Mesmo padrão dos demais roteiros da pasta:
--   NOTICE  '✓ ...'  quando a invariante bate
--   WARNING '✗ ...'  quando NÃO bate (o runner falha em qualquer `WARNING: ✗`)
--
-- ESCREVE (um usuário, três filiais, dois itens, um ativo, movimentações e lançamentos
-- fictícios), então roda inteiro dentro de `begin; … rollback;` — nada sobra no banco. É
-- AUTOSSUFICIENTE: cria tudo de que precisa, para funcionar também num Postgres novo do CI.
--
-- DADOS 100% FICTÍCIOS (regra 2 do CLAUDE.md): filiais `zzf60-recorte-*`, itens "ZZF60 …",
-- patrimônio `ZZF60…`, colaborador "Fulano ZZF60", e-mail `f60.recorte@wap.ind.br`.
--
-- ---------------------------------------------------------------------------
-- POR QUE ELE EXISTE
-- ---------------------------------------------------------------------------
-- Até a F59 as sete `rel_*` recebiam `p_filial smallint` e recortavam com
-- `(p_filial is null or col = p_filial)`: o nulo significava "tudo". Isso era FAIL-OPEN (um
-- chamador que perdesse a filial no caminho recebia o acervo inteiro, sem erro) e
-- NÃO-SARGÁVEL no caminho real (o PostgREST nunca chama com literal, e função com
-- `set search_path` não é embutida — o plano ficava em scan com filtro). A F60 trocou as sete
-- pelas `rel_*_filiais(p_filiais smallint[], …)`, com `col = any (p_filiais)` como conjunção
-- direta, e acrescentou `rel_contagem_status_filiais` (os KPIs do dashboard).
--
-- "Não-anulável" não existe em parâmetro de função (`NOT NULL` ali é erro de sintaxe). A
-- garantia tem três camadas, e esta é a do BANCO: a comparação direta faz NULL e `'{}'`
-- devolverem ZERO linhas, sem erro. As outras duas são a porta (`src/lib/supabase/rpc.ts`,
-- onde `null` em `p_filiais` não compila) e a trava de forma (`rpcs-recorte-sql.test.ts` na
-- mesa e o bloco 7 de `catalogo_secdef.sql` no catálogo). Esta aqui prova o EFEITO.
--
-- E o consolidado mudou de natureza: deixou de ser o nulo e virou a lista EXPLÍCITA de todas
-- as filiais — inclusive as DESATIVADAS, que a lista de filiais do app não mostra como coluna.
-- `/itens` passou a ler colunas e consolidado numa chamada só (`rel_saldo_itens_filiais` em
-- DOIS níveis: uma linha por filial do recorte e o total, com `filial_id` nulo), e a diferença
-- "total menos a soma das colunas" é o estoque fora das colunas. Os cenários 2 a 4 provam as
-- três propriedades que aquela tela e os relatórios passaram a depender.
--
-- ---------------------------------------------------------------------------
-- O QUE ELE PROVA
-- ---------------------------------------------------------------------------
--   1a-1h  NULL e `'{}'` devolvem 0 linhas, SEM ERRO, nas OITO `rel_*_filiais` — medido contra
--          a mesma chamada com a lista de todas as filiais, que TEM linhas (senão seria
--          tautologia; `pg_temp.assert_zero_de` recusa universo vazio)
--   2a     `/itens`, a emenda de dois níveis: com TODAS as filiais, o total soma o estoque da
--          filial DESATIVADA, as linhas das filiais ativas não, e o fora das colunas é > 0
--   2b     a variante que prova que 2a enxerga a emenda: com a lista só das ATIVAS, o fora vira 0
--   2c     o as-of consolidado inclui o ativo da desativada (e a lista só das ativas não)
--   2d     a contagem por status consolidada inclui o ativo da desativada
--   2e     os três relatórios de período consolidados incluem a movimentação da desativada
--   2f     a movimentação de itens consolidada inclui os lançamentos da desativada
--   3a     os dois níveis NÃO são a soma: com um chamado cuja reserva está numa filial e a
--          liberação noutra, os atrelados do total diferem da soma dos atrelados das filiais
--   4a-4b  para UMA filial só, o nível do total é idêntico à linha da filial, item a item —
--          inclusive quando o clamp (`greatest(0, …)`) está agindo
--
-- ⚠ O QUE ELE **NÃO** PROVA: a equivalência número a número entre as funções velhas e as novas
-- sobre dados reais. Essa prova é da Frente D, feita ANTES do apply nos dois bancos (924
-- células, só contagem e hash — `docs/PLAN-F60.md` §4 e §8), e não cabe num roteiro de CI: as
-- funções velhas não existem mais depois da 0145.
--
-- ⚠ ROBUSTO A BANCO POPULADO: toda asserção sobre o consolidado compara DIFERENÇAS (lista de
-- todas menos lista das ativas) contra a contagem direta das tabelas, ou olha só os itens e o
-- ativo que ele mesmo criou. Em produção existe filial desativada com dado — o roteiro não
-- presume que a desativada dele é a única.
-- =============================================================

begin;

create temp table _f60_recorte_resumo (ok int, falhas int, detalhe text);

do $$
declare
  -- identidade fictícia (uuid fixo, hex válido — o prefixo f60a marca a fase)
  k_prof      uuid := '00000000-f60a-4000-8000-0000000000a1';
  v_ok        int  := 0;
  v_falhas    int  := 0;
  v_msgs      text := '';

  -- o recorte
  v_fa        smallint;     -- filial ATIVA fictícia A
  v_fb        smallint;     -- filial ATIVA fictícia B
  v_fd        smallint;     -- filial fictícia que será DESATIVADA
  v_slug_fd   text := 'zzf60-recorte-desativada';
  v_todas     smallint[];   -- a lista do consolidado: TODAS as filiais, com desativada
  v_ativas    smallint[];   -- só as ativas — as COLUNAS de /itens
  v_de        date := date '2025-01-01';
  v_ate       date := date '2025-12-31';
  v_corte_ch  date := date '2025-08-01';   -- a data do cenário do chamado (3a, 4a, 4b)

  -- os fixtures
  v_item      smallint;     -- estoque na ativa A (5) e na desativada (7)
  v_item_ch   smallint;     -- o item do chamado que atravessa filiais
  v_ativo_d   uuid;         -- o ativo da desativada

  -- cenário 1
  v_erro      text;
  v_n_null    bigint;
  v_n_vazio   bigint;
  v_n_todas   bigint;

  -- cenário 2
  v_tot_est   bigint;  v_col_est  bigint;  v_d_est   bigint;
  v_tot2_est  bigint;  v_col2_est bigint;  v_d2_lin  bigint;
  v_asof_n    bigint;  v_asof_n2  bigint;
  v_asof_fil  smallint;
  v_asof_st   public.status_ativo;
  v_asof_col  text;
  v_c_todas   bigint;  v_c_ativas bigint;  v_c_fora  bigint;  v_c_tab bigint;  v_c_dela bigint;
  v_p_todas   bigint;  v_p_ativas bigint;  v_p_fora  bigint;
  v_m_todas   bigint;  v_m_ativas bigint;
  v_r_todas   bigint;  v_r_ativas bigint;
  v_e_todas   bigint;  v_e_ativas bigint;  v_e_dela  bigint;

  -- cenários 3 e 4
  v_atr_tot   bigint;  v_atr_soma bigint;
  v_est_tot   bigint;  v_est_soma bigint;
  v_premissa  bigint;
  v_univ      bigint;
  v_ruins     bigint;
begin
  -- =========================================================================
  -- FIXTURES (como postgres, sem claims — nenhum cenário aqui mede RLS)
  -- =========================================================================
  -- O trigger handle_new_user cria o profile (e exige domínio corporativo — 0041/0057). Ele
  -- só existe para ser o `criado_por` das linhas abaixo.
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values (k_prof, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'f60.recorte@wap.ind.br', '', now(), now(), now());

  -- As três filiais nascem ATIVAS; a D é desativada DEPOIS de receber dado — é o caminho real
  -- (uma filial que fecha com acervo e saldo), e não depende de nenhuma guarda de escrita
  -- aceitar lançamento em filial já desativada.
  insert into public.filiais (slug, nome) values ('zzf60-recorte-a', 'ZZF60 Recorte A')
    returning id into v_fa;
  insert into public.filiais (slug, nome) values ('zzf60-recorte-b', 'ZZF60 Recorte B')
    returning id into v_fb;
  insert into public.filiais (slug, nome) values (v_slug_fd, 'ZZF60 Recorte Desativada')
    returning id into v_fd;

  insert into public.itens (nome, grupo, ordem)
    values ('ZZF60 Item Recorte', 'acessorio', 9960) returning id into v_item;
  insert into public.itens (nome, grupo, ordem)
    values ('ZZF60 Item Chamado', 'acessorio', 9961) returning id into v_item_ch;

  -- O item do cenário 2: 5 na ativa A, 7 na desativada. Total consolidado 12; coluna 5; fora 7.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
  values (v_item, v_fa, 'entrada', 5, date '2025-06-01', k_prof),
         (v_item, v_fd, 'entrada', 7, date '2025-06-01', k_prof);

  -- O item do cenário 3: o chamado que ATRAVESSA filiais na data de corte (2025-08-01).
  --
  -- ⚠ Por que as datas, e não uma liberação direta em B: o gatilho `valida_lancamento_item`
  -- confere a liberação contra a reserva do MESMO (item, filial, chamado), somando TODAS as
  -- datas — uma liberação em B sem reserva em B é recusada. Mas o relatório lê `data <= p_ate`.
  -- Então: reserva em A @05-01; em B, reserva @09-01 (depois do corte) e liberação @07-01
  -- (antes). O gatilho aceita (em B a reserva de 5 cobre a liberação de 5), e NA DATA DE CORTE
  -- o chamado tem +5 em A e −5 em B. É exatamente o arranjo em que a soma dos clamps por filial
  -- (5 + 0) difere do clamp sobre o conjunto (0) — e é o que um relatório as-of enxerga.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, chamado, data, criado_por)
  values (v_item_ch, v_fa, 'entrada', 10, null,          date '2025-05-01', k_prof),
         (v_item_ch, v_fb, 'entrada', 10, null,          date '2025-05-01', k_prof),
         (v_item_ch, v_fa, 'reserva',  5, 'ZZF60-CH-01', date '2025-05-01', k_prof);
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, chamado, data, criado_por)
  values (v_item_ch, v_fb, 'reserva',  5, 'ZZF60-CH-01', date '2025-09-01', k_prof);
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, chamado, data, criado_por)
  values (v_item_ch, v_fb, 'liberacao', 5, 'ZZF60-CH-01', date '2025-07-01', k_prof);

  -- O ativo da desativada: compra e saída DENTRO do período (a saída é o que os três relatórios
  -- de período contam). `created_at` explícito e crescente — a regra da pendência nº 5 da F37.
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF6000001', 'notebook', v_fd) returning id into v_ativo_d;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at)
    values (v_ativo_d, 'compra', date '2025-06-01', v_fd, k_prof, timestamptz '2025-06-01 10:00:00+00');
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, setor, criado_por, created_at)
    values (v_ativo_d, 'saida', date '2025-06-10', v_fd, 'Fulano ZZF60', 'TI', k_prof,
            timestamptz '2025-06-10 10:00:00+00');

  -- A filial fecha, com o acervo e o saldo dentro.
  update public.filiais set ativo = false where id = v_fd;

  -- As duas listas, lidas DEPOIS da desativação. A do consolidado é a mesma expressão que os
  -- roteiros migrados usam no lugar do nulo de antes.
  v_todas  := (select array_agg(f.id order by f.id) from public.filiais f);
  v_ativas := (select array_agg(f.id order by f.id) from public.filiais f where f.ativo);

  -- =========================================================================
  -- 1 — NULL E '{}' DEVOLVEM ZERO LINHAS, SEM ERRO, NAS OITO
  -- =========================================================================
  -- Universo = linhas da MESMA chamada com a lista de todas (tem de ser > 0: os fixtures acima
  -- garantem ativo, movimentação no período e lançamento). Ruins = linhas com NULL + linhas com
  -- '{}'. Com a forma velha (`p is null or …`) o NULL devolveria o universo inteiro — ruins
  -- nunca passa de 2× o universo, então a contagem é coerente em qualquer mutação.
  --
  -- ⚠ O erro é capturado e vira falha NOMEADA pelo rótulo, em vez de abortar o roteiro: "sem
  -- erro" é parte do que se prova, e um abort sem rótulo daria ao injetor de mutações o
  -- diagnóstico errado ("o roteiro morreu", e não "o rótulo 1 daquela função caiu"). O `assert_zero_de` fica FORA do bloco protegido,
  -- para que o universo vazio continue levantando exceção como a ferramenta manda.

  -- 1a — rel_contagem_status_filiais
  v_erro := null;
  begin
    select count(*) into v_n_null  from public.rel_contagem_status_filiais(null::smallint[]);
    select count(*) into v_n_vazio from public.rel_contagem_status_filiais('{}'::smallint[]);
    select count(*) into v_n_todas from public.rel_contagem_status_filiais(v_todas);
  exception when others then
    v_erro := sqlstate || ' ' || sqlerrm;
  end;
  if v_erro is not null then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1a_ERRO; ';
    raise warning '✗ 1a rel_contagem_status_filiais levantou erro com NULL ou vazio: %', v_erro;
  elsif pg_temp.assert_zero_de(
          '1a rel_contagem_status_filiais: NULL e vazio devolvem 0 linhas',
          v_n_null + v_n_vazio, 2 * v_n_todas) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1a; ';
  end if;

  -- 1b — rel_mov_por_mes_filiais
  v_erro := null;
  begin
    select count(*) into v_n_null  from public.rel_mov_por_mes_filiais(null::smallint[], v_de, v_ate);
    select count(*) into v_n_vazio from public.rel_mov_por_mes_filiais('{}'::smallint[], v_de, v_ate);
    select count(*) into v_n_todas from public.rel_mov_por_mes_filiais(v_todas, v_de, v_ate);
  exception when others then
    v_erro := sqlstate || ' ' || sqlerrm;
  end;
  if v_erro is not null then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1b_ERRO; ';
    raise warning '✗ 1b rel_mov_por_mes_filiais levantou erro com NULL ou vazio: %', v_erro;
  elsif pg_temp.assert_zero_de(
          '1b rel_mov_por_mes_filiais: NULL e vazio devolvem 0 linhas',
          v_n_null + v_n_vazio, 2 * v_n_todas) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1b; ';
  end if;

  -- 1c — rel_por_motivo_filiais
  v_erro := null;
  begin
    select count(*) into v_n_null  from public.rel_por_motivo_filiais(null::smallint[], v_de, v_ate);
    select count(*) into v_n_vazio from public.rel_por_motivo_filiais('{}'::smallint[], v_de, v_ate);
    select count(*) into v_n_todas from public.rel_por_motivo_filiais(v_todas, v_de, v_ate);
  exception when others then
    v_erro := sqlstate || ' ' || sqlerrm;
  end;
  if v_erro is not null then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1c_ERRO; ';
    raise warning '✗ 1c rel_por_motivo_filiais levantou erro com NULL ou vazio: %', v_erro;
  elsif pg_temp.assert_zero_de(
          '1c rel_por_motivo_filiais: NULL e vazio devolvem 0 linhas',
          v_n_null + v_n_vazio, 2 * v_n_todas) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1c; ';
  end if;

  -- 1d — rel_resumo_filiais
  v_erro := null;
  begin
    select count(*) into v_n_null  from public.rel_resumo_filiais(null::smallint[], v_de, v_ate);
    select count(*) into v_n_vazio from public.rel_resumo_filiais('{}'::smallint[], v_de, v_ate);
    select count(*) into v_n_todas from public.rel_resumo_filiais(v_todas, v_de, v_ate);
  exception when others then
    v_erro := sqlstate || ' ' || sqlerrm;
  end;
  if v_erro is not null then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1d_ERRO; ';
    raise warning '✗ 1d rel_resumo_filiais levantou erro com NULL ou vazio: %', v_erro;
  elsif pg_temp.assert_zero_de(
          '1d rel_resumo_filiais: NULL e vazio devolvem 0 linhas',
          v_n_null + v_n_vazio, 2 * v_n_todas) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1d; ';
  end if;

  -- 1e — rel_frescor_itens_filiais
  v_erro := null;
  begin
    select count(*) into v_n_null  from public.rel_frescor_itens_filiais(null::smallint[], v_ate);
    select count(*) into v_n_vazio from public.rel_frescor_itens_filiais('{}'::smallint[], v_ate);
    select count(*) into v_n_todas from public.rel_frescor_itens_filiais(v_todas, v_ate);
  exception when others then
    v_erro := sqlstate || ' ' || sqlerrm;
  end;
  if v_erro is not null then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1e_ERRO; ';
    raise warning '✗ 1e rel_frescor_itens_filiais levantou erro com NULL ou vazio: %', v_erro;
  elsif pg_temp.assert_zero_de(
          '1e rel_frescor_itens_filiais: NULL e vazio devolvem 0 linhas',
          v_n_null + v_n_vazio, 2 * v_n_todas) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1e; ';
  end if;

  -- 1f — rel_mov_itens_filiais. É a que tem a GUARDA `exists` (0143): o corpo parte do
  -- catálogo de itens com `left join` nos lançamentos, e sem a guarda NULL e vazio devolveriam
  -- o catálogo inteiro zerado em vez de nada. Este rótulo é o que prova que a guarda está lá.
  v_erro := null;
  begin
    select count(*) into v_n_null  from public.rel_mov_itens_filiais(null::smallint[], v_de, v_ate);
    select count(*) into v_n_vazio from public.rel_mov_itens_filiais('{}'::smallint[], v_de, v_ate);
    select count(*) into v_n_todas from public.rel_mov_itens_filiais(v_todas, v_de, v_ate);
  exception when others then
    v_erro := sqlstate || ' ' || sqlerrm;
  end;
  if v_erro is not null then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1f_ERRO; ';
    raise warning '✗ 1f rel_mov_itens_filiais levantou erro com NULL ou vazio: %', v_erro;
  elsif pg_temp.assert_zero_de(
          '1f rel_mov_itens_filiais: NULL e vazio devolvem 0 linhas (e não o catálogo zerado)',
          v_n_null + v_n_vazio, 2 * v_n_todas) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1f; ';
  end if;

  -- 1g — rel_saldo_itens_filiais. Mesma razão de 1f, pelo outro caminho: aqui a CTE `alvo`
  -- vazia não gera nível nenhum — nem as linhas por filial, nem o total.
  v_erro := null;
  begin
    select count(*) into v_n_null  from public.rel_saldo_itens_filiais(null::smallint[], v_ate);
    select count(*) into v_n_vazio from public.rel_saldo_itens_filiais('{}'::smallint[], v_ate);
    select count(*) into v_n_todas from public.rel_saldo_itens_filiais(v_todas, v_ate);
  exception when others then
    v_erro := sqlstate || ' ' || sqlerrm;
  end;
  if v_erro is not null then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1g_ERRO; ';
    raise warning '✗ 1g rel_saldo_itens_filiais levantou erro com NULL ou vazio: %', v_erro;
  elsif pg_temp.assert_zero_de(
          '1g rel_saldo_itens_filiais: NULL e vazio devolvem 0 linhas, em nenhum dos dois níveis',
          v_n_null + v_n_vazio, 2 * v_n_todas) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1g; ';
  end if;

  -- 1h — rel_estoque_asof_filiais
  v_erro := null;
  begin
    select count(*) into v_n_null  from public.rel_estoque_asof_filiais(null::smallint[], v_ate);
    select count(*) into v_n_vazio from public.rel_estoque_asof_filiais('{}'::smallint[], v_ate);
    select count(*) into v_n_todas from public.rel_estoque_asof_filiais(v_todas, v_ate);
  exception when others then
    v_erro := sqlstate || ' ' || sqlerrm;
  end;
  if v_erro is not null then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1h_ERRO; ';
    raise warning '✗ 1h rel_estoque_asof_filiais levantou erro com NULL ou vazio: %', v_erro;
  elsif pg_temp.assert_zero_de(
          '1h rel_estoque_asof_filiais: NULL e vazio devolvem 0 linhas',
          v_n_null + v_n_vazio, 2 * v_n_todas) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1h; ';
  end if;

  -- =========================================================================
  -- 2 — A FILIAL DESATIVADA ENTRA NO CONSOLIDADO
  -- =========================================================================
  -- 2a — A EMENDA DE DOIS NÍVEIS de `/itens`, lida como a tela lê: UMA chamada com todas as
  -- filiais; as colunas são as linhas das filiais ATIVAS, o consolidado é o nível do total, e
  -- `estoqueForaDasColunas` (pura, em `src/lib/queries/itens.ts`) é total − Σ colunas. Se o
  -- total fosse calculado só com as ativas — ou se virasse a soma das colunas —, o fora daria
  -- 0 com a desativada guardando 7: a tela mentiria, e o teste da função pura continuaria
  -- verde. A mutação `f60-saldo-consolidado-so-das-ativas` derruba este rótulo.
  with r as (
    select * from public.rel_saldo_itens_filiais(v_todas, v_ate) where item_id = v_item
  )
  select (select r.estoque from r where r.filial_id is null),
         (select coalesce(sum(r.estoque), 0) from r where r.filial_id = any (v_ativas)),
         (select r.estoque from r where r.filial_id = v_fd)
    into v_tot_est, v_col_est, v_d_est;

  if v_tot_est = 12 and v_col_est = 5 and v_d_est = 7 and v_tot_est - v_col_est = 7 then
    v_ok := v_ok + 1;
    raise notice '✓ 2a /itens com TODAS: total 12 soma a desativada, as colunas ativas somam 5, o fora das colunas é 7 (> 0)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2a; ';
    raise warning '✗ 2a /itens com TODAS: esperado total 12, colunas ativas 5, desativada 7 (fora 7); obtido total %, colunas %, desativada % — o consolidado deixou de incluir a filial desativada, ou virou a soma das colunas',
      coalesce(v_tot_est::text, '(sem linha)'), v_col_est, coalesce(v_d_est::text, '(sem linha)');
  end if;

  -- 2b — A VARIANTE: a mesma leitura com a lista SÓ DAS ATIVAS. O total cai para 5, igual à
  -- soma das colunas, e o fora vira 0. Sem ela, 2a poderia estar verde por um motivo que não
  -- é a filial desativada (um lançamento esquecido numa ativa, por exemplo) — é o par que
  -- mostra que o cenário ENXERGA a emenda.
  with r as (
    select * from public.rel_saldo_itens_filiais(v_ativas, v_ate) where item_id = v_item
  )
  select (select r.estoque from r where r.filial_id is null),
         (select coalesce(sum(r.estoque), 0) from r where r.filial_id is not null),
         (select count(*) from r where r.filial_id = v_fd)
    into v_tot2_est, v_col2_est, v_d2_lin;

  if v_tot2_est = 5 and v_col2_est = 5 and v_d2_lin = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 2b /itens só com as ATIVAS: total 5 = colunas 5, fora 0, e nenhuma linha da desativada — 2a mede a desativada, não outra coisa';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2b; ';
    raise warning '✗ 2b /itens só com as ATIVAS: esperado total 5, colunas 5, 0 linhas da desativada; obtido total %, colunas %, linhas da desativada %',
      coalesce(v_tot2_est::text, '(sem linha)'), v_col2_est, v_d2_lin;
  end if;

  -- 2c — o as-of consolidado inclui o ativo da desativada, com a filial dela e o detentor.
  select count(*) into v_asof_n
    from public.rel_estoque_asof_filiais(v_todas, v_ate) r where r.ativo_id = v_ativo_d;
  select r.filial_id, r.status, r.colaborador into v_asof_fil, v_asof_st, v_asof_col
    from public.rel_estoque_asof_filiais(v_todas, v_ate) r where r.ativo_id = v_ativo_d;
  select count(*) into v_asof_n2
    from public.rel_estoque_asof_filiais(v_ativas, v_ate) r where r.ativo_id = v_ativo_d;

  if v_asof_n = 1 and v_asof_fil = v_fd and v_asof_st = 'em_uso'
     and v_asof_col = 'Fulano ZZF60' and v_asof_n2 = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 2c o as-of consolidado inclui o ativo da desativada (em_uso, com o detentor), e a lista só das ativas não';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2c; ';
    raise warning '✗ 2c as-of: esperado 1 linha na lista de todas (filial %, em_uso, Fulano ZZF60) e 0 na das ativas; obtido % linha(s), filial %, status %, detentor %, e % na das ativas',
      v_fd, v_asof_n, v_asof_fil, v_asof_st, coalesce(v_asof_col, '(nulo)'), v_asof_n2;
  end if;

  -- 2d — a contagem por status (os KPIs do dashboard). Relativa ao banco inteiro, porque pode
  -- haver outras desativadas com acervo: a lista de todas conta EXATAMENTE `ativos`, a das
  -- ativas conta tudo menos o acervo das desativadas, e o ativo desta está lá (em_uso).
  select coalesce(sum(c.total), 0) into v_c_todas  from public.rel_contagem_status_filiais(v_todas) c;
  select coalesce(sum(c.total), 0) into v_c_ativas from public.rel_contagem_status_filiais(v_ativas) c;
  select count(*) into v_c_tab from public.ativos;
  select count(*) into v_c_fora
    from public.ativos a join public.filiais f on f.id = a.filial_id
   where not f.ativo;
  select coalesce(sum(c.total), 0) into v_c_dela
    from public.rel_contagem_status_filiais(v_todas) c
   where c.status = 'em_uso';
  v_c_dela := v_c_dela - (select coalesce(sum(c.total), 0)
                            from public.rel_contagem_status_filiais(v_ativas) c
                           where c.status = 'em_uso');

  if v_c_todas = v_c_tab and v_c_todas - v_c_ativas = v_c_fora and v_c_fora >= 1 and v_c_dela >= 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 2d a contagem por status consolidada conta todo o acervo (%), inclusive os % ativo(s) de filial desativada — e o em_uso desta entra no número', v_c_todas, v_c_fora;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2d; ';
    raise warning '✗ 2d contagem: esperado todas = tabela e todas − ativas = acervo das desativadas (>= 1, com em_uso); obtido todas %, tabela %, ativas %, desativadas %, em_uso fora das ativas %',
      v_c_todas, v_c_tab, v_c_ativas, v_c_fora, v_c_dela;
  end if;

  -- 2e — os três relatórios de período. Mesma régua relativa: a lista de todas menos a das
  -- ativas é exatamente a contagem direta das saídas/devoluções de filial desativada no
  -- período, e o resumo (que agrupa por filial) tem a linha dela só na lista de todas.
  select coalesce(sum(r.total), 0) into v_p_todas  from public.rel_mov_por_mes_filiais(v_todas,  v_de, v_ate) r;
  select coalesce(sum(r.total), 0) into v_p_ativas from public.rel_mov_por_mes_filiais(v_ativas, v_de, v_ate) r;
  select coalesce(sum(r.total), 0) into v_m_todas  from public.rel_por_motivo_filiais(v_todas,  v_de, v_ate) r;
  select coalesce(sum(r.total), 0) into v_m_ativas from public.rel_por_motivo_filiais(v_ativas, v_de, v_ate) r;
  select count(*) into v_r_todas
    from public.rel_resumo_filiais(v_todas, v_de, v_ate) r where r.filial_slug = v_slug_fd;
  select count(*) into v_r_ativas
    from public.rel_resumo_filiais(v_ativas, v_de, v_ate) r where r.filial_slug = v_slug_fd;
  select count(*) into v_p_fora
    from public.movimentacoes m join public.filiais f on f.id = m.filial_id
   where not f.ativo and m.tipo in ('saida', 'devolucao') and m.data between v_de and v_ate;

  if v_p_fora >= 1
     and v_p_todas - v_p_ativas = v_p_fora
     and v_m_todas - v_m_ativas = v_p_fora
     and v_r_todas >= 1 and v_r_ativas = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 2e os três relatórios de período consolidados incluem as % saída(s)/devolução(ões) de filial desativada, e o resumo tem a linha da desativada só na lista de todas', v_p_fora;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2e; ';
    raise warning '✗ 2e período: esperado (todas − ativas) = % nos dois somatórios e a linha da desativada só no resumo de todas; obtido por mês %−%, por motivo %−%, resumo todas % / ativas %',
      v_p_fora, v_p_todas, v_p_ativas, v_m_todas, v_m_ativas, v_r_todas, v_r_ativas;
  end if;

  -- 2f — a movimentação de itens no período (o quadro de itens do relatório): as entradas do
  -- item somam a desativada na lista de todas (12), e não na das ativas (5).
  select coalesce(sum(r.entradas), 0) into v_e_todas
    from public.rel_mov_itens_filiais(v_todas, v_de, v_ate) r where r.item_id = v_item;
  select coalesce(sum(r.entradas), 0) into v_e_ativas
    from public.rel_mov_itens_filiais(v_ativas, v_de, v_ate) r where r.item_id = v_item;
  select coalesce(sum(r.entradas), 0) into v_e_dela
    from public.rel_mov_itens_filiais(array[v_fd], v_de, v_ate) r where r.item_id = v_item;

  if v_e_todas = 12 and v_e_ativas = 5 and v_e_dela = 7 then
    v_ok := v_ok + 1;
    raise notice '✓ 2f a movimentação de itens consolidada soma as entradas da desativada (12 = 5 das ativas + 7 dela)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2f; ';
    raise warning '✗ 2f entradas do item: esperado todas 12, ativas 5, desativada 7; obtido %, %, %',
      v_e_todas, v_e_ativas, v_e_dela;
  end if;

  -- =========================================================================
  -- 3 — OS DOIS NÍVEIS NÃO SÃO A SOMA
  -- =========================================================================
  -- 3a — `atrelados = Σ por chamado de greatest(0, reservas − liberações)`. O clamp é por
  -- chamado DENTRO do recorte, e não é aditivo quando o chamado atravessa filiais: na data de
  -- corte o chamado tem +5 em A e −5 em B (ver os fixtures). Por filial: A 5, B 0 → soma 5. No
  -- total, o chamado tem 0 → 0. O estoque segue: A 5, B 10 → soma 15; total 20. É por isso que
  -- a 0143 calcula o total sobre o CONJUNTO (grouping sets) e nunca somando as colunas — e é
  -- por isso que `/itens` lê o consolidado do nível do total.
  with r as (
    select * from public.rel_saldo_itens_filiais(array[v_fa, v_fb], v_corte_ch) where item_id = v_item_ch
  )
  select (select r.atrelados from r where r.filial_id is null),
         (select coalesce(sum(r.atrelados), 0) from r where r.filial_id is not null),
         (select r.estoque from r where r.filial_id is null),
         (select coalesce(sum(r.estoque), 0) from r where r.filial_id is not null)
    into v_atr_tot, v_atr_soma, v_est_tot, v_est_soma;

  if v_atr_tot = 0 and v_atr_soma = 5 and v_est_tot = 20 and v_est_soma = 15 then
    v_ok := v_ok + 1;
    raise notice '✓ 3a chamado que atravessa filiais: atrelados do total 0 e soma das filiais 5; estoque do total 20 e soma 15 — o total é calculado sobre o conjunto, não somado';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3a; ';
    raise warning '✗ 3a esperado atrelados total 0 / soma 5 e estoque total 20 / soma 15; obtido atrelados %/% e estoque %/% — o total virou a soma das colunas (ou o cenário não montou o chamado cruzado)',
      coalesce(v_atr_tot::text, '(sem linha)'), v_atr_soma, coalesce(v_est_tot::text, '(sem linha)'), v_est_soma;
  end if;

  -- =========================================================================
  -- 4 — PARA UMA FILIAL SÓ, O TOTAL É A LINHA DA FILIAL
  -- =========================================================================
  -- É a propriedade de que os roteiros migrados dependem: eles trocaram a chamada de uma filial
  -- pela lista de um elemento lida no nível do total (`where filial_id is null`). Aqui ela é
  -- provada item a item, sobre o catálogo inteiro que a função devolve: toda linha de um nível
  -- tem a gêmea idêntica no outro (nome, grupo, ordem e os quatro números). Universo = todas as
  -- linhas dos dois níveis; ruim = linha sem gêmea.
  --
  -- A premissa vem antes, e é o que impede o cenário de passar comparando zeros: em A o item
  -- do chamado tem atrelados 5 na data de corte (4a), e em B o clamp está AGINDO — reservas −
  -- liberações = −5, atrelados 0 (4b).

  -- 4a — filial A
  select r.atrelados into v_premissa
    from public.rel_saldo_itens_filiais(array[v_fa], v_corte_ch) r
   where r.filial_id is null and r.item_id = v_item_ch;
  if v_premissa is distinct from 5 then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4a_PREMISSA; ';
    raise warning '✗ 4a premissa: o item do chamado em A devia ter atrelados 5 na data de corte, veio % — a comparação abaixo seria entre zeros',
      coalesce(v_premissa::text, '(sem linha)');
  else
    -- Com UMA filial no recorte cada linha tem no máximo UMA candidata a gêmea no outro nível
    -- (o mesmo item), então o `left join` não multiplica: `count(*)` é o número de linhas.
    with r as (
      select * from public.rel_saldo_itens_filiais(array[v_fa], v_corte_ch)
    )
    select count(*), count(*) filter (where g.item_id is null)
      into v_univ, v_ruins
      from r t
      left join r g
        on g.item_id = t.item_id
       and (g.filial_id is null) <> (t.filial_id is null)
       and (g.item, g.grupo, g.ordem, g.total, g.estoque, g.atrelados, g.falta)
           is not distinct from
           (t.item, t.grupo, t.ordem, t.total, t.estoque, t.atrelados, t.falta);
    if pg_temp.assert_zero_de(
         '4a uma filial só (A): o nível do total é idêntico à linha da filial, item a item',
         v_ruins, v_univ) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '4a; ';
    end if;
  end if;

  -- 4b — filial B, com o clamp agindo
  select r.atrelados into v_premissa
    from public.rel_saldo_itens_filiais(array[v_fb], v_corte_ch) r
   where r.filial_id is null and r.item_id = v_item_ch;
  if v_premissa is distinct from 0 then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4b_PREMISSA; ';
    raise warning '✗ 4b premissa: o item do chamado em B devia ter atrelados 0 (clamp de −5) na data de corte, veio %',
      coalesce(v_premissa::text, '(sem linha)');
  else
    -- Com UMA filial no recorte cada linha tem no máximo UMA candidata a gêmea no outro nível
    -- (o mesmo item), então o `left join` não multiplica: `count(*)` é o número de linhas.
    with r as (
      select * from public.rel_saldo_itens_filiais(array[v_fb], v_corte_ch)
    )
    select count(*), count(*) filter (where g.item_id is null)
      into v_univ, v_ruins
      from r t
      left join r g
        on g.item_id = t.item_id
       and (g.filial_id is null) <> (t.filial_id is null)
       and (g.item, g.grupo, g.ordem, g.total, g.estoque, g.atrelados, g.falta)
           is not distinct from
           (t.item, t.grupo, t.ordem, t.total, t.estoque, t.atrelados, t.falta);
    if pg_temp.assert_zero_de(
         '4b uma filial só (B, com o clamp agindo): o nível do total é idêntico à linha da filial, item a item',
         v_ruins, v_univ) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '4b; ';
    end if;
  end if;

  -- =========================================================================
  -- RESUMO (a linha que o MCP consegue ler — ele engole NOTICE/WARNING)
  -- =========================================================================
  insert into _f60_recorte_resumo values (v_ok, v_falhas, nullif(v_msgs, ''));
  if v_falhas = 0 then
    raise notice '=== f60_recorte: % asserções OK, 0 falhas (ROLLBACK — nada gravado) ===', v_ok;
  else
    raise warning '✗ TOTAL f60_recorte: % falha(s) — %', v_falhas, v_msgs;
  end if;
  raise notice 'FIM f60_recorte: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

select * from _f60_recorte_resumo;

rollback;
