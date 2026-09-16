# Ocorrências função × policy (F59 · Frente A · replay de texto)

Medido em 2026-09-16T14:21:28.068Z. 139 migrations (0001 → 0140_import_desarma_fk.sql).

## Contagens

- Policies vivas: **61**
  - `public`: DELETE 6 · INSERT 14 · SELECT 22 · UPDATE 11
  - `storage`: DELETE 2 · INSERT 2 · SELECT 2 · UPDATE 2
- Comandos DDL de policy nas migrations: create 76 · alter 46 · drop 16 · **total 138**
- Prova de consumo (varredura de texto × replay consumido): {"create":76,"alter":46,"drop":16} × {"create":76,"alter":46,"drop":16} → **bate: true**
- DDL de policy dinâmico (execute/format): **0**
- Menção a policy dentro de corpo de função ($$...$$): **0**
- Comandos de policy ilegíveis pelo parser: **0**
- Sub-selects com FROM/EXISTS/IN (fora de chamada de função): **0**

## Ocorrências função × policy — total 86

sem_argumento=62 (fora de select: 0) · dado_da_linha=24 · so_constante=0 · mista=0

### Dado da LINHA (coluna nua/qualificada/expressão)

| policy | cláusula | função | argumentos | embrulhada em (select …) |
|---|---|---|---|---|
| `public.ativos / operador atualiza` | using | `public.pode_escrever_filial` | `(filial_id)` | false |
| `public.ativos / operador atualiza` | with_check | `public.pode_escrever_filial` | `(filial_id)` | false |
| `public.ativos / operador insere` | with_check | `public.pode_escrever_filial` | `(filial_id)` | false |
| `public.lancamentos_item / operador lanca` | with_check | `public.pode_escrever_filial` | `(filial_id)` | false |
| `public.lancamentos_item / operador lanca` | with_check | `public.estorno_item_coerente` | `(estorna_id, filial_id, item_id)` | false |
| `public.movimentacoes / operador insere` | with_check | `public.pode_escrever_filial` | `(filial_id)` | false |
| `public.movimentacoes / operador insere` | with_check | `public.pode_escrever_filial` | `((snapshot_anterior ->> 'filial_id')::smallint)` | false |
| `public.pendencias_item / pendencias_item admin reabre` | using | `public.pode_escrever_filial` | `(filial_id)` | false |
| `public.pendencias_item / pendencias_item admin reabre` | with_check | `public.pode_escrever_filial` | `(filial_id)` | false |
| `public.pendencias_item / pendencias_item operador resolve` | using | `public.pode_escrever_filial` | `(filial_id)` | false |
| `public.pendencias_item / pendencias_item operador resolve` | with_check | `public.pode_escrever_filial` | `(filial_id)` | false |
| `public.termos_gerados / operador apaga` | using | `public.pode_escrever_termo` | `(ativo_ids)` | false |
| `public.termos_gerados / operador atualiza` | using | `public.pode_escrever_termo` | `(ativo_ids)` | false |
| `public.termos_gerados / operador atualiza` | with_check | `array_length` | `(ativo_ids, 1)` | false |
| `public.termos_gerados / operador atualiza` | with_check | `public.pode_escrever_termo` | `(ativo_ids)` | false |
| `public.termos_gerados / operador atualiza` | with_check | `public.termo_ancora_coerente` | `(movimentacao_ids, ativo_ids)` | false |
| `public.termos_gerados / operador insere` | with_check | `array_length` | `(ativo_ids, 1)` | false |
| `public.termos_gerados / operador insere` | with_check | `public.pode_escrever_termo` | `(ativo_ids)` | false |
| `public.termos_gerados / operador insere` | with_check | `public.termo_ancora_coerente` | `(movimentacao_ids, ativo_ids)` | false |
| `storage.objects / termos apaga operador` | using | `public.pode_escrever_arquivo_termo` | `(name)` | false |
| `storage.objects / termos atualiza operador` | using | `public.pode_escrever_arquivo_termo` | `(name)` | false |
| `storage.objects / termos atualiza operador` | with_check | `public.pode_escrever_arquivo_termo` | `(name)` | false |
| `storage.objects / termos insere operador` | with_check | `public.pode_escrever_arquivo_termo` | `(name)` | false |
| `storage.objects / termos leitura operador` | using | `public.pode_ler_arquivo_termo` | `(name)` | true |

