-- =============================================================
-- Roteiro de teste: RPC public.importar_ativos_substituir (import de startup,
-- modo "Substituir tudo"). Última definição vigente = migration 0048; nenhum
-- roteiro cobria a RPC até aqui. Este arquivo é NOVO e independente (não mexe
-- nos demais roteiros — lição F15/F17).
--
-- Cobre uma SEÇÃO 0 e 4 cenários (regras R-IMP-* da spec §10.2 + hardening 0040):
--   0. F51 (0131) — cada auxiliar do import, exercitada ISOLADAMENTE, numa
--      terceira filial ('F19 Teste C') para não tocar o que os cenários 1→4 leem:
--        0a  import_validar_plano recusa plano vazio;
--        0b  import_revalidar_contagens recusa contagem que não bate com o vivo;
--        0c  import_contar_conflitos = 0 numa filial sem conflito;
--        0d  import_gravar_trilha devolve log_id e grava a linha;
--        0e  as 8 auxiliares estão FECHADAS nos quatro papéis (ACL real);
--        0f  import_conferir_resultado acusa estado fora do alvo (o caminho que
--            o import feliz NUNCA percorre);
--        0g  import_apagar_acervo_filial esvazia a filial e devolve as contagens;
--        0h  o par import_criar_ativos + import_lancar_movimentacoes.
--      A seção roda como `postgres` — ver a nota no corpo sobre por que isso
--      NÃO contradiz o `revoke` das auxiliares.
--   1. Happy path — plano de 2 ativos fictícios numa FILIAL DE TESTE nova:
--        1a  o retorno traz ativos_criados = 2;
--        1b  a filial passa a ter os 2 ativos;
--        1c  o ativo SEM service tag nasce com pendência 'sem service tag' (R-IMP-10);
--        1d  o ativo com patrimônio + tag nasce SEM pendência (controle);
--        1e  cada compra de abertura tem observação 'import startup …' (R-IMP-13, baseline).
--   2. p_contagens NULL  → a RPC RECUSA (R-IMP-21 / janela TOCTOU fechada na 0040).
--   3. p_backup_path ''  → a RPC RECUSA (R-IMP-19, import destrutivo exige backup).
--   4. "Substituir tudo" apaga SÓ a filial-alvo:
--        4a  um ativo pré-existente fora do plano some; sobra só o do plano (R-IMP-02);
--        4b  o ativo do plano nasce com origem 'importacao';
--        4c  OUTRA filial fica intacta (R-IMP-03 — a RPC nunca toca relatorios_gerados
--            nem o acervo de outra filial).
--
-- F52 (migration 0132) — FIXTURE, não expectativa. As três guardas novas de
-- import_validar_plano (cascata de backup sob o prefixo da filial + objeto existente
-- em storage.objects, confirmação digitada = nome da filial, idempotência de 24h por
-- arquivo_hash) entram ANTES de tudo o que este roteiro já testava. Todo caminho POSITIVO
-- (seções 0a, 1, 2 e 4) passou a exigir: backup real sob `import/filial-<id>/`, a chave
-- `confirmacao` no plano e — quando dois imports tocam a mesma filial na mesma transação —
-- `arquivoHash` distinto entre eles. Nenhuma asserção mudou de SIGNIFICADO: só os
-- caminhos, os objetos de storage e as chaves dos planos foram corrigidos para o formato
-- real. O PAR recusa/aceita de cada guarda nova (a prova de que ela é no-op verificável)
-- já está coberto por `supabase/tests/import_fora_da_unidade.sql` — este roteiro não o
-- duplica.
--
-- Convenção do job `banco` do CI: cada asserção emite
--   NOTICE  '✓ …'  quando bate com o esperado;
--   WARNING '✗ …'  quando NÃO bate (o CI falha em qualquer `WARNING: ✗`).
-- Cenários NEGATIVOS (2 e 3) DEVEM falhar no banco: capturamos a exceção e
-- marcamos ✓ quando a mensagem é a esperada (e ✗ se falhar por outro motivo).
--
-- A RPC exige auth.uid() não-nulo: usamos o primeiro profile como operador e
-- injetamos o contexto via set_config('request.jwt.claims', {sub}, true).
-- Trabalhamos em DUAS filiais fictícias criadas aqui ('F19 Teste A/B') para não
-- tocar acervo existente. Tudo dentro de begin;…rollback;: NADA é persistido.
-- Pré-requisitos: >= 1 profile (operador) e migrations 0031→0048 aplicadas.
--
-- Dados 100% fictícios (prefixo ZZF19 para não colidir com o índice único global
-- (patrimonio, coalesce(service_tag,'')); "WAP0001234" só no cenário 1, pareado a
-- uma tag ZZF19 única → o par nunca colide). NUNCA dado real.
-- =============================================================

