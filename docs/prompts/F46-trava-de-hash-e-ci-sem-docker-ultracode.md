# F46 — A trava de hash das migrations e o CI de banco sem Docker

*Ordem de serviço gerada em 06/09/2026, a partir de `docs/PLANO-MULTIEMPRESA.md` §5, Bloco A.*

**Por que ela existe.** Duas coisas que o repositório repete por escrito e não defende com código.
A primeira: *"nunca edite uma migration já aplicada"* está no `CLAUDE.md`, na regra 8 do §4 do plano
multiempresa e no `RUNBOOK-BANCO.md` — e **nada no repositório impede**. Um byte alterado na `0031`
passa por `lint`, `test`, `build` e pelo job `banco` **verde**, porque o job aplica a cadeia num
banco novo: ele prova que as 126 aplicam limpo, nunca que são as mesmas de ontem. Numa fila de vinte
migrations como a da virada multiempresa, esse é o erro mais caro que existe. A segunda: o job
`banco` sobe o **stack Docker inteiro do Supabase CLI** para usar dele só um Postgres — leva de 3 a
6 minutos, já quebrou **duas vezes por causa externa** (rate limit da API de releases em 24/07, flush
do PostHog em 25/07 — as duas cicatrizes estão comentadas no `ci.yml`), depende de uma versão de CLI
fixada à mão, e **não roda na máquina do Johnny**, que não tem Docker (veto de 09/08/2026).

**A correção de rota que a ficha carrega, e que vale repetir.** A leitura ingênua desta dívida diz
"trocar `supabase db push` por um aplicador próprio". Está errada por três motivos verificados:
(a) `db push` **já é proibido por escrito** (`RUNBOOK-BANCO.md`) e a CLI local aponta para o ensaio —
não há ferramenta insegura para trocar; (b) o ledger é furado porque o MCP grava **timestamp de 14
dígitos** enquanto os arquivos usam prefixo sequencial, e um aplicador com hash não conserta isso,
só cria um quarto esquema de identificação ao lado dos três que já existem; (c) `pg` **não está no
`package.json`**, e a decisão 4 do plano proíbe dependência nova na preparação. **Esta fase não
inventa caminho de apply para produção.** O apply continua sendo MCP + sonda de efeito.

**Três achados de leitura do repositório, em 06/09/2026, que a ficha não previu.**

1. **`banco` é *required status check* pelo NOME.** Desde 05/09 os contextos exigidos na `main` são
   exatamente `verificar` e `banco`. Renomear ou apagar o job `banco` nesta fase deixa o check
   exigido **sem nunca reportar** — todo PR fica preso em *"Expected — Waiting for status to be
   reported"*, inclusive o desta fase. A ficha já manda o job antigo em paralelo; o que ela não diz
   é que isso **não é opcional**, é o que impede o agente de se trancar do lado de fora.
2. **A idempotência que a ficha pede briga com a trava que a ficha cria.** As migrations foram
   escritas para rodar UMA vez: `create policy "termos leitura operador"` sem `drop policy if
   exists`, `insert into storage.buckets` sem `on conflict`, `create index` sem `if not exists`.
   Torná-las idempotentes é **editar migration aplicada** — exatamente o que o `migrations.lock.json`
   passa a proibir no mesmo commit. A saída é medir e decidir, nunca editar.
3. **O campo "ledger em dia" do `/dev` NÃO EXISTE.** `src/components/dev/diagnostico-painel.tsx`
   mostra "Última migration do repositório" e "Versão registrada no banco" lado a lado **sem
   veredito**, e o comentário ali já diz o motivo: "não são a mesma grandeza — qualquer comparação
   automática entre eles daria um 'em dia'/'atrasado' inventado". A ficha manda apagar o que já não
   existe. Confira, registre a divergência e **não invente uma remoção**.

