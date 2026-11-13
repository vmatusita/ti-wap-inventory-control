-- =============================================================================
-- 0190_destrutivas_por_empresa.sql — F67 (13/11/2026): a Zona destrutiva, a prévia e o import POR EMPRESA (EXPANSÃO)
-- =============================================================================
-- classe: ADITIVA (onze funções NOVAS ao lado das antigas, de mesmo nome; os dois resets ANTIGOS só com a sentinela da
--         trava advisory convertida; nenhuma tabela, policy ou linha muda)
--
-- Até aqui o "tudo" do reset é o SISTEMA INTEIRO: `resetar_acervo(p_filial => null)` apaga os ativos de TODAS as empresas
-- com uma frase de 12 caracteres digitável de memória ('RESETAR TUDO'), e nenhuma destrutiva confere de quem é a linha.
-- Esta migration cria as formas com `p_empresa uuid` como 1º parâmetro, SEM default (docs/PLAN-F67.md, decisão 5):
--
--   exigir_dev_para_destruir(p_empresa, p_justificativa)   sessão; empresa informada (42501 sem ela); dev DAQUELA empresa
--                                                          (e_dev_na — a plataforma incluída: "dev sou só eu", 13/11-1);
--                                                          justificativa ≥ 10.
--   rotulo_alcance_reset(p_empresa, p_filial, p_bloco)     o "tudo" carrega a QUANTIDADE do que vai sumir: 'RESETAR TUDO —
--                                                          <N> ATIVOS' (acervo) / '… LANÇAMENTOS' (itens), N = count(*) da
--                                                          empresa, sem separador de milhar (é o que se digita); a filial
--                                                          continua pelo nome.
--   previa_reset / resetar_acervo / resetar_itens (p_empresa, …)
--                                                          o "tudo" é TODAS AS FILIAIS DESTA EMPRESA: `empresa_id =
--                                                          p_empresa` em TODO comando do alcance; a filial informada tem de
--                                                          ser da empresa (42501); a trilha grava `empresa_id` EXPLÍCITO e
--                                                          `'alcance' = 'empresa'` (era 'global').
--   apagar_ativo / apagar_movimentacao / forcar_estado_ativo / apagar_item / forcar_saldo_item (p_empresa, …)
--                                                          a LINHA tem de ser da empresa (42501, *"Este registro pertence a
--                                                          outra empresa."*); a filial do forçar saldo também; a trilha e as
--                                                          duas linhas que o forçar INSERE (a movimentação de ajuste, o
--                                                          lançamento) gravam `empresa_id` EXPLÍCITO (decisão 18) — sem
--                                                          isso a FK composta recusaria a plataforma fora da WAP.
--   importar_ativos_substituir(p_empresa, …)               administrador DAQUELA empresa; a filial do plano é dela (42501
--                                                          ANTES da trava e do backup); `pode_escrever_unidade(p_empresa,
--                                                          filial)`. O que a RPC grava continua pelo default (F67C).
--
-- O corpo de cada nova é o VIGENTE (0082, 0083, 0084, 0086, 0089, 0090, 0110, 0140) com estas trocas e nenhuma outra:
-- a guarda de dev passa a `exigir_dev_para_destruir(p_empresa, …)`; entra a recusa de empresa logo depois da leitura da
-- linha (ou da filial); o alcance ganha `empresa_id = p_empresa`; a trilha ganha `empresa_id`; `'global'` vira
-- `'empresa'`; a confirmação do "tudo" vem de `rotulo_alcance_reset(p_empresa, p_filial, <bloco>)`.
--
-- AS TRAVAS ADVISORY (decisão 8; fato 16; PG 17: "these two key spaces do not overlap"). A família
-- `hashtext('import_substituir')` fica TODA em `(int, int)`: por filial `(…, filial::int)` (o `filiais.id` é único no
-- sistema — o import não muda) e a SENTINELA do "tudo" passa de `-1` a `hashtext(<empresa>::text)`. Na expansão as
-- assinaturas antiga e nova vivem juntas e TÊM de tomar a MESMA chave, senão o app velho e o novo deixam de se excluir:
-- por isso os dois resets ANTIGOS são recriados AQUI com a sentinela da empresa legada (as únicas trocas neles — o diff do
-- prosrc é essa linha), e o laço por filial da antiga continua varrendo todas (só a WAP existe nos bancos vivos).
--
-- A DOUTRINA DA F63 (as travas 15h de catalogo_policies.sql e 7b de empresa_no_acervo.sql): toda função nova daqui que
-- lê `empresa_id` junto de uma tabela dos lotes entra NOMINALMENTE em `k_leitura_tenant`, com as tabelas DELA e a leitura
-- provada por comando (motivo: o recorte da `security definer` — ela atravessa a RLS por construção, então a empresa se
-- confere no corpo). A filial se confere por `filial_da_empresa` (0185), que lê `filiais`, fora dos lotes.
--
-- Privilégio: as nove de API como as antigas (EXECUTE só de authenticated); as duas auxiliares, fechadas nos quatro papéis.
-- =============================================================================

set lock_timeout = '2s';

-- ---------------------------------------------------------------------------
-- 1) as auxiliares fechadas
-- ---------------------------------------------------------------------------
create function public.exigir_dev_para_destruir(p_empresa uuid, p_justificativa text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Operador não autenticado.' using errcode = '42501';
  end if;

  if p_empresa is null then
    raise exception 'Informe a empresa da operação.' using errcode = '42501';
  end if;

  if not public.e_dev_na(p_empresa) then
    raise exception 'Esta operação é restrita ao cargo Desenvolvedor.' using errcode = '42501';
  end if;

  -- A justificativa é o que sobra depois que o dado morre. Vazia, ela não é justificativa.
  if coalesce(length(btrim(p_justificativa)), 0) < 10 then
    raise exception 'A justificativa é obrigatória e precisa ter pelo menos 10 caracteres.'
      using errcode = '22023';
  end if;
end;
$$;

create function public.rotulo_alcance_reset(p_empresa uuid, p_filial smallint, p_bloco text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when p_empresa is null then null
           when p_filial is null and p_bloco = 'itens' then
             'RESETAR TUDO — ' || (select count(*) from public.lancamentos_item l where l.empresa_id = p_empresa)::text
             || ' LANÇAMENTOS'
           when p_filial is null then
             'RESETAR TUDO — ' || (select count(*) from public.ativos a where a.empresa_id = p_empresa)::text
             || ' ATIVOS'
           else (select f.nome from public.filiais f where f.id = p_filial)
         end
$$;

-- ---------------------------------------------------------------------------
-- 2) a prévia
-- ---------------------------------------------------------------------------
create function public.previa_reset(p_empresa uuid, p_bloco text, p_filial smallint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ativos int := 0;
  v_movs   int := 0;
  v_anot   int := 0;
  v_pend   int := 0;
  v_termos int := 0;
  v_lanc   int := 0;
  v_misto  boolean := false;
begin
  perform public.exigir_dev_para_destruir(p_empresa, 'previa somente leitura');

  if p_bloco not in ('acervo', 'itens') then
    raise exception 'Bloco inválido: use acervo ou itens.' using errcode = '22023';
  end if;

  if p_filial is not null and not exists (select 1 from public.filiais f where f.id = p_filial) then
    raise exception 'Filial não encontrada.' using errcode = 'P0002';
  end if;
  if p_filial is not null and not public.filial_da_empresa(p_empresa, p_filial) then
    raise exception 'Esta filial pertence a outra empresa.' using errcode = '42501';
  end if;

  if p_bloco = 'acervo' then
    -- ⚠ ESPELHO EXATO do bloco de contagens de `resetar_acervo`. Qualquer divergência vira recusa 40001 no apply.
    select count(*)::int into v_ativos from public.ativos a
     where a.empresa_id = p_empresa
       and (p_filial is null or a.filial_id = p_filial);
    select count(*)::int into v_movs from public.movimentacoes m
     where m.empresa_id = p_empresa
       and (p_filial is null
            or m.ativo_id in (select id from public.ativos where filial_id = p_filial));
    select count(*)::int into v_anot from public.anotacoes an
     where an.empresa_id = p_empresa
       and (p_filial is null
            or an.ativo_id in (select id from public.ativos where filial_id = p_filial));
    select count(*)::int into v_pend from public.pendencias_item pi
     where pi.empresa_id = p_empresa
       and (p_filial is null
            or pi.ativo_id in (select id from public.ativos where filial_id = p_filial));
    select count(*)::int into v_termos from public.termos_gerados t
     where t.empresa_id = p_empresa
       and (p_filial is null
            or exists (select 1 from unnest(t.ativo_ids) aid
                         join public.ativos a on a.id = aid where a.filial_id = p_filial));

    -- O bloqueio que a tela precisa ANTECIPAR: termo de lote misturando filiais faz o reset recusar.
    if p_filial is not null then
      select exists (
        select 1 from public.termos_gerados t
         where exists (select 1 from unnest(t.ativo_ids) aid
                         join public.ativos a on a.id = aid where a.filial_id = p_filial)
           and exists (select 1 from unnest(t.ativo_ids) aid
                         join public.ativos a on a.id = aid where a.filial_id <> p_filial)
      ) into v_misto;
    end if;
  else
    -- ⚠ ESPELHO EXATO do bloco de contagens de `resetar_itens`.
    select count(*)::int into v_lanc from public.lancamentos_item l
     where l.empresa_id = p_empresa
       and (p_filial is null or l.filial_id = p_filial);
  end if;

  return jsonb_build_object(
    'bloco',    p_bloco,
    'filial_id', p_filial,
    'rotulo',   public.rotulo_alcance_reset(p_empresa, p_filial, p_bloco),
    'termo_misto_bloqueia', v_misto,
    -- `contagens` sai no formato EXATO que as RPCs de reset esperam em `p_contagens`.
    'contagens', case
      when p_bloco = 'acervo' then jsonb_build_object(
        'ativos', v_ativos, 'movimentacoes', v_movs, 'anotacoes', v_anot,
        'pendencias_item', v_pend, 'termos', v_termos)
      else jsonb_build_object('lancamentos', v_lanc)
    end);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) os resets — NOVOS
-- ---------------------------------------------------------------------------
create function public.resetar_acervo(
  p_empresa       uuid,
  p_filial        smallint,
  p_confirmacao   text,
  p_justificativa text,
  p_backup_path   text,
  p_contagens     jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_esperado  text;
  v_prefixo   text;
  v_ativos    int := 0;
  v_movs      int := 0;
  v_anot      int := 0;
  v_pend      int := 0;
  v_termos    int := 0;
  v_arquivos  text[] := '{}'::text[];
  v_e_ativos  int;
  v_e_movs    int;
  v_e_anot    int;
  v_e_pend    int;
  v_e_termos  int;
begin
  perform public.exigir_dev_para_destruir(p_empresa, p_justificativa);

  if p_filial is not null and not exists (select 1 from public.filiais f where f.id = p_filial) then
    raise exception 'Filial não encontrada.' using errcode = 'P0002';
  end if;
  if p_filial is not null and not public.filial_da_empresa(p_empresa, p_filial) then
    raise exception 'Esta filial pertence a outra empresa.' using errcode = '42501';
  end if;

  -- A trava: a mesma família do import. O "tudo" trava cada filial DA EMPRESA e a sentinela DA EMPRESA.
  if p_filial is null then
    perform pg_advisory_xact_lock(hashtext('import_substituir'), f.id::int)
       from public.filiais f where f.empresa_id = p_empresa order by f.id;
    perform pg_advisory_xact_lock(hashtext('import_substituir'), hashtext(p_empresa::text));
  else
    perform pg_advisory_xact_lock(hashtext('import_substituir'), p_filial::int);
  end if;

  v_esperado := public.rotulo_alcance_reset(p_empresa, p_filial, 'acervo');
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" para executar este reset.', v_esperado
      using errcode = '22023';
  end if;

  -- BACKUP OBRIGATÓRIO, CONFERIDO, e AMARRADO AO RECORTE (0089).
  if coalesce(length(btrim(p_backup_path)), 0) = 0 then
    raise exception 'Reset sem backup é proibido: o caminho do backup não veio. Gere o backup e tente de novo.'
      using errcode = '22023';
  end if;
  v_prefixo := public.prefixo_backup_reset('acervo', p_filial);
  if btrim(p_backup_path) not like v_prefixo || '%' then
    raise exception 'O backup informado não é o backup DESTE recorte (esperado sob "%"). Nada foi apagado.', v_prefixo
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'backups-import' and o.name = btrim(p_backup_path)
  ) then
    raise exception 'O backup informado não existe no bucket (%). Nada foi apagado. Gere o backup novamente.', btrim(p_backup_path)
      using errcode = '22023';
  end if;

  if p_filial is not null and exists (
    select 1 from public.termos_gerados t
     where exists (select 1 from unnest(t.ativo_ids) aid
                     join public.ativos a on a.id = aid where a.filial_id = p_filial)
       and exists (select 1 from unnest(t.ativo_ids) aid
                     join public.ativos a on a.id = aid where a.filial_id <> p_filial)
  ) then
    raise exception 'Há termo(s) que misturam esta filial com outra — reset bloqueado. Resolva os termos antes.'
      using errcode = '42501';
  end if;

  if p_contagens is null or jsonb_typeof(p_contagens) <> 'object' then
    raise exception 'Revalidação de contagens obrigatória: gere a prévia novamente antes de aplicar.'
      using errcode = '22023';
  end if;

  select count(*)::int into v_ativos from public.ativos a
   where a.empresa_id = p_empresa
     and (p_filial is null or a.filial_id = p_filial);
  select count(*)::int into v_movs from public.movimentacoes m
   where m.empresa_id = p_empresa
     and (p_filial is null
          or m.ativo_id in (select id from public.ativos where filial_id = p_filial));
  select count(*)::int into v_anot from public.anotacoes an
   where an.empresa_id = p_empresa
     and (p_filial is null
          or an.ativo_id in (select id from public.ativos where filial_id = p_filial));
  select count(*)::int into v_pend from public.pendencias_item pi
   where pi.empresa_id = p_empresa
     and (p_filial is null
          or pi.ativo_id in (select id from public.ativos where filial_id = p_filial));
  select count(*)::int into v_termos from public.termos_gerados t
   where t.empresa_id = p_empresa
     and (p_filial is null
          or exists (select 1 from unnest(t.ativo_ids) aid
                       join public.ativos a on a.id = aid where a.filial_id = p_filial));

  v_e_ativos := coalesce((p_contagens->>'ativos')::int, -1);
  v_e_movs   := coalesce((p_contagens->>'movimentacoes')::int, -1);
  v_e_anot   := coalesce((p_contagens->>'anotacoes')::int, -1);
  v_e_pend   := coalesce((p_contagens->>'pendencias_item')::int, -1);
  v_e_termos := coalesce((p_contagens->>'termos')::int, -1);

  if v_ativos <> v_e_ativos or v_movs <> v_e_movs or v_anot <> v_e_anot
     or v_pend <> v_e_pend or v_termos <> v_e_termos then
    raise exception 'O estado mudou desde a prévia/backup (ativos %/%, movimentações %/%, anotações %/%, pendências %/%, termos %/%). Gere a prévia novamente.',
      v_ativos, v_e_ativos, v_movs, v_e_movs, v_anot, v_e_anot, v_pend, v_e_pend, v_termos, v_e_termos
      using errcode = '40001';
  end if;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.pendencias_item pi
   where pi.empresa_id = p_empresa
     and (p_filial is null
          or pi.ativo_id in (select id from public.ativos where filial_id = p_filial));

  with del as (
    delete from public.termos_gerados t
     where t.empresa_id = p_empresa
       and (p_filial is null
            or exists (select 1 from unnest(t.ativo_ids) aid
                         join public.ativos a on a.id = aid where a.filial_id = p_filial))
    returning t.arquivo_path
  )
  select coalesce(array_agg(arquivo_path), '{}'::text[]) into v_arquivos from del;

  delete from public.anotacoes an
   where an.empresa_id = p_empresa
     and (p_filial is null
          or an.ativo_id in (select id from public.ativos where filial_id = p_filial));

  delete from public.movimentacoes m
   where m.empresa_id = p_empresa
     and (p_filial is null
          or m.ativo_id in (select id from public.ativos where filial_id = p_filial));

  update public.ativos set substitui_ativo_id = null
   where substitui_ativo_id in (
     select id from public.ativos where empresa_id = p_empresa and (p_filial is null or filial_id = p_filial));

  delete from public.ativos a
   where a.empresa_id = p_empresa
     and (p_filial is null or a.filial_id = p_filial);

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (empresa_id, autor, acao, alvo, detalhe)
  values (p_empresa, v_uid, 'acervo_resetado', v_esperado,
          jsonb_build_object(
            'justificativa',   btrim(p_justificativa),
            'alcance',         case when p_filial is null then 'empresa' else 'filial' end,
            'filial_id',       p_filial,
            'backup_path',     btrim(p_backup_path),
            'antes',           jsonb_build_object(
                                 'ativos', v_ativos, 'movimentacoes', v_movs,
                                 'anotacoes', v_anot, 'pendencias_item', v_pend,
                                 'termos', v_termos),
            'depois',          jsonb_build_object(
                                 'ativos', (select count(*) from public.ativos a
                                             where a.empresa_id = p_empresa
                                               and (p_filial is null or a.filial_id = p_filial)),
                                 'movimentacoes', (select count(*) from public.movimentacoes m
                                                    where m.empresa_id = p_empresa
                                                      and (p_filial is null
                                                           or m.ativo_id in (select id from public.ativos where filial_id = p_filial)))),
            'arquivos_termos', to_jsonb(v_arquivos)));

  return jsonb_build_object(
    'alcance',         case when p_filial is null then 'empresa' else 'filial' end,
    'filial_id',       p_filial,
    'rotulo',          v_esperado,
    'ativos',          v_ativos,
    'movimentacoes',   v_movs,
    'anotacoes',       v_anot,
    'pendencias_item', v_pend,
    'termos',          v_termos,
    'arquivos_termos', to_jsonb(v_arquivos),
    'restam_ativos',   (select count(*) from public.ativos a
                         where a.empresa_id = p_empresa
                           and (p_filial is null or a.filial_id = p_filial)));

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

create function public.resetar_itens(
  p_empresa       uuid,
  p_filial        smallint,
  p_confirmacao   text,
  p_justificativa text,
  p_backup_path   text,
  p_contagens     jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_esperado text;
  v_prefixo  text;
  v_lanc     int := 0;
  v_e_lanc   int;
begin
  perform public.exigir_dev_para_destruir(p_empresa, p_justificativa);

  if p_filial is not null and not exists (select 1 from public.filiais f where f.id = p_filial) then
    raise exception 'Filial não encontrada.' using errcode = 'P0002';
  end if;
  if p_filial is not null and not public.filial_da_empresa(p_empresa, p_filial) then
    raise exception 'Esta filial pertence a outra empresa.' using errcode = '42501';
  end if;

  if p_filial is null then
    perform pg_advisory_xact_lock(hashtext('import_substituir'), f.id::int)
       from public.filiais f where f.empresa_id = p_empresa order by f.id;
    perform pg_advisory_xact_lock(hashtext('import_substituir'), hashtext(p_empresa::text));
  else
    perform pg_advisory_xact_lock(hashtext('import_substituir'), p_filial::int);
  end if;

  v_esperado := public.rotulo_alcance_reset(p_empresa, p_filial, 'itens');
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" para executar este reset.', v_esperado
      using errcode = '22023';
  end if;

  if coalesce(length(btrim(p_backup_path)), 0) = 0 then
    raise exception 'Reset sem backup é proibido: o caminho do backup não veio. Gere o backup e tente de novo.'
      using errcode = '22023';
  end if;
  v_prefixo := public.prefixo_backup_reset('itens', p_filial);
  if btrim(p_backup_path) not like v_prefixo || '%' then
    raise exception 'O backup informado não é o backup DESTE recorte (esperado sob "%"). Nada foi apagado.', v_prefixo
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'backups-import' and o.name = btrim(p_backup_path)
  ) then
    raise exception 'O backup informado não existe no bucket (%). Nada foi apagado. Gere o backup novamente.', btrim(p_backup_path)
      using errcode = '22023';
  end if;

  if p_contagens is null or jsonb_typeof(p_contagens) <> 'object' then
    raise exception 'Revalidação de contagens obrigatória: gere a prévia novamente antes de aplicar.'
      using errcode = '22023';
  end if;

  select count(*)::int into v_lanc from public.lancamentos_item l
   where l.empresa_id = p_empresa
     and (p_filial is null or l.filial_id = p_filial);

  v_e_lanc := coalesce((p_contagens->>'lancamentos')::int, -1);
  if v_lanc <> v_e_lanc then
    raise exception 'O estado mudou desde a prévia/backup (lançamentos %/%). Gere a prévia novamente.',
      v_lanc, v_e_lanc using errcode = '40001';
  end if;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.lancamentos_item l
   where l.empresa_id = p_empresa
     and (p_filial is null or l.filial_id = p_filial);

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (empresa_id, autor, acao, alvo, detalhe)
  values (p_empresa, v_uid, 'itens_resetados', v_esperado,
          jsonb_build_object(
            'justificativa', btrim(p_justificativa),
            'alcance',       case when p_filial is null then 'empresa' else 'filial' end,
            'filial_id',     p_filial,
            'backup_path',   btrim(p_backup_path),
            'antes',         jsonb_build_object('lancamentos', v_lanc),
            'depois',        jsonb_build_object('lancamentos',
                               (select count(*) from public.lancamentos_item l
                                 where l.empresa_id = p_empresa
                                   and (p_filial is null or l.filial_id = p_filial)))));

  return jsonb_build_object(
    'alcance',            case when p_filial is null then 'empresa' else 'filial' end,
    'filial_id',          p_filial,
    'rotulo',             v_esperado,
    'lancamentos',        v_lanc,
    'restam_lancamentos', (select count(*) from public.lancamentos_item l
                            where l.empresa_id = p_empresa
                              and (p_filial is null or l.filial_id = p_filial)));

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) os resets ANTIGOS — SÓ a sentinela da trava (a empresa legada no lugar de -1). Nada mais muda.
-- ---------------------------------------------------------------------------
create or replace function public.resetar_acervo(
  p_filial        smallint,
  p_confirmacao   text,
  p_justificativa text,
  p_backup_path   text,
  p_contagens     jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_esperado  text;
  v_prefixo   text;
  v_ativos    int := 0;
  v_movs      int := 0;
  v_anot      int := 0;
  v_pend      int := 0;
  v_termos    int := 0;
  v_arquivos  text[] := '{}'::text[];
  v_e_ativos  int;
  v_e_movs    int;
  v_e_anot    int;
  v_e_pend    int;
  v_e_termos  int;
begin
  perform public.exigir_dev_para_destruir(p_justificativa);

  if p_filial is not null and not exists (select 1 from public.filiais f where f.id = p_filial) then
    raise exception 'Filial não encontrada.' using errcode = 'P0002';
  end if;

  if p_filial is null then
    perform pg_advisory_xact_lock(hashtext('import_substituir'), f.id::int)
       from public.filiais f order by f.id;
    perform pg_advisory_xact_lock(hashtext('import_substituir'), hashtext(public.empresa_legada()::text));
  else
    perform pg_advisory_xact_lock(hashtext('import_substituir'), p_filial::int);
  end if;

  v_esperado := public.rotulo_alcance_reset(p_filial);
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" para executar este reset.', v_esperado
      using errcode = '22023';
  end if;

  -- BACKUP OBRIGATÓRIO, CONFERIDO, e agora AMARRADO AO RECORTE (0089).
  if coalesce(length(btrim(p_backup_path)), 0) = 0 then
    raise exception 'Reset sem backup é proibido: o caminho do backup não veio. Gere o backup e tente de novo.'
      using errcode = '22023';
  end if;
  v_prefixo := public.prefixo_backup_reset('acervo', p_filial);
  if btrim(p_backup_path) not like v_prefixo || '%' then
    raise exception 'O backup informado não é o backup DESTE recorte (esperado sob "%"). Nada foi apagado.', v_prefixo
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'backups-import' and o.name = btrim(p_backup_path)
  ) then
    raise exception 'O backup informado não existe no bucket (%). Nada foi apagado. Gere o backup novamente.', btrim(p_backup_path)
      using errcode = '22023';
  end if;

  if p_filial is not null and exists (
    select 1 from public.termos_gerados t
     where exists (select 1 from unnest(t.ativo_ids) aid
                     join public.ativos a on a.id = aid where a.filial_id = p_filial)
       and exists (select 1 from unnest(t.ativo_ids) aid
                     join public.ativos a on a.id = aid where a.filial_id <> p_filial)
  ) then
    raise exception 'Há termo(s) que misturam esta filial com outra — reset bloqueado. Resolva os termos antes.'
      using errcode = '42501';
  end if;

  if p_contagens is null or jsonb_typeof(p_contagens) <> 'object' then
    raise exception 'Revalidação de contagens obrigatória: gere a prévia novamente antes de aplicar.'
      using errcode = '22023';
  end if;

  select count(*)::int into v_ativos from public.ativos a
   where p_filial is null or a.filial_id = p_filial;
  select count(*)::int into v_movs from public.movimentacoes m
   where p_filial is null
      or m.ativo_id in (select id from public.ativos where filial_id = p_filial);
  select count(*)::int into v_anot from public.anotacoes an
   where p_filial is null
      or an.ativo_id in (select id from public.ativos where filial_id = p_filial);
  select count(*)::int into v_pend from public.pendencias_item pi
   where p_filial is null
      or pi.ativo_id in (select id from public.ativos where filial_id = p_filial);
  select count(*)::int into v_termos from public.termos_gerados t
   where p_filial is null
      or exists (select 1 from unnest(t.ativo_ids) aid
                   join public.ativos a on a.id = aid where a.filial_id = p_filial);

  v_e_ativos := coalesce((p_contagens->>'ativos')::int, -1);
  v_e_movs   := coalesce((p_contagens->>'movimentacoes')::int, -1);
  v_e_anot   := coalesce((p_contagens->>'anotacoes')::int, -1);
  v_e_pend   := coalesce((p_contagens->>'pendencias_item')::int, -1);
  v_e_termos := coalesce((p_contagens->>'termos')::int, -1);

  if v_ativos <> v_e_ativos or v_movs <> v_e_movs or v_anot <> v_e_anot
     or v_pend <> v_e_pend or v_termos <> v_e_termos then
    raise exception 'O estado mudou desde a prévia/backup (ativos %/%, movimentações %/%, anotações %/%, pendências %/%, termos %/%). Gere a prévia novamente.',
      v_ativos, v_e_ativos, v_movs, v_e_movs, v_anot, v_e_anot, v_pend, v_e_pend, v_termos, v_e_termos
      using errcode = '40001';
  end if;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.pendencias_item pi
   where p_filial is null
      or pi.ativo_id in (select id from public.ativos where filial_id = p_filial);

  with del as (
    delete from public.termos_gerados t
     where p_filial is null
        or exists (select 1 from unnest(t.ativo_ids) aid
                     join public.ativos a on a.id = aid where a.filial_id = p_filial)
    returning t.arquivo_path
  )
  select coalesce(array_agg(arquivo_path), '{}'::text[]) into v_arquivos from del;

  delete from public.anotacoes an
   where p_filial is null
      or an.ativo_id in (select id from public.ativos where filial_id = p_filial);

  delete from public.movimentacoes m
   where p_filial is null
      or m.ativo_id in (select id from public.ativos where filial_id = p_filial);

  update public.ativos set substitui_ativo_id = null
   where substitui_ativo_id in (
     select id from public.ativos where p_filial is null or filial_id = p_filial);

  delete from public.ativos a where p_filial is null or a.filial_id = p_filial;

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values (v_uid, 'acervo_resetado', v_esperado,
          jsonb_build_object(
            'justificativa',   btrim(p_justificativa),
            'alcance',         case when p_filial is null then 'global' else 'filial' end,
            'filial_id',       p_filial,
            'backup_path',     btrim(p_backup_path),
            'antes',           jsonb_build_object(
                                 'ativos', v_ativos, 'movimentacoes', v_movs,
                                 'anotacoes', v_anot, 'pendencias_item', v_pend,
                                 'termos', v_termos),
            'depois',          jsonb_build_object(
                                 'ativos', (select count(*) from public.ativos a
                                             where p_filial is null or a.filial_id = p_filial),
                                 'movimentacoes', (select count(*) from public.movimentacoes m
                                                    where p_filial is null
                                                       or m.ativo_id in (select id from public.ativos where filial_id = p_filial))),
            'arquivos_termos', to_jsonb(v_arquivos)));

  return jsonb_build_object(
    'alcance',         case when p_filial is null then 'global' else 'filial' end,
    'filial_id',       p_filial,
    'rotulo',          v_esperado,
    'ativos',          v_ativos,
    'movimentacoes',   v_movs,
    'anotacoes',       v_anot,
    'pendencias_item', v_pend,
    'termos',          v_termos,
    'arquivos_termos', to_jsonb(v_arquivos),
    'restam_ativos',   (select count(*) from public.ativos a
                         where p_filial is null or a.filial_id = p_filial));

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

