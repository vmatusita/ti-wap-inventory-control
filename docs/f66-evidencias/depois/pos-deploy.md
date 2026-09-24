# F66 — o merge, o deploy e a conferência pós-deploy (24/09/2026)

Só leitura. Nenhum id, código, slug, nome ou texto de linha.

## O merge e o deploy

- **PR #79** saiu do rascunho depois das provas de produção (`sondas-producao.json`, `conta-a-conta/`, `rel/`, o
  conferidor, o smoke, a paridade), com `verificar` e `banco-sem-docker` verdes no HEAD `60b9d66` (run `36035029512`) e o
  Vercel verde, estado `CLEAN`; **merge normal** (commit de merge, como nas fases anteriores): **`fbcd14b`**, 17:36:14 UTC.
  A descrição do PR trocou o "rascunho — as travas vermelhas de propósito" pelo registro do apply feito.
- **O deploy**: Vercel `success` às 17:36:57 UTC; **`/api/saude`** às 17:37:11 UTC:
  `{"ok":true,"versao":"1.71.0","commit":"fbcd14b","banco":"ok"}`.
- **A janela com o app velho sobre as policies novas**: do fim do apply em produção (14:01 -03, 17:01 UTC) ao deploy
  (17:37 UTC). A F66 não muda o código que o app executa (fora o registro de versões): o app velho e o novo leem e gravam
  pelas mesmas policies. Nessa janela o conferidor de formas (271 pontos) e o smoke leram pelo PostgREST sem recusa.

## A conferência pós-deploy

- **O smoke** (`smoke-prod-pos-deploy.txt`, com `SMOKE_VERSAO_ESPERADA=1.71.0`): **109 OK · 1 aviso · 0 n/a · 0 falha**
  — `/api/saude` na `1.71.0` · `fbcd14b`; o aviso é o antigo de `kits_modelos` sem kit cadastrado.
- **A Parte B** (`gh workflow run saude.yml -f partes=b`, run `36036851741`, no commit `fbcd14b`): **success** — "resumo
  de integridade: 13 chaves · todas as checagens dentro da linha de base" (com o aviso de que a linha de base de
  `conflito_entre_filiais` PODE descer: hoje 66, base 69 — nenhum número foi mexido); "deriva de migrations: 0
  pendente(s) · a mais nova no ledger é 0179_rel_motivo_por_empresa.sql"; alarme (producao, integridade) verde, nenhum
  aberto.

## Os tipos — a geração do MCP

`generate_typescript_types` do MCP em produção depois da `0179` (`tipos-producao.json`): md5
`1acd55462cb56d3000e4e9184f2d7d99` — **o MESMO md5 da geração da F65** (`f65-evidencias/depois/pos-deploy.md`). A F66 não
mudou coluna, tipo, relação nem assinatura; contra o `database.ts`, as únicas diferenças continuam os comentários de
hand-fix e as duas linhas de `operador_filiais.Insert` (o hand-fix da F62, no backlog).
