-- =============================================================
-- Roteiro de teste: O ARCABOUÇO DO ISOLAMENTO (F48, 07/09/2026)
-- =============================================================
-- O QUE ESTE ARQUIVO É, E O QUE ELE AINDA NÃO É
--
-- Ele é o lugar onde os cenários A↔B do isolamento entre inquilinos vão morar — e
-- eles NASCEM NA F62, não aqui. Hoje existe UMA empresa, e escrever "a empresa A não
-- vê o dado da empresa B" com uma empresa só produziria um ✓ sobre conjunto vazio:
-- falsa segurança, que é o defeito exato que este roteiro existe para não ter.
--
-- O que a F48 entrega é o ARCABOUÇO — as partes que já valem com uma empresa e sem as
-- quais os cenários da F62 seriam escritos sobre areia:
--   · o BLOCO DE GRANTS espelhado de `papeis_rls.sql`, com a trava que o protege;
--   · a CONVENÇÃO DE HONESTIDADE, escrita abaixo e OBEDECIDA pelas asserções;
--   · as asserções sobre o próprio RIG — os papéis, os privilégios e a prova de que
--     "viu zero linhas" quer dizer o que promete.
--
-- ⚠ ESTE ARQUIVO NÃO PODE SER ESQUELETO VAZIO, e a razão é mecânica:
-- `scripts/db/rodar-roteiros.sh` REPROVA roteiro que conte ZERO asserção e roteiro
-- que não emita a linha `FIM`. E `pg_temp.assert_zero_de` LEVANTA EXCEÇÃO sobre
-- universo vazio — um placeholder que contasse zero mataria o bloco antes do `FIM` e
-- o runner reprovaria por ausência da linha. Ou ele nasce com asserções REAIS de
-- universo não-vazio, ou não nasce.
--
-- ---------------------------------------------------------------------------
-- A CONVENÇÃO DE HONESTIDADE — as três regras que todo cenário daqui obedece
-- ---------------------------------------------------------------------------
-- 1. FIXTURE CONTADA COMO `postgres`, ANTES DE QUALQUER "VIU ZERO".
--    `postgres` é superusuário e ignora RLS: contar com ele é contar o universo REAL.
--    Sem esse número, "o atacante viu 0 linhas" é indistinguível de "não havia linha
--    nenhuma para ver" — que é a tautologia que a F45 mediu 58 vezes neste acervo.
--    Na prática: todo "viu zero" deste arquivo passa por `pg_temp.assert_zero_de`, que
--    exige o universo e RECUSA universo vazio.
--
-- 2. TODA RECUSA PROVADA DUAS VEZES.
--    Uma: a operação falha (exceção, ou `row_count = 0`). Duas: DE VOLTA COMO
--    `postgres`, o dado original continua intacto. A primeira metade sozinha não
--    distingue "a policy recusou" de "a policy recusou e um trigger escreveu assim
--    mesmo" — e o repositório TEM triggers `security definer` que escrevem fora de
--    policy (`aplicar_movimentacao`, o da 0051). A segunda metade é a que fecha isso.
--
-- 3. FK COMPOSTA PROVADA COM O PAR SIMÉTRICO.
--    "Recusou" sem o par pode estar recusando por outro motivo — tipo errado, valor
--    nulo, constraint vizinha. O par legítimo, que TEM de passar, é o que prova que a
--    recusa foi da chave e não do acaso. (Sem FK composta hoje; a regra fica escrita
--    porque a F65 acrescenta `(empresa_id, id)` e os cenários dela a herdam.)
--
-- ---------------------------------------------------------------------------
-- A LINHA QUE ESTE ARQUIVO AINDA NÃO PODE ESCREVER
-- ---------------------------------------------------------------------------
-- A ficha do plano pede, entre as varreduras schema-wide, "nenhuma linha com a chave
-- de recorte nula". Ela NÃO é escrevível hoje: a chave é `empresa_id` e ela não
-- existe — `grep -rn "empresa_id" supabase/migrations/` devolve ZERO em 07/09/2026.
-- Escrever um placeholder seria pior do que não escrever: ou erra no psql (coluna
-- inexistente) ou conta zero, e `assert_zero_de` levanta exceção de propósito sobre
-- universo vazio, o roteiro morre antes do `FIM` e o runner reprova.
--
-- A varredura que a F63/F65 vai pôr aqui, para quem chegar depois não ter de inventá-la:
--
--     -- para cada tabela de NEGÓCIO classificada em catalogo_policies.sql:
--     --   select count(*) from public.<tabela> where empresa_id is null
--     -- esperado 0, com o universo = count(*) da tabela (assert_zero_de).
--     -- Iterando pelo CATÁLOGO, nunca por lista de 20 nomes escrita à mão —
--     -- `eventos_admin` é exatamente a que uma lista à mão esqueceria.
--
-- ---------------------------------------------------------------------------
-- ONDE MORAM AS VARREDURAS SCHEMA-WIDE (F48, Decisão 2)
-- ---------------------------------------------------------------------------
-- "Nenhuma tabela de `public` sem RLS" e "nenhuma view sem `security_invoker`" são as
-- asserções 2 e 3 de `supabase/tests/seguranca_catalogo.sql`, e FICAM LÁ. Este arquivo
-- não as repete: duas fontes para o mesmo fato é como um gate morre — a que envelhecer
-- primeiro vira a mentira. Três mutações ativas do injetor miram aqueles dois rótulos,
-- o motivo escrito da remoção da isenção por prefixo (F47) vive no cabeçalho da
-- asserção 2, e o `RELATORIO-F47.md` §6.6 a cita nominalmente. As policies, o Storage
-- e a publication do Realtime estão em `supabase/tests/catalogo_policies.sql`; as
-- funções `security definer`, em `supabase/tests/catalogo_secdef.sql`.
--
-- ESCREVE (cria usuários, perfis, vínculos e ativos fictícios), então roda inteiro
-- dentro de `begin; … rollback;` — nada sobra no banco. DADOS 100% FICTÍCIOS (regra 2
-- do CLAUDE.md): patrimônios `WAP0009xxx`, nomes inventados, e-mails de fantasia.
-- =============================================================

