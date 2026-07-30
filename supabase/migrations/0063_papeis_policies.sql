-- Migration 0063 — F21: as policies de ESCRITA passam a olhar o CARGO e o VÍNCULO.
--
-- Contexto: docs/ADR-002-papeis-e-permissoes.md §4 · ordem docs/prompts/F21-papeis-ultracode.md.
-- Depende da 0061 (colunas/tabela) e da 0062 (as três funções).
--
-- É ESTA a migration que fecha o item M da dívida técnica no que importa: até aqui TODA
-- policy de escrita era `using (true) / with check (true)` para `authenticated` (0005 e
-- derivadas), isto é, todo logado escrevia em tudo. O advisor mede: hoje são
-- **12 WARN `rls_policy_always_true`**; depois desta migration sobra **1** (o INSERT de
-- `import_logs`, que fica de propósito — ver adiante).
--
-- ============================================================================
-- REGRA DE OURO DESTA MIGRATION: a LEITURA não muda para ninguém.
-- ============================================================================
-- Todo logado — inclusive o cargo `consulta` — continua LENDO tudo (as filiais todas,
-- todas as telas fora de /admin). É o que a ADR-001 decidiu e continua valendo: o recorte
-- que faz sentido aqui é por papel na ESCRITA, não por filial na leitura. A única leitura
-- que se fecha é `import_logs` (passa a admin), porque todo o consumo dela está em
-- /admin/importar — verificado, ver o bloco daquela tabela.
--
-- ============================================================================
-- A ARMADILHA DA 0059 (ler antes de mexer em qualquer coisa aqui)
-- ============================================================================
-- A 0059 dropou a policy `"leitura operador"` (FOR SELECT) de SEIS tabelas — `ativos`,
-- `filiais`, `itens`, `kits_modelos`, `motivos`, `termos_gerados` — porque nelas convivia
-- uma `"operador escreve" FOR ALL using(true)`, e em Postgres FOR ALL cobre SELECT também:
-- `true OR true` = `true`, então derrubar a de SELECT era no-op semântico.
--
-- Agora isso se inverte e vira uma cilada: nessas 6 tabelas a policy FOR ALL é a ÚNICA
-- porta de LEITURA. Um `alter policy "operador escreve" ... using (e_admin())` **cegaria o
-- app** para todo não-admin — a lista de ativos, o catálogo, os kits, os termos, tudo
-- vazio. Por isso, nas 6, o caminho é:
--
--   1º  CRIAR a `"leitura operador"` FOR SELECT using(true)  (devolve o que a 0059 tirou)
--   2º  DROPAR a `"operador escreve"` FOR ALL
--   3º  CRIAR uma policy por VERBO de escrita, com o predicado de cargo/vínculo
--
-- Nessa ordem, e tudo numa transação só (o `apply_migration` do MCP roda em transação):
-- não existe instante sem proteção nem instante sem leitura.
--
-- Uma policy por verbo (e não FOR ALL + SELECT) é de propósito: duas policies permissivas
-- cobrindo o MESMO comando reacenderiam o advisor `multiple_permissive_policies` que a
-- 0059 acabou de apagar. Com um comando por policy, cada verbo tem exatamente uma.
--
-- ============================================================================
-- `(select f())` SIM para função SEM argumento; NÃO para `pode_escrever_filial(filial_id)`
-- ============================================================================
-- A doutrina initplan da 0059 vale para expressão CONSTANTE no statement: `(select auth.uid())`,
-- `(select e_admin())`, `(select papel_atual())` são avaliadas UMA vez (InitPlan).
--
-- `pode_escrever_filial(filial_id)` depende da LINHA. Embrulhá-la em `(select ...)` não gera
-- InitPlan — gera uma subconsulta CORRELACIONADA, avaliada por linha do mesmo jeito e com
-- overhead a mais. Então aqui ela é chamada DIRETO, de propósito. Custo real: nulo. Estas
-- policies só são avaliadas em INSERT/UPDATE, e toda escrita do app é de uma linha ou de um
-- lote pequeno (teto 30 — src/lib/constantes) e sempre com `.eq('id', …)`/`.in('id', …)`.
-- A LEITURA, que é o que varre 1.600 ativos, passa pela policy de SELECT `using (true)`,
-- que não chama função nenhuma.
--
-- ============================================================================
-- Verbos: só o que o app REALMENTE usa (medido, não suposto)
-- ============================================================================
-- Levantamento por grep em src/ (`.insert(` / `.update(` / `.delete(` por tabela):
--   ativos            INSERT, UPDATE            (DELETE só na RPC de import, que é definer)
--   anotacoes         INSERT
--   movimentacoes     INSERT                    (imutável — segue sem update/delete)
--   lancamentos_item  INSERT                    (imutável)
--   pendencias_item   UPDATE                    (nasce/morre pelo trigger definer da 0051)
--   relatorios_gerados INSERT
--   termos_gerados    INSERT, UPDATE, DELETE
--   filiais/motivos   INSERT, UPDATE
--   itens             INSERT, UPDATE, DELETE
--   kits_modelos      INSERT, UPDATE
--
-- Nas 4 tabelas de catálogo de /admin (`filiais`, `motivos`, `itens`, `kits_modelos`) o
-- DELETE é concedido ao admin mesmo onde o app não deleta hoje: são catálogos de admin, o
-- FOR ALL de hoje já permitia, e quem perde a capacidade é justamente quem esta fase quer
-- barrar (não-admin). Em `ativos` o DELETE **não** é recriado — é o que a ordem determina
-- ("ativos: insert/update") e nenhum caminho de sessão apaga ativo.
--
-- ADITIVA em dado (nenhum `delete from`, nenhuma linha tocada) → não bate no gate do modo
-- automático. Caminho A do docs/RUNBOOK-BANCO.md: ensaio primeiro, produção depois.
--
-- REVERSÃO (volta ao modelo de nível único da 0005/0059):
--   drop as policies criadas aqui; então, por tabela do grupo das 6:
--     create policy "operador escreve" on public.<t> for all to authenticated
--       using (true) with check (true);
--     drop policy "leitura operador" on public.<t>;
--   e devolva as ALTER POLICY abaixo para `true`. Mais:
--     revoke update (primeiro_nome, sobrenome) on public.profiles from authenticated;
--     grant  update on public.profiles to authenticated;

