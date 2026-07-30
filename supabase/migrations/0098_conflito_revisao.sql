-- Migration 0098 — F24: dois achados da revisão adversarial.
--
-- ADITIVA (dois `create or replace`), nenhum dado tocado. Mas o corpo da primeira função
-- contém `delete from public.ativos` (herdado da 0093) → caminho B por precaução.
--
-- =============================================================================
-- ACHADO 1 — o `for update` podia travar o GRUPO ERRADO
-- =============================================================================
-- O cabeçalho da 0093 afirma: "A revalidação roda DEPOIS do lock, lendo o estado já travado
-- — nunca antes." Verdade para o grupo cujas chaves estão em `v_chaves`. O problema é COMO
-- `v_chaves` é obtido: por um SELECT comum, uma instrução ANTES do `for update`. Em READ
-- COMMITTED cada instrução tem seu próprio snapshot.
--
-- A janela: entre o SELECT das chaves e o `for update`, outra sessão corrige o patrimônio
-- (ou define a service tag) de um ativo SELECIONADO. As chaves em mãos passam a ser as
-- ANTIGAS; o `for update` trava o grupo da identidade antiga, e o ativo — que agora tem
-- outra identidade — fica DESTRAVADO.
--
-- O desfecho ainda era seguro na maioria dos caminhos (a revalidação seguinte lê o estado
-- novo e recusa se ele não estiver mais em conflito), mas a promessa do comentário não se
-- sustentava, e a estreiteza é justamente o que esta RPC vende.
--
-- A CORREÇÃO é de ORDEM, não de mecanismo: travar PRIMEIRO as linhas SELECIONADAS (por id,
-- que não muda), e só então ler as chaves delas — já sob trava — para travar o resto do
-- grupo. Assim a identidade não pode mudar debaixo da leitura que decide o que travar.
--
-- =============================================================================
-- ACHADO 2 — a checagem `patrimonio_duplicado` da /dev virou ruído
-- =============================================================================
-- A 1ª checagem de `dev_checagens_integridade` agrupa por `(patrimonio, service_tag)` SEM
-- filial — ela nasceu quando a identidade era global, e ali "par repetido" significava
-- defeito. Depois da 0091, todo conflito entre filiais é, por construção, um par repetido:
-- a checagem passaria a acusar como "duplicidade" exatamente o que a nona checagem já conta
-- como conflito, e o dev leria o mesmo fato duas vezes com dois nomes — um deles alarmante.
--
-- A correção mantém a checagem 1 fazendo o que ela sempre fez (duplicidade DENTRO da
-- filial, que continua sendo defeito real e impossível pelo índice — logo, se aparecer, é
-- corrupção) e deixa o cruzamento entre filiais para a checagem 9, que é a casa dele.

-- ---------------------------------------------------------------------------
-- 1) apagar_ativos_conflito_filiais — só a ORDEM do lock muda
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
  --     `order by a.id` evita deadlock entre execuções sobre grupos que se cruzam.
  if cardinality(v_chaves) > 0 then
    perform 1
       from public.ativos a
      where public.chave_identidade_ativo(a.patrimonio, a.service_tag) = any (v_chaves)
        and not (a.id = any (v_ids))
      order by a.id
        for update;
  end if;

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
    if btrim(p_backup_path) not like public.prefixo_backup_conflito() || '%' then
      raise exception 'O backup informado não é o backup desta operação (esperado sob "%"). Nada foi apagado.', public.prefixo_backup_conflito()
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

comment on function public.apagar_ativos_conflito_filiais(uuid[], text, text, text) is
  'F24: apaga ativo(s) que estejam AGORA num grupo de conflito entre filiais — e SÓ eles. Nível administrador (e_admin = admin ou dev), confirmação digitada "APAGAR <N>", justificativa de 10+ caracteres, backup (jsonb no evento até 25 ativos; arquivo conferido no bucket acima disso) e trilha na MESMA transação. All-or-nothing: um único id fora de conflito recusa a operação inteira. LOCK EM DOIS TEMPOS (0098): trava os selecionados por ID, LÊ as chaves já sob trava, e só então trava o resto do grupo — a identidade não pode mudar debaixo da leitura que decide o que travar. NÃO é uma ferramenta genérica de exclusão: apagar ativo fora de conflito segue sendo exclusividade do dev na Zona destrutiva (F23).';


