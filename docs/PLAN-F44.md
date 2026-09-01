# PLAN-F44 — `/itens` diz de qual filial é o número, e a ficha põe o equipamento antes dos itens

Plano medido antes de executar, no molde do [`PLAN-F43.md`](PLAN-F43.md). Escrito em
**01/09/2026**, com a `v1.48.0` no ar. Branch `f44-itens-por-filial`. Alvo: `v1.49.0`.

---

## 1. O problema, em uma frase

Com uma filial filtrada, `/itens` mostra o número **daquela filial** com a legenda
**"tudo que a TI possui"** embaixo — e o operador acredita na legenda, não na fórmula.

O pedido do Johnny, literal, em 01/09/2026, olhando a tela que a F43 entregou horas antes:

> "na tela de itens preciso que adicione mais cores para facilitar visualização e tbm preciso que
> quando eu filtrar para filial que eu quero, aparecer direto na linha o total, em estoque, em uso e
> o que falta da filial que eu filtrei se for somente uma, e nao aparecer mais o total da ti (…)
> tbm quando vou abrir detalhes de um ativo, preciso que o historico de movimentacoes de itens seja
> mais discreto ou mude a ordem, ele é algo secundario e fica logo no topo, preciso dele mais
> discreto ou colapsavel, para que eu possa ver antes dados do ativo, termos e linha do tempo do
> ativo que é mais importante que os itens"

---

## 2. A prova barata, e o que ela mudou no plano

**O número já seguia o filtro.** Antes de qualquer desenho, `scripts/design/prova-recorte.ts`
roda o MESMO caminho da tela — `montarLinhasDeItem()` → `linha.saldo` — sobre um catálogo
fictício de 4 itens × 3 filiais, e compara célula a célula com `porFilial`. Saída completa em
[`f44-evidencias/prova-recorte.txt`](f44-evidencias/prova-recorte.txt). As seis provas passam:

| Prova | O que ela afirma | Resultado |
|---|---|---|
| 1 | sem recorte, `linha.saldo` é o **consolidado da RPC** — e não a soma das colunas (uma filial desativada guarda 2 unidades, e o total diverge de propósito) | ✅ |
| 2 | com UMA filial, `linha.saldo` === `porFilial[X]` nos **quatro** números, nas três filiais × quatro itens | ✅ |
| 3 | com DUAS, é a soma **célula a célula** | ✅ |
| 4 | "em uso" também recorta (é derivado dos quatro, não lido à parte) | ✅ |
| 5 | a matriz e a linha expansível saem da **mesma conta** — e, com uma filial, **a coluna da matriz repete a coluna "Em estoque"** | ✅ (é o defeito nº 4) |
| 6 | os cartões somam o recorte… e **"A repor" não** — ele fica em 2 com ou sem filtro | ✅ (é o defeito nº 3) |

**Consequência para o plano:** esta fase **não toca em `saldoDoRecorte`**. Ela é de legenda,
cor e ordem de leitura. Se alguém se pegar reescrevendo a aritmética, parou de fazer a F44.

---

## 3. A linha de base, medida antes de tocar em código

A prévia da F43 só fotografava a tela **sem filtro** — justamente o único caso em que a legenda
não mente. A primeira coisa da fase foi ensiná-la a filtrar (`--recortes sem,uma,tres`), e o
arquivo de dados parou no saldo **bruto** para chamar `montarLinhasDeItem`, a função real: uma
prévia que reimplementa a aritmética da tela fotografa a reimplementação.

`docs/f44-evidencias/antes/` — 6 HTML, 12 PNG (1440×900 e 390×844, claro e escuro, três recortes).

### 3.1 O que a régua mediu (`medir-tabela.mjs`, 1440px)

```
sem   →  Total | tudo que a TI possui   …  Aurora  Bonança  Cerrado Alto  Dunas  Estância
uma   →  Total | tudo que a TI possui   …  Cerrado Alto            ← a legenda mente
tres  →  Total | tudo que a TI possui   …  Aurora  Cerrado Alto  Estância
```

