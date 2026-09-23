-- =============================================================================
-- 0165_pais_do_tenant.sql — F65 (23/09/2026): `unique (empresa_id, id)` nos sete pais de negócio
-- =============================================================================
-- classe: ADITIVA (sete constraints unique novas; nenhuma tupla reescrita, nenhum dado tocado)
--
-- A F65 troca as 23 FKs entre tabelas de negócio por FKs COMPOSTAS `(empresa_id, x) → (empresa_id, id)` (0166, 0167,
-- 0168): é a camada que faz o banco recusar, sozinho, um filho de uma empresa pendurado num pai de outra — mesmo sem
-- policy nenhuma. O Postgres só aceita a FK composta se o PAI tiver um unique (ou PK) EXATAMENTE sobre as colunas
-- referenciadas. `filiais` o tem desde a F62 (`filiais_empresa_id_uidx`, 0155); esta migration o dá aos outros sete pais
-- das 23 FKs (fato 5 da ordem): `ativos`, `movimentacoes`, `pendencias_item`, `lancamentos_item`, `colaboradores`,
-- `itens`, `tipos_item`. `motivos` não entra: o alvo da FK dele é a PK nova `(empresa_id, codigo)` (0168).
--
-- A FORMA É A DA 0155: `alter table … add constraint <tabela>_empresa_id_uidx unique (empresa_id, id)` — constraint, não
-- índice solto, com o mesmo sufixo. Parece redundante (`id` já é PK) e não é: sem ele, o `add constraint … foreign key
-- (empresa_id, x) references <pai> (empresa_id, id)` falha com "there is no unique constraint matching given keys".
-- `empresa_id` é `not null` nas sete (F63/F64) e `id` é a PK: a validação do unique não encontra duplicata por
-- construção (a contagem do "antes", docs/f65-evidencias/contagem-violacoes.sql, deu 0 nos dois bancos).
--
-- NENHUMA TUPLA É REESCRITA: `add constraint … unique` constrói um índice NOVO (outro arquivo) varrendo a tabela; o
-- arquivo da tabela (`relfilenode`) e as tuplas (`xmin`) ficam iguais — a prova é a impressão
-- docs/f65-evidencias/impressao-tenant.sql antes × depois, nos dois bancos.
--
-- O LOCK: `ADD CONSTRAINT … UNIQUE` toma ACCESS EXCLUSIVE na tabela (doc do PG 17, sql-altertable) pelo tempo de
-- construir o índice — milissegundos nestas tabelas (a maior, `movimentacoes`, tem 3.631 linhas em produção). A ORDEM é a
-- em que o caminho de escrita do app toma os locks (o molde da 0161): `ativos` → `movimentacoes` → `pendencias_item` →
-- `lancamentos_item`, e depois os cadastros que eles referenciam (`colaboradores`, `itens`, `tipos_item`). `lock_timeout`
-- de 2 s por `set`/`reset`, sem `begin`/`commit` (o `apply_migration` do MCP é UMA transação; no CI, `psql -f` sem `-1`).
-- Se o lock não vier: registrar e repetir, no máximo três vezes em 30 min; nunca subir o timeout nem matar sessão.
--
-- NENHUM ÍNDICE DE LISTA (decisão 1 do Johnny): os índices liderados por `empresa_id` para as listas são da F66. Estes
-- sete são os que a INTEGRIDADE exige, e nada mais.
-- =============================================================================

set lock_timeout = '2s';

alter table public.ativos
  add constraint ativos_empresa_id_uidx unique (empresa_id, id);

alter table public.movimentacoes
  add constraint movimentacoes_empresa_id_uidx unique (empresa_id, id);

alter table public.pendencias_item
  add constraint pendencias_item_empresa_id_uidx unique (empresa_id, id);

alter table public.lancamentos_item
  add constraint lancamentos_item_empresa_id_uidx unique (empresa_id, id);

alter table public.colaboradores
  add constraint colaboradores_empresa_id_uidx unique (empresa_id, id);

alter table public.itens
  add constraint itens_empresa_id_uidx unique (empresa_id, id);

alter table public.tipos_item
  add constraint tipos_item_empresa_id_uidx unique (empresa_id, id);

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   docs/f65-evidencias/impressao-catalogo.sql: `pais.tabelas_com_empresa_id_id` = 8 (filiais + as sete);
--   docs/f65-evidencias/impressao-tenant.sql antes × depois: relfilenode e md5 de (chave, xmin) IGUAIS nas sete.
--
-- ROLLBACK (supabase/rollback/F65-desfaz.sql, passo 9 — o ÚLTIMO, depois de desfazer as FKs compostas):
--   alter table public.ativos           drop constraint if exists ativos_empresa_id_uidx;
--   alter table public.movimentacoes    drop constraint if exists movimentacoes_empresa_id_uidx;
--   alter table public.pendencias_item  drop constraint if exists pendencias_item_empresa_id_uidx;
--   alter table public.lancamentos_item drop constraint if exists lancamentos_item_empresa_id_uidx;
--   alter table public.colaboradores    drop constraint if exists colaboradores_empresa_id_uidx;
--   alter table public.itens            drop constraint if exists itens_empresa_id_uidx;
--   alter table public.tipos_item       drop constraint if exists tipos_item_empresa_id_uidx;
