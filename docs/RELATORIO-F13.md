# RELATÓRIO F13 — correções em produção

**Ordem:** `docs/prompts/F13-ultracode.md` · **Data:** 23/07/2026 · **Branch:** `main` (commit direto, decisão do Johnny nesta ordem)

Quatro defeitos relatados pelo Johnny, sem stack trace nem print. O diagnóstico fazia parte da ordem — e mudou o enquadramento: **dois dos quatro eram o mesmo defeito**, e esse defeito era muito maior do que os sintomas relatados.

> **Nenhum dado real neste documento.** Patrimônios, nomes, e-mails, service tags e hostnames nunca aparecem: as verificações reportam contagem, status HTTP e nome de chunk. Exemplos, quando necessários, são fictícios (`WAP0001234`, "Fulano").

---

## 1. Resumo em uma tela

| # | Sintoma relatado | Causa raiz | Situação |
|---|---|---|---|
| **B1** | "Criar usuário novo está entrando em página de erro" | `export type { … }` num módulo `'use server'` mata o módulo na avaliação → o POST do "Gerar link" responde 500 e a rejeição apaga a tela | **corrigido** |
| **B2** | Busca de ativos da nova movimentação nunca encontra nada | **o mesmo defeito** — a action de busca morre junto, e o `try/catch` dela degrada para lista vazia | **corrigido** |
| **B3** | O "?" leva a `/ajuda` mas fica no topo | o App Router rola enquanto o `loading.tsx` está na tela, não acha a seção, e desiste para sempre | **corrigido** |
| **B4** | Responsivo mobile quebrado | dois padrões de layout com causa única cada (barra de filtros que colapsa; filho de grid sem `min-w-0`) | **corrigido** — matriz na §6 |

**E o achado que a ordem não previa:** o defeito de B1/B2 não atingia três rotas — atingia **todo o grupo `(app)`**. Desde **22/07 18:50 UTC**, **nenhuma escrita do sistema funcionava em produção**, incluindo a entrada do visualizador por senha. Detalhe medido na §3.

---

## 2. O que este relatório NÃO prova

Lista honesta, antes das evidências — para que ninguém leia mais do que está escrito.

1. **O B1 fim a fim nunca foi executado, em ambiente nenhum.** Sem a chave `service_role` do projeto de ensaio (leitura barrada pelo classificador do modo autônomo), `generateLink` não roda em DEV. Logo: a emissão do link de convite, a emissão do link `recovery` de reenvio e o consumo de um token **verdadeiro** não foram exercitados. Está provado que o POST do "Gerar link" **morria** e que agora **não morre mais**; **não** está provado que o convite conclui. Roteiro para o Johnny fechar isso: §8.
2. **O B3 não deixa rastro em log.** Posicionamento de scroll não é registrado em lugar nenhum e a ordem proíbe E2E em produção. A confirmação final é um clique.
3. **O comportamento em produção do B4 é inferido do DEV.** O CSS é o mesmo do build, mas os números de geometria vieram do `next dev`.
4. **As medições de DEV foram feitas contra uma cópia dos dados reais**, não contra o seed fictício que a ordem pedia — as três saídas para trocar a base foram barradas (§7). Nenhuma saída, log ou screenshot carrega conteúdo de linha, mas a base **não** era fictícia.
5. **A correção ressuscita, de uma vez, todas as Server Actions do app** — inclusive tudo que a F11 e a F12 entregaram **depois** de 22/07 18:50 e que, portanto, **nunca rodou em produção**: kits de movimentação, estoque mínimo, colar lote, carrinho multi-item, ordenação por coluna. Essas funcionalidades passaram no lint, nos testes e no smoke, mas nunca foram exercitadas de verdade por um usuário. **Pode haver uma segunda leva de defeitos até agora mascarada.** Nenhum diagnóstico desta ordem cobre isso.
6. **`/relatorios/gerados/[id]` não foi medido no B4**: o banco de ensaio não tem snapshot gerado.
7. **O shell do visualizador por senha não foi renderizado** (a sessão por senha não completa sem `service_role`). O corpo do relatório — que é o mesmo componente — foi medido logado como operador.
8. **O `error.tsx` novo tem um ponto cego** (limitação do modelo de error boundary do Next, não regressão): ele é renderizado **dentro** do `(app)/layout.tsx`, então um `throw` no **render do próprio layout** — onde vive o vetor do B1, a paleta `Ctrl+K` — não é capturado por ele e ainda vaza para a página crua padrão do Next (não há `src/app/error.tsx` nem `src/app/global-error.tsx`). Isso **não** afeta o B1 corrigido: o vetor não lança no render do layout (o GET responde 200; era o POST da action que morria). Fechar esse buraco de vez (um `src/app/global-error.tsx`) fica como backlog.

