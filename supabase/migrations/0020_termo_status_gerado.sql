-- Migration 0020 — novo valor 'gerado' no enum termo_status (OS-F5A / PLANO-TERMOS §7).
-- Fluxo do papel do termo: nao -> gerado -> enviado -> sim.
-- 'gerado' = documento .docx emitido pelo sistema, ainda sem assinatura; continua
-- contando como PENDENTE em v_pendencias (a cobranca nao afrouxa — §7, ver 0021).
-- ADD VALUE e ADITIVO e IRREVERSIVEL. Precisa ser COMMITADO antes de ser usado
-- (por isso a recriacao da v_pendencias fica na 0021, transacao separada).
-- Aplicar no projeto de DESENVOLVIMENTO (unico projeto — go-live ainda nao ocorreu).

alter type public.termo_status add value if not exists 'gerado';