**E a lição do §15 da F45 vale aqui como método, não como anedota.** Aquele relatório declarou o
`gh` ausente a partir de dois `command not found` — e ele estava instalado, fora do `PATH`. Nesta
fase a mesma tentação aparece duas vezes (Docker e Postgres na máquina). **"Comando não encontrado"
é hipótese, não conclusão:** confira pelo gerenciador de pacotes (`winget list`) ou pelo disco antes
de desenhar qualquer desvio em cima da ausência.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Fazer "migration aplicada nunca se edita" virar defesa executável, e tirar o job `banco` do Docker
do Supabase. Ao final: `supabase/migrations.lock.json` versionado e cobrado por teste (editar um
byte de migration antiga derruba `npm run test` nomeando o arquivo); um job de banco novo que sobe
um Postgres do major de produção, aplica as 126 migrations em ordem por `psql` e roda os mesmos
roteiros com o MESMO script, chegando ao MESMO veredito do job antigo no MESMO commit; o job antigo
intacto e ainda sendo o required check; versão 1.51.0 publicada com tag; PR mergeado com os checks
verdes. **Sem migration, sem dependência nova, sem mudança de schema, sem tocar na branch
protection.**

# Contexto

## Leia antes de escrever qualquer código
- `@CLAUDE.md` manda em tudo: modo autônomo, as 8 regras permanentes (a **3** — custo R$ 0 e stack
  fechada — decide metade das escolhas desta fase; a **6** — conferir documentação oficial vigente
  antes de escrever código de integração; a **8** — versão — não se reinterpreta), e a estrutura de
  pastas prescrita, que esta fase muda (entra `supabase/ci/` e o `migrations.lock.json`).
- `@docs/PLANO-MULTIEMPRESA.md`, nesta ordem: **§4** (as 10 regras comuns a TODAS as fases — herdam
  para cá sem repetição; a **8** é literalmente o que esta fase passa a defender), **§5 → F46** (a
  ficha: Objetivo / A correção de rota / Entra / Não entra / Entregas / Pronto quando / Trava /
  Dependências / Risco / Reversão) e **§3** ("F46 destrava a fila de migrations da virada").
  ⚠ **A ficha da F46 no §5 é a fonte da verdade do escopo.** Onde este prompt e ela divergirem,
  vale a ficha, e a divergência vira nota no relatório.
- `@.github/workflows/ci.yml` — **leia os comentários inteiros antes de mexer.** Cada um é uma
  cicatriz: por que o Node é 24, por que a CLI do Supabase está fixa em 2.109.1, por que a
  telemetria está desligada, por que o grupo de concorrência é por SHA em push. **Não apague
  nenhum**, nem os do job antigo, que continua existindo.
- `@src/lib/ci-passos.test.ts` — a trava da F45, 59 asserções que leem o YAML como texto. Ela vai
  ter de crescer nesta fase, e ela é o motivo de o YAML não poder ser "simplificado".
- `@scripts/db/rodar-roteiros.sh` — o runner único. **Não o reescreva**: ele já aceita
  `DATABASE_URL`. O job novo passa a variável; o script não muda (se algum ajuste for realmente
  necessário, ele é mínimo, comentado e não pode quebrar o job antigo, que chama o MESMO arquivo).
- `@docs/RUNBOOK-BANCO.md` — em especial a armadilha do `42501` (*default privileges* de um Supabase
  hospedado que o Postgres novo do CI **não** reproduz) e a seção "Conferir o estado do banco".
- `@docs/RELATORIO-F45.md` §9.1 (o que esta máquina não consegue exercitar), §15 (o método) e §16 (o
  defeito que só o CI ao vivo mostrou — vale para esta fase inteira).
- `@docs/DIVIDA-TECNICA.md` item **A** (ledger incompatível com o repo) — esta fase o mantém
  **aberto** e escreve isso com todas as letras.

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
Medido no repositório em 06/09/2026, na `v1.50.1`. Se algum ponto não bater, PARE, trate a
divergência como o achado nº 1 da fase e registre — este prompt está errado, não o código.

1. **126 arquivos** em `supabase/migrations/`, a última é `0127_conversao_reservas.sql`, e a `0029`
   é um gap real (não é arquivo perdido). Nenhum mecanismo do repositório compara o conteúdo de
   hoje com o de ontem.
2. **O job `banco` usa `supabase/setup-cli@v1` + `supabase init` + `supabase start`** — o stack
   Docker inteiro, com versão de CLI fixada à mão e telemetria desligada por causa de um flush do
   PostHog que derrubou o CI. Tempo medido nos runs da F45: **3m19s** e **3m37s**.
