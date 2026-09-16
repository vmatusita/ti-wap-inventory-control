# PLAN-F59 — A doutrina do predicado, escrita e travada

**Fase F59** do `PLANO-MULTIEMPRESA.md` (§5, Bloco D) · branch `f59-doutrina-do-predicado` · versão-alvo **`1.64.0`** ·
**sem migration** · plano medido em 16/09/2026, antes do primeiro commit que toca `src/`, `scripts/` ou `supabase/tests/`.

> A ficha cabe numa frase: *"Escreva a trava; não reescreva as policies."* Esta fase entrega a **régua** do predicado de
> recorte — escrita na emenda F59 da `MATRIZ-REGRAS.md`, travada na mesa por `policies-initplan.test.ts` e no catálogo vivo
> do banco do CI por `catalogo_policies.sql`, com as exceções numa fonte só — e a **medição** das formas do predicado, no
> ensaio e em produção, só leitura. Nenhuma policy, função, grant ou índice muda em banco nenhum.

---

## 1. Estado de partida — remedido

Oito leitores em paralelo (workflow `f59-censo`, relatórios completos no scratchpad da sessão, **só números e nomes de
schema aqui**). Canal SQL: o **MCP da Supabase** (`execute_sql`), presente nesta sessão, com produção
(`pbtjcalbmepmrqzprusb`) e ensaio (`sgmvldiizsrjbxzzpmhh`) `ACTIVE_HEALTHY`, os dois em **PostgreSQL 17.6**. Nenhuma
leitura foi barrada pelo classificador. `SUPABASE_ACCESS_TOKEN` **não** está no ambiente do processo — a Management API não
foi usada, e o token não foi procurado.

| Fato | A ordem diz | Medido | Nota |
|---|---|---|---|
| 1 | `1.63.0`, última migration `0140`, 216 arquivos / 5.856 testes | **igual** — suíte de base 216/5.856 verde (235 s); tag `v1.63.0` no `62c708d` | |
| 2 | 61 policies (53 `public` 22/14/11/6 + 8 `storage` 2/2/2/2); 76/46/16 comandos; 0 DDL dinâmico | **igual nas três fontes** — replay × `pg_policies` do ensaio × de produção, mesmos 61 nomes, mesmos verbos | §2.1 |
| 3 | 13 policies × 7 funções, ~18 ocorrências | **exatamente 18** pares `policy × função` (24 no nível de cláusula), 13 policies, 7 funções | §2.2 |
| 4 | 62 chamadas sem argumento, todas em `(select …)`; 0 sub-select com `FROM` | **igual**; e **0** chamadas só com constantes | habilita a generalização da R2 (§3) |
| 5/6 | `0063:46-57` doutrina; `0129:66-69` e `ADR-002:90` o contrário | **igual**, e o plano medido dá razão à `0063` (§2.4) | |
| 7 | a `0107` mediu no ensaio | **igual** (cabeçalho da `0107`) | |
| 8 | `pode_escrever_filial` plpgsql stable definer | **igual**; as 10 funções de `public` citadas por policy são `stable security definer`, `search_path=public`, `proretset=false`; `auth.uid()` é `stable`, invoker | |
| 9 | R-ACC-62 a maior; R-ACC-32 diz 15 | **igual** — `k_piso_papel` tem 19 | |
| 10–13 | documentos | **igual** — com três achados novos (§2.3) | |
| 14 | MCP roda como `postgres` (bypassrls) e devolve só o último resultado | **igual**; `do $…$` + `raise exception` devolve o payload; `set_config('role','authenticated',true)` e `set_config('transaction_read_only','on',true)` valem dentro do bloco | §7 |
| 15 | refs e `rotulo_de_ambiente()` | **igual** — `'desenvolvimento'` no ensaio, `NULL` em produção | |
| 21 | a forma-alvo `uuid[]` + `array (select …)` quebra no vazio | **igual, no Postgres 17.6 do ensaio** — `2202E cannot accumulate empty arrays`, `22004 cannot accumulate null arrays` | §5 |
| — | a persona operador no ensaio | **0** perfis de cargo `operador`, ativos, com vínculo em `operador_filiais` | a medição do operador fica **PENDENTE** (nada se grava) |
| — | volume | `ativos` 1.606 (ensaio) / 1.620 (produção); `movimentacoes` 3.245 / 3.554 — **a de maior volume**; `lancamentos_item` 35 / 145 | |

### 1.1 Divergências medidas (as dez da ordem, confirmadas, e as novas)

As dez que a ordem declara de saída **se confirmaram todas** (forma-alvo que quebra no vazio; 61, não 54; 13 policies e 7
funções, não uma exceção; o falso içamento de Storage; a `0107` no ensaio; README `:69`; spec 482 linhas e 174 menções;
cabeçalho nos dois documentos; a colisão com a R-ACC-51; a linha de base que envelhece). **Novas, medidas aqui:**

