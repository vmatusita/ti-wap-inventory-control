# Relatório da F30 — Onda C1: seleção múltipla, impressão completa, sidebar colapsável

**Ordem de serviço:** [`docs/prompts/F30-onda-c1-selecao-impressao-sidebar-ultracode.md`](prompts/F30-onda-c1-selecao-impressao-sidebar-ultracode.md)
**Plano:** [`docs/PLAN-F30.md`](PLAN-F30.md) · **Fonte:** [`docs/ANALISE-UX-2026-08-07.md`](ANALISE-UX-2026-08-07.md) §10 (ATV-03, REL-01, UXG-13)
**Data:** 09/08/2026 · **Modo:** autônomo · **Migrations:** nenhuma · **Dependências novas:** nenhuma

Três recursos independentes, sem nenhum toque em banco. A segunda metade da Onda C
(transferência de itens, modo conferência) é a F31 e não foi antecipada.

---

## 1. O que mudou, por recurso

### Recurso 1 · ATV-03 — o lote de movimentação nasce da lista de ativos

O fluxo de movimentação é de lote por natureza, mas o lote não nascia de onde o operador filtra:
quem separava "notebooks em estoque da Matriz" para emprestar cinco recomeçava a seleção **dentro**
do wizard, um a um — com `buscarAtivosResumoPorIds` pronto no repositório desde a F10 e sem ninguém
para chamá-la.

- **Coluna de seleção** em `/ativos` (`ativos-table.tsx`), com o *row selection* da TanStack e
  `getRowId` no id do ativo — as chaves do estado SÃO os ids que vão para a URL. Caixa por linha com
  `aria-label` nomeando o patrimônio (ou "ativo sem patrimônio", F7E), caixa de cabeçalho com estado
  `indeterminate` na seleção parcial. A coluna só existe para quem escreve.
- **Barra de ação** (`barra-selecao-ativos.tsx`), sticky no rodapé, com "**N ativos selecionados** ·
  Movimentar · Copiar patrimônios · Limpar seleção". Irmã do `div.overflow-hidden` da tabela, porque
  `position: sticky` não funciona dentro de um ancestral com `overflow: hidden`.
- **`/movimentacoes/nova?ativos=…`** — `parseIdsDeAtivos` (puro) peneira por UUID, colapsa repetidos,
  preserva a ordem de chegada e corta no teto; o servidor resolve com `buscarAtivosResumoPorIds` e o
  passo 1 abre com o lote. Quem ficou de fora é **nomeado** no banner âmbar da MOV-14 (F27).
- **Teto** = `MAX_LOTE_MOVIMENTACAO` (30), nunca digitado. O 31º é recusado com toast; "marcar todos"
  numa página de 100 leva 30 e diz quantos ficaram.

**Arquivos novos:** `src/lib/movimentacoes/lote-url.ts` (+`.test.ts`),
`src/components/ativos/selecao-ativos.ts` (+`.test.ts`), `src/components/ativos/barra-selecao-ativos.tsx`.
**Alterados:** `ativos-table.tsx`, `(app)/ativos/page.tsx`, `(app)/movimentacoes/nova/page.tsx`,
`nova-movimentacao-form.tsx`.

### Recurso 2 · REL-01 — o relatório impresso volta a ser arquivável

A4 retrato mede ~718px de viewport (Chrome, margens padrão): `sm:` casa, `md:`/`lg:`/`xl:` não. Toda
coluna escondida por breakpoint sumia do papel — e a linha expansível que a revelaria no celular é
`print:hidden`. O impresso, que substitui o e-mail que se guarda, saía **sem colaborador, sem termo e
sem observação**.

- As **57 ocorrências** de coluna escondida nas **seis** tabelas (saídas, entradas, transferências,
  movimentações de itens, a grade v1 dos snapshots pré-F3B e os grupos de itens) ganharam a variante
  de impressão que as reexibe.
- Uma classe `rel-print-compacta`, **escopada às seis tabelas**, encolhe fonte (10px) e padding
  (2px 4px) e solta o `whitespace-nowrap` dentro do `@media print`. Mais duas regras: o contêiner do
  `<Table>` do shadcn deixa de recortar no papel, e `thead` vira `table-header-group` explicitamente.
- **Nada mudou na tela**: toda classe nova é de mídia print.
- O comentário de projeto de `linha-expansivel.tsx` foi corrigido — o `print:hidden` de lá continua,
  mas por outro motivo: o papel já tem a informação.

### Recurso 3 · UXG-13 — sidebar colapsável e agrupada

