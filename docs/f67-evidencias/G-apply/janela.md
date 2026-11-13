# F67 — a janela do `drop` em PRODUÇÃO (RUNBOOK, Anexo F67)

O nome não separa a assinatura antiga da nova; o ARGUMENTO NOMEADO separa (o PostgREST chama a forma nova com
`"p_empresa" := …`). O T0 e o T1 são o SQL do Anexo F67, só leitura, por papel: só chamadas e número de formas de
statement, nunca o texto do statement nem valor de parâmetro.

## Leitura PRÉ-DEPLOY (13/11 13:05:01 −03, o app no ar ainda era o `1.72.0` · `8f4b50d`) — referência, não é o T0

`dealloc` 5 · `stats_reset` 2026-07-09 12:30:38 −03. Só formas ANTIGAS, todas em `authenticated` e com uma forma de
statement cada (o acumulado desde o reset de julho): `apagar_ativo` 14 · `apagar_ativos_conflito_filiais` 35 ·
`apagar_item` 2 · `apagar_usuario` 2 · `definir_papel_usuario` 6 · `definir_status_usuario` 3 ·
`definir_vinculos_usuario` 5 · `importar_ativos_substituir` 12 · `previa_reset` 13 · `resetar_acervo` 2 ·
`resetar_itens` 1. Nenhuma forma nova chamada, nenhuma chamada de `service_role` ou `anon`; `e_dev`,
`encerrar_sessoes_usuario`, `apagar_movimentacao`, `forcar_estado_ativo` e `forcar_saldo_item` sem entrada.

## A pré-condição (passo 1)

- O merge do PR #94: `05cba24` (16:04:22 UTC). A Vercel concluiu o deploy; `/api/saude` às 16:05:25 UTC:
  `{"versao":"1.73.0","commit":"05cba24","banco":"ok"}`.
- `node scripts/smoke/smoke-prod.mjs` contra o app novo: **109 OK · 1 aviso · 0 falha** (`smoke-producao-pos-deploy.txt`).

## T0 — 13/11 13:08:32 −03 (16:08:32 UTC), o app novo no ar

`dealloc` **5** · `stats_reset` **2026-07-09 12:30:38 −03** · as mesmas onze entradas da leitura pré-deploy, todas
`antiga` em `authenticated`, com os mesmos números (14 · 35 · 2 · 2 · 6 · 3 · 5 · 12 · 13 · 2 · 1). Nenhuma `nova`.

## A prova estática (antes do T1)

- `git grep` do Anexo F67 (as 15 RPCs e `e_dev`, fora dos testes) em `61c9b75` e de novo em `05cba24` (o SHA no ar):
  **vazio** nos dois.
- `npx vitest run src/lib/auth/empresa-legada-catraca.test.ts`: **19/19 verdes** nos dois — toda chamada pela porta
  tipada passa `p_empresa`.
- O SHA no ar = o merge do PR #94 (`05cba24`).

## T1 — 13/11 13:40:00 −03 (16:40:00 UTC), 31 min 28 s depois do T0

`dealloc` **5** · `stats_reset` **2026-07-09 12:30:38 −03** · as mesmas onze entradas, com os MESMOS números do T0.

## O critério (Anexo F67 = (a)–(d) da F60, pela forma)

| | resultado |
|---|---|
| (a) Δ das ANTIGAS em `authenticated`, `service_role` e `anon` | **0** nas onze entradas de `authenticated`; nenhuma entrada de `service_role` ou `anon` em T0 nem em T1 |
| (b) Δ das NOVAS | **0** — nenhuma das 15 RPCs foi usada na janela (são destrutivas, import e gestão de contas: raras). Declarado, como o Anexo prevê; a prova de que ninguém chama a antiga é então a ESTÁTICA, que passou nos dois SHAs |
| (c) `dealloc` | 5 = 5 |
| (d) `stats_reset` | igual |

**Condição atendida → a `0193` em produção** às ~13:43 −03, com o texto exato (o ledger com o md5 do arquivo).

## Depois da contração, em produção

| prova | resultado |
|---|---|
| a prova compacta | **0 das 21 vivas** · 38 tocadas, 0 divergentes · 114 = 38 + 76 do resto (= o antes) · nenhum nome com mais de uma forma · policies 62 e views ok · 4 gatilhos de termos · o ledger com os nove arquivos |
| conta a conta `f67-depois` | **0 divergência** nas 8 classes · 14 memberships · 84 pares · 28 gestões (`conta-a-conta/producao-f67-depois-contracao.json`) |
| smoke | **109 OK · 1 aviso · 0 falha** (`smoke-producao-pos-contracao.txt`) |
| conferidor de formas | **272 pontos · 112.172 linhas · 0 recusadas · 0 reprovados** (`conferidor-producao-contracao.json`) |
| advisors | segurança: `authenticated_security_definer_function_executable` **38** (54 − as 16 derrubadas que estavam nele — o mesmo número do ensaio); os outros iguais; ERROR 0. Desempenho igual ao antes (39 · 1 · 7 · 1) |
| a Parte B do `saude.yml` à mão (run `43466154928`) | VERMELHA pelos **mesmos dois** do #84 (`backup_orfao` 12, `detentor_em_estado_sem_dono` 1); deriva **0 pendente**, a mais nova no ledger é a `0193`; `conflito_entre_filiais` 59 só como AVISO (abaixo da base 69) |
| paridade ensaio × produção, 11 classes | **idênticas, sem variante**: coluna 352 · constraint 209 · enum 7 · func 114 (`46836858…`) · grant_func 114 (`df460361…`) · índice 105 · policy 54 · policy_storage 8 · rls_flag 28 · trigger 53 · view 9 |
