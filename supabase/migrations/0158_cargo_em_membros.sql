-- =============================================================================
-- 0158_cargo_em_membros.sql — F62 (22/09/2026): a TROCA — todo leitor e escritor do cargo passa a `membros`
-- =============================================================================
-- classe: ADITIVA (recriação de funções, mesmas assinaturas; recópia idempotente para a
--         tabela nova; nenhuma linha existente de `profiles` muda)
--
-- A decisão iii do Johnny (22/09/2026): `profiles.papel` e `profiles.ativo` ficam
-- CONGELADOS. Ninguém mais os lê nem os escreve; o cargo e o status moram em `membros`,
-- por empresa (0153). Sem dupla escrita (regra 2 da §4). As colunas continuam de pé como
-- rede de reversão e caem numa entrega PATCH depois de três semanas verdes.
--
-- A PROMESSA: NENHUM PERFIL MUDA DE ACESSO. Com uma empresa e uma membership por perfil,
-- cada função abaixo responde exatamente o que respondia — provado no CI pela grade
-- `supabase/tests/cargo_equivalencia.sql` (o corpo ANTIGO em pg_temp × o corpo vivo, célula
-- a célula) e, nos dois bancos, pela impressão do acesso antes × depois
-- (`docs/f62-evidencias/impressao-acesso.sql`).
--
-- 0. A RECÓPIA, PRIMEIRO, NA MESMA TRANSAÇÃO DA TROCA. `profiles` → `membros`, idempotente
--    (insere quem falta, corrige quem divergiu), com `profiles` travada em SHARE ROW
--    EXCLUSIVE até o fim da transação do apply: nenhuma troca de cargo feita pelas RPCs
--    antigas entre a 0153 e esta migration se perde, e nenhuma entra durante a troca. (No
--    CI cada comando é a sua própria transação e a trava vale só para o bloco — lá não há
--    concorrência. No apply pelo conector, a migration inteira é uma transação.)
--
-- 1. AS LEITORAS (a PONTE — decisão 4 da fase): `papel_atual()` continua SEM parâmetro e
--    passa a responder pela membership na EMPRESA LEGADA (`public.empresa_legada()`) —
--    nunca pelo cargo mais forte entre empresas. O `excluido_em` continua vindo de
--    `profiles` (é da CONTA). `e_admin()`, `e_dev()` e `pode_escrever()` chamam
--    `papel_atual()` e herdam a ponte sem mudar. `pode_escrever_filial()` lê o vínculo pela
--    MEMBERSHIP legada (0156). `existe_outro_admin_ativo()` conta as memberships dev/admin
--    ativas da empresa legada com perfil não arquivado — o dev CONTA, de propósito (decisão
--    1 da 0074; `cargo_dev.sql` 5d); o `(p_escopo is null or true)` fica até a F67 (R-ACC-51).
--    `exigir_gestao_de()` lê o cargo do ALVO em `membros`. `checagens_integridade_nucleo()`
--    conta o operador sem filial por membership.
--
-- 2. AS ESCRITORAS: `definir_papel_usuario` grava `membros.papel`; `definir_status_usuario`,
--    `membros.ativo`; `definir_vinculos_usuario` reescreve os vínculos da membership legada
--    (o `on conflict` passa à PK nova da 0156 — fato 7); `apagar_usuario` grava
--    `excluido_em` em `profiles` (é da conta) e DESATIVA TODAS as memberships da pessoa. As
--    cinco continuam passando por `exigir_gestao_de` e abrindo/fechando a janela
--    `estoque.gestao_usuarios` (que agora arma também `membros_guarda_dev`).
--    `encerrar_sessoes_usuario` não lê cargo (só via `exigir_gestao_de`) e não é recriada.
--
-- 3. A GUARDA DE `profiles` (`profiles_guarda_dev`) — a EXCEÇÃO NOMEADA da varredura do
--    cargo (`k_excecoes_cargo`, `supabase/tests/cargo_em_membros.sql`): continua protegendo
--    a coluna congelada e o `excluido_em` de um dev. O "é dev?" passa a olhar TAMBÉM
--    `membros` — senão uma conta promovida a dev depois da F62 (cujo `profiles.papel`
--    ficou no cargo antigo) perderia a proteção do `excluido_em`.
--
-- 4. LEGADO: `profiles.papel` e `profiles.ativo` ganham o comentário de congelamento.
--
-- O QUE NÃO MUDA: as assinaturas, os `security definer`, os `search_path`, os grants (o
-- `create or replace` os preserva), as mensagens e os SQLSTATE de todas as recusas, e as 61
-- policies vivas.
--
-- ROLLBACK, em prosa (docs/PLAN-F62.md §5.1, passos 1 e 2; rodável em
-- supabase/rollback/F62-1-copia-de-volta.sql e F62-2-desfaz.sql, bloco 0158): PRIMEIRO
-- copiar `membros` → `profiles` (papel e ativo, pela membership legada, com a janela) — sem
-- isso, quem foi desativado ou rebaixado depois da F62 voltaria ao cargo congelado; SÓ
-- ENTÃO religar os leitores antigos: reverter o app e reemitir as dez funções com o corpo
-- vigente até a 0151 (0073, 0072, 0132, 0074, 0138), e devolver os comentários da 0061.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) A recópia — um bloco só, com `profiles` travada e a janela aberta
-- ---------------------------------------------------------------------------
do $recopia$
begin
  lock table public.profiles in share row exclusive mode;
  perform set_config('estoque.gestao_usuarios', 'on', true);
  insert into public.membros as m (empresa_id, profile_id, papel, ativo, created_at)
  select public.empresa_legada(), p.id, p.papel, p.ativo, p.created_at
    from public.profiles p
  on conflict (empresa_id, profile_id) do update
     set papel = excluded.papel,
         ativo = excluded.ativo
   where (m.papel, m.ativo) is distinct from (excluded.papel, excluded.ativo);
  perform set_config('estoque.gestao_usuarios', 'off', true);