3. **`verificar` e `banco` são os required status checks da `main`**, com require-PR e bypass na
   conta do Johnny. Confira você mesmo antes de tocar em qualquer nome de job:
   gh api repos/vmatusita/ti-wap-inventory-control/branches/main/protection --jq '.required_status_checks.contexts'
   (o `gh` pode não estar no PATH desta sessão — ele fica em "C:\Program Files\GitHub CLI\gh.exe";
   ver §15 do relatório da F45 antes de concluir que falta.)
4. **Nenhuma extensão é necessária.** `unaccent` e `citext` são **proibidos por escrito** nas
   migrations `0043`, `0112` e `0125` (a chave de deduplicação é IMMUTABLE sem extensão de
   propósito), e `gen_random_uuid()` é núcleo desde o Postgres 13. Nenhuma migration tem
   `create extension`.
5. **Produção é Postgres 17** (`docs/SYSTEM-DESIGN-2026-08-30.md`); o `PLANEJAMENTO.md` ainda diz
   "15+", que é de 09/07. Confirme com `select version()` se alcançar ensaio ou produção; se não
   alcançar, fixe o major 17, registre a decisão e siga — não trave por isso.
6. **O `/dev` não tem veredito de ledger** (achado 3 do cabeçalho desta ordem).

## O que o bootstrap precisa entregar — inventário de PARTIDA, não de chegada
Levantado por varredura em 06/09/2026. **Confira e complete**: a lista está aqui para você não
começar do zero, não para você parar nela. O que o `supabase start` dá de graça hoje e um
`postgres:17` limpo não dá:

- **Schema `auth`.** `auth.uid()` (90 ocorrências nas migrations e roteiros) lendo
  `request.jwt.claims` — os roteiros fazem `set local role authenticated` + `set_config(...)`, que é
  o que o PostgREST monta a cada request. `auth.users` (33 ocorrências) com, no mínimo: `id` (uuid,
  PK), `email`, `raw_user_meta_data` (jsonb — o trigger `handle_new_user` da `0001` lê `->> 'nome'`),
  `instance_id`, `aud`, `role`, `encrypted_password`, `email_confirmed_at`, `created_at`,
  `updated_at` — as quatro últimas porque **o próprio runner insere o operador `ci@wap.ind.br`**
  antes dos roteiros. `auth.sessions` e `auth.refresh_tokens` (com o cascade entre elas) porque a
  `0074` faz `delete from auth.sessions where user_id = …`.
- **Schema `storage`.** `storage.buckets` (as migrations `0021` e `0031` inserem `termos` e
  `backups-import`) e `storage.objects` com `bucket_id` — são 31 referências, todas de policy.
- **Roles** `anon`, `authenticated`, `service_role` (e o que mais as policies nomearem), com os
  privilégios que os roteiros esperam. ⚠ **Cuidado com o excesso, não só com a falta:** um
  `grant … on all tables in schema public` no bootstrap faria `seguranca_catalogo.sql` passar por
  motivo errado e mascararia qualquer REVOKE futuro — é a mesma armadilha que o `RUNBOOK-BANCO.md`
  já registra e que o próprio roteiro proíbe por escrito. O alvo é reproduzir o que o
  `supabase start` entrega, nem mais nem menos, e a **prova é o veredito igual** (critério 5).
- **`supabase_migrations.schema_migrations`** vazia, se a `0077` precisar dela no apply (o comentário
  dela diz que devolve NULL quando a tabela não existe — confirme lendo o corpo, não o comentário).
- **O que NÃO precisa:** PostgREST (os 13 `notify pgrst` são inócuos sem ouvinte) e a publication
  `supabase_realtime`, que as `0009`/`0018` já criam de forma idempotente se faltar.

## Comandos que já existem
npm run lint · npm run test · npm run contraste · npm run build · npm run verificar:actions ·
npx tsc --noEmit · npm run db:test · npm run db:test:um <arquivo>

# Escopo

## Dentro
1. **`supabase/migrations.lock.json`** — mapa `arquivo → sha256 do conteúdo normalizado` (`\r\n` →
   `\n`; sem isso o Windows acusa deriva a cada clone, mesmo com o `eol=lf` do `.gitattributes`),
   uma entrada por arquivo de `supabase/migrations/`, versionado.
