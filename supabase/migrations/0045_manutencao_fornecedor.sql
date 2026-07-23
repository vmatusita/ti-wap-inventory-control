-- Migration 0045 — colunas, check, funções e RPC do ciclo de manutenção com fornecedor (OS-F14).
--
-- Depende da 0044 (valores de enum 'devolvido_fornecedor'/'devolucao_fornecedor' já
-- COMMITADOS numa transação anterior). Tudo aqui é ADITIVO:
--   * colunas novas (movimentacoes.chamado_fornecedor, ativos.substitui_ativo_id + índice);
--   * check NOT VALID (preserva o histórico — envios anteriores não tinham o campo);
--   * recriação de 2 funções por `create or replace` PURO (assinatura idêntica → sem
--     overload; pg_proc segue 1 linha por função);
--   * 1 RPC nova (devolver_ao_fornecedor) + grants.
-- NÃO toca dado (nenhum delete/update em ativos/movimentacoes) — não bate no gate do
-- modo automático. Caminho A do docs/RUNBOOK-BANCO.md (ensaio → produção).

-- ============================================================================
-- MN1 — chamado do FORNECEDOR na movimentação de manutenção
-- ============================================================================
-- Texto livre (o formato do chamado do fornecedor é desconhecido — sem máscara).
-- Distinto de movimentacoes.chamado (chamado INTERNO, numérico como texto).
alter table public.movimentacoes
  add column if not exists chamado_fornecedor text;

comment on column public.movimentacoes.chamado_fornecedor is
  'F14: número/identificador do chamado ABERTO PELO FORNECEDOR na manutenção (texto livre, formato desconhecido). Obrigatório em envio_manutencao (check abaixo). Distinto de movimentacoes.chamado (chamado interno).';

-- Obrigatório no envio_manutencao para linhas NOVAS. NOT VALID = a constraint não é
-- checada contra as linhas EXISTENTES (envios anteriores à F14, sem o campo) — só
-- valida os INSERT/UPDATE futuros. Preserva 100% do histórico (invariante §1.2.6).
alter table public.movimentacoes
  add constraint movimentacoes_chamado_fornecedor_envio
  check (tipo <> 'envio_manutencao' or chamado_fornecedor is not null)
  not valid;

-- ============================================================================
-- MN4 — vínculo de sucessão: o ativo NOVO (substituto) aponta para o ANTIGO
-- ============================================================================
alter table public.ativos
  add column if not exists substitui_ativo_id uuid references public.ativos(id);

comment on column public.ativos.substitui_ativo_id is
  'F14: quando este ativo é o SUBSTITUTO de um equipamento devolvido ao fornecedor, aponta para o ativo antigo (devolvido_fornecedor). NULL para todos os demais. Histórico por VÍNCULO — cada movimentação segue pertencendo ao ativo em que aconteceu.';

create index if not exists idx_ativos_substitui_ativo_id
  on public.ativos (substitui_ativo_id);

-- ============================================================================
-- MN2 — máquina de estados: status_apos_movimentacao
-- ============================================================================
-- Base: corpo VIGENTE (0024). DIFF vs 0024 = SÓ duas mudanças (diff-review §B.3 do runbook):
--   (1) caso novo: devolucao_fornecedor a partir de em_manutencao -> devolvido_fornecedor;
--   (2) transferencia passa a excluir TAMBÉM devolvido_fornecedor (terminal de baixa não
--       se transfere, como descartado).
-- Qualquer outra diferença é BUG. Assinatura idêntica (create or replace puro).
create or replace function public.status_apos_movimentacao(
  p_status public.status_ativo,
  p_tipo   public.tipo_movimentacao
) returns public.status_ativo
language plpgsql immutable set search_path = public as $$
begin
  return case
    when p_tipo = 'compra'             and p_status in ('em_estoque')                 then 'em_estoque'
    when p_tipo = 'saida'              and p_status in ('em_estoque','reservado','em_triagem') then 'em_uso'
    when p_tipo = 'emprestimo'         and p_status in ('em_estoque','reservado')     then 'emprestado'
    when p_tipo = 'reserva'            and p_status in ('em_estoque')                 then 'reservado'
    when p_tipo = 'devolucao'          and p_status in ('em_uso','emprestado')        then 'em_triagem'
    when p_tipo = 'triagem_ok'         and p_status in ('em_triagem')                 then 'em_estoque'
    when p_tipo = 'envio_manutencao'   and p_status in ('em_estoque','em_triagem','em_uso','defasado') then 'em_manutencao'
    when p_tipo = 'retorno_manutencao' and p_status in ('em_manutencao')              then 'em_estoque'
    when p_tipo = 'devolucao_fornecedor' and p_status in ('em_manutencao')            then 'devolvido_fornecedor'
    when p_tipo = 'marcar_defasado'    and p_status in ('em_estoque','em_triagem','em_manutencao') then 'defasado'
    when p_tipo = 'descarte'           and p_status in ('em_estoque','em_triagem','em_manutencao','defasado') then 'descartado'
    when p_tipo = 'transferencia'      and p_status not in ('descartado','devolvido_fornecedor') then p_status
    when p_tipo in ('ajuste','estorno')                                               then null
    else null
  end;
end $$;

