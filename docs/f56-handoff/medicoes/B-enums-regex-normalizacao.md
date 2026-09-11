# B — Enums, regex de patrimônio e normalização (F56 / Frente B)

Medição refeita em 11/09/2026 (sessão desta ordem). Fatos-alvo: 10, 16, 17, 18, 19, 20. Medição obrigatória 4.

Regras seguidas: nenhum arquivo versionado editado (`git diff --stat` vazio ao final); todo arquivo de trabalho
nasceu `zz-f56-*` na raiz do repo e foi apagado ao terminar; banco só por `SELECT` (ensaio `sgmvldiizsrjbxzzpmhh`);
nenhum dado real — os "dados" usados nas consultas SQL são code points Unicode sintéticos e strings de teste
(`ß`, `İ`, `ab:cd`…), não linhas de planilha nem cadastro.

---

## 1. Fato 16 — os enums redeclarados e o `Exclude` no-op

`src/lib/import/tipos.ts`:
- `:44-52` — `StatusAtivo` local, **8 valores**: `em_estoque | reservado | em_uso | emprestado | em_triagem |
  em_manutencao | defasado | descartado`. **Falta `devolvido_fornecedor`** (o banco tem 9 — confirmado em
  `database.ts:1765-1774` e `Constants.public.Enums.status_ativo`, linhas 1937-1947).
- `:64-69` — `CategoriaAtivo` local, **5 valores**: `notebook | desktop | monitor | celular | tablet`. **Falta
  `outro`** (o banco tem 6 — `database.ts:1756-1762` / `Constants…categoria_ativo`, linhas 1927-1934).
- `:54-63` — comentário confirma que `outro` **saiu** da união em 30/08/2026 (dívida I): *"outro morou aqui até
  30/08/2026… três `Exclude<CategoriaAtivo,'outro'>` e um guard de runtime… existiam só para satisfazer o tipo. Tirar
  o valor foi o que apagou os quatro."* Ou seja: os `Exclude<CategoriaAtivo,'outro'>` da ficha **não existem mais no
  repositório** — sobrevive só a MENÇÃO em comentário (`tipos.ts:61`), que eu excluí da contagem de usos reais (ver §3).

`src/lib/import/deparas.ts:316-319`:
```ts
export const SITUACAO_CANONICA: Record<
  Exclude<StatusAtivo, 'descartado' | 'devolvido_fornecedor'>,
  string
> = { em_estoque: 'Estoque', em_uso: 'Saída', reservado: 'Reservado', emprestado: 'Empréstimo',
      em_triagem: 'Validar', em_manutencao: 'Manutenção', defasado: 'Defasado' }
```
`StatusAtivo` aqui é o LOCAL de `tipos.ts` (8 valores, sem `devolvido_fornecedor`). `Exclude<T,U>` com um membro de
`U` fora de `T` simplesmente IGNORA esse membro — **não há erro, nem warning, nem diferença de tipo resultante**.
Prova por igualdade estrutural de tipo (ver §3): `Exclude<StatusAtivoLocal,'descartado'|'devolvido_fornecedor'>` é
**idêntico** a `Exclude<StatusAtivoLocal,'descartado'>`. É o no-op literal da ficha.

`dominio.ts:7,9` já faz a coisa certa: `export type StatusAtivo = Enums<'status_ativo'>` /
`export type CategoriaAtivo = Enums<'categoria_ativo'>` — union derivada do banco (9 e 6 valores). O ponto cego é
só o par local de `import/tipos.ts`, usado pelo motor de import e por 3 componentes do wizard.

### Quem consome o `StatusAtivo` LOCAL do import (não o de `dominio.ts`)
```
src/components/admin/importar/ops-grupo.ts:15    import { ... } from '@/lib/import/deparas'
src/components/admin/importar/ops-grupo.ts:17-…  import type { ... StatusAtivo ... } from '../../../lib/import/tipos' (via barrel)
src/components/admin/importar/grupos-erros.tsx:20 import { extrairPatrimonioDoHostname, SITUACAO_CANONICA, TIPO_CANONICO } from '@/lib/import/deparas'
```
(confirmado por `grep` — ambos importam o tipo do módulo de import, não de `@/lib/dominio`). Usos de `Exclude` com
esse `StatusAtivo` local:
- `ops-grupo.ts:137` — `est as Exclude<StatusAtivo, 'descartado' | 'devolvido_fornecedor'>`
- `grupos-erros.tsx:67` — `Record<Exclude<StatusAtivo, 'descartado' | 'devolvido_fornecedor'>, …>`
- `grupos-erros.tsx:321` — `Exclude<StatusAtivo, 'descartado' | 'devolvido_fornecedor'> | null`
- `deparas.ts:317` (acima)
- `deparas.test.ts:108-111` — o mesmo par, num tipo de fixture (`ESPERADOS: Exclude<StatusAtivo,'descartado'|
  'devolvido_fornecedor'>[]`)

