# T2 — xlsx (bomba de descompressão) e desalinhamento de colunas

Frente C do F56. Fatos 21, 25, 26 do cabeçalho da ordem. Medidor/explorador — nenhum
código de produção foi alterado. Todos os scripts de medição rodaram como arquivos
`zz-f56-*` na raiz do repo (apagados ao final) ou em
`scratchpad/f56-medicoes/{xlsx,desalinhamento}/`; nenhum arquivo `.xlsx`/`.csv`
gerado entrou no repositório. Nenhum dado real em nenhum teste.

Ambiente: Windows, Node **v26.4.0**, `tsx@4.23.13` (via `--import tsx`),
`exceljs@4.4.0`, `pizzip@3.2.0`, `papaparse@5.7.0` (todas de `node_modules`,
conferidas com `grep version`).

---

## 1. Releitura dos fatos 21, 25, 26 — confirmados, sem divergência

### Fato 21 — `limites.ts` já existe, xlsx recusa só depois de carregar tudo

Confirmado byte a byte contra `src/lib/import/limites.ts`:
- `TAMANHO_MAX_ARQUIVO = 5 * 1024 * 1024` (linha 18)
- `MAX_LINHAS_PLANILHA = 20_000` (linha 33), `MAX_COLUNAS_PLANILHA = 40` (linha 34)
- `ErroArquivoImport` (linha 43) e `msgLimiteLinhas`/`msgLimiteColunas` (linhas 56/65)

`src/lib/import/xlsx.ts:100-121` (`lerXlsx`):
```ts
await wb.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof wb.xlsx.load>[0])  // :106 — CARGA INTEIRA
const ws = wb.worksheets[0]
...
const colunas = Math.max(ws.getRow(1).cellCount, 1)
if (colunas > MAX_COLUNAS_PLANILHA) throw new ErroArquivoImport(msgLimiteColunas(colunas))  // :116 — só DEPOIS
const linhasDeDados = Math.max(ws.rowCount - 1, 0)
if (linhasDeDados > MAX_LINHAS_PLANILHA) throw new ErroArquivoImport(msgLimiteLinhas(linhasDeDados))  // :119-121
```
O CSV (`parse.ts:50-68`, `parseCsv`) não tem teto nenhum de linha/coluna — confirmado, é
código igual ao que a ficha descreve. **Confirmado, sem divergência.**

### Fato 25 — o .xlsx é um zip, a expansão não estava medida

Confirmado e agora **medido** (§2/§3 abaixo). `wb.xlsx.load` usa JSZip por baixo
(`node_modules/exceljs/lib/xlsx/xlsx.js:279` `JSZip.loadAsync`) — infla TODAS as
entradas do zip para montar o `Workbook` em memória antes de `lerXlsx` sequer chamar
`ws.getRow(1).cellCount`.

### Fato 26 — o desalinhamento

Confirmado, com uma **correção relevante** ao texto do fato: a frase *"`parse.ts:56`
descarta os erros `FieldMismatch` do PapaParse"* é tecnicamente verdadeira mas **dá a
entender que o PapaParse os geraria e o código os descartaria** — não é o que acontece.
Medido abaixo (§4): **com as opções exatas de `parse.ts:50-55` (sem `header: true`), o
PapaParse NUNCA gera `FieldMismatch`, em nenhuma linha desalinhada** — o filtro da
linha 56 é hoje **morto/no-op** para esse cenário, não "descarta avisos que existiam".
O motor de desalinhamento é 100% silencioso desde a origem: nem o Papa avisa, nem o
código verifica. As três armadilhas (a/b/c) do fato 26 estão confirmadas com fixture
real (§4/§5).

---

## 2. MEDIÇÃO 2 — expansão do `.xlsx` em memória (Decisão 7)

### 2.1 Geração dos arquivos fictícios

`ExcelJS.Workbook.xlsx.writeBuffer({ zip: { compression: 'DEFLATE',
compressionOptions: { level: 9 } }, useStyles: false })` — nível máximo de deflate.
Conteúdo **maximamente repetitivo** (mesmo valor `'WAP0001234'` em toda célula — o
pior caso de LZ77: a distância do match nunca cresce).

Dois formatos de planilha, como pedido:
- **`tall-narrow`**: 3 colunas, MUITAS linhas.
- **`wide-short`**: POUCAS linhas, colunas no **teto do próprio formato OOXML —
  16.384 colunas (`XFD`)**. ⚠ Achado lateral: tentei gerar com `cols=16385` e o
  ExcelJS recusou (`Error: 16385 is out of bounds. Excel supports columns from 1 to
  16384`, `col-cache.js:103`) — **o Excel/OOXML trava colunas em 16.384**; não é
  limite do nosso código, é do formato. "Colunas largas" no pior caso realista
  significa "no teto do formato", nunca mais que isso — um `.xlsx` com mais de 16.384
  colunas **não existe** (nenhum escritor consegue produzir um).
- 5 tamanhos por formato: 0,5 / 1 / 2 / 4 / 5 MB (erro final < 1% do alvo, calibrado
  por regra de três + até 2 correções).

Arquivos gerados em `scratchpad/f56-medicoes/xlsx/` (nunca no repo):

