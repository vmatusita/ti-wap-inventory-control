# PLAN-F46 — A trava de hash das migrations e o CI de banco sem Docker

*Escrito em 06/09/2026, antes de implementar a frente 2. Fonte de escopo: ficha da F46 em
`docs/PLANO-MULTIEMPRESA.md` §5; ordem de serviço em
`docs/prompts/F46-trava-de-hash-e-ci-sem-docker-ultracode.md`.*

Este documento é o gabarito da revisão. Ele registra **o que foi decidido e por quê**, com a
medição que sustenta cada decisão. O relatório final (`docs/RELATORIO-F46.md`) traz as evidências.

---

## 0. O diagnóstico do prompt, conferido item a item

| # | O que o prompt afirma | Conferido | Resultado |
|---|---|---|---|
| 1 | 126 arquivos, última `0127`, `0029` é gap real | `ls \| wc -l` = 126; última `0127_conversao_reservas.sql` | ✅ bate |
| 2 | Job `banco` usa `setup-cli` + `supabase init` + `supabase start` | leitura do `ci.yml` | ✅ bate |
| 3 | Required checks da `main` = `verificar` e `banco` | `gh api …/branches/main/protection` → `["verificar","banco"]` | ✅ bate |
| 4 | Nenhuma extensão necessária | `grep -rn 'create extension'` = 0; `digest/crypt/gen_salt` = 0 | ✅ bate |
| 5 | Produção é Postgres 17 | não alcançável desta máquina — ver §6 | ⚠ decidido por documento |
| 6 | O `/dev` não tem veredito de ledger | **NÃO bate** — ver §5 | ❌ divergência |

E as duas ausências que a lição do §15 da F45 manda conferir pelo gerenciador de pacotes e pelo
disco, não pelo `PATH`:

- **`gh`** — *existe*: `C:\Program Files\GitHub CLI\gh.exe`, versão 2.100.0, conta `vmatusita`
  autenticada com escopo `repo`. Usado nesta fase.
- **Docker** — *não existe*, e desta vez com prova positiva: `winget list --name Docker` não acha
  pacote; `C:\Program Files\Docker` existe mas está **vazio**; `C:\ProgramData\DockerDesktop`
  contém **só logs de instalação/desinstalação**; nenhum `docker*.exe` em `C:\Program Files`,
  `C:\Program Files (x86)` ou `C:\ProgramData`; nenhum serviço `*docker*`. É desinstalação, não
  ausência de `PATH`.
- **PostgreSQL** — *não existe*: `winget list --name PostgreSQL` não acha pacote;
  `C:\Program Files\PostgreSQL` não existe; `psql`, `pg_ctl` e `postgres` fora do disco.

**Consequência de método:** a frente 2 não pode ser ensaiada nesta mesa. A iteração é
commit → push → ler o job no GitHub Actions, com anti-loop de três tentativas por hipótese.

---

## 1. A ordem de entrega (não é livre)

A ficha declara a mitigação do maior risco do bloco: *se o bootstrap falhar, a fase entrega só a
trava de hash e o bootstrap vira backlog nomeado*. Isso só é possível se a trava vier primeiro e
inteira.

1. **Frente 1 — a trava de hash.** Fecha sozinha, sem banco nenhum. **JÁ COMMITADA** (`3c96378`).
2. **Frente 2 — o bootstrap e o job novo.** Iterada em cima da frente 1 já commitada.

---

## 2. Frente 1 — a trava de hash

### 2.1 Arquivos

| Arquivo | Papel |
|---|---|
| `supabase/migrations.lock.json` | O catálogo travado: 126 entradas `arquivo → sha256`. |
| `src/lib/validators/migrations-lock.ts` | As funções **puras**: normalizar, hash, conferir. Não escreve. |
| `src/lib/validators/migrations-lock.test.ts` | A guarda. 14 asserções. |
| `scripts/db/gravar-lock.ts` + `npm run db:lock` | O **único** ponto que escreve o lock. |

