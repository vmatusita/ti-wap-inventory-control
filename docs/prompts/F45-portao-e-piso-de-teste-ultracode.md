# F45 — O portão fecha, e o teste de componente ganha piso

*Ordem de serviço gerada em 06/09/2026, a partir de `docs/PLANO-MULTIEMPRESA.md` §5, Bloco A.*

**Por que ela existe.** É a raiz do plano multiempresa: das 28 fases, esta é a única sem dependência
nenhuma, e é dela que as outras 27 dependem. O `docs/PLANO-MULTIEMPRESA.md` deixa cerca de **trinta
travas anti-reincidência** espalhadas pelas fases seguintes — e hoje, em 06/09/2026, **todas elas
valem zero**, porque o CI do repositório pode marcar ✗ e a Vercel publica igual. Uma trava que
informa não é trava; é documentação do vazamento depois que ele foi ao ar. Fechar o portão é
configuração e YAML, custa uma tarde, e multiplica as 27 fases seguintes.

**O que mais entra junto, e por quê.** Junto do portão vêm três coisas que só fazem sentido no mesmo
commit: a **honestidade dos roteiros SQL** (roteiro que aborta cedo passa verde hoje — o gate é um
`grep` por `✗`, e um roteiro que morre na linha 5 não emite nenhum), o **runner único** (o loop dos
roteiros vive dentro do YAML, então a máquina do Johnny e o CI divergem por construção) e o **piso
de teste de componente** (0 `.test.tsx` em 273 `.tsx` — e a virada multiempresa vai acrescentar
seletor de empresa a quase toda tela).

**O que esta fase NÃO é.** Não é adotar Testing Library, não é jsdom, não é refatorar componente
nenhum. O piso é de **grau 1**: `renderToStaticMarkup` de `react-dom/server`, que já é dependência.
Grau 2 (interação, jsdom) vira proposta escrita ao Johnny **depois do piloto**, porque custa
dependência nova e a decisão 4 do plano fixa R$ 0 na preparação.

**As duas decisões do Johnny, tomadas em 06/09/2026:**

1. **O agente configura o portão sozinho, via `gh api`.** Se o GitHub CLI estiver instalado e
   autenticado com admin no repositório, ele aplica os *required status checks*, o *require pull
   request* e o bypass da conta do Johnny sem intervenção. Só cai para instruções escritas se o `gh`
   faltar ou o token não tiver permissão — e aí isso é a única pendência da fase.
2. **A F45 vai direto na `main`, e protege por último.** Ela é a última fase do modo autônomo de
   hoje: branch `f45-portao`, merge, CI verde, tag `v1.50.0`, deploy — e **só então** liga a branch
   protection. Ligar antes trancaria o agente do lado de fora no meio da própria fase.

**Duas armadilhas que este prompt já resolve, e que o plano não previu.** Foram achadas lendo o
código em 06/09/2026: `src/lib/layout/consistencia.test.ts` varre **todo** `.tsx` de `src/app` e
`src/components` (menos `src/components/ui/`) e **não exclui arquivo de teste** — um
`aviso.test.tsx` ao lado do componente cai na régua de layout. `src/lib/dominio/cores.test.ts` tem o
mesmo alcance para a catraca `TETO_PALETA_CRUA`. Os três testes-semente vão nascer dentro dessas
duas varreduras se ninguém decidir o contrário.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Fechar o portão de qualidade do Estoque TI WAP: fazer o CI poder REPROVAR um deploy, fazer os
roteiros SQL rodarem na máquina do Johnny com o mesmo comando que o CI usa, tornar os roteiros
HONESTOS (roteiro que aborta cedo hoje passa verde) e criar o único piso de teste que falta —
render de componente — SEM dependência nova. Ao final: `verificar` e `banco` como required status
checks na `main` com require-PR e bypass do Johnny, `npm run db:test` rodando local, `npm run test`
executando pelo menos um `.test.tsx`, `verificar:actions` no log do CI, versão **1.50.0** publicada
com tag `v1.50.0`, merge na `main`, deploy no ar. **Sem migration, sem dependência nova, sem
refatorar componente nenhum.**

# Contexto

## Leia antes de escrever qualquer código
- `@CLAUDE.md` manda em tudo: modo autônomo, as 8 regras permanentes (a **regra 3** — custo R$ 0,
  stack fechada — decide metade das escolhas desta fase; a **regra 8** — versão — não se
  reinterpreta), a stack e as convenções.
