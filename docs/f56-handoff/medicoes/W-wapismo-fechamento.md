# W-wapismo-fechamento — Censo sem-wapismo, ajuda do import e fechamento da F56

Medido em 11/09/2026, contra `main` em `ef8a1e4` (branch de trabalho `f56-import-sem-wapismo-e-sem-bomba`), árvore limpa. Ferramenta: `Grep` (ripgrep) com `-i`, `glob:"!*.test.{ts,tsx,mts}"` para excluir teste, e leitura direta dos arquivos para classificar cada ocorrência em contexto. Nenhum dado real foi lido ou citado — só nomes de arquivo/tabela/variável e contagens.

---

## PARTE 1 — Censo para a trava `sem-wapismo` (fato 40)

### 1.1 Números medidos

| Padrão | Não-teste `src/**` | Arquivos |
|---|---|---|
| `matriz\|afonso pena\|linhares\|serra\|eus[eé]bio` (5 nomes) | **105 ocorrências** | **42 arquivos** |
| `wap` (case-insensitive, substring livre) | **163 ocorrências** | **85 arquivos** |
| Só `afonso pena\|linhares\|serra\|eus[eé]bio` (sem "matriz") | — | 20 arquivos |
| Só `\bmatriz\b` (palavra inteira) | — | 27 arquivos (união com os 20 acima = 42, interseção = 5: `registry.ts`, `actions/colaboradores.ts`, `import/deparas.ts`, `import/tipos.ts`, `validators/conflitos.ts`) |

**Recorte `src/lib/import/**` (não-teste):** 5 nomes = **38 ocorrências / 5 arquivos** (`parse.ts` 6, `deparas.ts` 23, `correcoes.ts` 1, `tipos.ts` 7, `plano.ts` 1); `WAP` = **12 ocorrências / 4 arquivos** (`deparas.ts` 9, `resolver-patrimonio.ts` 1, `tipos.ts` 1, `parse.ts` 1). Total combinado: 50/6 arquivos.

**Recorte `src/components/admin/importar/**` (não-teste):** 5 nomes = **1 ocorrência / 1 arquivo** (`importar-wizard.tsx:920`, comentário JSX `("linhares" ≠ "Linhares" não dava nenhuma pista)`); `WAP` = **3 ocorrências / 1 arquivo** (`grupos-erros.tsx:251,512,529`). Total combinado: 4/2 arquivos.

**Recorte `src/lib/ajuda/**` (não-teste, `conteudo/*.ts`):** 5 nomes + WAP = **38 ocorrências / 19 arquivos** — exatamente **5 dos 5 nomes + 33 de "WAP"**, batendo com o fato 41 (5+33=38).

### 1.2 ⚠ Divergência medida — fato 40 diz "30 arquivos não-teste", eu meço **42**

Os 5 nomes aparecem em **42 arquivos não-teste**, não 30. A diferença não é erro de contagem — é a palavra **"matriz"**, que no português da casa tem DOIS sentidos que colidem: (a) o nome da filial; (b) o substantivo comum "matriz" = grade/tabela bidimensional, muito usado neste código. Isolando `\bmatriz\b` como palavra inteira, ela aparece em **27 arquivos**, e destes pelo menos **7 são uso genérico, nada a ver com a filial** — bem além do único falso positivo (`celulasDaMatriz`) que o fato 40 nomeia:

| Arquivo:linha | Uso |
|---|---|
| `src/components/itens/itens-table.tsx` (15 ocorrências: 113,116,125,234,329,345,349,404,430,434,435,438,464,527,630) | "matriz" = o layout de grade da tabela de itens (F43/F44) — `const matriz = filiais.length > 1 ? filiais : []`, `celulasDaMatriz`. Nada aqui é a filial Matriz. |
| `src/lib/validators/movimentacao.ts:120,191,202,209,211,235` | "a matriz 'tipo × campos' do formulário" — matriz no sentido de tabela de combinações (`CAMPOS_POR_TIPO`). |
| `src/components/movimentacoes/nova/config.ts:275` | mesmo sentido ("um switch que replicava a matriz"). |
| `src/lib/csv.ts:67,72` | `const matriz: string[][] = [...]` — nome de variável local para "linhas do CSV", genérico. |
| `src/components/admin/usuarios/abas-usuarios.tsx:8` | "a matriz de cobertura da ajuda" (a matriz de `registry.test.ts`). |
| `src/components/admin/com-esta-pessoa-linha.tsx:16` | idem, "matriz de cobertura" (F20/F27). |
| `src/app/(app)/dev/layout.tsx:14` | idem, "a /dev está ISENTA da matriz de cobertura da documentação". |

Isso é **7 arquivos** cujo único match é "matriz" no sentido de grade/cobertura — nenhum deles cita a filial Matriz nem precisa entrar em qualquer allowlist "porque é a filial". Retirando-os do universo de 42, sobram 35 — ainda acima de 30; o resto da diferença é provavelmente o próprio critério de corte que gerou o número 30 (talvez uma lista de arquivos "que importam" e não uma varredura ingênua). **Decisão prática: a trava não pode tratar `matriz` como sinônimo de "a filial Matriz" sem desambiguar — ela precisa de um teste de FORMA (literal de string/template, nunca identificador de variável nem substring dentro de "matriz de cobertura") mais do que de uma lista de arquivo.**

### 1.3 Classificação completa (arquivo:linha), 5 nomes + WAP, não-teste

**LITERAL de dado — os que viram vocabulário no banco pela Decisão (ii):**

- `src/lib/import/deparas.ts:181-200` — `UNIDADES`, o mapa completo (18 chaves → 5 filiais). As **13 chaves-apelido** (não são o próprio nome normalizado da filial):
  `'matriz sao marcos'`, `'cd-afp'`, `'cd afp'`, `'cd-pena'`, `'cd pena'`, `'cd-afonso pena'`, `'cd-afonsopena'`, `'afonso pena'`, `'filial-ce'`, `'filial ce'`, `'serra park'`, `'filial - linhares'`, `'filial linhares'` (linhas 183-184,186,188,190-191,193-194,196,198-199).
  As **5 chaves que são o próprio nome normalizado** (ficam fora do seed de apelidos pela decisão iii — nome próprio vale sempre): `'matriz'` (182), `'cd afonso pena'` (189), `'linhares'` (197), `'serra'` (195), `'eusebio'` (192).
