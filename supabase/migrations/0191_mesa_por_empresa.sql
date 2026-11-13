-- =============================================================================
-- 0191_mesa_por_empresa.sql — F67 (13/11/2026): a mesa de conflitos POR EMPRESA (EXPANSÃO)
-- =============================================================================
-- classe: ADITIVA (as duas views recriadas com a partição por empresa e uma coluna nova no FIM; duas funções NOVAS ao lado
--         das antigas, de mesmo nome; a mesa ANTIGA só com a chave da trava advisory convertida; nenhuma linha muda)
--
-- O CONFLITO ENTRE EMPRESAS FICA IMPOSSÍVEL POR CONSTRUÇÃO (fato 17; docs/PLAN-F67.md, decisão 9). Até aqui o
-- `group by chave having count(distinct filial_id) > 1` rodava sobre `ativos` INTEIRA: duas empresas com numeração
-- patrimonial parecida formariam grupo entre si, a mesa exibiria o gêmeo ALHEIO — e ele autorizaria a exclusão do próprio.
--
--   v_conflitos_filiais / v_conflitos_filiais_grupos   agrupam por (EMPRESA DA FILIAL, chave): um grupo nunca atravessa
--                                                       empresas. A view NÃO cita `empresa_id` (a 7c de
--                                                       empresa_no_acervo.sql recusa view que leia a coluna junto do
--                                                       acervo): a empresa vem de `empresa_da_filial(a.filial_id)` (0185),
--                                                       que lê `filiais`; a FK composta da F65 garante que é a do ativo.
--                                                       Ganham a coluna `empresa` no FIM (create or replace view só
--                                                       acrescenta no fim — PG 17, sql-createview). `security_invoker` fica.
--   exigir_ativos_da_empresa(p_empresa, p_ids)          NOVA: todo id é desta empresa, senão 42501 (era um no-op da F52).
--   apagar_ativos_conflito_filiais(p_empresa, …)        NOVA: administrador DESTA empresa; trava o resto do grupo e o
--                                                       recalcula DENTRO dela; recusa id de outra empresa (42501); a
--                                                       trilha grava a empresa.
--
-- A TRAVA ADVISORY (decisão 8): a família `hashtext('conflito_filiais_apagar')` era `(bigint)`, uma chave para o sistema
-- inteiro; passa a `(int, int)` com a empresa — `(hashtext('conflito_filiais_apagar'), hashtext(<empresa>::text))`. A
-- antiga e a nova TÊM de tomar a MESMA chave enquanto vivem juntas: a mesa ANTIGA é recriada AQUI com a empresa legada (a
-- única troca nela — o diff do prosrc é essa linha). Colisão de hash só serializa, nunca libera.
--
-- `import_contar_conflitos` lê a view por filial e passa a contar só dentro da empresa, sem ser recriada.
-- =============================================================================

set lock_timeout = '2s';

-- ---------------------------------------------------------------------------
-- 1) as views — a partição por (empresa da filial, chave)
-- ---------------------------------------------------------------------------
create or replace view public.v_conflitos_filiais
with (security_invoker = true) as
with ident as (
  select
    a.id,
    a.filial_id,
    public.empresa_da_filial(a.filial_id) as empresa,
    public.chave_identidade_ativo(a.patrimonio, a.service_tag) as chave
  from public.ativos a
),
grupos as (
  select i.empresa, i.chave
    from ident i
   where i.chave is not null
   group by i.empresa, i.chave
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
  h.entrada_em,
  i.empresa
from ident i
join grupos g   on g.chave = i.chave and g.empresa = i.empresa
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
  max(c.updated_at)                          as visto_em,
  c.empresa
from public.v_conflitos_filiais c
group by c.empresa, c.chave;

-- ---------------------------------------------------------------------------
-- 2) a guarda de pertencimento — NOVA
-- ---------------------------------------------------------------------------
create function public.exigir_ativos_da_empresa(p_empresa uuid, p_ids uuid[])
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_empresa is null then
    raise exception 'Informe a empresa da operação.' using errcode = '42501';
  end if;

  -- F67: todo id é desta empresa. A leitura de `public.ativos` acontece DEPOIS da etapa (3) do lock da mesa (a chamada
  -- está no lugar certo desde a F52) — ler linha ainda não travada é a porta de TOCTOU que a 0098 fechou.
  if exists (select 1 from unnest(p_ids) x(id) join public.ativos a on a.id = x.id where a.empresa_id <> p_empresa) then
    raise exception 'Este registro pertence a outra empresa.' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) a mesa — NOVA
