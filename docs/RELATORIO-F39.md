# Relatório F39 — O termo diz o que foi junto

**Ordem:** `docs/prompts/F39-termo-diz-o-que-foi-junto-ultracode.md` (29/08/2026) ·
**Plano:** `docs/PLAN-F36-F39.md` §6 (decisões D8, D9, D10, D11) · **Fecha a série F36→F39.**
**Versão:** `1.44.0` · **Migrations: nenhuma** · **Dependências novas: nenhuma.**
**Baseline da fase:** `d661c769cf99b1a59994e3eacab7981356b58a1d` (`v1.43.1`, última migration `0123`).

Hoje o termo mentia por omissão. A F38 fez o acessório andar junto com o equipamento no banco —
"o que foi junto com este notebook" virou um join —, mas o papel que a pessoa assina continuava
listando só marca, modelo, service tag e patrimônio, e `{outros_componentes}` saía `''` fixo desde
a F5A. Esta fase pôs no papel o que o sistema já sabia.

---

## 1. Baseline, medida ANTES de mudar qualquer coisa (§V)

| Medida | Valor |
|---|---|
| `git rev-parse HEAD` | `d661c769cf99b1a59994e3eacab7981356b58a1d` |
| `package.json` | `1.43.1` |
| última migration | `0123_ordem_dos_itens_do_lote.sql` |
| `git status` | limpo, exceto o arquivo da própria ordem (insumo, commitado no 1º commit) |
| `npm run lint` | **exit 0**, sem avisos |
| `npm run test` | **137 arquivos / 2748 testes**, exit 0 |
| `npm run build` | **exit 0** |

`sha256` dos 7 `.docx` — antes → depois (só os 5 de responsabilidade mudaram):

| Modelo | antes | depois |
|---|---|---|
| `devolucao-desligamento` | `5cebacff6bd8…` | `5cebacff6bd8…` **(idêntico)** |
| `devolucao-equipamento` | `e8eedaf7318f…` | `e8eedaf7318f…` **(idêntico)** |
| `responsabilidade-celular` | `c53365ec2169…` | `a5337c251df5…` |
| `responsabilidade-desktop` | `deed0a3ac75a…` | `bb8e2aeb1e4d…` |
| `responsabilidade-monitor-homeoffice` | `2448679f5813…` | `fe2ef27d205d…` |
| `responsabilidade-monitor-interno` | `3c081056c29b…` | `7f720eb8b730…` |
| `responsabilidade-notebook` | `79e3b8886cd4…` | `a6145c719fe0…` |

### `npm run db:types` — a verdade, e ela não é "sem diff"

A ordem manda que `db:types` saia **sem diff**. Medido na baseline, **ele já não sai** — e a
divergência é **anterior a esta fase**:

- contra **produção** (`pbtjcalbmepmrqzprusb`): **+35 −2** — aparece a tabela de backup
  `_bkp_relatorios_gerados_f6a`, que existe **só em produção** (resíduo da F6A e não está em
  nenhuma migration), e some o `| null` de `p_observacao` em duas RPCs;
- contra **ensaio** (`sgmvldiizsrjbxzzpmhh`): **+2 −2** — só a perda de nullability de
  `p_observacao`, que é o defeito conhecido do gerador já registrado na memória do projeto.

**O que esta fase garante, e é o que importa: ela não acrescenta diff nenhum.** `git diff
d661c76..HEAD -- supabase/` sai **vazio**, e o `database.ts` no repositório é byte a byte o da
baseline. As duas divergências acima ficam como **pendência declarada** (§10).

### Contagens só-leitura em PRODUÇÃO (critério 9), refeitas ao fechar a fase

| Medida | 29/08 (na ordem) | agora |
|---|---|---|
| `itens` total | 18 | **18** |
| `itens` com `tipo_id` | 7 | **7** |
| `lancamentos_item` total | — | **30** |
| `lancamentos_item` com `movimentacao_id` | 0 | **0** |
| `tipos_item` | — | **7** |
| `movimentacoes` | — | **3.430** |
| `termos_gerados` | — | **63** |

**A consequência, com todas as letras:** com **zero** lançamento vinculado, **nenhuma movimentação
existente em produção produz linha de acessório hoje**. Os 11 itens sem tipo seriam silenciosamente
descartados da linha — e é por isso que o aviso da §C.3 existe. A fase se prova **no ensaio e nos
testes**; em produção, ela só se prova na **primeira entrega registrada com "Itens que vão junto"**.
Nenhum registro foi forçado em produção para provar isso.