**Por que a lógica mora num módulo compartilhado** e não duplicada nos dois: um "normalizei
diferente" entre gravador e conferente faria a trava acusar deriva que não existe. É a mesma
doutrina das guardas TS↔SQL do repositório (`chave-sql.test.ts`, `tipos-item-sql.test.ts`).

### 2.2 A normalização — medida, não suposta

O hash é do conteúdo com `\r\n` → `\n`, **em bytes** (ler como utf8 e reserializar faria o hash
depender do round-trip de codificação).

Medição de 06/09/2026 que prova que isso é obrigatório, não decorativo:

| Arquivo | Linhas com CR na árvore de trabalho (Windows) |
|---|---|
| `0001_profiles.sql` | 51 |
| `0031_import_logs.sql` | 0 |
| `0127_conversao_reservas.sql` | 322 |

E a prova de que a normalização resolve: **os 126 hashes do lock são idênticos ao sha256 do blob
do git** — que é exatamente o conteúdo que o Linux do CI recebe no checkout. Sem normalizar, o
mesmo arquivo teria dois hashes e a trava acusaria deriva a cada clone.

### 2.3 As três classes de problema, e por que as mensagens são diferentes

| Classe | Quando | Resposta certa | A mensagem cita `db:lock`? |
|---|---|---|---|
| `alterada` | migration travada mudou de conteúdo | desfazer e escrever migration **nova** | **não** — seria mandar apagar a prova |
| `sumiu` | migration travada apagada ou renomeada | restaurar o nome original | não |
| `nova` | migration nova ainda não travada | `npm run db:lock`, mesmo commit | **sim** |

### 2.4 A decisão que a ordem delegou: migration nova **reprova**

A ficha diz "arquivo novo é aceito e o executor regrava o lock no mesmo commit"; a ordem diz que o
comportamento é decisão de quem executa, documentada. **Escolhi reprovar**, com a mensagem dando a
linha a rodar. Motivos:

1. Sem isso, o critério de aceitação 1 ("uma entrada por arquivo") valeria só no dia da entrega e
   apodreceria em silêncio a cada migration nova.
