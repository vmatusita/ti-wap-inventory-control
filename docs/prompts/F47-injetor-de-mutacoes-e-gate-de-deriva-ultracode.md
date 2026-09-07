# F47 — O injetor de mutações e o gate de deriva

*Ordem de serviço gerada em 06/09/2026, a partir de `docs/PLANO-MULTIEMPRESA.md` §5, Bloco A.*

**Por que ela existe.** O repositório tem 25 roteiros SQL e 577 asserções, e **nenhuma prova de que
alguma delas saiba ficar vermelha**. A F45 já nomeou o defeito de forma: dezenas de asserções são
`if v_n = 0 then ✓ else ✗`, e todas passam sobre **conjunto vazio** — se o cenário não montou o
dado, `count(*)` devolve 0, o roteiro imprime ✓ e o CI fica verde. A F45 entregou a ferramenta que
recusa esse caso (`pg_temp.assert_zero_de`) mas **não converteu as asserções existentes**, de
propósito: converter muda a FORÇA da asserção e é matéria da fase dos catálogos. O que falta é o
instrumento que responde a pergunta de fora: *quebre o banco de propósito e veja se o roteiro
acusa*. Sem ele, a F48 escreveria quatro catálogos de segurança novos sem saber se catálogo
consegue reprovar — quatro documentos com sensação de rede. É literalmente o que o §3 do plano diz:
**"F47 destrava F48"**.

E o segundo mecanismo, o gate de deriva, fecha o buraco simétrico: hoje uma migration pode
acrescentar coluna e ninguém é obrigado a rodar `npm run db:types`. O `database.ts` envelhece em
silêncio — **já aconteceu**, e está escrito na ata da F41: *"o `database.ts` commitado simplesmente
estava velho, porque nenhuma fase regenerava desde a F38"*.

**O que esta fase NÃO é.** Não é uma varredura de qualidade dos roteiros, não converte as asserções
tautológicas (isso é F48) e não conserta policy nenhuma. Ela entrega **duas ferramentas** e a
adoção de uma tabela órfã. Mutação que revelar asserção fraca é ACHADO — vai nomeado para o
relatório e para a ata, não vira refatoração oportunista.

**Cinco fatos de leitura do repositório, em 06/09/2026, que a ficha do plano não tem.**

1. **A mesa do Johnny não tem Postgres nem Docker.** Está provado com evidência positiva no
   `docs/RELATORIO-F46.md` §2.1 (`winget list` sem pacote, `C:\Program Files\PostgreSQL`
   inexistente, `C:\Program Files\Docker` vazio). Consequência dura para esta fase: **o injetor não
   pode ser ensaiado na mesa**. A iteração é commit → push → ler o job. Isso muda o desenho: a
   maior fatia possível do trabalho precisa ser **verificável sem banco** (Vitest sobre o catálogo
   de mutações e sobre os parsers), senão a fase vira dez pushes às cegas.
2. **`_bkp_relatorios_gerados_f6a` existe SÓ em produção.** Nenhuma migration a cria — ela é
   resíduo de `create table as select` da F6A, com 8 colunas todas anuláveis. O banco do CI é
   construído **a partir das migrations**, então uma `0128` que faça `alter table … enable row
   level security` nela **morre com `42P01` e derruba o `banco-sem-docker`, que é required check**.
   A migration tem de CRIAR a tabela `if not exists` com a forma exata de produção antes de ligar
   RLS e criar a policy — é assim que "trazer para o versionamento sem apagar snapshot" funciona
   nos dois bancos. E confira antes: várias atas (F19, F22) dizem que a RLS dela **já está ligada
   em produção** por remendo manual, e `create policy` não é idempotente.
3. **O `--local` do gate de tipos está morto desde ontem.** A ficha manda gerar com
   `supabase gen types typescript --local`, que exige `supabase start` — Docker, que a F46 tirou do
   caminho crítico e que a mesa não tem. A ficha é anterior à F46. Você tem de escolher outro
   caminho, medir e registrar a decisão. As duas opções sérias estão abaixo, com o trade-off real.
4. **`src/lib/ci-passos.test.ts` afirma que os jobs do `ci.yml` são EXATAMENTE
   `['verificar', 'banco-sem-docker']`.** Acrescentar job derruba esse teste — o que é o
   comportamento certo dele, e você atualiza a trava no mesmo commit. O que NÃO se faz é
   transformar um job condicional em *required status check*: um check exigido que não roda deixa
   todo PR preso em *"Expected — Waiting for status to be reported"*, sem nada vermelho na tela. É
   a mesma armadilha que a F46 documentou ao remover o job antigo, de cabeça para baixo.
5. **A ficha diz "34 asserções do formato `if v_n = 0 then ✓`". O grep de hoje devolve outro
   número** (58 ocorrências do padrão, incluindo o próprio arquivo de ferramenta e o autoteste).
   Meça você mesmo, use o número medido e registre a divergência — não repita o número da ficha.

