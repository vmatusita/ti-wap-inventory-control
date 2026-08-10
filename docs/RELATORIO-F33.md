# RELATÓRIO F33 — O sistema estava rodando no hemisfério errado

**Fase:** performance · **Data:** 10/08/2026 · **Estado:** em produção (deploy `bdb173d`, `READY`, `regions: ["gru1"]`)

A ordem apontava o `await supabase.auth.getUser()` do proxy como suspeito nº 1 do custo fixo de
navegação. A medição o absolveu em vinte minutos: ele custa **~28 ms** de um TTFB de 1.200 ms. O
gargalo era geográfico — as funções renderizavam o HTML em **Washington** enquanto o Postgres está
em **São Paulo**, e cada navegação encadeia de 8 a 10 leituras **sequenciais**, atravessando o
continente uma vez por leitura. O conserto tem três linhas.

Esta fase é, antes de tudo, um argumento a favor de medir antes de otimizar: **o item de maior
ganho não estava na ordem**, e **dois dos itens que estavam foram revertidos** quando o número
mostrou que não faziam nada.

---

## 1. A tabela antes/depois — produção, mesmo harness, mesmas condições

`scripts/perf/medir.mjs` · 2 passadas de aquecimento descartadas + **11 rodadas round-robin** ·
mediana e p95 por interpolação linear entre postos · sessão de operador reusando o login do smoke ·
`redirect: 'manual'` · **só GET**.

**Antes:** `docs/perf/baseline-2026-08-10-producao.json` (medido ANTES de qualquer edição).
**Depois:** `docs/perf/f33-final-producao.json` (medido depois do deploy da fase inteira).
Tempos em milissegundos.

| Rota | Sessão | TTFB antes | TTFB depois | Δ | p95 antes | p95 depois | Δ p95 | Total antes | Total depois | Δ total |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `/vercel.svg (controle estático)` | publico | 15,6 | 15,7 | **+0,6%** | 28,5 | 24,6 | -13,7% | 15,9 | 15,9 | +0,0% |
| `/login` | publico | 39,2 | 38,1 | **-2,8%** | 56,1 | 52,1 | -7,1% | 40,1 | 38,9 | -3,0% |
| `/relatorios/acesso` | publico | 184,8 | 74,1 | **-59,9%** | 244,8 | 89,8 | -63,3% | 186,1 | 77,3 | -58,5% |
| `/login (com sessão — sonda do getUser do proxy)` | operador | 67 | 65 | **-3,0%** | 87,2 | 86,4 | -0,9% | 67,9 | 65,9 | -2,9% |
| `/ (dashboard)` | operador | 1196 | 378 | **-68,4%** | 1411,7 | 493,8 | -65,0% | 1639,4 | 399,4 | -75,6% |
| `/ativos` | operador | 1020 | 369,7 | **-63,8%** | 1412,2 | 1037,8 | -26,5% | 1216,7 | 378,3 | -68,9% |
| `/ativos/[id]` | operador | 1355,1 | 370 | **-72,7%** | 1764,7 | 503 | -71,5% | 1473,4 | 389,6 | -73,6% |
| `/movimentacoes` | operador | 981,8 | 397,3 | **-59,5%** | 1148,3 | 535,8 | -53,3% | 1197,6 | 407,9 | -65,9% |
| `/movimentacoes/nova` | operador | 920,6 | 321,6 | **-65,1%** | 1194,5 | 420,3 | -64,8% | 1036,5 | 331 | -68,1% |
| `/itens` | operador | 1167,6 | 372,3 | **-68,1%** | 1649,5 | 1090,2 | -33,9% | 1285,7 | 381,3 | -70,3% |
| `/pendencias` | operador | 1090,6 | 358,5 | **-67,1%** | 1413,7 | 593,3 | -58,0% | 1232,9 | 415,7 | -66,3% |
| `/ajuda` | operador | 1067,8 | 375,6 | **-64,8%** | 1472,8 | 486,5 | -67,0% | 1247,7 | 394,7 | -68,4% |
| `/relatorios/geral` | operador | 1421,4 | 567,2 | **-60,1%** | 2703,4 | 849,7 | -68,6% | 2576,7 | 682,6 | -73,5% |
| `/relatorios/[filial]` | operador | 1291,3 | 437,9 | **-66,1%** | 1606 | 638,1 | -60,3% | 2303,4 | 624,3 | -72,9% |
| `/relatorios/gerados` | operador | 1158,4 | 383,4 | **-66,9%** | 1528,5 | 456,4 | -70,1% | 1278,8 | 400,5 | -68,7% |
| `/relatorios/gerados/[id]` | operador | 1176,4 | 373,5 | **-68,3%** | 1702,7 | 663,8 | -61,0% | 1477,1 | 405,6 | -72,5% |
| `/relatorios/geral` | visualizador | 193,8 | 68,9 | **-64,4%** | 355,5 | 110,3 | -69,0% | 215,8 | 90,4 | -58,1% |
| `/relatorios/[filial]` | visualizador | 184,7 | 67,9 | **-63,2%** | 310,1 | 143,6 | -53,7% | 191,3 | 91,9 | -52,0% |
| `/relatorios/gerados` | visualizador | 180,7 | 70,1 | **-61,2%** | 225,5 | 116,4 | -48,4% | 187,9 | 86 | -54,2% |
| `/relatorios/gerados/[id]` | visualizador | 181,7 | 74,4 | **-59,1%** | 234,7 | 91,9 | -60,8% | 192,3 | 100,6 | -47,7% |