2. **`src/lib/validators/migrations-lock.test.ts`** — recalcula os hashes e **reprova** quando um
   arquivo travado mudou um byte, quando um arquivo travado sumiu ou foi renomeado. Arquivo novo é
   aceito (migration nova é o fluxo normal), e o executor regrava o lock **no mesmo commit** por um
   script dedicado — o teste **não escreve arquivo**. Zero dependência: `node:crypto` e `node:fs`.
3. **Um script de regravação do lock** no `package.json` (sugestão: `npm run db:lock`), com guarda
   para não rodar sozinho dentro do teste.
4. **`supabase/ci/bootstrap-*.sql`** — o recorte mínimo de `auth`/`storage`/roles/privilégios,
   **declarado à vista e versionado**, em vez de escondido numa imagem de terceiro. Cabeçalho longo
   dizendo o que cada bloco existe para sustentar (a convenção deste repositório é comentário que
   explica o porquê, não o quê).
5. **Job de banco NOVO, com nome novo**, em paralelo ao antigo: `services: postgres:<major de
   produção>` → bootstrap → aplicar as 126 migrations em ordem por `psql` (`ON_ERROR_STOP=1`) →
   **segunda aplicação, medida** (ver a decisão obrigatória abaixo) → `bash
   scripts/db/rodar-roteiros.sh` com `DATABASE_URL` apontando para o serviço.
6. **`src/lib/ci-passos.test.ts` crescido**: o job novo existe e chama o runner; o job antigo
   continua existindo e continua chamando o mesmo runner; o bootstrap é aplicado antes das
   migrations; a ordem "migrations → roteiros" não inverte.
7. **Ata em `docs/DECISOES.md`** dizendo com todas as letras: a **dívida A continua ABERTA**; o
   caminho de apply em produção continua sendo MCP + sonda por `pg_get_functiondef`; o que esta fase
   entrega é o CI sem Docker e a impossibilidade de editar migration aplicada. Abandonar o MCP como
   caminho de apply é ADR próprio e exige aprovar `pg` como dependência — não é esta fase.
8. **O item do `/dev`**: confirme o achado 3. Se de fato não houver veredito, **não apague nada** —
   registre a divergência entre a ficha e o código na ata e no relatório. Se houver comparação
   automática em algum lugar (procure por "em dia", "atrasado", ou qualquer uso conjunto de
   `migracaoNoRepo` e `migracaoNoBanco`), apague **o veredito**, nunca os dois campos informativos.
9. **`docs/RUNBOOK-BANCO.md`**: como o lock funciona, o que fazer quando ele reprova (a resposta
   certa é quase sempre "sua alteração vira migration nova", não "regrave o lock"), e como rodar o
   banco do CI na mesa.
10. **`CLAUDE.md`**: `supabase/ci/` e `supabase/migrations.lock.json` na estrutura prescrita, e uma
    linha na regra sobre migrations dizendo que agora existe trava.
11. **Regra 8 inteira**: `1.51.0` no `package.json`, entrada no topo de `src/lib/versoes/registry.ts`
    em **linguagem de operador** (fase invisível ganha versão do mesmo jeito — 2 frases honestas
    sobre o efeito real, nunca "nada mudou para você"), entrada no `CHANGELOG.md` na mesma data, tag
    anotada `v1.51.0` publicada.

## Fora — não toque
- **Branch protection.** Não altere contextos exigidos, não adicione o job novo como required, não
  desligue nada. Promover o job novo a required é entrega avulsa depois de três pushes verdes — vai
  para o backlog do relatório, com o comando pronto.
- **O job `banco` antigo.** Não renomeie, não apague, não "limpe" os comentários dele. Removê-lo é
  entrega avulsa PATCH, e é da ficha.
- **Qualquer migration existente.** Nem para consertar idempotência, nem para "padronizar", nem para
  corrigir um typo de comentário. É o objeto que a fase passa a proteger.
- **Renomear migrations para o padrão timestamp.** Explicitamente fora (ficha).
- **Aplicador com conexão direta ao Postgres de produção**, `pg`/`postgres`/`supabase` como
  dependência npm, e qualquer mudança de schema (nenhuma migration nova nesta fase — a `0128` é da
  F47).