**O método do §15 da F45 continua valendo:** *"comando não encontrado" é hipótese, não conclusão*.
Confira pelo gerenciador de pacotes ou pelo disco antes de desenhar qualquer desvio em cima de uma
ausência.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Provar que os roteiros SQL deste repositório SABEM ficar vermelhos, e fazer o CI descobrir sozinho
quando o `database.ts` derivou do schema. Ao final: `scripts/db/run-mutation-tests.mjs` rodando um
lote de 20 a 30 mutações que quebram o banco de propósito e exigem **o cenário nomeado** do roteiro
correspondente (nunca "deu ✗ em algum lugar"); `scripts/db/diff-tipos.mjs` reprovando quando o
banco tem (tabela, coluna) ou função que o `src/lib/types/database.ts` não tem; a migration `0128`
adotando `_bkp_relatorios_gerados_f6a` no versionamento; `supabase/tests/seguranca_catalogo.sql`
sem a isenção por prefixo `_`; a trava do `ci-passos.test.ts` estendida; versão **1.52.0** com tag
publicada; PR mergeado com `verificar` e `banco-sem-docker` verdes. **Sem dependência nova, sem
Docker, sem tocar na branch protection, sem converter asserção existente.**

# Contexto

## Leia antes de escrever qualquer código
- `@CLAUDE.md` manda em tudo: modo autônomo, as 8 regras permanentes — a **3** (custo R$ 0 e stack
  FECHADA: nenhum pacote novo, nem em `devDependencies`) decide metade das escolhas desta fase; a
  **6** (conferir a documentação oficial vigente antes de escrever código de integração) vale para
  qualquer flag de CLI que você cogitar; a **8** (versão) não se reinterpreta.
- `@docs/PLANO-MULTIEMPRESA.md`, nesta ordem: **§4** (as 10 regras comuns a TODAS as fases, que
  herdam para cá sem repetição — em especial a 2, estado de repouso, e a 4, "trava antes da
  correção"), **§5 → F47** (a ficha: Objetivo / Entra / Não entra / Entregas / Pronto quando /
  Trava / Dependências / Risco / Reversão) e **§3** ("F47 destrava F48").
  ⚠ **A ficha da F47 no §5 é a fonte da verdade do escopo.** Onde este prompt e ela divergirem,
  vale a ficha, e a divergência vira nota no relatório. As DUAS divergências que já conheço estão
  na seção "O diagnóstico" abaixo — confirme-as antes de agir.
- `@docs/RELATORIO-F46.md` — é o estado de onde você parte, não história. Leia §2.1 (as ausências
  provadas na mesa), §5 (o bootstrap do CI, bloco a bloco), §7 (por que a "segunda aplicação" virou
  prova de determinismo) e §11 (o que a revisão adversarial apanhou).
- `@docs/RUNBOOK-BANCO.md`, seções "A trava de hash das migrations", "Quem acrescenta migration
  atualiza DUAS listas", "O banco do CI na mesa (sem o Docker do Supabase)" e "As migrations NÃO são
  idempotentes, e isso é por desenho".
- `@.github/workflows/ci.yml` — **leia os comentários inteiros antes de mexer.** Cada um é uma
  cicatriz: o rate limit da API de releases (24/07), o flush do PostHog (25/07), o Node 24, a fila
  por SHA, e o aviso de que **o nome do job é contrato** com a branch protection.
- `@src/lib/ci-passos.test.ts` — a trava que cobra o YAML. Ela afirma, entre outras coisas, que a
  lista de jobs é exatamente `['verificar', 'banco-sem-docker']`. Você vai mexer nela.
- `@scripts/db/rodar-roteiros.sh` — o runner ÚNICO. Ele carrega `_asserts.sql` antes de cada
  roteiro, exige a linha `FIM <nome>: N asserções, M falhas`, recusa roteiro que conte zero e conta
  `NOTICE|WARNING: ✗` como falha. **O injetor REUSA este script**; não reimplemente parsing de
  roteiro.
- `@supabase/tests/_asserts.sql` e `@supabase/tests/asserts_ferramenta.sql` — a ferramenta que
  recusa universo vazio e o autoteste dela. O `asserts_ferramenta.sql` é o modelo de como este
  repositório prova que uma verificação sabe reprovar: leia-o antes de desenhar o injetor.
- `@supabase/tests/papeis_rls.sql` — o maior roteiro (1.219 linhas) e o alvo principal do lote.
  Repare no formato dos rótulos: `raise warning '✗ 2c-bis operador MOVIMENTOU ativo da filial não
  vinculada …'`. **O token logo depois do `✗ ` é o identificador do cenário** (`1b-ter`, `2c-bis`,
  `3g`, `5f`, `6a`) e é isso que o injetor casa. Repare também no bloco de `grant` (linhas ~90-127)
  e na trava que o protege.
