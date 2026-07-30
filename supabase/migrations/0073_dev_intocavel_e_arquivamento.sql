-- Migration 0073 — F22: a REDE FINAL que torna o cargo `dev` intocável, e a estrutura que
-- torna possível APAGAR um usuário sem apagar a história dele.
--
-- Depende da 0071 (label `dev`) e da 0072 (funções). Quem USA a rede são as RPCs da 0074.
-- Contexto: docs/prompts/F22-cargo-dev-ultracode.md §1.3 e §2 · §3.2 (APAGAR_USUARIO =
-- preservar-autoria).
--
-- =============================================================================
-- PARTE 1 — POR QUE UMA REDE NO BANCO, E NÃO SÓ UMA GUARDA NA ACTION
-- =============================================================================
-- Hoje `profiles.papel` e `profiles.ativo` são gravados pelo SERVICE ROLE
-- (aplicarCargoEVinculos, src/lib/actions/admin.ts): a 0063 revogou o UPDATE dessas colunas
-- de `authenticated` por grant de coluna, e não existe policy de escrita — então o único
-- caminho é o client administrativo. Isso significa que **a única coisa entre um admin e a
-- gravação é o `if` da Server Action**, porque o service role passa por fora de TODA policy.
--
-- Para "ninguém abaixo de dev tem poder sobre um dev" valer NO POSTGRES — o critério de
-- aceitação 2 da ordem exige recusa também em request forjado, service role incluso —, a
-- regra tem de estar num lugar que o service role NÃO contorna. Policy não serve (ele a
-- ignora). TRIGGER serve: trigger roda para todo mundo, sempre, inclusive superusuário.
--
-- O DESENHO: o trigger RECUSA POR PADRÃO qualquer mexida numa linha `dev` (e qualquer
-- concessão do cargo `dev`), e as RPCs da 0074 abrem o único caminho que passa, declarando
-- um GUC LOCAL À TRANSAÇÃO. Como o service role não carrega identidade (o token dele não tem
-- cargo), não há como o trigger perguntar "quem é você?" — ele pergunta "você veio pelo
-- caminho oficial?", e o caminho oficial é o que já checou `e_dev()` por dentro.
--
-- ⚠ A ARMADILHA QUE ISTO EVITA, medida em ensaio em 30/07/2026 antes de escrever o arquivo:
-- `set_config(chave, valor, true)` é LOCAL À TRANSAÇÃO, **não à chamada de função**. Numa
-- prova de conceito, depois que a função oficial retornava, o GUC continuava valendo e um
-- UPDATE direto na MESMA transação passava batido. Por isso toda RPC da 0074 FECHA a janela
-- ao sair (`set_config(..., 'off', true)`), deixando aberto exatamente um statement. Em
-- produção cada chamada do PostgREST é a sua própria transação e o vazamento não se
-- manifestaria — mas depender disso é depender de um detalhe do transporte, e um script de
-- manutenção que chamasse duas coisas na mesma transação reabriria o furo em silêncio.
--
-- ⚠ O QUE ESTA REDE **NÃO** É: ela não substitui a autorização. Quem decide "você pode?" são
-- as guardas `e_dev()`/`e_admin()` DENTRO das RPCs (0074). O trigger só garante que não
-- existe atalho POR FORA delas. As duas camadas juntas é que fecham; nenhuma sozinha basta.
--
-- =============================================================================
-- PARTE 2 — POR QUE `excluido_em` E POR QUE A FK PARA auth.users SAI
-- =============================================================================
-- O parâmetro §0 da ordem é `APAGAR_USUARIO = preservar-autoria`: a conta morre para sempre,
-- mas o histórico continua mostrando quem fez o quê. O mapa de FKs (medido em produção em
-- 30/07/2026) torna o caminho ingênuo impossível:
--
--   · `profiles.id → auth.users(id) ON DELETE CASCADE` (0001);
--   · DEZ tabelas referenciam `profiles` SEM `on delete` — ou seja, NO ACTION, que BLOQUEIA:
--     movimentacoes.criado_por, lancamentos_item.criado_por, anotacoes.criado_por,
--     termos_gerados.gerado_por, termos_gerados.atualizado_por, relatorios_gerados.gerado_por,
--     senhas_acesso.criado_por, import_logs.criado_por, kits_modelos.criado_por,
--     pendencias_item.resolvida_por. Oito delas são NOT NULL — nem anular dá.
--
-- Logo `auth.admin.deleteUser()` hoje FALHA com erro de FK vindo do schema `public` para
-- qualquer pessoa que já tenha registrado uma movimentação (isto é: todo mundo). E "resolver"
-- trocando as dez para CASCADE apagaria movimentações, lançamentos, termos e snapshots —
-- destruiria o acervo e desalinharia o estoque derivado por trigger. Está fora de questão.
--
-- DECISÃO — desenho **perfil-arquivado** (a primeira das duas opções da ordem §3.2):
--   1. a FK `profiles_id_fkey` para `auth.users` é DERRUBADA;
--   2. o perfil ganha `excluido_em` e SOBREVIVE, com o nome intacto — é ele que as dez FKs
--      referenciam e é dele que sai o "Quem fez" de toda tela;
--   3. só a conta em `auth.users` é apagada (aí sim `deleteUser` funciona, porque não há
--      mais cascade para `public.profiles`).
-- Resultado: a pessoa não loga nunca mais, o e-mail volta a ficar livre para um convite
-- futuro (a linha do Auth sumiu de verdade), o perfil some das telas e a autoria histórica
-- continua nomeada. A alternativa (conta-neutralizada: manter a conta banida com e-mail
-- sintético) foi rejeitada por deixar lixo permanente em auth.users e por depender de o
-- e-mail sintético nunca colidir. Registrado em docs/DECISOES.md.
--
-- CONSEQUÊNCIA ACEITA, e por isso vira CHECAGEM na /dev: sem a FK, apagar um usuário pelo
-- painel do Supabase (fora do app) passa a deixar um perfil órfão SEM `excluido_em`. Isso não
-- é perigoso (órfão não loga — não há conta), mas é inconsistência, e a checagem de
-- integridade "perfil sem conta no Auth" da /dev existe exatamente para revelá-la. Ela ignora
-- os arquivados de propósito: neles o órfão é o estado CORRETO.
--
-- ADITIVA quanto a DADOS (nenhuma linha é apagada ou alterada aqui). Estrutural quanto a
-- CONSTRAINT: derruba uma FK. Não bate no gate do modo automático (não contém
-- `delete from public.ativos` nem `delete from public.movimentacoes`) → caminho **A** do
-- docs/RUNBOOK-BANCO.md: ensaio primeiro, produção depois.
--
-- REVERSÃO:
--   drop trigger profiles_guarda_dev on public.profiles;
--   drop function public.profiles_guarda_dev();
--   alter table public.profiles drop column excluido_em;
--   -- e, SÓ se nenhum perfil arquivado existir (senão a FK não valida):
--   alter table public.profiles
--     add constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade;
--   -- restaurar o corpo de papel_atual() da 0062 (sem o `excluido_em is null`).

