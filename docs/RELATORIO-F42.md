# Relatório da F42 — as telas: itens deixou de ser a exceção

**Executada em 31/08/2026**, em modo autônomo, da ordem
[`docs/prompts/F42-telas-itens-ultracode.md`](prompts/F42-telas-itens-ultracode.md), sobre o plano
[`docs/PLAN-F42.md`](PLAN-F42.md) e a §6 do [`docs/PLANO-ITENS.md`](PLANO-ITENS.md).

**Versões publicadas: `v1.47.0` (a fase), `v1.47.1` (uma correção que não pegou) e `v1.47.2` (a que
pegou).** As três estão no ar, mergeadas na `main`, com tag anotada. **Nenhuma migration.**

> **Este relatório conta um erro que chegou a produção.** A fase entrou no ar com um defeito, a
> primeira correção partiu de um diagnóstico errado e também foi publicada, e só a segunda resolveu.
> O §9 conta isso inteiro, porque é a parte com mais a ensinar — e porque o rastro vale mais que a
> aparência de acerto.

---

## 1. O que a fase entregou

| Frente | Entrega |
|---|---|
| **A** | `/itens` reescrita no casco da F40: filtros + **uma** tabela + **uma** paginação — que agora pagina os **itens**. Coluna nova **"Em uso"**, derivada. A comparação entre filiais virou **linha expansível**; o toggle `?visao=` morreu. CSV de saldos unificado. |
| **B** | **`/itens/historico`** — rota própria com `page`/`loading`/`error`, e o filtro de **filial** que antes vinha emprestado dos saldos. Link antigo redireciona preservando o recorte. |
| **C** | `lancar-item-dialog` **893 → 637** linhas, com a **prévia da regularização** antes de gravar. `transferir-item-dialog` **457 → 424**, reusando o carrinho compartilhado. |
| **D** | Selo **"regularizado"** na ficha do ativo · `/itens/conferencia` no casco · subrotas no menu, na paleta e no mapa das telas · ajuda reescrita · smoke · `capturar.mjs` · versão e documentação. |

11 commits, **63 arquivos**, +4.826 −1.734 linhas.

---

## 2. A régua do design system — antes e depois

**Medição inicial** (passo 2 da linha de base: `PENDENTES` sem `'src/app/(app)/itens/'` e
`'src/components/itens/'`, com o código de v1.46.0):

```
Test Files  1 failed (1)
     Tests  30 failed | 428 passed (458)
```

**88 linhas de violação únicas**, em 4.312 linhas de superfície de itens, distribuídas assim:

| regra | testes vermelhos |
|---|---:|
| 1 · título de tela sai do cabeçalho | 2 |
| 2 · só o casco limita largura | 1 |
| 3 · espaçamento na escala | 5 |
| 5 · tipografia e larguras na escala | 6 |
| 6 · moldura vem de `Card` | 8 |
| 7 · rota migrada usa `<Pagina>`/`<CabecalhoDaPagina>` | 5 |
| 8 · o esqueleto declara a mesma largura | 2 |
| inventário de rotas migradas | 1 |

**Depois:**

```
npx vitest run src/lib/layout/consistencia.test.ts
 Test Files  1 passed (1)
      Tests  458 passed (458)
```

**88 → 0.** E o diff do teste mostra que as três travas do piloto foram **atualizadas para a verdade
nova, não afrouxadas**:

