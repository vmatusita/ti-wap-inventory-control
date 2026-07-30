-- Migration 0083 — F23: a família RESETAR (bloco + alcance) e o caminho nomeado do seed.
--
-- Depende da 0079/0080/0081/0082. Contexto: F23 §3, e §Escopo ("cadastros nunca entram").
--
-- =============================================================================
-- O RECORTE POR FILIAL — o que ele É, medido, e não o que se supõe
-- =============================================================================
-- Espelha `importar_ativos_substituir` (§3.2 da ordem manda espelhar), e é preciso dizer em
-- voz alta o que esse espelho significa, porque a leitura ingênua de "não vaza para outra
-- filial" é FALSA nos dois sentidos — e isso vale para o import desde sempre:
--
--   · O recorte é pelo ATIVO, pela filial em que ele está HOJE (`ativos.filial_id`), e leva o
--     rastro INTEIRO dele. Logo, se um ativo foi transferido da filial 2 para a 1, resetar a
--     filial 1 apaga também as movimentações REGISTRADAS NA FILIAL 2 (elas são história
--     daquele ativo, e sem elas o ativo ficaria com uma linha do tempo mutilada).
--   · Pelo mesmo motivo, movimentações registradas NA filial 1 cujo ativo já migrou para a 2
--     NÃO são apagadas — elas pertencem a um ativo que não é mais desta filial.
--
-- Ou seja: o recorte é "os ativos desta filial e tudo que é deles", e não "tudo que aconteceu
-- nesta filial". É a definição certa (a alternativa deixaria ativos com história pela metade),
-- mas ela precisa estar escrita, porque o relatório por filial filtra por
-- `movimentacoes.filial_id` — então, depois de um reset da filial 1, um relatório da filial 1
-- ainda pode listar movimentações (as dos ativos que se mudaram). Registrado em
-- docs/DECISOES.md e assertado tal e qual no roteiro §7 — o teste prova o comportamento REAL,
-- não uma promessa mais simples do que a realidade.
--
-- =============================================================================
-- ⚠ O QUE O IMPORT ESQUECEU, E ESTA MIGRATION NÃO ESQUECE: `pendencias_item`
-- =============================================================================
-- `importar_ativos_substituir` apaga movimentacoes, anotacoes, termos_gerados e ativos — e
-- NÃO menciona `pendencias_item`, que nasceu depois dele (F18, migrations 0050–0053) com
-- `ativo_id` e `movimentacao_id` NO ACTION. Medido em 30/07/2026: o corpo vivo da RPC de
-- import não cita a tabela, em ensaio nem em produção. Consequência LATENTE: numa filial que
-- tenha qualquer pendência de item, o "Substituir tudo" do import falha com violação de FK.
-- Hoje não explode porque produção tem ZERO linhas em `pendencias_item` — sorte, não desenho.
-- ⚠ Isto é um BUG PREEXISTENTE DO IMPORT, fora do escopo desta ordem (§Escopo: "o import de
-- startup fica como está"); vai para o backlog no relatório da fase. As RPCs DESTA migration
-- apagam `pendencias_item` na ordem certa.
--
-- =============================================================================
-- O BACKUP É OBRIGATÓRIO E CONFERÍVEL (§1.4 da ordem)
-- =============================================================================
-- Mecânica copiada do import, que já a tem pronta e provada: a ACTION exporta o recorte em
-- JSON, sobe no bucket privado `backups-import` e passa o caminho; a RPC RECUSA sem ele. Some
-- a isso a revalidação obrigatória de contagens (a guarda que a 0040 acrescentou ao import
-- depois de um achado de dívida técnica): sem `p_contagens`, ou com contagens que não batem
-- com o estado vivo, a RPC recusa ANTES de apagar qualquer coisa. Juntas, as duas guardas dão
-- o que a ordem pede — backup garantido antes, e prova de que o que foi salvo é o que foi
-- apagado (fecha também a janela TOCTOU entre o preview/backup e o delete).
--
-- ⚠ SOBREVIVEM A QUALQUER RESET, de propósito (§Escopo): `relatorios_gerados`,
-- `eventos_admin` e `import_logs` — são HISTÓRIA ADMINISTRATIVA, não acervo; e TODOS os
-- cadastros: `filiais`, `motivos`, `itens` (o catálogo; só os lançamentos somem), `kits_modelos`,
-- `senhas_acesso`, `profiles` e `operador_filiais`.
--
-- ⚠ O corpo CONTÉM exclusão de acervo → BATE NO GATE → caminho **B** do RUNBOOK.
--
-- REVERSÃO: drop function public.resetar_acervo(smallint, text, text, text, jsonb),
--   public.resetar_itens(smallint, text, text, text, jsonb),
--   public.resetar_dados_ficticios(text);

-- ---------------------------------------------------------------------------
-- 0) A frase do alcance global e o rótulo do recorte
-- ---------------------------------------------------------------------------
create or replace function public.rotulo_alcance_reset(p_filial smallint)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when p_filial is null then 'RESETAR TUDO'
           else (select f.nome from public.filiais f where f.id = p_filial)
         end
