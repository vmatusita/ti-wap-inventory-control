# F42 — as telas: itens deixa de ser a exceção

Ordem de serviço autônoma (ultracode) para executar a **§6** de
[`docs/PLANO-ITENS.md`](../PLANO-ITENS.md). A F41 (o motor) fechou em 31/08/2026 com a
`v1.46.0` — esta é a segunda metade da decisão **J4**: *"Cada uma fecha sozinha, com versão e
tag."*

Escrita em 31/08/2026, depois da F41 no ar, com o rollout **até produção** e a dispensa de
captura de tela confirmados pelo Johnny nesta data.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a ordem F42 do plano `docs/PLANO-ITENS.md` (§6, "as telas"): `/itens` reescrita dentro
do casco da F40 — uma tabela, um conjunto de filtros, uma paginação —, o histórico em rota
própria `/itens/historico`, o diálogo de lançamento encolhido e com a prévia do acerto
automático, e as demais superfícies de item alinhadas. O objetivo declarado, que é o critério de
tudo: QUEM SABE USAR `/ativos` SABE USAR `/itens` SEM APRENDER NADA NOVO. Ao final:
`lint`/`test`/`contraste`/`build` verdes, os dois jobs do CI verdes, versão 1.47.0 publicada com
tag `v1.47.0`, fase mergeada na `main`, deploy no ar e smoke reexecutado. **Esta fase NÃO tem
migration** — a F41 já entregou o banco.

