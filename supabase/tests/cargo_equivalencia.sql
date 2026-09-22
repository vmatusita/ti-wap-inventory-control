-- =============================================================
-- Roteiro de teste: A COMPARAÇÃO — o corpo ANTIGO × o corpo VIVO do cargo (F62, 22/09/2026)
-- =============================================================
-- A promessa central da F62: NENHUM perfil muda de acesso quando o cargo sai de
-- `profiles` e vai para `membros`. Em produção isso se prova pela impressão do acesso
-- antes × depois (`docs/f62-evidencias/impressao-acesso.sql`); AQUI, no Postgres do CI,
-- pela GRADE COMPLETA — cada papel × ativo × arquivado × com/sem vínculo, mais duas
-- memberships, sem perfil e sem sessão — comparando, célula a célula, o corpo ANTIGO
-- (o da F61, lendo `profiles`) com o corpo VIVO:
--
--   1 — papel_atual()
--   2 — e_admin(), e_dev(), pode_escrever() (derivadas do papel)
--   3 — pode_escrever_filial(f) para a filial vinculada, outra filial e NULL
--   4 — existe_outro_admin_ativo(<a própria pessoa>)
--   5 — a PONTE com DUAS memberships (só existe depois da 0152: empresa B fictícia)
--
-- O CORPO ANTIGO mora em `pg_temp` (`*_f61`), copiado VERBATIM do arquivo vigente antes
-- da F62 — `0073` (papel_atual), `0072` (pode_escrever_filial) e `0132`
-- (existe_outro_admin_ativo) —, trocando só o nome e, dentro de pode_escrever_filial, a
-- chamada a `public.papel_atual()` pela cópia antiga. Quem garante que a cópia NÃO
-- envelhece é a trava de mesa `src/lib/validators/cargo-em-membros.test.ts`, que compara
-- estes blocos com o corpo vigente das migrations até a 0151.
--
-- ANTES DA TROCA (a `0158`) este roteiro é VERDE POR CONSTRUÇÃO: antigo = vivo, as duas
-- colunas leem `profiles`. Depois dela, o vivo lê `membros` — e a grade planta as DUAS
-- fontes com o mesmo valor, que é exatamente o estado que a cópia da migration produz.
-- Qualquer célula diferente é um perfil que mudaria de acesso. A sabotagem B da F62 (o
-- corpo novo de papel_atual() sem o `excluido_em`, ou sem o `ativo`) derruba 1 e 2
-- nomeando a célula — ver as mutações `f62-ponte-*` em `scripts/db/mutacoes.mjs`.
--
-- ⚠ Este roteiro GRAVA `profiles.papel`/`profiles.ativo` de propósito: o corpo antigo lê
-- dali. É uma das exceções NOMEADAS da varredura de roteiros da F62.
--
-- Tudo como `postgres` com `request.jwt.claims` (as funções comparadas são todas
-- `security definer`: o papel de quem chama não muda o que elas leem; a claim, sim).
-- DADOS 100% FICTÍCIOS. Roda dentro de `begin; … rollback;`.
-- =============================================================

begin;

-- ---------------------------------------------------------------------------
-- O CORPO ANTIGO — `0073_dev_intocavel_e_arquivamento.sql:118-130`
-- ---------------------------------------------------------------------------
create function pg_temp.papel_atual_f61()
returns public.papel_usuario
language sql
stable
security definer
set search_path = public
as $$
  select p.papel
    from public.profiles p  -- F62/cargo-congelado: corpo antigo
   where p.id = (select auth.uid())
     and p.ativo
     and p.excluido_em is null
$$;

-- ---------------------------------------------------------------------------
-- O CORPO ANTIGO — `0072_papel_dev_funcoes.sql:123-157`
-- ---------------------------------------------------------------------------
create function pg_temp.pode_escrever_filial_f61(fid smallint)
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

  v_papel := pg_temp.papel_atual_f61();

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

