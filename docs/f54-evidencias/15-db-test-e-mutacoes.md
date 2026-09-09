# `npm run db:test` e `db:test:mutations` — a execução VERDE no `banco-sem-docker`

Run [34378647343](https://github.com/vmatusita/ti-wap-inventory-control/actions/runs/34378647343), commit `63f4834`, **1m49s**.

## Os 32 roteiros — 706 asserções, ZERO falhas

```
FIM asof_desempate: 18 asserções, 0 falhas
FIM asserts_ferramenta: 7 asserções, 0 falhas
FIM cargo_dev: 58 asserções, 0 falhas
FIM catalogo_policies: 15 asserções, 0 falhas
FIM catalogo_secdef: 9 asserções, 0 falhas
FIM conflito_filiais: 51 asserções, 0 falhas
FIM definer_sem_tenant: 6 asserções, 0 falhas
FIM dev_destrutivo: 108 asserções, 0 falhas
FIM dominios_login: 16 asserções, 0 falhas
FIM f34_triagem_reserva: 21 asserções, 0 falhas
FIM f36_detentor: 18 asserções, 0 falhas
FIM f37_colaboradores_tipos: 26 asserções, 0 falhas
FIM f38_itens_com_ativo: 51 asserções, 0 falhas
FIM f41_regularizacao: 25 asserções, 0 falhas
FIM fuso_do_negocio: 5 asserções, 0 falhas
FIM import_fora_da_unidade: 14 asserções, 0 falhas
FIM import_substituir: 19 asserções, 0 falhas
FIM isolamento_tenant: 11 asserções, 0 falhas
FIM itens_extra: 4 asserções, 0 falhas
FIM itens_quantidade: 14 asserções, 0 falhas
FIM manutencao_fornecedor: 19 asserções, 0 falhas
FIM maquina_estados: 14 asserções, 0 falhas
FIM papeis_rls: 77 asserções, 0 falhas
FIM pendencias_import_termo: 5 asserções, 0 falhas
FIM pendencias_item: 13 asserções, 0 falhas
FIM reabrir_pendencia_item: 4 asserções, 0 falhas
FIM restauracao: 13 asserções, 0 falhas
FIM seguranca_catalogo: 8 asserções, 0 falhas
FIM storage_termo: 13 asserções, 0 falhas
FIM transferencia_item: 18 asserções, 0 falhas
FIM transicoes_extra: 13 asserções, 0 falhas
FIM troca: 13 asserções, 0 falhas
```

**Antes da F54:** 31 roteiros. **Depois:** 32 — `restauracao.sql` (13) é novo, e
`conflito_filiais` foi de **43 para 51** (o §11, com os 26 ativos em conflito).
`f41_regularizacao` seguiu com 25: a asserção 12 dele mudou de valor (11 → 12 checagens),
não de quantidade.

## O injetor — 63/63 detectadas pelo cenário NOMEADO

```
==== supabase/tests/restauracao.sql ====
psql:supabase/tests/restauracao.sql:397: NOTICE:  ✓ 1a cenário montado, toda movimentação com `ordem` (0 de 3 conferidos)
psql:supabase/tests/restauracao.sql:397: NOTICE:  ✓ 1b o trigger criou 1 pendência de item (é ela que o cenário 3c duplica)
psql:supabase/tests/restauracao.sql:397: NOTICE:  ✓ 4a `ativos` entra primeiro, sem violar FK
psql:supabase/tests/restauracao.sql:397: NOTICE:  ✓ 2a sem `overriding system value` o INSERT é RECUSADO (generated always)
psql:supabase/tests/restauracao.sql:397: NOTICE:  ✓ 2b com `overriding system value`, a `ordem` do backup (237) foi preservada
psql:supabase/tests/restauracao.sql:397: NOTICE:  ✓ 3b com o trigger desligado, `ativos.status` NÃO foi reescrito pela reinserção
psql:supabase/tests/restauracao.sql:397: NOTICE:  ✓ 3a com o trigger LIGADO, `ativos.status` foi reescrito (em_estoque → em_uso) por cima do restaurado
psql:supabase/tests/restauracao.sql:397: NOTICE:  ✓ 3c com o trigger LIGADO a pendência DUPLICA (2 linhas para 1 item) — é por isso que a Decisão 7 desliga o trigger
psql:supabase/tests/restauracao.sql:397: NOTICE:  ✓ 3d o estado derivado pela máquina (em_estoque) coincide com o do backup
psql:supabase/tests/restauracao.sql:397: NOTICE:  ✓ 2c sem `setval`, a PRIMEIRA movimentação depois da restauração viola o índice único de `ordem`
psql:supabase/tests/restauracao.sql:397: NOTICE:  ✓ 2d com `setval` para max(ordem), a movimentação seguinte entra sem colidir
psql:supabase/tests/restauracao.sql:397: NOTICE:  ✓ 5a fora da janela, `guarda_acervo` permite INSERT comum e RECUSA `forcado = true`
psql:supabase/tests/restauracao.sql:397: NOTICE:  ✓ 5b dentro da janela, a linha `forcado = true` do backup pode ser restaurada
psql:supabase/tests/restauracao.sql:397: NOTICE:  FIM restauracao: 13 asserções, 0 falhas
roteiros do lote .... asof_desempate.sql, cargo_dev.sql, catalogo_policies.sql, catalogo_secdef.sql, conflito_filiais.sql, dev_destrutivo.sql, import_fora_da_unidade.sql, import_substituir.sql, papeis_rls.sql, restauracao.sql, seguranca_catalogo.sql
[40/63] conflito-backup-em-arquivo-sem-prefixo-do-digest  →  conflito_filiais.sql  (espera ✗ 11e, 11f, 11g, 11h)
[60/63] ordem-deixa-de-ser-generated-always  →  restauracao.sql  (espera ✗ 2a)
[61/63] indice-unico-da-ordem-sumiu  →  restauracao.sql  (espera ✗ 2c)
[62/63] guarda-acervo-aceita-forcado-fora-da-janela  →  restauracao.sql  (espera ✗ 5a)
[63/63] trigger-para-de-abrir-pendencia-de-item  →  restauracao.sql  (espera ✗ 1b, 3c)
conflito-backup-em-arquivo-sem-prefixo-do-digest           conflito_filiais.sql        11e,11f,11g,11h  detectada            418 ms
ordem-deixa-de-ser-generated-always                        restauracao.sql             2a               detectada            366 ms
indice-unico-da-ordem-sumiu                                restauracao.sql             2c               detectada            405 ms
guarda-acervo-aceita-forcado-fora-da-janela                restauracao.sql             5a               detectada            441 ms
trigger-para-de-abrir-pendencia-de-item                    restauracao.sql             1b,3c            detectada            376 ms
63/63 detectadas pelo cenário nomeado · 25132 ms no total
```

As **cinco** que a F54 acrescentou ao lote (quatro novas + uma promovida da quarentena)
estão todas na lista, cada uma acusada pelo rótulo que ela nomeia. Lote: **63 ativas**
(teto 64), quarentena **2**.