- `src/lib/import/deparas.ts:152` — `PREFIXOS_PATRIMONIO = new Set(['WAP', 'PRO', 'LEA', 'TEC', 'STF', 'PAT', 'NOO'])` — os **7 prefixos**.
- `src/lib/import/deparas.ts:273-274` — `'rt wap': 'defasado'` e `'posse wap': 'defasado'`, dentro de `ESTADOS` (17 termos, linhas 261-278) — os dois únicos termos citados na tarefa que usam "wap".
- `src/lib/import/deparas.ts:207-212` — `SLUG_POR_FILIAL` (5 entradas) — não é apelido, é o slug canônico; some pela Decisão 2 (fato 7: "um consumidor só, e somem").
- `src/lib/import/deparas.ts:228-234` — `CATEGORIAS` (5 termos) e `:250-256` `TIPO_CANONICO` (5 formas de exibição); `:261-279`/`:303-305` `ESTADOS`/`ESTADOS_CORRIGIVEIS` (17 termos) e `:316-327` `SITUACAO_CANONICA` (7 formas de exibição) — nenhum cita "matriz/afonso pena/linhares/serra/eusébio/wap" diretamente, mas são o resto do vocabulário que a Decisão 1 leva para o banco junto.
- `src/lib/import/tipos.ts:71-76` — a união literal `FilialOficial = 'Matriz' | 'CD-Afonso Pena' | 'Linhares' | 'Eusébio' | 'Serra'` — o TYPE que a Decisão 2/3 substitui por `filial_id`.

**IDENTIFICADOR de layout (fato 40 já nomeia; confirmado, sem mudar de sentido):**

- `src/lib/import/tipos.ts:80` — `export type LayoutImport = 'matriz' | 'cd' | 'padrao20'`, com o comentário de `:78-79` "`padrao20` = layout de 20 colunas das filiais (matriz + Grade + GLPI)".
- `src/lib/import/parse.ts:73,78-79,81-85,116` — `COLS_MATRIZ`, `LAYOUTS = { matriz: COLS_MATRIZ, cd: COLS_CD, padrao20: COLS_PADRAO20 }`, `let melhor: LayoutImport = 'matriz'`.
- `src/lib/import/plano.ts:300` — mensagem de erro `` `Cabeçalho não corresponde a nenhum layout (matriz/cd/padrao20).` ``.

Confirmando a nota do fato 40: **renomear o identificador `'matriz'` do `LayoutImport` não muda o layout** (são as colunas, definidas por `COLS_MATRIZ`) — mas o NOME do layout hoje É a palavra "matriz" minúscula, coincidindo textualmente com a filial. Se a Decisão 12 exigir zero literal `'matriz'` fora de allowlist, `LayoutImport` precisa de um nome diferente (ex.: `'completo'`/`'padrao17'`/`'sede'`) ou entrar explicitamente na allowlist como identificador de layout, nominalmente.

**COMENTÁRIO — a maioria absoluta do que resta.** Amostra representativa (todas em `src/lib/import/**` e arredores, não redundante com a lista acima):

- `src/lib/import/deparas.ts:100-112,148-151,154-165` — comentários de cabeçalho de função citando "a WAP", "prefixos oficiais de patrimônio da WAP", "hostname da WAP".
- `src/lib/import/parse.ts:3` — `// UTF-8; UTF-8 estrito; fallback cp1252 — o Excel da WAP exporta cp1252),`.
- `src/lib/import/tipos.ts:96` — `patrimonio: string | null // canônico (WAP0004491); ...`.
- `src/lib/import/resolver-patrimonio.ts:93` — `` mensagem: `Patrimônio "${cru}" fora do formato canônico (ex.: WAP0004491) e sem hostname aproveitável` `` — **este é runtime (mensagem ao operador), não comentário** — ver próxima categoria.
- `src/lib/import/correcoes.ts:437` — comentário citando "3 ativos deste CSV já estão em Linhares".
- `src/lib/validators/conflitos.ts:26-27` — comentário no JSDoc citando "o caso real que motivou a fase (6 ativos, Serra × Linhares/Matriz)".
- `src/lib/validators/confirmacao-digitada.ts:8` — comentário `("linhares" ≠ "Linhares" no import, sem explicação`.
- `src/lib/queries/import-logs.ts:59,229,263` — comentários citando contagens reais da Matriz (1.217/1.140 ativos) — **dado histórico de medição**, não literal de código.
- `src/lib/storage/copiar-antes-de-remover.ts:196` — "Num import da Matriz (84 termos)…".
- `src/lib/auth/papeis.ts:164,197` — comentários de exemplo "o operador de Serra+Linhares…".
- `src/app/(app)/pendencias/page.tsx:111-112`, `src/app/(app)/itens/page.tsx:201`, `src/app/(app)/ativos/page.tsx:126` — comentários de regressão citando "o operador de Serra".
- Dezenas de comentários com `x-wap-pathname`/`x-wap-search` (headers internos), `wap:*` (chaves de `localStorage`/eventos — ver Falso positivo abaixo), "a WAP" genérico em `patrimonio.ts`, `escopo/*.ts`, `relatorios/*.ts`, `queries/movimentacoes.ts` etc.

**LITERAL runtime (mensagem/placeholder de exemplo de FORMATO, não dado de filial) — categoria que o fato 40 não nomeia à parte, mas que a Decisão 12 precisa decidir:**

