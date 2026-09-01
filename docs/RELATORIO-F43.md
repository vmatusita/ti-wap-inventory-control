# Relatório da F43 — `/itens` entendida ao bater o olho

**Executada em 01/09/2026**, em modo autônomo, na branch `f43-legibilidade-itens`.
Ordem de serviço: [`docs/prompts/F43-legibilidade-itens-ultracode.md`](prompts/F43-legibilidade-itens-ultracode.md).
Plano: [`docs/PLAN-F43.md`](PLAN-F43.md). Atas: [`docs/DECISOES.md`](DECISOES.md), 18 entradas na data.
Versão: **1.48.0**. **Sem migration, sem dependência nova, sem mudar regra, permissão, rota ou rótulo.**

---

## 1. O problema, em uma frase — e o critério, literal

A F42 (31/08/2026) consertou a **estrutura** de `/itens`: matou o `?visao=`, pôs a tela no casco da F40
e deu rota própria ao histórico. Resolveu a dor D3 do [`PLANO-ITENS.md`](PLANO-ITENS.md) — *"a view de
itens foge totalmente do padrão do sistema"*. **Não resolveu a leitura.** No dia seguinte, olhando a
tela entregue, o Johnny:

> "ainda está mto confusa e a visualização não está boa, não consigo entender de cara o que é cada
> coisa, tem que ser algo que entenda logo ao bater o olho"

Perguntado sobre **o que a tela tem de responder em 5 segundos**, sem tooltip e sem contar coluna, ele
escolheu UMA coisa:

> **onde está o item — quanto tem em cada filial.**

Que era, exatamente, a informação que a F42 tinha posto atrás do chevron, um item por vez.

---

## 2. Antes × depois, com as imagens

As imagens estão em [`docs/f43-evidencias/`](f43-evidencias/). Todas saíram da mesma ferramenta, com o
**mesmo catálogo fictício** — 44 itens, filiais inventadas, gerador determinístico —, então a comparação
mede o DESENHO e não dois sorteios diferentes.

| | antes (`v1.47.2`) | depois (`v1.48.0`) |
|---|---|---|
| 1440×900, claro | [`antes/itens__atual__padrao__claro__1440x900.png`](f43-evidencias/antes/itens__atual__padrao__claro__1440x900.png) | [`depois/…claro__1440x900.png`](f43-evidencias/depois/itens__atual__padrao__claro__1440x900.png) |
| 1440×900, escuro | [`antes/…escuro__1440x900.png`](f43-evidencias/antes/itens__atual__padrao__escuro__1440x900.png) | [`depois/…escuro__1440x900.png`](f43-evidencias/depois/itens__atual__padrao__escuro__1440x900.png) |
| 390×844, claro | [`antes/…claro__390x844.png`](f43-evidencias/antes/itens__atual__padrao__claro__390x844.png) | [`depois/…claro__390x844.png`](f43-evidencias/depois/itens__atual__padrao__claro__390x844.png) |
| 390×844, escuro | [`antes/…escuro__390x844.png`](f43-evidencias/antes/itens__atual__padrao__escuro__390x844.png) | [`depois/…escuro__390x844.png`](f43-evidencias/depois/itens__atual__padrao__escuro__390x844.png) |

As três candidatas de desenho (§5) estão em [`f43-evidencias/variantes/`](f43-evidencias/variantes/).

### 2.1 A ferramenta que tornou a prova possível

`scripts/design/capturar.mjs` **se recusa** a fotografar produção — regra 2 do `CLAUDE.md`, e é trava,
não conselho. Este repositório não tem `.env.ensaio` e o `.env.local` aponta para produção: foi por isso
que a F42 registrou "não foi possível fotografar" e seguiu. Uma fase de LEGIBILIDADE não pode.

`scripts/design/previa-itens.tsx` resolve por outro caminho — **o componente real, dados fictícios**:

- **React de verdade**: `renderToStaticMarkup` (react-dom 19.2.8, já é dependência);
- **CSS de verdade**: `src/app/globals.css` compilado pelo `@tailwindcss/postcss`, o mesmo do build —
  mudou um token, a próxima foto já sai com ele;
- **foto de verdade**: Playwright (devDependency desde 30/08/2026), 1440×900 e 390×844, claro e escuro;
- **zero dependência nova** (regra 3), zero banco, zero `.env` lido.

