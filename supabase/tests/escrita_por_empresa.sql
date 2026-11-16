-- =============================================================
-- Roteiro de teste: A ESCRITA POR EMPRESA (F67C, 16/11/2026) — o fim do default
-- =============================================================
-- O QUE ESTE ARQUIVO PROVA
--
-- A F67C tirou o `default public.empresa_legada()` das 20 colunas `empresa_id` (0205–0207) e fez as 18 funções que
-- inseriam SEM a coluna gravarem a empresa DA FILIAL da linha, pela ponte `public.empresa_da_filial(smallint)` (0200–0204).
-- Este roteiro é a prova de comportamento dessas duas metades, com duas empresas de verdade (A = a legada, B = criada aqui):
--
--   E  — a escrita da B nasce da B (E1–E19): cada uma das 17 funções recriadas, chamada por um membro da B COMO
--        `authenticated` (as policies valem), grava `empresa_id = B` em TODA linha que cria — contado por tabela, com o
--        universo das linhas novas > 0. O PAR SIMÉTRICO na A (S1–S19) roda o mesmo bateria e grava A. As cinco de anotação,
--        criar_compra_lote, devolver_ao_fornecedor, criar_movimentacao_com_itens, estornar_movimentacao_com_itens,
--        movimentacao_abrir_pendencias_item (por uma devolução com itens_faltantes), lancar_itens_lote,
--        reabrir_pendencias_item_com_estornos, resolver_pendencias_item_com_lancamentos, transferir_item (entre duas
--        filiais da mesma empresa) e o import (importar_ativos_substituir exercita import_criar_ativos,
--        import_lancar_movimentacoes e import_gravar_trilha).
--   R  — registrar_limpeza_termos_sem_linha(p_empresa, …): a assinatura nova grava a trilha com a empresa dada; empresa
--        nula é recusada (42501); a assinatura antiga (text,text,text) não existe.
--   N  — um INSERT SEM a coluna é recusado nas 20 tabelas de negócio (23502) — salvo os dois casos em que um gatilho
--        BEFORE lê `new.empresa_id` antes do NOT NULL (termos_gerados com ids: `termo_da_empresa`; kits_modelos com
--        motivo: `kit_motivo_da_empresa` → 23503); o par COM a coluna aceita (a recusa é da falta, não de outro defeito).
--   X  — o INSERT com a empresa de OUTRA: onde há pai (filial/ativo/movimentação) a FK composta recusa (23503); onde a
--        policy decide, o membro SÓ da A não insere na B (42501), e as tabelas sem policy de escrita para `authenticated`
--        não aceitam insert em empresa nenhuma (42501).
--   M  — o leitor (b): dois motivos de MESMO `codigo` em A e B e um admin das duas empresas; `update … where codigo = c`
--        alcança 2 linhas (o defeito que a action tinha), e `… where empresa_id = A and codigo = c` alcança 1 (a forma
--        corrigida).
--
-- CONVENÇÃO (scripts/db/CLAUDE.md): todo ✗ sai como `✗ <rótulo>` literal ou por `pg_temp.assert_zero_de('<rótulo>' …)`;
-- universo vazio levanta exceção (nunca tautologia). Dados 100% fictícios (regra 2). Roda como os irmãos:
-- `begin; do $$ … $$; rollback;`, com `_asserts.sql` carregado antes na mesma sessão.
-- =============================================================

begin;

-- Os grants de TABELA que o bootstrap do CI não dá (produção os tem; a POLICY é quem decide, sob teste). Só o que uma
-- asserção DESTE arquivo usa como `authenticated`.
grant select, insert, update, delete on
  public.anotacoes, public.ativos, public.colaboradores, public.eventos_admin, public.filiais,
  public.import_logs, public.import_prefixos_patrimonio, public.import_termos_categoria, public.import_termos_estado,
  public.itens, public.kits_modelos, public.lancamentos_item, public.motivos, public.movimentacoes,
  public.pendencias_item, public.relatorios_gerados, public.senhas_acesso, public.termos_gerados,
  public.tipos_item, public.unidades_apelidos
  to authenticated;
grant select on public.membros, public.operador_filiais, public.profiles to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- As ferramentas deste roteiro
-- ---------------------------------------------------------------------------------------------------------------

-- Roda UM comando; com p_uid, COMO `authenticated` com as claims dele. Devolve 'ok:<linhas>' ou
-- 'recusa:<sqlstate>:<mensagem curta>'. Com p_desfaz, a subtransação aborta de propósito depois do comando
-- (nada sobrevive); sem ele, o efeito fica (a bateria E precisa do dado).
create or replace function pg_temp.como(p_uid uuid, p_sql text, p_desfaz boolean default false) returns text
language plpgsql as $fn$
declare
  v_n bigint;
  v_r text;
begin
  if p_uid is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  end if;
  begin
    if p_uid is not null then
      execute 'set local role authenticated';
    end if;
    execute p_sql;
    get diagnostics v_n = row_count;
    if p_desfaz then
      raise exception using errcode = 'P0F6C', message = 'desfaz a tentativa';
    end if;
    v_r := 'ok:' || v_n;
  exception
    when sqlstate 'P0F6C' then v_r := 'ok:' || v_n;
    when others then v_r := 'recusa:' || sqlstate || ':' || left(sqlerrm, 140);
  end;
  execute 'reset role';
  if p_uid is not null then
    perform set_config('request.jwt.claims', '', true);
  end if;
  return v_r;
end;
$fn$;

-- O sqlstate de um resultado de pg_temp.como ('ok' quando passou).
create or replace function pg_temp.estado(p_r text) returns text
language sql immutable as $fn$
  select case when p_r like 'ok:%' then 'ok' else split_part(p_r, ':', 2) end
$fn$;

-- O INSERT de UMA linha fictícia em cada uma das 20 tabelas de negócio, com ou sem a coluna `empresa_id`.
-- p_fx = o que pg_temp.f65_plantar devolveu (os PAIS); p_emp nulo = INSERT SEM a coluna. p_var 'ids' (termos_gerados
-- cita movimentação e ativo) e 'motivo' (kits_modelos cita um motivo) ligam os dois gatilhos BEFORE que leem a empresa.
create or replace function pg_temp.ins(p_tab text, p_fx jsonb, p_emp uuid, p_autor uuid, p_var text default '')
returns text language plpgsql as $fn$
declare
  v_cols text;
  v_vals text;
  s      text := replace(gen_random_uuid()::text, '-', '');
