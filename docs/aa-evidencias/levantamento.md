# Passo 5 · Decisão 4 (item AA) — separar tinta de ÁREA e tinta de TEXTO

**Levantamento para decisão do Johnny — nada foi editado no repositório, nada foi commitado.**
Repositório: `C:\Users\victor.matusita\ti-wap-inventory-control` (main, `fc94b56`, v1.66.5).
Toda afirmação vem de medição desta sessão (`docs/aa-evidencias/medir.mjs`, Node puro, zero dependência) ou de leitura direta do código citado por `arquivo:linha`.

Esta é a **rodada 2**. A rodada 1 (a primeira rodada, fora do repositório) mediu só os pares **adjacentes na pilha** (`STATUS_ORDEM`). O verificador achou o furo: o otimizador da rodada 1 protegia vizinhos de pilha e ignorava vizinhos que só existem em OUTRAS telas (glossário, KPI tiles) — e a paleta "separada" da rodada 1 derrubava `em_estoque×emprestado` de ΔE 10,45 para 3,38 sob tritanopia sem que nada acusasse, porque esse par nunca é vizinho em `STATUS_ORDEM`. Esta rodada corrige isso: mede contra **todos os 21 pares** entre os 7 status vivos.

---

## 1. Superfícies que usam `STATUS_CHART_COLOR` / `--grafico-*`, e os pares que convivem em cada uma

Levantado por grep (`grep -rn "STATUS_CHART_COLOR\|--grafico-" src/`) + leitura de cada arquivo nesta sessão.

| Superfície | Arquivo:linha | O que pinta |
|---|---|---|
| Fonte da paleta | `src/lib/dominio.ts:136-145` (`STATUS_CHART_COLOR`) → `src/app/globals.css:306-314` (`--grafico-<familia>`, só em `:root`, **não repetido em `.dark`** — comentário explícito em `globals.css:372`: "são valor único nos dois temas, e o `.dark` não as sobrescreve") | os 9 tokens |
| Espelho p/ Vitest | `src/lib/relatorios/rotulo-grafico.ts:27-39` (`TOKEN_PARA_HEX`) — mapa **sem tema** (uma entrada por token); `fillRotuloSegmento` (linha 95-99) escolhe branco/preto **uma vez**, "vale igual no claro e no escuro" (comentário do próprio arquivo, linha 1-7) | decide a cor do rótulo "42" dentro do segmento |
| Trava TS↔CSS | `src/lib/dominio/cores.test.ts:310-346` (`describe('a tinta de grafico atravessa a fronteira CSS -> Vitest'`) — lê **só o bloco `:root`** (`blocoCss(':root')`, linha 311-312) para conferir os 9 hex; **não lê `.dark`** | trava do §3 (custo de mudar p/ tema) |
| Barra do acervo (1 linha) | `src/components/relatorios/barra-acervo.tsx:35,54,80,91` | `fill` do segmento, `background` do swatch da legenda de topo, `className` do rótulo |
| Empilhadas por categoria | `src/components/relatorios/barras-empilhadas.tsx:68,159,193,214` | idem, uma barra por categoria |
| Acento do KPI tile | `src/components/relatorios/kpi-tiles.tsx:38` (`acentoDoTile`) | borda de 3px no topo do tile |
| Swatch do glossário | `src/components/relatorios/legendas.tsx:89` | ponto de 10px ao lado do termo |
| Série temporal | `src/components/relatorios/serie-estado-grafico.tsx:27,110,114` | **uma única série** (`em_estoque`), sem par — ver nota abaixo |

### 1.1 — Vizinhos reais, por superfície (arquivo:linha)

