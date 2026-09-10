# F55 — Observabilidade, sonda e alarme de integridade

*Ordem de serviço gerada em 10/09/2026, a partir de `docs/PLANO-MULTIEMPRESA.md` §5, Bloco C.*

**Por que ela existe.** Hoje o sistema só avisa que quebrou quando alguém tropeça no defeito. O único
detector de dado corrompido são as doze checagens de integridade da `/dev` — e elas só rodam quando **um
dev abre a tela**; a décima nasceu **depois** do defeito que deveria ter detectado (`0111`). O smoke de
produção roda quando alguém lembra, depois de um deploy. Um erro no servidor vira um `console.error` solto,
em **76 lugares**, cada um no formato que quem escreveu escolheu — e **seis blocos `} catch {`** em Server
Actions **engolem** a exceção sem deixar rastro nenhum. A ficha resume numa frase: *fazer o sistema avisar
quando quebra, em vez de esperar alguém abrir a tela.*

E há um item que a ficha chama de o mais urgente e o mais barato do dossiê inteiro, e a medição de hoje
confirma: **o `.env.local` desta máquina aponta para PRODUÇÃO, com `SEED_CONFIRM=sim` e `SEED_PROJECT_REF`
igual ao ref de produção** — o mesmo estado que a F11 descobriu em 22/07 e que o comentário do
`scripts/env-guard.ts` descreve como o dia em que `npm run db:reset` teria zerado o acervo real. A identidade do
ambiente, hoje, é conferida por uma lista de negação com um item; o resto são travas que protegem por acaso.

**Por que ela vem AGORA.** Porque a F54 fechou deixando o pedido escrito no backlog: *"a sonda e o alarme
que fariam a checagem 12 avisar sem alguém abrir a tela"* — a 12ª conta arquivo de segurança sobrando no
bucket que agora guarda documentos assinados, e ela já tem achado em produção. Porque a F56, a próxima, mexe
no import — e é melhor que a fase que mexe no motor mais perigoso da casa já encontre o funil de falha e a
sonda no ar. E porque o multiempresa vai precisar dos dois: o campo `empresa` do log nasce reservado agora, e
o smoke agendado é onde o **canário de isolamento** da F73 vai morar (duas sessões, dois tenants, cada um
vendo só o seu).

**O que esta fase NÃO é.** Não é Sentry nem agregador nenhum (dependência + custo; §9 do plano). Não é
painel. Não é alerta por taxa de erro — num sistema de nove usuários ele nunca dispara; o que falta é
**sonda sintética**. Não é tabela de série temporal no banco (o histórico de execuções e a issue de alarme
já são a série de custo zero). Não é consertar o que a linha de base encontrar em produção — achado é dado,
e dado se relata. Não é mudar o que qualquer checagem conta. Não é o import (F56), nem `empresa_id` (F62),
nem policy de Storage. E não é consertar o consumo de minutos do CI — é **não piorá-lo às cegas**.

**As três decisões do Johnny para esta fase (10/09/2026).** (i) O smoke agendado usa uma conta **NOVA, de
cargo `consulta`** — e o resumo de integridade passa a aceitar qualquer logado ativo, divergindo do
`e_admin()` da ficha. (ii) As operações de credencial (conta e secrets no GitHub, `.env.local` → ensaio,
`SUPABASE_ACCESS_TOKEN` fora do `.env.local`) ficam **com o agente**, que faz o que der e deixa para o
Johnny só o que exige painel. (iii) O alarme avisa por **issue no repositório** — aberta, atualizada e
fechada pelo workflow — **mais** o e-mail nativo do GitHub.

---

**Trinta e quatro fatos de leitura do repositório e do ambiente, medidos em 10/09/2026, que a ficha do plano
não tem.** Estão agrupados pelas sete frentes. **Refaça cada medição antes de usá-la** — a fila desta casa
anda rápido, e um número desta lista pode ter envelhecido entre hoje e a sua run.

## Frente A — o funil e a instrumentação

1. **A migration desta fase é a `0138`, e a versão é a `1.60.0`.** A ficha promete a `0135`; a F53 consumiu
   `0133`→`0135`, a F54 a `0136` e a `0137`. Há **136 arquivos** em `supabase/migrations/` (a `0029` é gap
   real), o último é `0137_vocabulario_import_falhou.sql`, e o `package.json` está em **`1.59.1`** — a PATCH
   do rollout que, no PR #38, **aplicou a fila `0131`→`0132` em produção**. A fila pendente que as F52→F54
   carregaram **não existe mais**. Depois dela, o PR #39 reemitiu três funções só em comentário, sem versão.
   `main` em `1750052`, árvore limpa.

2. **São 86 chamadas de `console.error`, não 94.** 90 linhas não-teste de `src/` contêm a palavra; **quatro
   são comentário** (`actions/relatorios.ts:246`, `queries/relatorios/estoque.ts:158`,
   `queries/relatorios/itens.ts:53`, `queries/relatorios/snapshot.ts:97`). Por área: `lib/actions` **40**,
   `lib/queries` **19** (a ficha diz 22 — eram 22 linhas, três são comentário), `app/(app)` **10** de servidor
   (páginas, layout, `dev/acoes-export.ts`), `lib/storage/copiar-antes-de-remover.ts` **3** (nasceu na F54),
   `lib/auth/acesso.ts` **3**, `lib/auditoria-registro.ts` **1** — e as de cliente do fato 3. `console.warn`,
   `console.log` e `console.info` em `src/` não-teste: **zero**.

3. **As exceções de Client Component são DEZ, não duas.** A ficha nomeia `app/error.tsx` e
   `global-error.tsx`. Há **oito** `error.tsx` (`app/`, `(app)/`, `ativos`, `itens`, `itens/conferencia`,
   `itens/historico`, `movimentacoes`, `pendencias`), mais o `global-error.tsx`, mais
   `components/layout/exportar-csv-button.tsx` — os dez com `'use client'`. **Esses logam no NAVEGADOR de
   quem opera: nenhum deles chega ao log da Vercel.** O lado servidor desses mesmos erros é o que o
   `onRequestError` pega. Conta final: **76 chamadas de servidor a migrar**, 10 de cliente em lista nominal.

4. **A trava da ficha deixa 17 portas abertas.** *"Nenhum `console.error` em `lib/actions/**` e
   `lib/queries/**` fora do funil"* alcança **59 das 76**. As outras 17 — as 10 de `app/(app)`, as 3 de
   `lib/storage`, as 3 de `lib/auth` e a da auditoria — ficariam livres para voltar no dia seguinte.
   (Decisão 4.)

5. **Seis `} catch {` sem binding em módulos `'use server'`, e os seis ENGOLEM o erro** — devolvem mensagem
   amigável sem registrar nada: `actions/conflitos.ts:273` (o backup dos cadastros), `actions/importar.ts:339`,
   `:352`, `:415` e `:484` (o backup do acervo: *"Import cancelado"* — e ninguém nunca vai saber por quê),
   `actions/termos.ts:611` (montar o documento). Confira quais estão dentro de função **exportada** — é o que
   a ficha proíbe. ⚠ **São 20 módulos `'use server'`, os vinte com a diretiva na linha 1 — e a armadilha é a
   inversa da que parece:** uma detecção por MENÇÃO no topo do arquivo acha **22**, porque
   `src/lib/actions/guardas-de-action.ts` e `src/lib/use-server-exports.ts` falam de `'use server'` em comentário
   nas primeiras linhas e **não são** módulos de Server Action. A trava tem de reconhecer a DIRETIVA (a primeira
   instrução do arquivo), não a palavra — medido. O molde de trava estática sobre módulo `'use server'` é o próprio
   `src/lib/use-server-exports.ts` (F13), com o teste dele.

6. **Dado pessoal escapa por VALOR, não por nome de campo.** A trava da ficha olha o NOME da chave do `ctx`
   (`/senha|token|key|hash|cpf/i`). Mas `lib/auditoria-registro.ts:45` loga `alvo` — e o próprio tipo diz o
   que é: *"e-mail do convidado"*. Nenhum nome casa a regex; o valor é pessoal. E o precedente da casa para
   erro do PostgREST já está escrito, no `descreverErro` do smoke: **código e mensagem, nunca `details`** —
   que carrega valor de linha (`Key (patrimonio)=(…) already exists`). (Decisão 3.)

7. **`src/instrumentation.ts` não existe, e `src/app/api/` também não: `/api/saude` será o PRIMEIRO route
   handler do projeto.** Não há precedente de código na casa. O `AGENTS.md` manda ler
   `node_modules/next/dist/docs/` antes de escrever — Next **16.2.12**. Lido:
   `01-app/03-api-reference/03-file-conventions/instrumentation.md` põe o arquivo em `src/`;
   `onRequestError(error, request, context)`; **`request.path` vem COM a querystring** (a busca de `/ativos`
   carrega nome e patrimônio nela) e **`request.headers` traz o cookie da sessão**; `context` traz
   `routePath` (o caminho do ARQUIVO, `/app/ativos/[id]`), `routeType` (`render`/`route`/`action`/`proxy`) e
   `renderSource`; e o arquivo vale para os dois runtimes (Node e Edge). ⚠ **No Next 16 o proxy roda em Node, e não
   aceita troca** (`02-guides/upgrading/version-16.md:629`: *"The `edge` runtime is NOT supported in `proxy`"*;
   `file-conventions/proxy.md:223`) — e o projeto não tem rota Edge. Nunca header; nunca `request.path` cru.

8. **`server-only` já é dependência** (`^0.0.1`; 33 arquivos o importam) — o funil não custa pacote novo. E
   `idOperador(supabase)` (`auth/acesso.ts:75`) **exige um client**: o funil não pode fazer I/O próprio para
   descobrir quem é — quem chama e já sabe, passa.

## Frente B — a sonda sem sessão

9. **O proxy engole `/api/saude`.** O `matcher` (`src/proxy.ts:11-15`) exclui só asset; `updateSession`
   (`src/lib/supabase/proxy.ts`) libera sem sessão apenas `/login`, `/auth/**` e `/relatorios/acesso` —
   qualquer outra rota vira **307 → `/login`** — e ainda roda `supabase.auth.getUser()` em todo request. A
   sonda sem sessão receberia um redirect no lugar da resposta.

10. **`anon` não executa NENHUMA função, e há duas travas que dizem isso.** `catalogo_secdef.sql`, asserção
    **4** (*nenhuma `security definer` executável por `anon`*) e asserção **6** (nenhuma INVOKER alcançável
    por `anon` — `k_invoker_anon` ficou **vazia** desde a `0129`/F50). Um "`select 1` pela anon key" feito
    com RPC nova para `anon` quebra as duas. E o falso verde já medido pela casa:
    `.select(…, { count: 'exact', head: true })` numa relação **inexistente** devolve **204, count null,
    error null** (`smoke-prod.mjs:334-341`, 22/07/2026) — uma sonda feita assim diria "banco ok" com a
    tabela sumida. (Decisão 5.)

11. **Versão e commit têm fonte certa:** `VERSOES[0]` do `registry.ts` **é** a versão no ar (a trava do
    `registry.test.ts` a amarra ao `package.json`); o commit vem de `VERCEL_GIT_COMMIT_SHA`, cortado em 7
    como `queries/dev.ts:108` já faz. A ficha proíbe estado de migração na rota pública — é informação de
    schema.

## Frente C — o alarme de integridade

12. **São DOZE checagens, não onze** — a `0136` (F54) acrescentou `backup_orfao`. As doze chaves estão em
    **`src/lib/queries/dev.ts:194-261`** (`CHECAGENS`), **não** em `validators/dev-integridade.ts` — que só
    tem a junção pura. E `queries/dev.ts` importa `server-only`: um `cobertura.test.ts` que o importe
    **quebra no Vitest**, pelo motivo escrito no cabeçalho de `dev-integridade.ts`. Leia o fonte, ou mova o
    catálogo para módulo puro — decida.

13. **⚠ O desenho da ficha nasce quebrado para a conta do smoke.** A ficha manda o resumo *"chamar
    `dev_checagens_integridade()` por dentro"*. O corpo vigente dela (`0136:43`) abre com
    `if not public.e_dev() then raise … 42501`, e `e_dev()` lê `papel_atual()`, que lê **`auth.uid()` — o
    JWT de quem chama**. `security definer` troca o `current_user`; **não troca o JWT**. Resultado: um resumo
    que chama a função por dentro recusa **todo mundo que não é dev** — inclusive a conta que vai rodar o
    smoke. E a saída óbvia — copiar o SQL das doze para dentro do resumo — é exatamente a doença que a F51
    curou nas **11 cópias** da RPC de import. (Decisão 1.)