begin
  case p_tab
    when 'ativos' then
      v_cols := 'service_tag, categoria, filial_id, origem';
      v_vals := format('%L, %L, %L, %L', 'ZZN' || s, 'notebook', p_fx->>'filiais', 'cadastro');
    when 'movimentacoes' then
      v_cols := 'ativo_id, tipo, data, filial_id, criado_por';
      v_vals := format('%L, %L, %L, %L, %L', p_fx->>'ativos', 'compra', current_date, p_fx->>'filiais', p_autor);
    when 'pendencias_item' then
      v_cols := 'ativo_id, movimentacao_id, item, filial_id, colaborador';
      v_vals := format('%L, %L, %L, %L, %L', p_fx->>'ativos', p_fx->>'movimentacoes', 'pendência ' || s, p_fx->>'filiais', 'Fulano N');
    when 'lancamentos_item' then
      v_cols := 'item_id, filial_id, tipo, quantidade, data, criado_por';
      v_vals := format('%L, %L, %L, %L, %L, %L', p_fx->>'itens', p_fx->>'filiais', 'entrada', 1, current_date, p_autor);
    when 'anotacoes' then
      v_cols := 'ativo_id, texto, criado_por';
      v_vals := format('%L, %L, %L', p_fx->>'ativos', 'anotação ' || s, p_autor);
    when 'termos_gerados' then
      v_cols := 'id, tipo, movimentacao_ids, ativo_ids, colaborador, dados, arquivo_path, gerado_por';
      v_vals := format('%L, %L, %L, %L, %L, %L, %L, %L', substr(s,1,8) || '-' || substr(s,9,4) || '-' || substr(s,13,4) || '-' || substr(s,17,4) || '-' || substr(s,21,12), case when p_var = 'ids' then 'responsabilidade_desktop' else 'responsabilidade_notebook' end,
                       case when p_var = 'ids' then '{' || (p_fx->>'movimentacoes') || '}' else '{}' end,
                       case when p_var = 'ids' then '{' || (p_fx->>'ativos') || '}' else '{}' end,
                       'Fulano N', '{}', substr(s,1,8) || '-' || substr(s,9,4) || '-' || substr(s,13,4) || '-' || substr(s,17,4) || '-' || substr(s,21,12) || '.docx', p_autor);
    when 'colaboradores' then
      v_cols := 'nome, filial_id, criado_por';
      v_vals := format('%L, %L, %L', 'Fulano N ' || s, p_fx->>'filiais', p_autor);
    when 'itens' then
      v_cols := 'nome, grupo, tipo_id';
      v_vals := format('%L, %L, %L', 'Item N ' || s, 'acessorio', p_fx->>'tipos_item');
    when 'tipos_item' then
      v_cols := 'slug, rotulo';
      v_vals := format('%L, %L', 'n_' || left(s, 8), 'Tipo N ' || left(s, 8));
    when 'motivos' then
      v_cols := 'codigo, rotulo, aplica_a';
      v_vals := format('%L, %L, %L', 'n-' || s, 'Motivo N ' || s, '{saida}');
    when 'kits_modelos' then
      v_cols := 'nome, payload, criado_por';
      v_vals := format('%L, %L, %L', 'Kit N ' || s,
                       case when p_var = 'motivo'
                            then jsonb_build_object('tipo', 'saida', 'motivo', p_fx->>'motivos')::text
                            else '{}' end,
                       p_autor);
    when 'senhas_acesso' then
      v_cols := 'rotulo, hash, criado_por';
      v_vals := format('%L, %L, %L', 'Senha N ' || s, 'hash-ficticio', p_autor);
    when 'eventos_admin' then
      v_cols := 'acao';
      v_vals := format('%L', 'n-fixture-' || s);
    when 'import_logs' then
      v_cols := 'filial_id, modo, arquivo_hash, total_linhas, ativos_criados, movs_apagadas, anotacoes_apagadas, termos_apagados, backup_path, criado_por';
      v_vals := format('%L, %L, %L, 0, 0, 0, 0, 0, %L, %L', p_fx->>'filiais', 'substituir', 'n-' || s, 'n/' || s, p_autor);
    when 'relatorios_gerados' then
      v_cols := 'periodo_de, periodo_ate, filial_id, dados, gerado_por';
      v_vals := format('%L, %L, %L, %L, %L', current_date - 400 - (ascii(left(s, 1)) % 9), current_date - 399 - (ascii(left(s, 1)) % 9),
                       p_fx->>'filiais', '{}', p_autor);
    when 'import_prefixos_patrimonio' then
      v_cols := 'prefixo';
      v_vals := format('%L', 'ZZN');
    when 'import_termos_categoria' then
      v_cols := 'termo, categoria';
      v_vals := format('%L, %L', 'n termo ' || s, 'notebook');
    when 'import_termos_estado' then
      v_cols := 'termo, estado';
      v_vals := format('%L, %L', 'n termo ' || s, 'em_estoque');
    when 'unidades_apelidos' then
      v_cols := 'filial_id, apelido';
      v_vals := format('%L, %L', p_fx->>'filiais', 'n apelido ' || s);
    when 'filiais' then
      v_cols := 'nome, slug';
      v_vals := format('%L, %L', 'Filial N ' || s, 'n-' || s);
    else
      raise exception 'pg_temp.ins: tabela % fora das 20 de negócio', p_tab;
  end case;
  return format('insert into public.%I (%s%s) values (%s%s)', p_tab, v_cols,
                case when p_emp is not null then ', empresa_id' else '' end, v_vals,
                case when p_emp is not null then ', ' || quote_literal(p_emp::text) else '' end);
end;
$fn$;

-- O inventário das linhas NOVAS por tabela-alvo: `vistas` guarda o que já existia; `res` guarda, por chamada e por
-- tabela, quantas linhas nasceram e quantas nasceram com empresa DIFERENTE da esperada.
create temp table vistas (tab text, id uuid, primary key (tab, id));
create temp table res (lado text, fn text, tab text, status text, novas bigint, erradas bigint);

create or replace function pg_temp.snap() returns void language plpgsql as $fn$
declare
  t text;
begin
  foreach t in array array['ativos', 'movimentacoes', 'lancamentos_item', 'pendencias_item', 'anotacoes', 'import_logs'] loop
    execute format('insert into pg_temp.vistas select %L, id from public.%I on conflict do nothing', t, t);
  end loop;
end;
$fn$;

create or replace function pg_temp.medir(p_lado text, p_fn text, p_status text, p_emp uuid) returns void
language plpgsql as $fn$
declare
  t text;
  n bigint;
  e bigint;
