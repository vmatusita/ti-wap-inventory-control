ultracode

# Ordem de serviço F23 — Ferramentas DESTRUTIVAS do cargo dev: apagar, resetar e forçar

> Ordem de 30/07/2026, emitida pelo Johnny (mesmo dia do fecho da F22). Sucede a F22
> (`docs/prompts/F22-cargo-dev-ultracode.md` · `docs/RELATORIO-F22.md` ·
> `docs/ADR-002-papeis-e-permissoes.md` §13). Em conflito entre esta ordem e a spec/ADR,
> **esta ordem manda** — emende os documentos e registre em `docs/DECISOES.md`.
> Numeração: na escrita desta ordem, a última fase era a F22 e a última migration a `0078`.
> **Confira os números livres reais antes de começar**; colisão → renumere (precedente
> F19/F20B) e registre. Se `git status` mostrar trabalho não commitado de outra sessão,
> PARE e reporte (regra da casa: uma ordem por vez) — **exceto o próprio arquivo desta
> ordem** (`docs/prompts/F23-dev-destrutivo-ultracode.md`), que é insumo da fase: commite-o
> no primeiro commit.

## Missão

Dar ao cargo **dev** (F22) as ferramentas destrutivas que ele ainda não tem — três famílias,
todas na área `/dev` e com a trava no Postgres, escopo fechado pelo Johnny em 30/07/2026:

1. **APAGAR de vez, registro a registro**: um **ativo** com todo o rastro dele
   (movimentações, termos — inclusive o `.docx` no Storage —, pendências); uma
   **movimentação avulsa** (diferente de estornar: some da linha do tempo, com o estado do
   ativo recomputado do que sobra); um **item do catálogo** com lançamentos e saldos.
2. **RESETAR dados em bloco, modular**: o dev escolhe **o quê** (acervo de ativos e/ou
   lançamentos de itens) e **o alcance** (uma filial ou o sistema inteiro). **Cadastros
   nunca entram** (usuários, filiais, motivos, catálogo de itens, kits, senhas ficam).
3. **FORÇAR estado**: qualquer status de um ativo, ignorando as transições válidas da
   máquina; e o saldo de um item corrigido na marra — sempre com justificativa obrigatória
   e rastro visível.

Doutrina da F22 intacta e estendida: cada operação é exclusiva do dev **no banco** (não na
tela), exige confirmação digitada + justificativa, cai em `eventos_admin`, e **nenhuma perda
acontece sem backup antes**. Console de SQL segue proibido: cada ferramenta é uma operação
NOMEADA com SQL fixo. Custo R$ 0, zero dependência nova, visualizador por senha intocado.

## Contexto (leia a origem, não descrições dela)

- Doutrina: `@CLAUDE.md` (modo autônomo; "a movimentação é a fonte da verdade"; regras
  permanentes) · `@docs/RUNBOOK-BANCO.md` (**"O gate do modo automático"** e os caminhos
  A/B — esta ordem BATE no gate, ver §6).
- O que esta ordem ESTENDE: `@docs/prompts/F22-cargo-dev-ultracode.md` ·
  `@docs/RELATORIO-F22.md` (o que a `/dev` tem hoje e como se provou) · migrations
  `@supabase/migrations/0071`…`0078` — em especial o padrão **RPC `security definer` com
  `e_dev()` por dentro + janela GUC local à transação, fechada ao sair** (`0073`/`0074`;
  a medição "set_config é local à transação, não à chamada" está no RELATORIO-F22 §1.1b).
- A `/dev` vigente: `@src/app/(app)/dev/**` · `@src/components/dev/**` ·
  `@src/lib/actions/dev.ts` (padrão `DevResult`; `exigirDev` é a MENSAGEM, a RPC é a trava;
  aviso F13 sobre módulos `'use server'`) · `@src/lib/queries/dev.ts` ·
  `@src/lib/auditoria.ts` (vocabulário `ACOES_ADMIN`/`ACAO_ROTULO`).
- **O que as ferramentas vão violar de propósito — mapeie ANTES de escrever SQL**: a máquina
  de estados e a imutabilidade de `movimentacoes`/`lancamentos_item` (`0004` + revisões
  `0023`/`0027`/`0045`/`0047`/`0051`), os triggers de derivação (status do ativo, saldos,
  `pendencias_item` com FK DEFERRABLE — `0050`–`0053`), o estorno (`0023`/`0068` — apagar
  não pode quebrá-lo), `snapshot_anterior` (`0067` — apagar movimentação do meio deixa os
  snapshots seguintes mentindo), o as-of e sua ordenação (`0054`), a compra de abertura do
  import (baseline — F8), os termos no Storage (`0021`/`0066`/`0069`) e as FKs reais em
  `@src/lib/types/database.ts`.
