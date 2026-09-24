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
--       `empresa_id` (a régua de antes, só que sem texto nem comentário); NAS exceções, a leitura
--       tem de ser PROVADAMENTE do kit, por COMANDO (o código partido por `;`): (a) reprova o comando
--       que cita `empresa_id` junto de uma tabela do lote que não seja do kit; (b) cada `x.empresa_id`
--       resolve `x` no próprio comando (`from|join|update|into T [as] x`) para uma tabela do kit ou
--       de fora do lote, e `new`/`old` só valem se todo gatilho que executa a função está numa
--       tabela do kit. O que não se prova ACUSA — a variável de registro de `select * into v from
--       public.eventos_admin …; if v.empresa_id …` (2ª rodada da revisão adversarial: dois comandos,
--       e nenhum dos dois casava as duas regras de (a)) e o apelido de subselect. A exceção se
--       escreve com apelido no próprio comando.
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
  v_trecho  text;
  v_q       text;
  v_origens text[];
  v_gatilho boolean;
  v_decl    text;
  v_gatilho_no_lote boolean;
begin
  -- F65 (23/09/2026, o fato 21 da ordem): uma função de GATILHO numa tabela do lote lê a linha dela por `new`/`old` SEM
  -- citar a tabela no corpo — e isso também é ler `empresa_id` do lote (a forma de `guarda_empresa`). Até a F65 o texto
  -- cru a descartava por não citar tabela nenhuma; agora ela conta, e só passa como exceção nominal.
  select exists (select 1 from pg_trigger t
                   join pg_proc p on p.oid = t.tgfoid
                   join pg_namespace pn on pn.oid = p.pronamespace
                   join pg_class c on c.oid = t.tgrelid
                   join pg_namespace cn on cn.oid = c.relnamespace
                  where pn.nspname = 'public' and cn.nspname = 'public'
                    and p.proname::text = p_funcao and not t.tgisinternal
                    and c.relname::text = any (p_lote))
    into v_gatilho_no_lote;
  -- o texto cru já descarta quase tudo (e poupa o léxico das funções que não interessam)
  if p_corpo is null or p_corpo !~* '\mempresa_id\M' or (p_corpo !~* v_re_lote and not v_gatilho_no_lote) then
    return null;
  end if;
  -- o código em minúsculas: o Postgres dobra o identificador sem aspas (`FROM Public.Motivos`)
  v_codigo := lower(pg_temp.sql_so_codigo(p_corpo));
  if v_codigo !~ '\mempresa_id\M'
     or (v_codigo !~ v_re_lote and not (v_gatilho_no_lote and v_codigo ~ '\m(new|old)\s*\.\s*empresa_id\M')) then
    return null;
  end if;
  if not (p_funcao = any (p_excecoes)) then
    return p_funcao;
  end if;
  -- NAS EXCEÇÕES, a leitura tem de ser PROVADAMENTE do kit.
  v_fora := array(select t from unnest(p_lote) as t where not (t = any (p_tabelas_kit)));
  v_re_fora := '\m(' || array_to_string(v_fora, '|') || ')\M';
  -- `new`/`old` são a linha do gatilho: valem só se TODO gatilho que executa a função está numa
  -- tabela do kit (e há ao menos um)
  select coalesce(bool_and(c.relname::text = any (p_tabelas_kit)), false)
    into v_gatilho
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace pn on pn.oid = p.pronamespace
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace cn on cn.oid = c.relnamespace
   where pn.nspname = 'public' and cn.nspname = 'public'
     and p.proname::text = p_funcao and not t.tgisinternal;
  for v_cmd in select s from regexp_split_to_table(v_codigo, ';') as s loop
    continue when v_cmd !~ '\mempresa_id\M';
    v_trecho := left(btrim(regexp_replace(v_cmd, '\s+', ' ', 'g')), 100);
    -- (a) o comando cita uma tabela do lote que não é do kit
    if v_cmd ~ v_re_fora then
      return p_funcao || ' (num comando que lê outra tabela do lote: ' || v_trecho || ')';
    end if;
    -- (b) cada `x.empresa_id` resolve `x` NO PRÓPRIO COMANDO: a tabela declarada com esse nome ou
    --     apelido (`from|join|update|into T [as] x`) tem de ser do kit ou de fora do lote. O que não
    --     se resolve — a variável de registro de `select * into v from …`, o apelido de subselect —
    --     ACUSA. Sem qualificador passa: com (a), a coluna só pode ser de tabela permitida.
    --     A declaração é lida sem o `distinct from` (não declara nada) e o nome declarado não pode vir
    --     seguido de `.`: em `p is distinct from v.empresa_id`, `v` não vira tabela.
    v_decl := regexp_replace(v_cmd, '\mdistinct\s+from\M', 'distinct de', 'g');
    for v_q in
      select m[1] from regexp_matches(v_cmd, '(?:\m([a-z_][a-z0-9_]*)\s*\.\s*)?\mempresa_id\M', 'g') as m
    loop
      continue when v_q is null;
      if v_q in ('new', 'old') then
        continue when v_gatilho;
        return p_funcao || ' (' || v_q || '.empresa_id sem que todo gatilho da função esteja numa tabela do kit: '
               || v_trecho || ')';
      end if;
      v_origens := array(
        select distinct x[1]
          from regexp_matches(v_decl,
                 '\m(?:from|join|update|into)\s+(?:only\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s+(?:as\s+)?'
                 || v_q || '\M(?!\s*\.)', 'g') as x);
      if v_decl ~ ('\m(?:from|join|update|into)\s+(?:only\s+)?(?:public\s*\.\s*)?' || v_q || '\M(?!\s*\.)') then
        v_origens := v_origens || v_q;
      end if;
      if cardinality(v_origens) = 0 then
        return p_funcao || ' (' || v_q || '.empresa_id de origem que o comando não prova: ' || v_trecho || ')';
      end if;
      if exists (select 1 from unnest(v_origens) as o where o = any (v_fora)) then
        return p_funcao || ' (' || v_q || '.empresa_id de outra tabela do lote: ' || v_trecho || ')';
      end if;
    end loop;
  end loop;
  return null;
