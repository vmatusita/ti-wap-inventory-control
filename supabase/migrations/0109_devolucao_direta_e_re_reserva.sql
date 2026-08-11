-- Migration 0109 — devolução direta ao estoque, triagem manual e re-reserva (OS-F34,
-- frentes C e D). Depende da 0108 (valor de enum 'envio_triagem' já COMMITADO numa
-- transação anterior).
--
-- Tudo aqui é recriação de função por `create or replace` PURO (assinatura idêntica →
-- sem overload; `pg_proc` segue com 1 linha por função). NÃO toca dado: nenhum
-- update/delete de ativo ou de movimentação, e nenhum ativo muda de estado por esta
-- migration. O que muda é o comportamento das movimentações FUTURAS.
-- Caminho A do docs/RUNBOOK-BANCO.md (ensaio → produção).
--
-- ⚠ BASE DE CADA `create or replace`: o corpo VIGENTE lido do BANCO por
-- `pg_get_functiondef` em 11/08/2026 — NÃO a migration mais antiga que criou a função
-- (a lição escrita na própria 0047: recriar por cima de corpo velho é regressão
-- silenciosa). Fingerprints md5 do functiondef ANTERIOR, idênticos em ensaio e produção:
--   status_apos_movimentacao  b5d0d51a637959dc59ffda697beffedd  (base: 0047)
--   aplicar_movimentacao      f7212a5927f5dc3bb6be3732895e25fd  (base: 0099)
--   rel_estoque_asof          6c173d2bdd922ebf9c78fd5cff5bb4c6  (base: 0054)
-- Guardados na ata de `docs/DECISOES.md` como backup lógico (rollback = `create or
-- replace` de volta a esses corpos; o `add value` da 0108 é inócuo se não for usado).

-- ============================================================================
-- C/D — máquina de estados: status_apos_movimentacao
-- ============================================================================
-- Base: corpo VIGENTE (0047). DIFF vs 0047 = EXATAMENTE três linhas, nada mais:
--   1) `reserva`   aceita também o estado `reservado`   → a RE-RESERVA (frente D):
--      equipamento reservado passa a OUTRO colaborador continuando reservado, sem
--      estorno e sem ajuste, com as duas reservas na linha do tempo.
--   2) `devolucao` passa a resultar `em_estoque` (era `em_triagem`) → frente C.
--   3) linha NOVA `envio_triagem` (em_estoque → em_triagem) → a triagem opt-in.
-- `triagem_ok` fica INTACTA (em_triagem → em_estoque) e todas as demais saídas de
-- `em_triagem` (saida, envio_manutencao, marcar_defasado, descarte, transferencia)
-- continuam exatamente como estão — quem está em triagem hoje não fica preso.
-- O tipo `transferencia` (que é de FILIAL) não é tocado. Qualquer outra diferença é BUG.
--
-- Este `case` é lido por `src/lib/validators/transicoes-sql.test.ts`, que reconstrói a
-- matriz a partir da migration de MAIOR número que define a função e a compara com
-- `TRANSICOES` (TS). Mantenha o formato de uma linha por `when`.
create or replace function public.status_apos_movimentacao(
  p_status public.status_ativo,
  p_tipo   public.tipo_movimentacao
) returns public.status_ativo
language plpgsql immutable set search_path = public as $$
begin
  return case
    when p_tipo = 'compra'             and p_status in ('em_estoque')                 then 'em_estoque'
    when p_tipo = 'troca'              and p_status in ('em_estoque')                 then 'em_estoque'
    when p_tipo = 'saida'              and p_status in ('em_estoque','reservado','em_triagem') then 'em_uso'
    when p_tipo = 'emprestimo'         and p_status in ('em_estoque','reservado')     then 'emprestado'
    when p_tipo = 'reserva'            and p_status in ('em_estoque','reservado')     then 'reservado'
    when p_tipo = 'devolucao'          and p_status in ('em_uso','emprestado')        then 'em_estoque'
    when p_tipo = 'envio_triagem'      and p_status in ('em_estoque')                 then 'em_triagem'
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
-- C — aplicar_movimentacao: 'envio_triagem' zera o detentor, como 'triagem_ok'
-- ============================================================================
-- Base: corpo VIGENTE (0099). DIFF vs 0099 = SÓ o acréscimo de 'envio_triagem' às DUAS
-- listas de zeramento (colaborador_atual e setor_atual). NADA MAIS muda:
--   · `devolucao` CONTINUA zerando colaborador/setor e CONTINUA abrindo `pendencias_item`
--     por item faltante (F18) — só o `status_resultante` mudou, e ele vem da função acima;
--   · o termo de devolução, o snapshot, o estorno, a guarda de identidade por filial
--     (F24/0099) e a fixação de filial de compra/troca ficam byte a byte;
--   · `reserva` já gravava `new.colaborador`/`new.setor` do payload — é isso que faz a
--     RE-RESERVA trocar o detentor sem uma linha nova aqui (provado por roteiro, não por
--     leitura: `supabase/tests/transicoes_extra.sql`).
--
-- Por que 'envio_triagem' entra no zeramento e não é mero no-op defensivo: de `em_estoque`
-- o detentor é normalmente nulo, MAS o `ajuste` (válvula de escape) grava
-- `status_resultante` direto SEM limpar colaborador/setor — um ativo pode chegar a
-- `em_estoque` carregando detentor. Sem esta linha, o `envio_triagem` levaria esse
-- detentor para dentro de `em_triagem`, estado que por desenho não tem dono (é o mesmo
-- motivo pelo qual `triagem_ok` zera). Espelhado em `rel_estoque_asof` logo abaixo, senão
-- o estado AO VIVO e o estado AS-OF discordariam nesse caso.
-- Qualquer outra diferença é BUG. Assinatura idêntica (create or replace puro).
create or replace function public.aplicar_movimentacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ativo  public.ativos%rowtype;
  v_orig   public.movimentacoes%rowtype;
  v_novo   public.status_ativo;
  -- F24 (0099): a filial em que o ativo FICA depois desta movimentação.
  v_dest   smallint;
