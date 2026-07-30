-- Migration 0075 — F22: o vocabulário da trilha de auditoria ganha os verbos da gestão
-- avançada de usuários.
--
-- Contexto: docs/prompts/F22-cargo-dev-ultracode.md §3.4.
--
-- POR QUE UMA MIGRATION SÓ PARA UM COMMENT. `eventos_admin.acao` é TEXT e não enum, de
-- propósito (0065): ação nova não deve exigir migration para ser GRAVADA. O preço combinado
-- foi que o vocabulário fechado mora em dois lugares que precisam concordar —
-- `ACOES_ADMIN`/`ACAO_ROTULO` em src/lib/auditoria.ts (que a UI usa para o filtro e os
-- rótulos) e o comment da coluna (que é o que alguém lendo o banco encontra). A 0065 gravou
-- a regra no próprio arquivo: "mexeu aqui, mexa lá". Esta migration é o "lá".
--
-- Verbos NOVOS da F22 (os três da gestão avançada, todos privativos do cargo dev):
--   · email_alterado      — o e-mail de login da conta foi trocado {de, para}
--   · usuario_apagado     — a conta foi apagada: perfil arquivado + conta removida do Auth
--   · sessoes_encerradas  — as sessões vigentes do usuário foram derrubadas
--
-- ⚠ `usuario_apagado` é o único evento cujo ALVO não é mais resolvível depois do fato: a
-- conta some de auth.users e o perfil fica arquivado. Por isso a action grava em `alvo` o
-- e-mail LEGÍVEL no momento da exclusão (não o uuid) — é o que torna a trilha auditável seis
-- meses depois. `eventos_admin.autor` continua sobrevivendo por `on delete set null` (0065),
-- e como a F22 passou a ARQUIVAR o perfil em vez de apagá-lo, na prática o autor agora
-- sobrevive COM NOME mesmo quando ele próprio é apagado depois.
--
-- ADITIVA: só troca um comment. Zero efeito em dado, policy ou permissão.
-- REVERSÃO: restaurar o comment da 0065.

comment on column public.eventos_admin.acao is
  'F22 (era F21): o que aconteceu. TEXT e não enum de propósito — ação nova não deve exigir migration. Vocabulário fechado, espelhado em src/lib/auditoria.ts (ACOES_ADMIN/ACAO_ROTULO): convite_gerado, convite_reenviado, papel_alterado, vinculos_alterados, usuario_desativado, usuario_reativado, email_alterado, usuario_apagado, sessoes_encerradas, senha_criada, senha_revogada, senha_reativada, import_executado. Os três da F22 (email_alterado, usuario_apagado, sessoes_encerradas) são privativos do cargo dev. Mexeu aqui, mexa lá — e vice-versa.';

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   select col_description('public.eventos_admin'::regclass,
--            (select attnum from pg_attribute
--              where attrelid='public.eventos_admin'::regclass and attname='acao')) like '%usuario_apagado%' as ok;
--   -- esperado: true