---

## 3. B1 + B2 — um defeito só, e o apagão que ninguém tinha visto

### 3.1 A linha

`src/lib/actions/movimentacoes.ts` é um módulo `'use server'`. Desde a F10 (commit `0552f25`, 22/07 15:49 UTC) ele re-exportava dois tipos assim:

```ts
export type { ParMovimentacaoDia, PossivelDuplicataDia }
```

O comentário ao lado justificava a linha com "`export type` é apagado na compilação". Verdade para o TypeScript. **Falso para o transform de Server Actions do Turbopack**, que nessa forma — re-export **com especificadores** — ignora o `type`.

### 3.2 A prova, no artefato

Chunk `.next/server/chunks/ssr/src_lib_054oi_m._.js` do build de produção — **o mesmo nome de chunk que aparece na stack de produção**:

```js
(0,a.i(13095).ensureServerEntryExports)([l,m,n,p,q,r,s,t,u,ParMovimentacaoDia,PossivelDuplicataDia])
(0,b.registerServerReference)(ParMovimentacaoDia,"7fcb69477c3668d0ace86d55e7e4d8cc4c325f7245",null)
(0,b.registerServerReference)(PossivelDuplicataDia,"7fc81235c4d74cc2f478e019ae81108df9dafd1992",null)
```

`l,m,n,p,q,r,s,t,u` são as nove Server Actions minificadas. Os dois últimos **não têm binding nenhum** no chunk — o `import type` foi corretamente apagado, o `export type {}` não. Varredura de **todos** os chunks SSR do build (`scratchpad/f13/check-bindings.mjs`):

```
src_lib_202ttd6._.js                 A                      binding OK (4 ocorrencias)
[root-of-the-server]__21325hq._.js   L                      binding OK (6 ocorrencias)
[root-of-the-server]__21325hq._.js   P                      binding OK (4 ocorrencias)
[root-of-the-server]__21325hq._.js   Q                      binding OK (4 ocorrencias)
[root-of-the-server]__21325hq._.js   R                      binding OK (4 ocorrencias)
[root-of-the-server]__21325hq._.js   S                      binding OK (5 ocorrencias)
src_lib_054oi_m._.js                 ParMovimentacaoDia     *** SEM BINDING *** (2 ocorrencias)
src_lib_054oi_m._.js                 PossivelDuplicataDia   *** SEM BINDING *** (2 ocorrencias)
```

Exatamente dois. E o grep de `^export (type )?{` em **todos** os arquivos `'use server'` do `src/` devolve **uma** linha — a 35.

### 3.3 A prova, em produção

Erro agrupado (Vercel, 7 dias, `prj_sUTqyUqhj7ZwGv8h5CAXMnpbU3fb`):

```
ReferenceError: ParMovimentacaoDia is not defined
count=33 users=2 routes=/itens, /movimentacoes/nova, /admin/usuarios
first=2026-07-22T18:50:07Z last=2026-07-23T14:51:36Z
```

Nas últimas 24h do deploy vigente houve **391 respostas 200, 44 redirects e apenas 3 respostas 500**. Os três 500 são:

```
14:51:36 POST /admin/usuarios     500 [error/serverless-middleware]  digest '1379320566'
14:51:05 POST /movimentacoes/nova 500 [error/serverless]             digest '1379320566'
14:51:03 POST /movimentacoes/nova 500 [error/serverless]             digest '1379320566'
  ReferenceError: ParMovimentacaoDia is not defined
      at module evaluation (.next/server/chunks/ssr/src_lib_054oi_m._.js:1:16960)
      ...
      at module evaluation (.next/server/chunks/ssr/_next-internal_server_app_(app)_movimentacoes_nova_page_actions_1-w5z_u.js:1:123)
```