| arquivo | linhas | colunas | tamanho real |
|---|---|---|---|
| tall-narrow-0.5mb.xlsx | 47.233 | 3 | 0,505 MB |
| tall-narrow-1mb.xlsx | 94.466 | 3 | 1,003 MB |
| tall-narrow-2mb.xlsx | 188.933 | 3 | 2,001 MB |
| tall-narrow-4mb.xlsx | 377.865 | 3 | 3,996 MB |
| tall-narrow-5mb.xlsx | 472.332 | 3 | 4,994 MB |
| wide-short-0.5mb.xlsx | 9 | 16.384 | 0,502 MB |
| wide-short-1mb.xlsx | 21 | 16.384 | 1,012 MB |
| wide-short-2mb.xlsx | 43 | 16.384 | 1,948 MB |
| wide-short-4mb.xlsx | 90 | 16.384 | 3,947 MB |
| wide-short-5mb.xlsx | 113 | 16.384 | 4,958 MB |

Todos MUITO acima dos tetos de `limites.ts` (20.000 linhas / 40 colunas) — de propósito:
é o "arquivo forjado" que os tetos existem para pegar, só que hoje só pegam **depois**
da carga inteira.

### 2.2 `lerXlsx` real, em processo FILHO, com teto de heap e timeout

Harness: `node --max-old-space-size=<1024|2048> --import tsx
zz-f56-child-medir-xlsx.mjs <arquivo>` — o filho importa `lerXlsx` **direto do
código do repo** (`./src/lib/import/xlsx.ts`, sem mock), amostra
`process.memoryUsage()` a cada 20ms num `setInterval`, e reporta pico de `rss` e
`heapUsed`. Orquestrador (`zz-f56-orquestrar-medicao.mjs`) rodou as 20 combinações
(10 arquivos × 2 tetos de heap) com timeout de 60s cada, matando com `SIGKILL` se
estourasse — **nenhum estourou o timeout, nenhum deu `JavaScript heap out of
memory`**. Resultado completo em
`scratchpad/f56-medicoes/xlsx/resultados-medicao2.json` (20 entradas) e
`orquestrador.log`.

**Tabela — pico de RSS / heapUsed / tempo total até a rejeição (`ErroArquivoImport`,
sempre por linhas no tall-narrow, sempre por colunas no wide-short):**

| arquivo | tamanho | heap=1024MB: RSS / heap / tempo | heap=2048MB: RSS / heap / tempo |
|---|---|---|---|
| tall-narrow-0.5mb | 0,505MB | 210,8 / 102,4MB / 929ms | 294,1 / 172,5MB / 976ms |
| tall-narrow-1mb | 1,003MB | 286,0 / 160,6MB / 1785ms | 367,3 / 245,4MB / 1687ms |
| tall-narrow-2mb | 2,001MB | 436,0 / 313,8MB / 3694ms | 608,1 / 332,9MB / 3750ms |
| tall-narrow-4mb | 3,996MB | 751,5 / 601,5MB / 9145ms | 933,2 / 746,0MB / 7289ms |
| tall-narrow-5mb | 4,994MB | 936,2 / 735,1MB / 10977ms | **1354,4 / 1136,5MB / 9108ms** |
| wide-short-0.5mb | 0,502MB | 206,4 / 84,9MB / 912ms | 208,2 / 98,1MB / 768ms |
| wide-short-1mb | 1,012MB | 286,6 / 165,1MB / 1971ms | 342,4 / 213,2MB / 1793ms |
| wide-short-2mb | 1,948MB | 397,1 / 250,8MB / 3891ms | 523,6 / 321,8MB / 3909ms |
| wide-short-4mb | 3,947MB | 636,2 / 466,2MB / 7936ms | 939,5 / 749,2MB / 7394ms |
| wide-short-5mb | 4,958MB | 751,1 / 588,9MB / 9961ms | 1069,6 / 686,1MB / 9380ms |

**Leituras:**
- **Nenhum dos 20 casos estourou memória nem timeout** — todos terminaram com o
  `ErroArquivoImport` que já existe hoje (fato 21), em 0,8 a 11s.
- **Razão RSS pico / tamanho do arquivo**: ~150-190x com heap=1024MB (o GC trabalha
  mais sob pressão e mantém o *working set* menor); ~210-270x com heap=2048MB (o GC
  relaxa porque tem folga — a mesma entrada usa MAIS memória real quando o processo
  TEM mais memória disponível, não é determinístico por arquivo). O pico observado
  mais alto foi **1.354 MB de RSS para um arquivo de 4,99 MB** (razão **271x**).
- **`tall-narrow` custa mais RSS que `wide-short`** no mesmo tamanho de arquivo — mais
  linhas (mais objetos `Row`/`Cell` no ExcelJS) pesa mais que mais colunas na mesma
  quantidade de células, plausivelmente pela estrutura interna do ExcelJS (mapa de
  linhas esparso + um objeto `Cell` por célula preenchida, com overhead fixo por
  objeto que domina sobre o overhead por coluna).
- **Tempo cresce ~linear com o tamanho do arquivo**, não com o quadrado — ~2,2s/MB.
  Nenhum teste chegou perto do timeout de 60s adotado (a ordem sugeria 90s; usei 60s
  para caber os 20 runs num tempo de sessão razoável — nenhum resultado mudaria com
  90s, já que nenhum precisou do tempo todo).

### 2.3 O piso do arquivo: quanto o `.xlsx` real gera de XML por byte comprimido

Protótipo (a) — Central Directory do zip, **sem inflar nada** — deu o tamanho
DECLARADO descomprimido de `xl/worksheets/sheet1.xml` e `xl/sharedStrings.xml`:

| arquivo | comprimido | descomprimido (declarado) | razão |
|---|---|---|---|
| tall-narrow-5mb | 4,99MB | 69,85MB | **14,0x** |
| wide-short-5mb | 4,96MB | 62,72MB (62,36 sheet + 0,365 sharedStrings) | **12,7x** |

**A razão RSS-real/arquivo (150-271x) é 11 a 19 vezes MAIOR que a razão
XML-declarado/arquivo (12-14x).** Isto é o achado central da medição: **o custo real
não é o texto XML solto na memória — é o overhead de objeto por CÉLULA que o ExcelJS
cria** (um `Cell`/estilo/referência por célula, não só uma string). Qualquer fórmula
de pré-checagem que use só o tamanho do XML declarado (protótipo a) **subestima** o
custo real em RSS por uma ordem de grandeza — calibrar contra ele sem essa correção
dá falsa sensação de segurança.

### 2.4 O teto teórico do formato — DEFLATE, fora do ExcelJS

Pedido explícito da ordem ("o mais compressível que o formato permite"). Medido com
`zlib.deflateRawSync(buf, {level:9})` sobre um buffer de byte único repetido (sem
passar pelo ExcelJS/XML — mede só o limite do algoritmo, com segurança, sem tentar
inflar um arquivo real gigante):

```
entrada 10 MB  -> comprimido 10204 bytes  | razão 1028x | 64ms
entrada 100 MB -> comprimido 101924 bytes | razão 1029x | 476ms
entrada 500 MB -> comprimido 509599 bytes | razão 1029x | 2386ms
```

**O teto do próprio DEFLATE é ~1029:1** (bate com o limite conhecido do algoritmo,
~1032:1). Um `.xlsx` de 4,5 MB (o corpo real da Vercel, fato 22) **poderia, em teoria,
decodificar para ~4,6 GB** se alguém montasse o zip à mão (fora do ExcelJS, sem passar
pelo escritor real) com uma entrada de conteúdo patologicamente repetitivo. **Isto é
muito acima do que qualquer arquivo gerado pelo ExcelJS (nosso pior caso realista,
12-14x) produz** — a diferença entre "pior caso que um Excel real/ExcelJS gera" (12-14x
declarado, 150-271x em RSS) e "pior caso que o FORMATO permite" (~1029x) é de duas
ordens de grandeza. Ninguém usando Excel de verdade chega perto do teto teórico; só um
arquivo forjado A MÃO chegaria.

### 2.5 Memória de função da Vercel — doc oficial (conferida agora, mesma página do
fato 22, atualizada 24/08/2026)

Busquei `https://vercel.com/docs/functions/limitations` (`search_vercel_documentation`
+ `WebFetch`, a mesma página que o fato 22 já cita para o corpo de 4,5MB — mesma data
de atualização, `2026-08-24`, confirmando a mesma fonte):

> **Memory size limits** (com Fluid compute): Hobby — default **2 GB / 1 vCPU**,
> máximo 2 GB. Pro/Enterprise — default **2 GB / 1 vCPU**, máximo **4 GB / 2 vCPU**
> (configurável).

`vercel.json` do repo não tem `functions.*.memory` (só `{"regions":["gru1"]}`) — **o
projeto usa o padrão da plataforma**: presumivelmente 2 GB, contanto que o projeto
tenha Fluid compute habilitado (a doc diz "habilitado por padrão em projetos NOVOS" —
não confirmei se este projeto específico, mais antigo, tem Fluid ligado; isso fica
para quem mexer em `next.config.ts`/painel Vercel confirmar antes de decidir).

**Cruzando os três números:**
- Pior caso REALISTA medido (ExcelJS, ~14x declarado, até 271x em RSS): **1,35 GB**
  para um arquivo de ~5MB — cabe folgado no default de 2GB, e mais ainda no máximo de
  4GB do plano Pro do Johnny.
- Pior caso TEÓRICO do formato (DEFLATE ~1029x, arquivo forjado à mão): um .xlsx de
  4,5MB **estouraria os 2GB (e até os 4GB)** — a função morreria por OOM antes mesmo
  de qualquer teto de linha/coluna rodar.
- A superfície de risco é estreita: `admin/importar` exige `admin`/`dev` (CLAUDE.md,
  modelo de acesso), é auditado, e não é endpoint público — um ataque de bomba
  exigiria um colaborador com esse cargo forjando o zip à mão, não um usuário anônimo.
  Isto pesa na Decisão 7 (é um risco de DoS por colaborador interno mal-intencionado
  ou erro grosseiro, não uma brecha de segurança externa).

### 2.6 Os dois protótipos de conferência PRÉ-load pedidos

**(a) Central Directory do zip** — parsing manual do End Of Central Directory (EOCD,
assinatura `0x06054b50`, varredura de trás para frente até 65.535+22 bytes) + Central
Directory File Headers (assinatura `0x02014b50`, campo `uncompressedSize` no offset
+24) — **sem pizzip, zero dependência nova**, ~40 linhas.
- **Custo**: 1 a 4ms para os 10 arquivos testados (cresce com o Nº DE ENTRADAS do
  zip — sempre ~16 num .xlsx simples —, não com o tamanho do arquivo: só lê os
  últimos ~64KB + o bloco do Central Directory, nunca os dados comprimidos).
