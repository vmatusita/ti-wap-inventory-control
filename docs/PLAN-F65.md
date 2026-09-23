# PLAN-F65 — Integridade estrutural do tenant

> Plano de execução da ordem `docs/prompts/F65-integridade-estrutural-do-tenant-ultracode.md` (F65 do
> `PLANO-MULTIEMPRESA.md` §7, a quarta da virada). Escrito **antes** do primeiro commit que toca `supabase/`, `src/` ou
> `scripts/`, como a Frente A exige. Versão da fase: **`1.70.0`**. Branch: `f65-integridade-do-tenant`.
>
> Régua de decisão (a da ordem, nesta ordem): (1) medição própria contra o disco e os bancos de hoje; (2) as três
> decisões do Johnny de 23/09 (os índices de lista vão para a F66; `guarda_empresa()` em TODA tabela de negócio, sem
> exceção na janela; o seed de duas empresas sai para o backlog); (3) a ficha F65; (4) a ordem; (5) as convenções do
> repositório e o molde da F64; (6) o mais simples e reversível.

---

## 0. O "antes" — tirado na Frente A, com o conector de pé

O conector da Supabase respondeu desde o começo da run (`list_projects`: produção `pbtjcalbmepmrqzprusb` e ensaio
`sgmvldiizsrjbxzzpmhh`, os dois `ACTIVE_HEALTHY`, PostgreSQL 17.6). O "antes" foi tirado nos DOIS bancos, só leitura,
antes de qualquer apply, em `docs/f65-evidencias/antes/`:

| instrumento | o que imprime | resultado |
|---|---|---|
| `contagem-violacoes.sql` | por FK composta futura (as 23, conferidas contra o catálogo), os filhos cujo `(empresa_id, x)` não existe no pai; por unique por empresa (os 21, com os sete pais), os grupos duplicados; em `termos_gerados`, os termos com id de outra empresa ou inexistente | **0 em tudo, nos dois bancos**; 1 empresa; 23 FKs no catálogo, nenhuma fora da contagem |
| `impressao-tenant.sql` | por tabela das 20: a PK do catálogo, a CHAVE estável (a PK sem `empresa_id`), linhas, `relfilenode`, md5 de `(chave, xmin)`, md5 do conteúdo, janela | gravado; `corte_para_o_depois` ensaio 13298 · produção 26088 |
| `impressao-catalogo.sql` | as FKs (58 que tocam as 20; 23 de negócio, 23 simples, 0 compostas), os 37 uniques/PKs (1 com `empresa_id`), os pais `(empresa_id, id)` (1: `filiais`), os 8 gatilhos, o md5 das 103 funções e das 102 que a fase não pode tocar, as 12 advisory (16 chamadas reais) | **md5 idênticos nos dois bancos** |
| `docs/f64-evidencias/impressao-policies.sql` (reusado) | as 62 policies (54 + 8), byte a byte | idênticas nos dois; 0 citam `empresa_id` |
| `get_advisors` | segurança e performance, por nível e nome | segurança 6 INFO · 34 WARN · 1 WARN (os dois); performance 31 `unindexed_foreign_keys` (19 `*_empresa_id_fkey`), 1 `no_primary_key`, 8/11 `unused_index`, 1 `multiple_permissive_policies` |

A contagem de violações e a impressão "antes" são **refeitas** logo antes do apply de cada banco (Frente G, passo 5).

---

## 1. Os 28 fatos, remedidos

Cinco frentes paralelas de exploração (resumos só com números; nenhuma abriu o `.env.local`; as que foram ao banco só
leram catálogo, contagem e hash) e eu. "=" bate com o fato; **⚠** diverge (a medição ganha e vai para o relatório).

