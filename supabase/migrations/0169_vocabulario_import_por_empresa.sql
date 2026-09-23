-- =============================================================================
-- 0169_vocabulario_import_por_empresa.sql — F65 (23/09/2026): o vocabulário do import com as chaves POR EMPRESA
-- =============================================================================
-- classe: ADITIVA (três PKs e dois índices únicos parciais trocados pela forma por empresa, com os MESMOS nomes;
--                  nenhuma tupla reescrita)
--
-- O De→Para do import (F56) é dado DE UMA EMPRESA — a F64 lhe deu `empresa_id` (0162). As chaves continuavam globais
-- (decisão 2 do Johnny na F64: vêm para cá), e com elas duas empresas não podem ter o mesmo termo, o mesmo prefixo, nem
-- o mesmo rótulo de destino:
--   · `import_prefixos_patrimonio_pkey`               (prefixo)  → (empresa_id, prefixo)
--   · `import_termos_categoria_pkey`                  (termo)    → (empresa_id, termo)
--   · `import_termos_estado_pkey`                     (termo)    → (empresa_id, termo)
--   · `import_termos_categoria_categoria_rotulo_uidx` (categoria) where rotulo is not null → (empresa_id, categoria) …
--   · `import_termos_estado_estado_rotulo_uidx`       (estado)    where rotulo is not null → (empresa_id, estado) …
-- Os dois PARCIAIS (fato 7 — nenhuma nota da ficha os citava) valem só no recorte `rotulo is not null` — o recorte fica
-- igual, e a chave ganha a empresa.
--
-- OS NOMES: as PKs são trocadas no MESMO `alter table` (`drop constraint X, add constraint X primary key (…)`) — uma
-- tabela só tem uma PK, e nenhuma FK depende destas (fato 12); o nome se mantém. Os parciais são ÍNDICES soltos, pela
-- sequência nome provisório (`<nome>_f65`) → `drop index` do antigo → `alter index … rename` (fato 9): o nome contratual
-- nunca some, e o provisório o CONTÉM. Com uma empresa só, a chave natural de antes continua única — a contagem do
-- "antes" deu 0 duplicata nas cinco, nos dois bancos.
--
-- OS LEITORES por termo ou prefixo sozinho (a RPC de import da F56, `lerVocabularioImport` que lê as tabelas inteiras)
-- continuam certos com UMA empresa; com duas, é a F67 (o import passa a receber a empresa).
--
-- O LOCK: tabelas frias (7, 5 e 17 linhas), lidas pelo import; ACCESS EXCLUSIVE por milissegundos até o commit.
-- `lock_timeout` de 2 s por `set`/`reset`, sem `begin`/`commit`; se o lock não vier: registrar e repetir, no máximo três
-- vezes em 30 min, sem subir o timeout nem matar sessão do app.
-- =============================================================================

set lock_timeout = '2s';

alter table public.import_prefixos_patrimonio
  drop constraint import_prefixos_patrimonio_pkey,
  add constraint import_prefixos_patrimonio_pkey primary key (empresa_id, prefixo);

alter table public.import_termos_categoria
  drop constraint import_termos_categoria_pkey,
  add constraint import_termos_categoria_pkey primary key (empresa_id, termo);

create unique index import_termos_categoria_categoria_rotulo_uidx_f65
  on public.import_termos_categoria (empresa_id, categoria) where rotulo is not null;
drop index public.import_termos_categoria_categoria_rotulo_uidx;
alter index public.import_termos_categoria_categoria_rotulo_uidx_f65
  rename to import_termos_categoria_categoria_rotulo_uidx;

alter table public.import_termos_estado
  drop constraint import_termos_estado_pkey,
  add constraint import_termos_estado_pkey primary key (empresa_id, termo);

create unique index import_termos_estado_estado_rotulo_uidx_f65
  on public.import_termos_estado (empresa_id, estado) where rotulo is not null;
drop index public.import_termos_estado_estado_rotulo_uidx;
alter index public.import_termos_estado_estado_rotulo_uidx_f65
  rename to import_termos_estado_estado_rotulo_uidx;

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   docs/f65-evidencias/impressao-catalogo.sql: as três PKs `(empresa_id, …)` e os dois parciais
--   `(empresa_id, categoria|estado) WHERE (rotulo IS NOT NULL)`, com os nomes de antes; impressao-tenant.sql: pk
--   `empresa_id,…` e chave `prefixo|termo` — relfilenode e md5 de (chave, xmin) IGUAIS aos do "antes".
--
-- ROLLBACK (supabase/rollback/F65-desfaz.sql, passo 6 — só onde a chave estiver na forma nova):
--   alter table public.import_prefixos_patrimonio drop constraint import_prefixos_patrimonio_pkey,
--     add constraint import_prefixos_patrimonio_pkey primary key (prefixo);
--   (idem as duas de termo, com `termo`); e os dois parciais de volta a `(categoria)`/`(estado) where rotulo is not null`,
--   pelo mesmo provisório → drop → rename.
