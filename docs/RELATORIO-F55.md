# Relatório F55 — Observabilidade, sonda e alarme de integridade

**v1.60.0** · migration `0138` · 10/09/2026 · branch `f55-observabilidade-sonda-e-alarme`

> Fase **invisível ao operador**: nenhuma tela mudou. O que mudou é que o sistema passou a se
> conferir sozinho e a avisar quando quebra, em vez de esperar alguém tropeçar no defeito.

---

# 1. O ROTEIRO DO JOHNNY — o que ficou com você

*Nada aqui é urgente a ponto de precisar ser feito hoje. Os itens 1 e 2 são os que fecham riscos
que ainda estão abertos; os outros são higiene.*

### 1. Confira as notificações do GitHub (2 minutos)

O alarme avisa por **issue** no repositório mais o **e-mail nativo do GitHub**. Para o e-mail
chegar:

- em `github.com/settings/notifications`, confirme que *Actions → Failed workflows only* está
  ligado (é o padrão);
- e que você **acompanha** (*Watch*) o repositório `vmatusita/ti-wap-inventory-control` com
  *Issues* incluído — senão a issue de alarme abre e ninguém é avisado.

⚠ A doc do GitHub diz que a notificação de workflow agendado vai para **quem mexeu no cron por
último**. Como fui eu quem escreveu o arquivo, o primeiro aviso pode cair na conta que fez o
commit. Se o e-mail não chegar no primeiro disparo, esse é o motivo — e a correção é você editar
qualquer linha do `schedule` e commitar.

### 2. Confira a cota de minutos de Actions (2 minutos)

`github.com/settings/billing`. **Este número importa mais do que parece:** medi o consumo do CI
em 01→10/09 e ele deu **840 min exatos / 962 arredondados por job em 9,77 dias**, o que projeta
**2.579 a 2.953 min/mês** — contra 2.000 (Free) ou 3.000 (Pro/Team). O `saude.yml` acrescenta uns
**150 min/mês** (estimativa; o primeiro disparo mede).

Não consegui ler o plano por API: as duas rotas de billing respondem 404 porque o token do `gh`
não tem o escopo `user`. **Se a cota acabar, o CI (os dois checks obrigatórios) e o alarme param
juntos** — e o alarme parar é silencioso.

### 3. O `VIEW_SESSION_SECRET` da Vercel (5 minutos, se aplicável)

Troquei o do `.env.local` desta máquina por um valor **local novo**. Se o antigo era **o mesmo**
que está na Vercel, o de lá também deve ser girado — um segredo de produção não fica numa máquina
de trabalho. Trocá-lo invalida todas as sessões de visualização por senha ativas (é reversível e
o efeito é só as pessoas entrarem de novo com a senha).

Não sei dizer se eram iguais: eu não li o valor da Vercel, e não devia.

### 4. Gire o `SUPABASE_ACCESS_TOKEN`, com validade (10 minutos)

Ele saiu do `.env.local` e agora vive no **Gerenciador de Credenciais do Windows** desta máquina.
Mas ele **passou por sessões de agente e por arquivos de trabalho**, e é a primeira pergunta de
qualquer diligência de segurança — o `PLANO-MULTIEMPRESA` §7 já o lista como item da virada.

No painel da Supabase:
- crie um token **novo, com validade (expiry)**;
- veja se a conta oferece **token de permissão reduzida** (*fine-grained*). A introdução da
  Management API diz que o token pessoal *"carries the same privileges as your user account"*,
  mas as páginas de endpoint citam permissões granulares. Se houver, o novo nasce só com o que
  `db:types` e `scripts/perf/medir-itens.mjs` usam;
- revogue o antigo;
- nesta máquina: `npx supabase@2.109.1 login` e cole o novo **pela entrada padrão** (nunca com
  `--token`, que deixa o valor visível na linha de comando).

Conferido em 10/09: a configuração do MCP desta máquina **não cita** este token, então não há um
segundo lugar para atualizar.

### 5. A outra máquina (`C:\Users\yukig\…`)

Ela tem o `.env.local` dela, e ficou **fora do alcance desta run**. Se ele ainda aponta para
produção com `SEED_CONFIRM=sim`, o risco que fechei aqui continua aberto lá. O procedimento está
em `docs/INVENTARIO-CREDENCIAIS.md` §2 — e as guardas novas já ajudam: mesmo naquela máquina,
`db:reset` e `db:seed` agora exigem um ref da lista de PERMISSÃO **e** a confirmação do próprio
banco.

### 6. Uma decisão de duas linhas sobre o SharePoint

`MS_CLIENT_ID`, `MS_TENANT_ID`, `MS_CLIENT_SECRET`, `SITE_ID` e `ESPELHO_ITEM_ID` **não são lidas
por nada** no repositório — são o resto do `PLANO-ESPELHO-SHAREPOINT.md`. **Não apaguei**, porque
o consumidor pode estar fora do repositório.