-- ===========================================================================
-- GRUPO 1 — tabelas com FOR ALL (as 6 da armadilha): SELECT restaurado + verbos
-- ===========================================================================

-- ---------- ativos: escrita pelo VÍNCULO DE FILIAL ----------
-- No UPDATE, USING gate a linha ANTIGA e WITH CHECK a NOVA: o operador só mexe em ativo da
-- filial vinculada e não consegue empurrar um ativo para filial que não é dele. A troca de
-- filial legítima (transferência) NÃO passa por aqui — quem move `ativos.filial_id` é o
-- trigger `aplicar_movimentacao`, que é `security definer` de propósito (comentário da 0004:
-- "para poder atualizar ativos mesmo com RLS restrita") e portanto não é barrado.
create policy "leitura operador" on public.ativos
  for select to authenticated using (true);
drop policy "operador escreve" on public.ativos;
create policy "operador insere" on public.ativos
  for insert to authenticated
  with check (public.pode_escrever_filial(filial_id));
create policy "operador atualiza" on public.ativos
  for update to authenticated
  using      (public.pode_escrever_filial(filial_id))
  with check (public.pode_escrever_filial(filial_id));

-- ---------- termos_gerados: escrita por CARGO ----------
-- Sem filial própria (guarda `ativo_ids[]`/`movimentacao_ids[]`, e um termo de lote pode
-- cruzar filiais), então o predicado é o cargo. O recorte por filial deste fluxo vive na
-- action (`exigirEscrita` sobre as filiais dos ativos do lote) — ver §4 da ordem.
create policy "leitura operador" on public.termos_gerados
  for select to authenticated using (true);
drop policy "operador escreve" on public.termos_gerados;
create policy "operador insere" on public.termos_gerados
  for insert to authenticated
  with check ((select public.papel_atual()) in ('admin', 'operador'));
create policy "operador atualiza" on public.termos_gerados
  for update to authenticated
  using      ((select public.papel_atual()) in ('admin', 'operador'))
  with check ((select public.papel_atual()) in ('admin', 'operador'));
-- DELETE existe porque `persistirTermo` limpa termos órfãos (src/lib/actions/termos.ts).
create policy "operador apaga" on public.termos_gerados
  for delete to authenticated
  using ((select public.papel_atual()) in ('admin', 'operador'));

-- ---------- filiais · motivos · itens · kits_modelos: catálogo de ADMIN ----------
create policy "leitura operador" on public.filiais
  for select to authenticated using (true);
drop policy "operador escreve" on public.filiais;
create policy "admin insere"    on public.filiais for insert to authenticated
  with check ((select public.e_admin()));
create policy "admin atualiza"  on public.filiais for update to authenticated
  using ((select public.e_admin())) with check ((select public.e_admin()));
