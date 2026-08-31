# Relatório da F41 — o motor: o item para de bloquear e passa a falar a língua do ativo

**Executada em 31/08/2026**, em modo autônomo, a partir de `docs/prompts/F41-motor-itens-ultracode.md`
e do plano de área [`PLANO-ITENS.md`](PLANO-ITENS.md) §5. Plano da execução em
[`PLAN-F41.md`](PLAN-F41.md); atas em [`DECISOES.md`](DECISOES.md) (onze, na data de hoje).

**Versão `1.46.0`** · migrations `0125`–`0127` · 64 arquivos, +5.568 / −271.

> **O que a fase resolveu, numa frase:** marcar "Voltou" no checklist de uma devolução parou de
> derrubar o lote — e com ele a devolução do equipamento —, o operador passou a cadastrar item no
> meio do fluxo, e nenhuma tela oferece mais dois nomes para a mesma coisa.

---

## 1. A linha de base, medida ANTES de mudar qualquer coisa

| Comando | Resultado |
|---|---|
| `npm run lint` | **verde** (sem saída, exit 0) |
| `npm run test` | **verde** — 142 arquivos, 3.233 testes |
| `npm run contraste` | **verde** (exit 0; o único ❌ é o "antes" registrado da F40, esperado) |
| `npm run build` | **verde** |

**Nenhuma falha pré-existente nos quatro comandos.** Tudo que ficou vermelho durante a fase foi
causado por ela, e está explicado abaixo — com uma exceção que não é dos quatro comandos e sim dos
roteiros de banco: `dev_destrutivo.sql` já falhava no projeto de ensaio antes desta fase, e a §5.4
mostra a prova disso.

---

## 2. As contagens de produção — o critério 6 e o critério 9

Medidas por `SELECT` só-leitura em `pbtjcalbmepmrqzprusb`, só agregados (regra 2 do `CLAUDE.md`).

### 2.1 Revalidação do §9 do plano, ANTES

| Medida | Plano §9 | Real (antes) | |
|---|---|---|---|
| `lancamentos_item` | 58 | **58** | ✔ |
| … `ajuste` · `saida` · `entrada` · `reserva` · `retorno` | 22·14·13·5·4 | **22·14·13·5·4** | ✔ |
| … com `movimentacao_id` | 0 | **0** | ✔ |
| … com `colaborador_id` | 0 | **0** | ✔ |
| Pares (item, filial) com lançamento | 30 | **30** | ✔ |
| … com estoque disponível > 0 | 22 | **22** | ✔ |
| … com saída em aberto > 0 | 4 | **4** | ✔ |
| Grupos com reserva aberta | 5 | **5** | ✔ |
| `itens` no catálogo | 22 | **22** | ✔ |
| `pendencias_item` abertas | 14 | **14** | ✔ |
| **Σ total** | 264 | **264** | ✔ |
| `ativos` | 1.614 | **1.615** | +1 — o dado andou |
| `movimentacoes` | 3.431 | **3.435** | +4 — o dado andou |

**13 de 15 batem exatamente.** As duas divergências são drift natural: o plano foi medido de manhã e
produção seguiu operando. Nenhuma é erro de fórmula.

Uma correção ao plano, encontrada ao revalidar: a fórmula de "pares com estoque disponível" **só**
dá 22 quando inclui a subtração da reserva em aberto. Sem esse termo dá 26 — vale para quem
revalidar no futuro.

### 2.2 O SQL que produziu a tabela

