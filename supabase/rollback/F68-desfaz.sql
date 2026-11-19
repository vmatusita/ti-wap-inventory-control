-- =====================================================================================================================
-- F68-desfaz.sql — o ROLLBACK da F68 (19/11/2026): a porta pública por empresa
-- =====================================================================================================================
-- Fora do ledger e da trava de hash (supabase/rollback/), ensaiado no CI por supabase/tests/f68_rollback.sql e, com a F68
-- no lugar, por todos os roteiros de rollback das fases anteriores (cada um roda este arquivo IMEDIATAMENTE antes do
-- F67C-desfaz.sql — src/lib/validators/rollback-f68.test.ts confere).
--
-- ⚠ A ORDEM ENTRE APP E BANCO: o app da v1.76.0 fala SÓ pelas funções que este arquivo derruba (a porta pública e a
-- gestão das senhas). Depois do rollback, o app novo NÃO FUNCIONA na porta nem na tela Senhas. Por isso:
--   1) PRIMEIRO o revert do PR de código da F68 e o deploy (o app volta a v1.75.0, que usa o service role e
--      `registrar_tentativa_senha` — que a F68 deixou de pé);
--   2) DEPOIS este arquivo, inteiro, pelo `execute_sql` do conector (ou pelo SQL Editor), nesta ordem.
--
-- A ORDEM INVERSA DO APPLY: 0212 → 0211 → 0210 → 0209 → 0208. Só catálogo do que a F68 criou: as seis funções, as duas
-- tabelas (vazias de dado de negócio — sessões e contadores, que morrem com elas) e a unique da 0208. Nenhuma linha de
-- negócio é tocada; as senhas de `senhas_acesso` (inclusive as bcrypt criadas depois do deploy) ficam como estão — uma
-- senha bcrypt não abre a porta antiga (scrypt), e o Johnny a revoga pela tela.
--
-- Idempotente: `if exists` em tudo — rodar duas vezes é igual a rodar uma.
-- =====================================================================================================================

set lock_timeout = '2s';

-- 0212 — as duas portas de anon e a projeção
drop function if exists public.relatorio_publico_dados(text, text, text, jsonb);
drop function if exists public.relatorio_publico_abrir(text, text, text);
drop function if exists public.relatorio_publico_projetar(jsonb, jsonb);

-- 0211 — a gestão das senhas por empresa
drop function if exists public.senha_acesso_definir_status(uuid, uuid, boolean);
drop function if exists public.senha_acesso_conferir(uuid, uuid, text);
drop function if exists public.senha_acesso_criar(uuid, text, text);

-- 0210 — o contador da porta
drop table if exists public.porta_tentativas;

-- 0209 — a sessão do visualizador (antes da 0208: a FK composta dela depende da unique)
drop table if exists public.sessoes_visualizador;

-- 0208 — a unique (empresa_id, id) de senhas_acesso (o conferidor do pgcrypto não deixou rastro)
alter table public.senhas_acesso drop constraint if exists senhas_acesso_empresa_id_uidx;

notify pgrst, 'reload schema';

reset lock_timeout;
