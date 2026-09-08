-- =============================================================
-- Roteiro de teste: as guardas de escopo NO-OP do IMPORT (F52, migration 0132).
--
-- Irmão direto de `import_substituir.sql` (mesma forma, mesmo begin/rollback, mesmo
-- jeito de montar fixture de filial/ativo) — mas este roteiro NÃO repete os cenários
-- de ponta a ponta que aquele já cobre (happy path, contagens NULL, backup vazio,
-- "substituir tudo" só na filial-alvo). Aqui entram SÓ as quatro guardas novas da
-- 0132, cada uma com o PAR recusa/aceita: um roteiro que só provasse o lado da
-- recusa não provaria que a guarda é no-op — provaria o contrário.
--
-- AS QUATRO GUARDAS, E OS CENÁRIOS:
--   1. prefixo_backup_import(smallint) — o molde do caminho do backup do import.
--        1a  prefixo_backup_import(1) = 'import/filial-1/' (literal, sem depender
--            de existir filial com esse id — é concatenação pura).
--        1b  fechada nos quatro papéis (public, anon, authenticated, service_role),
--            pelo ACL real — mesma técnica de `import_substituir.sql:0e`.
--   2. import_validar_plano — a CASCATA DE TRÊS guardas do backup.
--        2a  backup SEM o prefixo da filial → recusa 22023.
--        2b  backup COM o prefixo mas INEXISTENTE em storage.objects → recusa 22023.
--        2c  backup com prefixo E existente → PASSA (o par positivo da cascata).
--        2d  a mensagem de 2b NÃO contém "backup informado não existe" — essa é a
--            frase do RESET (0089); se o import caísse nela, `erros.ts` mandaria o
--            operador do import atrás de uma prévia que o import não tem.
--   3. import_validar_plano — a CONFIRMAÇÃO DIGITADA, agora dentro da RPC.
--        3a  confirmação errada → recusa 22023 DENTRO da RPC (não só na Server Action).
--        3b  confirmação certa com espaço nas pontas e caixa trocada → PASSA — o par
--            positivo que prova a régua upper(btrim()).
--   4. import_validar_plano — a IDEMPOTÊNCIA por arquivo_hash (janela de 24h).
--        4a  segundo apply do mesmo hash NA MESMA filial dentro de 24h → recusa.
--        4b  o mesmo hash em OUTRA filial → PASSA (a janela é por filial, não global).
--        4c  o mesmo hash na mesma filial mas fora da janela (48h atrás) → PASSA — o
--            reimport legítimo depois de uma correção não pode ficar preso para sempre.
--   5. importar_ativos_substituir — pode_escrever_filial em CONJUNÇÃO com e_admin().
--        5a  em runtime: uma sessão de nível administrador PASSA em pode_escrever_filial
--            mesmo para uma filial que não existe — prova que a guarda de hoje não
--            recorta por vínculo nenhum.
--        5a-bis  pelo CORPO de pode_escrever_filial: o ramo que devolve true para
--            dev/admin aparece ANTES de qualquer leitura de operador_filiais — ou
--            seja, dev/admin nunca chega a ser filtrado por filial.
--        5a-ter  pelo CORPO de importar_ativos_substituir: a chamada a
--            pode_escrever_filial CONTINUA lá (a orquestradora é recriada em cadeia;
--            é exatamente o jeito como uma guarda inline se perde numa recriação
--            futura — por isso a prova é sobre o texto vigente, não sobre memória).
--
-- Convenção do job `banco` do CI (igual aos demais roteiros):
--   NOTICE  '✓ …'  quando bate com o esperado;
--   WARNING '✗ …'  quando NÃO bate (o CI falha em qualquer `WARNING: ✗`).
-- Cenários NEGATIVOS (2a, 2b, 3a, 4a) DEVEM falhar no banco: capturamos a exceção e
-- marcamos ✓ quando o SQLSTATE/mensagem é o esperado (e ✗ se falhar por outro motivo).
--
-- `import_validar_plano` NÃO lê `auth.uid()` (só `importar_ativos_substituir` faz a
-- guarda de cargo/sessão) — por isso os cenários 1→4 chamam a função de VALIDAÇÃO
-- diretamente, sem precisar de contexto de operador. O cenário 5 chama
-- `pode_escrever_filial`, que lê `papel_atual()` via `auth.uid()`, e por isso — só
-- para ele — este roteiro monta a sessão de operador/admin nos mesmos moldes de
-- `import_substituir.sql`.
--
-- Dados 100% fictícios (prefixo ZZF52; patrimônios WAP0009xxx). NUNCA dado real.
-- Pré-requisito: migrations 0031→0132 aplicadas (a 0132 precisa da 0131 antes dela —
-- ver o cabeçalho da própria 0132) e >= 1 profile ativo no banco.
-- =============================================================