### A meta da ordem

> "−30% de TTFB nas 3 rotas mais lentas do baseline; nenhuma rota >10% pior."

As três mais lentas do baseline eram `/relatorios/geral` (1421,4), `/ativos/[id]` (1355,1) e
`/relatorios/[filial]` (1291,3). Caíram **−60,1%**, **−72,7%** e **−66,1%**. **Nenhuma rota piorou**
— o maior "aumento" da tabela é o controle estático `/vercel.svg`, +0,1 ms (+0,6%), que é ruído de
rede: ele não passa nem pelo proxy nem por função nenhuma.

As duas linhas de topo da tabela existem para calibrar as outras: `/vercel.svg` (fora do matcher do
proxy) é o piso de rede, e `/login` sem sessão é o piso de render. As duas ficaram paradas — o que
é a prova de que a queda das demais é trabalho de servidor que sumiu, e não a rede do medidor
tendo um dia melhor.

---

## 2. O que mudou, por frente, e o número de cada item

### Frente B — onde a navegação paga o custo fixo

**B1 · `vercel.json` com `regions: ["gru1"]`** — o item de maior ganho da fase, e três linhas.

Diagnóstico: `x-vercel-id` de **todas** as rotas de operador vinha `gru1::iad1::` — a requisição
entrava em `gru1` (São Paulo, onde o proxy roda) e o HTML era renderizado em `iad1` (Washington).
O banco está em `sa-east-1` (São Paulo), confirmado por `get_project(pbtjcalbmepmrqzprusb).region`.
Não havia `vercel.json` no repositório, então a região era a padrão do projeto.

Experimento de confirmação, **antes de mudar qualquer coisa**: o baseline local (`next start`, build
de produção, **mesmo código**, **mesmo banco de produção**, servidor a ~16 ms do Postgres) respondia
**2,3× a 5,0× mais rápido** que produção nas mesmas rotas, com o mesmo harness. A única variável
diferente era onde o servidor estava.

A sonda que absolveu o suspeito nº 1: `/login` medida duas vezes — **sem** cookie (o proxy roda, mas
`getUser()` não vai à rede porque não há sessão a validar) e **com** cookie (mesma página, mesmo
render, agora com a ida de rede). 39,2 ms → 67,0 ms no baseline. **A ida de rede ao Auth que o proxy
paga por navegação custa ~28 ms**, contra TTFB de 1.000–1.400 ms: **~2%**.

**B2 e B3 não entraram.** B2 (pular `getUser()` quando não há cookie de sessão) e B3 (extrair a
régua B8 para função pura testada) eram condicionais a mexer no proxy — e a sonda mostrou que o
proxy inteiro vale 28 ms. Mexer no mecanismo de sessão de um sistema em uso diário para ganhar 2%
é péssima relação risco/prêmio. **A régua B8 segue sem teste automatizado** (busquei em 119
arquivos `*.test.ts` e em `supabase/tests/`: zero cobertura) — vai para o backlog com essa nota.

### Frente C — conversa com o banco

Regra que governou a frente: **nenhuma mudança altera o resultado de nenhuma função**.