- `@scripts/gen-types.ts` — o gerador seguro e os DOIS footguns já registrados: a CLI fixada em
  2.109.1 regride a nulabilidade de parâmetros, e apontar o gerador para o banco errado gera tipos
  errados sem ninguém notar. O `database.ts` do repositório é gerado de **PRODUÇÃO** e tem
  hand-fixes deliberados (atas de 14/07 e 31/08).
- `@src/lib/types/database.ts` — linha 17: `_bkp_relatorios_gerados_f6a`, a única tabela com
  prefixo `_` no arquivo. Leia as 8 colunas e a nulabilidade delas: é a forma que a `0128` precisa
  reproduzir.
- `@supabase/tests/seguranca_catalogo.sql` — asserção 2 tem `and left(c.relname, 1) <> '_'`. É a
  isenção que sai nesta fase. A asserção 3 (views) não tem isenção nenhuma — compare as duas.

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR

Nenhum item abaixo é para acreditar. Cada um tem um comando que o confirma ou o derruba, e o
relatório final registra o que você mediu, inclusive quando bater com o que está escrito aqui.

1. **A mesa não tem Postgres nem Docker** (`RELATORIO-F46.md` §2.1). Confirme pelo método do §15 da
   F45 — gerenciador de pacotes e disco, não `command not found`. **Se confirmado:** o injetor não
   roda aqui, a iteração é push → `gh run watch`, e o desenho tem de maximizar o que o Vitest
   verifica SEM banco. **Se por acaso houver um Postgres 17** (Johnny pode ter instalado depois),
   use a receita do `RUNBOOK-BANCO.md` § "O banco do CI na mesa" e ensaie tudo localmente — é o
   caminho muito melhor, e a decisão vira nota no relatório.
2. **`_bkp_relatorios_gerados_f6a` só existe em produção.** Confirme que nenhuma migration a cria
   (`grep -rn "_bkp_relatorios" supabase/migrations/`) e leia o que a `0039` e a `0058` dizem sobre
   ela. Antes de escrever a `0128`, confira **em produção**, só leitura, pelo caminho que o
   `RUNBOOK-BANCO.md` já define: a tabela existe? a RLS já está ligada? já existe policy nela? qual
   é o `relkind`? Uma `create policy` com nome que já existe lá derruba o apply.
3. **O gate de tipos não tem `--local`.** `supabase gen types typescript --local` fala com o
   Postgres do `supabase start`, que exige Docker — removido do caminho crítico na F46 e ausente da
   mesa. Escolha entre as duas opções da seção "As três decisões obrigatórias".
4. **Contagem das asserções tautológicas.** A ficha diz 34; meça (`grep -rc "if v_.* = 0 then"
   supabase/tests/*.sql`) e use o número medido. **Não converta nenhuma** — é matéria da F48, e a
   ata da F45 explica por quê.
5. **O `ci-passos.test.ts` trava a lista de jobs.** Rode `npm run test` antes de qualquer edição no
   YAML para ver a suíte verde, e de novo depois, para ver exatamente qual asserção você moveu.

## Comandos que já existem
- `npm run lint` · `npm run test` (Vitest, projetos `puro` e `componentes`) · `npm run build`
- `npx tsc --noEmit` (fechamento, regra 6 do §4 do plano)
- `npm run db:test` (roteiros SQL — precisa de um Postgres; `DATABASE_URL` aponta o alvo)
- `npm run db:lock` (regrava `supabase/migrations.lock.json`; **obrigatório** no mesmo commit da
  migration nova — a trava reprova migration nova não travada)
- `npm run db:types` (regenera `database.ts`; lê `DB_TYPES_PROJECT_REF` e `SUPABASE_ACCESS_TOKEN`)
- `gh` está instalado em `C:\Program Files\GitHub CLI\gh.exe` (F46 §2.1), conta `vmatusita`,
  escopo `repo`. Use `gh pr create`, `gh run watch`, `gh run view --log-failed`.

# Escopo

## Dentro

### 1. O injetor de mutações — `scripts/db/run-mutation-tests.mjs`
Node puro, sem dependência nova, invocado por `npm run db:test:mutations`, alvo pelo
`DATABASE_URL`/variáveis `PG*` como o resto do rig. O contrato dele:

- **Execução de controle primeiro.** Sem mutação nenhuma, os roteiros do lote têm de vir todos
  verdes. Se o controle não fecha, o injetor **aborta antes de mutar** com mensagem própria — senão
  um roteiro já vermelho faria todas as mutações "serem detectadas".
- **Isolamento por mutação.** A mutação tem de sobreviver ao `begin; … rollback;` do próprio
  roteiro, então ela é COMMITADA antes de o roteiro rodar. Cada mutação roda contra um banco
  próprio, descartado depois (`create database … template <banco base>` é o caminho barato e sem
  lógica de reversão para errar; se você escolher outro, meça e registre o porquê).
