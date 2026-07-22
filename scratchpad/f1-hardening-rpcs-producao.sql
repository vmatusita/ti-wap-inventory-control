-- ============================================================================
-- HANDOFF DE PRODUÇÃO — item N do plano de dívida técnica (Faixa 1, 21/07/2026)
-- Projeto de PRODUÇÃO: pbtjcalbmepmrqzprusb
--
-- O QUE APLICAR: o conteúdo INTEGRAL de
--   supabase/migrations/0040_hardening_rpcs.sql
-- (bate no gate do classificador porque importar_ativos_substituir contém
--  `delete from ativos/movimentacoes` — por isso o handoff manual).
--
-- Recria DUAS funções por `create or replace` PURO (assinatura idêntica → sem overload):
--   (1) criar_compra_lote          → autoria via coalesce(auth.uid(), p_criado_por)
--   (2) importar_ativos_substituir → p_contagens obrigatório (recusa null antes do DELETE)
-- NÃO toca dado (nenhum insert/update/delete de linhas). Só troca o corpo das funções.
-- ============================================================================

-- PASSO 1 — cole e rode o conteúdo de supabase/migrations/0040_hardening_rpcs.sql aqui.

-- PASSO 2 — VERIFICAÇÃO (rode depois do PASSO 1):

-- 2a. cada função ficou única e com a assinatura certa (sem overload)?
select p.oid::regprocedure::text as assinatura
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('criar_compra_lote','importar_ativos_substituir')
order by 1;
-- esperado: EXATAMENTE 2 linhas —
--   criar_compra_lote(jsonb, uuid)
--   importar_ativos_substituir(jsonb, text, jsonb, jsonb)

-- 2b. a guarda nova está no corpo da RPC de import?
select position('p_contagens is null or jsonb_typeof(p_contagens)' in
  pg_get_functiondef('public.importar_ativos_substituir(jsonb,text,jsonb,jsonb)'::regprocedure)) > 0
  as guarda_p_contagens_presente,
  position('coalesce(auth.uid(), p_criado_por)' in
  pg_get_functiondef('public.criar_compra_lote(jsonb,uuid)'::regprocedure)) > 0
  as autoria_por_auth_uid;
-- esperado: t | t

-- 2c. grants preservados (anon/service_role sem execute na RPC destrutiva)?
select r.rolname,
  has_function_privilege(r.rolname, 'public.importar_ativos_substituir(jsonb,text,jsonb,jsonb)', 'execute') as import,
  has_function_privilege(r.rolname, 'public.criar_compra_lote(jsonb,uuid)', 'execute') as compra
from (values ('anon'),('authenticated'),('service_role')) r(rolname);
-- esperado: authenticated=t/t ; anon=f/f ; service_role=f/f

-- PASSO 3 — recarregue o schema cache do PostgREST:
notify pgrst, 'reload schema';