### SEM argumento

| policy | cláusula | função | embrulhada em (select …) |
|---|---|---|---|
| `public._bkp_relatorios_gerados_f6a / dev le backup f6a` | using | `public.e_dev` | true |
| `public.anotacoes / leitura operador` | using | `public.papel_atual` | true |
| `public.anotacoes / operador anota` | with_check | `public.pode_escrever` | true |
| `public.ativos / leitura operador` | using | `public.papel_atual` | true |
| `public.colaboradores / admin atualiza colaborador` | using | `public.e_admin` | true |
| `public.colaboradores / admin atualiza colaborador` | with_check | `public.e_admin` | true |
| `public.colaboradores / escrita cria colaborador` | with_check | `public.pode_escrever` | true |
| `public.colaboradores / leitura operador` | using | `public.papel_atual` | true |
| `public.eventos_admin / admin le auditoria` | using | `public.e_admin` | true |
| `public.filiais / admin apaga` | using | `public.e_admin` | true |
| `public.filiais / admin atualiza` | using | `public.e_admin` | true |
| `public.filiais / admin atualiza` | with_check | `public.e_admin` | true |
| `public.filiais / admin insere` | with_check | `public.e_admin` | true |
| `public.filiais / leitura operador` | using | `public.papel_atual` | true |
| `public.import_logs / leitura operador` | using | `public.e_admin` | true |
| `public.import_logs / operador insere` | with_check | `public.e_admin` | true |
| `public.import_prefixos_patrimonio / leitura operador` | using | `public.papel_atual` | true |
| `public.import_termos_categoria / leitura operador` | using | `public.papel_atual` | true |
| `public.import_termos_estado / leitura operador` | using | `public.papel_atual` | true |
| `public.itens / admin apaga` | using | `public.e_admin` | true |
| `public.itens / admin atualiza` | using | `public.e_admin` | true |
| `public.itens / admin atualiza` | with_check | `public.e_admin` | true |
| `public.itens / escrita cria item` | with_check | `public.pode_escrever` | true |
| `public.itens / leitura operador` | using | `public.papel_atual` | true |
| `public.kits_modelos / admin apaga` | using | `public.e_admin` | true |
| `public.kits_modelos / admin atualiza` | using | `public.e_admin` | true |
| `public.kits_modelos / admin atualiza` | with_check | `public.e_admin` | true |
| `public.kits_modelos / admin insere` | with_check | `public.e_admin` | true |
| `public.kits_modelos / leitura operador` | using | `public.papel_atual` | true |
| `public.lancamentos_item / leitura operador` | using | `public.papel_atual` | true |
| `public.motivos / admin apaga` | using | `public.e_admin` | true |
| `public.motivos / admin atualiza` | using | `public.e_admin` | true |
| `public.motivos / admin atualiza` | with_check | `public.e_admin` | true |
| `public.motivos / admin insere` | with_check | `public.e_admin` | true |
| `public.motivos / leitura operador` | using | `public.papel_atual` | true |
| `public.movimentacoes / leitura operador` | using | `public.papel_atual` | true |
| `public.operador_filiais / leitura operador` | using | `public.papel_atual` | true |
| `public.pendencias_item / pendencias_item admin reabre` | using | `public.e_admin` | true |
| `public.pendencias_item / pendencias_item admin reabre` | with_check | `public.e_admin` | true |
| `public.pendencias_item / pendencias_item leitura operador` | using | `public.papel_atual` | true |
| `public.profiles / atualiza proprio perfil` | using | `auth.uid` | true |
| `public.profiles / atualiza proprio perfil` | with_check | `auth.uid` | true |
| `public.profiles / leitura operador` | using | `public.papel_atual` | true |
| `public.relatorios_gerados / leitura operador` | using | `public.papel_atual` | true |
| `public.relatorios_gerados / operador gera` | with_check | `public.pode_escrever` | true |
| `public.termos_gerados / leitura operador` | using | `public.papel_atual` | true |
| `public.tipos_item / admin atualiza tipo` | using | `public.e_admin` | true |
| `public.tipos_item / admin atualiza tipo` | with_check | `public.e_admin` | true |
| `public.tipos_item / admin insere tipo` | with_check | `public.e_admin` | true |
| `public.tipos_item / leitura operador` | using | `public.papel_atual` | true |
| `public.unidades_apelidos / admin apaga apelido` | using | `public.e_admin` | true |
| `public.unidades_apelidos / admin insere apelido` | with_check | `public.e_admin` | true |
| `public.unidades_apelidos / leitura operador` | using | `public.papel_atual` | true |
| `storage.objects / backups-import apaga operador` | using | `public.e_admin` | true |
| `storage.objects / backups-import atualiza operador` | using | `public.e_admin` | true |
| `storage.objects / backups-import atualiza operador` | with_check | `public.e_admin` | true |
| `storage.objects / backups-import insere operador` | with_check | `public.e_admin` | true |
| `storage.objects / backups-import leitura operador` | using | `public.e_admin` | true |
| `storage.objects / termos apaga operador` | using | `public.pode_escrever` | true |
| `storage.objects / termos atualiza operador` | using | `public.pode_escrever` | true |
| `storage.objects / termos atualiza operador` | with_check | `public.pode_escrever` | true |
| `storage.objects / termos insere operador` | with_check | `public.pode_escrever` | true |