-- ---------------------------------------------------------------------------
-- 1) A coluna do arquivamento
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column excluido_em timestamptz;

comment on column public.profiles.excluido_em is
  'F22: quando este usuário foi APAGADO (null = vivo). O perfil PERMANECE na tabela de propósito: dez FKs de histórico (movimentacoes.criado_por, lancamentos_item.criado_por, termos_gerados.gerado_por, anotacoes.criado_por…) apontam para cá, e é daqui que sai o nome em "Quem fez". Preenchido → a conta em auth.users já foi (ou está para ser) apagada, o perfil SOME de todas as telas e papel_atual() devolve NULL, de modo que a pessoa não lê nem escreve nada. Escrito só pela RPC apagar_usuario (0074). NÃO é o mesmo que ativo = false (desativar é reversível; apagar não).';

-- Índice parcial: toda listagem de usuários passa a filtrar `excluido_em is null`, e a
-- expectativa é que os arquivados sejam uma minoria permanente. Parcial (e não completo)
-- porque a única pergunta que se faz é "quem está vivo?".
create index profiles_vivos_idx on public.profiles (id) where excluido_em is null;

-- ---------------------------------------------------------------------------
-- 2) papel_atual(): arquivado não tem cargo (nem leitura, nem escrita)
-- ---------------------------------------------------------------------------
-- É o que faz o arquivamento valer no REQUEST SEGUINTE, exatamente como `ativo = false` faz
-- desde a 0061 — e é a metade que garante FALHA SEGURA na sequência do apagar: a RPC marca
-- `excluido_em` PRIMEIRO e só depois a action apaga a conta no Auth. Se a metade do Auth
-- falhar, o estado resultante já NEGA todo acesso (mesmo padrão de `definirStatusUsuario`,
-- que grava `profiles.ativo` antes do ban).
--
-- Desde a 0070 este predicado é também o piso de LEITURA (13 policies de SELECT + o bucket
-- `termos` usam `papel_atual() is not null`), então acrescentar a condição aqui fecha
-- leitura e escrita de uma vez, num lugar só.
create or replace function public.papel_atual()
returns public.papel_usuario
language sql
stable
security definer
set search_path = public
as $$
  select p.papel
    from public.profiles p
   where p.id = (select auth.uid())
     and p.ativo
     and p.excluido_em is null
