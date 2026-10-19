-- =============================================================================
-- 0180_colaboradores_uso_efetivo.sql — v1.71.2 (19/10/2026): o USO EFETIVO de cada cadastro de colaborador
-- =============================================================================
-- classe: ADITIVA (uma função nova, security invoker, só leitura; nenhuma tabela, policy ou função existente muda)
--
-- O PROBLEMA. O cadastro de pessoa nasce no CLIQUE do botão "Cadastrar" do campo Colaborador (`criarColaboradorInline`),
-- antes de a movimentação existir. Quando a movimentação é estornada — ou o formulário é abandonado —, o cadastro fica:
-- nenhum caminho do estorno toca `colaboradores` (doutrina da 0112: "Não se apaga: desativa-se"), e a coluna "Registros"
-- de Administração › Colaboradores conta tudo o que aponta para a pessoa, inclusive o que foi estornado. O administrador
-- não tinha como achar quem sobrou. Esta função responde, PRONTA do banco (a lição do teto de 1.000: contagem nunca
-- nasce de linhas lidas no cliente), quem tem uso efetivo e quantos registros da pessoa foram todos desfeitos.
--
-- A REGRA (docs/PLAN-v1.71.1-v1.71.2.md §2.2). Um cadastro tem USO EFETIVO quando existe pelo menos UM registro da
-- MESMA EMPRESA que continua valendo:
--   (a) movimentação vinculada à pessoa, que não é `estorno` e não tem estorno apontando para ela;
--   (b) lançamento de item vinculado à pessoa, com `estorna_id` nulo e sem inverso apontando para ele;
--   (c) a pessoa é o detentor atual de algum ativo (`ativos.colaborador_atual`, texto — não há coluna de id).
-- "Vinculado" é `colaborador_id = id do cadastro` OU, quando o `colaborador_id` é nulo, `colaborador_chave(texto) =
-- nome_chave` — o histórico anterior à F37 e o que a fila de consolidação transformou em cadastro, que só existe como
-- texto (a resolução POR CHAVE NA LEITURA da 0112). Sem a chave, toda pessoa consolidada seria marcada "sem uso" por
-- engano. Os registros que NÃO continuam valendo (a movimentação estornada, o lançamento com inverso e o próprio
-- inverso) são os `registros_estornados`. `sem_uso` = cadastro ATIVO sem uso efetivo — o selo da tela; inativo nunca.
--
-- POR QUE FUNÇÃO E NÃO VIEW. O "mesma empresa" é um join por `empresa_id`, e a trava 7c de
-- supabase/tests/empresa_no_acervo.sql recusa toda VIEW de public que cite a coluna junto das tabelas do acervo, sem
-- lista de exceção — a regra é que só lê `empresa_id` fora de policy quem está, por nome e por comando, em
-- `k_leitura_tenant` (catalogo_policies.sql, 15h/15k). Esta função entra lá com as quatro tabelas que lê, pelo mesmo
-- motivo das duas rel_* da 0179: é INTEGRIDADE DE JUNÇÃO — o registro da pessoa é o da empresa dela —, não recorte.
-- Quem recorta o que cada um vê é a RLS da F66 (`security invoker`). E o injetor de mutações alcança o corpo de uma
-- função (`mutarFuncao`), coisa que não faz com view.
--
-- O CUSTO. Um comando só, por conjunto: a chave de cada linha do acervo é calculada UMA vez, agregada por
-- (empresa, colaborador) e por (empresa, chave), e juntada a `colaboradores` pelo par — nada de subconsulta por
-- cadastro. Uma linha por cadastro, ativo ou não. Nenhum estado muda: a função só lê, e desativar continua sendo
-- decisão de quem administra, pelo "Editar" da tela.
-- =============================================================================

set lock_timeout = '2s';