| Item | O quê | Prova |
|---|---|---|
| C1 | `/ativos/[id]`: três rodadas sequenciais viraram um `Promise.all` de nove | A/B intercalado: −1,6% a −5,4% normalizado pelo controle |
| C6 | `getPerfilAtual()` fora de `/movimentacoes/nova` e `/ativos/novo` | `pg_stat_statements`: **1,00 → 0,00** query por render |
| C7 | `listarFiliais` deixou de bloquear as dez leituras caras do relatório | A/B intercalado: **−8,8%** em `/relatorios/geral` (controle +3,3%) |

`src/lib/queries/profile.ts` foi removido: `getPerfilAtual` ficou morto, e deixar um atalho que
duplica `getOperador()` é convidar a reintroduzir a chamada de rede que acabamos de tirar.

**Não entrou, com motivo registrado:** fazer `getOperador()` derivar as filiais de `listarFiliais()`
economizaria uma query, mas `listarFiliais()` ordena por **nome** e o select interno não ordena —
e o menu do usuário imprime "Escreve em: …" nessa ordem para o cargo `operador`. Mudaria um **texto
de UI**. A ordem proíbe.

### Frente D — banco (migrations `0105`–`0107`, ensaio → produção pelo runbook)

| Item | Antes | Depois |
|---|---|---|
| `0105` índice `(data desc, created_at desc, id desc)` | Seq Scan + Sort top-N, 159 buffers, ~68,6 ms | **Index Scan sem Sort, 6 buffers, ~0,11 ms** |
| `0106` 4 índices de FK em `movimentacoes` | Seq Scan nas quatro | Index/Bitmap Scan nas quatro |
| `0107` `e_admin()` em `(select …)` | custo 164,50 | custo 89,76 (**−45%**) |

A semântica da `0107` foi conferida **no banco depois de aplicada**, não no texto da migration: o
`using`/`with check` diferem da `0103` apenas pelo wrap, e `polcmd` (`w`), `polpermissive` (`true`)
e `polroles` (`{authenticated}`) continuam iguais nas três policies da tabela. O roteiro
`supabase/tests/reabrir_pendencia_item.sql` rodou em ensaio dentro de `begin; … rollback;` com 4/4
cenários OK (operador resolve, operador NÃO reabre, outra filial NÃO reabre, admin REABRE).

As outras 11 FKs sem índice do advisor ficaram de fora com motivo: são tabelas de 0 a 49 linhas
(`import_logs` 12, `senhas_acesso` 4, `kits_modelos` 0, `termos_gerados` 22, `eventos_admin` 49,
`pendencias_item` 5, `relatorios_gerados` 10, `anotacoes` 8). Índice ali é custo de escrita sem
ganho de leitura mensurável.

### Frente E — bundle

- **Guarda de regressão executada:** `docxtemplater`, `PizZip`, `ExcelJS` e `exceljs` têm **0
  ocorrências** em todo `.next/static/`, com controle positivo validando o método (`recharts` = 2,
  `renderAsync` = 3). O método detecta; o que ele não achou, não está lá.
- **`docx-preview` já estava resolvido** antes desta fase (`await import()` no ponto de uso, chunk
  próprio de 262 KB) — deixou de ser candidato.
- **`optimizePackageImports` não precisa de configuração:** `lucide-react`, `date-fns` e `recharts`
  já estão na lista padrão do Next 16, e o mecanismo nem se aplica com Turbopack.
- **Recharts sob `dynamic()` não entrou.** `ssr: false` é erro em Server Component (só funciona
  dentro de um `'use client'`), e `corpo-relatorio-v2.tsx` é Server Component: aplicá-lo exigiria
  refatorar o corpo do relatório e tiraria o gráfico do HTML renderizado no servidor — o que
  atinge `/relatorios/gerados/[id]`, o **snapshot congelado**, que a ordem lista como intocável
  ("bytes e render intocados"). Sem `ssr: false`, o `dynamic()` num componente que renderiza
  imediatamente não tira nada do carregamento inicial. Backlog.
- **Nenhuma rota cresceu**, e a prova é estrutural: os cinco arquivos de `src/` tocados pela fase
  são **todos de servidor** (um deles foi removido). Nenhum arquivo `'use client'` foi alterado,
  então o grafo de cliente é idêntico por construção. Superfície atual: 3.582,6 KB em 75 chunks.