```sql
with base as (
  select l.item_id, l.filial_id,
         sum(case l.tipo::text when 'entrada' then l.quantidade
                               when 'ajuste'  then l.quantidade else 0 end) as total,
         sum(case l.tipo::text when 'saida'   then l.quantidade
                               when 'retorno' then -l.quantidade else 0 end) as em_uso
    from public.lancamentos_item l group by 1,2
), atrel as (
  select item_id, filial_id, sum(greatest(0,net)) as reservado from (
    select l.item_id, l.filial_id, l.chamado,
           sum(case l.tipo::text when 'reserva'   then l.quantidade
                                 when 'liberacao' then -l.quantidade else 0 end) as net
      from public.lancamentos_item l where l.chamado is not null group by 1,2,3
  ) b group by 1,2
), saldo as (
  select b.item_id, b.filial_id, b.total, coalesce(a.reservado,0) as reservado, b.em_uso,
         b.total - coalesce(a.reservado,0) - greatest(0,b.em_uso) as estoque
    from base b left join atrel a on a.item_id=b.item_id and a.filial_id=b.filial_id
)
select …  -- as contagens da tabela acima
```

### 2.3 A invariante da conversão (critério 6)

A `0127` fecha cada reserva (`liberacao`) e a reabre como `saida`. Pela fórmula do trigger:

```
antes:   total 264 · reservado  5 · em uso 15  →  estoque = 264 − 5 − 15 = 244
depois:  total 264 · reservado  0 · em uso 20  →  estoque = 264 − 0 − 20 = 244
```

**`total` e `estoque` idênticos; `reservado` a zero.** _(resultado real do apply em produção: §8)_

---

## 3. Os corpos de partida, lidos do BANCO — e o que o diff mostra

Lidos por `pg_get_functiondef` em produção, 31/08/2026, antes de escrever a `0126`.

| Função | Assinatura (1 só, sem sobrecarga) | `md5` de partida | Tamanho |
|---|---|---|---|
| `criar_movimentacao_com_itens` | `(jsonb, jsonb, uuid)` | `2d9bf5f23860635be0fbdd43a034dfeb` | 8338 |
| `resolver_pendencias_item_com_lancamentos` | `(uuid[], text, text, jsonb, uuid)` | `e5c0240a349a5380f224129e30a14481` (prod) · `8f8fc10188d5b85fb6a03793e062cfd1` (ensaio) | 4422 / 4375 |
| `estornar_movimentacao_com_itens` | `(uuid, text, jsonb, uuid)` | `1fe7895feb14d6dbb5942c13dcc33cf7` | 3451 |
| `valida_lancamento_item` | `()` trigger | `77b7b39491f03d7171e7751720340e73` | 4123 |
| `dev_checagens_integridade` | `()` | `c12806bdab1cfab9bac537d17b39d6af` | 3955 |

**Depois da recriação (ensaio):** `criar_movimentacao_com_itens` → `3fa91dde8aa0155a5d847fd91b2497cd`;
`resolver_pendencias_item_com_lancamentos` → `65cf74f92ac33d4c9cd317437da28c07`;
`dev_checagens_integridade` → `b187fb1b248a48f8a0134baa5392b65d`.

### 3.1 O diff, e ele mostra SÓ a partição

O `diff -u` foi feito de forma **mecânica** — corpo lido do banco antes, corpo lido do banco depois,
`diff` do sistema —, não por leitura. As diferenças, na íntegra:

**`criar_movimentacao_com_itens`** — dois blocos:
1. sete `declare` novos (`v_tipo`, `v_filial_it`, `v_aberto`, `v_estoque`, `v_reg`, `v_normal`,
   `v_obs_reg`) mais os dois contadores (`v_n_reg`, `v_qtd_reg`);
2. o INSERT único do passo 5 substituído pela leitura do saldo + o `ajuste` de regularização + a
   linha normal condicional.

**`resolver_pendencias_item_com_lancamentos`** — os mesmos dois blocos, mais **um comentário**: a
recriação convergiu a divergência ensaio↔produção descrita em §3.2.

**`dev_checagens_integridade`** — um bloco `return query` acrescentado no fim (`reserva_aberta`), e
nada mais. As dez anteriores ficaram intactas, na mesma ordem, com o `e_dev()` na primeira linha.

