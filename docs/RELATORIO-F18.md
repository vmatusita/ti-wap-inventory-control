# Relatório F18 — Pendência de item faltante por MOVIMENTAÇÃO (ciclo de vida próprio)

**Data:** 24/07/2026 · **Modo:** autônomo (ultracode) · **Migrations:** 0050–0053 · **Dependência nova:** nenhuma.

## O quê e por quê

Até aqui, o checklist da devolução gravava `itens faltantes: mochila, …` como **texto** no campo livre `ativos.pendencia` (trigger `aplicar_movimentacao`). A pendência **grudava no ativo**: viajava para o próximo dono (uma saída a partir de `em_triagem` não a limpava), só morria num `triagem_ok` — que apagava o campo **inteiro**, inclusive trechos alheios como `sem patrimônio físico` — e nunca era encerrada com um desfecho. Como não há cobrança formal na empresa (a mochila de desligamento quase nunca volta), a fila só crescia.

A F18 transforma a pendência de item faltante num **registro próprio, por ITEM** (tabela `pendencias_item`), atrelado à **devolução que o gerou** e ao **colaborador da época**, com ciclo de vida explícito: nasce **aberta** e encerra por **ação manual com desfecho** — "Item recuperado" ou "Baixa — não vai voltar" (observação opcional), individual **ou em lote**. O ativo volta a circular livre; o histórico imutável (`movimentacoes.itens_faltantes`) não muda. **Dados vindos do import não abrem pendência de item** (mesmo racional da migration `0049` para o termo).

## Frente A — banco (proven no ENSAIO `sgmvldiizsrjbxzzpmhh`)

- **0050** — tabela `pendencias_item` (1 linha por item): `ativo_id`, `movimentacao_id` (FK **DEFERRABLE INITIALLY DEFERRED** — o INSERT roda no BEFORE INSERT trigger, a linha da mov ainda não está na heap; `new.id` existe por `gen_random_uuid()`), `item`, `colaborador` (da época), `filial_id`, `status` aberta/resolvida (TEXT+CHECK), `desfecho` (recuperado/baixa), `observacao`, `resolvida_em/por`, `created_at`, CHECK do ciclo. RLS: SELECT+UPDATE só `authenticated` (sem INSERT/DELETE direto — nascem/morrem pelo trigger SECURITY DEFINER). Índices: abertas por filial (parcial), por ativo, por movimentação.
- **0051** — recria `aplicar_movimentacao` (`create or replace` PURO; base = versão VIGENTE, byte-idêntica em prod e ensaio, herdando 0047). **DIFF = exatamente 3 pontos** (+ 1 emenda da revisão): estorno **DELETA** as linhas da mov estornada e, ao restaurar `ativos.pendencia` pelo snapshot, **não ressuscita** o trecho `itens faltantes` (só os demais — §A2 "para os outros trechos"); o UPDATE principal deixa de escrever `pendencia` (devolucao/triagem_ok não tocam mais o campo — corrige o apagão); devolucao com itens **INSERE** 1 aberta por item, colaborador `= coalesce(nullif(new.colaborador,''), v_ativo.colaborador_atual)`.
- **0052** — `v_pendencias_item` (abertas+resolvidas, joins; ficha) e `v_fila_pendencias` (`v_pendencias` não-item ∪ `v_pendencias_item` aberto; fonte única da fila/badge/chips/dashboard). Ambas `security_invoker`. `ordem` = desempate ÚNICO por linha (ativo_id nos não-item; pendencia_item_id nos item). `v_pendencias` **não muda**.
- **0053** — backfill idempotente: SISTEMA (devolução real não-import) → abertas do array; IMPORT/ÓRFÃO → dispensa; remove só o trecho `itens faltantes…` preservando os demais (separador `;`; a lista de itens tem vírgula interna).

### Evidências coladas (ENSAIO)