- O "delete em massa" que JÁ existe e é o precedente do reset: `importar_ativos_substituir`
  (`0031`–`0048`) — recorte por filial, guardas, contagens, backup e o gate que ela bate.
- Comandos: `npm run lint` · `npm run test` · `npm run build` · `npm run db:types` · smoke
  `scripts/smoke/smoke-prod.mjs`. **Meça a baseline ANTES de mudar qualquer coisa** e cole
  no relatório.
- APIs externas (regra 6 do CLAUDE.md): confira na documentação oficial vigente (MCP
  Context7) o que for usar do Storage (`remove` em lote via client admin) e do Supabase SSR.
  Não escreva de memória.

## Escopo

**Dentro:** migrations novas a partir do próximo número livre; as RPCs `security definer`
das três famílias + as aberturas de janela nos triggers de imutabilidade/máquina; vocabulário
novo de `eventos_admin`; a UI nova na `/dev` (bloco "Zona destrutiva" ou subrota — decida);
Server Actions (em `src/lib/actions/dev.ts` ou módulo novo `'use server'`), validators,
queries; roteiro(s) SQL; Vitest; smoke; seeds/fixtures FICTÍCIOS de ensaio se ajudarem;
documentação (spec, CLAUDE.md §Modelo de acesso, emenda na ADR-002 ou ADR nova — registre,
DECISOES) e encerramento padrão.

**Fora (não toque):** o visualizador por senha; qualquer caminho novo de escrita para
admin/operador/consulta (**nada afrouxa para quem não é dev**); os domínios de login;
o import de startup e a tela `admin/importar` (ficam como estão); cadastros no reset;
console de SQL / função que receba SQL, nome de tabela ou coluna como parâmetro — PROIBIDO
(precedente `0077`: SQL fixo por dentro); `relatorios_gerados`, `eventos_admin` e
`import_logs` **sobrevivem a qualquer reset** (são história administrativa, não acervo —
registre essa leitura); seed em produção JAMAIS; **nenhuma execução destrutiva real em
produção nesta ordem** (as ferramentas se instalam e se provam; usar é decisão do dev,
depois); migration aplicada não se edita; dependência nova NENHUMA; `src/components/ui/**`.

## O modelo a implementar

### 1. Princípios comuns às três famílias (valem para TUDO)

1.1. **A trava é no Postgres.** Cada operação é uma RPC `security definer` com `e_dev()` no
     topo (padrão `0074`), `set search_path`, grants `authenticated=true` /
     `anon=false` / `service_role=false` (padrão do import, `0040`). A guarda `exigirDev`
     da action é a mensagem pt-BR, nunca a segurança.
1.2. **Janela controlada.** Os triggers de imutabilidade e da máquina de estados continuam
     recusando TODO caminho comum; as RPCs abrem a janela por GUC **local à transação** e a
     **fecham explicitamente ao sair — inclusive em erro no meio** (a lição da F22).
     Prove por asserção SQL que UPDATE/DELETE direto segue recusado fora das RPCs, para
     `authenticated` forjado E para o service role.
1.3. **Confirmação digitada + justificativa** (padrão `apagarUsuario`): apagar ativo exige
     digitar o patrimônio (ou a service tag, se o ativo não tem patrimônio — e patrimônio
     repetido se resolve pelo par, regra da casa); apagar item exige o nome do item; reset
     exige o nome da filial (ou uma frase fixa para o global — você define, ex.
     "RESETAR TUDO"); forçar exige justificativa livre com mínimo de caracteres. A
     confirmação é validada NA ACTION E NA RPC (forjar o request não pode contorná-la).
1.4. **Backup antes da perda.** Nenhum dado some sem cópia: decida a mecânica MEDINDO o que
     já existe (o padrão de backup/contagens do import; o export CSV de `exportar.ts`) e
     registre. Réguas mínimas: para **apagar registro a registro**, as linhas apagadas vão
     em jsonb no `detalhe` do evento (com cap sensato) OU num log dedicado; para **reset**,
     backup é OBRIGATÓRIO e conferível (a tela só habilita o botão depois de baixar o
     export do recorte, ou a RPC grava o backup e a resposta prova as contagens) — escolha,
     implemente e prove.
