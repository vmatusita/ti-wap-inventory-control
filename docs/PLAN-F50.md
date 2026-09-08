# PLAN-F50 — A fronteira da leitura

Plano de execução da F50, escrito **antes** de tocar em código, com os números **medidos** nesta
sessão (08/09/2026) e as seis decisões obrigatórias já tomadas. Onde a medição contraria a ficha do
`docs/PLANO-MULTIEMPRESA.md §5` ou o prompt da ordem, **a medição vale** e a divergência está escrita.

Estado de partida medido: `npm run test` → **162 arquivos, 4125 testes, verde**; `npx tsc --noEmit`
→ vazio, exit 0; `package.json` em **1.54.0**; última migration no repositório: **0128** (sem aplicar).

---

## 1. A superfície do viewer, medida pela ASSINATURA

Detector: para cada `.ts` não-teste de `src/lib/queries/**`, toda função **nomeada** cujo parâmetro
seja tipado como client Supabase resolvido, cruzada com o conjunto de nomes **exportados** do arquivo.

**Três formas de aceitar client, não duas** (a ficha só previa as duas primeiras):

1. `client?: SupabaseClient<Database>` — 1 arquivo (`tipos-item.ts`)
2. alias `DbClient` — 11 arquivos. ⚠ Há **três declarações independentes** do mesmo alias:
   `queries/relatorios/comum.ts:11`, `lib/auth/acesso.ts:12`, `queries/import-logs.ts:12`.
3. `Awaited<ReturnType<typeof createClient>>` — 3 arquivos (`ativos.ts`, `colaboradores.ts`,
   `itens.ts`). **Forma que a ficha não previa**, e estruturalmente idêntica às outras: um
   `acesso.client` é atribuível a esse parâmetro.

### 1.1 A armadilha que redesenhou o detector

`listarFiliais` — justamente o arquivo que a F49 declarou **à mão** na superfície — não é
`export function`. É:

```ts
export const listarFiliais = cache(async function listarFiliais(
  client?: SupabaseClient<Database>,
): Promise<Filial[]> {
```

Um detector por `/export\s+(?:async\s+)?function/` **não o vê**. Medido: com esse regex ingênuo a
varredura devolve **13** arquivos e perde `filiais.ts`. O detector que vale coleta os nomes
exportados (`export const|let|var`, `export function`, `export { … }`) e cruza com as funções
nomeadas que recebem client — assim `cache(async function listarFiliais(…))` entra.

### 1.2 Os 14 arquivos e o destino de cada um

**14 arquivos, 31 funções exportadas.** A ficha dizia 12 e o prompt repetia 12: **os dois erram**.

| # | Arquivo | Funções exportadas c/ client | Destino | Motivo MEDIDO |
|---|---|---|---|---|
| 1 | `queries/relatorios/comum.ts` | `resolverFilialPorSlug` | **SUPERFÍCIE** | `[filial]/page.tsx:102` com `acesso.client` |
| 2 | `queries/relatorios/estoque.ts` | 5 | **SUPERFÍCIE** | transitiva por `getSnapshotRelatorioV2` |
| 3 | `queries/relatorios/itens.ts` | 2 | **SUPERFÍCIE** | idem |
| 4 | `queries/relatorios/movimentacoes.ts` | 5 | **SUPERFÍCIE** | idem |
| 5 | `queries/relatorios/pendencias.ts` | `getPendencias` | **SUPERFÍCIE** | idem |
| 6 | `queries/relatorios/snapshot.ts` | `getSnapshotRelatorioV2` | **SUPERFÍCIE** | `[filial]/page.tsx:126` com `acesso.client` |
| 7 | `queries/gerados.ts` | 3 | **SUPERFÍCIE** | `gerados/page.tsx:75`, `gerados/[id]/page.tsx:41,63` |
| 8 | `queries/filiais.ts` | `listarFiliais` | **SUPERFÍCIE** | `gerados/page.tsx:74`, `[filial]/page.tsx:124` |
| 9 | `queries/tipos-item.ts` | `listarTiposItem` | **SUPERFÍCIE (entra hoje)** | `[filial]/page.tsx:131`, `gerados/[id]/page.tsx:57` |
| 10 | `queries/conflitos.ts` | 3 | **EXCEÇÃO** | `pendencias/page.tsx:181` e `actions/conflitos.ts:172,239,240` — client de sessão, nunca `acesso.client` |
| 11 | `queries/import-logs.ts` | 4 | **EXCEÇÃO** | `actions/importar.ts` e `admin/importar/page.tsx:35` |
| 12 | `queries/ativos.ts` | `patrimoniosDuplicados` | **EXCEÇÃO** | `queries/movimentacoes.ts:285` (interno) e rota `/ativos` |
| 13 | `queries/colaboradores.ts` | `resolverColaboradoresPorNome` | **EXCEÇÃO** | só Server Actions (`colaboradores.ts:382`, `itens.ts:105`, `movimentacoes.ts`) |
| 14 | `queries/itens.ts` | `saldosPorColaborador`, `acessoriosDasMovimentacoes` | **EXCEÇÃO** | só Server Actions (`itens.ts:127`, `movimentacoes.ts:515`, `termos.ts:262,360`) |