- `@docs/PLANO-MULTIEMPRESA.md`, nesta ordem: **§4** (as 10 regras comuns a TODAS as fases — elas
  herdam para cá sem repetição), **§5 → F45** (a ficha desta fase: Entra / Não entra / Entregas /
  Pronto quando / Trava / Risco / Reversão / Repouso), **§0** (o diagnóstico que explica por que o
  portão vem primeiro), **§1** (as 8 decisões travadas, em especial a **8**, que é esta fase) e
  **§3** (a espinha — "F45 destrava tudo").
  ⚠ **A ficha da F45 no §5 é a fonte da verdade do escopo.** Onde este prompt e ela divergirem,
  vale a ficha, e a divergência vira nota no relatório.
- `@.github/workflows/ci.yml` — leia os comentários inteiros antes de mexer: eles registram por que
  o Node é 24, por que a CLI do Supabase está fixa em 2.109.1 e por que a telemetria está
  desligada. Cada um desses comentários é uma cicatriz de CI quebrado por causa externa. **Não os
  apague ao editar.**
- `@vitest.config.mts`, `@package.json`, `@scripts/verificar-actions-build.mjs` (leia o cabeçalho
  inteiro: são 20 horas de indisponibilidade explicadas).
- `@src/lib/layout/consistencia.test.ts` e `@src/lib/dominio/cores.test.ts` — as duas varreduras
  repo-wide que vão morder os testes novos (ver "As duas armadilhas", abaixo).
- `@docs/RUNBOOK-BANCO.md` e `@docs/DIVIDA-TECNICA.md`.

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
Medido no repositório em 06/09/2026, na `v1.49.1`. Se algum ponto não bater, PARE, trate a
divergência como o achado nº 1 da fase e registre — este prompt está errado, não o código.

1. **O CI não reprova nada.** `.github/workflows/ci.yml` tem dois jobs (`verificar` e `banco`) e
   nenhum é *required status check*: a `main` não tem branch protection, e a Vercel publica todo
   push independentemente do resultado. O job `banco` pode marcar ✗ e o deploy sobe igual.
2. **`cancel-in-progress: true` vale para push e para PR.** Dois pushes seguidos na `main` cancelam
   o CI do primeiro, e **o commit intermediário é publicado sem validação nenhuma**. Em PR isso é
   economia legítima; em `push: branches: [main]` é um buraco.
3. **`scripts/verificar-actions-build.mjs` existe, é bom, e ninguém roda.** Não está no
   `package.json` e não está no CI. Ele lê `.next/server`, então **só funciona DEPOIS de
   `npm run build`** — a posição dele no job `verificar` não é livre.
4. **O loop dos roteiros vive dentro do YAML.** O `for f in supabase/tests/*.sql` está escrito no
   passo "Rodar os roteiros de teste SQL", com o `psql`, a criação do operador `ci@wap.ind.br` e o
   `grep`. Não existe forma de rodar isso na máquina do Johnny com o mesmo código — local e CI
   divergem por construção.
5. **Roteiro que aborta cedo passa verde.** O gate é `grep -Eq 'WARNING:.*✗'`. Um roteiro que morra
   na terceira asserção por erro de dado não emite `✗` nenhum, e o `ON_ERROR_STOP=1` só pega erro de
   SQL — não pega bloco `do $$` que sai antes da hora por lógica. **Confira: nenhum dos 24 roteiros
   de `supabase/tests/` tem hoje uma linha `FIM` com contagem.**
6. **13 dos 24 roteiros não contam asserção nenhuma.** Sem `v_ok`/`v_falhas`, "passou" quer dizer
   "não vi ✗", que é diferente de "rodei N e N passaram". Confira a lista antes de aceitar —
   ela deve ser: `asof_desempate`, `f34_triagem_reserva`, `f36_detentor`, `fuso_do_negocio`,
   `import_substituir`, `itens_extra`, `manutencao_fornecedor`, `maquina_estados`,
   `pendencias_import_termo`, `pendencias_item`, `seguranca_catalogo`, `transicoes_extra`, `troca`.
7. **Não há teste de componente.** Zero `.test.tsx` em 273 `.tsx`. `renderToStaticMarkup` de
   `react-dom/server` **já é dependência** (`react-dom` 19.2.8) e `tsconfig.json` traz
   `"jsx": "react-jsx"` — o esbuild do Vitest lê isso, então o transform de JSX deve funcionar sem
   plugin. **Prove isso primeiro, com um teste descartável, antes de escrever os três de verdade.**
8. **O `include` do Vitest deixa buracos.** É `['src/**/*.test.ts', 'scripts/import/__tests__/**/*.test.ts']`:
   `.test.tsx` não casa com `*.test.ts`, e teste escrito em `scripts/env-guard.ts`,
   `scripts/design/` ou `scripts/termos/` **nunca roda e ninguém fica sabendo**.

