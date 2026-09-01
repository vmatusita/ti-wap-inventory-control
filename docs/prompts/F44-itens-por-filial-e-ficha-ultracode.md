# F44 — `/itens` diz de qual filial é o número, e a ficha põe o equipamento antes dos itens

Ordem de serviço autônoma (ultracode), escrita em **01/09/2026**, com a `v1.48.0` no ar (F43,
entregue horas antes).

**Por que ela existe.** A F42 consertou a ESTRUTURA de `/itens`; a F43 consertou a LEITURA — trouxe
a filial para a linha, deu resumo à tela e explicação visível a cada número. O Johnny, olhando a
tela entregue, no mesmo dia:

> "na tela de itens preciso que adicione mais cores para facilitar visualização e tbm preciso que
> quando eu filtrar para filial que eu quero, aparecer direto na linha o total, em estoque, em uso e
> o que falta da filial que eu filtrei se for somente uma, e nao aparecer mais o total da ti (…)
> tbm quando vou abrir detalhes de um ativo, preciso que o historico de movimentacoes de itens seja
> mais discreto ou mude a ordem, ele é algo secundario e fica logo no topo, preciso dele mais
> discreto ou colapsavel, para que eu possa ver antes dados do ativo, termos e linha do tempo do
> ativo que é mais importante que os itens"

**O achado que muda a ordem de serviço inteira.** Os números da linha **já seguem o filtro** desde a
F42: `saldoDoRecorte` (`src/lib/itens/lista.ts`) devolve o consolidado quando não há recorte e a
**soma das filiais marcadas** quando há, e é ele que alimenta a tabela, a linha expansível, os
cartões e o CSV. O que o Johnny está lendo como "o total da TI" **não é o número — é a legenda**:
`NUMEROS_ITEM.total.curto` vale `"tudo que a TI possui"`, e essa frase é renderizada **visível**
sob o cabeçalho da coluna (`CabecalhoDeNumero`) e sob o cartão de métrica (`ResumoDeItens`). Com uma
filial filtrada, a tela mostra o número **daquela filial** com a legenda **"tudo que a TI possui"**
embaixo. A tela mente sobre o próprio escopo — e o operador acredita na legenda, não na fórmula.

Isto é uma ordem de **legenda, cor e ordem de leitura**. Se o agente se pegar reescrevendo
`saldoDoRecorte`, ele parou de fazer a F44.

**As três decisões do Johnny, tomadas em 01/09/2026:**

1. **Cor:** *cada número tem a sua* (Em estoque, Em uso, Falta, Total) **+ zebrado e separadores
   mais fortes**. Ele recusou explicitamente mapa de calor por quantidade e chip colorido por
   grupo/tipo.