begin;

do $$
declare
  v_ok       int := 0;
  v_falhas   int := 0;
  v_prof     uuid;
  v_f1       smallint;   -- filial de teste principal ('F52 Teste A')
  v_f2       smallint;   -- outra filial, para o par positivo da idempotência (4b)
  v_prefixo1 text;
  v_prefixo2 text;
  v_plano    jsonb;       -- plano-base válido: 1 ativo fictício, confirmação e hash OK
  v_total    int;
  v_abertas  int;
  v_existe   int;
  v_def      text;
  v_pos_dev  int;
  v_pos_fil  int;
  v_pos_call int;
begin
  -- F38/F45: perfil ATIVO e escolha DETERMINÍSTICA (o mesmo cuidado de
  -- `import_substituir.sql` — `limit 1` sem `order by`/filtro podia cair num
  -- perfil desativado, e toda guarda de cargo recusaria com 42501).
  select id into v_prof from public.profiles
   where ativo and excluido_em is null
   order by created_at, id limit 1;
  if v_prof is null then
    raise exception 'PRE-REQUISITO: crie ao menos 1 operador (profile) antes de rodar este roteiro';
  end if;

  -- Só o cenário 5 precisa de sessão — mas promover aqui, uma vez, é mais simples
  -- do que alternar contexto no meio do roteiro. Dentro de begin/rollback: nada sobra.
  update public.profiles set papel = 'admin' where id = v_prof;
  perform set_config('request.jwt.claims', json_build_object('sub', v_prof)::text, true);
  if auth.uid() is null then
    raise exception 'PRE-REQUISITO: auth.uid() ficou nulo — contexto de operador não aplicado';
  end if;

  -- filiais de teste (id smallint identity → gerado; slug único, inéditos)
  insert into public.filiais (slug, nome) values ('zzf52-teste-a', 'F52 Teste A') returning id into v_f1;
  insert into public.filiais (slug, nome) values ('zzf52-teste-b', 'F52 Teste B') returning id into v_f2;

  v_prefixo1 := public.prefixo_backup_import(v_f1);
  v_prefixo2 := public.prefixo_backup_import(v_f2);

  -- Um backup "existente" no bucket para cada filial — o par positivo das cascatas
  -- 2/3/4 precisa de um caminho que exista de verdade em storage.objects.
  insert into storage.objects (bucket_id, name, owner) values
    ('backups-import', v_prefixo1 || 'existe.json', v_prof),
    ('backups-import', v_prefixo2 || 'existe.json', v_prof);

  -- =========================================================================
  -- 1 — prefixo_backup_import
  -- =========================================================================

  -- 1a — concatenação pura, não depende de a filial 1 existir de verdade.
  -- ⚠ O `::smallint` é OBRIGATÓRIO: a função recebe `smallint`, e a conversão de
  -- `integer` para `smallint` no Postgres é de ATRIBUIÇÃO, não implícita — um literal
  -- `1` cru resolve para "function public.prefixo_backup_import(integer) does not exist"
  -- e ABORTA o roteiro, em vez de deixar a asserção vermelha.
  if public.prefixo_backup_import(1::smallint) = 'import/filial-1/' then
    v_ok := v_ok + 1; raise notice '✓ 1a prefixo_backup_import(1) = "import/filial-1/"';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 1a prefixo_backup_import(1): esperado "import/filial-1/", obtido "%"', public.prefixo_backup_import(1::smallint);
  end if;

  -- 1b — fechada nos quatro papéis, pelo ACL real (não pela intenção do comentário).
  -- Confirma primeiro que a função está mesmo no catálogo: sem isso, um typo em
  -- `proname` faria o join devolver 0 linhas e a checagem do PUBLIC passaria por
  -- CONJUNTO VAZIO — a mesma tautologia que `pg_temp.assert_zero_de` existe para recusar.
  select count(*) into v_existe
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'prefixo_backup_import';
  if v_existe = 0 then
    raise exception 'PRE-REQUISITO: public.prefixo_backup_import não está no catálogo — a checagem 1b seria tautológica';
  end if;

  select count(*) into v_abertas
    from (values ('anon'),('authenticated'),('service_role')) r(rolname)
   where has_function_privilege(r.rolname, 'public.prefixo_backup_import(smallint)', 'execute');

  select v_abertas + count(*) into v_abertas
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'prefixo_backup_import'
     and array_to_string(coalesce(p.proacl, '{}'::aclitem[]), ',') like '=%X%';

  if pg_temp.assert_zero_de('1b prefixo_backup_import fechada nos quatro papéis', v_abertas, 4) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- =========================================================================
  -- 2 — import_validar_plano: a cascata de três guardas do backup
  -- =========================================================================
  -- Plano-base válido: 1 ativo fictício, confirmação e hash corretos para a filial 1.
  -- Reutilizado (e sobrescrito por `||`) nos cenários seguintes — `import_validar_plano`
  -- é só leitura (não grava em import_logs), então repetir hash/hash entre chamadas
  -- não tem efeito colateral nenhum.
  v_plano := jsonb_build_object(
    'confirmacao', 'F52 Teste A',
    'arquivoHash', 'ZZF52HASH-BASE',
    'ativos', jsonb_build_array(
      jsonb_build_object('patrimonio', 'WAP0009501', 'serviceTag', 'ZZF52ST01',
                         'categoria', 'notebook', 'estadoAlvo', 'em_estoque')));

  -- 2a — backup SEM o prefixo da filial (caminho de outra operação/lugar qualquer).
  begin
    perform public.import_validar_plano(v_plano, 'algum/outro/caminho.json', '[]'::jsonb, v_f1);
    v_falhas := v_falhas + 1; raise warning '✗ 2a backup sem o prefixo da filial: NÃO recusou (deveria)';
  exception when others then
    if sqlstate = '22023' then
      v_ok := v_ok + 1; raise notice '✓ 2a backup sem o prefixo da filial recusado (%): %', sqlstate, sqlerrm;
    else
      v_falhas := v_falhas + 1; raise warning '✗ 2a recusou por motivo INESPERADO (%): %', sqlstate, sqlerrm;
    end if;
  end;

  -- 2b/2d — backup COM o prefixo certo mas que não existe em storage.objects.
  begin
    perform public.import_validar_plano(v_plano, v_prefixo1 || 'nao-existe.json', '[]'::jsonb, v_f1);
    v_falhas := v_falhas + 1; raise warning '✗ 2b backup com prefixo mas inexistente: NÃO recusou (deveria)';
  exception when others then
    if sqlstate = '22023' then
      v_ok := v_ok + 1; raise notice '✓ 2b backup com prefixo mas inexistente recusado (%): %', sqlstate, sqlerrm;
    else
      v_falhas := v_falhas + 1; raise warning '✗ 2b recusou por motivo INESPERADO (%): %', sqlstate, sqlerrm;
    end if;

    -- 2d: a mensagem de 2b é LEXICALMENTE DISJUNTA da irmã do reset (0089). Se as
    -- duas se sobrepusessem, `src/lib/actions/erros.ts` (que casa por substring)
    -- mandaria o operador do IMPORT atrás de uma prévia — instrução do RESET.
    if sqlerrm ilike '%backup informado não existe%' or sqlerrm ilike '%backup informado nao existe%' then
      v_falhas := v_falhas + 1;
      raise warning '✗ 2d a mensagem de 2b CONTÉM a frase do RESET — erros.ts levaria o operador do import para a instrução errada: %', sqlerrm;
    else
      v_ok := v_ok + 1;
      raise notice '✓ 2d a mensagem de 2b não contém "backup informado não existe" (não cai no ramo do RESET): %', sqlerrm;
    end if;
  end;

  -- 2c — backup com prefixo E existente → PASSA (o par positivo da cascata).
  begin
    v_total := public.import_validar_plano(v_plano, v_prefixo1 || 'existe.json', '[]'::jsonb, v_f1);
    if v_total = 1 then
      v_ok := v_ok + 1; raise notice '✓ 2c backup com prefixo e existente PASSA (import_validar_plano devolveu %)', v_total;
    else
      v_falhas := v_falhas + 1; raise warning '✗ 2c passou mas devolveu % (esperado 1)', v_total;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; raise warning '✗ 2c backup válido recusado (%): %', sqlstate, sqlerrm;
  end;

  -- =========================================================================
  -- 3 — import_validar_plano: a confirmação digitada
  -- =========================================================================

  -- 3a — confirmação errada → recusa DENTRO da RPC (não só na Server Action).
  begin
    perform public.import_validar_plano(
      v_plano || jsonb_build_object('confirmacao', 'ERRADA'),
      v_prefixo1 || 'existe.json', '[]'::jsonb, v_f1);
    v_falhas := v_falhas + 1; raise warning '✗ 3a confirmação errada: NÃO recusou (deveria)';
  exception when others then
    if sqlstate = '22023' then
      v_ok := v_ok + 1; raise notice '✓ 3a confirmação errada recusada DENTRO da RPC (%): %', sqlstate, sqlerrm;
    else
      v_falhas := v_falhas + 1; raise warning '✗ 3a recusou por motivo INESPERADO (%): %', sqlstate, sqlerrm;
    end if;
  end;

  -- 3b — confirmação certa, com espaço nas pontas e caixa trocada → PASSA. O par
  -- positivo que prova o afrouxamento deliberado da régua upper(btrim()).
  begin
    v_total := public.import_validar_plano(
      v_plano || jsonb_build_object('confirmacao', '  f52 teste a  ', 'arquivoHash', 'ZZF52HASH-3B'),
      v_prefixo1 || 'existe.json', '[]'::jsonb, v_f1);
    if v_total = 1 then
      v_ok := v_ok + 1; raise notice '✓ 3b confirmação "  f52 teste a  " (espaço + caixa trocada) PASSA — a régua é upper(btrim())';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 3b passou mas devolveu % (esperado 1)', v_total;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; raise warning '✗ 3b confirmação válida (espaço/caixa) recusada (%): %', sqlstate, sqlerrm;
  end;

  -- =========================================================================
  -- 4 — import_validar_plano: idempotência por arquivo_hash (janela de 24h)
  -- =========================================================================
  -- Fixtures gravadas DIRETO em import_logs (a função só LÊ a tabela — quem grava é
  -- `import_gravar_trilha`, chamada só pela orquestradora, que não entra neste roteiro).

  -- fixture 4a/4c-controle: log RECENTE da filial 1 (dentro da janela de 24h).
  insert into public.import_logs (
    filial_id, modo, arquivo_hash, total_linhas,
    ativos_criados, movs_apagadas, anotacoes_apagadas, termos_apagados,
    backup_path, correcoes, criado_por, created_at
  ) values (
    v_f1, 'substituir', 'ZZF52HASH-4A', 1, 1, 0, 0, 0,
    v_prefixo1 || 'log-4a.json', '[]'::jsonb, v_prof, now()
  );

  -- 4a — mesmo hash, MESMA filial, dentro da janela de 24h → recusa.
  begin
    perform public.import_validar_plano(
      v_plano || jsonb_build_object('arquivoHash', 'ZZF52HASH-4A'),
      v_prefixo1 || 'existe.json', '[]'::jsonb, v_f1);
    v_falhas := v_falhas + 1; raise warning '✗ 4a mesmo hash/mesma filial em 24h: NÃO recusou (deveria)';
  exception when others then
    if sqlerrm ilike '%já foi importado nesta filial%' then
      v_ok := v_ok + 1; raise notice '✓ 4a mesmo hash/mesma filial dentro de 24h recusado (%): %', sqlstate, sqlerrm;
    else
      v_falhas := v_falhas + 1; raise warning '✗ 4a recusou por motivo INESPERADO (%): %', sqlstate, sqlerrm;
    end if;
  end;

  -- 4b — o MESMO hash, mas em OUTRA filial → PASSA (a janela é por filial, não global).
  begin
    v_total := public.import_validar_plano(
      jsonb_build_object(
        'confirmacao', 'F52 Teste B',
        'arquivoHash', 'ZZF52HASH-4A',
        'ativos', jsonb_build_array(
          jsonb_build_object('patrimonio', 'WAP0009502', 'serviceTag', 'ZZF52ST02',
                             'categoria', 'notebook', 'estadoAlvo', 'em_estoque'))),
      v_prefixo2 || 'existe.json', '[]'::jsonb, v_f2);
    if v_total = 1 then
      v_ok := v_ok + 1; raise notice '✓ 4b mesmo hash em OUTRA filial PASSA (a janela de idempotência é por filial)';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 4b passou mas devolveu % (esperado 1)', v_total;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; raise warning '✗ 4b mesmo hash em outra filial recusado (%): %', sqlstate, sqlerrm;
  end;

  -- fixture 4c: log da MESMA filial 1, mesmo hash (outro), mas FORA da janela (48h atrás).
  insert into public.import_logs (
    filial_id, modo, arquivo_hash, total_linhas,
    ativos_criados, movs_apagadas, anotacoes_apagadas, termos_apagados,
    backup_path, correcoes, criado_por, created_at
  ) values (
    v_f1, 'substituir', 'ZZF52HASH-4C', 1, 1, 0, 0, 0,
    v_prefixo1 || 'log-4c.json', '[]'::jsonb, v_prof, now() - interval '48 hours'
  );

  -- 4c — mesmo hash, mesma filial, mas created_at fora da janela → PASSA (o reimport
  -- legítimo depois de uma correção não pode ficar preso para sempre).
  begin
    v_total := public.import_validar_plano(
      v_plano || jsonb_build_object('arquivoHash', 'ZZF52HASH-4C'),
      v_prefixo1 || 'existe.json', '[]'::jsonb, v_f1);
    if v_total = 1 then
      v_ok := v_ok + 1; raise notice '✓ 4c mesmo hash/mesma filial fora da janela de 24h (48h atrás) PASSA — reimport legítimo';
    else
      v_falhas := v_falhas + 1; raise warning '✗ 4c passou mas devolveu % (esperado 1)', v_total;
    end if;
  exception when others then
    v_falhas := v_falhas + 1; raise warning '✗ 4c mesmo hash fora da janela recusado (%): %', sqlstate, sqlerrm;
  end;

  -- =========================================================================
  -- 5 — importar_ativos_substituir: pode_escrever_filial em CONJUNÇÃO
  -- =========================================================================

  -- 5a — em runtime: sessão de nível administrador PASSA em pode_escrever_filial
  -- mesmo para uma filial que NÃO EXISTE (32000) — a função não confere existência
  -- nem vínculo nenhum para dev/admin, então "qualquer filial" é literal.
  -- ⚠ O `::smallint` e OBRIGATORIO aqui pelo mesmo motivo do 1a: a conversao de
  -- `integer` para `smallint` no Postgres e de ATRIBUICAO, nao implicita, e um literal
  -- cru resolve para "function does not exist" — o que ABORTA o roteiro em vez de
  -- deixar a assercao vermelha. (32000 cabe em smallint; o teto e 32767.)
  if public.pode_escrever_filial(32000::smallint) then
    v_ok := v_ok + 1;
    raise notice '✓ 5a sessão de nível administrador PASSA em pode_escrever_filial(32000::smallint), filial inexistente — o par positivo da guarda nova';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 5a sessão de nível administrador NÃO passou em pode_escrever_filial(32000::smallint)';
  end if;

  -- 5a-bis — pelo CORPO de pode_escrever_filial: o ramo dev/admin devolve true ANTES
  -- de qualquer leitura de operador_filiais (a tabela que recorta por vínculo).
  --
  -- ⚠ A ÂNCORA É A CLÁUSULA `from public.operador_filiais`, e NÃO o nome cru da tabela.
  -- O nome cru aparece ANTES, no COMENTÁRIO da própria função ("…escreve em toda
  -- filial, sem linha em operador_filiais"), e `pg_get_functiondef` devolve o corpo COM
  -- os comentários — então a comparação de posições media o comentário contra o código e
  -- reprovava uma função correta. Casar com a LEITURA é o que torna a asserção honesta.
  select pg_get_functiondef('public.pode_escrever_filial(smallint)'::regprocedure) into v_def;
  v_pos_dev := position('in (''dev'', ''admin'')' in v_def);
  v_pos_fil := position('from public.operador_filiais' in v_def);
  if v_pos_dev > 0 and v_pos_fil > 0 and v_pos_dev < v_pos_fil then
    v_ok := v_ok + 1;
    raise notice '✓ 5a-bis o corpo de pode_escrever_filial devolve true para dev/admin ANTES de consultar operador_filiais (posições % < %)', v_pos_dev, v_pos_fil;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 5a-bis pode_escrever_filial: ramo dev/admin não aparece mais antes do recorte por filial (dev em %, operador_filiais em %)', v_pos_dev, v_pos_fil;
  end if;

  -- 5a-ter — pelo CORPO de importar_ativos_substituir: a CHAMADA nova continua lá.
  --
  -- ⚠ A ÂNCORA É A CHAMADA INTEIRA (`not public.pode_escrever_filial(v_filial)`), e não
  -- o nome cru. O comentário que a 0132 escreveu em volta da guarda CITA o nome três
  -- vezes (é ele que explica por que a condição não deve ser "simplificada"), então uma
  -- asserção pelo nome cru continuaria VERDE mesmo com a chamada removida — e a mutação
  -- `f52-import-perde-a-guarda-de-filial`, que remove exatamente o `if`, sairia como
  -- "não detectada". Uma asserção que não sabe ficar vermelha não prova nada.
  select pg_get_functiondef('public.importar_ativos_substituir(jsonb,text,jsonb,jsonb)'::regprocedure) into v_def;
  v_pos_call := position('not public.pode_escrever_filial(v_filial)' in v_def);
  if v_pos_call > 0 then
    v_ok := v_ok + 1;
    raise notice '✓ 5a-ter o corpo de importar_ativos_substituir CHAMA pode_escrever_filial';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 5a-ter a chamada a pode_escrever_filial sumiu do corpo de importar_ativos_substituir';
  end if;

  raise notice 'FIM import_fora_da_unidade: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

-- Nada acima é persistido:
rollback;