**Todos POST** — invocação de Server Action —, e **o mesmo digest**. Os carimbos 14:51:03/05 são a busca (B2) e 14:51:36 é o convite (B1), com 33 segundos de intervalo: são os dois sintomas do relato, um atrás do outro, com a mesma causa.

Por que os desfechos diferem: a busca tem `try/catch` que degrada exceção para lista vazia — o combobox pinta "Nenhum ativo encontrado", indistinguível de "não existe". O convite não tinha — a rejeição subiu pelo `startTransition` e, sem error boundary na raiz do grupo, apagou a tela.

### 3.4 O alcance real: 11 dos 16 manifestos

O quadro `_next-internal_server_app_(app)_..._page_actions_...` na stack é o **manifesto de Server Actions da rota**. Medindo quais manifestos carregavam o módulo envenenado:

```
rota                                   | carrega o modulo envenenado
---------------------------------------|----------------------------
(app)                                  | SIM  <-- morria
(app)/admin/senhas                     | SIM  <-- morria
(app)/ajuda                            | SIM  <-- morria
(app)/ativos                           | SIM  <-- morria
(app)/ativos/[id]                      | SIM  <-- morria
(app)/movimentacoes                    | SIM  <-- morria
(app)/movimentacoes/nova               | SIM  <-- morria
(app)/pendencias                       | SIM  <-- morria
(app)/relatorios/acesso                | SIM  <-- morria
(app)/relatorios/gerados               | SIM  <-- morria
(app)/relatorios/gerados/[id]          | SIM  <-- morria
/global-error                          | nao
/not-found                             | nao
auth/confirm                           | nao
auth/definir-senha                     | nao
login                                  | nao
```

O vetor é a paleta `Ctrl+K` entregue na F11: `src/app/(app)/layout.tsx` monta `PaletaComandosProvider`, que importa `buscarAtivosParaMovimentacao`. Como está no **layout**, o módulo entrou no manifesto de **toda** rota do grupo.

A progressão confirma a cadeia nos próprios logs: no deploy do merge da F10 (antes da paleta) o erro só aparecia em `/movimentacoes/nova` (24 ocorrências); a partir do merge da F11 passam a aparecer `/itens` e `/admin/usuarios`.

E o manifesto de `/relatorios/acesso` registra, lado a lado:

```
c.buscarAtivosParaMovimentacao   ← o módulo envenenado
d.entrarComSenha                 ← a porta do visualizador por senha
```

**Conclusão medida:** de 22/07 18:50 UTC até esta ordem, **nenhuma escrita do sistema funcionava em produção** — nem registrar movimentação, nem cadastrar ativo, nem administrar, nem importar, nem o gestor entrar nos relatórios por senha. O GET de todas essas rotas continuava respondendo 200, e é por isso que o sintoma chegou como "quatro buginhos".

### 3.5 A correção

Alias inline, que o transform apaga corretamente. **Um arquivo**, contrato público do módulo intacto:

```diff
-  type ParMovimentacaoDia,
-  type PossivelDuplicataDia,
+  type ParMovimentacaoDia as ParMovimentacaoDiaQuery,
+  type PossivelDuplicataDia as PossivelDuplicataDiaQuery,
 } from '@/lib/queries/movimentacoes'

-export type { ParMovimentacaoDia, PossivelDuplicataDia }
+export type ParMovimentacaoDia = ParMovimentacaoDiaQuery
+export type PossivelDuplicataDia = PossivelDuplicataDiaQuery
```

O comentário no lugar da linha antiga explica **por que a forma importa** — quem ler daqui a seis meses precisa entender que `export type { A }` é proibido ali e `export type A = B` não é.

### 3.6 Por que passou por lint, 870 testes, build, `next dev` e pelo smoke

| Sinal | Por que não pegou |
|---|---|
| `npm run lint` | o TypeScript aceita a forma; nenhuma regra a proíbe |
| `npm run test` (870) | testa função pura; o defeito nasce no empacotamento |
| `npm run build` | compila o chunk, **não o avalia** |
| `npm run dev` | empacota de outro jeito e **não reproduz** — medido: 10/10 rotas 200 |
| smoke F12 (parte A) | checa rota **sem** sessão: o proxy redireciona antes de rotear |
| smoke F12 (parte B) | fala direto com o PostgREST, sem passar pelo app |
| smoke F13 (parte C, nova) | **também não pegaria**: as rotas afetadas respondem **200 no GET** |

