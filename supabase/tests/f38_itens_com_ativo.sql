-- =============================================================
-- Roteiro de teste: OS ITENS ANDAM COM O ATIVO (F38 · migrations 0116–0122).
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
-- DADOS 100% FICTÍCIOS (regra 2 do CLAUDE.md): patrimônios `ZZF38…`, itens
-- "TESTE F38 …", e-mails `f38.*@wap.ind.br`. Nenhum dado real da WAP.
--
-- ⚠ REGRA DA PENDÊNCIA Nº 5 DA F37, que este roteiro obedece em toda parte: duas
-- movimentações do MESMO ativo na mesma transação precisam de `created_at`
-- EXPLÍCITO E DISTINTO. Sem isso o desempate de "qual é a última" cai num sorteio
-- de uuid e o roteiro fica intermitente — foi o flake do §5.6 da F37.
--
-- O QUE ELE PROVA
--   0   âncora: as leituras enxergam as entradas (senão os casos abaixo comparam zeros)
--   1   o VÍNCULO: lançamento nascido pela RPC aponta a movimentação certa (D13);
--       o avulso continua com `movimentacao_id` nulo
--   2   TUDO-OU-NADA: um lote com uma linha inválida grava ZERO movimentações e
--       ZERO lançamentos — contagens antes e depois
--   3   as travas, em ordem determinística e ANTES do primeiro INSERT (estrutural +
--       conjunto de travas em `pg_locks`), mesmo com o carrinho em ordem contrária
--   4   a IDENTIDADE do critério 5: Σ com_a_pessoa + sem vínculo = liberados
--   5   a guarda nova: `retorno` com pessoa acima do saldo dela é recusado…
--   6   …e `retorno` SEM pessoa continua passando exatamente como sempre passou
--       (é o caminho de todo o histórico — a regra §C.3 depende disso)
--   7   `recuperado`: estoque +1, pessoa −1, Total inalterado
--   8   `baixa`: pessoa −1, Total −1, estoque de volta ao que era
--   9   reabrir grava os inversos; reabrir com a lista incompleta RECUSA
--   10  o caminho "Faltante" é byte a byte: mesmos slugs, pendência pelo trigger
--   11  grants das quatro RPCs novas: authenticated sim; anon e service_role não
--   12  idempotência: resolver duas vezes não re-resolve NEM duplica lançamento
--   13  o ESTORNO desfaz o conjunto: sem os inversos RECUSA; com eles, o item volta
--   14  nenhuma das 10 funções intocadas carrega marca da F38 no corpo (e a
--       contraprova: a ÚNICA recriada, valida_lancamento_item, carrega), e nenhum
--       valor novo entrou em tipo_lancamento
--   15  reabrir uma BAIXA funciona com os DOIS inversos na ordem PIOR — a
--       correção da 0122, que o cenário 9 (só recuperado) não alcançava
--
-- ⚠ O QUE ELE **NÃO** PROVA. O caso 3 é estrutural + de conjunto de travas, não uma
-- reprodução de deadlock: deadlock exige DUAS sessões concorrentes, e um roteiro de
-- sessão única não as tem. O que o 3 garante é que o passo anti-deadlock continua no
-- corpo, continua vindo antes dos inserts, e que as travas de fato foram tomadas.
--
-- ⚠ E o caso 14 NÃO compara md5. A primeira escrita dele fixava os hashes lidos de
-- produção: passou no ensaio e FALHOU no job `banco`, que monta um Postgres novo —
-- `pg_get_functiondef` reconstrói o texto, e formatação/versão do servidor mudam o
-- hash sem que uma linha de corpo mude. md5 absoluto prova "é o mesmo BANCO", não
-- "é a mesma FUNÇÃO". O md5 continua sendo a prova certa onde é comparável (produção
-- antes × depois, mesmo servidor): está em docs/RELATORIO-F38.md §5. A prova sobre o
-- DIFF vive em src/lib/itens/migrations-f38.test.ts, que roda sem banco nenhum.
-- =============================================================
--
-- F60 (16/09/2026) — O SALDO PELA ASSINATURA NOVA (migrations 0143/0145). As nove leituras
-- de saldo deste roteiro passaram de `rel_saldo_itens(<filial>, <data>)`, dropada na 0145,
-- para `rel_saldo_itens_filiais(array[<filial>], <data>) where filial_id is null`. A função
-- nova devolve DOIS níveis numa chamada — uma linha por (filial do recorte, item) e o nível do
-- TOTAL do recorte, com `filial_id` nulo — e o filtro de nível é o que mantém cada asserção
-- provando a MESMA coisa: o total do recorte é, por construção, o número que a chamada velha
-- devolvia para aquele recorte (para uma filial só, ele é igual à linha dela, e
-- `f60_recorte.sql` 4a/4b prova isso item a item). Sem o filtro, `select … into` passaria a
-- escolher entre linhas de níveis diferentes sem avisar, e `count(*)` contaria cada item uma
-- vez por nível. Nenhum rótulo mudou.
--
-- E o cenário 14 (as funções que a F38 prometeu não tocar) ganhou as três SUCESSORAS
-- (`rel_saldo_itens_filiais`, `rel_mov_itens_filiais`, `rel_estoque_asof_filiais`) ao lado dos
-- nomes velhos: depois da 0145 os três velhos não existem mais no catálogo, e sem as sucessoras a
-- varredura passaria sobre SETE funções dizendo "dez" — o cenário afrouxaria calado. É o mesmo
-- movimento de `INTOCAVEIS` em `src/lib/itens/migrations-f38.test.ts`.

begin;

create temp table _f38_resumo (ok int, falhas int, detalhe text);

-- Privilégios de TABELA para os cenários que fazem `set local role authenticated`.
-- Mesma razão documentada em `papeis_rls.sql` e repetida em `transferencia_item.sql`:
-- num projeto Supabase hospedado estes grants já existem por default privilege e o
-- bloco é no-op; no Postgres NOVO do CI, não existem, e sem eles o cenário pararia em
-- "permission denied" — resposta certa para a pergunta errada (aqui se mede POLICY,
-- não privilégio de tabela). Só a tabela/verbo que alguma asserção usa.
grant select on
  public.filiais,           -- resolução de filial
  public.itens,             -- fixtures e o join de rel_saldo_colaborador
  public.ativos,            -- a RPC 0117 lê e trava o ativo
  public.movimentacoes,     -- 2 (nada parcial sobrou)
  public.lancamentos_item,  -- 2, 4 e o trigger, que lê o saldo
  public.pendencias_item,   -- 7, 8, 9
  public.tipos_item         -- a ponte tipo→item do cenário 10
  to authenticated;
grant insert on public.movimentacoes, public.lancamentos_item to authenticated;
grant update on public.pendencias_item to authenticated;  -- 7, 8, 9 (resolver/reabrir)