Com uma filial, o cabeçalho **escreve "tudo que a TI possui"** sobre um número que é de uma
filial só, e a coluna "Cerrado Alto | em estoque" repete, com outro rótulo, o número que a
coluna "Em estoque" já mostra — 8/8, 2/2, 6/6, 16/16, linha após linha.

### 3.2 O teste dos 5 segundos na linha de base — 14 julgamentos em contexto fresco

Placar da **pergunta (a)** ("os números desta tela são de qual filial, ou de todas?"):

| Recorte | Tema | Largura | r1 | r2 |
|---|---|---|---|---|
| uma | claro | 1440 | certeza (não nomeia) | **hesitei** |
| uma | claro | 390 | **hesitei** | **hesitei** |
| uma | escuro | 1440 | **hesitei** | **hesitei** |
| uma | escuro | 390 | **hesitei** (leu "todas") | **hesitei** |
| três | claro | 1440 | **hesitei** | **hesitei** |
| três | claro | 390 | **hesitei** (leu "uma filial") | **hesitei** (leu "uma filial") |
| três | escuro | 1440 | **hesitei** | certeza |

**12 das 14 passadas hesitaram.** Duas erraram o escopo por completo. A frase que se repete
nas respostas é sempre a mesma: *"o nome da filial não aparece na tela"* — a única pista é o
badge de contagem no botão "Filial", e em 390px ele foi lido como "1" quando eram **três**.

E a **pergunta (d)**, que é diagnóstica e não bloqueia, entregou de graça o defeito nº 4, num
julgamento que não sabia dele: *"as colunas 'Em estoque' e 'Cerrado Alto' aparecem lado a lado
com o MESMO número em toda linha, o que dá a impressão de estarem duplicadas"*.

Respostas literais em [`f44-evidencias/antes/teste-5-segundos.json`](f44-evidencias/antes/teste-5-segundos.json).

---

## 4. As três decisões do Johnny — elas mandam

1. **Cor: cada número tem a sua** (*Em estoque*, *Em uso*, *Falta*, *Total*), mais **zebrado e
   separadores mais fortes**. Ele **recusou** mapa de calor por quantidade e **recusou** chip
   colorido por grupo/tipo.
2. **"Repor" passa a seguir o filtro.** Revoga parcialmente a decisão de 23/07/2026 (F12 · I5).
3. **Ficha:** *Itens que foram junto* e *Pendências de item faltante* **descem** para depois da
   linha do tempo e ficam **recolhidos**, com a contagem no título.

---

## 5. O desenho escolhido — e por que ele é este

### 5.1 O escopo vira uma FRASE, dita em dois lugares visíveis

O defeito não é o número: é que a tela não diz de quem ele é. A correção é dizer, **por
extenso e com o nome da filial**, em dois lugares que quem lê a tela não tem como pular:

| Onde | Sem recorte | Uma filial | Três filiais |
|---|---|---|---|
| **linha acima dos cartões** | Números de **todas as filiais** | Números de **Cerrado Alto** | Números somados de **3 filiais** |
| **`<caption>` da tabela** | Total, Em estoque, Em uso e Falta são de **todas as filiais**. | …são de **Cerrado Alto**. | …somam **3 filiais**: Aurora, Cerrado Alto e Estância Velha do Norte. |

**Por que `<caption>` e não uma linha de cabeçalho agrupador (`<th colSpan>`).** A ideia óbvia
era um `<th colSpan={4}>Cerrado Alto</th>` acima das quatro colunas de número. Ela **não
sobrevive à responsividade**: `Total` e `Falta` são `hidden sm:table-cell`, então abaixo de
`sm` só duas das quatro colunas existem — e `colSpan` não tem variante de breakpoint. O
cabeçalho agrupador ou mentiria a largura em 390px, ou teria de sumir justamente na tela em
que o operador tem menos contexto. `<caption>` é a semântica que o HTML já tem para "o título
desta tabela", é anunciada por leitor de tela antes do conteúdo, e funciona em **toda**
largura sem `colSpan` nenhum. (O kit é `caption-bottom`; a tabela de itens passa a
`caption-top` — é o único lugar do produto com legenda de tabela.)

