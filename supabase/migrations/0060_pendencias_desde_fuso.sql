-- Migration 0060 — `desde` das pendências: cast no FUSO DO NEGÓCIO, não no da sessão
-- (auditoria de src/ de 25/07/2026, lente de datas/fuso).
--
-- ✅ APLICADA EM 25/07/2026 — ensaio primeiro, produção depois (caminho A do runbook).
--
-- Conferido ANTES do apply que as definições das duas views eram IDÊNTICAS nos dois
-- bancos (md5 de `pg_get_viewdef` batendo), então o ensaio provava mesmo o que se
-- queria provar.
--
-- Verificação pós-apply:
--   · ensaio  — `desde` passou de "…T00:00:00+00:00" para "2026-02-11T03:00:00+00:00";
--     fila inalterada em 127.
--   · produção — `desde` passou de "2026-02-27T00:00:00+00:00" para
--     "2026-02-27T03:00:00+00:00" (03:00Z = meia-noite em São Paulo), ou seja a tela
--     passa a exibir 27/02 no lugar de 26/02; fila inalterada em 58; `security_invoker`
--     preservado nas duas views. Smoke de produção: 86 OK · 0 falha.
--
-- ACHADO. Uma DATA PURA convertida para timestamptz é interpretada no fuso da SESSÃO.
-- A sessão do Postgres no Supabase é UTC (medido: `current_setting('TimeZone')` = 'UTC',
-- e nenhum `pg_db_role_setting` a altera), então `'2026-02-27'::date::timestamptz` vira
-- 2026-02-27T00:00:00+00. O app então formata esse instante em America/Sao_Paulo
-- (`formatDate`, src/lib/format.ts) — 21:00 do dia ANTERIOR — e a tela mostra
-- **26/02/2026**. Um dia a menos, em toda linha da fila.
--
-- Medido em produção em 25/07/2026:
--   select to_json(desde) from public.v_pendencias_item;
--   → "2026-02-27T00:00:00+00:00" e "2026-03-04T00:00:00+00:00"  (meia-noite UTC)
--
-- Onde aparece: /pendencias (src/app/(app)/pendencias/page.tsx), o export CSV
-- (src/lib/actions/exportar.ts) e o bloco da ficha do ativo
-- (src/components/ativos/pendencias-item-ficha.tsx) — os três formatam este campo.
-- Também desalinha o `.order('desde')`, que passa a comparar instantes deslocados.
--
-- CORREÇÃO. `x::timestamp at time zone 'America/Sao_Paulo'` — lê a data como
-- meia-noite EM SÃO PAULO e devolve o timestamptz correspondente (03:00Z). O tipo
-- de saída continua `timestamptz`, que é o que o UNION ALL de `v_fila_pendencias`
-- exige — por isso NÃO se troca o campo por texto 'yyyy-MM-dd', que quebraria o UNION.
--
-- ESCOPO ESTREITO, de propósito: só os dois casts de DATA PURA. As demais fontes de
-- `desde` são `a.updated_at`, que já é `timestamptz` de verdade (um instante real) e
-- está CERTO — não se toca nelas.
--
-- Colunas, ordem, nomes, tipos e o `where` das duas views ficam IDÊNTICOS (as
-- definições abaixo são o `pg_get_viewdef` vigente de produção, com a única emenda
-- marcada). `security_invoker = true` re-especificado nas duas, como manda a convenção
-- do projeto — sem ele o viewer por senha (que é `anon`) passaria a ler sob o dono.
--
-- VERIFICAÇÃO PÓS-APPLY:
--   select to_json(desde) from public.v_pendencias_item limit 2;
--   -- esperado: "...T00:00:00-03:00" (ou 03:00:00+00:00), NUNCA "T00:00:00+00:00"
--   select count(*) from public.v_fila_pendencias;   -- esperado: 58 (inalterado)
--
-- Não toca dado. Reversível: reaplicar a 0057 (v_pendencias_item) e a 0049 (v_pendencias).