do $$
declare
  -- identidades fictícias (uuid fixo, hex válido — o prefixo f38a marca a fase)
  k_admin    uuid := '00000000-f38a-4000-8000-0000000000a1';
  k_operador uuid := '00000000-f38a-4000-8000-0000000000b2';
  v_f1       smallint;
  v_f2       smallint;
  v_itemA    smallint;
  v_itemB    smallint;
  v_colab    uuid;
  v_colab2   uuid;
  v_ativo1   uuid;
  v_ativo2   uuid;
  v_ativo3   uuid;
  v_ativo4   uuid;
  v_mov      uuid;
  v_mov_dev  uuid;
  v_pend     uuid;
  v_lanc     uuid;
  v_ok       int  := 0;
  v_falhas   int  := 0;
  v_msgs     text := '';
  v_n        int;
  v_n_mov0   int; v_n_lanc0 int;
  v_n_mov1   int; v_n_lanc1 int;
  v_ret      jsonb;
  v_total0   bigint; v_total1 bigint;
  v_est0     bigint; v_est1   bigint;
  v_pessoa   bigint;
  v_soma     bigint;
  v_lib      bigint;
  v_def      text;
  v_pos_lock int;
  v_pos_ins  int;
  v_travas   int;
  v_tipo_id  smallint;
  v_item_f41 smallint;   -- F41: o item sem histórico dos cenários 16 e 17