**Prova de que nenhuma exceção é alcançada:** a superfície inteira importa de `@/lib/queries/`
apenas `filiais`, `relatorios` (index) e `rpc-filial` — nenhum dos cinco arquivos de exceção.

### 1.3 `pendencias-detalhe.ts` NÃO é arrastado — a ficha erra

A ficha e o prompt o listam entre os quatro arrastados. **Medido: não é.** As três funções
**exportadas** (`contarPendenciasAbertas:119`, `listarPendencias:250`, `listarPendenciasParaExport:298`)
fazem `const client = await createClient()` internamente. Quem recebe `client: DbClient` são duas
funções **internas não exportadas** (`buscarServiceTags:179`, `queryPendencias:195`) — e é exatamente
essa distinção que dá valor à regra: *exportada* é o que forma superfície.

Mesmo caso, também medido: `eventos-admin.ts` (`query`) e `movimentacoes.ts` (`queryLista`).

### 1.4 As listas brancas

**9 tabelas** (uma delas VIEW) e **7 RPCs** — o número da ficha bate, mas por um caminho que ela não
explicita: a superfície de **hoje** tem **8** tabelas; a nona (`tipos_item`) só existe porque
`tipos-item.ts` entra.

Tabelas: `anotacoes`, `ativos`, `filiais`, `itens`, `lancamentos_item`, `movimentacoes`,
`relatorios_gerados`, `tipos_item`, `v_fila_pendencias` (**view**, `0052_pendencias_item_leitura.sql:67`).

RPCs: `rel_estoque_asof`, `rel_frescor_itens`, `rel_mov_itens`, `rel_mov_por_mes`, `rel_por_motivo`,
`rel_resumo`, `rel_saldo_itens`.

⚠ **Armadilha do varredor, medida:** um regex ingênuo `\.from\(` captura `Array.from({ length: … })`
em `comum.ts`. A lista branca casa **só** `.from('literal')` / `.rpc('literal')`, e qualquer argumento
**não-literal** (variável, template, concatenação) reprova por si — é o furo que uma lista branca teria.

---

## 2. O confinamento: por que o fecho PURO seria trocar a rede por um furo

Superfície de hoje: **46 arquivos** (6 fixos + 40 `.tsx` de `components/relatorios/` menos
`acesso-form.tsx`). Não são "seis arquivos": seis são os **fixos**.

**Oito** blocos `it`, não sete (linhas 98, 102, 129, 137, 149, 174, 220, 256). A ficha diz sete.

Fecho transitivo a partir das rotas de relatório (medido: 132 arquivos, alias `@/*`→`./src/*`):

- **CONTÉM** os 40 componentes de `components/relatorios/` e `nav-rolavel.tsx`.
- **NÃO CONTÉM `viewer-header.tsx` nem `viewer-nav.tsx`.** Eles só são importados por
  `src/app/(app)/layout.tsx:14` (o layout do grupo inteiro, cujo caminho **não** tem o segmento
  `relatorios`). São justamente as duas peças que carregam a navegação real do viewer — e é
  `viewer-nav.tsx` que a asserção 8 confere ter `lerHrefAoVivo`.

**Decisão de desenho:** as **raízes** do grafo são as três rotas de relatório **mais** o chrome do
viewer (os seis fixos de hoje). O fecho parte dali. Assim a superfície derivada **contém** a de hoje
por construção, e ganha o que o grafo descobre — que é o pré-requisito da F61.

