-- Migration 0092 — F24: o CONFLITO ENTRE FILIAIS é derivado, nunca gravado.
--
-- Contexto: docs/prompts/F24-import-conflito-filiais-ultracode.md §1.2 e §3.
-- Depende da 0091 (sem os índices por filial, o conflito não pode nem existir).
--
-- =============================================================================
-- POR QUE DERIVADO
-- =============================================================================
-- A ordem §1.2 é explícita: nada de flag, nada de tabela de estado. O motivo é que o
-- conflito não é um FATO que alguém registra — é uma CONSEQUÊNCIA de duas linhas do acervo
-- terem a mesma identidade em filiais diferentes. Uma flag teria de ser mantida em sincronia
-- por trigger em cinco caminhos distintos (import, cadastro, corrigir patrimônio, definir
-- service tag, apagar), e o primeiro que esquecesse deixaria a mesa mentindo — mostrando
-- conflito resolvido ou escondendo conflito aberto.
--
-- Derivado, o conflito SOME SOZINHO quando o grupo deixa de existir, seja qual for o
-- caminho: apagou um lado (a RPC da 0093), corrigiu o patrimônio/service tag na ficha,
-- transferiu pelo fluxo normal de movimentação. Nenhum desses caminhos precisa saber que a
-- mesa existe.
--
-- §1.3 da ordem, pelo mesmo motivo: `ativos.pendencia` (texto livre, editável e `;`-joinável)
-- NÃO ganha trecho de conflito. Ele dessincronizaria da derivação no primeiro edit manual.
-- O tipo 'conflito' da tela de pendências vem DAQUI, não de lá.
--
-- =============================================================================
-- A DEFINIÇÃO DO GRUPO MORA NUM LUGAR SÓ
-- =============================================================================
-- `chave_identidade_ativo` é essa fonte única. A view abaixo e a RPC de exclusão (0093)
-- chamam a MESMA função — a ordem §1.2 avisa que duas cópias da regra é o caminho para a
-- mesa e a RPC discordarem, e discordar aqui significa a RPC recusar o que a mesa ofereceu
-- (ou, muito pior, aceitar o que a mesa não ofereceu).
--
-- A chave espelha EXATAMENTE os dois índices da 0091, agora sem o filial_id (que é o eixo
-- que se compara, não parte da identidade):
--   · com patrimônio  → patrimonio || '::' || coalesce(service_tag,'')   [índice composto]
--   · sem patrimônio  → '∅::' || service_tag                            [índice parcial]
--   · sem os dois     → NULL = SEM IDENTIDADE, nunca entra em conflito
--
-- O sentinela `∅` (U+2205) é o mesmo de `src/lib/patrimonio.ts` (SEM_PATRIMONIO), onde o
-- motor do import monta a chave gêmea. U+2205 não ocorre em patrimônio canônico
-- ([A-Z]{2,4}\d{7}), então os dois espaços de chave convivem sem colisão.
--
-- ⚠ A comparação é EXATA (case-sensitive), como os índices e como a 2ª passada do motor. Já
-- foi decidido assim na F7E e a razão continua valendo: normalizar acusaria colisão que o
-- banco NÃO teria, e a mesa ofereceria para apagar um par que não conflita de verdade.

create or replace function public.chave_identidade_ativo(
  p_patrimonio  text,
  p_service_tag text
)
returns text
language sql
immutable
parallel safe
set search_path to 'public'
as $$
  select case
           when p_patrimonio is not null
             then p_patrimonio || '::' || coalesce(p_service_tag, '')
           when coalesce(p_service_tag, '') <> ''
             then '∅::' || p_service_tag
           else null
         end
$$;

comment on function public.chave_identidade_ativo(text, text) is
  'F24: FONTE ÚNICA da identidade do ativo para fins de conflito entre filiais. Espelha os dois índices da 0091 sem o filial_id. NULL = ativo sem identidade (sem patrimônio e sem service tag), que nunca entra em conflito. Usada pela view v_conflitos_filiais e pela RPC apagar_ativos_conflito_filiais (0093) — as duas TÊM de concordar.';


-- =============================================================================
-- O MARCADOR DA CARGA DO IMPORT
-- =============================================================================
-- Ordem §4.3: o diálogo avisa, em destaque, quando um ativo selecionado tem HISTÓRICO REAL
-- além da carga do import — porque quem tem vida de sistema provavelmente é o cadastro certo,
-- e apagá-lo é perder movimentação que alguém registrou de verdade.
--
-- "Carga do import" foi MEDIDO, não presumido (produção, 30/07/2026): a RPC
-- `importar_ativos_substituir` grava as movimentações de abertura com
-- `observacao = 'import startup ' || to_char(current_date, 'DD/MM/YYYY')` — nos passos 4b
-- (compra de abertura) e 4c (ajuste de reconciliação). São 2.339 das 2.377 movimentações de
-- produção. Toda movimentação FORA desse padrão é história real: 38 linhas hoje.
--
-- Fica como função para que a view, a RPC e o roteiro SQL usem o MESMO predicado.

