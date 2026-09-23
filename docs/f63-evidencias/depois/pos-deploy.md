# F63 — a conferência pós-deploy (só leitura)

23/09/2026. Merge do [PR #72](https://github.com/vmatusita/ti-wap-inventory-control/pull/72): **`de241b3`** (15:48:08 UTC),
com `verificar` e `banco-sem-docker` verdes no head `1db4a5c` (run `35883563113`) e o código no SHA congelado `cdc6dee`.

## O deploy e a janela

- Deploy de produção da Vercel `dpl_AKqc9KRAGSLnS98cttYMZi5y289X` (commit `de241b3`): criado 15:48:12 UTC, `READY`.
- **A janela entre o apply de produção e o deploy:** a `0161` entrou no ledger de produção às **15:34:00 UTC**; o app novo
  respondeu no `/api/saude` às **15:49:25 UTC** — **cerca de 15 minutos**. Nesse intervalo o app antigo (1.67.0) rodou
  sobre o esquema novo: ele não lê `empresa_id`, e todo INSERT dele recebeu a WAP pelo default. O smoke e o conferidor de
  formas rodaram DENTRO dessa janela (15:36–15:38 UTC) e deram 0 falha e 0 recusadas — a prova de que o app velho convive
  com a coluna (`producao.json`).

## `/api/saude`

```json
{"ok":true,"versao":"1.68.0","commit":"de241b3","banco":"ok","ms":66}
```

Visto pela primeira vez às 15:49:25 UTC, sondando de 20 em 20 s desde o merge.

## O smoke de produção

`node scripts/smoke/smoke-prod.mjs` (com `SMOKE_VERSAO_ESPERADA=1.68.0`): **109 OK · 1 aviso · 0 n/a · 0 falha**.
O aviso é antigo e não é da F63: `kits_modelos · anon NÃO lê (RLS) — anon leu 0 linhas, mas não há kit cadastrado — RLS
não comprovada`. A linha de `/api/saude` confere `banco ok · versao 1.68.0 · commit de241b3`. Saída completa em
[`smoke-prod.txt`](smoke-prod.txt) (a credencial sai mascarada pelo próprio script; nenhum e-mail, uuid ou patrimônio —
conferido por grep).

## A Parte B do `saude.yml`, disparada à mão

`gh workflow run saude.yml -f partes=b` → run
[`35884532184`](https://github.com/vmatusita/ti-wap-inventory-control/actions/runs/35884532184): **success**.

```
SONDA DE INTEGRIDADE · alvo=producao
  [OK   ] sessão aberta com a conta de consulta (conta mascarada)
  [OK   ] leitura de filiais com sessão (1 linha)
  [OK   ] leitura de ativos com sessão (1 linha)
  [OK   ] resumo de integridade: 12 chaves
  [AVISO] conflito_entre_filiais: hoje 66, base 69 — a linha de base pode DESCER
  todas as doze dentro da linha de base.
  [OK   ] deriva de migrations: 0 pendente(s) · a mais nova no ledger é 0161_empresa_no_acervo_movimento.sql

VEREDITO: verde.
alarme: par (producao, integridade) · verde · ação: nada
```

A sonda de deriva **sem pendente**, com a `0161` como a mais nova do ledger. O aviso de `conflito_entre_filiais` é da
linha de base (66 hoje contra 69 registrados — ela só pode descer) e não é da F63.

Nenhuma captura de tela de produção.