begin
  select * into v_ativo from public.ativos where id = new.ativo_id for update;

  new.snapshot_anterior := jsonb_build_object(
    'status',         v_ativo.status,
    'colaborador',    v_ativo.colaborador_atual,
    'setor',          v_ativo.setor_atual,
    'filial_id',      v_ativo.filial_id,
    'pendencia',      v_ativo.pendencia,
    'termo_assinado', v_ativo.termo_assinado,
    'termo_data',     v_ativo.termo_data);

  if new.tipo = 'estorno' then
    if new.estorno_de is null then
      raise exception 'Estorno exige referencia a movimentacao original (estorno_de)';
    end if;
    select * into v_orig from public.movimentacoes where id = new.estorno_de;
    if v_orig.id is null or v_orig.ativo_id <> new.ativo_id then
      raise exception 'estorno_de precisa apontar para uma movimentacao do MESMO ativo';
    end if;
    if v_orig.tipo = 'estorno' or v_orig.snapshot_anterior is null then
      raise exception 'Esta movimentacao nao pode ser estornada';
    end if;
    if exists (
      select 1 from public.movimentacoes m
      where m.ativo_id = new.ativo_id
        and (m.created_at, m.id) > (v_orig.created_at, v_orig.id)
    ) then
      raise exception 'So a ultima movimentacao efetiva do ativo pode ser estornada (use ajuste, com justificativa)';
    end if;
    perform public.exigir_identidade_livre_na_filial(
      new.ativo_id, (v_orig.snapshot_anterior ->> 'filial_id')::smallint, 'desfazer esta movimentação');

    update public.ativos set
      status            = (v_orig.snapshot_anterior ->> 'status')::public.status_ativo,
      colaborador_atual = v_orig.snapshot_anterior ->> 'colaborador',
      setor_atual       = v_orig.snapshot_anterior ->> 'setor',
      filial_id         = (v_orig.snapshot_anterior ->> 'filial_id')::smallint,
      pendencia         = case when v_orig.snapshot_anterior ? 'pendencia'
                               then nullif(
                                 (select string_agg(trim(x.val), '; ' order by x.ord)
                                  from unnest(string_to_array(v_orig.snapshot_anterior ->> 'pendencia', ';'))
                                       with ordinality as x(val, ord)
                                  where nullif(trim(x.val), '') is not null
                                    and lower(trim(x.val)) not like 'itens faltantes%'), '')
                               else pendencia end,
      termo_assinado    = case when v_orig.snapshot_anterior ? 'termo_assinado'
                               then (v_orig.snapshot_anterior ->> 'termo_assinado')::public.termo_status
                               else termo_assinado end,
      termo_data        = case when v_orig.snapshot_anterior ? 'termo_data'
                               then (v_orig.snapshot_anterior ->> 'termo_data')::date
                               else termo_data end,
      updated_at        = now()
    where id = new.ativo_id;
    delete from public.pendencias_item where movimentacao_id = v_orig.id;
    new.status_anterior   := v_ativo.status;
    new.status_resultante := (v_orig.snapshot_anterior ->> 'status')::public.status_ativo;
    return new;
  end if;

  if new.tipo = 'ajuste' then
    if new.status_resultante is null or new.observacao is null then
      raise exception 'Ajuste exige status_resultante e observacao (justificativa)';
    end if;
    v_novo := new.status_resultante;
  else
    v_novo := public.status_apos_movimentacao(v_ativo.status, new.tipo);
    if v_novo is null then
      raise exception 'Movimentacao % invalida para ativo % no estado %',
        new.tipo, v_ativo.patrimonio, v_ativo.status;
    end if;
  end if;

  new.status_anterior   := v_ativo.status;
  new.status_resultante := v_novo;

  -- F24 (0099) — a guarda de identidade cobre TODO caminho que muda a filial do ativo, e
  -- não só a transferência (era o buraco da 0097): o destino sai do MESMO `case` do UPDATE
  -- logo abaixo, então `compra` e `troca` — que gravam `new.filial_id` — entram junto.
  v_dest := case
    when new.tipo in ('compra','troca') then new.filial_id
    when new.tipo = 'transferencia'     then coalesce(new.filial_destino_id, v_ativo.filial_id)
    else v_ativo.filial_id end;

  if v_dest is not null and v_dest <> v_ativo.filial_id then
    perform public.exigir_identidade_livre_na_filial(
      new.ativo_id, v_dest,
      case when new.tipo = 'transferencia' then 'transferir este ativo'
           else 'registrar esta movimentação' end);
  end if;

  update public.ativos set
    status            = v_novo,
    colaborador_atual = case
      when new.tipo in ('saida','emprestimo','reserva') then new.colaborador
      when new.tipo in ('devolucao','envio_triagem','triagem_ok','descarte','envio_manutencao','devolucao_fornecedor') then null
      else colaborador_atual end,
    setor_atual       = case
      when new.tipo in ('saida','emprestimo','reserva') then new.setor
      when new.tipo in ('devolucao','envio_triagem','triagem_ok','descarte','envio_manutencao','devolucao_fornecedor') then null
      else setor_atual end,
    filial_id         = case
      when new.tipo in ('compra','troca') then new.filial_id
      when new.tipo = 'transferencia' then coalesce(new.filial_destino_id, filial_id)
      else filial_id end,
    termo_assinado    = coalesce(new.termo_assinado, termo_assinado),
    termo_data        = coalesce(new.termo_data, termo_data),
    updated_at        = now()
  where id = new.ativo_id;

  if new.tipo = 'devolucao' and coalesce(cardinality(new.itens_faltantes), 0) > 0 then
    insert into public.pendencias_item (ativo_id, movimentacao_id, item, colaborador, filial_id)
    select new.ativo_id,
           new.id,
           u.item,
           coalesce(nullif(new.colaborador, ''), v_ativo.colaborador_atual),
           new.filial_id
    from unnest(new.itens_faltantes) as u(item)
    where nullif(trim(u.item), '') is not null;
  end if;

  return new;