-- ---------------------------------------------------------------------------
-- O CORPO ANTIGO — `0132_guardas_de_escopo.sql:183-217`
-- ---------------------------------------------------------------------------
create function pg_temp.existe_outro_admin_ativo_f61(p_excluindo uuid, p_escopo uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p  -- F62/cargo-congelado: corpo antigo
     where p.papel in ('dev', 'admin')
       and p.ativo
       and p.excluido_em is null
       and p.id <> p_excluindo
       and (p_escopo is null or true)
  )
$$;

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;

  k_papeis text[] := array['dev', 'admin', 'operador', 'consulta'];
  v_f1     smallint;
  v_f2     smallint;
  v_n      int := 0;
  v_id     uuid;
  v_papel  text;
  v_ativo  boolean;
  v_arq    boolean;
  v_vinc   boolean;
  v_rotulo text;
  v_ids    uuid[] := '{}';
  v_rots   text[] := '{}';
  v_i      int;

  -- as duas pessoas de DUAS memberships (5) e a empresa B, fictícias
  k_dupla_admin    constant uuid := '00000000-f62c-4000-8000-0000000000d1';
  k_dupla_operador constant uuid := '00000000-f62c-4000-8000-0000000000d2';
  k_sem_perfil     constant uuid := '00000000-f62c-4000-8000-0000000000ff';
  v_empresa_b      uuid;
  v_filial_b       smallint;
  v_tem_membros    boolean := to_regclass('public.membros') is not null;

  -- as células
  v_c1 bigint := 0; v_m1 bigint := 0; v_l1 text := '';
  v_c2 bigint := 0; v_m2 bigint := 0; v_l2 text := '';
  v_c3 bigint := 0; v_m3 bigint := 0; v_l3 text := '';
  v_c4 bigint := 0; v_m4 bigint := 0; v_l4 text := '';
  v_c5 bigint := 0; v_m5 bigint := 0; v_l5 text := '';

  v_antigo text;
  v_vivo   text;
  v_f      smallint;
  v_fs     smallint[];
