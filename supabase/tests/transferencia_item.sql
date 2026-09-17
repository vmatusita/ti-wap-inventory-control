-- =============================================================
-- Roteiro de teste: TRANSFERÊNCIA DE ITEM ENTRE FILIAIS (F31 · ITN-01, migration 0104).
--
-- Roda no job `banco` do CI (psql, ON_ERROR_STOP=1) e é auto-verificável no SQL
-- editor / MCP dos dois projetos. Mesmo padrão dos demais roteiros da pasta:
--   NOTICE  '✓ ...'  quando a invariante bate
--   WARNING '✗ ...'  quando NÃO bate (o job `banco` falha em qualquer `WARNING: ✗`)
--
-- ESCREVE (cria usuários, perfis, vínculos, itens e lançamentos fictícios), então roda
-- inteiro dentro de `begin; … rollback;` — nada sobra no banco. É AUTOSSUFICIENTE:
-- cria tudo de que precisa, para funcionar também num Postgres novo do CI.
--
-- DADOS 100% FICTÍCIOS (regra 2 do CLAUDE.md): itens "TESTE F31 …", e-mails
-- `f31.*@wap.ind.br` de fantasia. Nenhum dado real da WAP.
--
-- COMO ELE SIMULA UM USUÁRIO. `postgres` (o papel com que o psql e o MCP conectam) é
-- superusuário e ignora RLS; e, sem claims, `auth.uid()` é NULL, `papel_atual()` é NULL
-- e a guarda de vínculo da própria RPC recusaria tudo. Então os cenários fazem
-- `set_config('request.jwt.claims', …)` — que é o que o PostgREST monta a cada request —
-- e o cenário 8, que mede RLS de verdade, faz também `set local role authenticated`.
--
-- O QUE ELE PROVA
--   0  âncora: a leitura de saldo está enxergando as entradas (senão o caso 2 compara zeros)
--   1  o par de ajustes é gravado: −N na origem, +N no destino, com as observações cruzadas
--   2  **o Total consolidado NÃO muda** (a razão de existir do recurso) e o estoque de cada
--      lado mexe na medida certa
--   3  o anti-deadlock: as travas advisory dos DOIS lados estão nas mãos, e a ordenação
--      determinística está no corpo da função ANTES do primeiro insert
--   4  saldo insuficiente na origem recusa TUDO — nem a perna de destino sobra (atomicidade)
--   5  origem = destino recusa
--   6  o mesmo item duas vezes recusa
--   7  grants: authenticated sim; anon e service_role não
--   8  RLS dos DOIS LADOS: operador vinculado só à origem é recusado, e nada parcial sobra
--
-- ⚠ O QUE ELE **NÃO** PROVA. O caso 3 é estrutural + de conjunto de travas, não uma
-- reprodução de deadlock: deadlock exige DUAS sessões concorrentes, e um roteiro `psql`
-- de sessão única não as tem. O que o 3 garante é que o passo anti-deadlock continua no
-- corpo e continua vindo antes dos inserts — quem o remover verá este roteiro falhar.
-- =============================================================
--
-- F60 (16/09/2026) — O SALDO PELA ASSINATURA NOVA (migrations 0143/0145). As oito leituras de
-- saldo passaram de `rel_saldo_itens`, dropada na 0145, para `rel_saldo_itens_filiais`:
--   · o Total CONSOLIDADO (0, 2a, 2c) — o nulo de antes virou a lista de TODAS as filiais,
--     inclusive as desativadas, lida na hora da chamada,
--     `(select array_agg(f.id order by f.id) from public.filiais f)` — o conjunto exato que o
--     nulo cobria;
--   · o estoque de cada lado (2b) — `array[v_f1]` e `array[v_f2]`.
-- Todas com `where filial_id is null`: a função nova devolve DOIS níveis numa chamada (uma linha
-- por filial do recorte e o TOTAL do recorte, com `filial_id` nulo), e o total é o número que a
-- chamada velha devolvia. No consolidado isso não é detalhe: sem o filtro, o `select … into` do
-- caso 2a poderia ler a linha de UMA filial no lugar do Total e comparar a coisa errada. Nenhum
-- rótulo mudou.

