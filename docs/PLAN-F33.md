# PLAN-F33 — Performance: a medição mandou, e ela apontou para outro lugar

> Gabarito da fase. Frente A fechada **antes de qualquer edição de código**; cada item
> abaixo fecha com o "depois" medido ao lado do "antes", no mesmo harness e nas mesmas
> condições. Otimização sem número que a sustente é revertida.

---

## 0. Baseline medido antes de editar

**Harness:** `scripts/perf/medir.mjs` — Node puro + `fetch`, zero dependência nova, só GET.
Método fixo (o mesmo no "antes" e no "depois", senão a comparação não vale nada):
2 passadas de aquecimento descartadas + **11 rodadas em round-robin** (cada rodada mede
cada rota uma vez, na mesma ordem — medir 11× seguidas a mesma rota premiaria demais a
lambda quente e o cache do Postgres, e ninguém navega assim). Mediana e **p95** por
interpolação linear entre postos. Sessão de operador reusando o login do smoke
(`scripts/smoke/README.md`); `redirect: 'manual'` — um 3xx é registrado, nunca seguido.

Saída versionada: `docs/perf/baseline-2026-08-10-producao.json` e
`docs/perf/baseline-2026-08-10-local.json`.

### 0.1 Produção (Vercel), 10/08/2026 — ANTES de qualquer mudança

| Rota | Sessão | HTTP | TTFB mediana | TTFB p95 | Total mediana | Total p95 | HTML |
|---|---|---:|---:|---:|---:|---:|---:|
| `/vercel.svg` (controle estático) | público | 200 | **15,6** | 28,5 | 15,9 | 29,0 | 128 B |
| `/login` | público | 200 | **39,2** | 56,1 | 40,1 | 57,0 | 18 KB |
| `/login` (com sessão — sonda) | operador | 200 | **67,0** | 87,2 | 67,9 | 89,4 | 18 KB |
| `/relatorios/acesso` | público | 200 | 184,8 | 244,8 | 186,1 | 247,9 | 37 KB |
| `/` (dashboard) | operador | 200 | 1196,0 | 1411,7 | 1639,4 | 2049,7 | 119 KB |
| `/ativos` | operador | 200 | 1020,0 | 1412,2 | 1216,7 | 1638,6 | 415 KB |
| `/ativos/[id]` | operador | 200 | 1355,1 | 1764,7 | 1473,4 | 1887,4 | 154 KB |
| `/movimentacoes` | operador | 200 | 981,8 | 1148,3 | 1197,6 | 1373,1 | 346 KB |
| `/movimentacoes/nova` | operador | 200 | 920,6 | 1194,5 | 1036,5 | 1344,6 | 110 KB |
| `/itens` | operador | 200 | 1167,6 | 1649,5 | 1285,7 | 1767,4 | 146 KB |
| `/pendencias` | operador | 200 | 1090,6 | 1413,7 | 1232,9 | 1824,4 | 236 KB |
| `/ajuda` | operador | 200 | 1067,8 | 1472,8 | 1247,7 | 1592,4 | 152 KB |
| `/relatorios/geral` | operador | 200 | **1421,4** | **2703,4** | 2576,7 | 3702,2 | 392 KB |
| `/relatorios/[filial]` | operador | 200 | 1291,3 | 1606,0 | 2303,4 | 3143,7 | 365 KB |
| `/relatorios/gerados` | operador | 200 | 1158,4 | 1528,5 | 1278,8 | 1663,4 | 178 KB |
| `/relatorios/gerados/[id]` | operador | 200 | 1176,4 | 1702,7 | 1477,1 | 2003,1 | 348 KB |
| `/relatorios/**` (4 rotas) | visualizador | **307** | ~180–194 | 225–356 | — | — | — |

Tempos em milissegundos.

### 0.2 A sonda que reordenou a fase inteira

As três primeiras linhas da tabela **não são rotas de teste, são um instrumento**:

- `/vercel.svg` está **fora do matcher do proxy** (`src/proxy.ts:13`): 15,6 ms é o piso
  físico de rede desta máquina até a borda da Vercel.
- `/login` **sem** cookie de sessão: o proxy roda, mas `getUser()` não vai à rede (não há
  sessão a validar). 39,2 ms.
