-- =============================================================
-- Roteiro de teste — QUEM É A PESSOA E O QUE É O ITEM (OS-F37, migrations
-- 0112/0113/0114: colaboradores, o vínculo colaborador_id e tipos_item).
--
-- Arquivo NOVO e INDEPENDENTE: não toca nem depende dos demais roteiros de
-- supabase/tests/ (mesmo precedente do f34_triagem_reserva.sql / f36_detentor.sql).
-- O CI usa o glob supabase/tests/*.sql, então este arquivo entra sozinho.
--
-- O QUE ELE PROVA (ordem F37, item a item):
--   a  A CHAVE NORMALIZA: public.colaborador_chave() colapsa maiúsculas/minúsculas,
--      acento (translate, sem unaccent) e espaço (inclusive tab/CR/LF) para a MESMA
--      chave — e a coluna GERADA colaboradores.nome_chave devolve o mesmo valor que
--      a função chamada direto (prova que a coluna usa a função, não uma cópia dela).
--   b  O ÍNDICE ÚNICO recusa a segunda grafia da mesma chave (23505/unique_violation).
--   c  A TABELA recusa nome em branco (23514/check_violation,
--      constraint colaboradores_nome_nao_vazio).
--   d  O VÍNCULO DO REGISTRO NOVO funciona: uma movimentação e um lançamento de item
--      gravados com colaborador_id preenchido guardam AS DUAS colunas (id e texto).
--   e  ASSERÇÃO NEGATIVA (a mais importante): update colaborador_id em movimentacoes
--      OU em lancamentos_item é recusado pela guarda_acervo (0081) mesmo rodando como
--      o DONO — a única forma de ligar o passado é por CHAVE na leitura, nunca UPDATE.
--   f  A VIEW v_colaboradores_textos agrupa por chave, soma ocorrências/grafias NO
--      BANCO e atualiza ja_cadastrado/colaborador_id assim que o cadastro nasce.
--      Desde a 0115 (revisão de 28/08/2026), prova também que nome só de tab/CR/NBSP
--      NÃO vira grupo na fila (f3) e que a LISTA e o RESUMO contam o mesmo número de
--      pendências (f4) — era essa igualdade que o grupo fantasma quebrava, e é ela
--      que o operador vê no cartão "Nomes sem cadastro".
--   g  tipos_item tem EXATAMENTE os 7 slugs do histórico, fone exibe "Fone de ouvido",
--      o check de formato do slug recusa maiúscula/espaço, o unique de slug recusa
--      duplicata.
--   h  itens.tipo_id é ANULÁVEL (item sem tipo funciona) e a FK recusa tipo inexistente
--      (23503/foreign_key_violation).
--   i  NENHUM slug do histórico (movimentacoes.itens_faltantes / pendencias_item.item)
--      ficou órfão de tipos_item — a razão de ser do seed da 0114 — checado como
--      "0 órfãos", nunca como contagem absoluta (bateria em qualquer base com dados).
--
-- Convenção idêntica aos outros roteiros (job `banco` do CI):
--   NOTICE  '✓ ...'  quando o resultado bate com o esperado
--   WARNING '✗ ...'  quando NÃO bate (o CI falha em qualquer `WARNING: ✗`)
--
-- Tudo roda dentro de UMA transação que termina em ROLLBACK: NADA é gravado.
-- Pré-requisito: a filial matriz (migration 0007). O profile usado como criado_por
-- é criado AQUI — o roteiro é autossuficiente.
-- Dados 100% fictícios (CLAUDE.md regra 2): patrimônios com prefixo único `ZZF37...`,
-- e-mail `f37.operador@wap.ind.br`, colaboradores "Fulano"/"Ciclano".
--
-- Nenhuma asserção deste roteiro depende de RLS: ele roda como o DONO da conexão
-- (mesmo idioma do dev_destrutivo.sql linhas ~565-577) porque a asserção (e) — a
-- negativa contra guarda_acervo — precisa medir exatamente isso: que nem o DONO,
-- que ignora RLS, consegue UPDATE em histórico. RLS de colaboradores/tipos_item é
-- assunto do papeis_rls.sql, não deste arquivo.
-- =============================================================

begin;

-- Contadores em uma TABELA TEMPORÁRIA, no molde do papeis_rls.sql: NOTICE e WARNING
-- não atravessam todo transporte (o ensaio por API os engole), e sem uma LINHA de
-- resultado o roteiro só é verificável dentro do job `banco` do CI. Com ela, o mesmo
-- arquivo se prova nos dois lugares.
create temp table _f37_resumo (ok int, falhas int, detalhe text);

do $$
declare
  -- Contadores do resumo (molde do papeis_rls.sql).
  v_ok              int  := 0;
  v_falhas          int  := 0;
  v_msgs            text := '';
  k_prof            uuid := gen_random_uuid();
  v_matriz          smallint;
  a                 uuid;
  v_item            smallint;
  v_item2           smallint;
  v_tipo_id         smallint;
  v_colab_id        uuid;
  v_colab_id2       uuid;
  v_colab_view_id   uuid;
  v_mov_id          uuid;
  v_lanc_id         uuid;
  v_mov_colab_txt   text;
  v_mov_colab_id    uuid;
  v_lanc_colab_txt  text;
  v_lanc_colab_id   uuid;
  v_chave           text;
  v_ocorrencias     bigint;
  v_grafias         bigint;
  v_ja_cad          boolean;
  v_obtido          text;
  v_rotulo          text;
  v_cnt             int;
  v_orfaos          int;
  v_grupos_resumo   bigint;
  v_slugs_esperados text[];
  v_slugs_obtidos   text[];
begin
  select id into v_matriz from public.filiais where slug = 'matriz';
  if v_matriz is null then
    raise exception 'PRE-REQUISITO: aplique a migration 0007 (filial matriz)';
  end if;

  -- O trigger handle_new_user cria o profile (e exige domínio corporativo — 0041/0057).
  -- Nasce com papel padrão 'operador' — suficiente como autor (criado_por) em todo
  -- este roteiro, que não testa RLS.
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values (k_prof, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'f37.operador@wap.ind.br', '', now(), now(), now());

  -- =============================================================
  -- a — A CHAVE NORMALIZA (public.colaborador_chave)
  -- =============================================================
  v_obtido := public.colaborador_chave('  João   Silva  ');
  if v_obtido = 'joao silva' then
    v_ok := v_ok + 1; raise notice '✓ a1 colaborador_chave(''  João   Silva  '') = ''%''', v_obtido;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'a1; '; raise warning '✗ a1 esperado ''joao silva'', obtido ''%''', v_obtido;
  end if;

  v_obtido := public.colaborador_chave('JOAO SILVA');
  if v_obtido = 'joao silva' then
    v_ok := v_ok + 1; raise notice '✓ a2 colaborador_chave(''JOAO SILVA'') = ''%''', v_obtido;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'a2; '; raise warning '✗ a2 esperado ''joao silva'', obtido ''%''', v_obtido;
  end if;

  v_obtido := public.colaborador_chave('joão  silva');
  if v_obtido = 'joao silva' then
    v_ok := v_ok + 1; raise notice '✓ a3 colaborador_chave(''joão  silva'') = ''%''', v_obtido;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'a3; '; raise warning '✗ a3 esperado ''joao silva'', obtido ''%''', v_obtido;
  end if;

  v_obtido := public.colaborador_chave('José  Antônio   Peçanha');
  if v_obtido = 'jose antonio pecanha' then
    v_ok := v_ok + 1; raise notice '✓ a4 colaborador_chave(''José  Antônio   Peçanha'') = ''%''', v_obtido;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'a4; '; raise warning '✗ a4 esperado ''jose antonio pecanha'', obtido ''%''', v_obtido;
  end if;

  v_obtido := public.colaborador_chave('Ção Ñandú Ünico');
  if v_obtido = 'cao nandu unico' then
    v_ok := v_ok + 1; raise notice '✓ a5 colaborador_chave(''Ção Ñandú Ünico'') = ''%''', v_obtido;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'a5; '; raise warning '✗ a5 esperado ''cao nandu unico'', obtido ''%''', v_obtido;
  end if;

  v_obtido := public.colaborador_chave(E'Maria\tdos\nSantos');
  if v_obtido = 'maria dos santos' then
    v_ok := v_ok + 1; raise notice '✓ a6 colaborador_chave(E''Maria\tdos\nSantos'') = ''%''', v_obtido;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'a6; '; raise warning '✗ a6 esperado ''maria dos santos'', obtido ''%''', v_obtido;
  end if;

  v_obtido := public.colaborador_chave(E'\tFulano\r\n');
  if v_obtido = 'fulano' then
    v_ok := v_ok + 1; raise notice '✓ a7 colaborador_chave(E''\tFulano\r\n'') = ''%''', v_obtido;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'a7; '; raise warning '✗ a7 esperado ''fulano'', obtido ''%''', v_obtido;
  end if;

  -- a8 — a coluna GERADA usa a MESMA função (não uma cópia da regra).
  insert into public.colaboradores (nome, criado_por)
    values ('Fulano ZZF37A Chave', k_prof)
    returning nome_chave into v_obtido;
  if v_obtido = public.colaborador_chave('Fulano ZZF37A Chave') then
    v_ok := v_ok + 1; raise notice '✓ a8 a coluna GERADA nome_chave devolve o mesmo valor que colaborador_chave() direto (''%'')', v_obtido;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'a8; '; raise warning '✗ a8 esperado ''%'' (função direta), obtido ''%'' (coluna gerada)',
      public.colaborador_chave('Fulano ZZF37A Chave'), v_obtido;
  end if;

  -- =============================================================
  -- b — O ÍNDICE ÚNICO recusa a segunda grafia (mesma chave normalizada)
  -- =============================================================
  insert into public.colaboradores (nome, criado_por) values ('Fulano ZZF37B Duplicado', k_prof);
  begin
    insert into public.colaboradores (nome, criado_por) values ('FULANO ZZF37B DUPLICADO', k_prof);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'b1; '; raise warning '✗ b1 a segunda grafia foi ACEITA — o índice único deveria recusar (mesma nome_chave)';
  exception when unique_violation then
    v_ok := v_ok + 1; raise notice '✓ b1 segunda grafia (mesma chave normalizada) recusada pelo índice único (sqlstate %)', sqlstate;
  when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'b1; '; raise warning '✗ b1 recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  -- =============================================================
  -- c — A TABELA recusa nome em branco
  -- =============================================================
  begin
    insert into public.colaboradores (nome, criado_por) values ('   ', k_prof);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'c1; '; raise warning '✗ c1 nome em branco foi ACEITO — deveria ser recusado (colaboradores_nome_nao_vazio)';
  exception when check_violation then
    v_ok := v_ok + 1; raise notice '✓ c1 nome em branco recusado pelo check colaboradores_nome_nao_vazio (sqlstate %)', sqlstate;
  when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'c1; '; raise warning '✗ c1 recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  -- =============================================================
  -- d — O VÍNCULO DO REGISTRO NOVO: as DUAS colunas ficam gravadas
  -- =============================================================
  insert into public.colaboradores (nome, criado_por)
    values ('Fulano ZZF37D Vinculo', k_prof)
    returning id into v_colab_id;

  -- d1 — movimentacoes: colaborador (texto) E colaborador_id juntos, no INSERT.
  insert into public.ativos (patrimonio, categoria, filial_id)
    values ('ZZF37D001', 'notebook', v_matriz)
    returning id into a;
  insert into public.movimentacoes (ativo_id, tipo, colaborador, colaborador_id, setor, filial_id, criado_por)
    values (a, 'saida', 'Fulano ZZF37D Vinculo', v_colab_id, 'TI', v_matriz, k_prof)
    returning id into v_mov_id;
  select colaborador, colaborador_id into v_mov_colab_txt, v_mov_colab_id
    from public.movimentacoes where id = v_mov_id;
  if v_mov_colab_txt = 'Fulano ZZF37D Vinculo' and v_mov_colab_id = v_colab_id then
    v_ok := v_ok + 1; raise notice '✓ d1 movimentacoes grava colaborador (texto) E colaborador_id no mesmo INSERT';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'd1; '; raise warning '✗ d1 esperado texto=''Fulano ZZF37D Vinculo'' e id=%, obtido texto=''%'' id=%',
      v_colab_id, coalesce(v_mov_colab_txt, '(null)'), coalesce(v_mov_colab_id::text, '(null)');
  end if;

  -- d2 — lancamentos_item: precisa de uma 'entrada' antes da 'saida' (trigger
  -- valida_lancamento_item recusa saldo negativo — molde itens_quantidade.sql).
  insert into public.itens (nome, grupo, ordem) values ('TESTE F37 Item Vinculo', 'acessorio', 996)
    returning id into v_item;
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por)
    values (v_item, v_matriz, 'entrada', 10, current_date, k_prof);
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, colaborador, colaborador_id, data, criado_por)
    values (v_item, v_matriz, 'saida', 3, 'Fulano ZZF37D Vinculo', v_colab_id, current_date, k_prof)
    returning id into v_lanc_id;
  select colaborador, colaborador_id into v_lanc_colab_txt, v_lanc_colab_id
    from public.lancamentos_item where id = v_lanc_id;
  if v_lanc_colab_txt = 'Fulano ZZF37D Vinculo' and v_lanc_colab_id = v_colab_id then
    v_ok := v_ok + 1; raise notice '✓ d2 lancamentos_item grava colaborador (texto) E colaborador_id no mesmo INSERT';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'd2; '; raise warning '✗ d2 esperado texto=''Fulano ZZF37D Vinculo'' e id=%, obtido texto=''%'' id=%',
      v_colab_id, coalesce(v_lanc_colab_txt, '(null)'), coalesce(v_lanc_colab_id::text, '(null)');
  end if;

  -- =============================================================
  -- e — ASSERÇÃO NEGATIVA: guarda_acervo recusa UPDATE de colaborador_id,
  --     mesmo rodando como o DONO (que ignora RLS — molde dev_destrutivo.sql)
  -- =============================================================
  begin
    update public.movimentacoes set colaborador_id = v_colab_id where id = v_mov_id;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'e1; '; raise warning '✗ e1 o UPDATE de colaborador_id em movimentacoes foi ACEITO — guarda_acervo deveria recusar';
  exception when others then
    if sqlerrm like '%imutável%' then
      v_ok := v_ok + 1; raise notice '✓ e1 UPDATE de colaborador_id em movimentacoes recusado pela guarda_acervo (sqlstate %)', sqlstate;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || 'e1; '; raise warning '✗ e1 recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
    end if;
  end;

  begin
    update public.lancamentos_item set colaborador_id = v_colab_id where id = v_lanc_id;
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'e2; '; raise warning '✗ e2 o UPDATE de colaborador_id em lancamentos_item foi ACEITO — guarda_acervo deveria recusar';
  exception when others then
    if sqlerrm like '%imutável%' then
      v_ok := v_ok + 1; raise notice '✓ e2 UPDATE de colaborador_id em lancamentos_item recusado pela guarda_acervo (sqlstate %)', sqlstate;
    else
      v_falhas := v_falhas + 1; v_msgs := v_msgs || 'e2; '; raise warning '✗ e2 recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
    end if;
  end;

  -- =============================================================
  -- f — A VIEW v_colaboradores_textos agrupa e conta certo (só o grupo fictício,
  --     nunca contagem absoluta — a lição do teto de 1.000 linhas)
  -- =============================================================
  v_chave := public.colaborador_chave('Fulano ZZF37');

  insert into public.ativos (patrimonio, categoria, filial_id) values ('ZZF37F001', 'notebook', v_matriz) returning id into a;
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'saida', 'Fulano ZZF37', 'TI', v_matriz, k_prof);

  insert into public.ativos (patrimonio, categoria, filial_id) values ('ZZF37F002', 'notebook', v_matriz) returning id into a;
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'saida', 'FULANO ZZF37', 'TI', v_matriz, k_prof);

  insert into public.ativos (patrimonio, categoria, filial_id) values ('ZZF37F003', 'notebook', v_matriz) returning id into a;
  insert into public.movimentacoes (ativo_id, tipo, colaborador, setor, filial_id, criado_por)
    values (a, 'saida', 'fulano  zzf37', 'TI', v_matriz, k_prof);

  select ocorrencias, grafias, ja_cadastrado into v_ocorrencias, v_grafias, v_ja_cad
    from public.v_colaboradores_textos where nome_chave = v_chave;
  if v_ocorrencias = 3 and v_grafias = 3 and v_ja_cad is false then
    v_ok := v_ok + 1; raise notice '✓ f1 a view agrupa as 3 grafias na mesma chave (ocorrencias=%, grafias=%, ja_cadastrado=false)',
      v_ocorrencias, v_grafias;
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'f1; '; raise warning '✗ f1 esperado ocorrencias=3/grafias=3/ja_cadastrado=false, obtido %/%/%',
      coalesce(v_ocorrencias::text, '(null)'), coalesce(v_grafias::text, '(null)'), coalesce(v_ja_cad::text, '(null)');
  end if;

  insert into public.colaboradores (nome, criado_por) values ('Fulano ZZF37', k_prof)
    returning id into v_colab_id2;

  select ja_cadastrado, colaborador_id into v_ja_cad, v_colab_view_id
    from public.v_colaboradores_textos where nome_chave = v_chave;
  if v_ja_cad is true and v_colab_view_id = v_colab_id2 then
    v_ok := v_ok + 1; raise notice '✓ f2 depois do cadastro a view marca ja_cadastrado=true com colaborador_id correto';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'f2; '; raise warning '✗ f2 esperado ja_cadastrado=true e colaborador_id=%, obtido ja_cadastrado=% colaborador_id=%',
      v_colab_id2, coalesce(v_ja_cad::text, '(null)'), coalesce(v_colab_view_id::text, '(null)');
  end if;

  -- f3 (migration 0115, revisão de 28/08/2026) — GRUPO QUE NÃO É PESSOA NENHUMA
  --     não entra na fila.
  --
  -- Por que isto merece asserção própria: o filtro da 0112 era
  -- `btrim(coalesce(colaborador,'')) <> ''`, e `btrim` de UM argumento apara SÓ o
  -- espaço ASCII. Um nome de tab/CR atravessava e virava grupo de chave VAZIA —
  -- somado pelo resumo (`v_colaboradores_consolidacao`) e descartado pela lista, ou
  -- seja, uma pendência que a tela mostrava e ninguém conseguia zerar. Com NBSP a
  -- chave nem vazia ficava: virava linha de nome invisível que a consolidação
  -- recusaria no check `colaboradores_nome_nao_vazio`.
  --
  -- Três inserts, um por caractere, e a asserção é sobre o TOTAL de grupos sem
  -- pessoa na view inteira — que tem de ser ZERO mesmo com eles no acervo. Note que
  -- as três linhas SÃO gravadas: a prova é que a view as ignora, não que o banco as
  -- recuse (ele não recusa, e não é papel dele).
  insert into public.ativos (patrimonio, categoria, filial_id) values ('ZZF37F004', 'notebook', v_matriz) returning id into a;
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (a, 'saida', E'\t', v_matriz, k_prof);

  insert into public.ativos (patrimonio, categoria, filial_id) values ('ZZF37F005', 'notebook', v_matriz) returning id into a;
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (a, 'saida', E'\r\n', v_matriz, k_prof);

  insert into public.ativos (patrimonio, categoria, filial_id) values ('ZZF37F006', 'notebook', v_matriz) returning id into a;
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (a, 'saida', chr(160), v_matriz, k_prof);

  select count(*) into v_cnt from public.v_colaboradores_textos
   where btrim(coalesce(nome_chave, ''),
               ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(160)) = '';
  if v_cnt = 0 then
    v_ok := v_ok + 1;
    raise notice '✓ f3 nome só de tab/CR/NBSP não vira grupo na fila (0 grupos sem pessoa, com as 3 linhas gravadas)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'f3; ';
    raise warning '✗ f3 a fila tem % grupo(s) que não são pessoa nenhuma — o filtro da 0115 não está valendo', v_cnt;
  end if;

  -- f4 — a outra metade do mesmo defeito: a LISTA e o RESUMO têm de contar a MESMA
  -- coisa. Era essa igualdade que o grupo fantasma quebrava, e é ela que o operador
  -- enxerga (o cartão "Nomes sem cadastro" × as linhas da tabela).
  --
  -- O nome abaixo existe para a asserção não ser `0 = 0`. Neste ponto do roteiro o
  -- único grupo de nome de gente (`Fulano ZZF37`) JÁ ganhou cadastro no f2, e num
  -- banco recém-migrado do CI não há mais nada: sem esta linha, os dois lados
  -- valeriam zero e o teste passaria mesmo com a view quebrada. Ele é o grupo
  -- PENDENTE que os dois lados têm de enxergar.
  insert into public.ativos (patrimonio, categoria, filial_id) values ('ZZF37F007', 'notebook', v_matriz) returning id into a;
  insert into public.movimentacoes (ativo_id, tipo, colaborador, filial_id, criado_por)
    values (a, 'saida', 'Ciclano ZZF37 Pendente', v_matriz, k_prof);

  select count(*) into v_cnt from public.v_colaboradores_textos where not ja_cadastrado;
  select coalesce(grupos, 0) into v_grupos_resumo
    from public.v_colaboradores_consolidacao where ja_cadastrado = false;
  if v_cnt >= 1 and v_cnt = coalesce(v_grupos_resumo, 0) then
    v_ok := v_ok + 1;
    raise notice '✓ f4 lista e resumo contam o mesmo número de grupos pendentes (%, e não zero dos dois lados)', v_cnt;
  elsif v_cnt < 1 then
    -- Não é "passou": é o teste avisando que perdeu o poder de medir.
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'f4; ';
    raise warning '✗ f4 nenhum grupo pendente na fila — o caso do teste sumiu, e a igualdade viraria 0 = 0';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'f4; ';
    raise warning '✗ f4 lista diz % grupo(s) pendente(s) e o resumo diz % — números que a tela mostra lado a lado',
      v_cnt, coalesce(v_grupos_resumo::text, '(null)');
  end if;

  -- =============================================================
  -- g — tipos_item: o vocabulário fechado da F37/D7
  -- =============================================================
  select count(*) into v_cnt from public.tipos_item;
  if v_cnt = 7 then
    v_ok := v_ok + 1; raise notice '✓ g1 tipos_item tem exatamente 7 linhas';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'g1; '; raise warning '✗ g1 esperado 7 linhas em tipos_item, obtido %', v_cnt;
  end if;

  v_slugs_esperados := array['cabo', 'carregador', 'fone', 'mochila', 'mouse', 'mousepad', 'teclado'];
  select coalesce(array_agg(slug order by slug), array[]::text[]) into v_slugs_obtidos from public.tipos_item;
  if v_slugs_obtidos = v_slugs_esperados then
    v_ok := v_ok + 1; raise notice '✓ g2 os 7 slugs batem exatamente com o esperado: %', array_to_string(v_slugs_obtidos, ', ');
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'g2; '; raise warning '✗ g2 esperado %, obtido %',
      array_to_string(v_slugs_esperados, ', '), array_to_string(v_slugs_obtidos, ', ');
  end if;

  select rotulo into v_rotulo from public.tipos_item where slug = 'fone';
  if v_rotulo = 'Fone de ouvido' then
    v_ok := v_ok + 1; raise notice '✓ g3 o slug fone exibe o rótulo "Fone de ouvido"';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'g3; '; raise warning '✗ g3 esperado "Fone de ouvido", obtido %', coalesce(v_rotulo, '(null)');
  end if;

  begin
    insert into public.tipos_item (slug, rotulo) values ('Fone Maiusculo', 'Teste');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'g4; '; raise warning '✗ g4 slug fora do formato foi ACEITO — deveria ser recusado (tipos_item_slug_formato)';
  exception when check_violation then
    v_ok := v_ok + 1; raise notice '✓ g4 slug fora do formato (''Fone Maiusculo'') recusado pelo check (sqlstate %)', sqlstate;
  when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'g4; '; raise warning '✗ g4 recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  begin
    insert into public.tipos_item (slug, rotulo) values ('carregador', 'Duplicado');
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'g5; '; raise warning '✗ g5 slug duplicado foi ACEITO — deveria ser recusado pelo unique de slug';
  exception when unique_violation then
    v_ok := v_ok + 1; raise notice '✓ g5 slug duplicado (''carregador'') recusado pelo unique (sqlstate %)', sqlstate;
  when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'g5; '; raise warning '✗ g5 recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  -- =============================================================
  -- h — itens.tipo_id é ANULÁVEL; a FK recusa tipo inexistente
  -- =============================================================
  insert into public.itens (nome, grupo, ordem, tipo_id) values ('TESTE F37 Item SemTipo', 'acessorio', 995, null)
    returning id, tipo_id into v_item2, v_tipo_id;
  if v_tipo_id is null then
    v_ok := v_ok + 1; raise notice '✓ h1 itens.tipo_id é anulável — item de catálogo criado sem tipo';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'h1; '; raise warning '✗ h1 esperado tipo_id null, obtido %', v_tipo_id;
  end if;

  begin
    insert into public.itens (nome, grupo, ordem, tipo_id) values ('TESTE F37 Item TipoInvalido', 'acessorio', 994, 32000);
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'h2; '; raise warning '✗ h2 tipo_id inexistente foi ACEITO — a FK deveria recusar';
  exception when foreign_key_violation then
    v_ok := v_ok + 1; raise notice '✓ h2 tipo_id inexistente (32000) recusado pela FK (sqlstate %)', sqlstate;
  when others then
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'h2; '; raise warning '✗ h2 recusado, mas por outro motivo (sqlstate % / %)', sqlstate, sqlerrm;
  end;

  -- =============================================================
  -- i — NENHUM slug do histórico ficou órfão de tipos_item (0 órfãos, nunca
  --     contagem absoluta — mesma query da smoke da 0114, aqui como asserção)
  -- =============================================================
  select count(*) into v_orfaos
    from (
      select unnest(itens_faltantes) as slug from public.movimentacoes
      union
      select item from public.pendencias_item
    ) f
   where f.slug is not null
     and not exists (select 1 from public.tipos_item t where t.slug = f.slug);
  if v_orfaos = 0 then
    v_ok := v_ok + 1; raise notice '✓ i1 todo slug de itens_faltantes/pendencias_item.item tem tipo correspondente em tipos_item (0 órfãos)';
  else
    v_falhas := v_falhas + 1; v_msgs := v_msgs || 'i1; '; raise warning '✗ i1 esperado 0 slugs órfãos, obtido % — o seed da 0114 não cobre todo o histórico', v_orfaos;
  end if;

  insert into _f37_resumo values (v_ok, v_falhas, nullif(v_msgs, ''));
  if v_falhas = 0 then
    raise notice '=== f37_colaboradores_tipos: % asserções OK, 0 falhas ===', v_ok;
  else
    raise warning '✗ TOTAL f37_colaboradores_tipos: % falha(s) — %', v_falhas, v_msgs;
  end if;
  raise notice 'FIM f37_colaboradores_tipos: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

select * from _f37_resumo;

rollback;
