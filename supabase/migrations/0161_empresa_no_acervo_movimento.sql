-- =============================================================================
-- 0161_empresa_no_acervo_movimento.sql — F63 (23/09/2026): `empresa_id` no acervo, lote 1, parte 2
-- =============================================================================
-- classe: ADITIVA (quatro colunas novas com default NÃO-VOLÁTIL; nenhuma tupla reescrita)
--
-- A segunda metade do lote 1: as quatro tabelas QUENTES do acervo — `movimentacoes`,
-- `lancamentos_item`, `ativos`, `pendencias_item` —, na ORDEM EM QUE O APP TOMA OS LOCKS (a
-- movimentação grava em `movimentacoes` e o gatilho `trg_aplicar_movimentacao` chega a `ativos` e
-- a `pendencias_item`; o lançamento de item grava em `lancamentos_item`). Tomar os locks na mesma
-- ordem que uma escrita em curso evita o ciclo de espera entre o ALTER e ela.
--
-- ██████████████████████████████████████████████████████████████████████████████████████████
-- ██  NÃO HÁ `UPDATE` DE BACKFILL AQUI, E NÃO PODE HAVER.                                   ██
-- ██  Em `movimentacoes` e `lancamentos_item` ele ABORTARIA em 42501 na primeira linha: a   ██
-- ██  `guarda_acervo` (0081) é BEFORE INSERT/UPDATE/DELETE por linha e recusa UPDATE até    ██
-- ██  do service role — e abrir a janela `estoque.dev_destrutivo` para um backfill de      ██
-- ██  rotina desarmaria a imutabilidade do acervo inteiro dentro da transação (a válvula da  ██
-- ██  F23 é para a exclusão deliberada, não ferramenta de migração). Em `ativos`, cuja     ██
-- ██  guarda é SÓ BEFORE DELETE, o `update` ingênuo NÃO aborta: reescreve as 1.649 tuplas   ██
-- ██  em silêncio. O backfill é DESNECESSÁRIO: `add column … not null default              ██
-- ██  public.empresa_legada()` (não-volátil) preenche as linhas que já existem pelo         ██
-- ██  catálogo (`atthasmissing`), sem reescrever tupla e sem disparar gatilho. Prova, nos   ██
-- ██  dois bancos: `pg_relation_filenode()` e o md5 de (id, xmin) IGUAIS antes e depois.    ██
-- ██████████████████████████████████████████████████████████████████████████████████████████
--
-- A forma, o default até a F67 (decisão do Johnny), o lock e o porquê de `set` + `reset` são os
-- da 0160 — ver o cabeçalho dela.
-- =============================================================================

set lock_timeout = '2s';

alter table public.movimentacoes
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.movimentacoes.empresa_id is
  'F63 (0161, 23/09/2026): a EMPRESA dona desta movimentação — a chave de recorte do acervo. Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo) — a guarda_acervo recusaria o update. Ninguém lê esta coluna antes da F66.';

alter table public.lancamentos_item
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.lancamentos_item.empresa_id is
  'F63 (0161, 23/09/2026): a EMPRESA dona deste lançamento de item — a chave de recorte do acervo. Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo) — a guarda_acervo recusaria o update. Ninguém lê esta coluna antes da F66.';

alter table public.ativos
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.ativos.empresa_id is
  'F63 (0161, 23/09/2026): a EMPRESA dona deste ativo — a chave de recorte do acervo. Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo) — um update aqui reescreveria as tuplas em silêncio. Ninguém lê esta coluna antes da F66.';

alter table public.pendencias_item
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.pendencias_item.empresa_id is
  'F63 (0161, 23/09/2026): a EMPRESA dona desta pendência de item — a chave de recorte do acervo. Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo). Ninguém lê esta coluna antes da F66.';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo e contagem) ----------
--   docs/f63-evidencias/verificacao-pos-apply.sql e a impressão docs/f63-evidencias/impressao-acervo.sql
--   antes × depois: relfilenode e md5 de (id, xmin) IGUAIS; atthasmissing = true;
--   count(*) = count(empresa_id) = count(*) filter (where empresa_id = public.empresa_legada()).
--
-- ROLLBACK (supabase/rollback/F63-desfaz.sql, passo 1 — o PRIMEIRO da fase):
--   alter table public.movimentacoes    drop column if exists empresa_id;
--   alter table public.lancamentos_item drop column if exists empresa_id;
--   alter table public.ativos           drop column if exists empresa_id;
--   alter table public.pendencias_item  drop column if exists empresa_id;
-- (sem reescrita: a coluna fica attisdropped; a FK e o comentário caem junto)