- `/login` **com** cookie de sessão: a MESMA página, o MESMO render, e agora `getUser()`
  vai à rede. 67,0 ms.

**A ida de rede ao Auth que o proxy paga por navegação custa ~28 ms** (67,0 − 39,2).
Contra TTFB de 1.000–1.400 ms nas rotas de operador, isso é **~2%**.

O "suspeito nº 1" da ordem está medido e **não é o gargalo**. O gargalo é outro.

### 0.3 Onde o tempo está: geografia

Cabeçalho `x-vercel-id` das rotas de operador em produção:

```
/                    200  gru1::iad1::f9997-…
/ativos              200  gru1::iad1::f9997-…
/relatorios/geral    200  gru1::iad1::f9997-…
/pendencias          200  gru1::iad1::f9997-…
```

- A requisição **entra** em `gru1` (São Paulo) — é lá que o proxy roda, e por isso a
  chamada de Auth dele custa só 28 ms.
- O HTML é **renderizado** em `iad1` (Washington, DC) — é lá que estão as funções.
- O Postgres está em **`sa-east-1` (São Paulo)** — confirmado por
  `get_project(pbtjcalbmepmrqzprusb).region`.

Ou seja: **toda ida ao banco sai de Washington, vai a São Paulo e volta.** Não existe
`vercel.json` no repositório, então a região das funções é a padrão do projeto (`iad1`).

Isso reconcilia todos os números de uma vez: o layout `(app)` encadeia de 5 a 7 idas
**sequenciais** ao banco antes de a página começar, e a página encadeia as suas. A ~120 ms
por travessia, 8–10 idas sequenciais dão exatamente os 1.000–1.400 ms medidos.

### 0.3.1 O experimento que confirma a geografia

O baseline local (`next start`, build de produção) roda **o mesmo código** contra **o mesmo
banco de produção** (o `.env.local` desta máquina aponta para produção — pendência conhecida
do README, aqui usada só para leitura). A única variável que muda é **onde o servidor está**:
a máquina fica a ~16 ms do Postgres, contra os ~120 ms de `iad1`.

| Rota (operador) | Produção `iad1` | Local (Brasil) | Razão |
|---|---:|---:|---:|
| `/ativos/[id]` | 1355,1 | 272,7 | **5,0×** |
| `/` (dashboard) | 1196,0 | 286,6 | **4,2×** |
| `/movimentacoes` | 981,8 | 251,4 | 3,9× |
| `/ativos` | 1020,0 | 272,6 | 3,7× |
| `/ajuda` | 1067,8 | 265,5 | 4,0× |
| `/pendencias` | 1090,6 | 339,6 | 3,2× |
| `/relatorios/gerados` | 1158,4 | 258,6 | 4,5× |
| `/relatorios/gerados/[id]` | 1176,4 | 282,4 | 4,2× |
| `/itens` | 1167,6 | 482,5 | 2,4× |
| `/relatorios/geral` | 1421,4 | 608,8 | 2,3× |
| `/relatorios/[filial]` | 1291,3 | 568,5 | 2,3× |

TTFB mediana, ms. Mesmo harness, mesmo método, mesma sessão.

As duas rotas com a menor razão (`/itens`, relatórios) são justamente as que fazem **mais
trabalho dentro do banco** (6 RPCs paralelas de `rel_saldo_itens`; até 9 de
`rel_estoque_asof`) — nelas o custo de travessia divide espaço com trabalho real. As demais
são **dominadas pela travessia**.

Isto não prova sozinho que `gru1` entregará exatamente esses números em produção (a
máquina local não é uma lambda, e a rota do usuário até `gru1` continua existindo), mas
estabelece que **a distância app↔banco é o termo dominante**, e não o middleware.

**Bônus da medição local:** o cookie de visualizador é **aceito (HTTP 200)** contra o
servidor local, com as mesmas 4 rotas que dão 307 em produção. Isso prova que a assinatura
HMAC do harness está correta e que a recusa em produção é apenas um `VIEW_SESSION_SECRET`
diferente do que está no `.env.local` desta máquina. A superfície do visualizador é,
portanto, medida **localmente**, e a limitação fica declarada.

### 0.4 Banco (produção `pbtjcalbmepmrqzprusb` · ensaio `sgmvldiizsrjbxzzpmhh`)