1. `PLANO-MULTIEMPRESA.md:576` cita `docs/README.md:60-64` para "ainda não foi decidida" — o trecho está em `:69`.
2. `ARQUITETURA.md:96` (§9) e `RUNBOOK-BANCO.md:256-262` ainda descrevem o job de CI como `banco` (Docker, `0001→0124`); o
   job é `banco-sem-docker` desde a F48, e o próprio `RUNBOOK-BANCO.md:447` já usa o nome certo.
3. **A ficha da F67 colide com a da F66 e com a doutrina.** A F66 diz *"as policies de escrita passam a consumir
   `unidades_de_escrita()` na mesma forma"*; a F67 diz que `pode_escrever_unidade(p_empresa, p_filial)` entra por
   `create or replace` e *"as dez policies herdam sem serem reescritas"* — isso manteria dez chamadas por linha. E a F67
   prescreve `(storage.foldername(name))[2] = any(array(select …))` nas policies de `backups-import`: `storage.foldername`
   recebe `name` da linha (R1). A doutrina resolve (§3, §6) e o backlog nomeia as duas.
4. **A forma de pares, emulada no `WHERE`, não vira nem `InitPlan` nem `Hash Semi Join`**: o planejador a puxa para uma
   junção comum (`Nested Loop`, `filiais` varrida uma vez). Só fora do alcance de `pull_up_sublinks` (emulado por
   `false or (…)`) ela vira `hashed SubPlan`, `Actual Loops = 1`. Nas duas, avaliada **uma vez** (§2.4, §5).

---

## 2. O censo (Frente A)

### 2.1 As policies vivas — três fontes que têm de concordar

| schema · verbo | replay das migrations | `pg_policies` ensaio | `pg_policies` produção | `pg_policies` CI |
|---|---:|---:|---:|---:|
| `public` SELECT | 22 | 22 | 22 | *1ª rodada do par (Frente D)* |
| `public` INSERT | 14 | 14 | 14 | |
| `public` UPDATE | 11 | 11 | 11 | |
| `public` DELETE | 6 | 6 | 6 | |
| `storage` SELECT/INSERT/UPDATE/DELETE | 2/2/2/2 | 2/2/2/2 | 2/2/2/2 | |
| **total** | **61** | **61** | **61** | |

Conjunto de nomes `schema.tabela / policy`: **61 nas três fontes**, 0 só numa delas, 0 divergência de verbo, 0 divergência
no conjunto de funções citadas por policy. Ensaio × produção: `qual`/`with_check` idênticos, e as árvores `polqual`/
`polwithcheck` idênticas módulo OID. **Nenhuma divergência a classificar** (nem defeito do replay, nem paridade).

O replay: 139 migrations (`0001`→`0140`, gap real na `0029`); comandos de policy fora de comentário **138** (`create` 76 ·
`alter` 46 · `drop` 16), **138 consumidos**; **0** DDL de policy dentro de literal (`execute`/`format`); **0** comando de
policy dentro de corpo `$…$`; **0** comando ilegível; 4 `comment on policy` (`0103` ×2, `0107`, `0125`) — não são DDL de
policy e não entram na conta; `drop table` em 3 migrations, só sobre tabelas de backup que nunca tiveram policy; **nenhum**
`alter table … rename to`. ⚠ Os caminhos de `drop table` e `rename` do replay **não são exercitados por dado real**: só a
guarda sintética os prova.

Dois defeitos do instrumento descartável do censo, corrigidos antes de fechar o número e herdados pela trava como caso de
guarda: (a) `and (select …)` lido como chamada de uma função `and` (10 falsos positivos em Storage); (b) detector de DDL
dinâmico por proximidade textual (`execute function` de trigger e `grant execute` perto de `create policy`: 5 falsos
positivos). A trava julga palavra-chave por **lista**, e DDL dinâmico pelo **conteúdo do literal**.

### 2.2 As ocorrências — o que passa dado da linha para função

18 pares `schema.tabela / policy / função` — **esta é a lista de exceções que nasce** (§6), com a migration da última
alteração da policy:

| # | ocorrência | cláusula(s) | argumento | migration |
|---|---|---|---|---|
| 1 | `public.ativos / operador atualiza / pode_escrever_filial` | using + with check | `filial_id` | 0063 |
| 2 | `public.ativos / operador insere / pode_escrever_filial` | with check | `filial_id` | 0063 |
| 3 | `public.lancamentos_item / operador lanca / pode_escrever_filial` | with check | `filial_id` | 0068 |
| 4 | `public.lancamentos_item / operador lanca / estorno_item_coerente` | with check | `estorna_id, filial_id, item_id` | 0068 |
| 5 | `public.movimentacoes / operador insere / pode_escrever_filial` | with check (×2) | `filial_id` e `(snapshot_anterior ->> 'filial_id')::smallint` | 0067 |
| 6 | `public.pendencias_item / pendencias_item admin reabre / pode_escrever_filial` | using + with check | `filial_id` | 0107 |
| 7 | `public.pendencias_item / pendencias_item operador resolve / pode_escrever_filial` | using + with check | `filial_id` | 0103 |
| 8 | `public.termos_gerados / operador apaga / pode_escrever_termo` | using | `ativo_ids` | 0069 |
| 9 | `public.termos_gerados / operador atualiza / array_length` | with check | `ativo_ids, 1` | 0069 |
| 10 | `public.termos_gerados / operador atualiza / pode_escrever_termo` | using + with check | `ativo_ids` | 0069 |
| 11 | `public.termos_gerados / operador atualiza / termo_ancora_coerente` | with check | `movimentacao_ids, ativo_ids` | 0069 |
| 12 | `public.termos_gerados / operador insere / array_length` | with check | `ativo_ids, 1` | 0069 |
| 13 | `public.termos_gerados / operador insere / pode_escrever_termo` | with check | `ativo_ids` | 0069 |
| 14 | `public.termos_gerados / operador insere / termo_ancora_coerente` | with check | `movimentacao_ids, ativo_ids` | 0069 |
| 15 | `storage.objects / termos apaga operador / pode_escrever_arquivo_termo` | using | `name` | 0072 |
| 16 | `storage.objects / termos atualiza operador / pode_escrever_arquivo_termo` | using + with check | `name` | 0072 |
| 17 | `storage.objects / termos insere operador / pode_escrever_arquivo_termo` | with check | `name` | 0072 |
| 18 | `storage.objects / termos leitura operador / pode_ler_arquivo_termo` | using, **dentro de `(select …)`** | `name` (`objects.name` no catálogo) | 0129 |

Sem argumento: **62** chamadas (`papel_atual`, `e_admin`, `e_dev`, `pode_escrever`, `auth.uid`), **0** fora de
`(select …)`. Só com constantes: **0**. Sub-select com `FROM`/`exists`/`in (select …)`: **0**.

### 2.3 Os documentos que ensinam a forma lenta

| arquivo:linha | o que ensina | classe | ação |
|---|---|---|---|
| `docs/PLANO-PRODUTO-MULTIEMPRESA.md:71` | `e_membro(empresa_id)` | catálogo de requisitos (hoje "Exploração") | **F**: trocar por cópia de `SYSTEM-DESIGN-ACERVO:191-197` + cabeçalho de status |
| `docs/SYSTEM-DESIGN-ACERVO-2026-08-31.md:204-205` | "só 5 das 71 policies usam o padrão içado" | idem | **F**: nota datada com o número de hoje + cabeçalho de status |
| `docs/ADR-002-papeis-e-permissoes.md:90` | "sempre com a função embrulhada em `(select ...)`" | VIVO | **F**: nota de emenda curta |
| `docs/MATRIZ-REGRAS.md:466` (R-ACC-32) | "15 policies de SELECT" | VIVO | **B**: passa a 19, com a linha "desde a F56" |
| `docs/README.md:69` e `:51` | "ainda não foi decidida"; "F0 → F40" | VIVO | **F** |
| `docs/ESPECIFICACAO.md:1-5` | nada sobre empresa | VIVO (autoridade nº 1) | **F**: cabeçalho de escopo da ficha |
| `docs/PLANO-MULTIEMPRESA.md:576` | cita `README.md:60-64` | VIVO | **F**: uma linha (`:67-71`) |
| `docs/ARQUITETURA.md:96` e `docs/RUNBOOK-BANCO.md:256-262` | job `banco` (Docker) | VIVO | **F**: a linha da doutrina + o nome do job |
| `supabase/migrations/0129:66-69` | o falso içamento chamado de "padrão InitPlan" | REGISTRO (lock F46) | **B**: a emenda o cita; não se edita |
| `supabase/migrations/0063:46-57` | a doutrina certa | REGISTRO | **B**: a emenda o cita como fonte |
| `CLAUDE.md` | nenhum achado da doutrina | — | só o relatório aponta que ele não precisa mudar |

Ordens de serviço antigas, atas e relatórios que citam `pode_escrever_filial(filial_id)` descrevem o banco da época e são
REGISTRO; a emenda os nomeia em bloco, sem editar.

### 2.4 A pergunta de planejador — medida no ensaio (PostgreSQL 17.6)

Como `postgres` (mede a FORMA do plano; a RLS entra na medição da Frente E):