- se o espelho está **morto**: revogue o *client secret* no portal do Azure e tire as cinco;
- se ele **ainda vai existir**: me diga quem é o consumidor e quando o secret vence (os do Azure
  vencem, e o portal mostra o valor uma única vez).

### 7. Os achados que a linha de base revelou — e que eu NÃO consertei

Produção tem, hoje: **3** arquivos de termo órfãos, **69** grupos de conflito entre filiais e
**10** backups órfãos. **Achado é dado, e dado se relata** — consertar não era escopo desta fase,
e apagar para calar o alarme seria a coisa errada. Os três estão na linha de base como **catraca**:
o alarme só toca se o número **subir**.

Os conflitos são os únicos com uma mesa própria pronta: `/pendencias` → *Conflitos entre filiais*.
Quando você resolver alguns, a sonda vai imprimir *"a linha de base pode DESCER para N"*.

---

*Nada além disso ficou com você. As unidades de credencial (a conta `consulta` de produção e os
oito secrets, a troca do `.env.local`, a conta fictícia do ensaio, e o token para o cofre) rodaram
todas, na ordem, e o classificador não barrou nenhum passo.*

---

# 2. Os números MEDIDOS, lado a lado com o previsto

Toda contagem abaixo foi refeita contra o disco e os dois bancos em 10/09/2026, antes de qualquer
código. A régua da ordem é essa: **onde a minha medição divergiu, ela ganhou** — e a divergência
está declarada.

| O que | A ordem previa | Medido | Veredito |
|---|---:|---:|---|
| Chamadas de `console.*` (código, não comentário) | 86 | **86** | OK |
| — de SERVIDOR, migradas | 76 | **76**, em 36 arquivos | OK |
| — de CLIENTE, na lista nominal | 10 | **10**, em 10 arquivos | OK |
| — em comentário | 4 | **4** | OK |
| `} catch {` em função exportada de `'use server'` | 6 | **6** | OK |
| Módulos `'use server'` (diretiva no prólogo) | 20 | **20** | OK |
| Arquivos que só MENCIONAM a diretiva | 2 | **2** | OK |
| Checagens de integridade | 12 | **12** | OK |
| Chaves sem roteiro nenhum | 8 | **8** | OK |
| Chaves com teste que PLANTA e mede (antes desta fase) | — | **1** de 12 | novo |
| Roteiros SQL / asserções | 32 / 706 | **33 / 745** | OK (+1 / +39) |
| Mutações ativas / teto | 63 / 64 | **67 / 68** | OK (+4) |
| Mutações que tocavam `dev_checagens_integridade` | "levante todas" | **0** | **DIVERGÊNCIA** |
| Nomes de `process.env` lidos | 51 | **51** | OK |
| Variáveis no `.env.local` | 14 | **14** | OK |
| Migrations em disco | 136 | **136** → 137 | OK |
| Secrets / variables no GitHub (antes) | 0 / 0 | **0 / 0** → 8 / 1 | OK |
| Ramos `n/a` do smoke | "mais que os 3 `preF12`" | **10** → 1 | OK |
| Verificações do smoke | — | A 18 · B 26 · C 65 | novo |
| Testes (antes → depois) | — | 4.335 → **4.548** | novo |
| Minutos de CI no mês | ~3.100 | **2.579 a 2.953** | DIVERGÊNCIA (mais preciso) |

## As DEZ divergências, explicadas

As nove que a própria ordem declarava de saída, confirmadas por medição, mais uma que apareceu:

1. **A migration é a `0138` e a versão a `1.60.0`**, não a `0135` da ficha — a `0133`→`0135` foram
   da F53, a `0136`/`0137` da F54.
2. **O resumo devolve `(chave, total)`**, não `(chave, quantidade)`: coerência com a função da
   `/dev`, que já usa `total`.
3. **A guarda do resumo é `papel_atual() is not null`**, não `e_admin()` — decisão do Johnny de
   10/09/2026, porque a conta do agendamento é de cargo `consulta`.
4. **O resumo NÃO chama `dev_checagens_integridade()` por dentro.** O desenho da ficha nasce
   quebrado: a função da `/dev` abre com `e_dev()`, que lê o JWT de QUEM CHAMA, e `security
   definer` troca o `current_user` mas **não** o JWT. Ver Decisão 1.
5. **76 chamadas de servidor e 10 exceções de cliente**, não 94 e 2.
6. **A trava da ficha alcançaria 59 das 76.** A desta fase alcança as 76.
7. **NENHUMA mutação tocava `dev_checagens_integridade`** — o risco de "mutação que vira no-op"
   que a ordem previa não existia. O que existia era outra coisa, e mordeu:
   `f41_regularizacao.sql:684-709` conta os blocos do corpo dela, e ESSE quebrou (§4).
8. **A prova do alarme é por `workflow_dispatch` contra o ENSAIO**, não pelo disparo agendado — o
   agendado não pode mirar o ensaio sem virar alarme falso todo dia.