create or replace function public.resetar_itens(
  p_filial        smallint,
  p_confirmacao   text,
  p_justificativa text,
  p_backup_path   text,
  p_contagens     jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_esperado text;
  v_prefixo  text;
  v_lanc     int := 0;
  v_e_lanc   int;
begin
  perform public.exigir_dev_para_destruir(p_justificativa);

  if p_filial is not null and not exists (select 1 from public.filiais f where f.id = p_filial) then
    raise exception 'Filial não encontrada.' using errcode = 'P0002';
  end if;

  if p_filial is null then
    perform pg_advisory_xact_lock(hashtext('import_substituir'), f.id::int)
       from public.filiais f order by f.id;
    perform pg_advisory_xact_lock(hashtext('import_substituir'), hashtext(public.empresa_legada()::text));
  else
    perform pg_advisory_xact_lock(hashtext('import_substituir'), p_filial::int);
  end if;

  v_esperado := public.rotulo_alcance_reset(p_filial);
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" para executar este reset.', v_esperado
      using errcode = '22023';
  end if;

  if coalesce(length(btrim(p_backup_path)), 0) = 0 then
    raise exception 'Reset sem backup é proibido: o caminho do backup não veio. Gere o backup e tente de novo.'
      using errcode = '22023';
  end if;
  v_prefixo := public.prefixo_backup_reset('itens', p_filial);
  if btrim(p_backup_path) not like v_prefixo || '%' then
    raise exception 'O backup informado não é o backup DESTE recorte (esperado sob "%"). Nada foi apagado.', v_prefixo
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'backups-import' and o.name = btrim(p_backup_path)
  ) then
    raise exception 'O backup informado não existe no bucket (%). Nada foi apagado. Gere o backup novamente.', btrim(p_backup_path)
      using errcode = '22023';
  end if;

  if p_contagens is null or jsonb_typeof(p_contagens) <> 'object' then
    raise exception 'Revalidação de contagens obrigatória: gere a prévia novamente antes de aplicar.'
      using errcode = '22023';
  end if;

  select count(*)::int into v_lanc from public.lancamentos_item l
   where p_filial is null or l.filial_id = p_filial;

  v_e_lanc := coalesce((p_contagens->>'lancamentos')::int, -1);
  if v_lanc <> v_e_lanc then
    raise exception 'O estado mudou desde a prévia/backup (lançamentos %/%). Gere a prévia novamente.',
      v_lanc, v_e_lanc using errcode = '40001';
  end if;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.lancamentos_item l where p_filial is null or l.filial_id = p_filial;

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values (v_uid, 'itens_resetados', v_esperado,
          jsonb_build_object(
            'justificativa', btrim(p_justificativa),
            'alcance',       case when p_filial is null then 'global' else 'filial' end,
            'filial_id',     p_filial,
            'backup_path',   btrim(p_backup_path),
            'antes',         jsonb_build_object('lancamentos', v_lanc),
            'depois',        jsonb_build_object('lancamentos',
                               (select count(*) from public.lancamentos_item l
                                 where p_filial is null or l.filial_id = p_filial))));

  return jsonb_build_object(
    'alcance',            case when p_filial is null then 'global' else 'filial' end,
    'filial_id',          p_filial,
    'rotulo',             v_esperado,
    'lancamentos',        v_lanc,
    'restam_lancamentos', (select count(*) from public.lancamentos_item l
                            where p_filial is null or l.filial_id = p_filial));

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) apagar e forçar — NOVOS
-- ---------------------------------------------------------------------------
create function public.apagar_ativo(
  p_empresa       uuid,
  p_ativo         uuid,
  p_confirmacao   text,
  p_justificativa text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a          public.ativos%rowtype;
  v_uid        uuid := (select auth.uid());
  v_esperado   text;
  v_movs       int := 0;
  v_anot       int := 0;
  v_pend       int := 0;
  v_termos     int := 0;
  v_subst      int := 0;
  v_arquivos   text[] := '{}'::text[];
  v_backup     jsonb;
  v_rotulo     text;
begin
  perform public.exigir_dev_para_destruir(p_empresa, p_justificativa);

  select * into v_a from public.ativos where id = p_ativo;
  if v_a.id is null then
    raise exception 'Ativo não encontrado.' using errcode = 'P0002';
  end if;

  -- F67: a LINHA é desta empresa? (lida no próprio comando, com a origem provada)
  if not exists (select 1 from public.ativos a where a.id = p_ativo and a.empresa_id = p_empresa) then
    raise exception 'Este registro pertence a outra empresa.' using errcode = '42501';
  end if;

  v_esperado := coalesce(nullif(btrim(v_a.patrimonio), ''),
                         nullif(btrim(v_a.service_tag), ''),
                         v_a.id::text);
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" para apagar este ativo.', v_esperado
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.termos_gerados t
     where p_ativo = any (t.ativo_ids)
       and exists (select 1 from unnest(t.ativo_ids) x(id) where x.id <> p_ativo)
  ) then
    raise exception 'Este ativo está num termo que também cobre outros ativos: apagá-lo destruiria um documento que não é só dele. Apague o termo primeiro, ou apague antes os outros ativos do mesmo termo.'
      using errcode = '42501';
  end if;

  v_rotulo := coalesce(nullif(btrim(v_a.patrimonio), ''), nullif(btrim(v_a.service_tag), ''), v_a.id::text);

  select jsonb_build_object(
           'ativo', to_jsonb(v_a),
           'movimentacoes', coalesce((
             select jsonb_agg(to_jsonb(m))
               from (select * from public.movimentacoes
                      where ativo_id = p_ativo
                      order by created_at, id
                      limit 500) m), '[]'::jsonb),
           'termos', coalesce((
             select jsonb_agg(to_jsonb(t)) from public.termos_gerados t
              where p_ativo = any (t.ativo_ids)), '[]'::jsonb),
           'anotacoes', coalesce((
             select jsonb_agg(to_jsonb(an)) from public.anotacoes an
              where an.ativo_id = p_ativo), '[]'::jsonb),
           'pendencias_item', coalesce((
             select jsonb_agg(to_jsonb(pi)) from public.pendencias_item pi
              where pi.ativo_id = p_ativo), '[]'::jsonb)
         )
    into v_backup;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.pendencias_item where ativo_id = p_ativo;
  get diagnostics v_pend = row_count;

  with del as (
    delete from public.termos_gerados t
     where p_ativo = any (t.ativo_ids)
    returning t.arquivo_path
  )
  select coalesce(array_agg(arquivo_path), '{}'::text[]), count(*)::int
    into v_arquivos, v_termos
    from del;

  delete from public.anotacoes where ativo_id = p_ativo;
  get diagnostics v_anot = row_count;

  delete from public.movimentacoes where ativo_id = p_ativo;
  get diagnostics v_movs = row_count;

  update public.ativos set substitui_ativo_id = null where substitui_ativo_id = p_ativo;
  get diagnostics v_subst = row_count;

  delete from public.ativos where id = p_ativo;

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (empresa_id, autor, acao, alvo, detalhe)
  values (p_empresa, v_uid, 'ativo_apagado', v_rotulo,
          jsonb_build_object(
            'justificativa',        btrim(p_justificativa),
            'ativo_id',             p_ativo,
            'filial_id',            v_a.filial_id,
            'movimentacoes',        v_movs,
            'anotacoes',            v_anot,
            'pendencias_item',      v_pend,
            'termos',               v_termos,
            'ponteiros_anulados',   v_subst,
            'arquivos_termos',      to_jsonb(v_arquivos),
            'backup_truncado',      (v_movs > 500),
            'backup',               v_backup));

  return jsonb_build_object(
    'ativo_id',           p_ativo,
    'rotulo',             v_rotulo,
    'movimentacoes',      v_movs,
    'anotacoes',          v_anot,
    'pendencias_item',    v_pend,
    'termos',             v_termos,
    'ponteiros_anulados', v_subst,
    'arquivos_termos',    to_jsonb(v_arquivos));

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

