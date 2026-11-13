# F67 — o apply no ENSAIO (sgmvldiizsrjbxzzpmhh), 13/11/2026

Canal: o MCP da Supabase — `apply_migration` com o `name` = o arquivo sem o `NNNN_` e o texto EXATO do commit congelado
`051a5f8` (LF); `execute_sql` só leitura para as provas. Depois de CADA lote, a prova compacta (`prova2.mjs`, fora do
repositório; o SQL traz o esperado embutido e devolve só o veredito): as funções que a F67 cria/recria com o md5 do
`prosrc` = o do corpo no arquivo; o RESTO das funções (o md5 do `prosrc` e o EXECUTE de anon/authenticated/service_role/
public) = o "antes" do mesmo banco, num hash só; as policies de `public`/`storage` e as views = o antes, com as nove da
0187 e as duas da 0191 pelo deparse da mesa PG 17 com a F67 (a mesa na 0184 bate 62/62 com o antes); os gatilhos de
`termos_gerados`; e o statement gravado no ledger = o md5 do arquivo. Só nomes de objeto, hashes e contagens.

| passo | resultado |
|---|---|
| "antes" refeito (0184) | 106 funções · `resto_ok` · 62 policies `policies_ok` · 9 views `views_ok` · 3 gatilhos de termos — **igual ao antes** |
| conta a conta `f67-antes` | **0 divergência** · 3 memberships · 18 pares (`conta-a-conta/ensaio-f67-antes.json`) |
| 0185 `cargo_por_empresa` | 7 tocadas, 0 divergentes · `resto_ok` · policies/views ok · ledger = o arquivo (1 statement) |
| 0186 `consumidores_por_empresa` | tocadas acumuladas 0 divergentes · `resto_ok` · policies/views ok · ledger = o arquivo |
| 0187 `policies_sem_par_por_empresa` | idem · as nove policies = o deparse da mesa (`policies_ok`) · ledger = o arquivo |
| 0188 `piso_cargo_mais_forte` | idem · ledger = o arquivo |
| 0189 `gestao_de_contas_por_empresa` | 23 tocadas, 0 divergentes · 120 funções vivas · as cinco de conta antigas e as duas auxiliares antigas intactas no resto · ledger = o arquivo |
| 0190 `destrutivas_por_empresa` | 36 tocadas, 0 divergentes (as onze novas e os dois resets antigos só com a sentinela) · 131 = 36 + 95 do resto · ledger = o arquivo |
| 0191 `mesa_por_empresa` | 39 tocadas, 0 divergentes · 133 = 39 + 94 · as duas views = a mesa (`views_ok`) · contagem da mesa = a regra de antes (0 linhas · 0 grupos, nos dois cálculos) · ledger = o arquivo |
| 0192 `termo_por_empresa` | 41 tocadas, 0 divergentes · 135 = 41 + 94 · `termos_gerados` com 4 gatilhos (o novo BEFORE INSERT por linha, `tgtype` 7) · ledger = o arquivo |
| conta a conta `f67-depois` (expansão) | **0 divergência** em todas as classes · 3 memberships · 18 pares · 3 gestões (`conta-a-conta/ensaio-f67-depois.json`) |
| conta a conta **sabotado** | **3 divergências** (classe `cargo`, uma por membership) — o instrumento enxerga (`conta-a-conta/ensaio-f67-depois-sabotada.json`) |
| `notify pgrst, 'reload schema'` | emitido |
| advisors (expansão) | desempenho igual ao antes (39 · 1 · 41 · 1). Segurança: só `authenticated_security_definer_function_executable` mudou, 34 → **54**: os +20 são exatamente as formas novas da F67 (15 RPCs `p_empresa` + `e_admin_na`, `e_dev_na`, `papel_na_empresa`, `pode_escrever_na`, `pode_escrever_unidade`), cada uma com o grant da forma antiga correspondente (doutrina da `0062`: RPC com guarda interna ou função de policy). ERROR 0 |
| conferidor de formas (expansão) | 248 pontos · 88.182 linhas · **0 recusadas** · 1 "reprovado" = `itens.saldo-colaborador · (nenhuma célula)` — o ensaio não tem colaborador para a grade (o mesmo da F66, `docs/f66-evidencias/depois/conferidor-ensaio.json`); `G-apply/conferidor-ensaio-expansao.json` |
| 0193 `contracao_assinaturas_antigas` | **0 das 21 derrubadas vivas** · 38 tocadas, 0 divergentes · 114 = 38 + 76 do resto (= o antes) · nenhum nome com mais de uma forma · policies/views ok · ledger = o arquivo (os nove) |
| conta a conta `f67-depois` (contração) | **0 divergência** · 3 memberships · 18 pares (`conta-a-conta/ensaio-f67-depois-contracao.json`) |
| conferidor de formas (contração) | 248 pontos · **0 recusadas** · o mesmo único ponto sem célula (`G-apply/conferidor-ensaio-contracao.json`) |
| advisors (contração) | segurança: o lint vai a **38** = 54 − 16 (as 16 das 21 derrubadas que estavam nele — as 15 antigas de API e `e_dev()`; as outras cinco eram fechadas); desempenho igual |
