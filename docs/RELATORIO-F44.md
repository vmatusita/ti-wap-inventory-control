# Relatório da F44 — `/itens` diz de qual filial é o número, e a ficha põe o equipamento antes dos itens

Executada em **01/09/2026**, modo autônomo, branch `f44-itens-por-filial`, versão **1.49.0**.
**Sem migration, sem dependência nova, sem mudar regra de estado, permissão, rota ou o nome dos
cinco números.**

---

## 1. O pedido do Johnny, literal — e o achado que o traduziu

> "na tela de itens preciso que adicione mais cores para facilitar visualização e tbm preciso que
> quando eu filtrar para filial que eu quero, aparecer direto na linha o total, em estoque, em uso e
> o que falta da filial que eu filtrei se for somente uma, e nao aparecer mais o total da ti (…)
> tbm quando vou abrir detalhes de um ativo, preciso que o historico de movimentacoes de itens seja
> mais discreto ou mude a ordem, ele é algo secundario e fica logo no topo, preciso dele mais
> discreto ou colapsavel, para que eu possa ver antes dados do ativo, termos e linha do tempo do
> ativo que é mais importante que os itens"

**O achado: o número já seguia o filtro. Quem mentia era a legenda.** Desde a F42,
`saldoDoRecorte` devolve o consolidado sem recorte e a soma das filiais marcadas com recorte, e é
ele que alimenta a tabela, a linha expansível, os cartões e o CSV. Com `?filial=3`, os quatro
números **já eram** daquela filial. O que a tela escrevia embaixo do Total era **"tudo que a TI
possui"** — e o operador acredita na legenda, não na fórmula.

Isso mudou a fase inteira: ela deixou de ser sobre aritmética e passou a ser sobre **legenda, cor e
ordem de leitura**. `saldoDoRecorte` **não foi tocada** (`git diff v1.48.0..HEAD -- src/lib/itens/lista.ts`
é vazio).

---

## 2. A prova de que `saldoDoRecorte` já recortava

`scripts/design/prova-recorte.ts` (novo) roda o **mesmo caminho da tela** —
`montarLinhasDeItem()` → `linha.saldo` — sobre 4 itens × 3 filiais fictícios, e compara célula a
célula com `porFilial`. Saída completa em
[`f44-evidencias/prova-recorte.txt`](f44-evidencias/prova-recorte.txt). Trecho literal:

```
PROVA 2 · com UMA filial, linha.saldo === porFilial[X] nos QUATRO números
  OK   · filial 1 · Mouse sem fio — total=12 estoque=7 atrelados=0 falta=0
  OK   · filial 1 · Teclado ABNT2 — total=6 estoque=1 atrelados=2 falta=0
  …
PROVA 3 · com DUAS filiais, linha.saldo é a soma CÉLULA A CÉLULA das marcadas
  OK   · Mouse sem fio — total: 12+9=21 · estoque: 7+2=9 · atrelados: 0+0=0 · falta: 0+0=0
PROVA 5 · a MATRIZ e a LINHA EXPANSÍVEL saem da mesma conta
  OK   · Aurora · Mouse sem fio — coluna da matriz = 7 · coluna "Em estoque" da linha = 7
         ← COM UMA FILIAL AS DUAS COLUNAS MOSTRAM O MESMO NÚMERO (ponto 4 do diagnóstico)
PROVA 6 · os CARTÕES de resumo somam o RECORTE… e o "A repor" NÃO (o defeito nº 3)
  OK   · filiais [1]: cartão "Em estoque" soma o recorte — cartão = 8 · soma das linhas = 8
         └─ "A repor" = 2 — contado sobre o CONSOLIDADO, não sobre o recorte

RESULTADO: as 6 provas passaram. O NÚMERO ESTÁ CERTO — o defeito é de LEGENDA.
```

As provas 5 e 6 confirmaram, de graça, os outros dois pontos do diagnóstico: a coluna redundante e o
"repor" global.

---

## 3. Antes × depois, com as imagens

### 3.1 A ferramenta teve de aprender a filtrar antes de existir prova