9. **`conflito_entre_filiais` em produção é 69**, não os 137 grupos de 04/08. O valor "normal"
   desta chave se MOVE — é mais um argumento para a catraca e contra um número mágico no código.
10. **NOVA:** o consumo de CI é **2.579–2.953 min/mês**, não ~3.100. A medição da ordem era por
    amostragem de 40 runs; esta é job a job, sobre 136 runs e 272 jobs.

## A linha de base das doze — só TOTAIS, nunca amostra

Medida pelo SQL de contagem transcrito do corpo da `0136`, e reconferida pelo núcleo depois do
apply. É ela que está versionada em `scripts/smoke/linha-de-base.json`.

| chave | PRODUÇÃO | ENSAIO | política |
|---|---:|---:|---|
| `patrimonio_duplicado` | 0 | 0 | hoje-zero |
| `ativo_filial_inativa` | 0 | 0 | hoje-zero |
| `termo_sem_arquivo` | 0 | 0 | hoje-zero |
| `perfil_sem_conta` | 0 | 0 | hoje-zero |
| `conta_sem_perfil` | 0 | 0 | hoje-zero |
| `pendencia_de_estornada` | 0 | 0 | hoje-zero |
| `operador_sem_filial` | 0 | **1** | catraca no ensaio |
| `arquivo_termo_orfao` | **3** | 0 | catraca em produção |
| `conflito_entre_filiais` | **69** | 0 | catraca em produção |
| `detentor_em_estado_sem_dono` | 0 | 0 | hoje-zero |
| `reserva_aberta` | 0 | 0 | hoje-zero |
| `backup_orfao` | **10** | 0 | catraca + releitura de 90 s |

**Nenhuma linha de base foi SUBIDA.** Os três números de produção são o que o banco tem hoje,
medidos duas vezes (antes e depois do apply), e a criação da conta `consulta` não mexeu em nenhum
deles.

---

# 3. O que mudou, por arquivo e por quê

## Frente A — o funil e a instrumentação

| arquivo | o que é |
|---|---|
| `src/lib/observabilidade.ts` | a **porta**: `server-only`, o que o app importa |
| `src/lib/observabilidade-linha.ts` | a **lógica**, pura e testável (o porquê está no cabeçalho dela) |
| `src/lib/observabilidade-fonte.ts` + `.test.ts` | as **duas travas**, mais a trava do `instrumentation.ts` |
| `src/lib/observabilidade-linha.test.ts` | 55 casos, a maioria de sabotagem |
| `src/instrumentation.ts` | `onRequestError` |
| `src/lib/use-server-exports.ts` | `temDiretivaNoPrologo` extraída, mais `ehModuloUseClient` |
| 36 arquivos de `app/(app)`, `lib/actions`, `lib/queries`, `lib/auth`, `lib/storage` e `lib/auditoria-registro.ts` | as 76 chamadas migradas e os 6 `catch` |
| `vitest.config.mts` | `server-only` resolvido para o módulo vazio que o próprio pacote publica |

**Por que a porta e a lógica são dois arquivos.** `server-only` LANÇA quando importado fora da
condição de export `react-server`, e o `vitest.config.mts` não a declarava. Um teste que
importasse a porta morria antes da primeira asserção — e a redação de segredo é justamente o que
mais precisa de teste. O precedente da casa é o mesmo: `validators/dev-integridade.ts` nasceu
disso.

**A mudança em `vitest.config.mts` foi forçada por um defeito real**, não por conveniência: quando
o funil entrou em 36 arquivos, `src/lib/actions/erros.test.ts` — que testa a função PURA
`traduzErroBanco` — parou de conseguir carregar o próprio módulo. Nada afrouxa em produção: o
build do Next continua resolvendo o pacote pela condição real, e um Client Component que importe
um módulo só-servidor continua quebrando o build.

## Frente B — a sonda

`src/app/api/saude/route.ts` (o primeiro route handler do projeto) e uma linha do `matcher` em
`src/proxy.ts`. A escolha da exclusão no matcher, e não de um ramo dentro de `updateSession`, foi
por CUSTO: o proxy roda antes de tudo, e um ramo interno só decide **depois** de
`createServerClient` + `auth.getUser()` — uma ida ao serviço de Auth a cada batida da sonda, para
nada.

## Frente C — o banco

`supabase/migrations/0138_resumo_integridade_e_rotulo.sql` e
`supabase/tests/integridade_alarme.sql` (1.045 linhas, 38 asserções). Mais as listas que o runbook
cobra: `catalogo_secdef.sql` (as três novas por nome, 48 → 51),
`src/lib/itens/migrations-f38.test.ts` (a `0138`) e `supabase/migrations.lock.json`.

## Frente D — o alarme

