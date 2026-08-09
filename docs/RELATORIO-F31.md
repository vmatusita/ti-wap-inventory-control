# Relatório F31 — Onda C2: transferir itens entre filiais e conferir a prateleira

Ordem de serviço: [`docs/prompts/F31-onda-c2-ultracode.md`](prompts/F31-onda-c2-ultracode.md) ·
Plano: [`docs/PLAN-F31.md`](PLAN-F31.md) · Atas: [`docs/DECISOES.md`](DECISOES.md) (nove entradas de
09/08/2026) · Fonte: `docs/ANALISE-UX-2026-08-07.md` §5, itens **ITN-01** e **ITN-04**.

Data: **09/08/2026**. Commit de partida: `4610d03`.

---

## 1. O que mudou, por recurso

### 1.1 ITN-01 — Transferir item entre filiais

**O problema, medido e não presumido.** O corpo vivo do trigger `valida_lancamento_item`
(0015→0027) calcula `total = Σ(entrada) + Σ(ajuste)`. `saida` — que na tela se chama
**"Liberação"** — não entra nessa soma: ela baixa o estoque e deixa o total onde estava, que é o
desenho certo para "o item ficou com a pessoa". Usá-la para transferir soma **+N ao Total
consolidado a cada remanejamento, para sempre**, e nada corrige isso depois.

**O que entrou:**

| Peça | Onde |
|---|---|
| RPC transacional `transferir_item` | `supabase/migrations/0104_transferir_item.sql` |
| Roteiro SQL (18 asserções) | `supabase/tests/transferencia_item.sql` |
| Módulo puro (frases cruzadas, selo, saldo) | `src/lib/itens/transferencia.ts` |
| Schema Zod | `src/lib/validators/item.ts` (`transferenciaItemSchema`) |
| Server Action | `src/lib/actions/itens.ts` (`transferirItens`) |
| Diálogo | `src/components/itens/transferir-item-dialog.tsx` |
| Atalho da célula | `src/components/itens/transferir-item-celula.tsx` + `-evento.ts` |
| Selo e aviso no histórico | `src/components/itens/historico-lancamentos.tsx` |

**Como grava.** Cada item vira **um par de ajustes** — `−N` na origem, `+N` no destino — dentro de
uma transação. Como `−N + N = 0` em `total_raw`, o **Total consolidado não muda**; o estoque de
cada filial muda na medida certa.

**Atomicidade.** É tudo-ou-nada de verdade, porque é uma transação: saldo insuficiente numa linha
faz o trigger recusar e **nada** é gravado — nem a perna de destino das outras linhas. Isso é o
oposto **deliberado** do carrinho de lançamento (onde cada linha é independente): lá as linhas não
se relacionam; aqui cada par **é** a operação, e meia transferência é pior que nenhuma.

**Permissão nas duas filiais.** A RPC é **SECURITY INVOKER** (medido antes de decidir:
`criar_compra_lote` e `devolver_ao_fornecedor` também são), então os dois inserts passam pela
policy `"operador lanca"` de `lancamentos_item`, cujo `with check` é
`pode_escrever_filial(filial_id)` e é avaliado **linha a linha**. Um operador vinculado só à Matriz
é barrado na perna do destino — pela tela ou por `curl` com a anon key do bundle. As guardas
`pode_escrever_filial` no corpo da função são cinto-e-suspensórios **pela mensagem**, não pela
segurança.

**Anti-deadlock (achado desta fase).** O trigger trava por `(item, filial)` na primeira linha do
corpo. Gravando as duas pernas na mesma transação, duas transferências em sentidos opostos —
`Matriz→Serra` e `Serra→Matriz` do mesmo item — pediriam as travas em ordens invertidas. A RPC
adquire **todas** as travas, ela mesma, em ordem determinística `(item_id, filial_id)`, **antes do
primeiro insert**. É a mesma classe de bug que a `0100` (F24) teve de consertar **depois** de já
estar em produção.

**Estorno de perna.** Avisa, não bloqueia — e diz o efeito inteiro (o Total consolidado muda) e o
caminho certo (transferir de volta). Ata e o porquê em `DECISOES.md`.

### 1.2 ITN-04 — Modo Conferência (inventário físico)

**O que entrou:**

