# Tarefa (e) — A pergunta de planejador (medida no ENSAIO, sgmvldiizsrjbxzzpmhh)

Canal: MCP Supabase `execute_sql`, role `postgres` (bypassrls). Sem `set local role authenticated` /
`request.jwt.claims`, então **nenhuma policy entra no plano** — todos os filtros de negócio deram `Actual Rows: 0`.
Isto mede a **FORMA** do plano (InitPlan × SubPlan × Filter por linha × Join), não a policy em si — como pedido.

`rotulo_de_ambiente()` respondeu `desenvolvimento`, confirmando ENSAIO (R-ACC-62).

**Postgres**: `PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit`

## Q1–Q6

| # | Forma | Nó(s) principais | SubPlan/InitPlan | Actual Loops (Sub/Init) | Filter tem nome da função? | Total Cost | Planning (ms) | Execution (ms) | Actual Rows topo |
|---|---|---|---|---|---|---|---|---|---|
| Q1 | `ativos` filtro por linha | Aggregate → Index Only Scan | nenhum | — | sim (`pode_escrever_filial(filial_id)`) | 439.35 | 11.837 | 113.150 | 1 |
| Q2 | `ativos` falso içamento `(select fn(coluna))` | Aggregate → Index Only Scan → Result | **SubPlan 1** (correlacionado) | **1606** | não (externo diz `(SubPlan 1)`) | 456.04 | 0.591 | 22.537 | 1 |
| Q3 | `ativos` içada `= any(array(select...))` | Aggregate → Seq Scan(filiais) → Index Only Scan | **InitPlan 1** | **1** | sim, mas só dentro do InitPlan (`pode_escrever_filial(id)`) | 40.80 | 6.675 | 14.932 | 1 |
| Q4 | argless secdef real (`papel_atual()`) | Aggregate → Result(InitPlan) → Result(One-Time Filter) → Index Only Scan | **InitPlan 1** | **1** | não (One-Time Filter cita `(InitPlan 1).col1`) | 34.09 | 8.277 | 1.321 | 1 |
| Q5 | pares emulado, sem forçar | Aggregate → **Nested Loop (Inner)** → Seq Scan(filiais) + Index Only Scan(ativos) | nenhum — **achatado em JOIN** | n/a (Seq Scan condutor roda 1×) | sim, no Seq Scan de filiais | 27.57 | 3.211 | 1.936 | 1 |
| Q5b | pares, forçado com `false or (...)` | Aggregate → Index Only Scan → Seq Scan(filiais) | **SubPlan 1, hasheado** (`hashed SubPlan 1`) | **1** | não no filtro externo; sim dentro do SubPlan | 49.83 | 0.727 | 2.313 | 1 |
| Q6-F1 | `movimentacoes` filtro por linha | Aggregate → Index Only Scan | nenhum | — | sim | 881.12 | 16.519 | 64.150 | 1 |
| Q6-F2 | `movimentacoes` falso içamento | Aggregate → Index Only Scan → Result | **SubPlan 1** | **3245** | não | 914.87 | 0.726 | 42.500 | 1 |
| Q6-F3 | `movimentacoes` içada | Aggregate → Seq Scan(filiais) → Index Only Scan | **InitPlan 1** | **1** | sim, dentro do InitPlan | 75.02 | 4.267 | 15.330 | 1 |

**Q4 — erro na forma literal do prompt**: `'x' = any (array (select public.papel_atual()))` deu
`ERROR 22P02: invalid input value for enum papel_usuario: "x"` — `papel_atual()` devolve o ENUM `papel_usuario`,
não `text`; comparar com `'x'` falha antes de chegar a plano. Corrigido com `::text` no `select` interno (registrado
acima como Q4).

**Q5 vs Q5b — a pergunta "Hash Semi Join, hashed SubPlan ou InitPlan?"**: nenhuma das três, em Q5. O planejador
**achatou** o `IN` de par redundante (`(a.filial_id, a.filial_id) IN (SELECT f.id, f.id ...)`) num **JOIN comum**
(`Nested Loop`, `Join Type: Inner`) — porque as duas colunas do par vêm da mesma chave, então ele reconheceu a
redundância e reduziu para um join direto contra `filiais`, com a função no `Filter` do lado condutor (avaliada uma
vez por linha de `filiais`, não de `ativos`). Só ao **bloquear o achatamento** com `where false or (...)` (Q5b) é que
a forma virou **SubPlan hasheado** (`hashed SubPlan 1`) — ainda avaliada **uma única vez** (`Actual Loops=1`), mas
tecnicamente um SubPlan, não um InitPlan nem um nó chamado "Hash Semi Join".

## Fato 21 — T1–T6 (inline, sem criar nada)