| arquivo | o que é |
|---|---|
| `scripts/smoke/alarme.mjs` + `.test.mts` | a lógica, **pura**, com 30 casos |
| `scripts/smoke/integridade.mjs` | a sonda logada, `fetch` puro, zero dependência |
| `scripts/smoke/alarme-issue.mjs` | a conversa com as issues |
| `scripts/smoke/linha-de-base.json` | a política, por alvo |
| `scripts/smoke/cobertura.test.mts` | os TRÊS conjuntos |
| `.github/workflows/saude.yml` | o workflow |
| `src/lib/saude-workflow.test.ts` | a trava dele, 36 casos |
| `scripts/smoke/smoke-prod.mjs` + `README.md` | a cirurgia |
| `docs/RUNBOOK-ALARME.md` | o procedimento de resposta |

## Frente E — as guardas

`scripts/env-guard.ts`, `scripts/reset.ts`, `scripts/seed.ts`, `scripts/db/restaurar.mjs`,
`scripts/db/restaurar-guarda.test.mts`, `scripts/import/guard.ts` (só um comentário),
`.env.example` e `scripts/env-exemplo.test.ts`.

---

# 4. O que quebrou por desenho, e o que se fez

Quatro coisas quebraram porque o **objeto que elas mediam mudou de lugar**. Nenhuma foi "editada
para ficar verde" — as quatro estão explicadas no próprio arquivo.

| quem | o que media | o que virou |
|---|---|---|
| `f41_regularizacao.sql:684-709` | os blocos `return query` de `dev_checagens_integridade` | passou a contar os do **núcleo**, e ganhou `12b-bis`: a porta da `/dev` tem de continuar com UM `return query` só — senão o SQL das doze voltou a ter duas cópias |
| `versao-snapshot.test.ts` | o prefixo `[relatorios]` no fonte | passou a procurar a chamada ao funil com o escopo correspondente |
| `erros.test.ts` | os dois argumentos do `console.error` | passou a ler a linha JSON e conferir `erro.codigo` e `erro.mensagem` — o par `{ code, mensagem }` que a F7F mandou registrar continua saindo inteiro |
| `diff-tipos.test.mts:240` | 71 funções no `database.ts` | **74** — a `0138` acrescentou três, e o arquivo foi regenerado de produção |

E uma correção de **custo**, sem tocar em asserção nenhuma: `mutacoes.test.mts` resolvia o corpo
vigente de cada função mutada DENTRO do `it`. São 38 lookups, cada um varrendo as 137 migrations
de trás para frente (~650 ms num processo sozinho, sem disputa), e sob a suíte inteira isso passou
dos 5 s de teto por teste do Vitest. As quatro mutações novas acrescentaram mais um arquivo a cada
varredura e o levaram ao vermelho **por tempo**. Passou a ser resolvido uma vez, no import — onde
o custo já era pago, porque o próprio `mutacoes.mjs` já faz o mesmo ao ser importado.

---

# 5. DOIS defeitos reais que o CI achou, e que eu não teria achado sozinho

## 5.1 O gate de Server Actions tinha um falso positivo PERMANENTE

`scripts/verificar-actions-build.mjs` interpolava o identificador na expressão regular **sem
escapar**. Um export minificado chamado `$` vira a **âncora de fim de string**: nenhuma das cinco
formas de binding casa, e o gate acusa como "sem binding" um identificador perfeitamente ligado.

Aconteceu neste PR: o minificador alocou `$` para uma Server Action de `actions/termos.ts`, e o
chunk trazia `async function $(a){…}` a 6.387 caracteres do começo. O job `verificar` ficou
VERMELHO com `[root-of-the-server]__0p9moo6._.js → $`.

Falso positivo é o pior defeito que um gate pode ter, porque o conserto que ele convida é
desligá-lo. Corrigido escapando o identificador — e **provado que nada ficou mais permissivo**:
com um chunk sabotado que registra `$` sem binding nenhum, o gate continua vermelho.

⚠ **E o meu erro que o expôs:** rodei `lint`, `test`, `build` e `tsc` na mesa, mas **não rodei
`npm run verificar:actions`**, que lê `.next/server` e por isso só roda depois do build. Ele está
por último no `ci.yml` exatamente por isso, e eu não o segui.

## 5.2 Três das quatro mutações novas não eram detectadas — e a causa era boa

O injetor reportou `64/67`. As três causas, e o que cada uma ensinou:

- **`nucleo-perde-uma-checagem`** caía em `11a`, não em `11`/`estrutura`: o roteiro rotula por
  letra, e `estrutura` conta blocos `return query`, que a mutação **não** muda — ela deixa o bloco
  no lugar e mata o predicado. É justamente a forma silenciosa que interessa.
- **`resumo-…-por-anon`** NÃO derrubava `b2a`, e este é o achado que vale: com o grant de volta,
  `anon` **ainda** leva 42501 — só que da guarda interna, não da falta de privilégio. Os dois
  caminhos dão o mesmo sqlstate, e uma asserção que só olha o comportamento não distingue
  "fechado" de "aberto mas vazio".
