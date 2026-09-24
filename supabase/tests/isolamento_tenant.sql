-- =============================================================
-- Roteiro de teste: O ISOLAMENTO ENTRE EMPRESAS (F48 → F66)
-- =============================================================
-- O QUE ESTE ARQUIVO É, E O QUE ELE AINDA NÃO É
--
-- F62 (22/09/2026): os cenários A↔B NASCERAM — seção 9, abaixo. A F62 criou a raiz do
-- tenant (`empresas`, `membros`, `plataforma_admins`, `filiais.empresa_id`, o vínculo
-- de escrita por membership) e as QUATRO FUNÇÕES DE CONJUNTO da forma-alvo da MATRIZ
-- (`empresas_do_membro`, `empresas_de_escrita`, `empresas_de_admin`,
-- `unidades_de_escrita`). A empresa A é a WAP (a empresa legada, da migration); a B é
-- FICTÍCIA, criada aqui, com filial própria de slug diferente (desde a F65 o slug é único POR
-- EMPRESA, e o diferente fica: não é disso que este roteiro trata). Os cenários provam, nas DUAS
-- direções, o que as funções de conjunto e as FKs compostas decidem. (Até a F65 este parágrafo dizia que
-- NADA lia o acervo por empresa — nem policy, nem app, nem este roteiro. A F66 mudou a primeira e a
-- terceira; o app segue sem recortar, e isso é da F67/F70.)
--
-- F65 (23/09/2026) — A CAMADA ESTRUTURAL. O que a F65 entregou: as FKs entre tabelas de negócio são
-- COMPOSTAS `(empresa_id, x) → (empresa_id, id)` (o filho da A não aponta para o pai da B), os uniques
-- de negócio são POR EMPRESA, a empresa de um registro NÃO MUDA (a guarda nas 20, sem exceção para a
-- janela destrutiva), a diagonal nome × apelido é por empresa e o termo só cita o que é da empresa
-- dele. A prova mora em `integridade_tenant.sql` (com o par simétrico de cada FK composta, a regra 3
-- abaixo) e nas três travas de catálogo (`forma_multiempresa`, `unicidade_por_empresa`,
-- `imutabilidade_tenant`).
--
-- F66 (24/09/2026) — A LEITURA RECORTADA, EM CONJUNÇÃO COM O PISO. As 51 policies de `public` cuja tabela
-- tem `empresa_id` citam o termo de empresa com a função de conjunto da classe (`empresas_do_membro`,
-- `empresas_de_escrita`, `empresas_de_admin`), em AND com o piso de hoje, e as seis de escrita por unidade
-- conferem o PAR `(empresa_id, filial_id)` contra `unidades_de_escrita()`. As seções 10 e 11, abaixo, provam
-- a LEITURA entre empresas pela primeira vez, sobre o CATÁLOGO (toda tabela com a coluna e policy de SELECT):
--   · direção A, com as policies REAIS — o membro só da B não vê a linha da A (o termo de empresa corta,
--     mesmo com o piso deixando passar);
--   · direção B, com o piso NEUTRALIZADO dentro da transação — o termo SOZINHO corta o membro só da A, que é
--     a emulação do que a F72 vai deixar no ar; e o membro das duas vê as duas;
--   · a escrita cruzada recusada (e o dado intacto como `postgres`), e o par de unidade nas duas direções.
-- A conjunção quer dizer que NADA ficou mais aberto: quem via antes vê o mesmo ou menos, e na WAP (uma
-- empresa só) exatamente o mesmo — a prova conta a conta nos dois bancos fica na evidência da fase.
-- O que falta, na ordem: a ponte `papel_atual()` e a escrita por empresa (`e_admin`/`pode_escrever` por
-- empresa, Storage, Realtime, as guardas F52) é da F67; tirar o piso das policies de leitura é da F72;
-- `profiles` (a tabela sem `empresa_id`, com as suas duas policies de exceção) é da F69.
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
--    recusa foi da chave e não do acaso. (Desde a F65 as FKs de negócio SÃO compostas, e os
--    cenários D1/D2 de `integridade_tenant.sql` provam cada uma com o par: o filho da A no pai
--    da B recusado, o filho da B no pai da B aceito, o dado da A intacto.)
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
--   · F64 (23/09/2026) — a MESMA varredura alcançou sozinha, de novo sem uma linha editada, as
--     ONZE tabelas de negócio que faltavam (`k_lote2` em catalogo_policies.sql: as sete da ficha —
--     `tipos_item`, `motivos`, `kits_modelos`, `senhas_acesso`, `eventos_admin`, `import_logs`,
--     `relatorios_gerados` — e as quatro do vocabulário do import — `import_prefixos_patrimonio`,
--     `import_termos_categoria`, `import_termos_estado`, `unidades_apelidos`). Com elas, as 20 de
--     `k_negocio` têm a chave de recorte, e o bloco 5 de catalogo_policies.sql REPROVA a tabela de
--     negócio sem ela (15f). A única leitura da coluna antes da F66 é de integridade — o motivo do
--     kit na empresa do kit (`k_leitura_integridade`) —, e não acontece aqui.
--   · O QUE FALTA: a LEITURA do dado por empresa — o recorte nas policies das 20, a bateria A↔B
--     de leitura — é da F66 (e a escrita por empresa, da F67).
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
-- F66: a bateria de leitura (seção 10) lê como `authenticated` TODA tabela de public com `empresa_id` e policy de
-- SELECT — as 21 (as 19 de negócio com policy, `membros` e `operador_filiais`); `senhas_acesso` (deny-all) não entra.
grant select on
  public.ativos,            -- 8: o operador de outra filial LÊ o ativo (o piso), mas não escreve; 10, 11
  public.filiais,           -- resolução de filial nas fixtures; 10
  public.profiles,          -- 7: o grant de COLUNA, e a asserção que o mede
  public.membros,           -- 9i: o espelho do projeto hospedado (SELECT sim, escrita não — 0153); 10
  public.operador_filiais,  -- 9i: o UPDATE/DELETE com WHERE precisa de SELECT (espelho do hospedado); 10
  public.anotacoes,         -- 10 (a leitura A↔B), 10f (a escrita cruzada)
  public.colaboradores,     -- 10, 10f
  public.eventos_admin,     -- 10
  public.import_logs,       -- 10
  public.import_prefixos_patrimonio, -- 10
  public.import_termos_categoria,    -- 10
  public.import_termos_estado,       -- 10
  public.itens,             -- 10
  public.kits_modelos,      -- 10
  public.lancamentos_item,  -- 10
  public.motivos,           -- 10, 10f, 10h (o join das rel_*)
  public.movimentacoes,     -- 10, 10h, 11c
  public.pendencias_item,   -- 10
  public.relatorios_gerados, -- 10
  public.termos_gerados,    -- 10
  public.tipos_item,        -- 10, 10f
  public.unidades_apelidos  -- 10
  to authenticated;