### 5.2 A legenda de cada número passa a ser DERIVADA, e `NUMEROS_ITEM` não muda

`NUMEROS_ITEM` (`lib/ajuda/conteudo/itens-por-quantidade.ts`) é fonte compartilhada com a
página de ajuda, que descreve o significado **sem filtro** e tem de continuar descrevendo.
Então nada muda lá. O que entra é uma função **pura e testada**,
`cabecalhosComEscopo(NUMEROS_ITEM, escopo)` em **`src/lib/itens/escopo.ts`**, que devolve a
mesma lista com duas coisas trocadas quando — e só quando — há recorte:

| chave | `curto` sem recorte | `curto` com recorte |
|---|---|---|
| total | tudo que a TI possui | **tudo em Cerrado Alto** / **tudo nas 3 filiais** |
| estoque | na prateleira agora | na prateleira agora *(não afirma escopo — fica)* |
| emUso | com as pessoas | com as pessoas *(idem)* |
| falta | déficit já assumido | déficit já assumido *(idem)* |

A `explicacao` de **todos** ganha a mesma frase de escopo no fim (é ela que a `Dica` mostra), e
a de `total` tem a **base trocada**, porque "Tudo que a TI possui daquele item" é literalmente
falso sob recorte — e o critério 1 da ordem exige que a string suma da tela renderizada.

**Os NOMES não mudam.** *Total · Em estoque · Em uso · Falta · Reservado* continuam sendo o que
`NUMEROS_ITEM` diz (decisão da F43, não revogada). O que passou a variar é a frase de apoio.

### 5.3 Com exatamente UMA filial, a coluna redundante da matriz sai

Com uma filial marcada, `filiaisVisiveis` tem um elemento e a coluna "Cerrado Alto | em
estoque" **repete o número da coluna "Em estoque"**, linha após linha — provado pela prova 5 e
apontado espontaneamente por um julgamento em contexto fresco que não sabia do problema.

**Decisão: a matriz não é renderizada quando há exatamente uma filial visível.** A `<caption>`
nomeia a filial, e as quatro colunas de número **são** as dela.

**O que NÃO sai:** a linha expansível e os dois controles que a abrem (o chevron a partir de
`xl`, o botão "Ver a filial" abaixo). Ela continua sendo o único lugar com o **atalho de
transferir**, que é da filial de ORIGEM — e continua mostrando o reservado quando existe.
Tirá-la levaria junto um recurso; tirar só a coluna tira só a duplicação.

### 5.4 "Repor" segue o filtro, e diz contra o quê está comparando

Uma linha em três arquivos, e nenhuma delas na aritmética:

- `IdentidadeDoItem` passa `linha.saldo.estoque` (era `linha.consolidado.estoque`);
- `resumoDaLista` conta `aRepor` por `l.saldo.estoque` (era `l.consolidado.estoque`) — é o que
  faz o cartão *A repor* e o selo **nunca discordarem**, que é o critério 5;
- a `Dica` do selo passa a dizer **"estoque em Cerrado Alto: N"** no lugar de
  "estoque de todas as filiais: N" — o texto do escopo desce por prop, da mesma função pura.

Sem recorte, nada muda: `saldo === consolidado`.

**O efeito colateral, dito com todas as letras:** a decisão de 23/07/2026 comparava com o
consolidado *justamente* para não "mandar comprar o que está sobrando na filial ao lado". Com o
recorte, isso passa a poder acontecer — Cerrado Alto com 1 e mínimo 5 acende "repor" mesmo com
40 unidades em Aurora. É o que o Johnny pediu, e a tela passa a dizer o escopo em dois lugares
para que a leitura seja honesta. Registrado como REVISÃO em `docs/DECISOES.md`.

