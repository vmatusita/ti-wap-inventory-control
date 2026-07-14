# Sprint 3 — Refatorações estruturais (ordens de serviço)

Continuação do plano de dívida técnica (auditoria `/tech-debt`, ver `docs/DECISOES.md`
entradas de 2026-07-14 · Dívida técnica). Os Sprints 0–2 já foram entregues:
correções de runtime, rede de testes (Vitest) + CI, e consolidações de baixo risco.

O **Sprint 3** ataca os itens **estruturais** — os god-files e a duplicação pesada
que a fórmula da auditoria deixou por último (alto esforço, e arriscados sem rede de
testes). Por isso cada fase é uma **ordem separada**, para rodar **uma por sessão**.

## Como usar

1. Abra o Claude Code na raiz do repositório (ele lê o `CLAUDE.md` sozinho).
2. **Copie o bloco de UMA fase** — do cabeçalho `## Fase 3.x` até o `---` seguinte — e cole inteiro.
3. Modo autônomo: ele decide, executa, autoverifica, registra em `docs/DECISOES.md`, commita e faz push. Não cole duas fases juntas.
4. Antes de começar, confira que o working tree está limpo e o CI da fase anterior passou.

## Ordem e dependências

| Fase | O quê | Risco | Depende de |
|---|---|---|---|
| **3.1** | Extrair série/datas de `relatorios.ts` para módulo puro + testes | Baixo | — |
| **3.2** | Tabelas de relatório: hook + componentes compartilhados | Médio | — (independente) |
| **3.3** | `nova-movimentacao-form`: `CAMPOS_POR_TIPO` + decomposição | Médio | — (independente) |
| **3.4** | Extrair funções longas de `termos`/`movimentacoes` | Médio | — |
| **3.5** | Unificar motores de relatório v1/v2 (testes de caracterização antes) | **Alto** | 3.1 recomendado |
| **3.6** | Fatiar `queries/relatorios.ts` nos módulos restantes | Médio | 3.1 + 3.5 |

Ordem sugerida: **3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6** (baixo→alto risco; as puras/testáveis
primeiro para ampliar a rede antes dos refactors grandes). 3.2, 3.3 e 3.4 são independentes
entre si e do resto — podem ser feitas em qualquer ordem.

## Princípios que valem para TODAS as fases

- **Zero mudança de comportamento observável.** É refatoração: mesma saída, mesma UX, mesmos números. Nada de "aproveitar para" mudar regra de negócio, schema, RPC ou UI.
- **Verificação obrigatória ao fim:** `npm run lint`, `npm run test` e `npm run build` limpos. Onde houver lógica pura nova, **escreva testes Vitest** (a stack só testa função pura). Onde o refactor é de UI/queries (sem cobertura de teste), **use a skill `/verify`** — dirija o fluxo real no app e confira que a tela/relatório continua idêntico; não confie só no type-check.
- **Um commit por fase**, estilo do projeto: `refactor(tech-debt): fase 3.x — <resumo>` com trailer `Co-Authored-By`. Faça push na `main` (modo autônomo) só depois de tudo verde.
- **Registre em `docs/DECISOES.md`** (data · contexto · escolha · motivo) e atualize esta tabela/plano se descobrir algo que mude o escopo de uma fase seguinte.
- Se o arquivo real divergir do que a ordem descreve (linhas/nomes mudaram), **releia antes de editar** — não confie nos números de linha abaixo, eles são do estado de 2026-07-14.

---

## Fase 3.1 — Extrair a matemática de série/datas de `relatorios.ts` (puro + testes)

**Objetivo:** tirar toda a aritmética de calendário/série temporal de dentro de
`src/lib/queries/relatorios.ts` (o god-file de 1251 linhas) para um módulo **puro e
testável**, sem tocar em acesso a dados. Primeira fase de propósito: baixo risco, e
adiciona a rede de testes que desarrisca as fases 3.5/3.6.

**Contexto (auditoria):** em `src/lib/queries/relatorios.ts`, a seção ~linhas 274–440
mistura data-access com matemática de datas pura: `MESES_ABREV`, `granularidadeDoPeriodo`,
`rotuloMes`, `contarMeses`, `mesesDoIntervalo`, `chaveSemana`, `baldesCurtos`, além dos
"balde-builders" dentro de `serieMensal`/`serieCurta`. Há também **números mágicos** sem
nome (`dias <= 16` → granularidade dia; `dias <= 120` → semana; `contarMeses <= 24`; `CAP =
50_000`) e um offset de fuso `-03:00` hardcoded em string.

