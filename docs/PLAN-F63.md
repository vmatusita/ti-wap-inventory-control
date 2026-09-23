# PLAN-F63 — `empresa_id` no acervo (lote 1) e a disciplina de backup de migração

> Plano de execução da ordem `docs/prompts/F63-empresa-no-acervo-e-backup-de-migracao-ultracode.md`
> (F63 do `PLANO-MULTIEMPRESA.md` §7). Escrito **antes** do primeiro commit que toca `supabase/`,
> `src/` ou `scripts/`, como a Frente A exige. Versão da fase: **`1.68.0`**. Branch:
> `f63-empresa-no-acervo`.
>
> Régua de decisão (a da ordem, nesta ordem): (1) medição própria contra o disco e os bancos de
> hoje; (2) a decisão do Johnny (o default fica até a F67); (3) a ficha F63; (4) a ordem; (5) as
> convenções do repositório e o molde da F62; (6) o mais simples e reversível.
>
> ⚠ **Duas versões da ordem.** O bloco colado na conversa e o arquivo `docs/prompts/F63-…md` no
> disco diferem em detalhes — o do disco é o mais novo e mais estrito (a janela de produção pelo
> `xmin` a partir de um corte, o `coalesce(…, 'vazia')` dos md5, o `savepoint` das sabotagens D e E,
> o rollback em `supabase/rollback/F63-*.sql`, a exceção nominal da `0133`, as 12 divergências). Onde
> diferem, sigo o do disco; onde um só é mais estrito, sigo o mais estrito.

---

## 0. O "antes" — ⚠ AINDA NÃO TIRADO: o conector da Supabase está desligado

Às 23/09/2026, no início da run, **toda** ferramenta do conector da Supabase (`list_projects`,
`execute_sql`, `list_migrations`) respondeu *"This tool has been disabled in your connector
settings"*, com o conector aparecendo como `connected` (29 ferramentas) no status da sessão. É o
bloqueio por ferramenta que a F60 viu (memória `conector-supabase-desligado-no-meio-da-run`): não é
o classificador de segurança, e só o Johnny o desfaz (nas configurações do conector no claude.ai).

Consequência, pela ordem ("Bloqueios reais — o MCP não está conectado"):

- **nenhum apply acontece sem o "antes"** — e nenhum apply acontece sem o MCP, então o portão
  "o antes vem antes de qualquer apply" está garantido por construção;
- **tudo o que não depende do banco vivo é entregue** (classificador, travas, migrations, roteiros,
  catálogos, tipos, injetor, documentos, versão), com o CI verde;
- **o PR fica ABERTO e SEM merge** enquanto o conector não voltar (o `database.ts` descreveria
  colunas que produção não tem);
- o relatório abre com o **caminho B** (as migrations na ordem, a impressão para rodar antes e
  depois, o rollback);
- **releio a lista de ferramentas antes do merge** (a memória registra que o conector pode voltar no
  meio da sessão). Se voltar, o fluxo normal da Frente G segue daqui: "antes" nos dois bancos →
  apply no ensaio → provas → produção → provas → merge.

Os instrumentos do "antes" já estão prontos e versionados (Frente A):

| instrumento | o que imprime |
|---|---|
| `docs/f63-evidencias/impressao-acervo.sql` | por tabela: linhas · `relfilenode` · md5 de `(id, xmin)` · md5 do conteúdo sem `empresa_id` · janela (linhas com `xmin` a partir do corte) · estado da coluna no catálogo; mais o md5 do `prosrc` das 18 escritoras e se `backups_migration` existe. Só contagem e hash. |
| `docs/f63-evidencias/impressao-policies.sql` | as 62 policies vivas (public 54 · storage 8), contagem e md5 byte a byte por schema; das oito tabelas, 23 policies e quantas citam `empresa_id` (0) |
| `docs/f63-evidencias/verificacao-pos-apply.sql` | a prova do runbook depois do apply: coluna, default pelo `pg_depend`, FK validada, comentário F67, as três contagens iguais; `backups_migration` com RLS, sem force, zero policy e privilégio 0 nos três papéis |
| `get_advisors(security)` | contado por nível e nome |

---

## 1. Os 26 fatos, remedidos

Medição por quatro frentes paralelas de exploração (resumos só com números; nenhuma abriu o
`.env.local` nem tocou banco) e por mim. "=" bate com o fato; **⚠** diverge (a medição ganha e vai
para o relatório); **—** não remedido (depende do banco vivo, conector desligado — vale a medição da
ordem, de 23/09, até a volta do conector).