## As duas armadilhas — decida cada uma ANTES de escrever o primeiro `.test.tsx`
Achadas lendo o código em 06/09/2026. Elas não estão na ficha do plano.

- **`consistencia.test.ts` varre todo `.tsx`.** A função `fontes()` percorre `src/app` e
  `src/components` inteiros, pula apenas `src/components/ui/`, e **não filtra arquivo de teste**.
  Um `src/components/layout/aviso.test.tsx` entra na régua de layout e passa a ser cobrado por
  regras de `<h1>`, padding, `max-w` e afins — que não fazem sentido num arquivo de teste.
- **`cores.test.ts` / `TETO_PALETA_CRUA` tem alcance parecido.** Classe Tailwind crua escrita dentro
  de um teste conta para a catraca, que **só desce**.

Duas saídas, e você escolhe por evidência, não por gosto: **(a)** excluir `*.test.tsx` nas duas
varreduras — mais simples, mas afrouxa uma régua e precisa de justificativa escrita; **(b)** pôr os
testes de componente fora do alcance das varreduras (ex.: `src/lib/componentes/` ou
`src/components/__testes__/`) — não afrouxa nada, mas separa teste de componente. Meça as duas,
escolha, e **registre em `docs/DECISOES.md` com o motivo**. Seja qual for a escolha, ela vale para
todos os `.test.tsx` que vierem depois — escreva a regra, não só o caso.

## O `_asserts.sql` e o detalhe que decide se ele funciona
`pg_temp.assert_zero_de(rotulo, ruins, universo)` **recusa universo vazio** — é essa a razão de ele
existir: o repositório tem asserções do formato `if v_n = 0 then ✓` que passam sobre conjunto vazio,
e um roteiro tautológico é pior que roteiro nenhum, porque dá sensação de rede.

Todo roteiro de `supabase/tests/` é `begin; do $$ ... $$; rollback;`. Uma função criada **dentro** da
transação some no `rollback`. Então `_asserts.sql` tem de ser carregado **antes** do `begin` do
roteiro, na **mesma sessão** de `psql` — `psql -f supabase/tests/_asserts.sql -f <roteiro>.sql` faz
exatamente isso (dois `-f` = uma sessão só, e `pg_temp` sobrevive entre eles). Confirme o mecanismo
com um teste antes de reescrever os 24. E o loop passa a **pular `_*.sql`**, senão ele tenta rodar o
próprio arquivo de asserções como roteiro.

## O que "portão fechado" quer dizer, em mecânica
*Required status check* sem *require pull request* torna push direto impossível na prática — o
GitHub recusa o push porque o check não existe ainda naquele commit. Então ligar o portão significa
que **da F46 em diante toda fase vira PR com espera do job `banco`**. Isso é a consequência
mecânica aceita na decisão 8 do plano; ela vai **escrita na ata**, não descoberta na F46.

O Johnny mantém **bypass na conta dele** (`bypass_pull_request_allowances` / *enforce_admins*
desligado, o que a API do GitHub oferecer). Usar o bypass passa a ser ato consciente, não default.

## Comandos que já existem
`npm run lint` · `npm run test` · `npm run contraste` · `npm run build`. Os scripts novos desta fase
são `npm run db:test`, `npm run db:test:um <arquivo>` e `npm run verificar:actions`.

# Escopo

## Dentro
- `.github/workflows/ci.yml`: `cancel-in-progress` por evento; passo `npm run verificar:actions` no
  job `verificar` **depois do build**; o passo dos roteiros passa a chamar o script extraído.
- `scripts/db/rodar-roteiros.sh` (novo): o loop dos roteiros, extraído do YAML e **chamado pelos
  dois lados** — CI e desenvolvedor. Ele é quem carrega `_asserts.sql`, pula `_*.sql`, exige a
  linha `FIM` e conta `NOTICE:.*✗` como falha além de `WARNING:.*✗`.
- `package.json`: `db:test`, `db:test:um`, `verificar:actions`, e o bump para **1.50.0**.
- `supabase/tests/_asserts.sql` (novo) + os **24 roteiros** ganhando a linha
  `raise notice 'FIM <nome>: % asserções, % falhas'`, e os **13 sem contador** ganhando
  `v_ok`/`v_falhas`.
- `vitest.config.mts`: migração para `test.projects` — `puro` (o de hoje, sem mudar o que ele já
  cobre) e `componentes` (`.test.tsx`).
