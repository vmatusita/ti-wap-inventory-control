-- =============================================================================
-- F62-2-desfaz.sql — o ROLLBACK da F62, passos 2 a 8 (docs/PLAN-F62.md §5.1)
-- =============================================================================
-- ⚠ NUNCA RODE ISTO SEM TER RODADO ANTES `F62-1-copia-de-volta.sql` NA MESMA TRANSAÇÃO.
-- Sem a cópia, `profiles.papel`/`profiles.ativo` ficam com o valor CONGELADO no apply da
-- F62, e quem foi desativado ou rebaixado depois dela VOLTA ao cargo antigo no instante em
-- que `papel_atual()` volta a ler `profiles`. O roteiro `supabase/tests/f62_rollback.sql`
-- prova os dois lados no Postgres do CI (a sabotagem G).
--
-- GERADO — não editar à mão. Os corpos antigos vêm do corpo VIGENTE até a 0151 (o replay
-- das migrations, `scripts/db/cargo-congelado.mjs` → `funcoesVigentes(…, '0152')`), e a
-- trava de mesa `src/lib/validators/cargo-em-membros.test.ts` (describe 9) reprova se um
-- deles divergir do vigente, se faltar reemitir alguma função que a F62 recriou, ou se
-- faltar derrubar alguma que ela criou.
--
-- ORDEM (o inverso do apply; o passo 1 — a cópia — é o outro arquivo):
--   2. (0158) reemitir as dez funções com o corpo de antes e os comentários da 0061;
--      com o app novo no ar, reverter o app ANTES deste arquivo (redeploy do commit
--      anterior ao merge — nunca `git revert` do merge inteiro);
--   3. (0157) derrubar as quatro funções de conjunto;
--   4. (0156) desfazer o vínculo por membership em `operador_filiais`;
--   5. (0155) derrubar `filiais.empresa_id`;
--   6. (0154) derrubar `e_plataforma()` e `plataforma_admins`;
--   7. (0153) reemitir o `handle_new_user` da 0057 e derrubar `membros` e a guarda;
--   8. (0152) derrubar `empresas` e `empresa_legada()`.
-- Sem `begin`/`commit` próprios: quem roda decide a transação (o roteiro roda dentro da
-- dele; o SQL Editor, com `begin; … commit;` em volta dos DOIS arquivos).
-- O ledger (`supabase_migrations.schema_migrations`) NÃO é reescrito.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2) bloco 0158 — os leitores e escritores antigos do cargo
-- -----------------------------------------------------------------------------
-- papel_atual — corpo vigente até a 0151 (0073_dev_intocavel_e_arquivamento.sql)
create or replace function public.papel_atual()
returns public.papel_usuario
language sql
stable
security definer
set search_path = public
as $$
  select p.papel
    from public.profiles p
   where p.id = (select auth.uid())
     and p.ativo
     and p.excluido_em is null
$$;

comment on function public.papel_atual() is
  'F22 (era F21): cargo do usuário logado, ou NULL se não há sessão, não há perfil, o perfil está DESATIVADO (ativo = false) ou foi APAGADO (excluido_em not null). É a porta única por onde papel, desativação e exclusão entram na RLS — por isso as três valem no request seguinte, para LEITURA (piso da 0070) e para escrita.';

-- pode_escrever_filial — corpo vigente até a 0151 (0072_papel_dev_funcoes.sql)
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

  if v_papel = 'operador' then
    return exists (
      select 1
        from public.operador_filiais vf     -- `of` é palavra reservada: alias `vf`
       where vf.usuario_id = (select auth.uid())
         and vf.filial_id  = fid
    );
  end if;

  -- 'consulta', perfil desativado, sem perfil, sem sessão.
  return false;
end;
$$;

comment on function public.pode_escrever_filial(smallint) is
  'F22 (era F21): true se o usuário logado pode ESCREVER na filial informada. dev/admin → sempre; operador → só com vínculo em operador_filiais; consulta/desativado/sem perfil → nunca; fid NULL → nunca. Só escrita: a LEITURA é ampla para todo logado ATIVO (ADR-001 + piso da 0070).';