**Efeito colateral medido e desejado:** o fecho traz `components/layout/link-ajuda.tsx` (import direto
em `[filial]/page.tsx:32` e `gerados/page.tsx:25`), cujo `href={`/ajuda/${pagina}…`}` **não é interno**
e cuja guarda mora no **chamador**, não no próprio arquivo. Ele vira a **quarta exceção registrada**,
com a guarda conferida no chamador — as três de hoje ficam intactas.

`acesso-form.tsx` sai naturalmente: só é alcançado por `/relatorios/acesso`, que não é raiz. A
exclusão manual de hoje deixa de ser necessária, mas o comentário que a explica permanece.

Imports dinâmicos nas rotas/componentes do fecho: **zero** (medido). O grafo estático é completo aqui.

---

## 3. O `maybeSingle()` que engole o erro

Quatro `const { data } = await` em `src/lib/queries/**`, medidos:

| # | Arquivo:linha | Função | De relatório? |
|---|---|---|---|
| 1 | `queries/admin.ts:369` | `listarMotivosAdmin` | não |
| 2 | `queries/admin.ts:390` | `listarSenhasAcesso` | não |
| 3 | `queries/itens.ts:577` | `getUltimoLancamento` | não |
| 4 | `queries/relatorios/comum.ts:19` | `resolverFilialPorSlug` | **sim — o que a F50 conserta** |

`filiais.slug` é `unique` global hoje (`0003_tabelas.sql:11`), então **não há bug ativo**: o conserto é
preventivo, e o comentário dirá isso em vez de fingir que havia.

---

## 4. Realtime e auto-refresh

Montagens de `RealtimeRefresh` — **três**, todas sem prop, e **duas não são relatório**:

| Arquivo:linha | Tela |
|---|---|
| `app/(app)/itens/page.tsx:248` | Itens por quantidade (saldos) |
| `app/(app)/itens/historico/page.tsx:185` | Histórico de lançamentos |
| `app/(app)/relatorios/[filial]/page.tsx:170` | Relatório por filial **e consolidado** (só operador) |

`ViewerAutoRefresh`: **uma** montagem (`[filial]/page.tsx:170`, ramo `else`).

`filial_id` nas três tabelas assinadas: `movimentacoes` **sim** (`0003:76`), `lancamentos_item`
**sim** (`0015:19`), `anotacoes` **não** (`0017:6-13` — liga-se por `ativo_id → ativos.filial_id`).

Nenhum outro canal Realtime no app (medido: as quatro linhas de `realtime-refresh.tsx:50-53`).

Chaves de storage: **7 com prefixo `wap:`** + `wap-sidebar` (prefixo com hífen). Das 7, **só uma é
`localStorage`** (`wap:compra:defaults`, que guarda `{categoria, filialId}`) — a ficha diz três; as
outras duas seriam `wap-sidebar` e a do `next-themes`, cujo nome não está no código deste repositório.

---

## 5. `filiais.length` — 22 ocorrências, classificadas uma a uma

**22 em 13 arquivos**: 18 código executável + 4 comentários. A ficha estimava ~11.

**Autorização (A) — 1**, depois de reclassificação própria:

- `components/itens/lancar-item-campos.tsx:139` — `podeCadastrar={filiais.length > 0}`. Alimenta uma
  prop de **permissão** com o comprimento de uma lista.

**Reclassificados de A para B contra o parecer do subagente** (`itens/page.tsx:283` e `:358`,
`filiaisEscrita.length >= 2`): `>= 2` não deriva **cargo**, deriva **viabilidade** — transferir item
exige origem **e** destino, e um único destino torna a operação impossível, não proibida. A pergunta
de cargo está literalmente ao lado, explícita (`escreve &&`). Tratá-los como infração faria a trava
proibir aritmética de domínio legítima.

**Ergonomia (B) — 17**: pré-seleção de default, troca de widget por aviso, pluralização de rótulo,
texto de estado vazio, recorte de leitura (`< filiais.length`).

O comentário **normativo** que já proíbe o padrão está em `lib/auth/papeis.ts:173`:
> *"⚠ A decisão olha o CARGO, nunca `filiaisEscrita.length === 0`. Lista vazia tem dois significados
> diferentes: `consulta` … e `operador` sem vínculo válido — um usuário quebrado."*

Censo de `ehOperador` na superfície de relatório: **57 ocorrências em 46 linhas**, 9 arquivos de
produção (a ficha diz 53; o subagente contou 46 chamando de "ocorrências" o que são linhas). E
`ehOperador` **não é cargo**: é `acesso.modo === 'operador'`, a fronteira das duas portas.

