-- Migration 0028 — v_pendencias com colunas de detalhe para a página /pendencias (OS-F6A · A5).
-- A página interna /pendencias (só operador) precisa de colaborador, setor, marca,
-- modelo, "desde quando" e nome da filial. A view vigente (0021) só expõe o
-- suficiente para os CHIPS de contagem. Esta migration ESTENDE a view:
--   * WHERE e as 6 colunas originais (id, patrimonio, categoria, filial, status,
--     pendencia) ficam INTACTOS — getPendencias e o card do dashboard não mudam
--     de comportamento (contagens idênticas).
--   * Colunas novas são APENAS acrescentadas ao final (requisito do
--     create or replace view: não reordena nem remove coluna existente).
-- security_invoker = true preservado (a view respeita a RLS do chamador; o viewer
-- por senha nunca alcança esta view — /pendencias é bloqueada no proxy).
-- Aplicar no projeto de DESENVOLVIMENTO; produção é o orquestrador (§1.4).

create or replace view public.v_pendencias
with (security_invoker = true) as
select a.id, a.patrimonio, a.categoria, f.slug as filial, a.status,
       case
         when a.status = 'em_triagem'
              and a.updated_at < now() - interval '7 days' then 'triagem parada'
         when (a.termo_assinado in ('nao','enviado','gerado') or a.termo_assinado is null)
              and a.status in ('em_uso','emprestado')       then 'termo pendente'
         when a.pendencia is not null                        then a.pendencia
       end as pendencia,
       -- ---- Colunas NOVAS (A5): detalhe para a lista /pendencias ----
       -- Não entram em nenhum WHERE nem alteram o conjunto de linhas.
       a.colaborador_atual,
       a.setor_atual,
       a.marca,
       a.modelo,
       a.termo_data,
       a.updated_at,
       f.nome as filial_nome,
       -- "Desde quando", na MESMA prioridade do CASE de `pendencia`:
       --   triagem → updated_at (entrou em triagem);
       --   termo   → termo_data quando existe, senão updated_at;
       --   livre   → updated_at (ex.: devolução com itens faltantes).
       -- termo_data é `date`; cast p/ timestamptz uniformiza o tipo com updated_at
       -- e permite ORDER BY estável no servidor (paginação de /pendencias).
       case
         when a.status = 'em_triagem'
              and a.updated_at < now() - interval '7 days' then a.updated_at
         when (a.termo_assinado in ('nao','enviado','gerado') or a.termo_assinado is null)
              and a.status in ('em_uso','emprestado')
                                                            then coalesce(a.termo_data::timestamptz, a.updated_at)
         else a.updated_at
       end as desde
from public.ativos a
join public.filiais f on f.id = a.filial_id
where (a.status = 'em_triagem' and a.updated_at < now() - interval '7 days')
   or ((a.termo_assinado in ('nao','enviado','gerado') or a.termo_assinado is null)
       and a.status in ('em_uso','emprestado'))
   or a.pendencia is not null;

comment on view public.v_pendencias is
  'Ativos com pendência aberta (triagem parada · termo pendente · pendência livre). Uma linha por ativo, security_invoker. A5/F6A acrescentou colaborador/setor/marca/modelo/termo_data/updated_at/filial_nome/desde para a página interna /pendencias; WHERE e as 6 colunas originais inalterados (getPendencias intacto).';

-- ===== SMOKE (orquestrador — rodar em dev e em produção) =====
-- Contagem total deve ser IDÊNTICA à de antes da migration (a view não muda o
-- conjunto de linhas). Baseline medido no dev em 16/07/2026: 981.
--   select count(*) as total from public.v_pendencias;                       -- = baseline
--   select count(*) filter (where desde is null) from public.v_pendencias;   -- esperado: 0
--   select count(*) filter (where filial_nome is null) from public.v_pendencias; -- esperado: 0
