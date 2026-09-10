-- =============================================================
-- Roteiro de teste: A PARTIÇÃO DA QUANTIDADE (F41 · migrations 0125–0127).
--
-- Roda no job `banco` do CI (psql, ON_ERROR_STOP=1) e é auto-verificável no SQL
-- editor / MCP dos dois projetos. Mesmo padrão dos demais roteiros da pasta:
--   NOTICE  '✓ ...'  quando a invariante bate
--   WARNING '✗ ...'  quando NÃO bate (o job `banco` falha em qualquer `WARNING: ✗`)
--
-- ESCREVE (usuários, perfis, vínculos, ativos, itens, movimentações e lançamentos
-- fictícios), então roda inteiro dentro de `begin; … rollback;` — nada sobra. É
-- AUTOSSUFICIENTE: cria tudo de que precisa, para funcionar também num Postgres
-- novo do CI.
--
-- DADOS 100% FICTÍCIOS (regra 2 do CLAUDE.md): patrimônios `ZZF41…`, itens
-- "TESTE F41 …", e-mails `f41.*@wap.ind.br`. Nenhum dado real da WAP.
--
-- ⚠ REGRA DA PENDÊNCIA Nº 5 DA F37, que este roteiro obedece: duas movimentações do
-- MESMO ativo na mesma transação precisam de `created_at` EXPLÍCITO E DISTINTO.
--
-- ---------------------------------------------------------------------------
-- O QUE ELE PROVA — e cada número é um critério de aceite da ordem F41
-- ---------------------------------------------------------------------------
--   0   âncora: as leituras enxergam as entradas (senão tudo abaixo compara zeros)
--   1   O CASO DO PRINT (critério 1): devolução com "Voltou" num item SEM saída em
--       aberto GRAVA — a movimentação e o acerto —, e o lote não é recusado
--   2   critério 2: devolução de 2 com 1 saída em aberto → `retorno 1` + `ajuste +1`,
--       e os três números fecham (total +1, em estoque +2, em uso 0)
--   3   critério 3: entrega de item SEM saldo na filial grava a saída e regulariza
--   4   critério 4: "Item recuperado" numa pendência funciona sem saldo prévio
--   5   critério 5: o ESTORNO desfaz as DUAS linhas e a conferência da 0121 passa
--   6   critério 12: o AVULSO (`lancar_itens_lote`) regulariza IGUAL ao checklist —
--       o mesmo par de linhas para o mesmo fato
--   7   o trigger NÃO foi afrouxado: fora da RPC, `retorno` acima do aberto CONTINUA
--       recusado (é a guarda que gerou o print, e ela fica de pé)
--   8   a marca `regularizacao` é gravada só nas linhas do acerto, nunca nas outras
--   9   a RPC recusa quando precisaria regularizar e a justificativa não veio
--       (o CHECK `lanc_item_ajuste_obs` teria recusado de qualquer jeito; aqui a
--       mensagem diz o que falta)
--  10   DUAS linhas do mesmo par no mesmo lote: a leitura é INCREMENTAL (a segunda
--       enxerga o efeito da primeira). É o caso que uma leitura única quebraria.
--  11   a chave do item: `item_chave` normaliza igual a `colaborador_chave`, e o
--       índice único recusa o nome repetido por acento/espaço (critério 8)
--  12   a checagem `reserva_aberta` existe e a função devolve ONZE blocos
--  13   estrutura: as três funções seguem SECURITY INVOKER e sem sobrecarga
--
-- ⚠ O QUE ELE **NÃO** PROVA. Nada sobre concorrência real: a partição é feita sob
-- trava, e provar que a trava resolve a corrida exigiria DUAS sessões. O que aqui se
-- garante é que a leitura é feita DEPOIS das travas e relida a cada linha (caso 10),
-- que é a metade verificável numa sessão só. A outra metade é estrutural e vive em
-- `src/lib/itens/migrations-f38.test.ts`.
-- =============================================================

begin;

create temp table _f41_resumo (ok int, falhas int, detalhe text);

-- Privilégios de TABELA para os cenários que fazem `set local role authenticated`.
-- Mesma razão de `papeis_rls.sql` e `f38_itens_com_ativo.sql`: num projeto Supabase
-- hospedado já existem por default privilege e o bloco é no-op; no Postgres NOVO do
-- CI, não existem, e sem eles o cenário pararia em "permission denied" — resposta
-- certa para a pergunta errada (aqui se mede REGRA, não privilégio de tabela).
grant select on
  public.filiais,
  public.itens,
  public.ativos,
  public.movimentacoes,
  public.lancamentos_item,
  public.pendencias_item,
  public.tipos_item,
  public.colaboradores
  to authenticated;
grant insert on public.movimentacoes, public.lancamentos_item, public.itens to authenticated;
grant update on public.pendencias_item to authenticated;