| consulta | forma | nó | loops da sub-consulta | custo total |
|---|---|---|---:|---:|
| `ativos … where public.pode_escrever_filial(filial_id)` | por linha | `Filter: pode_escrever_filial(filial_id)` | — | 439,35 |
| `ativos … where (select public.pode_escrever_filial(filial_id))` | falso içamento | `Filter: (SubPlan 1)` | **1.606** | 456,04 |
| `ativos … where filial_id = any (array (select f.id from public.filiais f where public.pode_escrever_filial(f.id)))` | içada | `InitPlan 1` + `Index Cond: filial_id = ANY ((InitPlan 1).col1)` | **1** | 40,80 |
| `… = any (array (select public.papel_atual()::text))` | sem argumento, definer real | `InitPlan 1` + `One-Time Filter` | **1** | 34,09 |
| `movimentacoes`, as três formas | idem | idem | — / **3.245** / **1** | 881,12 / 914,87 / 75,02 |
| pares, no `WHERE` | `(a, b) in (select …)` | `Nested Loop` (puxada para junção) | 1 varredura | 27,57 |
| pares, fora de `pull_up_sublinks` | `false or (a, b) in (select …)` | `hashed SubPlan 1` | **1** | 49,83 |

**Resposta:** sim — `(select fn(coluna))` é `SubPlan` correlacionado com `Actual Loops` = linhas varridas (a `0063` está
certa; a `0129:66-69` e o `ADR-002:90`, errados para essa forma); e `col = any (array (select fn()))` é `InitPlan` com um
loop. O que decide é a **correlação**, não o embrulho.

---

## 3. As regras — as formas que reprovam e as que passam

**Dado da linha** = qualquer referência a coluna da tabela da policy: nua (`filial_id`), qualificada (`objects.name`,
`t.col` — qualificador que não é alias declarado num sub-select reprova por falha fechada), expressão sobre coluna
(`(snapshot_anterior ->> 'filial_id')::smallint`), ou dentro de `(select …)` sem `FROM` que a declare.

**Função** = toda chamada `nome(…)` que não esteja na lista NOMINAL de construções: `coalesce`, `nullif`, `greatest`,
`least`, `cast`/`::tipo`, `row`, `array` (construtor e sub-consulta), `case`, `exists`/`in`/`any`/`some`/`all`, `not`,
`current_date`/`current_time`/`current_timestamp`/`localtime`/`localtimestamp`. Built-in é função (`array_length`,
`unnest`, `storage.foldername`). `current_user`/`session_user`/`current_role`/`user`/`current_schema`/`current_catalog`/
`system_user` são **funções sem argumento** (o Postgres 16+ as guarda como `FuncExpr`). Nome desconhecido é função.
Operador (`=`, `->>`, `@>`) não é chamada.

| regra | reprova | passa |
|---|---|---|
| **R1** — função não recebe dado da linha, salvo ocorrência declarada | `public.e_membro(empresa_id)` · `(select public.e_membro(empresa_id))` · `public.f((t.col ->> 'x')::smallint)` · `array_length(ativo_ids, 1)` · `unnest(ativo_ids)` num `FROM` · `with check` de INSERT com `fn(col)` | `empresa_id = any (array (select public.empresas_do_membro()))` · `id = (select auth.uid())` · `bucket_id = 'termos'` |
| **R2** — função que **não** recebe dado da linha (sem argumento, só constantes) só dentro de `(select …)` | `public.e_admin()` solto · `empresa_id = any (public.empresas_do_membro())` · `public.tem_papel('admin')` solto | `(select public.e_admin())` · `(select public.papel_atual()) is not null` · `col = any (array (select public.fn()))` |
| **R3** — sub-select não lê tabela/view nem referencia a linha fora de argumento de função, salvo exceção declarada | `exists (select 1 from public.membros m where …)` (lê tabela, mesmo sem olhar a linha) · `exists (select 1 from public.fn() u where u.id = tabela.col)` (correlacionado) · `(select tabela.col)` | `array (select public.fn())` · `(empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u)` |
| **R-setof** (só no catálogo) — função consumida como alvo de `array (select …)` devolve conjunto (`proretset`) | `id = any (array (select auth.uid()))` — hoje inofensivo; com `→ uuid[]`, é o erro de execução do fato 21 | `array (select public.empresas_do_membro())` com `returns setof uuid` |

**Atribuição única.** Uma referência à linha dentro de sub-select, sob uma função **do mesmo sub-select**, é R1 (é o falso
içamento: `(select fn(col))`); sem função entre ela e o sub-select, é R3. Toda função ancestral da referência — dentro ou
fora do sub-select — conta uma ocorrência R1.

**A generalização da R2** (Decisão 3): a ficha fala em "função sem argumento". Função com argumentos só constantes, solta,
também é avaliada por linha, e o censo mediu **zero** delas — a regra mais forte nasce verde e fecha a porta que a mais
fraca deixaria aberta (`public.tem_papel('admin')`).

---

## 4. A trava de mesa — `src/lib/validators/policies-initplan.test.ts`