| # | o fato diz | medi (23/09) | |
|---|---|---|---|
| 1 | `main` em `469632b`, tag `v1.69.0`; 163 arquivos `0001`→`0164`, gap `0029`; ledger prod 148 · ensaio 161; PG 17.6; primeira da fase `0165` | = tudo (ledger termina em `kit_motivo_da_empresa` nos dois) | = |
| 2 | 254 arquivos, 7.693 testes; 46 roteiros, 1.045 asserções; injetor 138/138 + 2; `db:types:diff` 38 · 358 · 94; `k_*` 20/9/6/8/11 +2 +2; 62 policies; paridade 11 classes | `npm run test` na linha de base: **254 arquivos, 7.693 testes, verdes**; `MUTACOES` 140 entradas, 138 no lote ativo + 2 em quarentena; os `k_*` batem; 38/358/94 pelo parser; 62 policies | = |
| 3 | advisors de produção: seg. 6/34/1; perf. 31 `unindexed_foreign_keys` (18 `*_empresa_id_fkey`), 1, 8, 1 | = segurança nos dois bancos; ⚠ **19** das 31 são `*_empresa_id_fkey` (não 18); ensaio com 11 `unused_index` (uso de índice é por ambiente) | = · ⚠ |
| 4 | 63 FKs; 23 entre tabelas de negócio, simples, validadas, MATCH SIMPLE, NO ACTION; ficha erra em `ativos` e `termos_gerados` | = 63 (md5 idêntico nos dois bancos) e as 23 exatas; ⚠ **`pendencias_item_movimentacao_id_fkey` é `DEFERRABLE INITIALLY DEFERRED`** (`0050:43`) — a única das 23; a composta TEM de preservar (o gatilho de `movimentacoes` abre a pendência antes de a movimentação existir) | = · ⚠ |
| 5 | sete pais sem `unique (empresa_id, id)` + `motivos` | = (só `filiais_empresa_id_uidx` e `membros_empresa_id_uidx` existem) | = |
| 6 | 7 FKs citadas por nome em `formas/**` e `relatorios/estoque.ts`; ~25 embeds sem dica | = os 7 nomes, **13 sítios, todos em `src/lib/queries/formas/**`** (⚠ `estoque.ts` só tem dica para `profiles`); **25** sem dica exatos; **zero dica por coluna**; só **11 das 23** FKs são exercitadas por embed; o único par de negócio com duas relações é `movimentacoes→filiais` (origem e destino), sempre com dica; **nenhuma das 23 é um-para-um** (`database.ts`: só `plataforma_admins`), então a composta não muda cardinalidade de embed | = · ⚠ |
| 7 | a lista de uniques globais (13 + snapshot), 3 de expressão, 2 parciais | = 13/13, os três de expressão, os dois parciais, os "implícitos" | = |
| 8 | os dois uniques do snapshot; `gerados.ts:164/172/189`; `chave-versao-sql.test.ts` lê 0010/0013 | = ; e o `max(versao)+1` mora em `actions/relatorios.ts:139` (`lerUltimaVersao`, sem empresa) — backlog F67 | = |
| 9 | nomes são contrato; `CONSTRAINTS_TRADUZIDAS` 17 entradas; a réplica do teste | = (6 check, 9 índice-único, 2 unique-implícita); a réplica aplica os eventos na ordem do texto (`drop`→`create`→`rename` preservam o nome); ⚠ o campo `tipo` **não é lido** pelo teste — drift silencioso (a F65 o amarra, decisão 4) | = · ⚠ |
| 10 | o único `ON CONFLICT` que quebra: `colaboradores.ts:299-308`; `seed.ts:886`; funções SQL só `(empresa_id, membro_id, filial_id)` e `(ip)` | = (linha 307) | = |
| 11 | `motivos` PK `(codigo)`, 14 · 13; a FK citada por nome em 2 embeds; leitores por código | = ; ⚠ `admin.ts:760-763` é **UPDATE** por `.eq('codigo')` sem `.single()` — com duas empresas, escrita cruzada muda (backlog F67, mais grave que os leitores) | = · ⚠ |
| 12 | vocabulário do import 7 · 5 · 17 nos dois | = ; `lerVocabularioImport` lê as tabelas INTEIRAS (mistura de catálogos com duas empresas — F67) | = |
| 13 | gatilhos das 20; `guarda_acervo` abre na janela | = (8 gatilhos em 6 das 20; `guarda_acervo` sem segunda barreira com a janela aberta); nenhuma função de gatilho atribui `new.empresa_id` nem `new :=` | = |
| 14 | a transferência grava `ativos.filial_id` do formulário | = (`movimentacao_transicionar`, `0150:373-376`, definer) | = |
| 15 | a diagonal global que vaza nome | = (`0139:349-355`: `v_outra.nome` de qualquer filial do sistema); ⚠ a camada `erros.ts` já generaliza a frase na TELA — o vazamento é no `raise` (logs, PostgREST) | = · ⚠ |
| 16 | `termos_gerados` 123 · 2, sem FK, `persistirTermo` reusa o id | = ; 0 termos com id de outra empresa ou inexistente nos dois bancos; o UPDATE de `persistirTermo` reenvia `movimentacao_ids`/`ativo_ids` (o objeto `linha` inteiro) | = |
| 17 | ids `smallint`; queimados 139/20/40; 29 funções com parâmetro smallint; 19 colunas | = tipos e sequências de produção (ensaio: 1674/76/54, churn dos roteiros); 19 colunas; ⚠ "29 funções" não reproduzido (20 por `proargtypes`, 25 com saídas, 31 com retorno) | = · ⚠ |
| 18 | 14 chamadas advisory em 12 funções | ⚠ **16 chamadas reais** (sem comentário) em 12 funções: `resetar_acervo` e `resetar_itens` têm **3** cada (loop + sentinela `-1` + `else`); 17 ocorrências textuais (uma em comentário de `apagar_ativos_conflito_filiais`) | ⚠ |
| 19 | o "pronto quando" contra a regra 2 | = (`ativos_patrimonio_service_tag_uidx` por filial desde a `0091`) | = |
| 20 | oito roteiros com segunda empresa | ⚠ **cinco** criam empresa de verdade (`cargo_dev`, `cargo_equivalencia`, `isolamento_tenant`, `kit_motivo_da_empresa`, `restauracao`); `catalogo_policies` só lê; `empresa_no_acervo`/`empresa_no_vocabulario` usam um uuid fantasma. Fixture a adaptar: **uma**, `restauracao.sql:535-536` (ativo da empresa B na filial da WAP). E mais uma que a medição achou: o **C5** de `kit_motivo_da_empresa.sql` troca a empresa de um kit — passa a ser recusado pela `guarda_empresa` (42501), que dispara antes do gatilho do kit (ordem alfabética); o `update … set empresa_id = <a mesma>` de `empresa_no_acervo` 3b e `empresa_no_vocabulario` 3a NÃO muda de empresa, e a guarda o deixa passar (a asserção continua valendo) | ⚠ |
| 21 | a trava "ninguém lê" em três partes | = ; ⚠ **furo medido**: uma função de GATILHO numa tabela do lote que lê `new.empresa_id` sem citar a tabela no corpo (a forma de `guarda_empresa`) escapa do predicado de hoje — a F65 o fecha (decisão 12) | = · ⚠ |
| 22 | apply atômico; `concurrently` proibido; tamanhos | = (produção: `movimentacoes` 3.631 / 4,9 MB, `ativos` 1.649 / 2,2 MB); `lancamentos_item` no ENSAIO com 49,7 MB para 35 linhas (inchaço dos roteiros) | = |
| 23 | o classificador | = (`drop constraint`, `rename constraint`, `alter index … rename`, `drop index` sem cascade, `create trigger`, `create or replace function` = ADITIVA; o comentário em `:675` diz que `rename constraint` não mexe em dado) | = |
| 24 | "nenhuma tupla reescrita" provável; contagem de violações | = — `add constraint` de FK/unique/PK só VARRE (doc do PG 17, `sql-altertable.html`); a contagem deu 0 | = |
| 25 | ADR-003 + RUNBOOK | = | = |
| 26 | conferência e credenciais | não medido de propósito — **ninguém abriu o `.env.local`** | — |
| 27 | rollbacks encadeados | = (`\ir`, relativo a `supabase/tests/`); ⚠ e o `drop column empresa_id` dos rollbacks F62/F63/F64 e da mutação `f64-lote2-sem-coluna` **passa a falhar** depois da F65 (o gatilho `UPDATE OF empresa_id` e as FKs compostas dependem da coluna) — o rollback da F65 ANTES é necessidade, não cortesia | = · ⚠ |
| 28 | regras e a regra 6 | doc do PG 17 lida direto (`sql-altertable`, `explicit-locking`, `sql-insert` §ON CONFLICT, `sql-createtrigger`); PostgREST v12/v13 (`resource_embedding`: "respecting composite keys"; dica pelo NOME da FK) | = |

**Achados que o cabeçalho da ordem não tinha:** (a) a FK diferida (fato 4); (b) o furo do `new.empresa_id` em gatilho
(fato 21); (c) o C5 do kit (fato 20); (d) o `drop column` que passa a exigir o rollback da F65 antes (fato 27); (e) o
`service_role` não é revogado em `kit_motivo_da_empresa`/`vocabulario_unidades_guarda` (só `guarda_acervo` o revoga) —
as duas funções NOVAS desta fase seguem o molde MAIS forte (`guarda_acervo`), e a diagonal, recriada, preserva a ACL
que tem (`create or replace`).