- **Três testes-semente**, e só três: papel ARIA por variante do `Aviso`
  (`erro`→`role="alert"`, `atencao`→`role="status"`, `informacao`→sem papel — está em
  `src/components/layout/aviso.tsx`, no mapa `PAPEL`); o `aria-describedby` do
  `ConfirmacaoDigitada` apontando para um `id` que existe no HTML renderizado; e o `<h1>` do
  `CabecalhoDaPagina` (`src/components/layout/pagina.tsx:159`).
- `.gitattributes`: **ele já existe e já tem `* text=auto eol=lf`**. O que falta é o **motivo
  escrito** — acrescente o comentário e não duplique a regra.
- **A trava:** `src/lib/ci-passos.test.ts` (novo) — ver "Trava", abaixo.
- Documentação e versão: `CHANGELOG.md`, `src/lib/versoes/registry.ts`, `docs/DECISOES.md`,
  `docs/RELATORIO-F45.md`, `docs/PLAN-F45.md`, `docs/README.md` (índice), `docs/prompts/README.md`,
  e o `README.md` (Status + a decisão do portão com data, que é o que o §5/Risco manda).

## Fora — não toque
- **Banco.** Nenhuma migration, RPC, view ou policy. Os roteiros mudam de INSTRUMENTAÇÃO
  (contador, linha FIM, `_asserts`), **não de cenário**: se você mudar o que um roteiro afirma,
  diagnosticou errado. A última migration é a `0127` e ela continua sendo a última.
- **jsdom, `@testing-library/*`, `@vitejs/plugin-react`** e qualquer outra dependência nova
  (regra 3 / decisão 4). Se o render de componente não fechar sem elas, **não instale**: entregue o
  que fechar, e escreva a proposta de grau 2 como próximo passo no relatório.
- **Teste de componente com interação.** Nada de clique, evento, estado. `renderToStaticMarkup`
  produz HTML estático e é sobre ele que as três sementes afirmam.
- **Refatorar componente.** Se `Aviso`, `ConfirmacaoDigitada` ou `Pagina` estiverem difíceis de
  testar, o teste se adapta, não o componente. Achado vira backlog no relatório.
- **`vercel.json`.** O portão do GitHub já resolve: um commit reprovado não entra na `main`, e a
  Vercel nunca o vê. Mexer no deploy é outra fase.
- **As fases F46 em diante.** Trava de hash de migration, injetor de mutações, catálogos de
  segurança — nada disso é antecipado "já que estou aqui" (regra 3 do §4).
- **Os comentários-cicatriz do `ci.yml`.** Node 24, CLI 2.109.1, telemetria desligada, versão fixa
  da action: cada um documenta um CI quebrado por causa externa. Preserve.

# A trava — `src/lib/ci-passos.test.ts`
Ela nasce VERDE (é varredura de catálogo), então vem no mesmo commit, e a regra 4 do §4 é atendida
provando que ela SABE ficar vermelha (ver Verificação). Ela lê o YAML **como texto** e afirma:

1. Os passos existem no job `verificar`: `verificar:actions` aparece, e **depois** do passo de build.
2. Os scripts que os passos chamam existem no `package.json` (`verificar:actions`, `db:test`,
   `db:test:um`) — é assim que esse tipo de gate morre: alguém remove o passo para o CI ficar mais
   rápido, e ninguém percebe por seis meses.
3. `cancel-in-progress` **não** vale para `push` na `main`.
4. O passo dos roteiros chama `scripts/db/rodar-roteiros.sh`, e não um loop inline.
5. **Cobertura do runner:** todo `*.test.ts` e `*.test.tsx` do repositório está coberto por algum
   `include` de algum projeto do Vitest. Hoje `scripts/env-guard.ts`, `scripts/design/` e
   `scripts/termos/` estão fora — teste escrito ali nunca roda. Esta asserção é a que impede o
   buraco de voltar.

# Critérios de aceitação — autoverifique item a item
1. **Um commit que quebre um roteiro SQL não chega em produção.** Provado de ponta a ponta com um
   PR descartável (ver Verificação), não afirmado.
2. `verificar` e `banco` são *required status checks* na `main`, com *require pull request* e bypass
   na conta do Johnny. A configuração está **aplicada** (via `gh api`) ou, se o `gh` faltar/negar,
   está no relatório como comando pronto para colar + passo a passo do painel, e é a **única**
   pendência da fase.
3. `cancel-in-progress` continua valendo em PR e **não** vale mais em `push` na `main`.
4. `npm run verificar:actions` roda no CI, **depois** do build, e sai 0 na `main` de hoje.
5. `npm run db:test` roda na máquina do Johnny e **usa o mesmo script** que o CI chama.
   `npm run db:test:um supabase/tests/troca.sql` roda um só.
