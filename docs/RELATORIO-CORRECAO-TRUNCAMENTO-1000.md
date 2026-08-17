# Relatório — correção do truncamento de 1.000 linhas nas leituras do Supabase

> Entrega **avulsa fora de fase** · versão **1.40.2** · 17/08/2026
> Branch `fix/truncamento-as-of-1000` · plano em [`docs/PLANO-CORRECAO-TRUNCAMENTO-1000.md`](PLANO-CORRECAO-TRUNCAMENTO-1000.md)
> **Zero migration** — `supabase/` intocado.

---

## 1. Causa raiz

A API de dados do Supabase (PostgREST) corta **qualquer** resposta em **1.000 linhas**
(`max-rows`). O corte é **silencioso**: quem lê uma coleção maior sem paginar recebe 1.000
linhas e nenhum erro.

O acervo passou de 1.000 ativos nos imports de go-live (20–31/07/2026). Desde então, todo
ponto de leitura não paginado que abrange o acervo inteiro devolvia número errado.

O remédio já existia no repositório — `paginarTodos`, em
[`src/lib/queries/relatorios/comum.ts`](../src/lib/queries/relatorios/comum.ts), desde a F3 —
mas não estava aplicado em todos os pontos.

### 1.1 O bug principal

[`lerEstadoAtivos`](../src/lib/queries/relatorios/estoque.ts) tem dois caminhos:

| caminho | condição | como lia | resultado |
|---|---|---|---|
| *fast path* | `ate >= hoje` | `paginarTodos` sobre `ativos` | **certo** (1.647) |
| **as-of** | `ate < hoje` | `client.rpc('rel_estoque_asof')` **sem paginação** | **1.000** (truncado) |

Como `kpis` sai de um caminho e `kpisAnterior` do outro, o comparativo do relatório anunciava
**+647 ativos** que nunca entraram.

**A função SQL sempre esteve correta.** Provado em produção antes de qualquer alteração:

```
ativos total: 1651 | fora de baixa: 1647
rel_estoque_asof 15/08 consolidado SEM paginacao: 1000
  ... com .range(1000,1999): 648 => total real: 1648
```

### 1.2 Segundo bug — encontrado nesta análise, não estava no diagnóstico

`rel_estoque_asof` **não tem `ORDER BY`** no `select` final
(`supabase/migrations/0109_devolucao_direta_e_re_reserva.sql:299`). `.range()` vira
OFFSET/LIMIT, e OFFSET sobre uma relação **sem ordem total** é indefinido: nada obriga duas
consultas independentes a enumerarem as linhas na mesma sequência (o plano pode mudar entre
elas), então páginas vizinhas podem **repetir e perder** linhas.

Aplicar a paginação sem tratar isso trocaria um bug de contagem por outro, mais difícil de ver.
Medição em produção (sonda descartável, só leitura):

```
consolidado 2026-08-15 | order=NENHUM   | linhas=1648 | distintos=1648 | duplicadas=0
consolidado 2026-08-15 | order=ativo_id | linhas=1648 | distintos=1648 | duplicadas=0
Matriz(1) 2026-08-15   | order=NENHUM   | linhas=1169 | distintos=1169 | duplicadas=0
Matriz(1) 2026-08-15   | order=ativo_id | linhas=1169 | distintos=1169 | duplicadas=0
repetibilidade COM order: |A|=1648 |B|=1648 B\A=0
repetibilidade SEM order: |A|=1648 |B|=1648 B\A=0
```

As duas passadas concordam **hoje** — mas isso é propriedade do plano atual, não garantia. A
correção impõe `.order('ativo_id')` **na chamada** (uuid, uma linha por ativo → ordem total),
sem tocar o SQL. Ata: `2026-08-17 · A ordem total é imposta na CHAMADA da RPC`.

---

## 2. O que mudou, e por quê

### 2.1 Núcleo — `src/lib/queries/relatorios/comum.ts`

- **`paginarTodos` não mudou de assinatura.** O builder de RPC do supabase-js aceita
  `.range()` e resolve para `{ data, error }` — a mesma forma que o callback já esperava, então
  serve como *drop-in*. O que faltava era **documentar a exigência de ordem total**, agora
  escrita no cabeçalho da função (e não só num commit que ninguém relê).
- **`paginarPorIds` (novo)** — lotes de 100 ids para as leituras `.in('col', ids)`, cada lote
  paginado por dentro. Resolve **dois** limites: o `max-rows` e o **tamanho da URL** (um `.in()`
  viaja na query string; 1.000 uuid passam de 37 KB e a requisição morre no proxy com 414 antes
  de qualquer truncamento). Ata: `2026-08-17 · O .in(ids) grande vira lotes de 100`.

### 2.2 Os 12 pontos corrigidos

| # | ponto | tabela/RPC | por que estava errado |
|---|---|---|---|
| 1 | `queries/relatorios/estoque.ts` `lerEstadoAtivos` (as-of) | rpc `rel_estoque_asof` | **o bug principal** — uma linha por ativo (1.647) |
| 2 | `queries/relatorios/estoque.ts` `manutencaoDeEstado` (retornos) | `movimentacoes` | filtro só por tipo + período, que pode ser o preset "Tudo" |
| 3 | `queries/relatorios/estoque.ts` `manutencaoDeEstado` (devoluções) | `movimentacoes` | idem, outro tipo |
| 4 | `queries/relatorios/estoque.ts` `manutencaoDeEstado` (envios) | `movimentacoes` | `.in(ids)` — `ids` **perdeu o teto acidental** ao paginar 2 e 3 |
| 5 | `queries/relatorios/estoque.ts` `manutencaoDeEstado` (anotações) | `anotacoes` | idem 4 |
| 6 | `queries/relatorios/estoque.ts` `dadosAtivos` | `ativos` | mesmo efeito dominó; lista grande estoura a URL |
| 7 | `queries/relatorios/estoque.ts` `chamadoAteData` | `movimentacoes` | já paginava, mas o `.in(ids)` ia inteiro |
| 8 | `queries/relatorios/itens.ts` `getGruposItens` (obs) | `lancamentos_item` | usava **`.limit(1000)` fixo** — o comentário do arquivo afirmava `paginarTodos` |
| 9 | `queries/dev-destrutivo.ts` `listarItensDestrutivo` | `lancamentos_item` | `select` **sem filtro nenhum**; o comentário justificava com o catálogo, mas lê o histórico |
| 10 | `queries/movimentacoes.ts` `listarMovimentacoesDoAtivo` | `movimentacoes` | linha do tempo da ficha, sem teto — corte aqui esconde história |
| 11 | `queries/conflitos.ts` `ladosDosAtivos` | `v_conflitos_filiais` | o teto de 200 existe só no call site que **apaga**, não no preview |
| 12 | `scripts/import/carga.ts` `executarItens` | `lancamentos_item` | teto por convenção de texto; um corte reimportaria abertura já lançada |

**Efeito colateral que precisou ser tratado junto (4, 5, 6):** paginar os retornos/devoluções
removeu um teto que era **acidental** — a lista `ids` só era pequena porque as leituras que a
produziam truncavam. Corrigir 2 e 3 sem corrigir 4–6 teria trocado um truncamento por outro.

### 2.3 Testes

`paginarTodos` **não tinha teste nenhum** (não existia `comum.test.ts`). Ganhou **13 casos** em
[`comum.test.ts`](../src/lib/queries/relatorios/comum.test.ts), entre eles o que **era** o bug:

> **página exatamente cheia exige a leitura seguinte** — 1.000 linhas é indistinguível de
> "acabou em 1.000" sem uma segunda leitura.

Também: erro na 2ª página lança (não devolve as 1.000 da primeira como se fossem o total),
`data` nulo encerra sem erro, `paginarPorIds` quebra 250 ids em 3 lotes e pagina **dentro** do
lote, e a invariante que sustenta a ordenação por lotes (um ativo nunca se divide entre dois).

O repositório testa só funções puras e **não tem** convenção de mock de builder encadeado do
Supabase — os testes respeitam isso: simulam o **callback de página**, não o cliente.

---

## 3. Varredura mesma-raiz — a tabela completa

**217 pontos** de leitura Supabase enumerados em `src/` e `scripts/` (`.rpc(`, `.select(`,
`.in(`), em **50 arquivos**:

| veredito | pontos |
|---|---|
| seguro estruturalmente | 174 |
| já paginado | 29 |
| **corrigido nesta entrega** | **12** |
| investigado e mantido (com motivo) | 2 |
| **total** | **217** |

