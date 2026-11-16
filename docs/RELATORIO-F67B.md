# Relatório F67B — Storage e Realtime por empresa

**v1.74.0 no ar** — caminho (a), o rollout inteiro: o ensaio voltou a autenticar na 6ª tentativa da run (as cinco
primeiras, `28P01`) e recebeu a cadeia inteira; produção recebeu a EXPANSÃO (`0194`–`0197`) antes do merge, o app novo
pelo merge do [PR #96](https://github.com/vmatusita/ti-wap-inventory-control/pull/96) (merge `d11daea`), a janela por
objetos de 33 min e a CONTRAÇÃO (`0198`–`0199`) depois dela — o conta a conta em cada etapa · SHA de código
congelado **`5d944fd`** · plano [`PLAN-F67B.md`](PLAN-F67B.md) · ata `DECISOES.md` (2026-11-16 · F67B) · evidência em
[`f67b-evidencias/`](f67b-evidencias/) · tag `v1.74.0` no merge do PR de documentação.

> A sétima fase da virada multiempresa, e a primeira que fecha superfícies que nenhuma auditoria de RLS de tabela examina:
> os dois buckets do Storage e o canal de tempo real. Até aqui, o `.docx` de um termo respondia pela empresa legada e por
> um `coalesce(…, true)` que deixava gravar o nome que nenhuma linha referenciava; o backup do import, do reset e da mesa
> — o acervo inteiro de uma filial, com nome de colaborador e patrimônio — respondia por "admin da WAP" sobre o bucket
> inteiro; e o tempo real não levava filtro nenhum. A F67B faz o `.docx` ser da **LINHA** de `termos_gerados` que o
> referencia (lê quem é membro da empresa dela, grava quem pode escrever a linha, e a linha nasce ANTES do arquivo), o
> backup ser da **EMPRESA DO CAMINHO** (`<família>/empresa-<uuid>/…`, montado por uma função única), os antigos legíveis
> só pelo admin da WAP por uma cláusula fechada, uma ferramenta nomeada para os `.docx` sem registro, e o filtro de empresa
> nas três assinaturas — com a publication sob trava de catálogo.
>
> Com uma empresa só, nada disso muda o que a WAP vê ou pode — e foi medido conta a conta: **0 divergência** nas 14
> contas de produção antes, depois de cada lote da expansão e, depois da contração, **só as três DECLARADAS** (os 3 `.docx`
> sem linha deixam de ser lidos e gravados; a escrita nos 29 backups antigos fecha — a leitura do admin da WAP fica).

---

# 1. O ROTEIRO DO JOHNNY — o que ficou com você

## 1.1 A conferência à mão (10 minutos, só leitura, nada destrutivo)

- **Um termo de responsabilidade já gerado**: abre e baixa como antes.
- **Administração › Importar**: o "Baixar backup" de um import ANTIGO funciona como antes (a cláusula legada).
- **Zona destrutiva**: o card "Arquivos de termo sem registro" aparece e mostra a contagem (3 hoje). **Não execute sem
  decidir** — a decisão de limpar os 3 é sua, e a linha de base da 8ª desce depois, com ata.
- **Relatórios e Itens**: o selo "ao vivo" continua acordando quando alguém registra uma movimentação.
- Na próxima vez que gerar um termo de verdade, ele sai igual — e a próxima vez que alguém importar, resetar ou resolver
  conflito, o backup nasce em `…/empresa-<uuid>/…` (o "Baixar backup" dele funciona igual).

## 1.2 O `git diff v1.73.0 v1.74.0 --stat` — o que deve e o que não deve aparecer

**Deve:** `supabase/migrations/0194`–`0199` e o lock; `supabase/rollback/F67B-desfaz.sql`; `supabase/tests/` (o novo
`storage_por_empresa.sql` e `f67b_rollback.sql`, os adaptados); `src/lib/storage/caminho.ts`, `src/lib/termos/persistir.ts`,
`src/lib/actions/{termos,importar,dev-destrutivo,conflitos,erros}.ts`, o Realtime (`assinatura-realtime.ts`,
`realtime-refresh.tsx`, as três páginas), o card da Zona destrutiva; `scripts/db/mutacoes.mjs`, `scripts/perf/conta-a-conta.mjs`;
os documentos e `docs/f67b-evidencias/`. **Não deve:** `.github/workflows/**`, o `CLAUDE.md` da RAIZ, nenhum
`default public.empresa_legada()`, `ViewerAutoRefresh`, `package-lock.json` (nenhuma dependência nova).

## 1.3 Lembretes

- O próximo prompt é o da **F67C** (o fim do default) — a nota F67B da ficha dela diz o que o Storage já resolveu.
- O diagnóstico do #84 continua como entrega avulsa (nada aqui mexe nos dois achados; a Parte B segue vermelha por eles).
- A limpeza dos 3 `.docx` sem linha é decisão sua (o card da Zona destrutiva; a 8ª desce de 3 para 0 com ata).

---

# 2. O que mudou, por arquivo e por quê

| arquivo | o quê | por quê |
|---|---|---|
| `0194_caminho_backup_por_empresa.sql` | `empresa_do_caminho_backup` (as quatro formas ancoradas), `caminho_backup_legado` (a lista fechada), os três `prefixo_backup_*(uuid, …)` | a empresa do caminho é a fonte da decisão; `storage.foldername` não existe no CI |
| `0195_backups_import_por_empresa_expansao.sql` | as 4 policies de `backups-import` (antiga OU nova); as 4 RPCs aceitando as duas formas | expansão: o app velho grava a antiga, o novo a nova |
| `0196_backup_orfao_duas_formas.sql` | a 12ª nas duas formas e na raiz `orfao/`; `registrar_limpeza_termos_sem_linha`; o comment de `eventos_admin.acao` | a faxina dos `.docx` sem registro com trilha; corrigida antes do apply (§4) |
| `0197_termo_pela_empresa_da_linha.sql` | `pode_escrever_termo(empresa_id, ativo_ids)`; as 3 policies de escrita de `termos_gerados` | o degenerado é do admin da empresa DELA |
| `0198_contracao_termos_pela_linha.sql` | a leitura do `.docx` pelo join; `coalesce(…, false)`; as 3 de escrita do bucket sem o piso legado | contração: quebraria o upload-antes-da-linha do app velho |
| `0199_contracao_backups_por_empresa.sql` | as 4 policies na forma final (a legada só de leitura); as RPCs só na forma nova; os prefixos antigos fora | contração: quebraria a gravação na forma antiga |
| `src/lib/storage/caminho.ts` | a função única do caminho, com a empresa obrigatória | um caminho sem empresa nasce invisível — ou, pior, legível pela cláusula legada |
| `src/lib/termos/persistir.ts` | `persistirTermo` invertido, com o rollback de cada ramo | o bucket decide pela linha |
| `src/lib/actions/importar.ts` | a empresa lida antes do backup; o service role só nos `.docx` depois da RPC | 16/11-2 |
| `src/lib/actions/dev-destrutivo.ts` + card | os caminhos pela função única; `limparTermosSemLinha` | a ferramenta nomeada |
| o Realtime | `filter: 'empresa_id=eq.<uuid>'`, a empresa por prop | redução de ruído; a segurança é a RLS de SELECT |

# 3. Os números MEDIDOS

| | antes (0193) | depois (0199) |
|---|---|---|
| funções de `public` (mesa, CI, ensaio e produção) | 114 | 117 |
| `security definer` | 69 | 70 (`registrar_limpeza_termos_sem_linha`; a 2-arg de `pode_escrever_termo` substitui a 1-arg) |
| `security definer` alcançável por `authenticated` (advisor) | 38 | 39 |
| universo de `definer_sem_tenant` (recebe id do cliente) | 26 | 27 — `k_escopo_ok` 24, exceções 3 (`pode_ler_arquivo_termo` saiu; a ferramenta de órfão entrou) |
| policies de `public` + `storage` | 62 (8 em `storage.objects`) | 62 (8) — nenhuma criada, 10 reescritas |
| mutações do injetor | 170 | 184 (12 da execução + 2 da revisão adversarial) |
| roteiros / asserções (CI) | 61 / 1.248 (CI da F67) | 63 / 1.299 |
| `db:types:diff` | 102 = 102 | 105 = 105 (CI) |
| produção — `termos` | 301 objetos, 298 linhas, 3 sem linha, 0 degenerados | os mesmos 301 / 298 / 3 (nenhum objeto se moveu); os 3 sem linha deixam de ser alcançáveis pela sessão |
| produção — `backups-import` | 29 objetos, todos na forma antiga (22 históricos, 5 JSON de reset, 2 cópias) | os mesmos 29, na forma antiga: legíveis só pelo admin da WAP (a cláusula fechada), graváveis por ninguém da sessão |

# 4. As decisões

As 18 do plano (§4 de [`PLAN-F67B.md`](PLAN-F67B.md)) e as três achadas na execução, com a ata em `DECISOES.md`:

- **19 — a idade mínima da ferramenta de órfão** (1 hora): o código anterior sobe o arquivo ANTES da linha; sem a idade, na
  janela entre a expansão e o deploy, um termo no meio da gravação seria copiado e removido. A `0196` foi corrigida no
  lugar, porque não estava em banco nenhum: conferido pela sonda de efeito em produção (0 linhas da F67B no ledger; as
  funções da 0194/0196 inexistentes) antes do `db:lock --regravar-alterada` (commits `ea8c986`, `4eb7ca7`).
- **20 — o verbo novo na trilha** (`termos_sem_linha_limpos`), no TS e no comment da coluna (reemitido na `0196`).
- **21 — o card da ferramenta** na Zona destrutiva, com a contagem da 8ª e o diálogo destrutivo de sempre.
- A frase de recusa de gravação no Storage ficou genérica para os dois buckets.

# 5. As provas

- **`supabase/tests/storage_por_empresa.sql`** (36 asserções; blocos T, D, B, E, F, O, L): duas empresas fictícias, as
  policies REAIS de `storage.objects`, os dois sentidos — o termo pela linha (T1–T8), o degenerado (D1–D4), o backup pela
  empresa do caminho e a cláusula legada só de leitura (B1–B9), as funções do caminho (E1–E3), a 12ª nas duas formas
  (F1–F3), a ferramenta de órfão (O1–O4) e a trava da legada no Storage (L1–L3). Verde na mesa e no CI.
- **`catalogo_policies.sql` §9** (9c–9e): toda tabela da publication com `empresa_id`, SELECT com o recorte e replica
  identity não-`full`.
- **Mesa:** `persistir.test.ts`, `caminho.test.ts` (o espelho SQL, a varredura de quem monta caminho por fora),
  `assinatura-realtime.test.ts`, `superficie-admin.test.ts` (o import com o service role UMA vez, depois da RPC),
  `rollback-f67b.test.ts` (a completude do rollback contra as migrations), a catraca da legada (+3), o census de
  `empresa_id`, `backup-completude`.
- **O injetor:** 14 mutações novas (12 da execução e 2 da revisão adversarial: a 9d e a 9c da publication), cada uma
  medida DETECTADA na mesa ([`E-mutacoes/`](f67b-evidencias/E-mutacoes/)) e no CI (184/184).
- **O rollback:** [`E-rollback/`](f67b-evidencias/E-rollback/) e o CI (§8).

# 6. O apply, etapa a etapa

## 6.1 O ensaio (`sgmvldiizsrjbxzzpmhh`, PG 17.11) — a cadeia inteira

[`G-apply/ensaio.md`](f67b-evidencias/G-apply/ensaio.md). Uma migration por `apply_migration`, o texto EXATO do arquivo,
e a prova de EXATIDÃO depois de cada uma (o md5 de cada corpo de função calculado do arquivo contra `md5(prosrc)`; o de
cada `comment on function` contra `obj_description` — só `(objeto, ok)` volta do banco): **todas ok**. Depois da cadeia:
117 funções (70 definer), 62 policies, as 13 checagens iguais ao "antes", o conferidor de formas sem recusa e os advisors
com só a ferramenta nova a mais (declarada).

## 6.2 Produção — a expansão, antes do merge

[`G-apply/producao.md`](f67b-evidencias/G-apply/producao.md). `0194` → `0197`, com a mesma prova de exatidão (todas ok) e
o conta a conta `f67b-depois` com **0 divergência depois de cada lote** (`producao-f67b-depois-0194.json` … `-0197.json`).
Depois da expansão: 121 funções (71 definer), 62 policies; as 13 checagens na linha travada; o conferidor de formas
(272 pontos, 112.229 linhas, **0 recusadas**); o smoke (109 OK, 1 aviso de sempre, **0 falha**); os advisors com +2 (a
ferramenta e a assinatura nova de `pode_escrever_termo`, a antiga saindo na `0198`).

## 6.3 O merge e o deploy

[`G-apply/janela.md`](f67b-evidencias/G-apply/janela.md). O PR #96 entrou com os dois jobs verdes no último push
(`58f438c`, run `43902877583`), `mergeStateStatus` CLEAN, `gh pr merge 96 --merge` normal (sem `--admin`): merge
`d11daea` às 16:06:14 UTC. A Vercel concluiu o deploy às 16:07:13 UTC; `/api/saude` = `1.74.0` · `d11daea` · banco ok.
O smoke contra o app novo: **109 OK · 1 aviso · 0 falha** (o aviso de sempre, `kits_modelos`). O CI do merge na `main`
(run `43903753881`): verde nos dois jobs.

## 6.4 A janela por objetos

T0 às 16:07:40 UTC e T1 às 16:41:19 UTC (33 min 39 s): **nenhum objeto** criado depois do deploy em `termos` nem em
`backups-import` — 0 na forma antiga, 0 `.docx` sem linha, 0 linha nova de `termos_gerados`. O Δ 0 na forma NOVA é
declarado (ninguém gerou termo, importou, resetou nem resolveu conflito na janela), e a prova de que nada no ar grava na
forma antiga é a estática: o `git grep` do Anexo no SHA no ar só cita `caminho.ts` e as duas entradas nominais de
`caminho.test.ts` (`restaurar.mjs`, `conta-a-conta.mjs`). Uma janela bastou.

## 6.5 Produção — a contração

`0198` (~16:42 UTC) e `0199` (~16:44 UTC), com o texto exato. A `0198`: 2/2 corpos e 2/2 comentários = o arquivo;
`pode_escrever_termo(uuid[])` fora; as 3 de escrita de `termos` sem o piso legado. A `0199`: 4/4 corpos = o arquivo; os 3
`prefixo_backup_*` antigos fora; a leitura com a cláusula legada fechada; as 3 de escrita só na forma nova. Depois:

| prova | resultado |
|---|---|
| catálogo | **117 funções, 70 definer, 62 policies** (= o ensaio) |
| conta a conta `f67b-contraida` | **só as três declaradas**, exatamente no esperado (42 · 81 · 348); 0 não declarada; a leitura dos 29 backups antigos pelo admin da WAP: 0 divergência |
| as 13 checagens | a linha travada (`arquivo_termo_orfao` 3, `backup_orfao` 12, `conflito_entre_filiais` 59, `detentor_em_estado_sem_dono` 1, o resto 0) |
| smoke | 109 OK · 1 aviso · **0 falha** |
| conferidor de formas | 272 pontos · 112.229 linhas · **0 recusadas · 0 reprovados** |
| advisors | segurança: definer alcançável **39** (= o ensaio), os outros iguais, ERROR 0; desempenho = o antes |
| paridade ensaio × produção | **11 classes idênticas, sem variante** ([`paridade-contracao.json`](f67b-evidencias/G-apply/paridade-contracao.json)) |
| Parte B do `saude.yml` (run `43911699512`) | VERMELHA pelos **mesmos dois** do #84 (12 e 1) da última Parte B antes do apply; deriva **0 pendente**, a mais nova no ledger é a `0199` |

Nenhuma escrita em produção além dos seis `apply_migration`; nenhum objeto de Storage tocado.

# 7. O conta a conta

O bloco (`scripts/perf/conta-a-conta.mjs`): por membership ativa, a RLS de verdade (como `authenticated`, com as claims
dela) × o ORÁCULO da regra de antes da F67B escrito no bloco — a leitura de cada objeto dos dois buckets, a escrita
(INSERT/UPDATE/DELETE) pelo predicado vivo de `pg_policy` objeto a objeto, as linhas de `termos_gerados`.
`transaction_read_only = on`; o bloco termina em `raise exception` (nada se confirma); nenhum id nem nome de objeto sai.

| alvo · fase | memberships | avaliações | divergências não declaradas | declaradas |
|---|---|---|---|---|
| ensaio · `f67b-antes` | 3 | 84 | **0** | — |
| ensaio · `f67b-depois` (0194–0197) | 3 | 84 | **0** | — |
| ensaio · `f67b-depois` SABOTADO (a I) | 3 | 84 | **2** (`leitura_termo_com_linha`) — o bloco acha divergência | — |
| ensaio · `f67b-contraida` (0198–0199) | 3 | 84 | **0** | `escrita_backup_forma_antiga` 12 = 12 |
| produção · `f67b-antes` | 14 | 26.824 | **0** | — |
| produção · `f67b-depois` após 0194, 0195, 0196, 0197 | 14 | 26.824 | **0** em cada | — |
| produção · `f67b-contraida` (0198–0199) | 14 | 26.824 | **0** | `leitura_termo_sem_linha` 42 = 42 · `escrita_termo_sem_linha` 81 = 81 · `escrita_backup_forma_antiga` 348 = 348 |

# 8. O CI

- Push `f4471f0` (run `43892474619`): `verificar` verde; `banco-sem-docker` com a cadeia inteira aplicada, 63 roteiros e
  1.299 asserções, e as DUAS reprovações esperadas — as constantes que só o CI mede (o L4 de `integridade_tenant`, e o md5
  das policies do `f67b_rollback`); o `f67_rollback` 7/0 rodando o F67B-desfaz antes ([`C-ci/`](f67b-evidencias/C-ci/)).
- Push `2e6c554` (run `43894520702`): **VERDE** — 63 roteiros, 1.299 asserções, nenhum ✗ (`storage_por_empresa` 36/0,
  `f67b_rollback` 9/0, `f67_rollback` 7/0, `integridade_tenant` 24/0); o injetor **182/182**; `db:types:diff` 105 = 105
  ([`C-ci/ci-push-2e6c554-verde.txt`](f67b-evidencias/C-ci/ci-push-2e6c554-verde.txt)).
- Push `5d944fd` (run `43896689694`, o SHA congelado, com as 2 mutações da revisão): **VERDE** — os dois jobs; 274
  arquivos e 8.775 casos; 63 roteiros, 1.299 asserções; o injetor **184/184**, "lote inteiro detectado pelo cenário
  nomeado" ([`C-ci/ci-push-5d944fd-verde.txt`](f67b-evidencias/C-ci/ci-push-5d944fd-verde.txt)).
- Push `58f438c` (run `43902877583`, a evidência do apply antes do merge): verde nos dois jobs. O merge `d11daea` na `main`
  (run `43903753881`): verde nos dois jobs.

# 9. As sabotagens, com a saída real

[`A-J-sabotagens.md`](f67b-evidencias/A-J-sabotagens.md): A (a leitura ignorando o nome — T3/T4/T5/T7/D3/L2 e o 4b de
`definer_sem_tenant`), B (o `coalesce` — T7/T8), C1 (o degenerado fechado — D1/D3), C2 (aberto a qualquer admin —
D2/D3), D1 (a leitura sem a empresa do caminho — B2/B4/B6/B8), D2 (o montador sem empresa — `caminho.test.ts`), E1 (a
cláusula sem a lista — B2/B6/L3), E2 (sem o "só leitura" — B7/B9/L1/L3), F (a 12ª sem a forma nova — F1), G1 (sem
`filter` — `assinatura-realtime.test.ts`), G2 (SELECT sem o recorte — 9d e 16a), H (o service role no descarte —
`superficie-admin.test.ts`), **I** (o conta a conta sabotado no ensaio — 2 divergências não declaradas, VERMELHO; sem a
sabotagem, 0), J (o rollback nos dois estados — §8 e [`E-rollback/`](f67b-evidencias/E-rollback/)).

# 10. A revisão adversarial

No SHA `2e6c554`, por subagentes de contexto limpo (workflow `wf_8b427e92-8d1`, 12 agentes): quatro revisores com lentes
distintas — SQL e segurança do banco; TypeScript e fluxo; "as provas provam o que dizem"; requisitos da ordem e regras do
projeto — e um cético por achado, instruído a REFUTAR (na dúvida, refutado), lendo só pelo git no SHA. **8 achados, 2
mantidos, 6 refutados.** As lentes de SQL e de TypeScript não acharam nada.

**Mantidos, e corrigidos:**

1. *(baixa)* **A 9c e a 9d da publication sem mutação no injetor** — a ordem lista "uma tabela da publication sem o
   recorte" entre as candidatas, e a ata não dizia por que ficou fora. Entraram `f67b-realtime-select-sem-recorte` (9d; cai
   junto a 16a) e `f67b-realtime-tabela-sem-select` (9c), medidas DETECTADAS na mesa e no CI; teto 182 → 184.