A prévia estática da F43 fotografava **só a tela sem filtro** — justamente o único caso em que a
legenda não mente. Sem recorte na prévia, o defeito desta fase era **infotografável**. Duas
mudanças em `scripts/design/`:

- `--recortes sem,uma,tres`. `uma` escolhe **Cerrado Alto**, uma filial do MEIO da lista: com a
  primeira, a coluna redundante e a coluna *Em estoque* ficariam coladas e a foto **esconderia** o
  problema em vez de mostrá-lo.
- `previa-itens-dados.ts` parou no **saldo bruto** e passou a chamar `montarLinhasDeItem`, a função
  real. Antes ele montava `saldo: consolidado` à mão — uma prévia que reimplementa a aritmética da
  tela fotografa a reimplementação.
- E nasceu `previa-ficha.tsx` + `previa-ficha-dados.ts`, a prévia da **ficha do ativo**, no mesmo
  molde e com os mesmos componentes reais.

### 3.2 O que a régua mediu, em 1440px

| recorte | ANTES (v1.48.0) | DEPOIS (v1.49.0) |
|---|---|---|
| sem filtro | `Total \| tudo que a TI possui` … 5 colunas de filial | **igual** — sem filtro a frase é verdadeira |
| **uma filial** | `Total \| tudo que a TI possui` … **`Cerrado Alto \| em estoque`** | `Total \| **tudo em Cerrado Alto**` … **coluna redundante removida** |
| três filiais | `Total \| tudo que a TI possui` … 3 colunas | `Total \| **tudo nas 3 filiais**` … 3 colunas (inalteradas) |

Nenhuma largura rola na horizontal: `wrap 1150/1150` em 1440px e `356/356` em 390px, nos três
recortes.

### 3.3 O critério 1, provado no HTML renderizado

```
sem/claro   -> 'tudo que a TI possui'=2 | 'de todas as filiais'=2
sem/escuro  -> 'tudo que a TI possui'=2 | 'de todas as filiais'=2
uma/claro   -> 'tudo que a TI possui'=0 | 'de todas as filiais'=0
uma/escuro  -> 'tudo que a TI possui'=0 | 'de todas as filiais'=0
tres/claro  -> 'tudo que a TI possui'=0 | 'de todas as filiais'=0
tres/escuro -> 'tudo que a TI possui'=0 | 'de todas as filiais'=0
```

**Com recorte, a frase de escopo de TI aparece zero vezes.** Sem recorte ela continua — porque ali
ela é verdadeira, e a página de ajuda descreve o significado sem filtro.

### 3.4 As imagens

`docs/f44-evidencias/antes/` e `docs/f44-evidencias/depois/`: 1440×900 e 390×844, claro e escuro,
nos três recortes, mais a ficha em três cenários (`padrao`, `sem-pendencia`, `consulta`).
**Dados 100% fictícios** (regra 2): filiais inventadas, `WAP0001234`, "Fulano de Tal".

---

## 4. O teste dos 5 segundos — o critério de aceite principal

Protocolo da F43: subagente em **contexto fresco**, que só recebe a imagem e as perguntas; duas
rodadas independentes por combinação. Régua assimétrica — **uma reprovação vale de imediato; para
APROVAR, duas rodadas limpas**.

### 4.1 O placar

**Pergunta (a) — a pergunta da fase:** *"os números desta tela são de qual filial, ou de todas?"*

| | ANTES (v1.48.0) | DEPOIS (v1.49.0) |
|---|---|---|
| uma filial (4 combinações × 2 rodadas) | **1 certeza / 7 hesitei**, uma resposta ERRADA | **8 certeza / 0 hesitei** ✅ |
| três filiais (3 combinações × 2 rodadas) | **1 certeza / 5 hesitei**, duas ERRADAS | **6 certeza / 0 hesitei** ✅ |