-- ---------------------------------------------------------------------------
-- 2) dev_checagens_integridade — a 1ª checagem volta a ser DENTRO da filial
-- ---------------------------------------------------------------------------
-- Único trecho alterado: o `group by` da checagem 1 ganha `a.filial_id` e o rótulo da
-- amostra ganha a filial. As outras oito são byte a byte as da 0095.
create or replace function public.dev_checagens_integridade()
returns table (chave text, total bigint, amostra text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.e_dev() then
    raise exception 'Esta consulta é restrita ao cargo Desenvolvedor.' using errcode = '42501';
  end if;

  -- 1. par patrimônio + service tag repetido DENTRO DA MESMA FILIAL.
  --    ⚠ O `a.filial_id` no group by é da 0098, e não é detalhe: desde a 0091 a identidade
  --    é por filial, então o par repetido ENTRE filiais é o CONFLITO — estado conhecido,
  --    contado pela checagem 9 e resolvido na mesa de /pendencias. Sem este recorte, as
  --    duas checagens contariam o mesmo fato com dois nomes, e um deles ("duplicidade")
  --    mandaria o dev caçar corrupção onde há apenas trabalho pendente.
  --    Dentro da filial o índice único torna isto IMPOSSÍVEL — logo, se aparecer aqui,
  --    é corrupção de verdade, e a checagem volta a significar o que sempre significou.
  return query
  with d as (
    select a.patrimonio || ' / ' || coalesce(a.service_tag, '—') || ' (' || f.nome || ')' as item
      from public.ativos a
      join public.filiais f on f.id = a.filial_id
     where a.patrimonio is not null
     group by a.filial_id, f.nome, a.patrimonio, a.service_tag
    having count(*) > 1
  )
  select 'patrimonio_duplicado'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 2. ativo em filial desativada
  return query
  with d as (
    select a.patrimonio as item
      from public.ativos a join public.filiais f on f.id = a.filial_id
     where not f.ativo
  )
  select 'ativo_filial_inativa'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 3. termo registrado sem o .docx no bucket
  return query
  with d as (
    select t.arquivo_path as item
      from public.termos_gerados t
      left join storage.objects o on o.bucket_id = 'termos' and o.name = t.arquivo_path
     where o.id is null
  )
  select 'termo_sem_arquivo'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 4. perfil vivo sem conta no Auth (conta removida por fora do app)
  return query
  with d as (
    select p.id::text as item
      from public.profiles p left join auth.users u on u.id = p.id
     where u.id is null and p.excluido_em is null
  )
  select 'perfil_sem_conta'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 5. conta no Auth sem perfil (o trigger handle_new_user falhou)
  return query
  with d as (
    select u.id::text as item
      from auth.users u left join public.profiles p on p.id = u.id
     where p.id is null
  )
  select 'conta_sem_perfil'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 6. pendência de item aberta cuja movimentação de origem foi estornada
  return query
  with d as (
    select pi.id::text as item
      from public.pendencias_item pi
      join public.movimentacoes m on m.id = pi.movimentacao_id
     where pi.resolvida_em is null
       and exists (select 1 from public.movimentacoes e where e.estorno_de = m.id)
  )
  select 'pendencia_de_estornada'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 7. operador ativo sem nenhuma filial de escrita (entra e não registra nada)
  return query
  with d as (
    select p.id::text as item
      from public.profiles p
     where p.papel = 'operador' and p.ativo and p.excluido_em is null
       and not exists (select 1 from public.operador_filiais v where v.usuario_id = p.id)
  )
  select 'operador_sem_filial'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 8. (F23) .docx no bucket sem NENHUMA linha de termo que o explique — o órfão inverso.
  return query
  with d as (
    select o.name as item
      from storage.objects o
     where o.bucket_id = 'termos'
       and not exists (select 1 from public.termos_gerados t where t.arquivo_path = o.name)
  )
  select 'arquivo_termo_orfao'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 9. (F24) grupos de CONFLITO ENTRE FILIAIS em aberto.
  return query
  with d as (
    select g.rotulo as item from public.v_conflitos_filiais_grupos g
  )
  select 'conflito_entre_filiais'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;
end;
$$;

comment on function public.dev_checagens_integridade() is
  'F24 (era F23/F22) (/dev): NOVE checagens de integridade SÓ-LEITURA, com contagem e amostra de até 5 identificadores cada. NÃO corrige nada. Restrita ao cargo dev. O SQL é FIXO aqui de propósito. A primeira (patrimonio_duplicado) conta duplicidade DENTRO da filial — desde a 0098, porque o par repetido ENTRE filiais virou o CONFLITO, que é estado conhecido e tem a checagem 9 só dele. A oitava (arquivo_termo_orfao) é a única que NÃO nasce em zero (3 em produção, resíduo antigo).';

revoke all on function public.dev_checagens_integridade() from public, anon;
grant execute on function public.dev_checagens_integridade() to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) o lock em dois tempos (dois `for update` no corpo):
--   select (length(d) - length(replace(d,'for update','')))/length('for update') as locks
--     from (select pg_get_functiondef('public.apagar_ativos_conflito_filiais(uuid[],text,text,text)'::regprocedure) as d) x;
--   -- esperado: 2
--
--   -- 2) a checagem 1 recortada por filial:
--   select pg_get_functiondef('public.dev_checagens_integridade()'::regprocedure) like '%group by a.filial_id, f.nome%' as por_filial;
--   -- esperado: true
--
--   notify pgrst, 'reload schema';
