-- F6B B4 — observação ao gerar o snapshot (decisão Johnny 16/07/2026).
-- Texto livre opcional gravado no ATO de gerar o relatório: aparece no final do
-- snapshot (junto do resumo do período) com destaque, visível para operador e
-- visualizador. A obs também é injetada em `dados.meta.observacao` (o corpo
-- renderiza de forma autossuficiente); esta coluna existe para a LISTA de gerados
-- indicar quais têm observação sem precisar parsear o jsonb.
--
-- A tabela `relatorios_gerados` continua IMUTÁVEL (spec §7.1): sem UPDATE/DELETE.
-- Regerar o mesmo período cria uma versão nova — a obs de uma versão nunca é
-- editada. Coluna nullable: snapshots já existentes seguem com observacao = NULL.
alter table public.relatorios_gerados
  add column observacao text;

comment on column public.relatorios_gerados.observacao is
  'Observação da semana (texto livre opcional) definida no ato de gerar o snapshot. Espelhada em dados.meta.observacao. Imutável, como o resto da linha.';
