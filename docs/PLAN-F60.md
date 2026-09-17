# PLAN-F60 — O recorte que corta scan, e o custo do caminho quente

**Fase F60** do `PLANO-MULTIEMPRESA.md` (§5, Bloco D) · branch `f60-recorte-que-corta-scan` · versão-alvo **`1.65.0`** ·
**com migration** (`0141`→`0145`) · plano medido em **16/09/2026** · base `main` em **`4c380ec`** (merge do PR #51), tag
**`v1.64.0`** nesse commit.

(corrigido em 17/09 pela execução: o plano previa `0141`→`0144`; a medição do ensaio pôs o índice `lanc_item_criado_por_idx`
na `0142`, e a numeração das três seguintes andou uma casa — `0141` os KPIs, `0142` o índice, `0143` as sete `rel_*_filiais`,
`0144` a view de colaboradores, `0145` o `drop`; ver §8.)

Commits da fase já feitos, nesta ordem: **`50758d6`** *docs(f60): a ordem de serviço da fase* · **`96fc43f`** *chore(f60): o
harness de TTFB mede as três rotas que a fase toca* — o único commit em `scripts/` permitido antes do lote 1, feito ANTES
das duas rodadas A/A (§3.7). Este plano e as evidências "antes" (`docs/perf/f60-*.json`) entram no commit seguinte, antes
do primeiro commit que toca `src/`, `scripts/` ou `supabase/`. Na árvore de trabalho já existe, SEM commit, o rascunho da
trava da Frente C (`scripts/db/recorte-rel.mjs`, `src/lib/validators/rpcs-recorte-sql.test.ts`, o bloco 7 de
`supabase/tests/catalogo_secdef.sql` e a extensão de `catalogos-seguranca.test.ts`).

> A fase cabe numa frase: *o recorte vira LISTA obrigatória, ligada a uma coluna por `= any (p_filiais)`, e o nulo deixa de
> significar "tudo" — sem mudar um número de tela.* As sete `rel_*` que recortam por filial ganham substitutas com nome novo
> (`_filiais`), o as-of é reescrito por `join lateral` ancorado em `ativos`, o consolidado passa a ser a lista explícita de
> TODAS as filiais (inclusive desativadas), `/itens` lê colunas e total numa leitura só (paginada — corrigido em 17/09 pela
> execução: o plano dizia "numa chamada"; ver §6.4), e as assinaturas velhas só caem depois
> do deploy e da prova do `pg_stat_statements`. No caminho quente: `cache()` com chave primitiva, KPIs por RPC, `cap`
> obrigatório e keyset em `paginarTodos`, teto com aviso nas três tabelas e `maxDuration` escrito.

**Canal e identidade das medições.** MCP da Supabase (`execute_sql`), só leitura, produção `pbtjcalbmepmrqzprusb` e ensaio
`sgmvldiizsrjbxzzpmhh`, os dois `ACTIVE_HEALTHY` em PostgreSQL 17.6. `SUPABASE_ACCESS_TOKEN` **não** está no ambiente do
processo — a Management API não foi usada e o token não foi procurado. Código medido: `96fc43f`. Os geradores das medições
de banco (hoje fora do repositório; entram no lote 1 como `scripts/perf/medir-rel.mjs` e `scripts/perf/medir-custo.mjs`) têm
esta identidade — é ela que o "depois" tem de repetir, ou declarar a diferença:

| gerador | bytes | sha256 (LF, sem CRLF) |
|---|---:|---|
| `medir-rel.mjs` (A1–A4: as sete `rel_*`, `pg_stat_statements`, datas, variação com a data) — **original, mediu o "antes"** | 45.039 | `4ab7f71a71eb8a89b1d78f4b546516eb53688a83f42088f8f74f8144145f8eb2` |
| `medir-custo.mjs` (B1–B8: o custo do lote 1) — **original, mediu o "antes"** | 33.353 | `3c42d047b12408c0e14564fd7d998f66624a1a016341577383086c9a5eff7ea1` |
| `scripts/perf/medir-rel.mjs` — **versionado** (lote 1 + revisão + o conjunto "depois" do lote 2) | 53.098 | `fd8183d2853252ef315a0187b65a1d81a4d19455226c6961df6b304bb35a7ee7` |
| `scripts/perf/medir-custo.mjs` — **versionado** (lote 1 + revisão) | 36.046 | `491b9a6aca1bbe9bfeee678a9360c448c77c438ed47ca5b76b0380af14600fb3` |
| `equivalencia-rel.mjs` (a equivalência velho × novo emulada e o custo dos corpos novos, lote 2) — **original, mediu a equivalência** | 59.660 | `59e11125af7214bef3ad0d2e24f554884ddb6278385eb3374161c28e43a75c9d` |
| `scripts/perf/equivalencia-rel.mjs` — **versionado** (lote 2 + os modos `*-real` da revisão final) | 73.735 | `50357b4e56292e196fbe8b9e26378cd7df31ee4b965d452a72bb6b41c16d0772` |

⚠ Só `medir-rel.mjs` fixava `RAIZ_REPO` como caminho absoluto desta máquina; `medir-custo.mjs` não tinha raiz, e por isso
também não conferia onde `--dir` caía. O plano previa um diff de "só essa linha"; o que entrou é maior, e está declarado aqui
e no cabeçalho de cada arquivo. **Fora os comentários**, a diferença de cada versionado para o seu original é:
- `medir-rel.mjs` — `RAIZ_REPO` por `import.meta.url` (+ `fileURLToPath`); a guarda `validarDirFora` exportada e apertada
  (recusa a própria raiz, que o original liberava, e a pasta interna `..x`; + `sep`).
- `medir-custo.mjs` — a raiz por `import.meta.url` (+ `fileURLToPath`); `validarDirFora` (exportada, a mesma régua) no lugar
  de "--dir é obrigatório"; `relative`/`isAbsolute`/`sep` importados e o `readdirSync` morto removido.

**Nenhuma dessas diferenças muda o SQL emitido:** na revisão do lote 1 (16/09/2026) os dois originais e os dois versionados
geraram, cada par num diretório fora do repositório, os 19 arquivos (`gerar-a1` das sete funções, `gerar-a2`, `gerar-a3-bruto`
e os dez blocos B), e `diff -r` saiu vazio. `scripts/perf/instrumentos-f60.test.mts` reprova o instrumento cujo sha256 (LF) ou
tamanho deixar de bater com as linhas **versionado** acima — mudar o instrumento obriga a regravar a linha e declarar a
diferença.

**Lote 2 (16/09/2026) — as duas diferenças declaradas.** (1) `scripts/perf/medir-rel.mjs` ganhou o conjunto "depois" (as
sete `rel_*_filiais`, derivadas do modelo velho: `FUNCOES_FILIAIS`, `--conjunto=depois` em A2/A4 e nas análises, a lista de
TODAS as filiais lida dentro do banco); a versão do lote 1 tinha 47.341 bytes e sha256 (LF)
`9974c99d0578340efd14469f591b0ae3d2a011cd19d812a7240ebc478b31df5d`. **O "antes" continua reproduzível:** a versão do lote 1
e a do lote 2 geraram, cada uma num diretório fora do repositório, os 11 comandos do conjunto velho (`gerar-a1` das sete,
`gerar-a2`, `gerar-a3-bruto`, `gerar-a3-contagens`, `gerar-a4`), e `diff -r` saiu vazio. (2) `scripts/perf/equivalencia-rel.mjs`
entrou versionado: a raiz por `import.meta.url` (no lugar de `RAIZ_REPO`/`git rev-parse`) e `validarDirFora` com a régua dos
dois instrumentos acima; o original e o versionado geraram os 28 blocos de `gerar-equivalencia`/`gerar-custo` (ensaio e
produção) e `diff -r` saiu vazio.

**Revisão final (17/09/2026) — a diferença declarada.** `scripts/perf/equivalencia-rel.mjs` ganhou os modos `gerar-equivalencia-real`,
`gerar-custo-real`, `analisar-equivalencia --real` e `analisar-custo --real [--confirmar-orcamento]`: a equivalência e o custo com a
FUNÇÃO APLICADA no lugar do corpo colado (o passo que o §8, o Anexo A do runbook e o rodapé da `0143` põem como portão do merge,
e que até aqui era só prosa). A versão do lote 2 tinha 61.324 bytes e sha256 (LF)
`6f2d0bad83980d60fb6a931eb83cf5bfb75b9ec431e4e9f0bb7ca5e543062eaf`. **A emulação continua reproduzível:** a versão do lote 2 e a
da revisão geraram os 28 blocos de `gerar-equivalencia`/`gerar-custo` (ensaio e produção, os corpos das migrations 0141 + 0143)
num diretório fora do repositório, e `diff -r` saiu vazio.

---

## 1. Estado de partida — os 26 fatos remedidos

Leitores em paralelo (censos no scratchpad da sessão, **só números e nomes de schema aqui**) e medições de produção pelo MCP.
A régua é a da ordem: a medição ganha da frase escrita, e a divergência vai para o relatório.

| # | O que a ordem diz | Medido (fonte) | Veredito |
|---|---|---|---|
| 1 | `4c380ec` + `v1.64.0`; `1.64.0`; última `0140`, 139 arquivos, gap `0029`; ledger dos dois bancos em `import_desarma_fk`; PG 17.6; 219 arquivos / 5.997 testes; primeira migration `0141` | git: `v1.64.0` aponta `4c380ec`; `package.json` `1.64.0`; 139 `.sql` terminando em `0140_import_desarma_fk.sql`; **219** arquivos de teste versionados (`git ls-files`); ledger de produção termina em `import_desarma_fk`; PG 17.6 nos dois. A suíte inteira não rodou nesta etapa (roda antes do lote 1) | confirma |
| 2 | produção 1.620 / 3.556 / 148 / 32 / 6 (6) / 23 · ensaio 1.606 / 3.245 / 35 / 0 / 6 (6) / 7 | produção, 16/09 tarde: **1.635** ativos · **3.578** movimentações · **155** lançamentos · **34** colaboradores · 6 filiais (6 ativas) · 23 itens; e mais: anotações 16 · pendências de item 17 · termos 107 · linhas de `v_conflitos_filiais` 136 · estornos 8 · lançamentos estornados 8 · máx. **9** movimentações e **2** anotações por ativo · máx. **1.156** ativos numa filial · `pg_database_size` 24,3 MB (B8). Ensaio não remedido nesta etapa | precisão — (e) |
| 3 | TTFB F59: `/` 351 · `/itens` 353 · `/ativos` 291 · `/movimentacoes` 285 · `/pendencias` 346 · `/relatorios/geral` 534 · `/relatorios/[filial]` 349; ruído entre dias 4%–18%; `medir.mjs` não mede três rotas | as medianas do `f59-producao-ttfb.json` conferem; a faixa foi **corrigida pela própria F59 para 3,5% a 18%** (ata de correção de 16/09 em `DECISOES.md`; `PLAN-F59.md` §12 já diz 3,5%); as três rotas entraram pelo commit de instrumento `96fc43f`, antes da linha de base (§3.7) | confirma · **DIVERGE** na faixa |
| 4 | pgss 1.11 separa por papel; `rel_saldo_itens` auth 7.886 · 16,8 ms, srv 111 · 2,9; `rel_estoque_asof` auth 1.239 · 118,8 + 889 · 79,0, srv 276 · 22,9; `track_functions = none` | `f60-pgss-antes.json` (17:37 BRT): `rel_saldo_itens` auth **8.406 · 16,37** (4 formas), srv **211 · 3,86** (2); `rel_estoque_asof` auth **2.276 · 98,94** (3 formas), srv **306 · 23,07** (2); `stats_reset` 09/07/2026; `track_functions = none` | confirma (contadores cresceram com o tráfego do dia) |
| 5 | oito `rel_*` `sql stable invoker`, não `strict`, `search_path = public`; grants da `0056`; sete recortam por `smallint`; seis com `is null or` sobre coluna; o as-of no fim, sobre calculada; a oitava sem recorte | replay das migrations e catálogo de produção: iguais; corpos vivos `0134` · `0027` · `0016` ×2 · `0011` ×3 · `0118` | confirma · precisão (a) |
| 6 | o `p_filial is null or` é não-sargável no caminho real; `EXPLAIN` com literal mente | não remedido no Postgres descartável. Em produção, forma (b) com plano genérico: `rel_estoque_asof` lê **368 buffers** para 5 linhas (filial_b), 1.146 (filial_a) e 1.624 (consolidado) — o recorte não corta a leitura; `rel_mov_por_mes` lê 201 buffers em 365 dias nos três recortes; nenhuma célula de filial usa `mov_filial_data_idx`, que a leitura das tabelas do período com `.eq('filial_id')` usa (B5) | confirma no caminho real |
| 7 | `NOT NULL` não existe em parâmetro; `= any` com NULL e `'{}'` → 0 linhas; `strict` idem; hoje `rel_*(null)` devolve tudo | sintaxe não remedida; os corpos novos (§6.1) dão 0 linhas nas sete por desenho, com o acréscimo declarado de `rel_mov_itens`; a prova é roteiro (sabotagem H) | confirma por desenho |
| 8 | filial calculada na data; precedência `data desc, ordem desc`; `mov_ativo_idx (ativo_id, data desc)` não cobre `ordem`; `movimentacoes_estorno_de_idx` em `0106:31` | corpo `0134` lido; `mov_ativo_idx` `0003:94`, `movimentacoes_estorno_de_idx` `0106:31`, `movimentacoes_ordem_lista_idx` `0105:21-22`, `movimentacoes_data_ordem_idx` `0135:56-57`, `movimentacoes_ordem_uidx` `0133:190` | confirma |
| 9 | o consolidado inclui filial desativada; `listarFiliais()` (`filiais.ts:30`) não; a divergência em `lista.ts:77-83`, `itens-table.tsx:~488`, `exportar.ts:417` | `.eq('ativo', true)` em `filiais.ts:37` (a função começa na 30); `lista.ts:77-83` byte a byte; `itens-table.tsx` usa `foraDasFiliais` em **dois** pontos (célula 500/508 e linha expansível 712/714); `exportar.ts:417`. Já existem três leituras de TODAS as filiais (`queries/admin.ts:321-329` e `:346-352`, `vocabulario-import.ts:43-45`), nenhuma memoizada nem só de ids | confirma · precisão |
| 10 | 8 chamadas no app, 1 pela porta em script, 7 `db.rpc` diretos, as grades fixas de `censo.mjs`/`conferir.mts`, 5 em `linhas-tipos.test.ts`, 7 descritores, 7 anuláveis, `RPCS ≤ 7`, 59 chamadas em 8 roteiros, 2 mutações ancoradas no as-of; nenhuma função chama `rel_*` | 8 · 1 · 7 · 7 + via catálogo · 5 · 7 · 7 · 7 · 59 (5 · 10 · 2 · 9 · 12 · 2 · 11 · 8) — conferem; nenhuma migration chama `rel_*` (único acerto é comentário, `0027:215`). Mutações: (b). Consumidores a mais: (j), (k), (m) | confirma · **DIVERGE** (b) |
| 11 | função nova nasce com EXECUTE para `anon`; 6a reprova qualquer invoker alcançável; 6c; `create or replace` preserva grant; o visualizador usa `service_role` (`acesso.ts:468`) | `k_invoker_anon` vazio desde a F50; a `0118:122-123` já nasce revogando; `acesso.ts:468` | confirma |
| 12 | só `contarConflitosAbertos` roda duas vezes; argumento-objeto; três memoizadas; a F49 proíbe memoizar o vínculo | `layout.tsx:96-99` + `page.tsx:160`; `efetivar()` sempre monta objeto novo; memoizadas: `getOperador` (`acesso.ts:173`), `cargoDoRequest` (`acesso.ts:274` — a ata da F49 diz 260), `listarFiliais` (`filiais.ts:30`); a proibição escrita é sobre `papelAtual`/`podeEscreverFilial` (`acesso.ts:96-99`), no comentário ao lado de `cargoDoRequest`, que é o CARGO e é memoizado | confirma · precisão de linha |
| 13 | `getKpis(client, null)` pagina `ativos` inteira (1.620, duas páginas) para oito contadores; agregado do PostgREST desligado | B1: duas páginas (1.000 + 622 linhas, 1,50 + 2,11 ms de banco, `Index Scan ativos_pkey`); `group by status` 1,43 ms (`Index Only Scan ativos_filial_status_idx`); sete contagens `head` de 0,72 a 1,41 ms cada; as três fontes somam **1.622**; `rolconfig` do `authenticator` sem `pgrst.db_aggregates_enabled` | confirma |
| 14 | `count: 'exact'` a cada render; 8 colunas com `%palavra%`; `pg_trgm` ausente | `ativos.ts:172` e as 8 colunas; B2: `count exact` sem filtro 1,34 ms, com uma palavra nas 8 colunas **7,73 ms** (`Seq Scan`); página 1 com busca 9,86 ms, sem busca 3,73 ms; `reltuples` 1.631 × 1.635 exatos; `pg_trgm` não remedido (fora de escopo) | confirma |
| 15 | 48 chamadas (45 + 3); 5 de `paginarPorIds`; ordens variadas; keyset composto pede `or(…, and(…))`; a porta de RPC não tem filtro no tipo; `ordem` é o cursor; a trava da F58 tem dezenas de casos | 48 = 45 + 3; 5; `ordem` é `bigint not null generated always as identity` com `movimentacoes_ordem_uidx`; `chamarRpc` aplica `.returns<>()` por dentro e devolve `PostgrestTransformBuilder`, que só tem `.order()`/`.range()`/`.single()`; **44** casos sintéticos | confirma · precisão (c) |
| 16 | as três tabelas leem sem teto; molde `filaDeConsolidacao` (`TETO_FILA = 500`); snapshot `V2 \| V1` frouxo | `getTabelasFinais` (`relatorios/movimentacoes.ts:348-416`): `buscarLinhasPeriodo` ×3 (ordem tripla) + estornos no mesmo `Promise.all`; `TETO_FILA` em `colaboradores.ts:70`; maior tabela em 365 dias hoje: **155** saídas no consolidado (B5) | confirma · lacuna (o) |
| 17 | `maxDuration` numa rota (60 s); 30 `page.tsx`; ~25 leem `lib/queries` | 30 `page.tsx`, 3 `layout.tsx`, 0 `route.ts`; **25** leem `lib/queries` (fora: as três de ajuda, `relatorios/acesso`, `versoes`); o único `maxDuration` em `relatorios/[filial]/page.tsx:63` | confirma |
| 18 | `anon` 3 s · `authenticated` 8 s · `service_role` sem configuração · `authenticator` 8 s | catálogo de produção igual; o `authenticator` tem também `lock_timeout` 8 s; a doc *Timeouts* confirma a herança (§5) | confirma |
| 19 | `getSaldosPorFilial` faz 1 + N (hoje 7); `getSaldosItensDeFiliais` N; `getSaldosItens` com mais quatro chamadores | `itens.ts:342-351`: **1 + 6 = 7** chamadas por render (6 filiais ativas); chamadores: `itens/page.tsx:153`, `(app)/page.tsx:152` (`null`), `itens/historico/page.tsx:154`, `itens/conferencia/page.tsx:125`, `actions/admin.ts:662-664`, `actions/itens.ts:494-501`, `actions/exportar.ts:527,548` | confirma (o censo de custo escreveu "N = 7": erro do censo — produção tem 6 filiais) |
| 20 | `buscarEstornosAteData` (`:327`) varre todo estorno; `.in('estorno_de', ids)`; nunca filtro de filial (`0122`) | `relatorios/movimentacoes.ts:327`; o estorno grava a filial ATUAL do ativo em `0122:205-219`; 8 estornos hoje | confirma · precisão (d) |
| 21 | `v_colaboradores_textos` (`0115`, `security_invoker`) agrega as duas tabelas com a chave por linha; a tela lê cadastro (32, dois counts) + fila | corpo vivo `0115:90-128` (h); B3: fila **90,18 ms**, resumo **83,37 ms** (`Seq Scan` nas duas tabelas, `Append`, `Sort`, `Aggregate`); cadastro com os dois counts 1,26 ms (`movimentacoes_colaborador_idx`, `lanc_item_colaborador_idx`); 34 cadastros; 889 grupos pendentes e 33 cadastrados | confirma · precisão (g) |
| 22 | `lanc_item_criado_por_idx` não existe; `lanc_item_item_filial_idx` 453; `movimentacoes_ordem_lista_idx` 16.889; `data_ordem` 5.980; `mov_ativo_idx` 161.510; `estorno_de` 15.086 | B7 (21:10Z): `mov_ativo_idx` 163.352 · `lanc_item_item_filial_idx` 581 · `movimentacoes_data_ordem_idx` 7.732 · `movimentacoes_estorno_de_idx` 16.085 · **`movimentacoes_ordem_lista_idx` 17.054**; `lanc_item_criado_por_idx` e `lanc_item_ordem_lista_idx` não existem. O consumidor do `ordem_lista`, pelo pgss (só a cláusula de ordem e contagens): `data desc, created_at desc, id desc` sobre `movimentacoes` em **28 formas / 5.931 chamadas** (`authenticated`) e **18 / 646** (`service_role`) | confirma — vivo e crescendo |
| 23 | o harness popula o ensaio, recusa produção, lê o token do ambiente; mede um `SELECT` sem `WHERE` | `medir-itens.mjs` confirmado (patamares 10 mil/100 mil/500 mil, marcador de limpeza, três guardas); as medidas 1–3 chamam as `rel_*` VELHAS (j); a medida 4 é sem `WHERE`. Precisão: com o recorte `todas`, o histórico real também sai sem `WHERE` de filial, mas com `count head`, filtros e ordem por `data` quando há item; a forma que casaria com `lanc_item_criado_por_idx` é `getUltimoLancamento` (`itens.ts:584`), medida em produção em **0,31 ms** (`Index Scan lanc_item_created_idx` + `Incremental Sort`, B4) | confirma · precisão |
| 24 | duas listas por migration; gate de deriva com a cadeia inteira; *hand-fix* da F56; 82 ativas, teto 85; os moldes da F59 | confirmado; o teto conta ATIVAS (i) | confirma · precisão (i) |
| 25 | apply pelo MCP, ensaio primeiro, CI antes; prova pós-apply; SQL antes do deploy e `drop` depois; o linter; o conferidor | "O caminho, em 30 segundos" (8 passos) e a emenda F56 conferidos no `RUNBOOK-BANCO.md` | confirma |
| 26 | regras 1, 2, 3, 5, 6, 7, 8 | aplicadas neste plano; evidência só com números, nomes de nó e rótulos, varrida (§3.8) | — |

### 1.1 As catorze divergências que a ordem declarou de saída

1. **A primeira migration é a `0141`** — confirmada (fato 1).
2. **`NOT NULL` não existe em parâmetro** — não remedida (sintaxe, medida pela ordem no descartável); vira prova de roteiro.
3. **Oito `rel_*`, e a oitava sem recorte** — confirmada.
4. **Os "10 chamadores" são 8 + 1 + 7 + 59 + 2 + mapas** — confirmada, com a precisão (b) e os consumidores a mais (j), (k), (m).
5. **O "duas vezes por request" é só `contarConflitosAbertos`**, e com argumento-objeto o `cache()` nunca acerta — confirmada.
6. **48 chamadas de `paginarTodos` e 5 de `paginarPorIds`**, não 7 — confirmada.
7. **O `service_role` herda os 8 s do `authenticator`** — confirmada pelo catálogo e pela doc.
8. **A precedência é `data desc, ordem desc`** desde a F53 — confirmada.
9. **A divergência declarada de `/itens` mora em `lista.ts` e `itens-table.tsx`** — confirmada (e são dois pontos na tabela).
10. **`lanc_item_criado_por_idx` não se prova em produção** — confirmada com 155 lançamentos (0,31 ms na forma real).
    (corrigido em 17/09 pela execução: o índice entrou mesmo assim, pela medição do ENSAIO — `0142`, §8.)
11. **`movimentacoes_ordem_lista_idx` está vivo** — confirmada (17.054).
12. **O agregado do PostgREST está desligado** — confirmada.
13. **Keyset sobre RPC não compila pela porta, e ordem composta não tem cursor simples** — confirmada.
14. **O "não-sargável" se confirma no caminho real, e o `EXPLAIN` com literal mente** — a primeira metade confirmada em
    produção (os buffers iguais do §3.2); a segunda não foi remedida (a medição nunca usou literal).

### 1.2 O que o censo achou além da ordem

- **(a)** `rel_estoque_asof` não declara `security invoker` desde a `0109` (`0109:248`; a última com a palavra é a `0054:47`).
  O comportamento é o mesmo — o padrão do Postgres é invoker —, o texto não. A função nova declara.
- **(b)** São **duas** as mutações ancoradas no texto do as-of: `f53-asof-volta-ao-desempate-por-id` (derruba **3a**) e
  `f53-asof-passa-a-ordenar-so-por-ordem` (derruba **6a**), as duas trocando `order by e.ativo_id, e.data desc, e.ordem desc`.
  A `f53-trava-do-estorno-volta-ao-uuid` (**4c**), que a ordem cita, está em `aplicar_movimentacao()` e não muda.
- **(c)** A trava da F58 (`sem-cast-de-leitura.test.ts`) reconhece `paginarTodos`/`paginarPorIds` pelo NOME
  (`PRODUTORES_DE_LINHAS`), só com `ts.createSourceFile`, sem aridade nem checker: os **44** casos sintéticos de dois
  argumentos continuam provando o mesmo com o `cap` obrigatório — não precisam mudar; quem reprova a chamada sem `cap` é o `tsc`.
- **(d)** `buscarEstornosAteData` roda no MESMO `Promise.all` das três tabelas: os ids "já lidos" não existem no ponto da
  chamada. O `.in('estorno_de', ids)` exige sequenciar a leitura depois das três (§6.7).
- **(e)** O volume de hoje é 1.635 ativos, 3.578 movimentações, 155 lançamentos e 34 colaboradores — produção viva desde o
  cabeçalho da ordem.
- **(f)** O dia do lote grande (`2026-07-27`) tem hoje **512** movimentações; a R-REL-33 registrou 514 em 09/09.
- **(g)** O custo das views de colaboradores (fila 90 ms, resumo 83 ms) é `colaborador_chave()` chamada por LINHA da união:
  função `language sql` com `set search_path` não é embutida. A emulação com a chave por nome distinto mede ~50 ms (§3.6).
- **(h)** A `v_colaboradores_textos` viva é a da `0115` — nenhuma migration posterior a redefine.
- **(i)** O teto do injetor conta as mutações ATIVAS: 82 ≤ 85, e as 2 da quarentena ficam fora da conta.
- **(j)** `scripts/perf/medir-itens.mjs:634,643,652` chama `rel_saldo_itens` ×2 e `rel_mov_itens` ×1 pela assinatura VELHA,
  em SQL — consumidor que o fato 10 não lista (o censo do motor o classificou como "só comentário"). Depois do `drop`, o
  harness quebra; ele já muda no lote 1.
- **(k)** `COLUNAS_DE_RETORNO_ANULAVEIS.rel_estoque_asof` (`rpc.ts:114`: `colaborador`, `setor`, `marca`, `modelo`), conferido
  por `rpc-retorno-sql.test.ts` contra o corpo vivo — consumidor fora do fato 10. As quatro evidências textuais
  (`when not public.status_tem_detentor(…) then null`, `when u.tipo is null then null`, `a.marca`, `a.modelo`) continuam no
  corpo novo; a entrada migra 1:1.
  (corrigido em 17/09 pela execução: a chave e as quatro colunas migraram 1:1, as evidências não — o corpo final não tem
  `when u.tipo is null then null` (inalcançável na lateral interna) e chama `status_tem_detentor` uma vez por linha, na
  lateral `d`; as evidências vivas de `rel_estoque_asof_filiais` são `when not d.tem_detentor then null`,
  `else u.snapshot_anterior ->> 'setor'`, `a.marca` e `a.modelo`. Ver §6.2.)
- **(l)** **`corpoVigente` não enxerga `drop function`**: ele devolve o ÚLTIMO `create` da assinatura, varrendo as migrations
  de trás para frente. Depois da `0145` (o `drop`; corrigido em 17/09 pela execução: o plano o numerava `0144`),
  `corpoVigente('public.rel_estoque_asof(smallint, date)')` continua devolvendo o corpo
  da `0134` (o censo das travas afirma o contrário). Consequências: as duas mutações de (b), se não reancoradas, montariam SQL
  válido, recriariam no banco do CI uma função dropada que nenhum roteiro chama e escapariam sem erro de montagem; e o
  orçamento do as-of tem de resolver a assinatura NOVA, ou usar o replay de `recorte-rel.mjs`, que lê `drop`.
- **(m)** `src/lib/itens/migrations-f38.test.ts:140-150` (`INTOCAVEIS`) nomeia `rel_saldo_itens`, `rel_mov_itens` e
  `rel_estoque_asof`. A guarda só lê `create` (`funcoesDefinidas`), então a `0145` derruba três "intocáveis" sem acusar. A
  exceção vai por escrito — na lista e na ata —, no molde de `RECRIACOES_AUTORIZADAS['0134']`; e as cinco migrations novas
  entram em `DA_F38` (a segunda lista do fato 24).
  (corrigido em 17/09 pela execução: o plano dizia "a `0144` derruba" e "as quatro migrations novas" — o índice da `0142`
  entrou na fase e empurrou o `drop` para a `0145`.)
- **(n)** **A catraca do visualizador.** `fronteira-viewer.test.ts` deriva a superfície pela ASSINATURA (quem aceita
  `DbClient`), e `queries/relatorios/estoque.ts` está nela. Um `chamarRpc(client, 'rel_contagem_status_filiais')` literal ali
  entra no conjunto de RPCs da superfície e leva `RPCS` a 8 > 7. A chamada dos KPIs mora em módulo fora da superfície (o
  dashboard, com o client de sessão), ou a catraca sobe com ata — a ordem pede a troca 1:1 com a catraca intacta.
- **(o)** O teto de 2.000 linhas das três tabelas foi medido contra a janela de 365 dias (máx. 155). O preset **Tudo**
  (`relatorios/periodo.ts:58`, de `2000-01-01`) não foi medido: antes de fixar o número, contar o Tudo por `count head` nas
  três formas — o limite superior certo é 3.578 —, para o critério 19 (o aviso não aparece hoje) valer.
  (corrigido em 17/09 pela execução: o Tudo foi contado em produção em 16/09, só leitura, com as mesmas exclusões de carga e
  de import das três tabelas — saídas **155**, entradas **136**, transferências **14**, iguais à janela de 365 dias; o teto de
  2.000 tem ~13× de folga e o aviso não aparece hoje.)
- **(p)** A amostra de datas chama `2026-07-27` de "dia do go-live" (o dia de maior carga de compras de julho). O registry
  põe o go-live da `1.0.0` em `2026-07-15` (F4), que não está entre as 12 datas; e nenhuma movimentação carrega o marcador de
  carga go-live. A data entra como o dia do lote grande (§4).
- **(q)** O rascunho da decisão 6 cita `planned` = 1.623; a evidência grava `reltuples` = 1.631 e não grava a estimativa do
  `explain` que o `count: 'planned'` usaria. O plano usa 1.631.
- **(r)** Os 43 pontos de roteiro que leem `rel_saldo_itens` (37 com uma filial, 6 com o consolidado) passam a receber, por
  item, uma linha por filial da lista MAIS a do nível do total. `select … into` escolheria uma em silêncio, e
  `select count(*)` (`dev_destrutivo.sql` 5b) contaria o dobro: a migração filtra o nível explicitamente.
- **(s)** Das seis asserções do bloco 7, as quatro mutações do rascunho derrubavam só **7a** e **7c** (as outras duas
  derrubam cenários de roteiro); **7b, 7d, 7e e 7f nasceriam sem mutação própria**. Resolvido no §7.3: oito mutações novas,
  uma quebra por rótulo do bloco 7 (`7a`–`7g`) e uma por cenário, 90 ativas, teto 95.
  (corrigido em 17/09 pela execução: o plano previa sete novas, 89 ativas e teto 90; a revisão adversarial da trava
  acrescentou a `7g` — a exceção sem overload — e a mutação `f60-excecao-ganha-overload`, que a derruba.)
- **(t)** A contagem final que a ordem prevê ("`rel_*` vivas 8 → 8") vira **8 → 9**: `rel_contagem_status_filiais` é uma
  `rel_*` nova, sob a trava.

---

## 2. O censo

### 2.1 A tabela das chamadas — `paginarTodos` (48) e `paginarPorIds` (5)

**O `cap` é por domínio, numa constante única, com a conta.** Regra proposta: o teto é o menor valor da série 1–2–5 × 10ⁿ
que seja **≥ 20 × o volume de produção de 16/09**, com **piso de 10.000** — abaixo de ~500 linhas hoje, 20× é ruído (uma
única carga de import passa dele), e passar do teto LANÇA. Leitura em lote de 100 ids: **máx. por ativo × 100 × 20**, com o
mesmo piso. Acima do `cap`, `paginarTodos` continua lançando com o rótulo; em `paginarPorIds` o `cap` vale por lote (o
`paginarTodos` interno o recebe), como o teto de hoje.

| domínio (constante) | volume 16/09 | conta | teto | folga |
|---|---:|---|---:|---:|
| `ativos` (e o as-of: ≤ 1 linha por ativo; e `v_conflitos_filiais`: ≤ 1 lado por ativo) | 1.635 | 1.635 × 20 = 32.700 | **50.000** | 30,6× |
| `movimentacoes` | 3.578 | 3.578 × 20 = 71.560 | **100.000** | 27,9× |
| `lancamentos_item` | 155 | 155 × 20 = 3.100 → piso | **10.000** | 64,5× |
| `termos_gerados` | 107 | 2.140 → piso | **10.000** | 93× |
| `colaboradores` · `itens` · `anotacoes` · `pendencias_item` | 34 · 23 · 16 · 17 | → piso | **10.000** | ≥ 294× |
| lote de 100 em `movimentacoes` por `ativo_id` | máx. 9/ativo | 9 × 100 × 20 = 18.000 | **20.000** | — |
| lote de 100 nos demais (`anotacoes` 2/ativo; `ativos` por id; `estorno_de` ≤ 1/movimentação; `termos`, `pendencias_item`, lançamentos por movimentação/pendência, `v_conflitos_filiais` por ativo) | ≤ 200/lote | ≤ 4.000 → piso | **10.000** | — |

**Keyset × OFFSET.** Keyset onde a ordem de hoje já é UMA coluna única (`id`): a ordem visível não muda, o cursor é a PK e o
laço troca `.range()` por `.gt('id', último).order('id')` — o fim continua pelo teto OBSERVADO. Keyset exige a coluna do
cursor no `select`: onde ela não está (marcado "+`id`"), o `id` entra no `select`, sem mudar o que o chamador consome. OFFSET
fica, por chamada, com um de quatro motivos: **[C]** ordem composta sem cursor simples — trocar `created_at desc, id desc` por
`ordem desc` muda a ordem VISÍVEL no empate (o backlog das "duas réguas" da F53, fora do escopo); **[R]** fonte RPC — a porta
devolve builder sem filtros no tipo; **[T]** lista de tela de página única por construção; **[V]** view sem unicidade
declarada. T = tela · L = leitura em lote/servidor.

| # | arquivo:linha | função | fonte | ordem | total? | keyset cabe? | T/L | volume hoje | cap (conta) | decisão |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `scripts/import/carga.ts:168` | `buscarAtivosExistentes` | `ativos` | `id` | sim | coluna única | L (carga única F4) | 1.635 | 50.000 (ativos) | **KEYSET** |
| 2 | `scripts/import/carga.ts:194` | `buscarMovimentacoesExistentes` | `movimentacoes` | `id` | sim | coluna única | L | 3.578 | 100.000 (movimentações) | **KEYSET** (+`id`) |
| 3 | `scripts/import/carga.ts:469` | aberturas de saldo | `lancamentos_item` (`tipo`, observação) | `id` | sim | coluna única | L | ≤ 155 | 10.000 (lançamentos) | **KEYSET** (+`id`) |
| 4 | `src/lib/queries/colaboradores.ts:98` | `listarColaboradoresAdmin` | `colaboradores` + 2 counts | `nome, id` | sim | composta | T | 34 | 10.000 (colaboradores) | OFFSET [T][C] |
| 5 | `src/lib/queries/conflitos.ts:104` | `chavesDasFiliais` | `v_conflitos_filiais` `.in('filial')` | `chave, ativo_id` | sim | composta | L | ≤ 136 | 50.000 (≤ 1 lado/ativo) | OFFSET [C][V] |
| 6 | `src/lib/queries/conflitos.ts:263` | `chavesPorBusca` | `v_conflitos_filiais` `.or(ilike)` | `chave, ativo_id` | sim | composta | L | ≤ 136 | 50.000 | OFFSET [C][V] |
| 7 | `src/lib/queries/conflitos.ts:367` | `listarConflitos` (lados da página) | `v_conflitos_filiais` `.in('chave', ≤ 20)` | `chave, filial_id` | sim | composta | T | ≤ 60 | 50.000 | OFFSET [T][C] |
| 8 | `src/lib/queries/conflitos.ts:441` | `listarConflitosParaExport` | `v_conflitos_filiais` | `chave, filial_id` | sim | composta | L (CSV) | ≤ 136 | 50.000 | OFFSET [C][V] |
| 9 | `src/lib/queries/conflitos.ts:487` | `acervoDosAtivos` · ativos | `ativos` `.in('id')` | `id` | sim | coluna única | L (backup) | grupo de conflito | 50.000 | **KEYSET** |
| 10 | `src/lib/queries/conflitos.ts:490` | `acervoDosAtivos` · movimentações | `movimentacoes` `.in('ativo_id')` | `id` | sim | coluna única | L | ≤ 9/ativo | 100.000 (ids sem lote) | **KEYSET** |
| 11 | `src/lib/queries/conflitos.ts:498` | `acervoDosAtivos` · anotações | `anotacoes` | `id` | sim | coluna única | L | ≤ 2/ativo | 10.000 | **KEYSET** |
| 12 | `src/lib/queries/conflitos.ts:506` | `acervoDosAtivos` · pendências | `pendencias_item` | `id` | sim | coluna única | L | ≤ 17 | 10.000 | **KEYSET** |
| 13 | `src/lib/queries/conflitos.ts:516` | `acervoDosAtivos` · termos | `termos_gerados` (inteira; filtro em memória) | `id` | sim | coluna única | L | 107 | 10.000 | **KEYSET** |
| 14 | `src/lib/queries/dev-destrutivo.ts:401` | `montarBackupDoReset` · lançamentos | `lancamentos_item` (filial?) | `id` | sim | coluna única | L (Zona destrutiva) | 155 | 10.000 | **KEYSET** |
| 15 | `src/lib/queries/dev-destrutivo.ts:437` | `montarBackupDoReset` · ativos | `ativos` (filial?) | `id` | sim | coluna única | L | 1.635 | 50.000 | **KEYSET** |
| 16 | `src/lib/queries/dev-destrutivo.ts:460` | `backupMovimentacoes` · global | `movimentacoes` | `id` | sim | coluna única | L | 3.578 | 100.000 | **KEYSET** |
| 17 | `src/lib/queries/dev-destrutivo.ts:469` | `backupMovimentacoes` · lote | `movimentacoes` `.in('ativo_id', 100)` | `id` | sim | coluna única | L | ≤ 900/lote | 20.000 (lote) | **KEYSET** |
| 18 | `src/lib/queries/dev-destrutivo.ts:485` | `backupAnotacoes` · global | `anotacoes` | `id` | sim | coluna única | L | 16 | 10.000 | **KEYSET** |
| 19 | `src/lib/queries/dev-destrutivo.ts:494` | `backupAnotacoes` · lote | `anotacoes` `.in('ativo_id')` | `id` | sim | coluna única | L | ≤ 200/lote | 10.000 | **KEYSET** |
| 20 | `src/lib/queries/dev-destrutivo.ts:510` | `backupPendenciasItem` · global | `pendencias_item` | `id` | sim | coluna única | L | 17 | 10.000 | **KEYSET** |
| 21 | `src/lib/queries/dev-destrutivo.ts:519` | `backupPendenciasItem` · lote | `pendencias_item` `.in('ativo_id')` | `id` | sim | coluna única | L | ≤ 17 | 10.000 | **KEYSET** |
| 22 | `src/lib/queries/dev-destrutivo.ts:558` | termos · global | `termos_gerados` | `id` | sim | coluna única | L | 107 | 10.000 | **KEYSET** |
| 23 | `src/lib/queries/dev-destrutivo.ts:567` | termos · lote | `termos_gerados` `.overlaps('ativo_ids')` | `id` | sim | coluna única | L | ≤ 107 | 10.000 | **KEYSET** |
| 24 | `src/lib/queries/dev-destrutivo.ts:599` | ponteiros de substituto | `ativos` `.in('substitui_ativo_id')` | `id` | sim | coluna única | L | ≤ 100/lote | 10.000 | **KEYSET** |
| 25 | `src/lib/queries/import-logs.ts:90` | `idsDaFilial` | `ativos` `.eq('filial_id')` | `id` | sim | coluna única | L (import) | ≤ 1.156 | 50.000 | **KEYSET** |
| 26 | `src/lib/queries/import-logs.ts:155` | `idsPorAtivo` · lote | `movimentacoes` ou `pendencias_item` (nome em variável) | `id` | sim | coluna única | L | ≤ 900/lote | 20.000 (lote de movimentações) | **KEYSET** |
| 27 | `src/lib/queries/import-logs.ts:298` | `custoSubstituir` · termos | `termos_gerados` (inteira) | `id` | sim | coluna única | L | 107 | 10.000 | **KEYSET** |
| 28 | `src/lib/queries/import-logs.ts:367` | `exportarAcervoFilial` · ativos | `ativos` `.eq('filial_id')` | `id` | sim | coluna única | L | ≤ 1.156 | 50.000 | **KEYSET** |
| 29 | `src/lib/queries/import-logs.ts:376` | `exportarAcervoFilial` · movimentações | `movimentacoes` lote | `id` | sim | coluna única | L | ≤ 900/lote | 20.000 | **KEYSET** |
| 30 | `src/lib/queries/import-logs.ts:386` | `exportarAcervoFilial` · anotações | `anotacoes` lote | `id` | sim | coluna única | L | ≤ 200/lote | 10.000 | **KEYSET** |
| 31 | `src/lib/queries/import-logs.ts:420` | `exportarAcervoFilial` · termos | `termos_gerados` `.overlaps` lote | `id` | sim | coluna única | L | ≤ 107 | 10.000 | **KEYSET** |
| 32 | `src/lib/queries/import-logs.ts:477` | `exportarDesvinculosFk` · pendências | `pendencias_item` lote | `id` | sim | coluna única | L | ≤ 17 | 10.000 | **KEYSET** |
| 33 | `src/lib/queries/import-logs.ts:494` | `exportarDesvinculosFk` · lançamentos por movimentação | `lancamentos_item` lote | `id` | sim | coluna única | L | ≤ 155 | 10.000 | **KEYSET** |
| 34 | `src/lib/queries/import-logs.ts:512` | `exportarDesvinculosFk` · lançamentos por pendência | `lancamentos_item` lote | `id` | sim | coluna única | L | ≤ 155 | 10.000 | **KEYSET** |
| 35 | `src/lib/queries/import-logs.ts:537` | `exportarDesvinculosFk` · ponteiros | `ativos` lote + `.neq('filial_id')` | `id` | sim | coluna única | L | ≤ 100/lote | 10.000 | **KEYSET** |
| 36 | `src/lib/queries/movimentacoes.ts:96` | `listarMovimentacoesDoAtivo` | `movimentacoes` `.eq('ativo_id')` | `created_at desc, ordem desc` | sim | composta | T (linha do tempo) | ≤ 9 | 10.000 (≤ 9 × 20 → piso) | OFFSET [T][C] |
| 37 | `src/lib/queries/relatorios/comum.ts:261` | dentro de `paginarPorIds` | delegada ao chamador | do chamador | — | do chamador | — | — | recebe o `cap` do chamador | herda |
| 38 | `src/lib/queries/relatorios/estoque.ts:72` | `lerEstadoAtivos` · hoje | `ativos` sem as baixas (filial?) | `id` | sim | coluna única | L (KPIs até a Frente B; snapshot sempre) | 1.622 | 50.000 | **KEYSET** |
| 39 | `src/lib/queries/relatorios/estoque.ts:113` | `lerEstadoAtivos` · passado | RPC `rel_estoque_asof` → `_filiais` | `ativo_id` (imposta na chamada) | sim (1 linha/ativo) | fonte RPC | L | 1.624 | 50.000 (≤ 1/ativo) | OFFSET [R] |
| 40 | `src/lib/queries/relatorios/estoque.ts:408` | `manutencaoDeEstado` · retornos | `movimentacoes` tipo + período (filial?) | `created_at desc, id desc` | sim | composta | L | período; Tudo ≤ 3.578 | 100.000 | OFFSET [C] |
| 41 | `src/lib/queries/relatorios/estoque.ts:432` | `manutencaoDeEstado` · devoluções ao fornecedor | idem | `created_at desc, id desc` | sim | composta | L | idem | 100.000 | OFFSET [C] |
| 42 | `src/lib/queries/relatorios/itens.ts:68` | `lerMinimosDoCatalogo` | `itens` | `id` | sim | coluna única | L | 23 | 10.000 | **KEYSET** |
| 43 | `src/lib/queries/relatorios/itens.ts:99` | `getGruposItens` · observações | `lancamentos_item` período (filial?) | `created_at desc, id desc` | sim | composta | L | ≤ 155 | 10.000 | OFFSET [C] |
| 44 | `src/lib/queries/relatorios/itens.ts:278` | `buscarLancEstornadosAteData` | `lancamentos_item` `estorna_id` não nulo | `id` | sim | coluna única | L | 8 | 10.000 | **KEYSET** (+`id`) |
| 45 | `src/lib/queries/relatorios/itens.ts:302` | `getLancamentosItensPeriodo` | `lancamentos_item` período | `data desc, created_at desc, id desc` | sim | composta (tripla) | L | ≤ 155 | 10.000 | OFFSET [C] |
| 46 | `src/lib/queries/relatorios/movimentacoes.ts:71` | `serieCurta` | `movimentacoes` ≤ 120 dias, 2 tipos (filial?) | `data asc, id asc` | sim | composta | L | subconjunto | 100.000 | OFFSET [C] |
| 47 | `src/lib/queries/relatorios/movimentacoes.ts:281` | `buscarLinhasPeriodo` (as três tabelas) | `movimentacoes` período + tipos + exclusões | `data desc, created_at desc, id desc` | sim | composta (tripla) | L | máx. 155 em 365 dias | 100.000; o corte com aviso é o `TETO_LINHAS_TABELA` (§10.6) | OFFSET [C] |
| 48 | `src/lib/queries/relatorios/movimentacoes.ts:331` | `buscarEstornosAteData` | `movimentacoes` estornos até a data | `id` | sim | coluna única | L | 8 | vira a chamada nova de `paginarPorIds` (abaixo) | **muda de forma** (§6.7) |
| 49 (nova) | `src/lib/queries/relatorios/itens.ts:135` | `lerSaldoItensEmNiveis` — a única leitura de `rel_saldo_itens_filiais` do app | RPC `rel_saldo_itens_filiais` (os dois níveis) | `filial_id nulls first, grupo, ordem, item, item_id` (a do corpo, imposta na chamada) | sim | fonte RPC | L (`/itens`, histórico, CSV, dashboard, conferência, as duas actions e o relatório) | (6 + 1) × 23 = 161 | 10.000 (`CAP_SALDO_ITENS_EM_NIVEIS`: 161 × 20 = 3.220 → piso) | OFFSET [R] |

| # | arquivo:linha (`paginarPorIds`) | função | fonte · filtro do lote | ordem | keyset cabe? | T/L | volume hoje | cap por lote | decisão |
|---|---|---|---|---|---|---|---|---|---|
| P1 | `src/lib/queries/conflitos.ts:558` | `ladosDosAtivos` | `v_conflitos_filiais` · `.in('ativo_id')` | `ativo_id` | unicidade só por construção (`0134`), não por constraint — ver a nota da revisão abaixo | L (resumo antes de apagar) | ≤ 100/lote = 1 página | 10.000 | OFFSET [V] |
| P2 | `src/lib/queries/relatorios/estoque.ts:305` | `dadosAtivos` | `ativos` · `.in('id')` | `id` | coluna única | L (snapshot) | ≤ 100/lote | 10.000 | **KEYSET** |
| P3 | `src/lib/queries/relatorios/estoque.ts:331` | `chamadoAteData` | `movimentacoes` · `.in('ativo_id')` + chamado + data | `created_at desc, id desc` | composta | L | ≤ 900/lote | 20.000 | OFFSET [C] |
| P4 | `src/lib/queries/relatorios/estoque.ts:486` | envios de manutenção | `movimentacoes` · `.in('ativo_id')` + tipo + data | `created_at desc, id desc` | composta | L | ≤ 900/lote | 20.000 | OFFSET [C] |
| P5 | `src/lib/queries/relatorios/estoque.ts:500` | anotações de manutenção | `anotacoes` · `.in('ativo_id')` + data | `created_at asc, id asc` | composta | L | ≤ 200/lote | 10.000 | OFFSET [C] |
| P6 (nova) | `src/lib/queries/relatorios/movimentacoes.ts` | `buscarEstornosAteData` | `movimentacoes` · `.in('estorno_de')` + `tipo = estorno` + data, sem filial | `id` | coluna única | L | ≤ 1/movimentação | 10.000 | **KEYSET** (+`id`) |

**A conta.** `paginarTodos`: **33 KEYSET** (1–3, 9–35, 38, 42, 44) · **14 OFFSET** (4–8, 36, 39–41, 43, 45–47, 49) · **1 herda**
(37) · **1 muda de forma** (48) = 48 **+1 nova** (49). `paginarPorIds`: **1 KEYSET** (P2) · **4 OFFSET** (P1, P3–P5) = 5, **+1
nova** (P6). OFFSET por motivo, somando as duas tabelas: [C] 15 · [T] 3 · [R] 2 · [V] 4 (as marcas se somam onde há dois
motivos).

(corrigido em 17/09 pela execução: o censo contou 48 chamadas de `paginarTodos` e o plano não previa nenhuma nova; a revisão
adversarial do lote 2 acrescentou a 49 — `lerSaldoItensEmNiveis`, OFFSET porque a fonte é RPC, com o `cap`
`CAP_SALDO_ITENS_EM_NIVEIS`. Sem ela, a resposta de (filiais + 1) × itens linhas passaria calada do `max-rows` de 1.000 do
PostgREST a partir de 143 itens com as seis filiais; ver §6.4. Até aqui eram 13 OFFSET e [R] 1.)
Nenhuma chamada de hoje ordena por uma composta que `movimentacoes.ordem` substitua sem mudar a ordem visível — por isso o
cursor da F53 não entra em chamada nenhuma desta fase, e o motivo fica escrito.

**Nota da revisão do lote 1 (16/09/2026) — o que [V] quer dizer, e por que P1 fica em OFFSET.** A justificativa original de
P1 ("keyset sobre coluna que pode repetir pularia a linha empatada") era incoerente: o OFFSET de P1 ordena só por `ativo_id`,
e com `ativo_id` repetido ele também erraria na virada. As duas formas dependem da mesma unicidade, e ela vale por construção
(`0134`: uma linha por ativo). [V] passa a significar *unicidade só de construção, sem constraint* — fora da régua do keyset,
que é o `id` de uma tabela, porque a guarda da chave de `paginarTodos` **não enxerga a repetição que cai na virada da página**
(medido: 1.500 de 1.501 linhas, sem exceção). A régua virou trava por AST em `src/lib/queries/relatorios/comum.test.ts` (fonte =
tabela com PK `id` lida nas migrations, `.order` só `id` ascendente, `.gt('id', cursor)`, `chaveDe` → `.id`, página escrita na
chamada). E em P1 o keyset não compraria nada: o lote de ≤ 100 ids é uma página só. As contagens acima não mudam.

### 2.2 A tabela dos consumidores das sete `rel_*` (fato 10)

Uma linha por ponto. "Troca" = o que a Frente D faz nele. As chamadas em roteiro com `null` passam a receber a lista de
todas as filiais (inclusive desativadas); as com uma filial, `array[<variável>]`, lendo o nível explícito em
`rel_saldo_itens_filiais` (r).

| # | ponto (arquivo:linha) | função velha | forma do recorte hoje | troca |
|---|---|---|---|---|
| 1 | `src/lib/queries/itens.ts:142` (`getSaldosItens`) | `rel_saldo_itens` | `filialId: number \| null` | `rel_saldo_itens_filiais(ids)`, nível do total (§6.4) |
| 2 | `src/lib/queries/relatorios/estoque.ts:116` (`lerEstadoAtivos`) | `rel_estoque_asof` | `filialId` | `rel_estoque_asof_filiais(recorteDeFiliais(…))` |
| 3 | `src/lib/queries/relatorios/itens.ts:90` (`getGruposItens`) | `rel_saldo_itens` | `filialId` | nova, nível do total |
| 4 | `src/lib/queries/relatorios/itens.ts:91` | `rel_mov_itens` | `filialId` | nova |
| 5 | `src/lib/queries/relatorios/itens.ts:92` | `rel_frescor_itens` | `filialId` | nova |
| 6 | `src/lib/queries/relatorios/movimentacoes.ts:54` | `rel_mov_por_mes` | `filialId` | nova |
| 7 | `src/lib/queries/relatorios/movimentacoes.ts:106` | `rel_por_motivo` | `filialId` | nova |
| 8 | `src/lib/queries/relatorios/movimentacoes.ts:128` | `rel_resumo` | `filialId` | nova |
| 9 | `scripts/manutencao/validar-truncamento.ts:89` (pela porta) | `rel_estoque_asof` | `filialId` (NULL = consolidado) | nova, lista explícita |
| 10 | `scripts/seed.ts:1660` (`db.rpc`) | `rel_saldo_itens` | variável, laço por filial | nova, `[id]` |
| 11 | `scripts/seed.ts:1663` (`db.rpc`) | `rel_saldo_itens` | lookup por slug | nova, `[id]` |
| 12 | `scripts/smoke/fixtures-passe2.ts:257` (`sessao.rpc`) | `rel_saldo_itens` | parâmetro | nova, `[id]` |
| 13 | `scripts/smoke/smoke-prod.mjs:685` (Parte B) | `rel_saldo_itens` | `null` | nova, todas; a conferência de forma ganha `filial_id` |
| 14 | `scripts/smoke/smoke-prod.mjs:717` (Parte B) | `rel_saldo_itens` | primeira filial | nova, `[id]` |
| 15 | `scripts/smoke/smoke-prod.mjs:726` (Parte B) | `rel_resumo` | `null` | nova, todas |
| 16 | `scripts/smoke/smoke-prod.mjs:740` (Parte B) | `rel_mov_por_mes` | `null` | nova, todas |
| 17 | `scripts/formas/censo.mjs:261` (a grade fixa de chamadas) | `rel_estoque_asof` | `null` × 2 datas | chave e argumentos novos |
| 18 | `scripts/formas/censo.mjs:265` | `rel_saldo_itens` | `null` | idem |
| 19 | `scripts/formas/censo.mjs:266` | `rel_mov_itens` | `null` | idem |
| 20 | `scripts/formas/censo.mjs:267` | `rel_frescor_itens` | `null` | idem |
| 21 | `scripts/formas/censo.mjs:268` | `rel_mov_por_mes` | `null` | idem |
| 22 | `scripts/formas/censo.mjs:269` | `rel_por_motivo` | `null` | idem |
| 23 | `scripts/formas/censo.mjs:270` | `rel_resumo` | `null` | idem |
| 24 | `scripts/formas/conferir.mts` (via `CATALOGO`, recorte `filial: 'p_filial'` do descritor: consolidado + uma célula por filial ativa) | as sete | pelo descritor | a grade passa lista; células iguais |
| 25 | `scripts/perf/medir-itens.mjs:634` | `rel_saldo_itens` | `null::smallint` em SQL | nova — (j) |
| 26 | `scripts/perf/medir-itens.mjs:643` | `rel_saldo_itens` | uma filial em SQL | nova — (j) |
| 27 | `scripts/perf/medir-itens.mjs:652` | `rel_mov_itens` | `null::smallint` em SQL | nova — (j) |
| 28 | `src/lib/supabase/linhas-tipos.test.ts:119` | `rel_estoque_asof` | `null` | nova, lista |
| 29 | `src/lib/supabase/linhas-tipos.test.ts:145` | `rel_estoque_asof` | `1` | nova, `[1]` |
| 30 | `src/lib/supabase/linhas-tipos.test.ts:149` | `rel_saldo_itens` | `null` | nova |
| 31 | `src/lib/supabase/linhas-tipos.test.ts:150` | `rel_frescor_itens` | `2` | nova |
| 32 | `src/lib/supabase/linhas-tipos.test.ts:152` | `rel_estoque_asof` | `null` | nova; e um caso novo provando que `null` NÃO compila |
| 33 | `src/lib/queries/formas/relatorios.ts:28` (descritor) | `rel_estoque_asof` | recorte do descritor `filial: 'p_filial'` | `rpc` e recorte novos |
| 34 | `src/lib/queries/formas/relatorios.ts:47` | `rel_saldo_itens` | idem | idem; a forma ganha `filial_id` anulável |
| 35 | `src/lib/queries/formas/relatorios.ts:66` | `rel_mov_itens` | idem | idem |
| 36 | `src/lib/queries/formas/relatorios.ts:76` | `rel_frescor_itens` | idem | idem |
| 37 | `src/lib/queries/formas/relatorios.ts:86` | `rel_mov_por_mes` | idem | idem |
| 38 | `src/lib/queries/formas/relatorios.ts:94` | `rel_por_motivo` | idem | idem |
| 39 | `src/lib/queries/formas/relatorios.ts:102` | `rel_resumo` | idem | idem |
| 40 | `src/lib/supabase/rpc.ts:84` (`ARGUMENTOS_ANULAVEIS`) | `rel_estoque_asof` | `RECORTE_DO_RELATORIO` | sai do mapa |
| 41 | `src/lib/supabase/rpc.ts:85` | `rel_saldo_itens` | idem | sai |
| 42 | `src/lib/supabase/rpc.ts:86` | `rel_mov_itens` | idem | sai |
| 43 | `src/lib/supabase/rpc.ts:87` | `rel_frescor_itens` | idem | sai |
| 44 | `src/lib/supabase/rpc.ts:88` | `rel_mov_por_mes` | idem | sai |
| 45 | `src/lib/supabase/rpc.ts:89` | `rel_por_motivo` | idem | sai |
| 46 | `src/lib/supabase/rpc.ts:90` | `rel_resumo` | idem | sai; `RECORTE_DO_RELATORIO` deixa de existir |
| 47 | `src/lib/supabase/rpc.ts:114` (`COLUNAS_DE_RETORNO_ANULAVEIS`) | `rel_estoque_asof` (4 colunas) | — | chave nova; + `rel_saldo_itens_filiais.filial_id` — (k) |
| 48 | `src/lib/queries/relatorios/fronteira-viewer.test.ts:206` (`RPCS`) | `rel_resumo` | — | troca 1:1 |
| 49 | `fronteira-viewer.test.ts:207` | `rel_estoque_asof` | — | 1:1 |
| 50 | `fronteira-viewer.test.ts:208` | `rel_mov_por_mes` | — | 1:1 |
| 51 | `fronteira-viewer.test.ts:209` | `rel_por_motivo` | — | 1:1 |
| 52 | `fronteira-viewer.test.ts:210` | `rel_saldo_itens` | — | 1:1 |
| 53 | `fronteira-viewer.test.ts:211` | `rel_mov_itens` | — | 1:1 |
| 54 | `fronteira-viewer.test.ts:212` | `rel_frescor_itens` | — | 1:1; catraca `≤ 7` intacta — (n) |
| 55 | `src/lib/types/database.ts:1688` | `rel_estoque_asof` | `Args: { p_filial: number }` | *hand-fix* datado, depois regenerado |
| 56 | `src/lib/types/database.ts:1701` | `rel_frescor_itens` | idem | idem |
| 57 | `src/lib/types/database.ts:1708` | `rel_mov_itens` | idem | idem |
| 58 | `src/lib/types/database.ts:1719` | `rel_mov_por_mes` | idem | idem |
| 59 | `src/lib/types/database.ts:1727` | `rel_por_motivo` | idem | idem |
| 60 | `src/lib/types/database.ts:1735` | `rel_resumo` | idem | idem |
| 61 | `src/lib/types/database.ts:1756` | `rel_saldo_itens` | idem | idem (a `:1746`, `rel_saldo_colaborador`, não muda) |
| 62 | `scripts/db/mutacoes.mjs:1486` | `rel_estoque_asof(smallint, date)` | `f53-asof-volta-ao-desempate-por-id` → **3a** | reancorada no corpo novo — (b), (l) |
| 63 | `scripts/db/mutacoes.mjs:1538` | `rel_estoque_asof(smallint, date)` | `f53-asof-passa-a-ordenar-so-por-ordem` → **6a** | reancorada — (b), (l) |
| 64 | `src/lib/itens/migrations-f38.test.ts:140-150` (`INTOCAVEIS`) | `rel_saldo_itens`, `rel_mov_itens`, `rel_estoque_asof` | — | exceção escrita para o `drop` — (m) |
| 65 | `supabase/tests/asof_desempate.sql:183` | `rel_estoque_asof` | `null` | **3a** |
| 66 | `asof_desempate.sql:255` | `rel_estoque_asof` | `null` | **1** |
| 67 | `asof_desempate.sql:286` | `rel_estoque_asof` | `null` | **2a** |
| 68 | `asof_desempate.sql:287` | `rel_estoque_asof` | `null` | **2b** |
| 69 | `asof_desempate.sql:501` | `rel_estoque_asof` | `null` | **6a** |
| 70 | `supabase/tests/dev_destrutivo.sql:1103` | `rel_saldo_itens` | variável | **5a** |
| 71 | `dev_destrutivo.sql:1118` | `rel_saldo_itens` | variável | **5b** (`count(*)` — (r)) |
| 72 | `dev_destrutivo.sql:1137` | `rel_resumo` | `null::smallint` | **9a** |
| 73 | `dev_destrutivo.sql:1138` | `rel_mov_por_mes` | `null::smallint` | **9a** |
| 74 | `dev_destrutivo.sql:1139` | `rel_por_motivo` | `null::smallint` | **9a** |
| 75 | `dev_destrutivo.sql:1184` | `rel_resumo` | `null::smallint` | **9e** |
| 76 | `dev_destrutivo.sql:1185` | `rel_mov_por_mes` | `null::smallint` | **9e** |
| 77 | `dev_destrutivo.sql:1186` | `rel_por_motivo` | `null::smallint` | **9e** |
| 78 | `dev_destrutivo.sql:1235` | `rel_saldo_itens` | variável | **10a** |
| 79 | `dev_destrutivo.sql:1249` | `rel_saldo_itens` | variável | **10b** |
| 80 | `supabase/tests/f36_detentor.sql:304` | `rel_estoque_asof` | variável | **i1** |
| 81 | `f36_detentor.sql:313` | `rel_estoque_asof` | variável | **i2** |
| 82 | `supabase/tests/f38_itens_com_ativo.sql:174` | `rel_saldo_itens` | variável | **0** |
| 83 | `f38_itens_com_ativo.sql:486` | `rel_saldo_itens` | variável | leitura intermediária de **7b** |
| 84 | `f38_itens_com_ativo.sql:501` | `rel_saldo_itens` | variável | **7b** |
| 85 | `f38_itens_com_ativo.sql:618` | `rel_saldo_itens` | variável | leitura intermediária de **8a** |
| 86 | `f38_itens_com_ativo.sql:634` | `rel_saldo_itens` | variável | **8a** |
| 87 | `f38_itens_com_ativo.sql:708` | `rel_saldo_itens` | variável | leitura intermediária de **15b** |
| 88 | `f38_itens_com_ativo.sql:735` | `rel_saldo_itens` | variável | **15b** |
| 89 | `f38_itens_com_ativo.sql:773` | `rel_saldo_itens` | variável | **13a** |
| 90 | `f38_itens_com_ativo.sql:799` | `rel_saldo_itens` | variável | **13b** |
| 91 | `supabase/tests/f41_regularizacao.sql:170` | `rel_saldo_itens` | variável | **0** |
| 92 | `f41_regularizacao.sql:211` | `rel_saldo_itens` | variável | **1** |
| 93 | `f41_regularizacao.sql:256` | `rel_saldo_itens` | variável | leitura intermediária de **2** |
| 94 | `f41_regularizacao.sql:280` | `rel_saldo_itens` | variável | **2** |
| 95 | `f41_regularizacao.sql:329` | `rel_saldo_itens` | variável | **3** |
| 96 | `f41_regularizacao.sql:383` | `rel_saldo_itens` | variável | **4** |
| 97 | `f41_regularizacao.sql:411` | `rel_saldo_itens` | variável | leitura intermediária de **5** |
| 98 | `f41_regularizacao.sql:436` | `rel_saldo_itens` | variável | **5** |
| 99 | `f41_regularizacao.sql:470` | `rel_saldo_itens` | variável | leitura intermediária de **6** |
| 100 | `f41_regularizacao.sql:483` | `rel_saldo_itens` | variável | **6** |
| 101 | `f41_regularizacao.sql:621` | `rel_saldo_itens` | variável | leitura intermediária de **10** |
| 102 | `f41_regularizacao.sql:635` | `rel_saldo_itens` | variável | **10** |
| 103 | `supabase/tests/import_substituir.sql:597` | `rel_saldo_itens` | variável | **5a** |
| 104 | `import_substituir.sql:752` | `rel_saldo_itens` | variável | **5j** |
| 105 | `supabase/tests/itens_quantidade.sql:76` | `rel_saldo_itens` | variável | **1** |
| 106 | `itens_quantidade.sql:89` | `rel_saldo_itens` | variável | **2** |
| 107 | `itens_quantidade.sql:101` | `rel_saldo_itens` | variável | **3** |
| 108 | `itens_quantidade.sql:113` | `rel_saldo_itens` | variável | **4** |
| 109 | `itens_quantidade.sql:131` | `rel_saldo_itens` | variável | **5** |
| 110 | `itens_quantidade.sql:184` | `rel_saldo_itens` | variável | **10** |
| 111 | `itens_quantidade.sql:197` | `rel_saldo_itens` | variável | **11a** |
| 112 | `itens_quantidade.sql:206` | `rel_saldo_itens` | variável | **11** |
| 113 | `itens_quantidade.sql:228` | `rel_estoque_asof` | variável | **12a** |
| 114 | `itens_quantidade.sql:238` | `rel_estoque_asof` | variável | **12b** |
| 115 | `itens_quantidade.sql:245` | `rel_estoque_asof` | variável | **12c** |
| 116 | `supabase/tests/transferencia_item.sql:131` | `rel_saldo_itens` | `null` | **0** |
| 117 | `transferencia_item.sql:132` | `rel_saldo_itens` | `null` | **0** |
| 118 | `transferencia_item.sql:195` | `rel_saldo_itens` | `null` | **2a** |
| 119 | `transferencia_item.sql:196` | `rel_saldo_itens` | `null` | **2a** |
| 120 | `transferencia_item.sql:208` | `rel_saldo_itens` | variável (origem) | **2b** |
| 121 | `transferencia_item.sql:209` | `rel_saldo_itens` | variável (destino) | **2b** |
| 122 | `transferencia_item.sql:228` | `rel_saldo_itens` | `null` | **2c** |
| 123 | `transferencia_item.sql:232` | `rel_saldo_itens` | `null` | **2c** |

Os 59 pontos de roteiro são as linhas 65–123 (5 · 10 · 2 · 9 · 12 · 2 · 11 · 8), com a contagem feita sem comentário e
exigindo `public.rel_…(` — uma busca ingênua pega 61, porque casa texto de `raise notice` e de comentário. Nenhuma chamada a
`rel_mov_itens` ou `rel_frescor_itens` em roteiro. **Só citam por nome, sem chamar** (nada a trocar além de comentário, se
envelhecer): `actions/admin.ts`, `actions/itens.ts`, `ajuda/conteudo/itens-por-quantidade.ts`, `itens/efeito-lancamento.ts`,
`itens/lista.ts`, `itens/repor.ts`, `itens/saldo-apos.ts`, `relatorios/periodo.ts`, `relatorios/serie-estado.ts`,
`relatorios/serie.ts`, `relatorios/tipos.ts`, `supabase/leitura.ts:63`, `relatorios/[filial]/page.tsx:47`,
`validators/detentor-sql.test.ts:12`, `queries/itens.test.ts`, `itens/lista.test.ts`, `relatorios/periodo.test.ts`,
`formas/catalogo.test.ts`, `supabase/rpc-unica-porta.test.ts` (sintéticos com `rel_resumo`), `scripts/db/gerar-0134.mjs`
(gerador histórico com teto na `0134` — não muda), `scripts/smoke/import-ensaio.ts:426`, e os roteiros
`fuso_do_negocio.sql:64` e `itens_extra.sql:5` (comentários). **Não muda:** `rel_saldo_colaborador` (a quinta chamada da
Parte B do smoke e o tratamento à parte de `censo.mjs`).

---

## 3. As linhas de base "antes" — produção, só leitura

### 3.1 O método

- **Molde de `medir-rls.mjs` (F59).** Um bloco `do $f60$ … end $f60$;` por medição: a primeira instrução liga
  `transaction_read_only`; o banco confirma o alvo (`rotulo_de_ambiente() is null` em produção, senão
  `F60_ALVO_RECUSADO`); a identidade é escolhida DENTRO do banco (perfil ativo, não arquivado, cargo `admin`/`dev`) e o id
  fica numa variável local; as filiais do recorte também (**filial_a** = menor id ativa, **filial_b** = maior id ativa) e
  saem só como rótulo; o bloco SEMPRE termina em `raise exception` com o jsonb de resultado — nada se confirma. Os
  geradores gravam os comandos fora do repositório; a sessão os executa pelo MCP e grava a resposta ao lado; o `analisar`
  produz o JSON. Nenhum objeto criado em banco nenhum.
- **Nunca literal no lugar do argumento (fato 6).** Forma **(a)** = a chamada como o PostgREST chama —
  `json_to_record(<json>) as pgrst_body(…), lateral public.<fn>(p := pgrst_body.p, …)`: o argumento nasce de um JOIN, e a
  função, com `set search_path`, aparece como `Function Scan` (caixa preta). Forma **(b)** = o corpo EMULADO — o corpo vivo
  lido por `corpo-vigente.mjs` (nunca colado à mão), com os parâmetros trocados por `$1`/`$2`/`$3`, `prepare` uma vez com
  `plan_cache_mode = force_generic_plan` e `execute` por célula: o único jeito de ver o plano GENÉRICO de dentro da função.
- **Estatística.** `explain (analyze, buffers, format json)`; 1 aquecimento + **N = 7** repetições intercaladas a/b;
  mediana e p95 (posto mais próximo) de execução e planejamento; buffers do nó raiz; linhas conferidas contra a contagem
  esperada. A4 com N = 3.
- **Papel.** `authenticated` com `request.jwt.claims` locais à transação nas medições de negócio; B7/B8 (catálogo) como
  `postgres`.

### 3.2 As sete `rel_*` — `docs/perf/f60-producao-antes-rel.json`

Mediana / p95 de execução em ms; planejamento mediano (a · b); buffers `hit` medianos da forma (b). Linhas = as da célula.
Datas: `hoje`, `hoje-7`, `hoje-60`; janelas: `7d` = [hoje−6, hoje], `365d` = [hoje−364, hoje].

| função | célula | recorte | linhas | (a) chamada | (b) corpo emulado | plan. (a · b) | buffers (b) |
|---|---|---|---:|---|---|---|---:|
| `rel_estoque_asof` | hoje | consolidado | 1.624 | 35,835 / 37,271 | 32,997 / 35,300 | 0,062 · 0,027 | 368 |
| `rel_estoque_asof` | hoje | filial_a | 1.146 | 28,949 / 31,958 | 29,022 / 30,300 | 0,069 · 0,027 | 368 |
| `rel_estoque_asof` | hoje | filial_b | 5 | 15,861 / 16,204 | 16,379 / 18,085 | 0,067 · 0,028 | 368 |
| `rel_estoque_asof` | hoje-7 | consolidado | 1.610 | 35,690 / 39,333 | 33,583 / 37,028 | 0,062 · 0,028 | 319 |
| `rel_estoque_asof` | hoje-7 | filial_a | 1.131 | 29,049 / 30,623 | 28,770 / 30,337 | 0,067 · 0,028 | 319 |
| `rel_estoque_asof` | hoje-7 | filial_b | 5 | 15,847 / 16,537 | 15,510 / 16,598 | 0,061 · 0,027 | 319 |
| `rel_estoque_asof` | hoje-60 | consolidado | 1.116 | 24,918 / 28,706 | 24,323 / 26,268 | 0,069 · 0,028 | 249 |
| `rel_estoque_asof` | hoje-60 | filial_a | 839 | 20,286 / 21,112 | 18,740 / 21,427 | 0,063 · 0,027 | 249 |
| `rel_estoque_asof` | hoje-60 | filial_b | 0 | 10,115 / 11,588 | 9,968 / 11,048 | 0,065 · 0,028 | 249 |
| `rel_saldo_itens` | hoje | consolidado | 23 | 2,137 / 2,633 | 1,018 / 1,650 | 0,052 · 0,021 | 7 |
| `rel_saldo_itens` | hoje | filial_a | 23 | 2,196 / 2,694 | 0,774 / 0,936 | 0,048 · 0,021 | 7 |
| `rel_saldo_itens` | hoje | filial_b | 23 | 2,079 / 2,443 | 0,684 / 0,838 | 0,047 · 0,019 | 7 |
| `rel_mov_itens` | 7d | consolidado | 23 | 1,327 / 1,851 | 0,606 / 0,661 | 0,042 · 0,015 | 15 |
| `rel_mov_itens` | 7d | filial_a | 23 | 1,377 / 1,693 | 0,578 / 0,741 | 0,044 · 0,016 | 15 |
| `rel_mov_itens` | 7d | filial_b | 23 | 1,303 / 1,542 | 0,564 / 0,680 | 0,045 · 0,017 | 15 |
| `rel_mov_itens` | 365d | consolidado | 23 | 1,495 / 1,879 | 0,698 / 0,875 | 0,045 · 0,015 | 42 |
| `rel_mov_itens` | 365d | filial_a | 23 | 1,289 / 1,302 | 0,606 / 0,644 | 0,042 · 0,015 | 42 |
| `rel_mov_itens` | 365d | filial_b | 23 | 1,376 / 2,327 | 0,625 / 0,883 | 0,047 · 0,017 | 42 |
| `rel_frescor_itens` | hoje | consolidado | 2 | 1,029 / 1,317 | 0,548 / 0,850 | 0,038 · 0,015 | 7 |
| `rel_frescor_itens` | hoje | filial_a | 2 | 1,050 / 1,375 | 0,534 / 0,649 | 0,035 · 0,013 | 7 |
| `rel_frescor_itens` | hoje | filial_b | 1 | 0,958 / 1,051 | 0,504 / 0,658 | 0,034 · 0,012 | 7 |
| `rel_mov_por_mes` | 7d | consolidado | 2 | 0,761 / 1,250 | 0,311 / 0,508 | 0,040 · 0,012 | 52 |
| `rel_mov_por_mes` | 7d | filial_a | 2 | 0,697 / 0,978 | 0,284 / 0,316 | 0,036 · 0,011 | 52 |
| `rel_mov_por_mes` | 7d | filial_b | 1 | 0,725 / 0,889 | 0,271 / 0,460 | 0,037 · 0,012 | 52 |
| `rel_mov_por_mes` | 365d | consolidado | 8 | 1,999 / 2,996 | 1,840 / 2,196 | 0,048 · 0,015 | 201 |
| `rel_mov_por_mes` | 365d | filial_a | 6 | 2,127 / 2,369 | 1,444 / 1,636 | 0,044 · 0,016 | 201 |
| `rel_mov_por_mes` | 365d | filial_b | 2 | 1,607 / 2,167 | 1,139 / 1,359 | 0,044 · 0,013 | 201 |
| `rel_por_motivo` | 7d | consolidado | 8 | 1,197 / 2,526 | 0,651 / 1,063 | 0,041 · 0,014 | 107 |
| `rel_por_motivo` | 7d | filial_a | 5 | 1,259 / 1,538 | 0,607 / 0,918 | 0,039 · 0,013 | 75 |
| `rel_por_motivo` | 7d | filial_b | 1 | 1,212 / 1,335 | 0,575 / 0,629 | 0,042 · 0,015 | 57 |
| `rel_por_motivo` | 365d | consolidado | 11 | 3,405 / 3,813 | 2,743 / 3,150 | 0,056 · 0,015 | 700 |
| `rel_por_motivo` | 365d | filial_a | 11 | 2,692 / 3,220 | 2,243 / 2,545 | 0,050 · 0,020 | 566 |
| `rel_por_motivo` | 365d | filial_b | 3 | 2,199 / 2,437 | 1,347 / 1,746 | 0,040 · 0,015 | 210 |
| `rel_resumo` | 7d | consolidado | 17 | 2,628 / 2,758 | 1,228 / 1,583 | 0,053 · 0,021 | 217 |
| `rel_resumo` | 7d | filial_a | 7 | 2,071 / 2,517 | 1,084 / 1,181 | 0,045 · 0,021 | 121 |
| `rel_resumo` | 7d | filial_b | 1 | 2,124 / 2,645 | 0,924 / 1,120 | 0,047 · 0,021 | 67 |
| `rel_resumo` | 365d | consolidado | 59 | 6,185 / 6,867 | 5,063 / 6,096 | 0,063 · 0,027 | 1.698 |
| `rel_resumo` | 365d | filial_a | 26 | 4,766 / 6,040 | 3,886 / 4,219 | 0,048 · 0,021 | 1.296 |
| `rel_resumo` | 365d | filial_b | 3 | 3,238 / 3,768 | 1,836 / 1,985 | 0,048 · 0,023 | 228 |

Linhas conferidas nas 78 medições (39 células × 2 formas). **Os nós que leem a tabela grande na forma (b)**, iguais nos três recortes:

| função | como lê a tabela grande | demais nós |
|---|---|---|
| `rel_estoque_asof` | `movimentacoes` por `Index Scan` em `movimentacoes_data_ordem_idx` (a faixa `data <= p_data` — hoje, a tabela inteira) + o anti-join por `movimentacoes_estorno_de_idx`; `ativos` por `Seq Scan` | `Sort` + `Unique` (o `distinct on`), `Merge Join`, `Hash Join`, `Subquery Scan`, `Result` |
| `rel_saldo_itens` | `lancamentos_item` por `Seq Scan`; `itens` por `Seq Scan` | `CTE Scan`, `Aggregate`, `Hash Join`, `Sort` |
| `rel_mov_itens` | `lancamentos_item` por `Index Scan` em `lanc_item_item_filial_idx`; `itens` por `Seq Scan` | `Aggregate`, `Hash Join`, `Sort` |
| `rel_frescor_itens` | `lancamentos_item` e `itens` por `Seq Scan` | `Aggregate`, `Hash Join` |
| `rel_mov_por_mes` | `movimentacoes` por `Index Scan` em `movimentacoes_data_ordem_idx` | `Aggregate`, `Sort` |
| `rel_por_motivo` | idem, + `motivos_pkey` | `Nested Loop`, `Aggregate`, `Sort` |
| `rel_resumo` | idem, + `ativos_pkey`, `motivos_pkey`; `filiais` por `Seq Scan` | `Nested Loop`, `Aggregate`, `Sort` |

A forma (a) mostra sempre `Nested Loop` + `Function Scan`. **A leitura que prova o fato 6 no volume de hoje:** o as-of da
filial_b devolve 5 linhas lendo os mesmos 368 buffers do consolidado de 1.624 — o recorte é filtro de SAÍDA, não de
leitura; e nenhuma célula de filial chega a `mov_filial_data_idx` (§3.5, B5). Com 155 lançamentos, `Seq Scan` em
`lancamentos_item` não prova nem desprova índice (R-REL-33).

### 3.3 O `pg_stat_statements` por papel — `docs/perf/f60-pgss-antes.json`

Filtro pelo nome ENTRE ASPAS, como o PostgREST cita (`s.query ~ ('"' || nome || '"\s*\(')`), agrupado por `pg_roles.rolname`;
saem só papel, chamadas, média e o número de formas de statement. `stats_reset` 09/07/2026, leitura às 17:37 BRT de 16/09.

| função | `authenticated`: chamadas · média ms · formas | `service_role`: chamadas · média ms · formas |
|---|---|---|
| `rel_estoque_asof` | 2.276 · 98,94 · 3 | 306 · 23,07 · 2 |
| `rel_saldo_itens` | 8.406 · 16,37 · 4 | 211 · 3,86 · 2 |
| `rel_mov_itens` | 1.484 · 12,71 · 3 | 204 · 2,80 · 1 |
| `rel_frescor_itens` | 1.484 · 8,80 · 3 | 204 · 2,23 · 1 |
| `rel_mov_por_mes` | 497 · 11,77 · 2 | 142 · 13,63 · 1 |
| `rel_por_motivo` | 1.633 · 13,91 · 2 | 298 · 13,09 · 1 |
| `rel_resumo` | 1.749 · 22,62 · 2 | 298 · 17,54 · 1 |
| `rel_saldo_colaborador` | 282 · 2,59 · 3 | — |

A média acumulada desde julho carrega volume, cache frio e concorrência de outros meses — não é a mediana do §3.2 e não se
compara com ela. O que este instrumento prova é PRESENÇA de chamada por papel: é o insumo da janela do `drop` (§9).

### 3.4 A variação do as-of com a data (A4)

Consolidado, forma (a), N = 3 + 1 aquecimento, as 12 datas do §4. Mediana / p95 em ms; buffers `hit` medianos.

| data | `rel_estoque_asof` linhas | as-of exec | as-of buffers | `rel_saldo_itens` exec | saldo buffers |
|---|---:|---|---:|---|---:|
| 2024-01-07 | 0 | 3,708 / 4,985 | 239 | 1,818 / 1,906 | 8 |
| 2026-06-30 | 1.006 | 19,384 / 22,099 | 249 | 1,431 / 1,764 | 8 |
| 2026-07-27 | 1.403 | 29,260 / 29,589 | 285 | 1,424 / 1,582 | 8 |
| 2026-07-31 | 1.597 | 31,120 / 32,351 | 304 | 1,759 / 2,129 | 8 |
| 2026-08-17 | 1.604 | 32,362 / 33,993 | 318 | 1,900 / 1,993 | 8 |
| 2026-08-28 | 1.605 | 31,615 / 31,811 | 328 | 1,694 / 2,013 | 8 |
| 2026-08-31 | 1.605 | 35,042 / 35,663 | 328 | 1,947 / 3,488 | 8 |
| 2026-09-04 | 1.610 | 31,965 / 35,608 | 330 | 1,959 / 2,033 | 8 |
| 2026-09-09 | 1.610 | 35,240 / 35,614 | 329 | 1,601 / 1,666 | 8 |
| 2026-09-14 | 1.610 | 34,956 / 34,980 | 359 | 1,655 / 1,682 | 8 |
| 2026-09-15 | 1.610 | 32,597 / 33,403 | 366 | 1,691 / 1,692 | 8 |
| 2026-09-16 | 1.624 | 31,402 / 31,866 | 378 | 1,875 / 1,962 | 8 |

O custo do as-of cresce com as movimentações ATÉ a data (buffers 239 → 378) e com as linhas que sobrevivem; o de saldo de
itens é plano no volume de hoje.

### 3.5 As formas de custo do lote 1 (B1–B8) — `docs/perf/f60-producao-antes-custo.json`

Mediana / p95 de execução em ms, `authenticated` (B7/B8 como `postgres`), N = 7 + aquecimento.

| bloco · forma | exec | linhas | nós e índices |
|---|---|---:|---|
| **B1** leitura de hoje, página 1 | 1,503 / 1,993 | 1.000 | `Limit` + `Index Scan ativos_pkey` (1.007 buffers) |
| **B1** leitura de hoje, página 2 | 2,113 / 2,422 | 622 | idem (1.636 buffers) |
| **B1** `group by status` (sem as baixas) | 1,433 / 2,009 | 7 | `Aggregate` + `Index Only Scan ativos_filial_status_idx` (265 buffers) |
| **B1** sete contagens `head` (uma por status) | de 0,722 a 1,413 cada | — | `Index Only Scan` (265 buffers cada) |
| **B1** somas | páginas 1.622 = agregação 1.622 = contagens 1.622 | | as contagens por status batem célula a célula |
| **B2** `/ativos` página 1 com busca (1 palavra × 8 colunas) | 9,860 / 11,657 | 50 | `Seq Scan` + `Nested Loop` + `Memoize` + `Sort` |
| **B2** página 1 sem busca | 3,731 / 5,313 | 50 | `Seq Scan` em `ativos` e `filiais` + `Hash Join` + `Sort` |
| **B2** `count exact` com busca | 7,727 / 10,336 | 1 | `Seq Scan` |
| **B2** `count exact` sem filtro | 1,336 / 1,758 | 1 | `Index Only Scan idx_ativos_substitui_ativo_id` |
| **B2** totais | exato 1.635 · com a busca 1.589 · `reltuples` 1.631 | | a estimativa do `count: 'planned'` não foi gravada — (q) |
| **B3** fila de consolidação (`limit 500`) | 90,183 / 92,983 | 500 | `Seq Scan` em `movimentacoes` e `lancamentos_item`, `Append`, `Sort`, `Aggregate`, `Merge Join` |
| **B3** resumo da consolidação | 83,373 / 95,500 | 2 | idem, com `Hash Join` |
| **B3** cadastro com os dois counts | 1,259 / 1,508 | 34 | `Index Only Scan movimentacoes_colaborador_idx`, `Bitmap Index Scan lanc_item_colaborador_idx` |
| **B3** volumes | 1.465 movimentações e 97 lançamentos com colaborador em texto; 889 grupos pendentes; 33 cadastrados | | |
| **B4** histórico de itens, página 1, recorte todas | 1,529 / 1,888 | 20 | `Incremental Sort` + `Index Scan lanc_item_created_idx` + 3 `Memoize` |
| **B4** `count head`, recorte todas | 0,316 / 0,339 | 1 | `Seq Scan` |
| **B4** página 1 com duas filiais | 1,610 / 2,791 | 20 | idem à página de todas |
| **B4** página 1 do item mais movimentado, ordem por data | 1,544 / 1,632 | 20 | `Seq Scan` + `Hash Join` + `Sort` |
| **B4** último lançamento do autor mais ativo (`getUltimoLancamento`) | 0,312 / 0,395 | 1 | `Incremental Sort` + `Index Scan lanc_item_created_idx` |
| **B5** saídas · filial_a 7d / 365d | 1,536 · 1,706 | 9 · 105 | `Incremental Sort` + `Index Scan mov_filial_data_idx` |
| **B5** saídas · consolidado 7d / 365d | 1,695 · 2,032 | 21 · **155** | `Sort` + `Seq Scan` |
| **B5** entradas · filial_a 7d / 365d | 1,974 · 1,925 | 18 · 113 | `Incremental Sort` + `Index Scan mov_filial_data_idx` |
| **B5** entradas · consolidado 7d / 365d | 2,293 · 2,051 | 22 · 136 | `Sort` + `Seq Scan` |
| **B5** transferências · filial_a 7d / 365d | 1,487 · 1,383 | 0 · 13 | `Sort` + `Seq Scan` (o `or` com o destino) |
| **B5** transferências · consolidado 7d / 365d | 1,373 · 1,572 | 1 · 14 | `Sort` + `Seq Scan` |
| **B6** estornos: proposto, um lote de 100 ids | 0,356 / 1,082 | 1 | `Index Scan movimentacoes_estorno_de_idx` |
| **B6** estornos: hoje, todos até a data | 0,276 / 0,512 | 8 | `Sort` + `Index Scan movimentacoes_estorno_de_idx` |
| **B6** volumes | 305 ids nas três tabelas de 365 dias → 4 lotes; 8 estornos até hoje, 1 deles no lote medido | | |
| **B7** `idx_scan` | `mov_ativo_idx` 163.352 · `lanc_item_item_filial_idx` 581 · `movimentacoes_data_ordem_idx` 7.732 · `movimentacoes_estorno_de_idx` 16.085 · `movimentacoes_ordem_lista_idx` 17.054 | | |
| **B8** tamanhos (bytes) | banco 24.251.539 · `ativos` 2.162.688 (índices 1.245.184) · `movimentacoes` 4.890.624 (2.531.328) · `lancamentos_item` 286.720 (212.992) | | |

### 3.6 Colaboradores — a emulação — `docs/perf/f60-colaboradores-emulacao-producao.json`

Bloco só leitura, 1 aquecimento + 5 medidas intercaladas; resultado conferido por contagem de linhas e md5 do conjunto
(`string_agg` ordenado) — só contagem e hash.

| forma | linhas | execução (ms, as cinco) | resultado |
|---|---:|---|---|
| v0 — a view de hoje (`0115`), a chave por linha | 922 | 121,8 · 100,1 · 100,2 · 100,0 · 101,9 | — |
| v1 — a chave por NOME distinto, `mode()` reproduzido por contagem | 922 | 49,3 · 50,2 · 49,8 · 50,1 · 55,1 | **hash igual ao da v0** |

Contexto: 1.465 + 97 linhas com colaborador na união, **979 nomes distintos**; na parte de movimentações a chave custa
41,05 ms por linha contra 32,97 ms por nome distinto, e o filtro `btrim` sozinho 2,44 ms. O plano de hoje, acumulado por
nó: `Seq Scan movimentacoes` 47,2 → `Append` 49,8 → **`Result` (a chave por linha) 84,9** → `Sort` 88,0 → `Aggregate` 92,4
→ `Merge Join` 93,0 → `Limit 500` 95,3.

### 3.7 O TTFB A/A e a regra do critério 27 — `docs/perf/f60-producao-antes-aa-{1,2}.json`

`node scripts/perf/medir.mjs` contra produção com a `1.64.0` no ar, código `96fc43f` (as três rotas novas já no harness):
rodada 1 às 19:47Z, rodada 2 às 21:13Z; 2 aquecimentos + 11 repetições round-robin; TTFB = chegada dos cabeçalhos;
`redirect: manual`; 0 falhas, todos 200. A conta local do smoke tem cargo admin (`/admin/colaboradores` responde 200). **As
rotas do visualizador não entraram:** o harness não resolveu uma senha de acesso ativa — igual à F59.

| rota | sessão | rodada 1 (mediana ms) | rodada 2 | Δ% (2 × 1) |
|---|---|---:|---:|---:|
| `/vercel.svg` — controle | pública | 12,9 | 12,7 | −1,6% |
| `/login` — controle | pública | 31,2 | 33,3 | +6,7% |
| `/relatorios/acesso` — controle | pública | 59,2 | 55,3 | −6,6% |
| `/login` com sessão (sonda do proxy) | operador | 67,9 | 69,0 | +1,6% |
| `/` | operador | 379,5 | 358,8 | −5,5% |
| `/ativos` | operador | 344,7 | 360,6 | +4,6% |
| `/ativos/[id]` | operador | 323,2 | 334,0 | +3,3% |
| `/movimentacoes` | operador | 316,1 | 323,6 | +2,4% |
| `/movimentacoes/nova` | operador | 294,0 | 332,4 | **+13,1%** |
| `/itens` | operador | 390,2 | 421,1 | +7,9% |
| `/itens/historico` | operador | 353,6 | 361,3 | +2,2% |
| `/itens/conferencia` | operador | 356,9 | 357,5 | +0,2% |
| `/pendencias` | operador | 446,9 | 425,5 | −4,8% |
| `/ajuda` | operador | 331,1 | 331,9 | +0,2% |
| `/admin/colaboradores` | operador | 425,6 | 451,9 | +6,2% |
| `/relatorios/geral` | operador | 501,1 | 552,4 | +10,2% |
| `/relatorios/[filial]` | operador | 411,0 | 398,4 | −3,1% |
| `/relatorios/gerados` | operador | 354,2 | 397,8 | +12,3% |
| `/relatorios/gerados/[id]` | operador | 372,6 | 399,9 | +7,3% |

**A faixa:** |Δ| máximo nas rotas autenticadas **13,1%**; controles −1,6% / +6,7% / −6,6%. O p95 da rodada 2 tem picos de
partida a frio (3.357 ms em `/movimentacoes`, 4.665 ms em `/itens/conferencia`): compara-se mediana, nunca p95. **E um dado a
mais sobre o ruído:** entre a medição da F59 (16:56Z) e a rodada 1 (19:47Z), mesmo código e mesmo dia, `/pendencias` foi de
346,4 para 446,9 ms (**+29%**) — acima dos 18% do fato 3.

**A regra do critério 27, que esta faixa alimenta:**

1. `antes(r)` = média das medianas das duas rodadas A/A; `depois(r)` = média das medianas de duas rodadas "depois", sobre o
   estado final (depois do `drop`).
2. Deriva do controle `D` = mediana das três razões `depois/antes` de `/vercel.svg`, `/login` e `/relatorios/acesso`. Se
   `|D − 1| > 18%`, o "depois" se repete.
3. Razão corrigida `R(r) = (depois(r) / antes(r)) / D`.
4. **Empata ou melhora ⇔ `R(r) ≤ 1,131`** — a tolerância é o maior |Δ| A/A das autenticadas, aplicada a todas. Por rota, duas
   rodadas são amostra curta: `/ajuda` e `/itens/conferencia` deram 0,2%, e 0,2% como faixa reprovaria ruído.
5. Fora da faixa: corrigido, ou explicado com a causa medida. Limite declarado: os três controles não passam pela sessão
   nem pelo banco, e a deriva de uma rota autenticada pode passar a deles (os +29% acima) — por isso o "depois" roda na
   mesma faixa de horário da A/A.

### 3.8 A varredura das evidências

Os sete arquivos `docs/perf/f60-*.json` foram varridos por UUID (`[0-9a-f]{8}-[0-9a-f]{4}-`), arroba (e-mail), patrimônio (`WAP` seguido
de dígito), slug e nome de filial (os seis do seed fixo), e texto de statement (`select `/`from ` em qualquer valor fora do
campo `metodo`): **zero ocorrência**. O varredor foi provado antes contra um JSON sintético com um caso de cada classe
(os seis casos acusados). Hash md5 de conjunto de linhas não é dado.

---

## 4. As datas de amostra da equivalência

Escolhidas por consulta de CONTAGEM (`min`/`max`/`group by`), sem ler linha — `docs/perf/f60-datas-amostra.json`. As
contagens são do próprio dia.

| # | data | motivo | movimentações · transferências · estornos no dia |
|---|---|---|---|
| d1 | 2024-01-07 | véspera da primeira movimentação (`min(data)` − 1) | 0 · 0 · 0 |
| d2 | 2026-07-27 | o dia do lote grande: a maior carga de compras de julho (259), o lote da R-REL-33 — rotulado "go-live" pela amostra, ver (f) e (p) | 512 · 0 · 0 |
| d3 | 2026-08-31 | fim de mês — substitui a repetição do go-live com o lote | 10 · 0 · 0 |
| d4 | 2026-08-17 | maior número de transferências no dia | 34 · 4 · 2 |
| d5 | 2026-08-28 | segundo maior número de transferências | 4 · 2 · 0 |
| d6 | 2026-09-04 | maior número de estornos no dia (empate desfeito pela mais recente) | 4 · 0 · 2 |
| d7 | 2026-07-31 | fim de mês — substitui a repetição do segundo maior dia de estorno (d4) | 378 · 0 · 0 |
| d8 | 2026-09-15 | última data com transferência | 7 · 1 · 0 |
| d9 | 2026-09-14 | véspera da última transferência | 11 · 0 · 0 |
| d10 | 2026-09-09 | hoje − 7 | 18 · 0 · 0 |
| d11 | 2026-06-30 | fim de mês — substitui a repetição de hoje − 1 (d8) | 1 · 0 · 0 |
| d12 | 2026-09-16 | hoje | 26 · 0 · 1 |

**As janelas das funções de período** (`rel_mov_itens`, `rel_mov_por_mes`, `rel_por_motivo`, `rel_resumo`): para cada data
`d`, **[d − 6, d]** e **[d − 364, d]** — as mesmas duas larguras do §3.2. As de data (`rel_estoque_asof`, `rel_saldo_itens`,
`rel_frescor_itens`) usam `d`. Em d1 as janelas caem antes da primeira movimentação: as três que leem `movimentacoes`
devolvem 0 linhas, e `rel_mov_itens` devolve uma linha por item do catálogo nas duas formas (com lista não vazia).

**As células.** Recortes = consolidado + cada filial (7 em produção). Por banco: 3 funções × 12 datas × 7 = **252** e 4
funções × 12 datas × 2 janelas × 7 = **672** — 924 na conta de uma comparação por célula; com a prova tripla abaixo,
**1.004 células por banco**, cada uma com contagem e `md5(string_agg(r::text, '|' order by r::text))`, velho × novo. O
consolidado velho é `p_filial null`; o novo, a lista de TODAS as filiais. Em `rel_saldo_itens_filiais` a prova é tripla:
`velho(null)` ≡ `novo(todas)` no nível do total; `velho(f)` ≡ `novo([f])` no nível do total ≡ `novo(todas)` na linha
`filial_id = f`.

(corrigido em 17/09 pela execução: o plano dizia **924 células**. A equivalência emulada rodou **1.004 por banco, todas
iguais, no ensaio e em produção** (`f60-equivalencia-emulada.json`): a prova tripla de `rel_saldo_itens_filiais` conta 156
células em vez de 84 (12 do consolidado + 72 × 2 por filial), o que leva as sete a **996**, e os KPIs somam **8** —
`rel_contagem_status_filiais` com a lista de todas × a contagem por status do caminho antigo, as sete que contam e o total.)

---

## 5. O que a documentação vigente diz

| assunto | fonte | o que diz, e o que decide aqui |
|---|---|---|
| React `cache` | Context7 `/reactjs/react.dev`, `reference/react/cache.md` | *"React checks argument equality using shallow equality via `Object.is`"*: objeto novo por chamada é erro de memo garantido — a chave tem de ser primitiva ou a mesma referência. *"React will invalidate the cache for all memoized functions for each server request"*: o memo é por request. Cada `cache(fn)` cria um memo próprio (tem de morar no escopo do módulo); erros também são memoizados; é para Server Components. |
| Next 16 `maxDuration` | doc local `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md` + Context7 `vercel/next.js` | vale em `layout.tsx`, `page.tsx` e `route.ts`; *"If using Server Actions, set the `maxDuration` at the page level to change the default timeout of all Server Actions used on the page"*; o valor é extraído no build para um manifesto da plataforma — nenhum código do servidor do Next o aplica, quem aplica é a Vercel. Vercel Pro com Fluid compute: padrão 300 s, máximo 800 s (1.800 s em beta). |
| PostgREST — RPC | Context7 `/websites/postgrest_en_v14`, *Calling Functions* e *Function Filters* | filtros e ordem sobre função `SETOF`/`TABLE` funcionam como sobre tabela (`/rpc/fn?col=gt.8&order=col.desc`). A limitação de keyset sobre o as-of não é do protocolo: é `chamarRpc` aplicar `.returns<>()` por dentro. |
| PostgREST — operadores lógicos | idem, *Logical operators* | `or=(…)` aceita `and(…)` aninhado e `not`: keyset de ordem composta é `or=(c1.lt.v1,and(c1.eq.v1,c2.lt.v2))` — sintaticamente possível, caro de manter para as chamadas de volume pequeno do §2.1. |
| PostgREST — agregados | docs.postgrest.org/en/v14, *Aggregate functions* | *"Aggregate functions are disabled by default in PostgREST due to potential performance issues"*; o `rolconfig` do `authenticator` não tem `pgrst.db_aggregates_enabled` nos dois bancos — `select('status, count()')` pediria mudar configuração de produção: fora. |
| Supabase *Timeouts* | Context7, `guides/database/postgres/timeouts.mdx` | *"`service_role`: none (defaults to the `authenticator` role's 8s timeout if unset)"*; `anon` 3 s, `authenticated` 8 s; o valor é lido de `pg_roles.rolconfig`, e mudar exige `notify pgrst, 'reload config'`. O visualizador já tem teto. |
| Supabase *database linter* | Context7, `pg-meta/.../advisor/lints.ts` | `function_search_path_mutable` (**WARN**): função sem `search_path` fixo. Tirar o `set search_path` para ganhar embutimento troca um achado por outro — e a forma `= any` é que torna o corpo sargável. |
| Supabase `count` | Context7 (supabase-js) | `exact` faz `COUNT(*)`; `planned` usa as estatísticas do Postgres; `estimated` usa exato para números baixos e planejado para altos. |
| Embutimento de função SQL | PostgreSQL Wiki, *Inlining of SQL functions* | função de tabela só é embutida se for `LANGUAGE SQL`, não `SECURITY DEFINER`, `STABLE`/`IMMUTABLE`, **não `STRICT`** e **sem cláusula `SET`**, com um único `SELECT`. As oito `rel_*` têm `set search_path`: nunca são embutidas, e o corpo é planejado sozinho com o parâmetro como `$1`. |

---

## 6. O desenho

### 6.1 As funções novas

Todas `language sql stable security invoker set search_path = public`, **não** `strict`, e na MESMA migration que cria:
`revoke all on function … from public, anon;` + `grant execute on function … to authenticated, service_role;` (fato 11 —
função nova nasce com EXECUTE para `anon`, e a 6a reprova). O primeiro parâmetro é `p_filiais smallint[]`; o resto é o de
hoje. Corpos rascunhados e conferidos contra os vivos.

| velha (corpo vivo) | nova | migration | o que muda no corpo |
|---|---|---|---|
| — | `rel_contagem_status_filiais(p_filiais smallint[])` → `(status, total)` | `0141` | nova: `group by status` sobre `ativos` com `filial_id = any (p_filiais)`; as baixas saem na conta em TS |
| `rel_estoque_asof(smallint, date)` (`0134`) | `rel_estoque_asof_filiais(smallint[], date)` | `0143` | reescrito por `join lateral` (§6.2); `security invoker` volta a ser explícito |
| `rel_saldo_itens(smallint, date)` (`0027`) | `rel_saldo_itens_filiais(smallint[], date)` | `0143` | dois níveis numa chamada, com `filial_id` na frente (NULL = o total do recorte) (§6.4) |
| `rel_mov_itens(smallint, date, date)` (`0016`) | `rel_mov_itens_filiais(smallint[], date, date)` | `0143` | o recorte, **e o acréscimo declarado**: `where exists (select 1 from public.filiais f where f.id = any (p_filiais))` — o corpo devolve uma linha por item do catálogo mesmo sem lançamento (`left join`), e sem a guarda NULL e `'{}'` devolveriam o catálogo zerado |
| `rel_frescor_itens(smallint, date)` (`0016`) | `rel_frescor_itens_filiais(smallint[], date)` | `0143` | só o recorte |
| `rel_mov_por_mes(smallint, date, date)` (`0011`) | `rel_mov_por_mes_filiais(smallint[], date, date)` | `0143` | só o recorte |
| `rel_por_motivo(smallint, date, date)` (`0011`) | `rel_por_motivo_filiais(smallint[], date, date)` | `0143` | só o recorte |
| `rel_resumo(smallint, date, date)` (`0011`) | `rel_resumo_filiais(smallint[], date, date)` | `0143` | só o recorte |

(corrigido em 17/09 pela execução: as sete nasceram na `0143`, não na `0142` — a `0142` é o índice `lanc_item_criado_por_idx`.)

"Só o recorte" = a linha `and (p_filial is null or <col> = p_filial)` vira `and <col> = any (p_filiais)`, e o diff contra o
corpo vivo mostra isso e nada mais. **"Não-anulável" sem `NOT NULL`** (fato 7), em três camadas: (a) no banco, a comparação
é conjunção direta, então NULL e `'{}'` dão 0 linhas nas oito, sem erro — provado em roteiro (sabotagem H); (b) na porta, as
sete saem de `ARGUMENTOS_ANULAVEIS`, e `null` deixa de compilar (caso novo em `linhas-tipos.test.ts`); (c) a trava positiva
(§7). No mapa de retornos, `COLUNAS_DE_RETORNO_ANULAVEIS` troca a chave do as-of (as quatro colunas de (k)) e ganha
`rel_saldo_itens_filiais.filial_id` — o gerador tipa coluna de `returns table` como não nula, e o nível do total a devolve
NULL.

### 6.2 O as-of

```
from public.ativos a
cross join lateral (
  select m.tipo, m.filial_id, m.filial_destino_id, m.snapshot_anterior, m.status_resultante, m.colaborador, m.setor
    from public.movimentacoes m
   where m.ativo_id = a.id and m.data <= p_data and m.tipo <> 'estorno'
     and not exists (select 1 from public.movimentacoes x
                      where x.ativo_id = a.id and x.estorno_de = m.id and x.data <= p_data)
   order by m.data desc, m.ordem desc
   limit 1
) u
cross join lateral (select public.status_tem_detentor(coalesce(u.status_resultante, 'em_estoque')) as tem_detentor) d
cross join lateral (… filial_id, status com o MESMO case/coalesce da 0134; colaborador, setor com `when not d.tem_detentor then null` …) e
where e.status not in ('descartado', 'devolvido_fornecedor')
  and e.filial_id = any (p_filiais)
```

(corrigido em 17/09 pela execução: o rascunho tinha o `not exists` sem `x.ativo_id = a.id` e chamava `status_tem_detentor`
duas vezes por linha, nos dois `case` de `e`; o corpo final é o de cima — `0143_rel_filiais.sql`, com a conta no cabeçalho.)

- **O predicado `existe`** da `0134` (`left join ult` + `where existe`) vira o `cross join lateral`: ativo sem movimentação
  efetiva até a data não produz linha — o mesmo resultado. O `when u.tipo is null then null` da `0134` SAI: na lateral
  interna ele é inalcançável (sem `u` não há linha), e o mapa de retornos passa a conferir `when not d.tem_detentor then null`.
  (corrigido em 17/09 pela execução: o plano o mantinha, morto e idêntico, como evidência textual do mapa de retornos.)
- **`status_tem_detentor` uma vez por linha**, na lateral `d`, em vez de duas chamadas por linha nos dois `case`: ~54 → ~50 ms
  no consolidado de produção, na mesma sessão. (corrigido em 17/09 pela execução: não estava no plano.)
- **A filial é CALCULADA na data** (`transferencia` → destino; `compra`/`troca` → a da movimentação; `snapshot_anterior ?
  'filial_id'` → a anterior; senão `ativos.filial_id`), e o recorte se aplica sobre ela. **Sem pré-filtro por
  `ativos.filial_id`** (fato 8): ele tiraria do relatório de A o ativo que estava em A na data e foi para B depois, e poria o
  que chegou depois. Cenário "transferido depois da data" em `asof_desempate.sql` + a mutação que injeta o pré-filtro
  (sabotagem G).
- **O desempate é `data desc, ordem desc`** — os rótulos 3a→7b de `asof_desempate.sql` continuam provando.
- **O índice que o serve, escrito no cabeçalho da migration:** `mov_ativo_idx (ativo_id, data desc)` dá a busca por ativo
  já em ordem de `data`, e o `ordem desc` desempata as poucas linhas da mesma data (≤ 9 por ativo hoje) num `Incremental
  Sort`; o `not exists`, CORRELACIONADO por ativo (`x.ativo_id = a.id`), é sondado no MESMO índice — o plano medido é um
  `Nested Loop Anti` sobre `mov_ativo_idx`, e `movimentacoes_estorno_de_idx` não aparece nele (`docs/perf/asof-orcamento.json`,
  `indices_usados`). `movimentacoes_estorno_de_idx (estorno_de)` é o que serve a forma NÃO correlacionada, que o planejador
  resolve num merge anti join relendo esse índice a cada ativo: ~70 ms contra ~54 ms da correlacionada (a primeira sessão de
  medição; os números absolutos do custo, abaixo, são de outra sessão, com o velho medido ao lado). Um índice
  `(ativo_id, data desc, ordem desc)` só entra se o "depois" mostrar o `Sort` por ativo pesando (R-REL-33) — e não entrou: o
  `Incremental Sort` por ativo é ~7–10% do corpo medido.
  (corrigido em 17/09 pela execução: o plano dizia que o `not exists` seria servido por `movimentacoes_estorno_de_idx` e que
  quem medisse sem ele concluiria que a lateral não ajudou; quem medir de novo tem de medir as DUAS formas com os DOIS índices
  presentes.)
- **O custo, medido e aceito.** Produção, plano genérico, N = 7 (`docs/perf/f60-custo-corpos-novos-producao.json`, chave
  `asof_rodada_2`): no consolidado de hoje (1.624 linhas) o corpo novo mede **65,7 ms** de mediana contra **38,9 ms** do corpo
  `0134` na mesma sessão — **1,69×** (réplica 54,7 × 34,7 = 1,58×; `hoje-7` 1,67×) —, e na filial pequena 33,0 × 16,9
  (1,95×); os buffers vão de 368 para 18.638, porque a lateral visita `mov_ativo_idx` uma vez por ativo. **Por que esta forma
  mesmo assim:** é a única família que a trava de recorte aceita — as mais rápidas medidas (`not in` com subplano em hash,
  ~38 ms; o corpo `0134` só com o recorte trocado, ~33 ms) leem `movimentacoes` sem correlação com o ativo ou numa CTE
  descoberta, e a R4 as recusa (§7.1) —; e o custo dela cresce com o NÚMERO DE ATIVOS, não com o histórico de cada um (o
  `limit 1` lê só o primeiro grupo de data), ao contrário do `0134`, que cresce com todas as movimentações até a data (239 →
  378 buffers, §3.4). Custo declarado: +~20 ms de banco por chamada de as-of consolidada, e a "Evolução do estoque" faz até 6
  em paralelo por render; o TTFB "depois" (critério 27) é o juiz, e uma piora fora da faixa se explica por esta causa medida.
  (corrigido em 17/09 pela execução: o plano não trazia o custo do corpo novo — o do as-of lateral é ~1,6–1,7× o do corpo
  `0134` no consolidado.)

### 6.3 O consolidado — onde o `null` morre

- **"Todas" = a lista explícita de TODAS as filiais, inclusive as desativadas** (fato 9), montada num lugar só:
  `filiaisDoConsolidado(client)` em `src/lib/queries/relatorios/recorte-filiais.ts` (novo), memoizada por `cache()` com o
  client como chave (o mesmo client desce pelo snapshot inteiro), lendo `filiais` SEM filtro de `ativo`, ordenada por id.
- **Onde o `null` morre:** `recorteDeFiliais(client, filialId: number | null): Promise<number[]>` — `null` → todas; número
  → `[id]`. A camada de relatório mantém `number | null` por dentro até a F63 (`getSnapshotRelatorioV2`, `snapshot.ts:138`,
  continua sendo o ponto único onde o slug vira `filialId`); nenhum `null` chega à porta, e o tipo da porta o recusa.
- **O número do consolidado de hoje não muda:** toda linha de `movimentacoes`/`lancamentos_item`/`ativos` tem `filial_id`
  com FK para `filiais`, então "todas as filiais" cobre o mesmo conjunto que `p_filial null`. A exceção teórica é a filial
  calculada do as-of lida de `snapshot_anterior` (jsonb, sem FK) apontar para filial apagada — a equivalência em produção
  prova que hoje não há. Para o visualizador, `filiais` é lida pelo client administrativo (sem RLS): a lista é a mesma.
- ⚠ Fora da renderização de Server Component (a Server Action que gera o snapshot, o CSV), o memo pode não valer: o
  comportamento do `cache` ali é conferido na doc antes do código. A leitura é de seis linhas e correta sem memo.

### 6.4 `/itens` em dois níveis

`rel_saldo_itens_filiais(p_filiais, p_ate)` devolve, numa chamada, **uma linha por (filial do recorte, item)** e **o nível
do total** (`filial_id` NULL), calculado com os MESMOS clamps do corpo antigo sobre o CONJUNTO do recorte, por `grouping
sets ((item_id, filial_id), (item_id))` em `tot` e `((item_id, filial_id, chamado), (item_id, chamado))` em `atrel`. NULL e
`'{}'` → a CTE `alvo` vazia → 0 linhas.

- **Por que o total não pode ser a soma das colunas.** Os clamps não são aditivos quando um chamado atravessa filiais:
  `sum(greatest(0, net))` por chamado — reserva de 5 no chamado X em A e liberação de 5 do mesmo chamado em B dão 5 + 0 = 5
  atrelados somando as filiais, e 0 no total, onde o `net` do chamado é zero; o mesmo vale para `greatest(0, total_raw)`,
  `greatest(0, lib_raw)` e os de `estoque`/`falta`. O nível do total com a lista de todas é, por construção, a chamada
  `p_filial null` de hoje.
- **`getSaldosPorFilial(filiais)`** — uma chamada com TODAS as filiais (com desativada): as colunas são as linhas das filiais
  ativas, o consolidado é o nível do total, e `estoqueForaDasColunas` (`itens.ts:327-337`, pura, intocada) continua = total −
  Σ colunas, **> 0 exatamente quando há estoque fora das colunas**. Sem a emenda de dois níveis o número vira sempre 0, a
  tela mente e o teste da função pura passa — a sabotagem F desfaz a emenda e o roteiro fica vermelho.
- **`getSaldosItensDeFiliais(unidades)`** (`/itens/historico`): `todas` → nível do total; lista → as linhas por filial da
  MESMA chamada, somadas em TS por `somarSaldosDeFiliais`, como hoje — número idêntico ao de hoje (hoje são N chamadas
  somadas).
- **`getSaldosItens(ids)`** (conferência, dashboard, `actions/admin.ts`, `actions/itens.ts`) → nível do total.
- **A leitura é PAGINADA, e é uma só.** Os três acima e o relatório (`getGruposItens`) chegam à RPC por
  `lerSaldoItensEmNiveis` (`queries/relatorios/itens.ts`), a única leitura de `rel_saldo_itens_filiais` em `src/**` (trava
  por AST em `relatorios/itens.test.ts`): `paginarTodos` com OFFSET (fonte RPC — §2.1, chamada 49), a ordem do corpo imposta
  na chamada e fechada em `item_id`, e o `cap` `CAP_SALDO_ITENS_EM_NIVEIS`. **O motivo é um corte calado:** a resposta tem
  (filiais do recorte + 1) × itens linhas, e o `max-rows` do PostgREST corta em 1.000 sem erro — com as seis filiais, a
  partir de 143 itens (7 × 143 = 1.001) a coluna da filial de id mais alto sairia zerada em `/itens` e o "fora das colunas"
  acenderia sem filial desativada nenhuma. No volume de hoje (161 linhas) a segunda página vem vazia e prova o fim: **2 idas
  ao banco por render de `/itens`, em vez das 7 da F59.** O critério 8 ("`/itens` lê colunas e consolidado numa chamada")
  vale como UMA leitura de UM recorte — toda página executa a mesma função com os mesmos argumentos —, que é o que o `1 + N`
  violava.
  (corrigido em 17/09 pela execução: o plano dizia "numa chamada", uma ida só; a revisão adversarial do lote 2 achou o corte
  calado, e o conserto está em `docs/DECISOES.md`, ata de 16/09 da revisão do lote 2.)
- **Os roteiros** leem o nível explicitamente (r). O cenário novo, em `supabase/tests/f60_recorte.sql`: uma filial fictícia
  desativada com saldo de item e com ativo — o consolidado soma, as colunas não, o "fora das colunas" é > 0.

### 6.5 A RPC dos KPIs

`rel_contagem_status_filiais(p_filiais)` (`0141`, lote 1) no lugar das duas páginas de `ativos` (1,50 + 2,11 ms de banco e
1.622 linhas trafegadas) e das sete contagens `head` (sete idas ao PostgREST contra o pool pequeno do Free — o mesmo motivo de
`LIMITE_LOTES_PARALELOS`). Medida da forma equivalente: 1,43 ms, `Index Only Scan ativos_filial_status_idx`; a forma da RPC
acrescenta `filial_id = any (p_filiais)`, que o mesmo índice `(filial_id, status)` serve — a confirmar no "depois".
`kpisDeContagens(linhas)` é pura; o teste com fixture fictícia prova `kpisDeContagens(contar(estado)) ≡ kpisDeEstado(estado)`
nos oito números, inclusive `emprestado` e as duas baixas; produção por contagem: 1.622 = 1.622 = 1.622. O dashboard é global:
passa a lista de todas as filiais (`filiaisDoConsolidado`). `kpisDeEstado` fica pura e continua servindo o snapshot. **A
chamada fica fora da superfície do visualizador** (n) — `getKpis` só tem um chamador, o dashboard. O mecanismo é a própria
régua de `fronteira-viewer.test.ts` (a superfície é quem ACEITA um client resolvido): a leitura dos KPIs sai de
`relatorios/estoque.ts` (que aceita `DbClient`) para um módulo do dashboard que abre o client da SESSÃO por conta própria e
não aceita client — então a RPC nova não alcança o `service_role` e a lista `RPCS` continua com sete (catraca `≤ 7` intacta).

### 6.6 Colaboradores — a chave por nome distinto

A causa medida (g): a chave é calculada por LINHA da união, duas vezes por render (fila e resumo), e é o maior custo de banco
da fase. **Materializar o recorte antes do agregado** = reduzir a união a `(nome, filial_id, n)` ANTES de chamar a chave,
chamar `colaborador_chave()` uma vez por NOME distinto (979 chamadas em vez de 1.562), e reproduzir `mode()` por contagem (mais frequente;
empate → menor na mesma collation, a regra do `mode_final`) e `count(distinct nome)` pelo agrupamento. **View de mesmo nome e
mesmas colunas**, `security_invoker` mantido, `create or replace view` (`0144`). Medido: ~100 → ~50 ms, 922 linhas, hash
igual. Paginar a tela não reduz o custo (o agregado roda inteiro); a tela não perde linha nem número. A `0144` vai a produção
DEPOIS do deploy, na janela do `drop`: muda o plano do que a `1.64.0` lê.
(corrigido em 17/09 pela execução: o plano numerava a view `0143`.)

### 6.7 `buscarEstornosAteData`

A leitura dos estornos sai do `Promise.all` e roda **DEPOIS** das três tabelas, com os ids delas (deduplicados):
`paginarPorIds` (P6) sobre `movimentacoes`, `.in('estorno_de', lote de 100)` + `.eq('tipo', 'estorno')` + `.lte('data', ate)`,
**sem filtro de filial** — o estorno grava a filial ATUAL do ativo (`0122:205-219`), e filtrar apagaria a marca "estornada"
no relatório da filial de origem. O custo medido (B6): 305 ids na janela de 365 dias → 4 lotes, **0,36 ms** cada, contra
**0,28 ms** da leitura de todos os 8 estornos. É mudança de FORMA — a leitura para de crescer com o histórico inteiro e passa a
crescer com o período —, não de tempo no volume de hoje. O padrão já existe em `queries/movimentacoes.ts:743`.

---

## 7. A trava e o orçamento

### 7.1 A mesa — `scripts/db/recorte-rel.mjs` + `src/lib/validators/rpcs-recorte-sql.test.ts`

- **O universo** é toda `public.rel_*` VIVA pelo replay, na ordem do texto: `create`, `create or replace`, `drop function [if
  exists]` (várias assinaturas) e `alter function … rename to` (entra ou sai do universo pelo prefixo) — e o mesmo com
  `routine` no lugar de `function` (corrigido em 17/09 pela execução: a revisão do lote 2 achou a mesa cega para `alter
  routine`/`drop routine`, e a leitura e a auto-conferência passaram a tratar `routine` como `function`). Nunca os corpos
  históricos (`0016`, `0019`, `0022`, `0045`, `0047`, `0054`, `0109`, `0110`). Reusa `lexar`/`linhaDe`/`carregarMigrations`
  de `predicado-policies.mjs` e `fimDoComando`/`definicoesDeFuncao` de `corpo-vigente.mjs`, lendo também os NOMES dos
  argumentos. Leitura das migrations e do `.sql` na COLETA (a lição da F57); alvo < 5 s.
- **Falha fechada:** DDL de `rel_*` dentro de literal `$…$`/`'…'` (`execute`/`format`) reprova com arquivo:linha; comando de
  `rel_*` ilegível reprova, nunca é pulado; `drop` sem `if exists` de assinatura inexistente reprova; auto-conferência pelo
  léxico (nunca regex sobre texto cru — a lição da F53): todo `create|drop|alter … function … rel_` fora de comentário foi
  consumido; exporta consumidos/encontrados para a evidência.
- **R1 — declara:** um argumento `p_filiais` do tipo `smallint[]` (`int2[]`, `_int2`); outro tipo ou ausência reprova.
- **R2 — liga:** toda ocorrência de `p_filiais` no corpo é exatamente `<colref> = any ( p_filiais )`, com `<colref>` = `ident`
  ou `ident.ident`; ao menos uma. `<>`, `!=`, `= all`, `<> all`, `= some` reprovam — a régua é única.
- **R3 — não-anulável:** cada comparação é CONJUNÇÃO DIRETA de `where`/`on`/`having` (vizinhos: `where`, `on`, `having`, `and`
  ou `(` antes; `and`, `)`, fim, `;` ou palavra que encerra a cláusula depois), sem `or`/`not` no mesmo nível; grupo `(`
  precedido de identificador (`coalesce(`, `nullif(`, `greatest(`) ou de `when`/`then`/`else`/`case`/`select` reprova; o
  `and` de `between … and` não é conjunção. Comparação na lista do `select`, em `case`, em argumento de função, sob `not` ou
  em ramo de `or` reprova.
- **R4 — o nível do total:** o corpo se divide em escopos de `select`; um escopo está COBERTO se tem, ele mesmo, uma comparação
  R2+R3, ou se aparece no `from`/`join`/`lateral` ou numa condição (`exists`, `in`) de um escopo coberto. CTE não herda
  cobertura, e subconsulta na lista do `select`/`group by`/`order by` também não. Toda leitura de tabela-base em escopo
  descoberto reprova — exceto as de `TABELAS_SEM_FILIAL = ['itens', 'motivos', 'tipos_item']` (vocabulário), e a mesa prova
  pelo replay de `create table`/`add column` que nenhuma delas tem `filial_id`. É esta regra que distingue "o total vem da
  lista explícita" (a forma de dois níveis passa) de "um ramo lê a tabela sem recorte" (fail-open).
- **A oitava:** `rel_saldo_colaborador(uuid)` é **exceção declarada**, não exceção por nome no código: recorta por PESSOA
  (`p_colaborador`), devolve o saldo de UM colaborador em todas as filiais onde ele tem item, e o recorte de inquilino dela é a
  RLS de `lancamentos_item`/`colaboradores`, que a virada escreve nas policies — destino **permanente**. A lista vive numa
  fonte só, `k_excecoes_recorte` no bloco 7 de `catalogo_secdef.sql` (`'rel_x', -- NNNN · motivo: … · destino: …`), lida pela
  mesa como texto (`lerExcecoesDeRecorte`, falha no formato) e conferida nos dois sentidos: a exceção existe entre as vivas e
  não declara `p_filiais`; função viva sem recorte fora da lista reprova.
- **A guarda do próprio teste**, com SQL sintético EM MEMÓRIA (migration sintética acrescentada ao fim da cadeia real, com
  desconto das violações já existentes). Reprovam, cada um pela regra nomeada: `(p_filial is null or col = p_filial)` (R1),
  `(p_filiais is null or m.filial_id = any (p_filiais))`, `(m.filial_id = any (p_filiais) or p_filiais is null)`,
  `m.filial_id = any (coalesce(p_filiais, array[m.filial_id]))`, `coalesce(p_filiais, '{}')`, `case when p_filiais is null
  then true else … end`, `nullif`, parâmetro declarado e não usado, ligado só por `<> all`, `not (… = any (p_filiais))`,
  comparação na lista do `select`, `rel_*` sem parâmetro, `coalesce(p_x, col) = col` com `p_filiais` presente mas aberto, total
  por `union all` com ramo sem recorte (R4), CTE que lê `movimentacoes` sem recorte enquanto o `select` final recorta (R4),
  subconsulta escalar na lista do `select` lendo `ativos` (R4). Passam: `where m.filial_id = any (p_filiais)`; `on … and
  l.data between p_de and p_ate and l.filial_id = any (p_filiais)`; a forma de dois níveis de `rel_saldo_itens_filiais`; o
  as-of lateral; a guarda `exists` de `rel_mov_itens_filiais`.
- **A ordem:** a mesa e o par escritos e rodados contra a cadeia de HOJE ANTES do lote 2 — vermelhos nomeando as sete
  (`rel_contagem_status_filiais`, do lote 1, já passa; a oitava é exceção) —, a saída gravada como sabotagem A; o vermelho sobe
  junto com o lote 2, nunca sozinho.

### 7.2 O par no catálogo do CI — `supabase/tests/catalogo_secdef.sql`, bloco 7

O catálogo julga FATOS DE CATÁLOGO e dá uma prova textual fraca sobre `prosrc` (corpo de função `language sql` clássica é
texto — `prosqlbody` é NULL); a mesa é a autoridade sobre a FORMA. Rótulos novos, nenhum prefixo de rótulo existente no
arquivo; `pg_temp.assert_zero_de` com universo > 0; a linha `FIM` única.

| rótulo | o que reprova |
|---|---|
| `7a` | `public.rel_*` que não declara `p_filiais smallint[]` (`proargnames` × `proargtypes`) e não está em `k_excecoes_recorte` |
| `7b` | `rel_*` fora da exceção sem `<coluna> = any (p_filiais)` em `prosrc` |
| `7c` | `rel_*` com disfarce textual conhecido em `prosrc`: `p_filiais is [not] null`, `coalesce(p_filiais`, `nullif(p_filiais`, `case when p_filiais`, `p_filiais is [not] distinct` |
| `7d` | `rel_*` que não é `security invoker`, `stable`, não `strict`, com `search_path` em `proconfig` |
| `7e` | `rel_*` sem EXECUTE para `authenticated` e `service_role` (o `anon` é da 6a — não duplica) |
| `7f` | a exceção nos dois sentidos: nome de `k_excecoes_recorte` sem `rel_*` viva, ou que declara `p_filiais` |
| `7g` | nome de `k_excecoes_recorte` com mais de uma assinatura `rel_*` viva — a exceção é por NOME, e um overload herdaria a isenção sem ter sido avaliado |

(corrigido em 17/09 pela execução: o plano tinha `7a`–`7f`; a `7g`, a exceção sem overload, veio da revisão adversarial da
trava.)

**Fica só na mesa, com o motivo:** R3 (conjunção direta) e R4 (escopo das leituras) — exigem léxico e escopos, que `prosrc`
como texto não dá com confiança; a falha fechada de DDL dinâmico — o catálogo vê o resultado do DDL, não o texto que o gerou.
`catalogos-seguranca.test.ts` passa a cobrar o array novo (motivo e migration na linha, os termos `p_filiais`, `proargnames`,
`prosrc`), sem afrouxar nada existente.

### 7.3 As mutações

**Oito novas** (corrigido em 17/09 pela execução: o plano previa sete; a oitava, `f60-excecao-ganha-overload`, derruba a
`7g`) em `scripts/db/mutacoes.mjs`, pelo rótulo nomeado — toda asserção nova do bloco 7 tem ao menos uma quebra que
a derruba, e os dois cenários de comportamento também. As de corpo usam `trocarNoCorpo` sobre o corpo vivo (nunca cópia
colada); as de atributo/grant são um comando só:

| id | o que injeta | derruba |
|---|---|---|
| `f60-recorte-volta-a-is-null-or` | uma `rel_*_filiais` recriada com `(p_filiais is null or <col> = any (p_filiais))` | `7c` |
| `f60-rel-nova-sem-recorte` | uma `rel_*` nova, com grants, sem `p_filiais` (nem a ligação) | `7a`, `7b` |
| `f60-rel-vira-strict` | `alter function … strict` numa `rel_*_filiais` | `7d` |
| `f60-rel-perde-execute-do-service-role` | `revoke execute … from service_role` numa `rel_*_filiais` (o visualizador perderia o relatório) | `7e` |
| `f60-excecao-apodrece` | `drop function public.rel_saldo_colaborador(uuid)` — a lista de exceções passa a citar função que não existe | `7f` |
| `f60-excecao-ganha-overload` | um SEGUNDO `rel_saldo_colaborador`, com outra assinatura, lendo `lancamentos_item` sem recorte — invoker, `stable`, `search_path` e os dois grants, para só a `7g` cair | `7g` |
| `f60-asof-pre-filtra-pela-filial-de-hoje` | o as-of novo com pré-filtro por `ativos.filial_id = any (p_filiais)` | o cenário "transferido depois da data" de `asof_desempate.sql` |
| `f60-saldo-consolidado-so-das-ativas` | o nível do total calculado só com as filiais ativas | o cenário de filial desativada de `f60_recorte.sql` |

**Duas reancoradas**, com os mesmos rótulos: `f53-asof-volta-ao-desempate-por-id` (**3a**) e
`f53-asof-passa-a-ordenar-so-por-ordem` (**6a**), trocando `order by m.data desc, m.ordem desc` da lateral nova — e a `prova`
passa a ler `pg_get_functiondef` da assinatura nova. Reancorar não é opcional (l). A `f53-trava-do-estorno-volta-ao-uuid`
(**4c**) não muda.

### 7.4 O teto do injetor

82 ativas + 8 = **90**; **teto 85 → 95**, com ata: a regra da casa é "asserção que nasce verde e nunca ficou vermelha é
documento" (F59), então cada rótulo novo do bloco 7 ganha a sua quebra (s), mais os dois cenários de comportamento — e a folga
de uma vaga é a mesma conta da F52/F59 (quem precisar de mais sobe o teto com ata). `7d` por `strict` e não por `security
definer`, para não derrubar junto a tabela-verdade das definer (bloco 1) e confundir o diagnóstico. A quarentena continua ≤
1/3 do lote.

(corrigido em 17/09 pela execução: o plano dizia 82 + 7 = 89 e teto 85 → 90. A conta furou uma vez dentro da própria fase — a
`7g` trouxe a oitava mutação —, e o teto foi a 95, não a 91: a revisão adversarial do lote 2 ainda rodaria, e o que ela
achasse no bloco 7 ou nos cenários ganharia quebra própria pela mesma régua; teto colado no número do dia reabriria a decisão
no mesmo PR. A ata está no comentário do teto em `scripts/db/mutacoes.test.mts`.)

### 7.5 O orçamento do as-of — `docs/perf/asof-orcamento.json` + `src/lib/validators/asof-orcamento.test.ts`

- **O arquivo:** `funcao` (a assinatura NOVA), `corpo.hash` = sha256 do texto da definição viva pelo replay, com espaços
  colapsados — a mesma família de hash da trava de migrations (`migrations.lock.json`) —, `corpo.algoritmo`, `corpo.fonte`,
  `corpo.arquivo`; `medicao` com `alvo`, `data`, `metodo` (corpo emulado com plano genérico antes do apply; a confirmação
  chamando a função depois), execução e planejamento (mediana e p95), buffers, nós do plano, linhas.
- **A trava:** lê o JSON e recalcula o hash na COLETA; reprova **arquivo ausente** e **hash ≠ do corpo vivo**, com mensagens
  diferentes; **nunca por calendário** (decisão iii). O corpo vivo vem do replay de `recorte-rel.mjs` ou de `corpoVigente`
  com a assinatura NOVA — nunca da velha, que `corpoVigente` continuaria achando na `0134` depois do `drop` (l).
- **A medição:** como o CI passa antes de qualquer apply (fato 25), a primeira é a do corpo EMULADO em produção, só leitura,
  no método do §3.1; depois do apply da `0143` (corrigido em 17/09 pela execução: o plano dizia `0142`), confirmada chamando
  a função. Sabotagem D: sem o JSON → vermelho; migration
  sintética EM MEMÓRIA mudando um byte do corpo → vermelho ("velho"); restaurado → verde.

---

## 8. As migrations e a ordem de apply

| migration | o que faz | lote | produção |
|---|---|---|---|
| `0141_rel_contagem_status.sql` | cria `rel_contagem_status_filiais` + grants | 1 | antes do merge |
| `0142_lanc_item_criado_por_idx.sql` | cria o índice parcial `lanc_item_criado_por_idx`, com o plano "antes" no cabeçalho | 1 | antes do merge |
| `0143_rel_filiais.sql` | cria as sete `rel_*_filiais` + grants, com os índices que as servem no cabeçalho | 2 | antes do merge |
| `0144_colaboradores_textos_por_nome.sql` | `create or replace view v_colaboradores_textos` (mesmas colunas, chave por nome distinto) | 2 | depois do deploy, na janela |
| `0145_drop_rel_filial.sql` | `drop function` das sete assinaturas velhas | 2 | depois do deploy e da prova do pgss |

(corrigido em 17/09 pela execução: o plano tinha quatro migrations — `0141` KPIs, `0142` as sete, `0143` a view, `0144` o
`drop`; a `0142` virou o índice, e as três seguintes andaram uma casa.)

Índice só se a medição mandar (`lanc_item_criado_por_idx` pelo harness no ensaio; o da lateral pelo "depois" do as-of) — em
migration própria, com o plano no cabeçalho, e a numeração se ajusta então.
(corrigido em 17/09 pela execução: a medição mandou UM. `lanc_item_criado_por_idx` entrou na `0142`, forma
`(criado_por, created_at desc, id desc) where estorna_id is null`, pela medição do ENSAIO (`docs/perf/f60-itens-ensaio.json`):
`getUltimoLancamento` de um autor SEM lançamento percorria `lanc_item_created_idx` inteiro — **2,19 ms e 258 buffers com
10.035 linhas, 10,41 ms e 1.286 buffers com 50.035**, linear, pago em todo `/itens` de quem não lança. O `id desc` a mais que
a ficha é porque a consulta ordena por `created_at desc, id desc`, e o índice passa a servir a ordem inteira sem sort. O da
lateral não entrou — §6.2.) **Toda migration nova** vai no mesmo commit que
`npm run db:lock` e a entrada em `DA_F38` de `migrations-f38.test.ts`, com o rollback escrito no rodapé antes do apply.
`database.ts` recebe *hand-fix* datado (`// hand-fix F60 — substituído pela regeneração`) antes do primeiro push com cada
migration: o gate de deriva do CI constrói a cadeia INTEIRA, com o `drop`.

**A ordem:**

1. **CI** — o `banco-sem-docker` roda a cadeia `0001`→`0145`: roteiros (com os 59 pontos migrados e os cenários novos), o par
   do bloco 7, as mutações (90 ativas, as oito novas acusadas pelo rótulo), o gate de deriva contra o *hand-fix*. **Nenhuma migration toca banco
   real antes de o CI tê-la rodado.**
2. **Equivalência emulada, antes de qualquer apply:** o corpo novo EMULADO inline × a função velha, no ensaio e em produção,
   nas 1.004 células do §4 (só contagem e hash). Migration aplicada não se edita: só aplica quando a emulação fecha.
3. **Ensaio** (não tem app de produção: o `drop` não espera deploy): apply `0141` → verificação → apply `0142` (o índice) →
   apply `0143` → verificação pós-apply → **equivalência com a função de verdade** (as mesmas células:
   `equivalencia-rel.mjs gerar-equivalencia-real --alvo=ensaio` + `analisar-equivalencia --real`) → apply `0144` → a view
   nova: linhas e hash iguais ao de antes do apply → apply `0145` → `notify pgrst, 'reload schema'` → `to_regprocedure` das
   sete velhas é NULL →
   `DB_TYPES_PROJECT_REF=sgmvldiizsrjbxzzpmhh npm run db:types` → o arquivo regenerado conferido contra o *hand-fix* (o diff é
   só ordem e os comentários de *hand-fix*).
4. **Verificação pós-apply** (cada apply, cada banco): uma assinatura por função, sem overload; grants por papel (`anon` sem,
   `authenticated` e `service_role` com); `md5(regexp_replace(prosrc, '\s+', ' ', 'g'))` contra o corpo do arquivo extraído
   por `corpo-vigente.mjs`; `notify pgrst, 'reload schema'`; `get_advisors(security)` sem achado novo; sonda de paridade
   ensaio × produção.
5. **Produção, antes do merge:** `0141`, `0142` e `0143` + verificação pós-apply + **equivalência com a função de verdade**
   (as mesmas células: `equivalencia-rel.mjs gerar-equivalencia-real --alvo=producao` + `analisar-equivalencia --real`) +
   `conferir.mts` sobre os descritores novos (conta do smoke, só contagens) + **`explain` "depois"** das sete `_filiais` pelo
   `medir-rel.mjs gerar-a1 --funcao=<nome>_filiais` e o de `rel_contagem_status_filiais` (e do as-of) pelo
   `equivalencia-rel.mjs gerar-custo-real` + **orçamento do as-of** confirmado chamando a função
   (`analisar-custo --real --confirmar-orcamento=docs/perf/asof-orcamento.json`, que grava só `medicao.confirmacao`). Nada disso quebra a
   `1.64.0`: são funções de nome novo. Hash diferente em qualquer célula segura o merge.
6. **Merge** com `verificar` e `banco-sem-docker` verdes → **deploy** → **conferência** só leitura: `/api/saude` com `1.65.0`
   e o commit do merge; `node scripts/smoke/smoke-prod.mjs` com 0 falha (a Parte B chama as funções novas).
7. **A janela** (§9): `0144` e `0145`, nessa ordem, depois da prova.

(corrigido em 17/09 pela execução: nos passos 1–7 o plano dizia a cadeia `0001`→`0144`, 89 ativas e sete novas, 924 células,
o ensaio `0141` → `0142` (as sete) → `0143` (a view) → `0144` (o `drop`), produção `0141` e `0142` antes do merge e a janela
com `0143` e `0144`; a numeração andou uma casa com o índice na `0142` (§8), as mutações são oito (§7.3) e a equivalência
emulada teve 1.004 células por banco, todas iguais (§4). Corrigido de novo em 17/09 pela revisão final: os passos 3 e 5
pediam a equivalência com a função de verdade, o `explain` "depois" da `rel_contagem_status_filiais` e a confirmação do
orçamento sem instrumento que os fizesse — os modos `*-real` de `equivalencia-rel.mjs` entraram para isso, §0.)

---

## 9. A janela do `drop`, passo a passo

1. **Pré-condição:** deploy `READY`; `/api/saude` responde `1.65.0` e o commit do merge; smoke de produção com 0 falha. Pedir a
   quem estiver com o sistema aberto que recarregue a página (uma aba de antes do deploy pode seguir presa ao código velho).
2. **Leitura T0** do `pg_stat_statements`, velhas e novas, por papel — nome ENTRE ASPAS, como o PostgREST cita; saem só papel,
   chamadas e número de formas, nunca o texto:

   ```sql
   select jsonb_build_object(
     'agora',       now(),
     'dealloc',     (select dealloc from pg_stat_statements_info),
     'stats_reset', (select stats_reset from pg_stat_statements_info),
     'por_papel', coalesce((
       select jsonb_agg(x order by x.nome, x.papel) from (
         select n.nome, r.rolname as papel, sum(s.calls) as chamadas, count(*) as formas_de_statement
           from pg_stat_statements s
           join pg_roles r on r.oid = s.userid
           cross join (values
             ('rel_estoque_asof'), ('rel_saldo_itens'), ('rel_mov_itens'), ('rel_frescor_itens'),
             ('rel_mov_por_mes'), ('rel_por_motivo'), ('rel_resumo'),
             ('rel_estoque_asof_filiais'), ('rel_saldo_itens_filiais'), ('rel_mov_itens_filiais'),
             ('rel_frescor_itens_filiais'), ('rel_mov_por_mes_filiais'), ('rel_por_motivo_filiais'),
             ('rel_resumo_filiais'), ('rel_contagem_status_filiais')
           ) as n(nome)
          where s.query ~ ('"' || n.nome || '"\s*\(')
            and r.rolname in ('authenticated', 'service_role', 'anon')
          group by n.nome, r.rolname
       ) x), '[]'::jsonb)
   ) as f60_janela;
   ```

   A aspa de fechamento separa `"rel_resumo"(` de `"rel_resumo_filiais"(`. Os blocos de medição citam as funções sem aspas
   (a regex não os casa) e terminam em exceção: não contaminam a leitura.
3. **Tráfego real** com o app novo: `node scripts/perf/medir.mjs` (a sessão do operador; o visualizador só se uma senha ativa
   for resolvida) e `node scripts/smoke/smoke-prod.mjs`.
4. **Espera de ao menos 30 minutos** com o app novo no ar.
5. **Leitura T1**, o mesmo SQL.
6. **Critério de parada — o `drop` só acontece se os três valerem:** (a) Δ chamadas das VELHAS = 0 em `authenticated`,
   `service_role` e `anon` entre T0 e T1; (b) Δ das NOVAS > 0 em `authenticated` (em `service_role`, Δ = 0 é aceitável se
   nenhum tráfego de visualizador foi gerado — e as velhas também com 0); (c) `dealloc` igual em T0 e T1 — se mudou, uma
   entrada pode ter sido despejada e recriada, e Δ = 0 não prova nada: repetir a janela.
7. **Chamador achado numa velha:** não dropar. Identificar pelo papel e pela contagem de formas de statement (nunca o texto),
   achar a origem (aba parada, script, deploy anterior), esperar e reler.
8. **Aplicar**, nessa ordem: `0144` (a view) e `0145` (o `drop`), pelo MCP (a migration já está na `main`). (corrigido em
   17/09 pela execução: o plano as numerava `0143` e `0144`.)
9. **Depois:** `notify pgrst, 'reload schema'`; `to_regprocedure('public.rel_…(…)') is null` para as sete; smoke de produção
   outra vez com 0 falha; a view nova com as mesmas linhas e o mesmo hash da view velha, lidos imediatamente antes do
   apply; sonda de paridade ensaio × produção.
10. **Se o classificador barrar o `drop`:** registrar, não reformular; o merge já aconteceu, as velhas ficam em produção
    (ninguém as chama, comportamento de hoje) e o `drop` vai para o topo do relatório com o comando (caminho B do runbook).
    Nenhuma checagem de ledger × repositório existe no `/api/saude` nem no smoke: a janela não acende alarme.

---

## 10. As dez decisões

1. **As assinaturas.** Nome novo = nome antigo + `_filiais`; primeiro parâmetro `p_filiais smallint[]`; o resto igual;
   `language sql stable security invoker set search_path = public`, não `strict`; revoke/grant na migration que cria.
   "Não-anulável" = conjunção direta (NULL e `'{}'` → 0 linhas, provado nas oito) + fora de `ARGUMENTOS_ANULAVEIS` (`null` não
   compila) + a trava positiva. *Custo que decidiu:* `NOT NULL` em parâmetro é erro de sintaxe (fato 7); `strict` daria o
   mesmo vazio, mas é mais uma diferença de texto sem ganho de plano enquanto houver `set search_path`.
2. **O consolidado.** Lista explícita de TODAS as filiais, inclusive desativadas, em `filiaisDoConsolidado`; o `null` morre em
   `recorteDeFiliais`; `number | null` por dentro até a F63; `/itens` em dois níveis, com o total calculado sobre o conjunto.
   *Custo:* `listarFiliais().map(id)` apagaria em silêncio o que estiver em filial desativada (fato 9); a soma das colunas não
   é o total quando um chamado atravessa filiais.
3. **O as-of.** `cross join lateral` ancorado em `ativos`, filial calculada, sem pré-filtro, desempate `data desc, ordem desc`,
   o `not exists` dos estornos correlacionado por ativo e `status_tem_detentor` uma vez por linha, servido por `mov_ativo_idx`
   (a lateral e a sonda do `not exists`); índice composto só pela medição — não entrou. *Custo:* hoje o recorte não
   corta a leitura — 368 buffers para 5 linhas ou para 1.624 (§3.2); o pré-filtro óbvio muda o resultado do ativo transferido
   depois da data. (corrigido em 17/09 pela execução: o plano dizia "servido por `mov_ativo_idx` +
   `movimentacoes_estorno_de_idx`", e o segundo não aparece no plano do corpo final; o custo medido do corpo novo é ~1,6–1,7× o
   do `0134` no consolidado, aceito porque é a única família que a trava aceita e cresce com os ativos, não com o histórico —
   §6.2.)
4. **A janela do `drop`.** Criação antes do merge, `drop` em arquivo separado depois do deploy; T0 → tráfego → ≥ 30 min → T1;
   Δ velhas = 0, Δ novas > 0, `dealloc` igual; chamador achado segura. *Custo:* o `pg_stat_statements` de produção separa por
   papel e cita o nome entre aspas (fato 4, §3.3) — é a prova de ausência sem ler dado; `drop` + app velho = 404 do PostgREST.
5. **`paginarTodos`.** `cap` terceiro parâmetro obrigatório nas duas funções, por domínio, com a conta do §2.1; acima dele
   LANÇA; keyset nas 33 + 1 chamadas de `id`; OFFSET nas 14 + 4, com o motivo por chamada. *Custo:* com as ordens compostas o
   ganho não se mede no volume de hoje e a troca por `ordem` muda a ordem visível; o `cap` é a proteção que importa, e o
   `tsc` a garante. (corrigido em 17/09 pela execução: o plano dizia 13 + 4; a 14ª OFFSET é a chamada nova de
   `lerSaldoItensEmNiveis` — §2.1, 49.)
6. **O custo do caminho quente** (B1–B6):
   - **`cache()`** em `contarConflitosAbertos` por chave PRIMITIVA — `chaveDeUnidades(unidades)` (família + modo + valores
     ordenados, reversível); a função pública normaliza e chama a memoizada com a string. Teste: as unidades do caminho do
     layout e do da página dão a MESMA chave (`Object.is`), e um memo por request conta UMA leitura; com o objeto cru, DUAS
     (sabotagem I). `contarPendenciasAbertas` não entra (uma chamada por request, medido). Vínculo e cargo não se tocam.
   - **KPIs** pela RPC do §6.5 (1,43 ms numa ida × duas páginas e 1.622 linhas, ou sete idas).
   - **`count` de `/ativos` FICA `exact`**, escrito: 1,34 ms sem busca, 7,73 ms com busca; `planned` mostraria 1.631 contra
     1.635 — número aproximado com cara de exato, que a régua da casa proíbe (o texto da paginação é "de {total}", sem
     qualificação, e é reusado por 8 telas). Revisitar quando o `count` com busca passar de ~100 ms (a conta vai no
     comentário do `queryLista`). Sem `pg_trgm`, sem prefixo.
   - **As três tabelas:** `TETO_LINHAS_TABELA = 2.000` por tabela (máx. 155 em 365 dias → ~13× de folga), lendo até teto + 1;
     passou → `count exact head` da mesma consulta dá o total EXATO, e o aviso diz "as N mais recentes de T". Snapshot: chave
     OPCIONAL na forma V2 (`tabelasTruncadas`), nunca `meta.schema: 3`; se o CSV lê as mesmas linhas, recebe o mesmo aviso e
     total. ⚠ Antes de fixar, o preset Tudo contado (o). (corrigido em 17/09 pela execução: contado em produção em 16/09 —
     saídas 155, entradas 136, transferências 14, iguais à janela de 365 dias; o 2.000 ficou, com ~13× de folga, e o aviso
     não aparece hoje.)
   - **`maxDuration = 60`** nas páginas do grupo `(app)` que leem `lib/queries` (o motivo e a folga medida da
     `relatorios/[filial]`), exceto as que hospedam Server Action legitimamente longa (`admin/importar` e as que o censo
     nomear), que ficam com valor explícito e motivo.
   - **`statement_timeout`:** conferido no catálogo dos dois bancos e na doc (§5); não há leitura só leitura que prove o efeito
     pelo PostgREST sem criar função lenta (proibido). **Sem `alter role`.**
   - **O harness `medir-itens.mjs`** mede as formas que o app emite (histórico com `in` de filiais, com item e ordem por data,
     e `getUltimoLancamento`), com as mesmas guardas e limpeza por contagem, no ensaio, SEM desligar trigger, pelo MCP no molde
     do `medir-rls.mjs` (o token não está no ambiente); o patamar é o que couber nos 500 MB, conferido por `pg_database_size`
     depois de cada um (produção inteira ocupa 24,3 MB).
7. **Os índices.** `movimentacoes_ordem_lista_idx` **FICA**: consumidor identificado pelo pgss — `data desc, created_at desc,
   id desc` em 28 formas / 5.931 chamadas (`authenticated`) e 18 / 646 (`service_role`), as três tabelas do período e as
   "últimas movimentações" —; trocá-las por `data desc, ordem desc` muda a ordem visível no empate (backlog das duas réguas da
   F53), e sem a troca o `idx_scan` não para (17.054; +822 entre 09/09 e a manhã de 16/09). `lanc_item_criado_por_idx` pela
   medição do harness no ensaio — produção não prova (0,31 ms com `lanc_item_created_idx` + `Incremental Sort`). O da lateral
   pelo "depois" do as-of. `lanc_item_ordem_lista_idx` não entra. (corrigido em 17/09 pela execução: a medição do ensaio pôs
   `lanc_item_criado_por_idx` na `0142`, `(criado_por, created_at desc, id desc) where estorna_id is null` — o autor sem
   lançamento ia de 2,19 ms/258 buffers com 10.035 linhas a 10,41 ms/1.286 buffers com 50.035, linear
   (`docs/perf/f60-itens-ensaio.json`), §8; o da lateral não entrou, §6.2.)
8. **Colaboradores.** Materializar o recorte antes do agregado — a chave por nome distinto (§6.6), view de mesmo nome e
   colunas, `security_invoker`, depois do deploy. *Custo:* fila 90,18 ms e resumo 83,37 ms, o maior custo de banco medido na
   fase; a emulação dá ~50 ms com o mesmo hash; paginar a tela não reduz o agregado.
9. **A trava.** R1–R4 na mesa sobre o replay, falha fechada; a oitava como exceção permanente numa fonte só, no `.sql`, nos
   dois sentidos; o par `7a`–`7g` no catálogo, com R3/R4 só na mesa; oito mutações novas (uma quebra por rótulo do bloco 7 e os dois cenários) + duas reancoradas; teto 85 → 95.
   (corrigido em 17/09 pela execução: o plano dizia `7a`–`7f`, sete mutações novas e teto 85 → 90; a `7g` e a
   `f60-excecao-ganha-overload` vieram da revisão adversarial da trava — §7.2, §7.3, §7.4.)
   *Custo:* proibir a substring `is null or` é frágil (`or p is null` invertido e `coalesce(p, col) = col` passam); exceção por
   nome de função deixaria a próxima `rel_*` escolher o próprio destino.
10. **O orçamento do as-of.** sha256 do corpo vivo pelo replay (assinatura nova), medição de produção do corpo emulado antes
    do apply e confirmada depois, trava que reprova ausente e hash diferente, nunca calendário. *Custo:* um orçamento por data
    ficaria vermelho com o projeto parado e seria desligado; o corpo é o que muda o custo.

---

## 11. A ordem de rollback

É o inverso da de apply. O `drop` é a parte que um `create or replace` não desfaz. Em banco real, rollback é **migration nova
de reversão** (a aplicada não se edita), com `npm run db:lock` e o rodapé de cada migration trazendo o comando.

**Antes do merge** (`0141`–`0143` aplicadas em produção, PR aberto): não há app a reverter — dropar as oito funções novas
(e, se for o caso, o índice da `0142`), por migration de reversão, com `notify pgrst, 'reload schema'`, é o rollback inteiro;
a `1.64.0` nunca as chamou.

**Antes do `drop` (merge e deploy feitos, a `0145` não aplicada em produção):**

1. **Reverter o app:** `git revert` do merge + redeploy → `/api/saude` com a versão anterior. O app volta a chamar as sete
   velhas, que existem, e a ler os KPIs pelas páginas de `ativos`.
2. **Só então dropar as funções novas** — as sete `rel_*_filiais` e `rel_contagem_status_filiais` —, com `notify pgrst,
   'reload schema'`. Dropar antes do revert quebra o app novo no ar (404).
3. Se a `0144` já tiver sido aplicada: a view volta pelo corpo da `0115` (`create or replace view`, mesmas colunas) —
   independente do app, porque as colunas são as mesmas nos dois sentidos.

**Depois do `drop` (a `0145` aplicada):**

1. **Recriar as sete velhas** com os corpos vivos, lidos do arquivo e não de memória: `rel_estoque_asof` da `0134` (sem a
   palavra `security invoker`, como está viva — (a)), `rel_saldo_itens` da `0027`, `rel_mov_itens` e `rel_frescor_itens` da
   `0016`, `rel_mov_por_mes`, `rel_por_motivo` e `rel_resumo` da `0011` — e **os grants da `0056`** (`revoke all … from public,
   anon` + `grant execute … to authenticated, service_role`), que `create` de função nova não traz.
2. `notify pgrst, 'reload schema'`; conferir `to_regprocedure` das sete não nulo, grants por papel e `md5` do `prosrc`
   normalizado contra os arquivos.
3. **Só então reverter o app** (`git revert` + redeploy).
4. Depois, se for o caso, dropar as funções novas, como no passo 2 de cima.
5. A view pelo corpo da `0115`, se for o caso.

**Índice novo** (se algum entrar): `drop index`. **Tipos:** `database.ts` volta com o revert; o gate de deriva do CI acompanha
a cadeia com a migration de reversão.

(corrigido em 17/09 pela execução: o plano punha as funções novas em `0141`/`0142`, a view em `0143` e o `drop` em `0144`; com
o índice na `0142`, as funções estão em `0141`/`0143`, a view em `0144` e o `drop` em `0145`. Entrou um índice —
`drop index if exists public.lanc_item_criado_por_idx`, o rodapé da `0142`; não muda resultado, só plano.)

---

## 12. Ordem dos commits e o SHA de código congelado

Já feitos: `50758d6` (a ordem) · `96fc43f` (o instrumento do `medir.mjs`).

1. `docs(f60)`: este plano + as evidências "antes" (`docs/perf/f60-producao-antes-{rel,custo}.json`, `f60-pgss-antes.json`,
   `f60-datas-amostra.json`, `f60-colaboradores-emulacao-producao.json`, `f60-producao-antes-aa-{1,2}.json`) — antes de
   qualquer commit em `src/`, `scripts/` ou `supabase/`.
2. `perf(f60)`: **lote 1** — `scripts/perf/medir-rel.mjs` e `medir-custo.mjs` (com os dois hashes do cabeçalho), `cache()` com
   chave primitiva, a `0141` + *hand-fix* + `db:lock` + `DA_F38` + os KPIs, o `count` escrito, `cap` + keyset, o teto das três
   tabelas, `maxDuration`, o harness e os índices decididos (a `0142`, `lanc_item_criado_por_idx`). Nenhuma `rel_*` existente muda.
3. `test(f60)`: **a trava**, vermelha contra a cadeia de hoje — `recorte-rel.mjs`, `rpcs-recorte-sql.test.ts`, o bloco 7,
   `catalogos-seguranca.test.ts`; saída gravada (sabotagens A e B). Não sobe sozinho.
4. `feat(f60)`: **lote 2** — `0143`/`0144`/`0145` + `db:lock` + `DA_F38` + *hand-fix*; a porta, os mapas, os descritores, os
   chamadores do §2.2, os 59 pontos de roteiro, os cenários novos (`f60_recorte.sql`, o transferido depois da data), as
   mutações, `asof-orcamento.json` e a trava dele. A trava fica verde.
   (corrigido em 17/09 pela execução: o plano punha `0142`/`0143`/`0144` no lote 2; a `0142` é o índice do lote 1.)
5. `docs(f60)`: a emenda F60 da `MATRIZ-REGRAS.md`, o Anexo A e a receita da janela no `RUNBOOK-BANCO.md`, uma linha em
   `ARQUITETURA.md` e em `docs/README.md`.
6. `chore(f60)`: `1.65.0` — `package.json`, `CHANGELOG.md`, `registry.ts`.
7. `fix(f60)`: as correções da revisão adversarial → **SHA de código congelado: `(a preencher)`** — o último commit que toca
   `src/**`, `scripts/**` ou `supabase/**`. Depois dele, só `docs/**` e `CHANGELOG.md`.
8. `docs(f60)`: a ata em `DECISOES.md` e o `RELATORIO-F60.md` com o que já dá para escrever, antes do merge.

Depois do merge e da janela: **PR só de documentação** com a conferência pós-deploy, a evidência do `drop`, as medições
"depois" e o fecho do relatório; a tag anotada **`v1.65.0`** no merge dele, publicada.
