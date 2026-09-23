# F64 — a conferência pós-deploy (só leitura)

23/09/2026. Merge do [PR #75](https://github.com/vmatusita/ti-wap-inventory-control/pull/75): **`e55c77f`** (19:32:31 UTC),
com `verificar` e `banco-sem-docker` verdes no head `65958b5` — o SHA de código congelado — (run `35907393720`).

## O deploy e a janela

- Deploy de produção da Vercel (deployment do GitHub `6622690438`, commit `e55c77f`): criado 19:33:21 UTC, `success`.
- **A janela entre o apply de produção e o deploy:** a `0164` entrou no ledger de produção às **19:25:48 UTC**; o app novo
  respondeu no `/api/saude` às **19:33:33 UTC** — **cerca de 7 minutos e 45 segundos**. Nesse intervalo o app antigo
  (1.68.0) rodou sobre o esquema novo: ele não lê `empresa_id` das onze, todo INSERT dele recebeu a WAP pelo default, e
  nenhum kit foi gravado (`kits_modelos` segue vazia). O smoke e o conferidor de formas rodaram DENTRO dessa janela
  (19:28–19:30 UTC) e deram 0 falha e 0 recusadas (`producao.json`).
- **Nenhuma Parte B caiu na janela** (fato 14 da ordem): a agendada roda às 09:43 UTC; a única Parte B do dia depois do
  apply foi a disparada à mão, abaixo, com o app novo já no ar.

## `/api/saude`

```json
{"ok":true,"versao":"1.69.0","commit":"e55c77f","banco":"ok","ms":247}
```

Visto pela primeira vez às 19:33:33 UTC, sondando de 20 em 20 s desde o merge.

## O smoke de produção

`node scripts/smoke/smoke-prod.mjs` (com `SMOKE_VERSAO_ESPERADA=1.69.0`): **109 OK · 1 aviso · 0 n/a · 0 falha**.
O aviso é antigo e não é da F64: `kits_modelos · anon NÃO lê (RLS) — anon leu 0 linhas, mas não há kit cadastrado — RLS
não comprovada`. A linha de `/api/saude` confere `banco ok · versao 1.69.0 · commit e55c77f`. Saída completa em
[`smoke-prod.txt`](smoke-prod.txt) (a credencial sai mascarada pelo próprio script; nenhum e-mail, uuid ou patrimônio —
conferido por grep).

## A Parte B do `saude.yml`, disparada à mão

`gh workflow run saude.yml -f partes=b` → run
[`35910220738`](https://github.com/vmatusita/ti-wap-inventory-control/actions/runs/35910220738): **success**.

```
SONDA DE INTEGRIDADE · alvo=producao
  [OK   ] sessão aberta com a conta de consulta (conta mascarada)
  [OK   ] leitura de filiais com sessão (1 linha)
  [OK   ] leitura de ativos com sessão (1 linha)
  [OK   ] resumo de integridade: 13 chaves
  [AVISO] conflito_entre_filiais: hoje 66, base 69 — a linha de base pode DESCER
  todas as checagens dentro da linha de base.
  [OK   ] deriva de migrations: 0 pendente(s) · a mais nova no ledger é 0164_kit_motivo_da_empresa.sql

VEREDITO: verde.
alarme: par (producao, integridade) · verde · ação: nada
```

**Treze chaves**, a nova (`kit_motivo_orfao`) conhecida pela política (0 na linha de base) — sem o alarme "checagem que a
política não conhece". A sonda de deriva **sem pendente**, com a `0164` como a mais nova do ledger. O aviso de
`conflito_entre_filiais` é da linha de base (66 hoje contra 69 registrados — ela só pode descer) e não é da F64.

Nenhuma captura de tela de produção.
