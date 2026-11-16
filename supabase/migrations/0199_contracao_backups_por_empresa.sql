-- =====================================================================================================================
-- 0199_contracao_backups_por_empresa.sql — F67B (16/11/2026): CONTRAÇÃO do bucket backups-import — só a forma nova grava; a antiga é só LIDA, só pelo admin da WAP
-- =====================================================================================================================
-- classe: ADITIVA (o classificador calcula assim: alter policy de quatro, create or replace de quatro funções, drop de três)
--
-- ⚠ SÓ DEPOIS DO DEPLOY E DA JANELA: nenhum objeto NOVO numa forma antiga entre o deploy e o T1 (decisão 11, fato 33).
-- Fecha (b): o app velho grava backup na forma antiga — a policy de escrita e a checagem do prefixo nas RPCs o recusam.
--
--   backups-import leitura operador   a forma NOVA pela empresa do caminho, OU a CLÁUSULA LEGADA FECHADA: a lista nominal
--                                     das formas antigas (caminho_backup_legado) e só para o admin da WAP (decisão 16/11-1
--                                     do Johnny) — a única citação de empresa_legada() no Storage, a exceção nominal da
--                                     trava L de storage_por_empresa.sql.
--   insere / atualiza / apaga         SÓ a forma nova, pela empresa do caminho. Ninguém da sessão grava, atualiza ou apaga
--                                     objeto antigo (medido: o app não apaga backup antigo; limpar os órfãos do #84 é
--                                     entrega avulsa, por service role).
--   as quatro RPCs                    só a forma nova. Diff contra a EXPANSÃO (0195): sai a 2ª parcela
--                                     and not coalesce(... like <prefixo antigo> || '%', false).
--   prefixo_backup_import(smallint), prefixo_backup_reset(text, smallint), prefixo_backup_conflito()
--                                     saem (sem if exists, sem cascade): a 12ª (0196) usa o literal congelado, e as RPCs
--                                     já não os citam.
-- =====================================================================================================================

set lock_timeout = '2s';

alter policy "backups-import leitura operador" on storage.objects
  using (bucket_id = 'backups-import'
    and (public.empresa_do_caminho_backup(name) = any (array (select public.empresas_de_admin()))
         or (public.caminho_backup_legado(name) and (select public.e_admin_na(public.empresa_legada())))));

alter policy "backups-import insere operador" on storage.objects
  with check (bucket_id = 'backups-import'
    and public.empresa_do_caminho_backup(name) = any (array (select public.empresas_de_admin())));

alter policy "backups-import atualiza operador" on storage.objects
  using (bucket_id = 'backups-import'
    and public.empresa_do_caminho_backup(name) = any (array (select public.empresas_de_admin())))
  with check (bucket_id = 'backups-import'
    and public.empresa_do_caminho_backup(name) = any (array (select public.empresas_de_admin())));

alter policy "backups-import apaga operador" on storage.objects
  using (bucket_id = 'backups-import'
    and public.empresa_do_caminho_backup(name) = any (array (select public.empresas_de_admin())));