**O que é REAL na foto:** `Pagina`, `CabecalhoDaPagina`, `ItensFiltros`, `ItensTable`, `AtivosPaginacao`,
`EstadoVazio`, `ResumoDeItens`, `RealtimeRefresh`, `ExportarCsvButton`, `LancarItemDialog`,
`TransferirItemDialog`, `BadgeRepor` e todo o kit `ui/` — importados de `src/`, exatamente o que vai ao
ar. **O que é DUBLÊ:** o cabeçalho superior e a barra lateral do app, desenhados com as MESMAS medidas do
`(app)/layout.tsx` (`h-14`, `w-60` a partir de `md`, `main` com `p-4 md:p-6`) para a **largura útil** da
foto ser a real: **1150px em 1440, 356px em 390**. **O que NÃO existe na foto:** a fonte Geist (vem do
`next/font`, que só roda dentro do Next) — cai no fallback `system-ui` que o próprio `globals.css`
declara; e o `SelectValue` do Radix aparece **vazio** (ele só resolve o texto do item escolhido na
hidratação). As duas limitações valem igualmente no "antes" e no "depois".

### 2.2 O que a foto do "antes" mostrou, e ninguém tinha visto

Fotografada a tela de HOJE, `scripts/design/medir-tabela.mjs` mediu:

```
antes  1440px  wrap 1150/1150
   Comparar filiais=56  Item=523  Grupo=161  Tipo=85  Total=48  Em estoque=88  Em uso=63  Falta=79  Ações=48
antes   390px  wrap 356/740  ⚠ COLUNA FORA DA TELA
   Comparar filiais=56  Item=488  Em estoque=82  Em uso=58  Ações=56
```

**Em 390px a tabela pedia 740px numa caixa de 356px.** As colunas *Em estoque* e *Em uso* existiam no
HTML e ficavam **fora da área visível**, atrás de uma rolagem horizontal que ninguém descobre: no
celular, `/itens` mostrava o nome do item e mais nada. A causa é o `whitespace-nowrap` que o kit shadcn
põe em toda célula, somado a um nome de item comprido. **Isso não estava em nenhum dos sete pontos do
diagnóstico da ordem de serviço** — apareceu porque a fase mediu em vez de olhar.

E no desktop a mesma medição explicou onde estava a largura: a coluna **Grupo** custava **161px** para
repetir "Acessórios e periféricos" 24 vezes seguidas — a informação de MENOR variação da tela (o
vocabulário tem dois valores).

Depois:

```
depois 1440px  wrap 1150/1150
   (chevron)=56  Item=238  Total=114  Em estoque=127  Em uso=89  Falta=107
   Aurora=71  Bonança=70  Cerrado Alto=89  Dunas=70  Estância=70  Ações=48
depois  390px  wrap 356/356
   Item=157  Em estoque=92  Em uso=58  Ações=48
```

---

## 3. O teste dos 5 segundos — o critério de aceite principal

**O protocolo, como a ordem o define:** cada imagem vai para um subagente em **contexto fresco**, que não
viu o código, nem o prompt, nem o desenho pretendido. Ele recebe SÓ a imagem e quatro perguntas, com a
instrução: *"responda só olhando a imagem; se não tiver certeza ou precisar de mais que alguns segundos,
responda NÃO SEI"*. **Uma reprovação vale de imediato** (errou ou hesitou); para APROVAR, a pergunta tem
de passar em **duas rodadas independentes, com subagentes diferentes**. A pergunta **d** é diagnóstica e
não reprova nada.

O item sorteado foi **"Cabo de rede Cat6 3 m"** — o caso "espalhado nas cinco filiais". A verdade dele,
no catálogo fictício: Total 76 · Em estoque 36 · Em uso 40 · Aurora 3 · Bonança 7 · Cerrado Alto 16 ·
Dunas 0 · Estância 10. Os itens com selo "repor" na página 1 são exatamente cinco: Headset com
microfone, Adaptador USB-C para HDMI, Apresentador sem fio, Capa protetora para tablet e Filtro de
privacidade 14".

### 3.1 O placar

Cada célula tem **quatro julgamentos**: dois temas × duas rodadas independentes.