---

## 2. O censo dos consumidores

### 2.1 Embeds (fato 6) — continuam certos? quebram na janela?

- **Com dica (7 FKs, 13 sítios, todos em `formas/**`)**: `movimentacoes_{ativo_id,filial_id,filial_destino_id,motivo}_fkey`,
  `lancamentos_item_{item_id,filial_id}_fkey`, `relatorios_gerados_filial_id_fkey`. A FK composta nasce com o **MESMO
  nome**, na MESMA migration e no MESMO comando que derruba a simples → a dica continua casando antes, durante e depois
  do deploy. Nenhuma janela.
- **Sem dica (25)**: `filiais(…)` a partir de `ativos` (5) e `import_logs` (3 contando o de `import-logs.ts:697`), de
  `ativos` a partir de `movimentacoes`/`compras`, `itens`/`tipos_item`, os reversos de `colaboradores`/`itens`/
  `tipos_item`, 3 em `scripts/smoke/smoke-prod.mjs`. Cada par tem UMA relação hoje e continua com UMA (a composta
  SUBSTITUI a simples no mesmo comando) → nenhum PGRST201. Cardinalidade: nenhuma das 23 é um-para-um, e a composta
  `(empresa_id, x)` não coincide com unique nenhum do filho → continua muitos-para-um.
- **Dica por coluna**: zero no repositório (busca exaustiva).
- **Views**: nenhum embed parte de view (`v_*` são lidas por coluna).
- **A prova**: o conferidor de formas contra o ENSAIO logo depois do apply lá (o portão do embed), e contra PRODUÇÃO.

### 2.2 `ON CONFLICT` / `upsert`

| onde | alvo | com uma empresa | na janela apply→deploy | fase |
|---|---|---|---|---|
| `src/lib/actions/colaboradores.ts:307` (`consolidarColaboradores`) | `nome_chave` | certo | **quebraria (42P10)** se o unique global caísse no apply → decisão 5 (dois passos): o global fica até depois do deploy; o TS passa a `empresa_id,nome_chave` | F65 |
| `scripts/seed.ts:886` | `nome_chave` | — (o seed não roda em banco nenhum) | — | backlog (decisão 3 do Johnny) |
| `definir_vinculos_usuario` | `(empresa_id, membro_id, filial_id)` | certo | não toca | — |
| `registrar_tentativa_senha` | `(ip)` | certo | não toca | — |

### 2.3 `.single()`/`.maybeSingle()` e escrita por chave natural (deixa de ser única com DUAS empresas)

Todos certos com uma empresa, nenhum quebra na janela (nenhum usa `ON CONFLICT`); com duas empresas, erro ALTO
(`PGRST116`) nos leitores e escrita cruzada MUDA no UPDATE:

- `queries/relatorios/comum.ts:43-44` (`resolverFilialPorSlug`, `.eq('slug')`) — já preparado (F50) para o `PGRST116`;
- `actions/tipos-item.ts:67-68` (`slug`), `actions/itens.ts:656-657` (`nome_chave`), `actions/colaboradores.ts:116-117`
  e `queries/colaboradores.ts:388-389` (`nome_chave`);
- **`actions/admin.ts:760-763`** — `update motivos … .eq('codigo')`: com duas empresas, grava nas duas. O mais grave.

→ **F67** (a escrita recebe a empresa) e **F66** (a leitura recorta). Vão para a ficha da F67.

### 2.4 Leitores SQL por chave natural sozinha

- `rel_por_motivo_filiais` e `rel_resumo_filiais` (`0143:232/265`, `left join motivos mo on mo.codigo = m.motivo`) →
  **F66** (o join por código ganha `and mo.empresa_id = m.empresa_id` quando a leitura recortar).
- A RPC de import (termo/prefixo sozinhos, `lerVocabularioImport` em bloco) → **F67** (o import recebe a empresa).
- `actions/relatorios.ts:139` (`max(versao)+1`, `lerUltimaVersao` sem empresa) → **F67**.
- O gatilho do kit (F64) já lê `(codigo, empresa_id)` — certo.

---

## 3. O desenho e as catorze decisões

### Decisão 1 — as migrations

Dez, nesta ordem (nome-sem-prefixo inédito, conferido contra os 163 arquivos):

| # | arquivo | classe | o quê |
|---|---|---|---|
| 1 | `0165_pais_do_tenant.sql` | ADITIVA | `unique (empresa_id, id)` nos sete pais, no molde de `filiais_empresa_id_uidx` (F62): `ativos`, `movimentacoes`, `pendencias_item`, `lancamentos_item`, `colaboradores`, `itens`, `tipos_item` |
| 2 | `0166_fk_composta_acervo.sql` | ADITIVA | as 17 FKs do ACERVO, simples → compostas de mesmo nome: `ativos` (2), `movimentacoes` (5, sem o motivo), `pendencias_item` (3), `lancamentos_item` (6), `anotacoes` (1) |
| 3 | `0167_fk_composta_cadastros.sql` | ADITIVA | as 5 FKs dos cadastros e registros: `colaboradores`, `itens`, `unidades_apelidos`, `import_logs`, `relatorios_gerados` |
| 4 | `0168_motivos_por_empresa.sql` | ADITIVA | o trio: derrubar `movimentacoes_motivo_fkey`, trocar `motivos_pkey` para `(empresa_id, codigo)` com o mesmo nome, recriar a FK composta com o mesmo nome |
| 5 | `0169_vocabulario_import_por_empresa.sql` | ADITIVA | as três PKs do import para `(empresa_id, …)` (mesmos nomes) e os dois parciais para `(empresa_id, categoria\|estado) where rotulo is not null` |
| 6 | `0170_unicidade_por_empresa.sql` | ADITIVA | `filiais_slug_key`, `filiais_nome_chave_uidx`, `tipos_item_slug_key`, `itens_nome_chave_uidx`, `kits_modelos_nome_uidx`, `unidades_apelidos_apelido_chave_uidx` por empresa, com os nomes |
| 7 | `0171_snapshot_por_empresa.sql` | ADITIVA | `relatorios_gerados_periodo_filial_versao_uidx` com a empresa (mesmo nome); o TS da chave no MESMO commit |
| 8 | `0172_colaboradores_nome_chave_por_empresa.sql` | ADITIVA | o unique por empresa AO LADO do global (nome provisório `colaboradores_nome_chave_uidx_f65`) — passo 1 da decisão 5 |
| 9 | `0173_guarda_empresa.sql` | ADITIVA | os gatilhos: `guarda_empresa()` + os 20; `termo_da_empresa()` + o de `termos_gerados`; a diagonal por empresa (`create or replace` de `vocabulario_unidades_guarda`, só as duas linhas) |
| 10 | `0174_colaboradores_nome_chave_pos_deploy.sql` | ADITIVA | passo 2 da decisão 5: `drop index` do global e `alter index … rename` do provisório para `colaboradores_nome_chave_uidx` — **aplicada nos bancos vivos só depois do deploy** (roda no CI com as outras) |

