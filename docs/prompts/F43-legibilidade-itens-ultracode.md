# F43 — `/itens` legível ao bater o olho: a filial vem para a linha

Ordem de serviço autônoma (ultracode), escrita em **01/09/2026**, com a `v1.47.2` no ar.

**Por que ela existe.** A F42 (31/08/2026) consertou a ESTRUTURA de `/itens` — matou o `?visao=`,
pôs a tela no casco da F40, deu rota própria ao histórico. Resolveu a dor D3 do
[`docs/PLANO-ITENS.md`](../PLANO-ITENS.md), que era *"a view de itens foge totalmente do padrão do
sistema"*. **Não resolveu a legibilidade.** O Johnny, olhando a tela entregue, em 01/09/2026:

> "ainda está mto confusa e a visualização não está boa, não consigo entender de cara o que é cada
> coisa, tem que ser algo que entenda logo ao bater o olho"

Perguntado sobre **o que a tela tem de responder em 5 segundos**, sem tooltip e sem contar coluna,
ele escolheu UMA coisa: **onde está o item — quanto tem em cada filial.** Hoje essa é justamente a
informação que está atrás do chevron, um item por vez.

**As três decisões dele, tomadas em 01/09/2026:**

1. **Liberdade de redesenho visual completo** — pode reorganizar a tela (cartões de resumo,
   agrupamento, hierarquia de números, cor semântica, ícones). Mantém rotas, filtros, permissões e
   regras: muda **como a informação se apresenta**.
2. **O vocabulário NÃO muda.** Ele recusou explicitamente a opção de revisar rótulos. *Total*,
   *Em estoque*, *Em uso*, *Falta*, *Reservado* continuam com esses nomes.
3. **Prova visual obrigatória:** como não existe `.env.ensaio` e produção tem dado real (regra 2),
   a prova é **prévia estática com dados fictícios + foto + o teste dos 5 segundos**, e o agente
   segue até o merge sem parar para conferência humana.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Fazer a tela `/itens` do Estoque TI WAP ser ENTENDIDA AO BATER O OLHO. O critério que manda em
tudo é do Johnny (01/09/2026): a tela tem de responder, em 5 segundos, sem tooltip, sem abrir
linha e sem contar coluna, ONDE ESTÁ O ITEM — quanto tem em cada filial. Ao final: `/itens`
redesenhada dentro do casco da F40, prova visual fotografada e aprovada no teste dos 5 segundos,
`lint`/`test`/`contraste`/`build` verdes, CI verde, versão 1.48.0 publicada com tag `v1.48.0`,
merge na `main`, deploy no ar e smoke reexecutado. **Sem migration, sem dependência nova, sem
mudar regra de negócio, permissão ou vocabulário.**

# Contexto

## Leia antes de escrever qualquer código
- `@CLAUDE.md` manda em tudo: modo autônomo, as 8 regras permanentes (a **regra 2** — nunca dado
  real — é o que decide como você fotografa; a **regra 3** — custo R$ 0, stack fechada; a
  **regra 8** — versão, e ela não se reinterpreta), a stack, o modelo de acesso e as convenções.
- `@docs/PLANO-ITENS.md` §§1–4: as quatro dores medidas e o desenho novo. A D3 é a ancestral desta
  ordem; esta é a segunda passada nela, agora sobre a APRESENTAÇÃO.
- `@docs/RELATORIO-F42.md`: o que a fase anterior entregou, a tabela recurso-a-recurso da §3 (é o
  seu gabarito de não-regressão) e a §12.
- `@docs/PLANO-DESIGN-SYSTEM.md` §§3–4: a régua em prosa. `src/lib/layout/consistencia.test.ts` é
  a régua executável — 8 regras, e nenhuma delas pode passar a valer menos por causa desta fase.
- `@docs/RELATORIO-F40.md` §2.1: o que cada componente do casco é e por que existe.

## A tela de hoje, e o que exatamente está ilegível
Diagnóstico medido em 01/09/2026 na `v1.47.2` — confira cada ponto você mesmo antes de aceitar:

1. **A distribuição por filial só existe atrás do chevron** (`FiliaisDoItem`, no fim de
   `src/components/itens/itens-table.tsx`), um item por vez. É EXATAMENTE a pergunta dos 5
   segundos do Johnny, e ela custa um clique por linha.
2. **Quatro números de peso visual quase igual** na linha (Total, Em estoque, Em uso, Falta): só
   `Em estoque` tem `font-semibold`. O olho não tem âncora — nada diz qual número é o assunto.
3. **O significado de cada número mora num tooltip** (`Cabecalho` → `Dica`, alimentado por
   `NUMEROS_ITEM`). Tooltip é, por definição, o contrário de "ao bater o olho" — e no celular
   quase não existe.
4. **Dois alarmes de gramática diferente convivem na mesma linha**: o selo "repor" ao lado do nome
   (`BadgeRepor`, previsão de compra) e o selo vermelho "faltam N" na coluna Falta (compromisso já
   assumido). Quem não leu a ajuda lê os dois como o mesmo aviso.
5. **Grupo e Tipo são texto `muted` que só existem a partir de `md`/`lg`**
   (`hidden md:table-cell`, `hidden lg:table-cell`): no celular a classificação do item simplesmente
   não aparece, e no desktop ela é texto cinza sem codificação visual nenhuma.
6. **A tela não tem resumo.** Só o subtítulo "N itens no catálogo". `CartaoDeMetrica` e
   `GradeDeMetricas` existem em `src/components/layout/cartao-de-metrica.tsx` desde a F40 e
   **nunca foram renderizados por ninguém** — o próprio arquivo avisa disso e pede que quem for
   adotá-los confira o par `py-0` do `Card` com o `p-(--card-spacing)` do filho clicável numa tela
   de verdade. Sua prévia estática permite fazer essa conferência pela primeira vez.
7. **Número sem forma e sem unidade**: "12" e "3" na mesma linha não dão noção de proporção
   nenhuma.

## O fato que destrava tudo
**Os dados já estão na linha.** `getSaldosPorFilial` devolve `porFilial` (o saldo de cada filial)
e `consolidado` numa leitura só, e `montarLinhasDeItem` já entrega isso em `LinhaDeItem`
(`src/lib/itens/lista.ts`). Trazer a distribuição por filial para a linha **não precisa de query
nova, de RPC nova nem de migration** — precisa de desenho. Se você se pegar escrevendo SQL,
parou de fazer a F43.

## O padrão da casa
`/ativos` é o piloto do design system e continua sendo o modelo de gramática (filtros → tabela →
paginação): `src/app/(app)/ativos/page.tsx`, `src/components/ativos/ativos-table.tsx`,
`ativos-filtros.tsx`, `ativos-paginacao.tsx`. O casco vive em
`src/components/layout/pagina.tsx` (`Pagina`, `CabecalhoDaPagina`, `SecaoDaPagina`, `LARGURAS`),
`quadro-de-tabela.tsx`, `estado-vazio.tsx`, `cartao-de-metrica.tsx`, `aviso.tsx`. Densidade e
comparação lado a lado já resolvidas na casa: os relatórios (`src/components/relatorios/`) e o
repositório irmão `../stefanini-ti-inventory-control` (o Acervo) — copiam-se PADRÕES, nunca dados.

## Comandos
`npm run lint` · `npm run test` (Vitest, funções puras) · `npm run contraste` (WCAG AA, Node puro)
· `npm run build`. CI em `.github/workflows/ci.yml` roda os quatro. Smoke de produção:
`node scripts/smoke/smoke-prod.mjs` (leia o `scripts/smoke/README.md` antes).

# Escopo

## Dentro
- `src/app/(app)/itens/page.tsx` e `src/app/(app)/itens/loading.tsx`.
- `src/components/itens/`: `itens-table.tsx`, `itens-filtros.tsx`, `badge-repor.tsx` e os
  componentes novos que o desenho pedir.
- `src/lib/itens/lista.ts`: funções puras novas que o desenho precisar (proporção por filial,
  ordenação por criticidade, o que for) — **com teste Vitest**, como tudo em `lib/`.
