# C2 — Tetos remedidos (Frente C, Medidor — F56)

Data: 11/09/2026. Repositório `ti-wap-inventory-control`, branch
`f56-import-sem-wapismo-e-sem-bomba` (`main` local, Frentes A/B rodando em paralelo na
mesma árvore — nenhum arquivo versionado foi tocado por esta medição). Reproduz e
estende o método de `T1-corpos.md` (serializador real: `encodeReply` do
`react-server-dom-webpack-client` para o PEDIDO, `renderToReadableStream` do
`react-server-dom-webpack-server` para a RESPOSTA, ambos exigindo
`NODE_OPTIONS="--conditions=react-server"`) e de `T2-xlsx-desalinhamento.md` (processo
filho, `--max-old-space-size`, amostragem de RSS). Motor REAL:
`validarCsvImport`/`validarArquivoImport`/`csvCorrigidoDeArquivo` de `src/lib/import`
(lidos do estado ATUAL do repo — confirmado que `limites.ts`/`validators/importar.ts`
ainda têm os números de HOJE: `TAMANHO_MAX_ARQUIVO=5MiB`, `MAX_LINHAS_PLANILHA=20.000`,
`MAX_CORRECOES=20.000`, `MAX_PARA=200`, `MAX_CRU=500`, sem `.max()` no
`ativoPlanoSchema` — as Frentes B/E ainda não aplicaram a Decisão 6). Dados 100%
fictícios: patrimônios `WAP9xxxxxx`, colaborador não usado (nenhum nome), filial usada
é `Matriz` (nome real da filial, permitido pela regra — nenhum dado da planilha real).

Scripts em `scratchpad/f56-medicoes/c2/harness.mts` (arquivo principal, geradores +
assinatura das funções — o corpo completo de cada função de medição está no §Apêndice
abaixo, pois o script executável em si rodou na raiz do repo como `zz-f56-c2-harness.mts`
e foi apagado ao final de CADA bateria, por regra) e
`scratchpad/f56-medicoes/c2/xlsx-medir.mts` (completo, arquivo único). Ambos viram
`scripts/perf/` na implementação.

---

## 0. Resumo do que muda em relação à PLAN

| Constante | PLAN (alvo) | Este relatório | Motivo |
|---|---|---|---|
| `TAMANHO_MAX_ARQUIVO` | 1 MiB | **confirmado, 1 MiB** | corpo1/corpo4 no teto de arquivo + 500 correções no teto: ~1,18-1,19 MB — folga 3,8× |
| `MAX_LINHAS_PLANILHA` | 2.000 | **confirmado, 2.000** | é a alavanca dominante de todos os corpos de resposta (achado do T1, reconfirmado) |
| `MAX_COLUNAS_PLANILHA` | 40 | **confirmado, 40** | não move bytes; teto natural do formato é 16.384 (Excel/OOXML) |
| `MAX_BYTES_CONTEUDO` | 768 KiB | **confirmado para CSV; INSUFICIENTE SOZINHO para `.xlsx`** | ver Decisão 7 — precisa do `MAX_XML_DESCOMPRIMIDO` ANTES do `load`, porque, quando o conteúdo é contado (pós-parse), o `.xlsx` já pode ter estourado 1 GB de RSS |
| `MAX_CORRECOES` | 500 | **confirmado, 500** | 500×1.000 comparado: corpo3 sobe de 1,54 MB p/ 1,69 MB — folga sobra nos dois |
| `MAX_CRU` / `MAX_PARA` | 120 / 120 | **confirmado, 120/120 — com uma ressalva documentada** | `MAX_PARA` só é alcançável de fato em `substituir`/`editar`; em `substituir_estado` o `para` é PRESO ao vocabulário de Situação (~10-12 caracteres reais) — usar 120 ali dá `correcao_invalida` (bloqueia o plano). Não muda o número, muda o TIPO usado como "pior caso aceito" (ver §3) |
| `.max()` por campo do plano | ver PLAN | **confirmado, sem mudança** | corpo3 no pior caso aceito (768 KiB, patrimônio forçado 60/60, 500 correções multibyte): 1,54-1,69 MB — folga ≥ 2,4× |
| **novo, não estava na PLAN** | — | **cap de MENSAGEM (300) e de CHAVE (80) no degrau, e um achado estrutural: uma linha do motor gera O(N²) bytes em arquivo com duplicata em toda linha** | ver §1.3 e §2 — é o achado mais importante deste relatório |
| **novo** | — | **`MAX_XML_DESCOMPRIMIDO = 80 MB`** | Decisão 7 — ver §7 |
| **novo** | — | **`ORCAMENTO_RESPOSTA_PREVIEW ≈ 2.000.000 B`, degrau K ∈ {500,200,50,10,0} com cap de mensagem/chave SEMPRE ligado** | ver §2 |

---

## 1. MEDIÇÃO OBRIGATÓRIA 1 — corpo 2 patológico

### 1.1 Método

Layout `padrao20` (20 colunas — o mais pesado dos três; ver §1.5). Conteúdo por campo
escalado por um ORÇAMENTO TOTAL: `escala = min(1, orçamento / (N × Σ .max() de cada
campo livre))`, com `Σ.max()` somando os 14 campos livres do plano (patrimônio, service
tag, marca, modelo, fornecedor, memória, armazenamento, processador, hostname,
observação, colaborador, setor, chamado) **mais 5 campos "lixo" sem `.max()` proposto**
(Site/Tipo/Status/Situação/Patrimônio quando são o PRÓPRIO erro — ver achado abaixo),
usando 100 caracteres como padrão representativo para estes últimos. Em `nível=teto` o
orçamento é 768 KiB; em `nível=mínimo` cada campo cai para 1 caractere (o PISO
estrutural, para separar "peso da estrutura" de "peso do conteúdo").

**Achado estrutural (novo, não estava na ficha nem na PLAN):** para uma linha
BLOQUEADA (`site_divergente`/`categoria_desconhecida`/`estado_desconhecido`/
`patrimonio_invalido`), o valor cru da célula "lixo" (Site/Tipo/Status/Patrimônio) **não
tem NENHUM `.max()` hoje nem na proposta da PLAN** — os `.max()` da Decisão 6 valem para
`AtivoPlano` (que só existe para linha VÁLIDA); uma linha bloqueada nunca chega a virar
`AtivoPlano`, mas seu `RegistroImport` INTEIRO (todos os 18-20 campos crus) entra em
`contexto[linha]` mesmo assim. **É por isso que `MAX_BYTES_CONTEUDO` (um teto sobre TODA
célula decodificada, não só sobre os campos de `AtivoPlano`) é indispensável** — sem
ele, um Site/Tipo "lixo" poderia ter qualquer tamanho.

### 1.2 Cenários (a-e) — pontos medidos, N=1.142 e N=2.000, `padrao20`