**A) `barra-acervo.tsx` / `barras-empilhadas.tsx` — a pilha FILTRA status zerado.**
`src/lib/relatorios/acervo.ts:36`: `agregarAcervoPorSituacao` faz `STATUS_ORDEM.filter((s) => (soma.get(s) ?? 0) > 0)` antes de montar `segmentos`. `BarraAcervo` (`barra-acervo.tsx:27-105`) empilha só o que sobrou, na ordem que sobrou. Se `reservado` está zerado numa filial, `em_estoque` e `em_uso` colam direto — **e não são vizinhos em `STATUS_ORDEM`**. `barras-empilhadas.tsx:42-64` tem o mesmo padrão por categoria (`presentes` é "algum total > 0 em QUALQUER categoria", mas cada LINHA empilha só o que ELA tem). **Qualquer um dos 7 pode ficar do lado de qualquer outro**, dependendo de qual dos que ficam entre eles está zerado naquele filial/categoria/período — não é caso raro, é o comportamento normal do componente.

**B) `legendas.tsx:74` (`sm:grid-cols-2`) + `legendas.ts:104-195` (`glossarioRelatorio`).**
A ordem NÃO é `STATUS_ORDEM`: é `em_uso, em_estoque, reservado, emprestado, em_triagem, em_manutencao, defasado, descartado, devolvido_fornecedor`, intercalada com 6 verbetes sem status ("Total de ativos", "Saída", "Entrada"...). Grade 2 colunas no desktop, **1 coluna na base** (o `dl` não tem `grid-cols` fora do `sm:`, então todo vizinho sequencial no mobile vira par vertical). União desktop+mobile, só pares com `status` nos dois lados:
- horizontal (desktop): `em_estoque-reservado`, `emprestado-em_triagem`, `em_manutencao-defasado`, `descartado-devolvido_fornecedor`
- vertical (desktop): `em_estoque-emprestado`, `emprestado-em_manutencao`, `em_manutencao-descartado`, **`em_uso-reservado`**, `reservado-em_triagem`, `em_triagem-defasado`, `defasado-devolvido_fornecedor`
- sequencial (mobile, 1 coluna): `em_uso-em_estoque`, `reservado-emprestado`, `em_triagem-em_manutencao`, `defasado-descartado` (+ os 4 já listados)

É daqui que nasce o `em_uso×reservado` que o verificador cobrou — vizinho de COLUNA (em_uso na linha 0, reservado na linha 1), não da pilha.

**C) `kpi-tiles.tsx:126` (`grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7`).** Três grades responsivas para os mesmos 7 tiles (`total` + 6 status — **`emprestado` fica fora** do tile principal). "Total" ocupa a linha cheia em toda grade (`col-span-2 sm:col-span-3 xl:col-span-1`). No `xl` os 7 cabem numa linha só. União dos 3 breakpoints (só os 6 status do tile principal): `em_uso-em_estoque`, `em_estoque-reservado`, `reservado-em_triagem`, `em_triagem-em_manutencao`, `em_manutencao-defasado` (sequência comum) + `em_uso-reservado`, `em_estoque-em_triagem`, `reservado-em_manutencao`, `em_triagem-defasado` (verticais do `grid-cols-2`) + `em_uso-em_triagem`, `em_estoque-em_manutencao`, `reservado-defasado` (verticais do `sm:grid-cols-3`).
`kpi-tiles.tsx:215` (`GrupoKpis`, `grid-cols-2 sm:grid-cols-4`, os 4 tiles `em_estoque/reservado/em_manutencao/emprestado`) acrescenta `em_estoque-em_manutencao` e `reservado-emprestado` (verticais mobile).

**D) `serie-estado-grafico.tsx` — NÃO se aplica.** Uma linha, um `dataKey` (`em_estoque`), `config` com uma entrada só (linha 26-28). Não há segunda série nem área sobreposta: nenhum par novo nasce aqui. Confirmado lendo o componente, não presumido.

### 1.2 — Conjunto adotado (item 1: "se houver dúvida, restrinja o mais seguro")

