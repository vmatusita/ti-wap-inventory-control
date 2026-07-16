-- Migration 0032 — RPC transacional do import de startup "Substituir tudo" (OS-F7 / W2).
--
-- importar_ativos_substituir(p_plano jsonb, p_backup_path text) → jsonb
--
-- Recebe o PlanoImport já validado pela UI (W1 monta a partir do CSV; chaves
-- camelCase) e, DE FORMA ATÔMICA e restrita a UMA filial:
--   1. revalida o plano no banco (a UI é a 2ª linha, nunca a única — CLAUDE.md);
--   2. barra termos multi-filial (rede de segurança; o preview do W3 já barra antes);
--   3. APAGA o acervo da filial em ordem (movs → anotações → termos → ativos);
--   4. RECRIA cada ativo do plano com compra de abertura + (se preciso) ajuste
--      de reconciliação — deixando o TRIGGER (0004/0023) derivar o estado;
--   5. confere contagens/estados dentro da transação (divergiu → rollback);
--   6. grava import_logs e devolve as contagens + os arquivos de termo apagados.
--
-- Por que security definer: `movimentacoes` é INSERT-ONLY por RLS (0005) — não há
-- policy de delete. A RPC roda como owner (postgres, dono das tabelas) e ignora a
-- RLS, então consegue o DELETE do "substituir". search_path = public (padrão 0024)
-- para não deixar objeto plantado noutro schema sequestrar a resolução de nome.
-- Execute só a `authenticated`: a RPC é chamada pela sessão do operador (auth.uid()
-- não-nulo); anon/public/service_role não a executam.
--
-- IMPORTANTE — colaborador_atual/setor_atual num ajuste: o trigger
-- aplicar_movimentacao (0004/0023) NÃO propaga colaborador/setor para o ativo num
-- `ajuste` (só o faz em saida/emprestimo/reserva). A F4 sabia disso e sincronizava
-- por UPDATE DIRETO em ativos.colaborador_atual/setor_atual (DECISOES 15/07;
-- scripts/import/carga.ts). Aqui repetimos: após o ajuste, quando o estado-alvo é
-- de posse (em_uso/emprestado/reservado), fazemos o UPDATE DIRETO desses dois
-- campos. É LEGÍTIMO — a proibição da OS é sobre update direto de `status` (que
-- segue derivado pelo trigger, nunca escrito à mão).
--
-- Marcador da carga: AMBAS as movimentações (compra e ajuste) gravam a observação
-- `import startup dd/MM/yyyy` (data do import). O relatório exclui por PREFIXO
-- ('import startup*' — src/lib/queries/relatorios/movimentacoes.ts). O literal do
-- prefixo é OBS_IMPORT_STARTUP em src/lib/dominio.ts — mantenha em sincronia com
-- o 'import startup' hard-coded abaixo (não há como importar TS no SQL).
--
-- Aditiva. Aplicar no projeto de DESENVOLVIMENTO.

-- A revisão adversarial (16/07) achou uma janela TOCTOU: a revalidação de estado do
-- W3 rodava fora desta transação/lock, então uma movimentação inserida entre o backup
-- e o DELETE seria apagada sem constar no backup (e dois applies simultâneos se
-- sobrescreviam). Fecha-se aqui: `p_contagens` traz as contagens do acervo backupeado
-- e a RPC as reconfere JÁ sob o advisory lock, antes do DELETE (passo 2b). Assinatura
-- mudou (2→3 args) → derruba a versão antiga primeiro.
drop function if exists public.importar_ativos_substituir(jsonb, text);