`EXPLAIN (ANALYZE, BUFFERS)` direto no Postgres, e `pg_stat_statements` (v1.11, ativo):

| Query (a que o APP dispara) | Chamadas | Média | Medido isolado |
|---|---:|---:|---:|
| `v_conflitos_filiais_grupos` | 2.226 | 61,5 ms | **91,5 ms** (72 ms = a função) |
| `rel_estoque_asof` (RPC) | 601 | 77,4 ms | 28,7–39,8 ms |
| `ativos` list (filtro de status) | 1.284 | 18,2 ms | 9,0 ms |
| `v_fila_pendencias` count | 3.487 | 6,7 ms | 2,4 ms |
| `rel_saldo_itens` | 1.646 | 12,8 ms | — |
| `movimentacoes` list c/ 3 joins | 249 | 82,9 ms | 51,8 ms |

Duas leituras importantes desta tabela:

1. **`rel_estoque_asof` custa 28–40 ms no banco, não os ~233 ms** anotados em
   `relatorios/[filial]/page.tsx`. A diferença é rede + PostgREST. O teto de otimização
   **dentro** do banco é baixo; o ganho está em não atravessar o continente.
2. **A query mais cara que o app dispara é o selo da sidebar.**
   `contarConflitosAbertos()` é chamada pelo layout `(app)` em **toda** navegação de
   operador, e 79% do seu tempo é a função `IMMUTABLE chave_identidade_ativo()` sendo
   recalculada para as 1.654 linhas de `ativos`, sem índice funcional.

**Advisors de performance:** 21 achados em produção, 20 em ensaio — 15 FKs sem índice
(INFO), 4 índices nunca usados (INFO), 1 `multiple_permissive_policies` (WARN, em
`pendencias_item.UPDATE`). **Zero `auth_rls_initplan`**: a doutrina da `0059`/`0070`
continua limpa. Advisors de segurança: nenhum achado novo.

Tamanhos em produção: `movimentacoes` 3.288 linhas (era 2.361 em 24/07 — ~55/dia),
`ativos` 1.654 (era 1.230 em 29/07), `filiais` 6, `profiles` 15.

### 0.5 Bundle

⚠ **O Next 16 removeu as colunas `Size`/`First Load JS` do output de `next build`** —
mudança oficial e documentada ("found these to be inaccurate for RSC"), não defeito de
configuração. A prova de bundle desta fase usa **`npx next experimental-analyze --output`**
(comando nativo do Next, zero dependência nova), métrica *compressed (estimated)* por rota.

`npm run build` limpo: 30 rotas, 28 páginas estáticas, 0 erro/warning.
Mediana entre as 30 rotas: **636,83 KB**. Extremos: `/relatorios/[filial]` 1,21 MB (891
módulos) e `/_not-found` 397,58 KB.

- **Recharts nunca passa por `dynamic()`** — não existe UMA ocorrência de `next/dynamic`
  em todo o `src/`. Os 6 componentes de gráfico entram estáticos nas duas rotas mais
  pesadas do app.
- **`docx-preview` já está corretamente isolado** (`await import()` em
  `gerar-termo-dialog.tsx:167`, chunk próprio de 262 KB). Deixa de ser candidato.
- **`exceljs`/`docxtemplater`/`pizzip` provados ausentes** do bundle de cliente: grep
  case-sensitive em todo `.next/static/` = 0 ocorrências, com controle positivo
  (`recharts` = 2, `renderAsync` = 3) validando o método.
- **`optimizePackageImports` não precisa de configuração**: `lucide-react`, `date-fns` e
  `recharts` já estão na lista padrão do Next 16, e a doc diz que o mecanismo nem se
  aplica com Turbopack. Zero import-barrel problemático (114 arquivos de `lucide-react`,
  todos com import nomeado).

### 0.6 APIs confirmadas na documentação ATUAL (regra 6 do CLAUDE.md)

- **`auth.getClaims()` existe** em `@supabase/supabase-js` 2.110.2, mas **só valida
  localmente com chave assimétrica**. O header do JWT deste projeto é **`alg: HS256`**
  (segredo simétrico legado) — e o código do SDK cai em `getUser()` de rede sempre que
  `alg` começa com `HS`. Trocar `getUser()` por `getClaims()` hoje custa **igual ou pior**.
