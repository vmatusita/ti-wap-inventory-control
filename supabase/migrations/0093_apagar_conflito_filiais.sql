-- Migration 0093 — F24: a EXCLUSÃO presa ao conflito.
--
-- Contexto: docs/prompts/F24-import-conflito-filiais-ultracode.md §4 ("o coração da ordem").
-- Depende da 0091 (índices por filial) e da 0092 (chave_identidade_ativo + as views).
--
-- ⚠ Esta migration contém `delete from public.ativos` / `delete from public.movimentacoes`:
-- ela BATE NO GATE do modo automático (docs/RUNBOOK-BANCO.md). Caminho B, precedente F23/0080.
--
-- =============================================================================
-- O QUE ESTA RPC É, E O QUE ELA NÃO É
-- =============================================================================
-- É uma ferramenta de exclusão para o NÍVEL ADMINISTRADOR (admin e dev — decisão do Johnny,
-- 30/07/2026), e é a ÚNICA exceção à regra de que apagar ativo é exclusividade do dev na Zona
-- destrutiva (F23). A exceção é estreita de propósito e a estreiteza é o requisito nº 4 da
-- ordem — o item que o Johnny mais quer provado:
--
--   ela só alcança ativo que esteja, NESTE INSTANTE, num grupo de conflito entre filiais.
--
-- Não é "apagar ativo com um filtro na tela". A tela não é a trava. Um request forjado que
-- passe um id qualquer — direto no PostgREST, com a anon key e o próprio JWT — tem de ser
-- recusado aqui, e recusado POR INTEIRO: se UM id da lista estiver fora de conflito, NADA é
-- apagado. All-or-nothing, e não "apaga o que dá".
--
-- NÃO altera nada da F23: `guarda_acervo` (0081) fica como está, e esta RPC é apenas mais um
-- caminho oficial que abre a janela — exatamente como a RPC de import faz desde a 0080.
--
-- =============================================================================
-- A JANELA TOCTOU, E POR QUE TRAVAMOS O GRUPO INTEIRO
-- =============================================================================
-- O perigo real não é o id inventado (a revalidação pega). É o grupo que SE DESFAZ no meio:
--
--   t0  a mesa mostra o grupo {A na Serra, B em Linhares}; alguém marca A.
--   t1  a RPC confere: A está em conflito ✓
--   t2  OUTRA sessão apaga B (ou corrige o patrimônio de B, ou transfere B).
--   t3  a RPC apaga A — mas nesse instante A já não estava em conflito nenhum.
--
-- Travar só as linhas SELECIONADAS não fecha isso: quem some é o GÊMEO, que não está na
-- seleção. Por isso o `for update` abaixo trava TODA linha cuja chave de identidade seja a de
-- algum selecionado — os dois lados, não um. Com os dois travados, a sessão concorrente que
-- quisesse mexer em B fica esperando; quando ela acorda, A já morreu e a revalidação DELA
-- recusa. É a ordem certa em qualquer intercalação.
--
-- O `order by a.id` no lock não é enfeite: duas execuções simultâneas sobre grupos que se
-- cruzam travariam as mesmas linhas em ordens diferentes e se abraçariam num deadlock.
--
-- A revalidação roda DEPOIS do lock, lendo o estado já travado — nunca antes.
--
-- =============================================================================
-- BACKUP: jsonb no evento até o cap, arquivo no bucket acima dele
-- =============================================================================
-- Régua 1.4 da F23: nada some sem backup. Aqui o backup é jsonb no `detalhe` do evento, o que
-- é ESTRITAMENTE melhor que arquivo para o caso comum — entra na mesma transação, então não
-- existe o estado "apagou mas o backup não subiu".
--
-- O cap foi MEDIDO em produção (30/07/2026), não chutado: o jsonb de um ativo com todo o
-- rastro (movimentações, termos, anotações, pendências de item) tem média de 2.294 bytes,
-- p95 de 2.408 e MÁXIMO de 5.864 sobre os 1.232 ativos reais. Com o cap em 25 ativos, o pior
-- caso concebível é ~147 KB de jsonb num campo `detalhe` — confortável — e o caso real que
-- motivou a fase (6 ativos, Serra × Linhares/Matriz) cabe com folga.
--
-- Acima de 25, a RPC EXIGE um arquivo de backup no bucket `backups-import`, sob o prefixo
-- `conflito/`, e CONFERE que ele existe antes de apagar (precedente 0083, endurecido pela
-- 0089: conferir o nome sem conferir o recorte deixava passar o backup de outro import).

-- ---------------------------------------------------------------------------
-- O prefixo do backup — uma régua, dois leitores (a RPC e a Server Action)
-- ---------------------------------------------------------------------------
create or replace function public.prefixo_backup_conflito()
returns text
language sql
immutable
set search_path = public
as $$
  select 'conflito/'
$$;