1.5. **Trilha.** `ACOES_ADMIN`/`ACAO_ROTULO` + o comment de `eventos_admin.acao` (regra
     "mexeu aqui, mexa lá" da `0065`) ganham os verbos novos — sugestão: `ativo_apagado`,
     `movimentacao_apagada`, `item_apagado`, `acervo_resetado`, `itens_resetados`,
     `estado_forcado`, `saldo_forcado` (nomes finais a seu critério; registre). Cada evento
     carrega o suficiente para auditar sem o dado que morreu: contagens, ids, patrimônio,
     antes→depois, justificativa. A aba Auditoria da `/dev` exibe e exporta os novos.
1.6. **Caches.** Após cada operação, revalidação dos grupos afetados (reuso de
     `GRUPOS_REVALIDACAO` de `dev.ts`).

### 2. Família APAGAR (registro a registro)

2.1. **Ativo** (`apagar_ativo`): leva junto TODO o rastro daquele ativo — movimentações,
     `termos_gerados` e os objetos do bucket `termos`, `pendencias_item`, anotações se
     forem por ativo — **meça as FKs reais em `database.ts` antes**, não confie nesta
     lista. O par patrimônio+service tag volta a ficar livre. Storage: a RPC não apaga
     arquivo físico — a action limpa via client admin DEPOIS do commit da RPC, e o caso de
     falha não pode ser silencioso: confira se as checagens de integridade da F22 cobrem o
     **órfão inverso** (objeto sem termo); se não cobrem, acrescente a checagem. Termo de
     LOTE que cita este ativo e outros: decida (recusar? manter o termo e registrar no
     evento?) medindo como `termos_gerados` referencia ativos — e registre. Snapshots de
     `relatorios_gerados` NÃO se reescrevem (foto congelada é história; o patrimônio
     apagado pode continuar citado lá — registre a leitura).
2.2. **Movimentação avulsa** (`apagar_movimentacao`): **este é o ponto mais duro de
     corretude da ordem** — `snapshot_anterior` encadeia, o estorno restaura de snapshot,
     o as-of reordena, e a compra de abertura é a baseline da linha do tempo inteira.
     Decida com prova entre os dois desenhos e registre:
     - **só-a-última**: apagável apenas a movimentação mais recente do ativo (na ordem
       vigente da casa, a da `0054`); estorno vinculado → apaga o par ou recusa; a compra
       de abertura / única movimentação → recusa e aponta para `apagar_ativo`. Estado
       recomputado = o snapshot que sobra. É o desenho simples e reversível.
     - **qualquer-uma com replay**: reconstrói o estado derivado reexecutando o que sobra
       na ordem canônica. Só se você provar coerência em TODOS os cenários do roteiro (§7).
     Nos dois: `pendencias_item` atadas à movimentação seguem o desenho da F18 (medir a FK
     DEFERRABLE), termos atados à movimentação seguem a régua do 2.1, e a recusa vem com
     mensagem pt-BR que diz o caminho certo (ex.: "estorne em vez de apagar").
2.3. **Item do catálogo** (`apagar_item`): o item some com lançamentos e saldos; a visão
     por filiais e o histórico não podem quebrar; kit que cita o item no payload jsonb:
     kit é cópia/checklist (F12) — decida se limpa, avisa ou deixa, e registre.

### 3. Família RESETAR (bloco + alcance)

3.1. **Blocos**: `acervo` (ativos + movimentações + termos + pendências + anotações do
     alcance) e `itens` (lançamentos e, com eles, os saldos — o catálogo FICA). Alcance:
     UMA filial ou GLOBAL. Um par (bloco, alcance) por chamada.
3.2. **Recorte por filial**: espelhe a definição do `importar_ativos_substituir` (ativos
     hoje NA filial + todo o rastro deles, transferências inter-filiais incluídas no rastro
     do ativo — confira no corpo da RPC como o recorte trata isso e siga o precedente;
     divergência deliberada → registre). Itens por filial = lançamentos daquela filial.
