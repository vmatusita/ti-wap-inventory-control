-- Migration 0033 — correções do import registradas na trilha de auditoria (OS-F7B / W2).
--
-- A F7B leva a correção de erros do CSV para DENTRO da tela (admin/importar): o
-- operador corrige em massa (valores repetidos) e pontualmente no próprio preview,
-- e o motor revalida tudo do zero a cada mudança. O ARQUIVO ENVIADO NUNCA MUDA —
-- `arquivo_hash` continua sendo o sha-256 do arquivo ORIGINAL. As correções são
-- operações declaradas (`CorrecaoImport[]`, contrato §1.5 da OS-F7B) aplicadas em
-- memória sobre as células antes da montagem do plano.
--
-- Daí a auditoria de um import passar a ter DUAS peças: arquivo (hash) + correções.
-- Só com as duas se reconstrói o caminho arquivo → plano → acervo. Esta migration
-- guarda a segunda peça:
--
--   (1) `import_logs.correcoes jsonb not null default '[]'` — a lista de operações
--       daquele import, na ORDEM em que foi aplicada (a aplicação é determinística
--       e dependente de ordem: op sobre linha já removida é no-op).
--   (2) a RPC `importar_ativos_substituir` ganha `p_correcoes jsonb` e grava (1).
--
-- ESCOPO: só auditoria. As correções NÃO alteram o fluxo da RPC — o plano já chega
-- corrigido do preview e continua sendo revalidado aqui do mesmo jeito (formato,
-- enums, unicidade, filial). Nenhuma salvaguarda da F7 é tocada: backup obrigatório,
-- confirmação pelo nome da filial, revalidação TOCTOU por contagens sob advisory
-- lock, tudo-ou-nada, RLS — tudo idêntico à 0032.
--
-- ---------------------------------------------------------------------------
-- POR QUE DROP + CREATE (e não `create or replace` puro)
-- ---------------------------------------------------------------------------
-- Em Postgres a IDENTIDADE de uma função é (nome + tipos dos parâmetros). Um
-- `create or replace function` com uma LISTA DE PARÂMETROS DIFERENTE não substitui
-- a função antiga: cria uma SOBRECARGA (overload) nova ao lado dela. Ficaríamos com
-- duas `importar_ativos_substituir` vivas — a de 3 args (sem auditoria de correções)
-- e a de 4. Pior: a chamada de 3 args ficaria AMBÍGUA (a de 3 args casa exato; a de
-- 4 casa pelo default) e o Postgres erraria com "function is not unique", derrubando
-- o import em produção. Some-se a isso a herança de privilégio: um overload esquecido
-- é uma porta de entrada a mais para o mesmo código destrutivo.
--
-- Então: DROP explícito da assinatura de 3 args e CREATE da de 4. Consequência a não
-- esquecer — o DROP leva junto os GRANTs; eles são reaplicados no fim do arquivo com
-- a assinatura NOVA (4 args). Sem isso a função nasceria com o default do Supabase
-- (EXECUTE para public/anon/service_role) — exatamente o que a 0032 revogou.
--
-- `drop ... if exists` + `create or replace` (em vez de `drop` + `create` secos) são
-- de propósito: tornam a migration re-executável sem quebrar. O gotcha do overload é
-- fechado pelo DROP da assinatura antiga, não pela ausência do `or replace`.
--
-- CORPO: COPIADO VERBATIM da 0032 — mesma lógica, mesmos comentários. As ÚNICAS
-- mudanças são as duas marcadas com "F7B" abaixo:
--   (a) validação de `p_correcoes` (precisa ser array json);
--   (b) `correcoes` no insert do import_logs.
-- Qualquer outra diferença entre este corpo e o da 0032 é BUG, não melhoria.
--
-- Aditiva (coluna nova com default + recriação de função). Não apaga dado.

