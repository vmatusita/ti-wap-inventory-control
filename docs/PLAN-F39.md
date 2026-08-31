# PLAN — F39 · O termo diz o que foi junto

Plano autossuficiente da ordem `docs/prompts/F39-termo-diz-o-que-foi-junto-ultracode.md`.
Tudo aqui foi **medido** em 29/08/2026 no repositório e nos dois bancos, não presumido.

---

## 0. Baseline medida (§V)

| Medida | Valor |
|--------|-------|
| `git rev-parse HEAD` | `d661c769cf99b1a59994e3eacab7981356b58a1d` |
| `package.json version` | `1.43.1` |
| última migration | `0123_ordem_dos_itens_do_lote.sql` |
| `npm run lint` | exit 0, sem avisos |
| `npm run test` | **137 arquivos / 2748 testes**, exit 0 |
| `npm run build` | exit 0 |
| `git status` | só `docs/prompts/F39-…md` (insumo da fase) |

`sha256` dos 7 `.docx` (baseline):

```
5cebacff6bd8ba35b3402b9c835100bb01ba2743af4a6c2b42ba2e676b367241  devolucao-desligamento.docx
e8eedaf7318f1ba04e7065664e2262ecdfa1ecb2e1b3e88319d5969896f10226  devolucao-equipamento.docx
c53365ec216938937659720b563f9156463d4f0f0d3865b850857afbed19b514  responsabilidade-celular.docx
deed0a3ac75a63ebc2a1da28b681d76546fc33903f7752053b3917bcc8a82069  responsabilidade-desktop.docx
2448679f5813946c8e49163828608f8aaaff9cf7ead8814d07b0e1708499ebdb  responsabilidade-monitor-homeoffice.docx
3c081056c29b0b8ad851736914d4f1d500bc670068b83f8792b6bcc7fbad1b15  responsabilidade-monitor-interno.docx
79e3b8886cd4350bc0071f7b036f50795bf9ca42f18a13260b92aeca4c885ff3  responsabilidade-notebook.docx
```

**`npm run db:types` NÃO sai sem diff hoje — e isso é anterior a esta fase.** Medido nos dois projetos:

- contra **produção** (`pbtjcalbmepmrqzprusb`): +35 −2 — aparece a tabela de backup
  `_bkp_relatorios_gerados_f6a` (que existe só em produção, resíduo da F6A) e some o `| null`
  de `p_observacao` em duas RPCs;
- contra **ensaio** (`sgmvldiizsrjbxzzpmhh`): +2 −2 — só a perda de nullability de `p_observacao`
  (o defeito conhecido do gerador, já registrado na memória do projeto).

A régua desta fase é: **a F39 não acrescenta diff nenhum** — nenhuma migration, nenhum schema.
O `database.ts` foi restaurado para o do HEAD depois da medição.

Contagens só-leitura em **produção** (critério 9), refeitas em 29/08/2026:

| Medida | Valor |
|--------|-------|
| `itens` total | 18 |
| `itens` com `tipo_id` | **7** |
| `lancamentos_item` total | 30 |
| `lancamentos_item` com `movimentacao_id` | **0** |
| `lancamentos_item` com `pendencia_item_id` | 0 |
| `tipos_item` (todos / ativos) | 7 / 7 |
| `movimentacoes` | 3430 |
| `termos_gerados` | 63 |

**Consequência a escrever no relatório:** com zero lançamento vinculado, **nenhuma movimentação
existente em produção produz linha de acessório hoje**. A fase se prova no ensaio e nos testes.