create or replace function public.import_validar_plano(
  p_plano       jsonb,
  p_backup_path text,
  p_correcoes   jsonb,
  p_filial      smallint
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  e             jsonb;
  v_total_plano int;
  v_prefixo     text;    -- F52: o prefixo obrigatório do backup desta filial
  v_confirmacao text;    -- F52: a confirmação digitada, que agora viaja em p_plano
  v_filial_nome text;    -- F52: o nome da filial — o texto que a confirmação tem de casar
  v_hash        text;    -- F52: o sha-256 do arquivo, para a janela de idempotência
begin
  -- ---------- 1b. backup obrigatório — A CASCATA DE TRÊS (F52) ----------
  -- Antes desta fase a guarda era só a primeira das três: `btrim(p_backup_path) <> ''`.
  -- Um ritual de string — qualquer texto não-vazio passava, inclusive o caminho do backup
  -- de OUTRA filial ou de outra operação. É o molde de `resetar_acervo` (0089:116-133)
  -- copiado para cá, com o mesmo errcode 22023 das irmãs.
  if coalesce(btrim(p_backup_path), '') = '' then
    raise exception 'Import destrutivo exige backup_path (o acervo da filial deve ser exportado antes).'
      using errcode = '22023';
  end if;

  v_prefixo := public.prefixo_backup_import(public.empresa_da_filial(p_filial), p_filial);
  if not coalesce(btrim(p_backup_path) like v_prefixo || '%', false) then
    raise exception 'O backup informado não é o backup DESTA filial (esperado sob "%"). Nada foi apagado.', v_prefixo
      using errcode = '22023';
  end if;

  -- ⚠ A MENSAGEM É DE PROPÓSITO LEXICALMENTE DISJUNTA da irmã do reset, que diz "O backup
  -- informado não existe no bucket". `src/lib/actions/erros.ts` casa por SUBSTRING: se as
  -- duas se sobrepusessem, o operador do IMPORT leria a instrução do RESET ("gere a prévia
  -- novamente" — o import não tem prévia de reset). Por isso aqui se diz "backup deste
  -- import não foi encontrado".
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'backups-import' and o.name = btrim(p_backup_path)
  ) then
    raise exception 'O backup deste import não foi encontrado no armazenamento (%). Nada foi apagado.', btrim(p_backup_path)
      using errcode = '22023';
  end if;

  -- ---------- 1b-ter. A CONFIRMAÇÃO DIGITADA, AGORA DENTRO DA RPC (F52) ----------
  -- Das três destrutivas, o import era a única cuja confirmação parava na Server Action —
  -- quem chamasse `/rest/v1/rpc/importar_ativos_substituir` direto pulava a conferência.
  --
  -- Ela viaja DENTRO de `p_plano` (e não como parâmetro novo) porque acrescentar
  -- parâmetro — mesmo com `default` — cria uma função NOVA: `create or replace` casa pela
  -- lista de tipos dos argumentos. O overload quebraria `seguranca_catalogo.sql`, que
  -- resolve `importar_ativos_substituir(jsonb, text, jsonb, jsonb)` e espera UMA linha.
  --
  -- A régua de normalização é `upper(btrim(coalesce(...)))` — a MESMA das oito irmãs
  -- destrutivas (0082/0083/0087/0089) e a mesma da gêmea em src/lib/validators/importar.ts.
  -- Ter duas réguas para a mesma pergunta é o defeito que a 0100 aprendeu à força.
  select f.nome into v_filial_nome from public.filiais f where f.id = p_filial;
  v_confirmacao := p_plano->>'confirmacao';
  if upper(btrim(coalesce(v_confirmacao, ''))) <> upper(btrim(coalesce(v_filial_nome, ''))) then
    raise exception 'A confirmação do import não confere: digite exatamente "%" para substituir o acervo desta filial.', v_filial_nome
      using errcode = '22023';
  end if;

  -- ---------- 1b-quater. IDEMPOTÊNCIA POR arquivo_hash (F52) ----------
  -- A coluna existe desde a 0031 com o comentário "idempotência" e NUNCA foi lida. Dois
  -- applies do mesmo arquivo passavam — e o segundo apagava tudo o que o primeiro criou,
  -- com uuids novos e os termos destruídos.
  --
  -- A janela é de 24 h e NÃO é permanente, de propósito: reimport legítimo depois de uma
  -- correção precisa passar. Mensagem própria, para não cair no ramo genérico.
  v_hash := coalesce(p_plano->>'arquivoHash', '');
  if v_hash <> '' and exists (
    select 1 from public.import_logs l
     where l.filial_id = p_filial
       and l.arquivo_hash = v_hash
       and l.created_at > now() - interval '24 hours'
  ) then
    raise exception 'Este mesmo arquivo já foi importado nesta filial nas últimas 24 horas. Nada foi apagado — se a reimportação é intencional, aguarde a janela ou corrija o arquivo.'
      using errcode = '22023';
  end if;

  -- ---------- 1b-bis. correções (auditoria) ----------
  if p_correcoes is not null and jsonb_typeof(p_correcoes) <> 'array' then
    raise exception 'Correções do import inválidas: esperado um array JSON (recebido %).',
      jsonb_typeof(p_correcoes);
  end if;

  -- ---------- 1c. plano não-vazio ----------
  if jsonb_typeof(p_plano->'ativos') <> 'array'
     or jsonb_array_length(p_plano->'ativos') < 1 then
    raise exception 'Plano de import vazio: ao menos 1 ativo é obrigatório.';
  end if;
  v_total_plano := jsonb_array_length(p_plano->'ativos');

  -- ---------- 1d. validação por ativo (enums; patrimônio só sanidade — F7J) ----------
  for e in select jsonb_array_elements(p_plano->'ativos')
  loop
    -- F7J (Johnny 20/07/2026): o patrimônio pode ser FORÇADO fora do formato canônico
    -- (`LEA7LYHQH4`, `STF003LOC`…) — o operador marca a linha "usar mesmo assim" e o MOTOR
    -- (src/lib/import/plano.ts + a UI) é o juiz do valor. Aqui fica só a SANIDADE: não-nulo,
    -- não-vazio e ≤ 60 caracteres (a régua de FORMATO canônico saiu daqui). O null segue
    -- válido (importa com pendência). Antes exigia `^[A-Z]{2,4}\d{7}$`.
    if (e->>'patrimonio') is not null
       and (btrim(e->>'patrimonio') = '' or length(e->>'patrimonio') > 60) then
      raise exception 'Patrimônio inválido no plano: "%" (vazio ou longo demais — máx. 60 caracteres).',
        e->>'patrimonio';
    end if;
    if not (e->>'categoria' = any (enum_range(null::public.categoria_ativo)::text[])) then
      raise exception 'Categoria inválida "%" no ativo % (fora do enum categoria_ativo).',
        e->>'categoria', coalesce(e->>'patrimonio', '(sem patrimônio)');
    end if;
    if not (e->>'estadoAlvo' = any (enum_range(null::public.status_ativo)::text[])) then
      raise exception 'Estado-alvo inválido "%" no ativo % (fora do enum status_ativo).',
        e->>'estadoAlvo', coalesce(e->>'patrimonio', '(sem patrimônio)');
    end if;
  end loop;

  -- ---------- 1e. unicidade no plano — espelha os DOIS índices (F7E) ----------
  if exists (
    select 1
    from jsonb_array_elements(p_plano->'ativos') x
    where (x->>'patrimonio') is not null
    group by (x->>'patrimonio'), coalesce(x->>'serviceTag','')
    having count(*) > 1
  ) then
    raise exception 'Plano tem par (patrimônio, service tag) duplicado — cada ativo com patrimônio deve ser único.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_plano->'ativos') x
    where (x->>'patrimonio') is null and coalesce(x->>'serviceTag','') <> ''
    group by coalesce(x->>'serviceTag','')
    having count(*) > 1
  ) then
    raise exception 'Plano tem service tag repetida entre ativos sem patrimônio — a tag é a identidade quando não há patrimônio.';
  end if;

  -- ---------- 2. rede de segurança: termo multi-filial ----------
  if exists (
    select 1
    from public.termos_gerados t
    where exists (select 1 from unnest(t.ativo_ids) aid
                    join public.ativos a on a.id = aid where a.filial_id = p_filial)
      and exists (select 1 from unnest(t.ativo_ids) aid
                    join public.ativos a on a.id = aid where a.filial_id <> p_filial)
  ) then
    raise exception 'Há termo(s) gerado(s) que misturam esta filial com outra — substituição bloqueada. Resolva os termos antes.';
  end if;

  return v_total_plano;