**O analisador mora em módulo próprio:** `scripts/db/predicado-policies.mjs` (JS puro, sem banco, no molde de
`corpo-vigente.mjs`, reusando `listarMigrations`/`fimDoComando`), com testes de unidade em
`scripts/db/predicado-policies.test.mts`. Precedente de `src/**/*.test.ts` importando `scripts/db/*.mjs`:
`patrimonio-sql.test.ts`, `rpc-retorno-sql.test.ts`, `vocabulario-chave-sql.test.ts`.

- **Léxico** próprio: comentários (`--`, bloco), literais `'…'`/`E'…'`, identificadores `"…"`, `$tag$…$tag$`, números,
  operadores, pontuação — com a linha de cada token.
- **Replay**, na ordem do texto (a lição da `0091`): `create policy`, `alter policy` (`using`, `with check`, `rename to`,
  `to`), `drop policy [if exists]`, `drop table [if exists] …` (várias tabelas), `alter table [if exists] … rename to`.
  Chave `schema.tabela / policy`, schema implícito `public`, aspas normalizadas.
- **Falha fechada:** (a) literal de string ou corpo `$…$` cujo conteúdo case `\b(create|alter|drop)\s+policy\b` reprova com
  arquivo:linha (o `execute format('alter policy %I …')` da F66); (b) comando de policy que o parser não lê reprova;
  (c) **auto-conferência**: ocorrências de `(create|alter|drop) policy` nos tokens que não são comentário == comandos
  consumidos + falhas (a); diferença reprova.
- **Análise** de cada `using`/`with check` vivo por árvore de parênteses: chamada × construção × grupo × sub-select; aliases
  declarados no `FROM` de cada sub-select; profundidade; as três regras do §3.
- **A lista de exceções** é lida de `supabase/tests/catalogo_policies.sql` como TEXTO (Decisão 2 da F48), por uma função do
  próprio módulo (`lerExcecoesDoCatalogo`), que exige, **na linha da entrada**, migration (4 dígitos), `motivo:` e
  `destino:` (`F<n>` ou `permanente`).
- **O universo** é conferido contra `k_policies_public` (53) ∪ `k_storage` (8) do mesmo `.sql`, nos dois sentidos — é o
  mesmo conjunto que o catálogo do CI confere (§5.2), e é isso que prova que a mesa e o banco julgam o mesmo universo.
- **Leitura na COLETA** (lição da F57): migrations e `.sql` lidos uma vez, no topo do módulo de teste.
- **Mensagem de falha:** `schema.tabela / policy · VERBO · função(argumento) · regra R1|R2|R3 · emenda F59 da
  MATRIZ-REGRAS (R-ACC-63…)`.
- **A guarda do próprio teste** (SQL sintético em memória, nunca arquivo em `supabase/migrations/`): reprovam
  `using (public.e_membro(empresa_id))`, `using ((select public.e_membro(empresa_id)))`,
  `using (public.f((t.col ->> 'x')::smallint))`, `using (public.e_admin())`,
  `using (empresa_id = any (public.empresas_do_membro()))`, `exists` correlacionado, `with check` de INSERT com `fn(col)`,
  `exists (select 1 from public.membros m where …)` sem olhar a linha, e `execute format('alter policy %I …')`; passam
  `using (empresa_id = any (array (select public.empresas_do_membro())))`, a forma de pares do §5,
  `using ((select public.papel_atual()) is not null)`, `using (id = (select auth.uid()))` e `using (bucket_id = 'termos')`.
  Mais: `and (select …)` **não** é chamada de `and`; `grant execute` perto de `create policy` **não** é DDL dinâmico;
  `comment on policy` não conta; `drop table` derruba; `rename` move; drop e create do mesmo nome no mesmo arquivo segue a
  ordem do texto.

---

## 5. O par no catálogo do CI — `supabase/tests/catalogo_policies.sql`

### 5.1 O instrumento: a árvore, não o texto (Decisão 4)

`pg_policies.qual` é texto normalizado: diz `objects.name`, mas não diz se `name` é da linha ou de um `FROM` interno, nem se
`foo(x)` devolve conjunto. `pg_policy.polqual`/`polwithcheck` (`pg_node_tree`) dizem: `{VAR :varno 1 :varlevelsup N}` é a
linha quando `varlevelsup` = profundidade de `QUERY`; `{FUNCEXPR :funcid … :funcretset … :funcformat …}` é chamada
(`funcformat` 1/2 = cast, construção); `{RANGETBLENTRY :rtekind 0 …}` é relação lida; `{SUBLINK :subLinkType 6}` é
`ARRAY(…)`. Um laço `plpgsql` **dentro do `do $$` existente** tokeniza a árvore com uma pilha — sem função nova, sem
`pg_temp` novo. **Tipo de nó fora da lista conhecida reprova** (falha fechada).

### 5.2 Os arrays novos e as asserções (rótulos novos, uma linha `FIM` só)