- **A mutação PEGOU, e isso é provado.** Aplicar com `ON_ERROR_STOP=1` e, quando o catálogo
  declarar uma sonda `prova`, rodá-la e exigir o resultado esperado. Mutação que não aplica produz
  roteiro verde e se disfarça de "não detectada" — o diagnóstico é outro e a mensagem tem de
  distinguir os dois casos.
- **O cenário NOMEADO.** Cada mutação declara `derruba: ['<rótulo>']` e o injetor exige que
  **aquele** rótulo tenha marcado `✗` — não "deu ✗ em algum lugar". Detectada pelo cenário errado é
  achado, não sucesso: reporte os dois lados (o que caiu × o que deveria cair).
- **Reusa `scripts/db/rodar-roteiros.sh`**, apontado ao banco mutado, com o roteiro do catálogo
  como argumento. Repare na inversão: o runner sai **1** quando o roteiro fica vermelho, e para o
  injetor isso é SUCESSO. Escreva essa inversão comentada, senão o próximo leitor a "conserta".
- **Sai não-zero** quando: o controle não veio verde; alguma mutação não aplicou; alguma mutação
  não foi detectada; o roteiro abortou sem a linha `FIM`. Sai zero só com o lote inteiro detectado
  pelo cenário certo.
- **Log auditável:** tabela final `mutação · roteiro · cenário esperado · caiu? · tempo`, mais o
  total. É esse bloco que vai para as evidências.

### 2. O catálogo de mutações — 20 a 30 quebras, e uma delas obrigatória
Catálogo em módulo próprio (`scripts/db/mutacoes.mjs` ou pasta equivalente), separado do motor,
porque a F51 e a F52 vão acrescentar mutações sem tocar no injetor. Cada entrada declara pelo
menos: `id`, `roteiro`, `derruba` (rótulos exatos), `porque` (uma frase — que classe de defeito real
esta quebra imita), `sql` e, quando fizer sentido, `prova`.

Concentre o lote onde a virada multiempresa vai depender: `papeis_rls.sql`,
`seguranca_catalogo.sql`, `cargo_dev.sql`, `dev_destrutivo.sql`, `import_substituir.sql`,
`conflito_filiais.sql`. **Pelo menos uma mutação do tipo "a guarda confere o papel e esquece o
escopo"** — trocar `pode_escrever_filial(<filial>)` por `pode_escrever()` numa policy de escrita é
a quebra cross-tenant clássica e é o ensaio geral da F66. Cubra também, no espírito:
piso de leitura afrouxado (`papel_atual() is not null` virando `true`), `e_admin()` no lugar de
`e_dev()` onde só o dev alcança, `revoke`/`grant` que devolve EXECUTE a `anon`, `security_invoker`
retirado de uma view, RLS desligada numa tabela, guarda de justificativa/confirmação removida de
uma RPC destrutiva, e o trigger de imutabilidade do acervo afrouxado.

**Helper `corpoVigente(assinatura)`** — resolve o corpo VIVO de uma função varrendo
`supabase/migrations/` da maior para a menor e devolvendo o último `create or replace` dela. É o
que permite mutar uma função de 400 linhas sem colar 400 linhas no catálogo, e a F51 vai reusá-lo:
módulo próprio, exportado, documentado, **e com teste de Vitest que roda sem banco**.

### 3. A trava que roda na mesa, sem banco
O catálogo é conferido por Vitest (projeto `puro`, que já inclui `scripts/**/*.test.mts`):
toda mutação tem os campos obrigatórios; os `id` são únicos; o `roteiro` existe em
`supabase/tests/`; e — a mais importante — **todo rótulo em `derruba` existe de verdade como
`✗ <rótulo>` no fonte daquele roteiro**. Um rótulo com erro de digitação viraria "mutação nunca
detectada" e queimaria um ciclo de push; esta asserção o pega na mesa. `corpoVigente` também é
testado aqui, contra as migrations reais.

### 4. O gate de deriva — `scripts/db/diff-tipos.mjs`
Compara por **CONJUNTO**, nunca `diff -u`: de um lado o banco (tabelas, colunas de `Row`/`Insert`,
nomes de funções), do outro o `src/lib/types/database.ts` do repositório. **Reprova só quando o
repositório NÃO contém o que o banco tem** — a direção contrária é legítima e tem três motivos
registrados: `PostgrestVersion` vem do servidor, o arquivo tem hand-fixes de nulabilidade
deliberados, e produção tem objeto que nenhuma migration cria. Um passo de CI que falha por motivo
legítimo é desabilitado na terceira vez.
Requisitos: mensagem que **nomeia** o que falta (tabela.coluna / função), com a instrução de rodar
`npm run db:types`; verde contra o estado atual **antes** de ser ligado; e teste de Vitest do
parser e da direção da comparação, com fixture, rodando sem banco.

### 5. A adoção da `_bkp_relatorios_gerados_f6a` — migration `0128`
`create table if not exists` com a forma EXATA de produção (as 8 colunas anuláveis do
`database.ts`), `enable row level security` e policy de leitura por `e_dev()`. Ela converge CI e
produção sem apagar os 2 snapshots do go-live, que é o que a decisão registrada em
`DECISOES.md` protege. `npm run db:lock` no mesmo commit. Apply em produção pelo caminho normal do
runbook (não é destrutiva).