- ⚠ **O Next 16 removeu as colunas `Size`/`First Load JS` do `next build`** — mudança oficial
  ("found these to be inaccurate for RSC"), não defeito de configuração. Quem for medir bundle
  neste projeto daqui pra frente precisa de `npx next experimental-analyze --output`. O baseline de
  bundle da fase (30 rotas, mediana 636,83 KB comprimido estimado, maior `/relatorios/[filial]` com
  1,21 MB) está em `docs/PLAN-F33.md` §0.5.

### Frente F — cache

**Nenhum cache entre requisições.** `'use cache'` exigiria ligar `cacheComponents` no app inteiro;
os candidatos legítimos (`listarMotivos`, `listarItensAtivos`, `listarKitsAtivos`) são tabelas de
**13, 0 e 0 linhas**, cujo custo depois da Frente B é de poucos milissegundos; e o custo de errar é
vazamento de dado entre cargos. Ata registrada mesmo sendo um "não".

---

## 3. O que foi tentado e REVERTIDO — com o número que condenou

### C4 e C5 — a duplicata que nunca existiu

O mapa da Frente A apontou duas leituras duplicadas por render: `contarConflitosAbertos` (selo da
sidebar + card da Home) e `listarFiliais` (layout com um argumento, página com outro, errando a
chave do memo). As duas foram corrigidas, commitadas — e depois **revertidas**.

A medição: produção ainda rodava o código ANTES da Frente C e o `next start` local rodava o DEPOIS,
**os dois contra o mesmo Postgres**, então `pg_stat_statements` contava os dois. Oito renders de
cada lado, com a janela conferida sem tráfego de fundo (todos os contadores subiram exatamente 8):

| Rota | Query | antes/render | depois/render |
|---|---|---:|---:|
| `/` | `v_conflitos_filiais_grupos` | **1,00** | **1,00** |
| `/pendencias` | `listarFiliais` (4 colunas) | **1,00** | **1,00** |
| `/movimentacoes/nova` | `getPerfilAtual` (`profiles`) | **1,00** | **0,00** |

**Causa:** o Next memoiza requisições `fetch` idênticas dentro de um mesmo render. As duas chamadas
produzem GETs byte a byte iguais ao PostgREST — o framework já as colapsava, e a duplicata **nunca
chegava ao banco**. `getPerfilAtual` escapava porque seleciona colunas diferentes (`id, nome`
contra `nome, papel, ativo, excluido_em`): URL diferente, sem memoização.

Além de não economizar nada, o memo de conflitos **mudava o comportamento no caminho de erro**
(passava a guardar o `0` da falha). Mudança de comportamento sem ganho é o pior negócio possível.

**O que fica desta investigação vale mais que o código revertido:** neste projeto, duas chamadas à
mesma função de `queries/` só custam duas idas ao banco quando a **URL final difere** — colunas,
filtros, ou client administrativo contra client com RLS.

### D1 — o índice funcional que não mudou plano

Era o item nº 2 do plano, com a melhor evidência da Frente A: `v_conflitos_filiais_grupos` custa
91,47 ms, dos quais **72 ms (79%)** são a função `IMMUTABLE chave_identidade_ativo()` reavaliada
para as 1.654 linhas de `ativos`; e ela roda no selo da sidebar em **toda** navegação de operador
(2.226 chamadas, 136,94 s acumulados em `pg_stat_statements` — a query mais cara que o app dispara).

Três variantes prototipadas em ensaio — funcional simples, funcional com `INCLUDE (id, filial_id)`,
e forçada com `enable_seqscan=off`. **Nenhuma mudou o plano.** Causa isolada: a CTE que materializa
a view varre a tabela inteira **sem `WHERE` e sem `ORDER BY`**, e o planejador só considera Index
Scan quando há predicado ou pathkey que combine. Com um `WHERE` acrescentado o índice **é** usado —
e fica **pior**: 1.040 buffers contra 97 do Seq Scan, porque a tabela tem 47 páginas.

Índice morto não fica. Os índices de teste foram derrubados; zero resíduo em ensaio.

### D5 — a fusão de policy recusada

O advisor aponta `multiple_permissive_policies` em `pendencias_item.UPDATE`. A álgebra do RLS
sugere que fundir seria equivalente, mas a tabela tem **5 linhas** em produção e o WARN não tem
custo medido além do que a `0107` já resolveu. Ganho quase nulo contra o risco de alterar quem pode
reabrir uma pendência resolvida.

