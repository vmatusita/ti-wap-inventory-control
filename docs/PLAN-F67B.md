# PLAN-F67B — Storage e Realtime por empresa

Ordem: [`prompts/F67B-storage-e-realtime-por-empresa-ultracode.md`](prompts/F67B-storage-e-realtime-por-empresa-ultracode.md)
(os 33 fatos no cabeçalho; as decisões do Johnny 16/11-1 e 16/11-2, mais as herdadas 12/11-2, 13/11-1, 13/11-2 e 13/11-3).
Ficha: `PLANO-MULTIEMPRESA.md` §7 → F67B. Branch `f67b-storage-e-realtime-por-empresa`, versão **1.74.0**. Escrito em
16/11/2026, **antes** do primeiro commit que toca `supabase/`, `src/` ou `scripts/`, com o "antes" de PRODUÇÃO já tirado
(§0). O do ENSAIO não pôde ser tirado: o conector recusa o projeto com `28P01` (fato 5, §0.2).

> **Em uma frase.** Cada objeto passa a ter dono: o `.docx` do bucket `termos` pela LINHA de `termos_gerados` que o
> referencia (leitura = membro ativo da empresa da linha; escrita = poder escrever aquele termo; objeto sem linha fechado
> para a sessão), e o backup do bucket `backups-import` pelo CAMINHO, que passa a carregar `empresa-<uuid>` em segundo
> segmento nas quatro famílias (import, reset, conflito, cópias de `.docx`), montado por uma função TS só
> (`src/lib/storage/caminho.ts`) e pelo espelho SQL; os 29 backups antigos ficam legíveis só ao administrador da WAP por
> uma lista FECHADA de formas (decisão 16/11-1); o import usa o client administrativo só para copiar/remover os `.docx`
> depois da RPC (16/11-2); a Zona destrutiva ganha a ferramenta nomeada de órfão; e o Realtime assina com
> `filter: 'empresa_id=eq.<id>'`, com a trava de catálogo da publication. Tudo por EXPANSÃO (o app no ar continua igual)
> e CONTRAÇÃO (só depois do deploy e da janela).

---

## 0. O "antes"

### 0.1 Produção — tirado em 16/11/2026, antes de qualquer apply

Só catálogo, contagem e hash, pelo MCP (`execute_sql` só leitura). Arquivos em `docs/f67b-evidencias/antes/producao/`.
**Nenhum nome de objeto de Storage saiu do banco**: as formas são contadas por regex dentro do SQL
(`docs/f67b-evidencias/antes/formas-storage.sql`).

| arquivo | o que guarda | produção |
|---|---|---|
| `funcoes.tsv` | toda função de `public`: nome, args, `prosecdef`, md5(`prosrc`)[:10], md5(`pg_get_functiondef`)[:10], EXECUTE de anon/authenticated/service_role/PUBLIC | **114** funções (**69** definer); md5 do TSV `42ed9d45…` — a transcrição conferida byte a byte contra o md5 calculado no banco |
| `policies.tsv` | toda policy de `public` e `storage`: md5[:8] de `qual`/`with_check` | **62** (8 em `storage.objects`); md5 do TSV `f8eaf462…` (idem) |
| `contagens.txt` | só números: memberships, ledger, os dois buckets por forma, `termos_gerados`, `import_logs`, `eventos_admin`, buckets, gatilhos e funções de `storage`, a publication | ver §1 (fatos 1, 6, 16, 24) |
| `integridade.txt` | as 13 checagens por `checagens_integridade_nucleo()` (só `chave, total`) | **a linha travada**: `backup_orfao` **12** · `detentor_em_estado_sem_dono` **1** · `arquivo_termo_orfao` **3** · `conflito_entre_filiais` **59** · as outras nove **0** |
| `advisors.txt` | advisors por nível e nome | segurança: INFO 6 `rls_enabled_no_policy`, WARN **38** `authenticated_security_definer_function_executable`, WARN 1 `auth_leaked_password_protection`, ERROR 0 · desempenho: INFO 39 `unindexed_foreign_keys`, 1 `no_primary_key`, 7 `unused_index`, WARN 1 `multiple_permissive_policies` |

O **conta a conta "antes"** (decisão 15) é a fase nova `f67b-antes` de `scripts/perf/conta-a-conta.mjs`: ela nasce com o
instrumento (commit de `scripts/`, depois deste plano) e roda em produção **antes do primeiro apply** — critério 3; a
saída vai para `docs/f67b-evidencias/conta-a-conta/`.

### 0.2 Ensaio — BLOQUEADO (fato 5, confirmado)

Medido em 16/11/2026, na primeira hora da run, quatro vezes: `execute_sql` e `list_migrations` no `sgmvldiizsrjbxzzpmhh`
respondem `FATAL 28P01: password authentication failed for user "postgres"`; `get_advisors` responde *"Project … is
currently hibernated and will wake on next supported request"*; `get_project` diz `ACTIVE_HEALTHY`; `restore_project`
recusa (*"no longer in a paused state"*); duas requisições sem credencial à API REST do projeto (401, para acordá-lo) não
mudaram nada. **Não procurei token, não abri o `.env.local`, não li o Gerenciador de Credenciais.** Pela ordem
("Bloqueios"): **nada vai a produção sem o ensaio antes**. A run entrega tudo o que não depende de banco vivo, com o PR
ABERTO e SEM merge, e o caminho B no topo do relatório — reconferindo o ensaio ao longo da run (§9).

**Reconferências** (só `select 1` pelo `execute_sql`, nenhuma escrita): 5ª, depois do TS e do rollback — `28P01` de novo.

---

## 1. Os 33 fatos, remedidos

Medidos no disco, no git e em PRODUÇÃO (o ensaio está fora, §0.2). Onde a medição contraria o texto, **a medição ganha**
e vai ao relatório. ⚠ = divergência contra a ficha ou contra a ordem.

