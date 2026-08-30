# Relatório F40 — sistema de design: fundação + piloto `/ativos`

Execução autônoma de **30/08/2026**, na branch `f40-design-system`, a partir da `main` em `0ea3fed`
(v1.44.2). Entrega as **duas primeiras frentes** de [`docs/PLANO-DESIGN-SYSTEM.md`](PLANO-DESIGN-SYSTEM.md):
a fundação e o piloto em `/ativos`. As frentes **a**, **b**, **c** e **d** ficam para ordens próprias.

Plano de execução: [`docs/PLAN-F40.md`](PLAN-F40.md). Atas: [`docs/DECISOES.md`](DECISOES.md),
**dez** entradas em 2026-08-30.

**A promessa desta fase, e ela está medida abaixo: nenhuma cor renderizada mudou.**

---

## 1. Linha de base revalidada — e a única divergência

Os quatro comandos rodaram na `main` limpa **antes da primeira edição**. Nenhuma falha
pré-existente.

| medida | plano §7 | medido em 30/08/2026 | veredito |
| --- | ---: | ---: | --- |
| `npm run lint` | 0 problemas, exit 0 | exit 0 | ✅ |
| `npm run contraste` | exit 0, 85 pares | exit 0, **85 pares** | ✅ |
| `npm run test` | 2.846 testes em **137** arquivos | 2.846 testes em **140** arquivos | ⚠️ **diverge** |
| `npm run build` | limpo | exit 0 | ✅ |
| classes de paleta crua | 555 em 60 arquivos | 555 em 60 | ✅ |
| molduras `rounded-* border` | 190 em 99 arquivos | 190 em 99 | ✅ |
| `<h1>` à mão | 19 | 19 | ✅ |
| passos fora da escala | 51 | 51 | ✅ |
| `text-[Npx]` | 49 | 49 | ✅ |
| `border-dashed` à mão | 23 | 23 | ✅ |
| `w-[NNNpx]` | 32 | 32 | ✅ |
| consumidores de `var(--chart-N)` | 0 | 0 | ✅ |
| rotas (`page.tsx`) | 32 | 32 | ✅ |
| versão no ar | 1.44.2 | 1.44.2 | ✅ |

**A divergência:** o plano diz 137 arquivos de teste; são **140**. O número de TESTES bate
(2.846). O plano foi corrigido na mesma entrega (`docs/PLAN-F40.md` §0 registra os dois).

**Um achado da própria linha de base, e ele decidiu o desenho de um teste:** a varredura ingênua por
`<h1` devolve **22**, mas só **19** são `<h1>` de verdade — os outros três são **comentários** que
citam `<h1>` em prosa (`admin/importar/page.tsx:40`, `relatorios/gerados/[id]/page.tsx:15`,
`relatorios/[filial]/page.tsx:35`). É a prova antecipada de por que `consistencia.test.ts` remove
comentários antes de casar.

---

## 2. O que mudou, por arquivo, e por quê

### 2.1 Fundação — os componentes de sistema (novos)

| arquivo | o que é | por quê |
| --- | --- | --- |
| `src/components/layout/pagina.tsx` | `Pagina` · `CabecalhoDaPagina` · `SecaoDaPagina` · `LARGURAS` · `MEDIDA_DE_FORMULARIO` | Fecha os 4 ritmos verticais das 32 rotas num só (`gap-6`), consolida os 19 `<h1>` à mão e **absorve o `LinkAjuda`** — a origem dos 5 arranjos de gap do achado 2. Alinha à esquerda, sem `mx-auto`: uma linha vertical no produto inteiro. |
| `src/components/layout/aviso.tsx` | `Aviso` (erro · atenção · informação) | A intenção decide a cor **e** o papel ARIA, juntos — corrige de passagem a assimetria de 8:1 entre `role="alert"` (39) e `aria-live` (5). **Criado e não aplicado** — ver §5. |
| `src/components/layout/cartao-de-metrica.tsx` | `CartaoDeMetrica` · `GradeDeMetricas` | As 5 implementações do achado 9, com a ordem de leitura invertida entre duas delas. Rótulo→número, e o `tabular-nums` volta ao `kpi-tiles`, o único dos cinco que o perdeu. |
| `src/components/layout/casco-de-autenticacao.tsx` | `CascoDeAutenticacao` | As 4 portas do sistema, com `<h1>` de verdade (`subtituloVisivel={false}` deixa o título `sr-only` no login, que hoje não mostra subtítulo). **Criado e não aplicado** — é a frente d, como a ordem manda. |
| `src/components/layout/quadro-de-tabela.tsx` | `QuadroDeTabela` | Um `Card` sem respiro vertical. As listas emolduravam a mesma `<Table>` com 4 raios e 3 traços diferentes. |
| `src/components/layout/confirmacao-digitada.tsx` | `ConfirmacaoDigitada` | A caixa "digite X para confirmar", copiada em 4 telas — e uma delas já tinha ficado sem `role="alert"` (F29/UXG-05). A **régua** de igualdade continua em cada tela, de propósito: o servidor de cada uma compara de um jeito. |
| `src/lib/layout/texto-fonte.ts` | `semComentarios` | O parser que os dois testes compartilham. Módulo, e não cópia: tem 40 linhas e é um parser — duas cópias não fariam o teste falhar, fariam ele **medir outra coisa em silêncio**. |

