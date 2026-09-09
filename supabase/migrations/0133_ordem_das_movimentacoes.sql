-- Migration 0133 — F53: `movimentacoes.ordem`, a ordem TOTAL do acervo de movimentações.
--
-- =============================================================================
-- O PROBLEMA QUE ESTA MIGRATION RESOLVE (medido em 09/09/2026, produção e ensaio)
-- =============================================================================
-- Três lugares do sistema respondem "qual é a última movimentação deste ativo?", e todos os
-- três terminam o desempate em `movimentacoes.id` — que é `gen_random_uuid()` (0003:71).
-- `id` NUNCA nasceu para ordenar: é identidade e âncora de `estorno_de`. Quando duas
-- movimentações do mesmo ativo compartilham `(data, created_at)`, quem decide é um SORTEIO.
--
-- E o empate não é raro — é ROTINA, por construção:
--   · `now()` é constante DENTRO da transação, então toda RPC que grava mais de uma
--     movimentação de uma vez (0117, 0123, e o import de startup) nasce empatada;
--   · o import insere a `compra` de abertura e o `ajuste` de reconciliação na MESMA
--     transação — 1270 pares medidos em produção, com `(data, created_at)` idênticos.
--
-- Isso já custou DUAS correções em produção:
--   · a `0054` (24/07/2026) — `rel_estoque_asof` divergia de `ativos` em 501 ativos no status,
--     e o remendo foi acrescentar `(tipo = 'ajuste') desc` ANTES do `id desc`;
--   · a `0087` (30/07/2026) — `apagar_movimentacao` passou a RECUSAR o empate em vez de
--     tentar ordená-lo, porque não havia como dizer com segurança qual era a última.
--
-- A MEDIÇÃO QUE MOTIVA ESTA MIGRATION, em produção (1620 ativos, 3497 movimentações):
--   · a trava do estorno (`aplicar_movimentacao`, 0110:124-126) usa `(created_at, id)` e,
--     em 643 ativos, aponta a `compra` de 2024 como "a última" quando existe um `ajuste`
--     de 2026 empatado no mesmo `created_at`. Nos MESMOS 643, a régua com ordem determinística
--     aponta o `ajuste` — que é o que `ativos.status` já considera verdade — em 643 de 643.
--   · a régua de hoje acertava o `ajuste` em 0 desses 643. É a assinatura do cara-ou-coroa
--     que a `0054` descreveu: dos 1270 pares, o uuid acertou ~627 e errou 643.
--
-- =============================================================================
-- O QUE ESTA MIGRATION FAZ
-- =============================================================================
-- Acrescenta `movimentacoes.ordem` (bigint, not null, identity, único) e a PREENCHE com o
-- ranking pela quádrupla `(data, created_at, (tipo = 'ajuste'), id)` — que é exatamente a
-- ordem ASC cuja INVERSA é o desempate vivo de hoje em `rel_estoque_asof` (0110:269-271).
-- Portanto, para TODA linha que já existe, `ordem desc` reproduz a ordem de hoje **sem mudar
-- um único número histórico**. Quem troca as réguas é a `0134` — esta só cria o cursor.
--
-- ⚠ O backfill é GLOBAL, sem `partition by`. Uma ordem total restrita a um subconjunto
-- preserva a ordem relativa daquele subconjunto, então o ranking global reproduz o
-- desempate POR ATIVO que `distinct on (ativo_id)` faz. Particionar por ativo daria a mesma
-- ordem relativa e NENHUMA ordem global — e é a global que serve de cursor para a F60.
--
-- ⚠ `generated always as identity` (e não `by default`, e não `default nextval`): é a
-- convenção medida da casa — as três colunas identity que já existem (`filiais.id` 0003:10,
-- `itens.id` 0014:14, `tipos_item.id` 0114:54) são TODAS `always`, e não há nenhuma coluna
-- com default `nextval` no schema. CUSTO HERDADO, declarado aqui para a F54: uma restauração
-- que reinsira linha com `ordem` explícita precisa de `overriding system value` no INSERT.
--
-- ⚠ A JANELA. `guarda_acervo` (0081) recusa UPDATE em `movimentacoes` com 42501 — para todo
-- mundo, service role incluso, porque é TRIGGER e não policy. O backfill abre a janela
-- `estoque.dev_destrutivo` no idioma da casa (`perform set_config(..., 'on', true)`, como
-- 0110:373) e a FECHA explicitamente (`'off'`, como 0110:395), inclusive no caminho de ERRO.
-- Tudo dentro de UM bloco `do $$` — e isso não é estilo: `set_config(chave, valor, true)` é
-- local à TRANSAÇÃO, então submeter este arquivo em pedaços faria de cada pedaço a sua
-- própria transação, o `set` não alcançaria o UPDATE, e o 42501 que voltasse seria culpa do
-- MÉTODO, não da guarda. O bloco `do` é atômico por construção.
--
-- ⚠ `trg_aplicar_movimentacao` é **BEFORE INSERT apenas** (medido em produção por
-- `pg_get_triggerdef`) — o UPDATE em massa NÃO re-executa a máquina de estados. O único
-- gatilho que dispara no UPDATE é a `guarda_acervo`, e é dela que a janela trata.
--
-- ⚠ `movimentacoes` está na publication `supabase_realtime` (medido), logo o UPDATE emite
-- 3497 eventos na decodificação do WAL. Medido também: ZERO replication slots ativos, e as
-- três assinaturas do app (`relatorios/assinatura-realtime.ts`) pedem `event: 'INSERT'` —
-- nenhum evento de UPDATE chega a navegador nenhum. Custo: um pico curto de decodificação.
--
-- ADITIVA: cria uma coluna, uma sequência de identidade e um índice. NENHUMA outra coluna de
-- NENHUMA linha é tocada, nenhuma linha é criada ou removida, nenhum grant muda. O corpo não
-- contém exclusão de acervo → NÃO bate no gate → caminho **A** do docs/RUNBOOK-BANCO.md:
-- ensaio primeiro, produção depois.
--
-- =============================================================================
-- ORDEM DE ROLLBACK (regra 10 do §4 do docs/PLANO-MULTIEMPRESA.md) — o inverso do apply
-- =============================================================================
-- ⚠ Se a 0134 já tiver sido aplicada, REVERTA A 0134 PRIMEIRO (reemitindo os corpos da 0110
--   e da 0096): os corpos novos citam `ordem`, e dropar a coluna com `cascade` os levaria junto.
--   1) drop index if exists public.movimentacoes_ordem_uidx;
--   2) alter table public.movimentacoes alter column ordem drop identity if exists;
--   3) alter table public.movimentacoes drop column ordem;
--   4) notify pgrst, 'reload schema';
-- Nada de acervo se perde: a coluna é derivada, e o rollback a recalcula reaplicando a 0133.