- Exemplos de patrimônio em mensagens e `placeholder`: `"WAP0001234"`, `"WAP0004491"`, `"WAP0006026"`, `"WAP-NB-1234"` em ~25 arquivos fora de `lib/import/**` (`validators/ativo.ts:125`, `validators/compra.ts:23`, `validators/devolucao-fornecedor.ts:34`, `components/ativos/*.tsx`, `components/movimentacoes/*.tsx`, `components/admin/importar/grupos-erros.tsx:251,529`, `components/dev/destrutivo/painel-ativo.tsx:109` etc.). Isso é o PREFIXO `WAP` usado como EXEMPLO didático do formato canônico (prefixo+7 dígitos) — não é hardcode de regra de negócio (a regra em si está em `PREFIXOS_PATRIMONIO`). Ver Decisão 12 abaixo: recomendo **não** varrer esses fora de `lib/import/**`.

**PLACEHOLDER de UI (fato 40 já nomeia dois; confirmados, e achei outros dois):**

- `src/components/admin/filial-dialog.tsx:148` — `placeholder="Ex.: Linhares"` (confirmado).
- `src/components/admin/criar-senha-dialog.tsx:204` — `placeholder="Filial Linhares, Stefanini…"` (confirmado).
- `src/components/admin/filial-dialog.tsx:122,152` — texto de ajuda inline no próprio diálogo: `` `/relatorios/{slug || 'linhares'}` `` e "Linhares, 4 de agosto de 2026" (exemplo de data/cidade no rodapé do termo) — mesma família do placeholder acima, no mesmo arquivo.

**HISTÓRICO do registry (fato 40 já nomeia; confirmado, só 2 entradas):**

- `src/lib/versoes/registry.ts:210` — "Números de Linhares" / "Total, Em estoque, Em uso e Falta são de Linhares" (entrada da v1.x, F30-ish).
- `src/lib/versoes/registry.ts:967` — "Cerca de 355 datas da Matriz que se perdiam na conversão voltaram a chegar corretas." (entrada antiga, F7G).
- `src/lib/versoes/registry.ts:881,1100` — dois usos de "WAP" (`@wap.ind.br`, "dado real da WAP") — mesma categoria (histórico, texto datado).

**AJUDA (`src/lib/ajuda/conteudo/**`, fora do escopo desta lista principal — detalhado na Parte 2):** 19 arquivos, 38 ocorrências (5 dos nomes + 33 "WAP").

**FALSO POSITIVO — além de `celulasDaMatriz` (`itens-table.tsx:438,527`, confirmado), medi mais quatro famílias que o fato 40 não desdobra:**

1. **"matriz" genérico** (grade/matriz de cobertura) — os 7 arquivos da seção 1.2 acima.
2. **`WAP` como identificador de namespacing** (chave de `localStorage`/nome de `CustomEvent`, nunca exibido ao operador): `wap:ativos:recentes` (`ativos-recentes.ts:14`), `wap:compra:rascunho`/`wap:compra:defaults` (`rascunho-compra.ts:3,23`; `nova-compra-form.tsx:58`), `wap-sidebar` (`sidebar-preferencia.ts:15`), `wap:transferir-item`/`wap:lancar-item` (eventos), `wap:relatorios:ultimo`, `wap:mov:rascunho`, `wap:itens:conferencia`, `wap_view` (cookie, `view-cookie.ts:4`), `wap` sozinho como `ESCOPO_UNICO` (`escopo/pertencimento.ts:48`, `escopo/chave.ts:32`) — **18 ocorrências em 12 arquivos**. `escopo/pertencimento.ts:44` já documenta a intenção: *"O literal `'wap'` não é uma configuração e não deve virar uma"* — é o prefixo do futuro `empresa_id` (F62), propositalmente hardcoded até lá.
3. **`x-wap-pathname`/`x-wap-search`** — headers HTTP internos do proxy de sessão (`supabase/proxy.ts:16,29,34,37`; `(app)/layout.tsx:44,48`; `auth/otp.ts:45`; 3 páginas de relatório) — **10 ocorrências em 6 arquivos**, puro identificador de cabeçalho, nunca visível ao operador.
4. **Domínio de e-mail `@wap.ind.br`** — `login/page.tsx:63` (placeholder), `auth/dominios-email.ts:3,16,29` (a lista de domínios corporativos, decisão de negócio real mas não "wapismo do import"), `auth/nome-pessoa.ts:16`, `versoes/registry.ts:881` — **6 ocorrências em 4 arquivos**. É o domínio de e-mail real da empresa, não um vocabulário de import.
5. **Nome do produto/marca** — título/descrição do app (`layout.tsx`, `not-found.tsx`, `(app)/versoes/page.tsx`, `(app)/ajuda/page.tsx`), o lockup visual (`components/layout/marca.tsx`, `globals.css:109,143`) — **~10 ocorrências em 8 arquivos**. É o nome do sistema hoje ("Estoque TI WAP"); rebrand para multiempresa é F73+, fora de escopo.

Somando: das 163 ocorrências de "WAP" fora de `lib/ajuda/**`, cerca de **130** caem nessas 5 famílias de falso positivo (namespacing, headers, domínio, marca, mais os ~25 exemplos de placeholder de patrimônio) — só as **12 em `lib/import/**`** (deparas.ts/resolver-patrimonio.ts/tipos.ts/parse.ts) e as **3 em `components/admin/importar/**`** (grupos-erros.tsx) são candidatas reais a "WAP-ismo" no sentido de "regra de negócio hardcoded".

### 1.4 Proposta de Decisão 12

**O que a trava varre:** só **literais de string e de template** (`StringLiteral`, `NoSubstitutionTemplateLiteral`, `TemplateHead/Middle/Tail`, e o texto estático de `JsxText`/atributo `placeholder`/`defaultValue`), **nunca comentário** — os comentários são maioria hoje (dezenas de arquivos) e documentam decisões/regressões reais (ex.: `queries/import-logs.ts` cita contagens medidas da Matriz); proibir comentário faria a trava nascer vermelha por prosa histórica, não por código. Identificador (`const matriz = …`, `wap:*` de storage, `x-wap-*` de header, `wap` de `ESCOPO_UNICO`) também fica de fora — são strings, mas usadas como CHAVE opaca, nunca como valor de negócio comparado a "é essa filial?".

**Caixa:** case-insensitive nos 5 nomes de filial (bate `"Serra"`, `"serra"`, `"SERRA"`); para "WAP" recomendo **não** varrer globalmente (ver abaixo) — se entrar, também case-insensitive, mas cravado a `src/lib/import/**` e `src/components/admin/importar/**`.