### 6. `seguranca_catalogo.sql` sem a isenção por prefixo
Sai o `and left(c.relname, 1) <> '_'` da asserção 2. A isenção não tem motivo escrito e é a
categoria por onde qualquer backup futuro escapa. Ela só pode sair DEPOIS da `0128` — senão a
asserção nasce vermelha por causa da própria tabela que a fase está adotando.

### 7. O lugar do injetor no CI
`npm run db:test:mutations` no `push` da `main` e em PR **marcado** (label). Duas formas possíveis
— job novo, ou passo condicional dentro de `banco-sem-docker`. Meça e decida (seção das decisões
obrigatórias). Em qualquer das duas: **nada condicional vira required status check**, e a lista de
jobs do `ci-passos.test.ts` é atualizada no mesmo commit.

### 8. O fechamento de sempre
`docs/RELATORIO-F47.md`, ata em `docs/DECISOES.md`, `CHANGELOG.md` + `package.json` **1.52.0** +
entrada no topo de `src/lib/versoes/registry.ts` (2 a 6 mudanças em linguagem de operador — fase
invisível ao operador também ganha texto honesto, nunca "nada mudou para você") + tag anotada
`v1.52.0` publicada. `docs/README.md` (índice) e o Status do `README.md` atualizados.
`docs/f47-evidencias/` com as saídas reais.

## Fora — não toque
- **Converter as asserções `if v_n = 0 then ✓` para `assert_zero_de`.** É F48, e a ata da F45
  explica por quê: converter muda a força da asserção. Aqui elas são MEDIDAS, não mexidas.
- **Corrigir policy, função, grant ou regra de negócio.** Se uma mutação revelar guarda fraca de
  verdade, isso é ACHADO da fase: nome, SQL, roteiro e classe vão para o relatório e para a ata
  como item da F48/F52. Nenhuma correção de segurança entra nesta fase.
- **Branch protection** — nem para acrescentar, nem para remover contexto exigido.
- **Renomear ou apagar o job `banco-sem-docker`** (o nome é contrato com a proteção da `main`).
- **Editar migration já aplicada** (a trava de hash da F46 reprova, e ela está certa).
- **Dependência nova**, de qualquer tipo, inclusive de desenvolvimento — regra 3 do `CLAUDE.md`.
- **Docker, `supabase start`, `supabase init`, `setup-cli`** no caminho crítico. A F46 os tirou de
  lá por dois incidentes de causa externa.
- **A "impressão do schema" por fingerprint como mecanismo novo** — já existe
  (`supabase/ci/impressao-schema.sql`) e responde outra pergunta. Não duplique.
- **Inverter a fonte dos tipos** (comitar o gerado de um banco local) — revoga decisão registrada;
  se for o caminho, é ata própria e não é esta fase.
- Qualquer tela, componente ou rota. Esta fase não muda nada que o operador veja.

# A ordem de entrega não é livre

1. **Explorar e medir** (subagentes) — os cinco pontos do diagnóstico, o formato real dos rótulos
   dos roteiros, o estado da `_bkp_` em produção, e as duas opções do gate de tipos.
2. **`PLAN-F47.md`** autossuficiente: o lote de mutações nomeado uma a uma (id, roteiro, rótulo
   esperado, classe de defeito), as três decisões obrigatórias já decididas com o número que as
   decidiu, e a verificação de ponta a ponta no fim.
3. **`corpoVigente` + o catálogo + as travas de Vitest** — tudo que roda sem banco vem primeiro,
   porque é a única parte que você consegue iterar sem push.
4. **O motor do injetor**, com o controle e o isolamento.
5. **A migration `0128`** + `npm run db:lock`, e só então **`npm run db:types`**, e só então **o
   gate ligado**. Ligar o gate antes da adoção o faz nascer vermelho por causa dela.
6. **A isenção por prefixo sai** do `seguranca_catalogo.sql` (depois da `0128`, nunca antes).
7. **O CI** — o passo/job, e a trava do `ci-passos.test.ts` no mesmo commit.
8. **As sabotagens** (a prova de que as duas ferramentas sabem ficar vermelhas).
9. **Versão, tag, documentação, relatório, merge.**

# As três decisões obrigatórias — meça antes de decidir, registre em `docs/DECISOES.md`

**Decisão 1 — como o gate de tipos lê o banco.** Duas opções sérias, e as duas têm custo:
- **(a) `npx supabase@2.109.1 gen types typescript --db-url <url do Postgres do CI>`.** Vantagem
  decisiva: os dois lados da comparação saem do MESMO gerador, então as regras de inclusão (o que
  a CLI faz com função que retorna `trigger`, com view, com tipos de argumento) são idênticas por
  construção e o gate não precisa ser calibrado à mão. Custo: devolve uma CLI de terceiro ao
  caminho de um job — versão fixada e vinda do npm, não da API de releases do GitHub, então a
  cicatriz de 24/07 não se repete, mas é uma dependência de rede a mais. **Confirme na
  documentação oficial vigente que a flag existe e se comporta assim** (regra 6 do `CLAUDE.md`).