begin;

-- ---------------------------------------------------------------------------
-- PRIVILÉGIOS DE TABELA — espelho de `papeis_rls.sql:92-146`
-- ---------------------------------------------------------------------------
-- Um projeto Supabase HOSPEDADO concede a `anon`/`authenticated` os privilégios de
-- TABELA do schema public por *default privilege*, e nenhuma migration deste repo os
-- concede à mão. O Postgres NOVO do CI **não** reproduz esses defaults, então lá
-- `authenticated` não tem nem SELECT em `public.ativos`.
--
-- ⚠⚠ SEM ESTE BLOCO, "VI ZERO LINHAS" É `permission denied` DISFARÇADO — o roteiro
-- mentindo exatamente onde ele não pode mentir. É por isso que a asserção 3 abaixo
-- MEDE o efeito deste bloco em vez de confiar nele.
--
-- ⚠⚠ E POR ISSO ELE É EXPLÍCITO, TABELA POR TABELA. `grant select on all tables in
-- schema public` é uma bomba de efeito retardado: no dia em que uma fase endurecer
-- alguma tabela por REVOKE de privilégio — o caminho natural para o `hash` de
-- `senhas_acesso` —, o `all tables` devolveria o privilégio dentro da transação, as
-- asserções seguiriam verdes e a divergência com produção só apareceria em runtime.
-- Regra: só entra aqui a tabela/verbo que uma asserção DESTE arquivo realmente usa,
-- e o comentário diz qual.
--
-- Tudo dentro do `begin; … rollback;` — nada persiste. Num banco hospedado estes
-- grants já existem, então o bloco é no-op lá.

-- LEITURA — o que alguma asserção seleciona como `authenticated`.
grant select on
  public.ativos,     -- 8: o operador de outra filial LÊ o ativo (o piso), mas não escreve
  public.filiais,    -- resolução de filial nas fixtures
  public.profiles    -- 7: o grant de COLUNA, e a asserção que o mede
  to authenticated;