create or replace function public.mov_da_carga_import(p_observacao text)
returns boolean
language sql
immutable
parallel safe
set search_path to 'public'
as $$
  select coalesce(p_observacao, '') like 'import startup %'
$$;

comment on function public.mov_da_carga_import(text) is
  'F24: a movimentação é da CARGA do import de startup? Espelha o marcador que importar_ativos_substituir grava (passos 4b/4c): ''import startup dd/MM/yyyy''. Usada para separar "história real" de "linha nascida da carga" na mesa de conflitos.';


-- =============================================================================
-- v_conflitos_filiais — UMA LINHA POR ATIVO EM CONFLITO
-- =============================================================================
-- security_invoker = true, como todas as views da casa (0006/0028/0052): a view respeita a
-- RLS de quem consulta. O piso de leitura do projeto é `papel_atual() is not null` (todo
-- logado ATIVO lê tudo), então todo cargo enxerga a mesa — quem NÃO enxerga é perfil
-- desativado ou arquivado, e é assim que tem de ser.
--
-- Traz, por lado, o que a mesa precisa para alguém DECIDIR (ordem §3.1/§3.2): os campos do
-- cadastro, o resumo de histórico e o selo de "tem história real". Os agregados são
-- LATERAIS e só rodam para as linhas que já estão em conflito — um conjunto minúsculo (zero
-- hoje; o primeiro caso real do Johnny teve 6 ativos). O custo medido da derivação sobre o
-- volume real de produção (1.232 ativos) foi de 5,2 ms a quente / 84 ms a frio, o que
-- descarta a alternativa materializada com trigger de manutenção que a ordem §1.2 admitia
-- como plano B. Decisão registrada em docs/DECISOES.md.

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
  -- Resumo de histórico do lado (ordem §3.2).
  coalesce(h.movimentacoes, 0)           as movimentacoes,
  coalesce(h.movimentacoes_reais, 0)     as movimentacoes_reais,
  h.ultima_mov_data,
  h.ultima_mov_tipo,
  coalesce(t.termos, 0)                  as termos,
  -- O SELO que o diálogo da exclusão reusa (ordem §4.3): tem vida de sistema além da carga?
  -- Termo gerado também conta: alguém imprimiu e (provavelmente) colheu assinatura.
  (coalesce(h.movimentacoes_reais, 0) > 0 or coalesce(t.termos, 0) > 0) as tem_historico_real
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
  'F24: ativos cuja identidade (chave_identidade_ativo) existe em MAIS DE UMA filial — o estado "em conflito", DERIVADO, nunca gravado. Uma linha por ativo do grupo (2+; três filiais é raro mas representável). Traz o resumo de histórico do lado e o selo tem_historico_real que o diálogo de exclusão reusa. security_invoker. Some sozinha quando o grupo se desfaz (apagou um lado, corrigiu a chave, transferiu).';


-- =============================================================================
-- v_conflitos_filiais_grupos — UMA LINHA POR GRUPO (é por ela que a mesa pagina)
-- =============================================================================
-- A mesa lista GRUPOS, não ativos: paginar sobre a view de ativos cortaria um grupo ao meio
-- entre duas páginas, que é exatamente o que a mesa não pode fazer (o sentido dela é ver os
-- lados JUNTOS). Com esta view a página lê N grupos com `.range()` e depois busca os ativos
-- desses grupos por `.in('chave', …)` — dois passos, sem grupo partido.
--
-- `rotulo` é como o grupo se chama na tela e na confirmação: o patrimônio quando há, senão a
-- service tag. Espelha a régua de rótulo de `rotuloDoAtivo` (validators/dev-destrutivo.ts) e
-- do `coalesce` de `apagar_ativo` (0082).

create or replace view public.v_conflitos_filiais_grupos
with (security_invoker = true) as
select
  c.chave,
  count(*)::int                              as ativos,
  count(distinct c.filial_id)::int           as filiais,
  min(c.patrimonio)                          as patrimonio,
  min(c.service_tag)                         as service_tag,
  coalesce(min(c.patrimonio), min(c.service_tag), min(c.ativo_id::text)) as rotulo,
  string_agg(distinct c.filial_nome, ' · ' order by c.filial_nome) as filiais_nomes,
  bool_or(c.tem_historico_real)              as algum_com_historico_real,
  max(c.updated_at)                          as visto_em
from public.v_conflitos_filiais c
group by c.chave;

comment on view public.v_conflitos_filiais_grupos is
  'F24: um GRUPO de conflito por linha (agregado de v_conflitos_filiais). É por esta view que a mesa de /pendencias pagina — paginar sobre os ATIVOS cortaria um grupo entre duas páginas, e o sentido da mesa é ver os lados juntos. rotulo = patrimônio, ou service tag quando não há patrimônio. security_invoker.';
