-- Migration 0074 — F22: as RPCs de gestão de usuários — o ÚNICO caminho que atravessa a
-- rede da 0073, e o lugar onde a autorização de verdade acontece.
--
-- Depende da 0071 (label `dev`), 0072 (e_dev/e_admin) e 0073 (coluna `excluido_em` + trigger).
-- Contexto: docs/prompts/F22-cargo-dev-ultracode.md §2.1, §2.4, §3.2 e §3.3.
--
-- =============================================================================
-- O QUE MUDA NO DESENHO DO APP
-- =============================================================================
-- Até aqui, papel/ativo/vínculos eram gravados pelo SERVICE ROLE direto da Server Action
-- (`aplicarCargoEVinculos`). Isso tinha uma consequência que a F21 aceitou e a F22 não pode:
-- o service role passa por fora de toda policy, então a autorização morava INTEIRA no `if`
-- da action — e um `if` de TypeScript não protege contra um request forjado que chegue por
-- outro caminho, nem contra uma action futura que esqueça a guarda.
--
-- A partir daqui essas gravações são RPCs `security definer` chamadas com o CLIENT DE SESSÃO
-- (nunca o service role). Ganhos concretos:
--   · a decisão "quem pode?" roda no Postgres, com `auth.uid()` real, e vale para qualquer
--     chamador — action, script, curl com o token de um admin;
--   · a mesma função que a UI chama é a que o roteiro SQL testa com papel simulado;
--   · a rede da 0073 pode recusar TUDO por padrão, porque existe exatamente um caminho legal.
--
-- ⚠ AS DUAS CAMADAS QUE PRECISAM CONCORDAR. As mensagens em pt-BR continuam nascendo nas
-- funções PURAS do app (`validarTrocaDePapel`/`validarStatusDeUsuario`,
-- src/lib/validators/admin.ts), avaliadas ANTES da chamada — é o que dá erro amigável em vez
-- de SQLSTATE cru. As guardas daqui são a trava. Elas concordam POR CONSTRUÇÃO porque
-- decidem pelos mesmos predicados; onde discordarem, é bug, e supabase/tests/cargo_dev.sql é
-- a rede que o denuncia.
--
-- ⚠ POR QUE CADA RPC FECHA A JANELA AO SAIR. `set_config(k, v, true)` é local à TRANSAÇÃO,
-- não à chamada. Sem o `set_config(..., 'off', true)` do fim, uma transação que chamasse uma
-- destas funções e depois fizesse um UPDATE direto encontraria a rede da 0073 ABERTA.
-- Comprovado em ensaio antes de escrever a 0073 (ver o cabeçalho dela). Em produção cada
-- chamada do PostgREST é uma transação e o furo não apareceria — mas a correção custa uma
-- linha e não depende do transporte.
--
-- =============================================================================
-- DECISÕES DESTA MIGRATION (todas registradas em docs/DECISOES.md)
-- =============================================================================
-- 1. `dev` CONTA como "nível administrador" na invariante "o sistema nunca fica sem
--    administrador". Alternativa rejeitada: contar só `admin`, o que permitiria rebaixar o
--    último admin de um sistema que tem dev — deixando /admin acessível (dev alcança tudo que
--    admin alcança) mas a tela de usuários mentindo sobre quantos administradores existem.
-- 2. NÃO existe trava de "último dev". Um sistema sem dev é legal — era o estado até ontem —
--    e a 0076 (ou um UPDATE no SQL Editor) recoloca. Trava de último dev só criaria um estado
--    do qual não se sai pela tela.
-- 3. Os VÍNCULOS entram nas RPCs também (`definir_vinculos_usuario`), e não continuam no
--    service role. Motivo: se sobrasse um caminho de service role para `operador_filiais`,
--    um admin poderia reescrever os vínculos de um dev — inócuo hoje (dev escreve em toda
--    filial, ignorando a tabela), mas é exatamente o tipo de "inócuo hoje" que vira furo
--    quando o predicado muda. Com esta RPC, `src/lib/actions/admin.ts` deixa de usar o
--    client administrativo para gravar cargo/vínculo/status.
-- 4. Ninguém age sobre SI MESMO em nenhuma das cinco (nem o dev) — inclusive "encerrar
--    sessões", que não é destrutivo mas confundiria (a pessoa se deslogaria pela tela de
--    gestão de OUTRA pessoa). Precedente: as travas de autoproteção da F21.
--
-- ADITIVA: só cria funções. Nenhuma linha de dado é tocada. Caminho **A** do runbook.
-- REVERSÃO: `drop function public.definir_papel_usuario(uuid, public.papel_usuario),
--   public.definir_status_usuario(uuid, boolean), public.definir_vinculos_usuario(uuid, smallint[]),
--   public.apagar_usuario(uuid), public.encerrar_sessoes_usuario(uuid);`
--   (e devolver a gravação por service role em src/lib/actions/admin.ts).

