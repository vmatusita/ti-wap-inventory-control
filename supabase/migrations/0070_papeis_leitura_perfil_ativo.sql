-- Migration 0070 — F21: a desativação também FECHA A LEITURA.
--
-- Contexto: mesma revisão adversarial que produziu a 0069. Depende da 0062 (`papel_atual`) e
-- da 0001/0005/0010/0014/0015/0017/0021/0043/0050/0061/0063 (as policies que ela altera).
-- APLICAR DEPOIS DA 0069 (nenhuma dependência técnica; é só ordem de número).
--
-- ===========================================================================
-- O FURO
-- ===========================================================================
-- A 0061 escreveu, e a 0063 repetiu como "REGRA DE OURO", que `profiles.ativo = false` vale
-- "no REQUEST SEGUINTE". Vale — mas só para ESCRITA. Toda policy de SELECT ficou
-- `to authenticated using (true)`, e o `authenticated` de um usuário DESLIGADO continua sendo
-- `authenticated` enquanto o access token dele não expira (~1h). Nesse intervalo:
--
--   curl -H "apikey: <anon do bundle>" -H "Authorization: Bearer <access token dele>" \
--        '<projeto>.supabase.co/rest/v1/ativos?select=*'
--   → o acervo inteiro, com colaborador, filial, patrimônio e service tag.
--
-- E não é só `ativos`: `movimentacoes` (quem levou o quê), `termos_gerados` (nome, setor),
-- `anotacoes`, `profiles` (a equipe toda), mais as 5 views — que têm `security_invoker = true`
-- e portanto DERIVAVAM o mesmo vazamento — e as 7 RPCs `rel_*`, que são SECURITY INVOKER.
-- O ban do Auth (`ban_duration`, actions/admin.ts) impede login NOVO; não invalida o token que
-- a pessoa já tem na mão. A UI manda o desligado para `/login?erro=acesso-desativado` — mas a
-- UI nunca foi a defesa (CLAUDE.md).
--
-- Ou seja: a F21 entregou "desligar alguém" como capacidade nova e o desligamento fechava
-- METADE do que promete. Esta migration é a outra metade.
--
-- ===========================================================================
-- A CORREÇÃO: um predicado só, em 13 policies de `public` + 1 de `storage`
-- ===========================================================================
--     using ((select public.papel_atual()) is not null)
--
-- `papel_atual()` devolve NULL em três situações, todas equivalentes a "não é mais gente daqui"
-- (comment da 0062): sem sessão, sem linha em `profiles`, ou perfil DESATIVADO. O piso de
-- leitura passa a ser PERFIL ATIVO — e não mais "existe um JWT".
--
-- A LEITURA CONTINUA AMPLA PARA QUEM ESTÁ ATIVO. Isto NÃO é recorte por filial nem por cargo:
-- `consulta` segue lendo o app inteiro, `operador` segue lendo todas as filiais (ADR-001 intacta
-- nesse ponto). O predicado não olha COLUNA NENHUMA da linha — é um gate de SESSÃO, avaliado uma
-- vez por statement. Para todo perfil ativo o resultado é idêntico ao de hoje, linha por linha.
-- ⚠ Mas é EMENDA a uma invariante escrita em quatro lugares ("todo logado LÊ tudo"): CLAUDE.md
--   l.53, ADR-002 l.46 (lista "O que não muda"), o cabeçalho da 0063 ("a LEITURA não muda para
--   ninguém") e MATRIZ-REGRAS R-ACC-02/C7/R-ACC-21. Os quatro são emendados no MESMO commit, e a
--   decisão vai para docs/DECISOES.md (2026-07-30). Deixar a lei escrita dizendo o contrário do
--   banco é como se produz o próximo furo: o próximo agente "corrige a regressão" e reabre isto.
--
-- ===========================================================================
-- POR QUE NÃO HÁ RECURSÃO EM `profiles`
-- ===========================================================================
-- A policy de SELECT de `profiles` passa a chamar `papel_atual()`, que LÊ `profiles`. Não
-- recursa, e a prova é de catálogo, não de intuição:
--   · `papel_atual()` é `security definer` e `proowner = postgres` (0062) — e `prosecdef`
--     também impede o inlining da função SQL, o outro caminho de auto-referência;
--   · `public.profiles` tem `relowner = postgres` e `relforcerowsecurity = false`;
--   → dentro da função `current_user` é o DONO da tabela, e dono ignora RLS na própria tabela
--     salvo FORCE ROW LEVEL SECURITY. A leitura interna não passa pela policy.
-- Medido no ENSAIO em 30/07/2026 (pg_class.relowner/relforcerowsecurity + pg_proc.proowner),
-- e a mecânica já está VIVA e provada pelo CI: o trigger definer da 0051 INSERE em
-- `pendencias_item`, que não tem policy de INSERT nenhuma, e `aplicar_movimentacao` (definer,
-- 0004) faz `update ativos` fora da policy "operador atualiza" — é o que a asserção 2h de
-- `papeis_rls.sql` mede a cada push. E se por absurdo a premissa cair, o Postgres erra ALTO e
-- na hora: 42P17 "infinite recursion detected in policy for relation". Falha ruidosa, não
-- silenciosa — e o item 4 da verificação pós-apply a provoca de propósito, antes de qualquer
-- usuário sentir.
--
-- ===========================================================================
-- CUSTO: `(select ...)` porque estas policies varrem o acervo
-- ===========================================================================
-- Doutrina initplan da 0059, e aqui é OBRIGATÓRIA (não estética): são policies de LEITURA, as
-- que rodam na varredura da lista de ativos, do histórico e dos relatórios. `papel_atual()` não
-- tem argumento, logo `(select public.papel_atual())` é expressão CONSTANTE no statement e vira
-- InitPlan, avaliado UMA vez. Medido no ensaio (1.596 ativos):
--     InitPlan 1 -> Result  Output: papel_atual()
--     Filter: (InitPlan 1).col1 …
-- Mesmo plano que a policy `(select e_admin())` de `import_logs` já produz hoje. NÃO é
-- subconsulta correlacionada: não há Var da linha na expressão. (O caso em que o parêntese
-- ATRAPALHA é o de função COM argumento de coluna — `pode_escrever_filial(filial_id)` —, e essa
-- continua chamada direto nas policies de escrita, como a 0063 explica.)
--
-- ===========================================================================
-- O QUE FICA DE FORA, e por quê
-- ===========================================================================
--   · `import_logs` e `eventos_admin`: o SELECT já é `(select e_admin())`, que implica
--     papel_atual() = 'admin' e portanto não-nulo. Já satisfazem a invariante.
--   · `senhas_acesso` e `senha_tentativas`: RLS ligada e ZERO policy (deny-all, 0012/0025).
--   · o bucket `backups-import`: as 4 policies já são `e_admin()` (0066).
--   · as 5 VIEWS e as 7 RPCs `rel_*`: vêm DE GRAÇA e por isso não há `alter view` aqui — as
--     views têm `security_invoker = true` (0059 · R-ACC-10, travado por
--     seguranca_catalogo.sql) e as RPCs são `prosecdef = false` (medido), logo as duas famílias
--     leem com a RLS de quem chama. Fechado o SELECT das tabelas de base, fecham junto. É esse
--     mesmo mecanismo que fazia a leitura VAZAR por elas.
--   · o VISUALIZADOR por senha: intocado. Ele é `anon` e as queries dele são servidas pelo
--     client de SERVICE ROLE (`resolverAcessoRelatorio`), que tem `rolbypassrls = true`. Estas
--     policies são `to authenticated` — nunca foram a porta dele. O que também significa que
--     esta migration NÃO fecha nada do lado do viewer: lá o mecanismo continua sendo a
--     revogação da senha, que já vale no request seguinte.
--
-- ⚠ O PONTO QUE QUEBRA PRIMEIRO SE ALGUÉM MUDAR UM DEFAULT: `definirAcesso`
--   (src/lib/actions/auth.ts:132-137) faz `update profiles ... .select('id')`, e o `.select()`
--   depois de um UPDATE do PostgREST EXIGE a policy de SELECT. Se `papel_atual()` fosse NULL no
--   primeiro request de quem acabou de aceitar o convite, o select voltaria vazio, a action
--   diria "Não foi possível salvar seu nome." e o convite morreria na última tela, sem erro no
--   banco. Não acontece: o corpo VIVO de `handle_new_user` (conferido no ensaio) insere só
--   (id, primeiro_nome, sobrenome), então `papel` e `ativo` assumem os DEFAULTS da 0061
--   ('operador', true) e `papel_atual()` já é não-nulo no primeiro request. **Quem um dia mudar
--   o default de `profiles.ativo` para false ("conta pendente até aceitar") quebra AQUI.**
--
-- ⚠ Consumidor externo que passa a depender de perfil ATIVO: `scripts/smoke/smoke-prod.mjs` é
--   o ÚNICO que roda sob SESSÃO real (anon key + signInWithPassword) em vez de service role. Se
--   a conta `SMOKE_EMAIL` for desativada em /admin/usuarios, o smoke passa a falhar em massa
--   (v_fila_pendencias, v_pendencias, rel_saldo_itens ×2, rel_resumo, rel_mov_por_mes,
--   v_estoque_atual) — e falhar é CERTO, não é regressão. Registrado em scripts/smoke/README.md.
--
-- ADVISOR: nenhuma mudança. `rls_policy_always_true` não aponta policy de SELECT.
--
-- ADITIVA: nenhum dado tocado, nenhum `delete from`, nenhuma coluna, nenhum arquivo. Não bate
-- no gate → caminho A do docs/RUNBOOK-BANCO.md (ENSAIO primeiro, produção depois). Nenhum
-- arquivo do app muda, então a ordem migration→deploy não importa — mas o ALTER precisa entrar
-- ANTES da próxima desativação, senão a janela do token continua aberta.
--
-- REVERSÃO §A (as 13 de public voltam a `using (true)`):
--   alter policy "leitura operador" on public.anotacoes           using (true);
--   alter policy "leitura operador" on public.ativos              using (true);
--   alter policy "leitura operador" on public.filiais             using (true);
--   alter policy "leitura operador" on public.itens               using (true);
--   alter policy "leitura operador" on public.kits_modelos        using (true);
--   alter policy "leitura operador" on public.lancamentos_item    using (true);
--   alter policy "leitura operador" on public.motivos             using (true);
--   alter policy "leitura operador" on public.movimentacoes       using (true);
--   alter policy "leitura operador" on public.operador_filiais    using (true);
--   alter policy "leitura operador" on public.profiles            using (true);
--   alter policy "leitura operador" on public.relatorios_gerados  using (true);
--   alter policy "leitura operador" on public.termos_gerados      using (true);
--   alter policy "pendencias_item leitura operador" on public.pendencias_item using (true);
-- REVERSÃO §B (storage):
--   alter policy "termos leitura operador" on storage.objects using (bucket_id = 'termos');

-- ===========================================================================
-- §A — as 13 policies de SELECT de `public`
-- ===========================================================================
-- PROCEDÊNCIA (conferida por grep nas 68 migrations, para o histórico não mentir): a 0063
-- RECRIOU seis delas — `ativos` (:102), `termos_gerados` (:117), `filiais` (:133),
-- `motivos` (:143), `itens` (:153), `kits_modelos` (:163) — porque a 0059 as havia dropado.
-- As outras sete vêm de `0001_profiles.sql:44` (profiles), `0005_rls.sql:19` (movimentacoes),
-- `0010_relatorios_gerados.sql:22`, `0015_lancamentos_item.sql:122`, `0017_anotacoes.sql:20`,
-- `0050_pendencias_item.sql:79` (a de nome próprio) e `0061_papeis_estrutura.sql:103`
-- (operador_filiais).

alter policy "leitura operador" on public.ativos
  using ((select public.papel_atual()) is not null);

alter policy "leitura operador" on public.movimentacoes
  using ((select public.papel_atual()) is not null);

alter policy "leitura operador" on public.anotacoes
  using ((select public.papel_atual()) is not null);

alter policy "leitura operador" on public.lancamentos_item
  using ((select public.papel_atual()) is not null);

alter policy "leitura operador" on public.termos_gerados
  using ((select public.papel_atual()) is not null);

alter policy "leitura operador" on public.relatorios_gerados
  using ((select public.papel_atual()) is not null);

-- Catálogo. `filiais`/`motivos` NÃO são lidos em rota pública nenhuma — conferido em
-- 30/07/2026: `/login` e `/auth/confirm` não tocam o banco; `/auth/definir-senha` só lê
-- `profiles` com a sessão recém-criada pelo verifyOtp (perfil ativo); e as duas páginas de
-- relatório chamam `listarFiliais(acesso.client)`, que para o visualizador por senha é o client
-- de SERVICE ROLE (queries/filiais.ts:12-15 aceita o client justamente por isso, e o tripwire
-- src/lib/queries/relatorios/fronteira-viewer.test.ts inclui esse arquivo na superfície).
alter policy "leitura operador" on public.filiais
  using ((select public.papel_atual()) is not null);

alter policy "leitura operador" on public.motivos
  using ((select public.papel_atual()) is not null);

alter policy "leitura operador" on public.itens
  using ((select public.papel_atual()) is not null);

alter policy "leitura operador" on public.kits_modelos
  using ((select public.papel_atual()) is not null);

-- `profiles`: ver "POR QUE NÃO HÁ RECURSÃO" e o ⚠ do `definirAcesso` no cabeçalho.
alter policy "leitura operador" on public.profiles
  using ((select public.papel_atual()) is not null);

-- `operador_filiais`: lido por `getOperador()` (acesso.ts, DEPOIS de confirmar `perfil.ativo`)
-- e por `listarUsuarios` (queries/admin.ts, com o admin logado).
alter policy "leitura operador" on public.operador_filiais
  using ((select public.papel_atual()) is not null);

-- A 13ª, com nome próprio (0050).
alter policy "pendencias_item leitura operador" on public.pendencias_item
  using ((select public.papel_atual()) is not null);

-- ===========================================================================
-- §B — o mesmo gate no SELECT do bucket `termos`
-- ===========================================================================
-- A 0066 fechou a ESCRITA dos dois buckets por cargo e deixou o SELECT de `termos` em
-- `using (bucket_id = 'termos')` de propósito — "consulta PRECISA ver o termo". Certo quanto ao
-- CARGO, incompleto quanto à SESSÃO: quem foi DESATIVADO continuava conseguindo
-- `createSignedUrl` de qualquer .docx enquanto o token vivia, e o .docx traz nome do
-- colaborador, setor e patrimônios. A conjunção mantém `bucket_id` — sem ele a policy passaria
-- a valer para qualquer bucket futuro.
--
-- A app já pedia este piso e o banco não o garantia: `urlTermo` (src/lib/actions/termos.ts)
-- chama `exigirPapel(supabase, 'consulta')` com o comentário "o piso é o perfil ATIVO, não só
-- 'existe sessão'". Esta seção é o guarda-costas daquela mensagem.
alter policy "termos leitura operador" on storage.objects
  using (
    bucket_id = 'termos'
    and (select public.papel_atual()) is not null
  );

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) nenhuma policy de LEITURA sobrou com predicado sempre-verdadeiro
--   select count(*) as sobrou_true from pg_policies
--    where schemaname = 'public' and cmd = 'SELECT' and qual = 'true';
--   -- esperado: 0
--
--   -- 2) o mapa completo das 15 policies de SELECT de public
--   select tablename, policyname, qual from pg_policies
--    where schemaname = 'public' and cmd = 'SELECT' order by tablename;
--   -- esperado: 15 linhas. 13 citam papel_atual(); import_logs e eventos_admin citam
--   -- e_admin() (que implica papel_atual() = 'admin', logo não-nulo).
--
--   -- 3) TODA tabela do grupo 1 da 0063 continua com UMA porta de leitura (não virou zero)
--   select tablename, count(*) filter (where cmd = 'SELECT') as portas_de_leitura
--     from pg_policies where schemaname = 'public'
--      and tablename in ('ativos','filiais','itens','kits_modelos','motivos','termos_gerados')
--    group by tablename order by tablename;
--   -- esperado: 6 linhas, todas com 1
--
--   -- 4) ⚠ O GATE QUE ABORTA — NÃO recursou, e a leitura do ativo continua inteira
--   begin;
--     set local role authenticated;
--     select set_config('request.jwt.claims',
--       json_build_object('sub', (select id from public.profiles where ativo limit 1),
--                         'role', 'authenticated')::text, true);
--     select public.papel_atual() as papel, count(*) as ativos_visiveis from public.ativos;
--   rollback;
--   -- esperado: papel não-nulo e ativos_visiveis = o total do banco.
--   -- Se sair 42P17 "infinite recursion detected in policy for relation profiles", REVERTA a
--   -- linha de `profiles` — a premissa do dono-ignora-RLS caiu.
--
--   -- 5) CUSTO: uma avaliação por statement, não por linha
--   begin;
--     set local role authenticated;
--     select set_config('request.jwt.claims',
--       json_build_object('sub', (select id from public.profiles where ativo limit 1),
--                         'role', 'authenticated')::text, true);
--     explain (analyze, verbose, costs off) select count(*) from public.ativos;
--   rollback;
--   -- esperado: "InitPlan 1 -> Result  Output: papel_atual()" e o Filter referenciando
--   -- (InitPlan 1).col1 — NÃO um SubPlan por linha.
--
--   -- 6) as 8 policies de storage, e nenhuma sem noção de papel
--   select policyname, cmd, coalesce(qual,'-') as usando, coalesce(with_check,'-') as checando
--     from pg_policies where schemaname='storage' and tablename='objects'
--      and (policyname like 'termos%' or policyname like 'backups-import%')
--    order by policyname;
--   -- esperado: 8 linhas; AGORA as 4 de `termos` citam papel_atual() (a de SELECT também — era
--   -- a única das 8 sem função). As 4 de `backups-import` seguem em e_admin().
--   select count(*) as storage_sem_papel from pg_policies
--    where schemaname='storage' and tablename='objects' and qual is not null
--      and qual not like '%papel_atual%' and qual not like '%e_admin%';
--   -- esperado: 0
--
--   -- 7) nada foi tocado
--   select (select count(*) from public.ativos)        as ativos,
--          (select count(*) from public.movimentacoes) as movs,
--          (select count(*) from public.profiles)      as perfis,
--          (select count(*) from storage.objects where bucket_id='termos') as docx;
--   -- esperado: as mesmas contagens de antes do apply
--   select id, public from storage.buckets where id in ('termos','backups-import');
--   -- esperado: 2 linhas, public = false nas duas
--
--   -- 8) o roteiro: papeis_rls.sql — 4d..4g (o desligado NÃO LÊ) e
--   --    1b-bis e 1b-ter (o ATIVO continua lendo)
--
--   -- 9) depois do apply em cada banco: notify pgrst, 'reload schema';
