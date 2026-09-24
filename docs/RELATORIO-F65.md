# Relatório F65 — a integridade estrutural do tenant

**v1.70.0 na branch, NÃO aplicada e NÃO mergeada** · migrations `0165`–`0174` prontas, CI verde, **nenhuma aplicada em banco
vivo** (o ledger dos dois bancos termina na `0164`) · SHA de código congelado **`a525a9a`** · código no
[PR #77](https://github.com/vmatusita/ti-wap-inventory-control/pull/77), **em rascunho, sem merge** · CI do HEAD: run
`35931622477` (51 roteiros, 1.095 asserções, 0 ✗; injetor 143/143; `db:types:diff` verde) · a tag `v1.70.0` **não** foi
publicada.

> A quarta fase da virada multiempresa. Com as 20 tabelas de negócio já com `empresa_id` (F62–F64), a chave de recorte
> passa a ser **estrutural**: as **23 FKs** entre tabelas de negócio viram compostas `(empresa_id, x) → (empresa_id, id)`
> com o **mesmo nome** e as **mesmas ações** (os sete pais ganham `unique (empresa_id, id)`); `motivos` e o vocabulário do
> import ganham a PK por empresa; os **catorze uniques** de negócio passam a valer dentro de cada empresa com os **nomes
> contratuais** preservados (o do colaborador em dois passos, para o `ON CONFLICT` do app não perder o árbitro); a
> **guarda da empresa** recusa com `42501` a troca de empresa de um registro nas 20, sem exceção para a janela destrutiva
> — com um segundo gatilho, o ÚLTIMO de cada tabela, que vê a troca feita por qualquer outro gatilho; o **termo** só cita
> o que é da empresa dele; a **diagonal** nome × apelido é por empresa. Tudo sem reescrever uma tupla.
>
> **O apply parou no classificador de segurança** (§1.1): às 23:21 UTC o `apply_migration` da `0165` no ENSAIO foi
> recusado, e — pela ordem — não houve nova tentativa nem reformulação. Tudo o que não dependia do banco está entregue e
> verde; o que depende, com o comando exato, está no §1.2.

---

# 1. O ROTEIRO DO JOHNNY — o que ficou com você, e por quê

## 1.1 O que parou, e o que NÃO fazer

- **Às 23:21 UTC (20:21 -03) de 23/09/2026**, o `apply_migration` do conector da Supabase para a `0165` no **ensaio**
  (`sgmvldiizsrjbxzzpmhh`) foi recusado pelo classificador de segurança do Claude Code (*"Permission for this action was
  denied by the Claude Code auto mode classifier"*). A ordem manda: *"registre, não repita, não reformule, siga no que não
  depende dela, e ponha o comando no topo do relatório"*. Foi o que se fez.
- **Nada foi aplicado em banco nenhum.** Os dois ledgers terminam na `0164` (conferido pelo MCP, só leitura, antes da
  tentativa); a contagem de violações e as impressões "antes" foram refeitas no ensaio logo antes, idênticas às das 14h
  (`f65-evidencias/antes/refeito-ensaio-2321utc.md`).
- ⚠ **NÃO mergeie o PR #77 antes do apply em produção.** O código novo depende do banco novo: o
  `consolidarColaboradores` passa a pedir `ON CONFLICT (empresa_id, nome_chave)`, e sem a `0172` aplicada esse alvo não
  existe (`42P10`, a consolidação cai na cara do operador). A ordem certa é a da Frente G: ensaio → produção → merge →
  deploy → `0174`.
- **Enquanto o PR não é mergeado, o sistema está exatamente como na v1.69.0** — produção, `main` e deploy intocados, e a
  sonda de deriva não vê as migrations novas (elas não estão na `main`). É repouso seguro por tempo indeterminado.

## 1.2 Para retomar — o comando, e a ordem

**O comando barrado** (o primeiro da sequência):

```
apply_migration(project_id: "sgmvldiizsrjbxzzpmhh", name: "pais_do_tenant",
                query: <o conteúdo EXATO de supabase/migrations/0165_pais_do_tenant.sql>)
```

**Como retomar:** numa sessão do Claude Code neste repositório (na branch `f65-integridade-do-tenant`), com a permissão
para o `apply_migration` do conector da Supabase liberada por você (é uma decisão sua: aprovar na hora, ou uma regra de
permissão nas configurações), peça: *"Retome a F65 pela Frente G, passo 5, a partir do docs/RELATORIO-F65.md §1.2"*. A
sequência, toda já preparada:

1. **Ensaio** (`sgmvldiizsrjbxzzpmhh`): refazer, logo antes, `docs/f65-evidencias/contagem-violacoes.sql` (0 em tudo) e a
   impressão "antes" (`impressao-tenant.sql` com o corte vazio, `impressao-catalogo.sql`,
   `docs/f64-evidencias/impressao-policies.sql`, os dois advisors); aplicar, UMA migration por chamada e com o texto
   EXATO do arquivo:

   | ordem | arquivo | `name` no ledger |
   |---|---|---|
   | 1 | `0165_pais_do_tenant.sql` | `pais_do_tenant` |
   | 2 | `0166_fk_composta_acervo.sql` | `fk_composta_acervo` |
   | 3 | `0167_fk_composta_cadastros.sql` | `fk_composta_cadastros` |
   | 4 | `0168_motivos_por_empresa.sql` | `motivos_por_empresa` |
   | 5 | `0169_vocabulario_import_por_empresa.sql` | `vocabulario_import_por_empresa` |
   | 6 | `0170_unicidade_por_empresa.sql` | `unicidade_por_empresa` |
   | 7 | `0171_snapshot_por_empresa.sql` | `snapshot_por_empresa` |
   | 8 | `0172_colaboradores_nome_chave_por_empresa.sql` | `colaboradores_nome_chave_por_empresa` |
   | 9 | `0173_guarda_empresa.sql` | `guarda_empresa` |

   Depois: `notify pgrst, 'reload schema'`; os advisors (segurança: nada novo; performance: o delta de
   `unindexed_foreign_keys` declarado por nome — as 23 compostas sem índice que as cubra pela frente, e as
   `*_empresa_id_fkey` que os uniques novos passam a cobrir); `impressao-tenant.sql` com o corte = o
   `corte_para_o_depois` do "antes" (`relfilenode` e os dois md5 IGUAIS nas 20); `impressao-catalogo.sql` (os md5 de
   `fks`, `pais`, `gatilhos` e `advisory` iguais aos do CI em `f65-evidencias/C-ci/catalogo-depois-ci-push2.json`, com os
   40 gatilhos da guarda do SHA congelado; `uniques` só fecha depois da `0174`; `funcoes.md5_sem_as_da_f65` igual ao
   "antes" do MESMO banco); as policies iguais; a sonda de exatidão (`exatidao-pos-apply.sql` contra
   `depois/exatidao-esperada.json`); e o **conferidor de formas** — o portão do embed:
   ```bash
   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/formas/conferir.mts --alvo=ensaio --saida=docs/f65-evidencias/depois/conferidor-ensaio.json
   ```
2. **Produção** (`pbtjcalbmepmrqzprusb`): o mesmo, na mesma ordem, **dentro de 24 h do commit das migrations** (o último,
   `a525a9a`, de 23/09 às 20:02 -03), com o `relfilenode` igual SEM exceção e os md5 iguais ou explicados só pela janela;
   logo depois, `node scripts/smoke/smoke-prod.mjs` (0 falha) e o conferidor com `--alvo=producao` (0 recusadas).
3. **Merge** do PR #77 (sai do rascunho) com `verificar` e `banco-sem-docker` verdes; esperar `/api/saude` com `1.70.0`
   e o commit do merge.
4. **A `0174`** (`colaboradores_nome_chave_pos_deploy`) no ensaio e depois em produção, com as mesmas provas.
5. **A conferência pós-deploy**, só leitura: `/api/saude`; o smoke; a Parte B à mão:
   ```bash
   gh workflow run saude.yml -f partes=b
   ```
6. **O PR de documentação** (as evidências do apply e o fecho deste relatório) e a tag:
   ```bash
   git tag -a v1.70.0 -m "v1.70.0 — F65, a integridade estrutural do tenant"
   ```
   ```bash
   git push origin v1.70.0
   ```

**Se algo divergir** (o `relfilenode` mudou, o md5 além da janela, advisor de segurança novo citando objeto da fase, o
conferidor ou o smoke recusou): o rollback IMEDIATO no banco afetado é o `execute_sql` com o conteúdo EXATO de
`supabase/rollback/F65-desfaz.sql` (idempotente em qualquer estado intermediário — RUNBOOK, Anexo F65), e o PR fica sem
merge.

## 1.3 Depois do deploy (quando houver — 5 minutos, só leitura)

1. **Entre com a sua conta** e confira que tudo está como sempre: cadastrar e editar filial, tipo de item, colaborador,
   item, kit, apelido e motivo; **"Consolidar colaboradores"**; registrar uma movimentação e uma transferência entre
   filiais; gerar um relatório consolidado e ver a lista de **Relatórios gerados**.
2. **O diff da fase**: `git diff v1.69.0 v1.70.0 --stat`.
   - **Tem de aparecer:** `supabase/migrations/0165`…`0174`, `supabase/migrations.lock.json`,
     `supabase/rollback/F65-desfaz.sql`, `supabase/tests/**` (novos `forma_multiempresa`, `unicidade_por_empresa`,
     `imutabilidade_tenant`, `integridade_tenant`, `f65_rollback`; emendados os listados no §2),
     `src/lib/relatorios/versao-snapshot.ts`, `src/lib/queries/gerados.ts`, `src/lib/actions/colaboradores.ts`,
     `src/lib/actions/erros.ts`, `src/lib/supabase/erros-do-banco.ts`, `src/lib/types/database.ts`, os testes de mesa,
     `scripts/db/mutacoes.mjs` e `mutacoes.test.mts`, `registry.ts`, `package.json`, `CHANGELOG.md` e `docs/**`.
   - **Não pode aparecer:** `src/lib/queries/formas/**`, `src/components/**`, `src/app/**`, `scripts/seed.ts`,
     `scripts/import/**`, `scripts/reset.ts`, `scripts/db/restaurar.mjs`, migration antiga alterada,
     `.github/workflows/**`, o `CLAUDE.md` da raiz, `package-lock.json`, `.env*`.

```bash
git diff v1.69.0 v1.70.0 --stat
```

---

# 2. O que mudou, por arquivo e por quê

| arquivo | o quê | por quê |
|---|---|---|
| `supabase/migrations/0165_pais_do_tenant.sql` | `unique (empresa_id, id)` nos sete pais (`<t>_empresa_id_uidx`) | o alvo das FKs compostas; o PG não aceita FK composta sem ele |
| `supabase/migrations/0166_fk_composta_acervo.sql` | as 17 FKs do acervo compostas, um `alter table` por filho com `drop`/`add` do MESMO nome, na ordem de lock do app; `pendencias_item_movimentacao_id_fkey` segue `deferrable initially deferred` | decisões 2 e 3: nenhum instante sem a FK; a dica de embed pelo nome continua casando |
| `supabase/migrations/0167_fk_composta_cadastros.sql` | as 5 dos cadastros e registros (`colaboradores`, `itens`, `unidades_apelidos`, `import_logs`, `relatorios_gerados`) | idem |
| `supabase/migrations/0168_motivos_por_empresa.sql` | a FK do motivo sai, `motivos_pkey` vira `(empresa_id, codigo)`, a FK volta composta com o mesmo nome — numa migration | decisão 2 do Johnny na F64; a PK não cai sem a FK junto |
| `supabase/migrations/0169_vocabulario_import_por_empresa.sql` | as três PKs do import `(empresa_id, …)` com os mesmos nomes; os dois parciais pelo provisório → `drop` → `rename` | fato 7 |
| `supabase/migrations/0170_unicidade_por_empresa.sql` | `filiais_slug_key`/`tipos_item_slug_key` (constraint), `filiais_nome_chave_uidx`, `itens_nome_chave_uidx`, `kits_modelos_nome_uidx`, `unidades_apelidos_apelido_chave_uidx` (índice) por empresa, com os nomes; os dois `comment on index` novos | decisão 4; a tradução do 23505 casa pelo nome |
| `supabase/migrations/0171_snapshot_por_empresa.sql` | `relatorios_gerados_periodo_filial_versao_uidx` com a empresa na frente (mesmo nome) | decisão 6 |
| `supabase/migrations/0172_colaboradores_nome_chave_por_empresa.sql` | o unique por empresa AO LADO do global (`colaboradores_nome_chave_uidx_f65`) | decisão 5, passo 1 |
| `supabase/migrations/0173_guarda_empresa.sql` | `guarda_empresa()` + os 40 gatilhos da guarda (o de coluna `<tabela>_guarda_empresa` e o ÚLTIMO, `zz_guarda_empresa`, nas 20); `termo_da_empresa()` + `termos_gerados_ids_da_empresa`; a diagonal por empresa (duas linhas) | decisões 7, 8 e 9; decisão 2 do Johnny |
| `supabase/migrations/0174_colaboradores_nome_chave_pos_deploy.sql` | o global sai, o por empresa fica com o nome contratual — nos bancos vivos só depois do deploy | decisão 5, passo 2 |
| `supabase/rollback/F65-desfaz.sql` | o rollback da fase, `0174` → `0165`, idempotente em qualquer estado | ensaiado no CI até a impressão de antes da `0165`; os das F64/F63/F62 o rodam antes |
| `supabase/tests/forma_multiempresa.sql`, `unicidade_por_empresa.sql`, `imutabilidade_tenant.sql` (novos) | as três travas de catálogo, derivadas do catálogo, com as listas nominais | a ficha; nasceram vermelhas (push 1) |
| `supabase/tests/integridade_tenant.sql` (novo) | D1–D4, E1–E4, J1–J2, F1–F3, G1–G2, H1–H3, I1–I2, L1–L4; e a impressão do catálogo depois do FIM | o roteiro da fase: as sabotagens D a L |
| `supabase/tests/f65_rollback.sql` (novo) | rb0–rb4: o que a F65 pôs existe; o rollback tira tudo; o catálogo volta à impressão do CI de antes da `0165` | a sabotagem K |
| `supabase/tests/_asserts.sql` | o furo do `new`/`old` em gatilho fechado; o despachante `pg_temp.leitura_de_empresa`; o ajudante de fixture `pg_temp.f65_plantar` | decisão 12; a fixture de duas empresas por extenso |
| `supabase/tests/catalogo_policies.sql` | `k_leitura_tenant` (fonte única), 15h pelo despachante, 15k | decisão 12 |
| `empresa_no_acervo.sql`, `empresa_no_vocabulario.sql` | as cópias de `k_leitura_tenant`; o 4c lê a PK nova de `motivos` e do import | a trava "ninguém lê" com as exceções da fase |
| `kit_motivo_da_empresa.sql`, `restauracao.sql`, `integridade_alarme.sql` | o C5 aceita a recusa da guarda; a filial da fixture na empresa dela; o termo com arrays vazios | fato 20 — nenhuma asserção mudou para passar |
| `f62_rollback.sql`, `f63_rollback.sql`, `f64_rollback.sql` | rodam o `F65-desfaz.sql` antes, e medem o "antes" depois dele | fato 27 |
| `isolamento_tenant.sql`, `catalogo_secdef.sql`, `cargo_dev.sql` | só comentário: o que a F65 entregou; as guardas de pertencimento apontam a F67 | Frentes E e F |
| `src/lib/relatorios/versao-snapshot.ts`, `src/lib/queries/gerados.ts` | `chaveVersao(empresaId, …)`; a empresa de cada versão pela mesma consulta | decisão 6 (exceção nominal de "ninguém lê") |
| `src/lib/actions/colaboradores.ts` | `onConflict: 'empresa_id,nome_chave'` | decisão 5 |
| `src/lib/supabase/erros-do-banco.ts`, `src/lib/actions/erros.ts` | o tipo dos dois `slug_key` (`unique-nomeada`); `empresaDoRegistroNaoMuda` e `termoForaDaEmpresa` antes dos ramos genéricos | decisões 4, 7 e 8 |
| `src/lib/types/database.ts` | hand-fix datado das 23 `Relationships` compostas; as relações de view que o gerador deixa de emitir, removidas | conferido depois contra a geração do MCP (§6) |
| testes de mesa | `chave-versao-sql.test.ts`, `colaboradores-onconflict.test.ts` (novo), `erros-do-banco-sql.test.ts` (o tipo conferido), `erros.test.ts`, `empresa-acervo-sem-leitura.test.ts`, `catalogos-seguranca.test.ts` (describe 13 e 14), `rollback-f65.test.ts` (novo), `migrations-f38.test.ts` (`DA_F38` e a diagonal byte a byte), `mutacoes.test.mts` | as sabotagens B, G, H, J, K e "ninguém lê" na mesa |
| `scripts/db/mutacoes.mjs` | cinco mutações F65; as duas `*-sem-coluna` derrubam o gatilho da guarda antes; teto 138 → 143 | decisão 13 |
| `docs/**` | PLAN-F65, a ata, MATRIZ (R-ACC-98 a 107), ADR-003, RUNBOOK (Anexo F65), PLANO-MULTIEMPRESA, índices, evidências, este relatório | a Frente F e o fecho |
| `package.json`, `CHANGELOG.md`, `registry.ts` | `1.70.0` | regra 8 |

---

# 3. Os números MEDIDOS, lado a lado com a ficha e a ordem

Os 28 fatos foram remedidos contra o disco, o git e os dois bancos (`docs/PLAN-F65.md` §1). As divergências — todas
medidas, e a medição ganhou:

| # | a ficha / a ordem dizia | medido |
|---|---|---|
| 1 | "~11 tabelas que podem ser pai" | **sete** pais sem `unique (empresa_id, id)` + `filiais` (F62) + `motivos` (pela PK) |
| 2 | FKs em `ativos` (unidade, tipo, colaborador, antecessor), `termos_gerados`, `operador_filiais`, `membros` | **23** FKs entre tabelas de negócio, exatas: `ativos` tem duas; `termos_gerados` nenhuma (`uuid[]` — no lugar, o gatilho de coerência); `operador_filiais`/`membros` a F62 já fez |
| 3 | todas `NO ACTION`, simples | ⚠ `pendencias_item_movimentacao_id_fkey` é **`DEFERRABLE INITIALLY DEFERRED`** (`0050:43`) — a composta preservou |
| 4 | 7 FKs citadas em `formas/**` e `relatorios/estoque.ts` | os 7 nomes, **13 sítios, todos em `formas/**`**; 25 embeds sem dica; zero dica por coluna; nenhuma das 23 é um-para-um |
| 5 | 13 uniques + snapshot | **catorze** por empresa (os seis da ficha que existem — `itens (lower(nome))` saiu na `0147` —, o snapshot, `unidades_apelidos`, `filiais_nome_chave_uidx`, as três PKs do import, os dois parciais) e **seis** implícitos nominais |
| 6 | `CONSTRAINTS_TRADUZIDAS` conferido | ⚠ o campo `tipo` **não era lido** — drift silencioso; a F65 o amarra |
| 7 | `guarda_empresa` em quatro tabelas | **as 20** (decisão 2 do Johnny): a janela destrutiva abre `movimentacoes`/`lancamentos_item` ao UPDATE |
| 8 | 14 chamadas advisory | **16** reais em 12 funções (`resetar_acervo`/`resetar_itens` têm três); nenhuma muda |
| 9 | oito roteiros com segunda empresa | **cinco** criam empresa de verdade; uma fixture a adaptar (`restauracao.sql`) e o C5 do kit, que a guarda passou a recusar antes do gatilho do kit |
| 10 | a trava "ninguém lê" em três partes | ⚠ **um furo**: a função de GATILHO numa tabela do lote que lê `new.empresa_id` sem citar a tabela escapava — fechado |
| 11 | os rollbacks F62/F63/F64 | ⚠ o `drop column empresa_id` deles **passa a falhar** depois da F65 — o da F65 antes é necessidade |
| 12 | a violação das FKs compostas | a contagem deu **0** nos dois bancos, antes de qualquer apply (`antes/violacoes-*.json`) |

# 4. As decisões

As três do Johnny e as catorze da fase estão na ata ([`DECISOES.md`](DECISOES.md), 2026-09-23 · F65) e no
[`PLAN-F65.md`](PLAN-F65.md) §3; as tomadas na execução, na ata, letras (a) a (i). Em uma linha cada: os índices de lista
foram para a F66; a guarda vale nas 20, sem exceção; o seed de duas empresas foi para o backlog; nada converteu nos ids nem
nas travas advisory (a regra de converter as 16 juntas ficou escrita); a validação é direta (sem `not valid`); o nome de
toda constraint e índice é preservado; o unique do colaborador sai em dois passos; o termo tem gatilho de coerência (não
checagem nova); a mesa ganhou um Postgres de verdade (PGlite, fora do projeto); o CI é a régua das constantes.

# 5. O censo dos consumidores — o que a fase NÃO executa (o orçamento da F66 e da F67)

O detalhe está no `PLAN-F65.md` §2; o destino, nas fichas da F66 e da F67 do `PLANO-MULTIEMPRESA.md` (notas F65):

- **Embeds** (fato 6): nenhum muda — a composta substitui a simples no MESMO comando e com o MESMO nome; nenhuma das 23
  é um-para-um; nenhum embed parte de view. A prova é o conferidor de formas contra os dois bancos (§6).
- **`ON CONFLICT`**: o único que quebraria (`consolidarColaboradores`) passou ao alvo novo com janela zero; o de
  `scripts/seed.ts:886` foi para o backlog com o seed de duas empresas.
- **Leitores e escritores por chave natural sozinha** (certos com uma empresa, errados com duas): `resolverFilialPorSlug`,
  `tipos-item.ts:67`, `itens.ts:656`, `colaboradores.ts:116`/`queries/colaboradores.ts:388`, **o `update motivos …
  .eq('codigo')` de `admin.ts:760-763`** (o mais grave: escrita cruzada muda), `lerVocabularioImport` e a RPC do import,
  o `max(versao)+1` de `relatorios.ts:139` → **F67**. O join por código de `rel_por_motivo_filiais`/`rel_resumo_filiais`
  → **F66**.

---

# 6. O apply e as provas, nos dois bancos

**Não aconteceu** (§1.1). O que foi feito, só leitura:

- **Os dois ledgers** terminam na `0164` (`kit_motivo_da_empresa`): ensaio 161 linhas, produção 148 — o fato 1.
- **O "antes" da Frente A** (14h, nos dois bancos): a contagem de violações com **0 em tudo**, as impressões do tenant,
  do catálogo e das policies, e os advisors (`f65-evidencias/antes/`).
- **O "antes" refeito no ensaio logo antes do apply** (~23:15 UTC): **idêntico** ao das 14h — mesmo corte (`13298`, nenhuma
  transação desde então), `relfilenode` e md5 iguais nas 20, catálogo, policies e advisors iguais
  (`f65-evidencias/antes/refeito-ensaio-2321utc.md`).
- **A sonda de exatidão** está pronta, com os md5 esperados calculados dos arquivos (`exatidao-pos-apply.sql`,
  `depois/exatidao-esperada.json`); os `prosrc` das três funções batem com os que o CI imprimiu.
- **O que o CI já provou** (e o apply vai conferir contra): o catálogo "depois" da cadeia inteira
  (`C-ci/catalogo-depois-ci-push2.json`, do push 2; o do SHA congelado tem os 20 gatilhos `zz_guarda_empresa` a mais).

---

# 7. As sabotagens, com a saída real

Cada trava provou que sabe ficar vermelha de três jeitos: **contra o estado de antes** (o push 1, só as travas, no CI e
na mesa — `f65-evidencias/B-travas/`), **pela sabotagem de mesa** no código pronto (um worktree descartável no SHA
revisado, cada edição desfeita depois — `f65-evidencias/A-L-sabotagens.md`) e **pelo injetor** no banco do CI (a mutação
num banco descartável, o roteiro contra ele — o mesmo arquivo).

| sabotagem | contra o antes (push 1) | a sabotagem no código pronto | resultado |
|---|---|---|---|
| **A** — a forma | F1/F3/F4/F6 pelos 23 nomes e pelos sete pais; F7 (o gatilho do termo não existe) | `f65-fk-simples`: `lancamentos_item_item_id_fkey` de volta a simples | ✗ F1, F4 (e F6) |
| **B** — a unicidade | U1 pelos catorze nomes | `f65-snapshot-sem-empresa`; na mesa, o `tipo` de `filiais_slug_key` de volta a implícito | ✗ U1; `erros-do-banco-sql.test.ts` vermelho |
| **C** — a imutabilidade | I1/I2/I4/I6 nas 20 | `f65-guarda-com-janela`: a guarda só fora da janela | ✗ I2, I4 |
| **D** — FK composta, par simétrico | D1 (23 FKs passaram A→B), D4 (a transferência para a filial de B passou) | — (o roteiro É a sabotagem: A→B tem de levar 23503) | verde depois das migrations, com o par B→B aceito e o dado da A intacto |
| **E** — `motivos` e o import | E1/E2/E4 | — | verde depois |
| **F** — o "pronto quando" | F1/F2 (matriz, tipo, colaborador, item, kit, apelido em duas empresas); F3 pela regra da F24 | — | verde depois; `conflito_filiais.sql` sem edição |
| **G** — o snapshot | G1/G2; na mesa, a chave antiga ignorava a empresa e a filial | na mesa, `chaveVersao` sem a empresa | ✗ 3 casos de `chave-versao-sql.test.ts` |
| **H** — a diagonal | H1/H3 | `f65-diagonal-global`; na mesa, uma terceira linha mudada no corpo | ✗ H1, H3; ✗ 2 casos de `migrations-f38.test.ts` |
| **I** — `termos_gerados` | I1 | `f65-termo-sem-empresa` | ✗ I1 |
| **J** — o `ON CONFLICT` | J1/J2; na mesa, o árbitro por empresa ausente | na mesa, o `onConflict` de volta a `'nome_chave'` | ✗ 2 casos de `colaboradores-onconflict.test.ts` |
| **K** — o rollback | rb0 (nada da F65 existia) | na mesa, o rollback sem devolver uma FK, e sem o `deferrable` da diferida | ✗ `rollback-f65.test.ts` (as duas) |
| **L** — o instrumento | L4 (a constante medida aqui) | L1 e L2 SÃO a sabotagem (o `update` numa subtransação muda o md5; o `alter column … type` muda o `relfilenode`) | verde: o instrumento vê a reescrita quando ela existe |
| "ninguém lê" | 15k (as exceções não existiam); a catraca TS | na mesa, um `.eq('empresa_id', …)` novo na lista de gerados | ✗ a catraca |
| as listas nominais | — | na mesa, uma FK a mais na lista das que ficam simples | ✗ describe 14 |

O injetor inteiro, no CI do push 2 (run `35925951229`): **143/143 detectadas pelo cenário nomeado**, e na mesa (PGlite)
o mesmo lote, 143/143 (`f65-evidencias/injetor-mesa-pglite.txt`).

---

# 8. A revisão adversarial

Subagentes em contexto fresco, com as quinze perguntas da ordem, lendo o código **pelo SHA** (nunca pela árvore de
trabalho — o conserto durante o voto faria o achado real sair "refutado"), cada achado votado por um cético instruído a
refutá-lo. Só lacunas de correção ou de requisito declarado.

- **1ª rodada** (SHA `5395c26`, sete lentes: as migrations; os embeds e os tipos; os uniques, o `ON CONFLICT` e o
  snapshot; as guardas; as travas; os rollbacks; o escopo e os dados). Seis lentes sem achado. A das guardas trouxe um,
  **confirmado**: a I3 de `imutabilidade_tenant.sql` (nenhum gatilho BEFORE das 20 atribui `new.empresa_id`) só via a
  forma `:=`, e o PL/pgSQL também atribui por `=` como comando e por `select … into new.empresa_id` — a forma que a
  própria `0156` usa (`operador_filiais_deriva_membership`, fora das 20). Um gatilho futuro com essa forma passaria pela
  trava, e a guarda de COLUNA não veria a troca (o `UPDATE OF` não vê mudança feita por gatilho BEFORE). **Conserto
  (`2c236f6`):** o predicado vira função, com as três formas, e a auto-sabotagem I9.
- **2ª rodada** (SHA `2c236f6`, duas lentes: o predicado novo; e, de contexto fresco, qualquer caminho que deixe
  `empresa_id` mudar nas 20 — gatilho BEFORE existente, `on conflict do update`, a janela, delete+insert por RPC,
  `disable trigger`, view com `instead of`). A dos caminhos: **nenhum achado**. A do predicado: **dois, os dois
  confirmados** — o identificador entre aspas (`"new"."empresa_id" := …`, que o léxico guarda) escapava; e o `then` de
  uma EXPRESSÃO `case` do SQL contava como início de comando (falso positivo numa comparação). **Conserto (`86b80fd`):**
  as aspas saem depois do `lower`; cada expressão `case` vira um termo neutro, do mais interno para fora (ela nunca
  contém `;`; o comando `case` do PL/pgSQL sempre contém, e fica). A primeira tentativa, medida na mesa antes do commit,
  errava o `end case` — o teste de mesa pegou.
- **3ª rodada** (SHA `86b80fd`, as mesmas duas lentes): mais dois confirmados — `get diagnostics new.empresa_id = …` e,
  o decisivo, **a linha copiada para uma variável, alterada e devolvida** (`v_linha := new; v_linha.empresa_id := …;
  return v_linha`), que nenhum leitor de texto acha (um terceiro, sobre a I9, refutado). **Escolha (`a525a9a`):** parar
  de procurar a atribuição no texto e fechar pela ORDEM dos gatilhos — um segundo gatilho da guarda, `zz_guarda_empresa`,
  `BEFORE UPDATE` por linha SEM lista de coluna, que ordena por nome depois de todos os BEFORE de UPDATE e recebe a linha
  final; a I3 passa a conferir no catálogo que ele é o último nas 20, e a I9 prova o comportamento (antes da guarda:
  barrado com 42501; depois dela: acusado pela I3). O predicado por regex saiu. A `0173`, que nunca chegou a banco vivo,
  foi regravada na trava de hash com `--regravar-alterada` (ata (k)).
- **4ª rodada** (SHA `a525a9a`, duas lentes: a guarda última — ordem de disparo, WHEN, gatilho de instrução, INSTEAD OF,
  CONSTRAINT TRIGGER, AFTER que faça outro UPDATE, regra, `session_replication_role`, herança —; e a regressão no que já
  existe com o gatilho novo). **Limpa:** a da regressão sem achado; a da guarda, um achado **refutado** pelo cético
  (`session_replication_role = replica` exige superusuário, a mesma classe de `disable trigger`, fora do modelo de ameaça
  — registrado no §12).

**Uma lição do ARE do Postgres**, registrada no próprio roteiro: a gulodice do PRIMEIRO quantificador vale para o RE
inteiro — o `(.*?)` depois de um `\s+` vira guloso. A primeira versão do conserto acusou duas funções reais por isso
(`aplicar_movimentacao`, `vocabulario_unidades_guarda`), e a mesa pegou antes do commit.

---

# 9. A contagem final, antes × depois (a mesa e o CI)

| | antes (v1.69.0) | depois (SHA `a525a9a`) |
|---|---|---|
| `npm run test` | 254 arquivos · 7.693 testes | **256 arquivos · 7.862 testes**, verdes |
| roteiros SQL (CI) | 46 · 1.045 asserções | **51 · 1.095**, 0 ✗ (run `35931622477`) |
| injetor | 138/138 (+2 em quarentena) | **143/143** detectadas pelo cenário nomeado (+2) |
| `db:types:diff` | 38 · 358 · 94 | 38 · 358 · 94 (a fase não cria coluna nem função fora de gatilho) |
| `lint`, `typecheck`, `build`, `contraste`, `verificar:actions` | limpos | limpos |
| FKs entre tabelas de negócio | 23 simples | 23 compostas, mesmos nomes e ações (no CI) |
| uniques de negócio por empresa | 1 (`filiais_empresa_id_uidx`) | os sete pais + os catorze (no CI) |
| gatilhos nas 20 | 8 | 49 (+20 de coluna, +20 últimos, +1 do termo) |

---

# 10. Os 28 critérios, autoverificados

| # | critério | estado |
|---|---|---|
| 1 | lint, test, typecheck, build, contraste, verificar:actions; CI com roteiros, injetor e tipos | ✅ (run `35931622477`) |
| 2 | PLAN-F65 antes do primeiro commit de código, com os 28 fatos, o censo, as 14 decisões e a ordem de rollback | ✅ (`2153b10`) |
| 3 | contagem de violações 0 e "antes" nos dois bancos, só contagem/nome/hash | ✅ (`antes/`, e o refeito do ensaio) |
| 4 | migrations desde a `0165`, classe, rollback no rodapé, `db:lock`, `DA_F38`; sem `update`/`cascade`/`concurrently`/janela | ✅ |
| 5 | 23 FKs compostas, validadas, nomes e ações; sete pais; forma vermelha → verde | ✅ no CI · ⏳ nos bancos |
| 6 | `motivos_pkey` e a FK na mesma migration; import por empresa | ✅ no CI · ⏳ nos bancos |
| 7 | toda unicidade por empresa com o nome; a trava derivada com expressão e parcial; os implícitos nominais | ✅ no CI · ⏳ nos bancos |
| 8 | o snapshot por empresa; `chaveVersao` e `gerados.ts`; o teste lê a fonte nova | ✅ |
| 9 | `guarda_empresa` 42501 nas 20, com a janela aberta; dado intacto; a trava vermelha → verde; a frase em pt-BR | ✅ no CI · ⏳ nos bancos |
| 10 | a diagonal por empresa; o resto byte a byte | ✅ |
| 11 | o termo: recusa A→B, aceita o coerente, o `persistirTermo` passa | ✅ |
| 12 | nenhuma janela quebrada: embeds intactos; conferidor 0 nos dois; smoke 0; `consolidarColaboradores` nos três estados | ✅ embeds e J1/J2 · ⏳ conferidor e smoke |
| 13 | nenhuma tupla reescrita nos dois bancos | ⏳ (L1–L3 no CI) |
| 14 | as funções intocadas byte a byte; as 62 policies | ✅ no CI (L4) · ⏳ nos bancos |
| 15 | o "pronto quando" com o fato 19 | ✅ (F1–F3, E1, E4) |
| 16 | "ninguém lê" com as exceções nominais numa fonte só, acusando o sintético | ✅ |
| 17 | `database.ts` com hand-fix declarado; conferido com a geração do MCP depois do apply; `db:types:diff` verde | ✅ hand-fix e gate · ⏳ a geração do MCP |
| 18 | o injetor na ata; mutações detectadas; teto exato; quarentena < ⅓ | ✅ |
| 19 | o rollback escrito e ensaiado no CI até o "antes"; os das F62/F63/F64 rodam o da F65 antes | ✅ |
| 20 | advisors e paridade | ⏳ |
| 21 | os roteiros adaptados listados, nenhuma asserção mudou para passar | ✅ (§2, ata (c)) |
| 22 | nenhuma dependência; workflows, `CLAUDE.md` da raiz, seed e embeds intocados; linha de base intacta | ✅ |
| 23 | as emendas (MATRIZ, ADR-003, RUNBOOK, PLANO, comentários F67, índices, ata) | ✅ |
| 24 | `1.70.0`, CHANGELOG, registry; a tag | ✅ versão · ⏳ a tag |
| 25 | os dois PRs mergeados, o pós-deploy, a conferência | ⏳ (§1) |
| 26 | as sabotagens A–L com saída real | ✅ (`A-L-sabotagens.md`, `B-travas/`) |
| 27 | nenhum dado real; da produção só contagem/nome/hash; ninguém abriu o `.env.local` | ✅ |
| 28 | este relatório no padrão, com o roteiro no topo, o repouso e o "não prova" | ✅ |

---

# 11. O estado de repouso

- **Produção e ensaio:** exatamente como na v1.69.0 — nenhuma migration da F65 aplicada, nenhuma escrita (só leituras de
  catálogo, contagem e hash pelo MCP).
- **`main`:** intocada (`469632b`); o deploy segue na v1.69.0; a sonda de deriva não vê a F65 (os arquivos não estão na
  `main`).
- **A branch `f65-integridade-do-tenant`:** tudo pronto e verde, PR #77 em rascunho. Repouso seguro indefinidamente; o que
  NÃO se pode fazer é o merge antes do apply (§1.1).

---

# 12. O que este relatório NÃO prova

1. **Nada nos bancos vivos**: nem o `relfilenode` e o md5 antes × depois, nem o conferidor de formas, nem o smoke, nem os
   advisors e a paridade depois da fase — o apply não aconteceu. O que existe é o CI (o Postgres de verdade, com a cadeia
   inteira e os roteiros) e o "antes" dos dois bancos.
2. **Que o `database.ts` bate com a geração do MCP** — o hand-fix das `Relationships` segue a regra do gerador, lida no
   código dele (`views_key_dependencies.sql`), mas a comparação com a geração real só existe depois do apply.
3. **Que a empresa A não VÊ o dado da B**: a leitura continua com o piso até a F66/F72 — a F65 impede a LIGAÇÃO e a
   MUDANÇA, não a leitura.
4. **Que a guarda segure quem tem acesso de dono ou superusuário**: `alter table … disable trigger` e
   `session_replication_role = replica` desligam gatilhos, e exigem privilégio que nenhum papel da aplicação tem (a 4ª
   rodada da revisão adversarial o levantou e o cético refutou como fora do modelo).
5. **Que a ordem dos gatilhos nunca mude**: o `zz_guarda_empresa` é o último PELO NOME; um gatilho BEFORE de UPDATE novo
   com nome que ordene depois dele é acusado pela I3 no CI — a trava é o que garante, não o nome.
6. **O custo do gatilho novo em produção**: uma comparação por linha atualizada nas 20; não foi medido lá (as tabelas são
   pequenas e o UPDATE no acervo é raro — `guarda_acervo` o recusa fora da janela).
7. **Que a mesa (PGlite) seja a régua**: ela aplicou a cadeia e rodou roteiros e injetor antes de cada push, mas o md5 das
   funções difere do CI para a mesma cadeia (ata (e)); o CI é a autoridade.
8. **Que um registro novo de uma segunda empresa receba a empresa certa** (o default é a WAP até a F67), **nem que os ids
   sejam por empresa** (seguem globais, e as 16 travas advisory seguem certas por isso).

---

# 13. Pendências e backlog nomeado

- **Pendente desta fase** (§1.2): o apply no ensaio e em produção com as provas, o conferidor nos dois bancos, o smoke, o
  merge, a `0174` depois do deploy, a conferência pós-deploy, a geração dos tipos pelo MCP contra o hand-fix, o PR de
  documentação e a tag `v1.70.0`.
- **F66** (a ficha ganhou a nota F65): os índices de lista liderados por `empresa_id`, medidos (decisão 1 do Johnny); o
  join por código de `rel_por_motivo_filiais`/`rel_resumo_filiais`; e o delta de `unindexed_foreign_keys` que as 23
  compostas vão abrir no advisor (índice que as cubra pela frente, se a medição pedir).
- **F67** (a ficha ganhou a nota F65): os leitores e o UPDATE por chave natural sozinha (`admin.ts:760-763`, o mais grave),
  `lerVocabularioImport` e a RPC do import, o `max(versao)+1` sem empresa, `idsDeAdminsAtivos`, as travas advisory que
  ela reescreve (convertendo as 16 juntas).
- **Backlog** (decisão 3 do Johnny): o seed de duas empresas, `scripts/seed.test.ts` e o `onConflict` de
  `scripts/seed.ts:886`. **Backlog** (do `RELATORIO-F60.md`): a paginação keyset e a ordem visível no empate.
- **PATCH** (do backlog da F62): derrubar `profiles.papel`/`ativo` a partir de 13/10/2026.
- **Avulsos herdados das F63/F64** (não tocados aqui): os `scratch_tmp/scripts/db/{corpo-vigente,mutacoes}.mjs`
  rastreados pelo git; o corpo vivo de `apagar_movimentacao`/`resetar_acervo` × o arquivo.

---

# 14. O merge, o deploy e a conferência pós-deploy

**Pendentes** — dependem do apply (§1.2).