### 3.2 O que NÃO saiu da recriação — conferido item a item

| O que a ordem exige preservar | Estado |
|---|---|
| As duas classes de trava e a ordem entre elas (ativos `for update`, depois advisory) | **intactas** — não aparecem no diff |
| A filial derivada do ativo LIDO SOB A TRAVA (`v_ativo.filial_id`) | **intacta** |
| O `exception when others` que etiqueta a linha e RE-LANÇA o erro original | **intacto** — e replicado nos dois INSERTs novos |
| A ordem total de inserção por efeito do passo 5 + o guard `jsonb_typeof(…) = 'number'` (0123) | **intacta** |
| O teto do lote (30), a validação de `indice_movimentacao`, `pode_escrever_filial` pela mensagem | **intactos** |
| `security invoker` | **declarado explicitamente**, nas três — ver §3.3 |
| `set search_path = public` | **intacto** |
| A assinatura | **idêntica** — `prosecdef = false`, 1 linha por função, sem sobrecarga |
| Grants | `authenticated` + o dono; **nunca** `anon` nem `service_role` |

### 3.3 Dois achados que a ordem previu, e um que ela não previu

1. **O plano de área errava a linhagem, nos dois casos.** Ele diz `criar_movimentacao_com_itens`
   "0117 → 0121" e `resolver_pendencias_item_com_lancamentos` "0119/0122". A real é `0117` → **`0123`**
   e **só a `0119`**. É exatamente por isso que a regra manda ler do banco.
2. **Ensaio e produção divergiam** em `resolver_pendencias_item_com_lancamentos` — 47 bytes, e a
   diferença era **um comentário**. A recriação convergiu os dois.
3. **O `security invoker` quase se perdeu, e quem o pegou foi um teste.** `pg_get_functiondef` NÃO
   imprime `security invoker` (é o default), então o corpo lido do banco não o trazia e a primeira
   escrita da `0126` o omitiu. O comportamento era idêntico, mas a `0117`, a `0119` e a `0123`
   o escrevem com todas as letras nos arquivos delas — recriar sem ele trocaria uma garantia
   explícita por uma implícita. Corrigido, e `lancar_itens_lote` entrou na lista que
   `src/lib/itens/migrations-f38.test.ts` cobra.

---

## 4. O que mudou, por arquivo

### Frente A — banco

| Arquivo | O que faz |
|---|---|
| `supabase/migrations/0125_item_chave_e_regularizacao.sql` | `public.item_chave(text)` (espelho char a char de `colaborador_chave`) · `itens.nome_chave` gerada + índice único · `itens.criado_por` **anulável** · policy de INSERT de `itens` → `pode_escrever()` · `lancamentos_item.regularizacao` + índice parcial |
| `supabase/migrations/0126_lancamento_regulariza.sql` | Recria as duas RPCs com a **partição da quantidade** e cria `lancar_itens_lote` (o avulso transacional) |
| `supabase/migrations/0127_conversao_reservas.sql` | Conversão única e só-INSERT das reservas abertas · a **11ª** checagem `reserva_aberta` |

### Frente B — funções puras

`src/lib/itens/chave.ts` + `chave-sql.test.ts` (a guarda TS↔SQL) · `regularizacao.ts` +
`regularizacao.test.ts` (a partição e os textos) · `estorno.ts` (o inverso do acerto) ·
`escolha-tipo.ts` (4 grupos, uma pergunta) · `src/lib/dominio.ts` (rótulos e tintas).

### Frente C — actions e fluxo

`actions/movimentacoes.ts` (`montarItensJunto` manda `observacao_regularizacao`; o estorno lê
`regularizacao`) · `actions/itens.ts` (`criarItemInline` para operador e pela chave; `lancarItens`
pela RPC) · `actions/pendencias.ts` · `checklist-faltantes.tsx` (o botão "Cadastrar") ·
`painel-sucesso.tsx` e `nova-movimentacao-form.tsx` (a linha do acerto) · `queries/dev.ts` (a 11ª) ·
as superfícies de rótulo do relatório e do CSV.