end
$recopia$;

-- ---------------------------------------------------------------------------
-- 1) papel_atual() — a PONTE
-- ---------------------------------------------------------------------------
create or replace function public.papel_atual()
returns public.papel_usuario
language sql
stable
security definer
set search_path = public
as $$
  select m.papel
    from public.membros m
    join public.profiles p on p.id = m.profile_id
   where m.profile_id = (select auth.uid())
     and m.empresa_id = public.empresa_legada()
     and m.ativo
     and p.excluido_em is null
$$;

comment on function public.papel_atual() is
  'F62 (era F22/F21): cargo do usuário logado NA EMPRESA LEGADA, ou NULL se não há sessão, não há perfil/membership, a membership está DESATIVADA (membros.ativo = false) ou a conta foi APAGADA (profiles.excluido_em). A PONTE: sem parâmetro até a F67, responde pela membership na empresa legada — nunca pelo cargo mais forte entre empresas. É a porta única por onde cargo, desativação e exclusão entram na RLS — valem no request seguinte, para leitura (piso da 0070) e escrita.';

-- ---------------------------------------------------------------------------
-- 2) pode_escrever_filial() — o vínculo pela membership
-- ---------------------------------------------------------------------------
create or replace function public.pode_escrever_filial(fid smallint)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_papel public.papel_usuario;
begin
  -- Sem filial não há o que autorizar. Fecha em vez de abrir.
  if fid is null then
    return false;
  end if;

  v_papel := public.papel_atual();

  -- F22: `dev` acompanha `admin` — escreve em toda filial, sem linha em operador_filiais.
  if v_papel in ('dev', 'admin') then
    return true;
  end if;

  -- F62: o vínculo é da MEMBERSHIP na empresa legada (a mesma que a ponte leu).
  if v_papel = 'operador' then
    return exists (
      select 1
        from public.operador_filiais vf     -- `of` é palavra reservada: alias `vf`
        join public.membros m on m.id = vf.membro_id and m.empresa_id = vf.empresa_id
       where m.profile_id = (select auth.uid())
         and m.empresa_id = public.empresa_legada()
         and vf.filial_id  = fid
    );
  end if;

  -- 'consulta', membership desativada, sem perfil, sem sessão.
  return false;