**Passos:**
1. Crie `src/lib/relatorios/serie.ts` e mova para lá **só as funções puras** de datas/série
   (granularidade, rótulos, contagem/lista de meses, chave de semana, montagem de baldes).
   As funções que fazem query (`serieMensal`, `serieCurta`, `getSerieMovimentacoes`) **ficam**
   em `relatorios.ts`, mas passam a **chamar** os helpers puros para toda a parte de cálculo.
2. Extraia os números mágicos como constantes nomeadas em `serie.ts`
   (`DIAS_MAX_GRANULARIDADE_DIA = 16`, `DIAS_MAX_GRANULARIDADE_SEMANA = 120`,
   `MESES_MAX_EIXO_PREENCHIDO = 24`, etc.).
3. Centralize o offset `-03:00` / `T23:59:59.999-03:00`: use o fuso de São Paulo já tratado
   em `src/lib/format.ts` (Intl) em vez do literal. Se precisar de um helper novo (ex.:
   `fimDoDiaSP(data)`), coloque-o em `format.ts` e teste-o.
4. Crie `src/lib/relatorios/serie.test.ts` com casos determinísticos (passe datas fixas):
   granularidade nos limites (16/17 dias, 120/121), lista de meses, chave de semana,
   preenchimento de eixo.

**Definição de pronto:** `relatorios.ts` menor; nenhuma função de query mudou de assinatura
pública; `serie.ts` 100% pura; testes novos verdes; `lint`+`test`+`build` limpos. Confira que
o gráfico do relatório ao vivo continua idêntico (skill `/verify` numa rota `/relatorios/[filial]`).

---

## Fase 3.2 — Tabelas de relatório: hook de filtros + componentes compartilhados

**Objetivo:** eliminar a duplicação massiva entre as 4 tabelas de relatório (a auditoria
mediu ~120 linhas quase idênticas entre `tabela-entradas` e `tabela-saidas`, mais células
copiadas nas 4).

**Contexto (auditoria):** `src/components/relatorios/tabela-entradas.tsx`,
`tabela-saidas.tsx`, `tabela-movimentacoes.tsx` e `tabela-transferencias.tsx` repetem:
- `const TODOS = '__todos'` (3–4×) e a barra de filtros `<div className="flex flex-wrap …
  print:hidden">` com 3 `<Select>` + botão "Limpar" (~50 linhas idênticas);
- os `useMemo` de `motivos`/`filiais`/`filtradas`/`temFiltro`/`resumo` (idênticos entre
  entradas e saídas);
- as células: data (`whitespace-nowrap tabular-nums text-muted-foreground` + `formatDate`),
  pílula de tipo (`pillTipo`/`rotuloTipo`), chamado (`{r.chamado ? \`#${r.chamado}\` : '—'}`),
  observação (`<ObsTooltip>` com `max-w` variando 160/200/220/240 sem padrão).

**Passos:**
1. Crie `useFiltrosTabela(rows, config)` (hook client) que devolve `{ filtradas, temFiltro,
   resumo, filtros, setFiltro, limpar }`. `config` declara os campos filtráveis (filial /
   categoria / motivo / tipo) — cada tabela passa os seus.
2. Crie `<FiltrosTabela>` (a barra com N `<Select>` + "Limpar"), dirigido pela mesma `config`.
   Aposente as cópias de `const TODOS`.
3. Crie células compartilhadas em `src/components/relatorios/celulas.tsx`: `CelulaData`,
   `PilulaTipo`, `CelulaChamado`, `CelulaObs` (com um `max-w` padronizado, decidido e
   registrado em DECISOES).
4. Reescreva as 4 tabelas usando o hook + componentes. Cada uma deve ficar bem menor.

**Cuidado:** não mude a saída visual nem os filtros disponíveis por tabela (entradas/saídas
têm motivo; movimentações tem tipo; transferências não tem essa barra). É dedup, não redesign.

**Definição de pronto:** as 4 tabelas usam o hook + componentes; `lint`+`test`+`build` limpos;
**verificação visual** com `/verify` numa rota de relatório — filtrar por filial/categoria/
motivo/tipo, "Limpar", e conferir que os chips de resumo e as células ficaram idênticos
(inclusive impressão `print:hidden`).

---

## Fase 3.3 — `nova-movimentacao-form`: `CAMPOS_POR_TIPO` + decomposição

**Objetivo:** quebrar o god-file `src/components/movimentacoes/nova-movimentacao-form.tsx`
(944 linhas) e acabar com a matriz "tipo × campos" espalhada como arrays de string em ~6
pontos, que é a fonte de bug se um tipo novo entrar.