### `getClaims()` — o caminho que a ordem sugeria

Não entrou, por dois motivos independentes e cada um suficiente:

1. O header do JWT deste projeto é `alg: HS256`. Lido no código do SDK instalado
   (`@supabase/auth-js` 2.110.2), `getClaims()` só verifica localmente com chave **assimétrica**;
   com `HS*` ele cai no fallback `getUser()` **de rede** — o mesmo round-trip, com decode e
   validação a mais antes.
2. O JWT **não carrega `last_sign_in_at`**. `iat` muda a cada refresh de token (que, pela regra
   vigente, não desloga dentro da janela) e `session_id` não carrega timestamp. Validação local
   pura **não sustenta a régua B8**.

---

## 4. A revisão adversarial achou um defeito que a própria fase introduziu

Cinco lentes independentes em contexto fresco, e cada achado passou por um cético instruído a
refutá-lo. **4 achados, 2 confirmados.**

**Confirmado e corrigido:** em `getSnapshotRelatorioV2`, a promise de `listarFiliais` ficara **fora**
do `Promise.all`. Se o `Promise.all` grande rejeitasse primeiro, a função sairia por exceção antes
de esperá-la, e uma rejeição dela — mesma causa-raiz, é o **mesmo client** — ficaria sem handler.
Rejeição não tratada derruba o processo no Node, e numa função serverless isso alcança as
requisições **concorrentes** da mesma instância.

O cético tentou derrubar o achado pela memoização do `cache()` e provou que ela **salva só um dos
dois chamadores**: em `/relatorios/[filial]` a página chama `listarFiliais(acesso.client)` como
irmã no mesmo `Promise.all`, compartilhando a promise; mas `gerarRelatorio`
(`src/lib/actions/relatorios.ts:86`, o botão "Gerar relatório", uso semanal) chama
`getSnapshotRelatorioV2` sozinho — ali a promise ficava mesmo órfã. Corrigido pondo-a **dentro** do
array, que é o que sempre protegeu o `estadoNoFim` (ele é membro do array; o comentário que eu
tinha escrito comparando os dois estava objetivamente errado).

**Confirmado e corrigido:** `medir.mjs` lia `x-vercel-cache` por amostra e **descartava antes de
gravar** — a evidência versionada não distinguia "ficou rápido" de "a resposta de uma sessão foi
servida a outra pessoa pelo cache de borda". Agora o campo entra no JSON e o harness **falha**
(exit 1) se qualquer rota com sessão vier `HIT`.

**Refutados pelo cético:** dois achados não sobreviveram à verificação e não viraram mudança.

**Três lentes fecharam com zero achados**: pixel/texto idênticos, semântica de RLS/acesso/B8, e
vazamento entre usuários/cargos/superfícies. Entre o que essas lentes conferiram e deram certo:
`git diff` vazio em `src/lib/supabase/proxy.ts` e `src/lib/auth/` (middleware e B8 intocados);
`Promise.all` devolve por posição do array, não por ordem de resolução, então nenhuma lista mudou
de ordem; o caminho "`getOperador()` null onde `getPerfilAtual()` não era" é inalcançável porque o
layout do grupo `(app)` já redireciona antes; e os quatro JSON de `docs/perf/` não contêm id,
patrimônio, e-mail, nome ou token.

---

## 5. A guarda de cache disparou na primeira execução — e o que eu fiz

A medição final acusou `x-vercel-cache: HIT` em `/login (com sessão)`. Investiguei antes de
silenciar: `/login` é **pública e pré-renderizada** (`○ Static` no build), o HTML é o mesmo
formulário para todo mundo e não carrega nada da sessão; levar um cookie junto não a torna
dependente de sessão. **Falso positivo da minha própria guarda**, causado pelo rótulo da sonda.

A guarda ganhou uma marca explícita (`estatico: true`) só para essa sonda, com o motivo escrito ao
lado, e **continua estrita para todo o resto**. A evidência agora prova positivamente o que
interessa: **todas as 12 rotas de operador e as 4 de visualizador respondem `MISS`.**

Não reexecutei a medição final depois de corrigir a guarda. A primeira rodada pós-deploy é a de
registro — reexecutar até gostar do número é exatamente a desonestidade que esta fase existiu para
evitar.

---

## 6. Saídas reais