end;
$$;

comment on function public.pode_escrever_filial(smallint) is
  'F62 (era F22/F21): true se o usuário logado pode ESCREVER na filial informada. dev/admin → sempre; operador → só com vínculo da SUA membership na empresa legada (operador_filiais.membro_id); consulta/desativado/sem perfil → nunca; fid NULL → nunca. Só escrita: a LEITURA é ampla para todo logado ATIVO (ADR-001 + piso da 0070).';

-- ---------------------------------------------------------------------------
-- 3) existe_outro_admin_ativo() — as memberships de nível administrador
-- ---------------------------------------------------------------------------
create or replace function public.existe_outro_admin_ativo(p_excluindo uuid, p_escopo uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.membros m
      join public.profiles p on p.id = m.profile_id
     where m.empresa_id = public.empresa_legada()
       and m.papel in ('dev', 'admin')
       and m.ativo
       and p.excluido_em is null
       and m.profile_id <> p_excluindo
       -- ---------- F52: O RECORTE ----------
       -- `p_escopo is null` significa SEM RECORTE, e é o que as três chamadas de um
       -- argumento produzem hoje: o conjunto contado é EXATAMENTE o de antes.
       -- ⚠ A FORMA É DELIBERADA (R-ACC-51): igualdade crua contra um escopo nulo faria a
       -- trava do último administrador RECUSAR TUDO. A F67 troca o `true` pelo predicado
       -- real (o alvo na empresa p_escopo). O dev CONTA (decisão ii da F62; 5d).
       and (p_escopo is null or true)
  )
$$;

comment on function public.existe_outro_admin_ativo(uuid, uuid) is
  'F62 (era F22/F52): sobra alguma outra membership de NÍVEL ADMINISTRADOR (dev ou admin) ativa, com perfil não apagado, na empresa legada, além da pessoa informada? Insumo da trava "o sistema nunca fica sem administrador". dev conta de propósito. p_escopo: null = SEM RECORTE (o de sempre); o recorte entra em disjunção guardada na F67.';

-- ---------------------------------------------------------------------------
-- 4) exigir_gestao_de() — o cargo do ALVO vem de membros
-- ---------------------------------------------------------------------------
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

  -- F62: o cargo do alvo é o da membership na empresa legada (profiles.papel congelou).
  select m.papel into v_papel_alvo
    from public.membros m
   where m.profile_id = p_alvo
     and m.empresa_id = public.empresa_legada();
  if v_papel_alvo is null then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  -- ---------- F52: PERTENCIMENTO ----------
  -- DEPOIS da leitura do alvo (o alvo inexistente continua respondendo P0002) e ANTES do
  -- ramo de cargo (pertencimento é recusa mais fundamental que patente). Com uma empresa,
  -- `mesmo_escopo_de_gestao` devolve `true` e esta condição é inerte; a F67 dá o corpo.
  if not public.mesmo_escopo_de_gestao(p_alvo) then
    raise exception 'Este usuário não pertence à sua organização.'
      using errcode = '42501';
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
  'F62 (era F22/F52): guarda comum das RPCs de gestão de usuários. Levanta 42501 se: não há sessão; o alvo é o próprio autor (autoproteção); o alvo NÃO PERTENCE ao escopo de gestão de quem chama (F52, inerte com uma empresa); o alvo é dev (na membership legada) ou o cargo pedido é dev e o autor não é dev; ou o autor não é de nível administrador. P0002 se o alvo não tem membership na empresa legada.';