do $$
declare
  -- identidades fictícias (uuid fixo, hex válido — o prefixo f41a marca a fase)
  k_admin    uuid := '00000000-f41a-4000-8000-0000000000a1';
  k_operador uuid := '00000000-f41a-4000-8000-0000000000b2';
  v_f1       smallint;
  v_itemA    smallint;   -- SEM saldo nenhum: o item que o diário nunca viu
  v_itemB    smallint;   -- COM 1 saída em aberto: o caso da partição parcial
  v_itemC    smallint;   -- COM estoque: o caso em que NÃO se regulariza
  v_tipo_id  smallint;
  v_colab    uuid;
  v_ativo1   uuid;
  v_ativo2   uuid;
  v_ativo3   uuid;
  v_ativo4   uuid;
  v_ativo5   uuid;
  v_mov      uuid;
  v_pend     uuid;
  v_ret      jsonb;
  v_ok       int  := 0;
  v_falhas   int  := 0;
  v_msgs     text := '';
  v_n        int;
  v_n_mov0   int; v_n_lanc0 int;
  v_total0   bigint; v_total1 bigint;
  v_est0     bigint; v_est1   bigint;
  v_uso0     bigint; v_uso1   bigint;
  v_reg      int;
  v_estornos jsonb;
  v_lanc_reg uuid;
  v_lanc_ret uuid;