begin
  select id into v_f1 from public.filiais where ativo order by id limit 1;
  select id into v_f2 from public.filiais where ativo and id <> v_f1 order by id limit 1;
  if v_f1 is null or v_f2 is null then
    raise exception 'cargo_equivalencia: o banco precisa de ao menos DUAS filiais ativas.';
  end if;

  -- =========================================================================
  -- A GRADE: 4 papéis × ativo × arquivado × vínculo = 32 pessoas.
  -- =========================================================================
  perform set_config('estoque.gestao_usuarios', 'on', true);
  foreach v_papel in array k_papeis loop
    foreach v_ativo in array array[true, false] loop
      foreach v_arq in array array[false, true] loop
        foreach v_vinc in array array[false, true] loop
          v_n := v_n + 1;
          v_id := ('00000000-f62c-4000-8000-' || lpad(to_hex(v_n), 12, '0'))::uuid;
          v_rotulo := v_papel || '|' || case when v_ativo then 'ativo' else 'inativo' end
                      || '|' || case when v_arq then 'arquivado' else 'vivo' end
                      || '|' || case when v_vinc then 'com vinculo' else 'sem vinculo' end;
          v_ids := v_ids || v_id;
          v_rots := v_rots || v_rotulo;

          insert into auth.users (id, instance_id, aud, role, email,
                                  encrypted_password, email_confirmed_at, created_at, updated_at)
          values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                  'f62.grade.' || v_n || '@wap.ind.br', '', now(), now(), now());

          -- o corpo ANTIGO lê daqui
          update public.profiles  -- F62/cargo-congelado: corpo antigo
             set papel = v_papel::public.papel_usuario,
                 ativo = v_ativo,
                 excluido_em = case when v_arq then now() else null end
           where id = v_id;

          -- o corpo VIVO, depois da 0158, lê daqui — o MESMO valor, como a cópia produz
          if v_tem_membros then
            update public.membros
               set papel = v_papel::public.papel_usuario, ativo = v_ativo
             where profile_id = v_id and empresa_id = public.empresa_legada();
          end if;

          if v_vinc then
            insert into public.operador_filiais (usuario_id, filial_id) values (v_id, v_f1);
          end if;
        end loop;
      end loop;
    end loop;
  end loop;

  -- =========================================================================
  -- DUAS memberships (só depois da 0152): a PONTE responde pela empresa legada.
  --   k_dupla_admin    — admin na WAP, consulta na empresa B
  --   k_dupla_operador — operador na WAP (vinculado à f1), ADMIN na empresa B
  -- O corpo antigo só conhece `profiles` (admin / operador); o vivo tem de dar o MESMO.
  -- =========================================================================
  if v_tem_membros then
    insert into public.empresas (slug, nome) values ('f62-grade-b', 'Empresa B da grade (F62)')
    returning id into v_empresa_b;
    insert into public.filiais (nome, slug, empresa_id)
    values ('F62 Grade B Matriz', 'f62-grade-b-matriz', v_empresa_b)
    returning id into v_filial_b;

    insert into auth.users (id, instance_id, aud, role, email,
                            encrypted_password, email_confirmed_at, created_at, updated_at)
    values (k_dupla_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'f62.grade.dupla.admin@wap.ind.br', '', now(), now(), now()),
           (k_dupla_operador, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'f62.grade.dupla.operador@wap.ind.br', '', now(), now(), now());
    update public.profiles set papel = 'admin'    where id = k_dupla_admin;  -- F62/cargo-congelado: corpo antigo
    update public.profiles set papel = 'operador' where id = k_dupla_operador;  -- F62/cargo-congelado: corpo antigo
    update public.membros set papel = 'admin'
     where profile_id = k_dupla_admin and empresa_id = public.empresa_legada();
    update public.membros set papel = 'operador'
     where profile_id = k_dupla_operador and empresa_id = public.empresa_legada();
    insert into public.membros (empresa_id, profile_id, papel, ativo) values
      (v_empresa_b, k_dupla_admin, 'consulta', true),
      (v_empresa_b, k_dupla_operador, 'admin', true);
    insert into public.operador_filiais (usuario_id, filial_id) values (k_dupla_operador, v_f1);
  end if;
  perform set_config('estoque.gestao_usuarios', 'off', true);

  -- =========================================================================
  -- A COMPARAÇÃO, célula a célula (+ sem perfil e sem sessão nas células 1–3).
  -- =========================================================================
  for v_i in 1 .. array_length(v_ids, 1) + 2 loop
    if v_i <= array_length(v_ids, 1) then
      v_id := v_ids[v_i];
      v_rotulo := v_rots[v_i];
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
    elsif v_i = array_length(v_ids, 1) + 1 then
      v_id := k_sem_perfil;
      v_rotulo := 'sem perfil';
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
    else
      v_id := null;
      v_rotulo := 'sem sessao';
      perform set_config('request.jwt.claims', '', true);
    end if;

    -- 1 — papel_atual()
    v_antigo := coalesce(pg_temp.papel_atual_f61()::text, '∅');
    v_vivo   := coalesce(public.papel_atual()::text, '∅');
    v_c1 := v_c1 + 1;
    if v_antigo is distinct from v_vivo then
      v_m1 := v_m1 + 1;
      v_l1 := v_l1 || ' [' || v_rotulo || ': antigo=' || v_antigo || ' vivo=' || v_vivo || ']';
    end if;

    -- 2 — as três derivadas (a régua de 0072: e_admin/e_dev/pode_escrever)
    v_antigo := coalesce(pg_temp.papel_atual_f61() in ('admin', 'dev'), false)::text || '/'
             || coalesce(pg_temp.papel_atual_f61() = 'dev', false)::text || '/'
             || coalesce(pg_temp.papel_atual_f61() in ('dev', 'admin', 'operador'), false)::text;
    v_vivo := public.e_admin()::text || '/' || public.e_dev()::text || '/' || public.pode_escrever()::text;
    v_c2 := v_c2 + 1;
    if v_antigo is distinct from v_vivo then
      v_m2 := v_m2 + 1;
      v_l2 := v_l2 || ' [' || v_rotulo || ': antigo=' || v_antigo || ' vivo=' || v_vivo || ']';
    end if;

    -- 3 — pode_escrever_filial: a vinculada, outra, e NULL
    foreach v_f in array array[v_f1, v_f2, null]::smallint[] loop
      v_antigo := coalesce(pg_temp.pode_escrever_filial_f61(v_f)::text, '∅');
      v_vivo   := coalesce(public.pode_escrever_filial(v_f)::text, '∅');
      v_c3 := v_c3 + 1;
      if v_antigo is distinct from v_vivo then
        v_m3 := v_m3 + 1;
        v_l3 := v_l3 || ' [' || v_rotulo || ' f=' || coalesce(v_f::text, 'null')
                || ': antigo=' || v_antigo || ' vivo=' || v_vivo || ']';
      end if;
    end loop;

    -- 4 — existe_outro_admin_ativo(<a própria pessoa>) — só para quem tem id
    if v_id is not null then
      v_antigo := coalesce(pg_temp.existe_outro_admin_ativo_f61(v_id)::text, '∅');
      v_vivo   := coalesce(public.existe_outro_admin_ativo(v_id)::text, '∅');
      v_c4 := v_c4 + 1;
      if v_antigo is distinct from v_vivo then
        v_m4 := v_m4 + 1;
        v_l4 := v_l4 || ' [' || v_rotulo || ': antigo=' || v_antigo || ' vivo=' || v_vivo || ']';
      end if;
    end if;
  end loop;

  -- 5 — as duas memberships
  if v_tem_membros then
    foreach v_id in array array[k_dupla_admin, k_dupla_operador] loop
      v_rotulo := case when v_id = k_dupla_admin then 'dupla admin-WAP/consulta-B'
                       else 'dupla operador-WAP/admin-B' end;
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
      v_antigo := coalesce(pg_temp.papel_atual_f61()::text, '∅');
      v_vivo   := coalesce(public.papel_atual()::text, '∅');
      foreach v_f in array array[v_f1, v_f2, v_filial_b]::smallint[] loop
        v_antigo := v_antigo || '|' || coalesce(pg_temp.pode_escrever_filial_f61(v_f)::text, '∅');
        v_vivo   := v_vivo   || '|' || coalesce(public.pode_escrever_filial(v_f)::text, '∅');
      end loop;
      v_antigo := v_antigo || '|' || pg_temp.existe_outro_admin_ativo_f61(v_id)::text;
      v_vivo   := v_vivo   || '|' || public.existe_outro_admin_ativo(v_id)::text;
      v_c5 := v_c5 + 1;
      if v_antigo is distinct from v_vivo then
        v_m5 := v_m5 + 1;
        v_l5 := v_l5 || ' [' || v_rotulo || ': antigo=' || v_antigo || ' vivo=' || v_vivo || ']';
      end if;
    end loop;
  end if;

  perform set_config('request.jwt.claims', '', true);

  if pg_temp.assert_zero_de('1 papel_atual(): antigo = vivo em toda a grade' ||
       case when v_m1 > 0 then ' —' || v_l1 else '' end, v_m1, v_c1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('2 e_admin/e_dev/pode_escrever: antigo = vivo em toda a grade' ||
       case when v_m2 > 0 then ' —' || v_l2 else '' end, v_m2, v_c2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('3 pode_escrever_filial: antigo = vivo (vinculada, outra, NULL)' ||
       case when v_m3 > 0 then ' —' || v_l3 else '' end, v_m3, v_c3) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('4 existe_outro_admin_ativo: antigo = vivo para cada pessoa da grade' ||
       case when v_m4 > 0 then ' —' || v_l4 else '' end, v_m4, v_c4) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if v_tem_membros then
    if pg_temp.assert_zero_de('5 a ponte com DUAS memberships responde pela empresa legada, nunca pela mais forte' ||
         case when v_m5 > 0 then ' —' || v_l5 else '' end, v_m5, v_c5) then
      v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  else
    raise notice '(5 não se aplica antes da 0152 — não há empresa B para a segunda membership)';
  end if;

  raise notice 'FIM cargo_equivalencia: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
