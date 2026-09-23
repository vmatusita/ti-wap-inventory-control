-- =============================================================
-- Roteiro de teste: O ISOLAMENTO ENTRE EMPRESAS (F48 → F62)
-- =============================================================
-- O QUE ESTE ARQUIVO É, E O QUE ELE AINDA NÃO É
--
-- F62 (22/09/2026): os cenários A↔B NASCERAM — seção 9, abaixo. A F62 criou a raiz do
-- tenant (`empresas`, `membros`, `plataforma_admins`, `filiais.empresa_id`, o vínculo
-- de escrita por membership) e as QUATRO FUNÇÕES DE CONJUNTO da forma-alvo da MATRIZ
-- (`empresas_do_membro`, `empresas_de_escrita`, `empresas_de_admin`,
-- `unidades_de_escrita`). A empresa A é a WAP (a empresa legada, da migration); a B é
-- FICTÍCIA, criada aqui, com filial própria de slug diferente (o unique global de
-- `filiais.slug` é da F65). Os cenários provam, nas DUAS direções, o que as funções de
-- conjunto e as FKs compostas decidem. ⚠ O QUE AINDA NÃO SE PROVA AQUI: que o ACERVO de A é
-- invisível para B — as policies continuam com o piso (todo logado ativo lê tudo) até a
-- F66/F72. Desde a F63 o acervo TEM `empresa_id` (as oito de `k_lote1`, preenchidas pelo default
-- da WAP), mas NADA a lê: nem policy, nem app, nem este roteiro — ler o dado por empresa é da F66.
--
-- (Texto da F48, mantido como registro:) Hoje existe UMA empresa, e escrever "a empresa A não
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
-- A LINHA QUE ESTE ARQUIVO ESCREVE AOS POUCOS (F62 → F63 → F64)
-- ---------------------------------------------------------------------------
-- A ficha do plano pede, entre as varreduras schema-wide, "nenhuma linha com a chave
-- de recorte nula". Ela é o cenário 9k, iterado sobre o CATÁLOGO pela coluna `empresa_id`
-- (nunca por lista de nomes escrita à mão — `eventos_admin` é exatamente a que uma lista à mão
-- esqueceria): toda tabela de `public` que TEM a coluna tem de tê-la NOT NULL, amarrada por FK
-- à raiz e sem linha nula.
--   · F62 (22/09/2026) — a 9k passou a existir, com `filiais`, `membros` e `operador_filiais`.
--   · F63 (23/09/2026) — a MESMA varredura alcançou sozinha, sem uma linha editada, as oito
--     tabelas do ACERVO (`ativos`, `movimentacoes`, `lancamentos_item`, `pendencias_item`,
--     `anotacoes`, `termos_gerados`, `colaboradores`, `itens` — `k_lote1` em
--     catalogo_policies.sql, que confere a FORMA da coluna no bloco 5). O `count(*) filter
--     (where empresa_id is null)` é conferência de COMPLETUDE, não recorte: ninguém compara a
--     coluna do acervo com um valor de empresa aqui (describe 5 de catalogos-seguranca.test.ts).
--   · O QUE FALTA: a F64 põe a coluna nas 11 tabelas de NEGÓCIO restantes (as sete da ficha e
--     as quatro do vocabulário do import) — a 9k as alcança sozinha também; e a LEITURA do dado
--     do acervo por empresa (o recorte nas policies, a bateria A↔B de leitura) é da F66.
-- O texto da F48 fica como registro: em 07/09/2026 `grep -rn "empresa_id" supabase/migrations/`
-- devolvia ZERO, e escrever um placeholder seria pior do que não escrever — ou erra no psql
-- (coluna inexistente) ou conta zero, e `assert_zero_de` levanta exceção de propósito sobre
-- universo vazio.
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
-- PRIVILÉGIOS DE TABELA — espelho de `papeis_rls.sql:91-146` (do `grant select on` ao `$trava$;`)
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
  public.ativos,            -- 8: o operador de outra filial LÊ o ativo (o piso), mas não escreve
  public.filiais,           -- resolução de filial nas fixtures
  public.profiles,          -- 7: o grant de COLUNA, e a asserção que o mede
  public.membros,           -- 9i: o espelho do projeto hospedado (SELECT sim, escrita não — 0153)
  public.operador_filiais   -- 9i: o UPDATE/DELETE com WHERE precisa de SELECT (espelho do hospedado)
  to authenticated;

