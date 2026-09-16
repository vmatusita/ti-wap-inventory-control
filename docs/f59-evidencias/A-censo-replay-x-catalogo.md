# Conferência replay × catálogo (ensaio/produção) — F59

Medido em 2026-09-16T14:28:30.017Z. Fontes lidas: replay=true, ensaio=true, producao=true.

Script gerador: `conferir.mjs` (descartável, só leitura dos três JSON do scratchpad).

## 1. Totais gerais

| fonte | total de policies vivas |
| --- | --- |
| replay | 61 |
| ensaio | 61 |
| producao | 61 |

## 2. Contagens por schema × verbo, lado a lado

| schema | verbo | replay | ensaio | producao | bate |
| --- | --- | --- | --- | --- | --- |
| public | SELECT | 22 | 22 | 22 | sim |
| public | INSERT | 14 | 14 | 14 | sim |
| public | UPDATE | 11 | 11 | 11 | sim |
| public | DELETE | 6 | 6 | 6 | sim |
| storage | SELECT | 2 | 2 | 2 | sim |
| storage | INSERT | 2 | 2 | 2 | sim |
| storage | UPDATE | 2 | 2 | 2 | sim |
| storage | DELETE | 2 | 2 | 2 | sim |

Subtotais por schema:

| schema | replay | ensaio | producao |
| --- | --- | --- | --- |
| public | 53 | 53 | 53 |
| storage | 8 | 8 | 8 |

## 3. Conjunto de nomes — divergências

- Presentes nas três fontes: **61**
- Só no replay (ausentes dos dois bancos): **0**
- Só no ensaio: **0**
- Só em produção: **0**
- Nos dois bancos mas ausentes do replay: **0**
- Outras combinações (replay+ensaio sem produção, etc.): **0**

### Só no replay

_(nenhuma)_

### Só no ensaio

_(nenhuma)_

### Só em produção

_(nenhuma)_

### Nos dois bancos, ausentes do replay

_(nenhuma)_

## 4. Divergências de verbo

_(nenhuma — o verbo bate nas três fontes para toda policy presente em mais de uma)_

## 5. Divergências de função (using/with_check), policies presentes nas três fontes

_(nenhuma — para toda policy presente nas três fontes, o conjunto de funções citadas em using/with_check é idêntico, ignorando esquema e caixa)_

## 6. Classificação de cada divergência encontrada

_(nenhuma divergência encontrada em nenhum dos quatro critérios — replay e os dois catálogos concordam integralmente: mesmos nomes, mesmos verbos, mesmas funções)_

## 7. Amostra da comparação de funções (todas as policies presentes nas três fontes)