begin
  foreach t in array array['ativos', 'movimentacoes', 'lancamentos_item', 'pendencias_item', 'anotacoes', 'import_logs'] loop
    execute format('select count(*), count(*) filter (where empresa_id is distinct from %L) from public.%I x
                     where not exists (select 1 from pg_temp.vistas v where v.tab = %L and v.id = x.id)', p_emp, t, t)
      into n, e;
    insert into pg_temp.res values (p_lado, p_fn, t, p_status, n, e);
  end loop;
  perform pg_temp.snap();
  if p_status not like 'ok:%' then
    raise notice 'chamada %/%: %', p_lado, p_fn, p_status;
  end if;
end;
$fn$;

-- UM passo da bateria: absorve o preparo (INSERTs como postgres), chama COMO a pessoa e mede as linhas novas.
create or replace function pg_temp.passo(p_lado text, p_fn text, p_uid uuid, p_sql text, p_emp uuid) returns void
language plpgsql as $fn$
begin
  perform pg_temp.snap();
  perform pg_temp.medir(p_lado, p_fn, pg_temp.como(p_uid, p_sql), p_emp);
end;
$fn$;

-- Lidas pelas asserções: ruins = linhas da empresa errada + a chamada recusada + nenhuma linha nova (universo vazio da
-- chamada); universo = as linhas novas + 2 (nunca zero, e nunca menor que os ruins). p_tab nulo = todas as tabelas.
create or replace function pg_temp.ru(p_lado text, p_fn text, p_tab text default null) returns bigint
language sql as $fn$
  select coalesce(sum(erradas), 0)
       + (case when coalesce(bool_and(status like 'ok:%'), false) then 0 else 1 end)
       + (case when coalesce(sum(novas), 0) = 0 then 1 else 0 end)
    from pg_temp.res where lado = p_lado and fn = p_fn and (p_tab is null or tab = p_tab)
$fn$;
create or replace function pg_temp.un(p_lado text, p_fn text, p_tab text default null) returns bigint
language sql as $fn$
  select coalesce(sum(novas), 0) + 2 from pg_temp.res where lado = p_lado and fn = p_fn and (p_tab is null or tab = p_tab)
$fn$;

-- A BATERIA: as 17 funções, em ordem, chamadas por membros da empresa p_emp (operador vinculado às duas filiais; admin
-- para o import). p_fx = o acervo mínimo (pg_temp.f65_plantar); p_f2 = a 2ª filial (transferência); p_f3 = a 3ª, vazia (import).
create or replace function pg_temp.bateria(p_lado text, p_emp uuid, p_op uuid, p_ad uuid, p_fx jsonb,
                                           p_f2 smallint, p_f3 smallint, p_n int) returns void
language plpgsql as $fn$
declare
  v_f1   smallint := (p_fx->>'filiais')::smallint;
  v_item smallint := (p_fx->>'itens')::smallint;
  v_col  uuid     := (p_fx->>'colaboradores')::uuid;
  v_mot  text     := p_fx->>'motivos';
  v_pend uuid     := (p_fx->>'pendencias_item')::uuid;
  v_pre  text     := 'WAP067' || p_n::text;                       -- WAP067<lado><seq 3 dígitos>
  v_x1   uuid;
  v_x2   uuid;
  v_w    uuid;
  v_w2   uuid;
  v_d    uuid;
  v_mov  uuid;
  v_lanc uuid;
  v_nome text;
  v_plano jsonb;
  v_bk   text;
begin
  -- 1) criar_compra_lote: dois ativos novos (um SEM service tag, para o definir_service_tag) e as duas compras
  perform pg_temp.passo(p_lado, 'criar_compra_lote', p_op,
    format('select * from public.criar_compra_lote(%L::jsonb, %L::uuid)',
      jsonb_build_array(
        jsonb_build_object('patrimonio', v_pre || '001', 'categoria', 'notebook', 'filial_id', v_f1,
                           'data', current_date, 'observacao', 'compra fictícia da F67C'),
        jsonb_build_object('patrimonio', v_pre || '002', 'service_tag', 'ZZE67ST' || p_n, 'categoria', 'notebook',
                           'filial_id', v_f1))::text, p_op), p_emp);
  select a.id into v_x1 from public.ativos a where a.patrimonio = v_pre || '001' and a.filial_id = v_f1;
  select a.id into v_x2 from public.ativos a where a.patrimonio = v_pre || '002' and a.filial_id = v_f1;

  -- 2–6) as cinco de anotação
  perform pg_temp.passo(p_lado, 'corrigir_patrimonio_com_anotacao', p_op,
    format('select public.corrigir_patrimonio_com_anotacao(%L, %L, %L, %L, %L)', v_x2, v_pre || '022', null, false, 'corrigido (F67C)'), p_emp);
  perform pg_temp.passo(p_lado, 'definir_service_tag_com_anotacao', p_op,
    format('select public.definir_service_tag_com_anotacao(%L, %L, %L, %L, %L)', v_x1, 'ZZE67NEW' || p_n, null, false, 'tag definida (F67C)'), p_emp);
  perform pg_temp.passo(p_lado, 'confirmar_assinatura_termo_com_anotacao', p_op,
    format('select public.confirmar_assinatura_termo_com_anotacao(%L, current_date, %L)', v_x1, 'assinado (F67C)'), p_emp);
  perform pg_temp.passo(p_lado, 'desfazer_confirmacao_termo_com_anotacao', p_op,
    format('select public.desfazer_confirmacao_termo_com_anotacao(%L, %L, %L)', v_x1, 'nao', 'desfeito (F67C)'), p_emp);
  perform pg_temp.passo(p_lado, 'confirmar_assinatura_lote_com_anotacoes', p_op,
    format('select * from public.confirmar_assinatura_lote_com_anotacoes(%L::uuid[], current_date, %L)',
           array[v_x1, v_x2]::text, 'lote assinado (F67C)'), p_emp);

  -- 7) lancar_itens_lote: uma entrada e uma saída com a pessoa (dá saldo em aberto ao colaborador)
  perform pg_temp.passo(p_lado, 'lancar_itens_lote', p_op,
    format('select public.lancar_itens_lote(%L::jsonb, %L::uuid)',
      jsonb_build_array(
        jsonb_build_object('item_id', v_item, 'filial_id', v_f1, 'tipo', 'entrada', 'quantidade', 2, 'data', current_date),
        jsonb_build_object('item_id', v_item, 'filial_id', v_f1, 'tipo', 'saida', 'quantidade', 1, 'data', current_date,
                           'colaborador', 'Fulano F67C', 'colaborador_id', v_col))::text, p_op), p_emp);

  -- 8) criar_movimentacao_com_itens: uma saída de equipamento com um item junto (movimentação + lançamento)
  insert into public.ativos (empresa_id, patrimonio, categoria, filial_id, origem)
  values (p_emp, v_pre || '003', 'notebook', v_f1, 'cadastro') returning id into v_w2;
  insert into public.movimentacoes (empresa_id, ativo_id, tipo, data, filial_id, criado_por)
  values (p_emp, v_w2, 'compra', current_date, v_f1, p_ad);
  perform pg_temp.passo(p_lado, 'criar_movimentacao_com_itens', p_op,
    format('select public.criar_movimentacao_com_itens(%L::jsonb, %L::jsonb, %L::uuid)',
      jsonb_build_array(jsonb_build_object('ativo_id', v_w2, 'tipo', 'saida', 'motivo', v_mot, 'data', current_date,
                                           'colaborador', 'Fulano F67C', 'colaborador_id', v_col))::text,
      jsonb_build_array(jsonb_build_object('indice_movimentacao', 0, 'item_id', v_item, 'tipo', 'saida', 'quantidade', 1,
                                           'data', current_date, 'colaborador', 'Fulano F67C', 'colaborador_id', v_col))::text,
      p_op), p_emp);

  -- 9) estornar_movimentacao_com_itens: estorna essa saída, com o inverso do item
  select m.id into v_mov from public.movimentacoes m where m.ativo_id = v_w2 and m.tipo = 'saida';
  select l.id into v_lanc from public.lancamentos_item l where l.movimentacao_id = v_mov and l.estorna_id is null;
  perform pg_temp.passo(p_lado, 'estornar_movimentacao_com_itens', p_op,
    format('select public.estornar_movimentacao_com_itens(%L::uuid, %L, %L::jsonb, %L::uuid)', v_mov, 'estorno (F67C)',
      jsonb_build_array(jsonb_build_object('estorna_id', v_lanc, 'item_id', v_item, 'filial_id', v_f1, 'tipo', 'retorno',
                                           'quantidade', 1, 'colaborador', 'Fulano F67C', 'colaborador_id', v_col,
                                           'observacao', 'inverso (F67C)'))::text, p_op), p_emp);

  -- 10) devolver_ao_fornecedor: ativo em manutenção, devolvido COM substituto (ativo novo + troca)
  insert into public.ativos (empresa_id, patrimonio, categoria, filial_id, fornecedor)
  values (p_emp, v_pre || '004', 'notebook', v_f1, 'Fornecedor Fictício') returning id into v_d;
  insert into public.movimentacoes (empresa_id, ativo_id, tipo, data, filial_id, criado_por)
  values (p_emp, v_d, 'compra', current_date, v_f1, p_ad);
  insert into public.movimentacoes (empresa_id, ativo_id, tipo, data, filial_id, chamado_fornecedor, criado_por)
  values (p_emp, v_d, 'envio_manutencao', current_date, v_f1, 'OS-F67C-' || p_n, p_ad);
  perform pg_temp.passo(p_lado, 'devolver_ao_fornecedor', p_op,
    format('select * from public.devolver_ao_fornecedor(%L::uuid, %L::jsonb, %L::jsonb, %L::uuid)', v_d,
      jsonb_build_object('chamado_fornecedor', 'OS-F67C-' || p_n, 'observacao', 'sem conserto (F67C)')::text,
      jsonb_build_object('patrimonio', v_pre || '005', 'service_tag', 'ZZE67SUB' || p_n, 'categoria', 'notebook',
                         'filial_id', v_f1)::text, p_op), p_emp);

  -- 11) movimentacao_abrir_pendencias_item: uma DEVOLUÇÃO com itens_faltantes (a função roda pelo gatilho da movimentação)
  insert into public.ativos (empresa_id, patrimonio, categoria, filial_id, origem)
  values (p_emp, v_pre || '006', 'notebook', v_f1, 'cadastro') returning id into v_w;
  insert into public.movimentacoes (empresa_id, ativo_id, tipo, data, filial_id, criado_por)
  values (p_emp, v_w, 'compra', current_date, v_f1, p_ad);
  insert into public.movimentacoes (empresa_id, ativo_id, tipo, motivo, data, filial_id, colaborador, colaborador_id, criado_por)
  values (p_emp, v_w, 'saida', v_mot, current_date, v_f1, 'Fulano F67C', v_col, p_ad);
  perform pg_temp.passo(p_lado, 'movimentacao_abrir_pendencias_item', p_op,
    format('select public.criar_movimentacao_com_itens(%L::jsonb, %L::jsonb, %L::uuid)',
      jsonb_build_array(jsonb_build_object('ativo_id', v_w, 'tipo', 'devolucao', 'data', current_date,
                                           'colaborador', 'Fulano F67C', 'colaborador_id', v_col,
                                           'itens_faltantes', jsonb_build_array('Carregador fictício F67C')))::text,
      '[]', p_op), p_emp);

  -- 12) resolver_pendencias_item_com_lancamentos: a pendência do acervo mínimo, recuperada com o item de volta
  perform pg_temp.passo(p_lado, 'resolver_pendencias_item_com_lancamentos', p_op,
    format('select public.resolver_pendencias_item_com_lancamentos(%L::uuid[], %L, %L, %L::jsonb, %L::uuid)',
      array[v_pend]::text, 'recuperado', 'achado (F67C)',
      jsonb_build_array(jsonb_build_object('pendencia_id', v_pend, 'item_id', v_item, 'filial_id', v_f1, 'quantidade', 1,
                                           'data', current_date, 'colaborador', 'Fulano F67C', 'colaborador_id', v_col,
                                           'observacao_retorno', 'devolvido (F67C)'))::text, p_op), p_emp);

  -- 13) reabrir_pendencias_item_com_estornos: reabre essa pendência com o inverso do retorno
  select l.id into v_lanc from public.lancamentos_item l
   where l.pendencia_item_id = v_pend and l.tipo::text = 'retorno' and l.estorna_id is null;
  -- (reabrir é do ADMIN desde a 0103: o operador não atualiza a pendência resolvida)
  perform pg_temp.passo(p_lado, 'reabrir_pendencias_item_com_estornos', p_ad,
    format('select public.reabrir_pendencias_item_com_estornos(%L::uuid[], %L, %L::jsonb, %L::uuid)',
      array[v_pend]::text, 'reaberta (F67C)',
      jsonb_build_array(jsonb_build_object('estorna_id', v_lanc, 'pendencia_id', v_pend, 'item_id', v_item, 'filial_id', v_f1,
                                           'tipo', 'saida', 'quantidade', 1, 'colaborador_id', v_col,
                                           'observacao', 'estorno da reabertura (F67C)'))::text, p_ad), p_emp);

  -- 14) transferir_item: da filial 1 para a 2 (as duas da MESMA empresa)
  perform pg_temp.passo(p_lado, 'transferir_item', p_op,
    format('select public.transferir_item(%L::smallint, %L::smallint, %L::jsonb, current_date, null, %L, %L, %L::uuid)',
      v_f1, p_f2, jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantidade', 1))::text,
      'Transferência para a 2ª filial (F67C)', 'Transferência da 1ª filial (F67C)', p_op), p_emp);

  -- 15–17) o import: importar_ativos_substituir numa filial NOVA e vazia, como o admin da empresa
  --        (import_criar_ativos, import_lancar_movimentacoes e import_gravar_trilha por dentro)
  select f.nome into v_nome from public.filiais f where f.id = p_f3;
  v_bk := public.prefixo_backup_import(p_emp, p_f3) || 'existe.json';
  insert into storage.objects (bucket_id, name, owner) values ('backups-import', v_bk, p_ad);
  v_plano := jsonb_build_object('filialId', p_f3, 'confirmacao', v_nome, 'arquivoHash', 'ZZE67HASH' || p_lado,
    'totalLinhasDados', 2,
    'ativos', jsonb_build_array(
      jsonb_build_object('patrimonio', v_pre || '007', 'serviceTag', 'ZZE67IM1' || p_n, 'categoria', 'notebook',
                         'estadoAlvo', 'em_uso', 'colaborador', 'Fulano Importado', 'setor', 'TI'),
      jsonb_build_object('patrimonio', v_pre || '008', 'serviceTag', 'ZZE67IM2' || p_n, 'categoria', 'notebook',
                         'estadoAlvo', 'em_estoque')));
  perform pg_temp.passo(p_lado, 'importar_ativos_substituir', p_ad,
    format('select public.importar_ativos_substituir(%L::uuid, %L::jsonb, %L, %L::jsonb)', p_emp, v_plano::text, v_bk,
           '{"ativos":0,"movimentacoes":0,"anotacoes":0,"termos":0}'), p_emp);