-- ESCRITA — só a tabela que alguma asserção tenta escrever.
-- ⚠ `empresas`, `membros` e `plataforma_admins` NÃO entram: no projeto hospedado a
-- migration REVOGOU a escrita de `authenticated` (0152/0153/0154), e conceder aqui mediria
-- um banco que não existe. `operador_filiais` entra porque lá o privilégio padrão CONTINUA
-- (quem recusa é a RLS, sem policy de escrita) — e é essa recusa que 9i prova.
grant insert, update, delete on
  public.ativos,            -- 8: a recusa de UPDATE em filial não vinculada, provada duas vezes
  public.operador_filiais   -- 9i: a recusa pela RLS (nenhuma policy de escrita), provada duas vezes
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
  k_leitura text[] := array['ativos', 'filiais', 'profiles', 'membros', 'operador_filiais'];
  k_escrita text[] := array['ativos', 'operador_filiais'];

  -- =======================================================================
  -- F62 — AS PERSONAS DOS CENÁRIOS A↔B (uuid fixo, prefixo f62a; e-mails de fantasia)
  -- =======================================================================
  k_admin_a    uuid := '00000000-f62a-4000-8000-0000000000a1';  -- admin SÓ em A
  k_oper_b     uuid := '00000000-f62a-4000-8000-0000000000b2';  -- operador SÓ em B, com vínculo
  k_consultor  uuid := '00000000-f62a-4000-8000-0000000000c3';  -- admin em A E consulta em B
  k_inativo    uuid := '00000000-f62a-4000-8000-0000000000d4';  -- membro de A que será desligado
  k_plataforma uuid := '00000000-f62a-4000-8000-0000000000e5';  -- a conta de plataforma
  k_novo       uuid := '00000000-f62a-4000-8000-0000000000f6';  -- só nasce (9l)
  v_emp_a      uuid;
  v_emp_b      uuid;
  v_fb         smallint;
  v_n_fil_a    bigint;
  v_m_cons_a   uuid;
  v_m_cons_b   uuid;
  v_m_oper_b   uuid;
  v_txt        text;
  v_esp        text;
  v_ruins      bigint;
  v_rotulos    text;
  v_estado     text;
  v_restr      text;
  v_antes      text;
  v_depois     text;
  v_refs       bigint;
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
  perform pg_temp.plantar_cargo(k_operador, 'operador');   -- F62: o cargo mora em membros

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

  -- =========================================================================
  -- 9 — F62: OS CENÁRIOS A↔B. Duas empresas: A = a legada (a WAP, da migration) e B,
  -- fictícia, criada aqui. Tudo que o cenário examina é CONTADO como postgres antes
  -- (regra 1 da convenção); toda recusa é provada duas vezes (regra 2); a FK composta,
  -- com o par simétrico (regra 3).
  -- =========================================================================
  v_emp_a := public.empresa_legada();
  insert into public.empresas (slug, nome) values ('f62-iso-b', 'Empresa B do isolamento (F62)')
  returning id into v_emp_b;
  insert into public.filiais (nome, slug, empresa_id)
  values ('F62 Isolamento B Matriz', 'f62-iso-b-matriz', v_emp_b)
  returning id into v_fb;
  select count(*) into v_n_fil_a from public.filiais where empresa_id = v_emp_a;

  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (k_admin_a,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f62.admin.a@wap.ind.br',   '', now(), now(), now()),
    (k_oper_b,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f62.oper.b@wap.ind.br',    '', now(), now(), now()),
    (k_consultor,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f62.consultor@wap.ind.br', '', now(), now(), now()),
    (k_inativo,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f62.inativo@wap.ind.br',   '', now(), now(), now()),
    (k_plataforma, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f62.plataforma@wap.ind.br','', now(), now(), now()),
    (k_novo,       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f62.novo@wap.ind.br',      '', now(), now(), now());

  -- ---------------------------------------------------------------
  -- 9l — (Sabotagem J) A CONTA NOVA NASCE COM A MEMBERSHIP: o handle_new_user (0153) cria,
  --      para cada uma das seis, a membership 'operador' ATIVA na empresa legada. Medido
  --      ANTES de qualquer plantio, como postgres.
  -- ---------------------------------------------------------------
  select count(*) into v_cnt
    from unnest(array[k_admin_a, k_oper_b, k_consultor, k_inativo, k_plataforma, k_novo]) as x(id)
   where not exists (select 1 from public.membros m
                      where m.profile_id = x.id and m.empresa_id = v_emp_a
                        and m.papel = 'operador' and m.ativo);
  if pg_temp.assert_zero_de('9l toda conta nova nasce com a membership operador ATIVA na empresa legada (handle_new_user)',
       v_cnt, 6) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- O plantio (as FIXTURES dos cenários 9a–9k):
  perform pg_temp.plantar_cargo(k_admin_a, 'admin');                          -- admin SÓ em A
  delete from public.membros where profile_id = k_oper_b and empresa_id = v_emp_a;
  perform pg_temp.plantar_cargo(k_oper_b, 'operador', true, v_emp_b);         -- operador SÓ em B
  insert into public.operador_filiais (usuario_id, filial_id) values (k_oper_b, v_fb);
  perform pg_temp.plantar_cargo(k_consultor, 'admin');                        -- admin em A…
  perform pg_temp.plantar_cargo(k_consultor, 'consulta', true, v_emp_b);      -- …e consulta em B
  perform pg_temp.plantar_cargo(k_inativo, 'operador');                       -- ativo, por ora (9e)
  perform pg_temp.plantar_cargo(k_plataforma, 'dev');
  insert into public.plataforma_admins (profile_id) values (k_plataforma);
  select id into v_m_cons_a from public.membros where profile_id = k_consultor and empresa_id = v_emp_a;
  select id into v_m_cons_b from public.membros where profile_id = k_consultor and empresa_id = v_emp_b;
  select id into v_m_oper_b from public.membros where profile_id = k_oper_b and empresa_id = v_emp_b;

  -- O UNIVERSO, contado como postgres (regra 1): as duas empresas, as filiais de cada uma, as
  -- memberships plantadas e o vínculo de B. Sem ele, "viu {A}" poderia ser "não havia B".
  if v_emp_b is not null and v_fb is not null and v_n_fil_a >= 2
     and v_m_cons_a is not null and v_m_cons_b is not null and v_m_oper_b is not null
     and (select count(*) from public.operador_filiais where membro_id = v_m_oper_b and filial_id = v_fb) = 1 then
    v_ok := v_ok + 1;
    raise notice '✓ 9-fixture o universo A↔B foi montado e contado como postgres: 2 empresas, % filiais em A e 1 em B, as memberships e o vínculo de B', v_n_fil_a;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 9-fixture o universo A↔B não montou (B=%, filial B=%, filiais de A=%)', v_emp_b, v_fb, v_n_fil_a;
  end if;

  -- ---------------------------------------------------------------
  -- 9a/9b/9c — AS TRÊS FUNÇÕES DE EMPRESA, pessoa a pessoa, nas duas direções: cada uma
  --      devolve EXATAMENTE as empresas certas (nem a menos, nem a de fora).
  --        empresas_do_membro   : admin_a={A} · oper_b={B} · consultor={A,B} · plataforma={A}
  --        empresas_de_escrita  : admin_a={A} · oper_b={B} · consultor={A}   (consulta não escreve)
  --        empresas_de_admin    : admin_a={A} · oper_b={}  · consultor={A}   (operador não administra)
  -- ---------------------------------------------------------------
  v_ruins := 0; v_rotulos := '';
  for v_txt, v_esp in
    select * from (values
      ('admin_a',    k_admin_a::text),
      ('oper_b',     k_oper_b::text),
      ('consultor',  k_consultor::text),
      ('plataforma', k_plataforma::text)) as p(nome, id)
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_esp, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_estado := array_to_string(array(select x::text from public.empresas_do_membro() x order by 1), ',');
    reset role;
    v_antes := case v_txt
      when 'admin_a' then v_emp_a::text
      when 'oper_b' then v_emp_b::text
      when 'consultor' then array_to_string(array(select x::text from unnest(array[v_emp_a, v_emp_b]) x order by 1), ',')
      else v_emp_a::text end;
    if v_estado is distinct from v_antes then
      v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' ' || v_txt;
    end if;
  end loop;
  if pg_temp.assert_zero_de('9a empresas_do_membro() devolve exatamente as empresas de cada pessoa, nas duas direções' ||
       case when v_ruins > 0 then ' — erradas:' || v_rotulos else '' end, v_ruins, 4) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  v_ruins := 0; v_rotulos := '';
  for v_txt, v_esp in
    select * from (values ('admin_a', k_admin_a::text), ('oper_b', k_oper_b::text), ('consultor', k_consultor::text)) as p(nome, id)
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_esp, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_estado := array_to_string(array(select x::text from public.empresas_de_escrita() x order by 1), ',');
    v_depois := array_to_string(array(select x::text from public.empresas_de_admin() x order by 1), ',');
    reset role;
    if v_estado is distinct from (case v_txt when 'oper_b' then v_emp_b::text else v_emp_a::text end) then
      v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' escrita:' || v_txt || '=' || coalesce(v_estado, '');
    end if;
    if v_depois is distinct from (case v_txt when 'oper_b' then '' else v_emp_a::text end) then
      v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' admin:' || v_txt || '=' || coalesce(v_depois, '');
    end if;
  end loop;
  if pg_temp.assert_zero_de('9b empresas_de_escrita()/empresas_de_admin(): consulta não escreve, operador não administra, nenhuma empresa de fora' ||
       case when v_ruins > 0 then ' —' || v_rotulos else '' end, v_ruins, 6) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ---------------------------------------------------------------
  -- 9d — unidades_de_escrita() NUNCA devolve par de filial de outra empresa. Nas duas
  --      direções: o admin de A recebe EXATAMENTE as filiais de A (e nenhuma de B); o
  --      operador de B recebe EXATAMENTE (B, filial de B); o consultor (consulta em B) recebe
  --      só as de A. E, para os três, nenhum par em que a filial não seja da empresa do par.
  -- ---------------------------------------------------------------
  v_ruins := 0; v_rotulos := '';
  -- admin_a
  perform set_config('request.jwt.claims', json_build_object('sub', k_admin_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*), count(*) filter (where u.empresa_id <> v_emp_a)
    into v_cnt, v_refs from public.unidades_de_escrita() u;
  reset role;
  if v_cnt <> v_n_fil_a or v_refs <> 0 then
    v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' admin_a(' || v_cnt || ' pares, ' || v_refs || ' fora de A)';
  end if;
  -- oper_b
  perform set_config('request.jwt.claims', json_build_object('sub', k_oper_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*), count(*) filter (where not (u.empresa_id = v_emp_b and u.filial_id = v_fb))
    into v_cnt, v_refs from public.unidades_de_escrita() u;
  reset role;
  if v_cnt <> 1 or v_refs <> 0 then
    v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' oper_b(' || v_cnt || ' pares, ' || v_refs || ' fora de (B, filial B))';
  end if;
  -- consultor
  perform set_config('request.jwt.claims', json_build_object('sub', k_consultor, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*), count(*) filter (where u.empresa_id <> v_emp_a)
    into v_cnt, v_refs from public.unidades_de_escrita() u;
  reset role;
  if v_cnt <> v_n_fil_a or v_refs <> 0 then
    v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' consultor(' || v_cnt || ' pares, ' || v_refs || ' fora de A)';
  end if;
  -- e o par nunca é "filial de uma empresa com a outra empresa", para ninguém: os pares são
  -- capturados na sessão da pessoa e conferidos como postgres (que enxerga todas as filiais)
  for v_esp in select unnest(array[k_admin_a, k_oper_b, k_consultor])::text loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_esp, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_estado := (select string_agg(u.empresa_id::text || ':' || u.filial_id::text, ',')
                   from public.unidades_de_escrita() u);
    reset role;
    select count(*) into v_cnt
      from unnest(string_to_array(coalesce(v_estado, ''), ',')) as par(txt)
      join public.filiais f on f.id = split_part(par.txt, ':', 2)::smallint
     where par.txt <> '' and f.empresa_id <> split_part(par.txt, ':', 1)::uuid;
    if v_cnt <> 0 then
      v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' par-cruzado(' || v_esp || ')';
    end if;
  end loop;
  if pg_temp.assert_zero_de('9d unidades_de_escrita() nunca devolve par de filial de outra empresa, nas duas direções' ||
       case when v_ruins > 0 then ' —' || v_rotulos else '' end, v_ruins, 6) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ---------------------------------------------------------------
  -- 9e — (Sabotagem F) O MEMBRO DESATIVADO SOME NO STATEMENT SEGUINTE, na MESMA sessão e
  --      com a MESMA claim (sem token novo): é o que faz a revogação valer no request
  --      seguinte. Antes: {A} e operador; o postgres desliga a membership; depois: {}, NULL.
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', k_inativo, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_antes := coalesce(array_to_string(array(select x::text from public.empresas_do_membro() x), ','), '')
             || '|' || coalesce(public.papel_atual()::text, '∅');
  reset role;
  perform pg_temp.plantar_status(k_inativo, false);
  set local role authenticated;   -- a MESMA claim: nenhum token novo
  v_depois := coalesce(array_to_string(array(select x::text from public.empresas_do_membro() x), ','), '')
              || '|' || coalesce(public.papel_atual()::text, '∅')
              || '|' || (select count(*) from public.unidades_de_escrita())::text;
  reset role;
  if v_antes = v_emp_a::text || '|operador' and v_depois = '|∅|0' then
    v_ok := v_ok + 1;
    raise notice '✓ 9e o membro desativado some no statement seguinte, sem token novo (antes: A e operador; depois: nenhuma empresa, sem cargo, sem unidade)';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 9e a desativação não valeu no statement seguinte: antes=% depois=%', v_antes, v_depois;
  end if;

  -- ---------------------------------------------------------------
  -- 9f — e_plataforma() responde SÓ sobre o chamador (não tem parâmetro): true para a conta
  --      de plataforma; false para as outras quatro e para quem não tem sessão.
  -- ---------------------------------------------------------------
  v_ruins := 0; v_rotulos := '';
  for v_txt, v_esp in
    select * from (values ('plataforma', k_plataforma::text), ('admin_a', k_admin_a::text),
                          ('oper_b', k_oper_b::text), ('consultor', k_consultor::text),
                          ('inativo', k_inativo::text), ('sem sessao', null)) as p(nome, id)
  loop
    perform set_config('request.jwt.claims',
      case when v_esp is null then '' else json_build_object('sub', v_esp, 'role', 'authenticated')::text end, true);
    set local role authenticated;
    v_estado := public.e_plataforma()::text;
    reset role;
    if v_estado is distinct from (case v_txt when 'plataforma' then 'true' else 'false' end) then
      v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' ' || v_txt || '=' || coalesce(v_estado, 'NULL');
    end if;
  end loop;
  if pg_temp.assert_zero_de('9f e_plataforma() responde só sobre o chamador (true só para a conta de plataforma, nunca NULL)' ||
       case when v_ruins > 0 then ' —' || v_rotulos else '' end, v_ruins, 6) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ---------------------------------------------------------------
  -- 9g — A PONTE de papel_atual() é DETERMINÍSTICA para quem tem duas memberships: o
  --      consultor (admin em A, consulta em B) recebe 'admin' — a membership na empresa
  --      LEGADA, nunca "a mais forte" nem "a primeira que o planejador achar"; e quem só tem
  --      membership em B (oper_b) não tem cargo pela ponte (até a F67).
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', k_consultor, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_antes := coalesce(public.papel_atual()::text, '∅') || '/' || coalesce(public.papel_atual()::text, '∅');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', k_oper_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_depois := coalesce(public.papel_atual()::text, '∅');
  reset role;
  if v_antes = 'admin/admin' and v_depois = '∅' then
    v_ok := v_ok + 1;
    raise notice '✓ 9g a ponte responde pela empresa legada: consultor=admin (duas vezes), só-em-B=sem cargo';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 9g a ponte de papel_atual() não é a da empresa legada: consultor=% só-em-B=%', v_antes, v_depois;
  end if;

  -- ---------------------------------------------------------------
  -- 9h — AS FKs COMPOSTAS de operador_filiais, com o PAR SIMÉTRICO (regra 3). Como postgres
  --      (o banco recusa mesmo sem RLS). A recusa tem de vir da CHAVE — o nome da constraint
  --      é conferido —, e o par legítimo, que difere só no ponto em questão, tem de passar.
  -- ---------------------------------------------------------------
  v_ruins := 0; v_rotulos := '';
  -- (1) a membership de B do consultor numa filial de A → a FK de membro recusa
  begin
    insert into public.operador_filiais (empresa_id, membro_id, usuario_id, filial_id)
    values (v_emp_a, v_m_cons_b, k_consultor, v_f1);
    v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' membro-de-B-em-filial-de-A-ACEITO';
  exception when foreign_key_violation then
    get stacked diagnostics v_restr = constraint_name;
    if v_restr <> 'operador_filiais_membro_fk' then
      v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' recusado-por-' || coalesce(v_restr, '?');
    end if;
  end;
  -- (1-par) a membership de A do MESMO consultor na MESMA filial → aceita
  begin
    insert into public.operador_filiais (empresa_id, membro_id, usuario_id, filial_id)
    values (v_emp_a, v_m_cons_a, k_consultor, v_f1);
  exception when others then
    v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' par-legitimo-recusado(' || sqlstate || ')';
  end;
  -- (2) a membership de B do operador, declarada na empresa B, numa filial de A → a FK de filial recusa
  begin
    insert into public.operador_filiais (empresa_id, membro_id, usuario_id, filial_id)
    values (v_emp_b, v_m_oper_b, k_oper_b, v_f1);
    v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' filial-de-A-na-empresa-B-ACEITA';
  exception when foreign_key_violation then
    get stacked diagnostics v_restr = constraint_name;
    if v_restr <> 'operador_filiais_filial_da_empresa_fk' then
      v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' recusado-por-' || coalesce(v_restr, '?');
    end if;
  end;
  -- (2-par) a MESMA membership na filial de B → é o vínculo da fixture (já existe, 1 linha)
  select count(*) into v_cnt from public.operador_filiais where membro_id = v_m_oper_b and filial_id = v_fb;
  if v_cnt <> 1 then
    v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' par-de-B-sumiu';
  end if;
  -- a segunda prova: nada do que foi recusado ficou gravado
  select count(*) into v_cnt from public.operador_filiais
   where (membro_id = v_m_cons_b) or (membro_id = v_m_oper_b and filial_id = v_f1);
  if v_cnt <> 0 then
    v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' recusado-mas-gravado(' || v_cnt || ')';
  end if;
  if pg_temp.assert_zero_de('9h o vínculo com membership ou filial de OUTRA empresa é recusado pelas FKs compostas, com o par simétrico aceito' ||
       case when v_ruins > 0 then ' —' || v_rotulos else '' end, v_ruins, 5) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ---------------------------------------------------------------
  -- 9i — AUTHENTICATED NÃO ESCREVE nas tabelas da raiz, provado DUAS vezes (regra 2).
  --      Quem tenta é o admin de A (o cargo mais forte abaixo do dev). empresas/membros/
  --      plataforma_admins: sem privilégio (revogado pelas migrations); operador_filiais: com
  --      privilégio (o do hospedado) e sem policy de escrita — a RLS recusa.
  -- ---------------------------------------------------------------
  select md5(string_agg(e.id::text || e.slug || e.nome, ',' order by e.id)) || '|' ||
         (select md5(string_agg(m.id::text || m.papel::text || m.ativo::text || m.empresa_id::text, ',' order by m.id)) from public.membros m) || '|' ||
         (select count(*) from public.plataforma_admins)::text || '|' ||
         (select md5(string_agg(o.membro_id::text || o.filial_id::text, ',' order by o.membro_id, o.filial_id)) from public.operador_filiais o)
    into v_antes
    from public.empresas e;

  v_ruins := 0; v_rotulos := '';
  perform set_config('request.jwt.claims', json_build_object('sub', k_admin_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.empresas (slug, nome) values ('f62-iso-invasora', 'Invasora');
        v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' insert-empresas';
  exception when others then null; end;
  begin update public.empresas set nome = 'Invadida' where id = v_emp_b;
        get diagnostics v_cnt = row_count;
        if v_cnt > 0 then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' update-empresas'; end if;
  exception when others then null; end;
  begin update public.membros set papel = 'admin' where profile_id = k_oper_b;
        get diagnostics v_cnt = row_count;
        if v_cnt > 0 then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' update-membros'; end if;
  exception when others then null; end;
  begin insert into public.membros (empresa_id, profile_id, papel) values (v_emp_b, k_admin_a, 'admin');
        v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' insert-membros';
  exception when others then null; end;
  begin delete from public.membros where profile_id = k_oper_b;
        get diagnostics v_cnt = row_count;
        if v_cnt > 0 then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' delete-membros'; end if;
  exception when others then null; end;
  begin insert into public.plataforma_admins (profile_id) values (k_admin_a);
        v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' insert-plataforma';
  exception when others then null; end;
  begin insert into public.operador_filiais (usuario_id, filial_id) values (k_admin_a, v_f1);
        v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' insert-vinculo';
  exception when others then null; end;
  begin delete from public.operador_filiais where membro_id = v_m_oper_b;
        get diagnostics v_cnt = row_count;
        if v_cnt > 0 then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' delete-vinculo'; end if;
  exception when others then null; end;
  reset role;
  if pg_temp.assert_zero_de('9i authenticated não escreve em empresas, membros, plataforma_admins nem operador_filiais (a operação falha)' ||
       case when v_ruins > 0 then ' — passou:' || v_rotulos else '' end, v_ruins, 8) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- a SEGUNDA prova, de volta como postgres: o dado original continua intacto
  select md5(string_agg(e.id::text || e.slug || e.nome, ',' order by e.id)) || '|' ||
         (select md5(string_agg(m.id::text || m.papel::text || m.ativo::text || m.empresa_id::text, ',' order by m.id)) from public.membros m) || '|' ||
         (select count(*) from public.plataforma_admins)::text || '|' ||
         (select md5(string_agg(o.membro_id::text || o.filial_id::text, ',' order by o.membro_id, o.filial_id)) from public.operador_filiais o)
    into v_depois
    from public.empresas e;
  if v_antes = v_depois then
    v_ok := v_ok + 1;
    raise notice '✓ 9i-bis de volta como postgres, empresas/membros/plataforma_admins/operador_filiais estão INTACTAS (a segunda prova da recusa)';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 9i-bis a recusa não foi limpa: o estado das tabelas da raiz mudou (antes % · depois %)', v_antes, v_depois;
  end if;

  -- ---------------------------------------------------------------
  -- 9j/9k — A VARREDURA DAS TABELAS DA F62, sobre o CATÁLOGO (nunca lista escrita à mão):
  --      o universo são as tabelas de public cujo comentário, ou o de alguma coluna, a F62
  --      gravou ('F62 …'). 9j: SEM `force` (R-ACC-29/R-ACC-72; o que o `force` faria
  --      de fato, medido, está em 9o). "RLS ligada" NÃO é conferida aqui: mora em
  --      seguranca_catalogo.sql (asserção 2, para TODA tabela de public — Decisão 2 da F48,
  --      uma fonte por fato). 9k: toda coluna `empresa_id` é NOT NULL, amarrada por FK à
  --      raiz e sem linha nula (universo = as linhas, contadas).
  -- ---------------------------------------------------------------
  select count(*),
         count(*) filter (where c.relforcerowsecurity),
         coalesce(string_agg(c.relname, ', ' order by c.relname)
                    filter (where c.relforcerowsecurity), '')
    into v_refs, v_cnt, v_txt
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (coalesce(obj_description(c.oid, 'pg_class'), '') like 'F62%'
          or exists (select 1 from pg_attribute a
                      where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                        and coalesce(col_description(c.oid, a.attnum), '') like 'F62%'));
  if pg_temp.assert_zero_de('9j as tabelas da F62 (lidas do catálogo) estão SEM force row level security' ||
       case when v_cnt > 0 then ' — fora da regra: ' || v_txt else '' end, v_cnt, v_refs) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  v_ruins := 0; v_rotulos := ''; v_refs := 0;
  for v_txt in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped
     where n.nspname = 'public' and c.relkind = 'r'
     order by 1
  loop
    execute format('select count(*), count(*) filter (where empresa_id is null) from public.%I', v_txt)
      into v_cnt, v_esp;
    v_refs := v_refs + v_cnt;
    if v_esp::bigint > 0
       or not (select a.attnotnull from pg_attribute a
                where a.attrelid = ('public.' || v_txt)::regclass and a.attname = 'empresa_id')
       or not exists (select 1 from pg_constraint k
                       where k.conrelid = ('public.' || v_txt)::regclass and k.contype = 'f'
                         and k.confrelid in ('public.empresas'::regclass, 'public.membros'::regclass,
                                             'public.filiais'::regclass)
                         and (select a.attnum from pg_attribute a
                               where a.attrelid = k.conrelid and a.attname = 'empresa_id') = any (k.conkey)) then
      v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' ' || v_txt;
    end if;
  end loop;
  if pg_temp.assert_zero_de('9k toda coluna empresa_id (lida do catálogo) é NOT NULL, amarrada por FK à raiz e sem linha nula' ||
       case when v_ruins > 0 then ' — fora da regra:' || v_rotulos else '' end, v_ruins, v_refs) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ---------------------------------------------------------------
  -- 9m — (Sabotagem H, no banco) O SLUG DA EMPRESA: reservado e fora do formato são
  --      recusados pelo CHECK; o par legítimo (slug novo, minúsculo) passa. Como postgres
  --      (o CHECK vale para todo mundo).
  -- ---------------------------------------------------------------
  v_ruins := 0; v_rotulos := '';
  foreach v_txt in array array['admin', 'todas', 'relatorios', 'Empresa-C', 'empresa c', '-c'] loop
    begin
      insert into public.empresas (slug, nome) values (v_txt, 'Empresa sabotada (F62)');
      v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' ' || v_txt;
    exception when check_violation then
      null;
    end;
  end loop;
  begin
    insert into public.empresas (slug, nome) values ('f62-iso-c', 'Empresa C do isolamento (F62)');
  exception when others then
    v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' par-legitimo-recusado(' || sqlstate || ')';
  end;
  if pg_temp.assert_zero_de('9m o slug reservado ou fora do formato é recusado pelo CHECK (admin, todas, relatorios, maiúscula, espaço, hífen na ponta), e o legítimo passa' ||
       case when v_ruins > 0 then ' — passou:' || v_rotulos else '' end, v_ruins, 7) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ---------------------------------------------------------------
  -- 9n — (Sabotagem I) O `config` DA EMPRESA SÓ ACEITA OBJETO: escalar, texto, array e
  --      null do jsonb são recusados pelo CHECK; `{}` e um objeto passam.
  -- ---------------------------------------------------------------
  v_ruins := 0; v_rotulos := '';
  foreach v_txt in array array['"texto"', '[]', '42', 'null'] loop
    begin
      update public.empresas set config = v_txt::jsonb where id = v_emp_b;
      v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' ' || v_txt;
    exception when check_violation then
      null;
    end;
  end loop;
  begin
    update public.empresas set config = '{"tema": "claro"}'::jsonb where id = v_emp_b;
  exception when others then
    v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' objeto-recusado(' || sqlstate || ')';
  end;
  if pg_temp.assert_zero_de('9n empresas.config recusa jsonb que não seja objeto ("texto", [], 42, null) e aceita objeto' ||
       case when v_ruins > 0 then ' — passou:' || v_rotulos else '' end, v_ruins, 5) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ---------------------------------------------------------------
  -- 9o — (Sabotagem D, a metade do 42P17) O QUE O `force` FARIA DE FATO. A R-ACC-29 (0070) e
  --      a R-ACC-72 previam 42P17 com `force` em profiles/membros: o dono da tabela passaria
  --      a obedecer a policy, e papel_atual() (definer do mesmo dono) recursaria. MEDIDO NA
  --      F62: não é o "dono ignora RLS" que segura isso, é o ATRIBUTO do dono — no banco
  --      hospedado `postgres` tem BYPASSRLS (conferido no ensaio, 22/09), aqui no CI é
  --      superusuário, e os dois vencem o `force` ("always bypass the row security system").
  --      Este cenário liga o `force` em membros numa subtransação DESFEITA, lê como
  --      authenticated e registra o resultado; e confere a premissa real: toda `security
  --      definer` de public que lê membros tem dono com rolsuper ou rolbypassrls. Se o dono
  --      perder o atributo, a recursão fica possível — com ou sem `force` — e 9o reprova.
  --      O `force` continua proibido (4-bis de catalogo_policies.sql): ele não protege nada
  --      e só muda de comportamento no dia em que o dono mudar.
  -- ---------------------------------------------------------------
  select count(*),
         count(*) filter (where not (r.rolsuper or r.rolbypassrls)),
         coalesce(string_agg(p.proname || '→' || r.rolname, ', ' order by p.proname)
                    filter (where not (r.rolsuper or r.rolbypassrls)), '')
    into v_refs, v_cnt, v_txt
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles r on r.oid = p.proowner
   where n.nspname = 'public' and p.prosecdef and p.prosrc ~* '\mmembros\M';
  v_estado := null;
  begin
    alter table public.membros force row level security;
    perform set_config('request.jwt.claims', json_build_object('sub', k_admin_a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_estado := coalesce(public.papel_atual()::text, '∅') || '/' ||
                (select count(*) from public.membros)::text;
    reset role;
    raise exception 'f62-9o-desfaz';
  exception when others then
    if sqlerrm <> 'f62-9o-desfaz' then
      v_estado := 'erro ' || sqlstate || ': ' || sqlerrm;
    end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice '9o (medição) com force em membros, admin_a leu papel/linhas = % — dono das definer que leem membros ignora RLS por atributo em % de %',
    v_estado, v_refs - v_cnt, v_refs;
  if pg_temp.assert_zero_de('9o o dono das security definer que leem membros ignora RLS por atributo (rolsuper/rolbypassrls), e por isso nem o force produz a recursão prevista' ||
       case when v_cnt > 0 or v_estado like 'erro%' or v_estado is null
            then ' — sem o atributo: ' || v_txt || ' · leitura com force: ' || coalesce(v_estado, '∅') else '' end,
       v_cnt + case when v_estado like 'erro%' or v_estado is null then 1 else 0 end, v_refs) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM isolamento_tenant: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
