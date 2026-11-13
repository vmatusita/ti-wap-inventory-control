-- =============================================================================
-- 0185_cargo_por_empresa.sql — F67 (13/11/2026): o cargo POR EMPRESA, com nome próprio
-- =============================================================================
-- classe: ADITIVA (sete funções NOVAS; nenhuma função, policy, tabela ou linha existente muda)
--
-- Até aqui o cargo de cada pessoa só existe na empresa legada (a ponte da F62): `papel_atual()` responde pela
-- membership na WAP, e `pode_escrever_filial()` diz "sim" a dev/admin em QUALQUER filial, de qualquer empresa — o teste
-- de cargo vem antes de qualquer teste de empresa. Esta migration cria as formas POR EMPRESA, com NOME PRÓPRIO: dar
-- parâmetro a `papel_atual()` é impossível sem `cascade` (as policies a citam) ou sem uma sobrecarga ambígua na chamada
-- sem argumento (PG 17, sql-createfunction: "It is not possible to change the name or argument types"). Fato 6 da
-- ordem; docs/PLAN-F67.md, decisão 1.
--
--   papel_na_empresa(p_empresa)        o cargo de quem chama NAQUELA empresa — a FONTE ÚNICA das outras três.
--                                      NULL se p_empresa é NULL, se não há membership ATIVA ali (ou a conta foi
--                                      arquivada). A plataforma (e_plataforma(), decisões 12/11-3 e 13/11-1 do Johnny:
--                                      "dev sou só eu") responde 'dev' em toda empresa que EXISTE.
--   e_admin_na / e_dev_na / pode_escrever_na
--                                      derivam dela, como e_admin/e_dev/pode_escrever derivam de papel_atual() — a
--                                      hierarquia estrita dev ⊃ admin ⊃ operador ⊃ consulta vale POR EMPRESA.
--   pode_escrever_unidade(p_empresa, p_filial)
--                                      a filial é DAQUELA empresa? — ANTES de qualquer cargo (o defeito que a ficha
--                                      nomeia: com o cargo antes, o ramo dev/admin devolve true sem alcançar a pergunta
--                                      de empresa). Nulo → false. O admin NÃO ganha `where f.ativo`: alcança a filial
--                                      desativada, como hoje (o sistema convive com filial desativada que tem saldo).
--   empresa_da_filial(p_filial)         a empresa de uma filial (invoker; lê `filiais`, que não é tabela dos lotes —
--                                      a partição das views da mesa e o corpo novo de pode_escrever_filial a usam).
--   filial_da_empresa(p_empresa, p_filial)
--                                      a filial é da empresa? (invoker, fechada) — a pergunta das destrutivas, do import
--                                      e dos vínculos, sem pôr `empresa_id` em corpo que toca o acervo.
--
-- As cinco de cargo são `security definer` (leem `membros`/`profiles`, cuja leitura passa por policy que as chama — o
-- ciclo 42P17 que a 0070 provou), `stable`, `search_path = ''`, e ganham EXECUTE só de `authenticated` (as policies de
-- `storage` e o TS as chamam): nascem fechadas (RUNBOOK, "security definer — três exigências"). Nada chama nenhuma delas
-- nesta migration: o estado depois dela é repouso válido.
-- =============================================================================

set lock_timeout = '2s';

create function public.papel_na_empresa(p_empresa uuid)
returns public.papel_usuario
language sql
stable
security definer
set search_path = ''
as $$
  -- A EMPRESA ANTES DO CARGO: sem empresa não há cargo; a plataforma só vale numa empresa que existe; e o cargo é o da
  -- membership ATIVA de quem chama NAQUELA empresa, com a conta não arquivada.
  select case
           when p_empresa is null then null::public.papel_usuario
           when public.e_plataforma()
                and exists (select 1 from public.empresas e where e.id = p_empresa) then 'dev'::public.papel_usuario
           else (select m.papel
                   from public.membros m
                   join public.profiles p on p.id = m.profile_id
                  where m.profile_id = (select auth.uid())
                    and m.empresa_id = p_empresa
                    and m.ativo
                    and p.excluido_em is null)
         end
$$;

create function public.e_admin_na(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.papel_na_empresa(p_empresa) in ('dev', 'admin'), false)
$$;

create function public.e_dev_na(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.papel_na_empresa(p_empresa) = 'dev', false)
$$;

create function public.pode_escrever_na(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.papel_na_empresa(p_empresa) in ('dev', 'admin', 'operador'), false)
$$;

create function public.empresa_da_filial(p_filial smallint)
returns uuid
language sql
stable
set search_path = ''
as $$
  select f.empresa_id from public.filiais f where f.id = p_filial
$$;