create function public.apagar_item(
  p_empresa       uuid,
  p_item          smallint,
  p_confirmacao   text,
  p_justificativa text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i      public.itens%rowtype;
  v_uid    uuid := (select auth.uid());
  v_lanc   int := 0;
  v_backup jsonb;
begin
  perform public.exigir_dev_para_destruir(p_empresa, p_justificativa);

  select * into v_i from public.itens where id = p_item;
  if v_i.id is null then
    raise exception 'Item não encontrado.' using errcode = 'P0002';
  end if;

  -- F67: o ITEM é desta empresa? (o catálogo de itens é por empresa)
  if not exists (select 1 from public.itens i where i.id = p_item and i.empresa_id = p_empresa) then
    raise exception 'Este registro pertence a outra empresa.' using errcode = '42501';
  end if;

  if lower(btrim(coalesce(p_confirmacao, ''))) <> lower(btrim(v_i.nome)) then
    raise exception 'A confirmação não confere: digite exatamente "%" para apagar este item.', v_i.nome
      using errcode = '22023';
  end if;

  select jsonb_build_object(
           'item', to_jsonb(v_i),
           'lancamentos', coalesce((
             select jsonb_agg(to_jsonb(l))
               from (select * from public.lancamentos_item
                      where item_id = p_item
                      order by created_at, id
                      limit 500) l), '[]'::jsonb))
    into v_backup;

  select count(*)::int into v_lanc from public.lancamentos_item where item_id = p_item;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.lancamentos_item where item_id = p_item;

  delete from public.itens where id = p_item;

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (empresa_id, autor, acao, alvo, detalhe)
  values (p_empresa, v_uid, 'item_apagado', v_i.nome,
          jsonb_build_object(
            'justificativa',   btrim(p_justificativa),
            'item_id',         p_item,
            'grupo',           v_i.grupo,
            'lancamentos',     v_lanc,
            'backup_truncado', (v_lanc > 500),
            'backup',          v_backup));

  return jsonb_build_object(
    'item_id',     p_item,
    'nome',        v_i.nome,
    'lancamentos', v_lanc);

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

create function public.apagar_movimentacao(
  p_empresa       uuid,
  p_mov           uuid,
  p_confirmacao   text,
  p_justificativa text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m        public.movimentacoes%rowtype;
  v_a        public.ativos%rowtype;
  v_uid      uuid := (select auth.uid());
  v_esperado text;
  v_total    int;
  v_pend     int := 0;
  v_backup   jsonb;
begin
  perform public.exigir_dev_para_destruir(p_empresa, p_justificativa);

  select * into v_m from public.movimentacoes where id = p_mov;
  if v_m.id is null then
    raise exception 'Movimentação não encontrada.' using errcode = 'P0002';
  end if;

  -- F67: a MOVIMENTAÇÃO é desta empresa? (a do ativo dela é a mesma — FK composta da F65)
  if not exists (select 1 from public.movimentacoes m where m.id = p_mov and m.empresa_id = p_empresa) then
    raise exception 'Este registro pertence a outra empresa.' using errcode = '42501';
  end if;

  select * into v_a from public.ativos where id = v_m.ativo_id for update;
  if v_a.id is null then
    raise exception 'O ativo desta movimentação não existe mais.' using errcode = 'P0002';
  end if;

  v_esperado := coalesce(nullif(btrim(v_a.patrimonio), ''),
                         nullif(btrim(v_a.service_tag), ''),
                         v_a.id::text);
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" (o ativo desta movimentação) para apagá-la.', v_esperado
      using errcode = '22023';
  end if;

  if v_m.tipo = 'estorno' then
    raise exception 'Esta é uma movimentação de ESTORNO, e apagá-la não devolve as pendências de item que o estorno removeu — o ativo voltaria a um estado que a fila de pendências não reflete. Use "Forçar estado" para acertar o ativo mantendo o histórico.'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.movimentacoes m
     where m.ativo_id = v_m.ativo_id
       and m.id <> v_m.id
       and m.created_at = v_m.created_at
  ) then
    raise exception 'Este ativo tem movimentações gravadas no mesmo instante (é o caso dos ativos que vieram do import de startup), então não dá para dizer com segurança qual é a última. Para desmontar este ativo, use "Apagar ativo", que leva o rastro inteiro.'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.movimentacoes m
     where m.ativo_id = v_m.ativo_id
       and (m.created_at, m.id) > (v_m.created_at, v_m.id)
  ) then
    raise exception 'Só a última movimentação do ativo pode ser apagada — esta tem outras depois dela. Apague as posteriores primeiro (da mais nova para a mais antiga).'
      using errcode = '42501';
  end if;

  select count(*) into v_total from public.movimentacoes where ativo_id = v_m.ativo_id;
  if v_total <= 1 then
    raise exception 'Esta é a única movimentação do ativo — apagá-la deixaria um ativo sem nascimento. Use "Apagar ativo", que leva o ativo e o rastro inteiro.'
      using errcode = '42501';
  end if;

  if v_m.snapshot_anterior is null then
    raise exception 'Esta movimentação não tem o retrato do estado anterior — não é possível recompor o ativo apagando-a. Use "Forçar estado" para acertar o ativo e mantenha o histórico.'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.termos_gerados t where p_mov = any (t.movimentacao_ids)) then
    raise exception 'Existe um termo gerado a partir desta movimentação. Apague o termo antes, ou apague o ativo inteiro.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
           'movimentacao', to_jsonb(v_m),
           'ativo_antes',  to_jsonb(v_a),
           'pendencias_item', coalesce((
             select jsonb_agg(to_jsonb(pi)) from public.pendencias_item pi
              where pi.movimentacao_id = p_mov), '[]'::jsonb))
    into v_backup;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.pendencias_item where movimentacao_id = p_mov;
  get diagnostics v_pend = row_count;

  update public.ativos set
    status            = (v_m.snapshot_anterior ->> 'status')::public.status_ativo,
    colaborador_atual = v_m.snapshot_anterior ->> 'colaborador',
    setor_atual       = v_m.snapshot_anterior ->> 'setor',
    filial_id         = (v_m.snapshot_anterior ->> 'filial_id')::smallint,
    pendencia         = case when v_m.snapshot_anterior ? 'pendencia'
                             then nullif(
                               (select string_agg(trim(x.val), '; ' order by x.ord)
                                from unnest(string_to_array(v_m.snapshot_anterior ->> 'pendencia', ';'))
                                     with ordinality as x(val, ord)
                                where nullif(trim(x.val), '') is not null
                                  and lower(trim(x.val)) not like 'itens faltantes%'), '')
                             else pendencia end,
    termo_assinado    = case when v_m.snapshot_anterior ? 'termo_assinado'
                             then (v_m.snapshot_anterior ->> 'termo_assinado')::public.termo_status
                             else termo_assinado end,
    termo_data        = case when v_m.snapshot_anterior ? 'termo_data'
                             then (v_m.snapshot_anterior ->> 'termo_data')::date
                             else termo_data end,
    updated_at        = now()
  where id = v_m.ativo_id;

  delete from public.movimentacoes where id = p_mov;

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (empresa_id, autor, acao, alvo, detalhe)
  values (p_empresa, v_uid, 'movimentacao_apagada', v_esperado,
          jsonb_build_object(
            'justificativa',   btrim(p_justificativa),
            'movimentacao_id', p_mov,
            'ativo_id',        v_m.ativo_id,
            'tipo',            v_m.tipo,
            'data',            v_m.data,
            'status_antes',    v_m.status_anterior,
            'status_depois',   v_m.status_resultante,
            'pendencias_item', v_pend,
            'backup',          v_backup));

  return jsonb_build_object(
    'movimentacao_id',   p_mov,
    'ativo_id',          v_m.ativo_id,
    'rotulo',            v_esperado,
    'tipo',              v_m.tipo,
    'status_restaurado', (v_m.snapshot_anterior ->> 'status'),
    'pendencias_item',   v_pend);

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