| # | o fato diz | medi (23/09, disco e git) | |
|---|---|---|---|
| 1 | `main` em `3c1c761`, tag `v1.67.0` nele, `1.67.0`; 157 arquivos `0001`→`0158`, gap `0029`; ledger dos dois bancos termina em `cargo_em_membros` (prod 142 · ensaio 155); PG 17.6; primeira da fase `0159` | HEAD `3c1c761` = objeto da tag anotada `v1.67.0`; `package.json` e `VERSOES[0]` em `1.67.0`; 157 arquivos, gap só `0029`, último `0158_cargo_em_membros.sql`. O ledger e o PG: não remedidos | = · — |
| 2 | 250 arquivos de teste, 7.434 testes; 41 roteiros + `_asserts.sql`, 969 asserções; injetor 125/125 + 2 quarentena; `k_secdef` 65; `k_policies_public` 54 (+8 Storage); `k_negocio`/`k_infra` 20/8; `k_sem_select` 5; advisor 5 INFO · 34 WARN · 1 WARN Auth | 250 arquivos (224 `.test.ts` · 11 `.test.mts` · 15 `.test.tsx`, 4 deles `.dom`); 41 roteiros; `MUTACOES.length` = **125 = o teto** (zero folga, medido por import) e 2 em quarentena (2/127); `k_secdef` 65, `k_policies_public` 54, `k_negocio` 20, `k_infra` 8, `k_sem_select` 5 — por regex sobre o SQL, não pelo comentário. Casos de teste e advisor: a medir na Frente G | = · — |
| 3 | contagens das oito nos dois bancos; ensaio com `anotacoes` e `colaboradores` VAZIAS | não remedido (conector) | — |
| 4 | quem tem pai | = (lido nas migrations) | = |
| 5 | `guarda_acervo` BEFORE I/U/D em `movimentacoes`/`lancamentos_item`; `ativos_guarda_acervo` só BEFORE DELETE — o `update` ingênuo em `ativos` reescreve; 23 policies nas oito | = no disco (`0081`); o comportamento vira a sabotagem E no CI | = |
| 6 | `0155` é o precedente; `empresa_legada()` `sql stable`; `filiais.empresa_id` com `atthasmissing` em produção | = no disco; o `atthasmissing` de produção: não remedido | = · — |
| 7 | sem `set not null` separado; ADD COLUMN toma ACCESS EXCLUSIVE; nenhuma migration usa `lock_timeout`; o CI aplica com `psql -f` sem `-1` | = (`ci.yml:288-289`: um `psql -v ON_ERROR_STOP=1 -q -f` por arquivo); doc do PG 17 conferida (§4, decisão 2) | = |
| 8 | `relfilenode` acusa reescrita; `(id, xmin)` acusa update; o `xmin` sobrevive ao freeze | = — doc do PG 17: *"Newer versions just set a flag bit, preserving the row's original xmin"* (24.1.5); `atthasmissing`: *"a column is added with a non-volatile DEFAULT value after the row is created"* (51.7) | = |
| 9 | 18 funções SQL, 9 pontos TS, scripts, `restaurar.mjs:272-277`, 27 de 41 roteiros com ~569 INSERTs | **18 exatas**, nome a nome (corpo vigente por `corpo-vigente.mjs`, 109 funções distintas, 0 ambiguidade); os **9 pontos** nas linhas citadas; 27 roteiros, **569** INSERTs (exato); `restaurar.mjs:272` monta as colunas pelas chaves do backup | = |
| 10 | 4 pontos do `INVENTARIO-LEITURAS` migram para a F67 | = | = |
| 11 | ninguém lê linha inteira: os 9 `select('*')` são contagem; formas estritas; backups frouxos; Realtime entrega a linha | os 9 `select('*', {head:true})` = ; **⚠ mas há mais 17 `select: '*'` em constantes de forma** sobre as oito — a ficha do ativo (`LEITURA_FICHA_ATIVO`, `'*, filiais(slug, nome)'`) e 16 de backup/exportação (`conflitos.ts` 5, `dev-destrutivo.ts` 6, `import-logs.ts` 5). **Todas `z.looseObject`** (decisão 5 da F58): a coluna chega nelas depois do apply e atravessa sem lançar. O consumidor do Realtime (`realtime-refresh.tsx:45`) nem lê o payload | ⚠ 26 leituras de linha inteira, todas frouxas |
| 12 | não existem classificador nem `backups_migration`; `-- classe:` em 7 de 157 (`0152`–`0158`, todos ADITIVA) | = | = |
| 13 | a guarda de `migrations-f38.test.ts:634-663` é mais forte que a ficha; leitores fracos (`:249`, `:262`) | = ; e **⚠ a regex dela é CEGA A ALIAS**: `update\s+(public\.)?movimentacoes\s+set` não casa `update public.movimentacoes m set` — exatamente a forma da `0133`. Mesmo vendo o `do`, a guarda de hoje não pegaria a `0133`; nem `update only …`, nem nome citado | ⚠ |
| 14 | 12 arquivos com dollar-quote rotulado; 2 com `$$` em comentário; 32 com comentário de fim de linha; 7 com `/* */`; 10 com `do` de topo, 5 escrevendo; 1 com `execute format` | = todos (medidos sobre a cadeia inteira; sobre `DA_F38` os rotulados caem para 4) | = |
| 15 | `0111` update de topo; `0133` abre a janela dentro de `do` e faz update em todas; `0158` declara ADITIVA e faz upsert em `membros` | = ; e **⚠ a `0156` também diverge**: declara ADITIVA e faz `update public.operador_filiais` de topo (o backfill do vínculo por membership) — o classificador a calcula BACKFILL | ⚠ +1 |
| 16 | molde `public.ambiente` | = (`0090:44-56`) | = |
| 17 | describe 5 | = (`:297-357`); o "describe 9" do teste NÃO é o "9k" do roteiro (são numerações locais de cada arquivo) | = |
| 18 | `k_negocio` 20 com as quatro do vocabulário do import fora da lista da ficha F64 | = | = |
| 19 | migration nova: lock + `DA_F38` + guardas | = | = |
| 20 | injetor teto 125 | = e o lote está NO teto | = |
| 21 | `db:types:diff`; 2 usos de `Row` das oito | = ; um dos dois (`formas/ativos.ts:54`) é COMENTÁRIO — o único uso vivo é `AtivoFicha = Tables<'ativos'> & {…}` (`queries/ativos.ts:288`), que a ficha frouxa alimenta com `'*'` | ⚠ 1 uso vivo |
| 22 | restauração: backup antes da F63 sem a chave | = (`restaurar.mjs:272`) | = |
| 23 | ADR-003 + RUNBOOK | = | = |
| 24 | sonda de deriva base 146, 24 h, `nome_duplicado` | = (`BASE_DO_CONTRATO = 146`, `toleranciaHoras = 24`); nenhum nome-sem-prefixo da fase colide | = |
| 25 | conferência pós-deploy e credenciais | não medido de propósito — **ninguém abriu o `.env.local`** | — |
| 26 | regras do CLAUDE.md | = | = |

