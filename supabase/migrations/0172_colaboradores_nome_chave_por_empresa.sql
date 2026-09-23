-- =============================================================================
-- 0172_colaboradores_nome_chave_por_empresa.sql — F65 (23/09/2026): o unique do colaborador por empresa, AO LADO do global
-- =============================================================================
-- classe: ADITIVA (um índice único novo; nenhuma tupla reescrita, nenhum índice derrubado)
--
-- O ÚNICO `ON CONFLICT` QUE A FASE QUEBRARIA (fato 10). "Consolidar colaboradores" (`consolidarColaboradores`,
-- src/lib/actions/colaboradores.ts) grava com `.upsert(…, { onConflict: 'nome_chave', ignoreDuplicates: true })` —
-- `INSERT … ON CONFLICT (nome_chave) DO NOTHING`. A inferência do Postgres escolhe o unique que tem EXATAMENTE aquelas
-- colunas (doc do PG 17, sql-insert: "without regard to order, contain exactly the conflict_target-specified
-- columns"); no instante em que `colaboradores_nome_chave_uidx` virasse `(empresa_id, nome_chave)`, o `ON CONFLICT
-- (nome_chave)` não teria mais unique para inferir e falharia com 42P10 — no app VELHO, que fica no ar entre o apply e o
-- deploy (~8 min na F64).
--
-- JANELA ZERO, EM DOIS PASSOS (PLAN-F65.md, decisão 5):
--   · ESTE, antes do merge: o unique por empresa nasce AO LADO do global, com o nome PROVISÓRIO
--     `colaboradores_nome_chave_uidx_f65` (que CONTÉM o nome contratual). O app velho (`ON CONFLICT (nome_chave)`) infere
--     o global; o novo (`onConflict: 'empresa_id,nome_chave'`, no mesmo commit desta migration) infere este. O global,
--     mais estrito, segue decidindo: com uma empresa só, toda duplicata do global também é deste, e o `DO NOTHING` do
--     arbitrador a pega antes de o outro índice ser tocado. Um INSERT comum que duplique (`criarColaborador`) cita um dos
--     dois índices na mensagem, e os dois nomes contêm `colaboradores_nome_chave_uidx` — a tradução pelo nome não quebra.
--     ESTE ESTADO INTERMEDIÁRIO É REPOUSO VÁLIDO (se o projeto parar aqui, nada quebra).
--   · A 0174, DEPOIS do deploy: derruba o global e dá ao por empresa o nome contratual.
--
-- `empresa_id` primeiro (a forma da 0170). Com uma empresa só, `nome_chave` já era único — o índice novo não encontra
-- duplicata (a contagem do "antes" deu 0, nos dois bancos). O LOCK: `colaboradores` tem 41 linhas em produção; CREATE
-- UNIQUE INDEX toma SHARE (bloqueia escrita, não leitura) por milissegundos. `lock_timeout` de 2 s por `set`/`reset`, sem
-- `begin`/`commit`; se o lock não vier: registrar e repetir, no máximo três vezes em 30 min.
-- =============================================================================

set lock_timeout = '2s';

create unique index colaboradores_nome_chave_uidx_f65 on public.colaboradores (empresa_id, nome_chave);

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   docs/f65-evidencias/impressao-catalogo.sql: `colaboradores_nome_chave_uidx` (nome_chave) E
--   `colaboradores_nome_chave_uidx_f65` (empresa_id, nome_chave), os dois; impressao-tenant.sql: relfilenode e md5 de
--   (chave, xmin) de `colaboradores` IGUAIS aos do "antes".
--
-- ROLLBACK (supabase/rollback/F65-desfaz.sql, passo 3 — depois de desfazer a 0174, se ela foi aplicada):
--   drop index if exists public.colaboradores_nome_chave_uidx_f65;
--   (e o TS: `git revert` — o `onConflict` volta a 'nome_chave', que o global, de pé, infere)
