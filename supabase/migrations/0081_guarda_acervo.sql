-- Migration 0081 — F23: a GUARDA do acervo. O que torna as ferramentas destrutivas desta
-- fase o ÚNICO caminho, para todo mundo — inclusive para o service role.
--
-- Depende da 0079 (coluna `forcado`) e da 0080 (a janela já declarada pela RPC de import).
-- ⚠ ORDEM DE APPLY OBRIGATÓRIA: a 0080 vem ANTES desta. Se esta entrar primeiro, o import de
-- startup (`importar_ativos_substituir`) passa a ser recusado pela própria guarda, porque ele
-- remove o acervo da filial e ainda não sabe abrir a janela. Aplicada na ordem, o import
-- continua funcionando exatamente como hoje.
-- Contexto: docs/prompts/F23-dev-destrutivo-ultracode.md §1.2 e critério de aceitação 7.
--
-- =============================================================================
-- O PROBLEMA QUE ESTA MIGRATION RESOLVE (medido em 30/07/2026, ensaio e produção)
-- =============================================================================
-- A "imutabilidade" de `movimentacoes` e `lancamentos_item` NÃO era um mecanismo: era uma
-- AUSÊNCIA. As duas tabelas têm policy de SELECT e de INSERT e nenhuma de UPDATE/DELETE, e é
-- só isso que as protege. O mesmo vale para `ativos`, que não tem policy de DELETE.
--
-- Isso segura o cargo `authenticated` (RLS nega o que nenhuma policy permite) e NÃO segura o
-- SERVICE ROLE, que tem `rolbypassrls` e portanto ignora toda policy — e os grants de TABELA
-- são os defaults amplos do Supabase (`DELETE,INSERT,SELECT,UPDATE` para anon, authenticated
-- e service_role em todas elas; medido em information_schema.role_table_grants). O app tem um
-- client de service role (`src/lib/supabase/admin.ts`), então o caminho existe de verdade.
--
-- O critério 7 da ordem exige que UPDATE/DELETE direto siga recusado "para todo papel fora
-- das RPCs oficiais, SERVICE ROLE INCLUSO". Policy não entrega isso. TRIGGER entrega: trigger
-- roda para todo mundo, sempre, inclusive superusuário. É exatamente o desenho que a 0073
-- usou para tornar o cargo `dev` intocável — esta migration é aquele padrão aplicado ao
-- ACERVO em vez de a `profiles`.
--
-- O DESENHO: recusa por padrão; as RPCs desta fase (0082/0083/0084) e a de import (0080)
-- abrem a janela por GUC LOCAL À TRANSAÇÃO e a FECHAM ao sair.
--
-- ⚠ A ARMADILHA HERDADA DA F22, que continua valendo: `set_config(chave, valor, true)` é
-- local à TRANSAÇÃO, não à chamada de função. Toda RPC que abre FECHA antes de retornar, e as
-- desta fase fecham também no caminho de ERRO (bloco `exception` que re-levanta) — porque uma
-- exceção no meio, sem o fecho, deixaria a janela aberta para o resto da transação. Em
-- produção cada chamada do PostgREST é a sua própria transação e o vazamento não se
-- manifestaria; depender disso é depender do transporte.
--
-- =============================================================================
-- O QUE CADA TRIGGER COBRE, E POR QUE NÃO MAIS QUE ISSO
-- =============================================================================
--   · movimentacoes    — UPDATE, DELETE e INSERT-com-marca.
--   · lancamentos_item — UPDATE, DELETE e INSERT-com-marca.
--     Nas duas, UPDATE e DELETE não têm NENHUM caso de uso legítimo hoje: conferido por busca
--     no repositório (nenhum `.update(`/`.delete()` sobre elas em src/ ou scripts/) — o que a
--     casa faz para desfazer é ESTORNAR, que é um INSERT. O ramo de INSERT recusa apenas
--     `forcado = true`, para que a marca da 0079 não possa ser mentida por request forjado:
--     `authenticated` TEM policy de INSERT nessas tabelas, então sem este ramo um operador
--     poderia rotular a própria movimentação como correção técnica do desenvolvedor.
--   · ativos           — DELETE apenas.
--     UPDATE em `ativos` é operação NORMAL e constante (o trigger `aplicar_movimentacao` grava
--     o estado derivado a cada movimentação; `actions/ativos.ts` e `actions/termos.ts` editam
--     ficha e flags de termo). Guardar UPDATE aqui pararia o sistema inteiro. A invariante que
--     `ativos` precisa é "não se apaga por fora", e é essa que o trigger crava.
--   · pendencias_item, anotacoes, termos_gerados — FORA, de propósito. `aplicar_movimentacao`
--     remove `pendencias_item` no estorno (o "estorno-strip" da F18) e o próprio produto apaga
--     termos órfãos (`actions/termos.ts`); guardá-las quebraria fluxo legítimo sem fechar
--     nenhuma porta que importe: elas são rastro, e quem manda nelas é o ativo/movimentação a
--     que pertencem, que já estão guardados.
--
-- ⚠ O QUE ESTA GUARDA **NÃO** É. Ela não é autorização. Quem decide "você pode?" são as
-- guardas `e_dev()` DENTRO das RPCs (0082/0083/0084) e `e_admin()` dentro da de import. O
-- trigger só garante que não existe atalho POR FORA delas. As duas camadas juntas é que
-- fecham; nenhuma sozinha basta. E ela não protege contra quem tem acesso ao SQL Editor do
-- Supabase como `postgres`: esse caminho é humano-no-circuito por definição e está fora do
-- modelo de ameaça do app (é a mesma fronteira que a 0073 aceitou).
--
-- ADITIVA: cria uma função e três triggers. NENHUMA linha de dado é tocada, nenhum grant muda.
-- O corpo não contém exclusão de acervo → NÃO bate no gate → caminho **A** do
-- docs/RUNBOOK-BANCO.md: ensaio primeiro, produção depois.
--
-- REVERSÃO (reabre o acervo para o service role — só faz sentido junto de um rollback da F23):
--   drop trigger movimentacoes_guarda_acervo    on public.movimentacoes;
--   drop trigger lancamentos_item_guarda_acervo on public.lancamentos_item;
--   drop trigger ativos_guarda_acervo           on public.ativos;
--   drop function public.guarda_acervo();

