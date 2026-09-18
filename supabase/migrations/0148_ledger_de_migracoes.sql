-- =============================================================================
-- 0148_ledger_de_migracoes.sql — reauditoria de 18/09/2026, item AE (passo 2, v1.66.3)
-- =============================================================================
-- O PROBLEMA (docs/DIVIDA-TECNICA.md, item AE): uma migration mergeada na `main`
-- e não aplicada em produção — ou aplicada e não registrada no ledger — só é
-- descoberta por acaso. Já aconteceu três vezes: a `0136`/`0137` aplicadas sem
-- registro, três funções divergentes por colagem manual (`0082`/`0122`), e a
-- `0146` que ficou horas no repositório sem apply. Esta função é a porta que a
-- sonda diária (scripts/smoke/integridade.mjs, Parte B do saude.yml) usa para
-- comparar o repositório com o ledger — a comparação mora em
-- scripts/smoke/deriva-migrations.mjs.
--
-- POR QUE NÃO SERVE `ultima_migracao_aplicada()` (0077). Ela devolve
-- `max(version)` — um TIMESTAMP gerado no APPLY, sem relação com o número do
-- arquivo — e é `e_dev()`, fechada à conta `consulta` do smoke agendado. A
-- sonda precisa do NOME (o que casa com o arquivo) por uma porta que a conta
-- comum alcance.
--
-- POR QUE O LEDGER INTEIRO, E NÃO SÓ A PONTA. O histórico antigo do ledger é
-- incompatível com os arquivos por construção (item A da dívida — decisão do
-- Johnny, R3, segue aberta): produção guarda `name = 'profiles'` e o ensaio
-- guarda `name = '0001_profiles'` para a MESMA migration, e há linhas órfãs de
-- renomeação (`0126b_…` no ensaio). Quem resolve isso é a REGRA da sonda — um
-- CONTRATO COM BASE FIXA: da `0146` em diante (a primeira migration aplicada
-- pelo conector MCP nos DOIS bancos, com o mesmo `name` — medido em 18/09/2026),
-- todo arquivo do repositório tem de estar no ledger pelo nome, e toda linha do
-- ledger aplicada depois da `0146` tem de ter arquivo. O que é anterior à base
-- fica fora da comparação. Para essa regra valer sem janela, a função devolve o
-- ledger INTEIRO (hoje ~150 linhas; texto curto, custo desprezível): uma "ponta"
-- de N linhas empurraria para fora da janela, com o tempo, migrations que
-- continuam valendo — e deixaria cego o apply fora de ordem (a `0149` aplicada
-- antes da `0148` levaria a ponta para cima da `0148` que nunca foi aplicada).
--
-- O DESENHO — MESMA GUARDA DE `checagens_integridade_resumo()` (0138).
-- `security definer` porque `authenticated` não alcança o schema
-- `supabase_migrations` (fora do que o PostgREST expõe); `papel_atual() is
-- null` é o MESMO piso de leitura da 0070/0073 — qualquer logado ATIVO, não só
-- o dev. `set search_path = ''` + nomes totalmente qualificados. Os nomes do
-- ledger não são dado de negócio: são os nomes dos arquivos do próprio
-- repositório.
--
-- ⚠ ADVISOR ESPERADO: esta função ACRESCENTA 1 achado ao WARN
-- `authenticated_security_definer_function_executable` (28 → 29, medido em
-- 18/09/2026 antes do apply, nos dois bancos). É esperado, não é furo: é a MESMA
-- classe de achado de `checagens_integridade_resumo()` — `security definer`
-- alcançável por `authenticated` é a única forma de ler um schema que o
-- PostgREST não expõe, e a guarda interna é a autorização real.
--
-- TRATAMENTO DE `undefined_table` — o MESMO da 0077: um Postgres sem a tabela
-- de controle devolve ZERO linhas em vez de estourar. No `banco-sem-docker` a
-- `supabase/ci/bootstrap-ledger.sql` cria o schema e a tabela; lá a função roda
-- e devolve o que o runner registrou. A sonda trata ledger vazio como "tudo
-- pendente", nunca como verde.
--
-- SÓ LEITURA, ADITIVA: só cria uma função. Caminho A do docs/RUNBOOK-BANCO.md.
--
-- ROLLBACK, em prosa (pseudo-SQL de função em comentário vira definição para
-- `scripts/db/corpo-vigente.mjs`): dropar a função de leitura do ledger desta
-- migration, sem argumento, por migration NOVA com `npm run db:lock`, e tirar a
-- chamada dela de scripts/smoke/integridade.mjs — senão a Parte B do saude.yml
-- fica vermelha por função inexistente, que é exatamente o que se quer que ela
-- faça.
-- =============================================================================

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

-- ---------- VERIFICAÇÃO PÓS-APPLY (consultas de leitura) ----------
--   select p.proname, p.prosecdef as definer, p.provolatile as vol, p.proconfig,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth,
--          has_function_privilege('service_role', p.oid, 'execute')  as svc
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'ledger_de_migracoes';
--   esperado: 1 linha · definer = true · vol = 's' · proconfig = {search_path=""} ·
--             anon = false · auth = true · svc = false.
--   E get_advisors(security): 28 → 29, o 29º sendo esta função.