**Achados que o cabeçalho da ordem não tinha:**

- **(a) O rollback ensaiado da F62 quebra depois da F63.** `supabase/rollback/F62-2-desfaz.sql:700-701`
  faz `drop table public.empresas;` e `drop function public.empresa_legada();` **sem `cascade`** — e
  a F63 pendura nelas oito FKs e oito defaults. O roteiro `f62_rollback.sql` passa a abortar no CI.
  A correção certa é a ordem de rollback ENTRE fases (regra 10 da §4): desfazer a F63 antes de
  desfazer a F62. O roteiro da F62 ganha o `\ir ../rollback/F63-desfaz.sql` antes dos dele, e o
  RUNBOOK escreve a regra. O que ele prova não muda.
- **(b)** `scratch_tmp/scripts/db/{corpo-vigente,mutacoes}.mjs` estão **rastreados pelo git** — cópia
  de worktree de agente (memória `worktrees-de-agente-quebram-ci-passos-local`). Fora do escopo:
  backlog.

---

## 2. O censo dos escritores e leitores das oito (o orçamento da F67 — a fase NÃO o executa)

### 2.1 SQL (corpo vigente)

| tabela | funções que fazem INSERT (vigente em) |
|---|---|
| `ativos` | `criar_compra_lote` (0064) · `devolver_ao_fornecedor` (0047) · `import_criar_ativos` (0131) |
| `movimentacoes` | as duas acima · `criar_movimentacao_com_itens` (0126) · `estornar_movimentacao_com_itens` (0122) · `forcar_estado_ativo` (0110) · `import_lancar_movimentacoes` (0131) |
| `lancamentos_item` | `criar_movimentacao_com_itens` · `estornar_movimentacao_com_itens` · `forcar_saldo_item` (0084) · `lancar_itens_lote` (0126) · `reabrir_pendencias_item_com_estornos` (0122) · `resolver_pendencias_item_com_lancamentos` (0126) · `transferir_item` (0104) |
| `pendencias_item` | `movimentacao_abrir_pendencias_item` (0150) |
| `anotacoes` | `corrigir_patrimonio_com_anotacao` (0149) · `definir_service_tag_com_anotacao` · `confirmar_assinatura_termo_com_anotacao` · `desfazer_confirmacao_termo_com_anotacao` · `confirmar_assinatura_lote_com_anotacoes` (0151) |
| `termos_gerados`, `colaboradores`, `itens` | nenhuma (só TS e scripts) |

**18 distintas.** UPDATE: `ativos` em 16 funções (as `movimentacao_*`, `apagar_*`, `resetar_*`,
`import_apagar_acervo_filial`), `pendencias_item`/`lancamentos_item` pontualmente; **`movimentacoes`
nunca**. DELETE nas oito via `apagar_*`, `resetar_*`, `import_apagar_acervo_filial`,
`importar_ativos_substituir`, `movimentacao_desfazer_pendencias_item`. **Backups inline**
(`to_jsonb(<linha>)`): as 8 que o fato 11 nomeia — passam a levar a chave `empresa_id`. **Nenhuma
função devolve `setof` de uma das oito, e nenhuma função vigente cita `empresa_id` junto de uma das
oito** (as 17 que citam `empresa_id` são da F62, sobre `membros`/`empresas`/`operador_filiais`).

### 2.2 TypeScript e scripts

- **9 INSERTs em `src/lib/actions`**: `itens.ts:448` (lançamento), `ativos.ts:128` e `pendencias.ts:442`
  (anotação), `termos.ts:532`, `colaboradores.ts:167/198/301` (o último é `upsert`), `itens.ts:572/711`.
  E um UPDATE em `termos_gerados` (`termos.ts:~525`, o ramo "reutilizar").
- **Scripts**: `seed.ts` (`ativos` :704/:804, `movimentacoes` :757/:809, `itens` :920,
  `lancamentos_item` :1047, `anotacoes` :1093, `colaboradores` upsert :885), `import/carga.ts`
  (`ativos` :314, `movimentacoes` :362, `lancamentos_item` :520), `smoke/fixtures-passe2.ts` (`itens`
  :82), `db/restaurar.mjs:272` (as colunas saem das chaves do backup).
- **Leitores**: 9 `select('*', {head: true})` (contagem); 17 `select: '*'` em constantes de forma, todas
  `z.looseObject` (§1, fato 11); as demais formas são `z.strictObject` com lista explícita de colunas —
  a coluna nova não aparece nelas. `AtivoFicha` ganha `empresa_id: string` no tipo, e a linha real
  passa a trazê-la depois do apply (a ficha lê `'*'`).