Foi por isso que o defeito viveu ~20h em produção com todos os sinais verdes.

### 3.7 As duas guardas novas

**Fonte** — `src/lib/use-server-exports.ts` + teste: função pura que lista os exports de topo que o transform registraria como valor (especificadores, `export *`, `const/let/var/class/enum`, função síncrona). O teste varre de verdade todos os arquivos `'use server'` de `src/`. **Prova de que pega o defeito real**, rodada antes da correção:

```
antes:  Test Files 1 failed (1) | Tests 1 failed | 41 passed (42)
        → apontando `linha 35 [especificadores]`
depois: Test Files 1 passed (1) | Tests 42 passed (42)
```

**Artefato** — `scripts/verificar-actions-build.mjs`: varre os chunks do build e falha se algum identificador for registrado como Server Action sem binding. É o gate antes do push:

```bash
npm run build && node scripts/verificar-actions-build.mjs
```

**Correção de fato sobre a §1.5-B2 da ordem:** o log a vigiar em produção é `ReferenceError: ParMovimentacaoDia is not defined`, **não** `[buscarAtivosParaMovimentacao]`. Esse `console.error` nunca chegou a rodar — o módulo morria antes do `catch`.

### 3.8 Verificação funcional, no build que reproduz o defeito

O `next dev` nunca reproduziu, então a verificação foi feita contra `next start` sobre o build de produção, isolado no ensaio:

```
ambiente      : sb-sgmvldiizsrjbxzzpmhh-auth-token
base          : http://localhost:3013 (build de PRODUCAO, next start)

busca "****" (4 chars) -> 12 resultado(s) · "Nenhum ativo encontrado" visivel: false
busca "***" (3 chars) -> 12 resultado(s) · "Nenhum ativo encontrado" visivel: false
busca "**" (2 chars) -> 12 resultado(s) · "Nenhum ativo encontrado" visivel: false

GET /                      -> 200
GET /ativos                -> 200
GET /itens                 -> 200
GET /pendencias            -> 200
GET /ajuda                 -> 200
GET /admin/usuarios        -> 200
GET /relatorios/acesso     -> 200

NENHUM 5xx e NENHUM pageerror ✔
```

E o gate do build:

```
[gate] chunks com Server Actions varridos: 248
[gate] VERDE — nenhum identificador registrado sem binding.
```

---

## 4. Segurança — achado fora dos quatro bugs, corrigido

`src/app/auth/definir-senha/page.tsx` tinha `<form onSubmit={…}>` **sem `action` e sem `method`**, com `<Input name="senha">` e `name="confirmacao"`.

O `preventDefault()` do `onSubmit` só existe **depois da hidratação**. Um clique ou Enter antes disso dispara o submit **nativo** e, sem `method`, o padrão do HTML é **GET**: a senha ia para a query string da própria URL — histórico do navegador, header `Referer` e log de acesso da Vercel.

Corrigido com `method="post"` (que cobre inclusive gerenciador de senhas chamando `form.submit()`, o que ignora o `onSubmit`) e botão de submit desabilitado até hidratar, lido por `useSyncExternalStore` — com o botão desabilitado o navegador também não submete pela submissão implícita do Enter.

Verificado com `javaScriptEnabled: false`, que é exatamente o DOM pré-hidratação:

```
HTML servido traz <form method="post"> : true
botão vem DESABILITADO                 : true
URL depois do CLIQUE sem JS            : http://localhost:3013/auth/definir-senha   (sem `senha=`)
URL depois do ENTER  sem JS            : http://localhost:3013/auth/definir-senha   (sem `senha=`)
```

---

## 5. B3 — a âncora da ajuda

### 5.1 Causa

Em navegação client-side com hash para **outra** rota, o App Router (Next 16.2.10) executa o scroll enquanto a `/ajuda` ainda mostra o skeleton do `loading.tsx`. As `<section id>` não existem, `getElementById` devolve `null`, o Next cai no nó do próprio segmento — a raiz do skeleton — e, como o hash continua *truthy*, rola até lá. Em seguida marca o hash como consumido: quando o stream chega e as seções montam, ele **não tenta mais**.

Instrumentação do `getElementById` e do `scrollIntoView` (clique no "?" de `/admin/importar`):