# Contexto
- **Leia `@docs/PLANO-ITENS.md` INTEIRO antes de escrever qualquer código.** §1 as quatro dores
  medidas (a D3 é a desta ordem: "a view de itens foge totalmente do padrão do sistema; eu mesmo
  que projetei estou me perdendo"), §2.3 o diagnóstico dela, §3 as decisões do Johnny — **J3 é a
  desta fase** —, §4.1 o vocabulário (já entregue pela F41), §4.3 o que sai da tela, §6 as
  frentes A–D e o checklist de aceite, §7 os não-objetivos declarados, §8 os riscos. Onde este
  prompt e o plano divergirem, vale ESTE PROMPT — e registre a divergência em `docs/DECISOES.md`.
- **Leia `@docs/RELATORIO-F41.md`, sobretudo a §10** ("o que fica para a F42"): é o handoff
  literal da fase anterior, escrito por quem mexeu no motor. Ele nomeia a coluna **"Em uso"** —
  que a F41 batizou mas NÃO transformou em coluna — e o selo "regularizado" na ficha do ativo.
- `@CLAUDE.md` manda em tudo o mais: o modo autônomo (09/07/2026), as 8 regras permanentes — a
  **regra 8 é a versão, e ela não se reinterpreta** —, a stack fechada (regra 3, custo R$ 0), o
  modelo de acesso e as convenções.
- **O modelo a espelhar é da própria casa e está a uma pasta de distância: `/ativos`**, o piloto
  da F40. Leia e siga: `src/app/(app)/ativos/page.tsx` (a leitura dos params, o `<Pagina>`, o
  `<CabecalhoDaPagina>`), `src/components/ativos/ativos-filtros.tsx` (a gramática de filtro:
  busca + selects rotulados + estado na URL), `ativos-table.tsx`, `ativos-paginacao.tsx` e
  `src/app/(app)/ativos/loading.tsx`. O casco vive em `src/components/layout/pagina.tsx`
  (`Pagina`, `CabecalhoDaPagina`, `SecaoDaPagina`, `LARGURAS`, `MEDIDA_DE_FORMULARIO`),
  `quadro-de-tabela.tsx`, `estado-vazio.tsx`, `cartao-de-metrica.tsx` e `aviso.tsx`. **Não invente
  um segundo jeito de fazer o que `/ativos` já faz** — se você está escrevendo um componente de
  filtro novo do zero, provavelmente parou de fazer a F42.
- `@docs/PLANO-DESIGN-SYSTEM.md` §§3–4 é a régua em prosa; `src/lib/layout/consistencia.test.ts`
  é a MESMA régua em código, e é ela que reprova a regressão. Leia o arquivo inteiro antes de
  mexer nele: ele tem oito regras, uma lista de exceções que **só encolhe**, e três asserções que
  travam o piloto e vão mudar nesta fase (ver Armadilhas).
- `@docs/ESPECIFICACAO.md` e `@docs/MATRIZ-REGRAS.md` são o contrato do domínio: mudou a regra,
  eles mudam no MESMO commit. Aqui a aritmética NÃO muda — o que muda é a tela.
- Comandos do projeto: `npm run lint` · `npm run test` · `npm run contraste` · `npm run build`.
  São os QUATRO que o job `verificar` do CI roda, não três.
- **Não existe teste de componente neste repositório:** `vitest.config.mts` roda em ambiente
  `node` e só inclui `*.test.ts`; `.test.tsx` não entra na suíte e não há biblioteca de render.
  Vitest aqui é para FUNÇÃO PURA e para TEXTO-FONTE (`consistencia.test.ts`,
  `sidebar-colapso.test.ts`, `impressao-colunas.test.ts` são os precedentes). Não tente contornar
  instalando `@testing-library/react`: é dependência nova (regra 3), e a `DIVIDA-TECNICA.md`
  registra que ela precisa de aprovação do Johnny.

# Primeiro passo obrigatório: revalidar a linha de base
Antes de mudar uma linha:
1. Rode `npm run lint`, `npm run test`, `npm run contraste` e `npm run build`. Se algum já estiver
   vermelho ANTES da sua primeira mudança, registre exatamente quais falhas são pré-existentes:
   não as conserte e não as piore. (O `❌` do "antes" registrado da F40 no `contraste` é esperado.)
2. **Meça a régua com a lista de exceções JÁ SEM as linhas de itens.** Apague, numa cópia de
   trabalho, `'src/app/(app)/itens/'` e `'src/components/itens/'` de `PENDENTES` em
   `src/lib/layout/consistencia.test.ts`, rode `npx vitest run src/lib/layout/consistencia.test.ts`
   e GUARDE a lista completa de violações. **Essa lista é o tamanho real da fase** — são 3.923
   linhas em `src/components/itens/**` mais a página de 562 —, e ela vale mais que qualquer
   estimativa. Ponha a contagem inicial no relatório.
3. Inventarie, por `grep`, TODA superfície que depende do que esta fase remove: o toggle
   `?visao=` (tela, `itens-filtros.tsx`, `exportar.ts`, `smoke-prod.mjs`, ajuda), a seção de
   histórico dentro de `/itens` e os params dela (`item`, `tipo`, `de`, `ate`, `page`).
4. Confirme por `SELECT` só-leitura em PRODUÇÃO, via MCP, quanto vale hoje o número novo:
   `Σ saida − Σ retorno` por item (só agregados, nenhum nome, nenhum patrimônio — regra 2 do
   `CLAUDE.md`). É contra esse número que a coluna "Em uso" vai ser conferida no critério 8.

# Escopo
Dentro:

- **Frente A — `/itens` no casco.**
  - `Pagina` + `CabecalhoDaPagina` + `SecaoDaPagina` + `QuadroDeTabela` + `EstadoVazio`, com a
    largura escolhida por TIPO de tela (lista = `cheia`, como `/ativos`).
  - **Uma tabela:** `Item · Tipo · Total · Em estoque · Em uso · Falta · (selo repor) · ⋯`.
  - **A coluna "Em uso" NÃO existe no banco e esta fase NÃO cria migration.** `rel_saldo_itens`
    (`supabase/migrations/0027_itens_total_estoque.sql`) devolve `total`, `estoque`, `atrelados`
    e `falta`, onde `estoque = max(0, total − atrelados − liberados)` e
    `falta = max(0, atrelados + liberados − total)`. Logo **`em_uso = total + falta − estoque −
    atrelados`**, exata nos dois ramos (com estoque, `falta` é 0; com falta, `estoque` é 0).
    Implemente-a como FUNÇÃO PURA em `src/lib/itens/` com teste caso a caso cobrindo os dois
    ramos e o zero, e **confira o resultado contra o `SELECT` do passo 4** — em ensaio e em
    produção. Ela é aditiva por filial, então `somarSaldosDeFiliais` continua valendo sem mudança.
    Se a conferência divergir em UM item que seja, pare de derivar, registre a ata e resolva pela
    leitura — nunca "arredonde" a coluna para bater.
  - **A comparação entre filiais vira LINHA EXPANSÍVEL** (o chevron que os relatórios usam desde
    a F16), não um toggle que troca as colunas. O que hoje é `saldos-filiais.tsx` +
    `?visao=consolidado|filiais` some como MODO e volta como detalhe da linha.
  - **Um conjunto de filtros só**, na gramática de `AtivosFiltros` (busca + selects rotulados +
    estado na URL), e a paginação de `/ativos` — que passa a paginar **os itens**, não o
    histórico. Extraia a montagem da querystring para módulo puro com teste, como o repositório já
    faz em `src/components/itens/url-filtros.ts` e `src/lib/url-params.ts` (que continua sendo a
    FONTE ÚNICA dos parsers — não copie parser para dentro da página).
  - Os selos **"repor"** (estoque mínimo, F12) e **"faltam N"** continuam como estão: são avisos
    diferentes, e a ajuda já explica a diferença.
  - `src/lib/layout/consistencia.test.ts`: **remova `'src/app/(app)/itens/'` e
    `'src/components/itens/'` de `PENDENTES`** e ATUALIZE as asserções que travam o piloto (ver
    Armadilha 1). O teste é a prova de que a tela entrou no casco — não afrouxe nenhuma das oito
    regras para caber.
- **Frente B — o histórico ganha rota própria.**
  - `/itens/historico`, com `page.tsx`, `loading.tsx` e `error.tsx` no molde das rotas irmãs, os
    filtros que já existem (`HistoricoFiltros`, estado na URL desde a F28), o export CSV que já
    existe e a paginação.
  - Chega-se por botão no cabeçalho de `/itens` e pela linha do item (⋯ → "Ver histórico deste
    item", já com o item pré-filtrado).
  - **O que sai de `/itens` é a SEÇÃO, não o RECURSO.** Nenhum filtro, nenhuma coluna, nenhum
    botão de export e nenhum link do histórico pode desaparecer no caminho. Liste no relatório o
    antes e o depois, um a um.
  - Link antigo (`/itens?tipo=…&de=…&ate=…`) não pode virar 404 nem tela quebrada: redirecione
    para `/itens/historico` preservando o recorte — há precedente de redirecionador de âncora
    legada em `src/components/ajuda/redireciona-ancora-legada.tsx` — ou registre a ata dizendo por
    que não.
- **Frente C — o lançamento avulso encolhe.**
  - `src/components/itens/lancar-item-dialog.tsx` tem **893 linhas** hoje (o plano diz 876; a F41
    mexeu nele). Os 4 botões e a pergunta única JÁ vieram da F41 (`src/lib/itens/escolha-tipo.ts`,
    `PERGUNTA_ESCOLHA`): o que falta aqui é o TAMANHO e a PRÉVIA.
  - **A prévia da regularização:** ao escolher item + quantidade, o diálogo mostra "1 unidade
    entra por acerto automático" ANTES de gravar, usando a MESMA função pura da F41
    (`src/lib/itens/regularizacao.ts`). Não escreva uma segunda conta — se a sua prévia diverge do
    que a RPC grava, ela é pior que não ter prévia.
  - O carrinho multi-linha permanece (I1 do backlog, entregue na F10 e em uso).
  - `src/components/itens/transferir-item-dialog.tsx` (457 linhas, **11 `useState`** — item K da
    `DIVIDA-TECNICA.md`) vai para o padrão do sistema. `react-hook-form` JÁ está no projeto, não é
    dependência nova. ⚠ Sem teste de componente, reescrever formulário é trocar dívida conhecida
    por risco de regressão — é o argumento que a própria `DIVIDA-TECNICA.md` registra. Se o custo
    não fechar dentro desta fase, **encolher com segurança vale mais que reescrever**: registre a
    ata com o critério e atualize a dívida com o que ficou.
- **Frente D — as outras superfícies.**
  - **Ficha do ativo:** `src/components/ativos/itens-que-foram-junto.tsx` ganha o selo
    "regularizado". ⚠ O tipo `ItemQueFoiJunto` em `src/lib/queries/itens.ts` **não lê
    `regularizacao` hoje** — acrescente a coluna à leitura, senão o selo nunca acende. O cartão só
    aparece quando há linhas; em produção eram zero até a F41 e agora passam a existir.
  - **`/itens/conferencia`** entra no casco **sem mudar a aritmética** (F31): o julgamento mora em
    `src/components/itens/conferencia/rascunho.ts` e no teste dele — não toque na conta.
  - **Relatórios:** confira que nenhum rótulo velho voltou; a F41 já passou por
    `tabela-itens-grupo.tsx`, `corpo-relatorio-v2.tsx`, `src/lib/relatorios/tipos.ts` e
    `src/lib/queries/relatorios/itens.ts`. Legenda é render, não dado (precedente F17): nenhuma
    contagem muda.
  - **Sidebar:** `src/components/layout/sidebar-nav.tsx` — "Itens" ganha as subrotas visíveis
    (Conferir · Histórico), como o resto do sistema faz. Respeite
    `src/components/layout/permissoes.ts` e o `sidebar-colapso.test.ts`.
  - **Descoberta:** rota nova que não entra na **paleta de comandos**
    (`src/components/layout/paleta-comandos.tsx`) e no **mapa das telas**
    (`src/lib/ajuda/conteudo/mapa-das-telas.ts`) nasce invisível. Os dois entram no mesmo commit.
  - **Ajuda:** `itens-por-quantidade.ts`, `lancar-itens.ts`, `saldos-e-estoque-minimo.ts`,
    `conferencia-de-estoque.ts` e `mapa-das-telas.ts` descrevem telas que deixaram de existir como
    estão. ⚠ `NUMEROS_ITEM`, de `itens-por-quantidade.ts`, é IMPORTADO pela página de itens (é a
    fonte única da explicação de cada número): a coluna "Em uso" precisa de entrada lá. E
    `referencia.test.ts`, `gestao.test.ts`, `operacao.test.ts` e `comecar.test.ts` conferem o
    texto da ajuda contra `TIPO_LANCAMENTO_META` e as rotas — tratam-se todos.
  - **Smoke:** `scripts/smoke/smoke-prod.mjs` conhece o toggle em TRÊS entradas (`/itens` com
    `marcadorAusente: 'Filtrar por filial'`, `?visao=consolidado` com `marcador`, e
    `?visao=filiais`). Reescreva as três para a tela nova e acrescente `/itens/historico` às DUAS
    listas (`ROTAS`, sem sessão → redirect para `/login`; `ROTAS_LOGADO`, com marcador de
    conteúdo). O marcador tem de vir de DENTRO do conteúdo, nunca do shell — o comentário do
    próprio arquivo explica por quê.
  - **Fotografia das telas:** `scripts/design/capturar.mjs` tem `ROTAS_PADRAO = ['/ativos',
    '/ativos/novo']` com o comentário "as frentes seguintes acrescentam as suas". Acrescente
    `/itens`, `/itens/historico` e `/itens/conferencia` à constante. **Não RODE o script**: ele
    exige um `.env.ensaio` que não existe neste repositório, e apontá-lo para o `.env.local` seria
    fotografar produção (regra 2). A prova desta fase é código, teste e smoke.
  - **Versão `1.47.0`** (é fase → MINOR): `package.json` (só o campo `version`), entrada nova no
    topo de `src/lib/versoes/registry.ts` em LINGUAGEM DE OPERADOR, entrada no `CHANGELOG.md`, tag
    anotada `v1.47.0` publicada. `cobertura-changelog.test.ts` derruba o `npm run test` se faltar.
  - **Documentação:** `docs/ESPECIFICACAO.md` (as telas de item), `docs/ARQUITETURA.md` §10,
    `docs/PLANO-DESIGN-SYSTEM.md` (a frente c avançou — registre o que sobrou),
    `docs/DIVIDA-TECNICA.md` (o item K e o carrinho), `docs/DECISOES.md`, `docs/README.md` (o
    índice) e o `docs/PLANO-ITENS.md` §6 marcado como entregue. `docs/MATRIZ-REGRAS.md` só se
    alguma regra mudar — e nesta fase não deveria mudar nenhuma.

Fora (não toque):
- **Migration. Nenhuma.** A F41 entregou o banco e o plano diz "sem migration" com todas as
  letras. A única tentação real é a coluna "Em uso", e ela se DERIVA (fórmula no escopo). Se
  ainda assim você concluir que DDL é inevitável, isso é ata em `docs/DECISOES.md` + o caminho do
  `docs/RUNBOOK-BANCO.md` na íntegra (ensaio primeiro, rollback no rodapé, roteiros de
  `supabase/tests/*.sql`) — nunca improviso. `git diff` de `supabase/` vazio é o padrão esperado.
- `valida_lancamento_item`, as RPCs da F41, os valores do enum `tipo_lancamento` e os nomes das
  colunas SQL (`total`, `estoque`, `atrelados`) — §4.1 do plano fecha isso.
- **`/ativos` e o wizard de movimentação**, além do cartão "Itens que foram junto" e do que a
  linha do item exigir.
- **As outras frentes da F40.** A lista `PENDENTES` perde as linhas de ITENS e mais nada:
  `/admin`, `/relatorios`, `/movimentacoes`, `/pendencias`, a home, `/dev`, `/ajuda`, `/versoes` e
  a casca do app continuam pendentes, por decisão da F40. Migrar tela que não é de item é sair do
  escopo — e some com a fase.
- `src/components/ativos/nova-compra-form.tsx` (fora por decisão registrada na F40).
- `src/components/ui/` (kit do shadcn, pela CLI) e `src/lib/types/database.ts` (sem migration, não
  há o que regenerar — `npm run db:types` não roda nesta ordem).
- Dependência nova (regra 3 do `CLAUDE.md` — custo R$ 0). Já estão no projeto e podem ser usados à
  vontade: `react-hook-form`, `@hookform/resolvers`, `zod`, `@tanstack/react-table`, `cmdk`,
  `radix-ui`, `lucide-react`, `date-fns`.
- `.env*` no commit, dado real em qualquer lugar (regra 2), `npm run db:seed` / `db:reset` /
  `carga` — nenhum deles roda nesta ordem.
- Os documentos sem versionar de outras frentes na pasta `docs/`. **Nunca use `git add -A` nem
  `git add .` — adicione por caminho.**

# Critérios de aceitação
São os 7 do `§6` do plano, mais quatro que esta ordem acrescenta porque o checklist de lá não os
listou e eles são exatamente onde um redesenho falha. Cada um com a prova que o relatório carrega:
1. **`/itens` usa os componentes do casco** e `consistencia.test.ts` deixa de listá-la como
   pendente — com as asserções do piloto ATUALIZADAS, não afrouxadas. Cole no relatório o diff do
   teste e a contagem de violações no início (passo 2 da linha de base) contra o zero do fim.
2. **Uma tabela, um filtro, uma paginação — e a paginação pagina os ITENS.** Prove com um link
   `?page=2` que muda a lista de itens (hoje ela pagina o histórico).
3. **A comparação entre filiais existe sem toggle que troque colunas** — linha expansível, e o
   `?visao=` deixa de ser um modo de tela.
4. **`/itens/historico` reproduz o recorte pelo link, com export, e nada do histórico se perdeu.**
   Liste no relatório, um a um, os filtros/colunas/ações de antes e os de depois.
5. **O diálogo cabe em 4 botões e mostra a prévia da regularização antes de gravar**, pela função
   pura da F41. Diga quantas linhas ele tinha (893) e quantas tem.
6. **Nenhum texto de tela cita "Liberação", "Atrelar", "Retorno" ou "Atrelados".** Cole a saída do
   `grep -rn` em `src/` e justifique cada ocorrência remanescente.
7. **`npm run lint`, `npm run test`, `npm run contraste` e `npm run build` verdes** — os QUATRO do
   job `verificar`; os DOIS jobs do CI (`verificar` e `banco`) verdes depois do push; smoke
   autenticado cobrindo as rotas novas, reexecutado depois do deploy.
8. **"Em uso" bate com o banco.** A coluna nova, somada por item, é IGUAL a `Σ saida − Σ retorno`
   medido por `SELECT` agregado em produção. Cole as duas contagens lado a lado.
9. **Nada de banco mudou:** `git diff v1.46.0..HEAD -- supabase/` vazio e nenhuma migration nova.
   (Se houver, a ata explica.)
10. **Nenhum recurso e nenhuma rota sumiram.** `/itens?visao=consolidado`, `?visao=filiais` e um
    link antigo de histórico não podem dar 404 nem tela quebrada — o smoke prova.
11. **Versão 1.47.0 publicada** com tag anotada `v1.47.0` e entrada no `registry.ts` em linguagem
    de operador (o que o Johnny vê, não o que o código faz).

# Verificação — rode de verdade
Rode `npm run lint`, `npm run test`, `npm run contraste` e `npm run build` após CADA incremento,
não só no fim. Leia as falhas, corrija a CAUSA RAIZ e repita até passar. Guarde a saída real e
completa para o relatório.

**Proibido:** desabilitar, pular ou apagar teste para fazê-lo passar; **acrescentar prefixo à
lista `PENDENTES` da régua** (a lista só encolhe — pôr algo de volta é dizer "desisti de uma tela
que já estava sob a régua", e exige ata); trocar uma asserção por uma mais frouxa em vez de
atualizá-la para a verdade nova; marcar como esperado um erro que a fase deveria eliminar.
Se um teste existente quebrar, ele é o contrato: ou o seu código está errado, ou o teste mudou
porque a REGRA mudou — e nesse caso registre em `docs/DECISOES.md` e aponte no relatório.

Como esta suíte não renderiza componente, o que precisa de prova vira:
- **função pura + teste** (a derivação de "Em uso", a montagem da querystring dos filtros, a
  agregação da linha expansível, a prévia da regularização reusada da F41);
- **teste de TEXTO-FONTE**, no molde de `consistencia.test.ts` e `sidebar-colapso.test.ts`, quando
  a propriedade é do código e não do comportamento;
- **smoke autenticado**, quando a prova é "a rota existe, responde e renderiza o conteúdo certo".

# As armadilhas desta fase
1. **`consistencia.test.ts` não é só uma lista de exceções.** Ele tem TRÊS travas que esta fase
   move: (a) `expect(ROTAS.length).toBe(29)` — `/itens/historico` faz 30; (b) a asserção que fixa
   `ROTAS_MIGRADAS` em exatamente `['/ativos', '/ativos/[id]', '/ativos/novo']` — passa a incluir
   `/itens`, `/itens/conferencia` e `/itens/historico`; (c) "toda linha de `PENDENTES` aponta para
   arquivo que existe", que fica VERMELHA se você apagar um prefixo pela metade. Atualizar as três
   para a verdade nova é o certo; afrouxá-las é o erro.
2. **O casco é a parte fácil.** As regras 3, 4 e 5 da régua (escala de espaçamento, moldura à mão,
   fonte/largura arbitrária) passam a valer para TODO `src/components/itens/**` no instante em que
   o prefixo sai de `PENDENTES` — são 3.923 linhas, incluindo o diálogo de 893 e a conferência de
   598. A medição do passo 2 da linha de base é o seu mapa; sem ela você descobre o tamanho da
   fase no fim.
3. **A regra 8 da régua: o esqueleto declara a MESMA largura da tela.** `/itens/historico` nasce
   com o `loading.tsx` dela montando um `<Pagina>` de verdade, com a mesma variante da página —
   e `/itens` e `/itens/conferencia` passam a ser cobradas por isso também.
4. **"Em uso" não existe no banco, e esta fase não cria migration.** Derive pela fórmula do
   escopo, prove por teste E contra `SELECT`. Nunca escreva a coluna a partir de uma segunda
   fonte de verdade.
5. **O export reparseia a querystring DA TELA.** `exportarItensSaldosCSV` ramifica hoje em
   `?visao=` e `exportarItensHistoricoCSV` lê os params do histórico — os dois em
   `src/lib/actions/exportar.ts`, a partir da MESMA URL, porque hoje as duas telas são uma só.
   Separar as rotas separa as querystrings: garanta que cada export recebe a da sua tela e que o
   `?page=` de uma não é lido como o da outra. Tela mostrando um conjunto e arquivo baixando outro
   é o achado F12-W4-03 desta casa, e ele já custou uma auditoria.
6. **O smoke conhece o toggle.** Três entradas de `/itens` em `smoke-prod.mjs` dependem de
   `?visao=` e do marcador "Filtrar por filial". Elas ficam vermelhas no minuto em que o toggle
   morre — e um smoke vermelho depois do deploy é a última coisa que você quer descobrir sozinho
   às duas da manhã.
7. **Rota que não entra na sidebar, na paleta de comandos e no mapa das telas nasce invisível.**
   Os três, no mesmo commit da rota.
8. **A ajuda quebra sozinha.** `NUMEROS_ITEM` é importado pela página; `referencia.test.ts`,
   `gestao.test.ts`, `operacao.test.ts` e `comecar.test.ts` conferem o texto contra o domínio e as
   rotas. Trate-os no mesmo commit da mudança que os quebrou.
9. **O redesenho perde recurso em silêncio.** É o modo de falha número um desta fase: um filtro
   que não foi reimplementado, uma coluna que ficou de fora, um botão de export que sumiu com a
   seção. Por isso o critério 4 exige a lista antes×depois, e por isso um dos dois revisores
   adversariais só olha para isso.

# Rollout
Não há SQL nesta fase, então a ordem é curta e não se inverte:
1. Os quatro comandos verdes na branch.
2. Push da branch; **os DOIS jobs do CI verdes** (`verificar` e `banco`) — confira com
   `gh run list` / `gh run watch`. Se o `gh` não estiver autenticado, registre a pendência com
   essa frase exata no relatório.
3. Merge na `main` + push + tag anotada `v1.47.0` — é o push que dispara o deploy da Vercel.
4. Depois do deploy: `node scripts/smoke/smoke-prod.mjs`, com a saída colada no relatório, e as
   checagens de integridade de `/dev` conferidas (a `reserva_aberta` da F41 continua respondendo
   zero).
Se algo der errado em produção, corrija você mesmo e registre. Não deixe produção num estado
intermediário em silêncio.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. **Não pare para perguntar e
não espere confirmação em nenhuma hipótese** — o `CLAUDE.md` registra esse modo desde 09/07/2026,
inclusive para merge e deploy.

Régua de decisão: (1) este prompt; (2) `docs/PLANO-ITENS.md`; (3) `CLAUDE.md` e a hierarquia de
documentos-fonte dele (spec → planejamento → migrations); (4) as convenções do código existente —
e aqui elas têm nome: **`/ativos`**; (5) restando ambiguidade, a opção mais simples e reversível.
Toda decisão não-óbvia vai para `docs/DECISOES.md` no formato da casa (data · contexto · escolha ·
alternativas · motivo).

Se a mesma falha persistir depois de ~3 tentativas, MUDE DE ABORDAGEM em vez de repetir, e
registre a troca. Bloqueio real (MCP fora, `gh` sem credencial): contorne se for seguro; se não
for, siga com o resto do escopo e registre a pendência com o que falta para resolvê-la. Nunca
deixe a ordem pela metade em silêncio.

O `CLAUDE.md` diz "se a estrutura real divergir, PARE e reporte". Nesta run ninguém recebe o
reporte em tempo real: registre a divergência em `docs/DECISOES.md`, adapte e siga — exceto se ela
tornar o escopo inteiro sem sentido, e aí sim pare e explique no relatório.

## Decisões já tomadas pelo Johnny — registre-as em DECISOES.md
1. **J3 (31/08/2026) — reescrever `/itens` no padrão de `/ativos`**: filtros + uma tabela +
   paginação, dentro do casco da F40. Histórico em rota própria. O modal encolhe. A alternativa
   "fundir itens no acervo" foi considerada e RECUSADA.
2. **J1 e J4 já executadas pela F41** — o vocabulário e o motor estão no ar desde a `v1.46.0`.
   Esta ordem não reabre nenhum dos dois.
3. **Rollout completo nesta run** (31/08/2026), até produção: merge na `main`, tag `v1.47.0`,
   deploy e smoke.
4. **Sem captura de tela nesta ordem** (31/08/2026): não há `.env.ensaio` neste repositório, e
   apontar o `capturar.mjs` para o `.env.local` fotografaria produção, contra a regra 2. A prova
   visual desta fase é a régua (`consistencia.test.ts`), os quatro comandos e o smoke; a
   conferência a olho é do Johnny, depois. Acrescente as rotas ao `ROTAS_PADRAO` do script mesmo
   sem rodá-lo — quem tiver o ambiente amanhã fotografa sem reabrir esta decisão.

# Git e segurança
- Trabalhe na branch `f42-telas-itens`, com commits pequenos e frequentes, em pt-BR, estilo
  conventional: `feat(f42): /itens entra no casco, com uma tabela só`.
- O primeiro commit inclui este arquivo de prompt. Adicione **por caminho** — nunca `git add -A`,
  nunca `git add .`: há documentos de outras frentes sem versionar na pasta `docs/`.
- Ao final, com os quatro comandos verdes, o CI verde e o checklist autoverificado item a item:
  mergeie na `main`, faça push e publique a tag `v1.47.0` — é o fluxo do modo autônomo deste
  repositório.
- **NUNCA:** `git push --force`, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de
  commit que não é seu, commitar `.env*` ou `node_modules`, rodar `npm run db:seed`,
  `npm run db:reset` ou `npm run carga`.
- Segredo nenhum entra em prompt, log, relatório ou commit. O `.env.local` deste repositório
  aponta para PRODUÇÃO: não o edite e não o use para nada além do que o próprio projeto já faz.

# Como trabalhar
1. **Explorar em paralelo, com subagentes** (o contexto principal fica limpo; cada um volta só com
   resumo): (a) revalidar a linha de base e MEDIR a régua com os prefixos de itens fora de
   `PENDENTES` — é o mapa da fase; (b) ler `src/app/(app)/itens/page.tsx` (562 linhas) inteira e
   descrever a gramática atual dos DOIS blocos de filtro, com todos os params que a URL carrega;
   (c) ler o modelo `/ativos` + o casco da F40 e resumir o padrão a espelhar, componente por
   componente; (d) inventariar TODA superfície que depende do toggle `?visao=` ou da seção de
   histórico (tela, export, smoke, ajuda, paleta, sidebar, mapa das telas, links internos);
   (e) ler `lancar-item-dialog.tsx` e `transferir-item-dialog.tsx` e propor o corte — o que é
   estado de formulário, o que é regra que já existe em módulo puro, o que é duplicação.
2. **Planejar:** escreva `docs/PLAN-F42.md` autossuficiente — arquivos e interfaces nomeados, a
   tabela "recurso de antes → onde ele vive depois" (é o gabarito do critério 4), o fora-de-escopo
   declarado, a verificação de ponta a ponta no fim. Ele sobrevive à compactação e vira o gabarito
   da revisão adversarial.
3. **Implementar em quatro etapas, NESTA ordem, cada uma com os quatro comandos verdes antes de
   seguir:** (A) `/itens` no casco, com a tabela, os filtros, a paginação e a coluna nova;
   (B) a rota `/itens/historico` e a saída dos links antigos; (C) os diálogos; (D) as outras
   superfícies, o texto, a documentação e a versão. Não trabalhe em worktrees paralelas: as quatro
   frentes tocam os mesmos arquivos, e o custo da colisão é maior que o ganho.
4. **Verificar adversarialmente, com DOIS subagentes em contexto fresco:**
   - o primeiro revisa o diff inteiro contra `docs/PLAN-F42.md` e os 11 critérios;
   - o segundo revisa **só o que o usuário PODE TER PERDIDO**: cada filtro, coluna, ação, export,
     link e rota que existia antes da fase e onde ele está agora. Entrada dele: a tabela do
     `PLAN-F42.md` e o `git diff` — saída: a lista do que não achou. É o risco nº 1 de um
     redesenho, e ele merece um par de olhos que não escreveu o código.
   Instrução dos dois: apontar apenas lacunas de correção ou de requisitos declarados, não
   preferências de estilo. Corrija e re-revise até limpar. Se um deles apontar recurso perdido ou
   regra da régua afrouxada, é BLOQUEANTE.

# Relatório final
Escreva `docs/RELATORIO-F42.md` em pt-BR, com EVIDÊNCIAS e não afirmações:
- o que mudou, por arquivo, e por quê;
- **a régua, antes e depois**: a contagem de violações medida no passo 2 da linha de base, o zero
  do fim, e o diff de `consistencia.test.ts` mostrando que as asserções foram atualizadas para a
  verdade nova — não afrouxadas;
- **a tabela recurso-a-recurso** do critério 4: cada filtro, coluna, ação e link de antes, e onde
  ele está agora;
- as **duas contagens de "Em uso"** lado a lado — a da tela e a do `SELECT` em produção;
- a saída real e completa de `npm run lint`, `npm run test`, `npm run contraste` e
  `npm run build`, e o estado dos dois jobs do CI;
- a saída do smoke pós-deploy e o estado das checagens de `/dev`;
- o `grep` do critério 6, com a justificativa de cada ocorrência remanescente;
- o tamanho dos dois diálogos, antes e depois;
- a prova do critério 9 (`git diff` de `supabase/` vazio);
- as decisões registradas em `docs/DECISOES.md` (aponte, não repita);
- pendências, dívidas quitadas e novas em `docs/DIVIDA-TECNICA.md`, e o que fica para a frente
  seguinte do design system (`/admin`, `/relatorios`, `/movimentacoes`, `/pendencias`, a home e a
  casca do app continuam pendentes);
- próximos passos sugeridos.

Termine a resposta final com um resumo de 5 linhas em pt-BR: o que entrou, o estado dos quatro
comandos, o que o usuário ganhou na tela, o que ficou pendente e a versão publicada.

# Idioma
Narrativa, plano, decisões, relatório, ajuda e commits em pt-BR. Identificadores de domínio em
português sem acento (`ativo`, `movimentacao`, `filial`, `lancamento`); utilitários e infra em
inglês. Nomes de arquivo em kebab-case, como o resto do repositório.
```

---

## Como executar

### Pré-voo (uma vez, antes de sair de perto)

```bash
cd C:\Users\yukig\ti-wap-inventory-control
git status                              # veja os pendentes antes de começar
npm run lint && npm run test && npm run contraste && npm run build
```

Os quatro precisam passar **hoje** — são os mesmos que o job `verificar` do CI roda. O prompt manda
o agente comparar contra essa linha de base, e uma suíte já vermelha faz ele gastar a run
consertando o que não é dele.

**Você está na `main`, com só o `package-lock.json` modificado.** O prompt cria a branch
`f42-telas-itens` e proíbe `git add -A`; se o lock foi mexido de propósito, commite antes de
disparar.

**Esta fase não precisa do MCP do Supabase para escrever** — não há migration. Ele ainda é usado
para DUAS leituras só-agregado (a contagem de "Em uso" antes e depois), então vale conferir com
`/mcp` que ele responde; se estiver mudo, o agente registra a pendência e o critério 8 fica com
prova parcial.

Trave o que não é para acontecer, em `.claude/settings.json` (a única garantia dura — `CLAUDE.md`
é contexto, não configuração imposta):

```json
{
  "permissions": {
    "deny": [
      "Bash(git push --force*)",
      "Bash(git push -f*)",
      "Bash(git reset --hard*)",
      "Bash(git clean -fd*)",
      "Bash(npm run db:reset*)",
      "Bash(npm run db:seed*)",
      "Bash(npm run carga*)"
    ]
  }
}
```

Por fim: `claude --version` (o modo `auto` exige 2.1.83+), `gh auth status` (é como o agente
confere os dois jobs do CI) e um `claude` interativo uma vez neste diretório — o diálogo de
confiança do workspace, se ficar pendente, trava a run. No Windows, plano de energia sem
suspensão: notebook que dorme mata a sessão.

### Rodar

```bash
claude --model opus --permission-mode auto -n f42-telas-itens
```

Cole o prompt inteiro e, logo depois, suba o rigor com uma condição que um avaliador separado
re-checa a cada turno:

```
/goal npm run lint, npm run test, npm run contraste e npm run build passam os quatro, /itens e /itens/historico saíram da lista PENDENTES de consistencia.test.ts sem nenhuma regra afrouxada, e a versão 1.47.0 está publicada com tag
```

Então saia de perto.

Modo `auto` porque a run precisa rodar build, mergear, dar push com tag e ler o Supabase por MCP;
`dontAsk` exigiria uma allowlist cobrindo exatamente tudo isso, e qualquer buraco vira negação no
meio do caminho. Se quiser baratear a run, exporte `CLAUDE_CODE_SUBAGENT_MODEL` com um Sonnet
antes do comando — os exploradores e revisores rodam no modelo barato, o forte fica no
orquestrador.

**Esta fase é maior do que parece.** O casco é rápido; o que consome a run são as 3.923 linhas de
`src/components/itens/**` que passam a ser cobradas pelas regras de escala, moldura e tipografia
no instante em que o prefixo sai da lista de exceções. Se ela ficar longa, o prompt já manda
commit pequeno e frequente — dá para retomar sem perder nada.

### Acompanhar e retomar

`claude --resume f42-telas-itens` volta para a sessão de qualquer momento. Se ela estiver inchada
quando você voltar, `/compact foque no que falta do checklist, na lista de violações da régua e nas
rotas novas`. A transcrição é salva continuamente — queda de terminal não perde a sessão —, mas
quem segura o código é o git.

### Ao voltar: revisar o resultado

1. Leia `docs/RELATORIO-F42.md` e confira as **evidências**, não as afirmações — a contagem de
   violações da régua antes e depois, a tabela recurso-a-recurso, as duas contagens de "Em uso", a
   saída dos quatro comandos, o smoke.
2. `git diff v1.46.0..v1.47.0 -- src/lib/layout/consistencia.test.ts` — **este é o diff que merece
   os seus olhos**: é onde um redesenho que não deu certo se disfarça de teste atualizado.
3. `git diff v1.46.0..v1.47.0 -- supabase/` tem de vir **vazio**.
4. Rode você mesmo `npm run lint && npm run test && npm run contraste && npm run build` uma vez.
5. **Abra `/itens` e `/itens/historico` e olhe.** Esta fase é a única do plano cujo critério final
   é o seu olho: a dor D3 foi *"eu mesmo que projetei estou me perdendo"*. Se a tela nova não se
   parece com `/ativos` na primeira olhada, ela não passou — não importa o que os testes digam.
6. Confira que o que você usava continua lá: o filtro de filial, o de grupo, a busca, o export dos
   saldos, o export do histórico, o "Repetir último", a transferência e a conferência.
7. Se veio errado: **regra dos 2 strikes** — depois de duas correções que não pegaram, não emende.
   Uma sessão limpa com um prompt melhor supera a longa cheia de remendos; peça a re-geração deste
   prompt com o aprendizado.

---

## Suposições que fiz

1. **O arquivo mora em `docs/prompts/F42-telas-itens-ultracode.md`**, no padrão das ordens
   anteriores (F38, F39, F40, F41).
2. **Branch `f42-telas-itens`, merge na `main` e tag `v1.47.0`** — precedente da F40 e da F41, e o
   `CLAUDE.md` permite os dois caminhos. A versão sai da regra "fase → MINOR" e do `1.46.0` que a
   F41 publicou.
3. **Rollout completo até produção nesta run** (sua resposta de hoje). Sem migration, o
   irreversível aqui é só o deploy — e a Vercel guarda o anterior.
4. **Sem captura de tela** (sua resposta de hoje): as rotas entram no `ROTAS_PADRAO` do
   `capturar.mjs`, mas o script não roda nesta ordem.
5. **A coluna "Em uso" é DERIVADA, não lida de coluna nova.** Conferi a definição de
   `rel_saldo_itens` na `0027`: `em_uso = total + falta − estoque − atrelados` é exata nos dois
   ramos da fórmula. Se você preferir uma RPC nova, isso muda o plano — a F42 deixa de ser "sem
   migration" e passa a precisar do `RUNBOOK-BANCO.md` inteiro.
6. **O toggle `?visao=` morre como MODO mas os links antigos sobrevivem**, redirecionando ou sendo
   ignorados com graça. Escolhi não deixar isso a critério do agente: o smoke tem três entradas
   apostando nesse param, e um link antigo quebrado é a única coisa desta fase que o usuário vê
   antes de você.
7. **`transferir-item-dialog` pode terminar encolhido em vez de reescrito.** O plano pede o padrão
   do sistema; a `DIVIDA-TECNICA.md` diz que refatorar formulário sem teste de render troca dívida
   conhecida por risco. Deixei a saída explícita, com ata — se você quer a reescrita de qualquer
   jeito, diga isso ao agente ao colar o prompt.
8. **A versão anterior está em produção e estável.** A F41 subiu hoje; se algo dela ainda estiver
   pendente de conferência sua, vale fechar antes — esta ordem constrói em cima dela.
