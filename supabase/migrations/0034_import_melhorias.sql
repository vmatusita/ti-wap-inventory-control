-- Migration 0034 — import de startup: patrimônio opcional (pendência) + datas do
-- ajuste dd/MMM (OS-F7E / W2).
--
-- Três frentes ADITIVAS (nada é apagado):
--   1. `ativos.patrimonio` deixa de ser NOT NULL — ativo real sem plaqueta importa
--      com patrimônio NULO e uma pendência 'sem patrimônio físico' (mesma fila do
--      go-live F4). Bloquear obrigava a inventar valor.
--   2. Índice único PARCIAL novo: sem patrimônio, a service tag vira a identidade
--      (duas iguais colidem); sem patrimônio E sem tag as linhas ficam livres.
--   3. RPC `importar_ativos_substituir` — `create or replace` PURO (mesma assinatura
--      de 4 args da 0033; NÃO há mudança de parâmetros, então NÃO há o gotcha de
--      overload da 0033 e NÃO se faz drop). Corpo = o da 0033 com EXATAMENTE 5
--      emendas (marcadas "F7E" abaixo). Qualquer outra diferença é BUG.
--
-- ---------------------------------------------------------------------------
-- DIFF CONCEITUAL 0033 → 0034 (o corpo da RPC muda SÓ nestes pontos)
-- ---------------------------------------------------------------------------
--   (1d) regex de patrimônio só quando o valor é NÃO-nulo. json null → SQL NULL →
--        passa (sem patrimônio). String vazia '' NÃO é null → cai na regex e é
--        rejeitada (só null significa "sem patrimônio"; '' é lixo).
--   (1e) unicidade no plano espelha os DOIS índices: com patrimônio pelo par
--        (patrimonio, coalesce(tag,'')); sem patrimônio e com tag pela tag; sem
--        patrimônio e sem tag livres (sem identidade → sem dedupe).
--   (4a) insert do ativo: `patrimonio` pode ser null; quando null, grava
--        `pendencia = 'sem patrimônio físico'`.
--   (4c) data do ajuste = `coalesce(nullif(e->>'dataAjuste','')::date, v_data_import)`.
--   (5b/5c) conferência pós-insert null-safe (`is not distinct from` no patrimônio)
--        para quem tem patrimônio OU tag; para as linhas SEM AMBOS (sem chave
--        natural) o join linha-a-linha é impossível/ambíguo → conferência AGREGADA
--        por (estado × colaborador). Divergiu → rollback, como hoje.
--
-- Nenhuma salvaguarda da F7/F7B é tocada: backup obrigatório, confirmação pelo nome
-- da filial, revalidação TOCTOU por contagens sob advisory lock, tudo-ou-nada, RLS,
-- auditoria de correções — tudo idêntico à 0033.
--
-- Aditiva. Aplicar no projeto de DESENVOLVIMENTO (o orquestrador aplica em produção).


-- =====================================================================
-- 1. SCHEMA — patrimônio opcional + índice parcial
-- =====================================================================

-- Ativo real sem plaqueta (o CSV traz "", "n/a", "SEM PATRIMONIO"…): importa com
-- patrimônio NULO. A régua de bloqueio segue firme para o resto (só-números etc.
-- continuam bloqueantes na UI — aqui só destravamos o NULL legítimo).
alter table public.ativos alter column patrimonio drop not null;

