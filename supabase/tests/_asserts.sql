-- =============================================================
-- _asserts.sql — a ferramenta de asserção dos roteiros (F45, 05/09/2026)
-- =============================================================
-- POR QUE ELE EXISTE
--
-- O repositório tem dezenas de asserções da forma `if v_n = 0 then ✓ else ✗`.
-- Todas elas passam sobre CONJUNTO VAZIO: se o cenário não montou o dado que
-- deveria examinar, `count(*)` devolve 0, o roteiro imprime ✓ e o CI fica verde.
-- Um roteiro tautológico é pior do que roteiro nenhum, porque dá sensação de
-- rede. `pg_temp.assert_zero_de` é a forma que RECUSA esse caso: ela exige que
-- você diga não só quantos estão ruins, mas sobre QUANTOS você olhou.
--
-- COMO CARREGAR — e por que não dá para colar isto dentro do roteiro
--
-- Todo roteiro de `supabase/tests/` é `begin; do $$ … $$; rollback;`. Função
-- criada DENTRO da transação some no `rollback`. Então este arquivo tem de ser
-- carregado ANTES do `begin`, na MESMA sessão de psql:
--
--     psql "$DBURL" -f supabase/tests/_asserts.sql -f supabase/tests/<roteiro>.sql
--
-- Dois `-f` = uma sessão só, e `pg_temp` sobrevive entre eles. É exatamente o
-- que `scripts/db/rodar-roteiros.sh` faz — e é por isso que o loop pula `_*.sql`
-- (senão tentaria rodar este arquivo como se fosse roteiro).
--
-- POR QUE UNIVERSO VAZIO LEVANTA EXCEÇÃO, EM VEZ DE MARCAR ✗
--
-- Universo vazio não é "o cenário falhou": é "o cenário não existiu". Tudo que
-- vem depois no roteiro está examinando um mundo que não foi montado, e marcar
-- ✗ e seguir daria mais quinze linhas de resultado sem valor. A exceção derruba
-- o bloco, o roteiro NÃO emite a linha `FIM`, e o runner reprova por ausência da
-- linha — o mesmo caminho de qualquer outro abort precoce. É a razão de as duas
-- peças (esta função e a linha `FIM`) terem nascido no mesmo commit.
--
-- USO
--
--     if pg_temp.assert_zero_de('3c nenhum ativo órfão', v_orfaos, v_total) then
--       v_ok := v_ok + 1;
--     else
--       v_falhas := v_falhas + 1;
--     end if;
--
-- A própria função emite o `✓`/`✗` no estilo dos roteiros; quem chama só conta.
-- =============================================================

create or replace function pg_temp.assert_zero_de(
  rotulo   text,
  ruins    bigint,
  universo bigint
) returns boolean
language plpgsql
as $fn$
begin
  if universo is null or universo = 0 then
    raise exception
      'assert_zero_de: universo vazio em "%" — a asserção passaria sobre conjunto vazio (tautologia). Monte o cenário ou conte outra coisa.',
      rotulo;
  end if;

  if ruins is null then
    raise exception
      'assert_zero_de: contagem de ruins NULA em "%" — count(*) nunca devolve null; provavelmente veio de um `select into` que não achou linha.',
      rotulo;
  end if;

  if ruins < 0 or ruins > universo then
    raise exception
      'assert_zero_de: contagem incoerente em "%" — % ruins de um universo de %.',
      rotulo, ruins, universo;
  end if;

  if ruins = 0 then
    raise notice '✓ % (0 de % conferidos)', rotulo, universo;
    return true;
  end if;

  raise warning '✗ %: % de % fora da regra', rotulo, ruins, universo;
  return false;
end;
$fn$;