### SÓ constante(s)

| policy | cláusula | função | argumentos | embrulhada em (select …) |
|---|---|---|---|---|

### Sub-selects com FROM / EXISTS / IN

(nenhum encontrado)

### DDL de policy dinâmico

(nenhum encontrado — varredura de texto por `execute` / `format(` combinado com `create|alter|drop policy`)

### Comando de policy dentro de corpo de função ($$...$$)

(nenhum encontrado)

### `comment on policy` — forma DIFERENTE, corretamente EXCLUÍDA da contagem de DDL

| arquivo | linha | policy |
|---|---|---|
| 0103_reabrir_pendencia_item_admin.sql | 9 | pendencias_item operador resolve |
| 0103_reabrir_pendencia_item_admin.sql | 17 | pendencias_item admin reabre |
| 0107_pendencias_item_admin_reabre_initplan.sql | 5 | pendencias_item admin reabre |
| 0125_item_chave_e_regularizacao.sql | 43 | escrita cria item |

### Ocorrências policy × função deduplicadas (o número do fato 3)

18 pares (policy, função) distintos — 13 policies distintas, 7 funções distintas.

| policy | função |
|---|---|
| `public.ativos / operador atualiza` | `public.pode_escrever_filial` |
| `public.ativos / operador insere` | `public.pode_escrever_filial` |
| `public.lancamentos_item / operador lanca` | `public.pode_escrever_filial` |
| `public.lancamentos_item / operador lanca` | `public.estorno_item_coerente` |
| `public.movimentacoes / operador insere` | `public.pode_escrever_filial` |
| `public.pendencias_item / pendencias_item admin reabre` | `public.pode_escrever_filial` |
| `public.pendencias_item / pendencias_item operador resolve` | `public.pode_escrever_filial` |
| `public.termos_gerados / operador apaga` | `public.pode_escrever_termo` |
| `public.termos_gerados / operador atualiza` | `public.pode_escrever_termo` |
| `public.termos_gerados / operador atualiza` | `array_length` |
| `public.termos_gerados / operador atualiza` | `public.termo_ancora_coerente` |
| `public.termos_gerados / operador insere` | `array_length` |
| `public.termos_gerados / operador insere` | `public.pode_escrever_termo` |
| `public.termos_gerados / operador insere` | `public.termo_ancora_coerente` |
| `storage.objects / termos apaga operador` | `public.pode_escrever_arquivo_termo` |
| `storage.objects / termos atualiza operador` | `public.pode_escrever_arquivo_termo` |
| `storage.objects / termos insere operador` | `public.pode_escrever_arquivo_termo` |
| `storage.objects / termos leitura operador` | `public.pode_ler_arquivo_termo` |

### Comandos de policy ilegíveis

(nenhum — todo comando de policy foi reconhecido pelo parser)

## Lista completa das policies vivas