| Peça | Onde |
|---|---|
| Rota própria | `src/app/(app)/itens/conferencia/{page,loading,error}.tsx` |
| Tela | `src/components/itens/conferencia/conferencia-estoque.tsx` |
| Rascunho (puro) | `src/components/itens/conferencia/rascunho.ts` |
| Aritmética (pura) | `src/lib/itens/conferencia.ts` |
| Ajuda (34ª página) | `src/lib/ajuda/conteudo/conferencia-de-estoque.ts` |

**Sistema · Contado · Diferença**, ao vivo, com resumo fixo no rodapé
(`"6 conferidos · 4 com diferença (+4 / −5)"`). **"Registrar diferenças (N)"** abre a confirmação
com cada ajuste listado e a observação `"Inventário de dd/MM/aaaa"` (editável), grava em blocos de
`MAX_LINHAS_LOTE_ITEM` com progresso visível, trata **sucesso parcial** e reoferece só o que faltou.

**Linha em branco é "não conferi", nunca "contei zero".** Tratar vazio como zero transformaria uma
conferência parcial num pedido de **zerar o estoque inteiro da filial**.

**A idempotência foi redesenhada duas vezes**, e é o assunto da §4.

---

## 2. Checklist da ordem, autoverificado

### Recurso 1 · ITN-01

| Sub-bullet da ordem | Como está | Evidência |
|---|---|---|
| Ação "Transferir entre filiais" em `/itens` | ✅ botão no cabeçalho | `itens/page.tsx`; roteiro §5.1 |
| Atalho na linha do saldo pré-preenchendo item+origem | ✅ e é da **célula**, não da linha (a célula é o dado que falta: de onde SAI) | `saldos-filiais.tsx`; verificado na tela: só na coluna Matriz, a única com estoque |
| Visível a quem escreve em **ambas** as filiais | ✅ botão exige `filiaisEscrita.length >= 2`; atalho só na coluna que o cargo escreve | `itens/page.tsx`; validação dura no servidor (§1.1) |
| Origem, destino (≠ origem, validado), carrinho, chamado/obs | ✅ destino exclui a origem da lista; Zod + RPC recusam iguais | roteiro caso 5; `transferenciaItemSchema` |
| Mostrar **saldo da origem** por item | ✅ no combobox (mecanismo da F28/ITN-05d, com `filialId` = origem) e abaixo da linha | verificado: `"Teclado ABNT2 ficticio· 25"` e `"3 em estoque em Matriz"` |
| Recusar no cliente acima do saldo | ✅ | verificado: `"Só há 3 na filial de origem."` + toast; nada enviado |
| Par de ajustes, tudo-ou-nada, caminho **(a)** RPC | ✅ migration aditiva, aplicada pelo runbook | §3 |
| Roteiro SQL provando os quatro casos pedidos | ✅ **18 asserções**, 0 falhas nos dois bancos | §3.3 |
| Histórico com as pernas cruzadas; contagens **não mudam** | ✅ | §5.1; nenhuma contagem de relatório tocada |
| Selo visual de transferência (opcional) — registrar a escolha | ✅ existe, é derivado, é apresentação | ata em `DECISOES.md` |
| Ajuda explicando transferência × liberação+entrada | ✅ seção `transferir` em `lancar-itens` + nota em `saldos-e-estoque-minimo` | 6 asserções novas em `gestao.test.ts` |
| Fora: transferência de ativos, tipo novo no enum, agendamento | ✅ nada disso foi feito | `git diff` de `dominio.ts` não tem valor novo |

### Recurso 2 · ITN-04

