-- =============================================================================
-- 0162_empresa_no_vocabulario.sql — F64 (23/09/2026): `empresa_id` no lote 2, parte 1 (o vocabulário)
-- =============================================================================
-- classe: ADITIVA (seis colunas novas com default NÃO-VOLÁTIL; nenhuma tupla reescrita)
--
-- A F64 dá `empresa_id` às ONZE tabelas de negócio que ainda não a tinham depois da F63 (o lote 2,
-- `k_lote2` em supabase/tests/catalogo_policies.sql), em duas migrations. Esta é a do VOCABULÁRIO —
-- o De→Para do import (`import_prefixos_patrimonio`, `import_termos_categoria`,
-- `import_termos_estado`, `unidades_apelidos`) e os dois catálogos que o acervo referencia
-- (`tipos_item`, `motivos`); a 0163 faz os cinco REGISTROS (`kits_modelos`, `senhas_acesso`,
-- `relatorios_gerados`, `import_logs`, `eventos_admin`). Depois das duas, as 20 tabelas de
-- `k_negocio` têm a chave de recorte.
--
-- ██████████████████████████████████████████████████████████████████████████████████████████
-- ██  NÃO HÁ `UPDATE` DE BACKFILL AQUI, E NÃO PODE HAVER.                                   ██
-- ██  `add column … not null default public.empresa_legada()` é preenchido pelo Postgres    ██
-- ██  11+ SEM reescrever tupla e SEM disparar gatilho: o default é não-volátil, avaliado    ██
-- ██  UMA vez no ALTER, e o valor fica no catálogo (`pg_attribute.attmissingval`,           ██
-- ██  `atthasmissing = true`) — vale para toda linha que já existe. E AQUI NADA BARRARIA O  ██
-- ██  `update` INGÊNUO: nenhuma destas seis tem `guarda_acervo`, o único gatilho            ██
-- ██  (`unidades_apelidos_vocabulario_guarda`) confere o vocabulário e não a empresa, e a  ██
-- ██  guarda de topo das migrations só vigia `movimentacoes`/`lancamentos_item`/`ativos`. ██
-- ██  Um `update … set empresa_id` passaria em silêncio e REESCREVERIA cada linha. A prova ██
-- ██  de que isso não houve é dupla, nos dois bancos: `pg_relation_filenode()` igual       ██
-- ██  (nenhuma reescrita da tabela) e o md5 de (pk, xmin) igual (nenhum update) — com a PK ██
-- ██  LIDA DO CATÁLOGO, porque quatro destas seis não têm `id` (`motivos (codigo)`,        ██
-- ██  `import_prefixos_patrimonio (prefixo)`, `import_termos_* (termo)`):                  ██
-- ██  docs/f64-evidencias/impressao-vocabulario.sql.                                         ██
-- ██████████████████████████████████████████████████████████████████████████████████████████
--
-- A FORMA É A DA 0160/0161 (F63) E DA 0155 (F62): `uuid not null default public.empresa_legada()
-- references public.empresas (id)`. A função, nunca o literal — ela é a fonte única da empresa
-- legada (decisão 3 da F62), `sql stable`: "non-volatile" na doc do PG 17, o caminho rápido vale
-- (medido em produção na F62 e na F63, `atthasmissing = true`). Sem `set not null` separado, sem
-- índice (os liderados por `empresa_id` são da F65).
--
-- NENHUMA CONSTRAINT EXISTENTE MUDA (decisão 2 do Johnny, 23/09/2026): a PK de `motivos` (`codigo`),
-- a FK `movimentacoes_motivo_fkey` e as PKs naturais do vocabulário do import (`prefixo`, `termo`)
-- continuam GLOBAIS — trocá-las por `(empresa_id, …)` é da F65, com os uniques por empresa e as FKs
-- compostas. Até lá, dois motivos (ou termos, ou prefixos) de mesmo código em empresas diferentes
-- NÃO coexistem. Nenhuma policy muda (o recorte é da F66).
--
-- O DEFAULT FICA ATÉ A F67 (decisão 1 do Johnny, 23/09/2026 — a régua que ele deu ao acervo na
-- F63). Tirá-lo agora obrigaria cada escritor destas tabelas a informar a empresa — e a única fonte
-- de empresa antes da F67 é `EMPRESA_LEGADA_ID` explícito, a mesma herança silenciosa que a F63
-- recusou. O orçamento está no docs/PLAN-F64.md §2 (e na ficha da F67). Até lá, todo INSERT sem
-- `empresa_id` recebe a WAP, e NADA lê a coluna para recortar (o recorte é da F66).
--
-- A MÁSCARA DO PATRIMÔNIO (fato 25 da ordem): com `empresa_id` em `import_prefixos_patrimonio`, o
-- prefixo por empresa É o dado desta tabela — a F64 NÃO cria `empresas.patrimonio_prefixo` (o
-- motivo da decisão 1 da F62: coluna sem consumidor é contrato sem prova).
--
-- A ORDEM das seis segue a ordem em que o app toma os locks (docs/PLAN-F64.md, decisão 1): o
-- vocabulário do import é LIDO antes de qualquer escrita que valide motivo; `tipos_item` é pai de
-- `itens` e `motivos` é pai de `movimentacoes` (a FK conferida no caminho quente), por isso vêm por
-- último.
--
-- O LOCK: ADD COLUMN toma ACCESS EXCLUSIVE; a FK toma SHARE ROW EXCLUSIVE em `empresas` e valida
-- com uma varredura, sem reescrever (doc do PG 17). `lock_timeout` de 2 s: se o lock não vier, o
-- ALTER aborta em vez de enfileirar o app atrás dele — e o apply se repete (no máximo três vezes
-- em 30 min; nunca subir o timeout, nunca matar sessão do app). `set` + `reset`, e não `set
-- local`: o CI aplica cada comando solto (`psql -f`, sem `-1`), onde `set local` não vale; sem
-- `begin`/`commit` no arquivo, quem decide a transação é o apply (o `apply_migration` do MCP é UMA
-- transação com o ledger — medido na F63). No CI esta migration NÃO é atômica (cada `alter`
-- confirma sozinho) — o rollback usa `if exists` por isso.
-- =============================================================================