end;
$fn$;

do $$
declare
  v_ok     int := 0;   -- quantas asserções passaram
  v_falhas int := 0;   -- quantas falharam (a linha FIM soma as duas)

  k_op_a   uuid := '00000000-f67c-4000-8000-0000000000a1';  -- operador SÓ da A, vinculado às duas filiais da A
  k_ad_a   uuid := '00000000-f67c-4000-8000-0000000000a2';  -- admin SÓ da A
  k_op_b   uuid := '00000000-f67c-4000-8000-0000000000b1';  -- operador SÓ da B, vinculado às duas filiais da B
  k_ad_b   uuid := '00000000-f67c-4000-8000-0000000000b2';  -- admin SÓ da B
  k_ad_ab  uuid := '00000000-f67c-4000-8000-0000000000c1';  -- admin das DUAS (a plataforma é o caso real)
  k_plat   uuid := '00000000-f67c-4000-8000-0000000000d1';  -- dev + plataforma (a ferramenta de órfão)

  v_emp_a  uuid;
  v_emp_b  uuid;
  v_fx_a   jsonb;
  v_fx_b   jsonb;
  v_f2a    smallint;
  v_f3a    smallint;
  v_f2b    smallint;
  v_f3b    smallint;
  v_s      text;
  v_s2     text;
  v_n      bigint;
  v_n2     bigint;
  v_u      bigint;
  v_t      text;
  v_tabs   text[];
  v_pol    text[];
  v_sem    text[];
  v_pai    text[] := array['ativos', 'movimentacoes', 'pendencias_item', 'lancamentos_item', 'anotacoes', 'colaboradores',
                           'relatorios_gerados', 'unidades_apelidos', 'import_logs'];
  k_neg    text[] := array[
    'anotacoes', 'ativos', 'colaboradores', 'eventos_admin', 'filiais',
    'import_logs', 'import_prefixos_patrimonio', 'import_termos_categoria',
    'import_termos_estado', 'itens', 'kits_modelos', 'lancamentos_item',
    'motivos', 'movimentacoes', 'pendencias_item', 'relatorios_gerados',
    'senhas_acesso', 'termos_gerados', 'tipos_item', 'unidades_apelidos'];
  v_raiz1  text := 'orfao/2026-11-16T10-00-00-001Z';
  v_raiz2  text := 'orfao/2026-11-16T10-00-00-002Z';
  v_raiz3  text := 'orfao/2026-11-16T10-00-00-003Z';
  v_lista  text;
  v_esp    text[];
  v_cod    text := 'esc67-mesmo-codigo';
  v_rot_b0 text;
  v_rot_b1 text;