**Os 5 usos reais do padrão-problema estão todos no módulo de import e seus 2 consumidores diretos de componente.**
Quando `StatusAtivo` do import passar a ser `Enums<'status_ativo'>` (Decisão do prompt, "os enums do import vêm do
banco"), esses 5 `Exclude` deixam de ser no-op automaticamente — a exclusão de `'devolvido_fornecedor'` passa a
remover um membro real (o import nunca produz baixa terminal como alvo), que é exatamente a intenção documentada.

---

## 2. Fato 17 — o `Exclude` cru não reclama, e o caminho de CI que reprova

**Confirmado por sabotagem** (arquivo `zz-f56-sabotagem-exclude.test.ts` criado na RAIZ do repo — pego pelo
`tsconfig.json` via `"include": ["next-env.d.ts","**/*.ts","**/*.tsx",...]`, rodado com `npx tsc --noEmit -p .` e
apagado ao final):

```ts
type StatusAtivoLocal = 'em_estoque'|'reservado'|'em_uso'|'emprestado'|'em_triagem'|'em_manutencao'|'defasado'|'descartado'
type NoOp = Exclude<StatusAtivoLocal, 'descartado' | 'devolvido_fornecedor'>
// nenhum erro aqui — prova o no-op (não precisou de @ts-expect-error)

type ExcluirEstrito<T, U extends T> = Exclude<T, U>
type ExemploValido   = ExcluirEstrito<StatusAtivoLocal, 'descartado'>                       // ok, sem erro
// @ts-expect-error — 'devolvido_fornecedor' não está em StatusAtivoLocal; utilitário estrito recusa
type ExemploInvalido = ExcluirEstrito<StatusAtivoLocal, 'descartado' | 'devolvido_fornecedor'> // ESTE @ts-expect-error é NECESSÁRIO

type StatusAtivoDoBanco = StatusAtivoLocal | 'devolvido_fornecedor'
// @ts-expect-error — SOBRA: agora 'devolvido_fornecedor' pertence à união, não há erro para suprimir
type ExemploFicouValido = ExcluirEstrito<StatusAtivoDoBanco, 'descartado' | 'devolvido_fornecedor'>
```

Rodando `npx tsc --noEmit -p .` no repo inteiro (baseline limpo — confirmado por rodada sem o arquivo de sabotagem:
0 erros): com o arquivo acima, a saída foi **exatamente 1 erro**, `exit 1`:
```
zz-f56-sabotagem-exclude.test.ts(41,1): error TS2578: Unused '@ts-expect-error' directive.
```
Ou seja: (a) o `Exclude` cru realmente não reclama (linha do `NoOp` compilou limpo); (b) o utilitário estrito
`ExcluirEstrito<T, U extends T>` REJEITA de verdade — o `@ts-expect-error` da linha `ExemploInvalido` foi consumido
(não sobrou "unused" para ele, só para o terceiro caso); (c) quando a proibição deixa de fazer sentido (o valor
"fora da união" passa a pertencer a ela), o `@ts-expect-error` que ficou para trás é acusado por `TS2578` — **é
esse erro que prova que o teste de tipo morreria de propósito se alguém esquecesse de atualizar a exclusão**.

**O caminho de CI que reprova:** `npm run build` = `next build` (`package.json:7`); o passo do CI
(`.github/workflows/ci.yml:88-89`) chama-se literalmente *"Build (inclui type-check do TypeScript)"*. O
`tsconfig.json` (`include: ["**/*.ts","**/*.tsx",...]`, sem exclude de teste) cobre `*.test.ts` — e a prova acima
com `tsc --noEmit -p .` (que usa o MESMO `tsconfig.json` do projeto) reproduz esse universo de arquivos:
1 erro, no arquivo de teste, nada mais. **O Vitest NÃO faz checagem de tipo** — `vitest.config.mts` não declara o
bloco `test.typecheck` em nenhum dos dois projetos (`puro`/`componentes`); os testes rodam via `esbuild`
(transpile-only), que apaga tipos sem verificá-los. **Portanto o teste de tipo do fato 17 TEM que morar num
`.ts`/`.tsx` comum (não precisa ter `.test.` no nome — o Vitest não o rodaria mesmo, e não faz mal ele não rodar:
quem o verifica é o `tsc` do `next build`), incluído pelo `tsconfig`** — por exemplo
`src/lib/import/tipos.ts` mesmo (ou um arquivo `*-tipos.test.ts` ao lado, já que o *nome* do arquivo é irrelevante
para o `tsc`; usar `.test.ts` só ajuda humanos a saberem que é teste, sem risco: o Vitest simplesmente NÃO
executa asserções nele, e não precisa — o valor dele é 100% em tempo de compilação). Não precisa de `expect()`
nenhum; o corpo é só declaração de tipo com `@ts-expect-error` nos casos que devem falhar.

**Não rodei `npm run build`** (proibido pela ordem — outro processo usa `.next`); a prova ficou inteira em
`tsc --noEmit -p .`, que é o mecanismo que o `next build` delega por baixo (mesmo `tsconfig.json`, mesmo
`skipLibCheck`, mesmo `strict`).

---

## 3. `Exclude<` em `src/` — censo completo (Decisão 4)

```
grep -rn "Exclude<" src   →   14 ocorrências de TEXTO, 13 de CÓDIGO real (1 é prosa em comentário)
```

| # | arquivo:linha | união | membro(s) excluído(s) | é enum vindo do banco? |
|---|---|---|---|---|
| 1 | `components/admin/importar/ops-grupo.ts:137` | `StatusAtivo` (import local) | `'descartado' \| 'devolvido_fornecedor'` | vira sim, após Frente B |
| 2 | `components/admin/importar/grupos-erros.tsx:67` | idem | idem | idem |
| 3 | `components/admin/importar/grupos-erros.tsx:321` | idem | idem | idem |
| 4 | `lib/import/deparas.ts:317` | idem | idem | idem |
| 5 | `lib/import/deparas.test.ts:108` | idem (fixture) | idem | idem |
| 6 | `components/pendencias/fila-pendencias-tabela.tsx:49` | `FaixaIdadePendencia` (local) | `'nova'` | não |
| 7 | `components/pendencias/fila-pendencias-tabela.tsx:53` | idem | `'nova'` | não |
| 8 | `app/(app)/pendencias/page.tsx:170` | `TipoPendencia` | `'conflito'` | não |
| 9 | `lib/queries/pendencias-detalhe.ts:75` | `TipoPendencia` | `'conflito'` | não |
| 10 | `lib/queries/relatorios/pendencias.ts:43` | `TipoPendencia` | `'outras' \| 'conflito'` | não |
| 11 | `lib/relatorios/periodo.ts:51` | `PresetPeriodo` | `'custom'` | não |
| 12 | `lib/relatorios/periodo.ts:61` | idem | `'custom'` | não |
| 13 | `lib/relatorios/periodo.ts:127` | idem | `'custom'` | não |

(`lib/import/tipos.ts:61` é PROSA dentro do comentário JSDoc de `CategoriaAtivo` — citação histórica de um
`Exclude` que já foi apagado do código; não conta como uso real.)

**Proposta (Decisão 4):** o utilitário estrito nasce em **`src/lib/tipos.ts`** (não existe hoje um módulo
`lib/tipos.ts` — só `lib/import/tipos.ts`, específico do import; um utilitário de tipo genérico e sem dependência
merece um arquivo novo, pequeno, em `src/lib/`, ao lado de `dominio.ts`/`format.ts`):
```ts
// src/lib/tipos.ts — utilitário de tipo puro, zero runtime, zero dependência
/** Exclude estrito: U tem de ser subconjunto de T — valor fora da união é erro de COMPILAÇÃO,
 *  não um no-op silencioso (o defeito documentado no fato 17 da F56). */
export type ExcluirDaUniao<T, U extends T> = Exclude<T, U>
```
**Escopo da proibição do `Exclude` cru: só o import (itens 1-5 da tabela), não os 8 demais.** Custo de cada opção:
- **Só import** (recomendado): troca 5 usos, todos já no arquivo/consumidores que a Frente B toca por outro
  motivo (o vocabulário migra pra `Enums<...>` de qualquer forma). Custo marginal ≈ zero — é o mesmo diff.
- **`src/` inteiro**: troca as 8 demais, em 5 arquivos que a Frente B **não tem motivo nenhum de abrir**
  (`pendencias/*`, `relatorios/periodo.ts`). Nos 8 casos, o `U` é um LITERAL fixo contra uma união TAMBÉM local
  (não vem de `Enums<'...'>` do banco) — checados manualmente: `'nova'` está em `FaixaIdadePendencia`,
  `'conflito'` está em `TipoPendencia`, `'custom'` está em `PresetPeriodo` (não há indício de drift; nenhuma
  dessas uniões é espelho de enum do Postgres). Ampliar violaria a regra 1 do `CLAUDE.md` ("não aproveite para
  fazer trabalho de outra fase") e o escopo do prompt (que fala em "enums do import"). **Registrar os 8 como
  candidatos de um cleanup à parte** (baixo risco, baixo valor — eles não têm o padrão de risco de drift que
  motiva a regra: união e exclusão vivem no MESMO arquivo, versionadas juntas).

---

## 4. Fato 18/19 — a regex de patrimônio, quatro cópias e o SQL morto

### As quatro cópias em TS (todas em `src/lib/patrimonio.ts` + 1 em `deparas.ts`)
| # | arquivo:linha | regex | semântica exata |
|---|---|---|---|
| 1 | `patrimonio.ts:5` | `PATRIMONIO_CANONICAL_RE = /^[A-Z]{2,4}\d{7}$/` | valida STRING JÁ canônica: 2-4 letras maiúsculas + exatamente 7 dígitos, ancorada início-fim. |
| 2 | `patrimonio.ts:13` | dentro de `canonicalizarPatrimonio`: `t.match(/^([A-Z]{2,4})(\d+)$/)` | aceita QUALQUER quantidade de dígitos (`\d+`, sem teto aqui — o teto de 7 dígitos SIGNIFICATIVOS é checado depois, em código, `if (significativos.length > 7) return null`), sobre o texto já em maiúsculas/sem espaço/hífen. |
| 3 | `patrimonio.ts:142-143` (`expandirFaixa`) | `ini.match(/^([A-Z]{2,4})(\d{7})$/)!` (×2, início e fim da faixa) | re-parseia o resultado JÁ canonicalizado (por isso `\d{7}` exato — o `!` assume que `canonicalizarPatrimonio` sempre devolve 7 dígitos). |
| 4 | `deparas.ts:166` | `PATRIMONIO_EMBUTIDO_RE = /(?:^|[^A-Z0-9])([A-Z]{2,4})(\d{1,7})(?![0-9])/g` | busca patrimônio EMBUTIDO em hostname: prefixo 2-4 letras + **1 a 7** dígitos (não 7 fixos — a divergência DELIBERADA, comentada em `:163`: *"aceitar <7 dígitos e travar por prefixo conhecido"*), delimitado por não-alfanumérico (ou início) antes e NÃO seguido de dígito depois (evita capturar prefixo de um número de 8+ dígitos), global (`matchAll`) para pular tokens de prefixo desconhecido. |

**`PARTES_RE` não existe no repositório** (confirmado por `grep -rn "PARTES_RE" src` → vazio). A ficha manda
"derivar de PARTES_RE" como se já existisse — não existe; "derivar" significa CRIAR as partes.

**Testes que prendem essas 4 cópias:** `src/lib/patrimonio.test.ts` — 41 `it`/`it.each` (ver arquivo lido inteiro),
cobrindo `canonicalizarPatrimonio` (zeros à esquerda, caixa, hífen, prefixo 2/4 letras, rejeição de prefixo
inválido/dígitos>7), `PATRIMONIO_CANONICAL_RE` (3 casos), `expandirFaixa` (mesmo prefixo, ordem, teto de lote) e
`parearFaixaComServiceTags`. `deparas.test.ts` não testa a regex diretamente, mas testa `extrairPatrimonioDoHostname`
via casos de uso (não lido linha a linha aqui — está fora da medição 4, mas existe e roda na suíte `puro`).

### Fato 19 — a contagem de `{2,4}` em `supabase/migrations/`
```
grep -rn '{2,4}' supabase/migrations/  →  20 linhas, 14 arquivos
```
Separado por natureza:
- **EXECUTAM (10 linhas, 5 migrations — `0032`→`0036`):** cada uma tem 2 linhas — a checagem operativa
  (`if coalesce(...) !~ '^[A-Z]{2,4}\d{7}$' then`) e a mensagem do `raise exception` que REPETE o padrão como
  texto (`'esperado ^[A-Z]{2,4}\d{7}$'`). Confirmado byte a byte em `0032:121-122`, `0033:153-154`, `0034:173-174`,
  `0035:116-117`, `0036:119-120`.
- **SÓ COMENTÁRIO (10 linhas, 9 migrations):** `0037:4` (cabeçalho, prosa), `0037:106`, `0040:163`, `0048:99`,
  `0064:225`, `0080:140`, `0094:143`, `0131:158`, `0132:361` — todas a MESMA frase *"Antes exigia
  `^[A-Z]{2,4}\d{7}$`"* dentro de `--`; e `0092:41` — comentário sobre o sentinela `SEM_PATRIMONIO`, citando o
  formato só como referência.

5 + 9 = 14 migrations, 10 + 10 = 20 linhas — **bate exatamente com o fato 19**.

**Confirmação de que o SQL VIGENTE não valida formato — via `scripts/db/corpo-vigente.mjs` (não manual):**
```js
const { sql, arquivo } = corpoVigente('public.import_validar_plano')
// arquivo vigente: 0132_guardas_de_escopo.sql (mais recente que 0131, que também a define)
// tamanho do corpo: 7790 caracteres
// tem {2,4} fora de comentário (executável)? false
// tem {2,4} só em comentário? true → linha 105: "-- válido (importa com pendência). Antes exigia `^[A-Z]{2,4}\d{7}$`."
```
O corpo vigente valida só SANIDADE (não-nulo → não-vazio E ≤60 caracteres — `0132:361-368`), nunca formato. É
exatamente o comportamento pós-F7J (patrimônio forçado): o motor TypeScript é o juiz do formato; o banco só barra
lixo (vazio/longo demais).

**API do `corpo-vigente.mjs` usada:** `corpoVigente(assinatura, raiz?)` → `{ sql: string, arquivo: string }`
(`scripts/db/corpo-vigente.mjs:259`); resolve a MIGRATION MAIOR que define a função pelo nome (varredura
decrescente de `listarMigrations()`). Não encontrei nenhum teste Vitest existente que já o use para
`patrimonio` — `grep -rn "corpoVigente(" src` só achou `src/lib/validators/import-uma-porta.test.ts` (usa para
outra função, não patrimônio) — então `patrimonio-sql.test.ts` é NOVO, sem precedente direto além do padrão de uso
da própria `corpo-vigente.mjs` (documentado e testado em `scripts/db/corpo-vigente.test.mts`, que EU não abri —
fora do escopo desta medição, mas existe pelo `vitest.config.mts` incluir `scripts/**/*.test.mts`).

### Proposta — Decisão 5
```ts
// src/lib/patrimonio.ts
export const PREFIXO_RE_SRC = '[A-Z]{2,4}'
export const DIGITOS_RE_SRC = '\\d{7}'
export const PATRIMONIO_CANONICAL_RE = new RegExp(`^${PREFIXO_RE_SRC}${DIGITOS_RE_SRC}$`)
// canonicalizarPatrimonio: new RegExp(`^(${PREFIXO_RE_SRC})(\\d+)$`) — dígitos livres, teto de 7 checado em código (mantém o comportamento atual, não regride)
// expandirFaixa: new RegExp(`^(${PREFIXO_RE_SRC})(${DIGITOS_RE_SRC})$`) — reaproveita as MESMAS partes
```
E em `deparas.ts`:
```ts
import { PREFIXO_RE_SRC } from '@/lib/patrimonio'
// {1,7} explícito AO LADO, com a divergência escrita (já é o padrão do comentário atual, `:163`)
const PATRIMONIO_EMBUTIDO_RE = new RegExp(`(?:^|[^A-Z0-9])(${PREFIXO_RE_SRC})(\\d{1,7})(?![0-9])`, 'g')
```
Isso faz as 3 primeiras cópias derivarem de UMA fonte (`PREFIXO_RE_SRC`/`DIGITOS_RE_SRC`) e a 4ª (hostname) derivar
só do prefixo, com o `{1,7}` mantido like-for-like (não é erro, é intenção documentada — não deve virar `{7}`).
**Comportamento idêntico**, provado pelos 41 testes de `patrimonio.test.ts` continuando verdes sem alteração de
asserção (só a implementação interna muda de regex-literal para regex-composta).

`patrimonio-sql.test.ts` — forma exata proposta:
```ts
import { corpoVigente } from '../../../scripts/db/corpo-vigente.mjs'
import { PATRIMONIO_CANONICAL_RE } from './patrimonio' // ou as PARTES_RE, se exportadas

describe('patrimônio: nenhuma função viva da cadeia de import valida FORMATO', () => {
  it('import_validar_plano (corpo vigente) não tem regex de formato executável', () => {
    const { sql } = corpoVigente('public.import_validar_plano')
    const semComentarios = sql.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
    expect(semComentarios).not.toMatch(/\{2,4\}/)
    // e prova POSITIVA: a sanidade que SUBSTITUIU o formato continua lá
    expect(semComentarios).toMatch(/length\(e->>'patrimonio'\)\s*>\s*60/)
  })
})
```
Ou seja: não é "TS = SQL", é **"o SQL vigente não reimplementa o formato — o formato é MONOPÓLIO do TypeScript"** —
o oposto do molde de `chave-sql.test.ts`. Custo: baixo (a função `corpoVigente` já existe e é testada); risco:
se uma migration futura REINTRODUZIR validação de formato no SQL (por exemplo alguém "ajudando"), o teste
acusa — que é o comportamento desejado (documentar a decisão F7J de que o formato é responsabilidade só do TS).

---

## 5. Fato 20 — paridade de prefixos (confirmada, zero trava hoje)

```ts
// src/lib/import/deparas.ts:152
export const PREFIXOS_PATRIMONIO = new Set(['WAP', 'PRO', 'LEA', 'TEC', 'STF', 'PAT', 'NOO'])
// scripts/import/normalizar.ts:91
export const PREFIXOS_CONHECIDOS = new Set(['WAP', 'PRO', 'LEA', 'TEC', 'STF', 'PAT', 'NOO'])
```
**Mesmos 7 valores, MESMA ordem de inserção.** Hoje não há teste comparando os dois — a paridade é acidental (dois
arquivos, zero import cruzado). Com os prefixos virando SEED no banco (fato 7, decisão ii), a Frente D já cria
`prefixos.test.ts` comparando SEED × `PREFIXOS_CONHECIDOS` de `scripts/import/normalizar.ts` — não recomendo criar
uma trava TS×TS separada para `PREFIXOS_PATRIMONIO`, porque essa constante DEIXA DE EXISTIR como dado no código
(vira parâmetro vindo do banco, pela decisão ii/Decisão 3 do prompt) — a paridade relevante depois da fase é
"seed × `scripts/import/normalizar.ts`", não "dois arrays TS".

---

## 6. Fato 10 / Medição 4 — normalização caractere a caractere

### O que `normalizarTexto` faz, exatamente (`deparas.ts:25-38`)
```
NFD → remove [̀-ͯ] (regex construída via `new RegExp(string,'g')`, não literal — comentário
explica: bytes literais de acento no fonte já viraram mojibake uma vez neste projeto) → toLowerCase()
→ remove UM ':' final (`/:$/`, não-global) → colapsa \s+ → ' ' → trim()
```

### Bateria testada
Script temporário `zz-f56-normalizacao.mts` (raiz do repo, apagado ao final) importou a função REAL
(`import { normalizarTexto } from './src/lib/import/deparas'`, via `tsx`, que resolve o alias `@/*` do
`tsconfig.json` sozinho — confirmado por teste isolado antes da bateria). Testou:
- **U+0000–U+024F** (592, exclui U+0000 — Postgres `text` não aceita NUL; CSV real nunca traz NUL)
- **U+0300–U+036F** (112) · **U+1E00–U+1EFF** (256) · **U+2000–U+206F** (112) · **U+3000** · **U+FEFF** ·
  **U+FB00–U+FB06** (7) — **1080 code points**, cada um testado em CONTEXTO `'a' + X + 'b'` (para distinguir
  "removido como diacrítico" de "colapsado como espaço" de "passagem", já que aplicado sozinho um espaço vira `''`
  igual a um diacrítico removido — ambíguo sem contexto).
- **13 casos especiais** por string completa: `ß`, `İ`, `ı`, `Æ`, `Ø`, `ª`, `º`, NBSP isolado, tab isolado,
  `'abc:'`, `'abc::'`, `'ab : cd'`, `'ab:cd'`.

### Resultado 1 — o `\s` do JS que `normalizarTexto` colapsa (medido, não suposto)
**Exatamente 24 code points** colapsam para espaço único:
```
0x9 0xA 0xB 0xC 0xD 0x20 0xA0 0x2000-0x200A(11) 0x2028 0x2029 0x202F 0x205F 0x3000 0xFEFF
```
Bate com a definição ECMA-262 de `WhiteSpace ∪ LineTerminator` — **inclusive `﻿` (BOM/ZWNBSP), que É
whitespace em JS** (decisão histórica do padrão, não um acidente). Nenhum código de controle C0 além de
tab/LF/VT/FF/CR (ex.: 0x1C-0x1F, 0x0B já coberto) e nenhum U+0085 (NEL) entram no `\s` do JS.

### Resultado 2 — `REMOVIDO` (diacrítico) = exatamente os 112 de U+0300–U+036F
Nenhum code point de FORA dessa faixa (nas faixas 0000-024F e 1E00-1EFF testadas) produziu remoção por
decomposição — ou seja, para todo o conjunto testado, o NFD de um caractere precomposto Latino sempre decompõe
em base + marca(s) DENTRO de U+0300-036F. A regex atual (`DIACRITICOS`) não tem buraco conhecido nesse universo.

### Resultado 3 — caso `İ` (U+0130): a ORDEM salva o resultado
`'İ'.normalize('NFD')` → `'I' + U+0307` (o combining dot above É produzido pelo NFD — confirmado também no
Postgres: `normalize(chr(304), NFD)` devolve os MESMOS 2 code points, `49 cc87` em UTF-8). Como `normalizarTexto`
remove diacríticos **antes** de `toLowerCase()`, o U+0307 já foi apagado quando chega a vez do `toLowerCase`, que
aí opera sobre `'I'` puro → `'i'`. **Se a ordem fosse invertida** (lowercase antes de NFD+strip), o resultado
seria `'i' + U+0307` sobrevivente (2 code points, visualmente quase igual mas tecnicamente diferente) — a ORDEM
ATUAL da função é, portanto, uma decisão correta que precisa ser preservada por qualquer reescrita/candidata SQL.

### Resultado 4 — candidata SQL: **6 divergências com `\s` nativo do Postgres, ZERO com classe explícita**
Ambiente do ensaio: Postgres **17.6**, `encoding=UTF8`, `datcollate=datctype=en_US.UTF-8` (libc). `normalize()` /
`is_normalized()` existem em `pg_catalog`, `provolatile='i'` (IMMUTABLE), `proparallel='s'` (parallel safe) —
confirmado por `select proname, provolatile, proparallel from pg_proc where proname ilike '%normalize%'`.

**Candidata v1** — `btrim(regexp_replace(regexp_replace(lower(regexp_replace(normalize(x,NFD),'[̀-ͯ]','','g')),':$',''),'\s+',' ','g'))`
(mesma ordem de `normalizarTexto`), rodada sobre os 1080 code points em contexto `'a'+chr+'b'` via
`generate_series`/`VALUES`, comparando hash hex UTF-8 do resultado com o hex calculado em JS (`Buffer.from(...,
'utf8').toString('hex')`), tudo numa consulta só (`SELECT ... WHERE hex_pg <> hex_js`). **6 divergências, todas no
`\s` nativo do Postgres**:

| code point | Postgres `\s` trata como espaço? | JS `\s` trata como espaço? |
|---|---|---|
| U+001C, U+001D, U+001E, U+001F (separadores IS4-IS1) | **sim** | não |
| U+0085 (NEL) | **sim** | não |
| U+FEFF (BOM/ZWNBSP) | não | **sim** |

(as faixas U+2000-200A, U+2028/2029, U+202F, U+205F, U+3000 e a NBSP U+00A0 **bateram perfeitamente** entre os
dois lados com `\s` nativo — glibc/`en_US.UTF-8` reconhece a maior parte do `White_Space` Unicode corretamente;
só diverge nesses 5 pontos específicos, historicamente conhecidos: os 4 separadores POSIX/C0 e o NEL são
tratados como espaço por `iswspace()` do glibc mas NÃO fazem parte do `WhiteSpace`/`LineTerminator` do ECMA-262;
o BOM é o inverso — whitespace só por decisão histórica do JS, não por semântica Unicode real).

**Candidata v2** — troca `'\s+'` por uma classe EXPLÍCITA que replica os 24 code points medidos no Resultado 1
(construída via concatenação de `chr(92)` + literais, para não depender de como o backslash atravessa a
transmissão da query — ver armadilha abaixo):
```sql
'[' || chr(92) || 't-' || chr(92) || 'r' || ' ' || chr(92) || 'u00A0'
    || chr(92) || 'u2000-' || chr(92) || 'u200A'
    || chr(92) || 'u2028-' || chr(92) || 'u2029'
    || chr(92) || 'u202F' || chr(92) || 'u205F' || chr(92) || 'u3000' || chr(92) || 'uFEFF' || ']+'
```
Rodada sobre os MESMOS 1080 code points (contexto) **+ os 11 casos especiais** (string completa, sem wrapper):
**ZERO divergências em 1091/1091 casos** — `hex_pg = hex_js` byte a byte, inclusive `İ`→`i`, `ß`→`ß` (inalterado),
`Æ`→`æ`, `Ø`→`ø`, `'abc:'`→`'abc'`, `'abc::'`→`'abc:'` (só UM `:` final sai — `/:$/` não é global, confirmado nos
dois lados), `'ab : cd'`→`'ab : cd'` (inalterado, o `:` do meio nunca é tocado), `'ab:cd'`→`'ab:cd'`.

### Postgres `normalize(NFD)` decompõe IGUAL ao V8/Node
Confirmado pontualmente (café, İ) e pela ausência de qualquer divergência de "removido vs não-removido" nos 1080
pontos — se a decomposição do Postgres divergisse da do V8 em QUALQUER ponto da faixa testada, a candidata v2
teria acusado (ela depende de `normalize(x,NFD)` bater exatamement com o `raw.normalize('NFD')` do JS).

### `colaborador_chave` / `item_chave` (existentes) × `normalizarTexto` — divergem, como o fato 10 avisa
Rodei `public.colaborador_chave(text)` (a função de verdade, `SELECT`, sem escrita) sobre uma amostra de 45 dos
1080+13 casos (focada nos pontos onde a tabela de 24 acentos e a classe `[ \t\n\r\f\v]` de `colaborador_chave` já
seriam suspeitas de divergir — control chars, NBSP, `İ`, `Æ/Ø/ß`, faixa 0300-036F, LS/PS, ideográfico, BOM,
ligadura `ﬀ`): **5 divergências**, todas explicadas por `colaborador_chave` usar `normalize(NFC)` + tabela de
TRANSLATE de 24 letras (não NFD + faixa inteira de marcas):

| code point | `colaborador_chave` | `normalizarTexto` | por quê |
|---|---|---|---|
| U+00A0 (NBSP) | mantém como NBSP literal | colapsa a espaço | classe `[ \t\n\r\f\v]` é só ASCII, de propósito (comentário da `0112`) |
| U+0130 (İ) | `'i' + U+0307` (2 code points — "i̇") | `'i'` (1 code point) | `colaborador_chave` normaliza para **NFC** (compõe) e não remove marca combinante nenhuma antes do `lower()`; o `İ` não decompõe em NFC (só em NFD), então chega inteiro ao `lower()`, que aplica a special-casing Unicode de `İ→i+̇` |
| U+2028, U+2029 (LS/PS) | mantém literal | colapsa a espaço | mesma razão da NBSP |
| U+3000 (ideográfico) | mantém literal | colapsa a espaço | idem |
| U+FEFF (BOM) | mantém literal | colapsa a espaço | idem (aqui os DOIS concordam em não ser "espaço real" pelo Unicode — só o `\s` do JS trata BOM como espaço; `normalizarTexto` herda esse comportamento do JS, `colaborador_chave` não) |

Curiosidade que vale registrar: combining marks SOLTAS de U+0300-036F (ex.: `chr(769)`, acento agudo puro,
colado depois de `'a'`) **batem** entre os dois (`'ab'` nos dois lados) — não porque `colaborador_chave` as
remova diretamente, mas porque `normalize(x, NFC)` primeiro RECOMPÕE `'a'+combining` em `'á'` (um único code
point), que aí SIM está na tabela de 24 letras e é traduzido para `'a'`. É um acerto por construção que só cobre
as 24 combinações da tabela — uma marca combinante sobre uma letra QUE NÃO ESTÁ na tabela (ex.: um `y` com
macron, ou qualquer combinação fora do português) passaria intacta por `colaborador_chave` e seria removida por
`normalizarTexto`. **Confirma o fato 10: os dois NÃO são a mesma função, e não devem ser tratados como
intercambiáveis.**

### Proposta — Decisão 1 (a parte de normalização)

Nova função SQL, mirror EXATO de `normalizarTexto` (não reaproveitar `colaborador_chave`/`item_chave` — são
propositalmente mais estreitas e servem a um propósito diferente: deduplicar NOME DE PESSOA/ITEM em português,
não normalizar CÉLULA DE CSV importado, que pode trazer BOM, NBSP, separadores exóticos de exportações antigas):

```sql
create or replace function public.import_normalizar_texto(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        lower(regexp_replace(normalize(p_texto, NFD), '[̀-ͯ]', '', 'g')),
        ':$', ''
      ),
      '[\t-\r   -  -   　﻿]+', ' ', 'g'
    )
  );
$$;
```
(`parallel safe` — diferente do precedente `colaborador_chave`/`item_chave`, que ficaram `proparallel='u'` por
omissão, não por decisão registrada; não há razão para repetir a omissão numa função nova.)

**Guarda TS↔SQL — forma proposta (`src/lib/import/normalizar-texto-sql.test.ts`), MOLDE NOVO (não o de
`chave-sql.test.ts`, que compara TABELA DE TRANSLATE — aqui não há tabela, há duas faixas regex):**
```ts
import { corpoVigente } from '../../../scripts/db/corpo-vigente.mjs'
import { normalizarTexto } from './deparas'

describe('import_normalizar_texto (SQL) espelha normalizarTexto (TS)', () => {
  const { sql } = corpoVigente('public.import_normalizar_texto')
  it('a faixa de diacríticos do SQL é [\\u0300-\\u036f] (a mesma do TS)', () => {
    expect(sql).toMatch(/\[\\u0300-\\u036f\]/)
  })
  it('a classe de espaço do SQL cobre os MESMOS 24 code points medidos do \\s do JS', () => {
    expect(sql).toMatch(/\[\\t-\\r \\u00A0\\u2000-\\u200A\\u2028-\\u2029\\u202F\\u205F\\u3000\\uFEFF\]\+/)
  })
  // Corpus de ouro: os 6 pontos que DIVERGIRAM com \s nativo do Postgres nesta medição,
  // mais os 13 casos especiais — golden vectors fixos no PRÓPRIO teste (não vêm de query
  // ao banco; o roteiro SQL de `supabase/tests/` é quem prova a função de verdade).
  it.each([
    ['', 'REMOVIDO/colapsado só no candidato ingênuo — aqui não interessa (TS não trata como espaço)'],
    // ... — mas o que este describe PROVA de fato é a IGUALDADE TEXTUAL da faixa/classe no SQL,
    // não reexecuta o banco (sem Postgres no Vitest). A prova comportamental mora no roteiro SQL do CI.
  ])
})
```
Como o `tsconfig`/Vitest não tem Postgres disponível (só o roteiro SQL do `banco-sem-docker` tem), a guarda
TS↔SQL nesse formato é necessariamente TEXTUAL (compara os LITERAIS da faixa/classe no corpo vigente com os
literais esperados — molde de `chave-sql.test.ts`, adaptado de "tabela de translate" para "duas faixas regex")
— e o teste COMPORTAMENTAL de verdade (rodar a função contra os 1091 casos) vira um roteiro em
`supabase/tests/` (ou uma seção nova dentro de um roteiro existente do import), executado pelo `banco-sem-docker`
do CI. **Divergência residual conhecida e aceita:** nenhuma — a candidata v2 bateu 1091/1091; não há gap a
"eliminar por CHECK" ou por normalização na action. (Diferente do que o prompt cogitava como possibilidade —
aqui a medição mostrou que dá para fechar 100% com a classe explícita, sem precisar de rede de segurança extra.)

---

## Armadilhas encontradas (para quem for implementar)

1. **Backslash em regex Postgres transmitida via texto de query é frágil.** Uma primeira tentativa gerando o SQL
   via `node -e "..."` (bash) **comeu o backslash** de `'\s+'` silenciosamente (virou `'s+'`, achando QUALQUER
   `s` seguido de `+`) — sem erro, sem aviso. A correção robusta: construir o padrão por CONCATENAÇÃO com
   `chr(92)` dentro do próprio SQL (`'[' || chr(92) || 'u0300-' || chr(92) || 'u036f]'`), que não depende de
   nenhuma camada de escaping (shell, JS, protocolo do MCP) preservar barras invertidas corretamente. Recomendo
   este padrão para QUALQUER regex com `\u`/`\s`/`\d` que precise ser montada por script e enviada como texto de
   migration também — ou, mais simples ainda para a MIGRATION em si (que não passa por geração de script,
   é escrita direto no arquivo `.sql`): usar os caracteres literais Unicode do bloco de marcas (como o próprio
   `colaborador_chave` já faz, e funciona) OU a forma `chr(92)||'uXXXX'` só quando a robustez importar mais que a
   legibilidade.
2. **Digitar o range `[̀-ͯ]` (caracteres literais U+0300/U+036F) diretamente numa mensagem de chat é
   INSTÁVEL** — em uma rodada o range "grudou" nos caracteres vizinhos e o teste pareceu não bater; a MESMA
   expressão, reescrita do zero, funcionou. Prefira SEMPRE `chr(92)||'u0300-'||chr(92)||'u036f'` nas consultas
   ad-hoc do MCP; nos arquivos `.sql` de verdade (editados por Edit/Write, não digitados numa mensagem), os
   caracteres literais são estáveis (é assim que `0112`/`0125` já fazem, sem problema, porque nasceram de um
   editor de arquivo, não de uma mensagem de chat).
3. **`İ` (U+0130) é uma armadilha de ORDEM, não de tabela.** Qualquer candidata que faça `lower()` ANTES de
   NFD+remoção de diacrítico vai divergir de `normalizarTexto` neste ponto específico (produzindo `'i'+combining
   dot'` em vez de `'i'` puro) — é o único ponto, de toda a bateria, em que a ORDEM das operações (e não o
   CONJUNTO de caracteres tratados) decide o resultado.
4. **`\d+` sem teto em `canonicalizarPatrimonio` (patrimonio.ts:13) não é bug** — o teto de 7 dígitos
   significativos é aplicado DEPOIS, em código JS (`significativos.length > 7 → null`), não na regex. Uma
   composição ingênua que tentasse unificar essa cópia com `DIGITOS_RE_SRC = '\\d{7}'` quebraria
   `canonicalizarPatrimonio('WAP0000001')` (que depende de aceitar QUALQUER quantidade de dígitos de entrada,
   inclusive mais que 7 com zeros à esquerda, antes de colapsar). A Decisão 5 tem que manter essa cópia com
   `\d+` (livre), não `\d{7}`.
5. **`corpoVigente` lança se a assinatura for ambígua** (duas sobrecargas no mesmo arquivo) — não foi o caso
   aqui, mas é bom saber: para `import_validar_plano` a resolução foi direta (só 1 sobrecarga, `0132` vence por
   ser o arquivo de maior número).

---

## Confirmação/divergência dos fatos do cabeçalho

Todos os fatos 10, 16, 17, 18, 19, 20 foram CONFIRMADOS integralmente pela remedição — nenhuma divergência de
número ou de linha encontrada. O que esta medição ACRESCENTA (não estava no cabeçalho, que dizia "confira"):
- a contagem EXATA de usos reais de `Exclude<` em `src/` (13, não "os do import" vagamente) e a decisão de
  escopo justificada por conteúdo, não por suposição;
- a prova EXECUTADA (não só argumentada) de que `tsc --noEmit -p .` pega o `@ts-expect-error` obsoleto, com a
  saída real;
- a confirmação PROGRAMÁTICA (via `corpo-vigente.mjs`, não `grep` manual) de que o SQL vigente não tem regex de
  formato;
- a Medição 4 inteira: os 24 code points exatos do `\s` do JS, as 6 divergências do `\s` nativo do Postgres
  (nunca antes medidas), e a prova de 1091/1091 com a classe explícita — o cabeçalho só dizia "confira", sem
  número nenhum.
