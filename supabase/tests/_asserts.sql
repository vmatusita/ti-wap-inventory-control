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

-- =============================================================
-- O LÉXICO DO CORPO DE FUNÇÃO E A LEITURA DE `empresa_id` DO LOTE 2 (F64, 23/09/2026)
-- =============================================================
-- Achado da revisão adversarial da F64 (confirmado por cético): a trava "ninguém lê
-- `empresa_id` do lote 2 antes da F66" (15h de `catalogo_policies.sql`, bloco 6 de
-- `empresa_no_vocabulario.sql`) isentava as duas exceções nominais do kit pelo NOME da função
-- inteira — enquanto a decisão 7 do PLAN-F64 e a R-ACC-96 dizem que a exceção vale SÓ nos
-- COMANDOS que tocam `kits_modelos`/`motivos`. Partir o corpo por comando exige saber onde está
-- o texto: um `;` ou um `--` dentro de uma string não parte nem comenta nada. Por isso os dois
-- ajudantes abaixo, um lugar só para os dois roteiros:
--
--   pg_temp.sql_so_codigo(texto)
--       o CÓDIGO de um corpo de função, com o léxico do Postgres: comentário de linha (`--` até a
--       quebra) e de bloco (`/* */`, aninhado) SAEM; texto (`'…'` com `''`, e `E'…'` com a barra) e
--       dollar-quote (`$$…$$`, `$tag$…$tag$`) viram o texto vazio `''`; identificador citado
--       (`"…"`) fica, porque é código; `$1` é parâmetro posicional, não dollar-quote. Espelho do
--       leitor único de migrations (`scripts/db/classificar-migration.mjs`, `lexar`) — o mesmo
--       léxico que a trava de mesa usa no disco.
--   pg_temp.leitura_de_empresa_do_lote(função, corpo, lote, exceções, tabelas do kit)
--       NULL se o corpo não lê `empresa_id` de uma tabela do lote; senão, o que acusa. FORA das
--       exceções nominais, a FUNÇÃO inteira reprova se o código cita uma tabela do lote e
--       `empresa_id` (a régua de antes, só que sem texto nem comentário); NAS exceções, reprova o
--       COMANDO (o código partido por `;`) que cita `empresa_id` junto de uma tabela do lote que
--       não seja uma das tabelas do kit.
-- =============================================================

create or replace function pg_temp.sql_so_codigo(p_texto text)
returns text
language plpgsql
immutable
as $fn$
declare
  a     text[] := string_to_array(coalesce(p_texto, ''), null);
  n     int;
  i     int := 1;
  k     int;
  lt    int;
  prof  int;
  esc   boolean;
  c     text;
  prox  text;
  tag   text;
  saida text[] := '{}';
begin
  n := coalesce(array_length(a, 1), 0);
  while i <= n loop
    c := a[i];
    prox := case when i < n then a[i + 1] else '' end;
    if c = '-' and prox = '-' then
      -- comentário de linha: sai até a quebra (a quebra fica, e separa o que vem depois)
      while i <= n and a[i] <> E'\n' loop
        i := i + 1;
      end loop;
    elsif c = '/' and prox = '*' then
      -- comentário de bloco, aninhado como no Postgres
      prof := 1;
      i := i + 2;
      while i <= n and prof > 0 loop
        if a[i] = '/' and i < n and a[i + 1] = '*' then
          prof := prof + 1;
          i := i + 2;
        elsif a[i] = '*' and i < n and a[i + 1] = '/' then
          prof := prof - 1;
          i := i + 2;
        else
          i := i + 1;
        end if;
      end loop;
      saida := array_append(saida, ' '::text);
    elsif c = '''' then
      -- texto: `''` é o apóstrofo; em `E'…'` a barra escapa o caractere seguinte
      esc := i > 1 and lower(a[i - 1]) = 'e' and (i = 2 or a[i - 2] !~ '[A-Za-z0-9_]');
      i := i + 1;
      while i <= n loop
        if esc and a[i] = '\' then
          i := i + 2;
        elsif a[i] = '''' then
          if i < n and a[i + 1] = '''' then
            i := i + 2;
          else
            i := i + 1;
            exit;
          end if;
        else
          i := i + 1;
        end if;
      end loop;
      saida := array_append(saida, ''''''::text);
    elsif c = '"' then
      -- identificador citado: é CÓDIGO, fica inteiro
      saida := array_append(saida, c);
      i := i + 1;
      while i <= n loop
        saida := array_append(saida, a[i]);
        if a[i] = '"' then
          if i < n and a[i + 1] = '"' then
            saida := array_append(saida, a[i + 1]);
            i := i + 2;
          else
            i := i + 1;
            exit;
          end if;
        else
          i := i + 1;
        end if;
      end loop;
    elsif c = '$' and (i = 1 or a[i - 1] !~ '[A-Za-z0-9_]') then
      -- dollar-quote: `$` + tag opcional (letra ou _, depois letra, dígito ou _) + `$`
      k := i + 1;
      if k <= n and a[k] ~ '[A-Za-z_]' then
        k := k + 1;
        while k <= n and a[k] ~ '[A-Za-z0-9_]' loop
          k := k + 1;
        end loop;
      end if;
      if k <= n and a[k] = '$' then
        tag := array_to_string(a[i:k], '');
        lt := k - i + 1;
        i := k + 1;
        while i <= n loop
          if a[i] = '$' and array_to_string(a[i:i + lt - 1], '') = tag then
            i := i + lt;
            exit;
          end if;
          i := i + 1;
        end loop;
        saida := array_append(saida, ''''''::text);
      else
        -- `$1`, `$2`…: parâmetro posicional
        saida := array_append(saida, c);
        i := i + 1;
      end if;
    else
      saida := array_append(saida, c);
      i := i + 1;
    end if;
  end loop;
  return array_to_string(saida, '');
end;
$fn$;

create or replace function pg_temp.leitura_de_empresa_do_lote(
  p_funcao      text,
  p_corpo       text,
  p_lote        text[],
  p_excecoes    text[],
  p_tabelas_kit text[]
) returns text
language plpgsql
as $fn$
declare
  v_re_lote text := '\m(' || array_to_string(p_lote, '|') || ')\M';
  v_fora    text[];
  v_re_fora text;
  v_codigo  text;
  v_cmd     text;
begin
  -- o texto cru já descarta quase tudo (e poupa o léxico das funções que não interessam)
  if p_corpo is null or p_corpo !~ v_re_lote or p_corpo !~ '\mempresa_id\M' then
    return null;
  end if;
  v_codigo := pg_temp.sql_so_codigo(p_corpo);
  if v_codigo !~ v_re_lote or v_codigo !~ '\mempresa_id\M' then
    return null;
  end if;
  if not (p_funcao = any (p_excecoes)) then
    return p_funcao;
  end if;
  v_fora := array(select t from unnest(p_lote) as t where not (t = any (p_tabelas_kit)));
  v_re_fora := '\m(' || array_to_string(v_fora, '|') || ')\M';
  for v_cmd in select s from regexp_split_to_table(v_codigo, ';') as s loop
    if v_cmd ~ '\mempresa_id\M' and v_cmd ~ v_re_fora then
      return p_funcao || ' (num comando que lê outra tabela do lote: '
             || left(btrim(regexp_replace(v_cmd, '\s+', ' ', 'g')), 100) || ')';
    end if;
  end loop;
  return null;
end;
$fn$;