**Escopo — a decisão que mais importa:** restrinja a varredura a **`src/lib/import/**` e `src/components/admin/importar/**`** (mais, se quiser rede extra, `src/lib/validators/importar.ts` e `src/lib/actions/importar.ts`, que hoje não citam nenhum dos 6 termos mas podem ganhar um literal por engano no futuro). Varrer `src/**` inteiro pelos 5 nomes já dá 42 arquivos com 35 "matriz" genéricos herdados; varrer `src/**` por "WAP" dá 163 ocorrências, das quais ~130 são marca/domínio/namespacing legítimos — uma allowlist nominal cobrindo tudo isso teria ~70-80 entradas e nasceria ela mesma como uma segunda cópia do vocabulário para manter. O ganho de segurança de variar o escopo para `src/**` é baixo (o resto do app não decide fluxo por "é a filial Matriz?"; só o import faz isso) e o custo de manutenção é alto.

**A allowlist nominal, dentro do escopo restrito (`lib/import/**` + `components/admin/importar/**`):**
- `LayoutImport` e os 3 identificadores de layout (`'matriz'`, `'cd'`, `'padrao20'`) — permitidos NOMINALMENTE por arquivo:linha (`tipos.ts:80`, `parse.ts:73-85,116`, `plano.ts:300`), com nota de que renomeação é opcional (não obrigatória por esta fase — "Fora — não toque: os três layouts do CSV").
- Comentários — fora da varredura por desenho (ver acima), não precisam de allowlist.
- `resolver-patrimonio.ts:93` e os placeholders de exemplo de patrimônio (`"WAP0004491"` etc.) — se a Decisão 12 decidir varrer `WAP` dentro do escopo restrito, estas contam como exemplo de FORMATO (não de filial) e precisam de allowlist nominal ou de trocar o exemplo por um prefixo neutro fictício (ex.: `"XX0001234"`) — **decisão de produto, não só de trava**; registrar em `docs/DECISOES.md` qual caminho foi tomado.

**O falso positivo:** além de `celulasDaMatriz` (nomeado no fato 40), a trava precisa reconhecer identificador (não string) como fora do escopo por CONSTRUÇÃO — não por allowlist — porque `matriz`/`cd` como nome de variável/tipo aparecem várias vezes dentro do próprio `lib/import/**` (`parse.ts`, `tipos.ts`) de forma legítima.

**Apelidos/prefixos/`rt wap`/`posse wap` em `lib/import/**`:** SIM, eles têm de ser varridos — são exatamente o que a Decisão (ii) move para o banco, e o teste de guarda (molde `tipos-item-sql.test.ts`, fato 9) precisa comparar contra o SQL da migration `0139`, não contra a constante TS que deixa de existir. A trava `sem-wapismo` e a guarda TS↔SQL são DUAS travas diferentes com o mesmo alvo: a primeira prova "não sobrou literal solto"; a segunda prova "o que está no seed bate com o que o código document a".

### 1.5 Esboço do teste (sem dependência nova — `typescript` já é dependência, confirmado em `package.json:66`)

```ts
// src/lib/validators/sem-wapismo.test.ts (rascunho)
import ts from 'typescript'
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs' // ou glob já usado alhures no repo — conferir precedente

const ESCOPO = ['src/lib/import/**/*.{ts,tsx}', 'src/components/admin/importar/**/*.{ts,tsx}']
const EXCLUI_TESTE = (p: string) => !/\.test\.(ts|tsx|mts)$/.test(p)

const TERMOS = /matriz|afonso pena|linhares|serra|eus[eé]bio|\bwap\b/i

// allowlist NOMINAL: arquivo:linha -> motivo
const PERMITIDOS = new Set<string>([
  'src/lib/import/tipos.ts:80',   // LayoutImport
  'src/lib/import/parse.ts:73',   // COLS_MATRIZ / LAYOUTS
  // ...
])

function coletarLiterais(caminho: string): { linha: number; texto: string }[] {
  const codigo = readFileSync(caminho, 'utf8')
  const sf = ts.createSourceFile(caminho, codigo, ts.ScriptTarget.Latest, true,
    caminho.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const achados: { linha: number; texto: string }[] = []
  function visita(no: ts.Node) {
    if (
      ts.isStringLiteral(no) ||
      ts.isNoSubstitutionTemplateLiteral(no) ||
      ts.isTemplateHead(no) || ts.isTemplateMiddle(no) || ts.isTemplateTail(no) ||
      ts.isJsxText(no)
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(no.getStart(sf))
      achados.push({ linha: line + 1, texto: no.getText(sf) })
    }
    // NUNCA visita comentário — SourceFile já não expõe trivia como nó
    ts.forEachChild(no, visita)
  }
  visita(sf)
  return achados
}

// Para cada arquivo do ESCOPO (exceto teste): para cada literal, se TERMOS.test(texto)
// e `${caminho}:${linha}` não está em PERMITIDOS -> falha, nomeando arquivo:linha:texto.
```

Sabotagem prevista pelo critério 2/Sabotagem A da ordem: reintroduzir um literal de filial em `lib/import/**` fora da allowlist → vermelho, nomeando o arquivo:linha.

---

## PARTE 2 — A ajuda do import (fato 41)

### 2.1 Números confirmados

`src/lib/ajuda/conteudo/`: **39 arquivos** (a listagem do diretório bate — 35 de conteúdo + 4 `.test.ts`: `conteudo.test.ts` no nível acima não conta aqui, os 4 são `comecar.test.ts`, `gestao.test.ts`, `operacao.test.ts`, `referencia.test.ts`). 5 ocorrências dos 5 nomes + 33 de "WAP" = **38**, batendo exatamente com o fato 41.

### 2.2 O que `import-de-startup.ts` diz HOJE (arquivo inteiro lido, 264 linhas)

