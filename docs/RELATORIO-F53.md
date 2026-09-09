# RELATÓRIO F53 — A ordem total das movimentações

**09/09/2026 · v1.58.0 · branch `f53-ordem-das-movimentacoes` · PR [#36](https://github.com/vmatusita/ti-wap-inventory-control/pull/36)**

Três lugares do sistema respondiam **"qual é a última movimentação deste ativo?"** e os três
terminavam o desempate em `movimentacoes.id` — um `gen_random_uuid()` (`0003:71`) que nunca
nasceu para ordenar. Quando duas movimentações do mesmo ativo compartilham `(data, created_at)`,
quem decidia era um **sorteio**. Esta fase troca o sorteio por uma sequência, **sem mudar um
único número histórico** — e isso é comparação, não afirmação.

---

## 1. O que mudou, por arquivo

| Arquivo | O que mudou | Por quê |
|---|---|---|
| `supabase/migrations/0133_ordem_das_movimentacoes.sql` | **novo** — `movimentacoes.ordem` (`bigint`, `not null`, `generated always as identity`, `movimentacoes_ordem_uidx`), backfill pelo ranking da quádrupla dentro da janela `estoque.dev_destrutivo` | o cursor: congela num inteiro a ordem que `rel_estoque_asof` já usava |
| `supabase/migrations/0134_desempate_por_ordem.sql` | **novo, GERADO** — o desempate passa a `ordem` em `rel_estoque_asof`, na trava do estorno de `aplicar_movimentacao` e em `v_conflitos_filiais` | matar as três réguas que terminavam no uuid |
| `supabase/migrations/0135_indice_data_ordem.sql` | **novo** — `movimentacoes_data_ordem_idx (data desc, ordem desc)` | a régua nova regrediu o plano da lista para `Incremental Sort` (medido) |
| `scripts/db/gerar-0134.mjs` | **novo** — deriva a `0134` do corpo vigente com `trocarNoCorpo`, com **teto** na `0134` | o diff tem de ser provável, e **reprovável**, hoje e daqui a um ano |
| `src/lib/queries/movimentacoes.ts` | as **cinco** leituras passam à régua nova; 3 comentários corrigidos | `:91` afirmava que "cada mov é uma transação" — as `0117`/`0123` derrubaram isso |
| `supabase/tests/asof_desempate.sql` | **4 → 18** asserções | 3 delas nasceram das SABOTAGENS, não do plano |
| `scripts/db/mutacoes.mjs` · `.test.mts` | **55 → 58** ativas (+1 em quarentena); teto **56 → 59** | uma trava nova por mutação |
| `src/lib/itens/migrations-f38.test.ts` | `0133`/`0134`/`0135` na cobertura + `RECRIACOES_AUTORIZADAS` | a `0134` recria uma **intocável** de propósito |
| `src/lib/types/database.ts` | `ordem` transplantada à mão | regenerar apagaria as entradas da F51/F52 |
| `CHANGELOG.md` · `registry.ts` · `package.json` · `MATRIZ-REGRAS.md` · `DECISOES.md` | v1.58.0, R-MOV-37→39, R-REL-32/33, **11 atas** | regra 8 |

---

## 2. Os números MEDIDOS × o que a ficha previa

| O que | **Medido** | A ficha/ordem dizia | Veredito |
|---|---|---|---|
| As migrations | **`0133`, `0134`, `0135`** | `0132`/`0133` | a ordem já tinha corrigido para 0133/0134; a **0135** é acréscimo medido |
| Linhas de `movimentacoes` (prod) | **3497** (1620 ativos) | — | — |
| Span do acervo | **2024-01-08 → 2026-09-08** | "os 13 meses" | **20 meses** |
| Linhas com `data` retroativa | **2227 / 3497 = 63,7%**, atraso máx. **935 dias** | não medido | retroatividade é **rotina** |
| Índices de `movimentacoes` | **11** antes, **13** depois | "os NOVE índices" | **11**, não 9 |
| Fila pendente de apply | **`0131` e `0132`** | "a fila `0129`→`0132`" | **duas**, não quatro |
| Ensaio | **VIVO**, fingerprint idêntico ao de prod nas 4 funções da fase | "esteve INACTIVE nas F36/F37/F50" | ensaio-primeiro **foi possível** |
| `status_apos_movimentacao` | não ordena nada; corpo vigente **0109** | "0047:19" | não tocada; a linha diverge |
| `estornar_movimentacao_com_itens` | ordena só o payload; corpo vigente **0122** | "0122" | confere |
| `v_conflitos_filiais.ultima_mov_tipo` | **`0096:76-80`** | "0092:170-174" | a linha diverge |
| Pares compra+ajuste empatados | **1270**; **1448** ativos com empate de `created_at`; **2540** linhas em empate | — | o empate é rotina |
| Asserções (todos os roteiros) | **633 → 648** | — | `asof_desempate`: **4 → 18** |
| Mutações | **55 → 58** ativas, **2 → 3** em quarentena, teto **56 → 59** | — | — |
| `movimentacoes` em publication | **sim** (`supabase_realtime`), **zero** replication slots | não medido | UPDATE emite WAL, ninguém consome |
| `trg_aplicar_movimentacao` | **BEFORE INSERT apenas** | — | o backfill **não** re-executa a máquina de estados |

### A medição que decidiu a fase

As três réguas candidatas para "qual é a última movimentação", ativo a ativo, sobre os **1620
ativos** de produção (`docs/f53-evidencias/estornaveis-antes-x-depois-prod.json`):

| Régua | Difere de hoje | Dessas, **com** empate | **sem** empate |
|---|---|---|---|
| `(created_at, id)` = hoje | — | — | — |
| **`(created_at, ordem)`** (adotada) | **643** | **643** | **0** |
| `ordem` pura | 653 | 643 | **10** |

E nos 643 que mudam: a régua nova aponta o **`ajuste`** em **643 de 643**; a de hoje apontava o
`ajuste` em **0 de 643**. É a assinatura exata do cara-ou-coroa que a `0054` descreveu — dos 1270
pares, o uuid acertou ~627 e errou 643.

---

## 3. As dez decisões, e o custo que decidiu cada uma

Todas em `docs/DECISOES.md` (11 atas com data · contexto · escolha · motivo). Em resumo:

1. **`generated always as identity`** — medido: as 3 colunas identity da casa são todas `always`;
   zero `nextval`. **Custo herdado pela F54:** restauração precisa de `overriding system value`.
2. **`setval(seq, max(ordem))`**, sem `+1` — a ficha dizia "para `max+1`", o que deixaria um
   buraco de um: `setval(seq,N)` faz o próximo `nextval` devolver **N+1**. Prod: `max=3497`,
   próximo **3498**. Ensaio: `3239` → **3240**.
3. **Duas réguas, uma por PERGUNTA** — `data desc, ordem desc` para o as-of e a lista;
   `created_at desc, ordem desc` para a linha do tempo e a trava. Custo que decidiu: **63,7%**
   de retroatividade. `(tipo='ajuste')` sai porque `ordem` já o reproduz.
4. **A trava vira `(created_at, ordem)`** — `ordem` pura mudaria 10 ativos **sem empate**, onde
   ela apontaria uma linha que não é a última gravada, com `snapshot_anterior` velho.
5. **Linha do tempo e trava passam a usar a MESMA régua** — hoje **não usavam**, e divergiam nos
   **178** pares com mesmo `created_at` e `data` diferente. `linha-do-tempo.tsx:90` decide o botão
   **Estornar** por `movimentacoes[0]`: a tela podia oferecer um botão que o banco recusava.
6. **As três "qual foi a última"** ganham `ordem` como 2ª chave e mantêm `created_at` como 1ª.
   A `:200` é a de maior risco: filtra só por `criado_por`, então **todo lote** empata e o
   "Repetir última" copiava de um ativo **sorteado**.
7. **`v_conflitos_filiais` entra** — era a **única** régua da base **sem desempate nenhum**, com
   1448 ativos em empate esperando por ela.
8. **O índice sai de medição** — a lista regrediu (Index Scan → Incremental Sort); a **linha do
   tempo não regrediu** (já pagava `Sort`), e por isso **não** ganhou índice.
9. **Convenção do roteiro** — `v_ok`/`v_falhas` para cenário; `assert_zero_de` só na equivalência
   total, a única com universo que poderia estar vazio.
10. **A trava (e) é derivada do catálogo**, com **três** exceções nominais — e a terceira
    (`apagar_movimentacao`) tornou **desnecessária** a `0135` que a ordem previa para ela.

---

## 4. As provas

### 4.1 Nenhum número histórico mudou

| Prova | Resultado |
|---|---|
| `rel_estoque_asof` em **12 datas × 7 recortes = 84 combinações**, por **hash do conjunto ordenado**, antes × depois, em **ensaio e produção** | **0 divergências** nos dois (`asof-12datas-*.json`) |
| `md5` da ordem por `ordem` × `md5` da ordem pela quádrupla, 3497 linhas | **idênticos** — `fe8138445f2b257aaeee27ad49dadf36` |
| `md5` do par `(id, data, created_at, tipo)` de **todas** as linhas, antes × depois | **idêntico** — `c755546f01a8982fa3ca99fc5b135a10` |
| `count(*)` antes × depois | **3497 = 3497**; `count(ordem)` = 3497; faixa densa `1..3497` |
| Vencedor por ativo sob ranking **global** (sem `partition by`) × por ativo | **0 divergências** em 1620 ativos (confirmado independentemente na revisão) |

A **`0134` foi ensaiada em `begin; … rollback;` contra PRODUÇÃO** antes do apply — com os 1270
empates presentes — e as 84 combinações já saíram idênticas ali.

### 4.2 A janela

- **Antes:** `update … set observacao = observacao` → `42501` ✓
- **Dentro:** o mesmo UPDATE dentro de `set_config('estoque.dev_destrutivo','on',true)` → **passa** ✓
- **Depois da migration, contra produção:** → `42501` de novo ✓ (reconfirmado na revisão adversarial)
- A janela vive num bloco `do $$` **atômico**, e o ramo `exception when others` a **fecha** antes
  de re-levantar.

⚠ **Medido e não óbvio:** `update … set ordem = ordem` **não** serve para provar a guarda — a
identidade `generated always` recusa antes, com `428C9`. A asserção `5a` usa uma coluna comum.

### 4.3 As quatro sabotagens (controle: **18 ok / 0 falhas**)

| Sabotagem | Resultado | Rótulos derrubados |
|---|---|---|
| **A** — backfill sem `(tipo='ajuste')` | **2429 de 3497 linhas** divergem (produção) | a equivalência `3b` |
| **B** — `rel_estoque_asof` volta a `id desc` | 15 ok / **3 falhas** | `1`, `3a`, `10a` |
| **C** — trava volta a `(created_at, id)` | 15 ok / **3 falhas** | `4c`, `4d`, `10a` |
| **D** — dropar `movimentacoes_ordem_uidx` | 17 ok / **1 falha** | `7b` |
| *(extra)* `ordem desc` **puro** no as-of | 17 ok / **1 falha** | **`6a`, e só ele** |

**Duas delas acharam o roteiro cego, e é o achado mais útil da fase:**

- **Sabotagem A ficou VERDE no ensaio.** O ensaio tem **zero** linhas em empate compra × ajuste —
  ele nunca recebeu um import de startup com `dataEntrada = dataAjuste`. Consequência declarada:
  **o ensaio é rehearsal de MECÂNICA, não de SEMÂNTICA.**
- **Sabotagem C deixava `4a`/`4b` verdes.** Eles montam `created_at` **distintos**, e aí as duas
  réguas concordam **sempre**: `4a` prova que a trava funciona, não **qual régua** ela usa.
  Nasceram `4c`/`4d`, que montam o empate do import — o único arranjo que discrimina.
- **Sabotagem D deixava o roteiro INTEIRO verde.** Nasceu `7b`, que prova o índice pelo **efeito**
  (`overriding system value` + `unique_violation`), não por inspeção de catálogo.

### 4.4 O diff da `0134` — só o desempate

Reproduzível a qualquer momento com `node scripts/db/gerar-0134.mjs`:

| Objeto | Corpo vigente | Removidas | Acrescentadas |
|---|---|---|---|
| `rel_estoque_asof` | `0110` | **3** | **1** |
| `aplicar_movimentacao` | `0110` | **1** | **1** |
| `v_conflitos_filiais` | `0096` | **1** | **1** |

E o corpo VIVO em produção bate com o arquivo (`pg_get_functiondef` / `pg_get_viewdef`), **sem drift**.

### 4.5 Planos e índices

| Consulta | Antes | Depois da `0134` | Depois da `0135` |
|---|---|---|---|
| **lista** (`limit 30`) | Index Scan puro · 5 buffers · 0,337 ms | **Incremental Sort** · 15 buffers · 0,530 ms | **Index Scan puro** · 5 buffers · 0,504 ms |
| **linha do tempo** (1 ativo) | Bitmap + **Sort** · 17 buffers | Bitmap + **Sort** · 14 buffers | — (sem índice novo) |

⚠ O número absoluto **não** é o argumento — a mecânica é. `Incremental Sort` processa cada grupo
de `data` **por inteiro** antes de ordenar por `ordem` dentro dele: medido no ensaio sem cache
quente, o executor leu **1544** linhas para devolver **30**. E o grupo grande não é hipotético —
`2026-07-27` tem **514** movimentações na mesma `data`. O custo escala com o **tamanho do lote de
import**, não com o da tabela: cada go-live de filial piora a consulta.

`idx_scan` dos três índices citados pela ordem (foto de depois): `mov_ativo_idx` **144.955** ·
`movimentacoes_ordem_lista_idx` **16.067** · `movimentacoes_forcado_idx` **2**.
**Nenhum índice existente foi dropado** — 11 antes + 2 novos = **13**.

---

## 5. Os 21 critérios, autoverificados

| # | Critério | Estado |
|---|---|---|
| 1 | `ordem` bigint, not null, identity, único, com `comment on column` | ✅ |
| 2 | `count(*)` idêntico nos dois ambientes; `count(ordem)=count(*)`; nenhuma outra coluna mudou | ✅ (hash do par idêntico) |
| 3 | Ordem ASC por `ordem` = ordem ASC pela quádrupla em 100% das linhas | ✅ (md5 idêntico) |
| 4 | `rel_estoque_asof` idêntica em 12 datas, antes/depois, nos 2 ambientes | ✅ (84 combinações, 0 divergências) |
| 5 | Duas movimentações na mesma transação recebem `ordem` distinta e ordenada; o par compra+ajuste resolve para o ajuste | ✅ (`3a`, `3c`) |
| 6 | A trava aceita/recusa **exatamente** as mesmas movimentações | ⚠ **DIVERGE — ver §6** |
| 6-bis | Existe asserção que distingue `ordem desc` puro de `data desc, ordem desc` | ✅ (`6a`, e só ele cai) |
| 7 | `guarda_acervo` volta a recusar UPDATE com `42501` | ✅ (`5a`, e reconfirmado ao vivo) |
| 8 | Nenhuma função viva desempata por `id`; exceções nomeadas | ✅ (`10a`/`10b`/`10c`, 3 exceções) |
| 9 | As duas leituras usam a mesma régua; linha do tempo estável | ✅ |
| 10 | O diff da `0134` é só a linha do desempate | ✅ (3/1, 1/1, 1/1) |
| 11 | `npm run db:test` inteiro verde | ✅ **no CI** (`banco-sem-docker`); 648 sítios |
| 12 | `npm run db:test:mutations` verde, mutações acusadas pelo rótulo nomeado | ✅ (58/58 — ver §6) |
| 13 | `lint`, `test`, `build`, `tsc` limpos | ✅ (167 arquivos, **4233** testes) |
| 14 | `db:lock` no mesmo commit; lock no diff | ✅ |
| 15 | `0133`/`0134` aplicadas em ensaio e produção + `notify pgrst` | ✅ (e a `0135`) |
| 16 | `database.ts` com `ordem` | ✅ (transplante à mão, comentado e datado) |
| 17 | v1.58.0, CHANGELOG, registry, tag anotada | ✅ |
| 18 | ORDEM DE ROLLBACK no cabeçalho das migrations | ✅ (nas três) |
| 19 | PR mergeado com os dois checks verdes; deploy; smoke | ✅ |
| 20 | Este relatório | ✅ |
| 21 | Nada fora do escopo tocado | ✅ (confirmado na revisão) |

---

## 6. As divergências, explicadas

**Critério 6 — o conjunto dos estornáveis NÃO é idêntico, e não podia ser.** Ele muda em **643**
dos 1620 ativos. Mas **643 de 643 têm empate de `created_at`** e **0 sem empate**: a régua nova
muda a resposta **apenas onde a resposta de hoje é um sorteio de uuid** — um conjunto que nem é
estável entre execuções. E nos 643, ela aponta o `ajuste` (**643/643**), que é o que
`ativos.status` já considera verdade, contra **0/643** da régua antiga. A formulação honesta:
*idêntico onde a resposta de hoje é determinada; diferente exatamente onde ela é indeterminada.*
Exigir "idêntico" aqui seria exigir que a correção não corrigisse nada.

**A `0135` não estava na ordem** — ela previa uma `0135` para `apagar_movimentacao`. A medição
tornou aquela desnecessária (o `id` lá é inalcançável) e outra necessária (o índice).

**A fila pendente é `0131`→`0132`, não `0129`→`0132`.** Sonda de efeito:
`pode_ler_arquivo_termo` existe em produção e `authenticated` tem `execute` sobre ela.

**Um CI vermelho, e o que ele achou.** A run [34357436376](https://github.com/vmatusita/ti-wap-inventory-control/actions/runs/34357436376)
reprovou o `banco-sem-docker`: a mutação `f53-asof-volta-ao-desempate-por-id` esperava derrubar
`3a` e derrubou `1` e `10a`. **Não era a mutação nem a asserção — era o fixture:** `3a` criava a
compra e o ajuste com `id` default, e sob a régua antiga que a mutação restaura quem vence o
empate vira **sorteio**. Caiu no ensaio, não caiu no banco limpo do CI. Corrigido em `e44909d`
com ids pinados (alto na compra, baixo no ajuste — o arranjo que a `0054` já usava no Cenário 1),
verificado em três rodadas seguidas, e a run seguinte
([34358962775](https://github.com/vmatusita/ti-wap-inventory-control/actions/runs/34358962775))
fechou verde nos dois checks. **Uma asserção que acerta em metade das execuções é uma afirmação,
não uma prova** — e ela sobreviveu ao ensaio justamente porque lá havia dados que a salvavam.

**Uma mutação apontava o rótulo errado.** `f53-trava-do-estorno-volta-ao-uuid` declarava
`derruba: ['4a']`; medido, ela derruba `4c`. Corrigido, com o motivo escrito na própria entrada.

**A `0134` foi editada depois de aplicada** (comentário apenas; DDL provado idêntico — 255 linhas,
diff vazio) com `--regravar-alterada`. Ata própria em `DECISOES.md`: o cabeçalho original escrevia
a receita de rollback em pseudo-SQL, e `corpo-vigente.mjs` — que **tira comentários** antes de
procurar — a lia como definição real, engolindo o corpo verdadeiro. Isso quebrava as mutações da
própria fase.

**O gerador rodava uma vez e nunca mais** (achado da revisão adversarial). Ganhou teto; a
regeneração agora é idempotente byte a byte.

---

## 7. O que este relatório **NÃO** prova

1. **A equivalência foi provada sobre o acervo de HOJE** — 3497 linhas, 1620 ativos, 20 meses —
   não sobre todo acervo possível.
2. **A comparação das 12 datas passa com QUALQUER uma das três réguas da Decisão 3.** Ela prova
   que o backfill é semanticamente neutro; ela **não decide** entre `ordem desc`,
   `data desc, ordem desc` e a quádrupla. Quem decide é o cenário **`6a`** — e ele é a única
   asserção do rig que cai sob a régua pura.
3. **A asserção de equivalência é quase tautológica no dia em que roda** (a coluna foi gerada pela
   expressão contra a qual está sendo comparada). O valor dela é **completude** hoje e
   **regressão** daí em diante.
4. **E ela JÁ diverge ao vivo, por desenho.** Rodando a mesma consulta contra produção horas
   depois do apply, a revisão adversarial mediu **1 e depois 3 linhas divergentes** — movimentações
   reais registradas no intervalo. Isso **não é defeito**: é `ordem` sendo híbrida (ranking no
   passado, ordem de inserção no futuro), exatamente o que a Decisão 3 prevê. Quem reexecutar a
   checagem depois vai ver divergência crescente, e ela é o **sinal**, não o alarme.
5. **O ensaio é rehearsal de mecânica, não de semântica** — ele não tem uma única linha em empate
   compra × ajuste (Sabotagem A). O que o ensaio provou: que as três migrations aplicam, que a
   coluna fecha com a forma certa e que a sequência fica à frente.
6. **O roteiro exercita os cenários que ele mesmo monta**, não os 20 meses de acervo.
7. **`npm run db:test` não rodou na mesa** (sem `psql`, sem Docker) — quem rodou foi o
   `banco-sem-docker`. Os roteiros que rodei contra ensaio/produção por Management API são um
   **extra**, e alguns falham lá por artefato de ambiente: `definer_sem_tenant` (ensaio sem a
   `0129`) e `f37_colaboradores_tipos` (asserção `i1` sobre dados reais de produção). Nenhum
   deles falha no CI.
8. **O smoke de produção não exercita o import, a mesa de conflitos, nem o estorno.**
9. **`v_conflitos_filiais` mudou sem asserção que a cubra** — a mutação
   `f53-view-de-conflitos-perde-o-desempate` está em **quarentena** (fase F53B), porque nenhum
   roteiro lê `ultima_mov_tipo` sob empate. Incluí-la no lote ativo produziria "não detectada" por
   conjunto vazio.

---

## 8. Pendências e backlog

**Pendências desta fase**
1. **A fila `0131` → `0132` segue sem apply**, nessa ordem (a `0132` depende da `0131`). Medido:
   `import_validar_plano`, `prefixo_backup_import` e `mesmo_escopo_de_gestao` não existem em
   produção nem no ensaio. A `0129` e a `0130` **já estão** aplicadas.
2. **O `database.ts` está transplantado à mão** e só volta a ser regenerável quando a `0131`/`0132`
   forem aplicadas.
3. **`f53-view-de-conflitos-perde-o-desempate` em quarentena** até `conflito_filiais.sql` ganhar um
   cenário com empate que leia `ultima_mov_tipo`.
4. **O ensaio está atrás na `0129`** (e agora também na `0131`/`0132`).

**Backlog para a F60**
- **O cursor está pronto:** `ordem` é única, não nula e total — é a chave de paginação keyset.
- **`paginarTodos`** (`queries/relatorios/comum.ts`) segue com `range()`/OFFSET e `CAP_PAGINACAO`
  fixo; o `cap` como terceiro parâmetro é F60, e afeta **7** chamadores.
- **`movimentacoes_ordem_lista_idx`** — `idx_scan` **16.067**, é o insumo para decidir aposentá-lo
  agora que `movimentacoes_data_ordem_idx` serve a régua nova.
- **`(ativo_id, created_at desc, ordem desc)`** — não criado nesta fase porque **não houve
  regressão medida**; fica nomeado caso o padrão de acesso mude.

**Backlog para a F65** — `(empresa_id, ordem)`: a coluna nasceu global de propósito, sem
`partition by`, o que deixa a chave composta como acréscimo e não como reescrita.

**Backlog para quem mexer em `lancamentos_item`**
- A `0127:126` (o mesmo desempate por uuid, do lado dos itens) — **nenhuma** coluna `ordem` foi
  criada lá, de propósito.
- **`actions/termos.ts:211`** — `.order('id')` **sozinho** para escolher a "movimentação de
  referência" do termo de lote, que decide a cidade da assinatura. Como `id` é
  `gen_random_uuid()`, é **sorteio disfarçado de determinismo**. Achado real desta varredura,
  **fora do escopo** desta ordem e não corrigido.
- `queries/relatorios/movimentacoes.ts` tem **duas** réguas de "últimas movimentações" no mesmo
  arquivo (`:250` created_at-primeiro, `:312` data-primeiro).