### 2.3 Roteiros

27 dos 41 inserem numa das oito, em **569** INSERTs: `asof_desempate`, `cargo_dev`, `conflito_filiais`,
`dev_destrutivo`, `escrita_atomica_ativos_anotacao`, `f34_triagem_reserva`, `f36_detentor`,
`f37_colaboradores_tipos`, `f38_itens_com_ativo`, `f41_regularizacao`, `f60_recorte`,
`import_substituir`, `integridade_alarme`, `isolamento_tenant`, `itens_extra`, `itens_quantidade`,
`manutencao_fornecedor`, `maquina_estados`, `movimentacao_grade`, `papeis_rls`,
`pendencias_import_termo`, `pendencias_item`, `reabrir_pendencia_item`, `restauracao`,
`transferencia_item`, `transicoes_extra`, `troca`. **Com o default, nenhum deles muda** — a sabotagem G
é o CI verde sem tocá-los.

---

## 3. O censo da cadeia pelo classificador

`node scripts/db/classificar-migration.mjs --censo` (saída inteira em
`docs/f63-evidencias/censo-cadeia.md`). Sobre as 157: **ADITIVA 139 · BACKFILL 11 · DESTRUTIVA 2 ·
ILEGÍVEL 5**, e o leitor lê as 157 **sem lançar**. É evidência, não trava, abaixo da `0159`.

| arquivo | calculada | veredito | por quê |
|---|---|---|---|
| `0007` `0026` `0102` | BACKFILL | BACKFILL | insert/update em `filiais`/`motivos` que já existiam |
| `0021` `0031` | BACKFILL | BACKFILL | insert em `storage.buckets` |
| `0053` | BACKFILL | BACKFILL | insert em `pendencias_item` e update em `ativos` |
| `0061` | BACKFILL | BACKFILL | update em `profiles` |
| `0076` | BACKFILL | BACKFILL | update em `profiles` **dentro de `do`** |
| `0127` | BACKFILL | BACKFILL | insert em `lancamentos_item` **dentro de `do`** |
| `0039` `0058` | DESTRUTIVA | DESTRUTIVA | `drop table` (backups de fase) |
| `0057` `0125` | ADITIVA | **ILEGÍVEL** | coluna gerada STORED (reescreve a tabela) |
| `0111` | BACKFILL | **ILEGÍVEL** | update em `ativos` que chama `public.status_tem_detentor()` no apply — o caso que a ficha cita: dependia de uma função criada na migration anterior, nunca exercitada contra dado real |
| `0124` | ADITIVA | **ILEGÍVEL** | `execute format(…)` (SQL dinâmico) |
| `0133` | BACKFILL | **ILEGÍVEL** | update em `movimentacoes` dentro de `do`, `setval()` e a **válvula** `estoque.dev_destrutivo` aberta |

**As sete com cabeçalho (`0152`–`0158`), declarada × calculada:** cinco batem (ADITIVA); **`0156`
(update em `operador_filiais`) e `0158` (upsert em `membros` dentro de `do $recopia$`) declaram ADITIVA
e executam BACKFILL.** Nenhuma se edita (migration aplicada); as duas divergências vão para a ata.

---

## 4. O desenho e as dez decisões

### Decisão 1 — as migrations

Três, nesta ordem (nome-sem-prefixo inédito no repositório, conferido contra os 157):

| # | arquivo | classe | o quê |
|---|---|---|---|
| 1 | `0159_backups_migration.sql` | ADITIVA | a tabela do par de backup, fechada no molde de `ambiente` |
| 2 | `0160_empresa_no_acervo_cadastros.sql` | ADITIVA | `empresa_id` em `colaboradores`, `itens`, `termos_gerados`, `anotacoes` — as frias primeiro, como canário |
| 3 | `0161_empresa_no_acervo_movimento.sql` | ADITIVA | `empresa_id` em `ativos`, `movimentacoes`, `pendencias_item`, `lancamentos_item` — as quentes, na ordem em que o caminho de escrita do app toma os locks (`criar_movimentacao_com_itens` trava `ativos` com `for update` ANTES do primeiro INSERT, depois grava em `movimentacoes`, cujo gatilho abre `pendencias_item`, e por último em `lancamentos_item`): tomar na mesma ordem evita o ciclo de espera. *(A primeira versão punha `movimentacoes` primeiro — achado da revisão adversarial, corrigido antes de qualquer apply.)* |

Cada tabela: `add column empresa_id uuid not null default public.empresa_legada() references
public.empresas (id)` (a forma exata da `0155`) + `comment on column` com a data, o motivo e "o default
cai na F67". **Sem `update`** (em letras grandes no cabeçalho, com o porquê: a `guarda_acervo` aborta
em `movimentacoes`/`lancamentos_item` e reescreve em silêncio em `ativos`), **sem `set not null`
separado, sem índice** (F65), **sem função criada ou recriada, sem policy tocada**.

### Decisão 2 — o lock