- **(b) Ler os conjuntos do catálogo do Postgres por SQL** (`information_schema.columns`,
  `pg_proc`) e compará-los com os conjuntos extraídos do `database.ts` pelo compilador TypeScript,
  que já é dependência. Vantagem: zero CLI, zero rede, coerente com toda a tese da F46. Custo real:
  você tem de **reproduzir as regras de inclusão do gerador** — e errá-las produz gate que nasce
  vermelho por motivo legítimo, que é a morte anunciada dele. Se escolher (b), a calibragem é
  entregável: cada filtro com o motivo escrito ao lado.
Escolha, meça (o gate tem de vir VERDE contra o estado atual) e registre. Se a opção escolhida não
conseguir vir verde depois de uma tentativa honesta de calibragem, troque para a outra em vez de
insistir — e registre a troca.

**Decisão 2 — onde o injetor roda no CI.** Passo condicional dentro de `banco-sem-docker` (reusa o
banco já construído, não muda a lista de jobs, mas engorda um required check) × job próprio
(isolado, some da rota crítica, custa reaplicar bootstrap + 126 migrations e muda a lista de jobs
travada pelo teste). Meça o tempo das duas e decida pelo número. Restrição inegociável: **o que é
condicional não pode ser required check**.

**Decisão 3 — o que fazer com mutação NÃO detectada.** Ela é o achado mais valioso da fase e não
pode virar escape hatch. A regra: o injetor **reprova** com qualquer mutação ativa não detectada;
uma mutação que se prove indetectável sem escrever catálogo novo sai do lote ativo e vai para uma
**quarentena declarada no mesmo arquivo**, com o SQL, o rótulo que se esperava, e a fase que a
adota (F48/F52) — e há teste afirmando que a quarentena não é executável e que toda entrada dela
nomeia uma fase. Se mais de um terço do lote acabar em quarentena, **isso** é a manchete do
relatório, não uma nota de rodapé.

# A trava
- `src/lib/ci-passos.test.ts`, estendido: o passo/job de mutações existe, chama o script de verdade,
  não tem `|| true`, e o gate de tipos roda DEPOIS das migrations; `db:test:mutations` está no
  `package.json`; a lista de jobs bate com a realidade nova.
- O teste do catálogo (rótulos que existem, ids únicos, campos obrigatórios, quarentena nomeada).
- O teste do parser do gate e da direção da comparação.
- `seguranca_catalogo.sql` sem exclusão por prefixo.
- `migrations.lock.json` regravado, com a `0128` travada.

# Critérios de aceitação — autoverifique item a item, e cole a evidência de cada um
1. `npm run db:test:mutations` existe, roda contra um Postgres 17 limpo e sai **0** com o lote
   inteiro detectado **pelo cenário nomeado**.
2. A execução de controle é a primeira coisa que o injetor faz, e um roteiro vermelho no controle
   **aborta antes de mutar**, com mensagem própria (provado).
3. Desligar uma asserção de `papeis_rls.sql` faz o injetor acusar **a mutação correspondente** como
   não-detectada, nomeando-a (provado, saída colada).
4. Mutação que não aplica é reportada como "não aplicou", nunca como "não detectada" (provado).
5. O lote tem entre 20 e 30 mutações ativas, distribuídas pelos seis roteiros da ficha, e **pelo
   menos uma** é do tipo "confere o papel e esquece o escopo".
6. `npm run test` fica verde na mesa, **sem banco**, e cobre: catálogo, rótulos, `corpoVigente` e o
   parser do gate.
7. Acrescentar uma coluna sem rodar `npm run db:types` **derruba o CI**, com mensagem que nomeia a
   coluna (provado por sabotagem).
8. O gate de tipos está **verde** contra o estado atual do repositório, e a assimetria (repo pode
   ter mais que o banco) está escrita com os três motivos.
9. A migration `0128` aplica limpo **no banco do CI** (que não tinha a tabela) **e em produção**
   (que já a tem), sem apagar os 2 snapshots.
10. `seguranca_catalogo.sql` não tem mais a isenção por prefixo e continua verde; uma tabela `_`
    sem RLS o derruba (provado por sabotagem).
