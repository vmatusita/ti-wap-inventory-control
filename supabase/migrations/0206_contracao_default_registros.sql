-- =====================================================================================================================
-- 0206_contracao_default_registros.sql — F67C (16/11/2026): o fim do default — CONTRAÇÃO, lote 2 (vocabulário e
-- registros, as onze) e a assinatura antiga da ferramenta de órfão
-- =====================================================================================================================
-- classe: ADITIVA (alter column … drop default: só catálogo; um drop function sem cascade — nenhum dado, nenhuma policy)
--
-- As onze de k_lote2 (eventos_admin, import_logs, import_prefixos_patrimonio, import_termos_categoria,
-- import_termos_estado, kits_modelos, motivos, relatorios_gerados, senhas_acesso, tipos_item, unidades_apelidos) perdem o
-- `default public.empresa_legada()`. É o lote onde o esquecimento seria MAIS silencioso: sem pai que confira, um item,
-- um motivo, um tipo ou a linha da trilha de Auditoria nasceriam da WAP sem erro nenhum. Desde a expansão (0204) e do app
-- da v1.75.0 todo escritor diz a empresa: a trilha do import pela filial, a da ferramenta de órfão pela operação
-- (p_empresa), o app pela operação ou pela filial, e `registrarEventoAdmin` pela empresa ALVO (o tipo exige).
--
-- E a assinatura ANTIGA de registrar_limpeza_termos_sem_linha (text, text, text) — a que gravava a trilha sem empresa —
-- sai aqui, no MESMO arquivo em que o default de eventos_admin deixa de existir — e por isso no mesmo instante (o app no
-- ar já chama a nova, uuid primeiro; com o default fora, a antiga daria 23502). Sem `if exists`, sem `cascade`.
--
-- ⚠ ORDEM: em PRODUÇÃO, depois da contração do acervo (0205) e da vigília dela — e só depois do deploy e da janela por
-- forma (RUNBOOK, Anexo F67C). A trava que EXIGE a ausência é a 15e (invertida neste mesmo commit) e a derivada 15l.
-- =====================================================================================================================

set lock_timeout = '2s';

alter table public.eventos_admin alter column empresa_id drop default;
alter table public.import_logs alter column empresa_id drop default;
alter table public.import_prefixos_patrimonio alter column empresa_id drop default;
alter table public.import_termos_categoria alter column empresa_id drop default;
alter table public.import_termos_estado alter column empresa_id drop default;
alter table public.kits_modelos alter column empresa_id drop default;
alter table public.motivos alter column empresa_id drop default;
alter table public.relatorios_gerados alter column empresa_id drop default;
alter table public.senhas_acesso alter column empresa_id drop default;
alter table public.tipos_item alter column empresa_id drop default;
alter table public.unidades_apelidos alter column empresa_id drop default;

drop function public.registrar_limpeza_termos_sem_linha(text, text, text);

notify pgrst, 'reload schema';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   pg_attrdef sem linha para a coluna empresa_id das onze; to_regprocedure da assinatura antiga nulo e a nova (uuid,
--   text, text, text) de pé; a vigília (≥ 5 min) sem 23502 em empresa_id e sem falha de auditoria.registro-evento.
--
-- ROLLBACK (supabase/rollback/F67C-desfaz.sql, o bloco 0206 — na ordem inversa 0207 → 0200): devolver às onze o default
-- public.empresa_legada(); recriar a assinatura antiga da ferramenta de órfão com o corpo da 0196 e a ACL dela.