-- ESCRITA — só a tabela que alguma asserção tenta escrever.
-- ⚠ `empresas`, `membros` e `plataforma_admins` NÃO entram: no projeto hospedado a
-- migration REVOGOU a escrita de `authenticated` (0152/0153/0154), e conceder aqui mediria
-- um banco que não existe. `operador_filiais` entra porque lá o privilégio padrão CONTINUA
-- (quem recusa é a RLS, sem policy de escrita) — e é essa recusa que 9i prova.
grant insert, update, delete on
  public.ativos,            -- 8: a recusa de UPDATE em filial não vinculada, provada duas vezes; 10f, 11
  public.operador_filiais,  -- 9i: a recusa pela RLS (nenhuma policy de escrita), provada duas vezes
  public.colaboradores,     -- 10f: a escrita cruzada (nível de empresa e de admin)
  public.tipos_item,        -- 10f
  public.anotacoes,         -- 10f
  public.motivos,           -- 10f
  public.movimentacoes      -- 11c: o snapshot — a filial real do ativo, pelos pares
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
  k_leitura text[] := array['ativos', 'filiais', 'profiles', 'membros', 'operador_filiais', 'anotacoes', 'colaboradores',
                            'eventos_admin', 'import_logs', 'import_prefixos_patrimonio', 'import_termos_categoria',
                            'import_termos_estado', 'itens', 'kits_modelos', 'lancamentos_item', 'motivos', 'movimentacoes',
                            'pendencias_item', 'relatorios_gerados', 'termos_gerados', 'tipos_item', 'unidades_apelidos'];
  k_escrita text[] := array['ativos', 'operador_filiais', 'colaboradores', 'tipos_item', 'anotacoes', 'motivos', 'movimentacoes'];

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

  -- =======================================================================
  -- F66 — A BATERIA DE LEITURA E DE ESCRITA ENTRE EMPRESAS (seções 10 e 11; prefixo f66a nos uuids)
  -- =======================================================================
  k_admin_b    uuid := '00000000-f66a-4000-8000-0000000000b7';  -- admin SÓ em B (a direção B, com o piso neutralizado)
  v_pa         jsonb;       -- a fixture da A (uma linha em cada uma das 20 de negócio — pg_temp.f65_plantar)
  v_pb         jsonb;       -- a fixture da B
  v_tab        record;
  v_n_tab      int;
  v_ua         bigint;      -- linhas da A (contadas como postgres)
  v_ub         bigint;      -- linhas da B (contadas como postgres)
  v_sa         bigint;      -- linhas da A que a pessoa VIU
  v_sb         bigint;      -- linhas da B que a pessoa VIU
  v_tot_ua     bigint;
  v_tot_ub     bigint;
  v_viu_b      bigint;
  v_viu_a      bigint;
  v_tabs_erro  text;
  v_pol        record;
  v_expr       text;
  v_neutras    int;
  v_estado2    text;
  v_fdes       smallint;    -- uma filial DESATIVADA da A
  v_mot_par    text := 'f66-iso-par';
  v_md5_b0     text;
  v_md5_b1     text;
  v_sqlstate   text;
  v_soma       bigint;
  v_t_tabs     text[] := '{}';   -- as tabelas da bateria (do catálogo)
  v_t_adm      boolean[] := '{}'; -- a leitura dela é de CARGO (o piso `e_admin()`)
  v_t_ua       bigint[] := '{}';
  v_t_ub       bigint[] := '{}';
  v_k          int;
  v_uid_p      uuid;
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

  -- [bateria-f66:início]
  -- =========================================================================
  -- 10 — F66 (24/09/2026): A LEITURA ENTRE EMPRESAS, sobre o CATÁLOGO.
  --
  -- O universo é toda tabela de `public` com `empresa_id` e policy de SELECT — lida do catálogo, nunca de lista (as 21
  -- de hoje: as 19 de negócio com policy, `membros` e `operador_filiais`; `senhas_acesso` é deny-all). A fixture planta
  -- UMA linha em cada uma das 20 de negócio na A (a WAP) e na B (fictícia), com `empresa_id` por extenso
  -- (`pg_temp.f65_plantar`, _asserts.sql), e é CONTADA como postgres antes de qualquer "viu zero" (regra 1).
  --
  -- O QUE CADA CENÁRIO PROVA, E O QUE NÃO PROVA:
  --   10a/10b — DIREÇÃO A, com as policies REAIS: o admin só da A vê TODA linha da A e NENHUMA da B. Prova o recorte da
  --             conjunção (o piso passa para ele; é o termo de empresa que tira a B).
  --   10c/10d — DIREÇÃO B, com o PISO NEUTRALIZADO dentro de uma subtransação desfeita: cada policy de SELECT das tabelas
  --             da bateria perde o piso (`papel_atual()`/`e_admin()` vira `true` no texto que o próprio catálogo devolve)
  --             e fica SÓ com o termo de empresa que a migration escreveu — o estado que a F72 vai deixar. O admin só da
  --             B vê toda linha da B e nenhuma da A. Prova que o recorte SOZINHO isola nas duas direções (decisão 7 do
  --             PLAN-F66: emular a F72, e não a F67 — neutralizar o piso testa o termo REAL de cada policy; emular a
  --             ponte inventaria um `papel_atual()` que nenhuma fase vai ter). O `alter policy` é DDL dinâmico DENTRO
  --             desta transação de roteiro — fora de supabase/migrations/, invisível ao replay da mesa e ao universo
  --             congelado (10a/10b de catalogo_policies.sql rodam em outra sessão), e desfeito pelo `raise` da
  --             subtransação antes da asserção seguinte.
  --   10e     — A PONTE (declarada, NÃO é prova do recorte): com as policies reais, quem é só da B não vê NADA — o piso
  --             de hoje (`papel_atual()` responde só pela empresa legada) fecha tudo. A F67 tira a ponte e inverte isto.
  --   10f     — O MEMBRO DAS DUAS (admin na A, consulta na B), com as policies reais: vê as duas nas tabelas de leitura
  --             pelo piso; nas de leitura por CARGO (auditoria, trilha do import), só a A — ele não administra a B.
  --   10g/10h — A ESCRITA CRUZADA: o admin da A (e o membro das duas) inserindo com `empresa_id` da B — com pais da B,
  --             para a FK composta não ser quem recusa — leva 42501 pelo WITH CHECK; atualizando ou apagando linha da
  --             B, afeta 0 linhas; de volta como postgres, a B está intacta (regra 2); e o par legítimo (a mesma escrita
  --             na A) passa. 10h: sem o termo no WITH CHECK, a mesma escrita cruzada PASSA — quem recusou foi o recorte.
  --             A escrita da direção B (a pessoa da B escrevendo) depende da ponte e é da F67.
  --   10i/10j — O JOIN DAS rel_*: duas empresas com o MESMO código de motivo; para o membro das duas, o relatório por
  --             motivo e o resumo não duplicam (0179). Sem o par no join, duplicam (10j, a prova de que o cenário acusa).
  -- ⚠ Nenhum cenário aqui prova o Storage, o Realtime nem as `security definer` (F67) — nem `profiles` (F69).
  -- =========================================================================
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (k_admin_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f66.admin.b@wap.ind.br',
          '', now(), now(), now());
  delete from public.membros where profile_id = k_admin_b and empresa_id = v_emp_a;
  perform pg_temp.plantar_cargo(k_admin_b, 'admin', true, v_emp_b);                -- admin SÓ em B
  v_pa := pg_temp.f65_plantar(v_emp_a, 'f66-iso-a', k_admin_a, 'ZZA');
  v_pb := pg_temp.f65_plantar(v_emp_b, 'f66-iso-b', k_admin_a, 'ZZB');

  -- as tabelas da bateria, do catálogo, e o universo de cada uma (como postgres)
  for v_tab in
    select c.relname::text as tabela, bool_or(coalesce(p.qual, '') ~ '\me_admin\M') as de_cargo
      from pg_policies p
      join pg_class c on c.relname = p.tablename and c.relnamespace = 'public'::regnamespace
     where p.schemaname = 'public' and p.cmd in ('SELECT', 'ALL')
       and exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped)
     group by c.relname
     order by 1
  loop
    execute format('select count(*) filter (where empresa_id = $1), count(*) filter (where empresa_id = $2) from public.%I',
                   v_tab.tabela) into v_ua, v_ub using v_emp_a, v_emp_b;
    v_t_tabs := v_t_tabs || v_tab.tabela;
    v_t_adm := v_t_adm || v_tab.de_cargo;
    v_t_ua := v_t_ua || v_ua;
    v_t_ub := v_t_ub || v_ub;
  end loop;
  v_n_tab := coalesce(array_length(v_t_tabs, 1), 0);
  select coalesce(sum(x), 0) into v_tot_ua from unnest(v_t_ua) as x;
  select coalesce(sum(x), 0) into v_tot_ub from unnest(v_t_ub) as x;
  select count(*), coalesce(string_agg(t, ', '), '')
    into v_cnt, v_lista
    from unnest(v_t_tabs, v_t_ua, v_t_ub) as u(t, a, b) where a = 0 or b = 0;
  if pg_temp.assert_zero_de('10-fixture o universo da bateria foi montado e contado como postgres: toda tabela de public com empresa_id e policy de SELECT tem linha na A e na B' ||
       case when v_cnt > 0 then ' — sem linha numa das empresas: ' || v_lista else '' end, v_cnt, v_n_tab) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  raise notice '(medição) 10 a bateria: % tabelas do catálogo, % linhas da A e % da B', v_n_tab, v_tot_ua, v_tot_ub;

  -- 10a/10b — DIREÇÃO A, as policies reais: o admin só da A
  v_viu_a := 0; v_viu_b := 0; v_tabs_erro := ''; v_estado := null;
  perform set_config('request.jwt.claims', json_build_object('sub', k_admin_a, 'role', 'authenticated')::text, true);
  for v_k in 1 .. v_n_tab loop
    set local role authenticated;
    execute format('select count(*) filter (where empresa_id = $1), count(*) filter (where empresa_id = $2) from public.%I',
                   v_t_tabs[v_k]) into v_sa, v_sb using v_emp_a, v_emp_b;
    reset role;
    v_viu_b := v_viu_b + v_sb;
    if v_sb > 0 then
      v_tabs_erro := v_tabs_erro || ' ' || v_t_tabs[v_k] || '(' || v_sb || ' da B)';
    end if;
    if v_sa <> v_t_ua[v_k] then
      v_viu_a := v_viu_a + 1;
      v_estado := coalesce(v_estado, '') || ' ' || v_t_tabs[v_k] || '(' || v_sa || ' de ' || v_t_ua[v_k] || ' da A)';
    end if;
  end loop;
  if pg_temp.assert_zero_de('10a direção A: o admin só da A não vê NENHUMA linha da B, em nenhuma tabela com empresa_id (as policies reais)' ||
       case when v_viu_b > 0 then ' — viu:' || v_tabs_erro else '' end, v_viu_b, v_tot_ub) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('10b direção A: o admin só da A vê TODA linha da A (o recorte não tranca a própria empresa)' ||
       case when v_viu_a > 0 then ' — faltou:' || v_estado else '' end, v_viu_a, v_n_tab) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_estado := null;

  -- 10c/10d — DIREÇÃO B, com o piso NEUTRALIZADO numa subtransação desfeita (o estado que a F72 vai deixar)
  v_estado2 := null; v_neutras := 0; v_viu_a := 0; v_viu_b := 0; v_tabs_erro := ''; v_antes := '';
  begin
    for v_pol in
      select p.polname, c.relname::text as tabela, pg_get_expr(p.polqual, p.polrelid) as qual
        from pg_policy p join pg_class c on c.oid = p.polrelid
       where c.relnamespace = 'public'::regnamespace and p.polcmd in ('r', '*') and c.relname::text = any (v_t_tabs)
    loop
      v_expr := replace(replace(v_pol.qual, '(( SELECT papel_atual() AS papel_atual) IS NOT NULL)', 'true'),
                        '( SELECT e_admin() AS e_admin)', 'true');
      if v_expr = v_pol.qual or v_expr ~ '\m(papel_atual|e_admin)\(' then
        raise exception 'f66-10c-piso-nao-neutralizado % / %', v_pol.tabela, v_pol.polname;
      end if;
      execute format('alter policy %I on public.%I using (%s)', v_pol.polname, v_pol.tabela, v_expr);
      v_neutras := v_neutras + 1;
    end loop;
    perform set_config('request.jwt.claims', json_build_object('sub', k_admin_b, 'role', 'authenticated')::text, true);
    for v_k in 1 .. v_n_tab loop
      set local role authenticated;
      execute format('select count(*) filter (where empresa_id = $1), count(*) filter (where empresa_id = $2) from public.%I',
                     v_t_tabs[v_k]) into v_sa, v_sb using v_emp_a, v_emp_b;
      reset role;
      v_viu_a := v_viu_a + v_sa;
      if v_sa > 0 then v_tabs_erro := v_tabs_erro || ' ' || v_t_tabs[v_k] || '(' || v_sa || ' da A)'; end if;
      if v_sb <> v_t_ub[v_k] then
        v_viu_b := v_viu_b + 1;
        v_antes := v_antes || ' ' || v_t_tabs[v_k] || '(' || v_sb || ' de ' || v_t_ub[v_k] || ' da B)';
      end if;
    end loop;
    raise exception 'f66-10c-desfaz';
  exception when others then
    if sqlerrm <> 'f66-10c-desfaz' then v_estado2 := 'erro ' || sqlstate || ': ' || sqlerrm; end if;
  end;
  reset role;
  raise notice '(medição) 10c o piso neutralizado em % policies de SELECT, na subtransação desfeita (%)', v_neutras,
    coalesce(v_estado2, 'sem erro');
  if pg_temp.assert_zero_de('10c direção B, com o piso neutralizado (o recorte SOZINHO): o admin só da B não vê NENHUMA linha da A' ||
       case when v_viu_a > 0 or v_estado2 is not null then ' — viu:' || v_tabs_erro || ' ' || coalesce(v_estado2, '') else '' end,
       v_viu_a + case when v_estado2 is not null then 1 else 0 end, v_tot_ua) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('10d direção B, com o piso neutralizado: o admin só da B vê TODA linha da B, e o piso saiu de toda policy de SELECT da bateria' ||
       case when v_viu_b > 0 or v_estado2 is not null or v_neutras < v_n_tab then ' — faltou:' || v_antes || ' (' || v_neutras || ' policies neutralizadas de ' || v_n_tab || ' tabelas) ' || coalesce(v_estado2, '') else '' end,
       v_viu_b + case when v_estado2 is not null or v_neutras < v_n_tab then 1 else 0 end, v_n_tab) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  v_antes := null;

  -- 10e — A PONTE (declarada, não é prova do recorte): com as policies reais, quem é só da B não vê nada
  v_soma := 0;
  perform set_config('request.jwt.claims', json_build_object('sub', k_admin_b, 'role', 'authenticated')::text, true);
  for v_k in 1 .. v_n_tab loop
    set local role authenticated;
    execute format('select count(*) from public.%I where empresa_id in ($1, $2)', v_t_tabs[v_k]) into v_cnt using v_emp_a, v_emp_b;
    reset role;
    v_soma := v_soma + v_cnt;
  end loop;
  if pg_temp.assert_zero_de('10e a ponte: com as policies reais, quem é só da B não vê nada — o piso de hoje responde só pela empresa legada (a F67 tira a ponte; isto NÃO prova o recorte)',
       v_soma, v_tot_ua + v_tot_ub) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 10f — O MEMBRO DAS DUAS, com as policies reais (admin na A, consulta na B)
  v_viu_b := 0; v_tabs_erro := '';
  perform set_config('request.jwt.claims', json_build_object('sub', k_consultor, 'role', 'authenticated')::text, true);
  for v_k in 1 .. v_n_tab loop
    set local role authenticated;
    execute format('select count(*) filter (where empresa_id = $1), count(*) filter (where empresa_id = $2) from public.%I',
                   v_t_tabs[v_k]) into v_sa, v_sb using v_emp_a, v_emp_b;
    reset role;
    if v_sa <> v_t_ua[v_k] or v_sb <> (case when v_t_adm[v_k] then 0 else v_t_ub[v_k] end) then
      v_viu_b := v_viu_b + 1;
      v_tabs_erro := v_tabs_erro || ' ' || v_t_tabs[v_k] || '(A ' || v_sa || '/' || v_t_ua[v_k] || ', B ' || v_sb || '/'
                     || (case when v_t_adm[v_k] then 0 else v_t_ub[v_k] end) || ')';
    end if;
  end loop;
  if pg_temp.assert_zero_de('10f o membro das duas vê as duas nas tabelas de leitura pelo piso, e só a A nas de leitura por cargo (ele consulta a B, não a administra)' ||
       case when v_viu_b > 0 then ' — diferente:' || v_tabs_erro else '' end, v_viu_b, v_n_tab) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 10g — A ESCRITA CRUZADA, provada duas vezes (regra 2), com o par legítimo
  insert into public.motivos (codigo, rotulo, aplica_a, empresa_id)
  values (v_mot_par, 'F66 motivo do par', array['saida']::public.tipo_movimentacao[], v_emp_a);
  select md5(string_agg(x, ',' order by x)) into v_md5_b0
    from (select to_jsonb(c)::text as x from public.colaboradores c where c.empresa_id = v_emp_b
          union all select to_jsonb(a)::text from public.ativos a where a.empresa_id = v_emp_b
          union all select to_jsonb(m)::text from public.motivos m where m.empresa_id = v_emp_b
          union all select to_jsonb(t)::text from public.tipos_item t where t.empresa_id = v_emp_b
          union all select to_jsonb(n)::text from public.anotacoes n where n.empresa_id = v_emp_b) as s;
  v_ruins := 0; v_rotulos := '';
  perform set_config('request.jwt.claims', json_build_object('sub', k_admin_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.colaboradores (nome, filial_id, criado_por, empresa_id)
        values ('Fulano F66 cruzado', (v_pb->>'filiais')::smallint, k_admin_a, v_emp_b);
        v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' insert-colaborador';
  exception when insufficient_privilege then null;
            when others then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' insert-colaborador(' || sqlstate || ')'; end;
  begin insert into public.tipos_item (slug, rotulo, empresa_id) values ('f66_cruzado', 'F66 Tipo cruzado', v_emp_b);
        v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' insert-tipo';
  exception when insufficient_privilege then null;
            when others then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' insert-tipo(' || sqlstate || ')'; end;
  begin insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, empresa_id)
        values ('WAP0009661', 'F66CRUZ1', 'notebook', (v_pb->>'filiais')::smallint, 'cadastro', v_emp_b);
        v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' insert-ativo';
  exception when insufficient_privilege then null;
            when others then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' insert-ativo(' || sqlstate || ')'; end;
  begin insert into public.anotacoes (ativo_id, texto, criado_por, empresa_id)
        values ((v_pb->>'ativos')::uuid, 'anotação cruzada F66', k_admin_a, v_emp_b);
        v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' insert-anotacao';
  exception when insufficient_privilege then null;
            when others then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' insert-anotacao(' || sqlstate || ')'; end;
  update public.colaboradores set nome = 'Invadido F66' where id = (v_pb->>'colaboradores')::uuid;
  get diagnostics v_cnt = row_count;
  if v_cnt > 0 then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' update-colaborador'; end if;
  update public.ativos set modelo = 'invadido-f66' where id = (v_pb->>'ativos')::uuid;
  get diagnostics v_cnt = row_count;
  if v_cnt > 0 then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' update-ativo'; end if;
  delete from public.motivos where empresa_id = v_emp_b and codigo = v_pb->>'motivos';
  get diagnostics v_cnt = row_count;
  if v_cnt > 0 then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' delete-motivo'; end if;
  reset role;
  -- o membro das duas (admin na A, consulta na B): a quebra clássica "confere o papel e esquece o tenant"
  perform set_config('request.jwt.claims', json_build_object('sub', k_consultor, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.tipos_item (slug, rotulo, empresa_id) values ('f66_cruzado_c', 'F66 Tipo cruzado C', v_emp_b);
        v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' consultor-insert-tipo';
  exception when insufficient_privilege then null;
            when others then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' consultor-insert-tipo(' || sqlstate || ')'; end;
  update public.colaboradores set nome = 'Invadido F66 C' where id = (v_pb->>'colaboradores')::uuid;
  get diagnostics v_cnt = row_count;
  if v_cnt > 0 then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' consultor-update-colaborador'; end if;
  reset role;
  if pg_temp.assert_zero_de('10g a escrita cruzada é recusada: inserir com a empresa B leva 42501 pelo WITH CHECK, e atualizar ou apagar linha da B afeta 0 linhas — para o admin da A e para o membro das duas' ||
       case when v_ruins > 0 then ' — passou:' || v_rotulos else '' end, v_ruins, 9) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- a SEGUNDA prova, de volta como postgres: a B está intacta
  select md5(string_agg(x, ',' order by x)) into v_md5_b1
    from (select to_jsonb(c)::text as x from public.colaboradores c where c.empresa_id = v_emp_b
          union all select to_jsonb(a)::text from public.ativos a where a.empresa_id = v_emp_b
          union all select to_jsonb(m)::text from public.motivos m where m.empresa_id = v_emp_b
          union all select to_jsonb(t)::text from public.tipos_item t where t.empresa_id = v_emp_b
          union all select to_jsonb(n)::text from public.anotacoes n where n.empresa_id = v_emp_b) as s;
  if v_md5_b0 = v_md5_b1 then
    v_ok := v_ok + 1;
    raise notice '✓ 10g-bis de volta como postgres, colaboradores, ativos, motivos, tipos e anotações da B estão INTACTOS (a segunda prova da recusa)';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 10g-bis a escrita cruzada deixou marca na B (antes % · depois %)', v_md5_b0, v_md5_b1;
  end if;
  -- o PAR LEGÍTIMO: a mesma escrita, na A, pelo mesmo admin, passa
  v_ruins := 0; v_rotulos := '';
  perform set_config('request.jwt.claims', json_build_object('sub', k_admin_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.colaboradores (nome, filial_id, criado_por, empresa_id)
        values ('Fulano F66 legítimo', (v_pa->>'filiais')::smallint, k_admin_a, v_emp_a);
  exception when others then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' insert-colaborador(' || sqlstate || ')'; end;
  begin insert into public.tipos_item (slug, rotulo, empresa_id) values ('f66_legitimo', 'F66 Tipo legítimo', v_emp_a);
  exception when others then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' insert-tipo(' || sqlstate || ')'; end;
  begin insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, empresa_id)
        values ('WAP0009662', 'F66LEG1', 'notebook', v_f1, 'cadastro', v_emp_a);
  exception when others then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' insert-ativo(' || sqlstate || ')'; end;
  begin insert into public.anotacoes (ativo_id, texto, criado_por, empresa_id)
        values ((v_pa->>'ativos')::uuid, 'anotação legítima F66', k_admin_a, v_emp_a);
  exception when others then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' insert-anotacao(' || sqlstate || ')'; end;
  update public.colaboradores set nome = 'Editado F66' where id = (v_pa->>'colaboradores')::uuid;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' update-colaborador(' || v_cnt || ')'; end if;
  update public.ativos set modelo = 'editado-f66' where id = (v_pa->>'ativos')::uuid;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' update-ativo(' || v_cnt || ')'; end if;
  delete from public.motivos where empresa_id = v_emp_a and codigo = v_mot_par;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' delete-motivo(' || v_cnt || ')'; end if;
  reset role;
  if pg_temp.assert_zero_de('10g-par o par legítimo passa: a mesma escrita, na A, pelo admin da A (inserir, atualizar, apagar)' ||
       case when v_ruins > 0 then ' — recusado:' || v_rotulos else '' end, v_ruins, 7) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 10h — SEM O TERMO no WITH CHECK (numa subtransação desfeita), a MESMA escrita cruzada PASSA: quem recusou foi o recorte
  v_estado2 := null;
  begin
    alter policy "escrita cria colaborador" on public.colaboradores with check ((select public.pode_escrever()));
    perform set_config('request.jwt.claims', json_build_object('sub', k_admin_a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.colaboradores (nome, filial_id, criado_por, empresa_id)
    values ('Fulano F66 sem o termo', (v_pb->>'filiais')::smallint, k_admin_a, v_emp_b);
    reset role;
    v_estado2 := 'passou';
    raise exception 'f66-10h-desfaz';
  exception when others then
    if sqlerrm <> 'f66-10h-desfaz' then v_estado2 := 'recusou ' || sqlstate; end if;
  end;
  reset role;
  if pg_temp.assert_zero_de('10h sem o termo de empresa no WITH CHECK, a mesma escrita cruzada PASSA — a recusa de 10g é do recorte, não do acaso' ||
       case when v_estado2 is distinct from 'passou' then ' — ' || coalesce(v_estado2, '∅') else '' end,
       case when v_estado2 = 'passou' then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 10i/10j — O JOIN DAS rel_*: o mesmo código de motivo nas duas empresas; o membro das duas lê o relatório
  insert into public.motivos (codigo, rotulo, aplica_a, empresa_id)
  values ('f66-iso-mot', 'F66 motivo da A', array['saida']::public.tipo_movimentacao[], v_emp_a),
         ('f66-iso-mot', 'F66 motivo da B', array['saida']::public.tipo_movimentacao[], v_emp_b);
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, colaborador, setor, motivo, criado_por, created_at, empresa_id)
  values ((v_pa->>'ativos')::uuid, 'saida', current_date - 1, (v_pa->>'filiais')::smallint, 'Fulano F66', 'TI',
          'f66-iso-mot', k_admin_a, now() - interval '1 day', v_emp_a),
         ((v_pb->>'ativos')::uuid, 'saida', current_date - 1, (v_pb->>'filiais')::smallint, 'Fulano F66', 'TI',
          'f66-iso-mot', k_admin_a, now() - interval '1 day', v_emp_b);
  perform set_config('request.jwt.claims', json_build_object('sub', k_consultor, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select coalesce(sum(r.total), 0) into v_soma
    from public.rel_por_motivo_filiais(array[(v_pa->>'filiais')::smallint, (v_pb->>'filiais')::smallint],
                                       current_date - 10, current_date) as r
   where r.motivo in ('F66 motivo da A', 'F66 motivo da B');
  select coalesce(sum(r.total), 0) into v_cnt
    from public.rel_resumo_filiais(array[(v_pa->>'filiais')::smallint, (v_pb->>'filiais')::smallint],
                                   current_date - 10, current_date) as r
   where r.motivo in ('F66 motivo da A', 'F66 motivo da B');
  reset role;
  if pg_temp.assert_zero_de('10i o relatório por motivo e o resumo NÃO duplicam para o membro das duas: o mesmo código de motivo em duas empresas junta pelo par (empresa_id, codigo) — 2 saídas, 2 contadas em cada' ||
       case when v_soma <> 2 or v_cnt <> 2 then ' — por motivo ' || v_soma || ', resumo ' || v_cnt || ' (esperado 2 e 2)' else '' end,
       abs(v_soma - 2) + abs(v_cnt - 2), 4) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- 10j: SEM o par no join (o corpo da 0143, numa subtransação desfeita), o mesmo relatório DUPLICA — o cenário acusa
  v_estado2 := null;
  begin
    create or replace function public.rel_por_motivo_filiais(p_filiais smallint[], p_de date, p_ate date)
    returns table (tipo public.tipo_movimentacao, motivo text, total bigint)
    language sql stable security invoker set search_path = public as $sab$
      select m.tipo, coalesce(mo.rotulo, m.motivo, 'Outro') as motivo, count(*)::bigint
        from public.movimentacoes m
        left join public.motivos mo on mo.codigo = m.motivo
       where m.tipo in ('saida', 'devolucao') and m.data between p_de and p_ate and m.filial_id = any (p_filiais)
       group by m.tipo, coalesce(mo.rotulo, m.motivo, 'Outro')
       order by 3 desc;
    $sab$;
    perform set_config('request.jwt.claims', json_build_object('sub', k_consultor, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select coalesce(sum(r.total), 0)::text into v_estado2
      from public.rel_por_motivo_filiais(array[(v_pa->>'filiais')::smallint, (v_pb->>'filiais')::smallint],
                                         current_date - 10, current_date) as r
     where r.motivo in ('F66 motivo da A', 'F66 motivo da B');
    reset role;
    raise exception 'f66-10j-desfaz';
  exception when others then
    if sqlerrm <> 'f66-10j-desfaz' then v_estado2 := 'erro ' || sqlstate || ': ' || sqlerrm; end if;
  end;
  reset role;
  if pg_temp.assert_zero_de('10j sem o par (empresa_id, codigo) no join, o relatório por motivo DUPLICA para o membro das duas (4 em vez de 2) — o cenário 10i sabe acusar' ||
       case when v_estado2 is distinct from '4' then ' — contou ' || coalesce(v_estado2, '∅') || ' (esperado 4)' else '' end,
       case when v_estado2 = '4' then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- =========================================================================
  -- 11 — F66: A FORMA DE PARES (decisão 3 do PLAN-F66). A escrita por unidade deixou de ser
  -- `pode_escrever_filial(filial_id)` por linha e passou a ser `(empresa_id, filial_id) in (select u.empresa_id,
  -- u.filial_id from public.unidades_de_escrita() u)`, em conjunção com o termo de empresa. O operador vinculado à
  -- filial X da A (o do cenário 8) escreve em X e é recusado em Y e em filial da B; o admin da A escreve em toda filial
  -- da A, inclusive DESATIVADA, e é recusado na da B; `filial_id` nulo é recusado; o snapshot de `movimentacoes` (a
  -- filial REAL do ativo, lida da própria linha) continua recusando a filial mentida. E a EQUIVALÊNCIA, sobre as
  -- fixtures: para cada pessoa e cada filial da A (e o nulo), `pode_escrever_filial(f)` = `(A, f) ∈ unidades_de_escrita()`.
  -- =========================================================================
  insert into public.filiais (nome, slug, empresa_id, ativo)
  values ('F66 Isolamento A Desativada', 'f66-iso-a-desativada', v_emp_a, false) returning id into v_fdes;
  v_ruins := 0; v_rotulos := '';
  -- 11a — o operador vinculado a X (v_f1)
  perform set_config('request.jwt.claims', json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
        values ('WAP0009663', 'F66PAR1', 'notebook', v_f1, 'cadastro');
  exception when others then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' operador-em-X-recusado(' || sqlstate || ')'; end;
  begin insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
        values ('WAP0009664', 'F66PAR2', 'notebook', v_f2, 'cadastro');
        v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' operador-em-Y-aceito';
  exception when insufficient_privilege then null;
            when others then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' operador-em-Y(' || sqlstate || ')'; end;
  begin insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, empresa_id)
        values ('WAP0009665', 'F66PAR3', 'notebook', v_fb, 'cadastro', v_emp_b);
        v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' operador-na-B-aceito';
  exception when insufficient_privilege then null;
            when others then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' operador-na-B(' || sqlstate || ')'; end;
  begin insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
        values ('WAP0009666', 'F66PAR4', 'notebook', null, 'cadastro');
        v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' filial-nula-aceita';
  exception when insufficient_privilege then null;
            when others then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' filial-nula(' || sqlstate || ')'; end;
  reset role;
  -- 11b — o admin da A: toda filial da A, inclusive a desativada; nunca a da B
  perform set_config('request.jwt.claims', json_build_object('sub', k_admin_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem)
        values ('WAP0009667', 'F66PAR5', 'notebook', v_fdes, 'cadastro');
  exception when others then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' admin-na-desativada-recusado(' || sqlstate || ')'; end;
  begin insert into public.ativos (patrimonio, service_tag, categoria, filial_id, origem, empresa_id)
        values ('WAP0009668', 'F66PAR6', 'notebook', v_fb, 'cadastro', v_emp_b);
        v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' admin-na-B-aceito';
  exception when insufficient_privilege then null;
            when others then v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' admin-na-B(' || sqlstate || ')'; end;
  reset role;
  if pg_temp.assert_zero_de('11a/11b os pares: o operador escreve na filial dele e é recusado (42501) na outra, na da B e com filial nula; o admin escreve em toda filial da A, inclusive a desativada, e é recusado na da B' ||
       case when v_ruins > 0 then ' —' || v_rotulos else '' end, v_ruins, 6) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- a segunda prova: gravou só o que tinha de gravar (as duas legítimas)
  select count(*) into v_cnt from public.ativos
   where patrimonio in ('WAP0009663', 'WAP0009664', 'WAP0009665', 'WAP0009666', 'WAP0009667', 'WAP0009668');
  if v_cnt = 2 and exists (select 1 from public.ativos where patrimonio = 'WAP0009663' and filial_id = v_f1)
     and exists (select 1 from public.ativos where patrimonio = 'WAP0009667' and filial_id = v_fdes) then
    v_ok := v_ok + 1;
    raise notice '✓ 11a-bis de volta como postgres, só as duas escritas legítimas gravaram (operador em X, admin na desativada)';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 11a-bis a recusa dos pares deixou marca: % ativos gravados das seis tentativas (esperado 2)', v_cnt;
  end if;

  -- 11c — o SNAPSHOT: o operador declara a filial dele (X) numa transferência de ativo que está em Y. O gatilho
  --       BEFORE preenche `snapshot_anterior` com a filial REAL do ativo, e o segundo par a confere (o 2c-bis de
  --       papeis_rls.sql, agora pela forma de pares).
  v_estado2 := null;
  perform set_config('request.jwt.claims', json_build_object('sub', k_operador, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, filial_destino_id, criado_por)
    select a.id, 'transferencia', current_date, v_f1, v_f1, k_operador
      from public.ativos a where a.patrimonio = 'WAP0009481';
    v_estado2 := 'aceito';
  exception when insufficient_privilege then v_estado2 := 'recusado';
            when others then v_estado2 := 'outro ' || sqlstate;
  end;
  reset role;
  if v_estado2 = 'recusado'
     and (select filial_id from public.ativos where patrimonio = 'WAP0009481') = v_f2 then
    v_ok := v_ok + 1;
    raise notice '✓ 11c o snapshot pelos pares: a filial mentida numa transferência de ativo de outra filial é recusada (42501), e o ativo não migrou';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 11c o snapshot pelos pares não recusou a filial mentida (%), ou o ativo migrou', coalesce(v_estado2, '∅');
  end if;

  -- 11d — A EQUIVALÊNCIA, sobre as fixtures: para cada pessoa e cada filial da A (e o nulo),
  --       pode_escrever_filial(f) = (A, f) ∈ unidades_de_escrita(). As filiais da B entram só na MEDIÇÃO: ali a
  --       divergência é o defeito que a troca conserta (`pode_escrever_filial` diz sim a admin em QUALQUER filial).
  v_ruins := 0; v_rotulos := ''; v_cnt := 0; v_soma := 0;
  foreach v_uid_p in array array[k_admin_a, k_operador, k_consultor, k_plataforma, k_admin_b, k_oper_b, k_inativo] loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid_p, 'role', 'authenticated')::text, true);
    for v_tab in select f.id::smallint as fid, f.empresa_id from public.filiais f
                 union all select null::smallint, v_emp_a loop
      if v_tab.empresa_id = v_emp_a then
        v_cnt := v_cnt + 1;
        if coalesce(public.pode_escrever_filial(v_tab.fid), false)
           is distinct from exists (select 1 from public.unidades_de_escrita() u
                                     where u.empresa_id = v_emp_a and u.filial_id = v_tab.fid) then
          v_ruins := v_ruins + 1; v_rotulos := v_rotulos || ' ' || v_uid_p || '/' || coalesce(v_tab.fid::text, 'nula');
        end if;
      elsif coalesce(public.pode_escrever_filial(v_tab.fid), false)
            is distinct from exists (select 1 from public.unidades_de_escrita() u
                                      where u.empresa_id = v_tab.empresa_id and u.filial_id = v_tab.fid) then
        v_soma := v_soma + 1;
      end if;
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  raise notice '(medição) 11d nas filiais da B, pode_escrever_filial e os pares divergem em % pares pessoa × filial (o defeito que a troca conserta: admin da A "escreveria" na B pela regra antiga)', v_soma;
  if pg_temp.assert_zero_de('11d a forma de pares é EQUIVALENTE a pode_escrever_filial em toda pessoa × filial da A (inclusive desativada) e no nulo' ||
       case when v_ruins > 0 then ' — divergem:' || v_rotulos else '' end, v_ruins, v_cnt) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  -- [bateria-f66:fim]

  raise notice 'FIM isolamento_tenant: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