-- ---------- COLUNA import_logs.correcoes ----------
-- not null default '[]' → as linhas de imports ANTIGOS (F7, antes da correção em
-- tela) ficam com array vazio, que é a verdade: aqueles imports não tiveram correção.
-- jsonb (não json): guarda normalizado e é indexável/consultável se um dia precisar.
alter table public.import_logs
  add column correcoes jsonb not null default '[]'::jsonb;

comment on column public.import_logs.correcoes is
  'Operações de correção aplicadas no preview (CorrecaoImport[], na ordem de aplicação). O CSV original é imutável: auditoria = arquivo_hash + correcoes → plano. F7B.';

-- ---------- RPC: 3 args → 4 args ----------
drop function if exists public.importar_ativos_substituir(jsonb, text, jsonb);

create or replace function public.importar_ativos_substituir(
  p_plano       jsonb,
  p_backup_path text,
  p_contagens   jsonb,
  p_correcoes   jsonb default '[]'::jsonb   -- F7B: auditoria (default → chamada de 3 args segue válida)
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

  -- ---------- 1b-bis. correções (F7B — MUDANÇA (a) em relação à 0032) ----------
  -- p_correcoes é AUDITORIA, não instrução: a RPC não as aplica (o plano já chega
  -- corrigido do preview, e é revalidado abaixo do mesmo jeito de sempre). Só
  -- exigimos que seja um array json — o que vai para o log tem que ser a lista de
  -- operações, não um objeto solto ou uma string. NULL é tolerado (vira '[]' no
  -- insert), espelhando a tolerância de p_contagens a chamadas manuais/smoke.
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
  -- F7B — MUDANÇA (b) em relação à 0032: `correcoes` entra no log. coalesce p/ '[]'
  -- porque a coluna é not null e p_correcoes pode chegar null (chamada manual/smoke).
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
    -- arquivos de termo apagados no banco → o W3 remove do Storage (bucket `termos`)
    'arquivos_termos_apagados', to_jsonb(v_arquivos_termos)
  );
end $$;

-- EXECUTE só para `authenticated` (a sessão do operador). O default do Supabase
-- concede EXECUTE a public/anon/service_role via ALTER DEFAULT PRIVILEGES, então
-- revogamos desses papéis ALÉM de public (advisor
-- anon/authenticated_security_definer_function_executable / SECURITY DEFINER).
-- REAPLICADOS aqui com a assinatura de 4 ARGS: o DROP acima levou junto os grants
-- que a 0032 tinha concedido à assinatura de 3 args (privilégio segue a identidade
-- da função, e a identidade mudou). Esquecer este bloco = função destrutiva
-- executável por anon.
revoke all on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) to authenticated;