-- existe_outro_admin_ativo — corpo vigente até a 0151 (0132_guardas_de_escopo.sql)
create or replace function public.existe_outro_admin_ativo(p_excluindo uuid, p_escopo uuid default null)
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
       -- ---------- F52: O RECORTE ----------
       -- `p_escopo is null` significa SEM RECORTE, e é o que as três chamadas de um
       -- argumento produzem hoje: o conjunto contado é EXATAMENTE o de antes desta
       -- migration.
       --
       -- ⚠ A FORMA É DELIBERADA. Escrever `and <coluna> = p_escopo` faria a comparação
       -- virar NULL quando o escopo não viesse, o `exists` devolveria FALSE, e a trava do
       -- último administrador passaria a RECUSAR TUDO — trocando um defeito silencioso por
       -- um travamento barulhento. É o risco que o próprio plano nomeia. Por isso o escopo
       -- entra em DISJUNÇÃO GUARDADA (`p_escopo is null or …`), e nunca em igualdade crua.
       -- Há asserção dedicada em cargo_dev.sql provando que escopo nulo não recusa nada.
       --
       -- F65 troca o `true` do segundo termo pelo predicado real (o alvo na empresa
       -- p_escopo). A CONTA DE PLATAFORMA fica fora do denominador quando existir: um
       -- sistema cujo único administrador é o operador da plataforma está, para aquele
       -- cliente, SEM administrador. `plataforma_admins` não existe no schema hoje —
       -- medido em 08/09/2026 —, então a regra está escrita e não implementada, e o
       -- cabeçalho de cargo_dev.sql a repete para quem for fazer a F65.
       and (p_escopo is null or true)
  )
$$;

comment on function public.existe_outro_admin_ativo(uuid, uuid) is
  'F22/F52: sobra alguma outra conta de NÍVEL ADMINISTRADOR (dev ou admin) ativa e não apagada, além da informada? Insumo da trava "o sistema nunca fica sem administrador". dev conta de propósito. F52 acrescentou p_escopo: null = SEM RECORTE (o comportamento de sempre); o recorte entra em disjunção guardada para que escopo ausente NUNCA faça a função recusar tudo.';

-- exigir_gestao_de — corpo vigente até a 0151 (0132_guardas_de_escopo.sql)
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

  -- ---------- F52: PERTENCIMENTO ----------
  -- A guarda de escopo entra AQUI, e a posição é a decisão 1 da fase:
  --   · DEPOIS da leitura do perfil do alvo, porque o alvo inexistente tem de continuar
  --     respondendo "Usuário não encontrado" (P0002). Entrar antes trocaria uma mensagem
  --     correta por outra que descreve o mundo errado.
  --   · ANTES do ramo de cargo, porque pertencimento é uma recusa mais fundamental que
  --     patente: um administrador de OUTRA organização que caísse no ramo de cargo leria
  --     "Esta ação é restrita a administradores" — falso, e mandaria investigar a coisa
  --     errada. É o mesmo raciocínio que erros.ts já registra para a mesa de conflitos.
  -- Com uma empresa só, `mesmo_escopo_de_gestao` devolve `true` e esta condição é inerte.
  -- UMA condição protege as CINCO RPCs de gestão de conta, porque as cinco passam por aqui.
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
  'F22/F52: guarda comum das RPCs de gestão de usuários. Levanta 42501 se: não há sessão; o alvo é o próprio autor (autoproteção); o alvo NÃO PERTENCE ao escopo de gestão de quem chama (F52, via mesmo_escopo_de_gestao — inerte com uma empresa); o alvo é dev ou o cargo pedido é dev e o autor não é dev; ou o autor não é de nível administrador. P0002 se o alvo não existe.';

-- definir_papel_usuario — corpo vigente até a 0151 (0074_rpcs_gestao_usuarios.sql)
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

-- definir_status_usuario — corpo vigente até a 0151 (0074_rpcs_gestao_usuarios.sql)
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

-- definir_vinculos_usuario — corpo vigente até a 0151 (0074_rpcs_gestao_usuarios.sql)
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

-- apagar_usuario — corpo vigente até a 0151 (0074_rpcs_gestao_usuarios.sql)
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

-- profiles_guarda_dev — corpo vigente até a 0151 (0073_dev_intocavel_e_arquivamento.sql)
create or replace function public.profiles_guarda_dev()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oficial boolean := coalesce(current_setting('estoque.gestao_usuarios', true), '') = 'on';
begin
  if v_oficial then
    -- Caminho oficial (RPCs da 0074, que já checaram e_dev()/e_admin() por dentro).
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'DELETE' then
    -- Apagar a LINHA de um dev. (O "apagar usuário" do produto NÃO faz isto: ele arquiva,
    -- justamente porque as dez FKs de histórico apontam para cá. Um DELETE de verdade em
    -- profiles é sempre acidente ou ataque.)
    if old.papel = 'dev' then
      raise exception 'Só um desenvolvedor pode apagar o perfil de um desenvolvedor.'
        using errcode = '42501';
    end if;
    return old;
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

  -- UPDATE. Recusa em duas situações; qualquer outra edição passa (inclusive o próprio dev
  -- corrigindo primeiro_nome/sobrenome pelo perfil, que é a policy "atualiza proprio perfil"
  -- da 0001/0059 e NÃO pode ser barrada aqui).
  if old.papel = 'dev'
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
  'F22: REDE FINAL da proteção do cargo dev. Recusa, para QUALQUER caminho que não seja o oficial (inclusive o service role, que ignora RLS), (a) mudar papel/ativo/excluido_em de uma linha dev, (b) conceder o cargo dev e (c) apagar a linha de um dev. O caminho oficial são as RPCs de gestão da 0074, que declaram estoque.gestao_usuarios = on LOCAL à transação depois de checar e_dev(). Não substitui a autorização — só garante que não existe atalho por fora dela.';