-- ---------------------------------------------------------------------------
-- 0) Guarda comum — quem pode agir sobre quem
-- ---------------------------------------------------------------------------
-- Concentra a regra do §2 da ordem numa função só, para as cinco RPCs não a redigitarem
-- (redigitar é como as camadas divergem). Levanta em vez de devolver boolean: o chamador é
-- sempre "faça ou recuse", nunca "me diga se posso".
--
--   alvo é dev  OU  o cargo pedido é dev   →  exige e_dev()
--   qualquer outro caso                    →  exige e_admin()  (que desde a 0072 inclui dev)
create or replace function public.exigir_gestao_de(p_alvo uuid, p_papel_pedido public.papel_usuario default null)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_papel_alvo public.papel_usuario;
  v_toca_dev   boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Operador não autenticado.' using errcode = '42501';
  end if;

  -- Autoproteção (decisão 4): vale para TODOS os cargos, dev incluído.
  if p_alvo = (select auth.uid()) then
    raise exception 'Você não pode fazer isso com o seu próprio acesso. Peça a outro administrador.'
      using errcode = '42501';
  end if;

  select p.papel into v_papel_alvo from public.profiles p where p.id = p_alvo;
  if v_papel_alvo is null then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  v_toca_dev := (v_papel_alvo = 'dev') or (p_papel_pedido = 'dev');

  if v_toca_dev then
    if not public.e_dev() then
      raise exception 'Só um desenvolvedor pode gerir o cargo Desenvolvedor.'
        using errcode = '42501';
    end if;
  else
    if not public.e_admin() then
      raise exception 'Esta ação é restrita a administradores.'
        using errcode = '42501';
    end if;
  end if;
end;
$$;

comment on function public.exigir_gestao_de(uuid, public.papel_usuario) is
  'F22: guarda comum das RPCs de gestão de usuários. Levanta 42501 se: não há sessão; o alvo é o próprio autor (autoproteção); o alvo é dev ou o cargo pedido é dev e o autor não é dev; ou o autor não é de nível administrador. P0002 se o alvo não existe.';

revoke all on function public.exigir_gestao_de(uuid, public.papel_usuario) from public, anon, service_role;
grant execute on function public.exigir_gestao_de(uuid, public.papel_usuario) to authenticated;

-- ---------------------------------------------------------------------------
-- 0b) A invariante "nunca fique sem administrador" (decisões 1 e 2)
-- ---------------------------------------------------------------------------
-- Espelha `eAdminAtivo` + `existeOutroAdminAtivo` de src/lib/validators/admin.ts, com `dev`
-- contando junto. Lida SEMPRE na hora — a pergunta "isto deixaria o sistema sem
-- administrador?" não sai de cache.
create or replace function public.existe_outro_admin_ativo(p_excluindo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p
     where p.papel in ('dev', 'admin')
       and p.ativo
       and p.excluido_em is null
       and p.id <> p_excluindo
  )
$$;

comment on function public.existe_outro_admin_ativo(uuid) is
  'F22: sobra alguma outra conta de NÍVEL ADMINISTRADOR (dev ou admin) ativa e não apagada, além da informada? Insumo da trava "o sistema nunca fica sem administrador". dev conta de propósito: ele alcança tudo que o admin alcança (decisão registrada em docs/DECISOES.md).';

