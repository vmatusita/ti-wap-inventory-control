-- Migration 0054 — rel_estoque_asof: desempate determinístico (OS-F19, achado C1).
--
-- BUG confirmado por SELECT em produção (24/07/2026): rel_estoque_asof(hoje) divergia
-- de `ativos` em 501 ativos no STATUS. Causa raiz: o import de startup insere a `compra`
-- de abertura (baseline, status_resultante='em_estoque') e o `ajuste` de reconciliação
-- (status_resultante=estadoAlvo) na MESMA transação — logo com o MESMO created_at
-- (now() = tempo da transação) e, quando a linha tem uma data só, o MESMO `data`. O
-- `distinct on (ativo_id) ... order by data desc, created_at desc, id desc` empatava em
-- (data, created_at) e caía no tiebreak por `id` (uuid v4, aleatório) → ~metade dos 1.002
-- ativos com esse par resolvia para a COMPRA (em_estoque) em vez do AJUSTE (estado real).
-- `ativos.status` é a verdade (o trigger faz last-insert-wins = o ajuste, inserido depois);
-- só a reconstrução as-of errava — e só no caminho de PERÍODO PASSADO (KPIs, categoria×
-- status, disponíveis-por-modelo, reservados de um snapshot regerado/errata). O ao vivo
-- (período terminando hoje) usa `ativos` direto (estoque.ts:44), então nunca foi afetado.
--
-- A F6A (16/07/2026, docs/DECISOES.md) já observara o SINTOMA ("relatórios de período
-- passado subestimam o inventário e omitem reservado/manutenção/defasado") e o deixou como
-- backlog "herança F4"; a F19 diagnosticou a RAIZ (o empate não-determinístico) e a corrige.
--
-- FIX (diff mínimo vs 0047): UMA cláusula nova no `order by` do CTE `ult` — no empate de
-- (data, created_at), a RECONCILIAÇÃO (`ajuste`) vence o NASCIMENTO (`compra`/`troca`),
-- espelhando o last-insert-wins do trigger. O empate só existe na transação do import
-- (compra+ajuste); movimentações do dia a dia são transações separadas (created_at
-- monotônico) → a cláusula nunca dispara fora do import. NÃO toca dado; snapshots
-- congelados (jsonb) não mudam; o ao vivo/fast-path não usa esta função. Qualquer outra
-- diferença vs 0047 é BUG. `create or replace` puro (assinatura idêntica) → não bate no
-- gate (sem `delete from`); caminho A do docs/RUNBOOK-BANCO.md (ensaio → produção).
--
-- LATENTE, NÃO CORRIGIDO (diff mínimo): o colaborador/setor as-of de um `ajuste` lê
-- `snapshot_anterior` (estado ANTERIOR), não o colaborador do próprio ajuste — logo a posse
-- setada por ajuste de import não aparece na saída as-of. NÃO é divergência confirmada
-- porque essas colunas NÃO são consumidas por nenhum relatório (estoque.ts lê só status/
-- categoria/filial); fica documentado (docs/MATRIZ-REGRAS.md R-REL-30) como issue benigna.

create or replace function public.rel_estoque_asof(
  p_filial smallint,
  p_data   date
) returns table (
  ativo_id    uuid,
  categoria   public.categoria_ativo,
  marca       text,
  modelo      text,
  filial_id   smallint,
  status      public.status_ativo,
  colaborador text,
  setor       text
) language sql stable security invoker set search_path = public as $$
  with efetivas as (
    select m.*
    from public.movimentacoes m
    where m.data <= p_data
      and m.tipo <> 'estorno'
      and not exists (
        select 1 from public.movimentacoes e
        where e.estorno_de = m.id and e.data <= p_data
      )
  ),
  ult as (
    select distinct on (e.ativo_id) e.*
    from efetivas e
    -- F19 (achado C1): no empate (data, created_at) — que só ocorre na transação do import
    -- de startup (compra de abertura + ajuste de reconciliação com o mesmo now()) — a
    -- reconciliação (`ajuste`) vence o nascimento (`compra`/`troca`), espelhando o
    -- last-insert-wins do trigger em `ativos`. Fora do import cada mov é transação própria
    -- (created_at monotônico), então esta cláusula é inócua. Determinístico e correto.
    order by e.ativo_id, e.data desc, e.created_at desc,
             (e.tipo = 'ajuste') desc,
             e.id desc
  ),
  estado as (
    select
      a.id  as ativo_id,
      a.categoria,
      a.marca,
      a.modelo,
      (u.ativo_id is not null) as existe,
      coalesce(
        case
          when u.tipo = 'transferencia' then u.filial_destino_id
          when u.tipo in ('compra','troca') then u.filial_id
          when u.snapshot_anterior ? 'filial_id'
            then nullif(u.snapshot_anterior ->> 'filial_id', '')::smallint
          else a.filial_id
        end,
        a.filial_id
      ) as filial_id,
      coalesce(u.status_resultante, 'em_estoque') as status,
      case
        when u.tipo in ('saida', 'emprestimo', 'reserva') then u.colaborador
        when u.tipo in ('devolucao', 'triagem_ok', 'descarte', 'envio_manutencao') then null
        when u.tipo is null then null
        else u.snapshot_anterior ->> 'colaborador'
      end as colaborador,
      case
        when u.tipo in ('saida', 'emprestimo', 'reserva') then u.setor
        when u.tipo in ('devolucao', 'triagem_ok', 'descarte', 'envio_manutencao') then null
        when u.tipo is null then null
        else u.snapshot_anterior ->> 'setor'
      end as setor
    from public.ativos a
    left join ult u on u.ativo_id = a.id
  )
  select ativo_id, categoria, marca, modelo, filial_id, status, colaborador, setor
  from estado
  where existe
    and status not in ('descartado', 'devolvido_fornecedor')
    and (p_filial is null or filial_id = p_filial);
$$;

revoke all on function public.rel_estoque_asof(smallint, date)    from public;
grant execute on function public.rel_estoque_asof(smallint, date) to authenticated, service_role;