- **`site_divergente` / filial fora do De→Para: NÃO é mencionado.** A tabela de "Ler o preview" (linhas 74-141) só descreve dois desfechos para o cartão "Site": (a) `:88-92` "filial escrita diferente" → `"Definir como {filial} (N linhas)"`; (b) `:93-97` "de OUTRA filial" → só remover. **Não existe hoje uma terceira linha para "a filial escolhida na tela nem está no vocabulário"** — que é exatamente o bug que a Frente A desta fase corrige (hoje toda linha vira `site_divergente` sem diagnóstico, fato 5 do cabeçalho). Depois da Frente D, com o cadastro de apelidos em Filiais, essa tabela provavelmente ganha uma orientação nova ("cadastre o apelido em Administração › Filiais").
- **Tetos de arquivo: só o teto de TAMANHO existe hoje, via constante.** `:59` `` `...o limite é ${TAMANHO_MAX_ROTULO}.` `` e a linha da tabela de erros `:205` `` `O arquivo tem {x} MB — o limite é ${TAMANHO_MAX_ROTULO}.` `` — hoje isso resolve para "5 MB" (de `limites.ts`). **Não há NENHUMA menção a teto de LINHAS ou de COLUNAS** — porque `MAX_LINHAS_PLANILHA`/`MAX_COLUNAS_PLANILHA` ainda não são aplicados no motor (fato 21: só o `.xlsx` recusa, o CSV não tem teto nenhum hoje). Depois da Frente C, a tabela de erros (linhas 195-251) precisa ganhar pelo menos duas linhas novas (linha acima do teto; coluna acima do teto) e possivelmente uma para `linha_desalinhada`.
- **Não há menção aos 8 MB nem ao limite real de 4,5 MB da Vercel** — o texto só fala do teto de ARQUIVO (5 MB), nunca do teto de CORPO da requisição. Isso é esperado (o operador não precisa saber de bytes de payload), mas se a Decisão 6 mudar o teto do arquivo (hoje 5 MB) por causa da conta dos 4,5 MB, o texto de `:205` muda sozinho (é derivado de `TAMANHO_MAX_ROTULO`) — **sem exigir edição manual**, contanto que o rótulo continue vindo da mesma constante.
- **O que "Substituir tudo" apaga:** `:43` "apaga o acervo atual da filial (ativos, linha do tempo, termos e anotações) e recria tudo a partir do arquivo" e `:189` "ativos, movimentações, anotações e termos são apagados". **Não menciona `pendências de item` nem `lançamentos de item`** — porque hoje a RPC nem tenta tocar neles (é o que EXPLODE com `23503`, fato 27-29). Depois da Frente F, o texto tecnicamente ainda pode ficar do jeito que está (o operador não precisa saber de FK) — mas se a pendência de item da filial some (ela É apagada pela Decisão i, diferente dos lançamentos que só são desvinculados), há um efeito novo, visível: "o que foi junto" (`itens-que-foram-junto.tsx`) de um ativo TRANSFERIDO cujo lançamento ficava preso ao acervo antigo pode perder o vínculo com a movimentação apagada. **Recomendo pelo menos uma frase nova em `:184-193` ("O que muda depois de aplicar")** dizendo que pendências de item em aberto daquela filial também são encerradas pela substituição — hoje NADA no texto avisa disso, porque hoje isso não acontecia (o import simplesmente falhava).

### 2.3 `problemas-import-e-acesso.ts` (196 linhas, lido por inteiro)

- 4 sintomas na seção "O import de startup" (`:30-81`): arquivo recusado no envio (`:34-45`), dois cadastros por conflito entre filiais (`:46-56`), preview bloqueado (`:57-68`), erro no "Substituir tudo" (`:69-79`).
- **Não existe hoje um sintoma para "a filial certa está selecionada mas toda linha vira erro de Site"** — é exatamente o sintoma do bug que a Frente A resolve; um sintoma novo aqui documentaria "antes: toda linha bloqueava sem dizer por quê; agora: cadastre o apelido, ou confira se a filial está ativa/no vocabulário".
- `:74` já cita `"A conferência do import não bateu e nada foi alterado — gere o preview novamente. Se persistir, avise o TI."` — mensagem de TOCTOU (contagens); pode precisar de nota sobre a nova regra "chave ausente vale 0" se isso mudar o texto da mensagem.
- Não cita nada de FK/backup/pendência de item — correto, é detalhe interno.

### 2.4 `mensagens-de-erro.ts` — não é sobre import de startup

Confirmei que este arquivo é o catálogo GERAL de mensagens do sistema (cadastro manual, transferência, itens…), com **1 menção a "WAP"** (`:105`, exemplo de formato de patrimônio no cadastro manual — nada a ver com o import) e nenhuma linha específica de `site_divergente`. Não é uma das "páginas de mensagens e problemas do import" citada no fato 41 — as duas páginas relevantes são `import-de-startup.ts` (o guia) e `problemas-import-e-acesso.ts` (o troubleshooting), confirmadas acima. O link cruzado em `import-de-startup.ts:257` já aponta para `problemas-import-e-acesso`.

### 2.5 Testes `toContain` que prendem essas frases (arquivo:linha)

Em `src/lib/ajuda/conteudo/gestao.test.ts`, bloco `describe('import de startup', …)` (linhas 729-800ish):

- `:204` — `contem('import-de-startup', TAMANHO_MAX_ROTULO)` — deriva da constante, sobrevive a mudança de valor.
- `:731-737` — os 5 passos do wizard + "Analisar arquivo"/"Substituir tudo"/"para confirmar"/"Baixar backup".
- `:740-746` — "agrupadas por VALOR", "sugestão", "Correções aplicadas", "Desfazer", "sem efeito", "NUNCA é alterado".
- `:749-753` — "Aplicar tudo o que está pronto", "Aplicar todas as correções", "linhas prontas", "faltam".
- `:756-760` — "VERMELHO é bloqueante", "ÂMBAR é aviso", "Import bloqueado", "Pronto para aplicar".
- `:763-768` — "Usar mesmo assim", "Sem patrimônio", "sem patrimônio físico", "sem service tag (importam com pendência)", "preenchidos automaticamente pelo hostname".
- `:771-773` — "repete a marca", "HP Pro SFF 280 G9".
- `:776-781` — "O que o import NÃO faz", **"único modo"**, **"UMA filial"**, "não há sincronização com o Excel", "snapshots de relatório já congelados permanecem".
- `:784-800` — a tabela de erros tem de ter ≥2 blocos `tipo: 'tabela'` e cada linha com 3 colunas coerentes (não pina texto exato — só formato).