-- Por que um índice PARCIAL novo, e não confiar no composto existente:
--   O único índice de identidade hoje é
--     ativos_patrimonio_service_tag_uidx  ON (patrimonio, coalesce(service_tag,''))
--   Num btree, NULL é DISTINTO de qualquer outro NULL — logo duas linhas
--   (patrimonio=NULL, service_tag='ST-X') NÃO colidem nesse índice (o par com
--   patrimonio NULL nunca é "igual" a outro par com patrimonio NULL). Ou seja: sem
--   patrimônio, o composto não garante unicidade alguma. Sem uma trava, dois ativos
--   sem plaqueta com a MESMA service tag entrariam como duplicatas silenciosas.
--
--   O parcial abaixo cobre exatamente esse buraco: quando não há patrimônio, a
--   service tag passa a ser a identidade e não pode repetir. Quando não há patrimônio
--   E não há tag, a linha fica FORA do índice (predicado WHERE falso) — sem
--   identidade não há como deduplicar, então essas linhas são livres (espelha a
--   decisão do motor: nulo-sem-tag = sem dedupe).
--
-- `drop index if exists` antes do create: torna a migration re-executável durante a
-- iteração no DEV (idempotente; seguro também em produção — o índice ainda não existe
-- em lugar nenhum, então o drop é no-op na 1ª aplicação).
drop index if exists public.ativos_service_tag_sem_patrimonio_uidx;
create unique index ativos_service_tag_sem_patrimonio_uidx
  on public.ativos ((coalesce(service_tag, '')))
  where patrimonio is null and coalesce(service_tag, '') <> '';

