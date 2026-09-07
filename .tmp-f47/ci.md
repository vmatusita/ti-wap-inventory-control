## ci_yml

.github/workflows/ci.yml, 313 linhas, 2 jobs (`verificar`, `banco-sem-docker`), nenhum `banco` antigo (removido no commit 40f5897, v1.51.1 — já refletido no HEAD).

GATILHOS (linhas 6-9): `on: push: branches: [main]` + `pull_request` (sem `types:`, então só abre/synchronize/reopen — `labeled` NÃO dispara hoje).

CONCURRENCY (linhas 37-39): `group: ci-${{ github.event_name == 'pull_request' && github.ref || github.sha }}`, `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. Comentário-cicatriz "fila por SHA" (linhas 24-36): registra o incidente do run 34005575510 (commit dab346c) que ficou `jobs: []` porque o grupo por `ref` cancelava o PENDENTE em push na main — por isso push usa grupo por SHA (fila própria por commit) e só PR cancela.

JOB `verificar` (linhas 42-104), env placeholder (48-52: NEXT_PUBLIC_SUPABASE_URL etc., todos fake — "o app só lê process.env em runtime"). Passos, em ordem: checkout(54) → setup-node node-version:24(55-72, comentário-cicatriz Node 20→24 linhas 57-71: "`ReferenceError: sessionStorage is not defined`... Web Storage API só existe como global sem flag a partir do Node 24") → `npm ci`(73) → `npm run lint`(74-75) → `npm run test`(78-79) → `npm run contraste`(86-87) → `npm run build`(88-89) → `npm run verificar:actions`(103-104, comentário linhas 90-102 sobre o incidente de 20h de Server Actions fora do ar na F13: "re-export de TIPO... o transform emite o identificador... enquanto o import type correspondente já foi apagado" — POSIÇÃO NÃO É LIVRE, tem de vir depois do build pois lê `.next/server`).

JOB `banco-sem-docker` (linhas 174-312, comentário de cabeçalho 106-173). `runs-on: ubuntu-latest`, `timeout-minutes: 15`(176). `services.postgres.image: postgres:17`(183), health-check `pg_isready`(190-194). Env: `BANCO: estoque`(201).

Comentários-cicatriz do cabeçalho:
- Rate limit (linhas 129-135): "'Failed to resolve latest Supabase CLI release: rate limit exceeded'... limite de 60/h é por IP compartilhado"
- Flush do PostHog (linhas 137-146): "'Timeout while shutting down PostHog. Some events may not have been sent.' ... 'Error: Process completed with exit code 1'"
- Nome do job é contrato (linhas 160-173): "O NOME DESTE JOB É CONTRATO — banco-sem-docker é required status check... Renomear ou apagar este job deixa o check exigido sem nunca reportar, e todo PR fica preso em 'Expected — Waiting for status to be reported'"

Passos do job: checkout(203) → "Garantir psql"(206-207, apt-get install postgresql-client) → "Conferir o major do Postgres do serviço"(211-220, `if [ "$((num / 10000))" -ne 17 ]` → `exit 1`) → "Criar o banco e aplicar o bootstrap"(226-236) → "Aplicar TODAS as migrations em ordem"(243-254) → "Determinismo"(279-303) → "Rodar os roteiros de teste SQL"(309-312, `env: DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/estoque`, `run: bash scripts/db/rodar-roteiros.sh`).

## banco_sem_docker

SERVIÇO: `postgres:17` oficial do Docker Hub como `services:` do runner (não Supabase CLI/Docker) — major 17 = produção (linhas 177-180, 415-420 do ci-passos.test.ts).

ORDEM DOS BOOTSTRAPS (ci.yml linhas 226-236, comentário: "ORDEM EXPLÍCITA, não um glob... a ordem tem de ser legível AQUI, não inferida de nome de arquivo"):
1. `supabase/ci/bootstrap-roles.sql` — cria roles `anon`/`authenticated` (nologin noinherit) e `service_role` (nologin noinherit **bypassrls**); `grant anon, authenticated, service_role to postgres`. **Nenhum** `grant` em `public` (justificado: `supabase/tests/papeis_rls.sql:60-62` prova que o job antigo com `supabase start` também não tinha esses defaults).
2. `bootstrap-auth.sql` — `create schema auth`; `auth.users`(10 colunas, inclui as 9 de "cadastro" que só o runner e 10 roteiros usam para inserir `ci@wap.ind.br`); `auth.sessions`; `auth.refresh_tokens` (FK `on delete cascade` — exigida pela promessa escrita da RPC `0074:378`); `auth.uid()` copiada literalmente da fonte oficial do Supabase (`coalesce(current_setting('request.jwt.claim.sub',true), (current_setting('request.jwt.claims',true)::jsonb->>'sub'))::uuid`, `stable`).
3. `bootstrap-storage.sql` — `create schema storage`; `storage.buckets`(id text PK); `storage.objects`(id uuid PK default, bucket_id FK, owner); **`alter table storage.objects enable row level security`** (linha 73 do arquivo) — bloco crítico: nenhuma migration liga RLS nessa tabela (ela já vem ligada num Supabase hospedado); sem essa linha as 8 policies de `0021`/`0031` ficariam inertes e as asserções 6a-6f de `papeis_rls.sql` passariam medindo nada.
4. `bootstrap-ledger.sql` — `create schema supabase_migrations` + tabela vazia `schema_migrations`; mitiga (sem corrigir) o bug da `0077:47` que só captura `undefined_table`(42P01) e não `invalid_schema_name`(3F000).

APLICAÇÃO DAS 126 MIGRATIONS (ci.yml 243-254): `for f in $(ls supabase/migrations/*.sql | sort)`, cada uma com `psql -v ON_ERROR_STOP=1 -q -f "$f"`, sem recorte por faixa — a pasta inteira. `sort` no glob explora que o prefixo zero-padded é lexicográfico = ordem de aplicação.

CHAMADA A `scripts/db/rodar-roteiros.sh` (ci.yml 309-312, env `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/estoque`): o runner (rodar-roteiros.sh, 148 linhas) primeiro insere `auth.users` com `ci@wap.ind.br`(linhas 74-82 do script, idempotente via `where not exists`), depois para cada roteiro em `supabase/tests/*.sql` (exceto `_*.sql`) faz `psql -v ON_ERROR_STOP=1 -f "$ASSERTS" -f "$f"` — DOIS `-f` na MESMA sessão (linha 94), pois `_asserts.sql` cria `pg_temp.assert_zero_de` que sobreviveria ao `rollback` do roteiro só se estiver fora da transação `begin;...rollback;`. Depois exige a linha `FIM <nome>: N asserções, M falhas` (linhas 107-122) e conta `(WARNING|NOTICE):\s+✗` como falha (linha 126-129), recusando roteiro com zero asserções.

TEMPO REAL MEDIDO (gh run view, run 34048980755, 06/09/2026, passo a passo do job banco-sem-docker):
- "Initialize containers" (pull+start postgres:17): 26s (17:33:47→17:34:13)
- "Garantir psql" (apt-get install): 15s (17:34:14→17:34:29)
- "Conferir o major": <1s
- "Criar o banco e aplicar o bootstrap" (4 arquivos): <1s
- "Aplicar TODAS as migrations" (126 arquivos): **6s** (17:34:29→17:34:35)
- "Determinismo" (2º banco + bootstrap×4 + 126 migrations + fingerprint×2 + diff): **6s** (17:34:35→17:34:41)
- "Rodar os roteiros de teste SQL" (25 roteiros, 577 asserções): **2s** (17:34:41→17:34:43)
- TOTAL do job: 62s. Runs comparáveis: 34048510105 (F46b PR) 67s, 34048772118 (merge na main) 54s — consistente com docs/RELATORIO-F46.md §5.5/§13.1 (job antigo com Docker: 2m48s-3m52s; job novo: 53s-67s, ≈3-4× mais rápido).
- Composição do custo: **~41s são overhead fixo** (subir o container postgres + instalar psql via apt), **~14s são trabalho real** (bootstrap+migrations+determinismo+roteiros). Reaplicar só bootstrap+126 migrations custa **~6-8s** medido (a etapa "Determinismo" faz exatamente isso uma SEGUNDA vez, em 6s).

## ci_passos_test

src/lib/ci-passos.test.ts, 554 linhas, 8 `describe` blocks, arquivo já reflete o estado PÓS-F46b (2 jobs, não 3) — leitura do HEAD atual confirmada.

Funções auxiliares: `corpoDoJob(nome)`(41-53, corta do cabeçalho `  <nome>:` até a próxima linha `^ {2}\S`) e `blocoDoJob(nome)`(71-78, corpoDoJob MAIS o bloco de comentário imediatamente acima — usado só para `banco-sem-docker` porque as cicatrizes vivem no comentário de cabeçalho, que uma remoção de job levaria junto). `semComentarios(yaml)`(56-61) filtra linhas que começam com `#` — usado nas asserções que testam O QUE EXECUTA, não o que está documentado.

`const VERIFICAR = corpoDoJob('verificar')`(80); `const BANCO_SEM_DOCKER = blocoDoJob('banco-sem-docker')`(88).

describe 1 (90-114): OBRIGATORIOS = `['npm ci','npm run lint','npm run test','npm run contraste','npm run build','npm run verificar:actions']`(91-98) — cada um `toContain` em VERIFICAR; e `verificar:actions` tem de vir DEPOIS de `build`(104-113, `expect(gate).toBeGreaterThan(build)`).

describe 2 (116-142): extrai `chamados` via `/npm run ([a-z0-9:-]+)/g` do YAML inteiro(117) e exige `Object.keys(PACOTE.scripts)).toContain(nome)` para cada um(123-125). Nomeia três scripts específicos que TÊM de existir mesmo sem serem citados no YAML: `['verificar:actions','db:test','db:test:um']`(130-135). E confirma que `db:test`/`db:test:um`/BANCO_SEM_DOCKER usam o MESMO `scripts/db/rodar-roteiros.sh`(137-141).

describe 3 (144-176): `cancel-in-progress` não é `true` incondicional(149-156); está condicionado a `pull_request`(158-160); e — **a asserção mais específica** — o `group:` contém `github.sha`(167-175): `expect(linha!).toContain('github.sha')` — é a defesa exata contra o bug do commit dab346c.

describe 4 (178-213): job chama `bash scripts/db/rodar-roteiros.sh`(179-181); NÃO tem `for f in supabase/tests`(183-185, regressão vetada); runner existe(187-189); runner carrega `_asserts.sql` ANTES do roteiro na MESMA sessão — regex `/-f\s+"\$ASSERTS"\s+-f\s+"\$f"/`(193-197); pula `_*.sql`(199-201); exige linha FIM e conta ✗ em NOTICE|WARNING(203-206).

describe 5 (215-307): cobertura do Vitest — todo `*.test.*` do repo tem de casar com algum `include:` de `vitest.config.mts`, via casador glob→regex PRÓPRIO(222-232, sem picomatch/minimatch por serem só dependência transitiva — "regra 3 do CLAUDE.md"); varre o repo inteiro ignorando `node_modules/.next/.git/.vercel/coverage`(244-256); exige >100 testes achados(286) e `orfaos` vazio(288-292); confirma os dois projetos `puro`/`componentes`(295-299) e que só `componentes` coleta `.test.tsx`(301-306).

describe 6 (309-336): cada roteiro de `supabase/tests/*.sql` (exceto `_*`) tem de emitir `raise notice 'FIM <nome>: % asserções, % falhas', v_ok + v_falhas, v_falhas;`(320-322) como ÚLTIMA instrução do último bloco `do $$` — a linha seguinte tem de casar `/^end(\s*\$\$;)?$/`(330-334), "só assim ela deixa de sair quando o roteiro aborta no meio".

describe 7 "o job de banco sem Docker existe e mede a mesma coisa" (361-502) — **É AQUI, EXATAMENTE, QUE A LISTA `[verificar, banco-sem-docker]` É AFIRMADA**:
```
376: it('os jobs do ci.yml são EXATAMENTE `verificar` e `banco-sem-docker`', () => {
377:   expect(nomesDosJobs()).toEqual(['verificar', 'banco-sem-docker'])
378: })
```
`nomesDosJobs()`(355-359) lê só dentro do bloco `\njobs:\n` via `/^ {2}([a-z][a-z0-9-]*):$/gm` — deliberadamente para não confundir `  push:` de `on:` com um nome de job (comentário linha 354: "uma regex solta sobre o arquivo inteiro devolveria `push` como se fosse job"). O comentário 362-375 explica que esta asserção SUBSTITUIU DUAS TAUTOLOGIAS achadas na revisão adversarial da F46 (um `expect(BANCO_SEM_DOCKER.length).toBeGreaterThan(0)` que nunca podia falhar de forma independente porque `corpoDoJob` já faz seu próprio `toBeGreaterThan(-1)` no carregamento do módulo).

Resto do describe 7: job de verdade — `runs-on`/`steps`/≥6 passos(380-387); chama o MESMO runner(389-392); passa `DATABASE_URL: postgresql://`(394-399); NÃO usa `supabase start/init/setup-cli`(401-413, checado em `semComentarios`); sobe `postgres:17` com health-check(415-420); bootstrap ANTES das migrations(422-430); ordem migrations→roteiros não inverte(432-439); `ON_ERROR_STOP=1` sem recorte(441-448); nenhum `|| true` nem `>/dev/null`(450-461); os 5 arquivos `supabase/ci/*.sql` existem e são citados(463-474); bootstrap NÃO concede privilégio em `public`(476-492, `not.toMatch(/on all tables/i)` etc.); RLS ligada em `storage.objects`(494-501).

describe 8 "o job banco antigo saiu — e o que ele ensinou não saiu com ele" (504-553): nenhum vestígio EXECUTÁVEL de `supabase/setup-cli`/`supabase start|init|stop`/`SUPABASE_TELEMETRY_DISABLED` no YAML fora de comentário(516-523); as DUAS cicatrizes (rate limit + PostHog) e o veto de Docker continuam no job vivo(525-536, `toContain('rate limit')`, `toContain('PostHog')`, `toContain('Docker')`); o job avisa que seu nome é o required check(538-545, `toContain('required status check')` e `toContain('required_status_checks')`); runner continua o mesmo arquivo que `db:test` chama(547-552).

Sem asserções específicas sobre "ordem dos passos" além do build→verificar:actions do describe 1 e bootstrap→migrations→roteiros do describe 7.

## labels_e_condicionais

O repositório NÃO usa `if:` condicional em job/step nenhum do ci.yml hoje — a única expressão condicional existente é a do `concurrency:` (linhas 38-39, `github.event_name == 'pull_request'`). `.github/dependabot.yml` usa `labels:`(linhas 14, 31) mas só para RÓTULOS DE PR ABERTO PELO DEPENDABOT, sem relação com execução condicional de job. Não há `workflow_dispatch` em lugar nenhum. `grep -rn 'github.event_name|labels|workflow_dispatch|contains(github|if:\s' .github` só devolve essas 4 ocorrências (2 do concurrency, 2 do dependabot.yml).

SINTAXE CORRETA CONFIRMADA (docs.github.com, WebFetch em 06/09/2026):
- Fonte: https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/using-conditions-to-control-job-execution — `jobs.<job_id>.if` aceita qualquer contexto/expressão suportado.
- Padrão confirmado por busca (sirlisko.com/blog, niklasmtj.de e Discussions oficiais do GitHub, convergentes) para "push na main OU PR com label X":
  ```yaml
  if: github.ref == 'refs/heads/main' || contains(github.event.pull_request.labels.*.name, 'nome-do-label')
  ```
  (equivalente com `github.event_name == 'push'` no lugar do `github.ref`, já que o `on:` deste repo só faz push em `main`).
- ARMADILHA DE GATILHO: o `pull_request:` deste ci.yml não declara `types:`, o que por padrão só dispara em `opened`/`synchronize`/`reopened` — **rotular um PR depois de aberto NÃO recomeça o workflow** a menos que `types: [labeled, opened, synchronize, reopened]` seja acrescentado (ou o rótulo já esteja presente no push seguinte, que dispara por `synchronize`).

⚠ **A RESTRIÇÃO INEGOCIÁVEL, CONFIRMADA NA FONTE OFICIAL**: "A job that is skipped will report its status as 'Success'. It will not prevent a pull request from merging, even if it is a required check." (mesma página acima). Ou seja: **um job/step condicional que é pulado por `if:` reporta SUCESSO, não ausência** — se ele estiver na lista de required status checks, um PR sem o label (ou sem a condição satisfeita) passa pelo gate mesmo sem o job ter rodado NADA. Isso é exatamente o modo como o F46 já formalizou "o nome do job é contrato" (ci.yml linhas 160-173, ci-passos.test.ts linhas 538-545): qualquer condicional aplicada a um job/step que hoje é (ou vier a ser) required precisa nascer SEMPRE-VERDADEIRA nas condições de gate, nunca dependente de label/ação humana.

## recomendacao

**Decisão 2, com números**: o injetor de mutações deve entrar como PASSO(S) adicionais dentro do job `banco-sem-docker` já existente — não como job próprio — e deve rodar INCONDICIONALMENTE (sem gate por label), pelos seguintes números e pela restrição inegociável:

1. **Custo de reaplicar bootstrap + 126 migrations, medido ao vivo (run 34048980755, 06/09/2026)**: a própria etapa "Determinismo" do job atual já faz exatamente essa reaplicação — cria um 2º banco limpo, roda os 4 bootstraps e as 126 migrations do zero — e o passo inteiro (incluindo fingerprint × 2 + diff) leva **6 segundos**. Isolando: bootstrap(<1s) + 126 migrations(6s, medido separadamente na etapa "Aplicar TODAS as migrations") ≈ **6-8s** por rodada extra dentro da MESMA sessão de job.

2. **Custo de um job PRÓPRIO, separado**: pagaria de novo os **~41s de overhead fixo** que hoje só acontecem uma vez por job — "Initialize containers" (subir o `postgres:17` como serviço, 26s medido) + "Garantir psql" (apt-get install postgresql-client, 15s medido) — antes de chegar a qualquer bootstrap/migration/mutação. Isso é **5-7× o custo da reaplicação em si**. Contra o pano de fundo desta fase (F45→F46→F46b existiram justamente para cortar o job de banco de 2m48s-3m52s para 53s-67s, ≈3-4×), abrir um job novo devolveria de propósito boa parte do tempo que essas três fases economizaram — o oposto do padrão que o próprio histórico do repositório estabelece.

3. **O que muda na lista de jobs travada**: `ci-passos.test.ts:376-378` afirma `expect(nomesDosJobs()).toEqual(['verificar', 'banco-sem-docker'])` — literal e exato. Um job de injetor separado (`mutantes`, `deriva-gate`, ou nome equivalente) QUEBRARIA essa asserção e exigiria reescrevê-la para uma lista de 3, além de, se for required check, repetir todo o ritual do F46/F46b (branch protection primeiro, promoção só depois de N runs verdes, nunca renomear sem trocar a proteção no mesmo movimento — ci.yml linhas 160-173). Um PASSO dentro do job existente não toca essa lista, não toca `required_status_checks`, e herda o `banco-sem-docker` como required check já vigente — zero fricção de branch protection.

4. **A restrição inegociável**: confirmado na fonte oficial do GitHub (docs.github.com/.../using-conditions-to-control-job-execution) que **um job ou step pulado por `if:` reporta status "Success" e não bloqueia merge, mesmo sendo required check**. Isso proíbe, categoricamente, gatear o injetor de mutações (ou o gate de deriva) atrás de uma label de PR se a intenção é que ele efetivamente reprove o CI quando encontrar uma mutação não detectada ou uma tabela/coluna/função sem tipo TS correspondente — um PR sem o label passaria "verde" sem o gate ter rodado, contradizendo o propósito declarado da F47 ("exige que o roteiro SQL correspondente acuse o CENÁRIO NOMEADO"). Se Johnny quiser uma bateria de mutação MAIS PESADA e opcional (ex.: um conjunto grande de cenários, só sob demanda), essa SIM pode ser condicionada por label/`workflow_dispatch` — mas nesse caso ela nunca deve entrar em `required_status_checks`, exatamente pela mesma razão.

**Recomendação final**: acrescentar ao job `banco-sem-docker` — depois do passo "Rodar os roteiros de teste SQL" (ci.yml linha 309-312) e reaproveitando a MESMA sessão de banco `estoque` já bootstrapada e migrada (ou, se a mutação for destrutiva de schema/estado, um 3º banco criado com o mesmo padrão do banco `determinismo`, custando os mesmos ~6-8s medidos) — um novo passo "Injetor de mutações — cada cenário nomeado tem de ser acusado", incondicional, sem `if:`. O gate de deriva TS↔SQL (tabela/coluna/função que `database.ts` não tem) é ainda mais barato de anexar: já existe a impressão-digital por classe rodando em `impressao-schema.sql` a cada CI (11 classes, 665 objetos, medido em §7.3 do RELATORIO-F46), então comparar essas classes contra os tipos gerados é uma consulta a mais sobre dado já calculado, não um bootstrap novo.