2. "O executor regrava no mesmo commit" passaria a depender de alguém **lembrar** — que é
   exatamente o que a regra 8 do `CLAUDE.md` diz que uma regra não pode fazer ("A regra não depende
   de ninguém lembrar dela").
3. Reprovar **não bloqueia o fluxo normal**: a resposta é uma linha, e ela está na mensagem de erro.

"Aceito", na ficha, quer dizer *acrescentar migration não é ato proibido* — em contraste com
editar, que é. Isso continua verdadeiro.

---

## 3. Frente 2 — o bootstrap

### 3.1 O achado que decidiu o desenho

A leitura ingênua diz "o bootstrap precisa reproduzir os *default privileges* do Supabase
hospedado, senão `authenticated` não tem SELECT em `public.ativos`". **Está errado para este
repositório**, e quem diz isso é o próprio roteiro, em `supabase/tests/papeis_rls.sql:60-62`:

> `que o job` banco `do CI sobe com` supabase start `**não** reproduz esses defaults, então lá`
> `authenticated` não tem nem SELECT em `public.ativos`.

Ou seja: o job **antigo** também não tem os defaults, e os roteiros já se blindam plantando os
próprios `grant` explícitos, tabela por tabela e verbo por verbo, no topo de cada arquivo — com o
comentário dizendo qual asserção usa cada um. O roteiro proíbe por escrito o atalho
`grant … on all tables`, porque ele mascararia um REVOKE futuro.

**Portanto o bootstrap NÃO concede privilégio nenhum em `public`.** Conceder seria o erro que a
ordem nomeia ("cuidado com o excesso, não só com a falta"): faria `seguranca_catalogo.sql` passar
por motivo errado e o job novo reportar verde para um ambiente mais permissivo que produção.

### 3.2 O inventário, bloco a bloco, com a linha que o exige

Levantado por varredura própria das 126 migrations e dos 25 roteiros.

| Arquivo | Bloco | Existe porque |
|---|---|---|
| `bootstrap-roles.sql` | `anon`, `authenticated`, `service_role` (`nologin noinherit`; `service_role` com `bypassrls`) | 175 `to authenticated` em policies/grants; 101 `revoke … from public, anon`; `set local role authenticated` em 8 roteiros e `service_role` em `dev_destrutivo.sql:366` |
| `bootstrap-auth.sql` | `create schema auth` + `usage` para os três | 90 `auth.uid()`, 53 `auth.users` — nada disso resolve sem o schema |
| | `auth.users` (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at) | `0001_profiles.sql:9` (FK) e `:35` (trigger); `0001:31` lê `raw_user_meta_data ->> 'nome'`; `0057` lê `'sobrenome'`; 10 roteiros inserem com as 9 colunas (ex.: `cargo_dev.sql:133`); `scripts/db/rodar-roteiros.sh:74-82` insere o operador `ci@wap.ind.br` |
| | `auth.uid()` | 90 usos. Definição **canônica do Supabase**, copiada verbatim (ver §3.3) |
| | `auth.sessions` (id, user_id → users, cascade) | `0074_rpcs_gestao_usuarios.sql:378` faz `delete from auth.sessions where user_id = …`; `cargo_dev.sql:525` chama a RPC |
| | `auth.refresh_tokens` (session_id → sessions, **on delete cascade**) | `0074` promete por escrito que "os refresh tokens caem por cascade". Sem a FK a promessa é falsa — a RPC roda, o efeito não existe |
| `bootstrap-storage.sql` | `create schema storage` + `usage` para os três | 82 `storage.objects`, 4 `storage.buckets`. Nenhuma migration cria o schema |
| | `storage.buckets` (id PK, name, public) | `0021:49` e `0031:53` inserem `termos` e `backups-import` com `on conflict (id) do nothing` |
| | `storage.objects` (id PK default, bucket_id → buckets, name, owner) + **RLS habilitada** | 8 policies criadas em `0021:55-62` e `0031:60-67`, reescritas em `0066/0069/0070/0072`; roteiros inserem `(bucket_id, name, owner)` (`cargo_dev.sql:285`, `dev_destrutivo.sql:221`, `papeis_rls.sql:248`). **RLS ligada** porque nenhuma migration a liga e `papeis_rls.sql` 6a..6f mede negativa — sem RLS a policy não tem efeito e a asserção passaria por engano |
| `bootstrap-ledger.sql` | `create schema supabase_migrations` + `schema_migrations` vazia | `0077:47` faz `select max(version) … from supabase_migrations.schema_migrations` e só captura `undefined_table` (42P01). Sem o **schema**, o erro é `invalid_schema_name` (3F000), que aquele `exception when` **não** captura (ver §5.2) |

**O que NÃO entra, e por quê:**

- **Nenhum `grant` em `public`** — §3.1.
- **Nenhum `alter default privileges`** — mesma razão: o `supabase start` do job antigo também não
  os tem, e o alvo é o veredito igual.
- **PostgREST** — os 15 `notify pgrst` (14 em comentário, 1 vivo em `0126:879`) são inócuos sem
  ouvinte.
- **Publication `supabase_realtime`** — `0009` e `0018` já a criam com guarda `if not exists`.
- **Nenhuma extensão** — `create extension` = 0 nas 126; `gen_random_uuid()` é núcleo desde o PG13;
  `unaccent`/`citext` são proibidos por escrito nas `0043`/`0112`/`0125`; pgcrypto não é usado (o
  hash de senha é `crypto.scrypt` em Node).
- **O trigger `handle_new_user`** — quem o cria é a migration `0001`, não o bootstrap.

### 3.3 Fidelidade às definições oficiais (regra 6 do `CLAUDE.md`)

Conferido na fonte, não de memória:

- **Roles** — `supabase/postgres`, `migrations/db/init-scripts/00000000000000-initial-schema.sql`:
  `create role anon nologin noinherit`, `create role authenticated nologin noinherit`,
  `create role service_role nologin noinherit bypassrls`.
- **`auth.uid()`** — `supabase/auth`, `migrations/20211202183645_update_auth_uid.up.sql`:
  ```sql
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
  ```
  É a forma que os roteiros exercitam: eles montam
  `set_config('request.jwt.claims', json_build_object('sub', …)::text, true)`.

### 3.4 O job novo

Nome: **`banco-sem-docker`**. Em paralelo ao `banco` antigo, que fica **intacto** — nome, passos e
comentários-cicatriz. Não é *required check* nesta fase (backlog nomeado, com o comando pronto).

```
services: postgres:17
  → psql -f supabase/ci/bootstrap-roles.sql
  → psql -f supabase/ci/bootstrap-auth.sql
  → psql -f supabase/ci/bootstrap-storage.sql
  → psql -f supabase/ci/bootstrap-ledger.sql
  → as 126 migrations em ordem, uma a uma, ON_ERROR_STOP=1
  → a segunda aplicação, MEDIDA, num banco SEPARADO (§4)
  → DATABASE_URL=… bash scripts/db/rodar-roteiros.sh    ← o MESMO script do job antigo
```

**Por que `banco` não é renomeado:** desde 05/09 ele é *required status check* pelo NOME. Renomear
deixaria o check exigido sem nunca reportar, e todo PR — inclusive o desta fase — ficaria preso em
*"Expected — Waiting for status to be reported"*.

---

## 4. A decisão obrigatória: a segunda aplicação

**Medição estática, feita antes de decidir**, sobre as 126 com os comentários de linha removidos
(`sed 's/--.*$//'`), para não contar menção em comentário:

| Classe | Total | Com guarda | Quebrariam numa 2ª passada |
|---|---|---|---|
| `create policy` | 69 | 8 `drop policy if exists` no arquivo inteiro | ~61 |
| `create index` / `create unique index` | 53 | 8 com `if not exists` | 45 |
| `create type` | 7 | 0 — a sintaxe `if not exists` **não existe** no Postgres | 7 |
| `create trigger` | 7 | 0 (`create or replace trigger` = 0) | 7 |
| `alter table … add column` | 25 | 7 com `if not exists` | 18 |
| `alter type … add value` | 7 | 6 com `if not exists` | 1 (`0071`) |
| `create view` sem `or replace` | 4 | — | 4 (`0052` ×2, `0112` ×2) |
| `add constraint` vivo | 1 (`0045`) | — | 1 |
| `insert into` de topo sem guarda | 1 (`0114`) | os outros 7 usam `on conflict`/`not exists` | 1 |

> ⚠ **Correção de uma medição minha, apanhada na revisão adversarial.** Eu havia escrito que a
> `0007_seeds_fixos.sql` seria a primeira a quebrar. **Está errado:** os dois `insert` dela têm
> `on conflict … do nothing`, e o comentário do próprio arquivo diz isso. O único `insert` de topo
> sem guarda em todo o repositório é o da `0114`. Fica registrado porque o número errado ia para
> o relatório como evidência.

**A primeira falha real de uma segunda passada é a `0001`**, e não por policy: ela abre com
`create table public.profiles (` **sem** `if not exists` → `42P07 duplicate_table`. Ou seja, a
segunda aplicação morre no **primeiro arquivo da cadeia**.

**Conclusão: a opção (a) — "manter a segunda passada como passo que reprova, se o conjunto aplicar
limpo duas vezes" — está morta antes de começar,** e isso é demonstrável estaticamente, sem CI.
As migrations deste repositório foram escritas para rodar uma vez. Torná-las idempotentes é
**editar migration aplicada** — exatamente o que o `migrations.lock.json` passa a proibir no mesmo
commit: a fase se contradiria.

A opção (b) — catálogo de não-idempotentes que só reprova se crescer — também foi **descartada, e
pela medição acima**: o catálogo listaria quase todos os 126 arquivos, porque praticamente toda
migration cria algum objeto sem guarda. Um catálogo que diz "quase todos" não tem sinal; a pergunta
"a lista cresceu?" viraria ruído, e um passo cujo verde não significa nada é a coisa que a F45
existiu para matar.

**Escolha: (c) — trocar o critério por outra prova de determinismo, registrando a substituição.**

A pergunta que "aplicar duas vezes" tentava responder é *a cadeia produz sempre o mesmo schema?*.
Essa pergunta tem resposta, e o repositório **já tem a ferramenta**: a sonda de fingerprint por
classe do `docs/RUNBOOK-BANCO.md` (10 classes — funções, colunas, constraints, índices, policies,
views, enums, triggers, flag de RLS e grants de função), que a F19 usou para provar paridade
ensaio × produção e que já vem com as duas lições cicatrizadas nela: **normaliza espaço em branco**
(o falso-positivo de CRLF de 25/07/2026) e ignora comentário.

O passo, então:

- **Dois bancos limpos** no mesmo serviço Postgres (`estoque` e `determinismo`), cada um com o
  mesmo bootstrap e a mesma cadeia de 126 aplicada do zero, independentemente.
- A sonda roda nos dois e as saídas são comparadas com `diff`. **Divergência reprova o passo.**
- O banco de determinismo é **separado de propósito**: reaplicar a cadeia por cima do banco dos
  roteiros poderia mudá-lo (um `update` de backfill roda de novo) e trocaria a prova do critério 5
  por outra coisa.
- A saída traz a contagem de objetos por classe, que é diagnóstico útil no log e comparável com a
  contagem registrada no `RUNBOOK-BANCO.md`.
- Proibido, e não feito: `|| true`, `ON_ERROR_STOP` desligado, saída descartada.

A substituição é registrada em `docs/DECISOES.md` e no relatório, com a medição acima como
justificativa — como a ordem exige ("nenhuma pode ser silenciosa").

---

## 5. As divergências entre a ficha e o código

### 5.1 O "campo ledger em dia" do `/dev` — a ficha e o prompt estão **os dois** parcialmente errados

- A **ficha** manda "apagar o campo *ledger em dia* do `/dev`".
- O **prompt** (achado 3) diz que ele **não existe** e manda não inventar remoção.

**Medido:** os dois erram por metade.

- `src/components/dev/diagnostico-painel.tsx` **não** mostra veredito — mostra os dois campos lado
  a lado e um parágrafo dizendo que não se comparam. O prompt acerta aqui.
- `src/lib/queries/dev.ts:116-119` **calcula** `migracoesEmDia`, e o cálculo é
  `migracaoNoBanco >= migracaoNoRepo` — comparação de **string** entre `"0127_conversao_reservas"`
  e `"20260730123751"`, que é exatamente o veredito inventado que a ficha quer fora. Ele está no
  tipo `Diagnostico` (`:68`) e **não é lido por componente nenhum** (`grep -rn migracoesEmDia src/`
  → só a declaração e o cálculo). É código morto que devolve um booleano sem significado.

**Ação, exatamente como a ordem instrui** ("se houver comparação automática em algum lugar […]
apague **o veredito**, nunca os dois campos informativos"): remover `migracoesEmDia` do tipo e do
retorno. Os dois campos informativos e o parágrafo explicativo ficam.

### 5.2 O comentário da `0077` promete mais do que a função entrega

`ultima_migracao_aplicada()` diz devolver NULL "se a tabela de controle não existir", e captura só
`undefined_table` (42P01, schema existe / tabela não). Num banco sem o **schema** `supabase_migrations`
o erro é `invalid_schema_name` (3F000), não capturado — a RPC estoura.

**Não é consertado nesta fase** (seria editar migration aplicada). Fica registrado, e o bootstrap
cria o schema, o que torna o caso inalcançável no CI. Vai para o backlog do relatório.

### 5.3 Duas listas a atualizar quando nasce migration

`src/lib/itens/migrations-f38.test.ts` já exige que toda migration a partir da `0116` esteja numa
lista dele. A trava desta fase é a segunda. Quem acrescentar migration atualiza as duas — registrado
no `RUNBOOK-BANCO.md`.

### 5.4 Contagem de roteiros

A ficha diz "7 dos 24 roteiros"; a F45 mediu **25 roteiros / 577 asserções**, e é esse o número que
o critério 5 cobra. A ficha é anterior à F45.

---

## 6. O major de Postgres

Produção é **Postgres 17** (`docs/SYSTEM-DESIGN-2026-08-30.md`); o `PLANEJAMENTO.md` ainda diz
"15+", que é de 09/07 e está desatualizado. Esta máquina não alcança ensaio nem produção (sem MCP
do Supabase nesta sessão, e a regra permanente 5 proíbe rodar roteiro contra produção), então
`select version()` não é possível daqui. **Fixado no major 17**, com a decisão registrada — como a
própria ordem autoriza ("se não alcançar, fixe o major 17, registre a decisão e siga").

---

## 7. O que fica de fora (e não se antecipa)

- Branch protection — nada muda. Promover `banco-sem-docker` a required é entrega avulsa, depois de
  três pushes verdes.
- O job `banco` antigo — não renomeado, não apagado, comentários intactos.
- Qualquer migration existente — nem para idempotência, nem para typo.
- Renomear migrations para o padrão timestamp.
- `pg`/`postgres`/`supabase` como dependência npm; qualquer aplicador com conexão a produção.
- `scripts/db/rodar-roteiros.sh` como reescrita.
- Os roteiros de `supabase/tests/` — se algum ficar vermelho no job novo, o defeito é do bootstrap.
- `src/lib/types/database.ts`, telas, permissões, produção e dado real.

---

## 8. A verificação de ponta a ponta

| # | Critério | Como se prova |
|---|---|---|
| 1 | lock com uma entrada por arquivo, hash normalizado | 126 = 126; os 126 hashes == sha256 do blob do git |
| 2 | um byte alterado reprova nomeando o arquivo | sabotagem 1, saída colada |
| 3 | apagar/renomear reprova | sabotagens 2 e 2b, saídas coladas |
| 4 | migration nova: fluxo documentado devolve o verde | sabotagem 3 (partes A/B/C) + `RUNBOOK-BANCO.md` |
| 5 | job novo == job antigo no MESMO commit | 25 roteiros, 577 asserções, 0 falhas, nenhum zero — os dois blocos lado a lado |
| 6 | job novo sem `supabase start`/`init`/`setup-cli`, tempo medido | `ci-passos.test.ts` + os dois tempos |
| 7 | 126 aplicam do zero por `psql`, `ON_ERROR_STOP=1`, sem recorte | saída do passo |
| 8 | segunda aplicação medida, desfecho registrado | §4 + catálogo versionado |
| 9 | `banco` antigo intacto; required checks inalterados | `ci-passos.test.ts` + `gh api` depois do merge |
| 10 | 6 comandos limpos | saídas coladas |
| 11 | regra 8 fechada | `1.51.0` + registry + CHANGELOG + tag `v1.51.0` |
| 12 | ata com dívida A **aberta**, 2ª aplicação, divergência do `/dev`, major do Postgres | `docs/DECISOES.md` |
| 13 | PR mergeado, checks verdes, nenhuma branch, árvore limpa | estado final |
