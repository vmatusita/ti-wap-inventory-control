-- Migration 0064 — F21: guardas de CARGO/VINCULO dentro das RPCs de escrita.
--
-- Contexto: docs/ADR-002-papeis-e-permissoes.md §4.3 · ordem docs/prompts/F21-papeis-ultracode.md §5.6.
-- Depende da 0062 (as funcoes) e da 0063 (as policies).
--
-- POR QUE ESTA MIGRATION EXISTE. Uma funcao SECURITY DEFINER roda com os privilegios do
-- DONO e passa por fora de toda policy de RLS. Fechar as policies (0063) nao a alcanca:
-- a autorizacao tem de ser INTERNA. Sem isso, a 0063 daria uma falsa sensacao de
-- fechamento e a porta destrutiva continuaria escancarada.
--
-- AUDITORIA COMPLETA DE pg_proc (feita nos DOIS bancos em 29/07/2026, antes de escrever
-- esta migration). As 15 funcoes de public, e o que cada uma exige:
--
--   SECURITY DEFINER + escreve + executavel por `authenticated`  →  PRECISA de guarda
--     · importar_ativos_substituir(jsonb,text,jsonb,jsonb)   ← A UNICA. Guarda: e_admin()
--
--   SECURITY DEFINER + escreve, mas SEM execute para authenticated  →  nao precisa
--     · aplicar_movimentacao()      trigger; revoke da 0038; definer DE PROPOSITO
--       (comentario da 0004: "para poder atualizar ativos mesmo com RLS restrita") — e o
--       que faz o efeito derivado no ativo, e o INSERT em pendencias_item da F18,
--       continuarem funcionando com as policies restritas da 0063. Gatear o INSERT de
--       `movimentacoes` basta; nao se toca nele.
--     · handle_new_user()           trigger de auth.users; revoke da 0038/0041/0057
--     · registrar_tentativa_senha() rate limit da senha de acesso; sem execute p/ auth
--
--   SECURITY INVOKER + escreve  →  as policies da 0063 JA cobrem
--     · criar_compra_lote(jsonb,uuid)          guarda so pela MENSAGEM (ver abaixo)
--     · devolver_ao_fornecedor(uuid,jsonb,jsonb,uuid)   idem — ver a nota no fim
--
--   SO LEITURA  →  sem guarda de papel, por determinacao da ordem ("RPCs so de LEITURA
--   nao ganham guarda de papel"): as 7 rel_* (rel_estoque_asof, rel_frescor_itens,
--   rel_mov_itens, rel_mov_por_mes, rel_por_motivo, rel_resumo, rel_saldo_itens),
--   status_apos_movimentacao e valida_lancamento_item.
--
-- `create or replace` PURO, assinatura IDENTICA nas duas (regra do runbook: assinatura
-- diferente cria overload e o PostgREST deixa de resolver a chamada). O corpo de cada uma
-- foi COPIADO do arquivo da ultima migration que a definiu — criar_compra_lote da 0040,
-- importar_ativos_substituir da 0048 — e a UNICA diferenca e o bloco de guarda marcado
-- com "(F21, migration 0064)". Diff-review byte a byte antes do apply, como manda o
-- passo 3 do caminho B do runbook.
--
-- ATENCAO AO GATE DO MODO AUTOMATICO: o corpo de importar_ativos_substituir CONTEM
-- `delete from public.ativos` e `delete from public.movimentacoes`. Precedente da 0048:
-- o `apply_migration` do MCP NAO barrou, porque o corpo nao e executado no apply, so
-- redefinido. Se barrar, NAO insistir: deixar o SQL de handoff em scratchpad/ e registrar
-- como pendente de execucao pelo Johnny (§ Autonomia da ordem).
--
-- NAO TOCA DADO. Depois do apply em cada banco: `notify pgrst, 'reload schema';`
-- (a assinatura nao muda, mas e barato e fecha a armadilha conhecida do runbook).
--
-- REVERSAO: reaplicar o corpo da 0040 (criar_compra_lote) e o da 0048
-- (importar_ativos_substituir), sem os blocos de guarda.

