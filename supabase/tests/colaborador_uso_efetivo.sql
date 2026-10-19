-- =============================================================
-- colaborador_uso_efetivo.sql — v1.71.2 (19/10/2026): a regra do USO EFETIVO de um cadastro de colaborador
-- (B3/A9 da ordem docs/prompts/prompt-reservados-por-categoria-e-colaborador-sem-uso.md; a regra por extenso em
-- docs/PLAN-v1.71.1-v1.71.2.md §2.2; a função é a `public.colaboradores_uso_efetivo()`, migration 0180).
--
-- Um cadastro tem uso efetivo quando existe pelo menos UM registro da MESMA empresa que continua valendo — (a) a
-- movimentação vinculada que não é estorno nem foi estornada, (b) o lançamento de item vinculado sem inverso, (c) o
-- ativo que está com a pessoa hoje. Vinculado = pelo `colaborador_id`, ou pela chave do nome quando o id é nulo (o
-- histórico em texto, que a fila de consolidação transforma em cadastro). `sem_uso` = cadastro ATIVO sem uso efetivo.
--
-- Os casos (cada um com a sua afirmação; os rótulos são LITERAIS, para o injetor de mutações enxergar):
--   u1 movimentação estornada → sem uso (e conta os registros estornados)
--   u2 cadastro abandonado → sem uso, nunca usado
--   u3 uma estornada + outra válida → em uso
--   u4 o cadastro da consolidação, com o histórico SÓ em texto (id nulo, outra grafia) → em uso
--   u5 item lançado e estornado (o inverso) → sem uso
--   u6 detentor atual de um ativo, sem movimentação vinculada → em uso
--   u7 inativo sem registro → fora do selo (sem_uso = false)
--   u8 homônimo em OUTRA empresa, com registro válido lá → não conta: o daqui segue sem uso
--   u9 a chamada com a sessão de um administrador (authenticated, RLS) dá a mesma resposta que a do dono
--   u11 o acessório entregue e não devolvido como ÚNICO registro → em uso (a revisão adversarial pediu a prova)
-- Antes da 0180 o roteiro é VERMELHO (u0: a função não existe) — foi assim que ele nasceu, num push.
--
-- Dado 100% fictício ("Fulano ZZUE …", patrimônio `ZZUE…`, a empresa B "ZZUE"). Fixtures plantadas como dono, com o
-- `empresa_id` POR EXTENSO na empresa B (o molde de isolamento_tenant.sql e integridade_tenant.sql — o default é a
-- empresa legada). ESCREVE — `begin; … rollback;`: nada sobra no banco.
-- =============================================================

begin;

create temp table _ue_resumo (ok int, falhas int, detalhe text);

-- Privilégios de TABELA para o u9 (a função é `security invoker`: com a sessão de `authenticated`, ela lê as quatro
-- tabelas com o privilégio e a RLS de quem chama). No projeto hospedado existem por default privilege; no Postgres do
-- CI, não (o molde de f38_itens_com_ativo.sql).
grant select on public.colaboradores, public.movimentacoes, public.lancamentos_item, public.ativos to authenticated;

do $$
declare
  k_admin  uuid := '00000000-00ee-4000-8000-0000000000a1';
  v_emp_a  uuid := public.empresa_legada();
  v_emp_b  uuid;
  v_f1     smallint;
  v_fb     smallint;
  v_item   smallint;
  v_a      uuid[] := array[]::uuid[];
  v_ab     uuid;
  v_p      uuid[] := array[]::uuid[];   -- p[1]..p[9] na empresa A
  v_pb     uuid;                        -- o homônimo da empresa B
  v_mov    uuid;
  v_lanc   uuid;
  v_k      int;
  v_r      record;
  v_n      bigint;
  v_m      bigint;
  v_ok     int  := 0;
  v_falhas int  := 0;
  v_msgs   text := '';