2. *(baixa)* **`docs/prompts/README.md` sem a linha da F67B** (o critério 20 cita os dois índices) — acrescentada.

**Refutados** (o motivo do cético, resumido): a variante do termo que perde o arquivo se o `DELETE` da linha falhar depois
(a janela inerente a banco + Storage sem transação; a ordem é a única que não cria órfão; a falha volta ao operador e é
registrada); o relatório ausente no SHA (ordem de entrega: a ordem manda escrevê-lo depois da revisão); a trava 7 de
`catalogo_policies.sql` com duas funções que não olham quem chama (as policies reais citam `empresas_de_admin`/`e_admin_na`,
e a asserção 8 congela o conjunto); o `greatest(v_univ, 1)` nas travas novas (idioma do repositório; o universo só zera
com a publication vazia, que a 9b reprova); dois rótulos de teste que prometem mais que o corpo (redação — a garantia
está na 9c e no §2–§3 de `caminho.test.ts`).

**Achado da execução, fora da revisão:** a justificativa da 9e exagerava o risco — a doc oficial diz que, com a RLS
ligada, o `old` do DELETE leva só a chave primária mesmo com replica identity FULL; a linha inteira só vazaria com FULL e a
RLS desligada. A 9e fica como defesa em profundidade, com o texto corrigido (o roteiro, a mutação e o PLAN).