begin;

create temp table _transf_resumo (ok int, falhas int, detalhe text);

-- Privilégios de TABELA para o cenário 8 (o único que faz `set local role authenticated`).
-- Mesma razão documentada em `papeis_rls.sql`: num projeto Supabase hospedado estes grants
-- já existem por default privilege e o bloco é no-op; no Postgres NOVO do CI, não existem, e
-- sem eles o cenário 8 pararia em "permission denied" — que é uma resposta certa para a
-- pergunta errada (aqui se mede POLICY, não privilégio). Só a tabela/verbo que alguma
-- asserção realmente usa, e o comentário diz qual.
grant select on
  public.filiais,           -- resolução de filial
  public.itens,             -- fixtures
  public.lancamentos_item   -- 8b (nada parcial sobrou) e o trigger, que lê o saldo
  to authenticated;
grant insert on public.lancamentos_item to authenticated;  -- as duas pernas da RPC (INVOKER)

do $$
declare
  -- identidades fictícias (uuid fixo, hex válido — o prefixo f31a marca a fase)
  k_admin     uuid := '00000000-f31a-4000-8000-0000000000a1';
  k_operador  uuid := '00000000-f31a-4000-8000-0000000000b2';
  v_f1        smallint;   -- origem
  v_f2        smallint;   -- destino
  v_itemA     smallint;
  v_itemB     smallint;
  v_ok        int  := 0;
  v_falhas    int  := 0;
  v_msgs      text := '';
  v_n         int;
  v_qtd       int;
  v_obs       text;
  v_total_a0  bigint; v_total_b0 bigint;
  v_total_a1  bigint; v_total_b1 bigint;
  v_est_o     bigint; v_est_d    bigint;
  v_ret       int;
  v_travas    int;
  v_def       text;
  v_pos_lock  int;
  v_pos_ins   int;