- **`rotulo-…-por-authenticated`** não derrubava `c1..c3`, que medem o VALOR devolvido — e o valor
  não muda com o grant.

**O roteiro foi REFORÇADO, e não a mutação afrouxada:** quatro asserções novas — `b2c`/`b2d` e
`c4`/`c5` — que olham a **superfície** (`has_function_privilege`), não o comportamento. A
diferença importa: com o grant, a função passa a ser anunciada pelo PostgREST em `/rest/v1/rpc/`
para a chave pública. Resultado: **67/67 detectadas pelo cenário nomeado**.

---

# 6. As onze decisões, e o custo que decidiu cada uma

*A ata completa está em `docs/DECISOES.md` (2026-09-10). Aqui, o custo — o que cada alternativa
cobrava.*

| # | Decisão | O que a alternativa custava |
|---|---|---|
| 1 | Núcleo extraído; o resumo NÃO chama a função da `/dev` | O desenho da ficha **recusa a conta do smoke**; a saída óbvia (copiar o SQL) é a doença das 11 cópias que a F51 curou |
| 2 | Hoje-zero × catraca, **por alvo**, e a base só desce | Alarme "acima de zero em todas" nasceria vermelho no primeiro dia (3 chaves com achado real) — e alarme que nasce vermelho ensina a ser ignorado. Uma base ÚNICA faria o disparo contra o ensaio alarmar sozinho todo dia |
| 3 | Redação por nome **e** por valor | Só por nome deixaria sair o `alvo` da auditoria, que é "e-mail do convidado" — nenhuma regex de segredo casa aquele nome |
| 4 | A trava alcança TODO o servidor | A da ficha deixaria **17 das 76** livres para voltar no dia seguinte |
| 5 | Leitura pela chave pública, sem `head` | Uma RPC nova para `anon` derrubaria DUAS travas do `catalogo_secdef`; e `head: true` numa relação inexistente devolve 204/null/null — falso verde no cenário que a sonda existe para pegar |
| 6 | A Parte C fica fora do agendado | Com conta `consulta`, 6 dos 65 checks viram AVISO com texto que MENTE sobre a causa, e ficam cegos para sempre |
| 7 | `.env.example` por classe, com as de sistema numa lista nominal | Documentar 6 de 51 é o que havia; documentar as de sistema seria mentir sobre quem as define |
| 8 | Três consumidores, três semânticas | Uma semântica só ou quebraria o CI (que restaura num Postgres local sem ref) ou impediria a carga de go-live (que vai a produção por desenho) |
| 9 | Conta criada pela API + cargo por RPC com sessão de admin | O service role não carrega identidade: a trilha nasceria sem autor |
| 10 | Branch descartável, só push, sem PR | Um PR dispararia CI (minuto) e deixaria **mergeável** um erro de propósito |
| 11 | `RUNBOOK-ALARME.md` + `INVENTARIO-CREDENCIAIS.md` | Um documento só misturaria "o que fazer quando o alarme toca" com "onde vive a chave" — consultas diferentes, momentos diferentes |

---

# 7. As sabotagens, com saída real

Todas em `docs/f55-evidencias/`. Nenhuma tem valor de credencial, nome de pessoa ou patrimônio
real dentro.

| # | arquivo | o que prova |
|---|---|---|
| A1 | `A1-travas-vermelhas.txt` | as duas travas **nascendo vermelhas** contra o repositório de antes: as 76 chamadas acusadas pelo nome, arquivo:linha, e os 6 `catch` |
| A2 | `A2-sabotagem-redacao.txt` | `ctx` com `senha`/`token`/`apiKey`/`hash`/`cpf`/`SUPABASE_SERVICE_ROLE_KEY`; e-mail sob chave inocente; e-mail dentro de `Error.message`; CPF e telefone; JWT; `ctx` circular; `ctx` gigante — com **o que saiu no lugar** |
| A3 | `A3-sabotagem-travas-mordem.txt` | reintroduzidos UM `console.error` numa página de `app/(app)` e UM `} catch {` numa função exportada — as duas travas mordem; e os dois arquivos que só CITAM a diretiva continuam de fora |
| B1 | `B1-onrequesterror-na-vercel.txt` | a linha estruturada **no log da Vercel**, e a querystring com nome e patrimônio fictícios **não vazando** |
| C1 | `C1-doze-pecas-byte-a-byte.txt` | o diff das doze peças contra a `0136`: **189 linhas idênticas**, 12 `return query` dos dois lados |
| C2 | `C2-apply-0138.txt` | o apply nos dois bancos, a verificação pós-apply, os mesmos totais antes × depois, e o **ensaio da ordem de rollback** |
| D1 | `D1-custo-de-minutos.txt` | o consumo medido job a job, a estimativa do workflow novo, e o 404 da API de billing |
| D2 | `D2-banco-sem-docker.txt` | 32 → 33 roteiros, 706 → 745 asserções, e as quatro mutações novas detectadas pelo rótulo NOMEADO |
| E1 | `E1-guardas-recusam.txt` | **seis** recusas com saída real: `db:reset` com ref inventado e com ref de produção; as três formas de "o banco não confirma o rótulo" (resposta simulada, e declarada); `restaurar.mjs` com ref inventado e com produção; e ele **aceitando** Postgres local sem ref |
| G1/G2 | `G1-build.txt`, `G2-lint-tsc-test.txt` | `build`, `lint`, `tsc` e `test` limpos, colados por inteiro |