$$;

comment on function public.papel_atual() is
  'F22 (era F21): cargo do usuário logado, ou NULL se não há sessão, não há perfil, o perfil está DESATIVADO (ativo = false) ou foi APAGADO (excluido_em not null). É a porta única por onde papel, desativação e exclusão entram na RLS — por isso as três valem no request seguinte, para LEITURA (piso da 0070) e para escrita.';

-- ---------------------------------------------------------------------------
-- 3) A FK para auth.users sai (ver PARTE 2 do cabeçalho)
-- ---------------------------------------------------------------------------
-- `profiles.id` continua PRIMARY KEY e continua sendo o mesmo uuid da conta no Auth — o que
-- deixa de existir é a INTEGRIDADE REFERENCIAL, e com ela o cascade que impedia o desenho.
-- O trigger `handle_new_user` (0001/0041/0057) segue criando o perfil a cada conta nova; a
-- diferença é que agora a vida do perfil não termina junto com a da conta.
alter table public.profiles
  drop constraint profiles_id_fkey;

comment on column public.profiles.id is
  'F22: mesmo uuid da conta em auth.users, mas SEM foreign key desde a 0073. A FK (on delete cascade, 0001) foi derrubada de propósito: com ela, apagar a conta tentava apagar este perfil e esbarrava nas dez FKs de histórico que apontam para cá — o "apagar usuário" era impossível sem destruir o acervo. Sem ela, apagar a conta no Auth deixa o perfil ARQUIVADO (excluido_em), a autoria histórica intacta e o e-mail livre para um convite novo. Preço: perfil órfão sem excluido_em é possível se alguém apagar a conta pelo painel do Supabase — a checagem de integridade da /dev revela esse caso.';