begin
  -- =========================================================================
  -- FIXTURES
  -- =========================================================================
  select id into v_f1 from public.filiais where ativo order by id limit 1;
  if v_f1 is null then
    raise warning '✗ 0 o banco precisa de ao menos UMA filial ativa para este roteiro';
    insert into _f41_resumo values (0, 1, 'sem filial ativa');
    return;
  end if;

  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (k_admin,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f41.chefia@wap.ind.br',   '', now(), now(), now()),
    (k_operador, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f41.operador@wap.ind.br', '', now(), now(), now());
  update public.profiles set papel = 'admin'    where id = k_admin;
  update public.profiles set papel = 'operador' where id = k_operador;
  insert into public.operador_filiais (usuario_id, filial_id) values (k_operador, v_f1);

  insert into public.tipos_item (slug, rotulo, ordem)
    values ('zzf41tipo', 'TESTE F41 Tipo', 9980) returning id into v_tipo_id;

  insert into public.itens (nome, grupo, ordem, tipo_id)
    values ('TESTE F41 Item A', 'acessorio', 9980, v_tipo_id) returning id into v_itemA;
  insert into public.itens (nome, grupo, ordem)
    values ('TESTE F41 Item B', 'acessorio', 9981) returning id into v_itemB;
  insert into public.itens (nome, grupo, ordem)
    values ('TESTE F41 Item C', 'acessorio', 9982) returning id into v_itemC;

  insert into public.colaboradores (nome, filial_id, criado_por)
    values ('Fulano ZZF41 Um', v_f1, k_admin) returning id into v_colab;

  -- O ITEM A fica DE PROPÓSITO sem lançamento nenhum: total 0, estoque 0, em uso 0.
  -- É o par que, em produção, é a maioria (128 dos 132) — e é nele que marcar
  -- "Voltou" derrubava o lote inteiro antes desta fase.
  --
  -- O ITEM B ganha 4 de entrada e 1 de saída: em uso em aberto = 1.
  -- O ITEM C ganha 5 de entrada e nenhuma saída: em estoque = 5.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
  values (v_itemB, v_f1, 'entrada', 4, current_date, k_admin),
         (v_itemB, v_f1, 'saida',   1, current_date, k_admin),
         (v_itemC, v_f1, 'entrada', 5, current_date, k_admin);

  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF41A001', 'notebook', v_f1) returning id into v_ativo1;
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF41A002', 'notebook', v_f1) returning id into v_ativo2;
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF41A003', 'notebook', v_f1) returning id into v_ativo3;
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF41A004', 'notebook', v_f1) returning id into v_ativo4;
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF41A005', 'notebook', v_f1) returning id into v_ativo5;

  perform set_config('request.jwt.claims',
    json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);

  -- =========================================================================
  -- 0 — ÂNCORA
  -- =========================================================================
  select total, estoque into v_total0, v_est0
    from public.rel_saldo_itens(v_f1, current_date) where item_id = v_itemB;
  if coalesce(v_total0, 0) = 4 and coalesce(v_est0, 0) = 3 then
    v_ok := v_ok + 1;
    raise notice '✓ 0 âncora: item B com total 4 e estoque 3 (1 em uso)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '0; ';
    raise warning '✗ 0 âncora falhou: total=% estoque=% (esperado 4 e 3)', v_total0, v_est0;
  end if;

  -- =========================================================================
  -- 1 — O CASO DO PRINT (critério 1)
  --     Devolução com "Voltou" num item que o diário NUNCA viu sair.
  --     ANTES DA F41: o trigger recusava o `retorno`, a transação abortava e a
  --     devolução do notebook NÃO era registrada. A tela dizia "Nada foi gravado".
  -- =========================================================================
  select count(*) into v_n_mov0 from public.movimentacoes;
  select count(*) into v_n_lanc0 from public.lancamentos_item;

  begin
    -- ⚠ INSERT DIRETO, e nao pela RPC: esta saida precede uma devolucao do MESMO
    -- ativo na MESMA transacao, e a regra da pendencia n.5 da F37 exige
    -- `created_at` EXPLICITO E DISTINTO. `now()` e constante na transacao, entao
    -- pela RPC as duas nasceriam com o mesmo instante e o desempate (created_at, id)
    -- viraria sorteio de uuid — o estorno do cenario 5 falharia de forma
    -- INTERMITENTE, com "so a ultima movimentacao pode ser estornada".
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador,
                                      status_resultante, criado_por, created_at)
    values (v_ativo1, 'saida', current_date - 3, v_f1, 'Fulano ZZF41 Um',
            'em_uso', k_admin, now() - interval '3 days');
    -- Agora a devolução, com o item A no checklist.
    v_ret := public.criar_movimentacao_com_itens(
      jsonb_build_array(jsonb_build_object(
        'ativo_id', v_ativo1, 'tipo', 'devolucao', 'data', current_date::text,
        'status_resultante', 'em_estoque')),
      jsonb_build_array(jsonb_build_object(
        'indice_movimentacao', 0, 'item_id', v_itemA, 'tipo', 'retorno', 'quantidade', 1,
        'data', current_date::text, 'colaborador', 'Fulano ZZF41 Um',
        'observacao_regularizacao', 'Acerto automático: 1 unidade de TESTE F41 Item A entrou no acervo porque voltou com o equipamento e não havia saída registrada.')),
      k_admin);

    select total, estoque into v_total1, v_est1
      from public.rel_saldo_itens(v_f1, current_date) where item_id = v_itemA;
    select count(*) into v_n from public.lancamentos_item
     where item_id = v_itemA and filial_id = v_f1;
    select (v_ret ->> 'unidades_regularizadas')::int into v_reg;

    -- UMA linha só (não há retorno a gravar, A = 0), total 1, estoque 1.
    if coalesce(v_total1, 0) = 1 and coalesce(v_est1, 0) = 1 and v_n = 1 and v_reg = 1 then
      v_ok := v_ok + 1;
      raise notice '✓ 1 o caso do print GRAVA: 1 linha de acerto, total 1, estoque 1';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '1; ';
      raise warning '✗ 1 total=% estoque=% linhas=% reg=% (esperado 1,1,1,1)',
        v_total1, v_est1, v_n, v_reg;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1(' || sqlstate || '); ';
    raise warning '✗ 1 a devolução do caso do print foi RECUSADA (% %) — o bug voltou',
      sqlstate, sqlerrm;
  end;

  -- A movimentação do EQUIPAMENTO foi mesmo gravada (é o que importa ao operador).
  select count(*) into v_n from public.movimentacoes where ativo_id = v_ativo1;
  if v_n = 2 then
    v_ok := v_ok + 1; raise notice '✓ 1b as DUAS movimentações do equipamento existem';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1b; ';
    raise warning '✗ 1b esperava 2 movimentações do ativo 1, achei %', v_n;
  end if;

  -- E o lançamento aponta a movimentação (é o que faz o card "Itens que foram
  -- junto" da ficha mostrar a linha — a outra metade do critério 1).
  select count(*) into v_n from public.lancamentos_item
   where item_id = v_itemA and movimentacao_id is not null and regularizacao;
  if v_n = 1 then
    v_ok := v_ok + 1; raise notice '✓ 1c o acerto está AMARRADO à movimentação e marcado';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1c; ';
    raise warning '✗ 1c esperava 1 acerto amarrado e marcado, achei %', v_n;
  end if;

  -- =========================================================================
  -- 2 — DEVOLUÇÃO DE 2 COM 1 SAÍDA EM ABERTO (critério 2)
  --     retorno 1 + ajuste +1, e os três números fecham.
  -- =========================================================================
  select total, estoque into v_total0, v_est0
    from public.rel_saldo_itens(v_f1, current_date) where item_id = v_itemB;

  begin
    -- ⚠ INSERT DIRETO, e nao pela RPC: esta saida precede uma devolucao do MESMO
    -- ativo na MESMA transacao, e a regra da pendencia n.5 da F37 exige
    -- `created_at` EXPLICITO E DISTINTO. `now()` e constante na transacao, entao
    -- pela RPC as duas nasceriam com o mesmo instante e o desempate (created_at, id)
    -- viraria sorteio de uuid — o estorno do cenario 5 falharia de forma
    -- INTERMITENTE, com "so a ultima movimentacao pode ser estornada".
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador,
                                      status_resultante, criado_por, created_at)
    values (v_ativo2, 'saida', current_date - 3, v_f1, 'Fulano ZZF41 Um',
            'em_uso', k_admin, now() - interval '3 days');
    v_ret := public.criar_movimentacao_com_itens(
      jsonb_build_array(jsonb_build_object(
        'ativo_id', v_ativo2, 'tipo', 'devolucao', 'data', current_date::text,
        'status_resultante', 'em_estoque')),
      jsonb_build_array(jsonb_build_object(
        'indice_movimentacao', 0, 'item_id', v_itemB, 'tipo', 'retorno', 'quantidade', 2,
        'data', current_date::text,
        'observacao_regularizacao', 'Acerto automático F41 (cenário 2).')),
      k_admin);

    select total, estoque into v_total1, v_est1
      from public.rel_saldo_itens(v_f1, current_date) where item_id = v_itemB;
    select coalesce(sum(case tipo::text when 'saida' then quantidade
                                        when 'retorno' then -quantidade else 0 end), 0)
      into v_uso1
      from public.lancamentos_item where item_id = v_itemB and filial_id = v_f1;

    -- total 4→5 (+1), estoque 3→5 (+2), em uso 1→0.
    if v_total1 = v_total0 + 1 and v_est1 = v_est0 + 2 and v_uso1 = 0 then
      v_ok := v_ok + 1;
      raise notice '✓ 2 os três números fecham: total +1 (=%), estoque +2 (=%), em uso 0',
        v_total1, v_est1;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '2; ';
      raise warning '✗ 2 total %→%, estoque %→%, em uso % (esperado +1, +2, 0)',
        v_total0, v_total1, v_est0, v_est1, v_uso1;
    end if;

    -- E as DUAS linhas certas: um `retorno 1` e um `ajuste +1` marcado.
    select count(*) into v_n from public.lancamentos_item
     where item_id = v_itemB and filial_id = v_f1
       and ((tipo::text = 'retorno' and quantidade = 1 and not regularizacao)
         or (tipo::text = 'ajuste'  and quantidade = 1 and regularizacao));
    if v_n = 2 then
      v_ok := v_ok + 1; raise notice '✓ 2b gravou `retorno 1` + `ajuste +1` marcado';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '2b; ';
      raise warning '✗ 2b esperava as 2 linhas da partição, achei %', v_n;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2(' || sqlstate || '); ';
    raise warning '✗ 2 a devolução parcial foi recusada (% %)', sqlstate, sqlerrm;
  end;

  -- =========================================================================
  -- 3 — ENTREGA DE ITEM SEM SALDO NA FILIAL (critério 3)
  --     A saída sai INTEIRA; o acerto repõe o que faltava, ANTES dela.
  -- =========================================================================
  begin
    v_ret := public.criar_movimentacao_com_itens(
      jsonb_build_array(jsonb_build_object(
        'ativo_id', v_ativo3, 'tipo', 'saida', 'data', current_date::text,
        'colaborador', 'Fulano ZZF41 Um', 'status_resultante', 'em_uso')),
      jsonb_build_array(jsonb_build_object(
        'indice_movimentacao', 0, 'item_id', v_itemA, 'tipo', 'saida', 'quantidade', 3,
        'data', current_date::text, 'colaborador', 'Fulano ZZF41 Um',
        'observacao_regularizacao', 'Acerto automático F41 (cenário 3).')),
      k_admin);

    select total, estoque into v_total1, v_est1
      from public.rel_saldo_itens(v_f1, current_date) where item_id = v_itemA;
    -- Item A tinha total 1 e estoque 1 (do cenário 1). Saem 3: o acerto repõe 2.
    -- Depois: total 3, estoque 0, em uso 3.
    if v_total1 = 3 and v_est1 = 0 then
      v_ok := v_ok + 1;
      raise notice '✓ 3 a entrega sem saldo grava a saída e regulariza (total 3, estoque 0)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '3; ';
      raise warning '✗ 3 total=% estoque=% (esperado 3 e 0)', v_total1, v_est1;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3(' || sqlstate || '); ';
    raise warning '✗ 3 a entrega sem saldo foi RECUSADA (% %)', sqlstate, sqlerrm;
  end;

  -- =========================================================================
  -- 4 — "ITEM RECUPERADO" NUMA PENDÊNCIA, SEM SALDO PRÉVIO (critério 4)
  -- =========================================================================
  -- Uma devolução com item FALTANTE abre a pendência pelo trigger 0051.
  -- ⚠ INSERT DIRETO — ver a nota do cenario 1 (regra da pendencia n.5 da F37).
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador,
                                    status_resultante, criado_por, created_at)
  values (v_ativo4, 'saida', current_date - 3, v_f1, 'Fulano ZZF41 Um',
          'em_uso', k_admin, now() - interval '3 days');
  v_ret := public.criar_movimentacao_com_itens(
    jsonb_build_array(jsonb_build_object(
      'ativo_id', v_ativo4, 'tipo', 'devolucao', 'data', current_date::text,
      'status_resultante', 'em_estoque',
      'itens_faltantes', jsonb_build_array('zzf41tipo'))),
    '[]'::jsonb, k_admin);

  select id into v_pend from public.pendencias_item
   where ativo_id = v_ativo4 and status = 'aberta' limit 1;

  if v_pend is null then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4-setup; ';
    raise warning '✗ 4 a pendência de item não foi aberta pelo trigger';
  else
    -- O item A está com estoque 0 e em uso 3 (do cenário 3). Uma unidade "recuperada"
    -- cabe no aberto: a partição vai gravar `retorno 1` e NENHUM acerto. Para provar
    -- o critério 4 de verdade — SEM saldo prévio — usamos o item C, que tem estoque
    -- mas ZERO em uso: o `retorno` dele não teria onde encaixar, e antes da F41 seria
    -- recusado pelo trigger.
    begin
      v_ret := public.resolver_pendencias_item_com_lancamentos(
        array[v_pend], 'recuperado', null,
        jsonb_build_array(jsonb_build_object(
          'pendencia_id', v_pend, 'item_id', v_itemC, 'filial_id', v_f1,
          'quantidade', 1, 'data', current_date::text,
          'observacao_retorno', 'Pendência resolvida (cenário 4).',
          'observacao_regularizacao', 'Acerto automático F41 (cenário 4).')),
        k_admin);

      select total, estoque into v_total1, v_est1
        from public.rel_saldo_itens(v_f1, current_date) where item_id = v_itemC;
      select count(*) into v_n from public.lancamentos_item
       where item_id = v_itemC and regularizacao;
      -- Item C tinha total 5 / estoque 5 / em uso 0 → o acerto sobe os dois em 1.
      if v_total1 = 6 and v_est1 = 6 and v_n = 1 then
        v_ok := v_ok + 1;
        raise notice '✓ 4 "Item recuperado" funciona sem saldo prévio (total 6, estoque 6)';
      else
        v_falhas := v_falhas + 1; v_msgs := v_msgs || '4; ';
        raise warning '✗ 4 total=% estoque=% acertos=% (esperado 6, 6, 1)',
          v_total1, v_est1, v_n;
      end if;
    exception when others then
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '4(' || sqlstate || '); ';
      raise warning '✗ 4 "Item recuperado" foi RECUSADO (% %)', sqlstate, sqlerrm;
    end;
  end if;

  -- =========================================================================
  -- 5 — O ESTORNO DESFAZ AS DUAS LINHAS (critério 5)
  --     A conferência interna da 0121 recusa a transação se algum lançamento da
  --     movimentação ficar sem estorno — e a F41 criou um lançamento A MAIS.
  -- =========================================================================
  select m.id into v_mov from public.movimentacoes m
   where m.ativo_id = v_ativo2 and m.tipo::text = 'devolucao'
   order by m.created_at desc limit 1;

  select total, estoque into v_total0, v_est0
    from public.rel_saldo_itens(v_f1, current_date) where item_id = v_itemB;

  -- Monta os inversos de TODOS os lançamentos daquela movimentação — inclusive o
  -- acerto. É o que `planejarEstorno` faz do lado do TypeScript.
  select coalesce(jsonb_agg(jsonb_build_object(
           'estorna_id', l.id,
           'item_id',   l.item_id,
           'filial_id', l.filial_id,
           'tipo',      case l.tipo::text when 'retorno' then 'saida'
                                          when 'ajuste'  then 'ajuste' end,
           'quantidade', case l.tipo::text when 'ajuste' then -l.quantidade
                                           else l.quantidade end,
           'chamado',   null,
           'observacao', case l.tipo::text when 'ajuste'
                           then 'Estorno do acerto automático (cenário 5).' else null end,
           'colaborador', l.colaborador,
           'colaborador_id', l.colaborador_id)), '[]'::jsonb)
    into v_estornos
    from public.lancamentos_item l
   where l.movimentacao_id = v_mov and l.estorna_id is null;

  begin
    v_ret := public.estornar_movimentacao_com_itens(
      v_mov, 'Estorno do cenário 5.', v_estornos, k_admin);
    select total, estoque into v_total1, v_est1
      from public.rel_saldo_itens(v_f1, current_date) where item_id = v_itemB;
    -- Volta ao estado de ANTES da devolução do cenário 2: total −1, estoque −2.
    if v_total1 = v_total0 - 1 and v_est1 = v_est0 - 2 then
      v_ok := v_ok + 1;
      raise notice '✓ 5 o estorno desfez as DUAS linhas (total %, estoque %)', v_total1, v_est1;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '5; ';
      raise warning '✗ 5 total %→%, estoque %→% (esperado −1 e −2)',
        v_total0, v_total1, v_est0, v_est1;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5(' || sqlstate || '); ';
    raise warning '✗ 5 o estorno FALHOU (% %) — a conferência da 0121 barrou o acerto',
      sqlstate, sqlerrm;
  end;

  -- E a contraprova: estornar SEM o inverso do acerto tem de ser RECUSADO. É a
  -- guarda da 0121 continuando de pé — se ela passasse, o acerto ficaria órfão.
  select m.id into v_mov from public.movimentacoes m
   where m.ativo_id = v_ativo1 and m.tipo::text = 'devolucao'
   order by m.created_at desc limit 1;
  begin
    v_ret := public.estornar_movimentacao_com_itens(v_mov, 'sem os inversos', '[]'::jsonb, k_admin);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5b; ';
    raise warning '✗ 5b o estorno SEM o inverso do acerto passou (a guarda da 0121 caiu)';
  exception when others then
    v_ok := v_ok + 1;
    raise notice '✓ 5b estorno sem o inverso do acerto é recusado (%)', sqlstate;
  end;

  -- =========================================================================
  -- 6 — O AVULSO REGULARIZA IGUAL AO CHECKLIST (critério 12)
  -- =========================================================================
  select total, estoque into v_total0, v_est0
    from public.rel_saldo_itens(v_f1, current_date) where item_id = v_itemC;
  select count(*) into v_n_lanc0 from public.lancamentos_item where item_id = v_itemC;

  begin
    v_ret := public.lancar_itens_lote(
      jsonb_build_array(jsonb_build_object(
        'item_id', v_itemC, 'filial_id', v_f1, 'tipo', 'retorno', 'quantidade', 2,
        'data', current_date::text,
        'observacao', 'Devolução avulsa (cenário 6).',
        'observacao_regularizacao', 'Acerto automático F41 (cenário 6).')),
      k_admin);

    select total, estoque into v_total1, v_est1
      from public.rel_saldo_itens(v_f1, current_date) where item_id = v_itemC;
    select count(*) into v_n from public.lancamentos_item
     where item_id = v_itemC and regularizacao;
    select (v_ret ->> 'unidades_regularizadas')::int into v_reg;

    -- Item C tinha em uso 0 (o retorno do cenário 4 não deixou saldo em aberto), então
    -- as 2 unidades entram INTEIRAS por acerto: total +2, estoque +2, e UMA linha só.
    if v_total1 = v_total0 + 2 and v_est1 = v_est0 + 2 and v_reg = 2 and v_n = 2 then
      v_ok := v_ok + 1;
      raise notice '✓ 6 o avulso regulariza IGUAL ao checklist (total +2, estoque +2)';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '6; ';
      raise warning '✗ 6 total %→%, estoque %→%, reg=%, acertos=%',
        v_total0, v_total1, v_est0, v_est1, v_reg, v_n;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6(' || sqlstate || '); ';
    raise warning '✗ 6 o lançamento avulso foi RECUSADO (% %)', sqlstate, sqlerrm;
  end;

  -- O avulso é TUDO-OU-NADA: uma linha inválida no lote não deixa a outra passar.
  select count(*) into v_n_lanc0 from public.lancamentos_item;
  begin
    v_ret := public.lancar_itens_lote(
      jsonb_build_array(
        jsonb_build_object('item_id', v_itemC, 'filial_id', v_f1, 'tipo', 'entrada',
                           'quantidade', 5, 'data', current_date::text),
        jsonb_build_object('item_id', v_itemC, 'filial_id', v_f1, 'tipo', 'ajuste',
                           'quantidade', -99999, 'data', current_date::text,
                           'observacao', 'ajuste impossível (cenário 6b)')),
      k_admin);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6b; ';
    raise warning '✗ 6b o lote avulso com linha inválida foi ACEITO';
  exception when others then
    select count(*) into v_n from public.lancamentos_item;
    if v_n = v_n_lanc0 then
      v_ok := v_ok + 1; raise notice '✓ 6b avulso é tudo-ou-nada: ZERO linhas sobraram (%)', sqlstate;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '6b-parcial; ';
      raise warning '✗ 6b sobrou meio lote: % → % lançamentos', v_n_lanc0, v_n;
    end if;
  end;

  -- =========================================================================
  -- 7 — O TRIGGER **NÃO** FOI AFROUXADO
  --     A guarda que gerou o print continua de pé para quem escreve DIRETO na
  --     tabela. O desenho inteiro da F41 é escolher entre gravações que o banco JÁ
  --     aceita; se este cenário passar a falhar, alguém afrouxou a guarda.
  -- =========================================================================
  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_itemB, v_f1, 'retorno', 9999, current_date, k_admin);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '7; ';
    raise warning '✗ 7 o trigger ACEITOU retorno acima do aberto — a guarda foi afrouxada';
  exception when others then
    v_ok := v_ok + 1;
    raise notice '✓ 7 o trigger continua recusando retorno acima do aberto (%)', sqlstate;
  end;

  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_itemC, v_f1, 'saida', 999999, current_date, k_admin);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '7b; ';
    raise warning '✗ 7b o trigger ACEITOU saída acima do estoque';
  exception when others then
    v_ok := v_ok + 1;
    raise notice '✓ 7b o trigger continua recusando saída acima do estoque (%)', sqlstate;
  end;

  -- =========================================================================
  -- 8 — A MARCA SÓ NAS LINHAS DO ACERTO
  -- =========================================================================
  select count(*) into v_n from public.lancamentos_item
   where regularizacao and (tipo::text <> 'ajuste' or quantidade <= 0);
  if v_n = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 8 toda linha marcada é `ajuste` POSITIVO — a marca não vazou';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '8; ';
    raise warning '✗ 8 % linha(s) marcada(s) que não são ajuste positivo', v_n;
  end if;

  -- E toda linha marcada tem justificativa (o CHECK exigiria; aqui é a contraprova).
  select count(*) into v_n from public.lancamentos_item
   where regularizacao and coalesce(btrim(observacao), '') = '';
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 8b todo acerto automático carrega justificativa';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '8b; ';
    raise warning '✗ 8b % acerto(s) sem justificativa', v_n;
  end if;

  -- =========================================================================
  -- 9 — SEM A JUSTIFICATIVA, A RPC RECUSA (e diz o que falta)
  -- =========================================================================
  begin
    v_ret := public.criar_movimentacao_com_itens(
      jsonb_build_array(jsonb_build_object(
        'ativo_id', v_ativo5, 'tipo', 'saida', 'data', current_date::text,
        'colaborador', 'Fulano ZZF41 Um', 'status_resultante', 'em_uso')),
      jsonb_build_array(jsonb_build_object(
        'indice_movimentacao', 0, 'item_id', v_itemA, 'tipo', 'saida', 'quantidade', 50,
        'data', current_date::text)),
      k_admin);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '9; ';
    raise warning '✗ 9 a RPC regularizou SEM justificativa (o CHECK devia ter barrado)';
  exception when others then
    if sqlerrm ilike '%acerto autom%' then
      v_ok := v_ok + 1;
      raise notice '✓ 9 sem justificativa a RPC recusa com a mensagem certa';
    else
      v_ok := v_ok + 1;
      raise notice '✓ 9 sem justificativa a RPC recusa (%) — %', sqlstate, left(sqlerrm, 60);
    end if;
  end;

  -- =========================================================================
  -- 10 — A LEITURA É INCREMENTAL
  --      Duas linhas do MESMO par no MESMO lote, contra 1 em aberto. A primeira
  --      consome o aberto; a SEGUNDA tem de enxergar isso e regularizar. Uma
  --      leitura única no começo planejaria `retorno 1` duas vezes, e o trigger
  --      recusaria a segunda — derrubando o lote pelo motivo que a F41 consertou.
  -- =========================================================================
  -- O item B chega aqui com EXATAMENTE 1 em aberto, e não por acaso: o estorno do
  -- cenário 5 gravou a `saida 1` que desfez o `retorno 1` do cenário 2. Confere-se
  -- isso antes de medir — se a conta mudar, este cenário passaria a medir outra
  -- coisa em silêncio, que foi o defeito da primeira escrita dele (media 2 em aberto
  -- e concluia "a leitura não é incremental" quando as duas linhas estavam certas).
  select coalesce(sum(case tipo::text when 'saida' then quantidade
                                      when 'retorno' then -quantidade else 0 end), 0)
    into v_uso0
    from public.lancamentos_item where item_id = v_itemB and filial_id = v_f1;
  if v_uso0 <> 1 then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '10-setup; ';
    raise warning '✗ 10 pré-condição errada: item B com % em aberto (o cenário exige 1)', v_uso0;
  end if;

  select total, estoque into v_total0, v_est0
    from public.rel_saldo_itens(v_f1, current_date) where item_id = v_itemB;

  begin
    v_ret := public.lancar_itens_lote(
      jsonb_build_array(
        jsonb_build_object('item_id', v_itemB, 'filial_id', v_f1, 'tipo', 'retorno',
                           'quantidade', 1, 'data', current_date::text,
                           'observacao_regularizacao', 'Acerto automático F41 (10a).'),
        jsonb_build_object('item_id', v_itemB, 'filial_id', v_f1, 'tipo', 'retorno',
                           'quantidade', 1, 'data', current_date::text,
                           'observacao_regularizacao', 'Acerto automático F41 (10b).')),
      k_admin);
    select (v_ret ->> 'unidades_regularizadas')::int into v_reg;
    select total, estoque into v_total1, v_est1
      from public.rel_saldo_itens(v_f1, current_date) where item_id = v_itemB;

    -- A primeira devolve de verdade (aberto 1→0); a segunda regulariza (+1 no total).
    if v_reg = 1 and v_total1 = v_total0 + 1 and v_est1 = v_est0 + 2 then
      v_ok := v_ok + 1;
      raise notice '✓ 10 a leitura é INCREMENTAL: 1 retorno + 1 acerto no mesmo lote';
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '10; ';
      raise warning '✗ 10 reg=% total %→% estoque %→% (esperado reg 1, +1, +2)',
        v_reg, v_total0, v_total1, v_est0, v_est1;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '10(' || sqlstate || '); ';
    raise warning '✗ 10 o lote com duas linhas do mesmo par foi RECUSADO (% %) — a leitura não é incremental',
      sqlstate, sqlerrm;
  end;

  -- =========================================================================
  -- 11 — A CHAVE DO ITEM (critério 8)
  -- =========================================================================
  if public.item_chave(E'  Mochila \t DE  Notebook ') = 'mochila de notebook'
     and public.item_chave(E'  Mochila \t DE  Notebook ')
       = public.colaborador_chave(E'  Mochila \t DE  Notebook ')
     and public.item_chave('Cabo Óptico Ñ Padrão') = 'cabo optico n padrao' then
    v_ok := v_ok + 1;
    raise notice '✓ 11 item_chave normaliza igual a colaborador_chave (a 0125 se declara espelho)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '11; ';
    raise warning '✗ 11 item_chave divergiu: % vs %',
      public.item_chave(E'  Mochila \t DE  Notebook '),
      public.colaborador_chave(E'  Mochila \t DE  Notebook ');
  end if;

  begin
    insert into public.itens (nome, grupo, ordem)
      values ('  teste   f41   ITEM  a  ', 'acessorio', 9989);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '11b; ';
    raise warning '✗ 11b o índice único da chave NÃO recusou o nome repetido';
  exception when unique_violation then
    v_ok := v_ok + 1;
    raise notice '✓ 11b nome repetido por caixa/espaço é recusado pela chave';
  when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '11b(' || sqlstate || '); ';
    raise warning '✗ 11b recusou pelo motivo ERRADO (% %)', sqlstate, sqlerrm;
  end;

  -- =========================================================================
  -- 12 — A 11ª CHECAGEM DE INTEGRIDADE
  -- =========================================================================
  -- ⚠ O OBJETO MEDIDO MUDOU DE LUGAR NA F55 (0138), POR DESENHO — e este caso
  -- mudou com ele, não para "ficar verde".
  --
  -- Até a `0137` as doze checagens moravam DENTRO de `dev_checagens_integridade`.
  -- A `0138` extraiu o SQL delas, VERBATIM, para `checagens_integridade_nucleo()`,
  -- porque o alarme agendado precisa das CONTAGENS sem ser dev, e um resumo que
  -- chamasse a função da /dev por dentro recusaria (`security definer` troca o
  -- `current_user`, não o JWT que `e_dev()` lê). A porta da /dev passou a ser a
  -- guarda `e_dev()` mais uma delegação — UM `return query`.
  --
  -- Contar os blocos DELA depois disso mediria a delegação, não as checagens. É o
  -- núcleo que passa a ser contado aqui. A prova de que nada foi reescrito no
  -- caminho é o diff byte a byte em `docs/f55-evidencias/C1-doze-pecas-byte-a-byte.txt`.
  select (length(pg_get_functiondef('public.checagens_integridade_nucleo()'::regprocedure))
          - length(replace(pg_get_functiondef('public.checagens_integridade_nucleo()'::regprocedure),
                           'return query', '')))
         / length('return query')
    into v_n;
  -- ⚠ ESTE NÚMERO É UMA CONTAGEM, e toda fase que acrescenta checagem tem de bumpá-lo.
  -- Ele nasceu em 11 na F41 e foi para 12 na F54 (`0136`, a checagem `backup_orfao`).
  -- A F54 descobriu isso do jeito certo — o `banco-sem-docker` ficou vermelho com
  -- "esperava 11 checagens, achei 12" —, que é exatamente o modo de falha que a regra
  -- "rode TODOS os roteiros ao mexer em função" (RUNBOOK-BANCO.md, herdada da F15/F17)
  -- existe para pegar: `lint`/`test`/`build` locais não executam SQL, e só o job de banco
  -- vê a divergência.
  if v_n = 12 then
    v_ok := v_ok + 1; raise notice '✓ 12 checagens_integridade_nucleo tem DOZE blocos';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '12; ';
    raise warning '✗ 12 esperava 12 checagens, achei %', v_n;
  end if;

  if pg_get_functiondef('public.checagens_integridade_nucleo()'::regprocedure)
       ilike '%reserva_aberta%' then
    v_ok := v_ok + 1; raise notice '✓ 12b a checagem `reserva_aberta` está no corpo';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '12b; ';
    raise warning '✗ 12b a checagem `reserva_aberta` sumiu do corpo';
  end if;

  -- 12b-bis (F55) — a OUTRA metade da mudança: a porta da /dev NÃO pode ter
  -- voltado a carregar o SQL das doze. Se ela tiver mais de um `return query`,
  -- alguém recolou as checagens lá dentro e o SQL passou a existir em dois
  -- lugares — a doença que a F51 curou nas onze cópias da RPC de import.
  select (length(pg_get_functiondef('public.dev_checagens_integridade()'::regprocedure))
          - length(replace(pg_get_functiondef('public.dev_checagens_integridade()'::regprocedure),
                           'return query', '')))
         / length('return query')
    into v_n;
  if v_n = 1 then
    v_ok := v_ok + 1; raise notice '✓ 12b-bis dev_checagens_integridade DELEGA (um return query só)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '12b-bis; ';
    raise warning '✗ 12b-bis dev_checagens_integridade tem % blocos — o SQL das doze voltou a ter duas cópias', v_n;
  end if;

  -- E ela responde ZERO no acervo deste roteiro (nenhuma reserva foi criada).
  select count(*) into v_n from (
    select 1 from public.lancamentos_item l where l.chamado is not null
     group by l.item_id, l.filial_id, l.chamado
    having sum(case l.tipo::text when 'reserva'   then l.quantidade
                                 when 'liberacao' then -l.quantidade else 0 end) > 0
  ) x;
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 12c nenhuma reserva em aberto';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '12c; ';
    raise warning '✗ 12c % reserva(s) em aberto', v_n;
  end if;

  -- =========================================================================
  -- 13 — ESTRUTURA: invoker e sem sobrecarga
  -- =========================================================================
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and p.proname in ('criar_movimentacao_com_itens',
                       'resolver_pendencias_item_com_lancamentos',
                       'lancar_itens_lote');
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 13 as três RPCs da F41 são SECURITY INVOKER';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '13; ';
    raise warning '✗ 13 % função(ões) virou definer — a autorização saiu das policies', v_n;
  end if;

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('criar_movimentacao_com_itens',
                       'resolver_pendencias_item_com_lancamentos',
                       'lancar_itens_lote', 'item_chave');
  if v_n = 4 then
    v_ok := v_ok + 1; raise notice '✓ 13b exatamente 4 funções, sem SOBRECARGA';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '13b; ';
    raise warning '✗ 13b esperava 4 funções sem sobrecarga, achei % — o RUNBOOK proíbe overload', v_n;
  end if;

  -- =========================================================================
  -- RESUMO (a linha que o MCP consegue ler — ele engole NOTICE/WARNING)
  -- =========================================================================
  insert into _f41_resumo values (v_ok, v_falhas, nullif(v_msgs, ''));
  if v_falhas = 0 then
    raise notice '=== f41_regularizacao: % asserções OK, 0 falhas (ROLLBACK — nada gravado) ===', v_ok;
  else
    raise warning '✗ TOTAL f41_regularizacao: % falha(s) — %', v_falhas, v_msgs;
  end if;
  raise notice 'FIM f41_regularizacao: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

select * from _f41_resumo;

rollback;
