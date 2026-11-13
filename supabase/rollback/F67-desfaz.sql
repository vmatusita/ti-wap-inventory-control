-- =============================================================================
-- F67-desfaz.sql — o ROLLBACK da F67 (docs/PLAN-F67.md §6)
-- =============================================================================
-- Desfaz as nove migrations da F67 NA ORDEM INVERSA DO APPLY: 0193 → 0192 → 0191 → 0190 → 0189 → 0188 → 0187 → 0186 →
-- 0185.
--   · (0193) as 21 assinaturas que a contração derrubou (as 20 antigas e `e_dev()`) voltam — o corpo, o comentário e a ACL de ANTES da 0185;
--   · (0192) a trava do termo (o gatilho e as duas funções) sai;
--   · (0191) as duas views da mesa voltam ao texto de antes (sem a partição por empresa nem a coluna `empresa`), com a ACL
--     que tinham guardada antes do drop; as formas por empresa da mesa saem;
--   · (0190) as formas por empresa da Zona destrutiva, da prévia e do import saem;
--   · (0189) as formas por empresa da gestão de contas saem; `existe_outro_admin_ativo` volta ao corpo de antes;
--   · (0188) o piso `papel_atual()` volta a ser o cargo na empresa legada (a ponte);
--   · (0187) as nove policies sem par voltam ao texto de antes;
--   · (0186) os sete consumidores sem par voltam ao corpo de antes;
--   · (0185) as sete formas de cargo por empresa e de unidade saem.
-- NADA AQUI É TRANSCRITO À MÃO: o arquivo é GERADO das migrations (os corpos e os comentários de antes da 0185, byte a
-- byte — o `rollback-f67.test.ts` confere na mesa) e do Postgres na cadeia até a 0184 (a ACL de cada assinatura e o
-- deparse das nove policies). O roteiro `supabase/tests/f67_rollback.sql` é o ensaio no CI: a impressão do esquema depois
-- deste arquivo = a da cadeia até a 0184, medida no CI.
--
-- IDEMPOTENTE NOS DOIS ESTADOS DE PRODUÇÃO: só a expansão (0185–0192) ou a expansão e a contração (0193). `create or
-- replace function` com o corpo de antes é o mesmo comando nos dois (as antigas de reset e da mesa existem na expansão com
-- a chave de advisory por empresa e voltam ao corpo de antes), `drop … if exists` idem, e as views saem e voltam. Rodado
-- duas vezes, dá o mesmo esquema. Nenhuma linha de negócio é escrita: só catálogo (a tabela temporária da ACL das views é
-- da sessão e sai no fim).
--
-- ENTRE FASES: o rollback da F66, o da F65, o da F64, o da F63 e o da F62 EXIGEM este ANTES — as policies e as funções da
-- F67 citam as funções de conjunto e `empresa_legada()` que eles derrubam. Os roteiros `f66_rollback.sql`,
-- `f65_rollback.sql`, `f64_rollback.sql`, `f63_rollback.sql` e `f62_rollback.sql` rodam este arquivo antes dos deles.
-- DEPOIS DE UMA SEGUNDA EMPRESA COM DADO (F73), este rollback devolve a ponte (o cargo de todo mundo volta a ser o da
-- legada): só roda com o dado da segunda empresa fora.
--
-- Sem `begin`/`commit` próprios: quem roda decide a transação (o roteiro roda dentro da dele; num banco vivo, o
-- `execute_sql` do MCP com o conteúdo EXATO deste arquivo, uma transação só). O ledger
-- (`supabase_migrations.schema_migrations`) NÃO é reescrito: as linhas das nove ficam, e a sonda de deriva continua vendo os
-- nomes aplicados. Cada `alter policy` e cada `drop view` toma ACCESS EXCLUSIVE até o fim da transação: `lock_timeout` de
-- 2 s por `set`/`reset` — sem o lock, falha inteiro e se repete (no máximo três vezes em 30 min), nunca espera o app.
-- =============================================================================

set lock_timeout = '2s';

-- =============================================================================
-- 0193 (a contração) — as 21 assinaturas derrubadas (20 antigas e e_dev) de volta, com o corpo, o comentário e a ACL de antes da 0185.
-- Num banco SÓ com a expansão elas existem (as de reset e a mesa com a chave de advisory por empresa): o `create or
-- replace` devolve o corpo de antes também a elas.
-- =============================================================================

-- apagar_usuario(uuid) — o corpo de 0158_cargo_em_membros.sql (o vigente antes da 0185)
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
revoke all on function public.apagar_usuario(uuid) from public, anon, authenticated, service_role;
grant execute on function public.apagar_usuario(uuid) to authenticated;

-- definir_papel_usuario(uuid,papel_usuario) — o corpo de 0158_cargo_em_membros.sql (o vigente antes da 0185)
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
revoke all on function public.definir_papel_usuario(uuid, public.papel_usuario) from public, anon, authenticated, service_role;
grant execute on function public.definir_papel_usuario(uuid, public.papel_usuario) to authenticated;