-- ESCRITA — só a tabela que alguma asserção tenta escrever.
grant insert, update, delete on
  public.ativos      -- 8: a recusa de UPDATE em filial não vinculada, provada duas vezes
  to authenticated;

-- `profiles`: espelho EXATO do grant da 0063 — nunca `update` de TABELA.
grant update (primeiro_nome, sobrenome) on public.profiles to authenticated;

-- Trava do bloco acima, idêntica em espírito à de `papeis_rls.sql`: se algum dia ele
-- voltar a conceder UPDATE de TABELA em `profiles`, a asserção 7 passaria por engano.
-- Isto falha ALTO, antes de qualquer asserção rodar.
do $trava$
begin
  if exists (
    select 1 from information_schema.table_privileges
     where table_schema = 'public' and table_name = 'profiles'
       and grantee = 'authenticated' and privilege_type = 'UPDATE'
  ) then
    raise exception 'O bloco de grants deste roteiro devolveu UPDATE de TABELA em profiles — a asserção 7 (o grant de coluna) passaria por engano. Conceda coluna por coluna.';
  end if;
end
$trava$;

do $$
declare
  v_ok     int := 0;   -- F45: quantas asserções passaram
  v_falhas int := 0;   -- F45: quantas falharam (a linha FIM soma as duas)

  -- identidades fictícias (uuid fixo, hex válido — o prefixo f48a marca a fase)
  k_operador uuid := '00000000-f48a-4000-8000-0000000000a1';
  v_f1       smallint;
  v_f2       smallint;
  v_cnt      bigint;
  v_univ     bigint;
  v_lista    text;
  v_bypass   boolean;

  -- As tabelas/verbos que o bloco de grants acima concede. As asserções 5 e 6 medem, no
  -- banco, o EFEITO de cada par — é o que impede "vi zero linhas" de ser `permission
  -- denied` disfarçado.
  --
  -- ⚠ A SIMETRIA COM O BLOCO DE GRANTS NÃO É CONFERIDA AQUI, E SIM NA MESA. Uma tabela
  -- concedida lá em cima e esquecida nestes arrays passaria despercebida por estas
  -- asserções — elas varrem os ARRAYS, não o bloco. Quem confere os dois lados é
  -- `src/lib/validators/catalogos-seguranca.test.ts` (describe 9), que lê este arquivo
  -- como TEXTO e compara o bloco `grant … on` com os arrays, nos dois sentidos. Mora lá
  -- porque é conferência do fonte contra si mesmo, e SQL não enxerga o próprio arquivo.
  -- (A primeira versão deste comentário prometia a simetria como se ela existisse aqui;
  -- a revisão adversarial da fase pegou a promessa falsa, e a trava de mesa nasceu dela.)
  k_leitura text[] := array['ativos', 'filiais', 'profiles'];
  k_escrita text[] := array['ativos'];