create function public.forcar_estado_ativo(
  p_empresa uuid,
  p_ativo uuid,
  p_status public.status_ativo,
  p_justificativa text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_a      public.ativos%rowtype;
  v_uid    uuid := (select auth.uid());
  v_mov_id uuid;
  v_antes  public.status_ativo;
  v_rotulo text;
begin
  perform public.exigir_dev_para_destruir(p_empresa, p_justificativa);

  select * into v_a from public.ativos where id = p_ativo for update;
  if v_a.id is null then
    raise exception 'Ativo não encontrado.' using errcode = 'P0002';
  end if;

  -- F67: a LINHA é desta empresa?
  if not exists (select 1 from public.ativos a where a.id = p_ativo and a.empresa_id = p_empresa) then
    raise exception 'Este registro pertence a outra empresa.' using errcode = '42501';
  end if;

  v_antes  := v_a.status;
  v_rotulo := coalesce(nullif(btrim(v_a.patrimonio), ''), nullif(btrim(v_a.service_tag), ''), v_a.id::text);

  if v_antes = p_status then
    return jsonb_build_object(
      'alterado', false, 'ativo_id', p_ativo, 'rotulo', v_rotulo, 'status', v_antes);
  end if;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  -- F67: a movimentação de ajuste nasce na empresa EXPLÍCITA do ativo (decisão 18).
  insert into public.movimentacoes (
    empresa_id, ativo_id, tipo, motivo, data, filial_id,
    status_resultante, observacao, criado_por, forcado
  ) values (
    p_empresa, p_ativo, 'ajuste', null, current_date, v_a.filial_id,
    p_status, btrim(p_justificativa), v_uid, true
  )
  returning id into v_mov_id;

  if not public.status_tem_detentor(p_status) then
    update public.ativos
       set colaborador_atual = null,
           setor_atual       = null,
           updated_at        = now()
     where id = p_ativo;
  end if;

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (empresa_id, autor, acao, alvo, detalhe)
  values (p_empresa, v_uid, 'estado_forcado', v_rotulo,
          jsonb_build_object(
            'justificativa',   btrim(p_justificativa),
            'ativo_id',        p_ativo,
            'movimentacao_id', v_mov_id,
            'de',              v_antes,
            'para',            p_status,
            'detentor_zerado', (not public.status_tem_detentor(p_status))));

  return jsonb_build_object(
    'alterado',        true,
    'ativo_id',        p_ativo,
    'rotulo',          v_rotulo,
    'movimentacao_id', v_mov_id,
    'de',              v_antes,
    'para',            p_status,
    'detentor_zerado', (not public.status_tem_detentor(p_status)));

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

create function public.forcar_saldo_item(
  p_empresa       uuid,
  p_item          smallint,
  p_filial        smallint,
  p_saldo_alvo    integer,
  p_justificativa text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_nome   text;
  v_filial text;
  v_atual  int;
  v_delta  int;
  v_lanc   uuid;
begin
  perform public.exigir_dev_para_destruir(p_empresa, p_justificativa);

  select i.nome into v_nome from public.itens i where i.id = p_item;
  if v_nome is null then
    raise exception 'Item não encontrado.' using errcode = 'P0002';
  end if;

  -- F67: o ITEM é desta empresa?
  if not exists (select 1 from public.itens i where i.id = p_item and i.empresa_id = p_empresa) then
    raise exception 'Este registro pertence a outra empresa.' using errcode = '42501';
  end if;

  select f.nome into v_filial from public.filiais f where f.id = p_filial;
  if v_filial is null then
    raise exception 'Filial não encontrada.' using errcode = 'P0002';
  end if;

  -- F67: a FILIAL é desta empresa?
  if not public.filial_da_empresa(p_empresa, p_filial) then
    raise exception 'Esta filial pertence a outra empresa.' using errcode = '42501';
  end if;

  if p_saldo_alvo is null or p_saldo_alvo < 0 then
    raise exception 'O saldo alvo precisa ser zero ou maior.' using errcode = '22023';
  end if;

  select coalesce(sum(case l.tipo::text when 'entrada' then l.quantidade
                                        when 'ajuste'  then l.quantidade
                                        else 0 end), 0)::int
    into v_atual
    from public.lancamentos_item l
   where l.item_id = p_item and l.filial_id = p_filial;

  v_delta := p_saldo_alvo - v_atual;

  if v_delta = 0 then
    return jsonb_build_object(
      'alterado', false, 'item_id', p_item, 'item', v_nome,
      'filial_id', p_filial, 'filial', v_filial, 'saldo', v_atual);
  end if;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  -- F67: o lançamento de ajuste nasce na empresa EXPLÍCITA (decisão 18).
  insert into public.lancamentos_item (
    empresa_id, item_id, filial_id, tipo, quantidade, data, observacao, criado_por, forcado
  ) values (
    p_empresa, p_item, p_filial, 'ajuste', v_delta, current_date, btrim(p_justificativa), v_uid, true
  )
  returning id into v_lanc;

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (empresa_id, autor, acao, alvo, detalhe)
  values (p_empresa, v_uid, 'saldo_forcado', v_nome || ' — ' || v_filial,
          jsonb_build_object(
            'justificativa', btrim(p_justificativa),
            'item_id',       p_item,
            'filial_id',     p_filial,
            'de',            v_atual,
            'para',          p_saldo_alvo,
            'delta',         v_delta,
            'lancamento_id', v_lanc));

  return jsonb_build_object(
    'alterado',      true,
    'item_id',       p_item,
    'item',          v_nome,
    'filial_id',     p_filial,
    'filial',        v_filial,
    'de',            v_atual,
    'para',          p_saldo_alvo,
    'delta',         v_delta,
    'lancamento_id', v_lanc);

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) o import de startup — NOVO
-- ---------------------------------------------------------------------------
create function public.importar_ativos_substituir(
  p_empresa     uuid,
  p_plano       jsonb,
  p_backup_path text,
  p_contagens   jsonb,
  p_correcoes   jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid              uuid    := auth.uid();
  v_filial           smallint;
  v_filial_ativa     boolean;
  v_total_plano      int;
  v_data_import      date    := current_date;
  v_obs_marcador     text    := 'import startup ' || to_char(current_date, 'DD/MM/YYYY');
  e                  jsonb;
  v_ativo_id         uuid;
  v_apagado          jsonb;
  v_ativos_criados   int     := 0;
  v_movs_apagadas    int     := 0;
  v_anot_apagadas    int     := 0;
  v_termos_apagados  int     := 0;
  v_arquivos_termos  text[]  := '{}';
  v_log_id           uuid;
  v_conflitos        int     := 0;
  v_pend_apagadas    int     := 0;
  v_lanc_desvinc     int     := 0;
  v_subst_anulados   int     := 0;
begin
  -- ---------- 0. contexto de operador ----------
  if v_uid is null then
    raise exception 'Operador não autenticado: o import só roda numa sessão de operador.';
  end if;

  if p_empresa is null then
    raise exception 'Informe a empresa da operação.' using errcode = '42501';
  end if;

  -- ---------- 0b. GUARDA DE CARGO — administrador DESTA empresa (F67) ----------
  if not public.e_admin_na(p_empresa) then
    raise exception 'Apenas administradores podem executar o import de startup.'
      using errcode = '42501';
  end if;

  -- ---------- 1a. filial ----------
  v_filial := (p_plano->>'filialId')::smallint;
  select ativo into v_filial_ativa from public.filiais where id = v_filial;
  if v_filial_ativa is null then
    raise exception 'Filial % não encontrada.', v_filial;
  end if;
  if v_filial_ativa is false then
    raise exception 'Filial % está inativa: import bloqueado.', v_filial;
  end if;

  -- ---------- 1a-bis. F67: a filial é DESTA empresa? E você escreve nela? ----------
  -- ANTES da trava e de qualquer validação do backup: o import da A nunca toca a filial da B.
  if not public.filial_da_empresa(p_empresa, v_filial) then
    raise exception 'Esta filial pertence a outra empresa.' using errcode = '42501';
  end if;
  if not public.pode_escrever_unidade(p_empresa, v_filial) then
    raise exception 'Você não tem permissão de escrita na filial % — o import foi recusado.', v_filial
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('import_substituir'), v_filial::int);

  -- ---------- 1b→2. tudo o que se recusa antes de escrever ----------
  v_total_plano := public.import_validar_plano(p_plano, p_backup_path, p_correcoes, v_filial);

  -- ---------- 2b. a janela TOCTOU ----------
  perform public.import_revalidar_contagens(p_contagens, v_filial);

  -- ---------- 3. DELETE ordenado (só desta filial) ----------
  perform set_config('estoque.dev_destrutivo', 'on', true);
  v_apagado := public.import_apagar_acervo_filial(v_filial);
  perform set_config('estoque.dev_destrutivo', 'off', true);

  v_movs_apagadas   := (v_apagado->>'movs_apagadas')::int;
  v_anot_apagadas   := (v_apagado->>'anotacoes_apagadas')::int;
  v_termos_apagados := (v_apagado->>'termos_apagados')::int;
  select coalesce(array_agg(t), '{}'::text[]) into v_arquivos_termos
    from jsonb_array_elements_text(v_apagado->'arquivos_termos') t;

  v_pend_apagadas  := coalesce((v_apagado->>'pendencias_apagadas')::int, 0);
  v_lanc_desvinc   := coalesce((v_apagado->>'lancamentos_desvinculados')::int, 0);
  v_subst_anulados := coalesce((v_apagado->>'ponteiros_anulados')::int, 0);

  -- ---------- 4. INSERT por ativo do plano ----------
  for e in select jsonb_array_elements(p_plano->'ativos')
  loop
    v_ativo_id := public.import_criar_ativos(e, v_filial);
    perform public.import_lancar_movimentacoes(
      v_ativo_id, e, v_filial, v_uid, v_data_import, v_obs_marcador
    );
    v_ativos_criados := v_ativos_criados + 1;
  end loop;

  -- ---------- 5. conferência dentro da transação ----------
  perform public.import_conferir_resultado(p_plano, v_filial, v_ativos_criados, v_total_plano);

  -- ---------- 5e. conflitos abertos por este import (a view já particiona por empresa) ----------
  v_conflitos := public.import_contar_conflitos(v_filial);

  -- ---------- 6. log + retorno ----------
  v_log_id := public.import_gravar_trilha(
    p_plano, v_filial, p_backup_path, p_correcoes, v_uid,
    v_ativos_criados, v_movs_apagadas, v_anot_apagadas, v_termos_apagados, v_conflitos
  );

  return jsonb_build_object(
    'log_id',                   v_log_id,
    'filial_id',                v_filial,
    'ativos_criados',           v_ativos_criados,
    'movs_apagadas',            v_movs_apagadas,
    'anotacoes_apagadas',       v_anot_apagadas,
    'termos_apagados',          v_termos_apagados,
    'arquivos_termos_apagados', to_jsonb(v_arquivos_termos),
    'conflitos_abertos',        v_conflitos,
    'pendencias_apagadas',       v_pend_apagadas,
    'lancamentos_desvinculados', v_lanc_desvinc,
    'ponteiros_anulados',        v_subst_anulados
  );
end $$;

comment on function public.exigir_dev_para_destruir(uuid, text) is
  'F67 (0190): guarda da Zona destrutiva POR EMPRESA — sessão, empresa informada, dev DAQUELA empresa (ou a plataforma), justificativa ≥ 10. Fechada.';
comment on function public.rotulo_alcance_reset(uuid, smallint, text) is
  'F67 (0190): o que se digita para confirmar um reset. O "tudo" da empresa carrega a quantidade: RESETAR TUDO — <N> ATIVOS (acervo) / <N> LANÇAMENTOS (itens); a filial, pelo nome. Fechada.';
comment on function public.previa_reset(uuid, text, smallint) is
  'F67 (0190): a prévia do reset, só leitura, no recorte da EMPRESA (o "tudo" = todas as filiais dela). Espelho exato das contagens dos resets.';
comment on function public.resetar_acervo(uuid, smallint, text, text, text, jsonb) is
  'F67 (0190): apaga o acervo de UMA filial da empresa, ou de TODAS as filiais DELA (p_filial NULL). Exige dev da empresa, a confirmação com a quantidade, backup no recorte e as contagens da prévia. Trilha com a empresa.';
comment on function public.resetar_itens(uuid, smallint, text, text, text, jsonb) is
  'F67 (0190): apaga os lançamentos de item de UMA filial da empresa, ou de TODAS as filiais DELA. Mesmas exigências do reset do acervo.';
comment on function public.apagar_ativo(uuid, uuid, text, text) is
  'F67 (0190): apaga um ativo DA EMPRESA informada e o rastro dele, com backup na trilha. Linha de outra empresa → 42501.';
comment on function public.apagar_item(uuid, smallint, text, text) is
  'F67 (0190): apaga um item do catálogo DA EMPRESA informada e os lançamentos dele. Item de outra empresa → 42501.';
comment on function public.apagar_movimentacao(uuid, uuid, text, text) is
  'F67 (0190): apaga a última movimentação de um ativo DA EMPRESA informada, recompondo o ativo pelo retrato. Linha de outra empresa → 42501.';
comment on function public.forcar_estado_ativo(uuid, uuid, public.status_ativo, text) is
  'F67 (0190): força o estado de um ativo DA EMPRESA informada por uma movimentação de ajuste marcada, gravada na empresa. Linha de outra empresa → 42501.';
comment on function public.forcar_saldo_item(uuid, smallint, smallint, integer, text) is
  'F67 (0190): força o saldo de um item numa filial, ambos DA EMPRESA informada, por um lançamento de ajuste marcado, gravado na empresa.';
comment on function public.importar_ativos_substituir(uuid, jsonb, text, jsonb, jsonb) is
  'F67 (0190): o import de startup (Substituir tudo) numa filial DA EMPRESA informada. Exige administrador da empresa e escrita na filial; filial de outra empresa → 42501 antes de qualquer trava ou validação.';

revoke all on function public.exigir_dev_para_destruir(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.rotulo_alcance_reset(uuid, smallint, text) from public, anon, authenticated, service_role;
revoke all on function public.previa_reset(uuid, text, smallint) from public, anon, service_role;
revoke all on function public.resetar_acervo(uuid, smallint, text, text, text, jsonb) from public, anon, service_role;
revoke all on function public.resetar_itens(uuid, smallint, text, text, text, jsonb) from public, anon, service_role;
revoke all on function public.apagar_ativo(uuid, uuid, text, text) from public, anon, service_role;
revoke all on function public.apagar_item(uuid, smallint, text, text) from public, anon, service_role;
revoke all on function public.apagar_movimentacao(uuid, uuid, text, text) from public, anon, service_role;
revoke all on function public.forcar_estado_ativo(uuid, uuid, public.status_ativo, text) from public, anon, service_role;
revoke all on function public.forcar_saldo_item(uuid, smallint, smallint, integer, text) from public, anon, service_role;
revoke all on function public.importar_ativos_substituir(uuid, jsonb, text, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.previa_reset(uuid, text, smallint) to authenticated;
grant execute on function public.resetar_acervo(uuid, smallint, text, text, text, jsonb) to authenticated;
grant execute on function public.resetar_itens(uuid, smallint, text, text, text, jsonb) to authenticated;
grant execute on function public.apagar_ativo(uuid, uuid, text, text) to authenticated;
grant execute on function public.apagar_item(uuid, smallint, text, text) to authenticated;
grant execute on function public.apagar_movimentacao(uuid, uuid, text, text) to authenticated;
grant execute on function public.forcar_estado_ativo(uuid, uuid, public.status_ativo, text) to authenticated;
grant execute on function public.forcar_saldo_item(uuid, smallint, smallint, integer, text) to authenticated;
grant execute on function public.importar_ativos_substituir(uuid, jsonb, text, jsonb, jsonb) to authenticated;

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   As onze novas com o md5 do prosrc = o do CI e os grants acima; os dois resets ANTIGOS com o prosrc = o do CI (o diff
--   contra o "antes" é SÓ a linha da sentinela); as outras antigas (apagar_*, forcar_*, previa_reset, rotulo_alcance_reset,
--   exigir_dev_para_destruir, importar_ativos_substituir) byte a byte. O conta a conta (--fase f67-depois):
--   exigir_dev_para_destruir nova (com a WAP) aceita e recusa as MESMAS contas que a antiga.
--
-- ROLLBACK (supabase/rollback/F67-desfaz.sql, depois de devolver as 0191–0192 e antes da 0189): derrubar as onze novas e
-- reemitir os dois resets antigos com o corpo da 0089 (a sentinela -1). Nenhum dado se perde.