11. `npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos.
12. `migrations.lock.json` regravado; `npm run test` verde prova que a trava de hash aceita a nova.
13. Versão **1.52.0** no `package.json`, no topo do `registry.ts` (2 a 6 mudanças em linguagem de
    operador) e no `CHANGELOG.md`, com a tag `v1.52.0` anotada e publicada.
14. PR mergeado com `verificar` e `banco-sem-docker` verdes; branch protection intocada.

# Verificação — rode de verdade
Rode `npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` a cada incremento; leia a
falha, corrija a CAUSA RAIZ e repita até passar. **Não desabilite, pule ou apague teste para fazer
passar; não relaxe uma asserção de roteiro para acomodar uma mutação.**

O que depende de banco não roda na mesa (item 1 do diagnóstico): a iteração é `gh pr create` →
`gh run watch` → `gh run view --log-failed`. Por isso, **antes do primeiro push**, prove no Vitest
tudo que é provável sem banco. Se a mesa tiver um Postgres 17, use a receita do `RUNBOOK-BANCO.md`
§ "O banco do CI na mesa" e ensaie tudo localmente antes de qualquer push.

**As sabotagens são entregável, não cerimônia** (é o método da F45 e da F46). No mínimo quatro,
cada uma com a saída real em `docs/f47-evidencias/`: (i) asserção de `papeis_rls.sql` desligada →
o injetor acusa a mutação certa como não-detectada; (ii) mutação com SQL que não aplica → mensagem
de "não aplicou"; (iii) coluna nova sem `db:types` → gate vermelho nomeando a coluna; (iv) tabela
`_` sem RLS → `seguranca_catalogo.sql` vermelho. Cada sabotagem é revertida e a reversão é
conferida (a árvore volta limpa — `git status` colado).

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem
espere confirmação em nenhuma hipótese. Régua: (1) este prompt; (2) a ficha da F47 no §5 do plano;
(3) as convenções do repositório (`CLAUDE.md`, código existente); (4) a opção mais simples e
reversível. Decisão não-óbvia vai para `docs/DECISOES.md` com data, contexto, escolha e motivo.

Falha persistindo depois de ~3 tentativas: **mude de abordagem** em vez de repetir, e registre a
troca — vale especialmente para a Decisão 1, onde a segunda opção existe justamente para isso.
Bloqueio real (credencial ausente, produção inalcançável): contorne se for seguro; senão, entregue
o resto e registre a pendência com o que falta para resolvê-la. Se a `0128` não puder ser aplicada
em produção nesta janela, o CI e o repositório ficam consistentes assim mesmo e a pendência é
nomeada no relatório — a fase não fica pela metade por causa disso.

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que a
medição esteja no relatório. Foi assim que a F46 trocou "aplicar duas vezes" por prova de
determinismo.

# Git e segurança
Branch `f47-injetor-mutacoes`, commits pequenos e frequentes, mensagens em pt-BR no padrão
conventional (`feat(f47): …`, `test(f47): …`, `docs(f47): …`). PR com `gh pr create`; merge só com
os dois checks verdes. **Nunca:** push forçado, `git reset --hard`, `git checkout -- .`,
`git clean -fd`, amend de commit que não é seu, commitar `.env*` ou dado real, mexer na branch
protection. Nenhum nome de colaborador, patrimônio ou linha de planilha da WAP entra em mutação,
fixture, evidência ou comentário — o catálogo de mutações é 100% sintético.

# Como trabalhar
Explore com subagentes paralelos (um por frente: os roteiros e seus rótulos; o estado da `_bkp_` e
o caminho do apply; as duas opções do gate de tipos; o CI e a trava do `ci-passos`), cada um
voltando só com resumo. Escreva `docs/PLAN-F47.md` antes de implementar. Implemente em incrementos
verificáveis, na ordem obrigatória acima.

Ao final, **revisão adversarial por subagente em contexto fresco**, contra o `PLAN-F47.md` e contra
os 14 critérios, com estas perguntas: alguma mutação está sendo "detectada" por acidente (o roteiro
já falharia sem ela)? algum rótulo em `derruba` é ambíguo (prefixo de outro, como `2c` × `2c-bis`)?
o injetor consegue passar verde com o banco intacto? o gate de tipos consegue passar verde com uma
coluna faltando? a `0128` aplica nos dois bancos? alguma sabotagem prova menos do que afirma?
**Aponte apenas lacunas de correção ou de requisito declarado — não preferências de estilo.**
Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F47.md`, em pt-BR, no padrão dos relatórios F45/F46: o que mudou por arquivo e por
quê; as três decisões obrigatórias com o número que decidiu cada uma; **o lote de mutações listado
uma a uma** (id · roteiro · cenário esperado · detectada?) e a quarentena, se houver, com a fase
que adota cada entrada; as quatro sabotagens com saída real; os 14 critérios autoverificados item a
item; as divergências entre a ficha e o repositório; o limite honesto do gate de deriva (ele compara
o banco do CI com o arquivo — a deriva de PRODUÇÃO só é vista quando alguém regenera; escreva isso
com todas as letras, como a F46 escreveu que a dívida A continua aberta); pendências e backlog
nomeados para a F48. **Evidências, não afirmações:** saída real e completa dos comandos.
Termine a resposta final com um resumo de 5 linhas em pt-BR.