begin
  -- =========================================================================
  -- FIXTURES (como postgres — antes de qualquer troca de papel).
  -- Regra 1 da convenção: elas são CONTADAS antes de qualquer "viu zero".
  -- =========================================================================
  select id into v_f1 from public.filiais where ativo order by id limit 1;
  select id into v_f2 from public.filiais where ativo and id <> v_f1 order by id limit 1;
  -- Pré-condição, e ela ABORTA de propósito em vez de marcar ✗ e seguir. É a mesma
  -- disciplina de `pg_temp.assert_zero_de` diante de universo vazio: sem duas filiais
  -- o cenário não FALHOU, ele NÃO EXISTIU, e tudo que viesse depois estaria examinando
  -- um mundo que não foi montado. Abortando, o roteiro não emite a linha `FIM` e o
  -- runner reprova por ausência dela — com a mensagem abaixo à vista no log.
  if v_f1 is null or v_f2 is null then
    raise exception 'isolamento_tenant: o banco precisa de ao menos DUAS filiais ativas (o seed das 0007/0026). Sem elas não há recorte para exercitar.';
  end if;

  -- O trigger handle_new_user cria o profile (e exige domínio corporativo — 0041/0057).
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values (k_operador, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'f48.operador@wap.ind.br', '', now(), now(), now());
  update public.profiles set papel = 'operador' where id = k_operador;

  -- Vinculado SÓ à filial 1 — a filial 2 é a "outra empresa" de mentira que o
  -- arcabouço consegue exercitar hoje.
  insert into public.operador_filiais (usuario_id, filial_id) values (k_operador, v_f1);

  -- DOIS ativos na filial NÃO vinculada, com um valor conhecido no campo que a
  -- asserção 8 vai tentar reescrever.
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, modelo)
  values ('WAP0009481', 'F48TST1', 'notebook', v_f2, 'cadastro', 'modelo-original-f48'),
         ('WAP0009482', 'F48TST2', 'notebook', v_f2, 'cadastro', 'modelo-original-f48');

  -- =========================================================================
  -- 1..4 — OS PAPÉIS. Sem estas quatro, todo "viu zero" deste repositório é vazio.
  -- =========================================================================

  -- ---------------------------------------------------------------
  -- 1 — O papel com que ESTE roteiro roda ignora RLS.
  --     É a premissa da regra 1 da convenção: "contei o universo como postgres". Se
  --     ela cair, o universo contado é o que a RLS deixou passar, e todo
  --     `assert_zero_de` deste arquivo estaria comparando o atacante com o atacante.
  -- ---------------------------------------------------------------
  select rolsuper or rolbypassrls into v_bypass from pg_roles where rolname = current_user;
  if coalesce(v_bypass, false) then
    v_ok := v_ok + 1;
    raise notice '✓ 1 o papel do roteiro (%) ignora RLS — contar com ele conta o universo REAL', current_user;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 1 o papel do roteiro (%) NÃO ignora RLS — "contei o universo" é mentira e toda a convenção de honestidade desaba', current_user;
  end if;

  -- ---------------------------------------------------------------
  -- 2 — `authenticated` NÃO ignora RLS.
  --     Se ele ignorasse, todo cenário de RLS deste repositório — os 28 roteiros —
  --     ficaria verde provando nada, porque o "atacante" veria tudo por privilégio de
  --     papel e as policies nunca seriam consultadas.
  -- ---------------------------------------------------------------
  select rolsuper or rolbypassrls into v_bypass from pg_roles where rolname = 'authenticated';
  if v_bypass is null then
    v_falhas := v_falhas + 1;
    raise warning '✗ 2 o papel `authenticated` não existe neste banco';
  elsif not v_bypass then
    v_ok := v_ok + 1;
    raise notice '✓ 2 `authenticated` NÃO ignora RLS — "viu zero linhas" é a policy trabalhando';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2 `authenticated` ganhou bypass de RLS — todo cenário de policy do repositório passou a provar NADA';
  end if;

  -- ---------------------------------------------------------------
  -- 3 — `anon` NÃO ignora RLS. A identidade pré-login é a que a chave pública carrega.
  -- ---------------------------------------------------------------
  select rolsuper or rolbypassrls into v_bypass from pg_roles where rolname = 'anon';
  if v_bypass is null then
    v_falhas := v_falhas + 1;
    raise warning '✗ 3 o papel `anon` não existe neste banco';
  elsif not v_bypass then
    v_ok := v_ok + 1;
    raise notice '✓ 3 `anon` NÃO ignora RLS';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3 `anon` ganhou bypass de RLS — a chave pública passou a ler o acervo inteiro';
  end if;

  -- ---------------------------------------------------------------
  -- 4 — `service_role` IGNORA RLS, e isso é DESENHO, não defeito.
  --     É a premissa escrita em uma dúzia de comentários de migration (0040, 0081…) e
  --     a razão de o trigger `guarda_acervo` (0081) existir: a imutabilidade do acervo
  --     virou TRIGGER justamente porque a mera AUSÊNCIA de policy de UPDATE/DELETE não
  --     segurava o service role. Se esta premissa cair, o raciocínio de todos aqueles
  --     comentários envelheceu em silêncio — e é isso que esta asserção não deixa.
  -- ---------------------------------------------------------------
  select rolsuper or rolbypassrls into v_bypass from pg_roles where rolname = 'service_role';
  if v_bypass is null then
    v_falhas := v_falhas + 1;
    raise warning '✗ 4 o papel `service_role` não existe neste banco';
  elsif v_bypass then
    v_ok := v_ok + 1;
    raise notice '✓ 4 `service_role` ignora RLS (desenho — é a premissa do trigger guarda_acervo da 0081)';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 4 `service_role` perdeu o bypass — a dúzia de comentários de migration que contam com ele ficou obsoleta';
  end if;

  -- =========================================================================
  -- 5..7 — O BLOCO DE GRANTS, MEDIDO. É o que impede "permission denied" disfarçado.
  -- =========================================================================

  -- ---------------------------------------------------------------
  -- 5 — LEITURA concedida a `authenticated` em todas as tabelas listadas.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(t, ', ' order by t), '')
    into v_cnt, v_lista
    from unnest(k_leitura) as t
   where not has_table_privilege('authenticated', 'public.' || t, 'select');
  if pg_temp.assert_zero_de(
       '5 o bloco de grants concedeu LEITURA — sem isso "viu zero" seria permission denied' ||
       case when v_cnt > 0 then ' — sem SELECT: ' || v_lista else '' end,
       v_cnt, array_length(k_leitura, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 6 — ESCRITA concedida a `authenticated` nas tabelas listadas.
  --     Do lado da escrita o disfarce é ainda pior: uma recusa por privilégio ausente
  --     parece uma recusa por policy, e o cenário comemoraria a segurança errada.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(t, ', ' order by t), '')
    into v_cnt, v_lista
    from unnest(k_escrita) as t
   where not (has_table_privilege('authenticated', 'public.' || t, 'insert')
          and has_table_privilege('authenticated', 'public.' || t, 'update')
          and has_table_privilege('authenticated', 'public.' || t, 'delete'));
  if pg_temp.assert_zero_de(
       '6 o bloco de grants concedeu ESCRITA — recusa por privilégio se disfarça de recusa por policy' ||
       case when v_cnt > 0 then ' — sem escrita: ' || v_lista else '' end,
       v_cnt, array_length(k_escrita, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 7 — `profiles`: o grant é de COLUNA, nunca de TABELA (espelho da 0063).
  --     O grant de tabela devolveria o UPDATE completo que a 0063 revogou, e a
  --     asserção de escalada de privilégio (3g de `papeis_rls.sql`) passaria por
  --     engano — o operador conseguiria se promover a admin e o roteiro diria que
  --     está tudo bem. A trava `$trava$` acima já falha alto; esta asserção CONTA o
  --     fato, para que ele apareça no número de asserções e não só num erro.
  -- ---------------------------------------------------------------
  select count(*) into v_cnt
    from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'profiles'
     and grantee = 'authenticated' and privilege_type = 'UPDATE';
  if v_cnt = 0 and has_column_privilege('authenticated', 'public.profiles', 'primeiro_nome', 'update') then
    v_ok := v_ok + 1;
    raise notice '✓ 7 `profiles` recebe UPDATE de COLUNA e não de TABELA (espelho da 0063)';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 7 `profiles`: UPDATE de tabela = % (esperado 0) — a escalada de privilégio passaria por engano', v_cnt;
  end if;

  -- =========================================================================
  -- 8 — A CONVENÇÃO DE HONESTIDADE, EXERCITADA DE PONTA A PONTA.
  --
  -- É o molde LITERAL que os cenários A↔B da F62 vão copiar, rodado hoje sobre o
  -- recorte que já existe (filial). As três metades, na ordem da convenção:
  --   8a — o universo, contado como `postgres` ANTES de qualquer "viu zero";
  --   8b — a operação falha (`row_count = 0`);
  --   8c — DE VOLTA COMO `postgres`, o dado original continua intacto.
  --
  -- Sem 8c, "recusou" e "recusou mas um trigger definer escreveu assim mesmo" são
  -- indistinguíveis — e este banco TEM triggers que escrevem fora de policy.
  --
  --   8d — E A METADE POSITIVA, sem a qual as três de cima não distinguem "a RLS recorta
  --        certo" de "ninguém escreve em `ativos`". Um roteiro que só prove RECUSA fica
  --        VERDE com a escrita inteiramente quebrada — que é a versão do defeito desta
  --        fase aplicada a ela mesma.
  --
  -- ⚠ RELAÇÃO COM `papeis_rls.sql` — o que aqui é duplicata, e o que NÃO é.
  -- Os cenários `2f`/`2g` de lá já provam o par permissão/recusa do UPDATE de `ativos`
  -- por filial, e 8b/8d são de fato o mesmo fato. O que este cenário ACRESCENTA, e é a
  -- razão de ele existir aqui, é **8c**: o `2g` termina em `if found` — ele confere que a
  -- operação não achou linha, e nunca volta como `postgres` para conferir que o dado
  -- original continua intacto. Essa segunda prova é a metade que a convenção de
  -- honestidade deste arquivo exige, e é o molde que os cenários A↔B da F62 vão copiar
  -- inteiro. Se um dia alguém unificar os dois, que seja por decisão escrita — e que a
  -- segunda prova sobreviva à unificação.
  -- =========================================================================
  select count(*) into v_univ
    from public.ativos where filial_id = v_f2 and modelo = 'modelo-original-f48';
  if v_univ = 2 then
    v_ok := v_ok + 1;
    raise notice '✓ 8a o universo foi contado como postgres ANTES do ataque (% linhas na filial não vinculada)', v_univ;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 8a a fixture não montou: esperava 2 ativos na filial %, contei %', v_f2, v_univ;
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  update public.ativos set modelo = 'invadido-f48'
   where filial_id = v_f2 and modelo = 'modelo-original-f48';
  get diagnostics v_cnt = row_count;

  reset role;

  -- ⚠ Pela ferramenta, e NÃO por `if v_cnt = 0 then ✓`: `row_count` zero também é o que
  -- sairia se a fixture não tivesse montado. `assert_zero_de` recebe o universo contado
  -- em 8a e RECUSA universo vazio — é a diferença entre "recusou" e "não havia nada".
  if pg_temp.assert_zero_de(
       '8b a operação FALHOU: operador não reescreveu ativo de filial não vinculada',
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- A SEGUNDA PROVA, de volta como postgres: o dado original continua lá.
  select count(*) into v_cnt
    from public.ativos where filial_id = v_f2 and modelo <> 'modelo-original-f48';
  if pg_temp.assert_zero_de(
       '8c de volta como postgres, o dado original continua INTACTO (a segunda prova da recusa)',
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- 8d — A METADE POSITIVA. O MESMO operador, na filial em que ELE escreve.
  -- Sem ela, 8a/8b/8c ficariam verdes num banco em que ninguém escreve em `ativos` — e o
  -- arcabouço estaria provando "está tudo trancado", não "o recorte recorta".
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, modelo)
  values ('WAP0009483', 'F48TST3', 'notebook', v_f1, 'cadastro', 'modelo-original-f48');

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);

  update public.ativos set modelo = 'editado-pelo-operador-f48'
   where filial_id = v_f1 and patrimonio = 'WAP0009483';
  get diagnostics v_cnt = row_count;

  reset role;

  if v_cnt = 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 8d o MESMO operador ESCREVE na filial VINCULADA (1 linha) — o recorte recorta, não tranca tudo';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 8d o operador não escreveu na filial VINCULADA (% linhas de 1) — 8b/8c passariam por escrita quebrada, não por recorte', v_cnt;
  end if;

  raise notice 'FIM isolamento_tenant: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