---

## 6. As seis decisões obrigatórias

### Decisão 1 — os arrastados pela assinatura
`tipos-item.ts` **entra** (dois call-sites com `acesso.client`, e o próprio arquivo já explica por quê
desde a F39). `conflitos.ts`, `import-logs.ts`, `ativos.ts`, `colaboradores.ts` e `queries/itens.ts`
viram **exceções nominais com motivo medido** (quem chama, de onde). `pendencias-detalhe.ts` **não é
exceção nem superfície** — ele simplesmente não aceita client em função exportada.
**Custo que decidiu:** nenhum dos cinco é importado pela superfície, medido pelo fecho de imports.

### Decisão 2 — o `filter:` do Realtime → **opção (a)**, sem literal
A rota `[filial]/page.tsx` serve **`geral`** (consolidado, `filialId = null`) e a filial específica com
o **mesmo** `<RealtimeRefresh />`, que não recebe prop nenhuma. O consolidado lê as cinco filiais
(`estoque.ts:78,412,436` só aplicam `.eq('filial_id', …)` quando há id) e **precisa** acordar com
INSERT de qualquer filial. Some-se: `anotacoes` não tem `filial_id`, e duas das três montagens são
telas de `/itens`. **Não existe filtro provadamente total hoje** — então nenhum é emitido. As três
assinaturas passam a tirar as opções de **uma única função** `opcoesDaAssinatura(tabela)`, que hoje
devolve o objeto **sem** `filter` e amanhã devolve com. A trava afirma que nenhuma das três monta
opções à mão.
**Divergência declarada:** a ficha (`:271`) diz "acrescentar `filter:` com o valor que hoje não
recorta nada". Para `anotacoes` isso é inexequível, e para as outras duas seria mudança de
comportamento no consolidado. O prompt é mais restritivo e a medição o confirma.

### Decisão 3 — assinatura de `chaveDoEscopo`
Módulo puro novo `src/lib/escopo/chave.ts`, servindo aos **dois** consumidores:
`chaveDoEscopo(): string` (hoje uma constante) + `nomeDoCanal(base)` para o Realtime e
`chaveDeStorage(base)` para a F61. O cabeçalho nomeia os dois consumidores e o que a função devolverá
depois da virada. Um `chaveDoEscopo()` que só servisse a canal obrigaria a F61 a criar o segundo.

### Decisão 4 — travar o `ViewerAutoRefresh` sem jsdom → **opção (a)**, função pura
Nenhum dos dois projetos do Vitest tem jsdom (ambos `environment: 'node'`), e jsdom é dependência
nova que a regra 3 proíbe. A decisão vira `deveRefrescar({ agora, ultimo, visivel, intervalo })` num
módulo puro, testado no projeto `puro`. Precedentes reais na casa: `components/layout/sidebar-preferencia.ts`
(+`.test.ts`) e `components/itens/conferencia/rascunho.ts` (+`.test.ts`).
**Correção de fato:** o prompt data o padrão "desde a F45"; medido, `sidebar-preferencia.ts` é da
**F30** e `relatorio-visitado.ts` da **F32**. A F45 trouxe o segundo *projeto* do Vitest, não o padrão.

### Decisão 5 — `lancar-item-campos.tsx:139` → **exceção nominal + backlog F70**
Cadeia medida: `itens/page.tsx:166` (`filiaisParaEscrita`) → `:293` `<LancarItemDialog filiais={filiaisEscrita}>`
→ `lancar-item-dialog.tsx:609` → `lancar-item-campos.tsx`. O diálogo só é montado dentro de
`{escreve && (…)}` (`itens/page.tsx:290`).

Consequências medidas:
- **consulta** nunca alcança o componente — o gate externo já o exclui. O comentário no código
  (*"lista vazia = cargo consulta"*) está **factualmente errado**.
- **operador sem vínculo**: hoje **não** vê o botão; com `papel !== 'consulta'` **veria**. E o cadastro
  de pessoa **não é matéria de filial**, então o clique provavelmente teria sucesso.
- **admin**: idêntico, salvo o caso degenerado de zero filiais ativas.

Como a troca **muda o que alguém vê hoje**, ela não é desta fase. Vira exceção nominal com o motivo
medido, mais item de backlog nomeado para a F70. O que **é** desta fase: corrigir o comentário errado
(não muda comportamento) e travar para que nenhum caso **novo** apareça.