-- ---------------------------------------------------------------------------
-- A função de trigger — uma só, para as três tabelas
-- ---------------------------------------------------------------------------
-- ⚠ `to_jsonb(new) ->> 'forcado'` e não `new.forcado`: a mesma função serve `ativos`, que NÃO
-- tem essa coluna. A referência direta compilaria e só estouraria em tempo de execução, num
-- ramo que hoje não roda — exatamente o tipo de bomba-relógio que aparece quando alguém
-- estende o trigger de `ativos` para INSERT no futuro. Pela via jsonb, a ausência da coluna
-- devolve NULL e o `coalesce` resolve.
create or replace function public.guarda_acervo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_janela boolean := coalesce(current_setting('estoque.dev_destrutivo', true), '') = 'on';
begin
  -- Caminho oficial: as RPCs da F23 (que já checaram e_dev() por dentro) e a de import
  -- (que já checou e_admin() e revalidou contagens).
  if v_janela then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'INSERT' then
    -- Registrar movimentação/lançamento é operação normal — o que não se pode é NASCER
    -- marcado como correção técnica do desenvolvedor.
    if coalesce((to_jsonb(new) ->> 'forcado')::boolean, false) then
      raise exception 'A marca de "forçado" é exclusiva das ferramentas do desenvolvedor e não pode ser gravada por este caminho.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'Registro histórico não se altera: % é imutável. Para desfazer um efeito, registre um estorno; correção técnica é pela área do desenvolvedor.', tg_table_name
      using errcode = '42501';
  end if;

  -- DELETE
  raise exception 'Registro histórico não se remove por este caminho (%). As ferramentas de exclusão da área do desenvolvedor são o único caminho, e elas exigem confirmação, justificativa e deixam trilha.', tg_table_name
    using errcode = '42501';
end;
$$;

