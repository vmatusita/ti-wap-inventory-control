# PLAN-F54 — O backup deixa de mentir, e a restauração é ensaiada

*Escrito em 09/09/2026, antes de implementar, com as contagens reais medidas em produção
(`pbtjcalbmepmrqzprusb`) e no ensaio (`sgmvldiizsrjbxzzpmhh`). Onde este plano divergir da ficha da
F54 (`docs/PLANO-MULTIEMPRESA.md` §5), a medição manda — e a divergência está nomeada abaixo.*

---

## 0. As divergências já medidas contra a ordem de serviço

A ordem avisa que há seis conhecidas. Medi **onze**.

| # | A ordem/ficha diz | Medi | Prova |
|---|---|---|---|
| 1 | migration `0134`, versão `1.34.0`-ish | **`0136`, versão `1.59.0`** | `ls supabase/migrations \| tail -1` = `0135_indice_data_ordem.sql`; `package.json` = `1.58.0` |
| 2 | duas actions apagam `.docx` | **três** (a ordem já corrige) | grep |
| 3 | `urlBackup` em `queries/import-logs.ts` | está em **`actions/importar.ts:548`** | grep |
| 4 | `montarBackupDoReset` não é nomeada | tem a **mesma** leitura sem recorte | `queries/dev-destrutivo.ts` |
| 5 | cabeçalho do reset tem `versao`/`contagens` | **não tem nenhum dos dois** | `dev-destrutivo.ts:368` |
| 6 | dez checagens | **onze** | `comment on function` diz "as ONZE" |
| **7** | **três `.remove(` no bucket `termos`** | **CINCO** — `termos.ts:486` e `:519` não estavam no mapa | saída vermelha da trava, `docs/f54-evidencias/01` |
| **8** | fato 31: "as onze atuais leem só `public.*`" | **falso** — a 8ª (`arquivo_termo_orfao`) já lê `storage.objects` | corpo vigente da `0127` |
| **9** | fato 13: talvez não haja GIN em `ativo_ids` | **há** (`termos_gerados_ativos_gin`), e é usado | `EXPLAIN ANALYZE`, evidência 02 |
| **10** | fato 33: bucket `termos` ≈ 67 arquivos / 5,2 MB | **94 objetos / 7.428 kB**, maior 116 kB | `storage.objects` |
| **11** | fato 30: o predicado precisa conhecer três produtores | **duas FONTES cobrem os três produtores** — todos gravam em `detalhe->>'backup_path'` | `jsonb_object_keys` por ação |

E uma **décima segunda**, que muda o escopo: `limparArquivosDeTermo` de `dev-destrutivo.ts` é chamada
por **duas** actions — `resetarBloco` (:399) **e `apagarAtivo` (:212)**. `apagarAtivo` não está na
ficha, mas apaga `.docx` da mesma classe e **não tem backup em arquivo nenhum** (o backup dela é
jsonb inline no evento). Como a trava pega a CLASSE e tem de ficar verde sem exceção, ela entra —
não por escolha, por consequência.

---

## 1. Os números medidos

**Buckets (produção, 09/09/2026)**

| bucket | objetos | soma | maior | média |
|---|---:|---:|---:|---:|
| `termos` | 94 | 7.428 kB | 116.066 B | 80.914 B |
| `backups-import` | 22 | 22 MB | — | — |
| **total Storage** | **116** | **30 MB** de 1 GB (Free) | | |