| | 1440×900 · antes | 1440×900 · depois | 390×844 · antes | 390×844 · depois |
|---|---|---|---|---|
| **a** · o que repor | ✅ certeza 4/4 | ✅ **certeza 4/4** | ✅ certeza 4/4 | ✅ **certeza 4/4** |
| **b** · em quais filiais | ❌ **NÃO SEI 4/4** | ✅ **certeza 4/4** | ✅ certeza 4/4 | ✅ **certeza 4/4** |
| **c** · prateleira × pessoas | ✅ certeza 4/4 | ✅ **certeza 4/4** | ❌ **NÃO SEI 4/4** | ✅ **certeza 4/4** |

**12 de 12 com certeza no depois.** Tempo estimado pelos próprios julgadores: 6, 5, 8, 6, 5, 4, 6, 4
segundos — todos dentro do alvo. Esta é a medição da **imagem que está no repositório**, tirada do
código que foi ao ar: depois de cada correção (inclusive as duas da revisão adversarial, §7.2) a prévia
foi refotografada e o protocolo rodou de novo, para não haver distância entre o que se mediu e o que se
entregou. As respostas literais, todas, em
[`antes/teste-5-segundos.json`](f43-evidencias/antes/teste-5-segundos.json) e
[`depois/teste-5-segundos.json`](f43-evidencias/depois/teste-5-segundos.json).

### 3.2 As respostas literais — antes

**b, em 1440px** (as quatro passadas deram NÃO SEI; duas delas):

> "NÃO SEI — a linha do item na tabela mostra só números consolidados (Total 76 / Em estoque 36 / Em uso
> 40), sem quebra por filial. Existe um filtro 'Filial' no topo da tela, mas ele está vazio/sem seleção,
> então não dá para saber quanto tem em cada filial só olhando esta imagem."

> "NÃO SEI. A linha do Cabo de rede Cat6 3 m mostra só um total agregado (76, sendo 36 em estoque e 40
> em uso) — não há coluna de filial na tabela, só um filtro 'Filial' no topo que está vazio."

**c, em 390px** (as quatro deram NÃO SEI; duas delas):

> "NÃO SEI — nesta tela a linha está fechada (colapsada) e só mostra o nome do item; não há coluna de
> quantidade nem divisão prateleira/com pessoas visível sem expandir a linha."

> "NÃO SEI — na tela recolhida (como está na imagem) não aparece nenhum número por item, só o nome e, às
> vezes, a etiqueta 'repor'. Não há coluna de prateleira."

### 3.3 As respostas literais — depois

**b, em 1440px:**

> "Aurora: 3 · Bonança: 7 · Cerrado Alto: 16 · Dunas: 0 · Estância: 10."

> "Cabo de rede Cat6 3 m está nas 5 filiais listadas: Aurora (3), Bonança (7), Cerrado Alto (16), Dunas
> (0) e Estância (10)."

**b, em 390px** (a pergunta lá é *"onde você tocaria?"*):

> "No link 'Ver as 5 filiais' (com a setinha ⌄), logo abaixo dos números 36/40 na própria linha do item
> 'Cabo de rede Cat6 3 m' — é um accordion que expande ali mesmo."

**c, em 390px:**

> "36 na prateleira (coluna 'Em estoque') e 40 com as pessoas (coluna 'Em uso')."

**a, nos dois tamanhos** — a lista exata, e o escopo entendido:

> "Os itens marcados com o selo 'repor': Headset com microfone, Adaptador USB-C para HDMI, Apresentador
> sem fio, Capa protetora para tablet e Filtro de privacidade 14" (bate com o '5 nesta página' do card
> 'A repor' no topo)."

### 3.4 A pergunta **d**, inteira — o que ela achou e o que virou o quê

A **d** não reprova; ela alimenta o desenho. Nesta fase ela mudou o desenho **quatro vezes**, e o que
sobrou dela virou backlog:

| O que a **d** disse | O que virou |
|---|---|
| *"'3 fora da lista' — fora de QUE lista?"* (5 de 8 passadas) | a frase foi reescrita para **"inclui 3 de filial fora desta lista"** — a mesma palavra que a linha expansível já usava |
| *"esses 3 já estão dentro do 31 ou são além dele?"* | é o que o verbo **"inclui"** responde |
| *"fico em dúvida se `0` e `—` querem dizer a mesma coisa"* | a coluna passou a mostrar **sempre um número**; `CelulaDeFilial` perdeu o campo `presente` |
| *"o card diz 11 e eu conto 5 selos"* | o cartão passou a dizer **"· 5 nesta página"** |
| *"o (5) de 'Ver por filial (5)' é a quantidade de filiais ou outro número?"* | o rótulo virou **"Ver as 5 filiais"** |
| *"na coluna Cerrado Alto aparece só 16, sem a linha 'X em uso' que as outras mostram"* | matou a candidata **B** (§5) |
| *"as 5 colunas somam 36, que bate com Em estoque e não com o Total — alguém pode ler 'Cerrado Alto: 16' achando que é o total daquela filial"* | **escolha declarada, e vai para o backlog** (§9) |
| *"a coluna Falta mostra `—` em quase toda linha e 'faltam 2' numa só — o travessão é zero ou 'não se aplica'?"* | **backlog** (§9) — é vocabulário congelado nesta fase |
| *"qual é essa filial fora da lista, se a tabela mostra 5 colunas?"* | **backlog** (§9) — é filial DESATIVADA com saldo, e a tela não tem como nomeá-la sem inventar coluna |

---

## 4. A tabela recurso-a-recurso (critério 4)

**Nenhuma linha acaba em "sumiu".** O molde é o da §3 do [`RELATORIO-F42.md`](RELATORIO-F42.md).

### Filtros, params e URL

| Recurso (F42) | Depois | Onde |
|---|---|---|
| Busca `q`, só no submit | **igual** | `itens-filtros.tsx` — arquivo **intacto** |
| Filtro de filial (multi, com `todas` e o padrão do cargo) | **igual** — e agora recorta também as COLUNAS de filial | `page.tsx:122`, `itens-table.tsx` |
| Select "Grupo" | **igual** | `itens-filtros.tsx` |
| "Limpar" (preserva `pp`) | **igual** | `itens-filtros.tsx` |
| `page` com clamp na última página | **igual** | `page.tsx:113` |
| `pp` (25/50/100), sobrevive ao "Limpar" | **igual** | `page.tsx:114` |
| `?lancar=1` + atalho `L` | **igual** | `page.tsx:275` · `lancar-item-dialog.tsx` **intacto** |
| `?visao=` legado ignorado, sem 404 | **igual** | nunca foi lido |
| Desvio do link antigo do histórico | **igual** | `src/lib/supabase/proxy.ts` — **intacto** |
| `baseFiltrosItens` contra a corrida de navegação | **igual** | `url-filtros.ts` — **intacto** |

### Colunas, números e selos

| Antes | Depois |
|---|---|
| Coluna **Grupo** (`hidden md:table-cell`) | **linha sob o nome**, visível em TODA largura, com o rótulo curto ("Acessório") |
| Coluna **Tipo** (`hidden lg:table-cell`) | **mesma linha**, ao lado do grupo — idem |
| **Total** | igual, atenuado (era `text-muted-foreground`, continua) |
| **Em estoque** | igual, **um degrau acima** (`text-base font-semibold`) — a âncora |
| **Em uso** | igual |
| **Falta**, com o selo vermelho "faltam N" e a Dica do compromisso | **idêntico** |
| selo âmbar **"repor"** junto do nome, comparando com o CONSOLIDADO | **idêntico**, mais um ícone de alerta |
| `foraDasFiliais` só na linha aberta | **na linha também** ("inclui N de filial fora desta lista") e na linha aberta, como antes |
| aviso de reservado (`atrelados > 0`) na linha aberta | **idêntico** |
| *(não existia)* | **uma coluna por filial**, com o saldo em estoque |
| *(não existia)* | **resumo em cartões** acima da tabela |
| *(não existia)* | a explicação curta VISÍVEL sob o rótulo de cada número |

### Ações, estados e cargo

| Recurso | Depois |
|---|---|
| `RealtimeRefresh` | igual |
| "Exportar saldos" | igual — e `src/lib/actions/exportar.ts` está **intacto** |
| "Histórico" | igual |
| "Conferir estoque" (com a filial no link quando há uma só) | igual |
| "Transferir" (só com ≥ 2 filiais de escrita) | igual |
| "Lançar" | igual |
| menu `⋯` → "Lançar quantidade" e "Ver histórico deste item" | igual |
| atalho de transferir **por filial**, na linha expansível | igual |
| **linha expansível** com os quatro números de cada filial | igual — e agora consumindo a MESMA conta da linha |
| "Nenhum item no catálogo" (+ destino admin) | igual |
| "Nenhum item com esses filtros" (+ Limpar) | igual |
| "Nenhum saldo nas suas filiais" (+ Ver todas) | igual |
| "Nenhum saldo ainda" | igual |
| **cargo consulta** não vê o menu `⋯`, nem Conferir, nem Transferir, nem Lançar | igual (`escreve &&`, `page.tsx` e `itens-table.tsx`) |
| **operador de uma filial só** abre recortado, com o estado vazio próprio | igual — e a matriz mostra **só a coluna dele** |