comment on function public.guarda_acervo() is
  'F23: a rede que torna o acervo imutável POR FORA das RPCs oficiais — inclusive para o service role, que ignora RLS. Recusa UPDATE e DELETE em movimentacoes/lancamentos_item, DELETE em ativos, e INSERT que já traga forcado = true. O caminho oficial declara estoque.dev_destrutivo = on, LOCAL à transação, depois de checar o cargo por dentro (e_dev nas RPCs da F23; e_admin na de import). Não substitui a autorização — só garante que não há atalho por fora dela.';

-- Função de trigger não se chama à mão (idioma da 0038 e da 0073).
revoke all on function public.guarda_acervo() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Os três triggers
-- ---------------------------------------------------------------------------
-- BEFORE (e não AFTER) para recusar ANTES de escrever; FOR EACH ROW porque a decisão é por
-- linha e porque o ramo de INSERT precisa enxergar `new`.
create trigger movimentacoes_guarda_acervo
  before insert or update or delete on public.movimentacoes
  for each row execute function public.guarda_acervo();

comment on trigger movimentacoes_guarda_acervo on public.movimentacoes is
  'F23: ver public.guarda_acervo(). Em INSERT recusa apenas forcado = true (registrar movimentação segue livre para quem a policy permite); UPDATE e DELETE são recusados por completo fora da janela oficial.';

create trigger lancamentos_item_guarda_acervo
  before insert or update or delete on public.lancamentos_item
  for each row execute function public.guarda_acervo();

comment on trigger lancamentos_item_guarda_acervo on public.lancamentos_item is
  'F23: ver public.guarda_acervo(). Espelho exato do trigger de movimentacoes, do lado dos itens por quantidade.';

-- Só DELETE: UPDATE em ativos é o estado derivado que o sistema grava o tempo todo.
create trigger ativos_guarda_acervo
  before delete on public.ativos
  for each row execute function public.guarda_acervo();

comment on trigger ativos_guarda_acervo on public.ativos is
  'F23: ver public.guarda_acervo(). APENAS DELETE — UPDATE em ativos é operação normal (o estado derivado que aplicar_movimentacao grava a cada movimentação, e a edição de ficha), e guardá-lo pararia o sistema.';

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) a função e os três triggers existem, com os eventos certos:
--   select c.relname as tabela, t.tgname, pg_get_triggerdef(t.oid) as def
--     from pg_trigger t join pg_class c on c.oid = t.tgrelid
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname='public' and not t.tgisinternal and t.tgname like '%guarda_acervo'
--    order by c.relname;
--   -- esperado: 3 linhas · ativos = BEFORE DELETE · movimentacoes e lancamentos_item =
--   --           BEFORE INSERT OR DELETE OR UPDATE
--
--   -- 2) ninguém pode chamar a função de trigger à mão:
--   select has_function_privilege('anon','public.guarda_acervo()','execute')          as anon,
--          has_function_privilege('authenticated','public.guarda_acervo()','execute') as auth,
--          has_function_privilege('service_role','public.guarda_acervo()','execute')  as srv;
--   -- esperado: false, false, false
--
--   -- 3) A REDE MORDE? (rode como service role — é o caso difícil, o que ignora RLS.)
--   --    Numa transação que você reverte:
--   --      begin;
--   --      update public.movimentacoes set observacao = 'x'
--   --       where id = (select id from public.movimentacoes limit 1);
--   --    esperado: ERRO 42501 'Registro histórico não se altera: movimentacoes é imutável...'
--   --      rollback;
--   --    A prova completa, com papel simulado e com a janela, está em
--   --    supabase/tests/dev_destrutivo.sql — rode-o nos dois bancos.
--
--   -- 4) O IMPORT CONTINUA PASSANDO? (a 0080 tem de estar aplicada ANTES desta.)
--   select pg_get_functiondef(p.oid) like '%estoque.dev_destrutivo%' as import_abre_janela
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname='importar_ativos_substituir';
--   -- esperado: true. FALSE aqui significa que a ordem de apply foi invertida e o import de
--   -- startup está QUEBRADO — aplique a 0080 imediatamente.