begin
  -- =========================================================================
  -- FIXTURES
  -- =========================================================================
  select id into v_f1 from public.filiais where ativo order by id limit 1;
  select id into v_f2 from public.filiais where ativo and id <> v_f1 order by id limit 1;
  if v_f1 is null or v_f2 is null then
    raise warning '✗ 0 o banco precisa de ao menos DUAS filiais ativas para este roteiro';
    insert into _f38_resumo values (0, 1, 'sem duas filiais ativas');
    return;
  end if;

  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (k_admin,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f38.chefia@wap.ind.br',   '', now(), now(), now()),
    (k_operador, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'f38.operador@wap.ind.br', '', now(), now(), now());
  perform pg_temp.plantar_cargo(k_admin, 'admin');       -- F62: o cargo é plantado em membros
  perform pg_temp.plantar_cargo(k_operador, 'operador');
  insert into public.operador_filiais (usuario_id, filial_id) values (k_operador, v_f1);

  insert into public.tipos_item (slug, rotulo, ordem)
    values ('zzf38tipo', 'TESTE F38 Tipo', 9990) returning id into v_tipo_id;

  insert into public.itens (nome, grupo, ordem, tipo_id)
    values ('TESTE F38 Item A', 'acessorio', 9990, v_tipo_id) returning id into v_itemA;
  insert into public.itens (nome, grupo, ordem)
    values ('TESTE F38 Item B', 'acessorio', 9991) returning id into v_itemB;

  insert into public.colaboradores (nome, filial_id, criado_por)
    values ('Fulano ZZF38 Um', v_f1, k_admin) returning id into v_colab;
  insert into public.colaboradores (nome, filial_id, criado_por)
    values ('Fulano ZZF38 Dois', v_f1, k_admin) returning id into v_colab2;

  -- Estoque de partida: 30 do A e 12 do B na filial 1.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
  values (v_itemA, v_f1, 'entrada', 30, current_date, k_admin),
         (v_itemB, v_f1, 'entrada', 12, current_date, k_admin);

  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF38A001', 'notebook', v_f1) returning id into v_ativo1;
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF38A002', 'monitor', v_f1) returning id into v_ativo2;
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF38A003', 'notebook', v_f1) returning id into v_ativo3;
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF38A004', 'notebook', v_f1) returning id into v_ativo4;

  perform set_config('request.jwt.claims',
    json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);

  select total, estoque into v_total0, v_est0
    from public.rel_saldo_itens_filiais(array[v_f1], current_date) where filial_id is null and item_id = v_itemA;

  if coalesce(v_total0, 0) = 30 and coalesce(v_est0, 0) = 30 then
    v_ok := v_ok + 1;
    raise notice '✓ 0 âncora: a leitura de saldo enxerga as entradas (Total=30, Estoque=30)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '0; ';
    raise warning '✗ 0 âncora: esperava Total=30/Estoque=30, veio %/% — as comparações abaixo seriam vazias',
      coalesce(v_total0::text,'(null)'), coalesce(v_est0::text,'(null)');
  end if;

  -- =========================================================================
  -- 1 — O VÍNCULO (D13): dois equipamentos, dois periféricos, cada um no seu
  -- =========================================================================
  select public.criar_movimentacao_com_itens(
    jsonb_build_array(
      jsonb_build_object('ativo_id', v_ativo1, 'tipo', 'saida', 'motivo', 'novo_colaborador',
                         'data', current_date::text, 'colaborador', 'Fulano ZZF38 Um',
                         'colaborador_id', v_colab::text),
      jsonb_build_object('ativo_id', v_ativo2, 'tipo', 'saida', 'motivo', 'novo_colaborador',
                         'data', current_date::text, 'colaborador', 'Fulano ZZF38 Dois',
                         'colaborador_id', v_colab2::text)
    ),
    jsonb_build_array(
      jsonb_build_object('indice_movimentacao', 0, 'item_id', v_itemA, 'tipo', 'saida',
                         'quantidade', 2, 'data', current_date::text,
                         'colaborador', 'Fulano ZZF38 Um', 'colaborador_id', v_colab::text),
      jsonb_build_object('indice_movimentacao', 1, 'item_id', v_itemB, 'tipo', 'saida',
                         'quantidade', 1, 'data', current_date::text,
                         'colaborador', 'Fulano ZZF38 Dois', 'colaborador_id', v_colab2::text)
    ),
    k_admin
  ) into v_ret;

  if (v_ret ->> 'itens')::int = 2 and jsonb_array_length(v_ret -> 'movimentacoes') = 2 then
    v_ok := v_ok + 1; raise notice '✓ 1a a RPC gravou 2 movimentações e 2 lançamentos';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1a; ';
    raise warning '✗ 1a retorno inesperado da RPC: %', v_ret;
  end if;

  -- O fone aponta a movimentação do notebook; o cabo, a do monitor (D13).
  select count(*) into v_n
    from public.lancamentos_item l
    join public.movimentacoes m on m.id = l.movimentacao_id
   where (l.item_id = v_itemA and m.ativo_id = v_ativo1)
      or (l.item_id = v_itemB and m.ativo_id = v_ativo2);
  if v_n = 2 then
    v_ok := v_ok + 1; raise notice '✓ 1b cada item aponta a movimentação do SEU equipamento (D13)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1b; ';
    raise warning '✗ 1b esperava 2 vínculos cruzados corretos, obtido %', v_n;
  end if;

  -- "O que foi junto com este notebook" é um JOIN — e ativo_id NÃO existe aqui.
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='lancamentos_item' and column_name='ativo_id'
  ) then
    v_ok := v_ok + 1; raise notice '✓ 1c lancamentos_item NÃO tem ativo_id (a verdade mora num lugar só)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1c; ';
    raise warning '✗ 1c lancamentos_item ganhou uma coluna ativo_id — segunda cópia da mesma verdade';
  end if;

  -- O lançamento AVULSO (carrinho da tela de itens) continua com o vínculo nulo.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_itemB, v_f1, 'entrada', 5, current_date, k_admin) returning id into v_lanc;
  if (select movimentacao_id from public.lancamentos_item where id = v_lanc) is null then
    v_ok := v_ok + 1; raise notice '✓ 1d o lançamento avulso continua nascendo sem vínculo — e assim fica';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1d; ';
    raise warning '✗ 1d o lançamento avulso nasceu com movimentacao_id';
  end if;

  -- FK imediata, não deferrable (a 0050 precisou adiar; aqui não).
  select count(*) into v_n from pg_constraint
   where conrelid = 'public.lancamentos_item'::regclass and contype = 'f'
     and conname like '%movimentacao%' and condeferrable;
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 1e a FK de movimentacao_id é IMEDIATA (a RPC insere a movimentação antes)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '1e; ';
    raise warning '✗ 1e a FK de movimentacao_id ficou deferrable';
  end if;

  -- =========================================================================
  -- 2 — TUDO-OU-NADA: uma linha inválida derruba o lote inteiro
  -- =========================================================================
  select count(*) into v_n_mov0  from public.movimentacoes;
  select count(*) into v_n_lanc0 from public.lancamentos_item;

  begin
    perform public.criar_movimentacao_com_itens(
      jsonb_build_array(
        -- válida: ativo3 está em estoque, aceita saída
        jsonb_build_object('ativo_id', v_ativo3, 'tipo', 'saida', 'motivo', 'novo_colaborador',
                           'data', current_date::text, 'colaborador', 'Fulano ZZF38 Um',
                           'colaborador_id', v_colab::text),
        -- INVÁLIDA: ativo1 já saiu no caso 1 — 'saida' sobre 'em_uso' não é transição
        jsonb_build_object('ativo_id', v_ativo1, 'tipo', 'saida', 'motivo', 'novo_colaborador',
                           'data', current_date::text, 'colaborador', 'Fulano ZZF38 Um',
                           'colaborador_id', v_colab::text)
      ),
      jsonb_build_array(
        jsonb_build_object('indice_movimentacao', 0, 'item_id', v_itemA, 'tipo', 'saida',
                           'quantidade', 1, 'data', current_date::text)
      ),
      k_admin
    );
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2a_LOTE_INVALIDO_PASSOU; ';
    raise warning '✗ 2a o lote com uma linha inválida foi ACEITO — o tudo-ou-nada não está valendo';
  exception when others then
    v_ok := v_ok + 1;
    raise notice '✓ 2a o lote com uma linha inválida foi recusado (%, %)', sqlstate, left(sqlerrm, 60);
  end;

  select count(*) into v_n_mov1  from public.movimentacoes;
  select count(*) into v_n_lanc1 from public.lancamentos_item;

  if v_n_mov1 = v_n_mov0 and v_n_lanc1 = v_n_lanc0 then
    v_ok := v_ok + 1;
    raise notice '✓ 2b ZERO movimentações e ZERO lançamentos sobraram (mov %→%, lanc %→%)',
      v_n_mov0, v_n_mov1, v_n_lanc0, v_n_lanc1;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2b; ';
    raise warning '✗ 2b sobrou meio lote: mov %→%, lanc %→%', v_n_mov0, v_n_mov1, v_n_lanc0, v_n_lanc1;
  end if;

  -- O ativo3, que estava na linha VÁLIDA do lote recusado, não se moveu.
  if (select status from public.ativos where id = v_ativo3) = 'em_estoque' then
    v_ok := v_ok + 1; raise notice '✓ 2c a linha VÁLIDA do lote recusado também não gravou nada';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '2c; ';
    raise warning '✗ 2c a linha válida do lote recusado mudou o estado do ativo';
  end if;

  -- =========================================================================
  -- 3 — AS TRAVAS: em ordem determinística, e ANTES do primeiro INSERT
  -- =========================================================================
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'criar_movimentacao_com_itens';

  v_pos_lock := position('pg_advisory_xact_lock' in v_def);
  v_pos_ins  := position('insert into public.movimentacoes' in v_def);
  if v_pos_lock > 0 and v_pos_ins > 0 and v_pos_lock < v_pos_ins then
    v_ok := v_ok + 1; raise notice '✓ 3a a trava advisory está no corpo e vem ANTES do primeiro INSERT';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3a; ';
    raise warning '✗ 3a a ordem trava→insert se perdeu (lock em %, insert em %)', v_pos_lock, v_pos_ins;
  end if;

  if position('order by 1, 2' in v_def) > 0 and position('order by 1' in v_def) < v_pos_ins then
    v_ok := v_ok + 1; raise notice '✓ 3b a ordenação determinística dos pares continua no corpo';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3b; ';
    raise warning '✗ 3b a ordenação determinística dos pares sumiu — volta o risco de deadlock';
  end if;

  if position('for update' in v_def) > 0 and position('for update' in v_def) < v_pos_ins then
    v_ok := v_ok + 1; raise notice '✓ 3c os ATIVOS também são travados em ordem, antes do primeiro INSERT';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3c; ';
    raise warning '✗ 3c a trava dos ativos sumiu — dois lotes com ativos em ordens diferentes deadlockam';
  end if;

  -- O carrinho chega em ordem DECRESCENTE de item, e mesmo assim as duas travas
  -- estão nas mãos ao fim da chamada (advisory é transacional: elas sobrevivem).
  perform public.criar_movimentacao_com_itens(
    jsonb_build_array(
      jsonb_build_object('ativo_id', v_ativo3, 'tipo', 'saida', 'motivo', 'novo_colaborador',
                         'data', current_date::text, 'colaborador', 'Fulano ZZF38 Um',
                         'colaborador_id', v_colab::text)
    ),
    jsonb_build_array(
      jsonb_build_object('indice_movimentacao', 0, 'item_id', greatest(v_itemA, v_itemB),
                         'tipo', 'saida', 'quantidade', 1, 'data', current_date::text),
      jsonb_build_object('indice_movimentacao', 0, 'item_id', least(v_itemA, v_itemB),
                         'tipo', 'saida', 'quantidade', 1, 'data', current_date::text)
    ),
    k_admin
  );

  select count(*) into v_travas from pg_locks
   where locktype = 'advisory' and pid = pg_backend_pid()
     and classid in (v_itemA, v_itemB);
  if v_travas >= 2 then
    v_ok := v_ok + 1; raise notice '✓ 3d as travas dos DOIS pares foram tomadas (% advisory na transação)', v_travas;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '3d; ';
    raise warning '✗ 3d esperava ao menos 2 travas advisory dos itens, obtido %', v_travas;
  end if;

  -- =========================================================================
  -- 4 — A IDENTIDADE DO CRITÉRIO 5: Σ com_a_pessoa + sem vínculo = liberados
  -- =========================================================================
  select coalesce(sum(case tipo::text when 'saida' then quantidade
                                      when 'retorno' then -quantidade else 0 end), 0)
    into v_lib
    from public.lancamentos_item where item_id = v_itemA and filial_id = v_f1;

  select coalesce(sum(com_a_pessoa), 0) into v_soma
    from (
      select com_a_pessoa from public.rel_saldo_colaborador(v_colab)
       where item_id = v_itemA and filial_id = v_f1
      union all
      select com_a_pessoa from public.rel_saldo_colaborador(v_colab2)
       where item_id = v_itemA and filial_id = v_f1
    ) x;

  select coalesce(sum(case tipo::text when 'saida' then quantidade
                                      when 'retorno' then -quantidade else 0 end), 0)
    into v_n
    from public.lancamentos_item
   where item_id = v_itemA and filial_id = v_f1 and colaborador_id is null;

  if v_soma + v_n = v_lib then
    v_ok := v_ok + 1;
    raise notice '✓ 4a Σ com_a_pessoa (%) + sem vínculo (%) = liberados (%) — nenhum número mudou',
      v_soma, v_n, v_lib;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '4a; ';
    raise warning '✗ 4a a identidade quebrou: % + % <> %', v_soma, v_n, v_lib;
  end if;

  -- =========================================================================
  -- 5 — A GUARDA NOVA: retorno com pessoa acima do saldo DELA é recusado
  -- =========================================================================
  select com_a_pessoa into v_pessoa from public.rel_saldo_colaborador(v_colab)
   where item_id = v_itemA and filial_id = v_f1;

  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data,
                                         colaborador_id, criado_por)
      values (v_itemA, v_f1, 'retorno', coalesce(v_pessoa, 0)::int + 1, current_date,
              v_colab, k_admin);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5a_GUARDA_NAO_PEGOU; ';
    raise warning '✗ 5a retorno acima do saldo da pessoa (% + 1) foi ACEITO', v_pessoa;
  exception when check_violation then
    v_ok := v_ok + 1;
    raise notice '✓ 5a retorno acima do que a pessoa tem (%) foi recusado', v_pessoa;
  end;

  -- E o retorno DENTRO do saldo dela passa (o par que prova que não fechou demais).
  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data,
                                         colaborador_id, criado_por)
      values (v_itemA, v_f1, 'retorno', 1, current_date, v_colab, k_admin);
    v_ok := v_ok + 1; raise notice '✓ 5b retorno DENTRO do saldo da pessoa continua passando';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '5b; ';
    raise warning '✗ 5b o retorno legítimo foi recusado (%) — a guarda fechou demais', sqlerrm;
  end;

  -- =========================================================================
  -- 6 — RETORNO SEM PESSOA continua passando (o caminho de TODO o histórico,
  --     e a razão de a regra §C.3 poder existir: entrega antiga funciona igual)
  -- =========================================================================
  -- A conta da pessoa ANTES — é a comparação que dá sentido ao 6b (comparar com
  -- zero seria falso verde: a pessoa TEM saldo neste ponto do roteiro).
  select coalesce(com_a_pessoa, 0) into v_pessoa from public.rel_saldo_colaborador(v_colab)
   where item_id = v_itemA and filial_id = v_f1;

  begin
    insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
      values (v_itemA, v_f1, 'retorno', 1, current_date, k_admin);
    v_ok := v_ok + 1;
    raise notice '✓ 6a retorno SEM colaborador_id passa como sempre passou (entrega antiga funciona igual)';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6a; ';
    raise warning '✗ 6a retorno sem vínculo virou erro retroativo (%) — o histórico quebrou', sqlerrm;
  end;

  -- E ele não é debitado de pessoa nenhuma: a conta de quem TINHA saldo não mexeu.
  select coalesce(com_a_pessoa, 0) into v_n from public.rel_saldo_colaborador(v_colab)
   where item_id = v_itemA and filial_id = v_f1;
  if v_n = v_pessoa then
    v_ok := v_ok + 1;
    raise notice '✓ 6b o retorno sem vínculo não tirou da conta de ninguém (a de quem tem saldo segue em %)', v_n;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '6b; ';
    raise warning '✗ 6b o retorno sem vínculo mexeu na conta de alguém (%→%)', v_pessoa, v_n;
  end if;

  -- =========================================================================
  -- 7 — `recuperado`: estoque +1, pessoa −1, Total INALTERADO
  -- =========================================================================
  -- Uma devolução com item faltante, que abre a pendência pelo trigger 0051.
  -- ⚠ `created_at` explícito e distinto (pendência nº 5 da F37).
  insert into public.movimentacoes (ativo_id, tipo, motivo, data, filial_id, colaborador,
                                    colaborador_id, itens_faltantes, criado_por, created_at)
    values (v_ativo1, 'devolucao', 'desligamento', current_date, v_f1, 'Fulano ZZF38 Um',
            v_colab, array['zzf38tipo'], k_admin, now() + interval '1 second')
    returning id into v_mov_dev;

  select id into v_pend from public.pendencias_item
   where movimentacao_id = v_mov_dev and item = 'zzf38tipo';

  if v_pend is not null then
    v_ok := v_ok + 1; raise notice '✓ 7a a devolução com item faltante abriu a pendência pelo trigger (byte a byte)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '7a; ';
    raise warning '✗ 7a a pendência não nasceu — o caminho Faltante mudou';
  end if;

  -- Dá saldo à pessoa para o retorno da resolução poder carregar o vínculo.
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data,
                                       colaborador_id, criado_por)
    values (v_itemA, v_f1, 'saida', 1, current_date, v_colab, k_admin);

  select total, estoque into v_total0, v_est0
    from public.rel_saldo_itens_filiais(array[v_f1], current_date) where filial_id is null and item_id = v_itemA;
  select com_a_pessoa into v_pessoa from public.rel_saldo_colaborador(v_colab)
   where item_id = v_itemA and filial_id = v_f1;

  select public.resolver_pendencias_item_com_lancamentos(
    array[v_pend], 'recuperado', 'Achado na gaveta — roteiro F38',
    jsonb_build_array(jsonb_build_object(
      'pendencia_id', v_pend::text, 'item_id', v_itemA, 'filial_id', v_f1,
      'quantidade', 1, 'data', current_date::text,
      'colaborador', 'Fulano ZZF38 Um', 'colaborador_id', v_colab::text,
      'observacao_retorno', 'Pendência resolvida — roteiro F38')),
    k_admin
  ) into v_ret;

  select total, estoque into v_total1, v_est1
    from public.rel_saldo_itens_filiais(array[v_f1], current_date) where filial_id is null and item_id = v_itemA;

  if v_total1 = v_total0 and v_est1 = v_est0 + 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 7b recuperado: estoque %→% (+1) e Total % inalterado', v_est0, v_est1, v_total1;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '7b; ';
    raise warning '✗ 7b recuperado: esperava estoque +1 e Total igual; veio estoque %→%, Total %→%',
      v_est0, v_est1, v_total0, v_total1;
  end if;

  select com_a_pessoa into v_n from public.rel_saldo_colaborador(v_colab)
   where item_id = v_itemA and filial_id = v_f1;
  if coalesce(v_n, 0) = coalesce(v_pessoa, 0) - 1 then
    v_ok := v_ok + 1; raise notice '✓ 7c recuperado: a conta da pessoa baixou 1 (%→%)', v_pessoa, v_n;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '7c; ';
    raise warning '✗ 7c recuperado: a conta da pessoa foi de % para %', v_pessoa, v_n;
  end if;

  if (select status from public.pendencias_item where id = v_pend) = 'resolvida' then
    v_ok := v_ok + 1; raise notice '✓ 7d a pendência ficou resolvida';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '7d; ';
    raise warning '✗ 7d a pendência não foi resolvida';
  end if;

  -- =========================================================================
  -- 12 — IDEMPOTÊNCIA: reenviar não re-resolve NEM duplica lançamento
  -- =========================================================================
  select count(*) into v_n_lanc0 from public.lancamentos_item where pendencia_item_id = v_pend;

  select public.resolver_pendencias_item_com_lancamentos(
    array[v_pend], 'recuperado', 'Reenvio — roteiro F38',
    jsonb_build_array(jsonb_build_object(
      'pendencia_id', v_pend::text, 'item_id', v_itemA, 'filial_id', v_f1,
      'quantidade', 1, 'data', current_date::text,
      'colaborador_id', v_colab::text)),
    k_admin
  ) into v_ret;

  select count(*) into v_n_lanc1 from public.lancamentos_item where pendencia_item_id = v_pend;

  if (v_ret ->> 'resolvidas')::int = 0 and v_n_lanc1 = v_n_lanc0 then
    v_ok := v_ok + 1;
    raise notice '✓ 12a reenviar não re-resolveu (0) nem duplicou lançamento (% linhas)', v_n_lanc1;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '12a; ';
    raise warning '✗ 12a reenvio duplicou: resolvidas=%, lançamentos %→%',
      v_ret ->> 'resolvidas', v_n_lanc0, v_n_lanc1;
  end if;

  -- =========================================================================
  -- 9 — REABRIR grava os inversos; com a lista incompleta, RECUSA
  -- =========================================================================
  select id into v_lanc from public.lancamentos_item
   where pendencia_item_id = v_pend and tipo::text = 'retorno' and estorna_id is null;

  -- 9a: lista VAZIA de estornos com lançamento de pé → tem de recusar.
  begin
    perform public.reabrir_pendencias_item_com_estornos(
      array[v_pend], 'Reabertura sem estorno — roteiro F38', '[]'::jsonb, k_admin);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '9a_ORFAO_PASSOU; ';
    raise warning '✗ 9a reabriu deixando lançamento órfão de pé';
  exception when check_violation then
    v_ok := v_ok + 1;
    raise notice '✓ 9a reabrir sem os inversos foi RECUSADO — nunca deixa lançamento órfão';
  end;

  if (select status from public.pendencias_item where id = v_pend) = 'resolvida' then
    v_ok := v_ok + 1; raise notice '✓ 9b a recusa voltou tudo: a pendência continua resolvida';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '9b; ';
    raise warning '✗ 9b a pendência foi reaberta mesmo com a recusa — a transação não voltou';
  end if;

  -- 9c: com o inverso na lista, reabre.
  select public.reabrir_pendencias_item_com_estornos(
    array[v_pend], 'Reabertura com estorno — roteiro F38',
    jsonb_build_array(jsonb_build_object(
      'estorna_id', v_lanc::text, 'pendencia_id', v_pend::text,
      'item_id', v_itemA, 'filial_id', v_f1, 'tipo', 'saida', 'quantidade', 1,
      'colaborador_id', v_colab::text,
      'observacao', 'Estorno: reabertura — roteiro F38')),
    k_admin
  ) into v_ret;

  if (v_ret ->> 'reabertas')::int = 1 and (v_ret ->> 'estornos')::int = 1
     and (select status from public.pendencias_item where id = v_pend) = 'aberta' then
    v_ok := v_ok + 1; raise notice '✓ 9c reabrir com os inversos funciona, e a pendência volta a aberta';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '9c; ';
    raise warning '✗ 9c reabertura não fechou o ciclo: %', v_ret;
  end if;

  if (select count(*) from public.lancamentos_item where estorna_id = v_lanc) = 1 then
    v_ok := v_ok + 1; raise notice '✓ 9d o inverso aponta o original por estorna_id, uma vez só';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '9d; ';
    raise warning '✗ 9d o inverso não ficou ligado ao original';
  end if;

  -- =========================================================================
  -- 8 — `baixa`: pessoa −1, Total −1, estoque DE VOLTA ao que era
  -- =========================================================================
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data,
                                       colaborador_id, criado_por)
    values (v_itemA, v_f1, 'saida', 1, current_date, v_colab2, k_admin);

  insert into public.movimentacoes (ativo_id, tipo, motivo, data, filial_id, colaborador,
                                    colaborador_id, itens_faltantes, criado_por, created_at)
    values (v_ativo2, 'devolucao', 'desligamento', current_date, v_f1, 'Fulano ZZF38 Dois',
            v_colab2, array['zzf38tipo'], k_admin, now() + interval '2 seconds')
    returning id into v_mov_dev;
  select id into v_pend from public.pendencias_item where movimentacao_id = v_mov_dev;

  select total, estoque into v_total0, v_est0
    from public.rel_saldo_itens_filiais(array[v_f1], current_date) where filial_id is null and item_id = v_itemA;
  select com_a_pessoa into v_pessoa from public.rel_saldo_colaborador(v_colab2)
   where item_id = v_itemA and filial_id = v_f1;

  select public.resolver_pendencias_item_com_lancamentos(
    array[v_pend], 'baixa', null,
    jsonb_build_array(jsonb_build_object(
      'pendencia_id', v_pend::text, 'item_id', v_itemA, 'filial_id', v_f1,
      'quantidade', 1, 'data', current_date::text,
      'colaborador', 'Fulano ZZF38 Dois', 'colaborador_id', v_colab2::text,
      'observacao_retorno', 'Baixa — roteiro F38',
      'observacao_ajuste', 'Baixa de item faltante: TESTE F38 Item A — não vai voltar.')),
    k_admin
  ) into v_ret;

  select total, estoque into v_total1, v_est1
    from public.rel_saldo_itens_filiais(array[v_f1], current_date) where filial_id is null and item_id = v_itemA;

  if (v_ret ->> 'lancamentos')::int = 2 then
    v_ok := v_ok + 1; raise notice '✓ 8a a baixa gravou DOIS lançamentos (retorno + ajuste), não um';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '8a; ';
    raise warning '✗ 8a a baixa gravou % lançamento(s) — deveriam ser 2', v_ret ->> 'lancamentos';
  end if;

  if v_total1 = v_total0 - 1 and v_est1 = v_est0 then
    v_ok := v_ok + 1;
    raise notice '✓ 8b baixa: Total %→% (−1) e estoque % de volta ao que era', v_total0, v_total1, v_est1;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '8b; ';
    raise warning '✗ 8b baixa: esperava Total −1 e estoque igual; veio Total %→%, estoque %→%',
      v_total0, v_total1, v_est0, v_est1;
  end if;

  select com_a_pessoa into v_n from public.rel_saldo_colaborador(v_colab2)
   where item_id = v_itemA and filial_id = v_f1;
  if coalesce(v_n, 0) = coalesce(v_pessoa, 0) - 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 8c baixa: a conta da pessoa baixou 1 (%→%) — o item não fica com ela para sempre',
      v_pessoa, v_n;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '8c; ';
    raise warning '✗ 8c baixa: a conta da pessoa foi de % para % — o furo continua aberto', v_pessoa, v_n;
  end if;

  -- =========================================================================
  -- 10 — O CAMINHO "FALTANTE" É BYTE A BYTE
  -- =========================================================================
  if (select item from public.pendencias_item where id = v_pend) = 'zzf38tipo' then
    v_ok := v_ok + 1; raise notice '✓ 10a a pendência guarda o SLUG literal, como sempre guardou';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '10a; ';
    raise warning '✗ 10a o slug gravado na pendência mudou';
  end if;

  if (select itens_faltantes from public.movimentacoes where id = v_mov_dev) = array['zzf38tipo'] then
    v_ok := v_ok + 1; raise notice '✓ 10b movimentacoes.itens_faltantes continua com os mesmos slugs';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '10b; ';
    raise warning '✗ 10b itens_faltantes mudou de formato';
  end if;

  -- A ponte tipo→item existe no modelo: o tipo do checklist encontra o item ativo.
  select count(*) into v_n from public.itens i
    join public.tipos_item t on t.id = i.tipo_id
   where t.slug = 'zzf38tipo' and i.ativo;
  if v_n = 1 then
    v_ok := v_ok + 1; raise notice '✓ 10c a ponte tipo→item resolve um único item ativo (o caso que não pergunta nada)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '10c; ';
    raise warning '✗ 10c a ponte tipo→item encontrou % candidatos, esperava 1', v_n;
  end if;

  -- =========================================================================
  -- 15 — REABRIR uma BAIXA: os DOIS inversos, na ordem que o trigger aceita
  -- =========================================================================
  -- O cenario que a revisao adversarial da fase encontrou. Desfazer uma baixa
  -- produz DOIS inversos POSITIVOS (saida, do retorno; ajuste, do ajuste
  -- negativo) — o `case ... quantidade > 0` da 0119 nao os desempatava, e na
  -- ordem errada o trigger recusa por estoque negativo. A 0122 ordena pelo
  -- EFEITO: ajuste positivo (repoe o Total) antes de quem consome a prateleira.
  --
  -- Aqui a pendencia do caso 8 (que foi resolvida como BAIXA) e reaberta, com os
  -- dois inversos mandados na ordem PIOR de proposito: a saida primeiro.
  select id into v_lanc from public.lancamentos_item
   where pendencia_item_id = v_pend and tipo::text = 'retorno' and estorna_id is null;
  select id into v_mov from public.lancamentos_item
   where pendencia_item_id = v_pend and tipo::text = 'ajuste' and estorna_id is null;

  select total, estoque into v_total0, v_est0
    from public.rel_saldo_itens_filiais(array[v_f1], current_date) where filial_id is null and item_id = v_itemA;

  begin
    select public.reabrir_pendencias_item_com_estornos(
      array[v_pend], 'Reabrir a baixa — roteiro F38',
      jsonb_build_array(
        -- ORDEM PIOR DE PROPOSITO: a saida vem primeiro no array.
        jsonb_build_object(
          'estorna_id', v_lanc::text, 'pendencia_id', v_pend::text,
          'item_id', v_itemA, 'filial_id', v_f1, 'tipo', 'saida', 'quantidade', 1,
          'colaborador_id', v_colab2::text, 'observacao', 'Estorno do retorno — roteiro F38'),
        jsonb_build_object(
          'estorna_id', v_mov::text, 'pendencia_id', v_pend::text,
          'item_id', v_itemA, 'filial_id', v_f1, 'tipo', 'ajuste', 'quantidade', 1,
          'observacao', 'Estorno do ajuste da baixa — roteiro F38')
      ),
      k_admin
    ) into v_ret;

    v_ok := v_ok + 1;
    raise notice '✓ 15a reabrir uma BAIXA funciona mesmo com os inversos na ordem pior (a 0122 reordena)';
  exception when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '15a; ';
    raise warning '✗ 15a reabrir a baixa falhou (%) — a ordem dos inversos voltou a depender do array', sqlerrm;
  end;

  select total, estoque into v_total1, v_est1
    from public.rel_saldo_itens_filiais(array[v_f1], current_date) where filial_id is null and item_id = v_itemA;

  if v_total1 = v_total0 + 1 and v_est1 = v_est0 then
    v_ok := v_ok + 1;
    raise notice '✓ 15b desfazer a baixa devolveu o Total (%→%) e deixou o estoque onde estava (%)',
      v_total0, v_total1, v_est1;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '15b; ';
    raise warning '✗ 15b esperava Total +1 e estoque igual; veio Total %→% e estoque %→%',
      v_total0, v_total1, v_est0, v_est1;
  end if;

  if (select status from public.pendencias_item where id = v_pend) = 'aberta' then
    v_ok := v_ok + 1; raise notice '✓ 15c a pendência da baixa voltou a ABERTA';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '15c; ';
    raise warning '✗ 15c a pendência da baixa não reabriu';
  end if;

  -- =========================================================================
  -- 13 — O ESTORNO DESFAZ O CONJUNTO (§B.5)
  -- =========================================================================
  -- Uma entrega que leva 1 item, e o estorno dela: os dois têm de voltar.
  select public.criar_movimentacao_com_itens(
    jsonb_build_array(
      jsonb_build_object('ativo_id', v_ativo4, 'tipo', 'saida', 'motivo', 'novo_colaborador',
                         'data', current_date::text, 'colaborador', 'Fulano ZZF38 Um',
                         'colaborador_id', v_colab::text)
    ),
    jsonb_build_array(
      jsonb_build_object('indice_movimentacao', 0, 'item_id', v_itemB, 'tipo', 'saida',
                         'quantidade', 3, 'data', current_date::text,
                         'colaborador_id', v_colab::text)
    ),
    k_admin
  ) into v_ret;
  v_mov := ((v_ret -> 'movimentacoes') ->> 0)::uuid;

  select estoque into v_est0 from public.rel_saldo_itens_filiais(array[v_f1], current_date) where filial_id is null and item_id = v_itemB;

  -- 13a: estorno SEM a lista dos inversos tem de RECUSAR (nunca meio estorno).
  begin
    perform public.estornar_movimentacao_com_itens(v_mov, 'Estorno sem itens — roteiro F38',
                                                   '[]'::jsonb, k_admin);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '13a_MEIO_ESTORNO; ';
    raise warning '✗ 13a o estorno passou deixando o lançamento de item de pé';
  exception when check_violation then
    v_ok := v_ok + 1;
    raise notice '✓ 13a estorno sem os inversos dos itens foi RECUSADO — nunca meio estorno';
  end;

  -- 13b: com o inverso, estorna e o estoque volta.
  select id into v_lanc from public.lancamentos_item
   where movimentacao_id = v_mov and estorna_id is null;

  select public.estornar_movimentacao_com_itens(
    v_mov, 'Estorno com itens — roteiro F38',
    jsonb_build_array(jsonb_build_object(
      'estorna_id', v_lanc::text, 'item_id', v_itemB, 'filial_id', v_f1,
      'tipo', 'retorno', 'quantidade', 3, 'colaborador_id', v_colab::text,
      'observacao', 'Estorno: roteiro F38')),
    k_admin
  ) into v_ret;

  select estoque into v_est1 from public.rel_saldo_itens_filiais(array[v_f1], current_date) where filial_id is null and item_id = v_itemB;

  if (v_ret ->> 'itens')::int = 1 and v_est1 = v_est0 + 3 then
    v_ok := v_ok + 1;
    raise notice '✓ 13b o estorno devolveu o item à prateleira junto com o equipamento (%→%)', v_est0, v_est1;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '13b; ';
    raise warning '✗ 13b esperava estoque +3 e 1 inverso; veio %→% e %', v_est0, v_est1, v_ret ->> 'itens';
  end if;

  if (select status from public.ativos where id = v_ativo4) = 'em_estoque' then
    v_ok := v_ok + 1; raise notice '✓ 13c o ativo voltou ao estado anterior (aplicar_movimentacao intocada)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '13c; ';
    raise warning '✗ 13c o ativo não voltou ao estado anterior';
  end if;

  -- =========================================================================
  -- 14 — AS FUNÇÕES QUE ESTA FASE PROMETEU NÃO TOCAR
  -- =========================================================================
  -- ⚠ AQUI NÃO SE COMPARA md5, e isso é lição aprendida no próprio CI desta fase.
  -- A primeira escrita deste cenário fixava os md5 lidos de PRODUÇÃO. Passou no
  -- ensaio (mesmo Postgres, mesmas migrations aplicadas na mesma ordem) e FALHOU no
  -- job `banco`, que monta um Postgres novo do zero: `pg_get_functiondef` reconstrói
  -- o texto e detalhes de formatação/versão do servidor mudam o hash sem que uma
  -- linha de corpo tenha mudado. Um md5 absoluto prova "é o mesmo BANCO", não "é a
  -- mesma FUNÇÃO" — e o que a ordem pede é o segundo.
  --
  -- O md5 continua sendo a prova certa ONDE ele é comparável: produção antes × depois
  -- do apply, no mesmo servidor. Está no `docs/RELATORIO-F38.md` §5, com os dez
  -- hashes idênticos.
  --
  -- O que se prova AQUI, e vale em qualquer Postgres: nenhuma das dez funções
  -- intocadas carrega marca da F38 no corpo. Se alguém recriar uma delas para
  -- "só acrescentar o colaborador_id", este cenário cai.
  --
  -- ⚠ F60 (0143/0145): as três `rel_*` desta lista foram SUCEDIDAS pelas `rel_*_filiais` (o
  -- recorte como lista obrigatória) e as velhas foram dropadas. Os nomes velhos ficam — em
  -- banco anterior à 0145 eles ainda existem e continuam valendo —, e as sucessoras entram ao
  -- lado: sem elas, depois da 0145 a varredura olharia SETE funções vivas dizendo "dez".
  --
  -- ⚠ EXCEÇÃO NOMINAL (18/09/2026, a `0146`; mudou de dono em 21/09/2026, a `0150`): o
  -- ramo de estorno passou a citar `pendencia_item_id` DE PROPÓSITO — é a recusa do estorno
  -- da devolução cuja pendência de item já teve desfecho (a FK que estourava 23503). Mesma
  -- doutrina da `RECRIACOES_AUTORIZADAS` de `src/lib/itens/migrations-f38.test.ts`: só o
  -- trecho EXATO sai da varredura, e só na função que o carrega. Qualquer OUTRA marca da F38
  -- nela — ou esse mesmo trecho em outra intocável — continua derrubando este cenário.
  --
  -- ⚠ A 0150 (item AG da reauditoria) decompôs `aplicar_movimentacao` numa orquestradora
  -- fina sobre seis auxiliares `movimentacao_*`, e o ramo de estorno — com o trecho da 0146
  -- — foi para `movimentacao_estornar`. Por isso: (a) as SEIS entram na varredura, porque a
  -- lista protege o que a função FAZ, não uma grafia de nome (a mesma régua das sucessoras
  -- da F60 acima) — sem elas, a máquina de estados inteira sairia desta guarda pela porta
  -- dos fundos; (b) a exceção mudou para `movimentacao_estornar`, e só o trecho de CÓDIGO
  -- sobrou nela (o comentário que a 0146 escrevia com a palavra foi reescrito sem ela); (c) a
  -- orquestradora voltou a ser varrida SEM exceção nenhuma.
  select count(*) into v_n
    from (
      select case when p.proname = 'movimentacao_estornar'
                  then replace(pg_get_functiondef(p.oid),
                         'join public.lancamentos_item l on l.pendencia_item_id = p.id', '')
                  else pg_get_functiondef(p.oid) end as def
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname in (
         'aplicar_movimentacao', 'guarda_acervo', 'rel_saldo_itens', 'rel_mov_itens',
         'rel_estoque_asof', 'status_apos_movimentacao', 'status_tem_detentor',
         'transferir_item', 'criar_compra_lote', 'devolver_ao_fornecedor',
         'rel_saldo_itens_filiais', 'rel_mov_itens_filiais', 'rel_estoque_asof_filiais',
         'movimentacao_estornar', 'movimentacao_pendencia_de_termo_restaurada',
         'movimentacao_desfazer_pendencias_item', 'movimentacao_abrir_pendencias_item',
         'movimentacao_transicionar', 'movimentacao_detentor_sincronizado')
    ) f
     -- ⚠ Os marcadores são os que SÓ a F38 introduziu. `movimentacao_id` ficou de
     -- fora de propósito: `aplicar_movimentacao` já cita essa palavra desde a 0051,
     -- porque insere em `pendencias_item (ativo_id, movimentacao_id, …)` — coluna
     -- homônima e sem relação com a que nasceu em `lancamentos_item`. Marcador
     -- ambíguo acusa função inocente, e foi o que aconteceu na primeira escrita.
   where (f.def ilike '%pendencia_item_id%'
       or f.def ilike '%rel_saldo_colaborador%'
       or f.def ilike '%criar_movimentacao_com_itens%'
       or f.def ilike '%registrado com esta pessoa%'
       or f.def ilike '%F38%');

  if v_n = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 14 nenhuma das 10 funções intocadas carrega marca da F38 no corpo';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '14; ';
    raise warning '✗ 14 % função(ões) que deveriam sair byte a byte ganharam código da F38', v_n;
  end if;

  -- E a contraprova: a função que a fase RECRIOU de propósito tem, sim, a marca.
  -- Sem ela, um `ilike` que nunca casa passaria por "nada mudou" (falso verde).
  if (select pg_get_functiondef(p.oid) ilike '%registrado com esta pessoa%'
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'valida_lancamento_item') then
    v_ok := v_ok + 1;
    raise notice '✓ 14a a ÚNICA função recriada (valida_lancamento_item) tem o bloco novo — o teste acima não é vazio';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '14a; ';
    raise warning '✗ 14a valida_lancamento_item NÃO tem a guarda por pessoa — a 0118 não pegou';
  end if;

  -- E nenhum valor novo de enum (a ordem proíbe nominalmente).
  select count(*) into v_n from unnest(enum_range(null::public.tipo_lancamento));
  if v_n = 6 then
    v_ok := v_ok + 1; raise notice '✓ 14b tipo_lancamento continua com 6 valores — nenhum enum novo';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '14b; ';
    raise warning '✗ 14b tipo_lancamento tem % valores, esperava 6', v_n;
  end if;

  -- =========================================================================
  -- 11 — GRANTS das RPCs novas
  -- =========================================================================
  for v_def in
    select unnest(array[
      'public.criar_movimentacao_com_itens(jsonb,jsonb,uuid)',
      'public.resolver_pendencias_item_com_lancamentos(uuid[],text,text,jsonb,uuid)',
      'public.reabrir_pendencias_item_com_estornos(uuid[],text,jsonb,uuid)',
      'public.estornar_movimentacao_com_itens(uuid,text,jsonb,uuid)'
    ])
  loop
    if has_function_privilege('authenticated', v_def, 'execute')
       and not has_function_privilege('anon', v_def, 'execute')
       and not has_function_privilege('service_role', v_def, 'execute') then
      v_ok := v_ok + 1;
      raise notice '✓ 11 grants de % : authenticated sim, anon e service_role não', split_part(v_def, '(', 1);
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || '11(' || split_part(v_def, '(', 1) || '); ';
      raise warning '✗ 11 grants errados em %', v_def;
    end if;
  end loop;

  -- rel_saldo_colaborador é leitura: authenticated e service_role sim, anon não.
  if has_function_privilege('authenticated', 'public.rel_saldo_colaborador(uuid)', 'execute')
     and not has_function_privilege('anon', 'public.rel_saldo_colaborador(uuid)', 'execute') then
    v_ok := v_ok + 1; raise notice '✓ 11e rel_saldo_colaborador: authenticated sim, anon não';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '11e; ';
    raise warning '✗ 11e grants errados em rel_saldo_colaborador';
  end if;

  -- As quatro funções são INVOKER (a autorização mora nas policies).
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and p.proname in ('criar_movimentacao_com_itens', 'rel_saldo_colaborador',
                       'resolver_pendencias_item_com_lancamentos',
                       'reabrir_pendencias_item_com_estornos',
                       'estornar_movimentacao_com_itens');
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ 11f as cinco funções novas são SECURITY INVOKER';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '11f; ';
    raise warning '✗ 11f % função(ões) nova(s) virou definer — a autorização saiu das policies', v_n;
  end if;

  -- =========================================================================
  -- 16 e 17 (F41) — O QUE A PARTIÇÃO NÃO PODE TER QUEBRADO
  -- =========================================================================
  -- A F41 fez `criar_movimentacao_com_itens` gravar até DUAS linhas onde antes
  -- gravava uma. As duas promessas centrais da F38 têm de sobreviver a isso, e é
  -- aqui — no roteiro da F38, não no da F41 — que elas se defendem: quem quebrá-las
  -- amanhã vai estar mexendo na F41 e precisa ser barrado por este arquivo.
  --
  -- SETUP — e ele é obrigatório: sem uma linha REALMENTE regularizada, as duas
  -- asserções abaixo passariam com `count(*) = 0` sobre um conjunto vazio, que é o
  -- pior tipo de teste verde. As fixtures da F38 não regularizam nada (todas as
  -- quantidades cabem no saldo), então o cenário provoca a partição de propósito:
  -- uma devolução com `retorno` do item B, que tem entrada mas NENHUMA saída em
  -- aberto — exatamente o caso do print.
  --
  -- ITEM NOVO, sem lançamento nenhum: é o que garante `em uso em aberto = 0` e
  -- portanto FORÇA a partição a virar acerto puro. Usar o item B daria o contrário:
  -- ele tem saldo em aberto de OUTRAS pessoas, a partição gravaria um `retorno`
  -- normal e nenhum acerto — e 16/17 mediriam o vazio de novo.
  --
  -- ⚠ O payload carrega `colaborador_id` DE PROPÓSITO, e é isso que torna o 17 uma
  -- prova em vez de uma tautologia: mesmo com a pessoa no payload, o acerto tem de
  -- nascer SEM vínculo. (Com `em uso em aberto = 0` não nasce linha de `retorno`
  -- nenhuma, então a guarda por pessoa da 0118 nem entra em cena — o que se mede
  -- aqui é a escolha da RPC, não a guarda.)
  --
  -- Ativo NOVO, e `created_at` explícito na saída que precede a devolução: regra da
  -- pendência nº 5 da F37, a mesma que o cabeçalho deste arquivo cita.
  insert into public.itens (nome, grupo, ordem)
    values ('TESTE F38 Item F41', 'acessorio', 9992) returning id into v_item_f41;
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF38A016', 'notebook', v_f1) returning id into v_ativo4;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador,
                                    status_resultante, criado_por, created_at)
  values (v_ativo4, 'saida', current_date - 4, v_f1, 'Fulano ZZF38 Um',
          'em_uso', k_admin, now() - interval '4 days');

  v_ret := public.criar_movimentacao_com_itens(
    jsonb_build_array(jsonb_build_object(
      'ativo_id', v_ativo4, 'tipo', 'devolucao', 'data', current_date::text,
      'status_resultante', 'em_estoque')),
    jsonb_build_array(jsonb_build_object(
      'indice_movimentacao', 0, 'item_id', v_item_f41, 'tipo', 'retorno', 'quantidade', 1,
      'data', current_date::text, 'colaborador', 'Fulano ZZF38 Um',
      'colaborador_id', v_colab,
      'observacao_regularizacao', 'Acerto automático (setup dos cenários 16 e 17).')),
    k_admin);

  select count(*) into v_n from public.lancamentos_item where regularizacao;
  if v_n >= 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 16-setup a partição da F41 gravou % acerto(s) — há o que medir', v_n;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '16-setup; ';
    raise warning '✗ 16-setup nenhum acerto foi gravado — 16 e 17 mediriam o vazio';
  end if;

  -- 16: o VÍNCULO (D13) — TODA linha nascida pela RPC aponta a movimentação, e a
  --     linha do acerto não é exceção. Se o acerto nascesse solto, ele não
  --     apareceria em "Itens que foram junto" e o estorno o deixaria órfão.
  select count(*) into v_n
    from public.lancamentos_item l
   where l.regularizacao and l.movimentacao_id is null and l.pendencia_item_id is null;
  if v_n = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 16 (F41) todo acerto automático nasce AMARRADO (movimentação ou pendência)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '16; ';
    raise warning '✗ 16 % acerto(s) automático(s) solto(s) — a promessa D13 da F38 caiu', v_n;
  end if;

  -- 17: a REGRA §C.3 do vínculo com a pessoa continua sendo do `retorno`, e só
  --     dele. O acerto é sobre a PRATELEIRA (a peça entrou no acervo), não sobre a
  --     conta de ninguém: carregar `colaborador_id` nele inventaria dívida — e a
  --     guarda por pessoa da 0118 passaria a medir uma soma que nunca saiu.
  select count(*) into v_n
    from public.lancamentos_item l
   where l.regularizacao and l.colaborador_id is not null;
  if v_n = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 17 (F41) o acerto automático NUNCA carrega vínculo com pessoa';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || '17; ';
    raise warning '✗ 17 % acerto(s) com colaborador_id — inventa dívida na conta de alguém', v_n;
  end if;

  -- =========================================================================
  -- RESUMO (a linha que o MCP consegue ler — ele engole NOTICE/WARNING)
  -- =========================================================================
  insert into _f38_resumo values (v_ok, v_falhas, nullif(v_msgs, ''));
  if v_falhas = 0 then
    raise notice '=== f38_itens_com_ativo: % asserções OK, 0 falhas (ROLLBACK — nada gravado) ===', v_ok;
  else
    raise warning '✗ TOTAL f38_itens_com_ativo: % falha(s) — %', v_falhas, v_msgs;
  end if;
  raise notice 'FIM f38_itens_com_ativo: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

select * from _f38_resumo;

rollback;