### Frente D — texto e documentação

`ajuda/conteudo/` (8 páginas) · `actions/erros.ts` · `ESPECIFICACAO.md` (§5 e três regras novas no
§8) · `MATRIZ-REGRAS.md` (6 regras novas) · `ARQUITETURA.md` §10 · `DECISOES.md` (11 atas) ·
`DIVIDA-TECNICA.md` · `README.md` · `CHANGELOG.md` · **`ADR-002` e `CLAUDE.md`**, que afirmavam que
`colaboradores` era o ÚNICO cadastro em que o operador insere — a partir da F41 são dois.

---

## 5. A verificação — saída real

### 5.1 Os quatro comandos (depois de tudo)

```
=== npm run lint ===
> estoque-ti-wap@1.46.0 lint
> eslint
[exit 0]

=== npm run test ===
 Test Files  144 passed (144)
      Tests  3291 passed (3291)
   Duration  254.63s
[exit 0]

=== npm run contraste ===
| F40 | Aviso informação (escuro) | escuro | `muted-foreground` | `muted/50` | 6.39:1 | 4.5:1 | ✅ AA |
[exit 0]

=== npm run build ===
✓ Compiled successfully in 54s
✓ Generating static pages using 7 workers (31/31) in 1898ms
[exit 0]
```

Da linha de base (142 arquivos / 3.233 testes) para **144 / 3.291**: +2 arquivos e +58 testes.

### 5.2 Os roteiros SQL no ensaio

| Roteiro | Resultado | Rodadas |
|---|---|---|
| `f41_regularizacao.sql` (**novo**) | **25 ok / 0 falhas** | 3× (prova contra intermitência) |
| `f38_itens_com_ativo.sql` (+3 cenários) | **51 ok / 0 falhas** | 2× |
| `papeis_rls.sql` (3c invertido +2) | **76 ok / 0 falhas** | 2× |
| `cargo_dev.sql` | 46 ok / 0 falhas | 1× |
| `conflito_filiais.sql` | 38 ok / 0 falhas | 1× |
| `transferencia_item.sql` | 18 ok / 0 falhas | 1× |
| `dev_destrutivo.sql` | 101 ok / **7 falhas** | ver §5.4 |
| Os outros 16 | rodaram sem erro; **sem tabela de resumo**, então não são verificáveis por MCP | 1× |

**Todos os 24 rodaram** — mexer em função obriga a pasta inteira, que foi o furo da F15.

### 5.3 O CI — os dois jobs

