-- Migration 0068 — F21: o mesmo furo da 0067, no irmão que ela não alcançou.
--
-- Contexto: achado da **RE-REVISÃO** (a revisão das correções da revisão), confirmado por duas
-- lentes independentes. A `0067` fechou o padrão "gatear dado que o escritor escolhe" em
-- `movimentacoes` e deixou `lancamentos_item` intacto — e a folga lá é da MESMA classe.
--
-- POR QUE A REVISÃO ANTERIOR ERROU AO REFUTAR ISTO. Na primeira rodada, este achado foi
-- refutado como "folga pré-existente do esquema, não da fase" — e é verdade que `estorna_id` é
-- FK livre desde a `0015`. Mas a conclusão não segue: **foi a F21 que transformou filial em
-- fronteira de escrita**. Antes da `0063`, `with check (true)` tornava o caso irrelevante — não
-- havia privilégio a violar. A partir da `0063` passou a haver, e o ponteiro continuou livre.
--
-- O FURO. A policy `"operador lanca"` (0063) gateia `pode_escrever_filial(filial_id)`, e
-- `filial_id` aqui É o objeto da escrita (o saldo daquela filial) — logo o predicado é
-- auto-consistente, ao contrário do de `movimentacoes`. O problema é a OUTRA coluna da mesma
-- linha: `estorna_id` aponta uma entidade de fora e não é conferida por nada — nem por
-- constraint (a FK da `0015` não filtra), nem pelo trigger (`valida_lancamento_item` olha
-- saldo e reserva; não menciona `estorna_id`). O comentário da `0063` dizendo que "o estorno de
-- item cai na mesma regra" é FALSO: em `movimentacoes` existe um ativo para ancorar a origem, e
-- o trigger recusa `estorno_de` de outro ativo; aqui não há âncora nenhuma.
--
-- CAMINHO (operador vinculado só à filial 1; vítima = lançamento L2 da filial 2, cujo uuid é
-- legível porque o SELECT é `using (true)` para todo logado, por design da ADR-001):
--   POST /rest/v1/lancamentos_item
--   {"item_id":<X>,"filial_id":1,"tipo":"entrada","quantidade":1,"estorna_id":"<L2>"}
--   · policy: pode_escrever_filial(1) = true  → PASSA
--   · trigger: 'entrada' só soma saldo        → nenhuma exceção
--   · índice único `lanc_item_estorna`: ninguém aponta L2 ainda → PASSA
--
-- O dano cai TODO na filial 2, onde ele não escreve:
--   1. o histórico e o relatório derivam "estornado" de "existe alguém apontando para mim",
--      **sem filtro de filial** — L2 passa a aparecer estornado sem que nada tenha sido
--      revertido, e o saldo da filial 2 continua contando L2. Histórico e saldo se contradizem.
--   2. o operador legítimo da filial 2 perde para SEMPRE a única forma de corrigir L2: o índice
--      único queimou a vaga e `estornarLancamento` passa a devolver "Este lançamento já foi
--      estornado". A tabela é imutável (sem update/delete) — só o service role limpa.
--
-- CORREÇÃO. Uma função `security definer` com parâmetros EXPLÍCITOS, e não um `exists` inline.
-- Motivo concreto, descoberto ao testar: dentro de um subselect na própria tabela, a referência
-- nua `estorna_id` resolve para a coluna do ALIAS da subconsulta (`o.estorna_id`), não para a
-- linha nova — a condição virava `o.id = o.estorna_id`, sempre falsa, e o predicado **recusava
-- o estorno legítimo**. Com parâmetros nomeados não há escopo ambíguo possível. De quebra fica
-- no idioma do resto do desenho (a autorização toda passa por função).
--
-- Provado no ensaio antes de aplicar:
--   ATAQUE estorna_id de OUTRA filial   → RECUSADO (42501)
--   ATAQUE estorna_id de OUTRO item     → RECUSADO (23514, um check pegou antes)
--   LEGÍTIMO estorno mesma filial+item  → ACEITO
--   LEGÍTIMO lançamento sem estorno     → ACEITO
--
-- ADITIVA (uma função nova + um `alter policy`; nenhum dado tocado). Caminho A do runbook.
-- REVERSÃO:
--   alter policy "operador lanca" on public.lancamentos_item
--     with check (public.pode_escrever_filial(filial_id));
--   drop function public.estorno_item_coerente(uuid, smallint, smallint);

create or replace function public.estorno_item_coerente(
  p_estorna_id uuid,
  p_filial     smallint,
  p_item       smallint
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_estorna_id is null
      or exists (
        select 1
          from public.lancamentos_item o
         where o.id        = p_estorna_id
           and o.filial_id = p_filial
           and o.item_id   = p_item
      )
$$;

comment on function public.estorno_item_coerente(uuid, smallint, smallint) is
  'F21/0068: true se o estorno de item aponta um lançamento da MESMA filial e do MESMO item (ou se não é estorno). Fecha o ponteiro livre `estorna_id`, que permitia a um operador queimar a vaga de estorno de um lançamento de filial não vinculada. NULL em p_estorna_id = não é estorno = permitido.';

revoke all on function public.estorno_item_coerente(uuid, smallint, smallint) from public, anon;
grant execute on function public.estorno_item_coerente(uuid, smallint, smallint) to authenticated;

alter policy "operador lanca" on public.lancamentos_item
  with check (
    public.pode_escrever_filial(filial_id)
    and public.estorno_item_coerente(estorna_id, filial_id, item_id)
  );

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   select with_check from pg_policies
--    where schemaname='public' and tablename='lancamentos_item' and policyname='operador lanca';
--   -- esperado: cita pode_escrever_filial E estorno_item_coerente
--
--   select has_function_privilege('anon','public.estorno_item_coerente(uuid,smallint,smallint)','execute') as anon,
--          has_function_privilege('authenticated','public.estorno_item_coerente(uuid,smallint,smallint)','execute') as auth;
--   -- esperado: anon=false, auth=true
--
--   select count(*) from public.lancamentos_item;   -- esperado: inalterado
--
--   -- E o roteiro: supabase/tests/papeis_rls.sql, asserções 2e-bis (ataque) e 2e-ter (legítimo).