-- ---------------------------------------------------------------------------
-- 4) A REDE FINAL: trigger que recusa mexer em dev fora do caminho oficial
-- ---------------------------------------------------------------------------
-- O GUC combinado com as RPCs da 0074. Nome com prefixo próprio (`estoque.`) e não `app.`
-- para não colidir com nada que o PostgREST ou o Supabase declarem: o PostgREST define
-- `request.jwt.claims`, `request.headers`, `request.method`, `request.path` e `role`, e NÃO
-- expõe `set_config` como RPC — logo não há caminho por onde um cliente `authenticated`
-- ligue esta chave.
--
-- ⚠ E mesmo que houvesse: para `authenticated` o GUC é inócuo, porque ele não tem grant de
-- UPDATE nas colunas `papel`/`ativo` (0063) nem policy de DELETE em `profiles` (nunca houve).
-- A rede existe para o caminho do SERVICE ROLE — que é o único que chega às colunas e o
-- único que o RLS não segura.
create or replace function public.profiles_guarda_dev()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oficial boolean := coalesce(current_setting('estoque.gestao_usuarios', true), '') = 'on';
begin
  if v_oficial then
    -- Caminho oficial (RPCs da 0074, que já checaram e_dev()/e_admin() por dentro).
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'DELETE' then
    -- Apagar a LINHA de um dev. (O "apagar usuário" do produto NÃO faz isto: ele arquiva,
    -- justamente porque as dez FKs de histórico apontam para cá. Um DELETE de verdade em
    -- profiles é sempre acidente ou ataque.)
    if old.papel = 'dev' then
      raise exception 'Só um desenvolvedor pode apagar o perfil de um desenvolvedor.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    -- Nascer já `dev`. O trigger handle_new_user insere com o default 'operador', então este
    -- ramo só barra quem tenta plantar um dev direto na tabela.
    if new.papel = 'dev' then
      raise exception 'Só um desenvolvedor pode conceder o cargo Desenvolvedor.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE. Recusa em duas situações; qualquer outra edição passa (inclusive o próprio dev
  -- corrigindo primeiro_nome/sobrenome pelo perfil, que é a policy "atualiza proprio perfil"
  -- da 0001/0059 e NÃO pode ser barrada aqui).
  if old.papel = 'dev'
     and (new.papel       is distinct from old.papel
       or new.ativo       is distinct from old.ativo
       or new.excluido_em is distinct from old.excluido_em) then
    raise exception 'Este usuário é um desenvolvedor: só outro desenvolvedor pode alterar o cargo, desativar ou apagar esta conta.'
      using errcode = '42501';
  end if;

  if new.papel = 'dev' and old.papel is distinct from new.papel then
    raise exception 'Só um desenvolvedor pode conceder o cargo Desenvolvedor.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.profiles_guarda_dev() is
  'F22: REDE FINAL da proteção do cargo dev. Recusa, para QUALQUER caminho que não seja o oficial (inclusive o service role, que ignora RLS), (a) mudar papel/ativo/excluido_em de uma linha dev, (b) conceder o cargo dev e (c) apagar a linha de um dev. O caminho oficial são as RPCs de gestão da 0074, que declaram estoque.gestao_usuarios = on LOCAL à transação depois de checar e_dev(). Não substitui a autorização — só garante que não existe atalho por fora dela.';

-- Sem execute para ninguém além do dono: função de trigger não se chama à mão
-- (idioma da 0038, que revogou as três funções de trigger existentes).
revoke all on function public.profiles_guarda_dev() from public, anon, authenticated, service_role;

create trigger profiles_guarda_dev
  before insert or update or delete on public.profiles
  for each row execute function public.profiles_guarda_dev();

comment on trigger profiles_guarda_dev on public.profiles is
  'F22: ver public.profiles_guarda_dev(). BEFORE (e não AFTER) para recusar ANTES de escrever; FOR EACH ROW porque a decisão é por linha.';

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) coluna, índice e trigger no lugar:
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='profiles' and column_name='excluido_em';
--   -- esperado: 1 linha · timestamp with time zone · YES
--
--   select tgname, tgenabled from pg_trigger
--    where tgrelid='public.profiles'::regclass and not tgisinternal order by tgname;
--   -- esperado: inclui profiles_guarda_dev com tgenabled = 'O'
--
--   -- 2) a FK para auth.users REALMENTE saiu (e a PK continua):
--   select conname, contype from pg_constraint
--    where conrelid='public.profiles'::regclass order by contype, conname;
--   -- esperado: profiles_pkey (p) presente · profiles_id_fkey AUSENTE
--
--   -- 3) papel_atual() agora exige excluido_em is null:
--   select pg_get_functiondef('public.papel_atual()'::regprocedure) like '%excluido_em is null%' as ok;
--   -- esperado: true
--
--   -- 4) ninguém foi arquivado por esta migration:
--   select count(*) as arquivados from public.profiles where excluido_em is not null;
--   -- esperado: 0
--
--   -- 5) A REDE MORDE? (prova viva; roda como service role, que é o caso difícil)
--   --    Só faz sentido DEPOIS da 0076, quando existir uma linha dev. Com o banco ainda sem
--   --    dev, o teste equivalente é tentar CONCEDER o cargo:
--   --      update public.profiles set papel = 'dev'
--   --       where id = (select id from public.profiles order by created_at limit 1);
--   --    esperado: ERRO 42501 'Só um desenvolvedor pode conceder o cargo Desenvolvedor.'
--   --    (a prova completa, com papel simulado, está em supabase/tests/cargo_dev.sql)