-- definir_status_usuario(uuid,boolean) — o corpo de 0158_cargo_em_membros.sql (o vigente antes da 0185)
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
revoke all on function public.definir_status_usuario(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.definir_status_usuario(uuid, boolean) to authenticated;

-- definir_vinculos_usuario(uuid,smallint[]) — o corpo de 0158_cargo_em_membros.sql (o vigente antes da 0185)
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
revoke all on function public.definir_vinculos_usuario(uuid, smallint[]) from public, anon, authenticated, service_role;
grant execute on function public.definir_vinculos_usuario(uuid, smallint[]) to authenticated;

-- encerrar_sessoes_usuario(uuid) — o corpo de 0074_rpcs_gestao_usuarios.sql (o vigente antes da 0185)
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
revoke all on function public.encerrar_sessoes_usuario(uuid) from public, anon, authenticated, service_role;
grant execute on function public.encerrar_sessoes_usuario(uuid) to authenticated;

-- exigir_gestao_de(uuid,papel_usuario) — o corpo de 0158_cargo_em_membros.sql (o vigente antes da 0185)
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
revoke all on function public.exigir_gestao_de(uuid, public.papel_usuario) from public, anon, authenticated, service_role;

-- mesmo_escopo_de_gestao(uuid) — o corpo de 0132_guardas_de_escopo.sql (o vigente antes da 0185)
create or replace function public.mesmo_escopo_de_gestao(p_alvo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- F52: com UMA empresa, todo alvo está no mesmo escopo de quem gere.
  -- F65 troca este corpo pelo predicado real (o alvo e o autor na mesma empresa).
  -- O parâmetro é aceito e IGNORADO de propósito — é o que torna a guarda um no-op
  -- verificável em vez de uma promessa em comentário.
  select true
$$;

comment on function public.mesmo_escopo_de_gestao(uuid) is
  'F52: o alvo pertence ao mesmo escopo de gestão de quem chama? Guarda de PERTENCIMENTO das cinco RPCs de conta da 0074, chamada de dentro de exigir_gestao_de. Devolve true hoje (uma empresa): é a fechadura no-op que a F65 preenche trocando SÓ esta função. Fechada nos quatro papéis, como as duas auxiliares irmãs depois da 0078.';
revoke all on function public.mesmo_escopo_de_gestao(uuid) from public, anon, authenticated, service_role;

-- apagar_ativo(uuid,text,text) — o corpo de 0082_dev_apagar.sql (o vigente antes da 0185)
create or replace function public.apagar_ativo(
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
  perform public.exigir_dev_para_destruir(p_justificativa);

  select * into v_a from public.ativos where id = p_ativo;
  if v_a.id is null then
    raise exception 'Ativo não encontrado.' using errcode = 'P0002';
  end if;

  -- CONFIRMAÇÃO DIGITADA. Patrimônio quando existe; service tag quando o ativo não tem
  -- patrimônio (regra da casa: o PAR patrimônio+service tag é a chave, spec §5); e o id
  -- quando não tem nenhum dos dois — que é raro, mas representável.
  v_esperado := coalesce(nullif(btrim(v_a.patrimonio), ''),
                         nullif(btrim(v_a.service_tag), ''),
                         v_a.id::text);
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" para apagar este ativo.', v_esperado
      using errcode = '22023';
  end if;

  -- TERMO DE LOTE que também cobre OUTRO ativo → RECUSA.
  -- Precedente literal: o passo 2 de `importar_ativos_substituir` recusa a substituição
  -- quando um termo mistura a filial alvo com outra. Um termo é documento assinado; destruí-lo
  -- como efeito colateral de apagar UM dos ativos que ele cobre seria destruir prova de
  -- terceiros. Recusa com caminho de saída, como manda o §2.2 da ordem.
  if exists (
    select 1 from public.termos_gerados t
     where p_ativo = any (t.ativo_ids)
       and exists (select 1 from unnest(t.ativo_ids) x(id) where x.id <> p_ativo)
  ) then
    raise exception 'Este ativo está num termo que também cobre outros ativos: apagá-lo destruiria um documento que não é só dele. Apague o termo primeiro, ou apague antes os outros ativos do mesmo termo.'
      using errcode = '42501';
  end if;

  v_rotulo := coalesce(nullif(btrim(v_a.patrimonio), ''), nullif(btrim(v_a.service_tag), ''), v_a.id::text);

  -- BACKUP antes da perda (§1.4). Montado ANTES de qualquer DELETE, obviamente.
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

  -- ---------- a janela abre ----------
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

  -- O ponteiro do substituto (F14/F15) é anulado, não seguido.
  update public.ativos set substitui_ativo_id = null where substitui_ativo_id = p_ativo;
  get diagnostics v_subst = row_count;

  delete from public.ativos where id = p_ativo;

  perform set_config('estoque.dev_destrutivo', 'off', true);
  -- ---------- a janela fecha ----------

  -- TRILHA na mesma transação (ver cabeçalho): sem ela, nada é apagado.
  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values (v_uid, 'ativo_apagado', v_rotulo,
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
  -- A janela fecha TAMBÉM quando estoura no meio (§V da ordem). O rollback ao savepoint do
  -- bloco já reverteria o GUC; o fecho explícito documenta a intenção e não depende disso.
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

comment on function public.apagar_ativo(uuid, text, text) is
  'F23 (/dev): apaga um ativo e TODO o rastro dele — pendências de item, termos (linhas; os .docx a action remove pela API, porque storage.protect_objects_delete recusa DELETE por SQL), anotações e movimentações —, anula os ponteiros substitui_ativo_id que apontavam para ele e libera o par patrimônio+service tag. Exige cargo dev, confirmação digitada (patrimônio, ou service tag, ou id) e justificativa de 10+ caracteres. RECUSA quando o ativo está num termo de lote que também cobre outros ativos. Grava o backup das linhas e a trilha em eventos_admin na MESMA transação. Snapshots de relatorios_gerados NÃO são reescritos: foto congelada é história.';
revoke all on function public.apagar_ativo(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.apagar_ativo(uuid, text, text) to authenticated;

-- apagar_item(smallint,text,text) — o corpo de 0082_dev_apagar.sql (o vigente antes da 0185)
create or replace function public.apagar_item(
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
  perform public.exigir_dev_para_destruir(p_justificativa);

  select * into v_i from public.itens where id = p_item;
  if v_i.id is null then
    raise exception 'Item não encontrado.' using errcode = 'P0002';
  end if;

  -- Confirmação = o NOME do item (§1.3 da ordem). Comparação sem diferenciar maiúsculas,
  -- como o índice único do próprio catálogo (`itens_nome_uidx`, lower(nome)).
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

  -- ---------- a janela abre ----------
  perform set_config('estoque.dev_destrutivo', 'on', true);

  -- Todos os lançamentos do item somem de uma vez — inclusive os que estornam uns aos outros
  -- (`lancamentos_item.estorna_id` é auto-referência): como o conjunto inteiro sai no mesmo
  -- statement, a FK não tem para onde apontar quebrado.
  delete from public.lancamentos_item where item_id = p_item;

  delete from public.itens where id = p_item;

  perform set_config('estoque.dev_destrutivo', 'off', true);
  -- ---------- a janela fecha ----------

  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values (v_uid, 'item_apagado', v_i.nome,
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

comment on function public.apagar_item(smallint, text, text) is
  'F23 (/dev): apaga um item do catálogo COM todos os lançamentos dele — a versão que o cargo admin não tem (excluirItem recusa quando há lançamento). O saldo some por construção: ele é derivado da soma dos lançamentos, não materializado. Não toca pendencias_item (o campo `item` de lá é texto livre, não FK) nem kits (o payload deles traz categorias de ativo, não itens). Exige cargo dev, o nome do item digitado e justificativa de 10+ caracteres.';
revoke all on function public.apagar_item(smallint, text, text) from public, anon, authenticated, service_role;
grant execute on function public.apagar_item(smallint, text, text) to authenticated;

-- apagar_movimentacao(uuid,text,text) — o corpo de 0090_guarda_furos_revisao.sql (o vigente antes da 0185)
create or replace function public.apagar_movimentacao(
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
  perform public.exigir_dev_para_destruir(p_justificativa);

  select * into v_m from public.movimentacoes where id = p_mov;
  if v_m.id is null then
    raise exception 'Movimentação não encontrada.' using errcode = 'P0002';
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

  -- ESTORNO → RECUSA (0090). Ver o cabeçalho: o estorno APAGA pendências de item ao acontecer,
  -- e apagá-lo não as traz de volta — o ativo voltaria a um estado que a fila de pendências
  -- não reflete.
  if v_m.tipo = 'estorno' then
    raise exception 'Esta é uma movimentação de ESTORNO, e apagá-la não devolve as pendências de item que o estorno removeu — o ativo voltaria a um estado que a fila de pendências não reflete. Use "Forçar estado" para acertar o ativo mantendo o histórico.'
      using errcode = '42501';
  end if;

  -- EMPATE DE created_at → RECUSA (0087).
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

  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values (v_uid, 'movimentacao_apagada', v_esperado,
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

comment on function public.apagar_movimentacao(uuid, text, text) is
  'F23 (/dev): apaga UMA movimentação — só a última do ativo, por (created_at, id). RECUSA: movimentação de tipo ESTORNO (apagá-la não devolve as pendências de item que o estorno removeu — 0090); ativo com movimentações no MESMO instante, onde "a última" seria sorteio de uuid (0087); não é a última; é a única do ativo; sem snapshot_anterior; e citada por um termo. Recompõe o ativo a partir de snapshot_anterior exatamente como o estorno faz.';
revoke all on function public.apagar_movimentacao(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.apagar_movimentacao(uuid, text, text) to authenticated;

-- forcar_estado_ativo(uuid,status_ativo,text) — o corpo de 0110_detentor_por_estado.sql (o vigente antes da 0185)
create or replace function public.forcar_estado_ativo(
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
  perform public.exigir_dev_para_destruir(p_justificativa);

  select * into v_a from public.ativos where id = p_ativo for update;
  if v_a.id is null then
    raise exception 'Ativo não encontrado.' using errcode = 'P0002';
  end if;

  v_antes  := v_a.status;
  v_rotulo := coalesce(nullif(btrim(v_a.patrimonio), ''), nullif(btrim(v_a.service_tag), ''), v_a.id::text);

  -- Já está lá: não é erro, e registrar uma correção que não corrige nada só sujaria a linha
  -- do tempo. Mesmo idioma de definir_papel_usuario (0074), que retorna quando nada muda.
  if v_antes = p_status then
    return jsonb_build_object(
      'alterado', false, 'ativo_id', p_ativo, 'rotulo', v_rotulo, 'status', v_antes);
  end if;

  -- ---------- a janela abre ----------
  -- Necessária por causa da MARCA: a guarda da 0081 recusa INSERT com forcado = true fora
  -- do caminho oficial. (Os dois triggers são BEFORE INSERT FOR EACH ROW e disparam em ordem
  -- alfabética: movimentacoes_guarda_acervo antes de trg_aplicar_movimentacao — a guarda
  -- decide primeiro, que é a ordem desejada.)
  perform set_config('estoque.dev_destrutivo', 'on', true);

  insert into public.movimentacoes (
    ativo_id, tipo, motivo, data, filial_id,
    status_resultante, observacao, criado_por, forcado
  ) values (
    p_ativo, 'ajuste', null, current_date, v_a.filial_id,
    p_status, btrim(p_justificativa), v_uid, true
  )
  returning id into v_mov_id;

  -- Espelha o zeramento de detentor do trigger (F36/0110): a pergunta é ao ESTADO, não
  -- mais a uma lista de estados escrita à mão que esquecia o `defasado`.
  if not public.status_tem_detentor(p_status) then
    update public.ativos
       set colaborador_atual = null,
           setor_atual       = null,
           updated_at        = now()
     where id = p_ativo;
  end if;

  perform set_config('estoque.dev_destrutivo', 'off', true);
  -- ---------- a janela fecha ----------

  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values (v_uid, 'estado_forcado', v_rotulo,
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

comment on function public.forcar_estado_ativo(uuid, public.status_ativo, text) is
  'F23 (/dev): leva um ativo a QUALQUER status do enum, ignorando as transições válidas — registrando uma movimentação de tipo `ajuste` marcada `forcado`, com a justificativa em `observacao`. O status segue DERIVADO pelo trigger; a ficha e o as-of continuam lendo a linha do tempo, e o histórico explica o estado. Não é contada por rel_resumo/rel_mov_por_mes/rel_por_motivo, que só olham saida e devolucao. Zera colaborador/setor quando o estado alvo é um em que ninguém está com o equipamento (em_estoque, em_triagem, em_manutencao, descartado, devolvido_fornecedor), espelhando o que a máquina faz no caminho normal. Exige cargo dev e justificativa de 10+ caracteres.';
revoke all on function public.forcar_estado_ativo(uuid, public.status_ativo, text) from public, anon, authenticated, service_role;
grant execute on function public.forcar_estado_ativo(uuid, public.status_ativo, text) to authenticated;

-- forcar_saldo_item(smallint,smallint,integer,text) — o corpo de 0084_dev_forcar.sql (o vigente antes da 0185)
create or replace function public.forcar_saldo_item(
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
  perform public.exigir_dev_para_destruir(p_justificativa);

  select i.nome into v_nome from public.itens i where i.id = p_item;
  if v_nome is null then
    raise exception 'Item não encontrado.' using errcode = 'P0002';
  end if;

  select f.nome into v_filial from public.filiais f where f.id = p_filial;
  if v_filial is null then
    raise exception 'Filial não encontrada.' using errcode = 'P0002';
  end if;

  if p_saldo_alvo is null or p_saldo_alvo < 0 then
    raise exception 'O saldo alvo precisa ser zero ou maior.' using errcode = '22023';
  end if;

  -- Total atual = a MESMA expressão de rel_saldo_itens (entrada + ajuste).
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

  -- ---------- a janela abre ----------
  perform set_config('estoque.dev_destrutivo', 'on', true);

  insert into public.lancamentos_item (
    item_id, filial_id, tipo, quantidade, data, observacao, criado_por, forcado
  ) values (
    p_item, p_filial, 'ajuste', v_delta, current_date, btrim(p_justificativa), v_uid, true
  )
  returning id into v_lanc;

  perform set_config('estoque.dev_destrutivo', 'off', true);
  -- ---------- a janela fecha ----------

  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values (v_uid, 'saldo_forcado', v_nome || ' — ' || v_filial,
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

comment on function public.forcar_saldo_item(smallint, smallint, integer, text) is
  'F23 (/dev): leva o TOTAL de um item numa filial a um valor alvo GRAVANDO o lançamento de ajuste com o delta — o saldo continua 100% derivado da soma dos lançamentos, e esta fase não escreve saldo à mão em lugar nenhum. O lançamento nasce marcado `forcado`, com a justificativa em `observacao`. Pode ser RECUSADO pelo trigger valida_lancamento_item quando o alvo é menor do que já está reservado/liberado — nesse caso a incoerência é o pedido, não o sistema. Exige cargo dev e justificativa de 10+ caracteres.';
revoke all on function public.forcar_saldo_item(smallint, smallint, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.forcar_saldo_item(smallint, smallint, integer, text) to authenticated;

-- previa_reset(text,smallint) — o corpo de 0086_dev_previa_reset.sql (o vigente antes da 0185)
create or replace function public.previa_reset(p_bloco text, p_filial smallint)
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
  -- Mesma guarda das ferramentas: só o dev enxerga a prévia. A justificativa é irrelevante
  -- para uma leitura, mas a guarda é uma função só — passa-se um texto fixo que a satisfaz,
  -- em vez de duplicar a checagem de cargo com outra régua.
  perform public.exigir_dev_para_destruir('previa somente leitura');

  if p_bloco not in ('acervo', 'itens') then
    raise exception 'Bloco inválido: use acervo ou itens.' using errcode = '22023';
  end if;

  if p_filial is not null and not exists (select 1 from public.filiais f where f.id = p_filial) then
    raise exception 'Filial não encontrada.' using errcode = 'P0002';
  end if;

  if p_bloco = 'acervo' then
    -- ⚠ ESPELHO EXATO do bloco de contagens de `resetar_acervo` (0083). Qualquer divergência
    -- aqui vira recusa 40001 no apply.
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

    -- O bloqueio que a tela precisa ANTECIPAR: termo de lote misturando filiais faz o reset
    -- recusar. Melhor dizer isso ANTES de a pessoa gerar backup e digitar a confirmação.
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
    -- ⚠ ESPELHO EXATO do bloco de contagens de `resetar_itens` (0083).
    select count(*)::int into v_lanc from public.lancamentos_item l
     where p_filial is null or l.filial_id = p_filial;
  end if;

  return jsonb_build_object(
    'bloco',    p_bloco,
    'filial_id', p_filial,
    'rotulo',   public.rotulo_alcance_reset(p_filial),
    'termo_misto_bloqueia', v_misto,
    -- `contagens` sai no formato EXATO que as RPCs de reset esperam em `p_contagens`: a tela
    -- devolve este objeto sem mexer, e assim não há como a serialização introduzir divergência.
    'contagens', case
      when p_bloco = 'acervo' then jsonb_build_object(
        'ativos', v_ativos, 'movimentacoes', v_movs, 'anotacoes', v_anot,
        'pendencias_item', v_pend, 'termos', v_termos)
      else jsonb_build_object('lancamentos', v_lanc)
    end);
end;
$$;

comment on function public.previa_reset(text, smallint) is
  'F23 (/dev): conta o recorte de um reset (bloco acervo ou itens; uma filial ou global) usando as MESMAS expressões de resetar_acervo/resetar_itens, e devolve o objeto `contagens` já no formato que elas exigem em p_contagens. Existe porque a guarda TOCTOU dessas RPCs recusa contagens que não batam: uma prévia calculada por outro caminho tornaria o reset inaplicável. Só-leitura, restrita ao cargo dev. Também avisa se um termo de lote entre filiais vai bloquear o reset.';
revoke all on function public.previa_reset(text, smallint) from public, anon, authenticated, service_role;
grant execute on function public.previa_reset(text, smallint) to authenticated;

-- resetar_acervo(smallint,text,text,text,jsonb) — o corpo de 0089_reset_backup_do_recorte.sql (o vigente antes da 0185)
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
revoke all on function public.resetar_acervo(smallint, text, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.resetar_acervo(smallint, text, text, text, jsonb) to authenticated;

-- resetar_itens(smallint,text,text,text,jsonb) — o corpo de 0089_reset_backup_do_recorte.sql (o vigente antes da 0185)
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
revoke all on function public.resetar_itens(smallint, text, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.resetar_itens(smallint, text, text, text, jsonb) to authenticated;

-- exigir_dev_para_destruir(text) — o corpo de 0082_dev_apagar.sql (o vigente antes da 0185)
create or replace function public.exigir_dev_para_destruir(p_justificativa text)
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

  if not public.e_dev() then
    raise exception 'Esta operação é restrita ao cargo Desenvolvedor.' using errcode = '42501';
  end if;

  -- A justificativa é o que sobra depois que o dado morre. Vazia, ela não é justificativa.
  if coalesce(length(btrim(p_justificativa)), 0) < 10 then
    raise exception 'A justificativa é obrigatória e precisa ter pelo menos 10 caracteres.'
      using errcode = '22023';
  end if;
end;
$$;

comment on function public.exigir_dev_para_destruir(text) is
  'F23: guarda comum das ferramentas destrutivas da /dev. Levanta 42501 se não há sessão ou se o autor não é do cargo dev; 22023 se a justificativa tem menos de 10 caracteres. É a TRAVA — a guarda `exigirDev` da Server Action é só a mensagem em pt-BR.';
revoke all on function public.exigir_dev_para_destruir(text) from public, anon, authenticated, service_role;

-- rotulo_alcance_reset(smallint) — o corpo de 0083_dev_resetar.sql (o vigente antes da 0185)
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
revoke all on function public.rotulo_alcance_reset(smallint) from public, anon, authenticated, service_role;

-- apagar_ativos_conflito_filiais(uuid[],text,text,text) — o corpo de 0132_guardas_de_escopo.sql (o vigente antes da 0185)
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

  -- ---------- F52: OS ATIVOS SÃO DA SUA ORGANIZAÇÃO? ----------
  -- A POSIÇÃO é a decisão 4 da fase, e ela é ditada pelos locks:
  --   · DEPOIS do `pg_advisory_xact_lock` e DEPOIS da etapa (3) — obrigatório, porque a
  --     guarda faz LEITURA PRÓPRIA de `public.ativos`. Ler linha ainda não travada é
  --     exatamente a porta de TOCTOU que a 0098 fechou e a 0100 serializou.
  --   · ANTES da revalidação do grupo, porque pertencimento é uma recusa mais fundamental
  --     que "não está mais em conflito": um ativo de outra organização deve responder que
  --     não é seu, e não que saiu do conflito.
  --   · FORA da janela `estoque.dev_destrutivo`, que só abre bem mais abaixo — a guarda
  --     não tem efeito a desarmar, e a janela continua com exatamente as portas que tinha.
  -- Ela é EXTRAÍDA, e não inline, porque esta RPC é recriada em cadeia (0093 → 0098 → 0100
  -- → 0132) e guarda inline se perde na recriação seguinte — o mecanismo causal que a F51
  -- documentou. Com uma empresa só, ela não levanta nunca.
  perform public.exigir_ativos_da_empresa(v_ids);

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
revoke all on function public.apagar_ativos_conflito_filiais(uuid[], text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.apagar_ativos_conflito_filiais(uuid[], text, text, text) to authenticated;

-- exigir_ativos_da_empresa(uuid[]) — o corpo de 0132_guardas_de_escopo.sql (o vigente antes da 0185)
create or replace function public.exigir_ativos_da_empresa(p_ids uuid[])
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- F52: com UMA empresa, todo ativo é da empresa de quem chama, e esta função é inerte.
  -- F65 troca este corpo pelo predicado real e levanta 42501 quando algum id de p_ids
  -- estiver fora do escopo do autor.
  --
  -- ⚠ QUANDO ELA GANHAR CORPO, A LEITURA DE `public.ativos` TEM DE CONTINUAR ACONTECENDO
  -- DEPOIS DA ETAPA (3) DO LOCK da mesa — ler linha ainda não travada é a porta de TOCTOU
  -- que a 0098 fechou e a 0100 serializou por advisory lock. A chamada já está no lugar
  -- certo; quem mexer no corpo não precisa mexer na posição.
  perform 1 where p_ids is not null;
end;
$$;

comment on function public.exigir_ativos_da_empresa(uuid[]) is
  'F52: todos os ativos informados pertencem à organização de quem chama? Guarda de PERTENCIMENTO da mesa de conflitos entre filiais, chamada por apagar_ativos_conflito_filiais depois da etapa (3) do lock. Não levanta hoje (uma empresa): é a fechadura no-op que a F65 preenche trocando SÓ esta função. Fechada nos quatro papéis.';
revoke all on function public.exigir_ativos_da_empresa(uuid[]) from public, anon, authenticated, service_role;

-- importar_ativos_substituir(jsonb,text,jsonb,jsonb) — o corpo de 0140_import_desarma_fk.sql (o vigente antes da 0185)
create or replace function public.importar_ativos_substituir(
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

  -- ---------- 0b. GUARDA DE CARGO (F21, migration 0064) ----------
  -- Esta funcao e SECURITY DEFINER: roda como o dono e PASSA POR FORA de toda policy de
  -- RLS. As policies da 0063 nao a alcancam, logo a autorizacao TEM de ser interna.
  -- Sem esta guarda, qualquer logado (inclusive o cargo `consulta`) poderia chamar
  -- /rest/v1/rpc/importar_ativos_substituir com a anon key + o proprio JWT e apagar o
  -- acervo inteiro de uma filial — a operacao mais destrutiva do sistema.
  -- 42501 = insufficient_privilege, o SQLSTATE semanticamente correto (o default de um
  -- `raise` de plpgsql seria P0001). A traducao para pt-BR na UI vem do ramo novo de
  -- permissao em src/lib/actions/erros.ts, que a F21 acrescenta e que casa por code E
  -- por substring da mensagem — sem ele, esta excecao cairia no fallback generico.
  --
  -- F51: ela CONTINUA AQUI, antes de qualquer auxiliar. Movê-la para dentro de uma
  -- delas mudaria a ordem em que a recusa acontece.
  if not public.e_admin() then
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

  -- ---------- 1a-bis. F52: A FILIAL É SUA? ----------
  -- Em CONJUNÇÃO com o `e_admin()` do bloco 0b — nunca no lugar dele. As duas perguntas
  -- são diferentes: `e_admin()` pergunta "você tem patente?", esta pergunta "esta filial
  -- é sua?". Hoje `pode_escrever_filial` devolve `true` para todo `dev`/`admin` em
  -- QUALQUER filial (0064), e como o bloco 0b já exigiu nível administrador, esta condição
  -- é INERTE — nenhum import legítimo de hoje passa a ser recusado.
  --
  -- ⚠ NÃO "simplifique" isto por parecer redundante. Ela é a única das RPCs destrutivas
  -- que ficou de fora da varredura da 0064, recebe a filial do PAYLOAD e faz
  -- `delete from public.ativos where filial_id = v_filial` sem teto, dentro da janela que
  -- desarma a `guarda_acervo`. Quando o cargo deixar de valer em toda filial, é esta
  -- linha — e não o `e_admin()` — que impede o import de apagar o acervo do vizinho.
  --
  -- A POSIÇÃO importa: depois da resolução da filial (`v_filial` já é não-nulo e a filial
  -- já foi provada existente e ativa — `pode_escrever_filial(null)` devolveria `false`) e
  -- ANTES do advisory lock, para recusar sem tomar trava.
  if not public.pode_escrever_filial(v_filial) then
    raise exception 'Você não tem permissão de escrita na filial % — o import foi recusado.', v_filial
      using errcode = '42501';
  end if;

  -- F51: o advisory lock sobe para a orquestradora pela MESMA régua da janela
  -- destrutiva — efeito local à transação, declarado à vista na função que
  -- orquestra. A POSIÇÃO não muda: resolve a filial, trava, e só então valida.
  perform pg_advisory_xact_lock(hashtext('import_substituir'), v_filial::int);

  -- ---------- 1b→2. tudo o que se recusa antes de escrever ----------
  v_total_plano := public.import_validar_plano(p_plano, p_backup_path, p_correcoes, v_filial);

  -- ---------- 2b. a janela TOCTOU ----------
  perform public.import_revalidar_contagens(p_contagens, v_filial);

  -- ---------- 3. DELETE ordenado (só desta filial) ----------
  -- F23: ABRE a janela da guarda do acervo (0081) para os quatro DELETEs de
  -- `import_apagar_acervo_filial` — e só para eles. Sem esta linha, o trigger
  -- `guarda_acervo` recusaria o import inteiro.
  --
  -- F51: a janela fica AQUI, e não dentro da auxiliar. Existem exatamente DUAS
  -- portas que a abrem (a Zona destrutiva e o import); uma terceira aumentaria a
  -- superfície que `dev_destrutivo.sql` e `seguranca_catalogo.sql` vigiam.
  perform set_config('estoque.dev_destrutivo', 'on', true);
  v_apagado := public.import_apagar_acervo_filial(v_filial);
  -- F23: FECHA a janela imediatamente. `set_config(..., true)` é local à TRANSAÇÃO, não
  -- à chamada: sem este fecho, os INSERTs do passo 4 — e qualquer statement seguinte da
  -- mesma transação — correriam com a guarda desligada. Lição medida na F22 (0073).
  perform set_config('estoque.dev_destrutivo', 'off', true);

  v_movs_apagadas   := (v_apagado->>'movs_apagadas')::int;
  v_anot_apagadas   := (v_apagado->>'anotacoes_apagadas')::int;
  v_termos_apagados := (v_apagado->>'termos_apagados')::int;
  select coalesce(array_agg(t), '{}'::text[]) into v_arquivos_termos
    from jsonb_array_elements_text(v_apagado->'arquivos_termos') t;

  -- 0140 (F56 · Frente F) — as três contagens PÓS-operação que o backup versão 2
  -- e a tela do "o que foi apagado" passam a mostrar. `.default(0)` no Zod do
  -- lado TypeScript é quem protege o código velho que ainda não as lê.
  v_pend_apagadas  := coalesce((v_apagado->>'pendencias_apagadas')::int, 0);
  v_lanc_desvinc   := coalesce((v_apagado->>'lancamentos_desvinculados')::int, 0);
  v_subst_anulados := coalesce((v_apagado->>'ponteiros_anulados')::int, 0);

  -- ---------- 4. INSERT por ativo do plano ----------
  -- F51 (Decisão 2): o LAÇO fica aqui e as duas auxiliares são chamadas POR ATIVO.
  -- Duas passagens completas mudariam a ordem física das escritas, e quem depende
  -- dela é o trigger `trg_aplicar_movimentacao`, que deriva o estado linha a linha.
  -- Assim a equivalência é por construção, não por argumento.
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

  -- ---------- 5e. (F24) conflitos abertos por este import ----------
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

comment on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) is
  'F21/F51/F52/F56 — a RPC do "Substituir tudo": orquestradora fina sobre oito auxiliares. Desde a 0140 (Frente F), o retorno ganha pendencias_apagadas/lancamentos_desvinculados/ponteiros_anulados, lidos do retorno de import_apagar_acervo_filial. EXECUTE só para authenticated.';
revoke all on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) to authenticated;

-- e_dev() — o corpo de 0072_papel_dev_funcoes.sql (o vigente antes da 0185)
create or replace function public.e_dev()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.papel_atual() = 'dev', false)
$$;

comment on function public.e_dev() is
  'F22: true se o usuário logado tem o cargo DEV e está ativo. É a guarda do que só o dev faz: conceder/revogar o próprio cargo dev, agir sobre uma conta dev, trocar e-mail, apagar usuário, encerrar sessões e a área /dev. NÃO confundir com e_admin(), que desde a F22 significa "nível administrador" (admin OU dev).';
revoke all on function public.e_dev() from public, anon, authenticated, service_role;
grant execute on function public.e_dev() to authenticated;

-- =============================================================================
-- 0192 — a trava do termo sai
-- =============================================================================
drop trigger if exists termo_exige_modelo_da_empresa on public.termos_gerados;
drop function if exists public.empresas_com_modelo_de_termo();
drop function if exists public.termo_exige_modelo_da_empresa();

-- =============================================================================
-- 0191 — as duas views da mesa de volta ao texto de antes (sem a partição por empresa e sem a coluna `empresa`).
-- `create or replace view` não tira coluna: a de grupos (que lê a outra) sai primeiro e volta por último. A ACL de cada
-- uma é guardada ANTES do drop e devolvida depois, grantee a grantee — vale para o CI (sem default privileges) e para os
-- bancos vivos (com as do Supabase). As formas por empresa da mesa saem; a antiga já voltou acima.
-- =============================================================================
create temp table f67_desfaz_acl_views as
  select c.relname::text as nome, c.relacl
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relname in ('v_conflitos_filiais', 'v_conflitos_filiais_grupos');

drop view public.v_conflitos_filiais_grupos;
drop view public.v_conflitos_filiais;

-- v_conflitos_filiais — o texto da 0134
create view public.v_conflitos_filiais
with (security_invoker = true) as
with ident as (
  select
    a.id,
    a.filial_id,
    public.chave_identidade_ativo(a.patrimonio, a.service_tag) as chave
  from public.ativos a
),
grupos as (
  select i.chave
    from ident i
   where i.chave is not null
   group by i.chave
  having count(distinct i.filial_id) > 1
)
select
  i.chave,
  a.id                                   as ativo_id,
  a.patrimonio,
  a.patrimonio_original,
  a.service_tag,
  a.filial_id,
  f.slug                                 as filial,
  f.nome                                 as filial_nome,
  a.status,
  a.categoria,
  a.marca,
  a.modelo,
  a.hostname,
  a.colaborador_atual,
  a.setor_atual,
  a.origem,
  a.pendencia,
  a.created_at,
  a.updated_at,
  coalesce(h.movimentacoes, 0)           as movimentacoes,
  coalesce(h.movimentacoes_reais, 0)     as movimentacoes_reais,
  h.ultima_mov_data,
  h.ultima_mov_tipo,
  coalesce(t.termos, 0)                  as termos,
  (coalesce(h.movimentacoes_reais, 0) > 0 or coalesce(t.termos, 0) > 0) as tem_historico_real,
  h.entrada_em
from ident i
join grupos g   on g.chave = i.chave
join public.ativos a on a.id = i.id
join public.filiais f on f.id = a.filial_id
left join lateral (
  select
    count(*)::int                                                        as movimentacoes,
    count(*) filter (where not public.mov_da_carga_import(m.observacao))::int
                                                                         as movimentacoes_reais,
    max(m.data)                                                          as ultima_mov_data,
    min(m.data)                                                          as entrada_em,
    (select m2.tipo::text
       from public.movimentacoes m2
      where m2.ativo_id = a.id
      order by m2.data desc, m2.created_at desc, m2.ordem desc
      limit 1)                                                           as ultima_mov_tipo
  from public.movimentacoes m
  where m.ativo_id = a.id
) h on true
left join lateral (
  select count(*)::int as termos
    from public.termos_gerados tg
   where a.id = any (tg.ativo_ids)
) t on true;

comment on view public.v_conflitos_filiais is
  'F24: ativos cuja identidade (chave_identidade_ativo) existe em MAIS DE UMA filial — o estado "em conflito", DERIVADO, nunca gravado. Uma linha por ativo do grupo (2+; três filiais é raro mas representável). Traz o resumo de histórico do lado, a data de entrada (primeira movimentação) e o selo tem_historico_real que o diálogo de exclusão reusa. security_invoker. Some sozinha quando o grupo se desfaz (apagou um lado, corrigiu a chave, transferiu).';

-- v_conflitos_filiais_grupos — o texto da 0092
create view public.v_conflitos_filiais_grupos
with (security_invoker = true) as
select
  c.chave,
  count(*)::int                              as ativos,
  count(distinct c.filial_id)::int           as filiais,
  min(c.patrimonio)                          as patrimonio,
  min(c.service_tag)                         as service_tag,
  coalesce(min(c.patrimonio), min(c.service_tag), min(c.ativo_id::text)) as rotulo,
  string_agg(distinct c.filial_nome, ' · ' order by c.filial_nome) as filiais_nomes,
  bool_or(c.tem_historico_real)              as algum_com_historico_real,
  max(c.updated_at)                          as visto_em
from public.v_conflitos_filiais c
group by c.chave;

comment on view public.v_conflitos_filiais_grupos is
  'F24: um GRUPO de conflito por linha (agregado de v_conflitos_filiais). É por esta view que a mesa de /pendencias pagina — paginar sobre os ATIVOS cortaria um grupo entre duas páginas, e o sentido da mesa é ver os lados juntos. rotulo = patrimônio, ou service tag quando não há patrimônio. security_invoker.';

do $acl$
declare
  r record;
begin
  for r in
    select g.nome, a.grantee, a.privilege_type, a.is_grantable
      from f67_desfaz_acl_views g, aclexplode(g.relacl) a
     where g.relacl is not null
       and a.grantee <> (select c.relowner from pg_class c where c.oid = ('public.' || g.nome)::regclass)
  loop
    execute format('grant %s on public.%I to %s%s', r.privilege_type, r.nome,
                   case when r.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(r.grantee)) end,
                   case when r.is_grantable then ' with grant option' else '' end);
  end loop;
end
$acl$;

drop table f67_desfaz_acl_views;

drop function if exists public.exigir_ativos_da_empresa(uuid, uuid[]);
drop function if exists public.apagar_ativos_conflito_filiais(uuid, uuid[], text, text, text);

-- =============================================================================
-- 0190 — as formas por empresa da Zona destrutiva, da prévia e do import saem (as antigas já voltaram acima)
-- =============================================================================
drop function if exists public.exigir_dev_para_destruir(uuid, text);
drop function if exists public.rotulo_alcance_reset(uuid, smallint, text);
drop function if exists public.previa_reset(uuid, text, smallint);
drop function if exists public.resetar_acervo(uuid, smallint, text, text, text, jsonb);
drop function if exists public.resetar_itens(uuid, smallint, text, text, text, jsonb);
drop function if exists public.apagar_ativo(uuid, uuid, text, text);
drop function if exists public.apagar_item(uuid, smallint, text, text);
drop function if exists public.apagar_movimentacao(uuid, uuid, text, text);
drop function if exists public.forcar_estado_ativo(uuid, uuid, public.status_ativo, text);
drop function if exists public.forcar_saldo_item(uuid, smallint, smallint, integer, text);
drop function if exists public.importar_ativos_substituir(uuid, jsonb, text, jsonb, jsonb);

-- =============================================================================
-- 0189 — as formas por empresa da gestão de contas saem; existe_outro_admin_ativo volta ao corpo de antes
-- =============================================================================
drop function if exists public.mesmo_escopo_de_gestao(uuid, uuid);
drop function if exists public.exigir_gestao_de(uuid, uuid, public.papel_usuario);
drop function if exists public.definir_papel_usuario(uuid, uuid, public.papel_usuario);
drop function if exists public.definir_status_usuario(uuid, uuid, boolean);
drop function if exists public.definir_vinculos_usuario(uuid, uuid, smallint[]);
drop function if exists public.apagar_usuario(uuid, uuid);
drop function if exists public.encerrar_sessoes_usuario(uuid, uuid);

-- existe_outro_admin_ativo(uuid,uuid) — o corpo de 0158_cargo_em_membros.sql (o vigente antes da 0185)
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
revoke all on function public.existe_outro_admin_ativo(uuid, uuid) from public, anon, authenticated, service_role;

-- =============================================================================
-- 0188 — o piso volta a ser o cargo na empresa legada (a ponte)
-- =============================================================================
-- papel_atual() — o corpo de 0158_cargo_em_membros.sql (o vigente antes da 0185)
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
revoke all on function public.papel_atual() from public, anon, authenticated, service_role;
grant execute on function public.papel_atual() to authenticated;

-- =============================================================================
-- 0187 — as nove policies sem par de volta ao texto de antes da 0185 (o replay de scripts/db/predicado-policies.mjs)
-- =============================================================================
-- (o texto de 0066_papeis_storage.sql)
alter policy "backups-import apaga operador" on storage.objects
  using (bucket_id = 'backups-import' and (select public.e_admin()));

-- (o texto de 0066_papeis_storage.sql)
alter policy "backups-import atualiza operador" on storage.objects
  using (bucket_id = 'backups-import' and (select public.e_admin()))
  with check (bucket_id = 'backups-import' and (select public.e_admin()));

-- (o texto de 0066_papeis_storage.sql)
alter policy "backups-import insere operador" on storage.objects
  with check (bucket_id = 'backups-import' and (select public.e_admin()));

-- (o texto de 0066_papeis_storage.sql)
alter policy "backups-import leitura operador" on storage.objects
  using (bucket_id = 'backups-import' and (select public.e_admin()));

-- (o texto de 0072_papel_dev_funcoes.sql)
alter policy "termos apaga operador" on storage.objects
  using (bucket_id = 'termos'
    and (select public.pode_escrever())
    and public.pode_escrever_arquivo_termo(name));

-- (o texto de 0072_papel_dev_funcoes.sql)
alter policy "termos atualiza operador" on storage.objects
  using (bucket_id = 'termos'
    and (select public.pode_escrever())
    and public.pode_escrever_arquivo_termo(name))
  with check (bucket_id = 'termos'
    and (select public.pode_escrever())
    and public.pode_escrever_arquivo_termo(name));

-- (o texto de 0072_papel_dev_funcoes.sql)
alter policy "termos insere operador" on storage.objects
  with check (bucket_id = 'termos'
    and (select public.pode_escrever())
    and public.pode_escrever_arquivo_termo(name));

-- (o texto de 0070_papeis_leitura_perfil_ativo.sql)
alter policy "leitura operador" on public.profiles
  using ((select public.papel_atual()) is not null);

-- (o texto de 0128_adota_bkp_relatorios_f6a.sql)
alter policy "dev le backup f6a" on public._bkp_relatorios_gerados_f6a
  using ((select public.e_dev()));

-- =============================================================================
-- 0186 — os sete consumidores sem par de volta ao corpo de antes
-- =============================================================================
-- pode_escrever_filial(smallint) — o corpo de 0158_cargo_em_membros.sql (o vigente antes da 0185)
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
revoke all on function public.pode_escrever_filial(smallint) from public, anon, authenticated, service_role;
grant execute on function public.pode_escrever_filial(smallint) to authenticated;

-- pode_escrever_termo(uuid[]) — o corpo de 0069_termos_mesma_filial.sql (o vigente antes da 0185)
create or replace function public.pode_escrever_termo(p_ativo_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- ⚠ A ORDEM DESTA DISJUNÇÃO É A CORREÇÃO. `e_admin()` PRIMEIRO, e a exigência de array
  -- não-vazio DENTRO do ramo não-admin: senão `ativo_ids = '{}'` trancava a linha para todo
  -- mundo, admin incluído, e o lixo virava imortal (ver a DECISÃO no cabeçalho).
  -- Quem barra a CRIAÇÃO de linha sem ativo é a with_check das policies, não esta função.
  select public.e_admin()
      or (
        coalesce(array_length(p_ativo_ids, 1), 0) > 0
        and not exists (
          select 1
            from unnest(p_ativo_ids) aid
            left join public.ativos a on a.id = aid
           where a.id is null                                   -- ativo inexistente → fecha
              or not public.pode_escrever_filial(a.filial_id)    -- filial fora do vínculo → fecha
        )
      )
$$;

comment on function public.pode_escrever_termo(uuid[]) is
  'F21/0069: true se o usuário logado pode ESCREVER em todas as filiais dos ativos deste termo. admin → sempre (inclusive na linha legada de ativo_ids vazio ou com ativo apagado, para poder LIMPAR); operador → só se TODO ativo estiver em filial vinculada e o array não for vazio; consulta/desativado/sem perfil → nunca. Espelha o `exigirEscritaEm` de gerarTermo (src/lib/actions/termos.ts). A proibição de CRIAR termo sem ativo mora nas with_check das policies, não aqui.';
revoke all on function public.pode_escrever_termo(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.pode_escrever_termo(uuid[]) to authenticated;

-- pode_ler_arquivo_termo(text) — o corpo de 0129_leitura_termo_e_revoke_invoker.sql (o vigente antes da 0185)
create or replace function public.pode_ler_arquivo_termo(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select public.papel_atual()) is not null
$$;

comment on function public.pode_ler_arquivo_termo(text) is
  'F50/0129: true se o usuário pode LER este objeto do bucket `termos`. Hoje devolve a regra vigente desde a 0070 §B — todo logado ATIVO lê (papel_atual() não nulo; perfil desativado ou arquivado devolve NULL e não lê). O parâmetro `p_nome` ainda não é consultado: ele existe para que a F67 possa fechar a leitura pelo JOIN com termos_gerados (a linha do termo tem de ser da empresa da sessão) SEM mover um único objeto de bucket nem reescrever arquivo_path. ⚠ SEM o coalesce(…, true) da irmã de escrita, e de propósito: lá o fallback cobre a janela upload→insert (o .docx sobe antes da linha existir) e a limpeza de órfão; na leitura não há janela equivalente, e herdá-lo faria justamente o objeto ÓRFÃO — o que ninguém consegue atribuir a uma filial ou empresa — ser legível por regra.';
revoke all on function public.pode_ler_arquivo_termo(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_ler_arquivo_termo(text) to authenticated;

-- checagens_integridade_resumo() — o corpo de 0138_resumo_integridade_e_rotulo.sql (o vigente antes da 0185)
create or replace function public.checagens_integridade_resumo()
returns table(chave text, total bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.papel_atual() is null then
    raise exception 'Esta consulta exige uma conta ativa.' using errcode = '42501';
  end if;

  return query
  select n.chave, n.total from public.checagens_integridade_nucleo() n;
end;
$$;

comment on function public.checagens_integridade_resumo() is
  'F55 (0138): as contagens das doze checagens de integridade — (chave, total), sem a coluna amostra — para QUALQUER conta logada e ativa (papel_atual() is not null, o piso de leitura da 0070/0073). É o que o smoke agendado do .github/workflows/saude.yml lê uma vez por dia com uma conta de cargo consulta, para comparar com a linha de base versionada e abrir issue de alarme quando uma checagem passa dela. Não devolve linha de dado nenhuma: a amostra, que carrega patrimônio e nome, fica só na função da /dev. Divergência declarada da ficha do PLANO-MULTIEMPRESA, que previa e_admin() — decisão do Johnny de 10/09/2026.';
revoke all on function public.checagens_integridade_resumo() from public, anon, authenticated, service_role;
grant execute on function public.checagens_integridade_resumo() to authenticated;

-- ledger_de_migracoes() — o corpo de 0148_ledger_de_migracoes.sql (o vigente antes da 0185)
create or replace function public.ledger_de_migracoes()
returns table (versao text, nome text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.papel_atual() is null then
    raise exception 'Esta consulta exige uma conta ativa.' using errcode = '42501';
  end if;

  return query
    select m.version, m.name
      from supabase_migrations.schema_migrations m
     order by m.version desc;
exception
  -- Espelha a 0077: banco sem a tabela de controle devolve ledger VAZIO, não erro.
  when undefined_table then
    return;
end;
$$;

comment on function public.ledger_de_migracoes() is
  'Reauditoria 18/09/2026 (item AE, 0148): o ledger inteiro de supabase_migrations.schema_migrations (versao, nome), da versão mais nova para a mais antiga, para QUALQUER conta logada e ativa (papel_atual() is not null, o mesmo piso de checagens_integridade_resumo()). scripts/smoke/deriva-migrations.mjs compara com os arquivos de supabase/migrations/ pelo contrato de base fixa (da 0146 em diante, todo arquivo tem de estar no ledger pelo nome, e toda linha aplicada depois da 0146 tem de ter arquivo). Devolve zero linhas se a tabela de controle não existir.';
revoke all on function public.ledger_de_migracoes() from public, anon, authenticated, service_role;
grant execute on function public.ledger_de_migracoes() to authenticated;

-- dev_checagens_integridade() — o corpo de 0138_resumo_integridade_e_rotulo.sql (o vigente antes da 0185)
create or replace function public.dev_checagens_integridade()
returns table(chave text, total bigint, amostra text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.e_dev() then
    raise exception 'Esta consulta é restrita ao cargo Desenvolvedor.' using errcode = '42501';
  end if;

  return query
  select n.chave, n.total, n.amostra from public.checagens_integridade_nucleo() n;
end;
$$;

comment on function public.dev_checagens_integridade() is
  'F22 (0077), ampliada na 0085, 0095, 0098, 0110, 0127 e 0136, e DECOMPOSTA na 0138 (F55): as DOZE checagens de integridade só-leitura da área /dev. Desde a 0138 o SQL delas mora em checagens_integridade_nucleo(), e esta função é a guarda e_dev() sobre ele — mesma assinatura, mesmo resultado, as doze peças byte a byte. A decomposição existe porque o alarme agendado precisa das CONTAGENS sem ser dev, e um resumo que chamasse esta função por dentro recusaria: security definer troca o current_user, não o JWT que e_dev() lê. SECURITY DEFINER com a guarda na primeira linha do corpo, como sempre foi.';
revoke all on function public.dev_checagens_integridade() from public, anon, authenticated, service_role;
grant execute on function public.dev_checagens_integridade() to authenticated;

-- ultima_migracao_aplicada() — o corpo de 0077_dev_diagnostico.sql (o vigente antes da 0185)
create or replace function public.ultima_migracao_aplicada()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text;
begin
  if not public.e_dev() then
    raise exception 'Esta consulta é restrita ao cargo Desenvolvedor.' using errcode = '42501';
  end if;
  select max(version) into v from supabase_migrations.schema_migrations;
  return v;
exception
  -- Banco onde a tabela de controle não existe (um Postgres cru do CI, por exemplo): a tela
  -- mostra "indisponível" em vez de quebrar.
  when undefined_table then return null;
end;
$$;

comment on function public.ultima_migracao_aplicada() is
  'F22 (/dev): a maior `version` de supabase_migrations.schema_migrations, para a tela comparar o banco com a última migration do repositório. Só leitura, restrita ao cargo dev. Devolve NULL se a tabela de controle não existir.';
revoke all on function public.ultima_migracao_aplicada() from public, anon, authenticated, service_role;
grant execute on function public.ultima_migracao_aplicada() to authenticated;

-- =============================================================================
-- 0185 — as formas de cargo por empresa e de unidade saem (nada mais as chama)
-- =============================================================================
drop function if exists public.pode_escrever_unidade(uuid, smallint);
drop function if exists public.filial_da_empresa(uuid, smallint);
drop function if exists public.empresa_da_filial(smallint);
drop function if exists public.pode_escrever_na(uuid);
drop function if exists public.e_dev_na(uuid);
drop function if exists public.e_admin_na(uuid);
drop function if exists public.papel_na_empresa(uuid);

reset lock_timeout;

notify pgrst, 'reload schema';
