# F60 — O recorte que corta scan, e o custo do caminho quente

Ordem de serviço da fase **F60** do `PLANO-MULTIEMPRESA.md` (§5, Bloco D). Fase **de motor e de custo**: as sete RPCs de
relatório que recortam por filial passam a receber o recorte como LISTA obrigatória e a recortar **por dentro** —
`p_filial smallint` com `(p_filial is null or col = p_filial)` vira `p_filiais smallint[]` com `col = any (p_filiais)`
—, o as-of é reescrito, e o caminho quente (dashboard, `/itens`, `/ativos`, relatórios) para de pagar duas vezes o que
já é caro. Com uma condição que não se negocia: **nenhum número de tela muda**.

O plano a põe no caminho crítico duas vezes (§3): *"F53 destrava F60. `movimentacoes.ordem` é o cursor de que a
paginação keyset precisa"* e *"F58 destrava F60. Sem porta única de RPC, trocar a assinatura das `rel_*` é 37 pontos à
mão"*. No §9, se a preparação encolher, as partes de desempenho saem primeiro, *"mantendo `p_filiais` obrigatório, `cap`
obrigatório e o keyset, que são o ensaio"*. E a F59 deixou escrita a regra que esta fase trava (R-ACC-71): *"se nulo
pode significar 'mostre tudo', a forma é proibida"*.

---

## Estado de partida — os 26 fatos medidos no disco, no git e nos dois bancos (16/09/2026)

> O prompt cita estes fatos **pelo número**. Foram medidos hoje contra a árvore e o git; contra o catálogo e o
> `pg_stat_statements` de PRODUÇÃO e do ENSAIO, só leitura, pelo MCP da Supabase; contra a documentação vigente; e num
> Postgres 17.5 descartável (PGlite, fora do repositório) — não copiados da ficha, que é de 04/09, anterior às F48→F59.
> Onde divergem dela, a divergência está marcada. O `/api/saude` não foi alcançável desta sessão (proxy): o pré-voo o
> confere. O prompt manda o agente **remedir antes de aceitar**.

**Onde o projeto parou**

