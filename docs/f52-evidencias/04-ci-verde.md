# F52 — a saída REAL do CI verde (run 34271810257, 08/09/2026)

PR https://github.com/vmatusita/ti-wap-inventory-control/pull/35 · commit 9b12e6c
Os dois checks obrigatórios verdes: `verificar` (4m42s) e `banco-sem-docker` (1m50s).

## Os 31 roteiros SQL — 671 asserções, 0 falhas

```
FIM asof_desempate: 4 asserções, 0 falhas
FIM asserts_ferramenta: 7 asserções, 0 falhas
FIM cargo_dev: 58 asserções, 0 falhas
FIM catalogo_policies: 15 asserções, 0 falhas
FIM catalogo_secdef: 9 asserções, 0 falhas
FIM conflito_filiais: 43 asserções, 0 falhas
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
FIM seguranca_catalogo: 8 asserções, 0 falhas
FIM storage_termo: 13 asserções, 0 falhas
FIM transferencia_item: 18 asserções, 0 falhas
FIM transicoes_extra: 13 asserções, 0 falhas
FIM troca: 13 asserções, 0 falhas
```

**31 roteiros** (eram 29 rodados; a F52 acrescentou `definer_sem_tenant.sql` e
`import_fora_da_unidade.sql`), **671 asserções**, **0 falhas** em todos.

## O injetor — 55/55 acusadas pelo cenário NOMEADO

```
f52-escopo-de-gestao-some-do-corpo                         cargo_dev.sql               7c             detectada            355 ms
f52-escopo-de-gestao-passa-a-recusar                       cargo_dev.sql               7a,7j          detectada            380 ms
f52-admin-ativo-volta-a-igualdade-crua                     cargo_dev.sql               7f,7i          detectada            541 ms
f52-import-perde-a-guarda-de-filial                        import_fora_da_unidade.sql  5a-ter         detectada            423 ms
f52-backup-do-import-aceita-qualquer-prefixo               import_fora_da_unidade.sql  2a             detectada            344 ms
f52-import-volta-a-nao-conferir-confirmacao                import_fora_da_unidade.sql  3a             detectada            427 ms
f52-import-perde-a-janela-de-idempotencia                  import_fora_da_unidade.sql  4a             detectada            368 ms
f52-mesa-perde-a-guarda-de-pertencimento                   conflito_filiais.sql        10b            detectada            357 ms
55/55 detectadas pelo cenário nomeado · 22178 ms no total
```

As **oito** da F52 detectadas pelo cenário nomeado. A segunda linha —
`f52-escopo-de-gestao-passa-a-recusar` — é a **Sabotagem B** virada mutação
permanente: ela faz `mesmo_escopo_de_gestao` devolver `false` e derruba os cenários
**positivos** (7a, 7j). É a única prova possível de que a guarda está **no caminho**
das cinco RPCs, e não pendurada num ramo que ninguém percorre.

## A quarentena, com o endereço de cada uma

```
QUARENTENA — 2 quebra(s) REAL(is) que o rig de hoje não sabe acusar.
  · conflito-serializacao-por-advisory-lock  [conflito_filiais.sql · adota: F55]
  · conflito-backup-em-arquivo-sem-prefixo-do-digest  [conflito_filiais.sql · adota: F54]
```