Os pais vêm antes das FKs; `motivos` e a sua FK juntos; os gatilhos por último (antes do passo pós-deploy). **Todo
estado entre duas migrations é repouso válido** (cada uma é atômica no MCP): depois da `0165` sobram uniques a mais;
depois de cada família, as FKs daquela família são compostas e as outras simples (as duas formas convivem, com os mesmos
nomes); depois da `0172`, os dois uniques de `colaboradores` (o global, mais estrito, decide; os dois alvos inferem).

Em cada migration: `set lock_timeout = '2s'` / `reset lock_timeout` (sem `begin`/`commit`), cabeçalho de classe,
rollback no rodapé, `db:lock` no mesmo commit, entrada em `DA_F38`. **Sem `update`, sem `cascade`, sem `concurrently`,
sem abrir a janela destrutiva.**

### Decisão 2 — o lock e a validação

- **Validada direto**, sem `not valid`: no `apply_migration` do MCP a migration é UMA transação (medido na F63), e
  separar `not valid`/`validate` na MESMA migration não encurta lock nenhum; separá-las ENTRE migrations deixaria um
  repouso com FK não validada (que a trava `forma_multiempresa.sql` reprova, e cujo tratamento pelo PostgREST não
  precisa ser provado). As tabelas são pequenas: a validação de uma FK é UMA varredura (`movimentacoes`: 3.631 linhas).
- **Um `alter table` por tabela filha, com os `drop constraint X` e os `add constraint X …` como subcomandos do MESMO
  comando** — atômico também no CI (`psql -f` sem `-1`): nenhum instante em que a tabela fica sem a FK. O PG executa os
  `drop` numa passada anterior aos `add` do mesmo `alter table`, o que permite o mesmo nome.
- **A família de `movimentacoes` NÃO vai sozinha**: vai na migration do ACERVO, depois de `ativos`, na ordem em que o
  caminho de escrita do app toma os locks (`criar_movimentacao_com_itens`: `ativos` `for update` → `movimentacoes` →
  `pendencias_item` → `lancamentos_item`; o molde da `0161`). Uma migration só com `movimentacoes` pegaria
  `movimentacoes` antes de `ativos` — a ordem inversa da do app, a forma que dá ciclo de espera.
- `DROP CONSTRAINT` de FK toma ACCESS EXCLUSIVE no filho e no pai; `ADD FOREIGN KEY`, SHARE ROW EXCLUSIVE nos dois;
  `ADD CONSTRAINT … UNIQUE/PRIMARY KEY`, ACCESS EXCLUSIVE; `CREATE [UNIQUE] INDEX`, SHARE; `CREATE TRIGGER`, SHARE ROW
  EXCLUSIVE (doc do PG 17, `sql-altertable` e `explicit-locking`). Tudo segurado até o commit. `lock_timeout` de 2 s; se
  o lock não vier: registrar, repetir no máximo três vezes em 30 minutos, sem subir o timeout nem matar sessão.

### Decisão 3 — a troca das FKs

- **O mesmo nome, as mesmas ações** (conferidas no catálogo "antes"): as 23 são `ON UPDATE NO ACTION`, `ON DELETE NO
  ACTION`, `MATCH SIMPLE`; **`pendencias_item_movimentacao_id_fkey` é `DEFERRABLE INITIALLY DEFERRED`** e a composta
  também. Colunas: `(empresa_id, x) references <pai> (empresa_id, id)` (em `motivos`, `(empresa_id, codigo)`). MATCH
  SIMPLE com `x` nulo não confere, igual a hoje (12 das 23 colunas filhas são anuláveis; `empresa_id` é `not null` nas 20).
- **Ficam simples**: as FKs para `empresas` (a raiz) e para `profiles` (identidade da conta).
- **`operador_filiais_filial_id_fkey` fica** (simples, `ON DELETE RESTRICT`, ao lado da composta da F62): `operador_filiais`
  é INFRA (`k_infra`), não par de negócio; ninguém embute por ela; derrubá-la mexeria no rollback da F62. Exceção nominal,
  com o motivo, na fonte da trava.
- **Nenhum par de tabelas de negócio com duas relações sobre a MESMA coluna**: a prova no catálogo é a trava
  `forma_multiempresa.sql` (nenhuma coluna de negócio coberta por duas FKs para o mesmo pai) e a lista dos pares com
  mais de uma FK igual à nominal: só `movimentacoes→filiais` (origem e destino — duas colunas, duas relações de
  propósito, sempre com dica).
- **`not valid` entre migrations não é usado** — a confirmação na doc do PostgREST não é necessária.

### Decisão 4 — os uniques por empresa

- **A ordem das colunas: `empresa_id` primeiro, em todos** — a forma de `filiais_empresa_id_uidx` (F62), das PKs que a
  ordem fixa (`motivos`, import) e do recorte da F66 (`empresa_id = X and chave = Y` usa os dois; lista por empresa usa o
  prefixo). Medido: as consultas que filtram SÓ pela chave natural (`slug` de `filiais`/`tipos_item`, `nome_chave` de
  `itens`/`colaboradores`, `codigo` de `motivos`, o vocabulário do import lido inteiro) caem em tabelas de 5 a 41 linhas em
  produção — uma página; o planejador varre de todo jeito. Nenhum custo mensurável até a F66.
- **O nome contratual preservado**, pela sequência nome provisório (`<nome>_f65`) → `drop` do antigo → `alter index …
  rename` (índice) ou `alter table … rename constraint` (constraint). Na MESMA migration. O provisório CONTÉM o nome
  contratual (`<nome>_f65`), então `casaConstraint` casaria até se a mensagem citasse o provisório.
- **Constraint continua constraint**: `filiais_slug_key` e `tipos_item_slug_key` (hoje `contype = 'u'`, nome implícito
  da `0003`/`0114`) nascem por extenso como `unique (empresa_id, slug)`. **Índice continua índice**: os `*_uidx`. As PKs
  continuam PK: como a tabela só tem uma, `drop constraint <pkey>` e `add constraint <pkey> primary key (…)` no MESMO
  `alter table` (as três do import não têm FK dependente).