- **`scripts/db/rodar-roteiros.sh`** como reescrita. Ele é o contrato entre CI e mesa.
- **Os roteiros de `supabase/tests/`.** Se algum ficar vermelho no job novo, o defeito é do
  bootstrap, não do roteiro. Mexer no roteiro para o job novo passar é a troca proibida desta fase.
- **`src/lib/types/database.ts`**, telas, permissões, produção e dado real.

# A ordem de entrega não é livre
A ficha declara a mitigação do maior risco do bloco: **se o bootstrap falhar, a fase entrega só a
trava de hash e o bootstrap vira backlog nomeado.** Isso só é possível se a trava vier primeiro e
inteira. Portanto:

1. **Frente 1 — a trava de hash.** Lock + teste + script + documentação, commitada e verde. Ela não
   depende de banco nenhum, roda no Vitest que já existe e fecha sozinha o item de maior valor.
2. **Frente 2 — o bootstrap e o job novo.** Iterada em cima da frente 1 já commitada.

Se a frente 2 não fechar depois de esgotar as abordagens, **a fase entrega a frente 1 e nomeia a 2
como backlog com o diagnóstico do que faltou** — isso é sucesso previsto pela ficha, não fracasso.
O contrário (bootstrap pela metade, lock inexistente) é o único desfecho ruim.

# A decisão obrigatória: a segunda aplicação
A ficha pede "aplicar de novo, provando idempotência". **Meça antes de decidir.** As migrations deste
repositório foram escritas para rodar uma vez, e a segunda passada provavelmente vai falhar em
`create policy`, `insert into storage.buckets`, `create index` e afins.

- **Proibido:** editar migration antiga para obter idempotência. Isso é o que a trava desta mesma
  fase passa a impedir, e seria a fase se contradizendo no mesmo commit.
- **Também proibido:** deixar a segunda passada "passar" mascarando erro (`|| true`, `ON_ERROR_STOP`
  desligado, saída jogada fora). Verificação que não sabe reprovar é a coisa que a F45 existiu para
  matar.
- **Decida entre:** (a) manter a segunda passada como passo que **reprova**, se de fato o conjunto
  aplicar limpo duas vezes; (b) mantê-la como **diagnóstico declarado** — roda, lista quais
  migrations não são idempotentes, e o CI só reprova se a lista **crescer** em relação a um catálogo
  versionado; (c) trocar o critério por outra prova de determinismo (ex.: a sonda de fingerprint por
  classe do `RUNBOOK-BANCO.md` sobre dois bancos limpos) e registrar a substituição. Qualquer uma
  serve; nenhuma pode ser silenciosa: a escolha, com a medição que a sustenta, vai para
  `docs/DECISOES.md` e para o relatório.

# A trava
`supabase/migrations.lock.json` + `src/lib/validators/migrations-lock.test.ts`, mais as asserções
novas de `src/lib/ci-passos.test.ts`. Ela **nasce verde** (é varredura de catálogo — regra 4 do §4),
então a prova de que ela sabe ficar vermelha é obrigação do relatório: sabote, colha a saída,
desfaça. No mínimo três sabotagens, cada uma desfeita logo depois:
- um byte alterado numa migration antiga → o teste nomeia o arquivo;
- uma migration travada renomeada ou apagada → o teste acusa;
- uma migration nova sem regravar o lock → o comportamento é o que você decidiu e documentou.

# Critérios de aceitação — autoverifique item a item
1. `supabase/migrations.lock.json` existe, tem **uma entrada por arquivo** de `supabase/migrations/`
   (126 hoje), e o hash é do conteúdo normalizado — o mesmo valor no Windows e no Linux.
2. Alterar um byte de uma migration antiga faz `npm run test` **reprovar**, com mensagem que nomeia
   o arquivo. Saída colada no relatório.
3. Apagar ou renomear uma migration travada também reprova. Saída colada.
4. Migration nova: o fluxo documentado (script de regravação) deixa o teste verde de novo, e está
   escrito no `RUNBOOK-BANCO.md`.
