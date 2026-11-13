# F67 — o apply em PRODUÇÃO (pbtjcalbmepmrqzprusb), 13/11/2026 — a EXPANSÃO (0185–0192); a contração, em `janela.md`

Canal e prova: os mesmos do ensaio (`ensaio.md`) — `apply_migration` com o texto EXATO do commit congelado `051a5f8`
(o mesmo texto que já tinha batido byte a byte no ledger do ensaio) e, depois de CADA lote, a prova compacta só de
catálogo e hash. A contração (0193) NÃO roda aqui: ela é a última coisa da fase, depois do merge, do deploy e da
janela do `pg_stat_statements` (RUNBOOK, Anexo F67). PG 17.6. Só nomes de objeto, hashes e contagens.

| passo | resultado |
|---|---|
| conta a conta `f67-antes` (antes do 1º lote) | **0 divergência** · 14 memberships · 84 pares · 28 gestões (`conta-a-conta/producao-f67-antes.json`) |
| números do #84 (antes do 1º lote) | `backup_orfao` **12** · `detentor_em_estado_sem_dono` **1** — os travados; e os outros 11 contadores iguais ao antes (`antes/producao/integridade-84.txt`): `arquivo_termo_orfao` 3, `conflito_entre_filiais` 59, o resto 0 |
| catálogo na 0184 | 106 funções · `resto_ok` · 62 policies `policies_ok` · 9 views `views_ok` · 3 gatilhos de termos · ledger com 168 entradas — **igual ao antes** |
| 0185 `cargo_por_empresa` | 7 tocadas, 0 divergentes · 113 = 7 + 106 · policies/views ok · ledger = o arquivo |
| 0186 `consumidores_por_empresa` | 14 tocadas, 0 divergentes · 113 = 14 + 99 · ledger = o arquivo |
| 0187 `policies_sem_par_por_empresa` | 14 tocadas · as nove policies = o deparse da mesa (`policies_ok` com o MESMO hash do ensaio) · ledger = o arquivo |
| 0188 `piso_cargo_mais_forte` | 15 tocadas, 0 divergentes · 113 = 15 + 98 · ledger = o arquivo |
| conta a conta `f67-antes` **depois da 0188** | **0 divergência** — o piso novo (`papel_atual()` = o cargo mais forte) responde igual ao oráculo de antes nas 14 contas, e `pode_escrever_filial` (corpo novo da 0186) igual nos 84 pares; medido ANTES de seguir, porque a 0188 muda o sentido do piso em todas as policies vivas (`conta-a-conta/producao-f67-antes-pos-0188.json`) |
| 0189 `gestao_de_contas_por_empresa` | 23 tocadas, 0 divergentes · 120 = 23 + 97 · ledger = o arquivo |
| 0190 `destrutivas_por_empresa` | 36 tocadas, 0 divergentes · 131 = 36 + 95 · o resto com o MESMO hash do ensaio · ledger = o arquivo |
| 0191 `mesa_por_empresa` | 39 tocadas, 0 divergentes · 133 = 39 + 94 · views = a mesa · a mesa com **120 linhas e 59 grupos** = a regra de antes (`[120, 59]`) · ledger = o arquivo |
| 0192 `termo_por_empresa` | 41 tocadas, 0 divergentes · 135 = 41 + 94 · 4 gatilhos em `termos_gerados` (`tgtype` 7) · **0 termo vivo** fora de `empresas_com_modelo_de_termo()` · ledger = o arquivo |
| conta a conta `f67-depois` | **0 divergência** nas 8 classes (cargo, derivadas, piso, escrita por filial, escrita por unidade, gestão, Zona, último admin) · 14 memberships · 84 pares · 28 gestões (`conta-a-conta/producao-f67-depois.json`) |
| `notify pgrst, 'reload schema'` | emitido (a 0191 já emite; de novo depois da 0192) |
| smoke `node scripts/smoke/smoke-prod.mjs` | **109 OK · 1 aviso · 0 falha** — o app NO AR (o de antes, que chama as assinaturas antigas) segue inteiro com a expansão; o aviso é o de sempre (`kits_modelos` sem kit cadastrado para provar a RLS do anon — igual à F66) (`G-apply/smoke-producao-pos-expansao.txt`) |
| conferidor de formas (produção) | **272 pontos · 112.172 linhas · 0 recusadas · 0 reprovados** (`G-apply/conferidor-producao-expansao.json`) |
| advisors | desempenho igual ao antes (39 · 1 · 7 · 1). Segurança: `authenticated_security_definer_function_executable` 34 → **54**, os mesmos +20 do ensaio (as formas novas com o grant da antiga correspondente); `rls_enabled_no_policy` 6 e `auth_leaked_password_protection` 1 iguais; ERROR 0. Depois da contração, o esperado é 38 (o ensaio já mediu) |
| paridade ensaio × produção (`supabase/ci/impressao-schema.sql`) | 9 classes **idênticas** (coluna 352, constraint 209, enum 7, índice 105, policy 54, policy_storage 8, rls_flag 28, trigger 53, view 9). `func`/`grant_func`: produção 135, ensaio 114 — a diferença é EXATAMENTE a contração: produção **menos as 21** dá 114 com o MESMO fingerprint do ensaio nas duas classes (`G-apply/paridade-expansao.json`) |