create function public.colaboradores_uso_efetivo()
returns table (
  colaborador_id       uuid,
  registros_validos    bigint,
  registros_estornados bigint,
  ativos_com_a_pessoa  bigint,
  uso_efetivo          boolean,
  sem_uso              boolean
)
language sql stable security invoker set search_path = public as $$
  with estornadas as (
    select distinct e.estorno_de as id
      from public.movimentacoes e
     where e.estorno_de is not null
  ),
  desfeitos as (
    select distinct i.estorna_id as id
      from public.lancamentos_item i
     where i.estorna_id is not null
  ),
  registros as (
    select m.empresa_id,
           m.colaborador_id,
           case when m.colaborador_id is null then public.colaborador_chave(m.colaborador) end as chave,
           (x.id is null) as vale
      from public.movimentacoes m
      left join estornadas x on x.id = m.id
     where m.tipo <> 'estorno'
       and (m.colaborador_id is not null or btrim(coalesce(m.colaborador, '')) <> '')
    union all
    select l.empresa_id,
           l.colaborador_id,
           case when l.colaborador_id is null then public.colaborador_chave(l.colaborador) end as chave,
           (l.estorna_id is null and y.id is null) as vale
      from public.lancamentos_item l
      left join desfeitos y on y.id = l.id
     where l.colaborador_id is not null or btrim(coalesce(l.colaborador, '')) <> ''
  ),
  por_id as (
    select r.empresa_id, r.colaborador_id,
           count(*) filter (where r.vale) as validos,
           count(*) filter (where not r.vale) as estornados
      from registros r
     where r.colaborador_id is not null
     group by r.empresa_id, r.colaborador_id
  ),
  por_chave as (
    select r.empresa_id, r.chave,
           count(*) filter (where r.vale) as validos,
           count(*) filter (where not r.vale) as estornados
      from registros r
     where r.colaborador_id is null and r.chave is not null
     group by r.empresa_id, r.chave
  ),
  detentores as (
    select a.empresa_id, public.colaborador_chave(a.colaborador_atual) as chave, count(*) as n
      from public.ativos a
     where btrim(coalesce(a.colaborador_atual, '')) <> ''
     group by 1, 2
  ),
  uso as (
    select c.id,
           c.ativo,
           coalesce(pi.validos, 0) + coalesce(pc.validos, 0) as validos,
           coalesce(pi.estornados, 0) + coalesce(pc.estornados, 0) as estornados,
           coalesce(d.n, 0) as detidos
      from public.colaboradores c
      left join por_id pi on pi.empresa_id = c.empresa_id and pi.colaborador_id = c.id
      left join por_chave pc on pc.empresa_id = c.empresa_id and pc.chave = c.nome_chave
      left join detentores d on d.empresa_id = c.empresa_id and d.chave = c.nome_chave
  )
  select u.id,
         u.validos,
         u.estornados,
         u.detidos,
         (u.validos + u.detidos) > 0,
         u.ativo and (u.validos + u.detidos) = 0
    from uso u
$$;

comment on function public.colaboradores_uso_efetivo() is
  'v1.71.2 (0180): por cadastro de colaborador, os registros da MESMA empresa que continuam valendo (movimentação não estornada, lançamento sem inverso, por colaborador_id ou, com o id nulo, pela chave do nome), os que foram todos desfeitos, os ativos que estão com a pessoa hoje, o uso efetivo e o selo "sem uso" (cadastro ativo sem uso efetivo). Só leitura, security invoker: quem recorta é a RLS; o empresa_id do join é integridade de junção (exceção nominal em k_leitura_tenant).';

revoke all on function public.colaboradores_uso_efetivo() from public, anon;
grant execute on function public.colaboradores_uso_efetivo() to authenticated;

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo e contagem) ----------
--   a função existe com `prosecdef = false`, `provolatile = 's'`, `proconfig = {search_path=public}`, e o md5 do
--   `prosrc` igual ao calculado deste arquivo (o trecho entre os `$$`, LF); `has_function_privilege` dá
--   authenticated = t e anon = f; `select count(*) from public.colaboradores_uso_efetivo()` = `select count(*) from
--   public.colaboradores`; e a contagem de `sem_uso` igual à do instrumento só-leitura
--   docs/v1.71.2-evidencias/medir-uso.mts no mesmo banco.
--
-- ROLLBACK: derrubar a função nova, colaboradores_uso_efetivo (a única coisa que esta migration cria) — aditiva, nada
-- mais a desfazer, nenhum dado foi tocado. Antes, o app volta à versão que não a chama (a tela de colaboradores a lê).
-- Descrito em prosa de propósito: o leitor de corpo vigente (scripts/db/corpo-vigente.mjs) lê o arquivo cru.