**Nenhum `toContain` hoje pina texto sobre `site_divergente`, teto de linhas/colunas, ou o destino de pendência/lançamento de item** — ou seja, a Frente H pode ADICIONAR conteúdo novo sem quebrar teste nenhum, mas precisa **preservar literalmente** as ~25 substrings acima ao editar os parágrafos onde elas vivem (`:31,43,60,189` do próprio `import-de-startup.ts`). "Único modo" (pinado em `:778`) está na frase de `:43` — cuidado ao reescrever essa frase para acomodar a nova exceção do FK.

Em `src/lib/ajuda/conteudo/referencia.test.ts`, bloco `describe('problemas-import-e-acesso …')` (`:655-706`+): testes de estrutura (`sintomasDe`, `:685,699,706` com `toContain` sobre o texto cru) — não vi neles nenhuma substring especificamente sobre FK/backup; são sobre o formato de sintoma/causa/saída, não sobre o conteúdo do import.

---

## PARTE 3 — O fechamento (fato 42)

### 3.1 `src/lib/versoes/registry.ts` — formato da entrada do topo (linhas 24-37, lido por inteiro)

```ts
export const VERSOES: readonly EntradaVersao[] = [
  {
    versao: '1.60.0',
    data: '2026-09-10',
    fase: 'F55',              // opcional — só quando é uma FASE (ordem F*)
    titulo: 'O sistema passou a se conferir sozinho e a avisar quando quebra',
    mudancas: [ /* 2 a 6 strings, linguagem de operador */ ],
  },
  { /* entrada seguinte, mais antiga */ },
  ...
]
```
`VERSOES[0]` é a versão no ar (`registry.test.ts:130` compara com `package.json.version`). A F56 empilha **1.61.0** no topo, com `fase: 'F56'`.

### 3.2 `registry.test.ts:157-189` — os 21 termos de desenvolvedor recusados (confirmados, batendo com o fato 42)

`'Server Action'`, `'Server Component'`, `'RLS'`, `'row-level security'`, `'migration'`, `'trigger do banco'`, `'endpoint'`, `'payload'`, `'jsonb'`, `'PostgREST'`, `'Supabase'`, `'RPC'`, `'policy'`, `'Postgres'`, `'commit'`, `'deploy'`, `'enum'`, `'schema'`, `'Next.js'`, `'TypeScript'`, `'Vercel'` — a checagem é `JSON.stringify(VERSOES).includes(termo)` (`:183-188`), então **maiúsculas importam** (`'RPC'` bate, `'rpc'` não) — cuidado ao redigir a entrada 1.61.0: nada de "migration 0139/0140" no texto (a Decisão 9/registry precisa falar em "arquivo de segurança"/"um passo interno do banco", nunca "migration").

### 3.3 `src/lib/versoes/cobertura-changelog.test.ts` (126 linhas, lido por inteiro)

Três invariantes que a entrada nova da F56 tem de satisfazer:
1. `:74-86` — toda fase (`F56`) citada no `CHANGELOG.md` precisa ter `fase: 'F56'` em algum item de `VERSOES` (ou estar em `SEM_VERSAO`, que **não é o caso aqui**).
2. `:95-113` — cada entrada do `CHANGELOG.md` (por cabeçalho `## dd/mm/aaaa — …`) precisa de uma versão PRÓPRIA na MESMA data — se a F56 fechar em duas entregas no mesmo dia (ex.: uma para 0139/vocabulário e outra para 0140/FK), são DUAS entradas de `## data` e DUAS de `VERSOES`, não uma.
3. `:119-124` — o registry não pode citar uma fase que o CHANGELOG não cita — a entrada nova em `registry.ts` com `fase: 'F56'` exige que o `CHANGELOG.md` tenha um cabeçalho `## 11/09/2026 (ou a data real) — F56 · …` citando literalmente `F56`.

A regex de detecção de fase é `FASE = /\bF\d+[A-Z]?(?:-UX)?\b/g` (`:32`) — bate `F56` sem problema.

### 3.4 `CHANGELOG.md` — formato de uma entrada (topo lido, linhas 1-60)

```md
## 10/09/2026 — F55 · Observabilidade, sonda e alarme de integridade ✅ 🔒

**v1.60.0** · migration `0138` · Fase **invisível ao operador**: <resumo de 1-2 frases>.
Ata completa em [`docs/DECISOES.md`](docs/DECISOES.md); ...

- ✅ **<subtítulo em negrito>.** <corpo, com números medidos e trechos técnicos — este
  arquivo É espaço de vocabulário de desenvolvedor, ao contrário do registry>.
- 🔎 / 🔒 <mais itens>
```
Legenda no topo do arquivo (`:5`): ✅ concluída · 🚧 pendente · 🔒 em produção. A entrada da F56 precisa citar as DUAS migrations (`0139` e `0140` — ou só a `0139` se a `0140` ficar presa no classificador, com 🚧 sinalizando a pendência) e a versão `**v1.61.0**` (ou `1.61.0` + `1.61.1` se vier em duas entregas).

### 3.5 `docs/MATRIZ-REGRAS.md` — família `R-IMP-`, formato e a última regra

Formato da tabela (cabeçalho em `:181` região): `| ID | Regra | Fonte | Onde vive (conferido) | Prova | Veredito |`. A família `R-IMP-` vai de `R-IMP-02` a `R-IMP-41` (não sequencial — há buracos e repetições de número, ex. duas linhas `R-IMP-29` distintas, uma em `:209` outra em `:214` — **defeito pré-existente no documento, não desta fase**). **A ÚLTIMA linha `R-IMP-` é `R-IMP-41`, linha 226**, exatamente como o fato 42 diz:

