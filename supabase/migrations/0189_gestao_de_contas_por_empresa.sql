-- =============================================================================
-- 0189_gestao_de_contas_por_empresa.sql — F67 (13/11/2026): a gestão de contas POR EMPRESA (EXPANSÃO)
-- =============================================================================
-- classe: ADITIVA (sete funções NOVAS ao lado das antigas, de mesmo nome; o corpo de existe_outro_admin_ativo; nenhuma
--         tabela, policy ou linha muda)
--
-- As cinco RPCs de conta ganham `p_empresa uuid` como 1º parâmetro, SEM default, e decidem pelo cargo NAQUELA empresa.
-- EXPANSÃO (decisão 13/11-2 do Johnny, molde F60 com o nome mantido): a assinatura nova nasce ao lado da antiga; o app
-- novo passa a chamar a nova; a antiga só sai na CONTRAÇÃO (0193), depois do deploy e da prova de que ninguém a chama.
-- As antigas NÃO são tocadas aqui. A chamada nomeada do PostgREST escolhe pelo CONJUNTO de argumentos (a antiga não tem
-- `p_empresa`; a nova o exige): sem ambiguidade. No SQL, as auxiliares novas não têm default que as encolha até a aridade
-- da antiga — `exigir_gestao_de(p_alvo, null)` dos corpos antigos continua casando SÓ a antiga (docs/PLAN-F67.md §4).
--
--   mesmo_escopo_de_gestao(p_empresa, p_alvo)        NOVA: o alvo é membro DESTA empresa? (era `select true`, a F52)
--   exigir_gestao_de(p_empresa, p_alvo, p_papel)     NOVA: sessão; empresa informada; ninguém age sobre si; o alvo existe
--                                                    (P0002); o alvo é DESTA empresa (42501) — o pertencimento antes da
--                                                    patente —; e só então o cargo, por e_dev_na/e_admin_na DAQUELA empresa.
--   existe_outro_admin_ativo(p_excluindo, p_escopo)  CORPO: conta as memberships dev/admin ativas da empresa p_escopo (as
--                                                    contas dev CONTAM enquanto forem membros — decisão 12/11-3; a ficha
--                                                    dizia "plataforma fora do denominador": divergência declarada).
--                                                    p_escopo NULO → a empresa legada EXPLÍCITA: é como os corpos ANTIGOS
--                                                    a chamam, e até a contração eles continuam respondendo igual.
--   definir_papel_usuario / definir_status_usuario / definir_vinculos_usuario (p_empresa, …)
--                                                    NOVAS: a membership do alvo NAQUELA empresa; os vínculos só com filial
--                                                    DAQUELA empresa (42501 antes de apagar os de hoje).
--   apagar_usuario / encerrar_sessoes_usuario (p_empresa, p_alvo)
--                                                    NOVAS: agem na CONTA (todas as memberships, todas as sessões) — exigem
--                                                    dev DAQUELA empresa (e_dev_na, que inclui a plataforma: "dev sou só eu",
--                                                    13/11-1) e, se o alvo é membro de OUTRA empresa também, só a plataforma.
--
-- Mensagens e SQLSTATE de antes ficam; as recusas novas têm frase própria (decisão 20), traduzidas em
-- src/lib/supabase/erros-do-banco.ts. A trilha destas cinco continua com a Server Action (registrarEventoAdmin, F67C).
-- Privilégio: as cinco novas como as antigas (EXECUTE só de authenticated); as duas auxiliares, fechadas nos quatro papéis.
-- =============================================================================

set lock_timeout = '2s';

create function public.mesmo_escopo_de_gestao(p_empresa uuid, p_alvo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- F67: o alvo pertence à empresa em que se gere? (qualquer status: desativado também é gerível — reativar é gerir)
  select p_empresa is not null
     and p_alvo is not null
     and exists (select 1 from public.membros m where m.profile_id = p_alvo and m.empresa_id = p_empresa)
$$;

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
     where m.empresa_id = coalesce(p_escopo, public.empresa_legada())
       and m.papel in ('dev', 'admin')
       and m.ativo
       and p.excluido_em is null
       and m.profile_id <> p_excluindo
  )
$$;

