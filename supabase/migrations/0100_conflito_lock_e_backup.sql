-- Migration 0100 — F24 (revisão): o deadlock do lock em dois tempos e o backup que não
-- provava nada.
--
-- ⚠ O corpo da RPC contém `delete from public.ativos` / `delete from public.movimentacoes`
-- (inalterados, herdados da 0093/0098): esta migration BATE NO GATE do modo automático
-- (docs/RUNBOOK-BANCO.md). Caminho B, precedente F23/0080 e F24/0093.
--
-- =============================================================================
-- ACHADO 1 — o lock em DOIS TEMPOS da 0098 reabriu a porta do DEADLOCK
-- =============================================================================
-- A 0098 corrigiu um TOCTOU real (as chaves eram lidas ANTES do lock, então a identidade
-- podia mudar debaixo da leitura que decidia o que travar) dividindo o lock em duas
-- instruções: (1) trava os SELECIONADOS por id → (2) lê as chaves já sob trava → (3) trava
-- o RESTO do grupo. A correção está certa; o efeito colateral não foi visto.
--
-- A 0093 travava o GRUPO INTEIRO num `for update` ÚNICO com `order by a.id`, e era isso —
-- uma ordem total, a mesma para todo mundo — que impedia o deadlock. Ao dividir em duas
-- instruções, o `order by a.id` passou a ordenar DENTRO de cada etapa, nunca ENTRE elas:
--
--   grupo {A id=1 (Serra), B id=2 (Linhares)}
--   sessão X seleciona só B → etapa (1) trava id 2
--   sessão Y seleciona só A → etapa (1) trava id 1
--   X na etapa (3) espera por id 1  ·  Y na etapa (3) espera por id 2   → DEADLOCK
--
-- O Postgres detecta e aborta uma das duas com 40P01, que não tem ramo em
-- `src/lib/actions/erros.ts` e chega ao administrador como erro genérico — num botão
-- destrutivo, que é o pior lugar para um erro que ninguém sabe interpretar. Nada é
-- corrompido (a transação abortada some inteira), mas a mesa fica intermitente justamente
-- quando duas pessoas atacam a mesma fila, que é o cenário para o qual ela foi feita.
--
-- A CORREÇÃO é SERIALIZAR a ferramenta com um advisory lock de transação, antes de
-- qualquer lock de linha. Duas execuções deixam de se intercalar, então não há ordem para
-- inverter — e as três etapas da 0098 ficam exatamente como estão, TOCTOU fechado incluso.
-- É a mesma doutrina do `pg_advisory_xact_lock(hashtext('import_substituir'), …)` da RPC de
-- import (0094): operação administrativa, rara e curta, em que serializar não custa nada e
-- elimina uma classe inteira de corrida em vez de remendar um caso.
--
-- =============================================================================
-- ACHADO 2 — acima do cap, o backup em arquivo não provava ser DESTE lote
-- =============================================================================
-- Acima de 25 ativos o backup vira arquivo, e a RPC conferia três coisas: que o caminho
-- veio, que começa por `conflito/` e que o objeto existe no bucket. O cabeçalho da 0093
-- afirma herdar o endurecimento da 0089 — "conferir o nome sem conferir o RECORTE deixava
-- passar o backup de outro import" — mas o recorte nunca chegou a ser conferido: o prefixo
-- só distingue "backup de conflito" de "backup de import", não ESTA seleção das outras.
--
-- Na prática o bucket acumulava candidatos: `apagarConflito` sobe o arquivo ANTES de
-- chamar a RPC e, quando a RPC recusava, o objeto ficava lá para sempre. Bastava um admin
-- chamar /rest/v1/rpc/apagar_ativos_conflito_filiais direto, com `p_backup_path` apontando
-- para qualquer um desses órfãos (ou para o backup de uma exclusão anterior), e até 200
-- cadastros sumiam com um "backup" que não contém nenhum deles. Perda irreversível — o
-- oposto da régua 1.4 da F23.
--
-- A CORREÇÃO faz o CAMINHO carregar a identidade do lote: o arquivo passa a morar sob
-- `conflito/<digest>/…`, onde `<digest>` é o md5 dos ids selecionados (únicos, minúsculos,
-- ordenados, unidos por vírgula). A RPC calcula o digest a partir dos ids que RECEBEU e
-- exige que o caminho esteja sob ele. Um backup de outra seleção deixa de servir, porque o
-- nome dele não pode ser forjado sem justamente conter os ids que estão sendo apagados.
--
-- Não é hash criptográfico e não precisa ser: o que se pede aqui é uma AMARRA verificável
-- entre o arquivo e o lote, no mesmo espírito do prefixo da 0089 — não um segredo. Quem
-- chama já conhece os próprios ids.
--
-- A limpeza do órfão quando a RPC recusa é a outra metade, e mora na Server Action
-- (`descartarBackupNaoUsado`, src/lib/actions/conflitos.ts): `storage.objects` tem trigger
-- que recusa DELETE por SQL, então de dentro da RPC não dá.
--
-- Ordem de deploy, nas duas direções (nenhuma perde dado):
--   app novo + banco velho → o caminho `conflito/<digest>/…` ainda começa por `conflito/`,
--     então a checagem antiga passa. Segue funcionando.
--   banco novo + app velho → o caminho `conflito/<carimbo>.json` não casa o digest e a RPC
--     RECUSA, com "não é o backup desta operação". Falha fechada, nada é apagado.