### A sabotagem que achou um furo de verdade

A da redação (A2) foi a que pagou: `\bkey\b` **não casa `SUPABASE_SERVICE_ROLE_KEY`**, porque `_`
é caractere de palavra e não há fronteira antes do `KEY`. A chave mais perigosa do repositório
saía inteira sob o nome dela mesma. Corrigido, com caso de regressão que cobre as seis variáveis
de nome composto que o repositório usa.

---

# 8. Os 33 critérios, autoverificados

| # | critério | veredito |
|---:|---|---|
| 1 | Travas nasceram VERMELHAS e estão verdes sem exceção fora da lista nominal | ✅ `A1` e `A3` |
| 2 | Nenhum `console.*` de servidor fora do funil, com o número lado a lado | ✅ 76 migradas de 76 medidas |
| 3 | Zero `} catch {` em função exportada; a trava lê a DIRETIVA | ✅ caso de teste próprio para os dois arquivos que só mencionam |
| 4 | `registrarFalha` emite uma linha JSON, com `empresa`, e NUNCA lança | ✅ provado com erro que não é `Error`, `ctx` circular, `ctx` gigante, getter que estoura e console indisponível |
| 5 | Redação provada por sabotagem | ✅ `A2` |
| 6 | `instrumentation.ts` sem header e sem querystring; formatador sem API de Node, provado por teste | ✅ bloco (c) de `observabilidade-fonte.test.ts` |
| 7 | Erro provocado aparece estruturado no log da Vercel, sem dado pessoal | ✅ `B1`, com as duas metades |
| 8 | `/api/saude` 200 com versão e commit, 503 com o banco fora, sem cache, sem schema, sem proxy | ✅ |
| 9 | Asserções 4 e 6 do `catalogo_secdef` intactas; sem o falso verde do HEAD | ✅ |
| 10 | A `0138`; o SQL das doze num lugar só; `dev_checagens_integridade` devolve o mesmo | ✅ `C1` e `C2` |
| 11 | `integridade_alarme.sql` planta os doze e afirma paridade, recusas, ausência de amostra e rótulo | ✅ 38 asserções, 0 falhas no CI |
| 12 | `catalogo_secdef` acolhe as três; `definer_sem_tenant` fica sem elas, com o porquê | ✅ |
| 13 | `db:test:mutations` verde, com as novas acusadas pelo rótulo nomeado | ✅ **67/67** |
| 14 | Sem `--exigir-f12`, `preF12` nem `n/a` de schema; credencial ausente é FALHA no agendado | ✅ sobrou 1 `n/a`, de estado de dado |
| 15 | Linha de base medida nos dois bancos, versionada, com política e releitura | ✅ §2 |
| 16 | `cobertura.test` reprova chave sem política — provado com chave fictícia | ✅ caso "SABOTAGEM" no próprio arquivo |
| 17 | `saude.yml` só com `schedule` + `dispatch`, permissões mínimas, sem eco de secret, travado | ✅ 36 casos |
| 18 | Alarme provado de ponta a ponta no ENSAIO | ⏳ ver §9 |
| 19 | Dispatch contra produção com a conta nova, veredito certo | ⏳ ver §9 |
| 20 | Custo e projeção na ata, lado a lado com o consumo medido | ✅ `D1` |
| 21 | Guardas recusam; `restaurar` aceita local; `import/guard` intacto | ✅ `E1` |
| 22 | `.env.example` cobre o que o código lê; o teste morde | ✅ |
| 23 | Frente F na ordem 1 → 2a → 2b → 3 | ✅ as quatro unidades, sem bloqueio do classificador |
| 24 | Nenhum valor de credencial em lugar nenhum, com varredura final | ✅ §10 |
| 25 | Inventário de credenciais, por nome, indexado | ✅ |
| 26 | `lint`, `test`, `build`, `tsc` limpos; `db:lock` no commit | ✅ `G1`/`G2` |
| 27 | `0138` no ensaio primeiro, com verificação e contagens antes = depois | ✅ `C2` |
| 28 | `database.ts` atualizado | ✅ regenerado de produção |
| 29 | `1.60.0`, CHANGELOG, registry, tag | ✅ (tag no fechamento) |
| 30 | Ordem de rollback no cabeçalho, ensaiada só no ensaio | ✅ `C2` passo 4 |
| 31 | PR mergeado com os dois checks verdes; deploy; smoke pós-deploy | ⏳ ver §9 |
| 32 | Relatório com evidências, roteiro no topo, divergências e "o que não prova" | ✅ este arquivo |
| 33 | Nada fora do escopo tocado | ✅ §10 |