-- ---------------------------------------------------------------------------
-- 1) A coluna, ainda anulável — o backfill vem antes do NOT NULL
-- ---------------------------------------------------------------------------
alter table public.movimentacoes add column ordem bigint;

-- ---------------------------------------------------------------------------
-- 2) O backfill, a janela e as conferências — TUDO na mesma transação
-- ---------------------------------------------------------------------------
do $$
declare
  v_antes       bigint;
  v_depois      bigint;
  v_preenchidas bigint;
  v_divergentes bigint;
begin
  select count(*) into v_antes from public.movimentacoes;

  -- Abre a janela oficial. É a MESMA GUC que a `guarda_acervo` lê
  -- (`coalesce(current_setting('estoque.dev_destrutivo', true), '') = 'on'`, 0081).
  perform set_config('estoque.dev_destrutivo', 'on', true);

  update public.movimentacoes m
     set ordem = r.n
    from (select id,
                 row_number() over (order by data, created_at, (tipo = 'ajuste'), id) as n
            from public.movimentacoes) r
   where r.id = m.id;

  -- Fecha a janela IMEDIATAMENTE depois do UPDATE: `set local` não se fecha sozinho antes do
  -- fim da transação, e as conferências abaixo não precisam dela (são só leitura).
  perform set_config('estoque.dev_destrutivo', 'off', true);

  -- ---- CONFERÊNCIA 1: nenhuma linha nasceu nem sumiu ----
  select count(*), count(ordem) into v_depois, v_preenchidas from public.movimentacoes;
  if v_depois <> v_antes then
    raise exception 'F53/0133: a contagem de movimentacoes mudou no backfill (antes=%, depois=%). Nada é aplicado.',
      v_antes, v_depois;
  end if;
  if v_preenchidas <> v_depois then
    raise exception 'F53/0133: % linhas ficaram sem ordem (de % no total). Nada é aplicado.',
      v_depois - v_preenchidas, v_depois;
  end if;

  -- ---- CONFERÊNCIA 2: a EQUIVALÊNCIA TOTAL, não por amostra ----
  -- A ordem ASC por `ordem` tem de reproduzir, em 100% das linhas, a ordem ASC pela
  -- quádrupla. Zero linhas divergentes — asserção, não olhômetro.
  select count(*) into v_divergentes
    from (select id,
                 row_number() over (order by data, created_at, (tipo = 'ajuste'), id) as esperada,
                 ordem
            from public.movimentacoes) t
   where t.esperada is distinct from t.ordem;
  if v_divergentes <> 0 then
    raise exception 'F53/0133: % linhas com ordem diferente do ranking pela quadrupla. Nada é aplicado.',
      v_divergentes;
  end if;

  raise notice 'F53/0133: backfill conferido — % linhas, % com ordem, 0 divergentes.',
    v_depois, v_preenchidas;