- **Os dois parciais**: `(empresa_id, categoria|estado) where rotulo is not null`, mesmos nomes.
- **O `_key` da `0010`** (`relatorios_gerados_periodo_de_periodo_ate_filial_id_versao_key`, `unique (periodo_de,
  periodo_ate, filial_id, versao)`) **fica**: é por tenant de forma implícita — `filial_id` não nulo determina a empresa
  (a FK composta `relatorios_gerados_filial_id_fkey` a amarra) e o nulo (Consolidado) não colide com nulo; quem cobre o
  Consolidado por empresa é o índice da `0013` (decisão 6). Lista nominal, com o motivo.
- **`CONSTRAINTS_TRADUZIDAS`**: `filiais_slug_key` e `tipos_item_slug_key` passam de `unique-implicita` a
  `unique-nomeada` (constraint UNIQUE escrita por extenso). E o tipo passa a ser CONFERIDO por
  `erros-do-banco-sql.test.ts`: `unique-implicita` = o nome nunca é escrito em migration (vem de `unique` numa coluna
  de `create table`); `unique-nomeada` = escrito por `add constraint`/`rename constraint`; `indice-unico` = escrito por
  `create unique index`/`alter index … rename`. Hoje o drift era silencioso (fato 9).

### Decisão 5 — o `consolidarColaboradores`, com janela zero

- **Passo 1 (antes do merge, `0172`)**: `create unique index colaboradores_nome_chave_uidx_f65 on colaboradores
  (empresa_id, nome_chave)` AO LADO do global `colaboradores_nome_chave_uidx (nome_chave)`. O TS passa a `onConflict:
  'empresa_id,nome_chave'`.
- **Estado intermediário (repouso válido, declarado)**: os dois uniques. O app VELHO (`ON CONFLICT (nome_chave)`)
  infere o global; o NOVO (`ON CONFLICT (empresa_id, nome_chave)`) infere o provisório — os dois alvos inferem, e o
  global (mais estrito) segue decidindo. Com uma empresa, toda violação do global também é do provisório: o `DO NOTHING`
  do arbitrador pega o conflito antes de o outro índice ser tocado. **A tradução do 23505 não quebra**: um INSERT comum
  (`criarColaborador`) que duplique cita um dos dois índices, e os dois nomes contêm `colaboradores_nome_chave_uidx`.
- **Passo 2 (depois do deploy, `0174`, no MESMO PR e já rodada no CI)**: `drop index colaboradores_nome_chave_uidx;
  alter index colaboradores_nome_chave_uidx_f65 rename to colaboradores_nome_chave_uidx`. Aplicada no ensaio e em
  produção depois de `/api/saude` mostrar o commit do merge (Frente G, passo 9). Se barrada: o intermediário é repouso
  válido, e a sonda de deriva cobra o arquivo em 24 h (registrado).
- **A prova (sabotagem J)**: no Postgres do CI, contra o esquema-alvo, `on conflict (nome_chave)` → 42P10 e `on conflict
  (empresa_id, nome_chave)` infere; o intermediário simulado (o global recriado na transação) aceita os dois; e a trava
  de mesa: o `onConflict` de `colaboradores.ts` casa EXATAMENTE com um unique de `colaboradores` do esquema que as
  migrations produzem, e não com o global.

### Decisão 6 — o snapshot e a chave

- **O índice**: `relatorios_gerados_periodo_filial_versao_uidx on relatorios_gerados (empresa_id, periodo_de, periodo_ate,
  coalesce(filial_id, -1), versao)` — o mesmo nome (provisório → drop → rename), o `-1` mantido (não é o defeito).
- **`chaveVersao(empresaId, periodoDe, periodoAte, filialId)`** → `` `${empresaId}|${periodoDe}|${periodoAte}|${filialId ??
  SLUG_CONSOLIDADO}` ``: determinística, e o uuid da empresa não é dado pessoal.
- **`gerados.ts`**: a consulta das versões (`:162-165`) passa a trazer `id, empresa_id, …`, e a empresa de cada linha da
  página sai dela pelo `id` (a página inteira está no `.in('periodo_de', datas)` por construção). **A forma de
  `formas/relatorios-gerados.ts` NÃO muda** (nenhum `formas/**` muda). Exceção NOMINAL da trava "ninguém lê": identidade
  da chave, não recorte (a consulta continua sem filtro de empresa).
- **O `_key` da `0010` fica** (decisão 4).
- **`chave-versao-sql.test.ts`** passa a ler a migration nova (`0171`) como a fonte do índice: as colunas do índice =
  `empresa_id` + as da unique da `0010`; a assinatura de `chaveVersao` = as do índice menos a versão; A ≠ B.
  `ehViolacaoDeVersao` continua casando pelo NOME (preservado).

### Decisão 7 — `guarda_empresa()`

- **Uma função genérica** `public.guarda_empresa()` (plpgsql, **`security invoker`** por extenso, `search_path =
  public`): `if new.empresa_id is distinct from old.empresa_id then raise exception … using errcode = '42501'`. A frase:
  *"A empresa de um registro não muda (tabela %)."* com `tg_table_name` (nome de tabela é código); nenhum valor. Ela não
  lê tabela nenhuma.
- **O gatilho** `<tabela>_guarda_empresa`, `BEFORE UPDATE OF empresa_id … FOR EACH ROW`, nas **20** de `k_negocio` —
  inclusive `movimentacoes` e `lancamentos_item`: a janela `estoque.dev_destrutivo` abre as duas ao UPDATE (fato 13), e
  só com a guarda nelas o "sem exceção na janela" vale literalmente. **O corpo não cita a janela.**
- **Grants**: `revoke all … from public, anon, authenticated, service_role` — o molde de `guarda_acervo` (o mais forte;
  o do kit deixa `service_role`). Função de gatilho não precisa de EXECUTE de quem dispara.
