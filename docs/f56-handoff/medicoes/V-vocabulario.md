# V-vocabulario — Frente D (e partes de A/B/E) da F56

Medido em 11/09/2026, em cima do repositório `C:/Users/victor.matusita/ti-wap-inventory-control`,
branch `f56-import-sem-wapismo-e-sem-bomba`. Escopo: fatos 5, 6, 7, 11, 14 (parcial), 16 do
cabeçalho da OS F56. Nenhum arquivo do repo foi editado — só leitura + `grep`/`wc` no scratchpad.

## a) Inventário EXATO de `deparas.ts`

Arquivo: `src/lib/import/deparas.ts` (22,2 KB). Todo o vocabulário de código vive aqui, exceto
os dois enums TS (`StatusAtivo`/`CategoriaAtivo`, em `tipos.ts` — fato 16).

### `UNIDADES` (`deparas.ts:181-200`) — 18 chaves → 5 `FilialOficial`

```ts
const UNIDADES: Record<string, FilialOficial> = {
  'matriz': 'Matriz',
  'matriz sao marcos': 'Matriz',
  'cd-afp': 'CD-Afonso Pena',
  'cd afp': 'CD-Afonso Pena',
  'cd-pena': 'CD-Afonso Pena',
  'cd pena': 'CD-Afonso Pena',
  'cd-afonso pena': 'CD-Afonso Pena',
  'cd afonso pena': 'CD-Afonso Pena',
  'cd-afonsopena': 'CD-Afonso Pena',
  'afonso pena': 'CD-Afonso Pena',
  'eusebio': 'Eusébio',
  'filial-ce': 'Eusébio',
  'filial ce': 'Eusébio',
  'serra': 'Serra',
  'serra park': 'Serra',
  'linhares': 'Linhares',
  'filial - linhares': 'Linhares',
  'filial linhares': 'Linhares',
}
```

Contagem batida: 18 chaves, 5 valores distintos. Confirma o fato 7 literalmente.

**Contra `0007_seeds_fixos.sql` e `0026_filial_serra.sql`** (únicas fontes de nome/slug — nenhuma
migration renomeia depois):

```
0007: ('matriz','Matriz') ('cd-afonso-pena','CD Afonso Pena') ('linhares','Linhares')
      ('serra-park','Serra Park') ('eusebio','Eusébio')
0026: slug 'serra-park' → slug 'serra', nome 'Serra' (rename idempotente)
```

Nome oficial no BANCO hoje: `Matriz` · `CD Afonso Pena` (**sem hífen**) · `Linhares` · `Serra` ·
`Eusébio`. `FilialOficial` em `tipos.ts:71-76` grava `'CD-Afonso Pena'` **com hífen** — é a
divergência que o fato 3 já aponta (`site_divergente` mistura os dois nomes).

**⚠ Achado que corrige uma leitura ingênua do fato 7.** `normalizarTexto` não mexe em hífen (só
NFD+diacríticos, minúsculas, `:` final, espaços). Logo:
- `normalizarTexto('CD Afonso Pena')` (nome REAL do banco) = `'cd afonso pena'` (com ESPAÇO)
- `normalizarTexto('CD-Afonso Pena')` (o `FilialOficial` do TS, com o hífen) = `'cd-afonso pena'`

São strings normalizadas **diferentes**, e as DUAS já existem em `UNIDADES` como chaves
separadas (linhas 188 e 189). A chave que é "o próprio nome da filial, normalizado" — pela
fonte de verdade real (`filiais.nome` no banco, que é o que a Decisão iii vai usar) — é
**`'cd afonso pena'` (sem hífen)**, não `'cd-afonso pena'`. A versão com hífen é uma das 13
ALIASES a semear em `unidades_apelidos`, não uma das 5 que "não vira linha" (decisão iii).
Isto é uma armadilha real de implementação: trocar as duas inverte silenciosamente qual forma
o operador digitado precisa cadastrar como apelido explícito da CD.

As **5 chaves = nome-próprio-normalizado** (não viram linha no banco, decisão iii):
`matriz` · `cd afonso pena` (SEM hífen) · `eusebio` · `serra` · `linhares`.

As **13 ALIASES** (viram as 13 linhas do seed de `unidades_apelidos` na `0139`):
`matriz sao marcos` · `cd-afp` · `cd afp` · `cd-pena` · `cd pena` · `cd-afonso pena` (COM
hífen) · `cd-afonsopena` · `afonso pena` · `filial-ce` · `filial ce` · `serra park` ·
`filial - linhares` · `filial linhares`.

### `SLUG_POR_FILIAL` + `filialPorSlug` (`deparas.ts:207-222`)
```ts
export const SLUG_POR_FILIAL: Record<FilialOficial, string> = {
  'Matriz': 'matriz', 'CD-Afonso Pena': 'cd-afonso-pena', 'Linhares': 'linhares',
  'Eusébio': 'eusebio', 'Serra': 'serra',
}
const FILIAL_POR_SLUG = Object.fromEntries(...)  // reverso
export function filialPorSlug(slug: string): FilialOficial | null
```
Único consumidor: `plano.ts:342`. Some inteiro na Decisão 3 — a identidade vira `filial_id`
puro, sem passar mais por nome/slug no motor.

### `CATEGORIAS` (`deparas.ts:228-234`) — 5 termos
`notebook, desktop, monitor, celular, tablet` → si mesmos (idênticos ao enum, sem apelido).
`CATEGORIAS_TERMOS = Object.keys(CATEGORIAS)` (linha 242, usado no Levenshtein).