6. **Os 24 roteiros terminam com a linha `FIM <nome>: N asserções, M falhas`**, e o runner falha
   quando a linha não aparece. Prove com um roteiro deliberadamente abortado.
7. **Nenhum roteiro conta zero asserção.** Os 13 listados ganharam `v_ok`/`v_falhas`, e a soma de
   asserções de cada um dos 24 é > 0 na saída real.
8. `pg_temp.assert_zero_de` **recusa universo vazio** — com teste que prova a recusa, dentro de um
   roteiro, e a saída colada no relatório.
9. `npm run test` executa pelo menos um `.test.tsx`, os três testes-semente passam, e o projeto
   `puro` continua rodando **exatamente** o que rodava antes (mesmo conjunto de arquivos — compare a
   lista antes/depois e cole no relatório).
10. **As duas varreduras repo-wide continuam verdes**, com a escolha (a) ou (b) registrada em
    `docs/DECISOES.md`. `TETO_PALETA_CRUA` não subiu.
11. Os quatro comandos verdes: `lint`, `test`, `contraste`, `build`. E `npx tsc --noEmit` limpo.
12. **`docs/DECISOES.md` traz a ata do portão**, dizendo com todas as letras: da F46 em diante toda
    fase é PR com espera do job `banco`; o Johnny tem bypass; usá-lo é ato consciente; e a
    configuração é **fora do repositório** — nenhuma trava interna impede que alguém a desligue no
    painel. `README.md` registra a decisão com data (§5/Risco manda os dois lugares).