> **De onde vêm os 12.** A varredura classificou 5 pontos como `corrigir` e 7 como
> `investigar`. Os 12 corrigidos são: esses **5**, mais **5** dos `investigar` (os envios e
> anotações da manutenção, a linha do tempo, os lados de conflito e a carga de go-live), mais
> **2 promovidos por análise** — `dadosAtivos`, que a varredura dera como seguro, e
> `chamadoAteData`, que ela dera como já paginado: os dois dependiam do teto **acidental** que
> paginar os retornos/devoluções removeu (§2.2). É por isso que "seguro estrutural" e "já
> paginado" aparecem aqui com **um a menos** que no plano (175→174 e 30→29): o plano foi escrito
> antes dessa promoção. Restam **2** `investigar`, tratados no §3.1.

### 3.1 Investigados e **não** corrigidos

- **`actions/importar.ts:403` `aplicarImport`** — é payload de **escrita** (RPC
  `importar_ativos_substituir`); `max-rows` corta **leitura**. Fora da causa raiz. *Observação
  para o futuro:* o schema do plano de import não tem `.max()`, então uma filial muito grande
  depende de teto de payload/timeout, não deste corte — assunto de outra ordem.
- **`actions/exportar.ts:504` `exportarItensSaldosCSV`** — delega a
  `getSaldosPorFilial`/`getSaldosItensDeFiliais`, que agregam **por item do catálogo**
  (`group by i.id`); `rel_frescor_itens` agrega por grupo (enum de 2 valores). Domínio pequeno e
  curado → seguro estruturalmente.

### 3.2 Tabela ponto a ponto