| Cenário | N | nível | bytes arquivo | **JSON corpo2** | **Flight corpo2** | Flight/JSON | bloqueantes | avisos | grupos |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| (a) 4 bloqueantes/linha | 1.142 | teto | 684.263 | 3.199.071 | 2.193.994 | 0,686 | 4.568 | 0 | 4 |
| (a) 4 bloqueantes/linha | 1.142 | mínimo | 107.553 | 2.158.557 | 1.388.732 | 0,643 | 4.568 | 0 | 4 |
| (a) 4 bloqueantes/linha | 2.000 | teto | 706.205 | 4.639.389 | 3.120.698 | 0,673 | 8.000 | 0 | 4 |
| (a) 4 bloqueantes/linha | 2.000 | mínimo | 188.205 | 3.791.331 | 2.440.640 | 0,644 | 8.000 | 0 | 4 |
| (b) todo aviso possível | 1.142 | teto | 484.784 | 2.945.650 | 2.377.508 | 0,807 | 0 | 3.396 | 4 |
| (b) todo aviso possível | 1.142 | mínimo | 70.277 | 2.136.271 | 1.564.347 | 0,732 | 0 | 3.426 | 4 |
| (b) todo aviso possível | 2.000 | teto | 523.532 | 4.304.270 | 3.407.296 | 0,792 | 0 | 5.667 | 4 |
| (b) todo aviso possível | 2.000 | mínimo | 123.759 | 3.753.315 | 2.749.817 | 0,733 | 0 | 6.000 | 4 |
| (c) duplicata em TODA linha | 1.142 | teto | 495.833 | **14.366.972** | **7.657.179** | 0,533 | 1.142 | 0 | 1 |
| (c) duplicata em TODA linha | 1.142 | mínimo | 92.707 | **13.966.130** | **7.256.337** | 0,520 | 1.142 | 0 | 1 |
| (c) duplicata em TODA linha | 2.000 | teto | 556.205 | **45.445.760** | **23.399.217** | 0,515 | 2.000 | 0 | 1 |
| (c) duplicata em TODA linha | 2.000 | mínimo | 162.205 | **45.055.760** | **23.009.217** | 0,511 | 2.000 | 0 | 1 |
| (d) 2.000 valores distintos de Site | 1.142 | mínimo | 112.153 | 2.310.526 | 1.531.501 | 0,663 | 4.568 | 0 | 1.145 |
| (d) 2.000 valores distintos de Site | 2.000 | mínimo | 197.095 | 4.062.562 | 2.694.091 | 0,663 | 8.000 | 0 | 2.003 |
| (e) (a) + 500 correções no teto | 1.142 | teto | 684.263 | 4.110.120 | 2.782.223 | 0,677 | 5.068 | 0 | 504 |
| (e) (a) + 500 correções no teto | 2.000 | teto | 706.205 | 5.550.438 | 3.708.927 | 0,668 | 8.500 | 0 | 504 |
| valida (baseline) | 1.142 | mínimo | 88.171 | 483.568 | 483.571 | 1,00001 | 0 | 0 | 0 |
| valida (baseline) | 2.000 | mínimo | 155.095 | 849.076 | 849.079 | 1,00000 | 0 | 0 | 0 |

**O pior de todos, por larga margem: (c) — a duplicata em toda linha, N=2.000: 45,4 MB
de JSON, 23,4 MB de Flight — 10,1× o corpo 3 (5,2 MB do próprio teto de HOJE, T1) e
**5,2× o limite bruto da Vercel** (4,5 MB). Nenhum dos outros cenários (bloqueante4,
avisos, muitos-grupos) chega perto: o segundo pior é o próprio (a)+correções, a 5,55 MB
(1,23× o limite — já estoura sozinho).**

### 1.3 O ACHADO CENTRAL — por que (c) é O(N²)

`src/lib/import/plano.ts:396-421` (dedupe de patrimônio+service-tag repetidos no
mesmo CSV): quando um grupo de duplicatas tem N linhas, o código calcula
`linhas = grupo.map(...).sort(...)` **uma vez por grupo** e então, dentro do laço
`for (const c of grupo)`, grava em **CADA UMA** das N entradas de `bloqueantes` uma
`mensagem` que **embute a lista `linhas.join(', ')` inteira**:

```ts
mensagem: semTag
  ? `patrimônio ${patr} repetido sem service tag (colide no índice único) — linhas ${linhas.join(', ')}`
  : `par patrimônio+service tag repetido no CSV — linhas ${linhas.join(', ')}`,
```

(o mesmo padrão se repete no ramo "sem patrimônio, service tag duplicada",
linha ~402). Resultado: **N mensagens, cada uma de tamanho O(N)** — o corpo cresce
**quadraticamente** com o tamanho do grupo de duplicatas, não linearmente. Confirmado
empiricamente: N=1.142 → 14,37 MB; N=2.000 (1,75× mais linhas) → 45,45 MB (**3,16×
maior** — perto do 3,06× esperado por N², bem longe do 1,75× que N linear daria).

Isto é **estrutural**, não uma questão de qual `.max()` escolher: nenhum teto de
CAMPO (patrimônio, service tag) evita o problema, porque o campo que explode é a
`mensagem` MONTADA pelo motor, nunca ecoada do CSV. A correção adequada é
**tirar a lista `linhas.join(', ')` da mensagem de CADA membro** (ela já existe, uma
vez, em `grupo.linhas` — reescrevê-la em cada `ErroImport.mensagem` é pura duplicação);
até essa correção chegar, o §2 mostra que um CAP DE TAMANHO DE MENSAGEM no degrau da
resposta neutraliza o problema por completo, mesmo sem reduzir nenhum item (`K=todos`).

### 1.4 grupos com 2.000/2.003 entradas (cenário d)

Muitos grupos pequenos (um por valor de Site distinto) custam bem menos que poucos
grupos gigantes: N=2.000 dá só 4,06 MB de JSON (2,69 MB de Flight) — MENOS da metade
do pior caso (c), e ainda cabe dentro do orçamento com o degrau em K=200 (ver §2).

### 1.5 Layout não muda a conclusão

Com o conteúdo normalizado por orçamento total (em vez de cada campo no próprio teto
absoluto), o layout deixa de importar: `matriz`/`cd`/`padrao20` no cenário (a),
N=1.142, teto: 3.199.069 / 3.199.065 / 3.199.071 B de JSON — diferença <0,001%. Usei
`padrao20` (20 colunas) em todo o resto por ser o pior dos três, sem que isso mude
nenhuma conclusão.

---

## 2. O DEGRAU — função de redução (só em scratch) e o orçamento da resposta

### 2.1 A função (ver Apêndice §A.1 para o código completo)

