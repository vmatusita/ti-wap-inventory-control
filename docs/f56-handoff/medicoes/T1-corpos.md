# T1-corpos — os cinco corpos do import em bytes (MEDIÇÃO OBRIGATÓRIA 1) e a Decisão 6

Data da medição: 11/09/2026. Repositório `ti-wap-inventory-control`, branch `f56-import-sem-wapismo-e-sem-bomba`.
Escopo: fatos 4, 21, 22, 23, 24 do cabeçalho da F56; MEDIÇÃO OBRIGATÓRIA 1; proposta da Decisão 6.

## 1. Arquivos lidos (arquivo:linha)

- `src/lib/import/limites.ts` — `TAMANHO_MAX_ARQUIVO` (5 MiB, `:18`), `MAX_LINHAS_PLANILHA` (20 000, `:33`), `MAX_COLUNAS_PLANILHA` (40, `:34`), `ErroArquivoImport`, `msgLimiteLinhas`/`msgLimiteColunas`.
- `src/lib/import/parse.ts` — `parseCsv`/`extrairRegistros`, sem teto de linha/coluna (fato 21). `COLS_MATRIZ`/`COLS_CD`/`COLS_PADRAO20` (`:73-79`).
- `src/lib/import/xlsx.ts` — `lerXlsx` carrega o `.xlsx` INTEIRO (`wb.xlsx.load`, `:106`) antes de conferir `MAX_COLUNAS_PLANILHA`/`MAX_LINHAS_PLANILHA` (`:115-121`) — fora do escopo desta tarefa (Decisão 7/medição 2), citado só por completude.
- `src/lib/import/plano.ts` — `AtivoPlano` (`:95-114`, 17 campos), `PlanoImport` (`:117-122`), `analisar()`/`validarCsvImport`/`validarArquivoImport`/`csvCorrigidoDeArquivo`.
- `src/lib/import/tipos.ts` — `ValidacaoImport` (`:193-238`): `bloqueantes`, `avisos`, `grupos`, `contexto`, `correcoes:{aplicadas,porOp}`, `candidatos` (TODAS as linhas válidas, não só as com erro — `:217`), `plano`, `resumo`.
- `src/lib/validators/importar.ts` — `MAX_CORRECOES=20_000` (`:28`, exportado); `MAX_PARA=200` (`:33`), `MAX_CRU=500` (`:34`) — **privados, não exportados**; `correcaoSchema`/`correcoesSchema`; `parseCorrecoesJson`.
- `src/lib/actions/importar.ts` (inteira) — `ativoPlanoSchema` (`:106-131`, **zero `.max()`** — fato 23), `planoImportSchema` (`:133-138`, só `.min(1)` no array), `aplicarSchema` (`:147-154`: `plano`+`confirmacaoTexto`+`custoPreview`+`correcoes`), `rpcRetornoSchema`, `lerArquivoImport` (`:230-245`, guarda de tamanho), `validarImport`/`aplicarImport`/`urlBackup`/`baixarCsvCorrigido`.
- `src/components/admin/importar/importar-wizard.tsx` — `analisarCom` (`:322-334`: `FormData` com `arquivo`+`filialId`+`correcoes`, chama `validarImport(fd)`), `aplicar()` (`:402-427`: chama `aplicarImport({plano, confirmacaoTexto, custoPreview, correcoes})`), `baixarCorrigido()` (mesmo `FormData` de `analisarCom`).
- `next.config.ts` — `serverActions.bodySizeLimit: '8mb'` (`:17-21`), comentário desatualizado (fato 22).
- `src/lib/queries/import-logs.ts` — `custoSubstituir` (`:177-217`, é o que popula `custo` do body 2); comentário `:59` confirma **1.217 ativos no go-live**, Matriz hoje com **1.142** (confirmado por leitura de código, não banco — fora do meu escopo de SQL).
- `supabase/migrations/0131_import_decomposto.sql:157-162` e `0132_guardas_de_escopo.sql:360-365` — **confirmado**: `length(e->>'patrimonio') > 60` → `raise exception` — o teto de patrimônio da RPC é **60**, igual dos dois lados (`0131` e `0132`, mesmo texto — a auxiliar está duplicada nas duas migrations, corpo vigente é o de `0132` por ser a mais recente que a orquestradora chama).