---

# 9. O alarme de ponta a ponta, e o fechamento

*(preenchido depois do merge — o `workflow_dispatch` só existe com o arquivo na branch padrão)*

---

# 10. Escopo e segurança — as duas varreduras finais

## Nada fora do escopo

`git diff --stat main...HEAD`: **98 arquivos, 9.037 inserções, 274 remoções**. Conferido:

- **nenhuma migration antiga tocada** (a `0138` é a única em `supabase/migrations/` que mudou, e
  ela é nova);
- **nenhuma dependência nova** — `package.json` mudou só no campo `version`;
- **nenhum `empresa_id`** em lugar nenhum (o campo `empresa` do log é `null` fixo, reservado);
- **`src/lib/import/` intocado** (é a F56);
- **nenhum teste existente mudado sem a explicação no próprio teste** — são quatro, e os quatro
  estão no §4 com o motivo escrito ao lado da asserção.

⚠ **Uma exceção declarada:** editei o cabeçalho da `0138` **depois** de ela ter sido aplicada, e
usei `npm run db:lock -- --regravar-alterada`. O diff, filtrando linhas `--`, tem **ZERO** linhas
de SQL executável, e o texto aplicado nos bancos nunca teve o cabeçalho (ele começa em
`create or replace function`). A ata de 09/09 avisa que essa edição "deixa para trás todo banco
que já aplicou" — então fiz a conferência que ela pede: `md5(pg_get_functiondef(...))` das quatro
funções, **com e sem comentários, idêntico nos dois bancos**. Nenhum banco ficou para trás. O
motivo da edição está no §5 do `DECISOES.md`: o pseudo-SQL do cabeçalho quebrava o
`corpo-vigente.mjs`.

## Nenhum valor de credencial

Varredura por PADRÃO (nunca por valor), sobre o repositório inteiro:

```
git grep -nE "eyJ[A-Za-z0-9_-]{20,}|sb_(publishable|secret)_[A-Za-z0-9]{10,}|sbp_[A-Za-z0-9]{20,}"
```

Dois achados, os dois **fabricados de propósito** e dentro do teste de sabotagem da redação:
- `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmaWN0aWNpbyIsInJvbGUiOiJhbm9uIn0.ZmljdGljaW8`
  — cujo payload decodifica para `{"sub":"ficticio","role":"anon"}`;
- `sb_publishable_abcdef123456789`.

E-mail real: só `seed.consulta@wap.ind.br`, que é a persona **fictícia** do próprio
`scripts/seed.ts` e já estava no repositório. Patrimônio (`WAP` + 7 dígitos) nas evidências:
**zero**. `.env*` versionado: só o `.env.example`, e ele não tem um valor sequer.

### Como as credenciais foram manuseadas

Todo movimento de valor aconteceu **dentro de um processo só**, num script em `scratchpad/` (que
o `.gitignore` ignora inteiro), apagado no fim. O que os scripts imprimiram foi **nome, ref,
host e tamanho** — nunca conteúdo. `gh secret set` sempre por **stdin**, nunca `--body`.

A troca do `.env.local` foi **conferida por hash antes de gravar**: toda variável que não estava
na lista de mudanças tinha de ter o mesmo sha256 antes e depois. E a conferência **acusou** na
primeira execução — as duas `SMOKE_*` nasciam sem estar declaradas como previstas —, o que é a
trava funcionando antes de qualquer estrago. Nenhuma cópia do arquivo antigo foi guardada: o que
esta fase tirou dele existe no painel da Supabase e na Vercel.

---

# 11. O que este relatório NÃO prova

1. **Ninguém vigia o vigia.** Se o agendamento parar — cota de Actions esgotada, workflow
   desabilitado, execução descartada pelo GitHub sob carga —, o alarme **silencia sem aviso**, e
   silêncio é indistinguível de "está tudo bem". As duas mitigações são manuais e estão escritas
   no `RUNBOOK-ALARME.md`: o histórico de execuções em *Actions → Saúde* (uma lacuna nele é
   visível a olho nu) e a página de billing.
2. **O GitHub pode ATRASAR e até DESCARTAR uma execução agendada.** A doc é explícita: sob carga
   alta o evento `schedule` atrasa e *"some queued jobs may be dropped"*. Usei minuto quebrado
   para reduzir isso, mas não há garantia — e uma execução descartada não deixa rastro nenhum.
3. **A checagem vê o banco num INSTANTE**, de 6 em 6 ou de 24 em 24 horas — não continuamente.
   Uma corrupção que apareça e desapareça entre dois disparos não é vista por ninguém.
4. **O funil cobre o que passa por ele**, não o que o próprio Next loga sozinho. Um `console`
   interno do framework, um erro do runtime da Vercel, um timeout de infraestrutura — nada disso
   passa por `registrarFalha`.