1. `main` em **`4c380ec`** (merge do PR #51, `f59-docs-fecho`), com a tag anotada **`v1.64.0`** nesse commit;
   `package.json` em `1.64.0`; o último deploy de produção da Vercel está `READY` desde 16/09 14:25, o minuto do merge.
   Última migration **`0140_import_desarma_fk.sql`** — 139 arquivos, `0001`→`0140`, a `0029` é gap real —, e o ledger
   dos DOIS bancos termina nela (`import_desarma_fk`). Produção `pbtjcalbmepmrqzprusb` e ensaio `sgmvldiizsrjbxzzpmhh`
   em `ACTIVE_HEALTHY`, Postgres **17.6**; `rotulo_de_ambiente()` responde `'desenvolvimento'` no ensaio. A F59 fechou
   com **219 arquivos e 5.997 testes**. ⚠ A ficha lista as migrations `0137`–`0140`: esses números foram gastos pela
   F54→F56 — **a primeira desta fase é a `0141`**. Versão da fase: **`1.65.0`**.

**O volume real e o custo de hoje**

2. Produção: **1.620** ativos · **3.556** movimentações · **148** lançamentos de item · 32 colaboradores · 6 filiais (as
   6 ativas) · 23 itens. Ensaio: 1.606 · 3.245 · 35 · 0 · 6 (6) · 7. Consequência direta: com 148 lançamentos, nenhum
   `EXPLAIN` de produção prova o índice `lanc_item_criado_por_idx` — o planejador lê a tabela inteira de qualquer jeito,
   e a R-REL-33 diz que *"'a tabela é pequena' não é medição"*. A medição dele é no ensaio, com volume fictício, pelo
   harness que a própria ficha manda consertar (fato 23).
3. TTFB de produção medido pela F59 (`docs/perf/f59-producao-ttfb.json`, 11 rodadas, medianas): `/` **351 ms** ·
   `/itens` 353 · `/ativos` 291 · `/movimentacoes` 285 · `/pendencias` 346 · `/relatorios/geral` 534 ·
   `/relatorios/[filial]` 349 — mais as rotas do visualizador por senha. **Faixa de ruído entre dias com o mesmo código:
   4% a 18%** (ata F59, Decisão 8). `scripts/perf/medir.mjs` **não mede** `/admin/colaboradores`, `/itens/historico` nem
   `/itens/conferencia`, que esta fase toca.
4. **`pg_stat_statements` 1.11 está instalado em produção e separa por papel.** As `rel_*` como o app as chama:
   `rel_saldo_itens` por `authenticated` 7.886 chamadas · 16,8 ms de média, por `service_role` 111 · 2,9 ms;
   `rel_estoque_asof` por `authenticated` 1.239 · 118,8 ms e 889 · 79,0 ms (duas formas de statement), por
   `service_role` 276 · 22,9 ms. É o instrumento que prova, antes do `drop`, que nenhum caminho do app chama mais a
   assinatura velha — por papel, sem ler dado. `track_functions = none`: `pg_stat_user_functions` está vazia e não
   serve.

**O motor**

5. **Oito `rel_*` vivas nos dois bancos**, todas `language sql stable`, `security invoker`, NÃO `strict`, com `set
   search_path = public`; `anon` sem EXECUTE, `authenticated` e `service_role` com (os grants da `0056`). Sete recortam
   por `smallint`: `rel_estoque_asof(smallint, date)` (corpo vivo `0134`), `rel_saldo_itens(smallint, date)` (`0027`),
   `rel_mov_itens(smallint, date, date)` e `rel_frescor_itens(smallint, date)` (`0016`), `rel_mov_por_mes`,
   `rel_por_motivo` e `rel_resumo` (`smallint, date, date`, `0011`). Seis usam `(p_filial is null or <col> = p_filial)`
   sobre coluna da tabela (`m.filial_id` ×3, `l.filial_id` ×3); a de as-of aplica a mesma forma **no fim, sobre uma
   coluna calculada** (fato 8). ⚠ A oitava, **`rel_saldo_colaborador(uuid)`** (`0118`), não tem recorte de filial —
   `where p_colaborador is not null and l.colaborador_id = p_colaborador`. A ficha manda a trava afirmar que *"toda
   função `rel_*` declara o parâmetro de recorte"*: esta não declara.
6. **O `p_filial is null or` é não-sargável no caminho REAL — medido, não suposto.** O texto normalizado do
   `pg_stat_statements` de produção mostra como o PostgREST chama: `LATERAL "public"."rel_saldo_itens"("p_filial" :=
   pgrst_body."p_filial", …)`, com os argumentos saídos de `json_to_record($1)` — **o argumento nunca é constante**. E
   função SQL com cláusula `SET` (o `set search_path` das oito) **não é embutida** pelo planejador: sai `Function Scan`,
   e o corpo é planejado sozinho, com o parâmetro como `$1`. No Postgres 17.5 descartável (300 mil linhas, 60 filiais,
   índice na coluna): plano genérico de `($1 is null or filial_id = $1)` → **`Seq Scan` com `Filter`**; de `filial_id =
   any ($1)` → **`Bitmap Index Scan`**; **32 ms × 4 ms** por chamada, com as mesmas linhas. A mesma função SEM `SET`,
   chamada com literal, é embutida e o `3 is null` é dobrado (`Index Scan`) — **um `EXPLAIN` com literal mente a favor
   da forma velha**. No volume de hoje o ganho absoluto é pequeno; o motivo que não envelhece é a doutrina: é a forma
   que a virada copiaria.
7. **`NOT NULL` não existe em parâmetro de função.** A ficha escreve `p_filiais smallint[] NOT NULL`; no Postgres 17.5,
   `create function f(p smallint[] not null)` é `syntax error at or near "not"`. "Não-anulável" tem de ser outra coisa,
   e provada: com `col = any (p_filiais)`, **NULL e `'{}'` devolvem 0 linhas, sem erro** (medido); `strict` também
   devolve 0 linhas, e função `strict` não é embutida (medido — irrelevante enquanto houver `set search_path`); do lado
   do TypeScript, a entrada sai de `ARGUMENTOS_ANULAVEIS` e `null` deixa de compilar. Hoje `rel_*(null)` devolve
   **tudo** — 60.000 de 60.000 no descartável —, o fail-open que a R-ACC-71 proíbe.
8. **A filial do as-of é CALCULADA na data, não a de hoje.** `rel_estoque_asof` (`0134`) deriva `filial_id` do último
   movimento efetivo até `p_data` — `transferencia` → destino; `compra`/`troca` → a da movimentação; `snapshot_anterior
   ? 'filial_id'` → a anterior; senão `ativos.filial_id` — e só depois filtra. Pré-recortar por `ativos.filial_id = any
   (p_filiais)` antes do `join lateral` — o atalho óbvio — tira do relatório de A o ativo que estava em A na data e foi
   transferido depois, e põe o que chegou depois. A ficha manda *"preservar o predicado `existe` e a precedência do
   ajuste"*: desde a F53, a precedência **é** `data desc, ordem desc` (a `0134` tirou a quádrupla com `(tipo='ajuste')
   desc`), e é o que os rótulos 3a→7b de `supabase/tests/asof_desempate.sql` provam. `mov_ativo_idx (ativo_id, data
   desc)` não cobre `ordem`; `movimentacoes_estorno_de_idx (estorno_de)` existe (`0106:31`).
9. **O consolidado de hoje inclui filial DESATIVADA — e a lista de filiais do app, não.** `p_filial null` soma tudo;
   `listarFiliais()` (`queries/filiais.ts:30`, memoizada) filtra `.eq('ativo', true)`. Trocar o `null` por
   `listarFiliais().map((f) => f.id)` apaga do consolidado, em silêncio, o que estiver em filial desativada — é a
   divergência que `/itens` declara (`lib/itens/lista.ts:77-83`, `components/itens/itens-table.tsx:~488` e a coluna
   "Fora das colunas" do export, `actions/exportar.ts:417`), generalizada para os sete relatórios. ⚠ A ficha a localiza
   em `itens/page.tsx:187-191`; mudou de lugar na F42/F44. As 6 filiais de produção estão ativas: o defeito seria
   latente, e só um cenário com filial desativada o vê.
10. **Quem chama as sete assinaturas** — a ficha diz *"10 chamadores"*; medido: **8** chamadas no app
    (`queries/itens.ts:142`; `queries/relatorios/estoque.ts:116`; `relatorios/itens.ts:90-92`;
    `relatorios/movimentacoes.ts:54,106,128`); **1** pela porta em `scripts/manutencao/validar-truncamento.ts`; **7**
    `db.rpc` diretos em `scripts/` (`seed.ts` ×2, `smoke/fixtures-passe2.ts` ×1, `smoke/smoke-prod.mjs` ×4 — a quinta
    chamada dele é `rel_saldo_colaborador`, que não muda); a matriz das `rel_*` de `scripts/formas/censo.mjs` e de
    `scripts/formas/conferir.mts`; 5 usos em `src/lib/supabase/linhas-tipos.test.ts`; os 7 descritores de
    `queries/formas/relatorios.ts`; as 7 entradas de `ARGUMENTOS_ANULAVEIS` (`rpc.ts`), todas em `RECORTE_DO_RELATORIO`,
    *"a linha que a F60 troca"*; a lista branca `RPCS` de `fronteira-viewer.test.ts` (catraca `≤ 7`); **59 chamadas em 8
    roteiros SQL** (`asof_desempate` 5, `dev_destrutivo` 10, `f36_detentor` 2, `f38_itens_com_ativo` 9,
    `f41_regularizacao` 12, `import_substituir` 2, `itens_quantidade` 11, `transferencia_item` 8); e **2 mutações** do
    injetor ancoradas no TEXTO de `rel_estoque_asof(smallint, date)` (`f53-asof-volta-ao-desempate-por-id` e
    `f53-trava-do-estorno-volta-ao-uuid`). Nenhuma função das migrations chama `rel_*` por dentro (varredura) — e o
    Postgres não registra dependência de corpo de função: `drop` nunca avisa quem quebrou. O smoke agendado
    (`saude.yml`) roda só a Parte A (`--sem-sessao`, puro `fetch`): nenhuma `rel_*`.
11. **Função nova nasce com EXECUTE para `anon`** (o default da Supabase em `public`), e `catalogo_secdef.sql` **6a**
    reprova QUALQUER `invoker` alcançável por `anon`; a **6c** vigia as revogadas. `create or replace` preserva grants;
    `drop` + `create`, não. O `service_role` é o do visualizador por senha (`auth/acesso.ts:468`,
    `createAdminClient()`).

**O custo que a ficha manda cortar**

12. **O "duas vezes por request" é UMA função, não duas.** `(app)/layout.tsx:96-99` chama `contarPendenciasAbertas` e
    `contarConflitosAbertos`; `(app)/page.tsx:160` chama **só** `contarConflitosAbertos` — o card lê `v_fila_pendencias`
    com `limit(5)`, outra consulta. E o argumento é um OBJETO (`UnidadesEfetivas<'slug'>`) montado em caminhos
    diferentes — `efetivar(recorteDe(operador), …)` no layout, outro na página —: o `cache()` do React compara argumento
    por referência, então memoizar a função como está **nunca acerta**. Hoje há três memoizadas (`getOperador`,
    `cargoDoRequest`, `listarFiliais`), e a F49 proíbe por escrito memoizar o VÍNCULO (`cargoDoRequest`, ADR-002 §4).
13. **Os KPIs do dashboard** — `getKpis(client, null)` (`(app)/page.tsx:138`) → `lerEstadoAtivos` → `paginarTodos` sobre
    `ativos` inteira (1.620 linhas, duas páginas) para oito contadores. `kpisDeEstado` também serve o snapshot semanal e
    fica pura. **Agregado do PostgREST não está ligado**: o `authenticator` não tem `pgrst.db_aggregates_enabled`
    (medido nos dois bancos), e a Supabase o entrega desligado — `select('status, count()')` pediria mudar configuração
    de produção.
14. **`/ativos`** — `queryLista` (`queries/ativos.ts:~172`) paga `count: 'exact'` a cada render e busca cada palavra em
    8 colunas com `%palavra%` (`aplicarFiltrosAtivos`, um `.or()` por palavra). A ficha manda decidir o `count`
    *"escrito, não herdado"*, e mantém fora a busca por prefixo (desfaz a F27/B5). `pg_trgm` **não está instalado** em
    produção, e habilitá-lo exige aprovação registrada.
15. **`paginarTodos`** (`queries/relatorios/comum.ts`): `range()`/OFFSET, `PAGINA = 1000`, `CAP_PAGINACAO = 100_000` que
    **lança** acima do teto, fim pela página curta contra o `max-rows` OBSERVADO. **48 chamadas** (45 em `src/`, 3 em
    `scripts/import/carga.ts`) — a F53 contou 7; a F58 pôs ~33 leituras em lote nela — e `paginarPorIds` (5 chamadas) a
    usa por dentro. As ordens variam: `id`; `ativo_id` (o as-of, via RPC); `data desc, created_at desc, id desc` (as
    tabelas do período); `nome, id` (colaboradores)… Keyset em ordem COMPOSTA, pelo PostgREST, exige filtro `or(…,
    and(…))`; e **o builder da porta de RPC não tem filtro no TIPO** — `chamarRpc` devolve `PostgrestTransformBuilder`
    pelo `.returns<>()`, e o próprio `rpc.ts` avisa: *"o que se perde são os filtros"* —, então keyset sobre o as-of não
    compila como está. `movimentacoes.ordem` (F53) é única, não nula e total: o cursor pronto. E
    `sem-cast-de-leitura.test.ts` tem dezenas de casos sintéticos na forma `paginarTodos("x", (a, b) => …)`: mudar a
    assinatura mexe na trava da F58.
16. **As três tabelas do relatório** (`getTabelasFinais` em `relatorios/movimentacoes.ts`: saídas, entradas,
    transferências) leem por `paginarTodos` sem teto próprio. O molde de teto com aviso é `filaDeConsolidacao`
    (`queries/colaboradores.ts`: `TETO_FILA = 500`, `truncado`, números agregados no banco). As tabelas entram no
    snapshot semanal: `FORMA_SNAPSHOT` é a união frouxa `V2 | V1` — chave nova numa V2 passa; `meta.schema: 3` compila e
    a tela de gerados recusa (F58 §11).
17. **`maxDuration`** existe em UMA rota (`relatorios/[filial]/page.tsx:63`, 60 s, com o motivo: um request pendurado
    consumiu os 300 s da Vercel em 24/07; vale também para as Server Actions da página). O grupo `(app)` tem 30
    `page.tsx`, e ~25 leem `lib/queries`. O mesmo comentário diz por que o teto NÃO é global: o "Substituir tudo" do
    import é Server Action legitimamente longa.
18. **`statement_timeout` — a premissa da ficha diverge.** Medido nos dois bancos: `anon` 3 s · `authenticated` 8 s ·
    `service_role` **sem configuração** · `authenticator` 8 s. A documentação da Supabase (*Timeouts*):
    *"`service_role`: none (defaults to the `authenticator` role's 8s timeout if unset)"*. O caminho do visualizador
    **não está sem teto** — herda os 8 s. E um `alter role service_role set statement_timeout` alcançaria também backup,
    carga e tudo o que o app roda como `service_role`.
19. **`/itens`** — `getSaldosPorFilial` (`queries/itens.ts:342-351`) dispara **1 + N** chamadas de `rel_saldo_itens` por
    render (N = filiais ATIVAS: hoje 7 chamadas); `getSaldosItensDeFiliais` (`/itens/historico`) faz N na multi-seleção;
    e `getSaldosItens(filialId | null)` ainda é chamada por `/itens/conferencia`, pelo dashboard (`null`), por
    `actions/admin.ts` e por `actions/itens.ts`.
20. **`buscarEstornosAteData`** (`relatorios/movimentacoes.ts:327`) varre todo estorno até a data. A ficha manda
    `.in('estorno_de', ids)` com os ids já lidos, e **proíbe** filtro de filial: o estorno grava a filial ATUAL do ativo
    (`0122`), não a da movimentação estornada.
21. **`v_colaboradores_textos`** (corpo vivo `0115`, `security_invoker`) agrega `movimentacoes ∪ lancamentos_item`
    inteiras com `colaborador_chave()` por linha e `mode() within group`; `/admin/colaboradores` chama
    `listarColaboradoresAdmin()` (32 cadastros, dois `count` embutidos por pessoa, por `paginarTodos`) e
    `filaDeConsolidacao()`.
22. **Índices** (produção, `pg_stat_user_indexes`): `lanc_item_criado_por_idx` **não existe**;
    `lanc_item_item_filial_idx` 453 scans; **`movimentacoes_ordem_lista_idx (data desc, created_at desc, id desc)`
    16.889** — a F53 registrou 16.067 em 09/09: **+822 em uma semana**, vivo, servindo a ordem das tabelas do período
    (fato 15) —; `movimentacoes_data_ordem_idx` 5.980; `mov_ativo_idx` 161.510; `movimentacoes_estorno_de_idx` 15.086. A
    `0135:43-44` deixou para a F60 a decisão de aposentar o `ordem_lista`, *"com o `idx_scan` dele medido como insumo"*.
23. **O harness `scripts/perf/medir-itens.mjs`** (F37) popula o ENSAIO com volume fictício (patamares de 10 mil, 100 mil
    e 500 mil, marcador `PERF-F37`, limpeza obrigatória com contagem antes e depois), recusa produção por desenho, e lê
    `SUPABASE_ACCESS_TOKEN` só do ambiente do processo — desde a F55 o token mora no cofre do Windows, e `db:types` o
    usa pela CLI, sem variável (`INVENTARIO-CREDENCIAIS.md` §5). A ficha: ele *"mede um `SELECT` sem `WHERE` nenhum —
    forma que o app nunca emite"*, e é daí que vêm os 708 ms que *"justificariam"* `lanc_item_ordem_lista_idx`. Supabase
    Free: 500 MB por banco.

**As travas, o apply e as regras**

24. Migration nova atualiza **duas** listas (`RUNBOOK-BANCO.md`): `supabase/migrations.lock.json` (`npm run db:lock`) e
    `src/lib/itens/migrations-f38.test.ts`. O gate de deriva (`db:types:diff`) compara `database.ts` com o banco do CI
    construído da cadeia INTEIRA — com o `drop` —, então os tipos refletem o estado final antes de o `drop` chegar a
    produção; o precedente é o *hand-fix* datado da F56 (fato 13 de lá), regenerado e conferido depois do apply no
    ensaio. Injetor: **82 mutações ativas, teto 85** — *"a F60 acrescenta a trava de parâmetro de recorte das `rel_*` e
    vai precisar de folga"* (`mutacoes.test.mts:103-111`). Os moldes da F59: `scripts/db/predicado-policies.mjs` (o
    analisador com replay e falha fechada), `policies-initplan.test.ts`, o par em `catalogo_policies.sql` e
    `catalogos-seguranca.test.ts` (as exceções lidas do `.sql`); e `scripts/db/corpo-vigente.mjs` (`corpoVigente`,
    `listarMigrations`, `fimDoComando`, `definicoesDeFuncao`).
25. **O apply** (`RUNBOOK-BANCO.md`, "O caminho, em 30 segundos", e a emenda F56 do gate): o agente aplica por
    `apply_migration` do MCP, **ensaio primeiro**; *nenhuma migration toca banco real antes de o CI tê-la rodado* (F56);
    a prova pós-apply é assinatura sem overload, grants por papel, `prosrc` normalizado
    (`md5(regexp_replace(prosrc,'\s+',' ','g'))`) contra o corpo do arquivo extraído por `corpo-vigente.mjs`, `notify
    pgrst, 'reload schema'`, `get_advisors(security)` sem achado novo e a sonda de paridade ensaio × produção.
    *"Migration que muda o que o código novo usa: SQL antes do deploy"* (passo 8 do runbook) — e o `drop`, pela ficha,
    **depois**. O advisor da Supabase acusa função sem `search_path` fixo: tirar o `set search_path` para ganhar
    embutimento troca um achado por outro — e o fato 6 mostra que, sem embutir, é a forma `= any` que torna o corpo
    sargável. Leitura com forma nova passa pelo conferidor da F58 contra produção (`scripts/formas/conferir.mts`, conta
    do smoke, só contagens).
26. Regras do `CLAUDE.md` que pesam aqui: **1** (escopo), **2** (nunca dado real — as datas de amostra e os planos de
    produção saem só como contagem, hash e nome de nó), **3** (R$ 0 — `pg_trgm`, agregados do PostgREST e configuração
    de papel são mudança de produção), **5** (produção com autoproteção), **6** (documentação oficial antes de afirmar:
    o `cache` do React, o *route segment config* do Next 16, RPC e agregados do PostgREST, *Timeouts* e *database
    linter* da Supabase), **7** e **8** (fechamento e versionamento). Stack fechada: nenhuma dependência nova.

---

## As três decisões do Johnny (16/09/2026)

1. **Uma run, um PR de código.** Os dois lotes da ficha — o custo, depois o motor — no mesmo PR, mais o PR só de
   documentação que leva a tag (o molde da F57→F59). O `drop` das assinaturas velhas sai **depois do deploy** desse PR,
   na mesma run.
2. **A trava de recorte vale na mesa E no catálogo do CI.** `rpcs-recorte-sql.test.ts` sobre o replay das migrations, e
   o par sobre o `pg_proc` do banco do CI, com mutação no injetor — a folga de 82 → 85 que a F59 deixou.
3. **O orçamento do as-of envelhece pelo CORPO da função, não pelo calendário.** `docs/perf/asof-orcamento.json` reprova
   quando está ausente ou quando o corpo vivo da função de as-of (o replay das migrations) não é o corpo que foi medido.
   Se o projeto parar dois meses, o CI continua verde.

---

## As frentes, e por que nesta ordem

- **A — o censo e as linhas de base.** Antes de mudar qualquer coisa: os 26 fatos remedidos, a tabela das chamadas, as
  medições "antes" de produção (só leitura) e o ruído do TTFB. Um "depois" sem o "antes" do mesmo método não prova nada.
- **B — lote 1, o custo.** Nada no motor: `cache()`, KPIs, `count` de `/ativos`, `cap` e keyset em `paginarTodos`, teto
  das três tabelas, `maxDuration`, `statement_timeout` conferido, o harness consertado e os índices decididos pela
  medição.
- **C — a trava, vermelha.** `rpcs-recorte-sql.test.ts` e o par do catálogo escritos contra a cadeia de HOJE, reprovando
  as sete `rel_*` pelo nome — é a regra 4 do §4: *"trava antes da correção, sempre que a trava puder nascer vermelha"*.
- **D — lote 2, o motor.** As migrations, as funções novas, o as-of reescrito, o consolidado por lista explícita,
  `/itens` numa chamada, os chamadores, os roteiros e as mutações — até a trava ficar verde e a equivalência fechar no
  ensaio.
- **E — os documentos.** A emenda F60 da matriz, o runbook (a receita da janela do `drop` serve de novo na virada), a
  ata.
- **F — o fechamento, com ordem interna rígida.** Versão → revisão adversarial → SHA congelado → CI verde → apply e
  equivalência em produção → merge → deploy → conferência → prova de ausência de chamador → `drop` → medições "depois" →
  relatório → PR de documentação → tag.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a fase F60 do `docs/PLANO-MULTIEMPRESA.md` (§5, Bloco D): fazer as RPCs de relatório recortarem POR DENTRO e
parar de pagar duas vezes por request o que já é caro — sem mudar um número de tela. Ao terminar: as sete `rel_*` que
recortam por filial foram substituídas por funções com nome novo que recebem `p_filiais smallint[]`, ligam o recorte a
uma coluna com `= any (p_filiais)` e devolvem VAZIO para NULL e para `'{}'` — nunca "tudo"; o consolidado continua
somando filial desativada, por lista explícita; o as-of foi reescrito ancorado em `ativos`, com a filial calculada na
data e o desempate `data desc, ordem desc`; `/itens` lê colunas e consolidado numa chamada; chamadores, roteiros SQL e
mutações falam a assinatura nova, e as velhas foram DROPADAS em ensaio e produção só depois de o app novo estar no ar e
de o `pg_stat_statements` provar que ninguém mais as chama; `paginarTodos` não compila sem `cap` e pagina por keyset
onde a ordem permite; dashboard, `/ativos`, as três tabelas do relatório, `/admin/colaboradores` e as rotas do grupo
`(app)` têm o custo decidido, medido e escrito; `src/lib/validators/rpcs-recorte-sql.test.ts` reprova na mesa, e o par
dele reprova no catálogo do CI, qualquer `rel_*` sem recorte obrigatório (decisão ii do Johnny); e
`docs/perf/asof-orcamento.json` registra o custo medido do as-of, preso ao corpo medido (decisão iii). Uma run, um PR de
código e um de documentação (decisão i). Versão `1.65.0`.

# Contexto

## Leia antes de escrever qualquer coisa
- `docs/PLANO-MULTIEMPRESA.md` — §1 (decisões 2, 4 e 5), §3 ("F53 destrava F60", "F58 destrava F60"), §4 (as 10 regras
  comuns a todas as fases — em especial a 2, estado de repouso; a 4, trava antes da correção; a 7, versionamento; a 10,
  a ORDEM de rollback), §5 → a ficha **F60** (a FONTE DA VERDADE do escopo: onde esta ordem e ela divergirem sem
  declaração, vale a ficha — `docs/README.md`), as fichas de **F63** (quem põe `empresa_id` nas leituras), **F65**,
  **F66**, **F67** (o mesmo mecanismo em `v_conflitos_filiais`) e **F68** (o visualizador sem `service_role`), e o §9 (a
  ordem de corte).
- `docs/prompts/F60-recorte-que-corta-scan-ultracode.md` — o cabeçalho com os **26 fatos medidos**. Este prompt os cita
  pelo número.
- `CLAUDE.md` e `AGENTS.md` — as regras permanentes, em especial a **1** (escopo), a **2** (nunca dado real), a **3**
  (R$ 0), a **5** (produção com autoproteção), a **6** (documentação oficial antes de afirmar comportamento: use o
  Context7) e a **8** (versionamento).
- `docs/MATRIZ-REGRAS.md` — a emenda F59 (R-ACC-63 → R-ACC-72), em especial a **R-ACC-71** (a regra que esta fase trava)
  e a **R-ACC-51** (a guarda no-op, que continua valendo onde vale); a **R-REL-33** (índice só por medição de plano) e
  as regras R-REL que o as-of, o consolidado e as tabelas do período já provam.
- `docs/RUNBOOK-BANCO.md` — "O caminho, em 30 segundos", a emenda F56 do gate, "Rollback — a regra geral", "Conferir o
  estado do banco" (a sonda de paridade), a trava de hash e o banco do CI na mesa. `docs/INVENTARIO-CREDENCIAIS.md` §2 e
  §5.
- Em `docs/DECISOES.md`: as atas da F53 (a ordem das movimentações e o apply), da F56 (o apply pelo MCP e o *hand-fix*
  do `database.ts`), da F58 (a porta, os mapas e o conferidor) e da F59 (as decisões 1 e 8).
- `docs/RELATORIO-F53.md` §8, `docs/RELATORIO-F58.md` §4, §11 e §13, e `docs/RELATORIO-F59.md` §12 e §13 — o backlog
  nomeado para esta fase.
- O código, nesta ordem: `src/lib/supabase/rpc.ts` e `rpc-mapas-sql.test.ts`; `src/lib/queries/relatorios/comum.ts` e
  `comum.test.ts`, `relatorios/estoque.ts`, `relatorios/itens.ts`, `relatorios/movimentacoes.ts`; `queries/itens.ts` e
  `lib/itens/lista.ts`; `queries/formas/relatorios.ts` e `formas/rpc-retorno-sql.test.ts`;
  `queries/relatorios/fronteira-viewer.test.ts`; `supabase/sem-cast-de-leitura.test.ts`; `(app)/layout.tsx` e
  `(app)/page.tsx`; `queries/conflitos.ts`, `queries/pendencias-detalhe.ts`, `queries/ativos.ts`,
  `queries/colaboradores.ts` e `auth/acesso.ts`. As migrations `0011`, `0016`, `0027`, `0056`, `0106`, `0115`, `0118` e
  `0133`→`0135`. Os roteiros `asof_desempate.sql`, `catalogo_secdef.sql` e o bloco 4 de `catalogo_policies.sql`.
  `scripts/db/corpo-vigente.mjs`, `predicado-policies.mjs`, `mutacoes.mjs` e `mutacoes.test.mts`. Os instrumentos
  `scripts/perf/medir.mjs`, `medir-itens.mjs`, `medir-rls.mjs` (o molde de só-leitura com alvo provado),
  `scripts/formas/conferir.mts` e `scripts/smoke/smoke-prod.mjs`.

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
Vinte e seis fatos, medidos em 16/09/2026 no cabeçalho desta ordem. Remeça cada um contra o disco e os bancos de hoje
antes de agir; onde a sua medição contrariar o número escrito, **a sua medição ganha**, desde que ela vá para o
relatório. Os que mais importam:
- **fato 1** — a primeira migration é a `0141`; a versão é `1.65.0`.
- **fato 5** — são oito `rel_*`; sete recortam por filial, e a oitava (`rel_saldo_colaborador`) não.
- **fato 6** — o `p_filial is null or` é não-sargável no caminho real, e um `EXPLAIN` com literal mente a favor dele.
- **fato 7** — `NOT NULL` não existe em parâmetro; "não-anulável" é vazio provado mais o tipo.
- **fato 8** — a filial do as-of é calculada na data; pré-recortar por `ativos.filial_id` muda o resultado.
- **fato 9** — o consolidado inclui filial desativada, e `listarFiliais()` não.
- **fato 10** — os consumidores das sete, inclusive 59 chamadas em 8 roteiros e 2 mutações ancoradas no texto do as-of.
- **fato 12** — só `contarConflitosAbertos` roda duas vezes, e com argumento-objeto o `cache()` nunca acerta.
- **fato 15** — 48 chamadas de `paginarTodos`; keyset em ordem composta e sobre RPC não sai de graça.
- **fato 18** — o `service_role` herda os 8 s do `authenticator`.
- **fato 22** — `movimentacoes_ordem_lista_idx` está vivo.

## Comandos que já existem — use, não reinvente
`npm run lint` · `npm run test` · `npx tsc --noEmit` · `npm run build` · `npm run verificar:actions` · `npm run db:lock`
(no MESMO commit da migration) · `npm run db:types` (a CLI lê a credencial sozinha; nunca exporte token para ele) ·
`node scripts/perf/medir.mjs` · `node scripts/smoke/smoke-prod.mjs` · `NODE_OPTIONS=--conditions=react-server npx tsx
--env-file=.env.local scripts/formas/conferir.mts --alvo=…`. `npm run db:test`, `npm run db:test:mutations` e `npm run
db:types:diff` rodam no job `banco-sem-docker` do CI — nesta mesa não há Postgres. **Não rode `db:seed` nem
`db:reset`.**

# Escopo

## Dentro — seis frentes, nesta ordem

### Frente A — o censo e as linhas de base
O primeiro entregável é `docs/PLAN-F60.md` com o censo, antes do primeiro commit que toque `src/`, `scripts/` ou
`supabase/` (a única exceção é o commit de instrumento do `medir.mjs`, abaixo); as linhas de base entram nele antes do
primeiro commit do lote 1.
- **Os 26 fatos remedidos**, cada divergência contra a ficha anotada.
- **A tabela das chamadas**: as 48 de `paginarTodos` e as 5 de `paginarPorIds` — arquivo:linha, tabela ou RPC, a ordem,
  se ela é total, se cabe keyset (cursor de coluna única? ordem composta? fonte RPC?) e o `cap` proposto com a conta que
  o justifica (o volume de hoje e a folga). E a tabela dos consumidores das sete `rel_*` (fato 10), um por linha.
- **As linhas de base "antes", em produção, só leitura, pelo MCP** (fato 25) — nunca com literal no lugar do argumento
  (fato 6): o TEMPO das sete `rel_*` chamadas como o PostgREST as chama, e o PLANO pelo corpo EMULADO com parâmetros — a
  chamada da função só mostra `Function Scan`, porque ela não é embutida —, por exemplo `prepare` do SELECT do corpo +
  `execute` com `plan_cache_mode = force_generic_plan` e `explain (analyze, buffers, format json)`, numa transação `read
  only` que não se confirma, como `authenticated`, com a identidade escolhida dentro do banco e sem id na saída (o molde
  do `medir-rls.mjs`); nada criado. E o `pg_stat_statements` das `rel_*` por papel (chamadas e média — filtre pelo nome
  no SQL e saia só com papel e números, nunca com o texto do statement); e **duas rodadas A/A** de `node
  scripts/perf/medir.mjs` contra produção, com a `1.64.0` no ar, no mesmo dia — a faixa de ruído que decide o que é
  "empate" nesta fase (fato 3). As rotas que a fase toca e o `medir.mjs` não mede (`/admin/colaboradores`,
  `/itens/historico`, `/itens/conferencia`) entram nele ANTES dessa linha de base, num commit só de instrumento — o
  único commit em `scripts/` permitido antes do lote 1 —, para o "antes" e o "depois" cobrirem as mesmas rotas.
  Evidência só com números, nomes de nó e rótulos.
- **As datas de amostra da equivalência** — a ficha pede 12. Escolha-as por CONSULTA de contagem, sem ler linha: datas
  com transferência, com estorno, com o empate do import (`2026-07-27`, o lote de 514 da R-REL-33), o go-live, uma data
  antes de qualquer movimentação, hoje. Grave só a data e o motivo da escolha.
- **A documentação vigente**, pelo Context7 (regra 6): o `cache` do React (como compara argumentos); o *route segment
  config* `maxDuration` do Next 16 (e a doc local em `node_modules/next/dist/docs/`); filtros sobre resultado de RPC e
  agregados no PostgREST; *Timeouts* e *database linter* da Supabase. Registre no plano o que cada uma diz.

### Frente B — lote 1: o custo, sem tocar no motor
Nenhuma `rel_*` muda aqui. Cada item com a medição antes/depois que o justifica, ou a decisão escrita de não fazer.
- **`cache()` nas contagens do shell** (fato 12): a memoização só acerta com chave estável — normalize o recorte numa
  chave primitiva (a forma é sua) e prove por teste que layout e página, no mesmo request, disparam UMA leitura de
  conflitos. `contarPendenciasAbertas` só entra se houver segunda chamada de verdade. Nunca memoize vínculo nem cargo
  (F49).
- **Os KPIs do dashboard** (fato 13): `getKpis` deixa de ler `ativos` inteira. Escolha entre contagens `head` por status
  e uma RPC — sem ligar agregado do PostgREST em produção —, e prove que os oito números são os mesmos de `kpisDeEstado`
  sobre a leitura antiga (teste com fixture fictícia e conferência de produção só com contagens). Uma RPC nova nasce com
  o prefixo `rel_` e recorte obrigatório, como as outras — é o prefixo que a põe sob a trava da Frente C.
- **O `count` de `/ativos`** (fato 14): decida e escreva — `exact`, `planned`, `estimated` ou teto com aviso — com o
  custo medido e a régua da casa: número aproximado nunca aparece como exato. Sem `pg_trgm`, sem busca por prefixo.
- **`paginarTodos`** (fato 15): `cap` como terceiro parâmetro OBRIGATÓRIO — esquecer vira erro de `tsc` —, por chamada,
  com o valor da tabela da Frente A; acima do `cap`, continua LANÇANDO. O laço interno vira **keyset** onde a ordem
  permite, com `movimentacoes.ordem` para movimentações; onde não permite (ordem composta sem cursor simples, fonte RPC
  sem filtro no tipo), o OFFSET fica, listado por chamada, com o motivo, no plano e na ata. As listas de TELA podem
  ficar em OFFSET (a ficha). A trava da F58 (`sem-cast-de-leitura.test.ts`) continua enxergando o que enxergava: se a
  assinatura mudar, os casos sintéticos mudam junto e provam a mesma coisa.
- **O teto das três tabelas do relatório** (fato 16): teto explícito com aviso na tela, no molde de
  `filaDeConsolidacao`; os KPIs continuam exatos. Se o aviso entrar no snapshot, é chave opcional na forma V2, nunca
  `meta.schema: 3`. No volume de hoje o aviso não aparece em lugar nenhum.
- **`maxDuration`** (fato 17): explícito nas rotas do grupo `(app)` que leem `lib/queries`, com o valor e o motivo; as
  que precisam de mais (o import) nomeadas e mantidas.
- **`statement_timeout`** (fato 18): confira o efeito se houver jeito só leitura; senão, a documentação e o catálogo são
  a prova. Registre. `alter role` em produção só se a medição contrariar a documentação — com o alcance escrito
  (visualizador, backup, carga) e o comando de reversão.
- **O harness `scripts/perf/medir-itens.mjs`** (fato 23): passa a medir as formas que o app EMITE (o `WHERE` real de
  `/itens` e do histórico), com a mesma guarda de alvo e a mesma limpeza. Rode-o no ENSAIO — pelo token de sessão, se
  ele JÁ estiver no ambiente do processo, ou emitindo o SQL para o MCP no molde do `medir-rls.mjs` —, num patamar que
  caiba nos 500 MB, SEM desligar trigger (`MEDIR_ITENS_DESLIGAR_TRIGGER` é DDL), e confira a limpeza pela contagem.
- **`lanc_item_criado_por_idx`** (a ficha): só com `explain (analyze, buffers)` antes/depois, no ensaio, no patamar do
  harness, na forma real; com ganho medido, migration própria com o plano no cabeçalho; sem ganho, não entra — e isso é
  resultado, não falha (R-REL-33). `lanc_item_ordem_lista_idx` NÃO entra (a ficha).
- **`movimentacoes_ordem_lista_idx`** (fato 22): a decisão que a F53 deixou. Índice de produção só se dropa com o
  consumidor identificado e trocado e o `idx_scan` parado; senão fica, com a ata.

### Frente C — a trava, antes do motor, vermelha
Sem banco, lendo as migrations NA COLETA (a lição da F57: varredura de disco dentro do `it` estoura o tempo-limite).
Reuse o replay de `corpo-vigente.mjs` e o molde de `predicado-policies.mjs`; se o analisador crescer, módulo próprio e
testável.
- **O universo**: toda função `public.rel_*` VIVA pelo replay — `create`, `create or replace`, `drop` e `alter …
  rename`, em ordem —, nunca os corpos históricos (`0016`, `0019`, `0022`, `0045`, `0047`, `0054`, `0109`…), senão a
  trava reprova para sempre e é desligada na primeira semana (a ficha). **Falha fechada**: DDL de `rel_*` montado por
  `execute`/`format` reprova com arquivo e linha; comando que o replay não consegue ler reprova em vez de ser pulado; e
  uma auto-conferência prova que todo `create`/`drop` de `rel_*` fora de comentário foi consumido.
- **A regra POSITIVA** (a ficha): toda `rel_*` declara o parâmetro de recorte, o corpo o liga a uma coluna com `= any
  (`, e ele não é anulável no sentido do fato 7 — nenhuma disjunção com `is null`, nenhum `coalesce(p, …)`, `nullif`,
  `case when p is null`, nenhum `or` que torne a ligação opcional. Proibir a substring `is null or` é frágil (a ficha):
  `or p is null` invertido e `coalesce(p_x, col) = col` passam. A regra julga o que o parâmetro FAZ, não como se
  escreve.
- **`rel_saldo_colaborador(uuid)`** (fato 5): decida por escrito — exceção declarada com motivo e destino (o recorte
  dela é por pessoa, e a pessoa pertence ao inquilino pela RLS da tabela), ou `p_colaborador` reconhecido como recorte
  que a regra aceita. Nunca por nome de função; e a lista de exceções numa fonte só (Decisão 2 da F48), no `.sql`, lida
  pela mesa — como a F59 fez.
- **O nível "tudo do recorte de cima"** (Frente D): se uma função devolver um total que não é `p_filiais`, a trava tem
  de distinguir isso do fail-open que a R-ACC-71 proíbe. Escreva a regra — por exemplo, o total só existe na mesma
  chamada que declara e usa `p_filiais`, ou o total também vem de lista explícita — e prove os dois lados.
- **O par no catálogo do CI (decisão ii)**: asserções sobre o `pg_proc` do banco do CI, no molde dos catálogos da F48 e
  da F59 (rótulos novos, `pg_temp.assert_zero_de`, uma linha `FIM`, falha em `WARNING: ✗`), no roteiro que for o lugar
  certo, sem duplicar fato de outro (Decisão 2 da F48). Onde a detecção sobre o catálogo não for confiável — o corpo de
  função SQL é texto em `prosrc` —, declare qual regra fica só na mesa e por quê. E **mutações novas** em
  `scripts/db/mutacoes.mjs`, derrubadas pelo rótulo NOMEADO — por exemplo, uma `rel_*` nova recriada com `p_filiais is
  null or`, e uma `rel_*` criada sem o parâmetro —, dentro do teto 85.
- **A guarda do próprio teste**, com SQL sintético EM MEMÓRIA — nunca arquivo novo em `supabase/migrations/`. Reprovam:
  `(p_filial is null or col = p_filial)`, `(col = any (p_filiais) or p_filiais is null)`, `coalesce(p_filiais, …)`,
  `case when p_filiais is null then true else … end`, o parâmetro declarado e não usado, ligado só por `<>`, e uma
  `rel_*` sem parâmetro de recorte. Passam: `col = any (p_filiais)` e a forma de dois níveis que a Frente D escrever.
- **A ordem**: escreva a mesa e o par ANTES do lote 2 e grave a saída VERMELHA dos dois contra a cadeia de HOJE — as
  sete `rel_*` nomeadas, e a oitava conforme a decisão — como primeira evidência. Não empurre o vermelho esperado
  sozinho: ele sobe junto com o lote 2.

### Frente D — lote 2: o motor
- **As funções novas**, em migration a partir da `0141` (o nome, a numeração e a divisão em arquivos são seus; a criação
  e o `drop` em arquivos SEPARADOS): as sete com `p_filiais smallint[]` e NOME NOVO (a ficha: criar com nome novo →
  migrar os chamadores → dropar a velha); `language sql stable`, `security invoker`, `set search_path = public` (fato
  25); `revoke … from public, anon` e `grant execute … to authenticated, service_role` (fato 11); NULL e `'{}'` → 0
  linhas, provado (fato 7). O corpo das cinco simples (`mov_itens`, `frescor_itens`, `mov_por_mes`, `por_motivo`,
  `resumo`) muda SÓ o recorte — o diff contra o corpo vivo mostra isso, e nada mais.
- **O as-of** (fato 8): a inversão por `join lateral` ancorada em `public.ativos a`, servida por `mov_ativo_idx` e por
  `movimentacoes_estorno_de_idx` — diga isso na migration, senão alguém mede sem o segundo e conclui que não ajudou (a
  ficha) —, com a filial CALCULADA na data, o predicado `existe`, a exclusão de `descartado`/`devolvido_fornecedor` e o
  desempate `data desc, ordem desc`. O recorte por `p_filiais` é sobre a filial calculada: um pré-filtro para cortar
  scan não pode mudar o resultado de ativo transferido depois da data — prove com cenário. Índice novo para a lateral
  (por exemplo `(ativo_id, data desc, ordem desc)`) só por medição (R-REL-33).
- **O consolidado** (fato 9): nenhum `null` chega à porta. "Todas" vira lista explícita que inclui filial desativada,
  montada num lugar só (a forma é sua; a camada de relatório pode manter `number | null` por dentro até a F63, desde que
  o `null` morra antes da porta — decisão escrita). O número do consolidado de hoje não muda.
- **`/itens` numa chamada** (fato 19): as colunas (as filiais ativas) e o consolidado (tudo, com desativada) na mesma
  leitura — `grouping sets` ou equivalente —, sem o `1 + N`. `estoqueForaDasColunas` continua > 0 exatamente quando há
  estoque fora das colunas, e zero no resto. Sem essa emenda o número vira sempre 0, a tela mente e o teste da função
  pura passa (a ficha). `getSaldosItensDeFiliais` e `getSaldosItens` seguem o mesmo caminho.
- **Os chamadores** (fato 10), todos: a porta (`rpc.ts` — as sete entradas saem de `ARGUMENTOS_ANULAVEIS`, e
  `rpc-mapas-sql.test.ts` continua conferindo o que sobrar), os descritores de forma e `rpc-retorno-sql.test.ts`, a
  lista branca do visualizador (troca 1:1, catraca `≤ 7` intacta), `linhas-tipos.test.ts`, `validar-truncamento.ts`,
  `seed.ts`, `fixtures-passe2.ts`, `smoke-prod.mjs`, `censo.mjs` e `conferir.mts`. `database.ts`: *hand-fix* datado
  primeiro (fato 24), depois regenerado por `npm run db:types` com as migrations aplicadas no ensaio, e conferido contra
  o *hand-fix*.
- **Os roteiros e as mutações** (fato 10): as 59 chamadas dos 8 roteiros passam à assinatura nova provando a MESMA coisa
  — nenhum rótulo some, nenhum cenário afrouxa —; as 2 mutações da F53 são reancoradas no corpo novo e derrubam os
  mesmos rótulos. Mais os cenários desta fase (Verificação): filial desativada com saldo de item e com ativo; ativo
  transferido depois da data; NULL e vazio nas sete.
- **`buscarEstornosAteData`** (fato 20): `.in('estorno_de', ids)` com os ids já lidos, em lotes (`paginarPorIds`, pelo
  limite de URL), sem filtro de filial.
- **`v_colaboradores_textos` e `/admin/colaboradores`** (fato 21): materializar o recorte antes do agregado (view nova
  por migration, `security_invoker` mantido) ou paginar a tela — pela medição, com a decisão escrita. A tela não perde
  linha nem número.
- **O orçamento do as-of** (decisão iii): `docs/perf/asof-orcamento.json` com o custo medido da função de as-of no
  volume de produção (tempo de execução e de planejamento, buffers, nós do plano, linhas, data, alvo, método) e a
  identidade do corpo medido (hash do corpo vivo normalizado); e a trava que reprova quando o arquivo falta ou quando o
  hash não é o do corpo vivo pelo replay — nunca por calendário. Como o CI passa ANTES de qualquer apply (fato 25), a
  primeira medição pode ser a do corpo EMULADO inline, só leitura, como a F59 fez com as formas do predicado — e é
  confirmada chamando a função depois do apply.
- **A equivalência ANTES de qualquer apply**: compare o corpo novo EMULADO inline (só leitura) contra a função velha, no
  ensaio e em produção, nas datas da Frente A — migration que tocou banco real não se edita mais (a trava de hash), e
  cada erro achado depois do apply custa uma migration nova. Só aplique quando a emulação fechar.
- **No ensaio, depois do CI verde com as migrations**: apply da criação → verificação pós-apply → a equivalência velho ×
  novo com a função de verdade (consolidado e cada filial, só contagem e hash) → apply do `drop` → `npm run db:types`
  conferido. O ensaio não tem app de produção: lá o `drop` não espera deploy.

### Frente E — os documentos
- `docs/MATRIZ-REGRAS.md`: emenda F60 (regra · fonte · localização · prova · veredito) — o recorte obrigatório das
  `rel_*` (a parte da R-ACC-71 que esta fase trava deixa de ser CONFORME-POR-LEITURA), o consolidado por lista explícita
  com filial desativada, a filial calculada do as-of, o `cap` obrigatório e o keyset, o custo do caminho quente
  decidido, e as exceções.
- `docs/RUNBOOK-BANCO.md`: o Anexo A com as migrations da fase (apply, verificação, rollback) e a receita da janela do
  `drop` (a prova pelo `pg_stat_statements` e a espera) — ela serve de novo na virada.
- `docs/ARQUITETURA.md` e `docs/README.md`: uma linha cada onde a camada de relatório e o índice pedirem.
- `docs/DECISOES.md`: a ata.
- Achado do censo fora desta lista: documento vivo → uma linha; registro (migration travada, ata, relatório de fase) →
  cite na emenda e no relatório.

### Frente F — o fechamento, nesta ordem
1. `1.65.0` no `package.json`; entrada no `CHANGELOG.md` (sem citar fase futura pelo código —
   `cobertura-changelog.test.ts`); entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6 mudanças em LINGUAGEM DE
   OPERADOR e o efeito MEDIDO — nunca "nada mudou", nunca um número que não foi medido.
2. A revisão adversarial de "Como trabalhar", e as correções que ela pedir.
3. **O SHA de código congelado**: o último commit que toca `src/**`, `scripts/**` ou `supabase/**`, gravado no
   `PLAN-F60.md` e na evidência. Depois dele, só `docs/**` e `CHANGELOG.md`.
4. O CI do PR verde sobre esse SHA — a trava verde, o par do catálogo verde, as mutações novas acusadas pelo rótulo, o
   gate de deriva verde.
5. **Produção, antes do merge**: o apply das migrations de criação (e das aditivas da fase) com a verificação pós-apply
   do fato 25; a equivalência velho × novo nas datas da Frente A (só contagem e hash); o `conferir.mts` sobre os
   descritores novos (conta do smoke, só contagens); o `explain` "depois" das funções novas no método do "antes"; e a
   medição de produção do orçamento do as-of. Nada aplicado antes do merge pode quebrar a `1.64.0`, que segue no ar até
   o deploy — view ou índice que mude o que ela lê espera o deploy, como o `drop`. O `drop` NÃO vai agora.
6. Ata em `docs/DECISOES.md` e `docs/RELATORIO-F60.md` com o que já dá para escrever; o PR sai do rascunho; merge só com
   `verificar` e `banco-sem-docker` verdes.
7. **A conferência pós-deploy, só leitura, antes de qualquer outro passo**: `/api/saude` com `1.65.0` e o commit do
   merge; `node scripts/smoke/smoke-prod.mjs` com 0 falha (a Parte B chama as funções novas).
8. **A prova de ausência de chamador e o `drop`** (fato 4): leia o `pg_stat_statements` das assinaturas VELHAS e das
   NOVAS por papel (`authenticated`, `service_role`); gere tráfego real com `medir.mjs` (operador e visualizador) e com
   o smoke; espere ao menos 30 minutos com o app novo no ar; leia de novo. As velhas com ZERO chamada nova do app e as
   novas com chamadas: aí, e só aí, o `drop` em produção, com `notify pgrst, 'reload schema'`, a prova de que as velhas
   não existem, o smoke outra vez e a sonda de paridade ensaio × produção. Chamada nova numa velha: ache o chamador pelo
   papel e pela forma do statement antes de qualquer outra coisa.
9. As medições "depois" sobre o estado final: duas rodadas de `medir.mjs` contra produção, comparadas com as A/A da
   Frente A dentro da faixa de ruído medida, corrigida pela deriva das rotas de controle (critério 27).
10. Um PR SÓ de documentação com a evidência pós-deploy, a do `drop`, a das medições e o fecho do relatório (precedente:
    F56, F58 e F59). A tag anotada `v1.65.0` vai no merge dele, o commit final da fase, e é publicada.

## Fora — não toque
O que a ficha põe em "Não entra": `lanc_item_ordem_lista_idx`; a busca de `/ativos` por prefixo; `pg_trgm` (exige
aprovação registrada, que não existe). E mais: `empresa_id` e tudo da virada (F62+); a camada de relatório inteira
trocando `number | null` por `UnidadesEfetivas` além do que a porta exige (F63); `v_conflitos_filiais` (F67); o
visualizador sem `service_role` (F68); as RPCs da Zona destrutiva e o `ALCANCE_DO_RESET` do `rpc.ts` (`p_filial null` =
alcance GLOBAL de exclusão com confirmação digitada — F67, pela `PLAN-F57.md` §6); policies e RLS (F66). `CLAUDE.md`. O
workflow do CI e a proteção da `main` — asserção nova num roteiro existente e mutação nova no injetor NÃO são gate novo.
Dependência nova. Configuração de produção do PostgREST (agregados) e da Vercel. `.env*` e `scratchpad/`. Os PRs do
dependabot. O Gerenciador de Credenciais do Windows. Migration já aplicada (as `0001`→`0140` não se editam). DDL em
banco real fora do apply das migrations desta fase — nenhuma função "de teste" em ensaio ou produção. Escrita em
produção além do apply e da sessão que o login grava no Supabase Auth; o volume fictício é só no ensaio.
`actions/termos.ts:211` e as duas réguas de "últimas movimentações" de `relatorios/movimentacoes.ts` (backlog da F53) —
só se o keyset precisar delas, com ata.

# Critérios de aceitação
1. `npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos; `npm run verificar:actions` verde.
2. `docs/PLAN-F60.md` tem o censo, a tabela das chamadas, a dos consumidores, as linhas de base "antes" de produção (ou
   a falta de canal declarada), as datas de amostra e o que a documentação diz; o censo é anterior ao primeiro commit
   que toca `src/`, `scripts/` ou `supabase/` (fora o commit de instrumento do `medir.mjs`), e as linhas de base,
   anteriores ao primeiro commit do lote 1.
3. As sete funções novas recebem `p_filiais smallint[]` e ligam o recorte com `= any (p_filiais)`, sem forma anulável;
   NULL e `'{}'` devolvem 0 linhas, sem erro, nas sete — provado em roteiro.
4. Grants das sete novas nos dois bancos: `anon` sem EXECUTE, `authenticated` e `service_role` com;
   `catalogo_secdef.sql` 6a verde.
5. O as-of novo ancorado em `ativos` por `join lateral`, com a filial calculada na data e o desempate `data desc, ordem
   desc`; `asof_desempate.sql` verde com todos os rótulos; o cenário "transferido depois da data" verde.
6. A equivalência velho × novo — datas de amostra (ou janelas, nas funções de período) × (consolidado e cada filial) ×
   as sete funções — igual em contagem e hash, no ensaio e em produção, com a evidência só de números.
7. O consolidado inclui filial desativada: cenário em roteiro; nenhum número de relatório muda em produção (a
   equivalência).
8. `/itens` lê colunas e consolidado numa chamada; `estoqueForaDasColunas` > 0 exatamente com estoque fora das colunas e
   0 no resto — provado por cenário SQL e por teste.
9. Os chamadores do fato 10 migrados: nenhum `p_filial` das sete fora de migration histórica, ata ou relatório;
   `ARGUMENTOS_ANULAVEIS` sem as sete; `rpc-mapas-sql.test.ts`, `rpc-retorno-sql.test.ts`, `fronteira-viewer.test.ts`
   (catraca `≤ 7`) e `sem-cast-de-leitura.test.ts` verdes, provando o que provavam.
10. Os 8 roteiros com as 59 chamadas migradas, sem rótulo a menos; as 2 mutações da F53 reancoradas derrubando os mesmos
    rótulos.
11. `src/lib/validators/rpcs-recorte-sql.test.ts` existe, lê as migrations na coleta, julga o corpo VIVO pelo replay,
    falha fechado e reprova os sintéticos da Frente C; a saída VERMELHA contra a cadeia de hoje está na evidência.
12. O par no catálogo do CI verde no `banco-sem-docker`, com as regras deixadas só na mesa declaradas com o motivo; as
    mutações novas acusadas pelo rótulo; `mutacoes.test.mts` verde, dentro do teto 85 — ou o teto ajustado com o motivo
    na ata.
13. `rel_saldo_colaborador` decidida por escrito; a exceção, se houver, numa fonte só e conferida nos dois sentidos.
14. `paginarTodos` não compila sem `cap`; as 48 + 5 chamadas com `cap` justificado; keyset onde a tabela da Frente A diz
    que cabe, e o OFFSET restante listado com o motivo.
15. As sete assinaturas velhas DROPADAS no ensaio e em produção — em produção, depois do deploy e da prova do
    `pg_stat_statements` —; ou, com o `drop` barrado ou sem prova, PENDENTE com o bloqueio e o comando no topo do
    relatório.
16. `cache()` com chave primitiva, e o teste de UMA leitura de conflitos por request.
17. `getKpis` sem ler `ativos` inteira, com os oito números iguais (teste e conferência de produção por contagem).
18. O `count` de `/ativos` decidido e escrito, com o custo medido.
19. As três tabelas do relatório com teto e aviso, que não aparecem no volume de hoje; o snapshot sem `meta.schema`
    novo.
20. `maxDuration` nas rotas decididas, e o import mantido com o que precisa.
21. `statement_timeout` conferido e registrado; nenhum `alter role` sem a medição que o justifique.
22. `medir-itens.mjs` mede a forma que o app emite, rodado no ensaio com a limpeza conferida por contagem — ou PENDENTE,
    sem canal.
23. `lanc_item_criado_por_idx` decidido pela medição no ensaio (migration com o plano no cabeçalho, ou a ata dizendo por
    que não); `movimentacoes_ordem_lista_idx` decidido com o consumidor identificado.
24. `buscarEstornosAteData` com `.in('estorno_de', ids)` e sem filtro de filial.
25. `/admin/colaboradores` decidido e medido, sem perder linha nem número.
26. `docs/perf/asof-orcamento.json` existe com o hash do corpo medido; a trava reprova arquivo ausente e hash diferente,
    e nunca por calendário.
27. TTFB "depois" empata ou melhora em todas as rotas medidas — inclusive as três que a Frente A acrescentou —, dentro
    da faixa A/A da Frente A corrigida pela deriva das rotas de controle que a fase não toca (`/vercel.svg`, `/login`,
    `/relatorios/acesso`) entre o "antes" e o "depois"; se a deriva do controle passar dos 18% do fato 3, o "depois" se
    repete. O que piorar fora da faixa: corrigido, ou explicado com a causa medida.
28. `supabase/migrations.lock.json` e `migrations-f38.test.ts` com as migrations novas; `database.ts` regenerado e igual
    ao *hand-fix*; gate de deriva verde; nenhuma migration `0001`→`0140` tocada.
29. Emenda F60 na `docs/MATRIZ-REGRAS.md`; Anexo A e receita da janela no `docs/RUNBOOK-BANCO.md`; ata em
    `docs/DECISOES.md`.
30. `package.json` em `1.65.0`, `CHANGELOG.md` e `registry.ts` com entrada; tag anotada `v1.65.0` publicada no merge do
    PR de documentação — ou nenhuma tag, com o motivo e o comando no topo do relatório.
31. `docs/RELATORIO-F60.md` no padrão F45→F59, com o roteiro do Johnny no topo.
32. Os dois PRs mergeados com `verificar` e `banco-sem-docker` verdes, e a conferência pós-deploy feita — ou o bloqueio
    no topo do relatório.
33. Nenhum dado real (id, e-mail, nome, patrimônio, slug de linha, texto de statement, valor de credencial) em teste,
    evidência, log ou saída de script; token nunca impresso nem gravado.
34. O relatório declara o estado de repouso: o que acontece se o projeto parar aqui por dois meses — inclusive se o
    `drop` ficou pendente.

# Verificação — rode de verdade
A cada incremento: `npm run lint`, `npm run test`, `npx tsc --noEmit`; `npm run build` antes de cada push. Leia a falha,
corrija a **causa raiz** e repita até passar. **Não alargue exceção para caber um caso que devia reprovar, não troque
detecção por `skip`, não afrouxe cenário de roteiro para a função nova passar, e não mude teste existente sem conferir
que ele prova a mesma coisa.** Falha persistindo depois de ~3 ciclos: mude de abordagem e registre a troca.

**O "ANTES" VEM ANTES DO "DEPOIS", E NENHUM NÚMERO DE TELA MUDA.** As linhas de base da Frente A são medidas antes de
qualquer mudança; a equivalência velho × novo é o portão do merge — hash diferente em qualquer célula, e o merge não
acontece até a causa estar no relatório e corrigida.

Provas obrigatórias, cada uma com a saída real em `docs/f60-evidencias/`:
- **Sabotagem A — a trava vermelha de hoje:** a mesa e o par contra a cadeia de antes do lote 2 → vermelho nomeando as
  sete `rel_*` (e a oitava conforme a decisão); depois do lote 2 → verde.
- **Sabotagem B — os disfarces do fail-open:** os sintéticos da Frente C, em memória, cada um vermelho; `col = any
  (p_filiais)` e a forma de dois níveis verdes.
- **Sabotagem C — o `cap`:** uma chamada de `paginarTodos` sem o terceiro argumento → `tsc` vermelho, com a saída.
- **Sabotagem D — o orçamento:** sem o JSON → vermelho; uma migration sintética EM MEMÓRIA mudando um byte do corpo da
  função de as-of → vermelho ("velho"); restaurado → verde.
- **Sabotagem E — o par no CI:** as mutações novas no run do `banco-sem-docker`, cada uma derrubada pelo rótulo nomeado
  — o link do run e o trecho do log.
- **Sabotagem F — a filial desativada:** cenário com uma filial fictícia desativada, com saldo de item e com ativo → o
  consolidado novo soma, as colunas não, e o "fora das colunas" é > 0; com a emenda de dois níveis desfeita (mutação ou
  variante do cenário), o número vira 0 e o roteiro fica vermelho.
- **Sabotagem G — o transferido depois da data:** cenário com ativo que estava em A na data e foi para B depois → no
  as-of da data, A o tem e B não; um pré-filtro por `ativos.filial_id` injetado → vermelho.
- **Sabotagem H — NULL e vazio:** as sete funções novas com NULL e com `'{}'` → 0 linhas, sem erro.
- **Sabotagem I — o `cache()`:** com a chave instável (o objeto cru) → o teste de uma leitura por request fica vermelho.
- **A equivalência:** por data × recorte × função, contagem e hash, velho × novo, no ensaio e em produção.
- **A janela do `drop`:** o `pg_stat_statements` por papel antes × depois, as velhas sem chamada nova do app, as novas
  com.
- **O custo:** o `explain` antes × depois das funções (no método do fato 6), o índice no ensaio, o TTFB A/A × depois, o
  orçamento do as-of emulado × chamado.
- **A contagem final:** `rel_*` vivas (8 → 8), grants, mutações (82 → N), roteiros e rótulos, testes antes × depois,
  `npm run build` colado por inteiro, e uma varredura das evidências por padrão de UUID, e-mail, patrimônio e texto de
  statement, com zero ocorrência.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em
nenhuma hipótese. Régua, nesta ordem: (1) uma medição sua contra o disco ou o banco de hoje; (2) as três decisões do
Johnny abaixo, que estendem a ficha; (3) a ficha da F60 no §5 do plano; (4) este prompt, no que ele detalha — e onde ele
diverge da ficha, a divergência está declarada aqui e vai para o relatório; (5) as convenções do repositório
(`CLAUDE.md`, `AGENTS.md`, código existente); (6) a opção mais simples e reversível. Decisão não-óbvia vai para
`docs/DECISOES.md` com data, contexto, escolha e motivo.

**As três decisões do Johnny (16/09/2026), que a ficha não tinha:**
i. **Uma run, um PR de código** com os dois lotes (custo → motor), mais o PR de documentação com a tag; o `drop` das
   assinaturas velhas sai depois do deploy desse PR, nesta mesma run.
ii. **A trava de recorte vale na mesa E no catálogo do CI**, com mutação no injetor.
iii. **O orçamento do as-of envelhece pelo corpo da função**, nunca pelo calendário.

**As dez decisões que esta fase precisa tomar por escrito:**
1. **As assinaturas** — os nomes novos, o tipo, e o que "não-anulável" significa sem `NOT NULL` (fato 7).
2. **O consolidado** — de onde vem a lista com filial desativada, onde o `null` morre, e o nível "tudo do recorte de
   cima" de `/itens`.
3. **O as-of** — a lateral, o pré-filtro (se houver), os índices e a prova.
4. **A janela do `drop`** — a espera, a leitura do `pg_stat_statements`, o que conta como chamador, e o que fazer se ele
   aparecer.
5. **`paginarTodos`** — o `cap` por chamada, onde entra keyset e onde fica OFFSET, e o que acontece no teto.
6. **O custo do caminho quente** — `cache`, KPIs, `count` de `/ativos`, teto das tabelas, `maxDuration`,
   `statement_timeout`.
7. **Os índices** — `lanc_item_criado_por_idx`, `movimentacoes_ordem_lista_idx` e o da lateral, cada um pela medição.
8. **Colaboradores** — materializar o recorte ou paginar a tela.
9. **A trava** — a regra positiva, a oitava `rel_*`, o nível do total, o par no catálogo, as mutações e a lista de
   exceções.
10. **O orçamento do as-of** — o que se mede, o hash, o formato e a emulação antes do apply.

Falha persistindo depois de ~3 tentativas: **mude de abordagem** e registre. Bloqueios reais, e o que fazer em cada um:
- **Sem canal para o apply** — nem o MCP da Supabase nesta sessão, nem `SUPABASE_ACCESS_TOKEN` já no ambiente para a
  Management API (o caminho da F53, com o registro no ledger que ela fez) —, ou o classificador barrando o apply de
  criação: não repita, não reformule, não procure caminho até o token. Entregue tudo o que não depende de banco real —
  código, travas, migrations, roteiros e mutações verdes no CI, documentos — com o PR ABERTO e **SEM merge** (o app novo
  chamaria funções que produção não tem), e ponha no topo do relatório os comandos exatos do apply, da equivalência e da
  janela do `drop`.
- **Criação aplicada, e só o `drop` barrado ou sem prova de ausência de chamador:** o merge acontece; as funções velhas
  ficam em produção — inofensivas: ninguém as chama, e o comportamento delas é o de hoje —; o `drop` vai para o topo do
  relatório com a prova que falta e o comando (caminho B do runbook, se o classificador barrou). É o único repouso com
  pendência aceitável nesta fase, e ele é declarado.
- **Equivalência divergente em produção:** não faça merge; ache a causa (dado que o ensaio não tem? filial desativada?
  transferência?) e corrija por migration NOVA — a aplicada não se edita —, voltando ao passo 3 da Frente F.
- **Ensaio pausado, cota de Actions esgotada, CI fora do ar:** contorne se for seguro; senão entregue o resto e registre
  a pendência com o que falta para resolvê-la.
- **Recusa do classificador em qualquer outra ação** (merge, push de tag): registre, não repita, siga no que não depende
  dela.

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que esteja no relatório — foi
assim que a F46, a F53, a F55, a F57, a F58 e a F59 acertaram o próprio escopo. **Aqui já há catorze divergências
medidas de saída**, e elas vão no relatório: a primeira migration é a `0141`, não a `0137` (fato 1); `NOT NULL` não
existe em parâmetro de função (fato 7); são oito `rel_*`, e a oitava não tem recorte de filial (fato 5); os "10
chamadores" são 8 no app, 1 pela porta, 7 diretos em scripts, 59 chamadas em 8 roteiros, 2 mutações e os mapas,
descritores e listas (fato 10); o "duas vezes por request" é só `contarConflitosAbertos`, e com argumento-objeto o
`cache()` nunca acerta (fato 12); `paginarTodos` tem 48 chamadas e mais 5 de `paginarPorIds`, não 7 (fato 15); o
visualizador não está sem teto, porque o `service_role` herda os 8 s do `authenticator` (fato 18); a "precedência do
ajuste" é, desde a F53, `data desc, ordem desc` (fato 8); a divergência declarada de `/itens` mora em
`lib/itens/lista.ts` e em `itens-table.tsx`, não em `itens/page.tsx:187-191` (fato 9); `lanc_item_criado_por_idx` não se
prova em produção, com 148 lançamentos (fato 2); `movimentacoes_ordem_lista_idx` está vivo (fato 22); o agregado do
PostgREST está desligado, e o `group by` da ficha pede RPC ou configuração (fato 13); keyset sobre RPC não compila pela
porta e ordem composta não tem cursor simples (fato 15); e o "não-sargável" se confirma no caminho real, mas um
`EXPLAIN` com literal mente a favor da forma velha (fato 6). Declare também o que este prompt acrescenta: a prova de
ausência de chamador pelo `pg_stat_statements` antes do `drop`; a faixa A/A do TTFB; os cenários de filial desativada e
de transferência depois da data; a decisão sobre a oitava `rel_*`; o orçamento preso ao corpo (decisão iii); o par no
catálogo (decisão ii); e a equivalência também no ensaio.

# Git e segurança
Branch `f60-recorte-que-corta-scan`, commits pequenos e frequentes, mensagens em pt-BR no padrão conventional
(`docs(f60): …`, `test(f60): …`, `perf(f60): …`, `feat(f60): …`, `fix(f60): …`, `chore(f60): …`). Commite também esta
ordem (`docs/prompts/F60-recorte-que-corta-scan-ultracode.md`) num commit de documentação; o `PLAN-F60.md` vem antes do
primeiro commit que toca `src/`, `scripts/` ou `supabase/`. O lote 1 e o lote 2 em commits separados, nessa ordem.
Agrupe os pushes — cada um custa CI numa cota apertada. PR com `gh pr create`, como rascunho desde o primeiro push que
precisar de CI; merge só com `verificar` e `banco-sem-docker` verdes. Depois do merge: o `drop` em produção pelo MCP (a
migration já está na `main`), a evidência por um PR só de documentação, e correção de código por PR novo. **Nunca:**
push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que não é seu, commitar `.env*`
ou `scratchpad/`, copiar o `.env.local` para outro diretório, editar migration já travada, mexer na proteção da `main`,
DDL em banco real fora do apply das migrations desta fase, função de teste em banco real, `alter role` ou configuração
do PostgREST ou da Vercel sem a medição e a ata, `drop` em produção antes do deploy e da prova do `pg_stat_statements`,
ler o Gerenciador de Credenciais do Windows, imprimir ou gravar token, ou mexer nos PRs do dependabot.

# Como trabalhar
Explore com subagentes paralelos, e **cada um volta só com resumo e NÚMEROS MEDIDOS** (nunca com dado real): (a) **o
motor** — os corpos vivos das oito `rel_*`, os consumidores do fato 10, a forma do PostgREST no `pg_stat_statements` e
as linhas de base de produção, só leitura; (b) **`paginarTodos`** — as 53 chamadas, as ordens, onde cabe keyset, o
`cap`, e o que a trava da F58 exige; (c) **o custo** — `cache` (e a doc do React), KPIs, `/ativos`, as três tabelas e o
snapshot, `maxDuration` (e a doc do Next 16), `statement_timeout` (e a doc da Supabase), colaboradores; (d) **os moldes
das travas** — `predicado-policies.mjs`, `policies-initplan.test.ts`, o bloco 4 de `catalogo_policies.sql`,
`catalogo_secdef.sql`, `catalogos-seguranca.test.ts`, `corpo-vigente.mjs`, `mutacoes.mjs` e `mutacoes.test.mts`,
`rpc-mapas-sql.test.ts`, `rpc-retorno-sql.test.ts` e `fronteira-viewer.test.ts`: o que uma função nova, uma asserção
nova e uma mutação nova precisam satisfazer em cada um; (e) **a medição e o apply** — `medir.mjs`, `medir-itens.mjs`,
`medir-rls.mjs`, `conferir.mts`, o runbook (apply, rollback, paridade) e o harness no ensaio.

Escreva `docs/PLAN-F60.md` antes de implementar, com: o censo; as duas tabelas; as linhas de base; as datas de amostra;
o desenho das funções, do as-of, do consolidado e de `/itens`; a janela do `drop` passo a passo; as dez decisões; e a
**ORDEM DE ROLLBACK**, que é o inverso da de apply, com o `drop` como a parte que um `create or replace` não desfaz —
antes do `drop`: reverter o app (`git revert` + redeploy) e então dropar as funções novas; depois do `drop`: recriar as
sete velhas com os corpos vivos (`0134`, `0027`, `0016`, `0011`) e os grants da `0056`, `notify pgrst, 'reload schema'`,
e só então reverter o app; índice e view novos por `drop` ou pelo corpo anterior. **A edição é sequencial**:
`paginarTodos`, a porta e os chamadores se cruzam nos mesmos arquivos. Paralelize exploração, medição e revisão — não
edição.

Antes de congelar o SHA (Frente F, passo 3), **revisão adversarial por subagentes em contexto fresco**, contra o
`PLAN-F60.md` e os 34 critérios, com estas perguntas: algum número de tela muda — consolidado sem filial desativada,
as-of de ativo transferido, estorno de ativo transferido, `/itens` com filial desativada, KPI com `emprestado` ou com as
baixas? algum `null` ainda chega à porta, ou alguma função nova devolve "tudo" para NULL, `'{}'` ou um disfarce? a trava
julga o corpo VIVO, reprova DDL dinâmico, e a oitava `rel_*` foi decidida sem exceção por nome? cada asserção nova do
catálogo tem mutação que a derruba pelo rótulo? os roteiros migrados provam a MESMA coisa — algum rótulo sumiu ou
afrouxou? as mutações da F53 reancoradas ainda derrubam os rótulos delas? alguma chamada de `paginarTodos` ficou sem
`cap`, com `cap` sem conta, ou com keyset sobre ordem que não é total? o `cache()` acerta de verdade, ou a chave muda
entre layout e página? o teto das tabelas afirma número truncado com cara de certo em algum lugar — tela, CSV ou
snapshot? a medição usou literal onde o PostgREST usa parâmetro? o `drop` só pode acontecer depois do deploy e do
`pg_stat_statements`, e o rollback escrito funciona na ordem escrita? alguma evidência tem id, e-mail, nome, patrimônio
ou texto de statement? algum arquivo fora do escopo foi tocado? Cada achado passa por um cético instruído a refutá-lo.
**Aponte apenas lacunas de correção ou de requisito declarado — não preferências de estilo.** Corrija e re-revise até
limpar.

# Relatório final
`docs/RELATORIO-F60.md`, em pt-BR, no padrão dos relatórios F45→F59, **com o roteiro do Johnny no TOPO** — o que ficou
com ele, passo a passo, e por quê. No mínimo: se o apply, a equivalência ou o `drop` ficaram pendentes, os comandos
exatos vêm PRIMEIRO; depois do deploy, conferir `/api/saude` com `1.65.0`; abrir `/itens` e `/relatorios/geral` e
comparar com os números que o relatório lista (os mesmos de antes); o `git diff v1.64.0 v1.65.0 --stat` com o que deve e
o que não deve aparecer; rodar `npm run test` uma vez. Depois: o que mudou por arquivo e por quê; **os números MEDIDOS**
lado a lado com a ficha, e **cada divergência explicada** — a começar pelas catorze já conhecidas; as duas tabelas; as
**dez decisões** com o custo que decidiu cada uma; as nove sabotagens com saída real; a equivalência; a janela do
`drop`; o custo antes × depois; o orçamento do as-of; os 34 critérios autoverificados; o estado de repouso; e a seção
**"o que este relatório NÃO prova"** — no mínimo: que a equivalência vale para toda data (vale para as de amostra, sobre
o dado de hoje); que a trava julga a FORMA do recorte, não se a lista passada é a certa; que o TTFB vale para outro
volume; que o índice medido com volume fictício no ensaio se comporta igual em produção quando o volume chegar; que
nenhuma aba aberta antes do deploy viu erro na janela do `drop`; e que o consolidado de quem entra pela senha é "tudo"
porque o `service_role` não tem RLS — isso é da F68. Pendências e **backlog nomeado**: para a **F63** (a camada de
relatório com `number | null`, se ficou; `empresa_id` nas leituras); para a **F65** (`(empresa_id, ordem)` e o cursor do
keyset); para a **F66** (re-rodar `medir-rls.mjs`, `medir.mjs` e o orçamento do as-of imediatamente antes); para a
**F67** (`v_conflitos_filiais`, o mesmo mecanismo da view de colaboradores, e o `ALCANCE_DO_RESET`); para a **F68** (o
visualizador sem `service_role`, e o teto dele); o que ficou em OFFSET, e por quê; os índices não criados, com a
medição. **Evidências, não afirmações:** saída real e completa dos comandos. Termine a resposta final com um resumo de 5
linhas em pt-BR.

# Idioma
Narrativa, plano, ata, relatório e comentários em **pt-BR**. Identificadores de domínio em português sem acento; os
nomes de arquivo que a ficha fixa (`rpcs-recorte-sql.test.ts`, `asof-orcamento.json`, `medir-itens.mjs`) ficam como
estão. Commits em pt-BR no padrão conventional. As mudanças do `registry.ts` em LINGUAGEM DE OPERADOR — há teste que
recusa termo de desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~20 minutos)

Esta fase **aplica migrations** no ensaio e em produção, **dropa** funções de produção depois do deploy, lê produção por
SQL (o `explain` genérico, o `pg_stat_statements`, a equivalência), roda o smoke e o `medir.mjs`, e popula o ensaio com
volume fictício. O pré-voo existe para nada disso travar no meio.

Este arquivo já está salvo em `docs/prompts/F60-recorte-que-corta-scan-ultracode.md`, **sem commit** — o agente o
commita na branch da fase. O prompt cita os 26 fatos do cabeçalho pelo número, então ele precisa estar lá quando você
colar o bloco. Arquivo não rastreado sobrevive ao `git checkout main` abaixo.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit

# 2. Onde a F59 parou: 1.64.0, tag v1.64.0 no merge do PR #51 (4c380ec); fora do git, só este arquivo.
type package.json | findstr version
git log --oneline -3
git tag --points-at HEAD
git status --short

# 3. Produção com a mesma versão.
curl.exe -s https://ti-wap-inventory-control.vercel.app/api/saude

# 4. As credenciais que a fase usa existem. Imprime só os NOMES, nunca o valor.
Select-String -Path .env.local -Pattern '^(SMOKE_SUPABASE_URL|SMOKE_SUPABASE_ANON_KEY|SMOKE_EMAIL|SMOKE_SENHA|SEED_PROJECT_REF)=' |
  ForEach-Object { ($_.Line -split '=')[0] }

# 5. O smoke de produção passa HOJE — a Parte B é a que chama as rel_* com sessão.
node scripts/smoke/smoke-prod.mjs

# 6. gh autenticado e versão do Claude Code (o modo auto exige 2.1.83+).
& "C:\Program Files\GitHub CLI\gh.exe" auth status
claude --version
```

**O MCP da Supabase — desta vez é o caminho do apply.** As migrations, o `drop` e as leituras de produção passam por
ele. Depois de abrir o `claude`, rode `/mcp` e confira que o servidor da Supabase aparece **conectado e autenticado**,
com acesso aos dois projetos (produção e ensaio). Na falta dele, o token de sessão abaixo vira o caminho (a Management
API, como na F53). Sem nenhum dos dois, o prompt entrega tudo verde no CI e **deixa o PR aberto, sem merge**, com os
comandos no topo do relatório — o app novo chamaria funções que produção ainda não tem.

**Um token de sessão, com validade curta — recomendado: é o que o harness usa, e o plano B do apply.** O
`medir-itens.mjs` lê `SUPABASE_ACCESS_TOKEN` só do ambiente do processo. Em supabase.com/dashboard/account/tokens, gere
um token com a menor validade que o painel oferecer (adianta a pendência de girar o token, `INVENTARIO-CREDENCIAIS.md`
§5) e ponha-o só nesta janela do PowerShell, sem eco e sem histórico:

```powershell
$s = Read-Host "SUPABASE_ACCESS_TOKEN" -AsSecureString
$env:SUPABASE_ACCESS_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
Remove-Variable s
```

Abra o `claude` nessa mesma janela e feche-a no fim da run. Sem o token, o agente emite o SQL do harness pelo MCP ou
marca a medição do índice como pendente. O prompt proíbe ler o cofre do Windows, pedir o token e imprimi-lo.

**Mais quatro coisas que só você confere antes de colar:**

1. **O ensaio (`sgmvldiizsrjbxzzpmhh`) está ATIVO** no painel da Supabase — o plano Free pausa projeto parado, e a fase
   aplica, compara e mede nele primeiro.
2. **A cota de Actions**, em github.com/settings/billing. O PR de código passa por vários ciclos do `banco-sem-docker`
   (o lote 1, o lote 2 com a trava, as correções da revisão), mais o PR de documentação.
3. **A Skew Protection da Vercel** (projeto → Settings → Advanced). Se estiver ligada, uma aba aberta ANTES do deploy
   pode continuar presa ao deploy velho e, depois do `drop`, dar erro ao gerar relatório ou abrir saldo de item. O
   prompt espera 30 minutos e prova pelo `pg_stat_statements` que o app parou de chamar as funções velhas, mas não
   enxerga aba parada: peça a quem estiver com o sistema aberto que recarregue a página depois do deploy.
4. **Dentro do Claude Code:** `/permissions` (nada negando `git push`, `gh`, `node` ou `npx tsx`) e `/memory` (o
   `CLAUDE.md` do projeto listado).

**MCP:** além da Supabase, o **Context7** ajuda de verdade — o `cache` do React (como ele compara argumentos), o
`maxDuration` do Next 16, filtros sobre resultado de RPC e agregados no PostgREST, e a página *Timeouts* da Supabase.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f60
# cole o bloco do prompt inteiro e deixe rodando
```

Modo `auto` é o certo: a fase roda testes, build, scripts que leem produção, `apply_migration`, `gh pr create`, merge,
tag e push — nada disso cabe numa allowlist estreita, e `bypassPermissions` numa máquina com credencial de produção no
`.env.local` e talvez um token de conta na sessão está fora de questão.

**Onde o classificador pode barrar:** o `drop function` em produção (DDL destrutivo, ainda que não apague dado) e, menos
provável, o apply de criação — a F53 e a F56 aplicaram em produção pelo agente. Se barrar, o prompt manda **não
reformular**: com a criação aplicada e só o `drop` barrado, o merge acontece e o `drop` vai para o topo do relatório,
com o comando para você rodar no SQL Editor (caminho B do runbook).

**`--worktree` NÃO serve:** o smoke, o `medir.mjs` e o conferidor precisam do `.env.local`, que não vai para a worktree,
e o prompt proíbe copiá-lo. Rode no diretório principal e não mexa no repositório enquanto a run durar.

Se a cota semanal estiver apertada: `$env:CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` antes do `claude`. Na F60, economize na
exploração; a revisão adversarial e a equivalência são onde o modelo forte rende.

Se preferir de madrugada, headless (o prompt vai por stdin, porque o bloco passa do limite de linha de comando do
Windows; o token, se for usar, precisa estar na MESMA janela):

```powershell
# salve só o bloco do prompt em prompt-f60.txt (fora do repositório)
$utf8 = New-Object System.Text.UTF8Encoding $false   # UTF-8 SEM BOM: o BOM entraria antes do "ultracode"
$OutputEncoding = $utf8; [Console]::OutputEncoding = $utf8
Get-Content ..\prompt-f60.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-f60.json
# guarde o session_id do JSON: sessão -p só se retoma por ele (claude --resume <session_id>)
```

Em headless, um MCP que depende de login interativo pode não subir — e sem canal de apply esta fase não faz merge —;
bloqueio repetido do classificador **aborta** a sessão; e o `/goal` abaixo não se aplica, então a condição de parada é
só a do próprio prompt (os 34 critérios e o relatório). **Para esta fase, prefira a sessão interativa deixada rodando,
com o `/goal`**, mesmo de madrugada: desligue a suspensão do Windows (plano de energia) antes — a janela do `drop`
sozinha leva mais de meia hora.

Recomendado para desatendido — a condição de parada como avaliador separado. Digite o `/goal` logo depois de colar o
prompt, na mesma sessão (no headless por stdin ele não se aplica):

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit limpos; src/lib/validators/rpcs-recorte-sql.test.ts existe e passa; as sete funcoes de relatorio com p_filiais estao em supabase/migrations a partir da 0141 e nenhuma migration 0001-0140 foi tocada; docs/perf/asof-orcamento.json existe; package.json em 1.65.0; e UM destes desfechos: (a) o PR da fase e o PR de documentacao estao mergeados com verificar e banco-sem-docker verdes, a conferencia pos-deploy passou, as assinaturas velhas foram dropadas em ensaio e producao depois da prova do pg_stat_statements, e a tag v1.65.0 foi publicada; (b) o mesmo, mas com o drop em producao ou o push da tag barrado, com o bloqueio e o comando no topo do docs/RELATORIO-F60.md; ou (c) sem canal para o apply, o PR ficou aberto sem merge, com os comandos no topo do docs/RELATORIO-F60.md
```

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Cinco momentos para acompanhar:

1. **O "antes".** `docs/PLAN-F60.md` com o censo, a tabela das 48 chamadas, as linhas de base de produção e as duas
   rodadas A/A do TTFB, antes do primeiro commit em `src/`, `scripts/` ou `supabase/`.
2. **A trava vermelha.** A evidência com a mesa e o par reprovando as sete `rel_*` de hoje, pelo nome — antes do lote 2.
3. **A equivalência.** No ensaio e, antes do merge, em produção: contagens e hashes iguais em todas as células. Um hash
   diferente segura o merge — é o momento de olhar.
4. **A janela do `drop`.** O `pg_stat_statements` antes × depois, por papel; o `drop` só depois das velhas sem chamada
   nova.
5. **As evidências.** Só números, hashes e nomes de nó. Um id, e-mail, nome, patrimônio ou texto de statement ali é dado
   real entrando no repositório: interrompa a sessão.

### Ao voltar

1. **Execute o roteiro que está no topo do relatório.**
2. Abra `/itens` e `/relatorios/geral` em produção e compare com os números que o relatório lista — têm de ser os mesmos
   de antes da fase.
3. `git diff v1.64.0 v1.65.0 --stat`: devem aparecer as migrations a partir da `0141`, o `migrations.lock.json`, o
   `database.ts`, `src/lib/queries/**`, `src/lib/supabase/rpc.ts`, as rotas de `src/app/(app)/**`, os roteiros de
   `supabase/tests/`, `scripts/` (smoke, seed, harness, injetor) e `docs/`. **Não** devem aparecer migrations
   `0001`→`0140`, `CLAUDE.md` nem `.github/workflows/`.
4. Abra `docs/perf/f60-*.json` e `docs/f60-evidencias/`: números por função, data e rota; nenhum id em lugar nenhum.
5. Rode você mesmo `npm run test` uma vez.
6. Veio errado de forma ampla? **Regra dos 2 strikes:** depois de duas correções falhas, peça um prompt novo com o
   aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **A F59 está fechada e no ar**: `main` em `4c380ec` com a tag `v1.64.0`, e o deploy de produção `READY` no minuto do
   merge — medido pelo git e pela Vercel em 16/09. O `/api/saude` não abriu desta sessão; o pré-voo confere.
2. **A primeira migration é a `0141`** — as `0137`–`0140` da ficha foram gastas pela F54→F56.
3. **O `drop` é nesta run, depois do deploy e da prova do `pg_stat_statements`** (a ficha e a regra de repouso). Se ele
   for barrado, as funções velhas ficam em produção sem ninguém chamá-las — o comportamento de hoje, sem regressão — e o
   `drop` vira pendência declarada.
4. **"Não-anulável" é vazio provado mais o tipo**: `NOT NULL` não existe em parâmetro de função (fato 7), então NULL e
   `'{}'` devolvem 0 linhas e o TypeScript recusa `null`.
5. **Nenhum número de tela muda**: o consolidado continua somando filial desativada, por lista explícita, e a
   equivalência velho × novo é o portão do merge.
6. **`statement_timeout` só se confere**: a documentação diz que o `service_role` herda os 8 s do `authenticator`;
   `alter role` em produção só com medição que a contrarie.
7. **`pg_trgm`, agregados do PostgREST e configuração da Vercel ficam fora** — a ficha, a regra de R$ 0 e o fato de
   serem mudança de configuração de produção.
8. **O ensaio pode receber o volume fictício do harness**, com limpeza conferida por contagem; produção nunca recebe
   escrita além do apply.
9. **As leituras de produção** (`explain` genérico, `pg_stat_statements`, equivalência, conferidor) **são só leitura** e
   saem só como número, hash e nome de nó — a mesma régua da F58 e da F59.
10. **O comportamento visível fica idêntico no volume de hoje**: o aviso de teto só aparece acima do teto, e
    `/admin/colaboradores` só ganha paginação se a medição pedir.
11. **A camada de relatório pode manter `number | null` por dentro até a F63**, desde que o `null` vire lista explícita
    antes da porta — o prompt deixa a escolha com o agente, por escrito.
12. **`rel_saldo_colaborador` não muda de assinatura**; a trava a decide por escrito (exceção com motivo, ou
    `p_colaborador` como recorte).
13. **As RPCs da Zona destrutiva ficam fora**: o `p_filial null` delas é alcance global de exclusão, com confirmação
    digitada, e é da F67 (`PLAN-F57.md` §6).
