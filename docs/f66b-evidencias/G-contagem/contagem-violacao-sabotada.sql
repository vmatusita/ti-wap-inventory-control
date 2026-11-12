do $f66b$
declare
  v_sabotar constant boolean := true;
  v_rotulo  text;
  v_t       jsonb;
  v_p       jsonb := '{}';
-- 0. nada nesta transação grava; e ela nunca se confirma (termina em raise exception)
begin
  perform set_config('transaction_read_only', 'on', true);

  -- o BANCO diz quem ele é; a sabotagem só roda no ensaio
  v_rotulo := public.rotulo_de_ambiente();
  if v_sabotar and v_rotulo is distinct from 'desenvolvimento' then
    raise exception 'F66B_SABOTAGEM_FORA_DO_ENSAIO rotulo=%', coalesce(v_rotulo, '(null)');
  end if;

  -- 1. por tabela, as linhas; por coluna, [o maior char_length, quantas linhas passam do teto da fonte]
  -- colaboradores (lote 0181)
  select jsonb_build_object(
      'linhas', count(*),
      'nome', jsonb_build_array(coalesce(max(char_length(nome)), 0), count(*) filter (where char_length(nome) > 120)),
      'matricula', jsonb_build_array(coalesce(max(char_length(matricula)), 0), count(*) filter (where char_length(matricula) > 40)),
      'setor', jsonb_build_array(coalesce(max(char_length(setor)), 0), count(*) filter (where char_length(setor) > 80)),
      'nome_chave', jsonb_build_array(coalesce(max(char_length(nome_chave)), 0), count(*) filter (where char_length(nome_chave) > 360)))
    into v_t from public.colaboradores;
  v_p := v_p || jsonb_build_object('colaboradores', v_t);

  -- itens (lote 0181)
  select jsonb_build_object(
      'linhas', count(*),
      'nome', jsonb_build_array(coalesce(max(char_length(nome)), 0), count(*) filter (where char_length(nome) > 80)),
      'nome_chave', jsonb_build_array(coalesce(max(char_length(nome_chave)), 0), count(*) filter (where char_length(nome_chave) > 240)))
    into v_t from public.itens;
  v_p := v_p || jsonb_build_object('itens', v_t);

  -- termos_gerados (lote 0181)
  select jsonb_build_object(
      'linhas', count(*),
      'tipo', jsonb_build_array(coalesce(max(char_length(tipo)), 0), count(*) filter (where char_length(tipo) > 40)),
      'colaborador', jsonb_build_array(coalesce(max(char_length(colaborador)), 0), count(*) filter (where char_length(colaborador) > 200)),
      'arquivo_path', jsonb_build_array(coalesce(max(char_length(arquivo_path)), 0), count(*) filter (where char_length(arquivo_path) > 80)))
    into v_t from public.termos_gerados;
  v_p := v_p || jsonb_build_object('termos_gerados', v_t);

  -- anotacoes (lote 0181)
  select jsonb_build_object(
      'linhas', count(*),
      'texto', jsonb_build_array(coalesce(max(char_length(texto)), 0), count(*) filter (where char_length(texto) > 2000)))
    into v_t from public.anotacoes;
  v_p := v_p || jsonb_build_object('anotacoes', v_t);

  -- ativos (lote 0182)
  select jsonb_build_object(
      'linhas', count(*),
      'patrimonio', jsonb_build_array(coalesce(max(char_length(patrimonio)), 0), count(*) filter (where char_length(patrimonio) > 60)),
      'patrimonio_original', jsonb_build_array(coalesce(max(char_length(patrimonio_original)), 0), count(*) filter (where char_length(patrimonio_original) > 60)),
      'marca', jsonb_build_array(coalesce(max(char_length(marca)), 0), count(*) filter (where char_length(marca) > 0)),
      'modelo', jsonb_build_array(coalesce(max(char_length(modelo)), 0), count(*) filter (where char_length(modelo) > 120)),
      'service_tag', jsonb_build_array(coalesce(max(char_length(service_tag)), 0), count(*) filter (where char_length(service_tag) > 100)),
      'hostname', jsonb_build_array(coalesce(max(char_length(hostname)), 0), count(*) filter (where char_length(hostname) > 60)),
      'memoria', jsonb_build_array(coalesce(max(char_length(memoria)), 0), count(*) filter (where char_length(memoria) > 80)),
      'armazenamento', jsonb_build_array(coalesce(max(char_length(armazenamento)), 0), count(*) filter (where char_length(armazenamento) > 80)),
      'processador', jsonb_build_array(coalesce(max(char_length(processador)), 0), count(*) filter (where char_length(processador) > 80)),
      'fornecedor', jsonb_build_array(coalesce(max(char_length(fornecedor)), 0), count(*) filter (where char_length(fornecedor) > 80)),
      'colaborador_atual', jsonb_build_array(coalesce(max(char_length(colaborador_atual)), 0), count(*) filter (where char_length(colaborador_atual) > 120)),
      'setor_atual', jsonb_build_array(coalesce(max(char_length(setor_atual)), 0), count(*) filter (where char_length(setor_atual) > 120)),
      'pendencia', jsonb_build_array(coalesce(max(char_length(pendencia)), 0), count(*) filter (where char_length(pendencia) > 200)),
      'origem', jsonb_build_array(coalesce(max(char_length(origem)), 0), count(*) filter (where char_length(origem) > 40)),
      'observacoes', jsonb_build_array(coalesce(max(char_length(observacoes)), 0), count(*) filter (where char_length(observacoes) > 2000)),
      'telefone', jsonb_build_array(coalesce(max(char_length(telefone)), 0), count(*) filter (where char_length(telefone) > 60)),
      'imei', jsonb_build_array(coalesce(max(char_length(imei)), 0), count(*) filter (where char_length(imei) > 60)),
      'pulsus', jsonb_build_array(coalesce(max(char_length(pulsus)), 0), count(*) filter (where char_length(pulsus) > 60)))
    into v_t from public.ativos;
  v_p := v_p || jsonb_build_object('ativos', v_t);

  -- movimentacoes (lote 0182)
  select jsonb_build_object(
      'linhas', count(*),
      'motivo', jsonb_build_array(coalesce(max(char_length(motivo)), 0), count(*) filter (where char_length(motivo) > 40)),
      'colaborador', jsonb_build_array(coalesce(max(char_length(colaborador)), 0), count(*) filter (where char_length(colaborador) > 120)),
      'setor', jsonb_build_array(coalesce(max(char_length(setor)), 0), count(*) filter (where char_length(setor) > 120)),
      'chamado', jsonb_build_array(coalesce(max(char_length(chamado)), 0), count(*) filter (where char_length(chamado) > 80)),
      'observacao', jsonb_build_array(coalesce(max(char_length(observacao)), 0), count(*) filter (where char_length(observacao) > 500)),
      'chamado_fornecedor', jsonb_build_array(coalesce(max(char_length(chamado_fornecedor)), 0), count(*) filter (where char_length(chamado_fornecedor) > 200)))
    into v_t from public.movimentacoes;
  v_p := v_p || jsonb_build_object('movimentacoes', v_t);

  -- pendencias_item (lote 0182)
  select jsonb_build_object(
      'linhas', count(*),
      'item', jsonb_build_array(coalesce(max(char_length(item)), 0), count(*) filter (where char_length(item) > 80)),
      'colaborador', jsonb_build_array(coalesce(max(char_length(colaborador)), 0), count(*) filter (where char_length(colaborador) > 120)),
      'status', jsonb_build_array(coalesce(max(char_length(status)), 0), count(*) filter (where char_length(status) > 40)),
      'desfecho', jsonb_build_array(coalesce(max(char_length(desfecho)), 0), count(*) filter (where char_length(desfecho) > 40)),
      'observacao', jsonb_build_array(coalesce(max(char_length(observacao)), 0), count(*) filter (where char_length(observacao) > 500)))
    into v_t from public.pendencias_item;
  v_p := v_p || jsonb_build_object('pendencias_item', v_t);

  -- lancamentos_item (lote 0182)
  select jsonb_build_object(
      'linhas', count(*),
      'chamado', jsonb_build_array(coalesce(max(char_length(chamado)), 0), count(*) filter (where char_length(chamado) > 20)),
      'colaborador', jsonb_build_array(coalesce(max(char_length(colaborador)), 0), count(*) filter (where char_length(colaborador) > 120)),
      'observacao', jsonb_build_array(coalesce(max(char_length(observacao)), 0), count(*) filter (where char_length(observacao) > 2000)))
    into v_t from public.lancamentos_item;
  v_p := v_p || jsonb_build_object('lancamentos_item', v_t);

  -- import_prefixos_patrimonio (lote 0183)
  select jsonb_build_object(
      'linhas', count(*),
      'prefixo', jsonb_build_array(coalesce(max(char_length(prefixo)), 0), count(*) filter (where char_length(prefixo) > 4)))
    into v_t from public.import_prefixos_patrimonio;
  v_p := v_p || jsonb_build_object('import_prefixos_patrimonio', v_t);

  -- import_termos_categoria (lote 0183)
  select jsonb_build_object(
      'linhas', count(*),
      'termo', jsonb_build_array(coalesce(max(char_length(termo)), 0), count(*) filter (where char_length(termo) > 40)),
      'rotulo', jsonb_build_array(coalesce(max(char_length(rotulo)), 0), count(*) filter (where char_length(rotulo) > 40)))
    into v_t from public.import_termos_categoria;
  v_p := v_p || jsonb_build_object('import_termos_categoria', v_t);

  -- import_termos_estado (lote 0183)
  select jsonb_build_object(
      'linhas', count(*),
      'termo', jsonb_build_array(coalesce(max(char_length(termo)), 0), count(*) filter (where char_length(termo) > 40)),
      'rotulo', jsonb_build_array(coalesce(max(char_length(rotulo)), 0), count(*) filter (where char_length(rotulo) > 40)))
    into v_t from public.import_termos_estado;
  v_p := v_p || jsonb_build_object('import_termos_estado', v_t);

  -- unidades_apelidos (lote 0183)
  select jsonb_build_object(
      'linhas', count(*),
      'apelido', jsonb_build_array(coalesce(max(char_length(apelido)), 0), count(*) filter (where char_length(apelido) > 80)),
      'apelido_chave', jsonb_build_array(coalesce(max(char_length(apelido_chave)), 0), count(*) filter (where char_length(apelido_chave) > 240)))
    into v_t from public.unidades_apelidos;
  v_p := v_p || jsonb_build_object('unidades_apelidos', v_t);

  -- tipos_item (lote 0183)
  select jsonb_build_object(
      'linhas', count(*),
      'slug', jsonb_build_array(coalesce(max(char_length(slug)), 0), count(*) filter (where char_length(slug) > 30)),
      'rotulo', jsonb_build_array(coalesce(max(char_length(rotulo)), 0), count(*) filter (where char_length(rotulo) > 60)))
    into v_t from public.tipos_item;
  v_p := v_p || jsonb_build_object('tipos_item', v_t);

  -- motivos (lote 0183)
  select jsonb_build_object(
      'linhas', count(*),
      'codigo', jsonb_build_array(coalesce(max(char_length(codigo)), 0), count(*) filter (where char_length(codigo) > 40)),
      'rotulo', jsonb_build_array(coalesce(max(char_length(rotulo)), 0), count(*) filter (where char_length(rotulo) > 80)))
    into v_t from public.motivos;
  v_p := v_p || jsonb_build_object('motivos', v_t);

  -- kits_modelos (lote 0183)
  select jsonb_build_object(
      'linhas', count(*),
      'nome', jsonb_build_array(coalesce(max(char_length(nome)), 0), count(*) filter (where char_length(nome) > 80)))
    into v_t from public.kits_modelos;
  v_p := v_p || jsonb_build_object('kits_modelos', v_t);

  -- filiais (lote 0183)
  select jsonb_build_object(
      'linhas', count(*),
      'slug', jsonb_build_array(coalesce(max(char_length(slug)), 0), count(*) filter (where char_length(slug) > 40)),
      'nome', jsonb_build_array(coalesce(max(char_length(nome)), 0), count(*) filter (where char_length(nome) > 80)),
      'cidade', jsonb_build_array(coalesce(max(char_length(cidade)), 0), count(*) filter (where char_length(cidade) > 120)))
    into v_t from public.filiais;
  v_p := v_p || jsonb_build_object('filiais', v_t);

  -- relatorios_gerados (lote 0184)
  select jsonb_build_object(
      'linhas', count(*),
      'observacao', jsonb_build_array(coalesce(max(char_length(observacao)), 0), count(*) filter (where char_length(observacao) > 2000)))
    into v_t from public.relatorios_gerados;
  v_p := v_p || jsonb_build_object('relatorios_gerados', v_t);

  -- import_logs (lote 0184)
  select jsonb_build_object(
      'linhas', count(*),
      'modo', jsonb_build_array(coalesce(max(char_length(modo)), 0), count(*) filter (where char_length(modo) > 40)),
      'arquivo_hash', jsonb_build_array(coalesce(max(char_length(arquivo_hash)), 0), count(*) filter (where char_length(arquivo_hash) > 128)),
      'backup_path', jsonb_build_array(coalesce(max(char_length(backup_path)), 0), count(*) filter (where char_length(backup_path) > 120)))
    into v_t from public.import_logs;
  v_p := v_p || jsonb_build_object('import_logs', v_t);

  -- eventos_admin (lote 0184)
  select jsonb_build_object(
      'linhas', count(*),
      'acao', jsonb_build_array(coalesce(max(char_length(acao)), 0), count(*) filter (where char_length(acao) > 80)),
      'alvo', jsonb_build_array(coalesce(max(char_length(alvo)), 0), count(*) filter (where char_length(alvo) > 500)))
    into v_t from public.eventos_admin;
  v_p := v_p || jsonb_build_object('eventos_admin', v_t);

  -- senhas_acesso (lote 0184)
  select jsonb_build_object(
      'linhas', count(*),
      'rotulo', jsonb_build_array(coalesce(max(char_length(rotulo)), 0), count(*) filter (where char_length(rotulo) > 80)),
      'hash', jsonb_build_array(coalesce(max(char_length(hash)), 0), count(*) filter (where char_length(hash) > 200)))
    into v_t from public.senhas_acesso;
  v_p := v_p || jsonb_build_object('senhas_acesso', v_t);

  raise exception 'F66B_CONTA %', jsonb_build_object(
    'rotulo', coalesce(v_rotulo, '(null)'), 'sabotado', v_sabotar, 'tabelas', v_p,
    '_canal', repeat('.', 120000));
end $f66b$;
