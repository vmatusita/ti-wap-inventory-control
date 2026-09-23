# F65 — o "antes" refeito no ENSAIO logo antes do apply (23/09/2026, ~23:15–23:20 UTC)

Projeto `sgmvldiizsrjbxzzpmhh` (ensaio). Só leitura (`execute_sql` do MCP, os MESMOS textos dos instrumentos desta
pasta) e os advisors. Nenhum id, código, slug, nome ou texto de linha — só contagens, nomes de objeto de esquema e hashes.
Ledger conferido antes: **161 linhas, a última `kit_motivo_da_empresa` (a `0164`)** — nada da F65 aplicado.

## A contagem de violações (`contagem-violacoes.sql`)

- `fks_de_negocio_no_catalogo`: **23**; `fks_do_catalogo_fora_da_contagem`: `[]`; `fks_contadas_fora_do_catalogo`: `[]`.
- As 23 FKs: **0** em cada uma. Os 21 uniques (os sete pais, os catorze por empresa, o snapshot): **0** em cada um.
- `termos_gerados`: 2 termos; 0 com movimentação ou ativo de outra empresa; 0 com id inexistente. `empresas`: 1.

## A impressão do tenant (`impressao-tenant.sql`, corte `''`)

`corte_para_o_depois` = **`13298`** — o MESMO do "antes" das 14h (`antes/impressao-tenant-ensaio.json`): nenhuma
transação no ensaio desde então. Nas 20, `pk`, `chave`, `linhas`, `relfilenode`, `md5_chave_xmin` e `md5_conteudo`
IDÊNTICOS aos do arquivo das 14h (conferidos tabela a tabela; ex.: `ativos` 1606 linhas, relfilenode `17713`,
`a77879ca…`/`5f76cef1…`; `movimentacoes` 3245, `17735`, `378c5075…`/`d9615aa2…`; `motivos` PK `codigo`, 13, `17705`,
`405ac650…`/`115cda1e…`). Janela 0 em todas.

## A impressão do catálogo (`impressao-catalogo.sql`)

| seção | valor |
|---|---|
| fks | total 58 · md5 `1541f1558d206d84e69ab42962b88af8` · de negócio 23 (23 simples, 0 compostas, 0 não validadas) · pares com duas relações: `movimentacoes→filiais` |
| uniques | total 37 · md5 `bc692b3b8de749f1ad9c9bb05054bd15` · com `empresa_id` 1 |
| pais | `(empresa_id, id)` em 1 tabela: `filiais` |
| gatilhos | total 8 · md5 `45f69cb8fdc1c68655abda939ba06f3c` |
| funções | total 103 · `md5_todas` `95b75d7b0c1349419bde3102c8e092db` · `md5_sem_as_da_f65` `689fbd32732595068fe7ca077e06d862` (102) · `vocabulario_unidades_guarda()` `91e80d533d72191325e614d24e15a881` |
| advisory | 12 funções · 16 chamadas reais |

## As policies (`docs/f64-evidencias/impressao-policies.sql`)

`public` 54 · `886118ad686f67c857cf0d370fd6828d`; `storage` 8 · `f116b8d0da8bda75038564a44720c2e8`; das 20 de negócio,
49 policies, 0 citam `empresa_id`.

## Os advisors

- **Segurança:** `rls_enabled_no_policy` 6 · `authenticated_security_definer_function_executable` 34 ·
  `auth_leaked_password_protection` 1 — o mesmo do fato 3.
- **Performance:** `unindexed_foreign_keys` 31 (19 são `*_empresa_id_fkey`) · `no_primary_key` 1 · `unused_index` 11 ·
  `multiple_permissive_policies` 1.

## O que veio depois

O `apply_migration` da `0165` no ensaio (23:21 UTC) foi **recusado pelo classificador de segurança** do Claude Code. Pela
ordem, não houve nova tentativa nem reformulação: nada foi aplicado em banco nenhum. O comando está no topo do
`RELATORIO-F65.md`.