-- ---------------------------------------------------------------------------
-- 5) definir_papel_usuario — grava membros.papel
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

  select m.papel, m.ativo into v_antes, v_ativo
    from public.membros m
    join public.profiles p on p.id = m.profile_id
   where m.profile_id = p_alvo
     and m.empresa_id = public.empresa_legada()
     and p.excluido_em is null;
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
  update public.membros set papel = p_papel
   where profile_id = p_alvo and empresa_id = public.empresa_legada();
  perform set_config('estoque.gestao_usuarios', 'off', true);
end;
$$;

comment on function public.definir_papel_usuario(uuid, public.papel_usuario) is
  'F62 (era F22): troca o cargo de um usuário NA EMPRESA LEGADA (membros.papel — profiles.papel congelou). Autor precisa ser de nível administrador; se o alvo É dev ou o cargo pedido é dev, precisa ser dev. Recusa agir sobre si mesmo e recusa rebaixar a última conta de nível administrador ativa. É o ÚNICO caminho que as guardas de profiles e membros deixam passar.';

-- ---------------------------------------------------------------------------
-- 6) definir_status_usuario — grava membros.ativo
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

  select m.papel, m.ativo into v_papel, v_antes
    from public.membros m
    join public.profiles p on p.id = m.profile_id
   where m.profile_id = p_alvo
     and m.empresa_id = public.empresa_legada()
     and p.excluido_em is null;
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
  update public.membros set ativo = p_ativo
   where profile_id = p_alvo and empresa_id = public.empresa_legada();
  perform set_config('estoque.gestao_usuarios', 'off', true);
end;
$$;

comment on function public.definir_status_usuario(uuid, boolean) is
  'F62 (era F22): desativa (false) ou reativa (true) a membership de um usuário NA EMPRESA LEGADA (membros.ativo — profiles.ativo congelou). false faz papel_atual() devolver NULL, o que fecha leitura E escrita no request seguinte (0070). O ban no Supabase Auth, que impede login NOVO, continua sendo feito pela Server Action.';

-- ---------------------------------------------------------------------------
-- 7) definir_vinculos_usuario — os vínculos da membership
-- ---------------------------------------------------------------------------
create or replace function public.definir_vinculos_usuario(p_alvo uuid, p_filiais smallint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_papel  public.papel_usuario;
  v_membro uuid;
begin
  perform public.exigir_gestao_de(p_alvo, null);

  select m.papel, m.id into v_papel, v_membro
    from public.membros m
    join public.profiles p on p.id = m.profile_id
   where m.profile_id = p_alvo
     and m.empresa_id = public.empresa_legada()
     and p.excluido_em is null;
  if v_papel is null then
    raise exception 'Usuário não encontrado (ou já apagado).' using errcode = 'P0002';
  end if;

  perform set_config('estoque.gestao_usuarios', 'on', true);

  delete from public.operador_filiais where membro_id = v_membro;

  -- Para dev/admin/consulta a lista chega vazia (o schema Zod recusa o contrário), e o
  -- delete acima LIMPA vínculos de quem foi promovido/rebaixado. F62: o vínculo é da
  -- MEMBERSHIP (0156) — filial de outra empresa é recusada pela FK composta (23503).
  if p_filiais is not null and array_length(p_filiais, 1) > 0 then
    insert into public.operador_filiais (empresa_id, membro_id, usuario_id, filial_id)
    select public.empresa_legada(), v_membro, p_alvo, f
      from unnest(p_filiais) as f
    on conflict (empresa_id, membro_id, filial_id) do nothing;
  end if;

  perform set_config('estoque.gestao_usuarios', 'off', true);
end;
$$;

comment on function public.definir_vinculos_usuario(uuid, smallint[]) is
  'F62 (era F22): reescreve as filiais de ESCRITA da membership do usuário na empresa legada (apaga e regrava). Só o cargo operador usa vínculo: dev/admin escrevem em todas e consulta em nenhuma, e para eles a lista chega vazia. Mesma guarda das demais — um admin não mexe nos vínculos de um dev.';

-- ---------------------------------------------------------------------------
-- 8) apagar_usuario — arquiva a CONTA e desativa as memberships
-- ---------------------------------------------------------------------------
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

  select m.papel into v_papel
    from public.membros m
    join public.profiles p on p.id = m.profile_id
   where m.profile_id = p_alvo
     and m.empresa_id = public.empresa_legada()
     and p.excluido_em is null;
  if v_papel is null then
    raise exception 'Usuário não encontrado (ou já apagado).' using errcode = 'P0002';
  end if;

  if v_papel in ('dev', 'admin') and not public.existe_outro_admin_ativo(p_alvo) then
    raise exception 'Este é o último administrador ativo do sistema. Promova outra pessoa antes de apagar este acesso.'
      using errcode = '42501';
  end if;

  perform set_config('estoque.gestao_usuarios', 'on', true);

  -- `excluido_em` é da CONTA (profiles); o status é de cada MEMBERSHIP — todas desligadas,
  -- em toda empresa: conta apagada não é membro de nada.
  update public.profiles
     set excluido_em = now()
   where id = p_alvo;
  update public.membros
     set ativo = false
   where profile_id = p_alvo;

  -- Vínculos somem: não há o que auditar num vínculo de conta apagada, e a trilha de quem
  -- fez o quê vive em eventos_admin (que sobrevive por `on delete set null`).
  delete from public.operador_filiais where usuario_id = p_alvo;

  perform set_config('estoque.gestao_usuarios', 'off', true);