- `k_policies_public text[]` — as 53 `tabela / policy` de `public`, congeladas; `storage` segue em `k_storage`.
- `k_excecoes_predicado text[]` — as 18 ocorrências do §2.2, **uma por linha**, com `-- NNNN · motivo: … · destino: …`
  **ao lado**. É A fonte: a mesa a lê, o catálogo a confere.

| rótulo | o que reprova |
|---|---|
| `10a` | policy viva de `public` fora de `k_policies_public` |
| `10b` | nome de `k_policies_public` sem policy viva |
| `10c` | árvore de policy com tipo de nó que o analisador não conhece |
| `11a` | **R1** — função recebe dado da linha e a ocorrência não está em `k_excecoes_predicado` |
| `11b` | **catraca** — entrada de `k_excecoes_predicado` sem ocorrência viva |
| `12` | **R2** — função sem dado da linha fora de `(select …)` |
| `13a` | **R3** — sub-select lê tabela ou view |
| `13b` | **R3** — sub-select referencia a linha fora de argumento de função |
| `14` | **R-setof** — alvo de `array (select …)` que não devolve conjunto |

Nenhuma regra fica só na mesa: as três têm detecção confiável pela árvore. O que fica **só no catálogo** é a R-setof (texto
não sabe `proretset`); o que fica **só na mesa** é a falha fechada de DDL dinâmico (o catálogo vê o resultado do DDL, não o
texto que o gerou).

### 5.3 O injetor (`scripts/db/mutacoes.mjs`, bloco `F59_DOUTRINA`)

Uma mutação por rótulo, cada uma com `prova` e `policies`: `10a`+`10b` (policy de `filiais` renomeada); `10c` (um nó fora da
lista); `11a` (SELECT de `ativos` ganha `and public.pode_escrever_filial(filial_id)`); `11b` (`ativos / operador insere` perde
a função); `12` (`filiais / admin apaga` perde o `(select …)`); `13a` (`exists` sobre `operador_filiais`); `13b` (sub-select
correlacionado); `14` (`id = any (array (select auth.uid()))`). O teto do lote ativo sobe com a conta escrita.
`catalogos-seguranca.test.ts` passa a cobrar os dois arrays novos (`SIMETRIAS`) e o formato das entradas de exceção.

### 5.4 Calibrar antes do push

O mesmo laço, num `do $$` que termina em `raise exception` com o resultado (sem `pg_temp`, sem DDL), roda no ensaio e em
produção pelo MCP, e o resultado tem de bater com o replay: 61 árvores de policy lidas, 18 ocorrências R1 = as 18 do §2.2, 0
R2, 0 R3, 0 R-setof, 0 nó desconhecido. Só então o push; PR em rascunho no primeiro push.

---

## 6. A lista única de exceções — destino de cada ocorrência

| ocorrências (§2.2) | destino | motivo, em uma linha |
|---|---|---|
| 1, 2, 3, 5, 6, 7 — `pode_escrever_filial` | **F66** | a escrita do operador é por filial da própria linha; a F66 troca por `(empresa_id, filial_id) in (select … from public.unidades_de_escrita() u)` (ficha F66: *"as policies de escrita passam a consumir `unidades_de_escrita()` na mesma forma"*) |
| 4 — `estorno_item_coerente` | **permanente** | coerência do próprio registro (o estorno aponta lançamento da mesma filial e item); decide sobre o objeto, não recorta |
| 8, 10, 13 — `pode_escrever_termo` | **permanente** | o termo decide pelos seus `ativo_ids`; é o objeto, não o recorte |
| 11, 14 — `termo_ancora_coerente` | **permanente** | coerência das âncoras do próprio termo |
| 9, 12 — `array_length` | **permanente** | built-in imutável sobre o próprio array (termo não vazio); custo desprezível |
| 15, 16, 17 — `pode_escrever_arquivo_termo` | **permanente** | o arquivo decide pelo próprio `name` (o caminho aponta o termo); revista na F67 sem mudar a natureza |
| 18 — `pode_ler_arquivo_termo` | **F67** | o falso içamento: o `(select …)` não iça nada; a F67 reescreve as policies de Storage (o join com `termos_gerados`) e decide a forma |

**Catraca:** ocorrência sem entrada reprova (`11a` + mesa); entrada sem ocorrência reprova (`11b` + mesa). Quem conserta a
policy tira a linha; quem acrescenta uma linha precisa de ata. A lista **não** é a da R-ACC-57 (`definer_sem_tenant.sql`):
aquela responde "a `security definer` confere escopo no corpo?"; esta, "a policy passa a linha para uma função?" —
`array_length` nem é definer. Fatos diferentes, listas diferentes (Decisão 2 da F48); cada cabeçalho cita o outro.

---

## 7. A medição — `scripts/perf/medir-rls.mjs` (Frente E)