```diff
-  it('o varredor achou as rotas do grupo, e 3 delas estao migradas', () => {
-    // 29 no grupo protegido; as outras 3 das 32 do inventário são as PORTAS
+  it('o varredor achou as rotas do grupo, e 6 delas estao migradas', () => {
+    // 30 no grupo protegido; as outras 3 das 33 do inventário são as PORTAS
     // públicas (`/login`, `/auth/confirm`, `/auth/definir-senha`), que ficam fora
     // de `(app)` e são matéria do `CascoDeAutenticacao`, na frente d.
-    expect(ROTAS.length).toBe(29)
+    //
+    // F42 — 29 virou 30: `/itens/historico` nasceu nesta fase (o histórico de
+    // lançamentos saiu de dentro de `/itens` e ganhou rota própria). E as 3
+    // migradas viraram 6, com as três rotas de item.
+    expect(ROTAS.length).toBe(30)
     expect(ROTAS_MIGRADAS.map((r) => r.rota).sort()).toEqual([
       '/ativos',
       '/ativos/[id]',
       '/ativos/novo',
+      '/itens',
+      '/itens/conferencia',
+      '/itens/historico',
     ])
   })
```

E `PENDENTES` **só encolheu** — dois prefixos saíram, nenhum entrou:

```diff
   // ---- frente c · admin + itens -------------------------------------------
   'src/app/(app)/admin/',
-  'src/app/(app)/itens/',
   'src/components/admin/',
-  'src/components/itens/',
```

**A catraca de cor crua** desceu de **479 para 473** e a contagem de arquivos subiu de 59 para 61 —
as mesmas ocorrências, mais espalhadas (a tabela e os pedaços do diálogo viraram cinco componentes),
menos as que morreram com o banner âmbar da conferência virando `<Aviso intencao="atencao">`.

---

## 3. A tabela recurso-a-recurso (critério 4)

**Nenhuma linha acaba em "sumiu".** Duas linhas desta tabela existem porque a **revisão adversarial**
as apontou como perdidas, e foram corrigidas antes do merge (§8).

### Filtros

| Antes (em `/itens`) | Depois |
|---|---|
| Busca `q` ("Buscar item…") | `/itens` — igual |
| Filtro de filial (só na visão Consolidado) | `/itens` — **sempre visível e sempre valendo** · e `/itens/historico` ganhou o seu |
| Select "Grupo" | `/itens` — igual |
| Toggle "Consolidado / Por filial" (`?visao=`) | **linha expansível** por item. O param virou ruído ignorado; a URL antiga abre a tela |
| "Limpar" (saldos) | `/itens` — igual (preserva `pp`, como `/ativos`) |
| Histórico: busca `busca` | `/itens/historico` |
| Histórico: Select "Item" | `/itens/historico` |
| Histórico: Select "Tipo" | `/itens/historico` |
| Histórico: "De" / "Até" | `/itens/historico` |
| Histórico: "Limpar" | `/itens/historico` (agora limpa a filial também) |
| Histórico: recorte de filial **emprestado** | `/itens/historico` — **filtro próprio** ⚠ |

### Colunas — saldos

| Antes | Depois |
|---|---|
| Seção por grupo (`<h2>` com o título do grupo) | coluna **Grupo** (escondida abaixo de `md`) |
| Item · Total · Estoque | Item · Total · **Em estoque** |
| Atrelados | **Reservado saiu da tabela** (é 0 desde a F41). Continua no CSV, na linha expansível quando > 0, e na ajuda |
| Falta (selo "faltam N") | idêntico |
| selo "repor" junto do nome | idêntico |
| *(não existia)* | **Em uso** |
| *(não existia)* | **Tipo** (F37, escondida abaixo de `lg`) |
| visão por filial: coluna por filial + Total | **linha expansível**: uma filial por linha |
| tooltip da célula: `total · em estoque · reservado` da filial | linha expansível: **em estoque · em uso · no acervo · reservado (quando > 0)** ⚠ |
| "inclui N de filial desativada" | "inclui N em estoque de filial fora desta lista" |

### Colunas — histórico

Data · Item · Tipo · Qtd. · Filial · Chamado · Colaborador · Obs. · **Saldo após** · Ações →
**todas em `/itens/historico`**. A âncora do "Saldo após" (que vinha de graça da tabela de saldos que
dividia a tela) virou leitura própria — e **só** no caso raro de 1 item + 1 filial, que é quando a
coluna aparece.