revoke all on function public.existe_outro_admin_ativo(uuid) from public, anon, service_role;
grant execute on function public.existe_outro_admin_ativo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1) definir_papel_usuario — troca de cargo
-- ---------------------------------------------------------------------------
create or replace function public.definir_papel_usuario(p_alvo uuid, p_papel public.papel_usuario)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes public.papel_usuario;
  v_ativo boolean;
begin
  perform public.exigir_gestao_de(p_alvo, p_papel);

  select p.papel, p.ativo into v_antes, v_ativo
    from public.profiles p where p.id = p_alvo and p.excluido_em is null;
  if v_antes is null then
    raise exception 'Usuário não encontrado (ou já apagado).' using errcode = 'P0002';
  end if;
  if v_antes = p_papel then
    return;   -- nada a fazer; não é erro (quem edita só as filiais não deve tropeçar aqui)
  end if;

  -- Rebaixar a última conta de nível administrador tranca /admin para todo mundo.
  if v_antes in ('dev', 'admin') and v_ativo
     and p_papel not in ('dev', 'admin')
     and not public.existe_outro_admin_ativo(p_alvo) then
    raise exception 'Este é o último administrador ativo do sistema. Promova outra pessoa antes de rebaixar este acesso.'
      using errcode = '42501';
  end if;

  perform set_config('estoque.gestao_usuarios', 'on', true);
  update public.profiles set papel = p_papel where id = p_alvo;
  perform set_config('estoque.gestao_usuarios', 'off', true);
end;
$$;

comment on function public.definir_papel_usuario(uuid, public.papel_usuario) is
  'F22: troca o cargo de um usuário. Autor precisa ser de nível administrador; se o alvo É dev ou o cargo pedido é dev, precisa ser dev. Recusa agir sobre si mesmo e recusa rebaixar a última conta de nível administrador ativa. É o ÚNICO caminho que a rede da 0073 deixa passar — nem o service role grava profiles.papel por fora.';