create function public.filial_da_empresa(p_empresa uuid, p_filial smallint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_empresa is not null
     and p_filial is not null
     and exists (select 1 from public.filiais f where f.id = p_filial and f.empresa_id = p_empresa)
$$;

create function public.pode_escrever_unidade(p_empresa uuid, p_filial smallint)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_papel public.papel_usuario;
begin
  -- Sem empresa ou sem filial não há o que autorizar. Fecha em vez de abrir.
  if p_empresa is null or p_filial is null then
    return false;
  end if;

  -- A EMPRESA ANTES DO CARGO: a filial tem de ser DAQUELA empresa. Sem isto, o admin da A que passasse o id de uma
  -- filial da B seria aprovado pelo ramo de cargo — ele é admin em algum lugar.
  if not public.filial_da_empresa(p_empresa, p_filial) then
    return false;
  end if;

  v_papel := public.papel_na_empresa(p_empresa);

  -- dev/admin escrevem em toda filial DA EMPRESA, inclusive a desativada (sem `where f.ativo`, de propósito).
  if v_papel in ('dev', 'admin') then
    return true;
  end if;

  -- operador: só com vínculo da SUA membership NAQUELA empresa.
  if v_papel = 'operador' then
    return exists (
      select 1
        from public.operador_filiais vf
        join public.membros m on m.id = vf.membro_id and m.empresa_id = vf.empresa_id
       where m.profile_id = (select auth.uid())
         and m.empresa_id = p_empresa
         and vf.filial_id = p_filial
    );
  end if;

  -- consulta, sem membership ativa, conta arquivada, sem sessão.
  return false;
end;
$$;

comment on function public.papel_na_empresa(uuid) is
  'F67 (0185): o cargo de quem chama NA EMPRESA informada — a fonte única de e_admin_na/e_dev_na/pode_escrever_na. NULL com p_empresa NULL, sem membership ATIVA nela ou com a conta arquivada. A plataforma (e_plataforma) responde dev em toda empresa que existe (decisões 12/11-3 e 13/11-1).';
comment on function public.e_admin_na(uuid) is
  'F67 (0185): quem chama administra a empresa informada (dev ou admin nela, ou a plataforma)? false com argumento nulo.';
comment on function public.e_dev_na(uuid) is
  'F67 (0185): quem chama é dev da empresa informada (membro dev ativo dela) OU a plataforma? false com argumento nulo.';
comment on function public.pode_escrever_na(uuid) is
  'F67 (0185): quem chama escreve no nível da empresa informada (dev, admin ou operador nela, ou a plataforma)? false com argumento nulo.';
comment on function public.pode_escrever_unidade(uuid, smallint) is
  'F67 (0185): quem chama escreve na filial informada DA EMPRESA informada? A filial é conferida contra a empresa ANTES do cargo. dev/admin: toda filial da empresa (inclusive desativada); operador: só com vínculo da membership naquela empresa; nulo → false.';
comment on function public.empresa_da_filial(smallint) is
  'F67 (0185): a empresa de uma filial (lê filiais; invoker). A partição das views da mesa e pode_escrever_filial a usam.';
comment on function public.filial_da_empresa(uuid, smallint) is
  'F67 (0185): a filial informada é da empresa informada? false com qualquer argumento nulo. Fechada: só as funções do banco a chamam.';

revoke all on function public.papel_na_empresa(uuid) from public, anon, service_role;
revoke all on function public.e_admin_na(uuid) from public, anon, service_role;
revoke all on function public.e_dev_na(uuid) from public, anon, service_role;
revoke all on function public.pode_escrever_na(uuid) from public, anon, service_role;
revoke all on function public.pode_escrever_unidade(uuid, smallint) from public, anon, service_role;
revoke all on function public.empresa_da_filial(smallint) from public, anon, service_role;
revoke all on function public.filial_da_empresa(uuid, smallint) from public, anon, authenticated, service_role;
grant execute on function public.papel_na_empresa(uuid) to authenticated;
grant execute on function public.e_admin_na(uuid) to authenticated;
grant execute on function public.e_dev_na(uuid) to authenticated;
grant execute on function public.pode_escrever_na(uuid) to authenticated;
grant execute on function public.pode_escrever_unidade(uuid, smallint) to authenticated;
grant execute on function public.empresa_da_filial(smallint) to authenticated;

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   As sete existem, uma assinatura cada; as cinco de cargo com prosecdef = t, provolatile = s, proconfig =
--   {search_path=""}, EXECUTE de authenticated e NÃO de anon nem service_role; empresa_da_filial e filial_da_empresa
--   INVOKER; filial_da_empresa sem EXECUTE para os quatro papéis. O md5 do prosrc de cada uma = o do CI.
--
-- ROLLBACK (supabase/rollback/F67-desfaz.sql, o ÚLTIMO passo — a ordem inversa do apply, 0193 → 0185): derrubar as sete
-- funções criadas aqui, depois que nenhuma outra função, policy ou view as cita mais (os passos anteriores do mesmo
-- arquivo devolvem os consumidores das 0186–0192). Nenhum dado se perde.
