-- Migration 0035 — import de startup: compra COM data real vira Entrada no relatório
-- (OS-F7H / decisão do Johnny 20/07/2026, Opção A).
--
-- CONTEXTO. Até aqui, TODA movimentação do import de startup (compra de abertura +
-- ajuste de reconciliação) levava a observação `import startup dd/MM/yyyy`, e o
-- relatório exclui por PREFIXO tudo com esse marcador (não inundar o go-live). O
-- efeito colateral: os equipamentos NOVOS (ex.: um lote de notebooks comprado agora)
-- entravam pelo mesmo import e NUNCA apareciam nas Entradas do relatório, mesmo tendo
-- data real recente. O Johnny (20/07/2026) decidiu: **compra COM data real do arquivo
-- deve aparecer nas Entradas, no período da data**; só o saldo de abertura SEM data e
-- os ajustes de estado ficam de fora.
--
-- COMO. O único ponto que muda é o passo 4b (insert da compra): a observação-marcadora
-- (que ESCONDE do relatório) passa a ser CONDICIONAL —
--   · compra COM data real (`dataEntrada` não-nula, anterior ao dia do import) →
--     observação NULL → o relatório a inclui nas Entradas, como qualquer compra manual;
--   · compra SEM data (`dataEntrada` nula → cai na data do import, saldo de abertura de
--     data desconhecida) → mantém `import startup dd/MM/yyyy` → segue escondida.
-- O AJUSTE (4c) continua SEMPRE com o marcador: é reconciliação de estado, não uma
-- entrada/saída real, e sequer consta nas tabelas do relatório (que só listam
-- saida/emprestimo, devolucao/compra e transferencia).
--
-- Reverte PARCIALMENTE a spec §10.2 ("startup não conta como entrada do período"):
-- agora só o saldo SEM data e os ajustes ficam fora; a compra datada conta.
--
-- O RELATÓRIO NÃO MUDA (o filtro `not.like 'import startup*'` com `.or(is null)` já
-- inclui as compras de observação NULL — src/lib/queries/relatorios/movimentacoes.ts).
-- Os DADOS já importados (a Matriz) são corrigidos por um UPDATE pontual à parte
-- (fora desta migration, pois isto só afeta imports FUTUROS): strip do marcador nas
-- compras com `data < created_at::date`.
--
-- ---------------------------------------------------------------------------
-- `create or replace` PURO (4 args, SEM drop), como a 0034: a assinatura é IDÊNTICA
-- (jsonb, text, jsonb, jsonb), então NÃO há o gotcha de overload da 0033 e o
-- pg_proc continua com 1 linha. O corpo é o da 0034 VERBATIM, com EXATAMENTE uma
-- emenda (marcada "F7H" no passo 4b). Qualquer outra diferença é BUG. Os grants são
-- reafirmados no fim (defesa em profundidade; o `create or replace` puro os preserva).
--
-- Aditiva (troca o corpo da função; não apaga dado). Aplicar no DEV; o orquestrador
-- entrega o SQL para o Johnny rodar em produção pelo SQL Editor (gate do classificador
-- barra DDL com `delete from ativos/movimentacoes` em produção).

