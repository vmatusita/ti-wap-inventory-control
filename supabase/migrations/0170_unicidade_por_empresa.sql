-- =============================================================================
-- 0170_unicidade_por_empresa.sql — F65 (23/09/2026): as unicidades de negócio passam a valer POR EMPRESA, com os NOMES
-- =============================================================================
-- classe: ADITIVA (seis uniques trocados pela forma por empresa, com os MESMOS nomes; nenhuma tupla reescrita)
--
-- Nomes que não podem repetir — filial (slug e nome), tipo de item, item, kit, apelido de unidade — passam a não poder
-- repetir DENTRO da mesma empresa; entre empresas, coexistem. Seis da lista do fato 7:
--   · `filiais_slug_key`                     constraint unique (slug)                 → unique (empresa_id, slug)
--   · `filiais_nome_chave_uidx`              índice (vocabulario_chave(nome))         → (empresa_id, vocabulario_chave(nome))
--   · `tipos_item_slug_key`                  constraint unique (slug)                 → unique (empresa_id, slug)
--   · `itens_nome_chave_uidx`                índice (nome_chave)                      → (empresa_id, nome_chave)
--   · `kits_modelos_nome_uidx`               índice (lower(nome))                     → (empresa_id, lower(nome))
--   · `unidades_apelidos_apelido_chave_uidx` índice (apelido_chave)                   → (empresa_id, apelido_chave)
-- (Os outros da lista moram ao lado: `motivos_pkey` na 0168, as chaves do import na 0169, o snapshot na 0171, o de
-- `colaboradores` em dois passos, 0172 e 0174 — o `ON CONFLICT (nome_chave)` do app no ar quebraria na janela.)
--
-- ██████████████████████████████████████████████████████████████████████████████████████████████████████████████████
-- ██  OS NOMES SÃO CONTRATO (fato 9). `CONSTRAINTS_TRADUZIDAS` (src/lib/supabase/erros-do-banco.ts) traduz o 23505   ██
-- ██  PELO NOME do índice ou da constraint; renomear mata a tradução em silêncio (a armadilha que a 0091 registrou). ██
-- ██  O nome de índice é único no schema, então "criar o novo antes de derrubar o antigo" é: nome PROVISÓRIO          ██
-- ██  (`<nome>_f65`) → `drop` do antigo → `alter index … rename` (índice) ou `alter table … rename constraint`         ██
-- ██  (constraint) — na MESMA migration. O nome contratual nunca some, e o provisório o CONTÉM (se uma mensagem o      ██
-- ██  citasse, `casaConstraint` casaria do mesmo jeito). Constraint continua constraint; índice continua índice.        ██
-- ██████████████████████████████████████████████████████████████████████████████████████████████████████████████████
--
-- A ORDEM DAS COLUNAS: `empresa_id` primeiro, em todos (a forma de `filiais_empresa_id_uidx`, das PKs da 0168/0169 e do
-- recorte da F66). As consultas que filtram SÓ pela chave natural (o slug de filial e de tipo, o `nome_chave` de item)
-- caem em tabelas de 6, 10 e 23 linhas em produção — uma página; nenhum custo mensurável até a F66 (PLAN-F65, decisão 4).
-- Com uma empresa só, a chave de antes continua única — a contagem do "antes" deu 0 duplicata nos seis, nos dois bancos.
--
-- A DIAGONAL nome × apelido (que nenhum índice cobre) passa a ser por empresa no gatilho `vocabulario_unidades_guarda`,
-- na 0173 — junto com estes dois índices (nome × nome e apelido × apelido), ela torna verdadeira a "filial única POR
-- empresa" (fato 15).
--
-- O LOCK: tabelas frias (6, 10, 23, 0 e 13 linhas em produção). `ADD CONSTRAINT … UNIQUE` toma ACCESS EXCLUSIVE; `CREATE
-- UNIQUE INDEX`, SHARE; `DROP INDEX`, ACCESS EXCLUSIVE — milissegundos, até o commit. `lock_timeout` de 2 s por
-- `set`/`reset`, sem `begin`/`commit`; se o lock não vier: registrar e repetir, no máximo três vezes em 30 min, sem subir
-- o timeout nem matar sessão do app.
-- =============================================================================

