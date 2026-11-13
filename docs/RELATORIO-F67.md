# Relatório F67 — o cargo por empresa, as `security definer` e as destrutivas

**v1.73.0** · migrations `0185`–`0192` (a EXPANSÃO) **aplicadas no ensaio e em produção** em 13/11/2026, e `0193` (a
CONTRAÇÃO) aplicada no ensaio; em produção a contração é a última coisa da fase, depois do merge, do deploy e da janela
do `pg_stat_statements` (§8) · SHA de código congelado **`051a5f8`** (CI `43448719684` verde: 61 roteiros, 1.248
asserções, 0 ✗; injetor 170/170; `db:types:diff` 102 = 102) · código no
[PR #94](https://github.com/vmatusita/ti-wap-inventory-control/pull/94) · plano [`PLAN-F67.md`](PLAN-F67.md) · ata
`DECISOES.md` (2026-11-13 · F67) · evidência em [`f67-evidencias/`](f67-evidencias/).

> A sexta fase da virada multiempresa. Até aqui o cargo de cada pessoa só existia na empresa legada (a WAP), pela ponte
> da F62: com uma segunda empresa, o admin da B teria o cargo vindo da WAP, `pode_escrever_filial` diria "sim" a
> qualquer admin em qualquer filial de qualquer empresa, o "tudo" do reset apagaria o sistema inteiro e a mesa de
> conflitos juntaria gêmeos de empresas diferentes. A F67 faz o cargo valer **por empresa** em tudo que atravessa a RLS:
> as formas `papel_na_empresa`/`e_admin_na`/`e_dev_na`/`pode_escrever_na`/`pode_escrever_unidade` (a empresa ANTES do
> cargo; nulo fecha); o piso `papel_atual()` como o cargo mais forte, só em conjunção com o recorte do mesmo cargo; as
> destrutivas, a prévia, a mesa, o import e as cinco RPCs de conta com `p_empresa uuid` 1º, sem default; o "tudo" =
> a empresa, confirmado por `RESETAR TUDO — <N> ATIVOS`; o conflito entre empresas impossível por construção; e o banco
> recusando termo de empresa sem modelo próprio.
>
> Com uma empresa só, nada disso muda o que a WAP vê ou pode — e foi provado: o conta a conta deu **0 divergência** nas
> 14 contas de produção, antes, no meio (depois da 0188, que troca o piso) e depois da expansão; o smoke 109 OK · 0
> falha; o conferidor 272 pontos · 0 recusadas; a mesa com as mesmas 120 linhas e 59 grupos; o #84 nos mesmos 12 e 1.

---

# 1. O ROTEIRO DO JOHNNY — o que ficou com você, e por quê

## 1.1 O estado agora, e o que ainda é desta run

| etapa | estado |
|---|---|
| expansão `0185`–`0192` no ensaio e em produção, com as provas | **feito** (§6) |
| contração `0193` no ensaio | **feito** (§6) |
| merge do PR #94 com os dois checks verdes | *(esta run — §16)* |
| `/api/saude` com `1.73.0` e o commit do merge; o smoke | *(esta run — §16)* |
| a janela do `drop` (T0, prova estática, ≥ 30 min, T1, Δ das antigas = 0) | *(esta run — §8)* |
| a contração `0193` em produção, com as provas | *(esta run — §6)* |
| a Parte B do `saude.yml` à mão, com os mesmos 12 e 1 | *(esta run — §10)* |
| o PR de documentação com a tag `v1.73.0` | *(esta run)* |

Nenhuma decisão sua pendente. Nenhum rollback foi necessário. O classificador de segurança não barrou nada.

## 1.2 Se a run parar antes da contração em produção — os comandos, na ordem

O estado "só a expansão em produção" é um **repouso válido** (§15): as assinaturas antigas e as novas convivem, o app de
antes e o de depois funcionam. Para fechar:

1. Confirme que o deploy é o do merge: `GET https://ti-wap-inventory-control.vercel.app/api/saude` → `versao` `1.73.0` e o
   `commit` do merge do PR #94.
2. A prova estática (o Anexo F67 do `RUNBOOK-BANCO.md`, passo 4): este comando tem de sair VAZIO —

   ```bash
   git grep -nE "\.rpc\(\s*['\"](apagar_usuario|definir_(papel|status|vinculos)_usuario|encerrar_sessoes_usuario|apagar_(ativo|item|movimentacao)|forcar_(estado_ativo|saldo_item)|previa_reset|resetar_(acervo|itens)|apagar_ativos_conflito_filiais|importar_ativos_substituir|e_dev)['\"]" -- 'src/**' 'scripts/**' ':!**/*.test.*'
   ```

   e `npx vitest run src/lib/auth/empresa-legada-catraca.test.ts` verde (toda chamada pela porta tipada passa `p_empresa`).
3. T0 do `pg_stat_statements` (o SQL do Anexo F67, só leitura, por papel, separando as formas pela presença de
   `p_empresa`); espere **≥ 30 min**; T1. Condição: **Δ = 0** das antigas em `authenticated`, `service_role` e `anon`.
   Não zerou? Repita a janela (até três); não zerou em três, deixe a contração pendente e anote aqui.
4. Aplique `supabase/migrations/0193_contracao_assinaturas_antigas.sql` em produção pelo conector, com o texto exato
   (`apply_migration`, nome `contracao_assinaturas_antigas`).
5. Depois: o conta a conta `--fase f67-depois` (0 divergência), `node scripts/smoke/smoke-prod.mjs` (0 falha), o
   conferidor contra produção (0 recusadas), os advisors (o lint de `security definer` vai a **38**) e a paridade nas 11
   classes (agora sem variante: igual ao ensaio).

## 1.3 Depois do deploy — a conferência à mão (10 minutos, só leitura, nada destrutivo)

Entre com a sua conta:

- **Zona destrutiva › Resetar**: a prévia do "tudo" mostra `RESETAR TUDO — <N> ATIVOS`, com N = o total de ativos da WAP.
  **Feche sem confirmar.**
- **Pendências › conflitos entre filiais**: a mesa abre como antes, com os mesmos grupos (59 hoje).
- **Administração › Usuários**: a lista e os cargos são os de antes; abra a edição de um usuário e **feche sem salvar**.
- **Administração › Importar**: a conferência de uma planilha FICTÍCIA abre como antes. **Não aplique.**
- Na próxima vez que gerar um termo de verdade, ele sai igual (a trava do termo só recusa empresa sem modelo — a WAP tem).
- `/api/saude` com `1.73.0`; e, no dia seguinte, a Parte B do `saude.yml` com a deriva limpa e os **mesmos dois** achados
  do #84 (`backup_orfao` 12, `detentor_em_estado_sem_dono` 1).

## 1.4 O `git diff v1.72.0 v1.73.0 --stat` — o que deve e o que não deve aparecer

**Deve:** `supabase/migrations/0185`–`0193` e `migrations.lock.json`; `supabase/rollback/F67-desfaz.sql`; os roteiros
novos (`cargo_por_empresa`, `conflito_entre_empresas`, `termo_bloqueado`, `f67_rollback`) e os adaptados (§2);
`scripts/db/mutacoes.mjs`, `corpo-vigente.mjs`, `scripts/perf/conta-a-conta.mjs`; o TS dos chamadores
(`src/lib/actions/*`, `src/lib/queries/*`, `src/lib/auth/*`, `src/lib/supabase/*`), `database.ts` só nas assinaturas;
os testes; os documentos (§2); `package.json`, `CHANGELOG.md`, `registry.ts`; `docs/f67-evidencias/**`.

**Não deve:** `.github/workflows/**`, o `CLAUDE.md` da raiz, `.env*`, `scratchpad/`, `package-lock.json` com
dependência nova, migration anterior à `0185`, o Storage além da troca da decisão 3, os escritores comuns, os defaults.

## 1.5 Lembretes

- O próximo prompt é o da **F67B** (Storage e Realtime por empresa) — a ficha está no `PLANO-MULTIEMPRESA.md`.
- O diagnóstico do #84 é entrega avulsa, à parte desta fase.

---

# 2. O que mudou, por arquivo e por quê

**Banco (o desenho no §5 do plano).**
- `0185_cargo_por_empresa` — as cinco formas de cargo por empresa e as duas de filial (`empresa_da_filial`,
  `filial_da_empresa`). Nada as chamava ainda: repouso válido.
- `0186_consumidores_por_empresa` — os sete corpos que usavam o cargo sem empresa passam à forma por empresa
  (`pode_escrever_filial` delega a `pode_escrever_unidade` pela empresa da filial; a observabilidade pela legada explícita).
- `0187_policies_sem_par_por_empresa` — as nove policies cujo piso não tinha par (Storage ×7, `profiles`, o backup da F6A)
  saem do piso ANTES dele mudar, para a forma por empresa com a legada explícita (F67B/F69/permanente).
- `0188_piso_cargo_mais_forte` — `papel_atual()` = o cargo mais forte entre as memberships ativas.
- `0189`–`0191` — a expansão das RPCs (conta, Zona destrutiva + prévia + import, a mesa); as antigas intactas, salvo a
  chave advisory convertida nas duas de reset e na mesa (as famílias não se cruzam na janela).
- `0192_termo_por_empresa` — a trava do termo (a fonte única e o gatilho BEFORE INSERT).
- `0193_contracao_assinaturas_antigas` — as 21 assinaturas antigas e `e_dev()` saem.
- `supabase/rollback/F67-desfaz.sql` — gerado das migrations; idempotente nos dois estados (só expansão; expansão +
  contração); ensaiado no CI por `f67_rollback.sql` (rb1–rb7) e dentro dos rollbacks F62–F66.

**Roteiros.** Novos: `cargo_por_empresa` (P0–P6, Qa–Qc, D1–D5), `conflito_entre_empresas` (C0–C7), `termo_bloqueado`
(T0–T6), `f67_rollback` (rb1–rb7). Adaptados, cada um com o motivo na ata (itens 1, 2, 4): `cargo_equivalencia` (a grade
da F67 e a filial nula fechando), `cargo_dev`, `dev_destrutivo` (as formas `p_empresa`, a frase com a quantidade, a
trilha com `alcance = 'empresa'`), `conflito_filiais`, `import_fora_da_unidade` (5a/5a-bis/5a-ter), `import_substituir`,
`papeis_rls`, `troca`, `comprimento_comportamento`, `seguranca_catalogo`, `f36_detentor`, `definer_sem_tenant` (a
asserção 4 por empresa), `catalogo_policies`/`catalogo_secdef`/`empresa_no_acervo` (`k_leitura_tenant` com as doze),
`integridade_tenant` (o L4 novo), `isolamento_tenant` (10e invertido, 10l, 10m) e os rollbacks F62–F66 (rodam o da F67
antes). Nenhuma asserção mudou para passar: as que mudaram de sentido estão declaradas, com a nova asserção do recorte.

**TS.** Os chamadores das 15 RPCs passam `p_empresa` (da filial quando há; senão `empresaDaOperacao()` = a legada
explícita, o ponto de injeção da F70), contados pela catraca `empresa-legada-catraca.test.ts`; as guardas de Server
Action pela forma por empresa; as frases novas em `erros-do-banco.ts`; a identidade do ativo procurada só nas unidades da
mesma empresa; `database.ts` só nas assinaturas (hand-fix datado, 102 funções). Testes novos: a catraca,
`rollback-f67.test.ts`, a seção 5 de `conta-a-conta.test.mts`; o teto do injetor 163 → 170.

**Instrumentos.** `scripts/perf/conta-a-conta.mjs` (as fases `f67-antes`/`f67-depois`, o oráculo da regra de antes, a
sabotagem I); `scripts/db/mutacoes.mjs` (sete mutações novas, o grupo `F67_CARGO_POR_EMPRESA`); `corpo-vigente.mjs`
(`derrubadaDepois`).

**Documentos.** `PLANO-MULTIEMPRESA.md` (a ficha F67 reescrita, as fichas F67B e F67C, as notas F69/F70/F71), a MATRIZ
(R-ACC-124 a 130), `ADR-002` §17, `RUNBOOK-BANCO.md` (Anexo F67: a receita expandir/contrair com nome mantido e o SQL de
T0/T1), `ARQUITETURA.md` §4, os `CLAUDE.md` de `src/lib/auth`, `supabase` e `scripts/db`, os índices e a ata.

---

# 3. Os números MEDIDOS, lado a lado com a ficha

As divergências entre a ordem e a medição (o §1 do plano tem as 28 linhas); cada uma explicada:

| fato | a ordem | o medido | consequência |
|---|---|---|---|
| 1 | PG 17.6 | produção 17.6, **ensaio 17.11** | nenhuma: o deparse das policies e das views bateu entre os dois bancos (a paridade, §6) |
| 8 | `membros` sozinha; `empresas`/`plataforma_admins` com policy | `membros` **já pareada** (0178); `empresas` e `plataforma_admins` **sem policy**; a ordem omitiu o backup da F6A e a leitura indireta de termos | **10 sem par**, não 7 — a 0187 trata as nove policies, e a 0186 a leitura indireta |
| 9 | os chamadores TS | `EMPRESA_LEGADA_ID` em `queries/admin.ts` com **6** usos; `resetarBloco` em `:426` | só endereço |
| 11 | universo 21 | 21; mas `k_escopo_ok` era **100% nominal** | a trava nova da F52 é uma varredura de CORPO, não uma troca de lista |
| 12 | a plataforma fora do denominador do último admin | a plataforma é membro (decisão 12/11-3) | o dev **conta** enquanto for membro — divergência declarada da ficha |
| 15 | "sete comandos" com `p_filial is null` | **6** em `resetar_acervo` + **1** em `resetar_itens` | a trava D3 conta os comandos por função |
| 16 | a chave da mesa `conflito_apagar` | **`conflito_filiais_apagar`**, forma `(bigint)` | a conversão a `(int, int)` usa o nome certo |
| 20 | o gatilho `termos_gerados_ids_da_empresa` | é NOME de gatilho (a função é `termo_da_empresa()`); há **três** BEFORE, um só de INSERT | o gatilho novo ordena antes dele pelo nome |
| 23 | nenhuma sonda lê a asserção 2 | confere; mas a Parte B depende de `papel_atual()` para a conta `consulta` | a guarda de `checagens_integridade_resumo` vai à legada explícita (decisão 14) |

E o que a ordem não sabia e mudou o desenho: as travas 15h/7b/7c da F63 (as doze funções que leem `empresa_id` entram
NOMINALMENTE em `k_leitura_tenant`; as views da mesa particionam pela empresa da FILIAL, sem citar `empresa_id`); o L4 de
`integridade_tenant.sql`; `eventos_admin.empresa_id` gravado explícito nas destrutivas; a trilha das cinco de conta
continua na Server Action (F67C).

---

# 4. As decisões

As do Johnny (12/11-2, 12/11-3, 13/11-1 "dev sou só eu", 13/11-2 zero janela, 13/11-3 o #84 travado) e as **vinte da
fase** estão na ata (`DECISOES.md`, 2026-11-13 · F67), com os desvios de execução (itens 1–19). As que mudam o que um
leitor esperaria:

- as formas por empresa têm **nome próprio** (dar parâmetro a `papel_atual()` exigiria `cascade` em 60 policies);
- o piso vira o **cargo mais forte** — e é seguro porque nenhum consumidor sem par sobrou (a trava Qa/Qb);
- a filial que não existe **fecha até para o admin** (`pode_escrever_filial` delega pela empresa da filial);
- o dev **conta** no denominador do último administrador (12/11-3);
- o rollback é **gerado**, por um script fora do repositório (a PGlite não é dependência aprovada); a completude e o
  esquema são provados no repositório e no CI;
- em produção, um conta a conta **a mais**, depois da 0188, porque ela troca o sentido do piso em todas as policies vivas.

# 5. As tabelas-verdade e o mapa de assinaturas

No plano: §2 (os consumidores do cargo — policies, corpos, TS — cada linha com destino: forma por empresa real, legada
explícita com a fase que fecha, ou piso pareado), §3 (as `security definer`: **65 → 69**; o universo da trava da F52
**21 → 26**; cada uma com de onde vem a empresa e a primitiva que a confere) e §4 (o mapa das 20 assinaturas: antiga →
nova → chamador → de onde sai `p_empresa`; `e_dev()` sai).

---

# 6. O apply e as provas, nos dois bancos

O texto aplicado é o do commit congelado `051a5f8`, e o ledger o prova: o md5 do statement gravado = o do arquivo, em
todo lote dos dois bancos. Depois de cada lote, a prova compacta (só catálogo e hash): as funções tocadas com o md5 do
`prosrc` = o do arquivo; o RESTO das funções (o `prosrc` e o EXECUTE dos quatro papéis) = o "antes" do mesmo banco; as
policies e as views = o antes, com as nove da 0187 e as duas da 0191 pelo deparse da mesa.

| lote | ensaio | produção |
|---|---|---|
| antes (0184) | 106 · `resto_ok` · 62/9 · 3 gatilhos | 106 · `resto_ok` · 62/9 · 3 gatilhos · ledger 168 |
| 0185 | 7 tocadas, 0 divergentes | 7 · 113 = 7 + 106 |
| 0186 | 0 divergentes | 14 · 113 = 14 + 99 |
| 0187 | as nove = a mesa | as nove = a mesa (o mesmo hash do ensaio) |
| 0188 | 0 divergentes | 15 · 113 = 15 + 98 · **conta a conta 0** logo depois |
| 0189 | 23 · 120 funções | 23 · 120 = 23 + 97 |
| 0190 | 36 · 131 = 36 + 95 | 36 · 131 = 36 + 95 (o resto com o mesmo hash do ensaio) |
| 0191 | 39 · 133 · a mesa 0/0 = a regra de antes | 39 · 133 · a mesa **120/59 = a regra de antes** |
| 0192 | 41 · 135 · 4 gatilhos | 41 · 135 · 4 gatilhos · 0 termo fora da lista |
| 0193 | **0 das 21 vivas** · 114 = 38 + 76 · nenhuma sobrecarga | *(depois da janela — §8)* |

Os advisors: desempenho igual ao antes nos dois; segurança, só `authenticated_security_definer_function_executable`
34 → 54 na expansão (as 20 formas novas, com o grant da antiga) e **38** depois da contração (medido no ensaio); ERROR 0.
A paridade nas 11 classes: 9 idênticas, e `func`/`grant_func` de produção sem as 21 = o ensaio contraído, fingerprint por
fingerprint (`G-apply/paridade-expansao.json`).

Detalhe por banco: [`G-apply/ensaio.md`](f67-evidencias/G-apply/ensaio.md) e
[`G-apply/producao.md`](f67-evidencias/G-apply/producao.md).

# 7. O conta a conta, nos dois bancos

Para cada membership ativa (a identidade escolhida DENTRO do banco; nenhum id sai), as funções reais × o oráculo da regra
de antes, em oito classes: o cargo, as derivadas, o piso, a escrita por filial, a escrita por unidade, a gestão de contas
(um alvo dev e um comum), a Zona destrutiva e o último administrador. `transaction_read_only`; o bloco termina em `raise`.

| medida | ensaio | produção |
|---|---|---|
| `f67-antes` | **0** · 3 memberships · 18 pares | **0** · 14 memberships · 84 pares · 28 gestões |
| `f67-antes` depois da 0188 | — | **0** |
| `f67-depois` (expansão) | **0** | **0** nas 8 classes |
| sabotagem I (`f67-depois`, só no ensaio) | **3** (classe `cargo`) — o instrumento enxerga | — (proibido fora do ensaio) |
| `f67-depois` (contração) | **0** | *(depois da janela)* |

Os JSON em [`conta-a-conta/`](f67-evidencias/conta-a-conta/).

# 8. A janela do `drop`

*(preenchido nesta run, depois do deploy: T0, a prova estática, a janela, T1, o Δ das antigas por papel.)*

# 9. O conferidor de formas e o smoke

| | ensaio | produção |
|---|---|---|
| conferidor (expansão) | 248 pontos · 88.182 linhas · **0 recusadas** · 1 ponto sem célula (`itens.saldo-colaborador` — o ensaio não tem colaborador; o mesmo da F66) | **272 pontos · 112.172 linhas · 0 recusadas · 0 reprovados** |
| conferidor (contração) | 248 · **0 recusadas** · o mesmo ponto | *(depois da contração)* |
| smoke | — | **109 OK · 1 aviso · 0 falha** (o aviso de sempre: `kits_modelos` sem kit para provar a RLS do anon) |

# 10. O #84, antes e depois

| | `backup_orfao` | `detentor_em_estado_sem_dono` | os outros 11 |
|---|---|---|---|
| antes (Frente A, os dois bancos) | 12 | 1 | `arquivo_termo_orfao` 3, `conflito_entre_filiais` 59, o resto 0 |
| produção, antes do 1º lote | **12** | **1** | iguais |
| a Parte B à mão, depois da contração | *(nesta run)* | | |

# 11. As sabotagens, com a saída real

| | o que prova | onde está a saída |
|---|---|---|
| A | a empresa antes do cargo; nulo fecha | P1/P4/P5 de `cargo_por_empresa.sql`; a mutação `f67-unidade-cargo-antes-da-empresa` detectada por P4 (`E-injetor/mesa-170.txt`, e o CI) |
| B | a trava do piso acusa os quatro jeitos | Qc (embutida); vermelha de verdade no CI das travas (`B-travas/ci-travas-vermelhas-cc089db.txt`); `f67-piso-num-corpo` → Qa |
| C | a trava da F52 por empresa | `definer_sem_tenant.sql` "sabotagem C1 e C2" e a `security definer` fictícia nova; vermelha no CI das travas |
| D | as destrutivas recusam outra empresa | D5 (embutida: default, posição, o "tudo" sem empresa, o rótulo sem `count(`); `f67-apagar-ativo-sem-recusa-de-empresa` → 10l; `dev_destrutivo` 7a-frase |
| E | a mesa não junta empresas | C7 (embutida); `f67-view-da-mesa-sem-particao` → C1/C2 |
| F | o import recusa a filial da B antes do lock e do backup | `import_fora_da_unidade.sql` 5a/5a-bis/5a-ter |
| G | a trava do termo, também como `postgres` | T1/T2/T3 e T6 (embutida); `f67-gatilho-do-termo-desligado` → T1 (+T2, T3, T6) |
| H | as chaves advisory com a empresa | D4; `f67-sentinela-do-tudo-sem-empresa` → D4; a trava de mesa `advisory-por-empresa.test.ts` |
| I | "nada mudou", e o instrumento sabe achar | conta a conta 0 nos dois bancos; sabotado = **3** no ensaio (`conta-a-conta/ensaio-f67-depois-sabotada.json`) |
| J | a janela evita um 404 real | no ensaio contraído, `e_dev()` → **HTTP 404 `PGRST202`** (`G-apply/sabotagem-j-ensaio.json`); no CI, a asserção 2 de `catalogo_secdef.sql` (nenhuma sobrecarga na cadeia contraída) |
| K | o rollback, nos dois estados | `f67_rollback.sql` rb1–rb7 (o contraído, de novo, e o só-expansão) e os rollbacks F62–F66 com o da F67 dentro, verdes no CI do `051a5f8` |

Mais `f67-outro-admin-conta-todas-as-empresas` → 10m. O injetor: **170/170** detectadas pelo cenário nomeado no CI do
`051a5f8`; quarentena 2 (as mesmas da F66, abaixo de ⅓).

# 12. A revisão adversarial

Sete achados, cada um por um cético instruído a refutar; **0 confirmados**. Dois viraram backlog porque são verdade mas
não são defeito desta fase: o backup do "tudo" ainda lê o acervo do sistema inteiro (TS, F67B/F67C) e o conta a conta
percorre só as memberships ativas (a desativada não tem cargo nas duas regras).

# 13. A contagem final, antes × depois

| | antes (v1.72.0) | depois (v1.73.0) |
|---|---|---|
| testes de mesa (vitest) | 268 arquivos · 8.442 casos | **271 · 8.589** |
| roteiros do CI · asserções | 57 · 1.203 | **61 · 1.248** |
| mutações · teto · quarentena | 163 · 163 · 2 | **170 · 170 · 2** |
| `security definer` de `public` | 65 (34 executáveis por `authenticated`, 0 por `anon`) | **69** (38 · 0) — contado no ensaio contraído |
| funções de `public` | 106 | **114** (135 em produção até a contração) |
| universo da trava da F52 | 21 | **26** |
| tipos (`db:types:diff`) | 38 relações · 358 colunas · 95 funções | **38 · 360 · 102** (as colunas `empresa` das duas views da mesa) |
| lint de segurança `authenticated_security_definer…` | 34 | **38** (54 na janela) |

# 14. Os 27 critérios, autoverificados

| # | critério | estado |
|---|---|---|
| 1 | lint, test, typecheck, build; contraste, verificar:actions; o CI | ✅ no `051a5f8` |
| 2 | o plano completo, anterior ao código | ✅ |
| 3 | o "antes" nos dois bancos | ✅ `antes/` |
| 4 | migrations 0185+, cabeçalho, lock, F38, sem `cascade`/DDL dinâmica/default; contração própria | ✅ |
| 5 | as formas por empresa; empresa antes do cargo; nulo fecha | ✅ P0–P6 |
| 6 | a trava do piso, nascida vermelha | ✅ Qa–Qc · `B-travas/` |
| 7 | `definer_sem_tenant` por empresa | ✅ |
| 8 | as guardas da F52 e `idsDeAdminsAtivos` por empresa; o denominador declarado | ✅ ata, decisão 12 |
| 9 | `p_empresa` 1º sem default; 42501; o "tudo" por empresa e `RESETAR TUDO — <N> ATIVOS` | ✅ D1–D5 |
| 10 | a plataforma destrói em qualquer empresa; o dev só da A não destrói na B | ✅ `dev_destrutivo`, 10l |
| 11 | conflito entre empresas impossível; o par legítimo funciona | ✅ C0–C7 |
| 12 | as chaves advisory | ✅ D4 + a trava de mesa |
| 13 | a trava do termo | ✅ T0–T6 |
| 14 | `isolamento_tenant` nas duas direções, com o par simétrico | ✅ |
| 15 | zero janela: contração só depois do deploy e de Δ = 0 | *(nesta run — §8)* |
| 16 | nada mudou para a WAP | ✅ na expansão (conta a conta, smoke, conferidor); a contração e a Parte B *(nesta run)* |
| 17 | byte a byte fora da tabela; advisors declarados; paridade 11 classes | ✅ na expansão (§6) |
| 18 | o rollback nos dois estados, no CI; F62–F66B medidos | ✅ (o da F66B não precisa do da F67 — ata, item 9) |
| 19 | os roteiros adaptados listados, nenhuma asserção para passar | ✅ §2 |
| 20 | o injetor: as mutações, o teto 163 → 170, a quarentena < ⅓ | ✅ |
| 21 | `database.ts` só nas assinaturas; `db:types:diff` verde | ✅ |
| 22 | os documentos | ✅ |
| 23 | nenhuma dependência nova; os intocados intocados | ✅ |
| 24 | `1.73.0`, CHANGELOG, registry; a tag | ✅ versão; a tag *(no PR de docs)* |
| 25 | as sabotagens A–K com saída real | ✅ §11 |
| 26 | nenhum dado real; ninguém abriu o `.env.local` | ✅ (os scripts o carregam por `--env-file`, sem imprimir valor) |
| 27 | este relatório | ✅ |

# 15. O estado de repouso — e se o projeto parar aqui por dois meses

- **Com a contração pendente** (só a expansão em produção): as duas formas convivem; o app novo chama só as novas, e as
  antigas — que ninguém chama — continuam respondendo pela legada (os resets antigos e a mesa antiga já tomam a MESMA
  chave advisory das novas, então não há corrida entre um app velho e um novo). O lint de segurança fica em 54. Nada
  quebra; fechar é o §1.2.
- **Com a contração feita**: o estado final da fase. O piso só existe pareado; toda RPC que destrói ou gere conta exige
  `p_empresa`; a WAP é a única empresa, então tudo responde como antes.
- Em qualquer dos dois: o rollback `F67-desfaz.sql` serve (é idempotente nos dois estados).

# 16. O merge, o deploy e a conferência pós-deploy

*(preenchido nesta run: o merge do PR #94, `/api/saude`, o smoke pós-deploy, a contração em produção e a Parte B.)*

# 17. O que este relatório NÃO prova

- Que o Storage e o Realtime recortam por empresa (F67B).
- Que uma linha nova de outra empresa recebe a empresa certa: o default é a WAP até a F67C.
- Que a empresa B opera pela tela (F70).
- Que as recusas cruzadas disparam nos bancos VIVOS: elas são provadas no CI, com duas empresas; nos vivos, a prova é o
  texto igual ao do CI (o md5 de cada corpo) e o conta a conta — com uma empresa só, não há o que recusar.
- Que o conta a conta cobre a membership desativada (backlog, §12).
- Nada sobre os dados do #84.

# 18. Pendências e backlog nomeado

- **F67B** — Storage e Realtime por empresa (as policies de `storage.objects` hoje pela legada explícita; o join de
  `pode_ler_arquivo_termo`).
- **F67C** — o fim do default `empresa_legada()`; a trilha das cinco de conta com a empresa; o backup do "tudo" no recorte
  da empresa.
- **F69** — as contas dev fora de `membros`; `profiles` "leitura operador" com o recorte.
- **F70** — a empresa da sessão (`empresaDaOperacao()` deixa de ser a legada).
- `database.ts` regenerado do banco depois da contração (o hand-fix datado sai) — conferir só o bloco novo, nunca `cp`
  cego (a memória da v1.71.2).
- O conta a conta com as memberships desativadas.