end;
$fn$;

-- =============================================================
-- AS EXCEÇÕES DE LEITURA DA F65, FUNÇÃO A FUNÇÃO (23/09/2026)
-- =============================================================
-- A F65 cria três leituras legítimas de `empresa_id` antes da F66 — integridade e identidade, não recorte: a guarda
-- (`guarda_empresa`, só `new`/`old`), a coerência do termo (`termo_da_empresa`: `termos_gerados`, `movimentacoes`,
-- `ativos`) e a diagonal por empresa (`vocabulario_unidades_guarda`: `filiais`, `unidades_apelidos`). Cada uma pode ler
-- a coluna SÓ das tabelas DELA — a fonte única é `k_leitura_tenant` em catalogo_policies.sql, cada entrada
-- `função:tabela,tabela`. Este despachante aplica o predicado único acima com as tabelas da função (a exceção vale por
-- COMANDO, com a origem provada); as funções fora de `k_leitura_tenant` seguem com as exceções do kit da F64.
create or replace function pg_temp.leitura_de_empresa(
  p_funcao          text,
  p_corpo           text,
  p_lote            text[],
  p_excecoes_kit    text[],
  p_tabelas_kit     text[],
  p_leitura_tenant  text[]
) returns text
language plpgsql
as $fn$
declare
  v_tabelas text;
begin
  select split_part(e, ':', 2) into v_tabelas
    from unnest(p_leitura_tenant) as e
   where split_part(e, ':', 1) = p_funcao;
  if v_tabelas is not null then
    return pg_temp.leitura_de_empresa_do_lote(p_funcao, p_corpo, p_lote, array[p_funcao], string_to_array(v_tabelas, ','));
  end if;
  return pg_temp.leitura_de_empresa_do_lote(p_funcao, p_corpo, p_lote, p_excecoes_kit, p_tabelas_kit);
end;
$fn$;

-- =============================================================
-- O AJUDANTE DE FIXTURE DO TENANT (F65, 23/09/2026)
-- =============================================================
-- `pg_temp.f65_plantar(empresa, marca, autor)` planta UMA linha em cada uma das 20 tabelas de negócio,
-- TODAS com `empresa_id` = a empresa dada, POR EXTENSO (nunca pelo default — o default é a WAP até a F67, e
-- uma fixture da empresa B que o deixasse agir pendurava filho da WAP em pai da B: a FK composta da F65 a
-- recusa, e é isso que ela existe para recusar). Devolve os ids num jsonb, pela chave da tabela.
-- `marca` distingue as duas empresas de um roteiro (nomes, slugs e códigos fictícios: 'f65-<marca>'); o
-- prefixo de patrimônio do import precisa de 2 a 4 maiúsculas e vem de `prefixo`.
-- Quem usa: supabase/tests/imutabilidade_tenant.sql e integridade_tenant.sql (F65). Dados 100% fictícios.
create or replace function pg_temp.f65_plantar(
  p_empresa uuid,
  p_marca   text,
  p_autor   uuid,
  p_prefixo text default 'ZZF'
) returns jsonb
language plpgsql
as $fn$
declare
  v_f     smallint;
  v_tipo  smallint;
  v_item  smallint;
  v_colab uuid;
  v_mot   text := 'f65-' || p_marca;
  v_ativo uuid;
  v_mov   uuid;
  v_pend  uuid;
  v_lanc  uuid;
  v_anot  uuid;
  v_ua    bigint;
  v_log   uuid;
  v_rel   uuid;
  v_termo uuid := gen_random_uuid();
  v_kit   uuid;
  v_senha uuid;
  v_ev    uuid;