| # | o que a ordem diz | o que medi | veredito |
|---|---|---|---|
| 1 | `2ad31e9`, `v1.73.0`, última `0193`, primeira `0194`, versão `1.74.0`; PG 17.6 / 17.11; 1 empresa, 14 memberships ativas | idem; ledger de produção com **177** entradas, a última `contracao_assinaturas_antigas` (`20261113134024`); 16 memberships (14 ativas: dev 2, admin 2, operador 5, consulta 5), 6 filiais, 2 `plataforma_admins` | confere |
| 2 | mesa 271/8.589; CI 61/1.248; injetor 170/170, quarentena 2; smoke 109/1/0; conferidor 272/0; 69 definer (38 por `authenticated`); universo 26 | **271** arquivos de teste; **61** roteiros (o 1.248 não está gravado no repositório — sai só do runner do CI); `MUTACOES.length` ≤ **170** (`mutacoes.test.mts:344`), quarentena **2**; **69** definer e o advisor conta **38** executáveis por `authenticated`; `k_escopo_ok` com **26** nomes | confere |
| 3 | o mapa do `CLAUDE.md` bate | os diretórios de topo de `src/lib` e `src/components` e os **14** `CLAUDE.md` aninhados batem; `caminho.ts` nasce em `src/lib/storage/` (existe) | confere |
| 4 | #84: `backup_orfao` 12 (base 10), `detentor_em_estado_sem_dono` 1 (base 0); `arquivo_termo_orfao` 3; `conflito_entre_filiais` 59; nove em 0 | **12 · 1 · 3 · 59 · nove em 0**, hoje em produção; o ensaio não é medível (fato 5). As 12 de `backup_orfao`, por forma: **10 históricas + 2 `reset/…json`** (nenhuma cópia de `.docx`) | confere — é a linha travada |
| 5 | ⚠ o ensaio recusou com `28P01` | **o mesmo, quatro vezes** (§0.2) | ⚠ **BLOQUEIO** — nada vai a produção |
| 6 | 301 objetos `<uuid>.docx`; 298 linhas; 3 sem linha; 0 linhas sem objeto; 0 degenerados; 0 conjuntos com mais de um termo | idem; e **0** `arquivo_path` repetido, **0** nulo, **0** linha fora da legada | confere |
| 7 | as 4 policies de `termos` | idem (texto vivo em `antes/producao/contagens.txt`; `policies.tsv`) | confere |
| 8 | `pode_ler_arquivo_termo` ignora o nome (`0186`) | idem; é a exceção de `definer_sem_tenant.sql:137`, motivo `:157` | confere |
| 9 | `coalesce(…, true)` (`0069`) | idem; índice `termos_gerados_arquivo_path_idx` (btree, NÃO único) existe e cobre o join | confere |
| 10 | degenerado por `e_admin_na(empresa_legada())`; a `0069` documenta o lixo imortal | idem. ⚠ **E as três policies de `termos_gerados`** (`operador insere/atualiza/apaga`, `0175:80–106`) decidem por `pode_escrever_termo(ativo_ids)`: o admin da B NÃO apagaria a LINHA degenerada da B. A correção pela empresa da linha alcança essas três policies (decisão 5) | ⚠ amplia a ficha |
| 11 | `persistirTermo` `:452–541`: upload antes da linha | idem (`:508` upload, `:524` UPDATE, `:530` INSERT, `:536` rollback do INSERT, `:486–505` variantes) | confere |
| 12 | só a porta única remove `.docx`, mais `persistirTermo` | idem; e `scripts/reset.ts:68` (service role, script local, só fictício) — fora de `src/`, não é escritor do app | confere |
| 13 | o passo dos `.docx` do import pela sessão quebra com o join | idem (`importar.ts:805–830`) | confere — decisão 16/11-2 |
| 14 | DELETE direto bloqueado (`protect_objects_delete`) | o gatilho existe em produção (`storage.objects`: `protect_objects_delete`, `update_objects_updated_at`); a doc oficial (post de 05/03/2026) descreve o bloqueio por gatilho de comando, sem citar o nome | confere |
| 15 | o caminho do `.docx` não muda (teto 80) | idem; a with_check de `termos_gerados` força `arquivo_path = id::text || '.docx'` | confere |
| 16 | 29 objetos (22 históricos, 5 `reset/…json`, 2 cópias de reset); `import_logs` 12 (≤ 44); `eventos_admin` 42 com `backup_path` e 44 `ativo_apagado` | idem; **os 22 históricos casam `<slug-de-filial>/<carimbo>.json`** (o 1º segmento é o slug de uma filial existente); **os 7 de reset casam `(acervo|itens)/filial-N`** (0 `global`); os 29 têm carimbo de 24; dos 42 eventos, **35** são de conflito com backup INLINE (`backup_path` nulo) | confere |
| 17 | as 4 de `backups-import` por `e_admin_na(empresa_legada())` | idem | confere |
| 18 | ⚠ quatro famílias | idem, com linhas corrigidas: reset em `dev-destrutivo.ts:421–430`; conflito `conflitos.ts:269–272`; a checagem do digest vigente em `0191:606–610` (a `:314` é da assinatura antiga, derrubada pela `0193`); os resets em `0190:558–562`/`727–731`. Cópias: o import copia pela SESSÃO; reset, conflito e apagar-ativo pelo client ADMINISTRATIVO | ⚠ confirmada |
| 19 | ⚠ a 12ª reconhece as cópias pela forma antiga | idem (`0164`, seção 12): JSON agnóstico; cópias de import/reset pela 1ª regex (passa nas duas formas); `ativo/` e `conflito/` ancoradas no início, e a de conflito chama `prefixo_backup_conflito()` — que a contração derruba: a 12ª nova não pode mais citá-la | ⚠ confirmada |
| 20 | `restaurar.mjs` tem de aceitar as duas formas | ele é AGNÓSTICO de forma (só tira `.json` e soma `/termos/`, `:240–242`; baixa pelo caminho cru, `:421`): aceita as duas sem mudar o código — o teste passa a provar as duas | confere (sem código) |
| 21 | `urlBackup` com a sessão, fechadura no-op | idem; e `import_logs` tem RLS por empresa desde a F66 (`e_admin()` + `empresas_de_admin()`): o admin da B nem LÊ o log da A | confere — decisão 12 |
| 22 | teto 120 do `backup_path`; ≈ 94 | import novo no pior caso (`filial-32767`, carimbo 24): **94** ≤ 120; reset **100**, conflito **116** (parâmetro e `jsonb`, sem teto); cópias até **138** (`storage.objects.name` sem CHECK). Nenhum CHECK da F66B alcança reset ou conflito | confere |
| 23 | ⚠ `storage.foldername` não existe no CI | idem (`bootstrap-storage.sql`); em produção existem `foldername`, `filename`, `extension`, `protect_delete`, `search` | ⚠ confirmada — decisão 3 |
| 24 | publication com 3 tabelas, RLS, `empresa_id`, uma policy de SELECT igual, 0 fora da legada, 0 policies em `realtime.*` | idem em produção (`puballtables=false`; insert/update/delete publicados; replica identity **default** nas três) | confere |
| 25 | ⚠ "RLS na publication" não existe; o Realtime confere a policy de SELECT da tabela por assinante | a doc oficial confirma para INSERT e UPDATE (*"database records are sent only to clients who are allowed to read them based on your RLS policies"*), com uma ressalva que a ordem não traz: **"RLS policies are not applied to DELETE statements"** — o payload de DELETE com replica identity default só carrega a chave primária. O app só assina INSERT. A trava de catálogo passa a exigir também replica identity NÃO-`full` (decisão 13) | ⚠ confirmada, com a ressalva |
| 26 | `RealtimeRefresh` sem props, montado em três Server Components | idem (`[filial]/page.tsx:185` só no modo operador; `itens/page.tsx:281`; `itens/historico/page.tsx:215`) | confere |
| 27 | o `filter` | doc: `coluna=operador.valor`, avaliado no servidor; vários filtros por vírgula (AND) — a ordem diz "um por assinatura": a doc não limita; `uuid` não é citado; DELETE só filtra com replica identity `full` | ⚠ detalhe |
| 28 | ⚠ a catraca TS não tem Storage | idem (6 arquivos, 14 `empresaDaOperacao(` e 6 `EMPRESA_LEGADA_ID`, nenhum de Storage) | ⚠ confirmada — decisão 14 |
| 29 | `definer_sem_tenant.sql`: 26; exceções `estorno_item_coerente`, `termo_ancora_coerente`, `pode_ler_arquivo_termo` | idem | confere |
| 30 | `storage_termo.sql` prova leitura por cargo | idem: `1a`/`1b`/`1c` leem dois objetos SEM linha; `3a` devolve `true` para nome inexistente — as quatro se invertem com o join (declaradas, §7) | confere |
| 31 | o conta a conta tem `emulada|real|f67-antes|f67-depois` | idem; e um defeito latente: `lerPayload` assume `'F66_CONTA '.length` (10) — `'F67B_CONTA '` tem 11 (corrigido junto) | confere |
| 32 | o método; MATRIZ até R-ACC-130; ADR até §17; RUNBOOK até o Anexo F67 | idem | confere |
| 33 | a janela é de COMPORTAMENTO (a), (b), (c) | idem; o molde `pg_stat_statements` da F67 não separa forma de caminho — a medida é a contagem de objetos por forma com `created_at` depois do deploy (decisão 11) | confere |