- **Botão "Recolher"** no pé da sidebar (`sidebar-lateral.tsx`, que tirou o `<aside>` do Server
  Component), com `aria-expanded`, `aria-controls`, `aria-keyshortcuts` e ícone que comunica direção.
- **Tecla `[`**, registrada em `atalho-global.tsx` junto dos outros atalhos globais, reusando as
  guardas `editando()`/`modalAberto()` que já existiam.
- **Modo só-ícones** com `Tooltip` por hover **e por foco**; o **selo de pendências continua visível**,
  posicionado sobre o ícone.
- **Separadores de grupo** antes de "Administração" e de "Ajuda", **nunca no primeiro item** da lista
  já filtrada por cargo — o Consulta não vê divisor órfão.
- **Preferência por dispositivo** (`localStorage`), padrão expandida, **sem flash**: o estado visual
  mora num atributo do `<html>` escrito por script inline antes da primeira pintura; o React cuida só
  do comportamento. Leitura por `useSyncExternalStore`.
- **Mobile não mudou**: o Sheet do hambúrguer monta a mesma `SidebarNav` sem `colapsada`.

---

## 2. Checklist de spec — autoverificado

### Recurso 1 · ATV-03

| # | Sub-bullet da ordem | ✔ | Evidência |
|---|---|---|---|
| 1 | Coluna de seleção (TanStack row selection) | ✅ | `ativos-table.tsx:349-360` — `getRowId`, `state.rowSelection`, `enableRowSelection` |
| 2 | `aria-label` por linha nomeando o patrimônio | ✅ | `ativos-table.tsx:230` — `Selecionar ${patrimonio ?? 'ativo sem patrimônio'}` |
| 3 | Cabeçalho com `indeterminate` na seleção parcial | ✅ | `estadoDoCabecalho` + 3 testes (`selecao-ativos.test.ts`) |
| 4 | Visível só para quem escreve | ✅ | `if (escreve)` na coluna + prop obrigatória vinda de `page.tsx:188` |
| 5 | Barra com 1+ selecionados, sticky | ✅ | `barra-selecao-ativos.tsx` — `sticky bottom-0` + espaçador, irmã do `overflow-hidden` |
| 6 | Textos "N selecionados · Movimentar · Copiar patrimônios · Limpar seleção" | ✅ | idem, com pluralização |
| 7 | Movimentar navega para `?ativos=` | ✅ | `movimentarSelecionados()` |
| 8 | Wizard resolve com `buscarAtivosResumoPorIds` | ✅ | `nova/page.tsx` ramo `ativosParam` |
| 9 | **Deduplicar** ids | ✅ | `parseIdsDeAtivos` — inclusive normalizando caixa; 2 testes |
| 10 | Ids não encontrados → banner âmbar **nomeando quantos** | ✅ | `avisoDoLoteInicial` + banner de `nova-movimentacao-form.tsx` |
| 11 | `key` derivada dos params (armadilha F26) | ✅ | `'ativos'` em `PARAMS_SEMEADORES` — a lista de onde a `key` sai |
| 12 | Teto: 31º recusado com toast citando o teto | ✅ | `alternarSelecao` + toast; teste "recusa o 31º" |
| 13 | `?ativos=` com >30: monta 30 e avisa quantos sobraram | ✅ | corte em `parseIdsDeAtivos` + frase do `avisoDoLoteInicial`; 2 testes |
| 14 | Copiar patrimônios, um por linha, toast de sucesso | ✅ | `copiarPatrimonios()` + `textoCopiavel` |
| 15 | Toast de **erro** no caminho sem clipboard (UXG-08a) | ✅ | guard de `navigator.clipboard?.writeText` + `try/catch`, mensagem idêntica à da F27 |
| 16 | Seleção por página; trocar página/filtro/busca limpa | ✅ | `podarForaDaPagina` no efeito de `idsDaPagina`; ata em `DECISOES.md` |
| 17 | Nenhuma outra ação em massa, nenhuma outra lista | ✅ | diff restrito aos arquivos listados |

### Recurso 2 · REL-01