-- ---------------------------------------------------------------------------
-- O digest da seleção — uma régua, dois leitores (a RPC e a Server Action)
-- ---------------------------------------------------------------------------
-- `order by x::text` ordena pela forma canônica do uuid, que é minúscula e tem os hífens em
-- posições fixas — então essa ordem coincide com a lexicográfica do lado TypeScript (que
-- ordena as strings minúsculas). Os dois lados montam a MESMA string antes do md5, e é isso
-- que faz os digests baterem.
--
-- ⚠ O `distinct` é OBRIGATÓRIO e não é redundância: o lado TypeScript deduplica com
-- `new Set`, então sem ele os dois lados só coincidem quando quem chama já entregou a lista
-- única. Hoje a RPC entrega (`v_ids` vem de `array_agg(distinct …)`), mas um espelho que
-- depende do cuidado do chamador não é espelho — é uma armadilha esperando o próximo
-- chamador. Medido no ensaio antes de ir para produção: com id repetido no array, a versão
-- sem `distinct` devolvia um digest diferente do TS.
create or replace function public.digest_selecao_conflito(p_ativos uuid[])
returns text
language sql
immutable
set search_path = public
as $$
  select md5((select string_agg(distinct x::text, ',' order by x::text)
                from unnest(p_ativos) as t(x)))
$$;

comment on function public.digest_selecao_conflito(uuid[]) is
  'F24 (0100): o md5 dos ids de uma seleção (únicos, ordenados, unidos por vírgula) — a amarra entre o arquivo de backup e o lote que ele cobre. Espelhado por `digestDaSelecao` em src/lib/actions/conflitos.ts. Existe porque conferir só o prefixo do caminho (0093) não é conferir o RECORTE: qualquer objeto sob conflito/ passava, inclusive o backup de outra exclusão.';

revoke all on function public.digest_selecao_conflito(uuid[]) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- apagar_ativos_conflito_filiais — advisory lock + backup amarrado ao lote
-- ---------------------------------------------------------------------------
-- Corpo idêntico ao da 0098, com TRÊS mudanças: a declaração de `v_digest`, o
-- `pg_advisory_xact_lock` antes do lock em dois tempos, e a checagem do caminho do backup.
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
  perform pg_advisory_xact_lock(hashtext('conflito_filiais_apagar'));

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

comment on function public.apagar_ativos_conflito_filiais(uuid[], text, text, text) is
  'F24 (0100, era 0093/0098): apaga ativo(s) que estejam AGORA num grupo de conflito entre filiais — e SÓ eles. Nível administrador (e_admin = admin ou dev), confirmação digitada "APAGAR <N>", justificativa de 10+ caracteres, backup (jsonb no evento até 25 ativos; arquivo conferido no bucket acima disso) e trilha na MESMA transação. All-or-nothing: um único id fora de conflito recusa a operação inteira. SERIALIZADA por pg_advisory_xact_lock (0100): o lock em dois tempos da 0098 fecha o TOCTOU mas permitia duas sessões travarem as mesmas linhas em ordens opostas (deadlock 40P01), porque `order by a.id` ordena dentro de cada etapa e não entre elas. O backup em ARQUIVO tem de estar sob conflito/<digest_selecao_conflito(ids)>/ — conferir só o prefixo (0093) aceitava o backup de outra exclusão. NÃO é uma ferramenta genérica de exclusão: apagar ativo fora de conflito segue sendo exclusividade do dev na Zona destrutiva (F23).';

revoke all on function public.apagar_ativos_conflito_filiais(uuid[], text, text, text) from public, anon, service_role;
grant execute on function public.apagar_ativos_conflito_filiais(uuid[], text, text, text) to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) a RPC continua ÚNICA (sem overload) e ganhou as duas mudanças:
--   select count(*) as n_versoes from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='apagar_ativos_conflito_filiais';
--   -- esperado: 1
--   select d like '%pg_advisory_xact_lock%' as serializa,
--          d like '%digest_selecao_conflito%' as amarra_backup,
--          (length(d) - length(replace(d,'for update','')))/length('for update') as locks
--     from (select pg_get_functiondef('public.apagar_ativos_conflito_filiais(uuid[],text,text,text)'::regprocedure) as d) x;
--   -- esperado: true, true, 2
--
--   -- 2) o digest bate com o lado TypeScript, INCLUSIVE com id repetido no array (é o
--   --    caso que pegou a falta do `distinct` no ensaio):
--   select public.digest_selecao_conflito(array['22222222-2222-4222-8222-222222222222',
--                                               '11111111-1111-4111-8111-111111111111',
--                                               '11111111-1111-4111-8111-111111111111']::uuid[])
--        = md5('11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222') as ok;
--   -- esperado: true
--
--   -- 3) a auxiliar NÃO está exposta em /rest/v1/rpc/ (precedente 0088/0093):
--   select has_function_privilege('authenticated','public.digest_selecao_conflito(uuid[])','execute') as auth_tem;
--   -- esperado: false
--
--   -- 4) grants da RPC preservados:
--   select has_function_privilege('authenticated','public.apagar_ativos_conflito_filiais(uuid[],text,text,text)','execute') as auth_ok,
--          has_function_privilege('anon','public.apagar_ativos_conflito_filiais(uuid[],text,text,text)','execute') as anon_tem,
--          has_function_privilege('service_role','public.apagar_ativos_conflito_filiais(uuid[],text,text,text)','execute') as sr_tem;
--   -- esperado: true, false, false
--
--   notify pgrst, 'reload schema';
