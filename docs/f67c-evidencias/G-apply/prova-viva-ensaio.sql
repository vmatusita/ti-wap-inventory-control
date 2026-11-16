-- F67C — a PROVA VIVA da escrita no ENSAIO (decisão 14 do PLAN-F67C), depois da contração. SÓ NO ENSAIO: um único bloco
-- que termina em `raise exception` (nada fica — a transação inteira é desfeita; nenhum valor de linha é impresso, só
-- contagens). Em PRODUÇÃO, nada disto: nenhuma escrita, nem em bloco desfeito (fato 30).
--
-- Para cada uma das 20 tabelas de k_negocio: (i) o INSERT SEM empresa_id é recusado com 23502 — o NOT NULL, já sem
-- default; como o dono, porque como `authenticated` a policy de INSERT recusa a empresa NULA antes (42501) — e (ii) o
-- MESMO INSERT COM a empresa certa é aceito, como `authenticated` com as claims de um admin ativo da empresa legada do
-- ensaio nas tabelas que têm policy de INSERT para `authenticated`; nas que não têm (só o service role ou as funções
-- escrevem: eventos_admin, senhas_acesso, import_prefixos_patrimonio, import_termos_categoria, import_termos_estado),
-- como o dono. Cada tentativa numa subtransação.
do $$
declare
  v_emp  uuid := public.empresa_legada();
  v_uid  uuid;
  v_f    smallint;
  v_a    uuid;
  v_m    uuid;
  v_i    smallint;
  v_t    text;
  v_sem  text;
  v_com  text;
  v_esp_sem int := 0;  -- recusas certas (23502) sem a coluna
  v_ok_com  int := 0;  -- aceitos com a coluna
  v_fora    text := '';
  v_sufixo  text := 'f67c-pv-' || to_char(clock_timestamp(), 'HH24MISSMS');
  k_sem_policy constant text[] := array['eventos_admin', 'senhas_acesso', 'import_prefixos_patrimonio',
                                         'import_termos_categoria', 'import_termos_estado'];
  k_vinte constant text[] := array['anotacoes', 'ativos', 'colaboradores', 'itens', 'lancamentos_item', 'movimentacoes',
    'pendencias_item', 'termos_gerados', 'eventos_admin', 'import_logs', 'import_prefixos_patrimonio',
    'import_termos_categoria', 'import_termos_estado', 'kits_modelos', 'motivos', 'relatorios_gerados', 'senhas_acesso',
    'tipos_item', 'unidades_apelidos', 'filiais'];
