-- =============================================================================
-- 0131 — a decomposição da RPC de import (F51)
-- =============================================================================
-- POR QUE ELA EXISTE
--
-- `public.importar_ativos_substituir` tem 393 linhas de corpo vivo na `0094` e
-- ONZE cópias integrais na cadeia de migrations (`0032 0033 0034 0035 0036 0037
-- 0040 0048 0064 0080 0094`). Isso não é estética: é o MECANISMO CAUSAL da dívida
-- técnica X. O método de mudar a função sempre foi "copiar o corpo e editar o
-- trecho novo", e por isso um defeito conhecido desde 21/07/2026 (o item N,
-- `if p_contagens is not null`) sobreviveu a CINCO revisões — não por descuido de
-- revisor, mas porque o processo o recopiava. Uma guarda de quatro linhas custa
-- reemitir 393.
--
-- Esta migration troca a função monolítica por uma ORQUESTRADORA FINA sobre OITO
-- auxiliares nomeadas. A próxima mudança recria UMA delas, não as 393 linhas.
--
-- O QUE MUDA
--
--   · Nascem 8 funções `public.import_*`, todas `security definer`,
--     `set search_path = public` e FECHADAS (`revoke all … from public, anon,
--     authenticated, service_role`) — não são API, são o miolo de uma RPC só.
--   · O corpo de `importar_ativos_substituir` passa a ser o encadeamento delas.
--   · O RESÍDUO DO ITEM N sai do corpo novo: `if p_contagens is not null and
--     jsonb_typeof(p_contagens) = 'object' then` (`0094:200`) é SEMPRE verdadeiro
--     desde que o `raise` de `0094:197-199` virou obrigatório. As 11 cópias
--     históricas ficam como estão — migration aplicada não se edita, e desde a
--     F46 isso é defesa executável (`migrations.lock.json`).
--
-- O QUE **NÃO** MUDA — e esta lista é o contrato da fase
--
--   · A ASSINATURA da orquestradora, byte a byte: `(jsonb, text, jsonb, jsonb)`
--     `returns jsonb`, `language plpgsql`, `security definer`,
--     `set search_path = public`. Isso preserva `src/lib/actions/importar.ts:423`,
--     os grants e o cache do PostgREST — o `create or replace` é PURO, sem
--     overload ('function is not unique') e sem grant perdido.
--   · O RETORNO, byte a byte: as mesmas 8 chaves, na mesma ordem, com os mesmos
--     nomes. `rpcRetornoSchema` (`importar.ts:120`) roda um `safeParse` DEPOIS do
--     DELETE+INSERT já commitado: uma chave a menos não vira erro de validação,
--     vira "Import concluído, mas a resposta veio inesperada" com o acervo já
--     substituído. É o falso-erro pós-destrutivo que a `0094` descreve.
--   · Toda mensagem de exceção, todo `errcode`, toda ordem de recusa.
--   · A ORDEM FÍSICA DAS ESCRITAS (ver "a decisão do bloco 4", abaixo).
--
-- POR QUE A JANELA `estoque.dev_destrutivo` FICA NA FUNÇÃO DE TOPO
--
-- Existem hoje EXATAMENTE DUAS portas que abrem essa janela: as RPCs da Zona
-- destrutiva (F23) e esta. É o que a `0080` e a `0081` amarram — `guarda_acervo`
-- recusa UPDATE/DELETE em `movimentacoes`/`lancamentos_item` e DELETE em `ativos`
-- fora dela. Abrir a janela dentro de `import_apagar_acervo_filial` criaria uma
-- TERCEIRA porta e aumentaria a superfície que `dev_destrutivo.sql` e
-- `seguranca_catalogo.sql` precisam vigiar. A auxiliar só faz os DELETEs; quem
-- abre e fecha a janela é a orquestradora, à vista.
--
-- O `pg_advisory_xact_lock` segue a MESMA RÉGUA, e por isso subiu do meio do
-- bloco 1a para o topo: os dois são efeitos locais à transação que um leitor tem
-- de ver na função que orquestra. Serialização escondida dentro de um validador é
-- o tipo de fato que some na releitura seguinte. A ORDEM não muda — a
-- orquestradora resolve a filial (1a) e trava ANTES de chamar
-- `import_validar_plano`, exatamente como a `0094` fazia.
--
-- POR QUE A GUARDA DE CARGO FICA NA ORQUESTRADORA
--
-- `e_admin()` com `errcode = '42501'` é a AUTORIZAÇÃO de uma `SECURITY DEFINER`:
-- a função passa por fora de toda policy de RLS, então a autorização tem de ser
-- interna e tem de ser a PRIMEIRA coisa depois do contexto de operador. Movê-la
-- para dentro de uma auxiliar mudaria a ordem em que a recusa acontece.
--
-- A DECISÃO DO BLOCO 4 — por que a orquestradora mantém o LAÇO
--
-- Hoje 4a/4b/4c/4d rodam no MESMO `for` por ativo, e 4b/4c/4d dependem do
-- `v_ativo_id` gerado por 4a na mesma iteração. Duas passagens completas
-- (criar todos os ativos, depois lançar todas as movimentações) mudariam a ordem
-- física das escritas, e a ordem física IMPORTA — não pelo desempate de
-- `rel_estoque_asof` (medido: `movimentacoes.created_at` é `default now()`, a
-- hora da TRANSAÇÃO, idêntica para todas as linhas de um import; e `id` é
-- `gen_random_uuid()` — nenhuma das duas chaves carrega ordem de inserção), mas
-- pelo TRIGGER `trg_aplicar_movimentacao`, que deriva `ativos.status` linha a
-- linha. O 4d (sync de posse) roda DEPOIS do 4c de propósito: invertê-los deixaria
-- o trigger do ajuste pisar no colaborador do plano.
--
-- Então a orquestradora mantém o laço e chama as duas auxiliares POR ATIVO. A
-- equivalência é por CONSTRUÇÃO, e não por argumento. O custo é uma chamada de
-- função plpgsql a mais por ativo, numa operação que roda uma vez por filial na
-- janela de go-live e já faz milhares de statements DML.
--
-- ROLLBACK — a ordem é o INVERSO da de apply, e não é livre
--
--   1º) `create or replace public.importar_ativos_substituir(...)` com o corpo
--       MONOLÍTICO da `0094` (está no git, arquivo inteiro);
--   2º) SÓ ENTÃO `drop function` das 8 auxiliares.
--
-- O inverso derrubaria a orquestradora nova enquanto ela ainda estivesse no ar.
-- Não toca dado nenhum: é recriação de função, os quatro moldes do
-- `RUNBOOK-BANCO.md` § "Rollback".
--
--   drop function if exists public.import_gravar_trilha(jsonb, smallint, text, jsonb, uuid, integer, integer, integer, integer, integer);
--   drop function if exists public.import_contar_conflitos(smallint);
--   drop function if exists public.import_conferir_resultado(jsonb, smallint, integer, integer);
--   drop function if exists public.import_lancar_movimentacoes(uuid, jsonb, smallint, uuid, date, text);
--   drop function if exists public.import_criar_ativos(jsonb, smallint);
--   drop function if exists public.import_apagar_acervo_filial(smallint);
--   drop function if exists public.import_revalidar_contagens(jsonb, smallint);
--   drop function if exists public.import_validar_plano(jsonb, text, jsonb, smallint);
--
-- ⚠ CAMINHO **B** DO RUNBOOK, POR CONSTRUÇÃO. O classificador do modo automático
-- bloqueia DDL cujo corpo contenha `delete from public.ativos` — e esta migration
-- contém, em `import_apagar_acervo_filial`. O apply é humano-no-circuito, com o
-- SQL de handoff em `scratchpad/` e a verificação pós-apply do rodapé.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1/8 · import_validar_plano — blocos 1b, 1b-bis, 1c, 1d, 1e e 2 da 0094
-- -----------------------------------------------------------------------------
-- Tudo o que se recusa ANTES de qualquer escrita, e nada além disso. Devolve o
-- total de ativos do plano (o antigo `v_total_plano`), que a conferência do fim
-- compara contra o que foi criado.
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
begin
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
                    join public.ativos a on a.id = aid where a.filial_id = p_filial)
      and exists (select 1 from unnest(t.ativo_ids) aid
                    join public.ativos a on a.id = aid where a.filial_id <> p_filial)
  ) then
    raise exception 'Há termo(s) gerado(s) que misturam esta filial com outra — substituição bloqueada. Resolva os termos antes.';
  end if;

  return v_total_plano;