-- ---------------------------------------------------------------------------
create function public.apagar_ativos_conflito_filiais(
  p_empresa       uuid,
  p_ativos        uuid[],
  p_confirmacao   text,
  p_justificativa text,
  p_backup_path   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_cap_inline  constant int := 25;
  c_max_lote    constant int := 200;

  v_uid         uuid := (select auth.uid());
  v_ids         uuid[];
  v_n           int;
  v_esperado    text;
  v_chaves      text[];
  v_faltam      text[];
  v_fora        text[];
  v_backup      jsonb;
  v_resumo      jsonb;
  v_movs        int := 0;
  v_anot        int := 0;
  v_pend        int := 0;
  v_termos      int := 0;
  v_subst       int := 0;
  v_arquivos    text[] := '{}'::text[];
  v_inline      boolean;
  v_digest      text;
begin
  if v_uid is null then
    raise exception 'Operador não autenticado.' using errcode = '42501';
  end if;

  if p_empresa is null then
    raise exception 'Informe a empresa da operação.' using errcode = '42501';
  end if;

  -- F67: administrador DESTA empresa.
  if not public.e_admin_na(p_empresa) then
    raise exception 'Apenas administradores podem resolver conflitos entre filiais.'
      using errcode = '42501';
  end if;

  if coalesce(length(btrim(p_justificativa)), 0) < 10 then
    raise exception 'A justificativa é obrigatória e precisa ter pelo menos 10 caracteres.'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
    into v_ids
    from unnest(coalesce(p_ativos, '{}'::uuid[])) x
   where x is not null;

  v_n := coalesce(cardinality(v_ids), 0);
  if v_n = 0 then
    raise exception 'Nenhum ativo selecionado para apagar.' using errcode = '22023';
  end if;
  if v_n > c_max_lote then
    raise exception 'Seleção grande demais (% ativos; máximo de % por operação).', v_n, c_max_lote
      using errcode = '22023';
  end if;

  v_esperado := 'APAGAR ' || v_n::text;
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" para apagar.', v_esperado
      using errcode = '22023';
  end if;

  select coalesce(array_agg(x::text order by x::text), '{}'::text[])
    into v_faltam
    from unnest(v_ids) x
   where not exists (select 1 from public.ativos a where a.id = x);

  if cardinality(v_faltam) > 0 then
    raise exception 'Ativo(s) não encontrado(s): %. Nada foi apagado — recarregue a página.',
      array_to_string(v_faltam[1:5], ', ')
      using errcode = 'P0002';
  end if;

  -- SERIALIZA a ferramenta POR EMPRESA, antes de QUALQUER lock de linha (0100; F67: a chave carrega a empresa).
  perform pg_advisory_xact_lock(hashtext('conflito_filiais_apagar'), hashtext(p_empresa::text));

  -- LOCK EM DOIS TEMPOS (0098): (1) as linhas SELECIONADAS por id.
  perform 1 from public.ativos a
   where a.id = any (v_ids)
   order by a.id
     for update;

  -- (2) SÓ AGORA lê as chaves — já sob trava.
  select coalesce(array_agg(distinct k), '{}'::text[])
    into v_chaves
    from public.ativos a
    cross join lateral (select public.chave_identidade_ativo(a.patrimonio, a.service_tag) as k) c
   where a.id = any (v_ids)
     and c.k is not null;

  -- (3) trava o RESTO do grupo — DENTRO DESTA EMPRESA: o gêmeo de outra empresa não é do grupo.
  if cardinality(v_chaves) > 0 then
    perform 1
       from public.ativos a
      where a.empresa_id = p_empresa
        and public.chave_identidade_ativo(a.patrimonio, a.service_tag) = any (v_chaves)
        and not (a.id = any (v_ids))
      order by a.id
        for update;
  end if;

  -- F67: OS ATIVOS SÃO DESTA EMPRESA? Depois da etapa (3) (leitura própria de `ativos`, já travada), antes da revalidação
  -- do grupo (pertencimento é recusa mais fundamental que "saiu do conflito") e fora da janela `estoque.dev_destrutivo`.
  perform public.exigir_ativos_da_empresa(p_empresa, v_ids);

  -- O grupo é recalculado DENTRO desta empresa.
  with ident as (
    select a.id, a.filial_id,
           public.chave_identidade_ativo(a.patrimonio, a.service_tag) as chave
      from public.ativos a
     where a.empresa_id = p_empresa
  ),
  grupos as (
    select i.chave from ident i
     where i.chave is not null
     group by i.chave
    having count(distinct i.filial_id) > 1
  ),
  em_conflito as (
    select i.id from ident i join grupos g on g.chave = i.chave
  )
  select coalesce(array_agg(rot order by rot), '{}'::text[])
    into v_fora
    from (
      select coalesce(nullif(btrim(a.patrimonio), ''),
                      nullif(btrim(a.service_tag), ''),
                      a.id::text) as rot
        from unnest(v_ids) x
        join public.ativos a on a.id = x
       where x not in (select id from em_conflito)
    ) s;

  if cardinality(v_fora) > 0 then
    raise exception 'Esta ferramenta só apaga ativo que esteja em conflito entre filiais, e % não está: %. Nada foi apagado.',
      case when cardinality(v_fora) = 1 then 'um dos selecionados' else 'nem todos os selecionados' end,
      array_to_string(v_fora[1:5], ', ')
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.termos_gerados t
     where exists (select 1 from unnest(t.ativo_ids) x(id) where x.id = any (v_ids))
       and exists (select 1 from unnest(t.ativo_ids) x(id) where not (x.id = any (v_ids)))
  ) then
    raise exception 'Um dos selecionados está num termo que também cobre ativos fora desta seleção: apagá-lo destruiria um documento que não é só dele. Apague o termo primeiro, ou inclua na seleção os outros ativos do mesmo termo.'
      using errcode = '42501';
  end if;

  v_inline := (v_n <= c_cap_inline);

  if not v_inline then
    if coalesce(length(btrim(p_backup_path)), 0) = 0 then
      raise exception 'Seleção com mais de % ativos exige backup em arquivo: o caminho não veio. Nada foi apagado.', c_cap_inline
        using errcode = '22023';
    end if;
    v_digest := public.digest_selecao_conflito(v_ids);
    if btrim(p_backup_path) not like public.prefixo_backup_conflito() || v_digest || '/%' then
      raise exception 'O backup informado não é o backup desta operação (esperado sob "%"). Nada foi apagado.',
        public.prefixo_backup_conflito() || v_digest || '/'
        using errcode = '22023';
    end if;
    if not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'backups-import' and o.name = btrim(p_backup_path)
    ) then
      raise exception 'O backup dos conflitos não existe no bucket (%). Nada foi apagado. Refaça a seleção.', btrim(p_backup_path)
        using errcode = '22023';
    end if;
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'ativo_id',    a.id,
             'patrimonio',  a.patrimonio,
             'service_tag', a.service_tag,
             'filial_id',   a.filial_id,
             'filial',      f.nome,
             'status',      a.status
           ) order by a.filial_id, a.id)
    into v_resumo
    from public.ativos a
    join public.filiais f on f.id = a.filial_id
   where a.id = any (v_ids);

  if v_inline then
    select jsonb_agg(
             jsonb_build_object(
               'ativo',           to_jsonb(a),
               'movimentacoes',   coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at, m.id)
                                              from public.movimentacoes m where m.ativo_id = a.id), '[]'::jsonb),
               'termos',          coalesce((select jsonb_agg(to_jsonb(t))
                                              from public.termos_gerados t where a.id = any (t.ativo_ids)), '[]'::jsonb),
               'anotacoes',       coalesce((select jsonb_agg(to_jsonb(an))
                                              from public.anotacoes an where an.ativo_id = a.id), '[]'::jsonb),
               'pendencias_item', coalesce((select jsonb_agg(to_jsonb(pi))
                                              from public.pendencias_item pi where pi.ativo_id = a.id), '[]'::jsonb)
             ) order by a.id)
      into v_backup
      from public.ativos a
     where a.id = any (v_ids);
  end if;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.pendencias_item where ativo_id = any (v_ids);
  get diagnostics v_pend = row_count;

  with del as (
    delete from public.termos_gerados t
     where exists (select 1 from unnest(t.ativo_ids) x(id) where x.id = any (v_ids))
    returning t.arquivo_path
  )
  select coalesce(array_agg(arquivo_path), '{}'::text[]), count(*)::int
    into v_arquivos, v_termos
    from del;

  delete from public.anotacoes where ativo_id = any (v_ids);
  get diagnostics v_anot = row_count;

  delete from public.movimentacoes where ativo_id = any (v_ids);
  get diagnostics v_movs = row_count;

  update public.ativos set substitui_ativo_id = null
   where substitui_ativo_id = any (v_ids) and not (id = any (v_ids));
  get diagnostics v_subst = row_count;

  delete from public.ativos where id = any (v_ids);

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (empresa_id, autor, acao, alvo, detalhe)
  values (p_empresa, v_uid, 'conflito_filiais_resolvido',
          coalesce((v_resumo->0->>'patrimonio'), (v_resumo->0->>'service_tag'), v_n::text || ' ativos'),
          jsonb_build_object(
            'justificativa',      btrim(p_justificativa),
            'ativos',             v_n,
            'selecionados',       coalesce(v_resumo, '[]'::jsonb),
            'movimentacoes',      v_movs,
            'anotacoes',          v_anot,
            'pendencias_item',    v_pend,
            'termos',             v_termos,
            'ponteiros_anulados', v_subst,
            'arquivos_termos',    to_jsonb(v_arquivos),
            'backup_em_arquivo',  (not v_inline),
            'backup_path',        nullif(btrim(coalesce(p_backup_path, '')), ''),
            'backup',             coalesce(v_backup, 'null'::jsonb)));

  return jsonb_build_object(
    'ativos',             v_n,
    'movimentacoes',      v_movs,
    'anotacoes',          v_anot,
    'pendencias_item',    v_pend,
    'termos',             v_termos,
    'ponteiros_anulados', v_subst,
    'arquivos_termos',    to_jsonb(v_arquivos),
    'selecionados',       coalesce(v_resumo, '[]'::jsonb));

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) a mesa ANTIGA — SÓ a chave da trava advisory (a empresa legada). Nada mais muda.
-- ---------------------------------------------------------------------------
create or replace function public.apagar_ativos_conflito_filiais(
  p_ativos        uuid[],
  p_confirmacao   text,
  p_justificativa text,
  p_backup_path   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_cap_inline  constant int := 25;
  c_max_lote    constant int := 200;

  v_uid         uuid := (select auth.uid());
  v_ids         uuid[];
  v_n           int;
  v_esperado    text;
  v_chaves      text[];
  v_faltam      text[];
  v_fora        text[];
  v_backup      jsonb;
  v_resumo      jsonb;
  v_movs        int := 0;
  v_anot        int := 0;
  v_pend        int := 0;
  v_termos      int := 0;
  v_subst       int := 0;
  v_arquivos    text[] := '{}'::text[];
  v_inline      boolean;
  -- (0100) o md5 do lote — o caminho do backup em arquivo tem de estar sob ele.
  v_digest      text;
begin
  if v_uid is null then
    raise exception 'Operador não autenticado.' using errcode = '42501';
  end if;

  if not public.e_admin() then
    raise exception 'Apenas administradores podem resolver conflitos entre filiais.'
      using errcode = '42501';
  end if;

  if coalesce(length(btrim(p_justificativa)), 0) < 10 then
    raise exception 'A justificativa é obrigatória e precisa ter pelo menos 10 caracteres.'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
    into v_ids
    from unnest(coalesce(p_ativos, '{}'::uuid[])) x
   where x is not null;

  v_n := coalesce(cardinality(v_ids), 0);
  if v_n = 0 then
    raise exception 'Nenhum ativo selecionado para apagar.' using errcode = '22023';
  end if;
  if v_n > c_max_lote then
    raise exception 'Seleção grande demais (% ativos; máximo de % por operação).', v_n, c_max_lote
      using errcode = '22023';
  end if;

  v_esperado := 'APAGAR ' || v_n::text;
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" para apagar.', v_esperado
      using errcode = '22023';
  end if;

  select coalesce(array_agg(x::text order by x::text), '{}'::text[])
    into v_faltam
    from unnest(v_ids) x
   where not exists (select 1 from public.ativos a where a.id = x);

  if cardinality(v_faltam) > 0 then
    raise exception 'Ativo(s) não encontrado(s): %. Nada foi apagado — recarregue a página.',
      array_to_string(v_faltam[1:5], ', ')
      using errcode = 'P0002';
  end if;

  -- ---------- (0100) SERIALIZA a ferramenta, antes de QUALQUER lock de linha ----------
  -- O lock em dois tempos abaixo é o que fecha o TOCTOU da 0098, e é também o que permite
  -- duas sessões travarem as mesmas linhas em ordens opostas (X seleciona B e espera A; Y
  -- seleciona A e espera B). `order by a.id` ordena dentro de cada etapa, não entre elas —
  -- a ordem total que a 0093 tinha num statement só não sobrevive à divisão. Serializar
  -- resolve na raiz: sem intercalação não há ordem para inverter. Mesma doutrina do
  -- advisory lock de `importar_ativos_substituir` (0094).
  perform pg_advisory_xact_lock(hashtext('conflito_filiais_apagar'), hashtext(public.empresa_legada()::text));

  -- ---------- LOCK EM DOIS TEMPOS (0098) ----------
  -- (1) trava as linhas SELECIONADAS por ID. O id não muda; a identidade, sim. Travar por
  --     id primeiro é o que impede a identidade de mudar debaixo da leitura seguinte.
  perform 1 from public.ativos a
   where a.id = any (v_ids)
   order by a.id
     for update;

  -- (2) SÓ AGORA lê as chaves — já sob trava, portanto estáveis até o fim da transação.
  select coalesce(array_agg(distinct k), '{}'::text[])
    into v_chaves
    from public.ativos a
    cross join lateral (select public.chave_identidade_ativo(a.patrimonio, a.service_tag) as k) c
   where a.id = any (v_ids)
     and c.k is not null;

  -- (3) trava o RESTO do grupo — os gêmeos que não estão na seleção e que, sem trava,
  --     poderiam sumir entre a revalidação e o delete, deixando o alvo fora de conflito.
  if cardinality(v_chaves) > 0 then
    perform 1
       from public.ativos a
      where public.chave_identidade_ativo(a.patrimonio, a.service_tag) = any (v_chaves)
        and not (a.id = any (v_ids))
      order by a.id
        for update;
  end if;

  -- ---------- F52: OS ATIVOS SÃO DA SUA ORGANIZAÇÃO? ----------
  -- A POSIÇÃO é a decisão 4 da fase, e ela é ditada pelos locks:
  --   · DEPOIS do `pg_advisory_xact_lock` e DEPOIS da etapa (3) — obrigatório, porque a
  --     guarda faz LEITURA PRÓPRIA de `public.ativos`. Ler linha ainda não travada é
  --     exatamente a porta de TOCTOU que a 0098 fechou e a 0100 serializou.
  --   · ANTES da revalidação do grupo, porque pertencimento é uma recusa mais fundamental
  --     que "não está mais em conflito": um ativo de outra organização deve responder que
  --     não é seu, e não que saiu do conflito.
  --   · FORA da janela `estoque.dev_destrutivo`, que só abre bem mais abaixo — a guarda
  --     não tem efeito a desarmar, e a janela continua com exatamente as portas que tinha.
  -- Ela é EXTRAÍDA, e não inline, porque esta RPC é recriada em cadeia (0093 → 0098 → 0100
  -- → 0132) e guarda inline se perde na recriação seguinte — o mecanismo causal que a F51
  -- documentou. Com uma empresa só, ela não levanta nunca.
  perform public.exigir_ativos_da_empresa(v_ids);

  with ident as (
    select a.id, a.filial_id,
           public.chave_identidade_ativo(a.patrimonio, a.service_tag) as chave
      from public.ativos a
  ),
  grupos as (
    select i.chave from ident i
     where i.chave is not null
     group by i.chave
    having count(distinct i.filial_id) > 1
  ),
  em_conflito as (
    select i.id from ident i join grupos g on g.chave = i.chave
  )
  select coalesce(array_agg(rot order by rot), '{}'::text[])
    into v_fora
    from (
      select coalesce(nullif(btrim(a.patrimonio), ''),
                      nullif(btrim(a.service_tag), ''),
                      a.id::text) as rot
        from unnest(v_ids) x
        join public.ativos a on a.id = x
       where x not in (select id from em_conflito)
    ) s;

  if cardinality(v_fora) > 0 then
    raise exception 'Esta ferramenta só apaga ativo que esteja em conflito entre filiais, e % não está: %. Nada foi apagado.',
      case when cardinality(v_fora) = 1 then 'um dos selecionados' else 'nem todos os selecionados' end,
      array_to_string(v_fora[1:5], ', ')
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.termos_gerados t
     where exists (select 1 from unnest(t.ativo_ids) x(id) where x.id = any (v_ids))
       and exists (select 1 from unnest(t.ativo_ids) x(id) where not (x.id = any (v_ids)))
  ) then
    raise exception 'Um dos selecionados está num termo que também cobre ativos fora desta seleção: apagá-lo destruiria um documento que não é só dele. Apague o termo primeiro, ou inclua na seleção os outros ativos do mesmo termo.'
      using errcode = '42501';
  end if;

  v_inline := (v_n <= c_cap_inline);

  if not v_inline then
    if coalesce(length(btrim(p_backup_path)), 0) = 0 then
      raise exception 'Seleção com mais de % ativos exige backup em arquivo: o caminho não veio. Nada foi apagado.', c_cap_inline
        using errcode = '22023';
    end if;
    -- (0100) O caminho tem de estar sob o PREFIXO e sob o DIGEST DESTE lote. Conferir só o
    -- prefixo aceitava o backup de qualquer outra exclusão de conflito que estivesse no
    -- bucket — inclusive a sobra de uma tentativa recusada. A mensagem preserva a frase
    -- "não é o backup desta operação", que é por onde `erros.ts` a reconhece.
    v_digest := public.digest_selecao_conflito(v_ids);
    if btrim(p_backup_path) not like public.prefixo_backup_conflito() || v_digest || '/%' then
      raise exception 'O backup informado não é o backup desta operação (esperado sob "%"). Nada foi apagado.',
        public.prefixo_backup_conflito() || v_digest || '/'
        using errcode = '22023';
    end if;
    if not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'backups-import' and o.name = btrim(p_backup_path)
    ) then
      raise exception 'O backup dos conflitos não existe no bucket (%). Nada foi apagado. Refaça a seleção.', btrim(p_backup_path)
        using errcode = '22023';
    end if;
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'ativo_id',    a.id,
             'patrimonio',  a.patrimonio,
             'service_tag', a.service_tag,
             'filial_id',   a.filial_id,
             'filial',      f.nome,
             'status',      a.status
           ) order by a.filial_id, a.id)
    into v_resumo
    from public.ativos a
    join public.filiais f on f.id = a.filial_id
   where a.id = any (v_ids);

  if v_inline then
    select jsonb_agg(
             jsonb_build_object(
               'ativo',           to_jsonb(a),
               'movimentacoes',   coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at, m.id)
                                              from public.movimentacoes m where m.ativo_id = a.id), '[]'::jsonb),
               'termos',          coalesce((select jsonb_agg(to_jsonb(t))
                                              from public.termos_gerados t where a.id = any (t.ativo_ids)), '[]'::jsonb),
               'anotacoes',       coalesce((select jsonb_agg(to_jsonb(an))
                                              from public.anotacoes an where an.ativo_id = a.id), '[]'::jsonb),
               'pendencias_item', coalesce((select jsonb_agg(to_jsonb(pi))
                                              from public.pendencias_item pi where pi.ativo_id = a.id), '[]'::jsonb)
             ) order by a.id)
      into v_backup
      from public.ativos a
     where a.id = any (v_ids);
  end if;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.pendencias_item where ativo_id = any (v_ids);
  get diagnostics v_pend = row_count;

  with del as (
    delete from public.termos_gerados t
     where exists (select 1 from unnest(t.ativo_ids) x(id) where x.id = any (v_ids))
    returning t.arquivo_path
  )
  select coalesce(array_agg(arquivo_path), '{}'::text[]), count(*)::int
    into v_arquivos, v_termos
    from del;

  delete from public.anotacoes where ativo_id = any (v_ids);
  get diagnostics v_anot = row_count;

  delete from public.movimentacoes where ativo_id = any (v_ids);
  get diagnostics v_movs = row_count;

  update public.ativos set substitui_ativo_id = null
   where substitui_ativo_id = any (v_ids) and not (id = any (v_ids));
  get diagnostics v_subst = row_count;

  delete from public.ativos where id = any (v_ids);

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values (v_uid, 'conflito_filiais_resolvido',
          coalesce((v_resumo->0->>'patrimonio'), (v_resumo->0->>'service_tag'), v_n::text || ' ativos'),
          jsonb_build_object(
            'justificativa',      btrim(p_justificativa),
            'ativos',             v_n,
            'selecionados',       coalesce(v_resumo, '[]'::jsonb),
            'movimentacoes',      v_movs,
            'anotacoes',          v_anot,
            'pendencias_item',    v_pend,
            'termos',             v_termos,
            'ponteiros_anulados', v_subst,
            'arquivos_termos',    to_jsonb(v_arquivos),
            'backup_em_arquivo',  (not v_inline),
            'backup_path',        nullif(btrim(coalesce(p_backup_path, '')), ''),
            'backup',             coalesce(v_backup, 'null'::jsonb)));

  return jsonb_build_object(
    'ativos',             v_n,
    'movimentacoes',      v_movs,
    'anotacoes',          v_anot,
    'pendencias_item',    v_pend,
    'termos',             v_termos,
    'ponteiros_anulados', v_subst,
    'arquivos_termos',    to_jsonb(v_arquivos),
    'selecionados',       coalesce(v_resumo, '[]'::jsonb));

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