-- checagens_integridade_nucleo — corpo vigente até a 0151 (0138_resumo_integridade_e_rotulo.sql)
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

  return query
  with d as (
    select p.id::text as item from public.profiles p
     where p.papel = 'operador' and p.ativo and p.excluido_em is null
       and not exists (select 1 from public.operador_filiais v where v.usuario_id = p.id)
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
  'F55 (0138): o SQL das DOZE checagens de integridade, em UM lugar só. Nasceu da extração VERBATIM do corpo da 0136 — nenhuma checagem foi reescrita, nenhuma mudou o que conta. Não é alcançável de fora (revoke de public, anon, authenticated e service_role): quem a chama são as duas portas, dev_checagens_integridade() (guarda e_dev) e checagens_integridade_resumo() (guarda papel_atual is not null), e as duas rodam como o dono. SQL FIXO por dentro — função que receba SQL, tabela ou coluna como parâmetro é PROIBIDA nesta casa.';

comment on column public.profiles.papel is
  'F21: cargo do usuário (admin/operador/consulta). Escrito SÓ pelo service role (actions de /admin/usuarios) — a 0063 revoga o UPDATE de `authenticated` nesta coluna por grant de coluna. NUNCA vem de raw_user_meta_data: o próprio usuário edita o metadata dele via auth.updateUser, logo metadata não é canal confiável.';
comment on column public.profiles.ativo is
  'F21: usuário habilitado. false = DESATIVADO: papel_atual() devolve NULL e toda policy de escrita fecha no REQUEST SEGUINTE (mesma filosofia da revogação de senha de acesso). Complementa — não substitui — o ban no Supabase Auth (ban_duration), que impede login novo. Escrito só pelo service role.';

-- -----------------------------------------------------------------------------
-- 3) bloco 0157 — as quatro funções de conjunto
-- -----------------------------------------------------------------------------
drop function public.empresas_do_membro();
drop function public.empresas_de_escrita();
drop function public.empresas_de_admin();
drop function public.unidades_de_escrita();

-- -----------------------------------------------------------------------------
-- 4) bloco 0156 — operador_filiais volta a ser por pessoa
-- -----------------------------------------------------------------------------
drop trigger operador_filiais_deriva_membership on public.operador_filiais;
drop function public.operador_filiais_deriva_membership();
alter table public.operador_filiais drop constraint operador_filiais_membro_fk;
alter table public.operador_filiais drop constraint operador_filiais_filial_da_empresa_fk;
alter table public.operador_filiais drop constraint operador_filiais_pkey;
alter table public.operador_filiais drop constraint operador_filiais_usuario_filial_uidx;
alter table public.operador_filiais add constraint operador_filiais_pkey primary key (usuario_id, filial_id);
alter table public.operador_filiais drop column membro_id;
alter table public.operador_filiais drop column empresa_id;

-- -----------------------------------------------------------------------------
-- 5) bloco 0155 — filiais sem empresa
-- -----------------------------------------------------------------------------
alter table public.filiais drop constraint filiais_empresa_id_uidx;
alter table public.filiais drop column empresa_id;

-- -----------------------------------------------------------------------------
-- 6) bloco 0154 — a plataforma
-- -----------------------------------------------------------------------------
drop function public.e_plataforma();
drop table public.plataforma_admins;

-- -----------------------------------------------------------------------------
-- 7) bloco 0153 — o handle_new_user de antes, e membros
-- -----------------------------------------------------------------------------
-- handle_new_user — corpo vigente até a 0151 (0057_perfil_nome_sobrenome.sql)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null
     or not (
          new.email ilike '%@wap.ind.br'
       or new.email ilike '%@stefanini.com'
       or new.email ilike '%@latam.stefanini.com'
     )
  then
    raise exception 'Login restrito a contas @wap.ind.br, @stefanini.com ou @latam.stefanini.com';
  end if;
  insert into public.profiles (id, primeiro_nome, sobrenome)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''), new.email),
    nullif(btrim(new.raw_user_meta_data ->> 'sobrenome'), '')
  );
  return new;
end;
$$;

drop trigger membros_guarda_dev on public.membros;
drop function public.membros_guarda_dev();
drop table public.membros;

-- -----------------------------------------------------------------------------
-- 8) bloco 0152 — a raiz
-- -----------------------------------------------------------------------------
drop table public.empresas;
drop function public.empresa_legada();

notify pgrst, 'reload schema';