Run **33428109420** (PR [#18](https://github.com/vmatusita/ti-wap-inventory-control/pull/18)):

```
verificar: success
banco:     success
```

O job `banco` sobe um Postgres novo, aplica `0001`→`0127` e roda os 24 roteiros com
`ON_ERROR_STOP`, falhando em qualquer `WARNING: ✗`.

### 5.4 `dev_destrutivo.sql`: falha no ensaio, passa no CI — e por quê

As 7 falhas (`6a_FALHOU`, `6b_SOBROU`, `6d_…`, `7a_FALHOU`, `7c_SOBROU_ACERVO`, `7f_TRILHA_RESET`,
`7g_VOCABULARIO`) estão todas na cadeia do reset — e o próprio cabeçalho do arquivo avisa que 6b/6d/7c
são consequência de 6a. **Não é regressão da F41**, e a prova é o job `banco` verde: ele parte de um
Postgres zerado com estas migrations aplicadas. As contagens que `resetar_acervo` revalida são de
`ativos`, `movimentacoes`, `anotacoes`, `pendencias_item` e `termos_gerados` — nenhuma tabela que a
fase toca. O que falha é o **estado acumulado do projeto de ensaio**. Registrado em `DECISOES.md` e
anotado em `DIVIDA-TECNICA.md`.

---

## 6. Os doze critérios de aceite

| # | Critério | Prova |
|---|---|---|
| 1 | O caso do print grava | `f41_regularizacao.sql` cen. **1**, **1b**, **1c** — uma linha de acerto, total 1, estoque 1, as duas movimentações do equipamento existem, e o acerto está amarrado à movimentação |
| 2 | Devolução de 2 com 1 em aberto | cen. **2** e **2b** — `retorno 1` + `ajuste +1` marcado; total +1, estoque +2, em uso 0 |
| 3 | Entrega sem saldo | cen. **3** — total 3, estoque 0 |
| 4 | "Item recuperado" sem saldo prévio | cen. **4** — total 6, estoque 6, 1 acerto |
| 5 | Estorno desfaz as DUAS linhas | cen. **5** (desfaz) e **5b** (a contraprova: sem o inverso do acerto, a `0121` recusa) |
| 6 | Reservas viraram saída, estoque idêntico | §2.3 e §8 — par a par |
| 7 | Operador cadastra item; item nasce com o tipo | `papeis_rls.sql` **3c** (cria), **3c-quater** (não edita, 0 linhas), **3c-quinquies** (a chave deduplica); `tipo_id` no `criarItemInline` e no `checklist-faltantes.tsx` |
| 8 | Nome duplicado recusado em pt-BR | cen. **11b** + `3c-quinquies` + `chave-sql.test.ts` (12 casos, corpus conferido contra o Postgres) |
| 9 | Nenhum lançamento histórico alterado | §8 — `58 + N` com N contado; `guarda_acervo` de pé |
| 10 | Nenhuma tela oferece o vocabulário morto | §7 |
| 11 | Os quatro comandos, os roteiros e os dois jobs do CI | §5.1, §5.2, §5.3 |
| 12 | O avulso regulariza igual ao checklist | cen. **6** (mesmo par de linhas) e **6b** (tudo ou nada) |

---

## 7. O critério 10 — o `grep`, e a justificativa de cada sobrevivente

```bash
grep -rn -iE "liberaç(ão|ao)|atrelar|atrelad" src/
```

Depois de **três** rodadas de limpeza (a primeira achou 10 ocorrências de texto de tela, a segunda
mais 2, e a terceira o `repetirUltimo`), o que sobra está classificado assim:

| Classe | Onde | Por que fica |
|---|---|---|
| **Valor de enum / nome de coluna** | `saldo-apos.ts`, `queries/relatorios/itens.ts`, `relatorios/tipos.ts`, `exportar.ts` (`l.atrelados`), `mostrarAtrelados` | Os VALORES do enum e os nomes das colunas SQL **não mudam** — está no fora-de-escopo da ordem. O rótulo que o usuário lê já é "Reservado" |
| **Casamento da mensagem do Postgres** | `actions/erros.ts:64-65` (`'atrelado aberto'`, `'liberacao maior'`) | É a substring da mensagem que o **trigger** emite, e o trigger não mudou. Trocar aqui faria a tradução parar de casar |
| **Termo de BUSCA** | `itens-por-quantidade.ts:58`, `lancar-itens.ts:52` | **De propósito:** quem aprendeu a operar com "atrelado" tem de achar a página que explica que o nome mudou. Termo de busca é porta de entrada, não rótulo |
| **Texto histórico que explica a mudança** | `itens-por-quantidade.ts:105` | A página **precisa** dizer "antes havia Atrelar, e ele saiu". Travado por asserção de contexto no `referencia.test.ts` |
| **Entradas antigas do registry de versões** | `versoes/registry.ts` (v1.28.x, v1.3.x…) | São o histórico do que foi entregue **naquela data**. Reescrevê-las seria falsificar o changelog |
| **Comentário de código** | `page.tsx:226`, `itens-tabela.tsx:130`, `historico-lancamentos.tsx:132`, `lancar-item-dialog.tsx:696`, `validators/item.ts:74` | Não é texto de tela. Alguns ficaram desatualizados e são dívida cosmética anotada |

**Nenhum rótulo de tela oferecendo "Liberação", "Atrelar" ou "Retorno" sobrou.** O histórico
continua legível: o filtro de tipo mostra "Reserva" e "Devolução de reserva", derivados de
`TIPO_LANCAMENTO_META`.

---

## 8. O rollout em produção

Ordem seguida à risca (`RUNBOOK-BANCO.md`): backup → `0125` → `0126` → verificar → `0127` →
contagem por contagem → `notify pgrst` → tipos → merge → deploy → smoke.

### 8.1 O backup, antes de qualquer escrita

`scratchpad/backup-reservas-producao-2026-08-31.json` — **12 linhas** (todos os lançamentos com
chamado, não só os 5 grupos abertos) · `scratchpad/producao-saldo-antes.txt` — **30 linhas**, uma por
par item×filial. O `scratchpad/` é ignorado pelo git por construção, e é onde o dado real fica.

### 8.2 Depois da `0125` e da `0126`

| Verificação | Esperado | Real |
|---|---|---|
| `item_chave(text)` — assinatura, volatilidade, strict | 1 linha, `i`, `true` | ✔ |
| `item_chave(x) = colaborador_chave(x)` | `true` | ✔ |
| Policies de `itens` | `escrita cria item`/INSERT · `admin atualiza`/UPDATE · `admin apaga`/DELETE · `leitura operador`/SELECT | ✔ (4, nenhuma a mais) |
| As três RPCs | 3 linhas, `prosecdef = false`, contador presente | ✔ |
| Grants | `authenticated` + dono; **sem** `anon`, **sem** `service_role` | ✔ |
| `lancamentos_item` | 58 (nenhuma das duas grava acervo) | ✔ **58** |
| `itens` | 22 (o índice único não derrubou nada) | ✔ **22** |
| `valida_lancamento_item` — md5 do corpo | `be4be02fe97acfe7aff9a752cd73b58d` | ✔ **intocado** |

### 8.3 A conversão da `0127` — a prova par a par (critério 6)

Saída literal do `diff -u` entre a foto de saldo antes e depois, nos 30 pares:

```
--- producao-saldo-antes.txt
+++ producao-saldo-depois.txt
@@ -1,11 +1,11 @@
-item=39 filial=1 total=41 reservado=1 em_uso=7 estoque=33
+item=39 filial=1 total=41 reservado=0 em_uso=8 estoque=33
 item=39 filial=2 total=0 reservado=0 em_uso=0 estoque=0
 item=39 filial=3 total=1 reservado=0 em_uso=0 estoque=1
-item=39 filial=4 total=1 reservado=1 em_uso=0 estoque=0
+item=39 filial=4 total=1 reservado=0 em_uso=1 estoque=0
 item=40 filial=1 total=65 reservado=0 em_uso=0 estoque=65
 …
-item=40 filial=4 total=1 reservado=1 em_uso=0 estoque=0
+item=40 filial=4 total=1 reservado=0 em_uso=1 estoque=0
 …
-item=133 filial=4 total=1 reservado=1 em_uso=0 estoque=0
+item=133 filial=4 total=1 reservado=0 em_uso=1 estoque=0
 …
-item=134 filial=4 total=1 reservado=1 em_uso=0 estoque=0
+item=134 filial=4 total=1 reservado=0 em_uso=1 estoque=0
```

**`total` e `estoque` IDÊNTICOS nos 30 pares.** Mudaram só `reservado` (→ 0) e `em_uso` (+1), e só
nos **5** pares convertidos. É o critério 6, provado linha a linha e não no agregado.

### 8.4 As contagens, antes × depois (critérios 6 e 9)

| Medida | Antes | Depois | Leitura |
|---|---|---|---|
| `lancamentos_item` | 58 | **68** | +10 = exatamente as 10 linhas da conversão (5 grupos × 2) |
| … `ajuste` | 22 | **22** | intacto |
| … `entrada` | 13 | **13** | intacto |
| … `reserva` | 5 | **5** | intacto — a conversão **não apaga** a reserva, ela a FECHA |
| … `retorno` | 4 | **4** | intacto |
| … `saida` | 14 | **19** | +5 (a saída que reabre cada unidade) |
| … `liberacao` | 0 | **5** | +5 (o fechamento de cada reserva) |
| … marcados `regularizacao` | — | **0** | correto: a conversão **não é** regularização |
| **Σ total** | 264 | **264** | **idêntico** |
| **Σ em estoque** | 244 | **244** | **idêntico** |
| Σ reservado | 5 | **0** | zerado |
| Σ em uso | 15 | **20** | +5 |
| Grupos com reserva aberta | 5 | **0** | ✔ |
| Pares com lançamento | 30 | **30** | intacto |
| `itens` (todos com `nome_chave`) | 22 | **22 / 22** | o índice único entrou limpo |
| `pendencias_item` abertas | 14 | **14** | intacto |

**Critério 9 provado:** `58 + 10`, e as 10 são nomeáveis uma a uma. Nenhum tipo histórico mudou de
contagem — `guarda_acervo` (`0081`) recusa UPDATE e DELETE a todo mundo, service role incluso.

### 8.5 Os dois bancos convergiram, byte a byte

`md5(prosrc)` das seis funções tocadas, comparado entre produção e ensaio:

| Função | md5 (idêntico nos dois) |
|---|---|
| `criar_movimentacao_com_itens` | `046ecfc854b221c88a3abf2f388d66c0` |
| `resolver_pendencias_item_com_lancamentos` | `a1b8a8bd767373d738c5135801fb152e` |
| `lancar_itens_lote` | `3df9cc3a5a9988692e955bd561cf8b89` |
| `item_chave` | `49effffa794c5b2766b6741425bf31d3` |
| `dev_checagens_integridade` | `32ea68625e378be43eae4c5794da4345` |
| `valida_lancamento_item` | `be4be02fe97acfe7aff9a752cd73b58d` (**intocado**) |

A divergência de comentário que existia entre os ambientes **antes** desta fase convergiu.

### 8.6 A janela entre o SQL e o deploy

Ela existiu e foi curta, e o desenho a tornou inofensiva: **a assinatura das RPCs não mudou**, então
entre a `0126` e o deploy a aplicação no ar continuou chamando o que sempre chamou. As chaves novas
(`observacao_regularizacao` no payload; `regularizacoes`/`unidades_regularizadas` no retorno) são
aditivas — chamador antigo ignora o que não conhece, e uma linha sem a justificativa só é recusada
se a partição fosse mesmo necessária, com mensagem clara.

### 8.7 Deploy e smoke

Merge `--no-ff` na `main`, push, tag anotada **`v1.46.0`** publicada
(`28cc11e3b8ad609a0fd2167056c67e56933a1945`).

**CI na `main` (run 33435461547): `verificar: success` · `banco: success`.**

`node scripts/smoke/smoke-prod.mjs`:

```
========================================================================
RESUMO · 103 OK · 1 aviso · 0 n/a (pré-F12) · 0 falha
========================================================================
```

103 rotas e leituras OK, **zero falhas**. O único aviso é **pré-existente e alheio à fase**:
`kits_modelos · anon NÃO lê (RLS) — anon leu 0 linhas, mas não há kit cadastrado — RLS não
comprovada`. É um caso que não consegue se provar por falta de dado, não uma falha.

### 8.8 As onze checagens de `/dev`

A função devolve **11 blocos** em produção (contados no corpo) e contém `reserva_aberta`. A conta
que ela faz, rodada à parte: **0 reservas abertas**. A RPC exige cargo `dev` por dentro — chamá-la
com o service role dá `42501`, que é a guarda funcionando.

---

## 9. A revisão adversarial

Dois revisores em contexto fresco, nenhum autor do código, instruídos a apontar só lacunas de
correção ou de requisito — nunca preferência de estilo — e a sustentar todo achado com evidência.

| Revisor | Recorte | Veredito |
|---|---|---|
| **1** | O diff inteiro contra `PLAN-F41.md` e os 12 critérios | **limpo — 0 bloqueantes** |
| **2** | Só as migrations, byte a byte, contra o corpo lido do banco | **0 bloqueantes**, 1 achado de documentação |

**O revisor 2 foi mais rigoroso do que o pedido**, e vale registrar o método: em vez de transcrever
o texto de `pg_get_functiondef` (uma transcrição sua já tinha introduzido um erro de digitação, que
o próprio hash denunciou), ele comparou `prosrc` — o corpo literal armazenado pelo Postgres — por
**MD5 contra o texto exato dos arquivos de migration**, provando que o que está aplicado É o que os
arquivos dizem, sem drift, antes de rodar o `diff`.

**Os dois achados, e o que foi feito com eles:**

1. *(revisor 1, não bloqueante)* **"Repetir último" podia ressuscitar um tipo que a tela não oferece
   mais.** Não era hipótese: a conversão da `0127` gravou `liberacao` e `saida` hoje, em nome de quem
   fez as reservas. Não gravava dado errado — o trigger recusaria —, mas a mensagem seria sobre uma
   reserva que o operador não sabe que existiu. **Corrigido** (commit `07876c1`): tipo fora dos
   oferecidos volta em branco, mesma guarda que a filial já tinha.
2. *(revisor 2, não bloqueante)* **O trigger tem CINCO guardas, e a migration dizia quatro.** A
   quinta é a checagem por PESSOA da `0118`. O revisor refez a conta antes de apontar e concluiu que
   a partição não a afeta — ela só DIMINUI a quantidade do `retorno` (`mín(q, A) ≤ q`), então todo
   retorno que passaria com a quantidade cheia continua passando com a partida. **Documentação
   corrigida** (commit `d53dd0d`) no cabeçalho da `0126`, na MATRIZ e no `PLAN-F41`, com a conta
   escrita — quem for mexer nisso depois merece o número certo.

Nenhum dos dois apontou guarda afrouxada ou trava sumida, que a ordem classifica como bloqueante por
definição.

---

## 10. Decisões, dívidas e o que fica para a F42

**Decisões:** onze atas em [`DECISOES.md`](DECISOES.md) na data de hoje — as seis do Johnny, os dois
pontos em que o plano errava a linhagem, a divergência ensaio↔produção, o `criado_por` anulável, o
acerto sem vínculo com pessoa, os cinco testes que mudaram porque a regra mudou, o `db:types` velho,
a armadilha do `created_at` e o veredito sobre o `dev_destrutivo`.

**Dívidas** (em [`DIVIDA-TECNICA.md`](DIVIDA-TECNICA.md)): **uma quitada** — o carrinho sem transação
— e três novas, todas pequenas e com dono: o índice `itens_nome_uidx` redundante, a marca
`regularizacao` gravável por fora das RPCs (mislabel, não escalada) e a partição ser do par e não da
pessoa (protegida pela §C.3 na aplicação). Mais a lição de processo: **tipos que só se regeneram
quando alguém lembra acumulam divergência silenciosa** — vale um passo de CI.

**Para a F42** (as telas, `PLANO-ITENS.md` §6): `/itens` no casco da F40, uma tabela só, o histórico
em rota própria, o diálogo de 876 linhas encolhido, a **prévia da regularização** antes de gravar
(usando a mesma função pura desta fase), a coluna **"Em uso"** — que a F41 nomeou mas não
transformou em coluna — e o selo "regularizado" na ficha do ativo.