- **O que o PG 17 diz** (doc oficial, conferida): ADD COLUMN toma **ACCESS EXCLUSIVE**; *"ADD FOREIGN
  KEY also acquires a SHARE ROW EXCLUSIVE lock on the referenced table"*; o default não-volátil *"is
  evaluated at the time of the statement and the result stored in the table's metadata"* (sem
  reescrita); a FK é validada por uma varredura, sem reescrever. `lock_timeout` *"applies separately to
  each lock acquisition attempt"*. `SET LOCAL` *"outside of a transaction block emits a warning and
  otherwise has no effect"*; `SET` dentro de uma transação que aborta *"disappear[s]"*, e na que
  confirma persiste na sessão.
- **Escolha: `set lock_timeout = '2s';` no topo e `reset lock_timeout;` no fim, SEM `begin`/`commit`
  no arquivo.** O CI aplica cada comando solto (`psql -f`, sem `-1`): ali `set local` não valeria. O
  `apply_migration` do MCP (Management API, `POST /v1/projects/{ref}/database/migrations`) grava o
  ledger depois do texto; um `commit` dentro do arquivo poderia fechar a transação antes do registro.
  `set` + `reset` vale nos dois caminhos: se o apply for uma transação e abortar, o `set` some junto;
  se confirmar, o `reset` do fim o desfaz. Uma nova regra do classificador reprova `begin`/`commit` de
  topo a partir da `0159`.
- **No CI, uma migration de quatro tabelas NÃO é atômica** (cada `alter` confirma sozinho); no MCP,
  presumo que seja (não medido — o conector está desligado; medir no primeiro apply). O rollback usa
  `drop column if exists`, que serve aos dois casos.
- **Por que 2 s:** as tabelas são pequenas (maior: `movimentacoes`, 3.626 linhas, 4,7 MB); o ALTER dura
  milissegundos. O timeout protege o app de ficar enfileirado atrás de um ALTER que espera: se o lock
  não vier em 2 s, o ALTER aborta, e o pior caso de fila do app é de 2 s por tentativa.
- **Se o lock não vier:** registrar e repetir, **no máximo três tentativas em 30 minutos**. Não subir o
  timeout, não matar sessão do app. Depois da terceira, parar o apply daquele banco: PR aberto, sem
  merge, o comando no topo do relatório.

### Decisão 3 — as classes (os limites finos)

A classe mede o risco sobre **DADO que já existia**. Ordem: ADITIVA < BACKFILL < DESTRUTIVA; ILEGÍVEL
fica fora da ordem e reprova a partir da `0159`.

| caso | classe | por quê |
|---|---|---|
| `insert` em tabela criada **na mesma migration** | ADITIVA | a tabela nasce e morre com o rollback |
| `insert` (puro ou `on conflict do nothing`) em tabela que **já existia** | BACKFILL | muda o conteúdo de tabela viva; não é ADITIVA pela definição da ordem. O par de backup NÃO se aplica (não há valor anterior); o rollback apaga o que entrou, e o rodapé diz como |
| `insert … on conflict … do update` em tabela que já existia | BACKFILL, **com o par** | sobrescreve valor existente |
| `update` em tabela que já existia | BACKFILL, **com o par** | idem |
| `merge` | BACKFILL (DESTRUTIVA se `then delete`) | e reprova a partir da `0159`: não tem `where` verificável para o par — escreva `update` |
| qualquer DML em tabela criada na mesma migration | ADITIVA | |
| `delete`, `truncate` | DESTRUTIVA | |
| `drop table|schema|sequence`, `alter table … drop [column]`, `drop … cascade` | DESTRUTIVA | `cascade` derruba dependentes — inclusive coluna gerada ou default |
| `alter column … type` | DESTRUTIVA | reescreve e converte; o leitor estático não sabe quando não reescreve |
| `rename`/`set schema` de tabela que já existia, `rename column` dela | DESTRUTIVA | o nome passa a apontar para outro dado: a cópia transformada que assume o nome é uma reescrita sem `update` (2ª rodada da revisão adversarial); a tabela criada no próprio arquivo fica poupada, e `rename constraint` é ADITIVA |
| `drop function|view|policy|trigger|index` sem `cascade` | ADITIVA | não há dado; o risco de segurança de um drop é das OUTRAS travas (intocáveis, catálogos) |
| `create or replace view` | ADITIVA | não há dado |
| `add column` com default literal ou da lista fechada (`public.empresa_legada()`, `now()`, `current_timestamp`, `current_date`, `localtimestamp`, `transaction_timestamp()`, `statement_timestamp()`) | ADITIVA | caminho rápido do PG 11+ |
| `add column` com outro default, coluna gerada STORED, serial/identity | **ILEGÍVEL** | o leitor não sabe a volatilidade; default volátil reescreve a tabela |
| `do` | **código executado**: cada comando do corpo é classificado como de topo | o `do` roda no apply |
| `execute` (SQL dinâmico), `call`, `copy` | **ILEGÍVEL** | o leitor não vê o texto que roda |
| chamada, no apply, de função fora da lista fechada `FUNCOES_SEM_ESCRITA` (agregados, texto, json, catálogo, `set_config`, `pg_notify`… e `public.empresa_legada`) | **ILEGÍVEL** | uma função chamada pode escrever, e o leitor não a vê por dentro |
| reescrita sem perda (`set logged/unlogged/tablespace`, `vacuum full`, `cluster`, `alter sequence … restart`) | **ILEGÍVEL** | |
| comando de topo de cabeça desconhecida | **ILEGÍVEL** | falha fechada |

