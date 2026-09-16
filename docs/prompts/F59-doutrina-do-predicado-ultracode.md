# F59 — A doutrina do predicado, escrita e travada

Ordem de serviço da fase **F59** do `PLANO-MULTIEMPRESA.md` (§5, Bloco D). Fase **de trava e de documento**: nenhuma
migration, nenhuma policy reescrita, nenhuma função criada, nenhum `empresa_id`, nenhuma tela. O que ela entrega é a
**régua** que decide a forma das policies da virada — escrita na `MATRIZ-REGRAS.md`, travada na mesa por
`policies-initplan.test.ts` e no catálogo vivo do banco do CI por `catalogo_policies.sql` — e a **medição** das formas do
predicado, no ensaio e em produção, só leitura.

A ficha cabe numa frase: *"Escreva a trava; não reescreva as policies."* O plano a põe no caminho crítico (§3): *"F59
destrava F66. A régua içada tem de estar ensaiada e travada por teste antes de alguém escrever a primeira policy com
`empresa_id` — senão nasce `e_membro(empresa_id)`."* E no §9 ela está entre as fases que **nunca** se cortam: *"a régua
que decide a forma de 54 policies"* — que hoje são 61.

---

## Estado de partida — os 21 fatos medidos no disco de hoje (16/09/2026)

> O prompt cita estes fatos **pelo número**. Foram medidos contra a árvore, o git e a produção (`/api/saude`) de hoje, não
> copiados da ficha — escrita em 04/09, antes das F48→F58 — e onde divergem dela, a divergência está marcada. As contagens
> de policy vêm de um **replay de texto** das migrations, descartável e feito fora do repositório, **não** do catálogo:
> confirmá-las contra `pg_policies` é trabalho da Frente A. O prompt manda o agente **remedir antes de aceitar**.

**Onde o projeto parou**