### CSV de saldos

`Item · Grupo · Tipo · Filial · Total · Em estoque · Em uso · Reservado · Falta · <cada filial> ·
<cada filial> — faltam · Fora das colunas`. **Nome, ordem e conteúdo inalterados** — provado pelo
arquivo: `git diff main -- src/lib/actions/exportar.ts` é **vazio**.

### O que NÃO foi tocado, provado por diff vazio

`exportar.ts` · `proxy.ts` · `url-filtros.ts` · `lancar-item-dialog.tsx` · `transferir-item-dialog.tsx` ·
`itens-filtros.tsx` · `linha-expansivel.tsx` · `lib/itens/lista.ts` · `cartao-de-metrica.tsx` ·
**`supabase/` inteiro**.

---

## 5. As três candidatas, e por que a matriz venceu

Não existe na casa — nem no repositório irmão — um padrão pronto de distribuição de N filiais dentro de
uma linha de tabela. O mais próximo é `relatorios/medidor-minimo.tsx` (uma barra de UM segmento dentro
de célula) e o `.hbar` do `mockups/dashboard-relatorio.html`. E **não existe cor por filial** no domínio:
`STATUS_CHART_COLOR` é de status de ativo e está semanticamente ocupado. Logo, a distribuição se comunica
por **número e rótulo**, com a cor no papel de reforço — nunca de portadora.

As três foram implementadas como o **MESMO componente** com uma prop de apresentação diferente (cópia
paralela mediria a cópia), fotografadas e submetidas ao mesmo teste.

| | **A · matriz** | **B · matriz dupla** | **C · faixa de blocos** |
|---|---|---|---|
| Como a filial aparece | uma coluna por filial, o saldo em estoque | idem, com `N em uso` numa segunda linha da célula | blocos `Nome N` dentro da célula do nome, ordenados por saldo |
| 1440×900 | b e c com certeza nas duas passadas | idem | **o mais rápido** — 5 e 10 segundos |
| 390×844 | c com certeza | **b hesitou nas duas** | **c deu NÃO SEI nas duas** |
| Altura da página em 390px | 3.723px | 3.766px | **7.751px** |
| Veredito | **ESCOLHIDA** | recusada | recusada |

**Por que B caiu**, na palavra do julgamento: *"na coluna Cerrado Alto aparece só 16, sem a linha 'X em
uso' que as outras filiais mostram — não dá para saber se é 0 em uso ou 'sem dado'"*. Segunda linha
CONDICIONAL dentro de célula é ambiguidade, não densidade.

**Por que C caiu**: ela era a melhor no desktop e a pior no celular, com número. Feita a escolha, a prop
saiu do componente — **não fica alternador nenhum no código**, e o `?visao=` continua morto.

---

## 6. O que mudou por arquivo, e por quê