2. **"Repor" passa a seguir o filtro** — com uma filial filtrada, o aviso âmbar e o cartão *A repor*
   acendem pelo estoque **daquela** filial. Isto **revoga** a decisão dele de 22/07/2026 ("o mínimo
   compara com o consolidado, nunca com o saldo de uma filial"), e a revogação tem de ser registrada
   como revisão, com o efeito colateral dito com todas as letras.
3. **Ficha do ativo:** *Itens que foram junto* **e** *Pendências de item faltante* descem para depois
   da linha do tempo e ficam **recolhidos**, com a contagem no título.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Fazer a tela `/itens` do Estoque TI WAP **dizer de qual filial são os números que ela está
mostrando** — hoje ela mostra o número certo com a legenda errada — e dar a cada número uma cor
própria; e fazer a ficha do ativo (`/ativos/[id]`) mostrar **primeiro o equipamento** (dados,
termos, linha do tempo) e só depois os blocos de item, recolhidos. Ao final: as duas telas
entregues, prova visual fotografada e aprovada no teste dos 5 segundos, `lint`/`test`/`contraste`/
`build` verdes, CI verde, versão **1.49.0** publicada com tag `v1.49.0`, merge na `main`, deploy no
ar e smoke reexecutado. **Sem migration, sem dependência nova, sem mudar regra de negócio,
permissão, rota ou o nome dos cinco números.**

# Contexto

## Leia antes de escrever qualquer código
- `@CLAUDE.md` manda em tudo: modo autônomo, as 8 regras permanentes (a **regra 2** — nunca dado
  real, nem em screenshot — decide como você fotografa; a **regra 3** — custo R$ 0, stack fechada;
  a **regra 8** — versão, e ela não se reinterpreta), a stack, o modelo de acesso e as convenções.
- `@docs/RELATORIO-F43.md`: o que a fase de ontem entregou e **a tabela recurso-a-recurso — ela é o
  seu gabarito de não-regressão**. Nada que está lá pode sumir aqui.
- `@docs/PLAN-F43.md`: as variantes de desenho medidas, a que venceu e por quê. Você está mexendo
  na tela que esse plano acabou de desenhar — não desfaça por gosto o que foi escolhido por
  evidência.
- `@docs/PLANO-DESIGN-SYSTEM.md` §§3–4 e `src/lib/layout/consistencia.test.ts` (a régua executável).
  Nenhuma regra dela pode passar a valer menos por causa desta fase, e nenhum arquivo novo entra na
  lista de PENDENTES.
- `@docs/PLANO-ITENS.md` (as dores medidas de `/itens`) e `@docs/BACKLOG-UX.md`.

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
Medido na `v1.48.0` em 01/09/2026. Ele é o que separa esta ordem de uma reescrita inútil.

1. **OS NÚMEROS DA LINHA JÁ SEGUEM O FILTRO. Não os reimplemente.** `saldoDoRecorte`
   (`src/lib/itens/lista.ts`) devolve `consolidado` quando `filialIds` está vazio e a **soma célula
   a célula das filiais marcadas** quando não está; `montarLinhasDeItem` põe isso em `linha.saldo`,
   e a tabela, a linha expansível, os cartões (`resumoDaLista`) e o CSV
   (`exportarItensSaldosCSV` → `saldoDoRecorte`) leem todos daí. Uma filial filtrada já mostra
   Total/Em estoque/Em uso/Falta **daquela filial**; duas filiais já mostram a **soma das duas**,
   com uma coluna por filial ao lado. **Prove isso antes de tocar em qualquer coisa** (teste,
   prévia estática ou `console.log` num script) e registre a prova no relatório — se o
   comportamento divergir do que este parágrafo afirma, PARE e trate a divergência como o defeito
   número 1 da fase.
2. **O QUE MENTE É A LEGENDA.** `NUMEROS_ITEM` (`src/lib/ajuda/conteudo/itens-por-quantidade.ts`)
   traz `total.curto = 'tudo que a TI possui'` e
   `total.explicacao = 'Tudo que a TI possui daquele item (o patrimônio do almoxarifado).'`.
   O `curto` é renderizado **visível** sob o cabeçalho da coluna (`CabecalhoDeNumero`, a partir de
   `sm`) e sob o cartão de métrica (`ResumoDeItens`, prop `apoio`); a `explicacao` é a dica. Com
   `?filial=3` a tela escreve "tudo que a TI possui" embaixo de um número que é de uma filial só.
   **É esta frase que o Johnny quer que pare de aparecer.**
3. **O aviso "repor" é global de verdade.** `BadgeRepor` recebe `estoqueConsolidado=
   linha.consolidado.estoque` e a dica diz "estoque de todas as filiais"; `resumoDaLista` conta
   `aRepor` comparando `l.consolidado.estoque` com o mínimo do item. Com uma filial filtrada, é o
   único número da tela que continua sendo da TI inteira — e ele não diz isso na superfície.
4. **Com EXATAMENTE UMA filial marcada, a matriz vira uma coluna redundante.** `filiaisVisiveis`
   fica com um elemento, e essa coluna repete, com outro rótulo, o mesmo número que a coluna
   *Em estoque* da linha já mostra. Duas colunas com o mesmo número em telas de 1440px é ruído, e
   pior: sugere que uma delas é outra coisa.
5. **A ficha do ativo abre pelos itens.** Em `src/app/(app)/ativos/[id]/page.tsx`,
   `<ItensQueForamJunto>` e `<PendenciasItemFicha>` são renderizados **antes** do card
   "Dados do ativo", de `<TermosDaFicha>` e da `<SecaoDaPagina titulo="Linha do tempo">`. Quem abre
   a ficha de um notebook vê primeiro a lista de acessórios que saíram junto.

## As três decisões do Johnny (01/09/2026) — elas mandam, não são sugestão
1. **Cor: cada número tem a sua** — *Em estoque*, *Em uso*, *Falta* e *Total*. Mais **zebrado e
   separadores mais fortes** para o olho não se perder na horizontal. Ele **recusou** mapa de calor
   por quantidade nas colunas de filial e **recusou** chip colorido por grupo/tipo: não faça nem um
   nem outro.
2. **"Repor" segue o filtro.** Com recorte de filial, o selo âmbar e o cartão *A repor* passam a
   comparar o mínimo do item com o **estoque do recorte**. Sem recorte, nada muda (continua o
   consolidado). Isto **revoga parcialmente** a decisão dele de 22/07/2026 e tem um efeito colateral
   real que era justamente o que aquela decisão evitava: **pode mandar repor o que está sobrando na
   filial ao lado**. Implemente como ele pediu E torne o escopo explícito na superfície (o selo e a
   dica dizem contra o que estão comparando); registre a revisão em `docs/DECISOES.md` nomeando o
   efeito colateral.
3. **Ficha: os dois blocos descem e ficam recolhidos**, com a contagem no título
   (ex.: "Itens que foram junto (3)"), depois da linha do tempo.
   ⚠ **Pendência ABERTA recolhida é um alarme escondido** — ele escolheu isso sabendo, então o
   fechado tem de CARREGAR o alarme: contagem de abertas no título e a mesma tinta de atenção que o
   bloco já usa, para ninguém perder uma pendência por ela ter descido. Se, medindo, você concluir
   que o recolhido esconde a pendência aberta, **não desobedeça**: entregue como pedido, registre a
   medição e leve a ressalva ao relatório como próximo passo sugerido.

## A cor — o produto já tem uma língua, use a mesma
`src/app/globals.css` já define os tokens de selo dos ESTADOS do ativo, com o contraste medido no
comentário de cada um: `--selo-em-estoque` (verde) e `--selo-em-uso` (azul) são as cores com que o
produto inteiro já diz **"em estoque"** e **"em uso"** na tela de ativos. As colunas de item se
chamam exatamente igual. **Use a mesma família de matiz**, para verde e azul quererem dizer a mesma
coisa nas duas telas — inventar um segundo verde para o mesmo conceito é criar dialeto.

Travas que valem aqui, e não se afrouxam:
- **Nada de paleta crua.** `src/lib/dominio/cores.test.ts` guarda `TETO_PALETA_CRUA = 473`, uma
  catraca que **só desce** — e se o total DESCER, o teto desce junto **no mesmo commit** (o teste
  cobra os dois lados). Cor nova entra como token em `globals.css` com apelido `--color-*`, como os
  `--selo-*` já fazem, e é usada por classe (`bg-…`/`text-…`), nunca `bg-green-100` à mão.
- **Todo par novo entra em `scripts/contraste.mjs` com `exigir: true`** e passa **AA nos dois
  temas**. `npm run contraste` sai com código 1 se reprovar.
- **Nada essencial codificado só por cor** — número e rótulo continuam ao lado da cor, sempre. A
  cor é reforço, não é o dado.
- **Uma cor por número, nos TRÊS lugares**: o cartão de resumo, o cabeçalho da coluna e a célula. Se
  *Em estoque* é verde, é verde nos três — cor que muda de lugar não vira vocabulário.
- Zebrado tem de conviver com a **linha expansível** (a linha de detalhe não pode ser listrada como
  se fosse outro item), com o `hover`, com a seleção de tema e com `print:` — confira os quatro.

## A prova visual JÁ TEM FERRAMENTA — reuse, não reinvente
A F43 construiu a prévia estática, e ela renderiza o **componente real** com dados 100% fictícios:
`scripts/design/previa-itens.tsx`, `previa-itens-dados.ts`, `previa-itens-variantes.tsx`,
`vazio-servidor.ts`, `tsconfig.previa.json`, mais `scripts/design/capturar.mjs` (Playwright, recusa
fotografar produção — regra 2) e `medir-tabela.mjs`. Evidências da fase anterior em
`docs/f43-evidencias/` (antes/depois/variantes + `teste-5-segundos.json`) — leia o formato e o siga.

O que **falta** e você precisa acrescentar:
- **cenários de RECORTE** na prévia: sem filtro, **uma** filial marcada e **três** filiais marcadas.
  Hoje a prévia só fotografa a tela sem recorte, que é justamente o caso em que a legenda não mente.
- **uma prévia da FICHA** do ativo (`previa-ficha.tsx`, no mesmo molde) com dados fictícios, ou, se
  não fechar em tempo razoável, o teste dos 5 segundos rodado sobre o **HTML** da ficha — e então a
  limitação declarada com todas as letras no relatório.

Dados **100% fictícios**, sem exceção (regra 2): `WAP0001234`, "Fulano", filiais inventadas. Cubra
item com saldo em uma filial só, item espalhado, item zerado, item com "repor", item com "faltam N",
item com `foraDasFiliais > 0`, nome comprido que trunca, catálogo com 40+ linhas.

## O padrão da casa
`/ativos` continua o piloto do design system. O casco vive em `src/components/layout/pagina.tsx`
(`Pagina`, `CabecalhoDaPagina`, `SecaoDaPagina`), `quadro-de-tabela.tsx`, `cartao-de-metrica.tsx`,
`estado-vazio.tsx`, `aviso.tsx`. Para recolher: **não existe `Collapsible` em
`src/components/ui/`** e a regra 3 proíbe instalá-lo — resolva com `<details>/<summary>` (fica
Server Component, que é o que os dois blocos da ficha são hoje) ou com
`BotaoExpandir`/`useExpandidas` de `src/components/relatorios/linha-expansivel.tsx`, que é client e
já é infraestrutura compartilhada. Escolha pelo custo de virar a ficha em client, não por gosto, e
registre.

## Comandos
`npm run lint` · `npm run test` · `npm run contraste` · `npm run build`. CI em
`.github/workflows/ci.yml` roda os quatro. Smoke de produção: `node scripts/smoke/smoke-prod.mjs`
(leia `scripts/smoke/README.md` antes).

# Escopo

## Dentro
- `src/app/(app)/itens/page.tsx` e o `loading.tsx` do segmento.
- `src/components/itens/`: `itens-table.tsx`, `cabecalho-de-numero.tsx`, `resumo-de-itens.tsx`,
  `badge-repor.tsx`, `identidade-do-item.tsx` e os componentes novos que o desenho pedir.
- `src/lib/itens/lista.ts` e `distribuicao.ts`: **funções puras novas** para a legenda com escopo e
  para a regra do "repor" recortado — com teste Vitest, como tudo em `lib/`.
- `src/app/(app)/ativos/[id]/page.tsx`, `src/components/ativos/itens-que-foram-junto.tsx` e
  `pendencias-item-ficha.tsx`.
- Tokens de cor novos em `src/app/globals.css` + os pares novos em `scripts/contraste.mjs`.
- Prévia e evidências: `scripts/design/` e `docs/f44-evidencias/`.
- Documentação e versão: `CHANGELOG.md`, `src/lib/versoes/registry.ts`, `package.json`,
  `docs/DECISOES.md`, `docs/RELATORIO-F44.md`, `docs/PLAN-F44.md`, status no `README.md`, e o
  `docs/README.md` (índice) para todo documento novo.
- A página de ajuda `itens-por-quantidade` **só** se alguma frase dela ficar falsa — e, se a regra
  do "repor" muda, ela provavelmente fica: a ajuda descreve o aviso comparando com todas as filiais.

## Fora — não toque
- **Banco.** Nenhuma migration, RPC, view ou policy. Todos os números já existem.
- **`saldoDoRecorte` e a aritmética do recorte.** Ela está certa; o defeito é de legenda. Mexer nela
  é sinal de que você diagnosticou errado.
- **O nome dos cinco números.** *Total*, *Em estoque*, *Em uso*, *Falta*, *Reservado* continuam com
  esses nomes (decisão do Johnny na F43, não revogada). `NUMEROS_ITEM` continua a **fonte única** dos
  rótulos — e é fonte compartilhada com a página de ajuda, então **não troque o texto de lá por um
  texto de escopo**: a ajuda descreve o significado sem filtro e tem de continuar descrevendo.
  A legenda com escopo se **deriva** de `NUMEROS_ITEM` numa função pura testada, e desce por prop.
- **As colunas do CSV de saldos**: nome, ordem e conteúdo iguais. O CSV já usa `saldoDoRecorte` e
  continua batendo com a tela — prove que continua.
- **O `?visao=` não ressuscita**, e nenhuma preferência, alternador ou param novo de URL nasce nesta
  fase. Os filtros são os que existem (`q`, `grupo`, `filial`, `page`, `pp`).
- **Telas irmãs:** `/itens/historico`, `/itens/conferencia`, `/admin/**`, os diálogos de lançar e
  transferir, os relatórios, a home. O que você achar de errado lá vira backlog no relatório
  (regra 1), não commit.
- **`src/components/ui/`** (shadcn) e **nenhuma dependência nova** (regra 3).
- Nenhum arquivo novo na lista de PENDENTES de `consistencia.test.ts`.

# Critérios de aceitação — autoverifique item a item

1. **Com UMA filial filtrada, nenhuma frase da tela afirma escopo de TI.** Varra a tela renderizada
   (cabeçalhos, cartões, dicas, subtítulo, estados vazios) e prove no relatório que a string
   "tudo que a TI possui" — e qualquer equivalente — não aparece quando há recorte.
2. **A tela NOMEIA o escopo.** Com uma filial, ela diz qual é; com mais de uma, diz que é a soma das
   marcadas. O teste dos 5 segundos (pergunta **a**, abaixo) é quem decide se ela conseguiu.
3. **Com mais de uma filial, o comportamento de hoje permanece**: os números da linha somam as
   marcadas e a coluna por filial (em estoque) continua ao lado, como na F43.
4. **Com exatamente uma filial, a coluna redundante da matriz não fica repetindo o mesmo número.**
   Decida por evidência o que fazer (esconder a matriz e nomear a filial na linha é o candidato
   óbvio), fotografe as duas opções se houver dúvida, e registre a escolha.
5. **"Repor" segue o filtro** e o **diz na superfície**: o selo e a dica deixam claro contra qual
   estoque estão comparando. Sem recorte, o comportamento é exatamente o de hoje. O cartão
   *A repor* conta pela mesma regra do selo — os dois nunca discordam.
6. **Cada número tem cor própria, e a mesma nos três lugares** (cartão, cabeçalho, célula), na
   família de matiz dos `--selo-*` que o produto já usa para "em estoque" e "em uso". Zebrado e
   separadores entregues, convivendo com a linha expansível, o hover, os dois temas e o `print:`.
7. **Todo par de cor novo mede AA** em `npm run contraste`, com `exigir: true`, nos dois temas. A
   catraca `TETO_PALETA_CRUA` não subiu — e se desceu, desceu junto no mesmo commit.
8. **A ficha do ativo mostra o equipamento primeiro**: Dados → Termos → Linha do tempo, e só depois
   os dois blocos de item, recolhidos, com contagem no título. A pendência ABERTA continua
   perceptível no estado fechado (contagem + tinta de atenção).
9. **Nada regrediu.** Tabela recurso-a-recurso no molde do `RELATORIO-F43.md`, cobrindo no mínimo:
   os três filtros, paginação e seletor de tamanho, ordenação, export CSV, "Lançar quantidade",
   "Ver histórico deste item", "Transferir", "Conferir estoque", o selo "faltam N",
   `foraDasFiliais`, o aviso de reservado, os TRÊS estados vazios, `RealtimeRefresh`, a linha
   expansível, o botão "Ver as N filiais" do celular, o comportamento por cargo (consulta não vê o
   menu de ações; operador de uma filial só) — e, na ficha: resolver e reabrir pendência, os termos,
   a linha do tempo, o histórico do ativo substituído, o estorno e as ações de exceção.
10. **Acessibilidade:** alvo de toque ≥ 40px no celular; `aria-label` em todo controle novo;
    `aria-expanded` correto nos blocos recolhíveis da ficha; nada essencial só na `Dica`; o nome
    acessível de todo botão **começa pelo texto visível** (WCAG 2.5.3 — foi exatamente o conserto
    do último commit da F43).
11. **`loading.tsx` espelha o layout novo** das duas rotas (mesma variante de casco, mesmo esqueleto
    de blocos), para não haver salto na navegação.
12. **Os quatro comandos verdes** e os jobs do CI verdes, `consistencia.test.ts` sem exceção nova.
    ⚠ O job `banco` já caiu duas vezes por causa EXTERNA (o próprio `ci.yml` registra). Esta fase não
    toca banco: se ele falhar por causa externa, reexecute UMA vez e, persistindo, registre com a
    evidência e siga — não conserte CI nesta ordem.
13. **Regra 8 do CLAUDE.md, os três passos:** `package.json` em **1.49.0** (é fase → MINOR), entrada
    nova no topo de `src/lib/versoes/registry.ts` (`versao`, `data`, `fase: 'F44'`, `titulo`, 2 a 6
    `mudancas` em LINGUAGEM DE OPERADOR — há teste que recusa vocabulário de desenvolvedor), entrada
    no `CHANGELOG.md` na mesma data, tag anotada `v1.49.0` publicada.
14. **Rollout:** merge na `main`, CI verde, deploy no ar, smoke reexecutado com a saída colada.

# Verificação — rode de verdade

## Os quatro comandos
Rode `npm run lint`, `npm run test`, `npm run contraste` e `npm run build` a cada incremento; leia a
falha, corrija a CAUSA RAIZ e repita até passar. Não desabilite, não pule, não delete teste, não
acrescente exceção à régua para ficar verde. Ao final, os quatro limpos, com a saída real guardada.

## A prova de que o número já seguia o filtro (faça primeiro, é barata)
Antes de qualquer desenho: prove por teste ou script que, com `filialIds = [X]`, `linha.saldo` é
igual a `porFilial[X]` nos quatro números, e que com `[X, Y]` é a soma célula a célula. Cole a saída
no relatório. É esta prova que autoriza a fase a ser sobre legenda e cor — e é ela que denuncia, se
for o caso, que o diagnóstico estava errado e o defeito é outro.

## O teste dos 5 segundos — o critério de aceite principal
Mesmo protocolo da F43 (`docs/f43-evidencias/*/teste-5-segundos.json` é o formato). Fotografe com
Playwright em **1440×900 e 390×844**, **tema claro e escuro**, nos **três recortes** (sem filtro,
uma filial, três filiais) e na **ficha do ativo**.

1. Você mesmo abre o PNG (Read na imagem) e julga.
2. Depois entregue **a mesma imagem** a um subagente em CONTEXTO FRESCO, que não viu o código, nem
   este prompt, nem o desenho pretendido. Dê a ele só a imagem e as perguntas.

**Na tela de itens, com UMA filial filtrada:**
- **a.** Os números desta tela são de qual filial, ou de todas?  *(a pergunta da fase — reprova
  sozinha)*
- **b.** Quais itens precisam ser repostos agora, e comparados com o quê?
- **c.** Do item *<escolha um da imagem>*: quanto está na prateleira e quanto está com as pessoas?
- **d.** *(diagnóstica, não bloqueia)* Alguma cor da tela te deixa em dúvida sobre o que ela quer
  dizer? Qual, e por quê?

**Na tela de itens, com TRÊS filiais filtradas:**
- **a.** O número grande "Em estoque" se refere a quê — a uma filial, a algumas, ou a tudo?
- **b.** Onde você vê quanto tem em cada uma das filiais?

**Na ficha do ativo:**
- **a.** O que esta tela mostra primeiro sobre este equipamento?
- **b.** Este equipamento tem alguma pendência de item em aberto? Como você sabe?
- **c.** Onde estão os acessórios que saíram junto com ele?

Instrua o subagente: *"responda só olhando a imagem; se não tiver certeza ou precisar de mais que
alguns segundos, responda NÃO SEI."* Não dê a ele a resposta esperada nem o que o desenho pretende.

3. **A régua, assimétrica de propósito:** uma reprovação vale de imediato — errou ou hesitou, o
   desenho falhou. Para declarar uma pergunta APROVADA, ela passa em **duas rodadas independentes,
   com subagentes diferentes**.
4. Falhou → mude o **DESENHO**. Nunca a pergunta, nunca o dado da prévia, nunca o enunciado.
5. **Condição de parada:** se depois de **três desenhos diferentes** a mesma pergunta continuar
   reprovando, pare de iterar nela, escolha o melhor desenho medido, declare a pergunta como NÃO
   ATENDIDA no relatório — com as três tentativas, as respostas literais e sua hipótese do porquê —
   e **siga para o rollout**. O que é proibido em qualquer hipótese é maquiar o teste para dar verde.
6. **Rode o mesmo protocolo na LINHA DE BASE** (a `v1.48.0` como está, nos três recortes, e a ficha
   de hoje) **antes** de tocar nos componentes. Sem "antes", não há prova de melhora.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar, não
espere confirmação, não peça aval de desenho — as três decisões do Johnny já estão neste prompt.

Régua: (1) este prompt; (2) `CLAUDE.md` e as convenções do repositório; (3) o que a prova visual
mostrar — desenho se decide por evidência, não por gosto; (4) restando empate, a opção mais simples
e reversível. Toda decisão não-óbvia vai para `docs/DECISOES.md` (data · contexto · escolha · motivo).

**Três decisões que você VAI ter de registrar, porque revisam decisão anterior:**
- **o "repor" recortado revoga a decisão de 22/07/2026** — registre como REVISÃO, dizendo o que
  muda, o que permanece (sem filtro nada muda) e o efeito colateral que a decisão antiga evitava;
- **a legenda com escopo** convive com o congelamento de vocabulário da F43 — registre que os NOMES
  não mudaram e que o que passou a variar é a frase de apoio;
- **a ordem da ficha** revisa a escolha da F18/F38 de pôr os blocos de item no topo — registre por
  que o equipamento vem primeiro.

Se a mesma falha persistir depois de ~3 tentativas, mude de abordagem e registre a troca. Bloqueio
real (download de browser recusado, rede indisponível, deploy fora do ar): contorne se for seguro;
senão siga com o resto e registre a pendência com o que falta para resolver. Se o push na `main` ou
o deploy for barrado pelo ambiente, **não insista**: deixe a branch pronta, a tag criada localmente
e diga isso no relatório.

# Git e segurança
O `CLAUDE.md` autoriza commit direto na `main`, merge e deploy — é o modo autônomo do projeto. Ainda
assim, trabalhe na branch `f44-itens-por-filial` e mergeie quando o checklist passar na sua
autoverificação. Commits pequenos, frequentes, em **pt-BR** no estilo conventional do repositório
(`feat(f44): a legenda diz de qual filial é o número`). Proibidos, como sempre: push forçado,
`node_modules`, `.env*` e dado real em qualquer arquivo — **inclusive nas imagens de evidência**.
Tag anotada `v1.49.0`, publicada com `git push origin v1.49.0`.

# Como trabalhar
Fase 0 — **a prova barata e a linha de base**: prove que `saldoDoRecorte` já recorta (acima);
estenda a prévia da F43 com os três cenários de recorte e crie a da ficha; fotografe a `v1.48.0`
como está e rode o teste dos 5 segundos nela. Guarde as respostas: é contra elas que a melhora
será medida.
Fase 1 — **explorar em paralelo, com subagentes** (voltam só com resumo): (a) todo lugar que afirma
escopo na tela de itens — legendas, dicas, subtítulo, estados vazios, CSV; (b) as travas que vão
brigar com a cor — `cores.test.ts`, `contraste.mjs`, `consistencia.test.ts`, e os tokens `--selo-*`
que já existem; (c) a ficha do ativo recurso a recurso, quem é Server e quem é Client, e o custo de
recolher cada bloco.
Fase 2 — **`docs/PLAN-F44.md` autossuficiente**: as variantes candidatas, o gabarito
recurso-a-recurso das duas telas, o que fica fora, e a verificação de ponta a ponta no final.
Fase 3 — **duas ou três variantes de desenho da tela de itens, em paralelo**, cada uma fotografada e
submetida ao teste dos 5 segundos. Escolha por EVIDÊNCIA; registre a escolhida e as recusadas.
Fase 4 — **implementar** em incrementos testáveis, com os quatro comandos a cada um. A ficha é
independente da tela de itens: pode ir em paralelo, e vale entregá-la cedo, porque é a mudança mais
simples e a que tem menos risco de iterar.
Fase 5 — **revisão adversarial em contexto fresco**, contra o `PLAN-F44.md` e o gabarito: que
recurso sumiu? o que regrediu em 390px? o que virou cor sem rótulo? o que quebrou por cargo? alguma
frase da tela ainda afirma escopo de TI sob recorte? a pendência aberta continua perceptível
fechada? a ajuda ficou falsa? Aponte apenas lacunas de correção, requisito declarado ou
acessibilidade — não preferência de estilo. Corrija e re-revise até limpar.
Fase 6 — versão 1.49.0, merge, CI, deploy, smoke, relatório.

# Relatório final
`docs/RELATORIO-F44.md`, em pt-BR, no molde dos relatórios desta casa:
- o pedido do Johnny, literal, e o achado que o traduziu (o número já seguia o filtro; a legenda não);
- a prova de que `saldoDoRecorte` já recortava, com a saída real;
- antes × depois com as IMAGENS, nos três recortes e na ficha, e as respostas literais do teste dos
  5 segundos nas duas pontas;
- a tabela de contraste dos pares novos e o que aconteceu com a catraca da cor crua;
- a tabela recurso-a-recurso provando que nada da F43 (nem da ficha) sumiu;
- as saídas REAIS e completas de `lint`, `test`, `contraste` e `build`, e o resultado do CI;
- o que mudou por arquivo e por quê; as decisões (aponte `docs/DECISOES.md`), com as três revisões;
- o smoke pós-deploy;
- pendências e dívidas com o custo declarado, e próximos passos sugeridos — inclusive a ressalva
  sobre "repor" recortado poder mandar comprar o que sobra na filial ao lado.
**Evidência, não afirmação:** "ficou claro" sem a imagem e sem as respostas do subagente não vale.
Termine a resposta final com um resumo de até 8 linhas em pt-BR.

# Idioma
Tudo em pt-BR — narrativa, plano, relatório, comentários, mensagens de tela e commits (convenção do
`CLAUDE.md`). Identificadores de domínio em português sem acento; utilitários e infra em inglês.
```

---

## Como executar

### Pré-voo (5 minutos, uma vez)

```bash
cd C:\Users\victor.matusita\ti-wap-inventory-control
git status                 # árvore limpa (estava, na escrita desta ordem)
git pull                   # main em dia — a F43 acabou de entrar
npm run lint && npm run test && npm run contraste && npm run build   # linha de base verde
npx playwright install chromium    # se ainda não baixou; sem isso não há foto
claude --version           # `auto` exige 2.1.83+
```

Abra `claude` interativo uma vez nesta pasta antes de sair de perto: o diálogo de confiança do
workspace só aparece em modo interativo e, pendente, trava a run.

### Rodar

```bash
claude --model opus --permission-mode auto -n f44-itens
# cole o bloco do prompt inteiro e deixe rodando
```

Para não colidir com trabalho local na mesma pasta:
`claude --worktree f44-itens --model opus --permission-mode auto`.

Headless (extraia **só o bloco do prompt**, não o arquivo inteiro — o resto daqui é para você):

```bash
awk '/^```text$/{f=1;next} /^```$/{if(f)exit} f' \
  docs/prompts/F44-itens-por-filial-e-ficha-ultracode.md > /tmp/f44-prompt.txt
claude -p "$(cat /tmp/f44-prompt.txt)" --model opus \
  --permission-mode auto --output-format json > run-f44.json 2>&1
jq -r '.result' run-f44.json
```

> Custo: esta run é **mais barata que a F43** — a prévia estática e o `capturar.mjs` já existem, e
> boa parte da fase é legenda e token de cor. `CLAUDE_CODE_SUBAGENT_MODEL` apontando para um Sonnet
> economiza nos exploradores; **não** economize no subagente do teste dos 5 segundos, que é onde o
> julgamento importa.

### Enquanto roda

```
/goal com uma filial filtrada, nenhuma frase de /itens afirma escopo de TI, o "repor" segue o
filtro, e os quatro comandos passam
```

Retomar depois: `claude --resume f44-itens`.

### Ao voltar

1. Abra as imagens de `docs/f44-evidencias/` — antes e depois, os três recortes e a ficha. É a
   revisão que só você pode fazer.
2. Leia `docs/RELATORIO-F44.md` conferindo as **evidências** (saídas reais, não afirmações) — em
   especial a prova de que o número já seguia o filtro e a tabela de contraste.
3. `git log --oneline` e `git diff v1.48.0..v1.49.0 -- src/` para auditar o diff.
4. Abra `/itens?filial=<uma>` e `/itens` sem filtro em produção, no celular e no desktop, e uma
   ficha de ativo que tenha pendência de item aberta.
5. Veio errado? **Regra dos 2 strikes:** depois de duas correções falhas, não emende — peça um
   prompt novo com o aprendizado e rode em sessão limpa.

## Suposições que fiz

- **É fase, e é a F44** → versão **MINOR**: 1.48.0 → **1.49.0**, tag `v1.49.0`, pela regra 8. Se
  preferir tratar como ajuste avulso, troque para 1.48.1 (PATCH) e tire o `fase` do registry.
- **Rollout até produção**, como em toda fase desde a F40: merge na `main`, tag publicada, deploy e
  smoke.
- **"histórico de movimentações de itens" na ficha = os dois blocos do topo** — *Itens que foram
  junto* e *Pendências de item faltante*. É o que está antes dos dados do ativo hoje; a linha do
  tempo em si não é tocada.
- **O escopo são duas telas:** a lista `/itens` e a ficha `/ativos/[id]`. Histórico de itens,
  conferência, `/admin/**` e os diálogos ficam de fora — o que aparecer de lá vai para o backlog.
- **Os nomes dos números continuam congelados** (sua decisão na F43): o que passa a variar com o
  filtro é a frase de apoio embaixo do número, não o nome dele.
- **A coluna redundante quando você filtra uma filial só** é tratada como parte do pedido (você
  disse "se for somente uma… aparecer direto na linha"), com a decisão final medida pelo agente.