comment on index public.ativos_service_tag_sem_patrimonio_uidx is
  'F7E: sem patrimônio, a service tag é a identidade (duas iguais colidem). Cobre o buraco do índice composto (patrimonio, coalesce(service_tag,'''')), onde NULL é distinto no btree. Nulo-sem-tag fica fora do parcial (livre, sem dedupe).';


-- =====================================================================
-- 2. RPC importar_ativos_substituir — create or replace PURO (4 args, sem drop)
-- =====================================================================
-- Assinatura IDÊNTICA à da 0033 (jsonb, text, jsonb, jsonb). Como NÃO há mudança de
-- parâmetros, o `create or replace` SUBSTITUI a função no lugar: pg_proc continua com
-- 1 linha (sem overload) e os GRANTs sobrevivem (privilégio segue a identidade, que
-- não mudou). Ainda assim reafirmamos os grants no fim — defesa em profundidade,
-- idempotente. NÃO repetir o drop da 0033: lá a assinatura mudou (3→4 args) e o drop
-- era obrigatório para não deixar overload; aqui seria só ruído perigoso.
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

  -- ---------- 1b-bis. correções (F7B — auditoria) ----------
  -- p_correcoes é AUDITORIA, não instrução: a RPC não as aplica (o plano já chega
  -- corrigido do preview, e é revalidado abaixo do mesmo jeito de sempre). Só
  -- exigimos que seja um array json. NULL é tolerado (vira '[]' no insert).
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
    -- F7E — EMENDA (1d): regex SÓ quando o patrimônio é NÃO-nulo.
    --   `e->>'patrimonio'` de um json null (ou chave ausente) é SQL NULL → o `is not
    --   null` é falso → pula a regex → passa (sem patrimônio, importa com pendência).
    --   Uma STRING VAZIA '' NÃO é null → entra na regex, falha e é rejeitada: só o
    --   null significa "sem patrimônio físico"; '' é lixo que não deve virar ativo.
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

  -- ---------- 1e. unicidade no plano — espelha os DOIS índices ----------
  -- F7E — EMENDA (1e): a 0033 agrupava por (patrimonio, coalesce(tag,'')) com um
  -- único teste. Isso quebra com patrimônio null: `x->>'patrimonio'` NULL agruparia
  -- TODAS as linhas sem patrimônio num só grupo (GROUP BY trata NULLs como iguais),
  -- barrando indevidamente os nulos-sem-tag (que devem ser livres). Então dividimos
  -- em três casos, espelhando exatamente o índice composto + o índice parcial novo:

  -- (i) COM patrimônio: o par (patrimonio, coalesce(tag,'')) não pode repetir
  --     (espelha ativos_patrimonio_service_tag_uidx — 0003).
  if exists (
    select 1
    from jsonb_array_elements(p_plano->'ativos') x
    where (x->>'patrimonio') is not null
    group by (x->>'patrimonio'), coalesce(x->>'serviceTag','')
    having count(*) > 1
  ) then
    raise exception 'Plano tem par (patrimônio, service tag) duplicado — cada ativo com patrimônio deve ser único.';
  end if;

  -- (ii) SEM patrimônio, COM tag: a service tag é a identidade e não pode repetir
  --      (espelha o índice parcial ativos_service_tag_sem_patrimonio_uidx — 0034).
  if exists (
    select 1
    from jsonb_array_elements(p_plano->'ativos') x
    where (x->>'patrimonio') is null and coalesce(x->>'serviceTag','') <> ''
    group by coalesce(x->>'serviceTag','')
    having count(*) > 1
  ) then
    raise exception 'Plano tem service tag repetida entre ativos sem patrimônio — a tag é a identidade quando não há patrimônio.';
  end if;

  -- (iii) SEM patrimônio e SEM tag: livres — sem identidade não há dedupe possível.
  --       (nada a checar; espelha o predicado do índice parcial que as deixa de fora.)

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
  -- = contagens do acervo exportado). Divergiu → ABORTA: nada é apagado, o backup
  -- segue fiel. Tolerante a p_contagens ausente (smoke/manual).
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
    --
    -- F7E — EMENDA (4a): `patrimonio` pode ser NULL. Usamos o valor json DIRETO
    --   (`e->>'patrimonio'`, sem nullif) — quando o plano traz json null vira SQL
    --   NULL; quando traz um patrimônio válido (já checado em 1d) vira o texto
    --   canônico. Quando o patrimônio é null, gravamos a pendência do go-live:
    --   'sem patrimônio físico'. Esse literal DEVE ficar em sincronia com
    --   PENDENCIA_SEM_PATRIMONIO em src/lib/dominio.ts (criado pelo W4) — mesmo texto
    --   do go-live F4, para a fila de pendências ser UMA só (precedente
    --   OBS_IMPORT_STARTUP; não há como importar TS no SQL).
    insert into public.ativos (
      patrimonio, patrimonio_original, service_tag, categoria,
      marca, modelo, fornecedor, memoria, armazenamento, processador, hostname,
      filial_id, origem, observacoes, pendencia
    ) values (
      e->>'patrimonio',                                   -- F7E: pode ser null (json null direto)
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
      case when (e->>'patrimonio') is null
           then 'sem patrimônio físico'                   -- F7E: sincronia com PENDENCIA_SEM_PATRIMONIO (dominio.ts)
           else null end
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
    --
    -- F7E — EMENDA (4c): a data do ajuste passa a ser `dataAjuste` (entrega dd/MMM
    --   resolvida ?? dataEntrada, calculado pelo motor W1) e cai para a data do
    --   import só quando o plano não traz nenhuma. Antes era sempre v_data_import.
    if v_estado <> 'em_estoque' then
      insert into public.movimentacoes (
        ativo_id, tipo, data, filial_id, colaborador, setor, chamado,
        observacao, status_resultante, criado_por
      ) values (
        v_ativo_id, 'ajuste',
        coalesce(nullif(e->>'dataAjuste', '')::date, v_data_import),   -- F7E: data do ajuste
        v_filial,
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

  -- 5b. estado de cada ativo = estadoAlvo.
  -- F7E — EMENDA (5b): join null-safe. Antes o join era `a.patrimonio = x->>'patrimonio'`,
  --   que com patrimônio NULL nunca casa (`= null` é sempre desconhecido) → os ativos
  --   sem patrimônio escapavam SILENCIOSAMENTE da conferência. Agora usamos
  --   `is not distinct from` no patrimônio, restringindo o join às linhas que TÊM
  --   chave natural (patrimônio OU tag). As linhas sem AMBOS são conferidas no bloco
  --   agregado 5d (o join linha-a-linha delas seria ambíguo).
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

  -- 5c. posse: ativos em em_uso/emprestado/reservado têm colaborador_atual = o do
  --     plano (garante que o UPDATE 4d valeu). Mesmo join null-safe do 5b, restrito
  --     às linhas com chave natural.
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

  -- 5d. conferência AGREGADA das linhas SEM chave natural (patrimônio null E sem tag).
  -- F7E — EMENDA (5b/5c, parte 2): essas linhas não têm identidade, então não dá para
  --   casar plano×banco linha a linha (duas quaisquer seriam intercambiáveis). Conferimos
  --   por CONTAGEM por (estado × colaborador). Como o "substituir" apagou e recriou TODO
  --   o acervo da filial, os únicos ativos sem-chave do banco são os recém-criados deste
  --   plano — então a igualdade das duas distribuições prova que cada linha sem-chave
  --   virou o ativo certo (estado + posse). O colaborador é normalizado a '' fora dos
  --   estados de posse, espelhando 4d/5c (fora de posse, colaborador_atual não é sincronizado).
  --   Diferença em qualquer direção (simétrica via EXCEPT nos dois sentidos) → rollback.
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
  -- `correcoes` (F7B): auditoria. coalesce p/ '[]' porque a coluna é not null e
  -- p_correcoes pode chegar null (chamada manual/smoke).
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
-- revogamos desses papéis ALÉM de public (advisor SECURITY DEFINER). Como esta
-- migration é `create or replace` PURO (sem drop), os grants da 0033 sobrevivem;
-- reafirmamos por defesa em profundidade — idempotente e barato.
revoke all on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) to authenticated;


-- =====================================================================
-- SMOKE (COMENTADO) — para o ORQUESTRADOR rodar no DEV via MCP.
-- Plano fictício de 4 ativos numa filial descartável 'smoke-import-f7e', tudo dentro
-- de begin;…;rollback; — não persiste nada. Dados 100% fictícios (WAP…/"Fulano") —
-- CLAUDE.md. Cobre as 5 emendas F7E:
--   #1 WAP0001234       — normal, com patrimônio, em_estoque.
--   #2 (null, ST-NULO)  — sem patrimônio com tag, em_estoque → pendencia 'sem patrimônio
--                         físico' + aparece em v_pendencias com o literal.
--   #3 (null, sem tag)  — sem patrimônio E sem tag, em_uso 'Fulano de Tal' → conferência
--                         AGREGADA (5d); ajuste datado pela data do import.
--   #4 WAP0007777       — com patrimônio, em_uso 'Beltrano de Tal', dataAjuste 2026-05-15
--                         → o ajuste é datado por dataAjuste (não pela data do import).
--
-- Nota: a RPC exige auth.uid() não-nulo. Numa sessão SQL bruta (MCP) auth.uid() é
-- null, então o DO block injeta request.jwt.claims.sub com um PROFILE do DEV.
--
-- Esperado: ativos_criados=4; #2 com pendencia 'sem patrimônio físico'; ajuste de #4
-- datado 2026-05-15; v_pendencias listando #2 com o literal; e (2º bloco) DUAS linhas
-- sem patrimônio com a MESMA tag disparam o índice parcial (unique violation).
--
-- ---------- Bloco A: smoke transacional (4 ativos) ----------
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
--     values ('smoke-import-f7e', 'Smoke Import F7E', true)
--     returning id into v_filial;
--
--     v_res := public.importar_ativos_substituir(
--       jsonb_build_object(
--         'filialId',         v_filial,
--         'arquivoHash',      'deadbeefcafe',
--         'totalLinhasDados', 4,
--         'ativos', jsonb_build_array(
--           jsonb_build_object(  -- #1 normal
--             'patrimonio','WAP0001234', 'patrimonioOriginal','1234', 'serviceTag', null,
--             'categoria','notebook', 'marca','Dell', 'modelo','Latitude 5490',
--             'fornecedor','WAP', 'memoria','16GB', 'armazenamento','512GB SSD',
--             'processador','i5-8350U', 'hostname','NB-1234', 'observacoes', null,
--             'dataEntrada','2026-07-01', 'dataAjuste', null, 'estadoAlvo','em_estoque',
--             'colaborador', null, 'setor', null, 'chamado', null
--           ),
--           jsonb_build_object(  -- #2 sem patrimônio COM tag → pendência
--             'patrimonio', null, 'patrimonioOriginal','SEM PATRIMONIO', 'serviceTag','ST-NULO-1',
--             'categoria','celular', 'marca','Samsung', 'modelo','Galaxy A54',
--             'fornecedor','WAP', 'memoria', null, 'armazenamento', null,
--             'processador', null, 'hostname','CEL-SEMPAT', 'observacoes', null,
--             'dataEntrada', null, 'dataAjuste', null, 'estadoAlvo','em_estoque',
--             'colaborador', null, 'setor', null, 'chamado', null
--           ),
--           jsonb_build_object(  -- #3 sem patrimônio SEM tag → agregada (5d), em_uso
--             'patrimonio', null, 'patrimonioOriginal','n/a', 'serviceTag', null,
--             'categoria','monitor', 'marca','LG', 'modelo','24MK430',
--             'fornecedor','WAP', 'memoria', null, 'armazenamento', null,
--             'processador', null, 'hostname', null, 'observacoes', null,
--             'dataEntrada', null, 'dataAjuste', null, 'estadoAlvo','em_uso',
--             'colaborador','Fulano de Tal', 'setor','TI', 'chamado','CH-003'
--           ),
--           jsonb_build_object(  -- #4 com patrimônio, dataAjuste (entrega resolvida)
--             'patrimonio','WAP0007777', 'patrimonioOriginal','7777', 'serviceTag', null,
--             'categoria','desktop', 'marca','HP', 'modelo','ProDesk 400',
--             'fornecedor','WAP', 'memoria', null, 'armazenamento', null,
--             'processador', null, 'hostname','PC-7777', 'observacoes', null,
--             'dataEntrada','2026-05-10', 'dataAjuste','2026-05-15', 'estadoAlvo','em_uso',
--             'colaborador','Beltrano de Tal', 'setor','Compras', 'chamado','CH-004'
--           )
--         )
--       ),
--       'backups-import/smoke/plano-smoke-f7e.json',
--       jsonb_build_object('ativos',0,'movimentacoes',0,'anotacoes',0,'termos',0)  -- filial nova = tudo 0
--     );
--     raise notice 'RESULTADO: %', v_res;
--     raise notice 'ATIVOS: %', (
--       select jsonb_agg(jsonb_build_object(
--         'patrimonio', patrimonio, 'service_tag', service_tag, 'status', status,
--         'pendencia', pendencia, 'colaborador_atual', colaborador_atual))
--       from public.ativos where filial_id = v_filial
--     );
--     raise notice 'AJUSTES (data por patrimônio): %', (
--       select jsonb_agg(jsonb_build_object(
--         'patrimonio', a.patrimonio, 'tipo', m.tipo, 'data', m.data,
--         'status_resultante', m.status_resultante))
--       from public.movimentacoes m join public.ativos a on a.id = m.ativo_id
--       where a.filial_id = v_filial and m.tipo = 'ajuste'
--     );
--     raise notice 'V_PENDENCIAS (deve listar #2 com literal): %', (
--       select jsonb_agg(jsonb_build_object(
--         'patrimonio', patrimonio, 'status', status, 'pendencia', pendencia))
--       from public.v_pendencias where filial = 'smoke-import-f7e'
--     );
--   end
--   $smoke$;
-- rollback;
--
-- ---------- Bloco B: índice parcial — 2 nulos com a MESMA tag colidem ----------
-- Prova o índice DIRETO (inserts crus), sem passar pela RPC. Dentro da RPC a guarda
-- 1e (ii) já barra antes; o índice é a rede final no banco. Esperado: o 2º insert
-- levanta "duplicate key value violates unique constraint
-- ativos_service_tag_sem_patrimonio_uidx".
-- begin;
--   do $idx$
--   declare v_filial smallint;
--   begin
--     insert into public.filiais (slug, nome, ativo)
--     values ('smoke-idx-f7e', 'Smoke Idx F7E', true) returning id into v_filial;
--     insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
--     values (null, 'ST-DUP', 'notebook', v_filial, 'importacao');
--     insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
--     values (null, 'ST-DUP', 'celular', v_filial, 'importacao');  -- deve VIOLAR o parcial
--     -- prova adicional: 2 nulos SEM tag NÃO colidem (predicado do parcial os exclui)
--     insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
--     values (null, null, 'monitor', v_filial, 'importacao');
--     insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
--     values (null, null, 'monitor', v_filial, 'importacao');       -- OK, livres
--   end
--   $idx$;
-- rollback;
-- =====================================================================
