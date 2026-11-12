-- =============================================================================
-- 0183_comprimento_vocabulario.sql — F66B (12/11/2026): o comprimento vira regra do banco, o vocabulário
-- =============================================================================
-- classe: ADITIVA (15 CHECK de comprimento por add constraint, validados; nenhuma tupla reescrita, nada derrubado)
--
-- A F66B faz o BANCO recusar texto maior que o teto de cada coluna de texto das 20 tabelas de negócio. Até aqui só o Zod
-- limitava, e o Zod só guarda quem passa pela Server Action: a RPC chamada direto pela API, um script com service role
-- ou um caminho de tela sem `.max()` gravavam qualquer tamanho — e num banco compartilhado quem grava 500 MB derruba
-- todo mundo. Cada coluna ganha
--     <tabela>_<coluna>_tamanho  check (char_length(<coluna>) <= <teto>)
-- (docs/PLAN-F66B.md, decisão 3: sem `btrim` — é o limite do que se GUARDA; NULL passa, "a check constraint is
-- satisfied if the check expression evaluates to true or the null value", PG 17, ddl-constraints).
--
-- O TETO vem da FONTE ÚNICA, src/lib/validators/tetos-coluna.ts (a trava de mesa tetos-coluna.test.ts confere cada
-- literal abaixo contra ela, nos dois sentidos): ≥ o maior teto entre os caminhos que gravam na coluna (Zod,
-- LIMITES_CAMPO_PLANO), ≥ o maior valor vivo nos dois bancos, e, onde não há Zod, o degrau da escada
-- 40 · 80 · 120 · 200 · 320 · 500 · 2000 que cobre o dobro do vivo. A tabela-verdade coluna × caminho é o §2 do PLAN.
--
-- NADA MUDA PARA A WAP, POR CONSTRUÇÃO E POR MEDIÇÃO: nenhum teto fica abaixo do que um caminho com teto aceita hoje, e
-- a contagem de violação (scripts/comprimento/contagem-violacao.mts) dá 0 em toda coluna, nos dois bancos,
-- IMEDIATAMENTE antes deste lote — é o portão do apply. NENHUMA TUPLA É REESCRITA: `add constraint … check` varre a tabela
-- para validar e "does not require a table rewrite" (PG 17, sql-altertable) — a prova é o relfilenode das tabelas, igual
-- antes e depois (docs/f66b-evidencias/impressao-f66b.sql).
--
-- ESTE É O LOTE 3 — o VOCABULÁRIO — as tabelas na ordem da 0177 (a ordem de lock do app). Os outros lotes: 0181, 0182, 0184.
-- `add constraint … check` toma ACCESS EXCLUSIVE na tabela até o fim da transação (PG 17, sql-altertable: "most forms of
-- ADD table_constraint require an ACCESS EXCLUSIVE lock"), e o `apply_migration` do MCP é UMA transação — por isso um lote
-- por família, e UM `alter table` LITERAL por tabela com todas as constraints dela (as subcomandos de um mesmo
-- `alter table` "can thereby be combined into a single pass over the table"). Validado direto (sem `not valid`): com a
-- contagem 0, separar a validação não encurta o lock dentro de uma transação só. `lock_timeout` de 2 s por `set`/`reset`,
-- sem `begin`/`commit` (o molde F63–F66); sem o lock: registrar e repetir, no máximo três vezes em 30 min. Todo estado
-- entre dois lotes é repouso válido (umas tabelas com teto, outras sem: nada recusa o que se aceita hoje).
-- =============================================================================

set lock_timeout = '2s';

alter table public.import_prefixos_patrimonio
  add constraint import_prefixos_patrimonio_prefixo_tamanho check (char_length(prefixo) <= 4);

alter table public.import_termos_categoria
  add constraint import_termos_categoria_termo_tamanho check (char_length(termo) <= 40),
  add constraint import_termos_categoria_rotulo_tamanho check (char_length(rotulo) <= 40);

alter table public.import_termos_estado
  add constraint import_termos_estado_termo_tamanho check (char_length(termo) <= 40),
  add constraint import_termos_estado_rotulo_tamanho check (char_length(rotulo) <= 40);

alter table public.unidades_apelidos
  add constraint unidades_apelidos_apelido_bruto_tamanho check (char_length(apelido) <= 80),
  add constraint unidades_apelidos_apelido_chave_tamanho check (char_length(apelido_chave) <= 240);

alter table public.tipos_item
  add constraint tipos_item_slug_tamanho check (char_length(slug) <= 30),
  add constraint tipos_item_rotulo_tamanho check (char_length(rotulo) <= 60);

alter table public.motivos
  add constraint motivos_codigo_tamanho check (char_length(codigo) <= 40),
  add constraint motivos_rotulo_tamanho check (char_length(rotulo) <= 80);

alter table public.kits_modelos
  add constraint kits_modelos_nome_tamanho check (char_length(nome) <= 80);

alter table public.filiais
  add constraint filiais_slug_tamanho check (char_length(slug) <= 40),
  add constraint filiais_nome_tamanho check (char_length(nome) <= 80),
  add constraint filiais_cidade_tamanho check (char_length(cidade) <= 120);

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo e contagem) ----------
--   docs/f66b-evidencias/impressao-f66b.sql: as 15 constraints deste lote com o md5 do pg_get_constraintdef igual ao
--   do CI; o relfilenode das tabelas do lote IGUAL ao de antes; e a contagem de violação do lote seguinte (0) antes dele.
--
-- ROLLBACK (supabase/rollback/F66B-desfaz.sql, passo 2 de 4 — a ordem inversa do apply, 0184 → 0181): `drop constraint`
-- literal por nome, as tabelas na ordem inversa. Depois do rollback a defesa volta a ser só o Zod; nenhum dado se perde.
--   alter table public.filiais drop constraint if exists filiais_slug_tamanho, drop constraint if exists filiais_nome_tamanho, drop constraint if exists filiais_cidade_tamanho;
--   alter table public.kits_modelos drop constraint if exists kits_modelos_nome_tamanho;
--   alter table public.motivos drop constraint if exists motivos_codigo_tamanho, drop constraint if exists motivos_rotulo_tamanho;
--   alter table public.tipos_item drop constraint if exists tipos_item_slug_tamanho, drop constraint if exists tipos_item_rotulo_tamanho;
--   alter table public.unidades_apelidos drop constraint if exists unidades_apelidos_apelido_bruto_tamanho, drop constraint if exists unidades_apelidos_apelido_chave_tamanho;
--   alter table public.import_termos_estado drop constraint if exists import_termos_estado_termo_tamanho, drop constraint if exists import_termos_estado_rotulo_tamanho;
--   alter table public.import_termos_categoria drop constraint if exists import_termos_categoria_termo_tamanho, drop constraint if exists import_termos_categoria_rotulo_tamanho;
--   alter table public.import_prefixos_patrimonio drop constraint if exists import_prefixos_patrimonio_prefixo_tamanho;
