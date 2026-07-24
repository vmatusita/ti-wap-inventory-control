-- Migration 0050 — Pendência de item faltante por MOVIMENTAÇÃO (F18, tabela).
--
-- Contexto (pedido do Johnny, 24/07/2026): hoje a devolução com itens_faltantes
-- grava `itens faltantes: mochila, …` como TEXTO no campo livre `ativos.pendencia`
-- (trigger aplicar_movimentacao). A pendência GRUDA no ativo: viaja para o próximo
-- dono, só some num triagem_ok (que apaga o campo INTEIRO, inclusive trechos
-- alheios) e nunca é encerrada com desfecho — a fila só cresce. F18 transforma
-- isso num REGISTRO PRÓPRIO: uma linha POR ITEM, atrelada à DEVOLUÇÃO que a gerou
-- e ao colaborador daquela movimentação, com ciclo de vida explícito — nasce
-- 'aberta' e encerra por ação MANUAL com desfecho ('recuperado' ou 'baixa'). O
-- ativo volta a circular livre; o histórico imutável continua na movimentação (o
-- array `movimentacoes.itens_faltantes` NÃO muda).
--
-- Esta migration cria só a TABELA (estrutura + RLS + índices). O trigger que a
-- alimenta vem na 0051; as views de leitura na 0052; o backfill do texto legado
-- na 0053.
--
-- ESCOLHAS (ata em docs/DECISOES.md, 2026-07-24 · F18):
--  * status/desfecho como TEXT + CHECK (não enum novo) — o mais simples; sem novo
--    tipo, sem migration de enum separada (§A1 permite "o mais simples, registre").
--  * movimentacao_id com FK DEFERRABLE INITIALLY DEFERRED: o trigger que insere as
--    linhas (0051) é BEFORE INSERT em movimentacoes — quando ele roda, a linha da
--    movimentação AINDA não está na heap; uma FK imediata falharia. Com a FK adiada
--    a checagem ocorre no COMMIT, quando a movimentação já existe. No fluxo real via
--    Server Action isso é transparente; nos roteiros `begin;…rollback;` a FK adiada
--    nem chega a ser checada, e os dados ficam consistentes dentro da transação.
--  * colaborador/filial gravados como TEXTO/valor da ÉPOCA (snapshot deliberado,
--    como o resto do sistema): a pendência aponta quem devia devolver NAQUELA
--    devolução — NUNCA o `colaborador_atual` que o ativo tiver depois.
--  * RLS no padrão de operador: SELECT + UPDATE para `authenticated`. Sem policy de
--    INSERT/DELETE direto — as linhas só nascem/morrem pelo trigger SECURITY DEFINER
--    (0051), nunca por PostgREST. O viewer por senha é `anon` (sem policy → 0 linhas)
--    e a rota /pendencias é bloqueada no proxy; o relatório do viewer roda sob
--    service_role e recebe só CONTAGEM (o mesmo que já recebia).
--
-- Aditiva (cria tabela nova; nenhum delete/drop/UPDATE de dado existente) → caminho
-- A do docs/RUNBOOK-BANCO.md. NÃO entra na publication de realtime (/pendencias não
-- usa realtime).

create table public.pendencias_item (
  id              uuid primary key default gen_random_uuid(),
  ativo_id        uuid not null references public.ativos(id),
  movimentacao_id uuid not null references public.movimentacoes(id) deferrable initially deferred,
  item            text not null,
  colaborador     text,
  filial_id       smallint not null references public.filiais(id),
  status          text not null default 'aberta' check (status in ('aberta','resolvida')),
  desfecho        text check (desfecho in ('recuperado','baixa')),
  observacao      text,
  resolvida_em    timestamptz,
  resolvida_por   uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  -- Coerência do ciclo de vida: aberta ⇒ sem desfecho e sem resolução; resolvida ⇒
  -- COM desfecho e COM data de resolução (quem resolveu pode ser nulo p/ resoluções
  -- de sistema, mas o desfecho e o "quando" são obrigatórios).
  constraint pendencias_item_ciclo_chk check (
    (status = 'aberta'    and desfecho is null     and resolvida_em is null)
    or
    (status = 'resolvida' and desfecho is not null and resolvida_em is not null)
  )
);

comment on table public.pendencias_item is
  'F18 (24/07/2026): uma linha por ITEM faltante de uma DEVOLUÇÃO. Ciclo próprio (aberta→resolvida com desfecho recuperado/baixa). Alimentada pelo trigger aplicar_movimentacao (0051); lida por v_pendencias_item/v_fila_pendencias (0052). colaborador/filial são da ÉPOCA da devolução (snapshot textual). Dados de import NÃO abrem pendência de item (backfill 0053, precedente 0049).';

-- Índices para as consultas reais: abertas por filial (a fila filtrada), por ativo
-- (a ficha) e por movimentação (o DELETE do estorno em 0051).
create index pendencias_item_abertas_filial_idx
  on public.pendencias_item (filial_id) where status = 'aberta';
create index pendencias_item_ativo_idx
  on public.pendencias_item (ativo_id);
create index pendencias_item_movimentacao_idx
  on public.pendencias_item (movimentacao_id);

alter table public.pendencias_item enable row level security;

-- Operador (authenticated) LÊ e RESOLVE (update). Sem INSERT/DELETE direto: as
-- linhas nascem/morrem só pelo trigger SECURITY DEFINER (0051).
create policy "pendencias_item leitura operador" on public.pendencias_item
  for select to authenticated using (true);
create policy "pendencias_item operador resolve" on public.pendencias_item
  for update to authenticated using (true) with check (true);