- **Formas**, emuladas inline, sobre a leitura com a RLS de hoje: **F0** sem filtro extra; **F1**
  `where public.pode_escrever_filial(filial_id)`; **F2** `where (select public.pode_escrever_filial(filial_id))`; **F3**
  `where filial_id = any (array (select f.id from public.filiais f where public.pode_escrever_filial(f.id)))`.
- **Tabelas e projeção:** `public.ativos` com as colunas de `LEITURA_LISTA_ATIVOS` (sem o embed de `filiais`) e
  `public.movimentacoes` (maior volume) com `LISTA_COLS` de `LEITURA_LISTA_MOVIMENTACOES`. **Sem `limit`**: o custo por linha
  escala com as linhas examinadas, e a lista paginada ordena antes de cortar.
- **Método da `0107`:** `explain (analyze, buffers, verbose, format json)`; 1 aquecimento por forma; **N = 9** repetições
  intercaladas (F0,F1,F2,F3,F0,…); mediana e p95 (posto mais próximo) de execução e planejamento; custo total estimado,
  buffers do nó raiz, linhas devolvidas e os nós que provam a doutrina (`Filter` com a função no nó varrido, `SubPlan`,
  `InitPlan`).
- **RLS no plano:** identidade escolhida **dentro do banco** (`profiles` ativo, não arquivado, cargo `admin`/`dev`; e
  `operador` com vínculo — **0 no ensaio**, PENDENTE); `request.jwt.claims` e `role = authenticated` locais à transação;
  **controle negativo** (claims sem `sub` → 0 linhas); **o piso aparece no plano** (`papel_atual` no `Output` do `InitPlan`
  do nó raiz); linhas devolvidas = contagem esperada calculada como `postgres` com as mesmas claims.
- **Só leitura, falha fechada:** um `do $f59$ … $f59$` por (tabela × identidade), gerado de modelo fechado; dentro,
  `transaction_read_only = on` antes de tudo, e o bloco **sempre** termina em `raise exception` — nada se confirma. Antes de
  gravar ou enviar, o script recusa comando que contenha `insert|update|delete|merge|truncate|create|alter|drop|grant|
  revoke|copy|call|vacuum|refresh|reindex|cluster|lock|comment|listen|notify|commit` como palavra, `set_config` fora de
  `role`/`request.jwt.claims`/`transaction_read_only`, ou que não comece e termine no delimitador.
- **Alvo:** `--alvo ensaio|producao` obrigatório; `--ref` tem de ser o ref daquele alvo (lidos de `scripts/env-guard.ts`,
  como `conferir.mts`); o bloco confere `rotulo_de_ambiente()` (`'desenvolvimento'` × `NULL`) **antes** da primeira
  medição e aborta com `F59_ALVO_RECUSADO`.
- **Canal:** (1) MCP — o script grava os comandos num diretório **fora do repositório**, eu os executo por `execute_sql` e
  gravo as respostas lá; o script as analisa; (2) Management API, só se `SUPABASE_ACCESS_TOKEN` já estiver no ambiente
  (não está). O modo só leitura da Management API (`…/database/query/read-only`) roda como `supabase_read_only_user`, que
  não troca para `authenticated` — por isso não serve; o MCP desta sessão não está em `read_only`.
- **Prova da forma-alvo** (`--prova forma-alvo`): num bloco do mesmo modelo, como `authenticated`: `setof` + `array
  (select …)` com conjunto cheio, vazio, NULL e elemento NULL (0 linhas, sem erro, `InitPlan`); `uuid[]` + `array
  (select …)` (o erro do fato 21, capturado); `uuid[]` + `= any ((select …)::uuid[])` (compila); pares no `WHERE`
  (junção) e fora de `pull_up_sublinks` (`hashed SubPlan`), cheio e vazio.
- **Saída:** `docs/perf/f59-rls-ensaio.json`, `docs/perf/f59-rls-producao.json`, `docs/f59-evidencias/B-forma-alvo-ensaio.json`
  — só números, nomes de nó, nomes de tabela, rótulos de forma. Nenhum id, e-mail ou nome.
- **TTFB:** `node scripts/perf/medir.mjs` contra produção antes do merge, `1.63.0` no ar → `docs/perf/f59-producao-ttfb.json`.

A tabela da medição entra aqui depois das rodadas (§12).

---

## 8. Os documentos (Frente F)

`PLANO-PRODUTO-MULTIEMPRESA.md:71` por **cópia** de `SYSTEM-DESIGN-ACERVO:191-197`; cabeçalho de status nos **dois**; nota
datada nas "5 das 71"; `ESPECIFICACAO.md` só com o cabeçalho de escopo da ficha; `README.md` (a seção "Exploração" sem "ainda
não foi decidida", os dois documentos como catálogo de requisitos, o índice com a doutrina, a trava, o par e o
`medir-rls.mjs`, a `:51`); `ADR-002:90` com nota de emenda; `ARQUITETURA.md` §9/§10 e `RUNBOOK-BANCO.md` (roteiros) com uma
linha; `PLANO-MULTIEMPRESA.md:576` com a linha certa.