### Ações e estados vazios

| Antes | Depois |
|---|---|
| `RealtimeRefresh` | `/itens` e `/itens/historico` |
| "Exportar saldos" | `/itens` — **um formato só**, superset dos dois |
| "Conferir estoque" | `/itens` (+ subitem de menu + `Ctrl+K`) |
| "Transferir item" | `/itens` |
| "Lançar" + `?lancar=1` + atalho `L` | `/itens` |
| "+" de lançar da linha | `/itens` — primeiro item do menu `⋯` |
| atalho de transferir da célula | `/itens` — na linha expansível, por filial |
| "Exportar histórico" | `/itens/historico` |
| "Estornar lançamento" | `/itens/historico` |
| paginação (do histórico) | `/itens/historico` — **e `/itens` ganhou a sua, dos itens** |
| "Nenhum item no catálogo" (+ ir para `/admin/itens`) | `/itens` |
| "Nenhum item com esses filtros" | `/itens` |
| **"Nenhum saldo nas suas filiais"** (+ "Ver todas as filiais") | `/itens` ⚠ |
| "Nenhum saldo ainda" | `/itens` |
| *(não existia)* | `⋯` → "Ver histórico deste item" |

### CSV de saldos

`Item · Grupo · **Tipo** · Filial · Total · Em estoque · **Em uso** · Reservado · Falta ·
<cada filial> · <cada filial> — faltam · Fora das colunas` — superset de `colunasSaldos` **e**
`colunasSaldosPorFilial`.

---

## 4. "Em uso" bate com o banco (critério 8)

A coluna **não existe no banco** e a fase **não tem migration**. `rel_saldo_itens` (`0027`) calcula
`liberados = greatest(0, Σsaida − Σretorno)` internamente e não o devolve; a tela o obtém das quatro
colunas que ela devolve:

```
em_uso = total + falta − em estoque − reservado
```

É **identidade algébrica**: `estoque` e `falta` são o mesmo clamp aplicado aos dois lados opostos de
`x = total − atrelados − liberados` (um é `max(0, x)`, o outro `max(0, −x)`), e `max(0,x) − max(0,−x)`
é identicamente `x`. Provado por teste caso a caso, mais uma varredura de 9×9×9 combinações.

**As duas contagens, lado a lado** (`SELECT` agregado, só números — regra 2):

| Banco | recorte | **derivado** (a coluna da tela) | **lido** (`Σsaida − Σretorno`) | itens divergentes | negativos |
|---|---|---:|---:|---:|---:|
| **produção** `pbtjcalbmepmrqzprusb` | consolidado | **20** | **20** | 0 de 22 | 0 |
| **produção** | somado filial a filial | **20** | **20** | 0 pares | 0 |
| **ensaio** `sgmvldiizsrjbxzzpmhh` | consolidado | **10** | **10** | 0 | 0 |

E item a item em produção, para os 7 itens com uso: `9=9 · 5=5 · 2=2 · 1=1 · 1=1 · 1=1 · 1=1`.

Fecha com o resto: `total 264 = em estoque 244 + em uso 20`, com `reservado 0` e `falta 0`.

---

## 5. Os quatro comandos, e os dois jobs do CI

```
> estoque-ti-wap@1.47.2 lint
> eslint
(sem saída — limpo)
```

```
> estoque-ti-wap@1.47.2 test
> vitest run
 Test Files  145 passed (145)
      Tests  3468 passed (3468)
```

(eram 3.291 em 144 arquivos na linha de base — **+177 testes**, +1 arquivo)

```
> estoque-ti-wap@1.47.2 contraste
(96 pares ✅; os 12 ❌ são os "antes" registrados da F28/F40 e do P1-3/P2-7/P2-8 — os mesmos da
linha de base, nenhum novo)
```