$$;

comment on function public.rotulo_alcance_reset(smallint) is
  'F23: o texto que o dev precisa DIGITAR para confirmar um reset — o nome da filial, ou a frase fixa RESETAR TUDO quando o alcance é global. Existe como função para que a tela e a RPC leiam a MESMA fonte: confirmação que a tela calcula de um jeito e a RPC de outro é confirmação que não confere.';

revoke all on function public.rotulo_alcance_reset(smallint) from public, anon, service_role;
grant execute on function public.rotulo_alcance_reset(smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- 1) resetar_acervo — ativos + movimentações + anotações + pendências + termos
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

  -- ⚠ MESMO NAMESPACE DE LOCK DO IMPORT — a forma de DOIS argumentos, não a de um.
  -- `pg_advisory_xact_lock(bigint)` e `pg_advisory_xact_lock(int, int)` são espaços de lock
  -- DIFERENTES no Postgres: usar a de um argumento aqui não excluiria o import, e um reset
  -- poderia correr junto de um "Substituir tudo" na mesma filial. O import usa
  -- `pg_advisory_xact_lock(hashtext('import_substituir'), v_filial::int)` (0064:198).
  -- Para o alcance GLOBAL não basta uma chave sentinela: o global toca TODAS as filiais, então
  -- ele toma a chave de cada uma (em ordem crescente, para não formar deadlock com um segundo
  -- global) e mais a sentinela -1.
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

  -- BACKUP OBRIGATÓRIO — e CONFERIDO, não só declarado.
  -- ⚠ A guarda do import é `btrim(p_backup_path) <> ''`, isto é, um ritual de string: uma
  -- chamada forjada passa mandando "x". Aqui a RPC vai OLHAR se o objeto existe mesmo no
  -- bucket privado `backups-import` antes de apagar qualquer coisa. É leitura de
  -- `storage.objects`, que uma função `security definer` do dono alcança sem problema.
  if coalesce(length(btrim(p_backup_path)), 0) = 0 then
    raise exception 'Reset sem backup é proibido: o caminho do backup não veio. Gere o backup e tente de novo.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'backups-import' and o.name = btrim(p_backup_path)
  ) then
    raise exception 'O backup informado não existe no bucket (%). Nada foi apagado. Gere o backup novamente.', btrim(p_backup_path)
      using errcode = '22023';
  end if;

  -- TERMO DE LOTE MISTO (só no alcance por filial) — mesma rede do passo 2 do import.
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

  -- REVALIDAÇÃO DE CONTAGENS (guarda da 0040, aplicada aqui): fecha a janela entre o preview/
  -- backup e o delete. Ausente ou divergente → recusa ANTES de apagar.
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

  -- ---------- a janela abre ----------
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

  -- Ponteiros de substituição que atravessam o recorte (F14/F15): anular antes do delete,
  -- senão a FK auto-referente bloqueia quando só um lado do par está no recorte.
  update public.ativos set substitui_ativo_id = null
   where substitui_ativo_id in (
     select id from public.ativos where p_filial is null or filial_id = p_filial);

  delete from public.ativos a where p_filial is null or a.filial_id = p_filial;

  perform set_config('estoque.dev_destrutivo', 'off', true);
  -- ---------- a janela fecha ----------

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
  'F23 (/dev): esvazia o ACERVO — ativos, movimentações, anotações, pendências de item e termos — de UMA filial (p_filial) ou do sistema inteiro (p_filial null). NÃO recria nada e NÃO toca cadastro nenhum (filiais, motivos, catálogo de itens, kits, senhas, usuários), nem relatorios_gerados/eventos_admin/import_logs. O recorte por filial é pelo ATIVO: leva o rastro inteiro dele, inclusive movimentações registradas em outra filial, e NÃO leva movimentações desta filial cujo ativo já migrou. Exige cargo dev, confirmação digitada (nome da filial ou a frase RESETAR TUDO), justificativa, caminho de backup NÃO VAZIO e revalidação de contagens que bata com o estado vivo.';