### 2.2 Fundação — os tokens

| arquivo | o que mudou |
| --- | --- |
| `src/app/globals.css` | **+156 linhas, 0 alteradas.** As 9 famílias `--selo-*` nos dois temas (36 valores `oklch` copiados do `theme.css` do Tailwind), os 18 apelidos no `@theme inline`, as 9 tintas `--grafico-*` e a conversão do anel do `Card` em borda dentro do `@media print` que já existia. |
| `src/lib/dominio.ts` | `STATUS_META`, `TIPO_PILL`, `PILL_NEUTRA`, `TIPO_LANC_PILL` e `STATUS_CHART_COLOR` deixam de escrever paleta e hex. **72 → 0** classes/hex no arquivo. |
| `src/lib/relatorios/rotulo-grafico.ts` | Os 9 `--grafico-*` entraram em `TOKEN_PARA_HEX`, e o export virou público. **Sem isso o rótulo de todo segmento sairia branco sobre fundo claro, em silêncio** — é a armadilha que `dominio.ts` documenta desde a F32. |
| `scripts/contraste.mjs` | **+25 pares** (18 de selo, 7 do `Aviso`). De 85 para **110**. |

### 2.3 Fundação — os dois testes

**`src/lib/layout/consistencia.test.ts`** — 9 regras, 341 asserções, no molde de
`sidebar-colapso.test.ts` (lê texto-fonte, ambiente `node`, zero dependência nova).

| # | regra | como reprova |
| ---: | --- | --- |
| 1 | um `<h1>` só | `<h1` fora dos 7 arquivos do SISTEMA |
| 2 | uma origem de largura | `max-w-*` de container fora do SISTEMA (conteúdo `xs`/`sm`/`md`/`full`/… segue livre, e a superfície de portal não é página); `mx-auto` **+** `max-w-*` no MESMO `className`; e `style={{ maxWidth }}` |
| 3/4 | a escala | passo fora de `{0,0.5,1,1.5,2,3,4,6,8,12,16,auto,px}`, e valor arbitrário |
| 4b | não zere o eixo que pediu | `p-N` junto de `py-0`/`px-0` na MESMA `className` |
| 5 | sem tamanho arbitrário | `text-[Npx]` e `w-`/`min-w-`/`max-w-[NNNpx]` |
| 6 | uma moldura só | `rounded-{sm..4xl}` (inclusive direcional) junto de `border` cru |
| 7 | toda rota migrada no casco | rota sem `<Pagina>` ou sem `<CabecalhoDaPagina>` |
| 8 | esqueleto casa com a tela | a largura do `<Pagina>` da `page.tsx` ≠ a do `loading.tsx` |

**A lista de exceções** é **agrupada por frente** (a · b · c · d), com o comentário dizendo que cada
frente apaga as suas linhas. É por prefixo de diretório onde a frente inteira sai junto, e por
ARQUIVO em `src/components/layout/` — porque um prefixo ali isentaria também o componente de
sistema que alguém criasse amanhã e esquecesse de pôr em `SISTEMA`. Há um teste que reprova
**exceção morta** (entrada que não alcança mais nenhum arquivo) e outro que exige que as 3 rotas do
piloto estejam **fora** dela.

**`src/lib/dominio/cores.test.ts`** — 37 asserções. Três blocos:

1. **O miolo, absoluto:** `dominio.ts` não tem paleta de fábrica nem hex — `toBeNull()` de verdade.
2. **A catraca:** teto declarado que só desce, com a metade que **obriga a baixá-lo** quando o total
   desce (sem ela o número congelaria e a catraca viraria enfeite).
3. **A trava TS↔CSS:** cada família tem fundo e tinta nos dois temas, apelido no `@theme inline`,
   valor **literal** (nunca `var()`, que o medidor ignora em silêncio), e os 9 hex de
   `TOKEN_PARA_HEX` batem hex a hex com os `--grafico-*` do CSS.

### 2.4 Piloto — as 3 rotas de `/ativos`