-- ===========================================================================
-- 1) criar_compra_lote — vinculo de filial, por item do lote
-- ===========================================================================
create or replace function public.criar_compra_lote(
  p_itens      jsonb,
  p_criado_por uuid
)
returns table (ativo_id uuid, patrimonio text)
language plpgsql
set search_path = public
as $$
declare
  item     jsonb;
  v_id     uuid;
  v_filial smallint;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Lote de compra vazio';
  end if;

  for item in select * from jsonb_array_elements(p_itens)
  loop
    v_filial := (item->>'filial_id')::smallint;

    -- GUARDA DE VINCULO (F21, migration 0064) — por ITEM do lote.
    -- Esta funcao e SECURITY INVOKER, entao os dois INSERTs abaixo JA passam pelas
    -- policies da 0063 e um operador sem vinculo seria barrado de todo jeito. A guarda
    -- e cinto-e-suspensorio pela MENSAGEM: sem ela o operador receberia o SQLSTATE cru
    -- de violacao de RLS (42501 "new row violates row-level security policy"), que a UI
    -- traduz como "faca login novamente" — conselho errado para quem so nao tem a
    -- filial vinculada. Com ela, a acao devolve o motivo verdadeiro.
    if not public.pode_escrever_filial(v_filial) then
      raise exception 'Sem permissao de escrita na filial % (cadastro de compra).', v_filial
        using errcode = '42501';
    end if;

    insert into public.ativos (
      patrimonio, patrimonio_original, service_tag, categoria, marca, modelo,
      memoria, armazenamento, processador, fornecedor, filial_id, origem, observacoes
    ) values (
      item->>'patrimonio',
      nullif(item->>'patrimonio_original', ''),
      nullif(item->>'service_tag', ''),
      (item->>'categoria')::public.categoria_ativo,
      nullif(item->>'marca', ''),
      nullif(item->>'modelo', ''),
      nullif(item->>'memoria', ''),
      nullif(item->>'armazenamento', ''),
      nullif(item->>'processador', ''),
      nullif(item->>'fornecedor', ''),
      v_filial,
      'cadastro',
      nullif(item->>'observacoes', '')
    )
    returning id into v_id;

    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
    values (
      v_id, 'compra',
      coalesce((item->>'data')::date, current_date),
      v_filial,
      nullif(item->>'observacao', ''),
      coalesce(auth.uid(), p_criado_por)
    );

    ativo_id   := v_id;
    patrimonio := item->>'patrimonio';
    return next;
  end loop;
end $$;

revoke all on function public.criar_compra_lote(jsonb, uuid) from public, anon, service_role;
grant execute on function public.criar_compra_lote(jsonb, uuid) to authenticated;

-- ===========================================================================
-- 2) importar_ativos_substituir — SOMENTE ADMIN
-- ===========================================================================
-- Corpo identico ao da 0048, com o bloco "0b. GUARDA DE CARGO" inserido logo apos a
-- checagem de sessao (`v_uid is null`) e antes de qualquer leitura ou escrita.
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

-- EXECUTE segue so para `authenticated` (reafirmado; o create or replace puro preserva os
-- grants, mas o reforco e idempotente e barato). NAO se revoga de `authenticated`: a
-- autorizacao de verdade agora e a guarda interna e_admin(), e o banco continua sendo a
-- linha de defesa — nao o app.
revoke all on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- NOTA — devolver_ao_fornecedor NAO recebe guarda interna
-- ---------------------------------------------------------------------------
-- Medido: `prosecdef = false` (SECURITY INVOKER). Os INSERTs dela em `ativos` e
-- `movimentacoes` passam pelas policies da 0063, logo o vinculo de filial JA e exigido
-- pelo banco, tanto para o ativo devolvido quanto para o substituto. A mensagem amigavel
-- fica por conta da action (`exigirEscrita` nas duas filiais, src/lib/actions/
-- devolucao-fornecedor.ts), que e o lado certo para texto de UI. Acrescentar um
-- `raise` aqui exigiria reproduzir ~120 linhas de corpo por ganho zero de seguranca —
-- e cada reproducao de corpo e uma chance de drift.

-- ---------- VERIFICACAO POS-APPLY ----------
--   -- 1) uma assinatura por funcao (sem overload) e grants certos
--   select p.oid::regprocedure::text as assinatura,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth,
--          has_function_privilege('service_role', p.oid, 'execute')  as srole
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('criar_compra_lote', 'importar_ativos_substituir')
--    order by p.proname;
--   -- esperado: 2 linhas · anon=false · auth=true · srole=false
--
--   -- 2) as guardas estao MESMO no corpo vivo
--   select p.proname,
--          pg_get_functiondef(p.oid) like '%e_admin()%'              as tem_guarda_admin,
--          pg_get_functiondef(p.oid) like '%pode_escrever_filial%'   as tem_guarda_filial
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('criar_compra_lote', 'importar_ativos_substituir')
--    order by p.proname;
--   -- esperado: criar_compra_lote → f/t ; importar_ativos_substituir → t/f
--
--   -- 3) o resto do corpo nao mudou: contagem de linhas do plano de import
--   select count(*) from public.import_logs;   -- esperado: inalterado