exception when others then
  -- A janela NÃO vaza pelo caminho de erro (a armadilha que a 0081 documenta no cabeçalho).
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Fechar a coluna: NOT NULL antes da identidade
-- ---------------------------------------------------------------------------
-- `alter column ... add generated ... as identity` EXIGE a coluna não-nula. A ordem inversa
-- falha no apply — barulhenta, mas ainda assim uma volta ao início.
alter table public.movimentacoes alter column ordem set not null;

alter table public.movimentacoes alter column ordem add generated always as identity;

-- ---------------------------------------------------------------------------
-- 4) Reposicionar a sequência — a armadilha que só aparece DEPOIS do deploy
-- ---------------------------------------------------------------------------
-- `add generated ... as identity` cria a sequência começando em 1, ignorando as linhas que já
-- existem. Se ela ficar ATRÁS de max(ordem), o sintoma não aparece aqui: aparece na PRIMEIRA
-- movimentação registrada depois do deploy, como violação do índice único, na cara do operador.
--
-- ⚠ `alter sequence ... restart with` só aceita LITERAL — subconsulta é erro de sintaxe. Por
-- isso `setval`, que aceita expressão.
-- ⚠ `setval(seq, N)` faz o próximo `nextval` devolver **N+1**; `restart with N` devolveria N.
-- Como queremos que o próximo INSERT receba max+1, o argumento correto é `max(ordem)` — e NÃO
-- `max(ordem) + 1`, que deixaria um buraco de um. Inofensivo, mas seria um buraco não declarado.
do $$
declare v_max bigint; v_seq text;
begin
  select max(ordem) into v_max from public.movimentacoes;
  v_seq := pg_get_serial_sequence('public.movimentacoes', 'ordem');
  if v_seq is null then
    raise exception 'F53/0133: a sequencia de identidade de movimentacoes.ordem nao foi encontrada.';
  end if;
  -- Tabela vazia (banco novo do CI): a sequência fica como nasceu, e o primeiro INSERT recebe 1.
  if v_max is not null then
    perform setval(v_seq, v_max);
  end if;
  raise notice 'F53/0133: sequencia % posicionada em % (proximo nextval = %).',
    v_seq, coalesce(v_max::text, '-'), coalesce((v_max + 1)::text, '1');
end $$;

-- ---------------------------------------------------------------------------
-- 5) O índice único — é ele que torna `ordem` uma ORDEM, e não uma sugestão
-- ---------------------------------------------------------------------------
create unique index movimentacoes_ordem_uidx on public.movimentacoes (ordem);

comment on index public.movimentacoes_ordem_uidx is
  'F53: garante que `ordem` é injetora — sem ele, duas linhas com a mesma ordem devolveriam o desempate ao acaso, que é o defeito que a coluna existe para matar.';

comment on column public.movimentacoes.ordem is
  'F53: a ORDEM TOTAL do acervo de movimentações. No histórico é o ranking pela quádrupla (data, created_at, (tipo = ''ajuste''), id) — a mesma ordem que rel_estoque_asof já usava, congelada num inteiro; daqui para a frente é a ordem de INSERÇÃO (identity). Serve para desempatar com exatidão o que antes caía no uuid aleatório de `id`, que nunca nasceu para ordenar. ⚠ Não é data de negócio: `data` é que responde "quando aconteceu", e o operador pode lançar com data retroativa — por isso as leituras de as-of usam `data desc, ordem desc`, e não `ordem desc` sozinho.';

notify pgrst, 'reload schema';

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) a coluna ficou como se pediu?
--   select column_name, data_type, is_nullable, is_identity, identity_generation
--     from information_schema.columns
--    where table_schema='public' and table_name='movimentacoes' and column_name='ordem';
--   -- esperado: bigint · NO · YES · ALWAYS
--
--   -- 2) contagens (ESCALADA: se `total` mudou, PARE e reverta — ver docs/RUNBOOK-BANCO.md)
--   select count(*) as total, count(ordem) as com_ordem, min(ordem), max(ordem)
--     from public.movimentacoes;
--   -- esperado: total = com_ordem = min 1 = max total (a numeração é densa, de 1 a N)
--
--   -- 3) a equivalência TOTAL (a mesma da conferência 2, agora de fora):
--   select count(*) from (
--     select row_number() over (order by data, created_at, (tipo='ajuste'), id) as esperada, ordem
--       from public.movimentacoes) t
--    where t.esperada is distinct from t.ordem;
--   -- esperado: 0
--
--   -- 4) a sequência NÃO ficou atrás (a armadilha do §4). Numa transação que você reverte:
--   --   begin;
--   --   select nextval(pg_get_serial_sequence('public.movimentacoes','ordem'))
--   --        > (select max(ordem) from public.movimentacoes) as sequencia_a_frente;
--   --   rollback;
--   -- esperado: true
--
--   -- 5) a guarda VOLTOU a morder? Numa transação que você reverte:
--   --   begin;
--   --   update public.movimentacoes set ordem = ordem where id = (select id from public.movimentacoes limit 1);
--   -- esperado: ERRO 42501 'Registro histórico não se altera: movimentacoes é imutável...'
--   --   rollback;