1. `main` em **`62c708d`** (merge do PR #49, `f58-docs-fecho`), com a tag anotada **`v1.63.0`** nesse commit e a árvore
   limpa; `package.json` em `1.63.0`; produção respondendo `/api/saude` → `versao 1.63.0`, `commit 62c708d`, `banco ok`.
   Última migration **`0140_import_desarma_fk.sql`** — 139 arquivos, `0001`→`0140`, a `0029` é gap real. A F58 fechou com
   216 arquivos e 5.856 testes no SHA congelado. **A F59 não tem migration** (o mapa do §11 a marca "Toca produção?
   não"). Versão da fase: **`1.64.0`**. PRs abertos: só os do dependabot.

**O universo que a trava vai julgar**

2. **61 policies vivas, não 54**: 53 em `public` (22 SELECT · 14 INSERT · 11 UPDATE · 6 DELETE) e 8 em `storage.objects`
   (2 de cada verbo). A diferença é medida: **+1** da `0128` (`"dev le backup f6a"`, em `_bkp_relatorios_gerados_f6a`) e
   **+6** da `0139` (3 em `unidades_apelidos`, 1 em cada uma das três tabelas `import_*`). Nas migrations: 76 `create
   policy`, 46 `alter policy`, 16 `drop policy`, e **nenhum** DDL de policy montado por `execute`/`format` (varredura de
   texto).
3. **13 policies passam dado da LINHA para função — em 7 funções, não em 1.** A ficha diz *"hoje a exceção legítima é
   `pode_escrever_filial(filial_id)`"*. Medido:
   - `pode_escrever_filial(filial_id)` — 6 policies: `ativos` "operador insere" e "operador atualiza"; `lancamentos_item`
     "operador lanca"; `movimentacoes` "operador insere"; `pendencias_item` "pendencias_item operador resolve" e
     "pendencias_item admin reabre". Na de `movimentacoes`, uma **segunda** chamada recebe uma EXPRESSÃO sobre a linha:
     `pode_escrever_filial((snapshot_anterior ->> 'filial_id')::smallint)`;
   - `estorno_item_coerente(estorna_id, filial_id, item_id)` — `lancamentos_item` "operador lanca";
   - `pode_escrever_termo(ativo_ids)` — `termos_gerados` "operador insere", "operador atualiza" e "operador apaga";
   - `termo_ancora_coerente(movimentacao_ids, ativo_ids)` — `termos_gerados` insere e atualiza;
   - `array_length(ativo_ids, 1)`, **built-in**, dentro de `coalesce(…, 0) > 0` — `termos_gerados` insere e atualiza;
   - `pode_escrever_arquivo_termo(name)` — `storage.objects` "termos insere/atualiza/apaga operador";
   - `pode_ler_arquivo_termo(name)` — `storage.objects` "termos leitura operador", **a única de SELECT**, embrulhada em
     `(select …)`.

   São ~18 ocorrências `policy × função`. As *"12 policies de escrita"* da ficha **batem**: são exatamente as 12 de
   escrita desta lista. Mas *"inclusive nas de SELECT (hoje limpas)"* só vale para as **22 de `public`** — não para
   Storage.
4. **As 62 chamadas de função SEM argumento das 61 policies estão TODAS dentro de `(select …)`** — zero soltas — e
   **nenhuma** policy tem sub-select com `FROM`, `exists` ou `in (…)`. Uma regra de embrulho e uma de sub-select nascem
   verdes.

**A doutrina já está escrita — e está contradita**

5. `supabase/migrations/0063_papeis_policies.sql:46-57` já é a doutrina: `(select f())` para função sem argumento; para
   `pode_escrever_filial(filial_id)`, **não** — *"Embrulhá-la em `(select ...)` não gera InitPlan — gera uma subconsulta
   CORRELACIONADA, avaliada por linha do mesmo jeito e com overhead a mais."*
6. **E duas fontes afirmam o contrário.** `0129_leitura_termo_e_revoke_invoker.sql:66-69`, sobre a única policy de SELECT
   do fato 3: *"O `(select …)` envolvendo a chamada é o padrão InitPlan das 0059/0065/0070: o planejador avalia uma vez
   por consulta em vez de uma vez por linha"* — é o **falso içamento**, e a migration não se edita (lock da F46).
   `docs/ADR-002-papeis-e-permissoes.md:90`: *"sempre com a função embrulhada em `(select ...)`"* — com a tabela logo
   abaixo listando `pode_escrever_filial(filial_id)` sem embrulho. Detalhe que importa para a F67:
   `pode_ler_arquivo_termo(p_nome text)` (`0129:41-49`) é `language sql stable security definer` e hoje **ignora**
   `p_nome` (o corpo é `select (select public.papel_atual()) is not null`) — o parâmetro existe para o JOIN com
   `termos_gerados` que a F67 vai escrever. O bucket tinha 88 objetos na medição da F50 (R-ACC-44).
7. **A `0107` mediu no ENSAIO, não em produção.** O cabeçalho dela: EXPLAIN ANALYZE BUFFERS do predicado COMBINADO das
   duas policies permissivas de UPDATE de `pendencias_item`, `cost=164.50 → 89.76` (−45%) ao içar `e_admin()`; o plano
   mostra o `Filter` por linha virando `InitPlan 1`. É esse o "método da 0107". A ficha manda medir *"sobre os `ativos` de
   produção"* — e a decisão 1 do Johnny mantém produção, só leitura.
8. `pode_escrever_filial(fid smallint)` (corpo vivo `0072:123-157`): `plpgsql stable security definer`; a cada chamada lê
   `papel_atual()`; `admin`/`dev` → `true`; `operador` → `exists` em `operador_filiais` com `(select auth.uid())`;
   `consulta`/desativado → `false`. Função `security definer` nunca é embutida pelo planejador — é a mesma classe de custo
   que `e_membro(empresa_id)` teria.
9. `docs/MATRIZ-REGRAS.md` (620 linhas): emendas por fase até a **F56** (não há de F57 nem de F58); a maior regra é
   **R-ACC-62** — a doutrina começa em **R-ACC-63**. Vizinhas que ela precisa encarar: R-ACC-29 (`force row level
   security` proibido), R-ACC-44 (a leitura do bucket `termos` por função nomeada) e R-ACC-57 (a trava híbrida das
   `security definer`, que já cita `estorno_item_coerente` e `termo_ancora_coerente`). ⚠ **R-ACC-51** (F52) prescreve,
   para GUARDA, `p_escopo is null or <predicado>`; a ficha manda a doutrina dizer *"parâmetro de recorte em RPC é
   obrigatório e não-anulável"*; e a ficha da F60 chama `(p_filial is null or col = p_filial)` de *"a forma que a próxima
   fase copia"*. Sem fronteira escrita, alguém cita a R-ACC-51 para justificar a forma errada. ⚠ A R-ACC-32 fala em *"15
   policies de SELECT"* com o piso; `catalogo_policies.sql` congela **19** desde a F56.

**Os documentos que ensinam o padrão lento**

10. `docs/PLANO-PRODUTO-MULTIEMPRESA.md:71` propõe `e_membro(empresa_id)` — a linha da ficha, confirmada. 187 linhas,
    versionado (o "deletado na árvore" que a ordem F45 avisou está resolvido). O cabeçalho ainda diz *"v0.1 · 14/08/2026 …
    proposta para validação"* e *"repositório novo transplantando o núcleo"* — contradito pela decisão 1 do §1.
11. `docs/SYSTEM-DESIGN-ACERVO-2026-08-31.md:191-197` tem a forma certa (✗ na `:193`, ✓ na `:196`) — as linhas da ficha,
    confirmadas. Mas `:204-205` diz *"hoje só 5 das 71 policies do sistema atual usam o padrão içado"* — falso hoje (fato
    4). E a decisão 1 do §1 do plano manda o cabeçalho de status nos **dois** documentos; a ficha da F59 só lista o
    primeiro.
12. `docs/README.md`: o *"ainda não foi decidida"* está na **linha 69**, na seção "Exploração — ainda não é compromisso"
    (`:67-71`, que lista também `PLANO-ESPELHO-SHAREPOINT.md`, `ROTEIRO-ESPELHO-ENTRA.md` e
    `prompt-produto-f0-fundacao.md`) — não em `:60-64`. A `:51` ainda diz *"F0 → F40"*.
13. `docs/ESPECIFICACAO.md`: **482** linhas (a ficha diz 478); *"filial"* aparece **120** vezes e *"filiais"* **54**, como
    palavra (a ficha diz 80 menções). O cabeçalho ainda diz *"v1.1 · 09/07/2026 … nenhum código gerado ainda"*.
    `CLAUDE.md:7-13` a põe como autoridade nº 1: *"a spec manda"*.

**A medição**

14. **Não há Postgres, `psql` nem Docker nesta mesa** (F46→F48): roteiro SQL só roda no job `banco-sem-docker`. E EXPLAIN
    não passa pelo PostgREST — **a conta do smoke não mede plano**. Os canais SQL que a história registra: (a) o **MCP da
    Supabase** (`execute_sql`) — presente na F50 e na F56, ausente na F48, na F49 e na F53 —, que **só devolve o
    resultado do último comando**; a técnica da F56 para ler de dentro de uma transação que não se confirma é um bloco
    `do $…$` terminando em `raise exception` proposital que carrega os valores (ata `2026-09-14 · F56 (integração)`);
    (b) a **Management API** (`POST /v1/projects/{ref}/database/query`, o caminho do apply da F53) com
    `SUPABASE_ACCESS_TOKEN`. Os dois executam como `postgres`, que tem `bypassrls`: **sem `set local role authenticated` e
    `request.jwt.claims`, nenhuma policy entra no plano**. Desde a F55 o token **não** está no `.env.local`: mora no
    Gerenciador de Credenciais do Windows (`Supabase CLI:supabase`), carrega *"the same privileges as your user
    account"*, e `medir-itens.mjs` só o lê do ambiente do processo (`INVENTARIO-CREDENCIAIS.md` §5).
15. Refs: produção **`pbtjcalbmepmrqzprusb`**, ensaio **`sgmvldiizsrjbxzzpmhh`**. R-ACC-62 (F55): identidade de
    ambiente por PERMISSÃO e confirmada pelo BANCO — `rotulo_de_ambiente()` responde `'desenvolvimento'` no ensaio e NULL
    em produção. Instrumentos-molde: `scripts/perf/medir-itens.mjs` (F37: Management API + EXPLAIN ANALYZE e
    mascaramento; recusa produção por desenho, porque GRAVA volume fictício), `scripts/perf/medir-guarda.mjs` (F49:
    produção só leitura com sessão real), `scripts/formas/conferir.mts` (F58: identidade do alvo antes da primeira
    leitura, falha fechada) e `scripts/perf/medir.mjs` (TTFB; `SMOKE_*` é produção e `NEXT_PUBLIC_*` é o ensaio —
    `INVENTARIO-CREDENCIAIS.md` §2). Os JSONs de medição moram em `docs/perf/` (`f58-*.json`).

**O que já existe e serve de molde**

16. `supabase/tests/catalogo_policies.sql` (F48): lê `pg_policies`, cujo `qual`/`with_check` vem **normalizado** pelo
    Postgres (por isso `ilike`, nunca igualdade de texto); arrays congelados (`k_negocio`, `k_infra`, `k_sem_select`,
    `k_piso_papel` com 19, `k_piso_cargo` com 3, `k_storage` com 8, `k_funcoes_acesso`, `k_realtime`); asserções 1a→9b
    por `pg_temp.assert_zero_de(rotulo, ruins, universo)`, de `_asserts.sql`; uma linha `FIM`; o runner falha em
    `WARNING: ✗`. `src/lib/validators/catalogos-seguranca.test.ts` (F48) é a trava de mesa dele: lê o `.sql` como TEXTO,
    tira os NOMES das exceções do próprio SQL (a primeira versão os listava à mão, e uma sabotagem da fase a derrubou) e
    tem a guarda "o casador sabe reprovar".
17. `scripts/db/corpo-vigente.mjs` (F47): `listarMigrations`, `fimDoComando` (pula `--`, comentário de bloco, `'…'`,
    `"…"` e `$tag$`) e `definicoesDeFuncao`. `src/lib/supabase/erros-do-banco-sql.test.ts` (F58): `nomesVivos` replica
    `create`/`drop`/`rename` em ordem, com o caso da `0091` (drop e create do mesmo nome no mesmo arquivo: vale a ordem do
    texto). ⚠ Lição da F53: `corpo-vigente.mjs` tira comentários antes de procurar, e pseudo-SQL num comentário virou
    definição (ata `2026-09-09 · F53 · A 0134 foi EDITADA`).
18. `scripts/db/mutacoes.mjs` + `run-mutation-tests.mjs` (F47): o catálogo de quebras, com `alter policy` contra
    `catalogo_policies.sql`, cada uma derrubada por rótulo NOMEADO — `mutacoes.test.mts` reconhece o rótulo na forma
    `assert_zero_de('<rótulo>'…)`. `ci.yml`: `verificar` (lint, Vitest em dois projetos, `tsc`, contraste, build, gate de
    actions) e `banco-sem-docker` (bootstrap, migrations por `psql`, gate de deriva, determinismo, roteiros, injetor) — os
    dois são *required checks*, e o workflow só dispara em `pull_request` e em push na `main` — push numa branch sem PR
    aberto não roda CI nenhum. Lição da F57: varredura de disco dentro do corpo do `it` estourou o tempo-limite — leia o
    disco na coleta.
19. Scripts: `npm run lint|test|build|typecheck|contraste|verificar:actions`; `db:test`, `db:test:mutations` e
    `db:types:diff` rodam no CI. Sem migration, `db:lock`, `db:types`, `db:seed` e `db:reset` não entram. Claude Code
    `2.1.222` nesta máquina.
20. Regras do `CLAUDE.md` que pesam aqui: **1** (escopo), **2** (nunca dado real), **5** (produção com autoproteção), **6**
    (documentação oficial antes de afirmar comportamento — a página de desempenho de RLS da Supabase, a da Management
    API, a do MCP) e **8** (versionamento).

**A forma-alvo da ficha**

21. **A forma-alvo, como a ficha a escreve, QUEBRA no conjunto vazio.** Medido num Postgres 17.5 descartável (PGlite,
    fora do repositório): com uma função que devolve `int[]`, `1 = any (array (select f()))` funciona com o array cheio,
    mas dá **ERRO** com o array vazio (`cannot accumulate empty arrays`) e com NULL (`cannot accumulate null arrays`) —
    `array (select …)` sobre uma coluna que já é array monta um array de uma dimensão a mais; e `1 = any ((select f()))`
    nem compila (`operator does not exist: integer = integer[]` — vira a forma de subconsulta do `any`). Com a função
    devolvendo `setof int`, `array (select f())` dá `false` no vazio, `true` no cheio, e o plano mostra `InitPlan 1`. No
    mesmo banco: `where g(col)` sai `Filter: g(col)`; `where (select g(col))` sai `Filter: (SubPlan 1)` — o falso
    içamento, por linha; e um par `(a, b) in (select a, b from …)` não correlacionado sai `Hash Semi Join`, avaliado uma
    vez, sem `InitPlan`. Consequência: `empresas_do_membro() → uuid[]` consumida por `= any (array (select …))` — a
    combinação exata da ficha — derruba com erro a leitura de todo membro sem empresa, em vez de devolver vazio.

---

## As duas decisões do Johnny (16/09/2026)

1. **A medição é em PRODUÇÃO, só leitura.** EXPLAIN ANALYZE só de SELECT, em transação que não grava, como
   `authenticated`, com as formas do predicado emuladas inline — nenhuma função criada. O script é validado no ensaio
   antes. Se o canal SQL de produção faltar ou for barrado, fica o número do ensaio e a pendência com o comando.
2. **A trava é na mesa E no catálogo do CI.** O Vitest julga as migrations e reprova DDL de policy dinâmico que não
   consegue ler; `catalogo_policies.sql` confere a mesma doutrina no `pg_policies` vivo do banco do CI, com a lista de
   exceções numa fonte só.

---

## As frentes, e por que nesta ordem

- **A — o censo.** A régua tem de descrever o banco que existe: replay × catálogo do ensaio × catálogo de produção, as
  ocorrências, o censo dos documentos e a pergunta de planejador, medida. Tudo antes de escrever regra.
- **B — a doutrina escrita.** A emenda F59 da matriz, com a forma-alvo das quatro funções de conjunto e a fronteira com a
  R-ACC-51. Vem antes das travas porque é ela que as travas citam.
- **C — a trava de mesa.** `policies-initplan.test.ts`: replay, três regras, falha fechada e a guarda do próprio teste.
- **D — o par no catálogo do CI.** As asserções em `catalogo_policies.sql`, a lista de exceções como fonte única e as
  mutações no injetor — calibradas contra o catálogo real antes do push, porque cada ciclo de CI custa cota.
- **E — a medição.** `medir-rls.mjs`: ensaio primeiro, produção sobre o SHA congelado. Pode andar enquanto o CI da D roda.
- **F — os documentos.** Os que ensinam o padrão lento, os cabeçalhos de status e de escopo, e o índice.
- **G — o fechamento, com ordem interna.** Versão → revisão adversarial → SHA congelado → rodadas finais → relatório → PR e
  merge → conferência pós-deploy → PR só de documentação → tag.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a fase F59 do `docs/PLANO-MULTIEMPRESA.md` (§5, Bloco D): escrever a régua do predicado de recorte ANTES da
primeira policy de tenant, e torná-la impossível de violar — sem reescrever policy nenhuma. Ao terminar: a doutrina está
escrita em `docs/MATRIZ-REGRAS.md` — o predicado de recorte é `col = any (array (select public.<fn>()))` sobre função
que devolve conjunto; nunca `fn(col)`, nunca o falso içamento `(select fn(col))`, nunca sub-select que olhe a linha;
função sem argumento só dentro de `(select …)` —, com a forma-alvo das quatro funções de conjunto especificada para a
F62 e a F66 não terem de inventar; a trava `src/lib/validators/policies-initplan.test.ts` reprova na mesa toda policy
fora da régua, e o par dela em `supabase/tests/catalogo_policies.sql` reprova o mesmo no catálogo VIVO do banco do CI
(decisão ii do Johnny), com as exceções numa fonte só, por ocorrência, com motivo e destino, numa catraca que só
encolhe; `scripts/perf/medir-rls.mjs` mediu as formas do predicado no ensaio e em PRODUÇÃO, só leitura (decisão i); e os
documentos que ensinam o padrão lento foram corrigidos ou apontados. Fase de trava e de documento: nenhuma migration;
nenhuma policy, função, grant ou índice alterado em banco nenhum; nenhum `empresa_id`; nenhuma tela.

# Contexto

## Leia antes de escrever qualquer coisa
- `docs/PLANO-MULTIEMPRESA.md` — §1 (decisões 1 e 6), §3 ("F59 destrava F66"), §4 (as 10 regras comuns a todas as
  fases), §5 → a ficha **F59** (a FONTE DA VERDADE do escopo: onde esta ordem e ela divergirem sem declaração, vale a
  ficha — `docs/README.md`), as fichas de **F60** (a trava de parâmetro de recorte das `rel_*`), **F62** (onde as quatro
  funções nascem), **F66** (quem escreve o predicado de tenant nas policies e se compara com a sua medição) e **F67**
  (quem reescreve as policies de Storage), e o §8, itens 8, 12 e 15.
- `docs/prompts/F59-doutrina-do-predicado-ultracode.md` — o cabeçalho com os **21 fatos medidos**. Este prompt os cita
  pelo número.
- `CLAUDE.md` e `AGENTS.md` — as regras permanentes, em especial a **1** (escopo), a **2** (nunca dado real), a **5**
  (produção com autoproteção), a **6** (documentação oficial antes de afirmar comportamento: use o Context7 para a
  página de desempenho de RLS da Supabase e para a Management API e o MCP) e a **8** (versionamento).
- `docs/MATRIZ-REGRAS.md` — a área A6 e as emendas F48→F56; em especial R-ACC-29, R-ACC-32, R-ACC-44, R-ACC-51, R-ACC-57
  e R-ACC-62.
- `docs/RUNBOOK-BANCO.md` (o banco do CI na mesa, conferir o estado do banco, o gate) e `docs/INVENTARIO-CREDENCIAIS.md`
  §2 e §5.
- Em `docs/DECISOES.md`: as atas da F48 (os catálogos; a Decisão 2, uma fonte por fato), `2026-09-09 · F53 · O apply
  foi pela Management API, e o ensaio estava VIVO`, `2026-09-14 · F56 (integração)` e `2026-09-14 · F56 (fechamento)`.
- As migrations, nos trechos: `0063:40-57`, `0072:117-160`, o cabeçalho da `0107`, `0129:41-89` e as policies da
  `0139`.
- O código-molde, nesta ordem: `supabase/tests/catalogo_policies.sql` (inteiro), `supabase/tests/_asserts.sql`,
  `src/lib/validators/catalogos-seguranca.test.ts`, `scripts/db/corpo-vigente.mjs`,
  `src/lib/supabase/erros-do-banco-sql.test.ts` (`nomesVivos`), `scripts/db/mutacoes.mjs` (o bloco da F48) e
  `mutacoes.test.mts`, `src/lib/ci-passos.test.ts` e `scripts/db/rodar-roteiros.sh`; e os instrumentos
  `scripts/perf/medir-itens.mjs`, `scripts/perf/medir-guarda.mjs`, `scripts/formas/conferir.mts` e `scripts/env-guard.ts`.

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
Vinte e um fatos, medidos em 16/09/2026 no cabeçalho desta ordem. Remeça cada um contra o disco e o banco de hoje antes de
agir; onde a sua medição contrariar o número escrito, **a sua medição ganha**, desde que ela vá para o relatório. Os que
mais importam:
- **fato 1** — `1.63.0` no ar, última migration `0140`. Esta fase não cria migration; a versão dela é `1.64.0`.
- **fato 2** — 61 policies vivas (53 + 8), não 54. As contagens do cabeçalho vêm de replay de texto, não do catálogo.
- **fato 3** — 13 policies passam dado da linha para função, em 7 funções (uma built-in), ~18 ocorrências; a única de
  SELECT é o falso içamento do bucket `termos`.
- **fato 4** — as 62 chamadas sem argumento estão todas em `(select …)`, e nenhuma policy tem sub-select com `FROM`: as
  duas regras a mais nascem verdes.
- **fatos 5 e 6** — a doutrina já está na `0063:46-57`; a `0129:66-69` e o `ADR-002:90` afirmam o contrário.
- **fato 7** — a `0107` mediu no ENSAIO; o método é EXPLAIN ANALYZE BUFFERS com a RLS valendo.
- **fato 9** — a R-ACC-51 prescreve `p_escopo is null or …` para GUARDA; sem fronteira escrita, a doutrina nasce
  contradita pela própria matriz.
- **fato 14** — `postgres` tem `bypassrls`: sem `set local role authenticated` e claims, a medição não mede policy
  nenhuma; e o `execute_sql` só devolve o último resultado.
- **fato 21** — a forma-alvo da ficha (`→ uuid[]` consumida por `= any (array (select …))`) dá ERRO com conjunto vazio
  ou nulo. A doutrina não pode copiá-la como está.

## Comandos que já existem — use, não reinvente
`npm run lint` · `npm run test` · `npx tsc --noEmit` · `npm run build` · `npm run verificar:actions` ·
`node scripts/perf/medir.mjs` · `node scripts/smoke/smoke-prod.mjs`. `npm run db:test` e `npm run db:test:mutations`
rodam no job `banco-sem-docker` do CI — nesta mesa não há Postgres. **Não rode `db:seed`, `db:reset`, `db:lock` nem
`db:types`.**

# Escopo

## Dentro — sete frentes, nesta ordem

### Frente A — o censo, antes de escrever a régua
A régua tem de descrever o banco que existe. O primeiro entregável é `docs/PLAN-F59.md` com o censo — antes do primeiro
commit que toque `src/`, `scripts/` ou `supabase/tests/`.
- **As policies vivas, por fontes que têm de concordar:** (1) o replay das migrations em ordem — `create`/`alter`/`drop
  policy`, `drop table`, `alter table … rename` —, que é o que a trava de mesa vai usar; (2) `pg_policies` do ENSAIO e
  de PRODUÇÃO, só leitura de catálogo, pelo canal SQL da Frente E; (3) `pg_policies` do banco do CI, na primeira rodada
  do par (Frente D). Por schema e verbo, e o conjunto de nomes `schema.tabela / policy`. Divergência entre replay e
  catálogo é achado: do replay (conserte) ou de paridade entre banco e migrations (registre — não corrija banco).
- **As ocorrências:** para cada policy, cada chamada de função — nome, argumentos, se o argumento carrega dado da linha
  (coluna nua, qualificada, expressão sobre coluna, dentro de `(select …)`) —, cada chamada sem argumento e se ela está
  em `(select …)`, e cada sub-select com `FROM`. Parta do fato 3; ache o que ele não viu.
- **Os documentos:** o censo do que ENSINA a forma lenta ou o falso içamento em `docs/**`, `CLAUDE.md` e `AGENTS.md` —
  `e_membro(`, "sempre embrulhada", `(select <fn>(<coluna>))` apresentado como InitPlan, número velho de policies
  içadas. Classifique cada achado: documento VIVO (corrige-se na Frente F) ou REGISTRO (migration travada, ata, relatório
  de fase, ordem de serviço antiga — não se edita; a doutrina o nomeia). Achado no `CLAUDE.md` só se aponta no relatório
  (ele está fora do escopo). Parta dos fatos 6 e 10 a 13.
- **A pergunta de planejador, medida e não suposta:** no ensaio (a versão do Postgres vai para o plano), `(select
  fn(coluna))` vira `SubPlan` avaliado por linha, e `col = any (array (select fn()))` vira `InitPlan`? Os planos
  resumidos — nomes de nó, sem dado — vão para a evidência. É a prova que sustenta a regra do falso içamento.

### Frente B — a doutrina escrita
Emenda F59 em `docs/MATRIZ-REGRAS.md`, no molde das emendas F48→F56 (tabela regra · fonte · localização · prova ·
veredito), a partir de **R-ACC-63**:
- **O predicado de recorte** é `col = any (array (select public.<fn>()))`, com a função devolvendo CONJUNTO (`setof`),
  avaliado uma vez por statement (`InitPlan`, ou `SubPlan` em hash / semi-join não correlacionado para o caso de pares).
  Proibidas, cada uma com o porquê: `fn(col)` (avaliada por linha); `(select fn(col))` (o falso içamento:
  correlacionado, por linha e com overhead — `0063:46-57` e a medição da Frente A); sub-select que olha a linha (`exists
  (select … where x = tabela.col)`, `auth.uid() in (select … where … = tabela.col)` — a "junta com a linha" que a
  documentação da Supabase manda reescrever); e função sem argumento fora de `(select …)`, inclusive `col = any
  (public.fn())` sem `array (select …)` (o caso da `0103` → `0107`).
- **A função de recorte** não recebe parâmetro que venha da linha: é sem parâmetro e devolve o CONJUNTO em que o chamador
  tem a capacidade.
- **A forma-alvo, especificada para a F62 e a F66 copiarem.** A ficha dá os nomes — `empresas_do_membro() → uuid[]`,
  `empresas_de_escrita() → uuid[]`, `empresas_de_admin() → uuid[]`, `unidades_de_escrita() → setof (empresa_id uuid,
  filial_id smallint)` —, mas o tipo `uuid[]` com `= any (array (select …))` quebra no vazio (fato 21). Escolha a
  combinação tipo × consumo (`setof uuid` com `array (select …)`, ou `uuid[]` com outra forma de consumo), PROVE no
  ensaio, emulada inline e só leitura, que ela vira `InitPlan` e que devolve vazio — sem erro e sem abrir — para
  conjunto vazio e para NULL, e declare a divergência da ficha. Você escreve a especificação inteira: `language sql
  stable security definer`, `search_path` travado na forma que `catalogo_secdef.sql` exige, `revoke … from public, anon`
  + `grant execute … to authenticated`, e como cada policy as consome içadas. Inclusive o `setof` de PARES, que não cabe
  em `col = any (array …)` de uma coluna só: escreva a forma dele e prove no ensaio que ela é avaliada UMA vez
  (`InitPlan`, `SubPlan` em hash ou semi-join) — e ela tem de passar pelas regras R1–R3 da Frente C, como caso "passa"
  da guarda. Com os corolários: nenhuma tabela da virada com `force row level security` (R-ACC-29, e o segundo motivo
  que `membros` traz); `to authenticated` em toda policy (F66); índice começando por `empresa_id` onde o predicado
  filtra. **Especificar, não criar** — nenhuma função nasce nesta fase.
- **As exceções:** o que torna LEGÍTIMA uma dependência da linha (a policy decide sobre o próprio objeto: o arquivo pelo
  `name`, o termo pelos `ativo_ids`, a coerência do estorno pelos seus três campos), a indicação da fonte única da lista
  (Frente D) e o destino de cada ocorrência — a fase que a elimina, ou "permanente", com o motivo.
- **A fronteira com a R-ACC-51 (fato 9):** recorte de LEITURA × escopo de GUARDA no-op — onde `p_escopo is null or …`
  continua válido, até quando, e por que a disjunção nunca é forma de recorte de leitura. E a regra "parâmetro de recorte
  em RPC é obrigatório e não-anulável", com a trava apontada para a F60 (`rpcs-recorte-sql.test.ts`).
- **As afirmações erradas conhecidas:** `0129:66-69` e `ADR-002:90`, citadas pelo que dizem e pelo que o plano medido
  mostra. Migration não se edita (F46); ata não se reescreve.
- Se o fato 9 se confirmar, o número da R-ACC-32 passa ao que o catálogo congela, com uma linha dizendo desde quando.

### Frente C — a trava de mesa: `src/lib/validators/policies-initplan.test.ts`
Sem banco, lendo as migrations NA COLETA (fato 18). Reuse `listarMigrations`/`fimDoComando` de `corpo-vigente.mjs` e a
técnica de replay de `nomesVivos`; se o analisador crescer, ele mora num módulo próprio e testável, como
`corpo-vigente.mjs`.
- **O universo:** as policies vivas pelo replay — `public` e `storage.objects`, todos os verbos, o `using` e o `with
  check` (policy de INSERT só tem o segundo).
- **Falha fechada:** DDL de policy montado dinamicamente (`execute`, `format(…)` com `create|alter|drop policy`) reprova
  com arquivo e linha — é o ponto cego mais provável da F66, que tende a reescrever as policies num laço —; um comando de
  policy que o replay não consiga ler reprova em vez de ser pulado; e uma auto-conferência prova que todo comando de
  policy fora de comentário, em todas as migrations, foi consumido pelo replay.
- **R1 — dado da linha em função reprova:** coluna nua, coluna qualificada, expressão sobre coluna (o
  `(snapshot_anterior ->> 'filial_id')::smallint` do fato 3) e dentro de `(select …)`. Built-in também:
  `array_length(ativo_ids, 1)` é ocorrência como qualquer outra. Construção SQL que não é função (`coalesce`, `nullif`,
  `cast`…) é tratada pelo que é, numa lista nominal. Nome desconhecido não passa por categoria.
- **R2 — função sem argumento só dentro de `(select …)`:** solta reprova; `= any (public.fn())` sem `array (select …)`
  reprova; `col = any (array (select public.fn()))`, `(select public.e_admin())` e `id = (select auth.uid())` passam.
- **R3 — sub-select que lê TABELA ou VIEW, ou que referencia a linha, reprova**, salvo exceção declarada (hoje nenhum,
  fato 4). A leitura de tabela mora dentro da função de conjunto; por isso sub-select sobre função de conjunto sem
  argumento e sem referência à linha (`array (select public.fn())`, `(a, b) in (select … from public.fn() u)`) passa.
- **As exceções vêm do `.sql`, nunca de uma cópia em TypeScript** (Decisão 2 da F48): o teste lê a lista de
  `catalogo_policies.sql` como texto, no molde de `catalogos-seguranca.test.ts`. **Por OCORRÊNCIA** (`schema.tabela /
  policy / função`), nunca por nome de função — por nome, a F66 poria `pode_escrever_filial(filial_id)` numa policy nova
  sem ninguém decidir. **Catraca nos dois sentidos:** ocorrência sem exceção reprova; exceção sem ocorrência viva reprova
  (quem conserta a policy tira a linha da lista).
- **A guarda do próprio teste**, com SQL sintético EM MEMÓRIA — nunca arquivo novo em `supabase/migrations/`. Reprovam:
  `using (public.e_membro(empresa_id))`, `using ((select public.e_membro(empresa_id)))`,
  `using (public.f((t.col ->> 'x')::smallint))`, `using (public.e_admin())`,
  `using (empresa_id = any (public.empresas_do_membro()))`, um `exists` correlacionado, um `with check` de INSERT com
  `fn(col)`, e uma migration com `execute format('alter policy %I …')`. Passam:
  `using (empresa_id = any (array (select public.empresas_do_membro())))`, a forma de pares que a Frente B escrever,
  `using ((select public.papel_atual()) is not null)`, `using (id = (select auth.uid()))` e
  `using (bucket_id = 'termos')`. Reprova também um `exists (select 1 from public.membros m where …)` sem referência à
  linha (lê tabela). Sem ela, um casador quebrado deixa tudo verde por vazio.
- A mensagem de falha nomeia `schema.tabela / policy`, o verbo, a função, o argumento e a regra, e aponta a emenda F59.

### Frente D — o par no catálogo do CI (decisão ii)
`supabase/tests/catalogo_policies.sql` ganha as asserções da doutrina sobre o catálogo VIVO — `pg_policies`, ou
`pg_policy` com a árvore da expressão, se o texto normalizado não bastar (decisão 4) —, no molde do arquivo: rótulos
novos, `pg_temp.assert_zero_de`, uma linha `FIM` só.
- **R1, R2 e R3 no catálogo**, `public` e `storage`, `qual` e `with_check`. Se alguma delas não tiver detecção confiável
  sobre o catálogo, declare por escrito qual e por quê, e ela fica só na mesa. Onde couber, o catálogo confere também que
  função consumida em `array (select …)` é `setof` (`pg_proc.proretset`) — o erro do fato 21 é de EXECUÇÃO, e nenhum
  teste de texto o pega.
- **A lista de exceções mora AQUI:** um array `k_…` por ocorrência, cada entrada com o motivo e o destino no comentário
  ao lado (e a migration de origem, se o molde de `catalogos-seguranca.test.ts` exigir), e a asserção confere os dois
  sentidos. É esta a fonte que o Vitest lê.
- **O universo concorda:** o número e os nomes das policies que o replay da mesa julga batem com o `pg_policies` do CI —
  por asserção, por conferência gravada na evidência, ou pelos dois (decisão 4). Uma trava que julga um conjunto
  diferente do banco é decorativa sem avisar.
- **O injetor:** ao menos uma mutação nova por regra que o catálogo cobre, em `scripts/db/mutacoes.mjs`, cada uma
  derrubada pelo rótulo NOMEADO — por exemplo, a policy de SELECT de `ativos` ganhando `and
  public.pode_escrever_filial(filial_id)` (R1), e uma policy de `filiais` perdendo o `(select …)` do `e_admin()` (R2).
  Sem mutação, asserção nova é documento.
- **Calibre ANTES do push:** as consultas das asserções são só leitura de catálogo — rode-as no ENSAIO e em PRODUÇÃO
  pelo canal SQL da Frente E, compare com o replay e só então empurre. O CI só roda com PR aberto (fato 18): abra o PR
  como rascunho (`gh pr create --draft`) no primeiro push que precisar dele. Cada ciclo de CI custa cota.
- `catalogos-seguranca.test.ts` passa a cobrar o array novo (existe, e toda entrada tem motivo e destino), como cobra os
  da F48.

### Frente E — a medição: `scripts/perf/medir-rls.mjs` (decisão i)
- **As formas, emuladas inline, sem criar nada:** (F0) a leitura com a RLS de hoje; (F1) por linha — `… where
  public.pode_escrever_filial(filial_id)`; (F2) falso içamento — `… where (select
  public.pode_escrever_filial(filial_id))`; (F3) içada — `… where filial_id = any (array (select f.id from
  public.filiais f where public.pode_escrever_filial(f.id)))`, que emula `unidades_de_escrita()` sem criá-la. Sobre
  `public.ativos` (a ficha) e `public.movimentacoes` (a de maior volume entre as que a leitura varre — confirme no censo).
  A projeção imita uma leitura real do app; a escolha e o porquê vão para o plano.
- **O método da `0107` (fato 7):** `explain (analyze, buffers, format json)`, com aquecimento e N ≥ 7 repetições por
  célula. Por forma × tabela × identidade × alvo: mediana e p95 do tempo de execução, tempo de planejamento, custo total
  estimado, buffers, linhas devolvidas e os NÓS que provam a doutrina (`Filter` com a função por linha, `SubPlan`,
  `InitPlan`).
- **A RLS tem de estar no plano:** `set local role authenticated` e `request.jwt.claims` da identidade da medição, e a
  prova de que valeu — o plano mostra o piso da policy de SELECT, e as linhas devolvidas batem com a contagem esperada.
  Medição sem a policy no plano não vale (fato 14).
- **Identidade escolhida DENTRO do banco, por consulta:** em produção, um perfil ATIVO de nível administrador (a conta
  do smoke, se o canal permitir resolvê-la sem expor o e-mail); no ensaio, também um perfil fictício de cargo `operador`
  com vínculo, que percorre o `exists` em `operador_filiais` que o administrador não percorre — se o seed não tiver esse
  perfil, meça só o administrador e marque o operador PENDENTE, com o motivo (nada se grava no ensaio para criá-lo).
  Nenhum id, e-mail ou nome atravessa o canal, aparece na saída ou vai para a evidência.
- **Só leitura, falha fechada:** tudo numa transação `read only` que não se confirma (ou no `do $…$` da F56, fato 14);
  o script só emite comandos de uma forma fechada que ele mesmo gera, e recusa ANTES de enviar qualquer escrita, DDL,
  `grant`, `copy` ou `call`. Se a documentação vigente da Management API ou do MCP oferecer modo só leitura, use-o também
  — desde que a troca de papel para `authenticated` continue possível (confira; não suponha).
- **Alvo declarado e provado:** `--alvo ensaio|producao` obrigatório; o ref do canal tem de ser exatamente o daquele
  alvo (fato 15), e o banco confirma (`rotulo_de_ambiente()`: `'desenvolvimento'` no ensaio, NULL em produção) antes da
  primeira medição. Qualquer outro caso recusa.
- **O canal, nesta ordem:** (1) o MCP da Supabase conectado nesta sessão (`execute_sql`) — o script gera os comandos e
  analisa as saídas que você gravar FORA do repositório; (2) a Management API, se `SUPABASE_ACCESS_TOKEN` JÁ estiver no
  ambiente do processo. **Nunca leia o Gerenciador de Credenciais do Windows, nunca peça o token, nunca o imprima, nunca
  o grave em arquivo.** A evidência declara o canal usado.
- **Ordem:** ensaio primeiro — calibra, roda a sabotagem G, mede com as duas identidades —; produção depois, uma rodada,
  sobre o SHA de código congelado (Frente G).
- **Saída:** `docs/perf/f59-rls-ensaio.json` e `docs/perf/f59-rls-producao.json`, e a tabela resumida no plano, na ata e
  no relatório. Só números, nomes de nó, nomes de tabela e rótulos de forma.
- **O registro para a F66:** `node scripts/perf/medir.mjs` contra produção antes do merge, com a `1.63.0` no ar, no
  método da F58 → `docs/perf/f59-producao-ttfb.json`. A ficha da F66 compara TTFB e custo com "a linha de base da F59",
  mas a F60 muda o caminho quente e a F62 muda o que `papel_atual()` lê: escreva, no plano, na ata e no backlog, que a
  linha de base da F66 é o INSTRUMENTO, re-rodado por ela imediatamente antes de mexer nas policies — os números desta
  fase são a prova da doutrina e o ponto de partida, não o gabarito.

### Frente F — os documentos
- `docs/PLANO-PRODUTO-MULTIEMPRESA.md:71`: troque `e_membro(empresa_id)` COPIANDO a forma de
  `docs/SYSTEM-DESIGN-ACERVO-2026-08-31.md:191-197` — cópia, não paráfrase: é assim que duas versões divergem.
- **Cabeçalho de status nos DOIS documentos** (§1, decisão 1; a ficha só lista o primeiro): a decisão de 09/2026 é
  migração in-place e aditiva sobre ESTE repositório; as seções de schema valem como catálogo de requisitos, não como
  plano de execução; a doutrina vigente do predicado é a emenda F59 da `MATRIZ-REGRAS.md`. No SYSTEM-DESIGN, a frase das
  "5 das 71" (`:204-205`) ganha nota com a data e o número medido hoje — a fotografia não se apaga.
- `docs/ESPECIFICACAO.md`: o cabeçalho de escopo com o texto da ficha — *"esta spec descreve o sistema mono-empresa; as
  fases F62+ acrescentam a camada de empresa, e para essa camada a autoridade é o `PLANO-MULTIEMPRESA.md` até a spec ser
  emendada na F71"*. Só o cabeçalho; a spec não se reescreve aqui.
- `docs/README.md`: a seção "Exploração — ainda não é compromisso" (`:67-71`) deixa de dizer que a direção multiempresa
  não foi decidida, e os dois documentos vão para onde a decisão os põe (catálogo de requisitos); os do espelho do
  SharePoint continuam exploração. O índice ganha a doutrina, a trava, o par do catálogo e o `medir-rls.mjs`; a `:51`
  deixa de dizer "F0 → F40".
- `docs/ADR-002-papeis-e-permissoes.md:90`: uma nota de emenda curta apontando a doutrina ("sempre embrulhada" vale para
  função sem argumento). O ADR não se reescreve.
- `docs/ARQUITETURA.md` (§9 e §10) e `docs/RUNBOOK-BANCO.md` (a seção dos roteiros): uma linha cada — policy nova passa
  pela doutrina, e é em `catalogo_policies.sql` que se declara exceção.
- Achado do censo da Frente A fora desta lista: documento vivo → corrija com uma linha; registro → cite na emenda e no
  relatório.

### Frente G — o fechamento, nesta ordem
1. `1.64.0` no `package.json`; entrada no `CHANGELOG.md`; entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6
   mudanças em LINGUAGEM DE OPERADOR (há teste que recusa termo de desenvolvedor). A fase é invisível: diga o efeito
   honesto — nenhuma tela mudou; as regras que decidem quem vê e quem muda cada registro passaram a ter um formato
   conferido automaticamente, o que continua rápido quando o sistema atender mais de uma empresa. Nunca "nada mudou".
2. A revisão adversarial de "Como trabalhar", e as correções que ela pedir.
3. **O SHA de código congelado:** o último commit que toca `src/**`, `scripts/**` ou `supabase/tests/**`, gravado no
   `PLAN-F59.md` e na evidência. Depois dele, só `docs/**` e `CHANGELOG.md`.
4. As rodadas sobre esse SHA: a medição de produção (Frente E), o `medir.mjs` de produção, e o CI do PR verde — com o par
   do catálogo verde e as mutações novas acusadas.
5. Ata em `docs/DECISOES.md` e `docs/RELATORIO-F59.md`.
6. O PR — aberto como rascunho desde o primeiro push que precisou de CI — sai do rascunho; merge só com `verificar` e
   `banco-sem-docker` verdes.
7. Deploy automático da Vercel e a **conferência pós-deploy, só leitura, ANTES de qualquer outro PR**: `/api/saude` com
   `1.64.0` e o commit desse merge; `node scripts/smoke/smoke-prod.mjs` com 0 falha.
8. Um PR SÓ de documentação com a evidência pós-deploy e o fecho do relatório (precedente: F56 e F58). A tag anotada
   `v1.64.0` vai no merge dele, o commit final da fase, e é publicada.

## Fora — não toque
Nenhuma migration, nem corretiva — inclusive o falso içamento de "termos leitura operador", que fica como exceção com
destino na F67, a fase que reescreve as policies de Storage. Nenhuma policy, função, grant, índice ou flag de RLS
alterado em banco nenhum, e nenhuma escrita nem DDL em banco de verdade, produção ou ensaio — a única gravação tolerada é
a sessão que o login grava no Supabase Auth, a mesma do smoke. As quatro funções de conjunto (só especificadas).
`empresa_id`. O `to authenticated` nas policies (F66). A trava de parâmetro de recorte das RPCs (F60). Views,
`security_invoker`, RPCs. `src/lib/types/database.ts`, o gerador e `supabase/migrations.lock.json`. `src/app/**` e
`src/components/**`. `CLAUDE.md`. O workflow do CI e a proteção da `main` — asserção nova num roteiro existente e mutação
nova no injetor NÃO são gate novo. Dependência nova. `.env*` e `scratchpad/`. Os PRs do dependabot. O Gerenciador de
Credenciais do Windows.

# Critérios de aceitação
1. `npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos; `npm run verificar:actions` verde.
2. `docs/PLAN-F59.md` tem o censo (replay × catálogo do ensaio × catálogo de produção — ou a falta de canal SQL
   declarada —; o do CI depois), as ocorrências, o censo dos documentos e a resposta medida da pergunta de planejador (ou
   PENDENTE, sem canal) — e é anterior ao primeiro commit que toca `src/`, `scripts/` ou `supabase/tests/`.
3. `src/lib/validators/policies-initplan.test.ts` existe, lê as migrations na coleta e fica verde contra as policies
   vivas (61, ou o número medido e explicado).
4. R1 reprova dado da linha em função — coluna nua, qualificada, expressão sobre coluna e dentro de `(select …)` —, em
   `public` e `storage.objects`, em todo verbo, no `using` e no `with check`, built-in incluída.
5. R2 reprova função sem argumento fora de `(select …)` e `= any (fn())` sem `array (select …)`; a forma-alvo passa.
6. R3 reprova sub-select que lê tabela ou view, ou que referencia a linha, fora da lista; sub-select sobre função de
   conjunto sem argumento passa.
7. DDL de policy dinâmico e comando de policy ilegível reprovam, e a auto-conferência prova que o replay consumiu todo
   comando de policy das migrations.
8. A lista de exceções é por ocorrência, mora só em `catalogo_policies.sql`, tem motivo e destino em toda entrada, e é
   conferida nos dois sentidos pela mesa e pelo catálogo — este, na medida das regras que ele cobre (critério 10).
9. A guarda do próprio teste cobre os casos sintéticos da Frente C, os que reprovam e os que passam.
10. `catalogo_policies.sql` tem as asserções da doutrina sobre o catálogo vivo, com rótulos novos e uma linha `FIM`, e
    fica verde no `banco-sem-docker` — com as regras deixadas só na mesa, se houver, declaradas com o motivo; ou, com o CI
    indisponível (cota, fora do ar), PENDENTE, com o bloqueio no topo do relatório e o PR aberto.
11. O universo da mesa é igual ao do catálogo do CI, em número e nomes, com a prova gravada — ou PENDENTE com o CI
    indisponível.
12. O injetor tem ao menos uma mutação nova por regra coberta no catálogo, cada uma derrubada pelo rótulo nomeado no run
    do CI — ou PENDENTE com o CI indisponível —; `mutacoes.test.mts` verde.
13. `catalogos-seguranca.test.ts` cobra o array novo.
14. A emenda F59 da `docs/MATRIZ-REGRAS.md` (R-ACC-63 em diante) tem: o predicado e as formas proibidas; a função de
    recorte; a forma-alvo das quatro funções de conjunto — com a combinação tipo × consumo que não quebra no vazio nem no
    NULL (fato 21) e a forma de pares, as duas provadas no ensaio (ou marcadas NÃO PROVADAS, sem canal) —; as
    exceções apontando a fonte única e o destino; a fronteira com a R-ACC-51; as afirmações erradas conhecidas; e a
    prova de cada regra.
15. `scripts/perf/medir-rls.mjs` existe, com alvo declarado e confirmado pelo banco, só leitura com falha fechada, RLS
    provada no plano (ou PENDENTE, sem canal) e identidade escolhida sem expor id — e a sabotagem G prova as recusas.
16. `docs/perf/f59-rls-ensaio.json`: F0–F3 × `ativos` e `movimentacoes`, as duas identidades, N ≥ 7, mediana, p95,
    custo, buffers e os nós do plano — ou a medição marcada PENDENTE, sem canal SQL.
17. `docs/perf/f59-rls-producao.json` sobre o SHA congelado, no mesmo método — ou a medição marcada PENDENTE, com o canal
    que faltou ou barrou e o comando exato no topo do relatório.
18. `docs/perf/f59-producao-ttfb.json` registrado antes do merge, e a nota da linha de base da F66 escrita no plano, na
    ata e no backlog.
19. `PLANO-PRODUTO-MULTIEMPRESA.md:71` corrigido por cópia de `SYSTEM-DESIGN-ACERVO-2026-08-31.md:191-197`; cabeçalho
    de status nos dois documentos; a nota nas "5 das 71".
20. `ESPECIFICACAO.md` com o cabeçalho de escopo da ficha, e nada mais mudado nela.
21. `docs/README.md` sem "ainda não foi decidida" para o multiempresa, com o índice novo e a `:51` atualizada;
    `ADR-002:90` com a nota; `ARQUITETURA.md` e `RUNBOOK-BANCO.md` com a linha da doutrina.
22. Nenhum arquivo em `supabase/migrations/` criado ou tocado; `supabase/migrations.lock.json`,
    `src/lib/types/database.ts`, `src/app/**`, `src/components/**` e `CLAUDE.md` intactos.
23. Nenhuma escrita e nenhum DDL em banco de verdade; o gate de deriva de tipos com os mesmos números da F58 (ou PENDENTE
    com o CI indisponível).
24. `package.json` em `1.64.0`, `CHANGELOG.md` e `registry.ts` com entrada; tag anotada `v1.64.0` publicada no merge do
    PR de documentação — ou nenhuma tag, se um PR ficou aberto ou se o push da tag foi barrado (com o comando no topo do
    relatório).
25. `docs/DECISOES.md` tem a ata da fase, datada, com as oito decisões, as divergências e o motivo de cada escolha.
26. `docs/RELATORIO-F59.md` existe, no padrão F45→F58, com o roteiro do Johnny no topo.
27. Os dois PRs mergeados com `verificar` e `banco-sem-docker` verdes, e a conferência pós-deploy feita — ou o bloqueio
    no topo do relatório.
28. Nenhum dado real (id, e-mail, nome, patrimônio, slug de linha, valor de credencial) em teste, evidência, log ou saída
    de script; o token nunca impresso nem gravado.
29. O relatório declara o estado de repouso: o que acontece se o projeto parar aqui por dois meses.

# Verificação — rode de verdade
A cada incremento: `npm run lint`, `npm run test`, `npx tsc --noEmit`; `npm run build` antes de cada push. Leia a falha,
corrija a **causa raiz** e repita até passar. **Não alargue a lista de exceções para caber um caso que devia reprovar,
não troque detecção por `skip`, não afrouxe o casador até o sintético passar, e não mude teste existente sem conferir
que o que ele prova continua o mesmo.** Falha persistindo depois de ~3 ciclos: mude de abordagem e registre a troca.

**O CENSO VEM ANTES DA RÉGUA.** A emenda e as travas descrevem o que a Frente A mediu; regra escrita antes do censo é
régua de palpite — e uma exceção esquecida vira, no primeiro push, uma trava vermelha que alguém "conserta" alargando a
lista.

Provas obrigatórias, cada uma com a saída real em `docs/f59-evidencias/`:
- **Sabotagem A — a forma que a F66 não pode escrever:** uma migration SINTÉTICA em memória, com uma policy nova em
  `public.ativos` usando `public.e_membro(empresa_id)`, passada pelo replay → vermelho nomeando policy, função,
  argumento e regra; a mesma policy com `empresa_id = any (array (select public.empresas_do_membro()))` → verde. É a
  prova central da fase.
- **Sabotagem B — os disfarces da linha:** `(select fn(col))`, `fn((col ->> 'x')::smallint)`, `fn(t.col)` e um `with
  check` de INSERT → vermelho em cada um.
- **Sabotagem C — o embrulho e o sub-select:** `using (public.e_admin())`, `col = any (public.fn())` e um `exists`
  correlacionado → vermelho.
- **Sabotagem D — a catraca:** tirar do array do `.sql` a ocorrência `public.ativos / operador atualiza /
  pode_escrever_filial` → a mesa fica vermelha nomeando-a; acrescentar exceção para ocorrência que não existe → vermelha
  pelo outro sentido. Restaure.
- **Sabotagem E — o ponto cego da F66:** migration sintética com `execute format('alter policy %I on %I.%I using (…)',
  …)` → vermelho por falha fechada, com arquivo e linha.
- **Sabotagem F — o par no CI:** as mutações novas no run do `banco-sem-docker`, cada uma derrubada pelo rótulo nomeado
  — o link do run e o trecho do log.
- **Sabotagem G — a guarda do `medir-rls.mjs`:** `--alvo` ausente ou inventado → recusa; ref do canal diferente do alvo
  → recusa; um `update` injetado na fila de comandos → recusado ANTES de sair do processo. Sem alvo real, ou no ensaio;
  sabotagem não roda contra produção.
- **Sabotagem H — o plano mostra a doutrina:** F1 com o `Filter` por linha, F2 com `SubPlan`, F3 com `InitPlan`, no
  ensaio e em produção, com os números — ou PENDENTE, sem canal.
- **O censo:** replay × catálogo do ensaio × de produção × do CI, lado a lado, e uma varredura dos arquivos de evidência
  por padrão de UUID, e-mail e patrimônio, com zero ocorrência.
- **A contagem final:** policies, ocorrências e exceções no começo × no fim (nenhuma policy mudou: os números têm de ser
  os mesmos); `npm run test` com o total de testes antes × depois; `npm run build` colado por inteiro.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em
nenhuma hipótese. Régua, nesta ordem: (1) uma medição sua contra o disco ou o banco de hoje; (2) as duas decisões do
Johnny abaixo, que estendem a ficha; (3) a ficha da F59 no §5 do plano; (4) este prompt, no que ele detalha — e onde ele
diverge da ficha, a divergência está declarada aqui e vai para o relatório; (5) as convenções do repositório
(`CLAUDE.md`, `AGENTS.md`, código existente); (6) a opção mais simples e reversível. Decisão não-óbvia vai para
`docs/DECISOES.md` com data, contexto, escolha e motivo.

**As duas decisões do Johnny (16/09/2026), que a ficha não tinha:**
i. **A medição é em PRODUÇÃO, só leitura** — EXPLAIN ANALYZE só de SELECT, em transação que não grava, como
   `authenticated`, com as formas emuladas inline; o script é validado no ensaio antes.
ii. **A trava é na mesa E no catálogo do CI**, com a lista de exceções numa fonte só.

**As oito decisões que esta fase precisa tomar por escrito:**
1. **O analisador** — o que conta como dado da linha, o universo de funções (do projeto, `auth`, `storage`, built-in),
   as construções que não são função, e o que falha fechado.
2. **As exceções** — a granularidade, a fonte única, o formato do motivo e do destino, e a catraca.
3. **As regras do embrulho e do sub-select** — as formas exatas que reprovam e as que passam.
4. **O par no catálogo** — `pg_policies` ou `pg_policy`, a detecção de cada regra, os rótulos, as mutações, e como se
   prova que o universo da mesa é o do catálogo.
5. **A forma-alvo** — as quatro funções de conjunto especificadas por inteiro, e a forma içada do `setof` de pares.
6. **A medição** — o canal, a identidade, as formas, a projeção, as tabelas, as repetições, a estatística, a saída e as
   guardas.
7. **Os documentos** — o censo do que ensina a forma lenta, o que se corrige e o que só se aponta, e o texto dos
   cabeçalhos.
8. **A linha de base da F66** — o que a F66 herda desta fase, o que ela precisa re-medir, e por quê.

Falha persistindo depois de ~3 tentativas: **mude de abordagem** e registre. Bloqueio real — cota de Actions esgotada,
CI fora do ar, ensaio pausado: contorne se for seguro; senão, **entregue o resto e registre a pendência com o que falta
para resolvê-la**.

**Se NÃO houver canal SQL** (nem MCP da Supabase nesta sessão, nem `SUPABASE_ACCESS_TOKEN` no ambiente), se o
classificador de segurança barrar a leitura SQL, ou se o ensaio estiver pausado: não repita, não reformule e não
procure outro caminho até o token; entregue a doutrina, as duas travas e os documentos; a calibração do catálogo fica
para o CI; ficam PENDENTES, com o que faltou e o comando exato no topo do relatório para o Johnny rodar, o que dependia
do canal — a conferência contra `pg_policies` do ensaio e de produção, a pergunta de planejador, a prova da forma içada
do `setof` de pares, a sabotagem H e a medição (só a de produção, se o ensaio foi alcançável; senão, as duas). A
doutrina se apoia, então, na `0063:46-57` e na documentação oficial, e diz isso. **O merge acontece mesmo assim:** a
fase não muda nada em produção, e a medição é prova e ponto de partida, não gate de segurança. **Recusa do
classificador em qualquer outra ação** (merge, push de tag) segue a mesma regra: registre, não repita, siga no que não
depende dela.

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que esteja no relatório — foi
assim que a F46, a F53, a F55, a F57 e a F58 acertaram o próprio escopo. **Aqui já há dez divergências medidas de
saída**, e elas vão no relatório: a forma-alvo da ficha (`uuid[]` consumida por `= any (array (select …))`) dá erro no
conjunto vazio e no NULL; são 61 policies vivas, não 54; são 13 policies e 7 funções que dependem da linha (~18
ocorrências), não uma exceção só — e as "12 de escrita" batem; as de SELECT não estão todas limpas, porque o bucket
`termos` tem o falso içamento que a `0129:66-69` chama de InitPlan; a `0107` mediu no ensaio, não em produção; o "ainda
não foi decidida" do `README.md` está na linha 69, não em 60-64; a `ESPECIFICACAO.md` tem 482 linhas e ~174 menções a
"filial/filiais", não 478 e 80; o cabeçalho de status vale para dois documentos (§1), não um (ficha), e o SYSTEM-DESIGN
carrega um número velho; a doutrina da ficha colide com a R-ACC-51 se não houver fronteira escrita; e a "linha de base da
F59" que a F66 cita envelhece com a F60 e a F62. Declare também o que este prompt acrescenta: as regras R2 e R3, o par no
catálogo e as mutações (decisão ii), o canal SQL de produção (decisão i), o registro de TTFB, a nota no ADR-002 e a linha
51 do README.

# Git e segurança
Branch `f59-doutrina-do-predicado`, commits pequenos e frequentes, mensagens em pt-BR no padrão conventional
(`docs(f59): …`, `test(f59): …`, `feat(f59): …`, `perf(f59): …`, `chore(f59): …`). Commite também esta ordem
(`docs/prompts/F59-doutrina-do-predicado-ultracode.md`) num commit de documentação; o `PLAN-F59.md` com o censo vem
antes do primeiro commit que toca `src/`, `scripts/` ou `supabase/tests/`. Agrupe os pushes — cada um custa CI numa cota
apertada. PR com `gh pr create`, como rascunho desde o primeiro push que precisar de CI (fato 18); merge só com
`verificar` e `banco-sem-docker` verdes. Depois do merge, a evidência pós-deploy entra por um PR só de documentação, e
correção de código, por PR novo. **Nunca:** push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`,
amend de commit que não é seu, commitar `.env*` ou `scratchpad/`, copiar o `.env.local` para outro diretório, criar ou
editar migration, mexer na proteção da `main`, escrever ou rodar DDL em banco de verdade, ler o Gerenciador de
Credenciais do Windows, imprimir ou gravar token, ou mexer nos PRs do dependabot.

# Como trabalhar
Explore com subagentes paralelos, e **cada um volta só com resumo e NÚMEROS MEDIDOS** (nunca com dado real):
(a) **as policies** — o replay, as ocorrências, as chamadas sem argumento e a conferência contra `pg_policies` do ensaio e
de produção, só leitura; (b) **os documentos** — o censo do que ensina a forma lenta ou o falso içamento, com
arquivo:linha e a classe vivo/registro; (c) **os moldes** — `catalogo_policies.sql`, `catalogos-seguranca.test.ts`,
`corpo-vigente.mjs`, `nomesVivos`, `mutacoes.mjs` e `mutacoes.test.mts`, `ci-passos.test.ts` e `rodar-roteiros.sh`: o que
um array novo, uma asserção nova e uma mutação nova precisam satisfazer em cada um; (d) **a medição** — `medir-itens.mjs`,
`medir-guarda.mjs`, `conferir.mts`, `env-guard.ts`, a documentação vigente pelo Context7 (a página de desempenho de RLS da
Supabase; o `database/query` da Management API; o `execute_sql` e o modo só leitura do MCP) e a pergunta de planejador
no ensaio; (e) **as colisões** — a R-ACC-51 contra a doutrina, e a lista da R-ACC-57 contra a lista nova de exceções:
fatos diferentes podem ter listas diferentes; o MESMO fato, não (Decisão 2 da F48).

Escreva `docs/PLAN-F59.md` antes de implementar, com: o censo e as ocorrências (só números e nomes de schema); o censo dos
documentos; a resposta da pergunta de planejador; as três regras, com as formas que reprovam e as que passam; o desenho
das duas travas e da lista única; o desenho da medição; as oito decisões já tomadas; e a ordem de reversão (`git revert`
dos commits da fase, de trás para frente, + redeploy — não há banco para desfazer). **A edição é sequencial:** a trava de
mesa, o catálogo e o injetor dependem da MESMA lista, e edição paralela neles colide. Paralelize exploração, medição e
revisão — não edição.

Antes de congelar o SHA (Frente G, passo 3), **revisão adversarial por subagentes em contexto fresco**, contra o
`PLAN-F59.md` e os 29 critérios, com estas perguntas: alguma policy viva que a mesa não julga — por sintaxe que o replay
não lê, por DDL dinâmico, por `rename`? a mesa e o catálogo julgam o mesmo universo? alguma forma de dependência da
linha passa verde — expressão, coluna qualificada, `(select fn(col))`, `with check` só de INSERT, policy de Storage?
alguma exceção por nome de função em vez de ocorrência? alguma exceção sem motivo, sem destino ou sem ocorrência viva? a
lista existe em dois lugares? a guarda do teste reprovaria de verdade com o casador quebrado? cada asserção nova do
catálogo tem mutação que a derruba pelo rótulo? a forma-alvo devolve vazio, sem erro, para quem não tem empresa (fato
21)? a emenda contradiz a R-ACC-51, a R-ACC-29 ou a R-ACC-57 sem dizer? a forma içada do `setof` de pares foi provada ou
só escrita? a medição tem a policy no plano? alguma evidência tem id, e-mail, nome ou valor? o script recusa escrita
antes de enviar? o alvo é conferido pelo banco antes da primeira medição? algum documento vivo ainda ensina
`e_membro(empresa_id)` ou "sempre embrulhada"? algum arquivo fora do escopo foi tocado? Cada achado passa por um cético
instruído a refutá-lo. **Aponte apenas lacunas de correção ou de requisito declarado — não preferências de estilo.**
Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F59.md`, em pt-BR, no padrão dos relatórios F45→F58, **com o roteiro do Johnny no TOPO** — o que ficou
com ele, passo a passo, e por quê. No mínimo: se alguma medição ficou pendente, o comando exato vem PRIMEIRO; depois do
deploy, conferir `/api/saude` com `1.64.0` (nenhuma tela muda); ler a emenda F59 da matriz e a lista de exceções do
`catalogo_policies.sql`, ocorrência por ocorrência, com o destino de cada uma — é o que a F62, a F66 e a F67 herdam, e se
alguma parecer errada é agora que custa barato; rodar `npm run test` uma vez.
Depois: o que mudou por arquivo e por quê; **os números MEDIDOS** lado a lado com a ficha, e **cada divergência
explicada** — a começar pelas dez já conhecidas; o censo (replay × ensaio × produção × CI); as **oito decisões** com o
custo que decidiu cada uma; as **oito sabotagens** com saída real; a medição, por forma × tabela × identidade × alvo, com
o canal e o método; o registro de TTFB; a conferência pós-deploy (no PR de documentação); os 29 critérios
autoverificados; o estado de repouso; e a seção **"o que este relatório NÃO prova"** — no mínimo: que a trava julga a
FORMA do predicado, não o que ele autoriza (um predicado içado com o conjunto errado passa); que a mesa é sintática e a
autoridade é o catálogo; que o catálogo do CI é construído das migrations, então policy criada só em produção, por fora
delas, só aparece na conferência contra produção desta fase — não em CI nenhum; e que a medição é das formas EMULADAS no
volume de hoje, não de `empresas_do_membro()`, que não existe, e que a F60 e a F62 mudam o que ela mede.
Pendências e **backlog nomeado**: para a **F60** (a trava de parâmetro de recorte e a fronteira com a R-ACC-51); para a
**F62** (a forma-alvo das quatro funções, pronta para copiar — com o tipo de retorno que a ficha dela herdou errado);
para a **F66** (re-rodar o `medir-rls.mjs` imediatamente antes; a lista de exceções que encolhe quando as policies de
escrita passarem a `unidades_de_escrita()`; o TTFB re-medido); para a **F67** (o falso içamento de "termos leitura
operador", e as funções de Storage que dependem do `name` por propósito); e a pendência de girar o token
(`INVENTARIO-CREDENCIAIS.md` §5), se o canal usado foi a Management API. **Evidências, não afirmações:** saída real e
completa dos comandos. Termine a resposta final com um resumo de 5 linhas em pt-BR.

# Idioma
Narrativa, plano, ata, relatório e comentários em **pt-BR**. Identificadores de domínio em português sem acento; os nomes
de arquivo que a ficha fixa (`policies-initplan.test.ts`, `medir-rls.mjs`) ficam como estão. Commits em pt-BR no padrão
conventional. As mudanças do `registry.ts` em LINGUAGEM DE OPERADOR — há teste que recusa termo de desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~15 minutos)

Esta fase não aplica nada em banco, mas **lê** produção por SQL — o catálogo das policies e o EXPLAIN do `medir-rls.mjs`,
pela sua decisão 1 —, além do `medir.mjs` antes do merge e do smoke depois do deploy. O pré-voo existe para essas leituras
não travarem no meio da run.

Este arquivo já está salvo em `docs/prompts/F59-doutrina-do-predicado-ultracode.md`, **sem commit** — o agente o commita
na branch da fase. O prompt cita os 21 fatos do cabeçalho pelo número, então ele precisa estar lá quando você colar o
bloco. Arquivo não rastreado sobrevive ao `git checkout main` abaixo.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit

# 2. Onde a F58 parou: 1.63.0, tag v1.63.0 no merge do PR #49; fora do git, só este arquivo.
type package.json | findstr version
git log --oneline -3
git tag --points-at HEAD
git status --short

# 3. Produção com a mesma versão.
curl.exe -s https://ti-wap-inventory-control.vercel.app/api/saude

# 4. As credenciais que a fase usa existem. Imprime só os NOMES, nunca o valor.
Select-String -Path .env.local -Pattern '^(SMOKE_SUPABASE_URL|SMOKE_SUPABASE_ANON_KEY|SMOKE_EMAIL|SMOKE_SENHA|SEED_PROJECT_REF)=' |
  ForEach-Object { ($_.Line -split '=')[0] }

# 5. O smoke de produção passa HOJE (só leitura).
node scripts/smoke/smoke-prod.mjs

# 6. gh autenticado e versão do Claude Code (o modo auto exige 2.1.83+).
& "C:\Program Files\GitHub CLI\gh.exe" auth status
claude --version
```

**O canal SQL — é ele que decide se a medição acontece.** EXPLAIN não passa pela conta do smoke. O prompt tenta, nesta
ordem:

1. **O MCP da Supabase.** Depois de abrir o `claude`, rode `/mcp` e confira que o servidor da Supabase aparece
   **conectado e autenticado**, com acesso aos projetos de produção e de ensaio. Nas F48, F49 e F53 ele não estava; nas
   F50 e F56, estava.
2. **Um token de sessão, com validade curta** — se o MCP não estiver lá. Em supabase.com/dashboard/account/tokens, gere
   um token novo com a menor validade que o painel oferecer (isso adianta a pendência de girar o token, do
   `INVENTARIO-CREDENCIAIS.md` §5) e ponha-o só nesta janela do PowerShell, sem eco e sem histórico:

   ```powershell
   $s = Read-Host "SUPABASE_ACCESS_TOKEN" -AsSecureString
   $env:SUPABASE_ACCESS_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
     [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
   Remove-Variable s
   ```

   Abra o `claude` nessa mesma janela e feche-a no fim da run. O prompt proíbe o agente de ler o cofre do Windows, de
   pedir o token e de imprimi-lo.

Sem nenhum dos dois, a fase fecha mesmo assim — doutrina, travas e documentos entregues, a medição **pendente**, e o
comando exato no topo do relatório.

**Mais três coisas que só você confere antes de colar:**

1. **O ensaio (`sgmvldiizsrjbxzzpmhh`) está ATIVO** no painel da Supabase — o plano Free pausa projeto parado, e a fase
   calibra e mede nele primeiro.
2. **A cota de Actions**, em github.com/settings/billing. As asserções novas do catálogo e as mutações novas precisam de
   ao menos um ciclo do `banco-sem-docker`, e a fase abre dois PRs.
3. **Dentro do Claude Code:** `/permissions` (nada negando `git push`, `gh` ou `node`) e `/memory` (o `CLAUDE.md` do
   projeto listado).

**MCP:** o **Context7** ajuda de verdade aqui — a página de desempenho de RLS da Supabase (a regra "o `(select …)` só
iça o que não depende da linha" mora lá) e a documentação da Management API. O da Supabase é o canal 1 da medição.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f59
# cole o bloco do prompt inteiro e deixe rodando
```

Modo `auto` é o certo: a fase roda testes, build, scripts que leem produção por SQL, `gh pr create`, merge, tag e push —
nada disso cabe numa allowlist estreita, e `bypassPermissions` numa máquina com credencial de produção no `.env.local` e,
talvez, um token de conta na sessão está fora de questão.

**Onde o classificador pode barrar:** o SQL contra produção, mesmo só leitura. A F53 e a F56 rodaram SQL em produção pelo
agente, então é provável que passe; se não passar, o prompt manda **não reformular** — o merge acontece, e o comando da
medição vai para o topo do relatório.

**`--worktree` NÃO serve:** o `medir.mjs` e o smoke precisam do `.env.local`, que não vai para a worktree, e o prompt
proíbe copiá-lo. Rode no diretório principal e não mexa no repositório enquanto a run durar.

Se a cota semanal estiver apertada: `$env:CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` antes do `claude`. Na F59, economize
na exploração; a revisão adversarial das travas é onde o modelo forte rende.

Se preferir de madrugada, headless (o prompt vai por stdin, porque o bloco passa do limite de linha de comando do
Windows; o token, se for o canal, precisa estar na MESMA janela):

```powershell
# salve só o bloco do prompt em prompt-f59.txt (fora do repositório)
$utf8 = New-Object System.Text.UTF8Encoding $false   # UTF-8 SEM BOM: o BOM entraria antes do "ultracode"
$OutputEncoding = $utf8; [Console]::OutputEncoding = $utf8
Get-Content ..\prompt-f59.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-f59.json
# guarde o session_id do JSON: sessão -p só se retoma por ele (claude --resume <session_id>)
```

Em headless, um MCP que depende de login interativo pode não subir — prefira o token de sessão; e bloqueio repetido do
classificador **aborta** a sessão. De madrugada, desligue a suspensão do Windows (plano de energia) antes.

Recomendado para desatendido — a condição de parada como avaliador separado. Digite o `/goal` logo depois de colar o
prompt, na mesma sessão (no headless por stdin ele não se aplica):

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit limpos; src/lib/validators/policies-initplan.test.ts existe e passa; supabase/tests/catalogo_policies.sql tem as assercoes da doutrina com a lista de excecoes por ocorrencia, e scripts/db/mutacoes.mjs tem mutacoes novas para elas; docs/MATRIZ-REGRAS.md tem a emenda F59; scripts/perf/medir-rls.mjs existe e docs/perf/f59-rls-ensaio.json foi gerado, ou o docs/RELATORIO-F59.md marca a medicao como pendente (sem canal SQL, leitura barrada ou ensaio pausado); nenhum arquivo em supabase/migrations nem src/lib/types/database.ts foi tocado; package.json em 1.64.0; e UM destes desfechos: (a) o PR da fase e o PR de documentacao estao mergeados com verificar e banco-sem-docker verdes, a conferencia pos-deploy passou e a tag v1.64.0 foi publicada; (b) os dois PRs estao mergeados e so o push da tag foi barrado, com o comando no topo do docs/RELATORIO-F59.md; ou (c) um bloqueio real (cota ou falha de CI, classificador) deixou um PR aberto, sem tag, com o bloqueio e o comando no topo do docs/RELATORIO-F59.md
```

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Quatro momentos para acompanhar:

1. **O censo antes da régua.** `docs/PLAN-F59.md` com as policies (61, ou o número medido), as ocorrências e a
   concordância replay × catálogo, antes do primeiro commit em `src/`, `scripts/` ou `supabase/tests/`.
2. **O primeiro run do `banco-sem-docker` com o par.** As asserções novas verdes **e** as mutações novas acusadas pelo
   rótulo. Asserção nova sem mutação acusada é documento, não trava.
3. **A evidência do ensaio** (`docs/perf/f59-rls-ensaio.json`). Só números e nomes de nó — F1 com `Filter` por linha, F2
   com `SubPlan`, F3 com `InitPlan`. Um id, e-mail ou nome ali é dado real entrando no repositório: interrompa a sessão.
4. **A rodada de produção.** O canal declarado na evidência. Se o agente registrar a medição como pendente por falta de
   canal, é o desfecho previsto, não uma falha.

### Ao voltar

1. **Execute o roteiro que está no topo do relatório.**
2. Leia a **emenda F59** da `docs/MATRIZ-REGRAS.md` e a **lista de exceções** do `supabase/tests/catalogo_policies.sql`,
   ocorrência por ocorrência, com o destino de cada uma. A F62, a F66 e a F67 herdam as duas — se algo parecer errado, é
   agora que custa barato.
3. Isto deve vir **vazio**:
   `git diff v1.63.0 v1.64.0 -- supabase/migrations supabase/migrations.lock.json src/lib/types/database.ts src/app src/components CLAUDE.md`
   (com o PR ainda aberto, sem tag: `git diff main...origin/f59-doutrina-do-predicado --` com os mesmos caminhos).
4. Abra os `docs/perf/f59-rls-*.json`: números por forma, tabela e identidade; nenhum id em lugar nenhum.
5. Rode você mesmo `npm run test` uma vez.
6. Veio errado de forma ampla? **Regra dos 2 strikes:** depois de duas correções falhas, peça um prompt novo com o
   aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **A F58 está fechada e no ar**: `1.63.0`, tag `v1.63.0` no merge do PR #49 (`62c708d`), árvore limpa, `/api/saude`
   respondendo `1.63.0` — medido em 16/09. Por isso a versão da fase é **`1.64.0`**.
2. **Nenhuma migration e nenhuma policy reescrita** — nem o falso içamento de "termos leitura operador", que hoje custa
   pouco (88 objetos no bucket na medição da F50) e fica como exceção com destino na F67, a fase que reescreve as
   policies de Storage. Consertá-lo agora seria a "reescrita por valor pedagógico" que o §8, item 8, recusa.
3. **Exceções por ocorrência** (`tabela / policy / função`), com a fonte única no `catalogo_policies.sql` e catraca nos
   dois sentidos — é como leio a "catraca que só encolhe" da ficha. Por nome de função, a lista não encolheria nunca.
4. **A trava vai além da ficha em duas regras que nascem verdes**: função sem argumento só dentro de `(select …)` (as 62
   de hoje já estão) e nenhum sub-select que leia tabela ou olhe a linha (zero hoje; sub-select sobre função de conjunto
   passa). As duas protegem as formas que a F66 pode escrever sem perceber.
5. **"Produção, só leitura" cobre o catálogo das policies e o EXPLAIN do `medir-rls.mjs`**, além do `medir.mjs` antes do
   merge e do smoke depois — e **nada é gravado nem no ensaio**: a medição lá usa o seed como está.
6. **Sem canal SQL, o merge acontece**: a medição é prova da doutrina e ponto de partida, não gate de segurança, porque a
   fase não muda nada em produção. Diferente da F58, em que a prova de produção segurava o merge.
7. **A identidade da medição é escolhida dentro do banco**, por consulta, sem id atravessando o canal; o caminho de
   operador (`operador_filiais`) é medido só no ensaio, com persona fictícia.
8. **A linha de base da F66 é o instrumento, não o número**: a F60 e a F62 mudam o que ele mede. A F59 registra os
   números e o TTFB de produção, e deixa escrito que a F66 re-mede.
9. **Documentos**: cabeçalho de status nos dois documentos do produto (a decisão 1 do §1 manda); nota de emenda no
   ADR-002; migrations, atas e relatórios só apontados; `CLAUDE.md` intocado — o cabeçalho da spec já resolve a questão
   de autoridade.
10. **Dois PRs**, como na F56 e na F58: o da fase e o só de documentação com a evidência pós-deploy, que leva a tag.
11. **A R-ACC-51 não é revogada**: a doutrina escreve a fronteira entre guarda no-op e recorte de leitura.
12. **A forma-alvo da ficha é corrigida, não copiada** (fato 21): o tipo `uuid[]` com `= any (array (select …))` quebra
    no conjunto vazio. A emenda escolhe a combinação que não quebra — provada no ensaio — e a F62 herda essa, não a da
    ficha. O texto do `PLANO-PRODUTO` continua copiado do `SYSTEM-DESIGN-ACERVO:196`, que não fixa o tipo de retorno e é
    correto com `setof`.