---

## 2. A tabela-verdade do Storage

**Destinos:** **EXP** (muda na expansão, mesma resposta para o app no ar); **CON** (muda na contração, depois do deploy e
da janela); **=** (não muda).

### 2.1 As 8 policies de `storage.objects` (os nomes NÃO mudam — `k_storage` e as mutações citam por nome)

| policy | hoje (`0129`/`0187`) | expansão | contração |
|---|---|---|---|
| `termos leitura operador` (SELECT) | `bucket_id='termos' and (select pode_ler_arquivo_termo(name))` | = | = (o texto); o CORPO da função vira o join (§2.2) |
| `termos insere operador` (INSERT, with check) | `bucket_id='termos' and (select pode_escrever_na(empresa_legada())) and pode_escrever_arquivo_termo(name)` | = | `bucket_id='termos' and pode_escrever_arquivo_termo(name)` |
| `termos atualiza operador` (UPDATE, using+check) | idem | = | idem |
| `termos apaga operador` (DELETE, using) | idem | = | idem |
| `backups-import leitura operador` (SELECT) | `bucket_id='backups-import' and (select e_admin_na(empresa_legada()))` | `bucket_id='backups-import' and ((select e_admin_na(empresa_legada())) or empresa_do_caminho_backup(name) = any (array (select empresas_de_admin())))` | `bucket_id='backups-import' and (empresa_do_caminho_backup(name) = any (array (select empresas_de_admin())) or (caminho_backup_legado(name) and (select e_admin_na(empresa_legada()))))` — **a cláusula legada FECHADA, só de leitura** |
| `backups-import insere operador` (INSERT) | idem hoje | como a leitura da expansão | `bucket_id='backups-import' and empresa_do_caminho_backup(name) = any (array (select empresas_de_admin()))` |
| `backups-import atualiza operador` (UPDATE) | idem hoje | idem | idem |
| `backups-import apaga operador` (DELETE) | idem hoje | idem | idem |

**Por que a expansão de `backups-import` é a conjunção antiga OU a nova.** Com uma empresa, `empresas_de_admin()` de
quem é admin da WAP contém a WAP e a 1ª parcela já é verdadeira; de quem não é, a 2ª é falsa (nenhum objeto na forma
nova, e a função devolve nula fora dela). Resposta idêntica, membership a membership — o app velho (que grava na forma
antiga) e o novo (forma nova) passam os dois. **Por que as de escrita de `termos` não mudam na expansão:** com o
`coalesce(…, true)` ainda de pé, tirar o piso `pode_escrever_na(empresa_legada())` abriria o objeto sem linha a qualquer
logado (inclusive consulta) — a resposta MUDARIA. O piso sai junto com o `true`, na contração.

### 2.2 As funções que decidem sobre objeto

| função | hoje | depois | lote |
|---|---|---|---|
| `pode_ler_arquivo_termo(text)` definer | `papel_na_empresa(empresa_legada()) is not null` (ignora o nome) | `exists (select 1 from termos_gerados t where t.arquivo_path = p_nome and papel_na_empresa(t.empresa_id) is not null)` — sai das exceções de `definer_sem_tenant.sql` para `k_escopo_ok` (chama a primitiva por empresa) | CON (fato 13: a cópia do import pela sessão quebraria; e o upsert do `persistirTermo` velho exige SELECT) |
| `pode_escrever_arquivo_termo(text)` definer | `coalesce(bool_and(pode_escrever_termo(t.ativo_ids)), true)` | EXP: `coalesce(bool_and(pode_escrever_termo(t.empresa_id, t.ativo_ids)), true)` · CON: o mesmo com `false` | EXP + CON |
| `pode_escrever_termo(uuid, uuid[])` definer — **NOVA**, mesma família, `p_empresa` 1º | — | com ativos: igual à de hoje (`pode_escrever_filial` por ativo); degenerado: `e_admin_na(p_empresa)` — a empresa DA LINHA | EXP |
| `pode_escrever_termo(uuid[])` | degenerado por `e_admin_na(empresa_legada())` | **sai** (`drop function`, sem `if exists`, sem `cascade`) — nada mais a chama depois da EXP | CON |
| `empresa_do_caminho_backup(text)` invoker `immutable` — **NOVA** | — | o `uuid` do 2º segmento quando o nome casa uma das formas NOVAS fechadas (§2.4); NULL fora delas | EXP (lote 1) |
| `caminho_backup_legado(text)` invoker `immutable` — **NOVA** | — | `true` só para as formas ANTIGAS fechadas (§2.4); nunca "qualquer caminho sem empresa" | EXP (lote 1) |
| `prefixo_backup_import(uuid, smallint)` — **NOVA** | — | `'import/empresa-' || p_empresa || '/filial-' || p_filial || '/'` | EXP (lote 1) |
| `prefixo_backup_reset(uuid, text, smallint)` — **NOVA** | — | `'reset/empresa-' || p_empresa || '/' || p_bloco || '/' || (tudo | filial-N) || '/'` | EXP (lote 1) |
| `prefixo_backup_conflito(uuid)` — **NOVA** | — | `'conflito/empresa-' || p_empresa || '/'` | EXP (lote 1) |
| `prefixo_backup_import(smallint)` / `prefixo_backup_reset(text, smallint)` / `prefixo_backup_conflito()` | as formas antigas | **saem** (sem `if exists`, sem `cascade`) | CON |
| `import_validar_plano(jsonb, text, jsonb, smallint)` definer | confere o prefixo antigo | EXP: aceita o prefixo NOVO (empresa da filial, `empresa_da_filial(p_filial)`) **ou** o antigo · CON: só o novo. O resto do corpo byte a byte | EXP + CON |
| `resetar_acervo(uuid, smallint, …)` / `resetar_itens(…)` definer | prefixo antigo | EXP: novo (`p_empresa`) **ou** antigo · CON: só o novo | EXP + CON |
| `apagar_ativos_conflito_filiais(uuid, uuid[], …)` definer | `prefixo_backup_conflito() || digest || '/%'` | EXP: `prefixo_backup_conflito(p_empresa) || digest || '/%'` **ou** o antigo · CON: só o novo | EXP + CON |
| `checagens_integridade_nucleo()` — a 12ª | cópias pela forma antiga; cita `prefixo_backup_conflito()` | reconhece as DUAS formas nas quatro famílias e a família `orfao/` da ferramenta; a forma antiga do conflito pelo literal congelado `'conflito/'` (a função antiga sai na CON); as outras 12 checagens byte a byte | EXP (lote 3) |
| `registrar_limpeza_termos_sem_linha(text, text, text)` definer — **NOVA** | — | a ferramenta de órfão (decisão 9) | EXP (lote 3) |