begin
  -- =========================================================================
  -- FIXTURES (como postgres, sem claims — antes de qualquer troca de identidade)
  -- =========================================================================
  select id into v_f1 from public.filiais where ativo order by id limit 1;
  select id into v_f2 from public.filiais where ativo and id <> v_f1 order by id limit 1;
  if v_f1 is null or v_f2 is null then
    raise warning '✗ 0 o banco precisa de ao menos DUAS filiais ativas para este roteiro';
    insert into _transf_resumo values (0, 1, 'sem duas filiais ativas');
    return;
  end if;

  -- O trigger handle_new_user cria o profile (e exige domínio corporativo — 0041/0057).
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (k_admin,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f31.chefia@wap.ind.br',   '', now(), now(), now()),
    (k_operador, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f31.operador@wap.ind.br', '', now(), now(), now());
  update public.profiles set papel = 'admin'    where id = k_admin;
  update public.profiles set papel = 'operador' where id = k_operador;
  -- O operador é vinculado SÓ à ORIGEM — é o cenário 8.
  insert into public.operador_filiais (usuario_id, filial_id) values (k_operador, v_f1);

  -- Itens PRÓPRIOS do roteiro (nunca um item real do catálogo): assim as contagens
  -- de Total/Estoque abaixo são exatamente as que este arquivo criou.
  insert into public.itens (nome, grupo, ordem)
    values ('TESTE F31 Item A', 'acessorio', 990) returning id into v_itemA;
  insert into public.itens (nome, grupo, ordem)
    values ('TESTE F31 Item B', 'componente', 991) returning id into v_itemB;

  -- Estoque de partida na ORIGEM: 30 do A e 12 do B. Destino começa zerado.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
  values (v_itemA, v_f1, 'entrada', 30, current_date, k_admin),
         (v_itemB, v_f1, 'entrada', 12, current_date, k_admin);

  -- Daqui em diante, agindo como o ADMIN fictício (escreve em qualquer filial).
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);

  -- Total consolidado ANTES (a âncora do caso 2).
  --
  -- ⚠ `p_ate` NÃO PODE SER NULL. `rel_saldo_itens` filtra `where l.data <= p_ate`, e
  -- `data <= null` é NULL: com `p_ate => null` a RPC devolve TODOS os itens zerados (o
  -- `left join` ainda traz a linha do catálogo). A primeira escrita deste roteiro passava
  -- null, e o efeito foi um FALSO VERDE — a asserção 2a comparava `0 = 0` e dizia que o
  -- Total estava preservado sem que nada tivesse sido medido. Quem o pegou foram o 2b e o
  -- 2c, que esperam números concretos. Daí a âncora logo abaixo: ela existe para que este
  -- roteiro nunca mais consiga passar comparando dois zeros.
  select total into v_total_a0 from public.rel_saldo_itens_filiais((select array_agg(f.id order by f.id) from public.filiais f), current_date) where filial_id is null and item_id = v_itemA;
  select total into v_total_b0 from public.rel_saldo_itens_filiais((select array_agg(f.id order by f.id) from public.filiais f), current_date) where filial_id is null and item_id = v_itemB;

  if coalesce(v_total_a0, 0) = 30 and coalesce(v_total_b0, 0) = 12 then
    v_ok := v_ok + 1;
    raise notice '✓ 0 âncora: a leitura de saldo enxerga as entradas (A=30, B=12)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '0; ';
    raise warning '✗ 0 âncora: esperava A=30 e B=12, veio %/% — a comparação do caso 2 seria vazia',
      coalesce(v_total_a0::text,'(null)'), coalesce(v_total_b0::text,'(null)');
  end if;

  -- =========================================================================
  -- 1 — TRANSFERE: 2 itens, origem → destino, numa submissão só
  -- =========================================================================
  select public.transferir_item(
    v_f1, v_f2,
    jsonb_build_array(
      jsonb_build_object('item_id', v_itemA, 'quantidade', 10),
      jsonb_build_object('item_id', v_itemB, 'quantidade', 4)
    ),
    current_date, null,
    'Transferência para Destino — roteiro F31',
    'Transferência de Origem — roteiro F31',
    k_admin
  ) into v_ret;

  if v_ret = 2 then
    v_ok := v_ok + 1; raise notice '✓ 1a a RPC devolveu 2 (itens transferidos)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1a; ';
    raise warning '✗ 1a esperava retorno 2, veio %', v_ret;
  end if;

  select count(*) into v_n from public.lancamentos_item
   where tipo = 'ajuste' and item_id in (v_itemA, v_itemB) and filial_id in (v_f1, v_f2);
  if v_n = 4 then
    v_ok := v_ok + 1; raise notice '✓ 1b 2 itens viraram 4 linhas (um par por item)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1b; ';
    raise warning '✗ 1b esperava 4 ajustes, obtido %', v_n;
  end if;

  select quantidade, observacao into v_qtd, v_obs from public.lancamentos_item
   where tipo = 'ajuste' and item_id = v_itemA and filial_id = v_f1;
  if v_qtd = -10 and v_obs like 'Transferência para %' then
    v_ok := v_ok + 1; raise notice '✓ 1c a perna da ORIGEM é −10 e diz "para onde foi"';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1c; ';
    raise warning '✗ 1c origem: esperava −10 e "Transferência para …", veio % / %', v_qtd, coalesce(v_obs,'(null)');
  end if;

  select quantidade, observacao into v_qtd, v_obs from public.lancamentos_item
   where tipo = 'ajuste' and item_id = v_itemA and filial_id = v_f2;
  if v_qtd = 10 and v_obs like 'Transferência de %' then
    v_ok := v_ok + 1; raise notice '✓ 1d a perna do DESTINO é +10 e diz "de onde veio"';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1d; ';
    raise warning '✗ 1d destino: esperava +10 e "Transferência de …", veio % / %', v_qtd, coalesce(v_obs,'(null)');
  end if;

  -- =========================================================================
  -- 2 — A RAZÃO DE EXISTIR DO RECURSO: o Total consolidado NÃO muda
  -- =========================================================================
  select total into v_total_a1 from public.rel_saldo_itens_filiais((select array_agg(f.id order by f.id) from public.filiais f), current_date) where filial_id is null and item_id = v_itemA;
  select total into v_total_b1 from public.rel_saldo_itens_filiais((select array_agg(f.id order by f.id) from public.filiais f), current_date) where filial_id is null and item_id = v_itemB;

  if v_total_a1 = v_total_a0 and v_total_b1 = v_total_b0 then
    v_ok := v_ok + 1;
    raise notice '✓ 2a Total consolidado INALTERADO — A: %→%, B: %→%',
      v_total_a0, v_total_a1, v_total_b0, v_total_b1;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2a; ';
    raise warning '✗ 2a o Total consolidado MUDOU — A: %→%, B: %→% (o par de ajustes deveria somar zero)',
      v_total_a0, v_total_a1, v_total_b0, v_total_b1;
  end if;

  select estoque into v_est_o from public.rel_saldo_itens_filiais(array[v_f1], current_date) where filial_id is null and item_id = v_itemA;
  select estoque into v_est_d from public.rel_saldo_itens_filiais(array[v_f2], current_date) where filial_id is null and item_id = v_itemA;
  if v_est_o = 20 and v_est_d = 10 then
    v_ok := v_ok + 1; raise notice '✓ 2b o estoque mexeu dos dois lados: origem 30→20, destino 0→10';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2b; ';
    raise warning '✗ 2b esperava origem 20 e destino 10, veio % e %', v_est_o, v_est_d;
  end if;

  -- ⚠ O CONTRASTE que justifica o recurso: o caminho "intuitivo" (Liberação na origem +
  -- Entrada no destino) infla o Total. Provado aqui num item PRÓPRIO, para não sujar o A/B.
  declare
    v_itemC    smallint;
    v_total_c0 bigint;
    v_total_c1 bigint;
  begin
    insert into public.itens (nome, grupo, ordem)
      values ('TESTE F31 Item C', 'acessorio', 992) returning id into v_itemC;
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
      values (v_itemC, v_f1, 'entrada', 30, current_date, k_admin);
    select total into v_total_c0 from public.rel_saldo_itens_filiais((select array_agg(f.id order by f.id) from public.filiais f), current_date) where filial_id is null and item_id = v_itemC;
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
      values (v_itemC, v_f1, 'saida',   10, current_date, k_admin),
             (v_itemC, v_f2, 'entrada', 10, current_date, k_admin);
    select total into v_total_c1 from public.rel_saldo_itens_filiais((select array_agg(f.id order by f.id) from public.filiais f), current_date) where filial_id is null and item_id = v_itemC;
    if v_total_c1 = v_total_c0 + 10 then
      v_ok := v_ok + 1;
      raise notice '✓ 2c o caminho "intuitivo" INFLA o Total (%→%) — é isto que a transferência evita',
        v_total_c0, v_total_c1;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '2c; ';
      raise warning '✗ 2c esperava o Total inflar de % para %, veio % — a premissa do recurso mudou, releia dominio.ts',
        v_total_c0, v_total_c0 + 10, v_total_c1;
    end if;
  end;

  -- =========================================================================
  -- 3 — ANTI-DEADLOCK (ver o aviso do cabeçalho: estrutural, não reprodução)
  -- =========================================================================
  -- 3a. As travas dos DOIS lados estão nas mãos desta transação. `pg_advisory_xact_lock(a,b)`
  --     grava classid = a (item) e objid = b (filial).
  select count(distinct (classid, objid)) into v_travas
    from pg_locks
   where locktype = 'advisory' and pid = pg_backend_pid()
     and classid in (v_itemA::int, v_itemB::int)
     and objid   in (v_f1::int, v_f2::int);
  if v_travas = 4 then
    v_ok := v_ok + 1; raise notice '✓ 3a as 4 travas (2 itens × 2 filiais) estão nas mãos da transação';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3a; ';
    raise warning '✗ 3a esperava 4 travas advisory, obtido %', v_travas;
  end if;

  -- 3b. A ordenação determinística CONTINUA no corpo, e continua ANTES do primeiro insert.
  --     Esta é a asserção que quebra na cara de quem remover o passo 5 da migration 0104.
  v_def := pg_get_functiondef(
    'public.transferir_item(smallint,smallint,jsonb,date,text,text,text,uuid)'::regprocedure);
  v_pos_lock := position('order by x.item_id, x.filial' in v_def);
  v_pos_ins  := position('insert into public.lancamentos_item' in v_def);
  if v_pos_lock > 0 and v_pos_ins > 0 and v_pos_lock < v_pos_ins then
    v_ok := v_ok + 1;
    raise notice '✓ 3b as travas são pedidas em ordem (item_id, filial_id) ANTES do primeiro insert';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3b; ';
    raise warning '✗ 3b o passo anti-deadlock sumiu ou foi para depois dos inserts (lock em %, insert em %) — NÃO "conserte o teste": duas transferências de sentidos opostos voltam a deadlockar',
      v_pos_lock, v_pos_ins;
  end if;

  -- =========================================================================
  -- 4 — SALDO INSUFICIENTE: recusa TUDO (nem a perna de destino sobra)
  -- =========================================================================
  declare
    v_antes int;
    v_depois int;
  begin
    select count(*) into v_antes from public.lancamentos_item where item_id = v_itemA;
    begin
      perform public.transferir_item(
        v_f1, v_f2,
        jsonb_build_array(jsonb_build_object('item_id', v_itemA, 'quantidade', 9999)),
        current_date, null, 'Transferência para X — roteiro F31', 'Transferência de Y — roteiro F31', k_admin);
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '4a; ';
      raise warning '✗ 4a transferência ACIMA do saldo passou — o trigger deveria ter recusado';
    exception when others then
      v_ok := v_ok + 1; raise notice '✓ 4a saldo insuficiente na origem recusa (%)', sqlerrm;
    end;
    select count(*) into v_depois from public.lancamentos_item where item_id = v_itemA;
    if v_depois = v_antes then
      v_ok := v_ok + 1; raise notice '✓ 4b nada parcial sobrou (% linhas antes e depois)', v_antes;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '4b; ';
      raise warning '✗ 4b sobrou linha órfã: % antes, % depois', v_antes, v_depois;
    end if;
  end;

  -- =========================================================================
  -- 5 — ORIGEM = DESTINO recusa
  -- =========================================================================
  begin
    perform public.transferir_item(
      v_f1, v_f1,
      jsonb_build_array(jsonb_build_object('item_id', v_itemA, 'quantidade', 1)),
      current_date, null, 'Transferência para X — roteiro F31', 'Transferência de Y — roteiro F31', k_admin);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5; ';
    raise warning '✗ 5 origem = destino passou';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 5 origem = destino recusa (%)', sqlerrm;
  end;

  -- =========================================================================
  -- 6 — MESMO ITEM DUAS VEZES recusa
  -- =========================================================================
  begin
    perform public.transferir_item(
      v_f1, v_f2,
      jsonb_build_array(
        jsonb_build_object('item_id', v_itemA, 'quantidade', 1),
        jsonb_build_object('item_id', v_itemA, 'quantidade', 2)),
      current_date, null, 'Transferência para X — roteiro F31', 'Transferência de Y — roteiro F31', k_admin);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6; ';
    raise warning '✗ 6 item repetido passou — dois pares sobre o mesmo saldo';
  exception when others then
    v_ok := v_ok + 1; raise notice '✓ 6 item repetido recusa (%)', sqlerrm;
  end;

  -- =========================================================================
  -- 7 — GRANTS
  -- =========================================================================
  if     has_function_privilege('authenticated', 'public.transferir_item(smallint,smallint,jsonb,date,text,text,text,uuid)', 'execute')
     and not has_function_privilege('anon',         'public.transferir_item(smallint,smallint,jsonb,date,text,text,text,uuid)', 'execute')
     and not has_function_privilege('service_role', 'public.transferir_item(smallint,smallint,jsonb,date,text,text,text,uuid)', 'execute')
  then
    v_ok := v_ok + 1; raise notice '✓ 7 grants: authenticated sim, anon e service_role não';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '7; ';
    raise warning '✗ 7 grants errados na transferir_item';
  end if;

  -- =========================================================================
  -- 8 — PERMISSÃO DOS DOIS LADOS: vinculado só à ORIGEM é RECUSADO
  -- =========================================================================
  -- É a asserção mais importante do arquivo. A RPC é SECURITY INVOKER justamente para que a
  -- policy "operador lanca" gateie as duas pernas; se alguém a transformar em `security
  -- definer` "para simplificar", o operador passa a mover estoque para uma filial que não
  -- é dele — e é aqui que isso aparece.
  declare
    v_antes int;
    v_depois int;
  begin
    select count(*) into v_antes from public.lancamentos_item where item_id = v_itemB;
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);
    begin
      perform public.transferir_item(
        v_f1, v_f2,
        jsonb_build_array(jsonb_build_object('item_id', v_itemB, 'quantidade', 1)),
        current_date, null, 'Transferência para X — roteiro F31', 'Transferência de Y — roteiro F31', k_operador);
      reset role;
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '8a; ';
      raise warning '✗ 8a operador SEM vínculo no destino conseguiu transferir PARA lá';
    exception when others then
      reset role;
      v_ok := v_ok + 1; raise notice '✓ 8a operador vinculado só à origem é recusado no destino (%)', sqlerrm;
    end;
    select count(*) into v_depois from public.lancamentos_item where item_id = v_itemB;
    if v_depois = v_antes then
      v_ok := v_ok + 1; raise notice '✓ 8b a recusa não deixou perna solta (% linhas antes e depois)', v_antes;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '8b; ';
      raise warning '✗ 8b sobrou linha da tentativa recusada: % antes, % depois', v_antes, v_depois;
    end if;

    -- 8c. O OUTRO LADO do par: com vínculo nas DUAS, o mesmo operador passa. Sem esta
    --     asserção, uma guarda que recusasse TODO MUNDO passaria no 8a e ninguém notaria.
    insert into public.operador_filiais (usuario_id, filial_id) values (k_operador, v_f2);
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);
    begin
      perform public.transferir_item(
        v_f1, v_f2,
        jsonb_build_array(jsonb_build_object('item_id', v_itemB, 'quantidade', 1)),
        current_date, null, 'Transferência para X — roteiro F31', 'Transferência de Y — roteiro F31', k_operador);
      reset role;
      v_ok := v_ok + 1; raise notice '✓ 8c com vínculo nas DUAS filiais, o mesmo operador transfere';
    exception when others then
      reset role;
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '8c; ';
      raise warning '✗ 8c operador vinculado às duas filiais foi recusado (%) — a guarda fechou demais', sqlerrm;
    end;
  end;

  -- =========================================================================
  -- RESUMO (a linha que o MCP consegue ler — ele engole NOTICE/WARNING)
  -- =========================================================================
  insert into _transf_resumo values (v_ok, v_falhas, nullif(v_msgs, ''));
  if v_falhas = 0 then
    raise notice '=== transferencia_item: % asserções OK, 0 falhas (ROLLBACK — nada gravado) ===', v_ok;
  else
    raise warning '✗ TOTAL transferencia_item: % falha(s) — %', v_falhas, v_msgs;
  end if;
  raise notice 'FIM transferencia_item: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

select * from _transf_resumo;

rollback;