- **A ressalva do `UPDATE OF`** (doc do PG 17, `sql-createtrigger`): *"changes made to the row's contents by BEFORE UPDATE
  triggers are not considered"* — um gatilho BEFORE que mudasse `empresa_id` não dispararia a guarda de coluna.
  **Na execução (revisão adversarial, ata (j)):** o plano era uma trava que procurasse a atribuição no TEXTO dos corpos;
  três rodadas acharam uma forma nova a cada vez. Ficou um **segundo gatilho da mesma função, `zz_guarda_empresa`,
  `BEFORE UPDATE … FOR EACH ROW` sem lista de coluna**, que ordena por nome DEPOIS de todos os BEFORE de UPDATE da
  tabela e recebe a linha final; a I3 de `imutabilidade_tenant.sql` confere no catálogo que ele é o último nas 20. `INSERT … ON CONFLICT DO UPDATE SET empresa_id = …` dispara os gatilhos de UPDATE ("will fire both
  kinds of triggers as needed") — coberto. `UPDATE … SET empresa_id = <o mesmo>` dispara e passa (não é troca).
- **A ordem com `guarda_acervo`**: em `movimentacoes`/`lancamentos_item`, `*_guarda_acervo` dispara antes de
  `*_guarda_empresa` (ordem alfabética): fora da janela, 42501 da `guarda_acervo`; dentro, 42501 da `guarda_empresa`.
  Em `kits_modelos`, `kits_modelos_guarda_empresa` dispara antes de `kits_modelos_motivo_da_empresa`: a troca de empresa
  de um kit é recusada pela guarda (o C5 do roteiro do kit muda de dono, declarado).
- **A frase chega em pt-BR**: `MSG_SQL.empresaDoRegistroNaoMuda` e o ramo em `erros.ts`, antes do genérico.

### Decisão 8 — `termos_gerados`

- **Um gatilho de coerência**, sem checagem de integridade nova (a contagem do "antes" provou o dado coerente — 0 nos dois
  bancos —, e checagem nova arrastaria a ordem do alarme da F64 para esta fase): `public.termo_da_empresa()` (INVOKER,
  `search_path = public`, `revoke all` dos quatro papéis) e o gatilho `termos_gerados_ids_da_empresa`, `BEFORE INSERT OR
  UPDATE OF movimentacao_ids, ativo_ids, empresa_id … FOR EACH ROW`.
- **A regra na forma POSITIVA**: todo id distinto de `movimentacao_ids` existe em `movimentacoes` COM a empresa do termo,
  e todo id distinto de `ativo_ids` existe em `ativos` COM a empresa do termo. A forma positiva continua certa depois da
  F66: sob a RLS recortada, um id de B é invisível para a sessão de A e conta como "não é da empresa do termo" — a
  negativa ("não existe id de outra empresa") passaria calada. Um id inexistente também recusa (não é da empresa).
- **Confere a ENTRADA** (o idioma do kit): no INSERT, sempre; no UPDATE, só quando um dos arrays ou a empresa MUDA
  (`is distinct from`). `persistirTermo` reenvia o objeto inteiro no UPDATE (`dados`, `arquivo_path` e os mesmos arrays):
  com os arrays iguais, passa sem conferir.
- **23503** (a semântica de "referência inválida", a do kit) com a frase própria *"O termo cita movimentação ou ativo que
  não é da empresa do termo."*; `MSG_SQL.termoForaDaEmpresa`.

### Decisão 9 — a diagonal

- **Duas linhas acrescentadas ao corpo**, nada mais: no ramo `unidades_apelidos`, `and f.empresa_id = new.empresa_id` na
  procura do "nome de QUALQUER OUTRA filial"; no ramo `filiais`, `and ua.empresa_id = new.empresa_id` na procura do
  apelido. O ramo "nome próprio da filial dona" já é da mesma empresa (a FK composta de `unidades_apelidos`).
- **A mensagem nunca cita filial alheia**: a única que cita um nome de filial (`v_outra.nome`) passa a ver só a empresa
  do apelido.
- **O lock fica global** (`hashtext('vocabulario_unidades_guarda')`): serializar renomeações entre empresas não custa nada,
  e mexer nele é mexer nas travas advisory (decisão 10).
- **A prova do "resto byte a byte"**: o `prosrc` vigente da `0173` MENOS as duas linhas declaradas é IGUAL ao da `0139`
  (teste de mesa), e o md5 do `prosrc` depois é o do corpo com as duas linhas (impressão).
- `create or replace` preserva dono e ACL (a de hoje: `service_role` ainda executa — não é mudado aqui). O `comment on
  function` ganha a F65.

### Decisão 10 — os ids e as travas advisory

**Nada converte.** Os ids ficam `smallint`/`bigint`/`uuid` GLOBAIS, e as **16 chamadas em 12 funções** ficam intactas
(a de `vocabulario_unidades_guarda` inclusive — a diagonal não toca a linha do lock). A ata registra: o teto efetivo
(`smallint` 32.767, com identidade que queima número em transação abortada); o ritmo medido em produção (`itens` na
sequência 139, `filiais` 20, `tipos_item` 40, em ~10 semanas de produção — séculos até o teto); por que a colisão da ficha
não existe com ids globais (o par `(3, 1)` de A e o de B não existem os dois); e a regra: quem um dia reescalar ids por
empresa converte AS 16 na mesma migration, porque `(bigint)` e `(int, int)` são espaços de lock diferentes.

### Decisão 11 — as três travas de catálogo

- **Arquivos novos** (os nomes da ficha): `supabase/tests/forma_multiempresa.sql`, `unicidade_por_empresa.sql`,
  `imutabilidade_tenant.sql` — rodam pelo glob de `rodar-roteiros.sh`, sem lista a editar.
- **As exceções nominais moram numa fonte só por lista**: `k_fk_fora_da_forma` (as FKs de/para negócio que ficam simples
  fora de `empresas`/`profiles`: `operador_filiais_filial_id_fkey`) e `k_pares_com_duas_relacoes` (`movimentacoes→filiais`)
  em `forma_multiempresa.sql`; `k_unicidade_implicita` (os seis nomes, cada um com o motivo) em
  `unicidade_por_empresa.sql`; `k_sem_guarda_empresa` (VAZIA — a decisão 2 do Johnny) em `imutabilidade_tenant.sql`.
  Cada arquivo leva a sua cópia de `k_negocio`, e o **describe 14** de `catalogos-seguranca.test.ts` amarra: a cópia é
  igual à de `catalogo_policies.sql` e as listas nominais são as da ata.
- **Expressão e parcial**: `unicidade_por_empresa.sql` lê as colunas do índice por `pg_index.indkey`, tratando `indkey[k]
  = 0` pela expressão (`pg_get_indexdef(indexrelid, k, true)`), e o parcial por `indpred` (a unicidade vale só no
  recorte — a chave tem de conter `empresa_id` do mesmo jeito). Um unique conta como "por empresa" se `empresa_id` é uma
  coluna SIMPLES dele (não dentro de expressão).
- **Nascem vermelhas** no push das travas: a forma pelos 23 nomes e pelos sete pais; a unicidade pelos catorze nomes;
  a imutabilidade pelas 20 tabelas (e pelas duas funções que não existem). O artifício `raise notice` → `warning` da ficha
  **não é preciso**: vermelhas no PR em rascunho, verdes no commit seguinte (o molde da F64).

### Decisão 12 — "ninguém lê"

- **SQL (catálogo e disco)**: uma fonte nova ao lado de `k_leitura_integridade`, em `catalogo_policies.sql`:
  `k_leitura_tenant` — cada entrada `função:tabela,tabela`, as tabelas cuja `empresa_id` aquela função pode ler, POR
  COMANDO (o predicado da F64, `pg_temp.leitura_de_empresa_do_lote`, com as tabelas DA FUNÇÃO):
  - `guarda_empresa:<as 20 de k_negocio>` — só `new`/`old` (a linha do gatilho); o corpo não cita tabela (a imutabilidade
    confere);
  - `termo_da_empresa:termos_gerados,movimentacoes,ativos` — a coerência do termo;
  - `vocabulario_unidades_guarda:filiais,unidades_apelidos` — a diagonal.
- **O furo que a F65 fecha (fato 21)**: uma função de GATILHO numa tabela do lote que lê `new.empresa_id`/`old.empresa_id`
  passa a CONTAR como leitura, mesmo sem citar a tabela no corpo — no catálogo (15h, pelo `pg_trigger`) e no disco (pelos
  `create trigger` das migrations). Sem isso, `guarda_empresa` passaria sem ser nominal.
- **TS**: uma lista nominal nova na trava, POR CADEIA (o trecho exato desde o `.from(`), com o motivo:
  `src/lib/queries/gerados.ts` (a consulta das versões: identidade da chave do snapshot) e
  `src/lib/actions/colaboradores.ts` (o `onConflict: 'empresa_id,nome_chave'`: o alvo do unique). O caso sintético fora
  delas continua vermelho.

### Decisão 13 — o injetor

Entram **cinco** mutações (teto 138 → **143**, no número exato, com o porquê datado), cada uma derrubando uma trava desta
fase que é ESTADO DE BANCO (nenhum teste de mesa a derruba):

| id | o que quebra | quem acusa |
|---|---|---|
| `f65-fk-simples` | `lancamentos_item_item_id_fkey` recriada simples (na execução: `anotacoes` já é o alvo da `f63-lote1-sem-coluna` — ata (g)) | `forma_multiempresa.sql` (F1/F4) |
| `f65-snapshot-sem-empresa` | o índice do snapshot recriado sem `empresa_id` | `unicidade_por_empresa.sql` |
| `f65-guarda-com-janela` | `guarda_empresa()` que só recusa FORA da janela (`… and coalesce(current_setting('estoque.dev_destrutivo', true), '') <> 'on'`) — o mesmo efeito do `return new` | `imutabilidade_tenant.sql` (I2/I4) |
| `f65-diagonal-global` | a diagonal sem o filtro de empresa | o roteiro da fase (H) |
| `f65-termo-sem-empresa` | `termo_da_empresa()` sem a comparação de empresa | o roteiro da fase (I) |

Quarentena continua em 2 (2/145 < ⅓). E a mutação `f64-lote2-sem-coluna` (`drop column empresa_id` em
`import_termos_estado`) passa a precisar tirar antes o gatilho da guarda daquela tabela (fato 27) — a mesma sabotagem,
agora aplicável.

### Decisão 14 — o instrumento

- **A chave estável**: a PK LIDA DO CATÁLOGO menos `empresa_id` (antes `(codigo)`, depois `(empresa_id, codigo)` −
  `empresa_id` = `(codigo)`), única porque há uma empresa (a contagem do "antes" prova). A saída imprime `pk` (muda nas
  quatro) e `chave` (não muda).
- **A contagem de violações**: o texto de `contagem-violacoes.sql` (0 nos dois bancos).
- **A impressão do catálogo**: `impressao-catalogo.sql`, com md5 por seção; e o CI imprime o MESMO catálogo depois da
  cadeia (o roteiro da fase inclui o arquivo por `\ir`), para "o catálogo depois igual ao do CI".
- **O critério** (o da F63/F64): `relfilenode` igual **sem exceção**, nos dois bancos; ensaio (sem tráfego) com os md5
  idênticos; produção idênticos, **ou** diferentes com `0 < janela < linhas` e a diferença explicada só pelas linhas da
  janela. `janela = linhas` é reescrita → rollback imediato.

---

## 4. As migrations, a ordem de apply e a ORDEM DE ROLLBACK

**Apply** (ensaio primeiro, cada uma pelo `apply_migration` com o `name` sem o prefixo): `0165` → `0166` → `0167` →
`0168` → `0169` → `0170` → `0171` → `0172` → `0173`; o merge; o deploy; `0174` (passo pós-deploy).

**Rollback — o inverso, num arquivo só, `supabase/rollback/F65-desfaz.sql`** (ensaiado no CI por
`supabase/tests/f65_rollback.sql`), cada passo idempotente (`if exists`, e, onde o nome é o mesmo antes e depois, um
`do` que confere a FORMA no catálogo antes de agir — para servir a qualquer estado intermediário):

1. (`0174`) se `colaboradores_nome_chave_uidx` é o por empresa: renomeá-lo para o provisório e recriar o global;
2. (`0173`) derrubar os 20 gatilhos `*_guarda_empresa` e a função; o gatilho de `termos_gerados` e `termo_da_empresa()`;
   `vocabulario_unidades_guarda()` de volta ao corpo da `0139` byte a byte (com o `comment` de lá);
3. (`0172`) `drop index if exists colaboradores_nome_chave_uidx_f65`;
4. (`0171`) o índice do snapshot de volta à forma da `0013` (provisório → drop → rename);
5. (`0170`) os seis uniques de volta à forma global, com os mesmos nomes;
6. (`0169`) as três PKs e os dois parciais do import de volta;
7. (`0168`) a FK de `motivos` de volta a simples, a PK a `(codigo)` — o trio, na ordem inversa;
8. (`0167`, `0166`) as 22 FKs de volta a simples, com os mesmos nomes e ações (`pendencias_item_movimentacao_id_fkey`
   diferida);
9. (`0165`) `drop constraint if exists` dos sete `*_empresa_id_uidx`.

Dentro de cada passo, as tabelas saem na MESMA ordem do apply (a ordem de lock do app); só ENTRE as migrations a ordem é
a inversa (o molde de `F64-desfaz.sql`). `set lock_timeout = '2s'` / `reset`, sem `begin`/`commit`. O ledger não é
reescrito. **Entre fases**: `f64_rollback.sql`, `f63_rollback.sql` e `f62_rollback.sql` passam a rodar o da F65 ANTES
(necessidade: o `drop column empresa_id` dos três falha com o gatilho `UPDATE OF empresa_id` e as FKs compostas
dependendo da coluna). **Depois da F73**, o rollback da F65 exige que o dado da segunda empresa já tenha saído (os
uniques globais não voltam com duas empresas repetindo chave). Num banco vivo, o rollback roda pelo `execute_sql` com o
conteúdo EXATO do arquivo — a única exceção ao "`execute_sql` só leitura", e só num desfecho ruim.

A prova no CI: `f65_rollback.sql` compara uma impressão do catálogo das 20 tabelas (colunas, constraints, gatilhos,
índices, policies) + o md5 do `prosrc` da diagonal, **depois do rollback**, com a mesma impressão do Postgres do CI
**antes da `0165`** (medida no push das travas vermelhas, que ainda não tem as migrations, e gravada como constante).

---

## 5. As travas e as provas (sabotagens A–L)

| peça | onde | nasce |
|---|---|---|
| A — a forma | `forma_multiempresa.sql` (F1–F6) + mutação `f65-fk-simples` | **vermelha** no CI pelos 23 nomes e pelos sete pais (push 1) |
| B — a unicidade | `unicidade_por_empresa.sql` (U1–U3) + `erros-do-banco-sql.test.ts` (nome e tipo) + `f65-snapshot-sem-empresa` | **vermelha** pelos catorze nomes (push 1) |
| C — a imutabilidade | `imutabilidade_tenant.sql` (I1–I5, estrutural + comportamental, com e sem a janela) + `f65-guarda-com-janela` | **vermelha** nas 20 (push 1) |
| D — FK composta, par simétrico | `integridade_tenant.sql` (D1–D3: laço sobre o CATÁLOGO, A→B leva 23503, B→B passa, dado intacto; a transferência A→filial de B recusada) | com as migrations |
| E — `motivos` e o import | `integridade_tenant.sql` (E1–E4) + o C2 do kit continua | com as migrations |
| F — o "pronto quando" (fato 19) | `integridade_tenant.sql` (F1–F4) + `conflito_filiais.sql` sem edição | com as migrations |
| G — o snapshot | `integridade_tenant.sql` (G1–G2) + `chave-versao-sql.test.ts` (A ≠ B) | **vermelho** na mesa e no CI (push 1) |
| H — a diagonal | `integridade_tenant.sql` (H1–H3) + a mesa (o resto do corpo byte a byte) + `f65-diagonal-global` | **vermelho** no CI (push 1) |
| I — `termos_gerados` | `integridade_tenant.sql` (I1–I3) + `f65-termo-sem-empresa` | **vermelho** no CI (push 1) |
| J — a janela do `ON CONFLICT` | `integridade_tenant.sql` (J1–J2) + a trava de mesa do `onConflict` | **vermelha** na mesa e no CI (push 1) |
| K — o rollback | `f65_rollback.sql` + `f64/f63/f62_rollback.sql` rodando o da F65 antes + `rollback-f65.test.ts` | a impressão pré-`0165` medida no push 1 |
| L — o instrumento | `integridade_tenant.sql` (L1: um `update` numa subtransação muda o md5 de `(chave, xmin)` e não o `relfilenode`; L2: um `alter column … type` com reescrita muda o `relfilenode`; L3: as operações da fase — `unique (empresa_id, id)`, FK composta de mesmo nome, PK trocada, provisório → `rename` — numa fixture com linhas não mudam nenhum dos dois; L4: o corpo das funções que a fase não toca é o de antes da `0165`, contra a constante do CI — ver nota) | com as migrations |

**Nota sobre L3**: o CI aplica a cadeia inteira antes de rodar os roteiros; "as migrations da fase não mudam o
`relfilenode`" é provado nos BANCOS VIVOS pela impressão antes × depois (a prova que importa), e no CI por um cenário que
reaplica as operações da fase (FK drop+add, unique provisório→rename, PK swap) numa tabela de fixture com linhas e
confere `relfilenode` e md5 de `(chave, xmin)` iguais.

Todas as recusas provadas duas vezes (a falha e, como `postgres`, o dado intacto), toda FK composta com o par
simétrico, tudo por `assert_zero_de` com rótulo literal (o injetor lê por token).

---

## 6. Commits e pushes

Commits pequenos, na ordem da ordem: (0) docs — a ordem + este plano + os instrumentos e o "antes"; (1) as travas
vermelhas (as três de catálogo, o roteiro da fase, o `f65_rollback.sql` em vazio, as de mesa do snapshot e do
`onConflict`); (2) `0165`; (3) `0166`/`0167`; (4) `0168`/`0169`; (5) `0170`/`0171` + o TS da chave; (6) `0172`/`0174` +
o `onConflict`; (7) `0173` + as frases; (8) os roteiros adaptados e os rollbacks; (9) os catálogos e os tipos; (10) o
injetor; (11) os documentos; (12) a versão. Cada migration com `npm run db:lock` no mesmo commit.

**Pushes (cota apertada)**: **push 1** = commits 0–1 (CI vermelho de propósito: a evidência das travas e a impressão
pré-`0165` para o rollback); **push 2** = o resto; pushes seguintes só para consertar o que o CI mostrar e para as
correções da revisão adversarial. PR como rascunho desde o push 1.

---

## 7. SHA de código congelado

**`a525a9a`** — o último commit que toca `src/**`, `scripts/**` ou `supabase/**` (a guarda última, da 3ª rodada da revisão adversarial). CI do HEAD `32e4bb7` (só documentação por cima): run `35931622477`, `verificar` e `banco-sem-docker` verdes — 51 roteiros, 1.095 asserções, injetor 143/143, tipos 38·358·94.

---

## 8. O que este plano NÃO promete

- Que a empresa A não VÊ o dado da B (F66/F72): a F65 faz o banco recusar a LIGAÇÃO cruzada, não a leitura.
- Que uma linha nova de uma segunda empresa receba a empresa certa (o default é a WAP até a F67) — e, por isso mesmo,
  depois da F65 uma escrita de B por um gatilho que ainda não informa a empresa (a pendência que o gatilho de
  `movimentacoes` abre, por exemplo) é RECUSADA pela FK composta (23503) em vez de gravar a incoerência calada. É o
  orçamento da F67.
- Que os leitores por chave natural sozinha fiquem certos com duas empresas (F66/F67).
- Qualquer mudança no custo das listas (nenhum índice de lista muda — decisão 1 do Johnny); o custo novo é o da checagem
  de FK composta no INSERT, pelo índice `(empresa_id, id)` do pai.
- Que os ids `smallint` não se esgotem.
- Que a janela de produção fique sem tráfego.