**A re-revisão** do que mudou depois do SHA da primeira passada (`2e6c554..5d944fd`: as duas mutações, o teto, a linha do
índice e o texto da 9e), por um agente de contexto limpo: **nenhum problema**. O SHA de código ficou congelado em `5d944fd`.

# 11. Os 25 critérios, autoverificados

| # | critério | estado | onde |
|---|---|---|---|
| 1 | lint, test, typecheck, build; contraste e `verificar:actions`; `banco-sem-docker` verde | ✅ | local: lint 0, `tsc` 0, build exit 0, contraste e `verificar:actions` VERDE; CI `43896689694` verde nos dois jobs (§8) |
| 2 | o PLAN com os 33 fatos, as tabelas-verdade, as 18 decisões, a fronteira e a ordem de rollback, antes do código | ✅ | `9572210` precede o primeiro commit de `scripts/` (`e8c5c24`) |
| 3 | o "antes" nos dois bancos | ✅ | `f67b-evidencias/antes/{producao,ensaio}/`, `conta-a-conta/*-f67b-antes.json` |
| 4 | migrations da `0194`, classe, diff contra o corpo vivo, rollback no rodapé, lock no commit, `DA_F38`/`RECRIACOES`; contração em arquivo próprio | ✅ (a `0196` corrigida antes do apply, com a sonda de efeito — §4) | `classificar-migration.mjs` verde; `migrations-f38.test.ts` |
| 5 | `termos` pelo join; `coalesce` false; o degenerado; `pode_ler_arquivo_termo` fora das exceções | ✅ | T1–T8, D1–D4; `definer_sem_tenant.sql` (24 em `k_escopo_ok`, 3 exceções) |
| 6 | `persistirTermo` invertido, nos dois ramos e nas falhas | ✅ | `persistir.test.ts` (9 casos) |
| 7 | as quatro famílias por `caminho.ts`; as policies pela empresa do caminho; as RPCs só a forma nova; nasceram vermelhos | ✅ | B1–B9, E1–E3; `caminho.test.ts`; `B-travas/` |
| 8 | a cláusula legada fechada, só leitura, só a WAP; o "Baixar backup" antigo | ✅ na mesa, no CI (B7/B8) e no conta a conta contraído (a leitura dos antigos pelo admin da WAP: 0 divergência); a conferência à mão é sua (§1.1) | |
| 9 | a 12ª nas duas formas; `restaurar.mjs` nas duas | ✅ | F1–F3; `restaurar-guarda.test.mts` §7; a 12ª em produção = 12 depois da contração |
| 10 | o import com o service role só nos `.docx`, declarado, cabeçalho | ✅ | `superficie-admin.test.ts` (contagem 1, depois da RPC) |
| 11 | a ferramenta de órfão: só a plataforma, copia antes, trilha, a 12ª reconhece; não executada | ✅ | O1–O4, F1; o card na Zona; nenhuma chamada em banco vivo |
| 12 | o Realtime: filtro, prop, as duas travas, os comentários, a doc citada | ✅ | §5; a doc: [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) (a RLS por assinante; *"RLS policies are not applied to DELETE"*) |
| 13 | a contração em produção só depois do deploy e da janela | ✅ | §6.3–6.5 |
| 14 | nada mudou para a WAP (conta a conta depois, smoke, conferidor, 13 checagens) | ✅ — conta a conta 0 antes e depois de cada lote; contraído só com as três declaradas; smoke 0 falha; conferidor 0 recusadas; as 13 na linha travada | §6, §7 |
| 15 | o que está fora da tabela-verdade byte a byte; advisors; paridade | ✅ — exatidão de cada migration nos dois bancos; advisors 39 = o ensaio; paridade das 11 classes idêntica | §6; no CI: o L4 (64 funções intocadas) e o rollback |
| 16 | o rollback nos dois estados, ensaiado no CI; os F62–F67 com a F67B no lugar | ✅ | `f67b_rollback` 9/0, `f67_rollback` 7/0 (CI) |
| 17 | os roteiros adaptados listados, nenhuma asserção mudou para passar | ✅ | PLAN §7; a revisão (§10) |
| 18 | o injetor: ata, mutações detectadas, teto exato, quarentena < ⅓ | ✅ | 184/184 no CI (`5d944fd`); teto 170 → 184; quarentena 2 |
| 19 | `database.ts` só no que mudou; `db:types:diff` verde | ✅ | 105 = 105 |
| 20 | os documentos | ✅ | ficha, notas, MATRIZ, ADR §18, RUNBOOK, CLAUDE.md aninhados, os dois índices, ata |
| 21 | nenhuma dependência; intocados workflows, `CLAUDE.md` da raiz, defaults, `ViewerAutoRefresh`; nenhuma linha de base; nenhum objeto de Storage em banco vivo | ✅ | `git diff v1.73.0 --name-only`: nenhum desses; nenhum objeto gravado, copiado, movido ou apagado |
| 22 | versão 1.74.0; a tag | ✅ — 1.74.0 no ar; a tag `v1.74.0` no merge do PR de documentação | |
| 23 | as sabotagens A–J com saída real | ✅ | `A-J-sabotagens.md` (a I no ensaio) |
| 24 | nenhum dado real | ✅ | fixtures fictícias (`00000000-…`, "Fulano"); da produção só números e hashes |
| 25 | este relatório no padrão, com o roteiro no topo, o repouso e o "NÃO prova" | ✅ | §1, §12, §13 |