end $$;

create or replace function public.resetar_acervo(
  p_empresa       uuid,
  p_filial        smallint,
  p_confirmacao   text,
  p_justificativa text,
  p_backup_path   text,
  p_contagens     jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_esperado  text;
  v_prefixo   text;
  v_ativos    int := 0;
  v_movs      int := 0;
  v_anot      int := 0;
  v_pend      int := 0;
  v_termos    int := 0;
  v_arquivos  text[] := '{}'::text[];
  v_e_ativos  int;
  v_e_movs    int;
  v_e_anot    int;
  v_e_pend    int;
  v_e_termos  int;
begin
  perform public.exigir_dev_para_destruir(p_empresa, p_justificativa);

  if p_filial is not null and not exists (select 1 from public.filiais f where f.id = p_filial) then
    raise exception 'Filial não encontrada.' using errcode = 'P0002';
  end if;
  if p_filial is not null and not public.filial_da_empresa(p_empresa, p_filial) then
    raise exception 'Esta filial pertence a outra empresa.' using errcode = '42501';
  end if;

  -- A trava: a mesma família do import. O "tudo" trava cada filial DA EMPRESA e a sentinela DA EMPRESA.
  if p_filial is null then
    perform pg_advisory_xact_lock(hashtext('import_substituir'), f.id::int)
       from public.filiais f where f.empresa_id = p_empresa order by f.id;
    perform pg_advisory_xact_lock(hashtext('import_substituir'), hashtext(p_empresa::text));
  else
    perform pg_advisory_xact_lock(hashtext('import_substituir'), p_filial::int);
  end if;

  v_esperado := public.rotulo_alcance_reset(p_empresa, p_filial, 'acervo');
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" para executar este reset.', v_esperado
      using errcode = '22023';
  end if;

  -- BACKUP OBRIGATÓRIO, CONFERIDO, e AMARRADO AO RECORTE (0089).
  if coalesce(length(btrim(p_backup_path)), 0) = 0 then
    raise exception 'Reset sem backup é proibido: o caminho do backup não veio. Gere o backup e tente de novo.'
      using errcode = '22023';
  end if;
  v_prefixo := public.prefixo_backup_reset(p_empresa, 'acervo', p_filial);
  if not coalesce(btrim(p_backup_path) like v_prefixo || '%', false) then
    raise exception 'O backup informado não é o backup DESTE recorte (esperado sob "%"). Nada foi apagado.', v_prefixo
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'backups-import' and o.name = btrim(p_backup_path)
  ) then
    raise exception 'O backup informado não existe no bucket (%). Nada foi apagado. Gere o backup novamente.', btrim(p_backup_path)
      using errcode = '22023';
  end if;

  if p_filial is not null and exists (
    select 1 from public.termos_gerados t
     where exists (select 1 from unnest(t.ativo_ids) aid
                     join public.ativos a on a.id = aid where a.filial_id = p_filial)
       and exists (select 1 from unnest(t.ativo_ids) aid
                     join public.ativos a on a.id = aid where a.filial_id <> p_filial)
  ) then
    raise exception 'Há termo(s) que misturam esta filial com outra — reset bloqueado. Resolva os termos antes.'
      using errcode = '42501';
  end if;

  if p_contagens is null or jsonb_typeof(p_contagens) <> 'object' then
    raise exception 'Revalidação de contagens obrigatória: gere a prévia novamente antes de aplicar.'
      using errcode = '22023';
  end if;

  select count(*)::int into v_ativos from public.ativos a
   where a.empresa_id = p_empresa
     and (p_filial is null or a.filial_id = p_filial);
  select count(*)::int into v_movs from public.movimentacoes m
   where m.empresa_id = p_empresa
     and (p_filial is null
          or m.ativo_id in (select id from public.ativos where filial_id = p_filial));
  select count(*)::int into v_anot from public.anotacoes an
   where an.empresa_id = p_empresa
     and (p_filial is null
          or an.ativo_id in (select id from public.ativos where filial_id = p_filial));
  select count(*)::int into v_pend from public.pendencias_item pi
   where pi.empresa_id = p_empresa
     and (p_filial is null
          or pi.ativo_id in (select id from public.ativos where filial_id = p_filial));
  select count(*)::int into v_termos from public.termos_gerados t
   where t.empresa_id = p_empresa
     and (p_filial is null
          or exists (select 1 from unnest(t.ativo_ids) aid
                       join public.ativos a on a.id = aid where a.filial_id = p_filial));

  v_e_ativos := coalesce((p_contagens->>'ativos')::int, -1);
  v_e_movs   := coalesce((p_contagens->>'movimentacoes')::int, -1);
  v_e_anot   := coalesce((p_contagens->>'anotacoes')::int, -1);
  v_e_pend   := coalesce((p_contagens->>'pendencias_item')::int, -1);
  v_e_termos := coalesce((p_contagens->>'termos')::int, -1);

  if v_ativos <> v_e_ativos or v_movs <> v_e_movs or v_anot <> v_e_anot
     or v_pend <> v_e_pend or v_termos <> v_e_termos then
    raise exception 'O estado mudou desde a prévia/backup (ativos %/%, movimentações %/%, anotações %/%, pendências %/%, termos %/%). Gere a prévia novamente.',
      v_ativos, v_e_ativos, v_movs, v_e_movs, v_anot, v_e_anot, v_pend, v_e_pend, v_termos, v_e_termos
      using errcode = '40001';
  end if;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.pendencias_item pi
   where pi.empresa_id = p_empresa
     and (p_filial is null
          or pi.ativo_id in (select id from public.ativos where filial_id = p_filial));

  with del as (
    delete from public.termos_gerados t
     where t.empresa_id = p_empresa
       and (p_filial is null
            or exists (select 1 from unnest(t.ativo_ids) aid
                         join public.ativos a on a.id = aid where a.filial_id = p_filial))
    returning t.arquivo_path
  )
  select coalesce(array_agg(arquivo_path), '{}'::text[]) into v_arquivos from del;

  delete from public.anotacoes an
   where an.empresa_id = p_empresa
     and (p_filial is null
          or an.ativo_id in (select id from public.ativos where filial_id = p_filial));

  delete from public.movimentacoes m
   where m.empresa_id = p_empresa
     and (p_filial is null
          or m.ativo_id in (select id from public.ativos where filial_id = p_filial));

  update public.ativos set substitui_ativo_id = null
   where substitui_ativo_id in (
     select id from public.ativos where empresa_id = p_empresa and (p_filial is null or filial_id = p_filial));

  delete from public.ativos a
   where a.empresa_id = p_empresa
     and (p_filial is null or a.filial_id = p_filial);

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (empresa_id, autor, acao, alvo, detalhe)
  values (p_empresa, v_uid, 'acervo_resetado', v_esperado,
          jsonb_build_object(
            'justificativa',   btrim(p_justificativa),
            'alcance',         case when p_filial is null then 'empresa' else 'filial' end,
            'filial_id',       p_filial,
            'backup_path',     btrim(p_backup_path),
            'antes',           jsonb_build_object(
                                 'ativos', v_ativos, 'movimentacoes', v_movs,
                                 'anotacoes', v_anot, 'pendencias_item', v_pend,
                                 'termos', v_termos),
            'depois',          jsonb_build_object(
                                 'ativos', (select count(*) from public.ativos a
                                             where a.empresa_id = p_empresa
                                               and (p_filial is null or a.filial_id = p_filial)),
                                 'movimentacoes', (select count(*) from public.movimentacoes m
                                                    where m.empresa_id = p_empresa
                                                      and (p_filial is null
                                                           or m.ativo_id in (select id from public.ativos where filial_id = p_filial)))),
            'arquivos_termos', to_jsonb(v_arquivos)));

  return jsonb_build_object(
    'alcance',         case when p_filial is null then 'empresa' else 'filial' end,
    'filial_id',       p_filial,
    'rotulo',          v_esperado,
    'ativos',          v_ativos,
    'movimentacoes',   v_movs,
    'anotacoes',       v_anot,
    'pendencias_item', v_pend,
    'termos',          v_termos,
    'arquivos_termos', to_jsonb(v_arquivos),
    'restam_ativos',   (select count(*) from public.ativos a
                         where a.empresa_id = p_empresa
                           and (p_filial is null or a.filial_id = p_filial)));

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