create function public.exigir_gestao_de(p_empresa uuid, p_alvo uuid, p_papel_pedido public.papel_usuario)
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

  if p_empresa is null then
    raise exception 'Informe a empresa da operação.' using errcode = '42501';
  end if;

  -- Autoproteção: vale para TODOS os cargos, dev incluído.
  if p_alvo = (select auth.uid()) then
    raise exception 'Você não pode fazer isso com o seu próprio acesso. Peça a outro administrador.'
      using errcode = '42501';
  end if;

  -- O alvo existe? (alguma membership, em qualquer empresa)
  if not exists (select 1 from public.membros m where m.profile_id = p_alvo) then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  -- PERTENCIMENTO antes da patente: o alvo é desta empresa.
  if not public.mesmo_escopo_de_gestao(p_empresa, p_alvo) then
    raise exception 'Este usuário não pertence a esta empresa.' using errcode = '42501';
  end if;

  select m.papel into v_papel_alvo
    from public.membros m
   where m.profile_id = p_alvo
     and m.empresa_id = p_empresa;

  v_toca_dev := (v_papel_alvo = 'dev') or (p_papel_pedido = 'dev');

  if v_toca_dev then
    if not public.e_dev_na(p_empresa) then
      raise exception 'Só um desenvolvedor pode gerir o cargo Desenvolvedor.'
        using errcode = '42501';
    end if;
  else
    if not public.e_admin_na(p_empresa) then
      raise exception 'Esta ação é restrita a administradores.'
        using errcode = '42501';
    end if;
  end if;
end;
$$;

create function public.definir_papel_usuario(p_empresa uuid, p_alvo uuid, p_papel public.papel_usuario)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes public.papel_usuario;
  v_ativo boolean;
begin
  perform public.exigir_gestao_de(p_empresa, p_alvo, p_papel);

  select m.papel, m.ativo into v_antes, v_ativo
    from public.membros m
    join public.profiles p on p.id = m.profile_id
   where m.profile_id = p_alvo
     and m.empresa_id = p_empresa
     and p.excluido_em is null;
  if v_antes is null then
    raise exception 'Usuário não encontrado (ou já apagado).' using errcode = 'P0002';
  end if;
  if v_antes = p_papel then
    return;   -- nada a fazer; não é erro (quem edita só as filiais não deve tropeçar aqui)
  end if;

  -- Rebaixar a última conta de nível administrador DESTA empresa tranca /admin para ela.
  if v_antes in ('dev', 'admin') and v_ativo
     and p_papel not in ('dev', 'admin')
     and not public.existe_outro_admin_ativo(p_alvo, p_empresa) then
    raise exception 'Este é o último administrador ativo do sistema. Promova outra pessoa antes de rebaixar este acesso.'
      using errcode = '42501';
  end if;

  perform set_config('estoque.gestao_usuarios', 'on', true);
  update public.membros set papel = p_papel
   where profile_id = p_alvo and empresa_id = p_empresa;
  perform set_config('estoque.gestao_usuarios', 'off', true);
end;
$$;