### 2.3 Escritores e leitores (TS e scripts)

Permissões RLS exigidas pela documentação oficial (fato 13/14, `docs/f67b-evidencias/` cita as páginas): upload sem
`upsert` = INSERT; upload com `upsert: true` = INSERT + SELECT + UPDATE; `copy` = SELECT na origem + INSERT no destino;
`createSignedUrl`/download/`list` = SELECT (bucket privado: *"all operations are subject to access control via RLS"*);
`remove` = DELETE (a doc não o enumera; a resposta `data` lista o que saiu — conferido sempre).

| ponto | client | operação | permissão | depois da F67B |
|---|---|---|---|---|
| `persistirTermo` — INSERT (id novo) | sessão | upload `upsert:true` ANTES da linha | INSERT+SELECT+UPDATE com `coalesce(…, true)` | **linha primeiro**, depois upload `upsert:false` (INSERT, decidido pela linha); falhou → apaga a LINHA |
| `persistirTermo` — UPDATE (id reutilizado) | sessão | upload `upsert:true` → UPDATE da linha | INSERT+SELECT+UPDATE, decididos pela linha que já existe | = (decisão 6: janela declarada) |
| `persistirTermo` — variantes | sessão | apaga LINHAS → `remove` dos arquivos | DELETE com `coalesce(…, true)` (linha já saiu) | **`remove` primeiro** (linha ainda existe), depois apaga só as linhas cujo arquivo saiu |
| `gerarTermo`/`urlTermo` | sessão | `createSignedUrl` | SELECT | pelo join (membro da empresa da linha) |
| import — JSON | sessão | upload `upsert:false` | INSERT | caminho NOVO com a empresa da filial; INSERT pela empresa do caminho |
| import — `.docx` depois da RPC | **sessão** | `copy` + `remove` | SELECT (termos) + INSERT (backups) + DELETE (termos) | **client ADMINISTRATIVO só aqui** (16/11-2), destino na forma nova |
| import — descarte do JSON recusado | sessão | `remove` | DELETE | forma nova, pela empresa do caminho |
| `urlBackup` | sessão | `createSignedUrl` | SELECT | forma nova pela empresa; forma antiga pela cláusula legada (só admin da WAP) |
| reset — JSON | sessão | upload `upsert:false` | INSERT | forma nova (`tudo` no lugar de `global`) |
| reset/apagar ativo/conflito — `.docx` | administrativo | `copy` + `remove` | (service role) | destino na forma nova |
| conflito — JSON (> 25) | sessão | upload | INSERT | forma nova |
| conflito — descarte | administrativo | `remove` | — | = |
| ferramenta de órfão | administrativo | `copy` + `remove` | — | **nova** (decisão 9) |
| `scripts/db/restaurar.mjs` | service role | download pelo caminho | — | agnóstico (fato 20) |
| `scripts/smoke/import-ensaio.ts` | service role | download | — | = (lê o `backup_path` gravado) |
| `scripts/reset.ts` | service role | `list` + `remove` em `termos` | — | = (só fictício, guarda anti-produção) |

### 2.4 As quatro famílias (mais a da ferramenta)

`E` = uuid minúsculo da empresa; `F` = id da filial; `C` = carimbo ISO com `:`/`.` trocados por `-` (24 caracteres);
`D` = digest md5 (32 hex) da seleção; `A` = id do ativo.

| família | forma ANTIGA (fica legível pela cláusula legada) | forma NOVA | montador TS | espelho SQL | quem valida | quem reconhece (12ª) | quem restaura |
|---|---|---|---|---|---|---|---|
| histórica (antes da F52) | `<slug>/C.json` | — (ninguém grava mais) | — | — | — | JSON registrado | `restaurar.mjs` |
| import | `import/filial-F/C.json` | `import/empresa-E/filial-F/C.json` | `caminhoBackupImport(E, F, C)` | `prefixo_backup_import(E, F)` | `import_validar_plano` | JSON registrado | `restaurar.mjs` |
| cópia do import | `import/filial-F/C/termos/<arq>` | `import/empresa-E/filial-F/C/termos/<arq>` | `prefixoDasCopias(raizDoBackupEmArquivo(json))` | — | — | JSON registrado sem `.json` | (só imprime o prefixo) |
| reset | `reset/<bloco>/<global|filial-F>/C.json` | `reset/empresa-E/<bloco>/<tudo|filial-F>/C.json` | `caminhoBackupReset(E, bloco, F|null, C)` | `prefixo_backup_reset(E, bloco, F)` | `resetar_acervo`/`resetar_itens` | JSON registrado | `restaurar.mjs` |
| cópia do reset | `…/C/termos/<arq>` | `reset/empresa-E/…/C/termos/<arq>` | idem | — | — | JSON registrado sem `.json` | — |
| conflito (> 25) | `conflito/D/C.json` | `conflito/empresa-E/D/C.json` | `caminhoBackupConflito(E, D, C)` | `prefixo_backup_conflito(E)` | `apagar_ativos_conflito_filiais` | JSON registrado | `restaurar.mjs` |
| cópia do conflito | `conflito/D/termos/<arq>` | `conflito/empresa-E/D/termos/<arq>` | `prefixoDasCopias(raizDoConflito(E, D))` | — | — | evento `conflito_filiais_resolvido` (digest da seleção + `empresa_id` do evento) | — |
| cópia do apagar ativo | `ativo/A/termos/<arq>` | `ativo/empresa-E/A/termos/<arq>` | `prefixoDasCopias(raizDoAtivo(E, A))` | — | — | evento `ativo_apagado` (`ativo_id` + `empresa_id` do evento) | — |
| cópia da ferramenta de órfão | — | `orfao/C/termos/<arq>` — **sem empresa, de propósito** | `raizDoOrfao(C)` | — | `registrar_limpeza_termos_sem_linha` | evento `termos_sem_linha_limpos` (`detalhe->>'raiz'`) | — |