**Raio de alcance conferido:** o card "Itens para repor" do painel inicial **não é afetado** —
ele lê `getSaldosItens(null)` e monta o próprio bloco, sem passar por `resumoDaLista` nem por
`BadgeRepor`. Os dois só compartilham a fórmula `precisaRepor`, que não muda.

### 5.5 A cor — o produto já tem uma língua

`--selo-em-estoque` (verde) e `--selo-em-uso` (azul) são as cores com que o produto inteiro já
diz "em estoque" e "em uso" na tela de ativos. **As colunas de item se chamam exatamente
igual**, então usam a mesma família de matiz — inventar um segundo verde para o mesmo conceito
seria criar dialeto.

| número | tinta | token | por quê |
|---|---|---|---|
| **Em estoque** | verde | `--selo-em-estoque-texto` | o produto já pinta "em estoque" de verde |
| **Em uso** | azul | `--selo-em-uso-texto` | o produto já pinta "em uso" de azul |
| **Falta** | vermelho | `--destructive` | o selo "faltam N" já é vermelho; mesma família de matiz (hue 27) |
| **Total** | **neutro** | `--muted-foreground` | ver abaixo |

**Por que Total é o neutro, e isso é uma escolha e não uma omissão.** Sobram poucos matizes
livres, e os dois candidatos são armadilha: violeta **é** `--selo-reservado`, e "Reservado" é
*outro* dos cinco números de item — usá-lo em Total seria colisão de dialeto dentro da mesma
tela. E há uma razão de leitura: *Em estoque* é a âncora da linha por decisão medida da F43, e
pintar Total de uma cor forte disputaria essa âncora. Total é o número de **referência** — a
soma dos outros dois —, e o neutro diz isso. Ele continua tendo marca própria na chave de cor
(um quadradinho cinza ao lado do rótulo), nos três lugares, como os outros três.

**Uma cor por número, nos TRÊS lugares:** o cartão de resumo, o cabeçalho da coluna e a célula.

- **cartão** — o número grande na tinta + o quadradinho ao lado do rótulo;
- **cabeçalho** — o quadradinho ao lado do rótulo;
- **célula** — o número na tinta (o de *Falta* já é o selo vermelho "faltam N").

**Nada essencial só por cor:** o número e o rótulo continuam ao lado dela, sempre. O quadradinho
é `aria-hidden` — é reforço, não é o dado.

### 5.6 Zebrado, separadores e as quatro convivências

- **Zebrado** calculado pelo **índice da linha em JS**, não por `even:`/`odd:` do CSS: as linhas
  saem em PARES (a linha do item e, quando aberta, a de detalhe), e `nth-child` inverteria a
  listra de todo mundo abaixo de uma linha aberta.
- **O TETO DA LISTRA É DE CONTRASTE, não de gosto** *(corrigido depois da revisão adversarial)*. A
  classificação sob o nome do item é `text-muted-foreground`, e esse cinza mede 4,73:1 sobre o fundo
  da página, 4,53:1 sobre `bg-muted/50` e **4,34:1 — REPROVA AA** sobre `bg-muted` cheio. A escada
  final cabe dentro do que passa: listra `bg-muted/25` (4,63:1) e hover `bg-muted/50` (4,53:1), que
  é o hover do próprio kit — **nada a sobrescrever**. O preço é uma listra mais sutil no tema claro;
  no escuro ela é folgada.
- **A linha de detalhe não é listrada como se fosse outro item**: ela usa `bg-muted`, mais escuro
  que os três, e isso é seguro porque o conteúdo dela NÃO é `muted-foreground` sobre `muted`.
- **`has-aria-expanded`** (`bg-muted/50`, do kit) continua vencendo a listra.
- **Separador vertical mais forte**: um `border-l` entre a identidade e o bloco dos quatro
  números, irmão do que já existe antes da matriz. A tabela passa a ler
  `[quem é] | [os quatro números] | [em cada filial] | [ações]`.