### `ESTADOS` (`deparas.ts:261-279`) — 17 termos → `StatusAtivo`
```
saida→em_uso · remanejo→em_uso · guardada→em_estoque · estoque→em_estoque ·
reservada→reservado · reservado→reservado · emprestimo→emprestado · validar→em_triagem ·
devolvido→em_triagem · devolucao→em_triagem · manutencao→em_manutencao ·
'rt wap'→defasado · 'posse wap'→defasado · defasada→defasado · defasado→defasado ·
descarte→descartado · descartado→descartado
```
17 chaves confirmadas. `ESTADOS_CORRIGIVEIS` (linha 303) = as mesmas 17 MENOS as que
resolvem `descartado` (`descarte`,`descartado`) = **15** termos restantes — usado só como
universo de sugestão Levenshtein (não é um dos "5 grupos" do fato 7, é derivado).

### `TIPO_CANONICO` (5) e `SITUACAO_CANONICA` (7) — formas de EXIBIÇÃO (`deparas.ts:250-256`, `:316-327`)
```ts
export const TIPO_CANONICO: Record<CategoriaAtivo, string> = {
  notebook: 'Notebook', desktop: 'Desktop', monitor: 'Monitor',
  celular: 'Celular', tablet: 'Tablet',
}
export const SITUACAO_CANONICA: Record<Exclude<StatusAtivo,'descartado'|'devolvido_fornecedor'>, string> = {
  em_estoque: 'Estoque', em_uso: 'Saída', reservado: 'Reservado',
  emprestado: 'Empréstimo', em_triagem: 'Validar', em_manutencao: 'Manutenção',
  defasado: 'Defasado',
}
```
5 + 7 = **12 formas** confirmadas, caixa e acento exatos ("Saída" com acento, "Empréstimo" com
acento). São a fonte do Select em `grupos-erros.tsx`/`ops-grupo.ts`, do "Definir como {filial}",
e do que `deparas.ts:316-317`/`:328` grava na célula do CSV corrigido. Isto TEM de virar uma
coluna própria no vocabulário do banco (não dá para derivar a forma de exibição do termo cru:
"Saída" não é nenhum dos 17 termos-ESTADOS, é o inverso).

### `PREFIXOS_PATRIMONIO` (`deparas.ts:152`) — 7 prefixos
```ts
export const PREFIXOS_PATRIMONIO = new Set(['WAP','PRO','LEA','TEC','STF','PAT','NOO'])
```
Comentário do próprio arquivo (linha 148-151): *"Prefixos OFICIAIS de patrimônio da WAP"*.
Usado só por `extrairPatrimonioDoHostname` (linha 171).

### Outras constantes de vocabulário (fora do escopo da migration, mas no mesmo arquivo)
- `VAZIOS` (linha 46) / `PATRIMONIO_VAZIO` (linha 87) / `FAMILIA_SEM_PATRIMONIO` (regex, linha
  113) — heurísticas de "campo vazio na prática". **Fora do escopo do banco** (não são
  vocabulário De→Para nomeado pela OS; são regra de parsing, ficam código).
- `MESES_ABREV` (linha 378) — meses abreviados pt-BR para `dd/MMM`. Também fora do escopo (não
  é WAP-específico, é português genérico).
- `DATA_VAZIA` (linha 352) — idem.

Nenhuma dessas entra na migration `0139`: a OS só pede unidades/categoria/situação/prefixo.

## b) Todo consumidor de cada símbolo (arquivo:linha, cliente/servidor)