end $$;

-- ============================================================================
-- C — rel_estoque_asof: o espelho AS-OF do zeramento acima
-- ============================================================================
-- Base: corpo VIGENTE (0054). DIFF vs 0054 = SÓ o acréscimo de 'envio_triagem' às duas
-- listas que zeram colaborador/setor — o par obrigatório da mudança em
-- `aplicar_movimentacao`. Sem isto, um ativo mandado à triagem apareceria SEM detentor
-- no estado ao vivo e COM o detentor anterior na leitura as-of do relatório.
-- Nenhuma fórmula de CONTAGEM muda aqui: a lista de status filtrados, o desempate por
-- `ajuste` (0054), a existência as-of (0022) e a filial as-of ficam byte a byte.
-- ('devolucao_fornecedor' segue fora destas listas, como na 0054: o status
-- `devolvido_fornecedor` é filtrado no `where` final, então nunca chega a ser lido.)
-- Qualquer outra diferença é BUG. Assinatura idêntica (create or replace puro).
create or replace function public.rel_estoque_asof(p_filial smallint, p_data date)
returns table (
  ativo_id uuid,
  categoria public.categoria_ativo,
  marca text,
  modelo text,
  filial_id smallint,
  status public.status_ativo,
  colaborador text,
  setor text
)
language sql stable set search_path = public as $$
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
        when u.tipo in ('devolucao', 'envio_triagem', 'triagem_ok', 'descarte', 'envio_manutencao') then null
        when u.tipo is null then null
        else u.snapshot_anterior ->> 'colaborador'
      end as colaborador,
      case
        when u.tipo in ('saida', 'emprestimo', 'reserva') then u.setor
        when u.tipo in ('devolucao', 'envio_triagem', 'triagem_ok', 'descarte', 'envio_manutencao') then null
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

-- ============================================================================
-- Nota sobre `dev_checagens_integridade()` (as nove checagens do /dev)
-- ============================================================================
-- LIDAS antes de escrever esta migration (corpo vigente por `pg_get_functiondef`):
-- patrimonio_duplicado, ativo_filial_inativa, termo_sem_arquivo, perfil_sem_conta,
-- conta_sem_perfil, pendencia_de_estornada, operador_sem_filial, arquivo_termo_orfao e
-- conflito_entre_filiais. NENHUMA delas pressupõe "devolução ⇒ em_triagem" (nenhuma cita
-- `em_triagem`, `devolucao` ou `triagem_ok`), então a função NÃO é recriada aqui — é o
-- diff mínimo pedido pela ordem F34.