revoke all on function public.resetar_acervo(smallint, text, text, text, jsonb) from public, anon, service_role;
grant execute on function public.resetar_acervo(smallint, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) resetar_itens — os LANÇAMENTOS (o catálogo fica)
-- ---------------------------------------------------------------------------
-- ⚠ O CATÁLOGO (`public.itens`) É CADASTRO e NÃO ENTRA (§3.1 e §Escopo). O que some são os
-- lançamentos — e, com eles, o saldo, que é derivado da soma deles e não existe em coluna
-- nenhuma.
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
  v_lanc     int := 0;
  v_e_lanc   int;
begin
  perform public.exigir_dev_para_destruir(p_justificativa);

  if p_filial is not null and not exists (select 1 from public.filiais f where f.id = p_filial) then
    raise exception 'Filial não encontrada.' using errcode = 'P0002';
  end if;

  -- Mesmo namespace de lock do import e do resetar_acervo (ver o comentário longo lá).
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

  -- ---------- a janela abre ----------
  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.lancamentos_item l where p_filial is null or l.filial_id = p_filial;

  perform set_config('estoque.dev_destrutivo', 'off', true);
  -- ---------- a janela fecha ----------

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
    'alcance',        case when p_filial is null then 'global' else 'filial' end,
    'filial_id',      p_filial,
    'rotulo',         v_esperado,
    'lancamentos',    v_lanc,
    'restam_lancamentos', (select count(*) from public.lancamentos_item l
                            where p_filial is null or l.filial_id = p_filial));

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

comment on function public.resetar_itens(smallint, text, text, text, jsonb) is
  'F23 (/dev): apaga os LANÇAMENTOS de itens por quantidade de UMA filial ou de todas — e com eles o saldo, que é 100% derivado da soma dos lançamentos. O CATÁLOGO (public.itens) é cadastro e NÃO é tocado. Mesmas guardas do resetar_acervo: cargo dev, confirmação digitada, justificativa, backup obrigatório e revalidação de contagens.';