| Símbolo | Consumidores (arquivo:linha) | Onde roda |
|---|---|---|
| `FilialOficial` (tipo) | `deparas.ts` (todo), `tipos.ts:71-76,83,95-114,117-121`, `plano.ts` (tipos), `index.ts:58` re-export | tipo — apagado no build, "roda" nos dois |
| `UNIDADES` | só dentro de `mapearUnidade` (`deparas.ts:202-205`) | servidor (módulo importado só por `plano.ts`/`correcoes.ts` como VALOR) |
| `SLUG_POR_FILIAL` | não consumido fora do próprio arquivo (só monta `FILIAL_POR_SLUG`) | servidor |
| `filialPorSlug` | `plano.ts:342` (único call-site) | servidor |
| `mapearUnidade` | **servidor**: `plano.ts:112` (`montarPlanoImport`), `plano.ts:342`; `correcoes.ts:122,130,131,276,463,471` (6 chamadas em 5 pontos do arquivo). **cliente**: `ops-grupo.test.ts`/nenhum — nenhum componente `'use client'` importa `mapearUnidade` como valor; é reexportado como VALOR pelo barril (`index.ts:43`) mas nenhum client component o usa hoje (só tipos do barril) | servidor apenas, hoje |
| `CATEGORIAS` | só dentro de `mapearCategoria` (`deparas.ts:237-238`) | servidor |
| `mapearCategoria` | `plano.ts:148` (`montarPlanoImport`); `correcoes.ts:481` (sugestão Levenshtein) | servidor |
| `ESTADOS` | só dentro de `estadoPlanilha` (`deparas.ts:286-294`) | servidor |
| `estadoPlanilha` | `plano.ts:159` (`montarPlanoImport`); `correcoes.ts:145` (`validarSemantica`), `correcoes.ts:492` (sugestão) | servidor |
| `TIPO_CANONICO` | **servidor**: `index.ts:35` (re-export); nenhum uso direto em `plano.ts`/`correcoes.ts` (`correcoes.ts` só referencia via `CATEGORIAS_TERMOS`, não `TIPO_CANONICO`). **cliente (VALOR, direto de `deparas.ts`, NUNCA do barril)**: `grupos-erros.tsx:20` (Select + escrita da célula em `:65-66` da área de correção); `ops-grupo.ts:15` (`:118,124,217` — `opsDoGrupo`/`grupoPronto`) | cliente é quem de fato o usa como valor de runtime |
| `SITUACAO_CANONICA` | **cliente**: `grupos-erros.tsx:20`; `ops-grupo.ts:15` (`:130,136-137,219`) | cliente |
| `PREFIXOS_PATRIMONIO` | só dentro de `extrairPatrimonioDoHostname` (`deparas.ts:170-172`) | servidor (a função é usada nos dois lados — ver abaixo) |
| `extrairPatrimonioDoHostname` | **servidor**: `plano.ts` (via `resolver-patrimonio.ts:23,64`) — bloqueia/monta o plano. **cliente**: `grupos-erros.tsx:20,153` (painel de auditoria "preenchido pelo hostname"); `importar-wizard.tsx:39,153` (o mesmo painel, mais acima na árvore) | os dois — é a única função de vocabulário chamada tanto no servidor quanto (via import direto de `deparas.ts`) no cliente |
| `aplicarCorrecoes` | `plano.ts:326` (dentro de `analisar`); `csvCorrigidoDeArquivo`/`csvCorrigido` em `plano.ts:594`/`correcoes.ts:375` | servidor só (a função em si; `index.ts:21` reexporta o VALOR mas nenhum client component chama) |
| `validarCorrecao` | reexportado por `index.ts:26`; **não há call-site em `src/` fora dos testes** (`correcoes.test.ts`) hoje — é usado pelo motor mas a UI usa a régua equivalente via `opsDoGrupo`/`grupoPronto` de `ops-grupo.ts`, não chamando `validarCorrecao` diretamente | servidor (não chamado hoje pela UI) |
| `agruparErros` | `plano.ts:487` (dentro de `analisar`) | servidor |
| `CATEGORIAS_TERMOS` | `correcoes.ts:480` (Levenshtein) | servidor |
| `ESTADOS_CORRIGIVEIS` | `correcoes.ts:487` (Levenshtein) | servidor |
| `normalizarTexto` | `deparas.ts` (várias funções internas), `correcoes.ts:32,406,411` (`sugerirValor`) | servidor |
| onde `FilialSelecionada` é montada | `actions/importar.ts:255-265` (`filialPorId`, SELECT direto em `filiais`) → `actions/importar.ts:297` (`filialSel = {id, slug, nome}`); e `actions/importar.ts:748-749` (`baixarCsvCorrigido`, usa `filial.nome`/`.slug` direto, sem montar objeto) | servidor (Server Action) |

Confirma o fato 6 quase byte a byte, com uma correção de contagem: `mapearUnidade` em
`correcoes.ts` tem **6 chamadas em 5 locais de código** (122; 130 e 131 no mesmo bloco; 276;
463; 471) — o "×5" do cabeçalho conta locais/blocos, não invocações.