```
> estoque-ti-wap@1.47.2 build
✓ Compiled successfully in 5.0s
✓ Generating static pages using 11 workers (32/32)
├ ƒ /itens
├ ƒ /itens/conferencia
├ ƒ /itens/historico          ← rota nova
(33 rotas)
```

**CI — os dois jobs, no commit final da branch (`33452937312`):**

```
verificar: success
banco: success
```

---

## 6. O vocabulário (critério 6)

`grep -rn "Liberação\|Atrelar\|Atrelados\|Retorno" src/` classificado por categoria:

| categoria | ocorrências |
|---|---:|
| comentário de desenvolvedor | 39 |
| teste | 21 |
| identificador de código (`mostrarAtrelados`, `decidirVinculoRetorno`, `temAtrelados`…) | 21 |
| registry / CHANGELOG (narrativa histórica) | 7 |
| ajuda (deliberado — quem operou com o nome velho tem de achar a explicação) | 1 |
| **texto de TELA do vocabulário de item** | **0** |

As duas que um grep ingênuo confunde com texto de tela, e por que não são:

- `src/components/relatorios/tabela-itens-grupo.tsx:65` — a variável se chama `mostrarAtrelados`, e o
  cabeçalho que ela renderiza é **"Reservado"**.
- `src/components/relatorios/manutencao-casos.tsx:141` — `Retorno:` é a data de **retorno de
  manutenção do ATIVO** (`motivo` `retorno_manutencao`, `dominio.ts:161`), outro domínio.

---

## 7. Nada de banco mudou (critério 9)

```
$ git diff v1.46.0..HEAD --stat -- supabase/
(vazio)
```

Nenhuma migration nova, nenhuma função recriada, `npm run db:types` não rodou.

---

## 8. A revisão adversarial

Dois revisores em contexto fresco, um contra o plano e os 11 critérios, outro **só** contra "o que o
usuário pode ter perdido". Três achados de código, **todos corrigidos antes do merge** (`ca57b3d`):

| gravidade | achado | correção |
|---|---|---|
| **importante** | A linha expansível não mostrava **Total** nem **Reservado** por filial. A tabela antiga os escondia no `title` de cada célula (`detalhe()` de `saldos-filiais.tsx`) e o redesenho os perdeu — **recurso perdido**, o modo de falha nº 1 de um redesenho | Total visível por filial, e Reservado quando > 0 |
| nota | O estado vazio do **recorte por cargo** caiu no título genérico "Nenhum saldo ainda", que é uma afirmação **global** e falsa para o operador de uma filial | terceiro título, "Nenhum saldo nas suas filiais" |
| nota | O comentário de `filtrosHistorico` apontava para a página que deixou de ter histórico | atualizado |

O primeiro revisor também **bloqueou** por um motivo de processo, e tinha razão: a documentação
declarava o rollout concluído (`✅ ENTREGUE`, `🔒`, checkboxes marcados) enquanto a fase ainda estava
num PR aberto. As marcações só passaram a corresponder à realidade depois do §9.

---

## 9. O defeito que chegou a produção — e a correção que não pegou

Esta é a parte que vale ser lida.

### O que aconteceu

1. **v1.47.0 foi ao ar.** O smoke pós-deploy acusou **uma** falha em 108 checagens:
   `/itens?tipo=saida&de=2026-08-01 — HTTP 200 sem o conteúdo esperado`. O redirecionamento do link
   antigo do histórico **não estava acontecendo**.
2. **A primeira hipótese, e a v1.47.1.** A página montava a entrada da regra com
   `Object.entries(searchParams)`; a hipótese foi que o objeto do Next não se deixa enumerar. A
   correção trocou por acessos nominais, foi publicada como **v1.47.1**, e o smoke **falhou de novo,
   igual**.