-- ---------------------------------------------------------------------------
-- v_pendencias_item — `desde` = data da devolução geradora (DATA PURA)
-- ---------------------------------------------------------------------------
create or replace view public.v_pendencias_item
with (security_invoker = true) as
  select pi.id,
    pi.ativo_id,
    pi.movimentacao_id,
    pi.item,
    pi.colaborador,
    pi.filial_id,
    f.slug as filial,
    f.nome as filial_nome,
    pi.status,
    pi.desfecho,
    pi.observacao,
    pi.resolvida_em,
    pi.resolvida_por,
    pr.nome as resolvida_por_nome,
    pi.created_at,
    a.patrimonio,
    a.categoria,
    a.marca,
    a.modelo,
    -- EMENDA 0060: era `m.data::timestamp with time zone` (meia-noite UTC).
    (m.data::timestamp at time zone 'America/Sao_Paulo') as desde
   from pendencias_item pi
     join ativos a on a.id = pi.ativo_id
     join filiais f on f.id = pi.filial_id
     left join movimentacoes m on m.id = pi.movimentacao_id
     left join profiles pr on pr.id = pi.resolvida_por;

comment on view public.v_pendencias_item is
  'F18: leitura das pendências de item (abertas E resolvidas) com detalhe de ativo/filial/movimentação/quem-resolveu. desde = data da devolução geradora, lida no fuso America/Sao_Paulo (0060). security_invoker.';

-- ---------------------------------------------------------------------------
-- v_pendencias — `desde` do ramo TERMO usa `termo_data` (DATA PURA)
-- ---------------------------------------------------------------------------
create or replace view public.v_pendencias
with (security_invoker = true) as
  select a.id,
    a.patrimonio,
    a.categoria,
    f.slug as filial,
    a.status,
    case
      when a.status = 'em_triagem'::status_ativo and a.updated_at < (now() - '7 days'::interval)
        then 'triagem parada'::text
      when ((a.termo_assinado = any (array['nao'::termo_status, 'enviado'::termo_status, 'gerado'::termo_status]))
             or a.termo_assinado is null)
           and (a.status = any (array['em_uso'::status_ativo, 'emprestado'::status_ativo]))
           and a.origem is distinct from 'importacao'::text
        then 'termo pendente'::text
      when a.pendencia is not null then a.pendencia
      else null::text
    end as pendencia,
    a.colaborador_atual,
    a.setor_atual,
    a.marca,
    a.modelo,
    a.termo_data,
    a.updated_at,
    f.nome as filial_nome,
    case
      when a.status = 'em_triagem'::status_ativo and a.updated_at < (now() - '7 days'::interval)
        then a.updated_at
      when ((a.termo_assinado = any (array['nao'::termo_status, 'enviado'::termo_status, 'gerado'::termo_status]))
             or a.termo_assinado is null)
           and (a.status = any (array['em_uso'::status_ativo, 'emprestado'::status_ativo]))
           and a.origem is distinct from 'importacao'::text
        -- EMENDA 0060: era `a.termo_data::timestamp with time zone` (meia-noite UTC).
        then coalesce((a.termo_data::timestamp at time zone 'America/Sao_Paulo'), a.updated_at)
      else a.updated_at
    end as desde
   from ativos a
     join filiais f on f.id = a.filial_id
  where a.status = 'em_triagem'::status_ativo and a.updated_at < (now() - '7 days'::interval)
     or ((a.termo_assinado = any (array['nao'::termo_status, 'enviado'::termo_status, 'gerado'::termo_status]))
          or a.termo_assinado is null)
        and (a.status = any (array['em_uso'::status_ativo, 'emprestado'::status_ativo]))
        and a.origem is distinct from 'importacao'::text
     or a.pendencia is not null;

comment on view public.v_pendencias is
  'Ativos com pendência aberta (triagem parada · termo pendente · pendência livre). Uma linha por ativo, security_invoker. 0049: termo pendente NAO se aplica a origem=importacao. 0060: termo_data lido no fuso America/Sao_Paulo (era meia-noite UTC, exibia um dia a menos).';