end;
$$;

comment on function public.apagar_usuario(uuid) is
  'F62 (era F22): ARQUIVA a conta (profiles.excluido_em = now()), DESATIVA todas as memberships e limpa os vínculos. NÃO apaga a linha de profiles — dez FKs de histórico apontam para ela e é dela que sai a autoria em toda tela. Quem apaga a conta em auth.users (liberando o e-mail) é a Server Action, DEPOIS desta chamada: assim, se o Auth falhar, o acesso já está negado. Privativa do cargo dev.';

-- ---------------------------------------------------------------------------
-- 9) profiles_guarda_dev — a exceção nomeada: continua protegendo a coluna congelada
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guarda_dev()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oficial boolean := coalesce(current_setting('estoque.gestao_usuarios', true), '') = 'on';
  v_era_dev boolean;
begin
  if v_oficial then
    -- Caminho oficial (as RPCs de gestão, que já checaram e_dev()/e_admin() por dentro).
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'INSERT' then
    -- Nascer já `dev`. O trigger handle_new_user insere com o default 'operador', então este
    -- ramo só barra quem tenta plantar um dev direto na tabela.
    if new.papel = 'dev' then
      raise exception 'Só um desenvolvedor pode conceder o cargo Desenvolvedor.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- F62: "é dev?" olha a coluna congelada E a membership (a fonte viva desde a 0158) —
  -- uma conta promovida a dev depois da F62 tem profiles.papel no cargo antigo.
  v_era_dev := old.papel = 'dev'
               or exists (select 1 from public.membros m
                           where m.profile_id = old.id and m.papel = 'dev');

  if tg_op = 'DELETE' then
    -- Apagar a LINHA de um dev. (O "apagar usuário" do produto NÃO faz isto: ele arquiva.)
    if v_era_dev then
      raise exception 'Só um desenvolvedor pode apagar o perfil de um desenvolvedor.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  -- UPDATE. Qualquer outra edição passa (inclusive o próprio dev corrigindo primeiro_nome/
  -- sobrenome pela policy "atualiza proprio perfil").
  if v_era_dev
     and (new.papel       is distinct from old.papel
       or new.ativo       is distinct from old.ativo
       or new.excluido_em is distinct from old.excluido_em) then
    raise exception 'Este usuário é um desenvolvedor: só outro desenvolvedor pode alterar o cargo, desativar ou apagar esta conta.'
      using errcode = '42501';
  end if;

  if new.papel = 'dev' and old.papel is distinct from new.papel then
    raise exception 'Só um desenvolvedor pode conceder o cargo Desenvolvedor.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.profiles_guarda_dev() is
  'F62 (era F22): REDE FINAL da proteção do cargo dev em profiles — a EXCEÇÃO NOMEADA da varredura do cargo congelado. Recusa, para QUALQUER caminho que não seja o oficial (inclusive o service role), (a) mudar papel/ativo (congelados) ou excluido_em de um dev, (b) conceder o cargo dev na coluna congelada e (c) apagar a linha de um dev. "É dev" = a coluna congelada OU uma membership dev (a fonte viva desde a 0158). O espelho em membros é membros_guarda_dev (0153).';