> `| R-IMP-41 | Gate destrutivo do runbook: a RPC tem `delete from ativos/movimentacoes`, então o classificador do modo automático barra o apply direto em produção — o SQL da migration é entregue p/ rodar pelo SQL Editor (precedente 0033–0048) | docs/DECISOES; cabeçalhos das migrations 0040/0048; memória f7-import | cabeçalhos supabase/migrations/0048_import_service_tag_pendencia.sql:17-20 e 0040_hardening_rpcs.sql:22-24 | nenhuma (processo operacional, não código) | CONFORME-POR-LEITURA |`

**Esta linha precisa de emenda** — ela afirma que o classificador barra o *apply* e manda para o SQL Editor; a ata de 09/09 (`docs/DECISOES.md:9405-9408`, "⚠ DIVERGÊNCIA DO RUNBOOK — o gate não disparou") e a Decisão (iv) desta fase mostram que o classificador **não dispara na DEFINIÇÃO de função** (só, possivelmente, na EXECUÇÃO). A emenda da Frente H (critério de aceitação, linha 734 do prompt) manda **regras novas a partir de `R-IMP-42`** e a **`R-IMP-41` emendada** — não reescrita no lugar (a tabela é apend-only por convenção — ver as "Emendas F52-F55" no fim do arquivo, cada uma em bloco próprio com nota de escopo).

O padrão de emenda (visto em `:552-591`, Emendas F53/F54/F55): título `### Emenda F56 (data) — <assunto>`, tabela nova com IDs `R-IMP-42`+ (ou família nova, se o fechamento preferir), e um parágrafo final `> **Nota de escopo — o que a emenda F56 NÃO afirma.** (1) ... (2) ...` — replicar esse molde.

### 3.6 `docs/ESPECIFICACAO.md` §5 e §10.2

- **`:205`** — `` Prefixos vistos: WAP, PRO, LEA, TEC, STF, PAT, NOO. `` — texto a emendar: os 7 prefixos passam a morar no banco (tabela nova da Decisão 1); a linha deveria dizer isso e não mais listar os 7 valores como se fossem fixos no texto (ou manter a lista como referência humana, mas com uma nota "fonte: tabela X no banco, seed em `0139`").
- **`:211`** — `` **Unidades:** `CD-AFP` = `CD-Afonso Pena`; `CD-PENA` = `CD-Afonso Pena`; `Afonso Pena` = `CD-Afonso Pena`; `Eusebio` = `Eusébio`; `Filial-CE` = `Eusébio`; `Serra Park` = `Serra`; "Matriz " (com espaço) = `Matriz`. *(Ampliado em 15/07/2026...)* `` — esta lista **já diverge** do `deparas.ts` real (18 chaves) — não cita `linhares`/`filial-ce`/`filial ce`/`filial linhares`/`filial - linhares`/`cd afp`/`cd pena`/`cd-afonsopena`/`matriz sao marcos` (a spec nunca foi atualizada com a ampliação real do De→Para). A emenda da F56 é a oportunidade de: (a) corrigir a lista para os 13 apelidos reais, OU (b) trocar a lista fixa por uma frase apontando para a tabela do banco (`unidades_apelidos`) como fonte única — recomendo (b), para não repetir o problema "documento cópia envelhece" (regra 1 do `docs/README.md:83`).
- **`:401-425`** (§10.2) — o parágrafo grande sobre "Salvaguardas obrigatórias" (`:415`) já cita: *"preview com o custo à vista... backup automático do acervo antes de aplicar... Snapshots congelados (relatorios_gerados) não são tocados."* — **não cita `pendencias_item`/`lancamentos_item`**, porque hoje a RPC nem tenta apagá-los (é a bomba). Emenda necessária: acrescentar a nova mecânica (backup cobre os dois elos e os ponteiros; pendências de item da filial substituída são encerradas; lançamentos ficam desvinculados sem mudar saldo). **Não encontrei, na leitura completa das linhas 395-425, nenhuma menção literal a "8 MB"** (diferente do que o prompt sugeria em `:413,418`) — a única referência de tamanho de corpo é indireta, dentro da Emenda F7F (`:418`): *"teto de corpo da Server Action elevado para **8 MB** (`bodySizeLimit`; o maior plano real mede ~0,7 MB)"*. **Esta é a linha que precisa da correção do fato 22** (o teto real em produção é 4,5 MB, não 8) — arquivo:linha exato: **`docs/ESPECIFICACAO.md:418`**, dentro do texto da Emenda F7F.

### 3.7 `docs/ARQUITETURA.md` §10 (tabela "Quero mudar X → mexo em Y")

**Linha exata, `:104`:**
> `| um vocabulário De→Para (motivo, unidade) | `src/lib/dominio.ts` / `src/lib/import/deparas.ts`; cadastro em `admin/motivos` ou `admin/filiais` |`

Fica **falsa** depois da Decisão (ii): unidade (e Tipo/Situação/prefixo) deixam de ser um arquivo TS e passam a ser tabela no banco + tela em `admin/filiais` (apelidos) — `deparas.ts` continua existindo como camada de leitura/normalização, mas não é mais onde o vocabulário É editado. Emenda sugerida: separar a linha em duas — "um vocabulário De→Para de MOTIVO" (continua `dominio.ts` + `admin/motivos`) e "o vocabulário do IMPORT (unidade/tipo/situação/prefixo)" (tabela nova + `admin/filiais` para apelidos; Tipo/Situação/prefixo sem tela — só seed).

Também §6 (`:72-78`, "Import de startup por filial") tem a frase `:78`: *"A RPC destrutiva **bate no 'gate'** do modo autônomo... suas migrations são aplicadas à mão pelo Johnny no SQL Editor."* — **mesma correção do R-IMP-41**: precisa refletir que o agente aplica (decisão iv), com a ressalva do classificador.

### 3.8 `docs/RUNBOOK-BANCO.md` — "O gate do modo automático" (linhas 43-47, texto integral)