revoke all on function public.definir_papel_usuario(uuid, public.papel_usuario) from public, anon, service_role;
grant execute on function public.definir_papel_usuario(uuid, public.papel_usuario) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) definir_status_usuario — desativar / reativar
-- ---------------------------------------------------------------------------
create or replace function public.definir_status_usuario(p_alvo uuid, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_papel public.papel_usuario;
  v_antes boolean;
begin
  perform public.exigir_gestao_de(p_alvo, null);

  select p.papel, p.ativo into v_papel, v_antes
    from public.profiles p where p.id = p_alvo and p.excluido_em is null;
  if v_papel is null then
    raise exception 'Usuário não encontrado (ou já apagado).' using errcode = 'P0002';
  end if;
  if v_antes = p_ativo then
    return;
  end if;

  -- Reativar nunca é perigoso; só o caminho que DESLIGA passa pela trava.
  if not p_ativo
     and v_papel in ('dev', 'admin')
     and not public.existe_outro_admin_ativo(p_alvo) then
    raise exception 'Este é o último administrador ativo do sistema. Promova outra pessoa antes de desativar este acesso.'
      using errcode = '42501';
  end if;

  perform set_config('estoque.gestao_usuarios', 'on', true);
  update public.profiles set ativo = p_ativo where id = p_alvo;
  perform set_config('estoque.gestao_usuarios', 'off', true);
end;
$$;

comment on function public.definir_status_usuario(uuid, boolean) is
  'F22: desativa (false) ou reativa (true) um usuário. profiles.ativo = false faz papel_atual() devolver NULL, o que fecha leitura E escrita no request seguinte (0070). O ban no Supabase Auth, que impede login NOVO, continua sendo feito pela Server Action — esta RPC cuida da metade que tem efeito imediato.';

revoke all on function public.definir_status_usuario(uuid, boolean) from public, anon, service_role;
grant execute on function public.definir_status_usuario(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) definir_vinculos_usuario — as filiais de escrita do operador
-- ---------------------------------------------------------------------------
-- Apaga e regrava (como a action fazia): a tabela é minúscula (nº de operadores × nº de
-- filiais) e o estado final é o que a tela mostra, sem meio-caminho possível.
create or replace function public.definir_vinculos_usuario(p_alvo uuid, p_filiais smallint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_papel public.papel_usuario;
begin
  perform public.exigir_gestao_de(p_alvo, null);

  select p.papel into v_papel
    from public.profiles p where p.id = p_alvo and p.excluido_em is null;
  if v_papel is null then
    raise exception 'Usuário não encontrado (ou já apagado).' using errcode = 'P0002';
  end if;

  perform set_config('estoque.gestao_usuarios', 'on', true);

  delete from public.operador_filiais where usuario_id = p_alvo;

  -- Para dev/admin/consulta a lista chega vazia (o schema Zod recusa o contrário), e o
  -- delete acima LIMPA vínculos de quem foi promovido/rebaixado: deixá-los seria inofensivo
  -- no banco, mas a coluna "Filiais de escrita" passaria a exibir vínculo que não vale nada.
  if p_filiais is not null and array_length(p_filiais, 1) > 0 then
    insert into public.operador_filiais (usuario_id, filial_id)
    select p_alvo, f
      from unnest(p_filiais) as f
    on conflict (usuario_id, filial_id) do nothing;
  end if;

  perform set_config('estoque.gestao_usuarios', 'off', true);
end;
$$;

comment on function public.definir_vinculos_usuario(uuid, smallint[]) is
  'F22: reescreve as filiais de ESCRITA de um usuário (apaga e regrava). Só o cargo operador usa vínculo: dev/admin escrevem em todas e consulta em nenhuma, e para eles a lista chega vazia. Mesma guarda das demais — um admin não mexe nos vínculos de um dev.';

revoke all on function public.definir_vinculos_usuario(uuid, smallint[]) from public, anon, service_role;
grant execute on function public.definir_vinculos_usuario(uuid, smallint[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) apagar_usuario — o ARQUIVAMENTO (a metade que mora no banco)
-- ---------------------------------------------------------------------------
-- A outra metade — apagar a conta em auth.users — é da Server Action, que chama
-- `auth.admin.deleteUser` DEPOIS desta RPC. A ordem importa e é a de FALHA SEGURA: se a
-- metade do Auth falhar, o estado resultante já NEGA todo acesso (papel_atual() devolve NULL
-- por causa de `excluido_em`), e a action avisa o dev para tentar de novo. O inverso —
-- apagar no Auth primeiro — deixaria, em caso de falha aqui, um perfil vivo sem conta.
--
-- ⚠ NÃO apaga a linha de `profiles`, de propósito: dez FKs de histórico apontam para ela e é
-- dela que sai o nome em "Quem fez". Ver a PARTE 2 do cabeçalho da 0073.
create or replace function public.apagar_usuario(p_alvo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_papel public.papel_usuario;
begin
  -- Alvo dev exige autor dev (a guarda comum já cobre), e ninguém apaga a si mesmo.
  perform public.exigir_gestao_de(p_alvo, null);

  -- APAGAR é privativo do dev, mesmo quando o alvo NÃO é dev: é a ação irreversível da fase,
  -- e o §3 da ordem a coloca entre "as ações que o admin NÃO tem".
  if not public.e_dev() then
    raise exception 'Só um desenvolvedor pode apagar uma conta de usuário.'
      using errcode = '42501';
  end if;

  select p.papel into v_papel
    from public.profiles p where p.id = p_alvo and p.excluido_em is null;
  if v_papel is null then
    raise exception 'Usuário não encontrado (ou já apagado).' using errcode = 'P0002';
  end if;

  if v_papel in ('dev', 'admin') and not public.existe_outro_admin_ativo(p_alvo) then
    raise exception 'Este é o último administrador ativo do sistema. Promova outra pessoa antes de apagar este acesso.'
      using errcode = '42501';
  end if;

  perform set_config('estoque.gestao_usuarios', 'on', true);

  -- `ativo = false` junto com `excluido_em` é cinto e suspensório: qualquer leitura antiga
  -- que só conheça `ativo` (uma query fora do app, um script) também fecha.
  update public.profiles
     set excluido_em = now(),
         ativo       = false
   where id = p_alvo;

  -- Vínculos somem: não há o que auditar num vínculo de conta apagada, e a trilha de quem
  -- fez o quê vive em eventos_admin (que sobrevive por `on delete set null`).
  delete from public.operador_filiais where usuario_id = p_alvo;

  perform set_config('estoque.gestao_usuarios', 'off', true);
end;
$$;

comment on function public.apagar_usuario(uuid) is
  'F22: ARQUIVA o perfil (excluido_em = now(), ativo = false) e limpa os vínculos. NÃO apaga a linha de profiles — dez FKs de histórico apontam para ela e é dela que sai a autoria em toda tela. Quem apaga a conta em auth.users (liberando o e-mail) é a Server Action, DEPOIS desta chamada: assim, se o Auth falhar, o acesso já está negado. Privativa do cargo dev.';

revoke all on function public.apagar_usuario(uuid) from public, anon, service_role;
grant execute on function public.apagar_usuario(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) encerrar_sessoes_usuario — derrubar o acesso vigente
-- ---------------------------------------------------------------------------
-- ⚠ POR QUE ISTO É UMA RPC E NÃO UMA CHAMADA DE API. Na versão instalada
-- (@supabase/auth-js 2.110.2, conferida em node_modules) o método administrativo é
-- `admin.signOut(jwt, scope)` — ele recebe o **JWT** de uma sessão, não o id de um usuário.
-- O servidor não tem (nem deve ter) o token de outra pessoa, então NÃO existe caminho pela
-- API para revogar as sessões de terceiro. O mecanismo real é apagar as linhas de
-- `auth.sessions` do usuário; `auth.refresh_tokens.session_id` referencia `auth.sessions`
-- com ON DELETE CASCADE (medido em produção), então os refresh tokens caem junto.
--
-- ⚠ O LIMITE HONESTO, que a tela precisa dizer: isto derruba a RENOVAÇÃO, não o token que já
-- está no navegador. O access token corrente continua válido até expirar (~1h) — a mesma
-- janela da desativação da F21. Quem quiser efeito imediato usa DESATIVAR, que fecha leitura
-- e escrita no request seguinte via papel_atual().
create or replace function public.encerrar_sessoes_usuario(p_alvo uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  perform public.exigir_gestao_de(p_alvo, null);

  if not public.e_dev() then
    raise exception 'Só um desenvolvedor pode encerrar as sessões de um usuário.'
      using errcode = '42501';
  end if;

  delete from auth.sessions where user_id = p_alvo;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.encerrar_sessoes_usuario(uuid) is
  'F22: apaga as linhas de auth.sessions do usuário e devolve quantas foram. Os refresh tokens caem por cascade (auth.refresh_tokens.session_id → auth.sessions). NÃO invalida o access token já emitido, que vale até expirar (~1h) — para corte imediato, desative o usuário. Existe como RPC porque admin.signOut() do supabase-js recebe um JWT, não um id: não há caminho pela API para revogar sessão de terceiro. Privativa do cargo dev.';

revoke all on function public.encerrar_sessoes_usuario(uuid) from public, anon, service_role;
grant execute on function public.encerrar_sessoes_usuario(uuid) to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) as sete funções existem, definer, com execute só para authenticated:
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as definer,
--          has_function_privilege('anon', p.oid, 'execute')         as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth,
--          has_function_privilege('service_role', p.oid, 'execute')  as srv
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('exigir_gestao_de','existe_outro_admin_ativo','definir_papel_usuario',
--                        'definir_status_usuario','definir_vinculos_usuario','apagar_usuario',
--                        'encerrar_sessoes_usuario')
--    order by p.proname;
--   -- esperado: 7 linhas · definer = true · anon = false · auth = true · srv = false
--
--   -- 2) toda RPC fecha a janela que abriu (nenhuma esquece o 'off'):
--   select p.proname,
--          (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), '''on''', ''))) / 4  as abre,
--          (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), '''off''', ''))) / 5 as fecha
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('definir_papel_usuario','definir_status_usuario',
--                                               'definir_vinculos_usuario','apagar_usuario')
--    order by p.proname;
--   -- esperado: abre = fecha em TODAS as quatro
--
--   -- 3) a prova de comportamento (papel simulado, os dois sentidos) está em
--   --    supabase/tests/cargo_dev.sql — rode-o nos dois bancos.