3. **A instrumentação, e a causa real.** Um `console.log` na página, lido no dev server local
   (reproduziu na primeira tentativa), mostrou que a hipótese estava **errada**:

   ```
   [DIAG-F42] {"tipo":"saida","de":"2026-08-01",
               "destino":"/itens/historico?tipo=saida&de=2026-08-01","chaves":["tipo","de"]}
   ```

   `Object.keys` funcionava, a entrada chegava certa e a função devolvia o destino certo. O
   `redirect()` **disparava** — e a resposta continuava sendo 200. A inspeção do corpo fechou o caso:

   ```
   /itens?tipo=saida → HTTP 200 | NEXT_REDIRECT:true | historico-no-payload:true | esqueleto:true
   ```

   O segmento `/itens` tem `loading.tsx`, então a rota é servida em **stream**: o Next manda **200
   com o esqueleto** assim que a navegação começa, e um `redirect()` disparado depois disso é
   entregue **dentro do payload RSC**, para o navegador executar. O operador com JavaScript acabava
   na tela certa; um cliente sem JS, um `curl` e o smoke, não.
4. **A v1.47.2.** O desvio foi da página para `src/lib/supabase/proxy.ts`, onde acontece **antes de
   qualquer render**. Verificado localmente antes do deploy:

   ```
   /itens?tipo=saida&de=2026-08-01 → HTTP 307 | Location: /itens/historico?tipo=saida&de=2026-08-01
   /itens?tipo=saida               → HTTP 307 | Location: /itens/historico?tipo=saida
   /itens?item=1                   → HTTP 307 | Location: /itens/historico?item=1
   ```

### As três lições, e o que cada uma virou de código

- **Teste verde não é cobertura.** Os 29 testes de `destinoHistoricoLegado` passaram nas três
  versões: eles montavam a entrada à mão. A **função pura estava certa e o wiring estava errado**, o
  tempo todo. Quem pegou foi o smoke — que é para isso que ele existe.
- **A primeira hipótese plausível não é diagnóstico.** A v1.47.1 foi publicada com uma explicação
  coerente e falsa. O que separou uma da outra foi **instrumentar e olhar**, não pensar melhor.
- **O smoke provava a coisa errada, e acertou por acidente.** A entrada conferia o *conteúdo* da tela
  de destino. Agora ela confere **status e destino** (`redirectEsperado`), e um **200 numa rota que
  deve desviar é falha explícita** — "redirect que só o navegador executa" deixou de passar por
  redirect.
- **A guarda de texto-fonte mudou de alvo**: antes proibia varrer `searchParams` (a hipótese errada);
  agora **exige** o desvio no proxy e o **proíbe** na página, com a razão escrita ao lado.

### Smoke final, pós-deploy da v1.47.2

```
========================================================================
RESUMO · 108 OK · 1 aviso · 0 n/a (pré-F12) · 0 falha
========================================================================
```

O único aviso é pré-existente e não é da fase: `kits_modelos · anon NÃO lê (RLS) — anon leu 0 linhas,
mas não há kit cadastrado — RLS não comprovada`.

As rotas desta fase, com sessão e sem:

```
[OK] /itens               — HTTP 307 → /login          (sem sessão)
[OK] /itens/historico     — HTTP 307 → /login          (sem sessão)
[OK] /itens/conferencia   — HTTP 307 → /login          (sem sessão)
[OK] /itens               — HTTP 200 (238533 bytes)
[OK] /itens?visao=consolidado — HTTP 200 (238605 bytes)   ← link antigo não quebra
[OK] /itens?visao=filiais     — HTTP 200 (238593 bytes)   ← link antigo não quebra
[OK] /itens/historico     — HTTP 200 (233630 bytes)
[OK] /itens?tipo=saida&de=2026-08-01 → /itens/historico?tipo=saida&de=2026-08-01
[OK] /itens/conferencia   — HTTP 200 (135852 bytes)
```

---

## 10. Os dois diálogos

| arquivo | antes | depois |
|---|---:|---:|
| `lancar-item-dialog.tsx` | 893 | **637** |
| `transferir-item-dialog.tsx` | 457 | **424** |