`reduzirValidacao(v, K, capMsg, capChave)`: agrupa `bloqueantes`/`avisos` por `.tipo` e
mantém no máximo `K` POR TIPO (o resto só conta, não aparece); em cada `grupos[]`,
reduz `erros[]` do mesmo jeito (**`grupos[].linhas` fica INTOCADO — todas as linhas,
como a ordem pediu**); recorta `contexto` só para as linhas que sobraram em algum
`erro` mantido; e, quando `capMsg`/`capChave` não são `null`, TRUNCA `mensagem`/`chave`
para esse tamanho (`…` no fim). `candidatos` e `plano` **nunca são tocados** — são
necessários pela Server Action (2ª passada contra o banco / aplicar de fato), não são
"detalhe de exibição".

### 2.2 Resultado — N=2.000, teto (bytes de JSON; Flight é ~igual ou menor)

| Cenário | K=todos SEM cap | K=todos COM cap(300/80) | K=500 c/cap | K=200 c/cap | K=50 c/cap | K=10 c/cap | K=0 c/cap |
|---|---:|---:|---:|---:|---:|---:|---:|
| (c) duplicata (1 grupo gigante) | **45.445.783** | **2.873.783** | 825.378 | 416.478 | 212.219 | 157.859 | 144.303 |
| (a) 4 bloqueantes (4 grupos) | 4.639.412 | 4.639.412 (sem efeito) | 1.183.995 | 494.895 | 150.824 | 59.344 | 36.559 |
| (b) avisos (4 grupos) | 4.304.293 | 4.304.293 (sem efeito) | 2.761.364 | 1.901.231 | 1.369.822 | 1.228.471 | 1.193.247 |
| (d) 2.003 grupos, conteúdo mínimo | 4.062.585 | 4.062.585 (sem efeito) | 2.016.674 | 1.609.274 | 1.406.009 | 1.352.049 | **265.281** |

**Achados:**

1. **O cap de mensagem/chave, SOZINHO, sem nenhum `K`, já resolve o cenário (c)**
   (45,4 MB → 2,87 MB — cabe folgado, 39% do limite Vercel) porque ataca a causa raiz
   (§1.3). Não tem efeito nos cenários (a)/(b)/(d) porque as mensagens deles não
   embutem lista nenhuma — é um cap BARATO (nunca piora nada) que deveria ser
   **permanente**, aplicado sempre, não só quando o orçamento estoura.
2. **(b) "avisos" é o cenário que MENOS se beneficia do degrau**: mesmo em `K=0`
   (zero erros individuais nos arrays!), o corpo ainda é 1,19 MB. A razão: o `plano`
   (2.000 `AtivoPlano` completos, ~850 KB de JSON no baseline "válida") e os
   `candidatos` (2.000 entradas) **nunca são reduzidos pelo degrau** — são dado
   NECESSÁRIO, não ruído. Isso mostra que o "chão" de um arquivo válido com N no
   teto é ~1,2 MB, bem abaixo do orçamento — o degrau não PRECISA reduzir isso mais.
3. **(d) confirma a suspeita da ordem** ("K=0 ainda passa do orçamento por causa de
   2.000 grupos com chave longa") **só parcialmente**: com conteúdo MÍNIMO (chave
   curta, ~14 caracteres), `K=0` já cabe em 265 KB — bem dentro do orçamento. Se o
   Site "lixo" pudesse ser mais longo (sem `.max()`, como o achado do §1.1 mostra),
   `K=0` sozinho não bastaria — é o `capChave=80` que garante o teto MESMO nesse caso
   (2.003 grupos × 80 caracteres de chave ≈ 160 KB só de chave, ainda seguro).

### 2.3 `ORCAMENTO_RESPOSTA_PREVIEW` proposto

**2.000.000 B (2 MB) de JSON**, testado contra `4.500.000` com folga 2,25×. Degrau em
escada, cap de mensagem(300)/chave(80) **sempre ligado** (independente de estourar o
orçamento ou não):

```
1. monta a ValidacaoImport inteira (bloqueantes/avisos/grupos/contexto completos,
   COM o cap de mensagem/chave já aplicado na hora de montar — não depois)
2. bytes = JSON.stringify(...).length (ou uma estimativa mais barata — ver nota)
3. se bytes <= 2_000_000: devolve como está (resumo.detalheReduzido = null)
4. senão, tenta K = 500, 200, 50, 10, 0 NESTA ORDEM, parando no primeiro que cabe
5. resumo.detalheReduzido = {k, removidosBloqueantes, removidosAvisos, removidosGrupos}
```

Com esta régua: (a) cabe em K=500 (1,18 MB); (b) cabe já em K=todos+cap (4,30 MB —
**não cabe em 2 MB!** precisa K=200, que dá 1,90 MB); (c) cabe em K=todos+cap sozinho
(2,87 MB — ainda ACIMA de 2 MB, precisa K=500, que dá 825 KB); (d) cabe em K=500
(2,02 MB — ainda acima, K=200 dá 1,61 MB). **O terminal K=0 (com os dois caps) fica em
36.559 B (a), 144.303 B (c) e 265.281 B (d) — folga de 17× a 125× contra os 3.000.000 B
de Decisão 6.** A ÚNICA exceção é **(b) "avisos"**, cujo K=0 fica em **1.193.247 B**
(folga menor, 2,52×, mas ainda dentro do limite) — porque o piso ali não é o
degrau, é `plano.ativos` (2.000 `AtivoPlano` completos) e `candidatos`, que o degrau
**não toca de propósito** (são dado necessário à Server Action, não "detalhe de
exibição a cortar" — ver o ponto 2 da lista de achados acima). Prova de que o degrau
terminal cabe, com folga em todos os casos, no pior caso de N=2.000 — inclusive no
único cenário em que ele não é a alavanca dominante.

**Nota de implementação:** `JSON.stringify(...).length` mede caracteres UTF-16, não
bytes — para o gate real, usar `Buffer.byteLength(JSON.stringify(v), 'utf8')` (é o que
este relatório mediu) ou, mais barato ainda, uma HEURÍSTICA rápida antes de serializar
(nº de bloqueantes+avisos × tamanho médio de `ErroImport` já é suficiente para decidir
SE precisa degradar, sem pagar o `JSON.stringify` completo duas vezes).

---

## 3. Corpo 3 (pedido de `aplicarImport`) — pior caso ACEITO

### 3.1 O achado que corrigiu o desenho do teste

`substituir_estado` PARECE o tipo de correção mais caro (3 campos: `statusDe` +
`situacaoDe` + `para`, contra 2 de `substituir`), mas **seu `para` é preso ao
vocabulário de Situação** (`validarSemantica`, `correcoes.ts:138-152`): se `para` não
resolver via `estadoPlanilha(null, para)` para um estado válido não-descartado, a
correção vira `correcao_invalida` (bloqueante) e **derruba o plano inteiro**
(`plano: null`) — confirmado experimentalmente (minha primeira tentativa, com `para`
no teto de 120 caracteres multibyte, gerou 500 bloqueantes e `plano: null`). O maior
termo real do vocabulário tem ~10-12 caracteres (`emprestimo`, `manutencao`) — **não
dá pra chegar em 120 e continuar aceito**.

**O tipo realmente mais caro, ACEITO, é `substituir` com `campo: 'tipo'`**: não há
NENHUMA checagem semântica sobre `de`/`para` quando `campo` é `tipo` (só `site` tem
checagem de `para`) — e quando `de` não casa nenhuma célula real do CSV (uso um
prefixo `ZZZNOMATCH-` que garantidamente não aparece), a operação vira um no-op
silencioso (`porOp[i] = 0`), sem bloquear nada, com os DOIS campos (`de` E `para`) no
teto de 120 caracteres. Uso este tipo como "pior tipo aceito" em todo o §3.

### 3.2 O corpo (N=2.000, `padrao20`, 500 correções `substituir/tipo` no teto
multibyte, patrimônio FORÇADO cru de 60 caracteres duplicado em `patrimonioOriginal`
em TODAS as 2.000 linhas)