-- =====================================================================
-- SMOKE (COMENTADO) — para o ORQUESTRADOR rodar no DEV via MCP.
-- Espelha o smoke da 0032, acrescentando p_correcoes. Plano fictício de 2 ativos
-- (1 em_estoque, 1 em_uso com colaborador) numa filial de teste descartável, tudo
-- dentro de begin;…;rollback; — não persiste nada.
-- Dados 100% fictícios (WAP0001234 / WAP0005678, "Fulano de Tal") — CLAUDE.md.
--
-- Nota: a RPC exige auth.uid() não-nulo. Numa sessão SQL bruta (MCP) auth.uid() é
-- null, então o DO block abaixo injeta request.jwt.claims.sub com um PROFILE
-- existente do DEV (FK criado_por). Se o DEV não tiver profile, crie um antes ou
-- ajuste o select.
--
-- Esperado: ativos_criados=2; WAP0001234 em_estoque sem colaborador; WAP0005678
-- em_uso com colaborador 'Fulano de Tal'; LOG com correcoes = as 2 ops abaixo; e a
-- chamada de 3 args (retrocompatibilidade, default '[]') com correcoes = [].
--
-- ---------- 1. unicidade da assinatura (o gotcha do overload) ----------
-- Esperado: EXATAMENTE 1 linha, pronargs = 4. Duas linhas = overload sobrando →
-- a chamada de 3 args fica ambígua e o import quebra.
--
-- select proname, pronargs from pg_proc where proname = 'importar_ativos_substituir';
--
-- ---------- 2. grants (o DROP os apagou; o bloco acima reaplicou) ----------
-- Esperado: {postgres=X/postgres,authenticated=X/postgres} — anon/public/
-- service_role SEM execute.
--
-- select proname, pronargs, proacl from pg_proc where proname = 'importar_ativos_substituir';
--
-- ---------- 3. coluna nova ----------
-- Esperado: correcoes | jsonb | NO | '[]'::jsonb
--
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'import_logs' and column_name = 'correcoes';
--
-- ---------- 4. smoke transacional (4 args + 3 args) ----------
-- begin;
--   do $smoke$
--   declare
--     v_prof   uuid;
--     v_filial smallint;
--     v_res    jsonb;
--     v_corr   jsonb := jsonb_build_array(
--       jsonb_build_object('op','substituir','campo','tipo','de','NOTBOOK','para','Notebook'),
--       jsonb_build_object('op','remover_linha','linha',7)
--     );
--   begin
--     select id into v_prof from public.profiles order by created_at limit 1;
--     if v_prof is null then
--       raise exception 'Smoke: nenhum profile no DEV — crie um operador antes.';
--     end if;
--     perform set_config('request.jwt.claims', json_build_object('sub', v_prof)::text, true);
--
--     insert into public.filiais (slug, nome, ativo)
--     values ('smoke-import-f7b', 'Smoke Import F7B', true)
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
--       jsonb_build_object('ativos',0,'movimentacoes',0,'anotacoes',0,'termos',0),  -- filial nova = tudo 0
--       v_corr                                                                       -- F7B: auditoria
--     );
--     raise notice 'RESULTADO (4 args): %', v_res;
--     raise notice 'LOG.correcoes: %', (
--       select correcoes from public.import_logs where id = (v_res->>'log_id')::uuid
--     );
--     raise notice 'ATIVOS: %', (
--       select jsonb_agg(jsonb_build_object(
--         'patrimonio', patrimonio, 'status', status,
--         'colaborador_atual', colaborador_atual, 'setor_atual', setor_atual))
--       from public.ativos where filial_id = v_filial
--     );
--
--     -- retrocompatibilidade: MESMA chamada com 3 args (default '[]') — o segundo
--     -- "substituir" na mesma filial revalida as contagens do 1º (2 ativos, 2 movs).
--     v_res := public.importar_ativos_substituir(
--       jsonb_build_object(
--         'filialId', v_filial, 'arquivoHash', 'cafed00d', 'totalLinhasDados', 1,
--         'ativos', jsonb_build_array(
--           jsonb_build_object(
--             'patrimonio','WAP0009999', 'patrimonioOriginal','9999', 'serviceTag', null,
--             'categoria','monitor', 'marca','LG', 'modelo','24MK430',
--             'fornecedor','WAP', 'memoria', null, 'armazenamento', null,
--             'processador', null, 'hostname', null, 'observacoes', null,
--             'dataEntrada','2026-07-02', 'estadoAlvo','em_estoque',
--             'colaborador', null, 'setor', null, 'chamado', null
--           )
--         )
--       ),
--       'backups-import/smoke/plano-smoke-2.json',
--       jsonb_build_object('ativos',2,'movimentacoes',3,'anotacoes',0,'termos',0)
--     );
--     raise notice 'RESULTADO (3 args): %', v_res;
--     raise notice 'LOG.correcoes (3 args → esperado []): %', (
--       select correcoes from public.import_logs where id = (v_res->>'log_id')::uuid
--     );
--   end
--   $smoke$;
-- rollback;
--
-- ---------- 5. p_correcoes inválido (esperado: raise pt-BR, nada aplicado) ----------
-- begin;
--   -- select public.importar_ativos_substituir('{}'::jsonb, 'x', null, '{"op":"x"}'::jsonb);
--   --   → ERRO: Correções do import inválidas: esperado um array JSON (recebido object).
-- rollback;
-- =====================================================================