5. **O job novo chega ao MESMO veredito do job antigo no MESMO commit:** os mesmos 25 roteiros, o
   mesmo total de asserções (577 no merge da F45), **0 falhas**, nenhum roteiro contando zero. Os
   dois blocos de saída, lado a lado, no relatório. Divergência de contagem é bootstrap errado —
   não se resolve mexendo em roteiro.
6. O job novo **não usa `supabase start`, `supabase init` nem `supabase/setup-cli`**, e o tempo dele
   é medido e comparado ao do antigo (3m19s / 3m37s nos runs da F45). Os dois números no relatório.
7. As 126 migrations aplicam do zero por `psql` com `ON_ERROR_STOP=1`, em ordem, sem recorte.
8. A segunda aplicação foi **medida** e o desfecho é um dos três da decisão obrigatória, registrado.
9. O job `banco` antigo continua existindo, com o nome `banco`, chamando o mesmo runner, e os
   required checks da `main` continuam sendo `verificar` e `banco` — lido de volta pela API depois
   do merge.
10. `npm run lint`, `npm run test`, `npm run contraste`, `npm run build`, `npm run verificar:actions`
    e `npx tsc --noEmit` limpos.
11. Regra 8 fechada: `1.51.0` no `package.json`, entrada no `registry.ts` em linguagem de operador,
    entrada no `CHANGELOG.md` na mesma data, tag anotada `v1.51.0` publicada.
12. Ata em `docs/DECISOES.md` com a dívida A **aberta**, a decisão da segunda aplicação, a
    divergência do `/dev` e o major de Postgres escolhido.
13. PR mergeado com os dois required checks verdes; nenhuma branch aberta ao final; árvore limpa.

# Verificação — rode de verdade
Rode, leia a saída, corrija a causa raiz, repita até passar. **Nunca** desabilite, pule ou apague
teste, nem afrouxe uma verificação para ficar verde — se um roteiro reprovar no job novo, o defeito
é do bootstrap.

- **Na mesa:** os seis comandos do critério 10, depois de cada incremento.
- **A trava:** as três sabotagens, com a saída real de cada uma.
- **O banco:** esta máquina **não tem Docker nem Postgres** (F45 §9.1) — confirme pelo gerenciador de
  pacotes e pelo disco antes de aceitar isso como verdade. Se de fato não tiver, a iteração do
  bootstrap é: commit na branch → push → ler o job no GitHub Actions:
      gh run watch --exit-status
      gh run view --log-failed
  Espere o resultado; não adivinhe pelo YAML. **Anti-loop:** três tentativas para a mesma hipótese;
  na quarta, mude de abordagem (ordem dos blocos do bootstrap, imagem do serviço, comparação com o
  que o `supabase start` cria de fato) e registre a troca.
- **A comparação que fecha o critério 5:** o job antigo e o novo rodam no MESMO commit da PR. Colha
  as duas saídas do MESMO run.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem
espere confirmação em nenhuma hipótese. Régua: (1) a ficha da F46 no §5 do
`docs/PLANO-MULTIEMPRESA.md`; (2) este prompt; (3) as convenções do repositório (`CLAUDE.md`, código
existente, `RUNBOOK-BANCO.md`); (4) a opção mais simples e reversível. Decisão não-óbvia vira ata em
`docs/DECISOES.md` (data · contexto · escolha · motivo) e segue.

Duas condições de parada legítimas, e só duas: **insumo físico que só o Johnny tem** (uma credencial
que não existe no ambiente) e o **fallback da ficha** (frente 2 não fecha → entrega a frente 1 e
nomeia o backlog). Fora disso, contorne e registre.

Três armadilhas de raciocínio desta fase, nomeadas para você não cair nelas:
- **"O roteiro está errado."** Não está. Se ele passa no job antigo e reprova no novo, quem mudou foi
  o ambiente que você construiu.
- **"É só tornar a migration idempotente."** É a contradição da fase (ver a decisão obrigatória).
- **"O comando não existe."** É hipótese até você conferir pelo gerenciador de pacotes ou pelo disco
  (F45 §15).