- **O JWT não carrega `last_sign_in_at`** — os claims são `aal, amr, app_metadata, aud,
  email, exp, iat, is_anonymous, iss, phone, role, session_id, sub, user_metadata`.
  `iat` muda a cada refresh; `session_id` não carrega timestamp. **Validação local pura
  não sustenta a régua B8.**
- **`'use cache'` exige `cacheComponents: true`** (flag ausente no `next.config.ts`).
  Ler `cookies()`/`headers()` dentro de `'use cache'` dá **erro explícito**, não
  vazamento silencioso.
- **`React cache()`** é por requisição, exclusivo de Server Components, e **não memoiza
  nada em Edge/proxy** (sem dispatcher React, cai silenciosamente para chamada direta).
- **`next/dynamic` com `ssr: false` é erro em Server Component** — só dentro de um
  `'use client'`.

---

## 1. Achados ranqueados por (ganho × certeza × risco)

| # | Achado | Ganho | Certeza | Risco | Frente |
|---|---|---|---|---|---|
| 1 | Funções em `iad1`, banco em `sa-east-1` — cada ida ao banco atravessa o continente | **altíssimo** | alta | baixo | B |
| 2 | Índice funcional para `chave_identidade_ativo()` — 72 ms por navegação no selo | alto | média | baixo | D |
| 3 | `/ativos/[id]`: 3 rodadas sequenciais onde 1 `Promise.all` de 9 bastaria | alto | alta | baixo | C |
| 4 | Layout `(app)`: `getOperador` → `listarFiliais` → contagens em cascata | alto | alta | baixo | C |
| 5 | `contarConflitosAbertos()` roda 2× na Home (layout + page), sem `cache()` | médio | alta | baixo | C |
| 6 | `listarFiliais(client)` com client próprio perde o `cache()` em 3 rotas | médio | alta | baixo | C |
| 7 | `getPerfilAtual()` duplica `getOperador()` em `/movimentacoes/nova` | médio | alta | baixo | C |
| 8 | `getSnapshotRelatorioV2` faz `await listarFiliais` ANTES do `Promise.all(10)` | médio | alta | baixo | C |
| 9 | `getOperador()` faz um select em `filiais` que `listarFiliais()` já cobre | médio | alta | baixo | C |
| 10 | Recharts estático nas 2 rotas mais pesadas (nenhum `dynamic()` no repo) | médio | alta | médio | E |
| 11 | Proxy chama `getUser()` mesmo sem cookie de sessão (visualizador, anônimo) | baixo | alta | baixo | B |
| 12 | Índice de ordenação de `/movimentacoes` (`data desc, created_at desc, id desc`) | baixo | alta | baixo | D |
| 13 | `e_admin()` sem `(select …)` em `pendencias_item` — quebra o padrão da `0063` | baixo | alta | baixo | D |
| 14 | `multiple_permissive_policies` em `pendencias_item.UPDATE` | baixo | alta | baixo | D |
| 15 | 15 FKs sem índice (tabelas quase todas minúsculas; só `movimentacoes` é grande) | baixo | alta | baixo | D |

---

## 2. O que este plano NÃO vai fazer (declarado)

- **Não troca `getUser()` por `getClaims()`.** Medido: com HS256 o SDK vai à rede do mesmo
  jeito, e o JWT não traz `last_sign_in_at`. Migrar o projeto para chave assimétrica é
  mudança de configuração do Auth de produção, fora de código e de migration — e mesmo
  assim a B8 continuaria precisando de outra fonte para "quando a sessão começou".
  O prêmio medido são 28 ms. **Não paga o risco.** Ata em `DECISOES.md`.
- **Não mexe em RPC/trigger/função de negócio** (`rel_estoque_asof`, `rel_saldo_itens`,
  `importar_ativos_substituir`). A ordem proíbe, e a medição mostra que o teto é baixo.
- **Não reduz as 6 RPCs paralelas de `getSaldosPorFilial`** (/itens): exigiria RPC nova.
  Vai para o backlog.
- **Não ataca `nova-movimentacao-form.tsx` (60 KB) nem os demais forms grandes**: é
  refatoração de forma, explicitamente fora de escopo. Backlog.
- **Não derruba nenhum índice existente**, mesmo os 4 com `idx_scan = 0` (são unique
  constraints e guardas de negócio da F23).