comment on function public.prefixo_backup_conflito() is
  'F24: o prefixo obrigatório do caminho do backup de uma exclusão de conflito — conflito/. Espelha o caminho que a Server Action grava. Mesma doutrina da 0089: exigir o prefixo transforma o caminho de "um texto qualquer" em uma afirmação verificável sobre o que aquele arquivo é.';

revoke all on function public.prefixo_backup_conflito() from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- apagar_ativos_conflito_filiais
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
  -- Cap do backup jsonb inline. Espelhado em src/lib/validators/conflitos.ts
  -- (CAP_BACKUP_INLINE) e travado por teste — se um lado mudar sozinho, é bug.
  c_cap_inline  constant int := 25;
  -- Teto de sanidade do lote. A mesa pagina; ninguém seleciona mil ativos de uma vez.
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
  -- ---------- 1. quem pode ----------
  if v_uid is null then
    raise exception 'Operador não autenticado.' using errcode = '42501';
  end if;

  -- ⚠ Guarda de cargo INTERNA, obrigatória: esta função é SECURITY DEFINER e passa por fora
  -- de toda policy de RLS. Sem esta linha, qualquer logado — inclusive o cargo `consulta` —
  -- chamaria /rest/v1/rpc/apagar_ativos_conflito_filiais com a anon key e o próprio JWT.
  -- `e_admin()` = admin OU dev (0072), que é o nível decidido pelo Johnny para esta mesa.
  -- NÃO é `exigir_dev_para_destruir`: aquela exige dev, e a F23 fica intocada.
  if not public.e_admin() then
    raise exception 'Apenas administradores podem resolver conflitos entre filiais.'
      using errcode = '42501';
  end if;

  -- A justificativa é o que sobra depois que o dado morre. Vazia, não é justificativa.
  -- Mesma régua de `exigir_dev_para_destruir` (0082) — repetida aqui, e não reusada, porque
  -- aquela função exige cargo dev por dentro.
  if coalesce(length(btrim(p_justificativa)), 0) < 10 then
    raise exception 'A justificativa é obrigatória e precisa ter pelo menos 10 caracteres.'
      using errcode = '22023';
  end if;

  -- ---------- 2. normalização da lista ----------
  -- `distinct` de propósito: id repetido no array não pode inflar a contagem que a pessoa
  -- confirmou ("APAGAR 3" com [X,X,X] apagaria UM ativo achando que apagou três).
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

  -- ---------- 3. confirmação digitada ----------
  -- O texto carrega o TAMANHO justamente para obrigar a leitura do que se vai destruir:
  -- quem quer apagar 2 não consegue confirmar sem digitar 2. Espelhado na action
  -- (src/lib/validators/conflitos.ts) — as DUAS camadas conferem, como manda a ordem §4.3.
  v_esperado := 'APAGAR ' || v_n::text;
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" para apagar.', v_esperado
      using errcode = '22023';
  end if;

  -- ---------- 4. existem? ----------
  select coalesce(array_agg(x::text order by x::text), '{}'::text[])
    into v_faltam
    from unnest(v_ids) x
   where not exists (select 1 from public.ativos a where a.id = x);

  if cardinality(v_faltam) > 0 then
    raise exception 'Ativo(s) não encontrado(s): %. Nada foi apagado — recarregue a página.',
      array_to_string(v_faltam[1:5], ', ')
      using errcode = 'P0002';
  end if;

  -- ---------- 5. LOCK do grupo INTEIRO (os dois lados), depois revalida ----------
  select coalesce(array_agg(distinct k), '{}'::text[])
    into v_chaves
    from public.ativos a
    cross join lateral (select public.chave_identidade_ativo(a.patrimonio, a.service_tag) as k) c
   where a.id = any (v_ids)
     and c.k is not null;

  -- Trava TODA linha dos grupos envolvidos — inclusive o gêmeo que NÃO está na seleção.
  -- `order by a.id` evita deadlock entre duas execuções sobre grupos que se cruzam.
  if cardinality(v_chaves) > 0 then
    perform 1
       from public.ativos a
      where public.chave_identidade_ativo(a.patrimonio, a.service_tag) = any (v_chaves)
      order by a.id
        for update;
  end if;

  -- Revalidação SOB O LOCK, pela MESMA definição da view (0092): a função de chave é a fonte
  -- única, então mesa e RPC não têm como discordar. Ativo sem identidade (patrimônio nulo E
  -- sem service tag) tem chave NULL, nunca entra num grupo, e cai aqui como "fora".
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
    -- Recusa ESTREITA e com saída na mensagem (doutrina das revisões 0087/0090).
    raise exception 'Esta ferramenta só apaga ativo que esteja em conflito entre filiais, e % não está: %. Nada foi apagado.',
      case when cardinality(v_fora) = 1 then 'um dos selecionados' else 'nem todos os selecionados' end,
      array_to_string(v_fora[1:5], ', ')
      using errcode = '42501';
  end if;

  -- ---------- 6. termo de LOTE que cobre ativo fora da seleção ----------
  -- Mesma regra da F23 (0082): um termo é documento assinado. Destruí-lo como efeito colateral
  -- de apagar um dos ativos que ele cobre seria destruir prova de terceiros.
  if exists (
    select 1 from public.termos_gerados t
     where exists (select 1 from unnest(t.ativo_ids) x(id) where x.id = any (v_ids))
       and exists (select 1 from unnest(t.ativo_ids) x(id) where not (x.id = any (v_ids)))
  ) then
    raise exception 'Um dos selecionados está num termo que também cobre ativos fora desta seleção: apagá-lo destruiria um documento que não é só dele. Apague o termo primeiro, ou inclua na seleção os outros ativos do mesmo termo.'
      using errcode = '42501';
  end if;

  -- ---------- 7. backup ANTES da perda ----------
  v_inline := (v_n <= c_cap_inline);

  if not v_inline then
    -- Lote grande: o jsonb sairia do razoável, então o backup é arquivo — e a RPC confere que
    -- ele existe E que é o backup DESTE tipo de operação (prefixo), nunca só que o nome existe.
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
      raise exception 'O backup informado não existe no bucket (%). Nada foi apagado. Gere o backup novamente.', btrim(p_backup_path)
        using errcode = '22023';
    end if;
  end if;

  -- Montado ANTES de qualquer DELETE, obviamente. No caminho de arquivo guardamos só o
  -- resumo (quem era quem) — o conteúdo completo está no objeto conferido acima.
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

  -- ---------- 8. a janela abre ----------
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

  -- O ponteiro do substituto (F14/F15) é anulado, não seguido — mesma decisão da 0082.
  update public.ativos set substitui_ativo_id = null
   where substitui_ativo_id = any (v_ids) and not (id = any (v_ids));
  get diagnostics v_subst = row_count;

  delete from public.ativos where id = any (v_ids);

  perform set_config('estoque.dev_destrutivo', 'off', true);
  -- ---------- a janela fecha ----------

  -- ---------- 9. TRILHA na mesma transação: sem ela, nada é apagado ----------
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
  -- A janela fecha TAMBÉM quando estoura no meio. O rollback ao savepoint do bloco já
  -- reverteria o GUC; o fecho explícito documenta a intenção e não depende disso.
  -- (Lição medida na F22/F23 — ver 0082.)
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