| Arquivo | O quê |
|---|---|
| `src/lib/itens/distribuicao.ts` **(novo)** | as funções puras: o rótulo curto da filial (colisão-safe), a distribuição de um item entre filiais e o resumo da lista. **Nenhuma leitura nova** — tudo sai do que `getSaldosPorFilial` já devolve |
| `src/lib/itens/distribuicao.test.ts` **(novo)** | 21 casos, incluindo os de borda: colisão de rótulo, filial sem lançamento, "repor" contado pelo CONSOLIDADO e não pelo recorte, lista vazia |
| `src/components/itens/itens-table.tsx` | a matriz de filiais, o bloco de identidade, o `whitespace-normal` da célula do nome, o botão "Ver as N filiais", a nota do saldo fora da lista, e a linha expansível consumindo a MESMA conta |
| `src/components/itens/identidade-do-item.tsx` **(novo)** | nome + selo "repor" + `Acessório · Mouse` — o que era três células |
| `src/components/itens/cabecalho-de-numero.tsx` **(novo)** | rótulo + explicação curta VISÍVEL, com a `Dica` para o detalhe. Substitui o `Cabecalho` interno da tabela |
| `src/components/itens/resumo-de-itens.tsx` **(novo)** | os cartões — primeiro consumidor de `CartaoDeMetrica`/`GradeDeMetricas` |
| `src/components/itens/badge-repor.tsx` | ganhou o ícone de alerta. Palavra e cor inalteradas |
| `src/app/(app)/itens/page.tsx` | monta o resumo (13 linhas). Todo o resto — filtros, params, cargos, estados vazios — intacto |
| `src/app/(app)/itens/loading.tsx` | a faixa de cartões e a linha de duas alturas entraram no esqueleto |
| `src/lib/ajuda/conteudo/itens-por-quantidade.ts` | o campo `curto` em `NUMEROS_ITEM`, e a frase do grupo corrigida |
| `src/lib/ajuda/conteudo/saldos-e-estoque-minimo.ts` | a coluna por filial, o botão do celular, o quarto estado vazio, e **três frases falsas desde a F42** |
| `src/lib/ajuda/conteudo.test.ts` | asserções novas para a verdade nova |
| `scripts/contraste.mjs` | 11 pares novos com `exigir: true`, mais o par REPROVADO registrado como `antes` |
| `scripts/design/previa-itens*.ts(x)`, `tsconfig.previa.json`, `vazio-servidor.ts` **(novos)** | a prévia estática |
| `scripts/design/medir-tabela.mjs` **(novo)** | a régua que achou os 740px em 356px |

---

## 7. Os quatro comandos, e os dois jobs do CI

Rodados na árvore final, com a versão já em 1.48.0. Saída real, colada:

```
===== LINT =====
> estoque-ti-wap@1.48.0 lint
> eslint
ESLint: No issues found
[lint exit=0]

===== TEST =====
> estoque-ti-wap@1.48.0 test
> vitest run

 RUN  v4.1.11 C:/Users/victor.matusita/ti-wap-inventory-control

 Test Files  146 passed (146)
      Tests  3504 passed (3504)
   Start at  10:19:43
   Duration  144.51s

===== CONTRASTE =====
| F43 | cinza sobre o chip cinza (RECUSADO na medição) | claro | muted-foreground | muted     | 4.34:1  | 4.5:1 | ❌ reprova (esperado — é o "antes" registrado) |
| F43 | número do cartão de métrica (claro)            | claro | foreground       | card      | 19.79:1 | 3:1   | ✅ AAA |
| F43 | número do cartão de métrica (escuro)           | escuro| foreground       | card      | 17.16:1 | 3:1   | ✅ AAA |
| F43 | rótulo e apoio do cartão de métrica (claro)    | claro | muted-foreground | card      | 4.73:1  | 4.5:1 | ✅ AA  |
| F43 | rótulo e apoio do cartão de métrica (escuro)   | escuro| muted-foreground | card      | 6.91:1  | 4.5:1 | ✅ AA  |
| F43 | classificação sob o nome do item (claro)       | claro | muted-foreground | background| 4.73:1  | 4.5:1 | ✅ AA  |
| F43 | classificação sob o nome do item (escuro)      | escuro| muted-foreground | background| 7.63:1  | 4.5:1 | ✅ AAA |
| F43 | classificação com o mouse na linha (claro)     | claro | muted-foreground | muted/50  | 4.53:1  | 4.5:1 | ✅ AA  |
| F43 | classificação com o mouse na linha (escuro)    | escuro| muted-foreground | muted/50  | 6.84:1  | 4.5:1 | ✅ AA  |
| F43 | "Ver as N filiais" com o mouse em cima (claro) | claro | foreground       | muted     | 18.15:1 | 4.5:1 | ✅ AAA |
| F43 | "Ver as N filiais" com o mouse em cima (escuro)| escuro| foreground       | muted     | 14.48:1 | 4.5:1 | ✅ AAA |
[contraste exit=0]

===== BUILD =====
(as 33 rotas, todas presentes — nenhuma sumiu)
[build exit=0]
```

**Os testes foram de 3.468 para 3.504** (+36): 21 de `distribuicao.test.ts`, o resto da varredura de
`consistencia.test.ts` sobre os arquivos novos e das asserções acrescentadas em `conteudo.test.ts`.
**`PENDENTES` não cresceu** — nenhum arquivo desta fase pediu exceção à régua.