Entre (A), (B) e (C), pelo menos **19 dos 21 pares possíveis** já aparecem vizinhos em alguma tela real desta sessão — e (A) por si só (o filtro de zero) torna qualquer par dos 7 vivos um vizinho **potencial** em alguma filial/categoria, a qualquer momento, sem precisar de mudança de código nenhuma. Por isso este levantamento usa a régua mais segura: **todos os C(7,2) = 21 pares entre os 7 status vivos** (`em_uso, em_estoque, reservado, emprestado, em_triagem, em_manutencao, defasado`) — não só os 6 vizinhos de `STATUS_ORDEM`.

---

## 2. A paleta ATUAL contra a régua de 21 pares

Método (o mesmo de `docs/ANALISE-RELATORIOS-2026-08-10.md` §4): Machado–Oliveira–Fernandes 2009 severidade 1.0, ΔE = distância euclidiana OKLab ×100, pisos CVD alvo 8 / mínimo 6, piso visão normal 15 (portão duro), contraste de elemento gráfico 3:1 contra o card (`#ffffff` claro / `#171717` escuro). Tritanopia é extensão declarada (a análise de 10/08 só tinha proto/deutan).

| status | hex | contraste claro | contraste escuro | rótulo (fill / razão) |
|---|---|---:|---:|---|
| Em estoque | `#16a34a` | 3.30:1 ✅ | 5.44:1 ✅ | preto · 6.37:1 |
| Reservado | `#6d28d9` | 7.10:1 ✅ | **2.52:1 ⚠️** | branco · 7.10:1 |
| Em uso | `#2a78d6` | 4.42:1 ✅ | 4.06:1 ✅ | preto · 4.76:1 |
| Emprestado | `#06b6d4` | **2.43:1 ⚠️** | 7.38:1 ✅ | preto · 8.65:1 |
| Em triagem | `#db2777` | 4.60:1 ✅ | 3.90:1 ✅ | branco · 4.60:1 |
| Em manutenção | `#d97706` | 3.19:1 ✅ | 5.63:1 ✅ | preto · 6.59:1 |
| Defasado | `#9ca3af` | **2.54:1 ⚠️** | 7.06:1 ✅ | preto · 8.27:1 |

Pior ΔE por visão, sobre os **21 pares restritos**:

| visão | pior par | ΔE | piso |
|---|---|---:|---:|
| normal | emprestado×defasado | 11.33 | ≥15 → **abaixo** |
| protanopia | emprestado×defasado | **5.63** | ≥6 → **abaixo do mínimo** |
| deuteranopia | em_estoque×em_triagem | 6.14 | ≥6 → passa (folga 0,14) |
| tritanopia | em_estoque×em_uso | 6.26 | ≥6 → passa (folga 0,26) |

### 2.1 — Achados novos desta rodada (não estavam no radar da rodada 1 nem de `scripts/contraste.mjs`)

1. **`emprestado×defasado` já reprova o piso MÍNIMO (6) sob protanopia hoje, em produção** (5,63) — não é hipotético, é a paleta no ar agora. Nem a análise de 10/08 nem `scripts/contraste.mjs` mediam este par: `defasado` estava fora da régua de ΔE por decisão de design (cinza de-ênfase, croma 0,019 — `dominio.ts:115-122`), e `emprestado` só era comparado a `em_uso` (vizinho de pilha). Vizinho real: filtro de zero (A) — se `em_triagem` e `em_manutencao` estiverem zerados numa filial, `emprestado` e `defasado` colam na pilha.
2. **`defasado` (claro, 2,54:1) nunca foi registrado em `scripts/contraste.mjs`** — os outros dois alívios (`emprestado` claro, `reservado` escuro) têm entrada com `alivio: true` (linhas 413-414); `defasado` não tem entrada `grafico: true` nenhuma. Achado herdado e confirmado da rodada 1.
3. **`em_estoque×em_manutencao` (protanopia, 6,17) e `em_estoque×em_triagem` (deuteranopia, 6,14) já estão hoje a menos de 0,3 do piso mínimo** — passam, mas raspando. Nenhuma das 3 propostas abaixo piora estes dois (não tocam nos 4 tokens fixos), mas valem registro para quando algum desses 4 tons mudar no futuro.