create or replace function public.resetar_itens(
  p_empresa       uuid,
  p_filial        smallint,
  p_confirmacao   text,
  p_justificativa text,
  p_backup_path   text,
  p_contagens     jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_esperado text;
  v_prefixo  text;
  v_lanc     int := 0;
  v_e_lanc   int;
begin
  perform public.exigir_dev_para_destruir(p_empresa, p_justificativa);

  if p_filial is not null and not exists (select 1 from public.filiais f where f.id = p_filial) then
    raise exception 'Filial não encontrada.' using errcode = 'P0002';
  end if;
  if p_filial is not null and not public.filial_da_empresa(p_empresa, p_filial) then
    raise exception 'Esta filial pertence a outra empresa.' using errcode = '42501';
  end if;

  if p_filial is null then
    perform pg_advisory_xact_lock(hashtext('import_substituir'), f.id::int)
       from public.filiais f where f.empresa_id = p_empresa order by f.id;
    perform pg_advisory_xact_lock(hashtext('import_substituir'), hashtext(p_empresa::text));
  else
    perform pg_advisory_xact_lock(hashtext('import_substituir'), p_filial::int);
  end if;

  v_esperado := public.rotulo_alcance_reset(p_empresa, p_filial, 'itens');
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" para executar este reset.', v_esperado
      using errcode = '22023';
  end if;

  if coalesce(length(btrim(p_backup_path)), 0) = 0 then
    raise exception 'Reset sem backup é proibido: o caminho do backup não veio. Gere o backup e tente de novo.'
      using errcode = '22023';
  end if;
  v_prefixo := public.prefixo_backup_reset(p_empresa, 'itens', p_filial);
  if not coalesce(btrim(p_backup_path) like v_prefixo || '%', false) then
    raise exception 'O backup informado não é o backup DESTE recorte (esperado sob "%"). Nada foi apagado.', v_prefixo
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'backups-import' and o.name = btrim(p_backup_path)
  ) then
    raise exception 'O backup informado não existe no bucket (%). Nada foi apagado. Gere o backup novamente.', btrim(p_backup_path)
      using errcode = '22023';
  end if;

  if p_contagens is null or jsonb_typeof(p_contagens) <> 'object' then
    raise exception 'Revalidação de contagens obrigatória: gere a prévia novamente antes de aplicar.'
      using errcode = '22023';
  end if;

  select count(*)::int into v_lanc from public.lancamentos_item l
   where l.empresa_id = p_empresa
     and (p_filial is null or l.filial_id = p_filial);

  v_e_lanc := coalesce((p_contagens->>'lancamentos')::int, -1);
  if v_lanc <> v_e_lanc then
    raise exception 'O estado mudou desde a prévia/backup (lançamentos %/%). Gere a prévia novamente.',
      v_lanc, v_e_lanc using errcode = '40001';
  end if;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.lancamentos_item l
   where l.empresa_id = p_empresa
     and (p_filial is null or l.filial_id = p_filial);

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (empresa_id, autor, acao, alvo, detalhe)
  values (p_empresa, v_uid, 'itens_resetados', v_esperado,
          jsonb_build_object(
            'justificativa', btrim(p_justificativa),
            'alcance',       case when p_filial is null then 'empresa' else 'filial' end,
            'filial_id',     p_filial,
            'backup_path',   btrim(p_backup_path),
            'antes',         jsonb_build_object('lancamentos', v_lanc),
            'depois',        jsonb_build_object('lancamentos',
                               (select count(*) from public.lancamentos_item l
                                 where l.empresa_id = p_empresa
                                   and (p_filial is null or l.filial_id = p_filial)))));

  return jsonb_build_object(
    'alcance',            case when p_filial is null then 'empresa' else 'filial' end,
    'filial_id',          p_filial,
    'rotulo',             v_esperado,
    'lancamentos',        v_lanc,
    'restam_lancamentos', (select count(*) from public.lancamentos_item l
                            where l.empresa_id = p_empresa
                              and (p_filial is null or l.filial_id = p_filial)));

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

