-- Migration 0080 — F23: a RPC de import aprende a abrir a janela da guarda do acervo.
--
-- ⚠ ESTA MIGRATION EXISTE POR NECESSIDADE, NÃO POR ESCOLHA — e ela toca um objeto que o
-- §Escopo da ordem F23 lista como "não toque" (o import de startup). A razão está registrada
-- em docs/DECISOES.md (30/07/2026) e é esta:
--
--   O critério de aceitação 7 da ordem exige que UPDATE/DELETE direto em
--   ativos/movimentacoes/lancamentos_item siga recusado "para todo papel fora das RPCs
--   oficiais, SERVICE ROLE INCLUSO". O service role ignora RLS (rolbypassrls), então só um
--   TRIGGER o recusa — é a guarda da 0081. E o trigger, por definição, roda para TODO mundo:
--   ele também alcançaria `importar_ativos_substituir`, que remove o acervo da filial.
--
--   Ou seja: instalar a guarda que a ordem manda instalar QUEBRA o import, a menos que o
--   import saiba abri-la. Não há terceira opção. "Não toque no import" é lido, então, como
--   "não mude o que o import FAZ" — e é exatamente isso que esta migration preserva.
--
-- O QUE MUDA: DUAS linhas de `perform set_config(...)` em volta do bloco de DELETEs do passo
-- 3. Nada mais. O comportamento visível ao usuário — validações, recorte por filial, guarda
-- e_admin(), revalidação de contagens, backup, contagens devolvidas, import_logs — é
-- BYTE A BYTE o mesmo.
--
-- PROVA DO DIFF MÍNIMO (feita antes de escrever este arquivo, docs/RELATORIO-F23.md):
--   · o corpo VIVO da função é idêntico em ensaio e produção:
--     md5(regexp_replace(pg_get_functiondef(oid),'\s+',' ','g')) = d533780c5084f907c27d29d8f4af5642
--     nos dois, 17.486 bytes — logo o arquivo da 0064 é a base legítima;
--   · o corpo abaixo foi EXTRAÍDO da 0064 por `sed -n '133,518p'` e alterado por um `awk` que
--     insere as duas linhas; o `diff` base × resultado devolveu exatamente as duas linhas de
--     `set_config` (mais os comentários que as explicam). Qualquer outra diferença é BUG.
--
-- ⚠ A JANELA É A MAIS ESTREITA POSSÍVEL: abre na primeira linha do passo 3 e fecha logo
-- depois do último DELETE, ANTES dos INSERTs do passo 4. O import não precisa da guarda
-- desligada para inserir, e deixá-la aberta até o fim da função entregaria o resto da
-- transação sem rede.
--
-- ⚠ ORDEM DE APPLY: esta migration vem ANTES da 0081. Nesta ordem, o `set_config` é inócuo
-- enquanto o trigger não existe (grava um GUC que ninguém lê) e o import segue idêntico; na
-- ordem inversa, o import fica QUEBRADO na janela entre as duas.
--
-- `create or replace` PURO — assinatura idêntica (jsonb, text, jsonb, jsonb), sem overload.
-- ⚠ O corpo CONTÉM exclusão de acervo → BATE NO GATE do modo automático → caminho **B** do
-- docs/RUNBOOK-BANCO.md (SQL de handoff em scratchpad/, apply manual, verificação pós-apply
-- obrigatória, `notify pgrst, 'reload schema'`).
--
-- REVERSÃO: reaplicar o corpo da 0064 (sem as duas linhas). Só faz sentido junto do rollback
-- da 0081 — sem a guarda, as duas linhas não fazem nada; com a guarda e sem elas, o import
-- para de funcionar.

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

  -- ---------- 0b. GUARDA DE CARGO (F21, migration 0064) ----------
  -- Esta funcao e SECURITY DEFINER: roda como o dono e PASSA POR FORA de toda policy de
  -- RLS. As policies da 0063 nao a alcancam, logo a autorizacao TEM de ser interna.
  -- Sem esta guarda, qualquer logado (inclusive o cargo `consulta`) poderia chamar
  -- /rest/v1/rpc/importar_ativos_substituir com a anon key + o proprio JWT e apagar o
  -- acervo inteiro de uma filial — a operacao mais destrutiva do sistema.
  -- 42501 = insufficient_privilege, o SQLSTATE semanticamente correto (o default de um
  -- `raise` de plpgsql seria P0001). A traducao para pt-BR na UI vem do ramo novo de
  -- permissao em src/lib/actions/erros.ts, que a F21 acrescenta e que casa por code E
  -- por substring da mensagem — sem ele, esta excecao cairia no fallback generico.
  if not public.e_admin() then
    raise exception 'Apenas administradores podem executar o import de startup.'
      using errcode = '42501';
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
                    join public.ativos a on a.id = aid where a.filial_id = v_filial)
      and exists (select 1 from unnest(t.ativo_ids) aid
                    join public.ativos a on a.id = aid where a.filial_id <> v_filial)
  ) then
    raise exception 'Há termo(s) gerado(s) que misturam esta filial com outra — substituição bloqueada. Resolva os termos antes.';
  end if;

  -- ---------- 2b. revalidação do estado vivo (fecha a janela TOCTOU) ----------
  -- N (dívida técnica, 21/07/2026): a revalidação de contagens é OBRIGATÓRIA. Sem isto, um
  -- cliente que chamasse a RPC direto (PostgREST) com p_contagens=null PULAVA a guarda e podia
  -- apagar um acervo que mudou entre o backup e o delete (lost update). A tela SEMPRE passa as
  -- contagens do preview; um null aqui é chamada forjada → recusa antes de qualquer DELETE.
  if p_contagens is null or jsonb_typeof(p_contagens) <> 'object' then
    raise exception 'Revalidação de contagens obrigatória: gere o preview novamente antes de aplicar (p_contagens ausente ou inválido).';
  end if;
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
  -- F23: ABRE a janela da guarda do acervo (0081) para os quatro DELETEs abaixo — e só
  -- para eles. Sem esta linha, o trigger `guarda_acervo` recusaria o import inteiro.
  perform set_config('estoque.dev_destrutivo', 'on', true);
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

  -- F23: FECHA a janela imediatamente. `set_config(..., true)` é local à TRANSAÇÃO, não
  -- à chamada: sem este fecho, os INSERTs do passo 4 — e qualquer statement seguinte da
  -- mesma transação — correriam com a guarda desligada. Lição medida na F22 (0073).
  perform set_config('estoque.dev_destrutivo', 'off', true);

  -- ---------- 4. INSERT por ativo do plano ----------
  for e in select jsonb_array_elements(p_plano->'ativos')
  loop
    v_estado := (e->>'estadoAlvo')::public.status_ativo;

    -- 4a. ativo. Pendência de nascimento é `;`-joinável (F7E patrimônio + F15 service tag):
    --   patrimonio null    → 'sem patrimônio físico'  (sincronia: PENDENCIA_SEM_PATRIMONIO);
    --   serviceTag vazia   → 'sem service tag'        (sincronia: PENDENCIA_SEM_SERVICE_TAG);
    --   os dois            → 'sem patrimônio físico; sem service tag';
    --   nenhum             → null. concat_ws('; ', …) pula os NULLs; nullif('', '') → null.
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
      nullif(
        concat_ws('; ',
          case when (e->>'patrimonio') is null then 'sem patrimônio físico' end,
          case when nullif(e->>'serviceTag', '') is null then 'sem service tag' end
        ),
        ''
      )
    )
    returning id into v_ativo_id;

    -- 4b (REVERTIDO — F8): compra de abertura SEMPRE marcada (escondida do relatório),
    --   COM ou SEM dataEntrada. A data continua a REAL (dataEntrada) quando houver; só a
    --   observação volta a ser SEMPRE `v_obs_marcador` (`import startup dd/MM/yyyy`), no
    --   lugar do `case` condicional da F7H — equivale ao passo 4b da 0034. Motivo: a
    --   planilha de startup não distingue "compra nova" de "saldo de abertura" (toda
    --   linha tem data), então a F7H inundava as Entradas com o acervo pré-existente.
    --   Toda compra de abertura é BASELINE; compra "de verdade" é a lançada manualmente
    --   no sistema pós-go-live (sem marcador → aparece nas Entradas normalmente).
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
    values (
      v_ativo_id, 'compra',
      coalesce(nullif(e->>'dataEntrada', '')::date, v_data_import),
      v_filial, v_obs_marcador, v_uid
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

-- EXECUTE segue só para `authenticated` (reafirmado; o create or replace puro preserva os
-- grants, mas o reforço é idempotente e barato). NÃO se revoga de `authenticated`: a
-- autorização de verdade é a guarda interna e_admin(), e o banco continua sendo a linha de
-- defesa — não o app.
revoke all on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) assinatura única, sem overload:
--   select p.oid::regprocedure::text
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname='importar_ativos_substituir';
--   -- esperado: EXATAMENTE 1 linha, 4 args (jsonb, text, jsonb, jsonb)
--
--   -- 2) grants intactos:
--   select r.rolname, has_function_privilege(r.rolname,
--     'public.importar_ativos_substituir(jsonb,text,jsonb,jsonb)', 'execute')
--     from (values ('anon'),('authenticated'),('service_role')) r(rolname);
--   -- esperado: authenticated=true · anon=false · service_role=false
--
--   -- 3) a janela está lá, e ABRE e FECHA o mesmo tanto:
--   select (length(d) - length(replace(d, '''on''', ''))) / 4  as abre,
--          (length(d) - length(replace(d, '''off''', ''))) / 5 as fecha
--     from (select pg_get_functiondef('public.importar_ativos_substituir(jsonb,text,jsonb,jsonb)'::regprocedure) d) x;
--   -- esperado: abre = 1 e fecha = 1
--
--   -- 4) a guarda e_admin() da 0064 continua no corpo (nada foi perdido na recriação):
--   select pg_get_functiondef('public.importar_ativos_substituir(jsonb,text,jsonb,jsonb)'::regprocedure)
--          like '%e_admin%' as guarda_de_cargo_intacta;
--   -- esperado: true
--
--   -- 5) notify pgrst, 'reload schema';   (a assinatura não mudou, mas é barato)