-- =============================================================
-- OS AJUDANTES DE FIXTURE DO CARGO (F62, 22/09/2026)
-- =============================================================
-- Desde a F62 o cargo (`papel`) e o status (`ativo`) moram em `public.membros`, por
-- empresa; `profiles.papel`/`profiles.ativo` CONGELARAM (decisão iii) e nenhum roteiro os
-- grava mais, salvo os cenários nomeados que provam a guarda e o congelamento
-- (`src/lib/validators/cargo-em-membros.test.ts`, describe 6). Estes três ajudantes são o
-- jeito ÚNICO de plantar o cargo numa fixture:
--
--   pg_temp.plantar_cargo(pessoa, papel [, ativo [, empresa]])
--       a membership da pessoa na empresa (padrão: a legada) passa a ter este cargo e
--       status — cria a linha se não houver (a da empresa legada o `handle_new_user` já
--       cria ao inserir em auth.users).
--   pg_temp.plantar_status(pessoa, ativo [, empresa])
--       só o status, mantendo o cargo.
--   pg_temp.perfil_ativo_mais_antigo()
--       o autor "qualquer" dos roteiros: o perfil não arquivado com membership ATIVA na
--       empresa legada, o mais antigo (created_at, id) — a régua que os roteiros usavam
--       sobre `profiles.ativo`.
--
-- ⚠ A JANELA DO DEV: plantar ou tirar o cargo `dev` exige `estoque.gestao_usuarios = on`
-- (as guardas `membros_guarda_dev`/`profiles_guarda_dev` recusam até o `postgres` sem ela).
-- Os ajudantes a abrem SÓ quando a mexida toca um dev, e devolvem o valor anterior ao
-- sair — um cenário que prova a guarda planta direto, SEM o ajudante.
-- =============================================================

create or replace function pg_temp.plantar_cargo(
  p_pessoa  uuid,
  p_papel   public.papel_usuario,
  p_ativo   boolean default true,
  p_empresa uuid default null
) returns void
language plpgsql
as $fn$
declare
  v_empresa uuid := coalesce(p_empresa, public.empresa_legada());
  v_janela  text := current_setting('estoque.gestao_usuarios', true);
  v_dev     boolean;
begin
  v_dev := p_papel = 'dev' or exists (
    select 1 from public.membros m
     where m.empresa_id = v_empresa and m.profile_id = p_pessoa and m.papel = 'dev');
  if v_dev then
    perform set_config('estoque.gestao_usuarios', 'on', true);
  end if;
  insert into public.membros (empresa_id, profile_id, papel, ativo)
  values (v_empresa, p_pessoa, p_papel, p_ativo)
  on conflict (empresa_id, profile_id) do update
     set papel = excluded.papel, ativo = excluded.ativo;
  if v_dev then
    perform set_config('estoque.gestao_usuarios', coalesce(v_janela, ''), true);
  end if;
end;
$fn$;

create or replace function pg_temp.plantar_status(
  p_pessoa  uuid,
  p_ativo   boolean,
  p_empresa uuid default null
) returns void
language plpgsql
as $fn$
declare
  v_empresa uuid := coalesce(p_empresa, public.empresa_legada());
  v_janela  text := current_setting('estoque.gestao_usuarios', true);
  v_dev     boolean;
begin
  v_dev := exists (
    select 1 from public.membros m
     where m.empresa_id = v_empresa and m.profile_id = p_pessoa and m.papel = 'dev');
  if v_dev then
    perform set_config('estoque.gestao_usuarios', 'on', true);
  end if;
  update public.membros set ativo = p_ativo
   where empresa_id = v_empresa and profile_id = p_pessoa;
  if not found then
    raise exception 'plantar_status: a pessoa % não tem membership na empresa %', p_pessoa, v_empresa;
  end if;
  if v_dev then
    perform set_config('estoque.gestao_usuarios', coalesce(v_janela, ''), true);
  end if;
end;
$fn$;

create or replace function pg_temp.perfil_ativo_mais_antigo()
returns uuid
language plpgsql
as $fn$
declare
  v_id uuid;
begin
  select p.id into v_id
    from public.profiles p
    join public.membros m on m.profile_id = p.id and m.empresa_id = public.empresa_legada()
   where m.ativo and p.excluido_em is null
   order by p.created_at, p.id
   limit 1;
  return v_id;
end;
$fn$;