begin
  insert into public.filiais (nome, slug, empresa_id)
  values ('F65 Filial ' || p_marca, 'f65-' || p_marca, p_empresa) returning id into v_f;
  insert into public.tipos_item (slug, rotulo, empresa_id)
  values ('f65_' || replace(p_marca, '-', '_'), 'F65 Tipo ' || p_marca, p_empresa) returning id into v_tipo;
  insert into public.itens (nome, grupo, tipo_id, empresa_id)
  values ('F65 Item ' || p_marca, 'acessorio', v_tipo, p_empresa) returning id into v_item;
  insert into public.colaboradores (nome, filial_id, criado_por, empresa_id)
  values ('Fulano F65 ' || p_marca, v_f, p_autor, p_empresa) returning id into v_colab;
  insert into public.motivos (codigo, rotulo, aplica_a, empresa_id)
  values (v_mot, 'F65 motivo ' || p_marca, array['saida']::public.tipo_movimentacao[], p_empresa);
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, empresa_id)
  values (null, 'F65ST' || upper(p_marca), 'notebook', v_f, 'cadastro', p_empresa) returning id into v_ativo;
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por, created_at, empresa_id)
  values (v_ativo, 'compra', current_date - 3, v_f, p_autor, now() - interval '3 days', p_empresa) returning id into v_mov;
  insert into public.pendencias_item (ativo_id, movimentacao_id, item, filial_id, colaborador, empresa_id)
  values (v_ativo, v_mov, 'F65 pendência ' || p_marca, v_f, 'Fulano F65 ' || p_marca, p_empresa) returning id into v_pend;
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, criado_por, empresa_id)
  values (v_item, v_f, 'entrada', 3, current_date, p_autor, p_empresa) returning id into v_lanc;
  insert into public.anotacoes (ativo_id, texto, criado_por, empresa_id)
  values (v_ativo, 'anotação fictícia F65 ' || p_marca, p_autor, p_empresa) returning id into v_anot;
  insert into public.unidades_apelidos (filial_id, apelido, empresa_id)
  values (v_f, 'f65 apelido ' || p_marca, p_empresa) returning id into v_ua;
  insert into public.import_logs (filial_id, modo, arquivo_hash, total_linhas, ativos_criados, movs_apagadas,
                                  anotacoes_apagadas, termos_apagados, backup_path, criado_por, empresa_id)
  values (v_f, 'substituir', 'f65-' || p_marca, 0, 0, 0, 0, 0, 'f65/' || p_marca, p_autor, p_empresa) returning id into v_log;
  insert into public.relatorios_gerados (periodo_de, periodo_ate, filial_id, dados, gerado_por, empresa_id)
  -- o período varia com a marca: duas empresas de um roteiro não colidem no unique implícito (por filial) do snapshot
  -- quando um cenário move o relatório de uma para a filial da outra
  values (current_date - 7 - length(p_marca) - ascii(right(p_marca, 1)), current_date - 1 - length(p_marca) - ascii(right(p_marca, 1)),
          v_f, '{}'::jsonb, p_autor, p_empresa) returning id into v_rel;
  insert into public.termos_gerados (id, tipo, movimentacao_ids, ativo_ids, colaborador, dados, arquivo_path, gerado_por, empresa_id)
  values (v_termo, 'responsabilidade_notebook', array[v_mov], array[v_ativo], 'Fulano F65 ' || p_marca, '{}'::jsonb,
          v_termo::text || '.docx', p_autor, p_empresa);
  insert into public.kits_modelos (nome, payload, criado_por, empresa_id)
  values ('F65 kit ' || p_marca, jsonb_build_object('tipo', 'saida', 'motivo', v_mot), p_autor, p_empresa) returning id into v_kit;
  insert into public.senhas_acesso (rotulo, hash, criado_por, empresa_id)
  values ('F65 senha ' || p_marca, 'f65-hash-ficticio', p_autor, p_empresa) returning id into v_senha;
  insert into public.eventos_admin (acao, empresa_id)
  values ('f65-fixture-' || p_marca, p_empresa) returning id into v_ev;
  insert into public.import_prefixos_patrimonio (prefixo, empresa_id) values (p_prefixo, p_empresa);
  insert into public.import_termos_categoria (termo, categoria, empresa_id) values ('f65 termo ' || p_marca, 'notebook', p_empresa);
  insert into public.import_termos_estado (termo, estado, empresa_id) values ('f65 termo ' || p_marca, 'em_estoque', p_empresa);
  return jsonb_build_object(
    'filiais', v_f, 'tipos_item', v_tipo, 'itens', v_item, 'colaboradores', v_colab, 'motivos', v_mot,
    'ativos', v_ativo, 'movimentacoes', v_mov, 'pendencias_item', v_pend, 'lancamentos_item', v_lanc,
    'anotacoes', v_anot, 'unidades_apelidos', v_ua, 'import_logs', v_log, 'relatorios_gerados', v_rel,
    'termos_gerados', v_termo, 'kits_modelos', v_kit, 'senhas_acesso', v_senha, 'eventos_admin', v_ev,
    'import_prefixos_patrimonio', p_prefixo, 'import_termos_categoria', 'f65 termo ' || p_marca,
    'import_termos_estado', 'f65 termo ' || p_marca);
end;
$fn$;
