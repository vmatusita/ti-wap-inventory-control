-- =====================================================================================================================
-- 0211_porta_gestao_senhas.sql — F68 (19/11/2026): a porta pública por empresa — a GESTÃO das senhas por empresa
-- =====================================================================================================================
-- classe: ADITIVA (três funções novas; nenhuma linha muda)
--
-- Até a F68, criar, conferir e revogar uma senha de visualização era o client ADMINISTRATIVO (service role) dentro de
-- `src/lib/actions/senhas.ts`, com a guarda `exigirAdmin` como único controle (ADR-002 §4.1) e a senha conferida por
-- scrypt no Node. Agora as três passam pelo banco, POR EMPRESA, com o client de SESSÃO de quem clicou:
--
--   · senha_acesso_criar(p_empresa, p_rotulo, p_senha) → o id. A senha vira bcrypt (extensions.crypt +
--     gen_salt('bf', 10)) — o MESMO custo que `relatorio_publico_abrir` (0212) usa no sal fictício, para as recusas
--     custarem o mesmo. A senha tem de 8 a 72 BYTES (o bcrypt só usa os primeiros 72: acima disso duas senhas diferentes
--     abririam a mesma linha — recusar é a única escolha que prova que isso não acontece). O teto: no máximo 5 senhas
--     ATIVAS bcrypt por empresa (o K da porta — ela confere sempre 5). E a senha repetida NA MESMA empresa é recusada (a
--     nova é conferida contra as ativas dela); duas empresas com a mesma senha em claro coexistem.
--   · senha_acesso_conferir(p_empresa, p_id, p_senha) → 'confere' | 'nao_confere' | 'formato_antigo'. Uma senha scrypt
--     (as de antes da F68) responde 'formato_antigo' sem conferir nada.
--   · senha_acesso_definir_status(p_empresa, p_id, p_ativa) → o rótulo (para a trilha). Só altera a linha cujo
--     empresa_id = p_empresa — a de outra empresa é "não encontrada"; logo a trilha que o app grava com p_empresa é a da
--     empresa DA LINHA. Reativar respeita o teto; revogar ENCERRA as sessões abertas com a senha (reativar não as
--     ressuscita).
--
-- As três: `e_admin_na(p_empresa)` ANTES de qualquer efeito (as três exigências do RUNBOOK; a classe k_escopo_ok de
-- definer_sem_tenant.sql), `security definer` com `search_path = ''`, nomes qualificados, e
-- `revoke all … from public, anon, service_role` + `grant execute … to authenticated`. Nenhuma mensagem leva a senha.
-- =====================================================================================================================

set lock_timeout = '2s';