-- ---------------------------------------------------------------------------
-- 10) checagens_integridade_nucleo — o operador sem filial, por membership
-- ---------------------------------------------------------------------------
-- O corpo é o VIGENTE da 0138, byte a byte, salvo o bloco `operador_sem_filial`.
create or replace function public.checagens_integridade_nucleo()
returns table(chave text, total bigint, amostra text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
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

  return query
  with d as (
    select a.patrimonio as item from public.ativos a join public.filiais f on f.id = a.filial_id where not f.ativo
  )
  select 'ativo_filial_inativa'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select t.arquivo_path as item from public.termos_gerados t
      left join storage.objects o on o.bucket_id = 'termos' and o.name = t.arquivo_path
     where o.id is null
  )
  select 'termo_sem_arquivo'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select p.id::text as item from public.profiles p left join auth.users u on u.id = p.id
     where u.id is null and p.excluido_em is null
  )
  select 'perfil_sem_conta'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select u.id::text as item from auth.users u left join public.profiles p on p.id = u.id where p.id is null
  )
  select 'conta_sem_perfil'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select pi.id::text as item from public.pendencias_item pi
      join public.movimentacoes m on m.id = pi.movimentacao_id
     where pi.resolvida_em is null
       and exists (select 1 from public.movimentacoes e where e.estorno_de = m.id)
  )
  select 'pendencia_de_estornada'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- F62: o operador ATIVO sem filial é a MEMBERSHIP operadora da empresa legada sem vínculo.
  return query
  with d as (
    select p.id::text as item
      from public.membros m
      join public.profiles p on p.id = m.profile_id
     where m.empresa_id = public.empresa_legada()
       and m.papel = 'operador' and m.ativo and p.excluido_em is null
       and not exists (select 1 from public.operador_filiais v where v.membro_id = m.id)
  )
  select 'operador_sem_filial'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select o.name as item from storage.objects o
     where o.bucket_id = 'termos'
       and not exists (select 1 from public.termos_gerados t where t.arquivo_path = o.name)
  )
  select 'arquivo_termo_orfao'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (select g.rotulo as item from public.v_conflitos_filiais_grupos g)
  select 'conflito_entre_filiais'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select coalesce(nullif(btrim(a.patrimonio), ''), nullif(btrim(a.service_tag), ''), a.id::text)
           || ' (' || a.status::text || ')' as item
      from public.ativos a
     where not public.status_tem_detentor(a.status)
       and (a.colaborador_atual is not null or a.setor_atual is not null)
  )
  select 'detentor_em_estado_sem_dono'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- F41 (0127) — a 11ª. A reserva por chamado saiu da tela: só um `liberacao` com
  -- o MESMO chamado a fecha, e nenhuma tela emite isso. Uma reserva aberta aqui
  -- é uma unidade presa sem caminho de volta — a 0127 converteu as 5 que havia, e
  -- esta checagem existe para que não voltem em silêncio.
  return query
  with d as (
    select i.nome || ' · ' || f.nome || ' · chamado ' || l.chamado
           || ' (' || sum(case l.tipo::text when 'reserva'   then l.quantidade
                                            when 'liberacao' then -l.quantidade
                                            else 0 end)::text || ')' as item
      from public.lancamentos_item l
      join public.itens   i on i.id = l.item_id
      join public.filiais f on f.id = l.filial_id
     where l.chamado is not null
     group by i.nome, f.nome, l.chamado
    having sum(case l.tipo::text when 'reserva'   then l.quantidade
                                 when 'liberacao' then -l.quantidade
                                 else 0 end) > 0
  )
  select 'reserva_aberta'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- ---------------------------------------------------------------------------
  -- 12ª (F54) — BACKUP ÓRFÃO em `backups-import`
  -- ---------------------------------------------------------------------------
  -- Objeto no bucket dos backups que não corresponde a operação nenhuma. Duas
  -- populações caem aqui, e as duas merecem: o backup que subiu para uma operação
  -- que a RPC RECUSOU (a partir da F54 o import descarta o dele sozinho; o reset e
  -- o conflito abaixo do teto não descartam) e o resíduo histórico de antes de a
  -- trilha existir — medidos 10 em produção em 09/09/2026, todos de julho.
  --
  -- ⚠ O PREDICADO NÃO FILTRA POR PREFIXO, e isso é decisão, não descuido. Os 22
  -- objetos que existem hoje estão TODOS na forma histórica `<slug>/<carimbo>.json`;
  -- a forma atual (`import/filial-<id>/…`, F52) ainda não produziu nenhum. Um
  -- predicado que reconhecesse só a forma nova acusaria os 22 de uma vez, e um que
  -- listasse as duas nasceria desatualizado na terceira. A pergunta certa é "alguém
  -- registrou este caminho?", e ela é agnóstica de forma.
  --
  -- ⚠ AS CÓPIAS DE `.docx` (F54) NÃO SÃO ÓRFÃS, e reconhecê-las é a metade difícil.
  -- Elas moram em `<raiz>/termos/<arquivo>`, e a RAIZ é sempre um valor que a própria
  -- operação JÁ gravou, DENTRO da transação dela:
  --   · import, reset e conflito acima do teto → o `backup_path` sem o `.json`;
  --   · apagar ativo                           → `detalhe->>'ativo_id'` (RPC 0082);
  --   · conflito abaixo do teto                → o digest da seleção, recalculado a
  --     partir de `detalhe->'selecionados'` com as funções que a 0100 já criou.
  -- É por isso que a F54 não precisou de evento nem de manifesto novo: não há escrita
  -- posterior que possa falhar em silêncio e transformar cópia legítima em órfã.
  --
  -- ⚠ SÓ `bucket_id` e `name` de `storage.objects`. O `bootstrap-storage.sql` do CI é
  -- o recorte MÍNIMO e NÃO tem a coluna `metadata` — um predicado que a usasse passaria
  -- aqui e morreria no `banco-sem-docker`.
  --
  -- ⚠ `not exists`, nunca `not in`: um NULL no subselect faria o `not in` devolver NULL
  -- para toda linha, a contagem sairia ZERO, e a checagem estaria "verde" por não
  -- enxergar nada. É o modo de falha mais silencioso que uma checagem pode ter.
  return query
  with registrados as (
    select l.backup_path as caminho
      from public.import_logs l
     where l.backup_path is not null
    union
    select e.detalhe->>'backup_path'
      from public.eventos_admin e
     where nullif(e.detalhe->>'backup_path', '') is not null
  ),
  copias as (
    select o.name
      from storage.objects o
     where o.bucket_id = 'backups-import'
       and o.name ~ '/termos/[^/]+$'
       and (
         exists (
           select 1 from registrados r
            where r.caminho = regexp_replace(o.name, '/termos/[^/]+$', '.json')
         )
         or exists (
           select 1 from public.eventos_admin ea
            where ea.acao = 'ativo_apagado'
              and 'ativo/' || (ea.detalhe->>'ativo_id') || '/'
                  = substring(o.name from '^(ativo/[0-9a-fA-F-]{36}/)termos/')
         )
         or exists (
           select 1 from public.eventos_admin ea
            where ea.acao = 'conflito_filiais_resolvido'
              and jsonb_typeof(ea.detalhe->'selecionados') = 'array'
              and public.prefixo_backup_conflito()
                  || public.digest_selecao_conflito(
                       array(select (x->>'ativo_id')::uuid
                               from jsonb_array_elements(ea.detalhe->'selecionados') x)) || '/'
                  = substring(o.name from '^(conflito/[0-9a-f]{32}/)termos/')
         )
       )
  ),
  d as (
    select o.name as item
      from storage.objects o
     where o.bucket_id = 'backups-import'
       and not exists (select 1 from registrados r where r.caminho = o.name)
       and not exists (select 1 from copias c where c.name = o.name)
  )
  select 'backup_orfao'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;