O que saiu do primeiro virou quatro componentes — `carrinho-linhas.tsx` (158, compartilhado com o
segundo), `escolha-tipo-lancamento.tsx` (99), `lancar-item-campos.tsx` (155) e
`lancar-item-detalhe-linha.tsx` (142) — mais **três pedaços de código morto** que a F41 tinha
deixado: a segunda pergunta da escolha de tipo (`grupoDuplo`, sempre `null`), o botão do grupo duplo
e o placeholder do chamado que ramificava num tipo que a tela não oferece mais.

A **prévia da regularização** usa `partirQuantidade` — a mesma função pura que a RPC `0126` espelha
—, e cobre os dois tipos particionáveis porque `buscarSaldosItens` passou a devolver o par
`{ emEstoque, emUso }`; o `emUso` é **derivado**, sem migration.

---

## 11. Decisões, dívidas e o que fica

**Decisões:** 11 atas em [`DECISOES.md`](DECISOES.md) na data de hoje — J3 e as duas do rollout, "Em
uso" derivada (com a álgebra e as contagens), a morte do `?visao=`, o redirect do link antigo, o
filtro de filial que mudou de casa, o CSV unificado, as duas colunas de classificação, as subrotas no
menu, o `react-hook-form` recusado, o `SaldosPorItem` com `never`, e os testes que mudaram porque a
regra mudou.

**Dívidas quitadas:** a duplicação do carrinho entre os dois diálogos (era forma **copiada**, não
importada) e o tipo `LinhaCarrinho`, definido duas vezes.

**Dívida que fica, com o custo declarado** (emenda no item **K** de
[`DIVIDA-TECNICA.md`](DIVIDA-TECNICA.md)): `transferir-item-dialog` **não** migrou para
`react-hook-form`. Sem teste de componente, seriam quatro mecanismos não-mecânicos reescritos sem
rede. O desbloqueio continua sendo `@testing-library/react` (item **Y**), que precisa de aprovação do
Johnny pela stack fechada.

**Um defeito latente encontrado no caminho:** `SaldosPorItem` era `Record<number, number>`, e o
TypeScript aceita calado um objeto de chaves de texto ali — passar o par inteiro zeraria o saldo do
diálogo de transferência **com o build verde**. O tipo ganhou dois campos `never`, e a guarda foi
verificada reintroduzindo o engano (`TS2345`).

**O sistema de design, depois desta fase:** a frente **c** avançou pela metade — a parte de itens
saiu, e sobram os **9 painéis de `/admin`** e o `admin/layout.tsx`. Continuam pendentes, sem mudança:
**a** (home, `/pendencias`, `/movimentacoes`), **b** (relatórios), o resto de **c** e **d** (`/dev`,
`/ajuda`, `/versoes`, as portas públicas e a casca do app).

---

## 12. Próximos passos sugeridos

1. **A conferência a olho do Johnny** nas três telas de item — é a prova que esta fase não pôde
   produzir (não há `.env.ensaio`, e fotografar pelo `.env.local` seria fotografar produção). O
   `ROTAS_PADRAO` de `scripts/design/capturar.mjs` já tem as três rotas: quem tiver o ambiente
   fotografa sem reabrir a decisão.
2. **A frente c do design system, o que sobrou dela**: os 9 painéis de `/admin`. Vale decidir junto se
   a barra de abas do `admin/layout.tsx` continua, agora que existe o precedente dos subitens de menu.
3. **`@testing-library/react`** — a decisão do Johnny que destrava os itens **E**, **K** e **Y** da
   dívida de uma vez. Esta fase encostou nela duas vezes.
4. **Um passo de CI que rode o smoke contra o preview do PR.** Nas três versões de hoje, quem
   encontrou o defeito foi o smoke — sempre **depois** do deploy em produção. Rodá-lo antes do merge
   teria custado minutos e poupado duas publicações.