| arquivo | o que mudou |
| --- | --- |
| `ativos/page.tsx` | `space-y-5` → `<Pagina>`; cabeçalho à mão → `<CabecalhoDaPagina>` com `ajuda="lista-de-ativos"` |
| `ativos/loading.tsx` | monta o mesmo `<Pagina>`; moldura à mão → `Card` |
| `ativos/[id]/page.tsx` | `<Pagina>` + `<CabecalhoDaPagina>` com `titulo` ReactNode (o `tabular-nums` sobrevive) e `aoLado` (copiar + crachá); 3 molduras → `Card`; 2 `<h2>` de 18px → `<SecaoDaPagina>` (16px); `p-2.5` → `p-3`; `gap-x-5` → `gap-x-6` |
| `ativos/[id]/loading.tsx` | monta o mesmo `<Pagina>` (os `Skeleton` continuam `Skeleton` — ver §4.1) |
| `ativos/novo/page.tsx` | `mx-auto max-w-3xl` → `<Pagina>` cheia + `MEDIDA_DE_FORMULARIO` no contêiner dos campos |
| `ativos/novo/loading.tsx` | monta o mesmo `<Pagina>` (divergia em DUAS coisas: `space-y-5` e a largura sem `mx-auto`); moldura → `Card` |
| `ativos-table.tsx` | moldura à mão → `<QuadroDeTabela>` (que é `Card` + `border bg-transparent py-0 ring-0`) |
| `ativos-filtros.tsx` | `w-[150px]` → `w-40` |
| `ativos-paginacao.tsx` | `w-[140px]` → `w-36` |
| `barra-selecao-ativos.tsx` | moldura → `Card` com `border ring-0`, mantendo `sticky`, o `env(safe-area-inset)` e a sombra |
| `estornar-dialog.tsx` | `rounded-md border bg-muted/40` → `Card` |
| `linha-do-tempo.tsx` | 3 `text-[11px]` → `text-xs`; 2 molduras → `Card`; `py-10` → `py-12` no vazio (que NÃO virou `EstadoVazio` — ver §4.1) |
| `pendencias-item-ficha.tsx` | 2 molduras → `Card` |
| `termos-da-ficha.tsx` | moldura → `Card`; `<p>` solto → `EstadoVazio` inline; `py-2.5` → `py-3` |

**Fora, por decisão da ordem:** `nova-compra-form.tsx` (1.412 linhas, 30 `useState`).

### 2.5 Um teste existente foi alterado — e está registrado

`src/lib/ajuda/registry.test.ts` provava "a tela leva ao '?' declarado na matriz" procurando
`<LinkAjuda pagina="…">` na fonte da `page.tsx`. O `CabecalhoDaPagina` **absorveu** o `LinkAjuda`,
então `/ativos` passou a declarar o alvo pela prop `ajuda` — e o teste reprovou. O detector aprendeu
a enxergar `ajuda="…"` também. **O fato que o teste guarda não mudou; mudou o caminho por onde ele é
dito.** Ata em `docs/DECISOES.md`.

---

## 3. A prova do critério 2 — a tabela cor por cor

**As 18 razões novas batem com as 18 antigas, casa decimal por casa decimal, nas 9 famílias × 2
temas.** À esquerda, o par de paleta que a classe escrevia antes da F40 (medido com
`node scripts/contraste.mjs --par "<texto> sobre <fundo>" --tema <tema> --px 11`); à direita, o par
de token que `npm run contraste` imprime hoje sob o item `F40`.

| família | tema | par ANTIGO (paleta) | razão | par NOVO (token) | razão | ✔ |
| --- | --- | --- | ---: | --- | ---: | :-: |
| em-estoque | claro | `green-800` / `green-100` | **6.45:1** | `selo-em-estoque-texto` / `selo-em-estoque` | **6.45:1** | ✅ |
| em-estoque | escuro | `green-300` / `green-950` | **10.67:1** | idem | **10.67:1** | ✅ |
| reservado | claro | `violet-700` / `violet-100` | **6.13:1** | `selo-reservado-texto` / `selo-reservado` | **6.13:1** | ✅ |
| reservado | escuro | `violet-300` / `violet-950` | **8.21:1** | idem | **8.21:1** | ✅ |
| em-uso | claro | `blue-700` / `blue-100` | **5.59:1** | `selo-em-uso-texto` / `selo-em-uso` | **5.59:1** | ✅ |
| em-uso | escuro | `blue-300` / `blue-950` | **8.13:1** | idem | **8.13:1** | ✅ |
| emprestado | claro | `cyan-700` / `cyan-100` | **4.71:1** | `selo-emprestado-texto` / `selo-emprestado` | **4.71:1** | ✅ |
| emprestado | escuro | `cyan-300` / `cyan-950` | **9.27:1** | idem | **9.27:1** | ✅ |
| em-triagem | claro | `pink-700` / `pink-100` | **5.01:1** | `selo-em-triagem-texto` / `selo-em-triagem` | **5.01:1** | ✅ |
| em-triagem | escuro | `pink-300` / `pink-950` | **8.28:1** | idem | **8.28:1** | ✅ |
| em-manutencao | claro | `amber-800` / `amber-100` | **6.41:1** | `selo-em-manutencao-texto` / `selo-em-manutencao` | **6.41:1** | ✅ |
| em-manutencao | escuro | `amber-300` / `amber-950` | **10.37:1** | idem | **10.37:1** | ✅ |
| descartado | claro | `gray-600` / `gray-200` | **6.11:1** | `selo-descartado-texto` / `selo-descartado` | **6.11:1** | ✅ |
| descartado | escuro | `gray-400` / `gray-800` | **5.64:1** | idem | **5.64:1** | ✅ |
| devolvido-fornecedor | claro | `slate-700` / `slate-200` | **8.40:1** | `selo-devolvido-fornecedor-texto` / `…` | **8.40:1** | ✅ |
| devolvido-fornecedor | escuro | `slate-300` / `slate-800` | **9.87:1** | idem | **9.87:1** | ✅ |
| troca | claro | `teal-700` / `teal-100` | **4.79:1** | `selo-troca-texto` / `selo-troca` | **4.79:1** | ✅ |
| troca | escuro | `teal-300` / `teal-950` | **9.84:1** | idem | **9.84:1** | ✅ |