**A forma nova, como regex fechada** (o que `empresa_do_caminho_backup` aceita; `U` = uuid minúsculo):
`^import/empresa-U/filial-[0-9]+/[^/]+(\.json|/termos/[^/]+)$` ·
`^reset/empresa-U/(acervo|itens)/(tudo|filial-[0-9]+)/[^/]+(\.json|/termos/[^/]+)$` ·
`^conflito/empresa-U/[0-9a-f]{32}/([^/]+\.json|termos/[^/]+)$` · `^ativo/empresa-U/[0-9a-fA-F-]{36}/termos/[^/]+$`.

**A forma antiga, como lista FECHADA** (o que `caminho_backup_legado` aceita):
`^import/filial-[0-9]+/[^/]+(\.json|/termos/[^/]+)$` ·
`^reset/(acervo|itens)/(global|filial-[0-9]+)/[^/]+(\.json|/termos/[^/]+)$` ·
`^conflito/[0-9a-f]{32}/([^/]+\.json|termos/[^/]+)$` · `^ativo/[0-9a-fA-F-]{36}/termos/[^/]+$` ·
`^[a-z0-9][a-z0-9-]*/[^/]+\.json$` cujo 1º segmento não é `import|reset|conflito|ativo|orfao` (a histórica).
As duas listas são **disjuntas** (o 2º segmento `empresa-…` não é dígito, hex de 32 nem uuid; a histórica tem 2
segmentos e as novas ≥ 3). Medido em produção: **os 29 objetos casam a lista antiga** (22 + 5 + 2) e **0** a nova.

---

## 3. A tabela-verdade do Realtime

| tabela | RLS | `empresa_id` | policy de SELECT (a única, `leitura operador`, md5 `cd757cb1` nas três) | linhas fora da legada (produção) | replica identity |
|---|---|---|---|---|---|
| `anotacoes` | ligada, não forçada | sim (`0160`/`0161`) | `(select papel_atual()) is not null and empresa_id = any (array (select empresas_do_membro()))` (`0175:109`) | **0** | default |
| `lancamentos_item` | idem | sim | idem (`0176:88`) | **0** | default |
| `movimentacoes` | idem | sim | idem (`0176:55`) | **0** | default |

| montagem | Server Component? | de onde vem a empresa | depois |
|---|---|---|---|
| `relatorios/[filial]/page.tsx:185` (só modo operador; o visualizador usa `ViewerAutoRefresh`, sem canal — não muda) | sim | — | `empresaDaOperacao()` no servidor → prop `empresaId` |
| `itens/page.tsx:281` | sim | — | idem |
| `itens/historico/page.tsx:215` | sim | — | idem |

O canal continua `wap:relatorio-tempo-real` (`nomeDoCanal`, F70). `realtime.messages`: 0 policies, o app não usa
Broadcast nem Presence (nada muda).

---

## 4. O desenho — as dezoito decisões (e três achadas na execução: 19–21)

1. **A forma do caminho:** família 1º, `empresa-<uuid>` 2º, nas quatro famílias (§2.4); o `global` do reset vira `tudo`
   (o "tudo" é a empresa desde a F67). Função única TS `src/lib/storage/caminho.ts` (uma por família, empresa
   explícita); espelho SQL nos `prefixo_backup_*` NOVOS, de mesmo nome e aridade nova (`p_empresa uuid` 1º), ao lado dos
   antigos, que saem na contração. Teto: o import no pior caso tem 94 ≤ 120. A alternativa "empresa primeiro" perde
   (contradiz a ficha e os `like 'reset/%'`).
2. **A cláusula legada (16/11-1):** a função nomeada `caminho_backup_legado(text)`, lista FECHADA (§2.4), lida pela policy
   e pela 12ª — a mesma definição. **Só LEITURA, só `e_admin_na(empresa_legada())`** — a única exceção nominal da trava
   da legada no Storage. Gravar, atualizar e APAGAR objeto antigo fecha para a sessão na contração: medido, nenhum código
   do app apaga backup antigo (o descarte do import/conflito apaga só o JSON que a MESMA ação acabou de gravar, já na
   forma nova depois do deploy); limpar os órfãos do #84 é entrega avulsa (service role). "Qualquer caminho sem empresa"
   é proibido (sabotagem E).
3. **A empresa do caminho (fato 23):** função `public.empresa_do_caminho_backup(text) returns uuid`, `language sql
   immutable`, `set search_path = ''`, sem `security definer` — devolve o uuid só quando o nome casa uma forma NOVA
   fechada. A policy: `empresa_do_caminho_backup(name) = any (array (select public.empresas_de_admin()))` — o termo
   canônico da F66 (`InitPlan`), sem piso (o piso só existe pareado; aqui nenhum é citado, a trava Q não se aplica). A
   doutrina da F59 classifica a chamada com `name` como R1: as cinco ocorrências entram em `k_excecoes_predicado` com
   `destino: permanente` ("o backup decide pelo próprio name, que carrega a empresa"). `empresas_de_admin()` (membership
   admin/dev) e não `e_admin_na()` por linha: é a doutrina das tabelas — a plataforma sem membership na B não enxerga o
   que é da B pela sessão, como já não enxerga o `import_logs` da B (F69 decide quanto a plataforma vê). O espelho de
   `storage.foldername` no bootstrap perde: seria um segundo lugar para envelhecer.
4. **`termos`, leitura pelo join** — o corpo de §2.2. Custo: o índice `termos_gerados_arquivo_path_idx` já existe (fato 9),
   a função é chamada uma vez por objeto (a policy usa o falso içamento da `0129`, já exceção R1); nenhuma migration de
   índice.