3.3. **Storage**: os `.docx` do recorte somem junto (mesma mecânica e mesmo backstop do 2.1).
3.4. **Contagens antes/depois** na resposta E no evento ("X ativos, Y movimentações,
     Z termos, W lançamentos"); a tela mostra a contagem do recorte ANTES de habilitar a
     confirmação.
3.5. **Reset não recria nada** — não é seed, não é import: deixa o alcance vazio, pronto
     para um import de startup ou uso manual. E não toca relatórios gerados, eventos_admin,
     import_logs, nem NENHUM cadastro (§Escopo).

### 4. Família FORÇAR

4.1. **Estado do ativo** (`forcar_estado_ativo(p_ativo, p_status, p_justificativa)`):
     aceita qualquer status do enum, ignorando as transições válidas. A doutrina
     "movimentação é a fonte da verdade" NÃO se revoga: a forma preferida é a força
     **materializar um registro na linha do tempo** (movimentação de tipo/motivo próprio de
     correção técnica, criada pela janela do 1.2, com a justificativa e a marca de
     "forçado" visíveis na ficha), de modo que status, ficha e as-of continuem DERIVANDO e
     o histórico explique o estado. Update direto no status + evento é a alternativa
     inferior — só se a preferida se provar inviável na medição (enum de tipos, efeitos nos
     relatórios), com o porquê registrado. Cuidados medidos, não presumidos: relatórios,
     KPIs e Entradas/Saídas **não podem contar a correção-dev como operação normal**
     (precedente: a compra de abertura fora das Entradas — F8); campos derivados nos
     estados terminais espelham o que a máquina faz (baixa zera detentor — `0045`/F14);
     pendências derivadas reagem como a spec manda.
4.2. **Saldo de item** (`forcar_saldo_item(p_item, p_filial, p_saldo_alvo,
     p_justificativa)`): grava o lançamento de ajuste que leva o saldo ao alvo — o saldo
     continua 100% derivado, nunca escrito à mão — com marca de "forçado" e justificativa
     no histórico. Se o lançamento de ajuste comum já dá conta (meça), a família vira
     açúcar de UI sobre ele com trilha de dev — decida e registre.
4.3. Ativar/desativar item do catálogo já existe em `admin/itens` e o dev herda por
     `e_admin()` — aqui não há nada novo além de conferir.

### 5. UI na `/dev`

Bloco "Zona destrutiva" na página atual ou subrota `dev/destrutivo` (decida; layout `/dev`
já exige dev — mantenha a defesa em profundidade). Padrões da casa: buscar o alvo (ativo
por patrimônio TRATANDO múltiplos resultados; item por nome; movimentação a partir da ficha
do ativo ou por id); cada operação num diálogo estilo `apagar-usuario-dialog` — resumo com
as contagens REAIS lidas na hora ("este ativo tem N movimentações, M termos"), confirmação
digitada, justificativa, resultado com números; reset com seleção bloco+alcance e contagens
do recorte antes. As ferramentas destrutivas vivem SÓ na `/dev` — nenhum atalho na ficha,
nas listas ou na paleta para papéis comuns. Server Components por padrão; nenhum segredo no
HTML; textos em pt-BR com o tom honesto da casa (o que vai acontecer, o que não tem volta).

### 6. Migrations, o GATE e produção

As RPCs desta ordem contêm `delete from public.ativos` / `delete from public.movimentacoes`
— o texto exato que o **gate do modo automático** bloqueia no MCP (runbook, "O gate").
Não brigue com o gate:

- Tente o apply por MCP **uma vez** no ENSAIO (precedente `0048`: `create or replace` às
  vezes passa, porque o corpo não executa no apply). Bloqueado → **caminho B do runbook**
  sem insistir (bloqueios repetidos abortam a sessão): migration no repo + SQL de handoff
  em `scratchpad/` + diff mínimo conferível + verificação pós-apply escrita + `notify
  pgrst, 'reload schema'` — e registre "pendente de execução manual pelo Johnny no SQL
  Editor" como pendência, seguindo com o resto da obra.
- Escreva roteiros e scripts de prova SEM os literais que o gate caça: o texto
  `delete from public.ativos`/`delete from public.movimentacoes` fica confinado às
  migrations; o roteiro chama as RPCs, planta por INSERT e limpa por rollback — assim as
  provas rodam assim que as RPCs existirem. Se nem o ensaio aceitar o apply por MCP, deixe
  o handoff dos DOIS bancos pronto e marque os cenários destrutivos do roteiro como
  "pendentes do apply manual" — NÃO improvise o equivalente picado por `execute_sql`.
- Ordem dos ambientes: ensaio primeiro, produção depois, SEMPRE. As provas destrutivas
  (roteiros do §7) rodam SÓ no ensaio, com dado 100% fictício, em transação revertida ou
  contra um recorte plantado para isso. Em produção: apply (pelo caminho que passar),
  verificação pós-apply de cada migration (assinatura única, grants, triggers presentes),
  advisors, smoke — e **nenhuma execução destrutiva real** (§Escopo).
- Valor novo de enum (se o 4.1 criar tipo/motivo de movimentação) vai em migration SOZINHA
  (precedente `0044`/`0045`, `0071`).

### 7. Testes e documentação

- Roteiro SQL novo `supabase/tests/dev_destrutivo.sql` (padrão auto-verificável da pasta),
  provando no MÍNIMO: admin/operador/consulta não executam NENHUMA RPC nova (request
  forjado incluso) e o service role não fura por fora; UPDATE/DELETE direto em
  `movimentacoes`/`lancamentos_item`/`ativos` segue recusado fora das RPCs; apagar ativo
  some com o rastro e libera o par patrimônio+service tag; apagar movimentação nos cenários
  do desenho escolhido (última; com estorno vinculado; compra de abertura; do meio —
  provando o recompute OU a recusa, conforme o 2.2); apagar item limpa lançamentos/saldos;
  reset por filial NÃO vaza para outra filial (plante dado nas duas e confira); reset
  global zera acervo/itens e cadastros ficam; forçar estado deriva ficha/as-of e NÃO conta
  nos relatórios como operação normal; forçar saldo bate no alvo; **estorno comum continua
  funcionando** e a confirmação digitada não é contornável por request forjado. Ensaio
  completo; em produção, só os casos read-only/de recusa.
- Vitest: validators e funções puras novas; módulo `'use server'` novo passa no guarda
  `use-server-exports` e no gate `verificar-actions-build.mjs`.
- Smoke: `/dev` segue 200 só para dev; acrescente conferências read-only das assinaturas/
  grants novos se o padrão do smoke comportar.
- Documentação: spec (o § que descreve a `/dev`/modelo de acesso ganha as ferramentas);
  `CLAUDE.md` §Modelo de acesso (a frase "checagens só-leitura" ganha o adendo: ferramentas
  destrutivas NOMEADAS, com backup e trilha — console de SQL segue proibido); EMENDA datada
  na ADR-002 (ou ADR-003 se o volume justificar — registre); `docs/DECISOES.md` (data ·
  contexto · escolha · motivo para CADA decisão desta ordem); ajuda do operador SÓ se os
  guardas de cobertura exigirem (a `/dev` é isenta por decisão da F22 — não crie manual de
  ferramenta destrutiva para operador).

## Critérios de aceitação

1. **Exclusividade**: nenhuma operação nova é alcançável por admin/operador/consulta —
   recusa em pt-BR na UI/action E recusa no banco em request forjado; service role não fura
   por fora das RPCs (asserções SQL provam as camadas).
2. **Apagar ativo**: rastro completo some (movimentações, termos + Storage, pendências),
   par patrimônio+service tag liberado — provado ponta a ponta no ensaio com dado fictício.
3. **Apagar movimentação**: o desenho escolhido no 2.2 está provado nos cenários do
   roteiro; casos recusados recusam com mensagem que aponta o caminho certo; estorno comum
   intacto.
4. **Apagar item**: catálogo, lançamentos e saldos somem; `/itens` (as duas visões) e o
   histórico não quebram.
5. **Reset**: por filial não toca outra filial; global zera o(s) bloco(s) pedido(s);
   cadastros, relatórios gerados, eventos e logs intactos; contagens antes/depois na
   resposta e no evento; backup garantido ANTES, pelo desenho do 1.4.
6. **Forçar**: qualquer estado aplicável com justificativa obrigatória; a ficha/linha do
   tempo EXPLICA o estado (rastro visível); relatórios/KPIs não contam a correção-dev como
   operação normal (provado por consulta, não por raciocínio); saldo de item chega ao alvo
   por registro derivado.
7. **Imutabilidade fora da janela**: UPDATE/DELETE direto em
   `movimentacoes`/`lancamentos_item`/`ativos` segue recusado para todo papel fora das RPCs
   oficiais, service role incluso; a janela GUC comprovadamente fecha mesmo em erro.
8. **Trilha**: toda operação gera evento com justificativa/contagens; vocabulário e comment
   atualizados; a Auditoria da `/dev` exibe e exporta os eventos novos.
9. **Sem regressão**: operador/consulta/visualizador idênticos (smoke prova); estorno,
   import e F22 intactos; advisors sem WARN novo de RLS; checagens de integridade verdes
   (mais as que o desenho novo pedir, se você as criar — registre).
10. **Portões**: `npm run lint`, `npm run test`, `npm run build` limpos; roteiros SQL
    verdes (ensaio completo; produção read-only); `database.ts` regenerado; migrations
    aplicadas OU handoff registrado como pendência com SQL pronto e conferência escrita;
    deploy READY + smoke pós-deploy OK.

## §V — Verificação (rode de verdade, itere até passar)

Meça a baseline (lint/test/build) ANTES de qualquer mudança e cole no relatório. A cada
incremento: `npm run lint && npm run test && npm run build` — leia a falha, corrija a CAUSA
RAIZ, repita; nunca suprima erro, nunca desabilite/delete teste para passar. Roteiros SQL no
ensaio com dado fictício (destrutivos em transação revertida ou recorte plantado); produção
só recebe apply + verificação pós-apply + advisors + smoke, jamais execução destrutiva. Ao
final, **revisão adversarial em contexto fresco** contra esta ordem, refutação por padrão,
atenção especial a: sobrou caminho (grant, policy, action, RPC antiga) em que um não-dev
alcança operação destrutiva?; a janela GUC fecha SEMPRE, inclusive quando a RPC estoura no
meio?; apagar movimentação deixa estado/pendência/saldo/snapshot incoerente em algum cenário
(estornada, compra de abertura, única do ativo)?; reset por filial vaza (transferência
inter-filial, termo de lote misto)?; a correção-dev vaza para relatórios/KPIs como operação
normal?; Storage fica com órfão silencioso?; a confirmação digitada é contornável forjando a
action?; o texto de alguma migration faria o modo automático abortar em vez de seguir o
caminho B? Aponte só lacunas de correção ou de requisito, não estilo — corrija e re-revise
até limpar.

## Autonomia, decisões e git

Você roda de forma autônoma (modo do CLAUDE.md): ninguém responderá perguntas — não pare,
não espere confirmação. Régua: (1) esta ordem; (2) ADR-002/RUNBOOK e as convenções do
repositório; (3) a opção mais simples e reversível — decisões não-óbvias em
`docs/DECISOES.md` (data · contexto · escolha · motivo). Mesma falha 3 vezes → troque de
abordagem e registre. Bloqueio real → contorne com segurança ou siga com o resto e registre
a pendência. Se o ambiente vetar um passo sensível (o gate no apply, push), NÃO insista até
abortar: deixe o comando/SQL exato pronto e provado no ensaio, registre "pendente de
execução manual" e siga. Git: commits pequenos em pt-BR estilo conventional
(`feat(f23): …`); branch opcional (`f23-dev-destrutivo`) com merge próprio ao fechar o
checklist; PROIBIDO push forçado, reset destrutivo de git, commitar `.env*`, dado real em
seed/fixture/teste/screenshot (os roteiros usam `WAP0001234`/"Fulano", como sempre).

## §R — Encerramento e relatório

`CHANGELOG.md` (topo) · `docs/prompts/README.md` (linha da F23) · `README.md` (status) ·
`docs/DECISOES.md` · `docs/RELATORIO-F23.md` em pt-BR com: o que mudou e por quê; o
checklist desta ordem autoverificado item a item; **evidências coladas** (saídas reais de
lint/test/build, dos roteiros SQL, das verificações pós-apply, dos advisors e do smoke —
afirmação sem saída não vale); decisões; pendências (inclusive o handoff do gate, se
houver, com o caminho do SQL em `scratchpad/`); a seção "o que este relatório NÃO prova";
e o roteiro manual de 5 minutos para o Johnny — sugestão: como admin, constatar que nada da
Zona destrutiva existe/responde; como dev, criar um ativo FICTÍCIO pela tela de compra,
forçar o estado dele, apagar a movimentação forçada, apagá-lo de vez conferindo contagens e
trilha — ciclo completo em produção sem encostar em dado real. Push = deploy Vercel, só com
o §V inteiro verde. Termine a resposta final com um resumo de ~5 linhas em pt-BR.

## Idioma

UI, mensagens, erros, commits, docs e relatório em pt-BR; identificadores de domínio em
português sem acento (`apagar_ativo`, `acervo_resetado`, `forcar_estado_ativo`);
utilitários/infra em inglês — a convenção vigente do repositório.