**18 de 18.** As famílias são exatamente as nove combinações de paleta que `dominio.ts` escrevia:
`defasado` não entra porque já era `bg-muted text-muted-foreground` — token desde sempre.

**E a tinta de gráfico, hex a hex** (`STATUS_CHART_COLOR` → `--grafico-*` → `TOKEN_PARA_HEX`):
`em_estoque` `#16a34a` · `reservado` `#6d28d9` · `em_uso` `#2a78d6` (era `var(--color-brand-azul)`,
que é o mesmo valor) · `emprestado` `#06b6d4` · `em_triagem` `#db2777` · `em_manutencao` `#d97706` ·
`defasado` `#9ca3af` · `descartado` `#6b7280` · `devolvido_fornecedor` `#64748b`. Os **três** lados
batem, e `cores.test.ts` reprova se um divergir.

### 3.0 A prova mais forte: os 36 valores, byte a byte

A tabela acima mede **razões**; esta compara os **valores**. Cada `--selo-*` de `globals.css` foi
comparado, como STRING, com o `--color-*` correspondente de `node_modules/tailwindcss/theme.css` —
o mesmo arquivo que a classe `bg-green-100` lê:

```
36 de 36 batem BYTE A BYTE com node_modules/tailwindcss/theme.css; 0 divergem
```

E, no CSS **compilado** do `next build`, as classes existem e resolvem para o mesmo valor da paleta:

```css
.bg-selo-em-estoque{background-color:var(--selo-em-estoque)}
.text-selo-em-estoque-texto{color:var(--selo-em-estoque-texto)}
--selo-em-estoque:#dcfce7;                       /* idêntico a --color-green-100 */
--selo-em-estoque:lab(96.186% -13.8464 6.52362); /* idêntico a --color-green-100 */
```

Das 18 famílias × tema conferidas no CSS compilado, 14 puderam ser comparadas lado a lado; as 4
restantes (`cyan` e `teal`) **não têm mais o `--color-*` no bundle** — porque, depois desta
migração, nenhuma tela usa mais `bg-cyan-100` nem `bg-teal-100` e o Tailwind deixou de emitir o
token. A ausência é ela mesma a prova de que a migração pegou.

### 3.1 Critério 3 — provado por diff, não por leitura

```bash
git diff 0ea3fed..HEAD -- src/app/globals.css | grep '^-' | grep -v '^---'
```

**Saída vazia.** `git diff --numstat`: **150 inserções, 0 remoções.** Nenhuma linha `oklch`
pré-existente foi tocada.

### 3.2 Os 7 pares novos do `Aviso` — e o que a régua reprovou

O componente foi **medido antes de ser escrito**, e a régua derrubou o rascunho do plano:

| par | tema | razão | piso | veredito |
| --- | --- | ---: | ---: | --- |
| `destructive` / `destructive/5` — **o véu do rascunho** | claro | **4.36:1** | 4.5:1 | ❌ **reprova** |
| `destructive` / `card` — o que ficou | claro | 4.76:1 | 4.5:1 | ✅ AA |
| `destructive` / `card` | escuro | 6.19:1 | 4.5:1 | ✅ AA |
| `warning` / `warning/10` | claro | 4.92:1 | 4.5:1 | ✅ AA |
| `warning` / `warning/10` | escuro | 7.86:1 | 4.5:1 | ✅ AAA |
| `muted-foreground` / `muted/50` | claro | 4.53:1 | 4.5:1 | ✅ AA |
| `muted-foreground` / `muted/50` | escuro | 6.39:1 | 4.5:1 | ✅ AA |

