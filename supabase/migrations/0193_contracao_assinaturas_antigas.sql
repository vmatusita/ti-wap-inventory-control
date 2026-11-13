-- =============================================================================
-- 0193_contracao_assinaturas_antigas.sql — F67 (13/11/2026): a CONTRAÇÃO — as assinaturas sem empresa saem
-- =============================================================================
-- classe: ADITIVA (drop function, sem cascade e sem if exists, de 21 funções que nada mais chama; nenhuma tabela, policy,
--         view ou linha muda)
--
-- A metade "contrair" da receita "trocar a ASSINATURA sem trocar o NOME" (RUNBOOK, Anexo F67; decisão 13/11-2 do Johnny,
-- molde F60). As 0189–0191 criaram, ao lado de cada antiga, a forma com `p_empresa uuid` como 1º parâmetro; o app novo
-- chama SÓ as novas. Esta migration derruba as ANTIGAS:
--
--   as cinco de conta        apagar_usuario(uuid) · definir_papel_usuario(uuid, papel_usuario) · definir_status_usuario(uuid,
--                            boolean) · definir_vinculos_usuario(uuid, smallint[]) · encerrar_sessoes_usuario(uuid)
--   as auxiliares de conta   exigir_gestao_de(uuid, papel_usuario) · mesmo_escopo_de_gestao(uuid)
--   a Zona destrutiva        apagar_ativo(uuid, text, text) · apagar_item(smallint, text, text) · apagar_movimentacao(uuid,
--                            text, text) · forcar_estado_ativo(uuid, status_ativo, text) · forcar_saldo_item(smallint,
--                            smallint, integer, text) · previa_reset(text, smallint) · resetar_acervo(smallint, text, text,
--                            text, jsonb) · resetar_itens(smallint, text, text, text, jsonb)
--   as auxiliares da Zona    exigir_dev_para_destruir(text) · rotulo_alcance_reset(smallint)
--   a mesa e o import        apagar_ativos_conflito_filiais(uuid[], text, text, text) · exigir_ativos_da_empresa(uuid[]) ·
--                            importar_ativos_substituir(jsonb, text, jsonb, jsonb)
--   o cargo dev sem empresa  e_dev() — depois da 0186 e da 0187 nenhum corpo, policy ou chamada TS a usa (decisão 2).
--
-- QUANDO. No CI e no ENSAIO, na ordem da cadeia (o ensaio não tem app de produção). Em PRODUÇÃO, a ÚLTIMA coisa da fase:
-- depois do merge, do deploy (/api/saude com a versão nova e o commit do merge), da prova ESTÁTICA (`git grep` de toda
-- chamada às antigas em src/** e scripts/**, vazio) e da janela do `pg_stat_statements` (T0, ≥ 30 min, T1: Δ = 0 das
-- antigas em authenticated, service_role e anon, `dealloc` e `stats_reset` iguais). `drop function` antes disso é 404 do
-- PostgREST (PGRST202) na cara de quem tiver a versão velha aberta.
--
-- SEM `if exists` (uma antiga que não existe é apply fora de ordem — tem de falhar ALTO) e SEM `cascade` (o Postgres não
-- registra dependência de CORPO de função; uma dependência de policy ou view que aparecesse tem de falhar alto, não levar
-- junto). `drop function` toma lock só na função.
-- =============================================================================

set lock_timeout = '2s';

drop function public.apagar_usuario(uuid);
drop function public.definir_papel_usuario(uuid, public.papel_usuario);
drop function public.definir_status_usuario(uuid, boolean);
drop function public.definir_vinculos_usuario(uuid, smallint[]);
drop function public.encerrar_sessoes_usuario(uuid);
drop function public.exigir_gestao_de(uuid, public.papel_usuario);
drop function public.mesmo_escopo_de_gestao(uuid);

drop function public.apagar_ativo(uuid, text, text);
drop function public.apagar_item(smallint, text, text);
drop function public.apagar_movimentacao(uuid, text, text);
drop function public.forcar_estado_ativo(uuid, public.status_ativo, text);
drop function public.forcar_saldo_item(smallint, smallint, integer, text);
drop function public.previa_reset(text, smallint);
drop function public.resetar_acervo(smallint, text, text, text, jsonb);
drop function public.resetar_itens(smallint, text, text, text, jsonb);
drop function public.exigir_dev_para_destruir(text);
drop function public.rotulo_alcance_reset(smallint);

drop function public.apagar_ativos_conflito_filiais(uuid[], text, text, text);
drop function public.exigir_ativos_da_empresa(uuid[]);
drop function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb);

drop function public.e_dev();

notify pgrst, 'reload schema';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   As 21 assinaturas com to_regprocedure(…) NULL; as novas presentes, uma assinatura por nome (a asserção 2 de
--   supabase/tests/catalogo_secdef.sql volta a valer nos bancos vivos); a sonda de paridade ensaio × produção com as classes
--   func e grant_func iguais. Depois: o conta a conta (--fase f67-depois), o smoke e o conferidor de formas.
--
-- ROLLBACK (supabase/rollback/F67-desfaz.sql, o PRIMEIRO passo): recriar as 21 com o corpo VIGENTE antes da F67 — as das
-- 0072, 0074, 0082–0090, 0110, 0132, 0140 e 0158 — e os GRANTS de antes (função recriada do zero não os traz), depois
-- `notify pgrst, 'reload schema'`; só então reverter o app (nunca `git revert` do merge inteiro). Nenhum dado se perde.