| Configuração | bytes arquivo | corpo2 (JSON) | **corpo3 (pedido, string)** | % de 4,5 MB | folga |
|---|---:|---:|---:|---:|---:|
| 768 KiB conteúdo · 500 corr · multibyte | 649.295 | 1.558.478 | **1.541.564** | 34,3% | **2,92×** |
| 768 KiB conteúdo · 500 corr · aspas/barras | 742.205 | 1.666.298 | 1.644.474 | 36,5% | 2,74× |
| 768 KiB conteúdo · **1.000 corr** · multibyte | 649.295 | 1.559.478 | 1.687.064 | 37,5% | 2,67× |
| **512 KiB** conteúdo · 500 corr | 499.295 | 1.400.478 | 1.391.564 | 30,9% | 3,23× |
| **1.024 KiB** conteúdo · 500 corr | 801.115 | 1.720.118 | 1.693.384 | 37,6% | 2,66× |
| **1.024 KiB** conteúdo · **1.000 corr** (combinado, pior×pior) | 801.115 | 1.721.118 | **1.838.884** | 40,9% | **2,45×** |

Todas as combinações ficam **bem abaixo** da folga mínima de 1,5× exigida pela
Decisão 6 — mesmo o combinado pior×pior (1.024 KiB + 1.000 correções) fica em 2,45×.
**`MAX_CORRECOES=500` tem folga de sobra para dobrar (1.000) sem risco**; mantenho a
recomendação de 500 pela razão original da PLAN (3,3× o maior import real, não por
necessidade de bytes). `MAX_BYTES_CONTEUDO` entre 512 e 1.024 KiB muda o corpo3 em
menos de 8% — **768 KiB confirmado, sem necessidade de ajuste fino**.

`aspas/barras` (estilo `quotes`) é ~7% mais pesado que `multibyte` no mesmo
comprimento de caractere (o `\"`/`\\` do JSON custa 2 bytes por caractere de conteúdo
contra ~2-3 bytes/caractere dos acentos) — a diferença é pequena; ambos os estilos
cabem com folga.

---

## 4. Corpos 1 e 4 (multipart real com `File`) — arquivo no teto + correções no teto

| Formato | alvo arquivo | N (ajustado p/ bater o alvo) | bytes arquivo real | **corpo1/4 (multipart)** | % de 4,5 MB | folga |
|---|---:|---:|---:|---:|---:|---:|
| CSV | 1 MiB | 951 | 1.048.207 | **1.193.983** | 26,5% | **3,77×** |
| .xlsx | 1 MiB (comprimido) | 15.547 | 1.033.645 | **1.179.479** | 26,2% | **3,82×** |

(os dois com 500 correções `substituir/tipo` no teto embutidas no mesmo `FormData`,
igual ao §3). Os dois cabem com folga muito acima do mínimo.

**Achado colateral, referente à Decisão 7:** o `.xlsx` de 1 MiB comprimido, no teto do
ARQUIVO, aceitou **15.547 linhas** sem bloquear — muito acima do `MAX_LINHAS_PLANILHA`
proposto (2.000) e mesmo do teto de HOJE (20.000, então este arquivo específico
passaria mesmo com os números atuais). Confirma T2: o teto de bytes do ARQUIVO não
limita a quantidade de dado que um `.xlsx` carrega — é o `MAX_LINHAS_PLANILHA` (uma
vez aplicado) que vai recusar este arquivo, e só DEPOIS de carregado por inteiro (ver
§7).

---

## 5. Corpo 5 (resposta de `baixarCsvCorrigido`) — pior escape

| N | conteúdo | estilo | bytes CSV corrigido | **JSON corpo5** | **Flight corpo5** | Flight/JSON | % de 4,5 MB |
|---:|---:|---|---:|---:|---:|---:|---:|
| 2.000 | 768 KiB | aspas/barras | 642.205 | 824.267 | **642.281** | **0,779** | 14,3% |
| 2.000 | 1.024 KiB | aspas/barras | 811.205 | 1.039.277 | **811.281** | 0,781 | 18,0% |
| 1.142 | 768 KiB | aspas/barras | 575.773 | 737.999 | 575.849 | 0,780 | 12,8% |