**Conversor de PDF: não existe nesta máquina.** `soffice`, `libreoffice` e `pandoc` — os três
`command not found`, e não há `soffice.exe` em `C:\Program Files[ (x86)]\LibreOffice\program\`.
Nada será instalado (custo R$ 0, stack fechada): as evidências ficam em `.docx`.

---

## 1. §A — Os 5 `.docx`

### 1.1 Âncora medida em cada modelo (texto do `<w:p>`, decodificado dos `<w:t>`)

| Modelo | Âncora (texto exato) | idx | total `<w:p>` | `numId`/`ilvl` | `pStyle` |
|--------|----------------------|-----|---------------|----------------|----------|
| `responsabilidade-notebook` | `NÚMERO DO CHAMADO: {chamado}` | 11 | 39 | 2 / 0 | `PargrafodaLista` |
| `responsabilidade-desktop` | `NÚMERO DO CHAMADO: {chamado}` | 11 | 44 | 1 / 0 | `PargrafodaLista` |
| `responsabilidade-monitor-interno` | `NÚMERO DO CHAMADO: {chamado}` | 10 | 33 | 1 / 0 | `PargrafodaLista` |
| `responsabilidade-monitor-homeoffice` | `Número do Chamado: {chamado}` | 11 | 33 | 36 / **1** | **nenhum** |
| `responsabilidade-celular` | `OBS: {obs}` | 14 | 36 | 1 / 0 | `PargrafodaLista` |

⚠ No **celular** o `{chamado}` existe (idx 10) mas **não** fecha o bloco: telefone, IMEI, Pulsus e
OBS vêm depois. A âncora é `OBS: {obs}`.

O script ancora pelo **texto** do parágrafo, nunca pelo índice.

### 1.2 A marcação inserida — três `<w:p>`, logo depois da âncora

```xml
<w:p><w:r><w:t>{#tem_acessorios}</w:t></w:r></w:p>
<w:p>{PPR_SEM_NUMPR}<w:r>{RPR_NEGRITO}<w:t xml:space="preserve">Acompanham o equipamento os seguintes acessórios e periféricos: </w:t></w:r><w:r>{RPR_CLONE}<w:t>{acessorios}</w:t></w:r></w:p>
<w:p><w:r><w:t>{/tem_acessorios}</w:t></w:r></w:p>
```

- **Por que três.** Confirmado na doc oficial do docxtemplater (Context7, 29/08/2026,
  `docxtemplater.com/docs/configuration`): com `paragraphLoop: true`, *"if both the opening and
  closing loop tags are on separate paragraphs with no other content, the library treats the loop
  as a paragraph loop … removing the original paragraphs containing the tags"*. Abrir e fechar
  **dentro** do mesmo parágrafo apagaria o texto e deixaria o parágrafo — o defeito proibido
  pelo D10. A mesma página avisa que o recurso falha com espaço sobrando no parágrafo da tag:
  por isso as tags entram **sozinhas**, sem `pPr` e sem espaço.
- `{PPR_SEM_NUMPR}` = o `w:pPr` da âncora do **próprio arquivo**, com o `<w:numPr>…</w:numPr>`
  removido (§A.3). A cláusula é frase, não campo da lista numerada — sem isso ela viraria um item
  numerado ao lado de "MARCA"/"MODELO". Sem `numPr` não há marcador órfão: o que sobra é o recuo
  do `pStyle` (nos 4 que o têm) ou nenhum recuo (home office, que não tem `pStyle`).
- `{RPR_CLONE}` = o `w:rPr` do run da âncora, clonado inteiro.
- `{RPR_NEGRITO}` = o mesmo `w:rPr`, com `<w:b/><w:bCs/>` inserido **logo após** o `<w:rFonts …/>`
  (posição exigida pela ordem do schema `CT_RPr`). O negrito não é inventado: `<w:b/><w:bCs/>`
  existe nos 5 modelos (o rótulo do equipamento — "Notebook", "Celular" — usa exatamente
  `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:bCs/></w:rPr>`).
  Medido: nenhum run do bloco de identificação tem `<w:b/>` — o negrito vem do vizinho de cima.

### 1.3 As provas que o script imprime, por modelo

1. conjunto de partes do pacote idêntico antes/depois, **uma** parte divergente: `word/document.xml`;
2. **round-trip invertido para inserção**: removendo do XML novo exatamente o trecho inserido,
   volta-se **byte a byte** ao XML anterior;
3. contagem de `<w:p>`: **+3**, nem mais nem menos;
4. cláusula de **foro** contada antes/depois, igual. ⚠ Medido: `"Comarca de São José dos Pinhais"`
   dá **0 no XML cru** nos 7 modelos — a frase está partida em runs. O que se conta é
   `São José dos Pinhais/PR` (run único, a mesma constante `FORO` do `retaguear-cidade.mjs`),
   **e também** a frase inteira no TEXTO decodificado;
5. linha da assinatura `{cidade}, {data_extenso}` contada antes/depois, igual;
6. `sha256` do arquivo antes → depois;
7. **idempotência**: modelo já tratado imprime "já inserido — nada a fazer" e não grava;
8. **recusa nominal**: só os 5 nomes de responsabilidade. Qualquer outro `.docx` na pasta é
   recusado (⚠ isto é mais estrito que o `retaguear-cidade.mjs`, que percorre a pasta inteira e
   filtra por conteúdo — aqui a ordem exige recusa por nome);
9. **o `w:pPr` aplicado, declarado por modelo** (`pStyle`, `numPr`, `ind`, `jc`) — a única prova
   mecânica do caso **com** acessório.

Modo conferência por padrão; grava só com `--aplicar`. Saída ≠ 0 em qualquer divergência.

### 1.4 Evidências (`docs/f39-evidencias/`)

Script `scripts/termos/evidencias-acessorios.mjs`: renderiza, com **payload 100% fictício**
(`WAP0001234`, "Fulano de Tal", "Filial Fictícia"):

- os 5 modelos **novos** com acessórios (`ANTES`… não: `novo-com-acessorios/`);
- os 5 modelos **novos** sem acessórios (`novo-sem-acessorios/`);
- os 5 modelos **da baseline** (`git show d661c76:src/templates/termos/<arquivo>`) com o **mesmo**
  payload (`baseline/`). ⚠ `HEAD` não serve — depois do commit dos `.docx` novos devolveria o
  arquivo novo.

E imprime o **critério 2**: texto extraído idêntico e contagem de `<w:p>` igual entre
`novo-sem-acessorios` e `baseline`.

Sem conversor de PDF, a conferência visual do Johnny é no Word, a partir desses `.docx`.

### 1.5 §A.5 — a guarda de tags

`src/templates/termos/tags.test.ts`: abre os 7 `.docx` com `pizzip` e confere o **conjunto de
tags** extraído do **TEXTO** (concatenação dos `<w:t>`), nunca do XML cru.

⚠ Motivo medido: `matchAll(/\{[^{}]*\}/g)` sobre o XML cru captura
`{28A0092B-C50C-407E-A947-70E740481C1C}` (atributo `<a:ext uri=…>` de DrawingML) em **3** dos 5
modelos — celular, monitor-interno e notebook.

Conjuntos esperados (medidos hoje, mais as tags novas):

| Modelo | Tags |
|--------|------|
| notebook · desktop · monitor-interno · monitor-homeoffice | `chamado cidade colaborador data_extenso marca modelo patrimonio service_tag` **+ `acessorios` `tem_acessorios`** |
| celular | as acima + `imei obs pulsus telefone` **+ `acessorios` `tem_acessorios`** |
| devolucao-equipamento · devolucao-desligamento | `cidade colaborador data_extenso data_mes_ano descricao marcas_modelos observacao outros_componentes patrimonios series tecnico` — **sem** as novas |

---

## 2. §B — `src/lib/termos/acessorios.ts` (função pura)

```ts
export type LancamentoDeAcessorio = { tipo_id: number | null; quantidade: number }
export type TipoDeAcessorio = { id: number; rotulo: string; ordem: number }
export type LinhaDeAcessorios = { linha: string; descartados: number }

export function montarLinhaDeAcessorios(
  lancamentos: readonly LancamentoDeAcessorio[],
  tipos: readonly TipoDeAcessorio[],
  limite: number,
): LinhaDeAcessorios
```

Regras:

- agrupa por `tipo_id`, **soma** `quantidade`;
- ordena por `tipo.ordem`; empate por `rotulo.localeCompare(pt-BR)`; empate residual por `id`
  (ordem total — sem isso o mesmo lote geraria linhas diferentes em chamadas diferentes);
- soma `1` → `Rótulo`; soma `> 1` → `Rótulo (N)`;
- junta com `, `;
- **descarta** lançamento sem `tipo_id` **e** lançamento cujo `tipo_id` não existe no catálogo
  recebido, contando **linhas de lançamento** em `descartados`;
- **tipo desativado ENTRA** — quem chama passa o catálogo completo; a função não conhece `ativo`;
- **teto**: se a linha passar de `limite`, corta no último item **inteiro** que cabe e acrescenta
  ` e mais N`, com o resultado **dentro** do limite;
- quantidade `<= 0` não entra (defensivo: um inverso nunca deveria chegar aqui, mas somar
  negativo produziria `Mouse (-1)` num papel assinado).

Teste `acessorios.test.ts`: vazio; sem tipo descartado com contagem; soma de quantidades; ordem
pela `ordem`; tipo desativado presente; corte com ` e mais N` nos **dois** limites (600 e 400);
determinismo (mesma entrada embaralhada → mesma linha).

---

## 3. §C — Preenchimento

### 3.1 Zod e diálogo

- `camposTermoSchema` ganha `acessorios: z.string().max(600)` (chaves fechadas, `.partial()`).
- `gerar-termo-dialog.tsx`: `CAMPOS_RESP` ganha `{ chave: 'acessorios', rotulo: 'Acessórios que
  acompanham', multi: true }`. Editável como todo campo (§3.9 do PLANO-TERMOS).

### 3.2 O leitor novo (`src/lib/queries/itens.ts`)

```ts
export type AcessoriosDaMovimentacao = {
  lancamentos: LancamentoDeAcessorio[]
  tipos: TipoDeAcessorio[]
}

export async function acessoriosDasMovimentacoes(
  movimentacaoIds: string[],
  tipo: 'saida' | 'retorno',
): Promise<AcessoriosDaMovimentacao>
```

Uma consulta, com o tipo embutido:

```
.from('lancamentos_item')
.select('quantidade, itens!inner(tipo_id, tipos_item(id, rotulo, ordem))')
.in('movimentacao_id', movimentacaoIds)
.eq('tipo', tipo)
.is('estorna_id', null)
.is('pendencia_item_id', null)
```

**Sem risco de truncamento:** `prepararTermoSchema.movimentacaoIds` é `.max(20)` e cada
movimentação carrega no máximo `MAX_LINHAS_LOTE_ITEM` linhas — o resultado é limitado pelo schema,
não por um `limit` implícito.

**As duas exclusões, conferidas no SQL hoje (não presumidas):**

- `estorna_id is null` — `estornar_movimentacao_com_itens` (`0121`, corpo vigente na `0122`)
  grava o inverso com `movimentacao_id = v_novo`, **a movimentação DE ESTORNO** (está escrito no
  comentário do `v_novo`, linhas 135‑137). Filtrar pela movimentação do termo já deixa o inverso
  de fora; esta exclusão é o **cinto** para o caso de se preparar termo sobre a própria
  movimentação de estorno.
- `pendencia_item_id is null` — o `insert` de `resolver_pendencias_item_com_lancamentos`
  (`0119`, linhas 177‑191 e 202‑216) grava
  `item_id, filial_id, tipo, quantidade, data, colaborador, colaborador_id, observacao,
  pendencia_item_id, criado_por` — **`movimentacao_id` NÃO está na lista**. O filtro é
  **redundante hoje**; entra porque declara a intenção e sobrevive ao dia em que alguém vincular.

### 3.3 `prepararTermo`

- **responsabilidade:** `acessoriosDasMovimentacoes([movs[0].id], 'saida')` → `montarLinhaDeAcessorios(…, 600)`
  → `campos.acessorios`.
- **devolução:** `acessoriosDasMovimentacoes(movs.map(m => m.id), 'retorno')` → `montarLinhaDeAcessorios(…, 400)`
  → `campos.outros_componentes` (deixa de ser `''` literal).
- `{observacao}` **não muda**: continua `observacaoSugestao(itensFaltantes)`.

### 3.4 Avisos (§C.3) — aviso, nunca bloqueio

1. `descartados > 0` →
   *"N item(ns) que foram junto não têm tipo cadastrado e ficaram fora do termo — classifique em
   Administração → Itens."*
2. **Conferido mas sem lançamento** (só na família devolução) →
   *"Houve item conferido nesta devolução que não gerou lançamento de estoque — confira a linha de
   componentes antes de gerar."*

   **Critério escolhido, e ele vai para a ata** (a ordem manda registrar): o servidor **não tem**
   registro do que foi marcado "Voltou" e não virou lançamento. O que ele consegue saber é o
   **lote misto** — a mesma condição que desliga o lançamento em `checklistPodeLancar`
   (filiais diferentes **ou** detentores diferentes). Aviso quando, ao mesmo tempo:
   - o lote é misto pelo critério de `checklistPodeLancar` (filial ou detentor do lote divergindo), **e**
   - a linha de `outros_componentes` saiu **vazia**.

   Vazio + lote misto é exatamente o caso em que o papel afirmaria em silêncio que nada
   acompanhou. Lote homogêneo com linha vazia não avisa: ali "nada voltou" é a leitura honesta.
   ⚠ O caso "ponte não resolve item" (`ponte-tipo-item.ts`) **não** é detectável no servidor a
   partir do que ficou gravado — vai declarado como limite no relatório.

### 3.5 `tem_acessorios` (§C.4)

Em `gerarTermo`, ao lado de `data_extenso`/`data_mes_ano`:

```ts
tem_acessorios: (campos.acessorios ?? '').trim().length > 0
```

Deriva do **texto final** — nunca do que o banco leu. Apagar o campo faz a seção sumir; digitar à
mão faz aparecer. `DadosTermo` ganha o campo; `termos_gerados.dados` (jsonb) registra o que foi
renderizado, sem migration.

⚠ **Os 2 modelos de devolução não têm `{#tem_acessorios}`** — passar a chave a mais é inofensivo
(docxtemplater ignora dado sem tag), e é o mesmo que já acontece hoje com `data_mes_ano` nos 5 de
responsabilidade.

### 3.6 Termo antigo (§C.5)

`mesclarCamposSalvos` já resolve: chave ausente → sugestão de hoje; chave presente-e-vazia →
vence. Nada a mudar; entra como teste.

---

## 4. §E — A constante sai

### 4.1 O módulo novo

`src/lib/itens/rotulo-tipo.ts` — **puro**, sem banco:

```ts
export type MapaRotulosTipo = Readonly<Record<string, string>>
export function mapaRotulosTipo(tipos: readonly { slug: string; rotulo: string }[]): MapaRotulosTipo
export function rotuloTipoItem(slug: string, mapa: MapaRotulosTipo): string  // ?? slug
```

`listarTiposItem` ganha o parâmetro de client, **no precedente exato de `listarFiliais(client)`**:

```ts
export async function listarTiposItem(client?: DbClient): Promise<TipoItem[]>
```

### 4.2 As sete superfícies — quem passa o mapa a quem

| # | Arquivo | Natureza | Quem carrega o mapa |
|---|---------|----------|---------------------|
| 1 | `components/ativos/linha-do-tempo.tsx` | Server Component | `app/(app)/ativos/[id]/page.tsx` → prop `rotulosTipo` |
| 2 | `components/ativos/pendencias-item-ficha.tsx` | Server Component | idem, mesma página |
| 3 | `components/pendencias/fila-pendencias-tabela.tsx` | **`'use client'`** | `app/(app)/pendencias/page.tsx` → prop |
| 4 | `components/relatorios/tabela-entradas.tsx` | **`'use client'`** | `relatorios/[filial]/page.tsx` **e** `relatorios/gerados/[id]/page.tsx`, ambos com `listarTiposItem(acesso.client)`, descendo por `CorpoRelatorio` → `CorpoRelatorioV2` → `TabelaEntradas` |
| 5 | `components/movimentacoes/nova/resumo-revisao.ts` | módulo puro | `montarResumoConfig(config, { …, rotulosTipo })`, vindo de `PassoRevisao` ← `nova-movimentacao-form.tsx` ← `movimentacoes/nova/page.tsx` |
| 6 | `lib/ajuda/derivacao.ts` (`rotulosAcessorios`) | módulo servidor | **morre** — ver §4.4 |
| 7 | `lib/termos/devolucao.ts` (`observacaoSugestao`) | módulo puro | `actions/termos.ts` carrega `listarTiposItem()` e passa o mapa |

**Fronteira RSC:** o mapa é um valor comum. Ele **nunca** é importado de módulo `'use client'` —
sempre desce por prop a partir de um Server Component. É o que `fronteira-rsc.test.ts` vigia.

**Fronteira do viewer (§E.3):** `relatorios/[filial]/page.tsx` já resolve
`resolverAcessoRelatorio()`; a leitura nova entra no mesmo `Promise.all`, com **`acesso.client`**.
Com `createClient()` o viewer (service_role) leria vazio e o relatório impresso sairia com slug
cru. `fronteira-viewer.test.ts` foi lido: ele proíbe `senhas_acesso`, `senha_tentativas` e
`auth.users` nas queries de relatório — `tipos_item` é catálogo de inventário e não está entre os
proibidos. Isso vai dito no relatório.

**`movimentacoes/nova/page.tsx`:** hoje carrega `listarTiposItemAtivos()` (escolha). Ganha
**também** `listarTiposItem()` (todos), passado como prop separada `tiposItemTodos`, usada **só**
para rótulo no resumo. Assim o caminho de ESCOLHA da F38 fica byte a byte, e um rascunho
restaurado com tipo desativado continua exibindo o rótulo — que é a régua da §E.

### 4.3 §E.5 — a guarda TS↔SQL invertida

`src/lib/validators/tipos-item-sql.test.ts` passa a provar, **sem lado TS**, que o seed da `0114`
mantém os **7 slugs históricos** — `carregador`, `mochila`, `mouse`, `teclado`, `mousepad`,
`fone`, `cabo` — **na mesma ordem** e com os **mesmos rótulos** (`Carregador`, `Mochila`, `Mouse`,
`Teclado`, `Mousepad`, `Fone de ouvido`, `Cabo`), lidos do arquivo da migration. São eles que
`movimentacoes.itens_faltantes` e `pendencias_item.item` citam em produção. Os literais esperados
passam a viver **no próprio teste** — é ele o guardião do histórico.

### 4.4 §E.4 — a ajuda para de enumerar

`rotulosAcessorios()` morre junto com a constante. A frase de
`lib/ajuda/conteudo/devolucao-e-triagem.ts` passa a **apontar o cadastro** (a página é módulo
estático, sem banco — nada de leitura assíncrona, nada de mover a lista para dentro dela).

### 4.5 §E.6 — os quatro testes que podem mudar, e só eles

1. `lib/dominio.test.ts` — os casos da constante saem com ela;
2. `lib/validators/tipos-item-sql.test.ts` — a guarda invertida;
3. `lib/termos/devolucao.test.ts` — **só assinatura**; rótulos esperados idênticos;
4. `components/movimentacoes/nova/resumo-revisao.test.ts` — **só assinatura**; idem.

**Nenhum outro teste muda.** Se outro quebrar, é rótulo mudando de verdade → conserta-se a causa.

---

## 5. Ordem de execução (incrementos, com portão em cada um)

1. **§B** — função pura + testes.
2. **§A** — script + os 5 `.docx` + evidências + guarda de tags.
3. **§C** — Zod, leitor, `prepararTermo`, diálogo, `tem_acessorios`.
4. **§D** — devolução (`outros_componentes`).
5. **§E** — remoção da constante nas 7 superfícies.
6. **§F** — versão `1.44.0`, CHANGELOG, registry, tag, documentação, relatório.

`npm run lint && npm run test && npm run build` a cada incremento.

---

## 6. O que esta fase NÃO toca

Banco (zero migration), os 2 `.docx` de devolução, a cláusula de foro, a linha da assinatura,
`{marca}`/`{modelo}`/`{service_tag}`/`{patrimonio}`, `{observacao}`/`observacaoSugestao`
(comportamento), o fluxo de itens da F38, `termos_gerados`/Storage/`.docx` já gerados,
máquina de estados, modelo de acesso, `src/components/ui/**`, dependência nova.