### Conversor de PDF: não existe nesta máquina

`soffice`, `libreoffice` e `pandoc` — os três `command not found`, e não há `soffice.exe` em
`C:\Program Files[ (x86)]\LibreOffice\program\`. **Nada foi instalado** (custo R$ 0, stack fechada).
As evidências ficam em `.docx`, e a conferência visual do Johnny é no Word.

---

## 2. §A — Os 5 `.docx` ganharam a seção

### 2.1 O que foi medido antes de gravar

| Modelo | âncora (texto exato) | idx | total `<w:p>` | `numId`/`ilvl` | `pStyle` |
|---|---|---|---|---|---|
| `responsabilidade-notebook` | `NÚMERO DO CHAMADO: {chamado}` | 11 | 39 | 2 / 0 | `PargrafodaLista` |
| `responsabilidade-desktop` | `NÚMERO DO CHAMADO: {chamado}` | 11 | 44 | 1 / 0 | `PargrafodaLista` |
| `responsabilidade-monitor-interno` | `NÚMERO DO CHAMADO: {chamado}` | 10 | 33 | 1 / 0 | `PargrafodaLista` |
| `responsabilidade-monitor-homeoffice` | `Número do Chamado: {chamado}` | 11 | 33 | 36 / **1** | **nenhum** |
| `responsabilidade-celular` | `OBS: {obs}` | 14 | 36 | 1 / 0 | `PargrafodaLista` |

A tabela da ordem bate nos cinco. ⚠ No **celular**, o `{chamado}` existe (idx 10) mas **não** fecha
o bloco: telefone, IMEI, Pulsus e OBS vêm depois. O script ancora pelo **texto** do parágrafo, nunca
pelo índice.

### 2.2 A saída do script em modo conferência (`node scripts/termos/inserir-acessorios.mjs`)

Colada da corrida que precedeu o `--aplicar`:

```
· devolucao-desligamento.docx: fora dos 5 de responsabilidade — não tocado
· devolucao-equipamento.docx: fora dos 5 de responsabilidade — não tocado
✓ responsabilidade-notebook.docx
    <w:p> 39 → 42 (+3) | 42 partes, 1 divergente (word/document.xml) | XML anterior reconstituível
    foro intacto (xml 1, texto 1) | assinatura intacta (1)
    âncora: "NÚMERO DO CHAMADO: {chamado}"
    w:pPr aplicado: pStyle=PargrafodaLista · numPr=removido · ind=— · jc=—
    w:rPr do rótulo: <w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Nunito Sans" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:bCs/><w:color w:val="000000" w:themeColor="text1"/></w:rPr>
    w:rPr do campo:  <w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Nunito Sans" w:hAnsi="Arial" w:cs="Arial"/><w:color w:val="000000" w:themeColor="text1"/></w:rPr>
    sha 79e3b8886cd4 → 8e2b3de1b186
✓ responsabilidade-desktop.docx
    <w:p> 44 → 47 (+3) | 40 partes, 1 divergente (word/document.xml) | XML anterior reconstituível
    foro intacto (xml 1, texto 1) | assinatura intacta (1)
    w:pPr aplicado: pStyle=PargrafodaLista · numPr=removido · ind=— · jc=—
✓ responsabilidade-monitor-interno.docx
    <w:p> 33 → 36 (+3) | 42 partes, 1 divergente (word/document.xml) | XML anterior reconstituível
    foro intacto (xml 1, texto 1) | assinatura intacta (1)
    w:pPr aplicado: pStyle=PargrafodaLista · numPr=removido · ind=— · jc=—
✓ responsabilidade-monitor-homeoffice.docx
    <w:p> 33 → 36 (+3) | 38 partes, 1 divergente (word/document.xml) | XML anterior reconstituível
    foro intacto (xml 1, texto 1) | assinatura intacta (1)
    âncora: "Número do Chamado: {chamado}"
    w:pPr aplicado: pStyle=— · numPr=removido · ind=— · jc=both
    w:rPr do rótulo: <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:bCs/></w:rPr>
✓ responsabilidade-celular.docx
    <w:p> 36 → 39 (+3) | 42 partes, 1 divergente (word/document.xml) | XML anterior reconstituível
    foro intacto (xml 1, texto 1) | assinatura intacta (1)
    âncora: "OBS: {obs}"
    w:pPr aplicado: pStyle=PargrafodaLista · numPr=removido · ind=— · jc=—