-- ============================================================================
-- MN2 (varredura §0) — rel_estoque_asof exclui o estado terminal novo do estoque
-- ============================================================================
-- Base: corpo VIGENTE (0022, que trouxe o filtro `existe`). DIFF vs 0022 = SÓ a cláusula
-- final: `status <> 'descartado'` -> `status not in ('descartado','devolvido_fornecedor')`.
-- devolvido_fornecedor é baixa (sai do inventário), como descartado — não entra no estoque
-- reconstruído as-of. As listas de zeramento de colaborador/setor NÃO mudam de propósito:
-- devolucao_fornecedor só é atingível de em_manutencao (colaborador já nulo) e o estado é
-- EXCLUÍDO no WHERE, então acrescentá-lo ali seria diff sem efeito observável (minimal diff).
-- Assinatura idêntica (create or replace puro).
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
    order by e.ativo_id, e.data desc, e.created_at desc, e.id desc
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
          when u.tipo = 'compra'        then u.filial_id
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

-- ============================================================================
-- MN3/MN4 — RPC atômica de devolução ao fornecedor (+ substituto opcional)
-- ============================================================================
-- Espelha criar_compra_lote (0008/0040): SECURITY INVOKER (roda com a RLS do operador
-- logado), search_path=public, autoria por coalesce(auth.uid(), p_criado_por) — para o
-- único chamador possível (papel authenticated) auth.uid() vence e o valor do cliente
-- deixa de decidir a autoria.
--
-- Uma função = UMA transação = TUDO OU NADA:
--   (1) movimentação `devolucao_fornecedor` no ativo ANTIGO. O trigger aplicar_movimentacao
--       valida a transição (em_manutencao -> devolvido_fornecedor) e vira o estado;
--   (2) se p_substituto não for null: ativo NOVO (nasce em_estoque, origem 'cadastro',
--       substitui_ativo_id = antigo, `fornecedor` COPIADO DO ANTIGO no servidor — não vem
--       do payload) + a movimentação `compra` dele (padrão 0008).
-- Colisão do substituto no índice único (patrimonio + coalesce(service_tag,''), §5) →
-- rollback TOTAL: nem a devolução entra.
create or replace function public.devolver_ao_fornecedor(
  p_ativo_id   uuid,    -- ativo em manutenção
  p_mov        jsonb,   -- {data, chamado, chamado_fornecedor, observacao}
  p_substituto jsonb,   -- null = sem substituto; senão {patrimonio, service_tag, categoria,
                        --  marca, modelo, memoria, armazenamento, processador, hostname,
                        --  filial_id, observacoes, data, observacao}
  p_criado_por uuid
) returns table (mov_id uuid, substituto_id uuid, substituto_mov_id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_antigo     public.ativos%rowtype;
  v_uid        uuid := coalesce(auth.uid(), p_criado_por);
  v_sub_filial smallint;
begin
  select * into v_antigo from public.ativos where id = p_ativo_id;
  if v_antigo.id is null then
    raise exception 'Ativo % não encontrado para devolução ao fornecedor.', p_ativo_id;
  end if;

  -- (1) devolução ao fornecedor no ativo ANTIGO. O trigger valida a transição
  --     (em_manutencao -> devolvido_fornecedor) e atualiza o estado; se o ativo não
  --     estiver em_manutencao, status_apos_movimentacao devolve null e o trigger levanta
  --     'Movimentacao ... invalida' -> rollback total (a UI faz a pré-checagem amigável).
  insert into public.movimentacoes (
    ativo_id, tipo, data, filial_id, chamado, chamado_fornecedor, observacao, criado_por
  ) values (
    p_ativo_id, 'devolucao_fornecedor',
    coalesce((p_mov->>'data')::date, current_date),
    v_antigo.filial_id,
    nullif(p_mov->>'chamado', ''),
    nullif(p_mov->>'chamado_fornecedor', ''),
    nullif(p_mov->>'observacao', ''),
    v_uid
  ) returning id into mov_id;

  -- (2) substituto (opcional). fornecedor é HERDADO do antigo (no servidor), NÃO do payload.
  if p_substituto is not null and jsonb_typeof(p_substituto) = 'object' then
    v_sub_filial := coalesce((p_substituto->>'filial_id')::smallint, v_antigo.filial_id);

    insert into public.ativos (
      patrimonio, service_tag, categoria, marca, modelo,
      memoria, armazenamento, processador, hostname,
      fornecedor, filial_id, origem, observacoes, substitui_ativo_id
    ) values (
      nullif(p_substituto->>'patrimonio', ''),
      nullif(p_substituto->>'service_tag', ''),
      (p_substituto->>'categoria')::public.categoria_ativo,
      nullif(p_substituto->>'marca', ''),
      nullif(p_substituto->>'modelo', ''),
      nullif(p_substituto->>'memoria', ''),
      nullif(p_substituto->>'armazenamento', ''),
      nullif(p_substituto->>'processador', ''),
      nullif(p_substituto->>'hostname', ''),
      v_antigo.fornecedor,          -- herdado do antigo (servidor)
      v_sub_filial,
      'cadastro',
      nullif(p_substituto->>'observacoes', ''),
      p_ativo_id                    -- vínculo de sucessão
    ) returning id into substituto_id;

    -- Movimentação `compra` do substituto: entrada real (sem marcador de import →
    -- aparece nas Entradas do período). O trigger valida em_estoque -> em_estoque.
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
    values (
      substituto_id, 'compra',
      coalesce((p_substituto->>'data')::date, current_date),
      v_sub_filial,
      nullif(p_substituto->>'observacao', ''),
      v_uid
    ) returning id into substituto_mov_id;
  end if;

  return next;
end $$;

-- EXECUTE só para `authenticated` (operador logado). anon/service_role NÃO executam
-- (é escrita; a sessão por senha do relatório nunca chega aqui).
revoke all on function public.devolver_ao_fornecedor(uuid, jsonb, jsonb, uuid) from public, anon, service_role;
grant execute on function public.devolver_ao_fornecedor(uuid, jsonb, jsonb, uuid) to authenticated;