Válvulas (reprovam a partir da `0159`, em qualquer lugar executado — topo ou `do`): `set_config` /
`set` de `estoque.dev_destrutivo`, `session_replication_role`, `alter table … disable trigger`.

**O que o censo diz da `0111` e da `0158`:** a `0111` é BACKFILL calculada e ILEGÍVEL no veredito (o
`update` chama uma função no apply); a `0158` declara ADITIVA e é BACKFILL (upsert em `membros`, que
existe desde a `0153`, dentro de um `do`). E a `0156`, que a ordem não citava: declara ADITIVA e é
BACKFILL.

### Decisão 4 — `public.backups_migration`

```
id              bigint generated always as identity primary key
migration       text not null   check (migration ~ '^[0-9]{4}_[a-z0-9_]+\.sql$')
tabela          text not null   check (tabela ~ '^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$')   -- 'public.x'
coluna          text not null   check (coluna ~ '^[a-z_][a-z0-9_]*$')
chave           text not null   -- o id da linha, como texto (uuid, smallint, bigint)
valor_anterior  jsonb           -- to_jsonb(<alias>.<coluna>); SQL NULL = o valor ERA null
gravado_em      timestamptz not null default now()
unique (migration, tabela, coluna, chave)   -- um valor anterior por célula: o rollback é determinístico
```

- **O par, não a linha:** `(chave, valor_anterior)` por coluna alterada (fato 16; o Free tem 500 MB).
- **Restaurar** (a receita do RUNBOOK): `update public.x t set col = (jsonb_populate_record(null::public.x,
  jsonb_build_object('col', b.valor_anterior))).col from public.backups_migration b where b.migration =
  '<arquivo>' and b.tabela = 'public.x' and b.coluna = 'col' and b.chave = t.id::text;` —
  `jsonb_populate_record` devolve o tipo certo (array, jsonb, enum) e o `null`.
- **Fechada no molde de `ambiente`:** RLS ligada, **zero policy**, `revoke all … from anon,
  authenticated, service_role` (e o mesmo na sequência da identidade), **sem `force`**. `comment on
  table`: quem escreve é a migration (como o dono), quem lê é o rollback.
- **Retenção:** a linha fica até uma migration DESTRUTIVA nomeada apagar os pares de uma migration cujo
  rollback deixou de fazer sentido — **no mínimo 90 dias** depois do apply em produção. Ninguém do app
  lê nem escreve (sem grant).
- **Tamanho:** ~150 bytes por par. Um backfill de uma coluna no acervo inteiro de produção (5.684
  linhas) é ~1 MB. Cabe no Free com folga; é o motivo de guardar o par.
- **Catálogo:** `k_infra` (8 → 9) e `k_sem_select` (5 → 6), com motivo e migration na mesma linha. O
  advisor ganha **um** INFO `rls_enabled_no_policy`, declarado.

### Decisão 5 — o leitor único

`scripts/db/classificar-migration.mjs`, puro, sem dependência, com `export` de `lexar`,
`semComentarios`, `comandosExecutados`, `textoExecutado`, `escritasExecutadas`, `classificar`,
`conferirMigration` e `censo`.

- **O léxico imita o do Postgres**: comentário de linha e de bloco (aninhado) só fora de texto,
  identificador citado e dollar-quote; texto `'…'` e `E'…'`; `$$`/`$rótulo$`. Um `$$` em comentário
  não abre corpo; um `--` em texto não é comentário.
- **Corpo de `create function|procedure` sai** (texto guardado); **corpo de `do` entra** (lido de novo
  pelo mesmo léxico; cada comando vira executado com `origem: 'do'`).
- **Falha fechada**: dollar-quote, texto, identificador ou comentário de bloco sem fecho LANÇA
  `LeituraIlegivel` com o trecho. O que ele lê e não sabe classificar vira o veredito ILEGÍVEL (não
  lança) — assim as 157 são lidas e a falha fechada convive.
- **`migrations-f38.test.ts` passa a usá-lo**: `semComentarios` (o de agora tira comentário de fim de
  linha e de bloco, respeitando texto e corpo) e, na guarda de topo, `textoExecutado` +
  `escritasExecutadas`. A guarda da guarda (`:665`) continua provando o que provava — o `delete` no
  corpo é ignorado, o de topo é pego — e ganha os casos novos: dentro de `do` (pego), dentro de
  `$função$` (ignorado), depois de `$$` em comentário (pego), com alias (pego).
- **A guarda de topo fica SEM válvula**: não lê a classe declarada. Ganha a lista NOMINAL e FECHADA
  `EXCECOES_TOPO_NO_ACERVO = { '0133': … }` (a única, com o motivo), exaustiva (a `0133` escreve
  exatamente o que a exceção diz), com a asserção de que nenhuma chave é ≥ `0159`. Um backfill legítimo
  de `ativos` no futuro entra por exceção NOVA, com decisão do Johnny, e mexe nessa asserção de
  propósito — escrito no RUNBOOK.

### Decisão 6 — a trava do lote 1

- **Mora em `supabase/tests/catalogo_policies.sql`**, bloco novo (15a/15b/15c), SÓ LEITURA como o resto
  do arquivo, porque é lá que `k_negocio` mora. **A fonte única das oito** é `k_lote1`, declarada ao
  lado de `k_negocio`.