create or replace function public.importar_ativos_substituir(
  p_plano       jsonb,
  p_backup_path text,
  p_contagens   jsonb,
  p_correcoes   jsonb default '[]'::jsonb
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
  e                  jsonb;
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

  perform pg_advisory_xact_lock(hashtext('import_substituir'), v_filial::int);

  -- ---------- 1b. backup obrigatório ----------
  if coalesce(btrim(p_backup_path), '') = '' then
    raise exception 'Import destrutivo exige backup_path (o acervo da filial deve ser exportado antes).';
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

  -- ---------- 1d. validação por ativo (regex / enums) — F7E: regex só p/ não-nulo ----------
  for e in select jsonb_array_elements(p_plano->'ativos')
  loop
    if (e->>'patrimonio') is not null and (e->>'patrimonio') !~ '^[A-Z]{2,4}\d{7}$' then
      raise exception 'Patrimônio inválido no plano: "%" (esperado ^[A-Z]{2,4}\d{7}$ ou nulo).',
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
                    join public.ativos a on a.id = aid where a.filial_id = v_filial)
      and exists (select 1 from unnest(t.ativo_ids) aid
                    join public.ativos a on a.id = aid where a.filial_id <> v_filial)
  ) then
    raise exception 'Há termo(s) gerado(s) que misturam esta filial com outra — substituição bloqueada. Resolva os termos antes.';
  end if;

  -- ---------- 2b. revalidação do estado vivo (fecha a janela TOCTOU) ----------
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
  delete from public.movimentacoes
   where ativo_id in (select id from public.ativos where filial_id = v_filial);
  get diagnostics v_movs_apagadas = row_count;

  delete from public.anotacoes
   where ativo_id in (select id from public.ativos where filial_id = v_filial);
  get diagnostics v_anot_apagadas = row_count;

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

  delete from public.ativos where filial_id = v_filial;

  -- ---------- 4. INSERT por ativo do plano ----------
  for e in select jsonb_array_elements(p_plano->'ativos')
  loop
    v_estado := (e->>'estadoAlvo')::public.status_ativo;

    -- 4a. ativo (F7E: patrimonio pode ser null → pendencia 'sem patrimônio físico').
    insert into public.ativos (
      patrimonio, patrimonio_original, service_tag, categoria,
      marca, modelo, fornecedor, memoria, armazenamento, processador, hostname,
      filial_id, origem, observacoes, pendencia
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
      nullif(e->>'observacoes', ''),
      case when (e->>'patrimonio') is null then 'sem patrimônio físico' else null end
    )
    returning id into v_ativo_id;

    -- 4b. compra de abertura (SEMPRE). data = dataEntrada (ou data do import se null).
    --
    -- F7H — ÚNICA EMENDA vs. 0034: a observação-marcadora (que ESCONDE do relatório)
    --   é CONDICIONAL. Compra COM data real (`dataEntrada` não-nula) → observação
    --   NULL → aparece nas Entradas do relatório no período da data, como uma compra
    --   manual. Compra SEM data (`dataEntrada` nula → cai na data do import: saldo de
    --   abertura de data desconhecida) → mantém `import startup dd/MM/yyyy` → segue
    --   escondida. O `nullif(e->>'dataEntrada','')` é EXATAMENTE o mesmo teste que
    --   decide a data (coalesce logo abaixo), então marcador e data ficam coerentes.
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
    values (
      v_ativo_id, 'compra',
      coalesce(nullif(e->>'dataEntrada', '')::date, v_data_import),
      v_filial,
      case when nullif(e->>'dataEntrada', '') is not null
           then null
           else v_obs_marcador
      end,
      v_uid
    );

    -- 4c. ajuste de reconciliação (só se o estado-alvo não é em_estoque). SEMPRE com
    --     o marcador: é reconciliação de estado, não entrada/saída real (e nem consta
    --     nas tabelas do relatório). data = dataAjuste (ou data do import se null).
    if v_estado <> 'em_estoque' then
      insert into public.movimentacoes (
        ativo_id, tipo, data, filial_id, colaborador, setor, chamado,
        observacao, status_resultante, criado_por
      ) values (
        v_ativo_id, 'ajuste',
        coalesce(nullif(e->>'dataAjuste', '')::date, v_data_import),
        v_filial,
        nullif(e->>'colaborador', ''), nullif(e->>'setor', ''), nullif(e->>'chamado', ''),
        v_obs_marcador, v_estado, v_uid
      );
    end if;

    -- 4d. sincroniza colaborador_atual/setor_atual quando o estado é de POSSE.
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
  if v_ativos_criados <> v_total_plano then
    raise exception 'Divergência: % ativos criados para % no plano.', v_ativos_criados, v_total_plano;
  end if;
  select count(*) into v_conferidos from public.ativos where filial_id = v_filial;
  if v_conferidos <> v_total_plano then
    raise exception 'Divergência: % ativos na filial após import, % no plano.', v_conferidos, v_total_plano;
  end if;

  -- 5b. estado de cada ativo = estadoAlvo (join null-safe, linhas com chave — F7E).
  if exists (
    select 1
    from jsonb_array_elements(p_plano->'ativos') x
    join public.ativos a
      on a.patrimonio is not distinct from (x->>'patrimonio')
     and coalesce(a.service_tag, '') = coalesce(x->>'serviceTag', '')
     and a.filial_id = v_filial
    where ((x->>'patrimonio') is not null or coalesce(x->>'serviceTag', '') <> '')
      and a.status <> (x->>'estadoAlvo')::public.status_ativo
  ) then
    raise exception 'Divergência de estado após import: algum ativo (com patrimônio ou tag) não ficou no estado-alvo.';
  end if;

  -- 5c. posse (join null-safe, linhas com chave — F7E).
  if exists (
    select 1
    from jsonb_array_elements(p_plano->'ativos') x
    join public.ativos a
      on a.patrimonio is not distinct from (x->>'patrimonio')
     and coalesce(a.service_tag, '') = coalesce(x->>'serviceTag', '')
     and a.filial_id = v_filial
    where ((x->>'patrimonio') is not null or coalesce(x->>'serviceTag', '') <> '')
      and a.status in ('em_uso', 'emprestado', 'reservado')
      and coalesce(a.colaborador_atual, '') <> coalesce(x->>'colaborador', '')
  ) then
    raise exception 'Divergência de colaborador após import: ativo em posse sem o colaborador do plano.';
  end if;

  -- 5d. conferência AGREGADA das linhas SEM chave natural (patrimônio null E sem tag — F7E).
  if exists (
    (
      select coalesce(x->>'estadoAlvo', '') as estado,
             case when (x->>'estadoAlvo') in ('em_uso','emprestado','reservado')
                  then coalesce(x->>'colaborador', '') else '' end as colaborador,
             count(*) as n
      from jsonb_array_elements(p_plano->'ativos') x
      where (x->>'patrimonio') is null and coalesce(x->>'serviceTag', '') = ''
      group by 1, 2
      except
      select a.status::text as estado,
             coalesce(a.colaborador_atual, '') as colaborador,
             count(*) as n
      from public.ativos a
      where a.filial_id = v_filial
        and a.patrimonio is null and coalesce(a.service_tag, '') = ''
      group by 1, 2
    )
    union all
    (
      select a.status::text as estado,
             coalesce(a.colaborador_atual, '') as colaborador,
             count(*) as n
      from public.ativos a
      where a.filial_id = v_filial
        and a.patrimonio is null and coalesce(a.service_tag, '') = ''
      group by 1, 2
      except
      select coalesce(x->>'estadoAlvo', '') as estado,
             case when (x->>'estadoAlvo') in ('em_uso','emprestado','reservado')
                  then coalesce(x->>'colaborador', '') else '' end as colaborador,
             count(*) as n
      from jsonb_array_elements(p_plano->'ativos') x
      where (x->>'patrimonio') is null and coalesce(x->>'serviceTag', '') = ''
      group by 1, 2
    )
  ) then
    raise exception 'Divergência (agregada) nas linhas sem patrimônio e sem service tag: a contagem por estado × colaborador não bate entre plano e banco.';
  end if;

  -- ---------- 6. log + retorno ----------
  insert into public.import_logs (
    filial_id, modo, arquivo_hash, total_linhas,
    ativos_criados, movs_apagadas, anotacoes_apagadas, termos_apagados,
    backup_path, correcoes, criado_por
  ) values (
    v_filial, 'substituir',
    coalesce(p_plano->>'arquivoHash', ''),
    coalesce((p_plano->>'totalLinhasDados')::int, 0),
    v_ativos_criados, v_movs_apagadas, v_anot_apagadas, v_termos_apagados,
    p_backup_path, coalesce(p_correcoes, '[]'::jsonb), v_uid
  )
  returning id into v_log_id;

  return jsonb_build_object(
    'log_id',                   v_log_id,
    'filial_id',                v_filial,
    'ativos_criados',           v_ativos_criados,
    'movs_apagadas',            v_movs_apagadas,
    'anotacoes_apagadas',       v_anot_apagadas,
    'termos_apagados',          v_termos_apagados,
    'arquivos_termos_apagados', to_jsonb(v_arquivos_termos)
  );
end $$;

-- EXECUTE só para `authenticated` (reafirmado — o `create or replace` puro preserva
-- os grants da 0033/0034; reforço idempotente, defesa em profundidade).
revoke all on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) to authenticated;