| # | SQL (forma) | Resultado |
|---|---|---|
| T1 | `array(select '{}'::uuid[])` | **ERRO** `2202E: cannot accumulate empty arrays` |
| T2 | `array(select null::uuid[])` | **ERRO** `22004: cannot accumulate null arrays` |
| T3a | `array(select '{<uuid>}'::uuid[])` | sucesso — vira **array 2-D** (`uuid[][]`), não um `uuid[]` plano |
| T3b | `<uuid> = any(array(select '{<mesmo uuid>}'::uuid[]))` | `true` — `ANY` percorre os elementos-folha mesmo num array 2-D |
| T4a | `<uuid> = any(array(select u from unnest('{}'::uuid[]) u))` | `false` (sem erro — contraste com T1: aqui a coluna da subconsulta é escalar, não array) |
| T4b | idem com `unnest(null::uuid[])` | `false` (unnest(NULL) = 0 linhas, igual a T4a) |
| T4c | idem com `unnest('{NULL}'::uuid[])` | `null` (unnest devolve 1 linha NULL; `uuid = ANY(ARRAY[NULL])` propaga NULL) |
| T4 em `WHERE` | os três predicados acima dentro de `WHERE` | **0 linhas nos três casos** — inclusive T4c (NULL não satisfaz `WHERE`) |
| T5a | `<uuid> = any((select '{}'::uuid[]))` (sem `ARRAY()`, sem cast) | **ERRO, não compila**: `42883: operator does not exist: uuid = uuid[]` — parênteses nus acionam a semântica de "ANY(subquery)" (linha-a-linha, tipo `IN`), não a semântica de array |
| T5b | `<uuid> = any((select '{}'::uuid[])::uuid[])` | `false` — o cast explícito fora dos parênteses resolve, compila |
| T5c | `<uuid> = any((select null::uuid[])::uuid[])` | `null` — cast explícito não erra (contraste com T2); resultado é NULL por propagação |
| T5d | `<uuid> = any(coalesce((select null::uuid[]), '{}'::uuid[]))` | `false` — `coalesce` neutraliza o NULL antes do `ANY`: padrão defensivo |
| T6 | `explain (format json) select count(*) from ativos where id = any(array(select u from unnest('{}'::uuid[]) u))` | Nó = **InitPlan 1** (`Function Scan`/`unnest`, `Parent Relationship: InitPlan`); `Index Cond: (id = ANY ((InitPlan 1).col1))` sobre `ativos_pkey`. **Confirma: SIM, é InitPlan.** |

## Respostas diretas

1. **`(select fn(coluna))` vira SubPlan por linha?**
   **Sim.** Confirmado em Q2 (`ativos`, Actual Loops=1606) e Q6-F2 (`movimentacoes`, Actual Loops=3245) — em ambos,
   `Actual Loops` do `SubPlan 1` bate exatamente com `Rows Removed by Filter` do nó externo, ou seja, a função roda
   **uma vez por linha varrida**. A doutrina da `0063` (fato 5) está certa para esta forma; a leitura da `0129` e do
   `ADR-002` (fato 6), que chamam isso de "InitPlan"/"padrão içado", está **errada** — pelo menos quando a função lê
   uma coluna da própria linha filtrada.

2. **`col = any (array (select fn()))` vira InitPlan?**
   **Sim — mas só quando `fn()` não lê a linha externa.** Em Q3, Q4, Q6-F3 e T6, a subconsulta dentro de `array(...)`
   não referencia a linha de `ativos`/`movimentacoes` sendo filtrada (lê `filiais` inteira, ou não lê nenhuma tabela
   de linha), e o Postgres promove isso a `InitPlan`, com `Actual Loops=1`. **A diferença não é o embrulho `array(select…)`
   em si** — é a **correlação**: `fn(coluna_da_linha_externa)` (Q2/Q6-F2) não içável de verdade → SubPlan por linha;
   `fn(coluna_de_outra_tabela)` ou `fn()` sem argumento (Q3/Q4/Q6-F3/T6) → içável → InitPlan avaliado uma vez.

3. **A forma de pares é avaliada uma vez?**
   **Depende de como se escreve.** Sem truque (Q5), o planejador reconhece que as duas colunas do par são a mesma
   chave e **achata tudo num JOIN comum** (`Nested Loop`/`Inner`) — nem `InitPlan`, nem `SubPlan`, nem um nó chamado
   "Hash Semi Join": a função vira um `Filter` simples no lado condutor do laço (`filiais`), avaliada uma vez por
   linha de `filiais` (não de `ativos`). Só forçando com `where false or (...)` (Q5b) — que impede o achatamento —
   é que a forma cai para um **SubPlan hasheado**, ainda avaliado **uma única vez** (`Actual Loops=1`), mas
   tecnicamente classificado como `SubPlan`, não `InitPlan`.

## Divergências / observações sobre os 21 fatos do cabeçalho

- **Fato 5 vs Fato 6**: a medição desta tarefa dá razão à `0063` (fato 5, a doutrina) e mostra que a leitura da
  `0129`/`ADR-002` (fato 6) está **objetivamente errada** para a forma "`(select fn(coluna))`" — não é um caso de
  duas fontes empatadas: uma delas está tecnicamente enganada sobre o que o plano faz. (A `0129` não se edita — lock
  da F46 — mas o registro da doutrina em `MATRIZ-REGRAS.md` pode e deve dizer isto explicitamente.)
- **Fato 8** (função `security definer` nunca é embutida pelo planejador): consistente com o observado — mesmo
  içada num InitPlan (Q3/Q4), a função aparece como um nó de execução próprio (`Seq Scan`/`Result` com `Filter`
  explícito citando o nome dela), nunca "desaparece" dentro de uma expressão inline.
- Nenhum outro fato dos 21 foi contrariado pela medição desta tarefa — o alvo aqui era só Q1–Q6/T1–T6.