- **15a** — `k_lote1 ⊆ k_negocio` (a lista sai do catálogo de negócio, não é uma lista solta).
- **15b** — cada tabela de `k_lote1`: coluna `empresa_id` visível, `uuid`, `not null`, FK **validada**
  para `public.empresas(id)` sobre ela sozinha, default preso a `public.empresa_legada()` **pelo
  `pg_depend`** (não pelo texto de `pg_get_expr`, que qualifica conforme o `search_path`) e expressão
  que é só a chamada, sem `force row level security`. O ✗ nomeia cada tabela e cada defeito. **Hoje
  reprova pelos oito nomes.**
- **15c** — derivada do catálogo: toda tabela de `k_negocio` que TEM a coluna obedece à mesma forma
  (hoje `filiais`; depois da F63, as nove).
- **As que faltam** (`k_negocio` sem a coluna: 11 — sete da lista da F64 e as quatro do fato 18) saem
  num `raise notice` de **pendência nomeada da F64**, sem reprovar.
- `src/lib/validators/catalogos-seguranca.test.ts` (describe 12, novo) amarra: `k_lote1` tem as oito, e
  a trava "ninguém lê" lê a lista DAQUI.

### Decisão 7 — a trava "ninguém lê `empresa_id` do acervo antes da F66"

- **TS** (`src/lib/validators/empresa-acervo-sem-leitura.test.ts`): toda cadeia `.from('<uma das
  oito>')…` em `src/**` (fora de `*.test.*` e de `src/lib/types/database.ts`, a exceção nomeada) é lida
  até o fim da cadeia de métodos, respeitando texto e parênteses, e não pode citar `empresa_id`. O
  universo é contado (não pode ser vazio) e cinco casos sintéticos provam que ela acusa: `.eq` e
  `.select('id, empresa_id')` em `ativos`, `.match({ empresa_id })` em `itens`, e os dois pelo nome do
  item de forma (`leituraDeRelacao` com `origem` das oito e `select` citando a coluna).
- **SQL, no catálogo** (roteiro novo `empresa_no_acervo.sql`, bloco 7): nenhuma policy das oito cita
  `empresa_id` (universo 23); nenhuma função de `public` e nenhuma view cita `empresa_id` junto de uma
  das oito; e a auto-sabotagem (uma policy e uma função fictícias, na transação desfeita) prova que a
  varredura acusa.
- **SQL, no disco** (mesmo arquivo TS): o corpo vigente de toda função (`corpo-vigente.mjs`) que cita
  uma das oito não cita `empresa_id`.
- Exceções nomeadas numa fonte só: o arquivo TS as declara (`database.ts`) e os roteiros de catálogo
  ficam fora do universo (não estão em `src/**`).

### Decisão 8 — o injetor

**Entram seis mutações** (teto 125 → **131**, com o porquê datado em `mutacoes.test.mts`), cada uma
derrubando uma trava desta fase que nenhum teste de mesa derruba (são estado de banco):

| id | o que quebra | cenário que tem de acusar |
|---|---|---|
| `f63-lote1-default-literal` | `alter column empresa_id set default '00000000-0000-4000-a000-000000000001'::uuid` em `ativos` | `15b` (`catalogo_policies.sql`) |
| `f63-lote1-sem-not-null` | `drop not null` em `movimentacoes` | `15b` |
| `f63-lote1-fk-not-valid` | a FK de `itens` recriada `not valid` | `15b` |
| `f63-lote1-sem-coluna` | `drop column empresa_id` em `anotacoes` | `15b` |
| `f63-backups-ganha-policy` | uma policy de SELECT em `backups_migration` | `4` (`catalogo_policies.sql`, a simetria de `k_sem_select`) |
| `f63-backups-legivel` | `grant select on backups_migration to authenticated` | `6a` (`empresa_no_acervo.sql`) |

Quarentena continua em 2 (2/133 < ⅓).

### Decisão 9 — o instrumento

`docs/f63-evidencias/impressao-acervo.sql`, **o mesmo texto antes e depois**, com UM parâmetro
declarado (a linha `⟵ PARÂMETRO`): o **corte** — o `xmin` do snapshot no instante do "antes"
(`pg_snapshot_xmin(pg_current_snapshot())`: a transação mais antiga ainda em curso; não consome xid e
roda em transação só-leitura). A janela é `count(*)` das linhas com `xmin` a partir do corte
(`age(xmin) <= age(corte)`, aritmética modular de 32 bits).

**O critério que separa atividade normal de reescrita:**
- `relfilenode` igual — **sem exceção**, nos dois bancos (reescrita de tabela é inaceitável);
- ensaio (sem tráfego): os dois md5 **idênticos**;
- produção: os dois md5 idênticos, **ou** diferentes com `0 < janela < linhas` — a atividade do app
  entre o "antes" e o "depois", contada e declarada. **`janela = linhas` é backfill** → rollback
  imediato. `linhas` diferente só se explica por insert/delete do app (a janela conta os inserts).

### Decisão 10 — o describe 5

A fronteira nova: **ver a coluna pelo CATÁLOGO é permitido** (a varredura 9k de `isolamento_tenant.sql`
passa a ver as oito sozinha, e confere `not null` + FK + nenhuma linha nula — `count(*) filter (where
empresa_id is null)` é conferência de completude, não recorte); **comparar `empresa_id` com um VALOR
numa tabela do acervo** (`=`, `<>`, `in`, `any`, `is distinct from`) é **proibido até a F66**. O teste
passa a reprovar esse padrão (e não mais "qualquer menção junto de tabela de negócio", que a 9k já
ultrapassa pelo catálogo), e o cabeçalho do roteiro diz o que a F63 preencheu (as oito) e o que falta
(F64 para as 11, F66 para a leitura).