- **Confiabilidade**: **o campo NÃO é garantido** — é metadado escrito pelo criador
  do zip, e o `inflateRaw` do Node **não confere** esse valor contra o que
  efetivamente decodifica (testei: `zlib.inflateRawSync` decodifica o stream inteiro
  até o marcador de fim, independente de qualquer coisa escrita no header do zip). Um
  zip forjado à mão pode declarar um `uncompressedSize` pequeno e ainda assim conter
  um stream DEFLATE que decodifica para muito mais bytes — a checagem por Central
  Directory **é um filtro barato para o caso comum (arquivo real, escrito por
  Excel/ExcelJS/LibreOffice — que sempre calculam o campo certo), não uma garantia de
  segurança contra um atacante que constrói o zip a mão**. Ela pega 100% dos casos
  "grande sem querer"; não pega 100% dos casos "pequeno declarado, grande de
  propósito" — mas ver (2.4): o `TAMANHO_MAX_ARQUIVO` (bytes do ARQUIVO, sempre
  conferido antes de tudo) já limita o dano físico possível mesmo nesse caso
  adversarial, então a checagem por Central Directory é defesa em profundidade, não a
  única linha.

**(b) `<dimension ref="...">` por inflate PARCIAL** — localizei o Local File Header de
`xl/worksheets/sheet1.xml` pelo offset do Central Directory, e chamei
`zlib.inflateRawSync(prefixo, {finishFlush: zlib.constants.Z_SYNC_FLUSH})` sobre
prefixos CRESCENTES dos bytes comprimidos (256B, dobrando), parando ao achar
`<dimension` ou `<sheetData` no texto já decodificado — **zlib nativo, zero
dependência nova**.
- **Custo real, medido nos 10 arquivos**: **512 bytes comprimidos lidos, ~520-532
  bytes descomprimidos, em 0,24 a 2,1ms** — para arquivos de até 5MB comprimidos. O
  `<dimension>` do ExcelJS vem sempre nos primeiros bytes do XML (confirmado lendo
  `node_modules/exceljs/lib/xlsx/xform/sheet/worksheet-xform.js:321-326`: a ordem de
  renderização é `sheetPr → dimension → sheetViews → sheetFormatPr → cols →
  sheetData`, ou seja, o `<dimension>` está sempre ANTES da massa de dados).
  Resultado real: `tall-narrow-5mb.xlsx` → `ref="A1:C472333"` (bate com as 472.332
  linhas de dado geradas); `wide-short-5mb.xlsx` → `ref="A1:XFD114"` (bate com 16.384
  colunas × 113 linhas de dado geradas).
