-- Migration 0134 — F53: o desempate passa a ser `ordem`, e não mais o uuid de `id`.
--
-- Depende da 0133 (a coluna `ordem`). ⚠ ORDEM DE APPLY OBRIGATÓRIA: a 0133 vem ANTES desta.
-- Se esta entrar primeiro, os três corpos citam uma coluna que não existe e o apply falha com
-- 42703 — barulhento, mas ainda assim uma volta ao início.
--
-- =============================================================================
-- O QUE MUDA, E O QUE DELIBERADAMENTE NÃO MUDA
-- =============================================================================
-- ⚠ ESTE ARQUIVO É GERADO por `node scripts/db/gerar-0134.mjs --aplicar`, a partir do CORPO
-- VIGENTE resolvido das migrations (`corpoVigente`) com UMA troca por objeto
-- (`trocarNoCorpo`, que reprova se o trecho não estiver mais lá). Não o edite à mão: edite o
-- gerador e regenere. O diff medido, objeto a objeto, é:
--     rel_estoque_asof     — 3 linhas removidas, 1 acrescentada  (só o `order by` do CTE `ult`)
--     aplicar_movimentacao — 1 linha  removida,  1 acrescentada  (só a trava do estorno)
--     v_conflitos_filiais  — 1 linha  removida,  1 acrescentada  (só o `order by` da subconsulta)
--
-- 1) `rel_estoque_asof`: `data desc, created_at desc, (tipo='ajuste') desc, id desc`
--    vira `data desc, ordem desc`.
--    ⚠ `data` CONTINUA sendo a primeira chave, e isso é a decisão central da fase.
--    `ordem desc` SOZINHO reproduz a ordem de hoje — mas só para o passado, porque no
--    passado `ordem` foi calculada com `data` como primeira componente. Daqui para a
--    frente `ordem` é ordem de INSERÇÃO, e uma movimentação lançada com data retroativa
--    (medido: 2227 das 3497 linhas de produção, 63,7%, com atraso de até 935 dias) ganharia
--    `ordem` alta e passaria a vencer o as-of de um período em que ela não era a verdade.
--    Mantendo `data` na frente, `ordem` faz só o que veio fazer: desempatar com exatidão.
--    E `(tipo = 'ajuste')` SAI porque `ordem` já o reproduz — é a terceira componente do
--    backfill da 0133, e para linha futura o ajuste é inserido depois, logo tem `ordem` maior.
--
-- 2) `aplicar_movimentacao`, a trava do estorno: `(created_at, id)` vira `(created_at, ordem)`.
--    ⚠ `created_at` CONTINUA sendo a primeira chave, e isso também é decisão medida, não
--    inércia. A trava protege a CADEIA de `snapshot_anterior`, que é construída na ordem de
--    GRAVAÇÃO — desfazer fora dessa ordem restaura um retrato velho. Medido em produção,
--    ativo a ativo, sobre os 1620 ativos:
--        · `(created_at, ordem)`  difere de hoje em 643 ativos — e os 643 têm empate de
--          `created_at`, ou seja, 100% dos casos em que a resposta de hoje é um SORTEIO;
--        · `ordem` sozinha difere em 653 — os mesmos 643 MAIS 10 sem empate nenhum, em que
--          ela apontaria uma linha que não é a última gravada. Esses 10 são exatamente o que
--          não se pode mudar, e é por isso que a régua pura foi recusada.
--    Nos 643 que mudam, a régua nova aponta o `ajuste` em 643 de 643; a de hoje apontava o
--    `ajuste` em 0 de 643. `ativos.status` já concorda com a nova.
--
-- 3) `v_conflitos_filiais.ultima_mov_tipo`: ganha `, m2.ordem desc`. Era a ÚNICA régua de
--    "última movimentação" da base inteira SEM desempate nenhum (medido no `pg_get_viewdef`
--    vivo), com 1448 ativos em empate de `created_at` esperando por ela.
--
-- O QUE **NÃO** MUDA, e por quê — `apagar_movimentacao` (corpo vigente 0090):
--    ela compara `(created_at, id)` em 0090:182, igualzinho à trava do estorno. Mas o
--    desempate por `id` ali é **INALCANÇÁVEL**: a recusa de empate da 0087 (0090:168-174)
--    barra, nove linhas antes, TODO ativo em que dois `created_at` sejam iguais. Quando o
--    `exists` de :182 roda, os `created_at` do ativo já são distintos dois a dois, e o `id`
--    nunca decide. Trocar por `ordem` ali seria um no-op — e não seria de graça: o corpo dela
--    contém `delete from public.movimentacoes`, logo bate no GATE do modo automático
--    (`docs/RUNBOOK-BANCO.md`) e exigiria uma migration separada pelo caminho B. A prova de
--    que o `id` é inalcançável está no roteiro (rótulo 10c), não na fé.
--
-- `create or replace` PURO nos três casos: assinaturas byte a byte idênticas, sem overload,
-- sem grant novo, sem policy nova. NENHUMA linha de dado é tocada. O corpo não contém
-- exclusão de acervo → NÃO bate no gate → caminho **A**: ensaio primeiro, produção depois.
--
-- =============================================================================
-- ORDEM DE ROLLBACK — o inverso do apply, e ANTES do rollback da 0133
-- =============================================================================
--   1) create or replace function public.rel_estoque_asof(smallint, date) — corpo da 0110
--   2) create or replace function public.aplicar_movimentacao()           — corpo da 0110
--   3) create or replace view public.v_conflitos_filiais                  — corpo da 0096
--   4) notify pgrst, 'reload schema';
-- ⚠ Só DEPOIS disso é que a 0133 pode ser revertida: os corpos acima citam `ordem`, e um
--   `drop column ordem cascade` com a 0134 ainda no ar levaria as funções junto.