| Sub-bullet da ordem | Como está | Evidência |
|---|---|---|
| Botão "Conferir estoque" em `/itens` | ✅ (com preset de filial quando há exatamente uma no filtro) | `itens/page.tsx` |
| Uma filial por vez, escolhida ao entrar | ✅ seletor quando não há filial válida na URL | verificado na tela |
| Coluna "Contado" editável, alvo de toque adequado | ✅ `min-h-11` (padrão F29) | `conferencia-estoque.tsx` |
| Linha em branco = não conferido, fica de fora | ✅ | teste puro + verificado (SSD em branco → `—`) |
| Diff ao vivo com destaque; resumo fixo | ✅ `"N conferidos · M com diferença (+X / −Y)"` | verificado: `"6 conferidos · 4 com diferença (+4 / −5)"` |
| Rascunho em `sessionStorage`, banner com hora, descarte | ✅ **por filial** (3ª volta da revisão) | verificado: `"Continuar a conferência de Matriz começada às 14:24?"` |
| Confirmação listando cada ajuste + observação padrão editável | ✅ | verificado: lista dos 4 + `"Inventário de 09/08/2026"` |
| Blocos respeitando `MAX_LINHAS_LOTE_ITEM`, progresso visível | ✅ teto **reusado**, não inventado (ata) | `particionar` + testes |
| Sucesso parcial; reenvio só do que falta; nada gravado 2× | ✅ redesenhado duas vezes até ficar de pé | §4 |
| Permissão: quem escreve na filial; consulta não vê o botão | ✅ | `conferencia/page.tsx` + `itens/page.tsx` |
| Ajuda com seção "Conferência de estoque (inventário)" | ✅ página nova, com a seção nomeada | 7 asserções novas |
| Fora: histórico de inventários, contagem cega, acuracidade, ativos | ✅ nada disso foi feito | declarado na página e no código |

### Portões e proibições

| Exigência | Estado |
|---|---|
| `npm run lint` limpo | ✅ (§6) |
| `npm run test` limpo, contagem **sobe** | ✅ **2.343** (eram 2.241) |
| `npm run build` limpo | ✅ (§6) |
| Lógica extraível com teste puro | ✅ par de ajustes, diff, blocos, idempotência, base congelada |
| `package.json` sem dependência nova | ✅ `git diff 4610d03..HEAD -- package.json` **vazio** |
| `supabase/` só a migration aditiva + teste | ✅ exatamente 2 arquivos, ambos novos |
| Nenhum texto de UI em inglês | ✅ |
| Nenhuma contagem de relatório alterada | ✅ `ajuste` já era contado como sempre foi |
| Enum de lançamento sem valor novo | ✅ |
| `src/components/ui/` intocado | ✅ |
| Dados reais em fixture/teste | ✅ nenhum — tudo `TESTE F31…`, `f31.*@wap.ind.br`, itens "ficticio" |

---

## 3. Banco — o que foi aplicado, e as provas

### 3.1 Caminho escolhido

**1a (RPC transacional)**, porque os dois projetos respondem por MCP (`ACTIVE_HEALTHY`) e
`execute_sql` roda nos dois. O caminho 1b (compensação por estorno no app) foi **descartado com
motivo**: o estorno compensatório é ele mesmo uma escrita que falha exatamente quando se precisa
dela, e um estorno de perna **é** o dano que o recurso existe para evitar. Ata em `DECISOES.md`.

### 3.2 Rollout (caminho A do `RUNBOOK-BANCO.md`)

| | Ensaio `sgmvldiizsrjbxzzpmhh` | Produção `pbtjcalbmepmrqzprusb` |
|---|---|---|
| Contagens ANTES | 4 lançamentos · 1.602 ativos · 3.237 movs | 0 lançamentos · 0 itens · 1.654 ativos · 3.280 movs |
| Contagens DEPOIS do apply | **idênticas** | **idênticas** |
| Assinatura | 1, sem overload | 1, sem overload |
| `prosecdef` / `provolatile` | `false` / `v` | `false` / `v` |
| Grants | `authenticated` ✅ · `anon` ❌ · `service_role` ❌ | idem |
| `notify pgrst, 'reload schema'` | ✅ | ✅ |
| `get_advisors(security)` | — | **nenhum achado novo** |

O advisor não mexeu porque a função é **INVOKER**: a classe
`authenticated_security_definer_function_executable` (alimentada pela `0062`/`0069`/`0079-88`) só
enxerga `security definer`.

### 3.3 Roteiro SQL — `supabase/tests/transferencia_item.sql`

**18 asserções · 0 falhas nos DOIS bancos**, em `begin; … rollback;`. Resíduo conferido depois:
0 item `TESTE F31%`, 0 conta `f31.*`, contagens de volta ao baseline.

Cobertura: `0` âncora · `1` o par gravado com as observações cruzadas · `2` **Total consolidado
inalterado** + estoque dos dois lados + o **contraste** (o caminho intuitivo INFLA o Total) ·
`3` anti-deadlock · `4` saldo insuficiente recusa tudo · `5` origem = destino · `6` item repetido ·
`7` grants · `8` **RLS dos dois lados** (operador vinculado só à origem é recusado; com vínculo nas
duas, passa).