```
getElementById observados (so os do hash):
[ { "id": "admin", "achou": false, "t": 2169, "secoes": 0, "skeletons": 22 } ]

scrollIntoView chamados:
[ { "tag": "DIV", "id": null, "cls": "space-y-6 print:hidden", "secoes": 0, "skeletons": 22 } ]
```

`DIV class="space-y-6 print:hidden"` é o nó raiz de `src/app/(app)/ajuda/loading.tsx`.

Matriz dos 8 pontos de uso — **A** = clique no "?", **B** = URL aberta direto em aba nova:

| origem | âncora | A.scrollY | A.ok | B.scrollY | B.h2Top | B.ok |
|---|---|---|---|---|---|---|
| `/movimentacoes` | movimentacoes | 0 | ✗ | 1241 | 112 | ✓ |
| `/movimentacoes/nova` | movimentacoes | 0 | ✗ | 1241 | 112 | ✓ |
| `/pendencias` | pendencias | 0 | ✗ | 4313 | 112 | ✓ |
| `/relatorios/geral` | relatorios | 0 | ✗ | 4700 | 112 | ✓ |
| `/itens` | itens | 0 | ✗ | 3217 | 112 | ✓ |
| `/ativos` | status | 0 | ✗¹ | 451 | 112 | ✓ |
| `/ativos/novo` | como-fazer | 0 | ✗ | 5150 | 112 | ✓ |
| `/admin/importar` | admin | 0 | ✗ | 9962 | 112 | ✓ |

¹ a 1280×900 o `h2` de `#status` cabia por coincidência de viewport; a 360×740 o mesmo caso falha. **8/8 quebradas.**

As **âncoras estavam todas certas** — as 8 existem em `SECOES`, e o `LinkAjuda` não mudou. A coluna B (`h2Top=112`, que é o próprio `scroll-mt-28`) mostra que o `scroll-mt` também estava correto.

### 5.2 Correção

`<AncoraAoMontar>` — client component sem UI que monta no **mesmo commit** das seções e cobre só esse buraco. Só no mount, então os chips do sumário e o back/forward intra-página seguem 100% nativos; a guarda pela própria `scroll-margin-top` da seção o torna no-op quando a URL foi aberta direto (e idempotente sob StrictMode). `resolverAncora()` é função pura, com **lista branca** vinda de `SECOES` — o hash é entrada do usuário e viraria seletor de DOM — e casamento case-sensitive, a mesma regra do `getElementById`.

De brinde: o **forward do histórico** depois do "?", que estava quebrado pela mesma causa, volta a posicionar.

---

## 6. B4 — responsivo

Não havia "responsivo quebrado" difuso: eram **dois padrões de layout**, cada um com causa única, mais três ajustes de alvo de toque. Correção mínima, sem redesenho, `src/components/ui/**` intocado.

### 6.1 As duas causas

**R1 (P0) — a busca das listas colapsava.** O form da busca era `flex-1` (= `flex: 1 1 0%`, basis 0) dentro de um `flex flex-wrap`. O basis 0 não reservava espaço: o flexbox empacotava o form na mesma linha dos selects de largura fixa, o espaço livre ficava negativo e o input colapsava para ~44px, desenhado **por cima** do vizinho — em `/ativos`, `/movimentacoes`, `/itens` e `/pendencias`, em **toda largura < 1280px**. Correção: `grow basis-full xl:basis-0` (mantendo `min-w-0` e `sm:max-w-*`), uma classe em cada um dos 4 filtros.

> Nota que corrige a proposta do diagnóstico: `basis-full flex-1` (literal do D4) seria **no-op** — no CSS gerado o shorthand `flex` vem depois de `basis-*` e reescreve o basis para 0. Daí `grow` no lugar de `flex-1`. E `xl:` (não `sm:`) porque a 768/1024 o campo ainda colapsava. Input medido: 44 → 233px (360) / 287px (414) / 353px (768/1024); **1280 byte-idêntico ao baseline**.