# 12. O estado de repouso — e se o projeto parar aqui por dois meses

Produção e ensaio estão na `0199` (a F67B inteira), com o app `v1.74.0` · `d11daea`, e a paridade das 11 classes é
idêntica entre os dois. Se o projeto parar aqui, nada envelhece em silêncio: os backups novos nascem na forma nova, os
antigos ficam legíveis à WAP, e o rollback (`F67B-desfaz.sql`) continua ensaiado no CI a cada push. O que fica aberto é
decisão, não dívida: os 3 `.docx` sem linha (o card da Zona destrutiva) e a retenção dos backups antigos.

# 13. O que este relatório NÃO prova

- **Que o Realtime entrega só a linha da empresa a um assinante REAL de outra empresa** — não há segunda empresa nos
  bancos vivos; provado pela doc oficial, pelo catálogo (§9 de `catalogo_policies.sql`) e pela RLS de SELECT no CI.
- **Que a ferramenta de órfão funciona em produção** — entregue, provada no CI e na mesa, NÃO executada.
- **Que um backup na forma NOVA nasce e se baixa em produção** — na janela ninguém importou, resetou nem resolveu conflito; provado no CI (B1–B9) e pelas
  policies vivas = o ensaio (a paridade). O primeiro backup real na forma nova nasce no próximo uso.
- **Que uma linha nova de outra empresa recebe a empresa certa** — o default é a WAP até a F67C.
- **Nada sobre os dados do #84.**

# 14. Pendências e backlog nomeado

- Retenção dos backups antigos e das variantes superadas de termo (decisão de produto).
- A limpeza dos 3 `.docx` sem linha de produção (decisão do Johnny, com ata e a linha de base da 8ª descendo).
- O diagnóstico do #84 (os dois achados da Parte B) segue como entrega avulsa.