# Git e segurança
**O portão está LIGADO desde 05/09/2026 — o caminho normal agora é PR.** Branch
`f46-trava-de-hash`, commits pequenos e frequentes em pt-BR no padrão conventional
(`feat(f46): …`, `ci(f46): …`, `docs(f46): …`). Ao final: `gh pr create`, esperar `verificar` e
`banco` verdes (o job novo roda junto e NÃO é required — se ele reprovar, conserte antes de
mergear mesmo assim), e mergear pela própria PR (`gh pr merge --merge`, que gera o commit de
merge). Merge local + push na `main` não é caminho: a proteção exige PR, e só o bypass passaria. O bypass da conta do Johnny existe; usá-lo aqui
seria ato consciente e desnecessário — esta fase é justamente a que precisa do portão funcionando.

NUNCA: push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que
não é seu, apagar ou renomear o job `banco`, mexer na branch protection, rodar qualquer coisa contra
o Postgres de produção ou de ensaio. `npm run db:seed` e `npm run db:reset` **não entram nesta fase**
(o `.env.local` desta máquina aponta para produção — as guardas de `scripts/env-guard.ts` recusariam,
e a regra permanente 5 proíbe antes disso).

Ao final: tag anotada `v1.51.0` publicada (`git push origin v1.51.0`), branch da fase apagada nos
dois lados, árvore limpa — o "repouso perfeito" que a F45 estabeleceu como padrão de fechamento.

# Como trabalhar
1. **Explore com subagentes paralelos**, cada um voltando só com resumo: (a) o que as 126 migrations
   exigem de `auth`/`storage`/roles/privilégios/publication, arquivo por arquivo, sem confiar no
   inventário deste prompt; (b) o que os 25 roteiros exigem além disso (`set local role`, blocos de
   grants explícitos, o operador que o runner insere); (c) a superfície de CI e trava
   (`ci.yml`, `ci-passos.test.ts`, `package.json`, `vitest.config.mts`) e o que quebra ao acrescentar
   um job; (d) o estilo dos validadores e guardas TS↔SQL que já existem
   (`src/lib/validators/*-sql.test.ts`, `src/lib/colaboradores/chave-sql.test.ts`), para o teste do
   lock nascer parecido com a casa.
2. **Escreva `docs/PLAN-F46.md`** autossuficiente antes de implementar: arquivos e nomes decididos,
   o desenho do lock, o inventário do bootstrap bloco a bloco com o motivo de cada um, a decisão da
   segunda aplicação, o que está fora, e a verificação de ponta a ponta no final. Ele sobrevive à
   compactação e é o gabarito da revisão.
3. **Implemente na ordem da seção "A ordem de entrega não é livre"**, em incrementos que rodam.
4. **Revise adversarialmente** com subagentes em contexto fresco, contra o `PLAN-F46.md` e os 13
   critérios. Lentes obrigatórias: (i) **o cético do bootstrap** — "esse privilégio existe no
   `supabase start` ou você o inventou? algum roteiro passa a passar por motivo diferente do de
   antes?"; (ii) **o cético da trava** — "essa trava reprova mesmo? sob renomeio? sob arquivo novo?
   sob CRLF?"; (iii) **o cético do YAML** — "o job antigo continua idêntico? o required check
   continua reportando? algum comentário-cicatriz foi perdido?". Aponte apenas lacunas de correção
   ou de requisito declarado, **não preferências de estilo**. Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F46.md`, em pt-BR, no padrão dos anteriores (o da F45 é a régua). Evidências, não
afirmações — saída real e completa colada, nunca "os testes passam":
- o que mudou por arquivo e por quê;
- as três sabotagens da trava, com a saída de cada uma;
- os dois blocos de saída do banco (job antigo e job novo, MESMO commit), com os totais e os tempos;
- a medição e a decisão da segunda aplicação;
- o inventário final do bootstrap: cada bloco e a linha do repositório que o exige;
- as divergências entre a ficha e o código (o `/dev`, e o que mais aparecer);
- os 13 critérios, autoverificados um a um, com o estado de cada um;
- pendências e backlog nomeado (promover o job novo a required depois de três pushes verdes, com o
  comando pronto; remover o job antigo como entrega PATCH; o que a frente 2 não fechou, se for o
  caso);
- o que este relatório **não** prova.
Evidências em `docs/f46-evidencias/`. Atas em `docs/DECISOES.md`. Linha da F46 na tabela de
`docs/prompts/README.md` e Status atualizado no `README.md`. Termine a resposta final com um resumo
de 5 linhas em pt-BR.

# Idioma
Narrativa, plano, relatório, atas, comentários e commits em **pt-BR**. Identificadores de domínio em
português sem acento; utilitários e infra em inglês, como o `CLAUDE.md` manda.
```