5. **As dez chamadas de Client Component continuam logando no navegador de quem opera**, e não
   chegam ao servidor. É por construção (`server-only` não pode ser importado de lá), e o lado
   servidor desses mesmos erros é o que o `onRequestError` apanha — mas o que a pessoa vê no
   console do navegador dela continua invisível para nós.
6. **A sonda prova "responde", não "responde certo".** `/api/saude` diz que a aplicação está de pé
   e que o Postgres respondeu. Ela não olha um número na tela.
7. **A prova do `onRequestError` foi de UM tipo de erro.** `routeType: 'route'`, numa prévia. A
   doc afirma que o hook também é chamado para `render`, `action` e `proxy`, e o formatador trata
   os quatro igual — mas só um foi exercitado no ar.
8. **O roteiro dos doze estados roda no Postgres do CI**, que é o recorte MÍNIMO: `storage` e
   `auth` são *schema*, não serviço. Ele prova a MECÂNICA das checagens, não o comportamento
   contra o Storage de verdade.
9. **A prova do alarme ponta a ponta foi no ENSAIO, por dispatch.** O disparo AGENDADO contra
   produção não foi observado dentro desta run (ver §9) — e ele é o caminho que vai valer todo
   dia.
10. **A linha de base é uma foto de 10/09/2026.** `conflito_entre_filiais` caiu de 137 para 69 em
    cinco semanas: os números se movem, e a catraca só protege contra SUBIDA.
11. **Os achados de produção não foram investigados**, só contados. Não sei por que existem 3
    arquivos de termo órfãos nem de quando são os 69 conflitos.
12. **A Parte C do smoke não roda no agendado**, então as seis rotas de `/admin` continuam sendo
    exercitadas só no ritual pós-deploy, à mão.
13. **A rotação da senha da conta `consulta` está escrita, não automatizada.** Se ninguém a girar,
    ela não gira.

---

# 12. Pendências e backlog nomeado

## Para a F56 (o import)

- **O import já nasce com o funil**: `actions/importar.ts` teve os quatro `} catch {` extintos e
  as duas chamadas migradas. O que ainda escapa dele: o **413** do `bodySizeLimit`, que acontece
  ANTES da Server Action — sem log, sem `import_logs`, sem `eventos_admin`, e possivelmente com o
  backup já no bucket. `onRequestError` **pode** apanhá-lo (`routeType: 'action'`), mas isso não
  foi verificado, e a F56 já tem `conferirTetos` no escopo.
- **Cinco RPCs destrutivas quebram por FK** e continuam quebrando: `resetar_acervo` apaga
  `movimentacoes` sem tocar `lancamentos_item` (34 linhas com `movimentacao_id` em produção), e o
  import tem a mesma forma com `pendencias_item` (17). Herdado da F54, e nomeado lá também.

## Para a F62 / F69 (multiempresa)

- **O campo `empresa` do log está reservado e vazio.** Ele sai em toda linha, hoje `null`. Quando
  a F62 der raiz ao tenant, o valor entra sem mudar o formato do que já foi gravado — e as
  consultas de log que existirem até lá continuam válidas.
- **A linha de base do alarme vai precisar de recorte por empresa**: as doze checagens contam o
  banco inteiro. Com dois tenants, `conflito_entre_filiais = 70` não diz de quem é o conflito.

## Para a F73 (o piloto)

- **O canário de isolamento mora neste workflow.** `scripts/smoke/integridade.mjs` foi desenhado
  para receber uma segunda sessão sem ser reescrito: `abrirSessao(cfg)` recebe credencial e
  devolve token, e as afirmações rodam por sessão.
- **E a quarentena do injetor foi REAPONTADA para lá**, com o motivo escrito:
  `conflito-serializacao-por-advisory-lock` exige um harness com DUAS conexões `psql`
  simultâneas — a mesma capacidade que o canário de dois tenants precisa construir.

## Sem dono ainda

- **`src/lib/supabase/proxy.ts:6` diz que o proxy roda no Edge.** No Next 16 ele roda **sempre em
  Node** e não aceita troca (doc local, `version-16.md:629`). A decisão de arquitetura que o
  comentário justifica continua válida pelos motivos dela; só a justificativa envelheceu. Não
  corrigi: mexer ali não era escopo, e o comentário não muda comportamento.
- **`smoke-prod.mjs:827` ainda usa `count: 'exact', head: true`** num check, contra a própria
  regra escrita do arquivo. É risco atenuado (a existência da tabela já foi confirmada por um
  `select` sem `head` no mesmo check), mas é uma inconsistência com a política documentada.
- **`--regravar-alterada` deveria exigir a reemissão da função nos ambientes já aplicados**, ou a
  sonda de paridade deveria rodar fora de janela de apply. A ata de 09/09 já nomeou isso; esta
  fase usou o caminho e fez a conferência à mão.