## 2. Fatos 4/21/22/23/24 — confirmados, com um ajuste de precisão

- **Fato 4** (import raro; Matriz maior filial): confirmado por leitura de código (`import-logs.ts:59`, comentário: 1.217 no go-live, hoje 1.142). Não roda SQL nesta tarefa (fora do meu escopo — T1 é sobre corpos, não sobre o estado do banco).
- **Fato 21** (`limites.ts` já existe): confirmado, números batem — `TAMANHO_MAX_ARQUIVO=5*1024*1024=5.242.880 B` (**5 MiB**, não "5.000.000 B decimais" — ponto que o próprio fato 22 do cabeçalho não distingue e que importa para a conta abaixo), `MAX_LINHAS_PLANILHA=20.000`, `MAX_COLUNAS_PLANILHA=40`. O `.xlsx` recusa após carregar o arquivo inteiro (`xlsx.ts:106-121`) — confirmado, fora do escopo desta medição.
- **Fato 22** (o teto real é 4,5 MB, nos dois sentidos): **confirmado e refeito hoje** contra a doc oficial da Vercel (ver §3). Cinco corpos identificados corretamente pela ficha. **Ajuste**: a ficha cita "~580 B/ativo" da F7F para o plano; a MEDIÇÃO 1 (§4) reproduziu **558,5–561,1 B/ativo** para o corpo 2 (resposta de `validarImport`) em perfil realista — bate, com o corpo 2 sendo o `ValidacaoImport` INTEIRO (não só o plano: inclui `candidatos`, que tem uma entrada por linha VÁLIDA, não só as com erro).
- **Fato 23** (`planoImportSchema` sem `.max()`; RPC em 60): **confirmado por leitura E por grep nas duas migrations** — `ativoPlanoSchema` (`actions/importar.ts:106-131`) não tem um `.max()` sequer nos 18 campos de texto; `planoImportSchema.ativos` só tem `.min(1)`. A RPC (`0131:157-162` e `0132:360-365`, texto idêntico) recusa patrimônio > 60 caracteres — **confirmado, é a fonte da Decisão 6 para o campo patrimônio**.
- **Fato 24** (413 não deixa backup): confirmado por leitura — o backup sobe em `aplicarImport:473-515`, DEPOIS do `aplicarSchema.safeParse` (`:397-401`); um 413 da plataforma nunca chega ao corpo da função (é a borda do Vercel/Next, antes do runtime do Node rodar). Sem alteração ao fato.

## 3. Doc oficial (regra 6) — refeita hoje, com o texto exato