set lock_timeout = '2s';

-- filiais: o slug (constraint) e o nome normalizado (índice de expressão)
alter table public.filiais
  add constraint filiais_slug_key_f65 unique (empresa_id, slug);
alter table public.filiais
  drop constraint filiais_slug_key;
alter table public.filiais
  rename constraint filiais_slug_key_f65 to filiais_slug_key;

create unique index filiais_nome_chave_uidx_f65 on public.filiais (empresa_id, public.vocabulario_chave(nome));
drop index public.filiais_nome_chave_uidx;
alter index public.filiais_nome_chave_uidx_f65 rename to filiais_nome_chave_uidx;
comment on index public.filiais_nome_chave_uidx is
  'F65 (0170, 23/09/2026 — era F56 · Decisão 2, 0139): duas filiais DA MESMA EMPRESA não podem ter o mesmo nome normalizado (empresa_id, vocabulario_chave(nome)); entre empresas, coexistem. A diagonal nome×apelido é o gatilho vocabulario_unidades_guarda (por empresa desde a 0173), não este índice. O NOME é contrato: CONSTRAINTS_TRADUZIDAS traduz o 23505 por ele.';

-- tipos_item: o slug (constraint)
alter table public.tipos_item
  add constraint tipos_item_slug_key_f65 unique (empresa_id, slug);
alter table public.tipos_item
  drop constraint tipos_item_slug_key;
alter table public.tipos_item
  rename constraint tipos_item_slug_key_f65 to tipos_item_slug_key;

-- itens: a chave normalizada do nome
create unique index itens_nome_chave_uidx_f65 on public.itens (empresa_id, nome_chave);
drop index public.itens_nome_chave_uidx;
alter index public.itens_nome_chave_uidx_f65 rename to itens_nome_chave_uidx;
comment on index public.itens_nome_chave_uidx is
  'F65 (0170, 23/09/2026 — era F41, 0125): deduplicação do catálogo de itens pela chave normalizada, POR EMPRESA (empresa_id, nome_chave); entre empresas, coexistem. O NOME é contrato: CONSTRAINTS_TRADUZIDAS traduz o 23505 por ele.';

-- kits_modelos: o nome sem caixa (índice de expressão)
create unique index kits_modelos_nome_uidx_f65 on public.kits_modelos (empresa_id, (lower(nome)));
drop index public.kits_modelos_nome_uidx;
alter index public.kits_modelos_nome_uidx_f65 rename to kits_modelos_nome_uidx;

-- unidades_apelidos: o apelido normalizado (apelido × apelido)
create unique index unidades_apelidos_apelido_chave_uidx_f65 on public.unidades_apelidos (empresa_id, apelido_chave);
drop index public.unidades_apelidos_apelido_chave_uidx;
alter index public.unidades_apelidos_apelido_chave_uidx_f65 rename to unidades_apelidos_apelido_chave_uidx;

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   docs/f65-evidencias/impressao-catalogo.sql: os seis com `empresa_id` na frente e os nomes de antes; `filiais_slug_key`
--   e `tipos_item_slug_key` continuam constraint (u); nenhum `*_f65` sobrando; impressao-tenant.sql: relfilenode e md5 de
--   (chave, xmin) IGUAIS nas cinco tabelas.
--
-- ROLLBACK (supabase/rollback/F65-desfaz.sql, passo 5 — cada um de volta à forma global, pelo mesmo provisório → drop →
-- rename, e só onde estiver na forma nova; com DUAS empresas repetindo um nome, o global não volta — depois da F73, o
-- rollback exige que o dado da segunda empresa já tenha saído):
--   alter table public.filiais add constraint filiais_slug_key_f65 unique (slug); … drop …; rename … to filiais_slug_key;
--   create unique index filiais_nome_chave_uidx_f65 on public.filiais (public.vocabulario_chave(nome)); drop …; rename …;
--   (idem tipos_item (slug), itens (nome_chave), kits_modelos ((lower(nome))), unidades_apelidos (apelido_chave)), e os
--   dois `comment on index` de volta ao texto da 0139 e da 0125.