begin;

do $$
declare
  v_ok      int := 0;   -- F45: quantas asserções passaram
  v_falhas  int := 0;   -- F45: quantas falharam (a linha FIM soma as duas)
  v_prof      uuid;
  v_fa        smallint;   -- F19 Teste A (happy path + negativos)
  v_fb        smallint;   -- F19 Teste B (substituir tudo)
  v_fc        smallint;   -- F51 Teste C (seção 0 — as auxiliares, isoladas)
  v_result    jsonb;
  v_cnt       int;
  v_cnt2      int;
  v_pend      text;
  v_obs       text;
  v_fa_before int;
  p_plano_a   jsonb;
  p_plano_b   jsonb;
  -- F51 · seção 0
  v_total     int;
  v_apagado   jsonb;
  v_log       uuid;
  v_ativo_c   uuid;
  v_abertas   int;
  p_plano_c   jsonb;
  -- F52 (migration 0132): a cascata de backup + confirmação digitada + idempotência
  -- agora vivem dentro de import_validar_plano — os planos e caminhos deste roteiro
  -- precisam refletir isso (ver docs/DECISOES.md, F52).
  v_prefixo_a text;   -- prefixo do backup da filial A (import/filial-<id>/)
  v_prefixo_b text;   -- idem, filial B
  v_prefixo_c text;   -- idem, filial C
  p_plano_a2  jsonb;  -- variante de p_plano_a com arquivoHash distinto (cenário 2 —
                      -- evita colidir com o hash já gravado por import_gravar_trilha
                      -- no cenário 1, dentro da mesma janela de 24h)
