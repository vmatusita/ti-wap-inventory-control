-- =============================================================================
-- 0184_comprimento_registros.sql — F66B (12/11/2026): o comprimento vira regra do banco, os registros
-- =============================================================================
-- classe: ADITIVA (8 CHECK de comprimento por add constraint, validados; nenhuma tupla reescrita, nada derrubado)
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
-- ESTE É O LOTE 4 — os REGISTROS — as tabelas na ordem da 0178 (a ordem de lock do app). Os outros lotes: 0181, 0182, 0183.
-- `add constraint … check` toma ACCESS EXCLUSIVE na tabela até o fim da transação (PG 17, sql-altertable: "most forms of
-- ADD table_constraint require an ACCESS EXCLUSIVE lock"), e o `apply_migration` do MCP é UMA transação — por isso um lote
-- por família, e UM `alter table` LITERAL por tabela com todas as constraints dela (as subcomandos de um mesmo
-- `alter table` "can thereby be combined into a single pass over the table"). Validado direto (sem `not valid`): com a
-- contagem 0, separar a validação não encurta o lock dentro de uma transação só. `lock_timeout` de 2 s por `set`/`reset`,
-- sem `begin`/`commit` (o molde F63–F66); sem o lock: registrar e repetir, no máximo três vezes em 30 min. Todo estado
-- entre dois lotes é repouso válido (umas tabelas com teto, outras sem: nada recusa o que se aceita hoje).
-- =============================================================================

set lock_timeout = '2s';

alter table public.relatorios_gerados
  add constraint relatorios_gerados_observacao_tamanho check (char_length(observacao) <= 2000);

alter table public.import_logs
  add constraint import_logs_modo_tamanho check (char_length(modo) <= 40),
  add constraint import_logs_arquivo_hash_tamanho check (char_length(arquivo_hash) <= 128),
  add constraint import_logs_backup_path_tamanho check (char_length(backup_path) <= 120);

alter table public.eventos_admin
  add constraint eventos_admin_acao_tamanho check (char_length(acao) <= 80),
  add constraint eventos_admin_alvo_tamanho check (char_length(alvo) <= 500);

alter table public.senhas_acesso
  add constraint senhas_acesso_rotulo_tamanho check (char_length(rotulo) <= 80),
  add constraint senhas_acesso_hash_tamanho check (char_length(hash) <= 200);

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo e contagem) ----------
--   docs/f66b-evidencias/impressao-f66b.sql: as 8 constraints deste lote com o md5 do pg_get_constraintdef igual ao
--   do CI; o relfilenode das tabelas do lote IGUAL ao de antes; e a contagem de violação do lote seguinte (0) antes dele.
--
-- ROLLBACK (supabase/rollback/F66B-desfaz.sql, passo 1 de 4 — a ordem inversa do apply, 0184 → 0181): `drop constraint`
-- literal por nome, as tabelas na ordem inversa. Depois do rollback a defesa volta a ser só o Zod; nenhum dado se perde.
--   alter table public.senhas_acesso drop constraint if exists senhas_acesso_rotulo_tamanho, drop constraint if exists senhas_acesso_hash_tamanho;
--   alter table public.eventos_admin drop constraint if exists eventos_admin_acao_tamanho, drop constraint if exists eventos_admin_alvo_tamanho;
--   alter table public.import_logs drop constraint if exists import_logs_modo_tamanho, drop constraint if exists import_logs_arquivo_hash_tamanho, drop constraint if exists import_logs_backup_path_tamanho;
--   alter table public.relatorios_gerados drop constraint if exists relatorios_gerados_observacao_tamanho;
