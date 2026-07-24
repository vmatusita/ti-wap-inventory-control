-- Migration 0049 — import DISPENSA "termo pendente" em v_pendencias.
--
-- Pedido do Johnny (24/07/2026): ativos que entraram pelo IMPORT de startup
-- (origem = 'importacao') NÃO exigem termo de responsabilidade. O controle de
-- termo não existia direito na planilha antes do sistema, então o acervo legado
-- que veio pelo import não deve inundar /pendencias, o badge da sidebar e o
-- relatório com "termo pendente". A obrigatoriedade continua valendo para tudo
-- que NÃO é import (cadastro manual e 'inferido'): só origem = 'importacao' é
-- dispensado ("apenas via import"). Não retroage a geração de termo: o operador
-- ainda pode gerar/assinar um termo de um ativo importado pela ficha — a mudança
-- só remove a COBRANÇA automática, não a possibilidade.
--
-- Efeito medido em produção (pbtjcalbmepmrqzprusb, 24/07/2026): 1.142 ativos
-- apareciam como "termo pendente", 1.140 deles importados. Depois desta migration
-- só 2 (não-importados) permanecem. 1.103 saem de v_pendencias (o termo era a
-- ÚNICA pendência) e 37 RECLASSIFICAM para a pendência REAL que também carregavam
-- ('sem patrimônio físico' etc.) — continuam na view, em outro balde. Total da
-- view: 1.163 → 60. Nenhuma outra pendência (triagem parada, itens faltantes,
-- patrimônio) muda.
--
-- Recriação por `create or replace view` PURO: as 14 colunas (nomes/tipos/ordem)
-- ficam IDÊNTICAS à 0028 — o requisito do create-or-replace (não reordena nem
-- remove coluna existente) é respeitado, e os GRANTs/consumidores seguem intactos.
-- DIFF vs 0028 = SÓ o `and a.origem is distinct from 'importacao'` acrescentado em
-- TRÊS pontos: (1) o ramo 'termo pendente' do CASE de `pendencia`; (2) o MESMO
-- ramo no CASE de `desde` (para o ativo reclassificado herdar o `desde` da
-- pendência livre — updated_at —, não a data do termo); (3) a condição de termo
-- no WHERE (senão o ativo importado sem outra pendência continuaria entrando na
-- view com pendencia = NULL). Qualquer outra diferença é BUG.
-- `is distinct from` (não `<>`): só o valor EXATO 'importacao' é dispensado; a
-- coluna é NOT NULL default 'cadastro', mas o predicado fica defensivo (um
-- eventual null continuaria EXIGINDO termo, nunca dispensado por engano).
--
-- NÃO-destrutiva (nenhum delete/drop/UPDATE de linha; só redefine o corpo da
-- view) → caminho A do docs/RUNBOOK-BANCO.md: aplicada por MCP em ENSAIO primeiro,
-- depois PRODUÇÃO, conferida com get_advisors + smoke só-leitura, registrada no
-- ledger normalmente. security_invoker = true preservado (o viewer por senha
-- nunca alcança esta view — /pendencias é bloqueada no proxy).

create or replace view public.v_pendencias
with (security_invoker = true) as
select a.id, a.patrimonio, a.categoria, f.slug as filial, a.status,
       case
         when a.status = 'em_triagem'
              and a.updated_at < now() - interval '7 days' then 'triagem parada'
         when (a.termo_assinado in ('nao','enviado','gerado') or a.termo_assinado is null)
              and a.status in ('em_uso','emprestado')
              and a.origem is distinct from 'importacao'    then 'termo pendente'
         when a.pendencia is not null                        then a.pendencia
       end as pendencia,
       -- Colunas de detalhe para a lista /pendencias (A5/F6A) — inalteradas.
       a.colaborador_atual,
       a.setor_atual,
       a.marca,
       a.modelo,
       a.termo_data,
       a.updated_at,
       f.nome as filial_nome,
       -- "Desde quando", na MESMA prioridade do CASE de `pendencia` (com a mesma
       -- dispensa de import no ramo do termo — o reclassificado cai no `else`).
       case
         when a.status = 'em_triagem'
              and a.updated_at < now() - interval '7 days' then a.updated_at
         when (a.termo_assinado in ('nao','enviado','gerado') or a.termo_assinado is null)
              and a.status in ('em_uso','emprestado')
              and a.origem is distinct from 'importacao'
                                                            then coalesce(a.termo_data::timestamptz, a.updated_at)
         else a.updated_at
       end as desde
from public.ativos a
join public.filiais f on f.id = a.filial_id
where (a.status = 'em_triagem' and a.updated_at < now() - interval '7 days')
   or ((a.termo_assinado in ('nao','enviado','gerado') or a.termo_assinado is null)
       and a.status in ('em_uso','emprestado')
       and a.origem is distinct from 'importacao')
   or a.pendencia is not null;

comment on view public.v_pendencias is
  'Ativos com pendência aberta (triagem parada · termo pendente · pendência livre). Uma linha por ativo, security_invoker. A5/F6A acrescentou colaborador/setor/marca/modelo/termo_data/updated_at/filial_nome/desde. 0049 (24/07/2026): termo pendente NAO se aplica a origem=importacao — o acervo legado do import nao exige termo; a obrigatoriedade segue valendo para cadastro e inferido.';

-- ===== SMOKE (orquestrador — rodar em ensaio e em produção) =====
-- Antes da 0049 (produção, 24/07/2026): total 1.163, "termo pendente" 1.142.
-- Depois: total 60, "termo pendente" 2 (só os não-importados). Invariante forte:
-- NENHUM ativo com origem='importacao' pode restar como 'termo pendente'.
--   select count(*) as total from public.v_pendencias;                                   -- 1163 -> 60
--   select count(*) from public.v_pendencias where pendencia = 'termo pendente';         -- 1142 -> 2
--   select count(*) from public.v_pendencias p join public.ativos a on a.id = p.id
--     where p.pendencia = 'termo pendente' and a.origem = 'importacao';                  -- esperado: 0
