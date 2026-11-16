# F67B — o apply em PRODUÇÃO (pbtjcalbmepmrqzprusb, PG 17.6), 16/11/2026

A ordem do RUNBOOK (Anexo F67B): **só a expansão, ANTES do merge** (`0194` → `0197`), uma migration por
`apply_migration`, com o texto EXATO do arquivo (o mesmo já aplicado no ensaio), a prova de EXATIDÃO depois de cada uma
(`scratchpad/exatidao.mjs` — só `(objeto, ok)` volta do banco) e o conta a conta `f67b-depois` com **0 divergência**
depois de cada lote. A contração (`0198` → `0199`) espera o merge, o deploy e a janela por objetos.

## A expansão

| migration | corpos | comentários | conta a conta `f67b-depois` | outras provas |
|---|---|---|---|---|
| 0194 | 5/5 ok | 5/5 ok | 0 divergência (`producao-f67b-depois-0194.json`) | os montadores novos só por authenticated; os 3 antigos fechados |
| 0195 | 4/4 ok | — | 0 divergência (`…-0195.json`) | as 4 policies de backups-import com as duas formas |
| 0196 | 2/2 ok | 1/1 ok + o comment de `eventos_admin.acao` | 0 divergência (`…-0196.json`) | a ferramenta: definer, `search_path=""`, só authenticated; as 13 checagens no número travado |
| 0197 | 2/2 ok | 1/1 ok | 0 divergência (`…-0197.json`) | a antiga `pode_escrever_termo(uuid[])` ainda existe; as 3 policies de termos_gerados pela empresa da linha |

**Depois da expansão:** 121 funções de public (= 114 + 5 da 0194 + 1 da 0196 + 1 da 0197), 71 `security definer`,
62 policies — a contagem que a 0197 confere no próprio corpo do apply.

**O conta a conta depois da 0197** (o último lote): 14 memberships ativas, 26.824 avaliações, objetos — termos 301
(3 sem linha), backups 29 (29 na forma antiga, 0 na nova), 298 linhas de `termos_gerados` — **0 divergência não
declarada**. Igual ao `f67b-antes` (`producao-f67b-antes.json`): a expansão não muda nada para a WAP.

**As 13 checagens depois da 0197:** iguais à linha travada do "antes" (`antes/producao/integridade.txt`) —
`arquivo_termo_orfao` 3, `backup_orfao` 12, `conflito_entre_filiais` 59, `detentor_em_estado_sem_dono` 1, o resto 0.

**O conferidor de formas** (`conferidor-producao-expansao.json`): 272 pontos, 112.229 linhas, **0 recusadas,
0 reprovados**; 3 descritores sem linha no alvo (formas não exercitadas em produção: `admin.senhas-acesso`,
`kits.ativos`, `kits.admin`).

**O smoke** (`smoke-producao-expansao.txt`, `node scripts/smoke/smoke-prod.mjs`): 109 OK · 1 aviso · 0 falha. O aviso é
o de sempre (`kits_modelos` sem kit cadastrado — a RLS não se comprova com 0 linha), não é da F67B.

**Os advisors de segurança depois da expansão:** `rls_enabled_no_policy` 6 (os mesmos do antes),
`auth_leaked_password_protection` 1, `authenticated_security_definer_function_executable` **40** = os 38 do antes +
`registrar_limpeza_termos_sem_linha` (a ferramenta nova, declarada: a guarda é `e_plataforma()` dentro dela) + a
assinatura nova `pode_escrever_termo(uuid, uuid[])` (a antiga `pode_escrever_termo(uuid[])` sai na 0198 — volta a 39,
o número do ensaio depois da cadeia inteira). ERROR: 0.

## O merge, a janela e a contração

O merge do PR #96 (`d11daea`, 16:06:14 UTC), o deploy (`/api/saude` `1.74.0` · `d11daea`), a janela por objetos
(T0 16:07:40 UTC, T1 16:41:19 UTC: nenhum objeto novo em bucket nenhum) e a contração `0198` → `0199` com as provas
depois: [`janela.md`](janela.md). Em uma linha: as duas exatas; 117 funções, 70 definer, 62 policies (= o ensaio); o
conta a conta contraído com **só as três declaradas**, exatamente no esperado (42 · 81 · 348); as 13 checagens na linha
travada; smoke 0 falha; conferidor 0 recusadas; advisors 39 (= o ensaio); a paridade das 11 classes idêntica ao ensaio.