- Adoção de `CartaoDeMetrica`/`GradeDeMetricas` NESTA tela, se o desenho pedir. Só nesta.
- Tokens de cor semântica novos em `src/app/globals.css`, se o desenho pedir — e então **todo par
  novo entra em `scripts/contraste.mjs` com `exigir: true`** e passa AA nos dois temas.
- Prévia estática e evidências: `scripts/design/`, `mockups/` e `docs/f43-evidencias/`.
- Documentação e versão: `CHANGELOG.md`, `src/lib/versoes/registry.ts`, `package.json`,
  `docs/DECISOES.md`, `docs/RELATORIO-F43.md`, `docs/PLAN-F43.md`, status no `README.md`, a
  marcação da F43 em `docs/PLANO-ITENS.md` — que hoje vai só até a §7 ("o que não entra"), então
  acrescente uma seção própria para a F43 no formato que o documento já usa nas §5 e §6 — e o
  `docs/README.md` (índice) se criar documento novo.
- A página de ajuda `itens-por-quantidade` SÓ se o desenho tornar alguma frase dela falsa.

## Fora — não toque
- **Banco.** Nenhuma migration, nenhuma mudança em RPC, view ou policy. Os números todos já
  existem.
- **Vocabulário.** *Total*, *Em estoque*, *Em uso*, *Falta*, *Reservado* mantêm esses nomes
  (decisão do Johnny, 01/09/2026: ele escolheu redesenho visual e RECUSOU revisão de vocabulário).
  `NUMEROS_ITEM` continua a fonte única dos rótulos e das explicações. **As colunas do CSV de
  saldos não mudam** — nome, ordem e conteúdo iguais.
- **O `?visao=` não ressuscita.** Filtro que troca COLUNA em vez de recortar LINHA foi morto por
  decisão registrada da F42. Se a distribuição por filial voltar para a linha, ela volta como
  APRESENTAÇÃO PERMANENTE — nunca como modo, alternador ou preferência.
- **Telas irmãs:** `/itens/historico`, `/itens/conferencia`, `/admin/itens`, `/admin/tipos-item`,
  os diálogos de lançar e transferir, as TELAS de relatório, a ficha do ativo, a home. O que você
  achar de errado lá vira item de backlog no relatório (regra 1 do CLAUDE.md), não commit.
  ⚠ "Fora" aqui são as TELAS, não a pasta: `src/components/relatorios/linha-expansivel.tsx`
  (`BotaoExpandir`/`useExpandidas`) e `realtime-refresh.tsx` são infraestrutura compartilhada que
  `/itens` já consome — usá-los é esperado. ALTERÁ-LOS exige conferir todos os consumidores e
  registrar a decisão; na dúvida, componha por cima em vez de mudar o compartilhado.
- **Regras, permissões e rotas:** os cargos, as guardas, os filtros (`q`, `grupo`, `filial`), a
  paginação (`page`, `pp`) e as URLs continuam exatamente como estão. URL antiga continua valendo.
- **`src/components/ui/`** (shadcn) e **nenhuma dependência nova** (regra 3). Playwright, tsx,
  Vitest e `@tailwindcss/postcss` já estão no projeto — use o que já existe.
- Não acrescente arquivo nenhum à lista de PENDENTES de `consistencia.test.ts`. A régua não afrouxa
  para acomodar esta fase.

# Critérios de aceitação — autoverifique item a item

1. **O teste dos 5 segundos passa** (protocolo abaixo), nos dois tamanhos e nos dois temas, com a
   régua de cada tamanho: **em 1440×900** as perguntas a, b e c se respondem OLHANDO a imagem;
   **em 390×844** as perguntas a e c se respondem olhando, e a b passa a ser *"onde você tocaria
   para descobrir isso?"* — vale se o subagente apontar o lugar certo sem hesitar. A pergunta d é
   diagnóstica, não bloqueia (ver protocolo). Evidências em `docs/f43-evidencias/`.
2. **A linha de base foi medida antes**: a tela de hoje fotografada e submetida ao MESMO teste, e
   o relatório mostra em quais perguntas ela falhava. Sem "antes", não há prova de melhora.