begin
  select m.profile_id into v_uid from public.membros m
   where m.ativo and m.empresa_id = v_emp and m.papel::text in ('admin', 'dev') order by m.profile_id limit 1;
  select f.id into v_f from public.filiais f where f.ativo and f.empresa_id = v_emp order by f.id limit 1;
  if v_uid is null or v_f is null then raise exception 'prova-viva: o ensaio não tem admin ativo ou filial ativa'; end if;
  -- os pais que as linhas precisam, criados COM a empresa (como o dono; desfeitos no raise final)
  insert into public.ativos (empresa_id, patrimonio, service_tag, categoria, filial_id, origem)
  values (v_emp, null, upper(replace(v_sufixo, '-', '')), 'notebook', v_f, 'cadastro') returning id into v_a;
  insert into public.movimentacoes (empresa_id, ativo_id, tipo, data, filial_id, criado_por)
  values (v_emp, v_a, 'compra', current_date, v_f, v_uid) returning id into v_m;
  insert into public.itens (empresa_id, nome, grupo) values (v_emp, 'Item ' || v_sufixo, 'acessorio') returning id into v_i;

  foreach v_t in array k_vinte loop
    -- o texto do INSERT, com e sem a coluna (valores fictícios; a chave natural de cada um leva o sufixo)
    v_sem := case v_t
      when 'anotacoes' then format('insert into public.anotacoes (ativo_id, texto, criado_por) values (%L, %L, %L)', v_a, 'anotação ' || v_sufixo, v_uid)
      when 'ativos' then format('insert into public.ativos (service_tag, categoria, filial_id, origem) values (%L, %L, %s, %L)', upper(replace(v_sufixo, '-', '')) || 'X', 'notebook', v_f, 'cadastro')
      when 'colaboradores' then format('insert into public.colaboradores (nome, criado_por) values (%L, %L)', 'Fulano ' || v_sufixo, v_uid)
      when 'itens' then format('insert into public.itens (nome, grupo) values (%L, %L)', 'Item X ' || v_sufixo, 'acessorio')
      when 'lancamentos_item' then format('insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por) values (%s, %s, %L, 1, current_date, %L)', v_i, v_f, 'entrada', v_uid)
      when 'movimentacoes' then format('insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, observacao) values (%L, %L, current_date, %s, %L, %L)', v_a, 'ajuste', v_f, v_uid, 'prova viva')
      when 'pendencias_item' then format('insert into public.pendencias_item (ativo_id, movimentacao_id, item, filial_id, colaborador) values (%L, %L, %L, %s, %L)', v_a, v_m, 'item ' || v_sufixo, v_f, 'Fulano')
      when 'termos_gerados' then format('insert into public.termos_gerados (tipo, movimentacao_ids, ativo_ids, colaborador, dados, gerado_por) values (%L, %L::uuid[], %L::uuid[], %L, %L::jsonb, %L)', 'responsabilidade_notebook', '{}', '{}', 'Fulano', '{}', v_uid)
      when 'eventos_admin' then format('insert into public.eventos_admin (acao, autor, alvo, detalhe) values (%L, %L, %L, %L::jsonb)', 'papel_alterado', v_uid, v_sufixo, '{}')
      when 'import_logs' then format('insert into public.import_logs (filial_id, modo, arquivo_hash, total_linhas, ativos_criados, movs_apagadas, anotacoes_apagadas, termos_apagados, backup_path, correcoes, criado_por) values (%s, %L, %L, 0, 0, 0, 0, 0, %L, %L::jsonb, %L)', v_f, 'substituir', v_sufixo, 'prova/' || v_sufixo, '[]', v_uid)
      when 'import_prefixos_patrimonio' then format('insert into public.import_prefixos_patrimonio (prefixo) values (%L)', 'ZQV')
      when 'import_termos_categoria' then format('insert into public.import_termos_categoria (termo, categoria, rotulo) values (%L, %L, null)', 'termo ' || v_sufixo, 'notebook')
      when 'import_termos_estado' then format('insert into public.import_termos_estado (termo, estado, rotulo) values (%L, %L, null)', 'estado ' || v_sufixo, 'em_uso')
      when 'kits_modelos' then format('insert into public.kits_modelos (nome, payload, criado_por) values (%L, %L::jsonb, %L)', 'Kit ' || v_sufixo, '{"tipo": "saida", "categorias": ["notebook"]}', v_uid)
      when 'motivos' then format('insert into public.motivos (codigo, rotulo, aplica_a) values (%L, %L, %L::public.tipo_movimentacao[])', v_sufixo, 'Motivo ' || v_sufixo, '{saida}')
      when 'relatorios_gerados' then format('insert into public.relatorios_gerados (periodo_de, periodo_ate, filial_id, versao, dados, gerado_por) values (date %L, date %L, %s, 1, %L::jsonb, %L)', '1999-01-01', '1999-01-01', v_f, '{}', v_uid)
      when 'senhas_acesso' then format('insert into public.senhas_acesso (rotulo, hash, criado_por) values (%L, %L, %L)', 'Senha ' || v_sufixo, 'hash-' || v_sufixo, v_uid)
      when 'tipos_item' then format('insert into public.tipos_item (slug, rotulo, ordem) values (%L, %L, 9999)', replace(v_sufixo, '-', ''), 'Tipo ' || v_sufixo)
      when 'unidades_apelidos' then format('insert into public.unidades_apelidos (filial_id, apelido) values (%s, %L)', v_f, 'Apelido ' || v_sufixo)
      when 'filiais' then format('insert into public.filiais (nome, slug) values (%L, %L)', 'Filial ' || v_sufixo, v_sufixo)
    end;
    -- a forma COM: a coluna primeiro na lista e a empresa primeiro no valor
    v_com := regexp_replace(v_sem, '^insert into public\.([a-z_]+) \(', 'insert into public.\1 (empresa_id, ');
    v_com := regexp_replace(v_com, ' values \(', format(' values (%L::uuid, ', v_emp));
    -- (i) sem a coluna: 23502 — como o DONO: como `authenticated`, a policy de INSERT (empresa_id = any(…)) recusa a
    --     linha com empresa NULA antes do NOT NULL (42501); o 23502 puro é o do motor, sem default (medido na mesa)
    begin
      execute v_sem;
      v_fora := v_fora || v_t || ':aceitou-sem; ';
    exception when others then
      if sqlstate = '23502' then v_esp_sem := v_esp_sem + 1; else v_fora := v_fora || v_t || ':sem=' || sqlstate || '; '; end if;
    end;
    execute 'reset role';
    -- (ii) com a coluna: aceito
    begin
      if not (v_t = any (k_sem_policy)) then
        perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        execute 'set local role authenticated';
      end if;
      execute v_com;
      v_ok_com := v_ok_com + 1;
    exception when others then
      v_fora := v_fora || v_t || ':com=' || sqlstate || '; ';
    end;
    execute 'reset role';
  end loop;
  raise exception 'PROVA-VIVA-F67C sem_empresa_recusados_23502=% de 20 | com_empresa_aceitos=% de 20 | fora=[%]',
    v_esp_sem, v_ok_com, v_fora;
end $$;