-- ---------------------------------------------------------------------------
-- 1) rel_estoque_asof — `data desc, ordem desc` no lugar da quádrupla
-- ---------------------------------------------------------------------------
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
    order by e.ativo_id, e.data desc, e.ordem desc
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
        when u.tipo is null then null
        when not public.status_tem_detentor(coalesce(u.status_resultante, 'em_estoque')) then null
        when u.tipo in ('saida', 'emprestimo', 'reserva') then u.colaborador
        else u.snapshot_anterior ->> 'colaborador'
      end as colaborador,
      case
        when u.tipo is null then null
        when not public.status_tem_detentor(coalesce(u.status_resultante, 'em_estoque')) then null
        when u.tipo in ('saida', 'emprestimo', 'reserva') then u.setor
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

-- ---------------------------------------------------------------------------
-- 2) aplicar_movimentacao — a trava do estorno passa a (created_at, ordem)
-- ---------------------------------------------------------------------------
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
        and (m.created_at, m.ordem) > (v_orig.created_at, v_orig.ordem)
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
      when not public.status_tem_detentor(v_novo) then null
      when new.tipo in ('saida','emprestimo','reserva') then new.colaborador
      else colaborador_atual end,
    setor_atual       = case
      when not public.status_tem_detentor(v_novo) then null
      when new.tipo in ('saida','emprestimo','reserva') then new.setor
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

-- ---------------------------------------------------------------------------
-- 3) v_conflitos_filiais — a única régua sem desempate ganha um
-- ---------------------------------------------------------------------------
create or replace view public.v_conflitos_filiais
with (security_invoker = true) as
with ident as (
  select
    a.id,
    a.filial_id,
    public.chave_identidade_ativo(a.patrimonio, a.service_tag) as chave
  from public.ativos a
),
grupos as (
  select i.chave
    from ident i
   where i.chave is not null
   group by i.chave
  having count(distinct i.filial_id) > 1
)
select
  i.chave,
  a.id                                   as ativo_id,
  a.patrimonio,
  a.patrimonio_original,
  a.service_tag,
  a.filial_id,
  f.slug                                 as filial,
  f.nome                                 as filial_nome,
  a.status,
  a.categoria,
  a.marca,
  a.modelo,
  a.hostname,
  a.colaborador_atual,
  a.setor_atual,
  a.origem,
  a.pendencia,
  a.created_at,
  a.updated_at,
  coalesce(h.movimentacoes, 0)           as movimentacoes,
  coalesce(h.movimentacoes_reais, 0)     as movimentacoes_reais,
  h.ultima_mov_data,
  h.ultima_mov_tipo,
  coalesce(t.termos, 0)                  as termos,
  (coalesce(h.movimentacoes_reais, 0) > 0 or coalesce(t.termos, 0) > 0) as tem_historico_real,
  h.entrada_em
from ident i
join grupos g   on g.chave = i.chave
join public.ativos a on a.id = i.id
join public.filiais f on f.id = a.filial_id
left join lateral (
  select
    count(*)::int                                                        as movimentacoes,
    count(*) filter (where not public.mov_da_carga_import(m.observacao))::int
                                                                         as movimentacoes_reais,
    max(m.data)                                                          as ultima_mov_data,
    min(m.data)                                                          as entrada_em,
    (select m2.tipo::text
       from public.movimentacoes m2
      where m2.ativo_id = a.id
      order by m2.data desc, m2.created_at desc, m2.ordem desc
      limit 1)                                                           as ultima_mov_tipo
  from public.movimentacoes m
  where m.ativo_id = a.id
) h on true
left join lateral (
  select count(*)::int as termos
    from public.termos_gerados tg
   where a.id = any (tg.ativo_ids)
) t on true;

notify pgrst, 'reload schema';

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) nenhuma das três ficou com overload (assinatura idêntica → create or replace puro):
--   select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('rel_estoque_asof','aplicar_movimentacao');
--   -- esperado: EXATAMENTE 2 linhas
--
--   -- 2) o desempate novo está no ar, e o velho saiu:
--   select p.proname,
--          pg_get_functiondef(p.oid) like '%e.data desc, e.ordem desc%'      as tem_regua_nova,
--          pg_get_functiondef(p.oid) like '%(m.created_at, m.id)%'           as tem_regua_velha
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('rel_estoque_asof','aplicar_movimentacao');
--
--   -- 3) as 12 datas de amostra: o conjunto tem de bater com o capturado ANTES do apply
--   --    (docs/f53-evidencias/asof-12datas-ANTES-*.json), por HASH do conjunto ordenado.
--
--   -- 4) a trava do estorno segue recusando a penúltima — supabase/tests/asof_desempate.sql
--   --    (rótulos 4a e 4b). Rode TODOS os roteiros: esta migration mexe em função E em trigger.