3. **A distribuição por filial é legível SEM abrir a linha e SEM tooltip em 1440px** — este é o
   pedido literal do Johnny e não se negocia. Em 390px ela pode continuar atrás de um gesto, desde
   que o gesto seja ÓBVIO na imagem (é o que a pergunta b mede lá); o relatório declara o que o
   desenho prioriza no celular e por quê.
4. **Nenhum recurso da F42 sumiu.** Prove numa tabela recurso-a-recurso, no molde da §3 do
   `RELATORIO-F42.md`, cobrindo no mínimo: os três filtros, a paginação e o seletor de tamanho,
   a ordenação, o export CSV, "Lançar quantidade", "Ver histórico deste item", "Transferir",
   "Conferir estoque", o selo "repor", o selo "faltam N", `foraDasFiliais`, o aviso de reservado,
   os TRÊS estados vazios (com filtro / recorte por cargo / catálogo vazio), o `RealtimeRefresh`,
   a linha expansível e o comportamento por cargo (consulta não vê o menu de ações).
5. **Os quatro comandos verdes** e os dois jobs do CI verdes. `consistencia.test.ts` verde sem
   exceção nova. ⚠ O job `banco` sobe Supabase CLI + Postgres e já caiu duas vezes por causa
   EXTERNA (o próprio `ci.yml` registra: rate limit da API de releases em 24/07/2026, telemetria em
   25/07/2026). Esta fase não toca banco: se ele falhar por causa externa, reexecute UMA vez e,
   persistindo, registre no relatório com a evidência e siga — não conserte CI nesta ordem.
6. **Todo par de cor novo mede AA** no `npm run contraste`, com `exigir: true`, nos dois temas.
7. **`loading.tsx` espelha o layout novo** — mesma variante de casco (regra 8 do
   `consistencia.test.ts`) e mesmo esqueleto de blocos, para não haver salto na navegação.
8. **Acessibilidade:** nada essencial codificado SÓ por cor (toda barra, chip ou realce carrega
   número ou rótulo junto); alvo de toque ≥ 40px no celular; `aria-label` em todo controle novo;
   a `Dica` continua existindo para o detalhe, mas **nenhuma informação essencial vive só nela**.
9. **Regra 8 do CLAUDE.md, os três passos:** `package.json` em **1.48.0** (é fase → MINOR),
   entrada nova no topo de `src/lib/versoes/registry.ts` (`versao`, `data`, `fase: 'F43'`,
   `titulo`, 2 a 6 `mudancas` em LINGUAGEM DE OPERADOR), entrada no `CHANGELOG.md` na mesma data,
   e tag anotada `v1.48.0` publicada.
10. **Rollout:** merge na `main`, CI verde, deploy no ar, smoke reexecutado com a saída colada no
    relatório.

# Verificação — rode de verdade

## Os quatro comandos
Rode `npm run lint`, `npm run test`, `npm run contraste` e `npm run build` a cada incremento; leia
a falha, corrija a CAUSA RAIZ e repita até passar. Não desabilite, não pule, não delete teste, não
acrescente exceção à régua para fazer verde. Ao final rode os quatro limpos e guarde a saída real
para o relatório.

## A prova visual — o coração desta ordem
Não existe `.env.ensaio`, e `scripts/design/capturar.mjs` se RECUSA a fotografar produção (regra
2, e ela é trava, não conselho). Então a prova se faz assim:

**Prefira fotografar o COMPONENTE REAL, não um desenho paralelo.** `react-dom` 19.2.8 está aí e
`tsx` também: escreva `scripts/design/previa-itens.(mjs|ts)` que renderiza `ItensTable` (e o resto
do miolo da tela) com `renderToStaticMarkup`, alimentado por props 100% FICTÍCIAS, dentro de um
HTML com o CSS do app compilado a partir de `src/app/globals.css` (o `@tailwindcss/postcss` já
está em `node_modules` — não instale nada). Assim a foto mostra o que vai ao ar, e não uma promessa.
Se esse caminho não fechar em tempo razoável, caia para um mockup estático em `mockups/` usando os
MESMOS tokens e as MESMAS classes do componente — e então **declare a limitação em
`docs/DECISOES.md` e no relatório**, porque mockup à mão pode divergir do que ficou no código.