**Trigger (smoke `begin;…rollback;`):** devolução com 2 itens → 2 abertas com colaborador da época; `ativos.pendencia` intacto; `triagem_ok` preserva um `sem patrimônio físico` plantado e não mexe nas abertas; estorno da devolução remove as linhas. `pg_get_functiondef`: zero `'itens faltantes:'` no corpo, `delete/insert into pendencias_item` presentes, `'triagem_ok' then null` ausente.

**Roteiro novo `supabase/tests/pendencias_item.sql` — 8 cenários, todos ✓ no ENSAIO** (temp-table que devolve linhas, pois o MCP engole NOTICE/WARNING): 2 itens→2 abertas · colaborador da época · itens do array · pendencia intacta · sem item = 0 · triagem preserva trecho + não mexe nas abertas · saída p/ novo dono mantém a pessoa antiga · estorno remove · resolução grava desfecho/quem/quando · import não abre · **estorno não ressuscita 'itens faltantes' (mixto → só o outro trecho; só-itens com vírgula → null)**.

**Backfill (ENSAIO, antes→depois):** 18 ativos com o texto (18 SISTEMA, 0 dispensa-import, 0 órfão) → **21 abertas** criadas; `ativos` com `%itens faltantes%`: **18 → 0**; `v_pendencias` total **124 → 106**, termo **3→3**, triagem **15→15**, patrimonio **88→88** (buckets não-item IDÊNTICOS), itens **18→0**; `v_fila_pendencias` = 127 (106 + 21). Idempotência: re-rodar insere **0**.

**Aceite A:** ✓ tabela+RLS+tipos regenerados via MCP (aplicados cirurgicamente no `database.ts`); ✓ trigger vigente recriado (diff mínimo + emenda §A2); ✓ backfill provado com contagens; ✓ roteiros — CI `banco` é a prova final ✗-free no push.

## Frente B — app

Fila `/pendencias` lê a fonte única `v_fila_pendencias` (mesma máquina de range/416/blocos/CSV, `.order('ordem')`); tabela virou Client Component com **checkbox + seleção + barra de lote** (o item mostra o nome do acessório; a linha de termo mantém "Confirmar assinatura"); Server Action `resolverPendenciaItem` (1..N ids, Zod, só `aberta`, grava `resolvida_por` da sessão, revalida fila/ficha/relatórios); ficha do ativo ganhou o bloco **Itens faltantes da devolução** (abertas em destaque + resolvidas como auditoria); selo da sidebar, chips do relatório/§5, **card do dashboard home** e geração de snapshot passam a contar o modelo novo. `ROTULO_TIPO_PENDENCIA`+cores extraídos para `src/lib/pendencias/rotulos.ts` (client-safe).

### Evidência — fluxo E2E (query-level no ENSAIO, o caminho que a UI lê)

devolução com mochila marcada → **pendência aberta com o colaborador da época** → `triagem_ok` (item segue na fila) → **saída do mesmo ativo para OUTRA pessoa → a pendência continua apontando a pessoa antiga (Fulano, não Sicrano); nenhuma "dívida" para o novo dono** → resolver → **sai da fila/badge/chips (127→127, ativo importado isolado sem pendência residual)** e **permanece na ficha como resolvida** (`v_pendencias_item` status=resolvida, desfecho=baixa). Todos os passos ✓.

**Aceite B:** ✓ E2E acima; ✓ resolução individual E em lote; ✓ CSV = tela (o export lê a mesma `queryPendencias`→`v_fila_pendencias`); ✓ `lint`+`build`+`test` verdes, **1018 testes** (+8 sobre a base de 1010).

## Frente C — documentação viva

`src/lib/ajuda/conteudo.ts` — verbete "Itens faltantes" reescrito (colaborador da época, encerramento manual com desfecho, lote, import dispensa, `triagem_ok` não apaga) + passo "Resolver uma pendência de item faltante"; `docs/ESPECIFICACAO.md` — emenda F18 na regra 3 do §8 e no §5 (Nomenclatura). **59 testes da ajuda verdes.**

