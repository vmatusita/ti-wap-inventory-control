-- =============================================================================
-- 0182_comprimento_movimento_do_acervo.sql — F66B (12/11/2026): o comprimento vira regra do banco, o movimento do acervo
-- =============================================================================
-- classe: ADITIVA (32 CHECK de comprimento por add constraint, validados; nenhuma tupla reescrita, nada derrubado)
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
-- ESTE É O LOTE 2 — o MOVIMENTO do acervo — as tabelas na ordem da 0176 (a ordem de lock do app). Os outros lotes: 0181, 0183, 0184.
-- `add constraint … check` toma ACCESS EXCLUSIVE na tabela até o fim da transação (PG 17, sql-altertable: "most forms of
-- ADD table_constraint require an ACCESS EXCLUSIVE lock"), e o `apply_migration` do MCP é UMA transação — por isso um lote
-- por família, e UM `alter table` LITERAL por tabela com todas as constraints dela (as subcomandos de um mesmo
-- `alter table` "can thereby be combined into a single pass over the table"). Validado direto (sem `not valid`): com a
-- contagem 0, separar a validação não encurta o lock dentro de uma transação só. `lock_timeout` de 2 s por `set`/`reset`,
-- sem `begin`/`commit` (o molde F63–F66); sem o lock: registrar e repetir, no máximo três vezes em 30 min. Todo estado
-- entre dois lotes é repouso válido (umas tabelas com teto, outras sem: nada recusa o que se aceita hoje).
-- =============================================================================

set lock_timeout = '2s';

alter table public.ativos
  add constraint ativos_patrimonio_tamanho check (char_length(patrimonio) <= 60),
  add constraint ativos_patrimonio_original_tamanho check (char_length(patrimonio_original) <= 60),
  add constraint ativos_marca_tamanho check (char_length(marca) <= 60),
  add constraint ativos_modelo_tamanho check (char_length(modelo) <= 120),
  add constraint ativos_service_tag_tamanho check (char_length(service_tag) <= 100),
  add constraint ativos_hostname_tamanho check (char_length(hostname) <= 60),
  add constraint ativos_memoria_tamanho check (char_length(memoria) <= 80),
  add constraint ativos_armazenamento_tamanho check (char_length(armazenamento) <= 80),
  add constraint ativos_processador_tamanho check (char_length(processador) <= 80),
  add constraint ativos_fornecedor_tamanho check (char_length(fornecedor) <= 80),
  add constraint ativos_colaborador_atual_tamanho check (char_length(colaborador_atual) <= 120),
  add constraint ativos_setor_atual_tamanho check (char_length(setor_atual) <= 120),
  add constraint ativos_pendencia_tamanho check (char_length(pendencia) <= 200),
  add constraint ativos_origem_tamanho check (char_length(origem) <= 40),
  add constraint ativos_observacoes_tamanho check (char_length(observacoes) <= 2000),
  add constraint ativos_telefone_tamanho check (char_length(telefone) <= 60),
  add constraint ativos_imei_tamanho check (char_length(imei) <= 60),
  add constraint ativos_pulsus_tamanho check (char_length(pulsus) <= 60);

alter table public.movimentacoes
  add constraint movimentacoes_motivo_tamanho check (char_length(motivo) <= 40),
  add constraint movimentacoes_colaborador_tamanho check (char_length(colaborador) <= 120),
  add constraint movimentacoes_setor_tamanho check (char_length(setor) <= 120),
  add constraint movimentacoes_chamado_tamanho check (char_length(chamado) <= 80),
  add constraint movimentacoes_observacao_tamanho check (char_length(observacao) <= 500),
  add constraint movimentacoes_chamado_fornecedor_tamanho check (char_length(chamado_fornecedor) <= 200);

alter table public.pendencias_item
  add constraint pendencias_item_item_tamanho check (char_length(item) <= 80),
  add constraint pendencias_item_colaborador_tamanho check (char_length(colaborador) <= 120),
  add constraint pendencias_item_status_tamanho check (char_length(status) <= 40),
  add constraint pendencias_item_desfecho_tamanho check (char_length(desfecho) <= 40),
  add constraint pendencias_item_observacao_tamanho check (char_length(observacao) <= 500);

alter table public.lancamentos_item
  add constraint lancamentos_item_chamado_tamanho check (char_length(chamado) <= 20),
  add constraint lancamentos_item_colaborador_tamanho check (char_length(colaborador) <= 120),
  add constraint lancamentos_item_observacao_tamanho check (char_length(observacao) <= 2000);

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo e contagem) ----------
--   docs/f66b-evidencias/impressao-f66b.sql: as 32 constraints deste lote com o md5 do pg_get_constraintdef igual ao
--   do CI; o relfilenode das tabelas do lote IGUAL ao de antes; e a contagem de violação do lote seguinte (0) antes dele.
--
-- ROLLBACK (supabase/rollback/F66B-desfaz.sql, passo 3 de 4 — a ordem inversa do apply, 0184 → 0181): `drop constraint`
-- literal por nome, as tabelas na ordem inversa. Depois do rollback a defesa volta a ser só o Zod; nenhum dado se perde.
--   alter table public.lancamentos_item drop constraint if exists lancamentos_item_chamado_tamanho, drop constraint if exists lancamentos_item_colaborador_tamanho, drop constraint if exists lancamentos_item_observacao_tamanho;
--   alter table public.pendencias_item drop constraint if exists pendencias_item_item_tamanho, drop constraint if exists pendencias_item_colaborador_tamanho, drop constraint if exists pendencias_item_status_tamanho, drop constraint if exists pendencias_item_desfecho_tamanho, drop constraint if exists pendencias_item_observacao_tamanho;
--   alter table public.movimentacoes drop constraint if exists movimentacoes_motivo_tamanho, drop constraint if exists movimentacoes_colaborador_tamanho, drop constraint if exists movimentacoes_setor_tamanho, drop constraint if exists movimentacoes_chamado_tamanho, drop constraint if exists movimentacoes_observacao_tamanho, drop constraint if exists movimentacoes_chamado_fornecedor_tamanho;
--   alter table public.ativos drop constraint if exists ativos_patrimonio_tamanho, drop constraint if exists ativos_patrimonio_original_tamanho, drop constraint if exists ativos_marca_tamanho, drop constraint if exists ativos_modelo_tamanho, drop constraint if exists ativos_service_tag_tamanho, drop constraint if exists ativos_hostname_tamanho, drop constraint if exists ativos_memoria_tamanho, drop constraint if exists ativos_armazenamento_tamanho, drop constraint if exists ativos_processador_tamanho, drop constraint if exists ativos_fornecedor_tamanho, drop constraint if exists ativos_colaborador_atual_tamanho, drop constraint if exists ativos_setor_atual_tamanho, drop constraint if exists ativos_pendencia_tamanho, drop constraint if exists ativos_origem_tamanho, drop constraint if exists ativos_observacoes_tamanho, drop constraint if exists ativos_telefone_tamanho, drop constraint if exists ativos_imei_tamanho, drop constraint if exists ativos_pulsus_tamanho;
