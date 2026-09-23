-- =============================================================================
-- 0160_empresa_no_acervo_cadastros.sql — F63 (23/09/2026): `empresa_id` no acervo, lote 1, parte 1
-- =============================================================================
-- classe: ADITIVA (quatro colunas novas com default NÃO-VOLÁTIL; nenhuma tupla reescrita)
--
-- A F63 dá `empresa_id` às oito tabelas do ACERVO, em duas migrations de quatro. Esta é a dos
-- CADASTROS — `colaboradores`, `itens`, `termos_gerados`, `anotacoes` —, as frias, que vão
-- primeiro como canário; a `0161` faz as quatro quentes (`movimentacoes`, `lancamentos_item`,
-- `ativos`, `pendencias_item`).
--
-- ██████████████████████████████████████████████████████████████████████████████████████████
-- ██  NÃO HÁ `UPDATE` DE BACKFILL AQUI, E NÃO PODE HAVER.                                   ██
-- ██  `add column … not null default public.empresa_legada()` é preenchido pelo Postgres    ██
-- ██  11+ SEM reescrever tupla e SEM disparar gatilho: o default é não-volátil, avaliado    ██
-- ██  UMA vez no ALTER, e o valor fica no catálogo (`pg_attribute.attmissingval`,           ██
-- ██  `atthasmissing = true`) — vale para toda linha que já existe. O `update` ingênuo      ██
-- ██  (a receita "add column → update → set not null") ABORTA em 42501 em                  ██
-- ██  `movimentacoes`/`lancamentos_item` (a `guarda_acervo` da 0081 recusa UPDATE até do    ██
-- ██  service role) e, em `ativos` — cuja guarda é só BEFORE DELETE —, REESCREVE as 1.649  ██
-- ██  tuplas em silêncio. A prova de que nada foi reescrito é dupla, nos dois bancos:       ██
-- ██  `pg_relation_filenode()` igual (nenhuma reescrita da tabela) e o md5 de (id, xmin)    ██
-- ██  igual (nenhum update) — docs/f63-evidencias/impressao-acervo.sql.                     ██
-- ██████████████████████████████████████████████████████████████████████████████████████████
--
-- A FORMA É A DA 0155 (F62, `filiais.empresa_id`): `uuid not null default
-- public.empresa_legada() references public.empresas (id)`. A função, nunca o literal — ela é a
-- fonte única da empresa legada (decisão 3 da F62), `sql stable`, e o caminho rápido do PG 11+
-- vale para ela (medido na F62 em produção: `filiais.empresa_id` com `atthasmissing = true`).
-- Sem `set not null` separado (o `not null` vem no próprio `add column`, já satisfeito pelo
-- default) e sem índice (os liderados por `empresa_id` são da F65).
--
-- O DEFAULT FICA ATÉ A F67 (decisão do Johnny, 23/09/2026). Tirá-lo agora obrigaria 18 funções
-- SQL, 9 pontos do app, o seed, a carga, a restauração e 27 roteiros a informar a empresa — e três
-- casos (`itens`, `termos_gerados`, colaborador sem filial) nem têm pai de onde tirá-la. A fonte
-- certa (a empresa de quem escreve) só existe quando a escrita ganha a empresa, na F67. Até lá,
-- todo INSERT sem `empresa_id` recebe a WAP, e NADA lê a coluna (o recorte é da F66).
--
-- O LOCK: ADD COLUMN toma ACCESS EXCLUSIVE; a FK toma SHARE ROW EXCLUSIVE em `empresas` e valida
-- com uma varredura, sem reescrever (doc do PG 17). `lock_timeout` de 2 s: se o lock não vier, o
-- ALTER aborta em vez de enfileirar o app atrás dele — e o apply se repete (no máximo três vezes
-- em 30 min; nunca subir o timeout, nunca matar sessão do app). `set` + `reset`, e não `set
-- local`: o CI aplica cada comando solto (`psql -f`, sem `-1`), onde `set local` não vale; sem
-- `begin`/`commit` no arquivo, quem decide a transação é o apply. No CI esta migration NÃO é
-- atômica (cada `alter` confirma sozinho) — o rollback usa `if exists` por isso.
-- =============================================================================

set lock_timeout = '2s';

alter table public.colaboradores
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.colaboradores.empresa_id is
  'F63 (0160, 23/09/2026): a EMPRESA dona deste colaborador — a chave de recorte do acervo. Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo). Ninguém lê esta coluna antes da F66.';

alter table public.itens
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.itens.empresa_id is
  'F63 (0160, 23/09/2026): a EMPRESA dona deste item do catálogo — a chave de recorte do acervo. Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo). Ninguém lê esta coluna antes da F66.';

alter table public.termos_gerados
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.termos_gerados.empresa_id is
  'F63 (0160, 23/09/2026): a EMPRESA dona deste termo gerado — a chave de recorte do acervo. Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo). Ninguém lê esta coluna antes da F66.';

alter table public.anotacoes
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.anotacoes.empresa_id is
  'F63 (0160, 23/09/2026): a EMPRESA dona desta anotação — a chave de recorte do acervo. Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo). Ninguém lê esta coluna antes da F66.';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo e contagem) ----------
--   docs/f63-evidencias/verificacao-pos-apply.sql (bloco `acervo`/`contagens`) e a impressão
--   docs/f63-evidencias/impressao-acervo.sql antes × depois: relfilenode e md5 de (id, xmin)
--   IGUAIS; atthasmissing = true; count(*) = count(empresa_id) = count(*) filter (where
--   empresa_id = public.empresa_legada()).
--
-- ROLLBACK (supabase/rollback/F63-desfaz.sql, passo 2 — DEPOIS de desfazer a 0161):
--   alter table public.colaboradores  drop column if exists empresa_id;
--   alter table public.itens          drop column if exists empresa_id;
--   alter table public.termos_gerados drop column if exists empresa_id;
--   alter table public.anotacoes      drop column if exists empresa_id;
-- (sem reescrita: a coluna fica attisdropped; a FK e o comentário caem junto)