14. **Decisão do Johnny: a conta do smoke agendado é NOVA e de cargo `consulta`.** Consequência que a ficha
    não previa: o resumo aceita **qualquer logado ativo** (`papel_atual() is not null` — o piso de leitura
    da `0070`/`0073`), não `e_admin()`. Ele devolve só `(chave, total)`, zero linha de dado — e a conta que o
    GitHub guarda, se vazar, **lê** (como todo logado já lê hoje), mas não escreve, não importa e não gere
    conta. A divergência da ficha vira ata.

15. **Oito das doze checagens não aparecem em roteiro nenhum.** Medido por chave em `supabase/tests/`:
    `arquivo_termo_orfao` (1 menção, `dev_destrutivo.sql`), `detentor_em_estado_sem_dono` (5,
    `f36_detentor.sql`), `backup_orfao` (1) e `reserva_aberta` (4, ambas em `f41_regularizacao.sql`). As
    outras oito — `patrimonio_duplicado`, `ativo_filial_inativa`, `termo_sem_arquivo`, `perfil_sem_conta`,
    `conta_sem_perfil`, `pendencia_de_estornada`, `operador_sem_filial` e `conflito_entre_filiais` — **zero**.
    E várias só se plantam
    **desligando a própria trava que as torna "impossíveis"** (índice único, trigger, `guarda_acervo`),
    dentro da transação do roteiro. Três dependem de `storage.objects` e duas de `auth.users`, que no CI são
    o recorte **mínimo** de `supabase/ci/bootstrap-storage.sql` e `bootstrap-auth.sql` (schema, não serviço).

16. **"Hoje-zero" não é "todas".** Produção tem achado real em pelo menos duas: `backup_orfao` com **10** (o
    próprio texto da v1.59.0 no `registry.ts`: *"hoje há dez deles guardados"*) e `conflito_entre_filiais`
    com **137 grupos** em 04/08 (nota da F25 no smoke). Um alarme "falha se passar de zero" em todas nasce
    vermelho no primeiro dia e ensina a ignorá-lo. E a 12ª tem **falso positivo transitório** documentado
    pela própria F54 (`RELATORIO-F54.md` §10): *"um backup em voo (subido, RPC ainda rodando) aparece
    contado por alguns segundos"*. (Decisão 2.)