---

## Como executar

### Pré-voo (10 minutos, uma vez)

Na raiz do repositório, no Windows:

```bash
git -C . status --short          # esperado: árvore limpa
git pull --ff-only               # a main tem de estar em 2997b4e ou depois
npm ci
npm run test                     # anote o total: é a linha de base da fase

# o gh existe mesmo — só pode não estar no PATH desta sessão (F45 §15)
"C:\Program Files\GitHub CLI\gh.exe" auth status
"C:\Program Files\GitHub CLI\gh.exe" api repos/vmatusita/ti-wap-inventory-control/branches/main/protection --jq '.required_status_checks.contexts'

# e confira as duas ausências antes de aceitá-las como verdade
winget list --name Docker
winget list --name PostgreSQL
```

Se o `gh` não estiver no PATH, acrescente-o **antes** de rodar a sessão — a fase termina em PR, e
sem `gh` ela para no fim, depois de todo o trabalho feito:

```powershell
$env:Path += ';C:\Program Files\GitHub CLI'
```

### Rodar

```bash
claude --model opus --permission-mode auto -n f46-trava-hash
# cole o bloco do prompt inteiro e deixe rodando
```

Para baratear (a fase é multiagente e a exploração é a parte cara), antes do comando:

```bash
export CLAUDE_CODE_SUBAGENT_MODEL=sonnet   # subagentes num modelo mais barato; o forte fica no orquestrador
```

E, opcionalmente, dentro da sessão, um avaliador independente que re-checa a cada turno:

```text
/goal npm run test e npm run build passam limpos, e o job novo do CI chega ao mesmo total de asserções do job banco no mesmo commit
```

### Enquanto roda

A parte lenta é a frente 2: cada hipótese de bootstrap custa um push e ~2 a 4 minutos de CI. É
esperado ver uma sequência de commits `ci(f46): …` na branch. Para acompanhar de fora:

```bash
gh run list --branch f46-trava-de-hash --limit 5
gh run watch --exit-status
```

### Ao voltar

1. `docs/RELATORIO-F46.md` — leia as **evidências** (as três sabotagens e os dois blocos de saída do
   banco), não as afirmações.
2. `git log --oneline v1.50.1..v1.51.0` e `git diff v1.50.1..v1.51.0 -- .github supabase src/lib/validators`.
3. Rode você mesmo `npm run test` e confira que o total subiu.
4. Confirme que os required checks continuam sendo `verificar` e `banco`:
   `gh api repos/vmatusita/ti-wap-inventory-control/branches/main/protection --jq '.required_status_checks.contexts'`
5. Se vier errado: **regra dos 2 strikes** — depois de duas correções falhas, não emende. Sessão
   limpa com o prompt corrigido supera a sessão longa com remendos.

## Suposições que fiz

- **A ficha da F46 (`docs/PLANO-MULTIEMPRESA.md` §5) é a fonte da verdade do escopo** — este prompt
  a detalha e acrescenta os três achados de leitura do repositório, mas não a contradiz.
- **Versão `1.51.0`** (fase = MINOR sobre a `1.50.1` no ar).
- **Postgres 17** como major do serviço, com confirmação por `select version()` se o agente
  alcançar ensaio ou produção. Se você souber que produção está em outro major, diga antes de rodar.
- **A fase vai por PR**, não por push direto na `main` — é a consequência aceita da F45, e esta é
  justamente a fase que não deveria usar o bypass.
- **O job novo não vira required nesta fase.** Promovê-lo depois de três pushes verdes é entrega
  avulsa, e fica no backlog do relatório com o comando pronto.
- **A linha da F46 na tabela de `docs/prompts/README.md` é escrita pela própria fase**, no
  fechamento — como a F45 fez. As linhas em falta da F40 à F44 continuam sendo backlog de
  documentação, fora desta ordem.
