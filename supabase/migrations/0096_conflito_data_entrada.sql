-- Migration 0096 — F24: a mesa precisa da DATA DE ENTRADA de cada lado.
--
-- Contexto: docs/prompts/F24-import-conflito-filiais-ultracode.md §3.1, que lista
-- explicitamente "data de entrada" entre os campos que a mesa mostra lado a lado.
--
-- ADITIVA e SÓ-LEITURA (uma coluna no fim do select da view) → caminho A do RUNBOOK.
--
-- Por que uma migration à parte, e não uma emenda na 0092: migration aplicada não se
-- edita (regra da casa). E por que a coluna não nasceu na 0092: só ao montar a comparação
-- campo a campo ficou claro que "quando este cadastro entrou" é justamente um dos sinais
-- que fazem alguém decidir qual dos dois é o certo — o cadastro mais antigo costuma ser o
-- verdadeiro, e o recém-criado, a duplicata que o import acabou de abrir.
--
-- `entrada_em` = a data da PRIMEIRA movimentação do ativo. É a mesma noção de "entrada"
-- que o resto do sistema usa: a RPC de import grava a compra de abertura com a data real
-- da planilha (`dataEntrada`), e o cadastro manual grava a compra com a data informada.
-- NULL quando o ativo não tem movimentação nenhuma (possível, embora raro).
--
-- ⚠ `create or replace view` só admite colunas NOVAS no FIM da lista. Por isso `entrada_em`
-- entra depois de `tem_historico_real`, e não perto das outras datas.

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
      order by m2.data desc, m2.created_at desc
      limit 1)                                                           as ultima_mov_tipo
  from public.movimentacoes m
  where m.ativo_id = a.id
) h on true
left join lateral (
  select count(*)::int as termos
    from public.termos_gerados tg
   where a.id = any (tg.ativo_ids)
) t on true;

comment on view public.v_conflitos_filiais is
  'F24: ativos cuja identidade (chave_identidade_ativo) existe em MAIS DE UMA filial — o estado "em conflito", DERIVADO, nunca gravado. Uma linha por ativo do grupo (2+; três filiais é raro mas representável). Traz o resumo de histórico do lado, a data de entrada (primeira movimentação) e o selo tem_historico_real que o diálogo de exclusão reusa. security_invoker. Some sozinha quando o grupo se desfaz (apagou um lado, corrigiu a chave, transferiu).';

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='v_conflitos_filiais' and column_name='entrada_em';
--   -- esperado: 1 linha
--   select count(*) from public.v_conflitos_filiais_grupos;  -- a view agregada continua de pé
