# Relatório da F46 — A trava de hash das migrations e o CI de banco sem Docker

**Versão `1.51.0` · 06/09/2026 · PR [#23](https://github.com/vmatusita/ti-wap-inventory-control/pull/23) · branch `f46-trava-de-hash`**

Segunda fase do `docs/PLANO-MULTIEMPRESA.md` (§5, Bloco A). Duas coisas que o repositório repetia
por escrito e não defendia com código:

1. *"Nunca edite uma migration já aplicada"* estava no `CLAUDE.md`, no `docs/RUNBOOK-BANCO.md` e na
   regra 8 do §4 do plano — e **nada impedia**. Um byte alterado na `0031` passava por `lint`,
   `test`, `build` e pelo job `banco` **verde**, porque aquele job aplica a cadeia num banco NOVO:
   ele prova que as 126 aplicam limpo, nunca que são as mesmas de ontem.
2. O job `banco` subia o **stack Docker inteiro do Supabase CLI** para usar dele só um Postgres.

**Sem migration, sem dependência nova, sem mudança de schema, sem tocar na branch protection.**
A última migration continua sendo a `0127`.

---

## 1. O resultado, em números

| | Antes | Depois |
|---|---|---|
| Editar um byte de migration aplicada | passa por tudo, **verde** | **reprova** `npm run test`, nomeando o arquivo |
| Job de banco no CI | `banco`, 2m48s–3m52s, Docker do Supabase | `banco` **intacto** + `banco-sem-docker`, **53–60s**, sem Docker |
| Bootstrap do banco de teste | escondido numa imagem de terceiro | `supabase/ci/bootstrap-*.sql`, versionado e comentado |
| "Aplicar duas vezes" | pedido pela ficha, nunca medido | **medido** (morre na `0001`) e trocado por prova de determinismo |
| `src/lib/ci-passos.test.ts` | 60 casos | **81** casos |
| Suíte total | 3.632 testes | **3.667** testes (154 arquivos) |

---

## 2. O diagnóstico do prompt, conferido item a item

A ordem manda conferir cada ponto e tratar divergência como achado nº 1.

| # | O prompt afirma | Como conferi | Resultado |
|---|---|---|---|
| 1 | 126 arquivos, última `0127`, `0029` é gap real | `ls supabase/migrations \| wc -l` | ✅ 126; última `0127_conversao_reservas.sql` |
| 2 | Job `banco` usa `setup-cli` + `init` + `start` | leitura do `ci.yml` | ✅ bate |
| 3 | Required checks = `verificar` e `banco` | `gh api …/branches/main/protection` | ✅ `["verificar","banco"]` |
| 4 | Nenhuma extensão necessária | `grep -rn 'create extension'` = 0; `digest\|crypt\|gen_salt` = 0 | ✅ bate |
| 5 | Produção é Postgres 17 | não alcançável desta máquina — §7 | ⚠ fixado por documento |
| 6 | O `/dev` não tem veredito de ledger | `grep -rn migracoesEmDia src/` | ❌ **divergência — §6.1** |

### 2.1 As duas ausências, conferidas pelo método do §15 da F45

O §15 do relatório da F45 registra o erro de declarar o `gh` ausente a partir de dois
`command not found`. A regra que ficou: *"comando não encontrado" é hipótese, não conclusão* —
confira pelo gerenciador de pacotes ou pelo disco. Aplicada aqui, às três ferramentas:

- **`gh` — EXISTE.** `C:\Program Files\GitHub CLI\gh.exe`, versão 2.100.0, conta `vmatusita`
  autenticada, escopo `repo`. Usado nesta fase o tempo inteiro (PR, `gh run watch`, `gh run view`).
- **Docker — NÃO existe**, e desta vez com prova positiva, não com um `command not found`:

  ```
  winget list --name Docker      → No installed package found matching input criteria.
  C:\Program Files\Docker        → existe, mas VAZIO (0 arquivos)
  C:\ProgramData\DockerDesktop   → só install-cli-log-admin*.txt e install-log-admin*.txt
  Get-ChildItem -Filter 'docker*.exe' -Recurse em Program Files / (x86) / ProgramData → nada
  Get-Service '*docker*'         → nada
  ```

  Diretório vazio + logs de instalação + zero executável + zero serviço = **desinstalação**, não
  ausência de `PATH`.
- **PostgreSQL — NÃO existe.** `winget list --name PostgreSQL` não acha pacote;
  `C:\Program Files\PostgreSQL` não existe; `psql`, `pg_ctl` e `postgres` fora do disco.

**Consequência de método:** a frente 2 não podia ser ensaiada nesta mesa. A iteração seria
commit → push → ler o job no GitHub Actions. Na prática **bastou um push** (§4.1).

---

## 3. Frente 1 — a trava de hash

### 3.1 O que mudou, por arquivo

| Arquivo | O que é | Por que assim |
|---|---|---|
| `supabase/migrations.lock.json` | 126 entradas `arquivo → sha256` | O catálogo travado. Cabeçalho `_leia` porque JSON não tem comentário e quem o abre acabou de ser reprovado pelo CI |
| `src/lib/validators/migrations-lock.ts` | funções **puras**: normalizar, hash, conferir | Não lê `process.cwd()` sozinha, não escreve. É o módulo que gravador e conferente **compartilham** |
| `src/lib/validators/migrations-lock.test.ts` | a guarda — 14 casos | Varredura do repositório real **+** casos sintéticos que provam que ela sabe reprovar |
| `scripts/db/gravar-lock.ts` + `npm run db:lock` | o **único** ponto que escreve o lock | Guarda anti-Vitest (exit 1, sem gravar); e **RECUSA** regravar migration já travada que mudou — §4.5 |

**Por que a lógica mora num módulo compartilhado, e não duplicada nos dois lados:** um "normalizei
diferente" entre gravador e conferente faria a trava acusar deriva que não existe. É a mesma
doutrina das guardas TS↔SQL do repositório (`chave-sql.test.ts`, `tipos-item-sql.test.ts`).

### 3.2 A normalização — medida, não suposta

O hash é do conteúdo com `\r\n` → `\n`, **em bytes** (ler como utf8 e reserializar faria o hash
depender do round-trip de codificação — BOM, sequência inválida).

Medição de 06/09/2026, na árvore de trabalho do Windows:

| Arquivo | Linhas com CR |
|---|---|
| `0001_profiles.sql` | 51 |
| `0031_import_logs.sql` | 0 |
| `0127_conversao_reservas.sql` | 322 |

E a prova de que a normalização resolve — **os 126 hashes do lock são idênticos ao sha256 do blob
do git**, que é exatamente o conteúdo que o Linux do CI recebe no checkout:

```
$ node -e "…compara cada entrada do lock com sha256(git show HEAD:<arquivo>)…"
  iguais ao blob do git: 126 de 126
```

Sem normalizar, o mesmo arquivo teria dois hashes — um no Windows, outro no Linux — e a trava
acusaria deriva a cada clone, o que a treinaria a ser ignorada.

### 3.3 As três classes de problema, e por que as mensagens são diferentes

A resposta certa a cada classe é diferente, e uma mensagem genérica ("o lock não bate") empurraria
as três para a mesma saída errada — regravar o lock.

| Classe | Quando | Resposta certa | Cita `db:lock`? |
|---|---|---|---|
| `alterada` | migration travada mudou de conteúdo | desfazer e escrever migration **nova** | **não** — seria mandar apagar a prova |
| `sumiu` | apagada ou renomeada | restaurar o nome original | não |
| `nova` | migration nova ainda não travada | `npm run db:lock`, mesmo commit | **sim** |

### 3.4 A decisão que a ordem delegou

**Isto CONTRADIZ a letra da ficha, e a contradição fica registrada em vez de maquiada.** A ficha
diz, com todas as letras, *"arquivo novo é **aceito** e o executor regrava o lock no mesmo commit"*,
e o Escopo da ordem repete *"Arquivo novo é aceito (migration nova é o fluxo normal)"*. Eu escolhi
**reprovar**.

O que autoriza a escolha não é uma releitura conveniente daquela frase — é a delegação explícita, na
seção "A trava" da própria ordem: *"uma migration nova sem regravar o lock → **o comportamento é o
que você decidiu e documentado**"*. Duas partes do mesmo documento discordam; a que delega é a mais
específica, e ela manda decidir e documentar. É o que esta seção e a ata em `docs/DECISOES.md` fazem.

Os motivos:

1. Sem isso, o critério de aceitação 1 ("uma entrada por arquivo") valeria **só no dia da entrega** e
   apodreceria em silêncio a cada migration nova — o lock viraria um catálogo parcial em que
   ninguém confia.
2. "O executor regrava no mesmo commit" passaria a depender de alguém **lembrar** — que é
   exatamente o que a regra 8 do `CLAUDE.md` diz que uma regra não pode fazer ("A regra não depende
   de ninguém lembrar dela").
3. Reprovar **não bloqueia o fluxo normal**: a resposta é uma linha, e ela está dentro da própria
   mensagem de erro.

O que eu **não** posso afirmar é que "aceito" já significava isso. A leitura que sustenta a escolha
é que *acrescentar migration não é ato proibido* — em contraste com editar, que é —, e essa
continua verdadeira. Mas é leitura minha, e a ficha comporta a outra. Se o Johnny preferir a letra,
é remover a classe `nova` de `conferirLock`: uma condição, com teste unitário próprio.

---

## 4. A prova de que a trava sabe ficar vermelha — as sabotagens

A trava **nasce verde** (é varredura de catálogo, regra 4 do §4 do plano), então provar que ela
sabe ficar vermelha é obrigação deste relatório. A ordem pede três sabotagens; são **quatro** de
trava (§4.1 a §4.4) mais duas guardas do gravador (§4.5), cada uma desfeita logo depois. Saídas
completas em `docs/f46-evidencias/sabotagem-*.txt` e `db-lock-recusa.txt`.

E há uma sétima, de outra natureza, no §11.1: a sabotagem do próprio `ci.yml`, que prova que a
asserção que substituiu duas tautologias sabe reprovar.

### 4.1 Sabotagem 1 — UM byte alterado numa migration antiga

Trocado **um único byte** dentro de um comentário da `0031_import_logs.sql`: offset 334,
`0x69` (`i`) → `0x49` (`I`). Tamanho do arquivo **inalterado** (4.068 bytes).

```
$ git diff -U0 -- supabase/migrations/0031_import_logs.sql
@@ -7 +7 @@
---  (1) import_logs — trilha de auditoria: quem importou, qual filial, qual
+--  (1) Import_logs — trilha de auditoria: quem importou, qual filial, qual

$ npm run test
1 problema(s) na trava de hash das migrações:
  • supabase/migrations/0031_import_logs.sql MUDOU depois de travada (travado
    1bc6a49bdb9d…, no disco 0d6069f37707…). Migration aplicada NUNCA se edita
    (CLAUDE.md · Convenções · Banco): desfaça a alteração neste arquivo e escreva uma
    migration NOVA com o que você queria mudar. NÃO regrave o lock — isso apagaria a prova.

 Test Files  1 failed | 153 passed (154)
      Tests  2 failed | 3644 passed (3646)
```

✅ **Critério 2** — reprova, e nomeia o arquivo.

### 4.2 Sabotagem 2 — migration travada RENOMEADA

```
$ mv supabase/migrations/0031_import_logs.sql supabase/migrations/0031_trilha_de_import.sql
$ npm run test
2 problema(s) na trava de hash das migrações:
  • supabase/migrations/0031_import_logs.sql está travada em supabase/migrations.lock.json
    mas não existe mais no disco. Migration aplicada não se apaga nem se renomeia —
    restaure o arquivo com o nome original. Se ela nunca chegou a nenhum banco, remova a
    entrada do lock à mão e diga isso no commit.
  • supabase/migrations/0031_trilha_de_import.sql ainda não está em
    supabase/migrations.lock.json. Migration nova é o fluxo normal: rode `npm run db:lock`
    e comite o lock no MESMO commit da migration.

 Test Files  1 failed | 153 passed (154)
      Tests  3 failed | 3643 passed (3646)
```

Repare que **os dois problemas juntos são a assinatura do renomeio** — o nome velho some, o novo
aparece. É informação que uma mensagem única perderia.

### 4.3 Sabotagem 2b — migration travada APAGADA

```
$ rm supabase/migrations/0031_import_logs.sql
$ npm run test
1 problema(s) na trava de hash das migrações:
  • supabase/migrations/0031_import_logs.sql está travada em supabase/migrations.lock.json
    mas não existe mais no disco. […]

 Test Files  1 failed | 153 passed (154)
      Tests  3 failed | 3643 passed (3646)
```

✅ **Critério 3** — apagar e renomear reprovam, os dois nomeando o arquivo.

### 4.4 Sabotagem 3 — migration NOVA sem regravar o lock, e o fluxo de volta ao verde

**Parte A — reprova, e a mensagem dá a linha a rodar:**

```
$ cat > supabase/migrations/0128_sabotagem_f46.sql   (arquivo fictício, 3 linhas)
$ npm run test
  • supabase/migrations/0128_sabotagem_f46.sql ainda não está em
    supabase/migrations.lock.json. Migration nova é o fluxo normal: rode `npm run db:lock`
    e comite o lock no MESMO commit da migration.

 Test Files  2 failed | 152 passed (154)
      Tests  4 failed | 3642 passed (3646)
```

**Parte B — o fluxo documentado:**

```
$ npm run db:lock
supabase/migrations.lock.json gravado: 127 migrations.
  + travada agora: 0128_sabotagem_f46.sql
```

**Parte C — e o teste volta ao verde:**

```
 Test Files  1 failed | 153 passed (154)
      Tests  1 failed | 3645 passed (3646)
```

⚠ **A falha que sobrou NÃO é da trava desta fase, e é um achado.** É
`src/lib/itens/migrations-f38.test.ts`, uma guarda **anterior** (F38) que também exige que toda
migration a partir da `0116` esteja numa lista dela. Ela reagiu ao arquivo fictício, como devia.
Ou seja: **quem acrescenta migration neste repositório atualiza DUAS listas, não uma.** Ficou
escrito no `docs/RUNBOOK-BANCO.md`.

✅ **Critério 4** — o fluxo documentado devolve o verde da trava da F46, e está no runbook.

### 4.5 A quinta prova, que nasceu de um defeito meu

Escrevendo o §15 ("o que este relatório não prova"), eu ia registrar como limitação aceita:
*"o `npm run db:lock` grita e sai 1 ao regravar migration já travada, **mas grava antes**"*.

Escrito assim, ficou óbvio que era defeito, não limitação — e exatamente o defeito que esta fase
existe para matar. O cenário: alguém edita a `0031` sem querer, `npm run test` reprova, a pessoa
roda `npm run db:lock` **por reflexo** (é o comando que a mensagem da classe "nova" ensina) e
termina com **o lock já regravado e o teste verde**. O aviso teria rolado para fora da tela, e a
única prova do erro teria sido apagada pela própria ferramenta. Verificação que grava primeiro e
reclama depois não é verificação.

Corrigido antes do merge: o script agora **recusa e não grava nada**.

```
$ npm run db:lock

✗ RECUSADO — nada foi gravado.

  Estas migrations JÁ TRAVADAS mudaram de conteúdo:
    ! 0031_import_logs.sql

  Migration aplicada NUNCA se edita (CLAUDE.md · Convenções · Banco). Regravar o
  lock aqui apagaria a prova do erro que a trava existe para pegar.

  A saída certa, quase sempre:
    git checkout -- supabase/migrations/0031_import_logs.sql
  e escreva uma migration NOVA com o que você queria mudar.

  A exceção, rara: se ela NUNCA chegou a ensaio nem a produção, ela ainda pode ser
  corrigida no lugar. Nesse caso, e só nesse caso:
    npm run db:lock -- --regravar-alterada
  e diga no commit que ela não tinha sido aplicada em lugar nenhum.

  Em dúvida se ela chegou? A sonda de efeito responde; o ledger não.
  Ver docs/RUNBOOK-BANCO.md § "A trava de hash das migrations".

$ echo $?
1

$ git status --short supabase/migrations.lock.json
(saída vazia = o lock NÃO foi tocado; a recusa acontece ANTES de gravar)
```

A saída de emergência continua existindo — uma migration que **nunca chegou a banco nenhum** ainda
pode ser corrigida no lugar —, mas agora exige a flag `--regravar-alterada`, que obriga quem a usa
a saber o que está fazendo e deixa rastro no histórico do shell. Evidência em
`docs/f46-evidencias/db-lock-recusa.txt`.

E há uma sexta guarda, no mesmo espírito: se `gravar-lock.ts` for algum dia importado de dentro do
Vitest — o que faria um teste **regravar** o lock em vez de conferi-lo, verde por construção —, ele
lança na carga:

```
$ VITEST=true npx tsx scripts/db/gravar-lock.ts
Error: scripts/db/gravar-lock.ts foi carregado dentro do Vitest. Ele ESCREVE o lock — um
teste que o importa deixa de conferir e passa a regravar. Use as funções puras de
src/lib/validators/migrations-lock.ts.
exit=1   (e o lock intacto)
```

---

## 5. Frente 2 — o CI de banco sem Docker

### 5.1 O achado que decidiu o desenho do bootstrap

A leitura ingênua diz: *o bootstrap precisa reproduzir os `alter default privileges` de um Supabase
hospedado, senão `authenticated` não tem SELECT em `public.ativos`*. Uma das varreduras
exploratórias desta fase chegou a apontar isso como "o achado central".

**Está errado para este repositório**, e quem responde é o próprio roteiro,
`supabase/tests/papeis_rls.sql:60-62`:

> *"…que o job `banco` do CI sobe com `supabase start` **não** reproduz esses defaults, então lá
> `authenticated` não tem nem SELECT em `public.ativos`."*

Ou seja: **o job antigo também não os tem.** Os roteiros já se blindam plantando os próprios
`grant` explícitos, tabela por tabela e verbo por verbo, com o comentário dizendo qual asserção usa
cada um — e o mesmo roteiro **proíbe por escrito** o atalho `grant … on all tables`, porque ele
devolveria dentro da transação um privilégio que uma fase futura tenha revogado.

**Portanto o bootstrap não concede privilégio nenhum em `public`.** Conceder seria o erro que a
ordem nomeia ("cuidado com o excesso, não só com a falta"): faria `seguranca_catalogo.sql` passar
por motivo errado e o job novo reportar verde para um ambiente **mais permissivo que produção**.

### 5.2 O inventário do bootstrap, bloco a bloco, com a linha que o exige

| Arquivo | Bloco | Existe porque |
|---|---|---|
| `bootstrap-roles.sql` | `anon`, `authenticated`, `service_role` (`nologin noinherit`; `bypassrls` só na terceira) | 175 `to authenticated` em policies/grants; 101 `revoke … from public, anon`; `set local role authenticated` em 8 roteiros e `service_role` em `dev_destrutivo.sql:366` |
| | `grant anon, authenticated, service_role to postgres` | a sessão que aplica é `postgres`; sem ser membro, o `set local role` dos roteiros falha |
| `bootstrap-auth.sql` | `create schema auth` + `usage` | 90 `auth.uid()`, 53 `auth.users` — nada resolve sem o schema |
| | `auth.users` (10 colunas) | `0001:9` (FK), `0001:35` (trigger), `0001:31` (`raw_user_meta_data ->> 'nome'`), `0057` (`'sobrenome'`); e as 9 colunas de cadastro porque **quem insere são os roteiros e o runner** (`rodar-roteiros.sh:74-82` cria o operador `ci@wap.ind.br`; 10 roteiros fazem o mesmo) |
| | `auth.uid()` | 90 usos. Corpo **copiado da fonte oficial** — §5.3 |
| | `auth.sessions` (id, user_id → users, cascade) | `0074:378` faz `delete from auth.sessions where user_id = …`; `cargo_dev.sql:525` chama a RPC |
| | `auth.refresh_tokens` (session_id → sessions, **cascade**) | a `0074` **promete por escrito** que "os refresh tokens caem por cascade". Sem a FK a RPC roda e a promessa é falsa, sem nada acusar |
| `bootstrap-storage.sql` | `create schema storage` + `usage` | 82 `storage.objects`, 4 `storage.buckets`; **nenhuma migration cria o schema** (`grep -rn 'create schema'` = 0) |
| | `storage.buckets` (id PK text, name, public) | `0021:49` e `0031:53` inserem com `on conflict (id) do nothing` |
| | `storage.objects` (id PK default, bucket_id → buckets, name, owner) | 8 policies em `0021:55-62`/`0031:60-67`, reescritas em `0066/0069/0070/0072`; roteiros inserem `(bucket_id, name, owner)` |
| | **`enable row level security`** em `storage.objects` | §5.4 — o bloco mais fácil de esquecer, com a consequência mais silenciosa |
| `bootstrap-ledger.sql` | `create schema supabase_migrations` + tabela vazia | `0077:47` lê `supabase_migrations.schema_migrations` e só captura `undefined_table` — §6.2 |

**O que NÃO entrou, e por quê:**

- **Nenhum `grant` em `public`, nenhum `alter default privileges`** — §5.1.
- **PostgREST** — os 15 `notify pgrst` (14 em comentário, 1 vivo em `0126:879`) são inócuos sem ouvinte.
- **Publication `supabase_realtime`** — `0009` e `0018` já a criam com guarda `if not exists`.
- **Nenhuma extensão** — `create extension` = 0; `gen_random_uuid()` é núcleo desde o PG13;
  `unaccent`/`citext` são proibidos por escrito nas `0043`/`0112`/`0125`; pgcrypto não é usado (o
  hash de senha é `crypto.scrypt` em Node).
- **O trigger `handle_new_user`** — quem o cria é a migration `0001`, e é ela que tem de continuar
  criando. O bootstrap prepara o terreno; as migrations continuam sendo a fonte da verdade.

### 5.3 Fidelidade às definições oficiais (regra 6 do `CLAUDE.md`)

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
  As duas metades do `coalesce` importam: os roteiros montam `request.jwt.claims` como JSON
  (`set_config('request.jwt.claims', json_build_object('sub', …)::text, true)`), que é o **segundo**
  ramo.

### 5.4 A linha que quase passou despercebida

`alter table storage.objects enable row level security` **não existe em nenhuma migration** — todas
as tabelas de `public` ligam a própria RLS explicitamente (`0021:41` para `public.termos_gerados`),
mas `storage.objects` chega de fábrica com RLS ligada num Supabase, e por isso ninguém nunca
escreveu a linha. **Num `postgres:17` cru ela nasce com RLS DESLIGADA.**

Sem essa linha, as 8 policies de `0021`/`0031` seriam criadas normalmente e ficariam **inertes**
(RLS desligada = quem tem privilégio de tabela lê tudo). As asserções 6a..6f de `papeis_rls.sql`,
que medem justamente que um operador **não** alcança o objeto de filial alheia, passariam medindo
nada — e passariam **verde**. Seria o pior desfecho possível desta fase: o job novo concordando com
o antigo **por acidente**, num ambiente que não é o de produção. Há asserção em
`ci-passos.test.ts` cobrando a linha.

### 5.5 A comparação que fecha o critério 5

Os dois jobs rodaram no **mesmo run**, sobre o **mesmo commit**.

**Run `34040990566` · commit `722a08d` · PR #23 · 06/09/2026**

| Job | Conclusão | Início | Fim | Duração |
|---|---|---|---|---|
| `verificar` | ✅ success | 15:01:32 | 15:06:11 | 4m39s |
| `banco` (antigo) | ✅ success | 15:01:32 | 15:05:24 | **3m52s** |
| `banco-sem-docker` (novo) | ✅ success | 15:01:32 | 15:02:29 | **57s** |

E um **segundo** run, no commit seguinte, porque um único número de tempo não é medição:

**Run `34042431721` · commit `643e87c`**

| Job | Conclusão | Duração |
|---|---|---|
| `verificar` | ✅ success | 3m31s |
| `banco` (antigo) | ✅ success | **2m48s** |
| `banco-sem-docker` (novo) | ✅ success | **55s** |

Os dois jobs também chegaram a **25 roteiros / 577 asserções** no run 2, com os 25 detalhes
idênticos entre si (`diff` sem diferença). O job antigo variou 2m48s–3m52s entre os dois runs; o
novo, 55s–57s. **A razão (≈3× a 4×) é robusta; o número exato de um run só, não.**

<table>
<tr><th>Job <code>banco</code> — <code>supabase start</code></th><th>Job <code>banco-sem-docker</code> — <code>postgres:17</code></th></tr>
<tr><td><pre>
✓ asof_desempate — 4 asserções
✓ asserts_ferramenta — 7 asserções
✓ cargo_dev — 46 asserções
✓ conflito_filiais — 38 asserções
✓ dev_destrutivo — 108 asserções
✓ dominios_login — 16 asserções
✓ f34_triagem_reserva — 21 asserções
✓ f36_detentor — 18 asserções
✓ f37_colaboradores_tipos — 26 asserções
✓ f38_itens_com_ativo — 51 asserções
✓ f41_regularizacao — 25 asserções
✓ fuso_do_negocio — 5 asserções
✓ import_substituir — 11 asserções
✓ itens_extra — 4 asserções
✓ itens_quantidade — 14 asserções
✓ manutencao_fornecedor — 19 asserções
✓ maquina_estados — 14 asserções
✓ papeis_rls — 76 asserções
✓ pendencias_import_termo — 5 asserções
✓ pendencias_item — 13 asserções
✓ reabrir_pendencia_item — 4 asserções
✓ seguranca_catalogo — 8 asserções
✓ transferencia_item — 18 asserções
✓ transicoes_extra — 13 asserções
✓ troca — 13 asserções
25 roteiro(s), 577 asserções no total
</pre></td><td><pre>
✓ asof_desempate — 4 asserções
✓ asserts_ferramenta — 7 asserções
✓ cargo_dev — 46 asserções
✓ conflito_filiais — 38 asserções
✓ dev_destrutivo — 108 asserções
✓ dominios_login — 16 asserções
✓ f34_triagem_reserva — 21 asserções
✓ f36_detentor — 18 asserções
✓ f37_colaboradores_tipos — 26 asserções
✓ f38_itens_com_ativo — 51 asserções
✓ f41_regularizacao — 25 asserções
✓ fuso_do_negocio — 5 asserções
✓ import_substituir — 11 asserções
✓ itens_extra — 4 asserções
✓ itens_quantidade — 14 asserções
✓ manutencao_fornecedor — 19 asserções
✓ maquina_estados — 14 asserções
✓ papeis_rls — 76 asserções
✓ pendencias_import_termo — 5 asserções
✓ pendencias_item — 13 asserções
✓ reabrir_pendencia_item — 4 asserções
✓ seguranca_catalogo — 8 asserções
✓ transferencia_item — 18 asserções
✓ transicoes_extra — 13 asserções
✓ troca — 13 asserções
25 roteiro(s), 577 asserções no total
</pre></td></tr>
</table>

E a igualdade **conferida mecanicamente**, não por leitura:

```
$ diff -u /tmp/a-antigo.txt /tmp/b-novo.txt
>>> IDENTICOS: nenhuma diferenca <<<
```

Saídas completas em `docs/f46-evidencias/banco-antigo-resumo.txt` e
`docs/f46-evidencias/banco-sem-docker-resumo.txt`.

✅ **Critério 5** — mesmos 25 roteiros, mesmas 577 asserções, 0 falhas, nenhum contando zero (o menor
é 4, o maior 108). **Na primeira tentativa**, sem nenhuma iteração de bootstrap.

### 5.6 O ambiente do job novo, provado pela própria saída

```
PostgreSQL 17.11 (Debian 17.11-1.pgdg13+2) on x86_64-pc-linux-gnu, …
server_version_num = 170011
126 migrations aplicadas em estoque
```

O passo **reprova** se o major não for 17 — rodar o CI num major diferente do de produção é um vão
que esconde defeito, a mesma lição do Node 20 × 24 já cicatrizada no job `verificar`.

✅ **Critério 6** — o job novo não usa `supabase start`, `supabase init` nem `supabase/setup-cli`
(há asserção cobrando), e o tempo caiu de **3m52s para 57s** (≈ 4×).
✅ **Critério 7** — as **126** aplicam do zero por `psql` com `ON_ERROR_STOP=1`, em ordem, sem recorte.

---

## 6. As divergências entre a ficha e o código

### 6.1 O "campo ledger em dia" do `/dev` — a ficha e a ordem erravam, **cada uma por metade**

- A **ficha** manda "apagar o campo *ledger em dia* do `/dev`".
- A **ordem** (achado 3) diz que ele **não existe** e manda não inventar remoção.

**Medido, os dois erram por metade:**

- `src/components/dev/diagnostico-painel.tsx` **não** mostra veredito. Mostra os dois campos lado a
  lado e um parágrafo dizendo que não se comparam. **A ordem acerta aqui.**
- `src/lib/queries/dev.ts:116-119` **calculava** `migracoesEmDia`:

  ```ts
  migracoesEmDia:
    migracaoNoBanco === 'indisponível' || migracaoNoRepo === 'indisponível'
      ? null
      : migracaoNoBanco >= migracaoNoRepo,
  ```

  Comparação de **string** entre `"0127_conversao_reservas"` e `"20260730123751"`. Qualquer carimbo
  de 14 dígitos é "maior" que qualquer nome começado em `0`, então **respondia "em dia" sempre**,
  inclusive num banco atrasado. Estava no tipo `Diagnostico` e era **lido por componente nenhum**
  (`grep -rn migracoesEmDia src/` devolvia só a declaração e o cálculo). **A ficha acerta aqui.**

**Ação, exatamente como a ordem instrui** ("apague *o veredito*, nunca os dois campos
informativos"): removido `migracoesEmDia` do tipo e do retorno, com um comentário no lugar
explicando o que havia ali. **Os dois campos e o parágrafo ficaram.**
`diagnostico-painel.tsx` **não foi tocado** — a ficha o lista nas Entregas, mas não havia o que
mudar nele.

### 6.2 O comentário da `0077` promete mais do que a função entrega

`ultima_migracao_aplicada()` diz devolver NULL *"se a tabela de controle não existir"*, e captura só
`undefined_table` (**42P01** — *schema existe, tabela não*). Num banco sem o **schema**
`supabase_migrations`, o erro é `invalid_schema_name` (**3F000**), que aquele `exception when`
**não** captura: a RPC estoura.

**Não corrigido nesta fase** — seria editar migration aplicada, exatamente o que ela passa a
proibir. Mitigado no CI por `bootstrap-ledger.sql`, que cria o schema (vazio) e torna o caso
inalcançável. **Nenhum roteiro chama essa RPC** (`grep -rn 'ultima_migracao_aplicada' supabase/tests/`
= 0), então isso **não** influenciou o veredito do critério 5. Vai para o backlog: correção real é
migration nova.

### 6.3 Contagem de roteiros

A ficha diz "7 dos 24 roteiros"; a F45 mediu **25 roteiros / 577 asserções**, e é esse o número que
o critério 5 cobra. A ficha é anterior à F45.

---

## 7. A decisão obrigatória: a segunda aplicação

A ficha pedia "aplicar de novo, provando idempotência". A ordem exigia **medir antes de decidir**.

### 7.1 A medição

Sobre as 126, com os comentários de linha removidos (`sed 's/--.*$//'`) para não contar menção:

| Classe | Total | Com guarda | Quebrariam na 2ª passada |
|---|---|---|---|
| `create policy` | 69 | 8 `drop policy if exists` no repositório inteiro | ~61 |
| `create index` / `unique index` | 53 | 8 com `if not exists` | 45 |
| `create type` | 7 | 0 — a sintaxe `if not exists` **não existe** no Postgres | 7 |
| `create trigger` | 7 | 0 (`create or replace trigger` = 0) | 7 |
| `alter table … add column` | 25 | 7 com `if not exists` | 18 |
| `alter type … add value` | 7 | 6 com `if not exists` | 1 (`0071`) |
| `create view` sem `or replace` | 4 | — | 4 (`0052` ×2, `0112` ×2) |
| `add constraint` vivo | 1 (`0045`) | — | 1 |
| `insert` de topo sem guarda | 1 (`0114`) | os outros 7 usam `on conflict`/`not exists` | 1 |

**E a primeira falha real é a `0001`**, o primeiro arquivo da cadeia: ela abre com
`create table public.profiles (` **sem** `if not exists` → `42P07 duplicate_table`.

> ⚠ **Uma medição minha estava errada e foi apanhada na revisão adversarial, antes de virar
> evidência.** Eu havia registrado que a `0007_seeds_fixos.sql` seria a primeira a quebrar. **Está
> errado:** os dois `insert` dela têm `on conflict … do nothing`, e o comentário do próprio arquivo
> diz isso. O único `insert` de topo sem guarda em todo o repositório é o da `0114`. Fica registrado
> em vez de apagado.

### 7.2 A decisão, e por que as outras duas foram descartadas

- **(a) segunda passada que reprova** — **morta pela medição**, demonstrável estaticamente, sem CI.
  Torná-las idempotentes é **editar migration aplicada**: a fase se contradiria no mesmo commit.
- **(b) catálogo de não-idempotentes que só reprova se crescer** — **descartada pela mesma
  medição**: o catálogo listaria quase todos os 126 arquivos, porque praticamente toda migration
  cria algum objeto sem guarda. Um catálogo que diz "quase todos" não tem sinal, e a pergunta
  "a lista cresceu?" viraria ruído. Um passo cujo verde não significa nada é a coisa que a F45
  existiu para matar.
- **(c) outra prova de determinismo** — **escolhida.**

### 7.3 O que o passo faz

A pergunta que "aplicar duas vezes" tentava responder é *a cadeia produz sempre o mesmo schema?*.
Essa tem resposta, e o repositório **já tinha a ferramenta**: a sonda de fingerprint por classe do
`docs/RUNBOOK-BANCO.md`, que a F19 usou para provar paridade ensaio × produção. Ela veio para
`supabase/ci/impressao-schema.sql` e roda a cada CI.

**Por que reusar e não escrever outra:** ela já traz as duas cicatrizes embutidas — normaliza espaço
em branco (o falso-positivo de 25/07/2026, em que `criar_compra_lote` apareceu divergente entre
ensaio e produção e a diferença eram só **47 `\r`**) e ignora comentário.

O job aplica a mesma cadeia **do zero em dois bancos limpos e independentes** (`estoque` e
`determinismo`) e compara. **Banco separado de propósito:** reaplicar por cima do banco dos roteiros
poderia mudá-lo (um `update` de backfill roda de novo) e trocaria a prova do critério 5 por outra
coisa.

```
==== impressão digital do schema, por classe ====
coluna|291|5e575a6217ea2ce1238cf66e4c30b9ae
constraint|75|41e6fe5cded9c4596385501ac0daa61e
enum|7|34837fbf7cb50082e461fd8cdad47532
func|64|f0405e780c20c918ba77f1ad6724fbd9
grant_func|64|e025d9a963d4503535c55f6778311df3
indice|75|70465672f6b1b0b8eb14bf55b23dcaa0
policy|46|388e5c0ddfdedf5dd0cc5ae585dcd254
policy_storage|8|952a7a54d211cac72cca350b3e9dd456
rls_flag|20|7e57bfe79594010e2a9f55e5384eabe2
trigger|6|fd4bfe3d9468c9c5ef1d891ba570d87b
view|9|1a3d8b7b12278469ea42d3fe15253da8
as duas aplicações produziram schemas idênticos
```

11 classes, **665 objetos**, idênticos. O passo roda `diff -u` entre as duas impressões e sai 1 se
divergirem; a ausência de bloco de diff acima é a prova de que não divergiram.

Nada de `|| true`, nada de `ON_ERROR_STOP` desligado, nada de saída descartada — há asserção em
`ci-passos.test.ts` cobrando isso.

✅ **Critério 8** — medida, decidida, e a substituição registrada em `docs/DECISOES.md`.

---

## 8. O job `banco` antigo — intacto, e provado

O `banco` é *required status check* **pelo nome** desde 05/09/2026. Renomeá-lo ou apagá-lo deixaria
o check exigido **sem nunca reportar**, e todo PR ficaria preso em *"Expected — Waiting for status
to be reported"* — inclusive o desta fase.

```
$ git diff --numstat main...HEAD -- .github/workflows/ci.yml
161     0       .github/workflows/ci.yml          ← 161 adições, ZERO remoções
```

E a prova que importa de verdade — **o texto que o teste captura como sendo o job `banco` é byte a
byte o mesmo de antes**, apesar de o job novo ter entrado logo abaixo:

```
$ node -e "…corpoDoJob('banco') sobre git show main:ci.yml vs o ci.yml atual…"
BANCO antes: 66 linhas | agora: 66 linhas
IDENTICO? SIM — byte a byte
VERIFICAR identico? SIM
```

Isso responde ao risco real: `corpoDoJob` corta no próximo `^ {2}\S`, e o bloco de comentário do job
novo está em indentação 2. Se o corte tivesse mudado, alguma asserção existente passaria a olhar
**menos texto** e ficaria mais fraca sem ninguém perceber. Não mudou.

✅ **Critério 9** (primeira metade) — o job antigo existe, com o nome `banco`, chamando o mesmo
runner, com os comentários-cicatriz. Há quatro asserções novas cobrando exatamente isso.

---

## 9. As saídas reais dos seis comandos

```
$ npm run lint
> estoque-ti-wap@1.51.0 lint
> eslint
(sem saída = limpo)

$ npm run test
 Test Files  154 passed (154)
      Tests  3667 passed (3667)
   Duration  44.14s

$ npm run contraste
… | F44 | selo "N em aberto" da ficha recolhida (escuro) | escuro | `warning` | `warning/20` | 6.22:1 | 4.5:1 | ✅ AA |
(nenhum par abaixo do mínimo)

$ npm run build
ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
(sem erro)

$ npm run verificar:actions
[gate] chunks com Server Actions varridos: 22
[gate] VERDE — nenhum identificador registrado sem binding.

$ npx tsc --noEmit
(sem saída = limpo)
```

✅ **Critério 10.**

---

## 10. O que mudou, por arquivo

| Arquivo | O que mudou | Por quê |
|---|---|---|
| `supabase/migrations.lock.json` | **novo** — 126 entradas | O catálogo travado |
| `src/lib/validators/migrations-lock.ts` | **novo** — funções puras | Fonte única do hash, compartilhada por gravador e conferente |
| `src/lib/validators/migrations-lock.test.ts` | **novo** — 14 casos | A guarda + a prova de que ela reprova |
| `scripts/db/gravar-lock.ts` | **novo** | O único ponto que escreve o lock |
| `package.json` | `db:lock`; versão `1.51.0` | Regra 8 |
| `supabase/ci/bootstrap-roles.sql` | **novo** | As três roles, e a explicação de por que **nenhum** grant em `public` |
| `supabase/ci/bootstrap-auth.sql` | **novo** | `auth.users`/`sessions`/`refresh_tokens`/`uid()` |
| `supabase/ci/bootstrap-storage.sql` | **novo** | `storage.buckets`/`objects` + **RLS ligada** |
| `supabase/ci/bootstrap-ledger.sql` | **novo** | O schema do ledger, vazio — §6.2 |
| `supabase/ci/impressao-schema.sql` | **novo** | A sonda do RUNBOOK, agora executável |
| `.github/workflows/ci.yml` | `+161 / -0` | O job `banco-sem-docker`. O antigo **não foi tocado** |
| `src/lib/ci-passos.test.ts` | 60 → 81 casos | Dois `describe` novos: o job novo e a integridade do antigo |
| `src/lib/queries/dev.ts` | sai `migracoesEmDia` | §6.1 |
| `src/lib/versoes/registry.ts` | entrada `1.51.0` | Regra 8 |
| `CHANGELOG.md` | entrada de 06/09/2026 | Regra 8 |
| `CLAUDE.md` | `supabase/ci/`, o lock e `scripts/db/` na estrutura; a regra de banco cita a trava | A estrutura é prescrita |
| `docs/RUNBOOK-BANCO.md` | seção nova: a trava, o que fazer quando reprova, as duas listas, o banco do CI na mesa, a não-idempotência | Entrega da ficha |
| `docs/DECISOES.md` | 8 atas | Modo autônomo |
| `docs/PLAN-F46.md`, `docs/RELATORIO-F46.md`, `docs/f46-evidencias/` | **novos** | Rastro |
| `README.md`, `docs/prompts/README.md` | status e linha da fase | Fechamento |

---

## 11. A revisão adversarial

Três céticos independentes, em contexto fresco, com as lentes que a ordem torna obrigatórias — e
**cada achado passou por um verificador adversarial** encarregado de **refutá-lo** antes de virar
trabalho (padrão: refutado; só confirma quem reproduz o problema). 15 agentes no total.

| Lente | Achados levantados | Sobreviveram à refutação |
|---|---|---|
| **O cético do bootstrap** — *"esse privilégio existe no `supabase start` ou você o inventou? algum roteiro passa a passar por motivo diferente?"* | 4 | **0** |
| **O cético da trava** — *"ela reprova mesmo? sob renomeio? sob arquivo novo? sob CRLF?"* | 5 | **0** (uma já corrigida — ver abaixo) |
| **O cético do YAML** — *"o job antigo continua idêntico? o required check continua reportando? algum comentário-cicatriz foi perdido?"* | 3 | **1** |

### 11.1 O achado que sobreviveu, e a correção

**Duas das minhas asserções novas eram tautológicas — nunca podiam falhar de forma independente.**

`corpoDoJob(nome)` faz `expect(inicio, …).toBeGreaterThan(-1)` **por dentro**, e roda no
**carregamento do módulo** (`const BANCO = corpoDoJob('banco')`). Se um job sumisse, o arquivo
inteiro morria na coleta, antes de qualquer `it` nomeado. Ou seja: chegar a executar
`expect(BANCO_SEM_DOCKER.length).toBeGreaterThan(0)` e `expect(YAML).toContain('\n  banco:\n')` já
pressupunha que a condição que elas "verificavam" era verdadeira.

Asserção que não sabe ficar vermelha é **sensação de rede** — exatamente o que a F45 existiu para
matar. Deixá-las seria a trava desta fase repetindo o defeito que ela denuncia.

**As duas foram substituídas por uma estritamente mais forte:**

```ts
it('os jobs do ci.yml são EXATAMENTE `verificar`, `banco` e `banco-sem-docker`', () => {
  expect(nomesDosJobs()).toEqual(['verificar', 'banco', 'banco-sem-docker'])
})
```

(`nomesDosJobs()` lê só o bloco `jobs:` — uma regex solta sobre o arquivo devolveria `push`, de
`on: push:`, como se fosse job.) Mais um teste de que `banco-sem-docker` é **um job de verdade** e
não um cabeçalho vazio (`runs-on`, `steps`, ≥ 6 passos).

**E, desta vez, a prova de que a substituta sabe reprovar** — `docs/f46-evidencias/sabotagem-4-jobs-do-yaml.txt`:

```
CASO A — um job NOVO que ninguém declarou (o que NADA cobria antes)
AssertionError: expected [ 'verificar', 'banco', …(2) ] to deeply equal [ 'verificar', 'banco', …(1) ]
+   "job-que-ninguem-declarou",
 Test Files  1 failed (1)
      Tests  1 failed | 80 passed (81)

CASO B — o job `banco` RENOMEADO (o cenário que mataria o required check)
AssertionError: o job `banco` sumiu do ci.yml: expected -1 to be greater than -1
 Test Files  1 failed (1)
      Tests  no tests
```

No caso B quem reprova é a guarda **anterior** (F45), na coleta — e é justamente por isso que as
duas asserções trocadas eram tautológicas. **O caso A é o que nenhuma guarda cobria.**

### 11.2 O achado da trava que o verificador refutou — porque eu já o tinha corrigido

O cético da trava levantou, com precisão, que *"`npm run db:lock` grava por cima do hash de uma
migration já travada e alterada **antes** de avisar e sair 1"*, com a correção sugerida: *"por
padrão RECUSAR escrever […] exigindo uma flag explícita"*.

O verificador o **refutou por medição**: no arquivo real o `process.exit(1)` está **antes** do
`writeFileSync`, e ele reproduziu os dois caminhos. Os dois estão certos — o cético leu o commit
`722a08d`, e eu tinha corrigido exatamente isso em `643e87c`, pelo mesmo raciocínio e chegando à
mesma solução (`--regravar-alterada`), enquanto escrevia o §15 deste relatório (§4.5).

Vale registrar: **a revisão adversarial e eu convergimos, de forma independente, no mesmo defeito e
na mesma correção.** É o sinal mais forte que este relatório tem de que o achado era real.

### 11.3 As refutações que valem registro

- **"`auth.uid()` não é a definição oficial"** — **refutado, e conferido por mim depois.** O cético
  comparou com `20211202183645_update_auth_uid.up.sql`; existe uma migration **posterior**,
  `20220224000811_update_auth_functions.up.sql`, que redefine a função. Fui ler as duas: **o corpo
  de `uid()` é idêntico nas duas versões**, e idêntico ao do `bootstrap-auth.sql`. A afirmação do
  §5.3 se mantém.
- **"o trigger `storage.protect_objects_delete` não está no bootstrap"** — verdadeiro como fato,
  refutado como defeito: é **exatamente** o risco que o §15.2 já nomeia e aceita (objeto de
  plataforma que nenhum roteiro exercita hoje). Nenhum dos 25 o alcança por SQL — os dois roteiros
  que o citam o fazem em comentário, dizendo que ele não é testável por SQL.
- **"a sonda de determinismo não olha `auth`/`supabase_migrations` nem dado de linha"** —
  verdadeiro, e é o recorte **decidido e documentado** (§7.3, §15.5). Não é achado escondido.
- **"`itens_extra.sql` 11a/11b passam por `permission denied`, não pela imutabilidade"** —
  verdadeiro, e **idêntico nos dois jobs**: é anterior à F46, está no §15.6 e no backlog. Corrigi-lo
  exigiria mexer num roteiro, o que a ordem proíbe.
- **"reprovar migration nova contradiz a letra da ficha"** — o cético tem razão quanto à **letra**,
  e a crítica de forma é justa: eu havia escrito a ata como se fosse interpretação, não contradição.
  Corrigido — a ata e o §3.4 agora dizem que **contradiz a letra da ficha**, que a ordem delegou
  explicitamente a decisão, e por que a escolha se sustenta assim mesmo.

### 11.4 O que a revisão conferiu e estava certo

Entre outros, com evidência colhida pelos próprios revisores: as três roles batem **byte a byte**
com `supabase/postgres` (conferido ao vivo); **nenhum** `grant` em `public` no bootstrap, e nenhuma
das 4 checagens de `seguranca_catalogo.sql` depende de privilégio que o bootstrap conceda;
`storage.objects` tem as colunas que as 8 policies e os inserts dos roteiros exigem, e a RLS ligada
é necessária; `bootstrap-ledger.sql` resolve o `invalid_schema_name` da `0077` e nenhum roteiro
chama aquela RPC; zero extensão necessária (incluindo `pg_net`, `pgsodium`, `vault`, `pg_cron`);
`auth.users` tem exatamente as colunas que os três corpos de trigger leem e as 9 que o runner
insere; o `ci.yml` é `+161/-0` e o corpo do job `banco` é byte a byte o de antes.

Uma imprecisão de comentário foi apontada e é justa: `grant anon, authenticated, service_role to
postgres` é **inócuo** no `postgres:17` oficial, porque a sessão já é superusuária e pode
`set role` sem ser membro. A linha não concede privilégio real a mais e não engana nenhuma checagem
(`pg_has_role` não aparece em migration nenhuma); o comentário dela é que promete mais do que
precisa. Fica registrado em vez de silenciado.

---

---

## 12. Os 13 critérios de aceitação, autoverificados

| # | Critério | Estado | Prova |
|---|---|---|---|
| 1 | Lock com uma entrada por arquivo (126), hash normalizado, mesmo valor no Windows e no Linux | ✅ | 126 = 126; os **126 hashes == sha256 do blob do git** (§3.2) |
| 2 | Um byte alterado reprova, nomeando o arquivo | ✅ | §4.1, saída colada |
| 3 | Apagar ou renomear reprova | ✅ | §4.2 e §4.3, saídas coladas |
| 4 | Migration nova: o fluxo documentado devolve o verde, e está no runbook | ✅ | §4.4 (A/B/C) + `RUNBOOK-BANCO.md` |
| 5 | O job novo chega ao MESMO veredito do antigo no MESMO commit | ✅ | §5.5 — 25 roteiros, 577 asserções, 0 falhas, `diff` sem diferença |
| 6 | Sem `supabase start`/`init`/`setup-cli`; tempo medido e comparado | ✅ | §5.6 e §13.1 — **2m48s–3m52s → 53–60s** em quatro runs; asserção no `ci-passos.test.ts` |
| 7 | As 126 aplicam do zero por `psql` com `ON_ERROR_STOP=1`, sem recorte | ✅ | `126 migrations aplicadas em estoque` |
| 8 | A segunda aplicação foi **medida** e o desfecho é um dos três | ✅ | §7 — opção (c), ata em `DECISOES.md` |
| 9 | `banco` antigo intacto; required checks continuam `verificar` e `banco` | ✅ | §8 (`+161/-0`, corpo byte a byte igual) + §13.2 (lido pela API **depois** do merge: `["verificar","banco"]`) |
| 10 | Os seis comandos limpos | ✅ | §9 |
| 11 | Regra 8 fechada | ✅ | `1.51.0`, registry em linguagem de operador, CHANGELOG na mesma data, tag anotada `v1.51.0` publicada — §13.3 |
| 12 | Ata com dívida A **aberta**, 2ª aplicação, divergência do `/dev`, major do Postgres | ✅ | 8 atas em `docs/DECISOES.md` |
| 13 | PR mergeado com os checks verdes; nenhuma branch aberta; árvore limpa | ✅ | §13.1 e §13.3 |

**Os 13, fechados.** Nenhum ficou pendente, e o fallback previsto pela ficha (entregar só a trava
e nomear o bootstrap como backlog) não foi necessário.

---

## 13. O fechamento

**PR [#23](https://github.com/vmatusita/ti-wap-inventory-control/pull/23) mergeado em 06/09/2026,
pela própria PR (`gh pr merge --merge`), com o portão funcionando.** O bypass da conta do Johnny
existe e **não foi usado** — esta é justamente a fase que precisa do portão de pé.

Cinco commits:

```
89c455a  Merge pull request #23 from vmatusita/f46-trava-de-hash
e9fee3a  test(f46): duas asercoes minhas eram tautologicas — a revisao adversarial apanhou
643e87c  fix(f46): `npm run db:lock` RECUSA regravar migration ja travada, em vez de gravar e reclamar
5b750e8  docs(f46): a linha da fase no indice de ordens e o Status do README
4c3dc7d  docs(f46): o veredito morto do /dev, a regra 8 e o rastro da fase
722a08d  ci(f46): o job de banco sem o Docker do Supabase, com o bootstrap declarado a vista
3c96378  feat(f46): a trava de hash das migrations — editar migration aplicada passa a reprovar
```

### 13.1 O CI, quatro runs, todos verdes

| Run | Commit | `verificar` | `banco` | `banco-sem-docker` |
|---|---|---|---|---|
| `34040990566` | `722a08d` (PR) | ✅ 4m39s | ✅ **3m52s** | ✅ **57s** |
| `34042431721` | `643e87c` (PR) | ✅ 3m31s | ✅ **2m48s** | ✅ **55s** |
| `34043037271` | `e9fee3a` (PR) | ✅ 3m12s | ✅ **3m13s** | ✅ **60s** |
| `34043223930` | `89c455a` (**merge, na `main`**) | ✅ 4m41s | ✅ **3m06s** | ✅ **53s** |

E no commit de merge os dois jobs de banco chegaram, de novo, ao mesmo veredito:

```
banco:            25 roteiro(s), 577 asserções no total
banco-sem-docker: 25 roteiro(s), 577 asserções no total
>>> os 25 roteiros IDENTICOS tambem no commit de merge <<<
```

**São quatro sucessos consecutivos do job novo** — acima do limiar de três que a ficha nomeia para
promovê-lo a *required*. Isso não é feito aqui de propósito: é entrega avulsa (§14.2, item 1).

### 13.2 Os required checks, lidos de volta DEPOIS do merge

```
$ gh api repos/vmatusita/ti-wap-inventory-control/branches/main/protection \
    --jq '.required_status_checks.contexts'
["verificar","banco"]

$ git show main:.github/workflows/ci.yml | grep -E '^  [a-z][a-z0-9-]*:$'
  verificar:
  banco:
  banco-sem-docker:
```

✅ **Critério 9, fechado** — os contextos exigidos continuam sendo exatamente `verificar` e `banco`,
e o job `banco` continua existindo na `main` com esse nome. **A branch protection não foi tocada.**

### 13.3 O repouso

```
$ git ls-remote --heads origin f46-trava-de-hash
(vazio — apagada no remoto)

$ git branch
* main

$ git status --short
(vazio)

$ git tag -l v1.51.0
v1.51.0   →  89c455a (o commit de merge)
```

A tag anotada `v1.51.0` está publicada. As demais branches remotas (`dependabot/*`, `f34`,
`claude/sweet-ramanujan-c330d8`) são **anteriores a esta fase** e não foram tocadas.

✅ **Critério 11, fechado** — `1.51.0` no `package.json`, entrada no topo do `registry.ts` em
linguagem de operador (o teste que recusa vocabulário de desenvolvedor passa), entrada no
`CHANGELOG.md` na mesma data, e a tag anotada publicada.
✅ **Critério 13, fechado** — PR mergeado com os dois required checks verdes, branch da fase apagada
nos dois lados, árvore limpa.

---

## 14. Pendências e backlog nomeado

### 14.1 Pendências da fase: NENHUMA

A frente 2 fechou. O fallback previsto pela ficha (entregar só a trava e nomear o bootstrap como
backlog) **não foi necessário** — o bootstrap acertou na primeira tentativa.

### 14.2 Backlog aberto por esta fase

1. **Promover `banco-sem-docker` a *required status check*.** O limiar da ficha (três pushes
   verdes) **já passou** — foram **quatro** (§13.1), incluindo o commit de merge na `main`. Não é
   feito aqui de propósito: a ordem proíbe tocar na branch protection nesta fase, e promover é
   entrega avulsa (PATCH). O comando, pronto:

   ```bash
   gh api repos/vmatusita/ti-wap-inventory-control/branches/main/protection/required_status_checks \
     --method PATCH -f 'checks[][context]=verificar' -f 'checks[][context]=banco' \
     -f 'checks[][context]=banco-sem-docker'
   ```

   ⚠ Só **depois** disso o job `banco` antigo pode sair — e a remoção dele é outra entrega avulsa
   PATCH, que é da ficha. Enquanto os dois existirem, é a **igualdade de veredito entre eles** que
   prova que o bootstrap está certo; matar o antigo agora seria jogar fora a régua no primeiro dia.

2. **Remover o job `banco` antigo** (entrega avulsa PATCH, da ficha). Na mesma entrega,
   `banco-sem-docker` passaria a se chamar `banco` — senão o required check para de reportar.

3. **A `0077` estoura quando falta o schema `supabase_migrations`** (§6.2). Correção = migration
   nova que troque `when undefined_table` por `when undefined_table or invalid_schema_name`.

4. **`itens_extra.sql` 11a/11b podem estar passando por privilégio, não pela imutabilidade** (§15).

5. **A dívida A continua ABERTA** — ver §14.3.

### 14.3 A dívida A, com todas as letras

O caminho de apply em produção **continua sendo MCP `apply_migration` + sonda de efeito por
`pg_get_functiondef`**. O que esta fase entrega é *o CI sem Docker* e *a impossibilidade de editar
migration aplicada* — **não** a conciliação do ledger.

Os três motivos, conferidos e inalterados: (a) `supabase db push` já é proibido por escrito e a CLI
local aponta para o ensaio — não há ferramenta insegura a trocar; (b) o ledger é furado porque o MCP
grava timestamp de 14 dígitos enquanto os arquivos usam prefixo sequencial, e um aplicador novo com
hash não concilia nada, cria um **quarto** esquema de identificação; (c) `pg` não está no
`package.json`, e a regra 3 do `CLAUDE.md` mais a decisão 4 do plano proíbem dependência nova.
Abandonar o MCP é **ADR próprio**.

### 14.4 Fora de escopo, encontrado no caminho

- **`src/lib/itens/migrations-f38.test.ts` é uma segunda lista** que quem acrescenta migration tem
  de atualizar (§4.4). Não é defeito — as duas reprovam sozinhas e nomeiam o arquivo. Ficou no
  runbook.
- **O `PLANEJAMENTO.md` ainda diz "Postgres 15+"**, texto de 09/07 contradito por
  `SYSTEM-DESIGN-2026-08-30.md` ("17"). Não corrigido: é documento de outra fase.

---

## 15. O que este relatório **NÃO** prova

Honestidade sobre os limites, no padrão da F45.

1. **Não prova que produção é Postgres 17.** Esta máquina não alcança ensaio nem produção (o MCP do
   Supabase não está conectado a esta sessão, e a regra permanente 5 proíbe rodar roteiro contra
   produção). O major foi **fixado por documento** (`SYSTEM-DESIGN-2026-08-30.md`), com ata. Se um
   `select version()` de produção contradisser, é trocar um número no `ci.yml`.

2. **Não prova que o bootstrap reproduz o `supabase start` objeto a objeto.** Prova algo mais
   fraco e mais útil: que os **25 roteiros chegam ao mesmo veredito, com as mesmas 577 asserções**,
   nos dois ambientes, no mesmo commit. Um objeto que o `supabase start` cria e que **nenhum**
   roteiro exercita hoje pode faltar no bootstrap sem que nada acuse — e apareceria quando um
   roteiro futuro o usar. É um risco nomeado, não coberto.

3. **Não prova que a trava resiste a um adversário decidido.** Quem tiver acesso de escrita pode
   editar a migration e regravar o lock com `--regravar-alterada` no mesmo commit, e o teste fica
   verde. A trava impede o **acidente** e o **esquecimento** — que é o vetor real —, não a má-fé.
   O que ela garante contra a má-fé é mais modesto e ainda útil: o ato fica **explícito no
   histórico do shell e no diff do lock**, em vez de invisível.

4. **Não prova nada sobre o estado do banco de produção.** A trava é sobre o **texto** das
   migrations. O controle de efeito continua sendo a sonda do `RUNBOOK-BANCO.md`, e a dívida A
   continua aberta.

5. **A prova de determinismo é mais fraca do que "idempotência".** Dois bancos limpos com a mesma
   cadeia pegam não-determinismo real (dependência de relógio, de ordenação, de estado externo), mas
   **não** pegam um erro que seja determinístico e igual nos dois. Ela também só olha `public` mais
   as policies de `storage` — objeto criado noutro schema não entra na impressão digital.

6. **Duas asserções podem estar passando pelo motivo errado, nos DOIS jobs.**
   `supabase/tests/itens_extra.sql:100-132` (11a e 11b) faz `set local role authenticated`, tenta
   `update`/`delete` em `lancamentos_item` e trata qualquer erro como rejeição válida — o comentário
   do próprio roteiro diz *"erro (ex.: permissão) também é uma rejeição válida"*. Como
   `authenticated` não tem privilégio de tabela em nenhum dos dois ambientes, é provável que as duas
   passem por **42501**, e não pelo trigger `guarda_acervo` da `0081` que deveriam estar medindo.
   **Isto é anterior à F46 e idêntico nos dois jobs** — não é divergência introduzida por esta fase,
   e corrigi-lo exigiria mexer num roteiro, o que a ordem proíbe. Vai para o backlog (§14.2, item 4).

7. **Os tempos são de DOIS runs, não de uma bateria.** O job antigo variou 2m48s–3m52s e o novo
   55s–57s. A razão (≈3× a 4× mais rápido) é robusta; um número exato não é média de nada, e o
   runner do GitHub varia com a carga da nuvem.

8. **A trava nasceu verde.** Ela é varredura de catálogo (regra 4 do §4 do plano permite). As quatro
   sabotagens do §4 são a compensação, mas são sabotagens **que eu escolhi** — não uma prova de que
   nenhuma outra evasão existe. Os casos sintéticos do próprio arquivo de teste cobrem as três
   classes independentemente do disco.
