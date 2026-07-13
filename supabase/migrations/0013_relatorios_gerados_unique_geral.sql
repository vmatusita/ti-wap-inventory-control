-- Migration 0013 — protege o relatório CONSOLIDADO ('geral', filial_id null)
-- contra versão duplicada (achado da revisão da F3). O UNIQUE da 0010
-- (periodo_de, periodo_ate, filial_id, versao) NÃO cobre o geral porque NULL é
-- distinto de NULL em índice único no Postgres — dois snapshots 'geral' do mesmo
-- período poderiam receber a mesma versão numa corrida. O índice abaixo usa
-- coalesce(filial_id, -1), tornando o geral uma chave concreta: uma inserção
-- duplicada concorrente falha (rollback) em vez de criar versão repetida.
-- Aplicar no projeto de DESENVOLVIMENTO.

create unique index if not exists relatorios_gerados_periodo_filial_versao_uidx
  on public.relatorios_gerados (periodo_de, periodo_ate, coalesce(filial_id, -1), versao);
