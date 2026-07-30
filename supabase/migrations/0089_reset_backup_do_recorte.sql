-- Migration 0089 — F23: o backup do reset tem de ser o backup DAQUELE recorte.
--
-- Achado da revisão adversarial da própria fase (30/07/2026).
--
-- =============================================================================
-- O FURO
-- =============================================================================
-- A `0083` já era mais rígida que o import: em vez do ritual de string
-- (`btrim(p_backup_path) <> ''`), ela CONFERE que o objeto existe no bucket
-- `backups-import`. Mas conferir que **existe um objeto com aquele nome** não é conferir que
-- **aquele objeto é o backup disto**.
--
-- Uma chamada forjada (um dev falando com o PostgREST direto, pulando a tela) podia passar o
-- caminho de QUALQUER objeto já existente no bucket — o backup de um import antigo de outra
-- filial, por exemplo — e a guarda deixava passar. O reset acontecia, o evento de auditoria
-- registrava um `backup_path` que existe de verdade, e a pessoa que fosse recuperar meses
-- depois abriria o arquivo errado. É o pior tipo de falha de backup: a que só aparece na hora
-- de usar.
--
-- =============================================================================
-- A CORREÇÃO
-- =============================================================================
-- A action grava o backup num caminho ESTRUTURADO, que já carrega o recorte:
--
--     reset/<bloco>/<escopo>/<carimbo>.json
--       bloco  = 'acervo' | 'itens'
--       escopo = 'global' | 'filial-<id>'
--
-- As duas RPCs passam a exigir esse prefixo, montado a partir dos MESMOS parâmetros que
-- decidem o que vai ser apagado. Assim o caminho deixa de ser um texto qualquer e passa a ser
-- uma afirmação verificável: "este arquivo é o backup do bloco X, alcance Y".
--
-- ⚠ O que isto NÃO promete, e é honesto dizer: continua sendo possível apontar para um backup
-- ANTIGO do mesmo bloco e do mesmo alcance (o carimbo não é conferido). Fechar isso exigiria
-- guardar o caminho gerado numa tabela e casar depois — estado a mais para um ganho pequeno,
-- porque a guarda de CONTAGENS (que compara o estado vivo com a prévia) já recusa quando o
-- acervo mudou desde então. Prefixo + contagens cobrem o caso real; o resto é ritual.
--
-- ADITIVA: `create or replace` das duas RPCs, só o bloco da guarda muda. Nenhum dado tocado.
-- ⚠ O corpo CONTÉM exclusão de acervo → caminho **B** por precaução (o precedente mostra que
-- `create or replace` passa no gate).
--
-- REVERSÃO: reaplicar o corpo das duas da `0083`.

-- ---------------------------------------------------------------------------
-- A função que monta o prefixo — uma só, para as duas RPCs lerem a MESMA régua
-- ---------------------------------------------------------------------------
-- Espelha o caminho que `resetarBloco` (src/lib/actions/dev-destrutivo.ts) constrói. Mexeu
-- num, mexa no outro — e o roteiro `supabase/tests/dev_destrutivo.sql` denuncia a divergência.
create or replace function public.prefixo_backup_reset(p_bloco text, p_filial smallint)
returns text
language sql
immutable
set search_path = public
as $$
  select 'reset/' || p_bloco || '/'
      || case when p_filial is null then 'global' else 'filial-' || p_filial::text end
      || '/'
$$;

comment on function public.prefixo_backup_reset(text, smallint) is
  'F23: o prefixo obrigatório do caminho do backup de um reset — reset/<bloco>/<global|filial-N>/. Espelha o caminho que a Server Action grava. Existe para que a RPC possa exigir que o backup informado seja o backup DAQUELE recorte, e não de um qualquer que por acaso exista no bucket.';

revoke all on function public.prefixo_backup_reset(text, smallint) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- resetar_acervo — só o bloco do backup muda
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
    perform pg_advisory_xact_lock(hashtext('import_substituir'), -1);
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

comment on function public.resetar_acervo(smallint, text, text, text, jsonb) is
  'F23 (/dev): esvazia o ACERVO — ativos, movimentações, anotações, pendências de item e termos — de UMA filial ou do sistema inteiro. NÃO recria nada e NÃO toca cadastro nenhum, nem relatorios_gerados/eventos_admin/import_logs. O recorte por filial é pelo ATIVO: leva o rastro inteiro dele, inclusive movimentações registradas em outra filial, e NÃO leva movimentações desta filial cujo ativo já migrou. Exige cargo dev, confirmação digitada, justificativa, contagens revalidadas E um backup que exista no bucket SOB O PREFIXO DESTE RECORTE (0089) — conferir só a existência do nome deixava passar o backup de outro import.';

revoke all on function public.resetar_acervo(smallint, text, text, text, jsonb) from public, anon, service_role;
grant execute on function public.resetar_acervo(smallint, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- resetar_itens — idem
-- ---------------------------------------------------------------------------
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
    perform pg_advisory_xact_lock(hashtext('import_substituir'), -1);
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

comment on function public.resetar_itens(smallint, text, text, text, jsonb) is
  'F23 (/dev): apaga os LANÇAMENTOS de itens de UMA filial ou de todas — e com eles o saldo, que é derivado. O CATÁLOGO não é tocado. Mesmas guardas do resetar_acervo, inclusive o backup sob o prefixo DESTE recorte (0089).';

revoke all on function public.resetar_itens(smallint, text, text, text, jsonb) from public, anon, service_role;
grant execute on function public.resetar_itens(smallint, text, text, text, jsonb) to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   select p.proname, pg_get_functiondef(p.oid) like '%prefixo_backup_reset%' as amarra_recorte
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('resetar_acervo','resetar_itens');
--   -- esperado: true nas duas
--
--   select public.prefixo_backup_reset('acervo', null)      as global,
--          public.prefixo_backup_reset('acervo', 1::smallint) as filial1;
--   -- esperado: 'reset/acervo/global/' e 'reset/acervo/filial-1/'