- **`print:`** — a listra é `background-color`, e navegador não imprime fundo por padrão
  (`print-color-adjust: economy`); o `@media print` de `globals.css` **não** liga `exact` para estas
  linhas. No papel a listra some e a tabela volta a se dividir pelas bordas, que é o resultado
  desejado. A `<caption>` **imprime**, por ser texto — o papel passa a carregar a frase de escopo.
  *(Esta linha foi CORRIGIDA depois da revisão adversarial: a redação original afirmava que o
  `@media print` "já neutraliza" a listra, e ele não tem regra nenhuma sobre isso. O resultado é o
  mesmo, mas pelo motivo certo.)*

---

## 6. A ficha do ativo — a mudança mais simples, e a que tem menos risco

**Hoje:** `ItensQueForamJunto` e `PendenciasItemFicha` são renderizados **antes** do card
"Dados do ativo", de `TermosDaFicha` e da linha do tempo. Quem abre a ficha de um notebook vê
primeiro a lista de acessórios que saíram junto.

**Depois:** Dados → Termos → Linha do tempo → Histórico do ativo substituído → **Itens que foram
junto** → **Pendências de item faltante**, os dois **recolhidos**, com a contagem no título.

**Como recolher: `<details>`/`<summary>`, e a escolha é por custo.** Não existe `Collapsible` em
`src/components/ui/` e a regra 3 proíbe instalá-lo. As duas saídas eram `<details>` ou
`BotaoExpandir`/`useExpandidas` (`components/relatorios/linha-expansivel.tsx`). `BotaoExpandir` é
**client**, e os dois blocos da ficha são **Server Components hoje** — adotá-lo transformaria os
dois em client, arrastando `PendenciasItemFicha` (que embute dois diálogos e recebe props de
cargo) para o bundle do navegador sem ganho nenhum. `<details>` mantém os dois no servidor,
custa zero JavaScript, e o navegador já expõe `<summary>` como botão com estado expandido
para leitor de tela — o `aria-expanded` do critério 10 é nativo, e será **conferido na árvore de
acessibilidade** do HTML da prévia, não afirmado.

**⚠ Pendência ABERTA recolhida é um alarme escondido.** O Johnny escolheu isso sabendo, então o
estado FECHADO tem de carregar o alarme:

- a contagem de **abertas** no título — "Itens faltantes da devolução (2 em aberto)";
- a **mesma tinta âmbar** que o bloco já usa, no próprio `<summary>`, com o `TriangleAlert`;
- e o bloco **abre sozinho** (`open`) quando há pendência aberta — recolhido é o estado de
  quem não tem alarme nenhum.

Se a medição mostrar que o recolhido esconde a pendência, **não desobedecemos**: entrega-se como
pedido, registra-se a medição, e a ressalva vai ao relatório como próximo passo.

O `ativo.pendencia` (campo livre, âmbar, no topo) **não se move** — é outra coisa, e continua
sendo a primeira coisa que a ficha grita.

---

## 7. O que fica FORA — não-objetivos declarados

- **Banco.** Nenhuma migration, RPC, view ou policy. Todos os números já existem.
- **`saldoDoRecorte` e a aritmética do recorte** — provada certa na §2.
- **O nome dos cinco números** e o texto de `NUMEROS_ITEM`.
- **As colunas do CSV de saldos** — nome, ordem e conteúdo iguais. (E o CSV já nomeia o escopo
  na coluna "Filial": "Consolidado" ou "A + B". Ele estava certo desde sempre; era a TELA que
  não dizia. Esse é, aliás, o precedente da §5.1.)
- **`?visao=`, e nenhum param novo de URL.** Os filtros são `q`, `grupo`, `filial`, `page`, `pp`.
- **Telas irmãs:** `/itens/historico`, `/itens/conferencia`, `/admin/**`, os diálogos de lançar
  e transferir, os relatórios, a home.
- **`src/components/ui/`** e **nenhuma dependência nova**.

---

## 8. As travas que vão brigar, e como não brigar com elas