5. **`termos`, escrita:** `pode_escrever_termo(uuid, uuid[])` NOVA (o degenerado pela empresa DA LINHA,
   `e_admin_na(p_empresa)`; com ativos, igual à de hoje); as três policies de `termos_gerados` passam a
   `pode_escrever_termo(empresa_id, ativo_ids)` (fato 10 ⚠ — sem isso o admin da B não apaga a LINHA degenerada da B);
   `pode_escrever_arquivo_termo` delega à nova; o `coalesce(…, false)` e o fim do piso das três de Storage na contração.
   Na expansão, a resposta para a WAP é a mesma (toda linha é da legada; o degenerado decide por `e_admin_na(legada)` nas
   duas). O nome é o mesmo com aridade nova (o molde F67): `k_recorte_classe` e `k_excecoes_predicado` continuam casando
   por nome; a sobrecarga vive só entre a expansão e a contração (a asserção 2 de `catalogo_secdef.sql` vale depois dela,
   como na F67).
6. **`persistirTermo`** (movido para `src/lib/termos/persistir.ts`, módulo `server-only` — testável sem virar Server
   Action): **INSERT** = linha → upload `upsert:false` → se o upload falhar, apaga a LINHA; se isso também falhar,
   `registrarFalha` com o id (a 3ª checagem, `termo_sem_arquivo`, é a rede). **UPDATE** = (a) upload `upsert:true` →
   UPDATE: a linha já existe e já referencia o caminho, então NUNCA há objeto sem linha nem linha sem objeto; a janela é
   "arquivo novo, colunas descritivas antigas" se o UPDATE falhar depois do upload — declarada, mínima, e o próximo
   `gerarTermo` do mesmo conjunto regrava os dois. **Variantes**: `remove` dos arquivos ENQUANTO as linhas existem (o
   `data` do `remove` é conferido), depois apaga só as linhas cujo arquivo saiu; arquivo que não saiu deixa a variante
   inteira de pé (par válido, sem órfão). `upsert:true` exige INSERT+SELECT+UPDATE (doc oficial).
7. **O passo dos `.docx` do import (16/11-2):** `createAdminClient()` criado SÓ depois de `exigirAdmin` e da RPC
   concluída, passado a `copiarEntaoRemoverTermos`. `importar.ts` entra em `superficie-admin.test.ts` ("a linha já saiu;
   a sessão não alcança mais o objeto" · guarda: `exigirAdmin` + a RPC concluída). Nada mais do import muda de client.
8. **As RPCs que conferem o caminho:** na expansão aceitam a forma NOVA (empresa = `p_empresa`; no import, a da filial,
   que `importar_ativos_substituir` já confere contra `p_empresa`) **ou** a antiga; na contração, só a nova. O resto do
   corpo byte a byte (o diff no cabeçalho de cada migration, gerado do corpo vigente). A mensagem continua a mesma frase
   e lexicalmente disjunta entre import e reset.
9. **A ferramenta de órfão:** RPC `registrar_limpeza_termos_sem_linha(p_raiz text, p_confirmacao text, p_justificativa
   text) returns text[]`, `security definer`, guarda **`e_plataforma()`** (um objeto sem linha não tem empresa: só a
   plataforma — 13/11-1, "dev sou só eu"), SQL fixo: confere a raiz (`^orfao/<carimbo>$`), conta os objetos de `termos`
   sem linha AGORA, exige a confirmação digitada `LIMPAR <N> ARQUIVOS DE TERMO`, grava `eventos_admin`
   (`termos_sem_linha_limpos`, `detalhe` com a raiz e a lista) e devolve a lista. A Server Action (só dev) copia e remove
   exatamente essa lista pela porta única, com o client administrativo da Zona, para `orfao/<carimbo>/termos/`. A trilha
   vem ANTES da cópia, na mesma transação da contagem: a cópia nunca existe sem a trilha que a 12ª reconhece; o que não
   copiar fica em `termos` (a 8ª continua contando). A raiz `orfao/` não casa nem a forma nova nem a antiga: a sessão
   nunca a alcança, só o service role. Entra em `definer_sem_tenant.sql` como exceção nominal (recebe `text`, a guarda é
   a plataforma, não uma empresa), com motivo.
10. **Os lotes e a fronteira** — §5. Teste "o app no ar continuaria funcionando com isto aplicado?": não → contração.
11. **A janela por contagem de objetos:** T0/T1 = contagem por bucket e por forma (antiga/nova/fora) com
    `created_at > <deploy>`, só número. Condição: **nenhum objeto NOVO numa forma antiga** depois do deploy. Até três
    janelas em 2 h; persistiu → contração PENDENTE (repouso válido: as duas formas convivem).
12. **`urlBackup`:** a fechadura de pertencimento fica como está (no-op até a F70), com o comentário corrigido: medido,
    duas camadas REAIS já fecham o backup de outra empresa — a RLS de `import_logs` por empresa (F66: o admin da B nem lê
    o log da A) e, desde a F67B, a policy de SELECT de `backups-import` pela empresa do caminho (o `createSignedUrl` exige
    SELECT). Dar corpo à fechadura é a F70 (a empresa da sessão).
13. **O Realtime:** a empresa sai de `empresaDaOperacao()` nos três Server Components (+3 entradas na catraca, destino
    F70) e chega a `RealtimeRefresh` por prop; `opcoesDaAssinatura(table, empresaId)` valida o uuid (recusa vazio ou
    malformado) e emite `filter: 'empresa_id=eq.<id>'`. "Provadamente total" hoje: 0 linhas fora da legada nas três
    tabelas em produção. A "RLS na publication" da ficha é a RLS de SELECT da TABELA (a doc oficial); a trava de catálogo
    (§9 estendido em `catalogo_policies.sql`) exige de toda tabela da publication: RLS ligada, `empresa_id`, policy de
    SELECT com o recorte da F66 (pela FORMA — o mesmo analisador da 16a) e replica identity NÃO-`full` (o DELETE não
    passa pela RLS — com `full` e a RLS DESLIGADA, a linha velha inteira iria a todo assinante; com a RLS ligada, a doc
    oficial garante só a chave primária: a 9e é defesa em profundidade, corrigida assim na execução). `nomeDoCanal` não muda.
14. **A trava da legada no Storage:** de CATÁLOGO, em `storage_por_empresa.sql` (bloco L): nenhuma policy de
    `storage.objects` e nenhuma função da tabela-verdade do Storage (§2.2) cita `empresa_legada()`, fora da exceção
    nominal (a cláusula da 16/11-1 em `backups-import leitura operador`, com motivo). A catraca TS só muda pelas três
    páginas do Realtime.
15. **O conta a conta `f67b-antes|f67b-depois`:** por membership ativa (claims dentro do banco), conta, por classe de
    objeto (termos com/sem linha; backups na forma antiga/nova/fora), quantos objetos ela LÊ (a RLS de verdade, papel
    `authenticated`) e quantos cada policy de escrita deixaria INSERIR/ATUALIZAR/APAGAR (o predicado VIVO lido de
    `pg_policy` e avaliado com as claims dela), mais as linhas de `termos_gerados` que as policies de escrita deixam
    apagar/atualizar. Devolve só contagens por posição ordinal e o md5 do conjunto de memberships (para casar antes ×
    depois sem expor id). Divergências DECLARADAS, só depois da CONTRAÇÃO: os 3 `.docx` sem linha (leitura e escrita,
    exatamente 3 por membership que os alcançava) e a escrita nos 29 backups antigos (só admin/dev — decisão 2).
    Qualquer outra é bloqueio. A sabotagem I prova que o bloco acha divergência.
16. **O injetor:** uma mutação por classe de trava nova que nenhum teste de mesa derruba — as sete candidatas da ordem
    mais "a escrita volta a aceitar a forma antiga" e "o degenerado aberto a qualquer admin" (§7). Teto **170 → 179**.
    *(Medido na execução: **12** mutações, teto **170 → 182** no número exato, e **+2** da revisão adversarial (a 9d e a 9c
    da publication): **184** — a idade mínima da ferramenta de órfão
    (decisão 19), a 12ª reconhecendo cópia sem trilha e a gravação sem a empresa do caminho entraram, cada uma medida
    DETECTADA na mesa PGlite antes do push: `docs/f67b-evidencias/E-mutacoes/`. As mutações ANTIGAS que miravam os corpos
    que a 0195/0199 recriam com `create or replace` passaram a `mutarFuncao`, com o trecho da forma nova.)*
17. **O rollback:** `supabase/rollback/F67B-desfaz.sql`, GERADO das migrations (os corpos e as policies de antes da
    `0194`, byte a byte), idempotente nos dois estados (só expansão; expansão + contração). Ordem: primeiro devolve a
    aceitação da forma antiga e o `coalesce(…, true)` (o que a contração tirou), depois o resto. Depois do rollback a forma
    antiga volta a ser a ÚNICA aceita na escrita; um backup gravado na forma nova continua no bucket, legível só pelo
    service role (a policy antiga não o alcança pela sessão) — hoje são **0** (nenhum objeto se move). Nenhum dado se perde.
18. **As frases:** as recusas novas do Storage chegam pela API dele (403 *"new row violates row-level security policy"* no
    upload; objeto invisível = *"Object not found"* no `createSignedUrl`), não por SQLSTATE: traduzidas no ponto de
    chamada por `traduzirErroStorage` (`erros-do-banco.ts`), uma frase por classe, sem caminho nem valor de linha: *"Este
    arquivo é de outra empresa ou não existe mais."* (leitura), *"Você não pode gravar este arquivo: ele é de outra
    empresa ou de um registro que você não pode alterar."* (escrita — a frase serve aos dois buckets; a do plano falava
    só de "registro", e o backup não tem registro). As RPCs mantêm as frases de hoje (o prefixo esperado, da própria
    empresa).
