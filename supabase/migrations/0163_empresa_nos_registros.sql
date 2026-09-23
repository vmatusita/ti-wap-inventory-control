-- =============================================================================
-- 0163_empresa_nos_registros.sql — F64 (23/09/2026): `empresa_id` no lote 2, parte 2 (os registros)
-- =============================================================================
-- classe: ADITIVA (cinco colunas novas com default NÃO-VOLÁTIL; nenhuma tupla reescrita)
--
-- A segunda metade do lote 2 da F64 (a 0162 fez as seis do vocabulário): os cinco REGISTROS de
-- negócio — `kits_modelos` (os kits de movimentação), `senhas_acesso` (as senhas de visualização
-- dos relatórios), `relatorios_gerados` (os relatórios congelados), `import_logs` (a trilha dos
-- imports) e `eventos_admin` (a trilha de auditoria). Depois desta, as 20 tabelas de `k_negocio`
-- têm a chave de recorte — a pendência que o bloco 5 de catalogo_policies.sql emitia como aviso
-- passa a REPROVAR (15f).
--
-- ██████████████████████████████████████████████████████████████████████████████████████████
-- ██  NÃO HÁ `UPDATE` DE BACKFILL AQUI, E NÃO PODE HAVER.                                   ██
-- ██  `add column … not null default public.empresa_legada()` é preenchido pelo Postgres    ██
-- ██  11+ SEM reescrever tupla e SEM disparar gatilho: o valor fica no catálogo             ██
-- ██  (`atthasmissing = true`). E AQUI NADA BARRARIA O `update` INGÊNUO: nenhuma destas     ██
-- ██  cinco tem gatilho, e `eventos_admin` — a trilha de auditoria, insert-only pelo app —  ██
-- ██  seria REESCRITA inteira em silêncio. A prova de que não houve é dupla, nos dois      ██
-- ██  bancos: `pg_relation_filenode()` igual e o md5 de (pk, xmin) igual                    ██
-- ██  (docs/f64-evidencias/impressao-vocabulario.sql).                                      ██
-- ██████████████████████████████████████████████████████████████████████████████████████████
--
-- A FORMA É A DA 0162 (e da 0160/0161/0155): `uuid not null default public.empresa_legada()
-- references public.empresas (id)`, a função e nunca o literal, sem `set not null` separado, sem
-- índice (F65), sem constraint existente tocada (os uniques globais — `kits_modelos_nome_uidx`, o
-- do snapshot de `relatorios_gerados` — são da F65) e sem policy tocada (F66).
--
-- O DEFAULT FICA ATÉ A F67 (decisão 1 do Johnny, 23/09/2026). Em particular:
--   · `eventos_admin` NÃO passa a ser preenchida "na origem" nesta fase — o único escritor TS
--     (src/lib/auditoria-registro.ts) e as oito funções SQL que gravam nela continuam sem informar a
--     empresa; é a F67 que os muda, quando a escrita recebe a empresa (a promessa da ficha F64
--     foi para a ficha da F67, com o orçamento do docs/PLAN-F64.md §2);
--   · `senhas_acesso` ganha a coluna, e NINGUÉM a lê até a F68 (a porta pública por empresa).
--
-- A ORDEM das cinco segue a ordem em que o app toma os locks (docs/PLAN-F64.md, decisão 1):
-- `eventos_admin` é a última — as RPCs destrutivas e o app a gravam no FIM de cada operação,
-- depois do acervo e de `import_logs`.
--
-- O LOCK: o mesmo da 0162 — `set lock_timeout = '2s'` / `reset`, sem `begin`/`commit` (quem decide a
-- transação é o apply). `eventos_admin` e `relatorios_gerados` recebem escrita do app a qualquer
-- hora, mas a escrita é um INSERT curto: o ALTER espera no máximo 2 s por ela, e se o lock não vier
-- ele aborta e se repete (no máximo três vezes em 30 min).
-- =============================================================================

set lock_timeout = '2s';

alter table public.kits_modelos
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.kits_modelos.empresa_id is
  'F64 (0163, 23/09/2026): a EMPRESA dona deste kit — a chave de recorte dos registros. O motivo do payload tem de existir em motivos NA EMPRESA DO KIT (o gatilho kits_modelos_motivo_da_empresa e a checagem kit_motivo_orfao, 0164). Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo). Só a integridade do kit a lê antes da F66; ninguém a lê para recortar.';

alter table public.senhas_acesso
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.senhas_acesso.empresa_id is
  'F64 (0163, 23/09/2026): a EMPRESA dona desta senha de visualização — a chave de recorte dos registros. Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo). Ninguém lê esta coluna antes da F68 (a porta pública por empresa).';

alter table public.relatorios_gerados
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.relatorios_gerados.empresa_id is
  'F64 (0163, 23/09/2026): a EMPRESA dona deste relatório gerado — a chave de recorte dos registros. Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo). O unique do snapshot continua sem a empresa até a F65. Ninguém lê esta coluna antes da F66.';

alter table public.import_logs
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.import_logs.empresa_id is
  'F64 (0163, 23/09/2026): a EMPRESA dona deste registro de import — a chave de recorte dos registros. Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP (import_gravar_trilha não a informa). Preenchida sem update (default não-volátil do PG 11+, valor no catálogo). Ninguém lê esta coluna antes da F66.';

alter table public.eventos_admin
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.eventos_admin.empresa_id is
  'F64 (0163, 23/09/2026): a EMPRESA dona deste evento da trilha de auditoria — a chave de recorte dos registros. Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa NA ORIGEM (auditoria-registro.ts e as funções que gravam aqui); até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo). Ninguém lê esta coluna antes da F66.';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo e contagem) ----------
--   docs/f64-evidencias/verificacao-pos-apply.sql (blocos `lote2`/`contagens`/`negocio`) e a
--   impressão docs/f64-evidencias/impressao-vocabulario.sql antes × depois: relfilenode e md5 de
--   (pk, xmin) IGUAIS; atthasmissing = true; count(*) = count(empresa_id) = count(*) filter (where
--   empresa_id = public.empresa_legada()); as 20 de k_negocio com a coluna.
--
-- ROLLBACK (supabase/rollback/F64-desfaz.sql, passo 2 — DEPOIS de desfazer a 0164, ANTES da 0162):
--   alter table public.kits_modelos       drop column if exists empresa_id;
--   alter table public.senhas_acesso      drop column if exists empresa_id;
--   alter table public.relatorios_gerados drop column if exists empresa_id;
--   alter table public.import_logs        drop column if exists empresa_id;
--   alter table public.eventos_admin      drop column if exists empresa_id;
-- (sem reescrita: a coluna fica attisdropped; a FK e o comentário caem junto)