```md
## O "gate" do modo automático

O classificador do modo autônomo **bloqueia** qualquer DDL cujo corpo contenha `delete from
public.ativos` ou `delete from public.movimentacoes` (via `apply_migration`/`execute_sql` do MCP)
— em **qualquer** projeto, prod ou ensaio. Na prática isso atinge só a RPC destrutiva do import
(`importar_ativos_substituir`, migrations 0031–0037, 0040). O objetivo é impedir que o agente
rode uma exclusão de acervo sem um humano no circuito.

**Consequência (dívida conhecida):** essas migrations são aplicadas **à mão pelo Johnny no SQL
Editor** e, por isso, **não são registradas** em `supabase_migrations.schema_migrations`. ...
```

Isto contradiz a medição do fato 31 (a ata de 09/09, `docs/DECISOES.md:9405-9408`): o classificador **não disparou** na definição da função (`create or replace function ... delete from public.ativos ...` passou por `execute_sql`), só (possivelmente) dispararia na EXECUÇÃO real do `delete`. A seção precisa emenda dizendo isso explicitamente — e a subseção **`### B) Migration DESTRUTIVA...` (linhas 54-75)**, que hoje descreve só o fluxo "Johnny cola no SQL Editor", precisa de um parágrafo novo para o caminho "agente aplica via MCP, com a mesma verificação pós-apply" (o molde já documentado em `docs/f55-evidencias/C2-apply-0138.txt`, citado no prompt). Sugiro registrar como uma entrada no "Anexo A — histórico de apply" (`:518+`, o padrão já usado pelas fases anteriores) mais a correção do corpo da seção 43-47/54-75 — não um anexo novo (o documento já tem a convenção "histórico vai para anexo" só para o LOG de applies, não para a regra em si).

### 3.9 `docs/README.md` — onde PLAN/RELATORIO novos entram no índice

Seção **"Histórico — leia para arqueologia, não para trabalhar"** (`:72-79`):
- **`:76`** — `` **Relatórios de fase** — `RELATORIO-F11.md` → `RELATORIO-F55.md` (mais `F19-RELATORIO.md`...): ... As pastas `f45-evidencias/` a `f55-evidencias/` guardam as saídas... `` → precisa virar `→ RELATORIO-F56.md` e a faixa de pastas `f45-evidencias/` a `f56-evidencias/`.
- **`:77`** — `` **Planos de fase** — `PLAN-F30.md`, ..., `PLAN-F45.md`, `PLAN-F55.md`: ... `` → acrescentar `PLAN-F56.md` à lista.
- **`:79`** — a frase-lista de conteúdo de cada pasta de evidências (`f45-evidencias/` ... `f44-evidencias/`) não cita F46-F55 individualmente (o padrão já é citar só até certo ponto e depois parar de detalhar) — **não** parece exigir entrada obrigatória para `f56-evidencias/`, mas é o lugar natural se quiser descrevê-la.
- A regra geral de `:86` confirma: documentação interna (README, runbook, `PLAN-F56.md`, `RELATORIO-F56.md`) **não entra no CHANGELOG** — só em `docs/DECISOES.md` (já é a prática desta fase, conforme `CLAUDE.md`).

### 3.10 `scripts/smoke/README.md` (272 linhas, lido por inteiro)

Estrutura hoje: título → "Por que está em scripts/ e não scratchpad/" → "O que o script confere" (Parte A sem sessão / Parte B logada) → "Credenciais — só por variável de ambiente" (a cascata `SMOKE_*` → `.env.local` → `NEXT_PUBLIC_*` → URL pública Vercel, `:68-76`, exatamente a cascata que o fato 37 avisa para o smoke do import **NÃO** copiar) → "Como ler a saída" → "O smoke agendado" → "Roteiro de conferência visual (12 passos)" → "Notas de manutenção". **O arquivo cobre só `smoke-prod.mjs`** (produção); não há nenhuma seção sobre ensaio nem sobre import. O critério da ordem (Frente H, linha 737 do prompt) pede este README com "o smoke novo e a `sede` como fixture permanente do ensaio" — o padrão de seção a seguir é o mesmo da Parte A/B (o que confere, credenciais — aqui só `NEXT_PUBLIC_*` + chave de serviço, nunca `SMOKE_*`), com uma nota tão explícita quanto a de `:51` ("o script nunca imprime conteúdo de linha") avisando que este roda só contra ENSAIO e nunca produção.

---

## Armadilhas encontradas

1. **"matriz" é ambíguo no próprio código-fonte** (filial × grade/tabela genérica) — qualquer trava baseada em substring cega superconta; é preciso == identificador (fora do escopo) versus literal (dentro), e mesmo assim sobra "matriz de cobertura" como STRING dentro de comentário (não string de código) em pelo menos 3 arquivos.
2. **`resolver-patrimonio.ts:93`** usa um template literal com "WAP0004491" como exemplo de formato — é runtime (mensagem ao usuário), não comentário; se a trava não abrir exceção para "exemplo de formato", ela pega este arquivo mesmo sem nenhuma regra de negócio de filial ali.
3. **`docs/ESPECIFICACAO.md:211`** (Unidades) já está desatualizada HOJE, antes mesmo da F56 — não lista 9 dos 13 apelidos reais. Copiar essa lista para a migration por "seguir a spec" reproduziria o erro; a fonte real é `deparas.ts:181-200`.
4. **`MATRIZ-REGRAS.md` tem `R-IMP-29` duplicado** (linhas 209 e 214, dois assuntos diferentes com o mesmo ID) — defeito pré-existente, não desta fase, mas relevante se a Frente H for renumerar a família.
5. **`gestao.test.ts` pina "único modo" e "UMA filial"** dentro da MESMA frase que precisa mudar para acomodar a exceção do FK (`import-de-startup.ts:43`) — reescrever com cuidado para não apagar essas substrings.
6. **A cascata `SMOKE_*` do `smoke-prod.mjs` mira produção por padrão** (`:68-76` do README) — o README novo do smoke de import precisa deixar isso preto no branco como algo a NUNCA importar, e a guarda do script precisa recusar programaticamente, não só documentalmente (fato 37/39e da ordem, fora do escopo desta tarefa mas mencionado aqui porque toca `scripts/smoke/README.md`).