comment on function public.apagar_ativos_conflito_filiais(uuid[], text, text, text) is
  'F24: apaga ativo(s) que estejam AGORA num grupo de conflito entre filiais — e SÓ eles. Nível administrador (e_admin = admin ou dev), confirmação digitada "APAGAR <N>", justificativa de 10+ caracteres, backup (jsonb no evento até 25 ativos; arquivo conferido no bucket acima disso) e trilha na MESMA transação. All-or-nothing: um único id fora de conflito recusa a operação inteira. Trava o GRUPO INTEIRO (os dois lados) antes de revalidar, para o gêmeo não sumir no meio. NÃO é uma ferramenta genérica de exclusão: apagar ativo fora de conflito segue sendo exclusividade do dev na Zona destrutiva (F23).';

revoke all on function public.apagar_ativos_conflito_filiais(uuid[], text, text, text) from public, anon, service_role;
grant execute on function public.apagar_ativos_conflito_filiais(uuid[], text, text, text) to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) assinatura ÚNICA (sem overload) e security definer:
--   select p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='apagar_ativos_conflito_filiais';
--   -- esperado: 1 linha, "p_ativos uuid[], p_confirmacao text, p_justificativa text, p_backup_path text", true
--
--   -- 2) grants: authenticated=true, anon=false, service_role=false
--   select has_function_privilege('authenticated','public.apagar_ativos_conflito_filiais(uuid[],text,text,text)','execute') as auth_ok,
--          has_function_privilege('anon','public.apagar_ativos_conflito_filiais(uuid[],text,text,text)','execute') as anon_tem,
--          has_function_privilege('service_role','public.apagar_ativos_conflito_filiais(uuid[],text,text,text)','execute') as sr_tem;
--   -- esperado: true, false, false
--
--   -- 3) a janela abre e fecha o mesmo tanto (o +1 é o fecho do bloco exception):
--   select (length(d) - length(replace(d, '''estoque.dev_destrutivo'', ''on''', ''))) / length('''estoque.dev_destrutivo'', ''on''') as abre,
--          (length(d) - length(replace(d, '''estoque.dev_destrutivo'', ''off''', ''))) / length('''estoque.dev_destrutivo'', ''off''') as fecha
--     from (select pg_get_functiondef('public.apagar_ativos_conflito_filiais(uuid[],text,text,text)'::regprocedure) as d) s;
--   -- esperado: abre=1, fecha=2
--
--   notify pgrst, 'reload schema';