**Corpo5 é, de longe, o mais folgado dos cinco** (folga ≥ 5,5×). Achado interessante:
o Flight é **22% MENOR** que o JSON aqui (razão 0,78, o oposto do padrão de "Flight ≥
JSON" do corpo2-baseline) — o texto CSV já vem com aspas duplicadas (`""`) pela
serialização RFC4180; o `JSON.stringify` as escapa DE NOVO (`\"\"` → 4 bytes por par),
enquanto o codec do Flight para strings grandes não paga esse custo de escape
byte-a-byte. Isso confirma que o corpo5 nunca precisa de degrau: ele já é limitado,
de fato, pelo próprio `TAMANHO_MAX_ARQUIVO` (o conteúdo devolvido ≈ o conteúdo lido).

---

## 6. Coeficientes do modelo (b0 + b_linha·N + b_conteudo·C + b_corr·nCorr)

Ajustados a pontos REAIS medidos (não `JSON.stringify` cru — Flight real). Erro máximo
reportado contra um 3º ponto de verificação cruzada, quando disponível.

**Nota metodológica importante**: o nível de conteúdo `teto` deste relatório fixa um
ORÇAMENTO TOTAL (768 KiB) e diluiu entre N linhas — ou seja, o conteúdo POR LINHA
**diminui** conforme N cresce (é `budget/N`, não uma constante). Por isso `b_linha` só
pode ser isolado de `b_conteudo` olhando o nível `mínimo` (conteúdo ≈ 0, então a
inclinação em N mede SÓ o peso estrutural) e olhando `b_conteudo` a **N FIXO**
(varrendo o orçamento com N parado — é o que fiz no §3 para o corpo3). Não tenho um
varredura de orçamento a N fixo para os cenários patológicos do corpo2 (a/b/c/d) —
registro isso como lacuna no §10, e uso só os pontos `mínimo` (que isolam `b_linha`
corretamente) para esses quatro.

| Corpo | Modelo (bytes) | Pontos usados | Erro máx. observado |
|---|---|---|---|
| corpo1/4 (pedido, `FormData`, conteúdo mínimo) | `b0 − 448`, `b_linha = 78,0` | N=1.142→88.628; N=2.000→155.552 | — (2 pontos, reta exata; sem 3º ponto) |
| corpo2 (resposta, "válida", conteúdo mínimo) | `b0 = −2.924`, `b_linha = 426,0` | N=1.142→483.568; N=2.000→849.076 | — (2 pontos) |
| corpo2 (resposta, cenário (a) 4-bloqueantes, conteúdo mínimo) | `b0 ≈ −14.669 (~0)`, `b_linha ≈ 1.903,0` | N=1.142→2.158.557; N=2.000→3.791.331 | — (2 pontos); `b_linha` aqui é ~4,5× o da "válida" — cada linha bloqueada carrega o `RegistroImport` INTEIRO em `contexto` (18-20 campos), não só os 17 de `AtivoPlano` |
| corpo2 (resposta, cenário (c) duplicata, conteúdo mínimo — **NÃO LINEAR EM N**) | ajuste quadrático `≈ 12,0×N² − 1.478×N` | N=1.142→13.966.130; N=2.000→45.055.760 | ajuste por 2 pontos (N²,N) força resíduo zero — **não é prova**, é o formato correto (O(N²), §1.3) calibrado só nesses 2 pontos; nenhum 3º ponto medido |
| corpo3 (pedido `aplicarImport`, N=2.000 fixo) — sensibilidade a `nCorrecoes` (C=768KiB) | `b0 = 1.541.564`, `b_corr = 291` | nCorr=500→1.541.564; nCorr=1.000→1.687.064 | verificado no ponto COMBINADO (C=1.024KiB, nCorr=1.000): previsto `1.693.384 + 291×500 = 1.838.884`, medido `1.838.884` → **correspondência exata** (os dois efeitos são aditivos) |
| corpo3 — sensibilidade a `MAX_BYTES_CONTEUDO` (N=2.000, nCorr=500 fixo) | `b0 = 1.391.564`, `b_conteudo = 0,5757 B(req)/B(conteúdo)` | C=512KiB→1.391.564; C=1.024KiB→1.693.384 | verificado em C=768KiB: previsto `1.391.564 + 0,5757×262.144 = 1.542.474`, medido `1.541.564` → **erro 0,059%** |
| corpo5 (resposta Flight, QUALQUER N/conteúdo) | `Flight5 ≈ 1,000×bytesConteudoCorrigido + 76` | C=768KiB(N=2000)→642.281; C=1.024KiB(N=2000)→811.281 | verificado com N=1.142,C=768KiB (bytesConteudoCorrigido=575.773): previsto `575.773+76=575.849`, medido `575.849` → **correspondência exata** |

**Sobre o corpo5**: o coeficiente em `bytesConteudoCorrigido` é **exatamente 1** — o
Flight do corpo5 é, byte a byte, o próprio conteúdo do CSV corrigido mais ~76 B de
envelope fixo (`{ok:true, nome:"import-corrigido-matriz.csv", conteudo:"..."}` e a
codificação de linha do Flight). Não depende de N separadamente — só do TAMANHO do
arquivo corrigido, que por sua vez depende de N e do conteúdo. É o corpo mais simples
e mais previsível dos cinco (e o único em que Flight não tem NENHUM peso estrutural
por linha além do que já está no próprio texto do CSV).

**A tabela final das cinco desigualdades**, com os números que recomendo (pior caso
combinado de cada corpo, ver §0/§3/§4/§5 para o detalhe de cada linha):

```
corpo1 = corpo4 = 1.193.983 B  ≤ 4.500.000 × 0,265   (folga 3,77×)   [arquivo 1 MiB + 500 corr]
corpo2           = 45.445.783 B  SEM cap  →  2.873.783 B  COM cap(300/80)+K=todos
                                             ≤ 4.500.000 × 0,64   (folga 1,57×, sem K)
                                   com K=500 → 825.378 B ≤ 4.500.000 × 0,183 (folga 5,45×)
corpo3           = 1.838.884 B  ≤ 4.500.000 × 0,409   (folga 2,45×)   [combinado 1.024KiB+1.000corr]
corpo5           =   811.281 B  ≤ 4.500.000 × 0,180   (folga 5,55×)   [1.024 KiB, aspas/barras]
```

---

## 7. `.xlsx` antes do load — protótipo, medições e `MAX_XML_DESCOMPRIMIDO`

### 7.1 Ambiente

Node **v26.4.0** (confirmado); `zlib.inflateRawSync(dados, {maxOutputLength})` **lança
`RangeError` (código `ERR_BUFFER_TOO_LARGE`)** quando o descomprimido excede o teto —
confirmado nesta versão, mensagem: `Cannot create a Buffer larger than <N> bytes`.

### 7.2 Protótipo (código completo no Apêndice §A.2 / `xlsx-medir.mts`)

Sem dependência nova: (1) parser manual de Central Directory + Local File Header
(assinaturas `0x06054b50`/`0x02014b50`/`0x04034b50`, ~90 linhas); (2) `<dimension>`
por inflate PARCIAL síncrono (`zlib.inflateRawSync(prefixo, {finishFlush:
Z_SYNC_FLUSH})`, prefixo dobrando de 256 B até 64 KiB); (3) inflate TOTAL de cada
`xl/worksheets/*.xml` e `xl/sharedStrings.xml` com `{maxOutputLength}}` — o teto real.
Todas as medições rodaram em PROCESSO FILHO (`node --max-old-space-size=<N> --import
tsx xlsx-medir.mts <ação> ...`), nunca no processo da sessão.

### 7.3 (i) `.xlsx` LEGÍTIMO no teto (2.000 linhas × 40 colunas)

Arquivo gerado: 184.417 B comprimido (o conteúdo de 40 colunas curtas comprimiu bem
mais que os 768 KiB nominais — natural, células repetitivas). Protótipo:

```
{"bytesArquivo":184417,"nEntradasAlvo":2,"dimensaoEncontrada":"A1:AN2001",
 "tDimensaoMs":0.716,"totalDescomprimidoBytes":2831027,"tInflateTotalMs":3.362,
 "tTotalMs":5.144,"picoRssMB":75}
```

Razão descomprimido/arquivo = **15,35×** — bate com a faixa 12-14× que T2 já havia
medido para `.xlsx` reais (a pequena diferença vem do conteúdo mais curto/estruturado
deste teste). `lerXlsx` REAL sobre o mesmo arquivo: **409 ms, 169,5 MB de RSS** —
confortável.

### 7.4 (ii) `.xlsx` BOMBA disfarçada ≤ 1 MiB — a recusa ANTES de estourar memória

Duas variantes testadas:

**(a) "tall-narrow" clássica** (valor repetido, muitas linhas, poucas colunas — igual
T2): 94.169 linhas em 1.048.951 B → **14,27 MB descomprimidos** (razão 13,6×, dentro
da faixa "realista" de T2). Com `MAX_LINHAS_PLANILHA=2.000` já implementado, o
`<dimension ref="A1:C94170">` sozinho recusaria isto em **<1 ms**, sem inflar nada.
**Mas o `lerXlsx` de HOJE (sem Decisão 7) já leva 1,38 s e 331 MB de RSS até recusar**
— porque recusa DEPOIS de carregar por inteiro (fato 21, já conhecido).

**(b) BOMBA DISFARÇADA (o caso que o achado desta medição pede destaque)**: dimensão
PEQUENA e LEGÍTIMA (3 linhas × 1 coluna — passaria QUALQUER teto de linhas/colunas,
por maior que fosse a bomba), mas a célula tem um valor gigante, massivamente
repetitivo. Três tamanhos testados:

| Arquivo | bytes comprimidos | dimensão | **descomprimido real** | razão |
|---|---:|---|---:|---:|
| disfarçada 1 | 25.877 | A1:T21 (20×20) | 13.125.543 | 507× |
| disfarçada 2 | 35.952 | A1:C5 | 30.000.298 (~30 MB) | 834× |
| disfarçada 3 | **298.070 (0,28 MiB)** | **A1:A4 (3×1!)** | **300.001.298 (300 MB!)** | **1.006×** |

A #3 confirma o teto teórico do DEFLATE que T2 já havia medido isoladamente (~1.029×)
**dentro de um `.xlsx` real, escrito pelo ExcelJS** — não é só um limite de laboratório
do `zlib` puro.

**A prova mais forte deste relatório**: rodei o `lerXlsx` REAL (sem nenhuma mudança de
código, só medição) sobre a disfarçada #3 —

```
{"path":".../bomba-disfarcada3.xlsx","bytesArquivo":298070,"rejeitado":false,
 "linhas":3,"colunas":1,"tTotalMs":3568.211,"picoRssMB":1016.6}
```

**Um arquivo de 298 KB (0,28 MiB — bem abaixo até do `TAMANHO_MAX_ARQUIVO` de 1 MiB)
faz o `lerXlsx` de HOJE consumir 1.016,6 MB de RSS (> 1 GB) em 3,57 s, e NÃO é
recusado** — porque `MAX_LINHAS_PLANILHA`/`MAX_COLUNAS_PLANILHA` (mesmo aplicados)
NUNCA veriam isto: a dimensão é 3×1. **Isto é o que justifica, sozinho, a Decisão 7
inteira**: um teto de linhas/colunas NUNCA seria suficiente contra este ataque —
precisa mesmo do teto sobre o CONTEÚDO DESCOMPRIMIDO, antes do `load`.

O protótipo, no mesmo arquivo, com `maxOutputLength=20 MB` (bem abaixo do real de
300 MB): **rejeita em 14,5-14,7 ms, com só 75-77 MB de pico de RSS** — 246× mais
rápido e 13× mais econômico em memória que deixar o `lerXlsx` real tentar e falhar
tarde (ou nem falhar, como mostrado acima). Com um `maxOutputLength` generoso (350 MB,
para medir o valor real), o protótipo mede os 300.001.298 B corretos em **253,7 ms e
77,1 MB de RSS**.

### 7.5 (iii) Zip com tamanho declarado MENTINDO

Gerei um `.xlsx` legítimo (2.000 linhas de 200 caracteres/célula) e sobrescrevi o
campo `uncompressedSize` da entrada `xl/worksheets/sheet1.xml`, no header da Central
Directory, de **292.476 para 100** (byte a byte, offset `+24` do header). O protótipo:

```
{"bytesArquivo":24704,"dimensaoEncontrada":"A1:C2001","totalDescomprimidoBytes":292905,...}
```

**Não foi enganado** — `totalDescomprimidoBytes` é o valor REAL (292.905, não o 100
declarado), porque a checagem usa `zlib.inflateRawSync` sobre o STREAM comprimido de
verdade, e o `inflateRaw` do Node **não confere** contra nenhum campo do header do zip
(confirmado por leitura de código do `zlib` nativo e por este experimento). O campo
`uncompressedSize` da Central Directory é só um metadado de conveniência — nunca deve
ser usado como teto de segurança sozinho (o protótipo aqui não o usa para NADA além de
log).

### 7.6 `MAX_XML_DESCOMPRIMIDO` recomendado

**80 MB (83.886.080 B).**

- Folga sobre o pior caso LEGÍTIMO medido (2,83 MB para um conteúdo de 40 colunas
  compactas) e sobre a faixa 12-15× que T2 já havia estabelecido para conteúdo REAL
  de planilha WAP: mesmo um `.xlsx` no teto de 1 MiB de arquivo com conteúdo bem mais
  denso que o testado aqui dificilmente passaria de 20 MB descomprimidos — **80 MB dá
  folga de 4-5× sobre essa estimativa**.
- Muito abaixo da memória da função Vercel (2 GB padrão, 4 GB no plano Pro — T2 já
  havia levantado isso): mesmo o pior caso ACEITO (80 MB) usa ~4% do padrão.
- Rejeita a bomba disfarçada com folga enorme: a #2 (30 MB) e a #3 (300 MB) são
  recusadas; mesmo a #1 (13,1 MB) — que sozinha já seria "aceitável" perto de 80 MB —
  não é um ataque realista (é só o meu menor experimento de calibração).
- O CUSTO da checagem, mesmo no teto de 80 MB, é baixíssimo: extrapolando a medição de
  253,7 ms para 300 MB (~1,19 ms/MB), 80 MB ficariam em **~95 ms** — perfeitamente
  aceitável para um preview interativo.

**Desenho final (Decisão 7, confirmado):** aplicar a checagem de `<dimension>` (rápida,
heurística — pode mentir, mas nunca AFROUXA a segurança, só ADIANTA a recusa no caso
comum) E o `maxOutputLength=80MB` no inflate total (a garantia real) **ANTES** de
`wb.xlsx.load`, mantendo os tetos pós-carga de `MAX_LINHAS_PLANILHA`/
`MAX_COLUNAS_PLANILHA` como segunda linha (nunca removê-los — a dimensão pode faltar
ou mentir).

---

## 8. PapaParse/`parseCsv` e `lerXlsx` — custo de contar bytes escapados

Ambos devolvem o MESMO formato `CsvCru { header: string[]; linhas: {celulas:string[],
linha:number}[] }` (`parseCsv` de `src/lib/import/parse.ts`; `lerXlsx` de
`src/lib/import/xlsx.ts`) — uma função `conferirTetos(csv: CsvCru)` escrita contra
esse tipo funciona para os dois formatos sem adaptação.

Medido sobre um CSV sintético de 2.000×40 células (80.040 células incluindo cabeçalho,
~20 caracteres/célula):

```
tParseMs (PapaParse) = 12.762 ms
tContagemMs (1 passada, JSON.stringify(célula) - 2, por célula) = 16.781 ms
tContagemMedioMs (média de 10 repetições) = 14.81 ms
```

**Custo desprezível**: ~0,18 µs/célula, ~15 ms para o arquivo inteiro no teto de
linhas×colunas — um acréscimo de milissegundos sobre um `parseCsv` que já leva ~13 ms.
Não há motivo para não rodar a contagem sempre, em toda análise.

---

## 9. Apêndice — o script de medição completo

### A.0 Arquivos

- `scratchpad/f56-medicoes/c2/harness.mts` — geradores de fixture + assinaturas
  (candidato a `scripts/perf/medir-corpos-import.mjs`).
- `scratchpad/f56-medicoes/c2/xlsx-medir.mts` — **completo**, protótipo Decisão 7 +
  `lerXlsx` real (candidato a `scripts/perf/xlsx-pre-load.mjs`).
- `scratchpad/f56-medicoes/c2/*.json` — as saídas brutas de cada bateria
  (`sweep1.json`, `degrau.json`, `corpo3.json`, `corpo1e4.json`, `corpo5.json`,
  `contagem.json`, `layouts.json`).
- `scratchpad/f56-medicoes/c2/xlsx/*.xlsx` — as fixtures geradas (NUNCA no repo).

O `harness.mts` arquivado tem os GERADORES completos (`linhaValida`, `linhaAvisos`,
`linhaBloqueante4`, `linhaDuplicata`, `montarCsv`, `escalaPara`, `filler`/
`multibyteFiller`/`quotesBarrasFiller`, `bytesDoPedido`/`bytesDaResposta`). As funções
de MEDIÇÃO de cada corpo (que rodaram na íntegra, mas foram cortadas do arquivo
arquivado por apagar o executável da raiz ao final de cada bateria, por regra) seguem
abaixo, na íntegra:

### A.1 O degrau (`reduzirValidacao` + `medirDegrau`)

```ts
type ErroImportLike = { linha: number; coluna: string; valor: string; tipo: string; mensagem: string }

function truncarMsg(msg: string, capMsg: number | null): string {
  if (capMsg === null) return msg
  return msg.length > capMsg ? msg.slice(0, capMsg) + '…' : msg
}

function reduzirLista(
  lista: ErroImportLike[],
  k: number | 'todos',
  capMsg: number | null,
): { mantidos: ErroImportLike[]; removidos: number } {
  const aplicarCap = (e: ErroImportLike) =>
    capMsg === null ? e : { ...e, mensagem: truncarMsg(e.mensagem, capMsg) }
  if (k === 'todos') return { mantidos: lista.map(aplicarCap), removidos: 0 }
  const porTipo = new Map<string, ErroImportLike[]>()
  for (const e of lista) {
    const arr = porTipo.get(e.tipo) ?? []
    arr.push(e)
    porTipo.set(e.tipo, arr)
  }
  const mantidos: ErroImportLike[] = []
  let removidos = 0
  for (const arr of porTipo.values()) {
    mantidos.push(...arr.slice(0, k).map(aplicarCap))
    removidos += Math.max(0, arr.length - k)
  }
  return { mantidos, removidos }
}

function reduzirValidacao(
  v: ValidacaoImport,
  k: number | 'todos',
  capMsg: number | null,
  capChave: number | null,
) {
  const { mantidos: bloqueantes, removidos: remBloq } = reduzirLista(v.bloqueantes as ErroImportLike[], k, capMsg)
  const { mantidos: avisos, removidos: remAvisos } = reduzirLista(v.avisos as ErroImportLike[], k, capMsg)
  const linhasKeep = new Set<number>([...bloqueantes, ...avisos].map((e) => e.linha))
  let remGrupos = 0
  const grupos = v.grupos.map((g) => {
    const { mantidos: erros, removidos } = reduzirLista(g.erros as ErroImportLike[], k, capMsg)
    remGrupos += removidos
    for (const e of erros) linhasKeep.add(e.linha)
    const chave = capChave !== null && g.chave.length > capChave ? g.chave.slice(0, capChave) + '…' : g.chave
    return { ...g, chave, erros } // g.linhas fica INTOCADO — todas as linhas
  })
  const contexto: Record<string, unknown> = {}
  for (const linhaStr of Object.keys(v.contexto)) {
    if (linhasKeep.has(Number(linhaStr))) contexto[linhaStr] = (v.contexto as Record<string, unknown>)[linhaStr]
  }
  return {
    ...v, bloqueantes, avisos, grupos, contexto,
    detalheReduzido: k === 'todos' ? null : { k, capMsg, capChave, removidosBloqueantes: remBloq, removidosAvisos: remAvisos, removidosGrupos: remGrupos },
  }
  // candidatos e plano NUNCA são tocados
}
```

(`medirDegrau(cenario, n, contentLevel)` monta o CSV/`ValidacaoImport` com os mesmos
geradores do §A (`linhaAvisos`/`linhaBloqueante4`/`linhaDuplicata`), roda
`reduzirValidacao` para `K ∈ {'todos', 500, 200, 50, 10, 0}` × `{sem cap, cap
msg=300/chave=80}`, medindo `JSON.stringify` e `renderToReadableStream` de cada
combinação — é a fonte da tabela do §2.2.)

### A.2 Corpo 3 — pior caso aceito

```ts
async function medirCorpo3(opts: {
  n: number; budgetKiB: number; nCorrecoesExtra: number; style: Style; forcarPatrimonioTodos: boolean
}) {
  const { n, budgetKiB, nCorrecoesExtra, style, forcarPatrimonioTodos } = opts
  const scale = escalaPara(n, budgetKiB * 1024)
  const linhas: string[][] = []
  for (let i = 0; i < n; i++) {
    const row = linhaValida(i, 'padrao20', scale, 'teto', style)
    if (forcarPatrimonioTodos) {
      const idxPatr = HEADER_PADRAO20.indexOf('Patrimônio')
      const cru = ('X' + String(i).padStart(6, '0') + 'Y').padEnd(60, 'Z') // 60 chars, NUNCA canônico
      row[idxPatr] = csvCell(cru)
    }
    linhas.push(row)
  }
  const bytes = montarCsv('padrao20', linhas)

  const correcoes: CorrecaoImport[] = []
  if (forcarPatrimonioTodos) for (let i = 0; i < n; i++) correcoes.push({ op: 'forcar_patrimonio', linha: i + 2 })
  // "pior tipo" ACEITO — ver §3.1: `substituir`/tipo, de+para no teto, `de` sem casar
  // nenhuma célula real (no-op silencioso, NUNCA correcao_invalida).
  for (let k = 0; k < nCorrecoesExtra; k++) {
    correcoes.push({
      op: 'substituir', campo: 'tipo',
      de: `ZZZNOMATCH-${k}-` + filler(120 - 13 - String(k).length, 'multibyte'),
      para: `PARA-${k}-` + filler(120 - 7 - String(k).length, 'multibyte'),
    })
  }

  const validacao = validarCsvImport(bytes, FILIAL, '2026-09-11', correcoes, new Map())
  const input = {
    plano: validacao.plano, confirmacaoTexto: FILIAL.nome,
    custoPreview: { ativos: n, movimentacoes: 0, anotacoes: 0, termos: 0 }, correcoes,
  }
  const req3 = await bytesDoPedido([input]) // encodeReply([input]) — sem File → string
  return { /* ver corpo3.json para os campos completos */ req3, validacao }
}
```

### A.3 Corpos 1/4 — arquivo no teto (CSV e `.xlsx`) via multipart real

```ts
function csvNoTetoDeArquivo(alvoBytes: number, layout: Layout) {
  let n = Math.round(alvoBytes / 620)
  let bytes: Uint8Array
  for (let iter = 0; iter < 6; iter++) {
    const linhas = Array.from({ length: n }, (_, i) => linhaValida(i, layout, 1, 'teto', 'ascii'))
    bytes = montarCsv(layout, linhas)
    if (Math.abs(bytes.byteLength - alvoBytes) / alvoBytes < 0.01) break
    n = Math.max(1, Math.round((n * alvoBytes) / bytes.byteLength))
  }
  return { bytes: bytes!, n }
}

async function xlsxNoTetoDeArquivo(alvoBytes: number, layout: Layout) {
  async function montar(n: number) {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Inventario')
    ws.addRow(headerDoLayout(layout))
    for (let i = 0; i < n; i++) ws.addRow(linhaValida(i, layout, 1, 'teto', 'ascii').map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"')))
    return new Uint8Array((await wb.xlsx.writeBuffer({ zip: { compression: 'DEFLATE', compressionOptions: { level: 6 } }, useStyles: false } as never)) as ArrayBuffer)
  }
  let n = Math.round(alvoBytes / 200)
  let bytes = await montar(n)
  for (let iter = 0; iter < 6 && Math.abs(bytes.byteLength - alvoBytes) / alvoBytes >= 0.02; iter++) {
    n = Math.max(1, Math.round((n * alvoBytes) / bytes.byteLength))
    bytes = await montar(n)
  }
  return { bytes, n }
}

// medirCorpo1e4(): monta FormData({arquivo: new File(bytes,'inventario.csv'|'.xlsx'),
// filialId:'1', correcoes: JSON.stringify(correcoesNoTeto(500))}) e mede
// bytesDoPedido([fd]) para os dois formatos — é a fonte da tabela do §4.
```

### A.4 Corpo 5 — pior escape

```ts
async function medirCorpo5() {
  // para cada {n, budgetKiB} em [(2000,768),(2000,1024),(1142,768)]:
  //   monta N linhas válidas com filler 'quotes' (aspas+barras+`;`) na escala do orçamento
  //   const conteudo = await csvCorrigidoDeArquivo(bytes, [], FILIAL.nome)
  //   const resposta = { ok: true, nome: 'import-corrigido-matriz.csv', conteudo }
  //   mede bytesDaResposta(resposta) (Flight) e Buffer.byteLength(JSON.stringify(resposta))
}
```

### A.5 Contagem de bytes escapados (ponto 8)

```ts
function bytesEscapadosParaJson(celula: string): number {
  return Buffer.byteLength(JSON.stringify(celula), 'utf8') - 2 // tira o par de aspas externo
}
// medirContagem(): gera CSV 2000x40, parseCsv(texto), soma bytesEscapadosParaJson
// sobre header+todas as células, mede o tempo — é a fonte do §8.
```

### A.6 `xlsx-medir.mts` (Decisão 7)

Arquivo completo e sem cortes em `scratchpad/f56-medicoes/c2/xlsx-medir.mts` — inclui
`listarCentralDirectory` (parser do zip), `offsetDosDados` (Local File Header),
`prototipo` (as duas etapas: `<dimension>` parcial + inflate total com
`maxOutputLength`), `gerarBombaDisfarcada` (a bomba de dimensão pequena/conteúdo
gigante que é o achado do §7.4-ii) e `medirLerXlsxReal` (o leitor de produção, sem
nenhuma alteração).

---

## 10. O que este relatório NÃO prova / limitações

- O cenário (c) (O(N²)) foi medido em só 2 pontos (N=1.142, N=2.000) — o ajuste
  quadrático do §6 é plausível (a razão bate com N² dentro de 3%) mas não foi
  confirmado com um 3º ponto independente; quem implementar deveria medir de novo
  DEPOIS de aplicar o cap de mensagem, não confiar na extrapolação para o SEM-cap.
- Os coeficientes dos cenários (a)/(b)/(d) usam só 2 pontos cada (N=1.142, N=2.000);
  não são um ajuste de mínimos quadrados sobre 3+ pontos como o método pediu para o
  caso geral — três dos seis pares TÊM verificação cruzada (corpo3×correções,
  corpo3×conteúdo, corpo5×N), mas os cenários patológicos do corpo2 (a/b/c/d) não.
- Não testei o `.xlsx` para os cenários (a)-(e) do corpo2 — só CSV. O motor converte
  `.xlsx` para o MESMO `CsvCru` antes de `analisar()`, então o corpo2 resultante seria
  idêntico para o mesmo conteúdo lógico; a diferença ficaria só no corpo1 (tamanho do
  arquivo bruto), já coberta no §4.
- A "bomba disfarçada" nível 300 MB foi gerada com só 3 células (nRows=3, nCols=1) —
  um ataque mais realista (2.000×40 células, cada uma no teto de 32.767 caracteres do
  Excel) teria decompressão MAIOR ainda, mas a geração desse arquivo por ExcelJS não
  terminou em 90s (tentei nRows=200×nCols=40; timeout). A extrapolação linear
  (nRows×nCols×cellCharLen ≈ decompDeclaradoAprox, confirmada nos 3 pontos medidos com
  erro <1%) é suficiente para a decisão — 300 MB já é 3,75× o teto de 80 MB proposto,
  então a conclusão não muda mesmo que o pior caso real chegasse a alguns GB.