17. **O rig de prova, no último número:** **63 mutações, teto 64** (`scripts/db/mutacoes.test.mts:70-85`,
    F54); **32 roteiros, 706 asserções** no último `banco-sem-docker` (PR #37). Função SQL de segurança nova
    entra nas listas nominais de `catalogo_secdef.sql` e `definer_sem_tenant.sql` **no mesmo commit**
    (doutrina da F48/F52, `RUNBOOK-BANCO.md` → *"security definer — três exigências"*). E todo roteiro
    termina com a linha `FIM <nome>: N asserções, M falhas` (F45) — o runner reprova quem não a emite.

## Frente D — o smoke agendado e o alarme

18. **O smoke de hoje, por dentro.** `scripts/smoke/smoke-prod.mjs` (1.388 linhas): **Parte A** — 18 rotas
    sem sessão, só `fetch`; **Parte B** — leituras com sessão via `@supabase/supabase-js`; **Parte C** —
    rotas logadas, chamada **de dentro** de `parteB`, com marcadores que supõem conta **ADMIN** (comentário
    da F25: *"A conta do smoke é ADMIN"*). Último resultado: **108 OK · 1 aviso · 0 falha**. ⚠ **Sem
    credencial, a Parte B é pulada e o script sai com código 0** (está no README) — num agendamento, isso é
    **verde por omissão**.

19. **O falso verde que a ficha manda matar é maior do que ela diz.** `--exigir-f12`/`SMOKE_EXIGIR_F12` e os
    **três** `preF12: true` (`itens.estoque_minimo` e os dois de `kits_modelos`) — **mais** os ramos `n/a` da
    MESMA classe que a ficha não nomeia: *"migration 0101 não aplicada?"*, *"0102"*, *"0116/0119"*,
    *"0118"* e *"tabela `colaboradores` ausente"*. Todas essas migrations estão em produção há semanas. Há
    ainda um `n/a` de OUTRA classe — *"nenhum colaborador cadastrado ainda"* —, que é estado de dado, não de
    schema.

20. **O alvo do smoke vem do `.env.local`.** A cascata é `SMOKE_SUPABASE_URL` → `NEXT_PUBLIC_SUPABASE_URL`.
    Trocar o `.env.local` para o ensaio (Frente F) **aponta o smoke pós-deploy para o ensaio sem ninguém
    notar** — a menos que `SMOKE_SUPABASE_URL` e `SMOKE_SUPABASE_ANON_KEY` de produção sejam gravadas
    **antes** da troca.

21. **⚠ O repositório é PRIVADO, e minuto de Actions custa.** Estimado nesta sessão por amostragem (os 40
    runs mais recentes, jobs arredondados ao minuto): **~5,8 min por run**; **161 runs de 01 a 09/09 →
    ~930 min em nove dias, ~3.100/mês no ritmo atual**. O plano da conta **não é legível** pelo token do `gh`
    (as duas APIs de billing respondem 404). A doc oficial: o GitHub Free inclui **2.000 min/mês** em
    repositório privado e o Pro **3.000** — e, sem forma de pagamento cadastrada, *"usage is blocked once you
    use up your quota"*. O agendamento soma a isso; se a cota acabar, **o CI (os dois checks obrigatórios) e o
    alarme param juntos**. Consertar o consumo do CI não é escopo; saber quanto esta fase acrescenta, é.

22. **O que a doc oficial do GitHub diz, conferida em 10/09/2026:** workflow agendado **só roda na branch
    padrão**; o `schedule` atrasa em carga alta — *"High load times include the start of every hour. If the
    load is sufficiently high enough, some queued jobs may be dropped"* — use minuto quebrado;
    *"Notifications for scheduled workflows are sent to the user who last modified the cron syntax in the
    workflow file"*; o desligamento por 60 dias sem atividade vale para repositório **público**;
    `workflow_dispatch` exige o arquivo na branch padrão. Hoje o repositório tem **zero secrets e zero
    variables** (`gh secret list` e `gh variable list` vazios). E `ci-passos.test.ts:376` trava que os jobs do
    `ci.yml` são **EXATAMENTE** `verificar` e `banco-sem-docker` — a sonda mora em arquivo próprio, nunca como
    job do `ci.yml` (reprovaria, e ainda viraria check obrigatório por engano).

23. **Decisão do Johnny: o alarme avisa por issue + e-mail.** O workflow abre (ou atualiza, sem duplicar) uma
    issue de alarme no repositório e a **fecha sozinho** quando voltar ao normal; o e-mail nativo do GitHub
    continua. R$ 0, sem serviço novo. E a Vercel cria **prévia para todo push de PR** (medido: os deployments
    `Preview` saem por commit) — é por onde o `onRequestError` pode ser provado sem tocar produção.

## Frente E — as guardas de ambiente

24. **⚠ O `.env.local` desta máquina aponta para PRODUÇÃO** (`pbtjcalbmepmrqzprusb`), com **`SEED_CONFIRM=sim`**
    e **`SEED_PROJECT_REF=pbtjcalbmepmrqzprusb`**. É o estado exato da F11. O `db:reset` é segurado pela lista
    `REFS_DE_PRODUCAO` e pela trava de ambiente **dentro** de `resetar_dados_ficticios` (`0090`). O **`db:seed`
    não tem trava de AMBIENTE do lado do banco**: além da lista, o que o segura é uma condição de dado — ele recusa
    base que já tem ativo, antes de qualquer escrita (`scripts/seed.ts:1743-1749`), e produção tem 1.621. Protege
    por acaso, não por identidade: uma base de produção nova, vazia, passaria.

25. **Só existem dois projetos.** Produção `pbtjcalbmepmrqzprusb` e ensaio `sgmvldiizsrjbxzzpmhh`
    (`RUNBOOK-BANCO.md`, *"Topologia"*). O "DEV" do `.env.example` e do runbook **é** o ensaio.
    `public.ambiente` (`0090`) tem a linha `'desenvolvimento'` **só no ensaio**; produção é vazia de
    propósito; e `revoke all … from anon, authenticated, service_role` — é por isso que a ficha manda ler o
    rótulo **por função**, não por `select`. Os dois projetos estão `ACTIVE_HEALTHY` (medido hoje pelo MCP).
    ⚠ **E o ensaio NÃO tem as contas do seed**: medido hoje, são 3 perfis — 1 admin ativo, 1 admin inativo, 1
    operador —, **nenhum** `seed.*`, **nenhum** `consulta`, **nenhum** `dev`. A prova do alarme no ensaio
    precisa, antes, de uma conta `consulta` fictícia criada lá.

26. **A inversão da lista tem TRÊS consumidores, com três semânticas, e a ficha nomeia um.**
    `scripts/env-guard.ts` (seed/reset: **só o ensaio**); `scripts/db/restaurar.mjs` (F54: **ensaio OU
    Postgres local sem ref** — o CI roda com `DATABASE_URL` local, e isso não é erro); e
    `scripts/import/guard.ts` (a carga do go-live: vai a **produção por desenho** — *"CARGA_PROJECT_REF … ensaio
    ou produção"*). E `scripts/db/restaurar-guarda.test.mts` exige que as listas de `env-guard.ts` e
    `restaurar.mjs` sejam **iguais**, lendo **`const REFS_DE_PRODUCAO = [...]` por regex** — renomear sem mexer
    nele deixa o teste vermelho por *"não achei"*. (Decisão 8.)

27. **`.env.example` documenta 6 variáveis; o código lê 51.** Intocado desde julho. Medido em `src/` +
    `scripts/` não-teste: **51 nomes** de `process.env` — os **6** documentados; **8 de sistema** (`NODE_ENV`,
    `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA/REF/MESSAGE`, `HOME`, `LOCALAPPDATA`, `VITEST`); e **37 de
    ferramenta** (`CARGA_*` 5, `MEDIR_ITENS_*` 13, `PERF_*` 10, `SMOKE_*` 6, `DATABASE_URL`,
    `DB_TYPES_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`). (Decisão 7.)

## Frente F — as credenciais

28. **Decisão do Johnny: o agente faz o que der; ele completa só o que exige painel.** O `.env.local` tem
    **14** variáveis — por NOME: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
    `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `VIEW_SESSION_SECRET`, `SEED_CONFIRM`,
    `SEED_PROJECT_REF`, `SMOKE_EMAIL`, `SMOKE_SENHA`, `MS_CLIENT_ID`, `MS_TENANT_ID`, `MS_CLIENT_SECRET`,
    `SITE_ID`, `ESPELHO_ITEM_ID`. **Cinco não são lidas por nada no repositório** (`MS_*`, `SITE_ID`,
    `ESPELHO_ITEM_ID` — resto do `PLANO-ESPELHO-SHAREPOINT.md`), e uma delas é o **client secret de um
    aplicativo do Azure**.

29. **`SUPABASE_ACCESS_TOKEN`: quem lê, e o que a ficha pede que pode não existir.** Lido por `scripts/gen-types.ts`
    (só do ambiente do processo — ele **não** carrega o `.env.local`), por `scripts/perf/medir-itens.mjs`
    (carrega o `.env.local`) e citado em `scripts/db/tipos-conjuntos.mjs`. Não existe como variável de usuário
    nesta máquina, e não há login da CLI da Supabase guardado. ⚠ **"Escopo reduzido" é a parte duvidosa da
    ficha**: a introdução da Management API (conferida em 10/09/2026) diz que o token pessoal *"carries the same
    privileges as your user account"*; já as páginas de cada endpoint citam permissões de *"fine-grained token"*
    (ex.: `api_gateway_keys_read`). Confira no painel qual das duas a conta oferece hoje: se houver token com
    permissão reduzida, o novo nasce só com o que `db:types` e `medir-itens.mjs` usam; se não houver, o que
    existe é **validade** (expiry). Criar e revogar token, nos dois casos, é no painel.

30. **A chave de serviço do ENSAIO não sai pelo MCP** — ele entrega URL e chave **publicável**. Ela sai pela
    **Management API** (`GET /v1/projects/{ref}/api-keys`, que exige a permissão de ler segredo), com o token
    pessoal que já está no próprio `.env.local` — lida e gravada no MESMO processo, nunca impressa. É ela que
    completa a troca do `.env.local` e que cria a conta fictícia do ensaio (fato 25). Se o classificador barrar
    essa leitura, a chave fica **VAZIA** no `.env.local` — falha fechada: seed, reset e o download do restaurador
    recusam, e é o certo — e o roteiro do Johnny cobre. Por isso a troca do `.env.local` (que não lê segredo de
    lugar nenhum) vem ANTES dessa leitura, separada dela.

31. **A conta nova do smoke tem regras de nascimento.** Domínio travado no trigger `handle_new_user` (`0041`)
    e em `src/lib/auth/dominios-email.ts`: sufixo `@wap.ind.br`, `@stefanini.com` ou `@latam.stefanini.com`.
    O perfil novo nasce **`papel = 'operador'`** (default da `0061`). Cargo é gravado por
    `definir_papel_usuario` **com a sessão de quem age** (`0074` — o service role saiu desse caminho). O
    convite do app é `generateLink`, **sem SMTP** (`actions/admin.ts:72-151`). E a casa **nunca pôs o e-mail
    nem a senha do smoke no repositório** (`scripts/smoke/README.md`) — só o NOME das variáveis.

32. **A outra máquina** (`C:\Users\yukig\…`) tem o `.env.local` dela, e está fora do alcance desta run.

## Frente G — o fechamento

33. **Esta mesa não tem `psql`, nem CLI da Supabase, nem CLI da Vercel** (Node 26.4, Claude Code 2.1.222).
    `npm run db:test` não roda aqui — quem roda os roteiros é o `banco-sem-docker` do PR, e você **lê a saída
    dele**. Log da Vercel, só pelo MCP da Vercel (precedente: `get_runtime_errors`, nas atas).

34. **O `registry.ts` recusa 21 termos** (`registry.test.ts:160`) — entre eles **`commit`**, **`deploy`**,
    **`Vercel`**, **`Supabase`**, **`RPC`**, **`schema`**, **`endpoint`** e **`migration`**. A entrada da
    1.60.0 fala do efeito para quem opera — o sistema passou a se conferir sozinho e a avisar —, nunca do
    mecanismo.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Fazer o sistema avisar quando quebra, em vez de esperar alguém abrir a tela. Ao final:
(1) toda falha do lado do servidor passa por UM funil — `src/lib/observabilidade.ts`, `registrarFalha({ escopo,
erro, ctx })` —, com saída estruturada de uma linha, `empresa` como campo reservado desde já e redação PROVADA de
segredo e de dado pessoal; as 76 chamadas soltas de hoje migradas, os seis `} catch {` que engolem erro em Server
Action extintos, e travas que impedem os dois de voltar;
(2) `src/instrumentation.ts` registra todo erro de request do Next — rota, tipo, método, digest; nunca header, nunca
querystring —, provado no log da Vercel;
(3) `/api/saude` responde sem sessão, com versão, commit e uma ida e volta REAL ao banco, sem abrir superfície
nenhuma para `anon`;
(4) a migration `0138` cria `checagens_integridade_resumo()` — só `(chave, total)`, para qualquer logado ativo —
SEM duplicar o SQL das doze checagens, e a leitura do rótulo de ambiente por função;
(5) `supabase/tests/integridade_alarme.sql` planta cada um dos doze estados impossíveis e prova que a checagem
correspondente o enxerga;
(6) `.github/workflows/saude.yml` roda a sonda sem sessão a cada 6 h e a sonda logada — conta NOVA, cargo
`consulta` — uma vez por dia; falha quando uma checagem passa da linha de base; e abre, atualiza e fecha SOZINHO
a issue de alarme de cada par (alvo, parte) — provado com uma inconsistência plantada no ENSAIO;
(7) as guardas de ambiente viram lista de PERMISSÃO (ref inventado é recusado), o `.env.example` passa a cobrir o
que o código lê, e as credenciais locais saem do estado de hoje — o `.env.local` desta máquina aponta para
PRODUÇÃO — até onde você alcança; o resto vira um roteiro escrito para o Johnny.
Versão **1.60.0** com tag publicada; PR mergeado com `verificar` e `banco-sem-docker` verdes; `0138` aplicada em
ensaio e produção.
**Nenhuma dependência nova. Nenhum serviço novo. Nenhum `empresa_id`. Nenhum dado real em teste, fixture,
evidência ou issue. Nenhum VALOR de credencial impresso, gravado fora do destino, commitado ou colado — nem em
evidência, nem no relatório.**

# Contexto

## Leia antes de escrever qualquer código
- `@docs/prompts/F55-observabilidade-sonda-e-alarme-ultracode.md` — o CABEÇALHO desta ordem, fora deste bloco,
  traz os **34 fatos medidos** em 10/09/2026. Leia-os primeiro; o resto deste prompt os cita pelo número. Se o
  arquivo não estiver lá, refaça as medições do zero antes de qualquer código.
- `@CLAUDE.md` manda em tudo: modo autônomo e as regras permanentes. Pesam aqui a **1** (escopo), a **2** (NUNCA
  dados reais — e esta fase escreve LOG de produção e abre ISSUE), a **3** (R$ 0 — minuto de Actions em
  repositório privado conta, fato 21), a **4** (segredos e `.env.example` atualizado), a **5** (produção com
  autoproteção), a **6** (doc oficial antes de escrever: Next 16, GitHub Actions, Supabase) e a **8** (versão,
  sem exceção).
- `@AGENTS.md` — *"This is NOT the Next.js you know"*: leia `node_modules/next/dist/docs/` ANTES de escrever
  `instrumentation.ts`, o route handler e o `matcher` do proxy. É o primeiro route handler do projeto (fato 7).
- `@docs/PLANO-MULTIEMPRESA.md`, nesta ordem: **§4** (as 10 regras comuns — em especial a **2**, estado de
  repouso; a **3**, escopo fora explícito; a **4**, trava antes da correção; e a **10**, ordem de rollback),
  **§5 → F55** (a ficha), **§9** (por que não há Sentry) e **§5 → F73** (o canário de isolamento vai morar NESTE
  smoke agendado: desenhe a Parte B para receber uma segunda sessão depois, sem ser reescrita).
  ⚠ **A régua de precedência é uma só, e está em "Autonomia e decisões":** a medição contra o disco de hoje e a
  decisão do Johnny vencem; depois vale este prompt, que ESTENDE a ficha onde ela não cobre o caso (a catraca do
  alarme é um exemplo); a ficha vale no resto. Toda divergência vai para o relatório, explicada.
- **As três decisões do Johnny para esta fase (10/09/2026):** (i) o smoke agendado usa uma conta NOVA de cargo
  `consulta`, e o resumo aceita qualquer logado ativo (fato 14); (ii) as operações de credencial são SUAS — faça o
  que der, e deixe para ele só o que exige painel (fato 28 e a Frente F); (iii) o alarme avisa por ISSUE no
  repositório + o e-mail nativo do GitHub (fato 23).
- O código que a fase toca, inteiro: `@src/proxy.ts` e `@src/lib/supabase/proxy.ts`; `@src/lib/auth/acesso.ts`
  (`idOperador`); `@src/lib/auditoria-registro.ts`; `@src/lib/storage/copiar-antes-de-remover.ts`;
  `@src/app/error.tsx` e `@src/app/global-error.tsx`; `@src/lib/use-server-exports.ts` e o teste dele (o MOLDE de
  trava estática sobre `'use server'`); `@src/lib/queries/dev.ts` (`CHECAGENS`, `rodarChecagens` e o commit em
  `:108`) e `@src/lib/validators/dev-integridade.ts`; `@src/lib/versoes/registry.ts` e `registry.test.ts` (os 21
  termos, fato 34).
- O banco: `@supabase/migrations/0136_checagem_backup_orfao.sql` (o corpo VIGENTE de `dev_checagens_integridade`,
  inteiro, com o cabeçalho que explica por que o comentário não cita as frases do gate);
  `0090_guarda_furos_revisao.sql` (`public.ambiente` e a trava de `resetar_dados_ficticios`);
  `0072_papel_dev_funcoes.sql` e `0073_dev_intocavel_e_arquivamento.sql` (`e_admin`/`e_dev`/`papel_atual` — o
  fato 13 inteiro mora aqui); a `0061` (o `papel` default), a `0074` (`definir_papel_usuario`) e a `0041`
  (`handle_new_user` e os domínios).
- Os roteiros e o CI: `@supabase/tests/_asserts.sql` (`pg_temp.assert_zero_de`, que recusa universo vazio),
  `catalogo_secdef.sql` (asserções 4 e 6, fato 10), `definer_sem_tenant.sql`, `seguranca_catalogo.sql`,
  `f36_detentor.sql` e `f41_regularizacao.sql` (onde três checagens já são exercitadas), `dev_destrutivo.sql`;
  `@supabase/ci/bootstrap-auth.sql` e `bootstrap-storage.sql` (o recorte mínimo); `@scripts/db/corpo-vigente.mjs`,
  `mutacoes.mjs`, `mutacoes.test.mts` e `rodar-roteiros.sh`; `@.github/workflows/ci.yml` (concorrência, Node 24, e
  o porquê de cada escolha, escrito nele) e `@src/lib/ci-passos.test.ts`.
- O smoke e as guardas: `@scripts/smoke/smoke-prod.mjs` e `@scripts/smoke/README.md`; `@scripts/env-guard.ts`,
  `@scripts/reset.ts`, `@scripts/seed.ts` (as personas FICTÍCIAS e a senha delas — que o ensaio hoje NÃO tem, fato 25),
  `@scripts/db/restaurar.mjs` e `restaurar-guarda.test.mts`, `@scripts/import/guard.ts`; `@.env.example`.
- `@docs/RUNBOOK-BANCO.md`: *"O caminho, em 30 segundos"*, *"Topologia"*, *"O gate do modo automático"*,
  *"Aplicar uma migration"* (A), *"security definer — três exigências"*, *"Rollback"*, *"Roteiros de teste SQL"*,
  *"Sonda de paridade"*, *"A trava de hash"* (e *"Quem acrescenta migration atualiza DUAS listas"*), *"O banco do
  CI na mesa"*, *"Armadilhas"* e *"Escalada"*.
- `@docs/RELATORIO-F54.md` — §10 (*"o que este relatório NÃO prova"*) e §11 (o backlog que pede ESTA fase, e a
  "série temporal"). `@docs/DECISOES.md` tem 1,1 MB: **busque, não leia inteiro**.

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
Os 34 fatos estão no cabeçalho. **Refaça cada medição**: a contagem de `console.error` e a lista das dez de
cliente; os seis `} catch {` e quais estão em função exportada; os 20 módulos `'use server'`; o `matcher` do
proxy; as asserções 4 e 6 do `catalogo_secdef.sql`; o `e_dev()` na primeira linha de `dev_checagens_integridade`;
as doze chaves e onde elas moram; as oito sem roteiro; os ramos `n/a` do smoke; o estado do `.env.local` (por
NOME e por REF, nunca por valor); os 51 nomes de `process.env`; os três consumidores da lista de refs. Onde a sua
medição divergir da minha, **a sua ganha** — desde que ela esteja no relatório com a divergência explicada.

**Três medições são obrigatórias antes de escrever código, e nenhuma está no cabeçalho:**
(1) **A linha de base das doze checagens em PRODUÇÃO e no ENSAIO** — o TOTAL de cada uma, **nunca a coluna
`amostra`**, que carrega patrimônio, nome e filial reais. Pelo MCP da Supabase, rodando o SQL de contagem das
checagens tirado do corpo da `0136` — `dev_checagens_integridade()` chamada pelo MCP recusa, porque o MCP não tem
JWT de dev (fato 13). É essa tabela que decide "hoje-zero × catraca" (Decisão 2).
(2) **O custo real de minutos de Actions** — o consumo do mês até aqui (some os jobs faturáveis, arredondados ao
minuto) e uma ESTIMATIVA do custo de uma execução do workflow novo. Depois do merge, o primeiro dispatch MEDE; se
passar da estimativa, a frequência muda por PR novo. A projeção mensal vai na ata. E agrupe os pushes da fase: cada
push custa cerca de seis minutos de CI.
(3) **A doc oficial** — a local do Next 16 para `instrumentation`, route handler e `matcher`; a do GitHub para
`schedule`, `workflow_dispatch`, `permissions` e o que um `GITHUB_TOKEN` com `issues: write` alcança. Não confie
em API de memória (regra 6).

## Comandos que já existem — use, não reinvente
- `npm run lint` · `npm run test` · `npm run build` · `npx tsc --noEmit` · `npm run contraste` ·
  `npm run verificar:actions`
- `npm run db:test` · `npm run db:test:um <roteiro>` · `npm run db:test:mutations` · `npm run db:types:diff` —
  precisam de `psql`/`DATABASE_URL`, que esta mesa NÃO tem (fato 33): o `banco-sem-docker` do PR roda os quatro, e
  você lê a saída com `gh run view --log-failed`.
- `npm run db:lock` — **obrigatório** no mesmo commit da `0138`.
- `npm run db:types` — depois do apply, gerado de **PRODUÇÃO** (a convenção escrita em `ci.yml:288-291`). Ele NÃO
  lê o `.env.local` (fato 29): passe `DB_TYPES_PROJECT_REF=<ref de produção>` e o token no ambiente do processo, ou
  use o `generate_typescript_types` do MCP em produção. Hand-fix
  comentado e datado, com a pendência declarada, só se nenhum dos dois der (precedente F51→F53).
- `node scripts/smoke/smoke-prod.mjs` (e `--sem-sessao`).
- `gh` — está em `C:\Program Files\GitHub CLI\gh.exe` e pode não estar no PATH da sessão. *"Comando não
  encontrado" é hipótese, não conclusão.*

# Escopo

## Dentro — sete frentes, nesta ordem

### Frente A — o funil e a instrumentação
- **As travas vêm ANTES da correção** (regra 4 do §4) e nascem **VERMELHAS** contra o repositório de hoje, com a
  saída guardada em `docs/f55-evidencias/`: (a) nenhum `console.*` em código de servidor fora do funil e fora de
  uma **lista nominal** de arquivos `'use client'` — o alcance é a Decisão 4, e a medição recomenda TODO o
  servidor, não só `lib/actions` + `lib/queries` (fato 4); (b) `} catch {` proibido em função exportada de módulo
  `'use server'` — reconhecendo a DIRETIVA, não a menção à palavra: dois arquivos falam de `'use server'` em
  comentário sem ser módulo de Server Action (fato 5). Travas ESTÁTICAS, no molde de `use-server-exports.ts`: leem
  o fonte, não precisam de banco. A lista nominal de cliente tem teste próprio que reprova quem a aumenta em
  silêncio.
- **`registrarFalha({ escopo, erro, ctx })`**, `server-only`: UMA linha JSON por falha, com `escopo`,
  **`empresa: null` sempre presente** (o campo reservado da ficha), o operador quando quem chama já o tem (o
  funil não faz I/O próprio — fato 8), e o erro como `{ nome, codigo, mensagem }` — **nunca `details` nem `hint`**
  do PostgREST (fato 6). Redação por NOME de chave (a regex da ficha) **e** por VALOR, no alcance que a Decisão 3
  fixar — no mínimo e-mail, porque `auditoria-registro.ts` loga `alvo` —, e a redação por valor vale para TODA
  string que sai do funil, **inclusive `erro.mensagem`**: mensagem de `raise` com `%` leva valor
  (`0090:155-157` põe o patrimônio na frase). **O funil nunca lança**: log que explode dentro de um `catch`
  transforma um erro em dois.
- **As 76 chamadas de servidor migram.** O prefixo `[x]` vira o `escopo`; as que não têm prefixo
  (`queries/conflitos.ts:220`, `queries/pendencias-detalhe.ts:125` e `:185`, `queries/relatorios/estoque.ts:196`,
  e o que mais a sua medição achar) ganham um. **Comportamento idêntico** para quem opera: mesmos retornos, mesmas
  mensagens na tela — o que muda é para onde o erro vai e em que forma.
- **Os seis `} catch {`** ganham binding e `registrarFalha`, mantendo a mensagem ao operador.
- **`src/instrumentation.ts` com `onRequestError`**: `rota` (de `context.routePath`), `tipo` (`routeType`),
  `origem` (`renderSource`), `metodo` e `digest`. **Nunca `headers`** (o cookie da sessão está lá), **nunca
  `request.path` cru** (a querystring leva nome e patrimônio — fato 7). O arquivo vale para os dois runtimes, e o
  proxy do Next 16 roda em Node (fato 7): o formatador não usa API exclusiva de Node, e isso se prova por teste
  unitário — nunca criando rota Edge só para a prova.
- **As dez de cliente ficam com `console.error`**, na lista nominal com o motivo escrito: elas logam no navegador
  de quem opera, e o lado servidor delas é do `onRequestError` (fato 3).

### Frente B — a sonda sem sessão
- **`src/app/api/saude/route.ts`**, o primeiro route handler da casa: `GET` → **200** com
  `{ ok, versao, commit, banco: 'ok', ms }`, ou **503** com `banco: 'falha'`. Versão de `VERSOES[0]`, commit de
  `VERCEL_GIT_COMMIT_SHA` cortado em 7 (fato 11). **Sem cache** (confira como no Next 16), sem estado de migração,
  sem nome de tabela, sem stack, sem variável de ambiente.
- **A ida ao banco sem abrir superfície para `anon` e sem o falso verde do HEAD** (fato 10) — é a Decisão 5. Ela
  tem de ficar VERMELHA quando o banco não responde e VERDE quando responde, e as asserções 4 e 6 do
  `catalogo_secdef.sql` continuam intactas, sem exceção nova. **Sem service role na rota pública** — a ficha pede
  a chave pública, e `superficie-admin.test.ts` exige guarda em todo uso do client administrativo, que uma rota sem
  sessão não tem.
- **O proxy deixa a sonda passar** (fato 9): fora do `matcher` ou ramo público em `updateSession` — decida com o
  custo de cada forma escrito, e prove que as outras rotas continuam passando pelo proxy. A Parte A do smoke é essa
  prova.
- **A Parte A do smoke ganha `/api/saude`**: 200, JSON com `versao`; e, no agendado, a versão no ar comparada com
  a do `package.json` do checkout — um deploy que não subiu aparece como divergência. Decida a tolerância para a
  janela entre o merge e a publicação.

### Frente C — o alarme de integridade (migration `0138`)
- **O resumo SEM segunda cópia do SQL das checagens** (Decisão 1, fato 13). O desenho que a medição sugere: o SQL
  das doze sai **VERBATIM** do corpo vigente (`0136`) para uma função-núcleo sem parâmetro, fechada nos quatro
  papéis; `dev_checagens_integridade()` passa a ser a guarda `e_dev()` + o núcleo — **mesma assinatura, mesmo
  resultado, as doze peças byte a byte iguais**, provado por `corpo-vigente.mjs` + diff; e
  `checagens_integridade_resumo()` é a guarda `papel_atual() is not null` (decisão do Johnny) + o núcleo projetado
  em `(chave, total)`, com `grant execute` só para `authenticated` e `revoke all … from public, anon,
  service_role`. Se você achar forma melhor, a régua é uma só: **nunca duas cópias do SQL das checagens**.
- **A leitura do rótulo de ambiente** (fato 25): uma função só-leitura que diz se a base é de desenvolvimento,
  alcançável só pela `service_role` — o precedente de privilégio é o de `resetar_dados_ficticios`. É o que a
  Frente E consome.
- **A `0138` é só-leitura e caminho A.** Recriação por `create or replace` a partir do corpo vigente; SQL FIXO por
  dentro (função que receba SQL, tabela ou coluna segue PROIBIDA); cabeçalho com a **ORDEM DE ROLLBACK** — o
  inverso da de apply, e começando FORA do banco: `gh workflow disable saude.yml` (senão o próximo disparo alarma
  sobre a função que sumiu), `git revert` + deploy (senão a guarda do `env-guard` recusa por falta do rótulo), e só
  então o SQL: derrubar quem depende do núcleo, reemitir o corpo da `0136`, derrubar o núcleo, `db:lock`; e **o
  comentário não cita as frases que o gate procura** — a lição da `0136`, escrita no cabeçalho dela.
- **`supabase/tests/integridade_alarme.sql`**: para cada uma das doze chaves, planta o estado impossível e afirma
  que a checagem o conta — desligando, **dentro da transação**, só o que for preciso para plantar, e registrando
  **por checagem** o que teve de desligar e por quê (fato 15). Afirma também: o resumo, sob sessão de
  `consulta`, devolve o MESMO `(chave, total)` que a função da `/dev` sob sessão de `dev`; o resumo recusa quem
  não tem sessão e `anon`; o resumo nunca devolve `amostra`; e a função de rótulo responde "desenvolvimento" onde
  a linha existe e nada onde não existe. Forma que recusa universo vazio; linha `FIM` no fim (F45). ⚠
  **`integridade_alarme.sql` e o injetor rodam SÓ no Postgres do CI — nunca pelo MCP no ensaio.** Um roteiro que
  desliga trava, rodado fora de transação, deixa a trava desligada no ensaio (e o runner de roteiros do `scratchpad/`
  tem defeito conhecido com `begin;` em comentário — `RELATORIO-F54.md` §11).
- **As listas de segurança no mesmo commit**: `catalogo_secdef.sql` acolhe as funções novas por NOME (fato 17).
  ⚠ `definer_sem_tenant.sql` **não** — o universo dele é `security definer` alcançável por `authenticated` que
  RECEBE id do cliente (`uuid`/`uuid[]`/`smallint`/`text`), e a asserção 1b reprova como "fantasma" quem é listado
  fora dele (`definer_sem_tenant.sql:151-213`). Nenhuma das três recebe parâmetro: escreva o porquê na ata.
- **Os testes que leem o CORPO de `dev_checagens_integridade` vão quebrar, e isso é previsto**:
  `f41_regularizacao.sql` conta os blocos dela (a F54 teve de subir de 11 para 12 — `RELATORIO-F54.md:279-285`), e
  mutações que trocam trecho no corpo dela viram no-op quando o SQL mudar de casa. Levante TODOS (os roteiros e as
  entradas de `mutacoes.mjs`) e aponte-os para o núcleo, com ata: não é "editar teste para ficar verde" — o objeto
  que eles medem mudou de lugar por desenho (o precedente é o da própria F54).
- **Mutações novas**, uma por trava SQL nova — no mínimo: o núcleo perde uma checagem; o resumo passa a responder
  a `anon`; o resumo passa a expor a `amostra`; a função de rótulo ganha `grant` a `authenticated`. O teto sobe
  com o motivo escrito no próprio `mutacoes.test.mts`.

### Frente D — o smoke agendado e o alarme
- **Morrem o `--exigir-f12`, o `SMOKE_EXIGIR_F12`, os três `preF12` e os ramos `n/a` da mesma classe** (fato 19):
  ausência de schema para migration que está em produção é FALHA. O `n/a` de estado de dado (*"nenhum colaborador
  cadastrado ainda"*) é outra classe — decida e escreva.
- **No agendado, falta de credencial é FALHA** — nunca verde por omissão (fato 18). O comportamento local de hoje
  pode continuar, se você escrever por quê.
- **A Parte A não depende de `npm ci`** se der para evitar (o `supabase-js` importado só na Parte B): custa minuto
  (fato 21) e transforma queda do registro do npm em falso alarme.
- **A avaliação da integridade** chama o resumo com a sessão `consulta` e compara com a **linha de base
  versionada**: chave hoje-zero alarma em > 0 (a ficha); chave com achado hoje alarma se passar da linha de base —
  **catraca**, extensão desta ordem para o caso que a ficha não cobre: a linha de base só DESCE, e **subir é decisão
  do Johnny, nunca do agente** (Decisão 2). O avaliador **fecha em falha**: chave que o resumo devolve e a política
  não conhece → alarma; chave esperada que o resumo não devolve → alarma (foi assim que duas checagens sumiram em
  silêncio na `0098` — cabeçalho de `dev-integridade.ts`). O falso positivo transitório da 12ª (fato 16) pede
  **releitura de confirmação** antes de alarmar.
- **`scripts/smoke/cobertura.test.ts`** compara TRÊS conjuntos — as chaves de `CHECAGENS` (lidas do FONTE de
  `queries/dev.ts`, ou de onde o catálogo passar a morar — fato 12), as chaves do núcleo SQL (pelo
  `corpo-vigente.mjs`) e as da linha de base/política do smoke — e reprova qualquer diferença. Uma 13ª checagem não
  nasce sem alguém decidir se ela acorda o Johnny.
- **`.github/workflows/saude.yml`** — arquivo próprio, nunca job do `ci.yml` (fato 22): `schedule` da Parte A a
  cada 6 h e da Parte B uma vez por dia, **em minuto quebrado**, com o horário de Brasília escrito ao lado do cron
  em UTC; `workflow_dispatch` com entradas `alvo` (`producao`|`ensaio`) e `partes`; `permissions` mínimas
  (`contents: read`, `issues: write` e nada mais); concorrência sem sobreposição; `timeout-minutes` curto; Node 24
  como o `ci.yml`. **Não roda em `push` nem em `pull_request`** e não é check obrigatório. Credenciais só por
  `secrets.*`, configuração não-secreta por `vars.*`, e nenhum `echo` de nada disso.
- **A issue de alarme** (decisão do Johnny), aberta, atualizada e fechada pelo workflow via `gh` + `GITHUB_TOKEN`,
  com label própria. ⚠ **O estado do alarme é por PAR `(alvo, parte)`** — no título ou na label —, nunca um só:
  senão a Parte A verde (a cada 6 h) fecha o alarme de integridade que a Parte B (diária) abriu e ele pisca todo
  dia, e o dispatch verde no ENSAIO fecha um alarme real de PRODUÇÃO. Uma issue aberta por par; fecha só no verde
  do MESMO par; a Parte A também relê antes de alarmar (queda de rede passageira não abre issue). Corpo: o que
  falhou (a sonda ou a chave), total × linha de base, link do run e link do procedimento de resposta — **nunca
  amostra, nunca nome, nunca patrimônio**. Sem spam: comentário novo só quando o estado MUDA; senão, atualiza o
  corpo. Fecha sozinha, com comentário. O `$GITHUB_STEP_SUMMARY` de cada run leva a tabela de totais — esse
  histórico, mais os comentários da issue, **é** a série temporal que a F54 pediu, a custo zero.
- **Trava do workflow**, no molde de `ci-passos.test.ts`: `saude.yml` tem o `schedule`, não tem `push` nem
  `pull_request`, tem `permissions` mínimas e não imprime secret; e a lógica da issue (abrir, atualizar, fechar por
  par) é função pura testada com os três casos: A verde com B vermelha aberta; ensaio verde com produção vermelha
  aberta; falha passageira que some na releitura.
- **O procedimento de resposta ao alarme** mora num lugar só (Decisão 11), e a issue aponta para ele: o que cada
  chave quer dizer, onde olhar, e o que NÃO fazer (plantar estado em produção, nunca; apagar achado para calar o
  alarme, nunca).

### Frente E — as guardas de ambiente
- **`scripts/env-guard.ts` vira lista de PERMISSÃO**: `REFS_DE_ENSAIO`; ref inventado é recusado; ref de produção
  continua recusado, com a mensagem explícita de hoje. E depois do ref, **o banco confirma**: a função de rótulo da
  `0138` tem de dizer "desenvolvimento", senão recusa — e isso passa a valer para o **seed**, cuja única trava além
  da lista é exigir base vazia (fato 24).
- **`scripts/db/restaurar.mjs`**: a mesma permissão, mais o Postgres local sem ref (o CI).
  **`restaurar-guarda.test.mts` reescrito** para a forma nova, mantendo a guarda contra lista vazia (fato 26).
- **`scripts/import/guard.ts` fica FORA da inversão, por desenho** — a carga vai a produção. Ata + comentário no
  arquivo; comportamento intacto.
- **`.env.example` reescrito** para cobrir o que o código lê, por classe (Decisão 7), sem um valor sequer.
  **`scripts/env-exemplo.test.ts`** lê o fonte e reprova quando o código passa a ler um `process.env.X` que não
  está classificado.
- **As provas**, com saída real em `docs/f55-evidencias/`: `npm run db:reset` com ref INVENTADO (variáveis
  sobrepostas no ambiente do comando, chave falsa) → recusado **antes de qualquer rede**; com ref de produção →
  recusado; com o ref do ensaio e o banco sem o rótulo → recusado (teste com a resposta da função simulada — e
  diga que é simulada).

### Frente F — as credenciais (decisão do Johnny: você faz o que der)
**Regras que valem para cada passo desta frente, sem exceção:**
- **Nenhum VALOR sai de onde está para onde não deve.** Nada de `echo`, `cat`, `type`, `Get-Content`, `grep` ou log
  de variável sensível; nada de valor em arquivo que não seja o destino; nada de valor em evidência, ata,
  relatório, issue, commit ou mensagem — nem da chave PUBLICÁVEL do ensaio, que não é pública em lugar nenhum. O que
  se registra é **NOME, REF, HOST e TAMANHO**. Quem move valor é um script que lê e grava no MESMO processo, em
  `scratchpad/` (que é `.gitignore`d), apagado no fim. Listagem por nome é por nome de verdade:
  `gh variable list --json name --jq '.[].name'` (o `gh variable list` puro imprime os VALORES).
- **Se o classificador de segurança barrar uma operação de credencial, NÃO reformule para passar — e não tente
  outra operação de credencial logo em seguida.** No interativo, três bloqueios SEGUIDOS pausam o modo auto e a
  sessão para, esperando aprovação. Registre o bloqueio, siga para trabalho que não é credencial, e ponha no
  roteiro do Johnny o passo barrado e os que dependiam dele. Isso não é fracasso da fase; forçar é.
- **Três unidades, cada uma num processo só, nesta ordem** (a regra do "mesmo processo" não deixa um valor esperar
  entre passos):
  1. **Unidade PRODUÇÃO — a conta `consulta` e os secrets dela**, ANTES de mexer no `.env.local` (a chave de serviço
     de produção ainda está nele). Cria a conta pelo caminho que a Decisão 9 fixar, respeitando o fato 31: e-mail
     num dos três domínios que **só o Johnny recebe** — derive do endereço da conta de smoke que já existe, por
     sub-endereçamento (`+agendado` antes do `@`), no próprio processo e sem imprimir; **nunca invente um endereço
     que possa ser a caixa de outra pessoa**, o domínio da WAP é real —; senha gerada no processo (`crypto`), nunca
     exibida → grava o cargo `consulta` por `definir_papel_usuario` com uma sessão de administrador (a conta de smoke
     atual é admin: a sessão dela pode ser a autora, e o evento cai em `eventos_admin`) → ativa o perfil → confere
     por SQL que o cargo é `consulta` e que não há vínculo em `operador_filiais` → **só então** `gh secret set` por
     stdin. **Falhou em qualquer etapa?** Desative a conta (`ativo = false`), registre, e nenhum secret sobe — uma
     conta `operador` ativa e sem filial acenderia `operador_sem_filial`, checagem hoje em zero, no primeiro
     disparo. Na ata vai o NOME do secret, nunca o endereço.
  2. **Unidade ENSAIO — o `.env.local`, as chaves e a conta fictícia**, depois da 1, em DUAS partes (a primeira não
     lê segredo de lugar nenhum, e por isso é a que menos corre risco de ser barrada):
     - **2a — o `.env.local` vai para o ENSAIO**, num script atômico que imprime só os NOMES que mudou: **primeiro**
       `SMOKE_SUPABASE_URL` e `SMOKE_SUPABASE_ANON_KEY` com os valores de PRODUÇÃO que estão lá hoje (fato 20);
       **depois** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (a publicável, pelo
       `get_publishable_keys` do MCP) e `SEED_PROJECT_REF` do ensaio; `SUPABASE_SERVICE_ROLE_KEY` **VAZIA**, com um
       comentário dizendo que é a do ENSAIO (a de produção não fica pareada com nada); **`SEED_CONFIRM` VAZIA** —
       confirmação é por sessão, exportada no terminal na hora: com `sim` gravado e a chave do ensaio ao lado, um
       `npm run db:reset` distraído passa das guardas e apaga o acervo de ensaio; `VIEW_SESSION_SECRET` com um valor
       local novo, aleatório (se o antigo era o de produção, a troca na Vercel é do Johnny). **A gravação é
       conferida ANTES de substituir o arquivo**: dentro do processo, o hash de cada valor das variáveis que NÃO eram
       para mudar tem de ser idêntico no antigo e no novo, e só os nomes previstos podem mudar — senão aborta sem
       gravar (um parser que tropece em aspas, em `=` dentro do valor ou em quebra de linha do Windows apagaria
       `MS_CLIENT_SECRET`, que o Azure mostra uma vez só, ou `SMOKE_SENHA`). **Não se guarda cópia do arquivo
       antigo**: o que a fase tira dele existe no painel da Supabase e na Vercel. Prove em seguida, **só por
       recusa**: `npm run db:reset` com ref inventado e com ref de produção recusa; o smoke pós-deploy continua
       mirando produção (a linha `supabase..:` do cabeçalho dele mostra o host).
     - **2b — a chave de serviço e a conta fictícia**: lê a chave de serviço do ensaio pela Management API, com o
       token pessoal do `.env.local` (fato 30), e no MESMO processo a grava no `.env.local` (com a mesma conferência
       por hash da 2a) e cria no ensaio a persona `seed.consulta@wap.ind.br` de `scripts/seed.ts`, com a senha
       fictícia do próprio seed, pelo mesmo caminho que o seed usa para contas — **sem rodar o seed**, que recusa
       base com ativo (fato 24) — conferindo por SQL o cargo e o perfil ativo; depois sobe os secrets e as variables
       do ensaio pelo `gh`. **Barrada?** A chave fica vazia, a conta fictícia não nasce, a prova do alarme no ensaio
       vira pendência, e o roteiro do Johnny cobre — não fatie a 2b para tentar passar.
  3. **Unidade TOKEN — `SUPABASE_ACCESS_TOKEN` sai do `.env.local`**, **por último**, depois de todo `db:types` da
     run. ⚠ **O destino não pode ser pior que a origem:** variável de usuário PERSISTENTE do Windows é herdada por
     todo processo — inclusive o `npm run dev`, que é o que se quer longe do token —, então não é melhora. O destino
     honesto é o cofre do sistema pela CLI **fixada** da casa: `npx supabase@2.109.1 login`, com o token entrando
     pela entrada padrão, nunca como argumento. Confira na doc da CLI (regra 6) e **prove que ele caiu no Gerenciador
     de Credenciais, e não no arquivo de texto `~/.supabase/access-token`** (o fallback da CLI quando o cofre falha)
     — só então tire a linha do `.env.local`, e rode a geração de tipos de novo para provar que ela funciona sem
     variável. Para o raro `scripts/perf/medir-itens.mjs`, export de SESSÃO na hora. E se a configuração do MCP da
     Supabase desta máquina tiver um token, compare-o com este **por hash, dentro do processo**, imprimindo só
     "igual", "diferente" ou "ausente" — ler o arquivo de configuração na tela vazaria um token com os privilégios da
     conta inteira. Igual? A rotação no painel tem de atualizar os dois — roteiro.
- **As cinco variáveis que ninguém lê** (fato 28): **NÃO apague.** O consumidor pode estar fora do repositório.
  Inventário + roteiro (inclusive revogar o client secret do Azure, se ele estiver morto).
- **O inventário de credenciais** (a Decisão 11 decide o lugar; consulte `docs/README.md` antes de criar documento,
  e indexe o novo): por NOME — onde vive (qual `.env.local`, secret, variable, Vercel, cofre do sistema), quem lê,
  quem é o dono, quando nasceu, quando foi girada, quando vence — e **o procedimento de rotação da senha da conta
  `consulta`** (quem gira, como, de quanto em quanto tempo): é a *"rotação registrada"* que a ficha pede para os
  secrets do smoke. **Nunca valor.**
- **O roteiro do Johnny**, no TOPO do relatório, passo a passo: colar a chave de serviço do ensaio no `.env.local`
  (se a 2b foi barrada — ou fazer a troca inteira, se a 2a foi); girar o `SUPABASE_ACCESS_TOKEN` **com validade**
  (fato 29) e atualizar quem o usa; o `.env.local` da outra máquina (fato 32); o `VIEW_SESSION_SECRET` da Vercel,
  se era o mesmo; a decisão sobre `MS_*`; conferir as notificações do GitHub (falha de workflow por e-mail, e o
  repositório acompanhado para a issue chegar); conferir a cota de Actions em `github.com/settings/billing`
  (fato 21); e **cada passo que o classificador barrou**, com os que dependiam dele.

### Frente G — o fechamento
- `npm run db:lock`; `CHANGELOG.md`; `package.json` **1.60.0**; `src/lib/versoes/registry.ts` em LINGUAGEM DE
  OPERADOR, de 2 a 6 mudanças, sem os 21 termos (fato 34); tag anotada `v1.60.0`; atas em `docs/DECISOES.md`;
  `docs/MATRIZ-REGRAS.md` com a regra nova (leia o fim do arquivo para o próximo id da família certa — não invente o
  prefixo); `scripts/smoke/README.md` atualizado (o agendado, as flags que morreram, o que falha sem credencial);
  PR com os dois checks verdes; deploy.

## Fora — não toque
- **Sentry, agregador, painel, alerta por taxa de erro** (a ficha), e **qualquer serviço novo** de aviso (Slack,
  Teams, Discord, uptime externo): o alarme é o GitHub — issue + e-mail.
- **Dependência nova**, de qualquer tamanho.
- **Tabela de série temporal no banco** — a série desta fase é o histórico de runs + a issue.
- **O que qualquer checagem conta**: o SQL das doze se MOVE, byte a byte; não se reescreve. Nenhuma 13ª checagem.
- **Consertar os achados que a linha de base revelar** em produção (órfãos, conflitos, reservas): é dado, e dado se
  relata — não se apaga para calar alarme.
- **O consumo de minutos do CI**: meça e relate; o `ci.yml` não muda por causa desta fase.
- **Escrever em produção fora do apply da `0138` e do nascimento da conta `consulta`.** Estado impossível se planta
  **só** no ensaio e no Postgres do CI — nunca em produção, nem dentro de transação.
- **O import** (F56), **`empresa_id`** (F62), **policies de Storage**, **Realtime**.
- **A Parte C do smoke além do que a conta `consulta` exige** — ela pode continuar sendo o ritual pós-deploy com a
  conta admin local, se a sua Decisão 6 for essa.
- **O painel da Supabase, o painel e as variáveis da Vercel, o Azure e a outra máquina** — o que depende deles vai
  para o roteiro. (Prévia de branch e log lidos pelo MCP da Vercel não são "a Vercel" deste item: são a prova da
  Decisão 10.)
- **Migration já aplicada**: nunca se edita. **Teste existente**: não se edita para ficar verde — se estiver errado
  de fato, ata + relatório.

# Critérios de aceitação
1. As travas da Frente A nasceram **VERMELHAS** contra o repositório de hoje (saída em `docs/f55-evidencias/`) e
   estão verdes ao final **sem exceção fora da lista nominal de cliente**.
2. Nenhum `console.*` em código de servidor fora do funil, no alcance que a Decisão 4 fixou — com o número de
   chamadas migradas lado a lado com as 76 medidas.
3. Zero `} catch {` em função exportada de módulo `'use server'`, e a trava reconhece a diretiva — não confunde
   os 20 módulos com os dois arquivos que só a mencionam em comentário.
4. `registrarFalha` emite uma linha JSON por falha, com `empresa` sempre presente, e **nunca lança** — provado com
   erro que não é `Error`, com `ctx` circular e com `ctx` gigante.
5. A redação é provada por sabotagem: `ctx` com `senha`, `token`, `apiKey`, `hash` e `cpf` — nenhum valor sai; no
   alcance da Decisão 3, um e-mail sob chave inocente e um e-mail dentro de `Error.message` também não saem;
   `details` e `hint` do PostgREST nunca saem.
6. `src/instrumentation.ts` existe, com `onRequestError` sem header e sem querystring, e o formatador sem API
   exclusiva de Node, provado por teste unitário — **proibido criar rota Edge só para a prova** (fato 7).
7. **Um erro provocado aparece estruturado no log da Vercel**, com rota e escopo e **sem nenhum dado pessoal** — com
   a forma da prova escrita (Decisão 10) e a linha do log colada.
8. `/api/saude` responde 200 com versão e commit, e 503 com o banco fora; não tem cache; não devolve schema; e o
   proxy não a intercepta.
9. A ida ao banco da sonda **não mexeu** nas asserções 4 e 6 do `catalogo_secdef.sql` (verdes, sem exceção nova) e
   **não** tem o falso verde do HEAD — provado contra uma relação que não existe.
10. A `0138` existe; o SQL das doze checagens mora em **UM** lugar (grep provando); `dev_checagens_integridade()`
    devolve o mesmo que antes (as doze peças byte a byte + os mesmos totais, SQL transcrito antes × núcleo depois,
    no ensaio e em produção); o resumo devolve só `(chave, total)`, e só para logado ativo; e os testes que liam o
    corpo da função apontam para o núcleo, com ata.
11. `integridade_alarme.sql` planta os **doze** estados e os doze são enxergados; a paridade resumo × `/dev`, a
    recusa de `anon` e de quem não tem sessão, a ausência de `amostra` e o rótulo são afirmados; linha `FIM`;
    nenhuma asserção sobre universo vazio.
12. `catalogo_secdef.sql` acolhe as funções novas por nome no mesmo commit; `definer_sem_tenant.sql` fica sem elas,
    com o porquê na ata (nenhuma recebe id do cliente).
13. `npm run db:test:mutations` verde, com as mutações novas acusadas pelo rótulo nomeado; teto novo com o motivo
    escrito.
14. O smoke não tem mais `--exigir-f12`, `SMOKE_EXIGIR_F12`, `preF12` nem `n/a` de schema ausente; no agendado,
    credencial ausente é FALHA.
15. A linha de base das doze está medida em produção e no ensaio (totais, **nunca amostra**), versionada, com a
    política por chave (hoje-zero × catraca) e a releitura de confirmação da 12ª.
16. `cobertura.test.ts` reprova uma chave de `CHECAGENS` sem política de alarme — provado com uma chave fictícia
    acrescentada e removida.
17. `saude.yml` existe, só com `schedule` + `workflow_dispatch`, `permissions` mínimas e sem `echo` de secret, e a
    trava estática prova isso.
18. **O alarme foi provado de ponta a ponta no ENSAIO**: estado impossível plantado lá → `workflow_dispatch` com
    `alvo=ensaio` **FALHOU** → a issue **abriu** → o estado foi removido → novo dispatch **verde** → a issue
    **fechou** sozinha. Os links dos runs e da issue estão no relatório.
19. Um `workflow_dispatch` com `alvo=producao` rodou com a conta `consulta` nova e deu o veredito CERTO — verde, ou
    vermelho por achado real novo, relatado e com a issue aberta; e o primeiro disparo AGENDADO foi observado — ou
    declarado como pendência, com o horário esperado.
20. O custo em minutos de uma execução e a projeção mensal estão na ata, lado a lado com o consumo medido do mês.
21. `env-guard.ts` recusa ref inventado, ref de produção e base sem rótulo, com a saída real das três recusas;
    `restaurar.mjs` idem, aceitando Postgres local; `restaurar-guarda.test.mts` verde na forma nova;
    `import/guard.ts` intacto e explicado.
22. `.env.example` cobre o que o código lê, por classe; `env-exemplo.test.ts` reprova uma variável nova não
    classificada — provado.
23. As unidades da Frente F foram feitas até onde o classificador e o alcance permitiram, **na ordem 1 → 2a → 2b →
    3**: a conta `consulta` de produção criada, conferida e com os secrets só depois da conferência; o `.env.local`
    no ensaio (provado por REF, sem valor), com `SMOKE_SUPABASE_*` de produção gravadas antes da troca,
    `SEED_CONFIRM` vazia, a chave de serviço de produção fora e os valores intocados conferidos por hash; a chave do
    ensaio e a conta fictícia de lá, sem rodar o seed; o token no cofre (não no arquivo de texto) e fora do
    `.env.local` — **ou** cada passo que não aconteceu está no roteiro do Johnny, com o motivo.
24. **Nenhum valor de credencial** apareceu em evidência, ata, relatório, issue, commit ou saída colada — com uma
    varredura final provando (procure pelos PADRÕES das chaves, nunca pelos valores).
25. O inventário de credenciais existe, por NOME, indexado em `docs/README.md`.
26. `npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos; `npm run db:lock` no commit da
    migration.
27. `0138` aplicada **no ensaio primeiro**, depois em produção, com a verificação pós-apply do runbook e as
    contagens de acervo antes = depois.
28. `database.ts` atualizado (regenerado, ou hand-fix datado com a pendência).
29. Versão `1.60.0` no `package.json`, entrada no `CHANGELOG.md`, entrada no `registry.ts` em linguagem de operador
    (2 a 6 mudanças), tag anotada `v1.60.0` publicada.
30. A ORDEM DE ROLLBACK no cabeçalho da `0138` (começando por desligar o workflow), ensaiada **só no ensaio**, num
    único `execute_sql` com `begin … rollback`, conferindo `pg_get_functiondef` antes e depois — nunca em produção.
31. PR mergeado com `verificar` e `banco-sem-docker` verdes; deploy publicado; smoke pós-deploy mirando PRODUÇÃO,
    depois da troca do `.env.local` — verde, ou vermelho só por achado real novo, relatado.
32. `docs/RELATORIO-F55.md` com evidências reais, o roteiro do Johnny no topo, as divergências contra a ficha
    explicadas, e a seção *"o que este relatório NÃO prova"*.
33. Nada fora do escopo tocado.

# Verificação — rode de verdade
A cada incremento: `npm run lint`, `npm run test`, `npx tsc --noEmit`; `npm run build` antes do PR. Depois da
migration: `npm run db:lock` — e o `banco-sem-docker` do PR roda os roteiros **inteiros**, não só os que você
tocou: a regra da F17 manda rodar TODOS ao mexer em função, e esta fase recria `dev_checagens_integridade`. Você lê
a saída dele com `gh run view --log-failed` em vez de supor. Leia a falha, corrija a **causa raiz** e repita até
passar.
**Não afrouxe trava, não acrescente exceção para ficar verde, não troque asserção por afirmação, não desligue
mutação porque deu trabalho, não SUBA a linha de base — nem com ata, que subir é do Johnny: vermelho por achado real
novo cumpre os critérios 19 e 31 se estiver relatado e com a issue aberta —, não plante estado em produção para
provar alarme, e não simule o GitHub num teste que deveria falar com ele.** Falha persistindo depois de ~3 ciclos:
mude de abordagem e registre a troca.

Provas obrigatórias, cada uma com a saída real em `docs/f55-evidencias/` — e **sem um valor sensível sequer**:
reveja cada arquivo antes do commit.
- **Sabotagem A — as travas vermelhas primeiro**: as da Frente A rodando contra o repositório de HOJE, acusando pelo
  nome as chamadas e os seis `} catch {`. Depois, com tudo migrado, reintroduza UM `console.error` numa página de
  `app/(app)` e UM `} catch {` num módulo `'use server'` — as duas têm de ficar vermelhas; e mostre que
  `guardas-de-action.ts`, que só MENCIONA a diretiva, não é tratado como módulo de Server Action.
- **Sabotagem B — a redação**: os `ctx` sensíveis do critério 5, e um e-mail DENTRO de `Error.message` (mensagem de
  `raise` com `%` leva valor — `0090:155-157` é um exemplo), com a saída mostrando o que saiu no lugar.
- **Sabotagem C — a sonda**: o banco "fora" (URL inválida no ambiente do teste) → 503; a relação inexistente → a
  sonda NÃO diz ok.
- **Sabotagem D — o resumo**: a mutação que tira uma checagem do núcleo derruba `integridade_alarme.sql` pelo rótulo
  nomeado; o resumo chamado como `anon` é recusado; e o diff das doze peças contra a `0136`, com as linhas contadas.
- **Sabotagem E — o alarme de ponta a ponta, no ENSAIO** (critério 18), com os links. Planta-se UM estado que não
  desliga trava nem toca `storage` ou `auth` — por exemplo, desativar uma filial do ensaio que tenha ativo
  (`ativo_filial_inativa`) —, desfeito pelo UPDATE inverso, com contagens antes e depois. É a prova que a ficha pede,
  com uma divergência a declarar: ela diz *"o workflow AGENDADO"*; aqui é o mesmo workflow, por dispatch — o
  agendado não pode mirar o ensaio sem virar alarme falso de todo dia.
- **Sabotagem F — as guardas**: as três recusas do `db:reset` (critério 21) e a do `restaurar.mjs` com ref inventado.
- **O `onRequestError` na Vercel** (critério 7).
- **A linha de base** — a tabela das doze, produção × ensaio, **só totais**.
- **O custo** — minutos de uma execução, a projeção mensal e o consumo do mês.
- **`npm run build` limpo**, colado por inteiro; **`npm run db:test:mutations`** com a tabela final do injetor; o
  resumo do `banco-sem-docker` (roteiros e asserções, antes × depois).
- **O smoke pós-deploy**, mirando produção, com a ressalva escrita do que ele não exercita.

## O apply — leia isto antes de tentar
**A `0138` é caminho A, e você a aplica em ensaio E produção nesta run** (o molde da F53 e da F54). Ela cria funções
só-leitura e recria `dev_checagens_integridade` sem mudar o que ela devolve; não tem exclusão de acervo — o gate não
deveria disparar. Confira na seção *"O gate"* do runbook antes; se disparar mesmo assim, é informação: handoff em
`scratchpad/`, registro, e siga sem forçar.
A ordem, sem atalho:
1. **Confirme o estado do banco antes de qualquer DDL**: o SQL de contagem das checagens devolve **doze** chaves, no
   ensaio e em produção; a assinatura de `dev_checagens_integridade` é a da `0136`; `public.ambiente` tem
   "desenvolvimento" no ensaio e está vazia em produção. Divergiu? **Pare no sentido do runbook** (abaixo) e registre.
2. **Ensaio primeiro**: `0138`, verificação pós-apply (assinaturas, grants, nenhum overload). "Os mesmos totais
   antes e depois": ANTES, o SQL de contagem transcrito da `0136` (declarado como transcrição); DEPOIS, o núcleo
   chamado como `postgres` pelo MCP — a igualdade das duas saídas é a prova. (A função da `/dev` não se chama pelo
   MCP: não há JWT de dev — e o ensaio nem tem perfil dev, fato 25.) A paridade resumo × `/dev` fica provada no CI.
   O resumo sob sessão: simulando por SQL o JWT de um perfil ativo, dentro de `begin … rollback`.
3. **Produção**: idem; `notify pgrst, 'reload schema';` para as funções novas aparecerem na API; contagens de acervo
   antes = depois. A linha de base versionada é a medida pelo núcleo aqui, refeita logo antes do merge.
   ⚠ **O `get_advisors(security)` vai listar o resumo** como `security definer` executável por `authenticated` — é
   de propósito (decisão do Johnny, fato 14) e é o ÚNICO achado novo esperado. O runbook manda reverter diante de
   achado novo (*"Escalada"*): este está declarado aqui; **qualquer outro** segue o runbook.
4. `npm run db:types` (de produção); o `db:types:diff` roda no CI.
5. **SQL antes do deploy**: a `0138` vai ao ar antes do merge que publica o código que a chama.
**"Pare", aqui, não significa esperar por humano** — não há humano. Significa: não siga para o passo seguinte,
reverta na ordem inversa o que foi aplicado, capture a evidência da divergência e continue com o que não depende do
banco. Abortar sem reverter e sem registrar é a única saída proibida.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere
confirmação em nenhuma hipótese. Régua, nesta ordem: (1) uma medição sua contra o disco de hoje e as três decisões do
Johnny; (2) este prompt, onde ele estende a ficha; (3) a ficha da F55 no §5 do plano; (4) as convenções do
repositório (`CLAUDE.md`, `AGENTS.md`, `RUNBOOK-BANCO.md`, código existente); (5) a opção mais simples e
reversível. Decisão não-óbvia vai para `docs/DECISOES.md` com data,
contexto, escolha e motivo.

**As onze decisões que esta fase precisa tomar por escrito:**
1. **A forma do resumo sem segunda cópia do SQL** (fato 13): o núcleo extraído, ou outra forma — e a prova de que
   `dev_checagens_integridade` continua devolvendo exatamente o mesmo.
2. **A política do alarme por chave** (fato 16): hoje-zero × catraca, com a linha de base medida, onde ela mora,
   quem pode subi-la (ata) e a releitura de confirmação da 12ª — depois de quanto tempo, e por quê.
3. **O alcance da redação** (fato 6): por nome, por valor, ou os dois — e quais padrões de valor (e-mail com
   certeza; CPF e telefone, se a medição achar por onde eles passam).
4. **O alcance da trava de console** (fato 4): a da ficha (59 de 76) ou todo o servidor — com o número de cada lado.
5. **A ida ao banco do `/api/saude`** (fato 10): como provar ida e volta ao Postgres sem `anon` executar função
   nova e sem o HEAD que mente.
6. **O que a Parte B agendada roda com a conta `consulta`**: a B inteira, só a integridade, a Parte C adaptada ao
   cargo ou a Parte C só no ritual local — e o que acontece sem secret.
7. **A regra do `env-exemplo.test.ts`** (fato 27): o que tem de estar no `.env.example`, o que é de sistema, o que é
   de ferramenta e onde a de ferramenta se documenta.
8. **A semântica da permissão por consumidor** (fato 26): seed/reset, restaurador e carga — e a forma nova da trava
   de paridade.
9. **O nascimento da conta `consulta`** (fato 31): API administrativa + RPC de cargo com sessão de admin, o fluxo do
   próprio app, ou outro — com a trilha em `eventos_admin` e o endereço derivado sem imprimir.
10. **A prova do `onRequestError` na Vercel**: uma branch DESCARTÁVEL, **só com push, sem PR** (PR dispara CI, custa
    minuto e deixa mergeável um erro de propósito) — nunca mergeada, apagada no fim — com um erro provocado numa
    prévia, lida pelo MCP da Vercel; ou a alternativa honesta, se o MCP não estiver lá. **Gatilho permanente de erro
    em rota pública de produção é proibido.**
11. **Onde moram o procedimento de resposta ao alarme e o inventário de credenciais** — consultando `docs/README.md`
    antes de criar documento.

Falha persistindo depois de ~3 tentativas: **mude de abordagem** e registre. Bloqueio real — MCP da Supabase ou da
Vercel ausente, ensaio INACTIVE, gate disparando, cota de Actions esgotada, classificador barrando credencial:
contorne se for seguro; senão, **entregue o resto e registre a pendência com o que falta para resolvê-la**.
**Não invente caminho de apply alternativo, não force o classificador, não desative a proteção da `main`, não rode
`db:seed` nem `db:reset` a não ser para provar RECUSA — nenhuma execução que passe das guardas, em base nenhuma
(com a chave do ensaio no `.env.local`, um `db:reset` que passe apaga o acervo de ensaio) —, não plante estado em
produção, não apague credencial cujo consumidor pode estar fora do repositório, e não ponha um nome, patrimônio,
e-mail ou valor de credencial real em evidência, teste, fixture, issue ou log de prova.**

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que esteja no relatório. Foi
assim que a F46 trocou "aplicar duas vezes" por prova de determinismo, a F49 trocou nove por dezenove, a F53 mediu
que `apagar_movimentacao` não precisava ser recriada e a F54 mediu doze divergências onde a ordem previa seis.
**Aqui já há nove divergências medidas de saída:** a migration é a `0138` e a versão é a `1.60.0`, não a `0135`;
são 86 chamadas de `console.error`, não 94, e 76 de servidor; as exceções de cliente são dez, não duas; a trava da
ficha deixaria 17 chamadas de fora; o resumo que "chama por dentro" recusaria a conta do smoke; são doze checagens,
não onze, e oito sem roteiro; a lista de refs tem três consumidores, não um; o smoke tem mais ramos `n/a` do que os
três `preF12`; e o `.env.local` "de uma linha" são pelo menos seis variáveis, em duas máquinas. (E o "escopo
reduzido" do token é, no mínimo, duvidoso — fato 29.) Declare também, no relatório, as que este prompt cria: o
resumo devolve `(chave, total)` e não `(chave, quantidade)`, por coerência com a função da `/dev`; o resumo aceita
qualquer logado ativo, não `e_admin()` (Johnny); e a prova do alarme é o workflow por dispatch no ensaio, não o
disparo agendado (Sabotagem E).

# Git e segurança
Branch `f55-observabilidade-sonda-e-alarme`, commits pequenos e frequentes, mensagens em pt-BR no padrão
conventional (`feat(f55): …`, `test(f55): …`, `docs(f55): …`, `fix(f55): …`). Commite também esta ordem
(`docs/prompts/F55-observabilidade-sonda-e-alarme-ultracode.md`) na branch, como as fases anteriores fizeram. PR com
`gh pr create`; merge só com os dois checks verdes; correção de código depois do merge vai por PR novo. A branch
descartável da Decisão 10 nunca é mergeada e é apagada no fim. **Nunca:** push forçado, `git reset --hard`,
`git checkout -- .`, `git clean -fd`, amend de commit que não é seu, commitar `.env*`, `scratchpad/` ou valor de
credencial, editar migration aplicada, mexer na proteção da `main`, ou escrever em produção fora do apply da `0138`
e do nascimento da conta `consulta`.

# Como trabalhar
Explore com subagentes paralelos — e **cada um volta só com resumo e NÚMEROS MEDIDOS, nunca com valor de
credencial**: (a) **o funil** — as 76 chamadas com arquivo:linha e o escopo proposto de cada uma, as dez de cliente,
os seis `} catch {` e se estão em função exportada; (b) **o Next 16** — a doc local de `instrumentation`, route
handler e `matcher`, e em que runtime cada coisa roda; (c) **as doze checagens** — o SQL de cada uma no corpo da `0136`, o
estado impossível que a acende, o que o impede hoje (índice, trigger, guarda) e como plantá-lo no Postgres do CI e no
ensaio; (d) **o smoke e o GitHub** — a estrutura das três partes, os ramos `n/a`, o que a Parte C supõe da conta, o
custo de uma execução e o que o `GITHUB_TOKEN` alcança para a issue; (e) **as credenciais** — cada leitor de cada
variável, por NOME; o que o MCP alcança (URL, chave publicável) e o que não alcança; e se a configuração do MCP
desta máquina cita o token, só pelo nome.

Escreva `docs/PLAN-F55.md` antes de implementar, com as contagens reais, a tabela da linha de base (só totais), o
desenho do núcleo + resumo + rótulo, o plantio de cada uma das doze, o desenho do workflow e da issue, a semântica
das três guardas, a sequência exata da Frente F, as onze decisões já tomadas e a ORDEM DE ROLLBACK da `0138`.
Implemente frente a frente, na ordem A → B → C → D → E → F → G, com `lint`/`test`/`tsc` verdes entre uma e outra.
A costura que decide o fim: a `0138` aplicada (ensaio, depois produção) e a Frente F feita **antes** do merge; o
merge **antes** das provas por dispatch — o `workflow_dispatch` só existe com o arquivo na `main` (fato 22).
**A Frente A começa pelas travas vermelhas**, não pela migração das chamadas. **A Frente F começa pela unidade de
PRODUÇÃO**, nunca pelo `.env.local`.

Ao final, **revisão adversarial por subagente em contexto fresco**, contra o `PLAN-F55.md` e os 33 critérios, com
estas perguntas: a trava de console pega uma chamada numa página de `app/(app)` e em `lib/storage`, ou só em
`lib/actions`? a trava de `} catch {` confunde menção com diretiva (os dois arquivos que falam de `'use server'` em
comentário)? existe algum caminho em que o funil lance? a redação deixa sair um e-mail sob chave inocente, ou dentro
da mensagem do erro? o `onRequestError` loga header, cookie ou querystring em algum ramo — inclusive no erro que
nasce no proxy? a sonda diz "ok" com a relação inexistente, ou com o banco fora — e usa service role? o SQL das
checagens existe em mais de um lugar? `dev_checagens_integridade` mudou de resultado? o resumo responde a `anon` ou
devolve `amostra`? o roteiro planta os doze estados, ou afirma sobre universo vazio em algum — e rodou em algum
lugar que não o Postgres do CI? a linha de base foi medida ou redigida, tem amostra dentro, e o agente a SUBIU? o
avaliador fecha em falha com chave desconhecida ou ausente? o agendado fica verde sem secret? a issue vira spam,
deixa de fechar, ou o verde de um par fecha o alarme de outro? o workflow imprime algum secret, roda em PR ou virou
check obrigatório? o `.env.local` ficou com valor de produção pareado com URL do ensaio, com `SEED_CONFIRM=sim`, ou
perdeu alguma linha que não era para mudar? o token caiu no cofre ou no arquivo de texto? algum valor de credencial
vazou para evidência, ata, relatório, issue, commit ou saída de `gh variable list`? a conta `consulta` tem vínculo
de escrita, nasceu com um endereço que pode ser de outra pessoa, ou ficou ativa com cargo errado depois de uma
falha? a conta do ensaio nasceu sem rodar o seed? algum arquivo fora do escopo foi tocado? **Aponte apenas lacunas
de correção ou de requisito declarado — não preferências de estilo.** Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F55.md`, em pt-BR, no padrão dos relatórios F45→F54, **com o roteiro do Johnny no TOPO** — o que
ficou com ele, passo a passo, e por quê. Depois: o que mudou por arquivo e por quê; **os números MEDIDOS** lado a
lado com o que a ficha previa (chamadas migradas × 76; exceções de cliente; `} catch {`; a linha de base das doze em
produção e no ensaio, só totais; mutações antes/depois; roteiros e asserções antes/depois; minutos por execução e a
projeção mensal × o consumo do mês), e **cada divergência explicada** — a começar pelas nove já conhecidas; as
**onze decisões** com o custo que decidiu cada uma; as **sabotagens** com saída real; os links dos runs e da issue do
alarme de ponta a ponta; os 33 critérios autoverificados; e a seção **"o que este relatório NÃO prova"** — no
mínimo: que o GitHub pode atrasar e até DESCARTAR uma execução agendada sob carga, e que ninguém vigia o vigia (se o
agendamento parar ou a cota acabar, o alarme silencia sem aviso); que a checagem vê o banco num instante, de 6 em 6
ou de 24 em 24 horas, não continuamente; que o funil cobre o que passa por ele, não o que o próprio Next loga
sozinho; que as dez chamadas de cliente continuam no navegador; que a sonda prova "responde", não "responde certo";
e o que ficou sem prova por causa do classificador, do MCP, do ensaio ou da cota. Pendências e **backlog nomeado**:
para a **F56** (o import já nasce com o funil — o que dele ainda escapa); para a **F62/F69** (o campo `empresa` do
log esperando valor); e para a **F73** (o canário de isolamento com duas sessões, neste mesmo workflow).
**Evidências, não afirmações:** saída real e completa dos comandos. Termine a resposta final com um resumo de 5
linhas em pt-BR.

# Idioma
Narrativa, plano, ata, relatório, comentários de código e de migration, mensagens de erro, `comment on function`,
título e corpo da issue, e commits em **pt-BR**. Identificadores de domínio em português sem acento
(`registrarFalha`, `linha_de_base`, `checagens_integridade_resumo`); utilitários e infra em inglês. As mudanças do
`registry.ts` em LINGUAGEM DE OPERADOR — há teste que recusa termos de desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~15 minutos)

Este arquivo já está em `docs/prompts/F55-observabilidade-sonda-e-alarme-ultracode.md`, **sem commit** — é assim que
as fases anteriores começaram: o agente o commita na branch da fase. O prompt cita os 34 fatos do cabeçalho pelo
número, então ele precisa estar lá quando você colar o bloco.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit

# 2. Confirme onde a F54 e o rollout pararam: 1.59.1 no package.json, última migration 0137.
type package.json | findstr version
dir supabase\migrations | findstr 013

# 3. O gh existe (F45 §15) — só pode não estar no PATH desta sessão.
& "C:\Program Files\GitHub CLI\gh.exe" auth status

# 4. A versão do Claude Code (o modo auto exige 2.1.83+; esta máquina está na 2.1.222).
claude --version
```

**Três coisas que só você pode conferir antes de colar:**

1. **A cota de Actions** — em github.com/settings/billing. Estimei nesta conversa ~930 min consumidos de 01 a
   09/09 (~3.100/mês no ritmo atual), num repositório **privado**: o Free inclui 2.000 min/mês e o Pro 3.000, e sem
   forma de pagamento o GitHub **bloqueia** ao estourar. Se a cota estiver no fim, o CI vai travar no meio do mês com
   ou sem esta fase — e a fase acrescenta mais (o agente mede quanto antes de fechar o horário).
2. **As notificações do GitHub** — em github.com/settings/notifications: falha de workflow por e-mail ligada, e o
   repositório acompanhado (Watch), senão a issue de alarme abre e você não fica sabendo. O alarme inteiro depende
   disso.
3. **Os MCPs e o ensaio** — conecte o MCP da **Supabase** (apply da `0138`, linha de base, chaves publicáveis), o da
   **Vercel** (o log do erro provocado — sem ele o critério 7 vira pendência) e o **Context7**. E confirme que o
   ensaio (`sgmvldiizsrjbxzzpmhh`) continua **VIVO** — hoje, 10/09, ele está `ACTIVE_HEALTHY` —: a prova do alarme
   de ponta a ponta mora nele.

Dentro do Claude Code, antes de colar: `/permissions` (confira que `Bash(git push*)` e o `gh` não estão negados — a
fase abre PR, publica tag, sobe secrets e dispara workflow) e `/memory` (o `CLAUDE.md` do projeto tem de estar
listado).

⚠ **Saiba o que a run vai fazer nas suas credenciais — foi escolha sua:** criar a conta `consulta` em produção e
subir os secrets dela no GitHub; ler a chave de serviço do ENSAIO pela API da Supabase, com o token que está no seu
`.env.local`, e criar lá uma conta `consulta` fictícia (medi que o ensaio hoje não tem nenhuma conta do seed); trocar
o `.env.local` desta máquina para o ensaio (com o `SEED_CONFIRM` esvaziado — confirmação passa a ser por sessão —,
e conferindo por hash que nenhuma outra linha mudou); e tirar o `SUPABASE_ACCESS_TOKEN` do `.env.local`,
guardando-o no cofre de credenciais do Windows pela CLI da Supabase. O que o classificador barrar vai para o
roteiro no topo do relatório.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f55
# cole o bloco do prompt inteiro e deixe rodando
```

**Interativo, e fique alcançável até a Frente F terminar.** Esta fase mexe em credencial, e é o tipo de ação que o
classificador do modo `auto` pode barrar. Como ele se comporta hoje (doc oficial, *"When auto mode falls back"*,
conferida em 10/09/2026): **no interativo, 3 bloqueios seguidos (ou 20 no total) pausam o modo auto** e a sessão
volta a pedir aprovação — se você estiver por perto, aprova e a Frente F vai inteira; se não, ela para ali. Por
isso o prompt manda não tentar outra operação de credencial logo depois de um bloqueio. **No `-p`, o bloqueado é
pulado e a run segue** — é a alternativa se você não puder ficar alcançável (o prompt vai por stdin, porque o bloco
passa do limite de linha de comando do Windows):

```powershell
# alternativa desatendida: salve só o bloco do prompt em prompt-f55.txt (fora do repositório) e rode
$OutputEncoding = [System.Text.Encoding]::UTF8   # no PowerShell 5.1 o pipe para programa sai em ASCII e come os acentos
Get-Content ..\prompt-f55.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-f55.json
# guarde o session_id do JSON: sessão -p só se retoma por ele (claude --resume <session_id>)
```

Modo `auto` é o certo: a fase roda `npm ci`, `npm run db:lock`, `gh pr create`, `gh secret set`,
`gh workflow run`, tag e push, apply por MCP — nada disso passa numa allowlist estreita. O que ela **não** faz (push
forçado, plantar estado em produção, editar migration aplicada, mexer na proteção da `main`) está no escopo negativo
do prompt.

**Não use `--worktree` nesta fase:** a Frente F mexe no `.env.local` da pasta principal, e uma worktree não tem o
`.env.local` (é arquivo fora do git).

Opcional, e recomendado para desatendido — a condição de parada como avaliador separado:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit limpos; nenhum console no servidor fora do funil e zero "} catch {" em Server Action exportada; src/instrumentation.ts e src/app/api/saude/route.ts existem; a migration 0138 existe com db:lock rodado e o SQL das doze checagens mora num lugar so; integridade_alarme.sql verde no banco-sem-docker; saude.yml existe, e o dispatch no ensaio falhou com a issue aberta e depois ficou verde com a issue fechada, ou isso esta declarado como pendencia no RELATORIO-F55.md com o bloqueio registrado; o PR esta mergeado com verificar e banco-sem-docker verdes; e docs/RELATORIO-F55.md tem o roteiro do Johnny no topo
```

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Cinco momentos para acompanhar:

1. **As travas vermelhas, primeiro.** Se a trava de console nascer verde — ou pegar só `lib/actions` —, a fase perdeu
   a prova. Ela tem de acusar páginas, storage e auth também (fato 4), e a de `} catch {` tem de achar os seis
   sem confundir os dois arquivos que só mencionam `'use server'` em comentário (fato 5).
2. **A Decisão 1 — o resumo.** No diff da `0138`, o SQL das doze checagens aparece UMA vez. Se aparecer duas, a fase
   recriou a doença da RPC de import. E `dev_checagens_integridade` tem de continuar devolvendo exatamente o mesmo.
3. **A linha de base.** Tem de ser tabela de TOTAIS. Se aparecer `amostra` em qualquer arquivo de evidência, é dado
   real de produção entrando no repositório.
4. **A Frente F.** É onde a sessão pode pausar pedindo aprovação — fique de olho. Depois, confira por nome:
   `gh secret list`, `gh variable list --json name --jq '.[].name'` (o `gh variable list` puro mostra os valores) e
   os nomes das linhas do `.env.local` — sem abrir os valores na tela.
5. **O alarme de ponta a ponta.** Uma issue tem de ter aberto e fechado sozinha no repositório, e o e-mail do GitHub
   tem de ter chegado para você. Se a issue abriu e o e-mail não veio, o problema é a configuração de notificação,
   não a fase.

### Ao voltar

1. **Execute o roteiro que está no topo do relatório.** No mínimo: girar o `SUPABASE_ACCESS_TOKEN` **com validade**
   (painel → Account → Access Tokens) e atualizar quem o usa; repetir a troca do `.env.local` na outra máquina; e,
   se o agente não conseguiu ler a chave de serviço do ENSAIO, colá-la no `.env.local` (painel da Supabase → projeto
   `sgmvldiizsrjbxzzpmhh` → Settings → API).
2. Leia as **onze atas** em `docs/DECISOES.md`. A **2** (a política do alarme) decide o que vai te acordar; a **1**
   (o resumo) é a que a próxima fase que mexer em checagem vai herdar; a **3** (a redação) e a **9** (a conta) são as
   de segurança.
3. `git diff main...f55-observabilidade-sonda-e-alarme -- supabase/migrations/` deve mostrar **exatamente** a `0138`
   e o `migrations.lock.json`. Qualquer migration antiga tocada = a fase quebrou a regra mais dura do repositório.
4. Abra a `/dev` e confira que a Integridade continua com **doze** checagens e os mesmos números de antes.
5. Veja a issue de alarme (fechada) e os runs do `saude.yml`. **No dia seguinte**, confira que os disparos agendados
   aconteceram — o GitHub pode atrasar e até descartar execução agendada; o primeiro dia é a prova de que o horário
   está certo.
6. Abra `https://ti-wap-inventory-control.vercel.app/api/saude` no navegador: tem de responder sem login, com a
   versão `1.60.0`.
7. Rode você mesmo `npm run test` e `npm run build` uma vez.
8. Veio errado? **Regra dos 2 strikes:** depois de duas correções falhas, peça um prompt novo com o aprendizado e
   rode em sessão limpa. A reversão do código é barata, e nesta ordem: `gh workflow disable saude.yml` primeiro
   (senão o próximo disparo alarma sobre a função que sumiu), `git revert` + deploy, e só então o rollback da `0138`
   (reemitir o corpo da `0136` e derrubar as funções novas). As credenciais não voltam sozinhas — o que saiu do
   `.env.local` está no painel da Supabase e na Vercel.

---

## Suposições que fiz

1. **A F55 vem agora e a F54 está fechada**: `package.json` em `1.59.1` (a PATCH do rollout `0131`→`0132`), última
   migration `0137`, PR #39 mergeado, árvore limpa. Por isso a migration é a **`0138`** e a versão a **`1.60.0`** — e o
   prompt manda medir antes, não confiar no número escrito.
2. **O resumo sai de uma função-núcleo extraída, e não de uma chamada "por dentro" como a ficha escreve.** Medi que
   `dev_checagens_integridade` recusa quem não é dev já na primeira linha (o `e_dev()` lê o JWT, e `security definer`
   não o troca). Deixei como Decisão 1 do agente, com a régua "nunca duas cópias do SQL".
3. **O alarme não é "falha se passar de zero" nas doze.** Produção já tem achado em pelo menos duas (`backup_orfao` =
   10; conflitos = 137 grupos em agosto). Mandei medir a linha de base e usar catraca nas que já têm achado — ela só
   desce, e **subir é decisão sua, nunca do agente**. Se você quiser alarme só nas hoje-zero — a ficha ao pé da letra
   —, é uma linha.
4. **A prova "o workflow falhou ao plantar uma inconsistência" é feita no ENSAIO**, por dispatch, com uma conta
   `consulta` FICTÍCIA que o agente cria lá antes — a persona `seed.consulta@wap.ind.br` do seed, com a senha
   fictícia dele. Medi que o ensaio hoje tem só 3 perfis e nenhum do seed. Plantar em produção é proibido no
   prompt.
5. **O agente aplica a `0138` em ensaio E produção**, no molde da F53 e da F54 — ela é só-leitura.
6. **A conta `consulta` nasce com e-mail derivado da conta de smoke atual por sub-endereçamento (`+agendado`)**, para
   que qualquer e-mail caia numa caixa que já é sua, sem o endereço aparecer escrito em lugar nenhum. Se o domínio não
   aceitar o `+`, o agente registra e escolhe outro caminho (Decisão 9); se você preferir um endereço específico, é uma
   linha no prompt.
7. **As cinco variáveis que ninguém lê (`MS_*`, `SITE_ID`, `ESPELHO_ITEM_ID`) NÃO são apagadas** — o prompt manda
   inventariar e deixar para você, porque o consumidor pode estar fora do repositório. Uma delas é um client secret do
   Azure: vale decidir logo.
8. **A chave de serviço de produção sai do `.env.local` e não fica cópia** — ela continua no painel da Supabase e na
   Vercel. A carga do go-live, a única ferramenta que a usaria, já aceita `CARGA_SERVICE_ROLE_KEY` por sessão.
   Antes de gravar, o script confere por hash que nenhuma outra linha mudou — o `MS_CLIENT_SECRET` o Azure só mostra
   uma vez.
9. **O token vai para o cofre do Windows pela CLI da Supabase, e não para variável de usuário.** A ficha diz "export
   de shell"; variável persistente seria pior que o arquivo (todo processo a herda, inclusive o `npm run dev`). O
   `db:types` passa a achar o token no cofre; o raro `medir-itens.mjs` usa export de sessão na hora.
10. **A frequência é a da ficha** (Parte A a cada 6 h, Parte B diária): o agente estima o custo antes e mede no
    primeiro dispatch; se passar da estimativa, a frequência muda por PR novo. Se a sua cota estiver apertada, 12 h na
    Parte A é uma linha.
11. **A Parte C do smoke (as rotas logadas de admin) pode ficar fora do agendado** — ela continua no ritual pós-deploy,
    com a conta admin local. Deixei como Decisão 6 do agente.
12. **As dez telas de erro de Client Component continuam com `console.error`** — elas logam no navegador de quem opera,
    e o lado servidor desses erros é pego pela instrumentação.
13. **Interativo e com você alcançável até a Frente F** é o jeito de rodar que eu recomendo — o modo `auto` pausa
    depois de 3 bloqueios seguidos, e é na Frente F que eles aparecem. Se não der para ficar por perto, o `-p` pula o
    bloqueado e segue (o comando está no guia).
14. **Esta ordem passou por uma revisão adversarial em contexto fresco nesta conversa**, contra a ficha, a F54 e os
    arquivos do repositório: 25 achados, 6 altos, todos incorporados. Os que mais mudaram o texto: a issue de alarme
    por par (alvo, parte) — senão o verde de uma sonda fechava o alarme da outra, e o ensaio fechava o de produção —;
    a catraca que só você sobe; a Frente F em três unidades atômicas; o roteiro de alarme só no Postgres do CI; o
    achado do advisor declarado de antemão; e o comportamento real do modo `auto` no guia.