create or replace function public.apagar_ativos_conflito_filiais(
  p_empresa       uuid,
  p_ativos        uuid[],
  p_confirmacao   text,
  p_justificativa text,
  p_backup_path   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_cap_inline  constant int := 25;
  c_max_lote    constant int := 200;

  v_uid         uuid := (select auth.uid());
  v_ids         uuid[];
  v_n           int;
  v_esperado    text;
  v_chaves      text[];
  v_faltam      text[];
  v_fora        text[];
  v_backup      jsonb;
  v_resumo      jsonb;
  v_movs        int := 0;
  v_anot        int := 0;
  v_pend        int := 0;
  v_termos      int := 0;
  v_subst       int := 0;
  v_arquivos    text[] := '{}'::text[];
  v_inline      boolean;
  v_digest      text;
begin
  if v_uid is null then
    raise exception 'Operador não autenticado.' using errcode = '42501';
  end if;

  if p_empresa is null then
    raise exception 'Informe a empresa da operação.' using errcode = '42501';
  end if;

  -- F67: administrador DESTA empresa.
  if not public.e_admin_na(p_empresa) then
    raise exception 'Apenas administradores podem resolver conflitos entre filiais.'
      using errcode = '42501';
  end if;

  if coalesce(length(btrim(p_justificativa)), 0) < 10 then
    raise exception 'A justificativa é obrigatória e precisa ter pelo menos 10 caracteres.'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
    into v_ids
    from unnest(coalesce(p_ativos, '{}'::uuid[])) x
   where x is not null;

  v_n := coalesce(cardinality(v_ids), 0);
  if v_n = 0 then
    raise exception 'Nenhum ativo selecionado para apagar.' using errcode = '22023';
  end if;
  if v_n > c_max_lote then
    raise exception 'Seleção grande demais (% ativos; máximo de % por operação).', v_n, c_max_lote
      using errcode = '22023';
  end if;

  v_esperado := 'APAGAR ' || v_n::text;
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" para apagar.', v_esperado
      using errcode = '22023';
  end if;

  select coalesce(array_agg(x::text order by x::text), '{}'::text[])
    into v_faltam
    from unnest(v_ids) x
   where not exists (select 1 from public.ativos a where a.id = x);

  if cardinality(v_faltam) > 0 then
    raise exception 'Ativo(s) não encontrado(s): %. Nada foi apagado — recarregue a página.',
      array_to_string(v_faltam[1:5], ', ')
      using errcode = 'P0002';
  end if;

  -- SERIALIZA a ferramenta POR EMPRESA, antes de QUALQUER lock de linha (0100; F67: a chave carrega a empresa).
  perform pg_advisory_xact_lock(hashtext('conflito_filiais_apagar'), hashtext(p_empresa::text));

  -- LOCK EM DOIS TEMPOS (0098): (1) as linhas SELECIONADAS por id.
  perform 1 from public.ativos a
   where a.id = any (v_ids)
   order by a.id
     for update;

  -- (2) SÓ AGORA lê as chaves — já sob trava.
  select coalesce(array_agg(distinct k), '{}'::text[])
    into v_chaves
    from public.ativos a
    cross join lateral (select public.chave_identidade_ativo(a.patrimonio, a.service_tag) as k) c
   where a.id = any (v_ids)
     and c.k is not null;

  -- (3) trava o RESTO do grupo — DENTRO DESTA EMPRESA: o gêmeo de outra empresa não é do grupo.
  if cardinality(v_chaves) > 0 then
    perform 1
       from public.ativos a
      where a.empresa_id = p_empresa
        and public.chave_identidade_ativo(a.patrimonio, a.service_tag) = any (v_chaves)
        and not (a.id = any (v_ids))
      order by a.id
        for update;
  end if;

  -- F67: OS ATIVOS SÃO DESTA EMPRESA? Depois da etapa (3) (leitura própria de `ativos`, já travada), antes da revalidação
  -- do grupo (pertencimento é recusa mais fundamental que "saiu do conflito") e fora da janela `estoque.dev_destrutivo`.
  perform public.exigir_ativos_da_empresa(p_empresa, v_ids);

  -- O grupo é recalculado DENTRO desta empresa.
  with ident as (
    select a.id, a.filial_id,
           public.chave_identidade_ativo(a.patrimonio, a.service_tag) as chave
      from public.ativos a
     where a.empresa_id = p_empresa
  ),
  grupos as (
    select i.chave from ident i
     where i.chave is not null
     group by i.chave
    having count(distinct i.filial_id) > 1
  ),
  em_conflito as (
    select i.id from ident i join grupos g on g.chave = i.chave
  )
  select coalesce(array_agg(rot order by rot), '{}'::text[])
    into v_fora
    from (
      select coalesce(nullif(btrim(a.patrimonio), ''),
                      nullif(btrim(a.service_tag), ''),
                      a.id::text) as rot
        from unnest(v_ids) x
        join public.ativos a on a.id = x
       where x not in (select id from em_conflito)
    ) s;

  if cardinality(v_fora) > 0 then
    raise exception 'Esta ferramenta só apaga ativo que esteja em conflito entre filiais, e % não está: %. Nada foi apagado.',
      case when cardinality(v_fora) = 1 then 'um dos selecionados' else 'nem todos os selecionados' end,
      array_to_string(v_fora[1:5], ', ')
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.termos_gerados t
     where exists (select 1 from unnest(t.ativo_ids) x(id) where x.id = any (v_ids))
       and exists (select 1 from unnest(t.ativo_ids) x(id) where not (x.id = any (v_ids)))
  ) then
    raise exception 'Um dos selecionados está num termo que também cobre ativos fora desta seleção: apagá-lo destruiria um documento que não é só dele. Apague o termo primeiro, ou inclua na seleção os outros ativos do mesmo termo.'
      using errcode = '42501';
  end if;

  v_inline := (v_n <= c_cap_inline);

  if not v_inline then
    if coalesce(length(btrim(p_backup_path)), 0) = 0 then
      raise exception 'Seleção com mais de % ativos exige backup em arquivo: o caminho não veio. Nada foi apagado.', c_cap_inline
        using errcode = '22023';
    end if;
    v_digest := public.digest_selecao_conflito(v_ids);
    if not coalesce(btrim(p_backup_path) like public.prefixo_backup_conflito(p_empresa) || v_digest || '/%', false) then
      raise exception 'O backup informado não é o backup desta operação (esperado sob "%"). Nada foi apagado.',
        public.prefixo_backup_conflito(p_empresa) || v_digest || '/'
        using errcode = '22023';
    end if;
    if not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'backups-import' and o.name = btrim(p_backup_path)
    ) then
      raise exception 'O backup dos conflitos não existe no bucket (%). Nada foi apagado. Refaça a seleção.', btrim(p_backup_path)
        using errcode = '22023';
    end if;
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'ativo_id',    a.id,
             'patrimonio',  a.patrimonio,
             'service_tag', a.service_tag,
             'filial_id',   a.filial_id,
             'filial',      f.nome,
             'status',      a.status
           ) order by a.filial_id, a.id)
    into v_resumo
    from public.ativos a
    join public.filiais f on f.id = a.filial_id
   where a.id = any (v_ids);

  if v_inline then
    select jsonb_agg(
             jsonb_build_object(
               'ativo',           to_jsonb(a),
               'movimentacoes',   coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at, m.id)
                                              from public.movimentacoes m where m.ativo_id = a.id), '[]'::jsonb),
               'termos',          coalesce((select jsonb_agg(to_jsonb(t))
                                              from public.termos_gerados t where a.id = any (t.ativo_ids)), '[]'::jsonb),
               'anotacoes',       coalesce((select jsonb_agg(to_jsonb(an))
                                              from public.anotacoes an where an.ativo_id = a.id), '[]'::jsonb),
               'pendencias_item', coalesce((select jsonb_agg(to_jsonb(pi))
                                              from public.pendencias_item pi where pi.ativo_id = a.id), '[]'::jsonb)
             ) order by a.id)
      into v_backup
      from public.ativos a
     where a.id = any (v_ids);
  end if;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.pendencias_item where ativo_id = any (v_ids);
  get diagnostics v_pend = row_count;

  with del as (
    delete from public.termos_gerados t
     where exists (select 1 from unnest(t.ativo_ids) x(id) where x.id = any (v_ids))
    returning t.arquivo_path
  )
  select coalesce(array_agg(arquivo_path), '{}'::text[]), count(*)::int
    into v_arquivos, v_termos
    from del;

  delete from public.anotacoes where ativo_id = any (v_ids);
  get diagnostics v_anot = row_count;

  delete from public.movimentacoes where ativo_id = any (v_ids);
  get diagnostics v_movs = row_count;

  update public.ativos set substitui_ativo_id = null
   where substitui_ativo_id = any (v_ids) and not (id = any (v_ids));
  get diagnostics v_subst = row_count;

  delete from public.ativos where id = any (v_ids);

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (empresa_id, autor, acao, alvo, detalhe)
  values (p_empresa, v_uid, 'conflito_filiais_resolvido',
          coalesce((v_resumo->0->>'patrimonio'), (v_resumo->0->>'service_tag'), v_n::text || ' ativos'),
          jsonb_build_object(
            'justificativa',      btrim(p_justificativa),
            'ativos',             v_n,
            'selecionados',       coalesce(v_resumo, '[]'::jsonb),
            'movimentacoes',      v_movs,
            'anotacoes',          v_anot,
            'pendencias_item',    v_pend,
            'termos',             v_termos,
            'ponteiros_anulados', v_subst,
            'arquivos_termos',    to_jsonb(v_arquivos),
            'backup_em_arquivo',  (not v_inline),
            'backup_path',        nullif(btrim(coalesce(p_backup_path, '')), ''),
            'backup',             coalesce(v_backup, 'null'::jsonb)));

  return jsonb_build_object(
    'ativos',             v_n,
    'movimentacoes',      v_movs,
    'anotacoes',          v_anot,
    'pendencias_item',    v_pend,
    'termos',             v_termos,
    'ponteiros_anulados', v_subst,
    'arquivos_termos',    to_jsonb(v_arquivos),
    'selecionados',       coalesce(v_resumo, '[]'::jsonb));

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

drop function public.prefixo_backup_import(smallint);
drop function public.prefixo_backup_reset(text, smallint);
drop function public.prefixo_backup_conflito();

notify pgrst, 'reload schema';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   to_regprocedure nulo nas três antigas; o md5 das quatro policies e das quatro funções = o do CI; o conta a conta
--   --fase f67b-contraida (a escrita nos backups antigos é a classe declarada; a leitura deles, igual); as 13 checagens
--   iguais; a paridade ensaio × produção.
--
-- ROLLBACK (supabase/rollback/F67B-desfaz.sql, na ordem inversa 0199 → 0194): PRIMEIRO os três montadores antigos recriados (com os grants da 0089/0093/0132), depois as quatro RPCs e as quatro
-- policies como na EXPANSÃO (0195): a forma antiga volta a ser aceita na escrita. Um backup gravado na forma nova
-- continua no bucket; com o rollback até antes da 0195 ele fica legível só por service role. Nenhum dado se perde.