create policy "admin apaga"     on public.filiais for delete to authenticated
  using ((select public.e_admin()));

create policy "leitura operador" on public.motivos
  for select to authenticated using (true);
drop policy "operador escreve" on public.motivos;
create policy "admin insere"    on public.motivos for insert to authenticated
  with check ((select public.e_admin()));
create policy "admin atualiza"  on public.motivos for update to authenticated
  using ((select public.e_admin())) with check ((select public.e_admin()));
create policy "admin apaga"     on public.motivos for delete to authenticated
  using ((select public.e_admin()));

create policy "leitura operador" on public.itens
  for select to authenticated using (true);
drop policy "operador escreve" on public.itens;
create policy "admin insere"    on public.itens for insert to authenticated
  with check ((select public.e_admin()));
create policy "admin atualiza"  on public.itens for update to authenticated
  using ((select public.e_admin())) with check ((select public.e_admin()));
create policy "admin apaga"     on public.itens for delete to authenticated
  using ((select public.e_admin()));

create policy "leitura operador" on public.kits_modelos
  for select to authenticated using (true);
drop policy "operador escreve" on public.kits_modelos;
create policy "admin insere"    on public.kits_modelos for insert to authenticated
  with check ((select public.e_admin()));
create policy "admin atualiza"  on public.kits_modelos for update to authenticated
  using ((select public.e_admin())) with check ((select public.e_admin()));
create policy "admin apaga"     on public.kits_modelos for delete to authenticated
  using ((select public.e_admin()));

-- ===========================================================================
-- GRUPO 2 — policies que só trocam de EXPRESSÃO (ALTER POLICY, sem janela)
-- ===========================================================================
-- `create or replace policy` não existe em Postgres 17; ALTER POLICY troca o predicado sem
-- derrubar a policy (precedente 0059). Comando e roles ficam idênticos — muda só o QUEM.

-- movimentacoes: INSERT pela filial de ORIGEM (`filial_id`).
-- Parâmetro §0 TRANSFERENCIA_EXIGE_VINCULO_DESTINO = nao → NÃO se exige vínculo em
-- `filial_destino_id`: mandar equipamento para outra filial é o fluxo normal, e quem
-- recebe é outro operador. Para exigir as duas pontas, o predicado seria
--   public.pode_escrever_filial(filial_id)
--   and (filial_destino_id is null or public.pode_escrever_filial(filial_destino_id))
-- Parâmetro §0 ESTORNO_OPERADOR = sim → NÃO se acrescenta `tipo <> 'estorno' or e_admin()`.
-- (Coluna do enum: o estorno é `tipo = 'estorno'` + `estorno_de`; NÃO existe `estorna_id`
--  em `movimentacoes` — esse nome é de `lancamentos_item`.)
alter policy "operador insere" on public.movimentacoes
  with check (public.pode_escrever_filial(filial_id));

-- lancamentos_item: INSERT pela filial do lançamento. O estorno de item é um lançamento
-- inverso com `estorna_id` preenchido — com ESTORNO_OPERADOR = sim ele cai na mesma regra.
alter policy "operador lanca" on public.lancamentos_item
  with check (public.pode_escrever_filial(filial_id));

-- pendencias_item: resolver é UPDATE. USING e WITH CHECK no mesmo predicado — o operador
-- resolve pendência da filial dele e não pode reatribuir a linha para outra filial.
alter policy "pendencias_item operador resolve" on public.pendencias_item
  using      (public.pode_escrever_filial(filial_id))
  with check (public.pode_escrever_filial(filial_id));

-- anotacoes: sem filial própria (só `ativo_id`) → predicado por CARGO, como manda o §5 da
-- ordem. O recorte por filial deste fluxo fica na action (`anotarAtivo` e as anotações
-- automáticas de correção/termo vivem em ativos.ts/termos.ts, que passam por
-- `exigirEscrita(filial do ativo)`). Consequência aceita e registrada no relatório: por
-- chamada direta à API, um OPERADOR conseguiria anotar ativo de filial não vinculada —
-- `consulta` não, e nada além do texto da anotação se move. Fechar isso exigiria
--   exists (select 1 from public.ativos a
--            where a.id = ativo_id and public.pode_escrever_filial(a.filial_id))
-- que fica registrado como opção no backlog do relatório (não é o que a ordem determina).
alter policy "operador anota" on public.anotacoes
  with check ((select public.papel_atual()) in ('admin', 'operador'));

