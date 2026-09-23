-- =============================================================================
-- 0159_backups_migration.sql — F63 (23/09/2026): o par de backup das migrations que alteram dado
-- =============================================================================
-- classe: ADITIVA (tabela nova, vazia; nenhuma escrita em tabela que já existia)
--
-- POR QUE ELA EXISTE. Até aqui, migration que muda dado vivo seguia um protocolo À MÃO: a `0111`
-- (F36) fez `update public.ativos` em 4 linhas com o backup delas FORA do repositório (tinham
-- nome real), um dry-run em transação desfeita e a contagem antes e depois. Nada no banco
-- guardava o valor anterior, e nada no repositório exigia que alguém o guardasse. Esta tabela é
-- esse protocolo virando dado, e o classificador (`scripts/db/classificar-migration.mjs`) é quem
-- o exige: a partir desta migration, todo comando que SOBRESCREVE valor de tabela que já existia
-- (update, insert … on conflict do update) tem de vir DEPOIS do bloco canônico
--
--     insert into public.backups_migration (migration, tabela, coluna, chave, valor_anterior)
--     select '<este arquivo>.sql', 'public.x', 'coluna', t.id::text, to_jsonb(t.coluna)
--       from public.x t
--      where <W>;
--     update public.x t set coluna = … where <W>;      -- o MESMO where, byte a byte
--
-- e o rodapé traz o rollback que restaura a partir daqui (receita em `docs/RUNBOOK-BANCO.md`).
--
-- O PAR, NÃO A LINHA (fato 16 da ordem F63). O projeto é Free (500 MB): `to_jsonb` da linha
-- inteira de 1.649 ativos são 1 a 2 MB por backfill; o par (chave, valor anterior) de UMA coluna
-- é ~150 bytes por linha — um backfill de uma coluna no acervo inteiro de produção (5.684 linhas)
-- fica em ~1 MB. `valor_anterior` é `to_jsonb(<alias>.<coluna>)`: SQL NULL quer dizer que o valor
-- ERA null, e o rollback devolve o tipo certo por `jsonb_populate_record`.
--
-- FECHADA NO MOLDE DE `public.ambiente` (0090): RLS ligada, ZERO policy e `revoke all` de `anon`,
-- `authenticated` e `service_role` — invisível e intocável pela API. Quem ESCREVE é a migration
-- (roda como o dono); quem LÊ é o rollback (idem). Sem `force row level security` (R-ACC-29/72).
-- No catálogo: `k_infra` + `k_sem_select` (catalogo_policies.sql), e o advisor de segurança ganha
-- UM INFO `rls_enabled_no_policy`, declarado.
--
-- RETENÇÃO: o par fica até uma migration DESTRUTIVA nomeada apagar os de uma migration cujo
-- rollback deixou de fazer sentido — no mínimo 90 dias depois do apply em produção. Ninguém do
-- app lê nem escreve.
-- =============================================================================

create table public.backups_migration (
  id             bigint generated always as identity primary key,
  migration      text        not null,
  tabela         text        not null,
  coluna         text        not null,
  chave          text        not null,
  valor_anterior jsonb,
  gravado_em     timestamptz not null default now(),
  constraint backups_migration_migration_formato check (migration ~ '^[0-9]{4}_[a-z0-9_]+\.sql$'),
  constraint backups_migration_tabela_formato    check (tabela ~ '^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$'),
  constraint backups_migration_coluna_formato    check (coluna ~ '^[a-z_][a-z0-9_]*$'),
  -- um valor anterior por célula: o rollback é determinístico
  constraint backups_migration_par_uidx unique (migration, tabela, coluna, chave)
);

comment on table public.backups_migration is
  'F63 (0159): o PAR DE BACKUP das migrations que alteram dado vivo — (chave, valor_anterior) por coluna alterada, não a linha inteira. Quem ESCREVE é a migration de classe BACKFILL, no bloco canônico que o classificador (scripts/db/classificar-migration.mjs) exige antes de cada comando que sobrescreve valor; quem LÊ é o rollback do rodapé dela. RLS ligada, zero policy, revoke all de anon/authenticated/service_role (molde de public.ambiente): nada no app lê nem escreve. Retenção: até uma migration DESTRUTIVA nomeada apagar os pares, no mínimo 90 dias depois do apply em produção.';
comment on column public.backups_migration.migration is
  'O nome EXATO do arquivo da migration que gravou o par (o classificador reprova o literal de outro arquivo — o bloco copiado).';
comment on column public.backups_migration.chave is
  'O id da linha alterada, como texto (uuid, smallint, bigint): o rollback casa por b.chave = t.id::text.';
comment on column public.backups_migration.valor_anterior is
  'to_jsonb(<alias>.<coluna>) ANTES do comando. SQL NULL = o valor era null. O rollback devolve o tipo certo por jsonb_populate_record(null::<tabela>, jsonb_build_object(<coluna>, valor_anterior)).';

alter table public.backups_migration enable row level security;
-- Sem NENHUMA policy: invisível para anon e authenticated. Só o dono enxerga — o mesmo idioma de
-- `ambiente`, `senhas_acesso` e `senha_tentativas`.
revoke all on public.backups_migration from anon, authenticated, service_role;
revoke all on sequence public.backups_migration_id_seq from anon, authenticated, service_role;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   docs/f63-evidencias/verificacao-pos-apply.sql, bloco `backups_migration`:
--   rls = true · force = false · policies = 0 · linhas = 0 · privilégios 00000 nos três papéis.
--
-- ROLLBACK (a ordem inteira da fase: supabase/rollback/F63-desfaz.sql, passo 3, DEPOIS de
-- desfazer a 0161 e a 0160): `drop table public.backups_migration;` — só com a tabela VAZIA (o
-- arquivo de rollback recusa com 55000 se houver par gravado: o rollback da migration que o
-- gravou vem antes).
