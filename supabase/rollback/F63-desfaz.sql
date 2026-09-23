-- =============================================================================
-- F63-desfaz.sql — o ROLLBACK da F63 (docs/PLAN-F63.md §5)
-- =============================================================================
-- Desfaz as três migrations da F63 NA ORDEM INVERSA DO APPLY: 0161 → 0160 → 0159.
--   1. (0161) `empresa_id` sai de movimentacoes, lancamentos_item, ativos, pendencias_item;
--   2. (0160) `empresa_id` sai de colaboradores, itens, termos_gerados, anotacoes;
--   3. (0159) `public.backups_migration` sai — SÓ SE ESTIVER VAZIA (uma migration posterior que
--      tenha gravado o par de backup nela torna este passo o fim do rollback DELA; o bloco
--      abaixo recusa com a mensagem, em vez de apagar o único caminho de volta de outra fase).
-- Dentro de cada migration, as tabelas saem na MESMA ordem do apply, que é a ordem em que o app
-- toma os locks (a movimentação trava `movimentacoes` e o gatilho chega a `ativos` e a
-- `pendencias_item`): tomar na mesma ordem evita o ciclo de espera com uma escrita em curso.
--
-- `drop column` NÃO reescreve a tabela: a coluna fica no `pg_attribute` com `attisdropped` (é
-- assim que o Postgres a apaga), e a FK e o comentário caem junto. `if exists` em tudo: serve ao
-- apply parcial (no CI cada `alter` confirma sozinho) e ao arquivo rodado duas vezes.
--
-- ENTRE FASES: o rollback da F62 (`F62-1-copia-de-volta.sql` + `F62-2-desfaz.sql`) EXIGE este
-- ANTES — a F62 derruba `empresas` e `empresa_legada()`, e a F63 pendura nelas oito FKs e oito
-- defaults. É o inverso do apply entre fases (regra 10 da §4 do PLANO-MULTIEMPRESA).
--
-- Sem `begin`/`commit` próprios: quem roda decide a transação (o roteiro
-- `supabase/tests/f63_rollback.sql` roda dentro da dele, e é o ensaio deste arquivo no Postgres
-- do CI; num banco vivo, o `execute_sql` do MCP com o conteúdo EXATO deste arquivo, ou o SQL
-- Editor com `begin; … commit;` em volta). O ledger (`supabase_migrations.schema_migrations`)
-- NÃO é reescrito: a linha das três fica, e a sonda de deriva continua vendo o nome aplicado.
-- =============================================================================

set lock_timeout = '2s';

-- 1. (0161) o acervo quente
alter table public.movimentacoes    drop column if exists empresa_id;
alter table public.lancamentos_item drop column if exists empresa_id;
alter table public.ativos           drop column if exists empresa_id;
alter table public.pendencias_item  drop column if exists empresa_id;

-- 2. (0160) os cadastros
alter table public.colaboradores  drop column if exists empresa_id;
alter table public.itens          drop column if exists empresa_id;
alter table public.termos_gerados drop column if exists empresa_id;
alter table public.anotacoes      drop column if exists empresa_id;

-- 3. (0159) a tabela do par de backup — só vazia
do $f63rb$
begin
  if to_regclass('public.backups_migration') is not null then
    if exists (select 1 from public.backups_migration) then
      raise exception 'F63-desfaz: public.backups_migration tem pares de backup gravados — o rollback da migration que os gravou vem ANTES deste passo'
        using errcode = '55000';
    end if;
  end if;
end
$f63rb$;
drop table if exists public.backups_migration;

reset lock_timeout;