O plano §3.6 desenhava a intenção de erro com `bg-destructive/5` atrás do texto. **Reprova por
0,14** — e com `/10` piora para 3,99:1, que é exatamente o defeito que a F28 já tinha corrigido na
mesa de conflitos. O componente ficou **sem véu**, que também é o que as 12 caixas vermelhas do
produto já renderizam. O par reprovado **fica no arquivo**, marcado como "antes", para ninguém pôr o
véu de volta "melhorando".

---

## 4. Os números do §7 — antes e depois

Medidos com o mesmo script nas duas árvores (`0ea3fed` e `HEAD`). Duas colunas porque o `grep` do
inventário **não distingue código de comentário**, e esta entrega acrescentou comentários que citam
pelo nome o que as regras proíbem — contar comentário puniria quem explica o que fez.

| medida | antes (bruto / código) | depois (bruto / código) | Δ código |
| --- | ---: | ---: | ---: |
| Classes de paleta crua | 555 / **550** | 490 / **479** | **−71** |
| Molduras `rounded-* border` à mão | 190 / **190** | 178 / **178** | **−12** |
| `<h1>` escritos à mão (fora do sistema) | 22 / **19** | 20 / **16** | **−3** |
| Passos de espaçamento fora da escala | 51 / **51** | 53 / **46** | **−5** |
| Fontes arbitrárias `text-[Npx]` | 49 / **49** | 47 / **46** | **−3** |
| Larguras `w-[NNNpx]` | 32 / **32** | 32 / **30** | **−2** |
| Estados vazios `border-dashed` à mão | 23 / **23** | 23 / **23** | 0 |
| Arquivos que importam `EstadoVazio` | 12 | **13** | +1 |
| Pares no `npm run contraste` | 85 | **110** | +25 |
| Rotas com `<Pagina>` | 0 | **3** | +3 |

**Duas linhas que não andaram, e é honesto dizer por quê.** Os estados vazios ficaram em 23 porque
o único do piloto — o da linha do tempo — **voltou** a ser o `<p>` de hoje depois que a revisão
adversarial mostrou que o `EstadoVazio` pinta o título em `text-foreground font-medium` contra o
`text-sm text-muted-foreground` dele. Adotar o componente ali é uma linha, e cabe na frente que
decidir a repintura. A coluna "bruto" de espaçamento SUBIU de 51 para 53 pelo mesmo motivo das
outras: os comentários desta entrega citam pelo nome os passos que as regras proíbem.

**O comando que produziu a tabela** está versionado, para as frentes seguintes não precisarem
reinventá-lo:

```bash
node scripts/design/medir.mjs
```

As expressões são as de `docs/PLANO-DESIGN-SYSTEM.md` §1.6, letra por letra; a coluna "código" passa
cada arquivo pelo mesmo removedor de comentários dos dois testes antes de casar. O antes/depois foi
obtido rodando o mesmo script contra `0ea3fed`.

### A catraca

```ts
const TETO_PALETA_CRUA = 479   // era 550 (só código) / 555 (pelo grep do inventário)
const ARQUIVOS_COM_PALETA = 60
```

**Desceu 71**, todos em `src/lib/dominio.ts`, e o número novo foi escrito **no mesmo commit**
(`377bf56`) que o abaixou. A meta ao fim das cinco frentes é abaixo de 120.

**Honestidade sobre o piloto:** ele **não** abaixou a catraca. As 17 classes âmbar de
`linha-do-tempo.tsx`, as 8 de `pendencias-item-ficha.tsx` e as da ficha continuam lá **de
propósito** — migrá-las para o token `--warning` repintaria as telas, e esta ordem proíbe. O item
**AB** de `docs/DIVIDA-TECNICA.md` mostra o caminho que remove ~30 classes por frente **sem mudar um
pixel**: uma décima família de token com o âmbar de hoje. É a recomendação para o primeiro
movimento da frente **a**.

---

## 4.1 A revisão adversarial — o que ela pegou, e o que foi corrigido

Quatro lentes independentes em **contexto fresco** — cor · critérios · rigor dos testes · regressão
—, cada uma com uma pergunta só, e cada um dos **20 achados** passando por um cético em contexto
próprio, instruído a REFUTAR e a devolver "não é real" na dúvida. **24 agentes ao todo.**

**Veredito: 19 refutados, 1 confirmado.** E os 19 foram refutados pelo mesmo motivo — *"o defeito
era real num estado intermediário do branch, e já está corrigido no HEAD"*: a revisão rodou em
paralelo às correções que ela mesma provocou, e cada cético foi ao código conferir e encontrou o
conserto já lá. O único achado que sobreviveu é **sobre a revisão, não sobre a entrega**: um dos
revisores percebeu, e provou com `git status` mudando entre chamadas suas, que a árvore estava sendo
editada enquanto ele lia — que é o efeito colateral do "corrija e re-revise até limpar" que a
própria ordem manda. **Nenhum defeito da entrega sobreviveu à verificação.**