19. **A idade mínima da ferramenta de órfão** *(achada na execução, 16/11)*: a lista de `registrar_limpeza_termos_sem_linha`
    só leva `.docx` sem linha há **mais de 1 hora** (`o.created_at < now() - interval '1 hour'`). Sem isso, durante a
    janela entre a expansão e o deploy o código anterior à F67B sobe o arquivo ANTES da linha, e um termo no meio da
    gravação entraria na lista — copiado e removido segundos antes de a linha dele nascer. A `0196` foi corrigida ANTES de
    qualquer apply (nenhum banco vivo a tem; o lock regravado no commit da correção, registrado na ata). Provado por O4 e
    pela mutação `f67b-orfao-lista-o-recem-nascido`. A tela mostra a contagem da 8ª checagem; se ela diferir da de 1 hora,
    o banco recusa e a mensagem diz o número de agora (nada é apagado).
20. **O verbo novo na trilha** *(achado na execução)*: `termos_sem_linha_limpos` entra em `ACOES_ADMIN`/`ACAO_ROTULO`
    (`src/lib/auditoria.ts`) e em `ACOES_DESTRUTIVAS`, e o comment de `eventos_admin.acao` é REEMITIDO por inteiro na
    `0196` (o teste "o comment lista os mesmos verbos" o exige; o rollback devolve o da `0139`).
21. **O painel da ferramenta** *(achado na execução)*: um card "Arquivos de termo sem registro" na Zona destrutiva, com a
    contagem da 8ª checagem lida no servidor e o `DialogoDestrutivo` de sempre (frase `LIMPAR <N> ARQUIVOS DE TERMO`,
    justificativa). A Server Action `limparTermosSemLinha` chama a RPC e copia/remove só a lista devolvida, com o client
    administrativo (declarado em `superficie-admin.test.ts`).

---

## 5. As migrations, a fronteira e a ORDEM DE ROLLBACK

| # | arquivo | lote | o que faz | classe |
|---|---|---|---|---|
| 1 | `0194_caminho_backup_por_empresa.sql` | expansão | `empresa_do_caminho_backup`, `caminho_backup_legado`, os três `prefixo_backup_*` novos | ADITIVA |
| 2 | `0195_backups_import_por_empresa_expansao.sql` | expansão | as 4 policies de `backups-import` (antiga OU nova); `import_validar_plano`, `resetar_acervo`, `resetar_itens`, `apagar_ativos_conflito_filiais` aceitando as duas formas | ADITIVA |
| 3 | `0196_backup_orfao_duas_formas.sql` | expansão | a 12ª reconhece as duas formas e a família `orfao/`; `registrar_limpeza_termos_sem_linha` | ADITIVA |
| 4 | `0197_termo_pela_empresa_da_linha.sql` | expansão | `pode_escrever_termo(uuid, uuid[])`; `pode_escrever_arquivo_termo` delega a ela (ainda `true`); as 3 policies de `termos_gerados` | ADITIVA |
| 5 | `0198_contracao_termos_pela_linha.sql` | **contração** | `pode_ler_arquivo_termo` pelo join; `coalesce(…, false)`; as 3 de escrita de `termos` sem o piso; `drop pode_escrever_termo(uuid[])` | ADITIVA (o classificador calcula assim para `create or replace`/`alter policy`/`drop function`) |
| 6 | `0199_contracao_backups_por_empresa.sql` | **contração** | as 4 de `backups-import` na forma final (cláusula legada só de leitura); as 4 RPCs só a forma nova; `drop` dos três `prefixo_backup_*` antigos | ADITIVA (idem) |

**Por que cada item da contração quebraria o app velho (fato 33).** `0198`: (a) o `persistirTermo` velho sobe o `.docx`
ANTES da linha — com `false` o upload é recusado; e o `upsert:true` exige SELECT, que pelo join falha sem linha; (c) o
import velho copia o `.docx` pela SESSÃO depois da RPC — sem a linha, o SELECT da origem falha e o `.docx` vira órfão.
`0199`: (b) o app velho grava backup na forma antiga — a policy de escrita e a checagem do prefixo nas RPCs o recusariam.