set lock_timeout = '2s';

alter table public.import_prefixos_patrimonio
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.import_prefixos_patrimonio.empresa_id is
  'F64 (0162, 23/09/2026): a EMPRESA dona deste prefixo de patrimônio do import — a chave de recorte do vocabulário; o prefixo por empresa é o dado desta tabela (não há empresas.patrimonio_prefixo). Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo). A PK (prefixo) continua global até a F65. Ninguém lê esta coluna antes da F66.';

alter table public.import_termos_categoria
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.import_termos_categoria.empresa_id is
  'F64 (0162, 23/09/2026): a EMPRESA dona deste termo de categoria do import — a chave de recorte do vocabulário. Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo). A PK (termo) continua global até a F65. Ninguém lê esta coluna antes da F66.';

alter table public.import_termos_estado
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.import_termos_estado.empresa_id is
  'F64 (0162, 23/09/2026): a EMPRESA dona deste termo de estado do import — a chave de recorte do vocabulário. Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo). A PK (termo) continua global até a F65. Ninguém lê esta coluna antes da F66.';

alter table public.unidades_apelidos
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.unidades_apelidos.empresa_id is
  'F64 (0162, 23/09/2026): a EMPRESA dona deste apelido de unidade — a chave de recorte do vocabulário. Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo). O unique do apelido continua global até a F65. Ninguém lê esta coluna antes da F66.';

alter table public.tipos_item
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.tipos_item.empresa_id is
  'F64 (0162, 23/09/2026): a EMPRESA dona deste tipo de item — a chave de recorte do vocabulário. Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo). O unique do slug continua global até a F65. Ninguém lê esta coluna antes da F66.';

alter table public.motivos
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);
comment on column public.motivos.empresa_id is
  'F64 (0162, 23/09/2026): a EMPRESA dona deste motivo — a chave de recorte do vocabulário. Default public.empresa_legada() (a WAP) ATÉ A F67 (decisão do Johnny): o default cai na F67, quando a escrita passar a informar a empresa; até lá todo INSERT sem empresa_id recebe a WAP. Preenchida sem update (default não-volátil do PG 11+, valor no catálogo). A PK (codigo) e a FK de movimentacoes.motivo continuam globais até a F65. Só a integridade do kit a lê antes da F66 (0164, a exceção nominal); ninguém a lê para recortar.';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo e contagem) ----------
--   docs/f64-evidencias/verificacao-pos-apply.sql (blocos `lote2`/`contagens`) e a impressão
--   docs/f64-evidencias/impressao-vocabulario.sql antes × depois: relfilenode e md5 de (pk, xmin)
--   IGUAIS; atthasmissing = true; count(*) = count(empresa_id) = count(*) filter (where
--   empresa_id = public.empresa_legada()).
--
-- ROLLBACK (supabase/rollback/F64-desfaz.sql, passo 3 — DEPOIS de desfazer a 0164 e a 0163):
--   alter table public.import_prefixos_patrimonio drop column if exists empresa_id;
--   alter table public.import_termos_categoria    drop column if exists empresa_id;
--   alter table public.import_termos_estado       drop column if exists empresa_id;
--   alter table public.unidades_apelidos          drop column if exists empresa_id;
--   alter table public.tipos_item                 drop column if exists empresa_id;
--   alter table public.motivos                    drop column if exists empresa_id;
-- (sem reescrita: a coluna fica attisdropped; a FK e o comentário caem junto)