| # | Sub-bullet | ✔ | Evidência |
|---|---|---|---|
| 1 | Todas as tabelas com coluna escondida cobertas | ✅ | grep: **0** ocorrências sem contraparte; `impressao-colunas.test.ts` varre também o resto de `components/relatorios/` |
| 2 | Compactação para caber em A4 retrato | ✅ | medido: 11 colunas em **685px** numa página de **718px**, sem transbordar |
| 3 | Chevron continua fora do papel **sempre** | ✅ | medido: `display:none` sob mídia print; teste nas 5 tabelas que têm chevron |
| 4 | Escolha colunas × `LinhaDetalhe` registrada **por tabela** | ✅ | decisão única para as seis, com os quatro motivos, em `DECISOES.md` |
| 5 | Vale para ao vivo, snapshot e visualizador por senha | ✅ | os três passam por `corpo-relatorio.tsx`; as duas páginas usam `resolverAcessoRelatorio()` |
| 6 | Cabeçalhos repetem na quebra de página | ✅ | `thead { display: table-header-group }`; confirmado num PDF de 4 páginas gerado pelo Chrome com 120 linhas fictícias |
| 7 | Não regride REL-13a (observação completa) | ✅ | medido: `white-space: normal` na observação sob print; teste trava a classe da F27 |
| 8 | Legendas F17 e estornadas F16 saem como hoje | ✅ | não têm `print:hidden`; nenhum arquivo delas foi tocado |
| 9 | Nada muda na tela | ✅ | todas as classes novas são `print:`; a compactação vive dentro do `@media print` |

### Recurso 3 · UXG-13

| # | Sub-bullet | ✔ | Evidência |
|---|---|---|---|
| 1 | Toggle só-ícones no desktop (≥md) | ✅ | medido: **240px → 64px**, +176px para o conteúdo |
| 2 | `aria-label`/`aria-expanded` corretos, ícone que comunica direção | ✅ | `sidebar-lateral.tsx`; teste estrutural cobra os três |
| 3 | Ícone com Tooltip no hover **e no foco** | ✅ | `Tooltip` do Radix (abre no foco), `TooltipProvider` já montado |
| 4 | Selo de pendências continua visível recolhida | ✅ | medido: `position:absolute`, largura > 0 no estado recolhido |
| 5 | Preferência em `localStorage`, padrão expandida | ✅ | `sidebar-preferencia.ts` + 20 testes (só `'recolhida'` recolhe) |
| 6 | Sem flash de layout na hidratação | ✅ | script inline antes da pintura + CSS; teste proíbe a largura virar classe do React |
| 7 | Atalho `[` respeitando `editando()`/`modalAberto()` | ✅ | teste que exige o `[` DEPOIS das quatro guardas no `onKey` |
| 8 | Ajuda de atalhos ganha a linha nova | ✅ | `limites-e-atalhos.ts` + `mapa-das-telas.ts` ("três" → "quatro") |
| 9 | O quadro do `?` (F29) idem | ✅ | `atalhos-dialog.tsx`; o teste da ajuda passou a **derivar** a lista desse quadro |
| 10 | Separadores antes de Administração e de Ajuda | ✅ | `separadorAntes` + teste que prova serem só esses dois |
| 11 | Consulta sem divisor órfão | ✅ | guarda `indice > 0` sobre a lista **já filtrada**; teste |
| 12 | Mobile não muda | ✅ | corrigido após a revisão (§4); medido: Sheet byte a byte igual nos dois estados |
| 13 | Não reordenar/esconder itens, não redesenhar o header | ✅ | `ITENS` só ganhou uma flag; `app-header.tsx` intocado |

---

## 3. Saídas reais

```
npm run lint    → (sem saída: eslint limpo)
npm run test    → Test Files 105 passed (105) · Tests 2241 passed (2241)
npm run build   → compilado, 24 rotas, sem erro de tipo
npm run contraste → 57 pares ✅, nenhum reprovado
```

Baseline da fase: **2.131** testes em 100 arquivos → **2.241** em 105 (**+110**).

| Arquivo de teste novo | Testes |
|---|---|
| `src/lib/movimentacoes/lote-url.test.ts` | 17 |
| `src/components/ativos/selecao-ativos.test.ts` | 22 |
| `src/components/relatorios/impressao-colunas.test.ts` | 22 |
| `src/components/layout/sidebar-preferencia.test.ts` | 20 |
| `src/components/layout/sidebar-colapso.test.ts` | 26 |

Mais 3 asserções acrescentadas a testes existentes da ajuda (`gestao.test.ts`, `referencia.test.ts`).

---

## 4. A revisão adversarial

Quatro frentes independentes revisaram os três recursos e o escopo em contexto fresco; cada achado
passou por **dois céticos com lentes diferentes** (uma técnica, uma de requisito) e só sobreviveu o
que nenhum dos dois derrubou. **Dois defeitos reais no código**, os dois corrigidos em `c0b0a2f`:

1. **O modo só-ícones vazava para o menu do celular** (gravidade: bloqueia). Só a regra de LARGURA
   estava ancorada no `<aside>`; rótulo, item e selo eram seletores soltos — e o Sheet do hambúrguer
   monta a MESMA `SidebarNav`, com os mesmos `data-sidebar-*`. Recolher no computador e depois
   estreitar a janela deixava o **menu de toque** só com ícones, quebrando o requisito "o mobile não
   muda". As três regras passaram a descender de `[data-sidebar-lateral]`.
2. **A sincronia entre abas que o código prometia não existia.** O evento `storage` só dispara nas
   OUTRAS abas, e o atributo do `<html>` é local a cada uma: a aba que apenas ouvia ficava com o React
   dizendo "recolhida" e o CSS mostrando o menu inteiro — `aria-expanded` mentindo sobre a tela. O
   ouvinte passou a reconciliar o atributo **antes** de avisar o React.

Os dois passavam por build, lint e as 2.238 asserções de então — inclusive pelo teste estrutural
desta fase, que conferia a **existência** das regras e não o **escopo** delas. Ele agora exige que
toda regra do modo recolhido desça do `<aside>` e cobra a reconciliação do ouvinte.

Dois achados foram **refutados** e não viraram mudança: (a) o wrapper `overflow-hidden` das tabelas
supostamente impediria a quebra de página no papel — um cético gerou um PDF real com o Chrome
headless, 120 linhas fictícias, e obteve 4 páginas com o cabeçalho repetido em todas; (b) um caso
residual do banner de rascunho que só ocorre quando **todos** os ids do link somiram, e que
pré-existe à fase.

---

## 5. Os roteiros manuais

Sem Supabase local (o uso de Docker foi vetado durante a execução) e com `.env.local` apontando para
**produção**, os roteiros foram executados sobre uma **bancada** com marcação real e dados **100%
fictícios** (`WAP0001234`, "Fulano de Tal"), carregando o **CSS compilado do `npm run build`** —
nenhum dado de produção foi lido, exibido ou capturado.

### Roteiro A — impressão do relatório (REL-01)

1. Bancada com a marcação de `tabela-saidas` (12 colunas, incluindo o chevron), viewport em **718px**
   (A4 retrato, Chrome, margens padrão).
2. **Na tela, antes:** visíveis apenas `(chevron) · Data · Categoria · Patrimônio · Tipo · Motivo` —
   **5 colunas de conteúdo**. É o defeito REL-01, reproduzido.
3. Aplicada a mídia print (as regras dos blocos `@media print` da folha compilada, extraídas
   recursivamente — as variantes do Tailwind vivem dentro de `@layer`).
4. **No papel, depois:** `Data · Filial · Categoria · Marca/Modelo · Patrimônio · Tipo · Motivo ·
   Chamado · Colab./Setor · Termo · Obs.` — **11 colunas**.
5. Chevron `display:none`; linha de detalhe `display:none`; fonte 10px; padding `2px 4px`;
   `white-space: normal` (inclusive na observação, REL-13a preservada); contêiner `overflow: visible`;
   `thead: table-header-group`; sidebar `display:none`.
6. **Largura da tabela: 685px numa página de 718px — não transborda.**

### Roteiro B — sidebar colapsável (UXG-13)

1. Bancada em **1366×768** com o `<aside>` e uma réplica do Sheet do hambúrguer **fora** dele.
2. Expandida: aside **240px**, conteúdo **1111px**, rótulos visíveis, selo em fluxo normal.
3. Recolhida: aside **64px**, conteúdo **1287px** (**+176px**), rótulos ocultos, selo
   `position:absolute` e **ainda visível**.
4. Voltando a expandir: **idêntico ao estado inicial**.
5. Em **718px** (abaixo de `md`) com a preferência recolhida: o Sheet fica **byte a byte igual** nos
   dois estados — o requisito "mobile não muda" verificado depois da correção da §4.

> As transições de CSS não avançam no painel do navegador desta sessão (a aba não compõe quadros), o
> que congela a largura no valor inicial da animação. As medições acima foram feitas com as
> transições desligadas, para isolar o **contrato** da animação.

### Roteiro C — seleção múltipla (ATV-03) — **NÃO EXECUTADO**

O roteiro exigia "registrar de verdade **em ambiente com dados fictícios**". Esse ambiente não
existe nesta máquina: não há Supabase local (Docker vetado), `.env.local` aponta para produção e não
há credenciais de operador para uma sessão logada. Registrar movimentação de teste em produção
contraria a regra permanente nº 5 do `CLAUDE.md`, e seed fictício em produção é proibido. **Pendência
declarada — ver §7.**

