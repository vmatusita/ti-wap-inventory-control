-- Migration 0015 — LANÇAMENTOS de item (movimentação de quantidade — F3B).
-- Mesma filosofia do sistema: o lançamento é a fonte da verdade; saldo e
-- atrelados são DERIVADOS (RPCs da 0016). Imutável como `movimentacoes`:
-- corrigir = lançamento inverso apontando `estorna_id` (nada se apaga). A regra
-- crítica (saldo/atrelados nunca negativos) vive no Postgres — a UI é a segunda
-- linha (CLAUDE.md). Aditiva. Aplicar no projeto de DESENVOLVIMENTO.

create type public.tipo_lancamento as enum (
  'entrada',    -- recebimento (compra/reposição de acessório) — soma ao saldo
  'saida',      -- entrega/consumo — subtrai do saldo; consome reserva do mesmo chamado
  'reserva',    -- separa quantidade para um chamado aberto (atrela)
  'liberacao',  -- cancela reserva sem consumir (desatrela)
  'ajuste'      -- correção de inventário: sinal livre, exige justificativa
);

create table public.lancamentos_item (
  id          uuid primary key default gen_random_uuid(),
  item_id     smallint  not null references public.itens (id),
  filial_id   smallint  not null references public.filiais (id),
  tipo        public.tipo_lancamento not null,
  quantidade  int       not null,
  chamado     text,                 -- nº no sistema de chamados (obrig. em reserva/liberacao)
  colaborador text,                 -- opcional (a quem se destina)
  data        date      not null default current_date,
  observacao  text,                 -- obrigatória em ajuste
  criado_por  uuid      not null references public.profiles (id),
  estorna_id  uuid      references public.lancamentos_item (id), -- só no lançamento inverso
  created_at  timestamptz not null default now(),

  -- quantidade > 0 para todos, EXCETO ajuste (sinal livre, <> 0).
  constraint lanc_item_qtd_valida check (
    case when tipo = 'ajuste' then quantidade <> 0 else quantidade > 0 end
  ),
  -- ajuste exige justificativa (mesma doutrina do ajuste de ativos, spec §8).
  constraint lanc_item_ajuste_obs check (
    tipo <> 'ajuste' or (observacao is not null and length(btrim(observacao)) > 0)
  ),
  -- reserva/liberação exigem o chamado que amarra a quantidade.
  constraint lanc_item_chamado check (
    tipo not in ('reserva', 'liberacao')
    or (chamado is not null and length(btrim(chamado)) > 0)
  )
);

create index lanc_item_item_filial_idx on public.lancamentos_item (item_id, filial_id, data);
create index lanc_item_filial_data_idx on public.lancamentos_item (filial_id, data desc);
create index lanc_item_chamado_idx     on public.lancamentos_item (item_id, filial_id, chamado);
create index lanc_item_created_idx     on public.lancamentos_item (created_at desc);
-- Cada lançamento pode ser estornado no máximo UMA vez (o inverso aponta o original).
create unique index lanc_item_estorna_uidx
  on public.lancamentos_item (estorna_id) where estorna_id is not null;

-- Trigger BEFORE INSERT: valida a regra crítica no banco.
--   saldo(item,filial)     = Σ entrada − Σ saida ± ajuste (sinal)              — nunca < 0
--   atrelados(item,filial) = Σ_chamado max(0, Σreserva − Σliberacao − Σsaida)  — nunca < 0
--   falta                  = max(0, atrelados − saldo)                         — alerta (RPC 0016)
-- Semântica de atrelados: a saída com o mesmo chamado consome a reserva aberta
-- (por chamado, sem passar de zero); a liberação cancela sem consumir. Por isso
-- o guard de atrelados recai sobre a LIBERAÇÃO: não se pode liberar mais do que
-- a reserva líquida aberta do chamado (senão o atrelado do chamado iria a
-- negativo). Reserva pode deixar atrelados > saldo de propósito — é o "faltam N".
create or replace function public.valida_lancamento_item()
returns trigger
language plpgsql as $$
declare
  v_saldo       int;
  v_reserva_net int;
begin
  -- Saldo resultante (lançamentos existentes + a linha nova, ainda não inserida).
  select coalesce(sum(case l.tipo
           when 'entrada' then l.quantidade
           when 'saida'   then -l.quantidade
           when 'ajuste'  then l.quantidade
           else 0 end), 0)
    into v_saldo
    from public.lancamentos_item l
    where l.item_id = new.item_id and l.filial_id = new.filial_id;

  v_saldo := v_saldo + case new.tipo
      when 'entrada' then new.quantidade
      when 'saida'   then -new.quantidade
      when 'ajuste'  then new.quantidade
      else 0 end;

  if v_saldo < 0 then
    raise exception
      'Saldo insuficiente: a operação deixaria o item com saldo % (não pode ficar negativo).',
      v_saldo
      using errcode = 'check_violation';
  end if;

  -- Liberação não pode exceder a reserva líquida aberta do chamado.
  if new.tipo = 'liberacao' then
    select coalesce(sum(case l.tipo
             when 'reserva'   then l.quantidade
             when 'liberacao' then -l.quantidade
             else 0 end), 0)
      into v_reserva_net
      from public.lancamentos_item l
      where l.item_id = new.item_id
        and l.filial_id = new.filial_id
        and l.chamado = new.chamado;

    if v_reserva_net - new.quantidade < 0 then
      raise exception
        'Liberação maior que a reserva aberta do chamado % (não há % para liberar).',
        new.chamado, new.quantidade
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

create trigger trg_valida_lancamento_item
  before insert on public.lancamentos_item
  for each row execute function public.valida_lancamento_item();

-- RLS: operador logado INSERE; ninguém edita/apaga (imutável — sem policy de
-- update/delete, como `movimentacoes`). anon: nada.
alter table public.lancamentos_item enable row level security;
create policy "leitura operador" on public.lancamentos_item for select to authenticated using (true);
create policy "operador lanca"   on public.lancamentos_item for insert to authenticated with check (true);