Fotografe com Playwright (já é devDependency, aprovado em 30/08/2026), em 1440×900 e 390×844, tema
claro e escuro. Se o Chromium do Playwright não estiver baixado e o download falhar, tente o Chrome
do sistema (`chromium.launch({ channel: 'chrome' })`) antes de desistir. Se nem isso funcionar: NÃO
TRAVE — siga com a implementação, rode o teste dos 5 segundos sobre o HTML da prévia em vez da
imagem, e registre a limitação com todas as letras no relatório. Você é o único responsável por
dizer honestamente o que foi provado com foto e o que não foi.

**DADOS 100% FICTÍCIOS, sem exceção** (regra 2): nada de nome de colaborador real, patrimônio real
ou linha de planilha da WAP. Use o padrão da casa (`WAP0001234`, "Fulano") e nomes de filial
inventados; cubra os casos que o desenho tem de aguentar: item com saldo em 1 filial só, item
espalhado nas 5, item zerado, item com "repor", item com "faltam N", item com `foraDasFiliais > 0`,
nome de item comprido que trunca, e catálogo com 40+ linhas.

## O teste dos 5 segundos — o critério de aceite principal
1. Você mesmo abre o PNG (Read na imagem) e julga.
2. Depois entregue **a mesma imagem** a um subagente em CONTEXTO FRESCO, que não viu o código, nem
   este prompt, nem o desenho pretendido. Dê a ele só a imagem e estas perguntas:
   - **a.** Quais itens precisam ser comprados/repostos agora?
   - **b.** O item *<escolha um da imagem>*: em quais filiais ele está e quanto tem em cada uma?
     (em 390×844 a pergunta vira: *onde você tocaria para descobrir isso?*)
   - **c.** Desse mesmo item, quanto está na prateleira e quanto está com as pessoas?
   - **d.** *(diagnóstica, não bloqueia o merge)* Algum número da linha te deixa em dúvida sobre o
     que ele quer dizer? Qual, e por quê?
   Instrua-o: "responda só olhando a imagem; se não tiver certeza ou precisar de mais que alguns
   segundos, responda NÃO SEI." Não dê a ele a resposta esperada, nem diga o que o desenho pretende.
3. **A régua, e ela é assimétrica de propósito:** uma reprovação em a, b ou c vale de imediato —
   errou ou hesitou, o desenho falhou. Para declarar uma pergunta APROVADA, ela tem de passar em
   **duas rodadas independentes, com subagentes diferentes** (contexto fresco é amostra, não
   medição: um acerto sozinho pode ser sorte).
4. Falhou → mude o **DESENHO**. Nunca a pergunta, nunca o dado da prévia, nunca o subagente, nunca
   o enunciado. A pergunta **d** não reprova nada: ela alimenta o desenho e vai INTEIRA para o
   relatório — inclusive quando acusa um rótulo, porque o vocabulário está congelado nesta fase e
   essa dúvida vira item de backlog, não commit.
5. **Condição de parada, para a fase não ficar refém do critério:** se depois de **três desenhos
   diferentes** a mesma pergunta (a, b ou c) continuar reprovando, pare de iterar nela. Escolha o
   melhor desenho medido, declare a pergunta como NÃO ATENDIDA no relatório — com as três
   tentativas, as respostas literais e sua hipótese do porquê — e **siga para o rollout**. Uma fase
   que entrega melhora medida e diz o que não conseguiu é honesta; uma que não entrega nada porque
   um critério subjetivo não fechou, não é. O que continua proibido em qualquer hipótese é maquiar
   o teste para dar verde.
6. Rode o mesmo protocolo na LINHA DE BASE (o `ItensTable` de HOJE) antes de tocar no componente.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar, não
espere confirmação, não peça aval de desenho — o Johnny já deu o critério (a pergunta dos 5
segundos) e a liberdade (redesenho visual completo).

Régua de decisão: (1) este prompt; (2) `CLAUDE.md` e as convenções do repositório; (3) o que a
prova visual mostrar — desenho se decide por evidência, não por gosto; (4) restando empate, a
opção mais simples e reversível. Toda decisão não-óbvia vai para `docs/DECISOES.md` no formato da
casa (data · contexto · escolha · motivo).