**Contexto (auditoria):** o componente acumula: forma do `Config`, `construirItem` (switch
que replica quais campos cada tipo tem — dupla fonte de verdade com o Zod
`movimentacaoSchema`), máquina de passos 1/2/3, `registrar` com falha parcial, painel de
sucesso com diálogos de termo, e um passo-2 de ~290 linhas. As listas
`['saida','emprestimo']`, `['saida','emprestimo','reserva']`,
`['saida','emprestimo','devolucao']` aparecem repetidas no `construirItem` e no JSX.

**Passos:**
1. Crie uma **tabela de metadados por tipo** — `CAMPOS_POR_TIPO` — em
   `src/lib/validators/movimentacao.ts` (ou `src/lib/dominio.ts`), declarando para cada
   `TipoMovimentacao` quais campos se aplicam (colaborador/setor/motivo/chamado/termo/
   filial_destino/status_resultante) e quais são obrigatórios. **É pura → escreva testes.**
   Faça o `movimentacaoSchema` e o `construirItem` **derivarem** dessa tabela em vez de
   repetir arrays inline; a UI condicional do passo-2 também lê dela.
2. Dedup: extraia `montarItensInput()` — hoje o mesmo trecho (map + injeção de
   `status_resultante` no `ajuste`) está em `validarLote` e em `registrar`.
3. Decomponha em componentes: `PainelSucesso`, `PassoAtivos`, `PassoMovimentacao` (os campos),
   `PassoRevisao`. O componente-mãe vira orquestrador enxuto.

**Cuidado:** este é o fluxo central "anti-Excel" da F2. Nenhuma regra de transição ou campo
pode mudar — só a organização. Os facilitadores (atalho `N`, "repetir última", "duplicar",
data default, foco na busca) têm de continuar funcionando.

**Definição de pronto:** `CAMPOS_POR_TIPO` com testes; sem arrays de tipo espalhados;
componente-mãe pequeno; `lint`+`test`+`build` limpos; **dirija o fluxo com `/verify`** — um
lote com saída, devolução, transferência, ajuste e reserva, conferindo campos condicionais,
validações e a geração de termo no fim.

---

## Fase 3.4 — Extrair funções longas de `termos.ts` e `movimentacoes.ts`

**Objetivo:** reduzir a complexidade das duas funções mais longas das actions, sem mudar o
que fazem.

**Contexto (auditoria):**
- `src/lib/actions/termos.ts` → `gerarTermo` (~127 linhas, ~11 responsabilidades: valida,
  autentica, relê movimentações como fonte da verdade, monta payload, renderiza docx, remove
  órfãos do Storage+tabela, faz upsert, insere/atualiza linha, atualiza flag `termo_assinado`
  nos ativos, gera URL assinada, revalida).
- `src/lib/actions/movimentacoes.ts` → `registrarMovimentacoes` (~160 linhas: validação,
  dedupe, carga de estado, laço com regras de transição e montagem de row com casts).

**Passos:**
1. Em `termos.ts`, extraia funções privadas coesas: `renderizarDocx(template, dados)`,
   `persistirTermo(...)` (upsert no Storage + linha na tabela), `aplicarFlagTermo(ativoIds,
   data)` (o update condicional de `ativos.termo_assinado`). `gerarTermo` vira a orquestração.
2. Em `movimentacoes.ts`, extraia o corpo do laço por item (regras de transição, ex.:
   transferência ≠ filial atual, e a montagem da row) para uma função nomeada. Considere
   também tipar melhor `AtivoBasico.status` como `StatusAtivo` e reduzir o escape `campo()`
   (`item as unknown as Record<string, unknown>`) se a tabela `CAMPOS_POR_TIPO` da fase 3.3
   já existir — senão, deixe anotado como follow-up.

**Definição de pronto:** funções menores e nomeadas; comportamento idêntico; `lint`+`test`+
`build` limpos; **dirija com `/verify`** a geração de um termo (responsabilidade e devolução)
e o registro de um lote de movimentações, conferindo que arquivo/flag/pendência continuam
corretos.

---

## Fase 3.5 — Unificar os motores de relatório v1/v2 (com testes de caracterização)

**Objetivo:** acabar com os **dois motores paralelos** dentro de
`src/lib/queries/relatorios.ts` que recalculam as mesmas 5 agregações a partir de fontes
diferentes (v1 = view `LinhaEstoque`; v2 = estado reconstruído `EstadoAtivo`). É a fase de
**maior risco** — regra de negócio, sem cobertura de teste, e roda sob `service_role` para o
visualizador. Por isso: **testes de caracterização ANTES de refatorar.**