| Pergunta | Antes | Depois | Veredito |
|---|---|---|---|
| (a) de qual filial são os números | 2/14 certeza | **14/14 certeza** | ✅ APROVADA |
| (c) prateleira × com as pessoas | 8/8 certeza | 8/8 certeza | ✅ mantida |
| (b) quais repor, e comparados com quê | — | 7/8 certeza | ⚠ ver §4.4 |
| ficha (a) o que a tela mostra primeiro | — | **6/6 certeza** | ✅ APROVADA |
| ficha (b) há pendência em aberto? | — | **6/6 certeza** | ✅ APROVADA |
| ficha (c) onde estão os acessórios | — | **6/6 certeza** | ✅ APROVADA |

### 4.2 As respostas literais — ANTES

A frase que se repete é sempre a mesma:

- *"Não dá pra saber o nome da filial só batendo o olho: o filtro no topo mostra 'Filial' com um
  badge '1', mas o nome dela não aparece escrito na tela."* (claro, 1440, r2)
- *"o nome da filial não aparece visível na tela, então não dá pra dizer qual é."* (escuro, 1440, r1)
- **ERRADA:** *"O campo 'Filial' está sem nada selecionado — então os números parecem ser de TODAS
  as filiais."* (escuro, 390, r1) — havia uma filial marcada.
- **ERRADAS, com TRÊS filiais marcadas:** *"A uma filial: há um filtro de Filial ativo (com badge
  '1')"* — nas duas rodadas de 390px. O badge dizia **3**; a 390px foi lido como **1**.

E a pergunta (d), que é diagnóstica, entregou de graça o defeito nº 4 a um julgamento que não sabia
dele: *"as colunas 'Em estoque' e 'Cerrado Alto' aparecem lado a lado em negrito com o MESMO número
em toda linha, o que dá a impressão de estarem duplicadas — não fica claro o que cada uma representa
de diferente."*

### 4.3 As respostas literais — DEPOIS

- *"Só da filial Cerrado Alto (o cabeçalho diz 'Números de Cerrado Alto' / 'Total, Em estoque, Em
  uso e Falta são de Cerrado Alto')."* (claro, 1440, r1)
- *"De uma filial só: Cerrado Alto (o painel diz 'Números de Cerrado Alto' e o filtro Filial está
  com 1 selecionada, não 'todas')."* (claro, 390, r1)
- Com três: *"São de 3 filiais somadas — Aurora, Cerrado Alto e Estância Velha do Norte."*

Na ficha:

- *"Mostra primeiro a identificação do equipamento: patrimônio WAP0001234, status 'Em uso', tipo
  Notebook com Service Tag…"* — 6/6.
- *"Sim. A seção 'Itens faltantes da devolução' traz um selo laranja '2 em aberto', com Mouse e
  Carregador marcados com ícone de alerta."* — **a prova de que o alarme sobrevive ao
  recolhimento**, dita por quem não sabia que isso era a questão.
- *"No bloco 'Itens que foram junto (3)', mais abaixo, hoje recolhido/fechado."* — 6/6.

### 4.4 A pergunta (b), três desenhos, e o que ela mede de verdade

*"Quais itens precisam ser repostos agora, e comparados com o quê?"*

| desenho | o que o cartão *A repor* dizia | certeza |
|---|---|---|
| 1 | "36 · itens abaixo do mínimo" | **4/8** |
| 2 | "36 · itens abaixo do mínimo **em Cerrado Alto**" | **5/8** |
| 3 *(entregue)* | "36 · **de 44 itens** abaixo do mínimo em Cerrado Alto · 20 nesta página" | **7/8** |

**O desenho 2 resolveu a metade que esta fase introduziu.** No desenho 1, TODOS os julgamentos
responderam "com o mínimo do item" e **nenhum** soube dizer com qual estoque — o "repor" é um quinto
número, e herdava um escopo que ninguém tinha escrito. É o critério 5 ao pé da letra.

**O desenho 3 atacou o que sobrou, e é o mais contraintuitivo.** Com o "repor" seguindo o filtro,
**36 dos 44 itens** acendem numa filial só, e o julgamento tropeçava em: *"a etiqueta aparece em
praticamente todo item, então não dá para saber se é alerta ou só um rótulo padrão"*. Esconder a
enxurrada seria mentir; **nomear a proporção** transforma a dúvida em informação — sim, é quase
tudo, e é por isso que quase tudo está marcado.

