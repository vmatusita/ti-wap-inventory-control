-- =====================================================================================================================
-- 0205_contracao_default_acervo.sql — F67C (16/11/2026): o fim do default — CONTRAÇÃO, lote 1 (o acervo, as oito)
-- =====================================================================================================================
-- classe: ADITIVA (alter column … drop default: só catálogo — nenhuma linha reescrita, nenhum dado, nenhuma policy; o
-- classificador calcula ADITIVA)
--
-- Até aqui, as oito tabelas do acervo (k_lote1: anotacoes, ativos, colaboradores, itens, lancamentos_item, movimentacoes,
-- pendencias_item, termos_gerados) tinham `empresa_id … not null default public.empresa_legada()`: a linha que alguém
-- criasse sem dizer a empresa nascia DA WAP por omissão. Desde a expansão (0200–0203) e do app da v1.75.0, todo escritor
-- diz a empresa — as funções pela filial da linha, o app pela filial da operação ou pela operação, os scripts pela filial.
-- Aqui o default SAI: um INSERT que omitir a empresa passa a ser recusado (23502, ou o 23503 do gatilho do termo — fato 8
-- do PLAN-F67C), em vez de nascer da WAP calado.
--
-- ⚠ ORDEM (zero janela, decisão 13/11-2): em PRODUÇÃO esta migration só se aplica DEPOIS do deploy do app que manda a
-- empresa e de uma janela por FORMA de INSERT em pg_stat_statements sem chamada nova SEM empresa_id (RUNBOOK, Anexo F67C;
-- PLAN-F67C decisão 12 — com a Skew Protection ligada, a janela cobre o teto dela). No ensaio e no CI, a cadeia inteira.
--
-- O lock: ACCESS EXCLUSIVE por instantes em cada tabela (doc PG 17), sem reescrita; `lock_timeout` de 2 s — o risco é o
-- lock não vir, não o app travar. Uma tabela por comando, sem `if exists`, sem `cascade`. A trava que EXIGE a ausência é a
-- 15b de supabase/tests/catalogo_policies.sql (invertida neste mesmo commit) e a derivada 15l.
-- =====================================================================================================================

set lock_timeout = '2s';

alter table public.anotacoes alter column empresa_id drop default;
alter table public.ativos alter column empresa_id drop default;
alter table public.colaboradores alter column empresa_id drop default;
alter table public.itens alter column empresa_id drop default;
alter table public.lancamentos_item alter column empresa_id drop default;
alter table public.movimentacoes alter column empresa_id drop default;
alter table public.pendencias_item alter column empresa_id drop default;
alter table public.termos_gerados alter column empresa_id drop default;

notify pgrst, 'reload schema';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   pg_attrdef sem linha para a coluna empresa_id das oito (e as outras doze como estavam: este é o lote 1); not null e a
--   FK para empresas intactos; 0 linhas fora da legada; a vigília (≥ 5 min) sem 23502 em empresa_id nos logs do Postgres.
--
-- ROLLBACK (supabase/rollback/F67C-desfaz.sql, o bloco 0205 — na ordem inversa 0207 → 0200): devolver às oito o default
-- public.empresa_legada(), uma tabela por comando. Sozinho, ele já devolve o comportamento de antes (o escritor que
-- esquecer a empresa volta a gravar a WAP); nenhum dado se perde.