O que **foi** verificado deste recurso: `npm run build` e `tsc --noEmit` limpos (o contrato de props
entre a lista, a página do wizard e o formulário fecha), **39 testes puros** cobrindo teto, dedupe,
UUID inválido, ordem, poda por página, texto copiável e cada frase do aviso, e a revisão adversarial
dedicada, que não achou defeito neste recurso.

---

## 6. Decisões registradas

Cinco atas novas em [`docs/DECISOES.md`](DECISOES.md), todas de 09/08/2026:

1. **A seleção da lista de ativos é POR PÁGINA** — e a poda existe porque, sem ela, a barra mentiria.
2. **O teto do `?ativos=` e a peneira de UUID** — inclui a armadilha do `PARAMS_SEMEADORES` e a
   precedência declarada `duplicar > ativos > ativo > tipo`.
3. **Impressão: COLUNAS, não `LinhaDetalhe`** — os quatro motivos e a armadilha da ordem da cascata.
4. **O colapso da sidebar é CSS; o React só cuida do comportamento** — o mecanismo único e o porquê.
5. **O que esta fase NÃO pôde verificar** — a pendência do roteiro C, registrada como decisão.

---

## 7. Pendências e backlog novo

- **Roteiro C (ATV-03 ponta a ponta) por executar.** Precisa de um ambiente com dados fictícios: um
  Supabase local (`supabase start` + `npm run db:seed`) ou uma conta de operador de teste. O passo a
  passo está na §5 da ordem de serviço; convém conferir também o teclado (Tab alcança a caixa e a
  barra; Espaço marca sem abrir a ficha) e o cargo Consulta sem coluna de seleção.
- **`package-lock.json` chega sujo no repositório** (o npm no Windows remove campos `libc` de
  dependências opcionais). Sujeira alheia a esta fase — **não tocada**, e não commitada.
- **Backlog novo:** (a) preservar a seleção **entre páginas** de `/ativos` (hoje é por página, por
  decisão); (b) o scanner do Tailwind lê `docs/` — uma classe citada em documentação vira regra morta
  no CSS de produção (`print:text-[11px]` está no bundle por causa da própria análise de UX); (c) a
  `tabela-movimentacoes.tsx` (grade v1) ganhou impressão completa mas continua sem chevron nem linha
  de detalhe no celular, onde as colunas escondidas seguem inalcançáveis.
- **Smoke de produção não executado:** `scripts/smoke/smoke-prod.mjs` exige `SMOKE_EMAIL` e
  `SMOKE_SENHA`, que não existem neste ambiente. Sem elas, só a parte A (rotas sem sessão) rodaria.

---

## 8. O que este relatório NÃO prova

- **A impressão foi conferida em simulação de mídia, não em papel físico** nem no diálogo nativo de
  impressão do Chrome (que é uma janela do sistema, fora do alcance da automação). O que está provado
  é o **contrato de CSS**: quais colunas o navegador exibe sob `@media print` a 718px, com que fonte,
  padding e quebra de linha, e que a tabela mais larga cabe na página. Margens não-padrão, impressoras
  com área imprimível menor ou dados muito mais longos que os fictícios podem exigir "Paisagem" — a
  ajuda diz isso ao operador.
- **A seleção múltipla não foi exercitada contra um banco.** Nenhuma movimentação foi registrada por
  este caminho; o que existe é tipo, teste puro e revisão. O primeiro registro real será o do Johnny.
- **Nada foi verificado com dados reais** — por escolha e por regra. Toda medição saiu de marcação
  fictícia, e nenhuma captura de produção foi feita.
- **Tooltips, foco e leitor de tela não foram testados com tecnologia assistiva de verdade.** O que
  está provado é a presença e a coerência dos atributos ARIA, não a experiência real do NVDA.
- **A sincronia entre abas foi corrigida por leitura de código**, não observada com duas janelas
  abertas: o teste que a cobre é estrutural (exige a reconciliação antes do aviso), não funcional.
- **Os testes novos são majoritariamente estruturais** (leem o código-fonte). Eles impedem a
  regressão silenciosa de decisões de CSS que nenhum teste de comportamento alcançaria — mas um teste
  estrutural confirma que a regra existe, não que ela produz o pixel certo. Foi exatamente essa a
  brecha por onde o vazamento para o mobile passou, e o teste foi endurecido depois.
- **O deploy não foi observado.** A Vercel deploya a `main` sozinha; este relatório termina no push.
