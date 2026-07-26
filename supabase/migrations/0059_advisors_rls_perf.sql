-- Migration 0059 — dois achados de PERFORMANCE do advisor, ambos sem mudança de
-- comportamento (diagnóstico de projeto de 25/07/2026).
--
-- ✅ APLICADA EM 25/07/2026 — ensaio primeiro, produção depois (caminho A do runbook).
--
-- Guarda conferida ANTES do apply, nos DOIS bancos: as 6 tabelas têm mesmo a policy
-- "operador escreve" FOR ALL to authenticated com `qual` e `with_check` verdadeiros —
-- sem isso, derrubar a de SELECT cegaria o app.
--
-- Verificação pós-apply: as 6 ficaram só com a FOR ALL; a policy de `profiles` passou a
-- `(id = ( SELECT auth.uid() AS uid))`; os advisors `auth_rls_initplan` e
-- `multiple_permissive_policies` SUMIRAM. E a prova que importa, com leitura de operador
-- de verdade: `scripts/smoke/smoke-prod.mjs --exigir-f12` contra produção deu
-- **86 OK · 1 aviso · 0 falha** — 1.597 ativos, catálogo de itens, termos e as duas views
-- de pendência todos legíveis depois do drop.
--
-- NENHUM dos dois blocos muda QUEM enxerga O QUÊ. O modelo de acesso da spec §3 (nível
-- único de operador, RLS "sempre true" — item M da dívida técnica) fica EXATAMENTE como
-- está: mexer nele exige ADR e não é assunto desta migration.
--
-- ===========================================================================
-- BLOCO 1 — `auth_rls_initplan` na policy de UPDATE de `profiles`
-- ===========================================================================
-- `auth.uid()` escrito solto é reavaliado LINHA A LINHA; dentro de um subselect o
-- planner o trata como InitPlan e avalia UMA vez. É a recomendação literal da doc do
-- Supabase (guides/database/postgres/row-level-security#call-functions-with-select).
-- A expressão lógica é idêntica — `id = auth.uid()` continua valendo o mesmo para toda
-- linha, porque auth.uid() é estável dentro do request.
--
-- Ganho real hoje é pequeno (profiles tem poucas linhas e a policy é só de UPDATE); o
-- motivo de fazer é que é grátis, tira um WARN do advisor e evita que o padrão errado
-- seja copiado para a próxima policy.
--
-- `create or replace policy` não existe em Postgres 17 — o caminho é ALTER POLICY, que
-- troca a expressão sem derrubar a policy (não há janela sem proteção).

alter policy "atualiza proprio perfil" on public.profiles
  using  (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ===========================================================================
-- BLOCO 2 — `multiple_permissive_policies`: 6 policies de SELECT redundantes
-- ===========================================================================
-- Policies permissivas são OR-adas e CADA uma roda em toda query da tabela. Nestas 6
-- tabelas convivem duas policies para o mesmo papel (`authenticated`):
--
--   "leitura operador"  FOR SELECT  using (true)
--   "operador escreve"  FOR ALL     using (true) with check (true)
--
-- Em Postgres, FOR ALL vale para TODOS os comandos — SELECT inclusive. Com as duas
-- `using (true)`, o resultado de `true OR true` é `true`: derrubar a de SELECT é
-- no-op SEMÂNTICO e o operador continua lendo tudo pela "operador escreve".
--
-- O alvo são EXATAMENTE as 6 tabelas que têm as duas policies — as mesmas 6 que o
-- advisor aponta. Conferido em produção em 25/07 (pg_policies):
--
--   ativos · filiais · itens · kits_modelos · motivos · termos_gerados
--
-- As outras 6 tabelas com "leitura operador" NÃO entram, e o motivo importa: em
-- `anotacoes`, `import_logs`, `lancamentos_item`, `movimentacoes` e `relatorios_gerados`
-- a policy de escrita é FOR INSERT (não cobre SELECT), e em `profiles` é FOR UPDATE.
-- Nessas, "leitura operador" é a ÚNICA porta de leitura — derrubá-la cegaria o app.
--
-- VERIFICAÇÃO PÓS-APPLY (o app tem de continuar lendo as 6):
--
--   select tablename, policyname, cmd from pg_policies
--    where schemaname='public' and tablename in
--          ('ativos','filiais','itens','kits_modelos','motivos','termos_gerados')
--    order by tablename;      -- esperado: só "operador escreve" (ALL) em cada uma
--
-- Reversível: recriar qualquer uma é
--   create policy "leitura operador" on public.<t> for select to authenticated using (true);

drop policy if exists "leitura operador" on public.ativos;
drop policy if exists "leitura operador" on public.filiais;
drop policy if exists "leitura operador" on public.itens;
drop policy if exists "leitura operador" on public.kits_modelos;
drop policy if exists "leitura operador" on public.motivos;
drop policy if exists "leitura operador" on public.termos_gerados;

-- ===========================================================================
-- FORA DE ESCOPO, de propósito — os `unindexed_foreign_keys` do advisor
-- ===========================================================================
-- O advisor lista 14 FKs sem índice de cobertura (quase todas `criado_por`). NÃO são
-- criados índices aqui: a maior tabela do banco tem 3.077 linhas (movimentacoes) e a
-- segunda 1.597 (ativos) — nessa escala o planner faz seq scan e ganha, e cada índice
-- custaria escrita e espaço para zero ganho de leitura. Criar os 14 seria satisfazer o
-- linter, não o banco. Revisitar se alguma dessas tabelas passar de ~100 mil linhas.