| chave | funções (replay) | funções (ensaio) | funções (produção) | bate |
| --- | --- | --- | --- | --- |
| `public._bkp_relatorios_gerados_f6a / dev le backup f6a` | e_dev | e_dev | e_dev | sim |
| `public.anotacoes / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.anotacoes / operador anota` | pode_escrever | pode_escrever | pode_escrever | sim |
| `public.ativos / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.ativos / operador atualiza` | pode_escrever_filial | pode_escrever_filial | pode_escrever_filial | sim |
| `public.ativos / operador insere` | pode_escrever_filial | pode_escrever_filial | pode_escrever_filial | sim |
| `public.colaboradores / admin atualiza colaborador` | e_admin | e_admin | e_admin | sim |
| `public.colaboradores / escrita cria colaborador` | pode_escrever | pode_escrever | pode_escrever | sim |
| `public.colaboradores / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.eventos_admin / admin le auditoria` | e_admin | e_admin | e_admin | sim |
| `public.filiais / admin apaga` | e_admin | e_admin | e_admin | sim |
| `public.filiais / admin atualiza` | e_admin | e_admin | e_admin | sim |
| `public.filiais / admin insere` | e_admin | e_admin | e_admin | sim |
| `public.filiais / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.import_logs / leitura operador` | e_admin | e_admin | e_admin | sim |
| `public.import_logs / operador insere` | e_admin | e_admin | e_admin | sim |
| `public.import_prefixos_patrimonio / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.import_termos_categoria / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.import_termos_estado / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.itens / admin apaga` | e_admin | e_admin | e_admin | sim |
| `public.itens / admin atualiza` | e_admin | e_admin | e_admin | sim |
| `public.itens / escrita cria item` | pode_escrever | pode_escrever | pode_escrever | sim |
| `public.itens / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.kits_modelos / admin apaga` | e_admin | e_admin | e_admin | sim |
| `public.kits_modelos / admin atualiza` | e_admin | e_admin | e_admin | sim |
| `public.kits_modelos / admin insere` | e_admin | e_admin | e_admin | sim |
| `public.kits_modelos / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.lancamentos_item / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.lancamentos_item / operador lanca` | estorno_item_coerente, pode_escrever_filial | estorno_item_coerente, pode_escrever_filial | estorno_item_coerente, pode_escrever_filial | sim |
| `public.motivos / admin apaga` | e_admin | e_admin | e_admin | sim |
| `public.motivos / admin atualiza` | e_admin | e_admin | e_admin | sim |
| `public.motivos / admin insere` | e_admin | e_admin | e_admin | sim |
| `public.motivos / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.movimentacoes / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.movimentacoes / operador insere` | pode_escrever_filial | pode_escrever_filial | pode_escrever_filial | sim |
| `public.operador_filiais / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.pendencias_item / pendencias_item admin reabre` | e_admin, pode_escrever_filial | e_admin, pode_escrever_filial | e_admin, pode_escrever_filial | sim |
| `public.pendencias_item / pendencias_item leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.pendencias_item / pendencias_item operador resolve` | pode_escrever_filial | pode_escrever_filial | pode_escrever_filial | sim |
| `public.profiles / atualiza proprio perfil` | uid | uid | uid | sim |
| `public.profiles / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.relatorios_gerados / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.relatorios_gerados / operador gera` | pode_escrever | pode_escrever | pode_escrever | sim |
| `public.termos_gerados / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.termos_gerados / operador apaga` | pode_escrever_termo | pode_escrever_termo | pode_escrever_termo | sim |
| `public.termos_gerados / operador atualiza` | array_length, coalesce, pode_escrever_termo, termo_ancora_coerente | array_length, coalesce, pode_escrever_termo, termo_ancora_coerente | array_length, coalesce, pode_escrever_termo, termo_ancora_coerente | sim |
| `public.termos_gerados / operador insere` | array_length, coalesce, pode_escrever_termo, termo_ancora_coerente | array_length, coalesce, pode_escrever_termo, termo_ancora_coerente | array_length, coalesce, pode_escrever_termo, termo_ancora_coerente | sim |
| `public.tipos_item / admin atualiza tipo` | e_admin | e_admin | e_admin | sim |
| `public.tipos_item / admin insere tipo` | e_admin | e_admin | e_admin | sim |
| `public.tipos_item / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `public.unidades_apelidos / admin apaga apelido` | e_admin | e_admin | e_admin | sim |
| `public.unidades_apelidos / admin insere apelido` | e_admin | e_admin | e_admin | sim |
| `public.unidades_apelidos / leitura operador` | papel_atual | papel_atual | papel_atual | sim |
| `storage.objects / backups-import apaga operador` | e_admin | e_admin | e_admin | sim |
| `storage.objects / backups-import atualiza operador` | e_admin | e_admin | e_admin | sim |
| `storage.objects / backups-import insere operador` | e_admin | e_admin | e_admin | sim |
| `storage.objects / backups-import leitura operador` | e_admin | e_admin | e_admin | sim |
| `storage.objects / termos apaga operador` | pode_escrever, pode_escrever_arquivo_termo | pode_escrever, pode_escrever_arquivo_termo | pode_escrever, pode_escrever_arquivo_termo | sim |
| `storage.objects / termos atualiza operador` | pode_escrever, pode_escrever_arquivo_termo | pode_escrever, pode_escrever_arquivo_termo | pode_escrever, pode_escrever_arquivo_termo | sim |
| `storage.objects / termos insere operador` | pode_escrever, pode_escrever_arquivo_termo | pode_escrever, pode_escrever_arquivo_termo | pode_escrever, pode_escrever_arquivo_termo | sim |
| `storage.objects / termos leitura operador` | pode_ler_arquivo_termo | pode_ler_arquivo_termo | pode_ler_arquivo_termo | sim |


## 5. A quarta fonte — `pg_policies` do banco do CI (acrescentado depois da primeira rodada do par)

Run `35113464557` do `banco-sem-docker` (PR #50, SHA `96a6827`), `supabase/tests/catalogo_policies.sql`:

- `✓ 5 nenhuma policy com predicado equivalente a true (0 de 61 conferidos)` — **61** policies em `public` + `storage`;
- `✓ 10a toda policy de public está no universo congelado da doutrina (0 de 53 conferidos)` e `✓ 10b … (0 de 53)` —
  as **53** de `public` são, nome a nome, as de `k_policies_public`, que a trava de mesa compara com o replay;
- `✓ 8a … (0 de 8)` e `✓ 8b … (0 de 8)` — as **8** de `storage.objects` são as de `k_storage`.

Replay × ensaio × produção × CI: **61 = 61 = 61 = 61**, mesmos nomes (a igualdade com o CI é transitiva, por asserção
nos dois lados da lista congelada — `policies-initplan.test.ts` describe 1 e as asserções 10a/10b/8a/8b).