**Por que a separação client/server é físico, não só convenção**: o comentário em
`ops-grupo.ts:12-14` e o espelho em `grupos-erros.tsx:17-19` dizem a razão exata — o barril
`@/lib/import` reexporta `plano.ts`, que importa `node:crypto` (`createHash`, usado no
`hashConteudo`). Um Client Component que importasse um VALOR do barril quebraria o bundle;
por isso os três consumidores client importam VALOR direto de `@/lib/import/deparas` (folha
sem `node:crypto`) e só TIPO do barril. `correcoes.ts` tem o MESMO comentário ("folha
client-safe" no cabeçalho do arquivo, linha 1-4) mas isso está desatualizado: **nada em
`src/` importa `correcoes.ts` como valor fora de `plano.ts`** (que é servidor) — confirmado
por `grep` (`from '.../correcoes'` só aparece em `correcoes.test.ts`, `index.ts` e
`plano.ts`). O comentário é uma aspiração que a árvore de import de hoje não cumpre.

## c) A cadeia página → wizard → actions → motor

```
app/(app)/admin/importar/page.tsx (Server Component)
  listarFiliais(client)                          → Filial[] = {id, slug, nome, cidade}[]
                                                     (queries/filiais.ts:11,30-42 — SÓ ativo=true)
  <ImportarWizard filiais={filiais} />

components/admin/importar/importar-wizard.tsx ('use client')
  useState<Pick<Filial,'id'|'slug'|'nome'>>       ← Select de filial (não li o corpo inteiro
                                                     do state — fora do escopo desta frente;
                                                     o valor final vai num FormData como
                                                     `filialId` cru, NÃO como objeto)
  <form action={...}> formData.append('filialId', String(filial.id)) ...
  await validarImport(formData)                   → ValidarImportResult

lib/actions/importar.ts ('use server')
  validarImport(formData):
    idRes = lerFilialId(formData)                 // só valida inteiro > 0 (:247-253)
    filial = await filialPorId(client, idRes.filialId)   // SELECT id,slug,nome,ativo (:255-265)
    filialSel: FilialSelecionada = {id: filial.id, slug: filial.slug, nome: filial.nome} (:297)
    validacao = await validarArquivoImport(buffer, filialSel, undefined, correcoes)  (:302)
    // 2ª passada (F7C→F24): paresEmOutrasFiliais + revalidação (:329-355)
    custo = await custoSubstituir(client, filial.id)      (:360)
    return { ok:true, filial:{id,slug,nome}, validacao, custo, termosMultiFilial }

  aplicarImport(input: {plano, confirmacaoTexto, custoPreview, correcoes}):
    // NÃO chama o motor — plano.filialId já vem PRONTO do preview (:387-401)
    filial = await filialPorId(client, plano.filialId)     (:403)
    confirmacaoImportConfere(confirmacaoTexto, filial.nome) (:417)
    revalida custoSubstituir === custoPreview               (:428-452)
    backup (exportarAcervoFilial) → Storage                 (:474-515)
    client.rpc('importar_ativos_substituir', {p_plano: {...plano, confirmacao}, ...}) (:530-535)

  baixarCsvCorrigido(formData):
    filial = await filialPorId(client, idRes.filialId)      (:748)
    csvCorrigidoDeArquivo(buffer, correcoes, filial.nome)    (:759)

lib/import/plano.ts (motor, SERVIDOR — node:crypto)
  validarArquivoImport(conteudo, filial: FilialSelecionada, hoje?, correcoes?, existentesEmOutraFilial?)
    → analisar(csvOriginal, hash, filial, hoje, correcoes, existentesEmOutraFilial)
      filialAlvo = filialPorSlug(filial.slug) ?? mapearUnidade(filial.nome)   (plano.ts:342)
      montarPlanoImport(registros, filialAlvo, filial.nome, hoje, forcados)   (plano.ts:347)
        mapearUnidade(reg.site) !== filialAlvo → bloqueante site_divergente  (plano.ts:112-122)
```

**Onde a filial escolhida entra, hoje**: como **`FilialSelecionada = {id, slug, nome}`**
(`tipos.ts:83`) — os TRÊS campos viajam juntos desde `actions/importar.ts:297`. Mas o motor só
usa **`slug`** (via `filialPorSlug`) e **`nome`** (via `mapearUnidade`, fallback, e em toda
mensagem de erro/`correcaoDoGrupo`); **`id`** só é usado para preencher `PlanoImport.filialId`
(`plano.ts:517`) — nunca para IDENTIDADE de comparação. É essa ausência que a Decisão 3 fecha:
com o vocabulário no banco chaveado por `filial_id`, a comparação vira `filialAlvo ===
filial.id` (inteiro), e `slug`/`nome` deixam de ser necessários para o motor JULGAR — sobram só
para MENSAGEM (`filial.nome` em toda string de erro) e para a RPC (`arquivoHash`, etc. — sem
mudança).

## d) `site_divergente`, a mensagem de `:154`, o card de Site, NOME vs SLUG vs ID

- **`site_divergente` nasce em `montarPlanoImport`, `plano.ts:111-122`**, DENTRO do loop
  `for (const reg of registros)` — ou seja, **uma vez por linha do CSV**. Quando `filialAlvo
  === null` (filial selecionada fora do vocabulário), a condição `filialAlvo === null ||
  filialLinha !== filialAlvo` é `true` para TODA linha, então bloqueante em TODAS. É
  literalmente aqui que nasce o defeito da ficha — `filial_fora_do_vocabulario` (Frente A) tem
  de nascer FORA deste loop, uma vez só, antes dele rodar (ou como um `return` antecipado de
  `analisar`, no molde do bloco `header_invalido` em `plano.ts:293-317`, que já faz exatamente
  isso para outro tipo de falha estrutural).
- **A mensagem de `plano.ts:154`** (categoria, não site): `` `Tipo "${reg.tipo}" fora do
  vocabulário (Notebook, Desktop, Monitor, Celular, Tablet)` `` — cita as 5 categorias por
  extenso, cru no código. Vira interpolação de `vocab.categorias.map(c=>c.rotulo).join(', ')`
  na Decisão 3 (ou fica com a lista fixa se a Decisão 3 não cobrir mensagens — mas a OS pede
  "nenhuma palavra da WAP no código", e essa lista SÃO os rótulos WAP hoje).
- **`correcoes.ts:462-487`** (`correcaoDoGrupo`, case `'site_divergente'`): usa `mapearUnidade
  (filialNome)` para saber se a filial SELECIONADA está no De→Para (`alvo === null` → card
  `kind:'nenhuma'`, comentário explícito "O conserto é cadastrar a unidade no De→Para" — é
  literalmente a issue que esta fase resolve). Quando `alvo` existe, compara
  `mapearUnidade(chave)` (o valor cru agrupador, um Site do CSV) contra `alvo`: `null` ou igual
  → `site_desconhecido` (corrigível); outra filial conhecida → `site_outra_filial`
  (só remover). **Os candidatos Levenshtein de Site não existem** — só categoria
  (`CATEGORIAS_TERMOS`) e estado (`ESTADOS_CORRIGIVEIS`) têm sugestão por distância de edição;
  Site vira sempre um dos dois kinds fixos acima, nunca um `sugestao:` campo.
- **NOME vs SLUG vs ID, listagem completa de uso**:
  - `filial.id` → só `PlanoImport.filialId` (o que a RPC recebe) e o que identifica a filial
    nas queries auxiliares (`custoSubstituir(client, filial.id)`, `paresEmOutrasFiliais(client,
    filial.id, ...)`).
  - `filial.slug` → `filialPorSlug(filial.slug)` (única leitura no motor) e
    `prefixoBackupImport(filial.id)` (não, esse já é por id — o slug NÃO entra no caminho do
    Storage desde a F52, comentário em `validators/importar.ts:230-234`: "Por ID e não por
    slug: o slug colide quando deixar de ser único global").
  - `filial.nome` → TODO o resto: `mapearUnidade(filial.nome)` (fallback), toda mensagem de
    erro (`plano.ts:119-120`), `correcaoDoGrupo` (`correcoes.ts:463,471`), `"Definir como
    {filial}"` (`ops-grupo.ts:143`, `op:'substituir', campo:'site', de:grupo.chave,
    para:filialNome` — **usa o NOME, não o slug, como valor gravado na célula Site**),
    `confirmacaoImportConfere(confirmacaoTexto, filial.nome)` (a confirmação digitada é o
    NOME), `csvCorrigidoDeArquivo(buffer, correcoes, filial.nome)` (o CSV corrigido escreve o
    NOME na coluna Site).
  - **Conclusão para a Decisão 3**: o CSV corrigido e o "Definir como" SEMPRE gravam
    `filial.nome` na célula (nunca o slug, nunca o id) — isso não muda com a vocabulário-como-
    dado; é o `filialAlvo` (a variável de JULGAMENTO) que troca de `FilialOficial` para
    `number` (o `filial_id`). `filial.nome` continua existindo em `FilialSelecionada` só para
    apresentação/gravação de célula, não para comparação.

## e) Call-sites por teste (para dimensionar a assinatura nova)

Medido com grep de `\bnomeDaFuncao\(` em cada arquivo de teste do motor:

| Função | `deparas.test.ts` | `plano.test.ts` | `correcoes.test.ts` | `resolver-patrimonio.test.ts` | `xlsx.test.ts` |
|---|---|---|---|---|---|
| `mapearUnidade` | **8** (raw, sem wrapper) | 0 (indireto via `validarCsvImport`) | 0 (indireto) | 0 | 0 |
| `filialPorSlug` | **4** (raw) | 0 | 0 | 0 | 0 |
| `mapearCategoria` | **7** (raw) | 0 | 0 | 0 | 0 |
| `estadoPlanilha` | **10** (raw) | 0 | 0 | 0 | 0 |
| `extrairPatrimonioDoHostname` | **28** (raw) | 0 | 0 | 0 | 0 |
| `normalizarTexto` | 4 (raw) | — | — | — | — |
| `validarCsvImport` | — | **17** (quase todos via wrapper `validarMatriz`, `plano.test.ts:36-38`) | **14** (quase todos via wrapper `validar`, `correcoes.test.ts:50-63`) | — | 1 |
| `validarArquivoImport` | — | — | — | — | 2 |
| `aplicarCorrecoes` | — | — | 2 (raw) | — | — |
| `validarCorrecao` | — | — | 11 (raw) | — | — |
| `agruparErros` | — | — | 2 (raw) | — | — |
| `csvCorrigido`/`csvCorrigidoParaTexto` | — | — | 8 + 1 (raw) | — | — |
| `sugerirValor` | — | — | 14 (raw) | — | — |
| `resolverPatrimonio` | — | — | — | **1** direto (wrapper `r()`, `resolver-patrimonio.test.ts:6-7`); ~12 chamadas indiretas via `r(...)` | — |
| `montarPlanoImport` | 0 em todo `src/` fora de `plano.ts`/`index.ts` — **nenhum teste chama direto** | | | | |

**Leitura para o custo da Decisão 3**:
- `validarCsvImport`/`validarArquivoImport` (as 2 funções PÚBLICAS que ganham o parâmetro
  `vocabulario`) têm **31 call-sites diretos**, mas **~29 passam por 2 wrappers únicos**
  (`validarMatriz` em `plano.test.ts`, `validar` em `correcoes.test.ts`) — adicionar o
  parâmetro ali é uma mudança em **2 lugares**, não 29. `resolverPatrimonio` tem o mesmo
  padrão (1 wrapper `r()`).
- `mapearUnidade`, `filialPorSlug`, `mapearCategoria`, `estadoPlanilha`,
  `extrairPatrimonioDoHostname` em `deparas.test.ts` **não têm wrapper** — são **57 chamadas
  cruas** (8+4+7+10+28) que precisariam, cada uma, de um argumento a mais se essas assinaturas
  individuais mudarem. É mecânico (find/replace consistente por função, ex.: todo
  `mapearUnidade(x)` → `mapearUnidade(x, V)` com `V` uma fixture de vocabulário declarada uma
  vez no topo do arquivo) mas é ~57 edições de linha, não 2. **Isto pesa a favor de uma
  alternativa de design para a Decisão 3**: em vez de acrescentar parâmetro em CADA função
  folha de `deparas.ts`, considerar uma fábrica `criarDeparas(vocab: VocabularioImport) =>
  {mapearUnidade, mapearCategoria, estadoPlanilha, extrairPatrimonioDoHostname, ...}` chamada
  UMA VEZ por análise (em `plano.ts`/`correcoes.ts`), preservando as assinaturas atuais das
  funções internas — mas isso muda a FORMA de exportar (deixam de ser funções soltas), quebra
  os 57 call-sites de `deparas.test.ts` de um jeito DIFERENTE (precisam instanciar a fábrica com
  uma fixture primeiro) e tira a simetria com o molde `rotuloTipoItem(slug, mapa)` que a própria
  OS pede como padrão ("no padrão de rotuloTipoItem(slug, mapa)", Frente D). **Recomendo seguir
  o padrhão pedido pela OS** (parâmetro extra em cada função, tipo `rotuloTipoItem`) e aceitar o
  custo mecânico das 57 edições em `deparas.test.ts` — é find/replace determinístico, sem risco
  de lógica, e mantém a simetria com o molde F39 que o resto da casa já usa.
- `correcoes.test.ts`: `validarCorrecao` (11), `aplicarCorrecoes` (2), `agruparErros` (2),
  `sugerirValor` (14, mas `sugerirValor` em si NÃO muda de assinatura — quem muda é o
  CANDIDATOS array que `CATEGORIAS_TERMOS`/`ESTADOS_CORRIGIVEIS` alimentavam; `sugerirValor`
  continua puro `(valor, candidatos)`). `aplicarCorrecoes`/`agruparErros`/`validarCorrecao` têm
  poucos call-sites diretos (2, 2, 11) e quase todos passam pelo wrapper `validar`/`aplicar`
  já existentes no arquivo (linhas 43-63) — custo baixo.

## f) Proposta — Decisão 3 (transporte do vocabulário) e `VocabularioImport`

### Forma serializável (sem `Map`/`RegExp`/função/classe)

```ts
// src/lib/import/vocabulario.ts (NOVO — módulo PURO, sem node:crypto, client-safe)
export type ApelidoUnidade = { apelido: string; filialId: number }
export type TermoCategoria = { termo: string; categoria: CategoriaAtivo; rotulo: string }
export type TermoEstado = { termo: string; estado: StatusAtivo; rotulo: string | null }
// rotulo null nos 2 estados terminais que não têm forma de exibição no De→Para
// (descartado, devolvido_fornecedor) — espelha a ausência de entrada em
// SITUACAO_CANONICA hoje (deparas.ts:314-319, "de propósito").

export type VocabularioImport = {
  apelidos: ApelidoUnidade[]        // as 13 linhas de unidades_apelidos (SEM os 5 nomes próprios)
  filiais: { id: number; nome: string; ativo: boolean }[]   // TODAS as filiais (nome próprio vale sempre)
  categorias: TermoCategoria[]      // 5 linhas
  estados: TermoEstado[]            // 17 linhas
  prefixosPatrimonio: string[]      // 7 — plain array, não Set (Set não serializa por prop)
}
```

Tudo aqui é `string[]`/objeto plano/array de objetos planos — passa por prop de Server para
Client Component sem problema (nenhum `Map`, `Set`, `RegExp` ou classe — os TRÊS que o React 19
recusa silenciosamente, como o próprio `rotulo-tipo.ts:28-35` documenta: `Object.create(null)`
já quebrou a fronteira RSC uma vez nesta casa por um motivo relacionado — objeto SEM protótipo
comum falha na serialização do React com "Only plain objects … can be passed to Client
Components"; `VocabularioImport` tem de ser SÓ objetos literais comuns e arrays, nunca
`Object.create(null)`, nunca instância).

### A query só-servidor

```ts
// src/lib/queries/import-vocabulario.ts
import 'server-only'
export async function buscarVocabularioImport(client): Promise<VocabularioImport> { ... }
```
No molde de `listarTiposItem`/`mapaRotulosTipo` (F39): a QUERY fica em `queries/`, a
TRANSFORMAÇÃO pura (se houver — aqui a query já pode devolver o formato final) fica num módulo
puro sob `lib/import/`.

### O que cada action lê

- **`validarImport`** e **`baixarCsvCorrigido`** (as duas que RODAM o motor): chamam
  `buscarVocabularioImport(client)` a cada invocação (a OS exige isso explicitamente — nunca
  cache entre chamadas, nunca vindo do cliente) e passam para
  `validarArquivoImport(buffer, filialSel, hoje, correcoes, existentesEmOutraFilial,
  vocabulario)` / `csvCorrigidoDeArquivo(buffer, correcoes, filial.nome, vocabulario)`.
- **`aplicarImport`** NÃO roda o motor (fato confirmado em `c)` acima — o plano já chega
  pronto). Ela só precisa de uma fatia mínima do vocabulário para a checagem nova que a OS pede:
  "categoria e estado-alvo do plano estão entre os valores importáveis". Proposta: uma query
  MENOR e dedicada, `categoriasEEstadosImportaveis(client): {categorias: CategoriaAtivo[],
  estados: StatusAtivo[]}` (ou reaproveitar `buscarVocabularioImport` e ler só esses dois
  campos — mais simples, um SELECT a mais é barato comparado ao resto de `aplicarImport`, que
  já faz backup+RPC). Reaproveitar é preferível: menos uma função para manter simétrica.
- **A página** (`admin/importar/page.tsx`, Server Component) chama a MESMA query
  (`buscarVocabularioImport`) e passa o resultado por PROP para `<ImportarWizard
  vocabulario={vocabulario} ... />`. O wizard repassa as fatias que `GruposErros`/`ops-grupo.ts`
  precisam (`categorias`, `estados` — para `TIPO_CANONICO`/`SITUACAO_CANONICA` equivalentes) e
  a que `extrairPatrimonioDoHostname` precisa (`prefixosPatrimonio`) — os TRÊS consumidores
  client do fato 6 (`grupos-erros.tsx`, `ops-grupo.ts`, `importar-wizard.tsx`), sem que nenhum
  deles importe `queries/import-vocabulario.ts` (que tem `import 'server-only'` e quebraria o
  build se um Client Component o importasse — a MESMA defesa que `rotulo-tipo.ts` documenta).

### O que `aplicarImport` confere

Hoje `aplicarImport` confia cegamente no `estadoAlvo`/`categoria` de cada `AtivoPlano` do plano
recebido (o Zod só confere `z.string()`, não pertencimento a um vocabulário — `planoImportSchema`
em `actions/importar.ts:106-138`, fato 23 do cabeçalho). A OS pede a checagem nova: depois do
`aplicarSchema.safeParse`, antes do backup, percorrer `plano.ativos` e recusar (erro amigável,
sem chamar a RPC, sem subir backup) se algum `categoria`/`estadoAlvo` não estiver no vocabulário
que a PRÓPRIA action leu do banco (nunca confiar no vocabulário que teria vindo — mas hoje NEM
vem — do cliente). Isto fecha a lacuna "servidor nunca julga com vocabulário do cliente" também
para o `aplicarImport` (critério 6), mesmo ele não rodando o motor inteiro.

### Unidade → `filial_id`: a comparação linha a linha da coluna Site

Hoje: `filialLinha = mapearUnidade(reg.site)` devolve um `FilialOficial` (string), comparado a
`filialAlvo` (também `FilialOficial | null`) — `plano.ts:112-113`. Depois da Decisão 3:
- `mapearUnidade` (ou a nova assinatura, ex. `mapearUnidade(raw, vocabulario)`) devolve
  `number | null` (o `filial_id`), resolvendo primeiro contra `vocabulario.apelidos` (De→Para
  explícito) e, se não achar, contra `vocabulario.filiais` comparando `normalizarTexto(raw) ===
  normalizarTexto(f.nome)` (o "nome próprio vale sempre" — SEM linha no banco, calculado em
  TS/consulta a cada chamada, nunca pré-computado como se fosse alias).
- `filialAlvo` passa a ser literalmente `filial.id` (o `number` que já está em
  `FilialSelecionada.id`) — **fim do `filialPorSlug(filial.slug) ?? mapearUnidade(filial.nome)`
  de `plano.ts:342`**: com a identidade por id, a linha vira só `const filialAlvo = filial.id`
  (a função inteira `filialPorSlug` e a constante `SLUG_POR_FILIAL` somem, como a Decisão 3 já
  prevê no fato 6).
- A régua de bloqueio não muda de FORMA (`filialLinha !== filialAlvo` continua a comparação),
  só de TIPO (`number` em vez de `FilialOficial`). O `filial_fora_do_vocabulario` (Frente A)
  passa a nascer quando `vocabulario.filiais` não contém NENHUMA entrada com
  `id === filial.id` E `ativo === true` — ou seja, quando a PRÓPRIA filial selecionada foi
  desativada ou removida entre a tela carregar e o submit (fato 5, ⚠: depois da Frente D isso é
  o único gatilho que sobra, porque toda filial ativa sempre resolve pelo próprio nome).

## g) Proposta concreta do primeiro commit (Frente A)

**Onde emitir `filial_fora_do_vocabulario` uma vez**: dentro de `analisar()` (`plano.ts`,
função privada, chamada por `validarCsvImport`/`validarArquivoImport`), **antes** de chamar
`montarPlanoImport` — no mesmo estilo do bloco `header_invalido` já existente
(`plano.ts:293-317`, que faz `return` antecipado com UM bloqueante e um resumo best-effort).
Proposta de posição: logo depois de resolver `filialAlvo` (linha 342 atual), antes da chamada a
`montarPlanoImport` (linha 347):

```ts
const filialAlvo = filialPorSlug(filial.slug) ?? mapearUnidade(filial.nome)
if (filialAlvo === null) {
  const erro: ErroImport = {
    linha: 0, coluna: 'Filial', valor: filial.nome, tipo: 'filial_fora_do_vocabulario',
    mensagem: `A filial "${filial.nome}" (slug "${filial.slug}") não está cadastrada no ` +
      `De→Para de unidades — cadastre um apelido em Administração › Filiais antes de importar.`,
  }
  return { bloqueantes: [erro], avisos: [], grupos: [{tipo:'filial_fora_do_vocabulario', chave:'',
    linhas:[0], erros:[erro], correcao:{kind:'nenhuma'}}], contexto: {},
    correcoes: {aplicadas:0, porOp: correcoes.map(()=>0)}, candidatos: [], plano: null,
    resumo: {criar:0, semData:0, semPatrimonio:0, semServiceTag:0, patrimonioDoHostname:0,
      conflitos:0, layout: det.layout, linhasRemovidas:0} }
}
```

Depois deste ponto, `montarPlanoImport` roda sabendo que `filialAlvo` NUNCA é `null` — o
`if (filialAlvo === null || filialLinha !== filialAlvo)` de `plano.ts:113` pode simplificar
para `if (filialLinha !== filialAlvo)` (a metade `filialAlvo === null` fica morta, porque quem
chama já barrou antes) — MAS a OS pede para não misturar Frente A com Frente D no mesmo commit;
o jeito de fazer o primeiro commit ISOLADO (sem tocar `mapearUnidade`/vocabulário-como-dado
ainda) é manter a checagem redundante em `montarPlanoImport` como está (não quebra nada; é só
um `if` que nunca mais dispara depois do guard novo) e só limpá-la na Frente D, quando
`filialPorSlug`/`mapearUnidade(filial.nome)` também somem dali.

**O aviso na tela de cadastro de filial**: `components/admin/filial-dialog.tsx` (189 linhas,
fora do meu recorte de leitura completo — pertence à Frente E) — um texto estático abaixo do
campo Nome/Slug dizendo que o import só reconhece a coluna Site pelo vocabulário De→Para. Não
depende de dado novo nenhum; pode entrar no MESMO primeiro commit (é só JSX).

**Card informativo**: `correcaoDoGrupo` em `correcoes.ts:462-478` já sabe produzir
`{kind:'nenhuma'}` quando `mapearUnidade(filialNome) === null` — o `case` de
`'site_divergente'` continua ali para a filial CONHECIDA cujo Site diverge (cenário normal,
`plano.test.ts:202-206`, que não muda). Falta um `case 'filial_fora_do_vocabulario': return
{kind:'nenhuma'}` em `correcoes.ts:519-522` (hoje cai no `default`, que já devolve
`{kind:'nenhuma'}` — **então nenhuma mudança é estritamente necessária aqui**, o `default`
cobre; mas nomear o case explicitamente é mais claro e documenta a intenção, no padrão do
resto do `switch`).

**Que teste prova** (critério 1): estender `correcoes.test.ts:617-626` (o teste "filial fora do
De→Para" já existente) — ele hoje só confere `grupo?.correcao.kind === 'nenhuma'`. Adicionar,
no MESMO `it` ou um novo ao lado: `r.bloqueantes).toHaveLength(1)`,
`r.bloqueantes[0]!.tipo).toBe('filial_fora_do_vocabulario')`, e continuar conferindo que
NENHUM `site_divergente` aparece mais (`r.bloqueantes.filter(e=>e.tipo==='site_divergente')`
vazio) — é exatamente essa mudança de comportamento que o `FilialSelecionada` de slug inventado
(`{id:9, slug:'filial-teste', nome:'Filial Teste'}`, já usado na linha 622) prova. Como o teste
MUDA de sentido (de "N bloqueantes, todos site_divergente, card nenhuma" para "1 bloqueante
filial_fora_do_vocabulario, zero site_divergente"), ele está na lista de "testes que mudam por
desenho" da OS — precisa da ata em `docs/DECISOES.md` dizendo por quê (a OS já antecipa isso no
fato 5, ⚠).

**Como o gatilho muda depois da Frente D**: ver item (f) acima, último parágrafo — o mesmo
bloqueante `filial_fora_do_vocabulario` continua existindo, mas a condição que o dispara deixa
de ser "slug/nome não bate com nenhuma das 5 filiais WAP hardcoded" e passa a ser "o
`filial_id` selecionado não aparece em `vocabulario.filiais` como ativo" — cenário real: filial
foi desativada entre a tela carregar e o submit, ou uma seleção velha (aba aberta há muito
tempo) aponta para um id que não existe mais. O teste do primeiro commit muda de novo nessa
hora (troca a fixture de "slug inventado" por "filial_id que não está no vocabulário
retornado") — outra ata.

## Armadilhas encontradas

1. **A confusão hífen/espaço em "CD Afonso Pena"** (seção a) — quem copiar cegamente a frase do
   fato 7 ("matriz, cd afonso pena, linhares, serra, eusebio") sem checar contra o banco pode
   semear a linha errada como alias (ou faltar semear a linha certa).
2. **`filialAlvo === null` tem DOIS caminhos de entrada hoje**: `montarPlanoImport` (linha 113,
   dentro do loop) E `correcaoDoGrupo` (linha 470, no agrupamento). Um guard antecipado em
   `analisar()` intercepta o primeiro (evita as N linhas), mas não precisa tocar o segundo — ele
   só roda se `bloqueantes.length > 0` gerar `grupos`, e com o guard antecipado o único grupo
   já é o de `filial_fora_do_vocabulario` (que nunca passa por `correcaoDoGrupo` na branch
   `'site_divergente'`). Achado: **não sobra nenhum caminho para `site_divergente` nascer
   quando a filial está fora do vocabulário**, uma vez que o guard intercepta antes do loop —
   fecha exatamente a pergunta da revisão adversarial final da OS ("a filial fora do vocabulário
   ainda gera um site_divergente por linha em algum caminho — preview, correção, 'baixar
   corrigido'?"). `baixarCsvCorrigido`/`csvCorrigidoDeArquivo` NÃO chamam `analisar()` (chamam
   só `aplicarCorrecoes` + reserializa) — não geram bloqueante nenhum, então não há caminho ali
   também.
3. **`correcoes.ts` "folha client-safe" é uma aspiração desatualizada** (visto na seção b) —
   vale documentar/corrigir esse comentário como parte da limpeza da Frente D, já que a OS
   pede tirar toda palavra WAP do código e mexer nesses arquivos de qualquer forma.
4. **`ESTADOS_CORRIGIVEIS` (15 termos) não é um dos "5 grupos" nomeados no fato 7** — é
   DERIVADO de `ESTADOS` (17) menos os que resolvem `descartado` (2: `descarte`,`descartado`).
   Ao desenhar a tabela SQL do vocabulário de estados, `ESTADOS_CORRIGIVEIS` não precisa de
   linha própria — é uma VIEW/filtro em cima da mesma tabela de 17 termos (o motor recalcula o
   filtro em TS a partir do vocabulário completo, como já faz hoje).
5. **`aplicarImport` nunca chamou o motor e não tem hoje NENHUMA checagem de vocabulário** —
   fácil esquecer essa peça porque ela "parece" fora do escopo do motor (ela só confere Zod
   estrutural). A OS é explícita que ela precisa ganhar essa checagem nova (critério 6,
   segunda metade) — é trabalho novo, não uma adaptação de código existente.
6. **`Object.create(null)` quebra a fronteira RSC por prop** — já aconteceu uma vez nesta casa
   (`rotulo-tipo.ts:28-35`, motivada por um furo de `toString` em slug). `VocabularioImport`
   TEM de ser montado com objeto/array comuns (nunca `Object.create(null)`, nunca `Map`/`Set`)
   — um erro fácil de reintroduzir se alguém "proteger" o mapa de apelidos do mesmo jeito.