**O par que REPROVA de propósito.** `muted-foreground` sobre `muted` mede **4,34:1** no tema claro —
abaixo do piso AA de 4,5. Foi assim que a primeira escrita da faixa de blocos (a candidata C) pintava o
texto do chip, e a medição derrubou antes do teste. Ele ficou registrado como `antes: true`, na mesma
disciplina do véu `bg-destructive/5` do `Aviso` da F40 — para ninguém "melhorar" a tela pondo-o de volta.

### 7.1 CI, deploy e smoke

**Os dois jobs do CI, verdes** na execução `33514066707` (o merge `5f4d9f5`):

```
verificar -> success      (npm ci · lint · test · contraste · build)
banco     -> success      (Supabase CLI + Postgres real, todas as migrations, os roteiros SQL)
```

O job `banco` — que a ordem de serviço avisava ter caído duas vezes por causa externa — **passou na
primeira**. Esta fase não toca banco: `git diff v1.47.2..v1.48.0 -- supabase/` é **vazio**.

**Deploy:** produção na Vercel, do commit de merge, registrado pelo GitHub:

```
{"created":"2026-09-01T13:34:15Z","env":"Production","sha":"5f4d9f5"}
Vercel -> success
```

**Smoke pós-deploy** (`node scripts/smoke/smoke-prod.mjs`), com sessão de operador de verdade contra a
produção:

```
  [OK   ] /itens — HTTP 307 → /login                      (sem sessão, continua barrado)
  [OK   ] /admin/itens — HTTP 307 → /login
  [AVISO] kits_modelos · anon NÃO lê (RLS) — anon leu 0 linhas, mas não há kit
          cadastrado — RLS não comprovada
  [OK   ] /itens — HTTP 200 (296422 bytes)
  [OK   ] /itens?visao=consolidado — HTTP 200 (296494 bytes)
  [OK   ] /itens?visao=filiais — HTTP 200 (296482 bytes)
  [OK   ] /itens?tipo=saida&de=2026-08-01 — HTTP 307 → /itens/historico?tipo=saida&de=2026-08-01
  [OK   ] /itens/historico — HTTP 200 (249445 bytes)
  [OK   ] /itens/conferencia — HTTP 200 (148677 bytes)
  [OK   ] /admin/itens — HTTP 200 (237452 bytes)
  ...
========================================================================
RESUMO · 108 OK · 1 aviso · 0 n/a (pré-F12) · 0 falha
========================================================================
```

**108 OK · 0 falha.** As duas sentinelas do `?visao=` legado continuam abrindo a tela (200, e não 404),
e o desvio do link antigo do histórico continua devolvendo **307 de verdade** com o recorte inteiro — o
defeito que a v1.47.2 consertou não voltou.

O único **AVISO** é antigo e não é desta fase: o smoke não consegue PROVAR a RLS de `kits_modelos`
porque não há kit cadastrado em produção para o anônimo tentar ler. É a ressalva desenhada no próprio
script ("passou, mas com ressalva"), não uma falha.

---

## 7.2 A revisão adversarial

Quatro lentes independentes em contexto fresco — **que recurso sumiu?**, **o que quebrou por cargo ou por
largura?**, **acessibilidade e cor**, e **a prévia mente?** —, com cada achado passado a um cético
encarregado de **refutá-lo**. Duas lentes voltaram vazias. As outras duas acharam **dois defeitos reais**,
e os dois haviam passado por `lint`, `test`, `contraste` e `build` verdes:

1. **WCAG 2.5.3, "Label in Name" (nível A).** O botão "Ver as 5 filiais" mostrava esse texto e tinha
   `aria-label="Ver os números por filial de {item}"` — **nenhuma palavra em comum**. `aria-label`
   SUBSTITUI o conteúdo como nome acessível: quem navega por comando de voz diz o que LÊ e não
   encontraria o alvo. E abaixo de `xl` este botão é o ÚNICO caminho para os números por filial.
   **Corrigido:** o nome acessível passou a COMEÇAR pelo texto visível — `Ver as 5 filiais de {item}`.
2. **A prévia afrouxava a regra de cargo.** "Histórico" e "Conferir estoque" eram `<a>` sem ícone, e
   Conferir/Transferir dependiam só de `escreve`, sem as condições `filiaisEscrita.length > 0` e `>= 2`
   da `page.tsx` — uma prévia que afrouxa a regra de cargo fotografa uma tela que não existe para
   ninguém. **Corrigido:** mesmos ícones, mesmas três condições. As imagens foram refeitas depois disso,
   e o teste dos 5 segundos rodou de novo sobre elas.