13. **Regra 8, os três passos:** `package.json` em **1.50.0** (é fase → MINOR), entrada no topo de
    `src/lib/versoes/registry.ts` (`versao`, `data`, `fase: 'F45'`, `titulo`, 2 a 6 `mudancas` em
    LINGUAGEM DE OPERADOR — há teste que recusa vocabulário de desenvolvedor; esta fase é invisível
    ao operador, então o texto fala do que ele ganha: "o sistema passou a barrar sozinho alterações
    que quebrariam a operação, antes de irem ao ar"), entrada no `CHANGELOG.md` na mesma data, tag
    anotada `v1.50.0` publicada.
14. **Rollout, nesta ORDEM, e a ordem importa:** merge na `main` → CI verde → tag → deploy no ar →
    **e só então** ligar a branch protection. Ligar antes tranca você do lado de fora.
15. **Repouso perfeito**, como a ficha exige: nada pela metade, nenhum roteiro em estado
    intermediário, nenhuma branch aberta. Se o projeto parar aqui por dois meses, o sistema fica com
    um CI que fecha e um rig de teste que ninguém é obrigado a usar.

# Verificação — rode de verdade

## Os quatro comandos
`npm run lint`, `npm run test`, `npm run contraste`, `npm run build` a cada incremento. Leia a
falha, corrija a CAUSA RAIZ, repita até passar. **Não desabilite, não pule, não delete teste, não
acrescente exceção à régua para ficar verde.** Ao final, os quatro limpos com a saída real guardada.

## A prova de que o portão FUNCIONA — é o critério nº 1, e é executável
Não basta ligar a proteção e dizer que ela está ligada. Depois do rollout:
1. Crie a branch `f45-prova-do-portao` com **uma alteração deliberadamente vermelha** num roteiro
   SQL (mude um valor esperado; é uma linha).
2. Abra PR dela para a `main`.
3. Espere o job `banco` marcar ✗ e **fotografe/cole a evidência de que o merge está bloqueado**
   (`gh pr view --json mergeable,mergeStateStatus` serve, e é texto).
4. **Feche o PR sem mergear e apague a branch.** Ela nunca toca a `main`.
5. Cole tudo no relatório. É esta sequência — e só ela — que autoriza escrever "o portão fecha".

## A prova de que a trava sabe ficar vermelha
`ci-passos.test.ts` nasce verde. Antes de aceitar, prove que ela reprova: remova temporariamente o
passo `verificar:actions` do YAML, rode `npm run test`, veja falhar, **desfaça**. Cole as duas
saídas. Idem para a asserção de cobertura do runner: crie um `scripts/design/descartavel.test.ts`
temporário, veja a trava acusar que ele não está coberto por projeto nenhum, apague. O mesmo vale
para o `assert_zero_de` sobre universo vazio.

## A prova do runner
Antes e depois: rode os 24 roteiros pelo caminho de hoje (o loop do YAML) e pelo caminho novo
(`npm run db:test`), e prove que o **conjunto de asserções é o mesmo** — mesma contagem, mesmos ✓.
Instrumentação não pode mudar o que o roteiro afirma. Se um roteiro passar a falhar depois do
contador, ele estava mentindo antes: trate como achado, conserte a instrumentação **ou** registre o
defeito real com evidência.

## A prova do render de componente
Primeiro um teste descartável que só renderiza `<div>oi</div>` e afirma a string — para separar
"o transform de JSX funciona" de "o componente renderiza". Só depois os três de verdade. Se o
transform NÃO funcionar sem plugin, **pare e pense antes de instalar nada**: `esbuild.jsx` na config
do Vitest é a saída sem dependência, e é ela que você deve tentar.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar, não
espere confirmação, não peça aval — as duas decisões do Johnny já estão neste prompt.

Régua: (1) a ficha da F45 no `docs/PLANO-MULTIEMPRESA.md` §5; (2) este prompt; (3) `CLAUDE.md` e as
convenções do repositório; (4) restando empate, a opção mais simples e reversível. Toda decisão
não-óbvia vai para `docs/DECISOES.md` (data · contexto · escolha · motivo).

**Três decisões que você VAI ter de registrar:**
- **onde moram os `.test.tsx`** e o que aconteceu com as duas varreduras repo-wide;
- **a ata do portão**, com a consequência mecânica (PR obrigatório da F46 em diante) e o bypass;
- **o formato da linha `FIM`** e do contador, porque os 24 roteiros passam a segui-lo e as fases
  seguintes vão escrever roteiro novo nesse molde.

Se a mesma falha persistir depois de ~3 tentativas, mude de abordagem e registre a troca. Bloqueio
real (`gh` ausente, token sem permissão de admin, Supabase CLI falhando por causa externa):
contorne se for seguro; senão siga com o resto e registre a pendência com o que falta para
resolver. **O job `banco` já caiu duas vezes por causa externa** — o próprio `ci.yml` registra.
Se ele falhar por rate limit ou telemetria, reexecute UMA vez e, persistindo, registre com a
evidência e siga.

**A credencial de admin do GitHub é o único "insumo físico" desta fase** — é a exceção que o
`CLAUDE.md` prevê. Tente `gh auth status`; se faltar permissão, **não insista e não improvise**:
deixe o comando `gh api` pronto no relatório, com o passo a passo do painel ao lado.

# Git e segurança
O `CLAUDE.md` autoriza commit direto na `main`, merge e deploy — é o modo autônomo do projeto, e
esta fase é a **última** que o usa assim. Trabalhe na branch `f45-portao` e mergeie quando o
checklist passar na sua autoverificação. Commits pequenos, frequentes, em **pt-BR** no estilo
conventional do repositório (`feat(f45): o loop dos roteiros sai do YAML e vira script`).

Proibidos, como sempre: push forçado, `git reset --hard`, `node_modules`, `.env*`, e dado real em
qualquer arquivo. A branch `f45-prova-do-portao` é descartável e **nunca** é mergeada.

Tag anotada `v1.50.0`, publicada com `git push origin v1.50.0`. **A branch protection é o ÚLTIMO
comando da fase**, depois do deploy — não antes.

# Como trabalhar
**Fase 0 — a linha de base, e ela é barata.** Rode os quatro comandos e os 24 roteiros como estão
hoje; guarde a saída. Confirme os 8 pontos do diagnóstico um a um. Prove o transform de JSX com o
teste descartável. Sem "antes", não há prova de que nada regrediu.

**Fase 1 — explorar em paralelo, com subagentes** (voltam só com resumo): (a) os 24 roteiros SQL —
qual a anatomia de cada um, quais já contam, onde entra a linha `FIM` sem mudar cenário, quais têm
asserção sobre conjunto potencialmente vazio; (b) as varreduras repo-wide — `consistencia.test.ts`,
`cores.test.ts`, `so-servidor.test.ts` e qualquer outra que ande por `src/**`, e o que cada uma faria
com um `.test.tsx`; (c) a API de branch protection do GitHub e o que o `gh` instalado consegue
fazer.

**Fase 2 — `docs/PLAN-F45.md` autossuficiente**: a ordem dos incrementos, o formato exato da linha
`FIM`, onde ficam os `.test.tsx`, o desenho do `rodar-roteiros.sh`, o que fica fora, e a verificação
de ponta a ponta no final. Ele sobrevive à compactação e é o gabarito da revisão adversarial.

**Fase 3 — implementar em incrementos testáveis, nesta ordem** (cada um fecha sozinho):
`rodar-roteiros.sh` + `_asserts.sql` → os 24 roteiros → `ci.yml` → `vitest.config.mts` + as três
sementes → `ci-passos.test.ts` → `.gitattributes` → documentação e versão.

**Fase 4 — revisão adversarial em contexto fresco**, contra o `PLAN-F45.md` e a ficha do §5: algum
roteiro mudou de CENÁRIO em vez de instrumentação? o projeto `puro` perdeu algum arquivo? a trava
reprova de verdade ou só existe? o `_asserts` recusa universo vazio mesmo? algum comentário-cicatriz
do `ci.yml` foi apagado? o portão está ligado com bypass, ou trancou o Johnny junto? Aponte apenas
lacunas de correção ou de requisito declarado — não preferência de estilo. Corrija e re-revise até
limpar.

**Fase 5 — rollout na ordem do critério 14**, e a prova do portão com o PR descartável **depois** de
tudo no ar.

# Relatório final
`docs/RELATORIO-F45.md`, em pt-BR, no molde dos relatórios desta casa (veja `RELATORIO-F44.md`):
- por que esta fase existe, em duas frases, e a confirmação (ou refutação) dos 8 pontos do
  diagnóstico, um a um;
- **a prova de ponta a ponta do portão**: o PR descartável, o ✗ do job `banco`, a evidência do merge
  bloqueado, e o fechamento do PR — com as saídas reais;
- a prova de que a trava sabe ficar vermelha, e a de que `assert_zero_de` recusa universo vazio;
- a tabela dos 24 roteiros: asserções antes × depois, e a prova de que nenhum cenário mudou;
- a lista de arquivos do projeto `puro` antes × depois, provando que nada saiu do runner;
- a decisão sobre onde moram os `.test.tsx` e o que aconteceu com as duas varreduras;
- as saídas REAIS e completas de `lint`, `test`, `contraste`, `build`, `tsc --noEmit`, e o resultado
  do CI;
- a configuração do portão: o comando `gh api` que você rodou (ou o que ficou pronto para o Johnny
  colar), com o estado final da proteção lido de volta pela API;
- o que mudou por arquivo e por quê; as decisões (aponte `docs/DECISOES.md`);
- pendências e dívidas com o custo declarado, e próximos passos — incluindo a **proposta de grau 2**
  do teste de componente (o que jsdom + Testing Library dariam, o que custam, e por que ficou para
  depois do piloto), e o aviso de que a proteção é configuração fora do repositório e nenhuma trava
  interna a defende.
**Evidência, não afirmação:** "o portão está fechado" sem o PR bloqueado colado não vale.
Termine a resposta final com um resumo de até 8 linhas em pt-BR.

# Idioma
Tudo em pt-BR — narrativa, plano, relatório, comentários e commits (convenção do `CLAUDE.md`).
Identificadores de domínio em português sem acento; utilitários e infra em inglês. Os `raise notice`
dos roteiros seguem o estilo que já existe lá.
```

---

## Como executar

### Pré-voo (10 minutos, uma vez)

A árvore **não está limpa** na escrita desta ordem — resolva antes de disparar:

```bash
cd C:\Users\victor.matusita\ti-wap-inventory-control
git status
# esperado hoje: docs/PLANO-MULTIEMPRESA.md como untracked,
#                docs/PLANO-PRODUTO-MULTIEMPRESA.md como deletado,
#                package-lock.json modificado
git add docs/PLANO-MULTIEMPRESA.md && git commit -m "docs: o plano de preparacao e virada multiempresa (F45-F73)"
```

⚠ **Decida o que fazer com `docs/PLANO-PRODUTO-MULTIEMPRESA.md` antes de rodar.** Ele está marcado
como deletado na árvore, mas a **decisão 1** do plano novo diz que ele passa a valer como *catálogo
de requisitos* e **ganha um cabeçalho na F59**. Se a exclusão foi intencional, a F59 precisa saber;
se foi acidental, `git restore` nele agora. Deixar assim faz a F59 procurar um arquivo que não
existe.

```bash
git pull
npm run lint && npm run test && npm run contraste && npm run build   # linha de base verde
npx supabase --version     # 2.109.1 — é a versão que o CI fixa
gh auth status             # PRECISA existir e ter admin no repo (decisão 1)
claude --version           # `auto` exige 2.1.83+
```

Abra `claude` interativo uma vez nesta pasta antes de sair de perto: o diálogo de confiança do
workspace só aparece em modo interativo e, pendente, trava a run.

> **Se `gh` não estiver instalado ou não tiver admin**, a run continua funcionando — ela só termina
> com o portão como pendência, e o comando pronto no relatório. Instalar antes é mais barato:
> `winget install GitHub.cli && gh auth login` (escopo `repo` + `admin:repo_hook`).

### Rodar

```bash
claude --model opus --permission-mode auto -n f45-portao
# cole o bloco do prompt inteiro e deixe rodando
```

Para não colidir com trabalho local na mesma pasta:
`claude --worktree f45-portao --model opus --permission-mode auto`.

Headless (extraia **só o bloco do prompt**, não o arquivo inteiro — o resto daqui é para você):

```bash
awk '/^```text$/{f=1;next} /^```$/{if(f)exit} f' \
  docs/prompts/F45-portao-e-piso-de-teste-ultracode.md > /tmp/f45-prompt.txt
claude -p "$(cat /tmp/f45-prompt.txt)" --model opus \
  --permission-mode auto --output-format json > run-f45.json 2>&1
jq -r '.result' run-f45.json
```

> **Modo de permissão:** `auto`, e não `dontAsk`. Esta fase roda `gh api`, `supabase start`,
> `psql`, `git push` e `npm` — uma allowlist que cobrisse tudo isso ficaria tão ampla que perderia
> a função. `auto` deixa o classificador decidir, e nada aqui é ação que ele bloqueie: não há push
> forçado, reset destrutivo nem deploy manual de produção (o deploy é a Vercel reagindo ao merge).
>
> **Custo:** run de porte médio — muita leitura de YAML e SQL, pouca iteração de desenho.
> `CLAUDE_CODE_SUBAGENT_MODEL` apontando para um Sonnet economiza nos três exploradores da Fase 1;
> **não** economize no revisor adversarial da Fase 4, que é onde o julgamento importa.

### Enquanto roda

```
/goal os 24 roteiros terminam com linha FIM e contador, npm run db:test roda local com o mesmo
script do CI, npm run test executa .test.tsx, e os quatro comandos passam
```

O `/goal` de propósito **não** menciona a branch protection: ela é o último passo e depende de
credencial externa, então prendê-la ao avaliador travaria a run num ponto que não é código.

Retomar depois: `claude --resume f45-portao`.

### Ao voltar

1. **Abra o PR descartável no GitHub** (ou o registro dele no relatório) e confira com os próprios
   olhos que o merge estava bloqueado. É a prova que só você pode validar — e é o critério nº 1.
2. Vá em *Settings → Branches → main* e confira: `verificar` e `banco` marcados como required,
   require PR ligado, e o **seu bypass funcionando**. Teste com um commit bobo direto na `main`:
   ele tem de passar por ser você, e falhar para qualquer outro.
3. Leia `docs/RELATORIO-F45.md` conferindo as **evidências** — em especial a tabela antes/depois dos
   24 roteiros e a lista de arquivos do projeto `puro`.
4. `npm run db:test` na sua máquina. Se ele não rodar aí, o principal ganho de ergonomia da fase não
   existe.
5. `git log --oneline` e `git diff v1.49.1..v1.50.0` para auditar o diff.
6. Veio errado? **Regra dos 2 strikes:** depois de duas correções falhas, não emende — peça um
   prompt novo com o aprendizado e rode em sessão limpa.

## Suposições que fiz

- **É fase, e é a F45** → versão **MINOR**: 1.49.1 → **1.50.0**, tag `v1.50.0`, pela regra 8. A
  entrada no `registry.ts` fala em linguagem de operador mesmo sendo fase invisível — o §4/7 do
  plano exige texto, nunca silêncio.
- **A ficha da F45 no `docs/PLANO-MULTIEMPRESA.md` §5 é a fonte da verdade do escopo**, e este
  prompt é a leitura dela contra o código de hoje. Onde os dois divergirem, vale a ficha.
- **Rollout até produção**, como em toda fase desde a F40: merge na `main`, tag publicada, deploy.
  A diferença é a ordem: a proteção é ligada **depois** de tudo no ar.
- **O `.gitattributes` já existe e já traz `* text=auto eol=lf`** — a ficha pede o arquivo "com o
  motivo escrito", então o que falta é o comentário, não a regra.
- **As duas armadilhas das varreduras repo-wide** (`consistencia.test.ts` e `cores.test.ts`) são
  minhas, não do plano — achei lendo o código. Se você preferir decidir você mesmo onde ficam os
  `.test.tsx`, é o único ponto do prompt que vale trocar por uma instrução direta antes de rodar.
- **A prova do portão com PR descartável** também é minha. A ficha diz "um commit que quebre um
  roteiro SQL não chega em produção" sem dizer como provar; sem essa sequência, "o portão fecha"
  seria afirmação, não evidência.
