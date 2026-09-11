-- =============================================================================
-- 0140 — o "Substituir tudo" deixa de estourar por chave estrangeira (F56 · Frente F)
-- =============================================================================
-- O DEFEITO (fatos 27-29, medidos em produção 11/09/2026)
--
-- `import_apagar_acervo_filial` (vigente na 0131) apaga `movimentacoes`,
-- `anotacoes`, `termos_gerados` só-desta-filial e `ativos` — e SÓ ISSO. Há CINCO
-- caminhos de FK, lidos de `pg_constraint`, nenhum `ON DELETE CASCADE`, que ela
-- não tratava:
--
--   1. `pendencias_item.ativo_id → ativos`               NO ACTION, imediata, NOT NULL
--   2. `pendencias_item.movimentacao_id → movimentacoes` NO ACTION, DEFERRABLE
--      INITIALLY DEFERRED, NOT NULL
--   3. `lancamentos_item.movimentacao_id → movimentacoes` NO ACTION, imediata,
--      anulável (0116) — o item que ANDOU JUNTO com a movimentação
--   4. `lancamentos_item.pendencia_item_id → pendencias_item` NO ACTION, imediata,
--      anulável (0119) — o lançamento que RESOLVEU a pendência
--   5. `ativos.substitui_ativo_id → ativos` NO ACTION — um substituto que migrou
--      para OUTRA filial e aponta para um ativo do acervo que sai
--
-- Produção hoje, pelo critério da RPC (a filial ATUAL do ativo, nunca
-- `movimentacoes.filial_id`/`pendencias_item.filial_id`, que são snapshot da
-- ÉPOCA): Matriz — 16 pendências de item e 18 lançamentos presos a movimentação
-- do acervo; Linhares — 16 lançamentos; Eusébio — 1 pendência; Filial de Teste —
-- 12 lançamentos; CD Afonso Pena e Serra — zero. "Lançamento preso a pendência do
-- acervo" e "substituto de outra filial apontando para o acervo" são zero nas
-- seis filiais HOJE — mas o caminho existe estruturalmente
-- (`resolver_pendencias_item_com_lancamentos`, 0119/0126) e o conserto trata os
-- cinco caminhos mesmo com zero linhas hoje. O "Substituir tudo" estoura `23503`
-- em quatro das seis filiais de produção; e como `23503` NÃO está em
-- `RECUSAS_DA_RPC` (`src/lib/actions/importar.ts`), o backup FICA no bucket sem
-- trilha correta — mais um `backup_orfao` na 12ª checagem (fato 30, Decisão 10 —
-- consertada pela metade TypeScript desta mesma fase).
--
-- ⚠ CONTAR PELA FILIAL DA ÉPOCA DÁ NÚMERO DIFERENTE (e errado): a Matriz teria 17
-- pendências, não 16 — a 17ª é de um ativo que HOJE mora em Eusébio. Todo DELETE,
-- UPDATE, contagem e backup desta migration usa o critério da RPC (a filial ATUAL
-- do ativo, sempre `ativos.filial_id = p_filial` no momento da chamada) — nunca o
-- `filial_id` histórico gravado em `movimentacoes`/`pendencias_item`. Contar pela
-- época faria um import da Matriz apagar a pendência de um ativo que hoje é de
-- Eusébio, ou faria a revalidação TOCTOU comparar contra o número errado.
--
-- O QUE MUDA (recria por `create or replace`, MESMA assinatura, nas TRÊS funções)
--
--   (a) `import_apagar_acervo_filial(smallint)` — ganha, ANTES do que já apagava
--       e NESTA ORDEM, quatro passos novos (ver "A ORDEM", abaixo), e o jsonb de
--       retorno ganha três chaves pós-operação.
--   (b) `import_revalidar_contagens(jsonb, smallint)` — ganha QUATRO chaves novas
--       em `p_contagens`, comparadas contra o estado vivo pelo MESMO critério da
--       RPC; as quatro chaves antigas (`ativos`, `movimentacoes`, `anotacoes`,
--       `termos`) ficam exatamente como estão, nome e semântica.
--   (c) `importar_ativos_substituir(jsonb, text, jsonb, jsonb)` — corpo vigente
--       (0132) IDÊNTICO, exceto o `jsonb_build_object` do retorno, que ganha as
--       TRÊS chaves pós-operação lidas do retorno da auxiliar (a).
--
-- Nenhuma das cinco auxiliares restantes (`import_validar_plano`,
-- `import_criar_ativos`, `import_lancar_movimentacoes`, `import_conferir_resultado`,
-- `import_contar_conflitos`, `import_gravar_trilha`) muda — a orquestradora
-- continua chamando as oito pelo nome, e `import_apagar_acervo_filial` continua a
-- ÚNICA função da cadeia do import com `delete from public.ativos`
-- (`src/lib/validators/import-uma-porta.test.ts`).
--
-- A ORDEM DENTRO DA AUXILIAR, E O PORQUÊ DE CADA PASSO (FK imediata × adiada)
--
-- As duas FKs de `lancamentos_item` (caminhos 3 e 4) são IMEDIATAS — o Postgres as
-- confere ao FIM DE CADA COMANDO, não no commit. Um `DELETE` em `pendencias_item`
-- com uma linha ainda referenciada por `lancamentos_item.pendencia_item_id`
-- estoura NA HORA, dentro do próprio comando. Por isso:
--
--   1º desvincula (`pendencia_item_id = null`) os lançamentos que RESOLVERAM
--      pendências do acervo (caminho 4) — ANTES de apagar as pendências;
--   2º desvincula (`movimentacao_id = null`) os lançamentos presos a
--      movimentações do acervo (caminho 3) — independente do passo 1 (colunas
--      diferentes da mesma tabela; um lançamento nunca tem as duas preenchidas ao
--      mesmo tempo: `resolver_pendencias_item_com_lancamentos` nunca grava
--      `movimentacao_id`, comentário vivo em `src/lib/queries/itens.ts:791`) —
--      mas TEM de rodar antes do delete de `movimentacoes` (mesma FK imediata);
--   3º apaga as pendências de item do acervo (caminhos 1 e 2) — DEPOIS de (1),
--      porque só depois dele nenhum `lancamentos_item.pendencia_item_id` aponta
--      mais para elas; e ANTES do delete de `movimentacoes`, porque
--      `pendencias_item.movimentacao_id → movimentacoes` é DEFERRABLE INITIALLY
--      DEFERRED — em produção/ensaio isso não confere até o commit, mas no CI o
--      cenário novo de `import_substituir.sql` roda sob `set constraints all
--      immediate` (fato 35): lá essa FK vira IMEDIATA como as outras, e uma
--      pendência viva apontando para uma movimentação que o passo seguinte apaga
--      estouraria `23503` no MEIO do `delete from movimentacoes` se a ordem fosse
--      trocada;
--   4º anula o `substitui_ativo_id` dos ativos de OUTRA filial que apontam para o
--      acervo (caminho 5) — o mesmo precedente de `resetar_acervo`
--      (`0089_reset_backup_do_recorte.sql:202-204`), com o filtro
--      `filial_id <> p_filial` que isola exatamente os substitutos de fora (os
--      dois únicos pares que existem em produção hoje são Matriz→Matriz, dentro
--      do mesmo acervo, e por isso não entram nesta contagem nem neste UPDATE —
--      eles somem com o `delete from ativos` do passo 5 de qualquer jeito);
--   5º só então o que já apagava, NA MESMA ORDEM de hoje: `movimentacoes`,
--      `anotacoes`, `termos_gerados`, `ativos`.
--
-- ⚠ O `delete from public.movimentacoes` CONTINUA SENDO UM STATEMENT SÓ (não vira
-- um laço por ativo). `movimentacoes.estorno_de` é uma FK AUTO-REFERENTE (NO
-- ACTION, não-deferrable) que esta função não tratava antes e continua sem
-- tratar À PARTE — porque não precisa: para uma FK não-deferrable o Postgres
-- confere a restrição ao FIM DO COMANDO, não linha a linha, e um estorno e a
-- movimentação original do MESMO ativo são sempre apagados no MESMO `DELETE`
-- (`where ativo_id in (...)`) — o par some junto e a checagem de fim de comando
-- não vê violação. Fatiar esse `DELETE` num laço por ativo (como os passos 4a-4d
-- da orquestradora fazem para os INSERTs) quebraria QUALQUER ativo com estorno.
--
-- A REGRA "CHAVE NOVA AUSENTE VALE 0" (fato 33, Decisão 9 do PLAN-F56.md)
--
-- As quatro chaves NOVAS de `p_contagens` (`pendencias_item`,
-- `lancamentos_movimentacao`, `lancamentos_pendencia`, `ponteiros_substituto`)
-- usam `coalesce(…, 0)`, NUNCA `coalesce(…, -1)`. A diferença importa na janela
-- entre o apply desta migration e o deploy do código novo (ver "O DEPLOY FORA DE
-- ORDEM", abaixo): nessa janela o código VELHO manda `p_contagens` SEM as quatro
-- chaves. Com `-1` (o precedente de `resetar_acervo`/`resetar_dados_ficticios`,
-- `0083:196`/`0089:169`), TODO import nessa janela seria recusado — mesmo numa
-- filial sem NENHUMA pendência ou lançamento preso (CD Afonso Pena, Serra), que é
-- PIOR do que o `23503` cru de hoje. Com `0`, a comparação só recusa as filiais
-- que JÁ estouravam (as que têm pendência/lançamento vivo — Matriz, Linhares,
-- Eusébio, Filial de Teste), agora com MENSAGEM em vez de estouro cru, e as que
-- não têm o problema continuam passando como sempre passaram.
--
-- ⚠ ESTA É UMA DIVERGÊNCIA DECLARADA contra o precedente do reset (`-1`), não um
-- descuido: lá as CINCO chaves são obrigatórias DESDE SEMPRE (a função sempre
-- exigiu as cinco, não há "chave nova" na história dela); aqui, quatro chaves
-- NASCEM nesta migration, e código que já está no ar hoje simplesmente não as
-- conhece ainda.
--
-- O DEPLOY FORA DE ORDEM, NAS DUAS DIREÇÕES — É O CAMINHO B DO RUNBOOK
--
-- Esta migration contém `delete from public.ativos` (dentro do corpo de
-- `import_apagar_acervo_filial`) → CAMINHO B do `RUNBOOK-BANCO.md`: apply
-- humano-no-circuito, SQL de handoff em `scratchpad/`, verificação pós-apply no
-- rodapé. Isso separa no TEMPO o apply desta migration do deploy do código
-- TypeScript que a consome (a metade da Frente F em `src/lib/actions/importar.ts`
-- e `src/lib/queries/import-logs.ts`, entregue por outra frente desta mesma fase)
-- — e as DUAS ORDENS de deploy têm de ser seguras:
--
--   (a) RPC nova no ar, código VELHO ainda não implantado: o código velho manda
--       `p_contagens` só com as quatro chaves antigas. `import_revalidar_contagens`
--       lê as quatro novas ausentes → `coalesce(…,0)` → exige que a filial tenha
--       ZERO pendência/lançamento preso. Para CD/Serra isso passa igual a hoje.
--       Para as quatro filiais problemáticas, a RPC RECUSA com mensagem — antes
--       ela também recusava (estourando `23503` sem aviso nenhum no preview,
--       porque o código velho nunca soube pedir para desvincular); a diferença é
--       só a mensagem, nunca a segurança: nada é apagado errado num caminho nem
--       no outro. O retorno da auxiliar ganha três chaves que o código velho
--       (sem `.strict()` no schema Zod, precedente `conflitos_abertos` em
--       `src/lib/actions/importar.ts`) simplesmente ignora.
--   (b) código NOVO implantado, RPC ainda VELHA (só acontece se esta migration
--       ficar presa no classificador — fato 31, critério 28): o código novo manda
--       `p_contagens` com OITO chaves. A `import_revalidar_contagens` VELHA
--       (vigente na 0131) só lê as quatro que conhece via `jsonb->>'chave'` e
--       ignora, sem erro, as quatro a mais — comportamento padrão do operador
--       `->>` sobre uma chave desconhecida. A RPC velha continua vulnerável ao
--       `23503` cru nas quatro filiais problemáticas: é uma regressão de UX (o
--       preview do código novo pode prometer "N pendências serão desvinculadas"
--       e o apply ainda estoura), nunca de segurança. O critério 16 desta fase
--       cobra exatamente isto: o código convive com a RPC antiga.
--
-- CONFERIDO NA 0081 (guarda_acervo) E NOS TRIGGERS DE lancamentos_item/pendencias_item
--
--   · `lancamentos_item` tem `trg_valida_lancamento_item`, BEFORE INSERT SÓ
--     (0015:115-117) — os dois UPDATEs dos passos 1/2 NÃO o disparam.
--   · `lancamentos_item` tem `lancamentos_item_guarda_acervo` (0081), que recusa
--     UPDATE/DELETE FORA da janela `estoque.dev_destrutivo` — mas a orquestradora
--     já abre essa janela ANTES de chamar esta auxiliar (o mesmo desenho da 0131:
--     a auxiliar NÃO abre a própria janela), então os dois UPDATEs passam livres.
--   · `pendencias_item` está DE PROPÓSITO fora de `guarda_acervo` (uma das três
--     tabelas "FORA" do cabeçalho da 0081, ao lado de `anotacoes` e
--     `termos_gerados`) — o `DELETE` do passo 3 nunca precisou da janela, e
--     continua não precisando (rodar dentro dela não atrapalha).
--   · `ativos` tem `ativos_guarda_acervo` (0081), que recusa só DELETE fora da
--     janela — o UPDATE do passo 4 (`substitui_ativo_id = null`) NÃO é DELETE e
--     passaria mesmo fora da janela; fica dentro dela por simetria, não por
--     exigência.
--   · Nenhum trigger em `pendencias_item` reage a DELETE (o único trigger que
--     mexe nela a partir de fora é `aplicar_movimentacao`, BEFORE INSERT em
--     `movimentacoes` — outro caminho, não um trigger NELA).
--
-- ORDEM DE ROLLBACK (em prosa — o inverso do apply; ensaiada só no ensaio, num
-- `begin … rollback`, conferindo `pg_get_functiondef` e a existência das tabelas
-- antes e depois)
--
--   Reemitir, por `create or replace`, os corpos VIGENTES ANTERIORES a esta
--   migration — `import_apagar_acervo_filial(smallint)` e
--   `import_revalidar_contagens(jsonb, smallint)` da `0131_import_decomposto.sql`,
--   `importar_ativos_substituir(jsonb, text, jsonb, jsonb)` da
--   `0132_guardas_de_escopo.sql` —, cada uma com os MESMOS `revoke`/`grant` que já
--   estão nesses dois arquivos (as auxiliares fechadas nos quatro papéis; a
--   orquestradora com EXECUTE só para `authenticated`). Não toca dado nenhum: é
--   recriação pura de função — os moldes do `RUNBOOK-BANCO.md` § "Rollback". Os
--   backups `versao: 2` gravados enquanto a 0140 esteve no ar ficam intactos no
--   bucket e só voltam a ser restauráveis por inteiro com o `restaurar.mjs` desta
--   mesma versão (ele entende `versao: 2`; a versão anterior dele ignorava as
--   chaves novas em silêncio — ver o cabeçalho de `scripts/db/restaurar.mjs`).
--
-- ⚠ CAMINHO B DO RUNBOOK, por construção (contém `delete from public.ativos`,
-- dentro do corpo de `import_apagar_acervo_filial`) — apply humano-no-circuito, a
-- prova é o `prosrc` normalizado contra o corpo do arquivo
-- (`scripts/db/corpo-vigente.mjs`), NUNCA um `ilike`/grep cru (ele lê comentário
-- como código — ver a nota de `import-uma-porta.test.ts`/`codigoVivo()`).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- (a) import_apagar_acervo_filial — os quatro passos novos, antes do que já apagava
-- -----------------------------------------------------------------------------
create or replace function public.import_apagar_acervo_filial(
  p_filial smallint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movs_apagadas     int    := 0;
  v_anot_apagadas     int    := 0;
  v_termos_apagados   int    := 0;
  v_arquivos_termos   text[] := '{}';
  v_lanc_pend_desvinc int    := 0;
  v_lanc_mov_desvinc  int    := 0;
  v_pend_apagadas     int    := 0;
  v_subst_anulados    int    := 0;
begin
  -- ---------- 0140 (F56 · Frente F) — os cinco caminhos do fato 27 ----------
  -- Pelo critério da RPC (a filial ATUAL do ativo — `ativos.filial_id = p_filial`
  -- no momento da chamada), NA ORDEM que as FKs imediatas exigem. Ver o cabeçalho
  -- desta migration para o porquê de cada passo.

  -- (i) desvincula os lançamentos que RESOLVERAM pendências do acervo
  --     (caminho 4: lancamentos_item.pendencia_item_id → pendencias_item, imediata).
  update public.lancamentos_item li
     set pendencia_item_id = null
   where li.pendencia_item_id in (
     select pi.id from public.pendencias_item pi
      where pi.ativo_id in (select id from public.ativos where filial_id = p_filial)
   );
  get diagnostics v_lanc_pend_desvinc = row_count;

  -- (ii) desvincula os lançamentos presos a MOVIMENTAÇÕES do acervo
  --      (caminho 3: lancamentos_item.movimentacao_id → movimentacoes, imediata).
  update public.lancamentos_item li
     set movimentacao_id = null
   where li.movimentacao_id in (
     select m.id from public.movimentacoes m
      where m.ativo_id in (select id from public.ativos where filial_id = p_filial)
   );
  get diagnostics v_lanc_mov_desvinc = row_count;

  -- (iii) apaga as pendências de item do acervo (caminhos 1 e 2) — DEPOIS de (i),
  --       porque só depois dele nenhum lancamentos_item.pendencia_item_id aponta
  --       mais para elas; ANTES do delete de movimentacoes abaixo, porque no CI
  --       (set constraints all immediate, fato 35) a FK adiada
  --       pendencias_item.movimentacao_id vira imediata igual às outras.
  delete from public.pendencias_item pi
   where pi.ativo_id in (select id from public.ativos where filial_id = p_filial);
  get diagnostics v_pend_apagadas = row_count;

  -- (iv) anula o ponteiro de substituto que vem de OUTRA filial (caminho 5) — o
  --      mesmo precedente de resetar_acervo (0089:202-204). O ativo QUE APONTA
  --      não é apagado; só perde o ponteiro. filial_id <> p_filial isola os
  --      substitutos de fora (um par DENTRO do próprio acervo some junto com o
  --      delete from ativos do passo 5, de qualquer jeito).
  update public.ativos
     set substitui_ativo_id = null
   where substitui_ativo_id in (select id from public.ativos where filial_id = p_filial)
     and filial_id <> p_filial;
  get diagnostics v_subst_anulados = row_count;

  -- ---------- 3. DELETE ordenado (só desta filial) — inalterado desde a 0131 ----------
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
    'arquivos_termos',    to_jsonb(v_arquivos_termos),
    'pendencias_apagadas',       v_pend_apagadas,
    'lancamentos_desvinculados', v_lanc_pend_desvinc + v_lanc_mov_desvinc,
    'ponteiros_anulados',        v_subst_anulados
  );
end $$;

revoke all on function public.import_apagar_acervo_filial(smallint)
  from public, anon, authenticated, service_role;

comment on function public.import_apagar_acervo_filial(smallint) is
  'F51/F56 — A ÚNICA função da cadeia do import que apaga acervo. Desde a 0140 (Frente F), trata os cinco caminhos de FK do fato 27 ANTES do que já apagava: desvincula lancamentos_item preso a pendência do acervo, desvincula lancamentos_item preso a movimentação do acervo, apaga as pendências de item do acervo, anula substitui_ativo_id dos substitutos de OUTRA filial — e só então movimentações, anotações, termos só-desta-filial e os ativos, nesta ordem. NÃO abre a janela estoque.dev_destrutivo: quem abre e fecha é a orquestradora. Fechada nos quatro papéis.';


-- -----------------------------------------------------------------------------
-- (b) import_revalidar_contagens — as quatro chaves novas, mesmo critério da RPC
-- -----------------------------------------------------------------------------
create or replace function public.import_revalidar_contagens(
  p_contagens jsonb,
  p_filial    smallint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_esp_ativos    int;
  v_esp_movs      int;
  v_esp_anot      int;
  v_esp_termos    int;
  v_esp_pend      int;
  v_esp_lanc_mov  int;
  v_esp_lanc_pend int;
  v_esp_subst     int;
  v_conferidos    int;
  v_liv_movs      int;
  v_liv_anot      int;
  v_liv_termos    int;
  v_liv_pend      int;
  v_liv_lanc_mov  int;
  v_liv_lanc_pend int;
  v_liv_subst     int;
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

  -- 0140 (F56 · Frente F) — as QUATRO chaves novas: chave AUSENTE vale 0 e é
  -- conferida contra o vivo — NUNCA -1 (ver o cabeçalho desta migration: com -1,
  -- todo import na janela entre o apply e o deploy do código novo seria recusado,
  -- mesmo em filial sem pendência/lançamento preso nenhum).
  v_esp_pend      := coalesce((p_contagens->>'pendencias_item')::int, 0);
  v_esp_lanc_mov  := coalesce((p_contagens->>'lancamentos_movimentacao')::int, 0);
  v_esp_lanc_pend := coalesce((p_contagens->>'lancamentos_pendencia')::int, 0);
  v_esp_subst     := coalesce((p_contagens->>'ponteiros_substituto')::int, 0);

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

  -- 0140 — pelo MESMO critério das quatro de cima (a filial ATUAL do ativo,
  -- nunca filial_id histórico): as quatro contagens que o conserto da FK precisa
  -- revalidar, espelhando exatamente o que a auxiliar (a) vai desvincular/apagar/anular.
  select count(*) into v_liv_pend from public.pendencias_item pi
   where pi.ativo_id in (select id from public.ativos where filial_id = p_filial);
  select count(*) into v_liv_lanc_mov from public.lancamentos_item li
   where li.movimentacao_id in (
     select m.id from public.movimentacoes m
      where m.ativo_id in (select id from public.ativos where filial_id = p_filial)
   );
  select count(*) into v_liv_lanc_pend from public.lancamentos_item li
   where li.pendencia_item_id in (
     select pi.id from public.pendencias_item pi
      where pi.ativo_id in (select id from public.ativos where filial_id = p_filial)
   );
  select count(*) into v_liv_subst from public.ativos a
   where a.substitui_ativo_id in (select id from public.ativos where filial_id = p_filial)
     and a.filial_id <> p_filial;

  if v_conferidos <> v_esp_ativos
     or v_liv_movs <> v_esp_movs
     or v_liv_anot <> v_esp_anot
     or v_liv_termos <> v_esp_termos
     or v_liv_pend <> v_esp_pend
     or v_liv_lanc_mov <> v_esp_lanc_mov
     or v_liv_lanc_pend <> v_esp_lanc_pend
     or v_liv_subst <> v_esp_subst
  then
    raise exception 'O estado da filial mudou desde o preview/backup (ativos %/%, movs %/%, anotações %/%, termos %/%, pendências %/%, lançamentos×movimentação %/%, lançamentos×pendência %/%, substitutos %/%). Gere o preview novamente antes de aplicar.',
      v_conferidos, v_esp_ativos, v_liv_movs, v_esp_movs, v_liv_anot, v_esp_anot, v_liv_termos, v_esp_termos,
      v_liv_pend, v_esp_pend, v_liv_lanc_mov, v_esp_lanc_mov, v_liv_lanc_pend, v_esp_lanc_pend, v_liv_subst, v_esp_subst;
  end if;
end $$;

revoke all on function public.import_revalidar_contagens(jsonb, smallint)
  from public, anon, authenticated, service_role;

comment on function public.import_revalidar_contagens(jsonb, smallint) is
  'F51/F56 — fecha a janela TOCTOU do import: as contagens do preview têm de bater com o estado vivo da filial, senão o acervo seria apagado sobre uma foto velha. Desde a 0140 (Frente F), compara também as quatro chaves da FK (pendencias_item, lancamentos_movimentacao, lancamentos_pendencia, ponteiros_substituto) — ausente vale 0 e é conferida contra o vivo, nunca -1 (divergência declarada contra o precedente do reset). Recusa p_contagens nulo/inválido. NÃO é API: fechada nos quatro papéis.';


-- -----------------------------------------------------------------------------
-- (c) importar_ativos_substituir — corpo vigente da 0132 idêntico, retorno com
--     as três chaves pós-operação lidas do retorno da auxiliar (a)
-- -----------------------------------------------------------------------------
-- `create or replace` PURO — a assinatura continua byte a byte a mesma; o diff
-- contra a 0132 é EXCLUSIVAMENTE a leitura das três chaves novas do retorno de
-- import_apagar_acervo_filial e o jsonb_build_object final — nenhuma linha
-- removida, nenhuma reordenada.
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
  v_pend_apagadas    int     := 0;
  v_lanc_desvinc     int     := 0;
  v_subst_anulados   int     := 0;
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

  -- ---------- 1a-bis. F52: A FILIAL É SUA? ----------
  -- Em CONJUNÇÃO com o `e_admin()` do bloco 0b — nunca no lugar dele. As duas perguntas
  -- são diferentes: `e_admin()` pergunta "você tem patente?", esta pergunta "esta filial
  -- é sua?". Hoje `pode_escrever_filial` devolve `true` para todo `dev`/`admin` em
  -- QUALQUER filial (0064), e como o bloco 0b já exigiu nível administrador, esta condição
  -- é INERTE — nenhum import legítimo de hoje passa a ser recusado.
  --
  -- ⚠ NÃO "simplifique" isto por parecer redundante. Ela é a única das RPCs destrutivas
  -- que ficou de fora da varredura da 0064, recebe a filial do PAYLOAD e faz
  -- `delete from public.ativos where filial_id = v_filial` sem teto, dentro da janela que
  -- desarma a `guarda_acervo`. Quando o cargo deixar de valer em toda filial, é esta
  -- linha — e não o `e_admin()` — que impede o import de apagar o acervo do vizinho.
  --
  -- A POSIÇÃO importa: depois da resolução da filial (`v_filial` já é não-nulo e a filial
  -- já foi provada existente e ativa — `pode_escrever_filial(null)` devolveria `false`) e
  -- ANTES do advisory lock, para recusar sem tomar trava.
  if not public.pode_escrever_filial(v_filial) then
    raise exception 'Você não tem permissão de escrita na filial % — o import foi recusado.', v_filial
      using errcode = '42501';
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

  -- 0140 (F56 · Frente F) — as três contagens PÓS-operação que o backup versão 2
  -- e a tela do "o que foi apagado" passam a mostrar. `.default(0)` no Zod do
  -- lado TypeScript é quem protege o código velho que ainda não as lê.
  v_pend_apagadas  := coalesce((v_apagado->>'pendencias_apagadas')::int, 0);
  v_lanc_desvinc   := coalesce((v_apagado->>'lancamentos_desvinculados')::int, 0);
  v_subst_anulados := coalesce((v_apagado->>'ponteiros_anulados')::int, 0);

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
    'conflitos_abertos',        v_conflitos,
    'pendencias_apagadas',       v_pend_apagadas,
    'lancamentos_desvinculados', v_lanc_desvinc,
    'ponteiros_anulados',        v_subst_anulados
  );
end $$;


-- Grants reafirmados (o create or replace puro os preserva; o reforço é idempotente e barato).
revoke all on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) to authenticated;