### Decisão 6 — `database.ts` sem quebrar o CI → **caminho (a)**
O MCP do Supabase **está conectado** nesta sessão (projeto de produção `pbtjcalbmepmrqzprusb`,
`ACTIVE_HEALTHY`; o de ensaio `sgmvldiizsrjbxzzpmhh` segue `INACTIVE`). Então: aplicar a `0129` em
produção e regenerar com `npm run db:types` apontado para produção, commitando o arquivo. Sem
hand-fix. Se o apply falhar, o fallback é (b), com ata.

---

## 7. O que a medição obriga além do que a ficha pedia

1. **`catalogo_policies.sql`** tem `k_funcoes_acesso` (linhas 166-169) com sete nomes; a asserção 7
   exige que toda policy de Storage cite uma função reconhecida. A policy nova citará
   `pode_ler_arquivo_termo`, que **não está na lista** → precisa entrar, ou a asserção reprova.
2. **`assert_zero_de` levanta exceção com universo NULL ou 0**, e `array_length(array[]::text[], 1)`
   é **NULL**. Esvaziar `k_invoker_anon` cru faria a asserção **6b explodir** — derrubando o roteiro
   antes da linha `FIM` — em vez de "acusar", como o prompt supõe. Solução: esvaziar a lista (a ordem
   é cumprida) **e** acrescentar `k_invoker_revogadas` com os cinco nomes, guardando a 6b e provando
   a revogação numa asserção nova. A lista muda de papel: de *exceção tolerada* para *revogação
   provada*, que é uma trava melhor do que a que se perdeu.
3. **A policy de SELECT do bucket `termos` não é `using (bucket_id = 'termos')`.** Isso valeu até a
   `0066`; a **`0070` §B** já a apertou para `bucket_id = 'termos' and papel_atual() is not null`
   (confirmado em produção). A `0129` **encapsula regra existente** — o que torna "zero mudança de
   comportamento" trivialmente provável. O comentário a reescrever é o da `0066:40-41`.
4. **`seguranca_catalogo.sql:15-23`** diz que a `0038` "deixa esta com o grant default do Supabase
   (authenticated/anon com EXECUTE)". Depois da `0129` isso passa a ser falso para `anon` — comentário
   que mente é dívida, e será corrigido (a asserção 4c em si continua válida: prova `prosecdef=false`).

---

## 8. Ordem de execução

1. Frente 1 (`fronteira-viewer.test.ts`) — **nasce vermelha**, saída guardada como evidência.
2. Frente 2 (`confinamento-viewer.test.ts` derivado + `SUPERFICIE_MINIMA`).
3. Frentes 3, 6, 7 (`comum.ts`, `podeLer` + paleta, `use-filtros-tabela`).
4. Frentes 4 e 5 (`chaveDoEscopo`, `opcoesDaAssinatura`, `deveRefrescar`).
5. Frentes 8 e 9 (`0129` + `storage_termo.sql` + `db:lock` + `k_invoker_anon`), mesmo commit.
6. Frente 10 (apply da `0128` e da `0129` em produção) e `npm run db:types`.
7. Matriz (R-ACC-40+, contador a partir de 244), CHANGELOG, **1.55.0**, tag, ata, relatório, PR.

## 9. Divergências prompt × ficha, resolvidas

| # | Divergência | Resolução |
|---|---|---|
| A | Os cinco `revoke` de `anon` estão no prompt e **não** na ficha | **Faço** — `RELATORIO-F49.md:461-464` os carrega para a F50 por decisão de 08/09/2026 |
| B | Ficha: `podeLer` com "consumidores" (plural); prompt: só a paleta | **Só a paleta** — o prompt é mais restritivo e é decisão datada |
| C | Ficha manda `filter:` real; medição prova inexequível | **Gancho sem literal** (Decisão 2) |
| D | 3º comportamento do `ViewerAutoRefresh` só no prompt | **Faço os três** — escopo escolhido pelo Johnny |
| E | Apply da `0128` só no prompt | **Faço** — pendência herdada de três fases, MCP disponível |
| F | Ficha diz "as seis travas"; há **7** bullets em Entra | Escrevo **7** travas e registro |
| G | Objetivo da ficha diz "os **dois** lugares"; prompt diz três | Os dois da UI (`podeLer`, `use-filtros-tabela`); `chaveDoEscopo` é o terceiro, mas de infra |