**R2 (P0 mobile / P1 a 768) — o grid do relatório empurrava o documento.** As tabelas de item têm `th/td` com `whitespace-nowrap` (`ui/table.tsx`), logo min-content grande. O filho do grid, sem `min-w-0`, resolvia `min-width:auto` para ~532px numa trilha `1fr` de 480px → o **documento** ganhava scroll horizontal ao expandir um grupo. Correção: `min-w-0` no `cn()` da `<section>` de `card-relatorio.tsx` (1 linha, cobre os 4 grids). O scroller correto (`overflow-x-auto`, que a própria `Table` já tem) passa a funcionar sozinho. `ui/table.tsx` e o `whitespace-nowrap` **não** foram tocados.

### 6.2 Matriz rota × largura

`OK` = já passava; `corrigido` = estourava/colapsava e agora passa; nenhuma célula ficou pendente.

| Rota | 360 | 390 | 414 | 768 | 1024 | 1280 |
|---|---|---|---|---|---|---|
| `login` · `auth/confirm` · `auth/definir-senha` | OK | OK | OK | OK | OK | OK |
| `relatorios/acesso` (operador→geral) | OK | OK | OK | corrigido | OK | OK |
| `/` (dashboard) | OK | OK | OK | OK | OK | OK |
| `/ativos` (e com filtros na URL) | corrigido | corrigido | corrigido | corrigido | corrigido | OK |
| `/ativos/novo` · `/ativos/[id]` | OK | OK | OK | OK | OK | OK |
| `/movimentacoes` | corrigido | corrigido | corrigido | corrigido | corrigido | OK |
| `/movimentacoes/nova` (wizard) | OK | OK | OK | OK | OK | OK |
| `/itens` | corrigido | corrigido | corrigido | corrigido | corrigido | OK |
| `/pendencias` | corrigido | OK | corrigido | OK | OK | OK |
| `/ajuda` | OK | OK | OK | OK | OK | OK |
| `/relatorios/geral` (grupos expandidos) | corrigido | corrigido | corrigido | corrigido | OK | OK |
| `/relatorios/<filial>` (e matriz) | corrigido | corrigido | corrigido | corrigido | OK | OK |
| `/relatorios/gerados` | OK | OK | OK | OK | OK | OK |
| `/relatorios/gerados/[id]` (snapshot)¹ | corrigido | corrigido | corrigido | corrigido | OK | OK |
| `/admin/*` (7 telas) | OK | OK | OK | OK | OK | OK |

¹ O ensaio não tinha snapshot; o C4 gerou **um** pelo fluxo real do app **só no ensaio** (insert aditivo/imutável, nunca produção) para medir — herda o mesmo `CardRelatorio`.

**Estouros do documento após a correção: 0** em 29 rotas × 6 larguras, logado e deslogado. Prova da rolagem interna a 360px com grupos expandidos: tabela `client=292 / scroll=488 / rolaInterno=true`, documento não estoura.

### 6.3 Alvos de toque e um bug pré-existente corrigido de passagem

Toggle de grupo do relatório 28→40px (`size-10`, `md:hidden` → desktop inalterado) e chips-âncora 26→40px no mobile (`min-h-10 sm:min-h-0`). Engordar os chips subiu a nav sticky mobile, então as 7 seções-alvo passaram de `scroll-mt-16` para `scroll-mt-28` — o que **também conserta um defeito que já existia em todas as larguras**: o `h2` da âncora do relatório pousava atrás da barra sticky (`h2Top=64 < fundoSticky=96`; agora 112 ≥ 96). É a única mudança visível no desktop, e ela **é** a correção (aceite §1.5-B4 vii). Nos 4 dialogs sem teto: `max-h-[calc(100svh-2rem)] overflow-y-auto`.

**Backlog registrado** (fora do "sem redesenhar"): outros alvos < 40px pré-existentes (cabeçalhos de ordenação, paginação, stepper do wizard, senha de `/relatorios/acesso`); navs roláveis sem affordance de rolagem. Nenhum é o defeito relatado.

---

## 7. Verificações — saídas reais

### 7.1 União (antes do push)

```
npm run lint  →  (limpo, 0 problemas)
npm run test  →  Test Files 44 passed (44) · Tests 925 passed (925)   [baseline F12: 42 / 870]
npm run build →  verde
node scripts/verificar-actions-build.mjs →
    [gate] chunks com Server Actions varridos: 16
    [gate] VERDE — nenhum identificador registrado sem binding.
```

Os +55 testes: `use-server-exports.test.ts` (guarda de fonte), `ancora.test.ts` (B3) e o ajuste do teste de ajuda.