CONFERÊNCIA (nada gravado) — 5 modelo(s) prontos, 0 já inserido(s), 0 falha(s).
```

**O `w:pPr` aplicado, declarado por modelo** (a única prova mecânica do caso COM acessório, que a
§A.3 exige por escrito): `numPr=removido` nos cinco; `pStyle=PargrafodaLista` em quatro e **nenhum
`pStyle`** no home office, que também é o único com `jc=both` próprio; nenhum dos cinco tem `w:ind`
explícito (a indentação vinha da definição de numeração).

**Idempotência**, rodando de novo hoje:

```
· responsabilidade-notebook.docx: já inserido ({#tem_acessorios}) — nada a fazer
  … (os cinco)
CONFERÊNCIA (nada gravado) — 0 modelo(s) prontos, 5 já inserido(s), 0 falha(s).
```

**`git diff --stat` mostra 5 `.docx`, não 7:**

```
 src/templates/termos/responsabilidade-celular.docx  | Bin 56837 -> 56929 bytes
 src/templates/termos/responsabilidade-desktop.docx  | Bin 48555 -> 48651 bytes
 .../termos/responsabilidade-monitor-homeoffice.docx | Bin 48207 -> 48293 bytes
 .../termos/responsabilidade-monitor-interno.docx    | Bin 56444 -> 56539 bytes
 src/templates/termos/responsabilidade-notebook.docx | Bin 58013 -> 58127 bytes
 5 files changed, 0 insertions(+), 0 deletions(-)
```

### 2.3 ⚠ Um achado de medição que muda como se conta o foro

`"Comarca de São José dos Pinhais"` dá **ZERO** no XML cru dos 7 modelos: a frase está **partida em
runs** ("Comarca de " termina um run não-negrito e o nome da comarca começa outro, em negrito). Quem
contasse a cláusula por substring no XML cru teria uma prova que sempre dá 0 = 0 e nunca acusa nada.
O script conta **duas coisas**: `São José dos Pinhais/PR` no XML (run único, a mesma constante que o
`retaguear-cidade.mjs` usa) **e** a frase inteira no **texto decodificado**. As duas ficaram em 1,
antes e depois, nos cinco.

### 2.4 O critério 2 saiu MELHOR que o exigido

A ordem pede texto extraído idêntico e contagem de `<w:p>` igual. Medido pelo pacote de evidências
(`node scripts/termos/evidencias-acessorios.mjs`), renderizando o modelo **NOVO** com
`tem_acessorios: false` e o modelo **do SHA da baseline** (`git show d661c76:…`, nunca `HEAD`) com o
**mesmo** payload:

| Modelo | texto idêntico | `<w:p>` | XML idêntico | **byte a byte** | cláusula sai inteira (com acessório) |
|---|---|---|---|---|---|
| `responsabilidade-notebook` | sim | 39 = 39 | sim | **sim** | sim |
| `responsabilidade-desktop` | sim | 44 = 44 | sim | **sim** | sim |
| `responsabilidade-monitor-interno` | sim | 33 = 33 | sim | **sim** | sim |
| `responsabilidade-monitor-homeoffice` | sim | 33 = 33 | sim | **sim** | sim |
| `responsabilidade-celular` | sim | 36 = 36 | sim | **sim** | sim |

**Saiu byte a byte, e portanto está dito.** Sem periférico, o documento gerado é o **mesmo arquivo**
de antes da fase — nem linha vazia, nem marcador de lista órfão, nem um bit de diferença.

### 2.5 A guarda que não existia (§A.5)

`src/lib/termos/modelos-docx.test.ts` — **32 asserções**. Abre os 7 modelos com `pizzip` e confere o
conjunto de tags de cada um, **extraído do TEXTO** (concatenação dos `<w:t>`), mais: as tags do bloco
condicional sozinhas em parágrafos próprios e na ordem certa, a cláusula de foro presente nos 5 de
responsabilidade e a linha da assinatura da F25 nos 7.

⚠ **Por que do texto e nunca do XML cru** — medido: `matchAll(/\{[^{}]*\}/g)` sobre o XML cru captura
`{28A0092B-C50C-407E-A947-70E740481C1C}` (atributo `<a:ext uri=…>` de DrawingML) em **3 dos 5**
modelos (celular, monitor interno, notebook). Um scanner ingênuo teria 9 "tags" onde há 8.

---

## 3. §B — A função pura

`src/lib/termos/acessorios.ts` · `montarLinhaDeAcessorios(lancamentos, tipos, limite)` →
`{ linha, descartados }`. **19 testes** em `acessorios.test.ts`:

- vazio → `''`; soma 1 → `Rótulo`; soma > 1 → `Rótulo (N)`;
- soma de quantidades do mesmo tipo vindas de itens diferentes;
- ordem pela `ordem` do tipo, desempate por rótulo (`localeCompare('pt-BR')`) e por `id` — **ordem
  total**, com teste de determinismo (mesma entrada embaralhada → mesma linha);
- item sem `tipo_id` **e** item com tipo fora do catálogo: descartados **com a contagem certa**;
- tipo **desativado** entra (a função não conhece `ativo` — quem passa o catálogo é quem lê);
- quantidade zero ou negativa não entra;
- **corte por " e mais N" nos DOIS limites** (600 e 400), provando que o trecho antes do sufixo é
  uma lista de rótulos **inteiros** e que o N bate com o que ficou de fora;
- o caso do **+1 caractere**: o sufixo cresce de dígito quando N passa de 9, e o teste varre dez
  limites justos (40…62) exigindo `linha.length <= limite` em todos;
- as **duas exclusões** da §C.2 (`estorna_id`, `pendencia_item_id`), alimentando o leitor com linhas
  marcadas e verificando que não entram — e que **não** contam como descartadas (não é que falte
  tipo nelas; é que não são deste documento).

---

## 4. §C e §D — O preenchimento

- `camposTermoSchema` ganhou `acessorios: z.string().max(600)` (chaves fechadas, `.partial()`).
- `CAMPOS_RESP` ganhou **"Acessórios que acompanham"**, `multi: true`, entre Chamado e Cidade.
- **O leitor novo** é `acessoriosDasMovimentacoes` em `src/lib/queries/itens.ts` — **uma** consulta,
  com o tipo e o rótulo embutidos (`itens!inner(tipo_id, tipos_item(id, rotulo, ordem))`). O embed de
  dois níveis foi **conferido contra o banco antes de entrar**, inclusive o caso de item sem tipo
  (devolve `tipos_item: null`, e a função pura o descarta e conta).
- **Responsabilidade:** `saida` de `movs[0]`, a mesma movimentação de referência que já governa
  marca, modelo, patrimônio e chamado (D13). **Devolução:** `retorno` de **todas** as movimentações
  do lote.
- `{observacao}` **não mudou de comportamento nem de texto** — segue `observacaoSugestao(itensFaltantes)`,
  "Não devolvido(s): …". O que mudou foi só de onde vem o **rótulo** (§E).
- **`tem_acessorios` deriva do texto final**, em `gerarTermo`, ao lado de `data_extenso`.

### Os avisos (§C.3)

1. **Item sem tipo:** *"N item(ns) que foram junto não têm tipo cadastrado e ficaram fora do termo —
   classifique em Administração → Itens."*
2. **Conferido mas sem lançamento:** *"Houve item conferido nesta devolução que não gerou lançamento
   de estoque — confira a linha de componentes antes de gerar."*

**O critério escolhido para o nº 2, e ele vai declarado** (a ordem manda registrar): avisar quando,
ao mesmo tempo, a linha saiu **vazia** e o lote é **misto** pelo mesmo teste de `checklistPodeLancar`
(F38) — que é **reusado**, não reimplementado, para que as duas pontas não possam divergir, com o
espelho retrospectivo do detentor pelo `snapshot_anterior` (o trigger já limpou `colaborador_atual`).
7 testes em `preparo.test.ts`.

**O que este critério NÃO cobre, e não dá para cobrir:** tipo cuja ponte não resolve item de catálogo
(`ponte-tipo-item.ts`) também não gera lançamento, e disso **não fica registro nenhum no banco**. Num
lote homogêneo esse caso é indistinguível de "nada acompanhou mesmo". Está na §11.

---

## 5. §E — A constante morreu, e nenhum rótulo mudou

`grep -rn "ACESSORIOS_DEVOLUCAO\|ACESSORIO_ROTULO\|rotuloAcessorio" src/ scripts/` → **vazio**
(exit 1). Os nomes antigos ficam registrados em `docs/` (aqui, no CHANGELOG e em `DECISOES.md`), que
é onde a arqueologia mora.

| # | Superfície | Natureza | Quem carrega o mapa |
|---|---|---|---|
| 1 | `components/ativos/linha-do-tempo.tsx` | Server Component | `ativos/[id]/page.tsx` → prop |
| 2 | `components/ativos/pendencias-item-ficha.tsx` | Server Component | idem |
| 3 | `components/pendencias/fila-pendencias-tabela.tsx` | **`'use client'`** | `pendencias/page.tsx` → prop |
| 4 | `components/relatorios/tabela-entradas.tsx` | **`'use client'`** | as **duas** rotas de relatório, com **`acesso.client`**, descendo por `CorpoRelatorio` → `CorpoRelatorioV2` |
| 5 | `components/movimentacoes/nova/resumo-revisao.ts` | módulo puro | `PassoRevisao` ← form ← `movimentacoes/nova/page.tsx` |
| 6 | `lib/ajuda/derivacao.ts` (`rotulosAcessorios`) | módulo servidor | **morreu** — a ajuda aponta o cadastro |
| 7 | `lib/termos/devolucao.ts` (`observacaoSugestao`) | módulo puro | `actions/termos.ts` |

- **A fronteira do viewer (§E.3):** `fronteira-viewer.test.ts` foi **lido antes de mexer**. Ele varre
  `queries/relatorios/*.ts` + `queries/gerados.ts` + `queries/filiais.ts` e falha se alguma
  referenciar `senhas_acesso`, `senha_tentativas` ou `auth.users`. `tipos_item` é catálogo de
  inventário e **não está entre os proibidos** — mas precisa do **client resolvido**, e é assim que
  entrou nas duas rotas. `listarTiposItem` ganhou o parâmetro de client no precedente exato de
  `listarFiliais(acesso.client)`.
- **A fronteira RSC:** o mapa é valor comum e **nunca** é importado de módulo `'use client'` — desce
  por prop a partir de um Server Component. `fronteira-rsc.test.ts` continua verde.
- **O wizard ganhou uma prop SEPARADA** (`tiposItemTodos`): o caminho de **escolha** do checklist da
  F38 fica byte a byte com só os ativos, e quem exibe **passado** (um rascunho restaurado citando um
  tipo desativado) recebe todos — sem isso, o slug cru vazaria para a tela.
- **A guarda TS↔SQL foi invertida, não apagada** (§E.5): passou a provar que os **sete slugs
  históricos** seguem no seed da `0114`, na mesma ordem e com os mesmos rótulos, com os literais no
  próprio teste — mais uma guarda-da-guarda que recusa a lista encolher em silêncio. 14 asserções.
- **A ajuda parou de enumerar** (§E.4): a frase aponta Administração › Tipos de item. A página de
  conteúdo continua sendo módulo estático sem banco.

### Os quatro testes autorizados, e só eles

Inventário completo de arquivos `*.test.ts` em `src/`, antes × depois: **134 → 137**, **zero
removidos**. Os três novos: `itens/rotulo-tipo.test.ts`, `termos/acessorios.test.ts`,
`termos/modelos-docx.test.ts`.

| Arquivo | `it()` antes | depois | removidos | o que foi |
|---|---|---|---|---|
| `lib/dominio.test.ts` | 17 | 15 | 2 | os dois casos da constante saíram com ela (§E.6 nº 1) |
| `lib/validators/tipos-item-sql.test.ts` | 8 | 8 | 2 (trocados) | a guarda invertida (§E.6 nº 2) |
| `lib/termos/devolucao.test.ts` | 12 | 15 | **0** | só assinatura + 3 casos NOVOS que provam os rótulos idênticos, slug a slug (§E.6 nº 3) |
| `components/movimentacoes/nova/resumo-revisao.test.ts` | 19 | 20 | **0** | só assinatura + 1 caso novo do fallback (§E.6 nº 4) |
| `lib/termos/preparo.test.ts` | 19 | 27 | **0** | **só acréscimo** — nenhum caso existente mudou |

⚠ `preparo.test.ts` **não** está entre os quatro autorizados, e é justo dizer por quê ele aparece
aqui: ele **cresceu** (as 8 asserções novas do aviso da §C.3 e da mescla de `acessorios`) e **nenhuma
asserção existente foi alterada ou removida**. É o regime de "testes de completude nunca enfraquecem,
só crescem" da F20, não a mudança que a §E.6 restringe.

---

## 6. A verificação em tela (§V) — o que foi feito, e onde

O `.env.local` desta máquina aponta para **produção**. A verificação de ESCRITA rodou contra o
**ENSAIO** (`sgmvldiizsrjbxzzpmhh`), pelo caminho registrado na ata da F31: `npm run dev` com as
variáveis do ensaio precedendo o `.env.local` (aqui, via `.env.development.local`, que o Next
prioriza em desenvolvimento), e o navegador dirigido contra ele com a sessão entregue por um proxy
local. **Nada disso tocou produção.**

**O que foi criado no ENSAIO, e é 100% fictício** (rastro declarado):

- `itens` 16/17/18 ganharam `tipo_id` (mouse/teclado/cabo) — os outros três seguem sem tipo, de
  propósito, para exercitar o aviso;
- uma **saída** (`aa7f8754…`) do notebook fictício `PRO0003650` para "Fulano de Tal", com 3
  lançamentos vinculados (Mouse ×2, Teclado ×1, Adaptador ×1 — este **sem tipo**);
- uma **devolução** (`47dc4eb7…`) com 2 `retorno` (Mouse, Teclado) e `itens_faltantes = ['fone']`;
- 2 termos gerados pela tela (`termos_gerados` + Storage do ensaio);
- uma senha de acesso `F39 conferencia do visualizador (ficticia)` com hash **inutilizável** (nenhuma
  senha casa com ele), criada só para forjar o cookie do viewer e **desativada ao fim**.

### O que foi conferido, e o resultado

| # | Roteiro | Resultado |
|---|---|---|
| a | Entrega com 2 tipos (um com quantidade 2) → **Gerar termo de responsabilidade** | o campo abriu com **`Mouse (2), Teclado`**, e o banner trouxe *"1 item que foi junto não tem tipo cadastrado e ficou fora do termo — classifique em Administração → Itens."* |
| b | Termo **sem** periférico | seção some; **39 `<w:p>`** no arquivo gerado — a contagem da baseline |
| c | Devolução com um "Voltou" e um "Faltou", **no mesmo papel** | `Outros componentes` = **`Mouse, Teclado`** · `Observação` = **`Não devolvido(s): Fone de ouvido`**; as duas linhas conferidas **no arquivo baixado** |
| d | Limpar o campo → gerar; digitar à mão → gerar | limpo: `dados.acessorios = ""`, `tem_acessorios = false`, **39 `<w:p>`**, cláusula ausente. Digitado: **40 `<w:p>`** e a cláusula com o texto digitado |
| e | Reabrir termo salvo | reabriu com a **chave presente-e-vazia** vencendo a sugestão — o comportamento do `mesclarCamposSalvos` |
| f | Relatório pela porta do **VISUALIZADOR POR SENHA** | rótulos: `Fone de ouvido` 1×, `Teclado` 3×, `Mouse` 3×, `Cabo` 1× · **slug cru: nenhum** |
| — | Ficha do ativo (linha do tempo + bloco de pendências) | "Itens faltantes: **Fone de ouvido**" nos dois |
| — | `/pendencias`, tema claro e escuro | rótulos do catálogo; slug histórico do seed fictício do ensaio cai no **slug cru**, que é o fallback desenhado |
| — | `/ajuda/devolucao-e-triagem` | a frase parou de enumerar e aponta o cadastro |

### ⚠ Um defeito que SÓ o navegador pegou

`mapaRotulosTipo` nascia com `Object.create(null)` — proteção contra o slug `toString` achar uma
função no `Record`. Esse mapa **atravessa a fronteira RSC como prop**, e o React recusa:

```
Only plain objects, and a few built-ins, can be passed to Client Components from Server Components.
Classes or null prototypes are not supported.
  <... rows={[...]} ehGeral={false} rotulosTipo={{carregador: ..., mochila: "Mochila", ...}} ...>
```

O render **no servidor** do relatório caía e a página degradava para render no cliente. **Nem o
`tsc`, nem o `npm run build`, nem os 2.824 testes pegavam.** Corrigido: mapa comum, e a proteção
ficou onde deveria estar desde o começo — no `hasOwnProperty` da **leitura** —, com dois testes
(os três nomes herdados; e a **forma** do mapa, que sobrevive a round-trip de JSON).

---

## 7. Revisão adversarial em contexto fresco

6 ângulos independentes sobre `d661c76..HEAD`, refutação por padrão, cada achado passando por **dois
céticos** com lentes diferentes (correção do código / requisito da ordem). **6 achados brutos.**

- **3 zeraram**: o pacote `.docx` e o script (§A), a função pura e o teto (§B), e a remoção da
  constante (§E) — nenhum achado.
- **1 refutado** pelos dois céticos: "três leituras em série no ramo devolução" — desempenho, não
  correção, e a ordem não pede otimização.
- **3 eram itens desta fase ainda em curso** (o relatório, a tag e o registro das evidências) —
  entregues neste documento e no commit final.
- **2 eram código, e foram corrigidos:**
  1. **[média]** `listarTiposItem()` **lança** em erro e entrava sem `catch` em `prepararTermo`
     (devolução). Antes da F39 esse caminho não lia banco nenhum para montar a `{observacao}`: um
     blip passaria a impedir a preparação do termo **inteiro** — quebrando o "aviso, nunca bloqueio"
     que a própria fase adota nas outras leituras novas. Agora degrada para mapa vazio e o rótulo cai
     no slug cru, que é o fallback desenhado. A mesma degradação entrou nas **quatro telas** em que a
     fase acrescentou a leitura.
  2. **[baixa]** O comentário que documentava a prova anti-truncamento citava a constante **errada**:
     `MAX_LINHAS_LOTE_ITEM` é do carrinho de `/itens`, fluxo que nem grava `movimentacao_id`. Quem
     limita este caminho é `MAX_ITENS_JUNTO` (20), teto do **lote inteiro** — não "por movimentação",
     como o texto dizia. A garantia numérica se sustentava (20 termos × 20 linhas no pior caso); a
     justificativa escrita, não.

---

## 8. Portões

| Portão | Baseline | Depois |
|---|---|---|
| `npm run lint` | exit 0 | **exit 0** |
| `npm run test` | 137 arquivos / **2.748** testes | **140 arquivos / 2.825 testes** (+77) |
| `npm run build` | exit 0 | **exit 0** |
| `git diff -- supabase/` | — | **vazio** |
| `package.json` | — | **só a linha `version`** (`1.43.1` → `1.44.0`); nenhuma dependência |
| Testes existentes removidos | — | **zero arquivos**; `it()` removidos só nos dois autorizados da §E.6 |
| CI | — | **verde** nos dois jobs (`banco` e `verificar`) |
| Deploy | — | **READY** em produção (Vercel, target `production`) |
| Smoke pós-deploy | — | **102 OK · 1 aviso · 1 n/a · 0 falha** |

**Sobre o job `banco` e a regra F17:** esta fase **não toca função nem trigger** — `git diff --
supabase/` é vazio. Logo a regra F17 (rodar os roteiros SQL depois de recriar função) **não se
aplica**, e nenhum roteiro foi rodado por hábito. O job `banco` roda de qualquer forma no CI, e
passou.

**O aviso e o n/a do smoke são pré-existentes e não têm relação com esta fase:** `kits_modelos ·
anon NÃO lê (RLS) — anon leu 0 linhas, mas não há kit cadastrado` (a RLS não fica comprovada por
falta de dado) e `rel_saldo_colaborador — nenhum colaborador cadastrado ainda` (a fila de 903 nomes
da F37, pendência nº 6 da F38).

---

## 9. Onde estão os arquivos que o Johnny precisa olhar

**`docs/f39-evidencias/`**, com um `README.md` próprio:

| Pasta | O que é |
|---|---|
| `baseline/` | os 5 modelos **de antes da fase**, renderizados com o payload fictício |
| `novo-sem-acessorios/` | os 5 modelos **novos**, com `tem_acessorios` falso |
| `novo-com-acessorios/` | os 5 modelos **novos**, com a linha `Fone de ouvido, Mouse (2), Teclado, Mochila` |
| `ensaio-ponta-a-ponta/` | os 2 termos que a **tela** gerou no ensaio: o de responsabilidade com `Mouse (2), Teclado` e o de devolução com as duas linhas |

O par a olhar lado a lado é **`baseline/` × `novo-sem-acessorios/`**: eles são o mesmo documento
(byte a byte). **A conferência que só o olho faz é a de `novo-com-acessorios/`** — a diagramação da
cláusula quando há periférico. Sem conversor de PDF na máquina, é no **Word**.

Payload 100% fictício em todos: "Fulano de Tal", `WAP0001234`, "Cidade Fictícia", "Marca Fictícia".

---

## 10. Pendências que esta fase deixa nomeadas

1. **A conferência VISUAL da cláusula com acessório** continua pendente de olho humano — é a única
   coisa que a prova mecânica não alcança. Arquivos na §9.
2. **`comment on column public.tipos_item.slug` (`0114`) ficou FALSO** e esta fase **não conserta**:
   ele diz *"Espelhado em ACESSORIOS_DEVOLUCAO (src/lib/dominio.ts) com guarda TS↔SQL"*, e a
   constante não existe mais. Corrigir exige migration, e o escopo manda `git diff supabase/` vazio.
   **A frase certa, pronta para quem pegar a próxima migration:**
   > `'Código estável, minúsculo, sem acento. FONTE ÚNICA do vocabulário desde a F39 — o espelho em src/lib/dominio.ts foi removido. Os SETE slugs históricos (carregador, mochila, mouse, teclado, mousepad, fone, cabo) são protegidos por src/lib/validators/tipos-item-sql.test.ts, que recusa o seed divergir deles.'`
3. **`npm run db:types` não sai sem diff, e é anterior a esta fase** (§1): a tabela
   `_bkp_relatorios_gerados_f6a` existe **só em produção** e não está em migration nenhuma (resíduo
   da F6A — candidata a `drop` numa migration futura, com backup antes), e o gerador perde o `| null`
   de `p_observacao` em duas RPCs (defeito conhecido do CLI). Esta fase **não acrescentou diff**.
4. **Produção ainda não produz linha de acessório**: 0 lançamentos com `movimentacao_id` e 7 de 18
   itens com tipo. Os 11 sem tipo serão descartados da linha (com aviso) na primeira entrega
   registrada pelo caminho novo. Classificar os 11 em Administração → Itens é trabalho de cadastro.
5. **O caso "ponte sem item" não é detectável no servidor** (§4): num lote homogêneo, tipo marcado
   "Voltou" cuja ponte não resolveu item é indistinguível de "nada acompanhou". Fechá-lo exigiria
   gravar o que foi MARCADO (e não só o que foi lançado) — coluna nova, portanto migration, portanto
   outra fase.
6. **`termos.ts` cresceu de 832 para 918 linhas** (item **L** da `docs/DIVIDA-TECNICA.md`). O
   julgamento foi para módulos puros e a leitura para `queries/`, como a dívida pede; ainda assim,
   cresceu.
7. **Artefatos fictícios deixados no ENSAIO** (§6), declarados e não limpos: os `tipo_id` nos itens
   16/17/18, as duas movimentações fictícias, os 2 termos gerados e a senha de acesso **desativada**.
   Somem com um `db:reset`/`db:seed` no ensaio quando o Johnny quiser.

---

## 11. O que este relatório NÃO prova

- **Não prova que a cláusula ficou bem diagramada na página quando há acessório.** Prova que só ela
  mudou, que ela sai inteira com o texto aprovado, e que o `w:pPr` aplicado é o do vizinho sem o
  `numPr`. Beleza de página é olho humano, e não houve PDF.
- **Não prova nada em produção sobre o caminho COM periférico** — ele não existe lá: zero
  lançamentos vinculados. O que está provado em produção é o caminho **sem** periférico, que é o de
  todo termo emitido hoje, e é exatamente o que o critério 2 protege (o documento não mudou).
- **Não prova as duas exclusões (`estorna_id`, `pendencia_item_id`) em tela.** O dado de hoje não
  produz esses casos — a `0119` nem grava `movimentacao_id` nos lançamentos de pendência. A prova é
  de **teste**, alimentando o leitor com linhas marcadas; dizer que foi de tela seria autoverificação
  desonesta.
- **Não prova o aviso de "conferido sem lançamento" em tela.** Ele exige um lote misto de verdade
  (filiais ou detentores diferentes) numa devolução com checklist; o roteiro do ensaio usou um ativo
  só. A regra é provada por 7 testes da função pura, e o reuso de `checklistPodeLancar` é o que
  garante que ela não divirja da tela.
- **Não prova que nenhum outro rótulo do sistema mudou** além dos que foram olhados. A prova
  estrutural é o `grep` vazio mais a igualdade dos rótulos nos testes das superfícies; a prova visual
  cobriu quatro superfícies (linha do tempo, pendências da ficha, fila e relatório), não as sete.
- **Não prova comportamento sob falha do banco.** As leituras novas degradam por desenho (e a
  revisão adversarial fechou a que não degradava), mas o caminho de erro não foi exercitado.
- **Não mede desempenho.** A consulta nova é uma a mais por preparação de termo, limitada pelo
  schema; nenhuma curva foi levantada, e nenhuma era pedida.