end;
$$;

comment on function public.checagens_integridade_nucleo() is
  'F62 (era F55, 0138): o SQL das DOZE checagens de integridade, em UM lugar só. A F62 trocou SÓ a operador_sem_filial, que passou a contar a MEMBERSHIP operadora ativa da empresa legada sem vínculo (profiles.papel/ativo congelaram). Não é alcançável de fora (revoke de public, anon, authenticated e service_role): quem a chama são as duas portas, dev_checagens_integridade() (guarda e_dev) e checagens_integridade_resumo() (guarda papel_atual is not null). SQL FIXO por dentro.';

-- ---------------------------------------------------------------------------
-- 11) LEGADO — as colunas congeladas
-- ---------------------------------------------------------------------------
comment on column public.profiles.papel is
  'LEGADO desde a F62 (0158, 22/09/2026) — CONGELADO. O cargo mora em membros.papel, por empresa; nenhuma função, policy, tela ou script lê ou escreve esta coluna (travas: supabase/tests/cargo_em_membros.sql e src/lib/validators/cargo-em-membros.test.ts). Fica de pé só como REDE DE REVERSÃO (o rollback da F62 copia membros → profiles antes de religar os leitores antigos) e cai numa entrega PATCH depois de três semanas verdes. profiles_guarda_dev continua a protegê-la.';