begin
  -- =========================================================================
  -- 0 — o cenário (como `postgres`, antes de trocar de papel)
  -- =========================================================================
  v_emp_a := public.empresa_legada();
  insert into public.empresas (slug, nome) values ('f67c-b', 'Empresa B fictícia da F67C') returning id into v_emp_b;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.email, '', now(), now(), now()
    from (values (k_op_a, 'f67c.op.a@wap.ind.br'), (k_ad_a, 'f67c.admin.a@wap.ind.br'),
                 (k_op_b, 'f67c.op.b@wap.ind.br'), (k_ad_b, 'f67c.admin.b@wap.ind.br'),
                 (k_ad_ab, 'f67c.admin.ab@wap.ind.br'), (k_plat, 'f67c.plataforma@wap.ind.br')) as x (id, email);

  perform pg_temp.plantar_cargo(k_op_a, 'operador');
  perform pg_temp.plantar_cargo(k_ad_a, 'admin');
  perform pg_temp.plantar_cargo(k_ad_ab, 'admin');                       -- admin da A…
  perform pg_temp.plantar_cargo(k_ad_ab, 'admin', true, v_emp_b);        -- …e da B
  perform pg_temp.plantar_cargo(k_plat, 'dev');
  insert into public.plataforma_admins (profile_id) values (k_plat);
  -- os da B: só na B (tira a membership da legada que o handle_new_user plantou)
  delete from public.membros where profile_id in (k_op_b, k_ad_b) and empresa_id = v_emp_a;
  perform pg_temp.plantar_cargo(k_op_b, 'operador', true, v_emp_b);
  perform pg_temp.plantar_cargo(k_ad_b, 'admin', true, v_emp_b);

  -- o acervo mínimo de cada empresa (TODAS as linhas com a empresa POR EXTENSO) e as filiais extras de cada uma
  v_fx_a := pg_temp.f65_plantar(v_emp_a, 'esc67-a', k_ad_a, 'ZZA');
  v_fx_b := pg_temp.f65_plantar(v_emp_b, 'esc67-b', k_ad_b, 'ZZB');
  insert into public.filiais (nome, slug, empresa_id) values ('F67C A 2', 'esc67-a2', v_emp_a) returning id into v_f2a;
  insert into public.filiais (nome, slug, empresa_id) values ('F67C A 3', 'esc67-a3', v_emp_a) returning id into v_f3a;
  insert into public.filiais (nome, slug, empresa_id) values ('F67C B 2', 'esc67-b2', v_emp_b) returning id into v_f2b;
  insert into public.filiais (nome, slug, empresa_id) values ('F67C B 3', 'esc67-b3', v_emp_b) returning id into v_f3b;

  -- os operadores, vinculados às duas primeiras filiais da empresa deles (a 3ª fica para o import, do admin)
  insert into public.operador_filiais (usuario_id, filial_id, empresa_id, membro_id)
  select k_op_a, f, v_emp_a, m.id
    from public.membros m, unnest(array[(v_fx_a->>'filiais')::smallint, v_f2a]) as f
   where m.profile_id = k_op_a and m.empresa_id = v_emp_a;
  insert into public.operador_filiais (usuario_id, filial_id, empresa_id, membro_id)
  select k_op_b, f, v_emp_b, m.id
    from public.membros m, unnest(array[(v_fx_b->>'filiais')::smallint, v_f2b]) as f
   where m.profile_id = k_op_b and m.empresa_id = v_emp_b;

  insert into storage.buckets (id, name, public) values ('termos', 'termos', false), ('backups-import', 'backups-import', false)
  on conflict (id) do nothing;

  -- =========================================================================
  -- E / S — a escrita de cada empresa nasce DELA (a bateria roda nas duas; B = E1–E19, A = S1–S19)
  -- =========================================================================
  perform pg_temp.snap();
  perform pg_temp.bateria('B', v_emp_b, k_op_b, k_ad_b, v_fx_b, v_f2b, v_f3b, 2);
  perform pg_temp.bateria('A', v_emp_a, k_op_a, k_ad_a, v_fx_a, v_f2a, v_f3a, 1);

  -- ---- a B (E1–E19)
  if pg_temp.assert_zero_de('E1 corrigir_patrimonio_com_anotacao (membro da B): a anotação nasce da B',
       pg_temp.ru('B', 'corrigir_patrimonio_com_anotacao'), pg_temp.un('B', 'corrigir_patrimonio_com_anotacao'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('E2 definir_service_tag_com_anotacao (membro da B): a anotação nasce da B',
       pg_temp.ru('B', 'definir_service_tag_com_anotacao'), pg_temp.un('B', 'definir_service_tag_com_anotacao'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('E3 confirmar_assinatura_termo_com_anotacao (membro da B): a anotação nasce da B',
       pg_temp.ru('B', 'confirmar_assinatura_termo_com_anotacao'), pg_temp.un('B', 'confirmar_assinatura_termo_com_anotacao'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('E4 desfazer_confirmacao_termo_com_anotacao (membro da B): a anotação nasce da B',
       pg_temp.ru('B', 'desfazer_confirmacao_termo_com_anotacao'), pg_temp.un('B', 'desfazer_confirmacao_termo_com_anotacao'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('E5 confirmar_assinatura_lote_com_anotacoes (membro da B): as anotações nascem da B',
       pg_temp.ru('B', 'confirmar_assinatura_lote_com_anotacoes'), pg_temp.un('B', 'confirmar_assinatura_lote_com_anotacoes'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('E6 criar_compra_lote (membro da B): ativos e compras nascem da B',
       pg_temp.ru('B', 'criar_compra_lote'), pg_temp.un('B', 'criar_compra_lote'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('E7 devolver_ao_fornecedor (membro da B): a devolução, o substituto e a troca nascem da B',
       pg_temp.ru('B', 'devolver_ao_fornecedor'), pg_temp.un('B', 'devolver_ao_fornecedor'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('E8 criar_movimentacao_com_itens (membro da B): a movimentação e o lançamento de item nascem da B',
       pg_temp.ru('B', 'criar_movimentacao_com_itens'), pg_temp.un('B', 'criar_movimentacao_com_itens'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('E9 estornar_movimentacao_com_itens (membro da B): o estorno e o inverso do item nascem da B',
       pg_temp.ru('B', 'estornar_movimentacao_com_itens'), pg_temp.un('B', 'estornar_movimentacao_com_itens'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('E10 movimentacao_abrir_pendencias_item (devolução com itens faltantes, membro da B): a pendência nasce da B',
       pg_temp.ru('B', 'movimentacao_abrir_pendencias_item', 'pendencias_item'),
       pg_temp.un('B', 'movimentacao_abrir_pendencias_item', 'pendencias_item'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('E11 lancar_itens_lote (membro da B): os lançamentos de item nascem da B',
       pg_temp.ru('B', 'lancar_itens_lote'), pg_temp.un('B', 'lancar_itens_lote'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('E12 reabrir_pendencias_item_com_estornos (membro da B): o inverso nasce da B',
       pg_temp.ru('B', 'reabrir_pendencias_item_com_estornos'), pg_temp.un('B', 'reabrir_pendencias_item_com_estornos'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('E13 resolver_pendencias_item_com_lancamentos (membro da B): os lançamentos nascem da B',
       pg_temp.ru('B', 'resolver_pendencias_item_com_lancamentos'), pg_temp.un('B', 'resolver_pendencias_item_com_lancamentos'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('E14 transferir_item (entre duas filiais da B): as duas pernas nascem da B',
       pg_temp.ru('B', 'transferir_item'), pg_temp.un('B', 'transferir_item'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('E15 import_criar_ativos (importar_ativos_substituir, admin da B): os ativos importados nascem da B',
       pg_temp.ru('B', 'importar_ativos_substituir', 'ativos'), pg_temp.un('B', 'importar_ativos_substituir', 'ativos'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('E16 import_lancar_movimentacoes (importar_ativos_substituir, admin da B): as movimentações do import nascem da B',
       pg_temp.ru('B', 'importar_ativos_substituir', 'movimentacoes'), pg_temp.un('B', 'importar_ativos_substituir', 'movimentacoes'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('E17 import_gravar_trilha (importar_ativos_substituir, admin da B): a trilha do import nasce da B',
       pg_temp.ru('B', 'importar_ativos_substituir', 'import_logs'), pg_temp.un('B', 'importar_ativos_substituir', 'import_logs'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  select coalesce(sum(erradas), 0), coalesce(sum(novas), 0) into v_n, v_u from pg_temp.res where lado = 'B';
  if pg_temp.assert_zero_de('E18 nenhuma linha nova da bateria da B (nas seis tabelas-alvo) tem empresa diferente da B', v_n, v_u)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  select count(*) into v_n from (select tab from pg_temp.res where lado = 'B' group by tab having sum(novas) = 0) z;
  if pg_temp.assert_zero_de('E19 cada uma das seis tabelas-alvo recebeu linhas novas na bateria da B (o universo contado)', v_n, 6)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ---- o PAR SIMÉTRICO: a mesma bateria na A grava A (S1–S19)
  if pg_temp.assert_zero_de('S1 corrigir_patrimonio_com_anotacao (membro da A): a anotação nasce da A',
       pg_temp.ru('A', 'corrigir_patrimonio_com_anotacao'), pg_temp.un('A', 'corrigir_patrimonio_com_anotacao'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('S2 definir_service_tag_com_anotacao (membro da A): a anotação nasce da A',
       pg_temp.ru('A', 'definir_service_tag_com_anotacao'), pg_temp.un('A', 'definir_service_tag_com_anotacao'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('S3 confirmar_assinatura_termo_com_anotacao (membro da A): a anotação nasce da A',
       pg_temp.ru('A', 'confirmar_assinatura_termo_com_anotacao'), pg_temp.un('A', 'confirmar_assinatura_termo_com_anotacao'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('S4 desfazer_confirmacao_termo_com_anotacao (membro da A): a anotação nasce da A',
       pg_temp.ru('A', 'desfazer_confirmacao_termo_com_anotacao'), pg_temp.un('A', 'desfazer_confirmacao_termo_com_anotacao'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('S5 confirmar_assinatura_lote_com_anotacoes (membro da A): as anotações nascem da A',
       pg_temp.ru('A', 'confirmar_assinatura_lote_com_anotacoes'), pg_temp.un('A', 'confirmar_assinatura_lote_com_anotacoes'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('S6 criar_compra_lote (membro da A): ativos e compras nascem da A',
       pg_temp.ru('A', 'criar_compra_lote'), pg_temp.un('A', 'criar_compra_lote'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('S7 devolver_ao_fornecedor (membro da A): a devolução, o substituto e a troca nascem da A',
       pg_temp.ru('A', 'devolver_ao_fornecedor'), pg_temp.un('A', 'devolver_ao_fornecedor'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('S8 criar_movimentacao_com_itens (membro da A): a movimentação e o lançamento de item nascem da A',
       pg_temp.ru('A', 'criar_movimentacao_com_itens'), pg_temp.un('A', 'criar_movimentacao_com_itens'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('S9 estornar_movimentacao_com_itens (membro da A): o estorno e o inverso do item nascem da A',
       pg_temp.ru('A', 'estornar_movimentacao_com_itens'), pg_temp.un('A', 'estornar_movimentacao_com_itens'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('S10 movimentacao_abrir_pendencias_item (devolução com itens faltantes, membro da A): a pendência nasce da A',
       pg_temp.ru('A', 'movimentacao_abrir_pendencias_item', 'pendencias_item'),
       pg_temp.un('A', 'movimentacao_abrir_pendencias_item', 'pendencias_item'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('S11 lancar_itens_lote (membro da A): os lançamentos de item nascem da A',
       pg_temp.ru('A', 'lancar_itens_lote'), pg_temp.un('A', 'lancar_itens_lote'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('S12 reabrir_pendencias_item_com_estornos (membro da A): o inverso nasce da A',
       pg_temp.ru('A', 'reabrir_pendencias_item_com_estornos'), pg_temp.un('A', 'reabrir_pendencias_item_com_estornos'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('S13 resolver_pendencias_item_com_lancamentos (membro da A): os lançamentos nascem da A',
       pg_temp.ru('A', 'resolver_pendencias_item_com_lancamentos'), pg_temp.un('A', 'resolver_pendencias_item_com_lancamentos'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('S14 transferir_item (entre duas filiais da A): as duas pernas nascem da A',
       pg_temp.ru('A', 'transferir_item'), pg_temp.un('A', 'transferir_item'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('S15 import_criar_ativos (importar_ativos_substituir, admin da A): os ativos importados nascem da A',
       pg_temp.ru('A', 'importar_ativos_substituir', 'ativos'), pg_temp.un('A', 'importar_ativos_substituir', 'ativos'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('S16 import_lancar_movimentacoes (importar_ativos_substituir, admin da A): as movimentações do import nascem da A',
       pg_temp.ru('A', 'importar_ativos_substituir', 'movimentacoes'), pg_temp.un('A', 'importar_ativos_substituir', 'movimentacoes'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('S17 import_gravar_trilha (importar_ativos_substituir, admin da A): a trilha do import nasce da A',
       pg_temp.ru('A', 'importar_ativos_substituir', 'import_logs'), pg_temp.un('A', 'importar_ativos_substituir', 'import_logs'))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  select coalesce(sum(erradas), 0), coalesce(sum(novas), 0) into v_n, v_u from pg_temp.res where lado = 'A';
  if pg_temp.assert_zero_de('S18 nenhuma linha nova da bateria da A (nas seis tabelas-alvo) tem empresa diferente da A', v_n, v_u)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  select count(*) into v_n from (select tab from pg_temp.res where lado = 'A' group by tab having sum(novas) = 0) z;
  if pg_temp.assert_zero_de('S19 cada uma das seis tabelas-alvo recebeu linhas novas na bateria da A (o universo contado)', v_n, 6)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- =========================================================================
  -- R — registrar_limpeza_termos_sem_linha(p_empresa, …): a trilha leva a empresa DADA
  -- =========================================================================
  -- um .docx sem linha, com mais de 1 hora (a ferramenta só lista o que já passou da janela de gravação)
  insert into storage.objects (bucket_id, name, owner) values ('termos', 'esc67-' || gen_random_uuid() || '.docx', k_ad_a);
  update storage.objects set created_at = now() - interval '2 hours'
   where bucket_id = 'termos' and name like 'esc67-%.docx';
  v_esp := array(select o.name from storage.objects o
                  where o.bucket_id = 'termos' and o.created_at < now() - interval '1 hour'
                    and not exists (select 1 from public.termos_gerados t where t.arquivo_path = o.name)
                  order by o.name);
  v_lista := format('LIMPAR %s ARQUIVOS DE TERMO', cardinality(v_esp));

  -- R1: a assinatura ANTIGA não existe (só a de quatro argumentos)
  if pg_temp.assert_zero_de('R1 a assinatura antiga registrar_limpeza_termos_sem_linha(text,text,text) NÃO existe; a nova (uuid,text,text,text) existe',
       (case when to_regprocedure('public.registrar_limpeza_termos_sem_linha(text,text,text)') is null then 0 else 1 end)
       + (case when to_regprocedure('public.registrar_limpeza_termos_sem_linha(uuid,text,text,text)') is not null then 0 else 1 end), 2)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- R2: a plataforma chama com a empresa B → a trilha nasce da B (e com a A → da A); o universo contado
  v_s  := pg_temp.como(k_plat, format('select public.registrar_limpeza_termos_sem_linha(%L::uuid, %L, %L, %L)',
                                      v_emp_b, v_raiz1, v_lista, 'justificativa fictícia da F67C'));
  v_s2 := pg_temp.como(k_plat, format('select public.registrar_limpeza_termos_sem_linha(%L::uuid, %L, %L, %L)',
                                      v_emp_a, v_raiz2, v_lista, 'justificativa fictícia da F67C'));
  select count(*) into v_u from public.eventos_admin e
   where e.acao = 'termos_sem_linha_limpos' and e.detalhe->>'raiz' in (v_raiz1, v_raiz2);
  select count(*) into v_n from public.eventos_admin e
   where e.acao = 'termos_sem_linha_limpos'
     and ((e.detalhe->>'raiz' = v_raiz1 and e.empresa_id is distinct from v_emp_b)
       or (e.detalhe->>'raiz' = v_raiz2 and e.empresa_id is distinct from v_emp_a));
  if pg_temp.assert_zero_de('R2 a trilha da limpeza de termos nasce com a empresa DADA (B na primeira chamada, A na segunda), as duas chamadas aceitas',
       v_n + (case when v_s like 'ok:%' then 0 else 1 end) + (case when v_s2 like 'ok:%' then 0 else 1 end)
         + (case when v_u = 2 then 0 else 1 end), greatest(v_u, 2) + 2)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- R3: empresa NULA é recusada (42501) — a MESMA chamada, só sem a empresa, enquanto com ela passa (par)
  v_s := pg_temp.como(k_plat, format('select public.registrar_limpeza_termos_sem_linha(%L::uuid, %L, %L, %L)',
                                     null, v_raiz3, v_lista, 'justificativa fictícia da F67C'));
  select count(*) into v_n from public.eventos_admin e where e.acao = 'termos_sem_linha_limpos' and e.detalhe->>'raiz' = v_raiz3;
  if pg_temp.assert_zero_de('R3 a ferramenta de órfão com empresa nula é recusada (42501) e não deixa trilha',
       (case when pg_temp.estado(v_s) = '42501' then 0 else 1 end) + v_n, 2)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- =========================================================================
  -- N — um INSERT SEM a coluna é recusado nas 20 tabelas de negócio
  -- =========================================================================
  -- (o fixture é o da A; o INSERT é como postgres, em subtransação desfeita)
  v_n := 0; v_n2 := 0; v_u := 0; v_s := '';
  foreach v_t in array k_neg loop
    v_u := v_u + 1;
    -- a forma SEM ids (termos_gerados) e SEM motivo (kits_modelos): os gatilhos BEFORE não entram, o NOT NULL fala (23502)
    if pg_temp.estado(pg_temp.como(null, pg_temp.ins(v_t, v_fx_a, null, k_ad_a), true)) <> '23502' then
      v_n := v_n + 1;
      v_s := v_s || v_t || ',';
    end if;
    -- o par COM a coluna passa (a recusa acima é da FALTA, não de outro defeito do INSERT)
    if pg_temp.estado(pg_temp.como(null, pg_temp.ins(v_t, v_fx_a, v_emp_a, k_ad_a), true)) <> 'ok' then
      v_n2 := v_n2 + 1;
      v_s := v_s || v_t || '(par),';
    end if;
  end loop;
  if v_n + v_n2 > 0 then raise notice 'N: fora do esperado: %', v_s; end if;
  if pg_temp.assert_zero_de('N1 o INSERT sem empresa_id é recusado com 23502 nas 20 tabelas de negócio (as formas sem ids e sem motivo)', v_n, v_u)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('N2 o par: o MESMO INSERT, com a empresa, é aceito nas 20 tabelas (a recusa de N1 é da falta da coluna)', v_n2, v_u)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- os dois casos medidos: o gatilho BEFORE lê new.empresa_id antes do NOT NULL → 23503, não 23502
  v_s  := pg_temp.como(null, pg_temp.ins('termos_gerados', v_fx_a, null, k_ad_a, 'ids'), true);
  v_s2 := pg_temp.como(null, pg_temp.ins('kits_modelos', v_fx_a, null, k_ad_a, 'motivo'), true);
  if pg_temp.assert_zero_de('N3 termos_gerados COM ids e sem a empresa dá 23503 (o gatilho termo_da_empresa fala antes do NOT NULL)',
       (case when pg_temp.estado(v_s) = '23503' then 0 else 1 end), 1)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('N4 kits_modelos COM motivo e sem a empresa dá 23503 (o gatilho kit_motivo_da_empresa fala antes do NOT NULL)',
       (case when pg_temp.estado(v_s2) = '23503' then 0 else 1 end), 1)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_s  := pg_temp.como(null, pg_temp.ins('termos_gerados', v_fx_a, v_emp_a, k_ad_a, 'ids'), true);
  v_s2 := pg_temp.como(null, pg_temp.ins('kits_modelos', v_fx_a, v_emp_a, k_ad_a, 'motivo'), true);
  if pg_temp.assert_zero_de('N5 o par dos dois: com a empresa DA A e os mesmos ids/motivo, termos_gerados e kits_modelos são aceitos',
       (case when pg_temp.estado(v_s) = 'ok' then 0 else 1 end) + (case when pg_temp.estado(v_s2) = 'ok' then 0 else 1 end), 2)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- =========================================================================
  -- X — o INSERT com a empresa de OUTRA
  -- =========================================================================
  -- X1 (onde há pai): empresa A com o pai da B → a FK composta recusa (23503); o par (empresa B, pai da B) é aceito
  v_n := 0; v_n2 := 0; v_u := 0; v_s := '';
  foreach v_t in array v_pai loop
    v_u := v_u + 1;
    if pg_temp.estado(pg_temp.como(null, pg_temp.ins(v_t, v_fx_b, v_emp_a, k_ad_b), true)) <> '23503' then
      v_n := v_n + 1; v_s := v_s || v_t || ',';
    end if;
    if pg_temp.estado(pg_temp.como(null, pg_temp.ins(v_t, v_fx_b, v_emp_b, k_ad_b), true)) <> 'ok' then
      v_n2 := v_n2 + 1; v_s := v_s || v_t || '(par),';
    end if;
  end loop;
  if v_n + v_n2 > 0 then raise notice 'X1: fora do esperado: %', v_s; end if;
  if pg_temp.assert_zero_de('X1 empresa A com o pai (filial/ativo/movimentação) da B é recusada pela FK composta (23503) nas tabelas com pai', v_n, v_u)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('X2 o par de X1: empresa B com o pai da B é aceita nas mesmas tabelas', v_n2, v_u)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- as que têm policy de INSERT para `authenticated` e as que NÃO têm (do catálogo)
  select coalesce(array_agg(distinct p.tablename::text order by p.tablename::text), '{}') into v_pol
    from pg_policies p
   where p.schemaname = 'public' and p.tablename = any (k_neg) and p.cmd in ('INSERT', 'ALL')
     and (p.roles @> array['authenticated']::name[] or p.roles @> array['public']::name[]);
  select coalesce(array_agg(t order by t), '{}') into v_sem from unnest(k_neg) t where not (t = any (v_pol));
  raise notice 'X: com policy de INSERT %; sem %', v_pol, v_sem;

  -- X3 (policy): o membro SÓ da A (admin) insere com a empresa B → 42501; o par (empresa A, pais da A) passa
  v_n := 0; v_n2 := 0; v_u := 0; v_s := '';
  foreach v_t in array v_pol loop
    v_u := v_u + 1;
    if pg_temp.estado(pg_temp.como(k_ad_a, pg_temp.ins(v_t, v_fx_a, v_emp_b, k_ad_a, case when v_t = 'termos_gerados' then 'ids' else '' end), true)) <> '42501' then
      v_n := v_n + 1; v_s := v_s || v_t || ',';
    end if;
    if pg_temp.estado(pg_temp.como(k_ad_a, pg_temp.ins(v_t, v_fx_a, v_emp_a, k_ad_a, case when v_t = 'termos_gerados' then 'ids' else '' end), true)) <> 'ok' then
      v_n2 := v_n2 + 1; v_s := v_s || v_t || '(par),';
    end if;
  end loop;
  if v_n + v_n2 > 0 then raise notice 'X3: fora do esperado: %', v_s; end if;
  if pg_temp.assert_zero_de('X3 o membro SÓ da A não insere com empresa_id da B (policy, 42501) nas tabelas com policy de escrita', v_n, v_u)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('X4 o par de X3: o mesmo membro insere com a empresa DA A nas mesmas tabelas', v_n2, v_u)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- X5 (sem policy de escrita): `authenticated` não insere em empresa nenhuma (42501), nem na dele
  v_n := 0; v_u := 0; v_s := '';
  foreach v_t in array v_sem loop
    v_u := v_u + 2;
    if pg_temp.estado(pg_temp.como(k_ad_a, pg_temp.ins(v_t, v_fx_a, v_emp_a, k_ad_a), true)) <> '42501' then
      v_n := v_n + 1; v_s := v_s || v_t || '(A),';
    end if;
    if pg_temp.estado(pg_temp.como(k_ad_a, pg_temp.ins(v_t, v_fx_a, v_emp_b, k_ad_a), true)) <> '42501' then
      v_n := v_n + 1; v_s := v_s || v_t || '(B),';
    end if;
    -- e o INSERT como postgres seria aceito (a recusa é da policy, não do dado): o par
    if pg_temp.estado(pg_temp.como(null, pg_temp.ins(v_t, v_fx_a, v_emp_a, k_ad_a), true)) <> 'ok' then
      v_n := v_n + 1; v_s := v_s || v_t || '(par),';
    end if;
  end loop;
  if v_n > 0 then raise notice 'X5: fora do esperado: %', v_s; end if;
  if pg_temp.assert_zero_de('X5 as tabelas sem policy de escrita (senhas_acesso, eventos_admin, import_*) não aceitam insert de authenticated em empresa NENHUMA (42501)',
       v_n, v_u)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- =========================================================================
  -- M — o leitor (b): o update por `codigo` sozinho alcança as DUAS empresas
  -- =========================================================================
  insert into public.motivos (empresa_id, codigo, rotulo, aplica_a)
  values (v_emp_a, v_cod, 'Motivo da A (F67C)', array['saida']::public.tipo_movimentacao[]),
         (v_emp_b, v_cod, 'Motivo da B (F67C)', array['saida']::public.tipo_movimentacao[]);
  select count(*) into v_n from public.motivos where codigo = v_cod;
  if pg_temp.assert_zero_de('M0 o cenário tem dois motivos de MESMO código (um em cada empresa), contados como postgres', abs(v_n - 2), greatest(v_n, 2))
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- o defeito da action: o `update … where codigo` do admin das DUAS alcança as duas linhas (desfeito: o dado fica)
  v_s := pg_temp.como(k_ad_ab, format('update public.motivos set rotulo = %L where codigo = %L', 'Rotulo trocado (F67C)', v_cod), true);
  if pg_temp.assert_zero_de('M1 o update só por codigo, como o admin das duas empresas, alcança 2 linhas (o defeito que a action tinha)',
       (case when v_s = 'ok:2' then 0 else 1 end), 1)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- a forma corrigida: empresa_id + codigo alcança UMA só, e a da B fica intacta (como postgres, depois)
  select rotulo into v_rot_b0 from public.motivos where empresa_id = v_emp_b and codigo = v_cod;
  v_s := pg_temp.como(k_ad_ab, format('update public.motivos set rotulo = %L where empresa_id = %L and codigo = %L',
                                      'Rotulo da A trocado (F67C)', v_emp_a, v_cod));
  select rotulo into v_rot_b1 from public.motivos where empresa_id = v_emp_b and codigo = v_cod;
  if pg_temp.assert_zero_de('M2 o update com empresa_id = A e codigo alcança 1 linha (a forma da action corrigida)',
       (case when v_s = 'ok:1' then 0 else 1 end), 1)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('M3 de volta como postgres, o motivo da B está INTACTO e o da A mudou (a segunda prova)',
       (case when v_rot_b0 is not distinct from v_rot_b1 then 0 else 1 end)
         + (case when (select rotulo from public.motivos where empresa_id = v_emp_a and codigo = v_cod) = 'Rotulo da A trocado (F67C)' then 0 else 1 end), 2)
    then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM escrita_por_empresa: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end
$$;

rollback;