---

## 5. As migrations, a ordem de apply e a ORDEM DE ROLLBACK

**Apply:** `0159` → `0160` → `0161`, cada uma pelo `apply_migration` do MCP com o `name` sem o
prefixo (`backups_migration`, `empresa_no_acervo_cadastros`, `empresa_no_acervo_movimento`), **ensaio
primeiro**, dentro de 24 h do commit (sonda de deriva).

**Rollback — o inverso, num arquivo só, `supabase/rollback/F63-desfaz.sql`** (ensaiado no CI pelo
roteiro `supabase/tests/f63_rollback.sql`):

1. (`0161`) `drop column if exists empresa_id` em `ativos`, `movimentacoes`, `pendencias_item`,
   `lancamentos_item` (a mesma ordem de lock do app) — a FK e o comentário caem junto; sem reescrita (a coluna fica
   `attisdropped`);
2. (`0160`) o mesmo em `anotacoes`, `termos_gerados`, `itens`, `colaboradores`;
3. (`0159`) `drop table if exists public.backups_migration` — **só se nenhuma migration posterior
   gravou nela** (hoje, nenhuma).

Com `set lock_timeout = '2s'` / `reset`, sem `begin`/`commit` (quem roda decide a transação). O ledger
não é reescrito. **Entre fases:** o rollback da F62 (`F62-*.sql`) exige o da F63 ANTES (achado (a)).
Num banco vivo, o rollback roda pelo `execute_sql` com o conteúdo EXATO do arquivo — a única exceção ao
"`execute_sql` só leitura", e só num desfecho ruim.

A prova do ensaio: o roteiro compara uma impressão de catálogo das oito tabelas (colunas visíveis,
constraints, gatilhos, índices) + a existência de `backups_migration` **depois do rollback** com a
mesma impressão tirada no CI **antes da `0159`** (medida no push das travas vermelhas, que ainda não tem
as migrations, e gravada como constante no roteiro).

---

## 6. As travas e as provas

| peça | onde | nasce |
|---|---|---|
| lote 1 (15a/15b/15c) | `supabase/tests/catalogo_policies.sql` | **vermelha** no CI pelos oito nomes (push das travas) |
| classificador (sabotagem A) e guarda de topo (sabotagem B) | `src/lib/validators/migrations-backfill.test.ts`, `src/lib/itens/migrations-f38.test.ts` | **vermelhos** na mesa (o módulo não existe) |
| ninguém lê (TS) | `src/lib/validators/empresa-acervo-sem-leitura.test.ts` | verde no mesmo commit (varredura), com os casos sintéticos acusando |
| o default, a FK, a armadilha, os instrumentos, o par, a tabela fechada, ninguém lê (SQL) — sabotagens D·E·F·G·I | `supabase/tests/empresa_no_acervo.sql` (novo) | com as migrations |
| a restauração — sabotagem H | `supabase/tests/restauracao.sql` (cenário 8) | com as migrations |
| o rollback | `supabase/tests/f63_rollback.sql` (novo) + `f62_rollback.sql` (o da F63 antes) | a impressão pré-`0159` medida no push das travas |

Todas as recusas provadas duas vezes (a falha e, como `postgres`, o dado intacto), tudo por
`assert_zero_de`, rótulo literal (o injetor lê por token).

---

## 7. Commits e pushes

Commits pequenos, na ordem da ordem: (1) docs — a ordem + este plano + os instrumentos; (2) travas
vermelhas; (3) o classificador e o leitor único; (4) `0159`; (5) as colunas `0160`/`0161`; (6) os
roteiros; (7) os catálogos e os tipos; (8) o injetor; (9) os documentos; (10) a versão. Cada migration
com `npm run db:lock` no mesmo commit.

**Pushes (cota apertada):** **push 1** = commits 1–2 (CI vermelho de propósito: a evidência das
travas e a impressão pré-`0159` para o rollback); **push 2** = o resto; pushes seguintes só para
consertar o que o CI mostrar. PR como rascunho desde o push 1.

---

## 8. SHA de código congelado

**`cdc6dee`** (23/09/2026) — o último commit que toca `src/**`, `scripts/**` ou `supabase/**`, depois das três rodadas
da revisão adversarial (a 3ª sem achado confirmado). Daqui em diante, só `docs/**` e `CHANGELOG.md`. O CI dele é o do §10
do `RELATORIO-F63.md`; o apply nos bancos (Frente G, passos 5 em diante) ficou PENDENTE do conector — se a `main` andar
antes do apply, rebase, CI novo e um SHA novo aqui.

---

## 9. O que este plano NÃO promete

- **Que produção receba a fase nesta run**: o conector está desligado; sem ele, nada é aplicado e o
  PR não é mergeado (caminho B no topo do relatório).
- Isolamento entre empresas no acervo (F66/F72), empresa certa para uma linha nova de outra empresa (o
  default é a WAP até a F67), o classificador ver SQL dinâmico ou escrita por função chamada no apply
  (é leitor estático), nem que um gatilho criado na migration escreva em outra tabela (idem).