**Régua estática não pega nome acessível divergente do rótulo visível, nem dublê que diverge do
original.** É por isso que a revisão em contexto fresco existe.

---

## 8. Decisões

**18 atas** em [`docs/DECISOES.md`](DECISOES.md), na data de 01/09/2026. As duas que a ordem de serviço
exigia como **REVISÃO** de decisão anterior:

1. **A distribuição por filial volta para a superfície da linha** — revisa o *esconderijo* escolhido pela
   F42, não a decisão dela. O `?visao=` continua morto e não volta: aquilo era um FILTRO que trocava as
   colunas; isto é apresentação permanente. A linha expansível continua existindo.
2. **O PESO dos quatro números muda; a ORDEM não** — porque o comentário de `NUMEROS_ITEM` diz que a
   ordem de lá é a ordem das colunas de cá, e reordenar obrigaria a mexer na página de ajuda para ganhar
   hierarquia que o peso já dá.

---

## 9. Pendências, dívidas e backlog — com o custo declarado

1. **A coluna por filial mostra "em estoque", não o total daquela filial.** Quem está *com as pessoas* de
   cada filial continua só na linha aberta. É escolha, não esquecimento: a candidata que mostrava os dois
   números por célula criou ambiguidade pior e foi recusada por medição. Custo de reverter: refazer o
   bake-off. **Apontado pela pergunta d em 2 das 8 passadas finais.**
2. **A coluna Falta mostra `—` em quase toda linha e "faltam N" numa só** — e o julgamento perguntou se o
   travessão é zero ou "não se aplica". O vocabulário está congelado nesta fase; a distinção é assunto de
   uma revisão de rótulos, se um dia o Johnny quiser uma.
3. **"inclui N de filial fora desta lista" não diz QUAL filial.** Ela é uma filial DESATIVADA com saldo,
   e nomeá-la exigiria uma coluna para algo que não deveria existir. O caso é raro (2 de 44 na prévia,
   **zero em produção**).
4. **Um item com estoque 0 e mínimo 0 parece "a repor" e não é.** "Mínimo 0 = item sem acompanhamento" é
   regra de 22/07/2026 que a tela nunca diz — e o julgamento em contexto fresco tropeçou nela em duas
   passadas de uma rodada intermediária. Não é defeito desta fase; é uma pergunta de produto.
5. **O par `py-0` do `Card` + `p-(--card-spacing)` do filho clicável CONTINUA sem consumidor.** Os
   cartões desta tela são estáticos: um cartão clicável só faria sentido recortando a lista por "a
   repor", e isso é um filtro de URL novo — fora do escopo declarado desta ordem.
6. **A prévia não cobre os três estados vazios nem o cargo `consulta` em imagem.** O script tem os
   cenários (`--cenarios vazio-filtro,vazio-cargo,vazio-catalogo,consulta`), e eles renderizam; as fotos
   não foram anexadas porque não são o critério da fase. Custo: uma linha de comando.
7. **O julgamento do celular vê a imagem reduzida.** A foto de 390px tem 3.723px de altura e é
   apresentada ao subagente em escala reduzida — mais dura que um telefone real, onde o mesmo conteúdo
   ocupa a tela em 1:1. A régua, portanto, é conservadora: o que passa ali passa no aparelho.

---

## 10. Próximos passos sugeridos

- **Uma revisão de vocabulário dos cinco números**, se o Johnny quiser: os itens 2 e 4 do backlog são
  ambos "a tela não diz a regra", e nenhum se resolve com desenho.
- **Adotar `CartaoDeMetrica` nas outras telas** que hoje desenham cinco cartões diferentes (o inventário
  da F40 os mapeou). Agora existe um consumidor de referência.
- **Aplicar a prévia estática a outras telas.** A ferramenta é genérica em tudo menos no miolo; trocar o
  miolo dá foto de `/ativos`, `/pendencias` ou dos relatórios sem tocar em produção.
- **Levar o `whitespace-normal` para as outras tabelas.** `/ativos`, `/pendencias` e `/movimentacoes` têm
  a mesma célula de nome comprido dentro do mesmo `TableCell` do kit — vale medir cada uma com
  `medir-tabela.mjs` antes de supor que estão bem.