# Idioma
Narrativa, plano, ata, relatório, mensagens de erro e commits em **pt-BR**. Identificadores de
domínio em português sem acento; utilitários e infra em inglês. As mudanças do `registry.ts` em
LINGUAGEM DE OPERADOR — há teste que recusa vocabulário de desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~10 minutos)

```powershell
cd C:\Users\yukig\ti-wap-inventory-control
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar — se já houver falha,
#    o prompt precisa saber disso (acrescente uma linha dizendo qual).
npm run lint; npm run test; npm run build

# 2. O gh EXISTE (F46 §2.1) — só pode não estar no PATH desta sessão.
& "C:\Program Files\GitHub CLI\gh.exe" auth status

# 3. As duas ausências, conferidas pelo MÉTODO, não por "command not found".
winget list --name PostgreSQL
winget list --name Docker
#    Se algum deles APARECER, diga isso ao agente numa linha antes de colar o
#    prompt: com um Postgres 17 na mesa a fase inteira se ensaia local e a
#    execução muda de perfil.

# 4. A versão do Claude Code (o modo `auto` exige 2.1.83+) e as permissões.
claude --version
```

Dentro do Claude Code, antes de colar: `/permissions` (confira que `Bash(git push*)` não está
negado — a fase abre PR) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado; ele carrega
metade das regras que o prompt herda).

### Rodar

```powershell
claude --model opus --permission-mode auto -n f47
# cole o bloco do prompt inteiro e deixe rodando
```

Modo `auto` é o certo aqui: a fase roda `npm ci`, `psql` indireto pelo CI, `gh pr create`,
`git tag`/`push` e o apply da `0128` — nada disso passa numa allowlist estreita, e nada disso é
ação que o classificador bloqueia. O que ela **não** faz (push forçado, reset destrutivo, mexer na
proteção da `main`) está no escopo negativo do prompt, então o modo não tem contra o que reagir.

Opcional, e recomendado para desatendido — a condição de parada como avaliador separado:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit passam limpos, o injetor detecta
todas as mutações ativas pelo cenário nomeado e o PR está mergeado com os dois checks verdes
```

Se quiser rodar sem colidir com trabalho local: `claude --worktree f47 --model opus
--permission-mode auto` (aceite o diálogo de confiança uma vez, antes).

### Enquanto roda

A parte que depende de banco só existe no GitHub Actions — é lá que se acompanha:

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Espere **vários ciclos de push** nas frentes 4 e 7 (gate de tipos e CI): sem Postgres na mesa, cada
calibragem custa um run. É o mesmo perfil da F46, e é normal — o que não é normal é o agente
repetir o mesmo push três vezes com a mesma falha; o prompt manda trocar de abordagem antes disso.

### Ao voltar

1. Leia `docs/RELATORIO-F47.md` — comece pela tabela do lote de mutações e pela quarentena. Se a
   quarentena passou de um terço do lote, essa é a notícia da fase (e o insumo da F48).
2. Confira as quatro sabotagens em `docs/f47-evidencias/`: são elas que provam que as ferramentas
   sabem ficar vermelhas. Ferramenta sem sabotagem provada é a coisa que a F45 existiu para matar.
3. Audite o diff: `git log --oneline main..f47-injetor-mutacoes` e
   `git diff main...f47-injetor-mutacoes -- supabase/ .github/`.
4. Rode você mesmo `npm run test` e `npm run lint` uma vez.
5. Confira que a proteção da `main` continua exigindo exatamente `verificar` e `banco-sem-docker`
   — e nada mais.
6. Veio errado? **Regra dos 2 strikes:** depois de duas correções falhas, não emende a sessão —
   peça um prompt novo com o aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **F47 é a próxima fase e a F46 está fechada** (`main` em `v1.51.1`, job `banco` antigo removido,
   `banco-sem-docker` como required check). Se você já tiver começado a F47 à mão, o prompt precisa
   de uma linha dizendo o que já existe.
2. **A mesa continua sem Postgres e sem Docker.** É o que a F46 provou em 06/09. O prompt manda
   reconferir e adaptar sozinho se tiver mudado — mas se você instalou um Postgres 17 depois,
   diga-o numa linha antes de colar: muda o perfil da execução inteira.
3. **A ficha da F47 no §5 do plano é o escopo**, e as divergências que encontrei (o `--local` morto,
   a `_bkp_` inexistente no banco do CI, a contagem de asserções) são divergências da ficha com o
   repositório de hoje — o prompt manda confirmar cada uma antes de agir sobre ela.
4. **Apply da `0128` em produção entra nesta fase**, pelo caminho normal do runbook (não é
   destrutiva, não bate no gate). Se preferir aplicar você mesmo no SQL Editor, diga — o prompt já
   tolera essa pendência sem quebrar o resto.
5. **Versão 1.52.0** (fase = MINOR sobre 1.51.1). Se sair alguma correção avulsa antes desta fase,
   o número muda e o agente recalcula a partir do `package.json`.
