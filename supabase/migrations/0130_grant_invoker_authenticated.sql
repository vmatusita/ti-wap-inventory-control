-- Migration 0130 — o `grant` que faltava ao lado dos cinco `revoke` da 0129 (F50).
--
-- Cinco `grant execute … to authenticated`. Não cria nada, não apaga nada, não muda
-- policy nem função. Em PRODUÇÃO é no-op — o grant já existe lá. No banco do CI, é o
-- que devolve o acesso que a 0129 tirou sem querer.
--
-- ---------------------------------------------------------------------------
-- O DEFEITO, E POR QUE ELE SÓ APARECEU NO CI
-- ---------------------------------------------------------------------------
-- A 0129 revogou `execute` de `public, anon` nas cinco funções INVOKER do achado F48
-- §8.2. O `public` ali é obrigatório: `anon` alcançava as funções por DOIS caminhos —
-- o grant próprio e a herança do pseudo-papel PUBLIC —, e revogar só o primeiro era
-- no-op silencioso (medido em produção, antes do apply).
--
-- O que a 0129 não fez foi a OUTRA metade do par: reconceder a `authenticated`.
--
--   · Em PRODUÇÃO isso não teve efeito. O Supabase concede explicitamente a
--     `anon`/`authenticated`/`service_role` ao criar objeto em `public`, então a ACL
--     das cinco já trazia `authenticated=X/postgres` — um grant PRÓPRIO, que revogar
--     PUBLIC não alcança. Conferido depois do apply: `auth_executa = true` nas cinco.
--
--   · No banco do CI, construído a partir das migrations mais o bootstrap declarado
--     em `supabase/ci/`, esse grant explícito NÃO existe. Lá `authenticated` alcançava
--     as cinco SÓ pela herança de PUBLIC — e a 0129 cortou exatamente essa herança.
--     Resultado: `conflito_filiais.sql` morreu com
--     "ERROR: permission denied for function chave_identidade_ativo".
--
-- É uma divergência CI × produção que o CI existe para pegar, e pegou. A lição está
-- escrita porque ela vale para toda migration futura que revogue de PUBLIC: **o
-- `revoke` de PUBLIC e o `grant` explícito são um PAR**, e a `0069` já os escrevia
-- juntos (`revoke all … from public, anon` seguido de `grant execute … to authenticated`,
-- linhas 331-332). Seguir metade do molde produz um resultado que parece certo no
-- banco onde os grants implícitos existem, e quebra no banco onde não existem.
--
-- ⚠ POR QUE UMA MIGRATION NOVA, E NÃO UMA CORREÇÃO NA 0129. A 0129 já foi APLICADA em
-- produção (08/09/2026). Migration aplicada nunca se edita (CLAUDE.md · Convenções ·
-- Banco), e desde a F46 isso é defesa executável: `migrations.lock.json` trava o
-- sha256 e `npm run test` reprova. A saída que a própria mensagem do `db:lock`
-- indica para este caso é esta — uma migration NOVA com o que se queria mudar.
--
-- `service_role` não precisa de linha: tem `rolbypassrls`, o grant explícito do
-- Supabase em produção, e não executa roteiro nenhum no CI.

grant execute on function public.chave_identidade_ativo(text, text) to authenticated;
grant execute on function public.hoje_brt() to authenticated;
grant execute on function public.mov_da_carga_import(text) to authenticated;
grant execute on function public.status_apos_movimentacao(public.status_ativo, public.tipo_movimentacao) to authenticated;
grant execute on function public.valida_lancamento_item() to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- as cinco: `authenticated` executa, `anon` NÃO — o estado que a 0129 queria:
--   select p.proname,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth_executa,
--          has_function_privilege('anon', p.oid, 'execute')          as anon_executa
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('chave_identidade_ativo','hoje_brt','mov_da_carga_import',
--                        'status_apos_movimentacao','valida_lancamento_item')
--    order by 1;
--   -- esperado: 5 linhas, auth_executa = true e anon_executa = false em TODAS
--
-- ---------- REVERSÃO ----------
--   revoke execute on function public.chave_identidade_ativo(text, text) from authenticated;
--   revoke execute on function public.hoje_brt() from authenticated;
--   revoke execute on function public.mov_da_carga_import(text) from authenticated;
--   revoke execute on function public.status_apos_movimentacao(public.status_ativo, public.tipo_movimentacao) from authenticated;
--   revoke execute on function public.valida_lancamento_item() from authenticated;
--   ⚠ Reverter isto QUEBRA o banco do CI (é o que este arquivo conserta). Só faz
--   sentido acompanhado da reversão da 0129.