```
$ npm run lint
> eslint
(sem saída — limpo)

$ npm run test
Test Files  122 passed (122)
     Tests  2517 passed (2517)

$ npm run build
✓ 30 rotas · 28 páginas estáticas · 0 erro/warning

$ npm run contraste
74 pares conferidos · os 2 abaixo do piso são alívios JÁ registrados (F32)

$ node scripts/smoke/smoke-prod.mjs --exigir-f12
RESUMO · 94 OK · 4 aviso · 0 n/a (pré-F12) · 0 falha        (exit 0)
```

Os 4 avisos do smoke são **pré-existentes** e não têm relação com a F33: o catálogo de itens está
vazio em produção (`itens`, `kits_modelos` e `lancamentos_item` com 0 linhas — o mesmo que a Frente
A já havia medido), então a RLS de `kits_modelos` não pôde ser comprovada por falta de linha.

### Advisors de performance

| | antes | depois |
|---|---:|---:|
| Produção (`pbtjcalbmepmrqzprusb`) | 21 | 21 |
| Ensaio (`sgmvldiizsrjbxzzpmhh`) | 20 | 19 |

Em produção: `unindexed_foreign_keys` caiu de 15 para 11 (os quatro de `movimentacoes`, resolvidos
pela `0106`), e `unused_index` subiu de 4 para 8 — os quatro novos são os índices recém-criados,
que se auto-resolvem com tráfego real. **Zero achado novo de classe diferente** nos dois bancos, e
os advisors de **segurança** ficaram idênticos.

### Uma instabilidade de teste, declarada

Em 9 execuções da suíte completa nesta máquina, **2 falharam** — sempre o mesmo teste,
`src/components/relatorios/fronteira-rsc.test.ts`, e sempre enquanto a máquina estava sob carga
pesada de IO paralelo (agentes + build + servidores). Isolado, ele passou **8 de 8**. O teste é um
**varredor de disco** (`readFileSync` sobre todo `src/app` e `src/components`) e este repositório
fica dentro do **OneDrive**. Nenhum arquivo de `src/components/` foi tocado por esta fase.
Registrado como instabilidade de ambiente; o CI, que roda em disco limpo, é o árbitro.

---

## 7. Roteiros manuais e o que NÃO foi exercitado

Executados por harness com sessão real (12 rotas de operador, HTTP 200, bytes compatíveis com o
baseline em todas) e pelo smoke logado (94 checagens, incluindo as 25 páginas da ajuda com asserção
de conteúdo, e a recusa das rotas de operador sem sessão). O confinamento do visualizador por senha
foi exercitado **localmente** (as 4 rotas de relatório respondem **200** com o cookie assinado) —
ver a limitação na seção 8.

**Não exercitei clique a clique numa janela de navegador.** A fase não alterou nenhum componente de
cliente, nenhum texto e nenhuma classe com efeito visual — os cinco arquivos tocados em `src/` são
todos de servidor —, então a conferência visual passo a passo do README do smoke não foi refeita.
Quem quiser a garantia de tela precisa fazê-la à mão.

---

## 8. O que este relatório NÃO prova

1. **Os números são da minha rede, não da rede dos usuários.** As 5 filiais da WAP têm ISPs
   diferentes; o que medi é o tempo de resposta do servidor visto de uma máquina, não o tempo até a
   tela de quem trabalha em Linhares.
2. **Concorrência real não foi exercida.** Todas as medições são sequenciais, de um cliente só. Não
   sei o que acontece com 15 pessoas navegando ao mesmo tempo, nem se a instância `gru1` tem o
   mesmo comportamento de cold start sob carga.
3. **A superfície do VISUALIZADOR por senha não foi medida em produção.** O
   `VIEW_SESSION_SECRET` do `.env.local` desta máquina difere do de produção, então o cookie que o
   harness assina é recusado lá (as 4 linhas aparecem como **307** nos dois arquivos de produção —
   antes e depois, portanto comparáveis entre si, mas medindo o redirect e não a página). A medição
   real dessa superfície foi feita contra o `next start` local, onde o segredo confere e as 4 rotas
   respondem 200.
4. **O A/B da Frente C tem um viés que eu medi e declaro:** numa das duas execuções o controle
   `/ajuda` derivou −10%, porque o servidor "depois" já tinha servido a execução anterior e estava
   mais aquecido. Por isso a leitura honesta é a normalizada pelo controle, e não o número bruto.
   C1 fica com ganho **pequeno** (−1,6% a −5,4%), consistente em direção nas duas execuções, e
   apoiado no fato estrutural verificável no diff.
