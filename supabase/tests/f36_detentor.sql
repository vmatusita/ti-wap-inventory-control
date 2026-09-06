-- =============================================================
-- Roteiro de teste — O DETENTOR SAI JUNTO COM O ATIVO (OS-F36, migrations 0110/0111).
--
-- Arquivo NOVO e INDEPENDENTE: não toca nem depende dos demais roteiros de
-- supabase/tests/ (mesmo precedente do f34_triagem_reserva.sql). O CI usa o glob
-- supabase/tests/*.sql, então este arquivo entra sozinho.
--
-- O QUE ELE PROVA (§3 do docs/PLAN-F36-F39.md, item a item):
--   a  o VOCABULÁRIO: `status_tem_detentor` é verdadeiro em exatamente três estados
--      — em_uso, emprestado, reservado — e falso em TODO o resto do enum. A varredura
--      é sobre `enum_range`, não sobre uma lista escrita à mão: status novo entra na
--      conta sozinho.
--   b  o FURO PRINCIPAL fechado: `ajuste` para estado SEM dono ZERA colaborador/setor.
--   c  o PAR POSITIVO: `ajuste` para estado COM dono PRESERVA — sem isto, uma
--      implementação que zerasse sempre passaria em (b).
--   d  `retorno_manutencao` limpa detentor LEGADO (um dos cinco tipos que nenhuma lista
--      de tipos cobria).
--   e  `marcar_defasado` idem — `defasado` é o estado que a lista à mão da 0084
--      esquecia, e é por isso que `forcar_estado_ativo` também foi recriada na 0110.
--   f  `transferencia` de um ativo `em_uso` PRESERVA o detentor (ela mantém o status).
--   g  `estorno` DEVOLVE o colaborador (decisão D2: o ramo do estorno ficou byte a
--      byte — é o que faz "desfazer" desfazer).
--   h  REGRESSÃO: saida/emprestimo/reserva continuam gravando o payload e `devolucao`
--      continua zerando E abrindo a pendência de item.
--   i  o ESPELHO AS-OF: `rel_estoque_asof` concorda com o estado ao vivo na data de
--      hoje, e continua contando o passado como ele foi numa data anterior ao ajuste.
--   j  a DÉCIMA CHECAGEM (`detentor_em_estado_sem_dono`) enxerga o ativo sujo plantado
--      à mão e volta ao número original depois que uma movimentação o limpa.
--   k  `forcar_estado_ativo` para `defasado` zera o detentor e reporta
--      `detentor_zerado = true` — o que a lista à mão da 0084 não fazia.
--
-- Convenção idêntica aos outros roteiros (job `banco` do CI):
--   NOTICE  '✓ ...'  quando o resultado bate com o esperado
--   WARNING '✗ ...'  quando NÃO bate (o CI falha em qualquer `WARNING: ✗`)
--
-- Tudo roda dentro de UMA transação que termina em ROLLBACK: NADA é gravado.
-- Pré-requisitos: as filiais matriz/linhares (migration 0007). O operador e o
-- desenvolvedor são criados AQUI — o roteiro é autossuficiente.
-- Dados 100% fictícios (CLAUDE.md regra 2): patrimônios com prefixo único `ZZF36...`,
-- e-mails `f36.*@wap.ind.br`, colaboradores "Fulano"/"Ciclano"/"Beltrano".
--
-- ⚠ ONDE O ROTEIRO PLANTA SUJEIRA À MÃO (`update public.ativos set colaborador_atual`):
-- é de propósito e é a única forma. Depois da 0110 nenhum caminho de escrita produz um
-- ativo em estado sem dono COM detentor — esse estado só existe como DADO LEGADO,
-- anterior à limpeza da 0111. `update` em `ativos` é operação normal (a `guarda_acervo`
-- da 0081 é `before delete`).
-- =============================================================

begin;

do $$
declare
  v_ok      int := 0;   -- F45: quantas asserções passaram
  v_falhas  int := 0;   -- F45: quantas falharam (a linha FIM soma as duas)
  k_dev    uuid := gen_random_uuid();
  v_matriz smallint;
  v_lin    smallint;
  a        uuid;
  v_status public.status_ativo;
  v_colab  text;
  v_setor  text;
  v_filial smallint;
  v_cnt    int;
  v_esperado text[];
  v_obtido   text[];
  v_j      jsonb;
  v_antes  bigint;
  v_depois bigint;
begin
  select id into v_matriz from public.filiais where slug = 'matriz';
  select id into v_lin    from public.filiais where slug = 'linhares';
  if v_matriz is null or v_lin is null then
    raise exception 'PRE-REQUISITO: aplique a migration 0007 (filiais matriz e linhares)';
  end if;

  -- O trigger handle_new_user cria o profile (e exige domínio corporativo — 0041/0057).
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values (k_dev, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'f36.dev@wap.ind.br', '', now(), now(), now());

  -- Plantar um DEV exige o caminho oficial: `profiles_guarda_dev` (0073) recusa a
  -- concessão do cargo até para o postgres. Mesmo idioma do dev_destrutivo.sql.
  perform set_config('estoque.gestao_usuarios', 'on', true);
  update public.profiles set papel = 'dev', primeiro_nome = 'Dev', sobrenome = 'de Teste'
   where id = k_dev;
  perform set_config('estoque.gestao_usuarios', 'off', true);

  -- =============================================================
  -- a — O VOCABULÁRIO: exatamente três estados têm dono
  -- =============================================================
  v_esperado := array['em_uso', 'emprestado', 'reservado'];
  select coalesce(array_agg(s::text order by s::text), array[]::text[])
    into v_obtido
    from unnest(enum_range(null::public.status_ativo)) s
   where public.status_tem_detentor(s);
  if v_obtido = (select array_agg(x order by x) from unnest(v_esperado) x) then
    v_ok := v_ok + 1; raise notice '✓ a1 status_tem_detentor é verdadeiro em exatamente %', array_to_string(v_obtido, ', ');
  else
    v_falhas := v_falhas + 1; raise warning '✗ a1 esperado {em_estoque…} com dono = %, obtido %',
      array_to_string(v_esperado, ', '), array_to_string(v_obtido, ', ');
  end if;

  select count(*) into v_cnt
    from unnest(enum_range(null::public.status_ativo)) s
   where public.status_tem_detentor(s) is null;
  if v_cnt = 0 then
    v_ok := v_ok + 1; raise notice '✓ a2 a função responde sim/não para TODO valor do enum (nenhum nulo)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ a2 % valor(es) do enum status_ativo devolveram nulo', v_cnt;
  end if;

  -- =============================================================
  -- b — O FURO PRINCIPAL: ajuste para estado SEM dono ZERA
  -- =============================================================
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF36AJU01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF36AJU01';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'saida', 'Fulano Ajuste', 'TI', v_matriz, k_dev);                    -- em_uso
  insert into public.movimentacoes (ativo_id, tipo, status_resultante, observacao, filial_id, criado_por)
    values (a, 'ajuste', 'em_estoque', 'F36 cenario b: acerto de inventario (teste)', v_matriz, k_dev);
  select status, colaborador_atual, setor_atual into v_status, v_colab, v_setor
    from public.ativos where id = a;
  if v_status = 'em_estoque' and v_colab is null and v_setor is null then
    v_ok := v_ok + 1; raise notice '✓ b1 ajuste para em_estoque ZERA colaborador e setor (o furo principal da F36)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ b1 esperado em_estoque/null/null, obtido %/%/%',
      v_status, coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)');
  end if;

  -- =============================================================
  -- c — O PAR POSITIVO: ajuste para estado COM dono PRESERVA
  -- =============================================================
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF36AJU02', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF36AJU02';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'saida', 'Ciclano Preservado', 'Financeiro', v_matriz, k_dev);       -- em_uso
  insert into public.movimentacoes (ativo_id, tipo, status_resultante, observacao, filial_id, criado_por)
    values (a, 'ajuste', 'emprestado', 'F36 cenario c: era emprestimo, nao saida (teste)', v_matriz, k_dev);
  select status, colaborador_atual, setor_atual into v_status, v_colab, v_setor
    from public.ativos where id = a;
  if v_status = 'emprestado' and v_colab = 'Ciclano Preservado' and v_setor = 'Financeiro' then
    v_ok := v_ok + 1; raise notice '✓ c1 ajuste para estado COM dono PRESERVA colaborador e setor';
  else
    v_falhas := v_falhas + 1; raise warning '✗ c1 esperado emprestado/Ciclano Preservado/Financeiro, obtido %/%/%',
      v_status, coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)');
  end if;

  -- =============================================================
  -- d — retorno_manutencao limpa detentor LEGADO
  -- =============================================================
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF36RET01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF36RET01';
  insert into public.movimentacoes (ativo_id, tipo, filial_id, chamado_fornecedor, criado_por)
    values (a, 'envio_manutencao', v_matriz, 'OS-F36-D', k_dev);                    -- em_manutencao
  update public.ativos set colaborador_atual = 'Beltrano Legado', setor_atual = 'Logistica'
   where id = a;                                                                    -- sujeira legada
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'retorno_manutencao', v_matriz, k_dev);
  select status, colaborador_atual, setor_atual into v_status, v_colab, v_setor
    from public.ativos where id = a;
  if v_status = 'em_estoque' and v_colab is null and v_setor is null then
    v_ok := v_ok + 1; raise notice '✓ d1 retorno_manutencao volta ao estoque SEM o detentor legado';
  else
    v_falhas := v_falhas + 1; raise warning '✗ d1 esperado em_estoque/null/null, obtido %/%/%',
      v_status, coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)');
  end if;

  -- =============================================================
  -- e — marcar_defasado limpa detentor LEGADO (o estado que a 0084 esquecia)
  -- =============================================================
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF36DEF01', 'desktop', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF36DEF01';
  update public.ativos set colaborador_atual = 'Fulano Legado', setor_atual = 'TI'
   where id = a;                                                                    -- sujeira legada
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'marcar_defasado', v_matriz, k_dev);
  select status, colaborador_atual, setor_atual into v_status, v_colab, v_setor
    from public.ativos where id = a;
  if v_status = 'defasado' and v_colab is null and v_setor is null then
    v_ok := v_ok + 1; raise notice '✓ e1 marcar_defasado zera o detentor (defasado é estado SEM dono na F36)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ e1 esperado defasado/null/null, obtido %/%/%',
      v_status, coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)');
  end if;

  -- =============================================================
  -- f — transferencia de ativo em_uso PRESERVA o detentor
  -- =============================================================
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF36TRF01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF36TRF01';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'saida', 'Fulano Viajante', 'Comercial', v_matriz, k_dev);           -- em_uso
  insert into public.movimentacoes (ativo_id, tipo, filial_id, filial_destino_id, criado_por)
    values (a, 'transferencia', v_matriz, v_lin, k_dev);
  select status, colaborador_atual, setor_atual, filial_id
    into v_status, v_colab, v_setor, v_filial from public.ativos where id = a;
  if v_status = 'em_uso' and v_colab = 'Fulano Viajante' and v_setor = 'Comercial' and v_filial = v_lin then
    v_ok := v_ok + 1; raise notice '✓ f1 transferencia mantém o estado E o detentor (só a filial muda)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ f1 esperado em_uso/Fulano Viajante/Comercial/linhares, obtido %/%/%/%',
      v_status, coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)'), v_filial;
  end if;

  -- =============================================================
  -- g — estorno DEVOLVE o colaborador (decisão D2, ramo intocado)
  -- =============================================================
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF36EST01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF36EST01';
  -- ⚠ `created_at` EXPLÍCITO e distinto — corrigido em 28/08/2026 (F37), e o motivo
  -- vale para qualquer roteiro futuro que estorne. A guarda do estorno em
  -- `aplicar_movimentacao` (0110, linha ~126) recusa quando existe movimentação mais
  -- nova, comparando a TUPLA `(created_at, id)`. Dentro de uma transação, `now()` é
  -- CONSTANTE: as duas linhas abaixo nasciam com o MESMO `created_at`, o desempate
  -- caía no `id` — que é `gen_random_uuid()`, aleatório a cada execução — e o
  -- cenário virava cara-ou-coroa. Medido: **2 falhas em 5 execuções** contra o banco
  -- real. Não era defeito do código; era o roteiro perguntando uma coisa que ele não
  -- controlava. Com os dois instantes separados, a `devolucao` é inequivocamente a
  -- última e o cenário mede o que se propôs a medir.
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por, created_at)
    values (a, 'saida', 'Fulano Estornado', 'RH', v_matriz, k_dev, now() - interval '2 minutes');  -- em_uso
  insert into public.movimentacoes (ativo_id, tipo, motivo, filial_id, criado_por, created_at)
    values (a, 'devolucao', 'desligamento', v_matriz, k_dev, now() - interval '1 minute');         -- em_estoque, sem dono
  select colaborador_atual into v_colab from public.ativos where id = a;
  if v_colab is null then
    v_ok := v_ok + 1; raise notice '✓ g1 a devolucao zerou o detentor (precondicao do estorno)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ g1 precondicao: esperado null apos devolucao, obtido %', v_colab;
  end if;
  insert into public.movimentacoes (ativo_id, tipo, filial_id, estorno_de, criado_por)
    select a, 'estorno', v_matriz, m.id, k_dev
      from public.movimentacoes m
     where m.ativo_id = a and m.tipo = 'devolucao';
  select status, colaborador_atual, setor_atual into v_status, v_colab, v_setor
    from public.ativos where id = a;
  if v_status = 'em_uso' and v_colab = 'Fulano Estornado' and v_setor = 'RH' then
    v_ok := v_ok + 1; raise notice '✓ g2 o estorno DEVOLVE colaborador e setor (D2: desfazer desfaz de verdade)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ g2 esperado em_uso/Fulano Estornado/RH, obtido %/%/%',
      v_status, coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)');
  end if;

  -- =============================================================
  -- h — REGRESSÃO: o dia a dia continua igual
  -- =============================================================
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF36REG01', 'celular', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF36REG01';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'reserva', 'Ciclano Reservou', 'Compras', v_matriz, k_dev);
  select status, colaborador_atual, setor_atual into v_status, v_colab, v_setor
    from public.ativos where id = a;
  if v_status = 'reservado' and v_colab = 'Ciclano Reservou' and v_setor = 'Compras' then
    v_ok := v_ok + 1; raise notice '✓ h1 reserva continua gravando colaborador e setor do payload';
  else
    v_falhas := v_falhas + 1; raise warning '✗ h1 esperado reservado/Ciclano Reservou/Compras, obtido %/%/%',
      v_status, coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)');
  end if;

  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'emprestimo', 'Beltrano Pegou', 'Producao', v_matriz, k_dev);
  select status, colaborador_atual into v_status, v_colab from public.ativos where id = a;
  if v_status = 'emprestado' and v_colab = 'Beltrano Pegou' then
    v_ok := v_ok + 1; raise notice '✓ h2 emprestimo continua trocando o detentor';
  else
    v_falhas := v_falhas + 1; raise warning '✗ h2 esperado emprestado/Beltrano Pegou, obtido %/%',
      v_status, coalesce(v_colab, '(null)');
  end if;

  insert into public.movimentacoes (ativo_id, tipo, motivo, colaborador, itens_faltantes, filial_id, criado_por)
    values (a, 'devolucao', 'fim_emprestimo', 'Beltrano Pegou', array['carregador'], v_matriz, k_dev);
  select status, colaborador_atual, setor_atual into v_status, v_colab, v_setor
    from public.ativos where id = a;
  select count(*) into v_cnt from public.pendencias_item
   where ativo_id = a and resolvida_em is null and item = 'carregador';
  if v_status = 'em_estoque' and v_colab is null and v_setor is null and v_cnt = 1 then
    v_ok := v_ok + 1; raise notice '✓ h3 devolucao zera o detentor E continua abrindo a pendência de item (F18 intacta)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ h3 esperado em_estoque/null/null com 1 pendência, obtido %/%/% com %',
      v_status, coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)'), v_cnt;
  end if;

  -- =============================================================
  -- i — O ESPELHO AS-OF: rel_estoque_asof concorda com o estado ao vivo
  -- =============================================================
  -- Um ativo com saida (há 10 dias) e ajuste para em_estoque (há 2 dias). Hoje ele não
  -- tem dono nem ao vivo nem as-of; e a leitura de 5 dias atrás continua mostrando o
  -- período como ele foi — em_uso, com o colaborador.
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF36ASO01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF36ASO01';
  insert into public.movimentacoes (ativo_id, tipo, data, colaborador, setor, filial_id, criado_por)
    values (a, 'saida', current_date - 10, 'Fulano AsOf', 'TI', v_matriz, k_dev);
  insert into public.movimentacoes (ativo_id, tipo, data, status_resultante, observacao, filial_id, criado_por)
    values (a, 'ajuste', current_date - 2, 'em_estoque', 'F36 cenario i: acerto (teste)', v_matriz, k_dev);

  select r.status, r.colaborador, r.setor into v_status, v_colab, v_setor
    from public.rel_estoque_asof(v_matriz, current_date) r where r.ativo_id = a;
  if v_status = 'em_estoque' and v_colab is null and v_setor is null then
    v_ok := v_ok + 1; raise notice '✓ i1 a leitura as-of de HOJE concorda com o ao vivo (em_estoque, sem dono)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ i1 as-of hoje: esperado em_estoque/null/null, obtido %/%/%',
      coalesce(v_status::text, '(sem linha)'), coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)');
  end if;

  select r.status, r.colaborador, r.setor into v_status, v_colab, v_setor
    from public.rel_estoque_asof(v_matriz, current_date - 5) r where r.ativo_id = a;
  if v_status = 'em_uso' and v_colab = 'Fulano AsOf' and v_setor = 'TI' then
    v_ok := v_ok + 1; raise notice '✓ i2 a leitura as-of ANTES do ajuste continua mostrando o período como ele foi';
  else
    v_falhas := v_falhas + 1; raise warning '✗ i2 as-of -5d: esperado em_uso/Fulano AsOf/TI, obtido %/%/%',
      coalesce(v_status::text, '(sem linha)'), coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)');
  end if;

  -- =============================================================
  -- j — A DÉCIMA CHECAGEM enxerga a sujeira e some com ela
  -- =============================================================
  -- Compara DELTAS, não números absolutos: em produção pode haver outras linhas, e um
  -- número fixo viraria um valor mágico que alguém "conserta" no dia em que falhar.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);
  select c.total into v_antes from public.dev_checagens_integridade() c
   where c.chave = 'detentor_em_estado_sem_dono';
  reset role;

  if v_antes is null then
    v_falhas := v_falhas + 1; raise warning '✗ j1 a checagem detentor_em_estado_sem_dono não existe na RPC (migration 0110 aplicada?)';
  else
    v_ok := v_ok + 1; raise notice '✓ j1 a décima checagem existe e responde (total atual = %)', v_antes;
  end if;

  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF36CHK01', 'monitor', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF36CHK01';
  update public.ativos set colaborador_atual = 'Fulano Sujo' where id = a;   -- sujeira legada

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);
  select c.total into v_depois from public.dev_checagens_integridade() c
   where c.chave = 'detentor_em_estado_sem_dono';
  reset role;

  if v_depois = v_antes + 1 then
    v_ok := v_ok + 1; raise notice '✓ j2 a checagem contou o ativo sujo plantado à mão (% → %)', v_antes, v_depois;
  else
    v_falhas := v_falhas + 1; raise warning '✗ j2 esperado % + 1, obtido %', v_antes, coalesce(v_depois::text, '(null)');
  end if;

  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por)
    values (a, 'envio_triagem', v_matriz, k_dev);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);
  select c.total into v_depois from public.dev_checagens_integridade() c
   where c.chave = 'detentor_em_estado_sem_dono';
  reset role;

  if v_depois = v_antes then
    v_ok := v_ok + 1; raise notice '✓ j3 uma movimentação qualquer limpa a sujeira e a checagem volta a % ', v_antes;
  else
    v_falhas := v_falhas + 1; raise warning '✗ j3 esperado voltar a %, obtido %', v_antes, coalesce(v_depois::text, '(null)');
  end if;

  -- =============================================================
  -- k — forcar_estado_ativo para `defasado` zera (o que a 0084 não fazia)
  -- =============================================================
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF36FOR01', 'notebook', v_matriz);
  select id into a from public.ativos where patrimonio = 'ZZF36FOR01';
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'saida', 'Fulano Forcado', 'TI', v_matriz, k_dev);                   -- em_uso

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_dev, 'role', 'authenticated')::text, true);
  begin
    select public.forcar_estado_ativo(a, 'defasado'::public.status_ativo,
      'justificativa ficticia do roteiro F36') into v_j;
  exception when others then
    v_j := jsonb_build_object('erro', sqlerrm);
  end;
  reset role;

  select status, colaborador_atual, setor_atual into v_status, v_colab, v_setor
    from public.ativos where id = a;
  if v_status = 'defasado' and v_colab is null and v_setor is null
     and (v_j ->> 'detentor_zerado')::boolean is true then
    v_ok := v_ok + 1; raise notice '✓ k1 forçar para defasado zera o detentor E reporta detentor_zerado = true';
  else
    v_falhas := v_falhas + 1; raise warning '✗ k1 esperado defasado/null/null com detentor_zerado=true, obtido %/%/% e %',
      coalesce(v_status::text, '(null)'), coalesce(v_colab, '(null)'), coalesce(v_setor, '(null)'), v_j::text;
  end if;

  raise notice 'FIM f36_detentor: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