**Placar final por combinação:** claro/1440 2/2 ✅ · escuro/1440 2/2 ✅ · claro/390 2/2 ✅ ·
**escuro/390 1/2** ⚠.

> **(b) fica declarada NÃO ATENDIDA em 390px no tema escuro.** Três desenhos esgotam a regra de
> parada da ordem. **Hipótese, e ela não é de legibilidade:** *"quais itens"* não tem resposta ao
> bater o olho quando a resposta é *"quase todos"*. Nenhum desenho torna 36 selos enumeráveis numa
> página de 4.278px. O caminho não é visual — é o **estoque mínimo POR FILIAL**, que a ata de
> 23/07/2026 recusou por multiplicar o cadastro por cinco. Vai para o backlog (§10).

### 4.5 A pergunta (d), diagnóstica — o que ela achou

Ela hesitou em 8/8, o que é esperado de uma pergunta que **pergunta** por dúvida. Dois achados
consistentes, que viram backlog e não conserto nesta fase:

1. **"o azul de *Em uso* parece link"** (2 passadas). É `--selo-em-uso-texto`, o MESMO azul com que
   `/ativos` já diz "em uso" — trocá-lo quebraria a regra que a ordem impõe ("use a mesma família de
   matiz"). Fica registrado.
2. **"verde num zero soa como 'tudo bem'"** (3 passadas). *Em estoque* é verde por coluna, não por
   gravidade — um `0` verde ao lado de um selo "repor" é dissonante. Fazer a cor variar com o valor
   seria **mapa de calor**, que o Johnny recusou explicitamente. Fica registrado como pergunta para
   ele.

---

## 5. As decisões de desenho, e por que cada uma

### 5.1 `<caption>`, e não um cabeçalho agrupador

A ideia óbvia era `<th colSpan={4}>Cerrado Alto</th>` sobre as quatro colunas de número. **Ela não
sobrevive à responsividade:** *Total* e *Falta* são `hidden sm:table-cell`, abaixo de `sm` só duas
das quatro existem, e `colSpan` **não tem variante de breakpoint**. O agrupador ou mentiria a
largura em 390px, ou sumiria justo na tela em que o operador tem menos contexto. `<caption>` é a
semântica que o HTML já tem para "o título desta tabela", é anunciada por leitor de tela **antes** do
conteúdo, e funciona em toda largura.

**Precedente que decidiu a redação:** o **CSV já fazia isto certo desde sempre** — a coluna "Filial"
carimba "Consolidado" ou os nomes somados por " + ". O arquivo nunca mentiu sobre o próprio escopo;
era a TELA que não dizia.

### 5.2 A cor — o produto já tinha uma língua

| número | tinta | token | por quê |
|---|---|---|---|
| Em estoque | verde | `--selo-em-estoque-texto` | o MESMO de `STATUS_META.em_estoque` |
| Em uso | azul | `--selo-em-uso-texto` | o MESMO de `STATUS_META.em_uso` |
| Falta | vermelho | `--destructive` | a família do selo "faltam N", que já era vermelho |
| **Total** | **neutro** | `--muted-foreground` | **escolha, não esquecimento** — ver abaixo |

**Por que Total é o neutro.** Os dois candidatos coloridos são armadilha: **violeta É
`--selo-reservado`**, e "Reservado" é *outro* dos cinco números da MESMA tela — colisão de dialeto;
**âmbar É o aviso "repor"**, que convive na mesma linha. E há razão de leitura: *Em estoque* é a
âncora por decisão medida da F43, e pintar Total de cor forte disputaria essa âncora. Total é o
número de **referência**; ele tem marca própria na chave de cor (um quadradinho cinza) nos três
lugares, como os outros três.

**Nada essencial só por cor:** número e rótulo sempre ao lado; os quadradinhos são `aria-hidden`.

### 5.3 O zebrado, e a escada de três degraus

No tema claro a paleta dá **três por cento de amplitude** (`--background` `oklch(1)`, `--muted`
`oklch(0.97)`). Os três estados se distribuem nela, em ordem monotônica:

```
linha comum     1.000   (o fundo da página)
linha listrada  0.985   (bg-muted/50)
com o mouse     0.970   (bg-muted)   ← precisou SOBRESCREVER o kit
```

O `TableRow` do kit traz `hover:bg-muted/50` — **o mesmo valor da listra**. Sem trocar, o hover numa
linha listrada não mudaria nada e numa linha branca a deixaria igual à listrada: viraria ruído em vez
de sinal. A **listra é calculada em JS pelo índice**, não por `even:`/`odd:` — as linhas saem em
PARES (item + detalhe), e `nth-child` inverteria a listra de tudo abaixo de uma linha aberta.

### 5.4 Dois defeitos que só a FOTO mostrou

Nenhum dos quatro comandos os pegaria:

1. A `<caption>` **encostava no traço** do `QuadroDeTabela` (que é `py-0`) e saía cortada. Ganhou
   faixa própria (`px-2 py-3 border-b`), alinhada à régua das células.
2. O zebrado era `bg-muted/30` = **0,991 de luminância sobre um fundo 1,0** — invisível. Virou a
   escada da §5.3.

---

## 6. A tabela recurso-a-recurso (critério 9)

**Nenhuma linha acaba em "sumiu".**

### Filtros, params e URL

| Recurso | Depois | Onde |
|---|---|---|
| Busca `q`, só no submit | **igual** | `itens-filtros.tsx` — **diff vazio** |
| Filtro de filial (multi, `todas`, padrão do cargo) | **igual** — e agora ele NOMEIA o resultado | `page.tsx:122` |
| Select "Grupo" · "Limpar" (preserva `pp`) | **igual** | `itens-filtros.tsx` — **diff vazio** |
| `page` com clamp · `pp` (25/50/100) | **igual** | `page.tsx` |
| `?lancar=1` + atalho `L` | **igual** | `lancar-item-dialog.tsx` — **diff vazio** |
| Desvio do link antigo do histórico | **igual** | `supabase/proxy.ts` — **diff vazio** |
| `baseFiltrosItens` contra a corrida | **igual** | `url-filtros.ts` — **diff vazio** |

### Colunas, números e selos

| Antes (F43) | Depois (F44) |
|---|---|
| Total, atenuado | **igual**, e o `curto` passa a nomear a filial sob recorte |
| Em estoque, a âncora (`text-base font-semibold`) | **igual**, mais a tinta verde |
| Em uso | **igual**, mais a tinta azul (zero continua atenuado) |
| Falta, selo vermelho "faltam N" + Dica | **idêntico** — o componente não foi tocado |
| selo âmbar "repor" junto do nome | **igual**, comparando com o RECORTE, e a Dica NOMEIA o estoque |
| `foraDasFiliais` na linha e na linha aberta | **igual** |
| aviso de reservado na linha aberta | **igual** |
| uma coluna por filial | **igual com 2+ filiais**; com **exatamente 1**, removida (era duplicata) |
| resumo em cartões | **igual**, mais a linha de escopo, as chaves de cor e o escopo no cartão *A repor* |
| explicação curta visível sob o rótulo | **igual** |
| *(não existia)* | **`<caption>` de escopo · zebrado · separador do bloco de números** |

### Ações, estados e cargo

| Recurso | Depois |
|---|---|
| `RealtimeRefresh` · "Exportar saldos" · "Histórico" · "Conferir estoque" · "Transferir" · "Lançar" | **iguais** |
| menu `⋯` → "Lançar quantidade" e "Ver histórico deste item" | **igual** |
| **atalho de transferir por filial**, na linha expansível | **igual** — e é por ele que a linha expansível NÃO saiu junto com a matriz |
| linha expansível com os quatro números de cada filial | **igual** — continua listando TODAS as filiais visíveis |
| chevron (a partir de `xl`) e "Ver as N filiais" (abaixo de `xl`) | **iguais** |
| os QUATRO estados vazios | **iguais** |
| **cargo consulta** sem menu de ações | **igual** |
| **operador de uma filial só** | **igual** — e agora a tela diz o nome da filial dele |

**CSV de saldos:** `git diff v1.48.0..HEAD -- src/lib/actions/exportar.ts` é **vazio**. Nome, ordem
e conteúdo idênticos, e ele continua batendo com a tela porque as duas chamam `saldoDoRecorte` com o
mesmo `filialIds`. O "repor" **não está no CSV** e não entrou.

### Ficha do ativo

| Recurso | Depois |
|---|---|
| Resolver / Reabrir pendência de item | **iguais**, com as mesmas regras de cargo |
| Termos (gerar, baixar, editar, confirmar/desfazer assinatura) | **iguais** |
| Linha do tempo · histórico do ativo substituído · estorno · duplicar movimentação | **iguais** |
| Ações de exceção (`⋯`) · copiar patrimônio e service tag · anotar · editar · comprar outro igual · devolver ao fornecedor | **iguais** |
| Vínculo de sucessão · pendência de campo livre (âmbar, **no topo**) · card "você só lê nesta filial" · título da aba | **iguais** |
| **A ORDEM** | Dados → Termos → Linha do tempo → Histórico do substituído → **Itens que foram junto** → **Pendências de item** |

### O que NÃO foi tocado, provado por diff vazio

`exportar.ts` · `proxy.ts` · `url-filtros.ts` · `lancar-item-dialog.tsx` ·
`transferir-item-dialog.tsx` · `itens-filtros.tsx` · `linha-expansivel.tsx` ·
**`lib/itens/lista.ts`** (é onde mora `saldoDoRecorte`) · `cartao-de-metrica.tsx` ·
**`supabase/` inteiro**.

---

## 7. Contraste, catraca e acessibilidade

### 7.1 Os 34 pares novos — todos AA, nos dois temas

| par | claro | escuro |
|---|---|---|
| número "Em estoque" na célula (16px) | 7,09:1 ✅ | 14,16:1 ✅ |
| … na linha listrada | 6,80:1 ✅ | 12,69:1 ✅ |
| … com o mouse na linha | 6,50:1 ✅ | 10,81:1 ✅ |
| … no cartão (24px) | 7,09:1 ✅ | 12,81:1 ✅ |
| número "Em uso" na célula (14px) | 6,82:1 ✅ | 10,93:1 ✅ |
| … na linha listrada / hover / cartão | 6,54 / 6,26 / 6,82 ✅ | 9,80 / 8,34 / 9,89 ✅ |
| número "Total" na linha listrada | 4,53:1 ✅ | 6,84:1 ✅ |
| número "Falta" no cartão | 4,76:1 ✅ | 6,19:1 ✅ |
| chave de cor (gráfico, 3:1): estoque / uso / falta / total | 7,09 / 6,82 / 4,76 / 4,73 ✅ | 12,81 / 9,89 / 6,19 / 6,91 ✅ |
| legenda de escopo da tabela | 4,73:1 ✅ | 6,91:1 ✅ |
| linha de escopo acima dos cartões | 19,79:1 ✅ | 18,96:1 ✅ |
| selo "N em aberto" da ficha recolhida | 4,92:1 ✅ | 6,22:1 ✅ |

Todos com `exigir: true`. `npm run contraste` sai **0**.

**As quatro superfícies da célula foram medidas**, e não só a primeira: linha branca, listra, hover e
cartão. Medir só uma deixaria o número ilegível em uma linha sim, outra não.

### 7.2 A catraca da cor crua

`TETO_PALETA_CRUA` continua **473** e `ARQUIVOS_COM_PALETA` continua **61** — **não subiu e não
desceu**. As quatro tintas são token; nenhuma classe crua nova entrou.

**Ela pegou um erro real durante a fase.** A primeira escrita do `<summary>` de pendências tingia o
`Card` com o par `amber-300/amber-50` dos cartões de dentro: o arquivo saltou de 14 para 18
ocorrências e o total de `src` de 473 para **483**. Trocado por `Badge variant="warning"`, que pinta
com `--warning` (par já medido) e **não gasta uma ocorrência crua sequer**.

### 7.3 O `aria-expanded` da ficha — medido, não afirmado

`scripts/design/medir-acessibilidade.mjs` (novo) pergunta ao Chromium, pela árvore de acessibilidade
do CDP, o que um leitor de tela vê:

| bloco | papel | expanded | `aria-expanded` à mão | alvo |
|---|---|---|---|---|
| Itens que foram junto (3) | `DisclosureTriangle` | **false** | nenhum | 42px ✅ |
| Itens faltantes da devolução · 2 em aberto | `DisclosureTriangle` | **true** | nenhum | 40px ✅ |

Saída em [`f44-evidencias/acessibilidade-ficha.txt`](f44-evidencias/acessibilidade-ficha.txt). Se um
dia alguém trocar `<details>` por uma `<div>` com `onClick`, a coluna `expanded` vira `(ausente)` e a
troca aparece.

### 7.4 O `print:` — conferido, e o resultado é o desejado

O zebrado é `background-color`, e navegador **não imprime fundo** por padrão
(`print-color-adjust: economy`); o `@media print` de `globals.css` **não** liga `exact` para estas
linhas. No papel, portanto, a listra some e a tabela volta a se dividir pelas bordas de linha — que
é o comportamento certo: listra impressa em impressora monocromática vira faixa cinza sobre número.

A `<caption>` **imprime**, porque é texto: o papel passa a carregar, no topo da tabela, a frase que
diz de qual filial são os números. Antes desta fase, uma impressão de `/itens` filtrada não trazia
essa informação em lugar nenhum.

### 7.5 `loading.tsx` (critério 11)

Os dois esqueletos ganharam a silhueta nova: em `/itens`, a **linha de escopo** e a **faixa da
legenda** da tabela (juntas, ~44px que o conteúdo desceria sem elas); em `/ativos/[id]`, as duas
faixas dos blocos recolhidos no fim. A regra 8 de `consistencia.test.ts` compara a LARGURA declarada,
não a silhueta — o salto vertical é justamente o que ela não alcança.

---

## 8. O que mudou por arquivo, e por quê

**20 arquivos em `src/`**, dois deles novos.

| arquivo | o quê |
|---|---|
| `lib/itens/escopo.ts` **(novo)** | o escopo e a legenda derivada. Função pura, **28 testes** |
| `lib/itens/tinta.ts` **(novo)** | a cor de cada número, uma por número. Função pura, **10 testes** |
| `lib/itens/distribuicao.ts` | `resumoDaLista` conta `aRepor` por `l.saldo` (era `l.consolidado`) |
| `components/itens/itens-table.tsx` | `<caption>`, tintas, zebrado, separador, matriz suprimida com 1 filial |
| `components/itens/resumo-de-itens.tsx` | linha de escopo, chaves de cor, escopo e denominador no *A repor* |
| `components/itens/cabecalho-de-numero.tsx` | a chave de cor ao lado do rótulo |
| `components/itens/badge-repor.tsx` | `estoqueDoRecorte` + o rótulo do estoque comparado |
| `components/itens/identidade-do-item.tsx` | passa `linha.saldo.estoque` ao selo |
| `app/(app)/itens/page.tsx` + `loading.tsx` | deriva `escopo` e `cabecalhos`; esqueleto novo |
| `app/(app)/ativos/[id]/page.tsx` + `loading.tsx` | a nova ordem; esqueleto novo |
| `components/ativos/itens-que-foram-junto.tsx` | `<details>` recolhido, contagem no título |
| `components/ativos/pendencias-item-ficha.tsx` | `<details>` que abre sozinho com alarme + selo de atenção |
| `lib/ajuda/conteudo/saldos-e-estoque-minimo.ts` · `administracao.ts` | 5 frases que a revisão do "repor" tornou falsas |
| `lib/ajuda/conteudo.test.ts` · `conteudo/gestao.test.ts` | trocados: fixavam a frase antiga |
| `lib/itens/distribuicao.test.ts` | os casos que codificavam a regra revogada |
| `lib/versoes/registry.ts` | a entrada `1.49.0` |

Fora de `src/`: `scripts/contraste.mjs` (34 pares), `scripts/design/` (prova, prévias, medidor de
acessibilidade), `CHANGELOG.md`, `README.md`, `docs/README.md`, `docs/PLAN-F44.md`,
`docs/DECISOES.md`, `package.json`.

---

## 9. Decisões

Quatro atas em [`docs/DECISOES.md`](DECISOES.md), datadas 01/09/2026 — as **três revisões** que a
ordem exigia, mais o incidente:

1. **REVISÃO — o "repor" passou a seguir o filtro**, revogando a parte de escopo da ata de
   **23/07/2026** (F12 · I5). O que permanece dela está listado; o efeito colateral está nomeado, com
   o número medido (de **11** para **36** itens "a repor" na prévia).
2. **A legenda com escopo é DERIVADA**, e o vocabulário congelado na F43 continua congelado — os
   NOMES dos cinco números não mudaram; o que varia é a frase de apoio.
3. **A ficha põe o equipamento antes dos itens**, revisando o lugar onde a F18 e a F38 encaixaram os
   dois blocos, com o custo de `<details>` × `BotaoExpandir` explicado.
4. **Um subagente rodou `git stash` no diretório compartilhado** e apagou edições vivas — ver §11.

---

## 10. Pendências, dívidas e próximos passos

| item | custo | por quê não agora |
|---|---|---|
| **⚠ O "repor" recortado pode mandar comprar o que sobra na filial ao lado** | — | **É o pedido do Johnny**, entregue como pedido. Mitigado por nomear o escopo em três superfícies e o denominador no cartão. **A pergunta para ele: quer mínimo POR FILIAL?** É a solução real, e a ata de 23/07/2026 a recusou por multiplicar o cadastro por cinco |
| (b) NÃO ATENDIDA em 390px/escuro | — | Três desenhos esgotaram a regra. A causa é a proporção (36 de 44), não o desenho |
| "verde num zero soa como 'tudo bem'" (3 passadas de (d)) | baixo | Fazer a cor variar com o valor é **mapa de calor**, recusado pelo Johnny. Pergunta para ele |
| "o azul de *Em uso* parece link" (2 passadas de (d)) | baixo | Trocar quebraria a regra da ordem: mesma família de matiz de `/ativos` |
| O card "Itens para repor" do painel **não** acompanha o filtro | médio | `/` está fora do escopo. A ajuda passou a **avisar** que as duas contagens podem divergir e que as duas estão certas |
| `CartaoDeMetrica` continua sem consumidor **clicável** | baixo | Recortar por "a repor" exigiria filtro de URL novo, fora do escopo (herdado da F43) |
| Âmbar cru dos cartões de pendência | baixo | Item AB de `DIVIDA-TECNICA.md`; repintar é outra fase |
| **`stash@{0}` inerte no repositório** | trivial | `git stash drop` foi recusado pelo classificador desta sessão. Superado por completo — limpar à mão |

---

## 11. O incidente do `git stash`

Um subagente encarregado de construir a prévia da ficha investigou avisos de lint num arquivo que
não era dele e rodou `git stash` no **diretório de trabalho compartilhado**. As edições não
commitadas de **seis arquivos rastreados** saíram do disco; os arquivos novos sobreviveram (`git
stash` sem `-u` não leva o que não é rastreado).

**Reconciliação:** as seis foram reescritas e depois comparadas com `git show stash@{0}:<arquivo>`.
Quatro saíram **idênticas**; duas divergem só em redação de comentário, e a versão do disco é
superset. **Nenhuma linha de código se perdeu** — conferido também, de forma independente, pela
sessão irmã que entregou a F43.

**Lição, e ela está na ata:** a proteção que funciona não é combinar de não rodar `stash` — é **não
dividir diretório de trabalho**. `git worktree` para qualquer agente que possa tocar em git.

---

## 12. Os quatro comandos, o CI, o deploy e o smoke

*(preenchido no rollout — ver §12.1 a §12.4)*