**Next 16 — `serverActions.bodySizeLimit`** (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md:27-45`):
> "By default, the maximum size of the request body sent to a Server Action is 1MB... The limit applies to the raw HTTP request body, including the bytes that `multipart/form-data` adds for boundaries, part headers, and field metadata. If you expect uploads close to the configured value, leave some room for this overhead. For typical multipart uploads, an additional 10–20 KB is a reasonable rule of thumb."

**Achado importante, não estava na ficha**: `bodySizeLimit` só existe para o **PEDIDO**. Não há NENHUM controle do Next para o tamanho da **RESPOSTA** de uma Server Action — a doc do guia confirma: *"Action returns are serialized to the client. Shape them to what the UI renders, not raw database records"* (`server-actions.md:91`). Ou seja: o corpo 2 (resposta de `validarImport`) e o corpo 5 (resposta de `baixarCsvCorrigido`) **não têm backstop nenhum do Next** — só o limite bruto da Vercel (4,5 MB) e a disciplina de que os DADOS que devolvemos sejam pequenos. Isso eleva a importância dos `.max()` de campo e do teto de linhas: eles são a ÚNICA defesa dos corpos de resposta.

**React 19 — valores serializáveis em Server Functions** (Context7 `/react/react/v19.2.7`, `packages/react-server/src/ReactFlightServer.js`): só objetos PLAIN (`Object.prototype` ou `null`), funções só se forem Server/Client References (`'use server'`/`'use client'`), símbolos só globais (`Symbol.for`) — confere com o que o `encodeReply` real fez nas medições (FormData/Map/Set/Blob viram referências especiais `$K`/`$Q`/`$W`/`$B`; classe personalizada teria lançado erro).

**Vercel — *Vercel Functions Limits*** (`https://vercel.com/docs/functions/limitations`, refetchada hoje, `last_updated: 2026-08-24` — **bate com o fato 22 do cabeçalho**):
> "The maximum payload size for the request body or the response body of a Vercel Function is **4.5 MB**. If a Vercel Function receives a payload in excess of the limit it will return an error 413: `FUNCTION_PAYLOAD_TOO_LARGE`."

A doc **não diz** se é decimal (4.500.000 B) ou MiB (4.718.592 B). Toda a conta abaixo usa **4.500.000 B (decimal)** — a leitura mais conservadora (menor número), coerente com a régua "não afrouxe trava".

## 4. MEDIÇÃO OBRIGATÓRIA 1 — os cinco corpos, em bytes, com o serializador real

### 4.1 O serializador usado (não é `JSON.stringify`)

- **Pedido** (argumento de Server Action): `encodeReply` de `node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.node.production.js`. Devolve uma `string` (quando o argumento não tem `File`/`Blob`/`Map`/`Set`) ou uma `FormData` real (quando tem) — confirmado experimentalmente: `validarImport(fd)`/`aplicarImport({...})` são chamados com **um** argumento; como `fd` já é `FormData`, `encodeReply([fd])` **sempre** devolve `FormData`, com os campos originais renomeados sob um prefixo (`_1_arquivo`, `_1_filialId`, `_1_correcoes`) e a linha raiz do Flight (`"0": '["$K1"]'`) referenciando-a. `aplicarImport({plano,...})` não tem `File`/`Blob` → `encodeReply` devolve uma **string** (uma linha Flight: `0:{...}`).
- **Resposta** (retorno de Server Action): `renderToReadableStream(model, webpackMap, options)` de `.../react-server-dom-webpack-server.node.production.js`, com `webpackMap={}` (o modelo não tem nenhuma Client Reference — é dado puro).
- **Bytes reais do pedido**: os dois módulos exigem a condição Node `react-server` (`NODE_OPTIONS="--conditions=react-server"`) — sem ela, `require()` do módulo servidor lança `Error: The "react-server" package condition...`. Quando a codificação devolve `FormData`, os bytes REAIS (com boundary) vêm de `new Request(url, {method:'POST', body: formData}).arrayBuffer()` — o `undici` do Node monta o multipart exatamente como o `fetch()` do navegador faria (boundary aleatório, `Content-Type: multipart/form-data; boundary=...`, confirmado no cabeçalho da `Request`).
- **Sem aproximação**: os cinco corpos foram medidos com o motor REAL (`validarCsvImport`/`csvCorrigidoDeArquivo` de `@/lib/import`) rodando sobre CSVs fictícios gerados para a tarefa — nunca `JSON.stringify` cru.
- Script: `zz-f56-medicao-corpos.ts` (+ `-v2.ts`, `-final.ts`, `-n5000-medio.ts`) na raiz do repo durante a medição, **apagados ao final** (só os JSON brutos ficaram em `scratchpad/f56-medicoes/*.json`, fora do repo).

### 4.2 Dados fictícios

Patrimônios `WAP9000001`…`WAP9020000` (prefixo `WAP9`, nunca colide com faixa real), colaboradores `"Fulano N / TI"`, filial `Matriz` (a real, mas sem nenhum dado da WAP além do nome da filial em si — permitido pela regra). Texto de pior caso: bloco `loremáàâãéêíóôõúçÀÉÍÓÚÇ€lorem` repetido (mistura ASCII, `á/ã/ç`… 2 B em UTF-8, `€` 3 B) com **um caractere de controle** (``) embutido no meio de cada campo longo — no JSON isso vira `` (6 bytes ASCII), reproduzindo a inflação que o fato 22 pede para medir.

### 4.3 Com os limites ATUAIS (`limites.ts`/`validators/importar.ts` de hoje) — prova de que já estoura

Perfil **realista** (sem correções) — bate com o "~580 B/ativo" da F7F:

| N (matriz) | corpo1 req validar | corpo2 resp validar | corpo3 req aplicar | corpo4 req baixar | corpo5 resp baixar | B/ativo (corpo2) |
|---|---|---|---|---|---|---|
| 1.000 | 233.888 B | 558.534 B | 493.332 B | 233.888 B | 233.490 B | 558,5 |
| **1.142 (Matriz)** | 267.152 B | 638.071 B | 563.497 B | 267.152 B | 266.754 B | 558,7 |
| 5.000 | 1.171.167 B | 2.799.242 B | 2.470.040 B | 1.171.167 B | 1.170.770 B | 559,8 |
| 20.000 | 4.695.990 B | 11.221.927 B | 9.892.722 B | 4.695.990 B | 4.695.592 B | 561,1 |

Perfil **pior caso** (cada campo de texto no maior `.max()` que eu proponho mais abaixo — ver §5 —, com `correcoes = min(N, MAX_CORRECOES atual=20.000)` no pior tipo, `substituir_estado` com `statusDe`/`situacaoDe` de 500 e `para` de 200):

| N | corpo1 req validar | corpo2 resp validar | corpo3 req aplicar | corpo4 req baixar | corpo5 resp baixar |
|---|---|---|---|---|---|
| 1.000 | **4.025.345 B (3,84 MB)** | 2.363.103 B | **4.339.793 B (4,14 MB)** | 4.025.345 B | 1.925.953 B |
| **1.142 (Matriz)** | **4.596.688 B (4,38 MB — 97,7% do teto!)** | 2.698.423 B | **4.955.847 B (4,73 MB — JÁ ACIMA DO TETO)** | 4.596.688 B | 2.199.238 B |
| 5.000 | 20.119.627 B (19,2 MB) | 11.808.814 B | 21.693.504 B (20,7 MB) | 20.119.627 B | 9.624.235 B |
| 20.000 | 80.463.198 B (76,7 MB) | 47.220.246 B | 86.759.934 B (82,7 MB) | 80.463.198 B | 38.482.806 B |

**Achado central (fato reproduzido hoje)**: com os limites de campo de hoje (inexistentes — `.max()` ausente) mais `MAX_CORRECOES=20.000`/`MAX_CRU=500`/`MAX_PARA=200`, o corpo 3 (`aplicarImport`) **já estoura o limite da Vercel na Matriz de HOJE (1.142 linhas)** — nem precisa chegar em `MAX_LINHAS_PLANILHA`. Isso é mais grave do que o fato 22 do cabeçalho registrou (ele mede só o arquivo/plano; a MEDIÇÃO 1 mostra que **o vetor mais perigoso é `correcoes`, não o arquivo**: 1.142 correções de 500+500+200 caracteres somam **2,4 MB sozinhas**).

### 4.4 Achado 2 (não estava na intuição inicial): o corpo de RESPOSTA piora com MAIS linhas de conteúdo MODERADO, não com MENOS linhas de conteúdo MÁXIMO

Testei duas hipóteses de "pior caso" para os corpos 2/3 dada uma cota de bytes de arquivo fixa:
(a) poucas linhas com todo campo no teto individual;
(b) `MAX_LINHAS_PLANILHA` linhas com conteúdo moderado (o que sobra da cota de arquivo dividida por mais linhas).

Ajustando um modelo linear `bytes ≈ N×b + a×bytes_do_arquivo` aos dois pontos medidos (N=1.142 com campos no teto vs. N=5.000 com conteúdo moderado, ambos calibrados para caber num mesmo orçamento de arquivo), obtive `a≈1,03` (corpo 3) / `a≈1,07` (corpo 2) — a expansão JSON do CONTEÚDO é quase 1:1 — e **`b≈269 B/linha` (corpo 3) / `b≈327 B/linha` (corpo 2)** — o "peso morto" da estrutura JSON por ativo (as ~17 chaves de `AtivoPlano` + pontuação +, no corpo 2, a entrada correspondente em `candidatos`). Como `bytes_do_arquivo` está limitado por `TAMANHO_MAX_ARQUIVO` (constante), **o termo `N×b` domina e cresce com N** — ou seja, **MAIS LINHAS é sempre pior que MENOS LINHAS COM CAMPOS MAIORES**, para a mesma cota de arquivo. Confirmei isso na prática: com `MAX_LINHAS_PLANILHA_V2=5.000` e um arquivo de 1,79 MB (conteúdo moderado, não máximo), o corpo 2 chegou a **3,64 MB (80,9% do teto Vercel!)** e o corpo 3 a **3,96 MB (87,9%!)** — MUITO mais perto do limite do que os 2,70 MB (60,6%) que o teste "poucas linhas, campos no teto" (N=1.142) tinha sugerido. **Isto muda a Decisão 6**: o teto de LINHAS (`MAX_LINHAS_PLANILHA`) é a alavanca MAIS forte sobre o pior caso dos corpos de resposta — mais forte que os `.max()` de campo individuais.

### 4.5 Proposta final calibrada e MEDIDA (não extrapolada)

Com os números revisados abaixo (§5), rodei o pior caso de verdade em **N = 2.000 = `MAX_LINHAS_PLANILHA` proposto**, arquivo calibrado para ficar perto de `TAMANHO_MAX_ARQUIVO` proposto (0,975 MiB de 1 MiB), `correcoes = 1.000 = MAX_CORRECOES` proposto, pior tipo (`substituir_estado`, `statusDe`/`situacaoDe`/`para` no teto revisado de 120/120/120):

| Corpo | Bytes | MiB | % do limite Vercel (4.500.000 B) | Folga |
|---|---|---|---|---|
| 1 — pedido `validarImport` | 1.701.681 | 1,623 | 37,8% | **2,64×** |
| 2 — resposta `validarImport` | 1.774.105 | 1,692 | 39,4% | **2,54×** |
| 3 — pedido `aplicarImport` | **2.301.009** | **2,194** | **51,1%** | **1,96×** |
| 4 — pedido `baixarCsvCorrigido` | 1.701.681 (= corpo 1) | 1,623 | 37,8% | 2,64× |
| 5 — resposta `baixarCsvCorrigido` | 1.022.310 | 0,975 | 22,7% | 4,40× |

Todos os cinco corpos cabem com folga real, e o modelo linear do §4.4 previu esses números com erro < 1,5% (verificação cruzada). O corpo 3 é o mais apertado (51,1%), como esperado — é o único que soma arquivo/plano E correções no mesmo pedido.

### 4.6 Comparação de layout (arquivo bruto; os outros 4 corpos independem de layout — `AtivoPlano` é o mesmo)

N=1.142: `matriz`=266.678 B / `cd`=252.942 B (−5,2%) / `padrao20`=284.961 B (+6,9%). N=20.000: mesma proporção. O layout não muda a conclusão — usei `matriz` (meio-termo) no sweep principal.

## 5. Decisão 6 — proposta final (a conta, como desigualdades)

**Regra**: `corpo_i ≤ 4.500.000 B` para os 5 `i`, com folga — usei alvo ≥ 1,9× (corpo mais apertado) já validado por medição real (§4.5), não estimado.

### Limite de corpo efetivo
`limite_efetivo = min(bodySizeLimit_do_nextconfig, 4.500.000)`. Hoje `bodySizeLimit='8mb'` (8.388.608 B se o Next interpretar `'8mb'` como MiB, ou 8.000.000 se decimal — a doc não distingue, mas de qualquer forma **8 MB > 4,5 MB nos dois casos**) → **o limite efetivo hoje É o da Vercel, 4.500.000 B**, nunca o do Next. Isso só muda se alguém baixar `bodySizeLimit` abaixo de 4,5 MB (não recomendo: criaria DOIS pontos de recusa com mensagens diferentes — 413 do Next vs. 413 da Vercel — sem ganho, já que a Vercel corta primeiro/igual).

### Números propostos (e por quê)

| Constante | Hoje | Proposto | Motivo |
|---|---|---|---|
| `TAMANHO_MAX_ARQUIVO` | 5 MiB (5.242.880 B) — **já > 4,5 MB sozinho** | **1 MiB = 1.048.576 B** | ~3,9× acima do arquivo real da Matriz hoje (266.678 B no perfil realista); domina o termo `a×arquivo` dos corpos 2/3/5 — baixar ele é a alavanca nº 2 (depois do teto de linhas). |
| `MAX_LINHAS_PLANILHA` | 20.000 | **2.000** | 1,75× acima da Matriz (1.142) — "acima, com a folga escrita" (fato 4). É a alavanca **nº 1**: o achado do §4.4 mostra que o peso fixo por linha (`b≈269-327 B`) domina o pior caso dos corpos de RESPOSTA, que não têm nenhum backstop do Next (§3). |
| `MAX_COLUNAS_PLANILHA` | 40 | **40 (inalterado)** | Não é motor de bytes — o maior layout real (`padrao20`) tem 20 colunas; 40 já é 2× folga e colunas extras não inflam o corpo (só o cabeçalho, 1 linha). |
| `MAX_CORRECOES` | 20.000 (sem relação com nº de linhas) | **1.000** | Maior contribuinte isolado no cenário de hoje (2,4 MB em 1.142 ops no teto antigo). F7D já registrou que uma correção em massa (`substituir`/`substituir_estado`) resolve MUITAS linhas com UMA op — 1.000 é folga generosa sobre qualquer sessão real (dezenas a poucas centenas) e ainda cabe com margem no orçamento de bytes. |
| `MAX_CRU` (`de`/`statusDe`/`situacaoDe`) | 500 (privado, `validators/importar.ts:34`) | **120** | É valor CRU de célula (Site/Tipo/Status/Situação) — na prática nomes de unidade, categoria ou situação com erro de digitação; 120 já é uma frase inteira. Maior contribuinte de bytes por operação (junto com PARA). |
| `MAX_PARA` | 200 (privado, `:33`) | **120** | É o valor corrigido — nome de colaborador, termo de vocabulário, data; 120 cobre o colaborador mais comprido já visto no design (fato: nenhuma medição de nome real, decisão por analogia com `MAX_PARA` de correções em outras telas). |
| **Novos `.max()` de `ativoPlanoSchema`** (fato 23 — hoje zero) | — | `patrimonio`/`patrimonioOriginal`: **60** (= RPC, `0131:161`/`0132:364`); `serviceTag`: 40; `marca`: 60; `modelo`: 100; `fornecedor`: 60; `memoria`: 30; `armazenamento`: 40; `processador`: 80; `hostname`: 60; `observacoes`: 300; `colaborador`: 80; `setor`: 60; `chamado`: 20; `dataEntrada`/`dataAjuste`: 10 (formato fixo `yyyy-MM-dd`); `categoria`/`estadoAlvo`: 20 (defensivo — vocabulário fixo, nunca chega perto) | Sem eles, um único campo longo (ex.: um `Observação` de 50.000 caracteres colado por engano) não é recusado hoje — o motor aceita, o preview mostra, e só a RPC (que nem confere tamanho de `observacoes`) ou o corpo estourado da Vercel apareceriam depois. `recusar, nunca truncar` (a doutrina da dívida T) exige que a CÉLULA seja recusada no preview. |
| `ativos.max()` no array | — (só `.min(1)`) | **`MAX_LINHAS_PLANILHA` (2.000)** | 1 linha de CSV → no máximo 1 `AtivoPlano`; o array nunca pode ser maior que o teto de linhas — reforça, não duplica, a checagem do leitor. |

### A desigualdade, com os números medidos (não estimados)

Para os 3 pedidos (corpos 1/3/4) e as 2 respostas (corpos 2/5), com `N = MAX_LINHAS_PLANILHA = 2.000`, arquivo no teto `TAMANHO_MAX_ARQUIVO = 1.048.576 B`, `correcoes = MAX_CORRECOES = 1.000` no pior tipo:

```
corpo1 = corpo4 = 1.701.681 B  ≤ 4.500.000 × 0,38   (folga 2,64×)
corpo2           = 1.774.105 B  ≤ 4.500.000 × 0,39   (folga 2,54×)
corpo3           = 2.301.009 B  ≤ 4.500.000 × 0,51   (folga 1,96×)  ← o mais apertado
corpo5           = 1.022.310 B  ≤ 4.500.000 × 0,23   (folga 4,40×)
```

Todos ≤ 4.500.000 com folga ≥ 1,9×. **`limites.test.ts` deve reproduzir exatamente este cenário** (gerar o CSV/`correcoes` no pior caso destes números, rodar o motor real e o `encodeReply`/`renderToReadableStream` reais — não `JSON.stringify` — e comparar contra `4_500_000`), para que qualquer mudança futura num `.max()` sem refazer a conta quebre o teste (critério 11).

### Se a Matriz crescer (margem para o futuro)

Com `MAX_LINHAS_PLANILHA=2.000`, há espaço para a Matriz crescer ~75% antes de chegar no teto (hoje 1.142). Se o time preferir mais folga de linhas (ex.: 3.000), o modelo do §4.4 (`corpo3 ≈ 269×N + 1,03×arquivo_max + correções`) mostra o troco: em N=3.000 mantendo os outros números, o corpo 3 sobe para ≈ 269×3.000 + 1,03×1.048.576 + 679.000 ≈ **2.567.000 B (57%, folga 1,75×)** — ainda cabe, mas com menos margem. **Quem se move para dar mais folga de linhas é `MAX_CORRECOES` ou `TAMANHO_MAX_ARQUIVO`**, nunca a Matriz para baixo.

## 6. `next.config.ts` ler de `limites.ts`, ou o teste ler `next.config.ts`?

**Doc oficial conferida hoje** (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/02-typescript.md:164`):
> "Module resolution in `next.config.ts` is currently limited to CommonJS."

Isso significa: `next.config.ts` roda FORA do grafo de módulos ESM normal do app (o mesmo que resolve `@/*` via `tsconfig.paths` para o Vitest/Next runtime) — importar `src/lib/import/limites.ts` de dentro de `next.config.ts` dependeria da resolução CJS pegar um módulo TS simples (sem problema hoje, `limites.ts` não tem import nenhum), mas é um acoplamento FRÁGIL: se alguém um dia adicionar um import a `limites.ts` que não seja CJS-seguro, o `next.config.ts` quebra na hora de CARREGAR A CONFIGURAÇÃO (antes de `dev`/`build` rodar qualquer coisa) — o pior lugar possível para uma falha confusa.

**Opção A** — `next.config.ts` importa de `limites.ts`: custo = acoplamento frágil (config-time, CJS-limited) + resolução por caminho RELATIVO (não pelo alias `@/`, que a doc não garante funcionar em CJS) + qualquer novo import em `limites.ts` vira risco de quebrar o `next dev`/`next build` inteiro.

**Opção B** (recomendada) — `next.config.ts` mantém um número literal (comentado, citando `limites.ts`), e um teste (`limites.test.ts`) faz `import('../../../next.config.ts')` (dinâmico, dentro do Vitest — que resolve TS/ESM normalmente, sem a limitação do loader de config do Next) e compara o `bodySizeLimit` ali contra o mínimo exigido pelos números de `limites.ts`. Custo = dois lugares com o número (mitigado pelo teste, no MESMO padrão das guardas TS↔SQL que já existem na casa — `tipos-item-sql.test.ts`, `chave-sql.test.ts`); ZERO risco de quebrar o carregamento da config.

**Proposta**: Opção B. É o padrão que a casa já usa (teste como guarda, nunca acoplamento em runtime crítico) e evita a área nomeada como "limitada" pela própria doc do Next.

## 7. Armadilhas encontradas

1. **`react-server-dom-webpack` exige a condição Node `react-server`** — sem `NODE_OPTIONS="--conditions=react-server"`, o módulo servidor lança `Error: The "react" package in this environment is not configured correctly`. Fácil de perder; sem ela, quem tentar medir cai de volta no `JSON.stringify` (que SUBESTIMA o corpo real, porque não reproduz a codificação de linha do Flight nem o `FormData` real do `encodeReply`).
2. **`next.config.ts:9-16` está com o comentário ERRADO** (fato 22 já apontava): diz "abaixo do `bodySizeLimit` de 8 MB" mas o limite que vale em produção é o da Vercel (4,5 MB), e mesmo o arquivo de 5 MB (`TAMANHO_MAX_ARQUIVO` de hoje) já passa dele SOZINHO, sem correções.
3. **O corpo de RESPOSTA não tem backstop do Next** (só descobri lendo a doc com atenção — `server-actions.md:91`) — isso eleva MUITO a importância dos `.max()` de campo/linha, porque não há uma segunda linha de defesa por config.
4. **A intuição "poucas linhas com campos gigantes = pior caso" estava ERRADA** (§4.4) — o peso fixo por linha da codificação JSON/Flight (~270-330 B, independente do conteúdo) faz "muitas linhas com conteúdo moderado" ser pior, para a mesma cota de bytes de arquivo. Isso significa que abaixar só os `.max()` de campo (sem abaixar `MAX_LINHAS_PLANILHA`) NÃO resolve — é preciso abaixar as DUAS coisas juntas, e o teto de linhas pesa mais.
5. **`correcoes` é o vetor mais caro por unidade** — 1 operação `substituir_estado` no teto antigo (500+500+200) custava ~2.099 B; no teto novo (120+120+120) custa ~679 B. Isso é 3-4× mais caro POR ITEM do que uma linha de `AtivoPlano` inteira (269-327 B) — por isso `MAX_CORRECOES` foi cortado 20× (de 20.000 para 1.000), a maior redução proporcional de todas.
6. **Vitest/tsx resolvem `@/*` normalmente**; `next.config.ts` (CJS-limited) não tem essa garantia — ponto que só a leitura da doc revelou (não é intuitivo, já que os dois "parecem" TypeScript igual).
7. **O `slice(0, MAX_CORRECOES)` na hora de misturar dois tipos de correção pode DESCARTAR silenciosamente o tipo mais caro** — cometi esse erro numa medição intermediária (concatenar `forcar_patrimonio` na frente de `substituir_estado` e cortar no teto elimina os `substituir_estado` quando `forcar_patrimonio.length ≥ teto`). Fica registrado porque é o tipo de bug que um `Math.min`/`.slice` ingênuo introduziria também no CÓDIGO de produção se alguém tentar "juntar tipos de correção" — a ordem de concatenação importa.

## 8. O que este relatório NÃO prova

- Não mede o `.xlsx` (Decisão 7/medição 2 — fora do escopo T1-corpos; fato 25 citado só de passagem).
- Não roda contra o banco (produção/ensaio) — T1 é só sobre bytes de transporte HTTP, não sobre estado de dado.
- Não testa layout `cd`/`padrao20` no sweep completo (só comparação pontual de tamanho de arquivo em 2 valores de N — a diferença é pequena e não muda a conclusão).
- A "verificação cruzada" do modelo linear (§4.4) usa 2 pontos de dados reais + 1 ponto de confirmação (N=2.000) — não é uma prova formal de que N×b+a×arquivo é EXATAMENTE o modelo certo para todo N; é uma boa aproximação linear confirmada empiricamente com erro <1,5%, suficiente para calibrar a Decisão 6, mas `limites.test.ts` deveria medir o ponto EXATO da configuração final escolhida (não confiar no modelo para o número que vai para produção).
- Os `.max()` de campo individuais (marca/modelo/…) são PROPOSTA MINHA, não uma medição de dado real de produção (nenhum dado real foi usado ou lido, por regra) — o implementador deve confirmar que nenhuma correção real conhecida (indiretamente, por relato do Johnny) excede esses tetos antes de travar.
