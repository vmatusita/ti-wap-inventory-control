-- =============================================================
-- colaborador_estorno.sql — v1.71.2 (19/10/2026): o que acontece com o colaborador cadastrado no campo da movimentação
-- quando ela é ESTORNADA, e quando o formulário é ABANDONADO. Diagnóstico POR EXECUÇÃO (B1 da ordem
-- docs/prompts/prompt-reservados-por-categoria-e-colaborador-sem-uso.md; plano em docs/PLAN-v1.71.1-v1.71.2.md §2.1).
--
-- Este roteiro AFIRMA o comportamento de hoje — ele nasce verde, e fica vermelho se alguém mudar o que o estorno faz
-- com a pessoa sem passar por aqui. Três caminhos, com as RPCs reais da movimentação e do estorno (as do app):
--   (i-a) cadastro inline → saída sem item → estorno;
--   (i-b) cadastro inline → saída com 1 item junto → estorno com o inverso (o payload de `planejarEstorno`:
--         `saida` vira `retorno`, mesmo colaborador);
--   (ii)  cadastro inline e o formulário abandonado (o INSERT do clique, e mais nada).
-- O cadastro inline é o INSERT do botão "Cadastrar" (`criarColaboradorInline`), feito com a sessão do OPERADOR sob a
-- RLS (policy de INSERT por `pode_escrever()`); a movimentação e o estorno, como no `f38_itens_com_ativo.sql`, como
-- dono com a sessão simulada — aqui se mede o efeito, não a permissão.
--
-- Depois de cada caminho: `colaboradores.ativo` segue true; o `colaborador_id` da movimentação original; a linha do
-- `estorno` (sem pessoa); o `colaborador_id` do inverso de item; o detentor do ativo restaurado; `rel_saldo_colaborador`;
-- as contagens que a coluna "Registros" lê (o embed por `colaborador_id`); a consulta do campo (o cadastro ATIVO por
-- `nome_chave`, a de `sugestoesDoCampoColaborador`) ainda acha a pessoa; e `v_colaboradores_textos`.
--
-- Dado 100% fictício ("Fulano ZZCE …", patrimônio `ZZCE…`). Rótulos LITERAIS (`✗ ce…`), para o injetor enxergar.
-- ESCREVE — `begin; … rollback;`: nada sobra no banco.
-- =============================================================

begin;

create temp table _ce_resumo (ok int, falhas int, detalhe text);

-- Privilégios de TABELA para o trecho que roda como `authenticated` (o clique do operador e a consulta do campo). No
-- projeto hospedado eles já existem por default privilege; no Postgres do CI, não — e sem eles a resposta seria
-- "permission denied" para a pergunta errada (o molde de f38_itens_com_ativo.sql e papeis_rls.sql).
grant select, insert on public.colaboradores to authenticated;

do $$
declare
  -- identidades fictícias (uuid fixo, hex válido — `ce` marca o roteiro)
  k_admin  uuid := '00000000-00ce-4000-8000-0000000000a1';
  k_oper   uuid := '00000000-00ce-4000-8000-0000000000b2';
  v_f1     smallint;
  v_item   smallint;
  v_a1     uuid;
  v_a2     uuid;
  v_pa     uuid;  -- (i-a)
  v_pb     uuid;  -- (i-b)
  v_pc     uuid;  -- (ii)
  v_mov    uuid;
  v_lanc   uuid;
  v_ret    jsonb;
  v_n      int;
  v_m      int;
  v_k      int;
  v_bool   boolean;
  v_ok     int  := 0;
  v_falhas int  := 0;
  v_msgs   text := '';