**Contexto (auditoria):** pares quase idênticos —
`kpisDeEstoque`/`kpisDeEstado`, `categoriaDeEstoque`/`categoriaDeEstado`,
`getDisponiveisPorModelo`/`disponiveisPorModeloDeEstado`,
`getReservadosComChamado`/`reservadosDeEstado`, `getEmManutencao`/`manutencaoDeEstado`. Já há
divergência de tratamento (o v1 exclui `descartado` por status; o v2 percorre buckets com
if/else e trata `emprestado` à parte), então bugs tendem a ser corrigidos em só um lado.
Também: o loop de paginação PostgREST se repete **7×** (com tetos divergentes 50k/100k/20k) e
"última movimentação por ativo" **3×**.

**Passos:**
1. **Rede de segurança primeiro:** com o banco de dev semeado (`npm run db:seed`), escreva um
   teste/roteiro de **caracterização** que congela a saída atual das 5 agregações (v1 e v2)
   para uma filial e um período fixos — guarde os números. Vai comparar depois.
2. Normalize as duas origens (view e estado reconstruído) para **um tipo comum** `EstadoAtivo[]`
   e mantenha **uma** implementação por agregação, consumida pelos dois caminhos. Se o v1 for
   só legado (abrir snapshots antigos), avalie e **documente** se dá para deprecá-lo.
3. Extraia os utilitários repetidos: `paginarTodos(fazPagina, { page, cap })` (uma constante
   única de página; decida e documente um `cap` único e justificado) e
   `ultimoPorAtivo(client, ids, coluna, { ate? })`.
4. Rode a caracterização de novo: **diff tem de ser zero**.

**Definição de pronto:** uma implementação por agregação; paginação e "última mov" via helper
único; caracterização idêntica antes/depois; `lint`+`test`+`build` limpos; **`/verify`** no
relatório ao vivo **e** gerando um snapshot novo (`/relatorios/gerados`), conferindo KPIs,
categorias, disponíveis, reservados e manutenção. Registre em DECISOES a decisão sobre o v1.

---

## Fase 3.6 — Fatiar `queries/relatorios.ts` nos módulos restantes

**Objetivo:** com a série já fora (3.1) e os motores unificados (3.5), quebrar o que sobrou do
arquivo em módulos coesos. Fase final, majoritariamente **mover + reexportar**.

**Contexto (auditoria):** mesmo depois de 3.1 e 3.5, `relatorios.ts` ainda concentra:
resolução de filial, KPIs/categoria de estoque atual, listas de estado, por-motivo/resumo,
pendências, últimas movimentações + mapeamento de linha, e os snapshots v1 e v2.

**Passos:**
1. Crie módulos sob `src/lib/relatorios/` (ou `src/lib/queries/relatorios/`): p.ex.
   `estoque.ts` (KPIs/categoria/listas de estado atual), `movimentacoes.ts` (MOV_SELECT/
   mapMovRows/últimas), `snapshot.ts` (getSnapshotRelatorio v1 + v2, já unificados). Mova as
   funções para os módulos por responsabilidade.
2. Mantenha a **API pública estável**: reexporte de `queries/relatorios.ts` (barrel) ou
   atualize os imports nos consumidores (páginas de relatório, `actions/relatorios.ts`,
   `queries/gerados.ts`). Consolide também os selects/tipos duplicados (`MOV_SELECT` vs
   `TAB_SELECT`, `RawMovRow` vs `RawTabelaRow`) num fragmento base.
3. Nenhuma lógica muda — só o endereço das funções.

**Cuidado:** não misture com mudança de comportamento. Se aparecer um bug de verdade no meio,
**anote e trate em ordem separada** (regra de escopo do CLAUDE.md).

**Definição de pronto:** `relatorios.ts` deixou de ser um god-file (cada módulo com uma
responsabilidade); imports resolvidos; `lint`+`test`+`build` limpos; **`/verify`** em
`/relatorios/[filial]`, no consolidado `geral` e num snapshot congelado — tudo idêntico.

---

## Depois do Sprint 3

Sobra o **Sprint 4** (endurecimento), fora do escopo destas ordens: rate-limit de senha
persistente (tabela Postgres, custo R$ 0) ou limitação documentada; e o viewer-sob-
`service_role` documentado como risco aceito + um teste de fronteira de filtro. Ver
`docs/DECISOES.md`.