| Trava | O que ela cobra | Como esta fase paga |
|---|---|---|
| `cores.test.ts` · `TETO_PALETA_CRUA = 473` | catraca que **só desce**; se o total descer, o teto desce **no mesmo commit** | nenhuma classe crua nova: as quatro tintas são **token** (`selo-*-texto`, `destructive`, `muted-foreground`). Se o total mexer, o teto e `ARQUIVOS_COM_PALETA` acompanham |
| `scripts/contraste.mjs` | todo par novo com `exigir: true`, AA nos **dois** temas | pares novos: as três tintas sobre `background`, sobre `card` e sobre a **listra** e o **hover**, nos dois temas |
| `consistencia.test.ts` | 8 regras; `components/itens/` e `components/ativos/` **já estão sob a régua** | nenhum arquivo novo em PENDENTES; nenhuma moldura à mão; espaçamento na escala; `loading.tsx` espelha a largura |
| `registry.test.ts` | 2 a 6 `mudancas`, sem vocabulário de desenvolvedor | texto de operador, conferido contra a lista de 21 termos proibidos |
| `cobertura-changelog.test.ts` | toda entrada nova do CHANGELOG tem versão **na mesma data** | `1.49.0` · `2026-09-01` · `fase: 'F44'` |

---

## 9. Gabarito recurso-a-recurso (não-regressão)

Nenhuma linha pode acabar em "sumiu". A tabela cheia vai ao `RELATORIO-F44.md`; o gabarito é:

**`/itens`** — os três filtros (`q`, `grupo`, `filial`) · paginação e seletor de tamanho ·
ordenação · export CSV (colunas idênticas) · "Lançar quantidade" · "Ver histórico deste item" ·
"Transferir" · "Conferir estoque" · "Exportar saldos" · "Histórico" · `?lancar=1` · o selo
"faltam N" e sua Dica · `foraDasFiliais` na linha e na linha aberta · o aviso de reservado · os
**quatro** estados vazios · `RealtimeRefresh` · a linha expansível e o atalho de transferir por
filial · o botão "Ver as N filiais" do celular · o chevron a partir de `xl` · **cargo consulta**
sem menu de ações · **operador de uma filial só** · o desvio do link antigo do histórico.

**`/ativos/[id]`** — resolver e reabrir pendência de item · os termos (gerar, baixar, editar,
confirmar/desfazer assinatura) · a linha do tempo · o histórico do ativo substituído · o estorno ·
duplicar movimentação · as ações de exceção (`⋯`) · copiar patrimônio e service tag · anotar ·
editar · comprar outro igual · devolver ao fornecedor · o vínculo de sucessão · a pendência de
campo livre · o card "você só lê nesta filial" · o título da aba.

---

## 10. Verificação de ponta a ponta

1. `npm run lint` · `npm run test` · `npm run contraste` · `npm run build` a cada incremento.
2. **A varredura do critério 1**: `grep` na tela **renderizada** (o HTML da prévia com recorte)
   provando que "tudo que a TI possui" e "de todas as filiais" **não aparecem**.
3. `medir-tabela.mjs` nos três recortes × duas larguras: nenhuma coluna fora da tela, a página
   não rola na horizontal.
4. **Teste dos 5 segundos** no DEPOIS, mesmo protocolo e mesmas perguntas do ANTES; régua
   assimétrica (uma reprovação derruba; aprovar exige **duas** rodadas independentes limpas).
   Condição de parada: **três desenhos** e a pergunta continua reprovando → declara-se NÃO
   ATENDIDA, com as três tentativas e as respostas literais, e segue-se para o rollout.
5. **A árvore de acessibilidade** do `<details>` da ficha, lida pelo Playwright, provando o
   estado expandido nativo.
6. **Revisão adversarial em contexto fresco**, contra este plano e o gabarito da §9.
7. Versão `1.49.0` (fase → MINOR), registry, CHANGELOG, tag `v1.49.0`, merge, CI, deploy, smoke.