#### `scripts/import/carga.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 120 | buscarFiliais | filiais | seguro estrutural | Tabela de cadastro fixo (5 unidades) — não cresce com o acervo. |
| 166 | buscarAtivosExistentes | ativos | já paginado | Implementa a MESMA técnica de paginação que falta em src/lib/queries/relatorios/estoque.ts — .range() em loop até página incompleta. É o ponto mais crítico do diretório (dedup de TODO o ace… |
| 194 | buscarMovimentacoesExistentes | movimentacoes | já paginado | Mesmo padrão de paginação correta do ponto anterior, aplicado a movimentacoes. |
| 295 | executarAtivos | ativos (insert+select) | seguro estrutural | O insert é fatiado em lotes de 200 (BATCH=200) pelo próprio código — o .select() de retorno nunca excede o tamanho do lote, bem abaixo de 1000. |
| 439 | executarItens | itens | seguro estrutural | itens é o catálogo de TIPOS (mouse, carregador etc.), não o acervo de ativos — teto estrutural de dezenas. |
| 448 | executarItens | itens (insert+select) | seguro estrutural | Insert de 1 item + .single(), nunca mais de 1 linha. |
| 463 | executarItens | lancamentos_item | **CORRIGIDO** | O filtro por observação literal limita hoje a leitura a ~120 linhas, mas é uma leitura de lancamentos_item (tabela que cresce continuamente) sem nenhum .limit()/.range() de segurança — dife… |
| 584 | main | itens | seguro estrutural | Mesma tabela itens — catálogo de tipos, não de unidades físicas. |

#### `scripts/import/guard.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 66 | resolverAdmin | auth.admin.listUsers | já paginado | Não é .select/.rpc de tabela, mas é uma Admin API sujeita ao mesmo tipo de corte por página — já implementa loop de paginação até a última página incompleta. |
| 74 | resolverAdmin | profiles | seguro estrutural | Busca por chave primária com maybeSingle(), nunca mais de 1 linha. |

#### `scripts/perf/medir.mjs`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 221 | descobrirContexto | ativos | seguro estrutural | limit(1) explícito para pegar 1 id de amostra — nunca lê mais que isso, independente do volume do acervo. |
| 226 | descobrirContexto | filiais | seguro estrutural | Mesmo padrão do ponto anterior: limit(1) para pegar 1 slug de filial de amostra. |
| 234 | descobrirContexto | relatorios_gerados | seguro estrutural | limit(1) para pegar 1 id de snapshot de amostra. |
| 245 | descobrirContexto | senhas_acesso | seguro estrutural | limit(1) para pegar 1 senha de acesso ativa de amostra. |
| 253 | descobrirContexto | senhas_acesso | seguro estrutural | Mesmo fallback do ponto anterior, agora com service role quando a RLS do operador recusa — ainda limit(1). |

#### `scripts/reset.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 52 | main | resetar_dados_ficticios | seguro estrutural | A RPC devolve um jsonb escalar com contagens agregadas, não um conjunto de linhas — o corte de max-rows do PostgREST não se aplica a objeto único. |

#### `scripts/seed.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 734 | reforcarPendenciaSemPatrimonio | ativos (update) | seguro estrutural | UPDATE ... WHERE id IN (...) não devolve linhas, não sofre o corte de max-rows; a lista de ids é pequena e fixa em memória. |
| 753 | inserirCasosDevolucaoFornecedor.insAtivo | ativos (insert+select) | seguro estrutural | Insert de 1 ativo fictício seguido de .select().single(); nunca há mais de 1 linha para truncar. |
| 810 | inserirItens | itens (insert+select) | seguro estrutural | O retorno do insert nunca pode ter mais linhas que o array de entrada, que é fixo em 24 itens no código. |
| 963 | inserirAnotacoes | ativos | seguro estrutural | Tem .limit(6) explícito — mesmo com milhares de ativos em manutenção, nunca devolveria mais que 6. |
| 1294 | garantirPerfisSeed | profiles | seguro estrutural | Filtro por chave primária única + maybeSingle() garante no máximo 1 linha. |
| 1317 | garantirPerfisSeed | profiles (update+select) | seguro estrutural | UPDATE filtrado por chave primária; o .select() final só detecta 0-linhas-afetadas, nunca excede 1. |
| 1455 | sumario (via lerPaginado) | ativos | já paginado | O código documenta explicitamente o bug do max-rows e implementa lerPaginado() com .range() em loop para contorná-lo — mesmo padrão do paginarTodos de src/lib, aplicado corretamente. |
| 1460 | sumario (via lerPaginado) | movimentacoes | já paginado | Mesmo helper lerPaginado() paginado corretamente, aplicado a movimentacoes. |
| 1546 | sumario | rel_saldo_itens | seguro estrutural | rel_saldo_itens agrega por item do catálogo (itens por quantidade), não por ativo — teto estrutural é o tamanho do catálogo (~24), bem abaixo de 1000. |
| 1549 | sumario | rel_saldo_itens | seguro estrutural | Mesma RPC do ponto anterior, chamada avulsa para Linhares — mesmo teto pelo catálogo de itens. |
| 1617 | main | filiais | seguro estrutural | filiais é tabela de cadastro fixo (5 unidades WAP) — não cresce com o acervo nem com movimentações. |
| 1632 | main | ativos (count only) | seguro estrutural | head:true faz o PostgREST devolver só o header Content-Range com a contagem exata, sem linhas — max-rows nunca entra em jogo. |

#### `scripts/smoke/smoke-prod.mjs`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 368 | CHECKS['ativos · campos do celular (F25)'] | ativos | seguro estrutural | Smoke de shape com limit(1) — por design nunca lê o acervo inteiro. |
| 389 | CHECKS['filiais · cidade do termo (F25)'] | filiais | seguro estrutural | Tabela de cadastro fixo (5 unidades) — não cresce. |
| 411 | CHECKS['ativos · contagem'] | ativos (count) | seguro estrutural | count:'exact' roda um COUNT(*) via header do PostgREST, não sujeito ao corte de max-rows das LINHAS; o .limit(1) garante que o corpo nunca tenta trazer mais que 1 linha — padrão deliberado … |
| 436 | CHECKS['ativos · shape da lista'] | ativos | seguro estrutural | Smoke de shape com limit(1). |
| 453 | CHECKS['movimentacoes · 1 página (30)'] | movimentacoes | seguro estrutural | Testa exatamente 1 página de 30 (mesmo tamanho da UI real de M8) — nunca tenta ler tudo; a contagem total é via count:'exact' no header, imune ao corte de linhas. |
| 478 | CHECKS['v_fila_pendencias · contagem'] | v_fila_pendencias (count) | seguro estrutural | Mesmo padrão seguro do ponto anterior (consultaContagem). |
| 510 | CHECKS['v_fila_pendencias · fila (shape)'] | v_fila_pendencias | seguro estrutural | Smoke de shape com limit(1). |
| 523 | CHECKS['v_pendencias · contagem'] | v_pendencias (count) | seguro estrutural | Mesmo padrão seguro do ponto anterior (consultaContagem). |
| 546 | CHECKS['v_pendencias · shape'] | v_pendencias | seguro estrutural | Smoke de shape com limit(1). |
| 558 | CHECKS['filiais · ativas'] | filiais | seguro estrutural | Tabela de cadastro fixo (5 unidades) — não cresce. |
| 569 | CHECKS['itens · catálogo ativo'] | itens (count, eq ativo=true) | seguro estrutural | Mesmo padrão seguro do ponto anterior (consultaContagem). |
| 581 | CHECKS['rpc rel_saldo_itens · consolidado'] | rel_saldo_itens | seguro estrutural | rel_saldo_itens agrega por item do catálogo de acessórios — teto estrutural de dezenas de linhas. |
| 613 | CHECKS['rpc rel_saldo_itens · por filial'] | rel_saldo_itens | seguro estrutural | Mesma RPC do ponto anterior, restrita a 1 filial — ainda menos linhas. |
| 622 | CHECKS['rpc rel_resumo'] | rel_resumo | seguro estrutural | rel_resumo é uma agregação de KPIs (contagens por status), não uma listagem — retorno estruturalmente pequeno. |
| 636 | CHECKS['rpc rel_mov_por_mes'] | rel_mov_por_mes | seguro estrutural | Agregação mês×tipo sobre uma janela de 365 dias — teto estrutural de dezenas de linhas, nunca por movimentação individual. |
| 649 | CHECKS['v_estoque_atual · por filial'] | v_estoque_atual | seguro estrutural | v_estoque_atual é GROUP BY filial,categoria,status sobre ativos — o volume de LINHAS é o produto cartesiano de dimensões pequenas e fixas, não o nº de ativos. |
| 658 | CHECKS['lancamentos_item · contagem'] | lancamentos_item (count) | seguro estrutural | count:'exact' não é afetado pelo volume da tabela — só conta, não lista. |
| 667 | CHECKS['termos_gerados · contagem'] | termos_gerados (count) | seguro estrutural | Mesmo padrão seguro do ponto anterior (consultaContagem). |
| 676 | CHECKS['relatorios_gerados · contagem'] | relatorios_gerados (count) | seguro estrutural | Mesmo padrão seguro do ponto anterior (consultaContagem). |
| 685 | CHECKS['profiles · operadores'] | profiles (count) | seguro estrutural | Mesmo padrão seguro do ponto anterior (consultaContagem). |
| 697 | CHECKS['itens.estoque_minimo (I5)'] | itens | seguro estrutural | Smoke de shape com limit(1). |
| 713 | CHECKS['kits_modelos · leitura autenticada'] | kits_modelos (count) | seguro estrutural | Mesmo padrão seguro do ponto anterior (consultaContagem). |
| 736 | CHECKS['kits_modelos · anon NÃO lê (RLS)'] | kits_modelos | seguro estrutural | Teste de segurança (RLS) com limit(1) — não é uma leitura de volume. |
| 765 | CHECKS['busca do combobox (B2)'] | ativos | seguro estrutural | Só extrai 1 patrimônio de amostra para montar o termo de busca — limit(1). |
| 780 | CHECKS['busca do combobox (B2)'] | ativos | seguro estrutural | Replica deliberadamente o mesmo limit(12) da busca de combobox em produção — nunca tenta trazer mais que isso. |
| 1154 | parteB | filiais | seguro estrutural | limit(1) para pegar 1 id de filial de amostra, usado pelos checks 'por filial' de rel_saldo_itens. |

#### `src/app/(app)/ativos/[id]/page.tsx`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 66 | generateMetadata | ativos | seguro estrutural | Busca por chave primária com maybeSingle. |

#### `src/app/(app)/dev/acoes-export.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 101 | lerTrilha | eventos_admin | já paginado | Implementação equivalente ao paginarTodos: o comentário do próprio arquivo cita explicitamente o Max Rows do PostgREST como motivo do desenho ("o laço avança pelo que REALMENTE chegou... Me… |

#### `src/app/(app)/page.tsx`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 121 | DashboardPage | v_fila_pendencias | seguro estrutural | `.limit(5)` explícito no fim da query torna o corte de 1000 do PostgREST irrelevante. |

#### `src/app/auth/definir-senha/page.tsx`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 24 | DefinirSenhaPage | profiles | seguro estrutural | Busca por chave primária com maybeSingle. |

#### `src/lib/actions/admin.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 353 | aplicarCargoEVinculos / definirStatusUsuario | definir_papel_usuario, definir_vi… | seguro estrutural | Gestão de cargo/vínculo/status é sempre por usuário único. |
| 629 | atualizarFilial | ativos | seguro estrutural | `{ count: 'exact', head: true }` não sofre corte de 1000 linhas (não há linhas no corpo da resposta). |

#### `src/lib/actions/ativos.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 61 | filialComMesmaIdentidade | ativos | seguro estrutural | Domínio estruturalmente pequeno: a checagem de conflito entre filiais (F24) só encontra linhas quando há duplicidade real de identidade, que é rara por desenho do sistema. |
| 115 | anotarAtivo / atualizarDadosCadastrais / corr… | ativos | seguro estrutural | Todas as leituras de ativos.ts (fora do helper filialComMesmaIdentidade) são buscas por chave primária de UM ativo. |

#### `src/lib/actions/auth.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 137 | definirAcesso | profiles | seguro estrutural | Update por chave primária do próprio usuário logado. |

#### `src/lib/actions/compras.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 73 | registrarCompra | ativos | seguro estrutural | MAX_LOTE_COMPRA=200 (src/lib/patrimonio.ts) limita o lote de compra, bem abaixo do corte de 1000. |
| 118 | registrarCompra | criar_compra_lote (rpc) | seguro estrutural | Mesmo teto do lote de compra; RPC devolve uma linha por ativo criado, ≤200. |

#### `src/lib/actions/conflitos.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 278 | apagarConflito | apagar_ativos_conflito_filiais (r… | seguro estrutural | Teto explícito de 200 (validators/conflitos.ts), abaixo do corte de 1000. |

#### `src/lib/actions/dev-destrutivo.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 204 | apagarAtivo / apagarMovimentacao / apagarItem… | apagar_ativo, apagar_movimentacao… | seguro estrutural | O padrão de retorno é sempre um objeto jsonb com contagens (não uma lista de linhas), então o corte de 1000 linhas do PostgREST não se aplica ao RETORNO da chamada — mesmo raciocínio nas li… |

#### `src/lib/actions/dev.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 151 | apagarUsuario | apagar_usuario (rpc) | seguro estrutural | Gestão de cargo dev sobre um único usuário-alvo. |
| 221 | encerrarSessoes | encerrar_sessoes_usuario (rpc) | seguro estrutural | RPC de retorno escalar sobre um usuário. |

#### `src/lib/actions/devolucao-fornecedor.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 72 | devolverAoFornecedor | ativos | seguro estrutural | Filtro por um único patrimônio; o par patrimônio+service_tag é raro o suficiente para nunca aproximar-se de 1000 linhas. |
| 125 | devolverAoFornecedor | devolver_ao_fornecedor (rpc) | seguro estrutural | Operação pontual (1 ativo + 1 substituto), não uma leitura de conjunto. |

#### `src/lib/actions/exportar.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 504 | exportarItensSaldosCSV | getSaldosPorFilial / getSaldosIte… | investigado — mantido | NÃO é uma chamada direta a .rpc/.select/.in dentro do escopo desta tarefa (é uma chamada de função para src/lib/queries/itens.ts), por isso não avaliei o volume real. Mas o comentário do pr… |

#### `src/lib/actions/importar.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 200 | filialPorId | filiais | seguro estrutural | Busca por chave primária. |
| 403 | aplicarImport | importar_ativos_substituir (rpc) | investigado — mantido | Não é o mesmo bug (não é um SELECT truncado), mas vale confirmar que a RPC/HTTP não tem outro teto de payload/timeout para uma filial muito grande — fora do escopo desta varredura (que é so… |
| 511 | urlBackup | import_logs | seguro estrutural | Busca por chave primária. |

#### `src/lib/actions/itens.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 174 | transferirItens | transferir_item (rpc) | seguro estrutural | Teto de 10 linhas no carrinho de transferência (validators/item.ts). |
| 213 | estornarLancamento | lancamentos_item | seguro estrutural | Busca por chave primária / índice único (estorna_id). |
| 367 | criarItemInline | itens | seguro estrutural | Tabela de catálogo pequena por natureza (cadastro manual de itens tipo mouse/cabo/carregador), nunca cresce com o histórico de movimentações. |
| 458 | excluirItem | lancamentos_item | seguro estrutural | `.select('*', { count: 'exact', head: true })` não retorna dados, só a contagem. |

#### `src/lib/actions/kits.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 62 | criarKit / atualizarKit | kits_modelos | seguro estrutural | Escrita de uma única linha do catálogo de kits (tabela pequena, curada em admin/kits). |

#### `src/lib/actions/movimentacoes.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 213 | registrarMovimentacoes | ativos | seguro estrutural | MAX_LOTE_MOVIMENTACAO=30 (validators/movimentacao.ts). |
| 325 | estornarMovimentacao | movimentacoes, ativos | seguro estrutural | Buscas por chave primária. |

#### `src/lib/actions/pendencias.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 38 | resolverPendenciaItem | pendencias_item | seguro estrutural | Cap defensivo de 500 no schema (o próprio comentário do validador diz "a resolução em lote da tela nunca chega" perto disso), abaixo do corte de 1000. |
| 120 | reabrirPendenciaItem | pendencias_item | seguro estrutural | Mesmo teto de 500 do schema irmão (resolverPendenciaItemSchema). |

#### `src/lib/actions/relatorios.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 136 | gerarRelatorio | relatorios_gerados | seguro estrutural | Insert de uma única linha com retorno .single(). |
| 192 | lerUltimaVersao | relatorios_gerados | seguro estrutural | `.limit(1)` explícito. |

#### `src/lib/actions/senhas.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 62 | entrarComSenha | registrar_tentativa_senha (rpc) | seguro estrutural | RPC de retorno escalar. |
| 74 | entrarComSenha | senhas_acesso | seguro estrutural | Tabela de configuração pequena e curada por admins, sem relação com volume de ativos/movimentações. |
| 208 | testarSenhaAcesso / definirStatusSenha | senhas_acesso | seguro estrutural | Busca por chave primária. |

#### `src/lib/actions/termos.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 122 | cidadesDasFiliais | filiais | seguro estrutural | prepararTermoSchema.movimentacaoIds tem .max(20); o dedup de filial_id nunca excede isso nem o total de filiais cadastradas. |
| 171 | prepararTermo | movimentacoes | seguro estrutural | prepararTermoSchema valida movimentacaoIds com z.array(...).max(20). |
| 465 | gerarTermo | movimentacoes, ativos | seguro estrutural | gerarTermoSchema valida movimentacaoIds e ativoIds com .max(20) cada. |
| 606 | confirmarAssinaturaTermo / desfazerConfirmaca… | ativos, termos_gerados | seguro estrutural | Buscas por chave primária individual (linhas 606-610, 663-667, 548-552 em urlTermo). |
| 767 | confirmarAssinaturaLote | ativos | seguro estrutural | Schema local no próprio arquivo limita o lote a 500 itens — mesmo padrão se repete no UPDATE .in('id', pendentesIds) da linha 794. |

#### `src/lib/auth/acesso.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 109 | lerPapel | papel_atual (rpc) | seguro estrutural | RPC de retorno escalar (PapelUsuario | null), fora do alcance do corte de 1000 linhas do PostgREST. |
| 138 | lerVinculo | pode_escrever_filial (rpc) | seguro estrutural | RPC escalar, mesmo raciocínio do papel_atual. |
| 174 | getOperador | profiles | seguro estrutural | Busca por chave primária com maybeSingle — sempre 0 ou 1 linha. |
| 202 | getOperador | filiais, operador_filiais | seguro estrutural | Tabelas de referência estruturalmente pequenas (cadastro de filiais), não crescem com o acervo/movimentações. |
| 432 | getViewerSession | senhas_acesso | seguro estrutural | Busca por chave primária com maybeSingle. |

#### `src/lib/queries/admin.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 112 | listarUsuarios (perfis) | profiles | seguro estrutural | Dominio explicitamente e a equipe interna (dezenas de contas), documentado no proprio codigo como decisao deliberada de mostrar todo mundo de uma vez; risco reconhecido e monitoravel pela c… |
| 118 | listarUsuarios (vinculos) | operador_filiais | seguro estrutural | Tabela N:N entre usuarios (dezenas) e filiais (5) - teto estrutural baixo. |
| 171 | idsDeAdminsAtivos | profiles | seguro estrutural | Subconjunto ainda menor da equipe (dezenas). |
| 216 | perfilPorEmail | profiles | seguro estrutural | Busca por chave primaria + maybeSingle, apos resolver o id via Auth (paginado a parte). |
| 254 | getEstadoUsuario | profiles + operador_filiais | seguro estrutural | Busca por um unico usuario. |
| 281 | listarFiliaisParaVinculo | filiais | seguro estrutural | 5 filiais cadastradas - dominio fixo e pequeno. |
| 300 | listarFiliaisAdmin | filiais + v_estoque_atual | seguro estrutural | filiais tem 5 linhas; v_estoque_atual e agregada por filial x categoria x status (view SQL confirmada, group by), teto de dezenas a poucas centenas. |
| 330 | listarMotivosAdmin | motivos | seguro estrutural | Catalogo de motivos - dezenas de linhas no maximo. |
| 351 | listarSenhasAcesso | senhas_acesso | seguro estrutural | Poucas senhas de acesso administradas manualmente. |

#### `src/lib/queries/ativos.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 161 | listarAtivos (queryLista) | ativos | seguro estrutural | Paginacao de UI com tamanho de pagina explicito e validado (ehTamanhoPagina). |
| 276 | buscarAtivoPorId | ativos | seguro estrutural | Busca por chave primaria + maybeSingle. |
| 303 | buscarVinculoAtivo | ativos | seguro estrutural | Busca por chave primaria + maybeSingle. |
| 317 | buscarSubstitutoDe | ativos | seguro estrutural | limit(1) + maybeSingle. |
| 340 | listarAnotacoesDoAtivo | anotacoes | seguro estrutural | Sem paginacao, mas dominio e anotacoes manuais de UM ativo - evento raro e opcional (nota de texto livre), muito abaixo de movimentacoes em frequencia; nunca se aproxima de 1000 por ativo. |
| 444 | patrimoniosDuplicados | ativos | seguro estrutural | Chamadores confirmados: combobox (<=12 resultados), buscarAtivoResumo (1 patrimonio), ultimosAtivosMovimentadosDoOperador (<=30 patrimonios) - nunca o acervo inteiro. |
| 477 | buscarAtivosParaCombobox | ativos | seguro estrutural | Teto fixo de 12 resultados. |
| 573 | listarAtivosParaExport | ativos | já paginado | Implementacao manual do mesmo padrao de paginarTodos: avanca por bloco.length real (nao pelo pedido), entao nunca trunca em silencio mesmo que o Max Rows do servico mude. |
| 632 | buscarAtivosResumoPorIds | ativos | seguro estrutural | Os dois call sites (restauracao de rascunho e ?ativos= da URL) passam por parseIdsDeAtivos, que corta em MAX_LOTE_MOVIMENTACAO=30 antes de chegar aqui. |
| 665 | buscarAtivosPorPatrimonios | ativos | seguro estrutural | Unico chamador e resolverPatrimoniosParaLote, que usa parsearLoteColado - recusa (erro) acima de MAX_LOTE_MOVIMENTACAO=30 linhas coladas antes de consultar o banco. |
| 687 | buscarAtivoResumo | ativos | seguro estrutural | Busca por chave primaria + maybeSingle. |

#### `src/lib/queries/compras.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 128 | sugestoesMarcas | ativos | já paginado | Varredura em blocos que avanca pelo recebido, com teto de 4000 (2,5x o acervo) e dedup em memoria. |
| 156 | sugestoesModelos | ativos | já paginado | Mesmo padrao de sugestoesMarcas. |
| 184 | sugestoesFornecedores | ativos | já paginado | Mesmo padrao de sugestoesMarcas. |
| 259 | dadosParaDuplicarCompra (ativo) | ativos | seguro estrutural | Busca por chave primaria. |
| 272 | dadosParaDuplicarCompra (compra) | movimentacoes | seguro estrutural | limit(1) + maybeSingle. |
| 296 | ultimaCompraDoOperador | movimentacoes | seguro estrutural | limit(1) + maybeSingle. |

#### `src/lib/queries/conflitos.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 91 | chavesDasFiliais | v_conflitos_filiais | já paginado | paginarTodos com desempate por ativo_id - comentario do codigo ja discute o risco de centenas de conflitos de import errado. |
| 153 | contarGruposConflito (sem filial) | v_conflitos_filiais_grupos | seguro estrutural | Count-only, nenhuma linha trafega. |
| 175 | contarGruposConflito (2+ filiais) | v_conflitos_filiais | seguro estrutural | Count-only; quando precisa da varredura exata, delega para chavesDasFiliais (ja paginado). |
| 199 | contarGruposConflito (1 filial) | v_conflitos_filiais | seguro estrutural | Count-only. |
| 244 | chavesPorBusca | v_conflitos_filiais | já paginado | paginarTodos com desempate por ativo_id - comentario do codigo explicitamente cita o risco de busca ampla passar de 1000 lados. |
| 309 | listarConflitos (grupos, sem filtro) | v_conflitos_filiais_grupos | seguro estrutural | Paginacao de UI classica de 20 por pagina. |
| 343 | listarConflitos (lados da pagina) | v_conflitos_filiais | seguro estrutural | chaves vem de no maximo PAGE_SIZE=20 grupos da pagina; paginado por cima como cinto de seguranca extra. |
| 412 | listarConflitosParaExport | v_conflitos_filiais | já paginado | Comentario do codigo explicitamente cita o risco de 'um import errado abrir centenas de conflitos de uma vez' - paginarTodos cobre. |
| 452 | acervoDosAtivos (tabela helper) | ativos/movimentacoes/anotacoes/pe… | já paginado | paginarTodos por cima do .in(ativoIds), e ativoIds ja vem capado em 200 pelo schema Zod de apagarConflito. |
| 469 | acervoDosAtivos (termos_gerados) | termos_gerados | já paginado | paginarTodos sobre a tabela inteira (recorte e em memoria, sem FK). |
| 489 | ladosDosAtivos | v_conflitos_filiais | **CORRIGIDO** | Funcao sem paginacao propria; um dos dois call sites (apagarConflito) e protegido pelo teto de 200 do Zod, mas o outro (resumoExclusaoConflito, o preview) chama esta funcao ANTES de qualque… |

#### `src/lib/queries/dev-destrutivo.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 74 | buscarAtivosDestrutivo | ativos | seguro estrutural | Teto fixo de 25 candidatos. |
| 129 | carregarFichaDestrutiva (ativo) | ativos | seguro estrutural | Busca por chave primaria. |
| 144 | carregarFichaDestrutiva (movs) | movimentacoes | seguro estrutural | Teto fixo de 50, mesma reflexao de listarMovimentacoesDoAtivo mas aqui ja protegido por limit explicito (so serve como amostra na tela, os totais reais vem de count separado logo abaixo). |
| 153 | carregarFichaDestrutiva (totais + termos) | movimentacoes/anotacoes/pendencia… | seguro estrutural | 3 contagens sao count-only; termos_gerados.contains('ativo_ids',[id]) e bounded pelo numero de termos que citam um unico ativo - tipicamente poucos. |
| 219 | alvoDaMovimentacao | movimentacoes + ativos | seguro estrutural | Duas buscas por chave primaria. |
| 241 | nomeDoItem | itens | seguro estrutural | Busca por chave primaria. |
| 265 | listarItensDestrutivo (itens) | itens | seguro estrutural | Catalogo curado e pequeno. |
| 276 | listarItensDestrutivo (contagem de lancamento… | lancamentos_item | **CORRIGIDO** | Unico select do arquivo (alias do modulo inteiro dev-destrutivo.ts, que e exemplarmente cuidadoso com paginacao em todo o resto) sem NENHUMA protecao: nem .range(), nem .limit(), nem filtro… |
| 317 | previaDoReset | rpc previa_reset | seguro estrutural | RPC devolve um unico registro de contagens agregadas, nao linhas. |
| 359 | montarBackupDoReset (todas as tabelas) | lancamentos_item/ativos/movimenta… | já paginado | Paginacao explicita e cuidadosamente comentada ('a Matriz sozinha passa de 1.200 ativos'), com batching de .in() para nao estourar a URL. |

#### `src/lib/queries/dev.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 93 | getDiagnostico (contagens) | 8 tabelas fixas | seguro estrutural | Count-only por tabela, nenhuma linha de dado trafega. |
| 104 | getDiagnostico (ultima_migracao_aplicada) | rpc ultima_migracao_aplicada | seguro estrutural | RPC devolve um unico valor texto, nao um conjunto de linhas. |
| 239 | rodarChecagens | rpc dev_checagens_integridade | seguro estrutural | RPC devolve um array de no maximo 9 elementos (uma por checagem fixa da lista CHECAGENS), cada um com uma pequena amostra - nao escala com o acervo. |

#### `src/lib/queries/eventos-admin.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 88 | listarEventosAdmin (query) | eventos_admin | seguro estrutural | Paginacao de UI com teto explicito de 100. |
| 125 | listarAutoresDaAuditoria | profiles | seguro estrutural | Comentario do codigo ja justifica: profiles tem 'dezenas de linhas', ao contrario de eventos_admin que 'cresce sem teto' (e por isso nao e essa tabela que e lida aqui). |

#### `src/lib/queries/filiais.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 33 | listarFiliais | filiais | seguro estrutural | 5 filiais ativas - dominio fixo. |

#### `src/lib/queries/gerados.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 89 | listarRelatoriosGerados (resolver filial) | filiais | seguro estrutural | filiais tem no maximo 5 linhas. |
| 116 | listarRelatoriosGerados (main) | relatorios_gerados | seguro estrutural | Comentario do codigo cita explicitamente '~6 snapshots/semana passam de 300 linhas/ano' como o motivo da paginacao. |
| 170 | listarRelatoriosGerados (versoes superadas) | relatorios_gerados | seguro estrutural | datas vem de rows ja paginadas (<=30 por pagina). |
| 219 | vizinhosDoRelatorio | relatorios_gerados | seguro estrutural | limit(1) + maybeSingle em cada uma das duas buscas. |
| 284 | buscarRelatorioGerado (main) | relatorios_gerados | seguro estrutural | Busca por chave primaria. |
| 298 | buscarRelatorioGerado (versaoQuery) | relatorios_gerados | seguro estrutural | limit(1) + maybeSingle. |

#### `src/lib/queries/import-logs.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 59 | idsDaFilial | ativos | já paginado | Comentario do codigo cita explicitamente 'a Matriz (1.217 ativos) devolvia so 1.000 ids' como o bug que motivou a paginacao aqui. |
| 68 | contarMovs | movimentacoes | seguro estrutural | Count-only e batelado - nenhuma linha de dado trafega, e o .in() nunca passa de 100 elementos. |
| 80 | contarAnotacoes | anotacoes | seguro estrutural | Mesmo padrao de contarMovs. |
| 125 | paresEmOutrasFiliais (patrimonio) | ativos | seguro estrutural | Batelado em 100 e o dominio (patrimonio quase-unico) torna implausivel qualquer lote de 100 patrimonios casar mais de 1000 linhas. |
| 146 | paresEmOutrasFiliais (service_tag) | ativos | seguro estrutural | Mesmo raciocinio de paresEmOutrasFiliais (patrimonio) - service_tag tambem e near-unica por ativo. |
| 183 | custoSubstituir (termosData) | termos_gerados | já paginado | Comentario do codigo cita explicitamente o risco de >1000 termos gerados. |
| 226 | exportarAcervoFilial (ativos/movs/anotacoes/t… | ativos/movimentacoes/anotacoes/te… | já paginado | Comentario do codigo cita explicitamente 'a Matriz (1.217 ativos)' como o cenario que exige paginacao total no backup pre-import destrutivo. |
| 287 | listarImportLogs | import_logs | seguro estrutural | Teto fixo de 50 (historico de imports e um evento raro, um por filial por go-live/reimport). |

#### `src/lib/queries/itens.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 78 | listarItensAtivos | itens | seguro estrutural | Catalogo de itens por quantidade - pequeno e curado, comentario do proprio codigo confirma ('poucos itens - sem busca server'). |
| 92 | listarItensAdmin | itens | seguro estrutural | Mesmo catalogo pequeno; o embed lancamentos_item(count) e um agregado por linha de item, nao uma segunda leitura de linhas. |
| 121 | getSaldosItens | rpc rel_saldo_itens | seguro estrutural | Mesma RPC confirmada bounded por catalogo (ver relatorios/itens.ts). |
| 389 | getHistoricoLancamentos (queryHistorico) | lancamentos_item | seguro estrutural | Paginacao de UI classica. |
| 473 | getHistoricoLancamentos (estornadas) | lancamentos_item | seguro estrutural | ids vem da pagina ja paginada (default 20). |
| 507 | listarHistoricoParaExport | lancamentos_item | já paginado | Mesmo padrao seguro de listarAtivosParaExport. |
| 541 | listarLancamentosParaSaldoApos | lancamentos_item | já paginado | Mesmo padrao de blocos avancando pelo recebido. |
| 564 | getUltimoLancamento | lancamentos_item | seguro estrutural | limit(1) + maybeSingle. |

#### `src/lib/queries/kits.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 73 | listarKitsAtivos | kits_modelos | seguro estrutural | Catalogo pequeno e curado, comentario do codigo confirma. |
| 85 | listarKitsAdmin | kits_modelos | seguro estrutural | Mesmo catalogo pequeno (ativos+inativos). |

#### `src/lib/queries/motivos.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 14 | listarMotivos | motivos | seguro estrutural | Catalogo de motivos ativos - pequeno. |

#### `src/lib/queries/movimentacoes.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 93 | listarMovimentacoesDoAtivo | movimentacoes | **CORRIGIDO** | Nao ha nenhuma rede de seguranca (nem .limit(), nem paginarTodos) para a linha do tempo de um ativo - ao contrario de quase todo o resto do codigo, que trata sistematicamente qualquer selec… |
| 147 | ultimoEnvioManutencao | movimentacoes | seguro estrutural | limit(1) + maybeSingle - no maximo 1 linha por construcao. |
| 180 | ultimaMovimentacaoDoUsuario | movimentacoes | seguro estrutural | limit(1) + maybeSingle - no maximo 1 linha. |
| 215 | buscarMovimentacaoParaDuplicar | movimentacoes | seguro estrutural | Busca por chave primaria + maybeSingle - no maximo 1 linha. |
| 248 | ultimosAtivosMovimentadosDoOperador | movimentacoes | seguro estrutural | Teto fixo de 30 linhas via constante nomeada - bem abaixo de 1000. |
| 313 | sugestoesDeColuna | movimentacoes | seguro estrutural | Teto fixo de 500, documentado como medido em DEV (~90 linhas no prefixo mais populoso) - folga real sobre o teto de 1000 do PostgREST. |
| 376 | possiveisDuplicatasDoDia (candidatas) | movimentacoes | seguro estrutural | Unico call site e o passo de revisao do wizard de nova movimentacao, cujo lote e capado em MAX_LOTE_MOVIMENTACAO=30 - o produto cartesiano dos tres .in() e pequeno por construcao. |
| 405 | possiveisDuplicatasDoDia (estornos) | movimentacoes | seguro estrutural | candidatas vem da query anterior, ja bounded pelo lote de 30. |
| 636 | listarMovimentacoes (queryLista) | movimentacoes | seguro estrutural | Paginacao de UI classica com teto explicito de 100 por pagina. |
| 731 | listarMovimentacoes (estornadas) | movimentacoes | seguro estrutural | ids vem de rows da pagina ja paginada (<=100 linhas), entao o .in() nunca passa de 100 elementos. |

#### `src/lib/queries/pendencias-detalhe.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 120 | contarPendenciasAbertas | v_fila_pendencias | seguro estrutural | Count-only. |
| 183 | buscarServiceTags | ativos | seguro estrutural | ids vem so do balde 'patrimonio' da pagina atual da fila (no maximo 30 linhas). |
| 197 | listarPendencias (queryPendencias) | v_fila_pendencias | seguro estrutural | Comentario do codigo cita 'producao tem 1.165 pendencias = 39 paginas' - paginacao de UI ja em uso. |
| 294 | listarPendenciasParaExport | v_fila_pendencias | já paginado | Mesmo padrao seguro de listarAtivosParaExport. |

#### `src/lib/queries/pendencias-item.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 24 | listarPendenciasItemDoAtivo | v_pendencias_item | seguro estrutural | Pendencia de item nasce so de devolucao com item faltante - evento bem mais raro que movimentacao; um ativo nunca acumula centenas dessas. |

#### `src/lib/queries/relatorios/comum.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 18 | resolverFilialPorSlug | filiais | seguro estrutural | Busca por chave unica. |

#### `src/lib/queries/relatorios/estoque.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 62 | lerEstadoAtivos (ramo fast path) | ativos | já paginado | Usa paginarTodos com .range() e order('id') estavel - cobre o acervo inteiro sem truncar. |
| 86 | lerEstadoAtivos (ramo as-of) | rpc rel_estoque_asof | **CORRIGIDO** | RPC sem paginacao chamada direto por client.rpc(); retorna um SELECT de linhas (uma por ativo), sujeito ao corte de 1.000 do PostgREST. E o bug raiz ja identificado antes desta varredura. |
| 267 | dadosAtivos | ativos | **CORRIGIDO** | Funcao privada (nao exportada), so 2 call sites internos, ambos passando subconjuntos por status (reservado / em manutencao), nao o acervo completo. |
| 286 | chamadoAteData | movimentacoes | **CORRIGIDO** | Usa paginarTodos com range() e desempate por created_at/id - seguro mesmo que o historico de um ativo reservado seja grande. |
| 347 | manutencaoDeEstado (retQ - retorno_manutencao) | movimentacoes | **CORRIGIDO** | Select sem .range()/.limit() filtrado so por tipo e por um periodo que pode ser 'tudo' (multi-anos) - o mesmo padrao que em getTabelasFinais/getLancamentosItensPeriodo ja e tratado com pagi… |
| 371 | manutencaoDeEstado (devQ - devolucao_forneced… | movimentacoes | **CORRIGIDO** | Identico ao achado de retQ (mesma funcao, mesmo padrao, tipo diferente) - select sem paginacao sobre movimentacoes filtrado por tipo e um periodo que pode cobrir todo o historico. |
| 400 | manutencaoDeEstado (enviosRaw - envio_manuten… | movimentacoes | **CORRIGIDO** | Nao paginado, mas bounded pelo conjunto `ids` - que por sua vez depende de retQ/devQ (ja marcados corrigir). Corrigir a causa raiz ali pode nao bastar sozinho: vale medir o tamanho real de … |
| 407 | manutencaoDeEstado (anotacoesRaw) | anotacoes | **CORRIGIDO** | Mesma razao do enviosRaw: nao paginado, bounded so pelo `ids` que herda o problema de retQ/devQ. Risco menor (anotacoes sao mais raras que movimentacoes) mas sem rede de seguranca. |

#### `src/lib/queries/relatorios/itens.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 55 | lerMinimosDoCatalogo | itens | já paginado | Usa paginarTodos; embora o catalogo seja pequeno, a protecao ja existe e cobre qualquer crescimento. |
| 80 | getGruposItens (rel_saldo_itens) | rpc rel_saldo_itens | seguro estrutural | RPC SQL confirmada: `select ... from public.itens i left join ... group by i.id` - dominio e o catalogo de itens (pequeno e curado), nao o historico de lancamentos. |
| 81 | getGruposItens (rel_mov_itens) | rpc rel_mov_itens | seguro estrutural | Mesma estrutura de rel_saldo_itens: `group by i.id` sobre o catalogo de itens - bounded por construcao. |
| 82 | getGruposItens (rel_frescor_itens) | rpc rel_frescor_itens | seguro estrutural | `group by i.grupo` - grupo_item e enum de 2 valores, teto absoluto de 2 linhas. |
| 97 | getGruposItens (obsRows) | lancamentos_item | **CORRIGIDO** | limit(1000) trunca silenciosamente se o periodo (que pode ser 'tudo', plurianual) tiver mais de 1000 lancamentos com observacao - ao contrario do que o comentario do arquivo declara ('Pagin… |
| 252 | buscarLancEstornadosAteData | lancamentos_item | já paginado | paginarTodos com range() e order('id') - cobre qualquer volume de estornos no historico. |
| 276 | getLancamentosItensPeriodo | lancamentos_item | já paginado | paginarTodos com range() e desempate por data/created_at/id - cobre o periodo completo, mesmo 'tudo'. |

#### `src/lib/queries/relatorios/movimentacoes.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 45 | serieMensal | rpc rel_mov_por_mes | seguro estrutural | RPC SQL confirmada: `group by date_trunc('month',...), tipo` - mesmo num periodo de 'tudo' (anos), o numero de meses x 2 tipos e pequeno (dezenas). |
| 62 | serieCurta | movimentacoes | já paginado | paginarTodos cobre qualquer volume, e o chamador so usa este caminho para periodos curtos (<=120 dias) por design. |
| 97 | getPorMotivo | rpc rel_por_motivo | seguro estrutural | RPC SQL confirmada: `group by tipo, motivo` - motivo e catalogo pequeno, teto de dezenas de linhas. |
| 118 | getResumoPeriodo | rpc rel_resumo | seguro estrutural | RPC SQL confirmada: `group by tipo, filial, motivo, categoria` - produto de 2 tipos x 5 filiais x dezenas de motivos x poucas categorias, ainda assim dezenas a centenas de linhas. |
| 216 | getUltimasMovimentacoes | movimentacoes | seguro estrutural | Unico call site (dashboard) passa limite=5. |
| 282 | buscarLinhasPeriodo | movimentacoes | já paginado | paginarTodos, usado pelas tabelas de Saidas/Entradas/Transferencias mesmo com periodo 'tudo'. |
| 331 | buscarEstornosAteData | movimentacoes | já paginado | paginarTodos, sem filtro de filial de proposito, mas paginacao cobre qualquer volume. |

#### `src/lib/queries/relatorios/pendencias.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 23 | getPendencias (contar) | v_fila_pendencias | seguro estrutural | Count-only, chamado 5x (total + 4 baldes) em paralelo - nenhuma linha de dado trafega. |

#### `src/lib/queries/termos.ts`

| linha | símbolo | tabela/RPC | veredito | motivo |
|---|---|---|---|---|
| 55 | listarTermosDoAtivo | termos_gerados | seguro estrutural | Um ativo fisico gera poucos termos ao longo da vida util (a cada troca de responsavel/devolucao) - nunca perto de 1000. |

---

## 4. Verificação — saídas reais

### 4.1 `npm run lint`

```
> estoque-ti-wap@1.40.2 lint
> eslint

```
(sem nenhuma saída = limpo)

### 4.2 `npm run test`

```
 RUN  v4.1.10

 Test Files  125 passed (125)
      Tests  2557 passed (2557)
   Start at  13:52:07
   Duration  137.19s
```

### 4.3 `npm run build`

```
ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

[exited with code 0]
```

### 4.4 Script de validação contra produção (só leitura)

`npx tsx scripts/manutencao/validar-truncamento.ts`

```
=== Validação do truncamento de 1.000 linhas (SÓ LEITURA) ===
projeto: pbtjcalbmepmrqzprusb · hoje: 2026-08-17

· consolidado, hoje (fast path) — as-of 2026-08-17
  motor lerEstadoAtivos: 1647
  contagem paginada bruta: 1648
  count exact de ativos vivos: 1647
  OK   motor (1647) == count exact (1647)
  OK   motor não devolveu exatamente 1000 (assinatura do corte)
  OK   bruto não devolveu exatamente 1000

· consolidado, data passada — as-of 2026-08-15
  motor lerEstadoAtivos: 1648
  contagem paginada bruta: 1648
  OK   motor (1648) == bruto paginado (1648)
  OK   motor não devolveu exatamente 1000 (assinatura do corte)
  OK   bruto não devolveu exatamente 1000

· Matriz (filial 1), data passada — as-of 2026-08-15
  motor lerEstadoAtivos: 1169
  contagem paginada bruta: 1169
  OK   motor (1169) == bruto paginado (1169)
  OK   motor não devolveu exatamente 1000 (assinatura do corte)
  OK   bruto não devolveu exatamente 1000
  OK   Matriz sozinha passa de 1000 ativos (1169)

· relatório ao vivo consolidado — período 2026-08-17..2026-08-21, anterior 2026-08-12..2026-08-16
  kpis.total: 1647
  kpisAnterior.total: 1648
  Δ do total: -1
  OK   kpisAnterior.total > 1000 (não truncado)
  OK   Δ do total sem o salto fantasma de centenas (-1)

· volumes que sustentam os vereditos da varredura
  movimentacoes: 3369 · lancamentos_item: 0 · anotacoes: 12
  OK   movimentacoes já passa de 1000 — leitura ampla dessa tabela truncaria

=== TUDO OK ===
```

**Critério 1** ✅ — as três datas batem com a contagem bruta; nenhuma leitura devolve 1.000;
consolidado as-of 15/08 = **1.648**; Matriz as-of 15/08 = **1.169** (> 1.000).

**Critério 2** ✅ — `kpisAnterior.total` = **1.648** (> 1.000), e o Δ do total caiu de **+647**
para **−1**. Sobre esse −1, ver a pendência §7.1: **não é truncamento**.

---

## 5. Errata dos snapshots congelados

### 5.1 A regra de elegibilidade, e por que ela exclui a maioria

O último import **"Substituir tudo"** foi em **31/07/2026 18:32Z** (conferido em `import_logs`:
filial 4, `modo=substituir`). Os imports de go-live **apagaram e recriaram** o acervo —
reconstruir um estado as-of anterior a isso não devolve o que era verdade naquele dia; devolve o
acervo de hoje projetado para trás por movimentações que foram apagadas junto. Seria um número
**enganoso com aparência de corrigido** — pior que o erro atual, porque ninguém desconfiaria.

Por isso: só gera v2 quem tem as **duas** datas reconstruídas (`periodo_ate` **e** o `ate` da
janela anterior) **posteriores a 31/07/2026**.

### 5.2 Triagem dos 11 snapshots (saída real)

```
  af99681c 2026-06-28..2026-07-04 filial 1 v1 | kpis=859 kpisAnt=842 | NÃO-ERRATÁVEL — reconstruiria 2026-07-04 e 2026-06-27, não posteriores ao import de 2026-07-31
  521eb18e 2026-07-06..2026-07-10 filial 1 v1 | kpis=930 kpisAnt=859 | NÃO-ERRATÁVEL — reconstruiria 2026-07-10 e 2026-07-05, não posteriores ao import de 2026-07-31
  b12b8c57 2026-07-12..2026-07-18 filial 1 v2 | kpis=900 kpisAnt=886 | NÃO-ERRATÁVEL — reconstruiria 2026-07-18 e 2026-07-11, não posteriores ao import de 2026-07-31
  a6d57774 2026-07-13..2026-07-17 consolidado v2 | kpis=1556 kpisAnt=1000 | NÃO-ERRATÁVEL — reconstruiria 2026-07-17 e 2026-07-12, não posteriores ao import de 2026-07-31 (tem a assinatura do truncamento)
  adbab812 2026-07-15..2026-07-16 consolidado v1 | kpis=1556 kpisAnt=1000 | NÃO-ERRATÁVEL — reconstruiria 2026-07-16 e 2026-07-14, não posteriores ao import de 2026-07-31 (tem a assinatura do truncamento)
  8b3070d4 2026-07-20..2026-07-24 consolidado v2 | kpis=1572 kpisAnt=1000 | NÃO-ERRATÁVEL — reconstruiria 2026-07-24 e 2026-07-19, não posteriores ao import de 2026-07-31 (tem a assinatura do truncamento)
  7c83af53 2026-07-27..2026-07-31 filial 1 v1 | kpis=1227 kpisAnt=943 | NÃO-ERRATÁVEL — reconstruiria 2026-07-31 e 2026-07-26, não posteriores ao import de 2026-07-31
  fa253a8f 2026-08-03..2026-08-07 consolidado v1 | kpis=1000 kpisAnt=1000 | ELEGÍVEL
```

> A triagem lista a versão **mais nova** de cada (período, filial) — é dela que a errata nasce.
> Por isso `5b91ce25` (13–17/07 **v1**) e `2422fdd9` (20–24/07 **v1**) não aparecem: já têm uma
> v2, e essas v2 são as listadas acima. Ambas as v2 continuam truncadas e **não-erratáveis** pelo
> mesmo motivo de data.

### 5.3 Errata gravada — mapeamento v1 → v2

```
--- reconstrução com o motor corrigido ---
  fa253a8f 2026-08-03..2026-08-07 geral: kpis 1000→1648 · kpisAnterior 1000→1641 (DIVERGE — errata)
    gravado v2: bf116a0b-de93-4b6b-8a7f-73153b190d35 (autor 8107851e)

--- mapeamento v1 → v2 ---
  2026-08-03..2026-08-07 geral: fa253a8f-e3b5-4c48-aad7-0748e0f6df83 → bf116a0b-de93-4b6b-8a7f-73153b190d35
      antes: kpis=1000 kpisAnterior=1000
      depois: kpis=1648 kpisAnterior=1641
```

| | v1 (original) | v2 (errata) |
|---|---|---|
| id | `fa253a8f-e3b5-4c48-aad7-0748e0f6df83` | `bf116a0b-de93-4b6b-8a7f-73153b190d35` |
| versão | 1 | 2 |
| `kpis.total` | **1000** (truncado) | **1648** |
| `kpisAnterior.total` | **1000** (truncado) | **1641** |
| autor | (o gerador original) | perfil **dev mais antigo ativo** `8107851e…` (criado 10/07/2026) |

`observacao` da v2 (gravada):

> `[errata automática]` Correção do truncamento de 1.000 linhas: a versão anterior deste
> relatório congelou apenas os primeiros 1.000 ativos do acervo, porque a leitura que reconstrói
> o estoque numa data passada era cortada nesse limite. Os totais desta versão foram recalculados
> sobre o acervo inteiro. **Ressalva:** exclusões feitas DEPOIS da geração original (por exemplo,
> resoluções de conflito entre filiais) não são reconstruíveis retroativamente — um ativo apagado
> desde então não reaparece nestes números.

### 5.4 Provas de segurança da escrita

**A v1 ficou intacta** — conferida contra o backup JSON tirado **antes** da inserção (gravado
fora do repositório, em `%TEMP%/errata-truncamento/`):

```
v1 ainda existe: true
v1 dados IDENTICOS ao backup pre-errata: true
v1 observacao inalterada: true
v1 versao/gerado_em inalterados: true

v2 versao: 2 | autor: 8107851e
v2 kpis.total: 1648 | kpisAnterior.total: 1641
v2 meta.schema: 2 | mesmas chaves de dados que a v1: true
v2 observacao marcada como errata: true

total de snapshots agora: 12
```

**Idempotência provada por execução repetida** — a segunda passada não inseriu nada:

```
snapshots existentes: 12
  bf116a0b 2026-08-03..2026-08-07 consolidado v2 | kpis=1648 kpisAnt=1641 | JÁ ERRATADO — nada a fazer (idempotência)
Nenhum snapshot elegível. Nada a fazer.
```

A UI marca a v1 como "superada" sozinha (índice único
`relatorios_gerados_periodo_filial_versao_uidx`, migration `0013`) — nada a fazer na tela.

---

## 6. Decisões registradas

Cinco atas novas em [`docs/DECISOES.md`](DECISOES.md), todas em `2026-08-17`:

1. **A correção é paginar no app, não subir o `max-rows`** — subir o teto resolve hoje e volta a
   quebrar no próximo patamar, sem avisar.
2. **A ordem total é imposta na CHAMADA da RPC, não no SQL** — `supabase/` fora de escopo, e a
   regra fica ao lado da paginação que a exige.
3. **Errata só depois do último import "Substituir tudo" (31/07)** — reconstruir antes disso
   produz número enganoso; os cinco de julho ficam como estão, deliberadamente.
4. **O `.in(ids)` grande vira lotes de 100** — são dois limites distintos (linhas e URL).
5. **Divergência de 1 ativo entre o fast path e o as-of de hoje** — achado, caracterizado e
   **não** corrigido (ver §7.1).

---

## 7. Pendências e próximos passos

### 7.1 Divergência de 1 ativo entre o fast path e o as-of (achado desta entrega)

Com tudo paginado, `lerEstadoAtivos(hoje)` devolve **1.647** pelo fast path e **1.648** pela
reconstrução as-of da mesma data. Caracterizado em produção: **um** ativo cujo `status` gravado é
`devolvido_fornecedor` (baixa terminal) mas que a reconstrução as-of de hoje ainda conta — três
movimentações, nenhuma com data futura.

- **Não é truncamento.** Os dois lados leem o conjunto inteiro agora, e a diferença permanece. É
  divergência entre o `status` materializado em `ativos` e a máquina de estados reconstruída.
- **Fora do escopo:** investigar mora no SQL (`status_apos_movimentacao` / `rel_estoque_asof`), e
  `supabase/` está fora desta ordem.
- **Efeito prático:** o Δ do total no relatório ao vivo aparece como **−1**. Antes desta
  correção o mesmo Δ aparecia como **+647** — o resíduo é de outra ordem de grandeza.
- **Encaminhamento:** ordem futura que possa mexer no banco.

### 7.2 Os cinco snapshots não-erratáveis de julho

Três deles (`a6d57774`, `adbab812`, `8b3070d4`) têm `kpisAnterior = 1000` e **ficam assim**. Não
é esquecimento — é a decisão 3 do §6. Se um dia for preciso corrigi-los, o caminho não é
reconstruir as-of: seria preciso uma fonte do acervo pré-import, que não existe.

### 7.3 Teto de payload do import

`actions/importar.ts` — o plano de import não tem `.max()` no schema. Não é este bug (é escrita,
não leitura), mas uma filial muito grande depende de tetos de payload/timeout que ninguém mediu.

### 7.4 O `max-rows` continua em 1.000

Deliberado (decisão 1). A defesa agora é o código, não a configuração. O teste da página
exatamente cheia protege a regra de regredir.

---

## 8. Conformidade com o CLAUDE.md

| regra | como foi cumprida |
|---|---|
| 1 — escopo da ordem | nada de outra fase; o que apareceu fora foi para as pendências (§7) |
| 2 — **nunca dados reais** | nenhum patrimônio, nome ou linha real neste relatório, nos testes ou nas saídas: só contagens, ids técnicos de snapshot e agregados. Os scripts imprimem só contagens **por construção** |
| 3 — custo R$ 0 | nenhuma dependência nova, nenhum serviço novo |
| 4 — segredos | `SUPABASE_SERVICE_ROLE_KEY` só em `scripts/` local; nada commitado |
| 5 — produção com autoproteção | errata precedida de **backup JSON fora do repositório**, **dry-run** antes do `--executar`, e contagens conferidas depois |
| 7 — lint/build/checklist | §4, saídas reais coladas |
| 8 — **versão** | bump `1.40.2` + entrada no registry (linguagem de operador) + CHANGELOG + ata + tag anotada `v1.40.2` criada no commit final e publicada no fechamento da branch (§9) |

---

## 9. Revisão adversarial do próprio diff

Antes do merge, quatro revisores em contexto fresco leram o diff contra o plano e os critérios,
e cada achado passou por um verificador encarregado de **refutá-lo**.

- **Lente "correção da paginação"** (ordem total, off-by-one, `paginarPorIds`, canal de erro):
  **nenhum achado**.
- **Lente "regressão nos consumidores"** (variáveis renomeadas, `.data` órfão, casts de embed,
  `tsc`/`test`): **nenhum achado**.
- **Lente "errata e produção"**: 1 achado, **refutado** — alegava que o backup em `%TEMP%`
  contraria a regra 2. Não contraria: a regra 2 governa o que entra no **repositório**
  (seed, fixture, teste, comentário, screenshot); o backup é a autoproteção que a **regra 5**
  exige antes de escrever em produção, fica fora do repo e não amplia acesso nenhum (quem roda o
  script já tem a service role).
- **Lente "requisitos e versão"**: 2 achados, **ambos confirmados e corrigidos** —
  (a) a tabela-resumo do §3 somava 219 porque herdara os números do plano (175/30) sem descontar
  os 2 pontos promovidos a corrigido; agora soma 217 e explica a promoção;
  (b) esta tabela de conformidade afirmava a tag `v1.40.2` como já publicada quando ela ainda não
  existia — a linha passou a dizer **quando** ela é criada, em vez de afirmar um fato futuro.

Que as duas lentes de código não tenham achado nada, e que as duas correções tenham sido em
**afirmações do relatório**, é o resultado honesto a registrar.