begin
  -- =========================================================================
  -- FIXTURES
  -- =========================================================================
  select id into v_f1 from public.filiais where ativo order by id limit 1;
  if v_f1 is null then
    raise warning '✗ ce0 o banco precisa de ao menos uma filial ativa para este roteiro';
    insert into _ce_resumo values (0, 1, 'sem filial ativa');
    return;  -- sem a linha FIM: o runner reprova (o molde de f38_itens_com_ativo.sql)
  end if;

  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (k_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ce.chefia@wap.ind.br', '', now(), now(), now()),
    (k_oper,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ce.operador@wap.ind.br', '', now(), now(), now());
  perform pg_temp.plantar_cargo(k_admin, 'admin');
  perform pg_temp.plantar_cargo(k_oper, 'operador');
  insert into public.operador_filiais (usuario_id, filial_id) values (k_oper, v_f1);

  insert into public.itens (nome, grupo, ordem)
    values ('TESTE CE Item', 'acessorio', 9993) returning id into v_item;
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_item, v_f1, 'entrada', 10, current_date, k_admin);

  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZCE00001', 'notebook', v_f1) returning id into v_a1;
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZCE00002', 'notebook', v_f1) returning id into v_a2;

  -- =========================================================================
  -- OS TRÊS CLIQUES EM "Cadastrar" — com a sessão do operador, sob a RLS
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', k_oper, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.colaboradores (nome, filial_id, criado_por)
    values ('Fulano ZZCE Sem Item', v_f1, k_oper) returning id into v_pa;
  insert into public.colaboradores (nome, filial_id, criado_por)
    values ('Fulano ZZCE Com Item', v_f1, k_oper) returning id into v_pb;
  insert into public.colaboradores (nome, filial_id, criado_por)
    values ('Fulano ZZCE Abandonado', v_f1, k_oper) returning id into v_pc;
  reset role;

  -- =========================================================================
  -- (i-a) saída SEM item → estorno
  -- =========================================================================
  select public.criar_movimentacao_com_itens(
    jsonb_build_array(jsonb_build_object(
      'ativo_id', v_a1, 'tipo', 'saida', 'motivo', 'novo_colaborador', 'data', current_date::text,
      'colaborador', 'Fulano ZZCE Sem Item', 'colaborador_id', v_pa::text)),
    '[]'::jsonb, k_oper) into v_ret;
  v_mov := ((v_ret -> 'movimentacoes') ->> 0)::uuid;
  perform public.estornar_movimentacao_com_itens(v_mov, 'Estorno — roteiro colaborador_estorno', '[]'::jsonb, k_oper);

  if (select ativo from public.colaboradores where id = v_pa) then
    v_ok := v_ok + 1; raise notice '✓ ce1a o cadastro segue ATIVO depois do estorno (nenhum caminho do estorno toca colaboradores)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce1a; '; raise warning '✗ ce1a o estorno mexeu no cadastro (ativo deixou de ser true)';
  end if;

  if (select colaborador_id from public.movimentacoes where id = v_mov) = v_pa then
    v_ok := v_ok + 1; raise notice '✓ ce2a a movimentação ORIGINAL continua com o colaborador_id da pessoa (o acervo é imutável)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce2a; '; raise warning '✗ ce2a a movimentação original perdeu o vínculo com a pessoa';
  end if;

  select count(*), bool_and(e.colaborador is null and e.colaborador_id is null)
    into v_n, v_bool
    from public.movimentacoes e where e.estorno_de = v_mov and e.tipo = 'estorno';
  if v_n = 1 and v_bool then
    v_ok := v_ok + 1; raise notice '✓ ce3a a linha do estorno existe, aponta a original e NÃO tem pessoa (nem texto nem id)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce3a; ';
    raise warning '✗ ce3a esperava 1 linha de estorno sem pessoa; veio % (sem pessoa: %)', v_n, coalesce(v_bool::text, '∅');
  end if;

  if (select status from public.ativos where id = v_a1) = 'em_estoque'
     and (select colaborador_atual from public.ativos where id = v_a1) is null then
    v_ok := v_ok + 1; raise notice '✓ ce5a o ativo voltou a "em estoque" SEM detentor — o detentor restaurado é o de antes da saída';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce5a; ';
    raise warning '✗ ce5a o ativo não voltou ao estado de antes (status %, detentor %)',
      (select status from public.ativos where id = v_a1), coalesce((select colaborador_atual from public.ativos where id = v_a1), '∅');
  end if;

  select count(*) into v_n from public.rel_saldo_colaborador(v_pa);
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ ce6a "Com esta pessoa" (rel_saldo_colaborador) vem vazio';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce6a; '; raise warning '✗ ce6a rel_saldo_colaborador devolveu % linha(s)', v_n;
  end if;

  select count(*) into v_n from public.movimentacoes where colaborador_id = v_pa;
  select count(*) into v_m from public.lancamentos_item where colaborador_id = v_pa;
  if v_n = 1 and v_m = 0 then
    v_ok := v_ok + 1; raise notice '✓ ce7a a coluna "Registros" conta 1 (a movimentação ESTORNADA) — o embed não separa o que foi desfeito';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce7a; ';
    raise warning '✗ ce7a "Registros" esperava 1 movimentação e 0 lançamento; veio % e %', v_n, v_m;
  end if;

  -- =========================================================================
  -- (i-b) saída COM 1 item junto → estorno com o inverso
  -- =========================================================================
  select public.criar_movimentacao_com_itens(
    jsonb_build_array(jsonb_build_object(
      'ativo_id', v_a2, 'tipo', 'saida', 'motivo', 'novo_colaborador', 'data', current_date::text,
      'colaborador', 'Fulano ZZCE Com Item', 'colaborador_id', v_pb::text)),
    jsonb_build_array(jsonb_build_object(
      'indice_movimentacao', 0, 'item_id', v_item, 'tipo', 'saida', 'quantidade', 2, 'data', current_date::text,
      'colaborador', 'Fulano ZZCE Com Item', 'colaborador_id', v_pb::text,
      'observacao_regularizacao', 'Acerto automático — roteiro colaborador_estorno')),
    k_oper) into v_ret;
  v_mov := ((v_ret -> 'movimentacoes') ->> 0)::uuid;
  select id into v_lanc from public.lancamentos_item where movimentacao_id = v_mov and estorna_id is null;
  perform public.estornar_movimentacao_com_itens(
    v_mov, 'Estorno com item — roteiro colaborador_estorno',
    jsonb_build_array(jsonb_build_object(
      'estorna_id', v_lanc::text, 'item_id', v_item, 'filial_id', v_f1, 'tipo', 'retorno', 'quantidade', 2,
      'colaborador', 'Fulano ZZCE Com Item', 'colaborador_id', v_pb::text,
      'observacao', 'Estorno: roteiro colaborador_estorno')),
    k_oper);

  if (select ativo from public.colaboradores where id = v_pb) then
    v_ok := v_ok + 1; raise notice '✓ ce1b o cadastro segue ATIVO depois do estorno com item';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce1b; '; raise warning '✗ ce1b o estorno com item mexeu no cadastro';
  end if;

  if (select colaborador_id from public.movimentacoes where id = v_mov) = v_pb then
    v_ok := v_ok + 1; raise notice '✓ ce2b a movimentação original continua com o colaborador_id da pessoa';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce2b; '; raise warning '✗ ce2b a movimentação original perdeu o vínculo';
  end if;

  select count(*), bool_and(e.colaborador is null and e.colaborador_id is null)
    into v_n, v_bool
    from public.movimentacoes e where e.estorno_de = v_mov and e.tipo = 'estorno';
  if v_n = 1 and v_bool then
    v_ok := v_ok + 1; raise notice '✓ ce3b a linha do estorno existe e não tem pessoa';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce3b; ';
    raise warning '✗ ce3b esperava 1 linha de estorno sem pessoa; veio % (sem pessoa: %)', v_n, coalesce(v_bool::text, '∅');
  end if;

  select count(*), bool_and(i.colaborador_id = v_pb and i.tipo = 'retorno')
    into v_n, v_bool
    from public.lancamentos_item i where i.estorna_id = v_lanc;
  if v_n = 1 and v_bool then
    v_ok := v_ok + 1; raise notice '✓ ce4b o inverso do item (retorno) guarda o colaborador_id da pessoa — ela tinha saldo';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce4b; ';
    raise warning '✗ ce4b esperava 1 inverso "retorno" com o colaborador_id; veio % (com o id: %)', v_n, coalesce(v_bool::text, '∅');
  end if;

  if (select status from public.ativos where id = v_a2) = 'em_estoque'
     and (select colaborador_atual from public.ativos where id = v_a2) is null then
    v_ok := v_ok + 1; raise notice '✓ ce5b o ativo voltou a "em estoque" sem detentor';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce5b; '; raise warning '✗ ce5b o ativo não voltou ao estado de antes';
  end if;

  select count(*) into v_n from public.rel_saldo_colaborador(v_pb);
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ ce6b "Com esta pessoa" vem vazio — o retorno zerou a saída, e o par zerado não volta';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce6b; '; raise warning '✗ ce6b rel_saldo_colaborador devolveu % linha(s)', v_n;
  end if;

  select count(*) into v_n from public.movimentacoes where colaborador_id = v_pb;
  select count(*) into v_m from public.lancamentos_item where colaborador_id = v_pb;
  if v_n = 1 and v_m = 2 then
    v_ok := v_ok + 1; raise notice '✓ ce7b a coluna "Registros" conta 3 (a movimentação estornada, a saída do item e o inverso)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce7b; ';
    raise warning '✗ ce7b "Registros" esperava 1 movimentação e 2 lançamentos; veio % e %', v_n, v_m;
  end if;

  -- =========================================================================
  -- (ii) o formulário abandonado: o clique e mais nada
  -- =========================================================================
  if (select ativo from public.colaboradores where id = v_pc) then
    v_ok := v_ok + 1; raise notice '✓ ce1c o cadastro do formulário abandonado existe e segue ATIVO — nada o desfaz';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce1c; '; raise warning '✗ ce1c o cadastro abandonado sumiu ou foi desativado';
  end if;

  select count(*) into v_n from public.movimentacoes where colaborador_id = v_pc;
  select count(*) into v_m from public.lancamentos_item where colaborador_id = v_pc;
  if v_n = 0 and v_m = 0 then
    v_ok := v_ok + 1; raise notice '✓ ce7c a coluna "Registros" fica em branco (0 e 0)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce7c; '; raise warning '✗ ce7c esperava 0 e 0; veio % e %', v_n, v_m;
  end if;

  select count(*) into v_n from public.rel_saldo_colaborador(v_pc);
  if v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ ce6c "Com esta pessoa" vem vazio';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce6c; '; raise warning '✗ ce6c rel_saldo_colaborador devolveu % linha(s)', v_n;
  end if;

  -- =========================================================================
  -- O CAMPO AINDA SUGERE AS TRÊS — a consulta de `sugestoesDoCampoColaborador`, com a sessão do operador
  -- =========================================================================
  set local role authenticated;
  select count(*) into v_n from public.colaboradores c
   where c.ativo and c.nome_chave like '%' || public.colaborador_chave('Fulano ZZCE') || '%';
  reset role;
  if v_n = 3 then
    v_ok := v_ok + 1; raise notice '✓ ce8 o campo Colaborador continua sugerindo as três pessoas (o filtro é só "ativo")';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce8; '; raise warning '✗ ce8 esperava 3 sugestões; veio %', v_n;
  end if;

  -- =========================================================================
  -- A FILA DE CONSOLIDAÇÃO (`v_colaboradores_textos`)
  -- =========================================================================
  select count(*) filter (where t.ja_cadastrado and t.colaborador_id = v_pa and t.ocorrencias = 1),
         count(*) filter (where t.ja_cadastrado and t.colaborador_id = v_pb and t.ocorrencias = 3),
         count(*) filter (where t.nome_chave = public.colaborador_chave('Fulano ZZCE Abandonado'))
    into v_n, v_m, v_k
    from public.v_colaboradores_textos t
   where t.nome_chave like public.colaborador_chave('Fulano ZZCE') || '%';
  if v_n = 1 and v_m = 1 and v_k = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ ce9 v_colaboradores_textos: as duas pessoas estornadas aparecem como JÁ CADASTRADAS (o texto da original — e, com item, o da saída e do inverso: 1 e 3 ocorrências); a abandonada não aparece (não há texto)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce9; ';
    raise warning '✗ ce9 v_colaboradores_textos: esperava 1 · 1 · 0; veio % · % · %', v_n, v_m, v_k;
  end if;

  -- =========================================================================
  -- NADA MUDOU SOZINHO
  -- =========================================================================
  select count(*) into v_n from public.colaboradores where id in (v_pa, v_pb, v_pc) and ativo;
  if v_n = 3 then
    v_ok := v_ok + 1; raise notice '✓ ce10 os três cadastros seguem ativos: nenhum estado do cadastro muda sozinho';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'ce10; '; raise warning '✗ ce10 esperava 3 cadastros ativos; veio %', v_n;
  end if;

  insert into _ce_resumo values (v_ok, v_falhas, nullif(v_msgs, ''));
  if v_falhas > 0 then
    raise warning '✗ TOTAL colaborador_estorno: % falha(s) — %', v_falhas, v_msgs;
  end if;
  raise notice 'FIM colaborador_estorno: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

select * from _ce_resumo;

rollback;