**Duas decisões que você VAI ter de registrar, porque revisam decisão anterior:** trazer a
distribuição por filial de volta para a superfície da linha revisa parcialmente a escolha da F42 de
mandá-la para a linha expansível; e qualquer mudança de hierarquia dos quatro números revisa a
tabela que a F42 acabou de entregar. Registre as duas como REVISÃO, dizendo o que muda e o que
permanece — nunca como se a F42 tivesse errado de graça: ela consertou estrutura, esta conserta
leitura.

Se a mesma falha persistir depois de ~3 tentativas, mude de abordagem e registre a troca. Bloqueio
real (download de browser recusado, rede indisponível, deploy fora do ar): contorne se for seguro;
senão siga com o resto e registre a pendência com o que falta para resolver. Se o push na `main` ou
o deploy for barrado pelo ambiente, **não insista**: deixe a branch pronta, a tag criada localmente
e diga isso no relatório.

# Git e segurança
O `CLAUDE.md` autoriza commit direto na `main`, merge e deploy — este é o modo autônomo do projeto.
Ainda assim, trabalhe na branch `f43-legibilidade-itens` e mergeie quando o checklist passar na sua
autoverificação. Commits pequenos, frequentes, em **pt-BR** no estilo conventional do repositório
(`feat(f43): a filial na linha do item`). Proibidos, como sempre: push forçado, `node_modules`,
`.env*` e dado real em qualquer arquivo — inclusive nas imagens de evidência. Tag anotada
`v1.48.0`, publicada com `git push origin v1.48.0`.

# Como trabalhar
Fase 0 — **a ferramenta, e só então a linha de base**: escreva primeiro a prévia estática
(`scripts/design/previa-itens.*`) e fotografe com ela o `ItensTable` **de hoje**, sem alterar uma
linha do componente. A prévia é FERRAMENTA DE DEV, não mudança de tela — escrevê-la antes não
contamina a linha de base, e é o único caminho que existe (o `capturar.mjs` se recusa a fotografar
produção e não há `.env.ensaio`). Com a foto do estado atual na mão, rode o teste dos 5 segundos
nela e guarde as respostas: é contra elas que a melhora vai ser medida.
Fase 1 — **explorar em paralelo, com subagentes** (voltam só com resumo): (a) a tela de hoje
recurso a recurso, a partir da §3 do `RELATORIO-F42.md`; (b) como o resto da casa resolve densidade
e comparação lado a lado — relatórios, `/ativos`, e o irmão Acervo; (c) as travas que vão brigar
com o redesenho — `consistencia.test.ts`, `contraste.mjs`, os testes que tocam itens.
Fase 2 — **`docs/PLAN-F43.md` autossuficiente**: as variantes candidatas de desenho, o gabarito
recurso-a-recurso, o que fica fora, e a verificação de ponta a ponta no final.
Fase 3 — **duas ou três variantes de desenho, em paralelo**, cada uma fotografada e submetida ao
teste dos 5 segundos. Escolha por EVIDÊNCIA e registre a escolha e as recusadas em `DECISOES.md`.
Fase 4 — **implementar a escolhida** em incrementos testáveis, com os quatro comandos a cada um.
Fase 5 — **revisão adversarial em contexto fresco**, contra o `PLAN-F43.md` e o gabarito de
recursos: que recurso sumiu? o que regrediu em 390px? o que virou cor sem rótulo? o que quebrou por
cargo (consulta, operador de uma filial só)? o que a prévia mostra que o componente real não faz?
Aponte apenas lacunas de correção, requisito declarado ou acessibilidade — não preferência de
estilo. Corrija e re-revise até limpar.
Fase 6 — versão 1.48.0, merge, CI, deploy, smoke, relatório.