create function public.definir_status_usuario(p_empresa uuid, p_alvo uuid, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_papel public.papel_usuario;
  v_antes boolean;
begin
  perform public.exigir_gestao_de(p_empresa, p_alvo, null);

  select m.papel, m.ativo into v_papel, v_antes
    from public.membros m
    join public.profiles p on p.id = m.profile_id
   where m.profile_id = p_alvo
     and m.empresa_id = p_empresa
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
     and not public.existe_outro_admin_ativo(p_alvo, p_empresa) then
    raise exception 'Este é o último administrador ativo do sistema. Promova outra pessoa antes de desativar este acesso.'
      using errcode = '42501';
  end if;

  perform set_config('estoque.gestao_usuarios', 'on', true);
  update public.membros set ativo = p_ativo
   where profile_id = p_alvo and empresa_id = p_empresa;
  perform set_config('estoque.gestao_usuarios', 'off', true);
end;
$$;

create function public.definir_vinculos_usuario(p_empresa uuid, p_alvo uuid, p_filiais smallint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_papel  public.papel_usuario;
  v_membro uuid;
begin
  perform public.exigir_gestao_de(p_empresa, p_alvo, null);

  select m.papel, m.id into v_papel, v_membro
    from public.membros m
    join public.profiles p on p.id = m.profile_id
   where m.profile_id = p_alvo
     and m.empresa_id = p_empresa
     and p.excluido_em is null;
  if v_papel is null then
    raise exception 'Usuário não encontrado (ou já apagado).' using errcode = 'P0002';
  end if;

  -- F67: filial de OUTRA empresa é recusada ANTES de apagar os vínculos de hoje (a FK composta também a recusaria, mas
  -- depois do delete e com um 23503 sem frase). Filial que não existe segue para a FK, como antes.
  if exists (select 1 from unnest(p_filiais) as f
              where public.empresa_da_filial(f) is distinct from p_empresa
                and public.empresa_da_filial(f) is not null) then
    raise exception 'Esta filial pertence a outra empresa.' using errcode = '42501';
  end if;

  perform set_config('estoque.gestao_usuarios', 'on', true);

  delete from public.operador_filiais where membro_id = v_membro;

  -- Para dev/admin/consulta a lista chega vazia (o schema Zod recusa o contrário), e o delete acima LIMPA vínculos de
  -- quem foi promovido/rebaixado. O vínculo é da MEMBERSHIP naquela empresa.
  if p_filiais is not null and array_length(p_filiais, 1) > 0 then
    insert into public.operador_filiais (empresa_id, membro_id, usuario_id, filial_id)
    select p_empresa, v_membro, p_alvo, f
      from unnest(p_filiais) as f
    on conflict (empresa_id, membro_id, filial_id) do nothing;
  end if;

  perform set_config('estoque.gestao_usuarios', 'off', true);
end;
$$;

create function public.apagar_usuario(p_empresa uuid, p_alvo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_papel public.papel_usuario;
begin
  -- Alvo dev exige autor dev (a guarda comum já cobre), e ninguém apaga a si mesmo.
  perform public.exigir_gestao_de(p_empresa, p_alvo, null);

  -- APAGAR é privativo do dev DESTA empresa (ou da plataforma), mesmo quando o alvo NÃO é dev.
  if not public.e_dev_na(p_empresa) then
    raise exception 'Só um desenvolvedor pode apagar uma conta de usuário.'
      using errcode = '42501';
  end if;

  -- A CONTA é de todas as empresas em que a pessoa é membro: apagá-la atinge as outras. Só a plataforma.
  if exists (select 1 from public.membros m where m.profile_id = p_alvo and m.empresa_id <> p_empresa)
     and not public.e_plataforma() then
    raise exception 'Esta conta também pertence a outra empresa: só a plataforma pode agir sobre ela.'
      using errcode = '42501';
  end if;

  select m.papel into v_papel
    from public.membros m
    join public.profiles p on p.id = m.profile_id
   where m.profile_id = p_alvo
     and m.empresa_id = p_empresa
     and p.excluido_em is null;
  if v_papel is null then
    raise exception 'Usuário não encontrado (ou já apagado).' using errcode = 'P0002';
  end if;

  if v_papel in ('dev', 'admin') and not public.existe_outro_admin_ativo(p_alvo, p_empresa) then
    raise exception 'Este é o último administrador ativo do sistema. Promova outra pessoa antes de apagar este acesso.'
      using errcode = '42501';
  end if;

  perform set_config('estoque.gestao_usuarios', 'on', true);

  -- `excluido_em` é da CONTA (profiles); o status é de cada MEMBERSHIP — todas desligadas, em toda empresa: conta apagada
  -- não é membro de nada.
  update public.profiles
     set excluido_em = now()
   where id = p_alvo;
  update public.membros
     set ativo = false
   where profile_id = p_alvo;

  -- Vínculos somem: não há o que auditar num vínculo de conta apagada.
  delete from public.operador_filiais where usuario_id = p_alvo;

  perform set_config('estoque.gestao_usuarios', 'off', true);
end;
$$;

create function public.encerrar_sessoes_usuario(p_empresa uuid, p_alvo uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  perform public.exigir_gestao_de(p_empresa, p_alvo, null);

  if not public.e_dev_na(p_empresa) then
    raise exception 'Só um desenvolvedor pode encerrar as sessões de um usuário.'
      using errcode = '42501';
  end if;

  -- A sessão é da CONTA: encerrá-la atinge as outras empresas da pessoa. Só a plataforma.
  if exists (select 1 from public.membros m where m.profile_id = p_alvo and m.empresa_id <> p_empresa)
     and not public.e_plataforma() then
    raise exception 'Esta conta também pertence a outra empresa: só a plataforma pode agir sobre ela.'
      using errcode = '42501';
  end if;

  delete from auth.sessions where user_id = p_alvo;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.mesmo_escopo_de_gestao(uuid, uuid) is
  'F67 (0189; a F52 a criou no-op): o alvo é membro (qualquer status) da empresa em que se gere? false com argumento nulo. Fechada: só exigir_gestao_de a chama.';
comment on function public.exigir_gestao_de(uuid, uuid, public.papel_usuario) is
  'F67 (0189): guarda comum das RPCs de conta POR EMPRESA. 42501 sem sessão, sem empresa, sobre si mesmo, alvo de OUTRA empresa, alvo dev (ou cargo pedido dev) sem dev NAQUELA empresa, ou sem nível administrador NAQUELA empresa. P0002 se o alvo não tem conta. Fechada.';
comment on function public.existe_outro_admin_ativo(uuid, uuid) is
  'F67 (era F62/F52): sobra outra membership de nível administrador (dev ou admin) ativa, com conta não apagada, NA EMPRESA p_escopo, além da pessoa informada? dev conta. p_escopo NULL = a empresa legada (o chamador antigo, até a contração).';
comment on function public.definir_papel_usuario(uuid, uuid, public.papel_usuario) is
  'F67 (0189): troca o cargo de um usuário NA EMPRESA informada (membros.papel). Pela guarda comum; recusa rebaixar a última conta de nível administrador ativa da empresa.';
comment on function public.definir_status_usuario(uuid, uuid, boolean) is
  'F67 (0189): desativa/reativa a membership de um usuário NA EMPRESA informada. Pela guarda comum; recusa desligar a última conta de nível administrador ativa da empresa.';
comment on function public.definir_vinculos_usuario(uuid, uuid, smallint[]) is
  'F67 (0189): reescreve as filiais de ESCRITA da membership do usuário NA EMPRESA informada; filial de outra empresa → 42501.';
comment on function public.apagar_usuario(uuid, uuid) is
  'F67 (0189): ARQUIVA a conta e desativa TODAS as memberships. Exige dev da empresa informada; se a conta também é de outra empresa, só a plataforma.';
comment on function public.encerrar_sessoes_usuario(uuid, uuid) is
  'F67 (0189): encerra as sessões da CONTA. Exige dev da empresa informada; se a conta também é de outra empresa, só a plataforma.';

revoke all on function public.mesmo_escopo_de_gestao(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.exigir_gestao_de(uuid, uuid, public.papel_usuario) from public, anon, authenticated, service_role;
revoke all on function public.definir_papel_usuario(uuid, uuid, public.papel_usuario) from public, anon, service_role;
revoke all on function public.definir_status_usuario(uuid, uuid, boolean) from public, anon, service_role;
revoke all on function public.definir_vinculos_usuario(uuid, uuid, smallint[]) from public, anon, service_role;
revoke all on function public.apagar_usuario(uuid, uuid) from public, anon, service_role;
revoke all on function public.encerrar_sessoes_usuario(uuid, uuid) from public, anon, service_role;
grant execute on function public.definir_papel_usuario(uuid, uuid, public.papel_usuario) to authenticated;
grant execute on function public.definir_status_usuario(uuid, uuid, boolean) to authenticated;
grant execute on function public.definir_vinculos_usuario(uuid, uuid, smallint[]) to authenticated;
grant execute on function public.apagar_usuario(uuid, uuid) to authenticated;
grant execute on function public.encerrar_sessoes_usuario(uuid, uuid) to authenticated;

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo e contagem) ----------
--   As sete novas com o md5 do prosrc = o do CI; as cinco de conta ANTIGAS e as duas auxiliares antigas byte a byte (o md5
--   do "antes"); existe_outro_admin_ativo com o corpo novo. O conta a conta (--fase f67-depois): exigir_gestao_de nova
--   (com a WAP) aceita e recusa as MESMAS combinações que a antiga, e existe_outro_admin_ativo(p, WAP) = o de antes.
--
-- ROLLBACK (supabase/rollback/F67-desfaz.sql, depois de devolver as 0190–0192 e antes da 0188): derrubar as sete novas
-- (as antigas, intactas, voltam a ser as únicas — se a contração já tiver rodado, o primeiro passo do arquivo as recria) e
-- reemitir existe_outro_admin_ativo com o corpo da 0158. Nenhum dado se perde.