revoke all on function public.resetar_itens(smallint, text, text, text, jsonb) from public, anon, service_role;
grant execute on function public.resetar_itens(smallint, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) resetar_dados_ficticios — o caminho NOMEADO do `npm run db:reset`
-- ---------------------------------------------------------------------------
-- ⚠ POR QUE ESTA FUNÇÃO PRECISA EXISTIR. `scripts/reset.ts` zera o banco de desenvolvimento
-- apagando DIRETO por service role (`db.from('ativos').delete()`…). A guarda da 0081 recusa
-- exatamente isso — de propósito —, então sem um caminho nomeado o `npm run db:reset`
-- quebraria. Esta é a tradução da ferramenta para o mundo pós-guarda, e o SALDO DE SEGURANÇA
-- É POSITIVO: antes, o service role apagava QUALQUER COISA, de QUALQUER JEITO; agora ele
-- alcança o acervo por UMA função nomeada, auditável por `pg_get_functiondef`, que exige uma
-- frase de confirmação.
--
-- ⚠ A PROTEÇÃO CONTRA RODAR ISTO EM PRODUÇÃO CONTINUA SENDO A MESMA DE SEMPRE, e ela é do
-- lado do script: `scripts/env-guard.ts` recusa qualquer ref de produção (lista
-- REFS_DE_PRODUCAO, F11). Esta função NÃO tem como saber em que banco está — e fingir que sabe
-- seria pior que dizer a verdade. Ela não é chamada por NENHUM caminho do app.
--
-- ⚠ GRANT SÓ PARA service_role: `authenticated` e `anon` NÃO a executam. Um dev logado usa
-- resetar_acervo/resetar_itens, que exigem backup, contagens e trilha.
create or replace function public.resetar_dados_ficticios(p_confirmacao text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ativos int; v_movs int; v_anot int; v_lanc int; v_pend int; v_termos int; v_itens int;
begin
  if btrim(coalesce(p_confirmacao, '')) <> 'RESETAR DADOS FICTICIOS' then
    raise exception 'Confirmação ausente ou incorreta para o reset de dados fictícios.'
      using errcode = '22023';
  end if;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.pendencias_item;   get diagnostics v_pend   = row_count;
  delete from public.anotacoes;         get diagnostics v_anot   = row_count;
  delete from public.lancamentos_item;  get diagnostics v_lanc   = row_count;
  delete from public.termos_gerados;    get diagnostics v_termos = row_count;
  delete from public.movimentacoes;     get diagnostics v_movs   = row_count;
  update public.ativos set substitui_ativo_id = null where substitui_ativo_id is not null;
  delete from public.ativos;            get diagnostics v_ativos = row_count;
  delete from public.itens;             get diagnostics v_itens  = row_count;

  perform set_config('estoque.dev_destrutivo', 'off', true);

  return jsonb_build_object(
    'ativos', v_ativos, 'movimentacoes', v_movs, 'anotacoes', v_anot,
    'lancamentos_item', v_lanc, 'pendencias_item', v_pend,
    'termos_gerados', v_termos, 'itens', v_itens);

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

comment on function public.resetar_dados_ficticios(text) is
  'F23: o caminho NOMEADO que `npm run db:reset` (scripts/reset.ts) usa para zerar o acervo de um banco de DESENVOLVIMENTO depois que a guarda da 0081 passou a recusar exclusão direta por service role. Exige a frase RESETAR DADOS FICTICIOS. Execute concedido SÓ ao service_role — nenhum caminho do app a alcança. A proteção contra rodar em produção continua sendo scripts/env-guard.ts (REFS_DE_PRODUCAO), do lado do script: o banco não tem como saber quem ele é. NÃO apaga eventos_admin (o script cuida disso à parte) nem cadastro nenhum.';

revoke all on function public.resetar_dados_ficticios(text) from public, anon, authenticated;
grant execute on function public.resetar_dados_ficticios(text) to service_role;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) as funções e os grants (note o SERVICE_ROLE invertido na última):
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth,
--          has_function_privilege('service_role', p.oid, 'execute')  as srv
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public'
--      and p.proname in ('rotulo_alcance_reset','resetar_acervo','resetar_itens','resetar_dados_ficticios')
--    order by p.proname;
--   -- esperado: resetar_acervo/resetar_itens/rotulo_alcance_reset → anon=false auth=true srv=false
--   --           resetar_dados_ficticios                            → anon=false auth=FALSE srv=TRUE
--
--   -- 2) abre = fecha em todas (o +1 é o fecho do bloco `exception`):
--   select p.proname,
--          (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), '''on''', ''))) / 4  as abre,
--          (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), '''off''', ''))) / 5 as fecha
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('resetar_acervo','resetar_itens','resetar_dados_ficticios');
--   -- esperado: fecha = abre + 1 nas três
--
--   -- 3) NENHUM cadastro é citado como alvo de exclusão nas duas RPCs do dev:
--   select p.proname,
--          pg_get_functiondef(p.oid) ~* 'delete from public\.(filiais|motivos|kits_modelos|senhas_acesso|profiles|operador_filiais|relatorios_gerados|eventos_admin|import_logs)' as toca_cadastro
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('resetar_acervo','resetar_itens');
--   -- esperado: false nas duas
--
--   -- 4) `itens` (catálogo) NÃO é apagado por resetar_itens:
--   select pg_get_functiondef('public.resetar_itens(smallint,text,text,text,jsonb)'::regprocedure)
--          ~* 'delete from public\.itens' as apaga_catalogo;
--   -- esperado: false