# Relatório final
`docs/RELATORIO-F43.md`, em pt-BR, no molde dos relatórios anteriores desta casa:
- o problema em uma frase e o critério do Johnny, literal;
- antes × depois com as IMAGENS, e as respostas literais do teste dos 5 segundos nas duas;
- a tabela recurso-a-recurso provando que nada da F42 sumiu;
- as saídas REAIS e completas de `lint`, `test`, `contraste` e `build`, e o resultado do CI;
- o que mudou por arquivo e por quê; as decisões (aponte `DECISOES.md`);
- o smoke pós-deploy;
- pendências e dívidas com o custo declarado, e próximos passos sugeridos.
**Evidência, não afirmação:** "ficou legível" sem a imagem e sem as respostas do subagente não vale.
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
git status                 # árvore limpa? há 6 docs novos sem commit — commite ou stashe
git pull                   # main em dia
npm run lint && npm run test && npm run contraste && npm run build   # linha de base verde
npx playwright install chromium    # ~150MB, uma vez — sem isso não há foto
claude --version           # `auto` exige 2.1.83+
```

Abra `claude` interativo uma vez nesta pasta antes de sair de perto: o diálogo de confiança do
workspace só aparece em modo interativo e, pendente, trava a run.

### Rodar

```bash
claude --model opus --permission-mode auto -n f43-itens
# cole o bloco do prompt inteiro e deixe rodando
```

Para não colidir com trabalho local na mesma pasta: `claude --worktree f43-itens --model opus
--permission-mode auto`.

Deixar rodando sem o terminal aberto (headless) — extraia **só o bloco do prompt**, e não o
arquivo inteiro (o resto daqui é para voce, nao para o agente):

```bash
# recorta o conteudo entre a primeira e a segunda linha de crase tripla do arquivo
awk '/^```text$/{f=1;next} /^```$/{if(f)exit} f' \
  docs/prompts/F43-legibilidade-itens-ultracode.md > /tmp/f43-prompt.txt
claude -p "$(cat /tmp/f43-prompt.txt)" --model opus \
  --permission-mode auto --output-format json > run-f43.json 2>&1
jq -r '.result' run-f43.json
```

> Nota de custo: run multiagente com prévia visual iterativa é cara. `CLAUDE_CODE_SUBAGENT_MODEL`
> apontando para um Sonnet baixa bastante o custo **exceto** para o subagente do teste dos 5
> segundos — esse é justamente onde julgamento importa; se quiser economizar, economize nos
> exploradores.

### Enquanto roda

`/goal a tela /itens mostra a distribuição por filial na própria linha, sem tooltip e sem abrir a
linha, e os quatro comandos passam` — o avaliador separado re-checa a condição a cada turno.
Retomar depois: `claude --resume f43-itens`.

### Ao voltar

1. Abra as imagens de `docs/f43-evidencias/` — antes e depois. É a revisão que só você pode fazer.
2. Leia `docs/RELATORIO-F43.md` conferindo as evidências (saídas reais, não afirmações).
3. `git log --oneline` e `git diff v1.47.2..v1.48.0 -- src/` para auditar o diff.
4. Abra `/itens` em produção no celular e no desktop.
5. Veio errado? **Regra dos 2 strikes:** depois de duas correções falhas, não emende — peça um
   prompt novo com o aprendizado e rode em sessão limpa.

## Suposições que fiz

- **É fase, e é a F43** (a F42 foi a última) → versão **MINOR**: 1.47.2 → **1.48.0**, pela regra 8.
  Se você preferir tratar como ajuste avulso, troque para 1.47.3 (PATCH) e tire o `fase` do registry.
- **Rollout até produção**, como na F40/F41/F42: merge na `main`, tag publicada, deploy e smoke.
- **O escopo é a lista `/itens`.** Histórico, conferência, diálogos e `/admin/itens` ficam de fora —
  o que aparecer de lá vai para o backlog do relatório.
- **O vocabulário fica**: você recusou a opção de revisar rótulos, então *Total / Em estoque / Em
  uso / Falta* continuam com esses nomes e o CSV não muda de colunas.
- **Playwright precisa baixar o Chromium** (`npx playwright install chromium`) — o cache não está
  no ambiente. O prompt tem plano B (Chrome do sistema) e plano C (teste sobre o HTML), mas o
  plano A é o único que produz foto de verdade.
