-- =====================================================================================================================
-- 0207_contracao_default_filiais.sql — F67C (16/11/2026): o fim do default — CONTRAÇÃO, filiais (a 20ª)
-- =====================================================================================================================
-- classe: ADITIVA (alter column … drop default: só catálogo — nenhum dado, nenhuma policy)
--
-- `filiais.empresa_id` ganhou a coluna na F62 (0155) com o mesmo `default public.empresa_legada()`. O único escritor é o
-- cadastro de filial da Administração (`criarFilial`), que desde a v1.75.0 diz a empresa da operação. Aqui o default sai:
-- nenhuma das 22 colunas `empresa_id` de `public` tem mais default (a 15l de catalogo_policies.sql, derivada do catálogo,
-- reprova qualquer uma que volte a ter — inclusive em tabela nova).
--
-- ⚠ ORDEM: em PRODUÇÃO, por último (depois da 0206 e da vigília dela). A trava que EXIGE a ausência é a 15c (invertida
-- neste mesmo commit) e a 15l.
-- =====================================================================================================================

set lock_timeout = '2s';

alter table public.filiais alter column empresa_id drop default;

notify pgrst, 'reload schema';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   pg_attrdef sem linha para nenhuma das 22 colunas empresa_id de public; a vigília final (≥ 30 min) sem 23502 em
--   empresa_id e sem falha de auditoria.registro-evento.
--
-- ROLLBACK (supabase/rollback/F67C-desfaz.sql, o bloco 0207 — o PRIMEIRO na ordem inversa 0207 → 0200): devolver a
-- filiais o default public.empresa_legada().