create function public.senha_acesso_criar(p_empresa uuid, p_rotulo text, p_senha text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  k_custo constant int := 10;
  k_max_ativas constant int := 5;
  v_rotulo text := btrim(coalesce(p_rotulo, ''));
  v_bytes int := octet_length(coalesce(p_senha, ''));
  v_n int;
  v_h text;
  v_r text;
  v_id uuid;
begin
  -- 1) a guarda, ANTES de qualquer efeito: administrador DA EMPRESA informada (dev, admin nela, ou a plataforma)
  if not public.e_admin_na(p_empresa) then
    raise exception 'Só o administrador da empresa gerencia as senhas de acesso dela.' using errcode = '42501';
  end if;
  -- 2) o rótulo e a senha — a senha medida em BYTES (o bcrypt só usa os primeiros 72)
  if char_length(v_rotulo) < 2 or char_length(v_rotulo) > 80 then
    raise exception 'O rótulo da senha de acesso precisa ter de 2 a 80 caracteres.' using errcode = '22023';
  end if;
  if v_bytes < 8 or v_bytes > 72 then
    raise exception 'A senha de acesso precisa ter de 8 a 72 bytes (letra com acento conta 2).' using errcode = '22023';
  end if;
  -- 3) as criações da MESMA empresa em fila (o teto e a repetida conferidos sem corrida)
  perform pg_advisory_xact_lock(hashtext('senha_acesso_teto'), hashtext(p_empresa::text));
  -- 4) o teto: as ativas bcrypt (as que a porta confere)
  select count(*) into v_n
    from public.senhas_acesso s
   where s.empresa_id = p_empresa and s.ativa and s.hash like '$2%';
  if v_n >= k_max_ativas then
    raise exception 'A empresa já tem o máximo de senhas de acesso ativas. Revogue uma antes de criar outra.'
      using errcode = '54000';
  end if;
  -- 5) a repetida NA empresa
  for v_h in
    select s.hash from public.senhas_acesso s
     where s.empresa_id = p_empresa and s.ativa and s.hash like '$2%'
  loop
    v_r := extensions.crypt(p_senha, v_h);
    if v_r = v_h then
      raise exception 'Já existe uma senha de acesso ativa igual a esta na empresa. Escolha outra.' using errcode = '23505';
    end if;
  end loop;
  -- 6) a linha — só o hash bcrypt; a senha em claro não é guardada nem ecoada
  insert into public.senhas_acesso (empresa_id, rotulo, hash, ativa, criado_por)
  values (p_empresa, v_rotulo, extensions.crypt(p_senha, extensions.gen_salt('bf', k_custo)), true, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.senha_acesso_conferir(p_empresa uuid, p_id uuid, p_senha text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_h text;
  v_r text;
begin
  if not public.e_admin_na(p_empresa) then
    raise exception 'Só o administrador da empresa gerencia as senhas de acesso dela.' using errcode = '42501';
  end if;
  select s.hash into v_h
    from public.senhas_acesso s
   where s.empresa_id = p_empresa and s.id = p_id;
  if not found then
    raise exception 'Senha de acesso não encontrada nesta empresa.' using errcode = 'P0002';
  end if;
  -- as senhas de antes da F68 (scrypt): a porta não as abre, e aqui não se confere nada
  if v_h not like '$2%' then
    return 'formato_antigo';
  end if;
  v_r := extensions.crypt(coalesce(p_senha, ''), v_h);
  return case when v_r = v_h then 'confere' else 'nao_confere' end;
end $$;

create function public.senha_acesso_definir_status(p_empresa uuid, p_id uuid, p_ativa boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  k_max_ativas constant int := 5;
  v_hash text;
  v_ativa boolean;
  v_n int;
  v_rotulo text;
begin
  if not public.e_admin_na(p_empresa) then
    raise exception 'Só o administrador da empresa gerencia as senhas de acesso dela.' using errcode = '42501';
  end if;
  if p_ativa is null then
    raise exception 'Informe se a senha de acesso fica ativa ou revogada.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('senha_acesso_teto'), hashtext(p_empresa::text));
  select s.hash, s.ativa into v_hash, v_ativa
    from public.senhas_acesso s
   where s.empresa_id = p_empresa and s.id = p_id
     for update;
  if not found then
    raise exception 'Senha de acesso não encontrada nesta empresa.' using errcode = 'P0002';
  end if;
  -- reativar uma bcrypt respeita o teto da porta
  if p_ativa and not v_ativa and v_hash like '$2%' then
    select count(*) into v_n
      from public.senhas_acesso s
     where s.empresa_id = p_empresa and s.ativa and s.hash like '$2%';
    if v_n >= k_max_ativas then
      raise exception 'A empresa já tem o máximo de senhas de acesso ativas. Revogue uma antes de reativar outra.'
        using errcode = '54000';
    end if;
  end if;
  update public.senhas_acesso s
     set ativa = p_ativa
   where s.empresa_id = p_empresa and s.id = p_id
  returning s.rotulo into v_rotulo;
  -- revogar ENCERRA as sessões abertas com a senha (a porta já as recusa pela senha inativa; encerrá-las faz uma
  -- reativação posterior NÃO ressuscitar o acesso de quem tinha entrado antes da revogação)
  if not p_ativa then
    update public.sessoes_visualizador sv
       set encerrada_em = now()
     where sv.empresa_id = p_empresa and sv.senha_id = p_id and sv.encerrada_em is null;
  end if;
  return v_rotulo;
end $$;

comment on function public.senha_acesso_criar(uuid, text, text) is
  'F68 (0211): cria uma senha de visualização DA EMPRESA informada (bcrypt, custo 10). Guarda: e_admin_na(p_empresa). Senha de 8 a 72 bytes; no máximo 5 ativas bcrypt por empresa; a repetida na mesma empresa é recusada. Devolve o id. A senha em claro não é guardada nem ecoada.';
comment on function public.senha_acesso_conferir(uuid, uuid, text) is
  'F68 (0211): "essa senha ainda é a que eu passei?" — confere | nao_confere | formato_antigo (as scrypt de antes da F68, que a porta não abre). Guarda: e_admin_na(p_empresa); a linha é a da empresa informada.';
comment on function public.senha_acesso_definir_status(uuid, uuid, boolean) is
  'F68 (0211): revoga/reativa uma senha de visualização. Guarda: e_admin_na(p_empresa); só altera a linha cujo empresa_id = p_empresa (a trilha, gravada pelo app com p_empresa, é a da empresa DA LINHA). Reativar respeita o teto de 5; revogar encerra as sessões abertas com ela. Devolve o rótulo.';

revoke all on function public.senha_acesso_criar(uuid, text, text) from public, anon, service_role;
revoke all on function public.senha_acesso_conferir(uuid, uuid, text) from public, anon, service_role;
revoke all on function public.senha_acesso_definir_status(uuid, uuid, boolean) from public, anon, service_role;
grant execute on function public.senha_acesso_criar(uuid, text, text) to authenticated;
grant execute on function public.senha_acesso_conferir(uuid, uuid, text) to authenticated;
grant execute on function public.senha_acesso_definir_status(uuid, uuid, boolean) to authenticated;

notify pgrst, 'reload schema';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   as três existem, security definer, search_path=''; EXECUTE só para authenticated (anon, service_role e PUBLIC sem);
--   o md5 do prosrc de cada uma igual ao do CI.
--
-- ROLLBACK (supabase/rollback/F68-desfaz.sql, o bloco 0211 — depois do 0212; antes do 0210): derrubar as três funções
-- (o app já terá voltado, pelo revert, à gestão anterior).