> **⚠ Um falso-verde foi encontrado e fechado durante a escrita do roteiro.** A primeira versão
> passava `p_ate => null` para `rel_saldo_itens`, que filtra `where l.data <= p_ate` — com `null`
> a RPC devolve **todos os itens zerados**, e a asserção do Total comparava `0 = 0`, dizendo que
> estava preservado sem ter medido nada. Quem o pegou foram as asserções `2b`/`2c`, que esperam
> números concretos. A asserção `0` (âncora) existe para que isso não possa voltar.

---

## 4. As três voltas da revisão adversarial

A ordem pedia revisão adversarial em contexto fresco, corrigindo e re-revisando até limpar. Foram
**três voltas** (6 lentes + 3 refutadores por achado na primeira; 3 lentes nas seguintes). O roteiro
manual pegou um quarto defeito, antes delas.

| # | Achado | Severidade | Correção |
|---|---|---|---|
| 0 (roteiro manual) | "Encerrar conferência" sumia **exatamente** ao terminar: o `refresh` zerava os diffs e a âncora era `ajustes.length > 0` | alto | âncora trocada; `d5368dc` |
| 1 (1ª volta, 2 lentes independentes) | **Corrigir a contagem de um item já registrado sumia em silêncio** — o botão dizia "Nada a registrar" com a diferença colorida na tela, e encerrar levava o ajuste junto | crítico | `b30d6ee` |
| 2 (2ª volta) | `concluir()` não zerava a âncora → botão reaparecia e o efeito regravava um **rascunho fantasma**; e a página não dava `key`, então trocar de filial levava as contagens da anterior | crítico | `0af844d` |
| 3 (2ª volta) | **A idempotência descansava no `router.refresh()` já ter chegado** — ele não é esperado pelo `useTransition`, então corrigir naquela janela reenviava o ajuste inteiro (2+3+3=8 onde se contou 5) | crítico | redesenho, `0af844d` |
| 4 (3ª volta) | Base congelada aplicada a item que a sessão **não** escreveu fazia a escrita de OUTRO operador ser contada de novo | crítico | exposição estreitada (§4.2) |
| 5 (3ª volta) | Exceção de rede afirmava "não foi registrado" — o que ela não pode garantir | crítico | mensagem honesta (§4.2) |
| 6 (3ª volta) | Rascunho em chave **global** — trocar de filial apagava a contagem não registrada da anterior | médio | chave por filial |

Três achados da 1ª volta foram **refutados** e descartados (2 de 3 refutadores cada): dois deles
afirmavam que o fechamento da fase não existia, e a medição desmentiu.

### 4.1 O redesenho que o achado 3 forçou

A conta deixou de depender de tempo. A **base de cada item é congelada na abertura** e o que a
sessão já gravou é **acumulado** (`jaEscrito`), então:

```
o que ainda falta gravar = contado − base − já escrito por esta sessão
```

Verdadeiro antes e depois de o saldo novo chegar. O mesmo clique repetido não escreve duas vezes, e
uma correção manda só a diferença que falta. `jaEscrito` **não** viaja no rascunho, de propósito:
depois de um F5 os saldos que o servidor manda já incluem o que foi escrito, e a base é recapturada
deles — restaurar o acumulado descontaria a mesma escrita duas vezes.

### 4.2 O que ficou **declarado** em vez de corrigido, e por quê

Dois dos achados da 3ª volta **não são fecháveis no cliente**, e tentar fingir que sim seria pior
que declarar:

- **Escrita externa concorrente.** Se eu já gravei um item nesta sessão **e** outra pessoa mexer no
  mesmo item, o meu ajuste seguinte não enxerga a mexida dela. A exposição foi **estreitada** para
  esse caso duplo — a base congelada agora vale **só** para item que esta sessão escreveu; todo o
  resto parte do saldo ao vivo, então uma escrita alheia num item que eu não toquei é tratada
  corretamente. Fechar o resto exige **servidor** (um "ajustar para N" ou uma chave de
  idempotência), e a ordem F31 põe isso fora de escopo ("nenhum toque em tabelas/policies/RPCs
  existentes").
- **Exceção de rede.** Ela prova que a resposta não voltou, não que o servidor não gravou. Sem chave
  de idempotência, o reenvio às cegas duplicaria. A mensagem deixou de afirmar o que não pode
  garantir: agora manda **recarregar e conferir o saldo antes de mandar de novo**.

Os dois estão no backlog (§9).

---

## 5. Os dois roteiros manuais, com números

Ambiente: `npm run dev` apontado para o **ENSAIO** (dados 100% fictícios), com o
`SUPABASE_SERVICE_ROLE_KEY` trocado por um placeholder inválido para que nenhum caminho
administrativo pudesse alcançar produção. Ata do método em `DECISOES.md`.

### 5.1 Transferência

Saldos de partida (ensaio, fictícios): Mouse USB **3**, Teclado ABNT2 **25** — ambos só na Matriz.

| Passo | Resultado |
|---|---|
| Atalho da célula (Matriz, Mouse) | Diálogo abre com **origem = Matriz** e o item preenchido; o botão só existe nas células com estoque |
| Lista de destino | 4 opções — a origem **não** aparece |
| Saldo da origem por item | `"3 em estoque em Matriz"`; no combobox, `"Teclado ABNT2 ficticio· 25"` |
| **Quantidade 5 com 3 em estoque** | **Recusado no cliente**: `"Só há 3 na filial de origem."` + toast; nada enviado |
| Transferir 2 itens (Mouse 2, Teclado 10) | `"2 itens transferidos."` |
| **Saldos depois** | Mouse: Matriz **3 → 1**, destino **0 → 2** · Teclado: Matriz **25 → 15**, destino **0 → 10** |
| **Total consolidado** | Mouse **3 → 3** · Teclado **25 → 25** — **inalterado** |
| Histórico | 4 linhas `Ajuste`, com `(transferência (saiu))` / `(transferência (entrou))` e as observações cruzadas |
| Estorno de uma perna | Diálogo mostra o aviso completo (só este lado · o total consolidado muda · transfira no sentido contrário). **Cancelado — nada estornado.** |

### 5.2 Conferência

Filial Matriz, 6 itens fictícios.

| Passo | Resultado |
|---|---|
| Sem filial na URL | Tela pergunta "De qual filial é a conferência?" |
| Conta 5 de 6 (SSD em branco) | `"5 conferidos · 3 com diferença (+4 / −2)"`; SSD com `—` na Diferença, **fora da conta** |
| **F5 no meio** | Banner `"Continuar a conferência de Matriz começada às 14:24?"` |
| "Continuar" | Contagens voltam idênticas |
| Completa o 6º (SSD 9 → conta 6) | `"6 conferidos · 4 com diferença (+4 / −5)"` · botão `"Registrar diferenças (4)"` |
| Confirmação | Lista os 4 (Cabo +2, Adaptador −2, Memória +2, SSD −3) e a observação `"Inventário de 09/08/2026"` |
| Registrar | `"4 diferenças registradas."` · saldos passam a **4, 4, 6, 6** — exatamente o contado |
| **Refazer a conferência** | `"6 conferidos · tudo bate"` — **tudo zerado** |
| **Erro forçado** (concorrência: liberação de todo o SSD durante a conferência) | `"1 de 2 diferenças registradas."` · SSD com `"Estoque insuficiente…"` na própria linha · botão volta a `"Registrar diferenças (1)"` — **só o que falhou** |
| Reenvio | `"1 diferença registrada."` · na tabela, **6 ajustes** de inventário no total — **nenhum duplicado** |
| **Correção depois de registrar** (reverificação do achado 1/3) | 6 → conta 9 grava **+3**; corrigir para 11 grava **+2** (não +5). Sistema: 6 → 9 → 11 |
| Encerrar | Rascunho apagado; F5 depois **não** oferece banner fantasma |

---

## 6. Saídas reais dos portões

```
$ npm run lint
> eslint
(sem saída — limpo)

$ npm run test
 Test Files  108 passed (108)
      Tests  2343 passed (2343)
   Duration  49.05s

$ npm run build
✓ Compiled successfully
├ ƒ /itens
├ ƒ /itens/conferencia
```

Diff da fase: **35 arquivos**, +4.401 / −156. `supabase/`: **exatamente 2 arquivos**, ambos novos
(a migration aditiva e o roteiro). `package.json`: **diff vazio**.

---

## 7. Push, deploy e smoke de produção

`git pull --rebase` (já em dia) e **push da `main`** feito. A Vercel publicou.

**Smoke** (`node scripts/smoke/smoke-prod.mjs`, com credenciais do `.env.local`, contra
`https://ti-wap-inventory-control.vercel.app`):

```
RESUMO · 94 OK · 4 aviso · 0 n/a (pré-F12) · 0 falha
```

Foram **94 OK** (eram 93 na F28) — o OK a mais é `/ajuda/conferencia-de-estoque`, **HTTP 200**, que
é a prova direta de que **o build desta fase está no ar**. Os 4 avisos são os mesmos de sempre e
**não são regressão**: todos dizem a mesma coisa, que produção não tem catálogo de itens nem kits
cadastrados (medido de forma independente: `0 itens`, `0 lançamentos`).

```
[AVISO] itens · catálogo ativo — catálogo de itens vazio (esperado em DEV, não em produção)
[AVISO] rpc rel_saldo_itens · consolidado — 0 linhas (catálogo de itens vazio)
[AVISO] itens.estoque_minimo (I5) — coluna existe; catálogo vazio
[AVISO] kits_modelos · anon NÃO lê (RLS) — anon leu 0 linhas, mas não há kit cadastrado — RLS não comprovada
```

> **Consequência honesta disso:** os dois recursos desta fase são de **itens por quantidade**, e
> produção ainda não usa itens. Eles estão no ar, funcionando e provados **no ensaio** — mas ninguém
> os exercitou com dado real ainda.

---

## 8. O que este relatório NÃO prova

- **O deadlock nunca foi reproduzido.** O caso 3 do roteiro é **estrutural** (a ordenação continua
  no corpo, e continua antes dos inserts) mais o **conjunto** de travas seguradas. Deadlock exige
  duas sessões concorrentes, e um roteiro `psql` de sessão única não as tem. O que está provado é
  que quem remover o passo verá o roteiro falhar — não que produção não deadlocka.
- **Nada foi transferido nem conferido em PRODUÇÃO.** Produção recebeu só a migration (aditiva) e o
  roteiro dentro de `begin; … rollback;`. Os dois roteiros manuais rodaram no **ensaio**. Produção
  tem hoje **0 itens de catálogo e 0 lançamentos** — o recurso está no ar sem uso ainda.
- **A escrita concorrente de OUTRA pessoa sobre um item que a mesma sessão já ajustou continua
  podendo produzir ajuste a mais** (§4.2). Estreitado, declarado, no backlog — não resolvido.
- **Queda de rede no meio do registro continua ambígua**: o app deixou de afirmar que nada foi
  gravado, mas não sabe dizer se foi. Não há chave de idempotência.
- **O smoke prova que as páginas RESPONDEM, não que os recursos funcionam em produção.** Ele é
  só-leitura: nada foi transferido nem conferido lá.
- **Nenhuma medição de desempenho** foi feita: nem da RPC com carrinho cheio, nem da conferência
  numa filial com catálogo grande.
- **Não há teste de componente React** para a conferência: a lógica está coberta por testes puros e
  os fluxos, por roteiro manual no navegador. Um bug que exista só na fiação do JSX passaria.
- **A prova de RLS do roteiro cobre a transferência**, não a conferência — esta grava por
  `lancarItens`, cuja RLS já é coberta por `papeis_rls.sql` desde a F21.

---

## 9. Pendências e backlog novo

**Pendências desta fase:**

1. **Resíduo fictício no ENSAIO** (nada em produção): a conta `f31.e2e@wap.ind.br` ficou
   **desativada, banida e sem vínculos**, com a senha trocada por um valor aleatório desconhecido —
   não pôde ser apagada porque `lancamentos_item.criado_por` a referencia e o acervo é imutável.
   Ficaram também dois itens fictícios e os lançamentos do roteiro. Some no próximo `db:reset` do
   ensaio.

**Backlog novo (nomeado, não feito):**

- **Idempotência de servidor para o lançamento em lote** — uma chave por lote que `lancarItens`
  confira antes de inserir. Fecharia de vez os achados 4 e 5 da 3ª volta (concorrência externa e
  queda de rede), que hoje só podem ser estreitados e declarados.
- **Bloquear no BANCO o estorno de perna de transferência** (ou torná-lo um par). Hoje o aviso é de
  tela, e o estorno segue possível por chamada direta ao PostgREST.
- Da própria ordem, declarados fora de escopo: histórico/agenda de inventários, contagem cega,
  relatórios de acuracidade, conferência de **ativos**, transferência com agendamento/aprovação.