create or replace function public.importar_ativos_substituir(
  p_plano       jsonb,
  p_backup_path text,
  p_contagens   jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid              uuid    := auth.uid();
  v_filial           smallint;
  v_filial_ativa     boolean;
  v_total_plano      int;
  v_data_import      date    := current_date;
  v_obs_marcador     text    := 'import startup ' || to_char(current_date, 'DD/MM/YYYY');
  e                  jsonb;                 -- ativo corrente do loop
  v_ativo_id         uuid;
  v_estado           public.status_ativo;
  v_ativos_criados   int     := 0;
  v_movs_apagadas    int     := 0;
  v_anot_apagadas    int     := 0;
  v_termos_apagados  int     := 0;
  v_arquivos_termos  text[]  := '{}';
  v_conferidos       int;
  v_esp_ativos       int;
  v_esp_movs         int;
  v_esp_anot         int;
  v_esp_termos       int;
  v_liv_movs         int;
  v_liv_anot         int;
  v_liv_termos       int;
  v_log_id           uuid;
begin
  -- ---------- 0. contexto de operador ----------
  -- A RPC é chamada pela sessão autenticada do operador; auth.uid() alimenta
  -- criado_por (FK profiles) tanto nas movimentações quanto no import_logs.
  if v_uid is null then
    raise exception 'Operador não autenticado: o import só roda numa sessão de operador.';
  end if;

  -- ---------- 1a. filial ----------
  v_filial := (p_plano->>'filialId')::smallint;
  select ativo into v_filial_ativa from public.filiais where id = v_filial;
  if v_filial_ativa is null then
    raise exception 'Filial % não encontrada.', v_filial;
  end if;
  if v_filial_ativa is false then
    raise exception 'Filial % está inativa: import bloqueado.', v_filial;
  end if;

  -- Serializa execuções concorrentes NA MESMA FILIAL (o "substituir" apaga+recria;
  -- duas execuções simultâneas na mesma filial corromperiam contagens). Lock por
  -- transação (namespace fixo + filial_id) — libera no commit/rollback.
  perform pg_advisory_xact_lock(hashtext('import_substituir'), v_filial::int);

  -- ---------- 1b. backup obrigatório ----------
  -- Autoproteção (CLAUDE.md): operação destrutiva exige backup antes. A UI (W3)
  -- exporta o acervo e passa o caminho; sem ele, aborta.
  if coalesce(btrim(p_backup_path), '') = '' then
    raise exception 'Import destrutivo exige backup_path (o acervo da filial deve ser exportado antes).';
  end if;

  -- ---------- 1c. plano não-vazio ----------
  if jsonb_typeof(p_plano->'ativos') <> 'array'
     or jsonb_array_length(p_plano->'ativos') < 1 then
    raise exception 'Plano de import vazio: ao menos 1 ativo é obrigatório.';
  end if;
  v_total_plano := jsonb_array_length(p_plano->'ativos');

  -- ---------- 1d. validação por ativo (regex / enums) ----------
  -- Falha no PRIMEIRO ativo inválido, com a mensagem apontando o patrimônio.
  for e in select jsonb_array_elements(p_plano->'ativos')
  loop
    if coalesce(e->>'patrimonio','') !~ '^[A-Z]{2,4}\d{7}$' then
      raise exception 'Patrimônio inválido no plano: "%" (esperado ^[A-Z]{2,4}\d{7}$).',
        e->>'patrimonio';
    end if;
    if not (e->>'categoria' = any (enum_range(null::public.categoria_ativo)::text[])) then
      raise exception 'Categoria inválida "%" no ativo % (fora do enum categoria_ativo).',
        e->>'categoria', e->>'patrimonio';
    end if;
    if not (e->>'estadoAlvo' = any (enum_range(null::public.status_ativo)::text[])) then
      raise exception 'Estado-alvo inválido "%" no ativo % (fora do enum status_ativo).',
        e->>'estadoAlvo', e->>'patrimonio';
    end if;
  end loop;

  -- ---------- 1e. unicidade (patrimonio, coalesce(serviceTag,'')) no plano ----------
  -- Espelha o índice único ativos_patrimonio_service_tag_uidx (0003): sem service
  -- tag, o patrimônio não pode repetir (coalesce '' colide de propósito).
  if exists (
    select 1
    from jsonb_array_elements(p_plano->'ativos') x
    group by (x->>'patrimonio'), coalesce(x->>'serviceTag','')
    having count(*) > 1
  ) then
    raise exception 'Plano tem par (patrimônio, service tag) duplicado — cada ativo deve ser único.';
  end if;

  -- ---------- 2. rede de segurança: termo multi-filial ----------
  -- termos_gerados referencia ativos por ARRAY (sem FK). Se um termo mistura
  -- ativos DESTA filial com ativos de OUTRA, apagar os desta filial deixaria o
  -- termo órfão/inconsistente. O preview do W3 já barra antes; aqui é a rede.
  if exists (
    select 1
    from public.termos_gerados t
    where exists (select 1 from unnest(t.ativo_ids) aid
                    join public.ativos a on a.id = aid where a.filial_id = v_filial)
      and exists (select 1 from unnest(t.ativo_ids) aid
                    join public.ativos a on a.id = aid where a.filial_id <> v_filial)
  ) then
    raise exception 'Há termo(s) gerado(s) que misturam esta filial com outra — substituição bloqueada. Resolva os termos antes.';
  end if;

  -- ---------- 2b. revalidação do estado vivo (fecha a janela TOCTOU) ----------
  -- O W3 fotografou o acervo (preview + backup) ANTES desta transação, em round-trips
  -- FORA do lock. Aqui, já sob o advisory lock e na MESMA transação do DELETE,
  -- reconferimos que o estado vivo ainda bate com o que foi backupeado (`p_contagens`
  -- = contagens do acervo exportado: ativos/movimentacoes/anotacoes/termos, mesmo
  -- escopo do DELETE abaixo). Divergiu — uma movimentação inserida na janela entre o
  -- backup e este ponto, ou um segundo "substituir" concorrente que já recriou o
  -- acervo — então ABORTA: nada é apagado, o backup segue fiel e a mov avulsa
  -- sobrevive. Fecha o lost-update de dois applies simultâneos (o 2º vê contagens
  -- alteradas pelo 1º e aborta). Tolerante a p_contagens ausente (smoke/manual).
  if p_contagens is not null and jsonb_typeof(p_contagens) = 'object' then
    v_esp_ativos := coalesce((p_contagens->>'ativos')::int, -1);
    v_esp_movs   := coalesce((p_contagens->>'movimentacoes')::int, -1);
    v_esp_anot   := coalesce((p_contagens->>'anotacoes')::int, -1);
    v_esp_termos := coalesce((p_contagens->>'termos')::int, -1);

    select count(*) into v_conferidos from public.ativos where filial_id = v_filial;
    select count(*) into v_liv_movs from public.movimentacoes
     where ativo_id in (select id from public.ativos where filial_id = v_filial);
    select count(*) into v_liv_anot from public.anotacoes
     where ativo_id in (select id from public.ativos where filial_id = v_filial);
    select count(*) into v_liv_termos from public.termos_gerados t
     where exists (select 1 from unnest(t.ativo_ids) aid
                     join public.ativos a on a.id = aid where a.filial_id = v_filial)
       and not exists (select 1 from unnest(t.ativo_ids) aid
                     join public.ativos a on a.id = aid where a.filial_id <> v_filial);

    if v_conferidos <> v_esp_ativos or v_liv_movs <> v_esp_movs
       or v_liv_anot <> v_esp_anot or v_liv_termos <> v_esp_termos then
      raise exception 'O estado da filial mudou desde o preview/backup (ativos %/%, movs %/%, anotações %/%, termos %/%). Gere o preview novamente antes de aplicar.',
        v_conferidos, v_esp_ativos, v_liv_movs, v_esp_movs, v_liv_anot, v_esp_anot, v_liv_termos, v_esp_termos;
    end if;
  end if;

  -- ---------- 3. DELETE ordenado (só desta filial) ----------
  -- Ordem obrigatória pelas FKs: movimentacoes e anotacoes referenciam ativos
  -- (not null) → apagam antes; termos_gerados não tem FK, mas apagamos aqui (e
  -- devolvemos os arquivo_path p/ o W3 remover do Storage) enquanto os ativos
  -- ainda existem para o join por filial; ativos por último.

  -- 3a. movimentações dos ativos da filial
  delete from public.movimentacoes
   where ativo_id in (select id from public.ativos where filial_id = v_filial);
  get diagnostics v_movs_apagadas = row_count;

  -- 3b. anotações dos ativos da filial
  delete from public.anotacoes
   where ativo_id in (select id from public.ativos where filial_id = v_filial);
  get diagnostics v_anot_apagadas = row_count;

  -- 3c. termos_gerados "puros" desta filial (≥1 ativo desta filial e NENHUM de
  --     outra — após a guarda 2, todo termo que toca esta filial é puro dela).
  --     Coleta os arquivo_path apagados: o Postgres não remove objeto do Storage,
  --     então devolvemos a lista no retorno p/ o W3 apagar do bucket `termos`.
  with del as (
    delete from public.termos_gerados t
     where exists (select 1 from unnest(t.ativo_ids) aid
                     join public.ativos a on a.id = aid where a.filial_id = v_filial)
       and not exists (select 1 from unnest(t.ativo_ids) aid
                     join public.ativos a on a.id = aid where a.filial_id <> v_filial)
    returning t.arquivo_path
  )
  select coalesce(array_agg(arquivo_path), '{}'::text[]), count(*)::int
    into v_arquivos_termos, v_termos_apagados
    from del;

  -- 3d. ativos da filial (por último — já sem movs/anotações/termos referenciando)
  delete from public.ativos where filial_id = v_filial;

  -- ---------- 4. INSERT por ativo do plano ----------
  for e in select jsonb_array_elements(p_plano->'ativos')
  loop
    v_estado := (e->>'estadoAlvo')::public.status_ativo;

    -- 4a. ativo (origem 'importacao'; cadastrais + observações; campos derivados
    --     começam no default — status em_estoque, colaborador/setor null).
    insert into public.ativos (
      patrimonio, patrimonio_original, service_tag, categoria,
      marca, modelo, fornecedor, memoria, armazenamento, processador, hostname,
      filial_id, origem, observacoes
    ) values (
      e->>'patrimonio',
      nullif(e->>'patrimonioOriginal', ''),
      nullif(e->>'serviceTag', ''),
      (e->>'categoria')::public.categoria_ativo,
      nullif(e->>'marca', ''),
      nullif(e->>'modelo', ''),
      nullif(e->>'fornecedor', ''),
      nullif(e->>'memoria', ''),
      nullif(e->>'armazenamento', ''),
      nullif(e->>'processador', ''),
      nullif(e->>'hostname', ''),
      v_filial,
      'importacao',
      nullif(e->>'observacoes', '')
    )
    returning id into v_ativo_id;

    -- 4b. compra de abertura (SEMPRE). Ativo novo nasce em_estoque → compra é
    --     válida a partir de em_estoque. data = dataEntrada (ou data do import
    --     se null). observação = marcador (excluído do relatório por prefixo).
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
    values (
      v_ativo_id, 'compra',
      coalesce(nullif(e->>'dataEntrada', '')::date, v_data_import),
      v_filial, v_obs_marcador, v_uid
    );

    -- 4c. ajuste de reconciliação (só se o estado-alvo não é em_estoque). Leva o
    --     ativo ao estadoAlvo pela válvula de escape (o trigger deriva o estado a
    --     partir de status_resultante). colaborador/setor/chamado ficam na PRÓPRIA
    --     linha (rastro de auditoria) — mas o trigger NÃO os propaga ao ativo.
    if v_estado <> 'em_estoque' then
      insert into public.movimentacoes (
        ativo_id, tipo, data, filial_id, colaborador, setor, chamado,
        observacao, status_resultante, criado_por
      ) values (
        v_ativo_id, 'ajuste', v_data_import, v_filial,
        nullif(e->>'colaborador', ''), nullif(e->>'setor', ''), nullif(e->>'chamado', ''),
        v_obs_marcador, v_estado, v_uid
      );
    end if;

    -- 4d. sincroniza colaborador_atual/setor_atual quando o estado é de POSSE.
    --     UPDATE DIRETO legítimo (padrão F4 / DECISOES 15/07): o ajuste não
    --     propaga esses campos; `status` NÃO é tocado aqui (segue derivado).
    if v_estado in ('em_uso', 'emprestado', 'reservado') then
      update public.ativos set
        colaborador_atual = nullif(e->>'colaborador', ''),
        setor_atual       = nullif(e->>'setor', ''),
        updated_at        = now()
      where id = v_ativo_id;
    end if;

    v_ativos_criados := v_ativos_criados + 1;
  end loop;

  -- ---------- 5. conferência dentro da transação ----------
  -- 5a. contagem: nº de ativos criados = tamanho do plano; e o total da filial
  --     (após substituir) também bate com o plano.
  if v_ativos_criados <> v_total_plano then
    raise exception 'Divergência: % ativos criados para % no plano.', v_ativos_criados, v_total_plano;
  end if;
  select count(*) into v_conferidos from public.ativos where filial_id = v_filial;
  if v_conferidos <> v_total_plano then
    raise exception 'Divergência: % ativos na filial após import, % no plano.', v_conferidos, v_total_plano;
  end if;

  -- 5b. estado de cada ativo = estadoAlvo (join pela chave natural do plano).
  if exists (
    select 1
    from jsonb_array_elements(p_plano->'ativos') x
    join public.ativos a
      on a.patrimonio = x->>'patrimonio'
     and coalesce(a.service_tag, '') = coalesce(x->>'serviceTag', '')
     and a.filial_id = v_filial
    where a.status <> (x->>'estadoAlvo')::public.status_ativo
  ) then
    raise exception 'Divergência de estado após import: algum ativo não ficou no estado-alvo.';
  end if;

  -- 5c. posse: ativos em em_uso/emprestado/reservado têm colaborador_atual = o do
  --     plano (garante que o UPDATE 4d valeu). Comparação null-safe.
  if exists (
    select 1
    from jsonb_array_elements(p_plano->'ativos') x
    join public.ativos a
      on a.patrimonio = x->>'patrimonio'
     and coalesce(a.service_tag, '') = coalesce(x->>'serviceTag', '')
     and a.filial_id = v_filial
    where a.status in ('em_uso', 'emprestado', 'reservado')
      and coalesce(a.colaborador_atual, '') <> coalesce(x->>'colaborador', '')
  ) then
    raise exception 'Divergência de colaborador após import: ativo em posse sem o colaborador do plano.';
  end if;

  -- ---------- 6. log + retorno ----------
  insert into public.import_logs (
    filial_id, modo, arquivo_hash, total_linhas,
    ativos_criados, movs_apagadas, anotacoes_apagadas, termos_apagados,
    backup_path, criado_por
  ) values (
    v_filial, 'substituir',
    coalesce(p_plano->>'arquivoHash', ''),
    coalesce((p_plano->>'totalLinhasDados')::int, 0),
    v_ativos_criados, v_movs_apagadas, v_anot_apagadas, v_termos_apagados,
    p_backup_path, v_uid
  )
  returning id into v_log_id;

  return jsonb_build_object(
    'log_id',                   v_log_id,
    'filial_id',                v_filial,
    'ativos_criados',           v_ativos_criados,
    'movs_apagadas',            v_movs_apagadas,
    'anotacoes_apagadas',       v_anot_apagadas,
    'termos_apagados',          v_termos_apagados,
    -- arquivos de termo apagados no banco → o W3 remove do Storage (bucket `termos`)
    'arquivos_termos_apagados', to_jsonb(v_arquivos_termos)
  );
end $$;

-- EXECUTE só para `authenticated` (a sessão do operador). O default do Supabase
-- concede EXECUTE a public/anon/service_role via ALTER DEFAULT PRIVILEGES, então
-- revogamos desses papéis ALÉM de public (advisor
-- anon/authenticated_security_definer_function_executable / SECURITY DEFINER).
revoke all on function public.importar_ativos_substituir(jsonb, text, jsonb) from public, anon, service_role;
grant execute on function public.importar_ativos_substituir(jsonb, text, jsonb) to authenticated;


-- =====================================================================
-- SMOKE (COMENTADO) — para o ORQUESTRADOR rodar no DEV via MCP.
-- Plano fictício de 2 ativos (1 em_estoque, 1 em_uso com colaborador) numa filial
-- de teste descartável. Tudo dentro de begin;…;rollback; — não persiste nada.
-- Dados 100% fictícios (WAP0001234 / WAP0005678, "Fulano de Tal") — CLAUDE.md.
--
-- Nota: a RPC exige auth.uid() não-nulo. Numa sessão SQL bruta (MCP) auth.uid() é
-- null, então o DO block abaixo injeta request.jwt.claims.sub com um PROFILE
-- existente do DEV (FK criado_por). Se o DEV não tiver profile, crie um antes ou
-- ajuste o select. Esperado: retorno com ativos_criados=2; WAP0001234 em_estoque
-- sem colaborador; WAP0005678 em_uso com colaborador 'Fulano de Tal'.
--
-- begin;
--   do $smoke$
--   declare
--     v_prof   uuid;
--     v_filial smallint;
--     v_res    jsonb;
--   begin
--     select id into v_prof from public.profiles order by created_at limit 1;
--     if v_prof is null then
--       raise exception 'Smoke: nenhum profile no DEV — crie um operador antes.';
--     end if;
--     perform set_config('request.jwt.claims', json_build_object('sub', v_prof)::text, true);
--
--     insert into public.filiais (slug, nome, ativo)
--     values ('smoke-import-f7', 'Smoke Import F7', true)
--     returning id into v_filial;
--
--     v_res := public.importar_ativos_substituir(
--       jsonb_build_object(
--         'filialId',         v_filial,
--         'arquivoHash',      'deadbeefcafe',
--         'totalLinhasDados', 2,
--         'ativos', jsonb_build_array(
--           jsonb_build_object(
--             'patrimonio','WAP0001234', 'patrimonioOriginal','1234', 'serviceTag', null,
--             'categoria','notebook', 'marca','Dell', 'modelo','Latitude 5490',
--             'fornecedor','WAP', 'memoria','16GB', 'armazenamento','512GB SSD',
--             'processador','i5-8350U', 'hostname','NB-1234', 'observacoes', null,
--             'dataEntrada','2026-07-01', 'estadoAlvo','em_estoque',
--             'colaborador', null, 'setor', null, 'chamado', null
--           ),
--           jsonb_build_object(
--             'patrimonio','WAP0005678', 'patrimonioOriginal','5678', 'serviceTag','ST-9',
--             'categoria','celular', 'marca','Samsung', 'modelo','Galaxy A54',
--             'fornecedor','WAP', 'memoria', null, 'armazenamento', null,
--             'processador', null, 'hostname', null, 'observacoes', null,
--             'dataEntrada', null, 'estadoAlvo','em_uso',
--             'colaborador','Fulano de Tal', 'setor','TI', 'chamado','CH-001'
--           )
--         )
--       ),
--       'backups-import/smoke/plano-smoke.json',
--       jsonb_build_object('ativos',0,'movimentacoes',0,'anotacoes',0,'termos',0)  -- filial nova = tudo 0
--     );
--     raise notice 'RESULTADO: %', v_res;
--     raise notice 'ATIVOS: %', (
--       select jsonb_agg(jsonb_build_object(
--         'patrimonio', patrimonio, 'status', status,
--         'colaborador_atual', colaborador_atual, 'setor_atual', setor_atual))
--       from public.ativos where filial_id = v_filial
--     );
--     raise notice 'MOVS: %', (
--       select jsonb_agg(jsonb_build_object(
--         'tipo', tipo, 'data', data, 'status_resultante', status_resultante,
--         'observacao', observacao, 'colaborador', colaborador))
--       from public.movimentacoes m
--       where m.ativo_id in (select id from public.ativos where filial_id = v_filial)
--     );
--   end
--   $smoke$;
-- rollback;
-- =====================================================================