5. **A medição final tem variação de rodada.** Comparada com a medição só-da-região (feita ~1 h
   antes), algumas rotas aparecem levemente mais lentas — `/relatorios/geral` 499 → 567 ms. Isso é
   variação entre execuções e tráfego real de produção, não regressão da Frente C: o controle
   estático também subiu no mesmo intervalo (12,9 → 15,7 ms). Os p95 de `/ativos` e `/itens`
   (1.037 e 1.090 ms) carregam um outlier cada — com 11 amostras, o p95 é praticamente o máximo.
6. **Não sei o efeito no custo da Vercel.** O argumento de que a duração faturada de função **cai**
   (menos tempo bloqueado em rede) é uma dedução, não uma medição — não abri o painel de billing.
7. **A régua B8 continua sem teste automatizado.** Não a toquei, então não a quebrei; mas também
   não a cobri.
8. **O ganho da Frente C não é separável do da Frente B na tabela final.** A tabela §1 compara o
   baseline com o estado final; a separação entre os dois efeitos vem das medições intermediárias
   (`docs/perf/b1-regiao-gru1-producao.json`) e do A/B intercalado, não dela.

---

## 9. Pendências e backlog novo

| # | Item | Por quê |
|---|---|---|
| 1 | **Os ~72 ms de `chave_identidade_ativo()` por navegação** continuam lá | O índice funcional não resolve (§3). Destravar exige reescrever a view ou materializar a chave numa coluna gerada em `ativos` — mudança de modelo do acervo, fora desta ordem |
| 2 | Régua B8 sem teste automatizado | 119 arquivos `*.test.ts`, zero cobertura de `last_sign_in_at`/expiração |
| 3 | `/relatorios/[filial]` lê `filiais` duas vezes | Fechar exige mudar a assinatura do motor do relatório — churn de API por ~5 ms |
| 4 | `getSaldosPorFilial` dispara 6 RPCs por abertura de `/itens` | Já paralelo; reduzir exige RPC nova (função de negócio, fora desta ordem) |
| 5 | `lerEstadoAtivos` pagina em 2 idas sequenciais (1.654 ativos > teto de 1.000 do PostgREST) | Cresce com o acervo; uma 3ª ida a cada ~1.000 ativos novos |
| 6 | `multiple_permissive_policies` em `pendencias_item.UPDATE` | Recusado nesta fase (§3); reabrir só com número que justifique |
| 7 | Forms grandes de cliente (`nova-movimentacao-form.tsx`, 60 KB) dominam as rotas pesadas | Refatoração de forma, explicitamente fora desta ordem |
| 8 | Recharts sob `dynamic()` | Colide com o snapshot congelado (§2, Frente E) |
| 9 | `fronteira-rsc.test.ts` instável sob IO pesado no OneDrive | §6 |
| 10 | `Heap Fetches = 1200/1654` em `ativos_filial_status_idx` sugere autovacuum atrasado | Observado no `EXPLAIN`; não é migration |
| 11 | Cargo `consulta` e visualizador não exercitados clique a clique | §7 |
| 12 | `ViewerAutoRefresh` dispara `router.refresh()` a cada 60 s por aba aberta | Cada refresh reexecuta o proxy; um monitor esquecido num relatório paga isso 1.440×/dia |

---

## 10. Commits da fase

```
bdb173d  fix(f33): a promise órfã do motor do relatório e o cache no relatório do harness
1100603  perf(f33): reverte C4 e C5 — o Next já deduplicava as duas leituras
835f94e  perf(f33): frente D — índices de movimentacoes e InitPlan na policy
81709a6  perf(f33): frente C — sete deduplicações na conversa com o banco
58074f0  perf(f33): a medição do B1 — -65% a -74% de TTFB em produção
02b640a  perf(f33): as funções renderizam em São Paulo, ao lado do banco
8d071eb  perf(f33): frente A — harness de medição, baseline e o mapa
4f2add0  docs(f33): a ordem de serviço da fase
```

Atas completas em [`docs/DECISOES.md`](DECISOES.md) (oito entradas, 10/08/2026) · plano e mapa em
[`docs/PLAN-F33.md`](PLAN-F33.md) · evidências em `docs/perf/`.