**Pior caso da cópia** (reset global do acervo): copia os 94 objetos = **7,25 MB**, levando o Storage
de 30 MB para ~37 MB — **3,7 % do Free**. A alternativa que a ficha abre ("mudar a frase da UI com
ata") **não se abre**: o custo é irrelevante e o que não pode continuar é a promessa atual.

**Acervo:** produção `ativos=1620, mov=3503, termos_gerados=91, import_logs=12`;
ensaio `ativos=1602, mov=3239, termos_gerados=2, lancamentos_item=31`.

**Backups-import hoje:** 22 objetos, **12 registrados**, **10 órfãos reais** (todos de julho/2026,
anteriores à trilha de auditoria do import). Todos os 22 estão na forma **histórica**
`<slug>/<timestamp>.json`; **nenhum** na forma atual `import/filial-<id>/…` (que a F52 introduziu só
no TypeScript, v1.57.0). Isso decide o predicado da checagem 12: **ele não filtra por prefixo**, e é
por isso que as duas formas convivem sem ele saber que existem duas.

---

## 2. As nove decisões

### Decisão 1 — o mecanismo da cópia: `.copy()` com `destinationBucket`

**Medido na versão INSTALADA** (`@supabase/storage-js` **2.112.4**, não o `^2.110.2` do
`package.json`): `copy(fromPath, toPath, options?: DestinationOptions)` com
`DestinationOptions = { destinationBucket?: string }`; o corpo faz
`POST /object/copy {bucketId, sourceKey, destinationKey, destinationBucket}`. A doc oficial
(Context7 + `search_docs`) confirma, com o limite de 5 GB por objeto — o maior `.docx` tem 116 kB.

**Escolha: `.copy()` entre buckets.** Descartadas: copiar dentro de `termos` (a 8ª checagem
passaria a acusar cada cópia); `download`+`upload` (custa banda e memória do servidor — 7,25 MB no
pior caso passando pelo processo — sem ganhar nada); subir a versão da lib (desnecessário).

**Custo:** `copy()` **não tem forma em lote** (ao contrário de `remove()`). São N idas por operação.
Mitigação: 6 em paralelo — no pior caso (94 objetos) ~16 rodadas em vez de 94 sequenciais.

⚠ O erro do storage-js é **retornado** em `{data, error}`, não lançado. Conferir só o `catch`
deixaria toda falha de cópia passar por sucesso — e o `.docx` seria apagado em seguida.

### Decisão 2 — a convenção de caminho: `<raiz>/termos/<arquivo_path>`

A ficha propõe `<prefixo do backup>/termos/`, que não é um caminho válido: os três backups são
**arquivos** `.json`, não pastas. E o fato 4 é real — o JSON sobe **antes** da RPC, e a lista de
`.docx` só existe **depois** dela, então o JSON não pode listar as cópias.

**Escolha: caminho DETERMINÍSTICO, derivável em SQL do que as RPCs já gravaram. Sem manifesto novo,
sem evento novo.**

| caso | raiz | exemplo literal de cópia |
|---|---|---|
| import | `backup_path` sem `.json` | `import/filial-3/2026-09-09T14-05-33-102Z/termos/3f2a….docx` |
| reset | `backup_path` sem `.json` | `reset/acervo/filial-3/2026-09-09T14-05-33-102Z/termos/3f2a….docx` |
| conflito (acima **e** abaixo do teto) | `conflito/<digest>` | `conflito/5e884898…/termos/3f2a….docx` |
| apagar ativo | `ativo/<ativo_id>` | `ativo/a3d9f001-…-999900001111/termos/3f2a….docx` |

**Por que sem evento novo, que era o desenho concorrente.** O painel adversarial apontou o furo do
desenho com evento: `registrarEventoAdmin` é escrito **depois** da cópia, **fora** da transação, e
**nunca propaga erro** — cópia sobe, evento falha calado, e o arquivo vira órfão permanente
justamente nos dois caminhos que não têm rede hoje. Medi que o desenho determinístico não precisa
dele: **as RPCs já gravam tudo o que a raiz exige, dentro da própria transação** —
`ativo_apagado.detalhe->>'ativo_id'`, `conflito_filiais_resolvido.detalhe->'selecionados'`,
`backup_path` nos três que têm arquivo. E `public.digest_selecao_conflito(uuid[])` e
`public.prefixo_backup_conflito()` **já existem em produção** (`0100`), imutáveis — não há md5 para
reimplementar em SQL, nem espelho TS↔SQL novo para guardar.

**Colisão é impossível por construção:** a raiz de conflito é o digest da seleção e a de ativo é o
id — e depois de uma exclusão bem-sucedida aqueles ativos não existem mais para serem reselecionados.
Uma tentativa recusada não copia nada (a cópia só acontece depois de a RPC voltar sem erro).

**As conferências de prefixo continuam satisfeitas**, e isso é medição, não leitura: a `0089`
confere que `p_backup_path` (a) não é vazio, (b) começa por `prefixo_backup_reset(bloco,filial)`,
(c) existe em `storage.objects`; a `0100` confere prefixo + digest + existência. As três olham **só
o caminho do JSON que receberam por parâmetro** — objeto extra sob o mesmo prefixo não as toca. E as
cópias nascem **depois** da RPC, quando a conferência já aconteceu. (Prova rodada: §6.)

### Decisão 3 — cópia parcial: remove-se **exatamente** o que copiou

A RPC **já fez commit** quando esta etapa roda: as linhas já morreram. Logo todo `.docx` da lista já
é órfão de qualquer jeito, e a escolha real não é entre "coerente" e "meio apagado" — é entre
**órfão com cópia** e **órfão sem cópia**.

Num import da Matriz (84 termos), "não remover nenhum" deixaria 84 arquivos no bucket, 83 deles
duplicados no backup, e a 8ª checagem acusando 84 onde só um merecia atenção. O invariante que
importa — *nenhum documento assinado some sem cópia* — é idêntico nas duas, e só uma delas deixa o
bucket legível depois.

**O que o operador vê:** a frase nomeia os dois desfechos separadamente ("N não puderam ser copiados
e por isso NÃO foram apagados — continuam lá, inteiros" / "N foram copiados mas não saíram"), e
aponta a checagem que os conta.

### Decisão 4 — o cabeçalho do reset ganha `versao`, `contagens` e `nao_incluido`

Ele não tem nenhum dos três hoje. A trava de formato precisa de `versao` para congelar, e a
conferência de restauração precisa de `contagens`. **Ganha os três**, e o `versao` nasce em `1`.

**O que acontece com os backups antigos:** os que já estão no bucket **não** têm os campos e não vão
ganhar (não se reescreve backup). O restaurador trata `versao` ausente como `0` e, nesse caso, **não
tenta a conferência de contagens** — ele diz por escrito que aquele backup é anterior ao campo. É a
diferença entre "não confere" e "conferiu e bateu", e ela tem de aparecer na saída.

### Decisão 5 — `montarBackupDoReset` entra nesta fase

Mesma classe do fato 11, mesmo custo, outro arquivo. Corrigir metade da classe deixaria duas réguas
no repositório e a próxima pessoa adivinhando qual é a boa. **Feito** (commit `2e97cb8`).

### Decisão 6 — a guarda no-op é função **pura em TypeScript**, não SQL

O molde da F52 (`mesmo_escopo_de_gestao`) é `security definer` fechada nos quatro papéis, chamada por
`perform` de dentro de outra `security definer` — que roda como o DONO e por isso dispensa grant.
**Aqui o chamador é outro:** `urlBackup` e `listarImportLogs` são TypeScript. Uma função SQL fechada
nos quatro papéis seria **inalcançável** a partir delas; para funcionar precisaria de `grant` a
`authenticated` — isto é, acrescentaria uma `security definer` alcançável por `authenticated` à
superfície que `definer_sem_tenant.sql` (18 nomes) e `catalogo_secdef.sql` (48) vigiam, **mais** um
round-trip, para proteger zero hoje.

**A F62 vai preferir encontrar** a função pura: ela troca o corpo de `escopoDoImportLog` e os dois
chamadores herdam, sem migration e sem mexer em catálogo de segurança.

⚠ E a guarda **não é `return true`** — é uma comparação que hoje só recebe operandos iguais. É isso
que a torna verificável por EFEITO, coisa que a versão SQL da F52 não conseguiu ser. **Feito**
(commit `61981e9`), com as duas sabotagens provadas.

### Decisão 7 — o restaurador insere com o trigger DESLIGADO, não deixa a máquina derivar

Medido: `trg_aplicar_movimentacao` é `BEFORE INSERT` e **também insere `pendencias_item` sozinho**.
Deixar a máquina derivar duplicaria as `pendencias_item` que o backup já traz — não é uma questão de
gosto, é uma contagem errada. E não existe "estado inicial" gravado em lugar nenhum: o backup guarda
o estado FINAL, e inventar um inicial seria ficção.

**Escolha:** `alter table … disable trigger` dentro da janela, inserir literalmente, reabilitar. O
estado restaurado é *idêntico ao que se salvou*, e não *o que a máquina de estados produziria hoje* —
que é o que se quer de uma restauração. A conferência de que os dois coincidem é feita **depois**,
por asserção (§4), em vez de ser presumida pela mecânica.

Medições que sustentam: `guarda_acervo` **permite INSERT** (só recusa `forcado = true`) e recusa
UPDATE/DELETE; a janela é `set local estoque.dev_destrutivo = 'on'`. O restaurador **abre a janela**
mesmo assim, porque o backup pode conter linhas com `forcado = true`, e essas o `guarda_acervo`
recusaria.

### Decisão 8 — a conferência de restauração: as duas, e cada uma diz o que prova

1. **Contagem × contagem** — linhas restauradas por tabela × `contagens` do cabeçalho.
   *Prova:* nada se perdeu no caminho. *Não prova:* que o conteúdo está certo.
2. **`rel_estoque_asof` reconstruída × recapturada** na data de `exportadoEm`.
   *Prova:* o estado derivado bate — isto é, os `status` e os detentores voltaram coerentes.
   *Não prova:* nada sobre linhas que não entram no relatório (anotações, termos).

⚠ E o que **nenhuma** das duas prova: que o `.docx` restaurado ABRE. Só o ensaio ponta a ponta
prova isso, e é por isso que ele existe.

⚠ As `contagens` do import são o `custoPreview` — as quatro contagens do preview, **não** uma
reconstrução as-of. Comparar as duas coisas seria comparar grandezas diferentes; por isso a
conferência (1) usa as contagens e a (2) usa a as-of, separadas.

### Decisão 9 — a 12ª checagem: `backup_orfao`, com as raízes DERIVADAS

Nome: **`backup_orfao`**. Predicado (validado contra produção, §6): um objeto de `backups-import` é
órfão quando **não é** um caminho registrado **e não está sob nenhuma raiz de cópia derivada**.

Não filtra por prefixo, de propósito — é o que faz as duas formas históricas (`<slug>/…` e
`import/filial-N/…`) conviverem sem o predicado saber que existem duas, e o que impede que uma
terceira forma futura nasça acusada.

**O que fazer com o caminho não registrado em lugar nenhum:** medi que não existe esse caso — os
três produtores gravam em `detalhe->>'backup_path'`, e o import também em `import_logs.backup_path`.
Duas fontes cobrem três produtores.

---

## 3. A tabela do `nao_incluido` — o que a RPC apaga × o que o exportador lê

Levantada por medição do corpo **vigente em produção** (não do repositório: `importar_ativos_substituir`
no repo é a da `0132`, **não aplicada**; em produção roda a da `0094`).

**Nenhuma FK tem `ON DELETE CASCADE`** — as 10 que apontam para `ativos`/`movimentacoes`/
`lancamentos_item`/`colaboradores` são todas `NO ACTION`. Logo tudo o que some está escrito no corpo
da RPC; nada some por cascata.

| par | a RPC apaga | o exportador lê | diferença (tabelas) |
|---|---|---|---|
| **import** (`0094`) | `movimentacoes`, `anotacoes`, `termos_gerados`, `ativos` | `ativos`, `movimentacoes`, `anotacoes`, `termos_gerados` | **∅** |
| **reset acervo** (`0089`) | `pendencias_item`, `termos_gerados`, `anotacoes`, `movimentacoes`, `ativos` | os mesmos 5 (+ `ponteiros_perdidos`) | **∅** |
| **reset itens** (`0089`) | `lancamentos_item` | `lancamentos_item` | **∅** |
| **conflito** (`0100`) | `pendencias_item`, `termos_gerados`, `anotacoes`, `movimentacoes`, `ativos` | os mesmos 5 | **∅** |

**Para as TABELAS, o `nao_incluido` é vazio nos quatro.** O que faltava — em todos, igual — era o
**binário `.docx`**, e é o que esta fase acrescenta.

Então o `nao_incluido` gravado no cabeçalho **não descreve tabelas perdidas**: ele declara os limites
conhecidos daquele backup. Conteúdo por caso:

- **import**: `pendencias_item` — a RPC do import **não a apaga** (lacuna documentada em
  `queries/dev-destrutivo.ts:364-366`), e o exportador **não a lê**. Hoje nada se perde porque nada é
  apagado; o dia em que a RPC aprender a apagá-la, o backup fica incompleto **sem que nada avise** —
  e é exatamente para esse dia que a linha existe.
- **reset / conflito**: `[]` — depois desta fase, completos.

### Dois achados que a medição do `nao_incluido` produziu, e que **não** são desta fase

1. **`resetar_acervo` quebra hoje em três filiais.** Ela apaga `movimentacoes` e **não toca**
   `lancamentos_item`, cuja FK `movimentacao_id` é `NO ACTION`, não deferrável e validada. Produção
   tem **34** linhas com `movimentacao_id` preenchido (Matriz 18, Filial de Teste 12, Linhares 4).
   Um reset de acervo nessas filiais — ou global — aborta com `23503`. Nunca aconteceu porque
   **reset nunca rodou em produção** (0 eventos `acervo_resetado`).
2. **O import tem a mesma forma do problema** com `pendencias_item` (17 linhas, todas com
   `ativo_id`) e com `lancamentos_item`.

Nenhum dos dois se conserta aqui: as cinco RPCs destrutivas estão explicitamente fora de escopo.
Vão para o relatório como achado nomeado e para o backlog da F56.

---

## 4. O restaurador e o roteiro

**Ordem de inserção** (topológica, derivada das 24 FKs):
`ativos` → `movimentacoes` → `pendencias_item` → `lancamentos_item` → `anotacoes` → `termos_gerados`.
Dentro de `ativos` e `movimentacoes`, as auto-FKs (`substitui_ativo_id`, `estorno_de`) não são
deferráveis: inserir com a coluna nula e fazer `update` depois.

**As duas armadilhas herdadas da F53** (ata 1), que viram asserção e não parágrafo:
1. `movimentacoes.ordem` é `generated always as identity` → sem `overriding system value` o INSERT é
   **recusado**;
2. com ele, a sequência **não avança** → sem `setval`, a próxima movimentação real viola
   `movimentacoes_ordem_uidx`. O sintoma aparece na cara do operador, não no restore.

**`scripts/db/restaurar.mjs`**: ferramenta, não feature. Fala SQL por `psql` (`DATABASE_URL`), como
os outros `scripts/db/*.mjs`, e Storage por supabase-js. Guarda anti-produção **por identidade**
(a lista `REFS_DE_PRODUCAO`), no molde de `scripts/env-guard.ts` — e, como `.mjs` não importa `.ts`,
um teste prova que as duas listas não divergem.

**`supabase/tests/restauracao.sql`** — cenários, rótulo a rótulo:

| rótulo | prova |
|---|---|
| `1a` | o cenário existe (universo não vazio) — `assert_zero_de` |
| `2a` | INSERT em `movimentacoes` **sem** `overriding system value` é RECUSADO |
| `2b` | INSERT **com** `overriding system value` preserva a `ordem` do backup |
| `2c` | sem `setval`, o INSERT seguinte viola `movimentacoes_ordem_uidx` |
| `2d` | com `setval`, o INSERT seguinte passa |
| `3a` | com o trigger LIGADO, o `status` restaurado é sobrescrito (a armadilha) |
| `3b` | com o trigger DESLIGADO, `ativos.status` restaurado é idêntico ao do backup |
| `3c` | com o trigger LIGADO, `pendencias_item` seria DUPLICADA |
| `4a` | a ordem de inserção proposta não viola FK |
| `5a` | `guarda_acervo` permite INSERT fora da janela, e recusa `forcado = true` |

---

## 5. A `0136` e a ORDEM DE ROLLBACK

`create or replace function public.dev_checagens_integridade()` a partir do corpo **vigente** lido
por `corpo-vigente.mjs` (`0127`), com **um bloco novo** no fim. Nada mais muda.

⚠ Não chama `prefixo_backup_import()` — ela não existe no banco (a `0132` não foi aplicada).
Chama `prefixo_backup_conflito()` e `digest_selecao_conflito()`, que **existem** (`0100`).

⚠ Usa só `bucket_id` e `name` de `storage.objects` — o `bootstrap-storage.sql` do CI **não tem a
coluna `metadata`**, e um predicado que a usasse morreria no `banco-sem-docker`.

**ORDEM DE ROLLBACK** (o inverso da de apply):
1. produção: `create or replace` reemitindo o corpo da `0127` (onze checagens);
2. ensaio: idem;
3. `notify pgrst, 'reload schema'` não é necessário (assinatura idêntica);
4. reverter o commit da entrada curada em `queries/dev.ts` **junto** — catálogo com doze e função
   com onze mostra a décima segunda como chave crua;
5. `npm run db:lock` para regravar a trava sem a `0136`.

---

## 6. As provas de prefixo, rodadas (critério 4)

O SQL das duas conferências, contra um caminho de cópia de exemplo, está em
`docs/f54-evidencias/13-conferencias-de-prefixo.md`.

O predicado da checagem 12 foi rodado **contra produção** e devolveu **exatamente os 10 órfãos
reais**, nominalmente, com 73 raízes derivadas e 12 caminhos registrados.

---

## 7. Ordem de execução

A → B → C → D → E, com `lint`/`test`/`tsc` verdes entre uma e outra.
A Frente A **começou pela trava vermelha** (commit `631e02d`), como manda a regra 4 do §4.

Adotada também, do lote de QUARENTENA do injetor: a entrada
`conflito-backup-em-arquivo-sem-prefixo-do-digest`, que a F52 **reapontou explicitamente para a
F54** com o cenário escrito (26 ativos, backup em arquivo, recusa de caminho fora do digest). Ela é
a forma mais forte de satisfazer o critério 4, e deixá-la na quarentena depois de a fase abrir
justamente esses caminhos seria mover a promessa de novo.