---

## 9. As oito decisões

1. **O analisador.** Dado da linha = coluna da tabela da policy em qualquer forma, com qualificador desconhecido tratado como
   linha; funções = toda chamada fora da lista nominal de construções, built-in incluída, nome desconhecido incluído;
   universo = `public` + `storage.objects`, todo verbo, `using` e `with check`; falha fechada em DDL dinâmico, comando
   ilegível e auto-conferência. *Custo que decidiu:* a lista nominal de construções dá falso positivo em sintaxe exótica
   (`extract(epoch from …)`) — preferível a um falso negativo; e o léxico próprio evita os dois defeitos que o instrumento
   do censo teve.
2. **As exceções.** Por ocorrência `schema.tabela / policy / função` (R3: `… / sub-select`), no `.sql`, motivo e destino
   na linha da entrada, catraca nos dois sentidos nas duas travas. *Custo:* por nome de função seria uma linha só para
   `pode_escrever_filial` — e deixaria a F66 escrevê-la numa policy nova sem ninguém decidir.
3. **Embrulho e sub-select.** R2 generalizada a "função sem dado da linha"; R3 reprova sub-select que lê relação mesmo sem
   olhar a linha (a leitura mora dentro da função de conjunto); atribuição única R1 × R3. *Custo:* nasce verde (0 casos), e
   fecha `tem_papel('admin')` solto.
4. **O par no catálogo.** `pg_policy` com a árvore, laço `plpgsql` no bloco existente, nove rótulos (`10a`–`14`), universo
   congelado em `k_policies_public` e provado igual ao da mesa por asserção nos dois lados, uma mutação por rótulo.
   *Custo:* congelar 53 nomes obriga toda fase que cria policy a tocar o `.sql` — é o mesmo contrato que `k_storage` já
   impõe, e é o único jeito de a mesa e o banco provarem o mesmo universo por asserção, não por evidência de um dia.
5. **A forma-alvo.** `setof uuid` consumida por `array (select …)` — não `uuid[]` (erro no vazio e no NULL, fato 21);
   `unidades_de_escrita() returns table (empresa_id uuid, filial_id smallint)` consumida por `(empresa_id, filial_id) in
   (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u)`, com `empresa_id = any (array (select
   public.empresas_de_escrita()))` em conjunção onde houver índice. Especificação inteira na emenda. *Custo:* `uuid[]` com
   `= any ((select fn())::uuid[])` também funciona, mas cria uma segunda forma canônica, e a doutrina tem de ser uma frase só.
6. **A medição.** MCP, `do` + `raise exception`, `transaction_read_only`, `authenticated` com claims, identidade escolhida no
   banco, F0–F3, `ativos` + `movimentacoes`, N = 9 + aquecimento, mediana/p95, recusa antes de emitir. *Custo:* o MCP obriga
   a transcrever a resposta para um arquivo fora do repositório; em troca, nenhum token é tocado.
7. **Os documentos.** Corrige-se o que é vivo ou catálogo de requisitos; aponta-se o que é registro; `CLAUDE.md` intocado.
8. **A linha de base da F66.** A F66 herda o **instrumento** (`medir-rls.mjs` + `medir.mjs`), não o número: a F60 muda o
   caminho quente dos relatórios e a F62 muda o que `papel_atual()` lê — a F66 re-roda os dois imediatamente antes de mexer
   nas policies e compara com essa rodada. Os números desta fase são a prova da doutrina e o ponto de partida.

---

## 10. Ordem dos commits

1. `docs(f59)`: este plano (antes de qualquer `src/`, `scripts/`, `supabase/tests/`).
2. `feat(f59)`: `scripts/db/predicado-policies.mjs` + testes de unidade.
3. `test(f59)`: `catalogo_policies.sql` (arrays e asserções, calibradas) + `catalogos-seguranca.test.ts`.
4. `test(f59)`: `policies-initplan.test.ts`.
5. `test(f59)`: mutações.
6. `docs(f59)`: a emenda F59 da matriz.
7. `perf(f59)`: `medir-rls.mjs` + evidências do ensaio.
8. `docs(f59)`: documentos (Frente F).
9. `chore(f59)`: versão `1.64.0`.
10. correções da revisão adversarial → **SHA de código congelado** → rodadas de produção → ata e relatório.

## 11. Reversão

Não há banco para desfazer. `git revert` dos commits da fase, **de trás para a frente** (relatório/ata → versão → documentos
→ medição → emenda → mutações → trava de mesa → catálogo → módulo → plano), e redeploy. Reverter só a trava deixa a emenda
sem prova; reverter só o catálogo deixa a mesa lendo uma lista que não existe (vermelho alto, não silencioso).

## 12. SHA de código congelado e a medição

*(preenchido no fechamento)*