-- relatorios_gerados: INSERT por CARGO. `filial_id` é NULL no consolidado ('geral'), então
-- um predicado por filial seria mal-definido justamente no caso mais comum.
alter policy "operador gera" on public.relatorios_gerados
  with check ((select public.papel_atual()) in ('admin', 'operador'));

-- import_logs: a LEITURA fecha para admin. Condição da ordem verificada em 29/07/2026 —
-- nenhuma view do banco referencia a tabela, e os dois consumidores de leitura são
-- `listarImportLogs` (src/lib/queries/import-logs.ts, importada só por
-- src/app/(app)/admin/importar/page.tsx) e `urlBackup` (src/lib/actions/importar.ts,
-- chamada só por components/admin/importar/*). Ambos com client de sessão, ambos dentro de
-- /admin/importar. Atenção: NÃO basta ter a policy de INSERT — sem esta de SELECT o
-- histórico e o link do backup parariam para TODOS, admin incluído.
alter policy "leitura operador" on public.import_logs
  using ((select public.e_admin()));

-- A policy de INSERT de `import_logs` fica `with check (true)` de propósito (§5 da ordem:
-- "escrita como está (RPCs)"): quem insere é a RPC `importar_ativos_substituir`, que é
-- `security definer` e portanto não passa por policy nenhuma — a guarda de verdade dela é
-- interna e entra na 0064 (`e_admin()`). Este é o 1 WARN `rls_policy_always_true` que
-- sobrevive à F21, e é vestigial: nenhum caminho de sessão insere aqui.

-- ===========================================================================
-- GRUPO 3 — `profiles`: ninguém se auto-promove (GRANT DE COLUNA)
-- ===========================================================================
-- A policy `"atualiza proprio perfil"` (0001, expressão reescrita na 0059) continua valendo
-- e é o filtro de LINHA — cada um só mexe no próprio perfil. O que faltava era o filtro de
-- COLUNA: sem isto, com `papel` e `ativo` recém-criados na 0061, qualquer operador faria
-- `update profiles set papel='admin' where id = <o próprio>` e escalaria privilégio.
--
-- RLS é row-level, não column-level (é a lição literal da 0012). O instrumento certo é o
-- privilégio de coluna: revoga-se o UPDATE da tabela e concede-se só nas duas colunas que o
-- app realmente escreve.
--
-- Verificado antes: o ÚNICO update autenticado em `profiles` é `definirAcesso`
-- (src/lib/actions/auth.ts), e ele grava exatamente `primeiro_nome` e `sobrenome`. `nome` é
-- coluna GERADA (0057) e o banco recusa escrita direta; `id`/`created_at` nunca são
-- escritos; `papel`/`ativo` só pelo service role, nas actions de /admin/usuarios.
-- O SELECT continua concedido (a policy de leitura é `using (true)`), o que o
-- `.select('id')` logo após aquele update precisa para não passar a devolver erro.
--
-- Revoga-se também de `anon` para não deixar meia-porta (idioma da 0025/0038: revogar só de
-- `public` não basta, porque o Supabase concede aos papéis direto).
revoke update on public.profiles from authenticated, anon;
grant  update (primeiro_nome, sobrenome) on public.profiles to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) nenhuma policy de ESCRITA sobrou com predicado `true`, exceto import_logs INSERT
--   select tablename, policyname, cmd, coalesce(qual,'-') q, coalesce(with_check,'-') wc
--     from pg_policies
--    where schemaname = 'public' and cmd <> 'SELECT'
--    order by tablename, cmd;
--   -- esperado: só `import_logs / operador insere / INSERT / wc = true` como "true"
--
--   -- 2) TODA tabela do grupo 1 voltou a ter uma porta de leitura
--   select tablename, count(*) filter (where cmd = 'SELECT') as portas_de_leitura
--     from pg_policies where schemaname = 'public'
--      and tablename in ('ativos','filiais','itens','kits_modelos','motivos','termos_gerados')
--    group by tablename order by tablename;
--   -- esperado: 6 linhas, todas com 1
--
--   -- 3) o grant de coluna de profiles
--   select column_name, privilege_type from information_schema.column_privileges
--    where table_schema='public' and table_name='profiles' and grantee='authenticated'
--      and privilege_type='UPDATE' order by column_name;
--   -- esperado: EXATAMENTE primeiro_nome e sobrenome
--   select has_table_privilege('authenticated','public.profiles','update') as update_tabela;
--   -- esperado: true (o grant de coluna satisfaz o has_table_privilege; o que importa é a
--   -- lista acima — tentar `update profiles set papel=...` como authenticated tem de falhar,
--   -- e é o que supabase/tests/papeis_rls.sql prova)