- **Não liga `cacheComponents`/`'use cache'`.** Ver Frente F.

---

## 3. Frente B — onde a navegação paga o custo fixo

### B1 · Fixar a região das funções em `gru1` (São Paulo) — `vercel.json`

O item de maior ganho da fase, e o mais simples: um arquivo de 4 linhas.

```json
{ "$schema": "https://openapi.vercel.sh/vercel.json", "regions": ["gru1"] }
```

- **Confirmado na doc atual da Vercel**: a chave `regions` define a região padrão de
  todas as funções do projeto.
- **Custo R$ 0**: não habilita recurso pago nenhum; região padrão não tem sobretaxa, e a
  duração faturada de função tende a **cair** (a função passa menos tempo bloqueada em
  I/O de rede).
- **Invisível ao usuário**: nenhum pixel, nenhum texto, nenhuma regra.
- **Reversível em um commit.**
- Efeito colateral bem-vindo: dado brasileiro deixa de trafegar para os EUA a cada render.

**Como se prova:** harness completo contra produção antes e depois do deploy, e o
`x-vercel-id` passando de `gru1::iad1::` para `gru1::`(ou `gru1::gru1::`).
**Como se derruba:** se o TTFB não cair, o `vercel.json` sai no commit seguinte.

### B2 · Proxy: não chamar `getUser()` quando não há cookie de sessão

`src/lib/supabase/proxy.ts` chama `getUser()` **antes de qualquer branch** — inclusive
para o visualizador por senha (que não tem conta Supabase) e para o anônimo. Vale ~28 ms
por request nessas superfícies, e o `ViewerAutoRefresh` de 60 s por aba multiplica isso.

Só entra **se** for possível decidir pela presença do cookie sem mudar nenhum
comportamento observável. **Invariantes que não podem ser tocados:** expiração B8 (24 h
desde `last_sign_in_at`), refresh de token, confinamento do visualizador, headers
`x-wap-pathname`/`x-wap-search`, redirects com `?next=`, `signOut({scope:'local'})` e a
cópia dos cookies para o redirect.

### B3 · A régua B8 vira função pura testada

Hoje a conta de expiração vive inteira dentro do `proxy.ts` (Edge) e **não tem um único
teste** — busquei em 119 arquivos `*.test.ts` e em `supabase/tests/`: zero. Extrair
`sessaoExpirada(lastSignInAt, agora)` para um módulo puro com testes (sem `last_sign_in_at`,
data inválida, dentro da janela, exatamente no limite, passada a janela) é pré-requisito
de segurança de qualquer mudança em B2 — e é bom mesmo que B2 não aconteça.

---

## 4. Frente C — conversa com o banco (código)

Regra dura de toda a frente: **nenhuma mudança de resultado**. As funções de `queries/`
devolvem os mesmos dados para os mesmos argumentos. Coluna só sai do select quando
ninguém a usa, e quem prova é o TypeScript strict.

| Item | Arquivo | O quê | Ganho |
|---|---|---|---|
| C1 | `app/(app)/ativos/[id]/page.tsx:81-121` | Fundir as 3 rodadas num `Promise.all` de 9 | −2 rodadas |
| C2 | `app/(app)/layout.tsx:49-85` | `getOperador()` e `listarFiliais()` em paralelo | −1 rodada |
| C3 | `lib/auth/acesso.ts:201-204` | `getOperador` deriva as filiais de `listarFiliais()` | −1 query |
| C4 | `lib/queries/conflitos.ts` | `React cache()` em `contarConflitosAbertos` | −1 query na Home |
| C5 | `pendencias`, `relatorios/[filial]`, `relatorios/gerados` | `listarFiliais()` sem client no ramo operador | −1 query × 3 rotas |
| C6 | `app/(app)/movimentacoes/nova/page.tsx` | Trocar `getPerfilAtual()` por `operador`; `ultimaMov` entra no `Promise.all` | −2 rodadas |
| C7 | `lib/queries/relatorios/snapshot.ts:54` | `listarFiliais` entra no `Promise.all(10)` | −1 rodada |
| C8 | `app/(app)/ativos/[id]/page.tsx:59-72` | `cache()` em `buscarAtivoPorId` + `generateMetadata` reusa | −1 query (medir) |