begin
  -- u0 — a função existe? (sem ela, o roteiro para aqui, VERMELHO: o ✗ e nenhuma linha FIM)
  if to_regprocedure('public.colaboradores_uso_efetivo()') is null then
    raise warning '✗ u0 a função public.colaboradores_uso_efetivo() não existe — a regra do uso efetivo não está no banco';
    insert into _ue_resumo values (0, 1, 'u0');
    -- sem a linha FIM de propósito: o runner reprova o roteiro que não a emite (o molde de f38_itens_com_ativo.sql)
    return;
  end if;

  -- =========================================================================
  -- FIXTURES
  -- =========================================================================
  select id into v_f1 from public.filiais where ativo and empresa_id = v_emp_a order by id limit 1;
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values (k_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'ue.chefia@wap.ind.br', '', now(), now(), now());
  perform pg_temp.plantar_cargo(k_admin, 'admin');
  perform set_config('request.jwt.claims', json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);

  insert into public.empresas (slug, nome) values ('zzue-b', 'Empresa B fictícia do uso efetivo (v1.71.2)')
    returning id into v_emp_b;
  insert into public.filiais (nome, slug, empresa_id) values ('ZZUE B Unidade', 'zzue-b-unidade', v_emp_b)
    returning id into v_fb;

  insert into public.itens (nome, grupo, ordem) values ('TESTE UE Item', 'acessorio', 9994) returning id into v_item;
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_item, v_f1, 'entrada', 10, current_date, k_admin);

  for v_k in 1 .. 6 loop
    insert into public.ativos (patrimonio, categoria, filial_id)
      values ('ZZUE0000' || v_k, 'notebook', v_f1) returning id into v_mov;
    v_a := v_a || v_mov;
  end loop;

  -- os cadastros da empresa A (o u4 nasce DEPOIS do histórico em texto, como na consolidação)
  insert into public.colaboradores (nome, filial_id, criado_por) values ('Fulano ZZUE Estornado', v_f1, k_admin) returning id into v_mov; v_p := v_p || v_mov;
  insert into public.colaboradores (nome, filial_id, criado_por) values ('Fulano ZZUE Abandonado', v_f1, k_admin) returning id into v_mov; v_p := v_p || v_mov;
  insert into public.colaboradores (nome, filial_id, criado_por) values ('Fulano ZZUE Reusado', v_f1, k_admin) returning id into v_mov; v_p := v_p || v_mov;
  v_p := v_p || null::uuid;  -- p[4], criado adiante
  insert into public.colaboradores (nome, filial_id, criado_por) values ('Fulano ZZUE Item', v_f1, k_admin) returning id into v_mov; v_p := v_p || v_mov;
  insert into public.colaboradores (nome, filial_id, criado_por) values ('Fulano ZZUE Detentor', v_f1, k_admin) returning id into v_mov; v_p := v_p || v_mov;
  insert into public.colaboradores (nome, filial_id, criado_por, ativo) values ('Fulano ZZUE Inativo', v_f1, k_admin, false) returning id into v_mov; v_p := v_p || v_mov;
  insert into public.colaboradores (nome, filial_id, criado_por) values ('Fulano ZZUE Homonimo', v_f1, k_admin) returning id into v_mov; v_p := v_p || v_mov;
  insert into public.colaboradores (nome, filial_id, criado_por) values ('Fulano ZZUE Acessorio', v_f1, k_admin) returning id into v_mov; v_p := v_p || v_mov;

  -- u1: saída vinculada e estornada
  insert into public.movimentacoes (ativo_id, tipo, colaborador, colaborador_id, filial_id, criado_por, created_at)
    values (v_a[1], 'saida', 'Fulano ZZUE Estornado', v_p[1], v_f1, k_admin, now() - interval '2 minutes') returning id into v_mov;
  insert into public.movimentacoes (ativo_id, tipo, estorno_de, filial_id, criado_por, created_at)
    values (v_a[1], 'estorno', v_mov, v_f1, k_admin, now() - interval '1 minute');

  -- u3: uma estornada (a[2]) e uma válida (a[3], depois devolvida — a saída continua valendo e o detentor sai)
  insert into public.movimentacoes (ativo_id, tipo, colaborador, colaborador_id, filial_id, criado_por, created_at)
    values (v_a[2], 'saida', 'Fulano ZZUE Reusado', v_p[3], v_f1, k_admin, now() - interval '2 minutes') returning id into v_mov;
  insert into public.movimentacoes (ativo_id, tipo, estorno_de, filial_id, criado_por, created_at)
    values (v_a[2], 'estorno', v_mov, v_f1, k_admin, now() - interval '1 minute');
  insert into public.movimentacoes (ativo_id, tipo, colaborador, colaborador_id, filial_id, criado_por, created_at)
    values (v_a[3], 'saida', 'Fulano ZZUE Reusado', v_p[3], v_f1, k_admin, now() - interval '2 minutes');
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, created_at)
    values (v_a[3], 'devolucao', v_f1, k_admin, now() - interval '1 minute');

  -- u4: o histórico em TEXTO (id nulo, outra grafia da mesma chave), devolvido; o cadastro nasce depois
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por, created_at)
    values (v_a[4], 'saida', '  fulano   zzue CONSOLIDADO ', v_f1, k_admin, now() - interval '2 minutes');
  insert into public.movimentacoes (ativo_id, tipo, filial_id, criado_por, created_at)
    values (v_a[4], 'devolucao', v_f1, k_admin, now() - interval '1 minute');
  insert into public.colaboradores (nome, filial_id, criado_por) values ('Fulano ZZUE Consolidado', v_f1, k_admin) returning id into v_mov;
  v_p[4] := v_mov;

  -- u5: o item lançado com a pessoa e o inverso (o estorno avulso de item)
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, colaborador, colaborador_id, criado_por)
    values (v_item, v_f1, 'saida', 1, current_date, 'Fulano ZZUE Item', v_p[5], k_admin) returning id into v_lanc;
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, colaborador, colaborador_id, estorna_id, observacao, criado_por)
    values (v_item, v_f1, 'retorno', 1, current_date, 'Fulano ZZUE Item', v_p[5], v_lanc, 'Estorno: roteiro uso efetivo', k_admin);

  -- u6: o detentor de hoje sem movimentação vinculada (o equipamento chegou com a pessoa, como na carga do go-live)
  -- (outra grafia da mesma chave, como vem da carga: o detentor casa pela chave, não pelo texto igual)
  update public.ativos set status = 'em_uso', colaborador_atual = '  fulano zzue DETENTOR ' where id = v_a[5];

  -- u11: o único uso é um acessório entregue e NÃO devolvido (o lançamento sem inverso)
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, colaborador, colaborador_id, criado_por)
    values (v_item, v_f1, 'saida', 1, current_date, 'Fulano ZZUE Acessorio', v_p[9], k_admin);

  -- u8: a empresa B — um homônimo com registro VÁLIDO lá (pela chave do texto) e o ativo com ele
  insert into public.colaboradores (nome, filial_id, criado_por, empresa_id)
    values ('Fulano ZZUE Homonimo', v_fb, k_admin, v_emp_b) returning id into v_pb;
  insert into public.ativos (patrimonio, categoria, filial_id, empresa_id)
    values ('ZZUEB0001', 'notebook', v_fb, v_emp_b) returning id into v_ab;
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por, empresa_id)
    values (v_ab, 'saida', 'Fulano ZZUE Homonimo', v_fb, k_admin, v_emp_b);

  -- =========================================================================
  -- AS AFIRMAÇÕES — como dono (sem RLS: o par de empresa do join é o que separa A de B)
  -- =========================================================================
  select * into v_r from public.colaboradores_uso_efetivo() u where u.colaborador_id = v_p[1];
  if v_r.sem_uso and not v_r.uso_efetivo and v_r.registros_estornados = 1 and v_r.registros_validos = 0 then
    v_ok := v_ok + 1; raise notice '✓ u1 a movimentação estornada não conta: sem uso, 1 registro estornado';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'u1; ';
    raise warning '✗ u1 estornada: esperava sem uso com 1 estornado; veio sem_uso=% validos=% estornados=%', v_r.sem_uso, v_r.registros_validos, v_r.registros_estornados;
  end if;

  select * into v_r from public.colaboradores_uso_efetivo() u where u.colaborador_id = v_p[2];
  if v_r.sem_uso and v_r.registros_estornados = 0 and v_r.registros_validos = 0 and v_r.ativos_com_a_pessoa = 0 then
    v_ok := v_ok + 1; raise notice '✓ u2 o cadastro abandonado: sem uso, nunca usado (0 registro)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'u2; ';
    raise warning '✗ u2 abandonado: esperava sem uso, 0 registro; veio sem_uso=% validos=% estornados=%', v_r.sem_uso, v_r.registros_validos, v_r.registros_estornados;
  end if;

  select * into v_r from public.colaboradores_uso_efetivo() u where u.colaborador_id = v_p[3];
  if v_r.uso_efetivo and not v_r.sem_uso and v_r.registros_validos = 1 and v_r.registros_estornados = 1 then
    v_ok := v_ok + 1; raise notice '✓ u3 uma estornada e outra válida: em uso (1 válido, 1 estornado)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'u3; ';
    raise warning '✗ u3 estornada + válida: esperava em uso 1/1; veio uso=% validos=% estornados=%', v_r.uso_efetivo, v_r.registros_validos, v_r.registros_estornados;
  end if;

  select * into v_r from public.colaboradores_uso_efetivo() u where u.colaborador_id = v_p[4];
  select count(*) into v_n from public.movimentacoes where colaborador_id = v_p[4];
  if v_r.uso_efetivo and not v_r.sem_uso and v_r.registros_validos = 1 and v_n = 0 then
    v_ok := v_ok + 1; raise notice '✓ u4 o cadastro da consolidação, com o histórico SÓ em texto (0 vínculo por id): em uso, pela chave';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'u4; ';
    raise warning '✗ u4 consolidado: esperava em uso pela chave; veio uso=% validos=% (vínculos por id: %)', v_r.uso_efetivo, v_r.registros_validos, v_n;
  end if;

  select * into v_r from public.colaboradores_uso_efetivo() u where u.colaborador_id = v_p[5];
  if v_r.sem_uso and v_r.registros_validos = 0 and v_r.registros_estornados = 2 then
    v_ok := v_ok + 1; raise notice '✓ u5 o item lançado e estornado: sem uso (a saída e o inverso, 2 registros estornados)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'u5; ';
    raise warning '✗ u5 item estornado: esperava sem uso com 2 estornados; veio sem_uso=% validos=% estornados=%', v_r.sem_uso, v_r.registros_validos, v_r.registros_estornados;
  end if;

  select * into v_r from public.colaboradores_uso_efetivo() u where u.colaborador_id = v_p[6];
  if v_r.uso_efetivo and not v_r.sem_uso and v_r.ativos_com_a_pessoa = 1 and v_r.registros_validos = 0 then
    v_ok := v_ok + 1; raise notice '✓ u6 o detentor de hoje, sem movimentação vinculada e com o nome em outra grafia: em uso (1 ativo com a pessoa)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'u6; ';
    raise warning '✗ u6 detentor: esperava em uso com 1 ativo; veio uso=% ativos=% validos=%', v_r.uso_efetivo, v_r.ativos_com_a_pessoa, v_r.registros_validos;
  end if;

  select * into v_r from public.colaboradores_uso_efetivo() u where u.colaborador_id = v_p[7];
  if not v_r.sem_uso and not v_r.uso_efetivo then
    v_ok := v_ok + 1; raise notice '✓ u7 o inativo sem registro fica FORA do selo (sem_uso = false)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'u7; ';
    raise warning '✗ u7 inativo: esperava fora do selo; veio sem_uso=% uso=%', v_r.sem_uso, v_r.uso_efetivo;
  end if;

  select * into v_r from public.colaboradores_uso_efetivo() u where u.colaborador_id = v_p[8];
  select u.uso_efetivo::int into v_k from public.colaboradores_uso_efetivo() u where u.colaborador_id = v_pb;
  if v_r.sem_uso and v_r.registros_validos = 0 and v_r.ativos_com_a_pessoa = 0 and v_k = 1 then
    v_ok := v_ok + 1; raise notice '✓ u8 o homônimo de OUTRA empresa não conta: o daqui segue sem uso, o de lá está em uso';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'u8; ';
    raise warning '✗ u8 homônimo: esperava o daqui sem uso e o de lá em uso; veio sem_uso=% validos=% ativos=% (o de lá: %)', v_r.sem_uso, v_r.registros_validos, v_r.ativos_com_a_pessoa, v_k;
  end if;

  select * into v_r from public.colaboradores_uso_efetivo() u where u.colaborador_id = v_p[9];
  if v_r.uso_efetivo and not v_r.sem_uso and v_r.registros_validos = 1 and v_r.registros_estornados = 0 then
    v_ok := v_ok + 1; raise notice '✓ u11 o acessório entregue e não devolvido, como único registro: em uso (1 válido)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'u11; ';
    raise warning '✗ u11 só o acessório: esperava em uso com 1 válido; veio uso=% validos=% estornados=%', v_r.uso_efetivo, v_r.registros_validos, v_r.registros_estornados;
  end if;

  -- u9 — com a sessão do administrador (authenticated, RLS da F66): a mesma resposta para as pessoas da empresa dele
  select count(*) filter (where u.sem_uso), count(*)
    into v_n, v_m
    from public.colaboradores_uso_efetivo() u where u.colaborador_id = any (v_p);
  set local role authenticated;
  select count(*) filter (where u.sem_uso) - v_n, count(*) - v_m
    into v_n, v_m
    from public.colaboradores_uso_efetivo() u where u.colaborador_id = any (v_p);
  reset role;
  if v_n = 0 and v_m = 0 then
    v_ok := v_ok + 1; raise notice '✓ u9 com a sessão do administrador (authenticated, RLS), a mesma resposta que a do dono';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'u9; ';
    raise warning '✗ u9 a sessão do administrador viu outra coisa: diferença de % no selo e % nas linhas', v_n, v_m;
  end if;

  -- a resposta tem uma linha por cadastro, e nenhuma linha muda estado
  select count(*) into v_n from public.colaboradores_uso_efetivo();
  select count(*) into v_m from public.colaboradores;
  if v_n = v_m and (select count(*) from public.colaboradores where id = any (v_p) and ativo) = 8 then
    v_ok := v_ok + 1; raise notice '✓ u10 uma linha por cadastro (% e %), e nenhum cadastro mudou de estado', v_n, v_m;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'u10; ';
    raise warning '✗ u10 esperava uma linha por cadastro e os 8 ativos intactos; veio % linhas para % cadastros', v_n, v_m;
  end if;

  insert into _ue_resumo values (v_ok, v_falhas, nullif(v_msgs, ''));
  if v_falhas > 0 then
    raise warning '✗ TOTAL colaborador_uso_efetivo: % falha(s) — %', v_falhas, v_msgs;
  end if;
  raise notice 'FIM colaborador_uso_efetivo: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

select * from _ue_resumo;

rollback;