**O apply.** CI: a cadeia inteira. Ensaio: a cadeia inteira (lá a contração não espera deploy). Produção: `0194`–`0197`
ANTES do merge (dentro de 24 h do commit), lote a lote, cada um seguido das provas; `0198` e `0199` só DEPOIS do deploy e
da janela (decisão 11). **Nesta run o ensaio está fora (§0.2): nada vai a produção.**

**A ORDEM DE ROLLBACK** (a inversa; no rodapé de cada migration e é a ordem de `F67B-desfaz.sql`): `0199` (as 4 de
`backups-import` voltam a aceitar a forma antiga; as RPCs com as duas formas; os três `prefixo_backup_*` antigos de
volta) → `0198` (`coalesce(…, true)`, o piso, a leitura por cargo, `pode_escrever_termo(uuid[])` de volta) → `0197` (as 3
policies de `termos_gerados` de volta; a 2-arg sai) → `0196` (a 12ª antiga; a RPC de órfão sai) → `0195` (as 4 policies
e as 4 RPCs de antes) → `0194` (as cinco funções novas saem). **Entre fases:** o da F67B vem ANTES do da F67 (e, por ele,
dos da F66B, F66, F65, F64, F63, F62): os roteiros `f6x_rollback.sql` ganham `\ir ../rollback/F67B-desfaz.sql` antes de
cada `\ir ../rollback/F67-desfaz.sql`.

---

## 6. Travas e provas

| trava | nasce | prova |
|---|---|---|
| `supabase/tests/storage_por_empresa.sql` (novo) | vermelha no commit das travas | duas empresas fictícias, as policies REAIS: termos (A×B nos dois sentidos, sem linha fechado, degenerado da A pelo admin da A e não da B), backups (A×B, operador/consulta, fora de forma, a cláusula legada só ao admin da WAP e só de leitura), a trava da legada (bloco L), a família `orfao/` |
| `src/lib/storage/caminho.test.ts` (novo) | vermelho | toda função exportada põe `empresa-<uuid>` no 2º segmento (exceção nominal: `raizDoOrfao`); varredura de `src/**` e `scripts/**` por montagem fora dela; o espelho SQL (corpo vigente) bate com o TS |
| `assinatura-realtime.test.ts` (estendido) | vermelho | `filter` sempre, uuid validado, o componente não monta por fora |
| `catalogo_policies.sql` §9 (estendido: 9c–9e) | verde (catálogo) | RLS, `empresa_id`, o recorte pela forma, replica identity |
| `definer_sem_tenant.sql` | vermelho | `pode_ler_arquivo_termo` sai das exceções (entra em `k_escopo_ok`); a de órfão entra como exceção |
| 12ª nas duas formas (`storage_por_empresa.sql`, bloco D) | vermelho | backup novo + trilha não conta; antigo + trilha não conta; sem trilha conta, nas duas |
| `persistir.test.ts` (novo) | vermelho | a ordem e o rollback nos dois ramos e nas falhas, com o client simulado |
| `superficie-admin.test.ts` | vermelho até o import declarar | o client administrativo só no passo dos `.docx` |
| injetor | — | catorze mutações novas (§4, 16), medidas DETECTADAS na mesa |
| `f67b_rollback.sql` (novo) + `rollback-f67b.test.ts` | — | os dois estados contra a impressão do CI antes da `0194` |

As sabotagens A a J da ordem saem do CI (roteiros e injetor) e da mesa; a I (conta a conta sabotado) e a J (rollback em
banco vivo) dependem do ensaio — **bloqueadas nesta run** (§0.2): a J é provada no CI (`f67b_rollback.sql`).

---

## 7. Roteiros e testes que mudam por causa do comportamento (nenhuma asserção muda para passar)

| arquivo | por quê | o que muda |
|---|---|---|
| `storage_termo.sql` | `1a`/`1b`/`1c` liam objetos SEM linha; `3a` dava `true` para nome inexistente | a fixture planta a LINHA dos objetos lidos; um objeto sem linha passa a ser provado NÃO lido; `3a` vira "nome sem linha → `false`" (declarado) |
| `dev_destrutivo.sql` | caminhos de reset montados à mão na forma antiga | a forma nova, montada à mão (de propósito, como antes) |
| `conflito_filiais.sql`, `import_substituir.sql`, `troca.sql`, `comprimento_comportamento.sql`, `import_fora_da_unidade.sql` | chamam `prefixo_backup_*` antigos (que saem) | os novos, com a empresa |
| `papeis_rls.sql`, `cargo_dev.sql`, `integridade_alarme.sql` | objetos de nome solto em `termos`/`backups-import` | conferir caso a caso; o que provava leitura por cargo passa a provar pelo dono |
| `catalogo_policies.sql` | exceções R1, `k_funcoes_acesso`, `k_recorte_classe` | as cinco R1 novas; o destino da de leitura vira permanente |
| `catalogo_secdef.sql` | definer nova | `registrar_limpeza_termos_sem_linha` em `k_secdef` |
| `f62`…`f67_rollback.sql` | a F67B no lugar | `\ir ../rollback/F67B-desfaz.sql` antes de cada `F67-desfaz` |
| mesa: `import-confirmacao-sql`, `conflitos`, `copiar-antes-de-remover`, `restaurar-guarda`, `backup-completude`, `empresa-legada-catraca`, `migrations-f38`, `rollback-f67`, `policies-initplan`, `catalogos-seguranca`, `mutacoes`, `pertencimento` | o caminho, os montadores, as entradas novas | cada um no commit da mudança que o exige |

---

## 8. Commits e pushes

Na ordem da ordem: (1) docs (a ordem, este plano, o "antes"); (2) o instrumento do conta a conta; (3) as travas
vermelhas; (4) cada lote de expansão, um commit por migration, com `db:lock`; (5) o TS; (6) roteiros adaptados, rollback;
(7) injetor; (8) a contração; (9) documentos; (10) versão. Pushes agrupados: um para o PR em rascunho com as travas
vermelhas, um com a fase inteira.

## 9. O SHA de código congelado

Registrado aqui quando a revisão adversarial terminar: o último commit que toca `src/**`, `scripts/**` ou `supabase/**`.

## 10. O que este plano NÃO promete

- O apply em banco vivo, enquanto o ensaio responder `28P01` (§0.2): a ordem proíbe produção sem ensaio.
- Que o Realtime entrega só a linha da empresa a um assinante REAL de outra empresa (não há segunda empresa nos bancos
  vivos): provado pela doc oficial, pelo catálogo e pela RLS de SELECT no CI.
- Que a ferramenta de órfão funciona em produção: entregue, provada no CI e na mesa, NÃO executada.
- Que uma linha nova de outra empresa recebe a empresa certa: o default é a WAP até a F67C.
- Nada sobre os dados do #84.
