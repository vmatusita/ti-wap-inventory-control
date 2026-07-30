-- =============================================================
-- Roteiro de teste: RPC public.importar_ativos_substituir (import de startup,
-- modo "Substituir tudo"). Última definição vigente = migration 0048; nenhum
-- roteiro cobria a RPC até aqui. Este arquivo é NOVO e independente (não mexe
-- nos demais roteiros — lição F15/F17).
--
-- Cobre 4 cenários (regras R-IMP-* da spec §10.2 + hardening 0040):
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
  v_prof      uuid;
  v_fa        smallint;   -- F19 Teste A (happy path + negativos)
  v_fb        smallint;   -- F19 Teste B (substituir tudo)
  v_result    jsonb;
  v_cnt       int;
  v_cnt2      int;
  v_pend      text;
  v_obs       text;
  v_fa_before int;
  p_plano_a   jsonb;
  p_plano_b   jsonb;
begin
  select id into v_prof from public.profiles limit 1;
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

  -- ---------------------------------------------------------------
  -- CENARIO 1 — happy path: 2 ativos fictícios na filial A.
  --   ativo 1: WAP0001234 + service tag ZZF19ST01  → nasce sem pendência;
  --   ativo 2: ZZF190005678 SEM service tag ('')    → nasce 'sem service tag'.
  --   Ambos em_estoque (sem ajuste de reconciliação → só a compra de abertura).
  -- ---------------------------------------------------------------
  p_plano_a := jsonb_build_object(
    'filialId', v_fa, 'arquivoHash', 'ZZF19HASHA', 'totalLinhasDados', 2,
    'ativos', jsonb_build_array(
      jsonb_build_object('patrimonio','WAP0001234','serviceTag','ZZF19ST01',
                         'categoria','notebook','estadoAlvo','em_estoque','marca','ZZ Marca'),
      jsonb_build_object('patrimonio','ZZF190005678','serviceTag','',
                         'categoria','notebook','estadoAlvo','em_estoque')
    )
  );
  v_result := public.importar_ativos_substituir(
    p_plano_a,
    'backups-import/f19-teste-a.json',
    jsonb_build_object('ativos',0,'movimentacoes',0,'anotacoes',0,'termos',0)   -- filial nova = 0,0,0,0
  );

  -- 1a — retorno
  if (v_result->>'ativos_criados') = '2' then
    raise notice '✓ 1a retorno ativos_criados = 2';
  else raise warning '✗ 1a retorno ativos_criados: esperado 2, obtido %', coalesce(v_result->>'ativos_criados','(null)'); end if;

  -- 1b — a filial passa a ter os 2 ativos
  select count(*) into v_cnt from public.ativos where filial_id = v_fa;
  if v_cnt = 2 then raise notice '✓ 1b filial A tem 2 ativos após o import';
  else raise warning '✗ 1b ativos na filial A: esperado 2, obtido %', v_cnt; end if;

  -- 1c — R-IMP-10: sem service tag → pendência contém 'sem service tag'
  select pendencia into v_pend from public.ativos where filial_id = v_fa and patrimonio = 'ZZF190005678';
  if coalesce(v_pend,'') like '%sem service tag%' then
    raise notice '✓ 1c ativo sem service tag nasce com pendência "%" (R-IMP-10)', v_pend;
  else raise warning '✗ 1c pendência sem-service-tag: esperado conter "sem service tag", obtido %', coalesce(v_pend,'(null)'); end if;

  -- 1d — controle: com patrimônio + tag → sem pendência
  select pendencia into v_pend from public.ativos where filial_id = v_fa and patrimonio = 'WAP0001234';
  if v_pend is null then raise notice '✓ 1d ativo com patrimônio + service tag nasce sem pendência';
  else raise warning '✗ 1d pendência WAP0001234: esperado null, obtido %', v_pend; end if;

  -- 1e — R-IMP-13: toda compra de abertura é baseline (observação 'import startup …')
  select count(*) into v_cnt from public.movimentacoes m
    join public.ativos a on a.id = m.ativo_id
   where a.filial_id = v_fa and m.tipo = 'compra' and m.observacao like 'import startup%';
  if v_cnt = 2 then raise notice '✓ 1e as 2 compras de abertura têm observação "import startup …" (R-IMP-13, baseline)';
  else raise warning '✗ 1e compras baseline: esperado 2 com "import startup%%", obtido %', v_cnt; end if;

  select m.observacao into v_obs from public.movimentacoes m
    join public.ativos a on a.id = m.ativo_id
   where a.filial_id = v_fa and a.patrimonio = 'WAP0001234' and m.tipo = 'compra' limit 1;
  if coalesce(v_obs,'') like 'import startup%' then
    raise notice '✓ 1e (exemplo) observação da compra = "%"', v_obs;
  else raise warning '✗ 1e observação da compra: esperado "import startup …", obtido %', coalesce(v_obs,'(null)'); end if;

  -- ---------------------------------------------------------------
  -- CENARIO 2 — R-IMP-21: p_contagens NULL DEVE ser recusado (janela TOCTOU
  --   fechada na 0040: sem a revalidação, um cliente forjado pularia a guarda e
  --   poderia apagar acervo que mudou entre o backup e o delete).
  -- ---------------------------------------------------------------
  begin
    v_result := public.importar_ativos_substituir(p_plano_a, 'backups-import/f19-teste-a.json', null::jsonb);
    raise warning '✗ 2 contagens NULL: NÃO falhou (deveria)';
  exception when others then
    if sqlerrm like '%contagens%' or sqlerrm like '%preview%' then
      raise notice '✓ 2 contagens NULL rejeitado: %', sqlerrm;
    else
      raise warning '✗ 2 falhou por motivo INESPERADO (não a revalidação): %', sqlerrm;
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
    raise warning '✗ 3 backup vazio: NÃO falhou (deveria)';
  exception when others then
    if sqlerrm like '%backup%' then
      raise notice '✓ 3 backup vazio rejeitado: %', sqlerrm;
    else
      raise warning '✗ 3 falhou por motivo INESPERADO (não a guarda de backup): %', sqlerrm;
    end if;
  end;

  -- ---------------------------------------------------------------
  -- CENARIO 4 — R-IMP-02/03: "Substituir tudo" apaga SÓ a filial-alvo.
  --   Um ativo pré-existente na filial B (fora do plano) some; a filial fica só
  --   com o(s) do plano; a filial A (outra) permanece intacta.
  -- ---------------------------------------------------------------
  insert into public.ativos (patrimonio, categoria, filial_id) values ('ZZF19OLD001', 'notebook', v_fb);
  select count(*) into v_fa_before from public.ativos where filial_id = v_fa;   -- outra filial (A) antes = 2

  p_plano_b := jsonb_build_object(
    'filialId', v_fb, 'arquivoHash', 'ZZF19HASHB', 'totalLinhasDados', 1,
    'ativos', jsonb_build_array(
      jsonb_build_object('patrimonio','ZZF19NEW001','serviceTag','ZZF19STB1',
                         'categoria','notebook','estadoAlvo','em_estoque')
    )
  );
  v_result := public.importar_ativos_substituir(
    p_plano_b,
    'backups-import/f19-teste-b.json',
    jsonb_build_object('ativos',1,'movimentacoes',0,'anotacoes',0,'termos',0)   -- reflete o vivo (1 pré-existente, 0 movs)
  );

  -- 4a — R-IMP-02: filial B fica só com o ativo do plano; o velho sumiu
  select count(*) into v_cnt  from public.ativos where filial_id = v_fb;
  select count(*) into v_cnt2 from public.ativos where filial_id = v_fb and patrimonio = 'ZZF19OLD001';
  if v_cnt = 1 and v_cnt2 = 0 then
    raise notice '✓ 4a filial B tem só o ativo do plano; o pré-existente foi apagado (R-IMP-02)';
  else raise warning '✗ 4a filial B: esperado 1 ativo e velho=0, obtido % ativos e velho=%', v_cnt, v_cnt2; end if;

  -- 4b — o novo ativo veio do plano com origem 'importacao'
  select count(*) into v_cnt from public.ativos
   where filial_id = v_fb and patrimonio = 'ZZF19NEW001' and origem = 'importacao';
  if v_cnt = 1 then raise notice '✓ 4b ativo do plano presente com origem = importacao';
  else raise warning '✗ 4b ativo do plano (origem importacao): esperado 1, obtido %', v_cnt; end if;

  -- 4c — R-IMP-03: a outra filial (A) ficou intacta
  select count(*) into v_cnt from public.ativos where filial_id = v_fa;
  if v_cnt = v_fa_before then
    raise notice '✓ 4c outra filial (A) intacta após substituir B: % ativos (R-IMP-03)', v_cnt;
  else raise warning '✗ 4c filial A alterada por substituição de B: esperado %, obtido %', v_fa_before, v_cnt; end if;

  raise notice '=== fim do roteiro import_substituir (procure por ✗ acima; nenhum = tudo passou) ===';
end $$;

-- Nada acima é persistido:
rollback;