Elas encontraram **uma família inteira de defeitos que a suíte não pegava**, e é justo dizer o
quanto: *trocar uma moldura à mão pelo `Card` do kit troca junto o traço, o fundo e o display* — e
cada uma dessas três trocas é uma repintura.

**Sete correções de renderização** (commit `bda69da`):

| onde | o que estava errado | como ficou |
| --- | --- | --- |
| `barra-selecao-ativos.tsx` | o único dos 10 `Card` do piloto **sem** `border ring-0` — renderizava o anel do kit no lugar da `border-border` | `border ring-0` |
| `[id]/page.tsx` — "você só lê nesta filial" | perdeu o `bg-muted/40` e caiu no `bg-card` do componente | `bg-muted/40` de volta |
| `QuadroDeTabela` | pintava `bg-card` onde a tabela é **transparente**; no tema escuro são `oklch(0.205)` sobre `oklch(0.145)` | `bg-transparent` — o quadro é moldura, não superfície |
| `linha-do-tempo.tsx` (2 cartões) e `estornar-dialog.tsx` | eram BLOCO; sem `block`, o `gap-(--card-spacing)` de 16px se somaria aos `mt-2` de 8px dos filhos | `block overflow-visible` |
| `[id]/loading.tsx` | trocava 3 `Skeleton` **cheios** por `Card` **vazios** | `Skeleton` de volta |
| `linha-do-tempo.tsx` — o vazio | `EstadoVazio` pinta o título em `text-foreground font-medium`; o `<p>` era `text-sm text-muted-foreground` | voltou ao `<p>`, só o `py-10` virou `py-12` |
| `globals.css` — `@media print` | a borda do `Card` no papel usava um `#d4d4d4` escolhido no braço | `var(--border)` — o mesmo traço que as molduras já imprimem |

**E sete regras do teste ficaram mais duras** — todas por achado da revisão, nenhuma afrouxada:

- **a regra 2 media a coisa errada.** Ela só reprovava a COMBINAÇÃO `mx-auto` + `max-w-*`, ou seja,
  protegia apenas o padrão ANTIGO: um wrapper `max-w-6xl` **alinhado à esquerda** — exatamente o que
  o casco existe para monopolizar — passava calado. Agora ela reprova `max-w-*` de container em
  qualquer `className` fora do SISTEMA, com a lista de conteúdo que o plano §4.1 permite
  (`xs`·`sm`·`md`·`full`·`none`·`fit`·`min`·`max`) e uma exceção nova para as **superfícies de
  portal**: o `max-w-lg` de um `DialogContent` mede a caixa flutuante do modal, que o Radix monta
  fora da árvore do `<Pagina>`, e não a coluna da tela. Ata em `DECISOES.md`.
- **a regra 4b nasceu** — "nenhuma `className` zera o eixo que ela mesma acabou de pedir" —, que é a
  guarda do defeito dos nove cartões.

- a exceção do inset de aparelho era `passo.includes('env(')`, e **qualquer** valor arbitrário que
  mencionasse `env` escapava da escala inteira (`p-[9999px_env(x)]`). Virou a forma **estrutural**
  `[max(<n>rem,env(safe-area-inset-<lado>))]`, com fixtures que provam os dois lados.
- a regra 5 só via `w-[Npx]`; agora vê `min-w-` e `max-w-` também.
- `temRaio` não via **raio direcional**: `rounded-t-xl border` é um cartão à mão do mesmo jeito.
- a regra 2 ignorava `style={{ maxWidth }}` — o caminho por onde a "única origem de largura" podia
  ser contornada sem `className` nenhuma.
- **`src/components/layout/` saiu da lista de exceções como PREFIXO.** Ele isentava também o
  componente de sistema que alguém criasse amanhã e esquecesse de pôr em `SISTEMA` — nasceria fora
  das 8 regras, em silêncio. Viraram **sete arquivos legados nomeados um a um**.

**E o achado mais sério da entrega inteira: `p-3 py-0` zerava o respiro vertical de NOVE cartões.**
A intenção era "apaga o padding vertical do `Card` e me dá 12px". Só que o `cn()` usa
tailwind-merge, onde `p-` **já** conflita com `py-`: `p-3` sozinho apaga o `py-(--card-spacing)` do
kit, e o `py-0` escrito depois zera o próprio `p-3` no eixo vertical. A barra de seleção, o vínculo
de sucessão, o aviso de pendência, a caixa de "só leitura", o resumo do estorno, os **dois cartões
da linha do tempo** (o elemento mais repetido da ficha), os dois de pendência de item e a caixa de
assinatura do termo ficavam com o texto colado nas bordas de cima e de baixo. Provado com
`twMerge`, corrigido nos nove, e agora guardado pela **regra 4b** — "nenhuma `className` zera o eixo
que ela mesma acabou de pedir", com fixtures dos dois lados.