---

## 3. As quatro opções medidas

Regra de "não piora" (item 3): **leitura adotada e registrada** — "não piora abaixo do que é hoje" foi lida como *"não deixa de alcançar o alvo 8 num par que hoje já o alcança"*, não como "nunca cai nem 0,01 do valor exato de hoje". A leitura literal reprova QUALQUER movimento de QUALQUER token (mover uma cor muda a distância OKLab dela a quase tudo por uma fração, inclusive pares hoje a ΔE 30+ sem relação nenhuma com o problema) — tornaria toda proposta, inclusive a de 1 token só, matematicamente impossível. A conclusão de infeasibilidade abaixo **não depende dessa escolha de leitura**: sob a leitura mais frouxa possível (só os pisos 6 CVD / 15 normal, sem nenhuma preservação de alvo), a opção (c') **ainda falha**, por uma causa estrutural diferente (§3.2).

### 3.1 — (a) ATUAL — manter

Sem mudança de hex. Custo: **três** registros em `scripts/contraste.mjs` (documentação, não código de produção):
- os 2 alívios de contraste já existentes (linhas 413, 414) continuam válidos;
- **novo**: alívio de contraste para `defasado` claro (2,54:1) — hoje sem entrada;
- **novo**: um alívio de ΔE (não de contraste) para `emprestado×defasado` sob protanopia (5,63 < 6) — precedente já existe (`scripts/contraste.mjs:407-411`, "o segmento nunca depende da cor sozinha": rótulo, total, legenda, tooltip — 4 canais).

Zero risco, zero mudança visual, ships hoje.

### 3.2 — (c') Mínima — só os 3 tokens que reprovam 3:1 (emprestado, reservado, defasado), valor único nos dois temas

**Resultado: IMPOSSÍVEL fechar a régua do item 3, sob as duas leituras (estrita e relaxada).**

Isolando a busca por token (cada um só contra os pares que ELE toca, para não deixar um problema de um token contaminar a busca de outro — ver `docs/aa-evidencias/medir.mjs`, comentário antes de `construirMinima`):

- **`reservado`** (clarear, mesmo/quase-mesmo matiz) TEM solução: `#722cff` (oklch 0,53 / 0,28 / 288) resolve sozinho contra `em_uso` e os demais — mas exige um deslocamento de matiz, não só luminosidade (a rodada 1 tentou só-luminosidade e foi exatamente aí que o verificador achou a falha: clarear no mesmo matiz empurra `reservado` para perto de `em_uso` em OKLab).
- **`emprestado`** (escurecer) **NÃO tem solução em matiz/croma nenhum** dentro de uma vizinhança razoável (testado H±30°/C±0,1 E, à parte, o mesmo matiz/croma originais variando só L de 0,30 a 0,715 — `null`, nenhum ponto fecha). O conflito é estrutural: escurecer o ciano até 3:1 contra o card claro empurra `emprestado` para perto de `em_estoque` (verde) sob tritanopia — a mesma simulação que colapsa a região azul-verde. O melhor ponto encontrado (`#00a2c7`, contraste 3,00:1) deixa `em_estoque×emprestado` em **5,32** sob tritanopia (hoje: 10,45 — **quase a METADE**, abaixo até do piso mínimo de 6).
- **`defasado`** resolve sozinho (`#6b727e`), mas precisa de um ΔE de 16,34 do hex atual para se separar o suficiente dos outros 6 tons — bem mais que uma "correção mínima de luminosidade": o cinza de-ênfase documentado em `dominio.ts` deixa de ser tão neutro.

Veredito da paleta combinada: **FALHOU**, folga **−2,68** (leitura estrita) / **−1,26** (leitura relaxada, só pisos 6/15) — em ambos os casos dominado pelo mesmo par, `em_estoque×emprestado` sob tritanopia.

**Por que não recomendar:** (c') troca 3 alívios de contraste já bem precedentes (mitigados por 4 canais redundantes) por um alívio de ΔE **pior** que qualquer um dos que resolve (o par cai para menos da metade do valor de hoje), e ainda muda a identidade visual de 2 dos 3 tokens tocados (emprestado ΔE 5,67–5,94; defasado ΔE 16,34–17,50; reservado ΔE 6,05–20,39, conforme a variante). Estritamente pior que (a).

### 3.3 — (c'') A mesma coisa, por tema (só o tema que reprova muda)

| status | tema | hex ATUAL → NOVO | contraste | ΔE do original (normal) |
|---|---|---|---:|---:|
| Emprestado | claro | `#06b6d4` → `#007765` | 5,49:1 ✅ | **21,99** |
| Emprestado | escuro | `#06b6d4` (inalterado) | 7,38:1 ✅ | 0 |
| Defasado | claro | `#9ca3af` → `#8d94a1` | 3,05:1 ✅ | 4,86 |
| Defasado | escuro | `#9ca3af` (inalterado) | 7,06:1 ✅ | 0 |
| Reservado | claro | `#6d28d9` (inalterado) | 7,10:1 ✅ | 0 |
| Reservado | escuro | `#6d28d9` → `#7736f6` | 3,11:1 ✅ | 5,39 |

Veredito: **claro** — folga −0,65 (leitura estrita) / **+0,30 (leitura relaxada — PASSA)**; **escuro** — folga −3,67 nas duas leituras.

O tema claro, sob a leitura relaxada (só os pisos 6 CVD / 15 normal — os MESMOS pisos que a análise de 10/08 já define como "aceitável"), **fecha limpo**: as duas únicas faltas na leitura estrita são margens de 0,65 e 0,13 abaixo do alvo-8 (não do piso-6) — ambas continuam folgadamente acima do piso mínimo. O tema escuro falha por um par que **NÃO é novo**: `emprestado×defasado` no escuro fica nos valores INALTERADOS (`#06b6d4`/`#9ca3af`, porque nenhum dos dois reprova contraste ali) — é o MESMO par, com os MESMOS números (5,63 protan / 11,33 normal), que já falha em (a) hoje. **(c'') não piora nada que (a) já não tenha** — ele só não conserta esse UM par específico, porque consertá-lo não é o que "só o tema que reprova muda" pede.

**Custo de código (item 3 pediu isto explicitamente):**
- `globals.css`: hoje `--grafico-*` só existe em `:root` (linha 306-314), com o comentário `globals.css:372` dizendo explicitamente que o `.dark` NÃO os sobrescreve "de propósito". (c'') reverte essa decisão: precisa de um bloco novo em `.dark` com (pelo menos) `--grafico-reservado` (escuro muda). Se Johnny aceitar o refinamento do parágrafo abaixo, também `--grafico-emprestado`/`--grafico-defasado` no `.dark`.
- `src/lib/relatorios/rotulo-grafico.ts`: `TOKEN_PARA_HEX` é um mapa `string → string` sem tema; `fillRotuloSegmento` decide branco/preto **uma vez**, citando explicitamente "vale igual no claro e no escuro" (linha 1-7) como a razão de ser sem tema. Isto muda: **o vencedor branco/preto de `emprestado` FLIPA entre os temas** (branco no claro a 5,49:1, preto no escuro a 8,65:1) — confirmado por medição, não suposição. `fillRotuloSegmento` precisaria devolver uma classe com variante `dark:` (ex.: `"fill-black dark:fill-white"`) em vez de uma classe só, o que por sua vez pede que `TOKEN_PARA_HEX` carregue os DOIS hex por token (hoje carrega um).
- `src/lib/dominio/cores.test.ts` §4 (`describe('a tinta de grafico atravessa a fronteira CSS -> Vitest'`)): lê só `blocoCss(':root')` (linha 311-312) — precisaria também ler `.dark` e comparar os pares que passam a divergir.
- Os componentes (`barra-acervo.tsx`, `barras-empilhadas.tsx`) que chamam `fillRotuloSegmento(STATUS_CHART_COLOR[s])` **não precisam mudar**, se `fillRotuloSegmento` passar a devolver a classe combinada por si só.

**Refinamento de baixo custo (fora da definição estrita de c'', mas quase grátis uma vez pago o custo acima):** já que a infra por tema passa a existir, também dar ao `defasado` (ou ao `emprestado`) do tema ESCURO um valor levemente diferente — mesmo que o contraste ali já passe — fecharia o único par que sobra (`emprestado×defasado` escuro), sem custo arquitetural adicional (a folga de contraste no escuro é enorme: 7,06:1/7,38:1, sobra espaço de sobra).

### 3.4 — (b') Separação completa dos 9 tokens (âncoras: `em_uso` fixo, os 3 neutros só em luminosidade)

Vizinhos = TODOS os outros 6 vivos (a correção do bug da rodada 1 — antes era só `STATUS_ORDEM`).

| status | hex ATUAL → NOVO | contraste claro/escuro | ΔE do original (normal) |
|---|---|---|---:|
| Em estoque | `#16a34a` → `#536e3d` | 5,73:1 / 3,13:1 | 15,64 |
| Reservado | `#6d28d9` → `#6834ff` | 5,96:1 / 3,01:1 | 6,44 |
| Em uso | `#2a78d6` (âncora, inalterado) | 4,42:1 / 4,06:1 | 0 |
| Emprestado | `#06b6d4` → `#009de5` | 3,02:1 / 5,94:1 | 8,19 |
| Em triagem | `#db2777` → `#a84694` | 5,29:1 / 3,39:1 | 10,67 |
| Em manutenção | `#d97706` → `#ce8500` | 3,01:1 / 5,96:1 | 3,70 |
| Defasado | `#9ca3af` → `#8d94a1` | 3,05:1 / 5,88:1 | 4,86 |

Pior ΔE por visão, sobre os 21 pares restritos: **normal 9,86** (em_uso×emprestado) · **protanopia 9,53** · **deuteranopia 8,00** · **tritanopia 8,62** (os 3 últimos: reservado×em_uso).

Veredito: **FALHOU** por folga −5,14 — mas só na visão NORMAL, e só 2 pares (`em_uso×emprestado` 9,86 e `emprestado×defasado` 13,2, ambos < 15). Nas **3 simulações de daltonismo — o que a régua mais protege — (b') cumpre o ALVO (8), não só o mínimo, em TODOS os 21 pares.** É a única das 3 propostas que consegue isso.

**Custo:** 6 dos 9 tokens mudam de matiz (não só luminosidade) — `em_estoque` vai de verde-vivo para um verde musgo mais escuro (ΔE 15,64, a maior mudança de todas as opções), `em_triagem` de rosa para um roxo-magenta (ΔE 10,67). É a proposta mais cara: reescreve a prosa de `dominio.ts:107-127` (o comentário documenta os hex atuais e a razão de cada um), as ~10 linhas `grafico: true` de `scripts/contraste.mjs:400-417`, `TOKEN_PARA_HEX` inteiro (9 valores), e qualquer captura de tela (`design/capturar.mjs`) que mostre a pilha ou o glossário.

---

## 4. Prévia

`docs/aa-evidencias/previa.html` — as 4 opções, PILHA (ordem real), KPI tiles (ordem/grade real, breakpoint `xl`) e GLOSSÁRIO (ordem/grade real 2 colunas), nos dois temas, em visão normal e sob as 3 simulações de daltonismo (filtro SVG). Autocontido, sem dependência externa.

---

## 5. Recomendação

**(a) MANTER, com os 3 registros de bookkeeping do §3.1** (custo zero, risco zero, nenhuma mudança visual, hoje):

1. Alívio de contraste para `defasado` claro (2,54:1) em `scripts/contraste.mjs` — hoje ausente.
2. Alívio de ΔE para `emprestado×defasado` sob protanopia (5,63 < 6) — precedente idêntico aos 2 alívios já existentes (4 canais redundantes: rótulo, total, legenda, tooltip).
3. Anotar como "perto do piso" (informativo, não bloqueante): `em_estoque×em_manutencao` (protan 6,17) e `em_estoque×em_triagem` (deutan 6,14).

**Por quê, em números:** nenhuma das 3 alternativas bate (a) numa comparação custo×benefício direta.

- **(c') é estritamente pior que (a):** troca 3 alívios bem precedentes por um alívio NOVO e mais profundo (`em_estoque×emprestado` cai de 10,45 para 4,74–5,32 — menos da metade, abaixo até do piso mínimo), e muda a identidade de 2-3 tokens. Não há leitura da régua sob a qual (c') feche.
- **(c'') é a proposta tecnicamente mais interessante** — no tema claro, sob a leitura relaxada dos mesmos pisos que a análise de 10/08 já usa, ela FECHA limpo, e no escuro não piora nada que (a) já não tenha. Mas custa: reverter a decisão documentada "`--grafico-*` é valor único nos dois temas" (`globals.css:372`), tornar `TOKEN_PARA_HEX`/`fillRotuloSegmento` cientes de tema (confirmado: o branco/preto de `emprestado` FLIPA entre claro e escuro), estender a trava de `cores.test.ts` §4 para o `.dark` — e o preço visual é alto: `emprestado` no claro muda por ΔE 21,99 (de ciano vivo para um verde-azulado bem mais escuro), maior mudança de qualquer token em qualquer proposta medida. **Vale como ordem própria, não como parte deste passo** (que é levantamento, não implementação).
- **(b') é a mais protegida sob daltonismo** (cumpre o alvo 8, não só o mínimo, nos 21 pares, nas 3 simulações) mas é a mais cara: 6 de 9 tokens mudam de matiz, reescreve a documentação e os testes que citam hex literal, e é um redesenho sistêmico da língua de cor do relatório — desproporcional ao que a Decisão 4 pediu decidir (separar área de texto), e melhor tratado como fase própria se um dia for adotado.

**Se Johnny quiser investir em consertar de verdade** (não só registrar), a ordem de preferência medida é **(c'') > (b') > (c')** — nessa ordem, por custo crescente e por (c') nunca fechar a régua sob nenhuma leitura.

---

## Pendências / fora do escopo desta ordem

- Os 2 pares "perto do piso" achados nesta rodada (`em_estoque×em_manutencao` protan 6,17; `em_estoque×em_triagem` deutan 6,14) não bloqueiam nada hoje, mas nenhuma das 4 opções medidas os resolve (nenhuma toca `em_manutencao` isoladamente nem afasta `em_triagem` de `em_estoque`) — ficam como "observar", não como ação.
- O refinamento de (c'') mencionado no §3.3 (dar ao `defasado`/`emprestado` do tema escuro um valor levemente diferente, mesmo passando hoje, só para fechar o par que sobra) não foi medido a fundo — é uma direção, não uma proposta pronta.
- `scripts/paleta-graficos.mjs` — a análise de 10/08 §4 já sugeria (não implementou) um script-irmão de `contraste.mjs` para a checagem de ΔE-vizinhos virar portão de CI. Esta rodada reforça o caso: 2 dos 3 achados novos (`emprestado×defasado`, os 2 pares "perto do piso") só apareceram porque alguém rodou a medição manualmente — nenhum teste automatizado os teria pego.