## §V.4 — Revisão adversarial (5 lentes, refutação por padrão, contexto fresco)

Trigger/migrations, backfill, RLS/viewer, UI, regressão. **2 achados reais** (o resto refutado):
1. **(baixo) estorno ressuscitava 'itens faltantes'** do snapshot legado → **corrigido** (strip no restore, §A2) + roteiro cenário 8/8b + re-verificado no ENSAIO.
2. **(médio) card do dashboard home lia `v_pendencias`** (não `v_fila`) → item sumia da prévia e divergia do selo → **corrigido** (lê `v_fila_pendencias`, key por `ordem`) + build verde.
Re-revisão focada dos 2 fixes. Segurança: `get_advisors(security)` no ENSAIO só acusa o WARN `rls_policy_always_true` da UPDATE de `pendencias_item` — **idêntico a toda tabela de operador** (doutrina de nível único `authenticated USING true`); as views novas **não** aparecem como `security_definer_view` (confirma `security_invoker`).

## §R — Rollout produção (24/07/2026)

Migrations **0050–0053 aplicadas por MCP** em produção (`pbtjcalbmepmrqzprusb`), registradas no ledger — o `delete from public.pendencias_item` da 0051 **não bate no gate** (não é `ativos`/`movimentacoes`). **Backup** dos ativos afetados em `public._f18_backup_pendencia` (RLS on, sem policy, 2 linhas) ANTES do backfill.

**Smoke antes→depois (colado):**

| métrica | antes | depois |
|---|---|---|
| `ativos` com `%itens faltantes%` | 2 | **0** |
| `pendencias_item` abertas | — | **3** (colaborador nunca nulo) |
| `v_pendencias` total | 60 | **58** |
| termo / triagem / patrimônio | 2 / 0 / 56 | **2 / 0 / 56** (idênticos) |
| `v_pendencias` itens | 2 | **0** |
| `v_fila_pendencias` total / itens | — | **61 / 3** |

`notify pgrst, 'reload schema'` executado. **Deploy Vercel READY** (`dpl_13hdHaw78EtaCtLPvzFNNSXcWYAe`, commit `134cb00`, target production); `get_runtime_errors` (última hora): **nenhum**. Smoke leve de produção (`ti-wap-inventory-control.vercel.app`): `/login` renderiza (WAP · Estoque TI · Entrar); `/pendencias` redireciona ao login (auth-gated, sem 500); console sem erro. **CI VERDE** (run **30106994348**, ambos os jobs `completed/success`): `banco` aplicou `0001→0053` num Postgres novo e rodou TODOS os roteiros SQL — o `pendencias_item.sql` (8 cenários) e o `maquina_estados.sql` CENARIO 5 atualizado — **sem nenhum ✗**; `verificar` = lint/test(1018)/build.

**Limite §R.5:** o smoke LOGADO de `/pendencias` (as contagens na tela) não roda — a UI é auth-gated e o agente não digita senha; as contagens foram provadas no banco (acima) e a fila lê exatamente `v_fila_pendencias`.

## O que este relatório NÃO prova

- **Sem E2E visual autenticado.** O login/senha não é digitado pelo agente e o bypass de autenticação é corretamente barrado; a UI foi provada por `lint`/`test`(1018)/`build` verdes + o E2E **no nível de dados** (as views/queries que a tela lê), não por cliques na tela logada. A resolução em lote, o mobile 375px e o dark mode foram revisados por leitura de código (lente UI, sem achado), não exercitados no navegador.
- **Roteiros SQL:** provados no ENSAIO via MCP (SELECT que devolve linhas). A prova ✗-free canônica é o job `banco` do CI num Postgres que aplica `0001→0053` — ver o run do push.
- **Backfill em produção:** os números do ENSAIO (18→21) diferem de PROD (2→3) porque o ENSAIO tem mais devoluções com itens no snapshot; a proporção SISTEMA/dispensa (100%/0) é a mesma. O efeito em PROD é o medido no §R.