- **`dimension` é OPCIONAL** — confirmado por leitura de fonte (o `Worksheet` do
  ExcelJS **nunca lê a `dimension` do arquivo para computar `rowCount`/`cellCount`**:
  `lib/doc/worksheet.js:374` (`get rowCount`) e `:186` (`get dimensions`) sempre
  recalculam a partir do array real `_rows` — `dimension-xform.js` só é usado para
  ESCREVER, não para LER com efeito prático) — e confirmado empiricamente: gerei um
  `.xlsx` mínimo à mão (zip com `pizzip`, 5 partes: `[Content_Types].xml`,
  `_rels/.rels`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`,
  `xl/worksheets/sheet1.xml` **sem** `<dimension>`) e `lerXlsx` (o leitor real) o leu
  normalmente, 50/50 linhas.
- **O tamanho declarado NA `dimension` PODE MENTIR, e isso NÃO afeta o leitor real** —
  também confirmado empiricamente: gerei um `.xlsx` com `<dimension ref="A1:A2"/>`
  mas 500 linhas REAIS de `<sheetData>` — **`lerXlsx` leu as 500 linhas normalmente**
  (o leitor real recalcula sempre, nunca confia no atributo). Ou seja: um pré-check
  baseado só em `<dimension>` **pode ser enganado por um arquivo adversarial forjado**
  (dimension pequena, sheetData grande) — mas essa mentira NÃO enfraquece o teto de
  linha/coluna que já existe hoje (ele roda depois, sobre o `rowCount` real). Um
  pré-check por `dimension` é, de novo, um FILTRO RÁPIDO para o caso comum
  (arquivo real sempre tem `dimension` correta), não uma garantia.

**Comparação dos dois protótipos:**

| | custo medido | confiabilidade | o que dá |
|---|---|---|---|
| (a) Central Directory | 1-4ms (zip inteiro, ~16 entradas) | heurística — campo não é auferido pelo inflate | tamanho DESCOMPRIMIDO declarado por entrada (xl/worksheets, sharedStrings) |
| (b) `<dimension>` por inflate parcial | 0,2-2,1ms (512B lidos) | heurística — real leitor nunca confia nela; pode mentir | Nº DE LINHAS/COLUNAS declarado, direto — não precisa nem de fórmula de conversão |

**(b) é estritamente melhor para o objetivo do fato 21/25** (a checagem que falta é
"quantas linhas/colunas tem, antes de carregar" — e `dimension` responde isso
DIRETAMENTE, sem precisar de fator de conversão bytes→linhas calibrado e sujeito a
errar; (a) só dá um proxy em bytes que precisaria de uma constante de segurança
arbitrária). (a) continua útil como um teto de "arquivo absurdamente grande mesmo
descomprimido" complementar (ex.: recusar se `uncompressedSize` de qualquer entrada
> N MB, um número redondo bem acima do pior caso real ~70MB medido), pego com o mesmo
código já escrito, virtualmente de graça (mesma leitura do Central Directory que (b)
já faz para achar o offset do Local Header).

---

## 3. Decisão 7 proposta

**Adicionar a checagem por `<dimension>` (protótipo b) como primeira linha de
`lerXlsx`, ANTES de `wb.xlsx.load`, usando só `zlib` nativo — sem dependência nova —
mantendo o teto pós-carga que já existe HOJE como segunda linha (nunca REMOVER o
`colunas > MAX_COLUNAS_PLANILHA` / `linhasDeDados > MAX_LINHAS_PLANILHA` atuais).**

Custo de decidir cada lado:
- **Fazer a checagem prévia** (recomendado): custo de implementação é baixo — é
  puro `zlib`/parsing binário, ~80-100 linhas testáveis isoladamente, sem
  dependência nova (respeita a regra 3 do CLAUDE.md), e o ganho é REAL: hoje um
  arquivo de 5MB adversarial (mesmo só o "realista", não o forjado a mão) já gasta
  0,8 a 11s e até 1,35GB de RSS **antes** de ser recusado — com a checagem prévia,
  a recusa vem em **menos de 2ms**, sem nunca chamar `wb.xlsx.load`. Isso importa
  especialmente por causa do **tempo**: a Vercel cobra por tempo de CPU ativo +
  memória provisionada (`usage-and-pricing`), então uma recusa em 2ms é
  ~1000x mais barata que uma em 9-11s, além de reduzir o risco de OOM do caso
  adversarial forjado (2.4/2.5). Precisa lidar com dois casos de borda que MEDI:
  `dimension` ausente (cai para o comportamento de hoje — carrega e confia no teto
  pós-carga) e `dimension` mentirosa (a checagem prévia pode ACEITAR errado; o teto
  pós-carga pega do mesmo jeito que pegaria sem checagem prévia nenhuma — **a
  checagem prévia nunca pode AFROUXAR a segurança que já existe, só ADIANTAR a
  recusa no caso comum**).
- **Só registrar que "o pior caso realista cabe"** (alternativa mais barata,
  citada como opção pela própria ordem): custo de implementação zero — mas deixa o
  caminho de 0,8-11s/até 1,35GB por tentativa aberto para TODO arquivo grande, real
  ou forjado, e não fecha a lacuna teórica de 2.4/2.5 (o arquivo forjado a mão
  ainda passa pelo `TAMANHO_MAX_ARQUIVO`/corpo da Vercel inteiro antes de qualquer
  recusa, arriscando o OOM da função em vez de uma resposta rápida e legível). Dado
  que o custo de implementar (a) é baixo e o ganho (tempo + previsibilidade de
  custo) é grande, **recomendo a checagem prévia**, não só o registro.

---

## 4. O desalinhamento — CSV (fato 26), com o PapaParse REAL

Rodei `Papa.parse<string[]>(texto, {delimiter:';', skipEmptyLines:false,
dynamicTyping:false})` — **as opções EXATAS de `parse.ts:50-55`** — sobre os casos
pedidos. Script: `zz-f56-teste-parse.ts` (apagado), saída completa também salva em
`scratchpad/f56-medicoes/desalinhamento/` (ver nota no fim).

### 4.1 O achado mais importante: **`FieldMismatch` NUNCA é gerado sem `header: true`**

Fui à fonte do PapaParse (`node_modules/papaparse/papaparse.js:1246-1252`):
```js
if (_config.header) {
  if (j > _fields.length) addError('FieldMismatch', 'TooManyFields', ...)
  else if (j < _fields.length) addError('FieldMismatch', 'TooFewFields', ...)
}
```
**As duas ÚNICAS ocorrências de `FieldMismatch` em todo o pacote estão dentro de `if
(_config.header)`.** `parse.ts:51-55` chama `Papa.parse` **sem** a opção `header`
(fica `false` por padrão, o Papa devolve arrays, não objetos por nome de coluna) —
então **essa checagem nunca roda**, em nenhuma versão de desalinhamento. Provei com
os dois lados:
```
1a. linha com ; a mais (19 campos):  errors: []   ← confirmado
1b. linha com uma célula a menos:    errors: []   ← confirmado
1j. MESMO CSV com header:true:       errors: [{"type":"FieldMismatch","code":"TooManyFields",
                                       "message":"Too many fields: expected 18 fields but parsed 19","row":0}]
```
**Conclusão para o implementador:** o texto do fato 26 ("`parse.ts:56` descarta os
erros `FieldMismatch`") está correto sobre O QUE O CÓDIGO FAZ, mas induz a pensar que
o Papa geraria avisos que o código joga fora — **não é isso: o Papa nunca gera esse
aviso nas opções atuais, então a linha 56 é hoje morta para este cenário** (só
seria viva se algum dia o código passasse a usar `header: true`, o que mudaria
TODA a extração — não é o desenho atual, que casa colunas por NOME via
`mapaColunas`, não pela ordem do Papa). Ou seja: **não existe nenhum sinal do
PapaParse para reaproveitar aqui** — `linha_desalinhada` (Decisão 8) precisa ser
**checagem PRÓPRIA**, escrita do zero contra `csv.linhas[i].celulas.length`, não
uma reação a um erro que o Papa já dá.

### 4.2 O deslocamento de colunas em ação (código real, `parseCsv` + `extrairRegistros`)

Linha com um `;` a mais entre "Marca" e "Tipo" (19 células em vez de 18):
```
registro BOM:  tipo="Notebook"  fornecedor="WAP"      patrimonio="WAP0001234"
registro RUIM: tipo="EXTRA"     fornecedor="Latitude 5490"  patrimonio="ST-1"
```
**O patrimônio da linha ruim virou a SERVICE TAG da linha boa ("ST-1")** — porque
`campo()` (`parse.ts:174-177`) lê pelo ÍNDICE do mapa de colunas, e a partir do `;`
extra TODO índice seguinte lê um campo à esquerda do que devia. Isso é exatamente o
"preview sai verde" do fato 26: nada bloqueia, o `RegistroImport` é montado
normalmente com um patrimônio SINTATICAMENTE PLAUSÍVEL (uma string) mas
SEMANTICAMENTE ERRADO. Célula a menos (1b): efeito espelhado, tudo desliza para a
DIREITA no armazenamento (índices seguintes leem o campo que "deveria" vir depois).

### 4.3 As três armadilhas da régua (fato 26 a/b/c) — confirmadas com fixture

**(a) largura ÚTIL ≠ `header.length` cru.** Testado: header com 2 colunas vazias à
direita → `header.length` cru = 20, mas `mapaColunas(header).size` (nomes não-vazios)
= **18**; `detectarLayout` reconhece o layout normalmente (tolera, por desenho —
`parse.ts:103-107`). **A régua de `linha_desalinhada` tem que comparar contra a
LARGURA ÚTIL (18), nunca contra `header.length` (20)** — senão toda linha real
(que teria 18 células, não 20) seria acusada de "célula a menos" por engano.

**(b) linha vazia / `\n` final rodam ANTES do descarte.** Confirmado:
`skipEmptyLines:false` faz uma linha 100% vazia E o `\n` final virarem `['']` (um
array de 1 elemento) na saída crua do Papa — e **`linhaVazia()` (`parse.ts:179-181`)
só roda DENTRO de `extrairRegistros` (`:198`), depois que `parseCsv` já produziu o
`CsvCru`.** Ou seja: a régua de `linha_desalinhada` (que compara `celulas.length`)
**precisa rodar DEPOIS do filtro de linha vazia**, ou vai acusar toda linha vazia
(`['']`, 1 célula) de "17 células faltando" por engano. Testei o cenário completo
(linha real + linha vazia + `\n` final): `parseCsv` devolve 3 `linhas` cruas, mas
`extrairRegistros` filtra para **1 registro** — a checagem de desalinhamento tem que
ficar no mesmo lugar de `linhaVazia` (dentro do loop de `extrairRegistros`, por
linha, DEPOIS do `if (linhaVazia(celulas)) continue`), não em `parseCsv`.

**(c) o espelho no `.xlsx`.** Confirmado com `lerXlsx` real: célula na 5ª posição
com header de 4 colunas nomeadas → **o 5º valor não aparece em lugar nenhum**
(`celulas.length` sempre = `colunas` = `header.cellCount`, nunca mais) — `lerLinha`
(`xlsx.ts:123-128`) só lê `for (let c = 1; c <= colunas; c++)`, então um valor além
disso é fisicamente nunca lido do `Row`, não "descartado depois": **some em
silêncio, sem sinal nenhum, nem um array mais longo para detectar.** Isso é
estruturalmente DIFERENTE do CSV (onde a célula extra SOBREVIVE no array e desloca
as outras) — no `.xlsx`, ela é perdida na origem. A régua de "célula a mais" no
`.xlsx` não pode reusar a mesma lógica de comparação de `celulas.length` do CSV: tem
que comparar `row.cellCount` (ou `row.actualCellCount`) da LINHA DE DADOS contra o
`cellCount` do HEADER, **antes** de `lerLinha` cortar.

Também confirmado: célula vazia à direita (linha mais curta que o header) → vem
como `""` normalmente, nunca quebra nada — **passa**, como devia (fato 26,
"colunas vazias à direita... continuam passando").

### 4.4 BOM, CRLF, aspas com `;` dentro — os três "não são problema"

- **BOM UTF-8**: `decodificarCsv` (`parse.ts:23-38`) já remove o BOM antes de
  qualquer parse (`buf[0]===0xef && buf[1]===0xbb && buf[2]===0xbf` → `subarray(3)`)
  — confirmado: `charCodeAt(0)` do texto decodificado nunca é `0xFEFF`.
- **CRLF**: o Papa detecta `\r\n` sozinho (`meta.linebreak` reporta), sem gerar
  nenhuma célula extra nem erro — confirmado, saída idêntica ao `\n`.
- **Aspas com `;` dentro**: RFC4180-válido, o Papa respeita aspas por padrão — a
  célula sai inteira, com o `;` interno preservado, sem quebrar a contagem de
  colunas — confirmado (`data[1].length` continua 18, o valor citado vem completo).

Nenhum dos três precisa de tratamento na Decisão 8 — já funcionam certo hoje.

---

## 5. Decisão 8 proposta — a régua de `linha_desalinhada`

**Definições exatas propostas** (para não deixar ambiguidade no implementador):

- **Largura útil do CSV** = `mapaColunas(csv.header).size` — o Nº DE NOMES
  NÃO-VAZIOS normalizados no cabeçalho (já existe, `parse.ts:165-172`, reusar tal
  qual). Não é `header.length`.
- **Largura útil do `.xlsx`** = `ws.getRow(1).cellCount` (já é `colunas` em
  `xlsx.ts:115` — reusar).
- **Célula a MAIS (CSV)**: `celulas.length > larguraUtil` na linha de dados JÁ SEM
  vazias (depois do `if (linhaVazia(celulas)) continue`) → bloqueante
  `linha_desalinhada`, mensagem com o Nº DA LINHA (`registro.linha`/`d.linha`, o
  número FÍSICO já rastreado) e a CONTAGEM (`celulas.length` vs `larguraUtil`), no
  padrão das mensagens de `limites.ts` (`msgLimiteLinhas`/`msgLimiteColunas`) —
  citar os dois números, não só "está desalinhado".
- **Célula a MENOS (CSV)**: mesma checagem, `celulas.length < larguraUtil` — mesmo
  bloqueante `linha_desalinhada` (um único `tipo` para os dois sentidos, já que a
  causa e o efeito — colunas trocadas — são os mesmos; a mensagem distingue "a
  mais"/"a menos" em texto, não em `tipo` separado, seguindo o padrão de
  `ErroImport.tipo` existente que já usa um tipo por FAMÍLIA de erro, não por
  variante).
- **`.xlsx`**: célula fisicamente além do `cellCount` do header **nunca chega a
  `lerLinha`** hoje — para pegar isso, a checagen tem que comparar
  `ws.getRow(numeroLinha).cellCount` (ou `actualCellCount`) **da linha de dados**
  contra `colunas` (o cellCount do header) **antes** de montar `celulas` com o
  `for` truncado — senão a informação já morreu. Célula a menos no `.xlsx`: já
  vem como `""` (célula vazia), então **não há "a menos" detectável no `.xlsx`**
  do mesmo jeito que no CSV — uma linha xlsx mais curta é indistinguível de uma
  linha com células vazias no fim, E ISSO ESTÁ CERTO (é o comportamento normal de
  uma planilha real, onde não preencher a última coluna é routine). Só "a mais"
  é bloqueante no `.xlsx`.
- **Linhas vazias / `\n` final / colunas vazias à direita**: continuam passando —
  a checagem de desalinhamento roda estritamente DEPOIS do filtro de linha vazia
  (mesmo ponto de `extrairRegistros`, não antes).

**Onde `conferirTetos` entra:**
- Assinatura hoje de `analisar()`: `function analisar(csvOriginal: CsvCru,
  arquivoHash: string, filial: FilialSelecionada, hoje: string, correcoes:
  CorrecaoImport[], existentesEmOutraFilial: ReadonlyMap<string,string>):
  ValidacaoImport` (`plano.ts:277-284`) — já recebe o `CsvCru` **JÁ PARSEADO**
  (para CSV: `validarCsvImport` chama `parseCsv(texto)` em `plano.ts:552` ANTES de
  invocar `analisar`; para xlsx: `validarArquivoImport` chama `await
  lerXlsx(conteudo)` em `plano.ts:574` antes de `analisar`). **Logo "a primeira
  linha de `analisar()`" já é, estruturalmente, uma checagem PÓS-parse para os
  dois formatos** — não impede o custo de ter parseado tudo primeiro; só unifica
  a MENSAGEM/RECUSA entre os dois, que é literalmente o que a ordem pede
  ("o CSV passa a ter os mesmos tetos e as mesmas mensagens que o `.xlsx` já
  tem"). Proposta: `conferirTetos(csv: CsvCru): void` (lança `ErroArquivoImport`,
  o MESMO tipo que `xlsx.ts` já lança) em `limites.ts` (fonte única dos tetos,
  onde já moram `MAX_LINHAS_PLANILHA`/`MAX_COLUNAS_PLANILHA`), chamada como
  primeira linha de `analisar()` e removida de dentro de `lerXlsx` (que passa a
  não checar mais nada — simplifica `xlsx.ts`, a checagem sai do leitor de
  formato e vira parte do MOTOR, igual para os dois).
- **CSV precisa de teto de linhas ANTES de parsear inteiro?** Medi (child process,
  `parseCsv`+`extrairRegistros` reais sobre um CSV de 5MB no PIOR CASO de contagem
  de linha — 2.621.440 linhas de 1 caractere, `'x\n'.repeat(...)`): **1,5s de
  parse + 0,6s de extração, pico de 706,3MB RSS / 594,3MB heap.** Isso é sério mas
  **estruturalmente diferente do `.xlsx`**: o CSV não é comprimido — o pior caso
  em bytes de RSS é limitado a ~140x o TAMANHO DO ARQUIVO (que já é limitado a
  `TAMANHO_MAX_ARQUIVO`, hoje 5MB, e cai para caber nos 4,5MB da Vercel pela
  Decisão 6/fato 22) — nunca explode por um fator de compressão de até 1029x como
  o `.xlsx` (§2.4). Ou seja: **o CSV JÁ está implicitamente limitado pelo teto de
  bytes do arquivo** (que é conferido ANTES de tudo, em
  `actions/importar.ts:238`) de um jeito que o `.xlsx` não está (por causa da
  compressão). **Não é estritamente necessário** um pré-check de linhas antes do
  `Papa.parse` para o CSV do mesmo jeito que é para o `.xlsx` — mas é uma
  melhoria BARATA e sem risco: contar `\n` (ou usar `.split('\n').length`) no
  texto decodificado antes de chamar `Papa.parse` custa poucos milissegundos
  (muito menos que os 1,5s do parse completo) e pouparia esses 1,5-2,1s + ~700MB
  no caso patológico. Recomendo incluir como parte da MESMA função
  `conferirTetos`, mas aplicada em DOIS PONTOS: uma pré-checagem BARATA (contagem
  de `\n`) antes de `Papa.parse` em `parseCsv`/`decodificarCsv` (evita o custo do
  parse completo no pior caso), e a checagem FINAL de linhas/colunas (via
  `CsvCru`) como primeira linha de `analisar()` (unifica com o `.xlsx`, que só
  tem o segundo ponto por natureza — não há como "pré-checar" sem inflar o zip
  primeiro, que é exatamente a Decisão 7).

---

## 6. Armadilhas encontradas (para quem for implementar)

1. **O `while` síncrono que nunca deixa o event loop rodar.** Minha primeira
   tentativa do protótipo (b) usava `zlib.createInflateRaw()` em modo *stream*
   (`.write()`/`'data'`) dentro de um `while` sem `await` — o loop nunca cedia o
   event loop, então NENHUM evento `'data'` disparava até o loop terminar (rodava
   até o fim do arquivo, não parava cedo). A correção foi trocar para
   `zlib.inflateRawSync(prefixo, {finishFlush: zlib.constants.Z_SYNC_FLUSH})` —
   síncrono, aceita um PREFIXO do stream sem exigir o fim do deflate, e devolve o
   que já deu para decodificar. Zero surpresa de concorrência. Anotar para quem
   for portar isto para `xlsx.ts`: **use a versão síncrona com `Z_SYNC_FLUSH`**,
   não a de stream.
2. **Excel/OOXML trava colunas em 16.384** — isso não está em `limites.ts` nem em
   nenhum comentário do código hoje; é um fato do FORMATO, não do nosso código.
   Vale citar no comentário de `MAX_COLUNAS_PLANILHA` (40 é muito menor que
   16.384, então não muda nada na prática, mas documenta por que "colunas
   largas" tem um teto natural).
3. **O pico de RSS não é determinístico por arquivo — depende do heap
   disponível.** O MESMO arquivo (`tall-narrow-5mb.xlsx`) deu 936MB de RSS com
   heap=1024MB e 1.354MB com heap=2048MB — o GC do V8 trabalha mais sob pressão
   de memória e reduz o *working set*. Isso quer dizer que medir "o pico de RSS"
   com um teto de heap generoso dá um número PIOR (mais realista do que a
   função vai realmente gastar na Vercel, que não limita `--max-old-space-size`
   por padrão) do que medir com um teto apertado. **Para decidir se "cabe" na
   Vercel, use os números com heap=2048MB (mais próximos do comportamento sem
   `--max-old-space-size` nenhum), não os de 1024MB.**
4. **Gerar planilhas largas com `ws.addRow()` do ExcelJS é caro em memória DE
   GERAÇÃO** — minha primeira tentativa (5 linhas fixas, colunas girando até
   16.385) estourou heap de 3GB no PRÓPRIO GERADOR (não no leitor) tentando achar
   o tamanho-alvo por busca binária com até 14.882 linhas × 16.384 colunas = 243
   milhões de células. Corrigido calibrando a proporção linhas/tamanho
   ANALITICAMENTE (bytes/célula medido numa amostra pequena) em vez de busca
   binária cega. Não afeta o `lerXlsx` medido (que é o que importa), mas é uma
   armadilha para quem for gerar fixtures parecidas de novo.
5. **`tsx` como loader precisa de `--import tsx`, não `-r`/`require`** — Node 26
   é ESM-first; `node --import tsx arquivo.mjs` funciona (o pacote `tsx` exporta
   `.` → `dist/loader.mjs`, feito para isso), e permite passar
   `--max-old-space-size` na mesma linha de comando (V8 flag, não precisa de
   `NODE_OPTIONS`).
6. **Script de trabalho de outro agente na mesma pasta.** A raiz do repo já tinha
   `zz-f56-corpo-vigente-patrimonio.mjs`, `zz-f56-medicao-corpos.ts` e
   `zz-f56-medicao-corpos-v2.ts` de outra frente rodando em paralelo — **não
   apaguei esses três** (só os meus). Quem for limpar a raiz no fim da fase
   precisa conferir se todo mundo já terminou antes de rodar um `rm zz-f56-*`
   genérico.

---

## 7. Resumo executável para quem for implementar

- `src/lib/import/xlsx.ts`: mover a checagem de teto para FORA (para
  `conferirTetos` em `limites.ts`, chamada por `analisar()`), e ACRESCENTAR (não
  substituir) uma checagem `dimension`-antes-do-load, síncrona, com
  `zlib.inflateRawSync(..., {finishFlush: Z_SYNC_FLUSH})` sobre um prefixo
  pequeno (start em 256B, dobrando até ~8KB) dos bytes comprimidos da PRIMEIRA
  entrada `xl/worksheets/*.xml` do zip (achada pelo Central Directory, parser
  manual ~40 linhas, sem dependência nova). Se achar `<dimension ref="A1:C99999">`
  com linhas/colunas acima do teto, recusa em <2ms sem chamar `wb.xlsx.load`. Se
  não achar (dimension ausente ou zip não reconhecido), cai para o comportamento
  de HOJE — carrega e confia no teto pós-carga, que continua existindo.
- `src/lib/import/parse.ts`: `parseCsv` ganha uma contagem barata de linhas
  (`\n`) ANTES de `Papa.parse`, como otimização (não crítica); `extrairRegistros`
  ganha a checagem `linha_desalinhada` no MESMO loop que já filtra `linhaVazia`
  (depois do `continue` da linha vazia), comparando `celulas.length` contra
  `mapaColunas(csv.header).size` (a largura útil).
- `analisar()` (`plano.ts:277`) ganha `conferirTetos(csvOriginal)` como
  PRIMEIRA linha, jogando o mesmo `ErroArquivoImport` que hoje `xlsx.ts` já usa —
  os testes de `xlsx.test.ts` ("tetos de tamanho") continuam valendo tal qual,
  só migram de onde o erro é lançado.