**O que a revisão diz sobre esta entrega, e vale dizer:** a suíte estava verde nas duas etapas
anteriores com oito defeitos de renderização dentro dela. O teste pega classe errada; ele não pega
**componente que troca o valor-padrão de uma propriedade que a tela não escreveu**, nem **duas
classes que, cada uma, está na escala e que juntas se anulam**. É a mesma classe de buraco que os
screenshots fechariam — e é por isso que a pendência do §7 não é uma formalidade.

---

## 5. As decisões — apontadas, não repetidas

Nove atas em [`docs/DECISOES.md`](DECISOES.md), 2026-08-30:

1. **Playwright aprovado** como devDependency (§8 decisão 1 do plano).
2. **Nenhuma foto foi tirada** — a regra 2, não uma falha. Ver §7.
3. **Os `--grafico-*` NÃO nascem como apelido de `--selo-*-texto`** — as duas metades da decisão 4
   da ordem não podem ser verdade ao mesmo tempo, e isso é medido. Vale a metade bloqueante.
4. **O `Aviso` é criado e NÃO é aplicado** — aplicar repinta, e a ordem proíbe. Mesmo tratamento que
   ela já dá ao `CascoDeAutenticacao`.
5. **O teste da ajuda passou a reconhecer a prop `ajuda`** do cabeçalho.
6. **A catraca conta o CÓDIGO**, não o `grep` do inventário — com os dois números registrados.
7. **`src/lib/dominio/` convive com `src/lib/dominio.ts`** — provado com os quatro comandos.
8. **`rounded-full` não é moldura** e **`env(safe-area-inset-*)` não é passo**.
9. **Os `Card` do piloto levam `ring-0 border`** — e é justamente para NÃO mudar cor.
10. **A regra 2 mede largura de PÁGINA**, e a superfície de portal (`DialogContent` e irmãs) não é
    página — o Radix a monta fora da árvore do casco.

**As duas decisões do Johnny que a ordem já trazia decididas** estão aplicadas e visíveis:
o `mx-auto` saiu (`/ativos/novo` é a única mudança de posição da fase) e o ritmo padrão é `gap-6`.

---

## 6. Verificação — a saída dos quatro comandos

```
$ npm run lint
> estoque-ti-wap@1.45.0 lint
> eslint

EXIT=0
```

```
$ npm run test
> estoque-ti-wap@1.45.0 test
> vitest run

 RUN  v4.1.11 C:/Users/yukig/ti-wap-inventory-control

 Test Files  142 passed (142)
      Tests  3088 passed (3088)

EXIT=0
```

*(eram 140 arquivos e 2.846 testes na linha de base: +2 arquivos e +242 asserções.)*

```
$ npm run contraste
> estoque-ti-wap@1.45.0 contraste
> node scripts/contraste.mjs

110 pares na tabela (eram 85). EXIT=0
```

`npm run contraste` **não imprime resumo quando passa** — ele só escreve
`N par(es) exigido(s) REPROVAM.` em stderr ao falhar. A prova de sucesso é o **exit 0**. As linhas ❌
da tabela são todas pares marcados `antes: true` (o "antes" registrado de correções passadas) e os
dois ⚠️ são os alívios do item **AA** da dívida.

```
$ npm run build
> estoque-ti-wap@1.45.0 build
> next build
▲ Next.js 16.2.12 (Turbopack)
✓ Compiled successfully
  Finished TypeScript
  … 32 rotas geradas …

EXIT=0
```

E, fora dos quatro, `npx tsc --noEmit` limpo — usado a cada incremento.

---

## 7. Screenshots — a pendência, com o motivo exato

**Nenhuma foto foi tirada, e o motivo é a regra 2 do `CLAUDE.md`, não uma falha da execução.**

O Playwright foi instalado (`playwright@^1.62.1`, devDependency, MIT, R$ 0 — aprovado pelo Johnny em
30/08/2026) e `scripts/design/capturar.mjs` foi escrito: 3 larguras (375 · 1280 · 1920) × 2 temas,
página inteira, mais um aviso de overflow horizontal por rota. **A trava está no próprio script**, e
ela roda antes de o navegador subir:

```
$ node scripts/design/capturar.mjs --saida docs/f40-evidencias/antes

✋ .env.local aponta para PRODUÇÃO (pbtjcalbmepmrqzprusb). A regra 2 do CLAUDE.md proíbe
   dado real em screenshot, e este script não a contorna.

   Crie um arquivo de ambiente apontando para o projeto de ENSAIO, rode
   `npm run db:seed` contra ele, suba o `next dev` com esse arquivo e
   repita com `--env .env.ensaio`.
```

**O que falta, em uma frase:** um `.env.ensaio` com a URL e as chaves do projeto de ensaio
(`sgmvldiizsrjbxzzpmhh`), populado com `npm run db:seed` — insumo físico que só o Johnny tem, e que
a própria ordem proíbe o agente de fabricar.