comment on column public.profiles.ativo is
  'LEGADO desde a F62 (0158, 22/09/2026) — CONGELADO. O status mora em membros.ativo, por empresa; nada mais lê nem escreve esta coluna. Rede de reversão até a entrega PATCH que a derruba (três semanas verdes). apagar_usuario deixou de gravá-la: arquiva a conta por excluido_em e desativa as memberships.';

-- ---------- VERIFICAÇÃO PÓS-APPLY (só contagens) ----------
--   -- a equivalência de dados: cada perfil com exatamente uma membership na WAP, papel e ativo iguais
--   select (select count(*) from public.profiles) as perfis,
--          (select count(*) from public.membros where empresa_id = public.empresa_legada()) as membros_wap,
--          (select count(*) from public.profiles p
--             join public.membros m on m.profile_id = p.id and m.empresa_id = public.empresa_legada()
--            where m.papel = p.papel and m.ativo = p.ativo) as iguais;
--   esperado: perfis = membros_wap = iguais (16 em produção, 5 no ensaio).
--   -- a assinatura única e o md5 do prosrc de cada função recriada (compare com o trecho do arquivo)
--   select p.proname, count(*) over (partition by p.proname) as assinaturas, md5(p.prosrc)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('papel_atual', 'pode_escrever_filial',
--      'existe_outro_admin_ativo', 'exigir_gestao_de', 'definir_papel_usuario', 'definir_status_usuario',
--      'definir_vinculos_usuario', 'apagar_usuario', 'profiles_guarda_dev', 'checagens_integridade_nucleo')
--    order by 1;
--   esperado: 10 linhas, assinaturas = 1 em cada.
--   notify pgrst, 'reload schema';