C8 é o único com contrapartida (o embed de filiais passa a ser pago no `generateMetadata`):
**mede-se antes de aplicar**; se não pagar, não entra e fica registrado.

---

## 5. Frente D — banco (aditivo e reversível, ensaio → sonda → produção)

| Item | O quê | Evidência |
|---|---|---|
| D1 | Índice funcional para `chave_identidade_ativo(patrimonio, service_tag)` | 72 ms de 91 ms da view mais quente do app |
| D2 | Índice de ordenação de `movimentacoes (data desc, created_at desc, id desc)` | Seq Scan + Sort top-N hoje; tabela cresce ~55/dia |
| D3 | Índices das FKs de `movimentacoes` (`criado_por`, `motivo`, `filial_destino_id`, `estorno_de`) | advisor; é a única tabela grande do grupo |
| D4 | `e_admin()` → `(select e_admin())` em `pendencias_item` | restaura o padrão documentado na `0063:46-57` |
| D5 | Fundir as 2 policies permissivas de `pendencias_item.UPDATE` | WARN do advisor nos dois bancos |

D1 exige prototipagem em ensaio antes de virar migration (pode precisar de `INCLUDE` para
virar Index Only Scan de verdade). **Cada índice mede plano antes/depois; o que não mudar
plano não fica.** D4/D5 preservam semântica EXATA e se provam com `supabase/tests/` verde
+ advisor zerado. Nada destrutivo; nenhuma função de negócio tocada.

---

## 6. Frente E — bundle

- **E1:** `dynamic()` nos gráficos Recharts de `corpo-relatorio-v2.tsx`, com skeleton no
  padrão que o app **já tem** (`Carregando` + `Skeleton`, 17 `loading.tsx` no repo) e na
  **mesma altura** dos cards. Restrição dura: o snapshot congelado
  (`/relatorios/gerados/[id]`) exige pixel final idêntico — na dúvida, não entra.
- **E2:** regressão automática — repetir o grep case-sensitive de
  `docxtemplater|PizZip|ExcelJS|exceljs` em `.next/static/` e exigir 0.
- Prova antes/depois por `npx next experimental-analyze --output`, não pela tabela do
  build (que não existe mais).

---

## 7. Frente F — cache

Posição de partida, a ser confirmada ao fim: **nenhum cache entre requisições nesta fase.**

- `React cache()` (por requisição) é o padrão-ouro e é usado à vontade — é o que sustenta
  C3, C4 e C5.
- Cache **entre** requisições exigiria `cacheComponents: true` (flag experimental ausente
  hoje), invalidação explícita em toda action de admin, TTL e prova de não-vazamento.
  Os candidatos legítimos (`listarMotivos`, `listarItensAtivos`, `listarKitsAtivos`) são
  tabelas de **13, 0 e 0 linhas** em produção — depois da Frente B cada leitura dessas
  custa poucos milissegundos.
- **O ganho não paga o risco.** Decisão registrada em `DECISOES.md` mesmo sendo um "não".

---

## 8. Ordem de execução

1. **Frente A** — fechada (este documento).
2. **B1 (região)** — deploy + harness contra produção. É o item que muda a escala de tudo.
3. **C1…C8** — `lint` + `test` verdes entre incrementos; harness local por incremento.
4. **D1…D5** — ensaio → sonda → produção, por `docs/RUNBOOK-BANCO.md`.
5. **E1/E2** — `experimental-analyze` antes/depois.
6. **F** — registrar a decisão.
7. **Fecho** — harness completo local e produção, `lint`/`test`/`build`/`contraste`,
   revisão adversarial em contexto fresco, roteiros manuais, smoke pós-deploy.

## 9. Pendências abertas da Frente A

- **Cookie de visualizador recusado em produção** (307 nas 4 rotas): o segredo
  `VIEW_SESSION_SECRET` do `.env.local` provavelmente difere do de produção. A medição do
  visualizador será feita contra o `next start` local (onde o segredo é o mesmo) e a
  limitação declarada no relatório.
- **Não medi o RTT `iad1`→`sa-east-1` diretamente** — ele é inferido pela diferença entre
  o baseline local (banco a ~16 ms) e o de produção. O deploy de B1 é a medição direta.
- `Heap Fetches = 1200/1654` em `ativos_filial_status_idx` sugere autovacuum atrasado —
  registrado, fora do escopo (não é migration).
