# F67B — a janela por OBJETOS em PRODUÇÃO (RUNBOOK, Anexo F67B, passo 4)

A F67B não troca assinatura que o PostgREST chame de outro jeito: ela troca a FORMA do caminho que o app grava no
Storage. A janela, então, é medida em OBJETOS — a contagem, por bucket e por forma, dos objetos com `created_at` depois
do deploy (o SQL do Anexo, só leitura; só números, nunca nome de objeto).

## A pré-condição

- O merge do PR #96: `d11daea` (16:06:14 UTC). A Vercel concluiu o deploy às 16:07:13 UTC; `/api/saude`:
  `{"versao":"1.74.0","commit":"d11daea","banco":"ok"}`.
- `node scripts/smoke/smoke-prod.mjs` contra o app novo: **109 OK · 1 aviso · 0 falha** (`smoke-producao-pos-deploy.txt`;
  o aviso é o de sempre — `kits_modelos` sem kit cadastrado).

## T0 — 16/11 13:07:40 −03 (16:07:40 UTC), o app novo no ar

`created_at > 16:07:13 UTC` (o fim do deploy): **nenhum objeto** em `termos` nem em `backups-import`. Os totais: `termos`
301, `backups-import` 29 — os mesmos do "antes" (`antes/producao/contagens.txt`).

## A prova estática (antes do T1)

`git grep` do Anexo F67B em `d11daea` (o SHA no ar):

```
scripts/db/restaurar.mjs:421        — o fetch de um backup que JÁ existe (`backups-import/${caminho}`), agnóstico de forma
scripts/perf/conta-a-conta.mjs:605  — a regex da forma antiga dentro do comando de LEITURA que classifica os objetos
src/lib/storage/caminho.ts:42       — a lista fechada da forma antiga (a cláusula legada)
```

Só `caminho.ts` e as entradas NOMINAIS de `caminho.test.ts` §4 (`restaurar.mjs`, `conta-a-conta.mjs`, com o motivo
escrito): nenhum montador de caminho na forma antiga fora da função única. O SHA no ar = o merge do PR #96.

## T1 — 16/11 13:41:19 −03 (16:41:19 UTC), 33 min 39 s depois do T0

`created_at > 16:07:13 UTC`: **nenhum objeto** em `termos` nem em `backups-import`; 0 linha nova de
`termos_gerados`. Os totais: `termos` 301, `backups-import` 29, `termos_gerados` 298 — os mesmos do T0 e do "antes".
`/api/saude` no T1: `1.74.0` · `d11daea`.

## O critério (Anexo F67B, passo 4)

| | resultado |
|---|---|
| objeto NOVO na forma `antiga` de `backups-import` entre o deploy e o T1 | **0** |
| `.docx` `sem_linha` NOVO em `termos` entre o deploy e o T1 | **0** |
| Δ na forma `nova` | **0** — ninguém gerou termo, importou, resetou nem resolveu conflito na janela (uso raro). Declarado, como o Anexo prevê; a prova de que nada grava na forma antiga é a estática acima, no SHA no ar |
| o SHA no ar | `d11daea` = o merge |

**Condição atendida (uma janela bastou) → a contração em produção:** a `0198` às ~13:42 −03 e a `0199` às ~13:44 −03,
cada uma com o texto exato do arquivo pelo `apply_migration` e a prova de exatidão logo depois.

## Depois da contração, em produção

| prova | resultado |
|---|---|
| exatidão da `0198` | 2/2 corpos e 2/2 comentários = o arquivo; `pode_escrever_termo(uuid[])` saiu; as 3 de escrita de `termos` sem o piso legado; 120 funções, 70 definer, 62 policies |
| exatidão da `0199` | 4/4 corpos = o arquivo; os 3 `prefixo_backup_*` antigos saíram; a leitura com a cláusula legada FECHADA; as 3 de escrita só na forma nova; **117 funções, 70 definer, 62 policies** (= o ensaio) |
| conta a conta `f67b-contraida` | **0 não declarada** · 14 memberships · 26.824 avaliações · as três DECLARADAS exatamente no esperado: `leitura_termo_sem_linha` 42 = 42, `escrita_termo_sem_linha` 81 = 81, `escrita_backup_forma_antiga` 348 = 348; `leitura_backup_forma_antiga` **0** (o admin da WAP continua lendo os 29 antigos) (`conta-a-conta/producao-f67b-contraida.json`) |
| as 13 checagens | iguais à linha travada: `arquivo_termo_orfao` 3, `backup_orfao` 12, `conflito_entre_filiais` 59, `detentor_em_estado_sem_dono` 1, o resto 0 |
| smoke | **109 OK · 1 aviso · 0 falha** (`smoke-producao-pos-contracao.txt`; o aviso de sempre) |
| conferidor de formas | **272 pontos · 112.229 linhas · 0 recusadas · 0 reprovados** (`conferidor-producao-contracao.json`) |
| advisors | segurança: `authenticated_security_definer_function_executable` **39** (o ensaio: 39; o antes: 38 + a ferramenta de órfão), `rls_enabled_no_policy` 6, `auth_leaked_password_protection` 1, ERROR 0. Desempenho = o antes (39 · 1 · 7 · 1), ERROR 0 |
| paridade ensaio × produção, 11 classes | **idênticas, sem variante** (`paridade-contracao.json`): coluna 352 · constraint 209 · enum 7 · func 117 (`eb8a1921…`) · grant_func 117 (`3cf7a2df…`) · índice 105 · policy 54 (`018508af…`) · policy_storage 8 (`c4d1809a…`) · rls_flag 28 · trigger 53 · view 9 |
| a Parte B do `saude.yml` à mão (run `43911699512`) | VERMELHA pelos **mesmos dois** do #84 (`backup_orfao` 12, `detentor_em_estado_sem_dono` 1) — os mesmos da última Parte B antes do apply (run `43736154557`, 15/11); deriva **0 pendente**, a mais nova no ledger é a `0199_contracao_backups_por_empresa.sql` |

**Nenhuma escrita em produção além dos seis `apply_migration`** (o `notify pgrst` só recarrega o schema). Nenhum objeto de
Storage gravado, copiado, movido ou apagado; a ferramenta de órfão não foi chamada. Nas evidências, só números, nomes de
esquema e hashes.