begin
  -- F38: perfil ATIVO e escolha DETERMINÍSTICA. O `limit 1` sem `order by` e sem
  -- filtro podia cair num perfil DESATIVADO (`papel_atual()` devolve null para ele
  -- desde a 0070) — e aí toda guarda de cargo recusava com 42501, num roteiro que
  -- passava verde ontem. É a mesma classe de não-determinismo da pendência nº 5 da
  -- F37, só que em quem o roteiro escolhe como autor.
  select id into v_prof from public.profiles
   where ativo and excluido_em is null
   order by created_at, id limit 1;
  if v_prof is null then
    raise exception 'PRE-REQUISITO: crie ao menos 1 operador (profile) antes de rodar este roteiro';
  end if;

  -- F21: o import passou a exigir ADMIN (guarda `e_admin()` no corpo da RPC, migration 0064).
  -- Este roteiro roda como `postgres`, mas a RPC lê o cargo do PERFIL apontado por
  -- `auth.uid()` — e num Postgres novo do CI o perfil de teste nasce com o default
  -- `'operador'` (a 0061 só faz backfill dos perfis que JÁ existiam quando ela rodou; o
  -- `ci@wap.ind.br` é criado depois). Sem esta linha o roteiro morre com "Apenas
  -- administradores podem executar o import de startup." — foi o que derrubou o job `banco`
  -- no primeiro push da F21.
  --
  -- Promover o perfil de teste é o certo, e não afrouxar a guarda: o import É operação de
  -- administrador desde a F21, então o roteiro tem de rodar como um. Dentro de
  -- `begin; … rollback;` — nada sobra.
  update public.profiles set papel = 'admin' where id = v_prof;

  -- contexto de operador (auth.uid() lê request.jwt.claims->>'sub')
  perform set_config('request.jwt.claims', json_build_object('sub', v_prof)::text, true);
  if auth.uid() is null then
    raise exception 'PRE-REQUISITO: auth.uid() ficou nulo — contexto de operador não aplicado';
  end if;

  -- filiais de teste (id smallint identity → gerado; slug único, inéditos)
  insert into public.filiais (slug, nome) values ('zzf19-teste-a', 'F19 Teste A') returning id into v_fa;
  insert into public.filiais (slug, nome) values ('zzf19-teste-b', 'F19 Teste B') returning id into v_fb;
  insert into public.filiais (slug, nome) values ('zzf19-teste-c', 'F19 Teste C') returning id into v_fc;

  -- F52 (migration 0132): desde a 0132, import_validar_plano exige que o backup
  -- informado esteja sob o prefixo import/filial-<id>/ DESTA filial e que o objeto
  -- exista de verdade em storage.objects (bucket backups-import) — mesma técnica de
  -- `supabase/tests/import_fora_da_unidade.sql`. Um objeto "existe.json" por filial
  -- de teste cobre todo caminho positivo deste roteiro (cenários 1, 2, 4 e a seção 0a).
  v_prefixo_a := public.prefixo_backup_import(v_fa);
  v_prefixo_b := public.prefixo_backup_import(v_fb);
  v_prefixo_c := public.prefixo_backup_import(v_fc);

  insert into storage.objects (bucket_id, name, owner) values
    ('backups-import', v_prefixo_a || 'existe.json', v_prof),
    ('backups-import', v_prefixo_b || 'existe.json', v_prof),
    ('backups-import', v_prefixo_c || 'existe.json', v_prof);

  -- ===============================================================
  -- SEÇÃO 0 (F51) — cada auxiliar do import, exercitada ISOLADAMENTE
  -- ===============================================================
  -- Por que ela existe: desde a 0131 a RPC é uma ORQUESTRADORA sobre oito
  -- auxiliares (`import_validar_plano`, `import_revalidar_contagens`,
  -- `import_apagar_acervo_filial`, `import_criar_ativos`,
  -- `import_lancar_movimentacoes`, `import_conferir_resultado`,
  -- `import_contar_conflitos`, `import_gravar_trilha`). Os cenários 1→4 provam
  -- o COMPORTAMENTO DE PONTA A PONTA e continuam idênticos ao que provavam antes
  -- da decomposição — é essa igualdade, rótulo a rótulo, que é a prova de
  -- equivalência da F51. O que eles NÃO fazem é acusar uma auxiliar que quebre
  -- num caminho que o caminho feliz não percorre: `import_conferir_resultado`
  -- nunca lança quando o import dá certo, e `import_contar_conflitos` /
  -- `import_gravar_trilha` não têm asserção própria em lugar nenhum. Sem esta
  -- seção, as mutações dessas três seriam "não detectadas" por CONJUNTO VAZIO —
  -- exatamente o defeito que o injetor existe para acusar.
  --
  -- ⚠ ESTA SEÇÃO RODA COMO `postgres`, E ISSO NÃO CONTRADIZ O `revoke`.
  -- As oito nascem com `revoke all … from public, anon, authenticated,
  -- service_role`: nenhuma é alcançável pela API. Mas `revoke` NÃO ALCANÇA O
  -- DONO — o dono de uma função sempre pode executá-la, e o roteiro inteiro roda
  -- na role de conexão do psql (`postgres`), sem `set local role` em lugar
  -- nenhum. Então poder chamá-las aqui não prova que elas estejam abertas, e não
  -- contradiz coisa alguma. Quem prova que estão FECHADAS é a asserção `0e`
  -- abaixo, que lê o ACL real com `has_function_privilege` e `proacl`.
  --
  -- Trabalha numa TERCEIRA filial ('F19 Teste C'), de propósito: as filiais A e B
  -- têm de chegar aos cenários 1→4 exatamente como chegavam antes, ou a
  -- comparação antes × depois deixaria de significar alguma coisa.

  -- 0a — import_validar_plano RECUSA plano vazio (bloco 1c da 0094).
  -- F52: para a execução CHEGAR no bloco 1c, o backup e a confirmação (blocos 1b e
  -- 1b-ter, que agora vêm ANTES) têm de passar — backup sob o prefixo da filial C e
  -- existente em storage.objects, confirmação = nome da filial. Sem arquivoHash: a
  -- guarda de idempotência (1b-quater) é pulada de propósito (v_hash = '').
  begin
    v_total := public.import_validar_plano(
      jsonb_build_object('filialId', v_fc, 'confirmacao', 'F19 Teste C', 'ativos', '[]'::jsonb),
      v_prefixo_c || 'existe.json', '[]'::jsonb, v_fc);
    v_falhas := v_falhas + 1; raise warning '✗ 0a plano vazio: import_validar_plano NÃO recusou (deveria)';
  exception when others then
    if sqlerrm like '%vazio%' then
      v_ok := v_ok + 1; raise notice '✓ 0a import_validar_plano recusa plano vazio: %', sqlerrm;
    else
      v_falhas := v_falhas + 1; raise warning '✗ 0a recusou por motivo INESPERADO: %', sqlerrm;
    end if;
  end;

  -- 0b — import_revalidar_contagens RECUSA contagens que não batem com o vivo.
  -- A filial C está vazia (0 ativos); passamos 7 de propósito.
  begin
    perform public.import_revalidar_contagens(
      jsonb_build_object('ativos',7,'movimentacoes',0,'anotacoes',0,'termos',0), v_fc);
    v_falhas := v_falhas + 1; raise warning '✗ 0b contagens divergentes: import_revalidar_contagens NÃO recusou (deveria)';
  exception when others then
    if sqlerrm like '%mudou desde o preview%' then
      v_ok := v_ok + 1; raise notice '✓ 0b import_revalidar_contagens recusa contagem divergente: %', sqlerrm;
    else
      v_falhas := v_falhas + 1; raise warning '✗ 0b recusou por motivo INESPERADO: %', sqlerrm;
    end if;
  end;

  -- 0c — import_contar_conflitos devolve 0 numa filial sem conflito nenhum.
  v_cnt := public.import_contar_conflitos(v_fc);
  if v_cnt = 0 then
    v_ok := v_ok + 1; raise notice '✓ 0c import_contar_conflitos = 0 numa filial sem conflito';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 0c import_contar_conflitos: esperado 0, obtido %', v_cnt;
  end if;

  -- 0d — import_gravar_trilha grava a linha e devolve o id.
  -- F52: import_gravar_trilha não valida storage.objects (só import_validar_plano faz);
  -- o caminho aqui só precisa seguir o formato real — sem exigir o objeto no bucket.
  v_log := public.import_gravar_trilha(
    jsonb_build_object('arquivoHash','ZZF19HASHC','totalLinhasDados',1),
    v_fc, v_prefixo_c || 'trilha-0d.json', '[]'::jsonb, v_prof, 1, 0, 0, 0, 0);
  select count(*) into v_cnt from public.import_logs where id = v_log;
  if v_log is not null and v_cnt = 1 then
    v_ok := v_ok + 1; raise notice '✓ 0d import_gravar_trilha devolveu log_id e gravou a linha em import_logs';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 0d import_gravar_trilha: log_id=% linhas=%', coalesce(v_log::text,'(null)'), v_cnt;
  end if;

  -- 0e — as OITO auxiliares estão FECHADAS. Lê o ACL real, não a intenção.
  --   `has_function_privilege` cobre anon/authenticated/service_role; o PUBLIC
  --   não é role e por isso é conferido no `proacl` (a entrada que começa com
  --   `=` é a do PUBLIC). É a lição da F50: revogar de `anon` sem revogar de
  --   `public` é no-op SILENCIOSO — o privilégio continua lá, por outro caminho.
  select count(*) into v_abertas
    from (values
      ('public.import_validar_plano(jsonb,text,jsonb,smallint)'),
      ('public.import_revalidar_contagens(jsonb,smallint)'),
      ('public.import_apagar_acervo_filial(smallint)'),
      ('public.import_criar_ativos(jsonb,smallint)'),
      ('public.import_lancar_movimentacoes(uuid,jsonb,smallint,uuid,date,text)'),
      ('public.import_conferir_resultado(jsonb,smallint,integer,integer)'),
      ('public.import_contar_conflitos(smallint)'),
      ('public.import_gravar_trilha(jsonb,smallint,text,jsonb,uuid,integer,integer,integer,integer,integer)')
    ) f(assinatura)
    cross join (values ('anon'),('authenticated'),('service_role')) r(rolname)
   where has_function_privilege(r.rolname, f.assinatura, 'execute');

  select v_abertas + count(*) into v_abertas
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'import\_%'
     and array_to_string(coalesce(p.proacl, '{}'::aclitem[]), ',') like '=%X%';

  if v_abertas = 0 then
    v_ok := v_ok + 1; raise notice '✓ 0e as 8 auxiliares do import estão fechadas nos quatro papéis (public, anon, authenticated, service_role)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 0e há % concessão(ões) de EXECUTE viva(s) nas auxiliares do import — a superfície de RPC cresceu', v_abertas;
  end if;

  -- 0f — import_conferir_resultado ACUSA estado que não bate com o plano (5b).
  --   Este é o cenário que os caminhos 1→4 nunca percorrem: no import feliz o
  --   estado SEMPRE bate, então a conferência nunca lança e uma quebra nela
  --   passaria despercebida.
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id)
  values ('ZZF19S0001', 'ZZF19STC1', 'notebook', v_fc) returning id into v_ativo_c;
  p_plano_c := jsonb_build_object(
    'filialId', v_fc, 'ativos', jsonb_build_array(
      jsonb_build_object('patrimonio','ZZF19S0001','serviceTag','ZZF19STC1',
                         'categoria','notebook','estadoAlvo','em_uso','colaborador','Fulano')));
  begin
    perform public.import_conferir_resultado(p_plano_c, v_fc, 1, 1);
    v_falhas := v_falhas + 1; raise warning '✗ 0f estado divergente: import_conferir_resultado NÃO acusou (o ativo está em_estoque, o plano pede em_uso)';
  exception when others then
    if sqlerrm like '%Divergência de estado%' then
      v_ok := v_ok + 1; raise notice '✓ 0f import_conferir_resultado acusa estado fora do alvo: %', sqlerrm;
    else
      v_falhas := v_falhas + 1; raise warning '✗ 0f acusou por motivo INESPERADO: %', sqlerrm;
    end if;
  end;

  -- 0g — import_apagar_acervo_filial apaga o acervo DA FILIAL e devolve as
  --   quatro contagens. Roda dentro da janela `estoque.dev_destrutivo`, que é
  --   aberta e fechada AQUI porque quem a abre é sempre quem orquestra — a
  --   auxiliar não tem essa chave, e essa é a razão de ela não ser uma terceira
  --   porta (0080/0081).
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
  values (v_ativo_c, 'compra', current_date, v_fc, 'ZZF19 seção 0', v_prof);
  insert into public.anotacoes (ativo_id, texto, criado_por) values (v_ativo_c, 'ZZF19 nota', v_prof);

  perform set_config('estoque.dev_destrutivo', 'on', true);
  v_apagado := public.import_apagar_acervo_filial(v_fc);
  perform set_config('estoque.dev_destrutivo', 'off', true);

  select count(*) into v_cnt from public.ativos where filial_id = v_fc;
  if v_cnt = 0
     and (v_apagado->>'movs_apagadas')::int = 1
     and (v_apagado->>'anotacoes_apagadas')::int = 1
     and (v_apagado->>'termos_apagados')::int = 0 then
    v_ok := v_ok + 1; raise notice '✓ 0g import_apagar_acervo_filial esvaziou a filial e devolveu as contagens (movs=1, anotações=1, termos=0)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 0g import_apagar_acervo_filial: ativos restantes=%, contagens=%', v_cnt, v_apagado;
  end if;

  -- 0h — import_criar_ativos + import_lancar_movimentacoes, o par que a
  --   orquestradora chama POR ATIVO (Decisão 2 da F51).
  v_ativo_c := public.import_criar_ativos(
    jsonb_build_object('patrimonio','ZZF19S0002','serviceTag','ZZF19STC2',
                       'categoria','notebook','estadoAlvo','em_uso','colaborador','Fulano'),
    v_fc);
  perform public.import_lancar_movimentacoes(
    v_ativo_c,
    jsonb_build_object('patrimonio','ZZF19S0002','serviceTag','ZZF19STC2',
                       'categoria','notebook','estadoAlvo','em_uso','colaborador','Fulano'),
    v_fc, v_prof, current_date, 'import startup 01/01/2026');
  select count(*) into v_cnt from public.movimentacoes
   where ativo_id = v_ativo_c and observacao like 'import startup%';
  select count(*) into v_cnt2 from public.ativos
   where id = v_ativo_c and origem = 'importacao' and status = 'em_uso' and colaborador_atual = 'Fulano';
  if v_cnt = 2 and v_cnt2 = 1 then
    v_ok := v_ok + 1; raise notice '✓ 0h o par criar+lançar produziu ativo importacao/em_uso com posse e as 2 movimentações marcadas';
  else
    v_falhas := v_falhas + 1; raise warning '✗ 0h par criar+lançar: movimentações marcadas=% (esperado 2), ativo conferido=% (esperado 1)', v_cnt, v_cnt2;
  end if;

  -- Limpa a filial C para que os cenários 1→4 encontrem o mundo como sempre
  -- encontraram. Nada disto persiste (o rollback do fim cuida), mas
  -- `import_contar_conflitos` do cenário 4 lê TODAS as filiais.
  perform set_config('estoque.dev_destrutivo', 'on', true);
  perform public.import_apagar_acervo_filial(v_fc);
  perform set_config('estoque.dev_destrutivo', 'off', true);

  -- ---------------------------------------------------------------
  -- CENARIO 1 — happy path: 2 ativos fictícios na filial A.
  --   ativo 1: WAP0001234 + service tag ZZF19ST01  → nasce sem pendência;
  --   ativo 2: ZZF190005678 SEM service tag ('')    → nasce 'sem service tag'.
  --   Ambos em_estoque (sem ajuste de reconciliação → só a compra de abertura).
  -- ---------------------------------------------------------------
  -- F52: confirmacao tem de casar com o nome da filial (upper/btrim tolerado); o
  -- backup tem de estar sob o prefixo desta filial e existir em storage.objects.
  p_plano_a := jsonb_build_object(
    'filialId', v_fa, 'confirmacao', 'F19 Teste A', 'arquivoHash', 'ZZF19HASHA', 'totalLinhasDados', 2,
    'ativos', jsonb_build_array(
      jsonb_build_object('patrimonio','WAP0001234','serviceTag','ZZF19ST01',
                         'categoria','notebook','estadoAlvo','em_estoque','marca','ZZ Marca'),
      jsonb_build_object('patrimonio','ZZF190005678','serviceTag','',
                         'categoria','notebook','estadoAlvo','em_estoque')
    )
  );
  v_result := public.importar_ativos_substituir(
    p_plano_a,
    v_prefixo_a || 'existe.json',
    jsonb_build_object('ativos',0,'movimentacoes',0,'anotacoes',0,'termos',0)   -- filial nova = 0,0,0,0
  );

  -- 1a — retorno
  if (v_result->>'ativos_criados') = '2' then
    v_ok := v_ok + 1; raise notice '✓ 1a retorno ativos_criados = 2';
  else v_falhas := v_falhas + 1; raise warning '✗ 1a retorno ativos_criados: esperado 2, obtido %', coalesce(v_result->>'ativos_criados','(null)'); end if;

  -- 1b — a filial passa a ter os 2 ativos
  select count(*) into v_cnt from public.ativos where filial_id = v_fa;
  if v_cnt = 2 then v_ok := v_ok + 1; raise notice '✓ 1b filial A tem 2 ativos após o import';
  else v_falhas := v_falhas + 1; raise warning '✗ 1b ativos na filial A: esperado 2, obtido %', v_cnt; end if;

  -- 1c — R-IMP-10: sem service tag → pendência contém 'sem service tag'
  select pendencia into v_pend from public.ativos where filial_id = v_fa and patrimonio = 'ZZF190005678';
  if coalesce(v_pend,'') like '%sem service tag%' then
    v_ok := v_ok + 1; raise notice '✓ 1c ativo sem service tag nasce com pendência "%" (R-IMP-10)', v_pend;
  else v_falhas := v_falhas + 1; raise warning '✗ 1c pendência sem-service-tag: esperado conter "sem service tag", obtido %', coalesce(v_pend,'(null)'); end if;

  -- 1d — controle: com patrimônio + tag → sem pendência
  select pendencia into v_pend from public.ativos where filial_id = v_fa and patrimonio = 'WAP0001234';
  if v_pend is null then v_ok := v_ok + 1; raise notice '✓ 1d ativo com patrimônio + service tag nasce sem pendência';
  else v_falhas := v_falhas + 1; raise warning '✗ 1d pendência WAP0001234: esperado null, obtido %', v_pend; end if;

  -- 1e — R-IMP-13: toda compra de abertura é baseline (observação 'import startup …')
  select count(*) into v_cnt from public.movimentacoes m
    join public.ativos a on a.id = m.ativo_id
   where a.filial_id = v_fa and m.tipo = 'compra' and m.observacao like 'import startup%';
  if v_cnt = 2 then v_ok := v_ok + 1; raise notice '✓ 1e as 2 compras de abertura têm observação "import startup …" (R-IMP-13, baseline)';
  else v_falhas := v_falhas + 1; raise warning '✗ 1e compras baseline: esperado 2 com "import startup%%", obtido %', v_cnt; end if;

  select m.observacao into v_obs from public.movimentacoes m
    join public.ativos a on a.id = m.ativo_id
   where a.filial_id = v_fa and a.patrimonio = 'WAP0001234' and m.tipo = 'compra' limit 1;
  if coalesce(v_obs,'') like 'import startup%' then
    v_ok := v_ok + 1; raise notice '✓ 1e (exemplo) observação da compra = "%"', v_obs;
  else v_falhas := v_falhas + 1; raise warning '✗ 1e observação da compra: esperado "import startup …", obtido %', coalesce(v_obs,'(null)'); end if;

  -- ---------------------------------------------------------------
  -- CENARIO 2 — R-IMP-21: p_contagens NULL DEVE ser recusado (janela TOCTOU
  --   fechada na 0040: sem a revalidação, um cliente forjado pularia a guarda e
  --   poderia apagar acervo que mudou entre o backup e o delete).
  --
  --   F52: import_validar_plano roda ANTES da revalidação de contagens dentro da
  --   orquestradora — então, para este cenário chegar até o bloco que ele testa, o
  --   plano tem de PASSAR pela cascata de backup/confirmação/idempotência primeiro.
  --   Reusar o arquivoHash do cenário 1 ('ZZF19HASHA') colidiria com a linha que o
  --   cenário 1 já gravou em import_logs para a filial A (idempotência de 24h) e
  --   recusaria por um motivo INESPERADO — por isso p_plano_a2 troca só o hash.
  -- ---------------------------------------------------------------
  p_plano_a2 := p_plano_a || jsonb_build_object('arquivoHash', 'ZZF19HASHA2');
  begin
    v_result := public.importar_ativos_substituir(p_plano_a2, v_prefixo_a || 'existe.json', null::jsonb);
    v_falhas := v_falhas + 1; raise warning '✗ 2 contagens NULL: NÃO falhou (deveria)';
  exception when others then
    if sqlerrm like '%contagens%' or sqlerrm like '%preview%' then
      v_ok := v_ok + 1; raise notice '✓ 2 contagens NULL rejeitado: %', sqlerrm;
    else
      v_falhas := v_falhas + 1; raise warning '✗ 2 falhou por motivo INESPERADO (não a revalidação): %', sqlerrm;
    end if;
  end;

  -- ---------------------------------------------------------------
  -- CENARIO 3 — R-IMP-19: p_backup_path vazio DEVE ser recusado (import
  --   destrutivo exige backup do acervo da filial antes do delete).
  -- ---------------------------------------------------------------
  begin
    v_result := public.importar_ativos_substituir(
      p_plano_a, '',
      jsonb_build_object('ativos',2,'movimentacoes',2,'anotacoes',0,'termos',0)
    );
    v_falhas := v_falhas + 1; raise warning '✗ 3 backup vazio: NÃO falhou (deveria)';
  exception when others then
    if sqlerrm like '%backup%' then
      v_ok := v_ok + 1; raise notice '✓ 3 backup vazio rejeitado: %', sqlerrm;
    else
      v_falhas := v_falhas + 1; raise warning '✗ 3 falhou por motivo INESPERADO (não a guarda de backup): %', sqlerrm;
    end if;
  end;

  -- ---------------------------------------------------------------
  -- CENARIO 4 — R-IMP-02/03: "Substituir tudo" apaga SÓ a filial-alvo.
  --   Um ativo pré-existente na filial B (fora do plano) some; a filial fica só
  --   com o(s) do plano; a filial A (outra) permanece intacta.
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id) values ('ZZF19OLD001', 'notebook', v_fb);
  select count(*) into v_fa_before from public.ativos where filial_id = v_fa;   -- outra filial (A) antes = 2

  -- F52: confirmacao = nome desta filial (B), backup sob o prefixo desta filial e
  -- existente em storage.objects.
  p_plano_b := jsonb_build_object(
    'filialId', v_fb, 'confirmacao', 'F19 Teste B', 'arquivoHash', 'ZZF19HASHB', 'totalLinhasDados', 1,
    'ativos', jsonb_build_array(
      jsonb_build_object('patrimonio','ZZF19NEW001','serviceTag','ZZF19STB1',
                         'categoria','notebook','estadoAlvo','em_estoque')
    )
  );
  v_result := public.importar_ativos_substituir(
    p_plano_b,
    v_prefixo_b || 'existe.json',
    jsonb_build_object('ativos',1,'movimentacoes',0,'anotacoes',0,'termos',0)   -- reflete o vivo (1 pré-existente, 0 movs)
  );

  -- 4a — R-IMP-02: filial B fica só com o ativo do plano; o velho sumiu
  select count(*) into v_cnt  from public.ativos where filial_id = v_fb;
  select count(*) into v_cnt2 from public.ativos where filial_id = v_fb and patrimonio = 'ZZF19OLD001';
  if v_cnt = 1 and v_cnt2 = 0 then
    v_ok := v_ok + 1; raise notice '✓ 4a filial B tem só o ativo do plano; o pré-existente foi apagado (R-IMP-02)';
  else v_falhas := v_falhas + 1; raise warning '✗ 4a filial B: esperado 1 ativo e velho=0, obtido % ativos e velho=%', v_cnt, v_cnt2; end if;

  -- 4b — o novo ativo veio do plano com origem 'importacao'
  select count(*) into v_cnt from public.ativos
   where filial_id = v_fb and patrimonio = 'ZZF19NEW001' and origem = 'importacao';
  if v_cnt = 1 then v_ok := v_ok + 1; raise notice '✓ 4b ativo do plano presente com origem = importacao';
  else v_falhas := v_falhas + 1; raise warning '✗ 4b ativo do plano (origem importacao): esperado 1, obtido %', v_cnt; end if;

  -- 4c — R-IMP-03: a outra filial (A) ficou intacta
  select count(*) into v_cnt from public.ativos where filial_id = v_fa;
  if v_cnt = v_fa_before then
    v_ok := v_ok + 1; raise notice '✓ 4c outra filial (A) intacta após substituir B: % ativos (R-IMP-03)', v_cnt;
  else v_falhas := v_falhas + 1; raise warning '✗ 4c filial A alterada por substituição de B: esperado %, obtido %', v_fa_before, v_cnt; end if;

  raise notice 'FIM import_substituir: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

-- Nada acima é persistido:
rollback;
