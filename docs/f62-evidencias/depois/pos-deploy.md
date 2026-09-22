# F62 — a conferência pós-deploy (só leitura)

22/09/2026. Merge do [PR #70](https://github.com/vmatusita/ti-wap-inventory-control/pull/70): **`fa10b54`**.

## O deploy e a janela

- Deploy de produção da Vercel `dpl_8cUFF2E5itdVsA9vH3M1zG4fxe3o` (commit `fa10b54`): criado 18:35:53, **pronto
  18:36:44** (-03).
- **A janela entre o apply de produção e o deploy:** a `0158` entrou no ledger de produção às **18:20:07**; o app novo
  ficou pronto às **18:36:44** — **16,6 minutos**. Nesse intervalo o app antigo leu a coluna congelada
  (`profiles.papel`/`ativo`), igual à membership no minuto do apply (a impressão "depois" de produção, tirada nessa
  janela, saiu igual à "antes"). Só a TELA lia de lá; quem decide acesso é o banco, que já lia `membros`. Nenhuma troca
  de cargo foi feita nesse intervalo (e a que fosse feita pela tela antiga cairia na RPC nova, que grava `membros`).

## `/api/saude`

```json
{"ok":true,"versao":"1.67.0","commit":"fa10b54","banco":"ok","ms":115}
```

Visto pela primeira vez às 18:37:06 (-03), sondando de 20 em 20 s desde o merge.

## O smoke de produção

`node scripts/smoke/smoke-prod.mjs` (com `SMOKE_VERSAO_ESPERADA=1.67.0`): **109 OK · 1 aviso · 0 n/a · 0 falha**.
O aviso é antigo e não é da F62: `kits_modelos · anon NÃO lê (RLS) — anon leu 0 linhas, mas não há kit cadastrado —
RLS não comprovada`. A linha de `/api/saude` confere `banco ok · versao 1.67.0 · commit fa10b54`. Saída completa em
[`smoke-prod.txt`](smoke-prod.txt) (a credencial sai mascarada pelo próprio script; nenhum patrimônio, uuid ou e-mail).

## A Parte B do `saude.yml`, disparada à mão

`gh workflow run saude.yml -f partes=b` → run
[`35787899991`](https://github.com/vmatusita/ti-wap-inventory-control/actions/runs/35787899991): **success**.

```
SONDA DE INTEGRIDADE · alvo=producao
  [OK   ] sessão aberta com a conta de consulta (conta mascarada)
  [OK   ] leitura de filiais com sessão (1 linha)
  [OK   ] leitura de ativos com sessão (1 linha)
  [OK   ] resumo de integridade: 12 chaves
  [OK   ] deriva de migrations: 0 pendente(s) · a mais nova no ledger é 0158_cargo_em_membros.sql
alarme: par (producao, integridade) · verde · ação: nada
```

A conta `consulta` abriu sessão e leu o acervo e o ledger **pela ponte nova** (`papel_atual()` lendo `membros`), e a
sonda de deriva viu as sete migrations da F62 aplicadas — o fato 21 da ordem fechado.

Nenhuma captura de tela de produção.