### 7.2 Smoke de produção — baseline (antes do deploy)

```
PARTE A — sem sessão:  16/16 OK
PARTE B — logado:      contagens e shapes OK · busca do combobox (B2): 12 resultado(s) · shape ok
PARTE C — rotas do app COM sessão (nova):  14/14 · HTTP 200
RESUMO · 50 OK · 1 aviso · 0 falha · exit 0
```

O aviso (1) é o de sempre: a RLS de `kits_modelos` não é "comprovável" com a tabela vazia (o operador vê 0, o anon vê 0). Não é regressão.

### 7.3 O que a parte C **não** cobre (registrado no smoke e aqui)

A parte C nova faz **GET** autenticado. O defeito B1/B2 estava no **POST** de Server Action, e as rotas afetadas respondem 200 no GET (medido). Então nem a parte C teria pego este incidente. Quem pega é a guarda de fonte (`use-server-exports`) e o gate de build. A parte C ainda vale: pega uma rota logada que quebre no render (outra classe de defeito).

### 7.4 Rollout — deploy e smoke pós-deploy

- **Push único** na `main` (commit `e41dbe8`) → deploy `dpl_2Xo2KGADKZHJaeUqsBXAstAX1pm1` **READY**, apontado pelo alias de produção.
- **Smoke pós-deploy** (`--exigir-f12`): **50 OK · 1 aviso · 0 falha · exit 0** — idêntico ao baseline, com o check da busca do B2 verde e as 14 rotas logadas em 200.
- **Prova de que o apagão acabou** (o defeito era POST-only, invisível ao GET): os **logs de runtime do novo deploy** registram **30× 200, 14× 307, 1× 404** (o 404 é uma sonda minha com o id de action do build local, que difere por build) e **zero 500**; e `get_runtime_errors` do projeto na última hora retorna **"No runtime errors found"** — o cluster `ReferenceError: ParMovimentacaoDia` (33 ocorrências, última às 14:51) **não teve nenhuma ocorrência nova** após o deploy. Somado ao gate de build (0 bindings fantasma) e à prova funcional local no `next start` (§3.8), o defeito está estruturalmente eliminado.
- **Por que não forcei um POST de action contra produção:** o id de Server Action muda por build (o do build local deu 404 em produção) e brute-forçar todos os ids do manifesto arriscaria disparar uma **escrita** — a ordem manda produção só-leitura. A confirmação direta do POST fica com o clique do Johnny (§8) e com o próprio tráfego de operação, que a partir de agora exercita os POSTs sob o log vigiado.

---

## 8. O que o Johnny precisa fazer depois do deploy

O aceite §1.5-B1 fim a fim é impossível neste ambiente (sem `service_role`, o convite não emite link em DEV). Depois do deploy, **sem criar usuário de teste**:

1. **B1 — validação amigável:** `/admin/usuarios` → "Convidar usuário" → digitar um e-mail **fora do domínio** (ex.: `fulano.teste@gmail.com`). Esperado: o botão "Gerar link" continua desabilitado, com a mensagem inline sobre os domínios aceitos, e **nenhuma página de erro**.
2. **B1 — convite real:** trocar para o e-mail de quem você já precisa convidar de verdade → "Gerar link". Esperado: o link aparece **no próprio diálogo** (sem página de erro). Copiar, abrir noutro navegador, "Ativar meu acesso", definir a senha, cair no dashboard. *Este é o passo que nenhum ambiente disponível conseguiu exercitar — é a confirmação que fecha o B1.*
3. **B2:** `/movimentacoes/nova` → buscar um ativo por um pedaço do patrimônio. Esperado: a lista aparece (antes: "Nenhum ativo encontrado" sempre).
4. **B3:** o "?" de qualquer tela → a página de ajuda abre **já posicionada** na seção certa (antes: no topo).
5. **B4:** abrir o sistema no celular — as listas (`/ativos`, `/movimentacoes`, `/itens`, `/pendencias`) e o relatório não têm mais rolagem lateral, e o campo de busca ocupa a largura toda.

E, pelo motivo da §2 item 5: **exercitar as funcionalidades da F11 e F12** (kits, estoque mínimo, colar lote, carrinho), que nunca rodaram de verdade em produção porque toda escrita estava morta desde 22/07.