| schema.tabela | policy | verbo | using | with_check | origem |
|---|---|---|---|---|---|
| public._bkp_relatorios_gerados_f6a | dev le backup f6a | SELECT | `(select public.e_dev())` | `` | 0128_adota_bkp_relatorios_f6a.sql |
| public.anotacoes | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0070_papeis_leitura_perfil_ativo.sql |
| public.anotacoes | operador anota | INSERT | `` | `(select public.pode_escrever())` | 0072_papel_dev_funcoes.sql |
| public.ativos | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0070_papeis_leitura_perfil_ativo.sql |
| public.ativos | operador atualiza | UPDATE | `public.pode_escrever_filial(filial_id)` | `public.pode_escrever_filial(filial_id)` | 0063_papeis_policies.sql |
| public.ativos | operador insere | INSERT | `` | `public.pode_escrever_filial(filial_id)` | 0063_papeis_policies.sql |
| public.colaboradores | admin atualiza colaborador | UPDATE | `(select public.e_admin())` | `(select public.e_admin())` | 0112_colaboradores.sql |
| public.colaboradores | escrita cria colaborador | INSERT | `` | `(select public.pode_escrever())` | 0112_colaboradores.sql |
| public.colaboradores | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0112_colaboradores.sql |
| public.eventos_admin | admin le auditoria | SELECT | `(select public.e_admin())` | `` | 0065_eventos_admin.sql |
| public.filiais | admin apaga | DELETE | `(select public.e_admin())` | `` | 0063_papeis_policies.sql |
| public.filiais | admin atualiza | UPDATE | `(select public.e_admin())` | `(select public.e_admin())` | 0063_papeis_policies.sql |
| public.filiais | admin insere | INSERT | `` | `(select public.e_admin())` | 0063_papeis_policies.sql |
| public.filiais | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0070_papeis_leitura_perfil_ativo.sql |
| public.import_logs | leitura operador | SELECT | `(select public.e_admin())` | `` | 0063_papeis_policies.sql |
| public.import_logs | operador insere | INSERT | `` | `(select public.e_admin())` | 0067_papeis_correcoes_revisao.sql |
| public.import_prefixos_patrimonio | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0139_vocabulario_import.sql |
| public.import_termos_categoria | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0139_vocabulario_import.sql |
| public.import_termos_estado | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0139_vocabulario_import.sql |
| public.itens | admin apaga | DELETE | `(select public.e_admin())` | `` | 0063_papeis_policies.sql |
| public.itens | admin atualiza | UPDATE | `(select public.e_admin())` | `(select public.e_admin())` | 0063_papeis_policies.sql |
| public.itens | escrita cria item | INSERT | `` | `(select public.pode_escrever())` | 0125_item_chave_e_regularizacao.sql |
| public.itens | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0070_papeis_leitura_perfil_ativo.sql |
| public.kits_modelos | admin apaga | DELETE | `(select public.e_admin())` | `` | 0063_papeis_policies.sql |
| public.kits_modelos | admin atualiza | UPDATE | `(select public.e_admin())` | `(select public.e_admin())` | 0063_papeis_policies.sql |
| public.kits_modelos | admin insere | INSERT | `` | `(select public.e_admin())` | 0063_papeis_policies.sql |
| public.kits_modelos | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0070_papeis_leitura_perfil_ativo.sql |
| public.lancamentos_item | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0070_papeis_leitura_perfil_ativo.sql |
| public.lancamentos_item | operador lanca | INSERT | `` | `public.pode_escrever_filial(filial_id) and public.estorno_item_coerente(estorna_id, filial_id, item_id)` | 0068_estorno_item_mesma_filial.sql |
| public.motivos | admin apaga | DELETE | `(select public.e_admin())` | `` | 0063_papeis_policies.sql |
| public.motivos | admin atualiza | UPDATE | `(select public.e_admin())` | `(select public.e_admin())` | 0063_papeis_policies.sql |
| public.motivos | admin insere | INSERT | `` | `(select public.e_admin())` | 0063_papeis_policies.sql |
| public.motivos | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0070_papeis_leitura_perfil_ativo.sql |
| public.movimentacoes | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0070_papeis_leitura_perfil_ativo.sql |
| public.movimentacoes | operador insere | INSERT | `` | `public.pode_escrever_filial(filial_id) and public.pode_escrever_filial((snapshot_anterior ->> 'filial_id')::smallint)` | 0067_papeis_correcoes_revisao.sql |
| public.operador_filiais | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0070_papeis_leitura_perfil_ativo.sql |
| public.pendencias_item | pendencias_item admin reabre | UPDATE | `(select public.e_admin()) and public.pode_escrever_filial(filial_id) and status = 'resolvida'` | `(select public.e_admin()) and public.pode_escrever_filial(filial_id) and status = 'aberta'` | 0107_pendencias_item_admin_reabre_initplan.sql |
| public.pendencias_item | pendencias_item leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0070_papeis_leitura_perfil_ativo.sql |
| public.pendencias_item | pendencias_item operador resolve | UPDATE | `public.pode_escrever_filial(filial_id) and status = 'aberta'` | `public.pode_escrever_filial(filial_id)` | 0103_reabrir_pendencia_item_admin.sql |
| public.profiles | atualiza proprio perfil | UPDATE | `id = (select auth.uid())` | `id = (select auth.uid())` | 0059_advisors_rls_perf.sql |
| public.profiles | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0070_papeis_leitura_perfil_ativo.sql |
| public.relatorios_gerados | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0070_papeis_leitura_perfil_ativo.sql |
| public.relatorios_gerados | operador gera | INSERT | `` | `(select public.pode_escrever())` | 0072_papel_dev_funcoes.sql |
| public.termos_gerados | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0070_papeis_leitura_perfil_ativo.sql |
| public.termos_gerados | operador apaga | DELETE | `public.pode_escrever_termo(ativo_ids)` | `` | 0069_termos_mesma_filial.sql |
| public.termos_gerados | operador atualiza | UPDATE | `public.pode_escrever_termo(ativo_ids)` | `coalesce(array_length(ativo_ids, 1), 0) > 0 and public.pode_escrever_termo(ativo_ids) and public.termo_ancora_coerente(movimentacao_ids, ativo_ids) and arquivo_` | 0069_termos_mesma_filial.sql |
| public.termos_gerados | operador insere | INSERT | `` | `coalesce(array_length(ativo_ids, 1), 0) > 0 and public.pode_escrever_termo(ativo_ids) and public.termo_ancora_coerente(movimentacao_ids, ativo_ids) and arquivo_` | 0069_termos_mesma_filial.sql |
| public.tipos_item | admin atualiza tipo | UPDATE | `(select public.e_admin())` | `(select public.e_admin())` | 0114_tipos_item.sql |
| public.tipos_item | admin insere tipo | INSERT | `` | `(select public.e_admin())` | 0114_tipos_item.sql |
| public.tipos_item | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0114_tipos_item.sql |
| public.unidades_apelidos | admin apaga apelido | DELETE | `(select public.e_admin())` | `` | 0139_vocabulario_import.sql |
| public.unidades_apelidos | admin insere apelido | INSERT | `` | `(select public.e_admin())` | 0139_vocabulario_import.sql |
| public.unidades_apelidos | leitura operador | SELECT | `(select public.papel_atual()) is not null` | `` | 0139_vocabulario_import.sql |
| storage.objects | backups-import apaga operador | DELETE | `bucket_id = 'backups-import' and (select public.e_admin())` | `` | 0066_papeis_storage.sql |
| storage.objects | backups-import atualiza operador | UPDATE | `bucket_id = 'backups-import' and (select public.e_admin())` | `bucket_id = 'backups-import' and (select public.e_admin())` | 0066_papeis_storage.sql |
| storage.objects | backups-import insere operador | INSERT | `` | `bucket_id = 'backups-import' and (select public.e_admin())` | 0066_papeis_storage.sql |
| storage.objects | backups-import leitura operador | SELECT | `bucket_id = 'backups-import' and (select public.e_admin())` | `` | 0066_papeis_storage.sql |
| storage.objects | termos apaga operador | DELETE | `bucket_id = 'termos' and (select public.pode_escrever()) and public.pode_escrever_arquivo_termo(name)` | `` | 0072_papel_dev_funcoes.sql |
| storage.objects | termos atualiza operador | UPDATE | `bucket_id = 'termos' and (select public.pode_escrever()) and public.pode_escrever_arquivo_termo(name)` | `bucket_id = 'termos' and (select public.pode_escrever()) and public.pode_escrever_arquivo_termo(name)` | 0072_papel_dev_funcoes.sql |
| storage.objects | termos insere operador | INSERT | `` | `bucket_id = 'termos' and (select public.pode_escrever()) and public.pode_escrever_arquivo_termo(name)` | 0072_papel_dev_funcoes.sql |
| storage.objects | termos leitura operador | SELECT | `bucket_id = 'termos' and (select public.pode_ler_arquivo_termo(name))` | `` | 0129_leitura_termo_e_revoke_invoker.sql |