end $$;

revoke all on function public.import_validar_plano(jsonb, text, jsonb, smallint)
  from public, anon, authenticated, service_role;

comment on function public.import_validar_plano(jsonb, text, jsonb, smallint) is
  'F51 — tudo o que o import recusa ANTES de qualquer escrita (blocos 1b/1b-bis/1c/1d/1e/2 da 0094). Devolve o total de ativos do plano. NÃO é API: fechada nos quatro papéis, só a orquestradora a alcança.';


-- -----------------------------------------------------------------------------
-- 2/8 · import_revalidar_contagens — bloco 2b da 0094 (a janela TOCTOU)
-- -----------------------------------------------------------------------------
-- ⚠ O RESÍDUO DO ITEM N SAIU AQUI. A 0094 tinha, logo depois do `raise`
-- obrigatório, um `if p_contagens is not null and jsonb_typeof(p_contagens) =
-- 'object' then` envolvendo as 23 linhas seguintes — condição SEMPRE verdadeira
-- naquele ponto, porque quem chega ali já passou pela recusa. Era o rastro de
-- quando a revalidação era opcional (dívida técnica, item N). O corpo novo faz a
-- recusa e segue reto.
create or replace function public.import_revalidar_contagens(
  p_contagens jsonb,
  p_filial    smallint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_esp_ativos  int;
  v_esp_movs    int;
  v_esp_anot    int;
  v_esp_termos  int;
  v_conferidos  int;
  v_liv_movs    int;
  v_liv_anot    int;
  v_liv_termos  int;
begin
  -- ---------- 2b. revalidação do estado vivo (fecha a janela TOCTOU) ----------
  -- N (dívida técnica, 21/07/2026): a revalidação de contagens é OBRIGATÓRIA. Sem isto, um
  -- cliente que chamasse a RPC direto (PostgREST) com p_contagens=null PULAVA a guarda e podia
  -- apagar um acervo que mudou entre o backup e o delete (lost update). A tela SEMPRE passa as
  -- contagens do preview; um null aqui é chamada forjada → recusa antes de qualquer DELETE.
  if p_contagens is null or jsonb_typeof(p_contagens) <> 'object' then
    raise exception 'Revalidação de contagens obrigatória: gere o preview novamente antes de aplicar (p_contagens ausente ou inválido).';
  end if;

  v_esp_ativos := coalesce((p_contagens->>'ativos')::int, -1);
  v_esp_movs   := coalesce((p_contagens->>'movimentacoes')::int, -1);
  v_esp_anot   := coalesce((p_contagens->>'anotacoes')::int, -1);
  v_esp_termos := coalesce((p_contagens->>'termos')::int, -1);

  select count(*) into v_conferidos from public.ativos where filial_id = p_filial;
  select count(*) into v_liv_movs from public.movimentacoes
   where ativo_id in (select id from public.ativos where filial_id = p_filial);
  select count(*) into v_liv_anot from public.anotacoes
   where ativo_id in (select id from public.ativos where filial_id = p_filial);
  select count(*) into v_liv_termos from public.termos_gerados t
   where exists (select 1 from unnest(t.ativo_ids) aid
                   join public.ativos a on a.id = aid where a.filial_id = p_filial)
     and not exists (select 1 from unnest(t.ativo_ids) aid
                   join public.ativos a on a.id = aid where a.filial_id <> p_filial);

  if v_conferidos <> v_esp_ativos or v_liv_movs <> v_esp_movs
     or v_liv_anot <> v_esp_anot or v_liv_termos <> v_esp_termos then
    raise exception 'O estado da filial mudou desde o preview/backup (ativos %/%, movs %/%, anotações %/%, termos %/%). Gere o preview novamente antes de aplicar.',
      v_conferidos, v_esp_ativos, v_liv_movs, v_esp_movs, v_liv_anot, v_esp_anot, v_liv_termos, v_esp_termos;
  end if;
end $$;

revoke all on function public.import_revalidar_contagens(jsonb, smallint)
  from public, anon, authenticated, service_role;

comment on function public.import_revalidar_contagens(jsonb, smallint) is
  'F51 — fecha a janela TOCTOU do import (bloco 2b da 0094): as contagens do preview têm de bater com o estado vivo da filial, senão o acervo seria apagado sobre uma foto velha. Recusa p_contagens nulo/inválido. NÃO é API: fechada nos quatro papéis.';


-- -----------------------------------------------------------------------------
-- 3/8 · import_apagar_acervo_filial — bloco 3 da 0094
-- -----------------------------------------------------------------------------
-- ⚠ A ÚNICA FUNÇÃO DA CADEIA DO IMPORT QUE CONTÉM `delete from public.ativos`.
-- Isso é invariante conferida a cada `npm run test`, sem banco, por
-- `src/lib/validators/import-uma-porta.test.ts` — que também exige que a
-- orquestradora NÃO contenha a string e referencie cada auxiliar pelo nome.
--
-- ⚠ ELA NÃO ABRE A JANELA. `estoque.dev_destrutivo` é aberta e fechada pela
-- orquestradora, imediatamente em volta da chamada desta função. Ver o cabeçalho.
-- Chamá-la fora dessa janela faz o trigger `guarda_acervo` (0081) recusar — que é
-- o comportamento certo.
--
-- Devolve jsonb, e não parâmetros OUT, de propósito: `regprocedure` do Postgres
-- ignora OUT na identidade da função, mas o parser de assinatura do
-- `scripts/db/corpo-vigente.mjs` os conta. As duas ferramentas discordariam sobre
-- o nome desta função, e a trava e o injetor mirariam alvos diferentes.
create or replace function public.import_apagar_acervo_filial(
  p_filial smallint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movs_apagadas   int    := 0;
  v_anot_apagadas   int    := 0;
  v_termos_apagados int    := 0;
  v_arquivos_termos text[] := '{}';
begin
  -- ---------- 3. DELETE ordenado (só desta filial) ----------
  delete from public.movimentacoes
   where ativo_id in (select id from public.ativos where filial_id = p_filial);
  get diagnostics v_movs_apagadas = row_count;

  delete from public.anotacoes
   where ativo_id in (select id from public.ativos where filial_id = p_filial);
  get diagnostics v_anot_apagadas = row_count;

  with del as (
    delete from public.termos_gerados t
     where exists (select 1 from unnest(t.ativo_ids) aid
                     join public.ativos a on a.id = aid where a.filial_id = p_filial)
       and not exists (select 1 from unnest(t.ativo_ids) aid
                     join public.ativos a on a.id = aid where a.filial_id <> p_filial)
    returning t.arquivo_path
  )
  select coalesce(array_agg(arquivo_path), '{}'::text[]), count(*)::int
    into v_arquivos_termos, v_termos_apagados
    from del;

  delete from public.ativos where filial_id = p_filial;

  return jsonb_build_object(
    'movs_apagadas',      v_movs_apagadas,
    'anotacoes_apagadas', v_anot_apagadas,
    'termos_apagados',    v_termos_apagados,
    'arquivos_termos',    to_jsonb(v_arquivos_termos)
  );
end $$;

revoke all on function public.import_apagar_acervo_filial(smallint)
  from public, anon, authenticated, service_role;

comment on function public.import_apagar_acervo_filial(smallint) is
  'F51 — A ÚNICA função da cadeia do import que apaga acervo (bloco 3 da 0094): movimentações, anotações, termos só-desta-filial e os ativos, nesta ordem. NÃO abre a janela estoque.dev_destrutivo: quem abre e fecha é a orquestradora. Fechada nos quatro papéis.';


-- -----------------------------------------------------------------------------
-- 4/8 · import_criar_ativos — bloco 4a da 0094
-- -----------------------------------------------------------------------------
-- ⚠ CHAMADA UMA VEZ POR ATIVO, pelo laço da orquestradora. O nome no plural é o
-- da ficha da F51; ela NÃO recebe o plano inteiro, e isso é a Decisão 2 da fase —
-- ver o cabeçalho. Quem "plural"izar o corpo reintroduz a segunda passagem que
-- mudaria a ordem física das escritas.
create or replace function public.import_criar_ativos(
  p_elemento jsonb,
  p_filial   smallint
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ativo_id uuid;
begin
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
    p_elemento->>'patrimonio',
    nullif(p_elemento->>'patrimonioOriginal', ''),
    nullif(p_elemento->>'serviceTag', ''),
    (p_elemento->>'categoria')::public.categoria_ativo,
    nullif(p_elemento->>'marca', ''),
    nullif(p_elemento->>'modelo', ''),
    nullif(p_elemento->>'fornecedor', ''),
    nullif(p_elemento->>'memoria', ''),
    nullif(p_elemento->>'armazenamento', ''),
    nullif(p_elemento->>'processador', ''),
    nullif(p_elemento->>'hostname', ''),
    p_filial,
    'importacao',
    nullif(p_elemento->>'observacoes', ''),
    nullif(
      concat_ws('; ',
        case when (p_elemento->>'patrimonio') is null then 'sem patrimônio físico' end,
        case when nullif(p_elemento->>'serviceTag', '') is null then 'sem service tag' end
      ),
      ''
    )
  )
  returning id into v_ativo_id;

  return v_ativo_id;
end $$;

revoke all on function public.import_criar_ativos(jsonb, smallint)
  from public, anon, authenticated, service_role;

comment on function public.import_criar_ativos(jsonb, smallint) is
  'F51 — cria UM ativo a partir de UMA linha do plano (bloco 4a da 0094) e devolve o id. Chamada uma vez por ativo pelo laço da orquestradora: o plural é o nome da ficha, não a forma do parâmetro. Fechada nos quatro papéis.';


-- -----------------------------------------------------------------------------
-- 5/8 · import_lancar_movimentacoes — blocos 4b, 4c e 4d da 0094
-- -----------------------------------------------------------------------------
-- ⚠ CHAMADA UMA VEZ POR ATIVO, logo depois de `import_criar_ativos`, com o id
-- que ela devolveu. O 4d (sync de colaborador/setor) mora AQUI e não em
-- `import_criar_ativos` por um motivo de ORDEM, não de arrumação: ele tem de
-- rodar DEPOIS do ajuste do 4c, senão o trigger `trg_aplicar_movimentacao` do
-- ajuste pisa na posse que o plano mandou gravar.
create or replace function public.import_lancar_movimentacoes(
  p_ativo        uuid,
  p_elemento     jsonb,
  p_filial       smallint,
  p_uid          uuid,
  p_data_import  date,
  p_obs_marcador text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado public.status_ativo;
begin
  v_estado := (p_elemento->>'estadoAlvo')::public.status_ativo;

  -- 4b (REVERTIDO — F8): compra de abertura SEMPRE marcada (escondida do relatório),
  --   COM ou SEM dataEntrada. A data continua a REAL (dataEntrada) quando houver; só a
  --   observação volta a ser SEMPRE `p_obs_marcador` (`import startup dd/MM/yyyy`), no
  --   lugar do `case` condicional da F7H — equivale ao passo 4b da 0034. Motivo: a
  --   planilha de startup não distingue "compra nova" de "saldo de abertura" (toda
  --   linha tem data), então a F7H inundava as Entradas com o acervo pré-existente.
  --   Toda compra de abertura é BASELINE; compra "de verdade" é a lançada manualmente
  --   no sistema pós-go-live (sem marcador → aparece nas Entradas normalmente).
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
  values (
    p_ativo, 'compra',
    coalesce(nullif(p_elemento->>'dataEntrada', '')::date, p_data_import),
    p_filial, p_obs_marcador, p_uid
  );

  -- 4c. ajuste de reconciliação (só se o estado-alvo não é em_estoque). SEMPRE com
  --     o marcador: é reconciliação de estado, não entrada/saída real (e nem consta
  --     nas tabelas do relatório). data = dataAjuste (ou data do import se null).
  if v_estado <> 'em_estoque' then
    insert into public.movimentacoes (
      ativo_id, tipo, data, filial_id, colaborador, setor, chamado,
      observacao, status_resultante, criado_por
    ) values (
      p_ativo, 'ajuste',
      coalesce(nullif(p_elemento->>'dataAjuste', '')::date, p_data_import),
      p_filial,
      nullif(p_elemento->>'colaborador', ''), nullif(p_elemento->>'setor', ''), nullif(p_elemento->>'chamado', ''),
      p_obs_marcador, v_estado, p_uid
    );
  end if;

  -- 4d. sincroniza colaborador_atual/setor_atual quando o estado é de POSSE.
  if v_estado in ('em_uso', 'emprestado', 'reservado') then
    update public.ativos set
      colaborador_atual = nullif(p_elemento->>'colaborador', ''),
      setor_atual       = nullif(p_elemento->>'setor', ''),
      updated_at        = now()
    where id = p_ativo;
  end if;
end $$;

revoke all on function public.import_lancar_movimentacoes(uuid, jsonb, smallint, uuid, date, text)
  from public, anon, authenticated, service_role;

comment on function public.import_lancar_movimentacoes(uuid, jsonb, smallint, uuid, date, text) is
  'F51 — a compra de abertura, o ajuste de reconciliação e o sync de posse de UM ativo (blocos 4b/4c/4d da 0094). O 4d fica aqui porque tem de rodar DEPOIS do 4c. Chamada uma vez por ativo. Fechada nos quatro papéis.';


-- -----------------------------------------------------------------------------
-- 6/8 · import_conferir_resultado — blocos 5, 5b, 5c e 5d da 0094
-- -----------------------------------------------------------------------------
-- A oitava auxiliar que a ficha da F51 não previa: os quatro blocos de conferência
-- somam 78 linhas (0094:337-414) e ficariam sem dono na lista de sete. É o trecho
-- mais denso do corpo — um `except`/`union all` de 40 linhas — e exatamente o que
-- a F52 e a virada vão querer mudar sem reescrever tudo.
--
-- O argumento contra extrair era "verificação que sai da função que orquestra é
-- verificação que alguém esquece de chamar". A trava desta mesma fase responde:
-- ela afirma que a orquestradora referencia CADA auxiliar pelo nome, e uma
-- chamada esquecida derruba `npm run test` sem banco.
create or replace function public.import_conferir_resultado(
  p_plano   jsonb,
  p_filial  smallint,
  p_criados integer,
  p_total   integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conferidos int;
begin
  -- ---------- 5. conferência dentro da transação ----------
  if p_criados <> p_total then
    raise exception 'Divergência: % ativos criados para % no plano.', p_criados, p_total;
  end if;
  select count(*) into v_conferidos from public.ativos where filial_id = p_filial;
  if v_conferidos <> p_total then
    raise exception 'Divergência: % ativos na filial após import, % no plano.', v_conferidos, p_total;
  end if;

  -- 5b. estado de cada ativo = estadoAlvo (join null-safe, linhas com chave — F7E).
  if exists (
    select 1
    from jsonb_array_elements(p_plano->'ativos') x
    join public.ativos a
      on a.patrimonio is not distinct from (x->>'patrimonio')
     and coalesce(a.service_tag, '') = coalesce(x->>'serviceTag', '')
     and a.filial_id = p_filial
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
     and a.filial_id = p_filial
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
      where a.filial_id = p_filial
        and a.patrimonio is null and coalesce(a.service_tag, '') = ''
      group by 1, 2
    )
    union all
    (
      select a.status::text as estado,
             coalesce(a.colaborador_atual, '') as colaborador,
             count(*) as n
      from public.ativos a
      where a.filial_id = p_filial
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
end $$;

revoke all on function public.import_conferir_resultado(jsonb, smallint, integer, integer)
  from public, anon, authenticated, service_role;

comment on function public.import_conferir_resultado(jsonb, smallint, integer, integer) is
  'F51 — a conferência pós-insert do import, dentro da transação (blocos 5/5b/5c/5d da 0094): quantidade, estado por chave, posse por chave e a distribuição agregada das linhas sem chave natural. Fechada nos quatro papéis.';


-- -----------------------------------------------------------------------------
-- 7/8 · import_contar_conflitos — bloco 5e da 0094 (F24)
-- -----------------------------------------------------------------------------
create or replace function public.import_contar_conflitos(
  p_filial smallint
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conflitos int := 0;
begin
  -- ---------- 5e. (F24) conflitos abertos por este import ----------
  -- Conta pela MESMA fonte que a mesa de /pendencias lê (v_conflitos_filiais, 0092), para
  -- que o número do histórico e o número da tela não possam divergir. Roda DEPOIS dos
  -- inserts e DENTRO da transação: é o estado real pós-import, não uma previsão do preview.
  -- Um ativo desta filial entra aqui quando a identidade dele (patrimônio + service tag, ou
  -- a tag sozinha quando não há patrimônio) também existe em OUTRA filial. Desde a 0091 isso
  -- é possível — antes o índice global impedia, e o import inteiro era bloqueado (F7C).
  select count(*) into v_conflitos
    from public.v_conflitos_filiais c
   where c.filial_id = p_filial;

  return v_conflitos;
end $$;

revoke all on function public.import_contar_conflitos(smallint)
  from public, anon, authenticated, service_role;

comment on function public.import_contar_conflitos(smallint) is
  'F51 — quantos ativos desta filial ficaram em conflito entre filiais depois do import (bloco 5e da 0094, F24). Lê v_conflitos_filiais, a MESMA fonte da mesa de /pendencias. Fechada nos quatro papéis.';


-- -----------------------------------------------------------------------------
-- 8/8 · import_gravar_trilha — bloco 6 da 0094 (o insert em import_logs)
-- -----------------------------------------------------------------------------
create or replace function public.import_gravar_trilha(
  p_plano       jsonb,
  p_filial      smallint,
  p_backup_path text,
  p_correcoes   jsonb,
  p_uid         uuid,
  p_criados     integer,
  p_movs        integer,
  p_anotacoes   integer,
  p_termos      integer,
  p_conflitos   integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
begin
  -- ---------- 6. log ----------
  insert into public.import_logs (
    filial_id, modo, arquivo_hash, total_linhas,
    ativos_criados, movs_apagadas, anotacoes_apagadas, termos_apagados,
    backup_path, correcoes, criado_por, conflitos_abertos
  ) values (
    p_filial, 'substituir',
    coalesce(p_plano->>'arquivoHash', ''),
    coalesce((p_plano->>'totalLinhasDados')::int, 0),
    p_criados, p_movs, p_anotacoes, p_termos,
    p_backup_path, coalesce(p_correcoes, '[]'::jsonb), p_uid, p_conflitos
  )
  returning id into v_log_id;

  return v_log_id;
end $$;

revoke all on function public.import_gravar_trilha(jsonb, smallint, text, jsonb, uuid, integer, integer, integer, integer, integer)
  from public, anon, authenticated, service_role;

comment on function public.import_gravar_trilha(jsonb, smallint, text, jsonb, uuid, integer, integer, integer, integer, integer) is
  'F51 — grava a linha de import_logs e devolve o id (bloco 6 da 0094). Fechada nos quatro papéis.';


-- =============================================================================
-- A ORQUESTRADORA — assinatura e retorno BYTE A BYTE iguais aos da 0094
-- =============================================================================
-- `create or replace` PURO: mesma assinatura → nada de overload ('function is not
-- unique'), nada de grant perdido. O diff contra a 0094 é o corpo inteiro; a
-- ASSINATURA e o `jsonb_build_object` do retorno são idênticos, e é isso que
-- `supabase/tests/import_substituir.sql` e `seguranca_catalogo.sql` (asserção 1)
-- conferem.
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
  v_apagado          jsonb;
  v_ativos_criados   int     := 0;
  v_movs_apagadas    int     := 0;
  v_anot_apagadas    int     := 0;
  v_termos_apagados  int     := 0;
  v_arquivos_termos  text[]  := '{}';
  v_log_id           uuid;
  v_conflitos        int     := 0;
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
  --
  -- F51: ela CONTINUA AQUI, antes de qualquer auxiliar. Movê-la para dentro de uma
  -- delas mudaria a ordem em que a recusa acontece.
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

  -- F51: o advisory lock sobe para a orquestradora pela MESMA régua da janela
  -- destrutiva — efeito local à transação, declarado à vista na função que
  -- orquestra. A POSIÇÃO não muda: resolve a filial, trava, e só então valida.
  perform pg_advisory_xact_lock(hashtext('import_substituir'), v_filial::int);

  -- ---------- 1b→2. tudo o que se recusa antes de escrever ----------
  v_total_plano := public.import_validar_plano(p_plano, p_backup_path, p_correcoes, v_filial);

  -- ---------- 2b. a janela TOCTOU ----------
  perform public.import_revalidar_contagens(p_contagens, v_filial);

  -- ---------- 3. DELETE ordenado (só desta filial) ----------
  -- F23: ABRE a janela da guarda do acervo (0081) para os quatro DELETEs de
  -- `import_apagar_acervo_filial` — e só para eles. Sem esta linha, o trigger
  -- `guarda_acervo` recusaria o import inteiro.
  --
  -- F51: a janela fica AQUI, e não dentro da auxiliar. Existem exatamente DUAS
  -- portas que a abrem (a Zona destrutiva e o import); uma terceira aumentaria a
  -- superfície que `dev_destrutivo.sql` e `seguranca_catalogo.sql` vigiam.
  perform set_config('estoque.dev_destrutivo', 'on', true);
  v_apagado := public.import_apagar_acervo_filial(v_filial);
  -- F23: FECHA a janela imediatamente. `set_config(..., true)` é local à TRANSAÇÃO, não
  -- à chamada: sem este fecho, os INSERTs do passo 4 — e qualquer statement seguinte da
  -- mesma transação — correriam com a guarda desligada. Lição medida na F22 (0073).
  perform set_config('estoque.dev_destrutivo', 'off', true);

  v_movs_apagadas   := (v_apagado->>'movs_apagadas')::int;
  v_anot_apagadas   := (v_apagado->>'anotacoes_apagadas')::int;
  v_termos_apagados := (v_apagado->>'termos_apagados')::int;
  select coalesce(array_agg(t), '{}'::text[]) into v_arquivos_termos
    from jsonb_array_elements_text(v_apagado->'arquivos_termos') t;

  -- ---------- 4. INSERT por ativo do plano ----------
  -- F51 (Decisão 2): o LAÇO fica aqui e as duas auxiliares são chamadas POR ATIVO.
  -- Duas passagens completas mudariam a ordem física das escritas, e quem depende
  -- dela é o trigger `trg_aplicar_movimentacao`, que deriva o estado linha a linha.
  -- Assim a equivalência é por construção, não por argumento.
  for e in select jsonb_array_elements(p_plano->'ativos')
  loop
    v_ativo_id := public.import_criar_ativos(e, v_filial);
    perform public.import_lancar_movimentacoes(
      v_ativo_id, e, v_filial, v_uid, v_data_import, v_obs_marcador
    );
    v_ativos_criados := v_ativos_criados + 1;
  end loop;

  -- ---------- 5. conferência dentro da transação ----------
  perform public.import_conferir_resultado(p_plano, v_filial, v_ativos_criados, v_total_plano);

  -- ---------- 5e. (F24) conflitos abertos por este import ----------
  v_conflitos := public.import_contar_conflitos(v_filial);

  -- ---------- 6. log + retorno ----------
  v_log_id := public.import_gravar_trilha(
    p_plano, v_filial, p_backup_path, p_correcoes, v_uid,
    v_ativos_criados, v_movs_apagadas, v_anot_apagadas, v_termos_apagados, v_conflitos
  );

  return jsonb_build_object(
    'log_id',                   v_log_id,
    'filial_id',                v_filial,
    'ativos_criados',           v_ativos_criados,
    'movs_apagadas',            v_movs_apagadas,
    'anotacoes_apagadas',       v_anot_apagadas,
    'termos_apagados',          v_termos_apagados,
    'arquivos_termos_apagados', to_jsonb(v_arquivos_termos),
    'conflitos_abertos',        v_conflitos
  );
end $$;


-- Grants reafirmados (o create or replace puro os preserva; o reforço é idempotente e barato).
revoke all on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) to authenticated;


-- ---------- VERIFICAÇÃO PÓS-APPLY (RUNBOOK-BANCO.md §5) ----------
--   -- 1) a orquestradora ficou com a assinatura certa e SEM overload:
--   select p.oid::regprocedure::text
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'importar_ativos_substituir';
--   -- esperado: EXATAMENTE 1 linha, 4 args (jsonb, text, jsonb, jsonb)
--
--   -- 2) os grants da orquestradora estão preservados:
--   select r.rolname, has_function_privilege(r.rolname,
--     'public.importar_ativos_substituir(jsonb,text,jsonb,jsonb)', 'execute')
--   from (values ('anon'),('authenticated'),('service_role')) r(rolname);
--   -- esperado: authenticated=true, anon=false, service_role=false
--
--   -- 3) as 8 auxiliares nasceram FECHADAS nos quatro papéis:
--   select f.assinatura, r.rolname, has_function_privilege(r.rolname, f.assinatura, 'execute')
--   from (values
--     ('public.import_validar_plano(jsonb,text,jsonb,smallint)'),
--     ('public.import_revalidar_contagens(jsonb,smallint)'),
--     ('public.import_apagar_acervo_filial(smallint)'),
--     ('public.import_criar_ativos(jsonb,smallint)'),
--     ('public.import_lancar_movimentacoes(uuid,jsonb,smallint,uuid,date,text)'),
--     ('public.import_conferir_resultado(jsonb,smallint,integer,integer)'),
--     ('public.import_contar_conflitos(smallint)'),
--     ('public.import_gravar_trilha(jsonb,smallint,text,jsonb,uuid,integer,integer,integer,integer,integer)')
--   ) f(assinatura)
--   cross join (values ('anon'),('authenticated'),('service_role')) r(rolname);
--   -- esperado: FALSE em todas as 24 linhas.
--   -- (`public` não é role: para ele a prova é `acl` nulo ou sem `=X/` — a 4 abaixo.)
--
--   -- 4) nenhum resíduo de EXECUTE para PUBLIC nas 8 (a lição da F50: revogar de
--   --    `anon` sem revogar de `public` é no-op silencioso):
--   select p.proname, p.proacl
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname like 'import\_%';
--   -- esperado: proacl SEM entrada `=X/` (a que representa PUBLIC)
--
--   -- 5) o resíduo do item N sumiu do corpo NOVO:
--   select pg_get_functiondef(p.oid) like '%p_contagens is not null and jsonb_typeof%'
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'importar_ativos_substituir';
--   -- esperado: false
--
--   -- 6) recarregar o cache do PostgREST (a assinatura não mudou, mas as 8 funções
--   --    novas são objetos novos no schema):
--   notify pgrst, 'reload schema';
