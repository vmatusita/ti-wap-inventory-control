-- =============================================================================
-- 0174_colaboradores_nome_chave_pos_deploy.sql — F65 (23/09/2026): o PASSO PÓS-DEPLOY — o unique do colaborador SÓ por empresa
-- =============================================================================
-- classe: ADITIVA (um índice derrubado sem `cascade` e um renomeado; nenhuma tupla reescrita, nenhum dado tocado)
--
-- ██████████████████████████████████████████████████████████████████████████████████████████████████████████████████
-- ██  ESTA MIGRATION SÓ SE APLICA NOS BANCOS VIVOS DEPOIS DO DEPLOY DA 1.70.0 — quando `/api/saude` mostrar o commit ██
-- ██  do merge (Frente G, passo 9). Ela entra no MESMO PR e roda no CI com as outras; só o apply espera. Aplicada     ██
-- ██  com o app velho no ar, o "Consolidar colaboradores" dele (`ON CONFLICT (nome_chave)`) falharia com 42P10.       ██
-- ██████████████████████████████████████████████████████████████████████████████████████████████████████████████████
--
-- O segundo passo da decisão 5 (PLAN-F65.md; o primeiro é a 0172): com o app novo no ar — que grava com
-- `onConflict: 'empresa_id,nome_chave'` —, o unique global `colaboradores_nome_chave_uidx (nome_chave)` sai, e o por
-- empresa (`colaboradores_nome_chave_uidx_f65`, `(empresa_id, nome_chave)`) recebe o NOME CONTRATUAL: o 23505 de
-- colaborador duplicado continua traduzido por `CONSTRAINTS_TRADUZIDAS` pelo nome. A partir daqui, dois colaboradores de
-- mesmo nome normalizado coexistem em empresas diferentes; na mesma empresa, o segundo é recusado.
--
-- SE ESTA MIGRATION NÃO FOR APLICADA (barrada, ou o projeto parar antes), o estado da 0172 é repouso válido: os dois
-- uniques, o global decidindo. A sonda de deriva (`scripts/smoke/deriva-migrations.mjs`) cobra o arquivo fora do ledger
-- em até 24 h — e o alarme fecha sozinho na Parte B seguinte ao apply.
--
-- O LOCK: `colaboradores` (41 linhas em produção); DROP INDEX e ALTER INDEX … RENAME tomam ACCESS EXCLUSIVE por
-- milissegundos. `lock_timeout` de 2 s por `set`/`reset`, sem `begin`/`commit`.
-- =============================================================================

set lock_timeout = '2s';

drop index public.colaboradores_nome_chave_uidx;
alter index public.colaboradores_nome_chave_uidx_f65 rename to colaboradores_nome_chave_uidx;

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   select pg_get_indexdef('public.colaboradores_nome_chave_uidx'::regclass);
--   esperado: CREATE UNIQUE INDEX colaboradores_nome_chave_uidx ON public.colaboradores USING btree (empresa_id, nome_chave)
--   e nenhum `colaboradores_nome_chave_uidx_f65`; o "Consolidar colaboradores" do app no ar funcionando.
--
-- ROLLBACK (supabase/rollback/F65-desfaz.sql, passo 1 — o PRIMEIRO do rollback da fase, e só se o índice com o nome
-- contratual estiver na forma por empresa):
--   alter index public.colaboradores_nome_chave_uidx rename to colaboradores_nome_chave_uidx_f65;
--   create unique index colaboradores_nome_chave_uidx on public.colaboradores (nome_chave);