comment on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) is
  'F21/F51/F52/F56 — a RPC do "Substituir tudo": orquestradora fina sobre oito auxiliares. Desde a 0140 (Frente F), o retorno ganha pendencias_apagadas/lancamentos_desvinculados/ponteiros_anulados, lidos do retorno de import_apagar_acervo_filial. EXECUTE só para authenticated.';


-- ---------- VERIFICAÇÃO PÓS-APPLY (RUNBOOK-BANCO.md §5) ----------
--   -- 1) as três funções ficaram com a assinatura certa e SEM overload:
--   select p.oid::regprocedure::text
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('importar_ativos_substituir','import_apagar_acervo_filial','import_revalidar_contagens');
--   -- esperado: EXATAMENTE 1 linha por nome
--
--   -- 2) os grants da orquestradora estão preservados:
--   select r.rolname, has_function_privilege(r.rolname,
--     'public.importar_ativos_substituir(jsonb,text,jsonb,jsonb)', 'execute')
--   from (values ('anon'),('authenticated'),('service_role')) r(rolname);
--   -- esperado: authenticated=true, anon=false, service_role=false
--
--   -- 3) as duas auxiliares recriadas continuam FECHADAS nos quatro papéis:
--   select f.assinatura, r.rolname, has_function_privilege(r.rolname, f.assinatura, 'execute')
--   from (values
--     ('public.import_apagar_acervo_filial(smallint)'),
--     ('public.import_revalidar_contagens(jsonb,smallint)')
--   ) f(assinatura)
--   cross join (values ('anon'),('authenticated'),('service_role')) r(rolname);
--   -- esperado: FALSE em todas as 6 linhas.
--
--   -- 4) nenhum resíduo de EXECUTE para PUBLIC nas duas (a lição da F50):
--   select p.proname, p.proacl
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('import_apagar_acervo_filial','import_revalidar_contagens');
--   -- esperado: proacl SEM entrada `=X/` (a que representa PUBLIC)
--
--   -- 5) o md5 do prosrc normalizado bate com o do arquivo — ver
--   --    docs/f56-evidencias/F1-diff-dos-corpos.txt (produzido por
--   --    scripts/db/corpo-vigente.mjs, o mesmo mecanismo de import-uma-porta.test.ts):
--   select p.proname, md5(regexp_replace(p.prosrc, '\s+', ' ', 'g'))
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('importar_ativos_substituir','import_apagar_acervo_filial','import_revalidar_contagens');
--
--   -- 6) contagens de acervo antes = depois do apply (create or replace não toca dado,
--   --    mas a prova barata de que ninguém confundiu isso com um DML):
--   select count(*) from public.ativos;
--   select count(*) from public.pendencias_item;
--   select count(*) from public.lancamentos_item where movimentacao_id is not null or pendencia_item_id is not null;
--
--   -- 7) recarregar o cache do PostgREST:
--   notify pgrst, 'reload schema';
