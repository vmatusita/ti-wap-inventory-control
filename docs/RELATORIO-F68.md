# Relatório F68 — a porta pública por empresa (o visualizador por senha sem service role)

**v1.76.0** — as migrations `0208`–`0212` (só expansão) aplicadas no ENSAIO e em PRODUÇÃO em 19/11/2026, com a exatidão
migration a migration (o `md5` de cada `prosrc` e de cada comentário = o do arquivo, nos dois bancos) e a paridade do
catálogo ensaio × produção fechada (`0d347254…`); a prova viva no ensaio 10/10, as cinco recusas a ±0,3% uma da outra; o
app novo pelo [PR #101](https://github.com/vmatusita/ti-wap-inventory-control/pull/101) · SHA de código congelado
**`fd6d93fe`** · plano [`PLAN-F68.md`](PLAN-F68.md) · ata `DECISOES.md` (2026-11-19 · F68) · evidência em
[`f68-evidencias/`](f68-evidencias/) · tag `v1.76.0` no merge do PR de documentação.

> A nona fase da virada multiempresa. Até a v1.75.0, quem entrava por **senha de visualização** recebia o client
> ADMINISTRATIVO do banco (o service role, que passa por cima de toda a segurança por linha): as quatro defesas da virada
> não alcançavam esse caminho, e o único muro era o código das telas de relatório. A F68 tira o service role do visualizador:
> ele passa a falar SÓ com duas funções do banco, como `anon` (a identidade pública), e a senha é conferida DENTRO do banco
> (bcrypt). A sessão vira uma linha do banco (24 h, morre na revogação), a senha é de UMA empresa, a porta tem endereço por
> empresa (`/r/<slug>/relatorios`), e os relatórios GERADOS saem por uma lista branca — sem nome de pessoa nenhum.
>
> Para quem entra com a sua conta, nada muda: as 62 policies com o mesmo md5, as 117 funções de antes byte a byte, o
> smoke com 0 falha, o conferidor com 0 recusadas, as 13 checagens nos números travados.

---

# 1. O ROTEIRO DO JOHNNY — o que ficou com você

## 1.0 O que está pendente

- **As senhas novas (§1.2) — é o único passo que só você faz.** Desde o deploy, as 5 senhas de visualização de hoje
  (formato antigo, `scrypt`) **não abrem mais a porta**: os gestores ficam sem acesso por senha até você criar as novas.
  Elas continuam aparecendo como "Ativa" na tela Senhas de acesso (a tela não distingue o formato — ver §16).
- O banco está inteiro no ar (as cinco migrations nos dois bancos). O merge, o deploy, a conferência pós-deploy, a Parte B
  e a tag estão no §7.3 e no PR de documentação.

## 1.1 O rollback — se a porta der problema

**A trava de emergência (fecha a porta na hora, sem desfazer nada)** — no SQL Editor de produção:

```sql
revoke execute on function public.relatorio_publico_abrir(text, text, text) from anon;
revoke execute on function public.relatorio_publico_dados(text, text, text, jsonb) from anon;
```

Reabrir é o `grant execute … to anon` das mesmas duas (RUNBOOK, Anexo F68). Com a porta fechada, quem entra por senha vê
"Não foi possível conferir a senha agora"; o operador logado não é afetado.

**O rollback inteiro — NESTA ORDEM:**

1. **Primeiro o app**: reverter o merge do PR #101 na `main` (`git revert -m 1 <commit do merge>`, PR, merge) e esperar o
   deploy. O app volta à v1.75.0, que usa o caminho antigo (que a F68 deixou de pé: `registrar_tentativa_senha` e
   `senha_tentativas` só saem na F68B).
2. **Depois o banco**: o conteúdo EXATO de [`supabase/rollback/F68-desfaz.sql`](../supabase/rollback/F68-desfaz.sql) no SQL
   Editor de produção (e no ensaio). Ele derruba, em `0212 → 0208`, as seis funções, as duas tabelas (só sessão e
   contador, que morrem com elas) e a `unique` da `0208`; é idempotente; o ledger fica. Ensaiado no CI a cada push
   (`f68_rollback.sql`, 7/0) e com os rollbacks F62–F67C na frente.

As senhas bcrypt que você tiver criado ficam na tabela e não abrem a porta antiga (que confere `scrypt`): revogue-as pela
tela depois do rollback.

## 1.2 As senhas novas (decisão 19/11-3) — passo a passo

1. Em **Administração › Senhas de acesso**, crie a(s) senha(s) nova(s) dos gestores (de 8 a 72 caracteres — letra com
   acento conta como dois; no máximo 5 ativas). **A tela devolve o endereço novo da porta** — é ele que você entrega.
2. Numa **janela anônima**, abra o endereço, entre com a senha nova e confira: os relatórios gerados aparecem, **sem nomes
   de pessoas** (nem colaborador, nem setor, nem quem gerou); o "ao vivo" mostra o aviso com o link para os gerados.
   Clique em **Sair**.
3. Ainda na janela anônima, confira que uma senha **ANTIGA** não abre (a mesma mensagem de senha errada).
4. Na mesma tela, **revogue as 5 senhas antigas** (todas as que existiam antes do deploy) — a trilha fica com o seu nome.
5. Mande aos gestores **o endereço novo e a senha nova**. Os links antigos (`/relatorios/...`) levam à entrada nova
   sozinhos (308), mas a senha antiga não abre.

## 1.3 `/api/saude` e a Parte B

- `/api/saude` com `1.76.0` e o commit do merge (conferido no §7.3).
- No dia seguinte, a Parte B do `saude.yml` (a execução agendada, ou `gh workflow run saude.yml -f alvo=producao -f
  partes=b`): a deriva sem pendente (as cinco migrations no ledger dos dois bancos) e as 13 checagens nos números
  travados (3 / 12 / 59 / 1 e nove 0). A Parte B segue vermelha pelos 2 achados de dados do #84 — o mesmo de antes; o
  que importa é a linha de DERIVA limpa e os números iguais.

## 1.4 O `git diff v1.75.0 v1.76.0 --stat` — o que deve e o que não deve aparecer

**Deve:** `supabase/migrations/0208`–`0212` e o `migrations.lock.json`; `supabase/rollback/F68-desfaz.sql`; os roteiros
`isolamento_viewer.sql` e `f68_rollback.sql` (novos) e os catálogos/rollbacks tocados; `supabase/ci/bootstrap-roles.sql`
(o `pgcrypto`); `src/app/r/**` (a porta); `src/lib/supabase/publico.ts`, `src/lib/actions/porta.ts`,
`src/lib/auth/porta-rotas.ts`, `src/lib/relatorios/{lista-branca-porta,porta-sessao}.ts`; `senhas.ts`, `acesso.ts`,
`proxy.ts`, `otp.ts`; os componentes do cabeçalho do visualizador e o `semPessoas` das tabelas; `database.ts` (só o da
fase); o injetor (`mutacoes.mjs`); o smoke; `scripts/perf/medir.mjs`; a documentação, a versão e a ajuda.
**Não deve:** `.github/workflows/**`, o `CLAUDE.md` da raiz, nenhuma policy, `src/lib/queries/admin.ts`, nenhuma
dependência nova, nenhuma migration antiga, nenhum dado real.

## 1.5 Lembretes

- O próximo prompt é o da **F68B**: o relatório AO VIVO pela porta (as ~25 leituras medidas contra os 3 s do `anon`) e a
  contração de `registrar_tentativa_senha`/`senha_tentativas` (a janela por `pg_stat_statements`, T0 = 16 chamadas do
  `service_role`), o `ViewerAutoRefresh`, `VIEW_SESSION_SECRET` fora do ambiente.
- O diagnóstico do **#84** continua como entrega avulsa. O seed com duas empresas continua no backlog (16/11-4).
- O **`CLAUDE.md` da raiz** ainda descreve o visualizador com o client administrativo e o hash `scrypt` (a ordem proibia
  editá-lo): as frases vão na **F71**.

---

# 2. O que mudou, por arquivo e por quê

**O banco** (`0208`–`0212`, todas `ADITIVA`, `db:lock` no mesmo commit):
- `0208_porta_base` — confere o `pgcrypto` em `extensions` (não cria extensão) e cria `unique (empresa_id, id)` em
  `senhas_acesso`, o alvo da FK composta da sessão. As 5 senhas não são tocadas.
- `0209_porta_sessoes` — `sessoes_visualizador`: o sha-256 do token opaco, a empresa e a senha (FK composta: a sessão é
  da empresa DA SENHA), 24 h, o encerramento. Deny-all (RLS, zero policy, zero privilégio). Sem `guarda_empresa`
  (`k_empresa_id_sem_guarda`, o molde de `operador_filiais`).
- `0210_porta_tentativas` — o contador: o teto por EMPRESA (20/60 s) e por (empresa, origem) (5/60 s), a origem só como
  md5, slug inexistente num balde só. Deny-all.
- `0211_porta_gestao_senhas` — `senha_acesso_criar/_conferir/_definir_status`: `e_admin_na(p_empresa)` antes de qualquer
  efeito, bcrypt custo 10, 8–72 bytes, teto de 5 ativas, a repetida na mesma empresa recusada; revogar encerra as sessões.
- `0212_porta_publica` — as duas portas de `anon` (`relatorio_publico_abrir`, `relatorio_publico_dados`) e a projeção da
  lista branca (`relatorio_publico_projetar`, sem EXECUTE para ninguém).

**O app:** a árvore `src/app/r/[empresa]/relatorios/{acesso,(sessao)/{gerados,gerados/[id],[filial]}}` + a 404 e o
boundary de erro da porta; `publico.ts` (o client SEM sessão, só as duas funções, Zod estrito); `actions/porta.ts`
(entrar/sair); `porta-rotas.ts` (o slug espelho da `0152`, o `next` na mesma empresa, a tradução do 308);
`lista-branca-porta.ts` (a fonte única da lista, = `k_lista`); `porta-sessao.ts`; `proxy.ts` (o 308 de `/relatorios/**`
sem operador, `/r/**` sem `getUser`); `senhas.ts` (a gestão pelas funções, com o client de sessão); `acesso.ts` sem o
modo viewer; `semPessoas` nas tabelas do snapshot. Saíram `senha-sessao.ts` (scrypt + HMAC) e os testes dele.

**As travas:** `isolamento_viewer.sql` (21), `f68_rollback.sql` (7), o par nominal de `anon` em `catalogo_secdef.sql`
(4a por assinatura, 4b), a asserção 5 de `seguranca_catalogo.sql`, as listas de `catalogo_policies`/`definer_sem_tenant`/
`imutabilidade_tenant`/`integridade_tenant`, a fronteira e o confinamento da porta reescritos, a lista branca TS↔SQL, a
forma "sempre 5 crypt", nove mutações no injetor. O detalhe arquivo a arquivo está no PLAN (§2–§5) e na ata.

---

# 3. Os números MEDIDOS × a ficha — e as divergências

| a ficha / a ordem | medido | |
|---|---|---|
| a numeração `0208`, a versão `1.76.0` | igual | a ficha antiga dizia outra numeração — **divergência 1** |
| `abrir` recebe a senha; `dados` recebe o `senha_id` | `dados` recebe a SESSÃO (token opaco) | **divergência 2** (decisão 1) |
| a rota antiga atrás de flag | descartada | **divergência 3** (decisão 13) |
| `p_com_pessoas` | não existe — a lista branca | **divergência 4** (decisão 7) |
| `isolamento_viewer.sql` já existiria | nasce aqui (só agora testável) | **divergência 5** |
| bcrypt (custo a escolher) | bf/10: 91 ms produção, 60 ms ensaio; K = 5 | decisão 3 |
| as cinco recusas indistinguíveis (n ≥ 30, ±10%) | n = 30: todas a **±0,3%** da mediana geral (301,1 ms) | §5 |
| advisors: + 2 WARN anon, + INFO das tabelas | + 2 WARN anon, + 2 INFO, **e + 3 WARN `authenticated_security_definer`** | **divergência 6** (§9) |
| a ordem do `lock_timeout` | `abrir` com `lock_timeout = 500ms` e o teto estourado recusando sem trava | **divergência 7** (revisão A2) |

---

# 4. As decisões

As três do Johnny (19/11-1 duas fases; 19/11-2 sem nomes, como a ficha; 19/11-3 o banco confere a senha) e as **vinte e
três decisões da fase** estão na ata (`DECISOES.md`, 2026-11-19 · F68) e no §6 do [plano](PLAN-F68.md), com o que a
execução fixou: o token opaco sem o envelope HMAC; a sessão em tabela deny-all sem a `guarda_empresa`; bcrypt 10 e K = 5;
as cinco recusas `{"ok": false}` com o mesmo trabalho; o contador com o teto por empresa (a chave anon é pública);
`dados` com a lista fechada e a diagonal; a lista branca TS↔SQL (228 campos: 213 saem, 15 não; o texto livre sai —
declarado); a gestão por empresa; as 5 senhas intocadas; a rota e os 308; o layout público sem `loading.tsx`; a rota
antiga atrás de flag descartada; a fronteira reescrita; o `pgcrypto` no bootstrap do CI; só expansão; nove mutações; o
smoke com o mapa novo; a senha em claro nunca em log; a trilha com a empresa da senha; nada muda para o operador.

---

# 5. A medição das cinco recusas (decisão 4)

**O critério, escrito antes de medir:** n = 30 por caminho, os cinco caminhos intercalados com a ordem girando a cada
rodada, o contador zerado antes de cada chamada; a mediana de CADA caminho a ±10% da mediana geral das recusas.

**Os números** (ensaio, [`D-ensaio/P2`](f68-evidencias/D-ensaio/P2-tempo-das-recusas.sql) →
[`resultado.txt`](f68-evidencias/D-ensaio/resultado.txt)):

| caminho | mediana | desvio da geral |
|---|---|---|
| sem senha | 300,8 ms | −0,1% |
| senha errada | 301,8 ms | +0,3% |
| senha revogada | 301,2 ms | 0,0% |
| slug inexistente | 301,1 ms | 0,0% |
| senha de A no slug de B | 302,1 ms | +0,3% |
| **mediana geral das recusas** | **301,1 ms** | — |
| abertura (referência) | 301,2 ms | (já se distingue pela resposta) |

Fora da régua: **nenhum**. Recusas com resposta diferente de `{"ok": false}`: 0. A régua sabe acusar: com o crypt pulado
nas posições vazias (sabotagem D), o slug inexistente cai a 0,4 ms (−99,3%) e sai da régua.

**O custo do bcrypt e o K:** bf/8 21,8 ms · bf/10 91,2 ms · bf/11 158,9 ms · bf/12 337,7 ms (produção, só leitura). Custo
**10**, K = **5** (o teto de ativas por empresa): o pior caso de `abrir` ≈ 0,46 s em produção, 0,30 s no ensaio — bem
dentro dos 3 s do `anon`.

---

# 6. Os roteiros

`isolamento_viewer.sql` — **21 asserções** (V1–V12): a mesma senha em claro nas duas empresas; a senha de A no slug de B;
as cinco recusas; a sessão só como hash; a diagonal; a revogação (por fora da função e pela função, que encerra só as
sessões daquela senha), a vencida e a encerrada; scrypt nunca abre; nenhuma chave nem valor de pessoa em resposta
nenhuma; o contador e o teto por empresa com origens forjadas; a gestão por empresa (e a borda dos 72 bytes); a lista
fechada; o pior caso de dados (um snapshot de ~258 KB em ~0,4 s). `f68_rollback.sql` — 7. Os rollbacks F62–F67C com o
`F68-desfaz.sql` na frente, todos verdes no CI.

---

# 7. O apply

## 7.1 O ensaio (`sgmvldiizsrjbxzzpmhh`, PG 17.11) — [`D-ensaio/resultado.txt`](f68-evidencias/D-ensaio/resultado.txt)

O "antes" refeito logo antes (= o das 10:50). As cinco, uma a uma (11:49–11:53), com o texto exato; depois de cada uma, o
md5 de cada `prosrc` e de cada comentário = o calculado do arquivo, as senhas e as policies intocadas. Depois: as 117 de
antes byte a byte (`7b461b5b…`), `anon` executa EXATAMENTE as duas portas, a impressão nova `0d347254…`; a prova viva
**P1 10/10** (a mais lenta 307 ms), **P2** (§5), as sabotagens **D** e **B** acusadas; nada ficou (0 empresas fictícias,
0 sessões, 0 contador, `abrir` de volta ao md5 do arquivo); a porta pelo PostgREST (token inválido → a recusa da sessão;
senha errada → `{"ok": false}`; a gestão, a projeção e as tabelas → 401/42501); as 13 checagens iguais; o conferidor 248
pontos · 88.182 linhas · **0 recusadas**.

## 7.2 Produção (`pbtjcalbmepmrqzprusb`, PG 17.6) — [`F-producao/resultado.txt`](f68-evidencias/F-producao/resultado.txt)

O "antes" refeito (= o das 09:00). As cinco, uma a uma (11:59–12:02), o mesmo texto; a mesma exatidão; **a paridade: a
impressão das 123 funções em produção = a do ensaio (`0d347254…`)**; as 5 senhas intocadas (`f53ad507…`, critério 4);
as policies intocadas (`cee318f5…`). Com o app de ANTES no ar: o smoke **110 OK · 1 aviso · 0 falha** (a recusa de
`dados` com token inventado incluída, sem escrita); o conferidor **272 pontos · 113.186 linhas · 0 recusadas · 0
reprovados**; os advisors iguais aos do ensaio; as 13 checagens **na linha travada**. Nenhum `abrir` em produção.

## 7.3 O merge, o deploy e a conferência

(preenchido no PR de documentação: o merge do PR #101 com os dois checks verdes; `/api/saude` com `1.76.0`; o smoke com o
mapa de rotas novo; a recusa de `dados` pelo app no ar; as páginas do operador iguais; a Parte B.)

---

# 8. O conferidor e o smoke

| | ensaio | produção |
|---|---|---|
| conferidor | 248 pontos · 88.182 linhas · 0 recusadas (1 "reprovado": `itens.saldo-colaborador` sem célula — o artefato do ensaio desde a F65) | 272 pontos · 113.186 linhas · 0 recusadas · 0 reprovados |
| smoke (antes do deploy) | — | 110 OK · 1 aviso (`kits_modelos`, o de sempre) · 0 falha |
| smoke (mapa novo, depois do deploy) | — | §7.3 |

---

# 9. Os advisors e a divergência 6

Segurança, igual nos dois bancos depois do apply: INFO `rls_enabled_no_policy` 6 → **8** (as duas tabelas deny-all —
declarado); WARN `anon_security_definer_function_executable` 0 → **2** (as duas portas — declarado); WARN
`authenticated_security_definer_function_executable` 39 → **42**; WARN `auth_leaked_password_protection` 1; ERROR 0.

**Os +3 de `authenticated` não estavam na linha de advisors do plano** (ele previa só o par de `anon` e os INFO): são as
três funções de gestão da decisão 8, `security definer` executáveis por `authenticated` com a guarda `e_admin_na(p_empresa)`
antes de qualquer efeito (V10 e `definer_sem_tenant.sql` provam). É o MESMO lint de antes crescendo pelo desenho — o
precedente da F67 (ata de 13/11, decisão 18: "os advisors de segurança ganharam 20, e é o desenho; nenhum lint novo") —, e
o único lint NOVO é o par de `anon`, declarado. Medido no ensaio antes de produção, registrado na ata, sem rollback.

Desempenho (ensaio): `unindexed_foreign_keys` 38 (a `unique` da `0208` passou a cobrir `senhas_acesso_empresa_id_fkey`),
`no_primary_key` 1, `unused_index` (o do ensaio, com o índice novo da tabela vazia), WARN `multiple_permissive_policies` 1.

---

# 10. As 13 checagens

| | antes (09:00) | antes do apply | depois do apply |
|---|---|---|---|
| produção | 3 / 12 / 59 / 1 · nove 0 | igual | **igual** |
| ensaio | `operador_sem_filial` 1 · doze 0 | igual | **igual** |

---

# 11. As sabotagens (A–K), com a saída real

| | o quê | onde |
|---|---|---|
| **A** | uma terceira porta: grant a `anon` numa função qualquer (4a); revoke de `anon` numa das duas (4b); grant a `authenticated` numa das duas (4b) | injetor `catalogo-security-definer-executavel-por-anon`, `f68-porta-revogada-de-anon`, `f68-porta-executavel-por-authenticated` — DETECTADAS no CI ([`C-ci`](f68-evidencias/C-ci/ci-verde.txt)) e na mesa ([`E-mutacoes`](f68-evidencias/E-mutacoes/mesa-pglite.txt)); o catálogo nasceu vermelho ([`B-travas/sql-vermelha.txt`](f68-evidencias/B-travas/sql-vermelha.txt)) |
| **B** | a senha de A no slug de B; a busca de candidatas sem a empresa | V2 (CI); no ensaio, [`P4`](f68-evidencias/D-ensaio/P4-sabotagem-B.sql): intacta → a recusa uniforme; sabotada → **23503** (a FK composta, a segunda defesa) — ACUSADA |
| **C** | `dados` sem a diagonal | `f68-dados-sem-a-diagonal` → V5, DETECTADA |
| **D** | uma recusa com outra cara; o crypt pulado sem candidata | `f68-recusa-com-outra-cara` → V3; no ensaio, [`P3`](f68-evidencias/D-ensaio/P3-sabotagem-D.sql): slug inexistente −99,3% → ACUSADA pela régua do tempo |
| **E** | uma chave de pessoa na lista branca | `f68-lista-branca-com-pessoa` → V8a; a trava TS↔SQL (`lista-branca-porta.test.ts`) |
| **F** | a sessão eterna; a senha revogada aceita | `f68-sessao-sem-vencimento` → V6b; `f68-senha-revogada-aceita` → V6a |
| **G** | o teto por empresa removido; o erro do contador ignorado | `f68-sem-teto-por-empresa` → V9b; o erro do banco RECUSA no app (`porta.test.ts`, R-ACC-95). ⚠ Do lado SQL, nenhuma trava de mesa afirma que `abrir` não tem bloco `exception` (a função não tem um; o `md5` do `prosrc` nos dois bancos = o arquivo) — **backlog F68B** |
| **H** | o service role de volta na árvore pública ou em `senhas.ts`; o client de sessão em `publico.ts` | `fronteira-viewer.test.ts` (o detector com guarda própria), `senhas.test.ts`, `superficie-admin.test.ts` — nasceram vermelhos ([`B-travas/mesa-vermelha.txt`](f68-evidencias/B-travas/mesa-vermelha.txt)) |
| **I** | scrypt abrindo | V7 (CI); fora do injetor com o motivo (sem o filtro, o formato do crypt continua não abrindo — ata, decisão 19) |
| **J** | a gestão atravessando empresas | `f68-gestao-sem-guarda-da-empresa` → V10a |
| **K** | o rollback | `f68_rollback.sql` 7/0 e os rollbacks F62–F67C com a F68 na frente (CI) |

E uma mutação AD HOC da re-revisão (fora do injetor): revogar encerrando as sessões sem os filtros de senha e empresa →
V6c ✗ (2 de 9) ([`E-mutacoes`](f68-evidencias/E-mutacoes/mesa-pglite.txt)).

---

# 12. A revisão adversarial

Dois revisores independentes (banco e app) no SHA `2b8d72d2` — nenhum achado alto; os médios e baixos corrigidos antes do
SHA congelado (o contador sem fila e o `lock_timeout`, a faxina sem espera, revogar encerra a sessão, a 4a por
assinatura, V2/V6/V8a/V9d/V10a/V12, a forma "sempre 5 crypt" travada; no app, a 404 e o erro próprios da porta, o `next`
sem travessia codificada, o log estreito, o 404 da filial alheia, as travas mais largas). Uma re-revisão no `291d4bca`:
nenhum alto nem médio; o controle negativo do V6c e a varredura de import dinâmico no fonte cru corrigidos. O detalhe e
os declarados (o "Ativa" das senhas antigas na tela, a URL sem rota em `/r/**`, o texto livre, o `CLAUDE.md` da raiz, o
preço do `lock_timeout`) estão na ata.

---

# 13. O CI

Run `44546617832` sobre o head `56df7504` (= o código congelado `fd6d93fe` + só documentação): `verificar` ✅ e
`banco-sem-docker` ✅ — `db:types:diff` VERDE (40 relações · 370 colunas · 111 funções), **67 roteiros · 1.398
asserções · 0 falhas**, o injetor **197/197** detectadas pelo cenário nomeado
([`C-ci/ci-verde.txt`](f68-evidencias/C-ci/ci-verde.txt)).

---

# 14. A contagem final

| | antes (v1.75.0) | depois (v1.76.0) |
|---|---|---|
| testes (Vitest) | 281 arquivos · 8.965 casos | **282 · 9.115** |
| roteiros do CI · asserções | 65 · 1.368 | **67 · 1.398** |
| mutações (teto) · quarentena | 188 | **197** (+9) · quarentena inalterada |
| funções de `public` · definer · executáveis por `anon` | 117 · 70 · **0** | **123 · 75 · 2** |
| as 117 de antes | `7b461b5b…` | **`7b461b5b…`** (byte a byte, nos dois bancos) |
| policies (md5) | 62 · `cee318f5…` | **62 · `cee318f5…`** |
| advisors de segurança (INFO / WARN auth / WARN anon / ERROR) | 6 / 39 / 0 / 0 | **8 / 42 / 2 / 0** (§9) |
| `senhas_acesso` em produção | 5 `scrypt` · 0 bcrypt · `f53ad507…` | **5 `scrypt` · 0 bcrypt · `f53ad507…`** (intocadas) |
| as 13 checagens (produção) | 3 / 12 / 59 / 1 · nove 0 | **igual** |
| conferidor | — | ensaio 248 · 88.182 · 0 recusadas; produção 272 · 113.186 · 0 recusadas |
| `npm run build` | — | [`G-build/npm-run-build.txt`](f68-evidencias/G-build/npm-run-build.txt) |

---

# 15. Os 26 critérios, autoverificados

1. ✅ lint, test (9.115), typecheck, build; contraste e `verificar:actions`; CI `banco-sem-docker` com roteiros, injetor e `db:types:diff`.
2. ✅ `PLAN-F68.md` (25 fatos, tabelas-verdade, lista branca, 23 decisões, ordem e rollback), anterior ao 1º commit de código (`c9a23df7`).
3. ✅ o "antes" nos dois bancos, antes de qualquer apply (e refeito logo antes de cada um).
4. ✅ `0208`+, classe validada, rollback no rodapé, `db:lock`; nenhum `update`/`delete`/backfill, policy, `cascade`, DDL dinâmica; as 5 senhas intocadas (md5 igual).
5. ✅ as duas exceções de `anon`, nos dois bancos, e só elas; o par nasceu vermelho e sabe ficar vermelho (A).
6. ✅ só bcrypt abre; scrypt nunca; > 72 bytes recusada; a repetida recusada.
7. ✅ as cinco recusas byte a byte iguais e indistinguíveis no tempo (±0,3%; §5).
8. ✅ token opaco só como hash; 24 h no banco; morre na revogação; o `senha_id` não sai.
9. ✅ a diagonal recusada por `dados` (V5, P1); a página responde 404 — a confirmar pelo smoke pós-deploy (§7.3).
10. ✅ o contador por (empresa, origem) com o teto por empresa (V9a–d); o erro recusa antes de qualquer senha.
11. ✅ nenhuma chave de pessoa (CI com fixture; ensaio por contagem de chaves); fonte única e trava TS↔SQL.
12. ✅ `senhas.ts` sem `createAdminClient`; as funções por empresa; admin de A não atravessa (V10a); a trilha com a empresa da senha.
13. ⏳ a rota pelo smoke com o mapa novo — depois do deploy (§7.3); `proxy.test.ts` verde.
14. ✅ `getViewerSession` não existe; `resolverAcessoRelatorio` sem o modo viewer; a fronteira da árvore pública.
15. ✅ `isolamento_viewer.sql` 21/0.
16. ✅ nada mudou para o operador (policies, funções fora da fase, smoke 0 falha, conferidor 0 recusadas, checagens).
17. ⚠ advisors: o declarado **+ os 3 de `authenticated`** (a divergência 6, §9); a paridade fecha (`0d347254…`).
18. ✅ `F68-desfaz.sql` ensaiado no CI; a ordem (revert primeiro) escrita; os rollbacks F62–F67C medidos com a F68.
19. ✅ o injetor na ata; 9 mutações detectadas pelo cenário nomeado; teto 188 → 197; quarentena abaixo de ⅓.
20. ✅ `database.ts` só com o da fase; `db:types:diff` verde.
21. ✅ os documentos (fichas F68/F68B, o mapa de regras (R-ACC-144–152), ADR §20, RUNBOOK Anexo F68, aninhados, ajuda, inventário, índices, ata).
22. ✅ nenhuma dependência nova; intocados workflows, `CLAUDE.md` da raiz, policies, páginas do operador, `queries/admin.ts`, as 5 senhas; nenhuma linha de base subiu.
23. ⏳ `1.76.0`, CHANGELOG e `registry.ts` ✅; a tag no merge do PR de documentação.
24. ✅ as sabotagens A–K com saída real (§11) — G com a ressalva do lado SQL.
25. ✅ nenhum dado real (a varredura de evidências: 0 ocorrência); ninguém abriu o `.env.local` (as credenciais só por `--env-file`).
26. ✅ este relatório, com o roteiro no topo, o estado de repouso e o "NÃO prova".

---

# 16. O estado de repouso — se o projeto parar aqui por dois meses

- A porta nova no ar, só com os GERADOS; o "ao vivo" pela senha mostra o aviso. Sem as senhas novas (§1.2), nenhum gestor
  entra por senha — e a tela Senhas de acesso continua mostrando as 5 antigas como "Ativa" (elas não abrem a porta; marcar
  o formato na lista exigiria ler o `hash` ou uma coluna nova — F69).
- As peças velhas de pé, sem chamador depois da janela da Skew Protection: `registrar_tentativa_senha`,
  `senha_tentativas`, o cookie `wap_view` (o proxy o apaga), `VIEW_SESSION_SECRET` no ambiente. Nada quebra por elas;
  saem na F68B.
- O contador e as sessões se limpam sozinhos (a faxina dentro de `abrir`, 50 por chamada).

---

# 17. O que este relatório NÃO prova

- **Que um gestor de verdade entra em produção com uma senha nova**: não existe senha bcrypt em produção até o Johnny
  criar (§1.2). A prova positiva é o CI, o ensaio (P1, P2) e o roteiro dele.
- **Que uma segunda empresa real entra pela porta**: não há segunda empresa nos bancos vivos; provado no CI e no ensaio
  com empresas fictícias.
- **Que nenhum nome passa pelo TEXTO LIVRE** (observações, anotações, chamado — decisão 7): a lista branca tira as CHAVES
  de pessoa, não o que alguém digitou num campo livre.
- **Que a porta aguenta uma força bruta distribuída de verdade**: o teto por empresa a limita (20 tentativas/min por
  empresa, qualquer origem) — e, por isso mesmo, quem martela a porta tranca a empresa por um minuto (declarado); a WAF é
  da F73.
- **Que três entradas simultâneas na mesma empresa no mesmo meio segundo passam**: a terceira pode ver "Não foi possível
  conferir a senha agora" (o `lock_timeout` de 500 ms — declarado na ata).
- **Que o erro do contador nunca é engolido no SQL**: a função não tem bloco `exception` (o `prosrc` = o arquivo nos dois
  bancos), mas não há trava de mesa que o afirme (backlog F68B).
- **Nada sobre os dados do #84.**

---

# 18. Pendências e backlog nomeado

- **F68B:** o ao vivo pela porta; a contração de `registrar_tentativa_senha`/`senha_tentativas`; o `ViewerAutoRefresh`;
  `VIEW_SESSION_SECRET` fora do ambiente; a trava de mesa "`abrir` sem bloco `exception`".
- **F69:** a lista das senhas por empresa (`queries/admin.ts`), com o formato (antigo/novo) visível; a plataforma na gestão
  das senhas de outra empresa.
- **F70:** a empresa ESCOLHIDA ao criar a senha; a empresa da sessão.
- **F71:** as frases do `CLAUDE.md` da raiz (o visualizador, o `scrypt`, o cookie `/relatorios/**`, o mapa sem
  `src/app/r/**`).
- **F73:** a senha só do smoke (a prova positiva da porta em produção, agendada); a WAF.
- **O diagnóstico do #84** (entrega avulsa); **o seed com duas empresas** (16/11-4).
- **Backlog (das fases anteriores, sem mudança):** o conta a conta com as memberships desativadas; os caminhos sem `.max()`
  e os pares de tetos da F66B; `movimentacoes.itens_faltantes`; o `savepoint` por linha na RPC do import; a paginação
  keyset; derrubar `profiles.papel`/`ativo`; o WARN `multiple_permissive_policies` de `pendencias_item`; a retenção dos
  backups antigos; `senha_testada` no vocabulário da trilha (F29). E, desta fase: a URL sem rota em `/r/**` cai na 404 da
  raiz; `scripts/smoke-f19.mjs` segue o 308 de `/relatorios/acesso` (passa, mas mede a porta da WAP).