comment on function public.exigir_ativos_da_empresa(uuid, uuid[]) is
  'F67 (0191; a F52 a criou no-op): todo id informado é um ativo da empresa informada? Senão 42501. Chamada pela mesa DEPOIS da etapa (3) do lock. Fechada.';
comment on function public.apagar_ativos_conflito_filiais(uuid, uuid[], text, text, text) is
  'F67 (0191): a mesa de conflitos entre filiais DA EMPRESA informada — administrador da empresa, ids da empresa, o grupo recalculado dentro dela, a confirmação APAGAR <N>, backup e trilha com a empresa. Trava serializada por empresa.';

revoke all on function public.exigir_ativos_da_empresa(uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.apagar_ativos_conflito_filiais(uuid, uuid[], text, text, text) from public, anon, service_role;
grant execute on function public.apagar_ativos_conflito_filiais(uuid, uuid[], text, text, text) to authenticated;

notify pgrst, 'reload schema';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo e contagem) ----------
--   As duas views com o md5 do pg_get_viewdef = o do CI e a coluna `empresa` no fim; com UMA empresa, a contagem das duas
--   igual à de antes (produção: 120 linhas e 59 grupos, medidos em 13/11/2026). As duas funções novas com o md5 do prosrc
--   = o do CI; a mesa ANTIGA com o prosrc = o do CI (o diff contra o "antes" é SÓ a linha da trava).
--
-- ROLLBACK (supabase/rollback/F67-desfaz.sql, depois de devolver a 0192 e antes da 0190): as duas views de volta ao texto
-- da 0134 e da 0092 (sem a coluna `empresa` — o rollback as derruba e recria, porque create or replace não tira coluna),
-- derrubar as duas funções novas e reemitir a mesa antiga com o corpo da 0132. Nenhum dado se perde.