**A consequência, dita com todas as letras:** a classe de defeito que o teste de consistência **não**
alcança — elemento que muda de lugar sem mudar de classe — **não foi verificada nesta entrega**.
O teste pega classe errada; ele não pega layout torto. Os candidatos concretos a conferir a olho,
quando as fotos existirem, estão no §8.

---

## 8. O que conferir a olho, e o que já foi conferido por código

**Conferido por teste, e não precisa de olho:** as 8 regras de consistência nas 3 rotas, a catraca de
cor, a trava TS↔CSS dos 18 tokens + 9 tintas de gráfico, os 110 pares de contraste e a impressão do
relatório (`impressao-colunas.test.ts` continua verde — o `@media print` novo converte o anel do
`Card` em borda real, sem tocar nenhuma linha `oklch`).

**Precisa de olho** (e é por isso que as fotos importam):

1. `/ativos/novo` — a tela deixou de ser centrada. **É a única mudança de posição da fase.**
2. `/ativos/[id]` — o crachá de status e o botão de copiar agora ficam a 4px do título (`gap-1`),
   não a 12px. A anatomia é a que 11 das 14 telas já usavam.
3. A barra de seleção sticky de `/ativos` virou `Card`: confirmar que ela **continua grudando** no
   rodapé e que o espaçador `h-16` ainda casa com a altura dela.
4. O realce `:target` da linha do tempo (`#mov-<id>`) sobre o `Card` com `ring-0`.
5. Os raios: 9 molduras foram de `rounded-lg` (8px) para o `rounded-xl` (12px) do `Card`.
6. `375px` — a régua de `min-w-0` do `<Pagina>` contra a tabela larga.

---

## 9. Pendências e o que fica para as frentes a, b, c e d

**Da própria F40:**

- **Os screenshots** (§7). É a pendência principal, e depende de insumo do Johnny.
- **A tag `v1.45.0`** e o merge na `main` — executados ao fim desta ordem.

**Registrado em `docs/DIVIDA-TECNICA.md`:**

- **AB `[Prio 32]`** — o âmbar é **56% de toda a cor crua** (310 de 555 classes) e dá para
  tokenizá-lo **sem repintar**, com uma décima família que carregue o valor de hoje. Meia tarde de
  trabalho, e derruba a catraca de 479 para perto de 200. **Recomendado como o primeiro movimento
  da frente a.**
- **AA `[Prio 12]`** — separar a tinta de área da tinta de texto, com os dois alívios medidos
  (`#06b6d4` a **2,43:1** e `#6d28d9` a **2,52:1**). O terreno está pronto; falta a decisão do dono,
  porque muda a cor dos gráficos e exige nova medição de ΔE sob daltonismo.
- **V (reaberto) `[Prio 20]`** — três advisories novos de `postcss`/`sharp`, transitivos do
  `next@16.2.12`, publicados depois de 30/08. **O Playwright não trouxe nenhum** (ele depende só de
  `playwright-core`); a correção pede `next@16.3.3`, que é decisão de fase.

**Das frentes seguintes (plano §5), e o que cada uma apaga da lista de exceções:**

| frente | rotas | o que sai de `PENDENTES` |
| --- | ---: | --- |
| **a** · acervo | 5 | `(app)/page.tsx`, `pendencias/`, `movimentacoes/` e os componentes |
| **b** · relatórios | 3 | `relatorios/` e `components/relatorios/` — **menos** `acesso-form.tsx` |
| **c** · admin + itens | 11 | `admin/`, `itens/` e os componentes |
| **d** · dev, ajuda, versões, públicas | 10 | `dev/`, `ajuda/`, `versoes/`, `login/`, `auth/`, `components/layout/` |

A **decisão 4 do plano §8** (os cinco `--chart-N` órfãos: consumir ou remover) é **matéria da frente
b** e continua pendente, como a ordem previu.

---

## 10. Próximos passos sugeridos

1. **Preparar o ensaio e rodar as fotos** — `.env.ensaio` + `npm run db:seed` + o script. Fecha a
   única classe de defeito que esta fase não conseguiu provar sozinha, e serve as quatro frentes
   seguintes.
2. **Frente a, começando pelo item AB da dívida** — tokenizar o âmbar com o valor de hoje antes de
   migrar as telas. Feito na ordem certa, a frente a derruba mais da metade da dívida de cor sem
   mudar um pixel; feito na ordem errada, ela repinta 23 telas.
3. **Frentes b, c e d**, cada uma apagando as suas linhas de `PENDENTES` e abaixando a catraca no
   mesmo commit.
4. **Depois das cinco frentes**, reabrir a decisão **AA** com as fotos na mão: aí a separação da
   tinta de área pode ser medida antes e depois, em vez de decidida no escuro.
